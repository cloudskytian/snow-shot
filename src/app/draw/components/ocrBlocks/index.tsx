import { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { ElementRect } from '@/commands';
import { OcrDetectResult } from '@/commands/ocr';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { CaptureBoundingBoxInfo, DrawEvent, DrawEventPublisher } from '../../extra';
import { DrawState, DrawStatePublisher } from '@/app/fullScreenDraw/components/drawCore/extra';
import { useIntl } from 'react-intl';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Menu } from '@tauri-apps/api/menu';
import OcrTool from '../drawToolbar/components/tools/ocrTool';
import {
    AppOcrResult,
    OcrResult,
    OcrResultActionType,
} from '@/app/fixedContent/components/ocrResult';
import { zIndexs } from '@/utils/zIndex';
import { writeTextToClipboard } from '@/utils/clipboard';

export type OcrBlocksActionType = {
    init: (
        selectRect: ElementRect,
        captureBoundingBoxInfo: CaptureBoundingBoxInfo,
        canvas: HTMLCanvasElement,
        ocrResult: AppOcrResult | undefined,
    ) => Promise<void>;
    setEnable: (enable: boolean | ((enable: boolean) => boolean)) => void;
    getOcrResultAction: () => OcrResultActionType | undefined;
};

export const OcrBlocks: React.FC<{
    actionRef: React.RefObject<OcrBlocksActionType | undefined>;
    finishCapture: () => void;
}> = ({ actionRef, finishCapture }) => {
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
                captureBoundingBoxInfo: CaptureBoundingBoxInfo,
                canvas: HTMLCanvasElement,
                ocrResult: AppOcrResult | undefined,
            ) => {
                ocrResultActionRef.current?.init({
                    selectRect,
                    captureBoundingBoxInfo,
                    canvas,
                    ocrResult,
                });
            },
            setEnable: (enable: boolean | ((enable: boolean) => boolean)) => {
                ocrResultActionRef.current?.setEnable(enable);
            },
            getOcrResultAction: () => {
                return ocrResultActionRef.current;
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
                        writeTextToClipboard(window.getSelection()?.toString() || '');
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

    const onReplace = useCallback((result: OcrDetectResult, ignoreScale?: boolean) => {
        ocrResultActionRef.current?.updateOcrTextElements(result, ignoreScale);
    }, []);

    const onOcrDetect = useCallback(
        (ocrResult: OcrDetectResult) => {
            setDrawEvent({
                event: DrawEvent.OcrDetect,
                params: {
                    result: ocrResult,
                },
            });
            setDrawEvent(undefined);
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
                finishCapture={finishCapture}
            />
        </>
    );
};
