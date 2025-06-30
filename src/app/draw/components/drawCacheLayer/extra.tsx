import { AppState, ExcalidrawActionType } from '@mg-chao/excalidraw/types';
import { ExcalidrawImperativeAPI } from '@mg-chao/excalidraw/types';
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
    getCanvas: () => HTMLCanvasElement | null | undefined;
    getAppState: () => AppState | undefined;
    getDrawCacheLayerElement: () => HTMLDivElement | null | undefined;
    getExcalidrawAPI: () => ExcalidrawImperativeAPI | undefined;
};
