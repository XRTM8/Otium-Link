use std::env;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;

#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
#[cfg(desktop)]
use tauri::WindowEvent;

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
fn set_device_name(state: tauri::State<'_, AppState>, name: String) -> Result<(), String> {
    state.network.set_device_name(name);
    Ok(())
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

#[tauri::command]
fn get_download_dir(state: tauri::State<'_, AppState>) -> String {
    state.network.get_downloads_dir().to_string_lossy().to_string()
}

#[tauri::command]
fn set_download_dir(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    let p = PathBuf::from(path);
    if !p.exists() {
        std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    }
    state.network.set_downloads_dir(p);
    Ok(())
}

fn resolve_device_name() -> String {
    env::var("COMPUTERNAME")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "جهاز Otium".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
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

            // Setup System Tray Icon for desktop background operation
            #[cfg(desktop)]
            {
                let show_i = MenuItem::with_id(app, "show", "إظهار Otium Link", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "إنهاء التطبيق", true, None::<&str>)?;
                let tray_menu = Menu::with_items(app, &[&show_i, &quit_i])?;

                let icon = app.default_window_icon().cloned();
                if let Some(tray_icon) = icon {
                    let _ = TrayIconBuilder::new()
                        .icon(tray_icon)
                        .menu(&tray_menu)
                        .tooltip("Otium Link — المزامنة اللحظية الحرة")
                        .on_menu_event(|app, event| {
                            match event.id.as_ref() {
                                "show" => {
                                    if let Some(window) = app.get_webview_window("main") {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                                "quit" => {
                                    app.exit(0);
                                }
                                _ => {}
                            }
                        })
                        .on_tray_icon_event(|tray, event| {
                            if let TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            } = event
                            {
                                let app = tray.app_handle();
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        })
                        .build(app);
                }
            }

            Ok(())
        });

    #[cfg(desktop)]
    {
        builder = builder.on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Minimize to system tray instead of closing process
                let _ = window.hide();
                api.prevent_close();
            }
        });
    }

    builder
        .invoke_handler(tauri::generate_handler![
            get_self_device,
            set_device_name,
            get_peers,
            send_clipboard,
            send_file,
            get_download_dir,
            set_download_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running otium link");
}
