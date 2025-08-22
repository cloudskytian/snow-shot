import { DrawLayerActionType } from './components/drawLayer';
import { SelectLayerActionType } from './components/selectLayer';
import { DrawCacheLayerActionType } from './components/drawCacheLayer/extra';
import { createDrawWindow, ElementRect, saveFile } from '@/commands';
import { Window as AppWindow } from '@tauri-apps/api/window';
import { CaptureStep } from './types';
import { FixedContentActionType } from '../fixedContent/components/fixedContentCore';
import { OcrBlocksActionType } from './components/ocrBlocks';
import { showImageDialog, ImageFormat, ImagePath } from '@/utils/file';
import { AppSettingsData } from '../contextWrap';
import { writeImageToClipboard } from '@/utils/clipboard';
import { AppOcrResult } from '../fixedContent/components/ocrResult';
import { CaptureBoundingBoxInfo } from './extra';
import { setWindowRect } from '@/utils/window';
import { appError } from '@/utils/log';

export const getCanvas = async (
    selectRect: ElementRect | undefined,
    drawLayerAction: DrawLayerActionType,
    drawCacheLayerAction: DrawCacheLayerActionType,
): Promise<HTMLCanvasElement | undefined> => {
    if (!selectRect) {
        return;
    }

    drawCacheLayerAction.finishDraw();

    // 获取图像数据
    const drawLayerImageData = await drawLayerAction.getImageData(selectRect);
    const drawCacheLayerCanvas = drawCacheLayerAction.getCanvas();

    if (!drawLayerImageData || !drawCacheLayerCanvas) {
        return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = selectRect.max_x - selectRect.min_x;
    tempCanvas.height = selectRect.max_y - selectRect.min_y;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
        return;
    }

    tempCtx.putImageData(drawLayerImageData, 0, 0);
    tempCtx.drawImage(drawCacheLayerCanvas, -selectRect.min_x, -selectRect.min_y);

    return tempCanvas;
};

/**
 * 保存截图到指定文件
 */
export const saveToFile = async (
    appSettings: AppSettingsData,
    imageCanvas: HTMLCanvasElement | undefined,
    beforeSaveFile?: (filePath: string) => Promise<void>,
    prevImageFormat?: ImageFormat,
    fastSavePath?: ImagePath,
) => {
    const imagePath = fastSavePath ?? (await showImageDialog(appSettings, prevImageFormat));

    if (!imagePath) {
        return;
    }

    const imageDataPromise = new Promise<HTMLCanvasElement | undefined>((resolve) => {
        resolve(imageCanvas);
    })
        .then(async (canvas) => {
            if (!canvas) {
                return;
            }

            let blobType: string = imagePath.imageFormat;
            if (
                imagePath.imageFormat === ImageFormat.AVIF ||
                imagePath.imageFormat === ImageFormat.JPEG_XL
            ) {
                blobType = 'image/webp';
            }

            return new Promise<Blob | null>((resolve) => {
                canvas.toBlob(resolve, blobType, 1);
            });
        })
        .then((blob) => {
            if (!blob) {
                return;
            }

            if (blob instanceof Blob) {
                return blob.arrayBuffer();
            }

            return blob;
        });

    if (beforeSaveFile) {
        await beforeSaveFile(imagePath.filePath);
    }

    const imageData = await imageDataPromise;

    if (!imageData) {
        appError('[saveToFile] imageData is undefined');
        return;
    }

    await saveFile(imagePath.filePath, imageData, imagePath.imageFormat);
};

export const fixedToScreen = async (
    captureBoundingBoxInfo: CaptureBoundingBoxInfo,
    appWindow: AppWindow,
    layerContainerElement: HTMLDivElement,
    selectLayerAction: SelectLayerActionType,
    drawLayerAction: DrawLayerActionType,
    drawCacheLayerAction: DrawCacheLayerActionType,
    fixedContentAction: FixedContentActionType,
    setCaptureStep: (step: CaptureStep) => void,
    /** 已有的 OCR 结果 */
    ocrResult: AppOcrResult | undefined,
) => {
    const selectRect = selectLayerAction.getSelectRect();
    if (!selectRect) {
        return;
    }

    // 创建一个固定的图片
    const imageCanvasPromise = getCanvas(selectRect, drawLayerAction, drawCacheLayerAction);

    setCaptureStep(CaptureStep.Fixed);
    createDrawWindow();

    layerContainerElement.style.opacity = '0';
    layerContainerElement.style.width = '100%';
    layerContainerElement.style.height = '100%';
    // 等待窗口内容被隐藏，防止窗口闪烁
    await new Promise((resolve) => {
        setTimeout(resolve, 17);
    });
    await Promise.all([appWindow.hide(), appWindow.setTitle('Snow Shot - Fixed Content')]);

    const imageCanvas = await imageCanvasPromise;

    if (!imageCanvas) {
        return;
    }

    await setWindowRect(appWindow, captureBoundingBoxInfo.transformWindowRect(selectRect));
    await Promise.all([
        appWindow.show(),
        appWindow.setAlwaysOnTop(true),
        fixedContentAction.init({ canvas: imageCanvas, captureBoundingBoxInfo, ocrResult }),
    ]);

    // 简单加个过渡效果
    layerContainerElement.style.transition = 'opacity 0.3s ease-in-out';

    // 等待两帧，让窗口内容显示出来
    await new Promise((resolve) => {
        setTimeout(resolve, 17 * 2);
    });

    layerContainerElement.style.opacity = '1';
};

export const copyToClipboard = async (imageCanvas: HTMLCanvasElement | undefined) => {
    if (!imageCanvas) {
        appError('[copyToClipboard] imageCanvas is undefined');
        return;
    }

    new Promise(async (resolve) => {
        const imageData = await new Promise<Blob | null>((resolve) => {
            imageCanvas.toBlob(
                (blob) => {
                    resolve(blob);
                },
                'image/png',
                1,
            );
        });

        if (!imageData) {
            return;
        }

        await writeImageToClipboard(imageData);

        resolve(undefined);
    });
};

export const handleOcrDetect = async (
    captureBoundingBoxInfo: CaptureBoundingBoxInfo,
    selectLayerAction: SelectLayerActionType,
    drawLayerAction: DrawLayerActionType,
    drawCacheLayerAction: DrawCacheLayerActionType,
    ocrBlocksAction: OcrBlocksActionType,
) => {
    const selectRect = selectLayerAction.getSelectRect();
    if (!selectRect) {
        return;
    }

    const imageCanvas = await getCanvas(selectRect, drawLayerAction, drawCacheLayerAction);
    if (!imageCanvas) {
        return;
    }

    await ocrBlocksAction.init(selectRect, captureBoundingBoxInfo, imageCanvas, undefined);
};
