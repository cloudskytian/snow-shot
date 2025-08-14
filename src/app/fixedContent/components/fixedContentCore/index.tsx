import { AppSettingsData, AppSettingsGroup, AppSettingsPublisher } from '@/app/contextWrap';
import { ElementRect, saveFile, getMousePosition } from '@/commands';
import { useStateRef } from '@/hooks/useStateRef';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { LogicalPosition, PhysicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { Menu, MenuItemOptions } from '@tauri-apps/api/menu';
import { getCurrentWindow, Window as AppWindow } from '@tauri-apps/api/window';
import { Button, theme } from 'antd';
import {
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import * as dialog from '@tauri-apps/plugin-dialog';
import { generateImageFileName, ImageFormat } from '@/utils/file';
import { closeWindowComplete } from '@/utils/window';
import { useCallbackRender } from '@/hooks/useCallbackRender';
import { zIndexs } from '@/utils/zIndex';
import { CloseOutlined } from '@ant-design/icons';
import { AppOcrResult, OcrResult, OcrResultActionType } from '../ocrResult';
import * as clipboard from '@tauri-apps/plugin-clipboard-manager';
import { KeyEventKey, KeyEventValue } from '@/core/hotKeys';
import { useHotkeys } from 'react-hotkeys-hook';
import {
    getCurrentMonitorInfo,
    MonitorInfo,
    setCurrentWindowAlwaysOnTop,
    startFreeDrag,
} from '@/commands/core';
import { setDrawWindowStyle } from '@/commands/screenshot';
import * as htmlToImage from 'html-to-image';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
    writeHtmlToClipboard,
    writeImageToClipboard,
    writeTextToClipboard,
} from '@/utils/clipboard';
import { TweenAnimation } from '@/utils/tweenAnimation';
import * as TWEEN from '@tweenjs/tween.js';
import { MousePosition } from '@/utils/mousePosition';
import { CaptureBoundingBoxInfo } from '@/app/draw/extra';
import { useTextScaleFactor } from '@/hooks/useTextScaleFactor';
import { AntdContext } from '@/components/globalLayoutExtra';

export type FixedContentInitDrawParams = {
    captureBoundingBoxInfo: CaptureBoundingBoxInfo;
    canvas: HTMLCanvasElement;
    /** 已有的 OCR 结果 */
    ocrResult: AppOcrResult | undefined;
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
    onImageLoad?: (image: HTMLImageElement | null, monitorInfo: MonitorInfo) => void;
    disabled?: boolean;
}> = ({ actionRef, onDrawLoad, onHtmlLoad, onTextLoad, onImageLoad, disabled }) => {
    const intl = useIntl();
    const { token } = theme.useToken();
    const { message } = useContext(AntdContext);
    const [hotkeys, setHotkeys] = useState<Record<KeyEventKey, KeyEventValue> | undefined>(
        undefined,
    );
    const [fixedBorderColor, setFixedBorderColor] = useState<string | undefined>(undefined);
    useStateSubscriber(
        AppSettingsPublisher,
        useCallback((settings: AppSettingsData) => {
            setFixedBorderColor(settings[AppSettingsGroup.FixedContent].borderColor);
            setHotkeys(settings[AppSettingsGroup.KeyEvent]);
        }, []),
    );

    const appWindowRef = useRef<AppWindow | undefined>(undefined);
    useEffect(() => {
        appWindowRef.current = getCurrentWindow();
    }, []);

    const [getAppSettings] = useStateSubscriber(AppSettingsPublisher, undefined);
    const ocrResultActionRef = useRef<OcrResultActionType>(undefined);
    const [windowSize, setWindowSize, windowSizeRef] = useStateRef<{
        width: number;
        height: number;
    }>({
        width: 0,
        height: 0,
    });
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
    const [scale, setScale, scaleRef] = useStateRef<{
        x: number;
        y: number;
    }>({
        x: 100,
        y: 100,
    });

    const [fixedContentType, setFixedContentType] = useState<FixedContentType | undefined>(
        undefined,
    );
    const [enableSelectText, setEnableSelectText] = useState(false);
    const dragRegionMouseDownMousePositionRef = useRef<MousePosition>(undefined);

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

                        // 拦截 a 标签的跳转操作
                        document.addEventListener('click', (e) => {
                            const target = e.target;
                            
                            // 检查点击的是否是 a 标签或其子元素
                            const linkElement = target.closest ? target.closest('a') : null;
                            
                            if (linkElement && linkElement.href) {
                                e.preventDefault(); // 阻止默认跳转行为
                                
                                window.parent.postMessage({
                                    type: 'linkClick',
                                    href: linkElement.href,
                                    text: linkElement.textContent || linkElement.innerText || '',
                                    target: linkElement.target || '_self'
                                }, '*');
                            }
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
                        setWindowSize({
                            width: textContentContainerRef.current.clientWidth,
                            height: textContentContainerRef.current.clientHeight,
                        });
                        canvasPropsRef.current = {
                            width:
                                textContentContainerRef.current.clientWidth *
                                window.devicePixelRatio,
                            height:
                                textContentContainerRef.current.clientHeight *
                                window.devicePixelRatio,
                            scaleFactor: window.devicePixelRatio,
                        };
                    }
                }, timeout);
            }, 17);
        },
        [onTextLoad, setWindowSize, setTextContent],
    );

    const initOcrParams = useRef<{
        selectRect: ElementRect;
        canvas: HTMLCanvasElement;
        captureBoundingBoxInfo: CaptureBoundingBoxInfo;
        ocrResult: undefined;
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

            const { canvas, captureBoundingBoxInfo } = params;

            const ocrRect = {
                min_x: 0,
                min_y: 0,
                max_x: canvas.width,
                max_y: canvas.height,
            };
            if (
                !getAppSettings()[AppSettingsGroup.FunctionFixedContent].autoOcr &&
                !params.ocrResult
            ) {
                initOcrParams.current = {
                    selectRect: ocrRect,
                    captureBoundingBoxInfo,
                    canvas,
                    ocrResult: params.ocrResult,
                };
            }

            const scaleFactor = await getCurrentWindow().scaleFactor();
            setWindowSize({
                width: canvas.width / scaleFactor,
                height: canvas.height / scaleFactor,
            });
            canvasPropsRef.current = {
                width: canvas.width,
                height: canvas.height,
                scaleFactor: scaleFactor,
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
                getAppSettings()[AppSettingsGroup.FunctionFixedContent].autoOcr &&
                ocrResultActionRef.current
            ) {
                ocrResultActionRef.current.init({
                    selectRect: {
                        min_x: 0,
                        min_y: 0,
                        max_x: canvas.width,
                        max_y: canvas.height,
                    },
                    captureBoundingBoxInfo,
                    canvas,
                    ocrResult: params.ocrResult,
                });
            }
        },
        [getAppSettings, setWindowSize],
    );

    useImperativeHandle(
        actionRef,
        () => ({
            init: async (params) => {
                setCurrentWindowAlwaysOnTop(true);

                if ('htmlContent' in params) {
                    initHtml(params.htmlContent);
                } else if ('textContent' in params) {
                    initText(params.textContent);
                } else if ('canvas' in params) {
                    await initDraw(params);
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

    const [isThumbnail, setIsThumbnail, isThumbnailRef] = useStateRef(false);
    const originWindowSizeAndPositionRef = useRef<
        | {
              size: PhysicalSize;
              position: PhysicalPosition;
              scale: {
                  x: number;
                  y: number;
              };
          }
        | undefined
    >(undefined);

    const switchThumbnailAnimationRef = useRef<
        | TweenAnimation<{
              width: number;
              height: number;
              x: number;
              y: number;
          }>
        | undefined
    >(undefined); // 切换缩略图的动画

    const switchThumbnail = useCallback(async () => {
        if (!switchThumbnailAnimationRef.current) {
            switchThumbnailAnimationRef.current = new TweenAnimation<{
                width: number;
                height: number;
                x: number;
                y: number;
            }>(
                {
                    width: 0,
                    height: 0,
                    x: 0,
                    y: 0,
                },
                TWEEN.Easing.Quadratic.Out,
                128,
                ({ width, height, x, y }) => {
                    const appWindow = appWindowRef.current;
                    if (!appWindow) {
                        return;
                    }

                    appWindow.setSize(new PhysicalSize(Math.round(width), Math.round(height)));
                    appWindow.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));

                    // 切换缩略图时，不会触发 mouse up 事件，这里清除下
                    dragRegionMouseDownMousePositionRef.current = undefined;
                },
            );
        }

        const appWindow = appWindowRef.current;
        if (!appWindow) {
            return;
        }

        setDrawWindowStyle();

        if (originWindowSizeAndPositionRef.current) {
            switchThumbnailAnimationRef.current.update({
                width: originWindowSizeAndPositionRef.current.size.width,
                height: originWindowSizeAndPositionRef.current.size.height,
                x: originWindowSizeAndPositionRef.current.position.x,
                y: originWindowSizeAndPositionRef.current.position.y,
            });
            setScale({
                x: originWindowSizeAndPositionRef.current.scale.x,
                y: originWindowSizeAndPositionRef.current.scale.y,
            });
            originWindowSizeAndPositionRef.current = undefined;
            setIsThumbnail(false);
        } else {
            const [windowSize, windowPosition] = await Promise.all([
                appWindow.innerSize(),
                appWindow.outerPosition(),
            ]);

            switchThumbnailAnimationRef.current.update(
                {
                    width: windowSize.width,
                    height: windowSize.height,
                    x: windowPosition.x,
                    y: windowPosition.y,
                },
                true,
            );

            originWindowSizeAndPositionRef.current = {
                size: windowSize,
                position: windowPosition,
                scale: {
                    x: scaleRef.current.x,
                    y: scaleRef.current.y,
                },
            };

            const thumbnailSize = Math.floor(42 * window.devicePixelRatio);

            // 获取当前鼠标位置
            const [mouseX, mouseY] = await getMousePosition();

            // 计算缩略图窗口的新位置，使其以鼠标为中心
            const newX = Math.round(mouseX - thumbnailSize / 2);
            const newY = Math.round(mouseY - thumbnailSize / 2);

            // 同时设置窗口大小和位置
            switchThumbnailAnimationRef.current.update({
                width: thumbnailSize,
                height: thumbnailSize,
                x: newX,
                y: newY,
            });

            setScale({
                x: Math.round(
                    (thumbnailSize / (windowSize.width / (scaleRef.current.x / 100))) * 100,
                ),
                y: Math.round(
                    (thumbnailSize / (windowSize.height / (scaleRef.current.y / 100))) * 100,
                ),
            });

            setIsThumbnail(true);
        }
    }, [scaleRef, setIsThumbnail, setScale]);

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

                            await writeImageToClipboard(blobRef.current);
                        } else if (
                            fixedContentType === FixedContentType.Html &&
                            originHtmlContentRef.current
                        ) {
                            await writeHtmlToClipboard(originHtmlContentRef.current);
                        } else if (
                            fixedContentType === FixedContentType.Text &&
                            textContentRef.current
                        ) {
                            await writeTextToClipboard(textContentRef.current);
                        } else if (
                            fixedContentType === FixedContentType.Image &&
                            imageBlobRef.current
                        ) {
                            // 这里的图片类型不确定，浏览器不一定支持，所以通过本地 API 写入
                            const arrayBuffer = await imageBlobRef.current.arrayBuffer();
                            await clipboard.writeImage(arrayBuffer);
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
                                  } else if (fixedContentType === FixedContentType.Image) {
                                      // 这种情况说明是从本地路径读取的图片
                                      htmlElement = imageRef.current;
                                  }

                                  if (!htmlElement) {
                                      return;
                                  }

                                  htmlToImage.toBlob(htmlElement).then(async (blob) => {
                                      if (!blob) {
                                          return;
                                      }

                                      await saveFile(
                                          filePath,
                                          await blob.arrayBuffer(),
                                          ImageFormat.PNG,
                                      );
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
                                      monitorScaleFactor: window.devicePixelRatio,
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
            ].filter((item) => item !== undefined) as MenuItemOptions[],
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

    const textScaleFactor = useTextScaleFactor();
    const contentScaleFactor = useMemo(() => {
        if (canvasImageUrl || imageUrl) {
            return textScaleFactor;
        }
        return 1;
    }, [canvasImageUrl, imageUrl, textScaleFactor]);

    const scaleWindow = useCallback(
        async (scaleDelta: number) => {
            const appWindow = appWindowRef.current;
            if (!appWindow) {
                return;
            }

            if (!windowSizeRef.current.width) {
                return;
            }

            if (originWindowSizeAndPositionRef.current) {
                switchThumbnail();
                return;
            }

            const zoomWithMouse =
                getAppSettings()[AppSettingsGroup.FunctionFixedContent].zoomWithMouse;

            let targetScale = scaleRef.current.x + scaleDelta;

            if (targetScale <= 20) {
                targetScale = 20;
            } else if (targetScale >= 500) {
                targetScale = 500;
            }

            if (targetScale === scaleRef.current.x) {
                return;
            }

            setDrawWindowStyle();

            // 计算新的窗口尺寸
            const newWidth = Math.round(
                ((canvasPropsRef.current.width * targetScale) / 100) *
                    (window.devicePixelRatio /
                        (canvasPropsRef.current.scaleFactor * textScaleFactor)),
            );
            const newHeight = Math.round(
                ((canvasPropsRef.current.height * targetScale) / 100) *
                    (window.devicePixelRatio /
                        (canvasPropsRef.current.scaleFactor * textScaleFactor)),
            );

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
                        appWindow.setPosition(new PhysicalPosition(newX, newY)),
                    ]);
                } catch (error) {
                    console.error('Error during mouse-centered scaling:', error);
                    // 如果出错，回退到普通缩放
                    await Promise.all([appWindow.setSize(new PhysicalSize(newWidth, newHeight))]);
                }
            } else {
                // 普通缩放，只改变窗口大小
                await Promise.all([appWindow.setSize(new PhysicalSize(newWidth, newHeight))]);
            }

            setScale({
                x: targetScale,
                y: targetScale,
            });
            ocrResultActionRef.current?.setScale(targetScale);
            showScaleInfoTemporary();
        },
        [
            getAppSettings,
            scaleRef,
            setScale,
            showScaleInfoTemporary,
            switchThumbnail,
            textScaleFactor,
            windowSizeRef,
        ],
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
            const { type, x, y, deltaY, width, height, href } = event.data;

            if (
                (type === 'bodySize' || type === 'resize') &&
                htmlContentContainerRef.current &&
                canvasPropsRef.current.width == 0
            ) {
                if (width === 200 && type !== 'resize') {
                    htmlContentContainerRef.current!.style.width = `${800}px`;
                    return;
                }

                htmlContentContainerRef.current!.style.width = `${width}px`;
                htmlContentContainerRef.current!.style.height = `${height}px`;
                onHtmlLoad?.({
                    width: width * window.devicePixelRatio,
                    height: height * window.devicePixelRatio,
                });

                setWindowSize({
                    width: width,
                    height: height,
                });
                canvasPropsRef.current = {
                    width: width * window.devicePixelRatio,
                    height: height * window.devicePixelRatio,
                    scaleFactor: window.devicePixelRatio,
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
            } else if (type === 'linkClick') {
                openUrl(href);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [onHtmlLoad, setWindowSize, handleContextMenu, onWheel]);

    useHotkeys(hotkeys?.[KeyEventKey.FixedContentSwitchThumbnail]?.hotKey ?? '', switchThumbnail, {
        keyup: false,
        keydown: true,
        enabled: !disabled,
        preventDefault: true,
    });

    useHotkeys(hotkeys?.[KeyEventKey.FixedContentCloseWindow]?.hotKey ?? '', closeWindowComplete, {
        keyup: false,
        keydown: true,
        enabled: !disabled,
        preventDefault: true,
    });

    const onDoubleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            e.preventDefault();
            switchThumbnail();
        },
        [switchThumbnail],
    );

    const onDragRegionMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        dragRegionMouseDownMousePositionRef.current = undefined;

        if (e.button === 0) {
            dragRegionMouseDownMousePositionRef.current = new MousePosition(e.clientX, e.clientY);
        }
    }, []);
    const onDragRegionMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!dragRegionMouseDownMousePositionRef.current) {
                return;
            }

            const distance = dragRegionMouseDownMousePositionRef.current.getDistance(
                new MousePosition(e.clientX, e.clientY),
            );
            // 缩略模式降低拖拽阈值
            if (distance > 6 || (isThumbnailRef.current && distance > 2)) {
                dragRegionMouseDownMousePositionRef.current = undefined;
                startFreeDrag().catch((error) => {
                    console.error('[FixedContentCore] startFreeDrag error', error);
                    message.error(<FormattedMessage id="draw.captureAllMonitorsError" />);
                });
            }
        },
        [isThumbnailRef],
    );
    const onDragRegionMouseUp = useCallback(() => {
        dragRegionMouseDownMousePositionRef.current = undefined;
    }, []);

    return (
        <div
            className="fixed-image-container"
            style={{
                position: 'absolute',
                width: `${windowSize.width / contentScaleFactor}px`,
                height: `${windowSize.height / contentScaleFactor}px`,
                zIndex: zIndexs.Draw_FixedImage,
                pointerEvents:
                    canvasImageUrl || htmlBlobUrl || textContent || imageUrl ? 'auto' : 'none',
                opacity: isThumbnail ? 0.72 : 1,
                userSelect: isThumbnail ? 'none' : undefined,
            }}
            onContextMenu={handleContextMenu}
            onDoubleClick={onDoubleClick}
        >
            <OcrResult
                actionRef={ocrResultActionRef}
                zIndex={1}
                onWheel={onWheel}
                onContextMenu={handleContextMenu}
            />

            {(canvasImageUrl || imageUrl) && (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={canvasImageUrl || imageUrl || ''}
                        ref={imageUrl ? imageRef : undefined}
                        style={{
                            objectFit: 'contain',
                            width: `${(windowSize.width * scale.x) / 100 / contentScaleFactor}px`,
                            height: `${(windowSize.height * scale.y) / 100 / contentScaleFactor}px`,
                        }}
                        alt="fixed-canvas-image"
                        onLoad={async (event) => {
                            if (imageUrl) {
                                const image = event.target as HTMLImageElement;
                                const monitorInfo = await getCurrentMonitorInfo();
                                onImageLoad?.(image, monitorInfo);

                                const imageWidth =
                                    image.naturalWidth / monitorInfo.monitor_scale_factor;
                                const imageHeight =
                                    image.naturalHeight / monitorInfo.monitor_scale_factor;

                                setWindowSize({
                                    width: imageWidth,
                                    height: imageHeight,
                                });
                                canvasPropsRef.current = {
                                    width: image.naturalWidth,
                                    height: image.naturalHeight,
                                    scaleFactor: monitorInfo.monitor_scale_factor,
                                };
                            } else {
                                onDrawLoad?.();
                            }
                        }}
                    />
                </>
            )}

            {htmlBlobUrl && (
                <iframe
                    style={{
                        transformOrigin: 'top left',
                        transform: `scale(${scale.x / 100 / contentScaleFactor}, ${scale.y / 100 / contentScaleFactor})`,
                    }}
                    ref={htmlContentContainerRef}
                    src={htmlBlobUrl}
                    className="fixed-html-content"
                />
            )}

            {textContent && (
                <div
                    style={{
                        transformOrigin: 'top left',
                        transform: `scale(${scale.x / 100 / contentScaleFactor}, ${scale.y / 100 / contentScaleFactor})`,
                    }}
                >
                    <div ref={textContentContainerRef} className="fixed-text-content">
                        <div>{textContent}</div>
                    </div>
                </div>
            )}

            <div
                className="fixed-image-container-inner"
                onWheel={onWheel}
                onMouseDown={onDragRegionMouseDown}
                onMouseMove={onDragRegionMouseMove}
                onMouseUp={onDragRegionMouseUp}
            >
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
                    {scale.x}%
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

                /* 
                 * 窗口过小的情况下隐藏关闭按钮
                 */
                @media screen and (max-width: 128px) {
                    .fixed-image-container :global(.fixed-image-close-button) {
                        display: none !important;
                    }
                }

                @media screen and (max-height: 64px) {
                    .fixed-image-container :global(.fixed-image-close-button) {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
};
