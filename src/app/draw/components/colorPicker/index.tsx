'use client';

import { theme } from 'antd';
import { zIndexs } from '@/utils/zIndex';
import React, {
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
} from 'react';
import { getCurrentWindow, Window as AppWindow, PhysicalPosition } from '@tauri-apps/api/window';
import { CaptureStep, DrawContext } from '@/app/draw/types';
import { KeyEventKey } from '../drawToolbar/components/keyEventWrap/extra';
import { useCallbackRender, useCallbackRenderSlow } from '@/hooks/useCallbackRender';
import { MousePosition } from '@/utils/mousePosition';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import {
    CaptureEvent,
    CaptureEventParams,
    CaptureEventPublisher,
    CaptureLoadingPublisher,
    CaptureStepPublisher,
    DrawEvent,
    DrawEventPublisher,
    ScreenshotTypePublisher,
} from '../../extra';
import { withStatePublisher } from '@/hooks/useStatePublisher';
import { EnableKeyEventPublisher } from '../drawToolbar/components/keyEventWrap/extra';
import { KeyEventWrap } from '../drawToolbar/components/keyEventWrap';
import { debounce } from 'es-toolkit';
import { ScreenshotType } from '@/functions/screenshot';
import {
    AppSettingsActionContext,
    AppSettingsGroup,
    AppSettingsPublisher,
} from '@/app/contextWrap';
import Color from 'color';
import { DrawToolbarStatePublisher } from '../drawToolbar';
import { SelectState } from '../selectLayer/extra';
import { DrawState, DrawStatePublisher } from '@/app/fullScreenDraw/components/drawCore/extra';
import { writeTextToClipboard } from '@/utils/clipboard';
import { useMoveCursor } from './extra';
import { getPlatform } from '@/utils';
import { getExcalidrawCanvas } from '@/utils/excalidraw';

const previewScale = 12;
const previewPickerSize = 10 + 1;
const previewCanvasSize = previewPickerSize * previewScale;

export enum ColorPickerShowMode {
    Always = 0,
    BeyondSelectRect = 1,
    Never = 2,
}

export const isEnableColorPicker = (
    captureStep: CaptureStep,
    drawState: DrawState,
    captureEvent: CaptureEventParams | undefined,
    toolbarMouseHover: boolean,
) => {
    if (captureEvent?.event !== CaptureEvent.onCaptureLoad) {
        return false;
    }

    if (toolbarMouseHover) {
        return false;
    }

    return (
        captureStep === CaptureStep.Select ||
        (captureStep === CaptureStep.Draw && drawState === DrawState.Idle)
    );
};

export type ColorPickerActionType = {
    getCurrentImageData: () => ImageData | undefined;
};

export enum ColorPickerColorFormat {
    RGB = 'rgb',
    HEX = 'hex',
    HSL = 'hsl',
}

const colorPickerColorFormatList = [
    ColorPickerColorFormat.HEX,
    ColorPickerColorFormat.RGB,
    ColorPickerColorFormat.HSL,
];

