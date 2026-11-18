// SIRE de SUNAT (Sistema Integrado de Registros Electrónicos: registro de ventas RVIE y de compras RCE).
// Se conecta DIRECTO con la API de SUNAT (no pasa por APISUNAT): el token se pide con las credenciales de API de SUNAT (client id y secreto)
// más el usuario y la clave SOL (de preferencia un usuario SOL secundario). Aquí: cifrado de los secretos y pedido del token.
const crypto = require('crypto');

const SCOPE_SIRE = 'https://api-sire.sunat.gob.pe';
// Servicios de la API de SUNAT que la credencial puede tener habilitados (el scope identifica al servicio). El de SIRE está confirmado; los demás se comprueban con probarScope().
const SERVICIOS = {
    sire: { nombre: 'SIRE (registros de ventas y compras)', scope: SCOPE_SIRE },
    buzon: { nombre: 'Control de mensajes y alertas (buzón)', scopes: ['https://api.sunat.gob.pe/v1/contribuyente/controlmsg', 'https://api.sunat.gob.pe'] },
    gre: { nombre: 'GRE (guías de remisión)', scope: 'https://api-cpe.sunat.gob.pe' },
};

// SUNAT limita las peticiones por minuto (HTTP 429): se espera y se reintenta unas veces antes de rendirse
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function conReintento(url, opciones) {
    for (let i = 0; ; i++) {
        const res = await fetch(url, opciones());
        if (res.status !== 429 || i >= 3) return res;
        await esperar(Math.max((Number(res.headers.get('retry-after')) || 0) * 1000, 20000));
    }
}

// La clave SOL y el secreto de API se guardan cifrados (AES-256-GCM). La llave sale de SIRE_CIFRADO_CLAVE o, si no existe, de JWT_SECRET.
function llave() {
    const base = String(process.env.SIRE_CIFRADO_CLAVE || process.env.JWT_SECRET || '');
    if (!base) throw Object.assign(new Error('Falta JWT_SECRET en el servidor: no se pueden guardar credenciales cifradas.'), { status: 500 });
    return crypto.createHash('sha256').update(base).digest();
}

function cifrar(texto) {
    if (!texto) return '';
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', llave(), iv);
    const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
    return 'enc:v1:' + Buffer.concat([iv, c.getAuthTag(), datos]).toString('base64');
}

/** Devuelve el texto original; si el valor no está cifrado (o no se puede descifrar) devuelve '' para no usar basura como credencial */
function descifrar(valor) {
    const v = String(valor || '');
    if (!v) return '';
    if (!v.startsWith('enc:v1:')) return v;
    try {
        const b = Buffer.from(v.slice(7), 'base64');
        const d = crypto.createDecipheriv('aes-256-gcm', llave(), b.subarray(0, 12));
        d.setAuthTag(b.subarray(12, 28));
        return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    } catch (e) {
        return '';
    }
}

/**
 * Pide un token de acceso al SIRE. cfg: { ruc, usuario, clave, clientId, clientSecret }.
 * El token no se guarda: esta función sirve para comprobar que las credenciales funcionan.
 */
async function obtenerToken(cfg, scope = SCOPE_SIRE) {
    const url = `https://api-seguridad.sunat.gob.pe/v1/clientessol/${encodeURIComponent(cfg.clientId)}/oauth2/token/`;
    const cuerpo = new URLSearchParams({
        grant_type: 'password', scope, client_id: cfg.clientId, client_secret: cfg.clientSecret,
        username: `${cfg.ruc}${cfg.usuario}`, password: cfg.clave,
    });
    try {
        const res = await conReintento(url, () => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: cuerpo.toString(), signal: AbortSignal.timeout(20000) }));
        const datos = await res.json().catch(() => ({}));
        if (!res.ok || datos.error || !datos.access_token) {
            return { ok: false, status: res.status, error: String(datos.error_description || datos.message || datos.error || `HTTP ${res.status}`).slice(0, 300) };
        }
        return { ok: true, token: datos.access_token, expires_in: Number(datos.expires_in) || 0, token_type: datos.token_type || 'Bearer' };
    } catch (e) {
        return { ok: false, error: e && e.name === 'TimeoutError' ? 'SUNAT no respondió a tiempo. Inténtalo de nuevo.' : `No se pudo comunicar con SUNAT: ${e.message}` };
    }
}


// ───────────────────────── Descarga de la propuesta (ventas RVIE y compras RCE) ─────────────────────────
// Flujo oficial (manuales de SUNAT): 1) pedir la propuesta del período → ticket; 2) consultar el estado del ticket hasta «Terminado»; 3) descargar el archivo (ZIP con un TXT).
const BASE = 'https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros';
const TICKETS = BASE + '/rvierce/gestionprocesosmasivos/web/masivo';
const LIBROS = {
    VENTAS: { cod: '140000', url: p => `${BASE}/rvie/propuesta/web/propuesta/${p}/exportapropuesta?codTipoArchivo=0` },
    COMPRAS: { cod: '080000', url: p => `${BASE}/rce/propuesta/web/propuesta/${p}/exportacioncomprobantepropuesta?codTipoArchivo=0&codOrigenEnvio=2` },
};
const ESTADO_FIN = ['06', '04'];     // Terminado / Procesado sin errores
const ESTADO_ERROR = ['03'];         // Procesado con errores
const espera = ms => new Promise(r => setTimeout(r, ms));

