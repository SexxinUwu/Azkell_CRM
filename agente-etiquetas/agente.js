// Agente de etiquetas de Azkell Fleet para correrlo con Node (el instalador .exe usa el mismo núcleo).
// Configuración: agente-etiquetas/config.json  →  { "servidor": "https://marsisa.azkell.com", "clave": "ak_live_..." }
// Uso:  node agente-etiquetas/agente.js     (o iniciar-agente.bat)
const fs = require('fs');
const path = require('path');
const { iniciarAgente } = require('./nucleo');

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { /* sin archivo: se usan las variables de entorno */ }
const servidor = String(process.env.ETIQUETAS_SERVIDOR || cfg.servidor || '').replace(/\/+$/, '');
const clave = String(process.env.ETIQUETAS_CLAVE || cfg.clave || '').trim();
if (!/^https?:\/\//.test(servidor) || !clave) {
  console.error('Falta la configuración. Copia config.ejemplo.json como config.json y completa «servidor» y «clave».');
  process.exit(1);
}
const hora = () => new Date().toLocaleTimeString('es-PE');
iniciarAgente({ servidor, clave, scriptPs1: path.join(__dirname, 'imprimir-usb.ps1'), log: (...a) => console.log(`[${hora()}]`, ...a) });
