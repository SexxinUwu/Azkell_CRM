// OCR en el navegador (tesseract.js): vuelve un PDF escaneado en un PDF con texto que se puede buscar y seleccionar.
// El idioma español viaja con la app (assets/ocr-spa): no se baja nada de internet. Cada página se lee por separado.
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreSimdUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import coreBaseUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import type { Avance, Salida } from './motorPdf';

const sinExt = (n: string) => n.replace(/\.[^.]+$/, '');

/** WebAssembly con SIMD (casi todos los equipos de hoy): la lectura es más rápida; si no, el motor básico */
const hayWasmSimd = () => {
  try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); }
  catch { return false; }
};

export async function ocrPdf(f: File, alAvance?: Avance): Promise<Salida> {
  const { createWorker } = await import('tesseract.js');
  const base = import.meta.env.BASE_URL;
  const worker = await createWorker('spa', 1, {
    workerPath: workerUrl, corePath: hayWasmSimd() ? coreSimdUrl : coreBaseUrl, langPath: `${base}assets/ocr-spa`, gzip: true,
    workerBlobURL: false, cacheMethod: 'none',
  });
  const origen = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  try {
    const salida = await PDFDocument.create();
    let palabras = 0;
    for (let n = 1; n <= origen.numPages; n++) {
      const p = await origen.getPage(n);
      const vp = p.getViewport({ scale: 200 / 72 }); // 200 ppp: buena lectura sin gastar de más
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('El navegador no pudo dibujar la página.');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
      p.cleanup();
      const r = await worker.recognize(c, {}, { pdf: true, text: true });
      palabras += (r.data.text || '').split(/\s+/).filter(Boolean).length;
      const hoja = await PDFDocument.load(r.data.pdf as unknown as Uint8Array);
      const [copia] = await salida.copyPages(hoja, [0]);
      salida.addPage(copia);
      alAvance?.(n, origen.numPages);
    }
    if (!palabras) throw new Error('No se encontró texto en el documento. Revisa que las páginas se vean nítidas y derechas.');
    const bytes = await salida.save();
    return { nombre: `${sinExt(f.name)}_ocr.pdf`, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), detalle: `${origen.numPages} páginas · ${palabras} palabras leídas` };
  } finally {
    void worker.terminate();
    void origen.loadingTask.destroy();
  }
}
