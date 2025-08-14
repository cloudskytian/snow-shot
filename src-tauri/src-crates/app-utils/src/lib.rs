use std::ffi::OsStr;
use std::fs;
use std::path::PathBuf;

use device_query::{DeviceQuery, DeviceState, MouseState};
use image::DynamicImage;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::codecs::webp::WebPEncoder;
use snow_shot_app_shared::ElementRect;
use tauri::AppHandle;
use xcap::Monitor;
use zune_core::bit_depth::BitDepth;
use zune_core::colorspace::ColorSpace;
use zune_core::options::EncoderOptions;
use zune_jpegxl::JxlSimpleEncoder;

use crate::monitor_info::MonitorList;

pub mod monitor_info;

pub fn get_device_state() -> Result<DeviceState, String> {
    #[cfg(target_os = "macos")]
    {
        if !macos_accessibility_client::accessibility::application_is_trusted() {
            return Err(format!("[get_device_state] Accessibility is not enabled"));
        }
    }

    Ok(DeviceState::new())
}

pub fn get_device_mouse_position() -> Result<(i32, i32), String> {
    let device_state = get_device_state()?;
    let mouse: MouseState = device_state.get_mouse();

    Ok(mouse.coords)
}

pub fn get_target_monitor() -> Result<(i32, i32, Monitor), String> {
    let (mut mouse_x, mut mouse_y) = match get_device_mouse_position() {
        Ok((x, y)) => (x, y),
        Err(e) => {
            return Err(format!(
                "[get_target_monitor] Failed to get device mouse position: {}",
                e
            ));
        }
    };
    let monitor = Monitor::from_point(mouse_x, mouse_y).unwrap_or_else(|_| {
        // 在 Wayland 中，获取不到鼠标位置，选用第一个显示器作为位置

        log::warn!("[get_target_monitor] No monitor found, using first monitor");

        let monitor_list = xcap::Monitor::all().expect("[get_target_monitor] No monitor found");
        let first_monitor = monitor_list
            .first()
            .expect("[get_target_monitor] No monitor found");

        mouse_x = first_monitor.x().unwrap_or(0) + first_monitor.width().unwrap_or(0) as i32 / 2;
        mouse_y = first_monitor.y().unwrap_or(0) + first_monitor.height().unwrap_or(0) as i32 / 2;

        first_monitor.clone()
    });

    Ok((mouse_x, mouse_y, monitor))
}

pub async fn save_image_to_file(
    image: &image::DynamicImage,
    file_path: PathBuf,
) -> Result<(), String> {
    let extension = match file_path.extension() {
        Some(extension) => extension,
        None => {
            log::warn!("[save_image_to_file] No extension found, using default extension");

            OsStr::new("")
        }
    };

    if extension == "jxl" {
        let image_data = image.to_rgb8();
        let encoder = JxlSimpleEncoder::new(
            image_data.as_raw(),
            EncoderOptions::new(
                image.width() as usize,
                image.height() as usize,
                ColorSpace::RGB,
                BitDepth::Eight,
            ),
        );
        let encoder_result = match encoder.encode() {
            Ok(encoder_result) => encoder_result,
            Err(_) => {
                return Err(format!(
                    "[save_image_to_file] Failed to encode image: {}",
                    file_path.display()
                ));
            }
        };

        return match fs::write(file_path.clone(), encoder_result) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!(
                "[save_image_to_file] Failed to save image to file: {} {}",
                e,
                file_path.display(),
            )),
        };
    } else {
        // jpg 是 RGB 格式，所以需要转换为 RGB 格式
        let image = if image.color().has_alpha() && extension == "jpg" {
            &DynamicImage::ImageRgb8(image.to_rgb8())
        } else {
            image
        };

        match image.save(file_path.clone()) {
            Ok(_) => (),
            Err(e) => {
                return Err(format!(
                    "[save_image_to_file] Failed to save image to file: {} {}",
                    e,
                    file_path.display(),
                ));
            }
        }
    }

    return Ok(());
}

pub fn get_mouse_position(
    #[allow(unused_variables)] app: &AppHandle,
) -> Result<(i32, i32), String> {
    let device_state = get_device_state()?;
    let mouse: MouseState = device_state.get_mouse();
    let (mouse_x, mouse_y) = mouse.coords;

    #[cfg(target_os = "macos")]
    let mut position_scale = 1.0;
    #[cfg(not(target_os = "macos"))]
    let position_scale = 1.0;

    // macOS 下的鼠标位置是基于逻辑像素
    #[cfg(target_os = "macos")]
    {
        if let Ok(Some(monitor)) = app.monitor_from_point(mouse_x as f64, mouse_y as f64) {
            position_scale = monitor.scale_factor();
        }
    }

    Ok((
        (mouse_x as f64 * position_scale) as i32,
        (mouse_y as f64 * position_scale) as i32,
    ))
}

