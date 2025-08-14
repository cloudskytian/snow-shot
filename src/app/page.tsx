'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { Space, Spin, Tooltip } from 'antd';
import { ContentWrap } from '@/components/contentWrap';
import {
    ChatIcon,
    ClipboardIcon,
    FixedIcon,
    FocusedWindowIcon,
    FullScreenDrawIcon,
    OcrDetectIcon,
    OcrTranslateIcon,
    ScreenshotIcon,
    SelectTextIcon,
    TopWindowIcon,
    TranslationIcon,
    VideoRecordIcon,
} from '@/components/icons';
import { FunctionButton } from '@/components/functionButton';
import {
    executeScreenshot,
    executeScreenshotFocusedWindow,
    ScreenshotType,
} from '@/functions/screenshot';
import {
    isRegistered,
    register,
    unregister,
    unregisterAll,
} from '@tauri-apps/plugin-global-shortcut';
import { KeyButton } from '@/components/keyButton';
import {
    AppSettingsActionContext,
    AppSettingsData,
    AppSettingsGroup,
    AppSettingsPublisher,
} from './contextWrap';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useAppSettingsLoad } from '@/hooks/useAppSettingsLoad';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import {
    AppFunction,
    AppFunctionComponentConfig,
    AppFunctionConfig,
    AppFunctionGroup,
    convertShortcutKeyStatusToButtonColor,
    convertShortcutKeyStatusToTip,
    defaultAppFunctionConfigs,
    ShortcutKeyStatus,
} from './extra';
import { autoStartHideWindow } from '@/commands';
import { GroupTitle } from '@/components/groupTitle';
import { theme } from 'antd';
import { ResetSettingsButton } from '@/components/resetSettingsButton';
import {
    executeChat,
    executeChatSelectedText,
    executeTranslate,
    executeTranslateSelectedText,
} from '@/functions/tools';
import { TrayIconStatePublisher } from './trayIcon';
import { createFixedContentWindow, createFullScreenDrawWindow } from '@/commands/core';
import { IconLabel } from '@/components/iconLable';
import { usePlatform } from '@/hooks/usePlatform';
import { CheckPermissions } from '@/components/checkPermissions';

