import dayjs from 'dayjs';
import * as dialog from '@tauri-apps/plugin-dialog';

export const generateImageFileName = () => {
    return `SnowShot_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}`;
};

export enum ImageFormat {
    PNG = 'image/png',
    JPEG = 'image/jpeg',
    WEBP = 'image/webp',
    AVIF = 'image/avif',
    JPEG_XL = 'image/jpeg-xl',
}

export type ImagePath = {
    filePath: string;
    imageFormat: ImageFormat;
};

export const getImageFormat = (filePath: string) => {
    let imageFormat = ImageFormat.PNG;
    if (filePath.endsWith('.jpg')) {
        imageFormat = ImageFormat.JPEG;
    } else if (filePath.endsWith('.webp')) {
        imageFormat = ImageFormat.WEBP;
    } else if (filePath.endsWith('.avif')) {
        imageFormat = ImageFormat.AVIF;
    } else if (filePath.endsWith('.jxl')) {
        imageFormat = ImageFormat.JPEG_XL;
    }

    return imageFormat;
};

export const showImageDialog = async (prevFormat?: ImageFormat): Promise<ImagePath | undefined> => {
    let firstFilter;
    switch (prevFormat) {
        case ImageFormat.JPEG:
            firstFilter = {
                name: 'JPEG(*.jpg)',
                extensions: ['jpg'],
            };
            break;
        case ImageFormat.WEBP:
            firstFilter = {
                name: 'WebP(*.webp)',
                extensions: ['webp'],
            };
            break;
        case ImageFormat.AVIF:
            firstFilter = {
                name: 'AVIF(*.avif)',
                extensions: ['avif'],
            };
            break;
        case ImageFormat.JPEG_XL:
            firstFilter = {
                name: 'JPEG XL(*.jxl)',
                extensions: ['jxl'],
            };
            break;
        case ImageFormat.PNG:
        default:
            firstFilter = {
                name: 'PNG(*.png)',
                extensions: ['png'],
            };
            break;
    }

    const filePath = await dialog.save({
        filters: [
            firstFilter,
            {
                name: 'PNG(*.png)',
                extensions: ['png'],
            },
            {
                name: 'JPEG(*.jpg)',
                extensions: ['jpg'],
            },
            {
                name: 'WebP(*.webp)',
                extensions: ['webp'],
            },
            {
                name: 'AVIF(*.avif)',
                extensions: ['avif'],
            },
            {
                name: 'JPEG XL(*.jxl)',
                extensions: ['jxl'],
            },
        ],
        defaultPath: generateImageFileName(),
        canCreateDirectories: true,
    });

    if (!filePath) {
        return;
    }

    return {
        filePath,
        imageFormat: getImageFormat(filePath),
    };
};
