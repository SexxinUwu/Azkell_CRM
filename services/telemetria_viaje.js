'use strict';
// Telemetría de un viaje de Marsisa (CAN + conducción por RPM) con la menor espera posible:
//   1. Si el viaje ya está guardado (viaje_telemetria_gps) con el mismo periodo, responde desde la base: milisegundos, sin tocar Wialon.
//   2. Si no, pide a Wialon CAN y RPM en UNA sola sesión (la misma que ya está abierta, sin volver a entrar) y, si el viaje ya terminó, lo guarda.
//   3. El precálculo (precalcular) hace lo mismo en segundo plano con los viajes recientes, para que al abrir la pantalla ya esté todo.
// Las consultas a Wialon van de una en una (cola compartida con la pantalla de conducción por RPM).
const { medirRpm, armarResultado, enCola } = require('./wialon_rpm');
const { cargarConfig } = require('./rpm_rangos');

// Un viaje cuenta como terminado cuando su periodo acabó hace más de 3 horas
const HORAS_CIERRE = 3;
const limpiarPlaca = s => String(s || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
const estado = { corriendo: false, ultima: null };

const sinTabla = e => e && e.code === 'ER_NO_SUCH_TABLE';
const analizar = (txt) => { try { return JSON.parse(txt); } catch { return null; } };

async function leerGuardado(db, viaje, placa) {
    try {
        const [rows] = await db.promise().query('SELECT desde_unix, hasta_unix, can_json, rpm_json, calculado_en FROM viaje_telemetria_gps WHERE viaje = ? AND placa = ? LIMIT 1', [viaje, placa]);
        return rows[0] || null;
    } catch (e) { if (!sinTabla(e)) console.error('[telemetria-viaje] leer:', e.message); return null; }
}

async function guardar(db, viaje, placa, per, can, rpmRaw) {
    try {
        await db.promise().query(
            `INSERT INTO viaje_telemetria_gps (viaje, placa, desde_unix, hasta_unix, can_json, rpm_json) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE desde_unix = VALUES(desde_unix), hasta_unix = VALUES(hasta_unix), can_json = VALUES(can_json), rpm_json = VALUES(rpm_json), calculado_en = CURRENT_TIMESTAMP`,
            [viaje, placa, per.from, per.to, can ? JSON.stringify(can) : null, rpmRaw ? JSON.stringify(rpmRaw) : null]);
    } catch (e) { if (!sinTabla(e)) console.error('[telemetria-viaje] guardar:', e.message); }
}

async function modeloDe(db, placa) {
    try {
        const [rows] = await db.promise().query('SELECT modelo_motor FROM placas WHERE placa = ? LIMIT 1', [placa]);
        return rows[0] ? rows[0].modelo_motor : '';
    } catch { return ''; }
}

/** Arma lo que ve la pantalla: el CAN tal cual y la conducción por RPM calculada con los rangos vigentes del motor */
async function respuesta(db, placa, can, rpmRaw, extra) {
    const cfg = await cargarConfig(db);
    const rpm = rpmRaw ? armarResultado(rpmRaw, cfg, await modeloDe(db, placa), placa) : null;
    return { ...can, rpm: rpm && !rpm.sin_datos ? rpm : null, ...extra };
}

/**
 * Telemetría de un viaje. `ayudantes` son los de routes/combustible.js (sesión de Wialon, consulta CAN, periodo).
 * Devuelve { data } (null si no hay unidad o datos en Wialon) con .fuente = 'guardado' | 'wialon'.
 */
async function obtenerTelemetriaViaje(db, ayudantes, { viaje, placa, ini, fin, forzar = false }) {
    const pl = limpiarPlaca(placa);
    const v = String(viaje || '').trim().slice(0, 60);
    if (!v || pl.length < 5) return { data: null };
    const per = ayudantes.periodoUnix(ini, fin);
    if (!per) return { data: null };

    if (!forzar) {
        const g = await leerGuardado(db, v, pl);
        if (g && g.desde_unix === per.from && g.hasta_unix === per.to && g.can_json) {
            return { data: await respuesta(db, pl, analizar(g.can_json), analizar(g.rpm_json), { fuente: 'guardado' }) };
        }
    }

    return enCola(async () => {
        // Otra solicitud pudo guardarlo mientras esta esperaba su turno
        if (!forzar) {
            const g = await leerGuardado(db, v, pl);
            if (g && g.desde_unix === per.from && g.hasta_unix === per.to && g.can_json) {
                return { data: await respuesta(db, pl, analizar(g.can_json), analizar(g.rpm_json), { fuente: 'guardado' }) };
            }
        }
        let rpmError;
        for (let intento = 0; intento < 2; intento++) {
            const ctx = await ayudantes.getWialonContext(db);
            const unidad = ayudantes.resolverUnidad(ctx.cache, pl);
            if (!unidad) return { data: null };
            const can = await ayudantes.consultarTelemetriaViajeWialon(ctx.baseUrl, ctx.sid, ctx.cache, pl, ini, fin);
            if (!can) return { data: null };
            let rpmRaw = null;
            try {
                rpmRaw = await medirRpm({ baseUrl: ctx.baseUrl, sid: ctx.sid, unitId: unidad.id, from: per.from, to: per.to });
            } catch (e) {
                // Sesión vencida: se vuelve a entrar y se repite una vez
                if (e && e.sesion && intento === 0) { ayudantes.invalidarSesion(); continue; }
                rpmError = e && e.status ? e.message : 'No se pudo calcular la conducción por RPM';
            }
            const terminado = per.to < Math.floor(Date.now() / 1000) - HORAS_CIERRE * 3600;
            // Solo se guarda lo completo y de un viaje terminado
            if (terminado && !rpmError) await guardar(db, v, pl, per, can, rpmRaw);
            return { data: await respuesta(db, pl, can, rpmRaw, { fuente: 'wialon', ...(rpmError ? { rpmError } : {}) }) };
        }
        return { data: null };
    });
}

/** Rango de un viaje como lo calcula la pantalla (fechas del viaje; si faltan, primer y último vale) */
function rangoDeViaje(t) {
    const sinFecha = f => !f || f === 'N/D' || f === '---';
    let ini = t.fechaInicio, fin = t.fechaFin;
    if (sinFecha(ini)) {
        const vales = (t.vouchers || []).filter(x => x.fecha).sort((a, b) => new Date(String(a.fecha)).getTime() - new Date(String(b.fecha)).getTime());
        if (vales.length) { ini = String(vales[0].fecha); fin = String(vales[vales.length - 1].fecha); }
    }
    return { ini: ini || t.fechaInicio, fin: fin || t.fechaFin };
}

/**
 * Precálculo en segundo plano: toma los viajes de los últimos días que ya terminaron y aún no están guardados, y los guarda.
 * Trabaja de a uno (entre uno y otro puede entrar una consulta de la pantalla). `maximo` limita cuántos por vuelta.
 */
async function precalcular(db, ayudantes, { dias = 10, maximo = 30 } = {}) {
    if (estado.corriendo) return { ok: false, motivo: 'Ya hay un precálculo en curso.' };
    // Sin la tabla no hay dónde guardar: no se gasta Wialon en vano
    try { await db.promise().query('SELECT 1 FROM viaje_telemetria_gps LIMIT 1'); } catch (e) { if (sinTabla(e)) return { ok: false, motivo: 'Falta aplicar la actualización de la base de datos.' }; }
    estado.corriendo = true;
    const resumen = { ok: true, revisados: 0, guardados: 0, omitidos: 0, fallidos: 0, pendientes: 0 };
    try {
        const hoy = new Date();
        const desde = new Date(hoy.getTime() - dias * 86400000);
        const f = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(d);
        const req = { db, tenantSlug: 'marsisa', headers: { host: 'marsisa', 'x-tenant-id': 'marsisa' }, query: { combustible: 'ALL', fecha_desde: f(desde), fecha_hasta: f(hoy), modulo: 'marsisa' }, body: {} };
        let trips = [];
        const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { if (o && Array.isArray(o.trips)) trips = o.trips; return this; } };
        await ayudantes.analisisViajes(req, res);

        const limite = Math.floor(Date.now() / 1000) - HORAS_CIERRE * 3600;
        const faltan = [];
        for (const t of trips) {
            const placa = limpiarPlaca(t.placa);
            if (!t.viaje || placa.length < 5) continue;
            const r = rangoDeViaje(t);
            const per = ayudantes.periodoUnix(r.ini, r.fin);
            resumen.revisados++;
            if (!per || per.to > limite) { resumen.omitidos++; continue; }
            const g = await leerGuardado(db, String(t.viaje).trim().slice(0, 60), placa);
            if (g && g.desde_unix === per.from && g.hasta_unix === per.to && g.can_json) continue;
            faltan.push({ viaje: t.viaje, placa, ini: r.ini, fin: r.fin });
        }
        resumen.pendientes = Math.max(0, faltan.length - maximo);
        for (const x of faltan.slice(0, maximo)) {
            try {
                const r = await obtenerTelemetriaViaje(db, ayudantes, x);
                if (r.data) resumen.guardados++; else resumen.omitidos++;
            } catch (e) { resumen.fallidos++; console.warn('[telemetria-viaje] precálculo', x.viaje, x.placa, e && e.message); }
        }
    } catch (e) {
        resumen.ok = false; resumen.motivo = e && e.message;
        if (!sinTabla(e)) console.warn('[telemetria-viaje] precálculo:', e && e.message);
    } finally {
        estado.corriendo = false;
        estado.ultima = { ...resumen, en: new Date().toISOString() };
    }
    return resumen;
}

module.exports = { obtenerTelemetriaViaje, precalcular, estadoPrecalculo: () => ({ corriendo: estado.corriendo, ultima: estado.ultima }) };
