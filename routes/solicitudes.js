// Solicitudes: cualquier usuario pide algo (agregar proveedor, cliente o cuenta bancaria) y quien tiene el permiso de
// aprobar ese tipo lo revisa. Al aprobarse, el sistema lo aplica solo. Todo paso queda en solicitudes_historial.
// Tablas: migración 36_solicitudes. Cada usuario ve solo lo suyo; ver todo y aprobar es el permiso de Gerencia › Aprobación de solicitudes.
const express = require('express');

const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : ''; };
const soloDigitos = v => String(v ?? '').replace(/\D/g, '');
const BANCOS_TIPOS = ['CUENTA CORRIENTE', 'CUENTA DE AHORROS', 'CUENTA REMUNERADA', 'YAPE', 'PLIN'];
const MONEDAS = ['SOLES', 'DOLARES'];

/** Campos de cada tipo: el formulario del frontend se arma con esta lista (key, etiqueta, tipo, requerido). */
const CAMPOS_CUENTA = [
    { key: 'banco', label: 'Banco', tipo: 'texto', requerido: true, ayuda: 'Ej: BCP, BBVA, Interbank' },
    { key: 'tipo_cuenta', label: 'Tipo de cuenta', tipo: 'select', opciones: BANCOS_TIPOS, defecto: 'CUENTA CORRIENTE' },
    { key: 'moneda', label: 'Moneda', tipo: 'select', opciones: MONEDAS, defecto: 'SOLES' },
    { key: 'numero_cuenta', label: 'Número de cuenta', tipo: 'texto' },
    { key: 'cci', label: 'CCI (20 dígitos)', tipo: 'texto' },
];

