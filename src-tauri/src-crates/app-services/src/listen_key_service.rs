use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};

use device_query::Keycode;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Window};

use crate::device_event_handler_service::DeviceEventHandlerService;

pub struct ListenKeyService {
    _key_down_guard: Arc<Mutex<Option<Box<dyn std::any::Any + Send>>>>,
    _key_up_guard: Arc<Mutex<Option<Box<dyn std::any::Any + Send>>>>,
    window_label_set: Arc<Mutex<HashSet<String>>>,
}

#[derive(Serialize, Clone)]
pub struct ListenKeyDownEvent {
    key: usize,
}

#[derive(Serialize, Clone)]
pub struct ListenKeyUpEvent {
    key: usize,
}

impl ListenKeyService {
    pub fn new() -> Self {
        return Self {
            _key_down_guard: Arc::new(Mutex::new(None)),
            _key_up_guard: Arc::new(Mutex::new(None)),
            window_label_set: Arc::new(Mutex::new(HashSet::new())),
        };
    }

    pub fn start(
        &mut self,
        app_handle: AppHandle,
        window: Window,
        device_event_handler: &mut DeviceEventHandlerService,
    ) -> Result<(), String> {
        let mut window_label_set_lock = match self.window_label_set.lock() {
            Ok(guard) => guard,
            Err(err) => {
                return Err(format!(
                    "[ListenKeyService::start] Failed to lock window_label_set: {}",
                    err
                ));
            }
        };
        window_label_set_lock.insert(window.label().to_owned());

        let mut key_down_guard_lock = match self._key_down_guard.lock() {
            Ok(guard) => guard,
            Err(err) => {
                return Err(format!(
                    "[ListenKeyService::start] Failed to lock key_down_guard: {}",
                    err
                ));
            }
        };

        if key_down_guard_lock.is_none() {
            let key_down_app_handle = app_handle.clone();
            *key_down_guard_lock = Some(Box::new(device_event_handler.on_key_down(
                move |key: &Keycode| {
                    match key_down_app_handle.emit(
                        "listen-key-service:key-down",
                        ListenKeyDownEvent { key: *key as usize },
                    ) {
                        Ok(_) => {}
                        Err(_) => {
                            log::error!(
                                "[ListenKeyService::on_key_down] Failed to emit listen-key-service"
                            );
                        }
                    };
                },
            )?));
        }

        let mut key_up_guard_lock = match self._key_up_guard.lock() {
            Ok(guard) => guard,
            Err(err) => {
                return Err(format!(
                    "[ListenKeyService::start] Failed to lock key_up_guard: {}",
                    err
                ));
            }
        };

        // macOS 部分键如 Shift 等， key up 在鼠标移动后会触发，无法保持按下状态
        if key_up_guard_lock.is_none() {
            let key_up_app_handle = app_handle.clone();
            *key_up_guard_lock = Some(Box::new(device_event_handler.on_key_up(
                move |key: &Keycode| {
                    match key_up_app_handle.emit(
                        "listen-key-service:key-up",
                        ListenKeyUpEvent { key: *key as usize },
                    ) {
                        Ok(_) => {}
                        Err(_) => {
                            log::error!(
                                "[ListenKeyService::on_key_up] Failed to emit listen-key-service"
                            );
                        }
                    };
                },
            )?));
        }

        Ok(())
    }

    pub fn stop_core(
        key_down_guard: &Arc<Mutex<Option<Box<dyn std::any::Any + Send>>>>,
        key_up_guard: &Arc<Mutex<Option<Box<dyn std::any::Any + Send>>>>,
        window_label_set: &Arc<Mutex<HashSet<String>>>,
        window_label: &str,
    ) -> Result<(), String> {
        let mut window_label_set_lock = match window_label_set.lock() {
            Ok(guard) => guard,
            Err(err) => {
                return Err(format!(
                    "[ListenKeyService::stop_core] Failed to lock window_label_set: {}",
                    err
                ));
            }
        };
        window_label_set_lock.remove(window_label);

        if !window_label_set_lock.is_empty() {
            return Ok(());
        }

        // 没有窗口监听了，清除监听
        let mut key_down_guard_lock = match key_down_guard.lock() {
            Ok(guard) => guard,
            Err(err) => {
                return Err(format!(
                    "[ListenKeyService::stop_core] Failed to lock key_down_guard: {}",
                    err
                ));
            }
        };
        *key_down_guard_lock = None;

        let mut key_up_guard_lock = match key_up_guard.lock() {
            Ok(guard) => guard,
            Err(err) => {
                return Err(format!(
                    "[ListenKeyService::stop_core] Failed to lock key_up_guard: {}",
                    err
                ));
            }
        };
        *key_up_guard_lock = None;

        Ok(())
    }

    pub fn stop_by_window_label(&mut self, window_label: &str) -> Result<(), String> {
        Self::stop_core(
            &self._key_down_guard,
            &self._key_up_guard,
            &self.window_label_set,
            window_label,
        )
    }
}
