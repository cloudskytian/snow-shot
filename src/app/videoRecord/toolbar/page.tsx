'use client';

import { CloseOutlined, HolderOutlined, PauseOutlined } from '@ant-design/icons';
import { Button, Flex, Spin, theme } from 'antd';
import { useIntl } from 'react-intl';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { zIndexs } from '@/utils/zIndex';
import {
    MicrophoneIcon,
    ResumeRecordIcon,
    StartRecordIcon,
    StopRecordIcon,
} from '@/components/icons';
import { getButtonIconColorByState } from '@/app/draw/components/drawToolbar/extra';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { MonitorInfo } from '@/commands/core';
import { ElementRect } from '@/commands';
import { getVideoRecordParams, getVideoRecordSaveDirectory, VideoRecordState } from '../extra';
import {
    VideoFormat,
    videoRecordKill,
    videoRecordPause,
    videoRecordResume,
    videoRecordStart,
    videoRecordStop,
} from '@/commands/videoRecord';
import {
    changeVideoRecordState,
    closeVideoRecordWindow,
    VideoRecordWindowInfo,
} from '@/functions/videoRecord';
import { EventListenerContext } from '@/components/eventListener';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import {
    AppSettingsActionContext,
    AppSettingsData,
    AppSettingsGroup,
    AppSettingsPublisher,
} from '@/app/contextWrap';
import { generateImageFileName } from '@/utils/file';
import { useAppSettingsLoad } from '@/hooks/useAppSettingsLoad';
import { join as joinPath } from '@tauri-apps/api/path';

dayjs.extend(duration);

