const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Crear tabla de clientes si no existe
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
db.query(createTableQuery, (err) => {
    if (err) console.warn('Error inicializando tabla clientes:', err.message);
    else {
        // Auto-poblar clientes existentes desde la tabla de placas
        const populateQuery = `
        INSERT IGNORE INTO clientes (razon_social, ruc_dni)
        SELECT DISTINCT cliente, ruc_dni 
        FROM placas 
        WHERE cliente IS NOT NULL AND TRIM(cliente) <> '';
        `;
        db.query(populateQuery, (errPop) => {
            if (errPop) console.warn('Error poblando clientes desde placas:', errPop.message);
        });
    }
});

// ── GET /api/clientes (lista general con conteo de vehículos) ─────────
router.get('/', (req, res) => {
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
    LEFT JOIN placas p ON TRIM(LOWER(p.cliente)) = TRIM(LOWER(c.razon_social))
    GROUP BY c.id, c.ruc_dni, c.razon_social, c.direccion, c.telefono, c.email, c.estado, c.notas, c.fecha_creacion
    ORDER BY c.razon_social ASC;
    `;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ── GET /api/clientes/:id (detalle de cliente) ───────────────────────
router.get('/:id', (req, res) => {
    const id = req.params.id;
    db.query('SELECT * FROM clientes WHERE id = ?', [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(rows[0]);
    });
});

// ── GET /api/clientes/:id/flota (vehículos/placas del cliente) ───────
router.get('/:id/flota', (req, res) => {
    const id = req.params.id;
    db.query('SELECT razon_social FROM clientes WHERE id = ?', [id], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
        const razonSocial = rows[0].razon_social;
        const sql = `SELECT * FROM placas WHERE TRIM(LOWER(cliente)) = TRIM(LOWER(?)) ORDER BY placa ASC`;
        db.query(sql, [razonSocial], (errP, placas) => {
            if (errP) return res.status(500).json({ error: errP.message });
            res.json(placas);
        });
    });
});

// ── GET /api/clientes/:id/ots (Órdenes de Trabajo del cliente) ───────
router.get('/:id/ots', (req, res) => {
    const id = req.params.id;
    db.query('SELECT razon_social FROM clientes WHERE id = ?', [id], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
        const razonSocial = rows[0].razon_social;
        const sql = `
        SELECT ot.* 
        FROM ordenes_trabajo ot
        JOIN placas p ON UPPER(p.placa) = UPPER(ot.placa)
        WHERE TRIM(LOWER(p.cliente)) = TRIM(LOWER(?))
        ORDER BY ot.id_ot DESC
        LIMIT 100;
        `;
        db.query(sql, [razonSocial], (errOT, ots) => {
            if (errOT) return res.status(500).json({ error: errOT.message });
            res.json(ots);
        });
    });
});

// ── GET /api/clientes/:id/backlog (Backlogs del cliente) ─────────────
router.get('/:id/backlog', (req, res) => {
    const id = req.params.id;
    db.query('SELECT razon_social FROM clientes WHERE id = ?', [id], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
        const razonSocial = rows[0].razon_social;
        const sql = `
        SELECT b.* 
        FROM ot_backlog b
        JOIN placas p ON UPPER(p.placa) = UPPER(b.placa)
        WHERE TRIM(LOWER(p.cliente)) = TRIM(LOWER(?))
        ORDER BY b.id DESC;
        `;
        db.query(sql, [razonSocial], (errB, backlogs) => {
            if (errB) return res.status(500).json({ error: errB.message });
            res.json(backlogs);
        });
    });
});

// ── POST /api/clientes (Crear nuevo cliente) ─────────────────────────
router.post('/', (req, res) => {
    const { ruc_dni, razon_social, direccion, telefono, email, estado, notas } = req.body;
    if (!razon_social) return res.status(400).json({ error: 'La Razón Social es requerida' });

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
        (ruc_dni || '').trim(),
        razon_social.trim().toUpperCase(),
        (direccion || '').trim(),
        (telefono || '').trim(),
        (email || '').trim().toLowerCase(),
        estado || 'Activo',
        (notas || '').trim()
    ];

    db.query(sql, values, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, id: result.insertId || result.id });
    });
});

// ── PUT /api/clientes/:id (Editar cliente) ───────────────────────────
router.put('/:id', (req, res) => {
    const id = req.params.id;
    const { ruc_dni, razon_social, direccion, telefono, email, estado, notas } = req.body;
    if (!razon_social) return res.status(400).json({ error: 'La Razón Social es requerida' });

    const sql = `
    UPDATE clientes 
    SET ruc_dni = ?, razon_social = ?, direccion = ?, telefono = ?, email = ?, estado = ?, notas = ?
    WHERE id = ?;
    `;
    const values = [
        (ruc_dni || '').trim(),
        razon_social.trim().toUpperCase(),
        (direccion || '').trim(),
        (telefono || '').trim(),
        (email || '').trim().toLowerCase(),
        estado || 'Activo',
        (notas || '').trim(),
        id
    ];

    db.query(sql, values, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// ── DELETE /api/clientes/:id ──────────────────────────────────────────
router.delete('/:id', (req, res) => {
    const id = req.params.id;
    db.query('DELETE FROM clientes WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

module.exports = router;
