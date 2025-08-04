use tauri::command;
use tauri::ipc::Response;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::sync::Mutex;

use snow_shot_app_os::TryGetElementByFocus;
use snow_shot_app_os::ui_automation::UIElements;
use snow_shot_app_shared::ElementRect;
use snow_shot_tauri_commands_screenshot::WindowElement;

#[command]
pub async fn capture_current_monitor(window: tauri::Window, encoder: String) -> Response {
    snow_shot_tauri_commands_screenshot::capture_current_monitor(window, encoder).await
}

#[command]
pub async fn capture_all_monitors() -> Response {
    snow_shot_tauri_commands_screenshot::capture_all_monitors().await
}

#[command]
pub async fn capture_focused_window(
    app: tauri::AppHandle,
    file_path: Option<String>,
) -> Result<(), String> {
    snow_shot_tauri_commands_screenshot::capture_focused_window(
        |image| match app.clipboard().write_image(&tauri::image::Image::new(
            image.as_bytes(),
            image.width(),
            image.height(),
        )) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!(
                "[capture_focused_window] Failed to write image to clipboard: {}",
                e
            )),
        },
        file_path,
    )
    .await
}

#[command]
pub async fn init_ui_elements(ui_elements: tauri::State<'_, Mutex<UIElements>>) -> Result<(), ()> {
    snow_shot_tauri_commands_screenshot::init_ui_elements(ui_elements).await
}

#[command]
pub async fn init_ui_elements_cache(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
    try_get_element_by_focus: TryGetElementByFocus,
) -> Result<(), ()> {
    snow_shot_tauri_commands_screenshot::init_ui_elements_cache(
        ui_elements,
        try_get_element_by_focus,
    )
    .await
}

#[command]
pub async fn recovery_window_z_order(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
) -> Result<(), ()> {
    snow_shot_tauri_commands_screenshot::recovery_window_z_order(ui_elements).await
}

#[command]
pub async fn get_window_elements() -> Result<Vec<WindowElement>, ()> {
    snow_shot_tauri_commands_screenshot::get_window_elements().await
}

#[command]
pub async fn switch_always_on_top(window_id: u32) -> bool {
    snow_shot_tauri_commands_screenshot::switch_always_on_top(window_id).await
}

#[command]
pub async fn get_element_from_position(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
    window: tauri::Window,
    mouse_x: i32,
    mouse_y: i32,
) -> Result<Vec<ElementRect>, ()> {
    snow_shot_tauri_commands_screenshot::get_element_from_position(
        ui_elements,
        window,
        mouse_x,
        mouse_y,
    )
    .await
}

#[command]
pub async fn get_mouse_position(app: tauri::AppHandle) -> Result<(i32, i32), ()> {
    snow_shot_tauri_commands_screenshot::get_mouse_position(app).await
}

#[command]
pub async fn create_draw_window(app: tauri::AppHandle) {
    snow_shot_tauri_commands_screenshot::create_draw_window(app).await
}

#[command]
pub async fn set_draw_window_style(window: tauri::Window) {
    snow_shot_tauri_commands_screenshot::set_draw_window_style(window).await
}
