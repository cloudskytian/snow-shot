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
import ProForm from '@ant-design/pro-form';
import { AggregationColor } from 'antd/es/color-picker/color';

const { Option } = Select;

export default function GeneralSettings() {
    const intl = useIntl();
    const { token } = theme.useToken();

    const { updateAppSettings } = useContext(AppSettingsActionContext);
    const [commonForm] = Form.useForm<AppSettingsData[AppSettingsGroup.Common]>();
    const [screenshotForm] = Form.useForm<AppSettingsData[AppSettingsGroup.Screenshot]>();

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
            },
            [commonForm, screenshotForm, setAppSettingsLoading],
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
                    if (typeof values.fixedBorderColor === 'object') {
                        values.fixedBorderColor = (
                            values.fixedBorderColor as AggregationColor
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
                layout="horizontal"
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
                            <ProForm.Item
                                name="fixedBorderColor"
                                label={
                                    <IconLabel
                                        label={<FormattedMessage id="settings.fixedBorderColor" />}
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
