'use client';

import { createContext, RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    BaseDirectory,
    mkdir,
    readTextFile,
    writeTextFile,
    remove,
    exists,
} from '@tauri-apps/plugin-fs';
import { ConfigProvider, theme } from 'antd';
import { debounce, isEqual, trim } from 'es-toolkit';
import zhCN from 'antd/es/locale/zh_CN';
import zhTW from 'antd/es/locale/zh_TW';
import enUS from 'antd/es/locale/en_US';
import { IntlProvider } from 'react-intl';
import { messages } from '@/messages/map';
import { ElementRect, ImageBuffer } from '@/commands';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow, Window as AppWindow } from '@tauri-apps/api/window';
import { AppFunction, AppFunctionConfig, defaultAppFunctionConfigs } from './extra';
import { createPublisher, withStatePublisher } from '@/hooks/useStatePublisher';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import {
    defaultDrawToolbarKeyEventSettings,
    KeyEventKey as DrawToolbarKeyEventKey,
    KeyEventValue as DrawToolbarKeyEventValue,
} from './draw/components/drawToolbar/components/keyEventWrap/extra';
import React from 'react';
import * as appAutostart from '@tauri-apps/plugin-autostart';
import { defaultKeyEventSettings, KeyEventKey, KeyEventValue } from '@/core/hotKeys';
import { TranslationDomain, TranslationType } from '@/services/tools/translation';
import { setEnableProxy } from '@/commands/core';
import { ChatApiConfig, TranslationApiConfig } from './settings/functionSettings/extra';
import { defaultTranslationPrompt } from './tools/translation/extra';
import { ColorPickerShowMode } from './draw/components/colorPicker';
import { ImageFormat } from '@/utils/file';
import { appConfigDir, join as joinPath } from '@tauri-apps/api/path';
import { DrawState } from './fullScreenDraw/components/drawCore/extra';
import { OcrDetectAfterAction } from './fixedContent/components/ocrResult';
import { OcrModel } from '@/commands/ocr';
import { HistoryValidDuration } from '@/utils/captureHistory';
import { getPlatformValue } from '@/utils';
import { VideoMaxSize } from '@/commands/videoRecord';
import * as tauriLog from '@tauri-apps/plugin-log';
import { appWarn } from '@/utils/log';

export enum AppSettingsGroup {
    Common = 'common',
    CommonTrayIcon = 'commonTrayIcon',
    Cache = 'cache_20250731',
    Screenshot = 'screenshot',
    FixedContent = 'fixedContent',
    DrawToolbarKeyEvent = 'drawToolbarKeyEvent_20250526',
    KeyEvent = 'KeyEvent',
    AppFunction = 'appFunction',
    Render = 'render',
    SystemCommon = 'systemCommon',
    SystemChat = 'systemChat',
    SystemNetwork = 'systemNetwork',
    SystemScreenshot = 'systemScreenshot_20250627',
    SystemScrollScreenshot = 'systemScrollScreenshot_20250628',
    FunctionChat = 'functionChat',
    FunctionTranslation = 'functionTranslation',
    FunctionScreenshot = 'functionScreenshot',
    FunctionFullScreenDraw = 'functionFullScreenDraw',
    FunctionOutput = 'functionOutput',
    FunctionFixedContent = 'functionFixedContent',
    FunctionVideoRecord = 'functionVideoRecord',
    FunctionTrayIcon = 'functionTrayIcon',
}

export enum AppSettingsLanguage {
    ZHHans = 'zh-Hans',
    ZHHant = 'zh-Hant',
    EN = 'en',
}

export enum AppSettingsControlNode {
    Circle = 'circle',
    Polyline = 'polyline',
}

export enum AppSettingsFixedContentInitialPosition {
    MonitorCenter = 'monitorCenter',
    MousePosition = 'mousePosition',
}

export enum TrayIconClickAction {
    ShowMainWindow = 'showMainWindow',
    Screenshot = 'screenshot',
}

export enum TrayIconDefaultIcon {
    Default = 'default',
    Light = 'light',
    Dark = 'dark',
    SnowDefault = 'snow-default',
    SnowLight = 'snow-light',
    SnowDark = 'snow-dark',
}