async function llamar(url, token, binario = false) {
    const res = await conReintento(url, () => ({ headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }));
    if (binario && res.ok) return { ok: true, status: res.status, buffer: Buffer.from(await res.arrayBuffer()) };
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
        const errs = Array.isArray(datos.errors) ? datos.errors.map(e => `${e.cod || ''} ${e.msg || ''}`.trim()).join('; ') : '';
        return { ok: false, status: res.status, error: (errs || datos.msg || datos.message || `HTTP ${res.status}`).slice(0, 300), cod: datos.errors && datos.errors[0] && datos.errors[0].cod };
    }
    return { ok: true, status: res.status, datos };
}

/** Descarga la propuesta de un período: { ok, texto, archivo } o { ok: false, error, vacio }. alAvanzar(texto) informa el progreso. */
async function descargarPropuesta(cfg, libro, periodo, alAvanzar = () => {}) {
    const L = LIBROS[libro];
    if (!L) return { ok: false, error: 'Libro no válido.' };
    if (!/^\d{6}$/.test(periodo)) return { ok: false, error: 'El período debe ser AAAAMM.' };
    alAvanzar('Conectando con SUNAT…');
    const t = await obtenerToken(cfg);
    if (!t.ok) return { ok: false, error: `SUNAT respondió: ${t.error}` };
    alAvanzar('Pidiendo la propuesta…');
    const pedido = await llamar(L.url(periodo), t.token);
    if (!pedido.ok) return { ok: false, error: pedido.error, vacio: pedido.cod === '1070' || /1070/.test(pedido.error || '') };
    const ticket = pedido.datos && (pedido.datos.numTicket || pedido.datos.ticket);
    if (!ticket) return { ok: false, error: 'SUNAT no devolvió el número de ticket.' };
    // El archivo no es inmediato: se consulta el estado del ticket hasta que SUNAT lo termine
    let reg = null;
    for (let i = 0; i < 60; i++) {
        await espera(i === 0 ? 1200 : i < 4 ? 2500 : 5000);
        alAvanzar(`SUNAT está preparando el archivo… (${i + 1})`);
        const e = await llamar(`${TICKETS}/consultaestadotickets?perIni=${periodo}&perFin=${periodo}&page=1&perPage=20&numTicket=${encodeURIComponent(ticket)}`, t.token);
        if (!e.ok) return { ok: false, error: e.error };
        reg = e.datos && Array.isArray(e.datos.registros) ? e.datos.registros.find(r => r.numTicket === ticket) || e.datos.registros[0] : null;
        const est = reg && String((reg.detalleTicket && reg.detalleTicket.codEstadoEnvio) || reg.codEstadoProceso || '');
        if (est && ESTADO_ERROR.includes(est)) return { ok: false, error: `SUNAT procesó el pedido con errores (${(reg.detalleTicket && reg.detalleTicket.desEstadoEnvio) || est}).` };
        if (est && ESTADO_FIN.includes(est)) break;
        reg = null;
    }
    if (!reg) return { ok: false, error: 'SUNAT aún no terminó de preparar el archivo. Vuelve a intentarlo en unos minutos.' };
    const a = (reg.archivoReporte || [])[0] || {};
    if (!a.nomArchivoReporte) return { ok: false, error: 'SUNAT no entregó el nombre del archivo.' };
    alAvanzar('Descargando el archivo…');
    const q = new URLSearchParams({ nomArchivoReporte: a.nomArchivoReporte, codTipoArchivoReporte: a.codTipoAchivoReporte == null ? '0' : String(a.codTipoAchivoReporte), perTributario: periodo, codProceso: String(reg.codProceso), numTicket: ticket, codLibro: L.cod });
    const f = await llamar(`${TICKETS}/archivoreporte?${q.toString()}`, t.token, true);
    if (!f.ok) return { ok: false, error: f.error || 'No se pudo descargar el archivo.' };
    const b = f.buffer;
    const bruto = b.length > 1 && b[0] === 0x50 && b[1] === 0x4b ? require('./gre_pdf').primerArchivoZip(b) : b;
    return { ok: true, texto: bruto.toString('utf8').replace(/^\uFEFF/, ''), archivo: a.nomArchivoContenido || a.nomArchivoReporte, ticket };
}


