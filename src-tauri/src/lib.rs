use std::env;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
#[cfg(desktop)]
use tauri::WindowEvent;

mod network;
pub use network::{get_unique_filepath, NetworkManager, PeerDevice};

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
fn send_file(app: tauri::AppHandle, state: tauri::State<'_, AppState>, target_ip: String, file_path: String) -> Result<(), String> {
    let sender = state.network.self_device.lock().unwrap().name.clone();
    let app_handle = app.clone();
    let safe_name = PathBuf::from(&file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file.bin".to_string());

    let file_label = safe_name.clone();
    let peer_target = target_ip.clone();

    state.network.send_file(
        &peer_target,
        PathBuf::from(file_path),
        sender.clone(),
        move |transferred, total| {
            let _ = app_handle.emit(
                "otium-link://file-progress",
                serde_json::json!({
                    "name": file_label,
                    "transferred": transferred,
                    "total": total,
                    "sender": sender
                }),
            );
        },
    )
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

#[cfg(target_os = "windows")]
fn strip_unc_prefix(path: &std::path::Path) -> std::path::PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\UNC\") {
        std::path::PathBuf::from(format!(r"\\{}", stripped))
    } else if let Some(stripped) = s.strip_prefix(r"\\?\") {
        std::path::PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

#[tauri::command]
fn open_downloads_folder(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let dir = state.network.get_downloads_dir();
    let _ = std::fs::create_dir_all(&dir);

    #[cfg(target_os = "windows")]
    {
        let clean_dir = strip_unc_prefix(&dir);
        let _ = std::process::Command::new("explorer").arg(&clean_dir).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&dir).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    Ok(())
}

#[tauri::command]
fn open_file(state: tauri::State<'_, AppState>, file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("File does not exist on disk".to_string());
    }

    // Verify file is within designated downloads directory
    let downloads_dir = state.network.get_downloads_dir();
    let canonical_target = path.canonicalize().map_err(|e| e.to_string())?;
    let canonical_downloads = downloads_dir.canonicalize().map_err(|e| e.to_string())?;

    if !canonical_target.starts_with(&canonical_downloads) {
        return Err("Access denied: File is outside the downloads directory".to_string());
    }

    // Guard against executing dangerous scripts/binaries
    #[cfg(target_os = "windows")]
    let is_dangerous_executable = canonical_target
        .extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            let lower = ext.to_lowercase();
            matches!(
                lower.as_str(),
                "exe" | "bat" | "cmd" | "vbs" | "vbe" | "js" | "jse" | "wsf" | "wsh" | "msc"
                    | "scr" | "ps1" | "ps2" | "pif" | "com" | "reg" | "msi" | "hta"
            )
        })
        .unwrap_or(false);

    #[cfg(target_os = "windows")]
    {
        let clean_target = strip_unc_prefix(&canonical_target);
        if is_dangerous_executable {
            // For dangerous executable files, DO NOT execute directly! Reveal safely in Explorer
            let _ = std::process::Command::new("explorer")
                .arg(format!("/select,\"{}\"", clean_target.to_string_lossy()))
                .spawn();
        } else {
            // Launch safe file viewer via explorer directly without cmd.exe
            let _ = std::process::Command::new("explorer")
                .arg(&clean_target)
                .spawn();
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&canonical_target).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&canonical_target).spawn();
    }
    Ok(())
}

#[tauri::command]
fn add_direct_peer(state: tauri::State<'_, AppState>, ip: String, name: String, os: String) -> Result<PeerDevice, String> {
    state.network.add_direct_peer(ip, name, os)
}

#[tauri::command]
fn remove_direct_peer(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    state.network.remove_direct_peer(&id);
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

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                network.start_desktop_clipboard_watcher(handle.clone());
            }

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
            set_download_dir,
            open_downloads_folder,
            open_file,
            add_direct_peer,
            remove_direct_peer
        ])
        .run(tauri::generate_context!())
        .expect("error while running otium link");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "windows")]
    fn test_strip_unc_prefix() {
        let unc_local = std::path::Path::new(r"\\?\C:\Users\Test\Downloads\file.txt");
        assert_eq!(strip_unc_prefix(unc_local), std::path::PathBuf::from(r"C:\Users\Test\Downloads\file.txt"));

        let unc_network = std::path::Path::new(r"\\?\UNC\Server\Share\file.txt");
        assert_eq!(strip_unc_prefix(unc_network), std::path::PathBuf::from(r"\\Server\Share\file.txt"));

        let normal_path = std::path::Path::new(r"C:\Users\Test\Downloads\file.txt");
        assert_eq!(strip_unc_prefix(normal_path), std::path::PathBuf::from(r"C:\Users\Test\Downloads\file.txt"));
    }
}
