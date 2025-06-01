use std::cmp::Ordering;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::mem;

use crate::app_error::AutomationError;
use atree::Arena;
use atree::Token;
use rtree_rs::{RTree, Rect};
use uiautomation::UIAutomation;
use uiautomation::UIElement;
use uiautomation::UITreeWalker;
use uiautomation::types::Handle;
use uiautomation::types::Point;
use windows::Win32::Foundation::HWND;

use super::ElementRect;

/**
 * 元素层级
 */
#[derive(Debug, Clone, PartialEq, Eq, Hash, Copy, PartialOrd)]
pub struct ElementLevel {
    /**
     * 遍历时，首先获得层级最高的元素
     * 同级元素，index 越高，层级越低
     */
    pub element_index: i32,
    /**
     * 元素层级
     */
    pub element_level: i32,
    /**
     * 父元素索引
     */
    pub parent_index: i32,
    /**
     * 窗口索引
     */
    pub window_index: i32,
}

impl ElementLevel {
    pub fn min() -> Self {
        Self {
            element_index: 0,
            element_level: 0,
            parent_index: 0,
            window_index: i32::MAX,
        }
    }

    pub fn next_level(&mut self) {
        self.element_level += 1;
        self.element_index = 0;
        self.parent_index = 0;
    }

    pub fn next_element(&mut self) {
        self.element_index += 1;
    }
}

impl Ord for ElementLevel {
    fn cmp(&self, other: &Self) -> Ordering {
        // 先窗口索引排序，窗口索引小的优先级越高
        if self.window_index != other.window_index {
            return other.window_index.cmp(&self.window_index);
        }

        // 元素层级排序，层级高的优先级越高
        if self.element_level != other.element_level {
            return self.element_level.cmp(&other.element_level);
        }

        // 元素索引排序，索引小的优先级越高
        if self.element_index != other.element_index {
            return other.element_index.cmp(&self.element_index);
        }

        // 父元素索引排序，索引大的优先级越高
        other.parent_index.cmp(&self.parent_index)
    }
}

pub struct UIElements {
    automation: Option<UIAutomation>,
    automation_walker: Option<UITreeWalker>,
    root_element: Option<UIElement>,
    element_cache: RTree<2, i32, ElementLevel>,
    element_level_map: HashMap<ElementLevel, (UIElement, Token)>,
    element_rect_tree: Arena<uiautomation::types::Rect>,
    init_window: Option<UIElement>,
    init_window_runtime_id: Option<Vec<i32>>,
    monitor_rect: ElementRect,
}

unsafe impl Send for UIElements {}
unsafe impl Sync for UIElements {}

impl UIElements {
    pub fn new() -> Self {
        Self {
            automation: None,
            automation_walker: None,
            root_element: None,
            init_window: None,
            init_window_runtime_id: None,
            element_rect_tree: Arena::new(),
            element_cache: RTree::new(),
            element_level_map: HashMap::new(),
            monitor_rect: ElementRect {
                min_x: 0,
                min_y: 0,
                max_x: 0,
                max_y: 0,
            },
        }
    }

    pub fn init(&mut self, hwnd: Option<HWND>) -> Result<(), AutomationError> {
        if self.automation.is_some() && self.automation_walker.is_some() {
            return Ok(());
        }

        let automation = UIAutomation::new()?;
        let automation_walker = automation.get_raw_view_walker()?;
        let root_element = automation.get_root_element()?;

        if let Some(hwnd) = hwnd {
            let init_window = automation.element_from_handle(Handle::from(hwnd))?;
            let init_window_runtime_id = init_window.get_runtime_id()?;

            self.init_window = Some(init_window);
            self.init_window_runtime_id = Some(init_window_runtime_id);
        }
        self.automation = Some(automation);
        self.automation_walker = Some(automation_walker);
        self.root_element = Some(root_element);

        Ok(())
    }

