// Consulta de auditoría (solo lectura). Lo que se registra lo escribe services/auditoria.js.
const express = require('express');
const { rangoLima } = require('../services/auditoria');

const PAGINA = 40;          // tamaño por defecto (quien no envía pageSize)
const PAGINA_MAX = 250;     // tope por petición: evita respuestas enormes

function aObjeto(v) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string' && v.trim()) { try { return JSON.parse(v); } catch { return null; } }
  return null;
}

// Categorías de las tarjetas (como CREÓ / MODIFICÓ / ELIMINÓ del clásico): la acción que no es alta ni baja cuenta como modificación
const CATEGORIA_SQL = {
  creo: "action = 'CREATE'",
  elimino: "action IN ('DELETE', 'ANNUL')",
  modifico: "action NOT IN ('CREATE', 'DELETE', 'ANNUL')",
};

// Condiciones WHERE comunes a la lista y al resumen (categoria solo aplica a la lista)
function condicionesAudit(query, conCategoria) {
  const { entity, action, userId, q, from, to, categoria } = query;
  const condiciones = [];
  const params = [];
  if (entity) { condiciones.push('entity = ?'); params.push(String(entity)); }
  if (action) { condiciones.push('action = ?'); params.push(String(action)); }
  if (userId) { condiciones.push('user_id = ?'); params.push(Number(userId)); }
  if (q) {
    condiciones.push('(summary LIKE ? OR user_name LIKE ?)');
    const like = `%${String(q).trim()}%`;
    params.push(like, like);
  }
  const rango = rangoLima(from, to);
  if (rango.desde) { condiciones.push('created_at >= ?'); params.push(rango.desde); }
  if (rango.hastaExclusivo) { condiciones.push('created_at < ?'); params.push(rango.hastaExclusivo); }
  if (conCategoria && CATEGORIA_SQL[categoria]) condiciones.push(CATEGORIA_SQL[categoria]);
  return { where: condiciones.length ? ' WHERE ' + condiciones.join(' AND ') : '', params };
}

module.exports = (db) => {
  const router = express.Router();

  // GET /api/audit?q=&entity=&action=&userId=&categoria=creo|modifico|elimino&from=AAAA-MM-DD&to=AAAA-MM-DD&page=1&pageSize=50&orden=desc|asc
  router.get('/audit', (req, res) => {
    const pool = req.db || db;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const tamano = Math.min(PAGINA_MAX, Math.max(1, parseInt(req.query.pageSize, 10) || PAGINA));
    const sentido = req.query.orden === 'asc' ? 'ASC' : 'DESC';
    const { where, params } = condicionesAudit(req.query, true);

    pool.query(`SELECT COUNT(*) AS total FROM audit_logs${where}`, params, (err, [conteo]) => {
      if (err) return res.status(500).json({ error: err.message });
      const total = conteo ? conteo.total : 0;
      pool.query(
        `SELECT id, user_id, user_name, action, entity, entity_id, summary, changes, ip, created_at
         FROM audit_logs${where} ORDER BY created_at ${sentido}, id ${sentido} LIMIT ? OFFSET ?`,
        [...params, tamano, (page - 1) * tamano],
        (err2, filas) => {
          if (err2) return res.status(500).json({ error: err2.message });
          const items = (filas || []).map(f => ({
            ...f,
            changes: aObjeto(f.changes),
            created_at: f.created_at instanceof Date ? f.created_at.toISOString() : f.created_at,
          }));
          res.json({ items, total, page, pageSize: tamano, hasMore: page * tamano < total });
        }
      );
    });
  });

  // GET /api/audit/resumen?...filtros: conteos de las tarjetas (total, creó, modificó, eliminó) con los mismos filtros
  router.get('/audit/resumen', (req, res) => {
    const { where, params } = condicionesAudit(req.query, false);
    (req.db || db).query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN action = 'CREATE' THEN 1 ELSE 0 END) AS creo,
              SUM(CASE WHEN action NOT IN ('CREATE', 'DELETE', 'ANNUL') THEN 1 ELSE 0 END) AS modifico,
              SUM(CASE WHEN action IN ('DELETE', 'ANNUL') THEN 1 ELSE 0 END) AS elimino
       FROM audit_logs${where}`,
      params,
      (err, [f]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ total: Number(f?.total) || 0, creo: Number(f?.creo) || 0, modifico: Number(f?.modifico) || 0, elimino: Number(f?.elimino) || 0 });
      }
    );
  });

  // Personas que aparecen en la bitácora (para el filtro por persona)
  router.get('/audit/personas', (req, res) => {
    (req.db || db).query(
      'SELECT user_id, user_name FROM audit_logs WHERE user_id IS NOT NULL GROUP BY user_id, user_name ORDER BY user_name',
      (err, filas) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(filas || []);
      }
    );
  });

  return router;
};
