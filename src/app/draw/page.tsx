'use client';

import { captureCurrentMonitor, ImageBuffer, ImageEncoder } from '@/commands';
import { EventListenerContext } from '@/components/eventListener';
import React, { useMemo, useState } from 'react';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import * as PIXI from 'pixi.js';
import { CanvasLayer, CaptureStep, DrawContext, DrawContextType, DrawState } from './types';
import SelectLayer, { SelectLayerActionType } from './components/selectLayer';
import DrawLayer, { DrawLayerActionType } from './components/drawLayer';
import { Window as AppWindow, getCurrentWindow } from '@tauri-apps/api/window';
import {
    CaptureLoadingPublisher,
    DrawStatePublisher,
    CaptureStepPublisher,
    switchLayer,
    CaptureEventPublisher,
    CaptureEvent,
    ScreenshotTypePublisher,
    DrawEventPublisher,
} from './extra';
import {
    DrawToolbar,
    DrawToolbarActionType,
    DrawToolbarStatePublisher,
} from './components/drawToolbar';
import { BaseLayerEventActionType } from './components/baseLayer';
import { ColorPicker, ColorPickerActionType } from './components/colorPicker';
import { HistoryContext, withCanvasHistory } from './components/historyContext';
import { withStatePublisher } from '@/hooks/useStatePublisher';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import StatusBar from './components/statusBar';
import { MousePosition } from '@/utils/mousePosition';
import { EnableKeyEventPublisher } from './components/drawToolbar/components/keyEventWrap/extra';
import { zIndexs } from '@/utils/zIndex';
import styles from './page.module.css';
import dynamic from 'next/dynamic';
import {
    DrawCacheLayerActionType,
    ExcalidrawEventPublisher,
    ExcalidrawOnHandleEraserPublisher,
} from './components/drawCacheLayer/extra';
import { copyToClipboard, fixedToScreen, handleOcrDetect, saveToFile } from './actions';
import {
    FixedContentCore,
    FixedContentActionType,
} from '../fixedContent/components/fixedContentCore';
import { OcrBlocks, OcrBlocksActionType } from './components/ocrBlocks';
import { ocrInit } from '@/commands/ocr';
import { ScreenshotType } from '@/functions/screenshot';
import { showWindow as showCurrentWindow } from '@/utils/window';
import { setDrawWindowStyle, switchAlwaysOnTop } from '@/commands/screenshot';
import { debounce } from 'es-toolkit';
import { Webview } from '@tauri-apps/api/webview';
import {
    scrollScreenshotClear,
    scrollScreenshotSaveToClipboard,
} from '@/commands/scrollScreenshot';
import { getImageFormat, getImagePathFromSettings, showImageDialog } from '@/utils/file';
import { scrollScreenshotSaveToFile } from '@/commands/scrollScreenshot';
import { AppSettingsActionContext, AppSettingsGroup } from '../contextWrap';
import { AppSettingsPublisher } from '../contextWrap';
import { ExtraTool } from './components/drawToolbar/components/tools/extraTool';
import { SerialNumberTool } from './components/drawToolbar/components/tools/serialNumberTool';
import { createFixedContentWindow } from '@/commands/core';

const DrawCacheLayer = dynamic(
    async () => (await import('./components/drawCacheLayer')).DrawCacheLayer,
    {
        ssr: false,
    },
);

