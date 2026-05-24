const express = require('express');
const router = express.Router();

module.exports = (db, _multerInv) => {

// ── Helper: sumar total_pen de detalle (convierte USD con tipo_cambio) ───
function _calcularTotalPen(detalles, tc) {
    return detalles.reduce((acc, d) => {
        const imp = parseFloat(d.importe) || 0;
        return acc + (d.moneda === 'USD' ? imp * parseFloat(tc || 1) : imp);
    }, 0);
}

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
    if (!entries.length) return res.json({ ok: true });
    const vals = entries.map(([k, v]) => [k, String(v)]);
    db.query('INSERT INTO configuracion_almacen (clave,valor) VALUES ? ON DUPLICATE KEY UPDATE valor=VALUES(valor)',
        [vals], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
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
                res.json({ ok: true, id });
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
                res.json({ ok: true });
            });
        });
});
router.delete('/proveedores/:id', (req, res) => {
    db.query('DELETE FROM proveedores_inv WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
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
        res.json({ ok: true, eliminados: result.affectedRows });
    });
});

// ============================================================
// ALMACÉN — Inventario (Catálogo)
// ============================================================
const _stockSQL = `
  SELECT i.*,
    ROUND(
      COALESCE(i.stock_regularizado,0)
      + COALESCE((SELECT SUM(d.cantidad) FROM detalle_entradas_inv d
                  JOIN entradas_inv e ON e.id=d.entrada_id
                  WHERE d.inventario_id=i.id
                    AND (i.fecha_regularizacion IS NULL OR DATE(e.created_at) >= DATE(i.fecha_regularizacion))),0)
      - COALESCE((SELECT SUM(d.cantidad) FROM detalle_salidas_inv d
                  JOIN salidas_inv s ON s.id=d.salida_id
                  WHERE (d.inventario_id=i.id OR (d.inventario_id IS NULL AND LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id))
                    AND s.estado = 'Despachado'
                    AND (i.fecha_regularizacion IS NULL OR DATE(s.created_at) >= DATE(i.fecha_regularizacion))),0)
    , 4) AS stock_actual
  FROM inventario i
  WHERE i.activo=1
  ORDER BY i.id`;

