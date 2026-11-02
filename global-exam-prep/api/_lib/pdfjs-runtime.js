let canvasModulePromise = null;
let pdfJsModulePromise = null;

export async function getPdfJsDocument() {
    if (!canvasModulePromise) {
        canvasModulePromise = import('@napi-rs/canvas');
    }

    let canvas;
    try {
        canvas = await canvasModulePromise;
    } catch (error) {
        canvasModulePromise = null;
        throw error;
    }

    globalThis.DOMMatrix ??= canvas.DOMMatrix;
    globalThis.ImageData ??= canvas.ImageData;
    globalThis.Path2D ??= canvas.Path2D;

    if (typeof globalThis.DOMMatrix !== 'function') {
        throw new Error('The server PDF runtime could not initialize DOMMatrix.');
    }

    if (!pdfJsModulePromise) {
        pdfJsModulePromise = import('pdfjs-dist/legacy/build/pdf.mjs');
    }

    try {
        const pdfjs = await pdfJsModulePromise;
        if (typeof pdfjs.getDocument !== 'function') {
            throw new Error('The server PDF runtime did not expose getDocument.');
        }
        return pdfjs.getDocument;
    } catch (error) {
        pdfJsModulePromise = null;
        throw error;
    }
}
