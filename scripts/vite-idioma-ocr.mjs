// Plugin de Vite: pone el idioma español del OCR (tesseract) junto a los archivos de la app, en /assets/ocr-spa/,
// para que la lectura de texto no tenga que bajar nada de internet. En desarrollo lo sirve desde node_modules.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ORIGEN = fileURLToPath(new URL('../node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz', import.meta.url));
const RUTA = 'assets/ocr-spa/spa.traineddata.gz';

export default function idiomaOcr() {
  return {
    name: 'idioma-ocr',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0].endsWith('/' + RUTA)) {
          res.setHeader('Content-Type', 'application/gzip');
          fs.createReadStream(ORIGEN).pipe(res);
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: RUTA, source: fs.readFileSync(ORIGEN) });
    },
  };
}
