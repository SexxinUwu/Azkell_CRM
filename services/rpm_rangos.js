'use strict';
// Rangos de RPM por modelo de motor (hoja MOTOR del cuadro de conducción de Operaciones Marsisa).
// Los valores de aquí son los de respaldo: se editan desde el sistema (tablas conduccion_rpm_rangos y conduccion_rpm_config);
// si la tabla aún no existe en la base, se usan estos.
// Cada fila: [fin de ralentí, fin de bajo torque, fin de zona verde (económico), fin de potencia]; por encima del último es sobrerrevolución.
//   ralentí 0–a · bajo torque a–b · zona verde b–c · potencia c–d · sobrerrevolución > d
// Colores del cuadro: bajo torque = sobreconsumo, zona verde = consumo óptimo, potencia = sobreconsumo, sobrerrevolución = daño de motor.
const POR_MODELO = {
    'D13C460': [1000, 1150, 1400, 1900],
    'D8C350': [900, 1200, 1600, 2200],
    'DC13450': [650, 1000, 1300, 1900],
    'DC13500': [700, 1000, 1300, 1800],
    'DC13460': [700, 1000, 1300, 1800],
    'DC13410': [700, 1000, 1400, 1900],
    'SUPER13460': [700, 1000, 1300, 1800],
    '6HK1': [800, 1050, 1500, 2400],
    'ISM': [1000, 1200, 1500, 1900],
    'DT530': [800, 1200, 1500, 2000],
    'MT13.46': [550, 1050, 1400, 1900],
    'WP12.430E201': [800, 1100, 1500, 1900],
    'MC11.44': [750, 1000, 1400, 1900],
    'MC13.54': [700, 1000, 1400, 1900],
    'MC07.28': [600, 1200, 1800, 2300],
    'ISDE-180': [800, 1200, 1700, 2500],
    'MX13': [850, 1050, 1500, 1900],
    'J05E-TY': [800, 1100, 1600, 2500],
    'J08E-WB': [800, 1100, 1600, 2500],
    'MBE4000': [700, 1100, 1400, 1900],
    'MB-OM926': [800, 1200, 1600, 2200],
};

const GENERICO = [800, 1150, 1400, 1900];
const META_BASE = { bajo: 20, verde: 60, potencia: 20, sobre: 0 };
const TTL_MS = 30000;

const clave = m => String(m || '').trim().toUpperCase().replace(/s+/g, '');

const configBase = () => ({
    origen: 'base',
    porModelo: new Map(Object.entries(POR_MODELO).map(([m, l]) => [clave(m), { modelo: m, limites: l.slice() }])),
    generico: GENERICO.slice(),
    meta: { ...META_BASE },
});

const cache = new WeakMap();
/** Rangos y meta vigentes de la empresa: salen de la tabla (editable) y, si aún no existe, de los valores de respaldo */
async function cargarConfig(db) {
    const hit = cache.get(db);
    if (hit && Date.now() - hit.t < TTL_MS) return hit.cfg;
    let cfg = configBase();
    try {
        const p = db.promise();
        const [rangos] = await p.query('SELECT modelo, lim_ralenti, lim_bajo, lim_verde, lim_potencia FROM conduccion_rpm_rangos ORDER BY modelo');
        const [conf] = await p.query('SELECT clave, valor FROM conduccion_rpm_config');
        cfg = { origen: 'tabla', porModelo: new Map(), generico: GENERICO.slice(), meta: { ...META_BASE } };
        rangos.forEach(r => cfg.porModelo.set(clave(r.modelo), { modelo: r.modelo, limites: [r.lim_ralenti, r.lim_bajo, r.lim_verde, r.lim_potencia].map(Number) }));
        const m = {}; conf.forEach(c => { m[c.clave] = c.valor; });
        const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : d);
        cfg.meta = { bajo: num(m.meta_bajo, 20), verde: num(m.meta_verde, 60), potencia: num(m.meta_potencia, 20), sobre: num(m.meta_sobre, 0) };
        const g = String(m.rangos_generico || '').split(',').map(Number);
        if (g.length === 4 && g.every(Number.isFinite)) cfg.generico = g;
    } catch (e) {
        if (!(e && e.code === 'ER_NO_SUCH_TABLE')) console.error('[rpm_rangos]', e && e.message);
    }
    cache.set(db, { t: Date.now(), cfg });
    return cfg;
}
const invalidar = db => cache.delete(db);

/** Rangos de un modelo; { modelo, conocido, limites:[a,b,c,d] }. Sin modelo (o desconocido) se usan los generales */
function rangosDe(cfg, modelo) {
    const r = cfg.porModelo.get(clave(modelo));
    return { modelo: String(modelo || '').trim(), conocido: !!r, limites: r ? r.limites : cfg.generico };
}

/** Clasifica una lectura de RPM (mayor que 0) en su rango */
function categoria(rpm, l) {
    if (rpm < l[0]) return 'ralenti';
    if (rpm <= l[1]) return 'bajo';
    if (rpm <= l[2]) return 'verde';
    if (rpm <= l[3]) return 'potencia';
    return 'sobre';
}

/** Valida cuatro límites de RPM crecientes */
function limitesValidos(l) {
    return Array.isArray(l) && l.length === 4 && l.every(v => Number.isInteger(v) && v > 0 && v <= 6000) && l[0] < l[1] && l[1] < l[2] && l[2] < l[3];
}

module.exports = { cargarConfig, invalidar, rangosDe, categoria, limitesValidos, clave };
