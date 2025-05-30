import { CanvasLayer, CaptureStep } from './types';
import { DrawLayerActionType } from './components/drawLayer';
import { SelectLayerActionType } from './components/selectLayer';
import { createPublisher } from '@/hooks/useStatePublisher';
import { BaseLayerEventActionType } from './components/baseLayer';
import { ScreenshotType } from '@/functions/screenshot';
import { OcrDetectResult } from '@/commands/ocr';
import { MonitorInfo } from '@/commands/core';

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
    | undefined;

export const DrawEventPublisher = createPublisher<DrawEventParams>(undefined, true);
