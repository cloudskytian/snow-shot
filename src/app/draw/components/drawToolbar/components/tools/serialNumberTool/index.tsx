import {
    AppSettingsActionContext,
    AppSettingsData,
    AppSettingsGroup,
    AppSettingsPublisher,
} from '@/app/contextWrap';
import { ExcalidrawEventPublisher } from '@/app/draw/components/drawCacheLayer/extra';
import { ExcalidrawEventParams } from '@/app/draw/components/drawCacheLayer/extra';
import {
    CaptureEvent,
    CaptureEventParams,
    CaptureEventPublisher,
    DrawStatePublisher,
} from '@/app/draw/extra';
import { DrawContext, DrawState } from '@/app/draw/types';
import { HotkeysScope } from '@/components/globalLayoutExtra';
import { useHotkeysApp } from '@/hooks/useHotkeysApp';
import { useStateRef } from '@/hooks/useStateRef';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { zIndexs } from '@/utils/zIndex';
import { AppState } from '@mg-chao/excalidraw/types';
import React, {
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    WheelEventHandler,
} from 'react';

const generateSerialNumber = (
    position: { x: number; y: number },
    number: number,
    appState: AppState,
) => {
    const id = new Date().valueOf();

    const ellipseId = `snow-shot_serial-number_${id}-ellipse`;
    const textId = `snow-shot_serial-number_${id}-text`;
    const serialNumberGroupNumber = `snow-shot_serial-number_${id}-group-number`;

    const sizeScale = appState.currentItemFontSize / 16;

    const ellipseWidth = 32 * sizeScale;
    const ellipseHeight = 32 * sizeScale;

    let textHeight = 20 * sizeScale;
    const fontSize = appState.currentItemFontSize;
    if (fontSize <= 16) {
        textHeight = 20;
    } else if (fontSize <= 20) {
        textHeight = 25;
    } else if (fontSize <= 28) {
        textHeight = 35;
    } else if (fontSize <= 36) {
        textHeight = 45;
    }

    return [
        {
            id: ellipseId,
            type: 'ellipse',
            x: position.x - ellipseWidth / 2,
            y: position.y - ellipseHeight / 2,
            width: ellipseWidth,
            height: ellipseHeight,
            angle: 0,
            strokeColor: appState.currentItemStrokeColor,
            backgroundColor: appState.currentItemBackgroundColor,
            fillStyle: appState.currentItemFillStyle,
            strokeWidth: appState.currentItemStrokeWidth,
            strokeStyle: appState.currentItemStrokeStyle,
            roughness: 0,
            opacity: appState.currentItemOpacity,
            groupIds: [serialNumberGroupNumber],
            frameId: null,
            roundness: null,
            version: 304,
            versionNonce: 1149037384,
            isDeleted: false,
            boundElements: [],
            fontSize: fontSize,
            fontFamily: appState.currentItemFontFamily,
            link: null,
            locked: false,
        },
        {
            id: textId,
            type: 'text',
            x: position.x - ellipseWidth / 2,
            y: position.y - textHeight / 2 + 2,
            width: 32 * sizeScale,
            height: textHeight,
            angle: 0,
            strokeColor: appState.currentItemStrokeColor,
            backgroundColor: appState.currentItemBackgroundColor,
            fillStyle: appState.currentItemFillStyle,
            strokeWidth: 1,
            strokeStyle: appState.currentItemStrokeStyle,
            roughness: 0,
            opacity: appState.currentItemOpacity,
            groupIds: [serialNumberGroupNumber],
            frameId: null,
            roundness: null,
            version: 1159,
            versionNonce: 2123386168,
            isDeleted: false,
            boundElements: [],
            link: null,
            locked: false,
            text: number.toString(),
            fontSize: fontSize,
            fontFamily: appState.currentItemFontFamily,
            textAlign: 'center',
            verticalAlign: 'center',
            containerId: null,
            originalText: number.toString(),
            autoResize: false,
            lineHeight: 1.25,
        },
    ];
};

