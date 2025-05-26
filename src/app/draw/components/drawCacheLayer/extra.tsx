import {
    AppState,
    BinaryFiles,
    ExcalidrawActionType,
    PointerDownState,
} from '@mg-chao/excalidraw/types';
import { ExcalidrawImperativeAPI } from '@mg-chao/excalidraw/types';
import { createPublisher } from '@/hooks/useStatePublisher';
import { ExcalidrawElement, OrderedExcalidrawElement } from '@mg-chao/excalidraw/element/types';
import { ElementRect } from '@/commands';

export type DrawCacheLayerActionType = {
    setActiveTool: ExcalidrawImperativeAPI['setActiveTool'];
    syncActionResult: ExcalidrawActionType['syncActionResult'];
    updateScene: ExcalidrawImperativeAPI['updateScene'];
    setEnable: (enable: boolean) => void;
    onCaptureReady: () => Promise<void>;
    onCaptureFinish: () => Promise<void>;
    getImageData: (selectRect: ElementRect) => Promise<ImageData | undefined>;
    getCanvasContext: () => CanvasRenderingContext2D | null | undefined;
    getCanvas: () => HTMLCanvasElement | null;
    getAppState: () => AppState | undefined;
    getDrawCacheLayerElement: () => HTMLDivElement | null;
    getExcalidrawAPI: () => ExcalidrawImperativeAPI | undefined;
    handleWheel: (ev: WheelEvent | React.WheelEvent<HTMLDivElement>) => void;
};

export type ExcalidrawKeyEvent = {
    resizeFromCenter: boolean;
    maintainAspectRatio: boolean;
    rotateWithDiscreteAngle: boolean;
    autoAlign: boolean;
};

export const ExcalidrawKeyEventPublisher = createPublisher<ExcalidrawKeyEvent>({
    resizeFromCenter: false,
    maintainAspectRatio: false,
    rotateWithDiscreteAngle: false,
    autoAlign: false,
});

export const convertLocalToLocalCode = (local: string) => {
    switch (local) {
        case 'zh-Hans':
            return 'zh-CN';
        case 'zh-Hant':
            return 'zh-TW';
        case 'en':
            return 'en-US';
        default:
            return local;
    }
};

export type ExcalidrawEventOnChangeParams = {
    event: 'onChange';
    params: {
        elements: readonly OrderedExcalidrawElement[];
        appState: AppState;
        files: BinaryFiles;
    };
};

export type ExcalidrawEventOnPointerDownParams = {
    event: 'onPointerDown';
    params: {
        activeTool: AppState['activeTool'];
        pointerDownState: PointerDownState;
    };
};

export type ExcalidrawEventParams =
    | ExcalidrawEventOnChangeParams
    | ExcalidrawEventOnPointerDownParams;

export const ExcalidrawEventPublisher = createPublisher<ExcalidrawEventParams | undefined>(
    undefined,
);

export type ExcalidrawOnHandleEraserParams = {
    elements: Set<ExcalidrawElement['id']>;
};

export const ExcalidrawOnHandleEraserPublisher = createPublisher<
    ExcalidrawOnHandleEraserParams | undefined
>(undefined);

export enum ExcalidrawEventCallbackType {
    ChangeFontSize = 'ChangeFontSize',
}

export type ExcalidrawEventCallbackFontSizeParams = {
    fontSize: number;
};

export type ExcalidrawEventCallbackParams = {
    event: ExcalidrawEventCallbackType.ChangeFontSize;
    params: ExcalidrawEventCallbackFontSizeParams;
};

export const ExcalidrawEventCallbackPublisher = createPublisher<
    ExcalidrawEventCallbackParams | undefined
>(undefined, true);
