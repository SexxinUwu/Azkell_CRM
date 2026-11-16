// Cuentas bancarias de proveedores y del personal (Tesorería). Las dos pantallas son la misma: cambia solo el titular.
//   proveedores → proveedor_cuentas_bancarias (titular = proveedores_inv.id)
//   personal    → persona_cuentas_bancarias   (titular = documento/DNI; sirve para conductores y RRHH)
// Cada titular tiene una cuenta principal: la que sale por defecto al elegirlo en un vale, una OC o una caja.
// Tablas y columnas: migración 35_cuentas_bancarias_principal.
const express = require('express');

const TIPOS_PROVEEDOR = ['CUENTA CORRIENTE', 'CUENTA DE AHORROS', 'CUENTA REMUNERADA', 'YAPE', 'PLIN'];
const MONEDAS = ['SOLES', 'DOLARES'];

const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : ''; };
const soloNumeros = v => String(v ?? '').replace(/[\s-]/g, '');

module.exports = (db, logAudit) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => getDb(req).promise();
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[cuentas-bancarias] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo)) || 'sistema').slice(0, 150);

    // Cada tipo sabe cómo se llama su tabla y su columna de titular
    const CONF = {
        proveedores: { tabla: 'proveedor_cuentas_bancarias', col: 'proveedor_id', etiqueta: 'proveedor' },
        personal: { tabla: 'persona_cuentas_bancarias', col: 'documento', etiqueta: 'persona' },
    };
    const confDe = req => { const c = CONF[req.params.tipo]; if (!c) throw aviso('Tipo de cuenta no válido.', 404); return c; };

    /** Valida y normaliza lo que llega del formulario */
    function leerCuenta(b, tipo) {
        const banco = texto(b.banco, 100);
        if (!banco) throw aviso('Elige el banco.');
        const numero = texto(b.numero_cuenta, 100);
        const cci = soloNumeros(texto(b.cci, 40));
        if (!numero && !cci) throw aviso('Escribe el número de cuenta o la CCI.');
        if (cci && !/^\d{20}$/.test(cci)) throw aviso('La CCI debe tener 20 dígitos.');
        let tipoCuenta = texto(b.tipo_cuenta, 30).toUpperCase() || 'CUENTA DE AHORROS';
        if (tipo === 'proveedores' && !TIPOS_PROVEEDOR.includes(tipoCuenta)) tipoCuenta = 'CUENTA CORRIENTE';
        const moneda = MONEDAS.includes(String(b.moneda || '').toUpperCase()) ? String(b.moneda).toUpperCase() : 'SOLES';
        return { banco, numero, cci: cci || null, tipoCuenta, moneda, detraccion: b.detraccion ? 1 : 0, principal: b.principal === true || b.principal === 1 || b.principal === '1' };
    }

    const colsLectura = tipo => (tipo === 'proveedores'
        ? 'id, banco, tipo_cuenta, moneda, numero_cuenta, cci, detraccion, principal, estado'
        : 'id, banco, tipo_cuenta, moneda, numero_cuenta, cci, 0 AS detraccion, principal, estado');

    /** Deja una sola cuenta principal por titular; si no hay ninguna marcada, la primera activa */
    async function ajustarPrincipal(conn, conf, titular, preferida) {
        const [filas] = await conn.query(`SELECT id, principal FROM ${conf.tabla} WHERE ${conf.col} = ? AND estado = 1 ORDER BY id`, [titular]);
        await conn.query(`UPDATE ${conf.tabla} SET principal = 0 WHERE ${conf.col} = ?`, [titular]);
        if (!filas.length) return;
        const elegida = (preferida && filas.find(f => f.id === preferida)) || filas.find(f => f.principal === 1) || filas[0];
        await conn.query(`UPDATE ${conf.tabla} SET principal = 1 WHERE id = ?`, [elegida.id]);
    }

    async function conTransaccion(req, fn) {
        const conn = await P(req).getConnection();
        try { await conn.beginTransaction(); const r = await fn(conn); await conn.commit(); return r; }
        catch (e) { try { await conn.rollback(); } catch (_) { /* nada */ } throw e; }
        finally { conn.release(); }
    }

    // Titulares con sus cuentas activas. ?q busca por nombre o documento. ?sin_cuenta=1 deja solo los que no tienen ninguna.
    router.get('/:tipo', async (req, res) => {
        try {
            const conf = confDe(req); const p = P(req);
            const q = texto(req.query.q, 60); const like = q ? `%${q}%` : null;
            let titulares = [];
            if (req.params.tipo === 'proveedores') {
                const [rows] = await p.query(`SELECT id, nombre, numero_documento AS doc FROM proveedores_inv ${like ? 'WHERE nombre LIKE ? OR numero_documento LIKE ?' : ''} ORDER BY nombre LIMIT 1000`, like ? [like, like] : []);
                titulares = rows.map(r => ({ titular: String(r.id), nombre: r.nombre, doc: r.doc || '', origen: 'Proveedor' }));
            } else {
                // Conductores + personal de RRHH + quien ya tenga cuenta registrada, sin repetir el documento
                const filtro = campos => (like ? `AND (${campos.map(c => `${c} LIKE ?`).join(' OR ')})` : '');
                const par = n => (like ? Array(n).fill(like) : []);
                const [cond] = await p.query(`SELECT TRIM(dni) AS doc, nombre FROM conductores WHERE estado = 'Activo' AND TRIM(dni) <> '' ${filtro(['nombre', 'dni'])} ORDER BY nombre LIMIT 1000`, par(2));
                let rrhh = [];
                try { [rrhh] = await p.query(`SELECT TRIM(numero_documento) AS doc, TRIM(CONCAT(nombres, ' ', apellidos)) AS nombre FROM rrhh_personal WHERE TRIM(numero_documento) <> '' ${filtro(["CONCAT(nombres,' ',apellidos)", 'numero_documento'])} ORDER BY nombres LIMIT 1000`, par(2)); } catch (e) { rrhh = []; }
                const [otros] = await p.query(`SELECT documento AS doc, MAX(nombre) AS nombre FROM persona_cuentas_bancarias WHERE estado = 1 ${filtro(['nombre', 'documento'])} GROUP BY documento`, par(2));
                const mapa = new Map();
                for (const [lista, origen] of [[cond, 'Conductor'], [rrhh, 'Personal'], [otros, 'Personal']]) {
                    for (const r of lista) if (!mapa.has(r.doc)) mapa.set(r.doc, { titular: r.doc, nombre: r.nombre || r.doc, doc: r.doc, origen });
                }
                titulares = [...mapa.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
            }
            let cuentas = [];
            if (titulares.length) [cuentas] = await p.query(`SELECT ${conf.col} AS titular, ${colsLectura(req.params.tipo)} FROM ${conf.tabla} WHERE estado = 1 AND ${conf.col} IN (?) ORDER BY principal DESC, id`, [titulares.map(t => t.titular)]);
            const porTitular = new Map();
            for (const c of cuentas) { const k = String(c.titular); if (!porTitular.has(k)) porTitular.set(k, []); porTitular.get(k).push({ ...c, titular: undefined }); }
            let data = titulares.map(t => ({ ...t, cuentas: porTitular.get(t.titular) || [] }));
            if (req.query.sin_cuenta === '1') data = data.filter(t => !t.cuentas.length);
            res.json({ ok: true, data });
        } catch (err) { responder(res, err, 'listar'); }
    });

    // Agregar una cuenta a un titular. La primera cuenta queda como principal.
    router.post('/:tipo/titular/:titular', async (req, res) => {
        try {
            const conf = confDe(req); const b = req.body || {};
            const c = leerCuenta(b, req.params.tipo);
            const titular = texto(req.params.titular, 40);
            const nombre = texto(b.nombre, 200);
            const id = await conTransaccion(req, async conn => {
                const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM ${conf.tabla} WHERE ${conf.col} = ? AND estado = 1`, [titular]);
                let r;
                if (req.params.tipo === 'proveedores') {
                    [r] = await conn.query('INSERT INTO proveedor_cuentas_bancarias (proveedor_id, banco, moneda, tipo_cuenta, numero_cuenta, cci, detraccion, estado, principal) VALUES (?,?,?,?,?,?,?,1,0)',
                        [titular, c.banco, c.moneda, c.tipoCuenta, c.numero, c.cci, c.detraccion]);
                } else {
                    [r] = await conn.query('INSERT INTO persona_cuentas_bancarias (documento, nombre, banco, tipo_cuenta, moneda, numero_cuenta, cci, estado, principal) VALUES (?,?,?,?,?,?,?,1,0)',
                        [titular, nombre, c.banco, c.tipoCuenta, c.moneda, c.numero, c.cci]);
                }
                await ajustarPrincipal(conn, conf, titular, n === 0 || c.principal ? r.insertId : null);
                return r.insertId;
            });
            if (typeof logAudit === 'function') logAudit(req, 'TESORERIA', 'Cuentas bancarias', 'CREÓ', `Cuenta ${c.banco} de ${conf.etiqueta} ${titular} (${req.params.tipo})`);
            res.json({ ok: true, id });
        } catch (err) { responder(res, err, 'crear'); }
    });

    // Editar una cuenta
    router.put('/:tipo/cuenta/:id', async (req, res) => {
        try {
            const conf = confDe(req); const b = req.body || {};
            const c = leerCuenta(b, req.params.tipo); const id = Number(req.params.id);
            await conTransaccion(req, async conn => {
                const [[fila]] = await conn.query(`SELECT ${conf.col} AS titular FROM ${conf.tabla} WHERE id = ?`, [id]);
                if (!fila) throw aviso('La cuenta no existe.', 404);
                if (req.params.tipo === 'proveedores') {
                    await conn.query('UPDATE proveedor_cuentas_bancarias SET banco=?, moneda=?, tipo_cuenta=?, numero_cuenta=?, cci=?, detraccion=? WHERE id=?', [c.banco, c.moneda, c.tipoCuenta, c.numero, c.cci, c.detraccion, id]);
                } else {
                    await conn.query('UPDATE persona_cuentas_bancarias SET banco=?, moneda=?, tipo_cuenta=?, numero_cuenta=?, cci=? WHERE id=?', [c.banco, c.moneda, c.tipoCuenta, c.numero, c.cci, id]);
                }
                if (c.principal) await ajustarPrincipal(conn, conf, String(fila.titular), id);
            });
            if (typeof logAudit === 'function') logAudit(req, 'TESORERIA', 'Cuentas bancarias', 'MODIFICÓ', `Cuenta ${id} (${req.params.tipo})`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'editar'); }
    });

    // Marcar una cuenta como principal
    router.post('/:tipo/cuenta/:id/principal', async (req, res) => {
        try {
            const conf = confDe(req); const id = Number(req.params.id);
            await conTransaccion(req, async conn => {
                const [[fila]] = await conn.query(`SELECT ${conf.col} AS titular, estado FROM ${conf.tabla} WHERE id = ?`, [id]);
                if (!fila) throw aviso('La cuenta no existe.', 404);
                if (!fila.estado) throw aviso('Esa cuenta está dada de baja.');
                await ajustarPrincipal(conn, conf, String(fila.titular), id);
            });
            if (typeof logAudit === 'function') logAudit(req, 'TESORERIA', 'Cuentas bancarias', 'MODIFICÓ', `Cuenta principal ${id} (${req.params.tipo})`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'principal'); }
    });

    // Dar de baja una cuenta (no se borra, para no perder el historial de pagos). Si era la principal, pasa la siguiente.
    router.delete('/:tipo/cuenta/:id', async (req, res) => {
        try {
            const conf = confDe(req); const id = Number(req.params.id);
            await conTransaccion(req, async conn => {
                const [[fila]] = await conn.query(`SELECT ${conf.col} AS titular FROM ${conf.tabla} WHERE id = ?`, [id]);
                if (!fila) throw aviso('La cuenta no existe.', 404);
                await conn.query(`UPDATE ${conf.tabla} SET estado = 0, principal = 0 WHERE id = ?`, [id]);
                await ajustarPrincipal(conn, conf, String(fila.titular), null);
            });
            if (typeof logAudit === 'function') logAudit(req, 'TESORERIA', 'Cuentas bancarias', 'ELIMINÓ', `Cuenta ${id} (${req.params.tipo}) dada de baja por ${usuarioDe(req)}`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'baja'); }
    });

    return router;
};
