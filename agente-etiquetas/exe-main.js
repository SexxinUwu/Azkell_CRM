// Instalador y agente de la etiquetadora de Azkell Fleet, empaquetado en un solo .exe (Node SEA).
//  · Sin argumentos: instala (copia el programa, lo deja arrancando solo con Windows), lo inicia y comprueba la conexión.
//  · --servicio: es el agente en segundo plano (lo lanza Windows al iniciar sesión; no muestra ventana).
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const readline = require('readline');
const { spawn, execFileSync } = require('child_process');
const sea = require('node:sea');
const { iniciarAgente } = require('./nucleo');

const NOMBRE = 'AzkellEtiquetadora';
const dirInst = path.join(process.env.LOCALAPPDATA || os.homedir(), NOMBRE);
const exeInst = path.join(dirInst, `${NOMBRE}.exe`);
const rutaCfg = path.join(dirInst, 'config.json');
const rutaPs1 = path.join(dirInst, 'imprimir-usb.ps1');
const rutaLog = path.join(dirInst, 'agente.log');
const dirInicio = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const rutaVbs = path.join(dirInicio, 'Azkell Etiquetadora.vbs');
const PUERTO_UNICO = 39101; // una sola copia del agente por PC

const hora = () => new Date().toLocaleString('es-PE');
function log(...a) {
  const linea = `[${hora()}] ${a.join(' ')}\n`;
  try {
    if (fs.existsSync(rutaLog) && fs.statSync(rutaLog).size > 500 * 1024) fs.renameSync(rutaLog, rutaLog + '.1');
    fs.appendFileSync(rutaLog, linea);
  } catch { /* sin log */ }
  if (process.stdout.isTTY) process.stdout.write(linea);
}
const asset = (nombre) => { try { return sea.getAsset(nombre, 'utf8'); } catch { return null; } };
const leerCfg = () => { try { return JSON.parse(fs.readFileSync(rutaCfg, 'utf8')); } catch { return null; } };
const pregunta = (texto) => new Promise((resolve) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(texto, (r) => { rl.close(); resolve(r.trim()); }); });
const esperarEnter = () => pregunta('\nPresiona Enter para cerrar esta ventana…');

// ── Modo agente (en segundo plano) ───────────────────────────────────────────────
async function servicio() {
  const cfg = leerCfg();
  if (!cfg || !cfg.servidor || !cfg.clave) { log('Falta la configuración (config.json).'); process.exit(1); }
  // Una sola copia: si el puerto ya está tomado, ya hay un agente corriendo
  const cerrojo = net.createServer();
  cerrojo.on('error', () => { log('Ya hay un agente corriendo. Esta copia se cierra.'); process.exit(0); });
  cerrojo.listen(PUERTO_UNICO, '127.0.0.1', () => {
    log('Agente iniciado.');
    iniciarAgente({ servidor: cfg.servidor, clave: cfg.clave, scriptPs1: rutaPs1, log });
  });
}

