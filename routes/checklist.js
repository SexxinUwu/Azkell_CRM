const express = require('express');
const { uploadToS3, getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) { return req.db || db; }

    // ── Middleware: asegurar tabla reportes_fallas existe en el tenant actual ────
    router.use((req, res, next) => {
        const tdb = getDb(req);
        const createTableSql = `
        CREATE TABLE IF NOT EXISTS reportes_fallas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            folio VARCHAR(50) NOT NULL UNIQUE,
            fecha_reporte DATETIME DEFAULT CURRENT_TIMESTAMP,
            placa_tracto VARCHAR(20),
            placa_remolque VARCHAR(20),
            km_inicial INT DEFAULT 0,
            km_final INT DEFAULT 0,
            conductor VARCHAR(150),
            procedencia VARCHAR(150),
            ubicacion_gps VARCHAR(255),
            fallas_tracto_json LONGTEXT,
            fallas_remolque_json LONGTEXT,
            fallas_libres_text TEXT,
            fotos_json LONGTEXT,
            firma_conductor LONGTEXT,
            estado VARCHAR(30) DEFAULT 'Pendiente',
            id_rampa VARCHAR(50) DEFAULT NULL,
            ots_generadas_json LONGTEXT,
            creado_por VARCHAR(100),
            creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;
        tdb.query(createTableSql, (err) => {
            if (err) console.warn('⚠️ Error inicializando tabla reportes_fallas:', err.message);
            next();
        });
    });

    // ── GET /api/checklist — Listar reportes de fallas ──────────────────
    router.get('/', (req, res) => {
        const tdb = getDb(req);
        const sql = `
            SELECT id, folio, fecha_reporte, placa_tracto, placa_remolque, km_inicial, km_final,
                   conductor, procedencia, ubicacion_gps, fallas_libres_text, estado, id_rampa,
                   ots_generadas_json, creado_por, creado_en
            FROM reportes_fallas
            ORDER BY id DESC;
        `;
        tdb.query(sql, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    // ── GET /api/checklist/:id — Detalle completo de un reporte ────────
    router.get('/:id', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        tdb.query('SELECT * FROM reportes_fallas WHERE id = ?', [id], async (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'Reporte no encontrado' });

            const rep = rows[0];
            try {
                if (rep.fallas_tracto_json) rep.fallas_tracto_json = JSON.parse(rep.fallas_tracto_json);
            } catch(e) {}
            try {
                if (rep.fallas_remolque_json) rep.fallas_remolque_json = JSON.parse(rep.fallas_remolque_json);
            } catch(e) {}
            try {
                if (rep.ots_generadas_json) rep.ots_generadas_json = JSON.parse(rep.ots_generadas_json);
            } catch(e) {}

            // Procesar URLs pre-firmadas de S3 para fotos
            try {
                let fotosArr = [];
                if (rep.fotos_json) fotosArr = JSON.parse(rep.fotos_json);
                if (Array.isArray(fotosArr)) {
                    rep.fotos = await Promise.all(fotosArr.map(async (url) => {
                        if (!url) return null;
                        const key = s3KeyFromUrl(url);
                        if (key) {
                            try { return await getPresignedUrl(key); } catch(e) { return url; }
                        }
                        return url;
                    }));
                    rep.fotos = rep.fotos.filter(Boolean);
                }
            } catch(e) {
                rep.fotos = [];
            }

            res.json(rep);
        });
    });

    // ── POST /api/checklist — Crear nuevo reporte de fallas ────────────
    router.post('/', async (req, res) => {
        const tdb = getDb(req);
        const {
            placa_tracto, placa_remolque, km_inicial, km_final,
            conductor, procedencia, ubicacion_gps,
            fallas_tracto, fallas_remolque, fallas_libres_text,
            fotos_base64, firma_conductor, creado_por
        } = req.body;

        // Generar folio correlativo (F-YYYY-0001)
        const anio = new Date().getFullYear();
        const prefix = `F-${anio}-`;

        tdb.query(
            `SELECT folio FROM reportes_fallas WHERE folio LIKE ? ORDER BY id DESC LIMIT 1`,
            [`${prefix}%`],
            async (errFolio, rowsFolio) => {
                let seq = 1;
                if (!errFolio && rowsFolio.length) {
                    const lastId = rowsFolio[0].folio;
                    const lastSeq = parseInt(lastId.split('-').pop(), 10);
                    if (!isNaN(lastSeq)) seq = lastSeq + 1;
                }
                const folio = `${prefix}${String(seq).padStart(4, '0')}`;

                // Subir fotos a S3 si vienen en base64
                let fotosUrls = [];
                if (Array.isArray(fotos_base64) && fotos_base64.length > 0) {
                    for (let i = 0; i < fotos_base64.length; i++) {
                        const item = fotos_base64[i];
                        if (typeof item === 'string' && item.startsWith('data:image')) {
                            try {
                                const matches = item.match(/^data:(image\/\w+);base64,(.+)$/);
                                if (matches) {
                                    const buffer = Buffer.from(matches[2], 'base64');
                                    const ext = matches[1].split('/')[1] || 'jpg';
                                    const key = `checklist/${folio}_foto_${Date.now()}_${i}.${ext}`;
                                    const s3Url = await uploadToS3(buffer, key, matches[1]);
                                    fotosUrls.push(s3Url);
                                }
                            } catch (eS3) {
                                console.error('⚠️ Error subiendo foto S3:', eS3.message);
                            }
                        } else if (typeof item === 'string' && item.startsWith('http')) {
                            fotosUrls.push(item);
                        }
                    }
                }

                const sql = `
                INSERT INTO reportes_fallas (
                    folio, placa_tracto, placa_remolque, km_inicial, km_final,
                    conductor, procedencia, ubicacion_gps,
                    fallas_tracto_json, fallas_remolque_json, fallas_libres_text,
                    fotos_json, firma_conductor, estado, creado_por
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?);
                `;

                const values = [
                    folio,
                    (placa_tracto || '').trim().toUpperCase(),
                    (placa_remolque || '').trim().toUpperCase(),
                    parseInt(km_inicial, 10) || 0,
                    parseInt(km_final, 10) || 0,
                    (conductor || '').trim(),
                    (procedencia || '').trim(),
                    (ubicacion_gps || '').trim(),
                    JSON.stringify(fallas_tracto || []),
                    JSON.stringify(fallas_remolque || []),
                    (fallas_libres_text || '').trim(),
                    JSON.stringify(fotosUrls),
                    firma_conductor || null,
                    creado_por || 'Sistema'
                ];

                tdb.query(sql, values, (errIns, result) => {
                    if (errIns) return res.status(500).json({ error: errIns.message });

                    if (typeof broadcast === 'function') broadcast('checklist', 'crear');
                    res.json({ ok: true, id: result.insertId, folio, fotos: fotosUrls });
                });
            }
        );
    });

    // ── POST /api/checklist/:id/generar-ots — Generar OTs e integrar con Status Rampa ──
    router.post('/:id/generar-ots', (req, res) => {
        const tdb = getDb(req);
        const idReporte = req.params.id;
        const { ots, id_rampa, fecha_ingreso, fecha_salida, observaciones_generales, creado_por } = req.body;
        // ots es un array: [{ unidad: 'Tracto', placa: 'ABC-123', tipo_ot: 'Correctivo', subtipo_ot: 'Motor', supervisor: 'HECTOR', tecnicos: ['Juan'] }]

        if (!Array.isArray(ots) || ots.length === 0) {
            return res.status(400).json({ error: 'Debes proporcionar al menos una OT para generar' });
        }

        tdb.query('SELECT * FROM reportes_fallas WHERE id = ?', [idReporte], async (errRep, rowsRep) => {
            if (errRep || !rowsRep.length) return res.status(404).json({ error: 'Reporte no encontrado' });
            const rep = rowsRep[0];

            let fallasTracto = [];
            let fallasRemolque = [];
            try { fallasTracto = JSON.parse(rep.fallas_tracto_json || '[]'); } catch(e) {}
            try { fallasRemolque = JSON.parse(rep.fallas_remolque_json || '[]'); } catch(e) {}

            let otsCreadas = [];
            let errorCreacion = null;

            const anioOt = new Date().getFullYear();
            const regexOt = `^OT-${anioOt}-[0-9]{4}$`;

            let maxNumOt = 0;
            try {
                const [rowsMax] = await tdb.promise().query(
                    `SELECT ticket_entrada, id_ot FROM ordenes_trabajo WHERE ticket_entrada REGEXP ? OR id_ot REGEXP ?`,
                    [regexOt, regexOt]
                );
                (rowsMax || []).forEach(r => {
                    const str = r.id_ot || r.ticket_entrada || '';
                    const num = parseInt(str.split('-').pop(), 10);
                    if (!isNaN(num) && num > maxNumOt) maxNumOt = num;
                });
            } catch(eOtSeq) {}

            for (let i = 0; i < ots.length; i++) {
                const item = ots[i];
                const placa = (item.placa || '').trim().toUpperCase();
                if (!placa) continue;

                maxNumOt++;
                const idOt = `OT-${anioOt}-${String(maxNumOt).padStart(4, '0')}`;

                // Descripción de fallas limpia y concisa para impresión y detalle
                let descFallasClean = '';
                if (Array.isArray(item.fallas_seleccionadas) && item.fallas_seleccionadas.length > 0) {
                    descFallasClean = item.fallas_seleccionadas.map(f => {
                        return `• ` + f.replace(/^\[[^\]]+\]\s*/, '');
                    }).join('\n');
                } else {
                    let itemsFalla = (item.unidad === 'Remolque' || item.unidad === 'Carreta') ? fallasRemolque : fallasTracto;
                    descFallasClean = itemsFalla.map(f => `• ${f.item}: ${f.obs || 'Observado'}`).join('\n');
                }

                if (item.trabajo_custom) {
                    descFallasClean += (descFallasClean ? '\n' : '') + `• ${item.trabajo_custom}`;
                } else if (rep.fallas_libres_text && !item.fallas_seleccionadas) {
                    descFallasClean += (descFallasClean ? '\n' : '') + `• ${rep.fallas_libres_text}`;
                }

                const motivoLimpio = `[Reporte ${rep.folio}]\n${descFallasClean}`;
                const supervisorStr = (item.supervisor || '').trim() || (Array.isArray(item.tecnicos) && item.tecnicos.length ? item.tecnicos[0] : 'Por Asignar');
                const tecnicosStr = Array.isArray(item.tecnicos) ? item.tecnicos.join(', ') : (item.tecnico || 'Por Asignar');

                // Obtener datos del cliente de esa placa
                let clienteNombre = '';
                let rucDni = '';
                try {
                    const [pRows] = await tdb.promise().query('SELECT cliente, ruc_dni FROM placas WHERE placa = ? LIMIT 1', [placa]);
                    if (pRows && pRows.length) {
                        clienteNombre = pRows[0].cliente || '';
                        rucDni = pRows[0].ruc_dni || '';
                    }
                } catch(ePl) {}

                const kmVal = item.unidad === 'Tracto' ? (rep.km_inicial || 0) : 0;

                const detallesObj = {
                    cliente: clienteNombre,
                    ruc_dni: rucDni,
                    km: kmVal,
                    km_tablero: kmVal,
                    motivo: motivoLimpio,
                    observaciones: motivoLimpio,
                    tipo_ot: item.tipo_ot || 'Correctivo',
                    tipo_mantenimiento: item.tipo_ot || 'Correctivo',
                    sub_tipo: item.subtipo_ot || 'Mecánica General',
                    subtipo_ot: item.subtipo_ot || 'Mecánica General',
                    supervisor: supervisorStr,
                    tecnico_lider: supervisorStr,
                    tecnicos: Array.isArray(item.tecnicos) ? item.tecnicos : [tecnicosStr],
                    tecnicos_str: tecnicosStr,
                    rampa: id_rampa || rep.id_rampa || 'En Espera',
                    situacion_inicial: 'En Atención',
                    situacion: 'En Atención',
                    id_rampa: id_rampa || rep.id_rampa || 'En Espera',
                    sistema: item.subtipo_ot || 'Mecánica',
                    sistema_afectado: item.subtipo_ot || 'Mecánica',
                    id_reporte_falla: rep.id,
                    folio_reporte: rep.folio,
                    fecha_ingreso_rampa: fecha_ingreso || new Date(),
                    fecha_salida_estimada: fecha_salida || null
                };

                // Insertar OT en ordenes_trabajo con relación Padre-Hijo y detalles_json
                const sqlOt = `
                    INSERT INTO ordenes_trabajo (
                        ticket_entrada, id_ot, placa, estado, detalles_json, creado_por, fecha_ingreso
                    ) VALUES (?, ?, ?, 'Abierto', ?, ?, NOW());
                `;

                try {
                    const [resOt] = await tdb.promise().query(sqlOt, [
                        idOt,
                        idOt,
                        placa,
                        JSON.stringify(detallesObj),
                        creado_por || 'Sistema'
                    ]);

                    otsCreadas.push({ idOt, placa, unidad: item.unidad, tipo_ot: item.tipo_ot, subtipo_ot: item.subtipo_ot, supervisor: supervisorStr, tecnicos: tecnicosStr, id: resOt.insertId });

                    // Registrar en Módulo Status Rampa (tabla taller_rampas)
                    if (id_rampa && id_rampa !== 'En Ruta' && id_rampa !== 'En Espera') {
                        let fIngDate = fecha_ingreso ? fecha_ingreso.split('T')[0] : new Date().toISOString().split('T')[0];
                        let fIngTime = fecha_ingreso && fecha_ingreso.includes('T') ? fecha_ingreso.split('T')[1].substring(0, 5) : new Date().toTimeString().substring(0, 5);

                        let fSalDate = fecha_salida && fecha_salida.includes('T') ? fecha_salida.split('T')[0] : null;
                        let fSalTime = fecha_salida && fecha_salida.includes('T') ? fecha_salida.split('T')[1].substring(0, 5) : null;

                        const obsRampa = `[Reporte ${rep.folio}] OT ${idOt}: ${item.subtipo_ot || ''}`;

                        try {
                            const [existingRampa] = await tdb.promise().query(
                                "SELECT id FROM taller_rampas WHERE (rampa = ? OR placa = ?) AND estado != 'Liberado' LIMIT 1",
                                [id_rampa, placa]
                            );

                            if (existingRampa && existingRampa.length > 0) {
                                const rId = existingRampa[0].id;
                                await tdb.promise().query(
                                    `UPDATE taller_rampas SET rampa=?, placa=?, km=?, fecha_ingreso=?, hora_ingreso=?, fecha_salida=?, hora_salida=?, situacion='En atención', obs=?, creado_por=?, estado='Activo' WHERE id=?`,
                                    [id_rampa, placa, kmVal || null, fIngDate, fIngTime, fSalDate, fSalTime, obsRampa, creado_por || 'Sistema', rId]
                                );
                            } else {
                                await tdb.promise().query(
                                    `INSERT INTO taller_rampas (rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, creado_por, estado)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, 'En atención', ?, ?, 'Activo')`,
                                    [id_rampa, placa, kmVal || null, fIngDate, fIngTime, fSalDate, fSalTime, obsRampa, creado_por || 'Sistema']
                                );
                            }
                        } catch(eRampa) {
                            console.warn('Warning taller_rampas auto-sync:', eRampa.message);
                        }

                        // También sincronizar status_flota
                        const sqlRampa = `
                            INSERT INTO status_flota
                            (idRegistro, fecha, corte, unidad_motora, unidad_no_motora, cliente_motora, cliente_nomotora, zona, conductor, estado, observaciones, kilometraje, usuario)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 'Taller', ?, 'En Reparación', ?, ?, ?)
                            ON DUPLICATE KEY UPDATE
                            fecha=?, corte=VALUES(corte), unidad_motora=VALUES(unidad_motora), unidad_no_motora=VALUES(unidad_no_motora),
                            cliente_motora=VALUES(cliente_motora), cliente_nomotora=VALUES(cliente_nomotora), conductor=VALUES(conductor),
                            estado='En Reparación', observaciones=VALUES(observaciones), kilometraje=VALUES(kilometraje), usuario=VALUES(usuario);
                        `;
                        const fechaStatus = fIngDate;
                        const motoraVal = item.unidad === 'Tracto' ? placa : (rep.placa_tracto || '');
                        const nomotoraVal = (item.unidad === 'Remolque' || item.unidad === 'Carreta') ? placa : (rep.placa_remolque || '');

                        await tdb.promise().query(sqlRampa, [
                            `SF-${idOt}`,
                            fechaStatus,
                            id_rampa,
                            motoraVal,
                            nomotoraVal,
                            clienteNombre,
                            clienteNombre,
                            rep.conductor || '',
                            obsRampa,
                            kmVal,
                            creado_por || 'Sistema',
                            fechaStatus
                        ]).catch(e => console.warn('Warning Status Rampa auto-sync:', e.message));
                    }

                } catch(eOt) {
                    console.error('Error insertando OT:', eOt.message);
                    errorCreacion = eOt.message;
                }
            }

            if (otsCreadas.length > 0) {
                // Actualizar reporte de fallas
                const existingOts = [];
                try { existingOts.push(...JSON.parse(rep.ots_generadas_json || '[]')); } catch(e) {}
                const updatedOts = existingOts.concat(otsCreadas);

                tdb.query(
                    `UPDATE reportes_fallas SET estado = 'En Proceso', id_rampa = ?, ots_generadas_json = ? WHERE id = ?`,
                    [id_rampa || rep.id_rampa, JSON.stringify(updatedOts), idReporte],
                    () => {}
                );

                if (typeof broadcast === 'function') {
                    broadcast('checklist', 'actualizar');
                    broadcast('ordenes', 'crear');
                    broadcast('status', 'actualizar');
                }

                return res.json({ ok: true, otsCreadas, total: otsCreadas.length });
            } else {
                return res.status(500).json({ error: errorCreacion || 'No se pudieron crear las OTs' });
            }
        });
    });

    // ── DELETE /api/checklist/:id — Eliminar reporte de fallas ──────────
    router.delete('/:id', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        tdb.query('DELETE FROM reportes_fallas WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof broadcast === 'function') broadcast('checklist', 'eliminar');
            res.json({ ok: true });
        });
    });

    return router;
};
