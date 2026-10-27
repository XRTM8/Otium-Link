use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::PathBuf;
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

    /// Starts local UDP discovery beacon broadcast and receiver
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

                        let mut table = peers_table.lock().unwrap();
                        table.insert(beacon.id, peer.clone());

                        // Notify frontend of discovered or refreshed peer
                        let _ = listener_app.emit("otium-link://peer-discovered", peer);
                    }
                }
            }
        });
    }

    /// Starts TCP Server on port 42425 to receive clipboard syncs and streamed files
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
                                // 2 = Streamed File Transfer
                                let mut header_bytes = vec![0u8; payload_len];
                                if stream.read_exact(&mut header_bytes).is_ok() {
                                    if let Ok(header) = serde_json::from_slice::<FileHeaderPayload>(&header_bytes) {
                                        // Sanitize file name to avoid directory traversal
                                        let safe_name = PathBuf::from(&header.file_name)
                                            .file_name()
                                            .map(|n| n.to_string_lossy().to_string())
                                            .unwrap_or_else(|| "downloaded_file.bin".to_string());

                                        let target_dir = downloads_clone
                                            .lock()
                                            .map(|d| d.clone())
                                            .unwrap_or_else(|_| PathBuf::from("."));
                                        let _ = fs::create_dir_all(&target_dir);
                                        let target_path = target_dir.join(&safe_name);
                                        if let Ok(mut file) = File::create(&target_path) {
                                            let mut received_bytes: u64 = 0;
                                            let mut chunk = [0u8; 65536]; // 64KB chunks
                                            while received_bytes < header.file_size {
                                                let to_read = (header.file_size - received_bytes).min(chunk.len() as u64) as usize;
                                                match stream.read(&mut chunk[..to_read]) {
                                                    Ok(0) => break, // EOF
                                                    Ok(n) => {
                                                        if file.write_all(&chunk[..n]).is_err() {
                                                            break;
                                                        }
                                                        received_bytes += n as u64;
                                                    }
                                                    Err(_) => break,
                                                }
                                            }

                                            let _ = app_clone.emit(
                                                "otium-link://file-received",
                                                serde_json::json!({
                                                    "name": safe_name,
                                                    "path": target_path.to_string_lossy(),
                                                    "size": received_bytes,
                                                    "sender": header.sender,
                                                }),
                                            );
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

    /// Streams a local file directly to a remote peer over TCP (Zero-buffering, direct disk-to-socket)
    pub fn send_file(&self, target_ip: &str, file_path: PathBuf, sender: String) -> Result<(), String> {
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
        };

        let header_json = serde_json::to_vec(&header).map_err(|e| e.to_string())?;

        stream.write_all(PROTOCOL_MAGIC).map_err(|e| e.to_string())?;
        stream.write_all(&[2u8]).map_err(|e| e.to_string())?; // Type 2 = Streamed File
        stream.write_all(&(header_json.len() as u32).to_be_bytes()).map_err(|e| e.to_string())?;
        stream.write_all(&header_json).map_err(|e| e.to_string())?;

        // Stream file chunks directly
        let mut buffer = [0u8; 65536]; // 64KB buffer
        loop {
            let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            stream.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        }
        stream.flush().map_err(|e| e.to_string())?;

        Ok(())
    }
}