pub fn get_capture_monitor_list(
    #[allow(unused_variables)] app: &AppHandle,
    region: Option<ElementRect>,
) -> Result<MonitorList, String> {
    if let Some(region) = region {
        return Ok(MonitorList::get_by_region(region));
    }

    #[cfg(target_os = "windows")]
    {
        Ok(MonitorList::all())
    }

    #[cfg(target_os = "macos")]
    {
        // 检查所有显示器的 scale_factor 是否一致
        let (all_same_scale, _) = check_monitor_scale_factors_consistent();

        // 此时支持跨屏截图，如果 scale_factor 不一致，则需要根据鼠标位置获取单个显示器进行截图
        if all_same_scale {
            Ok(MonitorList::all())
        } else {
            let (mouse_x, mouse_y) = get_mouse_position(app)?;
            Ok(MonitorList::get_by_region(ElementRect {
                min_x: mouse_x,
                min_y: mouse_y,
                max_x: mouse_x + 1,
                max_y: mouse_y + 1,
            }))
        }
    }
}

#[cfg(target_os = "macos")]
pub fn get_window_id_from_ns_handle(ns_handle: *mut std::ffi::c_void) -> u32 {
    use objc2::runtime::AnyObject;

    unsafe {
        let ns_window = ns_handle as *mut AnyObject;
        let window_id: u32 = objc2::msg_send![ns_window, windowNumber];
        window_id
    }
}

/// 检查所有显示器的 scale_factor 是否一致
///
/// 返回一个元组：(是否一致, 所有 scale_factor 的列表)
/// 如果只有一个显示器，则认为是一致的
#[cfg(target_os = "macos")]
pub fn check_monitor_scale_factors_consistent() -> (bool, Vec<f32>) {
    let scale_factors: Vec<f32> = xcap::Monitor::all()
        .unwrap_or_default()
        .iter()
        .map(|monitor| monitor.scale_factor().unwrap_or(1.0))
        .collect();

    let all_same_scale = if scale_factors.len() > 1 {
        let first_scale = scale_factors[0];
        scale_factors
            .iter()
            .all(|&scale| (scale - first_scale).abs() < f32::EPSILON)
    } else {
        true // 只有一个显示器时认为是一致的
    };

    (all_same_scale, scale_factors)
}

