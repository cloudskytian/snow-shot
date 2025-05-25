import { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { ElementRect, ImageBuffer } from '@/commands';
import { OcrDetectResult } from '@/commands/ocr';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { DrawEvent, DrawEventPublisher, DrawStatePublisher } from '../../extra';
import { DrawState } from '../../types';
import { useIntl } from 'react-intl';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Menu } from '@tauri-apps/api/menu';
import OcrTool from '../drawToolbar/components/tools/ocrTool';
import { OcrResult, OcrResultActionType } from '@/app/fixedContent/components/ocrResult';
import { zIndexs } from '@/utils/zIndex';

export type OcrBlocksActionType = {
    init: (
        selectRect: ElementRect,
        imageBuffer: ImageBuffer,
        canvas: HTMLCanvasElement,
    ) => Promise<void>;
    setEnable: (enable: boolean | ((enable: boolean) => boolean)) => void;
};

export const OcrBlocks: React.FC<{
    actionRef: React.RefObject<OcrBlocksActionType | undefined>;
}> = ({ actionRef }) => {
    const intl = useIntl();

    const ocrResultActionRef = useRef<OcrResultActionType>(undefined);

    useStateSubscriber(
        DrawStatePublisher,
        useCallback((drawState: DrawState) => {
            ocrResultActionRef.current?.setEnable(drawState === DrawState.OcrDetect);
            ocrResultActionRef.current?.clear();
        }, []),
    );
    const [, setDrawEvent] = useStateSubscriber(DrawEventPublisher, undefined);

    useImperativeHandle(
        actionRef,
        () => ({
            init: async (
                selectRect: ElementRect,
                imageBuffer: ImageBuffer,
                canvas: HTMLCanvasElement,
            ) => {
                ocrResultActionRef.current?.init({
                    selectRect,
                    imageBuffer,
                    canvas,
                });
            },
            setEnable: (enable: boolean | ((enable: boolean) => boolean)) => {
                ocrResultActionRef.current?.setEnable(enable);
            },
        }),
        [],
    );

    const menuRef = useRef<Menu>(undefined);

    const initMenu = useCallback(async () => {
        const appWindow = getCurrentWindow();
        const menu = await Menu.new({
            items: [
                {
                    id: `${appWindow.label}-copySelectedText`,
                    text: intl.formatMessage({ id: 'draw.copySelectedText' }),
                    action: async () => {
                        navigator.clipboard.writeText(window.getSelection()?.toString() || '');
                    },
                },
            ],
        });
        menuRef.current = menu;
    }, [intl]);

    useEffect(() => {
        initMenu();

        return () => {
            menuRef.current?.close();
            menuRef.current = undefined;
        };
    }, [initMenu]);

    const onReplace = useCallback((result: OcrDetectResult) => {
        ocrResultActionRef.current?.updateOcrTextElements(result);
    }, []);

    const onOcrDetect = useCallback(
        (ocrResult: OcrDetectResult) => {
            setDrawEvent({
                event: DrawEvent.OcrDetect,
                params: {
                    result: ocrResult,
                },
            });
        },
        [setDrawEvent],
    );

    return (
        <>
            <OcrTool onReplace={onReplace} />

            <OcrResult
                zIndex={zIndexs.Draw_OcrResult}
                actionRef={ocrResultActionRef}
                onOcrDetect={onOcrDetect}
            />
        </>
    );
};
