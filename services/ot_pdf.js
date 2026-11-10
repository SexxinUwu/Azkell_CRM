// PDF de la orden de trabajo con Chromium del servidor: el HTML del clásico se convierte en un PDF de texto real
// (vectorial), así que se ve igual de nítido que el clásico en cualquier zoom.
const puppeteer = require('puppeteer-core');

const RUTA_CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';
// Solo se permiten recursos que el documento necesita: fuente (Oswald) y logo de la empresa. Lo demás se bloquea.
const ORIGENES_PERMITIDOS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://drive.google.com', 'https://lh3.googleusercontent.com'];

let navegador = null;
let arranque = null;

async function obtenerNavegador() {
  if (navegador && navegador.connected) return navegador;
  if (!arranque) {
    arranque = puppeteer.launch({
      executablePath: RUTA_CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    }).then(b => { navegador = b; arranque = null; return b; }, err => { arranque = null; throw err; });
  }
  return arranque;
}

/** HTML del documento -> PDF (Buffer). El título queda como metadato del PDF, que es lo que muestra el visor. */
async function htmlAPdf(html, titulo, horizontal = false, unaHoja = false, opciones = {}) {
  // opciones.margenV: margen arriba y abajo en mm (todas las hojas, no solo la primera). opciones.compactar: si sobra poco para una hoja más, se reduce todo en proporción para no generar una hoja casi vacía.
  const margenV = Number(opciones.margenV) > 0 ? Number(opciones.margenV) : 0;
  const b = await obtenerNavegador();
  const documento = html
    .replace(/<button id="btnPrint"[\s\S]*?<\/button>/, '')
    .replace(/<title>[^<]*<\/title>/, () => `<title>${titulo.replace(/[<&]/g, '')}</title>`);
  const pagina = await b.newPage();
  try {
    await pagina.setJavaScriptEnabled(false);
    await pagina.setRequestInterception(true);
    pagina.on('request', req => {
      const url = req.url();
      if (url.startsWith('data:') || ORIGENES_PERMITIDOS.some(o => url.startsWith(o))) req.continue();
      else req.abort();
    });
    await pagina.setContent(documento, { waitUntil: 'networkidle0', timeout: 30000 });
    await pagina.evaluate(() => document.fonts.ready);
    // Documentos pensados para una sola hoja (.hoja): si pasan un poco, se reduce todo en proporción para que entren.
    // Si pasan mucho (más de ~18 %), no se reduce y el resto sigue en una segunda hoja.
    if (unaHoja) {
        await pagina.evaluate(() => {
            const h = document.querySelector('.hoja');
            if (!h) return;
            const A4 = (297 / 25.4) * 96 - 2;
            const alto = h.scrollHeight;
            if (alto <= A4) return;
            const z = A4 / alto;
            if (z < 0.82) return;
            h.style.width = `${210 / z}mm`;
            h.style.minHeight = `${295 / z}mm`;
            h.style.zoom = String(z);
        });
    }
    if (opciones.compactar) {
        await pagina.evaluate((horiz, mv) => {
            const h = document.querySelector('.hoja');
            if (!h) return;
            const hojaMm = (horiz ? 210 : 297) - 2 * mv, anchoMm = horiz ? 297 : 210;
            const alto1 = (hojaMm / 25.4) * 96 - 2;
            const alto = h.scrollHeight;
            const n = Math.ceil(alto / alto1);
            if (n <= 1) return;
            // Se intenta una hoja menos; solo si hay que reducir poco (hasta ~22 %) para que se siga leyendo bien
            const z = ((n - 1) * alto1 * 0.96) / alto;
            if (z < 0.78) return;
            h.style.width = `${anchoMm / z}mm`;
            h.style.zoom = String(z);
        }, horizontal, margenV);
    }
    return await pagina.pdf({ format: 'A4', landscape: horizontal, printBackground: true, preferCSSPageSize: false, margin: { top: `${margenV}mm`, right: '0', bottom: `${margenV}mm`, left: '0' } });
  } finally {
    await pagina.close();
  }
}

module.exports = { htmlAPdf };
