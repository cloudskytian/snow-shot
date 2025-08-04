import { CanvasLayer, CaptureStep } from './types';
import { DrawLayerActionType } from './components/drawLayer';
import { SelectLayerActionType } from './components/selectLayer';
import { createPublisher } from '@/hooks/useStatePublisher';
import { BaseLayerEventActionType } from './components/baseLayer';
import { ScreenshotType } from '@/functions/screenshot';
import { OcrDetectResult } from '@/commands/ocr';
import { MonitorInfo } from '@/commands/core';
import { ElementRect } from '@/commands';
import { MousePosition } from '@/utils/mousePosition';
import Flatbush from 'flatbush';
import { last } from 'es-toolkit';

export const switchLayer = (
    layer: CanvasLayer | undefined,
    drawLayerAction: DrawLayerActionType | undefined,
    selectLayerAction: SelectLayerActionType | undefined,
) => {
    let switchDraw = false;
    let switchSelect = false;

    switch (layer) {
        case CanvasLayer.Draw:
            switchDraw = true;
            break;
        case CanvasLayer.Select:
            switchSelect = true;
            break;
        default:
            break;
    }

    drawLayerAction?.setEnable(switchDraw);
    selectLayerAction?.setEnable(switchSelect);
};

export const getMonitorRect = (monitorInfo: MonitorInfo | undefined) => {
    return {
        min_x: 0,
        min_y: 0,
        max_x: monitorInfo?.monitor_width ?? 0,
        max_y: monitorInfo?.monitor_height ?? 0,
    };
};

export enum CaptureEvent {
    onExecuteScreenshot = 'onExecuteScreenshot',
    onCaptureReady = 'onCaptureReady',
    onCaptureLoad = 'onCaptureLoad',
    onCaptureFinish = 'onCaptureFinish',
}

export type CaptureEventParams =
    | {
          event: CaptureEvent.onExecuteScreenshot;
      }
    | {
          event: CaptureEvent.onCaptureLoad;
          params: Parameters<BaseLayerEventActionType['onCaptureLoad']>;
      }
    | {
          event: CaptureEvent.onCaptureFinish;
      }
    | {
          event: CaptureEvent.onCaptureReady;
          params: Parameters<BaseLayerEventActionType['onCaptureReady']>;
      };

export const CaptureStepPublisher = createPublisher<CaptureStep>(CaptureStep.Select);
export const CaptureLoadingPublisher = createPublisher<boolean>(true);
export const CaptureEventPublisher = createPublisher<CaptureEventParams | undefined>(undefined);
export const ScreenshotTypePublisher = createPublisher<ScreenshotType>(ScreenshotType.Default);

export enum DrawEvent {
    OcrDetect = 0,
    ScrollScreenshot = 1,
    MoveCursor = 2,
}

export type DrawEventParams =
    | {
          event: DrawEvent.OcrDetect;
          params: {
              result: OcrDetectResult;
          };
      }
    | {
          event: DrawEvent.ScrollScreenshot;
          params: undefined;
      }
    | {
          event: DrawEvent.MoveCursor;
          params: {
              x: number;
              y: number;
          };
      }
    | undefined;

export const DrawEventPublisher = createPublisher<DrawEventParams>(undefined, true);

export class CaptureBoundingBoxInfo {
    rect: ElementRect;
    width: number;
    height: number;
    mousePosition: MousePosition;
    monitorRectList: ElementRect[];
    monitorRTree: Flatbush;

    constructor(rect: ElementRect, monitorRectList: ElementRect[], mousePosition: MousePosition) {
        this.rect = rect;
        this.width = rect.max_x - rect.min_x;
        this.height = rect.max_y - rect.min_y;
        // 将显示器的鼠标位置转为相对截图窗口的鼠标位置
        this.mousePosition = new MousePosition(
            mousePosition.mouseX - rect.min_x,
            mousePosition.mouseY - rect.min_y,
        );
        this.monitorRectList = monitorRectList;
        this.monitorRTree = new Flatbush(monitorRectList.length);
        monitorRectList.forEach((rect) => {
            this.monitorRTree.add(rect.min_x, rect.min_y, rect.max_x, rect.max_y);
        });
        this.monitorRTree.finish();
    }

    limitRect(rect: ElementRect, search: ElementRect) {
        const monitorRectIndex = last(
            this.monitorRTree.search(search.min_x, search.min_y, search.max_x, search.max_y),
        );

        const monitorRect =
            monitorRectIndex !== undefined
                ? this.monitorRectList[monitorRectIndex]
                : {
                      min_x: rect.min_x,
                      min_y: rect.min_y,
                      max_x: rect.max_x,
                      max_y: rect.max_y,
                  };

        return {
            min_x: Math.max(rect.min_x, monitorRect.min_x),
            min_y: Math.max(rect.min_y, monitorRect.min_y),
            max_x: Math.min(rect.max_x, monitorRect.max_x),
            max_y: Math.min(rect.max_y, monitorRect.max_y),
        };
    }
}
