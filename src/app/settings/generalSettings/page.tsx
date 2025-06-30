'use client';

import { GroupTitle } from '@/components/groupTitle';
import { Col, ColorPicker, Divider, Form, Row, Select, Spin, Switch, theme } from 'antd';
import {
    AppSettingsActionContext,
    AppSettingsControlNode,
    AppSettingsData,
    AppSettingsGroup,
    AppSettingsLanguage,
} from '../../contextWrap';
import { useCallback, useContext } from 'react';
import { useAppSettingsLoad } from '@/hooks/useAppSettingsLoad';
import { FormattedMessage, useIntl } from 'react-intl';
import { ContentWrap } from '@/components/contentWrap';
import { DarkModeIcon, LanguageIcon } from '@/components/icons';
import { IconLabel } from '@/components/iconLable';
import { ResetSettingsButton } from '@/components/resetSettingsButton';
import { useStateRef } from '@/hooks/useStateRef';
import ProForm, { ProFormRadio, ProFormSlider, ProFormSwitch } from '@ant-design/pro-form';
import { AggregationColor } from 'antd/es/color-picker/color';
import { PathInput } from '@/components/pathInput';
import { ColorPickerShowMode } from '@/app/draw/components/colorPicker';

const { Option } = Select;

export default function GeneralSettings() {
    const intl = useIntl();
    const { token } = theme.useToken();

    const { updateAppSettings } = useContext(AppSettingsActionContext);
    const [commonForm] = Form.useForm<AppSettingsData[AppSettingsGroup.Common]>();
    const [screenshotForm] = Form.useForm<AppSettingsData[AppSettingsGroup.Screenshot]>();
    const [fixedContentForm] = Form.useForm<AppSettingsData[AppSettingsGroup.FixedContent]>();
    const [trayIconForm] = Form.useForm<AppSettingsData[AppSettingsGroup.CommonTrayIcon]>();

    const [appSettingsLoading, setAppSettingsLoading] = useStateRef(true);
    useAppSettingsLoad(
        useCallback(
            (settings: AppSettingsData, preSettings?: AppSettingsData) => {
                setAppSettingsLoading(false);
                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.Common] !== settings[AppSettingsGroup.Common]
                ) {
                    commonForm.setFieldsValue(settings[AppSettingsGroup.Common]);
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.Screenshot] !==
                        settings[AppSettingsGroup.Screenshot]
                ) {
                    screenshotForm.setFieldsValue(settings[AppSettingsGroup.Screenshot]);
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.CommonTrayIcon] !==
                        settings[AppSettingsGroup.CommonTrayIcon]
                ) {
                    trayIconForm.setFieldsValue(settings[AppSettingsGroup.CommonTrayIcon]);
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.FixedContent] !==
                        settings[AppSettingsGroup.FixedContent]
                ) {
                    fixedContentForm.setFieldsValue(settings[AppSettingsGroup.FixedContent]);
                }
            },
            [commonForm, fixedContentForm, screenshotForm, setAppSettingsLoading, trayIconForm],
        ),
        true,
    );
    return (
        <ContentWrap className="settings-wrap">
            <GroupTitle
                id="commonSettings"
                extra={
                    <ResetSettingsButton
                        title={
                            <FormattedMessage id="settings.commonSettings" key="commonSettings" />
                        }
                        appSettingsGroup={AppSettingsGroup.Common}
                    />
                }
            >
                <FormattedMessage id="settings.commonSettings" />
            </GroupTitle>

            <Form
                className="settings-form common-settings-form"
                form={commonForm}
                onValuesChange={(_, values) => {
                    updateAppSettings(AppSettingsGroup.Common, values, true, true, true);
                }}
            >
                <Spin spinning={appSettingsLoading}>
                    <Row gutter={token.margin}>
                        <Col span={12}>
                            <Form.Item
                                label={
                                    <IconLabel
                                        icon={<DarkModeIcon />}
                                        label={<FormattedMessage id="settings.darkMode" />}
                                    />
                                }
                                name="darkMode"
                                valuePropName="checked"
                            >
                                <Switch />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                className="settings-wrap-language"
                                name="language"
                                label={
                                    <IconLabel
                                        icon={<LanguageIcon />}
                                        label={<FormattedMessage id="settings.language" />}
                                    />
                                }
                                required={false}
                                rules={[{ required: true }]}
                            >
                                <Select>
                                    <Option value={AppSettingsLanguage.EN}>English</Option>
                                    <Option value={AppSettingsLanguage.ZHHant}>繁体中文</Option>
                                    <Option value={AppSettingsLanguage.ZHHans}>简体中文</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </Spin>
            </Form>

            <Divider />

            <GroupTitle
                id="screenshotSettings"
                extra={
                    <ResetSettingsButton
                        title={intl.formatMessage({ id: 'settings.screenshotSettings' })}
                        appSettingsGroup={AppSettingsGroup.Screenshot}
                    />
                }
            >
                <FormattedMessage id="settings.screenshotSettings" />
            </GroupTitle>

            <ProForm<AppSettingsData[AppSettingsGroup.Screenshot]>
                className="settings-form screenshot-settings-form"
                form={screenshotForm}
                submitter={false}
                onValuesChange={(_, values) => {
                    if (typeof values.fullScreenAuxiliaryLineColor === 'object') {
                        values.fullScreenAuxiliaryLineColor = (
                            values.fullScreenAuxiliaryLineColor as AggregationColor
                        ).toHexString();
                    }

                    updateAppSettings(
                        AppSettingsGroup.Screenshot,
                        values,
                        true,
                        true,
                        true,
                        true,
                        false,
                    );
                }}
                layout="vertical"
            >
                <Spin spinning={appSettingsLoading}>
                    <Row gutter={token.margin}>
                        <Col span={12}>
                            <ProForm.Item
                                className="settings-wrap-language"
                                name="controlNode"
                                label={
                                    <IconLabel
                                        label={<FormattedMessage id="settings.controlNode" />}
                                    />
                                }
                                required={false}
                                rules={[{ required: true }]}
                            >
                                <Select>
                                    <Option value={AppSettingsControlNode.Circle}>
                                        <FormattedMessage id="settings.controlNode.circle" />
                                    </Option>
                                </Select>
                            </ProForm.Item>
                        </Col>

                        <Col span={12}>
                            <ProFormSwitch
                                name="disableAnimation"
                                label={<FormattedMessage id="settings.disableAnimation" />}
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
                            <ProForm.Item
                                name="fullScreenAuxiliaryLineColor"
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.fullScreenAuxiliaryLineColor" />
                                        }
                                    />
                                }
                                required={false}
                            >
                                <ColorPicker showText placement="bottom" />
                            </ProForm.Item>
                        </Col>
                    </Row>
                </Spin>
            </ProForm>

            <Divider />

            <GroupTitle
                id="fixedContentSettings"
                extra={
                    <ResetSettingsButton
                        title={intl.formatMessage({ id: 'settings.fixedContentSettings' })}
                        appSettingsGroup={AppSettingsGroup.FixedContent}
                    />
                }
            >
                <FormattedMessage id="settings.fixedContentSettings" />
            </GroupTitle>

            <ProForm<AppSettingsData[AppSettingsGroup.FixedContent]>
                className="settings-form fixed-content-settings-form"
                form={fixedContentForm}
                submitter={false}
                onValuesChange={(_, values) => {
                    if (typeof values.borderColor === 'object') {
                        values.borderColor = (values.borderColor as AggregationColor).toHexString();
                    }

                    updateAppSettings(
                        AppSettingsGroup.FixedContent,
                        values,
                        true,
                        true,
                        true,
                        true,
                        false,
                    );
                }}
                layout="vertical"
            >
                <Spin spinning={appSettingsLoading}>
                    <Row gutter={token.margin}>
                        <Col span={12}>
                            <ProForm.Item
                                name="borderColor"
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.fixedContentSettings.borderColor" />
                                        }
                                    />
                                }
                                required={false}
                            >
                                <ColorPicker showText placement="bottom" />
                            </ProForm.Item>
                        </Col>
                    </Row>
                </Spin>
            </ProForm>

            <Divider />

            <GroupTitle
                id="trayIconSettings"
                extra={
                    <ResetSettingsButton
                        title={intl.formatMessage({
                            id: 'settings.commonSettings.trayIconSettings',
                        })}
                        appSettingsGroup={AppSettingsGroup.CommonTrayIcon}
                    />
                }
            >
                <FormattedMessage id="settings.commonSettings.trayIconSettings" />
            </GroupTitle>

            <ProForm<AppSettingsData[AppSettingsGroup.CommonTrayIcon]>
                form={trayIconForm}
                submitter={false}
                onValuesChange={(_, values) => {
                    updateAppSettings(
                        AppSettingsGroup.CommonTrayIcon,
                        values,
                        true,
                        true,
                        false,
                        true,
                        false,
                    );
                }}
                layout="horizontal"
            >
                <Spin spinning={appSettingsLoading}>
                    <Row gutter={token.margin}>
                        <Col span={12}>
                            <ProForm.Item
                                name="iconPath"
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.commonSettings.trayIconSettings.iconPath" />
                                        }
                                        tooltipTitle={
                                            <FormattedMessage id="settings.commonSettings.trayIconSettings.iconPath.tip" />
                                        }
                                    />
                                }
                                required={false}
                            >
                                <PathInput
                                    filters={[
                                        { name: 'PNG(*.png)', extensions: ['png'] },
                                        { name: 'ICO(*.ico)', extensions: ['ico'] },
                                    ]}
                                />
                            </ProForm.Item>
                        </Col>
                    </Row>
                </Spin>
            </ProForm>

            <style jsx>{`
                :global(.settings-form)
                    :global(.settings-wrap-language)
                    :global(.ant-form-item-control) {
                    flex-grow: unset !important;
                    min-width: 128px;
                }
            `}</style>
        </ContentWrap>
    );
}
