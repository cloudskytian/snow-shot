'use client';

import { GroupTitle } from '@/components/groupTitle';
import {
    Alert,
    Col,
    Divider,
    Flex,
    Form,
    Row,
    Select,
    Spin,
    Switch,
    theme,
    Typography,
} from 'antd';
import { AppSettingsActionContext, AppSettingsData, AppSettingsGroup } from '../../contextWrap';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useAppSettingsLoad } from '@/hooks/useAppSettingsLoad';
import { FormattedMessage, useIntl } from 'react-intl';
import { ContentWrap } from '@/components/contentWrap';
import { IconLabel } from '@/components/iconLable';
import { ResetSettingsButton } from '@/components/resetSettingsButton';
import ProForm, {
    ProFormDependency,
    ProFormList,
    ProFormSelect,
    ProFormSwitch,
    ProFormText,
    ProFormTextArea,
} from '@ant-design/pro-form';
import {
    SOURCE_LANGUAGE_ENV_VARIABLE,
    TARGET_LANGUAGE_ENV_VARIABLE,
    TRANSLATION_DOMAIN_ENV_VARIABLE,
} from '@/app/tools/translation/extra';
import { DirectoryInput } from '@/components/directoryInput';
import { generateImageFileName, ImageFormat } from '@/utils/file';
import { TranslationApiType } from './extra';
import { TestChat } from './components/testChat';
import { DrawState } from '@/app/fullScreenDraw/components/drawCore/extra';
import { videoRecordGetMicrophoneDeviceNames } from '@/commands/videoRecord';
import { getVideoRecordSaveDirectory } from '@/app/videoRecord/extra';
import { OcrDetectAfterAction } from '@/app/fixedContent/components/ocrResult';