export type AppSettingsData = {
    [AppSettingsGroup.Common]: {
        darkMode: boolean;
        language: AppSettingsLanguage;
        /** 浏览器语言，用于自动切换语言 */
        browserLanguage: string;
    };
    [AppSettingsGroup.Screenshot]: {
        /** 选区控件样式 */
        controlNode: AppSettingsControlNode;
        /** 颜色选择器模式 */
        colorPickerShowMode: ColorPickerShowMode;
        /** 超出选区范围的元素透明度 */
        beyondSelectRectElementOpacity: number;
        /** 快捷键提示透明度 */
        hotKeyTipOpacity: number;
        /** 全屏辅助线颜色 */
        fullScreenAuxiliaryLineColor: string;
        /** 显示器中心辅助线颜色 */
        monitorCenterAuxiliaryLineColor: string;
        /** 禁用动画 */
        disableAnimation: boolean;
        /** 自定义工具栏工具 */
        customToolbarToolList: DrawState[];
    };
    [AppSettingsGroup.FixedContent]: {
        /** 边框颜色 */
        borderColor: string;
    };
    [AppSettingsGroup.CommonTrayIcon]: {
        /** 自定义托盘图标 */
        iconPath: string;
        defaultIcons: TrayIconDefaultIcon;
    };
    [AppSettingsGroup.Cache]: {
        menuCollapsed: boolean;
        chatModel: string;
        translationType: TranslationType | string;
        translationDomain: TranslationDomain;
        targetLanguage: string;
        ocrTranslateAutoReplace: boolean;
        ocrTranslateKeepLayout: boolean;
        colorPickerColorFormatIndex: number;
        prevImageFormat: ImageFormat;
        prevSelectRect: ElementRect;
        enableMicrophone: boolean;
        /** 是否启用锁定绘制工具 */
        enableLockDrawTool: boolean;
        /** 序列号工具是否禁用箭头 */
        disableArrowPicker: boolean;
    };
    [AppSettingsGroup.DrawToolbarKeyEvent]: Record<
        DrawToolbarKeyEventKey,
        DrawToolbarKeyEventValue
    >;
    [AppSettingsGroup.KeyEvent]: Record<KeyEventKey, KeyEventValue>;
    [AppSettingsGroup.AppFunction]: Record<AppFunction, AppFunctionConfig>;
    [AppSettingsGroup.Render]: {
        antialias: boolean;
    };
    [AppSettingsGroup.SystemCommon]: {
        autoStart: boolean;
        autoCheckVersion: boolean;
    };
    [AppSettingsGroup.SystemChat]: {
        maxTokens: number;
        temperature: number;
        thinkingBudgetTokens: number;
    };
    [AppSettingsGroup.SystemNetwork]: {
        enableProxy: boolean;
    };
    [AppSettingsGroup.FunctionChat]: {
        autoCreateNewSession: boolean;
        chatApiConfigList: ChatApiConfig[];
    };
    [AppSettingsGroup.FunctionTranslation]: {
        chatPrompt: string;
        translationApiConfigList: TranslationApiConfig[];
    };
    [AppSettingsGroup.FunctionScreenshot]: {
        /** 选取窗口子元素 */
        findChildrenElements: boolean;
        /** 截图快捷键提示 */
        shortcutCanleTip: boolean;
        /** 复制后自动保存文件 */
        autoSaveOnCopy: boolean;
        /** 截图当前具有焦点的窗口时复制到剪贴板 */
        focusedWindowCopyToClipboard: boolean;
        /** 快速保存文件 */
        fastSave: boolean;
        /** 保存文件路径 */
        saveFileDirectory: string;
        /** 保存文件格式 */
        saveFileFormat: ImageFormat;
        /** OCR 后自动执行 */
        ocrAfterAction: OcrDetectAfterAction;
        /** OCR 复制时复制文本 */
        ocrCopyText: boolean;
        /** 锁定绘制工具 */
        lockDrawTool: boolean;
    };
    [AppSettingsGroup.FunctionOutput]: {
        /** 手动保存文件名格式 */
        manualSaveFileNameFormat: string;
        /** 自动保存文件名格式 */
        autoSaveFileNameFormat: string;
        /** 快速保存文件名格式 */
        fastSaveFileNameFormat: string;
        /** 截图当前具有焦点的窗口文件名格式 */
        focusedWindowFileNameFormat: string;
        /** 视频录制文件名格式 */
        videoRecordFileNameFormat: string;
    };
    [AppSettingsGroup.FunctionFixedContent]: {
        /** 以鼠标为中心缩放 */
        zoomWithMouse: boolean;
        /** 固定屏幕后自动 OCR */
        autoOcr: boolean;
        /** 窗口初始位置 */
        initialPosition: AppSettingsFixedContentInitialPosition;
    };
    [AppSettingsGroup.FunctionFullScreenDraw]: {
        /** 默认工具 */
        defaultTool: DrawState;
    };
    [AppSettingsGroup.FunctionVideoRecord]: {
        /** 视频录制保存路径 */
        saveDirectory: string;
        /** 帧率 */
        frameRate: number;
        /** 麦克风设备 */
        microphoneDeviceName: string;
        /** 硬件加速 */
        hwaccel: boolean;
        /** 编码器 */
        encoder: string;
        /** 编码器预设 */
        encoderPreset: string;
        /** 视频最大尺寸 */
        videoMaxSize: VideoMaxSize;
    };
    [AppSettingsGroup.SystemScreenshot]: {
        historyValidDuration: HistoryValidDuration;
        ocrModel: OcrModel;
        ocrDetectAngle: boolean;
    };
    [AppSettingsGroup.SystemScrollScreenshot]: {
        tryRollback: boolean;
        minSide: number;
        maxSide: number;
        sampleRate: number;
        imageFeatureDescriptionLength: number;
        imageFeatureThreshold: number;
    };
    [AppSettingsGroup.FunctionTrayIcon]: {
        /** 托盘点击后 */
        iconClickAction: TrayIconClickAction;
    };
};

export const CanHiddenToolSet: Set<DrawState> = new Set([
    DrawState.Select,
    DrawState.Ellipse,
    DrawState.Arrow,
    DrawState.Pen,
    DrawState.Text,
    DrawState.SerialNumber,
    DrawState.Blur,
    DrawState.Eraser,
    DrawState.Redo,
    DrawState.Fixed,
    DrawState.OcrDetect,
    DrawState.OcrTranslate,
    DrawState.ScrollScreenshot,
]);