export default function VideoRecordToolbar() {
    const { token } = theme.useToken();
    const intl = useIntl();

    const monitorInfoRef = useRef<MonitorInfo | undefined>(undefined);
    const selectRectRef = useRef<ElementRect | undefined>(undefined);

    const { addListener, removeListener } = useContext(EventListenerContext);

    const toolbarRef = useRef<HTMLDivElement>(null);
    const durationFormatRef = useRef<HTMLDivElement>(null);

    const init = useCallback((monitorInfo: MonitorInfo, selectRect: ElementRect) => {
        monitorInfoRef.current = monitorInfo;
        selectRectRef.current = selectRect;

        const appWindow = getCurrentWindow();
        const scaleFactor = window.devicePixelRatio;

        const toolbarWidth = (toolbarRef.current?.clientWidth ?? 0) + 3 * 2;
        const toolbarHeight = (toolbarRef.current?.clientHeight ?? 0) + 3 * 2;

        const physicalWidth = Math.round(toolbarWidth * scaleFactor);
        const physicalHeight = Math.round(toolbarHeight * scaleFactor);

        const screenWidth = window.screen.width * scaleFactor;

        const centerX = (screenWidth - physicalWidth) / 2;

        appWindow.setSize(new PhysicalSize(physicalWidth, physicalHeight));
        appWindow.setPosition(
            new PhysicalPosition(
                Math.round(monitorInfo.monitor_x + centerX),
                Math.round(monitorInfo.monitor_y + monitorInfo.monitor_height * 0.9),
            ),
        );
    }, []);

    useEffect(() => {
        const { monitorInfo, selectRect } = getVideoRecordParams();

        init(monitorInfo, selectRect);

        const listenerId = addListener('reload-video-record', (params) => {
            const windowInfo = (params as { payload: VideoRecordWindowInfo }).payload;

            init(
                {
                    monitor_x: windowInfo.monitor_x,
                    monitor_y: windowInfo.monitor_y,
                    monitor_width: windowInfo.monitor_width,
                    monitor_height: windowInfo.monitor_height,
                    monitor_scale_factor: windowInfo.monitor_scale_factor,
                    mouse_x: 0,
                    mouse_y: 0,
                },
                {
                    min_x: windowInfo.select_rect_min_x,
                    min_y: windowInfo.select_rect_min_y,
                    max_x: windowInfo.select_rect_max_x,
                    max_y: windowInfo.select_rect_max_y,
                },
            );
        });

        videoRecordKill();

        const killVideoRecord = () => {
            videoRecordKill();
        };

        window.addEventListener('beforeunload', killVideoRecord);

        return () => {
            videoRecordKill();
            window.removeEventListener('beforeunload', killVideoRecord);
            removeListener(listenerId);
        };
    }, [addListener, init, removeListener]);

    const dragTitle = useMemo(() => {
        return intl.formatMessage({ id: 'draw.drag' });
    }, [intl]);

    const [enableMicrophone, setEnableMicrophone] = useState(false);
    // const [enableSystemAudio, setEnableSystemAudio] = useState(true);
    const durationRef = useRef(0);
    const [videoRecordState, setVideoRecordState] = useState(VideoRecordState.Idle);

    const durationTimer = useRef<NodeJS.Timeout | null>(null);

    const updateDurationFormat = useCallback(() => {
        durationFormatRef.current!.innerText = dayjs
            .duration(durationRef.current, 'seconds')
            .format('HH:mm:ss');
    }, []);

    const stopDurationTimer = useCallback(() => {
        if (durationTimer.current) {
            clearInterval(durationTimer.current);
            durationTimer.current = null;
        }
    }, []);

    const startDurationTimer = useCallback(() => {
        durationTimer.current = setInterval(() => {
            durationRef.current += 0.1;
            updateDurationFormat();
        }, 100);
    }, [updateDurationFormat]);

    useEffect(() => {
        updateDurationFormat();

        return () => {
            if (durationTimer.current) {
                clearInterval(durationTimer.current);
            }
        };
    }, [updateDurationFormat]);

    useEffect(() => {
        changeVideoRecordState(videoRecordState);
    }, [videoRecordState]);

    const [startRecordLoading, setStartRecordLoading] = useState(false);
    const [pauseRecordLoading, setPauseRecordLoading] = useState(false);
    const [resumeRecordLoading, setResumeRecordLoading] = useState(false);
    const [stopRecordLoading, setStopRecordLoading] = useState(false);
    const [settingLoading, setSettingLoading] = useState(true);

    const [getAppSettings] = useStateSubscriber(AppSettingsPublisher, undefined);
    const { updateAppSettings } = useContext(AppSettingsActionContext);
    useAppSettingsLoad(
        useCallback((appSettings: AppSettingsData) => {
            setEnableMicrophone(appSettings[AppSettingsGroup.Cache].enableMicrophone);
            setSettingLoading(false);
        }, []),
        true,
    );

    const stopRecord = useCallback(async () => {
        setStopRecordLoading(true);
        try {
            await videoRecordStop();

            setVideoRecordState(VideoRecordState.Idle);

            stopDurationTimer();

            durationRef.current = 0;
            updateDurationFormat();
        } catch {}

        setStopRecordLoading(false);
    }, [updateDurationFormat, stopDurationTimer]);

    return (
        <div className="video-record-toolbar-container">
            <div data-tauri-drag-region className="toolbar-drag-region before" />
            <div data-tauri-drag-region className="toolbar-drag-region after" />

            <Spin spinning={settingLoading}>
                <div className="video-record-toolbar" ref={toolbarRef}>
                    <Flex align="center" gap={token.paddingXS}>
                        <div className="drag-button" title={dragTitle}>
                            <HolderOutlined />
                        </div>

                        {videoRecordState === VideoRecordState.Idle && (
                            <Button
                                loading={startRecordLoading}
                                disabled={videoRecordState !== VideoRecordState.Idle}
                                onClick={async () => {
                                    setStartRecordLoading(true);

                                    const appSettings = getAppSettings();

                                    videoRecordStart(
                                        selectRectRef.current?.min_x ?? 0,
                                        selectRectRef.current?.min_y ?? 0,
                                        selectRectRef.current?.max_x ?? 0,
                                        selectRectRef.current?.max_y ?? 0,
                                        await joinPath(
                                            await getVideoRecordSaveDirectory(appSettings),
                                            generateImageFileName(
                                                appSettings[AppSettingsGroup.FunctionOutput]
                                                    .videoRecordFileNameFormat,
                                            ),
                                        ),
                                        VideoFormat.Mp4,
                                        appSettings[AppSettingsGroup.FunctionVideoRecord].frameRate,
                                        enableMicrophone,
                                        false,
                                        appSettings[AppSettingsGroup.FunctionVideoRecord]
                                            .microphoneDeviceName,
                                        appSettings[AppSettingsGroup.FunctionVideoRecord].hwaccel,
                                        appSettings[AppSettingsGroup.FunctionVideoRecord].encoder,
                                        appSettings[AppSettingsGroup.FunctionVideoRecord]
                                            .encoderPreset,
                                    )
                                        .then(() => {
                                            setVideoRecordState(VideoRecordState.Recording);

                                            stopDurationTimer();

                                            durationRef.current = 0;
                                            updateDurationFormat();

                                            startDurationTimer();
                                        })
                                        .finally(() => {
                                            setStartRecordLoading(false);
                                        });
                                }}
                                icon={
                                    <StartRecordIcon
                                        style={{
                                            color: token.colorPrimary,
                                            position: 'relative',
                                        }}
                                    />
                                }
                                title={intl.formatMessage({ id: 'videoRecord.startRecord' })}
                                type={'text'}
                                key="start-record"
                            />
                        )}

                        {(videoRecordState === VideoRecordState.Recording ||
                            videoRecordState === VideoRecordState.Paused) && (
                            <Button
                                loading={stopRecordLoading}
                                onClick={() => {
                                    stopRecord();
                                }}
                                icon={
                                    <StopRecordIcon
                                        style={{
                                            color: token.colorError,
                                            position: 'relative',
                                        }}
                                    />
                                }
                                title={intl.formatMessage({ id: 'videoRecord.stopRecord' })}
                                type={'text'}
                                key="stop-record"
                            />
                        )}

                        {videoRecordState !== VideoRecordState.Paused && (
                            <Button
                                loading={pauseRecordLoading}
                                disabled={videoRecordState !== VideoRecordState.Recording}
                                onClick={() => {
                                    setPauseRecordLoading(true);
                                    videoRecordPause()
                                        .then(() => {
                                            setVideoRecordState(VideoRecordState.Paused);

                                            stopDurationTimer();
                                        })
                                        .finally(() => {
                                            setPauseRecordLoading(false);
                                        });
                                }}
                                icon={
                                    <PauseOutlined
                                        style={{
                                            color:
                                                videoRecordState !== VideoRecordState.Recording
                                                    ? token.colorTextDisabled
                                                    : token.colorWarning,
                                            position: 'relative',
                                        }}
                                    />
                                }
                                title={intl.formatMessage({ id: 'videoRecord.pauseRecord' })}
                                type={'text'}
                                key="pause-record"
                            />
                        )}

                        {videoRecordState === VideoRecordState.Paused && (
                            <Button
                                loading={resumeRecordLoading}
                                disabled={videoRecordState !== VideoRecordState.Paused}
                                onClick={() => {
                                    setResumeRecordLoading(true);
                                    videoRecordResume()
                                        .then(() => {
                                            setVideoRecordState(VideoRecordState.Recording);

                                            startDurationTimer();
                                        })
                                        .finally(() => {
                                            setResumeRecordLoading(false);
                                        });
                                }}
                                icon={
                                    <ResumeRecordIcon
                                        style={{
                                            color: token.colorPrimary,
                                            position: 'relative',
                                        }}
                                    />
                                }
                                title={intl.formatMessage({ id: 'videoRecord.resumeRecord' })}
                                type={'text'}
                                key="resume-record"
                            />
                        )}

                        <div className="video-record-toolbar-time" ref={durationFormatRef} />

                        <Button
                            onClick={() => {
                                setEnableMicrophone((prev) => {
                                    const value = !prev;

                                    updateAppSettings(
                                        AppSettingsGroup.Cache,
                                        { enableMicrophone: value },
                                        true,
                                        true,
                                        false,
                                        true,
                                        true,
                                    );

                                    return value;
                                });
                            }}
                            icon={
                                <MicrophoneIcon
                                    style={{
                                        color: getButtonIconColorByState(enableMicrophone, token),
                                    }}
                                />
                            }
                            title={intl.formatMessage({ id: 'videoRecord.microphone' })}
                            type={'text'}
                            key="microphone"
                        />

                        {/* <Button
                        onClick={() => {
                            setEnableSystemAudio((prev) => !prev);
                        }}
                        icon={
                            <SystemAudioIcon
                                style={{
                                    color: getButtonIconColorByState(enableSystemAudio, token),
                                }}
                            />
                        }
                        title={intl.formatMessage({ id: 'videoRecord.systemAudio' })}
                        type={'text'}
                        key="system-audio"
                    /> */}

                        <div className="video-record-toolbar-splitter" />

                        <Button
                            onClick={() => {
                                stopRecord().then(() => {
                                    closeVideoRecordWindow().then(() => {
                                        getCurrentWindow().close();
                                    });
                                });
                            }}
                            icon={
                                <CloseOutlined
                                    style={{
                                        color: token.colorError,
                                        fontSize: '0.83em',
                                        position: 'relative',
                                        bottom: '0.1em',
                                    }}
                                />
                            }
                            title={intl.formatMessage({ id: 'videoRecord.close' })}
                            type={'text'}
                            key="close"
                        />

                        <div className="drag-button" title={dragTitle}>
                            <HolderOutlined />
                        </div>
                    </Flex>
                </div>
            </Spin>

            <style jsx>{`
                .video-record-toolbar-container {
                    position: fixed;
                    z-index: ${zIndexs.VideoRecord_Toolbar};
                    padding: 3px;
                    user-select: none;
                }

                .toolbar-drag-region {
                    position: absolute;
                    top: 0;
                    width: calc(${token.paddingSM + 3}px + 1em + ${token.paddingXS}px);
                    opacity: 0;
                    height: 100%;
                    background-color: red;
                    z-index: ${zIndexs.VideoRecord_ToolbarDragRegion};
                    cursor: grab;
                }

                .toolbar-drag-region.before {
                    left: 0;
                }

                .toolbar-drag-region.after {
                    right: 0;
                }

                .toolbar-drag-region:active {
                    cursor: grabbing;
                }

                .video-record-toolbar {
                    pointer-events: auto;
                    padding: ${token.paddingXXS}px ${token.paddingSM}px;
                    box-sizing: border-box;
                    background-color: ${token.colorBgContainer};
                    border-radius: ${token.borderRadiusLG}px;
                    cursor: default; /* 防止非拖动区域也变成可拖动状态 */
                    color: ${token.colorText};
                    box-shadow: 0 0 3px 0px ${token.colorPrimaryHover};
                    transition: opacity ${token.motionDurationMid} ${token.motionEaseInOut};
                }

                .drag-button {
                    font-size: 18px;
                    color: ${token.colorTextQuaternary};
                    cursor: grab;
                }

                .video-record-toolbar-time {
                    width: 54px;
                    font-size: 14px;
                    text-align: center;
                    color: ${token.colorTextSecondary};
                }

                .drag-button:active {
                    cursor: grabbing;
                }

                .video-record-toolbar :global(.ant-btn) :global(.ant-btn-icon) {
                    font-size: 24px;
                }

                .video-record-toolbar-splitter {
                    width: 1px;
                    height: 0.83em;
                    background-color: ${token.colorBorder};
                    margin: 0 ${token.marginXXS}px;
                }
            `}</style>
        </div>
    );
}
