mod app_error;
mod app_log;
mod core;
mod file;
mod ocr;
mod os;
mod screenshot;
mod scroll_screenshot;
mod services;
use std::sync::Mutex;

use enigo::{Enigo, Settings};
use ocr::OcrLiteWrap;
use os::ui_automation::UIElements;
use paddle_ocr_rs::ocr_lite::OcrLite;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ocr_instance = OcrLiteWrap {
        ocr_instance: Some(OcrLite::new()),
    };
    let ocr_instance = Mutex::new(ocr_instance);
    let scroll_screenshot_service = Mutex::new(services::ScrollScreenshotService::new());

    let enigo_instance = Enigo::new(&Settings::default()).unwrap();
    let enigo_instance = Mutex::new(enigo_instance);

    let ui_elements = Mutex::new(UIElements::new());
    let auto_start_hide_window = Mutex::new(false);

    let mut app_builder = tauri::Builder::default().plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        app_builder = app_builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let app_window = app.get_webview_window("main").expect("no main window");
            app_window.unminimize().unwrap();
            app_window.set_focus().unwrap();
            app_window.show().unwrap();
        }));
    }
    app_builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--auto_start"]),
        ))
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .targets([
                            Target::new(TargetKind::Stdout),
                            Target::new(TargetKind::LogDir { file_name: None }),
                            Target::new(TargetKind::Webview),
                        ])
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .manage(ui_elements)
        .manage(ocr_instance)
        .manage(auto_start_hide_window)
        .manage(enigo_instance)
        .manage(scroll_screenshot_service)
        .invoke_handler(tauri::generate_handler![
            screenshot::capture_current_monitor,
            screenshot::get_window_elements,
            screenshot::init_ui_elements,
            screenshot::get_element_from_position,
            screenshot::init_ui_elements_cache,
            screenshot::get_mouse_position,
            screenshot::create_draw_window,
            screenshot::switch_always_on_top,
            screenshot::set_draw_window_style,
            core::exit_app,
            file::save_file,
            ocr::ocr_detect,
            ocr::ocr_init,
            ocr::ocr_release,
            core::auto_start_hide_window,
            core::get_selected_text,
            core::set_enable_proxy,
            core::scroll_through,
            core::click_through,
            core::create_fixed_content_window,
            core::read_image_from_clipboard,
            core::create_full_screen_draw_window,
            core::get_current_monitor_info,
            scroll_screenshot::scroll_screenshot_get_image_data,
            scroll_screenshot::scroll_screenshot_init,
            scroll_screenshot::scroll_screenshot_capture,
            scroll_screenshot::scroll_screenshot_save_to_file,
            scroll_screenshot::scroll_screenshot_save_to_clipboard,
            scroll_screenshot::scroll_screenshot_get_size,
            scroll_screenshot::scroll_screenshot_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
