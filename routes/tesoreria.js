const express = require('express');

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    const _tenantsInitSet = new Set();

    async function ensureTable(req) {
        const tenantSlug = req.tenantSlug || 'default';
        if (_tenantsInitSet.has(tenantSlug)) return;

        const tdb = getDb(req);
        if (!tdb) return;

        const createSql = `
            CREATE TABLE IF NOT EXISTS tesoreria_cuentas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                fecha_liquidacion DATE NULL,
                fecha_servicio DATE NULL,
                razon_social VARCHAR(150) NOT NULL DEFAULT '',
                placa VARCHAR(50) NOT NULL DEFAULT '',
                conductor VARCHAR(150) NOT NULL DEFAULT '',
                cliente VARCHAR(150) NOT NULL DEFAULT '',
                lugar VARCHAR(150) NOT NULL DEFAULT '',
                tarifa DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                gastos_operativos DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                base_imponible DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                igv DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                adelanto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                detraccion DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                neto_cobrar DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                mes_facturacion VARCHAR(50) NOT NULL DEFAULT '',
                fecha_factura DATE NULL,
                serie VARCHAR(30) NOT NULL DEFAULT '',
                factura VARCHAR(50) NOT NULL DEFAULT '',
                credito_dias INT NOT NULL DEFAULT 0,
                fecha_cobrar DATE NULL,
                fecha_deposito DATE NULL,
                estado_servicio VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
                diferencia DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                observacion TEXT NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_fecha_liq (fecha_liquidacion),
                INDEX idx_factura (serie, factura),
                INDEX idx_placa (placa),
                INDEX idx_cliente (cliente),
                INDEX idx_estado (estado_servicio)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        try {
            await tdb.query(createSql);
            _tenantsInitSet.add(tenantSlug);
        } catch (e) {
            console.warn(`[Tesorería] Error verificando tabla tesoreria_cuentas (${tenantSlug}):`, e.message);
        }
    }

    function safeDate(val) {
        if (!val) return null;
        if (typeof val === 'string') {
            val = val.trim();
            if (!val || val === '-' || val === '—') return null;
            // Formatos dd/mm/yyyy o d/m/yyyy
            if (val.includes('/')) {
                const parts = val.split('/');
                if (parts.length === 3) {
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    let year = parts[2];
                    if (year.length === 2) year = '20' + year;
                    return `${year}-${month}-${day}`;
                }
            }
            // Formato yyyy-mm-dd
            if (val.includes('-')) {
                const parts = val.split('-');
                if (parts.length === 3) {
                    if (parts[0].length === 4) return val.slice(0, 10);
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    let year = parts[2];
                    if (year.length === 2) year = '20' + year;
                    return `${year}-${month}-${day}`;
                }
            }
        }
        if (val instanceof Date && !isNaN(val.getTime())) {
            return val.toISOString().slice(0, 10);
        }
        return null;
    }

    function safeNum(val) {
        if (val == null || val === '') return 0.0;
        if (typeof val === 'number') return isNaN(val) ? 0.0 : val;
        let str = String(val).trim();
        // Si viene con formato europeo/peruano tipo 8.357,63
        if (str.includes('.') && str.includes(',')) {
            str = str.replace(/\./g, '').replace(',', '.');
        } else if (str.includes(',')) {
            str = str.replace(',', '.');
        }
        const num = parseFloat(str);
        return isNaN(num) ? 0.0 : num;
    }

    // ── GET /api/tesoreria/cuentas (Listar registros) ───────────────────
    router.get('/cuentas', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const { buscar, estado, mes } = req.query;
            let sql = `
                SELECT 
                    id,
                    DATE_FORMAT(fecha_liquidacion, '%Y-%m-%d') AS fecha_liquidacion,
                    DATE_FORMAT(fecha_servicio, '%Y-%m-%d') AS fecha_servicio,
                    razon_social,
                    placa,
                    conductor,
                    cliente,
                    lugar,
                    tarifa,
                    gastos_operativos,
                    base_imponible,
                    igv,
                    total,
                    adelanto,
                    detraccion,
                    neto_cobrar,
                    mes_facturacion,
                    DATE_FORMAT(fecha_factura, '%Y-%m-%d') AS fecha_factura,
                    serie,
                    factura,
                    credito_dias,
                    DATE_FORMAT(fecha_cobrar, '%Y-%m-%d') AS fecha_cobrar,
                    DATE_FORMAT(fecha_deposito, '%Y-%m-%d') AS fecha_deposito,
                    estado_servicio,
                    diferencia,
                    observacion,
                    creado_en,
                    actualizado_en
                FROM tesoreria_cuentas
                WHERE 1=1
            `;
            const params = [];

            if (estado && estado !== 'TODOS') {
                sql += ` AND UPPER(estado_servicio) = UPPER(?)`;
                params.push(estado);
            }

            if (mes && mes !== 'TODOS') {
                sql += ` AND UPPER(mes_facturacion) = UPPER(?)`;
                params.push(mes);
            }

            if (buscar && buscar.trim()) {
                const term = `%${buscar.trim()}%`;
                sql += ` AND (
                    razon_social LIKE ? OR 
                    placa LIKE ? OR 
                    conductor LIKE ? OR 
                    cliente LIKE ? OR 
                    factura LIKE ? OR 
                    serie LIKE ? OR
                    lugar LIKE ? OR
                    observacion LIKE ?
                )`;
                params.push(term, term, term, term, term, term, term, term);
            }

            sql += ` ORDER BY fecha_liquidacion DESC, id DESC LIMIT 5000`;

            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            console.error('Error al listar cuentas tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/tesoreria/cuentas (Crear registro individual) ─────────
    router.post('/cuentas', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const b = req.body || {};
            const insertSql = `
                INSERT INTO tesoreria_cuentas (
                    fecha_liquidacion, fecha_servicio, razon_social, placa, conductor, cliente, lugar,
                    tarifa, gastos_operativos, base_imponible, igv, total, adelanto, detraccion, neto_cobrar,
                    mes_facturacion, fecha_factura, serie, factura, credito_dias, fecha_cobrar, fecha_deposito,
                    estado_servicio, diferencia, observacion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                safeDate(b.fecha_liquidacion),
                safeDate(b.fecha_servicio),
                (b.razon_social || '').trim(),
                (b.placa || '').toUpperCase().trim(),
                (b.conductor || '').trim(),
                (b.cliente || '').trim(),
                (b.lugar || '').trim(),
                safeNum(b.tarifa),
                safeNum(b.gastos_operativos),
                safeNum(b.base_imponible),
                safeNum(b.igv),
                safeNum(b.total),
                safeNum(b.adelanto),
                safeNum(b.detraccion),
                safeNum(b.neto_cobrar),
                (b.mes_facturacion || '').trim(),
                safeDate(b.fecha_factura),
                (b.serie || '').trim(),
                (b.factura || '').trim(),
                parseInt(b.credito_dias, 10) || 0,
                safeDate(b.fecha_cobrar),
                safeDate(b.fecha_deposito),
                (b.estado_servicio || 'PENDIENTE').toUpperCase().trim(),
                safeNum(b.diferencia),
                (b.observacion || '').trim()
            ];

            const [result] = await tdb.query(insertSql, values);

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'CREO', `Creó registro factura ${b.serie}-${b.factura} cliente ${b.cliente}`);
            }

            res.json({ ok: true, id: result.insertId, message: 'Registro creado exitosamente' });
        } catch (err) {
            console.error('Error al crear registro de tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/tesoreria/cuentas/:id (Editar registro) ───────────────
    router.put('/cuentas/:id', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const id = req.params.id;
            const b = req.body || {};

            const updateSql = `
                UPDATE tesoreria_cuentas SET
                    fecha_liquidacion = ?,
                    fecha_servicio = ?,
                    razon_social = ?,
                    placa = ?,
                    conductor = ?,
                    cliente = ?,
                    lugar = ?,
                    tarifa = ?,
                    gastos_operativos = ?,
                    base_imponible = ?,
                    igv = ?,
                    total = ?,
                    adelanto = ?,
                    detraccion = ?,
                    neto_cobrar = ?,
                    mes_facturacion = ?,
                    fecha_factura = ?,
                    serie = ?,
                    factura = ?,
                    credito_dias = ?,
                    fecha_cobrar = ?,
                    fecha_deposito = ?,
                    estado_servicio = ?,
                    diferencia = ?,
                    observacion = ?
                WHERE id = ?
            `;

            const values = [
                safeDate(b.fecha_liquidacion),
                safeDate(b.fecha_servicio),
                (b.razon_social || '').trim(),
                (b.placa || '').toUpperCase().trim(),
                (b.conductor || '').trim(),
                (b.cliente || '').trim(),
                (b.lugar || '').trim(),
                safeNum(b.tarifa),
                safeNum(b.gastos_operativos),
                safeNum(b.base_imponible),
                safeNum(b.igv),
                safeNum(b.total),
                safeNum(b.adelanto),
                safeNum(b.detraccion),
                safeNum(b.neto_cobrar),
                (b.mes_facturacion || '').trim(),
                safeDate(b.fecha_factura),
                (b.serie || '').trim(),
                (b.factura || '').trim(),
                parseInt(b.credito_dias, 10) || 0,
                safeDate(b.fecha_cobrar),
                safeDate(b.fecha_deposito),
                (b.estado_servicio || 'PENDIENTE').toUpperCase().trim(),
                safeNum(b.diferencia),
                (b.observacion || '').trim(),
                id
            ];

            await tdb.query(updateSql, values);

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'MODIFICO', `Modificó registro ID ${id} factura ${b.serie}-${b.factura}`);
            }

            res.json({ ok: true, message: 'Registro actualizado exitosamente' });
        } catch (err) {
            console.error('Error al actualizar registro de tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── DELETE /api/tesoreria/cuentas/:id (Eliminar registro) ───────────
    router.delete('/cuentas/:id', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const id = req.params.id;
            await tdb.query('DELETE FROM tesoreria_cuentas WHERE id = ?', [id]);

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'ELIMINO', `Eliminó registro ID ${id}`);
            }

            res.json({ ok: true, message: 'Registro eliminado exitosamente' });
        } catch (err) {
            console.error('Error al eliminar registro de tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/tesoreria/cuentas/importar-masivo ──────────────────────
    router.post('/cuentas/importar-masivo', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const filas = req.body.filas || [];
            if (!Array.isArray(filas) || filas.length === 0) {
                return res.status(400).json({ error: 'No se enviaron filas para importar.' });
            }

            const insertSql = `
                INSERT INTO tesoreria_cuentas (
                    fecha_liquidacion, fecha_servicio, razon_social, placa, conductor, cliente, lugar,
                    tarifa, gastos_operativos, base_imponible, igv, total, adelanto, detraccion, neto_cobrar,
                    mes_facturacion, fecha_factura, serie, factura, credito_dias, fecha_cobrar, fecha_deposito,
                    estado_servicio, diferencia, observacion
                ) VALUES ?
            `;

            const batchSize = 100;
            let insertados = 0;

            for (let i = 0; i < filas.length; i += batchSize) {
                const chunk = filas.slice(i, i + batchSize);
                const values = chunk.map(r => [
                    safeDate(r.fecha_liquidacion),
                    safeDate(r.fecha_servicio),
                    (r.razon_social || '').trim(),
                    (r.placa || '').toUpperCase().trim(),
                    (r.conductor || '').trim(),
                    (r.cliente || '').trim(),
                    (r.lugar || '').trim(),
                    safeNum(r.tarifa),
                    safeNum(r.gastos_operativos),
                    safeNum(r.base_imponible),
                    safeNum(r.igv),
                    safeNum(r.total),
                    safeNum(r.adelanto),
                    safeNum(r.detraccion),
                    safeNum(r.neto_cobrar),
                    (r.mes_facturacion || '').trim(),
                    safeDate(r.fecha_factura),
                    (r.serie || '').trim(),
                    (r.factura || '').trim(),
                    parseInt(r.credito_dias, 10) || 0,
                    safeDate(r.fecha_cobrar),
                    safeDate(r.fecha_deposito),
                    (r.estado_servicio || 'PENDIENTE').toUpperCase().trim(),
                    safeNum(r.diferencia),
                    (r.observacion || '').trim()
                ]);

                await tdb.query(insertSql, [values]);
                insertados += values.length;
            }

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'IMPORTACION_EXCEL', `Importación masiva de ${insertados} registros en Cuentas por Cobrar/Pagar`);
            }

            res.json({ ok: true, insertados, message: `Se importaron ${insertados} registros correctamente.` });
        } catch (err) {
            console.error('Error en importación masiva de tesorería:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
