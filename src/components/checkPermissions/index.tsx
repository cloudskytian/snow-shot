import { usePlatform } from '@/hooks/usePlatform';
import { Alert, Button, theme } from 'antd';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import {
    checkAccessibilityPermission,
    checkScreenRecordingPermission,
} from 'tauri-plugin-macos-permissions-api';

export const CheckPermissions = () => {
    const { token } = theme.useToken();
    const [currentPlatform] = usePlatform();
    const router = useRouter();

    const [showPermissionTip, setShowPermissionTip] = useState(false);
    const reloadPermissionsState = useCallback(async () => {
        if (currentPlatform !== 'macos') {
            return;
        }

        const [enableRecordScreen, enableAccessibility] = await Promise.all([
            checkScreenRecordingPermission(),
            checkAccessibilityPermission(),
        ]);

        setShowPermissionTip(!(enableRecordScreen && enableAccessibility));
    }, [currentPlatform]);

    useEffect(() => {
        reloadPermissionsState();
    }, [reloadPermissionsState]);

    if (currentPlatform !== 'macos') {
        return null;
    }

    if (!showPermissionTip) {
        return null;
    }

    return (
        <Alert
            message={<FormattedMessage id="common.permission.error.title" />}
            description={<FormattedMessage id="common.permission.error.description" />}
            type="error"
            showIcon
            action={
                <Button
                    type="primary"
                    onClick={() => {
                        router.push('/settings/systemSettings#macosPermissionsSettings');
                    }}
                >
                    <FormattedMessage id="common.permission.error.goToSettings" />
                </Button>
            }
            style={{
                marginBottom: token.margin,
            }}
        />
    );
};
