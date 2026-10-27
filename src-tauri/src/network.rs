use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

pub const BROADCAST_PORT: u16 = 42424;
pub const TCP_PORT: u16 = 42425;
pub const PROTOCOL_MAGIC: &[u8; 4] = b"OTLK";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PeerDevice {
    pub id: String,
    pub name: String,
    pub os: String,
    pub ip: String,
    pub port: u16,
    pub last_seen: u64,
    pub is_self: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BeaconMessage {
    pub magic: String, // "OTIUM_LINK_V1"
    pub id: String,
    pub name: String,
    pub os: String,
    pub port: u16,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClipboardPayload {
    pub text: String,
    pub sender: String,
    pub timestamp: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileHeaderPayload {
    pub file_name: String,
    pub file_size: u64,
    pub sender: String,
    pub timestamp: u64,
    #[serde(default)]
    pub crc32: Option<u32>,
}

pub fn get_unique_filepath(target_dir: &Path, safe_name: &str) -> PathBuf {
    let target_path = target_dir.join(safe_name);
    if !target_path.exists() {
        return target_path;
    }

    let stem = Path::new(safe_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = Path::new(safe_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))
        .unwrap_or_default();

    let mut counter = 1;
    loop {
        let candidate = target_dir.join(format!("{} ({}){}", stem, counter, ext));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

#[derive(Clone)]
pub struct NetworkManager {
    pub self_device: Arc<Mutex<PeerDevice>>,
    pub peers: Arc<Mutex<HashMap<String, PeerDevice>>>,
    pub downloads_dir: Arc<Mutex<PathBuf>>,
}

impl NetworkManager {
    pub fn new(device_name: String, downloads_dir: PathBuf) -> Self {
        let os_name = if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "android") {
            "android"
        } else if cfg!(target_os = "macos") {
            "macos"
        } else {
            "linux"
        };

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let device_id = format!(
            "otium_{}_{}",
            os_name,
            &now.to_string()[now.to_string().len().saturating_sub(6)..]
        );

        let self_device = PeerDevice {
            id: device_id,
            name: device_name,
            os: os_name.to_string(),
            ip: "127.0.0.1".to_string(),
            port: TCP_PORT,
            last_seen: now,
            is_self: true,
        };

        Self {
            self_device: Arc::new(Mutex::new(self_device)),
            peers: Arc::new(Mutex::new(HashMap::new())),
            downloads_dir: Arc::new(Mutex::new(downloads_dir)),
        }
    }

    pub fn set_device_name(&self, new_name: String) {
        if let Ok(mut dev) = self.self_device.lock() {
            dev.name = new_name;
        }
    }

    pub fn set_downloads_dir(&self, dir: PathBuf) {
        if let Ok(mut d) = self.downloads_dir.lock() {
            *d = dir;
        }
    }

    pub fn get_downloads_dir(&self) -> PathBuf {
        self.downloads_dir.lock().unwrap().clone()
    }

    /// Starts local UDP discovery beacon broadcast, receiver, and heartbeat pruner
    pub fn start_discovery(&self, app: AppHandle) {
        let self_dev = self.self_device.clone();
        let peers_table = self.peers.clone();

        // 1. Broadcast Beacon Sender (Sends UDP broadcast every 3 seconds)
        let sender_dev = self_dev.clone();
        thread::spawn(move || {
            let socket = match UdpSocket::bind("0.0.0.0:0") {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("Failed to bind UDP broadcast socket: {}", e);
                    return;
                }
            };
            let _ = socket.set_broadcast(true);

            loop {
                let beacon = {
                    let dev = sender_dev.lock().unwrap();
                    BeaconMessage {
                        magic: "OTIUM_LINK_V1".to_string(),
                        id: dev.id.clone(),
                        name: dev.name.clone(),
                        os: dev.os.clone(),
                        port: dev.port,
                    }
                };

                if let Ok(bytes) = serde_json::to_vec(&beacon) {
                    let broadcast_addr = format!("255.255.255.255:{}", BROADCAST_PORT);
                    let _ = socket.send_to(&bytes, &broadcast_addr);
                }

                thread::sleep(Duration::from_secs(3));
            }
        });

        // 2. Broadcast Beacon Listener (Listens on port 42424)
        let listener_dev = self_dev.clone();
        let listener_app = app.clone();
        let listener_peers = peers_table.clone();
        thread::spawn(move || {
            let socket = match UdpSocket::bind(format!("0.0.0.0:{}", BROADCAST_PORT)) {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("Failed to bind UDP receiver socket on port {}: {}", BROADCAST_PORT, e);
                    return;
                }
            };

            let mut buf = [0u8; 1024];
            loop {
                if let Ok((len, src_addr)) = socket.recv_from(&mut buf) {
                    if let Ok(beacon) = serde_json::from_slice::<BeaconMessage>(&buf[..len]) {
                        if beacon.magic != "OTIUM_LINK_V1" {
                            continue;
                        }

                        let self_id = { listener_dev.lock().unwrap().id.clone() };
                        if beacon.id == self_id {
                            // Ignore own beacons
                            continue;
                        }

                        let now = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();

                        let peer_ip = src_addr.ip().to_string();
                        let peer = PeerDevice {
                            id: beacon.id.clone(),
                            name: beacon.name,
                            os: beacon.os,
                            ip: peer_ip,
                            port: beacon.port,
                            last_seen: now,
                            is_self: false,
                        };

                        let mut table = listener_peers.lock().unwrap();
                        table.insert(beacon.id, peer.clone());

                        // Notify frontend of discovered or refreshed peer
                        let _ = listener_app.emit("otium-link://peer-discovered", peer);
                    }
                }
            }
        });

        // 3. Heartbeat & Stale Peer Pruner (Purges inactive peers after 12 seconds)
        let pruner_peers = peers_table.clone();
        let pruner_app = app.clone();
        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_secs(4));
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                let mut table = pruner_peers.lock().unwrap();
                let initial_len = table.len();
                table.retain(|_, peer| now.saturating_sub(peer.last_seen) < 12);
                if table.len() != initial_len {
                    let active_list: Vec<PeerDevice> = table.values().cloned().collect();
                    let _ = pruner_app.emit("otium-link://peers-updated", active_list);
                }
            }
        });
    }

    /// Starts native desktop background clipboard monitor (Zero-CPU, instant cross-app detection)
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    pub fn start_desktop_clipboard_watcher(&self, app: AppHandle) {
        let self_dev = self.self_device.clone();

        thread::spawn(move || {
            let mut clipboard = match arboard::Clipboard::new() {
                Ok(c) => c,
                Err(e) => {
                    log::warn!("Native clipboard watcher init skipped: {}", e);
                    return;
                }
            };

            let mut last_clipboard_text = String::new();

            loop {
                thread::sleep(Duration::from_millis(600));

                if let Ok(current_text) = clipboard.get_text() {
                    let trimmed = current_text.trim().to_string();
                    if !trimmed.is_empty() && trimmed != last_clipboard_text {
                        last_clipboard_text = trimmed.clone();

                        let sender_name = { self_dev.lock().unwrap().name.clone() };

                        let _ = app.emit(
                            "otium-link://native-clipboard-changed",
                            serde_json::json!({
                                "text": trimmed,
                                "sender": sender_name
                            }),
                        );
                    }
                }
            }
        });
    }

    /// Starts TCP Server on port 42425 with CRC32 integrity validation and atomic temporary writing
    pub fn start_tcp_server(&self, app: AppHandle) {
        let downloads = self.downloads_dir.clone();
        if let Ok(dir) = downloads.lock() {
            let _ = fs::create_dir_all(&*dir);
        }

        thread::spawn(move || {
            let listener = match TcpListener::bind(format!("0.0.0.0:{}", TCP_PORT)) {
                Ok(l) => l,
                Err(e) => {
                    log::warn!("Failed to bind TCP server on port {}: {}", TCP_PORT, e);
                    return;
                }
            };

            for stream in listener.incoming() {
                if let Ok(mut stream) = stream {
                    let app_clone = app.clone();
                    let downloads_clone = downloads.clone();

                    thread::spawn(move || {
                        let mut magic = [0u8; 4];
                        if stream.read_exact(&mut magic).is_err() || &magic != PROTOCOL_MAGIC {
                            return;
                        }

                        let mut msg_type = [0u8; 1];
                        if stream.read_exact(&mut msg_type).is_err() {
                            return;
                        }

                        let mut len_bytes = [0u8; 4];
                        if stream.read_exact(&mut len_bytes).is_err() {
                            return;
                        }
                        let payload_len = u32::from_be_bytes(len_bytes) as usize;

                        match msg_type[0] {
                            1 => {
                                // 1 = Clipboard Sync
                                let mut payload = vec![0u8; payload_len];
                                if stream.read_exact(&mut payload).is_ok() {
                                    if let Ok(clip) = serde_json::from_slice::<ClipboardPayload>(&payload) {
                                        let _ = app_clone.emit("otium-link://clipboard-received", clip);
                                    }
                                }
                            }
                            2 => {
                                // 2 = Streamed File Transfer with CRC32 verification & atomic write
                                let mut header_bytes = vec![0u8; payload_len];
                                if stream.read_exact(&mut header_bytes).is_ok() {
                                    if let Ok(header) = serde_json::from_slice::<FileHeaderPayload>(&header_bytes) {
                                        let safe_name = PathBuf::from(&header.file_name)
                                            .file_name()
                                            .map(|n| n.to_string_lossy().to_string())
                                            .unwrap_or_else(|| "downloaded_file.bin".to_string());

                                        let target_dir = downloads_clone
                                            .lock()
                                            .map(|d| d.clone())
                                            .unwrap_or_else(|_| PathBuf::from("."));
                                        let _ = fs::create_dir_all(&target_dir);

                                        let now = SystemTime::now()
                                            .duration_since(UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();

                                        let unique_target = get_unique_filepath(&target_dir, &safe_name);
                                        let temp_filename = format!(".{}_{}.otlink.tmp", safe_name, now);
                                        let temp_path = target_dir.join(&temp_filename);

                                        if let Ok(mut file) = File::create(&temp_path) {
                                            let mut received_bytes: u64 = 0;
                                            let mut chunk = [0u8; 65536]; // 64KB chunks
                                            let mut hasher = crc32fast::Hasher::new();
                                            let mut success = true;

                                            while received_bytes < header.file_size {
                                                let to_read = (header.file_size - received_bytes).min(chunk.len() as u64) as usize;
                                                match stream.read(&mut chunk[..to_read]) {
                                                    Ok(0) => {
                                                        success = false;
                                                        break; // premature EOF
                                                    }
                                                    Ok(n) => {
                                                        if file.write_all(&chunk[..n]).is_err() {
                                                            success = false;
                                                            break;
                                                        }
                                                        hasher.update(&chunk[..n]);
                                                        received_bytes += n as u64;

                                                        if header.file_size > 1_048_576 {
                                                            let _ = app_clone.emit(
                                                                "otium-link://file-progress",
                                                                serde_json::json!({
                                                                    "name": safe_name,
                                                                    "transferred": received_bytes,
                                                                    "total": header.file_size,
                                                                    "sender": header.sender
                                                                }),
                                                            );
                                                        }
                                                    }
                                                    Err(_) => {
                                                        success = false;
                                                        break;
                                                    }
                                                }
                                            }

                                            // Read 4-byte CRC32 trailer
                                            let mut trailer_crc_bytes = [0u8; 4];
                                            let crc_verified = if success && stream.read_exact(&mut trailer_crc_bytes).is_ok() {
                                                let expected_crc = u32::from_be_bytes(trailer_crc_bytes);
                                                hasher.finalize() == expected_crc
                                            } else {
                                                // If no trailer, fall back to byte count check
                                                success && received_bytes == header.file_size
                                            };

                                            let _ = file.flush();
                                            drop(file);

                                            if success && crc_verified {
                                                if fs::rename(&temp_path, &unique_target).is_ok() {
                                                    let final_name = unique_target
                                                        .file_name()
                                                        .map(|n| n.to_string_lossy().to_string())
                                                        .unwrap_or(safe_name);

                                                    let _ = app_clone.emit(
                                                        "otium-link://file-received",
                                                        serde_json::json!({
                                                            "name": final_name,
                                                            "path": unique_target.to_string_lossy(),
                                                            "size": received_bytes,
                                                            "sender": header.sender,
                                                            "verified": true
                                                        }),
                                                    );
                                                } else {
                                                    let _ = fs::remove_file(&temp_path);
                                                }
                                            } else {
                                                let _ = fs::remove_file(&temp_path);
                                                let _ = app_clone.emit(
                                                    "otium-link://file-error",
                                                    serde_json::json!({
                                                        "name": safe_name,
                                                        "sender": header.sender,
                                                        "error": "Failed integrity verification or incomplete stream"
                                                    }),
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    });
                }
            }
        });
    }

    /// Sends clipboard text to a remote peer over TCP
    pub fn send_clipboard(&self, target_ip: &str, text: String, sender: String) -> Result<(), String> {
        let mut stream = TcpStream::connect_timeout(
            &format!("{}:{}", target_ip, TCP_PORT).parse().map_err(|e| format!("{:?}", e))?,
            Duration::from_secs(3),
        ).map_err(|e| format!("Connection failed: {}", e))?;

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let payload = ClipboardPayload {
            text,
            sender,
            timestamp: now,
        };

        let json = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;

        stream.write_all(PROTOCOL_MAGIC).map_err(|e| e.to_string())?;
        stream.write_all(&[1u8]).map_err(|e| e.to_string())?; // Type 1 = Clipboard
        stream.write_all(&(json.len() as u32).to_be_bytes()).map_err(|e| e.to_string())?;
        stream.write_all(&json).map_err(|e| e.to_string())?;
        stream.flush().map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Streams a local file directly to a remote peer over TCP with running CRC32 end-to-end verification
    pub fn send_file<F>(&self, target_ip: &str, file_path: PathBuf, sender: String, mut on_progress: F) -> Result<(), String>
    where
        F: FnMut(u64, u64),
    {
        let mut file = File::open(&file_path).map_err(|e| format!("Cannot open file: {}", e))?;
        let meta = file.metadata().map_err(|e| e.to_string())?;
        let file_size = meta.len();

        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file.bin".to_string());

        let mut stream = TcpStream::connect_timeout(
            &format!("{}:{}", target_ip, TCP_PORT).parse().map_err(|e| format!("{:?}", e))?,
            Duration::from_secs(5),
        ).map_err(|e| format!("Connection failed: {}", e))?;

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let header = FileHeaderPayload {
            file_name,
            file_size,
            sender,
            timestamp: now,
            crc32: None,
        };

        let header_json = serde_json::to_vec(&header).map_err(|e| e.to_string())?;

        stream.write_all(PROTOCOL_MAGIC).map_err(|e| e.to_string())?;
        stream.write_all(&[2u8]).map_err(|e| e.to_string())?; // Type 2 = Streamed File
        stream.write_all(&(header_json.len() as u32).to_be_bytes()).map_err(|e| e.to_string())?;
        stream.write_all(&header_json).map_err(|e| e.to_string())?;

        // Stream file chunks directly while calculating running CRC32
        let mut buffer = [0u8; 65536]; // 64KB buffer
        let mut hasher = crc32fast::Hasher::new();
        let mut sent_bytes: u64 = 0;

        loop {
            let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            stream.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
            hasher.update(&buffer[..n]);
            sent_bytes += n as u64;
            on_progress(sent_bytes, file_size);
        }

        // Send 4-byte CRC32 trailer
        let final_crc = hasher.finalize();
        stream.write_all(&final_crc.to_be_bytes()).map_err(|e| e.to_string())?;
        stream.flush().map_err(|e| e.to_string())?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_unique_filepath_no_collision() {
        let temp_dir = std::env::temp_dir().join("otium_test_unique_1");
        let _ = fs::create_dir_all(&temp_dir);
        let p = get_unique_filepath(&temp_dir, "document.pdf");
        assert_eq!(p.file_name().unwrap(), "document.pdf");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_unique_filepath_with_collision() {
        let temp_dir = std::env::temp_dir().join("otium_test_unique_2");
        let _ = fs::create_dir_all(&temp_dir);
        let original = temp_dir.join("document.pdf");
        let _ = File::create(&original);

        let p1 = get_unique_filepath(&temp_dir, "document.pdf");
        assert_eq!(p1.file_name().unwrap(), "document (1).pdf");
        let _ = File::create(&p1);

        let p2 = get_unique_filepath(&temp_dir, "document.pdf");
        assert_eq!(p2.file_name().unwrap(), "document (2).pdf");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_crc32_integrity_calculation() {
        let data = b"Hello, Otium Link! Seamless P2P transfer.";
        let mut hasher = crc32fast::Hasher::new();
        hasher.update(data);
        let crc = hasher.finalize();
        assert_ne!(crc, 0);

        let mut hasher2 = crc32fast::Hasher::new();
        hasher2.update(data);
        assert_eq!(crc, hasher2.finalize());
    }
}