app.get('/api/notificaciones/resumen', (req, res) => {
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
    db.query(_stockSQL, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
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
            tipo_cambio,
            proveedor_id, marca, observaciones,
            codigo_item, marca_unidad, sistema, sub_sistema, tipo, sub_tipo,
            ubicacion, anaquel, stock_min, stock_max, estado_art, codigo_barras } = req.body;

    const costoRef   = parseFloat(costo_referencial) || 0;
    const tc         = parseFloat(tipo_cambio) || null;
    const monedaVal  = moneda || 'PEN';
    const costoSoles = (monedaVal === 'USD' && tc) ? costoRef * tc : costoRef;

    // Generar descripcion concatenada desde los campos individuales
    let marcasArr = [];
    try { marcasArr = JSON.parse(marca_unidad || '[]'); } catch(e) { marcasArr = marca_unidad ? [marca_unidad] : []; }
    let descGenerada = (articulo || '').trim();
    if (codigo_articulo) descGenerada += ' ' + String(codigo_articulo).trim();
    if (marcasArr.length) descGenerada += ' - ' + marcasArr.join(', ');
    if (marca) descGenerada += ' / ' + String(marca).trim();
    const descFinal = descGenerada || descripcion || 'Sin nombre';

    _generarCodigoAlmacen('INV', null, (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query(`INSERT INTO inventario
            (id,descripcion,articulo,codigo_articulo,familia,almacen,unidad,moneda,costo_referencial,costo_soles,tipo_cambio,
             proveedor_id,marca,observaciones,
             codigo_item,marca_unidad,sistema,sub_sistema,tipo,sub_tipo,
             ubicacion,anaquel,stock_min,stock_max,estado_art,codigo_barras)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, descFinal, articulo||null, codigo_articulo||null, familia||null, almacen||null, unidad||null, monedaVal,
             costoRef, costoSoles, tc,
             proveedor_id||null, marca||null, observaciones||null,
             codigo_item||null, marca_unidad||null, sistema||null, sub_sistema||null,
             tipo||null, sub_tipo||null, ubicacion||null,
             anaquel!=null?parseFloat(anaquel):null, parseFloat(stock_min)||0, parseFloat(stock_max)||0,
             estado_art||'Activo', codigo_barras||null],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ ok: true, id });
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
            res.json({ ok: true });
        });
});
router.delete('/inventario/:id', (req, res) => {
    db.query('UPDATE inventario SET activo=0 WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

router.post('/inventario/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'Sin IDs' });
    const placeholders = ids.map(() => '?').join(',');
    db.query(`UPDATE inventario SET activo=0 WHERE id IN (${placeholders})`, ids, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, eliminados: ids.length });
    });
});

// Upload imagen de artículo → Cloudinary
router.post('/inventario/:id/imagen', _multerInv.single('imagen'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
    const publicId = 'inventario/' + req.params.id;
    // Eliminar imagen anterior si existía (ignorar error)
    cloudinary.uploader.destroy(publicId, { invalidate: true }, () => {});
    // Subir desde buffer en memoria
    const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: publicId, overwrite: true, invalidate: true },
        (error, result) => {
            if (error) return res.status(500).json({ error: error.message });
            const url = result.secure_url;
            db.query('UPDATE inventario SET imagen_url=? WHERE id=?', [url, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true, imagen_url: url });
            });
        }
    );
    uploadStream.end(req.file.buffer);
});

// Eliminar imagen de artículo → Cloudinary
router.delete('/inventario/:id/imagen', (req, res) => {
    const publicId = 'inventario/' + req.params.id;
    cloudinary.uploader.destroy(publicId, { invalidate: true }, (error) => {
        if (error) console.error('Cloudinary destroy error:', error.message);
        db.query('UPDATE inventario SET imagen_url=NULL WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    });
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
            res.json({ ok: true, fecha_regularizacion: fechaHoy, stock_anterior: stockAnt, stock_nuevo: stockVal });
        });
    });
});

// Import masivo desde Excel
router.post('/inventario/importar', async (req, res) => {
    const { filas } = req.body;
    if (!filas || !filas.length) return res.json({ ok: true, insertados: 0 });
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
    res.json({ ok: true, insertados, errores: errors });
});

// ── Clientes de placas (para Empresa en conductores) ──────────────────────
router.get('/clientes-placas', (req, res) => {
    db.query(`SELECT DISTINCT cliente FROM placas WHERE cliente IS NOT NULL AND cliente <> '' ORDER BY cliente`, (err, rows) => {
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
            res.json({ ok: true, id: result.insertId });
        });
});

router.put('/unidades/:id', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    db.query('UPDATE almacen_unidades SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

router.delete('/unidades/:id', (req, res) => {
    db.query('DELETE FROM almacen_unidades WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
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
            res.json({ ok: true, id: result.insertId });
        });
});

router.put('/sistemas/:id', (req, res) => {
    const { nombre, sub_sistemas, activo, orden } = req.body;
    db.query('UPDATE almacen_sistemas SET nombre=?, sub_sistemas=?, activo=?, orden=? WHERE id=?',
        [nombre.toUpperCase().trim(), JSON.stringify(sub_sistemas || []), activo != null ? activo : 1, orden || 0, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

router.delete('/sistemas/:id', (req, res) => {
    db.query('DELETE FROM almacen_sistemas WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
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
            res.json({ ok: true, id: result.insertId });
        });
});

router.put('/familias/:id', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    db.query('UPDATE almacen_familias SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

router.delete('/familias/:id', (req, res) => {
    db.query('DELETE FROM almacen_familias WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
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
        res.json({ ok: true, id: r.insertId });
    });
});
router.put('/marcas/:id', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    db.query('UPDATE almacen_marcas SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre.toUpperCase(), descripcion || null, activo ?? 1, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});
router.delete('/marcas/:id', (req, res) => {
    db.query('DELETE FROM almacen_marcas WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// ============================================================
// ALMACÉN — Entradas
// ============================================================
router.get('/entradas', (req, res) => {
    db.query(`SELECT e.*, GROUP_CONCAT(CONCAT(d.descripcion,'|',d.cantidad,'|',d.costo_unitario,'|',d.moneda,'|',d.inventario_id) SEPARATOR ';;') AS items_raw
              FROM entradas_inv e
              LEFT JOIN detalle_entradas_inv d ON d.entrada_id=e.id
              GROUP BY e.id ORDER BY e.fecha DESC, e.id DESC LIMIT 300`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => {
            r.items = r.items_raw ? r.items_raw.split(';;').map(s => {
                const [desc, cant, cu, mon, invId] = s.split('|');
                return { descripcion: desc, cantidad: parseFloat(cant), costo_unitario: parseFloat(cu), moneda: mon, inventario_id: invId };
            }) : [];
            delete r.items_raw;
        });
        res.json(rows);
    });
});
router.post('/entradas', (req, res) => {
    const { fecha, proveedor_id, proveedor_nombre, documento_referencia, moneda, tipo_cambio, tipo_igv, observaciones, creado_por, items } = req.body;
    const anio = new Date(fecha || Date.now()).getFullYear();
    const tc = parseFloat(tipo_cambio) || 1;
    _generarCodigoAlmacen('ENT', anio, (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        const total_pen = _calcularTotalPen(items || [], tc);
        db.query('INSERT INTO entradas_inv (id,fecha,proveedor_id,proveedor_nombre,documento_referencia,moneda,tipo_cambio,total_pen,observaciones,tipo_igv,creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [id, fecha||new Date().toISOString().split('T')[0], proveedor_id||null, proveedor_nombre||null,
             documento_referencia||null, moneda||'PEN', tc||null, total_pen, observaciones||null, tipo_igv||'sin_igv', creado_por||null],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (!items || !items.length) return res.json({ ok: true, id });
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
                        if (!toUpdate.length) return res.json({ ok: true, id });
                        let done = 0;
                        toUpdate.forEach(d => {
                            const invId      = d.inventario_id || mapaInvEnt[d.descripcion];
                            const isUSD      = d.moneda === 'USD' || moneda === 'USD';
                            const costoOrig  = parseFloat(d.costo_unitario);
                            const costoSoles = isUSD ? costoOrig * tc : costoOrig;
                            db.query(
                                'UPDATE inventario SET costo_referencial=?, costo_soles=?, tipo_cambio=? WHERE id=? AND activo=1',
                                [costoOrig, costoSoles, isUSD ? tc : null, invId],
                                () => { if (++done === toUpdate.length) res.json({ ok: true, id }); }
                            );
                        });
                    });
                });
            });
    });
});
router.delete('/entradas/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM detalle_entradas_inv WHERE entrada_id=?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('DELETE FROM entradas_inv WHERE id=?', [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ ok: true });
        });
    });
});

// ============================================================
// ALMACÉN — Salidas
// ============================================================
router.get('/salidas', (req, res) => {
    const SEP_FIELD = '\x1F', SEP_ROW = '\x1E';
    db.query(`SELECT s.*,
              GROUP_CONCAT(CONCAT_WS('\x1F',
                COALESCE(d.inventario_id,''),
                COALESCE(d.descripcion,''),
                COALESCE(d.cantidad,0),
                COALESCE(d.costo_unitario,0),
                COALESCE(d.moneda,'PEN'),
                COALESCE(d.importe, d.cantidad*d.costo_unitario, 0)
              ) SEPARATOR '\x1E') AS items_raw
              FROM salidas_inv s
              LEFT JOIN detalle_salidas_inv d ON d.salida_id=s.id
              GROUP BY s.id ORDER BY s.fecha DESC, s.id DESC LIMIT 300`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => {
            r.items = r.items_raw ? r.items_raw.split(SEP_ROW).map(seg => {
                const [invId, desc, cant, cu, mon, imp] = seg.split(SEP_FIELD);
                return { inventario_id: invId||null, descripcion: desc||null, cantidad: parseFloat(cant)||0, costo_unitario: parseFloat(cu)||0, moneda: mon||'PEN', importe: parseFloat(imp)||0 };
            }).filter(it => it.descripcion || it.inventario_id) : [];
            delete r.items_raw;
        });
        res.json(rows);
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
            if (estadoOT !== 'En Proceso' && estadoOT !== 'Pausada') {
                const msg = estadoOT === 'Finalizado'
                    ? 'La OT ' + ticket_ot + ' ya está cerrada. No se pueden registrar salidas.'
                    : 'La OT ' + ticket_ot + ' no ha sido iniciada. Debes iniciar la OT antes de registrar salidas.';
                return res.status(400).json({ error: msg });
            }
            crearSalida();
        });
    } else {
        crearSalida();
    }

    function crearSalida() {
    const anio = new Date(fecha || Date.now()).getFullYear();
    const tc = parseFloat(tipo_cambio) || 1;
    _generarCodigoAlmacen('SAL', anio, (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        const total_pen = _calcularTotalPen(items || [], tc);
        db.query('INSERT INTO salidas_inv (id,fecha,tipo_destino,placa,responsable,responsable_id,moneda,tipo_cambio,total_pen,observaciones,creado_por,ticket_ot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [id, fecha||new Date().toISOString().split('T')[0], tipo_destino, placa||null, responsable||null,
             responsable_id||null, moneda||'PEN', tc||null, total_pen, observaciones||null, creado_por||null, ticket_ot||null],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (!items || !items.length) return res.json({ ok: true, id });
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
                    res.json({ ok: true, id });
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
                res.json({ ok: true });
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
            res.json({ ok: true });
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
            res.json({ ok: true });
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
            WHERE d.inventario_id=?
            UNION ALL
            SELECT 'Salida' AS tipo, s.fecha, s.created_at, s.id AS doc_id, CONCAT(s.tipo_destino,' / ',COALESCE(s.placa,s.responsable,'—')) AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe
            FROM detalle_salidas_inv d JOIN salidas_inv s ON s.id=d.salida_id
            WHERE d.inventario_id=? AND (s.estado IS NULL OR s.estado = 'Despachado')
            ORDER BY fecha ASC, created_at ASC, doc_id ASC
        `, [id, id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            // Saldo inicial = stock_regularizado (base post-regularización)
            let saldo = base;
            rows.forEach(r => {
                if (r.tipo === 'Entrada') saldo += parseFloat(r.cantidad);
                else saldo -= parseFloat(r.cantidad);
                r.saldo = parseFloat(saldo.toFixed(4));
            });
            res.json({ stock_base: base, fecha_regularizacion: regDate, movimientos: rows });
        });
    });
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



    return router;
};
