use windows::{
    Win32::{Foundation::*, UI::WindowsAndMessaging::*},
    core::*,
};

pub struct WindowState {
    pub in_movesize_loop: bool,
    pub inhibit_movesize_loop: bool,
    pub old_window_proc: WNDPROC,
}

#[derive(Debug)]
pub enum MessageResult {
    Handled(LRESULT),
    Default,
}

// 窗口过程函数
pub unsafe extern "system" fn window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    unsafe {
        // 获取窗口状态
        let state = match get_window_state(hwnd) {
            Ok(state) => state,
            Err(_) => {
                return DefWindowProcW(hwnd, msg, wparam, lparam);
            }
        };

        // 处理消息
        let result = match msg {
            WM_ENTERSIZEMOVE => {
                state.in_movesize_loop = true;
                state.inhibit_movesize_loop = false;
                MessageResult::Handled(LRESULT(0))
            }

            WM_EXITSIZEMOVE => {
                state.in_movesize_loop = false;
                state.inhibit_movesize_loop = false;
                MessageResult::Handled(LRESULT(0))
            }

            WM_CAPTURECHANGED => {
                state.inhibit_movesize_loop = state.in_movesize_loop;
                MessageResult::Handled(LRESULT(0))
            }

            WM_WINDOWPOSCHANGING => {
                if state.inhibit_movesize_loop {
                    let wp = lparam.0 as *mut WINDOWPOS;
                    if wp.is_null() {
                        MessageResult::Default
                    } else {
                        (*wp).flags |= SWP_NOMOVE;
                        MessageResult::Handled(LRESULT(0))
                    }
                } else {
                    MessageResult::Default
                }
            }

            _ => MessageResult::Default,
        };

        // 处理结果
        match result {
            MessageResult::Handled(result) => result,
            MessageResult::Default => {
                if let Some(old_proc) = state.old_window_proc {
                    old_proc(hwnd, msg, wparam, lparam)
                } else {
                    DefWindowProcW(hwnd, msg, wparam, lparam)
                }
            }
        }
    }
}

// 获取窗口状态的辅助函数
fn get_window_state(hwnd: HWND) -> Result<&'static mut WindowState> {
    unsafe {
        SetLastError(WIN32_ERROR(0));
        let existing_state_val = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        let get_last_error = GetLastError();

        if existing_state_val == 0 && get_last_error != WIN32_ERROR(0) {
            return Err(Error::from(get_last_error));
        }

        let existing_state_ptr = existing_state_val as *mut WindowState;

        if existing_state_ptr.is_null() {
            let state_box = Box::new(WindowState {
                in_movesize_loop: false,
                inhibit_movesize_loop: false,
                old_window_proc: None, // 初始化为 None
            });
            let new_state_raw_ptr = Box::into_raw(state_box);

            SetLastError(WIN32_ERROR(0));
            let prev_val_on_set =
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, new_state_raw_ptr as isize);
            let set_last_error = GetLastError();

            if prev_val_on_set == 0 && set_last_error != WIN32_ERROR(0) {
                let _ = Box::from_raw(new_state_raw_ptr); // 清理已分配的 state_box
                return Err(Error::from(set_last_error));
            }
            Ok(&mut *new_state_raw_ptr)
        } else {
            Ok(&mut *existing_state_ptr)
        }
    }
}

pub fn set_window_proc(hwnd: HWND) -> Result<()> {
    unsafe {
        let state = match get_window_state(hwnd) {
            Ok(s) => s,
            Err(e) => {
                return Err(e);
            }
        };

        let current_wnd_proc_ptr = GetWindowLongPtrW(hwnd, GWLP_WNDPROC);
        if current_wnd_proc_ptr == window_proc as isize {
            return Ok(());
        }

        SetLastError(WIN32_ERROR(0));
        let old_proc_val = SetWindowLongPtrW(hwnd, GWLP_WNDPROC, window_proc as isize);

        if old_proc_val == 0 {
            let last_error = GetLastError();
            if last_error != WIN32_ERROR(0) {
                return Err(Error::from(last_error));
            }
        }
        state.old_window_proc = std::mem::transmute(old_proc_val);

        Ok(())
    }
}

// 清理窗口状态的函数
pub fn remove_window_proc(hwnd: HWND) -> Result<()> {
    unsafe {
        let state_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut WindowState;
        if state_ptr.is_null() {
            return Ok(());
        }

        let state = Box::from_raw(state_ptr);

        if let Some(old_proc_ptr) = state.old_window_proc {
            SetWindowLongPtrW(hwnd, GWLP_WNDPROC, old_proc_ptr as isize);
        }

        if SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0) == 0 {
            return Err(Error::from_win32());
        }

        Ok(())
    }
}
