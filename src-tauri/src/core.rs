use enigo::{Axis, Enigo, Mouse};
use std::{
    env,
    path::PathBuf,
    sync::Mutex,
    thread::sleep,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::ipc::Response;
use tauri::{Manager, command};
use tauri_plugin_clipboard;

#[command]
pub async fn exit_app(window: tauri::Window, handle: tauri::AppHandle) {
    window.hide().unwrap();
    handle.exit(0);
}

#[command]
pub async fn get_selected_text() -> String {
    let text = match get_selected_text::get_selected_text() {
        Ok(text) => text,
        Err(_) => {
            return String::new();
        }
    };
    text
}

#[command]
pub async fn auto_start_hide_window(
    window: tauri::Window,
    auto_start_hide_window: tauri::State<'_, Mutex<bool>>,
) -> Result<(), ()> {
    let mut auto_start_hide_window = match auto_start_hide_window.lock() {
        Ok(auto_start_hide_window) => auto_start_hide_window,
        Err(_) => return Err(()),
    };

    if *auto_start_hide_window == false && env::args().any(|arg| arg == "--auto_start") {
        window.hide().unwrap();
        *auto_start_hide_window = true;
    }
    Ok(())
}

#[command]
pub async fn set_enable_proxy(enable: bool, host: String) -> Result<(), ()> {
    unsafe {
        if enable {
            std::env::set_var("NO_PROXY", "");
        } else {
            std::env::set_var("NO_PROXY", host);
        }
    }
    Ok(())
}

/// 鼠标滚轮穿透
#[command]
pub async fn scroll_through(
    window: tauri::Window,
    enigo: tauri::State<'_, Mutex<Enigo>>,
    length: i32,
) -> Result<(), ()> {
    let result = window.set_ignore_cursor_events(true);
    if result.is_err() {
        return Ok(());
    }

    sleep(Duration::from_millis(1));

    if let Ok(mut enigo) = enigo.lock() {
        enigo.scroll(length, Axis::Vertical).unwrap();

        // 让用户的鼠标也能触发滚轮事件
        sleep(Duration::from_millis(128));
        match window.set_ignore_cursor_events(false) {
            Ok(_) => (),
            Err(_) => (),
        }
    }

    Ok(())
}

/// 鼠标滚轮穿透
#[command]
pub async fn click_through(window: tauri::Window) -> Result<(), ()> {
    let result = window.set_ignore_cursor_events(true);
    if result.is_err() {
        return Ok(());
    }

    sleep(Duration::from_millis(128));
    match window.set_ignore_cursor_events(false) {
        Ok(_) => (),
        Err(_) => (),
    }

    Ok(())
}

/// 创建内容固定到屏幕的窗口
#[command]
pub async fn create_fixed_content_window(app: tauri::AppHandle, scroll_screenshot: bool) {
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        format!(
            "fixed-content-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
        ),
        tauri::WebviewUrl::App(PathBuf::from(format!(
            "/fixedContent?scroll_screenshot={}",
            scroll_screenshot
        ))),
    )
    .always_on_top(true)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .fullscreen(false)
    .title("Snow Shot - Fixed Content")
    .center()
    .decorations(false)
    .shadow(false)
    .transparent(false)
    .skip_taskbar(true)
    .resizable(false)
    .inner_size(0.0, 0.0)
    .build()
    .unwrap();

    window.hide().unwrap();
}

#[command]
pub async fn read_image_from_clipboard(handle: tauri::AppHandle) -> Response {
    let clipboard = handle.state::<tauri_plugin_clipboard::Clipboard>();
    let image_data = match tauri_plugin_clipboard::Clipboard::read_image_binary(&clipboard) {
        Ok(image_data) => image_data,
        Err(_) => return Response::new(vec![]),
    };

    return Response::new(image_data);
}
