import { MousePosition } from '@/utils/mousePosition';
import { DrawContext } from '@/app/draw/types';
import { zIndexs } from '@/utils/zIndex';
import { Flex, theme } from 'antd';
import React, {
    useCallback,
    useContext,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { updateElementPosition } from '../../../drawToolbar/components/dragButton/extra';
import { ElementRect } from '@/commands';
import { CaptureEvent, CaptureEventPublisher, ScreenshotTypePublisher } from '@/app/draw/extra';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { ScreenshotType } from '@/functions/screenshot';
import { debounce } from 'es-toolkit';
import { DrawState, DrawStatePublisher } from '@/app/fullScreenDraw/components/drawCore/extra';

export type ResizeToolbarActionType = {
    updateStyle: (selectedRect: ElementRect) => void;
    setSize: (width: number, height: number) => void;
};

export const ResizeToolbar: React.FC<{
    actionRef: React.RefObject<ResizeToolbarActionType | undefined>;
}> = ({ actionRef }) => {
    const { token } = theme.useToken();

    const resizeToolbarRef = useRef<HTMLDivElement>(null);
    const { monitorInfoRef } = useContext(DrawContext);

    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);

    const updateStyle = useCallback(
        (selectedRect: ElementRect) => {
            const resizeToolbar = resizeToolbarRef.current;
            if (!resizeToolbar) {
                return;
            }

            const monitorInfo = monitorInfoRef.current;
            if (!monitorInfo) {
                return;
            }

            const { isBeyond } = updateElementPosition(
                resizeToolbar,
                0,
                0,
                new MousePosition(0, resizeToolbar.clientHeight + token.marginXXS),
                new MousePosition(
                    selectedRect.min_x / monitorInfo.monitor_scale_factor,
                    selectedRect.min_y / monitorInfo.monitor_scale_factor,
                ),
                undefined,
                true,
            );
            if (isBeyond) {
                updateElementPosition(
                    resizeToolbar,
                    0,
                    0,
                    new MousePosition(
                        -(selectedRect.max_x - selectedRect.min_x) /
                            monitorInfo.monitor_scale_factor -
                            token.marginXXS,
                        0,
                    ),
                    new MousePosition(
                        selectedRect.min_x / monitorInfo.monitor_scale_factor,
                        selectedRect.min_y / monitorInfo.monitor_scale_factor,
                    ),
                    undefined,
                );
            }
        },
        [monitorInfoRef, token.marginXXS],
    );

    const setEnable = useCallback((enable: boolean) => {
        const resizeToolbar = resizeToolbarRef.current;
        if (!resizeToolbar) {
            return;
        }

        if (enable) {
            resizeToolbar.style.opacity = '1';
        } else {
            resizeToolbar.style.opacity = '0';
        }
    }, []);

    const [getScreenshotType] = useStateSubscriber(ScreenshotTypePublisher, undefined);
    const [getCaptureEvent] = useStateSubscriber(CaptureEventPublisher, undefined);
    const [getDrawState] = useStateSubscriber(DrawStatePublisher, undefined);
    const updateEnable = useCallback(() => {
        const event = getCaptureEvent();
        if (!event) {
            return;
        }

        if (getScreenshotType() === ScreenshotType.TopWindow) {
            setEnable(false);
            return;
        }

        let isEnable = false;
        if (event.event === CaptureEvent.onCaptureReady) {
            updateStyle({ min_x: 0, min_y: 0, max_x: 0, max_y: 0 });
            isEnable = true;
        } else if (event.event === CaptureEvent.onCaptureFinish) {
            isEnable = false;
        } else if (event.event === CaptureEvent.onCaptureLoad) {
            isEnable = getDrawState() === DrawState.Idle;
        }

        setEnable(isEnable);
    }, [getCaptureEvent, getDrawState, getScreenshotType, setEnable, updateStyle]);
    const updateEnableDebounce = useMemo(() => {
        return debounce(updateEnable, 0);
    }, [updateEnable]);
    useStateSubscriber(CaptureEventPublisher, updateEnableDebounce);
    useStateSubscriber(DrawStatePublisher, updateEnableDebounce);

    useImperativeHandle(actionRef, () => {
        return {
            updateStyle,
            setSize: (width: number, height: number) => {
                setWidth(width);
                setHeight(height);
            },
        };
    }, [updateStyle]);

    return (
        <div className="draw-resize-toolbar" ref={resizeToolbarRef}>
            <Flex align="center">{`${width} x ${height}`}</Flex>
            <style jsx>{`
                .draw-resize-toolbar {
                    box-shadow: 0 0 1px 0px ${token.colorPrimaryHover};
                    border-radius: ${token.borderRadius}px;
                    position: absolute;
                    top: 0;
                    left: 0;
                    padding: ${2}px ${token.paddingXS}px;
                    background-color: ${token.colorBgMask};
                    z-index: ${zIndexs.Draw_ResizeToolbar};
                    color: ${token.colorWhite};
                    pointer-events: none;
                    opacity: 0;
                }

                .draw-resize-toolbar:hover {
                    opacity: 0 !important;
                }
            `}</style>
        </div>
    );
};
