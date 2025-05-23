use image::codecs::jpeg::JpegEncoder;
use image::{codecs::webp::WebPEncoder, imageops::FilterType};
use serde::Serialize;
use std::fs;
use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::{command, image::Image};
use tauri_plugin_clipboard_manager::ClipboardExt;
use xcap::Monitor;
use zune_core::bit_depth::BitDepth;
use zune_core::colorspace::ColorSpace;
use zune_core::options::EncoderOptions;
use zune_jpegxl::JxlSimpleEncoder;

use crate::services::{ScrollDirection, ScrollImageList, ScrollScreenshotService};

#[command]
pub async fn scroll_screenshot_init(
    scroll_screenshot_service: tauri::State<'_, Mutex<ScrollScreenshotService>>,
    direction: ScrollDirection,
    image_width: u32,
    image_height: u32,
    sample_rate: f32,
    min_sample_size: u32,
    max_sample_size: u32,
    corner_threshold: u8,
    descriptor_patch_size: usize,
    min_size_delta: i32,
) -> Result<(), ()> {
    let mut scroll_screenshot_service = match scroll_screenshot_service.lock() {
        Ok(service) => service,
        Err(_) => return Err(()),
    };

    scroll_screenshot_service.init(
        direction,
        image_width,
        image_height,
        sample_rate,
        min_sample_size,
        max_sample_size,
        corner_threshold,
        descriptor_patch_size,
        min_size_delta,
    );

    Ok(())
}

#[command]
pub async fn scroll_screenshot_capture(
    scroll_screenshot_service: tauri::State<'_, Mutex<ScrollScreenshotService>>,
    scroll_image_list: ScrollImageList,
    monitor_x: i32,
    monitor_y: i32,
    min_x: u32,
    min_y: u32,
    max_x: u32,
    max_y: u32,
    thumbnail_size: u32,
) -> Result<Response, ()> {
    let mut scroll_screenshot_service = match scroll_screenshot_service.lock() {
        Ok(service) => service,
        Err(_) => return Err(()),
    };

    let monitor = Monitor::from_point(monitor_x, monitor_y).unwrap();

    // 区域截图
    let image = match monitor.capture_region(min_x, min_y, max_x - min_x, max_y - min_y) {
        Ok(image) => image,
        Err(_) => return Err(()),
    };

    // let timestamp = SystemTime::now()
    //     .duration_since(UNIX_EPOCH)
    //     .unwrap()
    //     .as_secs();
    // image
    //     .save(&format!("captuers/img_{}.png", timestamp))
    //     .unwrap();

    let handle_result = scroll_screenshot_service
        .handle_image(image::DynamicImage::ImageRgba8(image), scroll_image_list);

    let handle_result = match handle_result {
        Some(result) => result,
        None => return Ok(Response::new(vec![])),
    };

    let crop_image = match handle_result {
        (edge_position, None) => {
            return Ok(Response::new(edge_position.to_le_bytes().to_vec()));
        }
        (_, Some(ScrollImageList::Top)) => scroll_screenshot_service.top_image_list.last().unwrap(),
        (_, Some(ScrollImageList::Bottom)) => {
            scroll_screenshot_service.bottom_image_list.last().unwrap()
        }
    };

    let mut buf = Vec::new();

    let image_width = crop_image.width();
    let image_height = crop_image.height();
    let scale = if scroll_screenshot_service.current_direction == ScrollDirection::Vertical {
        thumbnail_size as f32 / image_width as f32
    } else {
        thumbnail_size as f32 / image_height as f32
    };

    let thumbnail = crop_image.resize(
        (image_width as f32 * scale) as u32,
        (image_height as f32 * scale) as u32,
        FilterType::Nearest,
    );

    thumbnail
        .to_rgb8()
        .write_with_encoder(JpegEncoder::new_with_quality(&mut buf, 83))
        .unwrap();

    // 添加边缘位置信息到缓冲区末尾
    buf.extend_from_slice(&handle_result.0.to_le_bytes());

    Ok(Response::new(buf))
}

#[derive(Serialize)]
pub struct ScrollScreenshotCaptureSize {
    pub top_image_size: i32,
    pub bottom_image_size: i32,
}

#[command]
pub async fn scroll_screenshot_get_size(
    scroll_screenshot_service: tauri::State<'_, Mutex<ScrollScreenshotService>>,
) -> Result<ScrollScreenshotCaptureSize, ()> {
    let scroll_screenshot_service = match scroll_screenshot_service.lock() {
        Ok(service) => service,
        Err(_) => return Err(()),
    };

    Ok(ScrollScreenshotCaptureSize {
        top_image_size: scroll_screenshot_service.top_image_size,
        bottom_image_size: scroll_screenshot_service.bottom_image_size,
    })
}

#[command]
pub async fn scroll_screenshot_save_to_file(
    scroll_screenshot_service: tauri::State<'_, Mutex<ScrollScreenshotService>>,
    file_path: String,
) -> Result<(), ()> {
    let mut scroll_screenshot_service = match scroll_screenshot_service.lock() {
        Ok(service) => service,
        Err(_) => return Err(()),
    };

    let image = scroll_screenshot_service.export();
    let image = match image {
        Some(image) => image,
        None => return Err(()),
    };

    if file_path.ends_with(".jxl") {
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
            Err(_) => return Err(()),
        };

        return match fs::write(file_path, encoder_result) {
            Ok(_) => Ok(()),
            Err(_) => Err(()),
        };
    } else {
        image.save(file_path).unwrap();
    }

    Ok(())
}

#[command]
pub async fn scroll_screenshot_save_to_clipboard(
    app: tauri::AppHandle,
    scroll_screenshot_service: tauri::State<'_, Mutex<ScrollScreenshotService>>,
) -> Result<(), ()> {
    let mut scroll_screenshot_service = match scroll_screenshot_service.lock() {
        Ok(service) => service,
        Err(_) => return Err(()),
    };

    let image = scroll_screenshot_service.export();
    match image {
        Some(image) => {
            let rgba_image = image.to_rgba8();
            app.clipboard()
                .write_image(&Image::new(
                    rgba_image.as_raw(),
                    rgba_image.width(),
                    rgba_image.height(),
                ))
                .unwrap();
        }
        None => return Err(()),
    }

    Ok(())
}

#[command]
pub async fn scroll_screenshot_clear(
    scroll_screenshot_service: tauri::State<'_, Mutex<ScrollScreenshotService>>,
) -> Result<(), ()> {
    let mut scroll_screenshot_service = match scroll_screenshot_service.lock() {
        Ok(service) => service,
        Err(_) => return Err(()),
    };

    scroll_screenshot_service.clear();

    Ok(())
}
