// Auditoría para personas (solo lectura): registro firmado legible, filtros, detalle y anulaciones/rechazos.
// La lógica de traducción está en services/auditoria_vista.js. Las rutas /api/audit/* las protege el permiso mod_auditoria (rbac.js).
const express = require('express');
const { rangoLima } = require('../services/auditoria');
const vista = require('../services/auditoria_vista');

const PAGINA_MAX = 250;

// Condiciones sobre la vista de eventos (alias ev). categoria = ingreso|creo|modifico|elimino|anulo|rechazo|aprobo
function condicionesEventos(query, conCategoria) {
  const { q, modulo, usuario, categoria, from, to } = query;
  const cond = [];
  const params = [];
  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    cond.push('(ev.usuario LIKE ? OR ev.ruta LIKE ? OR ev.body_resumen LIKE ?)');
    params.push(like, like, like);
  }
  if (modulo) { cond.push(`${vista.SEGMENTO_SQL} = ?`); params.push(String(modulo)); }
  if (usuario) { cond.push('ev.usuario = ?'); params.push(String(usuario)); }
  if (conCategoria && categoria) { cond.push(`(${vista.CATEGORIA_SQL}) = ?`); params.push(String(categoria)); }
  const rango = rangoLima(from, to);
  if (rango.desde) { cond.push('ev.ts >= ?'); params.push(rango.desde); }
  if (rango.hastaExclusivo) { cond.push('ev.ts < ?'); params.push(rango.hastaExclusivo); }
  return { where: cond.length ? ' WHERE ' + cond.join(' AND ') : '', params };
}

