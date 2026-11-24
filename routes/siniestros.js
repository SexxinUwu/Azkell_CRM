'use strict';
// Control de siniestros, daños e incidencias de flota (mantenimiento_siniestros, migración 12).
// Registro, importación desde Excel y el resumen que alimenta las gráficas. Las horas de taller y el costo total
// los calcula siempre el servidor, así un Excel o un formulario no pueden dejarlos inconsistentes.
const express = require('express');
const multer = require('multer');
const { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrlEstable } = require('../utils/s3');

// Evidencias del daño: fotos, PDF y videos (el cliente sube de a uno por solicitud; el video puede pesar más)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 10 } });
const TIPO_POR_EXT = { jpg: 'foto', jpeg: 'foto', png: 'foto', webp: 'foto', gif: 'foto', heic: 'foto', heif: 'foto', pdf: 'pdf', mp4: 'video', mov: 'video', webm: 'video', m4v: 'video', '3gp': 'video', avi: 'video', mkv: 'video' };
const tipoDeArchivo = (nombre, mime) => {
    if (/^video\//.test(mime || '')) return 'video';
    if (/^image\//.test(mime || '')) return 'foto';
    if (mime === 'application/pdf') return 'pdf';
    const ext = String(nombre || '').split('?')[0].split('.').pop().toLowerCase();
    return TIPO_POR_EXT[ext] || 'foto';
};

const ESTADOS = ['Concluido', 'En Reparación', 'Pendiente Repuestos'];

module.exports = (db, logAudit) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => getDb(req).promise();
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo)) || 'sistema').slice(0, 150);
    const texto = (v, max) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null; };
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[siniestros] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };
    const dinero = v => {
        const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
        return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
    };

    /** «2026-10-02», «2026-10-02 14:00» o «2026-10-02T14:00» → milisegundos (en UTC, sin zona horaria: solo sirve para restar) */
    const msDe = s => {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(s ?? '').trim());
        return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
    };
    const sqlFecha = s => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s ?? '')); return m ? m[1] : null; };
    const sqlFechaHora = s => {
        const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/.exec(String(s ?? '').trim());
        return m ? `${m[1]} ${m[2].padStart(2, '0')}:${m[3]}:00` : null;
    };

    // Datos de un siniestro, validados. Los totales no se aceptan del cliente: se calculan.
    function datosDe(b) {
        const fecha = sqlFecha(b.fecha);
        if (!fecha) throw aviso('Indica la fecha del siniestro.');
        const placa = String(b.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!placa) throw aviso('Indica la placa de la unidad.');
        const tipo = texto(b.tipo_incidencia, 120);
        if (!tipo) throw aviso('Indica el tipo de incidencia.');
        const inicio = sqlFechaHora(b.inicio); const fin = sqlFechaHora(b.fin);
        let horas = 0;
        if (inicio && fin) {
            const dif = (msDe(fin) - msDe(inicio)) / 3600000;
            if (dif < 0) throw aviso('El fin del trabajo no puede ser anterior a su inicio.');
            horas = Math.round(dif * 10) / 10;
        }
        const repuestos = dinero(b.costo_repuestos); const manoObra = dinero(b.costo_mano_obra);
        const estado = ESTADOS.find(e => e.toLowerCase() === String(b.estado ?? '').trim().toLowerCase()) || 'En Reparación';
        return {
            fecha, placa, marca: texto(b.marca, 60), conductor: texto(b.conductor, 150), ubicacion: texto(b.ubicacion, 255), tipo_incidencia: tipo,
            detalle: texto(b.detalle, 2000), tecnico: texto(b.tecnico, 150), inicio, fin, horas_taller: horas,
            costo_repuestos: repuestos, costo_mano_obra: manoObra, costo_total: Math.round((repuestos + manoObra) * 100) / 100, estado,
        };
    }

    // La marca sale de la ficha de la placa cuando no se escribe; la placa se guarda como figura en la ficha (con guion o sin él)
    async function completarPlaca(p, d) {
        try {
            const [r] = await p.query(`SELECT placa, marca FROM placas WHERE REPLACE(REPLACE(UPPER(placa), '-', ''), ' ', '') = ? LIMIT 1`, [d.placa]);
            if (r.length) { d.placa = r[0].placa; if (!d.marca && r[0].marca) d.marca = String(r[0].marca).slice(0, 60); }
        } catch (e) { /* sin ficha de placas: se guarda lo escrito */ }
    }

    // Un tipo nuevo escrito al registrar o importar entra al catálogo de motivos (y uno desactivado se reactiva). Nunca impide guardar.
    async function registrarMotivo(p, nombre) {
        if (!nombre) return;
        try {
            const [u] = await p.query('UPDATE mantenimiento_siniestros_motivos SET activo = 1 WHERE nombre = ?', [nombre]);
            if (!u.affectedRows) await p.query('INSERT IGNORE INTO mantenimiento_siniestros_motivos (nombre) VALUES (?)', [nombre]);
        } catch (e) { /* la tabla de motivos puede no existir aún */ }
    }

    async function siguienteCodigo(p) {
        const [r] = await p.query(`SELECT COALESCE(MAX(CAST(SUBSTRING(codigo, 5) AS UNSIGNED)), 0) AS n FROM mantenimiento_siniestros WHERE codigo REGEXP '^SIN-[0-9]+$'`);
        return `SIN-${String((Number(r[0].n) || 0) + 1).padStart(3, '0')}`;
    }

    const COLUMNAS = `id, codigo, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, placa, marca, conductor, ubicacion, tipo_incidencia, detalle, tecnico,
        DATE_FORMAT(inicio, '%Y-%m-%d %H:%i') AS inicio, DATE_FORMAT(fin, '%Y-%m-%d %H:%i') AS fin,
        horas_taller, costo_repuestos, costo_mano_obra, costo_total, estado`;

    const COLS_ESCRITURA = ['fecha', 'placa', 'marca', 'conductor', 'ubicacion', 'tipo_incidencia', 'detalle', 'tecnico', 'inicio', 'fin', 'horas_taller', 'costo_repuestos', 'costo_mano_obra', 'costo_total', 'estado'];

    // Filtros comunes del listado y del resumen
    function filtros(q) {
        const donde = ['1 = 1']; const par = [];
        if (sqlFecha(q.desde)) { donde.push('fecha >= ?'); par.push(sqlFecha(q.desde)); }
        if (sqlFecha(q.hasta)) { donde.push('fecha <= ?'); par.push(sqlFecha(q.hasta)); }
        if (q.placa) { donde.push(`REPLACE(UPPER(placa), '-', '') = ?`); par.push(String(q.placa).toUpperCase().replace(/[^A-Z0-9]/g, '')); }
        if (q.tipo) { donde.push('tipo_incidencia = ?'); par.push(String(q.tipo)); }
        if (q.estado) { donde.push('estado = ?'); par.push(String(q.estado)); }
        return { donde, par };
    }

    // ── Listado ──
    router.get('/', async (req, res) => {
        try {
            const { donde, par } = filtros(req.query);
            const busca = String(req.query.q || '').trim();
            if (busca) {
                const t = `%${busca}%`;
                donde.push('(codigo LIKE ? OR placa LIKE ? OR conductor LIKE ? OR ubicacion LIKE ? OR tipo_incidencia LIKE ? OR detalle LIKE ? OR tecnico LIKE ?)');
                par.push(t, t, t, t, t, t, t);
            }
            const [rows] = await P(req).query(`SELECT ${COLUMNAS} FROM mantenimiento_siniestros WHERE ${donde.join(' AND ')} ORDER BY fecha DESC, id DESC LIMIT 5000`, par);
            // Cuántas fotos tiene cada siniestro (si la tabla de fotos aún no existe, todos quedan en 0)
            const conteo = new Map();
            try {
                const [fotos] = await P(req).query('SELECT siniestro_id, COUNT(*) AS n FROM mantenimiento_siniestros_fotos GROUP BY siniestro_id');
                fotos.forEach(f => conteo.set(Number(f.siniestro_id), Number(f.n)));
            } catch (e) { /* sin tabla de fotos */ }
            res.json({ ok: true, data: rows.map(r => ({ ...r, n_fotos: conteo.get(Number(r.id)) || 0 })) });
        } catch (err) {
            // Si la migración aún no se aplicó en esta empresa, la pantalla abre vacía en vez de fallar
            if (err && err.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, data: [], sinTabla: true });
            responder(res, err, 'lista');
        }
    });

    // ── Catálogo para el formulario: placas con su marca, conductores, tipos y técnicos ya usados ──
    router.get('/catalogo', async (req, res) => {
        try {
            const p = P(req);
            const [placas] = await p.query(`SELECT placa, marca, COALESCE(tipo, '') AS tipo FROM placas WHERE estado != 'Inactiva' ORDER BY placa`).catch(() => [[]]);
            // Conductor y técnico salen de la misma tabla: el personal de la empresa
            const [personal] = await p.query(`SELECT TRIM(CONCAT(COALESCE(apellidos, ''), ' ', COALESCE(nombres, ''))) AS nombre, COALESCE(cargo, '') AS cargo FROM rrhh_personal WHERE estado = 'ACTIVO' ORDER BY apellidos, nombres`).catch(() => [[]]);
            const [motivos] = await p.query(`SELECT nombre FROM mantenimiento_siniestros_motivos WHERE activo = 1 ORDER BY nombre`).catch(() => [[]]);
            // Nombres ya usados en siniestros (por ejemplo, los que llegaron de un Excel) que no están en el personal
            const [usados] = await p.query(`SELECT DISTINCT conductor AS v FROM mantenimiento_siniestros WHERE conductor IS NOT NULL AND conductor <> '' UNION SELECT DISTINCT tecnico FROM mantenimiento_siniestros WHERE tecnico IS NOT NULL AND tecnico <> ''`).catch(() => [[]]);
            res.json({
                ok: true, placas, estados: ESTADOS, personal: personal.filter(x => x.nombre),
                usados: usados.map(u => u.v), tipos: motivos.map(m => m.nombre),
            });
        } catch (err) { responder(res, err, 'catalogo'); }
    });

    // ── Resumen para las gráficas: indicadores y agrupaciones del periodo ──
    router.get('/resumen', async (req, res) => {
        try {
            const p = P(req);
            const { donde, par } = filtros(req.query);
            const W = donde.join(' AND ');
            const num = v => Number(v) || 0;
            const filas = rows => rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' || v == null ? v : num(v)])));
            const [[t]] = await p.query(`SELECT COUNT(*) AS siniestros, COALESCE(SUM(costo_total), 0) AS costo_total, COALESCE(SUM(costo_repuestos), 0) AS repuestos,
                COALESCE(SUM(costo_mano_obra), 0) AS mano_obra, COALESCE(SUM(horas_taller), 0) AS horas, COUNT(DISTINCT placa) AS unidades FROM mantenimiento_siniestros WHERE ${W}`, par);
            const [porTipo] = await p.query(`SELECT tipo_incidencia AS nombre, COUNT(*) AS cantidad, SUM(costo_total) AS costo, SUM(horas_taller) AS horas FROM mantenimiento_siniestros WHERE ${W} GROUP BY tipo_incidencia ORDER BY costo DESC, cantidad DESC`, par);
            const [porConductor] = await p.query(`SELECT COALESCE(NULLIF(TRIM(conductor), ''), 'Sin conductor') AS nombre, COUNT(*) AS cantidad, SUM(costo_total) AS costo FROM mantenimiento_siniestros WHERE ${W} GROUP BY 1 ORDER BY costo DESC, cantidad DESC LIMIT 15`, par);
            const [porMes] = await p.query(`SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes, COUNT(*) AS cantidad, SUM(costo_total) AS costo, SUM(costo_repuestos) AS repuestos, SUM(costo_mano_obra) AS mano_obra, SUM(horas_taller) AS horas FROM mantenimiento_siniestros WHERE ${W} GROUP BY 1 ORDER BY 1`, par);
            const [porPlaca] = await p.query(`SELECT placa AS nombre, MAX(marca) AS marca, COUNT(*) AS cantidad, SUM(costo_total) AS costo, SUM(horas_taller) AS horas FROM mantenimiento_siniestros WHERE ${W} GROUP BY placa ORDER BY costo DESC, cantidad DESC LIMIT 10`, par);
            const [porTecnico] = await p.query(`SELECT COALESCE(NULLIF(TRIM(tecnico), ''), 'Sin asignar') AS nombre, COUNT(*) AS cantidad, SUM(horas_taller) AS horas, SUM(costo_total) AS costo FROM mantenimiento_siniestros WHERE ${W} GROUP BY 1 ORDER BY horas DESC, cantidad DESC`, par);
            const [porEstado] = await p.query(`SELECT estado AS nombre, COUNT(*) AS cantidad, SUM(costo_total) AS costo FROM mantenimiento_siniestros WHERE ${W} GROUP BY estado ORDER BY cantidad DESC`, par);
            res.json({
                ok: true,
                totales: { siniestros: num(t.siniestros), costo_total: num(t.costo_total), repuestos: num(t.repuestos), mano_obra: num(t.mano_obra), horas: Math.round(num(t.horas) * 10) / 10, unidades: num(t.unidades) },
                por_tipo: filas(porTipo), por_conductor: filas(porConductor), por_mes: filas(porMes), por_placa: filas(porPlaca), por_tecnico: filas(porTecnico), por_estado: filas(porEstado),
            });
        } catch (err) {
            if (err && err.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, sinTabla: true, totales: { siniestros: 0, costo_total: 0, repuestos: 0, mano_obra: 0, horas: 0, unidades: 0 }, por_tipo: [], por_conductor: [], por_mes: [], por_placa: [], por_tecnico: [], por_estado: [] });
            responder(res, err, 'resumen');
        }
    });

    // ── Motivos configurables: ver, agregar y quitar ──
    router.get('/motivos', async (req, res) => {
        try {
            const [rows] = await P(req).query(`SELECT m.id, m.nombre, (SELECT COUNT(*) FROM mantenimiento_siniestros s WHERE s.tipo_incidencia = m.nombre) AS usos
                FROM mantenimiento_siniestros_motivos m WHERE m.activo = 1 ORDER BY m.nombre`);
            res.json({ ok: true, data: rows.map(r => ({ ...r, usos: Number(r.usos) || 0 })) });
        } catch (err) {
            if (err && err.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, data: [], sinTabla: true });
            responder(res, err, 'motivos');
        }
    });

    router.post('/motivos', async (req, res) => {
        try {
            const nombre = texto(req.body && req.body.nombre, 120);
            if (!nombre) throw aviso('Escribe el nombre del motivo.');
            const p = P(req);
            const [ya] = await p.query('SELECT id, activo FROM mantenimiento_siniestros_motivos WHERE nombre = ?', [nombre]);
            if (ya.length && ya[0].activo) throw aviso('Ese motivo ya existe.', 409);
            if (ya.length) await p.query('UPDATE mantenimiento_siniestros_motivos SET activo = 1 WHERE id = ?', [ya[0].id]);
            else await p.query('INSERT INTO mantenimiento_siniestros_motivos (nombre) VALUES (?)', [nombre]);
            if (logAudit) logAudit({ req, accion: 'AGREGAR_MOTIVO_SINIESTRO', modulo: 'MANTENIMIENTO', detalle: nombre });
            res.json({ ok: true, message: 'Motivo agregado.' });
        } catch (err) { responder(res, err, 'motivo-crear'); }
    });

    // No se borra la fila: queda inactivo, así los siniestros ya registrados no pierden su motivo
    router.delete('/motivos/:id', async (req, res) => {
        try {
            const [r] = await P(req).query('UPDATE mantenimiento_siniestros_motivos SET activo = 0 WHERE id = ? AND activo = 1', [req.params.id]);
            if (r.affectedRows !== 1) throw aviso('Motivo no encontrado.', 404);
            if (logAudit) logAudit({ req, accion: 'QUITAR_MOTIVO_SINIESTRO', modulo: 'MANTENIMIENTO', detalle: `Motivo ${req.params.id}` });
            res.json({ ok: true, message: 'Motivo eliminado.' });
        } catch (err) { responder(res, err, 'motivo-quitar'); }
    });

    // ── Crear ──
    router.post('/', async (req, res) => {
        try {
            const p = P(req);
            const d = datosDe(req.body || {});
            await completarPlaca(p, d);
            await registrarMotivo(p, d.tipo_incidencia);
            let id; let codigo;
            for (let intento = 0; intento < 3; intento++) {
                codigo = await siguienteCodigo(p);
                try {
                    const [r] = await p.query(`INSERT INTO mantenimiento_siniestros (codigo, ${COLS_ESCRITURA.join(', ')}, creado_por) VALUES (?, ${COLS_ESCRITURA.map(() => '?').join(', ')}, ?)`,
                        [codigo, ...COLS_ESCRITURA.map(k => d[k]), usuarioDe(req)]);
                    id = r.insertId; break;
                } catch (e) { if (!(e && e.code === 'ER_DUP_ENTRY') || intento === 2) throw e; }
            }
            if (logAudit) logAudit({ req, accion: 'CREAR_SINIESTRO', modulo: 'MANTENIMIENTO', detalle: `${codigo} · ${d.placa} · ${d.tipo_incidencia}` });
            res.json({ ok: true, id, codigo, message: `Siniestro ${codigo} registrado.` });
        } catch (err) { responder(res, err, 'crear'); }
    });

    // ── Editar ──
    router.put('/:id', async (req, res) => {
        try {
            const p = P(req);
            const d = datosDe(req.body || {});
            await completarPlaca(p, d);
            await registrarMotivo(p, d.tipo_incidencia);
            const [r] = await p.query(`UPDATE mantenimiento_siniestros SET ${COLS_ESCRITURA.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...COLS_ESCRITURA.map(k => d[k]), req.params.id]);
            if (r.affectedRows !== 1) throw aviso('Siniestro no encontrado.', 404);
            if (logAudit) logAudit({ req, accion: 'EDITAR_SINIESTRO', modulo: 'MANTENIMIENTO', detalle: `Siniestro ${req.params.id} · ${d.placa}` });
            res.json({ ok: true, message: 'Siniestro actualizado.' });
        } catch (err) { responder(res, err, 'editar'); }
    });

    // ── Eliminar ──
    router.delete('/:id', async (req, res) => {
        try {
            const [r] = await P(req).query('DELETE FROM mantenimiento_siniestros WHERE id = ?', [req.params.id]);
            if (r.affectedRows !== 1) throw aviso('Siniestro no encontrado.', 404);
            // Sus fotos también se borran (la fila y el archivo)
            try {
                const [fotos] = await P(req).query('SELECT url FROM mantenimiento_siniestros_fotos WHERE siniestro_id = ?', [req.params.id]);
                await P(req).query('DELETE FROM mantenimiento_siniestros_fotos WHERE siniestro_id = ?', [req.params.id]);
                for (const f of fotos) { const k = s3KeyFromUrl(f.url); if (k) await deleteFromS3(k).catch(() => { }); }
            } catch (e) { /* sin tabla de fotos */ }
            if (logAudit) logAudit({ req, accion: 'ELIMINAR_SINIESTRO', modulo: 'MANTENIMIENTO', detalle: `Siniestro ${req.params.id}` });
            res.json({ ok: true, message: 'Siniestro eliminado.' });
        } catch (err) { responder(res, err, 'eliminar'); }
    });

    // ── Fotos de los daños ──
    const firmarFoto = async f => {
        const key = s3KeyFromUrl(f.url);
        let url = f.url;
        if (key) { try { url = await getPresignedUrlEstable(key); } catch (e) { /* queda la dirección guardada */ } }
        return { id: f.id, url, nombre: f.nombre, subido_por: f.subido_por, creado_en: f.creado_en, tipo: tipoDeArchivo(f.nombre || f.url, '') };
    };
    const listarFotos = async (p, id) => {
        const [rows] = await p.query('SELECT id, url, nombre, subido_por, creado_en FROM mantenimiento_siniestros_fotos WHERE siniestro_id = ? ORDER BY id', [id]);
        return Promise.all(rows.map(firmarFoto));
    };
    const sinTablaFotos = err => (err && err.code === 'ER_NO_SUCH_TABLE' ? aviso('Las fotos aún no están habilitadas en esta empresa (falta aplicar la actualización de la base).', 409) : err);

    router.get('/:id/fotos', async (req, res) => {
        try {
            res.json({ ok: true, data: await listarFotos(P(req), Number(req.params.id)) });
        } catch (err) {
            if (err && err.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, data: [], sinTabla: true });
            responder(res, err, 'fotos');
        }
    });

    router.post('/:id/fotos', upload.array('fotos', 20), async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const archivos = (req.files || []).filter(f => /^(image|video)\//.test(f.mimetype) || f.mimetype === 'application/pdf');
            if (!archivos.length) throw aviso('Adjunta al menos una foto, un PDF o un video.');
            const [s] = await p.query('SELECT codigo FROM mantenimiento_siniestros WHERE id = ?', [id]);
            if (!s.length) throw aviso('Siniestro no encontrado.', 404);
            const marca = Date.now();
            try {
                for (let i = 0; i < archivos.length; i++) {
                    const a = archivos[i];
                    const ext = (String(a.originalname || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
                    const url = await uploadToS3(a.buffer, `flota/siniestros/${id}/${marca}_${i + 1}.${ext}`, a.mimetype);
                    await p.query('INSERT INTO mantenimiento_siniestros_fotos (siniestro_id, url, nombre, subido_por) VALUES (?, ?, ?, ?)', [id, url, texto(a.originalname, 255), usuarioDe(req)]);
                }
            } catch (e) { throw sinTablaFotos(e); }
            if (logAudit) logAudit({ req, accion: 'FOTOS_SINIESTRO', modulo: 'MANTENIMIENTO', detalle: `${s[0].codigo}: +${archivos.length} archivo(s)` });
            res.json({ ok: true, data: await listarFotos(p, id) });
        } catch (err) { responder(res, err, 'fotos+'); }
    });

    router.delete('/:id/fotos/:fotoId', async (req, res) => {
        try {
            const p = P(req);
            const [f] = await p.query('SELECT id, url FROM mantenimiento_siniestros_fotos WHERE id = ? AND siniestro_id = ?', [Number(req.params.fotoId), Number(req.params.id)]);
            if (!f.length) throw aviso('El archivo no existe.', 404);
            await p.query('DELETE FROM mantenimiento_siniestros_fotos WHERE id = ?', [f[0].id]);
            const k = s3KeyFromUrl(f[0].url);
            if (k) await deleteFromS3(k).catch(() => { });
            res.json({ ok: true, data: await listarFotos(p, Number(req.params.id)) });
        } catch (err) { responder(res, err, 'fotos-'); }
    });

    // ── Importar desde Excel: cada fila con su código se crea o, si ya existe, se actualiza ──
    router.post('/importar', async (req, res) => {
        try {
            const p = P(req);
            const filas = Array.isArray(req.body && req.body.filas) ? req.body.filas.slice(0, 2000) : [];
            if (!filas.length) throw aviso('No hay filas para importar.');
            let insertados = 0; let actualizados = 0; const errores = [];
            for (let i = 0; i < filas.length; i++) {
                try {
                    const d = datosDe(filas[i] || {});
                    await completarPlaca(p, d);
                    await registrarMotivo(p, d.tipo_incidencia);
                    const codigoDado = String((filas[i] && filas[i].codigo) || '').trim().toUpperCase().slice(0, 20);
                    const [existe] = codigoDado ? await p.query('SELECT id FROM mantenimiento_siniestros WHERE codigo = ?', [codigoDado]) : [[]];
                    if (existe.length) {
                        await p.query(`UPDATE mantenimiento_siniestros SET ${COLS_ESCRITURA.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...COLS_ESCRITURA.map(k => d[k]), existe[0].id]);
                        actualizados++;
                    } else {
                        const codigo = codigoDado || await siguienteCodigo(p);
                        await p.query(`INSERT INTO mantenimiento_siniestros (codigo, ${COLS_ESCRITURA.join(', ')}, creado_por) VALUES (?, ${COLS_ESCRITURA.map(() => '?').join(', ')}, ?)`,
                            [codigo, ...COLS_ESCRITURA.map(k => d[k]), usuarioDe(req)]);
                        insertados++;
                    }
                } catch (e) { errores.push(`Fila ${i + 1}: ${e && e.message ? e.message : 'error'}`); }
            }
            if (logAudit) logAudit({ req, accion: 'IMPORTAR_SINIESTROS', modulo: 'MANTENIMIENTO', detalle: `${insertados} nuevos, ${actualizados} actualizados, ${errores.length} con error` });
            res.json({ ok: true, insertados, actualizados, errores: errores.length, detalle_errores: errores.slice(0, 10) });
        } catch (err) { responder(res, err, 'importar'); }
    });

    return router;
};
