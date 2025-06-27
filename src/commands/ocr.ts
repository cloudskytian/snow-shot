import { invoke } from '@tauri-apps/api/core';

export interface OcrDetectResultTextPoint {
    x: number;
    y: number;
}

export interface OcrDetectResultTextBlock {
    box_points: OcrDetectResultTextPoint[];
    text: string;
    text_score: number;
}

export interface OcrDetectResult {
    text_blocks: OcrDetectResultTextBlock[];
}

export const ocrDetect = async (
    data: ArrayBuffer | Uint8Array,
    scaleFactor: number,
    detectAngle: boolean,
): Promise<OcrDetectResult> => {
    const result = await invoke<string>('ocr_detect', data, {
        headers: {
            'x-scale-factor': scaleFactor.toFixed(3),
            'x-detect-angle': detectAngle ? 'true' : 'false',
        },
    });
    return JSON.parse(result) as OcrDetectResult;
};

export enum OcrModel {
    RapidOcrV4 = 'RapidOcrV4',
    RapidOcrV5 = 'RapidOcrV5',
}

export const ocrInit = async (model: OcrModel): Promise<void> => {
    await invoke<void>('ocr_init', { model });
};

export const ocrRelease = async (): Promise<void> => {
    await invoke<void>('ocr_release');
};
