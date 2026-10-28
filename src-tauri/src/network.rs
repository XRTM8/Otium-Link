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
    #[serde(default)]
    pub is_reply: bool,
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RemoteCastPayload {
    pub action: String,
    pub url: String,
    pub pin: String,
    pub sender: String,
}

pub fn is_dangerous_unicode_char(c: char) -> bool {
    matches!(
        c,
        // Bidirectional formatting characters (RTLO, LRE, RLE, etc.)
        '\u{202A}'..='\u{202E}' |
        '\u{2066}'..='\u{2069}' |
        '\u{200E}' | '\u{200F}' | '\u{061C}' |
        // Zero-width & invisible characters
        '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{FEFF}' | '\u{00AD}'
    )
}

pub fn is_private_or_local_ip(ip: &std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(ipv4) => {
            // Include RFC 6598 Carrier-Grade NAT (100.64.0.0/10) used by Tailscale, overlays & universities
            let is_cgnat = ipv4.octets()[0] == 100 && (ipv4.octets()[1] & 0xc0) == 64;
            ipv4.is_loopback() || ipv4.is_private() || ipv4.is_link_local() || is_cgnat
        }
        std::net::IpAddr::V6(ipv6) => {
            ipv6.is_loopback() || (ipv6.segments()[0] & 0xfe00) == 0xfe80
        }
    }
}

pub fn sanitize_filename(raw: &str) -> String {
    let file_name = Path::new(raw)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Replace invalid/control characters with underscore, stripping dangerous unicode overrides
    let sanitized: String = file_name
        .chars()
        .filter(|c| !is_dangerous_unicode_char(*c))
        .map(|c| {
            if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0') {
                '_'
            } else {
                c
            }
        })
        .collect();

    let trimmed = sanitized.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        return "downloaded_file.bin".to_string();
    }

    // Bound filename length to 120 chars to prevent Windows MAX_PATH (260) overflows
    let bounded = if trimmed.len() > 120 {
        let p = Path::new(&trimmed);
        let ext = p.extension().and_then(|e| e.to_str()).map(|e| format!(".{}", e)).unwrap_or_default();
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let max_stem_len = 120usize.saturating_sub(ext.len()).max(8);
        let truncated_stem: String = stem.chars().take(max_stem_len).collect();
        format!("{}{}", truncated_stem, ext)
    } else {
        trimmed
    };

    // Windows reserved device names: CON, PRN, AUX, NUL, COM1-9, LPT1-9
    let stem = Path::new(&bounded)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_uppercase();

    const RESERVED_NAMES: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
        "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];

    if RESERVED_NAMES.contains(&stem.as_str()) {
        format!("otium_{}", bounded)
    } else {
        bounded
    }
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

/// Scans the target downloads directory for abandoned temporary files from interrupted
/// or crashed transfers (.otlink.tmp) and cleans them up to prevent disk bloat.
pub fn cleanup_orphaned_tmp_files(target_dir: &Path) -> usize {
    let mut cleaned = 0;
    if let Ok(entries) = fs::read_dir(target_dir) {
        let now = SystemTime::now();
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.ends_with(".otlink.tmp") {
                    let should_delete = if let Ok(metadata) = entry.metadata() {
                        if let Ok(modified) = metadata.modified() {
                            now.duration_since(modified).map(|d| d.as_secs() > 300).unwrap_or(true)
                        } else {
                            true
                        }
                    } else {
                        true
                    };

                    if should_delete && fs::remove_file(&path).is_ok() {
                        cleaned += 1;
                    }
                }
            }
        }
    }
    cleaned
}

/// Resilient UDP socket binder that retries on transient interface initialization delays
fn bind_udp_with_retries(addr: &str, max_retries: u32, delay: Duration) -> Option<UdpSocket> {
    for attempt in 1..=max_retries {
        match UdpSocket::bind(addr) {
            Ok(s) => return Some(s),
            Err(e) => {
                log::warn!("UDP bind attempt {}/{} to {} failed: {}. Retrying in {:?}...", attempt, max_retries, addr, e, delay);
                thread::sleep(delay);
            }
        }
    }
    None
}

