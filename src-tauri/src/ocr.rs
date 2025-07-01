use num_cpus;
use paddle_ocr_rs::ocr_lite::OcrLite;
use paddle_ocr_rs::ocr_result::TextBlock;
use serde::Deserialize;
use serde::Serialize;
use std::io::Cursor;
use tauri::{Manager, command, path::BaseDirectory};
use tokio::sync::Mutex;

pub struct OcrLiteWrap {
    pub ocr_instance: Option<OcrLite>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Copy, PartialOrd, Serialize, Deserialize)]
pub enum OcrModel {
    RapidOcrV4,
    RapidOcrV5,
}

#[command]
pub async fn ocr_init(
    app: tauri::AppHandle,
    ocr_instance: tauri::State<'_, Mutex<OcrLiteWrap>>,
    model: OcrModel,
) -> Result<(), ()> {
    let mut ocr_wrap_instance = ocr_instance.lock().await;

    let resource_path = match app.path().resolve("models", BaseDirectory::Resource) {
        Ok(resource_path) => resource_path,
        Err(_) => return Err(()),
    };

    let ocr_instance = match &mut ocr_wrap_instance.ocr_instance {
        Some(ocr_lite_instance) => ocr_lite_instance,
        None => return Err(()),
    };

    match model {
        OcrModel::RapidOcrV4 => {
            ocr_instance
                .init_models(
                    &resource_path
                        .join("paddle_ocr/ch_PP-OCRv4_det_infer.onnx")
                        .display()
                        .to_string(),
                    &resource_path
                        .join("paddle_ocr/ch_ppocr_mobile_v2.0_cls_infer.onnx")
                        .display()
                        .to_string(),
                    &resource_path
                        .join("paddle_ocr/ch_PP-OCRv4_rec_infer.onnx")
                        .display()
                        .to_string(),
                    num_cpus::get_physical(),
                )
                .unwrap();
        }
        OcrModel::RapidOcrV5 => {
            ocr_instance
                .init_models(
                    &resource_path
                        .join("paddle_ocr/ch_PP-OCRv4_det_infer.onnx")
                        .display()
                        .to_string(),
                    &resource_path
                        .join("paddle_ocr/ch_ppocr_mobile_v2.0_cls_infer.onnx")
                        .display()
                        .to_string(),
                    &resource_path
                        .join("paddle_ocr/ch_PP-OCRv5_rec_mobile_infer.onnx")
                        .display()
                        .to_string(),
                    num_cpus::get_physical(),
                )
                .unwrap();
        }
    }

    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct OcrDetectResult {
    pub text_blocks: Vec<TextBlock>,
    pub scale_factor: f32,
}

#[command]
pub async fn ocr_detect(
    ocr_instance: tauri::State<'_, Mutex<OcrLiteWrap>>,
    request: tauri::ipc::Request<'_>,
) -> Result<OcrDetectResult, ()> {
    let mut ocr_wrap_instance = ocr_instance.lock().await;

    let ocr_instance = match &mut ocr_wrap_instance.ocr_instance {
        Some(ocr_lite_instance) => ocr_lite_instance,
        None => return Err(()),
    };

    let image_data = match request.body() {
        tauri::ipc::InvokeBody::Raw(data) => data,
        _ => return Err(()),
    };

    let mut image = match image::load(Cursor::new(image_data), image::ImageFormat::Jpeg) {
        Ok(image) => image,
        Err(_) => return Err(()),
    };

    let mut scale_factor: f32 = match request.headers().get("x-scale-factor") {
        Some(header) => match header.to_str() {
            Ok(scale_factor) => scale_factor.parse::<f32>().unwrap(),
            Err(_) => return Err(()),
        },
        None => return Err(()),
    };

    // 分辨率过小的图片识别可能有问题，当 scale_factor 低于 1.5 时，放大图片使有效缩放达到 1.5
    let target_scale_factor = 1.5;
    if scale_factor < target_scale_factor && scale_factor > 0.0 {
        scale_factor = target_scale_factor;
        let resize_factor = target_scale_factor / scale_factor;
        image = image.resize(
            (image.width() as f32 * resize_factor) as u32,
            (image.height() as f32 * resize_factor) as u32,
            image::imageops::FilterType::Lanczos3,
        );
    }

    let detect_angle = match request.headers().get("x-detect-angle") {
        Some(header) => match header.to_str() {
            Ok(detect_angle) => detect_angle.parse::<bool>().unwrap(),
            Err(_) => return Err(()),
        },
        None => return Err(()),
    };

    let image_buffer = image.to_rgb8();
    let ocr_result = ocr_instance.detect_angle_rollback(
        &image_buffer,
        50,
        image.height().max(image.width()),
        0.5,
        0.3,
        1.6,
        detect_angle,
        false,
        0.9, // 屏幕截取的文字质量通常较高，且非横向排版的情况较少，尽量减少角度的影响
    );

    match ocr_result {
        Ok(ocr_result) => Ok(OcrDetectResult {
            text_blocks: ocr_result.text_blocks,
            scale_factor,
        }),
        Err(_) => return Err(()),
    }
}

#[command]
pub async fn ocr_release(ocr_instance: tauri::State<'_, Mutex<OcrLiteWrap>>) -> Result<(), ()> {
    let mut ocr_instance = ocr_instance.lock().await;

    ocr_instance.ocr_instance.take();

    Ok(())
}
