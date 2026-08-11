const express = require('express');

module.exports = function (db, logAudit) {
    const router = express.Router();

    // ── Función helper para obtener la conexión correcta (multi-tenant) ──
    function getDb(req) { return req.db || db; }

    // ── Middleware: asegurar tabla clientes existe y uniformizar collation ──
    router.use((req, res, next) => {
        const tdb = getDb(req);
        const createTableQuery = `
        CREATE TABLE IF NOT EXISTS clientes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ruc_dni VARCHAR(50),
            razon_social VARCHAR(255) NOT NULL,
            direccion TEXT,
            telefono VARCHAR(50),
            email VARCHAR(100),
            estado VARCHAR(20) DEFAULT 'Activo',
            notas TEXT,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_razon (razon_social)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;
        tdb.query(createTableQuery, (err) => {
            if (err) console.warn('Error inicializando tabla clientes:', err.message);
            tdb.query("ALTER TABLE clientes CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", () => {});
            tdb.query("ALTER TABLE placas CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", () => {});
            next();
        });
    });

    // ── GET /api/clientes (lista general con conteo de vehículos inteligente) ─────────
    router.get('/', (req, res) => {
        const tdb = getDb(req);
        // Coincidencia inteligente: por RUC o por Razón Social limpia (ignorando puntos, espacios y guiones)
        const sql = `
        SELECT 
            c.id,
            c.ruc_dni,
            c.razon_social,
            c.direccion,
            c.telefono,
            c.email,
            c.estado,
            c.notas,
            c.fecha_creacion,
            COUNT(DISTINCT p.placa) AS total_flota
        FROM clientes c
        LEFT JOIN placas p ON 
            (p.ruc_dni IS NOT NULL AND p.ruc_dni != '' AND p.ruc_dni = c.ruc_dni)
            OR (
                REPLACE(REPLACE(REPLACE(UPPER(p.cliente) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '') = 
                REPLACE(REPLACE(REPLACE(UPPER(c.razon_social) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '')
            )
        GROUP BY c.id, c.ruc_dni, c.razon_social, c.direccion, c.telefono, c.email, c.estado, c.notas, c.fecha_creacion
        ORDER BY c.razon_social ASC;
        `;
        tdb.query(sql, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    // ── GET /api/clientes/:id (detalle de cliente) ───────────────────────
    router.get('/:id', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        tdb.query('SELECT * FROM clientes WHERE id = ?', [id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
            res.json(rows[0]);
        });
    });

    // ── GET /api/clientes/:id/flota (vehículos/placas del cliente) ───────
    router.get('/:id/flota', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        tdb.query('SELECT razon_social, ruc_dni FROM clientes WHERE id = ?', [id], (err, rows) => {
            if (err || !rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
            const { razon_social, ruc_dni } = rows[0];
            const sql = `
            SELECT * FROM placas 
            WHERE (ruc_dni IS NOT NULL AND ruc_dni != '' AND ruc_dni = ?)
               OR (
                   REPLACE(REPLACE(REPLACE(UPPER(cliente) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '') = 
                   REPLACE(REPLACE(REPLACE(UPPER(?) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '')
               )
            ORDER BY placa ASC`;
            tdb.query(sql, [ruc_dni, razon_social], (errP, placas) => {
                if (errP) return res.status(500).json({ error: errP.message });
                res.json(placas);
            });
        });
    });

    // ── GET /api/clientes/:id/ots (Órdenes de Trabajo del cliente) ───────
    router.get('/:id/ots', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        tdb.query('SELECT razon_social, ruc_dni FROM clientes WHERE id = ?', [id], (err, rows) => {
            if (err || !rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
            const { razon_social, ruc_dni } = rows[0];
            const sql = `
            SELECT ot.* 
            FROM ordenes_trabajo ot
            JOIN placas p ON UPPER(p.placa) = UPPER(ot.placa)
            WHERE (p.ruc_dni IS NOT NULL AND p.ruc_dni != '' AND p.ruc_dni = ?)
               OR (
                   REPLACE(REPLACE(REPLACE(UPPER(p.cliente) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '') = 
                   REPLACE(REPLACE(REPLACE(UPPER(?) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '')
               )
            ORDER BY ot.id_ot DESC
            LIMIT 100;
            `;
            tdb.query(sql, [ruc_dni, razon_social], (errOT, ots) => {
                if (errOT) return res.status(500).json({ error: errOT.message });
                res.json(ots);
            });
        });
    });

    // ── GET /api/clientes/:id/backlog (Backlogs del cliente) ─────────────
    router.get('/:id/backlog', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        tdb.query('SELECT razon_social, ruc_dni FROM clientes WHERE id = ?', [id], (err, rows) => {
            if (err || !rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
            const { razon_social, ruc_dni } = rows[0];
            const sql = `
            SELECT b.* 
            FROM ot_backlog b
            JOIN placas p ON UPPER(p.placa) = UPPER(b.placa)
            WHERE (p.ruc_dni IS NOT NULL AND p.ruc_dni != '' AND p.ruc_dni = ?)
               OR (
                   REPLACE(REPLACE(REPLACE(UPPER(p.cliente) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '') = 
                   REPLACE(REPLACE(REPLACE(UPPER(?) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '')
               )
            ORDER BY b.id DESC;
            `;
            tdb.query(sql, [ruc_dni, razon_social], (errB, backlogs) => {
                if (errB) return res.status(500).json({ error: errB.message });
                res.json(backlogs);
            });
        });
    });

    // ── POST /api/clientes (Crear nuevo cliente y homlogar placas) ─────────────────────────
    router.post('/', (req, res) => {
        const tdb = getDb(req);
        const { ruc_dni, razon_social, direccion, telefono, email, estado, notas } = req.body;
        if (!razon_social) return res.status(400).json({ error: 'La Razón Social es requerida' });

        const cleanRuc = (ruc_dni || '').trim();
        const cleanRazon = razon_social.trim().toUpperCase();

        const sql = `
        INSERT INTO clientes (ruc_dni, razon_social, direccion, telefono, email, estado, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            ruc_dni = VALUES(ruc_dni),
            direccion = VALUES(direccion),
            telefono = VALUES(telefono),
            email = VALUES(email),
            estado = VALUES(estado),
            notas = VALUES(notas);
        `;
        const values = [
            cleanRuc,
            cleanRazon,
            (direccion || '').trim(),
            (telefono || '').trim(),
            (email || '').trim().toLowerCase(),
            estado || 'Activo',
            (notas || '').trim()
        ];

        tdb.query(sql, values, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            
            // Homologar en vivo todas las placas que coincidan
            const syncPlacasSql = `
            UPDATE placas p
            SET p.cliente = ?, p.ruc_dni = IF(? != '', ?, p.ruc_dni)
            WHERE (p.ruc_dni IS NOT NULL AND p.ruc_dni != '' AND p.ruc_dni = ?)
               OR (
                   REPLACE(REPLACE(REPLACE(UPPER(p.cliente) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '') = 
                   REPLACE(REPLACE(REPLACE(UPPER(?) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '')
               );
            `;
            tdb.query(syncPlacasSql, [cleanRazon, cleanRuc, cleanRuc, cleanRuc, cleanRazon], () => {});

            res.json({ ok: true, id: result.insertId || result.id });
        });
    });

    // ── POST /api/clientes/sincronizar-todo (Vincular y homologar todas las placas con la tabla de clientes) ─
    router.post('/sincronizar-todo', (req, res) => {
        const tdb = getDb(req);
        const sql = `
        UPDATE placas p
        JOIN clientes c ON (p.ruc_dni IS NOT NULL AND p.ruc_dni != '' AND p.ruc_dni = c.ruc_dni)
                        OR (
                            REPLACE(REPLACE(REPLACE(UPPER(p.cliente) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '') = 
                            REPLACE(REPLACE(REPLACE(UPPER(c.razon_social) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '')
                        )
        SET p.cliente = c.razon_social, p.ruc_dni = IF(c.ruc_dni IS NOT NULL AND c.ruc_dni != '', c.ruc_dni, p.ruc_dni);
        `;
        tdb.query(sql, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, afectadas: result ? result.affectedRows : 0 });
        });
    });

    // ── PUT /api/clientes/:id (Editar cliente y cascadear a todas sus placas en vivo) ──
    router.put('/:id', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        const { ruc_dni, razon_social, direccion, telefono, email, estado, notas } = req.body;
        if (!razon_social) return res.status(400).json({ error: 'La Razón Social es requerida' });

        const newRuc = (ruc_dni || '').trim();
        const newRazon = razon_social.trim().toUpperCase();

        // 1. Obtener la Razón Social y RUC anteriores del cliente
        tdb.query('SELECT ruc_dni, razon_social FROM clientes WHERE id = ?', [id], (errOld, oldRows) => {
            const oldRuc = oldRows && oldRows.length ? oldRows[0].ruc_dni : '';
            const oldRazon = oldRows && oldRows.length ? oldRows[0].razon_social : '';

            // 2. Actualizar la tabla clientes
            const sqlUpdateClient = `
            UPDATE clientes 
            SET ruc_dni = ?, razon_social = ?, direccion = ?, telefono = ?, email = ?, estado = ?, notas = ?
            WHERE id = ?;
            `;
            const values = [newRuc, newRazon, (direccion || '').trim(), (telefono || '').trim(), (email || '').trim().toLowerCase(), estado || 'Activo', (notas || '').trim(), id];

            tdb.query(sqlUpdateClient, values, (errUp) => {
                if (errUp) return res.status(500).json({ error: errUp.message });

                // 3. Cascadear actualización a TODAS las placas vinculadas por RUC o Razón Social previa o limpia
                const sqlCascadePlacas = `
                UPDATE placas 
                SET cliente = ?, ruc_dni = ?
                WHERE (ruc_dni IS NOT NULL AND ruc_dni != '' AND (ruc_dni = ? OR ruc_dni = ?))
                   OR (
                       REPLACE(REPLACE(REPLACE(UPPER(cliente) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '') = 
                       REPLACE(REPLACE(REPLACE(UPPER(?) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '')
                   )
                   OR (
                       REPLACE(REPLACE(REPLACE(UPPER(cliente) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '') = 
                       REPLACE(REPLACE(REPLACE(UPPER(?) COLLATE utf8mb4_general_ci, '.', ''), ' ', ''), '-', '')
                   );
                `;
                tdb.query(sqlCascadePlacas, [newRazon, newRuc, newRuc, oldRuc, newRazon, oldRazon], (errPlacas, resPlacas) => {
                    if (errPlacas) console.warn('Error en cascada de placas:', errPlacas.message);
                    res.json({ ok: true, placasActualizadas: resPlacas ? resPlacas.affectedRows : 0 });
                });
            });
        });
    });

    // ── DELETE /api/clientes/:id ──────────────────────────────────────────
    router.delete('/:id', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        tdb.query('DELETE FROM clientes WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    });

    return router;
};
