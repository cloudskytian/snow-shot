import * as tauriLog from '@tauri-apps/plugin-log';

export function appError(message: string, extra?: unknown, options?: tauriLog.LogOptions) {
    tauriLog.error(`[${location.href}] ${message} ${extra ? JSON.stringify(extra) : ''}`, options);
}

export function appWarn(message: string, extra?: unknown, options?: tauriLog.LogOptions) {
    tauriLog.warn(`[${location.href}] ${message} ${extra ? JSON.stringify(extra) : ''}`, options);
}

export function appInfo(message: string, extra?: unknown, options?: tauriLog.LogOptions) {
    tauriLog.info(`[${location.href}] ${message} ${extra ? JSON.stringify(extra) : ''}`, options);
}
