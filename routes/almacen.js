const express = require('express');
const router = express.Router();

module.exports = (db, _multerInv, logAudit, _generarCodigoAlmacen) => {

// ── Helper: sumar total_pen de detalle (convierte USD con tipo_cambio) ───
function _calcularTotalPen(detalles, tc) {
    return detalles.reduce((acc, d) => {
        const imp = parseFloat(d.importe) || 0;
        return acc + (d.moneda === 'USD' ? imp * parseFloat(tc || 1) : imp);
    }, 0);
}

// ── Reset de Recepciones de Prueba (Iniciar de 0) ───
router.post('/reset-recepciones', (req, res) => {
    db.query('DELETE FROM detalle_recepciones_oc', () => {
        db.query('DELETE FROM recepciones_oc', () => {
            db.query("UPDATE entradas_inv SET estado = 'Registrado' WHERE estado IS NULL OR estado != 'Anulado'", () => {
                res.json({ ok: true, message: 'Recepciones reiniciadas a 0 y OCs en estado Registrado' });
            });
        });
    });
});

// ============================================================
// ALMACÉN — Configuración
// ============================================================
router.get('/configuracion', (req, res) => {
    db.query('SELECT clave, valor FROM configuracion_almacen', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const obj = {};
        rows.forEach(r => { obj[r.clave] = r.valor; });
        res.json(obj);
    });
});
router.put('/configuracion', (req, res) => {
    const entries = Object.entries(req.body);
    if (!entries.length) { if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true }); }
    const vals = entries.map(([k, v]) => [k, String(v)]);
    db.query('INSERT INTO configuracion_almacen (clave,valor) VALUES ? ON DUPLICATE KEY UPDATE valor=VALUES(valor)',
        [vals], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
});

// ============================================================
// ALMACÉN — Proveedores
// ============================================================
router.get('/proveedores', (req, res) => {
    db.query('SELECT p.id, p.nombre, p.razon_social, p.tipo_documento, p.numero_documento, p.telefono, p.email, p.direccion, p.estado, p.observaciones, p.created_at, p.updated_at, GROUP_CONCAT(m.marca ORDER BY m.marca SEPARATOR \', \') AS marcas FROM proveedores_inv p LEFT JOIN proveedor_marcas_inv m ON m.proveedor_id=p.id GROUP BY p.id, p.nombre, p.razon_social, p.tipo_documento, p.numero_documento, p.telefono, p.email, p.direccion, p.estado, p.observaciones, p.created_at, p.updated_at ORDER BY p.nombre', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
router.post('/proveedores', (req, res) => {
    const { nombre, razon_social, tipo_documento, numero_documento, telefono, email, direccion, estado, observaciones, marcas } = req.body;
    const anio = new Date().getFullYear();
    _generarCodigoAlmacen('PROV', null, (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('INSERT INTO proveedores_inv (id,nombre,razon_social,tipo_documento,numero_documento,telefono,email,direccion,estado,observaciones) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [id, nombre, razon_social||null, tipo_documento||'RUC', numero_documento||null, telefono||null, email||null, direccion||null, estado||'Activo', observaciones||null],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (marcas && marcas.length) {
                    const mVals = marcas.map(m => [id, m]);
                    db.query('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [mVals], () => {});
                }
                if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id });
            });
    });
});
router.put('/proveedores/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, razon_social, tipo_documento, numero_documento, telefono, email, direccion, estado, observaciones, marcas } = req.body;
    db.query('UPDATE proveedores_inv SET nombre=?,razon_social=?,tipo_documento=?,numero_documento=?,telefono=?,email=?,direccion=?,estado=?,observaciones=? WHERE id=?',
        [nombre, razon_social||null, tipo_documento||'RUC', numero_documento||null, telefono||null, email||null, direccion||null, estado||'Activo', observaciones||null, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.query('DELETE FROM proveedor_marcas_inv WHERE proveedor_id=?', [id], () => {
                if (marcas && marcas.length) {
                    const mVals = marcas.map(m => [id, m]);
                    db.query('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [mVals], () => {});
                }
                if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
        });
});
router.delete('/proveedores/:id', (req, res) => {
    db.query('DELETE FROM proveedores_inv WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
    });
});

router.post('/importarProveedoresMasivo', async (req, res) => {
    const lista = req.body.proveedores || [];
    if (!lista.length) return res.status(400).json({ error: 'Sin datos' });

    // Helper promisificado
    const dbq = (sql, params) => new Promise((resolve, reject) =>
        db.query(sql, params || [], (err, rows) => err ? reject(err) : resolve(rows))
    );

    try {
        // 1. Buscar todos los existentes por nombre en una sola query
        const nombres = lista.filter(p => p.nombre).map(p => p.nombre);
        if (!nombres.length) return res.json({ insertados: 0, actualizados: 0, errores: lista.length });

        const existentes = await dbq('SELECT id, nombre FROM proveedores_inv WHERE nombre IN (?)', [nombres]);
        const existMap = {};
        existentes.forEach(r => { existMap[r.nombre] = r.id; });

        // 2. Separar nuevos vs a actualizar
        const nuevos    = lista.filter(p => p.nombre && !existMap[p.nombre]);
        const actualizar = lista.filter(p => p.nombre && existMap[p.nombre]);

        // 3. Obtener próximo número de secuencia una sola vez
        let startNum = 1;
        if (nuevos.length) {
            const maxRow = await dbq("SELECT MAX(id) AS max_id FROM proveedores_inv WHERE id LIKE 'PROV-%'");
            if (maxRow[0] && maxRow[0].max_id) {
                const parts = maxRow[0].max_id.split('-');
                const last = parseInt(parts[parts.length - 1], 10);
                if (!isNaN(last)) startNum = last + 1;
            }
        }

        const mkMarcas = p => p.marcas
            ? (typeof p.marcas === 'string' ? p.marcas.split(',').map(m => m.trim()).filter(Boolean) : (p.marcas || []))
            : [];

        let insertados = 0, actualizados = 0, errores = 0;

        // 4. INSERT nuevos en paralelo (IDs pre-asignados, sin race condition)
        await Promise.all(nuevos.map((p, i) => {
            const id = 'PROV-' + String(startNum + i).padStart(4, '0');
            const marcasArr = mkMarcas(p);
            return dbq(
                'INSERT INTO proveedores_inv (id,nombre,razon_social,tipo_documento,numero_documento,telefono,email,direccion,estado,observaciones) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [id, p.nombre, p.razon_social||null, p.tipo_documento||'RUC', p.numero_documento||null,
                 p.telefono||null, p.email||null, p.direccion||null, p.estado||'Activo', p.observaciones||null]
            ).then(() => {
                insertados++;
                if (marcasArr.length) return dbq('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [marcasArr.map(m => [id, m])]);
            }).catch(() => { errores++; });
        }));

        // 5. UPDATE existentes en paralelo + refresh marcas
        await Promise.all(actualizar.map(p => {
            const id = existMap[p.nombre];
            const marcasArr = mkMarcas(p);
            return dbq(
                'UPDATE proveedores_inv SET razon_social=?,tipo_documento=?,numero_documento=?,telefono=?,email=?,direccion=?,estado=?,observaciones=? WHERE id=?',
                [p.razon_social||null, p.tipo_documento||'RUC', p.numero_documento||null,
                 p.telefono||null, p.email||null, p.direccion||null, p.estado||'Activo', p.observaciones||null, id]
            ).then(() => {
                actualizados++;
                return dbq('DELETE FROM proveedor_marcas_inv WHERE proveedor_id=?', [id]).then(() => {
                    if (marcasArr.length) return dbq('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [marcasArr.map(m => [id, m])]);
                });
            }).catch(() => { errores++; });
        }));

        res.json({ insertados, actualizados, errores });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/proveedores/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Sin IDs' });
    const placeholders = ids.map(() => '?').join(',');
    db.query('DELETE FROM proveedores_inv WHERE id IN (' + placeholders + ')', ids, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, eliminados: result.affectedRows });
    });
});

// ============================================================
// ALMACÉN — Inventario (Catálogo)
// ============================================================
const _stockSQL = `
  SELECT i.*,
    ROUND(
      COALESCE(i.stock_regularizado, 0)
      + COALESCE(ent.total_entradas, 0)
      + COALESCE(rec.total_recepciones, 0)
      - COALESCE(sal.total_salidas, 0)
    , 4) AS stock_actual
  FROM inventario i
  LEFT JOIN (
      SELECT 
          d.inventario_id, 
          SUM(d.cantidad) AS total_entradas
      FROM detalle_entradas_inv d
      JOIN entradas_inv e ON e.id = d.entrada_id
      JOIN inventario inv ON inv.id = d.inventario_id
      WHERE (inv.fecha_regularizacion IS NULL OR DATE(e.created_at) >= DATE(inv.fecha_regularizacion))
        AND (e.estado IS NULL OR e.estado != 'Anulado')
        AND (e.tipo_orden = 'Entrada directa' OR e.tipo_orden = 'Ajuste')
      GROUP BY d.inventario_id
  ) ent ON ent.inventario_id = i.id
  LEFT JOIN (
      SELECT 
          dr.inventario_id,
          SUM(dr.cantidad_recibida) AS total_recepciones
      FROM detalle_recepciones_oc dr
      JOIN recepciones_oc r ON r.id = dr.recepcion_id
      JOIN inventario inv ON inv.id = dr.inventario_id
      WHERE (inv.fecha_regularizacion IS NULL OR DATE(r.created_at) >= DATE(inv.fecha_regularizacion))
      GROUP BY dr.inventario_id
  ) rec ON rec.inventario_id = i.id
  LEFT JOIN (
      SELECT 
          inv.id AS mapped_id,
          SUM(d.cantidad) AS total_salidas
      FROM detalle_salidas_inv d
      JOIN salidas_inv s ON s.id = d.salida_id
      JOIN inventario inv ON (d.inventario_id = inv.id OR (d.inventario_id IS NULL AND SUBSTRING_INDEX(d.descripcion, ' - ', 1) = inv.id))
      WHERE s.estado = 'Despachado'
        AND (inv.fecha_regularizacion IS NULL OR DATE(s.created_at) >= DATE(inv.fecha_regularizacion))
      GROUP BY inv.id
  ) sal ON sal.mapped_id = i.id
  WHERE i.activo=1
  ORDER BY i.id`;