export const defaultAppSettingsData: AppSettingsData = {
    [AppSettingsGroup.Common]: {
        darkMode: false,
        language: AppSettingsLanguage.ZHHans,
        browserLanguage: '',
    },
    [AppSettingsGroup.Screenshot]: {
        controlNode: AppSettingsControlNode.Circle,
        // 在 Mac 上禁用动画
        disableAnimation: getPlatformValue(false, true),
        colorPickerShowMode: ColorPickerShowMode.BeyondSelectRect,
        beyondSelectRectElementOpacity: 100,
        fullScreenAuxiliaryLineColor: '#00000000',
        monitorCenterAuxiliaryLineColor: '#00000000',
        hotKeyTipOpacity: 100,
        customToolbarToolList: [
            DrawState.Select,
            DrawState.Ellipse,
            DrawState.Arrow,
            DrawState.Pen,
            DrawState.Text,
            DrawState.SerialNumber,
            DrawState.Blur,
            DrawState.Eraser,
            /** 特殊值，如果禁用则不显示撤销和重做 */
            DrawState.Redo,
            DrawState.Fixed,
            DrawState.OcrDetect,
            DrawState.OcrTranslate,
            DrawState.ScrollScreenshot,
        ],
    },
    [AppSettingsGroup.FixedContent]: {
        borderColor: '#dbdbdb',
    },
    [AppSettingsGroup.CommonTrayIcon]: {
        iconPath: '',
        defaultIcons: TrayIconDefaultIcon.Default,
    },
    [AppSettingsGroup.Cache]: {
        menuCollapsed: false,
        chatModel: 'deepseek-reasoner',
        translationType: TranslationType.Youdao,
        translationDomain: TranslationDomain.General,
        targetLanguage: '',
        ocrTranslateAutoReplace: true,
        ocrTranslateKeepLayout: false,
        colorPickerColorFormatIndex: 0,
        prevImageFormat: ImageFormat.PNG,
        prevSelectRect: {
            min_x: 0,
            min_y: 0,
            max_x: 0,
            max_y: 0,
        },
        enableMicrophone: false,
        enableLockDrawTool: false,
        disableArrowPicker: true,
    },
    [AppSettingsGroup.DrawToolbarKeyEvent]: defaultDrawToolbarKeyEventSettings,
    [AppSettingsGroup.KeyEvent]: defaultKeyEventSettings,
    [AppSettingsGroup.AppFunction]: defaultAppFunctionConfigs,
    [AppSettingsGroup.Render]: {
        antialias: true,
    },
    [AppSettingsGroup.SystemCommon]: {
        autoStart: true,
        autoCheckVersion: true,
    },
    [AppSettingsGroup.SystemChat]: {
        maxTokens: 4096,
        temperature: 1,
        thinkingBudgetTokens: 4096,
    },
    [AppSettingsGroup.SystemNetwork]: {
        enableProxy: false,
    },
    [AppSettingsGroup.FunctionChat]: {
        autoCreateNewSession: true,
        chatApiConfigList: [],
    },
    [AppSettingsGroup.FunctionTranslation]: {
        chatPrompt: defaultTranslationPrompt,
        translationApiConfigList: [],
    },
    [AppSettingsGroup.FunctionScreenshot]: {
        findChildrenElements: true,
        shortcutCanleTip: true,
        autoSaveOnCopy: false,
        focusedWindowCopyToClipboard: true,
        fastSave: false,
        saveFileDirectory: '',
        saveFileFormat: ImageFormat.PNG,
        ocrAfterAction: OcrDetectAfterAction.None,
        ocrCopyText: false,
        lockDrawTool: true,
    },
    [AppSettingsGroup.SystemScrollScreenshot]: {
        tryRollback: true,
        imageFeatureThreshold: 24,
        minSide: 128,
        maxSide: 128,
        sampleRate: 1,
        imageFeatureDescriptionLength: 28,
    },
    [AppSettingsGroup.FunctionFixedContent]: {
        zoomWithMouse: true,
        autoOcr: true,
        initialPosition: AppSettingsFixedContentInitialPosition.MousePosition,
    },
    [AppSettingsGroup.FunctionOutput]: {
        manualSaveFileNameFormat: `SnowShot_{YYYY-MM-DD_HH-mm-ss}`,
        autoSaveFileNameFormat: `SnowShot_{YYYY-MM-DD_HH-mm-ss}`,
        fastSaveFileNameFormat: `SnowShot_{YYYY-MM-DD_HH-mm-ss}`,
        focusedWindowFileNameFormat: `SnowShot_{YYYY-MM-DD_HH-mm-ss}`,
        videoRecordFileNameFormat: `SnowShot_Video_{YYYY-MM-DD_HH-mm-ss}`,
    },
    [AppSettingsGroup.FunctionFullScreenDraw]: {
        defaultTool: DrawState.Select,
    },
    [AppSettingsGroup.FunctionVideoRecord]: {
        saveDirectory: '',
        frameRate: 24,
        microphoneDeviceName: '',
        hwaccel: true,
        encoder: 'libx264',
        encoderPreset: 'ultrafast',
        videoMaxSize: VideoMaxSize.P1080,
    },
    [AppSettingsGroup.SystemScreenshot]: {
        ocrModel: OcrModel.RapidOcrV4,
        ocrDetectAngle: false,
        historyValidDuration: HistoryValidDuration.Week,
    },
    [AppSettingsGroup.FunctionTrayIcon]: {
        iconClickAction: TrayIconClickAction.Screenshot,
    },
};

export type AppSettingsActionContextType = {
    updateAppSettings: (
        group: AppSettingsGroup,
        settings: Partial<AppSettingsData[typeof group]>,
        debounce: boolean,
        /** 是否保存到文件 */
        saveToFile: boolean,
        /** 是否同步到所有窗口 */
        syncAllWindow: boolean,
        /** 是否忽略状态更新 */
        ignoreState?: boolean,
        /** 是否忽略 publisher 更新 */
        ignorePublisher?: boolean,
    ) => void;
    reloadAppSettings: () => void;
};

export const AppSettingsActionContext = createContext<AppSettingsActionContextType>({
    updateAppSettings: () => {},
    reloadAppSettings: () => {},
});
export const AppSettingsPublisher = createPublisher<AppSettingsData>(defaultAppSettingsData);

export const AppSettingsLoadingPublisher = createPublisher<boolean>(true);

export type ScreenshotContextType = {
    imageBuffer: ImageBuffer | undefined;
    setImageBuffer: (imageBuffer: ImageBuffer | undefined) => void;
};

const configDir = 'configs';
export const getConfigDirPath = async () => {
    return joinPath(await appConfigDir(), configDir);
};
export const clearAllConfig = async () => {
    await remove(configDir, { recursive: true, baseDir: BaseDirectory.AppConfig });
};
const getFileName = (group: AppSettingsGroup) => {
    return `${configDir}/${group}.json`;
};

export type AppContextType = {
    appWindowRef: RefObject<AppWindow | undefined>;
};

export const AppContext = createContext<AppContextType>({
    appWindowRef: { current: undefined },
});

