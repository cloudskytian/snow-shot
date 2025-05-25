import { ElementRect } from '@/commands';
import { ScreenshotType } from '@/functions/screenshot';
import { MousePosition } from '@/utils/mousePosition';
import Color from 'color';

export enum SelectState {
    /** 自动选择 */
    Auto = 0,
    /** 手动选择 */
    Manual = 1,
    /** 拖动 */
    Drag = 2,
    /** 已选择 */
    Selected = 10,
}

export enum DragMode {
    /** 拖动整体 */
    All = 0,
    /** 拖动左上角 */
    TopLeft = 1,
    /** 拖动上边 */
    Top = 2,
    /** 拖动右上角 */
    TopRight = 3,
    /** 拖动右边 */
    Right = 4,
    /** 拖动右下角 */
    BottomRight = 5,
    /** 拖动下边 */
    Bottom = 6,
    /** 拖动左下角 */
    BottomLeft = 7,
    /** 拖动左边 */
    Left = 8,
}

// 全屏遮罩的透明度
const MASK_OPACITY = 0.5;
// 全屏遮罩圆形 controls 点的宽度
export const MASK_CIRCLE_CONTROL_WIDTH = 4;
// 全屏遮罩圆形 controls 点的描边宽度
export const MASK_CIRCLE_CONTROL_STROKE_WIDTH = 1.5;
// 全屏遮罩圆形 controls 点显示控制点的宽度
export const MASK_CIRCLE_CONTROL_SHOW_END_CONTROL_WIDTH = 32;
// 全屏遮罩圆形 controls 点显示中点控制点的宽度
export const MASK_CIRCLE_CONTROL_SHOW_MID_CONTROL_WIDTH = 64;
// 全屏遮罩圆形 controls 点的颜色
export const MASK_CIRCLE_CONTROL_COLOR = '#4096ff';
// 全屏遮罩圆形 controls 点的描边颜色
export const MASK_CIRCLE_CONTROL_STROKE_COLOR = '#ffffff';
// 全屏遮罩的 mask 的描边宽度
export const MASK_CONTROL_BORDER_STROKE_WIDTH = 2;
// 全屏遮罩的 mask 的描边颜色
export const MASK_CONTROL_BORDER_STROKE_COLOR = '#4096ff';

// 全屏辅助线相关常量
export const AUXILIARY_LINE_WIDTH = 1;
export const AUXILIARY_LINE_DASH = [10, 3];

const LIGHT_MASK_BACKGROUND_COLOR = Color('#000000').alpha(MASK_OPACITY).toString();
const DARK_MASK_BACKGROUND_COLOR = Color('#434343').alpha(MASK_OPACITY).toString();

export const getMaskBackgroundColor = (darkMode: boolean) => {
    return darkMode ? DARK_MASK_BACKGROUND_COLOR : LIGHT_MASK_BACKGROUND_COLOR;
};

