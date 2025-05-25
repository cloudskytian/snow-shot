import { useCallback, useContext, useEffect, useImperativeHandle, useRef } from 'react';
import { ElementRect, ImageBuffer } from '@/commands';
import { ocrDetect, OcrDetectResult } from '@/commands/ocr';
import { FormattedMessage, useIntl } from 'react-intl';
import { theme } from 'antd';
import Color from 'color';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { Menu } from '@tauri-apps/api/menu';
import { useHotkeysApp } from '@/hooks/useHotkeysApp';
import { AntdContext } from '@/components/globalLayoutExtra';

// 定义角度阈值常量（以度为单位）
const ROTATION_THRESHOLD = 3; // 小于3度的旋转被视为误差，不进行旋转

export type OcrResultInitDrawCanvasParams = {
    selectRect: ElementRect;
    imageBuffer: ImageBuffer;
    canvas: HTMLCanvasElement;
};

export type OcrResultInitImageParams = {
    imageElement: HTMLImageElement;
    monitorScaleFactor: number;
};

export type OcrResultActionType = {
    init: (params: OcrResultInitDrawCanvasParams | OcrResultInitImageParams) => Promise<void>;
    setEnable: (enable: boolean | ((enable: boolean) => boolean)) => void;
    setScale: (scale: number) => void;
    clear: () => void;
    updateOcrTextElements: (ocrResult: OcrDetectResult) => void;
};

