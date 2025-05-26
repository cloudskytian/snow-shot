import { DrawContext } from '@/app/draw/types';
import { ExcalidrawPropsCustomOptions } from '@mg-chao/excalidraw/types';
import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { updateElementPosition } from '../../drawToolbar/components/dragButton/extra';
import { MousePosition } from '@/utils/mousePosition';
import { ElementRect } from '@/commands';
import { theme } from 'antd';
import { useCallbackRender } from '@/hooks/useCallbackRender';
import { HolderOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { ExcalidrawEventPublisher } from '../extra';

const LayoutMenuRender: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const intl = useIntl();
    const { token } = theme.useToken();

    const layoutMenuRenderRef = useRef<HTMLDivElement>(null);
    const { selectLayerActionRef, imageBufferRef } = useContext(DrawContext);

    const mouseOriginPositionRef = useRef<MousePosition>(new MousePosition(0, 0));
    const mouseCurrentPositionRef = useRef<MousePosition>(new MousePosition(0, 0));
    const toolbarPreviousRectRef = useRef<ElementRect>(undefined);
    const toolbarCurrentRectRef = useRef<ElementRect>({
        min_x: 0,
        min_y: 0,
        max_x: 0,
        max_y: 0,
    });

    const updateDrawToolbarStyle = useCallback(() => {
        const element = layoutMenuRenderRef.current;
        if (!element) {
            return;
        }

        const imageBuffer = imageBufferRef.current;
        if (!imageBuffer) {
            return;
        }

        const selectedRect = selectLayerActionRef.current?.getSelectRect();
        if (!selectedRect) {
            return;
        }

        const baseOffsetX = selectedRect.max_x / imageBuffer.monitorScaleFactor + token.marginXXS;
        const baseOffsetY = selectedRect.min_y / imageBuffer.monitorScaleFactor;

        const dragRes = updateElementPosition(
            element,
            baseOffsetX,
            baseOffsetY,
            mouseOriginPositionRef.current,
            mouseCurrentPositionRef.current,
            toolbarPreviousRectRef.current,
        );

        toolbarCurrentRectRef.current = dragRes.rect;
        mouseOriginPositionRef.current = dragRes.originPosition;
    }, [imageBufferRef, selectLayerActionRef, token.marginXXS]);
    const updateDrawToolbarStyleRender = useCallbackRender(updateDrawToolbarStyle);

    useEffect(() => {
        updateDrawToolbarStyleRender();
    }, [updateDrawToolbarStyleRender]);

    useStateSubscriber(ExcalidrawEventPublisher, updateDrawToolbarStyleRender);

    const dragTitle = useMemo(() => {
        return intl.formatMessage({ id: 'draw.drag' });
    }, [intl]);

    const draggingRef = useRef(false);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        draggingRef.current = true;
        mouseOriginPositionRef.current = new MousePosition(e.clientX, e.clientY);
        mouseCurrentPositionRef.current = new MousePosition(e.clientX, e.clientY);
        toolbarPreviousRectRef.current = toolbarCurrentRectRef.current;
    }, []);

    // 处理鼠标释放事件
    const handleMouseUp = useCallback(() => {
        if (!draggingRef.current) {
            return;
        }

        draggingRef.current = false;
    }, []);

    // 处理鼠标移动事件
    const handleMouseMove = useCallback(
        (mousePosition: MousePosition) => {
            if (!draggingRef.current) return;

            mouseCurrentPositionRef.current = mousePosition;
            updateDrawToolbarStyleRender();
        },
        [draggingRef, updateDrawToolbarStyleRender],
    );

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            const mousePosition = new MousePosition(e.clientX, e.clientY);
            handleMouseMove(mousePosition);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    return (
        <div ref={layoutMenuRenderRef} className="layout-menu-render" id="layout-menu-render">
            <div
                className="drag-button layout-menu-render-drag-button"
                title={dragTitle}
                onMouseDown={handleMouseDown}
            >
                <HolderOutlined />
                <HolderOutlined />
                <HolderOutlined />
            </div>

            {children}
        </div>
    );
};

export const layoutMenuRender: NonNullable<
    ExcalidrawPropsCustomOptions['layoutRenders']
>['menuRender'] = ({ children }) => {
    return <LayoutMenuRender>{children}</LayoutMenuRender>;
};
