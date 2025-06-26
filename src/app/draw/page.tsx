'use client';

import { captureCurrentMonitor, createDrawWindow, ImageBuffer, ImageEncoder } from '@/commands';
import { EventListenerContext } from '@/components/eventListener';
import React, { useMemo, useState } from 'react';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import * as PIXI from 'pixi.js';
import { CanvasLayer, CaptureStep, DrawContext, DrawContextType } from './types';
import SelectLayer, { SelectLayerActionType } from './components/selectLayer';
import DrawLayer, { DrawLayerActionType } from './components/drawLayer';
import { Window as AppWindow, getCurrentWindow } from '@tauri-apps/api/window';
import {
    CaptureLoadingPublisher,
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
import { withStatePublisher } from '@/hooks/useStatePublisher';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import StatusBar from './components/statusBar';
import { MousePosition } from '@/utils/mousePosition';
import { EnableKeyEventPublisher } from './components/drawToolbar/components/keyEventWrap/extra';
import { zIndexs } from '@/utils/zIndex';
import styles from './page.module.css';
import dynamic from 'next/dynamic';
import { DrawCacheLayerActionType } from './components/drawCacheLayer/extra';
import { copyToClipboard, fixedToScreen, handleOcrDetect, saveToFile } from './actions';
import {
    FixedContentCore,
    FixedContentActionType,
} from '../fixedContent/components/fixedContentCore';
import { OcrBlocks, OcrBlocksActionType } from './components/ocrBlocks';
import {
    executeScreenshot as executeScreenshotFunc,
    releaseDrawPage,
    ScreenshotType,
} from '@/functions/screenshot';
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
import { createFixedContentWindow, getCurrentMonitorInfo, MonitorInfo } from '@/commands/core';
import {
    DrawState,
    DrawStatePublisher,
    ExcalidrawEventPublisher,
    ExcalidrawOnHandleEraserPublisher,
} from '../fullScreenDraw/components/drawCore/extra';
import {
    HistoryContext,
    withCanvasHistory,
} from '../fullScreenDraw/components/drawCore/components/historyContext';
import { covertOcrResultToText } from '../fixedContent/components/ocrResult';

const DrawCacheLayer = dynamic(
    async () => (await import('./components/drawCacheLayer')).DrawCacheLayer,
    {
        ssr: false,
    },
);

enum DrawPageState {
    /** 初始化状态 */
    Init = 'init',
    /** 激活状态 */
    Active = 'active',
    /** 等待释放状态 */
    WaitRelease = 'wait-release',
    /** 释放状态 */
    Release = 'release',
}

const DrawPageCore: React.FC = () => {
    const appWindowRef = useRef<AppWindow>(undefined as unknown as AppWindow);
    useEffect(() => {
        appWindowRef.current = getCurrentWindow();
    }, []);

    // 截图原始数据
    const imageBufferRef = useRef<ImageBuffer | undefined>(undefined);
    const monitorInfoRef = useRef<MonitorInfo | undefined>(undefined);
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
    const drawPageStateRef = useRef<DrawPageState>(DrawPageState.Init);
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
    const [getCaptureEvent, setCaptureEvent] = useStateSubscriber(CaptureEventPublisher, undefined);
    const onCaptureLoad = useCallback<BaseLayerEventActionType['onCaptureLoad']>(
        async (texture: PIXI.Texture, imageBuffer: ImageBuffer, monitorInfo: MonitorInfo) => {
            await Promise.all([
                drawLayerActionRef.current?.onCaptureLoad(texture, imageBuffer, monitorInfo),
            ]);

            setCaptureEvent({
                event: CaptureEvent.onCaptureLoad,
                params: [texture, imageBuffer, monitorInfo],
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
        async (imageBuffer: ImageBuffer, monitorInfo: MonitorInfo) => {
            setCaptureLoading(true);

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
                Math.floor(
                    monitorInfoRef.current!.mouse_x / monitorInfoRef.current!.monitor_scale_factor,
                ),
                Math.floor(
                    monitorInfoRef.current!.mouse_y / monitorInfoRef.current!.monitor_scale_factor,
                ),
            );

            await Promise.all([
                drawLayerActionRef.current?.onCaptureReady(imageTexture, imageBuffer, monitorInfo),
                drawCacheLayerActionRef.current?.onCaptureReady(),
            ]);
            setCaptureEvent({
                event: CaptureEvent.onCaptureReady,
                params: [imageTexture, imageBuffer, monitorInfo],
            });
            setCaptureLoading(false);

            onCaptureLoad(imageTexture, imageBuffer, monitorInfo);
        },
        [onCaptureLoad, setCaptureLoading, setCaptureEvent],
    );

    /** 显示截图窗口 */
    const showWindow = useCallback(
        async ({
            monitor_x,
            monitor_y,
            monitor_width,
            monitor_height,
            monitor_scale_factor,
        }: MonitorInfo) => {
            const appWindow = appWindowRef.current;

            await Promise.all([
                appWindow.setAlwaysOnTop(true),
                appWindow.setPosition(new PhysicalPosition(monitor_x, monitor_y)),
                appWindow.setSize(new PhysicalSize(monitor_width, monitor_height)),
                Webview.getCurrent().setSize(new PhysicalSize(monitor_width, monitor_height)),
                Webview.getCurrent().setZoom(1),
            ]);

            const browserScaleFactor = monitor_width / window.screen.width;
            monitorInfoRef.current!.monitor_scale_factor =
                window.devicePixelRatio ??
                (browserScaleFactor === 0 ? monitor_scale_factor : browserScaleFactor);

            if (layerContainerRef.current) {
                const documentWidth = monitor_width / monitorInfoRef.current!.monitor_scale_factor;
                const documentHeight =
                    monitor_height / monitorInfoRef.current!.monitor_scale_factor;

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

    const releasePage = useMemo(() => {
        return debounce(async () => {
            if (drawPageStateRef.current !== DrawPageState.WaitRelease) {
                return;
            }

            drawPageStateRef.current = DrawPageState.Release;
            await createDrawWindow();
            // 隔一段时间释放，防止释放中途用户唤起
            setTimeout(() => {
                appWindowRef.current.close();
            }, 1000 * 8);
        }, 1000 * 16);
    }, []);

    const finishCapture = useCallback<DrawContextType['finishCapture']>(
        async (clearScrollScreenshot: boolean = true) => {
            drawPageStateRef.current = DrawPageState.WaitRelease;
            releasePage();

            hideWindow();
            if (clearScrollScreenshot) {
                scrollScreenshotClear();
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
            releasePage,
            resetCaptureStep,
            resetDrawState,
            resetScreenshotType,
            setCaptureEvent,
        ],
    );

    const initMonitorInfoAndShowWindow = useCallback(async () => {
        const monitorInfo = await getCurrentMonitorInfo();
        monitorInfoRef.current = monitorInfo;
        await Promise.all([
            showWindow(monitorInfo),
            selectLayerActionRef.current?.onMonitorInfoReady(monitorInfo),
            drawLayerActionRef.current?.onMonitorInfoReady(monitorInfo),
        ]);
    }, [showWindow]);

    /** 执行截图 */
    const excuteScreenshot = useCallback(
        async (excuteScreenshotType: ScreenshotType) => {
            capturingRef.current = true;
            drawToolbarActionRef.current?.setEnable(false);

            setScreenshotType(excuteScreenshotType);
            const layerOnExecuteScreenshotPromise = Promise.all([
                drawLayerActionRef.current?.onExecuteScreenshot(),
                selectLayerActionRef.current?.onExecuteScreenshot(),
            ]);
            setCaptureEvent({
                event: CaptureEvent.onExecuteScreenshot,
            });

            const initMonitorInfoPromise = initMonitorInfoAndShowWindow();
            imageBufferRef.current = await captureCurrentMonitor(ImageEncoder.WebP);
            await initMonitorInfoPromise;

            // 防止用户提前退出报错
            if (getCaptureEvent()?.event !== CaptureEvent.onExecuteScreenshot) {
                return;
            }

            try {
                // 因为窗口是空的，所以窗口显示和图片显示先后顺序倒无所谓
                await Promise.all([
                    readyCapture(imageBufferRef.current, monitorInfoRef.current!),
                    layerOnExecuteScreenshotPromise,
                ]);
            } catch (error) {
                // 防止用户提前退出报错
                if (getCaptureEvent()?.event !== CaptureEvent.onExecuteScreenshot) {
                    return;
                }

                throw error;
            }
        },
        [
            setScreenshotType,
            setCaptureEvent,
            initMonitorInfoAndShowWindow,
            getCaptureEvent,
            readyCapture,
        ],
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

    const onSave = useCallback(
        async (fastSave: boolean = false) => {
            saveCurrentSelectRect();

            if (getDrawState() === DrawState.ScrollScreenshot) {
                const imagePath =
                    (await getImagePathFromSettings(
                        fastSave ? getAppSettings() : undefined,
                        'fast',
                    )) ?? (await showImageDialog(getAppSettings()));

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

            saveToFile(
                getAppSettings(),
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

                    finishCapture();
                },
                getAppSettings()[AppSettingsGroup.Cache].prevImageFormat,
                fastSave ? await getImagePathFromSettings(getAppSettings(), 'fast') : undefined,
            );
        },
        [finishCapture, getAppSettings, getDrawState, saveCurrentSelectRect, updateAppSettings],
    );

    const onFixed = useCallback(async () => {
        if (getDrawState() === DrawState.ScrollScreenshot) {
            createFixedContentWindow(true);
            finishCapture(false);
            return;
        }

        if (
            !layerContainerRef.current ||
            !selectLayerActionRef.current ||
            !monitorInfoRef.current ||
            !drawLayerActionRef.current ||
            !drawCacheLayerActionRef.current ||
            !fixedContentActionRef.current ||
            !ocrBlocksActionRef.current
        ) {
            return;
        }

        saveCurrentSelectRect();

        await fixedToScreen(
            monitorInfoRef.current,
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
            !monitorInfoRef.current ||
            !selectLayerActionRef.current ||
            !drawLayerActionRef.current ||
            !drawCacheLayerActionRef.current ||
            !ocrBlocksActionRef.current
        ) {
            return;
        }

        handleOcrDetect(
            monitorInfoRef.current,
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
            const filePath = (await getImagePathFromSettings(getAppSettings(), 'auto'))?.filePath;
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

        if (getDrawState() === DrawState.OcrDetect) {
            const ocrResult = ocrBlocksActionRef.current?.getOcrResultAction()?.getOcrResult();
            navigator.clipboard.writeText(ocrResult ? covertOcrResultToText(ocrResult) : '');
            finishCapture();
            return;
        } else if (
            (getDrawState() === DrawState.OcrDetect || getDrawState() === DrawState.ScanQrcode) &&
            selected &&
            selected.toString()
        ) {
            navigator.clipboard.writeText(selected.toString());
            finishCapture();
            return;
        } else {
            if (
                !selectLayerActionRef.current ||
                !drawLayerActionRef.current ||
                !drawCacheLayerActionRef.current
            ) {
                return;
            }

            await copyToClipboard(
                selectLayerActionRef.current,
                drawLayerActionRef.current,
                drawCacheLayerActionRef.current,
                enableAutoSave
                    ? undefined
                    : async () => {
                          finishCapture();
                      },
            );
        }

        if (enableAutoSave) {
            await saveToFile(
                getAppSettings(),
                selectLayerActionRef.current,
                drawLayerActionRef.current,
                drawCacheLayerActionRef.current,
                async () => {
                    finishCapture();
                },
                undefined,
                await getImagePathFromSettings(getAppSettings(), 'auto'),
            );
        }
    }, [finishCapture, getAppSettings, getDrawState, saveCurrentSelectRect]);

    const releaseExecuteScreenshotTimerRef = useRef<
        | {
              timer: NodeJS.Timeout | undefined;
              type: ScreenshotType;
          }
        | undefined
    >(undefined);

    const recoveryWindowFocus = useMemo(() => {
        return debounce(() => {
            if (appWindowRef.current) {
                appWindowRef.current.setFocus();
            }
        }, 128);
    }, []);

    useEffect(() => {
        if (isFixed) {
            return;
        }

        // 监听截图命令
        const listenerId = addListener('execute-screenshot', (args) => {
            const payload = (args as { payload: { type: ScreenshotType } }).payload;

            if (capturingRef.current) {
                return;
            }

            if (drawPageStateRef.current === DrawPageState.Init) {
                return;
            } else if (drawPageStateRef.current === DrawPageState.Release) {
                // 这时候可能窗口还在加载中，每隔一段时间触发下截图
                if (releaseExecuteScreenshotTimerRef.current?.timer) {
                    clearInterval(releaseExecuteScreenshotTimerRef.current.timer);
                }
                releaseExecuteScreenshotTimerRef.current = {
                    timer: setInterval(() => {
                        executeScreenshotFunc(payload.type);
                    }, 128),
                    type: payload.type,
                };

                return;
            } else if (drawPageStateRef.current === DrawPageState.WaitRelease) {
                // 重置为激活状态
                drawPageStateRef.current = DrawPageState.Active;
            }

            excuteScreenshot(payload.type);
        });

        const finishListenerId = addListener('finish-screenshot', () => {
            finishCapture();
        });

        const releaseListenerId = addListener('release-draw-page', () => {
            if (drawPageStateRef.current !== DrawPageState.Release) {
                return;
            }

            if (releaseExecuteScreenshotTimerRef.current?.timer) {
                clearInterval(releaseExecuteScreenshotTimerRef.current.timer);
                executeScreenshotFunc(releaseExecuteScreenshotTimerRef.current.type);
            }

            setTimeout(() => {
                getCurrentWindow().close();
            }, 0);
        });

        const uiAutomationTryFocusListenerId = addListener('ui-automation-try-focus', () => {
            recoveryWindowFocus();
        });

        return () => {
            removeListener(listenerId);
            removeListener(finishListenerId);
            removeListener(releaseListenerId);
            removeListener(uiAutomationTryFocusListenerId);
        };
    }, [
        addListener,
        excuteScreenshot,
        removeListener,
        isFixed,
        finishCapture,
        releasePage,
        recoveryWindowFocus,
    ]);

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
            monitorInfoRef,
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
            if (e.button === 0) {
                onCopyToClipboard();
            }
        },
        [onCopyToClipboard],
    );

    useEffect(() => {
        drawLayerActionRef.current?.initCanvas(false).then(() => {
            drawPageStateRef.current = DrawPageState.Active;
            releaseDrawPage();
        });
    }, []);

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
                    disabled={!isFixed}
                />

                {!isFixed && (
                    <>
                        <ExtraTool finishCapture={finishCapture} />

                        <OcrBlocks actionRef={ocrBlocksActionRef} finishCapture={finishCapture} />

                        <div className={styles.drawLayerWrap} ref={drawLayerWrapRef}>
                            <DrawLayer actionRef={drawLayerActionRef} />
                            <DrawCacheLayer actionRef={drawCacheLayerActionRef} />
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