    pub fn convert_element_rect_to_rtree_rect(rect: uiautomation::types::Rect) -> Rect<2, i32> {
        Rect::new(
            [rect.get_left(), rect.get_top()],
            [rect.get_right(), rect.get_bottom()],
        )
    }

    pub fn clip_rect(
        rect: uiautomation::types::Rect,
        parent_rect: uiautomation::types::Rect,
    ) -> uiautomation::types::Rect {
        // 当前矩形的数据不可信，做个纠正
        let mut rect_left = rect.get_left();
        let mut rect_top = rect.get_top();
        let mut rect_right = rect.get_right();
        let mut rect_bottom = rect.get_bottom();

        if rect_left > rect_right {
            mem::swap(&mut rect_left, &mut rect_right);
        }

        if rect_top > rect_bottom {
            mem::swap(&mut rect_top, &mut rect_bottom);
        }

        uiautomation::types::Rect::new(
            rect_left.max(parent_rect.get_left()),
            rect_top.max(parent_rect.get_top()),
            rect_right.min(parent_rect.get_right()),
            rect_bottom.min(parent_rect.get_bottom()),
        )
    }

    /**
     * 初始化窗口元素缓存
     */
    pub fn init_cache(&mut self, monitor_rect: ElementRect) -> Result<(), AutomationError> {
        self.monitor_rect = monitor_rect;

        let automation_walker = self.automation_walker.clone().unwrap();
        let root_element = self.root_element.clone().unwrap();

        self.element_cache = RTree::new();
        self.element_level_map = HashMap::new();
        self.element_rect_tree = Arena::new();

        // 桌面的窗口索引应该是最高，因为其优先级最低
        let mut current_level = ElementLevel::min();
        let root_element_rect = uiautomation::types::Rect::new(
            self.monitor_rect.min_x,
            self.monitor_rect.min_y,
            self.monitor_rect.max_x,
            self.monitor_rect.max_y,
        );

        let root_tree_token = self.element_rect_tree.new_node(root_element_rect);
        let (parent_rtree_rect, parent_tree_token) = self.insert_element_cache(
            root_element.clone(),
            root_element_rect,
            current_level,
            uiautomation::types::Rect::new(
                self.monitor_rect.min_x - self.monitor_rect.min_x,
                self.monitor_rect.min_y - self.monitor_rect.min_y,
                self.monitor_rect.max_x - self.monitor_rect.min_x,
                self.monitor_rect.max_y - self.monitor_rect.min_y,
            ),
            root_tree_token,
        );

        if let Ok(mut current_child) = automation_walker.get_first_child(&root_element) {
            if current_child
                .get_name()
                .unwrap_or_default()
                .eq("Shell Handwriting Canvas")
            {
                current_child = match automation_walker.get_next_sibling(&current_child) {
                    Ok(sibling) => sibling,
                    Err(_) => return Ok(()),
                };
            }

            if let Some(init_window_runtime_id) = self.init_window_runtime_id.as_ref() {
                if current_child.get_runtime_id()?.eq(init_window_runtime_id) {
                    current_child = match automation_walker.get_next_sibling(&current_child) {
                        Ok(sibling) => sibling,
                        Err(_) => return Ok(()),
                    };
                }
            }

            current_level.window_index = 0;
            current_level.next_element();

            self.insert_element_cache(
                current_child.clone(),
                current_child.get_bounding_rectangle()?,
                current_level,
                parent_rtree_rect,
                parent_tree_token,
            );
            while let Ok(sibling) = automation_walker.get_next_sibling(&current_child) {
                if sibling
                    .get_name()
                    .unwrap_or_default()
                    .eq("Shell Handwriting Canvas")
                {
                    current_child = sibling;
                    continue;
                }

                if let Some(init_window_runtime_id) = self.init_window_runtime_id.as_ref() {
                    if sibling.get_runtime_id()?.eq(init_window_runtime_id) {
                        current_child = sibling;
                        continue;
                    }
                }

                current_level.window_index += 1;
                current_level.next_element();

                self.insert_element_cache(
                    sibling.clone(),
                    sibling.get_bounding_rectangle()?,
                    current_level,
                    parent_rtree_rect,
                    parent_tree_token,
                );

                current_child = sibling;
            }
        }

        Ok(())
    }

