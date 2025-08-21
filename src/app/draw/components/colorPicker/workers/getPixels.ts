export type DecodeResult = {
    data: ImageData;
    width: number;
    height: number;
};

const decodeWorker: Worker =
    typeof window !== 'undefined'
        ? new Worker(new URL('./getPixelsWorker.ts', import.meta.url))
        : (undefined as unknown as Worker);

export async function getPixels(
    wasmModuleArrayBuffer: ArrayBuffer,
    imageBuffer: ArrayBuffer,
): Promise<DecodeResult> {
    return new Promise(async (resolve, reject) => {
        decodeWorker.onmessage = async (event: MessageEvent<DecodeResult>) => {
            resolve(event.data);
        };

        decodeWorker.onerror = (error) => {
            reject(error);
        };

        decodeWorker.postMessage({ imageBuffer, wasmModuleArrayBuffer });
    });
}

export function getPixelsWorker() {
    return decodeWorker;
}
