// Indicadores del menú: una cifra corta por sección (solo lectura). Si una consulta falla, la sección no muestra cifra.
const express = require('express');

module.exports = (db) => {
    const router = express.Router();
    const getDb = req => (req && req.db) ? req.db : db;
    const consulta = (tdb, sql) => new Promise(resolve => {
        tdb.query(sql, (err, rows) => resolve(err ? null : rows));
    });

    router.get('/indicadores', async (req, res) => {
        const tdb = getDb(req);
        const [caja, combOp, combMar, docs, ots, pap] = await Promise.all([
            consulta(tdb, "SELECT COUNT(*) AS n FROM tesoreria_caja WHERE DATE(fecha) = CURDATE() AND estado <> 'ANULADO'"),
            consulta(tdb, "SELECT ROUND(SUM(galones), 1) AS g FROM operaciones_combustible_vales WHERE DATE(fecha) = CURDATE() AND estado <> 'ANULADO'"),
            consulta(tdb, "SELECT ROUND(SUM(galones), 1) AS g FROM marsisa_combustible_vales WHERE DATE(fecha) = CURDATE() AND estado <> 'ANULADO'"),
            consulta(tdb, 'SELECT COUNT(*) AS n FROM vehiculos_flota WHERE soat_vencimiento < CURDATE() OR rt_vencimiento < CURDATE()'),
            consulta(tdb, "SELECT COUNT(*) AS n FROM ordenes_trabajo WHERE estado NOT LIKE '%final%' AND estado NOT LIKE '%cerr%' AND estado NOT LIKE '%anul%'"),
            // Papeletas pendientes de pago que ya vencieron o vencen en 3 días (plazo de pago o fin del descuento)
            consulta(tdb, "SELECT COUNT(*) AS n FROM papeletas WHERE estado IN ('PENDIENTE', 'EN_DESCARGO') AND ((fecha_limite_pago IS NOT NULL AND fecha_limite_pago <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)) OR (descuento_monto > 0 AND fecha_limite_descuento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)))"),
        ]);
        const cifra = (filas, campo, texto) => (filas && filas[0] && filas[0][campo] != null ? texto(Number(filas[0][campo])) : null);
        res.json({
            ok: true,
            indicadores: {
                'Tesorería': cifra(caja, 'n', n => `${n} movimientos hoy`),
                'Operaciones': cifra(combOp, 'g', g => `${g.toLocaleString('es-PE')} gal hoy`),
                'Operaciones Marsisa': cifra(combMar, 'g', g => `${g.toLocaleString('es-PE')} gal hoy`),
                'Flota': [cifra(docs, 'n', n => `${n} documentos vencidos`), cifra(pap, 'n', n => (n > 0 ? `${n} papeletas por vencer` : null))].filter(Boolean).join(' · ') || null,
                'Mantenimiento': cifra(ots, 'n', n => `${n} OT abiertas`),
            },
        });
    });

    return router;
};
