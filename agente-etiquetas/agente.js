// Agente de etiquetas de Azkell Fleet: corre en la PC del almacén, la que tiene la etiquetadora conectada por USB.
// Consulta al servidor de Azkell (solo hacia afuera, no abre puertos) y, cuando un usuario manda imprimir etiquetas, las imprime.
// Configuración: agente-etiquetas/config.json  →  { "servidor": "https://marsisa.azkell.com", "clave": "ak_live_..." }
// La clave se crea en Sistema › API y desarrolladores, con el permiso «Etiquetadora del almacén».
// Uso:  node agente-etiquetas/agente.js     (o iniciar-agente.bat). No usa librerías externas.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const SCRIPT = path.join(__dirname, 'imprimir-usb.ps1');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { /* sin archivo: se usan las variables de entorno */ }
const SERVIDOR = String(process.env.ETIQUETAS_SERVIDOR || cfg.servidor || '').replace(/\/+$/, '');
const CLAVE = String(process.env.ETIQUETAS_CLAVE || cfg.clave || '').trim();
if (!/^https?:\/\//.test(SERVIDOR) || !CLAVE) {
  console.error('Falta la configuración. Copia config.ejemplo.json como config.json y completa «servidor» y «clave».');
  process.exit(1);
}

const hora = () => new Date().toLocaleTimeString('es-PE');
const log = (...a) => console.log(`[${hora()}]`, ...a);
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const cab = { 'X-API-Key': CLAVE, 'Content-Type': 'application/json' };

function imprimirUsb(zpl) {
  const archivo = path.join(os.tmpdir(), `etiqueta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.zpl`);
  fs.writeFileSync(archivo, zpl, 'latin1');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Archivo', archivo], { timeout: 25000, windowsHide: true }, (err, _out, errOut) => {
      fs.unlink(archivo, () => { });
      resolve(err ? { ok: false, error: String(errOut || err.message).split('\n')[0].trim().slice(0, 180) } : { ok: true });
    });
  });
}

async function avisar(id, resultado) {
  try { await fetch(`${SERVIDOR}/api/v1/etiquetas/resultado`, { method: 'POST', headers: cab, body: JSON.stringify({ id, ...resultado }), signal: AbortSignal.timeout(15000) }); }
  catch (e) { log('No se pudo avisar el resultado:', e.message); }
}

async function ciclo() {
  let espera = 3000;
  for (;;) {
    try {
      // Consulta larga: el servidor contesta apenas hay etiquetas (o a los 25 s sin nada)
      const r = await fetch(`${SERVIDOR}/api/v1/etiquetas/siguiente`, { headers: cab, signal: AbortSignal.timeout(40000) });
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

log(`Agente de etiquetas de Azkell — servidor ${SERVIDOR}`);
ciclo();
