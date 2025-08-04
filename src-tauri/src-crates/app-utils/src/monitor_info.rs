use rayon::iter::{IntoParallelRefIterator, ParallelIterator};
use snow_shot_app_shared::ElementRect;
use xcap::Monitor;

#[derive(Debug)]
pub struct MonitorInfo {
    monitor: Monitor,
    rect: ElementRect,
}

impl MonitorInfo {
    pub fn new(monitor: &Monitor) -> Self {
        let monitor_rect = monitor.get_dev_mode_w().unwrap();

        MonitorInfo {
            monitor: monitor.clone(),
            rect: ElementRect {
                min_x: unsafe { monitor_rect.Anonymous1.Anonymous2.dmPosition.x },
                min_y: unsafe { monitor_rect.Anonymous1.Anonymous2.dmPosition.y },
                max_x: unsafe {
                    monitor_rect.Anonymous1.Anonymous2.dmPosition.x
                        + monitor_rect.dmPelsWidth as i32
                },
                max_y: unsafe {
                    monitor_rect.Anonymous1.Anonymous2.dmPosition.y
                        + monitor_rect.dmPelsHeight as i32
                },
            },
        }
    }
}

#[derive(Debug)]
pub struct MonitorList(Vec<MonitorInfo>);

impl MonitorList {
    pub fn get() -> MonitorList {
        let monitors = Monitor::all().unwrap_or_default();

        let monitor_info_list = monitors
            .par_iter()
            .map(|monitor| MonitorInfo::new(monitor))
            .collect::<Vec<MonitorInfo>>();

        MonitorList(monitor_info_list)
    }

    /// 获取所有显示器的最小矩形
    pub fn get_monitors_bounding_box(&self) -> ElementRect {
        let monitors = &self.0;

        if monitors.is_empty() {
            return ElementRect {
                min_x: 0,
                min_y: 0,
                max_x: 0,
                max_y: 0,
            };
        }

        let mut min_x = i32::MAX;
        let mut min_y = i32::MAX;
        let mut max_x = i32::MIN;
        let mut max_y = i32::MIN;

        for monitor in monitors {
            if monitor.rect.min_x < min_x {
                min_x = monitor.rect.min_x;
            }
            if monitor.rect.min_y < min_y {
                min_y = monitor.rect.min_y;
            }
            if monitor.rect.max_x > max_x {
                max_x = monitor.rect.max_x;
            }
            if monitor.rect.max_y > max_y {
                max_y = monitor.rect.max_y;
            }
        }

        ElementRect {
            min_x,
            min_y,
            max_x,
            max_y,
        }
    }

    /// 捕获所有显示器，拼接为一个完整的图像
    pub fn capture(&self) -> image::DynamicImage {
        let monitors = &self.0;

        // 获取能容纳所有显示器的最小矩形
        let monitors_bounding_box = self.get_monitors_bounding_box();

        // 声明该图像，分配内存
        let mut capture_image = image::DynamicImage::new_rgba8(
            (monitors_bounding_box.max_x - monitors_bounding_box.min_x) as u32,
            (monitors_bounding_box.max_y - monitors_bounding_box.min_y) as u32,
        );

        // 将每个显示器截取的图像，绘制到该图像上
        let monitor_image_list = monitors
            .par_iter()
            .map(|monitor| {
                let image = monitor.monitor.capture_image();

                match image {
                    Ok(image) => Some(image),
                    Err(_) => {
                        log::warn!(
                            "[MonitorInfoList::capture] Failed to capture monitor image, monitor rect: {:?}",
                            monitor.rect
                        );

                        None
                    }
                }
            })
            .collect::<Vec<Option<image::RgbaImage>>>();

        // 将每个显示器的截图绘制到合并图像上
        for (index, monitor_image) in monitor_image_list.iter().enumerate() {
            if let Some(image) = monitor_image {
                let monitor = &monitors[index];

                // 计算显示器在合并图像中的位置
                let offset_x = (monitor.rect.min_x - monitors_bounding_box.min_x) as i64;
                let offset_y = (monitor.rect.min_y - monitors_bounding_box.min_y) as i64;

                // 将显示器图像绘制到合并图像上
                image::imageops::overlay(&mut capture_image, image, offset_x, offset_y);
            }
        }

        capture_image
    }

    pub fn monitor_rect_list(&self) -> Vec<ElementRect> {
        self.0.iter().map(|monitor| monitor.rect).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_all_monitors() {
        let monitors = MonitorList::get();
        println!("monitors: {:?}", monitors);
    }

    #[test]
    fn test_capture() {
        let instance = std::time::Instant::now();

        let monitors = MonitorList::get();
        let image = monitors.capture();

        image.save("./test_output/capture.webp").unwrap();

        println!("time: {:?}", instance.elapsed());
    }
}