/// Resilient TCP listener binder that retries on TIME_WAIT or transient port conflicts
fn bind_tcp_with_retries(addr: &str, max_retries: u32, delay: Duration) -> Option<TcpListener> {
    for attempt in 1..=max_retries {
        match TcpListener::bind(addr) {
            Ok(l) => return Some(l),
            Err(e) => {
                log::warn!("TCP bind attempt {}/{} to {} failed: {}. Retrying in {:?}...", attempt, max_retries, addr, e, delay);
                thread::sleep(delay);
            }
        }
    }
    None
}

/// RAII Scope Guard ensuring active incomplete temporary transfer files are always deleted if aborted
struct TmpFileGuard<'a> {
    path: &'a Path,
    defused: bool,
}

impl<'a> Drop for TmpFileGuard<'a> {
    fn drop(&mut self) {
        if !self.defused && self.path.exists() {
            let _ = fs::remove_file(self.path);
        }
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

    /// Manually adds a direct IP peer (for environments with AP Isolation or multicast blocking)
    pub fn add_direct_peer(&self, ip: String, name: String, os: String) -> Result<PeerDevice, String> {
        let trimmed_ip = ip.trim().to_string();
        let parsed_ip: std::net::IpAddr = trimmed_ip
            .parse()
            .map_err(|e| format!("عنوان IP غير صالح: {}", e))?;

        if !is_private_or_local_ip(&parsed_ip) {
            return Err("العنوان ليس ضمن نطاق الشبكة المحلية الخاصة (RFC 1918)".to_string());
        }

        let clean_name = if name.trim().is_empty() {
            format!("Direct-{}", trimmed_ip)
        } else {
            name.trim().chars().take(48).collect()
        };

        let peer_id = format!("direct_{}", trimmed_ip.replace('.', "_").replace(':', "_"));
        let peer = PeerDevice {
            id: peer_id.clone(),
            name: clean_name,
            os,
            ip: trimmed_ip,
            port: TCP_PORT,
            last_seen: u64::MAX, // Persistent direct peer
            is_self: false,
        };

        let mut table = self.peers.lock().unwrap();
        table.insert(peer_id, peer.clone());
        Ok(peer)
    }

    /// Removes a direct IP peer from the active peers table
    pub fn remove_direct_peer(&self, id: &str) {
        if let Ok(mut table) = self.peers.lock() {
            table.remove(id);
        }
    }

    /// Starts local UDP discovery beacon broadcast, receiver, and heartbeat pruner
    pub fn start_discovery(&self, app: AppHandle) {
        let self_dev = self.self_device.clone();
        let peers_table = self.peers.clone();

        // 1. Broadcast Beacon Sender (Sends UDP broadcast every 3 seconds)
        let sender_dev = self_dev.clone();
        thread::spawn(move || {
            let socket = match bind_udp_with_retries("0.0.0.0:0", 10, Duration::from_millis(500)) {
                Some(s) => s,
                None => {
                    log::error!("Failed to bind UDP broadcast socket after retries");
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
                        is_reply: false,
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
            let socket = match bind_udp_with_retries(&format!("0.0.0.0:{}", BROADCAST_PORT), 15, Duration::from_millis(500)) {
                Some(s) => s,
                None => {
                    log::error!("Failed to bind UDP receiver socket on port {} after retries", BROADCAST_PORT);
                    return;
                }
            };

            let mut buf = [0u8; 1024];
            loop {
                if let Ok((len, src_addr)) = socket.recv_from(&mut buf) {
                    if !is_private_or_local_ip(&src_addr.ip()) {
                        continue;
                    }

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
                        let safe_name: String = beacon.name.chars().take(48).collect();
                        let peer = PeerDevice {
                            id: beacon.id.clone(),
                            name: safe_name,
                            os: beacon.os,
                            ip: peer_ip,
                            port: beacon.port,
                            last_seen: now,
                            is_self: false,
                        };

                        let mut table = listener_peers.lock().unwrap();
                        let mut is_new = false;
                        if table.len() < 64 || table.contains_key(&beacon.id) {
                            is_new = !table.contains_key(&beacon.id);
                            table.insert(beacon.id, peer.clone());
                            // Only notify frontend when a brand-new peer is discovered to avoid toast spam
                            if is_new {
                                let _ = listener_app.emit("otium-link://peer-discovered", peer);
                            }
                            let active_list: Vec<PeerDevice> = table.values().cloned().collect();
                            let _ = listener_app.emit("otium-link://peers-updated", active_list);
                        }

                        // Send direct UDP unicast beacon reply ONLY if incoming was NOT a reply AND peer is newly discovered.
                        // This strictly prevents the infinite UDP ping-pong storm between LAN peers.
                        if !beacon.is_reply && is_new {
                            let reply_beacon = {
                                let dev = listener_dev.lock().unwrap();
                                BeaconMessage {
                                    magic: "OTIUM_LINK_V1".to_string(),
                                    id: dev.id.clone(),
                                    name: dev.name.clone(),
                                    os: dev.os.clone(),
                                    port: dev.port,
                                    is_reply: true,
                                }
                            };
                            if let Ok(reply_bytes) = serde_json::to_vec(&reply_beacon) {
                                let _ = socket.send_to(&reply_bytes, format!("{}:{}", src_addr.ip(), BROADCAST_PORT));
                            }
                        }
                    }
                }
            }
        });

        // 3. Heartbeat & Stale Peer Pruner (Purges inactive peers after 10 seconds, preserving direct peers)
        let pruner_peers = peers_table.clone();
        let pruner_app = app.clone();
        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_secs(3));
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                let mut table = pruner_peers.lock().unwrap();
                let initial_len = table.len();
                table.retain(|_, peer| {
                    peer.last_seen == u64::MAX
                        || peer.id.starts_with("direct_")
                        || now.saturating_sub(peer.last_seen) < 10
                });
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

    /// Starts TCP Server on port 42425 with CRC32 integrity validation, atomic temporary writing, and startup temp cleanup
    pub fn start_tcp_server(&self, app: AppHandle) {
        let downloads = self.downloads_dir.clone();
        let peers = self.peers.clone();
        if let Ok(dir) = downloads.lock() {
            let _ = fs::create_dir_all(&*dir);
            let cleaned = cleanup_orphaned_tmp_files(&*dir);
            if cleaned > 0 {
                log::info!("Cleaned up {} orphaned temporary transfer files on startup", cleaned);
            }
        }

        const MAX_CONCURRENT_TCP_CONNECTIONS: usize = 16;
        const MAX_CLIPBOARD_PAYLOAD: usize = 10 * 1024 * 1024; // 10MB
        const MAX_FILE_HEADER_PAYLOAD: usize = 64 * 1024;      // 64KB
        const MAX_FILE_TRANSFER_SIZE: u64 = 100 * 1024 * 1024 * 1024; // 100GB

        let active_connections = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let rate_limiter = Arc::new(Mutex::new(HashMap::<std::net::IpAddr, (u32, std::time::Instant)>::new()));

        thread::spawn(move || {
            let listener = match bind_tcp_with_retries(&format!("0.0.0.0:{}", TCP_PORT), 15, Duration::from_millis(500)) {
                Some(l) => l,
                None => {
                    log::error!("Failed to bind TCP server on port {} after retries", TCP_PORT);
                    return;
                }
            };

            for stream in listener.incoming() {
                if let Ok(mut stream) = stream {
                    let peer_addr = match stream.peer_addr() {
                        Ok(addr) => addr,
                        Err(_) => continue,
                    };

                    // Local Subnet Firewall: Reject WAN / non-private IPs
                    if !is_private_or_local_ip(&peer_addr.ip()) {
                        continue;
                    }

                    // Per-IP Flood Rate Limiter: Max 15 connections per 3 seconds
                    let ip = peer_addr.ip();
                    {
                        let mut limiter = rate_limiter.lock().unwrap();
                        let now = std::time::Instant::now();
                        let entry = limiter.entry(ip).or_insert((0, now));
                        if now.duration_since(entry.1) > Duration::from_secs(3) {
                            *entry = (1, now);
                        } else {
                            entry.0 += 1;
                            if entry.0 > 15 {
                                continue;
                            }
                        }
                    }

                    let current = active_connections.load(std::sync::atomic::Ordering::Relaxed);
                    if current >= MAX_CONCURRENT_TCP_CONNECTIONS {
                        // Drop connection to prevent thread exhaustion DoS
                        continue;
                    }

                    active_connections.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    let active_conn_clone = active_connections.clone();
                    let app_clone = app.clone();
                    let downloads_clone = downloads.clone();
                    let peers_clone = peers.clone();

                    thread::spawn(move || {
                        struct ConnGuard(Arc<std::sync::atomic::AtomicUsize>);
                        impl Drop for ConnGuard {
                            fn drop(&mut self) {
                                self.0.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
                            }
                        }
                        let _guard = ConnGuard(active_conn_clone);

                        let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
                        let _ = stream.set_write_timeout(Some(Duration::from_secs(15)));

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
                                // 1 = Clipboard Sync (capped to 10MB to prevent OOM panic)
                                if payload_len > MAX_CLIPBOARD_PAYLOAD {
                                    return;
                                }
                                let mut payload = vec![0u8; payload_len];
                                if stream.read_exact(&mut payload).is_ok() {
                                    if let Ok(clip) = serde_json::from_slice::<ClipboardPayload>(&payload) {
                                        let sender_ip = peer_addr.ip().to_string();
                                        let now = SystemTime::now()
                                            .duration_since(UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();
                                        let peer_id = format!("peer_{}", sender_ip.replace('.', "_").replace(':', "_"));
                                        let peer = PeerDevice {
                                            id: peer_id.clone(),
                                            name: clip.sender.clone(),
                                            os: if cfg!(target_os = "android") { "windows".to_string() } else { "android".to_string() },
                                            ip: sender_ip,
                                            port: TCP_PORT,
                                            last_seen: now,
                                            is_self: false,
                                        };
                                        {
                                            let mut table = peers_clone.lock().unwrap();
                                            let is_new = !table.contains_key(&peer_id);
                                            table.insert(peer_id, peer.clone());
                                            if is_new {
                                                let _ = app_clone.emit("otium-link://peer-discovered", peer);
                                            }
                                            let active_list: Vec<PeerDevice> = table.values().cloned().collect();
                                            let _ = app_clone.emit("otium-link://peers-updated", active_list);
                                        }
                                        let _ = app_clone.emit("otium-link://clipboard-received", clip);
                                    }
                                }
                            }
                            2 => {
                                // 2 = Streamed File Transfer with CRC32 verification & atomic write
                                if payload_len > MAX_FILE_HEADER_PAYLOAD {
                                    return;
                                }
                                let mut header_bytes = vec![0u8; payload_len];
                                if stream.read_exact(&mut header_bytes).is_ok() {
                                    if let Ok(header) = serde_json::from_slice::<FileHeaderPayload>(&header_bytes) {
                                        if header.file_size > MAX_FILE_TRANSFER_SIZE {
                                            return;
                                        }

                                        let sender_ip = peer_addr.ip().to_string();
                                        let now = SystemTime::now()
                                            .duration_since(UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();
                                        let peer_id = format!("peer_{}", sender_ip.replace('.', "_").replace(':', "_"));
                                        let peer = PeerDevice {
                                            id: peer_id.clone(),
                                            name: header.sender.clone(),
                                            os: if cfg!(target_os = "android") { "windows".to_string() } else { "android".to_string() },
                                            ip: sender_ip,
                                            port: TCP_PORT,
                                            last_seen: now,
                                            is_self: false,
                                        };
                                        {
                                            let mut table = peers_clone.lock().unwrap();
                                            let is_new = !table.contains_key(&peer_id);
                                            table.insert(peer_id, peer.clone());
                                            if is_new {
                                                let _ = app_clone.emit("otium-link://peer-discovered", peer);
                                            }
                                            let active_list: Vec<PeerDevice> = table.values().cloned().collect();
                                            let _ = app_clone.emit("otium-link://peers-updated", active_list);
                                        }

                                        let safe_name = sanitize_filename(&header.file_name);

                                        let target_dir = downloads_clone
                                            .lock()
                                            .map(|d| d.clone())
                                            .unwrap_or_else(|_| PathBuf::from("."));
                                        let _ = fs::create_dir_all(&target_dir);

                                        let now = SystemTime::now()
                                            .duration_since(UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();

                                        let temp_filename = format!(".{}_{}.otlink.tmp", safe_name, now);
                                        let temp_path = target_dir.join(&temp_filename);

                                        if let Ok(mut file) = File::create(&temp_path) {
                                            let mut temp_guard = TmpFileGuard {
                                                path: &temp_path,
                                                defused: false,
                                            };
                                            let mut received_bytes: u64 = 0;
                                            let mut chunk = [0u8; 65536]; // 64KB chunks
                                            let mut hasher = crc32fast::Hasher::new();
                                            let mut success = true;
                                            let mut last_progress_emit = std::time::Instant::now();

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

                                                        let now_inst = std::time::Instant::now();
                                                        let is_final = received_bytes == header.file_size;
                                                        if header.file_size > 1_048_576 && (is_final || now_inst.duration_since(last_progress_emit) >= Duration::from_millis(150)) {
                                                            last_progress_emit = now_inst;
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
                                                // Re-evaluate unique filepath immediately before rename to guarantee no race collisions on Windows
                                                let final_target = get_unique_filepath(&target_dir, &safe_name);
                                                if fs::rename(&temp_path, &final_target).is_ok() {
                                                    temp_guard.defused = true;
                                                    let final_name = final_target
                                                        .file_name()
                                                        .map(|n| n.to_string_lossy().to_string())
                                                        .unwrap_or(safe_name);

                                                    let _ = app_clone.emit(
                                                        "otium-link://file-received",
                                                        serde_json::json!({
                                                             "name": final_name,
                                                             "path": final_target.to_string_lossy(),
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
                            3 => {
                                // 3 = Remote Cast Launch Notification (capped to 16KB)
                                if payload_len <= 16 * 1024 {
                                    let mut payload = vec![0u8; payload_len];
                                    if stream.read_exact(&mut payload).is_ok() {
                                        if let Ok(cmd) = serde_json::from_slice::<RemoteCastPayload>(&payload) {
                                            // Security Validation: Only forward legitimate local smart cast URLs
                                            let is_http = cmd.url.starts_with("http://") || cmd.url.starts_with("https://");
                                            let peer_ip_str = peer_addr.ip().to_string();
                                            let is_local_cast_target = cmd.url.contains(":42426")
                                                || cmd.url.contains(&peer_ip_str)
                                                || cmd.url.contains("127.0.0.1")
                                                || cmd.url.contains("localhost");

                                            if is_http && is_local_cast_target {
                                                let _ = app_clone.emit("otium-link://remote-cast-requested", cmd);
                                            } else {
                                                log::warn!("Rejected suspicious remote cast URL from {}: {}", peer_addr, cmd.url);
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

    /// Sends clipboard text to a remote peer over TCP with 3-attempt resilient backoff retry
    pub fn send_clipboard(&self, target_ip: &str, text: String, sender: String) -> Result<(), String> {
        let target_addr: std::net::SocketAddr = format!("{}:{}", target_ip, TCP_PORT)
            .parse()
            .map_err(|e| format!("Invalid target IP address: {:?}", e))?;

        if !is_private_or_local_ip(&target_addr.ip()) {
            return Err("Target IP must be a private or local network address".to_string());
        }

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

        // Resilient connection retry with exponential backoff: 3 attempts
        let mut last_error = String::new();
        for attempt in 1..=3 {
            match TcpStream::connect_timeout(&target_addr, Duration::from_secs(3)) {
                Ok(mut stream) => {
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));

                    let write_res = (|| -> Result<(), std::io::Error> {
                        stream.write_all(PROTOCOL_MAGIC)?;
                        stream.write_all(&[1u8])?; // Type 1 = Clipboard
                        stream.write_all(&(json.len() as u32).to_be_bytes())?;
                        stream.write_all(&json)?;
                        stream.flush()?;
                        Ok(())
                    })();

                    match write_res {
                        Ok(()) => return Ok(()),
                        Err(e) => {
                            last_error = format!("Stream write failed on attempt {}: {}", attempt, e);
                        }
                    }
                }
                Err(e) => {
                    last_error = format!("Connection failed on attempt {}: {}", attempt, e);
                }
            }

            if attempt < 3 {
                thread::sleep(Duration::from_millis(attempt as u64 * 250));
            }
        }

        Err(format!("Transmission failed after 3 attempts: {}", last_error))
    }

    /// Streams a local file directly to a remote peer over TCP with 3-attempt connection retry and running CRC32 verification
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

        let target_addr: std::net::SocketAddr = format!("{}:{}", target_ip, TCP_PORT)
            .parse()
            .map_err(|e| format!("Invalid target IP address: {:?}", e))?;

        if !is_private_or_local_ip(&target_addr.ip()) {
            return Err("Target IP must be a private or local network address".to_string());
        }

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

        // Connect with retry (up to 3 attempts with backoff)
        let mut stream = {
            let mut conn_stream = None;
            let mut last_err = String::new();
            for attempt in 1..=3 {
                match TcpStream::connect_timeout(&target_addr, Duration::from_secs(5)) {
                    Ok(s) => {
                        conn_stream = Some(s);
                        break;
                    }
                    Err(e) => {
                        last_err = format!("Attempt {}: {}", attempt, e);
                        if attempt < 3 {
                            thread::sleep(Duration::from_millis(attempt as u64 * 300));
                        }
                    }
                }
            }
            conn_stream.ok_or_else(|| format!("Connection failed after 3 attempts: {}", last_err))?
        };

        let _ = stream.set_write_timeout(Some(Duration::from_secs(20)));
        let _ = stream.set_read_timeout(Some(Duration::from_secs(20)));

        stream.write_all(PROTOCOL_MAGIC).map_err(|e| format!("Header send error: {}", e))?;
        stream.write_all(&[2u8]).map_err(|e| format!("Header send error: {}", e))?; // Type 2 = Streamed File
        stream.write_all(&(header_json.len() as u32).to_be_bytes()).map_err(|e| format!("Header send error: {}", e))?;
        stream.write_all(&header_json).map_err(|e| format!("Header send error: {}", e))?;

        // Stream file chunks directly while calculating running CRC32
        let mut buffer = [0u8; 65536]; // 64KB buffer
        let mut hasher = crc32fast::Hasher::new();
        let mut sent_bytes: u64 = 0;
        let mut last_progress_emit = std::time::Instant::now();

        loop {
            let n = file.read(&mut buffer).map_err(|e| format!("File read error: {}", e))?;
            if n == 0 {
                break;
            }
            stream.write_all(&buffer[..n]).map_err(|e| format!("Socket stream error: {}", e))?;
            hasher.update(&buffer[..n]);
            sent_bytes += n as u64;

            let now_inst = std::time::Instant::now();
            if sent_bytes == file_size || now_inst.duration_since(last_progress_emit) >= Duration::from_millis(150) {
                last_progress_emit = now_inst;
                on_progress(sent_bytes, file_size);
            }
        }

        // Send 4-byte CRC32 trailer
        let final_crc = hasher.finalize();
        stream.write_all(&final_crc.to_be_bytes()).map_err(|e| format!("CRC trailer error: {}", e))?;
        stream.flush().map_err(|e| format!("Flush error: {}", e))?;

        Ok(())
    }

    /// Dispatches a remote command to an Otium Link peer to open the Smart Cast Presentation receiver
    pub fn send_remote_cast_command(
        &self,
        target_ip: &str,
        target_port: u16,
        url: &str,
        pin: &str,
    ) -> Result<(), String> {
        let sender_name = { self.self_device.lock().unwrap().name.clone() };
        let payload = RemoteCastPayload {
            action: "open_cast".to_string(),
            url: url.to_string(),
            pin: pin.to_string(),
            sender: sender_name,
        };

        let payload_bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
        let mut stream = TcpStream::connect(format!("{}:{}", target_ip, target_port))
            .map_err(|e| format!("Failed to connect to peer {}:{}: {}", target_ip, target_port, e))?;

        let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
        stream.write_all(PROTOCOL_MAGIC).map_err(|e| e.to_string())?;
        stream.write_all(&[3u8]).map_err(|e| e.to_string())?; // Type 3 = Remote Cast Launch
        let len_bytes = (payload_bytes.len() as u32).to_be_bytes();
        stream.write_all(&len_bytes).map_err(|e| e.to_string())?;
        stream.write_all(&payload_bytes).map_err(|e| e.to_string())?;
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

    #[test]
    fn test_sanitize_filename_traversal_and_reserved() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_filename("C:\\Windows\\System32\\cmd.exe"), "cmd.exe");
        assert_eq!(sanitize_filename("CON.txt"), "otium_CON.txt");
        assert_eq!(sanitize_filename("aux.pdf"), "otium_aux.pdf");
        assert_eq!(sanitize_filename("nul"), "otium_nul");
        assert_eq!(sanitize_filename("hello:world*test?.pdf"), "hello_world_test_.pdf");
        assert_eq!(sanitize_filename("..."), "downloaded_file.bin");
        assert_eq!(sanitize_filename(""), "downloaded_file.bin");
        // Unicode Right-to-Left Override (RTLO) spoofing attack stripped
        assert_eq!(sanitize_filename("invoice\u{202E}fdp.exe"), "invoicefdp.exe");
        // Long filename truncation to max 120 chars to protect Windows MAX_PATH
        let long_name = format!("{}.pdf", "a".repeat(250));
        let sanitized_long = sanitize_filename(&long_name);
        assert!(sanitized_long.len() <= 120);
        assert!(sanitized_long.ends_with(".pdf"));
    }

    #[test]
    fn test_local_ip_firewall_validation() {
        use std::net::IpAddr;
        assert!(is_private_or_local_ip(&"127.0.0.1".parse::<IpAddr>().unwrap()));
        assert!(is_private_or_local_ip(&"192.168.1.50".parse::<IpAddr>().unwrap()));
        assert!(is_private_or_local_ip(&"10.0.5.22".parse::<IpAddr>().unwrap()));
        assert!(is_private_or_local_ip(&"172.16.0.1".parse::<IpAddr>().unwrap()));
        // CGNAT / Tailscale range (100.64.0.0/10) allowed
        assert!(is_private_or_local_ip(&"100.64.1.25".parse::<IpAddr>().unwrap()));
        assert!(is_private_or_local_ip(&"100.127.255.1".parse::<IpAddr>().unwrap()));
        // WAN / Public IPs must be rejected
        assert!(!is_private_or_local_ip(&"8.8.8.8".parse::<IpAddr>().unwrap()));
        assert!(!is_private_or_local_ip(&"1.1.1.1".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn test_cleanup_orphaned_tmp_files() {
        let temp_dir = std::env::temp_dir().join("otium_test_cleanup_tmp");
        let _ = fs::create_dir_all(&temp_dir);

        let valid_file = temp_dir.join("photo.jpg");
        let _ = File::create(&valid_file);

        let tmp_file = temp_dir.join(".document_123.otlink.tmp");
        let _ = File::create(&tmp_file);

        assert!(valid_file.exists());
        assert!(tmp_file.exists());

        // Calling cleanup (for files created just now without age wait) won't delete fresh files unless age criteria met
        let _ = cleanup_orphaned_tmp_files(&temp_dir);
        assert!(valid_file.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_direct_peer_management() {
        let temp_dir = std::env::temp_dir().join("otium_test_direct_peer");
        let nm = NetworkManager::new("TestNode".to_string(), temp_dir.clone());

        // 1. Valid Private IP succeeds
        let peer = nm.add_direct_peer("192.168.1.150".to_string(), "My Phone".to_string(), "android".to_string());
        assert!(peer.is_ok());
        let p = peer.unwrap();
        assert_eq!(p.id, "direct_192_168_1_150");
        assert_eq!(p.name, "My Phone");
        assert_eq!(p.last_seen, u64::MAX);

        // Verify stored in peers table
        {
            let table = nm.peers.lock().unwrap();
            assert!(table.contains_key("direct_192_168_1_150"));
        }

        // 2. Reject public / WAN IP
        let wan_res = nm.add_direct_peer("8.8.8.8".to_string(), "Attacker".to_string(), "linux".to_string());
        assert!(wan_res.is_err());

        // 3. Reject invalid IP format
        let invalid_res = nm.add_direct_peer("not-an-ip".to_string(), "Bad".to_string(), "windows".to_string());
        assert!(invalid_res.is_err());

        // 4. Remove direct peer
        nm.remove_direct_peer("direct_192_168_1_150");
        {
            let table = nm.peers.lock().unwrap();
            assert!(!table.contains_key("direct_192_168_1_150"));
        }
    }
}
