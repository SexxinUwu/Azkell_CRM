'use strict';
// Operaciones Marsisa › Hojas de ruta de los conductores.
// Una plantilla por cliente y tipo de unidad (tracto con 2 choferes, camión con 1) con su itinerario de paradas; para cada viaje se genera el
// PDF corriendo las horas desde la llegada al cliente. Las plantillas se editan desde la pantalla (no se piden por código).
//
//   GET    /plantillas        lista con sus paradas y totales
//   POST   /plantillas        crea una plantilla con sus paradas
//   PUT    /plantillas/:id    cambia una plantilla y reemplaza sus paradas
//   DELETE /plantillas/:id    elimina una plantilla
//   GET    /opciones          placas (tracto, camión, remolques) y conductores activos para armar la hoja
//   POST   /pdf               { plantilla_id, salida, viaje, placa, remolque, conductores, observaciones } → PDF
const express = require('express');
const { htmlAPdf } = require('../services/ot_pdf');
const { TIPOS, calcular, htmlHojaRuta, duracionMin } = require('../services/hoja_ruta');

module.exports = (db, logAudit) => {
    const router = express.Router();
    const D = req => (req && req.db) ? req.db : db;
    const P = req => D(req).promise();
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo || req.user.email)) || 'sistema').slice(0, 150);
    const texto = (v, max) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null; };
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        if (err && err.code === 'ER_NO_SUCH_TABLE') return res.status(409).json({ ok: false, error: 'Falta aplicar la actualización de la base de datos de esta empresa.' });
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'Ya existe una plantilla con ese nombre.' });
        console.error(`[hojas-ruta] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo completar la operación.' });
    };
    const auditar = (req, accion, detalle) => { try { if (logAudit) logAudit({ req, accion, modulo: 'OPERACIONES', detalle }); } catch { /* la auditoría no frena la operación */ } };

    // Solo para Marsisa
    router.use((req, res, next) => {
        const slug = String(req.tenantSlug || (req.headers && req.headers['x-tenant-id']) || (req.headers && req.headers.host ? req.headers.host.split('.')[0] : '')).toLowerCase();
        if (slug !== 'marsisa') return res.status(403).json({ ok: false, error: 'Las hojas de ruta son solo para Marsisa.' });
        next();
    });

    /** Valida y limpia la plantilla recibida; lanza avisos claros */
    function leerPlantilla(b) {
        const nombre = texto(b.nombre, 150);
        const cliente = texto(b.cliente, 150);
        if (!nombre) throw aviso('Escribe el nombre de la plantilla.');
        if (!cliente) throw aviso('Indica el cliente.');
        const tipo = String(b.tipo_unidad || '').toUpperCase() === 'CAMION' ? 'CAMION' : 'TRACTO';
        const choferes = Number(b.choferes) === 2 ? 2 : 1;
        const paradas = (Array.isArray(b.paradas) ? b.paradas : []).map((p, i) => {
            const t = String(p.tipo || '').toUpperCase();
            const dia = Math.round(Number(p.dia));
            const ini = String(p.hora_inicio || '').trim(), fin = String(p.hora_fin || '').trim();
            if (!texto(p.actividad, 250)) throw aviso(`La parada ${i + 1} no tiene actividad.`);
            if (!(dia >= 1 && dia <= 9)) throw aviso(`La parada ${i + 1}: el día debe ir de 1 a 9.`);
            if (duracionMin(ini, fin) == null) throw aviso(`La parada ${i + 1}: revisa las horas de inicio y de fin (HH:MM).`);
            return { orden: i + 1, dia, tipo: TIPOS[t] ? t : 'OTRO', actividad: texto(p.actividad, 250), hora_inicio: ini.padStart(5, '0'), hora_fin: fin.padStart(5, '0') };
        });
        if (!paradas.length) throw aviso('Agrega al menos una parada.');
        return { nombre, cliente, tipo, choferes, origen: texto(b.origen, 150), destino: texto(b.destino, 150), material: texto(b.material, 150), notas: texto(b.notas, 3000), paradas };
    }

    async function conParadas(req, filas) {
        if (!filas.length) return [];
        const [par] = await P(req).query('SELECT * FROM hoja_ruta_paradas WHERE plantilla_id IN (?) ORDER BY plantilla_id, orden', [filas.map(f => f.id)]);
        return filas.map(f => ({ ...f, paradas: par.filter(x => x.plantilla_id === f.id) }));
    }

    router.get('/plantillas', async (req, res) => {
        try {
            const [filas] = await P(req).query('SELECT * FROM hoja_ruta_plantillas WHERE activa = 1 ORDER BY cliente, tipo_unidad, nombre');
            res.json({ ok: true, tipos: TIPOS, data: await conParadas(req, filas) });
        } catch (err) { responder(res, err, 'listar'); }
    });

    async function guardar(req, id) {
        const d = leerPlantilla(req.body || {});
        const conn = await P(req).getConnection();
        try {
            await conn.beginTransaction();
            const usuario = usuarioDe(req);
            if (id) {
                const [r] = await conn.query('UPDATE hoja_ruta_plantillas SET nombre = ?, cliente = ?, tipo_unidad = ?, choferes = ?, origen = ?, destino = ?, material = ?, notas = ? WHERE id = ?',
                    [d.nombre, d.cliente, d.tipo, d.choferes, d.origen, d.destino, d.material, d.notas, id]);
                if (!r.affectedRows) throw aviso('Plantilla no encontrada.', 404);
                await conn.query('DELETE FROM hoja_ruta_paradas WHERE plantilla_id = ?', [id]);
            } else {
                const [r] = await conn.query('INSERT INTO hoja_ruta_plantillas (nombre, cliente, tipo_unidad, choferes, origen, destino, material, notas, creado_por) VALUES (?,?,?,?,?,?,?,?,?)',
                    [d.nombre, d.cliente, d.tipo, d.choferes, d.origen, d.destino, d.material, d.notas, usuario]);
                id = r.insertId;
            }
            await conn.query('INSERT INTO hoja_ruta_paradas (plantilla_id, orden, dia, tipo, actividad, hora_inicio, hora_fin) VALUES ?',
                [d.paradas.map(p => [id, p.orden, p.dia, p.tipo, p.actividad, p.hora_inicio, p.hora_fin])]);
            await conn.commit();
            return { id, nombre: d.nombre };
        } catch (e) { try { await conn.rollback(); } catch { /* nada */ } throw e; } finally { conn.release(); }
    }

    router.post('/plantillas', async (req, res) => {
        try {
            const r = await guardar(req, null);
            auditar(req, 'HOJA_RUTA_PLANTILLA_CREAR', `${r.nombre} (por ${usuarioDe(req)})`);
            res.json({ ok: true, id: r.id });
        } catch (err) { responder(res, err, 'crear'); }
    });

    router.put('/plantillas/:id', async (req, res) => {
        try {
            const r = await guardar(req, Number(req.params.id));
            auditar(req, 'HOJA_RUTA_PLANTILLA_EDITAR', `${r.nombre} (por ${usuarioDe(req)})`);
            res.json({ ok: true, id: r.id });
        } catch (err) { responder(res, err, 'editar'); }
    });

    router.delete('/plantillas/:id', async (req, res) => {
        try {
            const id = Number(req.params.id);
            const [[pl]] = await P(req).query('SELECT nombre FROM hoja_ruta_plantillas WHERE id = ?', [id]);
            if (!pl) throw aviso('Plantilla no encontrada.', 404);
            await P(req).query('DELETE FROM hoja_ruta_paradas WHERE plantilla_id = ?', [id]);
            await P(req).query('DELETE FROM hoja_ruta_plantillas WHERE id = ?', [id]);
            auditar(req, 'HOJA_RUTA_PLANTILLA_ELIMINAR', `${pl.nombre} (por ${usuarioDe(req)})`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'eliminar'); }
    });

    router.get('/opciones', async (req, res) => {
        try {
            const [placas] = await P(req).query("SELECT placa, tipo FROM placas WHERE estado = 'Activa' AND tipo IN ('Tracto', 'Camión', 'Camion', 'Carreta', 'Semirremolque') ORDER BY placa");
            const [conductores] = await P(req).query("SELECT nombre, dni, telefono FROM conductores WHERE estado = 'Activo' AND TRIM(nombre) <> '' ORDER BY nombre");
            res.json({ ok: true, placas, conductores });
        } catch (err) { responder(res, err, 'opciones'); }
    });

    router.post('/pdf', async (req, res) => {
        try {
            const b = req.body || {};
            const id = Number(b.plantilla_id);
            const [[plantilla]] = await P(req).query('SELECT * FROM hoja_ruta_plantillas WHERE id = ?', [id]);
            if (!plantilla) throw aviso('Plantilla no encontrada.', 404);
            const [paradas] = await P(req).query('SELECT * FROM hoja_ruta_paradas WHERE plantilla_id = ? ORDER BY orden', [id]);
            const calc = calcular(paradas, b.salida);

            const [cfg] = await P(req).query("SELECT clave, valor FROM configuracion_erp WHERE clave IN ('empresa_nombre', 'empresa_ruc', 'empresa_direccion', 'empresa_telefono', 'empresa_correo', 'empresa_logo')");
            const c = {}; cfg.forEach(r => { c[r.clave] = r.valor; });
            const empresa = { nombre: c.empresa_nombre, ruc: c.empresa_ruc, direccion: c.empresa_direccion, telefono: c.empresa_telefono, correo: c.empresa_correo, logo: /^data:image\//.test(String(c.empresa_logo || '')) ? c.empresa_logo : '' };

            const conductores = (Array.isArray(b.conductores) ? b.conductores : []).slice(0, plantilla.choferes + 2)
                .map(x => ({ nombre: texto(x && x.nombre, 150), telefono: texto(x && x.telefono, 40) })).filter(x => x.nombre);
            const datos = { viaje: texto(b.viaje, 60), placa: texto(b.placa, 20), remolque: texto(b.remolque, 20), conductores, observaciones: texto(b.observaciones, 600) };
            const pdf = await htmlAPdf(htmlHojaRuta({ empresa, plantilla, calc, datos }), `Hoja de ruta ${plantilla.cliente}`, false, false);
            auditar(req, 'HOJA_RUTA_PDF', `${plantilla.nombre} · ${datos.placa || 'sin placa'} · llegada ${calc.inicioTxt} (por ${usuarioDe(req)})`);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="hoja-de-ruta.pdf"');
            res.send(pdf);
        } catch (err) { responder(res, err, 'pdf'); }
    });

    return router;
};