export const SerialNumberTool: React.FC = () => {
    const { drawCacheLayerActionRef, imageBufferRef, selectLayerActionRef, mousePositionRef } =
        useContext(DrawContext);

    const arrowElementIdsRef = useRef<Set<string>>(new Set());
    const [enable, setEnable, enableRef] = useStateRef(false);
    const [maskStyle, setMaskStyle] = useState<React.CSSProperties>({});

    useStateSubscriber(
        DrawStatePublisher,
        useCallback(
            (drawState: DrawState) => {
                const isEnable = drawState === DrawState.SerialNumber;
                setEnable(isEnable);

                const selectRect = selectLayerActionRef.current?.getSelectRect();
                const monitorScaleFactor = imageBufferRef.current?.monitorScaleFactor;
                if (isEnable && selectRect && monitorScaleFactor) {
                    setMaskStyle({
                        left: selectRect.min_x / monitorScaleFactor,
                        top: selectRect.min_y / monitorScaleFactor,
                        width: (selectRect.max_x - selectRect.min_x) / monitorScaleFactor,
                        height: (selectRect.max_y - selectRect.min_y) / monitorScaleFactor,
                    });
                }
            },
            [imageBufferRef, selectLayerActionRef, setEnable],
        ),
    );
    useStateSubscriber(
        CaptureEventPublisher,
        useCallback(
            (event: CaptureEventParams | undefined) => {
                if (event?.event === CaptureEvent.onExecuteScreenshot) {
                    arrowElementIdsRef.current = new Set(
                        drawCacheLayerActionRef.current
                            ?.getExcalidrawAPI()
                            ?.getSceneElements()
                            .filter((item) => item.type === 'arrow')
                            .map((item) => item.id),
                    );
                }
            },
            [drawCacheLayerActionRef],
        ),
    );

    const [disableArrow, setDisableArrow, disableArrowRef] = useStateRef(false);
    const onMouseDown = useCallback(() => {
        const mousePosition = mousePositionRef.current;

        const imageBuffer = imageBufferRef.current;
        if (!imageBuffer) {
            return;
        }

        const appState = drawCacheLayerActionRef.current?.getAppState();
        if (!appState) {
            return;
        }

        const sceneElements = drawCacheLayerActionRef.current
            ?.getExcalidrawAPI()
            ?.getSceneElements();
        if (!sceneElements) {
            return;
        }

        let currentNumber = 1;
        sceneElements.forEach((item) => {
            if (item.type === 'text' && item.id.startsWith('snow-shot_serial-number_')) {
                currentNumber = Math.max(currentNumber, parseInt(item.text) + 1);
            }
        });

        const serialNumberElement = generateSerialNumber(
            {
                x: mousePosition.mouseX,
                y: mousePosition.mouseY,
            },
            currentNumber,
            appState,
        );

        // 判断是否有新增的 arrow 元素
        const newArrowElement = sceneElements.find((item) => {
            return item.type === 'arrow' && !arrowElementIdsRef.current.has(item.id);
        });

        if (!newArrowElement && !disableArrowRef.current) {
            return;
        }

        if (newArrowElement) {
            arrowElementIdsRef.current.add(newArrowElement.id);

            sceneElements.forEach((item) => {
                if (item.id === newArrowElement.id) {
                    serialNumberElement[1].boundElements = [
                        {
                            id: newArrowElement.id,
                            type: 'arrow',
                        },
                    ] as never[];

                    item.startBinding = {
                        elementId: serialNumberElement[1].id,
                        focus: 0,
                        gap: 0,
                        fixedPoint: [1, 0.5],
                    };
                }
            });
        }

        drawCacheLayerActionRef.current?.updateScene({
            elements: [...sceneElements, ...serialNumberElement],
            captureUpdate: 'IMMEDIATELY',
        });
    }, [disableArrowRef, drawCacheLayerActionRef, imageBufferRef, mousePositionRef]);

    useStateSubscriber(
        ExcalidrawEventPublisher,
        useCallback(
            (params: ExcalidrawEventParams | undefined) => {
                if (!enableRef.current) {
                    return;
                }

                if (params?.event === 'onPointerDown') {
                    onMouseDown();
                }
            },
            [onMouseDown, enableRef],
        ),
    );

    const [disableArrowHotKey, setDisableArrowHotKey] = useState('');
    const { updateAppSettings } = useContext(AppSettingsActionContext);
    useStateSubscriber(
        AppSettingsPublisher,
        useCallback(
            (appSettings: AppSettingsData) => {
                setDisableArrow(appSettings[AppSettingsGroup.Cache].disableArrowPicker);
                setDisableArrowHotKey(
                    appSettings[AppSettingsGroup.DrawToolbarKeyEvent].serialNumberDisableArrow
                        .hotKey,
                );
            },
            [setDisableArrow],
        ),
    );

    useHotkeysApp(
        disableArrowHotKey,
        useCallback(() => {
            setDisableArrow((prev) => {
                const res = !prev;

                updateAppSettings(
                    AppSettingsGroup.Cache,
                    {
                        disableArrowPicker: res,
                    },
                    true,
                    true,
                    false,
                    true,
                    true,
                );

                return res;
            });
        }, [setDisableArrow, updateAppSettings]),
        {
            preventDefault: true,
            keyup: true,
            keydown: false,
            scopes: HotkeysScope.DrawTool,
        },
    );

    const enableMask = disableArrow && enable;

    useEffect(() => {
        if (!enableRef.current) {
            return;
        }

        if (disableArrow) {
            drawCacheLayerActionRef.current?.setActiveTool({
                type: 'ellipse',
            });
        } else {
            drawCacheLayerActionRef.current?.setActiveTool({
                type: 'arrow',
            });
        }
    }, [disableArrow, drawCacheLayerActionRef, enableRef]);

    const onMaskWheel = useCallback<WheelEventHandler<HTMLDivElement>>(
        (ev) => {
            drawCacheLayerActionRef.current?.handleWheel(ev);
        },
        [drawCacheLayerActionRef],
    );

    return (
        <div
            className="serial-number-tool-mask"
            style={{ ...maskStyle, display: enableMask ? 'block' : 'none' }}
            onMouseDown={onMouseDown}
            onWheel={onMaskWheel}
        >
            <style jsx>{`
                .serial-number-tool-mask {
                    position: fixed;
                    top: 0;
                    left: 0;
                    z-index: ${zIndexs.Draw_SerialNumberToolMask};
                    pointer-events: auto;
                    cursor: crosshair;
                }
            `}</style>
        </div>
    );
};