// ── Modo instalador ──────────────────────────────────────────────────────────────
async function instalar() {
  console.log('==============================================');
  console.log('  Etiquetadora de Azkell Fleet - Instalación');
  console.log('==============================================\n');
  fs.mkdirSync(dirInst, { recursive: true });

  // 1. Configuración: la que trae el programa, la ya instalada o, si no hay ninguna, se pregunta
  let cfg = null;
  const incluida = asset('config.json');
  if (incluida) { try { cfg = JSON.parse(incluida); } catch { /* ignorar */ } }
  if (!cfg) cfg = leerCfg();
  if (!cfg || !cfg.servidor || !cfg.clave) {
    const servidor = (await pregunta('Dirección del sistema [https://marsisa.azkell.com]: ')) || 'https://marsisa.azkell.com';
    const clave = await pregunta('Llave de la etiquetadora (se crea en Sistema > API y desarrolladores): ');
    cfg = { servidor, clave };
  }
  if (!/^https?:\/\//.test(cfg.servidor) || !cfg.clave) { console.log('Falta la dirección o la llave. No se instaló nada.'); return esperarEnter(); }

  // 2. Si ya había una copia corriendo, se detiene (para poder reemplazarla)
  try { execFileSync('taskkill', ['/F', '/IM', `${NOMBRE}.exe`, '/FI', `PID ne ${process.pid}`], { stdio: 'ignore', windowsHide: true }); } catch { /* no había ninguna */ }
  await new Promise(r => setTimeout(r, 1200));

  // 3. Archivos: el programa, el script de impresión y la configuración
  console.log('1/4  Copiando el programa…');
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(exeInst).toLowerCase()) fs.copyFileSync(process.execPath, exeInst);
  const ps1 = asset('imprimir-usb.ps1');
  if (!ps1) { console.log('El instalador está incompleto (falta imprimir-usb.ps1).'); return esperarEnter(); }
  fs.writeFileSync(rutaPs1, ps1, 'utf8');
  fs.writeFileSync(rutaCfg, JSON.stringify({ servidor: cfg.servidor, clave: cfg.clave }, null, 2));

  // 4. Arranque automático con Windows (sin ventana)
  console.log('2/4  Dejándolo configurado para que arranque solo con Windows…');
  fs.mkdirSync(dirInicio, { recursive: true });
  fs.writeFileSync(rutaVbs, `' Etiquetadora de Azkell Fleet: arranca el agente sin ventana\r\nCreateObject("WScript.Shell").Run """${exeInst}"" --servicio", 0, False\r\n`, 'latin1');

  // 5. Iniciarlo ya
  console.log('3/4  Iniciando el programa…');
  spawn(exeInst, ['--servicio'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();

  // 6. Comprobaciones: impresora USB y conexión/llave con el servidor
  console.log('4/4  Comprobando la impresora y la conexión…\n');
  let impresora = false;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', rutaPs1, '-Listar'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
    impresora = /IMPRESORA /.test(out);
  } catch { /* sin respuesta */ }
  let conexion = 'sin-internet';
  try {
    // La consulta del agente espera hasta 25 s si no hay etiquetas: si no responde error en 4 s, la llave es válida
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${cfg.servidor.replace(/\/+$/, '')}/api/v1/etiquetas/siguiente`, { headers: { 'X-API-Key': cfg.clave }, signal: ctrl.signal }).catch(e => (e.name === 'AbortError' ? 'espera' : null));
    clearTimeout(t);
    if (r === 'espera') conexion = 'ok';
    else if (r && (r.status === 401 || r.status === 403)) conexion = 'llave';
    else if (r && (r.status === 204 || r.ok)) conexion = 'ok';
    else if (r) conexion = 'servidor';
  } catch { /* sin internet */ }

  console.log(impresora ? '  [OK]  Etiquetadora detectada por USB.' : '  [!!]  No se detecta la etiquetadora por USB. Revisa que esté encendida y con el cable conectado.');
  if (conexion === 'ok') console.log('  [OK]  Conectado con el sistema.');
  else if (conexion === 'llave') console.log('  [!!]  El sistema rechazó la llave. Pide una nueva a soporte.');
  else if (conexion === 'servidor') console.log('  [!!]  El sistema no respondió como se esperaba. Intenta de nuevo en unos minutos.');
  else console.log('  [!!]  Sin conexión con el sistema. Revisa el internet de esta PC.');
  console.log(`\nListo. El programa quedó instalado en:\n  ${dirInst}\nArranca solo cada vez que se prende la PC, sin ventanas.`);
  console.log('Desde Inventario > Imprimir ya se pueden mandar etiquetas a esta impresora.');
  return esperarEnter();
}

(process.argv.includes('--servicio') ? servicio() : instalar()).catch((e) => { console.error('Error:', e && e.message); log('Error:', e && e.stack); if (!process.argv.includes('--servicio')) esperarEnter().then(() => process.exit(1)); });
