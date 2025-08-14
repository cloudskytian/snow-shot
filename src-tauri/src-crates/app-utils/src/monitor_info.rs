use rayon::iter::{IntoParallelRefIterator, ParallelIterator};
use snow_shot_app_shared::ElementRect;
use xcap::Monitor;

#[derive(Debug)]
pub struct MonitorInfo {
    pub monitor: Monitor,
    pub rect: ElementRect,
}

impl MonitorInfo {
    pub fn new(monitor: &Monitor) -> Self {
        let monitor_rect: ElementRect;

        #[cfg(target_os = "windows")]
        {
            let rect = monitor.get_dev_mode_w().unwrap();
            monitor_rect = ElementRect {
                min_x: unsafe { rect.Anonymous1.Anonymous2.dmPosition.x },
                min_y: unsafe { rect.Anonymous1.Anonymous2.dmPosition.y },
                max_x: unsafe { rect.Anonymous1.Anonymous2.dmPosition.x + rect.dmPelsWidth as i32 },
                max_y: unsafe {
                    rect.Anonymous1.Anonymous2.dmPosition.y + rect.dmPelsHeight as i32
                },
            }
        }

        #[cfg(target_os = "macos")]
        {
            let rect = monitor.bounds().unwrap();
            let monitor_scale_factor = monitor.scale_factor().unwrap_or(1.0) as f64;
            monitor_rect = ElementRect {
                min_x: (rect.origin.x * monitor_scale_factor) as i32,
                min_y: (rect.origin.y * monitor_scale_factor) as i32,
                max_x: ((rect.origin.x + rect.size.width) * monitor_scale_factor) as i32,
                max_y: ((rect.origin.y + rect.size.height) * monitor_scale_factor) as i32,
            }
        }

        MonitorInfo {
            monitor: monitor.clone(),
            rect: monitor_rect,
        }
    }

    pub fn get_monitor_crop_region(&self, crop_region: ElementRect) -> ElementRect {
        let monitor_crop_region = self.rect.clip_rect(&ElementRect {
            min_x: crop_region.min_x,
            min_y: crop_region.min_y,
            max_x: crop_region.max_x,
            max_y: crop_region.max_y,
        });

        ElementRect {
            min_x: monitor_crop_region.min_x - self.rect.min_x,
            min_y: monitor_crop_region.min_y - self.rect.min_y,
            max_x: monitor_crop_region.max_x - self.rect.min_x,
            max_y: monitor_crop_region.max_y - self.rect.min_y,
        }
    }
}

#[derive(Debug)]
pub struct MonitorList(Vec<MonitorInfo>);

impl MonitorList {
    fn get_monitors(region: Option<ElementRect>) -> MonitorList {
        let monitors = Monitor::all().unwrap_or_default();

        let region = region.unwrap_or(ElementRect {
            min_x: i32::MIN,
            min_y: i32::MIN,
            max_x: i32::MAX,
            max_y: i32::MAX,
        });

        let monitor_info_list = monitors
            .par_iter()
            .map(|monitor| MonitorInfo::new(monitor))
            .filter(|monitor| monitor.rect.overlaps(&region))
            .collect::<Vec<MonitorInfo>>();

        MonitorList(monitor_info_list)
    }

    pub fn all() -> MonitorList {
        Self::get_monitors(None)
    }