router.get('/notificaciones/resumen', (req, res) => {
    const qInspVencidas = `
        SELECT COUNT(*) AS cnt FROM inspecciones
        WHERE estado IS NULL OR estado != 'Eliminada'
        AND fecha_ingreso IS NOT NULL
        AND DATE_ADD(
            CASE
                WHEN fecha_ingreso REGEXP '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
                    THEN STR_TO_DATE(fecha_ingreso, '%d/%m/%Y')
                WHEN fecha_ingreso REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                    THEN DATE(fecha_ingreso)
                ELSE NULL
            END,
            INTERVAL COALESCE(dias_propuestos, 30) DAY
        ) < CURDATE()
    `;
    const qFleetrunVenc = `
        SELECT COUNT(*) AS cnt FROM (
            SELECT f.placa, f.tipo_mp
            FROM fleetrun f
            INNER JOIN (
                SELECT placa, tipo_mp, MAX(fecha) AS max_fecha
                FROM fleetrun GROUP BY placa, tipo_mp
            ) lf ON f.placa = lf.placa AND f.tipo_mp = lf.tipo_mp AND f.fecha = lf.max_fecha
            WHERE f.km_proximo > 0 AND f.km_actual >= f.km_proximo
            GROUP BY f.placa, f.tipo_mp
        ) t
    `;
    const qStockCrit = `
        SELECT COUNT(*) AS cnt FROM inventario
        WHERE activo = 1 AND stock_min > 0
        AND stock_actual <= stock_min
    `;
    const runQ = (sql) => new Promise((resolve) => {
        db.query(sql, (err, rows) => {
            resolve(err ? 0 : (rows[0] && rows[0].cnt != null ? parseInt(rows[0].cnt) : 0));
        });
    });
    Promise.all([runQ(qInspVencidas), runQ(qFleetrunVenc), runQ(qStockCrit)])
        .then(([inspVenc, fleetVenc, stockCrit]) => {
            res.json([
                { id: 'insp-vencidas',  tipo: 'danger',  icono: 'bi-shield-x',             titulo: 'Inspecciones Vencidas',  count: inspVenc,  modulo: 'mantenimiento/inspecciones' },
                { id: 'fleet-vencidos', tipo: 'warning', icono: 'bi-speedometer2',          titulo: 'MP Fleetrun Vencidos',   count: fleetVenc, modulo: 'mantenimiento/fleetrun'      },
                { id: 'stock-critico',  tipo: 'info',    icono: 'bi-exclamation-triangle',  titulo: 'Stock Crítico',          count: stockCrit, modulo: 'almacen/inventario'          }
            ]);
        });
});

router.get('/inventario', (req, res) => {
    db.query(_stockSQL, async (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const { getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');
        const signedRows = await Promise.all(rows.map(async (row) => {
            if (row.imagen_url) {
                const key = s3KeyFromUrl(row.imagen_url);
                if (key) {
                    try {
                        row.imagen_url = await getPresignedUrl(key, 3600);
                    } catch(e) {}
                }
            }
            return row;
        }));
        res.json(signedRows);
    });
});

// ─── Marcas de placas para multi-select inventario ───────────────
router.get('/marcas-placas', (req, res) => {
    db.query(`SELECT DISTINCT marca FROM placas WHERE marca IS NOT NULL AND marca <> '' ORDER BY marca`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.marca));
    });
});

