// ============================================================
// 🛡️ MÓDULO SEGURIDAD — Rutas Backend (Unidades + Asistencia)
// Montado como: app.use('/api', seguridadRoutes)
// ============================================================
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB max

module.exports = (db, logAudit) => {

    function getDb(req) {
        return (req && req.db) ? req.db : db;
    }

    // ── Cargar helper S3 ──────────────────────────────────────────
    const { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrl, getPresignedUploadUrl } = require('../utils/s3');

    // ════════════════════════════════════════════════════════════════
    // UNIDADES — Checklist de Camiones
    // ════════════════════════════════════════════════════════════════

    // ── GET /seguridad/unidades/stats — Estadísticas resumidas (1ms) ──
    router.get('/seguridad/unidades/stats', (req, res) => {
        const tdb = getDb(req);
        const sql = `
            SELECT 
                COUNT(*) as total,
                COALESCE(SUM(CASE WHEN estado = 'en_ruta' THEN 1 ELSE 0 END), 0) as en_ruta,
                COALESCE(SUM(CASE WHEN estado = 'completado' THEN 1 ELSE 0 END), 0) as completados,
                COALESCE(SUM(CASE WHEN salida_has_alert = 1 OR retorno_has_alert = 1 THEN 1 ELSE 0 END), 0) as alertas
            FROM seg_unidades_registros
        `;
        db.query(sql, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const s = (rows && rows[0]) || { total: 0, en_ruta: 0, completados: 0, alertas: 0 };
            res.json({
                total: Number(s.total) || 0,
                en_ruta: Number(s.en_ruta) || 0,
                completados: Number(s.completados) || 0,
                alertas: Number(s.alertas) || 0
            });
        });
    });

    // ── GET /seguridad/unidades — Listar registros ────────────────
    router.get('/seguridad/unidades', async (req, res) => {
        let sql = `SELECT r.* FROM seg_unidades_registros r`;
        const params = [];
        const wheres = [];

        if (req.query.estado) {
            wheres.push('r.estado = ?');
            params.push(req.query.estado);
        }
        if (req.query.fecha) {
            wheres.push('r.salida_fecha = ?');
            params.push(req.query.fecha);
        }
        if (wheres.length) {
            sql += ' WHERE ' + wheres.join(' AND ');
        }
        sql += ' ORDER BY r.created_at DESC';
        if (req.query.limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(req.query.limit, 10));
        }
        
        db.query(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (!rows.length) return res.json([]);
            
            const ids = rows.map(r => r.id);
            db.query('SELECT id, registro_id, tipo, url, orden FROM seg_unidades_fotos WHERE registro_id IN (?) ORDER BY orden ASC', [ids], (err2, fotosRows) => {
                if (err2) return res.status(500).json({ error: err2.message });
                
                const fotosByRecord = {};
                for (const f of (fotosRows || [])) {
                    if (!fotosByRecord[f.registro_id]) fotosByRecord[f.registro_id] = [];
                    fotosByRecord[f.registro_id].push(f);
                }

                for (const r of rows) {
                    r.fotos = fotosByRecord[r.id] || [];
                    try { r.salida_template_json  = r.salida_template_json  ? JSON.parse(r.salida_template_json)  : null; } catch(e) {}
                    try { r.salida_checklist_json  = r.salida_checklist_json  ? JSON.parse(r.salida_checklist_json)  : null; } catch(e) {}
                    try { r.retorno_template_json = r.retorno_template_json ? JSON.parse(r.retorno_template_json) : null; } catch(e) {}
                    try { r.retorno_checklist_json = r.retorno_checklist_json ? JSON.parse(r.retorno_checklist_json) : null; } catch(e) {}
                }
                res.json(rows);
            });
        });
    });

    // ── POST /seguridad/unidades — Crear registro de salida ───────
    router.post('/seguridad/unidades', (req, res) => {
        const tdb = getDb(req);
        const { placa_tracto, placa_carreta, conductor, destino, orden_viaje, tipo_salida,
                salida_fecha, salida_hora, salida_km,
                salida_template_json, salida_checklist_json, salida_has_alert,
                salida_observaciones,
                firma_salida_conductor, firma_salida_vigilancia } = req.body;

        if (!placa_tracto || !conductor) {
            return res.status(400).json({ error: 'placa_tracto y conductor son requeridos' });
        }

        const cleanT = (placa_tracto || '').trim().toUpperCase();
        const cleanC = (placa_carreta || '').trim().toUpperCase();

        // 1. Validar que la unidad no se encuentre actualmente EN RUTA
        let checkSql = "SELECT id, placa_tracto, placa_carreta, conductor, salida_fecha, salida_hora FROM seg_unidades_registros WHERE estado = 'en_ruta' AND (placa_tracto = ?";
        const checkParams = [cleanT];
        if (cleanC) {
            checkSql += " OR placa_carreta = ? OR placa_tracto = ?";
            checkParams.push(cleanC, cleanC);
        }
        checkSql += ") LIMIT 1";

        tdb.query(checkSql, checkParams, (errDup, dupRows) => {
            if (errDup) return res.status(500).json({ error: errDup.message });
            if (dupRows && dupRows.length > 0) {
                const dup = dupRows[0];
                return res.status(400).json({
                    error: `La unidad ya se encuentra EN RUTA con un viaje pendiente de retorno (Folio: ${dup.id}, Conductor: ${dup.conductor || 'N/A'}, Salida: ${dup.salida_fecha || ''} ${dup.salida_hora || ''}). Debe registrarse su retorno antes de iniciar una nueva salida.`
                });
            }

            // 2. Generar ID secuencial: CHECK-YYYY-NNNN
            const year = new Date().getFullYear();
            const prefix = `CHECK-${year}-`;
            tdb.query(
                `SELECT id FROM seg_unidades_registros WHERE id LIKE ? ORDER BY id DESC LIMIT 1`,
                [prefix + '%'],
                (errSeq, seqRows) => {
                    let nextNum = 1;
                    if (!errSeq && seqRows && seqRows.length) {
                        const lastId = seqRows[0].id;
                        const parts = lastId.split('-');
                        const lastNum = parseInt(parts[parts.length - 1], 10);
                        if (!isNaN(lastNum)) nextNum = lastNum + 1;
                    }
                    const regId = prefix + String(nextNum).padStart(4, '0');

                    const templateStr  = typeof salida_template_json  === 'string' ? salida_template_json  : JSON.stringify(salida_template_json  || null);
                    const checklistStr = typeof salida_checklist_json  === 'string' ? salida_checklist_json  : JSON.stringify(salida_checklist_json  || null);

                    const userSalida = (req.user && req.user.nombre) || (req.user && req.user.email) || req.body.creado_por || 'Seguridad';

                    tdb.query(
                        `INSERT INTO seg_unidades_registros
                         (id, placa_tracto, placa_carreta, conductor, destino, tipo_salida, orden_viaje, estado,
                          salida_fecha, salida_hora, salida_km,
                          salida_template_json, salida_checklist_json, salida_has_alert,
                          salida_observaciones,
                          firma_salida_conductor, firma_salida_vigilancia, creado_por)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 'en_ruta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [regId, cleanT, cleanC || null,
                         conductor, destino || null, tipo_salida || 'RUTA', orden_viaje || null,
                         salida_fecha || null, salida_hora || null, salida_km || null,
                         templateStr, checklistStr, salida_has_alert ? 1 : 0,
                         salida_observaciones || null,
                         firma_salida_conductor || null, firma_salida_vigilancia || null,
                         userSalida],
                        (err) => {
                            if (err) return res.status(500).json({ error: err.message });
                            if (typeof logAudit === 'function') logAudit(userSalida, 'seguridad', 'CREÓ', 'Registro unidad ' + regId);
                            res.json({ ok: true, id: regId });
                        }
                    );
                }
            );
        });
    });

    // ── PUT /seguridad/unidades/:id — Actualizar (registrar retorno) ──
    router.put('/seguridad/unidades/:id', (req, res) => {
        const tdb = getDb(req);
        const { retorno_fecha, retorno_hora, retorno_km,
                retorno_conductor, retorno_placa_carreta,
                retorno_template_json, retorno_checklist_json, retorno_has_alert,
                salida_observaciones, retorno_observaciones,
                firma_salida_conductor, firma_salida_vigilancia,
                firma_retorno_conductor, firma_retorno_vigilancia,
                retorno_creado_por,
                estado } = req.body;

        const sets = [];
        const params = [];

        const userRetorno = (req.user && req.user.nombre) || (req.user && req.user.email) || retorno_creado_por || req.body.creado_por || 'Seguridad';

        if (retorno_fecha !== undefined)           { sets.push('retorno_fecha = ?');           params.push(retorno_fecha); }
        if (retorno_hora !== undefined)            { sets.push('retorno_hora = ?');            params.push(retorno_hora); }
        if (retorno_km !== undefined)              { sets.push('retorno_km = ?');              params.push(retorno_km); }
        if (retorno_conductor !== undefined)       { sets.push('retorno_conductor = ?');       params.push(retorno_conductor || null); }
        if (retorno_placa_carreta !== undefined)   { sets.push('retorno_placa_carreta = ?');   params.push((retorno_placa_carreta || '').toUpperCase().trim() || null); }
        if (retorno_template_json !== undefined)   {
            sets.push('retorno_template_json = ?');
            params.push(typeof retorno_template_json === 'string' ? retorno_template_json : JSON.stringify(retorno_template_json));
        }
        if (retorno_checklist_json !== undefined)  {
            sets.push('retorno_checklist_json = ?');
            params.push(typeof retorno_checklist_json === 'string' ? retorno_checklist_json : JSON.stringify(retorno_checklist_json));
        }
        if (retorno_has_alert !== undefined)       { sets.push('retorno_has_alert = ?');       params.push(retorno_has_alert ? 1 : 0); }
        if (salida_observaciones !== undefined)    { sets.push('salida_observaciones = ?');    params.push(salida_observaciones || null); }
        if (retorno_observaciones !== undefined)   { sets.push('retorno_observaciones = ?');   params.push(retorno_observaciones || null); }
        if (firma_salida_conductor !== undefined)  { sets.push('firma_salida_conductor = ?');  params.push(firma_salida_conductor); }
        if (firma_salida_vigilancia !== undefined) { sets.push('firma_salida_vigilancia = ?'); params.push(firma_salida_vigilancia); }
        if (firma_retorno_conductor !== undefined) { sets.push('firma_retorno_conductor = ?'); params.push(firma_retorno_conductor); }
        if (firma_retorno_vigilancia !== undefined){ sets.push('firma_retorno_vigilancia = ?');params.push(firma_retorno_vigilancia); }
        
        // Guardar automáticamente quién realizó la recepción / retorno
        sets.push('retorno_creado_por = ?');
        params.push(userRetorno);

        if (estado !== undefined)                  { sets.push('estado = ?');                  params.push(estado); }

        if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });

        params.push(req.params.id);
        tdb.query('UPDATE seg_unidades_registros SET ' + sets.join(', ') + ' WHERE id = ?', params, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
            if (typeof logAudit === 'function') logAudit(userRetorno, 'seguridad', 'MODIFICÓ', 'Unidad retorno ' + req.params.id);
            res.json({ ok: true });
        });
    });

    // ── GET /seguridad/unidades/:id/fotos-presigned — URLs firmadas de un registro para PDF ──
    router.get('/seguridad/unidades/:id/fotos-presigned', (req, res) => {
        db.query('SELECT * FROM seg_unidades_fotos WHERE registro_id = ? ORDER BY orden ASC', [req.params.id], async (err, fotos) => {
            if (err) return res.status(500).json({ error: err.message });
            const signed = await Promise.all((fotos || []).map(async (f) => {
                const key = s3KeyFromUrl(f.url);
                let signedUrl = f.url;
                if (key) {
                    try { signedUrl = await getPresignedUrl(key, 7200); } catch(e) {}
                }
                return { id: f.id, registro_id: f.registro_id, tipo: f.tipo, url: signedUrl, orden: f.orden };
            }));
            res.json(signed);
        });
    });

    // ── DELETE /seguridad/unidades/:id — Eliminar registro + fotos S3 ──
    router.delete('/seguridad/unidades/:id', (req, res) => {
        const regId = req.params.id;
        // 1. Obtener URLs de fotos para limpiar S3 después
        db.query('SELECT url FROM seg_unidades_fotos WHERE registro_id = ?', [regId], (err, fotos) => {
            // 2. Borrar fotos de la BD
            db.query('DELETE FROM seg_unidades_fotos WHERE registro_id = ?', [regId], () => {
                // 3. Borrar registro de la BD
                db.query('DELETE FROM seg_unidades_registros WHERE id = ?', [regId], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (typeof logAudit === 'function') logAudit((req.user && req.user.nombre) || '', 'seguridad', 'ELIMINÓ', 'Unidad ' + regId);
                    // 4. Responder inmediatamente
                    res.json({ ok: true });
                    // 5. Limpiar S3 en segundo plano (no bloquea la respuesta)
                    if (!err && fotos && fotos.length) {
                        Promise.all(fotos.map(f => {
                            const key = s3KeyFromUrl(f.url);
                            return key ? deleteFromS3(key) : Promise.resolve();
                        })).catch(e => console.warn('S3 cleanup error:', e.message));
                    }
                });
            });
        });
    });

    // ── POST /seguridad/unidades/:id/fotos/presigned — Generar pases VIP ──
    router.post('/seguridad/unidades/:id/fotos/presigned', async (req, res) => {
        try {
            const registroId = req.params.id;
            const archivos = req.body.archivos || []; // [{nombre: '...', tipo: 'image/jpeg', fase: 'salida'}]
            if (!archivos.length) return res.status(400).json({ error: 'No se enviaron archivos' });

            const urls = await Promise.all(archivos.map(async (arch) => {
                const tipo = arch.fase || 'salida';
                const ext = (arch.nombre || '').split('.').pop() || 'jpg';
                const rand = Math.random().toString(36).substring(2, 7);
                const s3Key = `seguridad/unidades/${registroId}/${tipo}_${Date.now()}_${rand}.${ext}`;
                // Generar URL pre-firmada estándar
                const uploadUrl = await getPresignedUploadUrl(s3Key, 'image/jpeg', 600);
                return { uploadUrl, key: s3Key, fase: tipo };
            }));

            res.json({ urls });
        } catch (e) {
            console.error('Error generando URLs prefirmadas:', e);
            res.status(500).json({ error: 'Error generando URLs de S3' });
        }
    });

    // ── POST /seguridad/unidades/:id/fotos/confirmar — Confirmar subida a DB en lote (Bulk) ──
    router.post('/seguridad/unidades/:id/fotos/confirmar', (req, res) => {
        const registroId = req.params.id;
        const exitosos = req.body.exitosos || []; // [{key: '...', fase: 'salida'}]
        if (!exitosos.length) return res.json({ ok: true, message: 'Ninguna foto para confirmar' });

        const bucket = (process.env.AWS_BUCKET_NAME || '').trim();
        const region = (process.env.AWS_REGION || 'us-east-2').trim();

        db.query(
            'SELECT COALESCE(MAX(orden), 0) AS maxOrden FROM seg_unidades_fotos WHERE registro_id = ?',
            [registroId],
            (errDb, rows) => {
                if (errDb) return res.status(500).json({ error: errDb.message });
                let orden = (rows && rows[0]) ? rows[0].maxOrden : 0;
                
                const values = exitosos.map(ex => {
                    orden++;
                    const fullUrl = `https://${bucket}.s3.${region}.amazonaws.com/${ex.key}`;
                    return [registroId, ex.fase || 'salida', fullUrl, orden];
                });

                db.query(
                    'INSERT INTO seg_unidades_fotos (registro_id, tipo, url, orden) VALUES ?',
                    [values],
                    (errInsert) => {
                        if (errInsert) {
                            console.error('Error bulk insert fotos:', errInsert.message);
                            return res.status(500).json({ error: errInsert.message });
                        }
                        res.json({ ok: true, guardados: values.length });
                    }
                );
            }
        );
    });

    // ── POST /seguridad/unidades/presign-fotos — Firmar URLs para PDF/WhatsApp bajo demanda ──
    router.post('/seguridad/unidades/presign-fotos', async (req, res) => {
        try {
            const urls = req.body.urls || [];
            if (!urls.length) return res.json({});
            const signed = {};
            await Promise.all(urls.map(async (url) => {
                if (!url) return;
                const key = s3KeyFromUrl(url);
                if (key) {
                    try { signed[url] = await getPresignedUrl(key, 7200); } catch(e) { signed[url] = url; }
                } else {
                    signed[url] = url;
                }
            }));
            res.json(signed);
        } catch(e) {
            console.error('Error presign-fotos:', e);
            res.status(500).json({ error: e.message });
        }
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
        const tdb = getDb(req);
        tdb.query('SELECT * FROM seg_checklist_templates WHERE activo = 1 ORDER BY orden ASC', (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            // Convertir a formato que espera el frontend: [{id, titulo, items:[{id, label, tiene_cantidad}]}]
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
        const tdb = getDb(req);
        const { template } = req.body; // Array de {id, titulo, items:[{id,label,tiene_cantidad}]}
        if (!Array.isArray(template)) return res.status(400).json({ error: 'template debe ser un array' });

        // Estrategia: desactivar todo y re-insertar (upsert)
        tdb.query('UPDATE seg_checklist_templates SET activo = 0', (err) => {
            if (err) return res.status(500).json({ error: err.message });

            if (!template.length) return res.json({ ok: true });

            const values = template.map((cat, i) => [
                cat.id,
                cat.titulo,
                JSON.stringify(cat.items || []),
                i + 1,
                1 // activo
            ]);

            tdb.query(
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

    // ── GET /seguridad/unidades/ultimo-km/:placa — Obtener último kilometraje registrado ──
    router.get('/seguridad/unidades/ultimo-km/:placa', (req, res) => {
        const placa = (req.params.placa || '').trim().toUpperCase();
        const placaLimpia = placa.replace(/[^A-Z0-9]/g, '');

        if (!placaLimpia) return res.json({ ok: false, ultimoKm: null });

        // 1. Buscar en seg_unidades_registros el último retorno o salida
        const sql = `
            SELECT salida_km, retorno_km, salida_fecha, retorno_fecha, created_at
            FROM seg_unidades_registros
            WHERE REPLACE(REPLACE(placa_tracto, '-', ''), ' ', '') = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        `;

        db.query(sql, [placaLimpia], (err, rows) => {
            if (!err && rows && rows.length > 0) {
                const r = rows[0];
                const ultimoKm = (r.retorno_km && Number(r.retorno_km) > 0) ? Number(r.retorno_km) : (Number(r.salida_km) || null);
                if (ultimoKm) {
                    return res.json({
                        ok: true,
                        ultimoKm: ultimoKm,
                        fecha: r.retorno_fecha || r.salida_fecha,
                        tipo: r.retorno_km ? 'retorno' : 'salida'
                    });
                }
            }

            // 2. Fallback: buscar en tabla placas (odómetro)
            db.query(
                `SELECT odometro, km_inicial FROM placas WHERE REPLACE(REPLACE(placa, '-', ''), ' ', '') = ? LIMIT 1`,
                [placaLimpia],
                (errP, rowsP) => {
                    if (!errP && rowsP && rowsP.length > 0) {
                        const km = Number(rowsP[0].odometro) || Number(rowsP[0].km_inicial) || null;
                        return res.json({ ok: true, ultimoKm: km, tipo: 'placa' });
                    }
                    res.json({ ok: true, ultimoKm: null });
                }
            );
        });
    });

    // ── GET /seguridad/recursos — Autocomplete Placas y Directorio con Carretas Globales ──
    router.get('/seguridad/recursos', (req, res) => {
        const recursos = { 
            placas: [], 
            tractosPorEmpresa: {}, 
            placasPorEmpresa: {},
            placaToEmpresa: {},
            carretasGlobales: [], 
            conductores: [],
            empresas: []
        };
        
        // Consultar Placas con clasificación por empresa y tipo
        db.query('SELECT placa, cliente, tipo, motora FROM placas ORDER BY placa ASC', (errP, rowsP) => {
            if (!errP && rowsP) {
                recursos.placas = rowsP.map(r => r.placa);
                const empresasSet = new Set();

                rowsP.forEach(r => {
                    const empRaw = (r.cliente || 'GENERAL').toUpperCase().trim();
                    if (empRaw && empRaw !== 'NULL') empresasSet.add(empRaw);

                    const cleanP = (r.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (cleanP && empRaw && empRaw !== 'NULL') {
                        recursos.placaToEmpresa[cleanP] = empRaw;
                        if (!recursos.placasPorEmpresa[empRaw]) recursos.placasPorEmpresa[empRaw] = [];
                        recursos.placasPorEmpresa[empRaw].push(r.placa);
                    }

                    const motoraStr = String(r.motora || '').toUpperCase().trim();
                    const tipoUpper = (r.tipo || '').toUpperCase().trim();

                    const isNoMotora = motoraStr.includes('NO') || 
                                       motoraStr === '0' ||
                                       tipoUpper.includes('SEMIREMOLQUE') || 
                                       tipoUpper.includes('SEMIRREMOLQUE') || 
                                       tipoUpper.includes('CARRETA') || 
                                       tipoUpper.includes('FURGON') || 
                                       tipoUpper.includes('PLATAFORMA') || 
                                       tipoUpper.includes('TANQUE') || 
                                       tipoUpper.includes('TOLVA') ||
                                       tipoUpper.includes('BATEA') ||
                                       tipoUpper.includes('CAMA');

                    if (isNoMotora) {
                        recursos.carretasGlobales.push(r.placa);
                    } else {
                        if (!recursos.tractosPorEmpresa[empRaw]) recursos.tractosPorEmpresa[empRaw] = [];
                        recursos.tractosPorEmpresa[empRaw].push(r.placa);
                    }
                });

                recursos.empresas = Array.from(empresasSet);
            }
            
            // Consultar Conductores (Directorio)
            db.query('SELECT nombre FROM conductores ORDER BY nombre ASC', (errD, rowsD) => {
                if (!errD && rowsD) recursos.conductores = rowsD.map(r => r.nombre);
                res.json(recursos);
            });
        });
    });

    // ── GET /seguridad/empresas-stats — Métricas en vivo por empresa ──
    router.get('/seguridad/empresas-stats', (req, res) => {
        const tdb = getDb(req);
        tdb.query('SELECT placa, cliente FROM placas WHERE cliente IS NOT NULL AND TRIM(cliente) <> "" AND TRIM(cliente) <> "NULL"', (errP, placasRows) => {
            if (errP) return res.status(500).json({ error: errP.message });

            const placaToEmpresa = {};
            const empCountMap = {};

            (placasRows || []).forEach(p => {
                const emp = (p.cliente || '').toUpperCase().trim();
                if (emp && emp !== 'NULL') {
                    empCountMap[emp] = (empCountMap[emp] || 0) + 1;
                    const cleanP = (p.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (cleanP) placaToEmpresa[cleanP] = emp;
                }
            });

            tdb.query('SELECT id, estado, salida_has_alert, retorno_has_alert, placa_tracto FROM seg_unidades_registros', (errR, regRows) => {
                if (errR) return res.status(500).json({ error: errR.message });

                const statsMap = {};
                Object.keys(empCountMap).forEach(emp => {
                    statsMap[emp] = {
                        empresa: emp,
                        total_flota: empCountMap[emp] || 0,
                        en_ruta: 0,
                        completados: 0,
                        alertas: 0
                    };
                });

                let globalStats = { empresa: 'TODAS', total_flota: (placasRows || []).length, en_ruta: 0, completados: 0, alertas: 0 };

                (regRows || []).forEach(r => {
                    const cleanP = (r.placa_tracto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const emp = placaToEmpresa[cleanP] || (Object.keys(empCountMap)[0] || '');

                    if (r.estado === 'en_ruta') {
                        globalStats.en_ruta++;
                        if (statsMap[emp]) statsMap[emp].en_ruta++;
                    } else if (r.estado === 'completado') {
                        globalStats.completados++;
                        if (statsMap[emp]) statsMap[emp].completados++;
                    }
                    if (r.salida_has_alert || r.retorno_has_alert) {
                        globalStats.alertas++;
                        if (statsMap[emp]) statsMap[emp].alertas++;
                    }
                });

                // Si no hay placas aún en la base de datos de esta empresa, obtener el nombre de la empresa configurada
                if (Object.keys(statsMap).length === 0) {
                    tdb.query("SELECT valor FROM configuracion_erp WHERE clave = 'empresa_nombre' LIMIT 1", (errConf, confRows) => {
                        const nomEmpresa = (confRows && confRows[0] && confRows[0].valor) ? confRows[0].valor.trim().toUpperCase() : '';
                        if (nomEmpresa) {
                            statsMap[nomEmpresa] = {
                                empresa: nomEmpresa,
                                total_flota: 0,
                                en_ruta: 0,
                                completados: 0,
                                alertas: 0
                            };
                        }
                        return res.json({
                            global: globalStats,
                            empresas: Object.values(statsMap)
                        });
                    });
                    return;
                }

                res.json({
                    global: globalStats,
                    empresas: Object.values(statsMap)
                });
            });
        });
    });

    // ════════════════════════════════════════════════════════════════
    // STATUS "UNIDADES EN BASE"
    // ════════════════════════════════════════════════════════════════

    // ── Catálogo de Placas y Conductores para Selección ───────────
    router.get('/seguridad/unidades-base/catalogo-placas', (req, res) => {
        const sqlPlacas = `
            SELECT DISTINCT placa, marca, tipo, motora 
            FROM placas 
            ORDER BY placa ASC
        `;
        db.query(sqlPlacas, (err, rows) => {
            const tractos = [];
            const carretas = [];
            const todas = [];

            if (!err && rows && rows.length) {
                rows.forEach(r => {
                    const p = (r.placa || '').trim().toUpperCase();
                    if (!p) return;
                    todas.push({ placa: p, marca: r.marca || '', tipo: r.tipo || '' });

                    const tipo = (r.tipo || '').toUpperCase();
                    const motora = String(r.motora || '').toUpperCase();

                    // Carreta / Remolque: no motora, o tipo contiene REMOLQUE, CARRETA, FURGON, CISTERNA, SEMI, PLATAFORMA
                    const esCarreta = motora === 'NO' || 
                        tipo.includes('REMOLQUE') || 
                        tipo.includes('CARRETA') || 
                        tipo.includes('FURGON') || 
                        tipo.includes('CISTERNA') || 
                        tipo.includes('SEMI') || 
                        tipo.includes('PLATAFORMA') || 
                        tipo.includes('BATEA') || 
                        tipo.includes('TOLVA');

                    if (esCarreta) {
                        carretas.push({ placa: p, marca: r.marca || '', tipo: r.tipo || 'Carreta' });
                    } else {
                        tractos.push({ placa: p, marca: r.marca || '', tipo: r.tipo || 'Tracto / Camión' });
                    }
                });
            }

            // Consultar Conductores del sistema
            db.query('SELECT DISTINCT nombre FROM conductores WHERE estado != "INACTIVO" OR estado IS NULL ORDER BY nombre ASC', (errC, rowsC) => {
                const conductores = (!errC && rowsC) ? rowsC.map(c => c.nombre).filter(Boolean) : [];
                res.json({ tractos, carretas, todas, conductores });
            });
        });
    });

    // ── GET /seguridad/unidades-base/panorama-en-vivo — Panorama 360° en Vivo ──
    router.get('/seguridad/unidades-base/panorama-en-vivo', (req, res) => {
        const tdb = getDb(req);
        const fechaTarget = req.query.fecha || new Date().toISOString().split('T')[0];
        const corteTarget = req.query.corte || 'ALL';
        const empresaTarget = (req.query.empresa || 'TODAS').toUpperCase().trim();

        // 1. Obtener todas las placas maestras del sistema
        tdb.query('SELECT placa, cliente, marca, tipo, motora FROM placas ORDER BY placa ASC', (errP, placasRows) => {
            if (errP) return res.status(500).json({ error: errP.message });

            // 2. Obtener todas las unidades en ruta desde el módulo de Checklist
            tdb.query(`
                SELECT id, placa_tracto, placa_carreta, conductor, destino, salida_fecha, salida_hora, salida_km,
                       orden_viaje, estado, salida_has_alert, salida_observaciones
                FROM seg_unidades_registros
                WHERE estado = 'en_ruta'
            `, (errR, rutaRows) => {
                if (errR) return res.status(500).json({ error: errR.message });

                // 3. Obtener los registros de permanencia en base guardados para la fecha
                let sqlBase = 'SELECT * FROM seg_unidades_base WHERE fecha = ?';
                const paramsBase = [fechaTarget];
                if (corteTarget && corteTarget !== 'ALL') {
                    sqlBase += ' AND corte = ?';
                    paramsBase.push(corteTarget);
                }
                sqlBase += ' ORDER BY id DESC';

                tdb.query(sqlBase, paramsBase, (errB, baseRows) => {
                    if (errB) return res.status(500).json({ error: errB.message });

                    const clean = str => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

                    // Mapear unidades en ruta
                    const rutaMap = {};
                    const carretasEnRutaSet = new Set();
                    (rutaRows || []).forEach(r => {
                        const cleanT = clean(r.placa_tracto);
                        if (cleanT) rutaMap[cleanT] = r;
                        const cleanC = clean(r.placa_carreta);
                        if (cleanC) carretasEnRutaSet.add(cleanC);
                    });

                    // Mapear registros de base guardados
                    const baseCamionMap = {};
                    const baseCarretaMap = {};
                    const carretasAcopladasEnBaseSet = new Set();

                    (baseRows || []).forEach(b => {
                        const cleanCamion = clean(b.placa_camion);
                        const cleanCarreta = clean(b.placa_carreta);
                        if (cleanCamion && !baseCamionMap[cleanCamion]) baseCamionMap[cleanCamion] = b;
                        if (cleanCarreta && !baseCarretaMap[cleanCarreta]) baseCarretaMap[cleanCarreta] = b;
                        if (cleanCamion && cleanCarreta) carretasAcopladasEnBaseSet.add(cleanCarreta);
                    });

                    const panorama = [];
                    const empresasSet = new Set();
                    const statsPorEmpresa = {};

                    function getEmpresaStatsObj(empName) {
                        if (!statsPorEmpresa[empName]) {
                            statsPorEmpresa[empName] = {
                                empresa: empName,
                                total_flota: 0,
                                en_base: 0,
                                en_ruta: 0,
                                en_taller: 0,
                                en_lavado: 0,
                                con_alerta: 0
                            };
                        }
                        return statsPorEmpresa[empName];
                    }

                    const globalStats = {
                        empresa: 'TODAS',
                        total_flota: 0,
                        en_base: 0,
                        en_ruta: 0,
                        en_taller: 0,
                        en_lavado: 0,
                        con_alerta: 0
                    };

                    const validPlacas = (placasRows || []).filter(p => {
                        const pU = (p.placa || '').toUpperCase().trim();
                        return pU && !pU.includes('CONSUMO') && !pU.includes('ENTREGA') && pU.length <= 10;
                    });

                    const motoras = [];
                    const noMotoras = [];

                    validPlacas.forEach(p => {
                        const motoraStr = String(p.motora || '').toUpperCase().trim();
                        const tipoUpper = String(p.tipo || '').toUpperCase().trim();
                        const isNoMotora = motoraStr.includes('NO') || 
                                           motoraStr === '0' ||
                                           tipoUpper.includes('SEMIREMOLQUE') || 
                                           tipoUpper.includes('SEMIRREMOLQUE') || 
                                           tipoUpper.includes('CARRETA') || 
                                           tipoUpper.includes('FURGON') || 
                                           tipoUpper.includes('PLATAFORMA') || 
                                           tipoUpper.includes('TANQUE') || 
                                           tipoUpper.includes('TOLVA') ||
                                           tipoUpper.includes('BATEA') ||
                                           tipoUpper.includes('CAMA');

                        if (isNoMotora) noMotoras.push(p);
                        else motoras.push(p);
                    });

                    // ── 1. Procesar Unidades Motoras (Tractos / Camiones) ───────────
                    motoras.forEach(p => {
                        const pUpper = (p.placa || '').toUpperCase().trim();
                        const cleanP = clean(pUpper);
                        if (!cleanP) return;

                        let rawCliente = String(p.cliente || '').toUpperCase().trim();
                        let emp = 'MARSISA';
                        if (rawCliente.includes('MARSISA')) emp = 'MARSISA';
                        else if (rawCliente.includes('TRAHESA')) emp = 'TRAHESA';
                        else if (rawCliente.includes('ROSYMAR')) emp = 'ROSYMAR';
                        else if (rawCliente) emp = rawCliente;

                        if (emp && emp !== 'NULL') empresasSet.add(emp);

                        const empStat = getEmpresaStatsObj(emp);
                        globalStats.total_flota++;
                        empStat.total_flota++;

                        const rutaActiva = rutaMap[cleanP];
                        const baseRecord = baseCamionMap[cleanP];

                        let statusOp = 'EN BASE';
                        let ubicacion = 'Base';
                        let conductor = 'Sin asignar';
                        let placaCarreta = '—';
                        let estadoCarga = 'Disponible';
                        let observacion = '';
                        let fechaSalida = null;
                        let horaSalida = null;
                        let kmSalida = null;
                        let ordenViaje = null;
                        let hasAlert = false;
                        let baseId = null;
                        let corte = corteTarget !== 'ALL' ? corteTarget : 'Corte 1';

                        if (rutaActiva) {
                            hasAlert = !!(rutaActiva.salida_has_alert);
                            conductor = rutaActiva.conductor || 'Sin conductor';
                            placaCarreta = rutaActiva.placa_carreta || '—';
                            fechaSalida = rutaActiva.salida_fecha;
                            horaSalida = rutaActiva.salida_hora;
                            kmSalida = rutaActiva.salida_km;
                            ordenViaje = rutaActiva.orden_viaje;
                            observacion = rutaActiva.salida_observaciones || '';

                            const destUpper = String(rutaActiva.destino || '').toUpperCase();
                            if (destUpper.includes('COMPRA')) {
                                statusOp = 'EN COMPRAS';
                                ubicacion = 'Compras Locales';
                            } else if (destUpper.includes('TALLER') || destUpper.includes('MANTENIMIENTO')) {
                                statusOp = 'EN TALLER';
                                ubicacion = 'Taller Tercero';
                            } else {
                                statusOp = 'EN RUTA';
                                ubicacion = rutaActiva.destino ? `En Ruta (${rutaActiva.destino})` : 'En Ruta';
                            }
                            estadoCarga = 'En Operación';

                            if (statusOp === 'EN TALLER') {
                                globalStats.en_taller++;
                                empStat.en_taller++;
                            } else {
                                globalStats.en_ruta++;
                                empStat.en_ruta++;
                            }
                        } else {
                            if (baseRecord) {
                                baseId = baseRecord.id;
                                corte = baseRecord.corte || corte;
                                ubicacion = baseRecord.zona || 'Base';
                                estadoCarga = baseRecord.estado || 'Cargado';
                                conductor = baseRecord.conductor || 'Sin asignar';
                                placaCarreta = baseRecord.placa_carreta || '—';
                                observacion = baseRecord.observacion || '';

                                const zonaUpper = String(baseRecord.zona || '').toUpperCase();
                                if (zonaUpper.includes('MANTENIMIENTO') || zonaUpper.includes('TALLER')) {
                                    statusOp = 'EN MANTENIMIENTO';
                                    globalStats.en_taller++;
                                    empStat.en_taller++;
                                } else if (zonaUpper.includes('LAVADO')) {
                                    statusOp = 'EN LAVADO';
                                    globalStats.en_lavado++;
                                    empStat.en_lavado++;
                                } else {
                                    statusOp = 'EN BASE';
                                    globalStats.en_base++;
                                    empStat.en_base++;
                                }
                            } else {
                                statusOp = 'EN BASE';
                                ubicacion = 'Base';
                                estadoCarga = 'Disponible';
                                globalStats.en_base++;
                                empStat.en_base++;
                            }
                        }

                        if (hasAlert) {
                            globalStats.con_alerta++;
                            empStat.con_alerta++;
                        }

                        if (empresaTarget !== 'TODAS' && emp !== empresaTarget && !emp.includes(empresaTarget)) {
                            return;
                        }

                        panorama.push({
                            id: baseId,
                            base_id: baseId,
                            placa: pUpper,
                            placa_camion: pUpper,
                            placa_carreta: placaCarreta,
                            conductor: conductor,
                            empresa: emp,
                            empresaTitular: emp,
                            marca: p.marca || '',
                            tipo: p.tipo || 'TRACTO / CAMIÓN',
                            status_operativo: statusOp,
                            ubicacion: ubicacion,
                            zona: ubicacion,
                            estado: estadoCarga,
                            estado_carga: estadoCarga,
                            observacion: observacion,
                            corte: corte,
                            esRuta: !!rutaActiva,
                            en_ruta_raw: !!rutaActiva,
                            fecha_salida: fechaSalida,
                            hora_salida: horaSalida,
                            km_salida: kmSalida,
                            orden_viaje: ordenViaje,
                            has_alert: hasAlert,
                            checklist_id: rutaActiva ? rutaActiva.id : null
                        });
                    });

                    // ── 2. Procesar Unidades No-Motoras (Carretas / Semirremolques en Base) ──
                    noMotoras.forEach(p => {
                        const pUpper = (p.placa || '').toUpperCase().trim();
                        const cleanP = clean(pUpper);
                        if (!cleanP) return;

                        // Si ya está asignada en una ruta activa acoplada a un tracto
                        if (carretasEnRutaSet.has(cleanP)) return;

                        // Si ya está acoplada a un camión registrado en base para este corte/fecha
                        if (carretasAcopladasEnBaseSet.has(cleanP)) return;

                        let rawCliente = String(p.cliente || '').toUpperCase().trim();
                        let emp = 'MARSISA';
                        if (rawCliente.includes('MARSISA')) emp = 'MARSISA';
                        else if (rawCliente.includes('TRAHESA')) emp = 'TRAHESA';
                        else if (rawCliente.includes('ROSYMAR')) emp = 'ROSYMAR';
                        else if (rawCliente) emp = rawCliente;

                        if (emp && emp !== 'NULL') empresasSet.add(emp);

                        const empStat = getEmpresaStatsObj(emp);
                        globalStats.total_flota++;
                        empStat.total_flota++;

                        const baseRecord = baseCarretaMap[cleanP];

                        let statusOp = 'EN BASE';
                        let ubicacion = 'Base';
                        let conductor = 'Sin asignar';
                        let estadoCarga = 'Disponible';
                        let observacion = '';
                        let baseId = null;
                        let corte = corteTarget !== 'ALL' ? corteTarget : 'Corte 1';

                        if (baseRecord) {
                            baseId = baseRecord.id;
                            corte = baseRecord.corte || corte;
                            ubicacion = baseRecord.zona || 'Base';
                            estadoCarga = baseRecord.estado || 'Disponible';
                            conductor = baseRecord.conductor || 'Sin asignar';
                            observacion = baseRecord.observacion || '';

                            const zonaUpper = String(baseRecord.zona || '').toUpperCase();
                            if (zonaUpper.includes('MANTENIMIENTO') || zonaUpper.includes('TALLER')) {
                                statusOp = 'EN MANTENIMIENTO';
                                globalStats.en_taller++;
                                empStat.en_taller++;
                            } else if (zonaUpper.includes('LAVADO')) {
                                statusOp = 'EN LAVADO';
                                globalStats.en_lavado++;
                                empStat.en_lavado++;
                            } else {
                                statusOp = 'EN BASE';
                                globalStats.en_base++;
                                empStat.en_base++;
                            }
                        } else {
                            statusOp = 'EN BASE';
                            ubicacion = 'Base';
                            estadoCarga = 'Disponible';
                            globalStats.en_base++;
                            empStat.en_base++;
                        }

                        if (empresaTarget !== 'TODAS' && emp !== empresaTarget && !emp.includes(empresaTarget)) {
                            return;
                        }

                        panorama.push({
                            id: baseId,
                            base_id: baseId,
                            placa: pUpper,
                            placa_camion: '—',
                            placa_carreta: pUpper,
                            conductor: conductor,
                            empresa: emp,
                            empresaTitular: emp,
                            marca: p.marca || '',
                            tipo: p.tipo || 'CARRETA / SEMIRREMOLQUE',
                            status_operativo: statusOp,
                            ubicacion: ubicacion,
                            zona: ubicacion,
                            estado: estadoCarga,
                            estado_carga: estadoCarga,
                            observacion: observacion,
                            corte: corte,
                            esRuta: false,
                            en_ruta_raw: false,
                            fecha_salida: null,
                            hora_salida: null,
                            km_salida: null,
                            orden_viaje: null,
                            has_alert: false,
                            checklist_id: null
                        });
                    });

                    // KPIs según empresa seleccionada o global
                    let activeStats = globalStats;
                    if (empresaTarget !== 'TODAS') {
                        activeStats = statsPorEmpresa[empresaTarget] || {
                            empresa: empresaTarget,
                            total_flota: 0,
                            en_base: 0,
                            en_ruta: 0,
                            en_taller: 0,
                            en_lavado: 0,
                            con_alerta: 0
                        };
                    }

                    const kpisResponse = {
                        totalFlota: activeStats.total_flota || 0,
                        enBase: activeStats.en_base || 0,
                        enRuta: activeStats.en_ruta || 0,
                        enTaller: (activeStats.en_taller || 0) + (activeStats.en_lavado || 0),
                        enLavado: activeStats.en_lavado || 0,
                        conAlerta: activeStats.con_alerta || 0
                    };

                    let itemsResultado = panorama;
                    const searchTarget = (req.query.search || '').trim().toUpperCase();
                    const estadoTarget = (req.query.estado || 'ALL').trim().toUpperCase();

                    if (estadoTarget && estadoTarget !== 'ALL') {
                        if (estadoTarget === 'EN RUTA') {
                            itemsResultado = itemsResultado.filter(it => it.esRuta === true);
                        } else {
                            itemsResultado = itemsResultado.filter(it => {
                                const st = String(it.estado || it.estado_carga || '').toUpperCase();
                                return st.includes(estadoTarget);
                            });
                        }
                    }

                    if (searchTarget) {
                        const cleanQ = clean(searchTarget);
                        itemsResultado = itemsResultado.filter(it => {
                            const cPlaca = clean(it.placa);
                            const cCamion = clean(it.placa_camion);
                            const cCarreta = clean(it.placa_carreta);
                            const cCond = clean(it.conductor);
                            const cUbic = clean(it.ubicacion || it.zona);
                            const cDest = clean(it.destino);
                            const cViaje = clean(it.orden_viaje);
                            const cObs = clean(it.observacion);
                            const cMarca = clean(it.marca);

                            return (cPlaca && cPlaca.includes(cleanQ)) ||
                                   (cCamion && cCamion.includes(cleanQ)) ||
                                   (cCarreta && cCarreta.includes(cleanQ)) ||
                                   (cCond && cCond.includes(cleanQ)) ||
                                   (cUbic && cUbic.includes(cleanQ)) ||
                                   (cDest && cDest.includes(cleanQ)) ||
                                   (cViaje && cViaje.includes(cleanQ)) ||
                                   (cObs && cObs.includes(cleanQ)) ||
                                   (cMarca && cMarca.includes(cleanQ));
                        });
                    }

                    res.json({
                        ok: true,
                        fecha: fechaTarget,
                        corte: corteTarget,
                        empresa: empresaTarget,
                        kpis: kpisResponse,
                        global: globalStats,
                        empresas_stats: statsPorEmpresa,
                        lista_empresas: Array.from(empresasSet),
                        items: itemsResultado,
                        panorama: itemsResultado
                    });
                });
            });
        });
    });

    // ── POST /seguridad/unidades-base/sincronizar-corte — Auto-poblar unidades en base ──
    router.post('/seguridad/unidades-base/sincronizar-corte', (req, res) => {
        const tdb = getDb(req);
        const { fecha, corte, empresa } = req.body;
        if (!fecha || !corte) {
            return res.status(400).json({ error: 'Fecha y corte son requeridos.' });
        }

        const usuario = (req.user && (req.user.nombre || req.user.usuario)) || req.body.usuario || 'Seguridad';
        const horaActual = new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

        tdb.query('SELECT placa, cliente, tipo, motora FROM placas', (errP, placasRows) => {
            if (errP) return res.status(500).json({ error: errP.message });

            tdb.query("SELECT placa_tracto, placa_carreta FROM seg_unidades_registros WHERE estado = 'en_ruta'", (errR, rutaRows) => {
                if (errR) return res.status(500).json({ error: errR.message });

                const clean = str => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

                const enRutaTractosSet = new Set((rutaRows || []).map(r => clean(r.placa_tracto)).filter(Boolean));
                const enRutaCarretasSet = new Set((rutaRows || []).map(r => clean(r.placa_carreta)).filter(Boolean));

                tdb.query('SELECT placa_camion, placa_carreta FROM seg_unidades_base WHERE fecha = ? AND corte = ?', [fecha, corte], (errB, baseRows) => {
                    if (errB) return res.status(500).json({ error: errB.message });

                    const yaEnBaseCamionSet = new Set((baseRows || []).map(b => clean(b.placa_camion)).filter(Boolean));
                    const yaEnBaseCarretaSet = new Set((baseRows || []).map(b => clean(b.placa_carreta)).filter(Boolean));

                    const inserts = [];
                    (placasRows || []).forEach(p => {
                        const cleanP = clean(p.placa);
                        if (!cleanP || cleanP.includes('CONSUMO') || cleanP.includes('ENTREGA') || cleanP.length > 10) return;

                        const motoraStr = String(p.motora || '').toUpperCase().trim();
                        const tipoUpper = String(p.tipo || '').toUpperCase().trim();

                        const isNoMotora = motoraStr.includes('NO') || 
                                           motoraStr === '0' ||
                                           tipoUpper.includes('SEMIREMOLQUE') || 
                                           tipoUpper.includes('SEMIRREMOLQUE') || 
                                           tipoUpper.includes('CARRETA') || 
                                           tipoUpper.includes('FURGON') || 
                                           tipoUpper.includes('PLATAFORMA') || 
                                           tipoUpper.includes('TANQUE') || 
                                           tipoUpper.includes('TOLVA') ||
                                           tipoUpper.includes('BATEA') ||
                                           tipoUpper.includes('CAMA');

                        // Filtro de empresa si se especificó
                        if (empresa && empresa !== 'TODAS') {
                            const empRaw = (p.cliente || '').toUpperCase().trim();
                            if (empRaw !== empresa.toUpperCase().trim() && !empRaw.includes(empresa.toUpperCase().trim())) {
                                return;
                            }
                        }

                        if (!isNoMotora) {
                            // Camión / Tracto
                            if (!enRutaTractosSet.has(cleanP) && !yaEnBaseCamionSet.has(cleanP)) {
                                inserts.push([
                                    fecha,
                                    corte,
                                    horaActual,
                                    p.placa.trim().toUpperCase(),
                                    null,
                                    'Sin asignar',
                                    'Base',
                                    'Vacío',
                                    'Sincronizado automáticamente por sistema',
                                    usuario
                                ]);
                            }
                        } else {
                            // Carreta / Semirremolque
                            if (!enRutaCarretasSet.has(cleanP) && !yaEnBaseCarretaSet.has(cleanP)) {
                                inserts.push([
                                    fecha,
                                    corte,
                                    horaActual,
                                    null,
                                    p.placa.trim().toUpperCase(),
                                    'Sin asignar',
                                    'Base',
                                    'Disponible',
                                    'Sincronizado automáticamente por sistema',
                                    usuario
                                ]);
                            }
                        }
                    });

                    if (inserts.length === 0) {
                        return res.json({ ok: true, mensaje: 'Todas las unidades ya están sincronizadas para este corte.', insertados: 0, hora: horaActual });
                    }

                    const sqlInsert = `
                        INSERT INTO seg_unidades_base 
                        (fecha, corte, corte_hora, placa_camion, placa_carreta, conductor, zona, estado, observacion, usuario)
                        VALUES ?
                    `;

                    tdb.query(sqlInsert, [inserts], (errIns, resIns) => {
                        if (errIns) return res.status(500).json({ error: errIns.message });
                        res.json({ ok: true, mensaje: `Se sincronizaron ${inserts.length} unidades en base exitosamente.`, insertados: inserts.length, hora: horaActual });
                    });
                });
            });
        });
    });

    // ── Listar Unidades en Base (Con Filtros por Fecha, Corte y Búsqueda) ──
    router.get('/seguridad/unidades-base', (req, res) => {
        const tdb = getDb(req);
        let sql = 'SELECT * FROM seg_unidades_base WHERE 1=1';
        const params = [];

        if (req.query.fecha) {
            sql += ' AND fecha = ?';
            params.push(req.query.fecha);
        }

        if (req.query.corte && req.query.corte !== 'ALL') {
            sql += ' AND corte = ?';
            params.push(req.query.corte);
        }

        if (req.query.estado && req.query.estado !== 'ALL') {
            sql += ' AND estado = ?';
            params.push(req.query.estado);
        }

        if (req.query.search) {
            const s = `%${req.query.search.trim()}%`;
            sql += ' AND (placa_camion LIKE ? OR placa_carreta LIKE ? OR conductor LIKE ? OR zona LIKE ? OR observacion LIKE ?)';
            params.push(s, s, s, s, s);
        }

        sql += ' ORDER BY id DESC';

        tdb.query(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, data: rows || [] });
        });
    });

    // ── Crear Registro de Unidad en Base ──────────────────────────
    router.post('/seguridad/unidades-base', (req, res) => {
        const tdb = getDb(req);
        const { fecha, corte, corte_hora, placa_camion, placa_carreta, conductor, zona, estado, observacion } = req.body;
        const pCamion = (placa_camion || '').trim().toUpperCase();
        const pCarreta = (placa_carreta || '').trim().toUpperCase();

        if (!fecha || !corte || (!pCamion && !pCarreta)) {
            return res.status(400).json({ error: 'Fecha, Corte y al menos una Placa (Camión o Carreta) son obligatorios.' });
        }

        const usuario = (req.user && (req.user.nombre || req.user.usuario)) || req.body.usuario || 'Seguridad';
        const horaExacta = corte_hora || new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

        const sql = `
            INSERT INTO seg_unidades_base 
            (fecha, corte, corte_hora, placa_camion, placa_carreta, conductor, zona, estado, observacion, usuario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            fecha,
            corte,
            horaExacta,
            pCamion || null,
            pCarreta || null,
            (conductor || '').trim() || null,
            (zona || 'Base').trim(),
            (estado || 'Cargado').trim(),
            (observacion || '').trim() || null,
            usuario
        ];

        tdb.query(sql, params, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id: result.insertId, message: 'Registro guardado exitosamente.' });
        });
    });

    // ── Actualizar Registro de Unidad en Base ─────────────────────
    router.put('/seguridad/unidades-base/:id', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        const { fecha, corte, corte_hora, placa_camion, placa_carreta, conductor, zona, estado, observacion } = req.body;
        const pCamion = (placa_camion || '').trim().toUpperCase();
        const pCarreta = (placa_carreta || '').trim().toUpperCase();

        const sets = [];
        const params = [];

        if (fecha !== undefined) { sets.push('fecha = ?'); params.push(fecha); }
        if (corte !== undefined) { sets.push('corte = ?'); params.push(corte); }
        if (corte_hora !== undefined) { sets.push('corte_hora = ?'); params.push(corte_hora); }
        if (placa_camion !== undefined) { sets.push('placa_camion = ?'); params.push(pCamion || null); }
        if (placa_carreta !== undefined) { sets.push('placa_carreta = ?'); params.push(pCarreta || null); }
        if (conductor !== undefined) { sets.push('conductor = ?'); params.push((conductor || '').trim() || null); }
        if (zona !== undefined) { sets.push('zona = ?'); params.push((zona || 'Base').trim()); }
        if (estado !== undefined) { sets.push('estado = ?'); params.push((estado || 'Cargado').trim()); }
        if (observacion !== undefined) { sets.push('observacion = ?'); params.push((observacion || '').trim() || null); }

        if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });

        params.push(id);
        const sql = `UPDATE seg_unidades_base SET ${sets.join(', ')} WHERE id = ?`;

        tdb.query(sql, params, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
            res.json({ ok: true, message: 'Registro actualizado exitosamente.' });
        });
    });

    // ── Eliminar Registro de Unidad en Base ───────────────────────
    router.delete('/seguridad/unidades-base/:id', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        tdb.query('DELETE FROM seg_unidades_base WHERE id = ?', [id], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
            res.json({ ok: true, message: 'Registro eliminado exitosamente.' });
        });
    });

    // ════════════════════════════════════════════════════════════════
    // ENTREGA DE VEHÍCULOS (FORMATO INVENTARIO FÍSICO ESTADO DE VEHÍCULO)
    // ════════════════════════════════════════════════════════════════

    // ── GET /seguridad/entrega-vehiculos/stats ────────────────────
    router.get('/seguridad/entrega-vehiculos/stats', (req, res) => {
        const sqlEmpresas = `
            SELECT 
                COALESCE(cliente, 'MARSISA') as empresa,
                COUNT(*) as total_flota
            FROM placas
            WHERE cliente IS NOT NULL AND TRIM(cliente) <> '' AND TRIM(cliente) <> 'NULL'
            GROUP BY COALESCE(cliente, 'MARSISA')
            ORDER BY total_flota DESC
        `;

        db.query(sqlEmpresas, (errEmp, empRows) => {
            if (errEmp) {
                console.warn('Advertencia stats empresas:', errEmp.message);
                return res.json({ global: { total_flota: 0, total_actas: 0, hoy: 0 }, empresas: [] });
            }

            const sqlEntregas = `
                SELECT 
                    COALESCE(empresa, 'MARSISA') as empresa,
                    COUNT(*) as total_actas,
                    SUM(CASE WHEN fecha = CURDATE() THEN 1 ELSE 0 END) as hoy,
                    COUNT(DISTINCT placa) as vehiculos_evaluados
                FROM seg_entrega_vehiculos
                GROUP BY COALESCE(empresa, 'MARSISA')
            `;

            db.query(sqlEntregas, (errEnt, entRows) => {
                const entMap = {};
                if (!errEnt && entRows) {
                    entRows.forEach(r => {
                        const emp = (r.empresa || 'MARSISA').trim().toUpperCase();
                        entMap[emp] = {
                            total_actas: Number(r.total_actas) || 0,
                            hoy: Number(r.hoy) || 0,
                            vehiculos: Number(r.vehiculos_evaluados) || 0
                        };
                    });
                }

                let globalTotalFlota = 0;
                let globalTotalActas = 0;
                let globalHoy = 0;

                const empresasList = (empRows || []).map(e => {
                    const empName = (e.empresa || 'MARSISA').trim().toUpperCase();
                    const eStat = entMap[empName] || { total_actas: 0, hoy: 0, vehiculos: 0 };
                    globalTotalFlota += Number(e.total_flota) || 0;
                    globalTotalActas += eStat.total_actas;
                    globalHoy += eStat.hoy;

                    return {
                        empresa: empName,
                        total_flota: Number(e.total_flota) || 0,
                        total_actas: eStat.total_actas,
                        hoy: eStat.hoy,
                        vehiculos: eStat.vehiculos
                    };
                });

                res.json({
                    ok: true,
                    global: {
                        empresa: 'TODAS',
                        total_flota: globalTotalFlota,
                        total_actas: globalTotalActas,
                        hoy: globalHoy
                    },
                    empresas: empresasList
                });
            });
        });
    });

    // ── GET /seguridad/entrega-vehiculos/next-folio ───────────────
    router.get('/seguridad/entrega-vehiculos/next-folio', (req, res) => {
        const year = new Date().getFullYear();
        const prefix = `ENT-${year}-`;
        db.query(
            `SELECT id, numero_inventario FROM seg_entrega_vehiculos WHERE id LIKE ? OR numero_inventario LIKE ? ORDER BY id DESC LIMIT 1`,
            [prefix + '%', prefix + '%'],
            (err, rows) => {
                let nextNum = 1;
                if (!err && rows && rows.length) {
                    const lastId = rows[0].numero_inventario || rows[0].id || '';
                    const parts = lastId.split('-');
                    const lastNum = parseInt(parts[parts.length - 1], 10);
                    if (!isNaN(lastNum)) nextNum = lastNum + 1;
                }
                const folio = prefix + String(nextNum).padStart(4, '0');
                res.json({ ok: true, folio: folio, nextNum: nextNum });
            }
        );
    });

    // ── GET /seguridad/entrega-vehiculos/placa-detalle/:placa ────
    router.get('/seguridad/entrega-vehiculos/placa-detalle/:placa', (req, res) => {
        const p = (req.params.placa || '').trim().toUpperCase();
        if (!p) return res.json({ ok: false, msg: 'Placa inválida' });

        const sql = `
            SELECT 
                p.placa, p.cliente, p.marca, p.modelo_uts, p.tipo, p.sub_tipo, p.color, 
                p.nro_motor, p.nro_vin, p.configuracion, p.combustible
            FROM placas p 
            WHERE p.placa = ? LIMIT 1
        `;
        db.query(sql, [p], (err, rows) => {
            if (err) {
                console.error('Error placa-detalle:', err.message);
                return res.status(500).json({ error: err.message });
            }
            if (!rows || !rows.length) return res.json({ ok: false, msg: 'Placa no encontrada' });
            const d = rows[0];

            // Intentar obtener el último KM registrado en seg_unidades_registros de forma no bloqueante
            db.query(
                `SELECT km_inicial, retorno_km FROM seg_unidades_registros WHERE placa_camion = ? ORDER BY id DESC LIMIT 1`,
                [p],
                (errKm, kmRows) => {
                    let km = 0;
                    if (!errKm && kmRows && kmRows.length) {
                        km = kmRows[0].retorno_km || kmRows[0].km_inicial || 0;
                    }

                    res.json({
                        ok: true,
                        data: {
                            placa: d.placa,
                            cliente: d.cliente,
                            marca: d.marca || '',
                            modelo: d.modelo_uts || '',
                            tipo: d.sub_tipo || d.tipo || 'TRACTO',
                            color: d.color || '',
                            numero_motor: d.nro_motor || '',
                            numero_serie: d.nro_vin || '',
                            configuracion: (d.configuracion || '').toUpperCase().trim(),
                            kilometraje: km
                        }
                    });
                }
            );
        });
    });

    // ── GET /seguridad/entrega-vehiculos ──────────────────────────
    router.get('/seguridad/entrega-vehiculos', (req, res) => {
        let sql = `SELECT * FROM seg_entrega_vehiculos`;
        const wheres = [];
        const params = [];

        if (req.query.empresa && req.query.empresa !== 'TODAS') {
            wheres.push('empresa = ?');
            params.push(req.query.empresa);
        }
        if (req.query.placa) {
            wheres.push('placa LIKE ?');
            params.push(`%${req.query.placa.trim()}%`);
        }
        if (req.query.fecha) {
            wheres.push('fecha = ?');
            params.push(req.query.fecha);
        }

        if (wheres.length) {
            sql += ' WHERE ' + wheres.join(' AND ');
        }
        sql += ' ORDER BY fecha DESC, creado_en DESC LIMIT 300';

        db.query(sql, params, (err, rows) => {
            if (err) {
                console.warn('Advertencia GET /seguridad/entrega-vehiculos:', err.message);
                return res.json({ ok: true, data: [] });
            }
            res.json({ ok: true, data: rows || [] });
        });
    });

    // ── GET /seguridad/entrega-vehiculos/:id ──────────────────────
    router.get('/seguridad/entrega-vehiculos/:id', (req, res) => {
        db.query('SELECT * FROM seg_entrega_vehiculos WHERE id = ? LIMIT 1', [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });
            res.json({ ok: true, data: rows[0] });
        });
    });

    // ── POST /seguridad/entrega-vehiculos ─────────────────────────
    router.post('/seguridad/entrega-vehiculos', (req, res) => {
        const {
            numero_inventario, fecha, motivo, quien_entrega, quien_recibe,
            clase, marca, tipo, modelo, placa, color, cilindros, numero_motor, numero_serie, kilometraje,
            llantas_del_der_marca, llantas_del_izq_marca, llantas_tra_der_marca, llantas_tra_izq_marca, llantas_repuesto_marca, llantas_ref_json,
            inventario_partes_json, observaciones, croquis_danos_json,
            firma_entrega, firma_recibe, doc_entrega, doc_recibe,
            empresa
        } = req.body;

        if (!placa || !quien_entrega || !quien_recibe) {
            return res.status(400).json({ error: 'Placa, Quien Entrega y Quien Recibe son obligatorios.' });
        }

        const year = new Date().getFullYear();
        const prefix = `ENT-${year}-`;
        db.query(
            `SELECT id FROM seg_entrega_vehiculos WHERE id LIKE ? ORDER BY id DESC LIMIT 1`,
            [prefix + '%'],
            (errSeq, seqRows) => {
                let nextNum = 1;
                if (!errSeq && seqRows && seqRows.length) {
                    const lastId = seqRows[0].id;
                    const parts = lastId.split('-');
                    const lastNum = parseInt(parts[parts.length - 1], 10);
                    if (!isNaN(lastNum)) nextNum = lastNum + 1;
                }
                const regId = prefix + String(nextNum).padStart(4, '0');

                const usuarioCreacion = (req.user && req.user.nombre) || (req.user && req.user.email) || 'Seguridad';
                const fInventarioPartes = typeof inventario_partes_json === 'string' ? inventario_partes_json : JSON.stringify(inventario_partes_json || {});
                const fLlantasRef = typeof llantas_ref_json === 'string' ? llantas_ref_json : JSON.stringify(llantas_ref_json || {});
                const fCroquis = typeof croquis_danos_json === 'string' ? croquis_danos_json : JSON.stringify(croquis_danos_json || []);

                const sqlInsert = `
                    INSERT INTO seg_entrega_vehiculos (
                        id, numero_inventario, fecha, motivo, quien_entrega, quien_recibe,
                        clase, marca, tipo, modelo, placa, color, cilindros, numero_motor, numero_serie, kilometraje,
                        llantas_del_der_marca, llantas_del_izq_marca, llantas_tra_der_marca, llantas_tra_izq_marca, llantas_repuesto_marca, llantas_ref_json,
                        inventario_partes_json, observaciones, croquis_danos_json,
                        firma_entrega, firma_recibe, doc_entrega, doc_recibe,
                        empresa, creado_por
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const values = [
                    regId,
                    numero_inventario || regId,
                    fecha || new Date().toISOString().slice(0, 10),
                    motivo || 'ENTREGA DE UNIDAD',
                    String(quien_entrega).trim().toUpperCase(),
                    String(quien_recibe).trim().toUpperCase(),
                    clase || null,
                    marca || null,
                    tipo || null,
                    modelo || null,
                    String(placa).trim().toUpperCase(),
                    color || null,
                    cilindros || null,
                    numero_motor || null,
                    numero_serie || null,
                    parseFloat(kilometraje) || 0,
                    llantas_del_der_marca || null,
                    llantas_del_izq_marca || null,
                    llantas_tra_der_marca || null,
                    llantas_tra_izq_marca || null,
                    llantas_repuesto_marca || null,
                    fLlantasRef,
                    fInventarioPartes,
                    observaciones || null,
                    fCroquis,
                    firma_entrega || null,
                    firma_recibe || null,
                    doc_entrega || null,
                    doc_recibe || null,
                    (empresa || 'MARSISA').toUpperCase().trim(),
                    usuarioCreacion
                ];

                db.query(sqlInsert, values, (errInsert) => {
                    if (errInsert) return res.status(500).json({ error: errInsert.message });
                    if (typeof logAudit === 'function') logAudit(usuarioCreacion, 'seguridad', 'CREÓ', 'Checklist Entrega de Vehículo ' + regId);
                    res.json({ ok: true, id: regId, message: 'Checklist de Entrega guardado exitosamente.' });
                });
            }
        );
    });

    // ── PUT /seguridad/entrega-vehiculos/:id ─────────────────────
    router.put('/seguridad/entrega-vehiculos/:id', (req, res) => {
        const id = req.params.id;
        const {
            fecha, quien_recibe, clase, marca, tipo, modelo, color, numero_motor, numero_serie,
            kilometraje, inventario_partes_json, observaciones, firma_entrega, firma_recibe, empresa
        } = req.body;

        const fInventarioPartes = typeof inventario_partes_json === 'string' ? inventario_partes_json : JSON.stringify(inventario_partes_json || {});
        const usuarioEdicion = (req.user && req.user.nombre) || (req.user && req.user.email) || 'Seguridad';

        const sqlUpdate = `
            UPDATE seg_entrega_vehiculos SET
                fecha = ?,
                quien_recibe = ?,
                clase = ?,
                marca = ?,
                tipo = ?,
                modelo = ?,
                color = ?,
                numero_motor = ?,
                numero_serie = ?,
                kilometraje = ?,
                inventario_partes_json = ?,
                observaciones = ?,
                firma_entrega = COALESCE(?, firma_entrega),
                firma_recibe = COALESCE(?, firma_recibe),
                empresa = COALESCE(?, empresa)
            WHERE id = ?
        `;

        const values = [
            fecha || new Date().toISOString().slice(0, 10),
            String(quien_recibe || '').trim().toUpperCase(),
            clase || null,
            marca || null,
            tipo || null,
            modelo || null,
            color || null,
            numero_motor || null,
            numero_serie || null,
            parseFloat(kilometraje) || 0,
            fInventarioPartes,
            observaciones || null,
            firma_entrega || null,
            firma_recibe || null,
            empresa || null,
            id
        ];

        db.query(sqlUpdate, values, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
            if (typeof logAudit === 'function') logAudit(usuarioEdicion, 'seguridad', 'MODIFICÓ', 'Checklist Entrega ' + id);
            res.json({ ok: true, message: 'Acta de entrega actualizada exitosamente.' });
        });
    });

    // ── DELETE /seguridad/entrega-vehiculos/:id ───────────────────
    router.delete('/seguridad/entrega-vehiculos/:id', (req, res) => {
        const id = req.params.id;
        db.query('DELETE FROM seg_entrega_vehiculos WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, message: 'Registro eliminado exitosamente.' });
        });
    });

    return router;
};
