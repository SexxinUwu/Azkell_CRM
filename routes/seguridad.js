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
    const { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrl, getPresignedUploadUrl } = require('../utils/s3');

    // ════════════════════════════════════════════════════════════════
    // UNIDADES — Checklist de Camiones
    // ════════════════════════════════════════════════════════════════

    // ── GET /seguridad/unidades/stats — Estadísticas resumidas (1ms) ──
    router.get('/seguridad/unidades/stats', (req, res) => {
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
            db.query('SELECT * FROM seg_unidades_fotos WHERE registro_id IN (?) ORDER BY orden ASC', [ids], async (err2, fotosRows) => {
                if (err2) return res.status(500).json({ error: err2.message });
                
                const fotosWithPresign = await Promise.all((fotosRows || []).map(async (f) => {
                    const key = s3KeyFromUrl(f.url);
                    let finalUrl = f.url;
                    if (key) {
                        try { finalUrl = await getPresignedUrl(key, 86400); } catch(e) {}
                    }
                    return { id: f.id, registro_id: f.registro_id, tipo: f.tipo, url: finalUrl, orden: f.orden, key: key };
                }));

                const fotosByRecord = {};
                for (const f of fotosWithPresign) {
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
        const { placa_tracto, placa_carreta, conductor, destino,
                salida_fecha, salida_hora, salida_km,
                salida_template_json, salida_checklist_json, salida_has_alert,
                firma_salida_conductor, firma_salida_vigilancia } = req.body;

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

                const userSalida = (req.user && req.user.nombre) || (req.user && req.user.email) || req.body.creado_por || 'Seguridad';

                db.query(
                    `INSERT INTO seg_unidades_registros
                     (id, placa_tracto, placa_carreta, conductor, destino, estado,
                      salida_fecha, salida_hora, salida_km,
                      salida_template_json, salida_checklist_json, salida_has_alert,
                      firma_salida_conductor, firma_salida_vigilancia, creado_por)
                     VALUES (?, ?, ?, ?, ?, 'en_ruta', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [regId, placa_tracto.toUpperCase(), (placa_carreta || '').toUpperCase() || null,
                     conductor, destino || null,
                     salida_fecha || null, salida_hora || null, salida_km || null,
                     templateStr, checklistStr, salida_has_alert ? 1 : 0,
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

    // ── PUT /seguridad/unidades/:id — Actualizar (registrar retorno) ──
    router.put('/seguridad/unidades/:id', (req, res) => {
        const { retorno_fecha, retorno_hora, retorno_km,
                retorno_template_json, retorno_checklist_json, retorno_has_alert,
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
        if (retorno_template_json !== undefined)   {
            sets.push('retorno_template_json = ?');
            params.push(typeof retorno_template_json === 'string' ? retorno_template_json : JSON.stringify(retorno_template_json));
        }
        if (retorno_checklist_json !== undefined)  {
            sets.push('retorno_checklist_json = ?');
            params.push(typeof retorno_checklist_json === 'string' ? retorno_checklist_json : JSON.stringify(retorno_checklist_json));
        }
        if (retorno_has_alert !== undefined)       { sets.push('retorno_has_alert = ?');       params.push(retorno_has_alert ? 1 : 0); }
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
        db.query('UPDATE seg_unidades_registros SET ' + sets.join(', ') + ' WHERE id = ?', params, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
            if (typeof logAudit === 'function') logAudit(userRetorno, 'seguridad', 'MODIFICÓ', 'Unidad retorno ' + req.params.id);
            res.json({ ok: true });
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
        db.query('SELECT placa, cliente FROM placas WHERE cliente IS NOT NULL AND TRIM(cliente) <> "" AND TRIM(cliente) <> "NULL"', (errP, placasRows) => {
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

            db.query('SELECT id, estado, salida_has_alert, retorno_has_alert, placa_tracto FROM seg_unidades_registros', (errR, regRows) => {
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
                    const emp = placaToEmpresa[cleanP] || 'MARSISA';

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

                res.json({
                    global: globalStats,
                    empresas: Object.values(statsMap)
                });
            });
        });
    });

    return router;
};