router.post('/inventario', (req, res) => {
    const { articulo, codigo_articulo, descripcion, familia, almacen, unidad, moneda, costo_referencial,
            tipo_cambio, cantidad_inicial,
            proveedor_id, marca, observaciones,
            codigo_item, marca_unidad, sistema, sub_sistema, tipo, sub_tipo,
            ubicacion, anaquel, stock_min, stock_max, estado_art, codigo_barras } = req.body;

    const costoRef   = parseFloat(costo_referencial) || 0;
    const tc         = parseFloat(tipo_cambio) || null;
    const monedaVal  = moneda || 'PEN';
    const costoSoles = (monedaVal === 'USD' && tc) ? costoRef * tc : costoRef;
    const cantInicial = parseFloat(cantidad_inicial) || 0;
    const stockReg    = cantInicial > 0 ? cantInicial : 0;
    const fechaReg    = cantInicial > 0 ? new Date().toISOString().split('T')[0] : null;

    // Generar descripcion concatenada desde los campos individuales
    let marcasArr = [];
    try { marcasArr = JSON.parse(marca_unidad || '[]'); } catch(e) { marcasArr = marca_unidad ? [marca_unidad] : []; }
    let descGenerada = (articulo || '').trim();
    if (codigo_articulo) descGenerada += ' ' + String(codigo_articulo).trim();
    if (marcasArr.length) descGenerada += ' - ' + marcasArr.join(', ');
    if (marca) descGenerada += ' / ' + String(marca).trim();
    const descFinal = descGenerada || descripcion || 'Sin nombre';

    const prefix = (tipo === 'Servicio' || tipo === 'SERV') ? 'SERV' : 'INV';
    _generarCodigoAlmacen(prefix, null, (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query(`INSERT INTO inventario
            (id,descripcion,articulo,codigo_articulo,familia,almacen,unidad,moneda,costo_referencial,costo_soles,tipo_cambio,
             proveedor_id,marca,observaciones,
             codigo_item,marca_unidad,sistema,sub_sistema,tipo,sub_tipo,
             ubicacion,anaquel,stock_min,stock_max,estado_art,codigo_barras,
             stock_regularizado,fecha_regularizacion)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, descFinal, articulo||null, codigo_articulo||null, familia||null, almacen||null, unidad||null, monedaVal,
             costoRef, costoSoles, tc,
             proveedor_id||null, marca||null, observaciones||null,
             codigo_item||null, marca_unidad||null, sistema||null, sub_sistema||null,
             tipo||null, sub_tipo||null, ubicacion||null,
             anaquel!=null?parseFloat(anaquel):null, parseFloat(stock_min)||0, parseFloat(stock_max)||0,
             estado_art||'Activo', codigo_barras||null,
             stockReg, fechaReg],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id });
            });
    });
});
router.put('/inventario/:id', (req, res) => {
    const { articulo, codigo_articulo, descripcion, familia, almacen, unidad, moneda, costo_referencial,
            tipo_cambio,
            proveedor_id, marca, observaciones, activo,
            codigo_item, marca_unidad, sistema, sub_sistema, tipo, sub_tipo,
            ubicacion, anaquel, stock_min, stock_max, estado_art, codigo_barras } = req.body;

    const costoRef   = parseFloat(costo_referencial) || 0;
    const tc         = parseFloat(tipo_cambio) || null;
    const monedaVal  = moneda || 'PEN';
    const costoSoles = (monedaVal === 'USD' && tc) ? costoRef * tc : costoRef;

    let marcasArr = [];
    try { marcasArr = JSON.parse(marca_unidad || '[]'); } catch(e) { marcasArr = marca_unidad ? [marca_unidad] : []; }
    let descGenerada = (articulo || '').trim();
    if (codigo_articulo) descGenerada += ' ' + String(codigo_articulo).trim();
    if (marcasArr.length) descGenerada += ' - ' + marcasArr.join(', ');
    if (marca) descGenerada += ' / ' + String(marca).trim();
    const descFinal = descGenerada || descripcion || 'Sin nombre';

    db.query(`UPDATE inventario SET
        descripcion=?,articulo=?,codigo_articulo=?,familia=?,almacen=?,unidad=?,moneda=?,costo_referencial=?,costo_soles=?,tipo_cambio=?,
        proveedor_id=?,marca=?,observaciones=?,activo=?,
        codigo_item=?,marca_unidad=?,sistema=?,sub_sistema=?,tipo=?,sub_tipo=?,ubicacion=?,
        anaquel=?,stock_min=?,stock_max=?,estado_art=?,codigo_barras=?
        WHERE id=?`,
        [descFinal, articulo||null, codigo_articulo||null, familia||null, almacen||null, unidad||null, monedaVal,
         costoRef, costoSoles, tc,
         proveedor_id||null, marca||null, observaciones||null,
         activo != null ? activo : 1,
         codigo_item||null, marca_unidad||null, sistema||null, sub_sistema||null,
         tipo||null, sub_tipo||null, ubicacion||null,
         anaquel!=null?parseFloat(anaquel):null, parseFloat(stock_min)||0, parseFloat(stock_max)||0,
         estado_art||'Activo', codigo_barras||null, req.params.id],
        (err) => {
            if (err) { console.error('[PUT inventario]', err.message); return res.status(500).json({ error: err.message }); }
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
});
router.delete('/inventario/:id', (req, res) => {
    db.query('UPDATE inventario SET activo=0 WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
    });
});

router.post('/inventario/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'Sin IDs' });
    const placeholders = ids.map(() => '?').join(',');
    db.query(`UPDATE inventario SET activo=0 WHERE id IN (${placeholders})`, ids, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, eliminados: ids.length });
    });
});

// Upload imagen de artículo → AWS S3
router.post('/inventario/:id/imagen', _multerInv.single('imagen'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
    try {
        const { uploadToS3, deleteFromS3, s3KeyFromUrl } = require('../utils/s3');
        db.query('SELECT imagen_url FROM inventario WHERE id=?', [req.params.id], async (err, rows) => {
            if (!err && rows && rows.length > 0 && rows[0].imagen_url) {
                const oldKey = s3KeyFromUrl(rows[0].imagen_url);
                if (oldKey) await deleteFromS3(oldKey).catch(() => {});
            }
            
            const ext = req.file.originalname.split('.').pop() || 'jpg';
            const s3Key = `almacen/inventario/${req.params.id}/${Date.now()}.${ext}`;
            const url = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
            
            db.query('UPDATE inventario SET imagen_url=? WHERE id=?', [url, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); }
                res.json({ ok: true, imagen_url: url });
            });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Eliminar imagen de artículo → AWS S3
router.delete('/inventario/:id/imagen', (req, res) => {
    try {
        const { deleteFromS3, s3KeyFromUrl } = require('../utils/s3');
        db.query('SELECT imagen_url FROM inventario WHERE id=?', [req.params.id], async (err, rows) => {
            if (!err && rows && rows.length > 0 && rows[0].imagen_url) {
                const oldKey = s3KeyFromUrl(rows[0].imagen_url);
                if (oldKey) await deleteFromS3(oldKey).catch(() => {});
            }
            db.query('UPDATE inventario SET imagen_url=NULL WHERE id=?', [req.params.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'ELIMINÓ', req.path); }
                res.json({ ok: true });
            });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Regularizar stock físico (autocontrol)
router.post('/inventario/:id/regularizar', (req, res) => {
    const { stock_fisico, motivo, usuario } = req.body;
    const id = req.params.id;
    if (stock_fisico == null || isNaN(parseFloat(stock_fisico))) {
        return res.status(400).json({ error: 'stock_fisico requerido' });
    }
    const stockVal = parseFloat(stock_fisico);
    const fechaHoy = new Date().toISOString().split('T')[0];

    // Obtener stock virtual actual para registrar en observaciones
    db.query(`SELECT
        COALESCE(i.stock_regularizado,0)
        + COALESCE((SELECT SUM(d.cantidad) FROM detalle_entradas_inv d
                    JOIN entradas_inv e ON e.id=d.entrada_id
                    WHERE d.inventario_id=i.id
                    AND (i.fecha_regularizacion IS NULL OR DATE(e.created_at) >= DATE(i.fecha_regularizacion))),0)
        - COALESCE((SELECT SUM(d.cantidad) FROM detalle_salidas_inv d
                    JOIN salidas_inv s ON s.id=d.salida_id
                    WHERE d.inventario_id=i.id
                    AND (i.fecha_regularizacion IS NULL OR DATE(s.created_at) >= DATE(i.fecha_regularizacion))),0)
        AS stock_virtual,
        i.stock_regularizado AS stock_ant,
        i.fecha_regularizacion AS fecha_reg_ant
        FROM inventario i WHERE i.id=?`, [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const stockVirtual = parseFloat(rows[0]?.stock_virtual || 0);
        const stockAnt     = parseFloat(rows[0]?.stock_ant || 0);

        const obsAudit = `Regularización: virtual=${stockVirtual.toFixed(2)} → físico=${stockVal.toFixed(2)}` +
                         (motivo ? ` | Motivo: ${motivo}` : '') +
                         ` | Usuario: ${usuario || 'sistema'} | Fecha: ${fechaHoy}`;

        db.query(`UPDATE inventario SET stock_regularizado=?, fecha_regularizacion=? WHERE id=?`,
            [stockVal, fechaHoy, id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            // Registrar en observaciones de auditoría (append)
            db.query(`UPDATE inventario SET observaciones = CONCAT(COALESCE(observaciones,''), ?)
                      WHERE id=?`,
                ['\n[REG ' + fechaHoy + '] ' + obsAudit, id], () => {});
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, fecha_regularizacion: fechaHoy, stock_anterior: stockAnt, stock_nuevo: stockVal });
        });
    });
});

// Import masivo desde Excel
router.post('/inventario/importar', async (req, res) => {
    const { filas } = req.body;
    if (!filas || !filas.length) { if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, insertados: 0 }); }
    let insertados = 0;
    const errors = [];
    for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        if (!f.articulo) { errors.push(`Fila ${i+2}: falta el campo 'articulo'`); continue; }
        try {
            // Generar descripcion concatenada igual que el POST individual
            let marcasArr = [];
            try { marcasArr = JSON.parse(f.marca_unidad || '[]'); } catch(e) {
                marcasArr = f.marca_unidad ? String(f.marca_unidad).split(',').map(s=>s.trim()).filter(Boolean) : [];
            }
            let descGenerada = String(f.articulo).trim();
            if (f.codigo_articulo) descGenerada += ' ' + String(f.codigo_articulo).trim();
            if (marcasArr.length)  descGenerada += ' - ' + marcasArr.join(', ');
            if (f.marca)           descGenerada += ' / ' + String(f.marca).trim();
            const marcaUnidadJson = marcasArr.length ? JSON.stringify(marcasArr) : null;

            await new Promise((resolve, reject) => {
                _generarCodigoAlmacen('INV', null, (err, id) => {
                    if (err) return reject(err);
                    const cantInicial = parseFloat(f.cantidad_inicial) || 0;
                    const stockReg    = cantInicial > 0 ? cantInicial : 0;
                    const fechaReg    = cantInicial > 0 ? new Date().toISOString().split('T')[0] : null;
                    db.query(`INSERT INTO inventario
                        (id,descripcion,articulo,codigo_articulo,familia,almacen,unidad,moneda,costo_referencial,
                         marca,observaciones,marca_unidad,sistema,sub_sistema,tipo,sub_tipo,
                         ubicacion,anaquel,stock_min,stock_max,estado_art,codigo_barras,
                         stock_regularizado,fecha_regularizacion)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                        [id, descGenerada||'Sin nombre',
                         f.articulo||null, f.codigo_articulo||null, f.familia||null, f.almacen||null, f.unidad||null,
                         f.moneda||'PEN', parseFloat(f.costo_referencial)||0,
                         f.marca||null, f.observaciones||null,
                         marcaUnidadJson, f.sistema||null, f.sub_sistema||null,
                         f.tipo||null, f.sub_tipo||null, f.ubicacion||null,
                         f.anaquel!=null?parseFloat(f.anaquel):null,
                         parseFloat(f.stock_min)||0, parseFloat(f.stock_max)||0,
                         f.estado_art||'Activo', f.codigo_barras||null,
                         stockReg, fechaReg],
                        (err2) => { if (err2) return reject(err2); insertados++; resolve(); });
                });
            });
        } catch(e) { errors.push(`Fila ${i+2}: ${e.message}`); }
    }
    if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, insertados, errores: errors });
});

// ── Clientes de placas (para Empresa en conductores) ──────────────────────
router.get('/clientes-placas', (req, res) => {
    const tdb = req.db || db;
    const sql = `
        SELECT DISTINCT TRIM(empresa) as cliente FROM (
            SELECT cliente as empresa FROM placas WHERE cliente IS NOT NULL AND TRIM(cliente) <> ''
            UNION
            SELECT razon_social as empresa FROM clientes WHERE razon_social IS NOT NULL AND TRIM(razon_social) <> ''
        ) AS t ORDER BY cliente
    `;
    tdb.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.cliente));
    });
});

// ============================================================
// ALMACÉN — Unidades de Medida
// ============================================================
router.get('/unidades', (req, res) => {
    db.query(`SELECT * FROM almacen_unidades ORDER BY orden, nombre`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/unidades', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.query('INSERT INTO almacen_unidades (nombre, descripcion, activo) VALUES (?,?,?)',
        [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id: result.insertId });
        });
});

router.put('/unidades/:id', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    db.query('UPDATE almacen_unidades SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
});

router.delete('/unidades/:id', (req, res) => {
    db.query('DELETE FROM almacen_unidades WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
    });
});

// ============================================================
// ALMACÉN — Sistemas y Sub-Sistemas
// ============================================================
router.get('/sistemas', (req, res) => {
    db.query(`SELECT * FROM almacen_sistemas ORDER BY orden, nombre`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse sub_sistemas JSON
        rows.forEach(r => {
            try { r.sub_sistemas = r.sub_sistemas ? JSON.parse(r.sub_sistemas) : []; }
            catch(e) { r.sub_sistemas = []; }
        });
        res.json(rows);
    });
});

router.post('/sistemas', (req, res) => {
    const { nombre, sub_sistemas, activo, orden } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.query('INSERT INTO almacen_sistemas (nombre, sub_sistemas, activo, orden) VALUES (?,?,?,?)',
        [nombre.toUpperCase().trim(), JSON.stringify(sub_sistemas || []), activo != null ? activo : 1, orden || 0],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id: result.insertId });
        });
});

