'use client';

import { AppSettingsGroup } from '@/app/contextWrap';
import { ocrInit } from '@/commands/ocr';
import { videoRecordInit } from '@/commands/videoRecord';
import { useAppSettingsLoad } from '@/hooks/useAppSettingsLoad';
import { useCallback, useEffect } from 'react';

export const InitService = () => {
    useAppSettingsLoad(
        useCallback((appSettings) => {
            ocrInit(appSettings[AppSettingsGroup.SystemScreenshot].ocrModel);
        }, []),
        true,
    );

    useEffect(() => {
        videoRecordInit();
    }, []);

    return null;
};