export const drawSelectRect = (
    monitorWidth: number,
    monitorHeight: number,
    selectRect: ElementRect,
    canvasContext: CanvasRenderingContext2D,
    darkMode: boolean,
    scaleFactor: number,
    screenshotType: ScreenshotType,
    drawElementMask?: {
        imageData: ImageData;
    },
    enableScrollScreenshot?: boolean,
    fullScreenAuxiliaryLine?: {
        mousePosition: MousePosition;
        color: string;
    },
) => {
    const { min_x: rectMinX, min_y: rectMinY, max_x: rectMaxX, max_y: rectMaxY } = selectRect;
    const rectWidth = rectMaxX - rectMinX;
    const rectHeight = rectMaxY - rectMinY;
    const minWidth = Math.min(rectWidth, rectHeight);

    const maskCircleControlWidth = MASK_CIRCLE_CONTROL_WIDTH * scaleFactor;
    const maskCircleControlStrokeWidth = MASK_CIRCLE_CONTROL_STROKE_WIDTH * scaleFactor;
    const maskControlBorderStrokeWidth = MASK_CONTROL_BORDER_STROKE_WIDTH * scaleFactor;
    const maskCircleControlShowEndWidth = MASK_CIRCLE_CONTROL_SHOW_END_CONTROL_WIDTH * scaleFactor;
    const maskCircleControlShowMidWidth = MASK_CIRCLE_CONTROL_SHOW_MID_CONTROL_WIDTH * scaleFactor;

    const fillColor = getMaskBackgroundColor(darkMode);

    canvasContext.clearRect(0, 0, monitorWidth, monitorHeight);

    if (drawElementMask) {
        canvasContext.putImageData(drawElementMask.imageData, 0, 0);
    }

    canvasContext.fillStyle = fillColor;
    canvasContext.fillRect(0, 0, monitorWidth, monitorHeight);

    canvasContext.clearRect(rectMinX, rectMinY, rectWidth, rectHeight);

    if (enableScrollScreenshot) {
        return;
    }

    if (fullScreenAuxiliaryLine) {
        const { mouseX, mouseY } = fullScreenAuxiliaryLine.mousePosition;

        canvasContext.save();
        canvasContext.strokeStyle = fullScreenAuxiliaryLine.color;
        canvasContext.lineWidth = AUXILIARY_LINE_WIDTH * scaleFactor;
        canvasContext.setLineDash(AUXILIARY_LINE_DASH.map((dash) => dash * scaleFactor));

        canvasContext.beginPath();
        // 绘制垂直线
        canvasContext.moveTo(mouseX, 0);
        canvasContext.lineTo(mouseX, monitorHeight);
        // 绘制水平线
        canvasContext.moveTo(0, mouseY);
        canvasContext.lineTo(monitorWidth, mouseY);
        canvasContext.stroke();

        canvasContext.restore();
    }

    canvasContext.strokeStyle = MASK_CONTROL_BORDER_STROKE_COLOR;
    canvasContext.lineWidth = maskControlBorderStrokeWidth;
    canvasContext.strokeRect(rectMinX, rectMinY, rectWidth, rectHeight);

    if (screenshotType === ScreenshotType.TopWindow) {
        return;
    }

    const controlFillColor = MASK_CIRCLE_CONTROL_COLOR;
    const controlStrokeColor = MASK_CIRCLE_CONTROL_STROKE_COLOR;

    if (minWidth > maskCircleControlShowEndWidth) {
        // 创建顶点控制点
        const cornerPoints = [
            [rectMinX, rectMinY], // 左上角
            [rectMaxX, rectMinY], // 右上角
            [rectMinX, rectMaxY], // 左下角
            [rectMaxX, rectMaxY], // 右下角
        ];

        for (const [x, y] of cornerPoints) {
            canvasContext.beginPath();
            canvasContext.arc(x, y, maskCircleControlWidth, 0, Math.PI * 2);
            canvasContext.fillStyle = controlFillColor;
            canvasContext.fill();
            canvasContext.strokeStyle = controlStrokeColor;
            canvasContext.lineWidth = maskCircleControlStrokeWidth;
            canvasContext.stroke();
        }
    }

    if (minWidth > maskCircleControlShowMidWidth) {
        const midX = rectMinX + rectWidth / 2;
        const midY = rectMinY + rectHeight / 2;

        const midPoints = [
            [midX, rectMinY], // 上边中点
            [midX, rectMaxY], // 下边中点
            [rectMinX, midY], // 左边中点
            [rectMaxX, midY], // 右边中点
        ];

        for (const [x, y] of midPoints) {
            canvasContext.beginPath();
            canvasContext.arc(x, y, maskCircleControlWidth, 0, Math.PI * 2);
            canvasContext.fillStyle = controlFillColor;
            canvasContext.fill();
            canvasContext.strokeStyle = controlStrokeColor;
            canvasContext.lineWidth = maskCircleControlStrokeWidth;
            canvasContext.stroke();
        }
    }
};

export const convertDragModeToCursor = (dragMode: DragMode) => {
    switch (dragMode) {
        case DragMode.All:
            return 'move';
        case DragMode.TopLeft:
            return 'nw-resize';
        case DragMode.TopRight:
            return 'ne-resize';
        case DragMode.BottomLeft:
            return 'sw-resize';
        case DragMode.BottomRight:
            return 'se-resize';
        case DragMode.Top:
            return 'n-resize';
        case DragMode.Bottom:
            return 's-resize';
        case DragMode.Left:
            return 'w-resize';
        case DragMode.Right:
            return 'e-resize';
        default:
            return 'auto';
    }
};

