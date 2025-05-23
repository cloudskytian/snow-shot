import { KeyEventKey } from '../keyEventWrap/extra';
import { RedoOutlined, UndoOutlined } from '@ant-design/icons';
import { useHistory } from '../../../historyContext';
import { useEffect, useState } from 'react';
import React from 'react';
import { DrawState } from '@/app/draw/types';
import { ToolButton } from '../toolButton';

const HistoryControlsCore: React.FC<{ disable: boolean }> = ({ disable }) => {
    const { history } = useHistory();
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    useEffect(() => {
        const unlisten = history.addOnUpdateListener(() => {
            setCanUndo(history.canUndo());
            setCanRedo(history.canRedo());
        });

        return () => {
            unlisten();
        };
    }, [history]);

    return (
        <>
            {/* 撤销 */}
            <ToolButton
                componentKey={KeyEventKey.UndoTool}
                icon={<UndoOutlined />}
                drawState={DrawState.Undo}
                disable={!canUndo || disable}
                onClick={() => {
                    history.undo();
                }}
            />

            {/* 重做 */}
            <ToolButton
                componentKey={KeyEventKey.RedoTool}
                icon={<RedoOutlined />}
                drawState={DrawState.Redo}
                disable={!canRedo || disable}
                onClick={() => {
                    history.redo();
                }}
            />
        </>
    );
};

export const HistoryControls = React.memo(HistoryControlsCore);
