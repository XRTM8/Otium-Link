use std::env;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;

mod network;
use network::{NetworkManager, PeerDevice};

struct AppState {
    network: Arc<NetworkManager>,
}

#[tauri::command]
fn get_self_device(state: tauri::State<'_, AppState>) -> PeerDevice {
    state.network.self_device.lock().unwrap().clone()
}

#[tauri::command]
fn get_peers(state: tauri::State<'_, AppState>) -> Vec<PeerDevice> {
    state.network.peers.lock().unwrap().values().cloned().collect()
}

#[tauri::command]
fn send_clipboard(state: tauri::State<'_, AppState>, target_ip: String, text: String) -> Result<(), String> {
    let sender = state.network.self_device.lock().unwrap().name.clone();
    state.network.send_clipboard(&target_ip, text, sender)
}

#[tauri::command]
fn send_file(state: tauri::State<'_, AppState>, target_ip: String, file_path: String) -> Result<(), String> {
    let sender = state.network.self_device.lock().unwrap().name.clone();
    state.network.send_file(&target_ip, PathBuf::from(file_path), sender)
}

fn resolve_device_name() -> String {
    env::var("COMPUTERNAME")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "جهاز Otium".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle();
            let downloads_dir = handle
                .path()
                .download_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("OtiumLink");

            let device_name = resolve_device_name();

            let network = Arc::new(NetworkManager::new(device_name, downloads_dir));
            network.start_discovery(handle.clone());
            network.start_tcp_server(handle.clone());

            app.manage(AppState { network });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_self_device,
            get_peers,
            send_clipboard,
            send_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running otium link");
}
