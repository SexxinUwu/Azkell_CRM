'use strict';
// Conducción por RPM (Operaciones Marsisa): ejecuta en Wialon el informe «10. Detallado de Sensores Para Consumo» de una unidad y un
// rango de fechas, y cuenta cuántas lecturas caen en cada rango de RPM según el modelo de motor. Solo lectura.
// Wialon permite una sola sesión por token: las consultas se hacen una tras otra (cola en este módulo).
const { crearResolutorPlacas } = require('./wialon_placas');
const { credenciales, limpiarPlaca } = require('./wialon_unidad');
const { rangosDe, categoria, META } = require('./rpm_rangos');

const POR_TANDA = 4000;
const MAX_FILAS = 120000;

let cola = Promise.resolve();
/** Ejecuta las tareas de una en una */
function enCola(tarea) {
    const p = cola.then(tarea, tarea);
    cola = p.catch(() => { });
    return p;
}

const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
const consulta = (db, sql, params) => new Promise((resolve) => db.query(sql, params, (err, rows) => resolve(err ? [] : rows)));

/** 'YYYY-MM-DD HH:mm' o 'YYYY-MM-DDTHH:mm' en hora de Lima → segundos unix */
function aUnix(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(texto || '').trim());
    if (!m) return null;
    return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 5, +m[5]) / 1000);
}

