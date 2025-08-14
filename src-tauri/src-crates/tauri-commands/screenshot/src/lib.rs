use serde::Serialize;
use snow_shot_app_os::TryGetElementByFocus;
use snow_shot_app_os::ui_automation::UIElements;
use snow_shot_app_shared::ElementRect;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Response;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;
use xcap::Window;

pub async fn capture_current_monitor(
    #[allow(unused_variables)] window: tauri::Window,
    encoder: String,
) -> Result<Response, String> {
    // 获取当前鼠标的位置
    let (_, _, monitor) = snow_shot_app_utils::get_target_monitor()?;

    let image_buffer =
        match snow_shot_app_utils::capture_target_monitor(&monitor, None, Some(&window)) {
            Some(image) => image,
            None => {
                log::error!("Failed to capture current monitor");
                return Ok(Response::new(Vec::new()));
            }
        };

    let image_buffer = snow_shot_app_utils::encode_image(
        &image_buffer,
        match encoder.as_str() {
            "webp" => snow_shot_app_utils::ImageEncoder::Webp,
            "png" => snow_shot_app_utils::ImageEncoder::Png,
            _ => snow_shot_app_utils::ImageEncoder::Webp,
        },
    );

    Ok(Response::new(image_buffer))
}

pub async fn capture_all_monitors(window: tauri::Window) -> Result<Response, String> {
    let image = snow_shot_app_utils::get_capture_monitor_list(&window.app_handle(), None)?
        .capture(Some(&window))?;

    let image_buffer =
        snow_shot_app_utils::encode_image(&image, snow_shot_app_utils::ImageEncoder::Webp);

    Ok(Response::new(image_buffer))
}

pub async fn capture_focused_window<F>(
    write_image_to_clipboard: F,
    file_path: String,
    copy_to_clipboard: bool,
) -> Result<(), String>
where
    F: Fn(&image::DynamicImage) -> Result<(), String> + Send + 'static,
{
    let image;

    #[cfg(target_os = "windows")]
    {
        let hwnd = snow_shot_app_os::utils::get_focused_window();

        let focused_window = xcap::Window::new(xcap::ImplWindow::new(hwnd));

        image = match focused_window.capture_image() {
            Ok(image) => image,
            Err(_) => {
                log::warn!("[capture_focused_window] Failed to capture focused window");
                // 改成捕获当前显示器

                let (_, _, monitor) = snow_shot_app_utils::get_target_monitor()?;

                match monitor.capture_image() {
                    Ok(image) => image,
                    Err(_) => {
                        return Err(String::from(
                            "[capture_focused_window] Failed to capture image",
                        ));
                    }
                }
            }
        };
    }

    #[cfg(target_os = "linux")]
    {
        let (_, _, monitor) = snow_shot_app_utils::get_target_monitor();

        image = match monitor.capture_image() {
            Ok(image) => image,
            Err(_) => {
                return Err(String::from(
                    "[capture_focused_window] Failed to capture image",
                ));
            }
        };
    }

    #[cfg(target_os = "macos")]
    {
        let window_list = xcap::Window::all().unwrap_or_default();
        let window = window_list.iter().find(|w| {
            w.is_focused().unwrap_or(false)
                // 排除某些托盘应用，托盘应用会捕获到托盘图标
                && w.y().unwrap_or(0) != 0
                && !w.title().unwrap_or_default().starts_with("Item-")
        });

        let window_image = match window {
            Some(window) => match window.capture_image() {
                Ok(image) => Some(image),
                Err(_) => None,
            },
            None => None,
        };

        image = match window_image {
            Some(image) => image,
            None => {
                log::warn!("[capture_focused_window] Failed to capture focused window");
                // 改成捕获当前显示器

                let (_, _, monitor) = snow_shot_app_utils::get_target_monitor()?;

                match monitor.capture_image() {
                    Ok(image) => image,
                    Err(_) => {
                        return Err(String::from(
                            "[capture_focused_window] Failed to capture image",
                        ));
                    }
                }
            }
        };
    }

    let image = Arc::new(image::DynamicImage::ImageRgba8(image));

    // 并行执行保存文件和写入剪贴板
    let save_file_future =
        snow_shot_app_utils::save_image_to_file(&image, PathBuf::from(file_path));
    let clipboard_future = if copy_to_clipboard {
        let image_clone = Arc::clone(&image);
        Some(tokio::task::spawn_blocking(
            move || match write_image_to_clipboard(&image_clone) {
                Ok(_) => Ok(()),
                Err(e) => {
                    log::error!(
                        "[capture_focused_window] Failed to write image to clipboard: {}",
                        e
                    );

                    Err(e)
                }
            },
        ))
    } else {
        None
    };

    if let Some(clipboard_handle) = clipboard_future {
        let (save_result, clipboard_result) = tokio::join!(save_file_future, clipboard_handle);
        save_result?;
        clipboard_result.unwrap()?;
    } else {
        save_file_future.await?;
    }

    Ok(())
}

pub async fn init_ui_elements(ui_elements: tauri::State<'_, Mutex<UIElements>>) -> Result<(), ()> {
    let mut ui_elements = ui_elements.lock().await;

    match ui_elements.init() {
        Ok(_) => Ok(()),
        Err(_) => Err(()),
    }
}

pub async fn init_ui_elements_cache(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
    try_get_element_by_focus: TryGetElementByFocus,
) -> Result<(), ()> {
    let mut ui_elements = ui_elements.lock().await;

    match ui_elements.init_cache(try_get_element_by_focus) {
        Ok(_) => (),
        Err(_) => return Err(()),
    }

    Ok(())
}

pub async fn recovery_window_z_order(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
) -> Result<(), ()> {
    let ui_elements = ui_elements.lock().await;

    ui_elements.recovery_window_z_order();

    Ok(())
}

