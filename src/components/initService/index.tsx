'use client';

import { videoRecordInit } from '@/commands/videoRecord';
import { useEffect } from 'react';

export const InitService = () => {
    useEffect(() => {
        videoRecordInit();
    }, []);

    return null;
};