// ───────────────────────── Credenciales guardadas y lectura del archivo ─────────────────────────
/** Credenciales del SIRE de la empresa (la clave SOL y el secreto se descifran aquí, solo en el servidor). p: pool con promesas. */
async function credencialesDe(p) {
    const [rows] = await p.query("SELECT clave, valor FROM integraciones_api WHERE clave LIKE 'sire\\_%'");
    const m = {}; (rows || []).forEach(r => { m[r.clave] = r.valor || ''; });
    return { ruc: m.sire_ruc, usuario: m.sire_usuario_sol, clientId: m.sire_client_id, clientSecret: descifrar(m.sire_client_secret), clave: descifrar(m.sire_clave_sol) };
}
const faltantes = c => [!/^\d{11}$/.test(c.ruc || '') && 'el RUC', !c.usuario && 'el usuario SOL', !c.clave && 'la clave SOL', !c.clientId && 'el Client ID', !c.clientSecret && 'el Client Secret'].filter(Boolean);

const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const num = v => { const n = Number(String(v ?? '').replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; };
const fechaIso = v => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

/**
 * Convierte el TXT de la propuesta (columnas separadas por «|», primera línea = cabecera) en filas normalizadas para sire_comprobantes.
 * Ventas y compras traen columnas distintas: aquí se unifican en base, IGV, exonerado/inafecto, otros y total; el resto va en datos (pares etiqueta-valor).
 */
function parsearPropuesta(libro, periodo, texto) {
    const lineas = String(texto || '').split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return [];
    const etiquetas = lineas[0].split('|').map(x => x.replace(/^\uFEFF/, '').trim());
    const claves = etiquetas.map(norm);
    const ventas = libro === 'VENTAS';
    return lineas.slice(1).map(l => {
        const v = l.split('|');
        const o = {}; claves.forEach((k, i) => { o[k] = (v[i] || '').trim(); });
        const datos = etiquetas.map((e, i) => [e, (v[i] || '').trim()]).filter(([e, x]) => x && !/^clu\d*$/.test(norm(e)));
        const g = (...ks) => { for (const k of ks) if (o[k] !== undefined && o[k] !== '') return o[k]; return ''; };
        return {
            libro, periodo, car_sunat: g('car sunat') || null,
            fecha_emision: fechaIso(g('fecha de emision')), fecha_vencimiento: fechaIso(g('fecha vcto/pago')),
            tipo_cp: g('tipo cp/doc.') || null, serie: g('serie del cdp') || null, anio_dua: g('ano') || null,
            numero: g('nro cp o doc. nro inicial (rango)') || null, numero_final: g('nro final (rango)') || null,
            doc_tipo: g('tipo doc identidad') || null, doc_numero: g('nro doc identidad') || null, razon_social: g('apellidos nombres/ razon social') || null,
            base_gravada: ventas ? num(o['bi gravada']) : num(o['bi gravado dg']) + num(o['bi gravado dgng']) + num(o['bi gravado dng']),
            igv: ventas ? num(o['igv / ipm']) : num(o['igv / ipm dg']) + num(o['igv / ipm dgng']) + num(o['igv / ipm dng']),
            exo_ina: ventas ? num(o['mto exonerado']) + num(o['mto inafecto']) + num(o['valor facturado exportacion']) : num(o['valor adq. ng']),
            otros: ventas ? num(o['isc']) + num(o['icbper']) + num(o['otros tributos']) : num(o['isc']) + num(o['icbper']) + num(o['otros trib/ cargos']),
            total: num(o['total cp']), moneda: g('moneda') || null, tipo_cambio: num(g('tipo cambio', 'tipo de cambio')) || null,
            mod_fecha: fechaIso(g('fecha emision doc modificado')), mod_tipo: g('tipo cp modificado') || null, mod_serie: g('serie cp modificado') || null, mod_numero: g('nro cp modificado') || null,
            detraccion: ventas ? null : (g('detraccion') || null), tipo_nota: g('tipo de nota') || null, estado_comp: g('est. comp') || null,
            datos_json: JSON.stringify(datos),
        };
    });
}

/**
 * Comprueba si SUNAT entrega un token para un servicio: solo pide el token (no consulta nada). Con varios scopes posibles, prueba uno por uno.
 * Devuelve { ok, scope } con el que funcionó, o { ok: false, error, probados }.
 */
async function probarServicio(cfg, clave) {
    const sv = SERVICIOS[clave];
    if (!sv) return { ok: false, error: 'Servicio desconocido.' };
    const lista = sv.scopes || [sv.scope];
    let ultimo = null;
    for (const scope of lista) {
        const r = await obtenerToken(cfg, scope);
        if (r.ok) return { ok: true, scope, expires_in: r.expires_in };
        ultimo = r;
        // Si las credenciales mismas fallan, probar otro scope no sirve de nada
        if (!/scope/i.test(String(r.error || ''))) break;
        await new Promise(x => setTimeout(x, 1500));
    }
    return { ok: false, error: ultimo ? ultimo.error : 'Sin respuesta', probados: lista };
}

module.exports = { SCOPE_SIRE, SERVICIOS, probarServicio, LIBROS, cifrar, descifrar, obtenerToken, descargarPropuesta, credencialesDe, faltantes, parsearPropuesta };