async function llamar(baseUrl, svc, params, sid, ms = 60000) {
    const url = `${baseUrl}?svc=${svc}&params=${encodeURIComponent(JSON.stringify(params))}${sid ? `&sid=${sid}` : ''}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return r.json();
}

const numero = (c) => {
    const t = c && typeof c === 'object' ? (c.t ?? c.v) : c;
    const m = String(t ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
};
const textoCelda = (c) => String(c && typeof c === 'object' ? (c.t ?? c.v ?? '') : (c ?? ''));
/** Las horas del informe vienen en UTC (dd.mm.aaaa hh:mm:ss): se pasan a hora de Lima */
function aLima(t) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})/.exec(String(t || ''));
    if (!m) return String(t || '');
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 5, +m[5]));
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
const limpiaCabecera = (h) => String(h || '').replace(/\*/g, '').trim().toLowerCase();

/**
 * Analiza una placa entre dos fechas (hora de Lima). Devuelve los conteos por rango y los porcentajes.
 * Lanza errores con .status y un mensaje claro para la pantalla.
 */
function analizarRpm(db, { placa, desde, hasta }) {
    return enCola(async () => {
        const pl = limpiarPlaca(placa);
        if (pl.length < 5) throw aviso('Elige una placa.');
        const from = aUnix(desde), to = aUnix(hasta);
        if (!from || !to) throw aviso('Indica la fecha y hora de inicio y de fin.');
        if (to <= from) throw aviso('La fecha de fin debe ser posterior a la de inicio.');
        if (to - from > 31 * 86400) throw aviso('El rango máximo es de 31 días por consulta.');

        const { token, baseUrl } = await credenciales(db);
        if (!token) throw aviso('El GPS (Wialon) no está configurado. Guarda el token en Sistema › Integraciones.', 422);

        const filasPlacas = await consulta(db, 'SELECT placa, wialon_name, modelo_motor FROM placas', []);
        const fila = filasPlacas.find(p => limpiarPlaca(p.placa) === pl);
        if (!fila) throw aviso(`La placa ${pl} no está en la flota.`, 404);
        const rangos = rangosDe(fila.modelo_motor);

        let sid = null;
        try {
            const login = await llamar(baseUrl, 'token/login', { token }, null, 15000);
            if (!login || !login.eid) throw aviso('No se pudo conectar con Wialon. Revisa el token en Sistema › Integraciones.', 502);
            sid = login.eid;

            // Plantilla del informe 10 (en el recurso donde esté guardada)
            const recursos = await llamar(baseUrl, 'core/search_items', { spec: { itemsType: 'avl_resource', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' }, force: 1, flags: 8193, from: 0, to: 0 }, sid, 30000);
            let recursoId = null, plantillaId = null, plantillaNombre = '';
            for (const r of (recursos.items || [])) {
                for (const rep of Object.values(r.rep || {})) {
                    const n = String(rep.n || '').toLowerCase();
                    if (n.includes('detallado de sensores') && n.includes('consumo')) { recursoId = r.id; plantillaId = rep.id; plantillaNombre = rep.n; break; }
                }
                if (plantillaId) break;
            }
            if (!plantillaId) throw aviso('No encontré en Wialon el informe «10. Detallado de Sensores Para Consumo».', 422);

            // Unidad de la placa
            const unidades = await llamar(baseUrl, 'core/search_items', { spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' }, force: 1, flags: 1, from: 0, to: 0 }, sid, 30000);
            const resolver = crearResolutorPlacas(filasPlacas);
            const unidad = (unidades.items || []).find(u => resolver(String(u.nm || '')).placa === pl);
            if (!unidad) throw aviso(`No encontré la placa ${pl} en el GPS. Puede estar sin equipo o con otro nombre en Wialon.`, 404);

            const ejec = await llamar(baseUrl, 'report/exec_report', { reportResourceId: recursoId, reportTemplateId: plantillaId, reportObjectId: unidad.id, reportObjectSecId: 0, interval: { from, to, flags: 0 } }, sid, 120000);
            if (ejec && ejec.error) throw aviso(`Wialon no pudo generar el informe (código ${ejec.error}).`, 502);
            const tablas = (ejec.reportResult && ejec.reportResult.tables) || [];
            // La tabla del detalle es la que tiene la columna de RPM y más filas
            let mejor = -1, mejorFilas = -1, colRpm = -1, colMotor = -1, colKm = -1, colFecha = -1;
            tablas.forEach((t, i) => {
                const cab = (t.header || []).map(limpiaCabecera);
                const iR = cab.findIndex(h => h === 'rpm');
                if (iR >= 0 && Number(t.rows) > mejorFilas) {
                    mejor = i; mejorFilas = Number(t.rows); colRpm = iR;
                    colMotor = cab.findIndex(h => h === 'motor'); colKm = cab.findIndex(h => h === 'kilometraje total'); colFecha = cab.findIndex(h => h.startsWith('fecha'));
                }
            });
            if (mejor < 0 || mejorFilas <= 0) {
                return { ok: true, placa: pl, modelo_motor: rangos.modelo, rangos, sin_datos: true, filas_leidas: 0, plantilla: plantillaNombre };
            }
            if (mejorFilas > MAX_FILAS) throw aviso('Demasiadas lecturas para un solo rango. Reduce las fechas.', 413);

            const c = { ralenti: 0, bajo: 0, verde: 0, potencia: 0, sobre: 0 };
            let leidas = 0, conMotor = 0, sumaRpm = 0, rpmMax = 0, kmIni = null, kmFin = null, primera = '', ultima = '';
            for (let desdeFila = 0; desdeFila < mejorFilas; desdeFila += POR_TANDA) {
                const hastaFila = Math.min(mejorFilas - 1, desdeFila + POR_TANDA - 1);
                const filas = await llamar(baseUrl, 'report/select_result_rows', { tableIndex: mejor, config: { type: 'range', data: { from: desdeFila, to: hastaFila, level: 0, unitInfo: 1 } } }, sid, 120000);
                if (!Array.isArray(filas)) throw aviso('Wialon no entregó las lecturas del informe.', 502);
                for (const f of filas) {
                    const celdas = f.c || [];
                    leidas++;
                    if (colFecha >= 0) { const t = textoCelda(celdas[colFecha]); if (!primera) primera = t; ultima = t; }
                    if (colKm >= 0) { const k = numero(celdas[colKm]); if (k != null) { if (kmIni == null) kmIni = k; kmFin = k; } }
                    const rpm = numero(celdas[colRpm]);
                    const motorOn = colMotor >= 0 ? /encendido/i.test(textoCelda(celdas[colMotor])) : true;
                    if (!(rpm > 0) || !motorOn) continue;
                    conMotor++; sumaRpm += rpm; if (rpm > rpmMax) rpmMax = rpm;
                    c[categoria(rpm, rangos.limites)]++;
                }
            }

            const util = c.bajo + c.verde + c.potencia;
            const pct = (n) => (util > 0 ? Math.round((n / util) * 1000) / 10 : 0);
            return {
                ok: true, placa: pl, modelo_motor: rangos.modelo, rangos, plantilla: plantillaNombre,
                desde, hasta, primera_lectura: aLima(primera), ultima_lectura: aLima(ultima),
                filas_leidas: leidas, con_motor: conMotor, conteos: c, util,
                porcentajes: { bajo: pct(c.bajo), verde: pct(c.verde), potencia: pct(c.potencia) },
                meta: META,
                rpm_media: conMotor ? Math.round(sumaRpm / conMotor) : 0, rpm_max: Math.round(rpmMax),
                km_recorridos: kmIni != null && kmFin != null ? Math.round((kmFin - kmIni) * 10) / 10 : null,
            };
        } catch (e) {
            if (e && e.status) throw e;
            console.error('[conduccion-rpm]', e && e.message);
            throw aviso(e && e.name === 'TimeoutError' ? 'Wialon tardó demasiado. Prueba con un rango más corto.' : 'No se pudo consultar Wialon.', 502);
        } finally {
            if (sid) { await llamar(baseUrl, 'report/cleanup_result', {}, sid, 10000).catch(() => { }); await llamar(baseUrl, 'core/logout', {}, sid, 10000).catch(() => { }); }
        }
    });
}

module.exports = { analizarRpm };