export default function SystemSettings() {
    const intl = useIntl();
    const { token } = theme.useToken();

    const { updateAppSettings } = useContext(AppSettingsActionContext);
    const [functionForm] = Form.useForm<AppSettingsData[AppSettingsGroup.FunctionChat]>();
    const [translationForm] = Form.useForm<AppSettingsData[AppSettingsGroup.FunctionTranslation]>();
    const [screenshotForm] = Form.useForm<AppSettingsData[AppSettingsGroup.FunctionScreenshot]>();
    const [outputForm] = Form.useForm<AppSettingsData[AppSettingsGroup.FunctionOutput]>();
    const [fullScreenDrawForm] =
        Form.useForm<AppSettingsData[AppSettingsGroup.FunctionFullScreenDraw]>();
    const [fixedContentForm] =
        Form.useForm<AppSettingsData[AppSettingsGroup.FunctionFixedContent]>();
    const [videoRecordForm] = Form.useForm<AppSettingsData[AppSettingsGroup.FunctionVideoRecord]>();

    const [appSettingsLoading, setAppSettingsLoading] = useState(true);
    useAppSettingsLoad(
        useCallback(
            (settings: AppSettingsData, preSettings?: AppSettingsData) => {
                setAppSettingsLoading(false);

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.FunctionTranslation] !==
                        settings[AppSettingsGroup.FunctionTranslation]
                ) {
                    translationForm.setFieldsValue(settings[AppSettingsGroup.FunctionTranslation]);
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.FunctionChat] !==
                        settings[AppSettingsGroup.FunctionChat]
                ) {
                    functionForm.setFieldsValue(settings[AppSettingsGroup.FunctionChat]);
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.FunctionScreenshot] !==
                        settings[AppSettingsGroup.FunctionScreenshot]
                ) {
                    screenshotForm.setFieldsValue(settings[AppSettingsGroup.FunctionScreenshot]);
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.FunctionOutput] !==
                        settings[AppSettingsGroup.FunctionOutput]
                ) {
                    outputForm.setFieldsValue(settings[AppSettingsGroup.FunctionOutput]);
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.FunctionFixedContent] !==
                        settings[AppSettingsGroup.FunctionFixedContent]
                ) {
                    fixedContentForm.setFieldsValue(
                        settings[AppSettingsGroup.FunctionFixedContent],
                    );
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.FunctionFullScreenDraw] !==
                        settings[AppSettingsGroup.FunctionFullScreenDraw]
                ) {
                    fullScreenDrawForm.setFieldsValue(
                        settings[AppSettingsGroup.FunctionFullScreenDraw],
                    );
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.FunctionVideoRecord] !==
                        settings[AppSettingsGroup.FunctionVideoRecord]
                ) {
                    const videoRecordSettings = settings[AppSettingsGroup.FunctionVideoRecord];
                    videoRecordForm.setFieldsValue(settings[AppSettingsGroup.FunctionVideoRecord]);
                    if (!videoRecordSettings.saveDirectory) {
                        getVideoRecordSaveDirectory(settings).then((saveDirectory) => {
                            videoRecordSettings.saveDirectory = saveDirectory;
                            videoRecordForm.setFieldsValue(videoRecordSettings);
                        });
                    }
                }
            },
            [
                translationForm,
                functionForm,
                screenshotForm,
                outputForm,
                fixedContentForm,
                fullScreenDrawForm,
                videoRecordForm,
            ],
        ),
        true,
    );

    const [microphoneDeviceNameOptions, setMicrophoneDeviceNameOptions] = useState<
        { label: string; value: string }[]
    >([]);
    useEffect(() => {
        const options: { label: string; value: string }[] = [
            {
                label: intl.formatMessage({
                    id: 'settings.functionSettings.videoRecordSettings.microphoneDeviceName.default',
                }),
                value: '',
            },
        ];

        videoRecordGetMicrophoneDeviceNames()
            .then((microphoneDeviceNames) => {
                for (const microphoneDeviceName of microphoneDeviceNames) {
                    options.push({
                        label: microphoneDeviceName,
                        value: microphoneDeviceName,
                    });
                }
            })
            .finally(() => {
                setMicrophoneDeviceNameOptions(options);
            });
    }, [intl]);

    return (
        <ContentWrap>
            <GroupTitle
                id="screenshotSettings"
                extra={
                    <ResetSettingsButton
                        title={
                            <FormattedMessage id="settings.functionSettings.screenshotSettings" />
                        }
                        appSettingsGroup={AppSettingsGroup.FunctionScreenshot}
                    />
                }
            >
                <FormattedMessage id="settings.functionSettings.screenshotSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={screenshotForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.FunctionScreenshot,
                            values,
                            true,
                            true,
                            true,
                            true,
                            false,
                        );
                    }}
                    submitter={false}
                    layout="horizontal"
                >
                    <Row gutter={token.padding}>
                        <Col span={12}>
                            <ProFormSwitch
                                name="findChildrenElements"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.screenshotSettings.findChildrenElements" />
                                }
                            />
                        </Col>

                        <Col span={12}>
                            <ProFormSwitch
                                label={
                                    <FormattedMessage id="settings.functionSettings.screenshotSettings.shortcutCanleTip" />
                                }
                                name="shortcutCanleTip"
                                layout="horizontal"
                            />
                        </Col>

                        <Col span={12}>
                            <ProFormSwitch
                                label={
                                    <FormattedMessage id="settings.functionSettings.screenshotSettings.lockDrawTool" />
                                }
                                name="lockDrawTool"
                                layout="horizontal"
                            />
                        </Col>
                    </Row>

                    <Row gutter={token.padding}>
                        <Col span={12}>
                            <ProFormSelect
                                name="ocrAfterAction"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.screenshotSettings.ocrAfterAction" />
                                }
                                options={[
                                    {
                                        label: (
                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.ocrAfterAction.none" />
                                        ),
                                        value: OcrDetectAfterAction.None,
                                    },
                                    {
                                        label: (
                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.ocrAfterAction.copyText" />
                                        ),
                                        value: OcrDetectAfterAction.CopyText,
                                    },
                                    {
                                        label: (
                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.ocrAfterAction.copyTextAndCloseWindow" />
                                        ),
                                        value: OcrDetectAfterAction.CopyTextAndCloseWindow,
                                    },
                                ]}
                            />
                        </Col>

                        <Col span={12}>
                            <ProFormSwitch
                                name="ocrCopyText"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.screenshotSettings.ocrCopyText" />
                                }
                            />
                        </Col>

                        <Col span={12}>
                            <ProFormSwitch
                                label={
                                    <FormattedMessage id="settings.functionSettings.screenshotSettings.autoOcrAfterFixed" />
                                }
                                name="autoOcrAfterFixed"
                                layout="horizontal"
                            />
                        </Col>
                    </Row>

                    <Row gutter={token.padding}>
                        <Col span={24}>
                            <ProFormSwitch
                                name="enhanceSaveFile"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.screenshotSettings.autoSaveFileMode" />
                                }
                            />
                        </Col>

                        <ProFormDependency<{ enhanceSaveFile: boolean }> name={['enhanceSaveFile']}>
                            {({ enhanceSaveFile }) => {
                                return (
                                    <>
                                        <Col span={12}>
                                            <ProFormSwitch
                                                name="autoSaveOnCopy"
                                                layout="horizontal"
                                                label={
                                                    <FormattedMessage id="settings.functionSettings.screenshotSettings.autoSaveFileMode.autoSave" />
                                                }
                                                disabled={!enhanceSaveFile}
                                            />
                                        </Col>
                                        <Col span={12}>
                                            <ProFormSwitch
                                                name="fastSave"
                                                layout="horizontal"
                                                label={
                                                    <IconLabel
                                                        label={
                                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.autoSaveFileMode.fastSave" />
                                                        }
                                                        tooltipTitle={
                                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.autoSaveFileMode.fastSave.tip" />
                                                        }
                                                    />
                                                }
                                                disabled={!enhanceSaveFile}
                                            />
                                        </Col>

                                        <Col span={12}>
                                            <ProForm.Item
                                                name="saveFileDirectory"
                                                label={
                                                    <IconLabel
                                                        label={
                                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.autoSaveFileMode.directory" />
                                                        }
                                                    />
                                                }
                                                required={false}
                                            >
                                                <DirectoryInput disabled={!enhanceSaveFile} />
                                            </ProForm.Item>
                                        </Col>

                                        <Col span={12}>
                                            <ProForm.Item
                                                name="saveFileFormat"
                                                label={
                                                    <FormattedMessage id="settings.functionSettings.screenshotSettings.autoSaveFileMode.saveFileFormat" />
                                                }
                                            >
                                                <Select
                                                    options={[
                                                        {
                                                            label: 'PNG(*.png)',
                                                            value: ImageFormat.PNG,
                                                        },
                                                        {
                                                            label: 'JPEG(*.jpg)',
                                                            value: ImageFormat.JPEG,
                                                        },
                                                        {
                                                            label: 'WEBP(*.webp)',
                                                            value: ImageFormat.WEBP,
                                                        },
                                                        {
                                                            label: 'AVIF(*.avif)',
                                                            value: ImageFormat.AVIF,
                                                        },
                                                        {
                                                            label: 'JPEG XL(*.jxl)',
                                                            value: ImageFormat.JPEG_XL,
                                                        },
                                                    ]}
                                                    disabled={!enhanceSaveFile}
                                                />
                                            </ProForm.Item>
                                        </Col>
                                    </>
                                );
                            }}
                        </ProFormDependency>
                    </Row>
                </ProForm>
            </Spin>

            <Divider />

            <GroupTitle
                id="fixedContentSettings"
                extra={
                    <ResetSettingsButton
                        title={
                            <FormattedMessage id="settings.functionSettings.fixedContentSettings" />
                        }
                        appSettingsGroup={AppSettingsGroup.FunctionFixedContent}
                    />
                }
            >
                <FormattedMessage id="settings.functionSettings.fixedContentSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={fixedContentForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.FunctionFixedContent,
                            values,
                            true,
                            true,
                            true,
                            true,
                            false,
                        );
                    }}
                    submitter={false}
                    layout="horizontal"
                >
                    <Row gutter={token.padding}>
                        <Col span={12}>
                            <ProFormSwitch
                                name="zoomWithMouse"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.fixedContentSettings.zoomWithMouse" />
                                }
                            />
                        </Col>
                    </Row>
                </ProForm>
            </Spin>

            <Divider />

            <GroupTitle
                id="translationSettings"
                extra={
                    <ResetSettingsButton
                        title={
                            <FormattedMessage id="settings.functionSettings.translationSettings" />
                        }
                        appSettingsGroup={AppSettingsGroup.FunctionTranslation}
                    />
                }
            >
                <FormattedMessage id="settings.functionSettings.translationSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={translationForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.FunctionTranslation,
                            values,
                            true,
                            true,
                            true,
                            true,
                            false,
                        );
                    }}
                    submitter={false}
                >
                    <ProFormList
                        name="translationApiConfigList"
                        label={
                            <IconLabel
                                label={
                                    <FormattedMessage id="settings.functionSettings.translationSettings.apiConfig" />
                                }
                            />
                        }
                        creatorButtonProps={{
                            creatorButtonText: intl.formatMessage({
                                id: 'settings.functionSettings.translationSettings.apiConfig.add',
                            }),
                        }}
                        className="api-config-list"
                        min={0}
                        itemRender={({ listDom, action }) => (
                            <Flex align="end" justify="space-between">
                                {listDom}

                                <div>{action}</div>
                            </Flex>
                        )}
                        creatorRecord={() => ({
                            api_uri: '',
                            api_key: '',
                            api_type: TranslationApiType.DeepL,
                        })}
                    >
                        <Row gutter={token.padding} style={{ width: '100%' }}>
                            <Col span={12}>
                                <ProFormSelect
                                    name="api_type"
                                    label={
                                        <IconLabel
                                            label={
                                                <FormattedMessage id="settings.functionSettings.translationSettings.apiConfig.apiType" />
                                            }
                                        />
                                    }
                                    allowClear={false}
                                    options={[
                                        {
                                            label: (
                                                <FormattedMessage id="settings.functionSettings.translationSettings.apiConfig.apiType.deepL" />
                                            ),
                                            value: TranslationApiType.DeepL,
                                        },
                                    ]}
                                />
                            </Col>
                            <Col span={12}>
                                <ProFormText
                                    name="api_uri"
                                    label={
                                        <IconLabel
                                            label={
                                                <FormattedMessage id="settings.functionSettings.translationSettings.apiConfig.apiUri" />
                                            }
                                            tooltipTitle={
                                                <FormattedMessage id="settings.functionSettings.translationSettings.apiConfig.apiUri.tip" />
                                            }
                                        />
                                    }
                                    rules={[
                                        {
                                            required: true,
                                            message: intl.formatMessage({
                                                id: 'settings.functionSettings.translationSettings.apiConfig.apiUri.required',
                                            }),
                                        },
                                    ]}
                                />
                            </Col>
                            <Col span={12}>
                                <ProFormText.Password
                                    name="api_key"
                                    label={
                                        <IconLabel
                                            label={
                                                <FormattedMessage id="settings.functionSettings.translationSettings.apiConfig.apiKey" />
                                            }
                                            tooltipTitle={
                                                <FormattedMessage id="settings.functionSettings.translationSettings.apiConfig.apiKey.tip" />
                                            }
                                        />
                                    }
                                    rules={[
                                        {
                                            required: true,
                                            message: intl.formatMessage({
                                                id: 'settings.functionSettings.translationSettings.apiConfig.apiKey.required',
                                            }),
                                        },
                                    ]}
                                />
                            </Col>

                            <ProFormDependency<{ api_type: TranslationApiType }>
                                name={['api_type']}
                            >
                                {({ api_type }) => {
                                    if (api_type === TranslationApiType.DeepL) {
                                        return (
                                            <>
                                                <Col span={12}>
                                                    <ProFormSwitch
                                                        name="deepl_prefer_quality_optimized"
                                                        label={
                                                            <IconLabel
                                                                label={
                                                                    <FormattedMessage id="settings.functionSettings.translationSettings.apiConfig.deeplPreferQualityOptimized" />
                                                                }
                                                                tooltipTitle={
                                                                    <FormattedMessage id="settings.functionSettings.translationSettings.apiConfig.deeplPreferQualityOptimized.tip" />
                                                                }
                                                            />
                                                        }
                                                    />
                                                </Col>
                                            </>
                                        );
                                    }

                                    return null;
                                }}
                            </ProFormDependency>
                        </Row>
                    </ProFormList>

                    <Alert
                        message={
                            <Typography>
                                <Row>
                                    <Col span={24}>
                                        <FormattedMessage id="settings.functionSettings.translationSettings.chatPrompt.variables" />
                                    </Col>
                                    <Col span={12}>
                                        <FormattedMessage id="settings.functionSettings.translationSettings.chatPrompt.sourceLanguage" />
                                        <code>{SOURCE_LANGUAGE_ENV_VARIABLE}</code>
                                    </Col>
                                    <Col span={12}>
                                        <FormattedMessage id="settings.functionSettings.translationSettings.chatPrompt.targetLanguage" />
                                        <code>{TARGET_LANGUAGE_ENV_VARIABLE}</code>
                                    </Col>
                                    <Col span={12}>
                                        <FormattedMessage id="settings.functionSettings.translationSettings.chatPrompt.translationDomain" />
                                        <code>{TRANSLATION_DOMAIN_ENV_VARIABLE}</code>
                                    </Col>
                                </Row>
                            </Typography>
                        }
                        type="info"
                        style={{ marginBottom: token.margin }}
                    />
                    <ProFormTextArea
                        label={
                            <IconLabel
                                label={
                                    <FormattedMessage id="settings.functionSettings.translationSettings.chatPrompt" />
                                }
                                tooltipTitle={
                                    <FormattedMessage id="settings.functionSettings.translationSettings.chatPrompt.tip" />
                                }
                            />
                        }
                        layout="horizontal"
                        name="chatPrompt"
                        rules={[
                            {
                                required: true,
                                message: intl.formatMessage({
                                    id: 'settings.functionSettings.translationSettings.chatPrompt.required',
                                }),
                            },
                        ]}
                        fieldProps={{
                            autoSize: {
                                minRows: 1,
                                maxRows: 5,
                            },
                        }}
                    />
                </ProForm>
            </Spin>

            <Divider />

            <GroupTitle
                id="chatSettings"
                extra={
                    <ResetSettingsButton
                        title={<FormattedMessage id="settings.functionSettings.chatSettings" />}
                        appSettingsGroup={AppSettingsGroup.FunctionChat}
                    />
                }
            >
                <FormattedMessage id="settings.functionSettings.chatSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={functionForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.FunctionChat,
                            values,
                            true,
                            true,
                            true,
                            true,
                            false,
                        );
                    }}
                    submitter={false}
                >
                    <ProForm.Item
                        label={
                            <IconLabel
                                label={
                                    <FormattedMessage id="settings.functionSettings.chatSettings.autoCreateNewSession" />
                                }
                            />
                        }
                        layout="horizontal"
                        name="autoCreateNewSession"
                        valuePropName="checked"
                    >
                        <Switch />
                    </ProForm.Item>

                    <ProFormList
                        name="chatApiConfigList"
                        label={
                            <IconLabel
                                label={
                                    <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig" />
                                }
                                tooltipTitle={
                                    <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.tip" />
                                }
                            />
                        }
                        creatorButtonProps={{
                            creatorButtonText: intl.formatMessage({
                                id: 'settings.functionSettings.chatSettings.apiConfig.add',
                            }),
                        }}
                        actionRender={(...params) => {
                            const [field, , defaultActionDom] = params;
                            return [
                                defaultActionDom,
                                <TestChat
                                    key="test-chat"
                                    config={
                                        functionForm.getFieldValue('chatApiConfigList')[field.name]
                                    }
                                />,
                            ];
                        }}
                        className="api-config-list"
                        min={0}
                        itemRender={({ listDom, action }) => (
                            <Flex align="end" justify="space-between">
                                {listDom}
                                <div>{action}</div>
                            </Flex>
                        )}
                        creatorRecord={() => ({
                            api_uri: '',
                            api_key: '',
                            api_model: '',
                            model_name: '',
                        })}
                    >
                        <Row gutter={token.padding} style={{ width: '100%' }}>
                            <Col span={12}>
                                <ProFormText
                                    name="model_name"
                                    label={
                                        <IconLabel
                                            label={
                                                <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.modelName" />
                                            }
                                            tooltipTitle={
                                                <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.modelName.tip" />
                                            }
                                        />
                                    }
                                    rules={[
                                        {
                                            required: true,
                                            message: intl.formatMessage({
                                                id: 'settings.functionSettings.chatSettings.apiConfig.modelName.required',
                                            }),
                                        },
                                    ]}
                                />
                            </Col>
                            <Col span={12}>
                                <ProFormSwitch
                                    name="support_thinking"
                                    label={
                                        <IconLabel
                                            label={
                                                <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.supportThinking" />
                                            }
                                            tooltipTitle={
                                                <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.supportThinking.tip" />
                                            }
                                        />
                                    }
                                />
                            </Col>
                            <Col span={12}>
                                <ProFormText
                                    name="api_uri"
                                    label={
                                        <IconLabel
                                            label={
                                                <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.apiUri" />
                                            }
                                            tooltipTitle={
                                                <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.apiUri.tip" />
                                            }
                                        />
                                    }
                                    rules={[
                                        {
                                            required: true,
                                            message: intl.formatMessage({
                                                id: 'settings.functionSettings.chatSettings.apiConfig.apiUri.required',
                                            }),
                                        },
                                    ]}
                                />
                            </Col>
                            <Col span={12}>
                                <ProFormText.Password
                                    name="api_key"
                                    label={
                                        <IconLabel
                                            label={
                                                <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.apiKey" />
                                            }
                                            tooltipTitle={
                                                <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.apiKey.tip" />
                                            }
                                        />
                                    }
                                    rules={[
                                        {
                                            required: true,
                                            message: intl.formatMessage({
                                                id: 'settings.functionSettings.chatSettings.apiConfig.apiKey.required',
                                            }),
                                        },
                                    ]}
                                />
                            </Col>
                            <Col span={12}>
                                <ProFormText
                                    name="api_model"
                                    label={
                                        <IconLabel
                                            label={
                                                <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.apiModel" />
                                            }
                                            tooltipTitle={
                                                <FormattedMessage id="settings.functionSettings.chatSettings.apiConfig.apiModel.tip" />
                                            }
                                        />
                                    }
                                    rules={[
                                        {
                                            required: true,
                                            message: intl.formatMessage({
                                                id: 'settings.functionSettings.chatSettings.apiConfig.apiModel.required',
                                            }),
                                        },
                                    ]}
                                />
                            </Col>
                        </Row>
                    </ProFormList>
                </ProForm>
            </Spin>

            <Divider />

            <GroupTitle
                id="fullScreenDrawSettings"
                extra={
                    <ResetSettingsButton
                        title={
                            <FormattedMessage id="settings.functionSettings.fullScreenDrawSettings" />
                        }
                        appSettingsGroup={AppSettingsGroup.FunctionFullScreenDraw}
                    />
                }
            >
                <FormattedMessage id="settings.functionSettings.fullScreenDrawSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={fullScreenDrawForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.FunctionFullScreenDraw,
                            values,
                            true,
                            true,
                            true,
                            true,
                            false,
                        );
                    }}
                    submitter={false}
                    layout="horizontal"
                >
                    <Row gutter={token.padding}>
                        <Col span={12}>
                            <ProFormSelect
                                name="defaultTool"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.fullScreenDrawSettings.defaultTool" />
                                }
                                options={[
                                    {
                                        label: <FormattedMessage id="draw.selectTool" />,
                                        value: DrawState.Select,
                                    },
                                    {
                                        label: <FormattedMessage id="draw.penTool" />,
                                        value: DrawState.Pen,
                                    },
                                    {
                                        label: <FormattedMessage id="draw.laserPointerTool" />,
                                        value: DrawState.LaserPointer,
                                    },
                                ]}
                            />
                        </Col>
                    </Row>
                </ProForm>
            </Spin>

            <Divider />

            <GroupTitle
                id="videoRecordSettings"
                extra={
                    <ResetSettingsButton
                        title={
                            <FormattedMessage id="settings.functionSettings.videoRecordSettings" />
                        }
                        appSettingsGroup={AppSettingsGroup.FunctionVideoRecord}
                    />
                }
            >
                <FormattedMessage id="settings.functionSettings.videoRecordSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={videoRecordForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.FunctionVideoRecord,
                            values,
                            true,
                            true,
                            false,
                            true,
                            false,
                        );
                    }}
                    submitter={false}
                    layout="horizontal"
                >
                    <Row gutter={token.padding}>
                        <Col span={12}>
                            <ProFormSelect
                                name="frameRate"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.videoRecordSettings.frameRate" />
                                }
                                options={[
                                    {
                                        label: '10',
                                        value: 10,
                                    },
                                    {
                                        label: '15',
                                        value: 15,
                                    },
                                    {
                                        label: '24',
                                        value: 24,
                                    },
                                    {
                                        label: '30',
                                        value: 30,
                                    },
                                    {
                                        label: '60',
                                        value: 60,
                                    },
                                    {
                                        label: '120',
                                        value: 120,
                                    },
                                    {
                                        label: '83',
                                        value: 83,
                                    },
                                    {
                                        label: '42',
                                        value: 42,
                                    },
                                ]}
                            />
                        </Col>
                    </Row>
                    <Row gutter={token.padding}>
                        <Col span={12}>
                            <ProFormSelect
                                name="microphoneDeviceName"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.videoRecordSettings.microphoneDeviceName" />
                                }
                                options={microphoneDeviceNameOptions}
                            />
                        </Col>
                    </Row>
                    <Row gutter={token.padding}>
                        <Col span={12}>
                            <ProFormSelect
                                name="encoder"
                                layout="horizontal"
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.functionSettings.videoRecordSettings.encoder" />
                                        }
                                        tooltipTitle={
                                            <FormattedMessage id="settings.functionSettings.videoRecordSettings.encoder.tip" />
                                        }
                                    />
                                }
                                options={[
                                    {
                                        label: 'Libx264 (CPU)',
                                        value: 'libx264',
                                    },
                                    {
                                        label: 'Libx265 (CPU)',
                                        value: 'libx265',
                                    },
                                    {
                                        label: 'H264_AMF (AMD)',
                                        value: 'h264_amf',
                                    },
                                    {
                                        label: 'H264_NVENC (NVIDIA)',
                                        value: 'h264_nvenc',
                                    },
                                ]}
                            />
                        </Col>

                        <Col span={12}>
                            <ProFormSelect
                                name="encoderPreset"
                                layout="horizontal"
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.functionSettings.videoRecordSettings.encoderPreset" />
                                        }
                                        tooltipTitle={
                                            <FormattedMessage id="settings.functionSettings.videoRecordSettings.encoderPreset.tip" />
                                        }
                                    />
                                }
                                options={[
                                    {
                                        label: intl.formatMessage({
                                            id: 'settings.functionSettings.videoRecordSettings.encoderPreset.ultrafast',
                                        }),
                                        value: 'ultrafast',
                                    },
                                    {
                                        label: intl.formatMessage({
                                            id: 'settings.functionSettings.videoRecordSettings.encoderPreset.veryfast',
                                        }),
                                        value: 'veryfast',
                                    },
                                    {
                                        label: intl.formatMessage({
                                            id: 'settings.functionSettings.videoRecordSettings.encoderPreset.medium',
                                        }),
                                        value: 'medium',
                                    },
                                    {
                                        label: intl.formatMessage({
                                            id: 'settings.functionSettings.videoRecordSettings.encoderPreset.slower',
                                        }),
                                        value: 'slower',
                                    },
                                    {
                                        label: intl.formatMessage({
                                            id: 'settings.functionSettings.videoRecordSettings.encoderPreset.placebo',
                                        }),
                                        value: 'placebo',
                                    },
                                ]}
                            />
                        </Col>

                        <Col span={12}>
                            <ProFormSwitch
                                name="hwaccel"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.videoRecordSettings.hwaccel" />
                                }
                            />
                        </Col>
                    </Row>
                    <Row gutter={token.padding}>
                        <Col span={24}>
                            <ProForm.Item
                                name="saveDirectory"
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.functionSettings.videoRecordSettings.saveDirectory" />
                                        }
                                    />
                                }
                                required={false}
                            >
                                <DirectoryInput />
                            </ProForm.Item>
                        </Col>
                    </Row>
                </ProForm>
            </Spin>

            <Divider />

            <GroupTitle
                id="outputSettings"
                extra={
                    <ResetSettingsButton
                        title={<FormattedMessage id="settings.functionSettings.outputSettings" />}
                        appSettingsGroup={AppSettingsGroup.FunctionOutput}
                    />
                }
            >
                <FormattedMessage id="settings.functionSettings.outputSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={outputForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.FunctionOutput,
                            values,
                            true,
                            true,
                            true,
                            true,
                            false,
                        );
                    }}
                    submitter={false}
                    layout="horizontal"
                >
                    <Row gutter={token.padding}>
                        <Col span={24}>
                            <ProFormText
                                name="manualSaveFileNameFormat"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.outputSettings.manualSaveFileNameFormat" />
                                }
                            />
                        </Col>

                        <ProFormDependency<{ manualSaveFileNameFormat: string }>
                            name={['manualSaveFileNameFormat']}
                        >
                            {({ manualSaveFileNameFormat }) => {
                                const text = generateImageFileName(manualSaveFileNameFormat);
                                return (
                                    <Col span={24}>
                                        <ProFormText
                                            layout="horizontal"
                                            readonly
                                            label={
                                                <FormattedMessage id="settings.functionSettings.outputSettings.manualSaveFileNameFormatPreview" />
                                            }
                                            fieldProps={{
                                                value: text,
                                            }}
                                        />
                                    </Col>
                                );
                            }}
                        </ProFormDependency>

                        <Col span={24}>
                            <ProFormText
                                name="autoSaveFileNameFormat"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.outputSettings.autoSaveFileNameFormat" />
                                }
                            />
                        </Col>

                        <ProFormDependency<{ autoSaveFileNameFormat: string }>
                            name={['autoSaveFileNameFormat']}
                        >
                            {({ autoSaveFileNameFormat }) => {
                                const text = generateImageFileName(autoSaveFileNameFormat);
                                return (
                                    <Col span={24}>
                                        <ProFormText
                                            layout="horizontal"
                                            readonly
                                            label={
                                                <FormattedMessage id="settings.functionSettings.outputSettings.autoSaveFileNameFormatPreview" />
                                            }
                                            fieldProps={{
                                                value: text,
                                            }}
                                        />
                                    </Col>
                                );
                            }}
                        </ProFormDependency>

                        <Col span={24}>
                            <ProFormText
                                name="fastSaveFileNameFormat"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.outputSettings.fastSaveFileNameFormat" />
                                }
                            />
                        </Col>

                        <ProFormDependency<{ fastSaveFileNameFormat: string }>
                            name={['fastSaveFileNameFormat']}
                        >
                            {({ fastSaveFileNameFormat }) => {
                                const text = generateImageFileName(fastSaveFileNameFormat);
                                return (
                                    <Col span={24}>
                                        <ProFormText
                                            layout="horizontal"
                                            readonly
                                            label={
                                                <FormattedMessage id="settings.functionSettings.outputSettings.fastSaveFileNameFormatPreview" />
                                            }
                                            fieldProps={{
                                                value: text,
                                            }}
                                        />
                                    </Col>
                                );
                            }}
                        </ProFormDependency>

                        <Col span={24}>
                            <ProFormText
                                name="videoRecordFileNameFormat"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.outputSettings.videoRecordFileNameFormat" />
                                }
                            />
                        </Col>

                        <ProFormDependency<{ videoRecordFileNameFormat: string }>
                            name={['videoRecordFileNameFormat']}
                        >
                            {({ videoRecordFileNameFormat }) => {
                                const text = generateImageFileName(videoRecordFileNameFormat);
                                return (
                                    <Col span={24}>
                                        <ProFormText
                                            layout="horizontal"
                                            readonly
                                            label={
                                                <FormattedMessage id="settings.functionSettings.outputSettings.videoRecordFileNameFormatPreview" />
                                            }
                                            fieldProps={{
                                                value: text,
                                            }}
                                        />
                                    </Col>
                                );
                            }}
                        </ProFormDependency>
                    </Row>
                </ProForm>
            </Spin>

            <style jsx>{`
                :global(.api-config-list .ant-pro-form-list-container) {
                    width: 100%;
                }
            `}</style>
        </ContentWrap>
    );
}
