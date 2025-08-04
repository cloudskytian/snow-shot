import { invoke } from '@tauri-apps/api/core';
import { ImageBuffer, ImageEncoder } from '.';

export const switchAlwaysOnTop = async (windowId: number) => {
    const result = await invoke<string>('switch_always_on_top', {
        windowId,
    });
    return result;
};

export const setDrawWindowStyle = async () => {
    const result = await invoke('set_draw_window_style');
    return result;
};

export const captureFocusedWindow = async (filePath: string | null) => {
    const result = await invoke('capture_focused_window', {
        filePath,
    });
    return result;
};

export const captureAllMonitors = async (): Promise<ImageBuffer | undefined> => {
    const result = await invoke<ArrayBuffer>('capture_all_monitors');

    if (result.byteLength === 0) {
        return undefined;
    }

    return {
        encoder: ImageEncoder.WebP,
        data: new Blob([result]),
    };
};
