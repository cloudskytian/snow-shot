import { DrawLayerActionType } from './components/drawLayer';
import { SelectLayerActionType } from './components/selectLayer';
import { DrawCacheLayerActionType } from './components/drawCacheLayer/extra';
import { createDrawWindow, ElementRect, saveFile } from '@/commands';
import { Window as AppWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { CaptureStep } from './types';
import { FixedContentActionType } from '../fixedContent/components/fixedContentCore';
import { OcrBlocksActionType } from './components/ocrBlocks';
import { showImageDialog, ImageFormat, ImagePath } from '@/utils/file';
import { AppSettingsData } from '../contextWrap';
import { writeImageToClipboard } from '@/utils/clipboard';
import { AppOcrResult } from '../fixedContent/components/ocrResult';
import { CaptureBoundingBoxInfo } from './extra';

export const getCanvas = async (
    selectRect: ElementRect,
    drawLayerAction: DrawLayerActionType,
    drawCacheLayerAction: DrawCacheLayerActionType,
): Promise<HTMLCanvasElement | undefined> => {
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
    selectLayerAction: SelectLayerActionType,
    drawLayerAction: DrawLayerActionType,
    drawCacheLayerAction: DrawCacheLayerActionType,
    beforeSaveFile?: (filePath: string) => Promise<void>,
    prevImageFormat?: ImageFormat,
    fastSavePath?: ImagePath,
) => {
    const selectRect = selectLayerAction.getSelectRect();
    if (!selectRect) {
        return;
    }

    const canvasPromise = getCanvas(selectRect, drawLayerAction, drawCacheLayerAction);

    const imagePath = fastSavePath ?? (await showImageDialog(appSettings, prevImageFormat));

    if (!imagePath) {
        return;
    }

    const imageDataPromise = canvasPromise
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
    // 等待窗口内容被隐藏，防止窗口闪烁
    await new Promise((resolve) => {
        setTimeout(resolve, 17);
    });
    // 设置两次窗口位置，tauri 应该是根据窗口位置做了一些坐标转换处理，所以窗口位置得先设定好
    // 窗口位置也提前设置好
    await Promise.all([
        appWindow.setPosition(
            new PhysicalPosition(
                selectRect.min_x + captureBoundingBoxInfo.rect.min_x,
                selectRect.min_y + captureBoundingBoxInfo.rect.min_y,
            ),
        ),
        appWindow.setSize(
            new PhysicalSize(
                selectRect.max_x - selectRect.min_x,
                selectRect.max_y - selectRect.min_y,
            ),
        ),
        appWindow.hide(),
        appWindow.setTitle('Snow Shot - Fixed Content'),
    ]);

    const imageCanvas = await imageCanvasPromise;

    if (!imageCanvas) {
        return;
    }

    await Promise.all([
        appWindow.show(),
        appWindow.setAlwaysOnTop(true),
        fixedContentAction.init({ canvas: imageCanvas, captureBoundingBoxInfo, ocrResult }),
        appWindow.setPosition(
            new PhysicalPosition(
                selectRect.min_x + captureBoundingBoxInfo.rect.min_x,
                selectRect.min_y + captureBoundingBoxInfo.rect.min_y,
            ),
        ),
        appWindow.setSize(
            new PhysicalSize(
                selectRect.max_x - selectRect.min_x,
                selectRect.max_y - selectRect.min_y,
            ),
        ),
    ]);

    // 简单加个过渡效果
    layerContainerElement.style.transition = 'opacity 0.3s ease-in-out';

    // 等待两帧，让窗口内容显示出来
    await new Promise((resolve) => {
        setTimeout(resolve, 17 * 2);
    });

    layerContainerElement.style.opacity = '1';
};

export const copyToClipboard = async (
    selectLayerAction: SelectLayerActionType,
    drawLayerAction: DrawLayerActionType,
    drawCacheLayerAction: DrawCacheLayerActionType,
    beforeCopy?: (imageData: Blob) => Promise<void>,
) => {
    const selectRect = selectLayerAction.getSelectRect();
    if (!selectRect) {
        return;
    }

    const imageCanvas = await getCanvas(selectRect, drawLayerAction, drawCacheLayerAction);
    if (!imageCanvas) {
        return;
    }

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

    if (beforeCopy) {
        beforeCopy(imageData);
    }

    await writeImageToClipboard(imageData);
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
