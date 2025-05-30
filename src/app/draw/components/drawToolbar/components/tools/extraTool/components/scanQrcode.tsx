import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Spin, theme, Typography } from 'antd';
import { DrawContext } from '@/app/draw/types';
import { zIndexs } from '@/utils/zIndex';
import QrScanner from 'qr-scanner';
import { AntdContext } from '@/components/globalLayoutExtra';
import { useIntl } from 'react-intl';
import { useHotkeysApp } from '@/hooks/useHotkeysApp';
import { openUrl } from '@tauri-apps/plugin-opener';

export const ScanQrcodeTool: React.FC<{
    finishCapture: () => void;
}> = ({ finishCapture }) => {
    const intl = useIntl();
    const { token } = theme.useToken();
    const { message } = useContext(AntdContext);
    const { selectLayerActionRef, monitorInfoRef, drawLayerActionRef } = useContext(DrawContext);

    const containerElementRef = useRef<HTMLDivElement>(null);
    const [containerStyle, setContainerStyle] = useState<React.CSSProperties>({});
    const [qrCode, setQrCode] = useState<string | undefined>(undefined);

    const inited = useRef(false);
    useEffect(() => {
        if (monitorInfoRef.current === undefined) {
            return;
        }

        if (inited.current) {
            return;
        }

        inited.current = true;

        const selectRect = selectLayerActionRef.current?.getSelectRect();
        if (!selectRect) {
            return;
        }

        setContainerStyle({
            width:
                (selectRect.max_x - selectRect.min_x) / monitorInfoRef.current.monitor_scale_factor,
            height:
                (selectRect.max_y - selectRect.min_y) / monitorInfoRef.current.monitor_scale_factor,
            left: selectRect.min_x / monitorInfoRef.current.monitor_scale_factor,
            top: selectRect.min_y / monitorInfoRef.current.monitor_scale_factor,
            opacity: 1,
        });

        const canvasApp = drawLayerActionRef.current?.getCanvasApp();
        if (!canvasApp) {
            return;
        }

        const imageData = drawLayerActionRef.current
            ?.getCanvasApp()
            ?.renderer.extract.canvas(canvasApp.stage)
            .getContext('2d')
            ?.getImageData(
                selectRect.min_x,
                selectRect.min_y,
                selectRect.max_x - selectRect.min_x,
                selectRect.max_y - selectRect.min_y,
            );
        if (!imageData) {
            return;
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = selectRect.max_x - selectRect.min_x;
        tempCanvas.height = selectRect.max_y - selectRect.min_y;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) {
            return;
        }

        tempCtx.putImageData(imageData, 0, 0);

        QrScanner.scanImage(tempCanvas, {
            qrEngine: QrScanner.createQrEngine(),
        })
            .then((result) => {
                setQrCode(result.data);
            })
            .catch(() => {
                setQrCode('');
                message.warning(
                    intl.formatMessage({
                        id: 'draw.extraTool.scanQrcode.error',
                    }),
                );
            });
    }, [drawLayerActionRef, monitorInfoRef, intl, message, selectLayerActionRef]);

    useHotkeysApp(
        'Ctrl+A',
        (event) => {
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
            preventDefault: true,
            keyup: false,
            keydown: true,
        },
    );

    const qrCodeContent = useMemo(() => {
        if (!qrCode) {
            return '';
        }

        // 简单判断下
        if (qrCode.startsWith('http') || qrCode.startsWith('https')) {
            return (
                <a
                    onClick={() => {
                        openUrl(qrCode);
                        finishCapture();
                    }}
                >
                    {qrCode}
                </a>
            );
        }

        return qrCode;
    }, [finishCapture, qrCode]);

    return (
        <div
            style={{
                width: 0,
                height: 0,
                opacity: 0,
                ...containerStyle,
                background: token.colorBgContainer,
                padding: token.padding,
                position: 'fixed',
                zIndex: zIndexs.Draw_ScanQrcodeResult,
                pointerEvents: 'auto',
                boxSizing: 'border-box',
                transition: `opacity ${token.motionDurationFast} ${token.motionEaseInOut}`,
            }}
            ref={containerElementRef}
        >
            {qrCode === undefined ? (
                <Spin spinning={true} />
            ) : (
                <Typography.Paragraph
                    copyable={
                        qrCode
                            ? {
                                  text: qrCode,
                                  onCopy: () => {
                                      finishCapture();
                                  },
                              }
                            : false
                    }
                >
                    {qrCodeContent}
                </Typography.Paragraph>
            )}
        </div>
    );
};