// 缓存常用的边缘检测容差值
const EDGE_DETECTION_TOLERANCE = 8;
export const getDragModeFromMousePosition = (
    selectRect: ElementRect,
    mousePosition: MousePosition,
) => {
    const { min_x: rectMinX, min_y: rectMinY, max_x: rectMaxX, max_y: rectMaxY } = selectRect;
    const { mouseX, mouseY } = mousePosition;

    // 使用位运算进行更快的位置判断
    let position = 0;

    // 位掩码: 0b0000, 代表 [top, right, bottom, left]
    if (mouseY <= rectMinY + EDGE_DETECTION_TOLERANCE) position |= 0b1000;
    if (mouseX >= rectMaxX - EDGE_DETECTION_TOLERANCE) position |= 0b0100;
    if (mouseY >= rectMaxY - EDGE_DETECTION_TOLERANCE) position |= 0b0010;
    if (mouseX <= rectMinX + EDGE_DETECTION_TOLERANCE) position |= 0b0001;

    // 使用映射表快速确定拖动模式
    switch (position) {
        case 0b1001:
            return DragMode.TopLeft; // 左上角
        case 0b1100:
            return DragMode.TopRight; // 右上角
        case 0b0011:
            return DragMode.BottomLeft; // 左下角
        case 0b0110:
            return DragMode.BottomRight; // 右下角
        case 0b1000:
            return DragMode.Top; // 上边
        case 0b0010:
            return DragMode.Bottom; // 下边
        case 0b0001:
            return DragMode.Left; // 左边
        case 0b0100:
            return DragMode.Right; // 右边
        default:
            return DragMode.All; // 内部区域
    }
};

// 最小尺寸常量提升到函数外部
const MIN_RECT_SIZE = 1;

export const dragRect = (
    dragMode: DragMode,
    originRect: ElementRect,
    originMousePosition: MousePosition,
    mousePosition: MousePosition,
): ElementRect => {
    // 计算鼠标移动的偏移量
    const deltaX = mousePosition.mouseX - originMousePosition.mouseX;
    const deltaY = mousePosition.mouseY - originMousePosition.mouseY;

    const { min_x, min_y, max_x, max_y } = originRect;

    let newMinX = min_x,
        newMinY = min_y,
        newMaxX = max_x,
        newMaxY = max_y;

    // 根据拖动模式更新相应的坐标
    switch (dragMode) {
        case DragMode.All:
            // 整体移动，所有点同时偏移
            newMinX += deltaX;
            newMinY += deltaY;
            newMaxX += deltaX;
            newMaxY += deltaY;
            break;
        case DragMode.TopLeft:
            newMinX += deltaX;
            newMinY += deltaY;
            break;
        case DragMode.Top:
            newMinY += deltaY;
            break;
        case DragMode.TopRight:
            newMaxX += deltaX;
            newMinY += deltaY;
            break;
        case DragMode.Right:
            newMaxX += deltaX;
            break;
        case DragMode.BottomRight:
            newMaxX += deltaX;
            newMaxY += deltaY;
            break;
        case DragMode.Bottom:
            newMaxY += deltaY;
            break;
        case DragMode.BottomLeft:
            newMinX += deltaX;
            newMaxY += deltaY;
            break;
        case DragMode.Left:
            newMinX += deltaX;
            break;
    }

    const finalRect: ElementRect = {
        min_x: 0,
        min_y: 0,
        max_x: 0,
        max_y: 0,
    };

    if (newMinX < newMaxX) {
        finalRect.min_x = newMinX;
        finalRect.max_x = newMaxX;
    } else {
        finalRect.min_x = newMaxX;
        finalRect.max_x = newMinX;
    }

    if (newMinY < newMaxY) {
        finalRect.min_y = newMinY;
        finalRect.max_y = newMaxY;
    } else {
        finalRect.min_y = newMaxY;
        finalRect.max_y = newMinY;
    }

    // 应用最小尺寸限制
    if (finalRect.max_x - finalRect.min_x < MIN_RECT_SIZE) {
        finalRect.max_x = finalRect.min_x + MIN_RECT_SIZE;
    }
    if (finalRect.max_y - finalRect.min_y < MIN_RECT_SIZE) {
        finalRect.max_y = finalRect.min_y + MIN_RECT_SIZE;
    }

    return finalRect;
};

export const limitRect = (currentRect: ElementRect, limitRect: ElementRect) => {
    const { min_x, min_y, max_x, max_y } = currentRect;
    const { min_x: limitMinX, min_y: limitMinY, max_x: limitMaxX, max_y: limitMaxY } = limitRect;

    return {
        min_x: Math.max(min_x, limitMinX),
        min_y: Math.max(min_y, limitMinY),
        max_x: Math.min(max_x, limitMaxX),
        max_y: Math.min(max_y, limitMaxY),
    };
};
