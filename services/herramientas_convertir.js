'use strict';
// Conversión de documentos de Herramientas PDF que no se pueden hacer bien dentro del navegador.
// Los archivos pasan por NUESTRO servidor (nunca por un tercero), viven solo en una carpeta temporal durante la conversión
// y se borran al terminar (con éxito o con error). No se guardan en S3 ni en la base de datos.
//
//   Word / PowerPoint / Excel → PDF       LibreOffice (soffice)
//   PDF → Word / PowerPoint               LibreOffice (importador de PDF de Draw)
//   HTML → PDF                            Chromium del servidor (sin JavaScript y sin salir a internet)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SOFFICE = process.env.SOFFICE_PATH || 'soffice';
const PERFIL_LO = path.join(os.tmpdir(), 'azkell-lo-perfil'); // el perfil se comparte: arrancar LibreOffice con perfil nuevo tarda segundos
const LIMITE_MS = 120000;
const RUTA_CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';

/** Destinos que se pueden pedir: qué extensiones acepta cada uno, con qué motor y qué sale */
const DESTINOS = {
    pdf: { motor: 'lo', entradas: ['doc', 'docx', 'odt', 'rtf', 'txt', 'ppt', 'pptx', 'odp', 'xls', 'xlsx', 'ods', 'csv'], salida: 'pdf', mime: 'application/pdf', convertTo: 'pdf' },
    docx: { motor: 'lo', entradas: ['pdf'], salida: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', convertTo: 'docx:MS Word 2007 XML', infiltro: 'writer_pdf_import' },
    pptx: { motor: 'lo', entradas: ['pdf'], salida: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', convertTo: 'pptx:Impress MS PowerPoint 2007 XML', infiltro: 'impress_pdf_import' },
    'pdf-html': { motor: 'chromium', entradas: ['html', 'htm'], salida: 'pdf', mime: 'application/pdf' },
};

const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const extensionDe = nombre => (String(nombre || '').split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Corre un programa con límite de tiempo; devuelve el código de salida y lo que escribió en pantalla */
function ejecutar(comando, args, limiteMs = LIMITE_MS) {
    return new Promise(resolve => {
        let salida = '';
        let terminado = false;
        let proc;
        try { proc = spawn(comando, args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
        catch (e) { return resolve({ codigo: -1, salida: String(e.message), noExiste: true }); }
        const fin = r => { if (terminado) return; terminado = true; clearTimeout(t); resolve(r); };
        const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) { /* ya terminó */ } fin({ codigo: -2, salida: 'tiempo agotado' }); }, limiteMs);
        proc.stdout.on('data', d => { if (salida.length < 4000) salida += d; });
        proc.stderr.on('data', d => { if (salida.length < 4000) salida += d; });
        proc.on('error', e => fin({ codigo: -1, salida: String(e.message), noExiste: e.code === 'ENOENT' }));
        proc.on('close', codigo => fin({ codigo, salida }));
    });
}

/**
 * En Linux LibreOffice corre con prioridad baja (nice 10): si alguien convierte un documento grande en hora pico,
 * la app y la base de datos siguen respondiendo igual. En Windows (desarrollo) se lanza directo.
 */
function conPrioridadBaja(comando, args) {
    return process.platform === 'win32' ? { comando, args } : { comando: 'nice', args: ['-n', '10', comando, ...args] };
}

// LibreOffice atiende una conversión a la vez (comparten perfil): las demás esperan su turno
let cola = Promise.resolve();
function enCola(fn) {
    const p = cola.then(fn, fn);
    cola = p.catch(() => { /* el error le llega a quien lo pidió */ });
    return p;
}

let ultimoEstado = null;
/** Qué motores hay en este servidor (se guarda un minuto para no lanzar procesos a cada consulta) */
async function estado() {
    if (ultimoEstado && Date.now() - ultimoEstado.en < 60000) return ultimoEstado.valor;
    const lo = await ejecutar(SOFFICE, ['--version'], 15000);
    const valor = {
        libreoffice: lo.codigo === 0,
        chromium: fs.existsSync(RUTA_CHROME),
        destinos: Object.keys(DESTINOS).filter(d => (DESTINOS[d].motor === 'lo' ? lo.codigo === 0 : fs.existsSync(RUTA_CHROME))),
    };
    ultimoEstado = { en: Date.now(), valor };
    return valor;
}

/** Revisa que el contenido sea de verdad lo que dice la extensión (no basta con el nombre) */
function validarContenido(ext, buffer) {
    const empieza = (...bytes) => bytes.every((b, i) => buffer[i] === b);
    if (ext === 'pdf' && !empieza(0x25, 0x50, 0x44, 0x46)) throw error('El archivo no es un PDF válido.');
    if (['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods'].includes(ext) && !empieza(0x50, 0x4b)) throw error(`El archivo no es un .${ext} válido.`);
    if (['doc', 'ppt', 'xls'].includes(ext) && !empieza(0xd0, 0xcf, 0x11, 0xe0)) throw error(`El archivo no es un .${ext} válido.`);
}

async function convertirConLibreOffice(buffer, ext, destino) {
    const carpeta = path.join(os.tmpdir(), `azkell-conv-${crypto.randomBytes(8).toString('hex')}`);
    fs.mkdirSync(carpeta, { recursive: true });
    try {
        const entrada = path.join(carpeta, `entrada.${ext}`);
        fs.writeFileSync(entrada, buffer);
        const args = ['--headless', '--norestore', '--nologo', '--nodefault', '--nolockcheck', `-env:UserInstallation=file://${PERFIL_LO.replace(/\\/g, '/')}`];
        if (destino.infiltro) args.push(`--infilter=${destino.infiltro}`);
        args.push('--convert-to', destino.convertTo, '--outdir', carpeta, entrada);
        const { comando, args: argsFinal } = conPrioridadBaja(SOFFICE, args);
        const r = await enCola(() => ejecutar(comando, argsFinal));
        // 127 = el programa no existe (con «nice» por delante, el sistema lo informa así en vez de fallar al lanzarlo)
        if (r.noExiste || r.codigo === 127) throw error('Este servidor no tiene LibreOffice instalado: la conversión no está disponible.', 501);
        if (r.codigo === -2) throw error('La conversión tardó demasiado y se canceló. Prueba con un archivo más pequeño.', 504);
        const salida = path.join(carpeta, `entrada.${destino.salida}`);
        if (!fs.existsSync(salida) || fs.statSync(salida).size === 0) throw error('No se pudo convertir el archivo (puede estar dañado o protegido con contraseña).', 422);
        return fs.readFileSync(salida);
    } finally {
        fs.rmSync(carpeta, { recursive: true, force: true });
    }
}

/** HTML → PDF con el Chromium del servidor: sin JavaScript y sin salir a internet (solo lo que viene dentro del propio archivo) */
async function convertirHtml(buffer) {
    if (!fs.existsSync(RUTA_CHROME)) throw error('Este servidor no tiene Chromium: la conversión no está disponible.', 501);
    const puppeteer = require('puppeteer-core');
    const navegador = await puppeteer.launch({ executablePath: RUTA_CHROME, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    try {
        const pagina = await navegador.newPage();
        await pagina.setJavaScriptEnabled(false);
        await pagina.setRequestInterception(true);
        pagina.on('request', req => { const u = req.url(); if (u.startsWith('data:') || u === 'about:blank') req.continue(); else req.abort(); });
        await pagina.setContent(buffer.toString('utf8'), { waitUntil: 'load', timeout: 30000 });
        return Buffer.from(await pagina.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } }));
    } finally {
        await navegador.close().catch(() => { /* ya cerrado */ });
    }
}

/** Convierte `buffer` (archivo `nombre`) al `destino` pedido. Devuelve { buffer, mime, extension }. */
async function convertir({ buffer, nombre, destino }) {
    const d = DESTINOS[destino];
    if (!d) throw error('Conversión no disponible.');
    const ext = extensionDe(nombre);
    if (!d.entradas.includes(ext)) throw error(`Este tipo de archivo (.${ext || '?'}) no se puede convertir aquí. Se aceptan: ${d.entradas.map(e => '.' + e).join(', ')}.`);
    if (!buffer || !buffer.length) throw error('El archivo está vacío.');
    validarContenido(ext, buffer);
    const salida = d.motor === 'chromium' ? await convertirHtml(buffer) : await convertirConLibreOffice(buffer, ext, d);
    return { buffer: salida, mime: d.mime, extension: d.salida };
}

module.exports = { convertir, estado, DESTINOS, extensionDe, conPrioridadBaja };
