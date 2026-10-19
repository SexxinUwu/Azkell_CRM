// Consulta de auditoría (solo lectura). Lo que se registra lo escribe services/auditoria.js.
const express = require('express');
const { rangoLima } = require('../services/auditoria');

const PAGINA = 40;

function aObjeto(v) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string' && v.trim()) { try { return JSON.parse(v); } catch { return null; } }
  return null;
}

module.exports = (db) => {
  const router = express.Router();

  // GET /api/audit?q=&entity=&action=&userId=&from=AAAA-MM-DD&to=AAAA-MM-DD&page=1
  router.get('/audit', (req, res) => {
    const pool = req.db || db;
    const { q, entity, action, userId, from, to } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
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
    const where = condiciones.length ? ' WHERE ' + condiciones.join(' AND ') : '';

    pool.query(`SELECT COUNT(*) AS total FROM audit_logs${where}`, params, (err, [conteo]) => {
      if (err) return res.status(500).json({ error: err.message });
      const total = conteo ? conteo.total : 0;
      pool.query(
        `SELECT id, user_id, user_name, action, entity, entity_id, summary, changes, ip, created_at
         FROM audit_logs${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, PAGINA, (page - 1) * PAGINA],
        (err2, filas) => {
          if (err2) return res.status(500).json({ error: err2.message });
          const items = (filas || []).map(f => ({
            ...f,
            changes: aObjeto(f.changes),
            created_at: f.created_at instanceof Date ? f.created_at.toISOString() : f.created_at,
          }));
          res.json({ items, total, page, pageSize: PAGINA, hasMore: page * PAGINA < total });
        }
      );
    });
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
