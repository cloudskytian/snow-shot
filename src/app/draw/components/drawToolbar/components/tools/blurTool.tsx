import { useCallback, useContext, useRef } from 'react';
import { DrawContext } from '@/app/draw/types';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import * as PIXI from 'pixi.js';
import {
    CaptureBoundingBoxInfo,
    CaptureEvent,
    CaptureEventParams,
    CaptureEventPublisher,
} from '@/app/draw/extra';
import { useCallbackRender } from '@/hooks/useCallbackRender';
import {
    ExcalidrawEventOnChangeParams,
    ExcalidrawEventParams,
    ExcalidrawEventPublisher,
    ExcalidrawOnHandleEraserParams,
    ExcalidrawOnHandleEraserPublisher,
} from '@/app/fullScreenDraw/components/drawCore/extra';

type BlurSpriteProps = {
    blur: number;
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
    opacity: number;
    valid: boolean;
    zoom: number;
};

const isEqualBlurSpriteProps = (
    a: Omit<BlurSpriteProps, 'valid'>,
    b: Omit<BlurSpriteProps, 'valid'>,
) => {
    return (
        a.blur === b.blur &&
        a.x === b.x &&
        a.y === b.y &&
        a.width === b.width &&
        a.height === b.height &&
        a.angle === b.angle &&
        a.zoom === b.zoom &&
        a.opacity === b.opacity
    );
};