    pub fn get_element_from_point(
        &self,
        mouse_x: i32,
        mouse_y: i32,
    ) -> Result<Option<ElementRect>, AutomationError> {
        let automation = match self.automation.as_ref() {
            Some(automation) => automation,
            None => return Ok(None),
        };

        let element = automation.element_from_point(Point::new(mouse_x, mouse_y))?;
        let rect = element.get_bounding_rectangle()?;

        Ok(Some(ElementRect {
            min_x: rect.get_left(),
            min_y: rect.get_top(),
            max_x: rect.get_right(),
            max_y: rect.get_bottom(),
        }))
    }

    pub fn insert_element_cache(
        &mut self,
        element: UIElement,
        element_rect: uiautomation::types::Rect,
        element_level: ElementLevel,
        parent_element_rect: uiautomation::types::Rect,
        parent_tree_token: Token,
    ) -> (uiautomation::types::Rect, Token) {
        let element_rect = uiautomation::types::Rect::new(
            element_rect.get_left() - self.monitor_rect.min_x,
            element_rect.get_top() - self.monitor_rect.min_y,
            element_rect.get_right() - self.monitor_rect.min_x,
            element_rect.get_bottom() - self.monitor_rect.min_y,
        );

        let element_rect = Self::clip_rect(element_rect, parent_element_rect);
        self.element_cache.insert(
            Self::convert_element_rect_to_rtree_rect(element_rect),
            element_level,
        );

        let current_node = self.element_rect_tree.new_node(element_rect);
        parent_tree_token
            .append_node(&mut self.element_rect_tree, current_node)
            .unwrap();
        self.element_level_map
            .insert(element_level, (element, current_node));

        (element_rect, current_node)
    }

    fn get_element_from_cache(
        &self,
        mouse_x: i32,
        mouse_y: i32,
    ) -> Option<(UIElement, ElementLevel, uiautomation::types::Rect, Token)> {
        let element_rect = self
            .element_cache
            .search(Rect::new_point([mouse_x, mouse_y]));

        // 获取层级最高的元素
        let mut max_level = ElementLevel::min();
        let mut max_level_rect = None;
        for rect in element_rect {
            if max_level.cmp(&rect.data) == Ordering::Less {
                max_level = rect.data.clone();
                max_level_rect = Some(rect.rect);
            }
        }
        let element_rtree_rect = match max_level_rect {
            Some(rect) => {
                uiautomation::types::Rect::new(rect.min[0], rect.min[1], rect.max[0], rect.max[1])
            }
            None => return None,
        };

        match self.element_level_map.get(&max_level) {
            Some((element, token)) => {
                Some((element.clone(), max_level, element_rtree_rect, *token))
            }
            None => None,
        }
    }