const ContextWrapCore: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const appWindowRef = useRef<AppWindow>(undefined);
    useEffect(() => {
        appWindowRef.current = getCurrentWindow();
    }, []);

    const [appSettings, _setAppSettings] = useState<AppSettingsData>(defaultAppSettingsData);
    const appSettingsRef = useRef<AppSettingsData>(defaultAppSettingsData);
    const [, setAppSettingsStatePublisher] = useStateSubscriber(
        AppSettingsPublisher,
        useCallback((settings: AppSettingsData) => {
            document.body.className = settings[AppSettingsGroup.Common].darkMode
                ? 'app-dark'
                : 'app-light';
        }, []),
    );
    const [, setAppSettingsLoadingPublisher] = useStateSubscriber(
        AppSettingsLoadingPublisher,
        undefined,
    );
    const setAppSettings = useCallback(
        (newSettings: AppSettingsData, ignoreState?: boolean, ignorePublisher?: boolean) => {
            appSettingsRef.current = newSettings;
            if (!ignorePublisher) {
                setAppSettingsStatePublisher(newSettings);
            }
            if (!ignoreState) {
                _setAppSettings(newSettings);
            }
        },
        [_setAppSettings, setAppSettingsStatePublisher],
    );

    const writeAppSettings = useCallback(
        async (
            group: AppSettingsGroup,
            data: AppSettingsData[typeof group],
            syncAllWindow: boolean,
        ) => {
            await writeTextFile(getFileName(group), JSON.stringify(data), {
                baseDir: BaseDirectory.AppConfig,
            });
            if (syncAllWindow) {
                emit('reload-app-settings');
            }
        },
        [],
    );
    const writeAppSettingsDebounce = useMemo(
        () =>
            debounce(
                (
                    group: AppSettingsGroup,
                    data: AppSettingsData[typeof group],
                    syncAllWindow: boolean,
                ) => {
                    writeAppSettings(group, data, syncAllWindow);
                },
                1000,
            ),
        [writeAppSettings],
    );

    const updateAppSettings = useCallback(
        (
            group: AppSettingsGroup,
            val: Partial<AppSettingsData[typeof group]> | string,
            debounce: boolean,
            /** 是否保存到文件 */
            saveToFile: boolean,
            /** 是否同步到所有窗口 */
            syncAllWindow: boolean,
            /** 是否忽略状态更新 */
            ignoreState?: boolean,
            /** 是否忽略 publisher 更新 */
            ignorePublisher?: boolean,
        ): AppSettingsData[typeof group] => {
            let newSettings: Partial<AppSettingsData[typeof group]>;
            if (typeof val === 'string') {
                try {
                    const parsedObj = JSON.parse(val);
                    newSettings =
                        typeof parsedObj === 'object' ? parsedObj : defaultAppSettingsData[group];
                } catch {
                    newSettings = defaultAppSettingsData[group];
                }
            } else {
                newSettings = val;
            }

            let settings: AppSettingsData[typeof group];

            if (group === AppSettingsGroup.Common) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;
                settings = {
                    darkMode:
                        typeof newSettings?.darkMode === 'boolean'
                            ? newSettings.darkMode
                            : (prevSettings?.darkMode ?? false),
                    language: (() => {
                        switch (newSettings?.language) {
                            case 'zh-Hans':
                                return AppSettingsLanguage.ZHHans;
                            case 'zh-Hant':
                                return AppSettingsLanguage.ZHHant;
                            case 'en':
                                return AppSettingsLanguage.EN;
                            default:
                                return prevSettings?.language ?? AppSettingsLanguage.EN;
                        }
                    })(),
                    browserLanguage:
                        typeof newSettings?.browserLanguage === 'string'
                            ? newSettings.browserLanguage
                            : (prevSettings?.browserLanguage ?? ''),
                };

                window.__APP_ACCEPT_LANGUAGE__ = settings.language.startsWith('en')
                    ? 'en-US'
                    : 'zh-CN';
            } else if (group === AppSettingsGroup.Cache) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                let prevSelectRect = newSettings?.prevSelectRect ??
                    prevSettings?.prevSelectRect ?? {
                        min_x: 0,
                        min_y: 0,
                        max_x: 0,
                        max_y: 0,
                    };
                prevSelectRect = {
                    min_x: typeof prevSelectRect.min_x === 'number' ? prevSelectRect.min_x : 0,
                    min_y: typeof prevSelectRect.min_y === 'number' ? prevSelectRect.min_y : 0,
                    max_x: typeof prevSelectRect.max_x === 'number' ? prevSelectRect.max_x : 0,
                    max_y: typeof prevSelectRect.max_y === 'number' ? prevSelectRect.max_y : 0,
                };

                settings = {
                    menuCollapsed:
                        typeof newSettings?.menuCollapsed === 'boolean'
                            ? newSettings.menuCollapsed
                            : (prevSettings?.menuCollapsed ?? false),
                    chatModel:
                        typeof newSettings?.chatModel === 'string'
                            ? newSettings.chatModel
                            : (prevSettings?.chatModel ?? 'deepseek-reasoner'),
                    translationType:
                        typeof newSettings?.translationType === 'number' ||
                        typeof newSettings?.translationType === 'string'
                            ? newSettings.translationType
                            : (prevSettings?.translationType ?? TranslationType.Youdao),
                    translationDomain:
                        typeof newSettings?.translationDomain === 'string'
                            ? newSettings.translationDomain
                            : (prevSettings?.translationDomain ?? TranslationDomain.General),
                    targetLanguage:
                        typeof newSettings?.targetLanguage === 'string'
                            ? newSettings.targetLanguage
                            : (prevSettings?.targetLanguage ?? ''),
                    ocrTranslateAutoReplace:
                        typeof newSettings?.ocrTranslateAutoReplace === 'boolean'
                            ? newSettings.ocrTranslateAutoReplace
                            : (prevSettings?.ocrTranslateAutoReplace ?? true),
                    ocrTranslateKeepLayout:
                        typeof newSettings?.ocrTranslateKeepLayout === 'boolean'
                            ? newSettings.ocrTranslateKeepLayout
                            : (prevSettings?.ocrTranslateKeepLayout ?? false),
                    colorPickerColorFormatIndex:
                        typeof newSettings?.colorPickerColorFormatIndex === 'number'
                            ? newSettings.colorPickerColorFormatIndex
                            : (prevSettings?.colorPickerColorFormatIndex ?? 0),
                    prevImageFormat:
                        typeof newSettings?.prevImageFormat === 'string'
                            ? newSettings.prevImageFormat
                            : (prevSettings?.prevImageFormat ?? ImageFormat.PNG),
                    prevSelectRect,
                    enableMicrophone:
                        typeof newSettings?.enableMicrophone === 'boolean'
                            ? newSettings.enableMicrophone
                            : (prevSettings?.enableMicrophone ?? false),
                    enableLockDrawTool:
                        typeof newSettings?.enableLockDrawTool === 'boolean'
                            ? newSettings.enableLockDrawTool
                            : (prevSettings?.enableLockDrawTool ?? false),
                    disableArrowPicker:
                        typeof newSettings?.disableArrowPicker === 'boolean'
                            ? newSettings.disableArrowPicker
                            : (prevSettings?.disableArrowPicker ?? true),
                };
            } else if (group === AppSettingsGroup.Screenshot) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                let controlNode = prevSettings?.controlNode ?? AppSettingsControlNode.Polyline;
                if (newSettings?.controlNode) {
                    if (newSettings.controlNode === AppSettingsControlNode.Circle) {
                        controlNode = AppSettingsControlNode.Circle;
                    } else if (newSettings.controlNode === AppSettingsControlNode.Polyline) {
                        controlNode = AppSettingsControlNode.Polyline;
                    }
                }

                settings = {
                    controlNode,
                    disableAnimation:
                        typeof newSettings?.disableAnimation === 'boolean'
                            ? newSettings.disableAnimation
                            : (prevSettings?.disableAnimation ?? false),
                    colorPickerShowMode:
                        typeof newSettings?.colorPickerShowMode === 'number'
                            ? newSettings.colorPickerShowMode
                            : (prevSettings?.colorPickerShowMode ??
                              defaultAppSettingsData[group].colorPickerShowMode),
                    beyondSelectRectElementOpacity:
                        typeof newSettings?.beyondSelectRectElementOpacity === 'number'
                            ? Math.min(Math.max(newSettings.beyondSelectRectElementOpacity, 0), 100)
                            : (prevSettings?.beyondSelectRectElementOpacity ??
                              defaultAppSettingsData[group].beyondSelectRectElementOpacity),
                    hotKeyTipOpacity:
                        typeof newSettings?.hotKeyTipOpacity === 'number'
                            ? Math.min(Math.max(newSettings.hotKeyTipOpacity, 0), 100)
                            : (prevSettings?.hotKeyTipOpacity ??
                              defaultAppSettingsData[group].hotKeyTipOpacity),
                    fullScreenAuxiliaryLineColor:
                        typeof newSettings?.fullScreenAuxiliaryLineColor === 'string'
                            ? newSettings.fullScreenAuxiliaryLineColor
                            : (prevSettings?.fullScreenAuxiliaryLineColor ?? '#00000000'),
                    monitorCenterAuxiliaryLineColor:
                        typeof newSettings?.monitorCenterAuxiliaryLineColor === 'string'
                            ? newSettings.monitorCenterAuxiliaryLineColor
                            : (prevSettings?.monitorCenterAuxiliaryLineColor ?? '#00000000'),
                    customToolbarToolList:
                        typeof newSettings?.customToolbarToolList === 'object'
                            ? newSettings.customToolbarToolList
                            : (prevSettings?.customToolbarToolList ??
                              defaultAppSettingsData[group].customToolbarToolList),
                };
            } else if (group === AppSettingsGroup.FixedContent) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    borderColor:
                        typeof newSettings?.borderColor === 'string'
                            ? newSettings.borderColor
                            : (prevSettings?.borderColor ??
                              defaultAppSettingsData[group].borderColor),
                };
            } else if (group === AppSettingsGroup.DrawToolbarKeyEvent) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                const settingsKeySet = new Set<string>();
                const settingKeys: DrawToolbarKeyEventKey[] = Object.keys(
                    defaultDrawToolbarKeyEventSettings,
                ) as DrawToolbarKeyEventKey[];
                settingKeys.forEach((key) => {
                    const keyEventSettings = newSettings as Record<
                        DrawToolbarKeyEventKey,
                        DrawToolbarKeyEventValue
                    >;

                    let keyEventSettingsKey =
                        typeof keyEventSettings[key]?.hotKey === 'string'
                            ? keyEventSettings[key].hotKey
                            : (prevSettings?.[key]?.hotKey ??
                              defaultDrawToolbarKeyEventSettings[key].hotKey);

                    // 格式化处理下
                    keyEventSettingsKey = keyEventSettingsKey
                        .split(',')
                        .map((item) => trim(item))
                        .filter((val) => {
                            if (settingsKeySet.has(val)) {
                                return false;
                            }

                            if (defaultDrawToolbarKeyEventSettings[key].unique) {
                                settingsKeySet.add(val);
                            }

                            return true;
                        })
                        .join(', ');

                    keyEventSettings[key] = {
                        hotKey: keyEventSettingsKey,
                    };
                });

                settings = {
                    ...defaultDrawToolbarKeyEventSettings,
                    ...newSettings,
                };
            } else if (group === AppSettingsGroup.KeyEvent) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                const settingsKeySet = new Set<string>();
                const settingKeys: KeyEventKey[] = Object.keys(
                    defaultKeyEventSettings,
                ) as KeyEventKey[];
                settingKeys.forEach((key) => {
                    const keyEventSettings = newSettings as Record<KeyEventKey, KeyEventValue>;

                    let keyEventSettingsKey =
                        typeof keyEventSettings[key]?.hotKey === 'string'
                            ? keyEventSettings[key].hotKey
                            : (prevSettings?.[key]?.hotKey ?? defaultKeyEventSettings[key].hotKey);

                    // 格式化处理下
                    keyEventSettingsKey = keyEventSettingsKey
                        .split(',')
                        .map((item) => trim(item))
                        .filter((val) => {
                            if (settingsKeySet.has(val)) {
                                return false;
                            }

                            if (defaultKeyEventSettings[key].unique) {
                                settingsKeySet.add(val);
                            }

                            return true;
                        })
                        .join(', ');

                    keyEventSettings[key] = {
                        hotKey: keyEventSettingsKey,
                        group: defaultKeyEventSettings[key].group,
                    };
                });

                settings = {
                    ...defaultDrawToolbarKeyEventSettings,
                    ...newSettings,
                };
            } else if (group === AppSettingsGroup.AppFunction) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                const settingsKeySet = new Set<string>();
                const settingKeys: AppFunction[] = Object.keys(
                    defaultAppFunctionConfigs,
                ) as AppFunction[];
                settingKeys.forEach((key) => {
                    const keyEventSettings = newSettings as Record<AppFunction, AppFunctionConfig>;

                    let keyEventSettingsKey =
                        typeof keyEventSettings[key]?.shortcutKey === 'string'
                            ? keyEventSettings[key].shortcutKey
                            : (prevSettings?.[key]?.shortcutKey ??
                              defaultAppFunctionConfigs[key].shortcutKey);

                    // 格式化处理下
                    keyEventSettingsKey = keyEventSettingsKey
                        .split(',')
                        .slice(0, 1) // 快捷键不支持多个键，这里也限制下
                        .map((item) => trim(item))
                        .filter((val) => {
                            if (settingsKeySet.has(val)) {
                                return false;
                            }

                            return true;
                        })
                        .join(', ');

                    settingsKeySet.add(keyEventSettingsKey);

                    keyEventSettings[key] = {
                        shortcutKey: keyEventSettingsKey,
                        group: defaultAppFunctionConfigs[key].group,
                    };
                });

                settings = {
                    ...defaultAppFunctionConfigs,
                    ...newSettings,
                };
            } else if (group === AppSettingsGroup.Render) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    antialias:
                        typeof newSettings?.antialias === 'boolean'
                            ? newSettings.antialias
                            : (prevSettings?.antialias ?? defaultAppSettingsData[group].antialias),
                };
            } else if (group === AppSettingsGroup.SystemCommon) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    autoStart:
                        typeof newSettings?.autoStart === 'boolean'
                            ? newSettings.autoStart
                            : (prevSettings?.autoStart ?? defaultAppSettingsData[group].autoStart),
                    autoCheckVersion:
                        typeof newSettings?.autoCheckVersion === 'boolean'
                            ? newSettings.autoCheckVersion
                            : (prevSettings?.autoCheckVersion ??
                              defaultAppSettingsData[group].autoCheckVersion),
                };

                if (process.env.NODE_ENV === 'development') {
                }

                if (saveToFile && process.env.NODE_ENV !== 'development') {
                    (async () => {
                        // 每次启动都重新注册一下
                        await appAutostart.enable();
                        if (settings.autoStart) {
                            // await appAutostart.enable();
                        } else {
                            await appAutostart.disable();
                        }
                    })();
                }
            } else if (group === AppSettingsGroup.SystemChat) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    maxTokens:
                        typeof newSettings?.maxTokens === 'number'
                            ? Math.min(Math.max(newSettings.maxTokens, 512), 8192)
                            : (prevSettings?.maxTokens ?? defaultAppSettingsData[group].maxTokens),
                    temperature:
                        typeof newSettings?.temperature === 'number'
                            ? Math.min(Math.max(newSettings.temperature, 0), 2)
                            : (prevSettings?.temperature ??
                              defaultAppSettingsData[group].temperature),
                    thinkingBudgetTokens:
                        typeof newSettings?.thinkingBudgetTokens === 'number'
                            ? Math.min(Math.max(newSettings.thinkingBudgetTokens, 1024), 8192)
                            : (prevSettings?.thinkingBudgetTokens ??
                              defaultAppSettingsData[group].thinkingBudgetTokens),
                };
            } else if (group === AppSettingsGroup.SystemNetwork) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    enableProxy:
                        typeof newSettings?.enableProxy === 'boolean'
                            ? newSettings.enableProxy
                            : (prevSettings?.enableProxy ??
                              defaultAppSettingsData[group].enableProxy),
                };

                if (saveToFile) {
                    setEnableProxy(settings.enableProxy);
                }
            } else if (group === AppSettingsGroup.FunctionChat) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    autoCreateNewSession:
                        typeof newSettings?.autoCreateNewSession === 'boolean'
                            ? newSettings.autoCreateNewSession
                            : (prevSettings?.autoCreateNewSession ??
                              defaultAppSettingsData[group].autoCreateNewSession),
                    chatApiConfigList: Array.isArray(newSettings?.chatApiConfigList)
                        ? newSettings.chatApiConfigList.map((item) => ({
                              api_uri: `${item.api_uri ?? ''}`,
                              api_key: `${item.api_key ?? ''}`,
                              api_model: `${item.api_model ?? ''}`,
                              model_name: `${item.model_name ?? ''}`,
                              support_thinking: !!item.support_thinking,
                          }))
                        : (prevSettings?.chatApiConfigList ??
                          defaultAppSettingsData[group].chatApiConfigList),
                };
            } else if (group === AppSettingsGroup.FunctionTranslation) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    chatPrompt:
                        typeof newSettings?.chatPrompt === 'string'
                            ? newSettings.chatPrompt
                            : (prevSettings?.chatPrompt ?? ''),
                    translationApiConfigList: Array.isArray(newSettings?.translationApiConfigList)
                        ? newSettings.translationApiConfigList.map((item) => ({
                              api_uri: `${item.api_uri ?? ''}`,
                              api_key: `${item.api_key ?? ''}`,
                              api_type: item.api_type,
                              deepl_prefer_quality_optimized:
                                  typeof item.deepl_prefer_quality_optimized === 'boolean'
                                      ? item.deepl_prefer_quality_optimized
                                      : false,
                          }))
                        : (prevSettings?.translationApiConfigList ??
                          defaultAppSettingsData[group].translationApiConfigList),
                };
            } else if (group === AppSettingsGroup.FunctionScreenshot) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                const findChildrenElements =
                    typeof newSettings?.findChildrenElements === 'boolean'
                        ? newSettings.findChildrenElements
                        : (prevSettings?.findChildrenElements ??
                          defaultAppSettingsData[group].findChildrenElements);

                settings = {
                    findChildrenElements,
                    shortcutCanleTip:
                        typeof newSettings?.shortcutCanleTip === 'boolean'
                            ? newSettings.shortcutCanleTip
                            : (prevSettings?.shortcutCanleTip ??
                              defaultAppSettingsData[group].shortcutCanleTip),
                    autoSaveOnCopy:
                        typeof newSettings?.autoSaveOnCopy === 'boolean'
                            ? newSettings.autoSaveOnCopy
                            : (prevSettings?.autoSaveOnCopy ?? false),
                    fastSave:
                        typeof newSettings?.fastSave === 'boolean'
                            ? newSettings.fastSave
                            : (prevSettings?.fastSave ?? false),
                    saveFileDirectory:
                        typeof newSettings?.saveFileDirectory === 'string'
                            ? newSettings.saveFileDirectory
                            : (prevSettings?.saveFileDirectory ?? ''),
                    saveFileFormat:
                        typeof newSettings?.saveFileFormat === 'string'
                            ? newSettings.saveFileFormat
                            : (prevSettings?.saveFileFormat ?? ImageFormat.PNG),
                    ocrAfterAction:
                        typeof newSettings?.ocrAfterAction === 'string'
                            ? (newSettings.ocrAfterAction as OcrDetectAfterAction)
                            : (prevSettings?.ocrAfterAction ?? OcrDetectAfterAction.None),
                    ocrCopyText:
                        typeof newSettings?.ocrCopyText === 'boolean'
                            ? newSettings.ocrCopyText
                            : (prevSettings?.ocrCopyText ?? false),
                    lockDrawTool:
                        typeof newSettings?.lockDrawTool === 'boolean'
                            ? newSettings.lockDrawTool
                            : (prevSettings?.lockDrawTool ?? true),
                    focusedWindowCopyToClipboard:
                        typeof newSettings?.focusedWindowCopyToClipboard === 'boolean'
                            ? newSettings.focusedWindowCopyToClipboard
                            : (prevSettings?.focusedWindowCopyToClipboard ?? true),
                };
            } else if (group === AppSettingsGroup.FunctionOutput) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    manualSaveFileNameFormat:
                        typeof newSettings?.manualSaveFileNameFormat === 'string'
                            ? newSettings.manualSaveFileNameFormat
                            : (prevSettings?.manualSaveFileNameFormat ??
                              defaultAppSettingsData[group].manualSaveFileNameFormat),
                    autoSaveFileNameFormat:
                        typeof newSettings?.autoSaveFileNameFormat === 'string'
                            ? newSettings.autoSaveFileNameFormat
                            : (prevSettings?.autoSaveFileNameFormat ??
                              defaultAppSettingsData[group].autoSaveFileNameFormat),
                    fastSaveFileNameFormat:
                        typeof newSettings?.fastSaveFileNameFormat === 'string'
                            ? newSettings.fastSaveFileNameFormat
                            : (prevSettings?.fastSaveFileNameFormat ??
                              defaultAppSettingsData[group].fastSaveFileNameFormat),
                    focusedWindowFileNameFormat:
                        typeof newSettings?.focusedWindowFileNameFormat === 'string'
                            ? newSettings.focusedWindowFileNameFormat
                            : (prevSettings?.focusedWindowFileNameFormat ??
                              defaultAppSettingsData[group].focusedWindowFileNameFormat),
                    videoRecordFileNameFormat:
                        typeof newSettings?.videoRecordFileNameFormat === 'string'
                            ? newSettings.videoRecordFileNameFormat
                            : (prevSettings?.videoRecordFileNameFormat ??
                              defaultAppSettingsData[group].videoRecordFileNameFormat),
                };
            } else if (group === AppSettingsGroup.FunctionFullScreenDraw) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    defaultTool:
                        typeof newSettings?.defaultTool === 'number'
                            ? newSettings.defaultTool
                            : (prevSettings?.defaultTool ?? DrawState.Select),
                };
            } else if (group === AppSettingsGroup.SystemScrollScreenshot) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    imageFeatureThreshold:
                        typeof newSettings?.imageFeatureThreshold === 'number'
                            ? Math.min(Math.max(newSettings.imageFeatureThreshold, 0), 255)
                            : (prevSettings?.imageFeatureThreshold ??
                              defaultAppSettingsData[group].imageFeatureThreshold),
                    minSide:
                        typeof newSettings?.minSide === 'number'
                            ? Math.min(Math.max(newSettings.minSide, 0), 1024)
                            : (prevSettings?.minSide ?? defaultAppSettingsData[group].minSide),
                    maxSide:
                        typeof newSettings?.maxSide === 'number'
                            ? Math.min(Math.max(newSettings.maxSide, 64), 1024)
                            : (prevSettings?.maxSide ?? defaultAppSettingsData[group].maxSide),
                    sampleRate:
                        typeof newSettings?.sampleRate === 'number'
                            ? Math.min(Math.max(newSettings.sampleRate, 0.1), 1)
                            : (prevSettings?.sampleRate ??
                              defaultAppSettingsData[group].sampleRate),
                    imageFeatureDescriptionLength:
                        typeof newSettings?.imageFeatureDescriptionLength === 'number'
                            ? Math.min(Math.max(newSettings.imageFeatureDescriptionLength, 8), 128)
                            : (prevSettings?.imageFeatureDescriptionLength ??
                              defaultAppSettingsData[group].imageFeatureDescriptionLength),
                    tryRollback:
                        typeof newSettings?.tryRollback === 'boolean'
                            ? newSettings.tryRollback
                            : (prevSettings?.tryRollback ??
                              defaultAppSettingsData[group].tryRollback),
                };
            } else if (group === AppSettingsGroup.FunctionTrayIcon) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    iconClickAction:
                        typeof newSettings?.iconClickAction === 'string'
                            ? (newSettings.iconClickAction as TrayIconClickAction)
                            : (prevSettings?.iconClickAction ??
                              defaultAppSettingsData[group].iconClickAction),
                };
            } else if (group === AppSettingsGroup.CommonTrayIcon) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    iconPath:
                        typeof newSettings?.iconPath === 'string'
                            ? newSettings.iconPath
                            : (prevSettings?.iconPath ?? ''),
                    defaultIcons:
                        typeof newSettings?.defaultIcons === 'string'
                            ? (newSettings.defaultIcons as TrayIconDefaultIcon)
                            : (prevSettings?.defaultIcons ??
                              defaultAppSettingsData[group].defaultIcons),
                };
            } else if (group === AppSettingsGroup.FunctionVideoRecord) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    saveDirectory:
                        typeof newSettings?.saveDirectory === 'string'
                            ? newSettings.saveDirectory
                            : (prevSettings?.saveDirectory ?? ''),
                    frameRate:
                        typeof newSettings?.frameRate === 'number'
                            ? Math.min(Math.max(newSettings.frameRate, 1), 120)
                            : (prevSettings?.frameRate ?? defaultAppSettingsData[group].frameRate),
                    microphoneDeviceName:
                        typeof newSettings?.microphoneDeviceName === 'string'
                            ? newSettings.microphoneDeviceName
                            : (prevSettings?.microphoneDeviceName ?? ''),
                    hwaccel:
                        typeof newSettings?.hwaccel === 'boolean'
                            ? newSettings.hwaccel
                            : (prevSettings?.hwaccel ?? defaultAppSettingsData[group].hwaccel),
                    encoder:
                        typeof newSettings?.encoder === 'string'
                            ? newSettings.encoder
                            : (prevSettings?.encoder ?? defaultAppSettingsData[group].encoder),
                    encoderPreset:
                        typeof newSettings?.encoderPreset === 'string'
                            ? newSettings.encoderPreset
                            : (prevSettings?.encoderPreset ??
                              defaultAppSettingsData[group].encoderPreset),
                    videoMaxSize:
                        typeof newSettings?.videoMaxSize === 'string'
                            ? (newSettings.videoMaxSize as VideoMaxSize)
                            : (prevSettings?.videoMaxSize ??
                              defaultAppSettingsData[group].videoMaxSize),
                };
            } else if (group === AppSettingsGroup.FunctionFixedContent) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    zoomWithMouse:
                        typeof newSettings?.zoomWithMouse === 'boolean'
                            ? newSettings.zoomWithMouse
                            : (prevSettings?.zoomWithMouse ?? false),
                    autoOcr:
                        typeof newSettings?.autoOcr === 'boolean'
                            ? newSettings.autoOcr
                            : (prevSettings?.autoOcr ?? defaultAppSettingsData[group].autoOcr),
                    initialPosition:
                        typeof newSettings?.initialPosition === 'string'
                            ? (newSettings.initialPosition as AppSettingsFixedContentInitialPosition)
                            : (prevSettings?.initialPosition ??
                              defaultAppSettingsData[group].initialPosition),
                };
            } else if (group === AppSettingsGroup.SystemScreenshot) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    ocrModel:
                        typeof newSettings?.ocrModel === 'string'
                            ? (newSettings.ocrModel as OcrModel)
                            : (prevSettings?.ocrModel ?? defaultAppSettingsData[group].ocrModel),
                    ocrDetectAngle:
                        typeof newSettings?.ocrDetectAngle === 'boolean'
                            ? newSettings.ocrDetectAngle
                            : (prevSettings?.ocrDetectAngle ??
                              defaultAppSettingsData[group].ocrDetectAngle),
                    historyValidDuration:
                        typeof newSettings?.historyValidDuration === 'number'
                            ? (newSettings.historyValidDuration as HistoryValidDuration)
                            : (prevSettings?.historyValidDuration ??
                              defaultAppSettingsData[group].historyValidDuration),
                };
            } else {
                return defaultAppSettingsData[group];
            }

            setAppSettings(
                {
                    ...appSettingsRef.current,
                    [group]: settings,
                },
                ignoreState,
                ignorePublisher,
            );

            if (saveToFile) {
                if (debounce) {
                    writeAppSettingsDebounce(group, settings, syncAllWindow);
                } else {
                    writeAppSettings(group, settings, syncAllWindow);
                }
            }

            return settings;
        },
        [writeAppSettings, writeAppSettingsDebounce, setAppSettings],
    );

    const reloadAppSettings = useCallback(async () => {
        setAppSettingsLoadingPublisher(true);

        const groups = Object.keys(defaultAppSettingsData).filter(
            (group) => group in defaultAppSettingsData,
        );

        const settings: AppSettingsData = {} as AppSettingsData;

        // 启动时验证下目录是否存在
        const isDirExists = await exists(configDir, {
            baseDir: BaseDirectory.AppConfig,
        });
        if (!isDirExists) {
            await mkdir(configDir, {
                baseDir: BaseDirectory.AppConfig,
                recursive: true,
            });
        }

        await Promise.all(
            (groups as AppSettingsGroup[]).map(async (group) => {
                let fileContent = '';
                try {
                    // 创建文件夹成功的话，文件不存在，则不读取
                    fileContent = await readTextFile(getFileName(group), {
                        baseDir: BaseDirectory.AppConfig,
                    });
                } catch (error) {
                    appWarn(
                        `[reloadAppSettings] read file ${getFileName(group)} failed: ${JSON.stringify(error)}`,
                    );
                }

                const saveToFile = appWindowRef.current?.label === 'main';

                if (!fileContent) {
                    settings[group] = updateAppSettings(
                        group,
                        defaultAppSettingsData[group],
                        false,
                        saveToFile,
                        false,
                        true,
                        true,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ) as any;
                    return Promise.resolve();
                }

                settings[group] = updateAppSettings(
                    group,
                    fileContent,
                    false,
                    saveToFile,
                    false,
                    true,
                    true,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ) as any;
            }),
        );

        if (isEqual(appSettingsRef.current, settings)) {
            setAppSettings(settings);
        }

        setAppSettingsLoadingPublisher(false);
    }, [setAppSettingsLoadingPublisher, updateAppSettings, setAppSettings]);

    const initLoading = useRef(false);
    useEffect(() => {
        if (initLoading.current) {
            return;
        }

        initLoading.current = true;
        reloadAppSettings().finally(() => {
            initLoading.current = false;
        });
    }, [reloadAppSettings]);

    const [, antdLocale] = useMemo(() => {
        const language = appSettings[AppSettingsGroup.Common].language;
        switch (language) {
            case AppSettingsLanguage.ZHHans:
                return ['zh-CN', zhCN];
            case AppSettingsLanguage.ZHHant:
                return ['zh-TW', zhTW];
            default:
                return ['en-US', enUS];
        }
    }, [appSettings]);

    const appSettingsContextValue = useMemo(() => {
        return {
            ...appSettings,
            updateAppSettings,
            reloadAppSettings,
        };
    }, [appSettings, updateAppSettings, reloadAppSettings]);

    const appContextValue = useMemo(() => {
        return {
            appWindowRef,
        };
    }, [appWindowRef]);

    useEffect(() => {
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            tauriLog.error(
                `[${location.href}] ${typeof event.reason === 'string' ? event.reason : JSON.stringify(event.reason)} ${JSON.stringify(event)}`,
            );
        };

        const handleGlobalError = (event: ErrorEvent) => {
            tauriLog.error(
                `[${location.href}] ${typeof event.error === 'string' ? event.error : JSON.stringify(event.error)} ${JSON.stringify(event)}`,
            );
        };

        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        window.addEventListener('error', handleGlobalError);

        return () => {
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
            window.removeEventListener('error', handleGlobalError);
        };
    }, []);

    return (
        <AppSettingsActionContext.Provider value={appSettingsContextValue}>
            <ConfigProvider
                theme={{
                    algorithm: appSettings[AppSettingsGroup.Common].darkMode
                        ? theme.darkAlgorithm
                        : theme.defaultAlgorithm,
                }}
                locale={antdLocale}
            >
                <IntlProvider
                    locale={appSettings[AppSettingsGroup.Common].language}
                    messages={messages[appSettings[AppSettingsGroup.Common].language]}
                    defaultLocale={AppSettingsLanguage.ZHHans}
                >
                    <AppContext.Provider value={appContextValue}>{children}</AppContext.Provider>
                </IntlProvider>
            </ConfigProvider>
        </AppSettingsActionContext.Provider>
    );
};

export const ContextWrap = React.memo(
    withStatePublisher(
        withStatePublisher(ContextWrapCore, AppSettingsPublisher),
        AppSettingsLoadingPublisher,
    ),
);