router.put('/sistemas/:id', (req, res) => {
    const { nombre, sub_sistemas, activo, orden } = req.body;
    db.query('UPDATE almacen_sistemas SET nombre=?, sub_sistemas=?, activo=?, orden=? WHERE id=?',
        [nombre.toUpperCase().trim(), JSON.stringify(sub_sistemas || []), activo != null ? activo : 1, orden || 0, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
});

router.delete('/sistemas/:id', (req, res) => {
    db.query('DELETE FROM almacen_sistemas WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
    });
});

// ============================================================
// ALMACÉN — Almacenes / Sucursales
// ============================================================
const _asegurarAlmacenPrincipal = (cb) => {
    db.query(`CREATE TABLE IF NOT EXISTS almacen_almacenes (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL UNIQUE,
        descripcion VARCHAR(255) NULL,
        es_sistema  TINYINT(1)   NOT NULL DEFAULT 0,
        activo      TINYINT(1)   NOT NULL DEFAULT 1,
        orden       INT          NOT NULL DEFAULT 0,
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`, () => {
        db.query(`INSERT IGNORE INTO almacen_almacenes (nombre, descripcion, es_sistema, activo, orden) 
                  VALUES ('Principal', 'Almacén Principal Central del ERP', 1, 1, 1)`, () => {
            if (typeof cb === 'function') cb();
        });
    });
};

router.get('/almacenes-lista', (req, res) => {
    _asegurarAlmacenPrincipal(() => {
        db.query(`SELECT * FROM almacen_almacenes WHERE activo=1 ORDER BY orden, id`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
});

router.get('/almacenes', (req, res) => {
    _asegurarAlmacenPrincipal(() => {
        db.query(`SELECT * FROM almacen_almacenes ORDER BY orden, id`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
});

router.post('/almacenes', (req, res) => {
    const { nombre, descripcion, activo, orden } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const nomLimpio = nombre.trim();
    db.query('INSERT INTO almacen_almacenes (nombre, descripcion, activo, orden, es_sistema) VALUES (?,?,?,?,0)',
        [nomLimpio, descripcion || null, activo != null ? activo : 1, orden || 0],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
            res.json({ ok: true, id: result.insertId });
        });
});

router.put('/almacenes/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, activo, orden } = req.body;
    db.query('SELECT es_sistema, nombre FROM almacen_almacenes WHERE id=?', [id], (errC, rowsC) => {
        if (errC) return res.status(500).json({ error: errC.message });
        const esSistema = rowsC[0]?.es_sistema;
        const nombreFinal = esSistema ? rowsC[0].nombre : (nombre ? nombre.trim() : rowsC[0].nombre);

        db.query('UPDATE almacen_almacenes SET nombre=?, descripcion=?, activo=?, orden=? WHERE id=?',
            [nombreFinal, descripcion || null, activo != null ? activo : 1, orden || 0, id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
                res.json({ ok: true });
            });
    });
});

router.delete('/almacenes/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT es_sistema, nombre FROM almacen_almacenes WHERE id=?', [id], (errC, rowsC) => {
        if (errC) return res.status(500).json({ error: errC.message });
        if (rowsC[0]?.es_sistema) {
            return res.status(400).json({ error: 'No se puede eliminar el almacén Principal del sistema' });
        }
        db.query('DELETE FROM almacen_almacenes WHERE id=?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
            res.json({ ok: true });
        });
    });
});

// ============================================================
// ALMACÉN — Familias
// ============================================================
router.get('/familias', (req, res) => {
    db.query(`SELECT * FROM almacen_familias ORDER BY orden, nombre`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/familias', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.query('INSERT INTO almacen_familias (nombre, descripcion, activo) VALUES (?,?,?)',
        [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id: result.insertId });
        });
});

router.put('/familias/:id', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    db.query('UPDATE almacen_familias SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
});

router.delete('/familias/:id', (req, res) => {
    db.query('DELETE FROM almacen_familias WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
    });
});

// ============================================================
// ALMACÉN — Marcas de Fabricante
// ============================================================
router.get('/marcas', (req, res) => {
    db.query(`SELECT * FROM almacen_marcas ORDER BY orden, nombre`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
router.post('/marcas', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.query('INSERT INTO almacen_marcas (nombre, descripcion, activo) VALUES (?,?,?)',
        [nombre.toUpperCase(), descripcion || null, activo ?? 1], (err, r) => {
        if (err) return res.status(500).json({ error: err.message });
        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id: r.insertId });
    });
});
router.put('/marcas/:id', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    db.query('UPDATE almacen_marcas SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre.toUpperCase(), descripcion || null, activo ?? 1, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
    });
});
router.delete('/marcas/:id', (req, res) => {
    db.query('DELETE FROM almacen_marcas WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
    });
});