const ColorPickerCore: React.FC<{
    onCopyColor?: () => void;
    actionRef: React.Ref<ColorPickerActionType | undefined>;
}> = ({ onCopyColor, actionRef }) => {
    const [getCaptureStep] = useStateSubscriber(CaptureStepPublisher, undefined);
    const [getDrawState] = useStateSubscriber(DrawStatePublisher, undefined);
    const [getDrawToolbarState] = useStateSubscriber(DrawToolbarStatePublisher, undefined);
    const [, setEnableKeyEvent] = useStateSubscriber(EnableKeyEventPublisher, undefined);
    const [getCaptureEvent] = useStateSubscriber(CaptureEventPublisher, undefined);
    const [getScreenshotType] = useStateSubscriber(ScreenshotTypePublisher, undefined);
    const [getAppSettings] = useStateSubscriber(AppSettingsPublisher, undefined);

    const { updateAppSettings } = useContext(AppSettingsActionContext);

    const { token } = theme.useToken();

    const {
        captureBoundingBoxInfoRef,
        drawLayerActionRef,
        mousePositionRef,
        selectLayerActionRef,
    } = useContext(DrawContext);

    const updateOpacity = useCallback(() => {
        if (!colorPickerRef.current) {
            return;
        }

        const captureBoundingBoxInfo = captureBoundingBoxInfoRef.current;
        if (!captureBoundingBoxInfo) {
            return;
        }

        let opacity = '1';

        if (enableRef.current) {
            const mouseX = mousePositionRef.current.mouseX * window.devicePixelRatio;
            const mouseY = mousePositionRef.current.mouseY * window.devicePixelRatio;
            if (
                getAppSettings()[AppSettingsGroup.Screenshot].colorPickerShowMode ===
                ColorPickerShowMode.BeyondSelectRect
            ) {
                const selectRect = selectLayerActionRef.current?.getSelectRect();
                if (selectRect) {
                    const tolerance = token.marginXXS;

                    if (
                        mouseX > selectRect.min_x - tolerance &&
                        mouseX < selectRect.max_x + tolerance &&
                        mouseY > selectRect.min_y - tolerance &&
                        mouseY < selectRect.max_y + tolerance
                    ) {
                        opacity = '1';
                    } else {
                        opacity = '0';
                    }
                } else {
                    opacity = '0';
                }
            } else if (
                getAppSettings()[AppSettingsGroup.Screenshot].colorPickerShowMode ===
                ColorPickerShowMode.Never
            ) {
                opacity = '0';
            } else {
                opacity = '1';
            }

            if (opacity === '1') {
                // 获取选区的状态，如果是未选定的状态，加个透明度
                const selectState = selectLayerActionRef.current?.getSelectState();
                if (selectState === SelectState.Manual || selectState === SelectState.Drag) {
                    opacity = '0.5';
                } else if (selectState === SelectState.Auto && colorPickerRef.current) {
                    // 这时是自动选区，那就根据是否在边缘判断
                    // 一般都是从左上到右下，所以只判断右下边缘即可
                    const maxX =
                        captureBoundingBoxInfo.width -
                        colorPickerRef.current!.clientWidth * window.devicePixelRatio;
                    const maxY =
                        captureBoundingBoxInfo.height -
                        colorPickerRef.current!.clientHeight * window.devicePixelRatio;
                    if (mouseX > maxX || mouseY > maxY) {
                        opacity = '0.5';
                    }
                }
            }
        } else {
            opacity = '0';
        }

        colorPickerRef.current.style.opacity = opacity;
    }, [
        captureBoundingBoxInfoRef,
        getAppSettings,
        mousePositionRef,
        selectLayerActionRef,
        token.marginXXS,
    ]);

    const appWindowRef = useRef<AppWindow | undefined>(undefined);
    useEffect(() => {
        appWindowRef.current = getCurrentWindow();
    }, []);

    const colorPickerRef = useRef<HTMLDivElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const pickerPositionRef = useRef<MousePosition>(new MousePosition(0, 0));
    const updatePickerPosition = useCallback((x: number, y: number) => {
        pickerPositionRef.current.mouseX = x;
        pickerPositionRef.current.mouseY = y;

        if (pickerPositionElementRef.current) {
            pickerPositionElementRef.current.textContent = `X: ${x} Y: ${y}`;
        }
    }, []);

    const enableRef = useRef(false);
    const onEnableChange = useCallback(
        (enable: boolean) => {
            enableRef.current = enable;

            updateOpacity();
        },
        [updateOpacity],
    );
    const updateEnable = useCallback(() => {
        const enable =
            getScreenshotType() !== ScreenshotType.TopWindow &&
            isEnableColorPicker(
                getCaptureStep(),
                getDrawState(),
                getCaptureEvent(),
                getDrawToolbarState().mouseHover,
            );
        if (enableRef.current === enable) {
            return;
        }

        onEnableChange(enable);
    }, [
        getCaptureEvent,
        getCaptureStep,
        getDrawState,
        getScreenshotType,
        getDrawToolbarState,
        onEnableChange,
    ]);
    const updateEnableDebounce = useMemo(() => debounce(updateEnable, 17), [updateEnable]);
    useStateSubscriber(CaptureStepPublisher, updateEnableDebounce);
    useStateSubscriber(
        DrawStatePublisher,
        useCallback(
            (drawState: DrawState) => {
                if (colorPickerRef.current) {
                    // 直接隐藏取色器，防止滚动截图干扰
                    if (drawState === DrawState.ScrollScreenshot) {
                        colorPickerRef.current.style.scale = '0';
                    } else {
                        colorPickerRef.current.style.scale = '1';
                    }
                }

                updateEnableDebounce();
            },
            [updateEnableDebounce],
        ),
    );
    useStateSubscriber(CaptureEventPublisher, updateEnableDebounce);
    useStateSubscriber(ScreenshotTypePublisher, updateEnableDebounce);
    useStateSubscriber(DrawToolbarStatePublisher, updateEnableDebounce);

    const currentCanvasImageDataRef = useRef<ImageData | undefined>(undefined);

    const colorRef = useRef({
        red: 0,
        green: 0,
        blue: 0,
    });
    // usestate 的性能太低了，直接用 ref 更新
    const colorElementRef = useRef<HTMLDivElement>(null);
    const previewColorElementRef = useRef<HTMLDivElement>(null);

    const getFormatColor = useCallback(
        (red: number, green: number, blue: number) => {
            const currentColor = new Color({
                r: red,
                g: green,
                b: blue,
            });
            const colorFormatIndex =
                colorPickerColorFormatList[
                    getAppSettings()[AppSettingsGroup.Cache].colorPickerColorFormatIndex
                ] ?? ColorPickerColorFormat.HEX;

            switch (colorFormatIndex) {
                case ColorPickerColorFormat.HEX:
                    return currentColor.hex().toString();
                case ColorPickerColorFormat.HSL:
                    const hsl = currentColor.hsl();
                    return `hsl(${hsl.hue().toFixed(1)}, ${hsl.saturationl().toFixed(1)}%, ${hsl.lightness().toFixed(1)}%)`;
                case ColorPickerColorFormat.RGB:
                default:
                    return currentColor.rgb().string();
            }
        },
        [getAppSettings],
    );
    const updateColor = useCallback(
        (red: number, green: number, blue: number) => {
            colorRef.current.red = red;
            colorRef.current.green = green;
            colorRef.current.blue = blue;
            if (!colorElementRef.current || !previewColorElementRef.current) {
                return;
            }

            colorElementRef.current.style.backgroundColor = `rgb(${red}, ${green}, ${blue})`;
            colorElementRef.current.style.color =
                red > 128 || green > 128 || blue > 128
                    ? 'rgba(0,0,0,0.88)'
                    : 'rgba(255,255,255,0.85)';
            colorElementRef.current.textContent = getFormatColor(red, green, blue);
            previewColorElementRef.current.style.boxShadow = `0 0 0 1px ${colorElementRef.current.style.color}`;
        },
        [getFormatColor],
    );

    const pickerPositionElementRef = useRef<HTMLDivElement>(null);

    const { isDisableMouseMove, enableMouseMove, disableMouseMove } = useMoveCursor();
    const updateImageDataPutImage = useCallback(
        (ctx: CanvasRenderingContext2D, x: number, y: number, imageData: ImageData) => {
            ctx.clearRect(0, 0, previewCanvasSize, previewCanvasSize);
            ctx.putImageData(imageData, -x, -y, x, y, previewPickerSize, previewPickerSize);
        },
        [],
    );
    const updateImageDataPutImageRender = useCallbackRender(updateImageDataPutImage);
    const updateImageData = useCallback(
        async (mouseX: number, mouseY: number, physicalX?: number, physicalY?: number) => {
            const imageData = currentCanvasImageDataRef.current;
            if (!imageData) {
                return;
            }

            const captureBoundingBoxInfo = captureBoundingBoxInfoRef.current;
            if (!captureBoundingBoxInfo) {
                return;
            }

            // 恢复鼠标事件触发
            enableMouseMove();

            // 带宽限制，暂时不从系统获取 mouseposition
            // let [mouseX, mouseY] = await getMousePosition();
            // mouseX = Math.min(
            //     Math.max(0, mouseX - imageBufferRef.current!.monitorX),
            //     imageBufferRef.current!.monitorWidth,
            // );
            // mouseY = Math.min(
            //     Math.max(0, mouseY - imageBufferRef.current!.monitorY),
            //     imageBufferRef.current!.monitorHeight,
            // );

            mouseX = physicalX ?? Math.floor(mouseX * window.devicePixelRatio);
            mouseY = physicalY ?? Math.floor(mouseY * window.devicePixelRatio);

            const ctx = previewCanvasCtxRef.current!;
            const halfPickerSize = Math.floor(previewPickerSize / 2);
            // 将数据绘制到预览画布
            const x = Math.floor(mouseX - halfPickerSize);
            const y = Math.floor(mouseY - halfPickerSize);
            const pickerX = x + halfPickerSize;
            const pickerY = y + halfPickerSize;
            updatePickerPosition(pickerX, pickerY);
            const baseIndex = (pickerY * captureBoundingBoxInfo.width + pickerX) * 4;

            // 更新颜色
            updateColor(
                imageData.data[baseIndex],
                imageData.data[baseIndex + 1],
                imageData.data[baseIndex + 2],
            );

            // 计算和绘制错开 1 帧率
            updateImageDataPutImageRender(ctx, x, y, imageData);
        },
        [
            enableMouseMove,
            captureBoundingBoxInfoRef,
            updateColor,
            updateImageDataPutImageRender,
            updatePickerPosition,
        ],
    );
    const updateImageRender = useCallbackRenderSlow(updateImageData);

    const updateTransform = useCallback(
        (mouseX: number, mouseY: number) => {
            const colorPickerElement = colorPickerRef.current;
            if (!colorPickerElement) {
                return;
            }

            const colorPickerWidth = colorPickerElement.clientWidth;
            const colorPickerHeight = colorPickerElement.clientHeight;

            const canvasWidth = document.body.clientWidth;
            const canvasHeight = document.body.clientHeight;

            const maxTop = canvasHeight - colorPickerHeight;
            const maxLeft = canvasWidth - colorPickerWidth;

            const colorPickerLeft = Math.min(Math.max(mouseX, 0), maxLeft);
            const colorPickerTop = Math.min(Math.max(mouseY, 0), maxTop);

            colorPickerElement.style.transform = `translate(${colorPickerLeft}px, ${colorPickerTop}px)`;

            updateOpacity();
        },
        [updateOpacity],
    );
    const updateTransformRender = useCallbackRender(updateTransform);
    const update = useCallback(
        (mouseX: number, mouseY: number, physicalX?: number, physicalY?: number) => {
            updateTransformRender(mouseX, mouseY);
            updateImageRender(mouseX, mouseY, physicalX, physicalY);
        },
        [updateImageRender, updateTransformRender],
    );
    const initPreviewCanvas = useCallback(() => {
        const previewCanvas = previewCanvasRef.current;
        if (!previewCanvas) {
            return;
        }

        const ctx = previewCanvas.getContext('2d');
        if (!ctx) {
            return;
        }

        previewCanvasCtxRef.current = ctx;
        previewCanvas.width = previewCanvasSize;
        previewCanvas.height = previewCanvasSize;
    }, []);
    const initImageData = useCallback(() => {
        const canvasApp = drawLayerActionRef.current?.getCanvasApp();
        if (!canvasApp) {
            return;
        }

        // 用截图的鼠标位置作为 picker 的初始位置
        pickerPositionRef.current = new MousePosition(
            captureBoundingBoxInfoRef.current!.mousePosition.mouseX,
            captureBoundingBoxInfoRef.current!.mousePosition.mouseY,
        );

        requestAnimationFrame(() => {
            currentCanvasImageDataRef.current = canvasApp.renderer.extract
                .canvas(canvasApp.stage)
                .getContext('2d')
                ?.getImageData(
                    0,
                    0,
                    captureBoundingBoxInfoRef.current!.width,
                    captureBoundingBoxInfoRef.current!.height,
                    {
                        colorSpace: 'srgb',
                    },
                );

            update(mousePositionRef.current.mouseX, mousePositionRef.current.mouseY);
        });
    }, [captureBoundingBoxInfoRef, drawLayerActionRef, mousePositionRef, update]);
    const onCaptureLoad = useCallback(
        (captureLoading: boolean) => {
            setEnableKeyEvent(!captureLoading);
            if (captureLoading) {
                return;
            }

            initPreviewCanvas();
            initImageData();
        },
        [initImageData, initPreviewCanvas, setEnableKeyEvent],
    );
    useStateSubscriber(CaptureLoadingPublisher, onCaptureLoad);
    const [, setDrawEvent] = useStateSubscriber(DrawEventPublisher, undefined);

    useStateSubscriber(
        CaptureEventPublisher,
        useCallback((captureEvent: CaptureEventParams | undefined) => {
            if (captureEvent?.event === CaptureEvent.onCaptureFinish) {
                currentCanvasImageDataRef.current = undefined;
            }
        }, []),
    );

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDisableMouseMove()) {
                return;
            }

            update(e.clientX, e.clientY);
        };

        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, [enableRef, isDisableMouseMove, update]);

    const moveCursor = useCallback(
        (offsetX: number, offsetY: number) => {
            const appWindow = appWindowRef.current;
            if (!appWindow) {
                return;
            }

            let mouseX = pickerPositionRef.current.mouseX + offsetX;
            let mouseY = pickerPositionRef.current.mouseY + offsetY;

            if (mouseX < 0) {
                mouseX = 0;
            } else if (mouseX > captureBoundingBoxInfoRef.current!.width) {
                mouseX = captureBoundingBoxInfoRef.current!.width;
            }

            if (mouseY < 0) {
                mouseY = 0;
            } else if (mouseY > captureBoundingBoxInfoRef.current!.height) {
                mouseY = captureBoundingBoxInfoRef.current!.height;
            }

            disableMouseMove();
            appWindow.setCursorPosition(new PhysicalPosition(mouseX, mouseY));
            setDrawEvent({
                event: DrawEvent.MoveCursor,
                params: {
                    x: mouseX,
                    y: mouseY,
                },
            });
            setDrawEvent(undefined);

            // 在 macOS 下，鼠标移动不会触发 mousemove 事件，给 excalidraw 发送一个 mousemove 事件
            if (getPlatform() === 'macos') {
                const canvas = getExcalidrawCanvas();
                canvas?.dispatchEvent(
                    new PointerEvent('pointermove', {
                        clientX: Math.round(mouseX / window.devicePixelRatio),
                        clientY: Math.round(mouseY / window.devicePixelRatio),
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            }

            update(
                mouseX / window.devicePixelRatio,
                mouseY / window.devicePixelRatio,
                mouseX,
                mouseY,
            );
        },
        [captureBoundingBoxInfoRef, disableMouseMove, setDrawEvent, update],
    );

    useImperativeHandle(
        actionRef,
        () => ({
            getCurrentImageData: () => currentCanvasImageDataRef.current,
        }),
        [],
    );

    return (
        <div className="color-picker" ref={colorPickerRef}>
            <KeyEventWrap
                componentKey={KeyEventKey.ColorPickerCopy}
                onKeyDown={() => {
                    if (!enableRef.current) {
                        return;
                    }

                    writeTextToClipboard(
                        getFormatColor(
                            colorRef.current.red,
                            colorRef.current.green,
                            colorRef.current.blue,
                        ),
                    );
                    onCopyColor?.();
                }}
            >
                <div />
            </KeyEventWrap>
            <KeyEventWrap
                componentKey={KeyEventKey.ColorPickerMoveUp}
                onKeyDown={() => {
                    moveCursor(0, -1);
                }}
            >
                <div />
            </KeyEventWrap>
            <KeyEventWrap
                componentKey={KeyEventKey.ColorPickerMoveDown}
                onKeyDown={() => {
                    moveCursor(0, 1);
                }}
            >
                <div />
            </KeyEventWrap>
            <KeyEventWrap
                componentKey={KeyEventKey.ColorPickerMoveLeft}
                onKeyDown={() => {
                    moveCursor(-1, 0);
                }}
            >
                <div />
            </KeyEventWrap>
            <KeyEventWrap
                componentKey={KeyEventKey.ColorPickerMoveRight}
                onKeyDown={() => {
                    moveCursor(1, 0);
                }}
            >
                <div />
            </KeyEventWrap>
            <KeyEventWrap
                componentKey={KeyEventKey.SwitchColorFormat}
                onKeyDown={() => {
                    if (!enableRef.current) {
                        return;
                    }

                    updateAppSettings(
                        AppSettingsGroup.Cache,
                        {
                            colorPickerColorFormatIndex:
                                (getAppSettings()[AppSettingsGroup.Cache]
                                    .colorPickerColorFormatIndex +
                                    1) %
                                colorPickerColorFormatList.length,
                        },
                        false,
                        true,
                        false,
                        true,
                        false,
                    );

                    updateColor(
                        colorRef.current.red,
                        colorRef.current.green,
                        colorRef.current.blue,
                    );
                }}
            >
                <div />
            </KeyEventWrap>

            <div className="color-picker-container">
                <div className="color-picker-preview">
                    <canvas ref={previewCanvasRef} className="preview-canvas" />
                    <div ref={previewColorElementRef} className="color-picker-preview-border" />
                </div>
            </div>

            <div className="color-picker-content">
                <div className="color-picker-content-text" ref={pickerPositionElementRef}></div>
                <div className="color-picker-content-color" ref={colorElementRef}></div>
            </div>
            <style jsx>
                {`
                    .color-picker {
                        user-select: none;
                        position: fixed;
                        top: 0;
                        left: 0;
                        background-color: ${token.colorBgContainer};
                        border-radius: ${token.borderRadius}px;
                        box-shadow: ${token.boxShadowSecondary};
                        z-index: ${zIndexs.Draw_ColorPicker};
                        pointer-events: none;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        opacity: 0;
                        color: ${token.colorText};
                        display: flex;
                        flex-direction: column;
                        padding: ${token.paddingXXS}px;
                        transition: opacity ${token.motionDurationFast} ${token.motionEaseInOut};
                    }

                    .color-picker-container {
                        width: ${previewCanvasSize}px;
                        height: ${previewCanvasSize}px;
                        border-radius: ${token.borderRadius}px;
                        overflow: hidden;
                    }

                    .color-picker-preview {
                    }

                    .color-picker-preview-border {
                        position: absolute;
                        width: ${1 * previewScale}px;
                        height: ${1 * previewScale}px;
                        left: ${previewCanvasSize / 2 - 2}px;
                        top: ${previewCanvasSize / 2 - 2}px;
                        background-color: transparent;
                        border-radius: ${token.borderRadiusXS}px;
                    }

                    .preview-canvas {
                        width: ${previewCanvasSize * previewScale}px;
                        height: ${previewCanvasSize * previewScale}px;
                        image-rendering: pixelated;
                    }

                    .color-picker-content {
                        display: flex;
                        flex-direction: column;
                        gap: ${token.marginXXS}px;
                        margin-top: ${token.marginXXS}px;
                        font-size: ${token.fontSizeSM}px;
                        width: ${previewCanvasSize}px;
                        border-bottom-left-radius: ${token.borderRadius}px;
                        border-bottom-right-radius: ${token.borderRadius}px;
                        overflow: hidden;
                    }

                    .color-picker-content-color {
                        padding: ${token.paddingXXS}px;
                        text-align: center;
                    }

                    .color-picker-content-text {
                        text-align: center;
                    }
                `}
            </style>
        </div>
    );
};

export const ColorPicker = React.memo(withStatePublisher(ColorPickerCore, EnableKeyEventPublisher));
