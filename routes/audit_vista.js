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
        `SELECT ev.uid, ev.id, ev.origen, ev.sub, ev.ts, ev.usuario, ev.correo, ev.ip, ev.metodo, ev.ruta, ev.body_resumen, ev.status, ev.firma_estado, ev.despues,
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
      ? "SELECT id, '' AS sub, fecha AS ts, usuario, correo, ip, metodo, ruta, modulo, body_resumen, status_codigo AS status, firma, firma_estado, antes, despues FROM log_auditoria WHERE id = ?"
      : "SELECT id, action AS sub, created_at AS ts, user_name AS usuario, NULL AS correo, ip, 'POST' AS metodo, '/sesion/ingreso' AS ruta, 'sesion' AS modulo, summary AS body_resumen, 200 AS status, NULL AS firma, NULL AS firma_estado, NULL AS antes, NULL AS despues FROM audit_logs WHERE id = ?";
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
        // Campos que cambiaron respecto al registro anterior (cuando se guardó cómo estaba antes)
        cambios: vista.cambiosEntre(vista.aObjeto(f.antes), vista.aObjeto(f.body_resumen)),
        codigo: (String(f.ruta || '').match(/[A-Z]{2,4}-[0-9]{4}-[0-9]+/) || [])[0] || null,
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
               WHERE metodo IN ('PUT', 'PATCH', 'POST') AND (status_codigo IS NULL OR status_codigo < 400)
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


  const mapearEvento = f => {
    const d = vista.describir(f);
    return {
      uid: f.uid, id: f.id, fecha: vista.aIso(f.ts), usuario: f.usuario || 'Sistema', correo: f.correo || null, ip: f.ip || null,
      categoria: d.categoria, descripcion: d.texto, modulo: vista.ETIQUETA_MODULO[f.segmento] || f.segmento || '—', segmento: f.segmento,
      metodo: f.metodo, ruta: f.ruta, status: f.status, firma: f.firma_estado || null,
    };
  };
  const COLUMNAS_EVENTO = `ev.uid, ev.id, ev.origen, ev.sub, ev.ts, ev.usuario, ev.correo, ev.ip, ev.metodo, ev.ruta, ev.body_resumen, ev.status, ev.firma_estado, ev.despues,
                ${vista.SEGMENTO_SQL} AS segmento`;

  // GET /api/audit/historial?codigo=ENT-2026-00337: línea de tiempo de un documento (creación, aprobación, anulación, intentos bloqueados…)
  router.get('/audit/historial', (req, res) => {
    const codigo = String(req.query.codigo || '').trim();
    if (!/^[A-Za-z0-9._-]{4,40}$/.test(codigo)) return res.status(400).json({ error: 'Indica el código del documento' });
    const like = `%${codigo}%`;
    (req.db || db).query(
      `SELECT ${COLUMNAS_EVENTO} FROM ${vista.EVENTOS_SQL}
       WHERE ev.origen = 'firmado' AND (ev.ruta LIKE ? OR ev.body_resumen LIKE ? OR ev.despues LIKE ?)
       ORDER BY ev.ts ASC, ev.id ASC LIMIT 200`,
      [like, like, like],
      (err, filas) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ codigo, eventos: (filas || []).map(mapearEvento) });
      }
    );
  });

  // GET /api/audit/personas?from=&to=: actividad de cada persona en el rango (para el perfil por persona)
  router.get('/audit/personas', (req, res) => {
    const { where, params } = condicionesEventos({ from: req.query.from, to: req.query.to }, false);
    (req.db || db).query(
      `SELECT x.usuario, COUNT(*) AS total, MAX(x.ts) AS ultimo,
              SUM(x.cat = 'creo') AS creo, SUM(x.cat = 'modifico') AS modifico, SUM(x.cat = 'elimino') AS elimino, SUM(x.cat = 'anulo') AS anulo,
              SUM(x.cat = 'rechazo') AS rechazo, SUM(x.cat = 'aprobo') AS aprobo, SUM(x.cat = 'bloqueo') AS bloqueo,
              SUM(x.cat = 'ingreso') AS ingreso, SUM(x.cat = 'acceso_fallido') AS acceso_fallido, SUM(x.cat = 'consulta') AS consulta
       FROM (SELECT ev.usuario, ev.ts, (${vista.CATEGORIA_SQL}) AS cat FROM ${vista.EVENTOS_SQL}${where}) x
       WHERE x.usuario IS NOT NULL AND x.usuario <> ''
       GROUP BY x.usuario ORDER BY total DESC LIMIT 200`,
      params,
      (err, filas) => {
        if (err) return res.status(500).json({ error: err.message });
        const n = v => Number(v) || 0;
        res.json((filas || []).map(f => ({
          usuario: f.usuario, total: n(f.total), ultimo: vista.aIso(f.ultimo),
          creo: n(f.creo), modifico: n(f.modifico), elimino: n(f.elimino), anulo: n(f.anulo), rechazo: n(f.rechazo), aprobo: n(f.aprobo),
          bloqueo: n(f.bloqueo), ingreso: n(f.ingreso), accesoFallido: n(f.acceso_fallido), consulta: n(f.consulta),
        })));
      }
    );
  });

  // GET /api/audit/alertas?dias=7: lo que merece atención en los últimos días, con los eventos que lo explican
  router.get('/audit/alertas', (req, res) => {
    const dias = Math.min(60, Math.max(1, parseInt(req.query.dias, 10) || 7));
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    (req.db || db).query(
      `SELECT x.* FROM (SELECT ${COLUMNAS_EVENTO}, (${vista.CATEGORIA_SQL}) AS cat FROM ${vista.EVENTOS_SQL}) x
       WHERE x.ts >= ? AND x.cat IN ('anulo', 'rechazo', 'elimino', 'bloqueo', 'acceso_fallido') OR (x.ts >= ? AND x.segmento IN ('roles', 'usuarios', 'usuarios-v2') AND x.metodo <> 'GET' AND x.status < 400)
       ORDER BY x.ts DESC LIMIT 3000`,
      [desde, desde],
      (err, filas) => {
        if (err) return res.status(500).json({ error: err.message });
        const eventos = (filas || []).map(f => ({ ...mapearEvento(f), cat: f.cat }));
        const alertas = [];
        const resumirEventos = lista => lista.slice(0, 6).map(e => ({ uid: e.uid, fecha: e.fecha, usuario: e.usuario, descripcion: e.descripcion, categoria: e.categoria }));
        const nuevo = (id, nivel, titulo, detalle, lista) => { if (lista.length) alertas.push({ id, nivel, titulo, detalle, cantidad: lista.length, eventos: resumirEventos(lista) }); };

        const anulaciones = eventos.filter(e => e.cat === 'anulo' || e.cat === 'rechazo');
        nuevo('anulaciones', 'alta', 'Anulaciones y rechazos', `Órdenes o salidas anuladas o rechazadas en los últimos ${dias} días.`, anulaciones);
        nuevo('eliminaciones', 'alta', 'Registros eliminados', `Se borraron registros en los últimos ${dias} días.`, eventos.filter(e => e.cat === 'elimino'));

        const permisos = eventos.filter(e => ['roles', 'usuarios', 'usuarios-v2'].includes(e.segmento) && e.metodo !== 'GET' && e.cat !== 'bloqueo');
        nuevo('permisos', 'alta', 'Cambios de roles, permisos o usuarios', 'Quién tocó la seguridad del sistema.', permisos);

        // Intentos bloqueados: se agrupan por persona (3 o más = patrón a revisar)
        // Solo los que importan para el control: sin permiso (403) o en módulos de dinero y seguridad. Los 409/400 de formularios de campo (checklist duplicado…) no son alerta.
        const bloqueos = eventos.filter(e => e.cat === 'bloqueo' && (e.status === 403 || ['almacen', 'tesoreria', 'roles', 'usuarios', 'usuarios-v2'].includes(e.segmento)));
        const porPersona = new Map();
        bloqueos.forEach(e => { porPersona.set(e.usuario, [...(porPersona.get(e.usuario) || []), e]); });
        const repetidos = [...porPersona.entries()].filter(([, l]) => l.length >= 3);
        repetidos.forEach(([persona, lista]) => nuevo(`bloqueos-${persona}`, 'media', `${persona}: ${lista.length} intentos bloqueados`, 'Acciones que el sistema no permitió (sin stock, sin permiso, datos inválidos…).', lista));
        const sueltos = bloqueos.filter(e => (porPersona.get(e.usuario) || []).length < 3);
        nuevo('bloqueos', 'info', 'Intentos bloqueados', 'Acciones sueltas que el sistema no permitió.', sueltos);

        // Accesos fallidos: 3 o más de la misma cuenta, o cualquier intento con un usuario que no existe
        const fallidos = eventos.filter(e => e.cat === 'acceso_fallido');
        const porCuenta = new Map();
        fallidos.forEach(e => { porCuenta.set(e.usuario, [...(porCuenta.get(e.usuario) || []), e]); });
        const sospechosos = [...porCuenta.entries()].filter(([, l]) => l.length >= 3 || l.some(e => /no registrado/.test(e.descripcion)));
        sospechosos.forEach(([cuenta, lista]) => nuevo(`acceso-${cuenta}`, 'media', `Accesos fallidos de «${cuenta}»`, `${lista.length} intento(s) de ingreso que no prosperaron.`, lista));
        const otrosFallidos = fallidos.filter(e => !sospechosos.some(([c]) => c === e.usuario));
        nuevo('accesos', 'info', 'Otros accesos fallidos', 'Una contraseña errada suelta suele ser un descuido.', otrosFallidos);

        const orden = { alta: 0, media: 1, info: 2 };
        alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel] || b.cantidad - a.cantidad);
        res.json({ dias, alertas });
      }
    );
  });

  return router;
};