// ============================================================
// ALMACÉN — Entradas
// ============================================================
router.get('/entradas', (req, res) => {
    let q = `SELECT e.*, GROUP_CONCAT(CONCAT(COALESCE(i.descripcion, d.descripcion, ''),'|',COALESCE(d.cantidad,0),'|',COALESCE(d.costo_unitario,0),'|',COALESCE(d.moneda,'PEN'),'|',COALESCE(d.inventario_id,''),'|',COALESCE(d.importe,0)) SEPARATOR ';;') AS items_raw
             FROM entradas_inv e
             LEFT JOIN detalle_entradas_inv d ON d.entrada_id=e.id
             LEFT JOIN inventario i ON d.inventario_id = i.id`;
    let params = [];
    if (req.query.ot_id) {
        q += ` WHERE e.ot_id = ?`;
        params.push(req.query.ot_id);
    }
    q += ` GROUP BY e.id ORDER BY e.fecha DESC, e.id DESC LIMIT 300`;
    db.query(q, params, async (err, rows) => {
        if (err) {
            console.error('[GET /api/almacen/entradas error]', err);
            return res.status(500).json({ error: err.message });
        }
        const { getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');

        // Mapear usuarios y proveedores para nombres completos y RUC
        const [usuariosMap, provsMap] = await Promise.all([
            new Promise(resU => {
                db.query('SELECT nombre, correo, idUsuario FROM usuarios', (eU, rU) => {
                    const uMap = {};
                    if (!eU && rU) {
                        rU.forEach(u => {
                            if (u.correo) uMap[u.correo.toLowerCase()] = u.nombre;
                            if (u.idUsuario) uMap[String(u.idUsuario)] = u.nombre;
                            if (u.nombre) uMap[u.nombre.toLowerCase()] = u.nombre;
                        });
                    }
                    resU(uMap);
                });
            }),
            new Promise(resP => {
                db.query('SELECT id, nombre, razon_social, numero_documento, telefono, email FROM proveedores_inv', (eP, rP) => {
                    const pMap = {};
                    if (!eP && rP) {
                        rP.forEach(p => {
                            if (p.id) pMap[p.id] = p;
                            if (p.nombre) pMap[p.nombre.toLowerCase()] = p;
                            if (p.razon_social) pMap[p.razon_social.toLowerCase()] = p;
                        });
                    }
                    resP(pMap);
                });
            })
        ]);

        const signedRows = await Promise.all(rows.map(async (r) => {
            // Resolver creador_nombre
            const creadorKey = (r.creado_por || '').toLowerCase().trim();
            r.creador_nombre = usuariosMap[creadorKey] || usuariosMap[r.creado_por] || r.creado_por || 'SISTEMA';

            // Resolver proveedor datos
            const pInfo = (r.proveedor_id && provsMap[r.proveedor_id]) || 
                          (r.proveedor_nombre && provsMap[r.proveedor_nombre.toLowerCase()]) || null;
            r.proveedor_ruc = pInfo?.numero_documento || '';
            r.proveedor_telefono = pInfo?.telefono || '';
            r.proveedor_email = pInfo?.email || '';

            r.items = r.items_raw ? r.items_raw.split(';;').map(s => {
                const [desc, cant, cu, mon, invId, imp] = s.split('|');
                const cantNum = parseFloat(cant) || 0;
                const cuNum = parseFloat(cu) || 0;
                const impNum = parseFloat(imp) || (cantNum * cuNum);
                return { 
                    descripcion: desc || '', 
                    cantidad: cantNum, 
                    costo_unitario: cuNum, 
                    moneda: mon || r.moneda || 'PEN', 
                    inventario_id: invId || '',
                    unidad_medida: 'UND',
                    importe: impNum,
                    codigo_articulo: invId || ''
                };
            }) : [];
            delete r.items_raw;
            if (r.url_voucher) { const k = s3KeyFromUrl(r.url_voucher); if (k) r.url_voucher_presigned = await getPresignedUrl(k).catch(()=>r.url_voucher); }
            if (r.url_cotizacion) { const k = s3KeyFromUrl(r.url_cotizacion); if (k) r.url_cotizacion_presigned = await getPresignedUrl(k).catch(()=>r.url_cotizacion); }
            if (r.url_factura) { const k = s3KeyFromUrl(r.url_factura); if (k) r.url_factura_presigned = await getPresignedUrl(k).catch(()=>r.url_factura); }
            return r;
        }));
        res.json(signedRows);
    });
});
router.post('/entradas', (req, res) => {
    const { fecha, proveedor_id, proveedor_nombre, documento_referencia, moneda, tipo_cambio, tipo_igv, observaciones, creado_por, items, motivo_entrada, placa, tipo_orden, condicion_pago, dias_credito, ot_id } = req.body;
    const anio = new Date(fecha || Date.now()).getFullYear();
    const tc = parseFloat(tipo_cambio) || 1;
    _generarCodigoAlmacen('ENT', anio, (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        const total_pen = _calcularTotalPen(items || [], tc);
        db.query('INSERT INTO entradas_inv (id,fecha,proveedor_id,proveedor_nombre,documento_referencia,moneda,tipo_cambio,total_pen,observaciones,tipo_igv,creado_por,motivo_entrada,placa,tipo_orden,condicion_pago,dias_credito,ot_id,estado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [id, fecha||new Date().toISOString().split('T')[0], proveedor_id||null, proveedor_nombre||null,
             documento_referencia||null, moneda||'PEN', tc||null, total_pen, observaciones||null, tipo_igv||'sin_igv', creado_por||null, motivo_entrada||null, placa||null, tipo_orden||'Orden de compra', condicion_pago||'Al contado', dias_credito||30, ot_id||null, 'Registrado'],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (!items || !items.length) { if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, id }); }
                // Resolver inventario_id por descripción para items sin código
                const descsEntrada = items.filter(d => !d.inventario_id && d.descripcion).map(d => d.descripcion);
                const resolverEntrada = (cb) => {
                    if (!descsEntrada.length) return cb({});
                    db.query('SELECT id, descripcion FROM inventario WHERE descripcion IN (?) AND activo = 1', [descsEntrada], (e, rows) => {
                        const mapa = {};
                        if (!e && rows) rows.forEach(r => { mapa[r.descripcion] = r.id; });
                        cb(mapa);
                    });
                };
                resolverEntrada((mapaInvEnt) => {
                    const dVals = items.map(d => {
                        const invId = d.inventario_id || mapaInvEnt[d.descripcion] || null;
                        return [id, invId, d.descripcion||null,
                            parseFloat(d.cantidad)||0, parseFloat(d.costo_unitario)||0, d.moneda||moneda||'PEN',
                            parseFloat(d.importe)||((parseFloat(d.cantidad)||0)*(parseFloat(d.costo_unitario)||0))];
                    });
                    db.query('INSERT INTO detalle_entradas_inv (entrada_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], () => {
                        // Actualizar costo_referencial en PEN para cada ítem con inventario_id conocido
                        const toUpdate = items.filter(d =>
                            (d.inventario_id || mapaInvEnt[d.descripcion]) && parseFloat(d.costo_unitario) > 0
                        );
                        if (!toUpdate.length) { if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, id }); }
                        let done = 0;
                        toUpdate.forEach(d => {
                            const invId      = d.inventario_id || mapaInvEnt[d.descripcion];
                            const isUSD      = d.moneda === 'USD' || moneda === 'USD';
                            const costoOrig  = parseFloat(d.costo_unitario);
                            const costoSoles = isUSD ? costoOrig * tc : costoOrig;
                            db.query(
                                'UPDATE inventario SET costo_referencial=?, costo_soles=?, tipo_cambio=? WHERE id=? AND activo=1',
                                [costoOrig, costoSoles, isUSD ? tc : null, invId],
                                () => { if (++done === toUpdate.length) if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id }); }
                            );
                        });
                    });
                });
            });
    });
});
router.put('/entradas/:id', (req, res) => {
    const { id } = req.params;
    const { fecha, proveedor_id, proveedor_nombre, documento_referencia, moneda, tipo_cambio, tipo_igv, observaciones, items, motivo_entrada, placa, tipo_orden, condicion_pago, dias_credito, ot_id } = req.body;
    const tc = parseFloat(tipo_cambio) || 1;
    const total_pen = _calcularTotalPen(items || [], tc);

    db.query('UPDATE entradas_inv SET fecha=?, proveedor_id=?, proveedor_nombre=?, documento_referencia=?, moneda=?, tipo_cambio=?, total_pen=?, observaciones=?, tipo_igv=?, motivo_entrada=?, placa=?, tipo_orden=?, condicion_pago=?, dias_credito=?, ot_id=? WHERE id=?',
        [fecha||new Date().toISOString().split('T')[0], proveedor_id||null, proveedor_nombre||null,
         documento_referencia||null, moneda||'PEN', tc||null, total_pen, observaciones||null, tipo_igv||'sin_igv', motivo_entrada||null, placa||null, tipo_orden||'Orden de compra', condicion_pago||'Al contado', dias_credito||30, ot_id||null, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            
            // Delete old details
            db.query('DELETE FROM detalle_entradas_inv WHERE entrada_id=?', [id], (errDel) => {
                if (errDel) return res.status(500).json({ error: errDel.message });
                if (!items || !items.length) { if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, id }); }

                const descsEntrada = items.filter(d => !d.inventario_id && d.descripcion).map(d => d.descripcion);
                const resolverEntrada = (cb) => {
                    if (!descsEntrada.length) return cb({});
                    db.query('SELECT id, descripcion FROM inventario WHERE descripcion IN (?) AND activo = 1', [descsEntrada], (e, rows) => {
                        const mapa = {};
                        if (!e && rows) rows.forEach(r => { mapa[r.descripcion] = r.id; });
                        cb(mapa);
                    });
                };

                resolverEntrada((mapaInvEnt) => {
                    const dVals = items.map(d => {
                        const invId = d.inventario_id || mapaInvEnt[d.descripcion] || null;
                        return [id, invId, d.descripcion||null,
                            parseFloat(d.cantidad)||0, parseFloat(d.costo_unitario)||0, d.moneda||moneda||'PEN',
                            parseFloat(d.importe)||((parseFloat(d.cantidad)||0)*(parseFloat(d.costo_unitario)||0))];
                    });
                    db.query('INSERT INTO detalle_entradas_inv (entrada_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], () => {
                        const toUpdate = items.filter(d =>
                            (d.inventario_id || mapaInvEnt[d.descripcion]) && parseFloat(d.costo_unitario) > 0
                        );
                        if (!toUpdate.length) { if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, id }); }
                        let done = 0;
                        toUpdate.forEach(d => {
                            const invId      = d.inventario_id || mapaInvEnt[d.descripcion];
                            const isUSD      = d.moneda === 'USD' || moneda === 'USD';
                            const costoOrig  = parseFloat(d.costo_unitario);
                            const costoSoles = isUSD ? costoOrig * tc : costoOrig;
                            db.query(
                                'UPDATE inventario SET costo_referencial=?, costo_soles=?, tipo_cambio=? WHERE id=? AND activo=1',
                                [costoOrig, costoSoles, isUSD ? tc : null, invId],
                                () => { if (++done === toUpdate.length) if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id }); }
                            );
                        });
                    });
                });
            });
        }
    );
});
router.delete('/entradas/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM detalle_entradas_inv WHERE entrada_id=?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('DELETE FROM entradas_inv WHERE id=?', [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
    });
});

router.put('/entradas/:id/estado', (req, res) => {
    const { id } = req.params;
    const { estado, comentario, usuario } = req.body;
    if (!estado) return res.status(400).json({ error: 'Estado requerido' });

    db.query('UPDATE entradas_inv SET estado=?, observaciones_estado=? WHERE id=?',
        [estado, comentario || null, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof logAudit === 'function' && usuario) {
                logAudit(usuario, 'almacen/entradas', 'MODIFICÓ', `/api/almacen/entradas/${id}/estado (${estado})`);
            }
            res.json({ ok: true, estado });
        }
    );
});

router.put('/entradas/:id/anular', (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;
    db.query('UPDATE entradas_inv SET estado=?, motivo_anulacion=? WHERE id=?',
        ['Anulado', String(motivo || '').trim(), id], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); } 
            res.json({ ok: true });
        }
    );
});

