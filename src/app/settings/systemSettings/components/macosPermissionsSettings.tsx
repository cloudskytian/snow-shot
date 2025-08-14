import { GroupTitle } from '@/components/groupTitle';
import { ResetIcon } from '@/components/icons';
import { useStateRef } from '@/hooks/useStateRef';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Alert, Button, List } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import {
    checkAccessibilityPermission,
    checkMicrophonePermission,
    checkScreenRecordingPermission,
    requestAccessibilityPermission,
    requestMicrophonePermission,
    requestScreenRecordingPermission,
} from 'tauri-plugin-macos-permissions-api';
import useInterval from 'use-interval';

const PermissionListItem: React.FC<{
    permissionName: React.ReactNode;
    permissionTip: React.ReactNode;
    permissionState: boolean;
    requestPermission: () => Promise<unknown>;
    reloadPermissionsState: () => Promise<void>;
}> = ({
    permissionName,
    permissionTip,
    permissionState,
    requestPermission,
    reloadPermissionsState,
}) => {
    return (
        <List.Item
            actions={[
                <Button
                    key="recordScreen"
                    variant="link"
                    color={permissionState ? 'green' : 'primary'}
                    onClick={() => {
                        if (permissionState) {
                            return;
                        }

                        requestPermission().then(() => {
                            reloadPermissionsState();
                        });
                    }}
                >
                    {permissionState ? (
                        <FormattedMessage id="settings.systemSettings.macosPermissionsSettings.authorized" />
                    ) : (
                        <FormattedMessage id="settings.systemSettings.macosPermissionsSettings.request" />
                    )}
                </Button>,
            ]}
        >
            <List.Item.Meta title={permissionName} description={permissionTip} />
        </List.Item>
    );
};

export const MacOSPermissionsSettings: React.FC = () => {
    const [permissionsState, setPermissionsState, permissionsStateRef] = useStateRef<{
        enableRecordScreen: boolean;
        enableAccessibility: boolean;
        enableMicrophone: boolean;
    }>({
        enableRecordScreen: false,
        enableAccessibility: false,
        enableMicrophone: false,
    });

    const reloadPermissionsState = useCallback(async () => {
        const [enableRecordScreen, enableAccessibility, enableMicrophone] = await Promise.all([
            checkScreenRecordingPermission(),
            checkAccessibilityPermission(),
            checkMicrophonePermission(),
        ]);

        setPermissionsState({ enableRecordScreen, enableAccessibility, enableMicrophone });
    }, [setPermissionsState]);

    useEffect(() => {
        reloadPermissionsState();
    }, [reloadPermissionsState]);

    const [realodButtonLoading, setRealodButtonLoading] = useState(false);

    // 自动刷新权限状态
    useInterval(
        useCallback(() => {
            if (
                permissionsStateRef.current.enableRecordScreen &&
                permissionsStateRef.current.enableAccessibility &&
                permissionsStateRef.current.enableMicrophone
            ) {
                return;
            }

            reloadPermissionsState();
        }, [reloadPermissionsState, permissionsStateRef]),
        1000 * 10,
    );

    return (
        <>
            <GroupTitle
                id="macosPermissionsSettings"
                extra={
                    <Button
                        loading={realodButtonLoading}
                        type="text"
                        onClick={async () => {
                            setRealodButtonLoading(true);
                            await reloadPermissionsState();

                            setRealodButtonLoading(false);
                        }}
                    >
                        <ResetIcon />
                    </Button>
                }
            >
                <FormattedMessage id="settings.systemSettings.macosPermissionsSettings" />
            </GroupTitle>

            <Alert
                message={
                    <FormattedMessage
                        id="settings.systemSettings.macosPermissionsSettings.request.tip"
                        values={{
                            link: (
                                <Button
                                    type="link"
                                    onClick={() => {
                                        openUrl(
                                            'https://github.com/mg-chao/snow-shot/blob/main/docs/macos-permissions.md',
                                        );
                                    }}
                                >
                                    <FormattedMessage id="settings.systemSettings.macosPermissionsSettings.request.tip.link" />
                                </Button>
                            ),
                        }}
                    />
                }
                type="info"
                showIcon
            />

            <List itemLayout="horizontal">
                <PermissionListItem
                    permissionName={
                        <FormattedMessage id="settings.systemSettings.macosPermissionsSettings.recordScreen" />
                    }
                    permissionTip={
                        <FormattedMessage id="settings.systemSettings.macosPermissionsSettings.recordScreen.tip" />
                    }
                    permissionState={permissionsState.enableRecordScreen}
                    requestPermission={requestScreenRecordingPermission}
                    reloadPermissionsState={reloadPermissionsState}
                />

                <PermissionListItem
                    permissionName={
                        <FormattedMessage id="settings.systemSettings.macosPermissionsSettings.accessibility" />
                    }
                    permissionTip={
                        <FormattedMessage id="settings.systemSettings.macosPermissionsSettings.accessibility.tip" />
                    }
                    permissionState={permissionsState.enableAccessibility}
                    requestPermission={requestAccessibilityPermission}
                    reloadPermissionsState={reloadPermissionsState}
                />

                <PermissionListItem
                    permissionName={
                        <FormattedMessage id="settings.systemSettings.macosPermissionsSettings.microphone" />
                    }
                    permissionTip={
                        <FormattedMessage id="settings.systemSettings.macosPermissionsSettings.microphone.tip" />
                    }
                    permissionState={permissionsState.enableMicrophone}
                    requestPermission={requestMicrophonePermission}
                    reloadPermissionsState={reloadPermissionsState}
                />
            </List>
        </>
    );
};
