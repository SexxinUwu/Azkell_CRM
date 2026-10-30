const express = require('express');
const { uploadToS3, getPresignedUrl, getPresignedUploadUrl, s3KeyFromUrl, urlPublicaDeKey } = require('../utils/s3');
const eventosNotif = require('../services/notificaciones_eventos');

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) { return req.db || db; }
    // Lista de fallas guardada (texto JSON o ya convertida); si no es una lista, vacía
    function aLista(v) {
        try { const p = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(p) ? p : []; } catch (e) { return []; }
    }

    // ── POST /api/checklist/evidencia-upload-url — Subida directa a S3 de fotos y videos del reporte (el archivo no pasa por el servidor) ──
    router.post('/evidencia-upload-url', async (req, res) => {
        try {
            const { fileName, fileType } = req.body || {};
            if (!fileName) return res.status(400).json({ error: 'fileName requerido' });
            const tipo = String(fileType || '');
            if (!/^(image|video)\//.test(tipo)) return res.status(400).json({ error: 'Solo se admiten fotos o videos' });
            const ext = (String(fileName).split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
            const key = `checklist/evidencia_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const uploadUrl = await getPresignedUploadUrl(key, tipo, 900);
            res.json({ uploadUrl, finalUrl: urlPublicaDeKey(key) });
        } catch (err) {
            console.error('Error generando URL de subida de evidencia:', err.message);
            res.status(500).json({ error: 'No se pudo generar la URL de subida' });
        }
    });

    // ── POST /api/checklist/presign-read — Firmar URLs de fotos y firma S3 ────
    router.post('/presign-read', async (req, res) => {
        const { urls } = req.body;
        if (!Array.isArray(urls) || !urls.length) return res.json({ ok: true, signed: {} });

        const signed = {};
        for (const url of urls) {
            const key = s3KeyFromUrl(url);
            if (key) {
                try { signed[url] = await getPresignedUrl(key, 3600); } catch(e) { signed[url] = url; }
            } else {
                signed[url] = url;
            }
        }
        res.json({ ok: true, signed });
    });

    // ── GET /api/checklist/ultimo-ingreso-seguridad — Obtener último ingreso de garita / seguridad ──
    router.get('/ultimo-ingreso-seguridad', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ ok: false, error: 'Base de datos no disponible' });

            const placa = (req.query.placa || '').toString().trim().toUpperCase();
            const pLimpia = placa.replace(/[^A-Z0-9]/ig, '');

            if (!pLimpia) {
                return res.json({ ok: true, data: null });
            }

            let dataResult = null;

            // 1. Prioridad: Buscar en seg_unidades_registros (último retorno o salida de seguridad)
            try {
                const sqlReg = `
                    SELECT 
                        id,
                        placa_tracto,
                        placa_carreta,
                        conductor,
                        destino,
                        retorno_km,
                        salida_km,
                        retorno_fecha,
                        salida_fecha,
                        retorno_hora,
                        salida_hora,
                        estado,
                        created_at,
                        updated_at
                    FROM seg_unidades_registros
                    WHERE (REPLACE(REPLACE(placa_tracto, '-', ''), ' ', '') = ? 
                       OR REPLACE(REPLACE(placa_carreta, '-', ''), ' ', '') = ?)
                    ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
                    LIMIT 1
                `;
                const [rowsReg] = await tdb.promise().query(sqlReg, [pLimpia, pLimpia]);
                if (rowsReg && rowsReg.length > 0) {
                    const r = rowsReg[0];
                    dataResult = {
                        placa_tracto: r.placa_tracto || null,
                        placa_carreta: r.placa_carreta || null,
                        conductor: r.conductor || null,
                        destino: r.destino || null,
                        procedencia: r.destino || null,
                        km: Number(r.retorno_km) || Number(r.salida_km) || null,
                        fecha: r.retorno_fecha || r.salida_fecha || null,
                        hora: r.retorno_hora || r.salida_hora || null,
                        fuente: 'seg_unidades_registros'
                    };
                }
            } catch (eReg) {
                console.warn('Error consultando seg_unidades_registros:', eReg.message);
            }

            // 2. Si no se encontró en seg_unidades_registros o faltan datos, chequear seg_unidades_base
            try {
                const sqlBase = `
                    SELECT 
                        id,
                        fecha,
                        corte,
                        placa_camion,
                        placa_carreta,
                        conductor,
                        zona,
                        estado,
                        observacion
                    FROM seg_unidades_base
                    WHERE (REPLACE(REPLACE(placa_camion, '-', ''), ' ', '') = ? 
                       OR REPLACE(REPLACE(placa_carreta, '-', ''), ' ', '') = ?)
                    ORDER BY fecha DESC, id DESC
                    LIMIT 1
                `;
                const [rowsBase] = await tdb.promise().query(sqlBase, [pLimpia, pLimpia]);
                if (rowsBase && rowsBase.length > 0) {
                    const b = rowsBase[0];
                    if (!dataResult) {
                        dataResult = {
                            placa_tracto: b.placa_camion || null,
                            placa_carreta: b.placa_carreta || null,
                            conductor: b.conductor || null,
                            zona: b.zona || null,
                            procedencia: b.zona || null,
                            km: null,
                            fecha: b.fecha || null,
                            fuente: 'seg_unidades_base'
                        };
                    } else {
                        if (!dataResult.placa_carreta && b.placa_carreta) dataResult.placa_carreta = b.placa_carreta;
                        if (!dataResult.conductor && b.conductor) dataResult.conductor = b.conductor;
                        if (!dataResult.procedencia && b.zona) dataResult.procedencia = b.zona;
                    }
                }
            } catch (eBase) {
                console.warn('Error consultando seg_unidades_base:', eBase.message);
            }

            // 3. Fallback adicional: Si aún no hay datos, consultar el último checklist registrado
            if (!dataResult) {
                try {
                    const sqlCk = `
                        SELECT placa_tracto, placa_carreta, conductor, procedencia, km_final, km_inicial
                        FROM reportes_fallas
                        WHERE (REPLACE(REPLACE(placa_tracto, '-', ''), ' ', '') = ?
                           OR REPLACE(REPLACE(placa_carreta, '-', ''), ' ', '') = ?)
                        ORDER BY fecha_reporte DESC, id DESC
                        LIMIT 1
                    `;
                    const [rowsCk] = await tdb.promise().query(sqlCk, [pLimpia, pLimpia]);
                    if (rowsCk && rowsCk.length > 0) {
                        const c = rowsCk[0];
                        dataResult = {
                            placa_tracto: c.placa_tracto || null,
                            placa_carreta: c.placa_carreta || null,
                            conductor: c.conductor || null,
                            procedencia: c.procedencia || null,
                            km: Number(c.km_final) || Number(c.km_inicial) || null,
                            fuente: 'reportes_fallas'
                        };
                    }
                } catch (eCk) {
                    console.warn('Error consultando reportes_fallas fallback:', eCk.message);
                }
            }

            return res.json({ ok: true, data: dataResult });
        } catch (err) {
            console.error('Error obteniendo último ingreso de seguridad:', err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── GET /api/checklist/buscar-viajes — Búsqueda ágil de órdenes de viaje (Marsisa / Genérico) ────
    router.get('/buscar-viajes', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ ok: false, error: 'Base de datos no disponible' });

            const { placa, q, limit } = req.query;
            const maxLimit = parseInt(limit, 10) || (placa ? 3 : 20);

            // Determinar si la empresa actual usa marsisa_ordenes_viaje o operaciones_ordenes_viaje
            let tablaViajes = 'operaciones_ordenes_viaje';
            try {
                const [mCheck] = await tdb.promise().query("SELECT COUNT(*) as c FROM marsisa_ordenes_viaje LIMIT 1");
                if (mCheck && mCheck[0] && mCheck[0].c > 0) {
                    tablaViajes = 'marsisa_ordenes_viaje';
                }
            } catch (eM) {
                tablaViajes = 'operaciones_ordenes_viaje';
            }

            let sql = `
                SELECT 
                    id,
                    viaje,
                    DATE_FORMAT(fecha_viaje, '%Y-%m-%d %H:%i') AS fecha_viaje,
                    DATE_FORMAT(fecha_viaje, '%d/%m/%Y %H:%i') AS fecha_viaje_fmt,
                    id_conductor,
                    conductor,
                    placa_tracto,
                    placa_remolque,
                    ruta,
                    origen,
                    destino,
                    estado
                FROM ${tablaViajes}
                WHERE 1=1
            `;
            const params = [];

            if (placa && String(placa).trim()) {
                const pLimpia = String(placa).trim().toUpperCase().replace(/[^A-Z0-9]/ig, '');
                sql += ` AND (REPLACE(placa_tracto, '-', '') = ? OR REPLACE(placa_remolque, '-', '') = ? OR placa_tracto LIKE ? OR placa_remolque LIKE ?)`;
                params.push(pLimpia, pLimpia, `%${pLimpia}%`, `%${pLimpia}%`);
            }

            if (q && String(q).trim()) {
                const search = `%${String(q).trim()}%`;
                sql += ` AND (viaje LIKE ? OR conductor LIKE ? OR placa_tracto LIKE ? OR placa_remolque LIKE ? OR ruta LIKE ? OR origen LIKE ? OR destino LIKE ?)`;
                params.push(search, search, search, search, search, search, search);
            }

            sql += ` ORDER BY fecha_viaje DESC, id DESC LIMIT ?`;
            params.push(maxLimit);

            const [rows] = await tdb.promise().query(sql, params);
            return res.json({ ok: true, tabla: tablaViajes, data: rows || [] });
        } catch (err) {
            console.error('Error buscando viajes para checklist:', err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── GET /api/checklist — Listar reportes de fallas ──────────────────
    router.get('/', (req, res) => {
        const tdb = getDb(req);
        // Rango de fechas (día de Lima). Sin fechas: del inicio del mes en curso a hoy.
        const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
        const inicioMes = `${hoy.slice(0, 7)}-01`;
        const fechaValida = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '');
        const desde = fechaValida(req.query.desde) ? req.query.desde : inicioMes;
        const hasta = fechaValida(req.query.hasta) ? req.query.hasta : hoy;
        const sql = `
            SELECT rf.id, rf.folio, rf.orden_viaje, DATE_FORMAT(rf.fecha_reporte, '%Y-%m-%d %H:%i:%s') AS fecha_reporte, rf.placa_tracto, rf.placa_remolque, rf.km_inicial, rf.km_final, rf.horas_motor,
                   rf.conductor, rf.procedencia, rf.ubicacion_gps, rf.fallas_tracto_json, rf.fallas_remolque_json, rf.fallas_libres_text,
                   rf.fotos_json, rf.firma_conductor, rf.estado, rf.id_rampa, rf.ots_generadas_json, rf.creado_por,
                   DATE_FORMAT(rf.creado_en, '%Y-%m-%d %H:%i:%s') AS creado_en,
                   COALESCE(p1.cliente, '') AS empresa_tracto,
                   COALESCE(p2.cliente, '') AS empresa_remolque,
                   COALESCE(NULLIF(p1.cliente, ''), NULLIF(p2.cliente, ''), '') AS empresa
            FROM reportes_fallas rf
            LEFT JOIN placas p1 ON REPLACE(REPLACE(rf.placa_tracto, '-', ''), ' ', '') = REPLACE(REPLACE(p1.placa, '-', ''), ' ', '')
            LEFT JOIN placas p2 ON REPLACE(REPLACE(rf.placa_remolque, '-', ''), ' ', '') = REPLACE(REPLACE(p2.placa, '-', ''), ' ', '')
            WHERE DATE(rf.fecha_reporte) BETWEEN ? AND ?
            ORDER BY rf.id DESC;
        `;
        tdb.query(sql, [desde, hasta], async (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows || !rows.length) return res.json([]);

            try {
                const [otRows] = await tdb.promise().query("SELECT ticket_entrada, id_ot, estado, detalles_json FROM ordenes_trabajo");
                
                rows.forEach(r => {
                    let otsArr = [];
                    try { otsArr = typeof r.ots_generadas_json === 'string' ? JSON.parse(r.ots_generadas_json) : (r.ots_generadas_json || []); } catch(e){}
                    if (!Array.isArray(otsArr)) otsArr = [];

                    const otsActivasEnBd = (otRows || []).filter(o => {
                        let d = {};
                        try { d = typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : (o.detalles_json || {}); } catch(e){}
                        const oId = String(o.ticket_entrada || o.id_ot || '').trim();
                        const isMatchOt = otsArr.some(otItem => String(otItem.idOt || otItem.ticket_entrada || '').trim() === oId);
                        const isMatchRep = (d.id_reporte_falla && String(d.id_reporte_falla) === String(r.id)) || 
                                           (d.folio_reporte && String(d.folio_reporte) === String(r.folio));
                        return isMatchOt || isMatchRep;
                    });

                    if (otsActivasEnBd.length === 0) {
                        if (r.estado !== 'Pendiente') {
                            r.estado = 'Pendiente';
                        }
                    } else {
                        const FINISHED_STATUSES = ['finalizado', 'finalizada', 'cerrada', 'cerrado', 'completada', 'completado', 'terminada', 'terminado', 'anulado', 'anulada'];
                        const todasFinalizadas = otsActivasEnBd.every(o => {
                            const st = String(o.estado || '').toLowerCase().trim();
                            return FINISHED_STATUSES.includes(st);
                        });

                        const nuevoEstado = todasFinalizadas ? 'Finalizado' : 'En Proceso';
                        if (r.estado !== nuevoEstado) {
                            r.estado = nuevoEstado;
                        }
                    }
                });
            } catch(eSync) {
                console.warn('Sync reportes_fallas state warning:', eSync.message);
            }

            res.json(rows);
        });
    });

    // ── PLANTILLAS PREDETERMINADAS DE SISTEMAS Y FALLAS (ISO F-MAN-001) ──
    const DEFAULT_CONFIG_TRACTO = [
        {
            key: 'motor',
            title: 'MOTOR',
            icon: 'bi-gear-fill',
            items: [
                '01 Nivel de aceite motor', '02 Fugas de fluidos', '03 Filtro de aire', '04 Pérdida de potencia',
                '05 Compresora de aire', '06 Fajas, poleas, templadores', '07 Turbo', '08 Múltiple de escape',
                '09 Silenciador', '10 Cañerías de combustible'
            ]
        },
        {
            key: 'caja',
            title: 'CAJA - CORONAS',
            icon: 'bi-gear-wide-connected',
            items: [
                '11 Embrague', '12 Palanca de cambios', '13 Freno de Motor', '14 Ruido en la caja de cambios',
                '15 Ruido en las coronas', '16 Retenes de Corona', '17 Templadores, soportes', '18 Cardan y crucetas'
            ]
        },
        {
            key: 'refri',
            title: 'REFRIGERACION',
            icon: 'bi-thermometer-half',
            items: [
                '19 Nivel de refrigerante', '20 Fugas de refrigerante', '21 Tanque de expansión', '22 Temperatura elevada',
                '23 Radiador, intercooler', '24 Bomba de agua'
            ]
        },
        {
            key: 'direccion',
            title: 'DIRECCION',
            icon: 'bi-compass',
            items: [
                '25 Alineamiento y balanceo', '26 Servo, Sist. hidráulico', '27 Caja de dirección', '28 Barras y terminales'
            ]
        },
        {
            key: 'cabina',
            title: 'CABINA Y CHASIS',
            icon: 'bi-truck-front',
            items: [
                '29 Tablero', '30 Lunas y parabrisas', '31 Suspensión de asiento', '32 Cinturones de seguridad',
                '33 Tablero e instrumentos', '34 Amortiguadores', '35 Tanques de combustible', '36 Puertas y manijas',
                '37 Timón', '38 Espejos laterales', '39 Soportes de cabina', '40 Control veloc. Crucero',
                '41 Accesorios en general', '42 Autoradio y antenas', '43 Quinta rueda', '44 OTROS'
            ]
        }
    ];

    const DEFAULT_CONFIG_REMOLQUE = [
        {
            key: 'frenos',
            title: 'FRENOS',
            icon: 'bi-hand-index-thumb',
            items: [
                '39 Revisar Zapatos', '40 Pulpo de Freno', '41 Tanque de Aire, líneas de aire', '42 Fugas de aire',
                '43 Secador de aire', '44 Rachet de Freno'
            ]
        },
        {
            key: 'carreta',
            title: 'CARRETA',
            icon: 'bi-truck-flatbed',
            items: [
                '45 Estado de triplay', '46 Estado de gebes de Puerta', '47 Filtración de Agua', '48 Pisos sin Oxido',
                '49 Tiro de Remolque', '50 Templadores, Muelles y Soporte'
            ]
        },
        {
            key: 'electrico',
            title: 'SISTEMA ELECTRICO',
            icon: 'bi-lightning-charge',
            items: [
                '51 Luces en general', '52 Faros delanteros', '53 Neblineros', '54 Claxon, alarma de retroceso',
                '55 Trico y plumillas', '56 Baterías y bornes', '57 Testigos check engine', '58 Testigos ABS',
                '59 Aire acondicionado', '60 Calefacción', '61 Cortador de corriente', '62 Circulina', '63 Faro pirata'
            ]
        },
        {
            key: 'suspension',
            title: 'SUSPENSION',
            icon: 'bi-arrows-expand',
            items: [
                '64 Amortiguadores', '65 Bolsas de aire', '66 Reg. de bolsas de aire', '67 Muelles y grilletes',
                '68 Abrazaderas y bujes', '69 Templador, balancines'
            ]
        },
        {
            key: 'furgon',
            title: 'FURGON',
            icon: 'bi-box-seam',
            items: [
                '70 Remaches de Triplay', '71 Filtraciones de Agua', '72 Gebes de Puerta', '73 Piso sin oxido', '74 Bisagras de puerta'
            ]
        },
        {
            key: 'llantas',
            title: 'LLANTAS',
            icon: 'bi-vinyl',
            items: [
                '75 Reparación de Llantas', '76 Tuercas flojas', '77 Pernos rotos', '78 Rueda frenada',
                '79 Llantas bajas', '80 Desgaste irregular'
            ]
        },
        {
            key: 'termoking',
            title: 'TERMOKING',
            icon: 'bi-snow',
            items: [
                '81 Encendido / Batería', '82 Nivel de aceite motor diésel', '83 Temperatura programada / Setpoint',
                '84 Correas y poleas', '85 Fugas de refrigerante / combustible', '86 Alarmas en panel de control'
            ]
        }
    ];

    // ── GET /api/checklist/config-sistemas — Obtener sistemas y fallas configurados ────
    router.get('/config-sistemas', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ ok: false, error: 'Base de datos no disponible' });

            const [rows] = await tdb.promise().query(
                `SELECT * FROM checklist_config_sistemas ORDER BY unidad ASC, orden ASC, id ASC`
            );

            if (!rows || rows.length === 0) {
                return res.json({
                    ok: true,
                    personalizado: false,
                    tracto: DEFAULT_CONFIG_TRACTO,
                    remolque: DEFAULT_CONFIG_REMOLQUE
                });
            }

            const tracto = [];
            const remolque = [];

            rows.forEach(r => {
                let parsedItems = [];
                try {
                    parsedItems = typeof r.items_json === 'string' ? JSON.parse(r.items_json) : (r.items_json || []);
                } catch(e) {
                    parsedItems = [];
                }
                const obj = {
                    key: r.sistema_key,
                    title: r.titulo,
                    icon: r.icono || 'bi-gear-fill',
                    items: Array.isArray(parsedItems) ? parsedItems : []
                };

                if (r.unidad === 'remolque') {
                    remolque.push(obj);
                } else {
                    tracto.push(obj);
                }
            });

            res.json({
                ok: true,
                personalizado: true,
                tracto: tracto.length > 0 ? tracto : DEFAULT_CONFIG_TRACTO,
                remolque: remolque.length > 0 ? remolque : DEFAULT_CONFIG_REMOLQUE
            });
        } catch (err) {
            console.error('Error al obtener config sistemas checklist:', err);
            res.status(500).json({ ok: false, error: err.message, tracto: DEFAULT_CONFIG_TRACTO, remolque: DEFAULT_CONFIG_REMOLQUE });
        }
    });

    // ── POST /api/checklist/config-sistemas — Guardar configuración personalizada ────
    router.post('/config-sistemas', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ ok: false, error: 'Base de datos no disponible' });

            const { tracto, remolque } = req.body;
            if (!Array.isArray(tracto) && !Array.isArray(remolque)) {
                return res.status(400).json({ ok: false, error: 'Se requieren las listas de sistemas para tracto o remolque.' });
            }

            // Limpiar configuración previa y re-insertar
            await tdb.promise().query(`DELETE FROM checklist_config_sistemas`);

            const insertSql = `
                INSERT INTO checklist_config_sistemas (unidad, sistema_key, titulo, icono, orden, items_json)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            if (Array.isArray(tracto)) {
                for (let i = 0; i < tracto.length; i++) {
                    const s = tracto[i];
                    if (!s || !s.title) continue;
                    const sysKey = (s.key || s.title.toLowerCase().replace(/[^a-z0-9]/g, '_')).slice(0, 50);
                    const itemsArr = Array.isArray(s.items) ? s.items.filter(it => it && String(it).trim()) : [];
                    await tdb.promise().query(insertSql, [
                        'tracto',
                        sysKey,
                        String(s.title).trim().toUpperCase(),
                        s.icon || 'bi-gear-fill',
                        i,
                        JSON.stringify(itemsArr)
                    ]);
                }
            }

            if (Array.isArray(remolque)) {
                for (let i = 0; i < remolque.length; i++) {
                    const s = remolque[i];
                    if (!s || !s.title) continue;
                    const sysKey = (s.key || s.title.toLowerCase().replace(/[^a-z0-9]/g, '_')).slice(0, 50);
                    const itemsArr = Array.isArray(s.items) ? s.items.filter(it => it && String(it).trim()) : [];
                    await tdb.promise().query(insertSql, [
                        'remolque',
                        sysKey,
                        String(s.title).trim().toUpperCase(),
                        s.icon || 'bi-gear-fill',
                        i,
                        JSON.stringify(itemsArr)
                    ]);
                }
            }

            if (typeof logAudit === 'function') {
                logAudit(req, 'CONFIG_CHECKLIST_SISTEMAS', 'Actualización de sistemas y fallas del Checklist');
            }
            if (typeof broadcast === 'function') broadcast('checklist', 'config_actualizada');

            res.json({ ok: true, mensaje: 'Configuración de sistemas y fallas guardada exitosamente.' });
        } catch (err) {
            console.error('Error al guardar config sistemas checklist:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── POST /api/checklist/config-sistemas/restaurar — Restaurar a valores predeterminados ────
    router.post('/config-sistemas/restaurar', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ ok: false, error: 'Base de datos no disponible' });

            await tdb.promise().query(`DELETE FROM checklist_config_sistemas`);

            if (typeof logAudit === 'function') {
                logAudit(req, 'CONFIG_CHECKLIST_RESTAURAR', 'Restauración de sistemas y fallas predeterminados');
            }
            if (typeof broadcast === 'function') broadcast('checklist', 'config_actualizada');

            res.json({
                ok: true,
                mensaje: 'Configuración restaurada a los valores predeterminados de fábrica.',
                tracto: DEFAULT_CONFIG_TRACTO,
                remolque: DEFAULT_CONFIG_REMOLQUE
            });
        } catch (err) {
            console.error('Error al restaurar config sistemas checklist:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── GET /api/checklist/:id — Detalle completo de un reporte ────────
    router.get('/:id', (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        const sqlSingle = `
            SELECT rf.*,
                   COALESCE(p1.cliente, '') AS empresa_tracto,
                   COALESCE(p2.cliente, '') AS empresa_remolque,
                   COALESCE(NULLIF(p1.cliente, ''), NULLIF(p2.cliente, ''), '') AS empresa
            FROM reportes_fallas rf
            LEFT JOIN placas p1 ON REPLACE(REPLACE(rf.placa_tracto, '-', ''), ' ', '') = REPLACE(REPLACE(p1.placa, '-', ''), ' ', '')
            LEFT JOIN placas p2 ON REPLACE(REPLACE(rf.placa_remolque, '-', ''), ' ', '') = REPLACE(REPLACE(p2.placa, '-', ''), ' ', '')
            WHERE rf.id = ?;
        `;
        tdb.query(sqlSingle, [id], async (err, rows) => {
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

    // ── POST /api/checklist — Crear o Anexar reporte de fallas ────────────
    router.post('/', async (req, res) => {
        const tdb = getDb(req);
        const {
            orden_viaje, placa_tracto, placa_remolque, km_inicial, km_final,
            conductor, procedencia, ubicacion_gps,
            fallas_tracto, fallas_remolque, fallas_libres_text,
            fotos_base64, firma_conductor, creado_por,
            anexar_si_existe, falla_critica
        } = req.body;

        const ordenViajeClean = (orden_viaje || '').trim();
        let kmInicialNum = parseInt(km_inicial, 10) || 0;
        let kmFinalNum = parseInt(km_final, 10) || 0;
        const critica = [true, 1, '1', 'true'].includes(falla_critica) ? 1 : 0;

        // Regla: una placa con reporte pendiente o en taller no admite otro reporte hasta que todos sus reportes estén finalizados
        const placasNuevas = [placa_tracto, placa_remolque].map(p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean);
        if (placasNuevas.length) {
            try {
                const [abiertos] = await tdb.promise().query(
                    `SELECT folio, placa_tracto, placa_remolque, estado FROM reportes_fallas
                     WHERE (estado IS NULL OR estado <> 'Finalizado')
                       AND (UPPER(REPLACE(REPLACE(placa_tracto, '-', ''), ' ', '')) IN (?) OR UPPER(REPLACE(REPLACE(placa_remolque, '-', ''), ' ', '')) IN (?))
                     ORDER BY id DESC LIMIT 1`,
                    [placasNuevas, placasNuevas]
                );
                if (abiertos.length) {
                    const f = abiertos[0];
                    const norm = x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const placa = placasNuevas.find(p => p === norm(f.placa_tracto) || p === norm(f.placa_remolque));
                    return res.status(409).json({
                        ok: false,
                        error: `La placa ${placa} tiene el reporte ${f.folio} (${f.estado || 'Pendiente'}). No se puede generar otro reporte hasta que todos los de esa placa estén finalizados.`,
                    });
                }
            } catch (e) {
                return res.status(500).json({ ok: false, error: e.message });
            }
        }

        // Si km no fue ingresado, consultar el kilometraje actual del tracto automáticamente
        if (!kmInicialNum && placa_tracto) {
            try {
                const pLimpia = String(placa_tracto).trim().toUpperCase().replace(/[^A-Z0-9]/ig, '');
                const [flotaRows] = await tdb.promise().query(
                    `SELECT km_actual, kilometraje, km FROM disponibilidad_flota WHERE REPLACE(placa, '-', '') = ? OR placa LIKE ? LIMIT 1`,
                    [pLimpia, `%${pLimpia}%`]
                );
                if (flotaRows && flotaRows.length > 0) {
                    kmInicialNum = parseInt(flotaRows[0].km_actual || flotaRows[0].kilometraje || flotaRows[0].km, 10) || 0;
                }
            } catch (eKm) {}
        }
        if (!kmFinalNum && kmInicialNum) {
            kmFinalNum = kmInicialNum;
        }

        // Si se solicita anexar por viaje existente y hay orden de viaje:
        if (anexar_si_existe && ordenViajeClean) {
            tdb.query(
                `SELECT * FROM reportes_fallas WHERE orden_viaje = ? AND estado != 'Finalizado' ORDER BY id DESC LIMIT 1`,
                [ordenViajeClean],
                async (errFind, rowsFind) => {
                    if (!errFind && rowsFind && rowsFind.length > 0) {
                        const repExistente = rowsFind[0];
                        const folio = repExistente.folio;

                        // Combinar fallas de tracto
                        let exFallasT = [];
                        try {
                            if (repExistente.fallas_tracto_json) {
                                exFallasT = typeof repExistente.fallas_tracto_json === 'string' ? JSON.parse(repExistente.fallas_tracto_json) : repExistente.fallas_tracto_json;
                            }
                        } catch(e) {}
                        if (!Array.isArray(exFallasT)) exFallasT = [];
                        const nuevasFallasT = Array.isArray(fallas_tracto) ? fallas_tracto : [];
                        const mergedFallasT = [...exFallasT, ...nuevasFallasT];

                        // Combinar fallas de remolque
                        let exFallasR = [];
                        try {
                            if (repExistente.fallas_remolque_json) {
                                exFallasR = typeof repExistente.fallas_remolque_json === 'string' ? JSON.parse(repExistente.fallas_remolque_json) : repExistente.fallas_remolque_json;
                            }
                        } catch(e) {}
                        if (!Array.isArray(exFallasR)) exFallasR = [];
                        const nuevasFallasR = Array.isArray(fallas_remolque) ? fallas_remolque : [];
                        const mergedFallasR = [...exFallasR, ...nuevasFallasR];

                        // Combinar fotos
                        let fotosUrls = [];
                        try {
                            if (repExistente.fotos_json) {
                                const parsed = JSON.parse(repExistente.fotos_json);
                                if (Array.isArray(parsed)) fotosUrls = parsed;
                            }
                        } catch(e) {}

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
                                        console.error('⚠️ Error subiendo foto S3 al anexar:', eS3.message);
                                    }
                                } else if (typeof item === 'string' && item.startsWith('http') && !fotosUrls.includes(item)) {
                                    fotosUrls.push(item);
                                }
                            }
                        }

                        const updateSql = `
                            UPDATE reportes_fallas SET
                                fallas_tracto_json = ?,
                                fallas_remolque_json = ?,
                                fotos_json = ?,
                                km_inicial = CASE WHEN COALESCE(km_inicial, 0) = 0 THEN ? ELSE km_inicial END,
                                km_final = GREATEST(COALESCE(km_final, 0), ?),
                                firma_conductor = COALESCE(?, firma_conductor),
                                critica = GREATEST(COALESCE(critica, 0), ?)
                            WHERE id = ?
                        `;

                        tdb.query(
                            updateSql,
                            [
                                JSON.stringify(mergedFallasT),
                                JSON.stringify(mergedFallasR),
                                JSON.stringify(fotosUrls),
                                kmInicialNum,
                                kmFinalNum || kmInicialNum,
                                firma_conductor || null,
                                critica,
                                repExistente.id
                            ],
                            async (errUpd) => {
                                if (errUpd) return res.status(500).json({ error: errUpd.message });

                                await syncReporteConOTsYRampas(
                                    tdb, repExistente.id, folio,
                                    repExistente.placa_tracto,
                                    repExistente.placa_remolque,
                                    mergedFallasT,
                                    mergedFallasR,
                                    fallas_libres_text || repExistente.fallas_libres_text,
                                    broadcast
                                );

                                if (critica) {
                                    await abrirBacklogFallaCritica(tdb, {
                                        folio, placa: repExistente.placa_tracto, km: kmFinalNum || kmInicialNum,
                                        descripcion: textoFallasCriticas([mergedFallasT, mergedFallasR], fallas_libres_text || repExistente.fallas_libres_text),
                                        reportadoPor: creado_por,
                                    }).catch(e => console.error('Backlog falla crítica:', e.message));
                                }
                                return res.json({ ok: true, id: repExistente.id, folio, anexado: true, fotos: fotosUrls });
                            }
                        );
                        return;
                    }
                    // Si no existe reporte previo, proceder a crearlo abajo
                    procederCrearNuevoReporte();
                }
            );
            return;
        }

        procederCrearNuevoReporte();

        function procederCrearNuevoReporte() {
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
                    folio, orden_viaje, placa_tracto, placa_remolque, km_inicial, km_final, horas_motor,
                    conductor, procedencia, ubicacion_gps,
                    fallas_tracto_json, fallas_remolque_json, fallas_libres_text,
                    fotos_json, firma_conductor, critica, estado, creado_por, fecha_reporte, creado_en
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?, CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-05:00'), CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-05:00'));
                `;

                const values = [
                    folio,
                    (orden_viaje || '').trim() || null,
                    (placa_tracto || '').trim().toUpperCase(),
                    (placa_remolque || '').trim().toUpperCase(),
                    kmInicialNum,
                    kmFinalNum || kmInicialNum,
                    (req.body.horas_motor || '').trim() || null,
                    (conductor || '').trim(),
                    (procedencia || '').trim(),
                    (ubicacion_gps || '').trim(),
                    JSON.stringify(fallas_tracto || []),
                    JSON.stringify(fallas_remolque || []),
                    (fallas_libres_text || '').trim(),
                    JSON.stringify(fotosUrls),
                    firma_conductor || null,
                    critica,
                    creado_por || (req.user && req.user.nombre) || 'Sistema'
                ];

                tdb.query(sql, values, async (errIns, result) => {
                    if (errIns) return res.status(500).json({ error: errIns.message });

                    await syncReporteConOTsYRampas(
                        tdb, result.insertId, folio,
                        placa_tracto, placa_remolque,
                        fallas_tracto, fallas_remolque,
                        fallas_libres_text,
                        broadcast
                    );

                    if (critica) {
                        await abrirBacklogFallaCritica(tdb, {
                            folio, placa: (placa_tracto || '').trim().toUpperCase(), km: kmFinalNum || kmInicialNum,
                            descripcion: textoFallasCriticas([fallas_tracto || [], fallas_remolque || []], fallas_libres_text),
                            reportadoPor: creado_por,
                        }).catch(e => console.error('Backlog falla crítica:', e.message));
                    }
                    if (typeof broadcast === 'function') broadcast('checklist', 'crear');
                    if (typeof logAudit === 'function') {
                        logAudit(req, 'MANTENIMIENTO', 'Checklist', 'CREÓ', `Creó Reporte de Fallas ${folio} para ${placa_tracto || ''} ${placa_remolque ? '/ ' + placa_remolque : ''}`);
                    }
                    res.json({ ok: true, id: result.insertId, folio, fotos: fotosUrls });
                });
            }
        );
    }
});

    // ── POST /api/checklist/:id/generar-ots — Generar OTs e integrar con Status Rampa ──
    const handleGenerarOTs = (req, res) => {
        const tdb = getDb(req);
        const idReporte = req.params.id || req.body.id_reporte;
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
            try {
                if (rep.fallas_tracto_json) {
                    fallasTracto = typeof rep.fallas_tracto_json === 'string' ? JSON.parse(rep.fallas_tracto_json) : rep.fallas_tracto_json;
                } else if (rep.fallas_tracto) {
                    fallasTracto = typeof rep.fallas_tracto === 'string' ? JSON.parse(rep.fallas_tracto) : rep.fallas_tracto;
                }
            } catch(e) {}
            if (!Array.isArray(fallasTracto)) fallasTracto = [];

            try {
                if (rep.fallas_remolque_json) {
                    fallasRemolque = typeof rep.fallas_remolque_json === 'string' ? JSON.parse(rep.fallas_remolque_json) : rep.fallas_remolque_json;
                } else if (rep.fallas_remolque) {
                    fallasRemolque = typeof rep.fallas_remolque === 'string' ? JSON.parse(rep.fallas_remolque) : rep.fallas_remolque;
                }
            } catch(e) {}
            if (!Array.isArray(fallasRemolque)) fallasRemolque = [];

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
                const esObsGen = txt => {
                    if (!txt) return true;
                    const up = String(txt).trim().toUpperCase();
                    return up === 'OBSERVADO EN CHECKLIST' || up === 'OBSERVACION REPORTADA' || up === 'OBSERVACIÓN REPORTADA' 
                        || up === 'FALLA OBSERVADA' || up === 'FALLA REPORTADA' || up === 'SIN OBSERVACIÓN' || up === 'SIN OBSERVACION'
                        || up === 'OBSERVACIÓN' || up === 'OBSERVACION';
                };

                // Una misma falla (mismo ítem y observación) entra una sola vez: el reporte puede traerla repetida
                if (Array.isArray(item.motivos_array)) {
                    const vistosMotivo = new Set();
                    item.motivos_array = item.motivos_array.filter(m => {
                        const clave = `${m.item || ''}|${m.obs || m.descripcion || m.motivo || ''}`.trim().toLowerCase();
                        if (vistosMotivo.has(clave)) return false;
                        vistosMotivo.add(clave);
                        return true;
                    });
                }

                if (Array.isArray(item.motivos_array) && item.motivos_array.length > 0) {
                    descFallasClean = item.motivos_array.map(m => {
                        const rawItem = String(m.item || '').replace(/^\[[^\]]+\]\s*/, '').replace(/^[A-Z0-9\s]+—\s*/i, '').replace(/^[•\-\*]\s*/, '').trim();
                        const itemClean = rawItem.replace(/^\d+[\.\)\-]?\s*/, '').trim() || rawItem;
                        const obsClean = String(m.obs || m.descripcion || m.motivo || '').replace(/^\[[^\]]+\]\s*/, '').replace(/^[A-Z0-9\s]+—\s*/i, '').replace(/^[•\-\*]\s*/, '').trim();

                        let line = itemClean;
                        if (obsClean && !esObsGen(obsClean) && obsClean.toLowerCase() !== itemClean.toLowerCase()) {
                            line = itemClean ? `${itemClean} : ${obsClean}` : obsClean;
                        } else if (!itemClean && obsClean) {
                            line = obsClean;
                        }
                        return `• ${line}`;
                    }).join('\n');
                } else if (Array.isArray(item.fallas_seleccionadas) && item.fallas_seleccionadas.length > 0) {
                    descFallasClean = item.fallas_seleccionadas.map(f => {
                        let clean = String(f)
                            .replace(/^\[[^\]]+\]\s*/, '')
                            .replace(/^[A-Z0-9\s]+—\s*/i, '')
                            .replace(/^(Falla Manual|MANUAL):\s*/i, '')
                            .replace(/^[•\-\*]\s*/, '')
                            .trim();
                        if (clean.includes(':')) {
                            const parts = clean.split(':');
                            const itm = parts[0].replace(/^\d+[\.\)\-]?\s*/, '').trim();
                            const obs = parts.slice(1).join(':').trim();
                            clean = (itm && obs) ? `${itm} : ${obs}` : (itm || obs);
                        } else {
                            clean = clean.replace(/^\d+[\.\)\-]?\s*/, '').trim();
                        }
                        return `• ${clean}`;
                    }).join('\n');
                } else {
                    const isRemolque = (item.unidad === 'Remolque' || item.unidad === 'Carreta' || (rep.placa_remolque && placa === rep.placa_remolque));
                    let itemsFalla = isRemolque ? fallasRemolque : fallasTracto;
                    if (!Array.isArray(itemsFalla) || itemsFalla.length === 0) {
                        itemsFalla = fallasTracto.concat(fallasRemolque);
                    }
                    if (Array.isArray(itemsFalla) && itemsFalla.length > 0) {
                        descFallasClean = itemsFalla.map(f => {
                            const rawItem = String(f.item || '').replace(/^\[[^\]]+\]\s*/, '').replace(/^[A-Z0-9\s]+—\s*/i, '').replace(/^[•\-\*]\s*/, '').trim();
                            const itemClean = rawItem.replace(/^\d+[\.\)\-]?\s*/, '').trim() || rawItem;
                            const obsClean = String(f.obs || f.descripcion || '').replace(/^\[[^\]]+\]\s*/, '').replace(/^[A-Z0-9\s]+—\s*/i, '').replace(/^[•\-\*]\s*/, '').trim();

                            let line = itemClean;
                            if (obsClean && !esObsGen(obsClean) && obsClean.toLowerCase() !== itemClean.toLowerCase()) {
                                line = itemClean ? `${itemClean} : ${obsClean}` : obsClean;
                            } else if (!itemClean && obsClean) {
                                line = obsClean;
                            }
                            return `• ${line}`;
                        }).join('\n');
                    }
                }

                if (item.trabajo_custom) {
                    descFallasClean += (descFallasClean ? '\n' : '') + `• ${item.trabajo_custom}`;
                } else if (rep.fallas_libres_text && (!item.fallas_seleccionadas || !item.fallas_seleccionadas.length)) {
                    descFallasClean += (descFallasClean ? '\n' : '') + `• ${rep.fallas_libres_text}`;
                }

                // Una misma falla aparece una sola vez (tracto y remolque pueden traer el mismo ítem)
                descFallasClean = [...new Set(descFallasClean.split('\n').filter(Boolean))].join('\n');

                const motivoLimpio = descFallasClean
                    ? `[Reporte ${rep.folio}]\n${descFallasClean}`
                    : `[Reporte ${rep.folio}] ${item.subtipo_ot || 'Falla reportada'}`;

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

                const kmVal = (item.km !== undefined && item.km !== null && item.km !== '') ? Number(item.km) : (item.unidad === 'Tracto' ? (rep.km_inicial || 0) : 0);
                const kmTableroVal = (item.km_tablero !== undefined && item.km_tablero !== null && item.km_tablero !== '') 
                    ? Number(item.km_tablero) 
                    : (item.unidad === 'Tracto' ? (rep.km_inicial || kmVal || 0) : (kmVal || 0));
                let kmGpsVal = (item.km_gps !== undefined && item.km_gps !== null && item.km_gps !== '') ? Number(item.km_gps) : null;

                if (!kmGpsVal && placa) {
                    try {
                        const [snapRows] = await tdb.promise().query(
                            'SELECT km_gps FROM km_snapshots WHERE (REPLACE(placa, "-", "") = ? OR placa = ?) ORDER BY fecha DESC LIMIT 1',
                            [placa.replace(/[^A-Z0-9]/ig, ''), placa]
                        );
                        if (snapRows && snapRows.length && snapRows[0].km_gps > 0) {
                            kmGpsVal = snapRows[0].km_gps;
                        }
                    } catch(eSnap) {}
                }

                const horasMotorVal = (item.horas_motor !== undefined && item.horas_motor !== null && item.horas_motor !== '') ? item.horas_motor : ((item.unidad === 'Remolque' || item.unidad === 'Carreta') ? rep.horas_motor : null) || null;

                const motivosArray = Array.isArray(item.motivos_array) ? item.motivos_array : [];

                // Un trabajo por falla, con el técnico asignado a esa falla (si no tiene, el de la OT)
                const tecnicoOT = (Array.isArray(item.tecnicos) && item.tecnicos[0]) || item.supervisor || '';
                const trabajosDet = descFallasClean.split('\n').filter(Boolean).map((linea, idx) => ({
                    desc: linea.replace(/^•\s*/, ''),
                    tecnico: (motivosArray[idx] && (motivosArray[idx].tecnico || motivosArray[idx].tecnico_nombre)) || tecnicoOT,
                }));

                const situacionVal = item.situacion || 'En atención';

                let fIngDate = fecha_ingreso ? fecha_ingreso.split('T')[0] : new Date().toISOString().split('T')[0];
                let fIngTime = fecha_ingreso && fecha_ingreso.includes('T') ? fecha_ingreso.split('T')[1].substring(0, 5) : new Date().toTimeString().substring(0, 5);
                let dtIngreso = `${fIngDate} ${fIngTime}:00`;

                let fSalDate = fecha_salida && fecha_salida.includes('T') ? fecha_salida.split('T')[0] : null;
                let fSalTime = fecha_salida && fecha_salida.includes('T') ? fecha_salida.split('T')[1].substring(0, 5) : null;
                let dtSalida = fSalDate && fSalTime ? `${fSalDate} ${fSalTime}:00` : null;

                const detallesObj = {
                    cliente: clienteNombre,
                    ruc_dni: rucDni,
                    km: kmTableroVal || kmVal,
                    km_tablero: kmTableroVal || kmVal,
                    km_gps: kmGpsVal || 0,
                    horas_motor: horasMotorVal,
                    conductor: rep.conductor || '',
                    chofer: rep.conductor || '',
                    reportado_por: rep.conductor || '',
                    motivo: motivoLimpio,
                    motivos_array: motivosArray,
                    trabajos_det: trabajosDet,
                    observaciones: motivoLimpio,
                    descripcion_falla: descFallasClean || (item.subtipo_ot || 'Falla'),
                    tipo_ot: item.tipo_ot || 'Correctivo',
                    tipo_mantenimiento: item.tipo_ot || 'Correctivo',
                    sub_tipo: item.subtipo_ot || 'Mecánica General',
                    subtipo_ot: item.subtipo_ot || 'Mecánica General',
                    supervisor: supervisorStr,
                    tecnico_lider: supervisorStr,
                    tecnicos: Array.isArray(item.tecnicos) ? item.tecnicos : [tecnicosStr],
                    tecnicos_str: tecnicosStr,
                    rampa: id_rampa || rep.id_rampa || 'En Espera',
                    situacion_inicial: situacionVal,
                    situacion: situacionVal,
                    id_rampa: id_rampa || rep.id_rampa || 'En Espera',
                    sistema: item.subtipo_ot || 'Mecánica',
                    sistema_afectado: item.subtipo_ot || 'Mecánica',
                    id_reporte_falla: rep.id,
                    folio_reporte: rep.folio,
                    fecha_ingreso: dtIngreso,
                    fecha_inicio_ot: dtIngreso,
                    fecha_hora_salida: dtSalida,
                    fecha_ingreso_rampa: dtIngreso,
                    fecha_salida_estimada: dtSalida
                };

                // Insertar OT en ordenes_trabajo con relación Padre-Hijo y detalles_json
                const sqlOt = `
                    INSERT INTO ordenes_trabajo (
                        ticket_entrada, id_ot, placa, estado, detalles_json, creado_por, fecha_ingreso, fecha_inicio_ot, fecha_hora_salida
                    ) VALUES (?, ?, ?, 'Abierto', ?, ?, ?, ?, ?);
                `;

                try {
                    const [resOt] = await tdb.promise().query(sqlOt, [
                        idOt,
                        idOt,
                        placa,
                        JSON.stringify(detallesObj),
                        creado_por || 'Sistema',
                        dtIngreso,
                        dtIngreso,
                        dtSalida
                    ]);

                    // Los trabajos de la OT (uno por falla) quedan registrados desde el inicio, con su técnico
                    if (trabajosDet.length) {
                        const filasTrabajo = trabajosDet.map((td, idx) => [`${idOt}-${idx + 1}`, idOt, placa, td.desc, td.tecnico || '', 'En Proceso']);
                        await tdb.promise().query('INSERT INTO trabajos_ot (id_ot, ticket_visita, placa, trabajo_realizado, tecnico, estado) VALUES ?', [filasTrabajo]);
                    }

                    otsCreadas.push({ idOt, placa, unidad: item.unidad, tipo_ot: item.tipo_ot, subtipo_ot: item.subtipo_ot, supervisor: supervisorStr, tecnicos: tecnicosStr, id: resOt.insertId });

                    // Registrar en Módulo Status Rampa (tabla taller_rampas)
                    if (id_rampa && id_rampa !== 'En Ruta' && id_rampa !== 'En Espera') {
                        const obsRampa = descFallasClean || `${item.subtipo_ot || 'Falla'}: ${item.tipo_ot || 'Correctivo'}`;
                        let fIngDate = fecha_ingreso ? fecha_ingreso.split('T')[0] : new Date().toISOString().split('T')[0];
                        let fIngTime = fecha_ingreso && fecha_ingreso.includes('T') ? fecha_ingreso.split('T')[1].substring(0, 5) : new Date().toTimeString().substring(0, 5);

                        let fSalDate = fecha_salida && fecha_salida.includes('T') ? fecha_salida.split('T')[0] : null;
                        let fSalTime = fecha_salida && fecha_salida.includes('T') ? fecha_salida.split('T')[1].substring(0, 5) : null;

                        let targetRampaVal = id_rampa;
                        try {
                            const [cMatch] = await tdb.promise().query(
                                "SELECT id FROM cat_rampas WHERE LOWER(nombre_rampa) = LOWER(?) OR id = ? LIMIT 1",
                                [id_rampa, id_rampa]
                            );
                            if (cMatch && cMatch.length) targetRampaVal = cMatch[0].id;
                        } catch(eCat) {}

                        try {
                            const [existingRampa] = await tdb.promise().query(
                                "SELECT id, obs FROM taller_rampas WHERE placa = ? AND estado != 'Liberado' LIMIT 1",
                                [placa]
                            );

                            let rId = null;
                            if (existingRampa && existingRampa.length > 0) {
                                rId = existingRampa[0].id;
                                const oldObs = (existingRampa[0].obs || '').trim();
                                let newObs = obsRampa;
                                if (oldObs && oldObs.toUpperCase() !== 'FALLA' && oldObs.toUpperCase() !== 'MECÁNICA GENERAL') {
                                    // Solo se agregan las líneas que la rampa todavía no tiene (cada reporte trae un conjunto distinto de fallas)
                                    const yaEsta = new Set(oldObs.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean));
                                    const nuevas = obsRampa.split('\n').map(l => l.trim()).filter(l => l && !yaEsta.has(l.toLowerCase()));
                                    newObs = nuevas.length ? [oldObs, ...nuevas].join('\n') : oldObs;
                                }
                                await tdb.promise().query(
                                    `UPDATE taller_rampas SET rampa=?, placa=?, km=?, fecha_ingreso=?, hora_ingreso=?, fecha_salida=?, hora_salida=?, situacion=?, obs=?, creado_por=?, estado='Activo' WHERE id=?`,
                                    [targetRampaVal, placa, kmVal || null, fIngDate, fIngTime, fSalDate, fSalTime, situacionVal, newObs, creado_por || 'Sistema', rId]
                                );
                            } else {
                                const [resIns] = await tdb.promise().query(
                                    `INSERT INTO taller_rampas (rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, creado_por, estado)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo')`,
                                    [targetRampaVal, placa, kmVal || null, fIngDate, fIngTime, fSalDate, fSalTime, situacionVal, obsRampa, creado_por || 'Sistema']
                                );
                                rId = resIns.insertId;
                            }

                            if (rId && idOt) {
                                await tdb.promise().query(
                                    "UPDATE ordenes_trabajo SET id_rampa = ? WHERE id_ot = ?",
                                    [rId, idOt]
                                );
                            }
                        } catch(eRampa) {
                            console.warn('Warning taller_rampas auto-sync:', eRampa.message);
                        }
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

                if (typeof logAudit === 'function') {
                    logAudit(req, 'MANTENIMIENTO', 'Checklist', 'CREÓ', `Generó ${otsCreadas.length} OT(s) desde Reporte de Fallas ${idReporte}`);
                }

                return res.json({ ok: true, otsCreadas, total: otsCreadas.length });
            } else {
                return res.status(500).json({ error: errorCreacion || 'No se pudieron crear las OTs' });
            }
        });
    };

    router.post('/:id/generar-ots', handleGenerarOTs);
    router.post('/generar-ots', handleGenerarOTs);

    // Falla crítica: la unidad no puede salir. Se abre un ítem en el backlog de mantenimiento (BK-AAAA-NNNN).
    async function abrirBacklogFallaCritica(tdb, { folio, placa, km, descripcion, reportadoPor }) {
        const anio = new Date().getFullYear();
        const [ultimo] = await tdb.promise().query(
            'SELECT MAX(backlog_id) AS ultimo FROM ot_backlog WHERE backlog_id REGEXP ?',
            [`^BK-${anio}-[0-9]{4}$`]
        );
        const num = ultimo[0] && ultimo[0].ultimo ? parseInt(String(ultimo[0].ultimo).split('-').pop(), 10) || 0 : 0;
        const backlogId = `BK-${anio}-${String(num + 1).padStart(4, '0')}`;
        await tdb.promise().query(
            `INSERT INTO ot_backlog (backlog_id, placa, km, tema, tarea, reportado_por, fecha_reporte, estado, creado_por, ticket_ot)
             VALUES (?, ?, ?, 'Falla crítica', ?, ?, CURDATE(), 'Pendiente', ?, ?)`,
            [backlogId, placa || '', km || 0, descripcion, reportadoPor || 'Sistema', 'Sistema', folio]
        );
        // Aviso de falla crítica (WhatsApp / correo / SMS según la regla "Alerta crítica de checklist"). No bloquea ni lanza errores.
        eventosNotif.notificar(tdb, 'checklist_critico', eventosNotif.avisoChecklistCritico({ folio, placa, reportadoPor, detalle: descripcion, backlogId }));
    }
    function textoFallasCriticas(listas, libres) {
        const items = listas.flat().map(f => f && (f.obs || f.item || f.motivo || f.descripcion)).filter(Boolean);
        if (libres && String(libres).trim()) items.push(String(libres).trim());
        return items.length ? items.join('; ') : 'Falla crítica reportada (ver reporte de fallas)';
    }

    async function syncReporteConOTsYRampas(tdb, repId, folio, placaT, placaR, fallasT, fallasR, fallasLibres, broadcast) {
        try {
            const esObsGen = txt => {
                if (!txt) return true;
                const up = String(txt).trim().toUpperCase();
                return up === 'OBSERVADO EN CHECKLIST' || up === 'OBSERVACION REPORTADA' || up === 'OBSERVACIÓN REPORTADA' 
                    || up === 'FALLA OBSERVADA' || up === 'FALLA REPORTADA' || up === 'SIN OBSERVACIÓN' || up === 'SIN OBSERVACION'
                    || up === 'OBSERVACIÓN' || up === 'OBSERVACION';
            };

            const arrFallasT = Array.isArray(fallasT) ? fallasT : [];
            const arrFallasR = Array.isArray(fallasR) ? fallasR : [];

            const cleanListT = arrFallasT.map(f => {
                const desc = (!esObsGen(f.obs) && f.obs !== f.item) ? f.obs : (f.item || f.motivo || f.descripcion || 'Falla observada');
                return String(desc).replace(/^\[[^\]]+\]\s*/, '').replace(/^[A-Z0-9\s]+—\s*/i, '').replace(/^[•\-\*]\s*/, '').trim();
            }).filter(Boolean);
            if (fallasLibres && String(fallasLibres).trim()) cleanListT.push(String(fallasLibres).trim());

            const cleanListR = arrFallasR.map(f => {
                const desc = (!esObsGen(f.obs) && f.obs !== f.item) ? f.obs : (f.item || f.motivo || f.descripcion || 'Falla observada');
                return String(desc).replace(/^\[[^\]]+\]\s*/, '').replace(/^[A-Z0-9\s]+—\s*/i, '').replace(/^[•\-\*]\s*/, '').trim();
            }).filter(Boolean);

            const descTractoClean = cleanListT.map(t => '• ' + t).join('\n');
            const descRemolqueClean = cleanListR.map(t => '• ' + t).join('\n');

            const cleanListCombined = [...cleanListT, ...cleanListR];
            const rawFallasCombined = [...arrFallasT, ...arrFallasR];
            const descCombinedClean = cleanListCombined.map(t => '• ' + t).join('\n');

            // 1. Obtener IDs de OTs generadas registradas en el reporte
            let otsGeneradasIds = [];
            try {
                const [repRows] = await tdb.promise().query('SELECT ots_generadas_json FROM reportes_fallas WHERE id = ?', [repId]);
                if (repRows && repRows.length && repRows[0].ots_generadas_json) {
                    const parsed = typeof repRows[0].ots_generadas_json === 'string' ? JSON.parse(repRows[0].ots_generadas_json) : repRows[0].ots_generadas_json;
                    if (Array.isArray(parsed)) {
                        parsed.forEach(o => {
                            if (o.idOt) otsGeneradasIds.push(o.idOt);
                            if (o.ticket_entrada) otsGeneradasIds.push(o.ticket_entrada);
                        });
                    }
                }
            } catch(eOtsGen) {}

            // Buscar OTs vinculadas por ID, Folio en detalles_json o por ots_generadas_json
            let queryOts = `SELECT ticket_entrada, id_ot, placa, detalles_json FROM ordenes_trabajo 
                            WHERE detalles_json LIKE ? OR detalles_json LIKE ? OR detalles_json LIKE ?`;
            let paramsOts = [`%"id_reporte_falla":${repId}%`, `%"id_reporte_falla":"${repId}"%`, `%"folio_reporte":"${folio}"%`];
            
            if (otsGeneradasIds.length > 0) {
                queryOts += ` OR id_ot IN (?) OR ticket_entrada IN (?)`;
                paramsOts.push(otsGeneradasIds, otsGeneradasIds);
            }

            const [ots] = await tdb.promise().query(queryOts, paramsOts);

            const hasSeparateRemolqueOt = (ots || []).some(o => {
                let d = {};
                try { d = typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : (o.detalles_json || {}); } catch(e){}
                return (placaR && o.placa === placaR) || d.unidad === 'Remolque' || d.unidad === 'Carreta';
            });
            const hasSeparateTractoOt = (ots || []).some(o => {
                let d = {};
                try { d = typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : (o.detalles_json || {}); } catch(e){}
                return (placaT && o.placa === placaT) || d.unidad === 'Tracto';
            });

            if (ots && ots.length > 0) {
                for (const ot of ots) {
                    let det = {};
                    try { det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(e){}

                    const isRemolque = (placaR && ot.placa === placaR) || det.unidad === 'Remolque' || det.unidad === 'Carreta';
                    
                    let descClean = descCombinedClean;
                    let cleanList = cleanListCombined;
                    let rawFallas = rawFallasCombined;

                    if (hasSeparateRemolqueOt && hasSeparateTractoOt) {
                        descClean = isRemolque ? descRemolqueClean : descTractoClean;
                        cleanList = isRemolque ? cleanListR : cleanListT;
                        rawFallas = isRemolque ? arrFallasR : arrFallasT;
                    }

                    if (descClean) {
                        det.id_reporte_falla = repId;
                        det.folio_reporte = folio;
                        det.motivo = `[Reporte ${folio}]\n${descClean}`;
                        det.observaciones = `[Reporte ${folio}]\n${descClean}`;
                        det.descripcion_falla = descClean;
                        det.fallas_seleccionadas = cleanList;

                        // Actualizar motivos_array preservando asignaciones de técnicos existentes si coinciden
                        const oldMotivos = Array.isArray(det.motivos_array) ? det.motivos_array : [];
                        det.motivos_array = rawFallas.map(f => {
                            const desc = (!esObsGen(f.obs) && f.obs !== f.item) ? f.obs : (f.item || f.motivo || f.descripcion || 'Falla reportada');
                            const clean = String(desc).replace(/^\[[^\]]+\]\s*/, '').replace(/^[A-Z0-9\s]+—\s*/i, '').replace(/^[•\-\*]\s*/, '').trim();
                            const matchedOld = oldMotivos.find(om => {
                                const omTxt = String(om.obs || om.motivo || om.item || '').trim().toUpperCase();
                                return omTxt.includes(clean.toUpperCase()) || clean.toUpperCase().includes(omTxt);
                            });
                            return {
                                item: f.item || clean,
                                sistema: f.sistema || 'MANUAL',
                                motivo: clean,
                                descripcion: clean,
                                obs: f.obs || clean,
                                tecnico: (matchedOld && matchedOld.tecnico) ? matchedOld.tecnico : (det.supervisor || ''),
                                tecnico_nombre: (matchedOld && matchedOld.tecnico_nombre) ? matchedOld.tecnico_nombre : (det.supervisor || '')
                            };
                        });

                        await tdb.promise().query(
                            `UPDATE ordenes_trabajo SET detalles_json = ? WHERE ticket_entrada = ? OR id_ot = ?`,
                            [JSON.stringify(det), ot.ticket_entrada, ot.id_ot]
                        );
                    }
                }
            }

            // 2. Sincronizar tabla taller_rampas en tiempo real si hay rampa activa para estas placas
            const placas = [placaT, placaR].filter(Boolean);
            if (placas.length > 0) {
                for (const p of placas) {
                    const isR = (placaR && p === placaR);
                    const descRampa = (hasSeparateRemolqueOt && hasSeparateTractoOt) ? (isR ? descRemolqueClean : descTractoClean) : descCombinedClean;
                    if (descRampa) {
                        await tdb.promise().query(
                            `UPDATE taller_rampas SET obs = ? WHERE UPPER(placa) = UPPER(?) AND estado != 'Liberado'`,
                            [descRampa, p]
                        );
                    }
                }

                // Si existen OTs activas para estas placas que no tenían aún el vínculo explícito, actualizarlas
                try {
                    const [activeOts] = await tdb.promise().query(
                        `SELECT ticket_entrada, id_ot, placa, detalles_json FROM ordenes_trabajo 
                         WHERE UPPER(placa) IN (?) AND estado NOT IN ('Finalizado', 'Cerrada', 'Anulado')`,
                        [placas.map(p => p.toUpperCase())]
                    );
                    for (const aOt of (activeOts || [])) {
                        if (!(ots || []).some(o => o.ticket_entrada === aOt.ticket_entrada || o.id_ot === aOt.id_ot)) {
                            let det = {};
                            try { det = typeof aOt.detalles_json === 'string' ? JSON.parse(aOt.detalles_json) : (aOt.detalles_json || {}); } catch(e){}
                            det.id_reporte_falla = repId;
                            det.folio_reporte = folio;
                            det.motivo = `[Reporte ${folio}]\n${descCombinedClean}`;
                            det.observaciones = `[Reporte ${folio}]\n${descCombinedClean}`;
                            det.descripcion_falla = descCombinedClean;
                            det.fallas_seleccionadas = cleanListCombined;
                            await tdb.promise().query(
                                `UPDATE ordenes_trabajo SET detalles_json = ? WHERE ticket_entrada = ? OR id_ot = ?`,
                                [JSON.stringify(det), aOt.ticket_entrada, aOt.id_ot]
                            );
                        }
                    }
                } catch(eActOT) {}
            }

            if (typeof broadcast === 'function') {
                broadcast('checklist', 'actualizar');
                broadcast('ordenes', 'actualizar');
                broadcast('status', 'actualizar');
            }
        } catch(eSync) {
            console.warn('⚠️ Error en syncReporteConOTsYRampas:', eSync.message);
        }
    }

    // ── PUT /api/checklist/:id — Actualizar/Editar reporte de fallas ────────
    // ── POST /:id/agregar-fallas — Solo suma fallas a un reporte: no cambia ni borra las que ya tiene ──
    router.post('/:id/agregar-fallas', (req, res) => {
        const tdb = getDb(req);
        const { unidad, fallas } = req.body || {};
        const textos = (Array.isArray(fallas) ? fallas : []).map(t => String(t ?? '').trim()).filter(Boolean);
        if (!['tracto', 'remolque'].includes(unidad)) return res.status(400).json({ error: 'Indica si la falla es del camión o de la carreta' });
        if (!textos.length) return res.status(400).json({ error: 'Escribe al menos una falla' });
        const usuario = (req.user && (req.user.nombre || req.user.correo)) || 'Sistema';

        tdb.query('SELECT id, folio, estado, fallas_tracto_json, fallas_remolque_json FROM reportes_fallas WHERE id = ?', [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'Reporte no encontrado' });
            const rep = rows[0];
            if (/final|anula/i.test(String(rep.estado || ''))) {
                return res.status(400).json({ error: 'Este reporte ya está finalizado o anulado: no se pueden agregar fallas.' });
            }

            const campo = unidad === 'tracto' ? 'fallas_tracto_json' : 'fallas_remolque_json';
            let lista = [];
            try { const p = JSON.parse(rep[campo] || '[]'); if (Array.isArray(p)) lista = p; } catch (e) { lista = []; }

            // Las fallas que ya están en el reporte se conservan tal cual; aquí solo se agregan las nuevas
            const ahora = new Date().toISOString().slice(0, 16).replace('T', ' ');
            const existentes = new Set(lista.map(f => String(f.obs ?? f.observacion ?? '').trim().toLowerCase()));
            const nuevas = [];
            for (const t of textos) {
                const clave = t.toLowerCase();
                if (existentes.has(clave)) continue;
                existentes.add(clave);
                nuevas.push({ sistema: 'MANUAL', item: 'Falla agregada', obs: t, observacion: t, estado: 'FALLA', fecha: ahora, agregada_por: usuario });
            }
            if (!nuevas.length) return res.status(400).json({ error: 'Esas fallas ya están en el reporte' });

            tdb.query(`UPDATE reportes_fallas SET ${campo} = ? WHERE id = ?`, [JSON.stringify([...lista, ...nuevas]), req.params.id], (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (typeof logAudit === 'function') logAudit(req, 'MANTENIMIENTO', 'Checklist', 'AGREGÓ', `Agregó ${nuevas.length} falla(s) a ${rep.folio} (${unidad})`);
                res.json({ ok: true, agregadas: nuevas.length });
            });
        });
    });

    // ── PUT /:id — Edita los datos del reporte (cabecera, fotos y firma). Las fallas no cambian aquí:
    // se suman con POST /:id/agregar-fallas y se quitan una a una con POST /:id/quitar-falla ──
    router.put('/:id', async (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        const {
            orden_viaje, placa_tracto, placa_remolque, km_inicial, km_final, horas_motor,
            conductor, procedencia, ubicacion_gps, fotos_base64, firma_conductor
        } = req.body;

        tdb.query('SELECT * FROM reportes_fallas WHERE id = ?', [id], async (errSel, rows) => {
            if (errSel) return res.status(500).json({ error: errSel.message });
            if (!rows.length) return res.status(404).json({ error: 'Reporte no encontrado' });

            const rep = rows[0];
            const folio = rep.folio;

            if (rep.estado === 'Finalizado') {
                return res.status(400).json({ error: 'Este reporte de fallas ya se encuentra FINALIZADO y no puede ser modificado.' });
            }

            // Fotos existentes y nuevas (base64 o URL ya subida)
            let fotosUrls = [];
            try {
                if (rep.fotos_json) {
                    const parsed = JSON.parse(rep.fotos_json);
                    if (Array.isArray(parsed)) fotosUrls = parsed;
                }
            } catch (e) {}

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
                            console.error('⚠️ Error subiendo foto S3 en edición:', eS3.message);
                        }
                    } else if (typeof item === 'string' && item.startsWith('http') && !fotosUrls.includes(item)) {
                        fotosUrls.push(item);
                    }
                }
            }

            const sql = `
                UPDATE reportes_fallas SET
                    orden_viaje = ?,
                    placa_tracto = ?,
                    placa_remolque = ?,
                    km_inicial = ?,
                    km_final = ?,
                    horas_motor = ?,
                    conductor = ?,
                    procedencia = ?,
                    ubicacion_gps = ?,
                    fotos_json = ?,
                    firma_conductor = COALESCE(?, firma_conductor)
                WHERE id = ?
            `;

            const values = [
                (orden_viaje !== undefined ? (String(orden_viaje).trim() || null) : rep.orden_viaje),
                (placa_tracto || '').trim().toUpperCase(),
                (placa_remolque || '').trim().toUpperCase(),
                parseInt(km_inicial, 10) || 0,
                parseInt(km_final, 10) || 0,
                (horas_motor || '').trim() || null,
                (conductor || '').trim(),
                (procedencia || '').trim(),
                (ubicacion_gps || '').trim(),
                JSON.stringify(fotosUrls),
                firma_conductor || null,
                id
            ];

            tdb.query(sql, values, async (errUpd) => {
                if (errUpd) return res.status(500).json({ error: errUpd.message });

                // Las fallas siguen siendo las que tiene el reporte: se sincroniza con ellas tal como están
                await syncReporteConOTsYRampas(
                    tdb, id, folio,
                    (placa_tracto || rep.placa_tracto),
                    (placa_remolque || rep.placa_remolque),
                    aLista(rep.fallas_tracto_json),
                    aLista(rep.fallas_remolque_json),
                    rep.fallas_libres_text,
                    broadcast
                );

                if (typeof logAudit === 'function') {
                    logAudit(req, 'MANTENIMIENTO', 'Checklist', 'MODIFICÓ', `Modificó Reporte de Fallas ${folio || id}`);
                }

                res.json({ ok: true, id, folio, fotos: fotosUrls });
            });
        });
    });

    // ── POST /:id/quitar-falla — Quita una sola falla del reporte. Verifica que sea la que se muestra en pantalla ──
    router.post('/:id/quitar-falla', (req, res) => {
        const tdb = getDb(req);
        const { unidad, indice, item, obs } = req.body || {};
        if (!['tracto', 'remolque'].includes(unidad)) return res.status(400).json({ error: 'Indica la unidad de la falla' });
        const usuario = (req.user && (req.user.nombre || req.user.correo)) || 'Sistema';

        tdb.query('SELECT * FROM reportes_fallas WHERE id = ?', [req.params.id], async (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'Reporte no encontrado' });
            const rep = rows[0];
            if (/final|anula/i.test(String(rep.estado || ''))) {
                return res.status(400).json({ error: 'Este reporte ya está finalizado o anulado: no se pueden quitar fallas.' });
            }

            const campo = unidad === 'tracto' ? 'fallas_tracto_json' : 'fallas_remolque_json';
            const lista = aLista(rep[campo]);
            const i = Number(indice);
            const falla = Number.isInteger(i) ? lista[i] : undefined;
            if (!falla) return res.status(409).json({ error: 'Esa falla ya no está en el reporte. Actualiza la pantalla.' });

            const textoFalla = String(falla.obs ?? falla.observacion ?? '').trim();
            const itemFalla = String(falla.item ?? '').trim();
            if (textoFalla !== String(obs ?? '').trim() || itemFalla !== String(item ?? '').trim()) {
                return res.status(409).json({ error: 'El reporte cambió mientras lo mirabas. Actualiza la pantalla e intenta de nuevo.' });
            }

            const nuevaLista = lista.filter((_, k) => k !== i);
            const fallasT = unidad === 'tracto' ? nuevaLista : aLista(rep.fallas_tracto_json);
            const fallasR = unidad === 'remolque' ? nuevaLista : aLista(rep.fallas_remolque_json);

            tdb.query(`UPDATE reportes_fallas SET ${campo} = ? WHERE id = ?`, [JSON.stringify(nuevaLista), req.params.id], async (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                await syncReporteConOTsYRampas(
                    tdb, req.params.id, rep.folio, rep.placa_tracto, rep.placa_remolque,
                    fallasT, fallasR, rep.fallas_libres_text, broadcast
                );
                if (typeof logAudit === 'function') {
                    logAudit(req, 'MANTENIMIENTO', 'Checklist', 'QUITÓ', `Quitó la falla "${itemFalla || textoFalla}" de ${rep.folio} (${unidad}) · ${usuario}`);
                }
                res.json({ ok: true });
            });
        });
    });

    router.delete('/:id', async (req, res) => {
        const tdb = getDb(req);
        const id = req.params.id;
        try {
            const [repRows] = await tdb.promise().query('SELECT id, folio, ots_generadas_json FROM reportes_fallas WHERE id = ?', [id]);
            if (repRows && repRows.length) {
                const rep = repRows[0];
                const idsGen = [];
                try {
                    const parsed = typeof rep.ots_generadas_json === 'string' ? JSON.parse(rep.ots_generadas_json) : rep.ots_generadas_json;
                    if (Array.isArray(parsed)) parsed.forEach(o => {
                        if (o && o.idOt) idsGen.push(o.idOt);
                        if (o && o.ticket_entrada) idsGen.push(o.ticket_entrada);
                    });
                } catch (e) { /* JSON inválido: se ignora */ }
                let q = 'SELECT ticket_entrada, id_ot FROM ordenes_trabajo WHERE detalles_json LIKE ? OR detalles_json LIKE ?';
                const params = [`%"id_reporte_falla":${Number(rep.id)}%`, `%"id_reporte_falla":"${Number(rep.id)}"%`];
                if (rep.folio) { q += ' OR detalles_json LIKE ?'; params.push(`%"folio_reporte":"${String(rep.folio).replace(/[%_"]/g, '')}"%`); }
                if (idsGen.length) { q += ' OR id_ot IN (?) OR ticket_entrada IN (?)'; params.push(idsGen, idsGen); }
                const [ots] = await tdb.promise().query(q, params);
                if (ots && ots.length) {
                    const nombres = [...new Set(ots.map(o => o.id_ot || o.ticket_entrada).filter(Boolean))].join(', ');
                    return res.status(409).json({ error: `No se puede eliminar este reporte porque tiene la orden de trabajo ${nombres} asociada` });
                }
            }
            await tdb.promise().query('DELETE FROM reportes_fallas WHERE id = ?', [id]);
            if (typeof broadcast === 'function') broadcast('checklist', 'eliminar');
            if (typeof logAudit === 'function') {
                logAudit(req, 'MANTENIMIENTO', 'Checklist', 'ELIMINÓ', `Eliminó Reporte de Fallas ID ${id}`);
            }
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
