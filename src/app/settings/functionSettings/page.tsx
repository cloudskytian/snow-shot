'use client';

import { GroupTitle } from '@/components/groupTitle';
import { Alert, Col, Flex, Form, Row, Spin, Switch, theme, Typography } from 'antd';
import { AppSettingsActionContext, AppSettingsData, AppSettingsGroup } from '../../contextWrap';
import { useCallback, useContext, useState } from 'react';
import { useAppSettingsLoad } from '@/hooks/useAppSettingsLoad';
import { FormattedMessage, useIntl } from 'react-intl';
import { ContentWrap } from '@/components/contentWrap';
import { IconLabel } from '@/components/iconLable';
import { ResetSettingsButton } from '@/components/resetSettingsButton';
import ProForm, {
    ProFormList,
    ProFormRadio,
    ProFormSlider,
    ProFormSwitch,
    ProFormText,
    ProFormTextArea,
} from '@ant-design/pro-form';
import {
    SOURCE_LANGUAGE_ENV_VARIABLE,
    TARGET_LANGUAGE_ENV_VARIABLE,
    TRANSLATION_DOMAIN_ENV_VARIABLE,
} from '@/app/tools/translation/extra';
import { ColorPickerShowMode } from '@/app/draw/components/colorPicker';

export default function SystemSettings() {
    const intl = useIntl();
    const { token } = theme.useToken();

    const { updateAppSettings } = useContext(AppSettingsActionContext);
    const [functionForm] = Form.useForm<AppSettingsData[AppSettingsGroup.FunctionChat]>();
    const [translationForm] = Form.useForm<AppSettingsData[AppSettingsGroup.FunctionTranslation]>();
    const [screenshotForm] = Form.useForm<AppSettingsData[AppSettingsGroup.FunctionScreenshot]>();

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
            },
            [functionForm, translationForm, screenshotForm],
        ),
        true,
    );
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
                    layout="vertical"
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
                            <ProFormRadio.Group
                                name="colorPickerShowMode"
                                layout="horizontal"
                                label={
                                    <FormattedMessage id="settings.functionSettings.screenshotSettings.colorPickerShowMode" />
                                }
                                options={[
                                    {
                                        label: (
                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.beyondSelectRect" />
                                        ),
                                        value: ColorPickerShowMode.BeyondSelectRect,
                                    },
                                    {
                                        label: (
                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.alwaysShowColorPicker" />
                                        ),
                                        value: ColorPickerShowMode.Always,
                                    },
                                    {
                                        label: (
                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.neverShowColorPicker" />
                                        ),
                                        value: ColorPickerShowMode.Never,
                                    },
                                ]}
                            />
                        </Col>

                        <Col span={12}>
                            <ProFormSlider
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.beyondSelectRectElementOpacity" />
                                        }
                                        tooltipTitle={
                                            <FormattedMessage id="settings.functionSettings.screenshotSettings.beyondSelectRectElementOpacity.tip" />
                                        }
                                    />
                                }
                                name="beyondSelectRectElementOpacity"
                                min={0}
                                max={100}
                                step={1}
                                marks={{
                                    0: '0%',
                                    100: '100%',
                                }}
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
                </ProForm>
            </Spin>

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

            <GroupTitle
                id="functionSettings"
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

            <style jsx>{`
                :global(.api-config-list .ant-pro-form-list-container) {
                    width: 100%;
                }
            `}</style>
        </ContentWrap>
    );
}
