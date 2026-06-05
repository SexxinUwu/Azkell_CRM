// ============================================================
// 🛡️ MÓDULO SEGURIDAD — Rutas Backend (Unidades + Asistencia)
// Montado como: app.use('/api', seguridadRoutes)
// ============================================================
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB max

module.exports = (db, logAudit) => {

    // ── Cargar helper S3 ──────────────────────────────────────────
    const { uploadToS3, deleteFromS3, s3KeyFromUrl } = require('../utils/s3');

    // ════════════════════════════════════════════════════════════════
    // UNIDADES — Checklist de Camiones
    // ════════════════════════════════════════════════════════════════

    // ── GET /seguridad/unidades — Listar registros ────────────────
    router.get('/seguridad/unidades', (req, res) => {
        let sql = `SELECT r.*,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'tipo', f.tipo, 'url', f.url, 'orden', f.orden))
             FROM seg_unidades_fotos f WHERE f.registro_id = r.id) AS fotos
            FROM seg_unidades_registros r`;
        const params = [];
        if (req.query.fecha) {
            sql += ' WHERE r.salida_fecha = ?';
            params.push(req.query.fecha);
        }
        sql += ' ORDER BY r.created_at DESC';
        db.query(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            // Parse fotos JSON
            rows.forEach(r => {
                try { r.fotos = r.fotos ? JSON.parse(r.fotos) : []; } catch(e) { r.fotos = []; }
                // Parse checklist JSONs
                try { r.salida_template_json  = r.salida_template_json  ? JSON.parse(r.salida_template_json)  : null; } catch(e) {}
                try { r.salida_checklist_json  = r.salida_checklist_json  ? JSON.parse(r.salida_checklist_json)  : null; } catch(e) {}
                try { r.retorno_template_json = r.retorno_template_json ? JSON.parse(r.retorno_template_json) : null; } catch(e) {}
                try { r.retorno_checklist_json = r.retorno_checklist_json ? JSON.parse(r.retorno_checklist_json) : null; } catch(e) {}
            });
            res.json(rows);
        });
    });

    // ── POST /seguridad/unidades — Crear registro de salida ───────
    router.post('/seguridad/unidades', (req, res) => {
        const { placa_tracto, placa_carreta, conductor, destino,
                salida_fecha, salida_hora, salida_km,
                salida_template_json, salida_checklist_json, salida_has_alert } = req.body;

        if (!placa_tracto || !conductor) {
            return res.status(400).json({ error: 'placa_tracto y conductor son requeridos' });
        }

        // Generar ID secuencial: CHECK-YYYY-NNNN
        const year = new Date().getFullYear();
        const prefix = `CHECK-${year}-`;
        db.query(
            `SELECT id FROM seg_unidades_registros WHERE id LIKE ? ORDER BY id DESC LIMIT 1`,
            [prefix + '%'],
            (errSeq, seqRows) => {
                let nextNum = 1;
                if (!errSeq && seqRows && seqRows.length) {
                    // Extraer el número del último ID (ej: CHECK-2026-0003 → 3)
                    const lastId = seqRows[0].id;
                    const parts = lastId.split('-');
                    const lastNum = parseInt(parts[parts.length - 1], 10);
                    if (!isNaN(lastNum)) nextNum = lastNum + 1;
                }
                const regId = prefix + String(nextNum).padStart(4, '0');

                const templateStr  = typeof salida_template_json  === 'string' ? salida_template_json  : JSON.stringify(salida_template_json  || null);
                const checklistStr = typeof salida_checklist_json  === 'string' ? salida_checklist_json  : JSON.stringify(salida_checklist_json  || null);

                db.query(
                    `INSERT INTO seg_unidades_registros
                     (id, placa_tracto, placa_carreta, conductor, destino, estado,
                      salida_fecha, salida_hora, salida_km,
                      salida_template_json, salida_checklist_json, salida_has_alert, creado_por)
                     VALUES (?, ?, ?, ?, ?, 'en_ruta', ?, ?, ?, ?, ?, ?, ?)`,
                    [regId, placa_tracto.toUpperCase(), (placa_carreta || '').toUpperCase() || null,
                     conductor, destino || null,
                     salida_fecha || null, salida_hora || null, salida_km || null,
                     templateStr, checklistStr, salida_has_alert ? 1 : 0,
                     (req.user && req.user.nombre) || ''],
                    (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        if (typeof logAudit === 'function') logAudit((req.user && req.user.nombre) || '', 'seguridad', 'CREÓ', 'Registro unidad ' + regId);
                        res.json({ ok: true, id: regId });
                    }
                );
            }
        );
    });

    // ── PUT /seguridad/unidades/:id — Actualizar (registrar retorno) ──
    router.put('/seguridad/unidades/:id', (req, res) => {
        const { retorno_fecha, retorno_hora, retorno_km,
                retorno_template_json, retorno_checklist_json, retorno_has_alert,
                estado } = req.body;

        const sets = [];
        const params = [];

        if (retorno_fecha !== undefined)           { sets.push('retorno_fecha = ?');           params.push(retorno_fecha); }
        if (retorno_hora !== undefined)            { sets.push('retorno_hora = ?');            params.push(retorno_hora); }
        if (retorno_km !== undefined)              { sets.push('retorno_km = ?');              params.push(retorno_km); }
        if (retorno_template_json !== undefined)   {
            sets.push('retorno_template_json = ?');
            params.push(typeof retorno_template_json === 'string' ? retorno_template_json : JSON.stringify(retorno_template_json));
        }
        if (retorno_checklist_json !== undefined)  {
            sets.push('retorno_checklist_json = ?');
            params.push(typeof retorno_checklist_json === 'string' ? retorno_checklist_json : JSON.stringify(retorno_checklist_json));
        }
        if (retorno_has_alert !== undefined)       { sets.push('retorno_has_alert = ?');       params.push(retorno_has_alert ? 1 : 0); }
        if (estado !== undefined)                  { sets.push('estado = ?');                  params.push(estado); }

        if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });

        params.push(req.params.id);
        db.query('UPDATE seg_unidades_registros SET ' + sets.join(', ') + ' WHERE id = ?', params, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
            if (typeof logAudit === 'function') logAudit((req.user && req.user.nombre) || '', 'seguridad', 'MODIFICÓ', 'Unidad ' + req.params.id);
            res.json({ ok: true });
        });
    });

    // ── DELETE /seguridad/unidades/:id — Eliminar registro + fotos S3 ──
    router.delete('/seguridad/unidades/:id', (req, res) => {
        // Primero obtener fotos para borrarlas de S3
        db.query('SELECT url FROM seg_unidades_fotos WHERE registro_id = ?', [req.params.id], async (err, fotos) => {
            if (!err && fotos && fotos.length) {
                for (const f of fotos) {
                    const key = s3KeyFromUrl(f.url);
                    if (key) await deleteFromS3(key);
                }
            }
            db.query('DELETE FROM seg_unidades_fotos WHERE registro_id = ?', [req.params.id], () => {
                db.query('DELETE FROM seg_unidades_registros WHERE id = ?', [req.params.id], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (typeof logAudit === 'function') logAudit((req.user && req.user.nombre) || '', 'seguridad', 'ELIMINÓ', 'Unidad ' + req.params.id);
                    res.json({ ok: true });
                });
            });
        });
    });

    // ── POST /seguridad/unidades/:id/fotos — Subir foto a S3 ──────
    router.post('/seguridad/unidades/:id/fotos', (req, res) => {
        upload.single('foto')(req, res, async (err) => {
            if (err) {
                console.error('Error de multer:', err.message);
                return res.status(400).json({ error: 'Error al subir imagen (posiblemente muy grande): ' + err.message });
            }
            try {
                if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });

                const registroId = req.params.id;
                const tipo       = req.body.tipo || 'salida'; // 'salida' o 'retorno'
                const ext        = (req.file.originalname || '').split('.').pop() || 'jpg';
                const timestamp  = Date.now();
                const s3Key      = `seguridad/unidades/${registroId}/${tipo}_${timestamp}.${ext}`;

                const url = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);

                // Obtener siguiente orden
                db.query(
                    'SELECT COALESCE(MAX(orden), 0) + 1 AS nextOrden FROM seg_unidades_fotos WHERE registro_id = ? AND tipo = ?',
                    [registroId, tipo],
                    (errDb, rows) => {
                        const orden = (rows && rows[0]) ? rows[0].nextOrden : 1;
                        db.query(
                            'INSERT INTO seg_unidades_fotos (registro_id, tipo, url, orden) VALUES (?, ?, ?, ?)',
                            [registroId, tipo, url, orden],
                            (err2, result) => {
                                if (err2) return res.status(500).json({ error: err2.message });
                                res.json({ ok: true, id: result.insertId, url, orden });
                            }
                        );
                    }
                );
            } catch (e) {
                console.error('Error subiendo foto a S3:', e);
                res.status(500).json({ error: 'Error al subir imagen: ' + e.message });
            }
        });
    });

    // ── DELETE /seguridad/unidades/:id/fotos/:fotoId — Eliminar foto ──
    router.delete('/seguridad/unidades/:id/fotos/:fotoId', (req, res) => {
        db.query('SELECT url FROM seg_unidades_fotos WHERE id = ? AND registro_id = ?',
            [req.params.fotoId, req.params.id], async (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!rows.length) return res.status(404).json({ error: 'Foto no encontrada' });

                const key = s3KeyFromUrl(rows[0].url);
                if (key) await deleteFromS3(key);

                db.query('DELETE FROM seg_unidades_fotos WHERE id = ?', [req.params.fotoId], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true });
                });
            }
        );
    });

    // ════════════════════════════════════════════════════════════════
    // TEMPLATE — Plantilla global del checklist
    // ════════════════════════════════════════════════════════════════

    // ── GET /seguridad/template — Obtener plantilla ───────────────
    router.get('/seguridad/template', (req, res) => {
        db.query('SELECT * FROM seg_checklist_templates WHERE activo = 1 ORDER BY orden ASC', (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            // Convertir a formato que espera el frontend: [{id, titulo, items:[{id,label}]}]
            const template = rows.map(r => {
                let items = [];
                try { items = typeof r.items_json === 'string' ? JSON.parse(r.items_json) : (r.items_json || []); } catch(e) {}
                return { id: r.template_id, titulo: r.titulo, items };
            });
            res.json(template);
        });
    });

    // ── PUT /seguridad/template — Guardar plantilla completa ──────
    router.put('/seguridad/template', (req, res) => {
        const { template } = req.body; // Array de {id, titulo, items:[{id,label}]}
        if (!Array.isArray(template)) return res.status(400).json({ error: 'template debe ser un array' });

        // Estrategia: desactivar todo y re-insertar (upsert)
        db.query('UPDATE seg_checklist_templates SET activo = 0', (err) => {
            if (err) return res.status(500).json({ error: err.message });

            if (!template.length) return res.json({ ok: true });

            const values = template.map((cat, i) => [
                cat.id,
                cat.titulo,
                JSON.stringify(cat.items || []),
                i + 1,
                1 // activo
            ]);

            db.query(
                `INSERT INTO seg_checklist_templates (template_id, titulo, items_json, orden, activo)
                 VALUES ?
                 ON DUPLICATE KEY UPDATE titulo = VALUES(titulo), items_json = VALUES(items_json), orden = VALUES(orden), activo = 1`,
                [values],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (typeof logAudit === 'function') logAudit((req.user && req.user.nombre) || '', 'seguridad', 'MODIFICÓ', 'Template checklist');
                    res.json({ ok: true });
                }
            );
        });
    });

    // ── GET /seguridad/limpiar-plantillas — Borrar plantillas por defecto ──
    router.get('/seguridad/limpiar-plantillas', (req, res) => {
        db.query('DELETE FROM seg_checklist_templates', (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, message: 'Plantillas borradas. Ahora el checklist estará vacío por defecto.' });
        });
    });

    // ── GET /test-s3 — Diagnóstico de conexión S3 ──
    router.get('/test-s3', async (req, res) => {
        const bucketName = process.env.AWS_BUCKET_NAME || '';
        const diagnostic = {
            AWS_REGION: process.env.AWS_REGION || '(not set)',
            AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.substring(0, 8) + '...' : '(not set)',
            AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? 'SET (' + process.env.AWS_SECRET_ACCESS_KEY.length + ' chars)' : '(not set)',
            AWS_BUCKET_NAME_raw: bucketName,
            AWS_BUCKET_NAME_length: bucketName.length,
            AWS_BUCKET_NAME_trimmed: bucketName.trim(),
            AWS_BUCKET_NAME_charCodes: Array.from(bucketName).map(c => c.charCodeAt(0)).join(',')
        };
        try {
            const cleanBucket = bucketName.trim();
            const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
            const testS3 = new S3Client({
                region: (process.env.AWS_REGION || 'us-east-2').trim(),
                credentials: {
                    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').trim(),
                    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').trim()
                }
            });
            const buffer = Buffer.from('Testing S3 connection from Railway', 'utf-8');
            const key = `test/test_${Date.now()}.txt`;
            await testS3.send(new PutObjectCommand({
                Bucket: cleanBucket,
                Key: key,
                Body: buffer,
                ContentType: 'text/plain'
            }));
            const url = `https://${cleanBucket}.s3.${(process.env.AWS_REGION || 'us-east-2').trim()}.amazonaws.com/${key}`;
            res.json({ ok: true, url, message: 'Upload exitoso a S3', diagnostic });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message, diagnostic, hint: 'Revisa las variables de entorno de AWS en Railway' });
        }
    });

    // ── GET /seguridad/recursos — Autocomplete Placas y Directorio ──
    router.get('/seguridad/recursos', (req, res) => {
        const recursos = { placas: [], conductores: [] };
        
        // Consultar Placas
        db.query('SELECT placa FROM placas ORDER BY placa ASC', (errP, rowsP) => {
            if (!errP && rowsP) recursos.placas = rowsP.map(r => r.placa);
            
            // Consultar Conductores (Directorio)
            db.query('SELECT nombre FROM conductores ORDER BY nombre ASC', (errD, rowsD) => {
                if (!errD && rowsD) recursos.conductores = rowsD.map(r => r.nombre);
                
                res.json(recursos);
            });
        });
    });

    // ════════════════════════════════════════════════════════════════
    // ASISTENCIA — Control de Personal QR
    // ════════════════════════════════════════════════════════════════

    // ── GET /seguridad/asistencia — Listar registros ──────────────
    router.get('/seguridad/asistencia', (req, res) => {
        let sql = 'SELECT * FROM seg_asistencia';
        const params = [];
        if (req.query.fecha) {
            sql += ' WHERE fecha_ingreso = ?';
            params.push(req.query.fecha);
        }
        sql += ' ORDER BY id DESC';
        db.query(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    // ── POST /seguridad/asistencia — Registrar ingreso o salida ───
    // Auto-detecta: si hay registro abierto hoy → marca salida, si no → crea ingreso
    router.post('/seguridad/asistencia', (req, res) => {
        const { dni, nombre, cargo } = req.body;
        if (!dni) return res.status(400).json({ error: 'DNI es requerido' });

        const now  = new Date();
        const dd   = String(now.getDate()).padStart(2, '0');
        const mm   = String(now.getMonth() + 1).padStart(2, '0');
        const yy   = String(now.getFullYear()).slice(-2);
        const fechaHoy  = dd + '-' + mm + '-' + yy;
        const horaFull  = String(now.getHours()).padStart(2, '0') + ':' +
                          String(now.getMinutes()).padStart(2, '0') + ':' +
                          String(now.getSeconds()).padStart(2, '0');

        // Buscar registro abierto hoy
        db.query(
            'SELECT id, nombre, cargo FROM seg_asistencia WHERE dni = ? AND fecha_ingreso = ? AND hora_salida IS NULL LIMIT 1',
            [dni.trim(), fechaHoy],
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });

                if (rows && rows.length) {
                    // SALIDA
                    const openId = rows[0].id;
                    db.query(
                        'UPDATE seg_asistencia SET fecha_salida = ?, hora_salida = ? WHERE id = ?',
                        [fechaHoy, horaFull, openId],
                        (err2) => {
                            if (err2) return res.status(500).json({ error: err2.message });
                            res.json({
                                ok: true, accion: 'salida',
                                nombre: rows[0].nombre, dni: dni.trim(), cargo: rows[0].cargo || '',
                                time: horaFull
                            });
                        }
                    );
                } else {
                    // INGRESO — buscar nombre previo si no se proporcionó
                    const resolverNombre = (cb) => {
                        if (nombre) return cb(nombre.toUpperCase(), cargo || '');
                        db.query(
                            'SELECT nombre, cargo FROM seg_asistencia WHERE dni = ? ORDER BY id DESC LIMIT 1',
                            [dni.trim()],
                            (e, prev) => {
                                if (!e && prev && prev.length) return cb(prev[0].nombre, prev[0].cargo || '');
                                cb('EMPLEADO ' + dni.trim(), '');
                            }
                        );
                    };

                    resolverNombre((nombreFinal, cargoFinal) => {
                        db.query(
                            `INSERT INTO seg_asistencia (dni, nombre, cargo, fecha_ingreso, hora_ingreso, registrado_por)
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [dni.trim(), nombreFinal, cargoFinal || cargo || '',
                             fechaHoy, horaFull, (req.user && req.user.nombre) || ''],
                            (err3, result) => {
                                if (err3) return res.status(500).json({ error: err3.message });
                                res.json({
                                    ok: true, accion: 'ingreso', id: result.insertId,
                                    nombre: nombreFinal, dni: dni.trim(), cargo: cargoFinal,
                                    time: horaFull
                                });
                            }
                        );
                    });
                }
            }
        );
    });

    // ── GET /seguridad/asistencia/export — Exportar por fecha ─────
    router.get('/seguridad/asistencia/export', (req, res) => {
        const fecha = req.query.fecha;
        if (!fecha) return res.status(400).json({ error: 'Parámetro fecha requerido' });

        db.query(
            'SELECT dni, nombre, cargo, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida FROM seg_asistencia WHERE fecha_ingreso = ? ORDER BY id DESC',
            [fecha],
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!rows.length) return res.status(404).json({ error: 'No hay registros para esta fecha' });

                // CSV
                const headers = 'DNI,Nombre,Cargo,Fecha Ingreso,Hora Ingreso,Fecha Salida,Hora Salida\n';
                const csv = rows.map(r =>
                    `="${r.dni}","${r.nombre}","${r.cargo || ''}",${r.fecha_ingreso},${r.hora_ingreso},${r.fecha_salida || ''},${r.hora_salida || ''}`
                ).join('\n');

                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename=asistencia_' + fecha + '.csv');
                res.send(headers + csv);
            }
        );
    });

    return router;
};
