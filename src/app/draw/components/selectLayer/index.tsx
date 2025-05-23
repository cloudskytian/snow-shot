'use client';

import { useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import React from 'react';
import { BaseLayerEventActionType } from '../baseLayer';
import {
    ElementRect,
    getElementFromPosition,
    getWindowElements,
    ImageBuffer,
    initUiElements,
    initUiElementsCache,
} from '@/commands';
import { AppSettingsData, AppSettingsGroup, AppSettingsPublisher } from '@/app/contextWrap';
import * as PIXI from 'pixi.js';
import Flatbush from 'flatbush';
import { useCallbackRender } from '@/hooks/useCallbackRender';
import { TweenAnimation } from '@/utils/tweenAnimation';
import * as TWEEN from '@tweenjs/tween.js';
import {
    convertDragModeToCursor,
    DragMode,
    dragRect,
    drawSelectRect,
    getDragModeFromMousePosition,
    limitRect,
    SelectState,
} from './extra';
import { MousePosition } from '@/utils/mousePosition';
import { DrawStatePublisher, getMonitorRect, ScreenshotTypePublisher } from '../../extra';
import { CaptureStep, DrawContext, DrawState } from '../../types';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { CaptureStepPublisher } from '../../extra';
import { ResizeToolbar, ResizeToolbarActionType } from './components/resizeToolbar';
import { ScreenshotType } from '@/functions/screenshot';
import { zIndexs } from '@/utils/zIndex';
import { isHotkeyPressed } from 'react-hotkeys-hook';
import { KeyEventKey } from '../drawToolbar/components/keyEventWrap/extra';

export type SelectLayerActionType = {
    getSelectRect: () => ElementRect | undefined;
    getSelectState: () => SelectState;
    getWindowId: () => number | undefined;
    setEnable: (enable: boolean) => void;
    onExecuteScreenshot: () => Promise<void>;
    onCaptureReady: (texture: PIXI.Texture, imageBuffer: ImageBuffer) => Promise<void>;
    onCaptureFinish: () => Promise<void>;
};

export type SelectLayerProps = {
    actionRef: React.RefObject<SelectLayerActionType | undefined>;
};

const SelectLayerCore: React.FC<SelectLayerProps> = ({ actionRef }) => {
    const imageBufferRef = useRef<ImageBuffer | undefined>(undefined);
    const resizeToolbarActionRef = useRef<ResizeToolbarActionType | undefined>(undefined);

    const { finishCapture, drawToolbarActionRef, colorPickerActionRef } = useContext(DrawContext);
    const [isEnable, setIsEnable] = useState(false);

    const [findChildrenElements, setFindChildrenElements] = useState(false);
    const [getAppSettings] = useStateSubscriber(
        AppSettingsPublisher,
        useCallback((settings: AppSettingsData) => {
            setFindChildrenElements(
                settings[AppSettingsGroup.FunctionScreenshot].findChildrenElements,
            );
        }, []),
    );
    const [getScreenshotType] = useStateSubscriber(ScreenshotTypePublisher, undefined);
    const tabFindChildrenElementsRef = useRef<boolean>(false); // 是否查找子元素
    const [tabFindChildrenElements, _setTabFindChildrenElements] = useState<boolean>(false); // Tab 键的切换查找子元素
    const setTabFindChildrenElements = useCallback(
        (value: boolean | ((prev: boolean) => boolean)) => {
            tabFindChildrenElementsRef.current =
                typeof value === 'function' ? value(tabFindChildrenElementsRef.current) : value;
            _setTabFindChildrenElements(value);
        },
        [],
    );
    const isEnableFindChildrenElements = useCallback(() => {
        return (
            tabFindChildrenElementsRef.current && getScreenshotType() !== ScreenshotType.TopWindow
        );
    }, [getScreenshotType]);

    const changeCursor = useCallback((cursor: string) => {
        if (layerContainerElementRef.current) {
            layerContainerElementRef.current.style.cursor = cursor;
        }
    }, []);

    const layerContainerElementRef = useRef<HTMLDivElement | null>(null);
    const selectLayerCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const selectLayerCanvasContextRef = useRef<CanvasRenderingContext2D | null>(null);
    const elementsListRef = useRef<ElementRect[]>([]); // 窗口元素的列表
    const elementsIndexWindowIdMapRef = useRef<Map<number, number>>(new Map()); // 窗口元素对应的窗口 ID
    const selectedWindowIdRef = useRef<number | undefined>(undefined); // 选中的窗口 ID
    const elementsListRTreeRef = useRef<Flatbush | undefined>(undefined); // 窗口元素的 RTree
    const selectWindowElementLoadingRef = useRef(true); // 是否正在加载元素选择功能
    const selectWindowFromMousePositionLevelRef = useRef(0);
    const lastMouseMovePositionRef = useRef<MousePosition | undefined>(undefined); // 上一次鼠标移动事件触发的参数
    const drawSelectRectAnimationRef = useRef<TweenAnimation<ElementRect> | undefined>(undefined); // 绘制选取框的动画
    const selectStateRef = useRef(SelectState.Auto); // 当前的选择状态
    const setSelectState = useCallback(
        (state: SelectState) => {
            if (state === SelectState.Selected) {
                drawToolbarActionRef.current?.setEnable(true);
            } else {
                drawToolbarActionRef.current?.setEnable(false);
                changeCursor('crosshair');
            }

            selectStateRef.current = state;
        },
        [changeCursor, drawToolbarActionRef],
    );
    const mouseDownPositionRef = useRef<MousePosition | undefined>(undefined); // 鼠标按下时的位置
    const dragModeRef = useRef<DragMode | undefined>(undefined); // 拖动模式
    const dragRectRef = useRef<ElementRect | undefined>(undefined); // 拖动矩形
    const enableSelectRef = useRef(false); // 是否启用选择
    const updateEnableSelect = useCallback(
        (captureStep: CaptureStep) => {
            enableSelectRef.current = captureStep === CaptureStep.Select;

            if (captureStep === CaptureStep.Fixed) {
                if (layerContainerElementRef.current) {
                    layerContainerElementRef.current.style.opacity = '0';
                }
            }
        },
        [layerContainerElementRef],
    );
    useStateSubscriber(CaptureStepPublisher, updateEnableSelect);

    const getSelectRect = useCallback(() => {
        return drawSelectRectAnimationRef.current?.getTargetObject();
    }, []);

    /**
     * 初始化元素选择功能
     */
    const initSelectWindowElement = useCallback(async () => {
        selectWindowElementLoadingRef.current = true;

        const windowElements = await getWindowElements();
        const rectList: ElementRect[] = [];
        const initUiElementsCachePromise = initUiElementsCache();
        const map = new Map<number, number>();

        const rTree = new Flatbush(windowElements.length);
        windowElements.forEach((windowElement, index) => {
            const rect = windowElement.element_rect;
            rectList.push(rect);

            rTree.add(rect.min_x, rect.min_y, rect.max_x, rect.max_y);
            map.set(index, windowElement.window_id);
        });
        rTree.finish();
        elementsListRTreeRef.current = rTree;
        elementsListRef.current = rectList;
        selectedWindowIdRef.current = undefined;
        elementsIndexWindowIdMapRef.current = map;

        await initUiElementsCachePromise;
        selectWindowElementLoadingRef.current = false;
    }, []);

    /**
     * 通过鼠标坐标获取候选框
     */
    const getElementRectFromMousePosition = useCallback(
        async (mousePosition: MousePosition): Promise<ElementRect[] | undefined> => {
            if (selectWindowElementLoadingRef.current) {
                return undefined;
            }

            const elementsRTree = elementsListRTreeRef.current;
            if (!elementsRTree) {
                return undefined;
            }

            let elementRectList = undefined;
            if (isEnableFindChildrenElements()) {
                try {
                    elementRectList = await getElementFromPosition(
                        mousePosition.mouseX,
                        mousePosition.mouseY,
                    );
                } catch {
                    // 获取元素失败，忽略
                }
            }

            let result;
            if (elementRectList) {
                result = elementRectList;
            } else {
                const rectIndexs = elementsRTree.search(
                    mousePosition.mouseX,
                    mousePosition.mouseY,
                    mousePosition.mouseX,
                    mousePosition.mouseY,
                );
                // 获取的是原始数据的索引，原始数据下标越小的，窗口层级越高，所以优先选择下标小的
                rectIndexs.sort((a, b) => a - b);

                result = rectIndexs.map((index) => {
                    return elementsListRef.current[index];
                });

                selectedWindowIdRef.current = elementsIndexWindowIdMapRef.current.get(
                    rectIndexs[0],
                );
            }

            return result;
        },
        [isEnableFindChildrenElements],
    );

    const updateSelectRect = useCallback(
        (
            rect: ElementRect,
            imageBuffer: ImageBuffer,
            drawElementMask?: {
                imageData: ImageData;
            },
            enableScrollScreenshot?: boolean,
        ) => {
            drawSelectRect(
                imageBuffer.monitorWidth,
                imageBuffer.monitorHeight,
                rect,
                selectLayerCanvasContextRef.current!,
                getAppSettings()[AppSettingsGroup.Common].darkMode,
                imageBuffer.monitorScaleFactor,
                getScreenshotType(),
                drawElementMask,
                enableScrollScreenshot,
            );
            // 和 canvas 同步下
            requestAnimationFrame(() => {
                resizeToolbarActionRef.current?.updateStyle(rect);
            });
        },
        [getAppSettings, getScreenshotType],
    );

    const initAnimation = useCallback(
        (imageBuffer: ImageBuffer) => {
            if (drawSelectRectAnimationRef.current) {
                drawSelectRectAnimationRef.current.dispose();
            }

            drawSelectRectAnimationRef.current = new TweenAnimation<ElementRect>(
                {
                    min_x: 0,
                    min_y: 0,
                    max_x: imageBuffer.monitorWidth,
                    max_y: imageBuffer.monitorHeight,
                },
                TWEEN.Easing.Quadratic.Out,
                100,
                (rect) => {
                    updateSelectRect(rect, imageBuffer);
                },
            );
        },
        [updateSelectRect],
    );

    const onCaptureReady = useCallback<BaseLayerEventActionType['onCaptureReady']>(
        async (_texture, imageBuffer): Promise<void> => {
            imageBufferRef.current = imageBuffer;
            const { mouseX, mouseY } = imageBuffer;
            // 初始化下坐标，用来在触发鼠标移动事件前选取坐标
            lastMouseMovePositionRef.current = new MousePosition(mouseX, mouseY);
            // 初始化下选择状态
            setSelectState(SelectState.Auto);

            if (!selectLayerCanvasContextRef.current) {
                selectLayerCanvasContextRef.current =
                    selectLayerCanvasRef.current!.getContext('2d');
            }

            selectLayerCanvasRef.current!.height = imageBuffer.monitorHeight;
            selectLayerCanvasRef.current!.width = imageBuffer.monitorWidth;

            initAnimation(imageBuffer);
        },
        [initAnimation, setSelectState],
    );

    const opacityImageDataRef = useRef<
        | {
              opacity: number;
              imageData: ImageData;
          }
        | undefined
    >(undefined);
    const renderElementMask = useCallback(
        (isEnable: boolean) => {
            if (isEnable) {
                // 如果有缓存，则把遮罩去除
                if (opacityImageDataRef.current) {
                    updateSelectRect(getSelectRect()!, imageBufferRef.current!);
                }

                return;
            }

            const opacity = Math.min(
                Math.max(
                    (100 -
                        getAppSettings()[AppSettingsGroup.FunctionScreenshot]
                            .beyondSelectRectElementOpacity) /
                        100,
                    0,
                ),
                1,
            );

            let imageData: ImageData | undefined;
            if (opacity === 0) {
                imageData = undefined;
            } else if (
                opacityImageDataRef.current &&
                opacityImageDataRef.current.opacity === opacity
            ) {
                imageData = opacityImageDataRef.current.imageData;
            } else {
                const originalImageData = colorPickerActionRef.current?.getCurrentImageData();

                if (originalImageData) {
                    let newImageData: ImageData;
                    if (opacity === 1) {
                        newImageData = originalImageData;
                    } else {
                        newImageData = new ImageData(
                            new Uint8ClampedArray(originalImageData.data),
                            originalImageData.width,
                            originalImageData.height,
                        );

                        for (let i = 3; i < newImageData.data.length; i += 4) {
                            newImageData.data[i] = Math.round(newImageData.data[i] * opacity);
                        }
                    }

                    imageData = newImageData;
                    opacityImageDataRef.current = {
                        opacity,
                        imageData: newImageData,
                    };
                }
            }

            if (!imageData) {
                return;
            }

            updateSelectRect(
                getSelectRect()!,
                imageBufferRef.current!,
                imageData
                    ? {
                          imageData,
                      }
                    : undefined,
            );
        },
        [colorPickerActionRef, getAppSettings, getSelectRect, updateSelectRect],
    );

    const onCaptureFinish = useCallback<BaseLayerEventActionType['onCaptureFinish']>(async () => {
        selectLayerCanvasContextRef.current?.clearRect(
            0,
            0,
            imageBufferRef.current!.monitorWidth,
            imageBufferRef.current!.monitorHeight,
        );
        imageBufferRef.current = undefined;
        selectWindowElementLoadingRef.current = true;
        elementsListRTreeRef.current = undefined;
        elementsListRef.current = [];
        lastMouseMovePositionRef.current = undefined;
        opacityImageDataRef.current = undefined;
    }, []);

    const autoSelect = useCallback(
        async (mousePosition: MousePosition): Promise<ElementRect> => {
            let elementRectList = await getElementRectFromMousePosition(mousePosition);

            if (!elementRectList || elementRectList.length === 0) {
                elementRectList =
                    getScreenshotType() === ScreenshotType.TopWindow
                        ? [{ min_x: 0, min_y: 0, max_x: 0, max_y: 0 }]
                        : [getMonitorRect(imageBufferRef.current)];
            }

            const minLevel = 0;
            const maxLevel = Math.max(elementRectList.length - 1, minLevel);
            let currentLevel = selectWindowFromMousePositionLevelRef.current;
            if (currentLevel < minLevel) {
                currentLevel = minLevel;
            } else if (currentLevel > maxLevel) {
                currentLevel = maxLevel;
                selectWindowFromMousePositionLevelRef.current = maxLevel;
            }

            return elementRectList[currentLevel];
        },
        [getElementRectFromMousePosition, getScreenshotType],
    );

    const updateDragMode = useCallback(
        (mousePosition: MousePosition): DragMode => {
            dragModeRef.current = getDragModeFromMousePosition(getSelectRect()!, mousePosition);

            changeCursor(convertDragModeToCursor(dragModeRef.current));

            return dragModeRef.current;
        },
        [changeCursor, getSelectRect],
    );

    const setSelectRect = useCallback((rect: ElementRect, ignoreAnimation: boolean = false) => {
        drawSelectRectAnimationRef.current?.update(rect, ignoreAnimation);
        resizeToolbarActionRef.current?.setSize(rect.max_x - rect.min_x, rect.max_y - rect.min_y);
    }, []);

    const onMouseDown = useCallback(
        (mousePosition: MousePosition) => {
            mouseDownPositionRef.current = mousePosition;
            if (selectStateRef.current === SelectState.Auto) {
            } else if (selectStateRef.current === SelectState.Selected) {
                // 改变状态为拖动
                setSelectState(SelectState.Drag);
                updateDragMode(mousePosition);
                dragRectRef.current = getSelectRect()!;
            }
        },
        [getSelectRect, setSelectState, updateDragMode],
    );
    const onMouseMove = useCallback(
        async (mousePosition: MousePosition) => {
            // 检测下鼠标移动的距离
            lastMouseMovePositionRef.current = mousePosition;

            if (selectStateRef.current === SelectState.Auto) {
                if (
                    mouseDownPositionRef.current &&
                    getScreenshotType() !== ScreenshotType.TopWindow
                ) {
                    // 检测拖动距离是否启用手动选择
                    const maxDistance = mouseDownPositionRef.current.getMaxDistance(mousePosition);
                    if (maxDistance > 9) {
                        setSelectState(SelectState.Manual);
                    }
                }

                setSelectRect(
                    await autoSelect(mousePosition),
                    getScreenshotType() === ScreenshotType.TopWindow,
                );
            } else if (selectStateRef.current === SelectState.Manual) {
                if (!mouseDownPositionRef.current) {
                    return;
                }

                setSelectRect(mouseDownPositionRef.current.toElementRect(mousePosition), true);
            } else if (selectStateRef.current === SelectState.Selected) {
                updateDragMode(mousePosition);
            } else if (selectStateRef.current === SelectState.Drag) {
                if (!mouseDownPositionRef.current) {
                    return;
                }

                setSelectRect(
                    dragRect(
                        dragModeRef.current!,
                        dragRectRef.current!,
                        mouseDownPositionRef.current,
                        mousePosition,
                    ),
                    true,
                );
            }
        },
        [autoSelect, getScreenshotType, setSelectRect, setSelectState, updateDragMode],
    );
    const onMouseUp = useCallback(() => {
        if (!mouseDownPositionRef.current) {
            return;
        }

        if (selectStateRef.current === SelectState.Auto) {
            setSelectState(SelectState.Selected);
        } else if (selectStateRef.current === SelectState.Manual) {
            setSelectState(SelectState.Selected);
        } else if (selectStateRef.current === SelectState.Drag) {
            setSelectState(SelectState.Selected);
            setSelectRect(limitRect(getSelectRect()!, getMonitorRect(imageBufferRef.current)));
            dragRectRef.current = undefined;
        }

        mouseDownPositionRef.current = undefined;
    }, [getSelectRect, setSelectRect, setSelectState]);

    const onMouseMoveRenderCallback = useCallbackRender(onMouseMove);
    // 用上一次的鼠标移动事件触发 onMouseMove 来更新一些状态
    const refreshMouseMove = useCallback(() => {
        if (!lastMouseMovePositionRef.current) {
            return;
        }

        onMouseMove(lastMouseMovePositionRef.current);
    }, [onMouseMove]);
    const onMouseWheel = useCallback(
        (e: WheelEvent) => {
            if (selectStateRef.current !== SelectState.Auto) {
                return;
            }

            const deltaLevel = e.deltaY > 0 ? 1 : -1;
            selectWindowFromMousePositionLevelRef.current = Math.max(
                selectWindowFromMousePositionLevelRef.current + deltaLevel,
                0,
            );
            refreshMouseMove();
        },
        [refreshMouseMove],
    );
    const onMouseWheelRenderCallback = useCallbackRender(onMouseWheel);

    const onExecuteScreenshot = useCallback<
        BaseLayerEventActionType['onExecuteScreenshot']
    >(async () => {
        await initSelectWindowElement();

        // 初始化可能晚于截图准备
        refreshMouseMove();
    }, [initSelectWindowElement, refreshMouseMove]);

    useStateSubscriber(
        DrawStatePublisher,
        useCallback(
            (drawState: DrawState, prevDrawState: DrawState) => {
                if (!imageBufferRef.current) {
                    return;
                }

                if (drawState === DrawState.ScrollScreenshot) {
                    updateSelectRect(getSelectRect()!, imageBufferRef.current, undefined, true);
                } else if (prevDrawState === DrawState.ScrollScreenshot) {
                    updateSelectRect(getSelectRect()!, imageBufferRef.current, undefined, false);
                }
            },
            [getSelectRect, updateSelectRect],
        ),
    );

    useEffect(() => {
        initUiElements();

        return () => {
            drawSelectRectAnimationRef.current?.dispose();
        };
    }, []);

    useEffect(() => {
        setTabFindChildrenElements(findChildrenElements);
    }, [findChildrenElements, setTabFindChildrenElements]);
    // 查找子元素切换时，刷新选取
    useEffect(() => {
        refreshMouseMove();
    }, [tabFindChildrenElements, refreshMouseMove]);

    useEffect(() => {
        if (!isEnable) {
            return;
        }

        const layerContainerElement = layerContainerElementRef.current;
        if (!layerContainerElement) {
            return;
        }

        const handleMouseDown = (e: MouseEvent) => {
            if (!enableSelectRef.current) {
                return;
            }

            if (e.button !== 0) {
                return;
            }

            if (!imageBufferRef.current) {
                return;
            }

            onMouseDown(
                new MousePosition(e.clientX, e.clientY).scale(
                    imageBufferRef.current.monitorScaleFactor,
                ),
            );
        };
        const handleMouseMove = (e: MouseEvent) => {
            if (!enableSelectRef.current) {
                return;
            }

            if (!imageBufferRef.current) {
                return;
            }

            onMouseMoveRenderCallback(
                new MousePosition(e.clientX, e.clientY).scale(
                    imageBufferRef.current.monitorScaleFactor,
                ),
            );
        };
        const handleMouseUp = (e: MouseEvent) => {
            if (!enableSelectRef.current) {
                return;
            }

            if (e.button !== 0) {
                return;
            }

            onMouseUp();
        };
        layerContainerElement.addEventListener('mousedown', handleMouseDown);
        layerContainerElement.addEventListener('mousemove', handleMouseMove);
        layerContainerElement.addEventListener('mouseup', handleMouseUp);
        layerContainerElement.addEventListener('wheel', onMouseWheelRenderCallback, {
            passive: true,
        });
        return () => {
            layerContainerElement.removeEventListener('mousedown', handleMouseDown);
            layerContainerElement.removeEventListener('mousemove', handleMouseMove);
            layerContainerElement.removeEventListener('mouseup', handleMouseUp);
            layerContainerElement.removeEventListener('wheel', onMouseWheelRenderCallback);
        };
    }, [
        isEnable,
        layerContainerElementRef,
        onMouseDown,
        onMouseMoveRenderCallback,
        onMouseUp,
        onMouseWheelRenderCallback,
    ]);

    useImperativeHandle(
        actionRef,
        () => ({
            onExecuteScreenshot,
            onCaptureReady: async (texture, imageBuffer) => {
                await onCaptureReady(texture, imageBuffer);
                refreshMouseMove();
            },
            getWindowId: () => selectedWindowIdRef.current,
            onCaptureFinish,
            getSelectRect,
            setEnable: (enable: boolean) => {
                setIsEnable(enable);
            },
            getSelectState: () => selectStateRef.current,
        }),
        [getSelectRect, onCaptureFinish, onCaptureReady, onExecuteScreenshot, refreshMouseMove],
    );

    useEffect(() => {
        if (
            !isEnable &&
            getAppSettings()[AppSettingsGroup.FunctionScreenshot].findChildrenElements
        ) {
            return;
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (!enableSelectRef.current) {
                return;
            }

            if (isHotkeyPressed('Tab')) {
                setTabFindChildrenElements((prev) => !prev);
                e.preventDefault();
            }

            if (
                isHotkeyPressed(
                    getAppSettings()[AppSettingsGroup.DrawToolbarKeyEvent][KeyEventKey.CancelTool]
                        .hotKey,
                ) &&
                selectStateRef.current !== SelectState.Selected
            ) {
                finishCapture();
                e.preventDefault();
            }

            if (
                isHotkeyPressed(
                    getAppSettings()[AppSettingsGroup.DrawToolbarKeyEvent][
                        KeyEventKey.SelectPrevRectTool
                    ].hotKey,
                )
            ) {
                const prevSelectRect = getAppSettings()[AppSettingsGroup.Cache].prevSelectRect;
                if (
                    prevSelectRect.min_x < prevSelectRect.max_x &&
                    prevSelectRect.min_y < prevSelectRect.max_y
                ) {
                    setSelectRect(
                        limitRect(prevSelectRect, getMonitorRect(imageBufferRef.current)),
                        false,
                    );
                    setSelectState(SelectState.Selected);
                }
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [
        finishCapture,
        getAppSettings,
        getSelectRect,
        isEnable,
        setSelectRect,
        setSelectState,
        setTabFindChildrenElements,
    ]);

    useEffect(() => {
        if (layerContainerElementRef.current) {
            layerContainerElementRef.current.style.pointerEvents = isEnable ? 'auto' : 'none';
        }

        // 切换为其他功能时，渲染元素遮罩
        renderElementMask(isEnable);

        if (!isEnable) {
            return;
        }

        const mouseRightClick = (e: MouseEvent) => {
            e.preventDefault();
            // 回退到选择
            if (selectStateRef.current === SelectState.Selected) {
                setSelectState(SelectState.Auto);
                refreshMouseMove();
            } else if (selectStateRef.current === SelectState.Auto) {
                // 取消截图
                finishCapture();
            }
        };

        document.addEventListener('contextmenu', mouseRightClick);

        return () => {
            document.removeEventListener('contextmenu', mouseRightClick);
        };
    }, [finishCapture, isEnable, refreshMouseMove, renderElementMask, setSelectState]);

    return (
        <>
            <ResizeToolbar actionRef={resizeToolbarActionRef} />

            <div className="select-layer-container" ref={layerContainerElementRef}>
                <canvas className="select-layer-canvas" ref={selectLayerCanvasRef} />
                <style jsx>{`
                    .select-layer-container {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100vw;
                        height: 100vh;
                        z-index: ${zIndexs.Draw_SelectLayer};
                    }

                    .select-layer-container > .select-layer-canvas {
                        width: 100vw;
                        height: 100vh;
                        position: absolute;
                        top: 0;
                        left: 0;
                    }
                `}</style>
            </div>
        </>
    );
};

export default React.memo(SelectLayerCore);
