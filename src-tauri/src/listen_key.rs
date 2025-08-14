use tauri::{AppHandle, Window, command};

use snow_shot_app_services::{
    device_event_handler_service::DeviceEventHandlerService, listen_key_service::ListenKeyService,
};
use tokio::sync::Mutex;

#[command]
pub async fn listen_key_start(
    app_handle: AppHandle,
    window: Window,
    device_event_handler_service: tauri::State<'_, Mutex<DeviceEventHandlerService>>,
    listen_key_service: tauri::State<'_, Mutex<ListenKeyService>>,
) -> Result<(), String> {
    let mut device_event_handler_service = device_event_handler_service.lock().await;
    let mut listen_key_service = listen_key_service.lock().await;

    listen_key_service.start(app_handle, window, &mut device_event_handler_service)?;

    Ok(())
}

#[command]
pub async fn listen_key_stop(
    window: Window,
    listen_key_service: tauri::State<'_, Mutex<ListenKeyService>>,
) -> Result<(), String> {
    let mut listen_key_service = listen_key_service.lock().await;

    listen_key_service.stop_by_window_label(window.label())?;

    Ok(())
}

#[command]
pub async fn listen_key_stop_by_window_label(
    listen_key_service: tauri::State<'_, Mutex<ListenKeyService>>,
    window_label: String,
) -> Result<(), String> {
    let mut listen_key_service = listen_key_service.lock().await;

    listen_key_service.stop_by_window_label(&window_label)?;

    Ok(())
}
