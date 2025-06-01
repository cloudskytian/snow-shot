#[cfg(target_os = "windows")]
#[path = "./ui_automation/windows.rs"]
pub mod ui_automation;
#[cfg(target_os = "windows")]
#[path = "./utils/windows.rs"]
pub mod utils;
#[cfg(target_os = "windows")]
#[path = "./free_drag/windows.rs"]
pub mod free_drag;

// #[cfg(target_os = "linux")]
// #[path = "./linux.rs"]
// pub mod ui_automation;

// #[cfg(target_os = "macos")]
// #[path = "./macos.rs"]
// pub mod ui_automation;

use serde::Serialize;
use std::hash::Hash;

#[derive(PartialEq, Serialize, Clone, Debug)]
pub struct ElementInfo {
    pub rect_list: Vec<ElementRect>,
}

#[derive(PartialEq, Eq, Serialize, Clone, Debug, Copy, Hash)]
pub struct ElementRect {
    pub min_x: i32,
    pub min_y: i32,
    pub max_x: i32,
    pub max_y: i32,
}

impl ElementRect {
    pub fn equals(&self, min_x: i32, min_y: i32, max_x: i32, max_y: i32) -> bool {
        self.min_x == min_x && self.min_y == min_y && self.max_x == max_x && self.max_y == max_y
    }

    pub fn clip_rect(&self, rect: &ElementRect) -> ElementRect {
        ElementRect {
            min_x: self.min_x.max(rect.min_x),
            min_y: self.min_y.max(rect.min_y),
            max_x: self.max_x.min(rect.max_x),
            max_y: self.max_y.min(rect.max_y),
        }
    }
}

impl From<uiautomation::types::Rect> for ElementRect {
    fn from(rect: uiautomation::types::Rect) -> Self {
        ElementRect {
            min_x: rect.get_left(),
            min_y: rect.get_top(),
            max_x: rect.get_right(),
            max_y: rect.get_bottom(),
        }
    }
}
