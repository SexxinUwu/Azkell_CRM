const express = require('express');

module.exports = function (db, logAudit) {
    const router = express.Router();

    // GET /api/mantenimiento/inspecciones/config
    router.get('/inspecciones/config', (req, res) => {
        const targetDb = req.db || db;
        const query = 'SELECT * FROM mant_insp_templates ORDER BY orden ASC';
        targetDb.query(query, (err, rows) => {
            if (err) {
                console.error('Error al obtener config de inspecciones:', err);
                return res.status(500).json({ ok: false, error: err.message });
            }
            res.json({ ok: true, data: rows });
        });
    });

    // POST /api/mantenimiento/inspecciones/config/guardar
    router.post('/inspecciones/config/guardar', (req, res) => {
        const { templates } = req.body;
        if (!Array.isArray(templates)) {
            return res.status(400).json({ ok: false, error: 'Formato inválido. Se esperaba un array de templates.' });
        }

        const targetDb = req.db || db;
        targetDb.getConnection((err, conn) => {
            if (err) {
                console.error('Error getConnection:', err);
                return res.status(500).json({ ok: false, error: err.message });
            }

            conn.beginTransaction((errTx) => {
                if (errTx) { conn.release(); return res.status(500).json({ ok: false, error: errTx.message }); }

                // Eliminar los existentes para recrear el orden y estructura
                conn.query('DELETE FROM mant_insp_templates', (errDel) => {
                    if (errDel) {
                        return conn.rollback(() => { conn.release(); res.status(500).json({ ok: false, error: errDel.message }); });
                    }

                    if (templates.length === 0) {
                        // Si está vacío, solo hacemos commit
                        conn.commit((errCommit) => {
                            conn.release();
                            if (errCommit) return res.status(500).json({ ok: false, error: errCommit.message });
                            if (logAudit) logAudit(req, 'Config. Inspecciones', 'Actualizar Configuración de Inspecciones', 'Se vació el checklist de inspecciones.');
                            return res.json({ ok: true });
                        });
                        return;
                    }

                    const insertQuery = 'INSERT INTO mant_insp_templates (template_id, titulo, items_json, orden) VALUES ?';
                    const values = templates.map((t, index) => [
                        t.template_id || `cat_${index+1}`,
                        t.titulo,
                        JSON.stringify(t.items_json || []),
                        index + 1
                    ]);

                    conn.query(insertQuery, [values], (errIns) => {
                        if (errIns) {
                            return conn.rollback(() => { conn.release(); res.status(500).json({ ok: false, error: errIns.message }); });
                        }

                        conn.commit((errCommit) => {
                            conn.release();
                            if (errCommit) return res.status(500).json({ ok: false, error: errCommit.message });
                            
                            if (logAudit) {
                                logAudit(req, 'Config. Inspecciones', 'Actualizar Configuración de Inspecciones', `Se actualizó el checklist de inspecciones con ${templates.length} categorías.`);
                            }
                            res.json({ ok: true });
                        });
                    });
                });
            });
        });
    });

    const { getPresignedUploadUrl } = require('../utils/s3');

    // POST /api/mantenimiento/inspecciones/upload-url
    router.post('/inspecciones/upload-url', async (req, res) => {
        const { idInsp, fileName, fileType } = req.body;
        if (!idInsp) return res.status(400).json({ ok: false, error: 'ID Inspección requerido' });
        
        try {
            const rand = Math.random().toString(36).substring(2, 7);
            const ext = fileName ? fileName.split('.').pop() : 'jpg';
            const s3Key = `mantenimiento/inspecciones/${idInsp}/${Date.now()}_${rand}.${ext}`;
            const uploadUrl = await getPresignedUploadUrl(s3Key, fileType || 'image/jpeg', 300);
            const finalUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/${s3Key}`;
            
            res.json({ ok: true, uploadUrl, s3Key, finalUrl });
        } catch(e) {
            console.error('Error getPresignedUploadUrl', e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // POST /api/mantenimiento/inspecciones/presign-read
    // Generates presigned read URLs for S3 evidence photos & signatures
    const handlePresignRead = async (req, res) => {
        const { urls } = req.body; // array of S3 URLs
        if (!Array.isArray(urls) || !urls.length) return res.json({ ok: true, signed: {} });
        
        const { getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');
        const signed = {};
        for (const url of urls) {
            const key = s3KeyFromUrl(url);
            if (key) {
                try { signed[url] = await getPresignedUrl(key, 3600); } catch(e) { signed[url] = url; }
            } else {
                signed[url] = url; // not an S3 url, return as-is
            }
        }
        res.json({ ok: true, signed });
    };

    router.post('/inspecciones/presign-read', handlePresignRead);
    router.post('/checklist/presign-read', handlePresignRead);
    router.post('/presign-read', handlePresignRead);

    // =========================================================================
    // MÓDULO: INCIDENCIAS EN RUTA
    // =========================================================================

    // GET /api/mantenimiento/incidencias-ruta/catalogo-placas
    router.get('/incidencias-ruta/catalogo-placas', (req, res) => {
        const targetDb = req.db || db;
        const queryPlacas = `
            SELECT 
                p.placa, 
                p.marca, 
                COALESCE(p.tipo, '') AS tipo
            FROM placas p
            WHERE p.estado != 'Inactiva'
            ORDER BY p.placa ASC
        `;
        const queryConductores = `
            SELECT nombre 
            FROM conductores 
            WHERE estado = 'Activo'
            ORDER BY nombre ASC
        `;

        targetDb.query(queryPlacas, (err, placasRows) => {
            if (err) {
                console.error('Error catalogo placas incidencias:', err);
                return res.status(500).json({ ok: false, error: err.message });
            }

            targetDb.query(queryConductores, (errCond, condRows) => {
                const conductores = (!errCond && condRows) ? condRows.map(c => c.nombre) : [];
                res.json({
                    ok: true,
                    data: placasRows || [],
                    conductores: conductores
                });
            });
        });
    });

    // GET /api/mantenimiento/incidencias-ruta
    router.get('/incidencias-ruta', (req, res) => {
        const targetDb = req.db || db;
        const { search, mes, anio, placa, area, solucionado, page = 1, limit = 50 } = req.query;

        let whereClauses = ['1=1'];
        let params = [];

        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            whereClauses.push('(codigo LIKE ? OR placa LIKE ? OR conductor LIKE ? OR motivo LIKE ? OR falla LIKE ? OR ubicacion LIKE ? OR responsable LIKE ?)');
            params.push(term, term, term, term, term, term, term);
        }

        if (placa && placa !== 'ALL') {
            whereClauses.push('placa = ?');
            params.push(placa);
        }

        if (area && area !== 'ALL') {
            whereClauses.push('area_responsable = ?');
            params.push(area);
        }

        if (solucionado && solucionado !== 'ALL') {
            whereClauses.push('solucionado = ?');
            params.push(solucionado);
        }

        if (mes && mes !== 'ALL') {
            whereClauses.push('MONTH(fecha_falla) = ?');
            params.push(parseInt(mes, 10));
        }

        if (anio && anio !== 'ALL') {
            whereClauses.push('YEAR(fecha_falla) = ?');
            params.push(parseInt(anio, 10));
        }

        const whereSql = whereClauses.join(' AND ');

        // Query para KPIs y Totales
        const kpiQuery = `
            SELECT 
                COUNT(*) AS totalRegistros,
                COALESCE(SUM(CASE WHEN solucionado = 'Pendiente' THEN 1 ELSE 0 END), 0) AS totalPendientes,
                COALESCE(SUM(CASE WHEN solucionado = 'Atendido' THEN 1 ELSE 0 END), 0) AS totalAtendidos,
                COALESCE(SUM(total_costo), 0) AS costoTotalAcumulado,
                COALESCE(SUM(CASE WHEN area_responsable = 'Mantenimiento' THEN 1 ELSE 0 END), 0) AS areaMantenimiento,
                COALESCE(SUM(CASE WHEN area_responsable = 'Flota' THEN 1 ELSE 0 END), 0) AS areaFlota,
                COALESCE(SUM(CASE WHEN area_responsable = 'Operaciones' THEN 1 ELSE 0 END), 0) AS areaOperaciones
            FROM mant_incidencias_ruta
            WHERE ${whereSql}
        `;

        targetDb.query(kpiQuery, params, (errKpi, kpiRows) => {
            if (errKpi) {
                console.error('Error calculando KPIs incidencias:', errKpi);
                return res.status(500).json({ ok: false, error: errKpi.message });
            }

            const kpis = kpiRows[0] || {
                totalRegistros: 0,
                totalPendientes: 0,
                totalAtendidos: 0,
                costoTotalAcumulado: 0,
                areaMantenimiento: 0,
                areaFlota: 0,
                areaOperaciones: 0
            };

            const pageNum = parseInt(page, 10) || 1;
            const limitNum = parseInt(limit, 10) || 50;
            const offset = (pageNum - 1) * limitNum;

            const dataQuery = `
                SELECT 
                    id, codigo, DATE_FORMAT(fecha_falla, '%Y-%m-%d') AS fecha_falla,
                    placa, conductor, marca, ubicacion, tipo_unidad,
                    transbordo, motivo, falla, area_responsable, responsable,
                    costos_detalle, total_costo, solucionado, observaciones,
                    creado_por, created_at
                FROM mant_incidencias_ruta
                WHERE ${whereSql}
                ORDER BY fecha_falla DESC, id DESC
                LIMIT ? OFFSET ?
            `;

            const queryParams = [...params, limitNum, offset];

            targetDb.query(dataQuery, queryParams, (errData, dataRows) => {
                if (errData) {
                    console.error('Error obteniendo registros de incidencias:', errData);
                    return res.status(500).json({ ok: false, error: errData.message });
                }

                // Parsear costos_detalle si viene como string
                const formatted = (dataRows || []).map(row => {
                    let items = [];
                    if (row.costos_detalle) {
                        try {
                            items = typeof row.costos_detalle === 'string' ? JSON.parse(row.costos_detalle) : row.costos_detalle;
                        } catch (e) {
                            items = [];
                        }
                    }
                    return {
                        ...row,
                        costos_detalle: items
                    };
                });

                res.json({
                    ok: true,
                    data: formatted,
                    kpis,
                    total: kpis.totalRegistros,
                    totalPages: Math.ceil(kpis.totalRegistros / limitNum) || 1,
                    page: pageNum
                });
            });
        });
    });

    // POST /api/mantenimiento/incidencias-ruta
    router.post('/incidencias-ruta', (req, res) => {
        const targetDb = req.db || db;
        const {
            fecha_falla,
            placa,
            conductor,
            marca,
            ubicacion,
            tipo_unidad,
            transbordo,
            motivo,
            falla,
            area_responsable,
            responsable,
            costos_detalle,
            solucionado,
            observaciones
        } = req.body;

        if (!fecha_falla || !placa) {
            return res.status(400).json({ ok: false, error: 'Fecha de falla y placa son obligatorios.' });
        }

        // Calcular costo total desde el array de costos_detalle
        let items = Array.isArray(costos_detalle) ? costos_detalle : [];
        let totalCalculado = items.reduce((acc, it) => acc + (parseFloat(it.monto) || 0), 0);

        const fechaObj = new Date(fecha_falla);
        const year = fechaObj.getFullYear() || new Date().getFullYear();
        const rand = Math.floor(1000 + Math.random() * 9000);
        const codigo = `INC-${year}-${rand}`;
        const creadoPor = req.user?.nombre || req.user?.correo || 'Sistema';

        const insertQuery = `
            INSERT INTO mant_incidencias_ruta (
                codigo, fecha_falla, placa, conductor, marca, ubicacion,
                tipo_unidad, transbordo, motivo, falla, area_responsable,
                responsable, costos_detalle, total_costo, solucionado,
                observaciones, creado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            codigo,
            fecha_falla,
            placa.toUpperCase().trim(),
            conductor || '',
            marca || '',
            ubicacion || '',
            tipo_unidad || '',
            transbordo === 'SI' ? 'SI' : 'NO',
            motivo || '',
            falla || '',
            area_responsable || 'Mantenimiento',
            responsable || '',
            JSON.stringify(items),
            totalCalculado,
            solucionado === 'Atendido' ? 'Atendido' : 'Pendiente',
            observaciones || '',
            creadoPor
        ];

        targetDb.query(insertQuery, values, (err, result) => {
            if (err) {
                console.error('Error insertando incidencia en ruta:', err);
                return res.status(500).json({ ok: false, error: err.message });
            }

            if (logAudit) {
                logAudit(req, 'Incidencias Ruta', 'Nueva Incidencia', `Registrada falla de unidad ${placa} en ${ubicacion || 'Ruta'} con código ${codigo}`);
            }

            res.json({ ok: true, id: result.insertId, codigo, message: 'Incidencia guardada con éxito.' });
        });
    });

    // PUT /api/mantenimiento/incidencias-ruta/:id
    router.put('/incidencias-ruta/:id', (req, res) => {
        const targetDb = req.db || db;
        const { id } = req.params;
        const {
            fecha_falla,
            placa,
            conductor,
            marca,
            ubicacion,
            tipo_unidad,
            transbordo,
            motivo,
            falla,
            area_responsable,
            responsable,
            costos_detalle,
            solucionado,
            observaciones
        } = req.body;

        let items = Array.isArray(costos_detalle) ? costos_detalle : [];
        let totalCalculado = items.reduce((acc, it) => acc + (parseFloat(it.monto) || 0), 0);

        const updateQuery = `
            UPDATE mant_incidencias_ruta SET
                fecha_falla = ?,
                placa = ?,
                conductor = ?,
                marca = ?,
                ubicacion = ?,
                tipo_unidad = ?,
                transbordo = ?,
                motivo = ?,
                falla = ?,
                area_responsable = ?,
                responsable = ?,
                costos_detalle = ?,
                total_costo = ?,
                solucionado = ?,
                observaciones = ?
            WHERE id = ?
        `;

        const values = [
            fecha_falla,
            placa ? placa.toUpperCase().trim() : '',
            conductor || '',
            marca || '',
            ubicacion || '',
            tipo_unidad || '',
            transbordo === 'SI' ? 'SI' : 'NO',
            motivo || '',
            falla || '',
            area_responsable || 'Mantenimiento',
            responsable || '',
            JSON.stringify(items),
            totalCalculado,
            solucionado === 'Atendido' ? 'Atendido' : 'Pendiente',
            observaciones || '',
            id
        ];

        targetDb.query(updateQuery, values, (err, result) => {
            if (err) {
                console.error('Error actualizando incidencia:', err);
                return res.status(500).json({ ok: false, error: err.message });
            }

            if (logAudit) {
                logAudit(req, 'Incidencias Ruta', 'Actualizar Incidencia', `Actualizados datos de la incidencia ID ${id} (${placa})`);
            }

            res.json({ ok: true, message: 'Incidencia actualizada con éxito.' });
        });
    });

    // PATCH /api/mantenimiento/incidencias-ruta/:id/toggle-solucion
    router.patch('/incidencias-ruta/:id/toggle-solucion', (req, res) => {
        const targetDb = req.db || db;
        const { id } = req.params;

        const getQuery = 'SELECT solucionado, placa, codigo FROM mant_incidencias_ruta WHERE id = ?';
        targetDb.query(getQuery, [id], (err, rows) => {
            if (err || !rows || rows.length === 0) {
                return res.status(404).json({ ok: false, error: 'Incidencia no encontrada.' });
            }

            const actual = rows[0].solucionado;
            const nuevo = actual === 'Atendido' ? 'Pendiente' : 'Atendido';

            targetDb.query('UPDATE mant_incidencias_ruta SET solucionado = ? WHERE id = ?', [nuevo, id], (errUp) => {
                if (errUp) {
                    console.error('Error al cambiar solución:', errUp);
                    return res.status(500).json({ ok: false, error: errUp.message });
                }

                if (logAudit) {
                    logAudit(req, 'Incidencias Ruta', 'Cambio de Estado Solución', `Estado de ${rows[0].codigo} (${rows[0].placa}) cambiado a ${nuevo}`);
                }

                res.json({ ok: true, nuevoEstado: nuevo });
            });
        });
    });

    // DELETE /api/mantenimiento/incidencias-ruta/:id
    router.delete('/incidencias-ruta/:id', (req, res) => {
        const targetDb = req.db || db;
        const { id } = req.params;

        targetDb.query('DELETE FROM mant_incidencias_ruta WHERE id = ?', [id], (err, result) => {
            if (err) {
                console.error('Error eliminando incidencia:', err);
                return res.status(500).json({ ok: false, error: err.message });
            }

            if (logAudit) {
                logAudit(req, 'Incidencias Ruta', 'Eliminar Incidencia', `Eliminada la incidencia ID ${id}`);
            }

            res.json({ ok: true, message: 'Incidencia eliminada correctamente.' });
        });
    });

    // POST /api/mantenimiento/incidencias-ruta/importar
    router.post('/incidencias-ruta/importar', (req, res) => {
        const targetDb = req.db || db;
        const { registros } = req.body;

        if (!Array.isArray(registros) || registros.length === 0) {
            return res.status(400).json({ ok: false, error: 'No se recibieron registros para importar.' });
        }

        const creadoPor = req.user?.nombre || req.user?.correo || 'Importación Masiva';
        const currentYear = new Date().getFullYear();

        // Obtener mapa de placas activas para autocompletar marca y tipo en caso de no venir
        targetDb.query('SELECT placa, marca, COALESCE(tipo, "") AS tipo FROM placas', (errPlacas, placasList) => {
            const mapPlacas = {};
            if (!errPlacas && Array.isArray(placasList)) {
                placasList.forEach(p => {
                    mapPlacas[p.placa.toUpperCase().trim()] = p;
                });
            }

            let insertados = 0;
            let errores = 0;

            const insertPromises = registros.map((r, index) => {
                return new Promise((resolve) => {
                    const placa = (r.placa || '').toUpperCase().trim();
                    const fecha = r.fecha_falla;

                    if (!placa || !fecha) {
                        errores++;
                        return resolve();
                    }

                    const placaDb = mapPlacas[placa] || {};
                    const marcaFinal = r.marca || placaDb.marca || '';
                    const tipoFinal = r.tipo_unidad || placaDb.tipo || 'TRACTO';

                    const rand = Math.floor(10000 + Math.random() * 90000);
                    const codigo = `INC-${currentYear}-${rand}-${index+1}`;

                    let items = [];
                    if (Array.isArray(r.costos_detalle)) {
                        items = r.costos_detalle;
                    } else if (r.costo_individual_texto) {
                        // Si viene como texto del Excel ej: "- PIÑON 120 - MANO DE OBRA 120"
                        const lineas = r.costo_individual_texto.split('\n');
                        lineas.forEach(l => {
                            const trimmed = l.trim().replace(/^[-•*]\s*/, '');
                            if (trimmed) {
                                const partes = trimmed.match(/^(.*?)(?:S\/?\.?\s*)?(\d+(?:\.\d+)?)$/i);
                                if (partes) {
                                    items.push({ concepto: partes[1].trim(), monto: parseFloat(partes[2]) || 0 });
                                } else {
                                    items.push({ concepto: trimmed, monto: 0 });
                                }
                            }
                        });
                    }

                    let totalCalculado = parseFloat(r.total_costo) || items.reduce((acc, it) => acc + (parseFloat(it.monto) || 0), 0);

                    const sql = `
                        INSERT INTO mant_incidencias_ruta (
                            codigo, fecha_falla, placa, conductor, marca, ubicacion,
                            tipo_unidad, transbordo, motivo, falla, area_responsable,
                            responsable, costos_detalle, total_costo, solucionado,
                            observaciones, creado_por
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    const values = [
                        codigo,
                        fecha,
                        placa,
                        r.conductor || '',
                        marcaFinal,
                        r.ubicacion || '',
                        tipoFinal,
                        (r.transbordo || '').toUpperCase() === 'SI' ? 'SI' : 'NO',
                        r.motivo || '',
                        r.falla || '',
                        r.area_responsable || 'Mantenimiento',
                        r.responsable || '',
                        JSON.stringify(items),
                        totalCalculado,
                        (r.solucionado || '').toUpperCase() === 'ATENDIDO' ? 'Atendido' : 'Pendiente',
                        r.observaciones || '',
                        creadoPor
                    ];

                    targetDb.query(sql, values, (err) => {
                        if (err) errores++;
                        else insertados++;
                        resolve();
                    });
                });
            });

            Promise.all(insertPromises).then(() => {
                if (logAudit) {
                    logAudit(req, 'Incidencias Ruta', 'Importación Masiva', `Se importaron ${insertados} incidencias en ruta desde Excel.`);
                }
                res.json({ ok: true, insertados, errores, total: registros.length });
            });
        });
    });

    return router;
};
