use std::sync::Mutex;

use tauri::command;

use crate::services::VideoFormat;

#[command]
pub async fn video_record_init(
    app: tauri::AppHandle,
    video_service: tauri::State<'_, Mutex<crate::services::VideoRecordService>>,
) -> Result<(), String> {
    let mut service = video_service.lock().unwrap();
    service.init(&app);
    Ok(())
}

/// 开始视频录制
#[command]
pub async fn video_record_start(
    video_service: tauri::State<'_, Mutex<crate::services::VideoRecordService>>,
    min_x: i32,
    min_y: i32,
    max_x: i32,
    max_y: i32,
    output_file: String,
    format: VideoFormat,
    frame_rate: u32,
    enable_microphone: bool,
    enable_system_audio: bool,
    microphone_device_name: String,
    hwaccel: bool,
    encoder: String,
    encoder_preset: String,
) -> Result<(), String> {
    println!(
        "Starting video recording: area=({},{}) to ({},{}), output={}",
        min_x, min_y, max_x, max_y, output_file
    );

    let mut service = video_service.lock().unwrap();

    match service.start(
        min_x,
        min_y,
        max_x,
        max_y,
        output_file,
        format,
        frame_rate,
        enable_microphone,
        enable_system_audio,
        microphone_device_name,
        hwaccel,
        encoder,
        encoder_preset,
    ) {
        Ok(_) => {
            println!("Video recording started successfully");
            Ok(())
        }
        Err(e) => {
            println!("Video recording start failed: {}", e);
            Err(format!("Start recording failed: {}", e))
        }
    }
}

/// 停止视频录制
#[command]
pub async fn video_record_stop(
    video_service: tauri::State<'_, Mutex<crate::services::VideoRecordService>>,
) -> Result<(), String> {
    println!("Stopping video recording...");

    let mut service = video_service.lock().unwrap();

    match service.stop() {
        Ok(_) => {
            println!("Video recording stopped successfully");
            Ok(())
        }
        Err(e) => {
            println!("Video recording stop failed: {}", e);
            Err(format!("Stop recording failed: {}", e))
        }
    }
}

/// 暂停视频录制
#[command]
pub async fn video_record_pause(
    video_service: tauri::State<'_, Mutex<crate::services::VideoRecordService>>,
) -> Result<(), String> {
    let mut service = video_service.lock().unwrap();

    match service.pause() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Pause recording failed: {}", e)),
    }
}

/// 恢复视频录制
#[command]
pub async fn video_record_resume(
    video_service: tauri::State<'_, Mutex<crate::services::VideoRecordService>>,
) -> Result<(), String> {
    let mut service = video_service.lock().unwrap();

    match service.resume() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Resume recording failed: {}", e)),
    }
}

#[command]
pub async fn video_record_get_microphone_device_names(
    video_service: tauri::State<'_, Mutex<crate::services::VideoRecordService>>,
) -> Result<Vec<String>, String> {
    let service = video_service.lock().unwrap();
    Ok(service.get_microphone_device_names())
}

#[command]
pub async fn video_record_kill(
    video_service: tauri::State<'_, Mutex<crate::services::VideoRecordService>>,
) -> Result<(), String> {
    let mut service = video_service.lock().unwrap();
    match service.kill() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Kill recording failed: {}", e)),
    }
}
