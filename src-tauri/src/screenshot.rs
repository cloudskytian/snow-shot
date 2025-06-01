use device_query::{DeviceQuery, DeviceState, MouseState};
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::codecs::webp::WebPEncoder;
use serde::Serialize;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::command;
use tauri::ipc::Response;
use xcap::{Monitor, Window};

use crate::os;
use crate::os::ElementRect;
use crate::os::ui_automation::UIElements;

pub fn get_device_mouse_position() -> (i32, i32) {
    let device_state = DeviceState::new();
    let mouse: MouseState = device_state.get_mouse();

    mouse.coords
}

pub fn get_target_monitor() -> (i32, i32, Monitor) {
    let (mouse_x, mouse_y) = get_device_mouse_position();
    let monitor = Monitor::from_point(mouse_x, mouse_y).unwrap();

    (mouse_x, mouse_y, monitor)
}

#[command]
pub async fn capture_current_monitor(encoder: String) -> Response {
    // 获取当前鼠标的位置
    let (_, _, monitor) = get_target_monitor();

    let image_buffer = monitor.capture_image().unwrap();

    // 前端处理渲染图片的方式有两种
    // 1. 接受 RGBA 数据通过 canvas 转为 base64 后显示
    // 2. 直接接受 png、jpg 文件格式的二进制数据
    // 所以无需将原始的 RGBA 数据返回给前端，直接在 rust 编码为指定格式返回前端
    // 前端也无需再转为 base64 显示

    // 编码为指定格式
    let mut buf = Vec::with_capacity(image_buffer.len() / 8);

    if encoder == "webp" {
        image_buffer
            .write_with_encoder(WebPEncoder::new_lossless(&mut buf))
            .unwrap();
    } else {
        image_buffer
            .write_with_encoder(PngEncoder::new_with_quality(
                &mut buf,
                CompressionType::Fast,
                FilterType::Adaptive,
            ))
            .unwrap();
    }

    return Response::new(buf);
}

#[command]
pub async fn init_ui_elements(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
    window: tauri::Window,
) -> Result<(), ()> {
    let mut ui_elements = match ui_elements.lock() {
        Ok(ui_elements) => ui_elements,
        Err(_) => return Err(()),
    };

    match ui_elements.init(match window.hwnd() {
        Ok(hwnd) => Some(hwnd),
        Err(_) => None,
    }) {
        Ok(_) => Ok(()),
        Err(_) => Err(()),
    }
}

#[command]
pub async fn init_ui_elements_cache(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
) -> Result<(), ()> {
    // 获取当前鼠标的位置
    let (mouse_x, mouse_y) = get_device_mouse_position();

    let mut ui_elements = match ui_elements.lock() {
        Ok(ui_elements) => ui_elements,
        Err(_) => return Err(()),
    };

    // 多显示器时会获取错误
    // 临时用显示器坐标做个转换，后面兼容跨屏截图时取消
    let (_, _, monitor) = get_target_monitor();
    let monitor_x = monitor.x().unwrap_or(0);
    let monitor_y = monitor.y().unwrap_or(0);
    let monitor_width = monitor.width().unwrap_or(0) as i32;
    let monitor_height = monitor.height().unwrap_or(0) as i32;

    match ui_elements.init_cache(ElementRect {
        min_x: monitor_x,
        min_y: monitor_y,
        max_x: monitor_x + monitor_width,
        max_y: monitor_y + monitor_height,
    }) {
        Ok(_) => (),
        Err(_) => return Err(()),
    }

    // 用当前鼠标位置初始化下
    match ui_elements.get_element_from_point_walker(mouse_x, mouse_y) {
        Ok(_) => (),
        Err(_) => return Err(()),
    }

    Ok(())
}

#[derive(PartialEq, Eq, Serialize, Clone, Debug, Copy, Hash)]
pub struct WindowElement {
    element_rect: ElementRect,
    window_id: u32,
}

#[command]
pub async fn get_window_elements() -> Result<Vec<WindowElement>, ()> {
    // 获取当前鼠标的位置
    let device_state = DeviceState::new();
    let mouse: MouseState = device_state.get_mouse();
    let (mouse_x, mouse_y) = mouse.coords;

    let monitor = xcap::Monitor::from_point(mouse_x, mouse_y).unwrap();
    let monitor_min_x = monitor.x().unwrap_or(0);
    let monitor_min_y = monitor.y().unwrap_or(0);
    let monitor_max_x = monitor_min_x + monitor.width().unwrap_or(0) as i32;
    let monitor_max_y = monitor_min_y + monitor.height().unwrap_or(0) as i32;

    // 获取所有窗口，简单筛选下需要的窗口，然后获取窗口所有元素
    let windows = Window::all().unwrap_or_default();

    let mut rect_list = Vec::new();
    for window in windows {
        if window.is_minimized().unwrap_or(true) {
            continue;
        }

        if let Ok(title) = window.title() {
            if title.eq("Shell Handwriting Canvas") {
                continue;
            }
        }

        let x = match window.x() {
            Ok(x) => x,
            Err(_) => continue,
        };

        let y = match window.y() {
            Ok(y) => y,
            Err(_) => continue,
        };

        let width = match window.width() {
            Ok(width) => width,
            Err(_) => continue,
        };
        let height = match window.height() {
            Ok(height) => height,
            Err(_) => continue,
        };

        let window_id = match window.id() {
            Ok(id) => id,
            Err(_) => continue,
        };

        // 保留在屏幕内的窗口
        if !(x >= monitor_min_x && y >= monitor_min_y && x <= monitor_max_x && y <= monitor_max_y) {
            continue;
        }

        rect_list.push(WindowElement {
            element_rect: ElementRect {
                min_x: x - monitor_min_x,
                min_y: y - monitor_min_y,
                max_x: x + width as i32 - monitor_min_x,
                max_y: y + height as i32 - monitor_min_y,
            },
            window_id,
        });
    }

    Ok(rect_list)
}

#[command]
pub async fn switch_always_on_top(window_id: u32) -> bool {
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

    os::utils::switch_always_on_top(window_hwnd);

    true
}

#[command]
pub async fn get_element_from_position(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
    mouse_x: i32,
    mouse_y: i32,
) -> Result<Vec<ElementRect>, ()> {
    let mut ui_elements = ui_elements.lock().unwrap();
    let element_rect_list = match ui_elements.get_element_from_point_walker(mouse_x, mouse_y) {
        Ok(element_rect) => element_rect,
        Err(_) => {
            return Err(());
        }
    };

    Ok(element_rect_list)
}

#[command]
pub async fn get_mouse_position() -> Result<(i32, i32), ()> {
    let device_state = DeviceState::new();
    let mouse: MouseState = device_state.get_mouse();
    let (mouse_x, mouse_y) = mouse.coords;

    Ok((mouse_x, mouse_y))
}

#[command]
pub async fn create_draw_window(app: tauri::AppHandle) {
    tauri::WebviewWindowBuilder::new(
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
    .inner_size(0.0, 0.0)
    .build()
    .unwrap();
}

#[command]
pub async fn set_draw_window_style(window: tauri::Window) {
    os::utils::set_draw_window_style(window);
}
