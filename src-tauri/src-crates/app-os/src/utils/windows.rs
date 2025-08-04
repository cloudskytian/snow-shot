use std::ffi::c_void;

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    GWL_EXSTYLE, GetWindowLongPtrW, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
    SetWindowPos, WS_EX_TOPMOST,
};

pub fn switch_always_on_top(hwnd: *mut c_void) -> bool {
    let hwnd = HWND(hwnd);

    // 获取窗口的扩展样式
    let ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };

    // 检查窗口是否已经置顶
    let is_topmost = (ex_style & WS_EX_TOPMOST.0 as isize) != 0;

    // 根据当前状态切换置顶
    let result = unsafe {
        SetWindowPos(
            hwnd,
            if is_topmost {
                Some(HWND_NOTOPMOST)
            } else {
                Some(HWND_TOPMOST)
            },
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE,
        )
    };

    result.is_ok()
}

pub fn set_draw_window_style(#[allow(unused_variables)] window: tauri::Window) {
    // 暂时不处理，保留下函数占位

    // let window_hwnd = window.hwnd();

    // if let Ok(hwnd) = window_hwnd {
    //     // 设置窗口样式为0x96000000
    //     let new_style = -1778384896;
    //     unsafe { SetWindowLongW(hwnd, GWL_STYLE, new_style) };
    // }
}

pub fn get_focused_window() -> HWND {
    unsafe { GetForegroundWindow() }
}