const DrawPageCore: React.FC = () => {
    const appWindowRef = useRef<AppWindow>(undefined as unknown as AppWindow);
    useEffect(() => {
        appWindowRef.current = getCurrentWindow();
    }, []);

    // 截图原始数据
    const imageBufferRef = useRef<ImageBuffer | undefined>(undefined);
    const imageBlobUrlRef = useRef<string | undefined>(undefined);
    const { addListener, removeListener } = useContext(EventListenerContext);

    // 层级
    const drawLayerWrapRef = useRef<HTMLDivElement>(null);
    const layerContainerRef = useRef<HTMLDivElement>(null);
    const drawLayerActionRef = useRef<DrawLayerActionType | undefined>(undefined);
    const drawCacheLayerActionRef = useRef<DrawCacheLayerActionType | undefined>(undefined);
    const selectLayerActionRef = useRef<SelectLayerActionType | undefined>(undefined);
    const drawToolbarActionRef = useRef<DrawToolbarActionType | undefined>(undefined);
    const colorPickerActionRef = useRef<ColorPickerActionType | undefined>(undefined);
    const [isFixed, setIsFixed] = useState(false);
    const fixedContentActionRef = useRef<FixedContentActionType | undefined>(undefined);
    const ocrBlocksActionRef = useRef<OcrBlocksActionType | undefined>(undefined);

    // 状态
    const mousePositionRef = useRef<MousePosition>(new MousePosition(0, 0));
    const [getAppSettings] = useStateSubscriber(AppSettingsPublisher, undefined);
    const { updateAppSettings } = useContext(AppSettingsActionContext);
    const [getScreenshotType, setScreenshotType, resetScreenshotType] = useStateSubscriber(
        ScreenshotTypePublisher,
        undefined,
    );
    const [getCaptureStep, setCaptureStep, resetCaptureStep] = useStateSubscriber(
        CaptureStepPublisher,
        undefined,
    );
    const [getDrawState, , resetDrawState] = useStateSubscriber(DrawStatePublisher, undefined);
    const [, setCaptureLoading] = useStateSubscriber(CaptureLoadingPublisher, undefined);
    const [, setCaptureEvent] = useStateSubscriber(CaptureEventPublisher, undefined);
    const onCaptureLoad = useCallback<BaseLayerEventActionType['onCaptureLoad']>(
        async (texture: PIXI.Texture, imageBuffer: ImageBuffer) => {
            await Promise.all([drawLayerActionRef.current?.onCaptureLoad(texture, imageBuffer)]);

            setCaptureEvent({
                event: CaptureEvent.onCaptureLoad,
                params: [texture, imageBuffer],
            });
        },
        [setCaptureEvent],
    );
    const capturingRef = useRef(false);
    const circleCursorRef = useRef<HTMLDivElement>(null);

    const { history } = useContext(HistoryContext);

    const handleLayerSwitch = useCallback((layer: CanvasLayer) => {
        switchLayer(layer, drawLayerActionRef.current, selectLayerActionRef.current);
    }, []);
    const onCaptureStepDrawStateChange = useCallback(() => {
        const captureStep = getCaptureStep();
        const drawState = getDrawState();

        if (captureStep === CaptureStep.Select) {
            handleLayerSwitch(CanvasLayer.Select);
            return;
        } else if (captureStep === CaptureStep.Draw) {
            if (drawState === DrawState.Idle) {
                handleLayerSwitch(CanvasLayer.Select);
                drawCacheLayerActionRef.current?.setEnable(false);
                return;
            }

            handleLayerSwitch(CanvasLayer.Draw);
            return;
        }

        handleLayerSwitch(CanvasLayer.Select);
    }, [getCaptureStep, getDrawState, handleLayerSwitch]);
    const onCaptureStepDrawStateChangeDebounce = useMemo(() => {
        return debounce(onCaptureStepDrawStateChange, 0);
    }, [onCaptureStepDrawStateChange]);
    useStateSubscriber(CaptureStepPublisher, onCaptureStepDrawStateChangeDebounce);
    useStateSubscriber(
        DrawStatePublisher,
        useCallback(
            (drawState: DrawState) => {
                onCaptureStepDrawStateChangeDebounce();

                if (!drawLayerWrapRef.current) {
                    return;
                }

                if (drawState === DrawState.ScrollScreenshot) {
                    drawLayerWrapRef.current.style.opacity = '0';
                } else {
                    drawLayerWrapRef.current.style.opacity = '1';
                }
            },
            [onCaptureStepDrawStateChangeDebounce],
        ),
    );

    /** 截图准备 */
    const readyCapture = useCallback(
        async (imageBuffer: ImageBuffer) => {
            capturingRef.current = true;
            setCaptureLoading(true);
            drawToolbarActionRef.current?.setEnable(false);

            if (imageBlobUrlRef.current) {
                const tempUrl = imageBlobUrlRef.current;
                // 延迟释放 URL，提速
                setTimeout(() => {
                    URL.revokeObjectURL(tempUrl);
                }, 0);
            }

            imageBlobUrlRef.current = URL.createObjectURL(new Blob([imageBuffer.data]));
            const imageTexture = await PIXI.Assets.load<PIXI.Texture>({
                src: imageBlobUrlRef.current,
                loadParser: 'loadTextures',
            });
            mousePositionRef.current = new MousePosition(
                Math.floor(imageBuffer.mouseX / imageBuffer.monitorScaleFactor),
                Math.floor(imageBuffer.mouseY / imageBuffer.monitorScaleFactor),
            );

            await Promise.all([
                drawLayerActionRef.current?.onCaptureReady(imageTexture, imageBuffer),
                selectLayerActionRef.current?.onCaptureReady(imageTexture, imageBuffer),
                drawCacheLayerActionRef.current?.onCaptureReady(),
            ]);
            setCaptureEvent({
                event: CaptureEvent.onCaptureReady,
                params: [imageTexture, imageBuffer],
            });
            setCaptureLoading(false);

            onCaptureLoad(imageTexture, imageBuffer);
        },
        [onCaptureLoad, setCaptureLoading, setCaptureEvent],
    );

    /** 显示截图窗口 */
    const showWindow = useCallback(
        async (imageBuffer: ImageBuffer) => {
            const appWindow = appWindowRef.current;

            const { monitorX, monitorY, monitorWidth, monitorHeight } = imageBuffer;

            await Promise.all([
                appWindow.setAlwaysOnTop(true),
                appWindow.setPosition(new PhysicalPosition(monitorX, monitorY)),
                appWindow.setSize(new PhysicalSize(monitorWidth, monitorHeight)),
                Webview.getCurrent().setSize(new PhysicalSize(monitorWidth, monitorHeight)),
                Webview.getCurrent().setZoom(1),
            ]);

            const browserScaleFactor = monitorWidth / window.screen.width;
            imageBuffer.monitorScaleFactor =
                window.devicePixelRatio ??
                (browserScaleFactor === 0 ? imageBuffer.monitorScaleFactor : browserScaleFactor);

            if (layerContainerRef.current) {
                const documentWidth = monitorWidth / imageBuffer.monitorScaleFactor;
                const documentHeight = monitorHeight / imageBuffer.monitorScaleFactor;

                layerContainerRef.current.style.width = `${documentWidth}px`;
                layerContainerRef.current.style.height = `${documentHeight}px`;
            }
            await showCurrentWindow();
            if (
                process.env.NODE_ENV === 'development' &&
                getScreenshotType() !== ScreenshotType.TopWindow
            ) {
                await appWindow.setAlwaysOnTop(false);
            }

            setDrawWindowStyle();
        },
        [getScreenshotType],
    );

    const hideWindow = useCallback(async () => {
        await appWindowRef.current.hide();
    }, []);

    const finishCapture = useCallback<DrawContextType['finishCapture']>(
        async (ignoreReload: boolean = false, clearScrollScreenshot: boolean = true) => {
            hideWindow();
            appWindowRef.current.setSize(new PhysicalSize(0, 0));
            if (clearScrollScreenshot) {
                scrollScreenshotClear();
            }

            if (process.env.NODE_ENV !== 'development') {
                if (!ignoreReload) {
                    location.reload();
                }
                return;
            }

            window.getSelection()?.removeAllRanges();
            await Promise.all([
                drawLayerActionRef.current?.onCaptureFinish(),
                selectLayerActionRef.current?.onCaptureFinish(),
                drawCacheLayerActionRef.current?.onCaptureFinish(),
            ]);

            setCaptureEvent({
                event: CaptureEvent.onCaptureFinish,
            });
            imageBufferRef.current = undefined;
            resetCaptureStep();
            resetDrawState();
            resetScreenshotType();
            drawToolbarActionRef.current?.setEnable(false);
            capturingRef.current = false;
            history.clear();
        },
        [
            hideWindow,
            history,
            resetCaptureStep,
            resetDrawState,
            resetScreenshotType,
            setCaptureEvent,
        ],
    );

    const excuteScreenshotSign = useRef(0);
    /** 执行截图 */
    const excuteScreenshot = useCallback(
        async (excuteScreenshotType: ScreenshotType) => {
            excuteScreenshotSign.current++;

            setScreenshotType(excuteScreenshotType);
            const layerOnExecuteScreenshotPromise = Promise.all([
                drawLayerActionRef.current?.onExecuteScreenshot(),
                selectLayerActionRef.current?.onExecuteScreenshot(),
            ]);
            setCaptureEvent({
                event: CaptureEvent.onExecuteScreenshot,
            });

            // 发起截图
            const imageBuffer = await captureCurrentMonitor(ImageEncoder.WebP);
            imageBufferRef.current = imageBuffer;

            // 因为窗口是空的，所以窗口显示和图片显示先后顺序倒无所谓
            await Promise.all([
                showWindow(imageBuffer),
                readyCapture(imageBuffer),
                layerOnExecuteScreenshotPromise,
            ]);
        },
        [setScreenshotType, setCaptureEvent, showWindow, readyCapture],
    );

    const saveCurrentSelectRect = useCallback(() => {
        updateAppSettings(
            AppSettingsGroup.Cache,
            {
                prevSelectRect: selectLayerActionRef.current?.getSelectRect(),
            },
            false,
            true,
            false,
            true,
            false,
        );
    }, [updateAppSettings]);

    const releasePage = useCallback((sign: number) => {
        if (sign !== excuteScreenshotSign.current) {
            return;
        }

        if (process.env.NODE_ENV !== 'development') {
            location.reload();
        }
    }, []);

    const onSave = useCallback(
        async (fastSave: boolean = false) => {
            saveCurrentSelectRect();

            if (getDrawState() === DrawState.ScrollScreenshot) {
                const imagePath =
                    getImagePathFromSettings(
                        fastSave
                            ? getAppSettings()[AppSettingsGroup.FunctionScreenshot]
                            : undefined,
                    ) ??
                    (await showImageDialog(
                        getAppSettings()[AppSettingsGroup.Cache].prevImageFormat,
                    ));

                if (!imagePath) {
                    return;
                }

                if (!fastSave) {
                    updateAppSettings(
                        AppSettingsGroup.Cache,
                        {
                            prevImageFormat: imagePath.imageFormat,
                        },
                        false,
                        true,
                        false,
                        true,
                        false,
                    );
                }

                scrollScreenshotSaveToFile(imagePath.filePath).then(() => {
                    scrollScreenshotClear();
                });
                finishCapture();
                return;
            }

            if (
                !selectLayerActionRef.current ||
                !drawLayerActionRef.current ||
                !drawCacheLayerActionRef.current
            ) {
                return;
            }

            const sign = excuteScreenshotSign.current;

            saveToFile(
                selectLayerActionRef.current,
                drawLayerActionRef.current,
                drawCacheLayerActionRef.current,
                async (filePath: string) => {
                    if (!fastSave) {
                        updateAppSettings(
                            AppSettingsGroup.Cache,
                            {
                                prevImageFormat: getImageFormat(filePath),
                            },
                            false,
                            true,
                            false,
                            true,
                            false,
                        );
                    }

                    finishCapture(true);
                },
                getAppSettings()[AppSettingsGroup.Cache].prevImageFormat,
                fastSave
                    ? getImagePathFromSettings(
                          getAppSettings()[AppSettingsGroup.FunctionScreenshot],
                      )
                    : undefined,
            ).then(() => {
                releasePage(sign);
            });
        },
        [
            finishCapture,
            getAppSettings,
            getDrawState,
            releasePage,
            saveCurrentSelectRect,
            updateAppSettings,
        ],
    );

    const onFixed = useCallback(async () => {
        if (getDrawState() === DrawState.ScrollScreenshot) {
            createFixedContentWindow(true);
            finishCapture(undefined, false);
            return;
        }

        if (
            !layerContainerRef.current ||
            !selectLayerActionRef.current ||
            !imageBufferRef.current ||
            !drawLayerActionRef.current ||
            !drawCacheLayerActionRef.current ||
            !fixedContentActionRef.current ||
            !ocrBlocksActionRef.current
        ) {
            return;
        }

        saveCurrentSelectRect();

        await fixedToScreen(
            imageBufferRef.current,
            appWindowRef.current,
            layerContainerRef.current,
            selectLayerActionRef.current,
            drawLayerActionRef.current,
            drawCacheLayerActionRef.current,
            fixedContentActionRef.current,
            setCaptureStep,
        );

        switchLayer(undefined, drawLayerActionRef.current, selectLayerActionRef.current);
    }, [finishCapture, getDrawState, saveCurrentSelectRect, setCaptureStep]);

    const onTopWindow = useCallback(async () => {
        const windowId = selectLayerActionRef.current?.getWindowId();

        if (windowId) {
            await switchAlwaysOnTop(windowId);
        }

        await finishCapture();
    }, [finishCapture]);

    const onOcrDetect = useCallback(async () => {
        if (
            !imageBufferRef.current ||
            !selectLayerActionRef.current ||
            !drawLayerActionRef.current ||
            !drawCacheLayerActionRef.current ||
            !ocrBlocksActionRef.current
        ) {
            return;
        }

        handleOcrDetect(
            imageBufferRef.current,
            selectLayerActionRef.current,
            drawLayerActionRef.current,
            drawCacheLayerActionRef.current,
            ocrBlocksActionRef.current,
        );
    }, []);

    const onCopyToClipboard = useCallback(async () => {
        saveCurrentSelectRect();

        const enableAutoSave =
            getAppSettings()[AppSettingsGroup.FunctionScreenshot].enhanceSaveFile &&
            getAppSettings()[AppSettingsGroup.FunctionScreenshot].autoSaveOnCopy;

        if (getDrawState() === DrawState.ScrollScreenshot) {
            const filePath = getImagePathFromSettings(
                getAppSettings()[AppSettingsGroup.FunctionScreenshot],
            )?.filePath;
            Promise.all([
                scrollScreenshotSaveToClipboard(),
                enableAutoSave && filePath
                    ? scrollScreenshotSaveToFile(filePath)
                    : Promise.resolve(),
            ]).then(() => {
                scrollScreenshotClear();
            });
            finishCapture();
            return;
        }

        const selected = window.getSelection();

        if (
            (getDrawState() === DrawState.OcrDetect || getDrawState() === DrawState.ScanQrcode) &&
            selected &&
            selected.toString()
        ) {
            navigator.clipboard.writeText(selected.toString());
            finishCapture();
            return;
        }

        if (
            !selectLayerActionRef.current ||
            !drawLayerActionRef.current ||
            !drawCacheLayerActionRef.current
        ) {
            return;
        }

        const sign = excuteScreenshotSign.current;

        await copyToClipboard(
            selectLayerActionRef.current,
            drawLayerActionRef.current,
            drawCacheLayerActionRef.current,
            enableAutoSave
                ? undefined
                : async () => {
                      finishCapture(true);
                  },
        );

        if (enableAutoSave) {
            await saveToFile(
                selectLayerActionRef.current,
                drawLayerActionRef.current,
                drawCacheLayerActionRef.current,
                async () => {
                    finishCapture(true);
                },
                undefined,
                getImagePathFromSettings(getAppSettings()[AppSettingsGroup.FunctionScreenshot]),
            );
        }

        releasePage(sign);
    }, [finishCapture, getAppSettings, getDrawState, releasePage, saveCurrentSelectRect]);

    useEffect(() => {
        if (isFixed) {
            return;
        }

        // 监听截图命令
        const listenerId = addListener('execute-screenshot', (args) => {
            if (capturingRef.current) {
                return;
            }

            excuteScreenshot((args as { payload: { type: ScreenshotType } }).payload.type);
        });

        const finishListenerId = addListener('finish-screenshot', () => {
            finishCapture();
        });

        return () => {
            removeListener(listenerId);
            removeListener(finishListenerId);
        };
    }, [addListener, excuteScreenshot, removeListener, isFixed, finishCapture]);

    // 默认隐藏
    useEffect(() => {
        hideWindow();
    }, [hideWindow]);

    const drawContextValue = useMemo<DrawContextType>(() => {
        return {
            finishCapture,
            drawLayerActionRef,
            selectLayerActionRef,
            imageBufferRef,
            drawToolbarActionRef,
            mousePositionRef,
            circleCursorRef,
            drawCacheLayerActionRef,
            ocrBlocksActionRef,
            fixedContentActionRef,
            colorPickerActionRef,
        };
    }, [finishCapture]);

    useEffect(() => {
        if (isFixed) {
            return;
        }

        const handleMouseMove = (e: MouseEvent) => {
            mousePositionRef.current = new MousePosition(e.clientX, e.clientY);
        };

        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, [isFixed, onCopyToClipboard]);

    const ocrInitRef = useRef(false);
    useEffect(() => {
        if (ocrInitRef.current) {
            return;
        }

        ocrInit();
        ocrInitRef.current = true;
    }, []);

    useEffect(() => {
        document.oncopy = function () {
            if (getCaptureStep() === CaptureStep.Fixed || getDrawState() === DrawState.OcrDetect) {
                return true;
            }

            return false;
        };
    }, [getCaptureStep, getDrawState, onCopyToClipboard]);

    const onDoubleClick = useCallback<React.MouseEventHandler<HTMLDivElement>>(
        (e) => {
            if (
                e.button === 0 &&
                !drawCacheLayerActionRef.current?.getExcalidrawAPI()?.getAppState()
            ) {
                onCopyToClipboard();
            }
        },
        [onCopyToClipboard],
    );

    return (
        <DrawContext.Provider value={drawContextValue}>
            <div
                className={styles.layerContainer}
                ref={layerContainerRef}
                onDoubleClick={onDoubleClick}
            >
                <FixedContentCore
                    actionRef={fixedContentActionRef}
                    onDrawLoad={() => {
                        setIsFixed(true);
                    }}
                />

                {!isFixed && (
                    <>
                        <ExtraTool finishCapture={finishCapture} />

                        <OcrBlocks actionRef={ocrBlocksActionRef} />

                        <div className={styles.drawLayerWrap} ref={drawLayerWrapRef}>
                            <DrawLayer actionRef={drawLayerActionRef} />
                            <DrawCacheLayer actionRef={drawCacheLayerActionRef} />

                            <SerialNumberTool />
                        </div>
                        <SelectLayer actionRef={selectLayerActionRef} />
                        <DrawToolbar
                            actionRef={drawToolbarActionRef}
                            onCancel={finishCapture}
                            onSave={onSave}
                            onFixed={onFixed}
                            onCopyToClipboard={onCopyToClipboard}
                            onOcrDetect={onOcrDetect}
                            onTopWindow={onTopWindow}
                        />
                        <ColorPicker
                            onCopyColor={() => {
                                finishCapture();
                            }}
                            actionRef={colorPickerActionRef}
                        />
                        <StatusBar />

                        <div
                            ref={circleCursorRef}
                            className={styles.drawToolbarCursor}
                            style={{ zIndex: zIndexs.Draw_Cursor }}
                        />
                    </>
                )}
            </div>
        </DrawContext.Provider>
    );
};

export default React.memo(
    withCanvasHistory(
        withStatePublisher(
            DrawPageCore,
            CaptureStepPublisher,
            DrawStatePublisher,
            CaptureLoadingPublisher,
            EnableKeyEventPublisher,
            ExcalidrawEventPublisher,
            CaptureEventPublisher,
            ExcalidrawOnHandleEraserPublisher,
            ScreenshotTypePublisher,
            DrawEventPublisher,
            DrawToolbarStatePublisher,
        ),
    ),
);
