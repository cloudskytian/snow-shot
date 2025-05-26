import { invoke } from '@tauri-apps/api/core';

export enum ScrollDirection {
    /// 垂直滚动
    Vertical = 'Vertical',
    /// 水平滚动
    Horizontal = 'Horizontal',
}

export enum ScrollImageList {
    /// 上图片列表
    Top = 'Top',
    /// 下图片列表
    Bottom = 'Bottom',
}

export const scrollScreenshotInit = async (
    direction: ScrollDirection,
    imageWidth: number,
    imageHeight: number,
    sampleRate: number,
    minSampleSize: number,
    maxSampleSize: number,
    cornerThreshold: number,
    descriptorPatchSize: number,
    minSizeDelta: number,
) => {
    const result = await invoke('scroll_screenshot_init', {
        direction,
        imageWidth,
        imageHeight,
        sampleRate,
        minSampleSize,
        maxSampleSize,
        cornerThreshold,
        descriptorPatchSize,
        minSizeDelta,
    });
    return result;
};

export type ScrollScreenshotCaptureResult = {
    thumbnail_buffer: ArrayBuffer;
    edge_position: number | undefined;
};

export const SCROLL_SCREENSHOT_CAPTURE_RESULT_EXTRA_DATA_SIZE = 4;

/**
 * @returns WebP 的 buffer 数据
 */
export const scrollScreenshotCapture = async (
    scrollImageList: ScrollImageList,
    monitorX: number,
    monitorY: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    thumbnailSize: number,
) => {
    const result = await invoke<ArrayBuffer>('scroll_screenshot_capture', {
        scrollImageList,
        monitorX,
        monitorY,
        minX,
        minY,
        maxX,
        maxY,
        thumbnailSize,
    });

    if (result.byteLength === 0) {
        return {
            thumbnail_buffer: result,
            edge_position: undefined,
        };
    }

    // 将屏幕信息和图像数据分离
    const imageDataLength = result.byteLength - SCROLL_SCREENSHOT_CAPTURE_RESULT_EXTRA_DATA_SIZE;

    // 提取屏幕信息
    const screenInfoView = new DataView(
        result,
        imageDataLength,
        SCROLL_SCREENSHOT_CAPTURE_RESULT_EXTRA_DATA_SIZE,
    );
    const edgePosition = screenInfoView.getInt32(0, true); // i32

    return {
        thumbnail_buffer: result,
        edge_position: edgePosition,
    };
};

export type ScrollScreenshotCaptureSize = {
    top_image_size: number;
    bottom_image_size: number;
};

export const scrollScreenshotGetSize = async () => {
    const result = await invoke<ScrollScreenshotCaptureSize>('scroll_screenshot_get_size');
    return result;
};

export const scrollScreenshotSaveToFile = async (filePath: string) => {
    const result = await invoke('scroll_screenshot_save_to_file', {
        filePath,
    });
    return result;
};

export const scrollScreenshotSaveToClipboard = async () => {
    const result = await invoke('scroll_screenshot_save_to_clipboard');
    return result;
};

export const scrollScreenshotClear = async () => {
    const result = await invoke('scroll_screenshot_clear');
    return result;
};

export const scrollScreenshotGetImageData = async (): Promise<Blob | undefined> => {
    let result: ArrayBuffer | undefined;
    try {
        result = await invoke<ArrayBuffer>('scroll_screenshot_get_image_data');
    } catch (error) {
        console.error(error);
        return undefined;
    }

    if (result.byteLength === 0) {
        return undefined;
    }

    return new Blob([result]);
};
