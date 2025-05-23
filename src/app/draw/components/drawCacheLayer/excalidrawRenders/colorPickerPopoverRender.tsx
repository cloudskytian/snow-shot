import { ColorPicker } from 'antd';
import { ExcalidrawPropsCustomOptions } from '@mg-chao/excalidraw/types';
import React from 'react';

const ColorPickerCore: React.FC<{
    color: string | null;
    onChange: (color: string) => void;
}> = ({ color: colorProp, onChange }) => {
    const color = colorProp === 'transparent' ? '#00000000' : colorProp;
    return (
        <div title={color ?? undefined} className="color-picker-popover-render">
            <ColorPicker
                value={color}
                onChangeComplete={(newColor) => {
                    onChange(newColor.toHexString());
                }}
                size="small"
                placement="rightTop"
                disabledFormat
            />

            <style jsx>{`
                .color-picker-popover-render :global(.ant-color-picker-trigger) {
                    width: 27px !important;
                    height: 27px !important;
                }

                .color-picker-popover-render :global(.ant-color-picker-color-block) {
                    width: 19px !important;
                    height: 19px !important;
                }
            `}</style>
        </div>
    );
};

const ColorPickerMemo = React.memo(ColorPickerCore);

export const colorPickerPopoverRender: NonNullable<
    ExcalidrawPropsCustomOptions['pickerRenders']
>['colorPickerPopoverRender'] = ({ color, onChange }) => {
    return <ColorPickerMemo color={color} onChange={onChange} />;
};