    pub fn get_by_region(region: ElementRect) -> MonitorList {
        Self::get_monitors(Some(region))
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
    ///
    /// @param crop_region 显示器的裁剪区域
    fn capture_core(
        &self,
        crop_region: Option<ElementRect>,
        exclude_window: Option<&tauri::Window>,
    ) -> Result<image::DynamicImage, String> {
        let monitors = &self.0;

        // 特殊情况，只有一个显示器，直接返回
        if monitors.len() == 1 {
            let first_monitor = monitors.first().unwrap();
            let capture_image = super::capture_target_monitor(
                &first_monitor.monitor,
                if let Some(crop_region) = crop_region {
                    Some(first_monitor.get_monitor_crop_region(crop_region))
                } else {
                    None
                },
                exclude_window,
            );

            // 有些捕获失败的显示器，返回一个空图像，这里需要特殊处理
            if capture_image.is_some() {
                let capture_image = capture_image.as_ref().unwrap();
                if capture_image.width() == 1 && capture_image.height() == 1 {
                    return Ok(image::DynamicImage::new_rgba8(
                        (first_monitor.rect.max_x - first_monitor.rect.min_x) as u32,
                        (first_monitor.rect.max_y - first_monitor.rect.min_y) as u32,
                    ));
                }
            }

            return match capture_image {
                Some(capture_image) => Ok(capture_image),
                None => {
                    return Err(format!(
                        "[MonitorInfoList::capture] Failed to capture monitor image, monitor rect: {:?}",
                        first_monitor.rect
                    ));
                }
            };
        }

        // 将每个显示器截取的图像，绘制到该图像上
        let monitor_image_list = monitors
            .par_iter()
            .filter(|monitor| monitor.rect.overlaps(&crop_region.unwrap_or(ElementRect {
                min_x: i32::MIN,
                min_y: i32::MIN,
                max_x: i32::MAX,
                max_y: i32::MAX,
            })))
            .map(|monitor| {
                let monitor_crop_region = if let Some(crop_region) = crop_region {
                    Some(monitor.get_monitor_crop_region(crop_region))
                } else {
                    None
                };

                let capture_image = super::capture_target_monitor(&monitor.monitor, monitor_crop_region, exclude_window);

                match capture_image {
                    Some(image) => Some((image, monitor_crop_region)),
                    None => {
                        log::warn!(
                            "[MonitorInfoList::capture] Failed to capture monitor image, monitor rect: {:?}",
                            monitor.rect
                        );

                        None
                    }
                }
            })
            .filter_map(|result| match result {
                Some((image, monitor_crop_region)) => Some((image, monitor_crop_region)),
                None => None,
            })
            .collect::<Vec<(image::DynamicImage, Option<ElementRect>)>>();

        if monitor_image_list.is_empty() {
            return Err(format!(
                "[MonitorInfoList::capture] Failed to capture monitor image, monitor_image_list is empty, crop_region: {:?}",
                crop_region
            ));
        }

        // 获取能容纳所有显示器的最小矩形
        let monitors_bounding_box = self.get_monitors_bounding_box();

        // 声明该图像，分配内存
        let mut capture_image = if let Some(crop_region) = crop_region {
            image::DynamicImage::new_rgba8(
                (crop_region.max_x - crop_region.min_x) as u32,
                (crop_region.max_y - crop_region.min_y) as u32,
            )
        } else {
            image::DynamicImage::new_rgba8(
                (monitors_bounding_box.max_x - monitors_bounding_box.min_x) as u32,
                (monitors_bounding_box.max_y - monitors_bounding_box.min_y) as u32,
            )
        };

        // 将每个显示器的截图绘制到合并图像上
        for (index, (monitor_image, monitor_crop_region)) in monitor_image_list.iter().enumerate() {
            let monitor = &monitors[index];

            // 计算显示器在合并图像中的位置
            let offset_x: i64;
            let offset_y: i64;

            if let Some(monitor_crop_region) = monitor_crop_region {
                let crop_region = crop_region.unwrap();

                // 将单个显示器的坐标转为整个显示器的坐标
                // 得到图像相对整个显示器的坐标后，再减去裁剪区域的坐标，得到图像相对裁剪区域的坐标
                offset_x =
                    (monitor_crop_region.min_x + monitor.rect.min_x - crop_region.min_x) as i64;
                offset_y =
                    (monitor_crop_region.min_y + monitor.rect.min_y - crop_region.min_y) as i64;
            } else {
                offset_x = (monitor.rect.min_x - monitors_bounding_box.min_x) as i64;
                offset_y = (monitor.rect.min_y - monitors_bounding_box.min_y) as i64;
            }

            // 将显示器图像绘制到合并图像上
            image::imageops::overlay(&mut capture_image, monitor_image, offset_x, offset_y);
        }

        Ok(capture_image)
    }

    pub fn capture(
        &self,
        exclude_window: Option<&tauri::Window>,
    ) -> Result<image::DynamicImage, String> {
        self.capture_core(None, exclude_window)
    }

    pub fn capture_region(
        &self,
        region: ElementRect,
        exclude_window: Option<&tauri::Window>,
    ) -> Result<image::DynamicImage, String> {
        self.capture_core(Some(region), exclude_window)
    }

    pub fn monitor_rect_list(&self) -> Vec<ElementRect> {
        self.0.iter().map(|monitor| monitor.rect).collect()
    }

    pub fn iter(&self) -> impl Iterator<Item = &MonitorInfo> {
        self.0.iter()
    }
}

#[cfg(test)]
mod tests {
    use std::env;

    use super::*;

    #[test]
    fn test_get_all_monitors() {
        let monitors = MonitorList::all();
        println!("monitors: {:?}", monitors);
    }

    #[test]
    fn test_capture_multi_monitor() {
        let instance = std::time::Instant::now();

        let crop_region = ElementRect {
            min_x: -1000,
            min_y: 0,
            max_x: 1000,
            max_y: 1000,
        };

        let monitors = MonitorList::get_by_region(crop_region);
        let image = monitors.capture_region(crop_region, None).unwrap();

        println!("current_dir: {:?}", env::current_dir().unwrap());

        image
            .save(
                std::path::PathBuf::from(env::current_dir().unwrap())
                    .join("../../test_output/capture_multi_monitor.webp"),
            )
            .unwrap();

        println!("time: {:?}", instance.elapsed());
    }

    #[test]
    fn test_capture_single_monitor() {
        let instance = std::time::Instant::now();

        let crop_region = ElementRect {
            min_x: 0,
            min_y: 0,
            max_x: 1000,
            max_y: 1000,
        };

        let monitors = MonitorList::get_by_region(crop_region);
        let image = monitors.capture_region(crop_region, None).unwrap();

        image
            .save(
                std::path::PathBuf::from(env::current_dir().unwrap())
                    .join("../../test_output/capture_single_monitor.webp"),
            )
            .unwrap();

        println!("time: {:?}", instance.elapsed());
    }
}
