import { invoke } from '@tauri-apps/api/core';

export const createDir = async (dirPath: string) => {
    const result = await invoke<void>('create_dir', {
        dirPath,
    });
    return result;
};
