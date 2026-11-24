'use strict';
// Conducción por RPM (Operaciones Marsisa): ejecuta en Wialon el informe «10. Detallado de Sensores Para Consumo» de una unidad y un
// rango de fechas, y reparte las lecturas de RPM en un histograma (por tramos de 10 RPM). Con ese histograma y los rangos vigentes del
// modelo de motor se arma el cuadro (ralentí, bajo torque, zona verde, potencia, sobrerrevolución). Solo lectura.
// Se guarda el histograma (no los porcentajes) para que, si se cambian los rangos del motor, lo ya guardado se recalcule sin volver a Wialon.
// Wialon permite una sola sesión por token: las consultas se hacen una tras otra (cola en este módulo).
const { crearResolutorPlacas } = require('./wialon_placas');
const { credenciales, limpiarPlaca } = require('./wialon_unidad');
const { cargarConfig, rangosDe, clasificar, BIN } = require('./rpm_rangos');

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

// Plantilla del informe 10: se busca una vez y se recuerda un rato (no cambia entre consultas)
let plantillaRec = { t: 0, baseUrl: '', recursoId: null, plantillaId: null, nombre: '' };
async function buscarPlantilla(baseUrl, sid) {
    if (plantillaRec.plantillaId && plantillaRec.baseUrl === baseUrl && Date.now() - plantillaRec.t < 15 * 60000) return plantillaRec;
    const recursos = await llamar(baseUrl, 'core/search_items', { spec: { itemsType: 'avl_resource', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' }, force: 1, flags: 8193, from: 0, to: 0 }, sid, 30000);
    for (const r of (recursos.items || [])) {
        for (const rep of Object.values(r.rep || {})) {
            const n = String(rep.n || '').toLowerCase();
            if (n.includes('detallado de sensores') && n.includes('consumo')) {
                plantillaRec = { t: Date.now(), baseUrl, recursoId: r.id, plantillaId: rep.id, nombre: rep.n };
                return plantillaRec;
            }
        }
    }
    throw aviso('No encontré en Wialon el informe «10. Detallado de Sensores Para Consumo».', 422);
}

/**
 * Ejecuta el informe 10 en una sesión ya abierta y devuelve las mediciones crudas (sin rangos):
 * histograma de RPM por tramos de 10 (toda lectura con RPM mayor a 0), cuántas lecturas, RPM media y máxima, km y primera/última hora.
 * Si Wialon dice que la sesión venció, lanza un error con .sesion = true para que quien llama vuelva a entrar.
 */
async function medirRpm({ baseUrl, sid, unitId, from, to }) {
    const plantilla = await buscarPlantilla(baseUrl, sid);
    const ejec = await llamar(baseUrl, 'report/exec_report', { reportResourceId: plantilla.recursoId, reportTemplateId: plantilla.plantillaId, reportObjectId: unitId, reportObjectSecId: 0, interval: { from, to, flags: 0 } }, sid, 120000);
    if (ejec && (ejec.error === 1 || ejec.error === 4)) throw Object.assign(aviso('La sesión de Wialon venció.', 502), { sesion: true });
    if (ejec && ejec.error) throw aviso(`Wialon no pudo generar el informe (código ${ejec.error}).`, 502);
    try {
        const tablas = (ejec.reportResult && ejec.reportResult.tables) || [];
        // La tabla del detalle es la que tiene la columna de RPM y más filas
        let mejor = -1, mejorFilas = -1, colRpm = -1, colKm = -1, colFecha = -1;
        tablas.forEach((t, i) => {
            const cab = (t.header || []).map(limpiaCabecera);
            const iR = cab.findIndex(h => h === 'rpm');
            if (iR >= 0 && Number(t.rows) > mejorFilas) {
                mejor = i; mejorFilas = Number(t.rows); colRpm = iR;
                colKm = cab.findIndex(h => h === 'kilometraje total'); colFecha = cab.findIndex(h => h.startsWith('fecha'));
            }
        });
        if (mejor < 0 || mejorFilas <= 0) return { sin_datos: true, plantilla: plantilla.nombre, filas_leidas: 0 };
        if (mejorFilas > MAX_FILAS) throw aviso('Demasiadas lecturas para un solo rango. Reduce las fechas.', 413);

        const hist = {};
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
                // Se cuenta toda lectura con RPM (en movimiento o detenido); solo se deja fuera la de RPM 0 (motor apagado)
                if (!(rpm > 0)) continue;
                conMotor++; sumaRpm += rpm; if (rpm > rpmMax) rpmMax = rpm;
                const b = Math.floor(rpm / BIN);
                hist[b] = (hist[b] || 0) + 1;
            }
        }
        return {
            plantilla: plantilla.nombre, filas_leidas: leidas, con_motor: conMotor, hist,
            rpm_media: conMotor ? Math.round(sumaRpm / conMotor) : 0, rpm_max: Math.round(rpmMax),
            km_recorridos: kmIni != null && kmFin != null ? Math.round((kmFin - kmIni) * 10) / 10 : null,
            primera_lectura: aLima(primera), ultima_lectura: aLima(ultima),
        };
    } finally {
        llamar(baseUrl, 'report/cleanup_result', {}, sid, 10000).catch(() => { });
    }
}

/** Con las mediciones crudas, los rangos del motor y la meta vigentes, arma el cuadro que ve la pantalla */
function armarResultado(raw, cfg, modeloMotor, placa) {
    const rangos = rangosDe(cfg, modeloMotor);
    if (!raw || raw.sin_datos || !raw.con_motor) return { ok: true, placa, modelo_motor: rangos.modelo, rangos, sin_datos: true, filas_leidas: 0, plantilla: raw ? raw.plantilla : '' };
    const c = clasificar(raw.hist, rangos.limites);
    const util = c.bajo + c.verde + c.potencia;
    const pct = (n) => (util > 0 ? Math.round((n / util) * 1000) / 10 : 0);
    return {
        ok: true, placa, modelo_motor: rangos.modelo, rangos, plantilla: raw.plantilla,
        primera_lectura: raw.primera_lectura, ultima_lectura: raw.ultima_lectura,
        filas_leidas: raw.filas_leidas, con_motor: raw.con_motor, conteos: c, util,
        porcentajes: { bajo: pct(c.bajo), verde: pct(c.verde), potencia: pct(c.potencia) },
        meta: cfg.meta, rpm_media: raw.rpm_media, rpm_max: raw.rpm_max, km_recorridos: raw.km_recorridos,
    };
}

/**
 * Pantalla «Conducción por RPM»: una placa entre dos fechas (hora de Lima). Abre y cierra su propia sesión de Wialon.
 * Lanza errores con .status y un mensaje claro.
 */
function analizarRpm(db, { placa, desde, hasta, desdeUnix, hastaUnix }) {
    return enCola(async () => {
        const pl = limpiarPlaca(placa);
        if (pl.length < 5) throw aviso('Elige una placa.');
        const unix = v => (Number.isFinite(Number(v)) && Number(v) > 1e9 ? Math.floor(Number(v)) : null);
        const from = unix(desdeUnix) || aUnix(desde), to = unix(hastaUnix) || aUnix(hasta);
        if (!from || !to) throw aviso('Indica la fecha y hora de inicio y de fin.');
        if (to <= from) throw aviso('La fecha de fin debe ser posterior a la de inicio.');
        if (to - from > 31 * 86400) throw aviso('El rango máximo es de 31 días por consulta.');

        const { token, baseUrl } = await credenciales(db);
        if (!token) throw aviso('El GPS (Wialon) no está configurado. Guarda el token en Sistema › Integraciones.', 422);

        const filasPlacas = await consulta(db, 'SELECT placa, wialon_name, modelo_motor FROM placas', []);
        const fila = filasPlacas.find(p => limpiarPlaca(p.placa) === pl);
        if (!fila) throw aviso(`La placa ${pl} no está en la flota.`, 404);
        const cfg = await cargarConfig(db);

        let sid = null;
        try {
            const login = await llamar(baseUrl, 'token/login', { token }, null, 15000);
            if (!login || !login.eid) throw aviso('No se pudo conectar con Wialon. Revisa el token en Sistema › Integraciones.', 502);
            sid = login.eid;
            const unidades = await llamar(baseUrl, 'core/search_items', { spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' }, force: 1, flags: 1, from: 0, to: 0 }, sid, 30000);
            const resolver = crearResolutorPlacas(filasPlacas);
            const unidad = (unidades.items || []).find(u => resolver(String(u.nm || '')).placa === pl);
            if (!unidad) throw aviso(`No encontré la placa ${pl} en el GPS. Puede estar sin equipo o con otro nombre en Wialon.`, 404);
            const raw = await medirRpm({ baseUrl, sid, unitId: unidad.id, from, to });
            return { ...armarResultado(raw, cfg, fila.modelo_motor, pl), desde, hasta };
        } catch (e) {
            if (e && e.status) throw e;
            console.error('[conduccion-rpm]', e && e.message);
            throw aviso(e && e.name === 'TimeoutError' ? 'Wialon tardó demasiado. Prueba con un rango más corto.' : 'No se pudo consultar Wialon.', 502);
        } finally {
            if (sid) { await llamar(baseUrl, 'core/logout', {}, sid, 10000).catch(() => { }); }
        }
    });
}

module.exports = { analizarRpm, medirRpm, armarResultado, enCola };