module.exports = (db) => {
  const router = express.Router();

  // GET /api/audit/eventos?q=&modulo=&usuario=&categoria=&from=&to=&page=&pageSize=&orden=
  router.get('/audit/eventos', (req, res) => {
    const pool = req.db || db;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const tamano = Math.min(PAGINA_MAX, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const sentido = req.query.orden === 'asc' ? 'ASC' : 'DESC';
    const { where, params } = condicionesEventos(req.query, true);
    pool.query(`SELECT COUNT(*) AS total FROM ${vista.EVENTOS_SQL}${where}`, params, (err, filasTotal) => {
      if (err) return res.status(500).json({ error: err.message });
      const total = filasTotal && filasTotal[0] ? Number(filasTotal[0].total) : 0;
      pool.query(
        `SELECT ev.uid, ev.id, ev.origen, ev.ts, ev.usuario, ev.correo, ev.ip, ev.metodo, ev.ruta, ev.body_resumen, ev.status, ev.firma_estado,
                ${vista.SEGMENTO_SQL} AS segmento
         FROM ${vista.EVENTOS_SQL}${where} ORDER BY ev.ts ${sentido}, ev.id ${sentido} LIMIT ? OFFSET ?`,
        [...params, tamano, (page - 1) * tamano],
        (err2, filas) => {
          if (err2) return res.status(500).json({ error: err2.message });
          const items = (filas || []).map(f => {
            const d = vista.describir(f);
            return {
              uid: f.uid, id: f.id, fecha: vista.aIso(f.ts), usuario: f.usuario || 'Sistema', correo: f.correo || null, ip: f.ip || null,
              categoria: d.categoria, descripcion: d.texto, modulo: vista.ETIQUETA_MODULO[f.segmento] || f.segmento || '—', segmento: f.segmento,
              metodo: f.metodo, ruta: f.ruta, status: f.status, firma: f.firma_estado || null,
            };
          });
          res.json({ items, total, page, pageSize: tamano });
        }
      );
    });
  });

  // GET /api/audit/eventos/resumen: conteos por categoría con los mismos filtros (menos la categoría)
  router.get('/audit/eventos/resumen', (req, res) => {
    const pool = req.db || db;
    const { where, params } = condicionesEventos(req.query, false);
    pool.query(
      `SELECT (${vista.CATEGORIA_SQL}) AS categoria, COUNT(*) AS n FROM ${vista.EVENTOS_SQL}${where} GROUP BY categoria`,
      params,
      (err, filas) => {
        if (err) return res.status(500).json({ error: err.message });
        const por = {};
        let total = 0;
        (filas || []).forEach(f => { por[f.categoria] = Number(f.n); total += Number(f.n); });
        pool.query(`SELECT COUNT(DISTINCT ev.usuario) AS personas FROM ${vista.EVENTOS_SQL}${where}`, params, (e2, p) => {
          res.json({ total, por, personas: e2 || !p || !p[0] ? 0 : Number(p[0].personas) || 0 });
        });
      }
    );
  });

  // GET /api/audit/eventos/filtros: módulos y personas que aparecen (para los selectores)
  router.get('/audit/eventos/filtros', (req, res) => {
    const pool = req.db || db;
    pool.query(`SELECT ${vista.SEGMENTO_SQL} AS segmento, COUNT(*) AS n FROM ${vista.EVENTOS_SQL} GROUP BY segmento ORDER BY n DESC`, (err, mods) => {
      if (err) return res.status(500).json({ error: err.message });
      pool.query(`SELECT ev.usuario AS usuario, COUNT(*) AS n FROM ${vista.EVENTOS_SQL} WHERE ev.usuario IS NOT NULL AND ev.usuario <> '' GROUP BY ev.usuario ORDER BY n DESC`, (err2, usus) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({
          modulos: (mods || []).filter(m => m.segmento).map(m => ({ valor: m.segmento, etiqueta: vista.ETIQUETA_MODULO[m.segmento] || m.segmento, n: Number(m.n) })),
          personas: (usus || []).map(u => ({ valor: u.usuario, n: Number(u.n) })),
        });
      });
    });
  });

  // GET /api/audit/evento/:uid: detalle con antes/después y firma (uid = L<id> del registro firmado o S<id> de una sesión)
  router.get('/audit/evento/:uid', (req, res) => {
    const pool = req.db || db;
    const m = /^([LS])(\d+)$/.exec(String(req.params.uid));
    if (!m) return res.status(400).json({ error: 'Identificador inválido' });
    const sql = m[1] === 'L'
      ? 'SELECT id, fecha AS ts, usuario, correo, ip, metodo, ruta, modulo, body_resumen, status_codigo AS status, firma, firma_estado, antes, despues FROM log_auditoria WHERE id = ?'
      : "SELECT id, created_at AS ts, user_name AS usuario, NULL AS correo, ip, 'POST' AS metodo, '/sesion/ingreso' AS ruta, 'sesion' AS modulo, summary AS body_resumen, 200 AS status, NULL AS firma, NULL AS firma_estado, NULL AS antes, NULL AS despues FROM audit_logs WHERE id = ?";
    pool.query(sql, [Number(m[2])], (err, filas) => {
      if (err) return res.status(500).json({ error: err.message });
      const f = filas && filas[0];
      if (!f) return res.status(404).json({ error: 'Evento no encontrado' });
      const seg = String(f.ruta || '').split('/')[1] || f.modulo;
      const d = vista.describir({ ...f, origen: m[1] === 'S' ? 'sesion' : 'firmado', segmento: seg });
      res.json({
        uid: req.params.uid, id: f.id, fecha: vista.aIso(f.ts), usuario: f.usuario || 'Sistema', correo: f.correo || null, ip: f.ip || null,
        categoria: d.categoria, descripcion: d.texto, modulo: vista.ETIQUETA_MODULO[seg] || seg || '—', metodo: f.metodo, ruta: f.ruta, status: f.status,
        firma: f.firma_estado || null, firmaHash: f.firma ? String(f.firma).slice(0, 16) : null,
        cuerpo: vista.aObjeto(f.body_resumen) || (f.body_resumen ? String(f.body_resumen) : null),
        antes: vista.aObjeto(f.antes) || (f.antes ? String(f.antes) : null),
        despues: vista.aObjeto(f.despues) || (f.despues ? String(f.despues) : null),
      });
    });
  });

  // GET /api/audit/anulaciones: órdenes de compra/servicio anuladas o rechazadas y salidas anuladas, con quién y cuándo
  router.get('/audit/anulaciones', (req, res) => {
    const pool = req.db || db;
    pool.query(
      `SELECT id, tipo_orden, estado, proveedor_nombre AS contraparte, total_pen, creado_por, created_at, motivo_anulacion AS motivo, aprobado_por
       FROM entradas_inv WHERE estado IN ('Anulado', 'Rechazado')`,
      (err, ocs) => {
        if (err) return res.status(500).json({ error: err.message });
        pool.query(
          `SELECT id, 'Salida' AS tipo_orden, estado, COALESCE(NULLIF(placa, ''), tipo_destino) AS contraparte, total_pen, creado_por, created_at, motivo_anulacion AS motivo, NULL AS aprobado_por
           FROM salidas_inv WHERE estado = 'Anulado'`,
          (err2, sals) => {
            if (err2) return res.status(500).json({ error: err2.message });
            // Quién y cuándo: última petición que anuló (o que dejó «Rechazado») cada documento
            pool.query(
              `SELECT id, fecha, usuario, metodo, ruta, body_resumen FROM log_auditoria
               WHERE metodo IN ('PUT', 'PATCH', 'POST')
                 AND (ruta REGEXP '/almacen/entradas/[^/]+/(anular|estado)$' OR ruta REGEXP '/almacen/salidas/[^/]+$')
               ORDER BY id`,
              (err3, auds) => {
                if (err3) return res.status(500).json({ error: err3.message });
                const ultimo = new Map();
                (auds || []).forEach(a => {
                  const body = vista.aObjeto(a.body_resumen) || {};
                  const esAnular = /\/anular$/.test(a.ruta) || (/salidas\//.test(a.ruta) && body.accion === 'anular');
                  const esRechazo = /\/estado$/.test(a.ruta) && body.estado === 'Rechazado';
                  if (!esAnular && !esRechazo) return;
                  const id = vista.idDeRuta(a.ruta, 'entradas') || vista.idDeRuta(a.ruta, 'salidas');
                  if (id) ultimo.set(String(id), { usuario: a.usuario, fecha: vista.aIso(a.fecha), comentario: body.motivo || body.comentario || '' });
                });
                const filas = [...(ocs || []), ...(sals || [])].map(o => {
                  const a = ultimo.get(String(o.id));
                  const tipo = o.tipo_orden === 'Salida' ? 'Salida' : String(o.tipo_orden || '').toLowerCase().includes('servicio') ? 'Orden de servicio' : 'Orden de compra';
                  return {
                    codigo: o.id, tipo, estado: o.estado === 'Rechazado' ? 'Rechazada' : 'Anulada', contraparte: o.contraparte || '', total: Number(o.total_pen) || 0,
                    creadoPor: o.creado_por || '', creadaEn: vista.aIso(o.created_at),
                    porQuien: a ? a.usuario : (o.estado === 'Rechazado' && o.aprobado_por && o.aprobado_por !== 'Dirección / Gerencia' ? o.aprobado_por : null),
                    cuando: a ? a.fecha : null,
                    motivo: String(o.motivo || (a && a.comentario) || '').trim(),
                    conRegistro: !!a,
                  };
                });
                filas.sort((x, y) => String(y.cuando || y.creadaEn || '').localeCompare(String(x.cuando || x.creadaEn || '')));
                res.json(filas);
              }
            );
          }
        );
      }
    );
  });

  return router;
};
