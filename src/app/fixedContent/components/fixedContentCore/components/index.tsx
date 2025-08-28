import React, {
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import dynamic from 'next/dynamic';
import {
    DrawCoreActionType,
    DrawCoreContext,
    DrawCoreContextValue,
    DrawStatePublisher,
    ExcalidrawEventPublisher,
} from '@/app/fullScreenDraw/components/drawCore/extra';
import { zIndexs } from '@/utils/zIndex';
import { FixedContentWindowSize } from '..';
import { theme } from 'antd';
import { ElementRect } from '@/commands';
import { MousePosition } from '@/utils/mousePosition';
import { FixedContentCoreDrawToolbar, FixedContentCoreDrawToolbarActionType } from './toolbar';
import { withStatePublisher } from '@/hooks/useStatePublisher';
import { EnableKeyEventPublisher } from '@/app/draw/components/drawToolbar/components/keyEventWrap/extra';
import { DrawContext, DrawContextType } from '@/app/fullScreenDraw/extra';

const DrawCore = dynamic(
    async () => (await import('../../../../fullScreenDraw/components/drawCore')).DrawCore,
    {
        ssr: false,
    },
);

export type FixedContentCoreDrawActionType = {
    getToolbarSize: () => { width: number; height: number };
    getDrawMenuSize: () => { width: number; height: number };
};

const DrawLayerCore: React.FC<{
    actionRef: React.RefObject<FixedContentCoreDrawActionType | undefined>;
    documentSize: FixedContentWindowSize;
    contentScaleFactor: number;
    disabled?: boolean;
}> = ({ actionRef, documentSize, contentScaleFactor, disabled }) => {
    const { token } = theme.useToken();

    const drawToolbarActionRef = useRef<FixedContentCoreDrawToolbarActionType | undefined>(
        undefined,
    );
    const drawCoreActionRef = useRef<DrawCoreActionType | undefined>(undefined);

    const [excalidrawReady, setExcalidrawReady] = useState(false);
    useEffect(() => {
        if (!disabled) {
            setExcalidrawReady(true);
        }
    }, [disabled]);

    const mousePositionRef = useRef<MousePosition | undefined>(undefined);
    useEffect(() => {
        const onMouseMove = (ev: MouseEvent) => {
            mousePositionRef.current = new MousePosition(ev.clientX, ev.clientY);
        };

        document.addEventListener('mousemove', onMouseMove);

        return () => {
            document.removeEventListener('mousemove', onMouseMove);
        };
    }, []);

    const getDrawMenuSize = useCallback(() => {
        return {
            width: 200 + 3 * 2,
            height: 300 + 3 * 2,
        };
    }, []);

    const drawCoreContextValue = useMemo<DrawCoreContextValue>(() => {
        return {
            getLimitRect: () => {
                return {
                    min_x: 0,
                    min_y: 0,
                    max_x: documentSize.width * contentScaleFactor,
                    max_y: documentSize.height * contentScaleFactor,
                };
            },
            getDevicePixelRatio: () => {
                return contentScaleFactor;
            },
            getBaseOffset: (limitRect: ElementRect, devicePixelRatio: number) => {
                return {
                    x: limitRect.max_x / devicePixelRatio + token.marginXXS,
                    y: limitRect.min_x / devicePixelRatio + 3,
                };
            },
            getAction: () => {
                return drawCoreActionRef.current;
            },
            getMousePosition: () => {
                return mousePositionRef.current;
            },
        };
    }, [contentScaleFactor, documentSize.height, documentSize.width, token.marginXXS]);

    useImperativeHandle(actionRef, () => {
        return {
            getToolbarSize: () => {
                return (
                    drawToolbarActionRef.current?.getSize() ?? {
                        width: 0,
                        height: 0,
                    }
                );
            },
            getDrawMenuSize,
        };
    }, [getDrawMenuSize]);

    const drawContextValue = useMemo<DrawContextType>(() => {
        return {
            getDrawCoreAction: () => drawCoreActionRef.current,
        };
    }, []);

    const onMouseEvent = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    return (
        <DrawContext.Provider value={drawContextValue}>
            <div
                className="fixed-content-draw-layer"
                onMouseDown={onMouseEvent}
                onClick={onMouseEvent}
                onDoubleClick={onMouseEvent}
            >
                <DrawCoreContext.Provider value={drawCoreContextValue}>
                    <DrawCore
                        actionRef={drawCoreActionRef}
                        zIndex={zIndexs.Draw_DrawLayer}
                        layoutMenuZIndex={zIndexs.Draw_ExcalidrawToolbar}
                    />

                    <FixedContentCoreDrawToolbar
                        actionRef={drawToolbarActionRef}
                        disabled={disabled}
                        documentSize={documentSize}
                    />
                </DrawCoreContext.Provider>

                <style jsx>{`
                    .fixed-content-draw-layer {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: ${documentSize.width}px;
                        height: ${documentSize.height}px;
                        opacity: ${excalidrawReady ? 1 : 0};
                        pointer-events: ${disabled ? 'none' : 'auto'};
                        z-index: ${zIndexs.Draw_DrawLayer};
                    }

                    .fixed-content-draw-layer :global(.Island.App-menu__left) {
                        max-height: ${Math.max(documentSize.height, 300 + 15)}px !important;
                    }
                `}</style>
            </div>
        </DrawContext.Provider>
    );
};

export const DrawLayer = withStatePublisher(
    DrawLayerCore,
    DrawStatePublisher,
    ExcalidrawEventPublisher,
    EnableKeyEventPublisher,
);