const BlurToolCore: React.FC = () => {
    const { drawLayerActionRef, drawCacheLayerActionRef } = useContext(DrawContext);
    const captureBoundingBoxInfoRef = useRef<CaptureBoundingBoxInfo | undefined>(undefined);
    const blurSpriteMapRef = useRef<
        Map<
            string,
            {
                sprite: PIXI.Sprite;
                spriteBlurFliter: PIXI.BlurFilter;
                spriteMask: PIXI.Graphics;
                props: BlurSpriteProps;
            }
        >
    >(new Map());
    const clear = useCallback(() => {
        captureBoundingBoxInfoRef.current = undefined;
        blurSpriteMapRef.current.clear();
    }, []);
    const init = useCallback(
        (imageTexture: PIXI.Texture, captureBoundingBoxInfo: CaptureBoundingBoxInfo) => {
            if (!drawLayerActionRef.current) {
                return;
            }

            captureBoundingBoxInfoRef.current = captureBoundingBoxInfo;
        },
        [drawLayerActionRef],
    );

    useStateSubscriber(
        CaptureEventPublisher,
        useCallback(
            (params: CaptureEventParams | undefined) => {
                if (!params) {
                    return;
                }

                if (params.event === CaptureEvent.onCaptureLoad) {
                    init(params.params[0], params.params[2]);
                } else if (params.event === CaptureEvent.onCaptureFinish) {
                    clear();
                }
            },
            [clear, init],
        ),
    );

    const updateBlur = useCallback(
        (params: ExcalidrawEventOnChangeParams['params'] | undefined) => {
            if (!params) {
                return;
            }

            const blurContainer = drawLayerActionRef.current?.getBlurContainer();
            const imageTexture = drawLayerActionRef.current?.getImageTexture();

            if (
                !drawLayerActionRef.current ||
                !blurContainer ||
                !captureBoundingBoxInfoRef.current ||
                !imageTexture
            ) {
                return;
            }

            blurSpriteMapRef.current.values().forEach(({ props }) => {
                props.valid = false;
            });

            let needRender = false;

            for (const element of params.elements) {
                if (element.type !== 'blur' || element.isDeleted) {
                    continue;
                }

                const appState = drawCacheLayerActionRef.current?.getAppState();
                if (!appState) {
                    return;
                }

                const { scrollY, scrollX, zoom } = appState;

                const blurProps = {
                    blur: element.blur,
                    x:
                        Math.round(element.x * window.devicePixelRatio) +
                        scrollX * window.devicePixelRatio,
                    y:
                        Math.round(element.y * window.devicePixelRatio) +
                        scrollY * window.devicePixelRatio,
                    width: Math.round(element.width * window.devicePixelRatio),
                    height: Math.round(element.height * window.devicePixelRatio),
                    angle: element.angle,
                    opacity: element.opacity,
                    zoom: zoom.value,
                    valid: true,
                };

                let blurSprite = blurSpriteMapRef.current.get(element.id);
                if (!blurSprite) {
                    blurSprite = {
                        sprite: new PIXI.Sprite(imageTexture),
                        spriteBlurFliter: new PIXI.BlurFilter(),
                        spriteMask: new PIXI.Graphics(),
                        props: {
                            ...blurProps,
                            blur: -1,
                        },
                    };
                    blurSprite.sprite.filters = [blurSprite.spriteBlurFliter];
                    blurSprite.sprite.x = 0;
                    blurSprite.sprite.y = 0;
                    blurSprite.sprite.width = imageTexture.width;
                    blurSprite.sprite.height = imageTexture.height;
                    blurSprite.sprite.setMask({
                        mask: blurSprite.spriteMask,
                    });
                    blurSprite.spriteMask.setFillStyle({
                        color: 'white',
                        alpha: 1,
                    });
                    drawLayerActionRef.current.addChildToContainer(
                        blurContainer,
                        blurSprite.sprite,
                    );
                    drawLayerActionRef.current.addChildToContainer(
                        blurContainer,
                        blurSprite.spriteMask,
                    );

                    blurSpriteMapRef.current.set(element.id, blurSprite);
                    needRender = true;
                }

                blurSprite.props.valid = true;
                if (isEqualBlurSpriteProps(blurSprite.props, blurProps)) {
                    continue;
                }

                blurSprite.spriteMask
                    .clear()
                    .rotateTransform(blurProps.angle)
                    .translateTransform(
                        blurProps.x + blurProps.width * 0.5,
                        blurProps.y + blurProps.height * 0.5,
                    )
                    .scaleTransform(blurProps.zoom, blurProps.zoom)
                    .rect(
                        -blurProps.width * 0.5,
                        -blurProps.height * 0.5,
                        blurProps.width,
                        blurProps.height,
                    )
                    .fill();
                blurSprite.sprite.alpha = blurProps.opacity / 100;
                if (blurSprite.props.blur !== blurProps.blur) {
                    blurSprite.spriteBlurFliter.strength = Math.max(0, (blurProps.blur / 100) * 32);
                }
                blurSprite.props = blurProps;
                needRender = true;
            }

            const blurSprites = Array.from(blurSpriteMapRef.current.entries()).filter(
                ([, blurSprite]) => !blurSprite.props.valid,
            );
            for (const [id, blurSprite] of blurSprites) {
                blurSpriteMapRef.current.delete(id);
                blurContainer.removeChild(blurSprite.sprite);
                blurContainer.removeChild(blurSprite.spriteMask);
                blurSprite.sprite.destroy();
                blurSprite.spriteBlurFliter.destroy();
                blurSprite.spriteMask.destroy();

                needRender = true;
            }

            console.log(blurSpriteMapRef.current.size);

            if (needRender) {
                drawLayerActionRef.current.getCanvasApp()!.render();
            }
        },
        [drawCacheLayerActionRef, drawLayerActionRef],
    );
    const updateBlurRender = useCallbackRender(updateBlur);

    const handleEraser = useCallback(
        (params: ExcalidrawOnHandleEraserParams | undefined) => {
            if (!params) {
                return;
            }

            params.elements.forEach((id) => {
                const blurSprite = blurSpriteMapRef.current.get(id);
                if (!blurSprite) {
                    return;
                }
                blurSprite.sprite.alpha = (blurSprite.props.opacity / 100) * 0.2;
                drawLayerActionRef.current?.getCanvasApp()!.render();
            });
        },
        [drawLayerActionRef],
    );
    const handleEraserRender = useCallbackRender(handleEraser);

    useStateSubscriber(
        ExcalidrawEventPublisher,
        useCallback(
            (params: ExcalidrawEventParams | undefined) => {
                if (params?.event === 'onChange') {
                    updateBlurRender(params.params);
                }
            },
            [updateBlurRender],
        ),
    );
    useStateSubscriber(ExcalidrawOnHandleEraserPublisher, handleEraserRender);
    return <></>;
};

export const BlurTool = BlurToolCore;