module.exports = (db, logAudit, generarCodigoAlmacen) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => getDb(req).promise();
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[solicitudes] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo)) || 'sistema').slice(0, 150);

    // ── Permisos: pedir = cualquier usuario y cada quien ve solo lo suyo. Gerencia › Aprobación de solicitudes (módulo
    //    gerencia_aprobaciones_solicitudes): «Ver» permite ver todas y su historial; «Aprobar» permite aprobar y rechazar. ──
    const MODULO_GERENCIA = 'gerencia_aprobaciones_solicitudes';
    const permisosDe = req => {
        try { const p = typeof req.user.permisos === 'string' ? JSON.parse(req.user.permisos) : req.user.permisos; return p || {}; } catch (e) { return {}; }
    };
    const esAdmin = req => !!req.user && (req.user.rol === 'Fundador' || permisosDe(req).admin === true);
    const puedeAprobar = req => {
        if (esAdmin(req)) return true;
        const m = permisosDe(req)[MODULO_GERENCIA];
        return !!m && (m.a === 1 || m.a === true);
    };
    const puedeVerTodas = req => {
        if (esAdmin(req)) return true;
        const m = permisosDe(req)[MODULO_GERENCIA];
        return !!m && (m.l === 1 || m.l === true || m.a === 1 || m.a === true);
    };

    // ── Tipos de solicitud ──
    const TIPOS = {
        proveedor: {
            etiqueta: 'Agregar proveedor', icono: 'Truck',
            descripcion: 'Pide dar de alta un proveedor nuevo con sus datos clave. Al aprobarse queda en Terceros › Proveedores.',
            campos: [
                { key: 'tipo_documento', label: 'Tipo de documento', tipo: 'select', opciones: ['RUC', 'DNI'], defecto: 'RUC' },
                { key: 'numero_documento', label: 'RUC o DNI', tipo: 'texto', requerido: true },
                { key: 'razon_social', label: 'Razón social o nombre', tipo: 'texto', requerido: true },
                { key: 'telefono', label: 'Teléfono', tipo: 'texto' },
                { key: 'email', label: 'Correo', tipo: 'texto' },
                { key: 'direccion', label: 'Dirección', tipo: 'texto', ancho: true },
                ...CAMPOS_CUENTA.map(c => ({ ...c, requerido: false })),
                { key: 'observaciones', label: 'Observaciones', tipo: 'area', ancho: true },
            ],
            titulo: d => `Proveedor ${d.razon_social} (${d.numero_documento})`,
            async validar(req, d) {
                const doc = soloDigitos(d.numero_documento);
                if (d.tipo_documento === 'RUC' && doc.length !== 11) throw aviso('El RUC debe tener 11 dígitos.');
                if (d.tipo_documento === 'DNI' && doc.length !== 8) throw aviso('El DNI debe tener 8 dígitos.');
                d.numero_documento = doc;
                validarCuenta(d, false);
                const [dup] = await P(req).query("SELECT id, nombre FROM proveedores_inv WHERE REPLACE(numero_documento,' ','') = ? LIMIT 1", [doc]);
                if (dup.length) throw aviso(`Ese documento ya está registrado como proveedor: ${dup[0].nombre} (${dup[0].id}). No hace falta pedirlo.`, 409);
            },
            clave: d => d.numero_documento,
            async aplicar(req, conn, d) {
                // Doble control: pudo registrarse mientras la solicitud esperaba
                const [dup] = await conn.query("SELECT id, nombre FROM proveedores_inv WHERE REPLACE(numero_documento,' ','') = ? LIMIT 1", [d.numero_documento]);
                if (dup.length) throw aviso(`Ya existe un proveedor con ese documento: ${dup[0].nombre} (${dup[0].id}). Rechaza la solicitud.`, 409);
                const id = await new Promise((ok, ko) => generarCodigoAlmacen('PROV', null, (e, x) => (e ? ko(e) : ok(x)), getDb(req)));
                const [ins] = await conn.query(
                    'INSERT INTO proveedores_inv (id,nombre,razon_social,tipo_documento,numero_documento,telefono,email,direccion,estado,observaciones) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    [id, d.razon_social, d.razon_social, d.tipo_documento || 'RUC', d.numero_documento, d.telefono || null, d.email || null, d.direccion || null, 'Activo', d.observaciones || null]);
                if (ins.affectedRows !== 1) throw new Error('No se pudo crear el proveedor.');
                if (d.numero_cuenta || d.cci) {
                    const [c] = await conn.query(
                        'INSERT INTO proveedor_cuentas_bancarias (proveedor_id, banco, tipo_cuenta, numero_cuenta, moneda, cci, principal, estado) VALUES (?,?,?,?,?,?,1,1)',
                        [id, d.banco, d.tipo_cuenta || 'CUENTA CORRIENTE', d.numero_cuenta || '', d.moneda || 'SOLES', d.cci || null]);
                    if (c.affectedRows !== 1) throw new Error('No se pudo registrar la cuenta del proveedor.');
                }
                return { entidad: 'proveedor', id, ver: '/terceros/proveedores' };
            },
        },
        cliente: {
            etiqueta: 'Agregar cliente', icono: 'Users',
            descripcion: 'Pide dar de alta un cliente nuevo. Al aprobarse queda en Terceros › Clientes.',
            campos: [
                { key: 'ruc_dni', label: 'RUC o DNI', tipo: 'texto', requerido: true },
                { key: 'razon_social', label: 'Razón social o nombre', tipo: 'texto', requerido: true },
                { key: 'telefono', label: 'Teléfono', tipo: 'texto' },
                { key: 'email', label: 'Correo', tipo: 'texto' },
                { key: 'direccion', label: 'Dirección', tipo: 'texto', ancho: true },
                { key: 'notas', label: 'Notas', tipo: 'area', ancho: true },
            ],
            titulo: d => `Cliente ${d.razon_social} (${d.ruc_dni})`,
            async validar(req, d) {
                const doc = soloDigitos(d.ruc_dni);
                if (doc.length !== 11 && doc.length !== 8) throw aviso('Escribe un RUC de 11 dígitos o un DNI de 8.');
                d.ruc_dni = doc;
                const [dup] = await P(req).query("SELECT id, razon_social FROM clientes WHERE REPLACE(ruc_dni,' ','') = ? LIMIT 1", [doc]);
                if (dup.length) throw aviso(`Ese documento ya está registrado como cliente: ${dup[0].razon_social}. No hace falta pedirlo.`, 409);
            },
            clave: d => d.ruc_dni,
            async aplicar(req, conn, d) {
                const [dup] = await conn.query("SELECT id, razon_social FROM clientes WHERE REPLACE(ruc_dni,' ','') = ? LIMIT 1", [d.ruc_dni]);
                if (dup.length) throw aviso(`Ya existe un cliente con ese documento: ${dup[0].razon_social}. Rechaza la solicitud.`, 409);
                const [ins] = await conn.query(
                    'INSERT INTO clientes (ruc_dni, razon_social, direccion, telefono, email, estado, notas) VALUES (?,?,?,?,?,?,?)',
                    [d.ruc_dni, String(d.razon_social).toUpperCase(), d.direccion || '', d.telefono || '', String(d.email || '').toLowerCase(), 'Activo', d.notas || '']);
                if (ins.affectedRows !== 1) throw new Error('No se pudo crear el cliente.');
                return { entidad: 'cliente', id: ins.insertId, ver: '/terceros/clientes' };
            },
        },
        cuenta_bancaria: {
            etiqueta: 'Agregar cuenta bancaria', icono: 'Landmark',
            descripcion: 'Pide registrar una cuenta bancaria a un proveedor o a una persona del personal. Al aprobarse queda en Tesorería.',
            campos: [
                { key: 'titular_tipo', label: 'La cuenta es de', tipo: 'select', opciones: ['PROVEEDOR', 'PERSONAL'], defecto: 'PROVEEDOR', requerido: true },
                { key: 'titular_doc', label: 'RUC o DNI del titular', tipo: 'texto', requerido: true, ayuda: 'Debe estar registrado como proveedor o personal' },
                { key: 'titular_nombre', label: 'Nombre del titular', tipo: 'texto', requerido: true },
                ...CAMPOS_CUENTA,
            ],
            titulo: d => `Cuenta ${d.banco} de ${d.titular_nombre}`,
            async validar(req, d) {
                d.titular_doc = soloDigitos(d.titular_doc);
                if (!d.titular_doc) throw aviso('Escribe el RUC o DNI del titular.');
                validarCuenta(d, true);
                await titularDe(P(req), d); // que exista
            },
            clave: d => `${d.titular_doc}|${soloDigitos(d.numero_cuenta || d.cci)}`,
            async aplicar(req, conn, d) {
                const t = await titularDe(conn, d);
                if (t.tabla === 'proveedor_cuentas_bancarias') {
                    const [r] = await conn.query('SELECT COUNT(*) n FROM proveedor_cuentas_bancarias WHERE proveedor_id = ? AND estado = 1', [t.id]);
                    const [c] = await conn.query('INSERT INTO proveedor_cuentas_bancarias (proveedor_id, banco, tipo_cuenta, numero_cuenta, moneda, cci, principal, estado) VALUES (?,?,?,?,?,?,?,1)',
                        [t.id, d.banco, d.tipo_cuenta || 'CUENTA CORRIENTE', d.numero_cuenta || '', d.moneda || 'SOLES', d.cci || null, r[0].n === 0 ? 1 : 0]);
                    if (c.affectedRows !== 1) throw new Error('No se pudo registrar la cuenta.');
                    return { entidad: 'cuenta de proveedor', id: c.insertId, ver: '/tesoreria/cuentas-proveedores' };
                }
                const [r] = await conn.query('SELECT COUNT(*) n FROM persona_cuentas_bancarias WHERE documento = ? AND estado = 1', [d.titular_doc]);
                const [c] = await conn.query('INSERT INTO persona_cuentas_bancarias (documento, nombre, banco, tipo_cuenta, moneda, numero_cuenta, cci, principal, estado) VALUES (?,?,?,?,?,?,?,?,1)',
                    [d.titular_doc, d.titular_nombre, d.banco, d.tipo_cuenta || 'CUENTA DE AHORROS', d.moneda || 'SOLES', d.numero_cuenta || '', d.cci || null, r[0].n === 0 ? 1 : 0]);
                if (c.affectedRows !== 1) throw new Error('No se pudo registrar la cuenta.');
                return { entidad: 'cuenta del personal', id: c.insertId, ver: '/tesoreria/cuentas-personal' };
            },
        },
    };

    /** Banco obligatorio, número o CCI, y CCI de 20 dígitos (mismas reglas que Tesorería › Cuentas) */
    function validarCuenta(d, obligatoria) {
        const hay = d.banco || d.numero_cuenta || d.cci;
        if (!hay && !obligatoria) return;
        if (!d.banco) throw aviso('Indica el banco.');
        if (!d.numero_cuenta && !d.cci) throw aviso('Escribe el número de cuenta o el CCI.');
        if (d.cci) { d.cci = soloDigitos(d.cci); if (d.cci.length !== 20) throw aviso('El CCI debe tener 20 dígitos.'); }
        if (d.tipo_cuenta && !BANCOS_TIPOS.includes(d.tipo_cuenta)) throw aviso('Tipo de cuenta no válido.');
        if (d.moneda && !MONEDAS.includes(d.moneda)) throw aviso('Moneda no válida.');
    }

    /** El titular debe existir: proveedor (por documento) o persona del personal / conductor (por DNI) */
    async function titularDe(conn, d) {
        if (d.titular_tipo === 'PROVEEDOR') {
            const [p] = await conn.query("SELECT id FROM proveedores_inv WHERE REPLACE(numero_documento,' ','') = ? LIMIT 1", [d.titular_doc]);
            if (!p.length) throw aviso('Ese proveedor no está registrado: primero pide «Agregar proveedor».');
            return { tabla: 'proveedor_cuentas_bancarias', id: p[0].id };
        }
        const [c] = await conn.query('SELECT 1 FROM conductores WHERE TRIM(dni) = ? LIMIT 1', [d.titular_doc]);
        let existe = c.length > 0;
        if (!existe) { try { const [r] = await conn.query('SELECT 1 FROM rrhh_personal WHERE TRIM(numero_documento) = ? LIMIT 1', [d.titular_doc]); existe = r.length > 0; } catch (e) { /* sin RRHH */ } }
        if (!existe) throw aviso('Esa persona no está registrada en RRHH › Personal.');
        return { tabla: 'persona_cuentas_bancarias', id: d.titular_doc };
    }

    async function codigoNuevo(conn) {
        const anio = new Date().getFullYear();
        const [u] = await conn.query('SELECT codigo FROM solicitudes WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [`SOL-${anio}-%`]);
        const n = u.length ? (parseInt(String(u[0].codigo).split('-').pop(), 10) || 0) + 1 : 1;
        return `SOL-${anio}-${String(n).padStart(5, '0')}`;
    }
    const historial = (conn, id, accion, usuario, comentario) =>
        conn.query('INSERT INTO solicitudes_historial (solicitud_id, accion, usuario, comentario) VALUES (?,?,?,?)', [id, accion, usuario, comentario || null]);

    const fila = (r, req) => ({
        id: r.id, codigo: r.codigo, tipo: r.tipo, tipo_etiqueta: TIPOS[r.tipo] ? TIPOS[r.tipo].etiqueta : r.tipo, estado: r.estado, titulo: r.titulo,
        motivo: r.motivo, solicitante: r.solicitante, revisado_por: r.revisado_por, revisado_en: r.revisado_en, comentario_revision: r.comentario_revision,
        created_at: r.created_at, puede_aprobar: r.estado === 'PENDIENTE' && puedeAprobar(req) && (esAdmin(req) || r.solicitante !== usuarioDe(req)),
        es_mia: r.solicitante === usuarioDe(req),
    });

    // Tipos con sus campos, y si el usuario puede aprobar cada uno
    router.get('/tipos', (req, res) => {
        res.json({
            ok: true,
            data: Object.entries(TIPOS).map(([tipo, t]) => ({ tipo, etiqueta: t.etiqueta, descripcion: t.descripcion, icono: t.icono, campos: t.campos, puede_aprobar: puedeAprobar(req) })),
            puede_aprobar_alguno: puedeAprobar(req),
            puede_ver_todas: puedeVerTodas(req),
        });
    });

    // Lista: ?vista=mias (por defecto: solo lo que subió este usuario) | gerencia (todas, para quien puede verlas)
    router.get('/', async (req, res) => {
        try {
            const vista = String(req.query.vista || 'mias');
            let sql = 'SELECT * FROM solicitudes'; const params = [];
            if (vista === 'gerencia') {
                if (!puedeVerTodas(req)) throw aviso('No tienes permiso para ver todas las solicitudes.', 403);
            } else { sql += ' WHERE solicitante = ?'; params.push(usuarioDe(req)); }
            sql += ' ORDER BY id DESC LIMIT 1000';
            const [rows] = await P(req).query(sql, params);
            res.json({ ok: true, data: rows.map(r => fila(r, req)) });
        } catch (e) { responder(res, e, 'GET /'); }
    });

    router.get('/:id', async (req, res) => {
        try {
            const [r] = await P(req).query('SELECT * FROM solicitudes WHERE id = ?', [req.params.id]);
            if (!r.length) throw aviso('Solicitud no encontrada.', 404);
            const s = r[0];
            if (s.solicitante !== usuarioDe(req) && !puedeVerTodas(req)) throw aviso('No tienes acceso a esta solicitud.', 403);
            const [h] = await P(req).query('SELECT accion, usuario, comentario, created_at FROM solicitudes_historial WHERE solicitud_id = ? ORDER BY id', [s.id]);
            let datos = {}; let resultado = null;
            try { datos = JSON.parse(s.datos_json || '{}'); } catch (e) { datos = {}; }
            try { resultado = s.resultado_json ? JSON.parse(s.resultado_json) : null; } catch (e) { resultado = null; }
            res.json({ ok: true, data: { ...fila(s, req), datos, resultado, historial: h, campos: TIPOS[s.tipo] ? TIPOS[s.tipo].campos : [] } });
        } catch (e) { responder(res, e, 'GET /:id'); }
    });

    router.post('/', async (req, res) => {
        const conn = await P(req).getConnection();
        try {
            const b = req.body || {};
            const tipo = TIPOS[b.tipo];
            if (!tipo) throw aviso('Elige el tipo de solicitud.');
            const d = {};
            for (const c of tipo.campos) d[c.key] = texto((b.datos || {})[c.key], c.tipo === 'area' ? 500 : 200) || (c.defecto || '');
            for (const c of tipo.campos) if (c.requerido && !d[c.key]) throw aviso(`Falta «${c.label}».`);
            await tipo.validar(req, d);
            const motivo = texto(b.motivo, 500);
            // No repetir: una solicitud pendiente igual
            const [pend] = await conn.query("SELECT codigo, datos_json FROM solicitudes WHERE tipo = ? AND estado = 'PENDIENTE'", [b.tipo]);
            for (const p of pend) {
                let x = {}; try { x = JSON.parse(p.datos_json || '{}'); } catch (e) { /* ignorar */ }
                if (tipo.clave(x) === tipo.clave(d)) throw aviso(`Ya hay una solicitud pendiente igual (${p.codigo}). Espera su respuesta.`, 409);
            }
            await conn.beginTransaction();
            const codigo = await codigoNuevo(conn);
            const [ins] = await conn.query('INSERT INTO solicitudes (codigo, tipo, estado, titulo, datos_json, motivo, solicitante) VALUES (?,?,?,?,?,?,?)',
                [codigo, b.tipo, 'PENDIENTE', tipo.titulo(d).slice(0, 200), JSON.stringify(d), motivo || null, usuarioDe(req)]);
            if (ins.affectedRows !== 1) throw new Error('No se pudo registrar la solicitud.');
            await historial(conn, ins.insertId, 'ENVIADA', usuarioDe(req), motivo);
            await conn.commit();
            if (typeof logAudit === 'function') logAudit(req, 'SOLICITUDES', 'Solicitudes', 'CREÓ', `${codigo}: ${tipo.titulo(d)}`);
            res.json({ ok: true, id: ins.insertId, codigo });
        } catch (e) { try { await conn.rollback(); } catch (x) { /* sin transacción */ } responder(res, e, 'POST /'); } finally { conn.release(); }
    });

    router.post('/:id/aprobar', async (req, res) => {
        const conn = await P(req).getConnection();
        try {
            await conn.beginTransaction();
            const [r] = await conn.query('SELECT * FROM solicitudes WHERE id = ? FOR UPDATE', [req.params.id]);
            if (!r.length) throw aviso('Solicitud no encontrada.', 404);
            const s = r[0];
            if (s.estado !== 'PENDIENTE') throw aviso(`La solicitud ya está ${s.estado.toLowerCase()}.`, 409);
            if (!puedeAprobar(req)) throw aviso('No tienes permiso para aprobar solicitudes (Gerencia › Aprobación de solicitudes).', 403);
            if (!esAdmin(req) && s.solicitante === usuarioDe(req)) throw aviso('No puedes aprobar tu propia solicitud: debe hacerlo otra persona.', 403);
            const tipo = TIPOS[s.tipo];
            if (!tipo) throw aviso('Tipo de solicitud desconocido.');
            let d = {}; try { d = JSON.parse(s.datos_json || '{}'); } catch (e) { d = {}; }
            const resultado = await tipo.aplicar(req, conn, d);
            const comentario = texto((req.body || {}).comentario, 500);
            const [u] = await conn.query("UPDATE solicitudes SET estado = 'APROBADA', revisado_por = ?, revisado_en = NOW(), comentario_revision = ?, resultado_json = ? WHERE id = ? AND estado = 'PENDIENTE'",
                [usuarioDe(req), comentario || null, JSON.stringify(resultado), s.id]);
            if (u.affectedRows !== 1) throw new Error('No se pudo cerrar la solicitud.');
            await historial(conn, s.id, 'APROBADA', usuarioDe(req), comentario);
            await conn.commit();
            if (typeof logAudit === 'function') logAudit(req, 'SOLICITUDES', 'Solicitudes', 'APROBÓ', `${s.codigo}: ${s.titulo}`);
            res.json({ ok: true, resultado });
        } catch (e) { try { await conn.rollback(); } catch (x) { /* sin transacción */ } responder(res, e, 'aprobar'); } finally { conn.release(); }
    });

    router.post('/:id/rechazar', async (req, res) => {
        const conn = await P(req).getConnection();
        try {
            const comentario = texto((req.body || {}).comentario, 500);
            if (!comentario) throw aviso('Escribe el motivo del rechazo.');
            await conn.beginTransaction();
            const [r] = await conn.query('SELECT * FROM solicitudes WHERE id = ? FOR UPDATE', [req.params.id]);
            if (!r.length) throw aviso('Solicitud no encontrada.', 404);
            const s = r[0];
            if (s.estado !== 'PENDIENTE') throw aviso(`La solicitud ya está ${s.estado.toLowerCase()}.`, 409);
            if (!puedeAprobar(req)) throw aviso('No tienes permiso para revisar solicitudes (Gerencia › Aprobación de solicitudes).', 403);
            const [u] = await conn.query("UPDATE solicitudes SET estado = 'RECHAZADA', revisado_por = ?, revisado_en = NOW(), comentario_revision = ? WHERE id = ? AND estado = 'PENDIENTE'", [usuarioDe(req), comentario, s.id]);
            if (u.affectedRows !== 1) throw new Error('No se pudo cerrar la solicitud.');
            await historial(conn, s.id, 'RECHAZADA', usuarioDe(req), comentario);
            await conn.commit();
            if (typeof logAudit === 'function') logAudit(req, 'SOLICITUDES', 'Solicitudes', 'RECHAZÓ', `${s.codigo}: ${comentario}`);
            res.json({ ok: true });
        } catch (e) { try { await conn.rollback(); } catch (x) { /* sin transacción */ } responder(res, e, 'rechazar'); } finally { conn.release(); }
    });

    router.post('/:id/cancelar', async (req, res) => {
        const conn = await P(req).getConnection();
        try {
            await conn.beginTransaction();
            const [r] = await conn.query('SELECT * FROM solicitudes WHERE id = ? FOR UPDATE', [req.params.id]);
            if (!r.length) throw aviso('Solicitud no encontrada.', 404);
            const s = r[0];
            if (s.solicitante !== usuarioDe(req) && !esAdmin(req)) throw aviso('Solo quien la pidió puede cancelarla.', 403);
            if (s.estado !== 'PENDIENTE') throw aviso(`La solicitud ya está ${s.estado.toLowerCase()}.`, 409);
            const [u] = await conn.query("UPDATE solicitudes SET estado = 'CANCELADA' WHERE id = ? AND estado = 'PENDIENTE'", [s.id]);
            if (u.affectedRows !== 1) throw new Error('No se pudo cancelar.');
            await historial(conn, s.id, 'CANCELADA', usuarioDe(req), null);
            await conn.commit();
            res.json({ ok: true });
        } catch (e) { try { await conn.rollback(); } catch (x) { /* sin transacción */ } responder(res, e, 'cancelar'); } finally { conn.release(); }
    });

    return router;
};
