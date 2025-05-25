'use client';

import { useCallback, useEffect, useRef } from 'react';
import { FixedContentCore, FixedContentActionType } from './components/fixedContentCore';
import clipboard from 'tauri-plugin-clipboard-api';
import { showWindow } from '@/utils/window';
import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';

export default function FixedContentPage() {
    const fixedContentActionRef = useRef<FixedContentActionType>(undefined);

    const initedRef = useRef(false);

    const init = useCallback(async () => {
        try {
            const htmlContent = await clipboard.readHtml();
            if (htmlContent) {
                fixedContentActionRef.current?.init({ htmlContent });
                return;
            }
        } catch {}

        try {
            const textContent = await clipboard.readText();
            if (textContent) {
                fixedContentActionRef.current?.init({ textContent });
                return;
            }
        } catch {}

        try {
            const imageBlob = (await clipboard.readImageBinary('Blob')) as Blob;
            if (imageBlob) {
                fixedContentActionRef.current?.init({ imageBlob });
                return;
            }
        } catch {}

        getCurrentWindow().close();
    }, []);

    useEffect(() => {
        if (initedRef.current) {
            return;
        }

        initedRef.current = true;

        init();
    }, [init]);

    const onHtmlOrTextLoad = useCallback(
        async (container: HTMLDivElement | null | HTMLImageElement) => {
            const appWindow = getCurrentWindow();

            if (!container) {
                return;
            }

            const width = container.scrollWidth;
            const height = container.scrollHeight;

            let scaleFactor = 1 / window.devicePixelRatio;
            if (container instanceof HTMLImageElement) {
                scaleFactor = container.naturalWidth / container.width;
            }

            if (width > 0 && height > 0) {
                const windowWidth = Math.floor(width / scaleFactor);
                const windowHeight = Math.floor(height / scaleFactor);
                await Promise.all([
                    appWindow.setSize(new PhysicalSize(windowWidth, windowHeight)),
                    appWindow.center(),
                ]);
                await showWindow();
            } else {
                await appWindow.close();
            }
        },
        [],
    );

    return (
        <div>
            <FixedContentCore
                actionRef={fixedContentActionRef}
                onHtmlLoad={onHtmlOrTextLoad}
                onTextLoad={onHtmlOrTextLoad}
                onImageLoad={onHtmlOrTextLoad}
            />
        </div>
    );
}