export default function Home() {
    const { token } = theme.useToken();

    const disableShortcutKeyRef = useRef(false);
    const [getTrayIconState] = useStateSubscriber(TrayIconStatePublisher, undefined);

    const [getAppSettings] = useStateSubscriber(AppSettingsPublisher, undefined);

    const {
        configs: defaultAppFunctionComponentConfigs,
        groupConfigs: defaultAppFunctionComponentGroupConfigs,
    }: {
        configs: Record<AppFunction, AppFunctionComponentConfig>;
        groupConfigs: Record<AppFunctionGroup, AppFunctionComponentConfig[]>;
    } = useMemo(() => {
        const configs = Object.keys(defaultAppFunctionConfigs).reduce(
            (configs, key) => {
                let buttonTitle;
                let buttonIcon;
                let buttonOnClick: () => void | Promise<void>;
                switch (key) {
                    case AppFunction.ScreenshotFixed:
                        buttonTitle = (
                            <FormattedMessage
                                id="home.screenshotAfter"
                                values={{
                                    text: <FormattedMessage id="draw.fixedTool" />,
                                }}
                            />
                        );
                        buttonIcon = <FixedIcon style={{ fontSize: '1.3em' }} />;
                        buttonOnClick = () => executeScreenshot(ScreenshotType.Fixed);
                        break;
                    case AppFunction.ScreenshotOcr:
                        buttonTitle = (
                            <FormattedMessage
                                id="home.screenshotAfter"
                                values={{
                                    text: <FormattedMessage id="draw.ocrDetectTool" />,
                                }}
                            />
                        );
                        buttonIcon = <OcrDetectIcon />;
                        buttonOnClick = () => executeScreenshot(ScreenshotType.OcrDetect);
                        break;
                    case AppFunction.ScreenshotOcrTranslate:
                        buttonTitle = (
                            <FormattedMessage
                                id="home.screenshotAfter"
                                values={{
                                    text: <FormattedMessage id="draw.ocrTranslateTool" />,
                                }}
                            />
                        );
                        buttonIcon = <OcrTranslateIcon style={{ fontSize: '1.1em' }} />;
                        buttonOnClick = () => executeScreenshot(ScreenshotType.OcrTranslate);
                        break;
                    case AppFunction.ScreenshotFocusedWindow:
                        buttonTitle = (
                            <IconLabel
                                label={
                                    <FormattedMessage id="home.screenshotFunction.screenshotFocusedWindow" />
                                }
                            />
                        );
                        buttonIcon = <FocusedWindowIcon />;
                        buttonOnClick = async () => {
                            executeScreenshotFocusedWindow(getAppSettings());
                        };
                        break;
                    case AppFunction.ScreenshotCopy:
                        buttonTitle = (
                            <FormattedMessage id="home.screenshotFunction.screenshotCopy" />
                        );
                        buttonIcon = <ClipboardIcon />;
                        buttonOnClick = () => executeScreenshot(ScreenshotType.Copy);
                        break;
                    case AppFunction.TranslationSelectText:
                        buttonTitle = <FormattedMessage id="home.translationSelectText" />;
                        buttonIcon = <SelectTextIcon style={{ fontSize: '1em' }} />;
                        buttonOnClick = async () => {
                            executeTranslateSelectedText();
                        };
                        break;
                    case AppFunction.Translation:
                        buttonTitle = <FormattedMessage id="home.translation" />;
                        buttonIcon = <TranslationIcon />;
                        buttonOnClick = () => {
                            executeTranslate();
                        };
                        break;
                    case AppFunction.ChatSelectText:
                        buttonTitle = <FormattedMessage id="home.chatSelectText" />;
                        buttonIcon = <SelectTextIcon style={{ fontSize: '1em' }} />;
                        buttonOnClick = async () => {
                            executeChatSelectedText();
                        };
                        break;
                    case AppFunction.Chat:
                        buttonTitle = <FormattedMessage id="home.chat" />;
                        buttonIcon = <ChatIcon />;
                        buttonOnClick = () => {
                            executeChat();
                        };
                        break;
                    case AppFunction.TopWindow:
                        buttonTitle = <FormattedMessage id="home.topWindow" />;
                        buttonIcon = <TopWindowIcon />;
                        buttonOnClick = () => executeScreenshot(ScreenshotType.TopWindow);
                        break;
                    case AppFunction.FixedContent:
                        buttonTitle = <FormattedMessage id="home.fixedContent" />;
                        buttonIcon = <ClipboardIcon style={{ fontSize: '1.1em' }} />;
                        buttonOnClick = () => createFixedContentWindow();
                        break;
                    case AppFunction.FullScreenDraw:
                        buttonTitle = <FormattedMessage id="home.fullScreenDraw" />;
                        buttonIcon = <FullScreenDrawIcon style={{ fontSize: '1.2em' }} />;
                        buttonOnClick = () => createFullScreenDrawWindow();
                        break;
                    case AppFunction.VideoRecord:
                        buttonTitle = <FormattedMessage id="draw.extraTool.videoRecord" />;
                        buttonIcon = <VideoRecordIcon style={{ fontSize: '1.1em' }} />;
                        buttonOnClick = () => executeScreenshot(ScreenshotType.VideoRecord);
                        break;
                    case AppFunction.Screenshot:
                    default:
                        buttonTitle = <FormattedMessage id="home.screenshot" />;
                        buttonIcon = <ScreenshotIcon />;
                        buttonOnClick = () => executeScreenshot();
                        break;
                }

                const onClick = async () => {
                    if (disableShortcutKeyRef.current) {
                        return;
                    }

                    await buttonOnClick();
                };
                configs[key as AppFunction] = {
                    ...defaultAppFunctionConfigs[key as AppFunction],
                    configKey: key as AppFunction,
                    title: buttonTitle,
                    icon: buttonIcon,
                    onClick,
                    onKeyChange: async (value: string, prevValue: string) => {
                        if (prevValue) {
                            if (await isRegistered(prevValue)) {
                                await unregister(prevValue);
                            }
                        }

                        if (!value) {
                            return false;
                        }

                        if (await isRegistered(value)) {
                            return false;
                        }

                        try {
                            await register(value, (event) => {
                                if (event.state !== 'Released') {
                                    return;
                                }

                                if (getTrayIconState()?.disableShortcut) {
                                    return;
                                }

                                onClick();
                            });
                        } catch (error) {
                            // 将错误传给组件，组件捕获错误来判断快捷键状态
                            throw error;
                        }

                        return true;
                    },
                };

                return configs;
            },
            {} as Record<AppFunction, AppFunctionComponentConfig>,
        );

        const groupConfigs = Object.values(configs).reduce(
            (groupConfigs, config) => {
                if (!groupConfigs[config.group]) {
                    groupConfigs[config.group] = [];
                }

                groupConfigs[config.group].push(config);
                return groupConfigs;
            },
            {} as Record<AppFunctionGroup, AppFunctionComponentConfig[]>,
        );

        return { configs, groupConfigs };
    }, [getAppSettings, getTrayIconState]);

    const [shortcutKeyStatus, setShortcutKeyStatus] =
        useState<Record<AppFunction, ShortcutKeyStatus>>();

    const [updateShortcutKeyStatusLoading, setUpdateShortcutKeyStatusLoading] = useState(true);
    const previousAppFunctionSettingsRef =
        useRef<AppSettingsData[AppSettingsGroup.AppFunction]>(undefined);

    const appFunctionComponentConfigsKeys = useMemo(
        () => Object.keys(defaultAppFunctionComponentConfigs),
        [defaultAppFunctionComponentConfigs],
    );

    const updateShortcutKeyStatus = useCallback(
        async (settings: Record<AppFunction, AppFunctionConfig>) => {
            setUpdateShortcutKeyStatusLoading(true);
            const keyStatus: Record<AppFunction, ShortcutKeyStatus> = {} as Record<
                AppFunction,
                ShortcutKeyStatus
            >;

            await Promise.all(
                appFunctionComponentConfigsKeys.map(async (key) => {
                    const config = defaultAppFunctionComponentConfigs[key as AppFunction];
                    const currentShortcutKey = settings[key as AppFunction].shortcutKey;

                    try {
                        const isSuccess = await config.onKeyChange(
                            currentShortcutKey,
                            (previousAppFunctionSettingsRef.current ?? settings)[key as AppFunction]
                                .shortcutKey,
                        );

                        if (!currentShortcutKey) {
                            keyStatus[key as AppFunction] = ShortcutKeyStatus.None;
                        } else {
                            keyStatus[key as AppFunction] = isSuccess
                                ? ShortcutKeyStatus.Registered
                                : ShortcutKeyStatus.Unregistered;
                        }

                        if (
                            keyStatus[key as AppFunction] === ShortcutKeyStatus.Registered &&
                            currentShortcutKey === 'PrintScreen'
                        ) {
                            keyStatus[key as AppFunction] = ShortcutKeyStatus.PrintScreen;
                        }
                    } catch {
                        keyStatus[key as AppFunction] = ShortcutKeyStatus.Error;
                    }
                }),
            );

            setShortcutKeyStatus(keyStatus);
            previousAppFunctionSettingsRef.current = settings;
            setUpdateShortcutKeyStatusLoading(false);
        },
        [appFunctionComponentConfigsKeys, defaultAppFunctionComponentConfigs],
    );

    const [appSettingsLoading, setAppSettingsLoading] = useState(true);
    const { updateAppSettings } = useContext(AppSettingsActionContext);
    const [appFunctionSettings, setAppFunctionSettings] =
        useState<AppSettingsData[AppSettingsGroup.AppFunction]>();
    useAppSettingsLoad(
        useCallback(() => {
            unregisterAll().then(() => {
                setAppSettingsLoading(false);
            });
        }, []),
    );

    useStateSubscriber(
        AppSettingsPublisher,
        useCallback((settings: AppSettingsData) => {
            setAppFunctionSettings(settings[AppSettingsGroup.AppFunction]);
        }, []),
    );

    useEffect(() => {
        if (appSettingsLoading) {
            return;
        }

        if (!appFunctionSettings) {
            return;
        }

        updateShortcutKeyStatus(appFunctionSettings);
    }, [appFunctionSettings, appSettingsLoading, updateShortcutKeyStatus]);

    useEffect(() => {
        if (!window.__APP_AUTO_START_HIDE_WINDOW__) {
            autoStartHideWindow();
            window.__APP_AUTO_START_HIDE_WINDOW__ = true;
        }
    }, []);

    const resetFliter = useCallback((group: AppFunctionGroup) => {
        return (settings: Record<string, unknown>) => {
            const newSettings: Partial<AppSettingsData[AppSettingsGroup.AppFunction]> = {};

            Object.keys(settings).forEach((key) => {
                if ((settings[key] as AppFunctionConfig).group !== group) {
                    return;
                }

                newSettings[key as AppFunction] = settings[key] as AppFunctionConfig;
            });

            return newSettings;
        };
    }, []);

    const [currentPlatform] = usePlatform();

    return (
        <ContentWrap className="home-wrap">
            <CheckPermissions />

            {Object.keys(defaultAppFunctionComponentGroupConfigs).map((group) => {
                const configs = defaultAppFunctionComponentGroupConfigs[group as AppFunctionGroup];

                let groupTitle;
                switch (group) {
                    case AppFunctionGroup.Screenshot:
                        groupTitle = (
                            <GroupTitle
                                id="screenshotFunction"
                                extra={
                                    <ResetSettingsButton
                                        title={
                                            <FormattedMessage
                                                id="home.screenshotFunction"
                                                key="screenshotFunction"
                                            />
                                        }
                                        appSettingsGroup={AppSettingsGroup.AppFunction}
                                        filter={resetFliter(AppFunctionGroup.Screenshot)}
                                    />
                                }
                            >
                                <FormattedMessage
                                    id="home.screenshotFunction"
                                    key="screenshotFunction"
                                />
                            </GroupTitle>
                        );
                        break;
                    case AppFunctionGroup.Translation:
                        groupTitle = (
                            <GroupTitle
                                id="translationFunction"
                                extra={
                                    <ResetSettingsButton
                                        title={<FormattedMessage id="home.translationFunction" />}
                                        appSettingsGroup={AppSettingsGroup.AppFunction}
                                        filter={resetFliter(AppFunctionGroup.Translation)}
                                    />
                                }
                            >
                                <FormattedMessage
                                    id="home.translationFunction"
                                    key="translationFunction"
                                />
                            </GroupTitle>
                        );
                        break;
                    case AppFunctionGroup.Chat:
                        groupTitle = (
                            <GroupTitle
                                id="chatFunction"
                                extra={
                                    <ResetSettingsButton
                                        title={<FormattedMessage id="home.chatFunction" />}
                                        appSettingsGroup={AppSettingsGroup.AppFunction}
                                        filter={resetFliter(AppFunctionGroup.Chat)}
                                    />
                                }
                            >
                                <FormattedMessage id="home.chatFunction" key="chatFunction" />
                            </GroupTitle>
                        );
                        break;
                    case AppFunctionGroup.Other:
                        groupTitle = (
                            <GroupTitle
                                id="otherFunction"
                                extra={
                                    <ResetSettingsButton
                                        title={<FormattedMessage id="home.otherFunction" />}
                                        appSettingsGroup={AppSettingsGroup.AppFunction}
                                        filter={resetFliter(AppFunctionGroup.Other)}
                                    />
                                }
                            >
                                <FormattedMessage id="home.otherFunction" key="otherFunction" />
                            </GroupTitle>
                        );
                        break;
                }

                let speicalKeys: string[] | undefined;
                switch (group) {
                    case AppFunctionGroup.Screenshot:
                    case AppFunctionGroup.Translation:
                    case AppFunctionGroup.Chat:
                    case AppFunctionGroup.Other:
                        speicalKeys = ['PrintScreen'];
                        break;
                }

                return (
                    <div key={`${group}`} style={{ marginBottom: token.marginLG }}>
                        {groupTitle}
                        <Spin
                            key={`${group}`}
                            spinning={updateShortcutKeyStatusLoading || appSettingsLoading}
                        >
                            <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
                                {configs
                                    .filter((config) => {
                                        if (
                                            currentPlatform === 'macos' &&
                                            config.configKey === AppFunction.TopWindow
                                        ) {
                                            return false;
                                        }

                                        return true;
                                    })
                                    .map((config) => {
                                        const key = config.configKey;
                                        const currentShortcutKey =
                                            appFunctionSettings?.[key as AppFunction]?.shortcutKey;
                                        const statusColor = appSettingsLoading
                                            ? undefined
                                            : convertShortcutKeyStatusToButtonColor(
                                                  shortcutKeyStatus?.[key as AppFunction],
                                              );

                                        const statusTip = appSettingsLoading
                                            ? undefined
                                            : convertShortcutKeyStatusToTip(
                                                  shortcutKeyStatus?.[key as AppFunction],
                                              );

                                        let children = <></>;
                                        if (
                                            shortcutKeyStatus?.[key as AppFunction] ===
                                            ShortcutKeyStatus.None
                                        ) {
                                            children = (
                                                <div style={{ color: token.colorTextDescription }}>
                                                    <FormattedMessage id="home.shortcut.none" />
                                                </div>
                                            );
                                        } else if (statusTip) {
                                            children = (
                                                <Tooltip
                                                    title={convertShortcutKeyStatusToTip(
                                                        shortcutKeyStatus?.[key as AppFunction],
                                                    )}
                                                >
                                                    <InfoCircleOutlined />
                                                </Tooltip>
                                            );
                                        }

                                        return (
                                            <div key={`${group}-${key}`}>
                                                <FunctionButton
                                                    label={config.title}
                                                    icon={config.icon}
                                                    onClick={config.onClick}
                                                >
                                                    <KeyButton
                                                        speicalKeys={speicalKeys}
                                                        title={config.title}
                                                        maxWidth={200}
                                                        keyValue={currentShortcutKey ?? ''}
                                                        buttonProps={{
                                                            variant: 'dashed',
                                                            color: statusColor,
                                                            children,
                                                            onClick: () => {
                                                                disableShortcutKeyRef.current = true;
                                                            },
                                                        }}
                                                        onCancel={() => {
                                                            disableShortcutKeyRef.current = false;
                                                        }}
                                                        onKeyChange={async (value) => {
                                                            disableShortcutKeyRef.current = false;
                                                            updateAppSettings(
                                                                AppSettingsGroup.AppFunction,
                                                                {
                                                                    [key as AppFunction]: {
                                                                        ...appFunctionSettings,
                                                                        shortcutKey: value,
                                                                    },
                                                                },
                                                                false,
                                                                true,
                                                                false,
                                                                false,
                                                            );
                                                        }}
                                                        maxLength={1}
                                                    />
                                                </FunctionButton>
                                            </div>
                                        );
                                    })}
                            </Space>
                        </Spin>
                    </div>
                );
            })}

            <style jsx>{`
                .home-wrap {
                }
            `}</style>
        </ContentWrap>
    );
}
