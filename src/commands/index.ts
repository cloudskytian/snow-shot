import { invoke } from '@tauri-apps/api/core';
import { Base64 } from 'js-base64';
import { ImageFormat } from '@/utils/file';

export enum ImageEncoder {
    Png = 'png',
    WebP = 'webp',
}

export type ImageBuffer = {
    encoder: ImageEncoder;
    data: Blob;
};

/**
 * 捕获鼠标所在位置的屏幕图像
 */
export const captureCurrentMonitor = async (encoder: ImageEncoder): Promise<ImageBuffer> => {
    const result = await invoke<ArrayBuffer>('capture_current_monitor', {
        encoder,
    });

    return {
        encoder,
        data: new Blob([result]),
    };
};

export type ElementRect = {
    min_x: number;
    min_y: number;
    max_x: number;
    max_y: number;
};

export type WindowElement = {
    element_rect: ElementRect;
    window_id: number;
};

export const getWindowElements = async () => {
    const result = await invoke<WindowElement[]>('get_window_elements');
    return result;
};

export enum TryGetElementByFocus {
    /// 从不
    Never = 'Never',
    /// 仅针对 Firefox 浏览器
    Firefox = 'Firefox',
    /// 尝试在白名单中获取焦点
    WhiteList = 'WhiteList',
    /// 总是尝试获取焦点
    Always = 'Always',
}

export const initUiElementsCache = async (tryGetElementByFocus: TryGetElementByFocus) => {
    const result = await invoke<void>('init_ui_elements_cache', {
        tryGetElementByFocus,
    });
    return result;
};

export const recoveryWindowZOrder = async () => {
    const result = await invoke<void>('recovery_window_z_order');
    return result;
};


export const initUiElements = async () => {
    const result = await invoke<void>('init_ui_elements');
    return result;
};

export const getElementFromPosition = async (mouseX: number, mouseY: number) => {
    const result = await invoke<ElementRect[]>('get_element_from_position', {
        mouseX,
        mouseY,
    });
    return result;
};

export const exitApp = async () => {
    const result = await invoke<void>('exit_app');
    return result;
};

export const getMousePosition = async () => {
    const result = await invoke<[number, number]>('get_mouse_position');
    return result;
};

export const saveFile = async (
    filePath: string,
    data: ArrayBuffer | Uint8Array,
    fileType: ImageFormat,
) => {
    const result = await invoke<void>('save_file', data, {
        headers: {
            'x-file-path': Base64.encode(filePath),
            'x-file-type': Base64.encode(fileType),
        },
    });
    return result;
};

export const createDrawWindow = async () => {
    const result = await invoke<void>('create_draw_window');
    return result;
};

export const autoStartHideWindow = async () => {
    const result = await invoke<void>('auto_start_hide_window');
    return result;
};
