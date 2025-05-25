import { AppSettingsData, AppSettingsGroup, AppSettingsPublisher } from '@/app/contextWrap';
import { ElementRect, saveFile } from '@/commands';

import { ImageBuffer } from '@/commands';
import { useStateRef } from '@/hooks/useStateRef';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { LogicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { Menu } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
import sanitizeHtml from 'sanitize-html';
import clipboard from 'tauri-plugin-clipboard-api';

export type FixedContentInitDrawParams = {
    imageBuffer: ImageBuffer;
    canvas: HTMLCanvasElement;
};

export type FixedContentInitHtmlParams = {
    htmlContent: string;
};

export type FixedContentInitTextParams = {
    textContent: string;
};

export type FixedContentInitImageParams = {
    imageBlob: Blob;
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
    onHtmlLoad?: (container: HTMLDivElement | null) => void;
    onTextLoad?: (container: HTMLDivElement | null) => void;
    onImageLoad?: (image: HTMLImageElement | null) => void;
}> = ({ actionRef, onDrawLoad, onHtmlLoad, onTextLoad, onImageLoad }) => {
    const intl = useIntl();
    const { token } = theme.useToken();

    const [fixedBorderColor, setFixedBorderColor] = useState<string | undefined>(undefined);
    useStateSubscriber(
        AppSettingsPublisher,
        useCallback((settings: AppSettingsData) => {
            setFixedBorderColor(settings[AppSettingsGroup.Screenshot].fixedBorderColor);
        }, []),
    );

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

    const [htmlContent, setHtmlContent] = useState<string | undefined>(undefined);
    const originHtmlContentRef = useRef<string | undefined>(undefined);
    const htmlContentContainerRef = useRef<HTMLDivElement>(null);
    const initHtml = useCallback(
        (htmlContent: string) => {
            setFixedContentType(FixedContentType.Html);

            const sanitizedHtml = sanitizeHtml(htmlContent, {
                allowedTags: ['b', 'i', 'em', 'strong', 'a', 'span', 'div'],
                allowedAttributes: {
                    a: ['href'],
                    span: ['style'],
                    div: ['style'],
                },
                allowedIframeHostnames: [],
            });
            originHtmlContentRef.current = htmlContent;
            setHtmlContent(sanitizedHtml);
            setTimeout(() => {
                onHtmlLoad?.(htmlContentContainerRef.current);

                if (htmlContentContainerRef.current) {
                    setStyle({
                        width: `${htmlContentContainerRef.current.clientWidth}px`,
                        height: `${htmlContentContainerRef.current.clientHeight}px`,
                    });
                    canvasPropsRef.current = {
                        width:
                            htmlContentContainerRef.current.clientWidth * window.devicePixelRatio,
                        height:
                            htmlContentContainerRef.current.clientHeight * window.devicePixelRatio,
                        scaleFactor: 1,
                    };
                }
            }, 17);
        },
        [onHtmlLoad, setHtmlContent, setStyle],
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
                    textContentContainerRef.current.clientWidth > 1024
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
        imageBuffer: ImageBuffer;
        canvas: HTMLCanvasElement;
    }>(undefined);

    const imageRef = useRef<HTMLImageElement>(null);
    const imageOcrSignRef = useRef<boolean>(false);
    const initImage = useCallback((imageBlob: Blob) => {
        setFixedContentType(FixedContentType.Image);

        setImageUrl(URL.createObjectURL(imageBlob));
        imageBlobRef.current = imageBlob;
        imageOcrSignRef.current = false;
    }, []);

    const initDraw = useCallback(
        async (params: FixedContentInitDrawParams) => {
            setFixedContentType(FixedContentType.DrawCanvas);

            const { imageBuffer, canvas } = params;

            const ocrRect = {
                min_x: 0,
                min_y: 0,
                max_x: canvas.width,
                max_y: canvas.height,
            };
            if (!getAppSettings()[AppSettingsGroup.FunctionScreenshot].autoOcrAfterFixed) {
                initOcrParams.current = {
                    selectRect: ocrRect,
                    imageBuffer,
                    canvas,
                };
            }

            setStyle({
                width: `${canvas.width / imageBuffer.monitorScaleFactor}px`,
                height: `${canvas.height / imageBuffer.monitorScaleFactor}px`,
            });
            canvasPropsRef.current = {
                width: canvas.width,
                height: canvas.height,
                scaleFactor: imageBuffer.monitorScaleFactor,
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
                    imageBuffer,
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
                if ('htmlContent' in params) {
                    initHtml(params.htmlContent);
                } else if ('textContent' in params) {
                    initText(params.textContent);
                } else if ('imageBuffer' in params) {
                    initDraw(params);
                } else if ('imageBlob' in params) {
                    initImage(params.imageBlob);
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

    const menuRef = useRef<Menu>(undefined);

    const initMenu = useCallback(async () => {
        const window = getCurrentWindow();
        const menu = await Menu.new({
            items: [
                {
                    id: `${window.label}-copyTool`,
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
                                new ClipboardItem({ 'text/html': originHtmlContentRef.current }),
                            ]);
                        } else if (
                            fixedContentType === FixedContentType.Text &&
                            textContentRef.current
                        ) {
                            await navigator.clipboard.write([
                                new ClipboardItem({ 'text/plain': textContentRef.current }),
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
                fixedContentType === FixedContentType.Image
                    ? {
                          id: `${window.label}-saveTool`,
                          text: intl.formatMessage({ id: 'draw.saveTool' }),
                          action: async () => {
                              const filePath = await dialog.save({
                                  filters: [
                                      {
                                          name: 'PNG(*.png)',
                                          extensions: ['png'],
                                      },
                                  ],
                                  defaultPath: generateImageFileName(),
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
                              }
                          },
                      }
                    : undefined,
                fixedContentType === FixedContentType.DrawCanvas ||
                fixedContentType === FixedContentType.Image
                    ? {
                          id: `${window.label}-ocrTool`,
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
                          id: `${window.label}-selectTextTool`,
                          text: intl.formatMessage({ id: 'draw.selectText' }),
                          action: async () => {
                              setEnableSelectText((enable) => !enable);
                          },
                      }
                    : undefined,
                {
                    id: `${window.label}-closeTool`,
                    text: intl.formatMessage({ id: 'draw.close' }),
                    action: async () => {
                        await closeWindowComplete();
                    },
                },
            ].filter((item) => item !== undefined),
        });
        menuRef.current = menu;
    }, [intl, fixedContentType, textContentRef]);

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
            if (!styleRef.current.width) {
                return;
            }

            const window = getCurrentWindow();

            let targetScale = scaleRef.current + scaleDelta;

            if (targetScale <= 20) {
                targetScale = 20;
            } else if (targetScale >= 500) {
                targetScale = 500;
            }

            if (targetScale === scaleRef.current) {
                return;
            }

            setScale(targetScale);
            ocrResultActionRef.current?.setScale(targetScale);
            showScaleInfoTemporary();

            window.setSize(
                new PhysicalSize(
                    Math.round((canvasPropsRef.current.width * scaleRef.current) / 100),
                    Math.round((canvasPropsRef.current.height * scaleRef.current) / 100),
                ),
            );
        },
        [scaleRef, setScale, showScaleInfoTemporary, styleRef],
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
        (event: React.WheelEvent<HTMLDivElement>) => {
            scaleWindowRender((event.deltaY > 0 ? -1 : 1) * 10);
        },
        [scaleWindowRender],
    );

    return (
        <div
            className="fixed-image-container"
            style={{
                position: 'absolute',
                ...style,
                zIndex: zIndexs.Draw_FixedImage,
                pointerEvents:
                    canvasImageUrl || htmlContent || textContent || imageUrl ? 'auto' : 'none',
            }}
            onContextMenu={async (e) => {
                e.preventDefault();

                menuRef.current?.popup(new LogicalPosition(e.clientX, e.clientY));
            }}
        >
            <OcrResult actionRef={ocrResultActionRef} zIndex={1} onWheel={onWheel} />

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

            {htmlContent && (
                <div
                    ref={htmlContentContainerRef}
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                    className="fixed-html-content"
                />
            )}

            {textContent && (
                <div
                    ref={textContentContainerRef}
                    className="fixed-html-content fixed-text-content"
                >
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

                .fixed-html-content {
                    transform-origin: top left;
                    transform: scale(${scale / 100});
                    z-index: ${enableSelectText ? 1 : 'unset'};
                    position: absolute;
                    top: 0;
                    left: 0;
                }

                .fixed-text-content {
                    width: auto;
                    white-space: nowrap;
                }

                .fixed-html-content > :global(div):first-child {
                    padding: ${token.padding}px;
                }
            `}</style>
        </div>
    );
};