router.post('/entradas/:id/archivo/:tipo', _multerInv.single('archivo'), (req, res) => {
    const { tipo } = req.params;
    if (!['voucher', 'cotizacion', 'factura'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    try {
        const { uploadToS3, deleteFromS3, s3KeyFromUrl } = require('../utils/s3');
        const col = `url_${tipo}`;
        db.query(`SELECT ${col} FROM entradas_inv WHERE id=?`, [req.params.id], async (err, rows) => {
            if (err) return res.status(500).json({ error: 'DB Error: ' + err.message });
            try {
                if (rows && rows.length > 0 && rows[0][col]) {
                    const oldKey = s3KeyFromUrl(rows[0][col]);
                    if (oldKey) await deleteFromS3(oldKey).catch(() => {});
                }
                const ext = req.file.originalname.split('.').pop() || 'pdf';
                const s3Key = `almacen/entradas/${req.params.id}/${tipo}_${Date.now()}.${ext}`;
                const url = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
                db.query(`UPDATE entradas_inv SET ${col}=? WHERE id=?`, [url, req.params.id], (err2) => {
                    if (err2) return res.status(500).json({ error: 'Update Error: ' + err2.message });
                    res.json({ ok: true, url });
                });
            } catch (innerError) {
                res.status(500).json({ error: 'S3 Error: ' + innerError.message });
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/entradas/:id/archivo/:tipo', (req, res) => {
    const { tipo } = req.params;
    if (!['voucher', 'cotizacion', 'factura'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

    try {
        const { deleteFromS3, s3KeyFromUrl } = require('../utils/s3');
        const col = `url_${tipo}`;
        db.query(`SELECT ${col} FROM entradas_inv WHERE id=?`, [req.params.id], async (err, rows) => {
            if (err) return res.status(500).json({ error: 'DB Error: ' + err.message });
            try {
                if (rows && rows.length > 0 && rows[0][col]) {
                    const oldKey = s3KeyFromUrl(rows[0][col]);
                    if (oldKey) await deleteFromS3(oldKey).catch(() => {});
                }
                db.query(`UPDATE entradas_inv SET ${col}=NULL WHERE id=?`, [req.params.id], (err2) => {
                    if (err2) return res.status(500).json({ error: 'Update Error: ' + err2.message });
                    if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'ELIMINÓ', req.path); }
                    res.json({ ok: true });
                });
            } catch (innerError) {
                res.status(500).json({ error: 'S3 Error: ' + innerError.message });
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// ALMACÉN — Salidas
// ============================================================
router.get('/salidas', (req, res) => {
    const targetDb = req.db || db;
    const SEP_FIELD = '\x1F', SEP_ROW = '\x1E';
    const q = (req.query.q || '').trim();

    let whereClause = '';
    let queryParams = [];
    if (q) {
        whereClause = 'WHERE s.id LIKE ?';
        queryParams = [`%${q}%`];
    }

    const limit = q ? '' : 'LIMIT 2000';

    targetDb.query(`SELECT s.*,
              GROUP_CONCAT(CONCAT_WS('\x1F',
                COALESCE(d.inventario_id,''),
                COALESCE(i.descripcion, d.descripcion,''),
                COALESCE(d.cantidad,0),
                COALESCE(d.costo_unitario,0),
                COALESCE(d.moneda,'PEN'),
                COALESCE(d.importe, d.cantidad*d.costo_unitario, 0)
              ) SEPARATOR '\x1E') AS items_raw
              FROM salidas_inv s
              LEFT JOIN detalle_salidas_inv d ON d.salida_id=s.id
              LEFT JOIN inventario i ON d.inventario_id = i.id
              ${whereClause}
              GROUP BY s.id ORDER BY s.fecha DESC, s.id DESC ${limit}`, queryParams, (err, rows) => {
        if (err) {
            console.error('Error GET /api/almacen/salidas:', err);
            return res.status(500).json({ error: err.message });
        }
        try {
            const result = (Array.isArray(rows) ? rows : []).map(r => {
                let sol = (r.solicitante_nombre || r.creado_por || '').trim();
                if (sol && sol.includes('@')) {
                    let uName = sol.split('@')[0].replace(/[._-]/g, ' ');
                    sol = uName.charAt(0).toUpperCase() + uName.slice(1);
                }
                const items = r.items_raw ? r.items_raw.split(SEP_ROW).map(seg => {
                    const parts = seg.split(SEP_FIELD);
                    return {
                        inventario_id: parts[0] || null,
                        descripcion: parts[1] || null,
                        cantidad: parseFloat(parts[2]) || 0,
                        costo_unitario: parseFloat(parts[3]) || 0,
                        moneda: parts[4] || 'PEN',
                        importe: parseFloat(parts[5]) || 0
                    };
                }).filter(it => it.descripcion || it.inventario_id) : [];

                const rObj = Object.assign({}, r, { creado_por: sol, items: items });
                delete rObj.items_raw;
                return rObj;
            });
            res.json(result);
        } catch (e) {
            console.error('Error procesando filas de salidas:', e);
            res.status(500).json({ error: e.message });
        }
    });
});
router.post('/salidas', (req, res) => {
    const { fecha, tipo_destino, placa, responsable, responsable_id, moneda, tipo_cambio, observaciones, creado_por, items, ticket_ot } = req.body;

    // Validar estado de la OT antes de permitir salida
    if (ticket_ot) {
        db.query('SELECT estado FROM ordenes_trabajo WHERE id_ot = ?', [ticket_ot], (errOT, rowsOT) => {
            if (errOT) return res.status(500).json({ error: errOT.message });
            if (!rowsOT.length) return res.status(400).json({ error: 'La OT ' + ticket_ot + ' no existe' });
            const estadoOT = rowsOT[0].estado;
            // Bloqueo removido: Permitir salidas a OT cerradas para regularizaciones de almacén
            crearSalida();
        });
    } else {
        crearSalida();
    }

    function crearSalida() {
        const anio = new Date(fecha || Date.now()).getFullYear();
        const tc = parseFloat(tipo_cambio) || 1;
        const solUser = creado_por || req.body.usuario || req.body.solicitante || (req.user && req.user.nombre) || null;
        _generarCodigoAlmacen('SAL', anio, (err, id) => {
            if (err) return res.status(500).json({ error: err.message });
            const total_pen = _calcularTotalPen(items || [], tc);
            db.query('INSERT INTO salidas_inv (id,fecha,tipo_destino,placa,responsable,responsable_id,moneda,tipo_cambio,total_pen,observaciones,creado_por,ticket_ot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                [id, fecha||new Date().toISOString().split('T')[0], tipo_destino, placa||null, responsable||null,
                 responsable_id||null, moneda||'PEN', tc||null, total_pen, observaciones||null, solUser, ticket_ot||null],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (!items || !items.length) { if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, id }); }
                    // Resolver inventario_id por descripción para items sin código
                    const descsSalida = items.filter(d => !d.inventario_id && d.descripcion).map(d => d.descripcion);
                    const resolverSalida = (cb) => {
                        if (!descsSalida.length) return cb({});
                        db.query('SELECT id, descripcion FROM inventario WHERE descripcion IN (?) AND activo = 1', [descsSalida], (e, rows) => {
                            const mapa = {};
                            if (!e && rows) rows.forEach(r => { mapa[r.descripcion] = r.id; });
                            cb(mapa);
                        });
                    };
                    resolverSalida((mapaInvSal) => {
                        const dVals = items.map(d => {
                            const invId = d.inventario_id || mapaInvSal[d.descripcion] || null;
                            return [id, invId, d.descripcion||null,
                                parseFloat(d.cantidad)||0, parseFloat(d.costo_unitario)||0, d.moneda||moneda||'PEN',
                                parseFloat(d.importe)||((parseFloat(d.cantidad)||0)*(parseFloat(d.costo_unitario)||0))];
                        });
                        db.query('INSERT INTO detalle_salidas_inv (salida_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], () => {});
                        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id });
                    });
                });
        });
    } // fin crearSalida
});
router.put('/salidas/:id', (req, res) => {
    const { id } = req.params;
    const { accion, motivo } = req.body;
    if (accion === 'anular') {
        if (!motivo || !String(motivo).trim()) return res.status(400).json({ error: 'Motivo requerido' });
        db.query('UPDATE salidas_inv SET estado=?, motivo_anulacion=? WHERE id=?',
            ['Anulado', String(motivo).trim(), id], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!result.affectedRows) return res.status(404).json({ error: 'No encontrado' });
                if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
    } else if (accion === 'despachar') {
        db.query("UPDATE salidas_inv SET estado='Despachado' WHERE id=?", [id], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'No encontrado' });
            // Resolver inventario_id nulos: por descripción exacta O prefijo "INV-XXX — ..."
            db.query(
                `UPDATE detalle_salidas_inv d
                 INNER JOIN inventario i ON (i.descripcion = d.descripcion OR LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id) AND i.activo = 1
                 SET d.inventario_id = i.id
                 WHERE d.salida_id = ? AND (d.inventario_id IS NULL OR d.inventario_id = '')`,
                [id], () => {}
            );
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
    } else if (accion === 'editar') {
        const { fecha, tipo_destino, placa, responsable, ticket_ot, observaciones, items, moneda, tipo_cambio } = req.body;
        const tc = parseFloat(tipo_cambio) || 1;
        const total_pen = _calcularTotalPen(items || [], tc);
        db.query(`UPDATE salidas_inv SET fecha=?, tipo_destino=?, placa=?, responsable=?, ticket_ot=?, observaciones=?, moneda=?, tipo_cambio=?, total_pen=? WHERE id=?`,
            [fecha || null, tipo_destino || null, placa || null, responsable || null, ticket_ot || null, observaciones || null, moneda || 'PEN', tc, total_pen, id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                db.query('DELETE FROM detalle_salidas_inv WHERE salida_id=?', [id], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (!items || !items.length) {
                        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); }
                        return res.json({ ok: true, id });
                    }
                    const dVals = items.map(d => {
                        return [id, d.inventario_id || null, d.descripcion || null,
                            parseFloat(d.cantidad) || 0, parseFloat(d.costo_unitario) || 0, d.moneda || moneda || 'PEN',
                            parseFloat(d.importe) || ((parseFloat(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0))];
                    });
                    db.query('INSERT INTO detalle_salidas_inv (salida_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], (err3) => {
                        if (err3) return res.status(500).json({ error: err3.message });
                        if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); }
                        res.json({ ok: true, id });
                    });
                });
            });
    } else {
        res.status(400).json({ error: 'Acción no válida' });
    }
});
router.delete('/salidas/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM detalle_salidas_inv WHERE salida_id=?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('DELETE FROM salidas_inv WHERE id=?', [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
    });
});

