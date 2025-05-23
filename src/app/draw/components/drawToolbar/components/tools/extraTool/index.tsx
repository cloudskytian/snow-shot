import { Button } from 'antd';
import { SubTools } from '../../subTools';

import { useIntl } from 'react-intl';
import { ScanOutlined } from '@ant-design/icons';
import { useState, useCallback } from 'react';
import { DrawStatePublisher } from '@/app/draw/extra';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { DrawState } from '@/app/draw/types';
import { ScanQrcodeTool } from './components/scanQrcode';
import { getButtonTypeByState } from '../../../extra';

export enum ExtraToolList {
    ScanQrcode = 0,
}

export const ExtraTool: React.FC<{
    finishCapture: () => void;
}> = ({ finishCapture }) => {
    const intl = useIntl();

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
