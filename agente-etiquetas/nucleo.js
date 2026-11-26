// Núcleo del agente de etiquetas: consulta al servidor de Azkell y manda a la etiquetadora USB lo que pidan los usuarios.
// Lo usan agente.js (para correrlo con Node) y exe-main.js (el instalador .exe). Sin librerías externas.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * @param {{ servidor: string, clave: string, scriptPs1: string, log?: (...a: unknown[]) => void }} o
 * Corre sin parar: consulta larga al servidor (contesta apenas hay etiquetas o a los 25 s) y avisa el resultado de cada una.
 */
async function iniciarAgente({ servidor, clave, scriptPs1, log = console.log }) {
  const base = String(servidor).replace(/\/+$/, '');
  const cab = { 'X-API-Key': clave, 'Content-Type': 'application/json' };

  const imprimirUsb = (zpl) => {
    const archivo = path.join(os.tmpdir(), `etiqueta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.zpl`);
    fs.writeFileSync(archivo, zpl, 'latin1');
    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPs1, '-Archivo', archivo],
        { timeout: 25000, windowsHide: true }, (err, _out, errOut) => {
          fs.unlink(archivo, () => { });
          resolve(err ? { ok: false, error: String(errOut || err.message).split('\n')[0].trim().slice(0, 180) } : { ok: true });
        });
    });
  };

  const avisar = async (id, resultado) => {
    try { await fetch(`${base}/api/v1/etiquetas/resultado`, { method: 'POST', headers: cab, body: JSON.stringify({ id, ...resultado }), signal: AbortSignal.timeout(15000) }); }
    catch (e) { log('No se pudo avisar el resultado:', e.message); }
  };

  log(`Agente de etiquetas de Azkell — servidor ${base}`);
  let espera = 3000;
  for (;;) {
    try {
      const r = await fetch(`${base}/api/v1/etiquetas/siguiente`, { headers: cab, signal: AbortSignal.timeout(40000) });
      if (r.status === 204) { espera = 1000; await dormir(espera); continue; }
      if (r.status === 401 || r.status === 403) {
        const j = await r.json().catch(() => ({}));
        log('El servidor rechazó la llave:', j.error || r.status, '— reintento en 30 s');
        await dormir(30000); continue;
      }
      if (!r.ok) { log('El servidor respondió', r.status); await dormir(10000); continue; }
      const trabajo = await r.json();
      log('Etiqueta recibida', trabajo.id, `(${trabajo.zpl.length} bytes)`);
      const res = await imprimirUsb(trabajo.zpl);
      log(res.ok ? 'Impresa' : 'Error: ' + res.error);
      await avisar(trabajo.id, res);
      espera = 500;
    } catch (e) {
      log('Sin conexión con el servidor:', e.message, '— reintento en 10 s');
      espera = 10000;
    }
    await dormir(espera);
  }
}

module.exports = { iniciarAgente };