// ============================================================
// ALMACÉN — Kardex (movimientos por artículo)
// ============================================================
router.get('/kardex/:inventario_id', (req, res) => {
    const id = req.params.inventario_id;

    db.query('SELECT stock_regularizado, fecha_regularizacion FROM inventario WHERE id=?', [id], (e2, inv) => {
        if (e2) return res.status(500).json({ error: e2.message });
        const base    = parseFloat(inv[0]?.stock_regularizado || 0);
        const regDate = inv[0]?.fecha_regularizacion || null;

        db.query(`
            SELECT 'Entrada' AS tipo, e.fecha, e.created_at, e.id AS doc_id, e.proveedor_nombre AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe
            FROM detalle_entradas_inv d JOIN entradas_inv e ON e.id=d.entrada_id
            WHERE d.inventario_id=? AND (e.estado IS NULL OR e.estado != 'Anulado') AND (e.tipo_orden = 'Entrada directa' OR e.tipo_orden = 'Ajuste')
            UNION ALL
            SELECT 'Recepción OC' AS tipo, DATE(r.fecha_recepcion) AS fecha, r.fecha_recepcion AS created_at, r.oc_id AS doc_id, CONCAT('Recepción OC / ', COALESCE(r.almacen,'ALM CENTRAL'), ' - ', COALESCE(r.usuario,'')) AS contraparte, dr.cantidad_recibida AS cantidad, dr.costo_unitario, dr.moneda, (dr.cantidad_recibida * dr.costo_unitario) AS importe
            FROM detalle_recepciones_oc dr JOIN recepciones_oc r ON r.id=dr.recepcion_id
            WHERE dr.inventario_id=?
            UNION ALL
            SELECT 'Salida' AS tipo, s.fecha, s.created_at, s.id AS doc_id, CONCAT(s.tipo_destino,' / ',COALESCE(s.placa,s.responsable,'—')) AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe
            FROM detalle_salidas_inv d JOIN salidas_inv s ON s.id=d.salida_id
            WHERE d.inventario_id=? AND (s.estado IS NULL OR s.estado = 'Despachado')
            ORDER BY fecha ASC, created_at ASC, doc_id ASC
        `, [id, id, id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            let saldo = base;
            rows.forEach(r => {
                if (r.tipo === 'Entrada' || r.tipo === 'Recepción OC') saldo += parseFloat(r.cantidad || 0);
                else saldo -= parseFloat(r.cantidad || 0);
                r.saldo = parseFloat(saldo.toFixed(4));
            });
            res.json({ stock_base: base, fecha_regularizacion: regDate, movimientos: rows });
        });
    });
});

