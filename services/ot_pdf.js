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
async function htmlAPdf(html, titulo, horizontal = false) {
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
    return await pagina.pdf({ format: 'A4', landscape: horizontal, printBackground: true, preferCSSPageSize: false, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  } finally {
    await pagina.close();
  }
}

module.exports = { htmlAPdf };
