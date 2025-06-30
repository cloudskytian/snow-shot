import { AppSettingsData, AppSettingsGroup, AppSettingsPublisher } from '@/app/contextWrap';
import { ElementRect, saveFile, getMousePosition } from '@/commands';
import { useStateRef } from '@/hooks/useStateRef';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { LogicalPosition, PhysicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { Menu } from '@tauri-apps/api/menu';
import { getCurrentWindow, Window as AppWindow } from '@tauri-apps/api/window';
import { Button, theme } from 'antd';
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import * as dialog from '@tauri-apps/plugin-dialog';
import { generateImageFileName, ImageFormat } from '@/utils/file';
import { closeWindowComplete } from '@/utils/window';
import { useCallbackRender } from '@/hooks/useCallbackRender';
import { zIndexs } from '@/utils/zIndex';
import Image from 'next/image';
import { CloseOutlined } from '@ant-design/icons';
import { OcrResult, OcrResultActionType } from '../ocrResult';
import clipboard from 'tauri-plugin-clipboard-api';
import { KeyEventKey, KeyEventValue } from '@/core/hotKeys';
import { useHotkeys } from 'react-hotkeys-hook';
import { enableFreeDrag, MonitorInfo } from '@/commands/core';
import { getCurrentWebview, Webview } from '@tauri-apps/api/webview';
import { setDrawWindowStyle } from '@/commands/screenshot';
import html2canvas from 'html2canvas';

export type FixedContentInitDrawParams = {
    monitorInfo: MonitorInfo;
    canvas: HTMLCanvasElement;
};

export type FixedContentInitHtmlParams = {
    htmlContent: string;
};

export type FixedContentInitTextParams = {
    textContent: string;
};

export type FixedContentInitImageParams = {
    imageContent: Blob | string;
};

export type FixedContentActionType = {
    init: (
        params:
            | FixedContentInitDrawParams
            | FixedContentInitHtmlParams
            | FixedContentInitTextParams
            | FixedContentInitImageParams,
    ) => Promise<void>;
};

export enum FixedContentType {
    DrawCanvas = 'drawCanvas',
    Html = 'html',
    Text = 'text',
    Image = 'image',
}

export const FixedContentCore: React.FC<{
    actionRef: React.RefObject<FixedContentActionType | undefined>;
    onDrawLoad?: () => void;
    onHtmlLoad?: ({ width, height }: { width: number; height: number }) => void;
    onTextLoad?: (container: HTMLDivElement | null) => void;
    onImageLoad?: (image: HTMLImageElement | null) => void;
    disabled?: boolean;
}> = ({ actionRef, onDrawLoad, onHtmlLoad, onTextLoad, onImageLoad, disabled }) => {
    const intl = useIntl();
    const { token } = theme.useToken();

    const [hotkeys, setHotkeys] = useState<Record<KeyEventKey, KeyEventValue> | undefined>(
        undefined,
    );
    const [fixedBorderColor, setFixedBorderColor] = useState<string | undefined>(undefined);
    useStateSubscriber(
        AppSettingsPublisher,
        useCallback((settings: AppSettingsData) => {
            setFixedBorderColor(settings[AppSettingsGroup.Screenshot].fixedBorderColor);
            setHotkeys(settings[AppSettingsGroup.KeyEvent]);
        }, []),
    );

    const appWindowRef = useRef<AppWindow | undefined>(undefined);
    const appWebViewRef = useRef<Webview | undefined>(undefined);
    useEffect(() => {
        appWindowRef.current = getCurrentWindow();
        appWebViewRef.current = getCurrentWebview();
    }, []);

    const [getAppSettings] = useStateSubscriber(AppSettingsPublisher, undefined);
    const ocrResultActionRef = useRef<OcrResultActionType>(undefined);
    const [style, setStyle, styleRef] = useStateRef<React.CSSProperties>({});
    const canvasPropsRef = useRef<{
        width: number;
        height: number;
        scaleFactor: number;
    }>({
        width: 0,
        height: 0,
        scaleFactor: 1,
    });
    const blobRef = useRef<Blob | undefined>(undefined);
    const [canvasImageUrl, setCanvasImageUrl] = useState<string | undefined>(undefined);
    const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
    const imageBlobRef = useRef<Blob | undefined>(undefined);

    const [fixedContentType, setFixedContentType] = useState<FixedContentType | undefined>(
        undefined,
    );
    const [enableSelectText, setEnableSelectText] = useState(false);

    const [htmlBlobUrl, setHtmlBlobUrl] = useState<string | undefined>(undefined);
    const originHtmlContentRef = useRef<string | undefined>(undefined);
    const htmlContentContainerRef = useRef<HTMLIFrameElement>(null);
    const initHtml = useCallback(
        (htmlContent: string) => {
            originHtmlContentRef.current = htmlContent;
            if (htmlContent.startsWith('<html>') && htmlContent.endsWith('</html>')) {
                htmlContent = `
                <html>
                  <style>
                        body {
                            width: fit-content;
                            height: fit-content;
                            margin: 0;
                            padding: ${token.padding}px;
                            overflow: hidden;
                            box-sizing: border-box;
                            background-color: ${token.colorBgContainer};
                        }
                    </style>
                    <script>
                       window.addEventListener('load', () => {
                            window.parent.postMessage({
                                type: 'bodySize',
                                width: document.body.offsetWidth,
                                height: document.body.offsetHeight,
                                clientWidth: document.body.clientWidth,
                                clientHeight: document.body.clientHeight,
                            }, '*');
                        });

                        window.addEventListener('resize', () => {
                            window.parent.postMessage({
                                type: 'resize',
                                width: document.body.offsetWidth,
                                height: document.body.offsetHeight,
                                clientWidth: document.body.clientWidth,
                                clientHeight: document.body.clientHeight,
                            }, '*');
                        });

                        document.addEventListener('contextmenu', (e) => {
                            e.preventDefault();
                            window.parent.postMessage({
                                type: 'contextMenu',
                                x: e.clientX,
                                y: e.clientY
                            }, '*');
                        });

                        document.addEventListener('wheel', (e) => {
                            e.preventDefault();
                            window.parent.postMessage({
                                type: 'wheel',
                                deltaY: e.deltaY,
                            }, '*');
                        });
                    </script>
                    ${htmlContent.slice(6, -7)}
                </html>`;
            }
            setFixedContentType(FixedContentType.Html);

            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);
            setHtmlBlobUrl(blobUrl);
        },
        [token.colorBgContainer, token.padding],
    );

    const [textContent, setTextContent, textContentRef] = useStateRef<string | undefined>(
        undefined,
    );
    const textContentContainerRef = useRef<HTMLDivElement>(null);
    const initText = useCallback(
        (textContent: string) => {
            setFixedContentType(FixedContentType.Text);

            setTextContent(textContent);
            setTimeout(() => {
                let timeout = 0;
                if (
                    textContentContainerRef.current &&
                    textContentContainerRef.current.clientWidth > 800 * window.devicePixelRatio
                ) {
                    textContentContainerRef.current.style.width = '800px';
                    textContentContainerRef.current.style.whiteSpace = 'normal';
                    timeout = 17;
                }

                setTimeout(() => {
                    onTextLoad?.(textContentContainerRef.current);

                    if (textContentContainerRef.current) {
                        setStyle({
                            width: `${textContentContainerRef.current.clientWidth}px`,
                            height: `${textContentContainerRef.current.clientHeight}px`,
                        });
                        canvasPropsRef.current = {
                            width:
                                textContentContainerRef.current.clientWidth *
                                window.devicePixelRatio,
                            height:
                                textContentContainerRef.current.clientHeight *
                                window.devicePixelRatio,
                            scaleFactor: 1,
                        };
                    }
                }, timeout);
            }, 17);
        },
        [onTextLoad, setStyle, setTextContent],
    );

    const initOcrParams = useRef<{
        selectRect: ElementRect;
        canvas: HTMLCanvasElement;
        monitorInfo: MonitorInfo;
    }>(undefined);

    const imageRef = useRef<HTMLImageElement>(null);
    const imageOcrSignRef = useRef<boolean>(false);
    const initImage = useCallback((imageContent: Blob | string) => {
        setFixedContentType(FixedContentType.Image);

        if (typeof imageContent === 'string') {
            setImageUrl(imageContent);
        } else {
            setImageUrl(URL.createObjectURL(imageContent));
            imageBlobRef.current = imageContent;
        }

        imageOcrSignRef.current = false;
    }, []);

    const initDraw = useCallback(
        async (params: FixedContentInitDrawParams) => {
            setFixedContentType(FixedContentType.DrawCanvas);

            const { canvas, monitorInfo } = params;

            const ocrRect = {
                min_x: 0,
                min_y: 0,
                max_x: canvas.width,
                max_y: canvas.height,
            };
            if (!getAppSettings()[AppSettingsGroup.FunctionScreenshot].autoOcrAfterFixed) {
                initOcrParams.current = {
                    selectRect: ocrRect,
                    monitorInfo,
                    canvas,
                };
            }

            setStyle({
                width: `${canvas.width / monitorInfo.monitor_scale_factor}px`,
                height: `${canvas.height / monitorInfo.monitor_scale_factor}px`,
            });
            canvasPropsRef.current = {
                width: canvas.width,
                height: canvas.height,
                scaleFactor: monitorInfo.monitor_scale_factor,
            };
            setCanvasImageUrl(
                await new Promise<string | undefined>((resolve) => {
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) {
                                resolve(undefined);
                                return;
                            }
                            blobRef.current = blob;
                            resolve(URL.createObjectURL(blob));
                        },
                        'image/png',
                        1,
                    );
                }),
            );

            if (
                getAppSettings()[AppSettingsGroup.FunctionScreenshot].autoOcrAfterFixed &&
                ocrResultActionRef.current
            ) {
                ocrResultActionRef.current.init({
                    selectRect: {
                        min_x: 0,
                        min_y: 0,
                        max_x: canvas.width,
                        max_y: canvas.height,
                    },
                    monitorInfo,
                    canvas,
                });
            }
        },
        [getAppSettings, setStyle],
    );

    useImperativeHandle(
        actionRef,
        () => ({
            init: async (params) => {
                setTimeout(() => {
                    setDrawWindowStyle();
                    enableFreeDrag();
                }, 128);

                if ('htmlContent' in params) {
                    initHtml(params.htmlContent);
                } else if ('textContent' in params) {
                    initText(params.textContent);
                } else if ('canvas' in params) {
                    initDraw(params);
                } else if ('imageContent' in params) {
                    initImage(params.imageContent);
                }
            },
        }),
        [initDraw, initHtml, initImage, initText],
    );

    useEffect(() => {
        const url = canvasImageUrl;

        return () => {
            if (!url) {
                return;
            }

            URL.revokeObjectURL(url);
        };
    }, [canvasImageUrl]);

    useEffect(() => {
        const blobUrl = htmlBlobUrl;

        return () => {
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
            }
        };
    }, [htmlBlobUrl]);

    const [isThumbnail, setIsThumbnail] = useState(false);
    const originWindowSizeAndPositionRef = useRef<
        | {
              size: PhysicalSize;
              position: PhysicalPosition;
          }
        | undefined
    >(undefined);
    const switchThumbnail = useCallback(async () => {
        const appWindow = appWindowRef.current;
        const appWebView = appWebViewRef.current;
        if (!appWindow || !appWebView) {
            return;
        }

        setDrawWindowStyle();

        if (originWindowSizeAndPositionRef.current) {
            await Promise.all([
                appWindow.setSize(originWindowSizeAndPositionRef.current.size),
                appWebView.setSize(originWindowSizeAndPositionRef.current.size),
                appWindow.setPosition(originWindowSizeAndPositionRef.current.position),
            ]);
            originWindowSizeAndPositionRef.current = undefined;
            setIsThumbnail(false);
        } else {
            const [windowSize, windowPosition] = await Promise.all([
                appWindow.innerSize(),
                appWindow.outerPosition(),
            ]);

            originWindowSizeAndPositionRef.current = {
                size: windowSize,
                position: windowPosition,
            };

            const thumbnailSize = Math.floor(42 * window.devicePixelRatio);

            // 获取当前鼠标位置
            const [mouseX, mouseY] = await getMousePosition();

            // 计算缩略图窗口的新位置，使其以鼠标为中心
            const newX = Math.round(mouseX - thumbnailSize / 2);
            const newY = Math.round(mouseY - thumbnailSize / 2);

            // 同时设置窗口大小和位置
            await Promise.all([
                appWindow.setSize(new PhysicalSize(thumbnailSize, thumbnailSize)),
                appWindow.setPosition(new PhysicalPosition(newX, newY)),
                appWebView.setSize(new PhysicalSize(thumbnailSize, thumbnailSize)),
            ]);

            setIsThumbnail(true);
        }
    }, []);

    const menuRef = useRef<Menu>(undefined);

    const initMenu = useCallback(async () => {
        const appWindow = appWindowRef.current;
        if (!appWindow) {
            return;
        }

        const menu = await Menu.new({
            items: [
                {
                    id: `${appWindow.label}-copyTool`,
                    text: intl.formatMessage({ id: 'draw.copyTool' }),
                    action: async () => {
                        if (fixedContentType === FixedContentType.DrawCanvas) {
                            if (!blobRef.current) {
                                return;
                            }

                            await navigator.clipboard.write([
                                new ClipboardItem({
                                    'image/png': blobRef.current,
                                }),
                            ]);
                        } else if (
                            fixedContentType === FixedContentType.Html &&
                            originHtmlContentRef.current
                        ) {
                            await navigator.clipboard.write([
                                new ClipboardItem({
                                    'text/html': originHtmlContentRef.current,
                                }),
                            ]);
                        } else if (
                            fixedContentType === FixedContentType.Text &&
                            textContentRef.current
                        ) {
                            await navigator.clipboard.write([
                                new ClipboardItem({
                                    'text/plain': textContentRef.current,
                                }),
                            ]);
                        } else if (
                            fixedContentType === FixedContentType.Image &&
                            imageBlobRef.current
                        ) {
                            const arrayBuffer = await imageBlobRef.current.arrayBuffer();
                            await clipboard.writeImageBinary(
                                Array.from(new Uint8Array(arrayBuffer)),
                            );
                        }
                    },
                },
                fixedContentType === FixedContentType.DrawCanvas ||
                fixedContentType === FixedContentType.Image ||
                fixedContentType === FixedContentType.Text ||
                fixedContentType === FixedContentType.Html
                    ? {
                          id: `${appWindow.label}-saveTool`,
                          text: intl.formatMessage({ id: 'draw.saveTool' }),
                          action: async () => {
                              const filePath = await dialog.save({
                                  filters: [
                                      {
                                          name: 'PNG(*.png)',
                                          extensions: ['png'],
                                      },
                                  ],
                                  defaultPath: generateImageFileName(
                                      getAppSettings()[AppSettingsGroup.FunctionOutput]
                                          .manualSaveFileNameFormat,
                                  ),
                                  canCreateDirectories: true,
                              });

                              if (!filePath) {
                                  return;
                              }

                              if (
                                  fixedContentType === FixedContentType.DrawCanvas &&
                                  blobRef.current
                              ) {
                                  await saveFile(
                                      filePath,
                                      await blobRef.current.arrayBuffer(),
                                      ImageFormat.PNG,
                                  );
                              } else if (
                                  fixedContentType === FixedContentType.Image &&
                                  imageBlobRef.current
                              ) {
                                  await saveFile(
                                      filePath,
                                      await imageBlobRef.current.arrayBuffer(),
                                      ImageFormat.PNG,
                                  );
                              } else {
                                  let htmlElement: HTMLElement | undefined | null;
                                  if (fixedContentType === FixedContentType.Html) {
                                      htmlElement =
                                          htmlContentContainerRef.current?.contentWindow?.document
                                              .body;
                                  } else if (fixedContentType === FixedContentType.Text) {
                                      htmlElement = textContentContainerRef.current;
                                  }

                                  if (!htmlElement) {
                                      return;
                                  }

                                  html2canvas(htmlElement).then(function (canvas) {
                                      canvas.toBlob(async (blob) => {
                                          if (!blob) {
                                              return;
                                          }
                                          await saveFile(
                                              filePath,
                                              await blob.arrayBuffer(),
                                              ImageFormat.PNG,
                                          );
                                      });
                                  });
                              }
                          },
                      }
                    : undefined,
                fixedContentType === FixedContentType.DrawCanvas ||
                fixedContentType === FixedContentType.Image
                    ? {
                          id: `${appWindow.label}-ocrTool`,
                          text: intl.formatMessage({ id: 'draw.showOrHideOcrResult' }),
                          action: async () => {
                              if (initOcrParams.current) {
                                  ocrResultActionRef.current?.init(initOcrParams.current);
                                  initOcrParams.current = undefined;
                              } else if (imageRef.current && !imageOcrSignRef.current) {
                                  ocrResultActionRef.current?.init({
                                      imageElement: imageRef.current,
                                      monitorScaleFactor: canvasPropsRef.current.scaleFactor,
                                  });
                                  imageOcrSignRef.current = true;
                              }

                              ocrResultActionRef.current?.setEnable((enable) => !enable);
                          },
                      }
                    : undefined,
                fixedContentType === FixedContentType.Html ||
                fixedContentType === FixedContentType.Text
                    ? {
                          id: `${appWindow.label}-selectTextTool`,
                          text: intl.formatMessage({ id: 'draw.selectText' }),
                          action: async () => {
                              setEnableSelectText((enable) => !enable);
                          },
                      }
                    : undefined,
                {
                    id: `${appWindow.label}-switchThumbnailTool`,
                    text: intl.formatMessage({ id: 'draw.switchThumbnail' }),
                    accelerator: hotkeys?.[KeyEventKey.FixedContentSwitchThumbnail]?.hotKey,
                    action: async () => {
                        switchThumbnail();
                    },
                },
                {
                    id: `${appWindow.label}-closeTool`,
                    text: intl.formatMessage({ id: 'draw.close' }),
                    accelerator: hotkeys?.[KeyEventKey.FixedContentCloseWindow]?.hotKey,
                    action: async () => {
                        await closeWindowComplete();
                    },
                },
            ].filter((item) => item !== undefined),
        });
        menuRef.current = menu;
    }, [intl, fixedContentType, hotkeys, textContentRef, getAppSettings, switchThumbnail]);

    useEffect(() => {
        initMenu();

        return () => {
            menuRef.current?.close();
            menuRef.current = undefined;
        };
    }, [initMenu]);

    const [scale, setScale, scaleRef] = useStateRef(100);
    const [showScaleInfo, setShowScaleInfo] = useState(false);
    const scaleTimerRef = useRef<NodeJS.Timeout | null>(null);

    const showScaleInfoTemporary = useCallback(() => {
        setShowScaleInfo(true);

        if (scaleTimerRef.current) {
            clearTimeout(scaleTimerRef.current);
        }

        scaleTimerRef.current = setTimeout(() => {
            setShowScaleInfo(false);
            scaleTimerRef.current = null;
        }, 1000);
    }, []);

    const scaleWindow = useCallback(
        async (scaleDelta: number) => {
            const appWindow = appWindowRef.current;
            const appWebView = appWebViewRef.current;
            if (!appWindow || !appWebView) {
                return;
            }

            if (!styleRef.current.width) {
                return;
            }

            if (originWindowSizeAndPositionRef.current) {
                switchThumbnail();
                return;
            }

            const zoomWithMouse =
                getAppSettings()[AppSettingsGroup.FunctionFixedContent].zoomWithMouse;

            let targetScale = scaleRef.current + scaleDelta;

            if (targetScale <= 20) {
                targetScale = 20;
            } else if (targetScale >= 500) {
                targetScale = 500;
            }

            if (targetScale === scaleRef.current) {
                return;
            }

            setDrawWindowStyle();

            // 计算新的窗口尺寸
            const newWidth = Math.round((canvasPropsRef.current.width * targetScale) / 100);
            const newHeight = Math.round((canvasPropsRef.current.height * targetScale) / 100);

            if (zoomWithMouse) {
                try {
                    // 获取当前鼠标位置和窗口位置
                    const [[mouseX, mouseY], currentPosition, currentSize] = await Promise.all([
                        getMousePosition(),
                        appWindow.outerPosition(),
                        appWindow.outerSize(),
                    ]);

                    // 计算鼠标相对于窗口的位置（比例）
                    const mouseRelativeX = (mouseX - currentPosition.x) / currentSize.width;
                    const mouseRelativeY = (mouseY - currentPosition.y) / currentSize.height;

                    // 计算缩放后窗口的新位置，使鼠标在窗口中的相对位置保持不变
                    const newX = Math.round(mouseX - newWidth * mouseRelativeX);
                    const newY = Math.round(mouseY - newHeight * mouseRelativeY);

                    // 同时设置窗口大小和位置
                    await Promise.all([
                        appWindow.setSize(new PhysicalSize(newWidth, newHeight)),
                        appWebView.setSize(new PhysicalSize(newWidth, newHeight)),
                        appWindow.setPosition(new PhysicalPosition(newX, newY)),
                    ]);
                } catch (error) {
                    console.error('Error during mouse-centered scaling:', error);
                    // 如果出错，回退到普通缩放
                    await Promise.all([
                        appWindow.setSize(new PhysicalSize(newWidth, newHeight)),
                        appWebView.setSize(new PhysicalSize(newWidth, newHeight)),
                    ]);
                }
            } else {
                // 普通缩放，只改变窗口大小
                await Promise.all([
                    appWindow.setSize(new PhysicalSize(newWidth, newHeight)),
                    appWebView.setSize(new PhysicalSize(newWidth, newHeight)),
                ]);
            }

            setScale(targetScale);
            ocrResultActionRef.current?.setScale(targetScale);
            showScaleInfoTemporary();
        },
        [getAppSettings, scaleRef, setScale, showScaleInfoTemporary, styleRef, switchThumbnail],
    );
    const scaleWindowRender = useCallbackRender(scaleWindow);

    useEffect(() => {
        return () => {
            if (scaleTimerRef.current) {
                clearTimeout(scaleTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        ocrResultActionRef.current?.setEnable(false);
    }, [getAppSettings]);

    const onWheel = useCallback(
        ({ deltaY }: { deltaY: number }) => {
            scaleWindowRender((deltaY > 0 ? -1 : 1) * 10);
        },
        [scaleWindowRender],
    );

    const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();

        menuRef.current?.popup(new LogicalPosition(e.clientX, e.clientY));
    }, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const { type, x, y, deltaY, width, height, clientWidth } = event.data;

            if ((type === 'bodySize' || type === 'resize') && htmlContentContainerRef.current) {
                if (clientWidth === 200 && type !== 'resize') {
                    htmlContentContainerRef.current!.style.width = `${800 * window.devicePixelRatio}px`;
                    return;
                }

                htmlContentContainerRef.current!.style.width = `${width}px`;
                htmlContentContainerRef.current!.style.height = `${height}px`;
                onHtmlLoad?.({ width, height });

                setStyle({
                    width: `${width}px`,
                    height: `${height}px`,
                });
                canvasPropsRef.current = {
                    width: width * window.devicePixelRatio,
                    height: height * window.devicePixelRatio,
                    scaleFactor: 1,
                };
            } else if (type === 'contextMenu') {
                // 处理来自iframe的右键菜单事件
                const syntheticEvent = {
                    preventDefault: () => {},
                    clientX: x,
                    clientY: y,
                } as React.MouseEvent<HTMLDivElement>;
                handleContextMenu(syntheticEvent);
            } else if (type === 'wheel') {
                onWheel({ deltaY: deltaY });
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [onHtmlLoad, setStyle, handleContextMenu, onWheel]);

    useHotkeys(hotkeys?.[KeyEventKey.FixedContentSwitchThumbnail]?.hotKey ?? '', switchThumbnail, {
        keyup: false,
        keydown: true,
        enabled: !disabled,
    });

    useHotkeys(hotkeys?.[KeyEventKey.FixedContentCloseWindow]?.hotKey ?? '', closeWindowComplete, {
        keyup: false,
        keydown: true,
        enabled: !disabled,
    });

    return (
        <div
            className="fixed-image-container"
            style={{
                position: 'absolute',
                ...style,
                zIndex: zIndexs.Draw_FixedImage,
                pointerEvents:
                    canvasImageUrl || htmlBlobUrl || textContent || imageUrl ? 'auto' : 'none',
            }}
            onContextMenu={handleContextMenu}
            onDoubleClick={switchThumbnail}
        >
            <OcrResult
                actionRef={ocrResultActionRef}
                zIndex={1}
                onWheel={onWheel}
                onContextMenu={handleContextMenu}
            />

            {canvasImageUrl && (
                <Image
                    src={canvasImageUrl}
                    objectFit="contain"
                    fill
                    alt="fixed-canvas-image"
                    onLoad={async () => {
                        onDrawLoad?.();
                    }}
                    style={{
                        transformOrigin: 'top left',
                        transform: `scale(${scale / 100})`,
                        userSelect: 'none',
                    }}
                />
            )}

            {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={imageUrl}
                    ref={imageRef}
                    alt="fixed-image"
                    onLoad={async (event) => {
                        const image = event.target as HTMLImageElement;
                        onImageLoad?.(image);

                        setStyle({
                            width: `${image.clientWidth / window.devicePixelRatio}px`,
                            height: `${image.clientHeight / window.devicePixelRatio}px`,
                        });
                        canvasPropsRef.current = {
                            width: image.clientWidth,
                            height: image.clientHeight,
                            scaleFactor: window.devicePixelRatio,
                        };
                    }}
                    style={{
                        transformOrigin: 'top left',
                        transform: `scale(${scale / 100 / window.devicePixelRatio})`,
                        userSelect: 'none',
                    }}
                />
            )}

            {htmlBlobUrl && (
                <iframe
                    ref={htmlContentContainerRef}
                    src={htmlBlobUrl}
                    className="fixed-html-content"
                />
            )}

            {textContent && (
                <div ref={textContentContainerRef} className="fixed-text-content">
                    <div>{textContent}</div>
                </div>
            )}

            <div className="fixed-image-container-inner" onWheel={onWheel} data-tauri-drag-region>
                <Button
                    className="fixed-image-close-button"
                    icon={<CloseOutlined />}
                    type="primary"
                    shape="circle"
                    variant="solid"
                    style={{
                        position: 'absolute',
                        top: token.margin,
                        right: token.margin,
                        opacity: 0,
                        transition: `all ${token.motionDurationFast} ${token.motionEaseInOut}`,
                        backgroundColor: token.colorBgMask,
                        zIndex: 2,
                        display: isThumbnail ? 'none' : 'block',
                    }}
                    onClick={() => {
                        closeWindowComplete();
                    }}
                />

                <div
                    className="scale-info"
                    data-tauri-drag-region
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        backgroundColor: token.colorBgMask,
                        color: token.colorWhite,
                        padding: `${token.paddingXXS}px ${token.paddingSM}px`,
                        borderTopRightRadius: token.borderRadius,
                        fontSize: token.fontSizeSM,
                        zIndex: 10,
                        opacity: showScaleInfo ? 1 : 0,
                        transition: `opacity ${token.motionDurationFast} ${token.motionEaseInOut}`,
                    }}
                >
                    {scale}%
                </div>
            </div>

            <style jsx>{`
                .fixed-image-container:hover :global(.ant-btn.fixed-image-close-button) {
                    opacity: 1 !important;
                }

                .fixed-image-container :global(.ant-btn.fixed-image-close-button):hover {
                    background-color: ${token.colorError} !important;
                }

                .fixed-image-container-inner {
                    width: calc(100vw - 4px);
                    height: calc(100vh - 4px);
                    position: absolute;
                    top: 0;
                    left: 0;
                    cursor: grab;
                    box-sizing: border-box;
                    margin: 2px;
                }

                .fixed-image-container-inner:after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    box-shadow: 0 0 2px 2px ${fixedBorderColor ?? token.colorBorder};
                    z-index: 9;
                    pointer-events: none;
                }

                .fixed-image-container-inner:active {
                    cursor: grabbing;
                }

                .fixed-html-content,
                .fixed-text-content {
                    transform-origin: top left;
                    transform: scale(${scale / 100});
                    z-index: ${enableSelectText ? 1 : 'unset'};
                    position: absolute;
                    top: 0;
                    left: 0;
                    border: unset !important;
                }

                .fixed-html-content {
                    width: 200px;
                    height: 0px;
                    user-select: none;
                }

                .fixed-text-content {
                    width: auto;
                    white-space: pre;
                    background-color: ${token.colorBgContainer};
                    color: ${token.colorText};
                    padding: ${token.padding}px;
                    box-sizing: border-box;
                }

                .fixed-html-content > :global(div):first-child {
                    padding: ${token.padding}px;
                }
            `}</style>
        </div>
    );
};
