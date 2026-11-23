'use strict';
// Puntos de carga y descarga de cada cliente (operaciones_puntos, migración 11).
// Sirven para llenar rápido la dirección y el distrito de las guías sin escribirlos a mano cada vez.
const express = require('express');

const TIPOS = ['CARGA', 'DESCARGA'];

module.exports = (db, logAudit) => {
    const router = express.Router();
    const P = req => ((req && req.db) ? req.db : db).promise();
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo)) || 'sistema').slice(0, 150);
    const texto = (v, max) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null; };
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[puntos] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };

    function datosDe(b) {
        const tipo = String(b.tipo || '').toUpperCase();
        if (!TIPOS.includes(tipo)) throw aviso('Elige si es un punto de carga o de descarga.');
        const cliente = texto(b.cliente_nombre, 255);
        if (!cliente) throw aviso('Indica el cliente.');
        const nombre = texto(b.nombre, 150);
        if (!nombre) throw aviso('Escribe el nombre del punto.');
        const direccion = texto(b.direccion, 255);
        if (!direccion) throw aviso('Escribe la dirección.');
        const ubigeo = String(b.ubigeo ?? '').replace(/\D/g, '');
        if (ubigeo && ubigeo.length !== 6) throw aviso('El distrito (ubigeo) debe tener 6 dígitos.');
        const codigo = texto(b.codigo, 30);
        return { cliente_nombre: cliente, tipo, codigo: codigo ? codigo.toUpperCase() : null, nombre, direccion, ubigeo: ubigeo || null, referencia: texto(b.referencia, 255) };
    }

    // Dos puntos del mismo cliente y tipo no pueden tener el mismo código (o, sin código, el mismo nombre)
    async function repetido(p, d, idPropio) {
        const [r] = await p.query(
            `SELECT id FROM operaciones_puntos WHERE estado = 1 AND LOWER(TRIM(cliente_nombre)) = LOWER(?) AND tipo = ? AND id <> ?
               AND ${d.codigo ? 'UPPER(codigo) = ?' : 'LOWER(TRIM(nombre)) = LOWER(?)'} LIMIT 1`,
            [d.cliente_nombre, d.tipo, idPropio || 0, d.codigo || d.nombre]);
        return r.length > 0;
    }

    router.get('/', async (req, res) => {
        try {
            const donde = ['estado = 1']; const par = [];
            if (req.query.cliente) { donde.push('LOWER(TRIM(cliente_nombre)) = LOWER(?)'); par.push(String(req.query.cliente).trim()); }
            if (TIPOS.includes(String(req.query.tipo || '').toUpperCase())) { donde.push('tipo = ?'); par.push(String(req.query.tipo).toUpperCase()); }
            let rows = [];
            try {
                [rows] = await P(req).query(`SELECT id, cliente_nombre, tipo, codigo, nombre, direccion, ubigeo, referencia FROM operaciones_puntos WHERE ${donde.join(' AND ')} ORDER BY cliente_nombre, tipo, codigo, nombre LIMIT 3000`, par);
            } catch (e) {
                // Si la migración aún no se aplicó en esta empresa, la pantalla sigue funcionando sin catálogo
                if (e && e.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, data: [] });
                throw e;
            }
            res.json({ ok: true, data: rows });
        } catch (err) { responder(res, err, 'lista'); }
    });

    router.post('/', async (req, res) => {
        try {
            const p = P(req);
            const d = datosDe(req.body || {});
            if (await repetido(p, d, 0)) throw aviso(`Ya existe un punto de ${d.tipo === 'CARGA' ? 'carga' : 'descarga'} de ${d.cliente_nombre} con ese ${d.codigo ? 'código' : 'nombre'}.`, 409);
            const [r] = await p.query(
                `INSERT INTO operaciones_puntos (cliente_nombre, tipo, codigo, nombre, direccion, ubigeo, referencia, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [d.cliente_nombre, d.tipo, d.codigo, d.nombre, d.direccion, d.ubigeo, d.referencia, usuarioDe(req)]);
            if (logAudit) logAudit({ req, accion: 'CREAR_PUNTO', modulo: 'OPERACIONES', detalle: `Punto ${d.tipo.toLowerCase()} «${d.nombre}» de ${d.cliente_nombre}` });
            res.json({ ok: true, id: r.insertId, message: 'Punto guardado.' });
        } catch (err) { responder(res, err, 'crear'); }
    });

    router.put('/:id', async (req, res) => {
        try {
            const p = P(req);
            const d = datosDe(req.body || {});
            if (await repetido(p, d, Number(req.params.id))) throw aviso(`Ya existe otro punto de ${d.tipo === 'CARGA' ? 'carga' : 'descarga'} de ${d.cliente_nombre} con ese ${d.codigo ? 'código' : 'nombre'}.`, 409);
            const [r] = await p.query(
                `UPDATE operaciones_puntos SET cliente_nombre = ?, tipo = ?, codigo = ?, nombre = ?, direccion = ?, ubigeo = ?, referencia = ? WHERE id = ? AND estado = 1`,
                [d.cliente_nombre, d.tipo, d.codigo, d.nombre, d.direccion, d.ubigeo, d.referencia, req.params.id]);
            if (r.affectedRows !== 1) throw aviso('Punto no encontrado.', 404);
            if (logAudit) logAudit({ req, accion: 'EDITAR_PUNTO', modulo: 'OPERACIONES', detalle: `Punto ${d.tipo.toLowerCase()} «${d.nombre}» de ${d.cliente_nombre}` });
            res.json({ ok: true, message: 'Punto actualizado.' });
        } catch (err) { responder(res, err, 'editar'); }
    });

    // No se borra: queda inactivo, así las guías que ya usaron esa dirección no pierden nada
    router.delete('/:id', async (req, res) => {
        try {
            const [r] = await P(req).query(`UPDATE operaciones_puntos SET estado = 0 WHERE id = ? AND estado = 1`, [req.params.id]);
            if (r.affectedRows !== 1) throw aviso('Punto no encontrado.', 404);
            if (logAudit) logAudit({ req, accion: 'ELIMINAR_PUNTO', modulo: 'OPERACIONES', detalle: `Punto ${req.params.id}` });
            res.json({ ok: true, message: 'Punto eliminado.' });
        } catch (err) { responder(res, err, 'eliminar'); }
    });

    return router;
};
