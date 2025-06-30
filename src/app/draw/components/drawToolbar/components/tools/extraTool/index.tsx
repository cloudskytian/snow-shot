import { Button } from 'antd';
import { SubTools } from '../../subTools';

import { useIntl } from 'react-intl';
import { ScanOutlined } from '@ant-design/icons';
import { useState, useCallback, useContext } from 'react';
import { DrawStatePublisher } from '@/app/fullScreenDraw/components/drawCore/extra';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { DrawState } from '@/app/fullScreenDraw/components/drawCore/extra';
import { ScanQrcodeTool } from './components/scanQrcode';
import { getButtonTypeByState } from '../../../extra';
import { VideoRecordIcon } from '@/components/icons';
import { createVideoRecordWindow } from '@/commands/core';
import { DrawContext } from '@/app/draw/types';

export enum ExtraToolList {
    ScanQrcode = 0,
    VideoRecord = 1,
}

export const ExtraTool: React.FC<{
    finishCapture: () => void;
}> = ({ finishCapture }) => {
    const intl = useIntl();

    const { monitorInfoRef, selectLayerActionRef } = useContext(DrawContext);

    const [activeTool, setActiveTool] = useState<ExtraToolList | undefined>(undefined);
    const [enabled, setEnabled] = useState(false);
    const [, setDrawState] = useStateSubscriber(DrawStatePublisher, undefined);
    useStateSubscriber(
        DrawStatePublisher,
        useCallback((drawState: DrawState) => {
            if (drawState === DrawState.ExtraTools || drawState === DrawState.ScanQrcode) {
                if (drawState === DrawState.ScanQrcode) {
                    setActiveTool(ExtraToolList.ScanQrcode);
                }

                setEnabled(true);
            } else {
                setActiveTool(undefined);
                setEnabled(false);
            }
        }, []),
    );

    if (!enabled) {
        return null;
    }

    return (
        <>
            <SubTools
                buttons={[
                    <Button
                        icon={<ScanOutlined />}
                        title={intl.formatMessage({ id: 'draw.extraTool.scanQrcode' })}
                        type={getButtonTypeByState(activeTool === ExtraToolList.ScanQrcode)}
                        key="scanQrcode"
                        onClick={() => {
                            setDrawState(DrawState.ScanQrcode);
                        }}
                    />,
                    <Button
                        icon={<VideoRecordIcon />}
                        title={intl.formatMessage({ id: 'draw.extraTool.videoRecord' })}
                        type={getButtonTypeByState(activeTool === ExtraToolList.VideoRecord)}
                        key="videoRecord"
                        onClick={() => {
                            const monitorInfo = monitorInfoRef.current;
                            const selectRect = selectLayerActionRef.current?.getSelectRect();
                            if (!monitorInfo || !selectRect) {
                                return;
                            }

                            let rectWidth = selectRect.max_x - selectRect.min_x;
                            let rectHeight = selectRect.max_y - selectRect.min_y;

                            if (rectWidth % 2 === 1) {
                                rectWidth--;
                            }
                            if (rectHeight % 2 === 1) {
                                rectHeight--;
                            }

                            createVideoRecordWindow(
                                monitorInfo.monitor_x,
                                monitorInfo.monitor_y,
                                monitorInfo.monitor_width,
                                monitorInfo.monitor_height,
                                monitorInfo.monitor_scale_factor,
                                selectRect.min_x,
                                selectRect.min_y,
                                selectRect.min_x + rectWidth,
                                selectRect.min_y + rectHeight,
                            );

                            finishCapture();
                        }}
                    />,
                ]}
            />

            <>
                {activeTool === ExtraToolList.ScanQrcode && (
                    <ScanQrcodeTool finishCapture={finishCapture} />
                )}
            </>
        </>
    );
};
