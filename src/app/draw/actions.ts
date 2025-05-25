import { DrawLayerActionType } from './components/drawLayer';
import { SelectLayerActionType } from './components/selectLayer';
import { DrawCacheLayerActionType } from './components/drawCacheLayer/extra';
import { createDrawWindow, ElementRect, ImageBuffer, saveFile } from '@/commands';
import { Window as AppWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { CaptureStep } from './types';
import { FixedContentActionType } from '../fixedContent/components/fixedContentCore';
import { OcrBlocksActionType } from './components/ocrBlocks';
import { showImageDialog, ImageFormat, ImagePath } from '@/utils/file';

export const getCanvas = async (
    selectRect: ElementRect,
    drawLayerAction: DrawLayerActionType,
    drawCacheLayerAction: DrawCacheLayerActionType,
): Promise<HTMLCanvasElement | undefined> => {
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

    const imagePath = fastSavePath ?? (await showImageDialog(prevImageFormat));

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
    imageBuffer: ImageBuffer,
    appWindow: AppWindow,
    layerContainerElement: HTMLDivElement,
    selectLayerAction: SelectLayerActionType,
    drawLayerAction: DrawLayerActionType,
    drawCacheLayerAction: DrawCacheLayerActionType,
    fixedContentAction: FixedContentActionType,
    setCaptureStep: (step: CaptureStep) => void,
) => {
    const selectRect = selectLayerAction.getSelectRect();
    if (!selectRect) {
        return;
    }

    setCaptureStep(CaptureStep.Fixed);
    createDrawWindow();

    layerContainerElement.style.opacity = '0';
    await appWindow.hide();
    const hidePromise = new Promise((resolve) => {
        setTimeout(resolve, 17 * 3);
    });

    // 创建一个固定的图片
    const imageCanvas = await getCanvas(selectRect, drawLayerAction, drawCacheLayerAction);
    if (!imageCanvas) {
        return;
    }

    await Promise.all([
        fixedContentAction.init({ imageBuffer, canvas: imageCanvas }).then(async () => {
            await hidePromise;
            await Promise.all([
                appWindow.setPosition(new PhysicalPosition(selectRect.min_x, selectRect.min_y)),
                appWindow.setSize(
                    new PhysicalSize(
                        selectRect.max_x - selectRect.min_x,
                        selectRect.max_y - selectRect.min_y,
                    ),
                ),
            ]);
            await Promise.all([appWindow.show(), appWindow.setAlwaysOnTop(true)]);
            await new Promise((resolve) => {
                setTimeout(resolve, 17 * 2);
            });
            layerContainerElement.style.opacity = '1';
        }),
    ]);
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

    await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageData })]);
};

export const handleOcrDetect = async (
    imageBuffer: ImageBuffer,
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

    await ocrBlocksAction.init(selectRect, imageBuffer, imageCanvas);
};