// ============================================================
// ALMACÉN — RECEPCIÓN DE ÓRDENES DE COMPRA
// ============================================================
router.get('/recepciones-oc', async (req, res) => {
    try {
        const targetDb = req.db || db;
        // 1. Obtener SOLO las órdenes de compra que ya fueron APROBADAS Y PAGADAS / PROCESADAS
        const sqlOCs = `
            SELECT e.*, 
                   COALESCE(SUM(de.cantidad), 0) AS total_items_oc,
                   COUNT(DISTINCT de.id) AS total_renglones
            FROM entradas_inv e
            LEFT JOIN detalle_entradas_inv de ON de.entrada_id = e.id
            WHERE LOWER(e.estado) IN ('pagado', 'procesado')
            GROUP BY e.id
            ORDER BY e.fecha DESC, e.id DESC
        `;

        targetDb.query(sqlOCs, async (errOC, ocs) => {
            if (errOC) return res.status(500).json({ error: errOC.message });

            // 2. Obtener todas las recepciones registradas agrupadas por OC
            const sqlRecs = `
                SELECT r.id AS recepcion_id, r.oc_id, r.fecha_recepcion, r.usuario, r.almacen, r.sustento_url, r.observacion, r.tipo_recepcion,
                       dr.inventario_id, dr.descripcion, dr.cantidad_recibida, dr.costo_unitario, dr.moneda
                FROM recepciones_oc r
                JOIN detalle_recepciones_oc dr ON dr.recepcion_id = r.id
                ORDER BY r.fecha_recepcion ASC
            `;

            targetDb.query(sqlRecs, async (errRec, recRows) => {
                if (errRec) return res.status(500).json({ error: errRec.message });

                // Mapear recepciones por oc_id
                const recMap = {};
                (recRows || []).forEach(row => {
                    if (!recMap[row.oc_id]) recMap[row.oc_id] = { items_recibidos: 0, historial: [] };
                    recMap[row.oc_id].items_recibidos += parseFloat(row.cantidad_recibida || 0);
                    recMap[row.oc_id].historial.push(row);
                });

                // Traer detalle completo de ítems por cada OC
                const sqlDetalle = `
                    SELECT de.entrada_id AS oc_id, de.inventario_id, de.descripcion, de.cantidad, de.costo_unitario, de.moneda, de.importe,
                           i.descripcion AS inv_nombre, i.unidad
                    FROM detalle_entradas_inv de
                    LEFT JOIN inventario i ON i.id = de.inventario_id
                `;

                targetDb.query(sqlDetalle, async (errDet, detRows) => {
                    if (errDet) return res.status(500).json({ error: errDet.message });

                    const itemsPorOC = {};
                    (detRows || []).forEach(d => {
                        if (!itemsPorOC[d.oc_id]) itemsPorOC[d.oc_id] = [];
                        itemsPorOC[d.oc_id].push(d);
                    });

                    const { getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');

                    // Armar lista enriquecida con estado de progreso de recepción
                    const resultado = await Promise.all((ocs || []).map(async oc => {
                        const recInfo = recMap[oc.id] || { items_recibidos: 0, historial: [] };
                        const itemsOC = itemsPorOC[oc.id] || [];

                        let totalPedido = 0;
                        let totalRecibido = recInfo.items_recibidos;

                        // Detalle de ítems con sus saldos de recepción
                        const itemsCalculados = itemsOC.map(it => {
                            const cantPedida = parseFloat(it.cantidad || 0);
                            totalPedido += cantPedida;

                            // Cuánto se ha recibido de este ítem
                            const recibidosItem = recInfo.historial
                                .filter(h => (h.inventario_id && h.inventario_id === it.inventario_id) || (h.descripcion === it.descripcion))
                                .reduce((acc, h) => acc + parseFloat(h.cantidad_recibida || 0), 0);

                            const pendiente = Math.max(0, cantPedida - recibidosItem);
                            return {
                                inventario_id: it.inventario_id || '',
                                descripcion: it.descripcion || it.inv_nombre || 'Ítem sin descripción',
                                unidad: it.unidad || 'UND',
                                pedido: cantPedida,
                                recepcionado: recibidosItem,
                                pendiente: pendiente,
                                costo_unitario: parseFloat(it.costo_unitario || 0),
                                moneda: it.moneda || oc.moneda || 'PEN'
                            };
                        });

                        // Firmar URLs de fotos de sustento en S3 para el historial
                        const historialFirmado = await Promise.all((recInfo.historial || []).map(async h => {
                            let urlFirmada = h.sustento_url;
                            if (h.sustento_url) {
                                const k = s3KeyFromUrl(h.sustento_url);
                                if (k) {
                                    urlFirmada = await getPresignedUrl(k, 3600).catch(() => h.sustento_url);
                                }
                            }
                            return {
                                ...h,
                                sustento_url_presigned: urlFirmada
                            };
                        }));

                        // Determinar estado de recepción
                        let estadoRecepcion = 'PENDIENTE';
                        if (totalRecibido > 0 && totalRecibido < totalPedido) {
                            estadoRecepcion = 'PARCIAL';
                        } else if (totalPedido > 0 && totalRecibido >= totalPedido) {
                            estadoRecepcion = 'COMPLETO';
                        }

                        let fechaOCFinal = oc.fecha;
                        const raw = oc.created_at || oc.fecha;
                        if (raw) {
                            try {
                                const d = new Date(String(raw).includes('T') ? raw : String(raw).replace(' ', 'T'));
                                if (!isNaN(d.getTime())) {
                                    const dateStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
                                    const timeStr = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
                                    fechaOCFinal = (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) ? dateStr : `${dateStr} ${timeStr}`;
                                }
                            } catch (e) {
                                fechaOCFinal = String(raw);
                            }
                        }

                        return {
                            id: oc.id,
                            fecha: fechaOCFinal,
                            proveedor: oc.proveedor_nombre || 'PROVEEDOR GENERAL',
                            solicitante: oc.creado_por || 'ALMACÉN / MANTENIMIENTO',
                            almacen: oc.almacen || 'ALM CENTRAL',
                            moneda: oc.moneda || 'PEN',
                            importe: parseFloat(oc.total_pen || 0),
                            estado_oc: (oc.estado || 'PAGADA').toUpperCase(),
                            total_pedido: totalPedido,
                            total_recibido: totalRecibido,
                            estado_recepcion: estadoRecepcion,
                            progreso_label: `${estadoRecepcion} (${totalRecibido}/${totalPedido})`,
                            items: itemsCalculados,
                            historial_recepciones: historialFirmado
                        };
                    }));

                    res.json(resultado);
                });
            });
        });
    } catch (e) {
        console.error('Error en GET /api/almacen/recepciones-oc:', e);
        res.status(500).json({ error: e.message });
    }
});

// Registrar entrega / recepción (parcial o completa) de una OC
router.post('/recepciones-oc/registrar', _multerInv.single('sustento'), async (req, res) => {
    try {
        const { oc_id, fecha_recepcion, usuario, almacen, observacion, items_json } = req.body;
        if (!oc_id) return res.status(400).json({ error: 'N° de Orden de Compra requerido' });

        let items = [];
        try { items = JSON.parse(items_json || '[]'); } catch(e) { items = []; }
        if (!items.length) return res.status(400).json({ error: 'No se recibieron productos a recepcionar' });

        const targetDb = req.db || db;
        let sustentoUrl = null;

        // Subir sustento / foto a AWS S3 si fue adjuntado
        if (req.file) {
            const { uploadToS3 } = require('../utils/s3');
            const ext = req.file.originalname.split('.').pop() || 'jpg';
            const s3Key = `almacen/recepciones_oc/${oc_id}/${Date.now()}.${ext}`;
            sustentoUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
        }

        let fechaHoraSQL;
        if (fecha_recepcion) {
            // Reemplazar 'T' por espacio y asegurar formato YYYY-MM-DD HH:mm:ss
            fechaHoraSQL = fecha_recepcion.replace('T', ' ');
            if (fechaHoraSQL.length === 16) fechaHoraSQL += ':00';
        } else {
            const ahora = new Date();
            const yyyy = ahora.getFullYear();
            const mm = String(ahora.getMonth() + 1).padStart(2, '0');
            const dd = String(ahora.getDate()).padStart(2, '0');
            const hh = String(ahora.getHours()).padStart(2, '0');
            const min = String(ahora.getMinutes()).padStart(2, '0');
            const ss = String(ahora.getSeconds()).padStart(2, '0');
            fechaHoraSQL = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
        }

        // Determinar si esta entrega completa la orden o es parcial
        const totalRecepcionadoAhora = items.reduce((sum, it) => sum + (parseFloat(it.cantidad_recibida) || 0), 0);
        const tipoRecepcion = req.body.tipo_recepcion || 'TOTAL';

        // 1. Insertar Cabecera de Recepción
        targetDb.query(
            `INSERT INTO recepciones_oc (oc_id, fecha_recepcion, usuario, almacen, sustento_url, observacion, tipo_recepcion)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [oc_id, fechaHoraSQL, usuario || 'Almacén Central', almacen || 'ALM CENTRAL', sustentoUrl, observacion || null, tipoRecepcion],
            (errRec, resRec) => {
                if (errRec) return res.status(500).json({ error: errRec.message });
                const recepcionId = resRec.insertId;

                // 2. Insertar Detalle de Recepción
                const detalleVals = items.map(it => [
                    recepcionId,
                    oc_id,
                    it.inventario_id || null,
                    it.descripcion || 'Ítem recepcionado',
                    parseFloat(it.cantidad_recibida) || 0,
                    parseFloat(it.costo_unitario) || 0,
                    it.moneda || 'PEN',
                    it.almacen || almacen || 'ALM CENTRAL'
                ]);

                targetDb.query(
                    `INSERT INTO detalle_recepciones_oc (recepcion_id, oc_id, inventario_id, descripcion, cantidad_recibida, costo_unitario, moneda, almacen)
                     VALUES ?`,
                    [detalleVals],
                    (errDet) => {
                        if (errDet) return res.status(500).json({ error: errDet.message });

                        // 3. Auditoría del sistema ERP
                        if (typeof logAudit === 'function' && usuario) {
                            logAudit(usuario, 'almacen/recepcion-compras', 'CREÓ', `/api/almacen/recepciones-oc/registrar (${oc_id})`);
                        }

                        res.json({
                            ok: true,
                            mensaje: 'Recepción registrada y stock actualizado con éxito',
                            recepcion_id: recepcionId,
                            sustento_url: sustentoUrl
                        });
                    }
                );
            }
        );
    } catch (err) {
        console.error('Error al registrar recepción de OC:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ALMACÉN — Costos (análisis)
// ============================================================
router.get('/costos', (req, res) => {
    const { desde, hasta } = req.query;
    const conds = [];
    const params = [];
    if (desde) { conds.push('s.fecha >= ?'); params.push(desde); }
    if (hasta)  { conds.push('s.fecha <= ?'); params.push(hasta); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    Promise.all([
        // Por familia
        new Promise((resolve, reject) => {
            db.query(`SELECT COALESCE(i.familia,'Sin familia') AS familia, SUM(d.importe) AS total, COUNT(*) AS movimientos
                      FROM detalle_salidas_inv d
                      JOIN salidas_inv s ON s.id=d.salida_id
                      JOIN inventario i ON i.id=d.inventario_id
                      ${where}
                      GROUP BY COALESCE(i.familia,'Sin familia') ORDER BY total DESC`, params, (e, r) => e ? reject(e) : resolve(r));
        }),
        // Por almacen
        new Promise((resolve, reject) => {
            db.query(`SELECT COALESCE(i.almacen,'Sin almacén') AS almacen, SUM(d.importe) AS total, COUNT(*) AS movimientos
                      FROM detalle_salidas_inv d
                      JOIN salidas_inv s ON s.id=d.salida_id
                      JOIN inventario i ON i.id=d.inventario_id
                      ${where}
                      GROUP BY COALESCE(i.almacen,'Sin almacén') ORDER BY total DESC`, params, (e, r) => e ? reject(e) : resolve(r));
        }),
        // Totales (entradas vs salidas)
        new Promise((resolve, reject) => {
            const p2 = [...params, ...params];
            db.query(`SELECT
                        (SELECT SUM(total_pen) FROM entradas_inv e ${conds.length ? 'WHERE e.fecha >= ? AND e.fecha <= ?' : ''}) AS total_entradas,
                        (SELECT SUM(total_pen) FROM salidas_inv s ${conds.length ? 'WHERE s.fecha >= ? AND s.fecha <= ?' : ''}) AS total_salidas`,
                conds.length ? [desde, hasta, desde, hasta] : [], (e, r) => e ? reject(e) : resolve(r[0]));
        }),
        // Top 10 artículos más consumidos
        new Promise((resolve, reject) => {
            db.query(`SELECT i.id, i.descripcion, i.familia, SUM(d.cantidad) AS cantidad_total, SUM(d.importe) AS costo_total, i.unidad
                      FROM detalle_salidas_inv d
                      JOIN salidas_inv s ON s.id=d.salida_id
                      JOIN inventario i ON i.id=d.inventario_id
                      ${where}
                      GROUP BY i.id ORDER BY costo_total DESC LIMIT 20`, params, (e, r) => e ? reject(e) : resolve(r));
        }),
        // Por cliente (salidas tipo Vehiculo → placa → cliente en tabla placas)
        new Promise((resolve, reject) => {
            db.query(`SELECT COALESCE(p.cliente,'Sin cliente') AS cliente, s.placa, SUM(d.importe) AS total, COUNT(*) AS movimientos
                      FROM detalle_salidas_inv d
                      JOIN salidas_inv s ON s.id=d.salida_id
                      LEFT JOIN placas p ON p.placa=s.placa
                      ${where ? where + " AND s.tipo_destino='Vehiculo'" : "WHERE s.tipo_destino='Vehiculo'"}
                      GROUP BY COALESCE(p.cliente,'Sin cliente'), s.placa ORDER BY total DESC`, params, (e, r) => e ? reject(e) : resolve(r));
        })
    ]).then(([porFamilia, porAlmacen, totales, topItems, porCliente]) => {
        res.json({ porFamilia, porAlmacen, totales, topItems, porCliente });
    }).catch(err => res.status(500).json({ error: err.message }));
});

// ============================================================
// ALMACÉN — Valorizado (stock actual × costo referencial)
// ============================================================
router.get('/valorizado', (req, res) => {
    const sql = `
        SELECT
            i.id, i.descripcion, i.familia, i.almacen, i.unidad, i.moneda, i.costo_referencial,
            ROUND(
                COALESCE(i.stock_regularizado, 0)
                + COALESCE((
                    SELECT SUM(de.cantidad)
                    FROM detalle_entradas_inv de
                    JOIN entradas_inv e ON e.id = de.entrada_id
                    WHERE de.inventario_id = i.id
                      AND (i.fecha_regularizacion IS NULL OR e.fecha >= i.fecha_regularizacion)
                ), 0)
                - COALESCE((
                    SELECT SUM(ds.cantidad)
                    FROM detalle_salidas_inv ds
                    JOIN salidas_inv s ON s.id = ds.salida_id
                    WHERE ds.inventario_id = i.id
                      AND (i.fecha_regularizacion IS NULL OR s.fecha >= i.fecha_regularizacion)
                ), 0)
            , 4) AS stock_actual
        FROM inventario i
        WHERE i.activo = 1
        ORDER BY i.familia, i.descripcion
    `;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Calcular valor = stock_actual * costo_referencial por moneda
        let totalPEN = 0, totalUSD = 0;
        const items = rows.map(r => {
            const stock = parseFloat(r.stock_actual || 0);
            const costo = parseFloat(r.costo_referencial || 0);
            const valor = stock * costo;
            if (r.moneda === 'USD') totalUSD += valor;
            else totalPEN += valor;
            return { ...r, stock_actual: stock, valor_total: valor };
        });
        // Resumen por familia
        const porFamilia = {};
        items.forEach(it => {
            const fam = it.familia || 'Sin familia';
            if (!porFamilia[fam]) porFamilia[fam] = { familia: fam, valor_pen: 0, valor_usd: 0, articulos: 0 };
            if (it.moneda === 'USD') porFamilia[fam].valor_usd += it.valor_total;
            else porFamilia[fam].valor_pen += it.valor_total;
            porFamilia[fam].articulos++;
        });
        const famArray = Object.values(porFamilia).sort((a, b) => (b.valor_pen + b.valor_usd * 3.7) - (a.valor_pen + a.valor_usd * 3.7));
        res.json({ items, totalPEN, totalUSD, porFamilia: famArray });
    });
});



    router.use((err, req, res, next) => {
        console.error('Almacen Router Error:', err);
        res.status(500).json({ error: 'Router Error: ' + err.message, stack: err.stack });
    });

    return router;
};
