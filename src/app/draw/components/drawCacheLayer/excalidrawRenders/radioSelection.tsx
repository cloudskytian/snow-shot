import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import {
    ExcalidrawEventCallbackPublisher,
    ExcalidrawEventCallbackType,
    ExcalidrawEventCallbackParams,
} from '@/app/draw/components/drawCacheLayer/extra';
import { ExcalidrawPropsCustomOptions } from '@mg-chao/excalidraw/types';
import { Radio } from 'antd';
import { useCallback, useEffect, useRef } from 'react';

export const RadioSelection = ((props) => {
    const propsRef = useRef(props);
    useEffect(() => {
        propsRef.current = props;
    }, [props]);

    useStateSubscriber(
        ExcalidrawEventCallbackPublisher,
        useCallback((value: ExcalidrawEventCallbackParams | undefined) => {
            const currentProps = propsRef.current;
            if (!currentProps) {
                return;
            }

            if (value?.event === ExcalidrawEventCallbackType.ChangeFontSize) {
                const fontSize = value.params.fontSize;
                const fontSizeIndex = currentProps.options.findIndex(
                    (option) => typeof option.value === 'number' && option.value === fontSize,
                );
                if (fontSizeIndex === -1) {
                    return;
                }
                const targetFontSize = currentProps.options[fontSizeIndex].value;
                if ('onChange' in currentProps) {
                    currentProps.onChange(targetFontSize);
                }
            }
        }, []),
    );

    if (props.type === 'button') {
        return (
            <Radio.Group value={props.value}>
                {props.options.map((option) => (
                    <Radio.Button
                        key={option.text}
                        title={option.text}
                        value={option.value}
                        checked={option.active ?? props.value === option.value}
                        onClick={(event) =>
                            props.onClick(
                                option.value,
                                event as React.MouseEvent<HTMLButtonElement>,
                            )
                        }
                    >
                        <div className="radio-button-icon">{option.icon}</div>
                    </Radio.Button>
                ))}
            </Radio.Group>
        );
    }

    return (
        <Radio.Group value={props.value}>
            {props.options.map((option) => (
                <Radio.Button
                    name={props.group}
                    key={option.text}
                    title={option.text}
                    value={option.value}
                    checked={props.value === option.value}
                    onChange={() => props.onChange(option.value)}
                    data-testid={option.testId}
                >
                    <div className="radio-button-icon">{option.icon}</div>
                </Radio.Button>
            ))}
        </Radio.Group>
    );
}) as NonNullable<ExcalidrawPropsCustomOptions['pickerRenders']>['RadioSelection'];