export const OcrResult: React.FC<{
    zIndex: number;
    actionRef: React.RefObject<OcrResultActionType | undefined>;
    onOcrDetect?: (ocrResult: OcrDetectResult) => void;
    onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
    onWheel?: (event: React.WheelEvent<HTMLDivElement>) => void;
}> = ({ zIndex, actionRef, onOcrDetect, onContextMenu: onContextMenuProp, onWheel }) => {
    const intl = useIntl();
    const { token } = theme.useToken();
    const { message } = useContext(AntdContext);

    const containerElementRef = useRef<HTMLDivElement>(null);
    const textContainerElementRef = useRef<HTMLDivElement>(null);

    const enableRef = useRef<boolean>(false);
    const setEnable = useCallback((enable: boolean | ((enable: boolean) => boolean)) => {
        if (!containerElementRef.current) {
            return;
        }

        if (typeof enable === 'function') {
            enableRef.current = enable(enableRef.current);
        } else {
            enableRef.current = enable;
        }

        if (enableRef.current) {
            containerElementRef.current.style.opacity = '1';
            containerElementRef.current.style.pointerEvents = 'auto';
        } else {
            containerElementRef.current.style.opacity = '0';
            containerElementRef.current.style.pointerEvents = 'none';
        }
    }, []);

    const selectRectRef = useRef<ElementRect>(undefined);
    const monitorScaleFactorRef = useRef<number>(undefined);
    const updateOcrTextElements = useCallback(
        (ocrResult: OcrDetectResult) => {
            const monitorScaleFactor = monitorScaleFactorRef.current;
            const selectRect = selectRectRef.current;

            if (!monitorScaleFactor || !selectRect) {
                return;
            }

            const transformScale = 1 / monitorScaleFactor;

            const baseX = selectRect.min_x * transformScale;
            const baseY = selectRect.min_y * transformScale;

            const textContainerElement = textContainerElementRef.current;
            if (!textContainerElement) {
                return;
            }

            textContainerElement.style.left = `${baseX}px`;
            textContainerElement.style.top = `${baseY}px`;

            textContainerElement.innerHTML = '';

            ocrResult.text_blocks.map((block) => {
                if (isNaN(block.text_score) || block.text_score < 0.3) {
                    return null;
                }

                const rectLeftTopX = block.box_points[0].x * transformScale;
                const rectLeftTopY = block.box_points[0].y * transformScale;
                const rectRightTopX = block.box_points[1].x * transformScale;
                const rectRightTopY = block.box_points[1].y * transformScale;
                const rectRightBottomX = block.box_points[2].x * transformScale;
                const rectRightBottomY = block.box_points[2].y * transformScale;
                const rectLeftBottomX = block.box_points[3].x * transformScale;
                const rectLeftBottomY = block.box_points[3].y * transformScale;

                // 计算矩形中心点
                const centerX =
                    (rectLeftTopX + rectRightTopX + rectRightBottomX + rectLeftBottomX) / 4;
                const centerY =
                    (rectLeftTopY + rectRightTopY + rectRightBottomY + rectLeftBottomY) / 4;

                // 计算矩形旋转角度 (使用顶边与水平线的夹角)
                const rotationRad = Math.atan2(
                    rectRightTopY - rectLeftTopY,
                    rectRightTopX - rectLeftTopX,
                );
                let rotationDeg = rotationRad * (180 / Math.PI);

                // 如果旋转角度小于阈值，则视为误差，不进行旋转
                if (Math.abs(rotationDeg) < ROTATION_THRESHOLD) {
                    rotationDeg = 0;
                }

                // 计算宽度和高度
                const width = Math.sqrt(
                    Math.pow(rectRightTopX - rectLeftTopX, 2) +
                        Math.pow(rectRightTopY - rectLeftTopY, 2),
                );
                const height = Math.sqrt(
                    Math.pow(rectLeftBottomX - rectLeftTopX, 2) +
                        Math.pow(rectLeftBottomY - rectLeftTopY, 2),
                );

                const textElement = document.createElement('div');
                textElement.innerText = block.text;
                textElement.style.fontSize = '12px';
                textElement.style.color = token.colorText;
                textElement.style.display = 'inline-block';
                textElement.style.whiteSpace = 'nowrap';

                const textWrapElement = document.createElement('div');
                textWrapElement.style.position = 'absolute';
                textWrapElement.style.width = `${width}px`;
                textWrapElement.style.height = `${height}px`;
                textWrapElement.style.textAlign = 'center';
                textWrapElement.style.transformOrigin = 'center';
                textWrapElement.style.backdropFilter = 'blur(8px)';
                textWrapElement.style.display = 'flex';
                textWrapElement.style.alignItems = 'center';
                textWrapElement.style.justifyContent = 'center';
                textWrapElement.style.backgroundColor = Color(token.colorBgContainer)
                    .alpha(0.42)
                    .toString();
                const isVertical = height > width * 1.5;
                if (isVertical) {
                    textWrapElement.style.writingMode = 'vertical-rl';
                }

                textWrapElement.appendChild(textElement);
                textContainerElement.appendChild(textWrapElement);

                setTimeout(() => {
                    let textWidth = textElement.getBoundingClientRect().width;
                    let textHeight = textElement.getBoundingClientRect().height;
                    if (isVertical) {
                        textWidth -= 3;
                    } else {
                        textHeight -= 3;
                    }

                    const scale = Math.min(height / textHeight, width / textWidth);
                    textElement.style.transform = `scale(${scale})`;
                    textWrapElement.style.transform = `translate(${centerX - width * 0.5}px, ${centerY - height * 0.5}px) rotate(${rotationDeg}deg)`;
                }, 0);
            });
        },
        [token.colorBgContainer, token.colorText],
    );
    const setScale = useCallback((scale: number) => {
        if (!textContainerElementRef.current) {
            return;
        }

        textContainerElementRef.current.style.transform = `scale(${scale / 100})`;
    }, []);

    const initDrawCanvas = useCallback(
        async (params: OcrResultInitDrawCanvasParams) => {
            const { selectRect, imageBuffer, canvas } = params;

            const imageBlob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob(resolve, 'image/jpeg', 0.8);
            });

            if (imageBlob) {
                const ocrResult = await ocrDetect(await imageBlob.arrayBuffer());
                selectRectRef.current = selectRect;
                monitorScaleFactorRef.current = imageBuffer.monitorScaleFactor;
                updateOcrTextElements(ocrResult);
                onOcrDetect?.(ocrResult);
            }
        },
        [onOcrDetect, updateOcrTextElements],
    );

    const initImage = useCallback(
        async (params: OcrResultInitImageParams) => {
            const { imageElement } = params;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageElement.naturalWidth;
            tempCanvas.height = imageElement.naturalHeight;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) {
                return;
            }

            tempCtx.drawImage(imageElement, 0, 0);

            const imageBlob = await new Promise<Blob | null>((resolve) => {
                tempCanvas.toBlob(resolve, 'image/jpeg', 0.8);
            });

            selectRectRef.current = {
                min_x: 0,
                min_y: 0,
                max_x: imageElement.naturalWidth,
                max_y: imageElement.naturalHeight,
            };
            monitorScaleFactorRef.current = params.monitorScaleFactor;

            if (imageBlob) {
                const ocrResult = await ocrDetect(await imageBlob.arrayBuffer());
                updateOcrTextElements(ocrResult);
                onOcrDetect?.(ocrResult);
            }
        },
        [onOcrDetect, updateOcrTextElements],
    );

    useImperativeHandle(
        actionRef,
        () => ({
            init: async (params: OcrResultInitDrawCanvasParams | OcrResultInitImageParams) => {
                const hideLoading = message.loading(<FormattedMessage id="draw.ocrLoading" />, 60);

                if ('selectRect' in params) {
                    await initDrawCanvas(params);
                } else if ('imageElement' in params) {
                    await initImage(params);
                }

                hideLoading();
            },
            setEnable,
            setScale,
            clear: () => {
                if (textContainerElementRef.current) {
                    textContainerElementRef.current.innerHTML = '';
                }
            },
            updateOcrTextElements,
        }),
        [initDrawCanvas, initImage, message, setEnable, setScale, updateOcrTextElements],
    );

    const menuRef = useRef<Menu>(undefined);

    const initMenu = useCallback(async () => {
        const appWindow = getCurrentWindow();
        const menu = await Menu.new({
            items: [
                {
                    id: `${appWindow.label}-copySelectedText`,
                    text: intl.formatMessage({ id: 'draw.copySelectedText' }),
                    action: async () => {
                        navigator.clipboard.writeText(window.getSelection()?.toString() || '');
                    },
                },
            ],
        });
        menuRef.current = menu;
    }, [intl]);

    useEffect(() => {
        initMenu();

        return () => {
            menuRef.current?.close();
            menuRef.current = undefined;
        };
    }, [initMenu]);

    useHotkeysApp(
        'Ctrl+A',
        (event) => {
            if (!enableRef.current) {
                return;
            }

            event.preventDefault();

            const selection = window.getSelection();
            if (containerElementRef.current && selection) {
                const range = document.createRange();
                range.selectNodeContents(containerElementRef.current);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        },
        {
            keyup: false,
            keydown: true,
        },
    );

    const onContextMenu = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();

            if (window.getSelection()?.toString()) {
                menuRef.current?.popup(new LogicalPosition(e.clientX, e.clientY));
                return;
            }

            onContextMenuProp?.(e);
        },
        [onContextMenuProp],
    );

    return (
        <>
            <div
                style={{
                    zIndex: zIndex,
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                }}
                className="ocr-result-container"
                onContextMenu={onContextMenu}
                ref={containerElementRef}
                onWheel={onWheel}
            >
                <div
                    ref={textContainerElementRef}
                    style={{
                        transformOrigin: 'top left',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                    }}
                />
            </div>
        </>
    );
};