#[derive(PartialEq, Eq, Serialize, Clone, Debug, Copy, Hash)]
pub struct WindowElement {
    element_rect: ElementRect,
    window_id: u32,
}

pub async fn get_window_elements(
    #[allow(unused_variables)] window: tauri::Window,
) -> Result<Vec<WindowElement>, ()> {
    // 获取所有窗口，简单筛选下需要的窗口，然后获取窗口所有元素
    let windows = Window::all().unwrap_or_default();

    #[cfg(target_os = "macos")]
    let window_size_scale: f32;
    #[cfg(not(target_os = "macos"))]
    let window_size_scale = 1.0f32;

    #[cfg(target_os = "macos")]
    {
        // macOS 下窗口基于逻辑像素，这里统一转为物理像素
        window_size_scale = window.scale_factor().unwrap_or(1.0) as f32;
    }

    let mut rect_list = Vec::new();
    for window in windows {
        #[cfg(target_os = "macos")]
        let cf_dict = match window.window_cf_dictionary() {
            Ok(cf_dict) => cf_dict,
            Err(_) => continue,
        };

        #[cfg(target_os = "windows")]
        {
            if window.is_minimized().unwrap_or(true) {
                continue;
            }
        }

        #[cfg(target_os = "macos")]
        {
            if xcap::ImplWindow::is_minimized_by_cf_dictionary(cf_dict.as_ref()).unwrap_or(true) {
                continue;
            }
        }

        let window_title;
        #[cfg(target_os = "windows")]
        {
            window_title = window.title().unwrap_or_default();
        }
        #[cfg(target_os = "macos")]
        {
            window_title = match xcap::ImplWindow::title_by_cf_dictionary(cf_dict.as_ref()) {
                Ok(title) => title,
                Err(_) => continue,
            };
        }

        let window_rect: ElementRect;
        let window_id: u32;
        let x: i32;
        let y: i32;
        let width: i32;
        let height: i32;

        #[cfg(target_os = "windows")]
        {
            if window_title.eq("Shell Handwriting Canvas") {
                continue;
            }

            x = match window.x() {
                Ok(x) => x,
                Err(_) => continue,
            };

            y = match window.y() {
                Ok(y) => y,
                Err(_) => continue,
            };

            width = match window.width() {
                Ok(width) => width as i32,
                Err(_) => continue,
            };
            height = match window.height() {
                Ok(height) => height as i32,
                Err(_) => continue,
            };
        }

        #[cfg(target_os = "macos")]
        {
            let cg_rect = match xcap::ImplWindow::cg_rect_by_cf_dictionary(cf_dict.as_ref()) {
                Ok(window_rect) => window_rect,
                Err(_) => continue,
            };

            x = cg_rect.origin.x as i32;
            y = cg_rect.origin.y as i32;
            width = cg_rect.size.width as i32;
            height = cg_rect.size.height as i32;
        }

        window_id = match window.id() {
            Ok(id) => id,
            Err(_) => continue,
        };

        window_rect = ElementRect {
            min_x: x,
            min_y: y,
            max_x: x + width,
            max_y: y + height,
        };

        #[cfg(target_os = "macos")]
        {
            if window_title.eq("Dock") {
                continue;
            }
        }

        rect_list.push(WindowElement {
            element_rect: window_rect.scale(window_size_scale),
            window_id,
        });
    }

    Ok(rect_list)
}

pub async fn switch_always_on_top(#[allow(unused_variables)] window_id: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        if window_id == 0 {
            return false;
        }

        let window_list = Window::all().unwrap_or_default();
        let window = window_list
            .iter()
            .find(|w| w.id().unwrap_or(0) == window_id);

        let window = match window {
            Some(window) => window,
            None => return false,
        };

        let window_hwnd = window.hwnd();

        let window_hwnd = match window_hwnd {
            Ok(hwnd) => hwnd,
            Err(_) => return false,
        };

        snow_shot_app_os::utils::switch_always_on_top(window_hwnd);
    }

    #[cfg(target_os = "linux")]
    {
        snow_shot_app_os::utils::switch_always_on_top();
    }

    #[cfg(target_os = "macos")]
    {
        snow_shot_app_os::utils::switch_always_on_top();
    }

    true
}

pub async fn get_element_from_position(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
    window: tauri::Window,
    mouse_x: i32,
    mouse_y: i32,
) -> Result<Vec<ElementRect>, ()> {
    let mut ui_elements = ui_elements.lock().await;

    let element_rect_list =
        match ui_elements.get_element_from_point_walker(mouse_x, mouse_y, &|| {
            let _ = window.emit("ui-automation-try-focus", ());
        }) {
            Ok(element_rect) => element_rect,
            Err(_) => {
                return Err(());
            }
        };

    Ok(element_rect_list)
}

pub async fn get_mouse_position(app: tauri::AppHandle) -> Result<(i32, i32), String> {
    snow_shot_app_utils::get_mouse_position(&app)
}

pub async fn create_draw_window(app: tauri::AppHandle) {
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        format!(
            "draw-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
        ),
        tauri::WebviewUrl::App(format!("/draw").into()),
    )
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .fullscreen(false)
    .title("Snow Shot - Draw")
    .center()
    .decorations(false)
    .shadow(false)
    .transparent(true)
    .skip_taskbar(true)
    .maximizable(false)
    .minimizable(false)
    .resizable(false)
    .inner_size(1.0, 1.0)
    .visible(false)
    .focused(false)
    .build()
    .unwrap();

    window.hide().unwrap();
}

pub async fn set_draw_window_style(window: tauri::Window) {
    snow_shot_app_os::utils::set_draw_window_style(window);
}
