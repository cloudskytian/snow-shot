import { invoke } from '@tauri-apps/api/core';

export enum VideoFormat {
    Mp4 = 'Mp4',
    Gif = 'Gif',
}

export const videoRecordStart = async (
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    outputFile: string,
    format: VideoFormat,
    frameRate: number,
    enableMicrophone: boolean,
    enableSystemAudio: boolean,
    microphoneDeviceName: string,
    hwaccel: boolean,
    encoder: string,
    encoderPreset: string,
) => {
    const result = await invoke('video_record_start', {
        minX,
        minY,
        maxX,
        maxY,
        outputFile,
        format,
        frameRate,
        enableMicrophone,
        enableSystemAudio,
        microphoneDeviceName,
        hwaccel,
        encoder,
        encoderPreset,
    });
    return result;
};

export const videoRecordStop = async () => {
    const result = await invoke('video_record_stop');
    return result;
};

export const videoRecordPause = async () => {
    const result = await invoke('video_record_pause');
    return result;
};

export const videoRecordResume = async () => {
    const result = await invoke('video_record_resume');
    return result;
};

export const videoRecordKill = async () => {
    const result = await invoke('video_record_kill');
    return result;
};

export const videoRecordGetMicrophoneDeviceNames = async () => {
    const result = await invoke<string[]>('video_record_get_microphone_device_names');
    return result;
};

export const videoRecordInit = async () => {
    const result = await invoke('video_record_init');
    return result;
};