pub fn capture_target_monitor(
    monitor: &Monitor,
    crop_area: Option<ElementRect>,
    #[allow(unused_variables)] exclude_window: Option<&tauri::Window>,
) -> Option<image::DynamicImage> {
    #[cfg(not(target_os = "macos"))]
    {
        let image = if let Some(crop_area) = crop_area {
            monitor.capture_region(
                crop_area.min_x as u32,
                crop_area.min_y as u32,
                (crop_area.max_x - crop_area.min_x) as u32,
                (crop_area.max_y - crop_area.min_y) as u32,
            )
        } else {
            monitor.capture_image()
        };

        return match image {
            Ok(image) => Some(image::DynamicImage::ImageRgba8(image)),
            Err(_) => None,
        };
    }

    #[cfg(target_os = "macos")]
    {
        if !scap::has_permission() {
            log::warn!("[capture_current_monitor_with_scap] failed tohas_permission");
            if !scap::request_permission() {
                log::warn!("[capture_current_monitor_with_scap] failed to request_permission");
            }

            // macOS 必须重启应用后生效，所以这里返回 None
            return None;
        }

        if monitor
            .name()
            .unwrap_or("".to_string())
            .eq("DeskPad Display")
        {
            log::warn!("[capture_current_monitor_with_scap] skip DeskPad Display");
            return Some(image::DynamicImage::ImageRgba8(image::RgbaImage::new(1, 1)));
        }

        let monitor_id = match monitor.id() {
            Ok(id) => id,
            Err(e) => {
                log::error!(
                    "[capture_current_monitor_with_scap] failed to get monitor id: {:?}",
                    e
                );
                return None;
            }
        };

        let mut window_id: Option<u32> = None;
        if let Some(exclude_window) = exclude_window {
            let ns_handle = match exclude_window.ns_window() {
                Ok(ns_handle) => ns_handle,
                Err(_) => {
                    log::error!("[capture_current_monitor_with_scap] failed to get ns_window");
                    return None;
                }
            };
            window_id = Some(get_window_id_from_ns_handle(ns_handle));
        }

        let options = scap::capturer::Options {
            fps: 1,
            target: Some(scap::Target::Display(scap::Display {
                id: monitor_id as u32,
                title: "".to_string(), // 这里 title 不重要
                raw_handle: core_graphics_helmer_fork::display::CGDisplay::new(monitor_id),
            })),
            show_cursor: false,
            show_highlight: true,
            excluded_targets: if let Some(window_id) = window_id {
                Some(vec![scap::Target::Window(scap::Window {
                    id: window_id,
                    title: "Snow Shot - Draw".to_string(),
                    raw_handle: window_id,
                })])
            } else {
                None
            },
            output_type: scap::frame::FrameType::BGRAFrame,
            output_resolution: scap::capturer::Resolution::Captured,
            crop_area: if let Some(crop_area) = crop_area {
                Some(scap::capturer::Area {
                    origin: scap::capturer::Point {
                        x: crop_area.min_x as f64,
                        y: crop_area.min_y as f64,
                    },
                    size: scap::capturer::Size {
                        width: (crop_area.max_x - crop_area.min_x) as f64,
                        height: (crop_area.max_y - crop_area.min_y) as f64,
                    },
                })
            } else {
                Some(scap::capturer::Area {
                    origin: scap::capturer::Point {
                        x: monitor.x().unwrap_or(0) as f64,
                        y: monitor.y().unwrap_or(0) as f64,
                    },
                    size: scap::capturer::Size {
                        width: monitor.width().unwrap_or(0) as f64,
                        height: monitor.height().unwrap_or(0) as f64,
                    },
                })
            },
            ..Default::default()
        };

        // Create Capturer
        let capturer = scap::capturer::Capturer::build(options);
        let mut capturer = match capturer {
            Ok(capturer) => capturer,
            Err(e) => {
                log::error!(
                    "[capture_current_monitor_with_scap] failed to build capturer: {:?}",
                    e
                );
                return None;
            }
        };

        capturer.start_capture();
        let frame = match capturer.get_next_frame() {
            Ok(frame) => match frame {
                scap::frame::Frame::BGRA(frame) => frame,
                _ => {
                    log::error!("[capture_current_monitor_with_scap] valid frame type");
                    return None;
                }
            },
            Err(e) => {
                log::error!(
                    "[capture_current_monitor_with_scap] failed to get_next_frame: {:?}",
                    e
                );
                return None;
            }
        };
        capturer.stop_capture();

        match image::RgbaImage::from_raw(
            frame.width as u32,
            frame.height as u32,
            bgra_to_rgba(&frame.data),
        ) {
            Some(rgba_image) => Some(image::DynamicImage::ImageRgba8(rgba_image)),
            None => {
                log::error!("[capture_current_monitor_with_scap] failed to create image");
                return None;
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn bgra_to_rgba(bgra_data: &[u8]) -> Vec<u8> {
    let pixel_count = bgra_data.len() / 4;
    let mut rgba_data = Vec::with_capacity(pixel_count * 4);

    unsafe {
        rgba_data.set_len(pixel_count * 4);

        let bgra_ptr = bgra_data.as_ptr();
        let rgba_ptr: *mut u8 = rgba_data.as_mut_ptr();

        for i in 0..pixel_count {
            let bgra_base = i * 4;
            let rgba_base = i * 4;

            *rgba_ptr.add(rgba_base) = *bgra_ptr.add(bgra_base + 2); // R
            *rgba_ptr.add(rgba_base + 1) = *bgra_ptr.add(bgra_base + 1); // G  
            *rgba_ptr.add(rgba_base + 2) = *bgra_ptr.add(bgra_base); // B
            *rgba_ptr.add(rgba_base + 3) = *bgra_ptr.add(bgra_base + 3); // A
        }
    }

    rgba_data
}

pub enum ImageEncoder {
    Webp,
    Png,
}

pub fn encode_image(image: &image::DynamicImage, encoder: ImageEncoder) -> Vec<u8> {
    // 编码为指定格式
    let mut buf = Vec::with_capacity(image.as_bytes().len() / 8);

    match encoder {
        ImageEncoder::Webp => {
            image
                .write_with_encoder(WebPEncoder::new_lossless(&mut buf))
                .unwrap();
        }
        ImageEncoder::Png => {
            image
                .write_with_encoder(PngEncoder::new_with_quality(
                    &mut buf,
                    CompressionType::Fast,
                    FilterType::Adaptive,
                ))
                .unwrap();
        }
    }

    return buf;
}
