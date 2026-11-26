// Agente de etiquetas de Azkell Fleet: corre en la PC que tiene la etiquetadora y recibe las etiquetas desde el navegador.
// Solo escucha en esta misma PC (127.0.0.1) y solo atiende a las páginas de Azkell. No usa librerías externas.
// Uso:  node agente-etiquetas/agente.js        (o iniciar-agente.bat)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const PUERTO = Number(process.env.ETIQUETAS_PUERTO) || 9101;
const SCRIPT = path.join(__dirname, 'imprimir-usb.ps1');
const MAX_BYTES = 256 * 1024;
// Páginas autorizadas a imprimir: Azkell y la PC local (desarrollo). Se pueden añadir otras con ETIQUETAS_ORIGENES="https://otro.com,https://x.com"
const EXTRA = String(process.env.ETIQUETAS_ORIGENES || '').split(',').map(s => s.trim()).filter(Boolean);
const origenPermitido = (o) => !!o && (/^https:\/\/([a-z0-9-]+\.)*azkell\.com$/i.test(o) || /^https:\/\/[a-z0-9.-]+\.sslip\.io$/i.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o) || EXTRA.includes(o));

function powershell(args) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, ...args], { timeout: 20000, windowsHide: true }, (err, out, errOut) => {
      resolve({ ok: !err, salida: String(out || '').trim(), error: String(errOut || (err && err.message) || '').split('\n')[0].trim() });
    });
  });
}

const cabeceras = (origen) => ({
  'Access-Control-Allow-Origin': origen,
  'Vary': 'Origin',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  // Chrome pide este permiso cuando una página de internet habla con la PC local
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '600',
});
const responder = (res, origen, codigo, obj) => { res.writeHead(codigo, { ...cabeceras(origen), 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };

const servidor = http.createServer(async (req, res) => {
  const origen = req.headers.origin || '';
  if (!origenPermitido(origen)) { res.writeHead(403); return res.end('Origen no autorizado'); }
  if (req.method === 'OPTIONS') { res.writeHead(204, cabeceras(origen)); return res.end(); }

  if (req.method === 'GET' && req.url === '/estado') {
    const r = await powershell(['-Listar']);
    const conectada = r.ok && /^IMPRESORA /m.test(r.salida);
    return responder(res, origen, 200, { ok: true, agente: 'azkell-etiquetas', impresora: conectada });
  }

  if (req.method === 'POST' && req.url === '/imprimir') {
    let cuerpo = '', excedido = false;
    req.on('data', (c) => { cuerpo += c; if (cuerpo.length > MAX_BYTES) { excedido = true; req.destroy(); } });
    req.on('end', async () => {
      if (excedido) return;
      let zpl = '';
      try { zpl = String(JSON.parse(cuerpo).zpl || ''); } catch { return responder(res, origen, 400, { ok: false, error: 'Datos inválidos' }); }
      // Solo comandos ZPL de etiquetas: debe empezar con ^XA y no puede traer comandos de configuración permanente (^JU, ~SD guardan en la impresora)
      if (!/^\s*\^XA/.test(zpl)) return responder(res, origen, 400, { ok: false, error: 'La etiqueta no es válida' });
      if (/\^JU|\^JJ|~JS|\^MP|\^SC|\^SS/i.test(zpl)) return responder(res, origen, 400, { ok: false, error: 'Comandos de configuración no permitidos' });
      const archivo = path.join(os.tmpdir(), `etiqueta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.zpl`);
      fs.writeFileSync(archivo, zpl, 'latin1');
      const r = await powershell(['-Archivo', archivo]);
      fs.unlink(archivo, () => { });
      if (!r.ok) return responder(res, origen, 502, { ok: false, error: r.error || 'No se pudo imprimir' });
      return responder(res, origen, 200, { ok: true, bytes: zpl.length });
    });
    return;
  }
  res.writeHead(404); res.end();
});

servidor.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `El agente ya está corriendo (puerto ${PUERTO} ocupado).` : e.message); process.exit(1); });
servidor.listen(PUERTO, '127.0.0.1', () => console.log(`Agente de etiquetas de Azkell listo en http://127.0.0.1:${PUERTO}`));
