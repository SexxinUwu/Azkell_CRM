// Tesorería › Detracciones: reportes (pendientes y depositadas), cruce con el SIRE de compras y configuración de la empresa (bandera de retención del 3 %).
// El catálogo de tipos de detracción se edita en routes/almacen.js (/api/almacen/detraccion-tipos). Todo es de solo lectura hacia SUNAT.
const express = require('express');
const rep = require('../services/detracciones_reportes');
const retencion = require('../services/retencion');
const { audit: auditar, actorFrom: actorDe } = require('../services/auditoria');

function esAdmin(req) {
    const u = (req && req.user) || {};
    if (String(u.rol || '') === 'Fundador') return true;
    try { const p = typeof u.permisos === 'string' ? JSON.parse(u.permisos || '{}') : (u.permisos || {}); return p.admin === true; } catch (e) { return false; }
}

module.exports = (db) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => { const d = getDb(req); return typeof d.promise === 'function' ? d.promise() : d; };
    const error = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[detracciones] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo completar la operación.' });
    };

    // Listado y resumen. Filtros: desde, hasta (AAAA-MM-DD), proveedor (id), estado (PENDIENTE|DEPOSITADA|POR_APROBAR), por (orden|deposito)
    router.get('/reporte', async (req, res) => {
        try { res.json({ ok: true, ...(await rep.reporte(P(req), req.query)) }); }
        catch (err) { error(res, err, 'reporte'); }
    });

    // Cruce de las órdenes con las compras del SIRE ya cargadas. Filtros: desde, hasta
    router.get('/cruce-sire', async (req, res) => {
        try { res.json({ ok: true, ...(await rep.cruceSire(P(req), req.query)) }); }
        catch (err) { error(res, err, 'cruce-sire'); }
    });

    // Configuración de la empresa (hoy solo la bandera de retención del 3 %)
    router.get('/config', async (req, res) => {
        try { res.json({ ok: true, retencion_3_activa: await retencion.retencionActiva(P(req)), nota: retencion.NOTA, puede_editar: esAdmin(req) }); }
        catch (err) { error(res, err, 'config'); }
    });
    router.put('/config', async (req, res) => {
        try {
            if (!esAdmin(req)) return res.status(403).json({ ok: false, error: 'Solo un administrador puede cambiar esta configuración.' });
            const nueva = req.body && req.body.retencion_3_activa;
            if (typeof nueva !== 'boolean') return res.status(400).json({ ok: false, error: 'Indica si la retención del 3 % está activa (sí o no).' });
            const antes = await retencion.retencionActiva(P(req));
            await retencion.guardarRetencion(P(req), nueva);
            if (antes !== nueva) {
                await auditar(getDb(req), actorDe(req), {
                    action: 'UPDATE', entity: 'detraccion-config', entityId: retencion.CLAVE,
                    summary: `${nueva ? 'Activó' : 'Desactivó'} la bandera de retención del 3 % de la empresa`,
                    changes: { retencion_3_activa: { from: antes, to: nueva } },
                });
            }
            res.json({ ok: true, retencion_3_activa: nueva });
        } catch (err) { error(res, err, 'config-guardar'); }
    });

    return router;
};