    /**
     * 获取所有可选区域
     */
    pub fn get_element_from_point_walker(
        &mut self,
        mouse_x: i32,
        mouse_y: i32,
    ) -> Result<Vec<ElementRect>, AutomationError> {
        let automation_walker = self.automation_walker.clone().unwrap();
        let (parent_element, mut current_level, mut parent_rect, mut parent_tree_token) = match self
            .get_element_from_cache(
                mouse_x - self.monitor_rect.min_x,
                mouse_y - self.monitor_rect.min_y,
            ) {
            Some(element) => element,
            None => (
                self.root_element.clone().unwrap(),
                ElementLevel::min(),
                uiautomation::types::Rect::new(0, 0, i32::MAX, i32::MAX),
                self.element_rect_tree
                    .new_node(uiautomation::types::Rect::new(0, 0, i32::MAX, i32::MAX)),
            ),
        };

        // 父元素必然命中了 mouse position，所以直接取第一个元素
        let mut queue = VecDeque::with_capacity(128);
        match automation_walker.get_first_child(&parent_element) {
            Ok(element) => {
                queue.push_back(element);
                current_level.next_level();
            }
            Err(_) => {}
        };

        let mut current_element_rect = parent_rect;
        let mut current_element_token = parent_tree_token;
        let mut result_token = current_element_token;
        let mut result_rect = current_element_rect;

        while let Some(current_element) = queue.pop_front() {
            current_element_rect = match current_element.get_bounding_rectangle() {
                Ok(rect) => rect,
                Err(_) => continue,
            };

            let current_element_left = current_element_rect.get_left();
            let current_element_right = current_element_rect.get_right();
            let current_element_top = current_element_rect.get_top();
            let current_element_bottom = current_element_rect.get_bottom();

            if !(current_element_left == 0
                && current_element_right == 0
                && current_element_top == 0
                && current_element_bottom == 0)
            {
                (current_element_rect, current_element_token) = self.insert_element_cache(
                    current_element.clone(),
                    current_element_rect,
                    current_level,
                    parent_rect,
                    parent_tree_token,
                );

                if current_element_left <= mouse_x
                    && current_element_right >= mouse_x
                    && current_element_top <= mouse_y
                    && current_element_bottom >= mouse_y
                {
                    result_token = current_element_token;
                    result_rect = current_element_rect;

                    let first_child = automation_walker.get_first_child(&current_element);
                    if let Ok(child) = first_child {
                        queue.push_back(child);
                        current_level.next_level();
                        parent_rect = current_element_rect;
                        parent_tree_token = current_element_token;

                        continue;
                    }
                }
            }

            let next_sibling = automation_walker.get_next_sibling(&current_element);
            if let Ok(sibling) = next_sibling {
                queue.push_back(sibling);
                current_level.next_element();
            }
        }

        let element_ancestors = result_token.ancestors(&self.element_rect_tree);
        let mut result_rect_list = Vec::with_capacity(16);
        let mut previous_rect = ElementRect::from(result_rect);
        result_rect_list.push(previous_rect);
        for node in element_ancestors {
            let current_rect = ElementRect::from(node.data);
            if current_rect == previous_rect {
                continue;
            }

            if current_rect.min_x == previous_rect.max_x
                || current_rect.min_y == previous_rect.max_y
                || current_rect.min_x > previous_rect.max_x
                || current_rect.min_y > previous_rect.max_y
            {
                continue;
            }

            result_rect_list.push(current_rect);
            previous_rect = current_rect;
        }

        return Ok(result_rect_list);
    }
}

impl Drop for UIElements {
    fn drop(&mut self) {
        // 清理资源
        self.automation = None;
        self.automation_walker = None;
        self.root_element = None;
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use device_query::{DeviceEvents, DeviceEventsHandler};
    use uiautomation::types::Point;

    use super::*;

    #[test]
    fn test_get_element_from_point() {
        let device_state = DeviceEventsHandler::new(Duration::from_millis(1000 / 60))
            .expect("Failed to start event loop");

        // Register a key down event callback
        // The guard is used to keep the callback alive
        let _guard = device_state.on_mouse_move(|position| {
            let (mouse_x, mouse_y) = position;

            let automation = UIAutomation::new().unwrap();
            let element = match automation.element_from_point(Point::new(*mouse_x, *mouse_y)) {
                Ok(element) => element,
                Err(_) => return,
            };

            let rect = match element.get_bounding_rectangle() {
                Ok(rect) => rect,
                Err(_) => return,
            };

            println!(
                "element: left {}, top {}, width {}, height {}",
                rect.get_left(),
                rect.get_top(),
                rect.get_width(),
                rect.get_height()
            );
        });

        loop {}
    }
}
