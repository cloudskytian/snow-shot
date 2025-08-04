import { invoke } from '@tauri-apps/api/core';
import * as tauriOs from '@tauri-apps/plugin-os';
import { ElementRect } from '.';

export const getSelectedText = async () => {
    const result = await invoke<string>('get_selected_text');
    return result;
};

export const setEnableProxy = async (enable: boolean) => {
    const result = await invoke<string>('set_enable_proxy', {
        enable,
        host: '127.0.0.1,localhost,snowshot.top,120.79.232.67,snowshot.mgchao.top',
    });
    return result;
};

export const scrollThrough = async (length: number) => {
    const result = await invoke<void>('scroll_through', {
        length,
    });
    return result;
};

export const clickThrough = async () => {
    const result = await invoke<void>('click_through');
    return result;
};

export const createFixedContentWindow = async (scrollScreenshot?: boolean) => {
    const result = await invoke<void>('create_fixed_content_window', {
        scrollScreenshot: scrollScreenshot ?? false,
    });
    return result;
};

export const readImageFromClipboard = async (): Promise<Blob | undefined> => {
    const result = await invoke<ArrayBuffer>('read_image_from_clipboard');

    if (result.byteLength === 0) {
        return undefined;
    }

    return new Blob([result]);
};

export const createFullScreenDrawWindow = async () => {
    const result = await invoke<void>('create_full_screen_draw_window');
    return result;
};

export type MonitorInfo = {
    monitor_x: number;
    monitor_y: number;
    monitor_width: number;
    monitor_height: number;
    monitor_scale_factor: number;
    mouse_x: number;
    mouse_y: number;
};

export const getCurrentMonitorInfo = async () => {
    const result = await invoke<MonitorInfo>('get_current_monitor_info');
    return result;
};

export const enableFreeDrag = async () => {
    const result = await invoke<void>('enable_free_drag');
    return result;
};

export const startFreeDrag = async () => {
    const result = await invoke<void>('start_free_drag');
    return result;
};

export const sendNewVersionNotification = async (title: string, body: string) => {
    const result = await invoke<void>('send_new_version_notification', {
        title,
        body,
    });
    return result;
};

export const createVideoRecordWindow = async (
    monitorX: number,
    monitorY: number,
    monitorWidth: number,
    monitorHeight: number,
    monitorScaleFactor: number,
    selectRectMinX: number,
    selectRectMinY: number,
    selectRectMaxX: number,
    selectRectMaxY: number,
) => {
    const result = await invoke<void>('create_video_record_window', {
        monitorX,
        monitorY,
        monitorWidth,
        monitorHeight,
        monitorScaleFactor,
        selectRectMinX,
        selectRectMinY,
        selectRectMaxX,
        selectRectMaxY,
    });
    return result;
};

/**
 * 设置当前窗口置顶
 * @param allowInputMethodOverlay 是否允许输入法覆盖
 */
export const setCurrentWindowAlwaysOnTop = async (allowInputMethodOverlay: boolean) => {
    if (process.env.NODE_ENV === 'development' && tauriOs.platform() === 'macos') {
        return;
    }

    const result = await invoke<void>('set_current_window_always_on_top', {
        allowInputMethodOverlay,
    });
    return result;
};

export const getMonitorsBoundingBox = async () => {
    const result = await invoke<{
        rect: ElementRect;
        monitor_rect_list: ElementRect[];
    }>('get_monitors_bounding_box');
    return result;
};
