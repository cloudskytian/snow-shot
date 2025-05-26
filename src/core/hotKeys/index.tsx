export enum KeyEventGroup {
    Translation = 'translation',
    Chat = 'chat',
    FixedContent = 'fixedContent',
}

export type KeyEventValue = {
    hotKey: string;
    unique?: boolean;
    group: KeyEventGroup;
};

export type KeyEventComponentValue = KeyEventValue & {
    messageId: string;
};

export enum KeyEventKey {
    CopyAndHide = 'copyAndHide',
    Copy = 'copy',
    ChatCopyAndHide = 'chatCopyAndHide',
    ChatCopy = 'chatCopy',
    ChatNewSession = 'chatNewSession',
    FixedContentSwitchThumbnail = 'fixedContentSwitchThumbnail',
    FixedContentCloseWindow = 'fixedContentCloseWindow',
}

export const defaultKeyEventSettings: Record<KeyEventKey, KeyEventValue> = {
    [KeyEventKey.CopyAndHide]: {
        hotKey: 'Ctrl+Q',
        group: KeyEventGroup.Translation,
    },
    [KeyEventKey.Copy]: {
        hotKey: 'Ctrl+C',
        group: KeyEventGroup.Translation,
    },
    [KeyEventKey.ChatCopyAndHide]: {
        hotKey: 'Ctrl+Q',
        group: KeyEventGroup.Chat,
    },
    [KeyEventKey.ChatCopy]: {
        hotKey: 'Ctrl+C',
        group: KeyEventGroup.Chat,
    },
    [KeyEventKey.ChatNewSession]: {
        hotKey: 'Ctrl+N',
        group: KeyEventGroup.Chat,
    },
    [KeyEventKey.FixedContentSwitchThumbnail]: {
        hotKey: 'R',
        group: KeyEventGroup.FixedContent,
    },
    [KeyEventKey.FixedContentCloseWindow]: {
        hotKey: 'Escape',
        group: KeyEventGroup.FixedContent,
    },
};

const keyEventSettingsKeys = Object.keys(defaultKeyEventSettings);
export const defaultKeyEventComponentConfig: Record<KeyEventKey, KeyEventComponentValue> =
    keyEventSettingsKeys.reduce(
        (acc, key) => {
            let baseMessageId = '';
            if (defaultKeyEventSettings[key as KeyEventKey].group === KeyEventGroup.Translation) {
                baseMessageId = 'tools.translation';
            } else if (defaultKeyEventSettings[key as KeyEventKey].group === KeyEventGroup.Chat) {
                baseMessageId = 'tools.chat';
            } else if (defaultKeyEventSettings[key as KeyEventKey].group === KeyEventGroup.FixedContent) {
                baseMessageId = 'settings.hotKeySettings.fixedContent';
            }

            acc[key as KeyEventKey] = {
                ...defaultKeyEventSettings[key as KeyEventKey],
                messageId: `${baseMessageId}.${key}`,
            };
            return acc;
        },
        {} as Record<KeyEventKey, KeyEventComponentValue>,
    );
