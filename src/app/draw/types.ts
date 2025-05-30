import React from 'react';
import { DrawLayerActionType } from './components/drawLayer';
import { SelectLayerActionType } from './components/selectLayer';
import { ImageBuffer } from '@/commands';
import { DrawToolbarActionType } from './components/drawToolbar';
import { MousePosition } from '@/utils/mousePosition';
import { DrawCacheLayerActionType } from './components/drawCacheLayer/extra';
import { OcrBlocksActionType } from './components/ocrBlocks';
import { ColorPickerActionType } from './components/colorPicker';
import { FixedContentActionType } from '../fixedContent/components/fixedContentCore';
import { MonitorInfo } from '@/commands/core';

export enum CaptureStep {
    // 选择阶段
    Select = 1,
    // 绘制阶段
    Draw = 2,
    // 固定阶段
    Fixed = 3,
}

export enum CanvasLayer {
    Draw = 1,
    Select = 2,
}

export type DrawContextType = {
    finishCapture: (ignoreReload?: boolean, clearScrollScreenshot?: boolean) => Promise<void>;
    drawLayerActionRef: React.RefObject<DrawLayerActionType | undefined>;
    selectLayerActionRef: React.RefObject<SelectLayerActionType | undefined>;
    imageBufferRef: React.RefObject<ImageBuffer | undefined>;
    mousePositionRef: React.RefObject<MousePosition>;
    drawToolbarActionRef: React.RefObject<DrawToolbarActionType | undefined>;
    circleCursorRef: React.RefObject<HTMLDivElement | null>;
    drawCacheLayerActionRef: React.RefObject<DrawCacheLayerActionType | undefined>;
    ocrBlocksActionRef: React.RefObject<OcrBlocksActionType | undefined>;
    fixedContentActionRef: React.RefObject<FixedContentActionType | undefined>;
    colorPickerActionRef: React.RefObject<ColorPickerActionType | undefined>;
    monitorInfoRef: React.RefObject<MonitorInfo | undefined>;
};

export const DrawContext = React.createContext<DrawContextType>({
    mousePositionRef: { current: new MousePosition(0, 0) },
    imageBufferRef: { current: undefined },
    finishCapture: () => Promise.resolve(),
    drawLayerActionRef: { current: undefined },
    selectLayerActionRef: { current: undefined },
    drawToolbarActionRef: { current: undefined },
    circleCursorRef: { current: null },
    drawCacheLayerActionRef: { current: undefined },
    ocrBlocksActionRef: { current: undefined },
    fixedContentActionRef: { current: undefined },
    colorPickerActionRef: { current: undefined },
    monitorInfoRef: { current: undefined },
});
