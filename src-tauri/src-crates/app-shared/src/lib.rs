use enigo::Enigo;
use enigo::Settings;
use serde::Serialize;

pub struct EnigoManager {
    pub enigo: Enigo,
}

impl EnigoManager {
    pub fn new() -> Self {
        Self {
            enigo: Enigo::new(&Settings::default()).unwrap(),
        }
    }
}

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

    /// 检查两个 ElementRect 是否有重叠部分
    pub fn overlaps(&self, other: &ElementRect) -> bool {
        // 检查是否有重叠：一个矩形在另一个矩形的左边、右边、上边或下边时，它们不重叠
        !(self.max_x <= other.min_x
            || self.min_x >= other.max_x
            || self.max_y <= other.min_y
            || self.min_y >= other.max_y)
    }

    pub fn scale(&self, scale: f32) -> ElementRect {
        ElementRect {
            min_x: (self.min_x as f32 * scale) as i32,
            min_y: (self.min_y as f32 * scale) as i32,
            max_x: (self.max_x as f32 * scale) as i32,
            max_y: (self.max_y as f32 * scale) as i32,
        }
    }
}

#[cfg(target_os = "windows")]
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
