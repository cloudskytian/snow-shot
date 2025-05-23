import { DrawState } from '@/app/draw/types';
import { KeyEventWrap } from '@/app/draw/components/drawToolbar/components/keyEventWrap';
import React, { useCallback, useState } from 'react';
import { Button } from 'antd';
import { DrawStatePublisher } from '@/app/draw/extra';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { getButtonTypeByState } from '../../extra';
import { KeyEventKey } from '../keyEventWrap/extra';
import { HotkeysScope } from '@/components/globalLayoutExtra';

const ToolButtonCore: React.FC<{
    componentKey: KeyEventKey;
    icon: React.ReactNode;
    onClick: () => void;
    drawState: DrawState;
    extraDrawState?: DrawState[];
    disable?: boolean;
    confirmTip?: React.ReactNode;
    hotkeyScope?: HotkeysScope;
}> = ({
    componentKey,
    icon,
    onClick,
    drawState: propDrawState,
    extraDrawState,
    disable,
    confirmTip,
    hotkeyScope,
}) => {
    const [buttonType, setButtonType] = useState(getButtonTypeByState(false));
    const updateButtonType = useCallback(
        (drawState: DrawState) => {
            setButtonType(
                getButtonTypeByState(
                    drawState === propDrawState || (extraDrawState?.includes(drawState) ?? false),
                ),
            );
        },
        [propDrawState, extraDrawState],
    );

    useStateSubscriber(DrawStatePublisher, updateButtonType);
    return (
        <KeyEventWrap
            onKeyUpEventPropName="onClick"
            componentKey={componentKey}
            confirmTip={confirmTip}
            enable={disable ? false : undefined}
            hotkeyScope={hotkeyScope}
        >
            <Button icon={icon} type={buttonType} onClick={onClick} disabled={disable} />
        </KeyEventWrap>
    );
};

export const ToolButton = React.memo(ToolButtonCore);
