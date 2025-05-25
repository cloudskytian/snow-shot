import dayjs from 'dayjs';
import * as dialog from '@tauri-apps/plugin-dialog';
import { AppSettingsData, AppSettingsGroup } from '@/app/contextWrap';
import path from 'path';

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

export const joinImagePath = (filePath: string, imageFormat: ImageFormat) => {
    let fileExtension = 'png';
    switch (imageFormat) {
        case ImageFormat.JPEG:
            fileExtension = 'jpg';
            break;
        case ImageFormat.WEBP:
            fileExtension = 'webp';
            break;
        case ImageFormat.AVIF:
            fileExtension = 'avif';
            break;
        case ImageFormat.JPEG_XL:
            fileExtension = 'jxl';
            break;
        case ImageFormat.PNG:
        default:
            fileExtension = 'png';
            break;
    }

    return `${filePath}.${fileExtension}`;
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

export const getImagePathFromSettings = (
    screenshotSettings: AppSettingsData[AppSettingsGroup.FunctionScreenshot] | undefined,
): ImagePath | undefined => {
    if (!screenshotSettings || !screenshotSettings.enhanceSaveFile) {
        return undefined;
    }

    return {
        filePath: joinImagePath(
            path.join(screenshotSettings.saveFileDirectory, generateImageFileName()),
            screenshotSettings.saveFileFormat,
        ),
        imageFormat: screenshotSettings.saveFileFormat,
    };
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
