const express = require('express');
const { uploadToS3, getPresignedUrl } = require('../utils/s3');

const { 
    DEFAULT_MARCAS, 
    DEFAULT_MEDIDAS, 
    DEFAULT_MODELOS, 
    DEFAULT_ACCIONES,
    MARCAS_ALIAS_MAP,
    normalizarMarca,
    normalizarMedida
} = require('../services/catalogos_neumaticos');
// Semáforo único de neumáticos: crítico con menos de 3 mm (3 a 6 ámbar, más de 6 verde)
const MM_CRITICO = 3;
module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    // ── Middleware de Auditoría Automática para Neumáticos ────────────────
    router.use((req, res, next) => {
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            const originalJson = res.json.bind(res);
            res.json = function (data) {
                if (data && (data.ok === true || data.data === 'Éxito' || data.success || data.id || res.statusCode < 400)) {
                    if (typeof logAudit === 'function') {
                        const accion = req.method === 'POST' ? 'CREÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'MODIFICÓ';
                        let sub = 'Neumáticos';
                        let desc = `Operación de ${accion.toLowerCase()} en Neumáticos (${req.path})`;
                        if (req.body) {
                            if (req.body.codigo_neumatico) desc = `${accion} neumático: ${req.body.codigo_neumatico}`;
                            else if (req.body.placa) desc = `${accion} registro neumáticos para ${req.body.placa}`;
                            else if (req.params.id) desc = `${accion} registro ID: ${req.params.id}`;
                        }
                        logAudit(req, 'MANTENIMIENTO', sub, accion, desc);
                    }
                }
                return originalJson(data);
            };
        }
        next();
    });


    // ============================================================
    // 1. 📋 CATÁLOGOS (Marcas, Modelos, Medidas, Acciones)
    // ============================================================
    router.get('/catalogos', async (req, res) => {
        let dbMarcas = [];
        let dbModelos = [];
        let dbMedidas = [];
        let dbAcciones = [];

        try {
            const tdb = getDb(req);
            if (tdb) {
                try {
                    const [rows] = await tdb.query("SELECT DISTINCT nombre FROM cat_neumaticos_marcas WHERE activo = 1 ORDER BY nombre ASC");
                    dbMarcas = rows.map(r => r.nombre);
                } catch(e) {}

                try {
                    const [rows] = await tdb.query("SELECT DISTINCT nombre FROM cat_neumaticos_modelos WHERE activo = 1 ORDER BY nombre ASC");
                    dbModelos = rows.map(r => r.nombre);
                } catch(e) {}

                try {
                    const [rows] = await tdb.query("SELECT DISTINCT nombre FROM cat_neumaticos_medidas WHERE activo = 1 ORDER BY nombre ASC");
                    dbMedidas = rows.map(r => r.nombre);
                } catch(e) {}

                try {
                    const [rows] = await tdb.query("SELECT DISTINCT nombre FROM cat_neumaticos_acciones WHERE activo = 1 ORDER BY id ASC");
                    dbAcciones = rows.map(r => r.nombre);
                } catch(e) {}
            }
        } catch (err) {
            console.warn("Aviso en lectura de catálogos neumáticos:", err.message);
        }

        const accionMap = {
            'INSPECCION': 'Inspección',
            'INSPECCIÓN': 'Inspección',
            'ROTACION': 'Rotación',
            'ROTACIÓN': 'Rotación',
            'INSTALACION': 'Instalación',
            'INSTALACIÓN': 'Instalación',
            'CAMBIO': 'Cambio',
            'REPARACION': 'Reparación',
            'REPARACIÓN': 'Reparación',
            'REENCAUCHE': 'Reencauche',
            'BAJA': 'Baja',
            'ALINEACION': 'Alineación',
            'ALINEACIÓN': 'Alineación',
            'BALANCEO': 'Balanceo',
            'PARCHADO': 'Parchado'
        };

        const uniqueAccionesMap = new Map();
        [...DEFAULT_ACCIONES, ...dbAcciones].forEach(a => {
            if (!a) return;
            const clean = a.trim();
            const normKey = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            const displayVal = accionMap[normKey] || (clean.charAt(0).toUpperCase() + clean.slice(1));
            if (!uniqueAccionesMap.has(normKey)) {
                uniqueAccionesMap.set(normKey, displayVal);
            }
        });

        const allMarcas = Array.from(new Set([...DEFAULT_MARCAS, ...dbMarcas].map(r => (r || '').trim().toUpperCase()))).filter(Boolean).sort();
        const allModelos = Array.from(new Set([...DEFAULT_MODELOS, ...dbModelos].map(r => (r || '').trim().toUpperCase()))).filter(Boolean).sort();
        const allMedidas = Array.from(new Set([...DEFAULT_MEDIDAS, ...dbMedidas].map(r => (r || '').trim().toUpperCase()))).filter(Boolean).sort();

        res.json({
            ok: true,
            marcas:   allMarcas,
            modelos:  allModelos,
            medidas:  allMedidas,
            acciones: Array.from(uniqueAccionesMap.values()),
            estados:  ['NUEVA', 'RENCAUCHADA'],
            alias_map: MARCAS_ALIAS_MAP
        });
    });

    // Registrar nuevo elemento dinámico en caliente
    router.post('/catalogos/:tipo', async (req, res) => {
        try {
            const tdb = getDb(req);
            const tipo = (req.params.tipo || '').toLowerCase();
            let valor = (req.body.nombre || req.body.valor || '').trim().toUpperCase();

            if (!valor) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });

            if (tipo === 'marcas' || tipo === 'marca') {
                if (MARCAS_ALIAS_MAP[valor]) {
                    return res.status(400).json({ 
                        ok: false, 
                        error: `"${valor}" no puede registrarse como nueva marca porque corresponde al nombre oficial "${MARCAS_ALIAS_MAP[valor]}".` 
                    });
                }
                if (valor.length < 3) {
                    return res.status(400).json({ ok: false, error: 'El nombre de la marca debe tener al menos 3 caracteres.' });
                }
            } else if (tipo === 'medidas' || tipo === 'medida') {
                valor = normalizarMedida(valor);
                if (valor.length < 5 || !valor.includes('R')) {
                    return res.status(400).json({ ok: false, error: 'La medida debe tener formato estándar de neumático (ej: 295/80R22.5).' });
                }
            } else if (tipo === 'modelos' || tipo === 'modelo') {
                if (valor.length < 2) {
                    return res.status(400).json({ ok: false, error: 'El modelo debe tener al menos 2 caracteres.' });
                }
            }

            let tabla = '';
            if (tipo === 'marcas' || tipo === 'marca') tabla = 'cat_neumaticos_marcas';
            else if (tipo === 'modelos' || tipo === 'modelo') tabla = 'cat_neumaticos_modelos';
            else if (tipo === 'medidas' || tipo === 'medida') tabla = 'cat_neumaticos_medidas';
            else if (tipo === 'acciones' || tipo === 'accion') tabla = 'cat_neumaticos_acciones';
            else return res.status(400).json({ ok: false, error: 'Tipo de catálogo no válido' });

            await tdb.query(`INSERT IGNORE INTO ${tabla} (nombre) VALUES (?)`, [valor]);
            if (logAudit) logAudit(req, 'NEUMATICOS', 'CREAR_CATALOGO', `Registrado ${tipo}: ${valor}`);

            res.json({ ok: true, mensaje: `${valor} registrado exitosamente`, valor });
        } catch (err) {
            console.error("Error guardando elemento de catálogo:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 2. 🔍 INSPECCIONES (Listar, Obtener, Crear, Eliminar)
    // ============================================================
    router.get('/inspecciones', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { placa, id_ot, limit = 100 } = req.query;

            let sql = `
                SELECT i.*, 
                       (SELECT COUNT(*) FROM neumaticos_inspecciones_det d WHERE d.id_inspeccion = i.id_inspeccion) as total_llantas,
                       (SELECT COUNT(*) FROM neumaticos_inspecciones_det d WHERE d.id_inspeccion = i.id_inspeccion AND d.alerta_cambio = 1) as llantas_criticas
                FROM neumaticos_inspecciones i
                WHERE 1=1
            `;
            const params = [];

            if (placa) {
                sql += " AND i.placa = ?";
                params.push(placa);
            }
            if (id_ot) {
                sql += " AND i.id_ot = ?";
                params.push(id_ot);
            }

            sql += " ORDER BY i.fecha_inspeccion DESC, i.created_at DESC LIMIT ?";
            params.push(parseInt(limit, 10));

            const [rows] = await tdb.query(sql, params);
            const data = rows.map(r => ({
                ...r,
                odometro_km: r.km_vehiculo,
                observaciones_generales: r.observaciones
            }));
            res.json({ ok: true, data });
        } catch (err) {
            console.error("Error obteniendo listado de inspecciones:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.get('/inspecciones/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = req.params.id;

            const [cabecera] = await tdb.query("SELECT * FROM neumaticos_inspecciones WHERE id_inspeccion = ?", [id]);
            if (!cabecera.length) return res.status(404).json({ ok: false, error: 'Inspección no encontrada' });

            const [detalles] = await tdb.query(
                "SELECT * FROM neumaticos_inspecciones_det WHERE id_inspeccion = ? ORDER BY CAST(posicion AS UNSIGNED) ASC, posicion ASC", 
                [id]
            );

            // Generar URLs pre-firmadas para las fotos de S3
            const { s3KeyFromUrl } = require('../utils/s3');
            for (const d of detalles) {
                for (let k = 1; k <= 3; k++) {
                    const field = `foto${k}`;
                    if (d[field] && typeof d[field] === 'string' && !d[field].startsWith('data:image')) {
                        const s3Key = s3KeyFromUrl(d[field]) || d[field];
                        if (s3Key && !s3Key.startsWith('http')) {
                            try {
                                d[field] = await getPresignedUrl(s3Key, 7200); // URL firmada por 2 horas
                            } catch (e) {
                                console.warn(`Error presigning ${field}:`, e.message);
                            }
                        } else if (d[field].includes('.amazonaws.com/')) {
                            const extractedKey = s3KeyFromUrl(d[field]);
                            if (extractedKey) {
                                try {
                                    d[field] = await getPresignedUrl(extractedKey, 7200);
                                } catch (e) {
                                    console.warn(`Error presigning ${field}:`, e.message);
                                }
                            }
                        }
                    }
                }
            }

            const cab = { ...cabecera[0] };
            cab.odometro_km = cab.km_vehiculo;
            cab.observaciones_generales = cab.observaciones;
            res.json({ ok: true, data: { ...cab, detalles } });
        } catch (err) {
            console.error("Error obteniendo detalle de inspección de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.post('/inspecciones', async (req, res) => {
        try {
            const tdb = getDb(req);
            
            // Compatibilidad defensiva y bidireccional (soporta nombres del clásico y de React)
            const placaRaw = req.body.placa || req.body.vehiculo_placa || '';
            const placa = String(placaRaw).trim().toUpperCase();

            const fecha_inspeccion = req.body.fecha_inspeccion || new Date().toISOString().split('T')[0];

            // Kilometraje: lee km_vehiculo, odometro_km, o kilometraje
            const kmRaw = (req.body.km_vehiculo !== undefined && req.body.km_vehiculo !== null && req.body.km_vehiculo !== '')
                ? req.body.km_vehiculo
                : (req.body.odometro_km !== undefined && req.body.odometro_km !== null && req.body.odometro_km !== ''
                    ? req.body.odometro_km
                    : (req.body.kilometraje !== undefined && req.body.kilometraje !== null ? req.body.kilometraje : 0));
            const km_vehiculo = parseInt(kmRaw, 10) || 0;

            const dias_propuestos = parseInt(req.body.dias_propuestos || 30, 10) || 30;

            // Observaciones: lee observaciones, observaciones_generales, o obs
            const obsRaw = (req.body.observaciones !== undefined && req.body.observaciones !== null)
                ? req.body.observaciones
                : (req.body.observaciones_generales !== undefined && req.body.observaciones_generales !== null
                    ? req.body.observaciones_generales
                    : (req.body.obs || ''));
            const observaciones = String(obsRaw).trim();

            const inspector = String(req.body.inspector || req.body.tecnico || req.body.usuario || '').trim();
            const id_ot = req.body.id_ot || null;

            // Items / Llantas: lee items o llantas_inspeccionadas
            const items = (Array.isArray(req.body.items) && req.body.items.length > 0)
                ? req.body.items
                : (Array.isArray(req.body.llantas_inspeccionadas) ? req.body.llantas_inspeccionadas : []);

            if (!placa || !fecha_inspeccion) {
                return res.status(400).json({ ok: false, error: 'Placa y fecha de inspección son requeridas' });
            }

            if (!items || items.length === 0) {
                return res.status(400).json({ ok: false, error: 'Debes agregar al menos una llanta a la inspección' });
            }

            // Normalización y Validación Defensiva de Llantas
            let dbMarcas = [];
            try {
                const [mRows] = await tdb.query("SELECT DISTINCT nombre FROM cat_neumaticos_marcas WHERE activo = 1");
                dbMarcas = mRows.map(r => r.nombre);
            } catch(e) {}

            for (const it of items) {
                const posClean = String(it.posicion || '1').toUpperCase();
                it.marca = normalizarMarca(it.marca, dbMarcas);
                it.medida = normalizarMedida(it.medida);
                it.modelo = String(it.modelo || '').trim().toUpperCase();

                if (!it.marca || it.marca.length < 3) {
                    return res.status(400).json({ 
                        ok: false, 
                        error: `La llanta en posición #${posClean} tiene una marca incompleta o no válida ("${it.marca || ''}"). Debe seleccionarse una marca oficial del catálogo.` 
                    });
                }
                if (!it.medida || it.medida.length < 5 || !it.medida.includes('R')) {
                    return res.status(400).json({ 
                        ok: false, 
                        error: `La llanta en posición #${posClean} tiene una medida incompleta ("${it.medida || ''}"). Debe ingresar el formato estándar completo (ej: 295/80R22.5).` 
                    });
                }
                if (!it.modelo || it.modelo.length < 2) {
                    return res.status(400).json({ 
                        ok: false, 
                        error: `La llanta en posición #${posClean} requiere un modelo válido y completo.` 
                    });
                }
            }

            // Generar ID Correlativo Limpio (Ej: NEU-2026-0001)
            const anioActual = new Date(fecha_inspeccion || Date.now()).getFullYear() || 2026;
            let id_inspeccion = '';
            try {
                const [countRows] = await tdb.query(
                    "SELECT COUNT(*) as total FROM neumaticos_inspecciones WHERE id_inspeccion LIKE ? OR fecha_inspeccion LIKE ?", 
                    [`NEU-${anioActual}-%`, `${anioActual}%`]
                );
                const nextNum = (countRows[0]?.total || 0) + 1;
                id_inspeccion = `NEU-${anioActual}-${String(nextNum).padStart(4, '0')}`;
                
                // Verificar colisión por si acaso
                const [exists] = await tdb.query("SELECT id_inspeccion FROM neumaticos_inspecciones WHERE id_inspeccion = ?", [id_inspeccion]);
                if (exists.length > 0) {
                    const randExtra = Math.floor(1000 + Math.random() * 9000);
                    id_inspeccion = `NEU-${anioActual}-${String(nextNum + randExtra).padStart(4, '0')}`;
                }
            } catch (errCorr) {
                const rand = Math.floor(1000 + Math.random() * 9000);
                id_inspeccion = `NEU-${anioActual}-${rand}`;
            }

            // Calcular fecha próxima
            let fechaProxima = null;
            if (fecha_inspeccion) {
                const f = new Date(fecha_inspeccion);
                f.setDate(f.getDate() + (parseInt(dias_propuestos, 10) || 30));
                fechaProxima = f.toISOString().split('T')[0];
            }

            // 1. Iniciar Transacción Atómica
            await tdb.query('START TRANSACTION');

            try {
                // Insertar Cabecera
                await tdb.query(`
                    INSERT INTO neumaticos_inspecciones 
                    (id_inspeccion, id_ot, placa, fecha_inspeccion, km_vehiculo, dias_propuestos, fecha_proxima, observaciones, inspector, total_llantas)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    id_inspeccion,
                    id_ot || null,
                    placa.toUpperCase(),
                    fecha_inspeccion,
                    km_vehiculo || 0,
                    dias_propuestos || 30,
                    fechaProxima,
                    observaciones || '',
                    inspector || '',
                    items.length
                ]);

                // 2. Insertar Detalles
                for (const it of items) {
                    const r1 = parseInt(it.r1 || 0, 10);
                    const r2 = parseInt(it.r2 || 0, 10);
                    const r3 = parseInt(it.r3 || 0, 10);
                    const r4 = parseInt(it.r4 || 0, 10);
                    const rProm = (r4 > 0) ? (r1 + r2 + r3 + r4) / 4.0 : (r1 + r2 + r3) / 3.0;
                    const alertaCambio = rProm < MM_CRITICO ? 1 : 0;

                    let foto1Url = it.foto1 || null;
                    let foto2Url = it.foto2 || null;
                    let foto3Url = it.foto3 || null;

                    // Si vienen en base64, subir a AWS S3
                    const posClean = String(it.posicion || '1').toUpperCase();
                    if (foto1Url && foto1Url.startsWith('data:image')) {
                        try {
                            const b64Data = foto1Url.replace(/^data:image\/\w+;base64,/, '');
                            const buffer = Buffer.from(b64Data, 'base64');
                            const s3Key = `neumaticos/${placa.toUpperCase()}/${id_inspeccion}_pos${posClean}_foto1_${Date.now()}.jpg`;
                            foto1Url = await uploadToS3(buffer, s3Key, 'image/jpeg');
                        } catch(e) { console.warn('Error subiendo foto1 a S3:', e.message); }
                    }
                    if (foto2Url && foto2Url.startsWith('data:image')) {
                        try {
                            const b64Data = foto2Url.replace(/^data:image\/\w+;base64,/, '');
                            const buffer = Buffer.from(b64Data, 'base64');
                            const s3Key = `neumaticos/${placa.toUpperCase()}/${id_inspeccion}_pos${posClean}_foto2_${Date.now()}.jpg`;
                            foto2Url = await uploadToS3(buffer, s3Key, 'image/jpeg');
                        } catch(e) { console.warn('Error subiendo foto2 a S3:', e.message); }
                    }
                    if (foto3Url && foto3Url.startsWith('data:image')) {
                        try {
                            const b64Data = foto3Url.replace(/^data:image\/\w+;base64,/, '');
                            const buffer = Buffer.from(b64Data, 'base64');
                            const s3Key = `neumaticos/${placa.toUpperCase()}/${id_inspeccion}_pos${posClean}_foto3_${Date.now()}.jpg`;
                            foto3Url = await uploadToS3(buffer, s3Key, 'image/jpeg');
                        } catch(e) { console.warn('Error subiendo foto3 a S3:', e.message); }
                    }

                    await tdb.query(`
                        INSERT INTO neumaticos_inspecciones_det
                        (id_inspeccion, id_neumatico, posicion, marca, medida, modelo, r1, r2, r3, r4, presion_ant, presion_actual, estado, accion, rot, observaciones, foto1, foto2, foto3, alerta_cambio)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        id_inspeccion,
                        it.id_neumatico || null,
                        posClean,
                        (it.marca || '').toUpperCase(),
                        (it.medida || '').toUpperCase(),
                        (it.modelo || '').toUpperCase(),
                        r1,
                        r2,
                        r3,
                        r4,
                        parseInt(it.presion_ant || it.presion_anterior || it.psiAnt || 0, 10),
                        parseInt(it.presion_actual || it.presion || it.psiActual || 0, 10),
                        (it.estado || it.state || 'NUEVA').toUpperCase(),
                        (it.accion || it.action || 'Inspección'),
                        String(it.rot || it.rotacion || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
                        String(it.observaciones || it.observacion || it.obs || '').trim(),
                        foto1Url,
                        foto2Url,
                        foto3Url,
                        alertaCambio
                    ]);

                    // Actualizar o Registrar en Hoja de Vida
                    if (it.id_neumatico) {
                        await tdb.query(`
                            INSERT INTO neumaticos_hoja_vida 
                            (id_neumatico, marca, modelo, medida, estado, remanente_actual, placa_actual, posicion_actual, estado_operativo)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Montada')
                            ON DUPLICATE KEY UPDATE 
                                marca = VALUES(marca),
                                modelo = VALUES(modelo),
                                medida = VALUES(medida),
                                remanente_actual = VALUES(remanente_actual),
                                placa_actual = VALUES(placa_actual),
                                posicion_actual = VALUES(posicion_actual),
                                estado_operativo = 'Montada'
                        `, [
                            it.id_neumatico,
                            (it.marca || '').toUpperCase(),
                            (it.modelo || '').toUpperCase(),
                            (it.medida || '').toUpperCase(),
                            (it.estado || 'NUEVA').toUpperCase(),
                            parseFloat(rProm.toFixed(1)),
                            placa.toUpperCase(),
                            String(it.posicion || '1').toUpperCase()
                        ]);
                    }
                }

                await tdb.query('COMMIT');
            } catch (errTx) {
                await tdb.query('ROLLBACK');
                throw errTx;
            }

            res.json({
                ok: true,
                message: 'Inspección de neumáticos registrada exitosamente',
                id_inspeccion,
                fecha_proxima: fechaProxima
            });
        } catch (err) {
            console.error("Error guardando inspección de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.delete('/inspecciones/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = req.params.id;

            await tdb.query("DELETE FROM neumaticos_inspecciones_det WHERE id_inspeccion = ?", [id]);
            await tdb.query("DELETE FROM neumaticos_inspecciones WHERE id_inspeccion = ?", [id]);

            if (logAudit) logAudit(req, 'NEUMATICOS', 'ELIMINAR_INSPECCION', `Inspección ${id} eliminada`);
            if (broadcast) broadcast({ tipo: 'neumaticos_update', id_inspeccion: id });

            res.json({ ok: true, mensaje: 'Inspección eliminada exitosamente' });
        } catch (err) {
            console.error("Error eliminando inspección de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 3. 🔄 REGISTRO Y CONSULTA DE ROTACIONES DE NEUMÁTICOS
    // ============================================================
    router.post('/rotaciones', async (req, res) => {
        try {
            const tdb = getDb(req);
            const {
                id_ot,
                placa,
                fecha,
                km_actual = 0,
                posicion_origen,
                posicion_destino,
                id_neumatico = null,
                motivo = 'Rotación preventiva',
                tecnico = ''
            } = req.body;

            if (!placa || !fecha || !posicion_origen || !posicion_destino) {
                return res.status(400).json({ ok: false, error: 'Placa, fecha y posiciones son requeridas' });
            }

            const [result] = await tdb.query(`
                INSERT INTO neumaticos_rotaciones
                (id_ot, placa, fecha, km_actual, posicion_origen, posicion_destino, id_neumatico, motivo, tecnico)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id_ot || null,
                placa.toUpperCase(),
                fecha,
                km_actual,
                String(posicion_origen).toUpperCase(),
                String(posicion_destino).toUpperCase(),
                id_neumatico,
                motivo,
                tecnico
            ]);

            // Actualizar posición en Hoja de Vida si existe
            if (id_neumatico) {
                await tdb.query(`
                    UPDATE neumaticos_hoja_vida 
                    SET posicion_actual = ?, placa_actual = ?
                    WHERE id_neumatico = ?
                `, [String(posicion_destino).toUpperCase(), placa.toUpperCase(), id_neumatico]);
            }

            res.json({ ok: true, message: 'Rotación registrada exitosamente', id: result.insertId });
        } catch (err) {
            console.error("Error registrando rotación de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 4. 📖 HOJA DE VIDA DE NEUMÁTICOS (HISTORIAL COMPLETO)
    // ============================================================
    router.get('/hoja-vida/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = req.params.id;

            const [neumatico] = await tdb.query("SELECT * FROM neumaticos_hoja_vida WHERE id_neumatico = ?", [id]);
            if (!neumatico.length) return res.status(404).json({ ok: false, error: 'Neumático no encontrado' });

            const [inspecciones] = await tdb.query(`
                SELECT i.fecha_inspeccion, i.km_vehiculo, d.* 
                FROM neumaticos_inspecciones_det d
                INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_unicode_ci = i.id_inspeccion COLLATE utf8mb4_unicode_ci
                WHERE d.id_neumatico = ?
                ORDER BY i.fecha_inspeccion DESC
            `, [id]);

            const [rotaciones] = await tdb.query(`
                SELECT * FROM neumaticos_rotaciones 
                WHERE id_neumatico = ?
                ORDER BY fecha DESC
            `, [id]);

            res.json({
                ok: true,
                data: {
                    ...neumatico[0],
                    historial_inspecciones: inspecciones,
                    historial_rotaciones: rotaciones
                }
            });
        } catch (err) {
            console.error("Error obteniendo hoja de vida del neumático:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 5. 📊 DASHBOARD & ANÁLISIS DE NEUMÁTICOS POR FLOTA
    // ============================================================
    router.get('/analisis', async (req, res) => {
        try {
            const tdb = getDb(req);

            // Ejecutar consultas agregadas en paralelo para máxima velocidad
            const [
                [totalInspRows],
                [vigenciasRows],
                [criticasRows],
                [unidadesUsoRows],
                [marcasTopRows],
                [medidasRows],
                [listadoRows]
            ] = await Promise.all([
                // 1. Total de inspecciones registradas
                tdb.query("SELECT COUNT(*) as total FROM neumaticos_inspecciones"),

                // 2. Vigencia de inspecciones de la flota activa en uso
                tdb.query(`
                    SELECT 
                        CAST(COALESCE(SUM(CASE WHEN i1.fecha_proxima >= CURDATE() THEN 1 ELSE 0 END), 0) AS UNSIGNED) as vigentes,
                        CAST(COALESCE(SUM(CASE WHEN i1.fecha_proxima < CURDATE() THEN 1 ELSE 0 END), 0) AS UNSIGNED) as no_vigentes
                    FROM neumaticos_inspecciones i1
                    INNER JOIN (
                        SELECT placa, MAX(fecha_inspeccion) as max_fecha
                        FROM neumaticos_inspecciones
                        GROUP BY placa
                    ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
                    LEFT JOIN placas p ON i1.placa = p.placa
                    WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) != 'NO'
                `),

                // 3. Total de llantas críticas en la última inspección de flota activa
                tdb.query(`
                    SELECT COUNT(*) as total_criticas
                    FROM neumaticos_inspecciones_det d
                    INNER JOIN (
                        SELECT i1.id_inspeccion
                        FROM neumaticos_inspecciones i1
                        INNER JOIN (
                            SELECT placa, MAX(fecha_inspeccion) as max_fecha
                            FROM neumaticos_inspecciones
                            GROUP BY placa
                        ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
                        LEFT JOIN placas p ON i1.placa = p.placa
                        WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) != 'NO'
                    ) last_i ON d.id_inspeccion = last_i.id_inspeccion
                    WHERE d.alerta_cambio = 1 OR d.r1 < ${MM_CRITICO} OR d.r2 < ${MM_CRITICO} OR d.r3 < ${MM_CRITICO}
                `),

                // 4. Total de unidades activas en uso y suma teórica de llantas de flota
                tdb.query(`
                    SELECT 
                        COUNT(*) as total_unidades_en_uso,
                        CAST(COALESCE(SUM(CASE WHEN llantas IS NOT NULL AND llantas > 0 THEN llantas ELSE 0 END), 0) AS UNSIGNED) as total_llantas_flota
                    FROM placas
                    WHERE UPPER(TRIM(COALESCE(en_uso, 'SI'))) != 'NO'
                `),

                // 5. Desglose de marcas top
                tdb.query(`
                    SELECT marca, COUNT(*) as cantidad
                    FROM neumaticos_inspecciones_det
                    WHERE marca != '' AND marca IS NOT NULL
                    GROUP BY marca
                    ORDER BY cantidad DESC
                    LIMIT 8
                `),

                // 6. Desglose de medidas de llantas rodando activas (última inspección)
                tdb.query(`
                    SELECT 
                        COALESCE(NULLIF(TRIM(UPPER(d.medida)), ''), 'SIN ESPECIFICAR') as medida, 
                        COUNT(*) as cantidad 
                    FROM neumaticos_inspecciones_det d 
                    INNER JOIN (
                        SELECT i1.id_inspeccion 
                        FROM neumaticos_inspecciones i1 
                        INNER JOIN (
                            SELECT placa, MAX(fecha_inspeccion) as max_fecha 
                            FROM neumaticos_inspecciones 
                            GROUP BY placa
                        ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha 
                        LEFT JOIN placas p ON i1.placa = p.placa 
                        WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) != 'NO'
                    ) last_i ON d.id_inspeccion = last_i.id_inspeccion 
                    GROUP BY medida 
                    ORDER BY cantidad DESC
                `),

                // 7. Listado de última inspección o estado por unidad activa con agregación en O(1)
                tdb.query(`
                    SELECT 
                        p.placa,
                        p.cliente as dueno,
                        p.marca as marca_unidad,
                        p.tipo as tipo_unidad,
                        p.motora,
                        last_i.id_inspeccion,
                        last_i.fecha_inspeccion,
                        last_i.km_vehiculo,
                        last_i.fecha_proxima,
                        DATEDIFF(last_i.fecha_proxima, CURDATE()) as dias_restantes,
                        COALESCE(det_stats.total_llantas, 0) as total_llantas,
                        COALESCE(det_stats.total_criticas, 0) as total_criticas
                    FROM placas p
                    LEFT JOIN (
                        SELECT i1.id_inspeccion, i1.placa, i1.fecha_inspeccion, i1.km_vehiculo, i1.fecha_proxima
                        FROM neumaticos_inspecciones i1
                        INNER JOIN (
                            SELECT placa, MAX(fecha_inspeccion) as max_fecha
                            FROM neumaticos_inspecciones
                            GROUP BY placa
                        ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
                    ) last_i ON p.placa = last_i.placa
                    LEFT JOIN (
                        SELECT 
                            id_inspeccion,
                            COUNT(*) as total_llantas,
                            SUM(CASE WHEN alerta_cambio = 1 OR r1 < ${MM_CRITICO} OR r2 < ${MM_CRITICO} OR r3 < ${MM_CRITICO} THEN 1 ELSE 0 END) as total_criticas
                        FROM neumaticos_inspecciones_det
                        GROUP BY id_inspeccion
                    ) det_stats ON last_i.id_inspeccion = det_stats.id_inspeccion
                    WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) != 'NO'
                    ORDER BY 
                        CASE WHEN last_i.fecha_inspeccion IS NULL THEN 0 ELSE 1 END ASC,
                        last_i.fecha_inspeccion DESC
                `)
            ]);

            const totalUso = unidadesUsoRows[0]?.total_unidades_en_uso || 0;
            // Sin unidades en uso no hay total de llantas que informar (null, no un valor de respaldo)
            const totalFlotaLlantas = unidadesUsoRows[0]?.total_llantas_flota ?? null;
            const vig = vigenciasRows[0]?.vigentes || 0;
            const noVig = vigenciasRows[0]?.no_vigentes || 0;
            const sinInsp = Math.max(0, totalUso - (vig + noVig));
            const totalLlantasRodando = (medidasRows || []).reduce((s, m) => s + Number(m.cantidad || 0), 0);

            res.json({
                ok: true,
                resumen: {
                    total_inspecciones: totalInspRows[0]?.total || 0,
                    vigentes: vig,
                    no_vigentes: noVig,
                    sin_inspeccion: sinInsp,
                    llantas_criticas: criticasRows[0]?.total_criticas || 0,
                    unidades_en_uso: totalUso,
                    total_llantas_rodando: totalLlantasRodando,
                    total_llantas_flota: totalFlotaLlantas
                },
                marcas: marcasTopRows || [],
                medidas: medidasRows || [],
                inspecciones: listadoRows || []
            });
        } catch (err) {
            console.error("Error en dashboard de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── GET /api/neumaticos/medida-detalle ────────────────────────
    router.get('/medida-detalle', async (req, res) => {
        try {
            const tdb = getDb(req);
            const medidaParam = (req.query.medida || '').trim();

            let sqlWhereMedida = "UPPER(TRIM(COALESCE(d.medida, ''))) = UPPER(TRIM(?))";
            const params = [medidaParam];
            if (medidaParam === 'SIN MEDIDA' || medidaParam === 'SIN ESPECIFICAR' || !medidaParam) {
                sqlWhereMedida = "(d.medida IS NULL OR TRIM(d.medida) = '')";
                params.length = 0;
            }

            const [rows] = await tdb.query(`
                SELECT 
                    last_i.placa,
                    p.tipo as tipo_unidad,
                    p.marca as marca_unidad,
                    p.modelo_uts as modelo_unidad,
                    p.cliente as dueno,
                    d.id,
                    d.id_neumatico,
                    d.posicion,
                    d.marca as marca_llanta,
                    d.modelo as modelo_llanta,
                    COALESCE(NULLIF(TRIM(d.medida), ''), 'SIN ESPECIFICAR') as medida,
                    d.r1,
                    d.r2,
                    d.r3,
                    d.remanente_promedio,
                    d.presion_actual,
                    d.estado,
                    d.alerta_cambio,
                    last_i.fecha_inspeccion,
                    last_i.km_vehiculo
                FROM neumaticos_inspecciones_det d
                INNER JOIN (
                    SELECT i1.id_inspeccion, i1.placa, i1.fecha_inspeccion, i1.km_vehiculo
                    FROM neumaticos_inspecciones i1
                    INNER JOIN (
                        SELECT placa, MAX(fecha_inspeccion) as max_fecha
                        FROM neumaticos_inspecciones
                        GROUP BY placa
                    ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
                    LEFT JOIN placas p ON i1.placa = p.placa
                    WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) != 'NO'
                ) last_i ON d.id_inspeccion = last_i.id_inspeccion
                LEFT JOIN placas p ON last_i.placa = p.placa
                WHERE ${sqlWhereMedida}
                ORDER BY last_i.placa ASC, d.posicion ASC
            `, params);

            // Resumen agrupado por placa
            const placasMap = {};
            rows.forEach(r => {
                if (!placasMap[r.placa]) placasMap[r.placa] = 0;
                placasMap[r.placa]++;
            });

            res.json({
                ok: true,
                medida: medidaParam,
                total_llantas: rows.length,
                total_unidades: Object.keys(placasMap).length,
                llantas: rows
            });
        } catch (err) {
            console.error("Error en /api/neumaticos/medida-detalle:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 5.4 🛰️ ODÓMETRO GPS (WIALON) DE UNA PLACA EN UNA FECHA
    // ============================================================
    router.get('/km-gps/:placa', async (req, res) => {
        try {
            const tdb = getDb(req);
            const placaNorm = String(req.params.placa || '').replace(/[-\s]/g, '').toUpperCase();
            const pedida = String(req.query.fecha || '');
            // Sin fecha válida, se usa la de hoy en Lima (no la zona horaria del servidor)
            const fecha = /^\d{4}-\d{2}-\d{2}$/.test(pedida)
                ? pedida
                : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

            const [rows] = await tdb.query(`
                SELECT km_gps, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha
                FROM km_snapshots
                WHERE UPPER(REPLACE(REPLACE(placa, '-', ''), ' ', '')) = ? AND fecha <= ?
                ORDER BY fecha DESC
                LIMIT 1
            `, [placaNorm, fecha]);

            const fila = rows && rows.length ? rows[0] : null;
            res.json({
                ok: true,
                km: fila && fila.km_gps !== null && fila.km_gps !== undefined ? Number(fila.km_gps) : null,
                fecha: fila ? fila.fecha : null
            });
        } catch (err) {
            console.error("Error en km-gps:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 5.5 🔍 OBTENER ÚLTIMA INSPECCIÓN DE UNA PLACA POR POSICIÓN (AUTOPOBLADO)
    // ============================================================
    router.get('/placa-ultima/:placa', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { placa } = req.params;
            const [rows] = await tdb.query(`
                SELECT 
                    d.posicion,
                    d.marca,
                    d.medida,
                    d.modelo,
                    d.r1,
                    d.r2,
                    d.r3,
                    d.r4,
                    d.remanente_promedio,
                    d.presion_actual,
                    d.estado
                FROM neumaticos_inspecciones_det d
                INNER JOIN (
                    SELECT id_inspeccion
                    FROM neumaticos_inspecciones
                    WHERE UPPER(TRIM(placa)) = UPPER(TRIM(?))
                    ORDER BY fecha_inspeccion DESC, created_at DESC
                    LIMIT 1
                ) last_i ON d.id_inspeccion COLLATE utf8mb4_unicode_ci = last_i.id_inspeccion COLLATE utf8mb4_unicode_ci
            `, [placa]);

            // Obtener datos de la última inspección
            const datosPosiciones = {};
            rows.forEach(r => {
                const k = String(r.posicion || '').trim().toUpperCase();
                if (k) datosPosiciones[k] = r;
            });

            // Obtener configuración registrada del vehículo desde la tabla placas
            const [pRows] = await tdb.query(`
                SELECT configuracion, tipo FROM placas WHERE UPPER(TRIM(placa)) = UPPER(TRIM(?)) LIMIT 1
            `, [placa]);

            // Obtener metadatos de la última inspección realizada a esta placa
            const [lastInspRows] = await tdb.query(`
                SELECT id_inspeccion, DATE_FORMAT(fecha_inspeccion, '%Y-%m-%d') as fecha_inspeccion, km_vehiculo, observaciones, inspector, dias_propuestos, DATE_FORMAT(fecha_proxima, '%Y-%m-%d') as fecha_proxima
                FROM neumaticos_inspecciones
                WHERE UPPER(TRIM(placa)) = UPPER(TRIM(?))
                ORDER BY fecha_inspeccion DESC, created_at DESC
                LIMIT 1
            `, [placa]);
            const lastInsp = (lastInspRows && lastInspRows.length > 0) ? lastInspRows[0] : null;

            const configPlaca = (pRows && pRows.length > 0) ? (pRows[0].configuracion || pRows[0].tipo || '') : '';

            res.json({
                ok: true,
                placa,
                configuracion: configPlaca,
                id_inspeccion: lastInsp ? lastInsp.id_inspeccion : null,
                fecha_inspeccion: lastInsp ? lastInsp.fecha_inspeccion : null,
                km_vehiculo: lastInsp ? lastInsp.km_vehiculo : null,
                odometro_km: lastInsp ? lastInsp.km_vehiculo : null,
                observaciones: lastInsp ? (lastInsp.observaciones || '') : '',
                observaciones_generales: lastInsp ? (lastInsp.observaciones || '') : '',
                inspector: lastInsp ? lastInsp.inspector : null,
                dias_propuestos: lastInsp ? lastInsp.dias_propuestos : null,
                fecha_proxima: lastInsp ? lastInsp.fecha_proxima : null,
                datosPosiciones
            });
        } catch (err) {
            console.error("Error en placa-ultima:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 6. 🕒 ÚLTIMAS INSPECCIONES DE NEUMÁTICOS POR UNIDAD Y POSICIÓN
    // ============================================================
    router.get('/ultimas', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { empresa } = req.query;

            let sql = `
                SELECT 
                    d.id,
                    i.id_inspeccion,
                    i.fecha_inspeccion,
                    i.placa,
                    i.km_vehiculo as km,
                    d.posicion,
                    d.marca,
                    d.medida,
                    d.modelo,
                    d.r1,
                    d.r2,
                    d.r3,
                    d.r4,
                    d.remanente_promedio,
                    d.presion_ant,
                    d.presion_actual,
                    d.estado,
                    d.accion,
                    d.rot,
                    d.observaciones,
                    (d.foto1 IS NOT NULL AND d.foto1 != '') as tiene_foto1,
                    (d.foto2 IS NOT NULL AND d.foto2 != '') as tiene_foto2,
                    (d.foto3 IS NOT NULL AND d.foto3 != '') as tiene_foto3,
                    d.alerta_cambio,
                    p.cliente as dueno,
                    p.marca as marca_unidad,
                    p.tipo as tipo_unidad,
                    p.motora
                FROM (
                    SELECT i1.id_inspeccion, i1.placa, i1.fecha_inspeccion, i1.km_vehiculo
                    FROM neumaticos_inspecciones i1
                    JOIN (
                        SELECT placa, MAX(fecha_inspeccion) as max_fecha
                        FROM neumaticos_inspecciones
                        GROUP BY placa
                    ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
                ) i
                INNER JOIN neumaticos_inspecciones_det d ON d.id_inspeccion = i.id_inspeccion
                LEFT JOIN placas p ON p.placa = i.placa
                WHERE 1=1
            `;
            const params = [];

            if (empresa && empresa !== 'Todos') {
                sql += " AND p.cliente = ?";
                params.push(empresa);
            }

            sql += " ORDER BY i.placa ASC, CAST(d.posicion AS UNSIGNED) ASC, d.posicion ASC";

            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error("Error obteniendo últimas inspecciones de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 7. ⚠️ REQUERIMIENTOS DE LLANTAS (Remanente < 3 mm)
    // ============================================================
    router.get('/requerimientos', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { filtro } = req.query; // 'Motora', 'No Motora', 'Todos'

            let sql = `
                SELECT 
                    d.id,
                    i.id_inspeccion,
                    i.fecha_inspeccion,
                    i.placa,
                    i.km_vehiculo as km,
                    d.posicion,
                    d.marca,
                    d.medida,
                    d.modelo,
                    d.r1,
                    d.r2,
                    d.r3,
                    d.r4,
                    d.remanente_promedio,
                    d.presion_ant,
                    d.presion_actual,
                    d.estado,
                    d.accion,
                    d.rot,
                    d.observaciones,
                    (d.foto1 IS NOT NULL AND d.foto1 != '') as tiene_foto1,
                    (d.foto2 IS NOT NULL AND d.foto2 != '') as tiene_foto2,
                    (d.foto3 IS NOT NULL AND d.foto3 != '') as tiene_foto3,
                    p.cliente as dueno,
                    p.marca as marca_unidad,
                    p.tipo as tipo_unidad,
                    p.motora,
                    CASE 
                        WHEN (UPPER(TRIM(p.motora)) IN ('SI','1','MOTORA') OR p.tipo LIKE '%TRACTO%' OR p.tipo LIKE '%CAMION%') AND d.posicion IN ('1','2') THEN 'Delantera'
                        WHEN (UPPER(TRIM(p.motora)) IN ('SI','1','MOTORA') OR p.tipo LIKE '%TRACTO%' OR p.tipo LIKE '%CAMION%') AND d.posicion = 'R' THEN 'Repuesto'
                        WHEN (UPPER(TRIM(p.motora)) IN ('SI','1','MOTORA') OR p.tipo LIKE '%TRACTO%' OR p.tipo LIKE '%CAMION%') THEN 'Tracción'
                        WHEN d.posicion = 'R' THEN 'Repuesto'
                        ELSE 'Arrastre'
                    END as tipo_posicion
                FROM (
                    SELECT i1.id_inspeccion, i1.placa, i1.fecha_inspeccion, i1.km_vehiculo
                    FROM neumaticos_inspecciones i1
                    JOIN (
                        SELECT placa, MAX(fecha_inspeccion) as max_fecha
                        FROM neumaticos_inspecciones
                        GROUP BY placa
                    ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
                ) i
                INNER JOIN neumaticos_inspecciones_det d ON d.id_inspeccion = i.id_inspeccion
                LEFT JOIN placas p ON p.placa = i.placa
                WHERE (d.alerta_cambio = 1 OR d.remanente_promedio < ${MM_CRITICO})
            `;
            const params = [];

            if (filtro === 'Motora') {
                sql += " AND (p.motora = 'SI' OR p.motora = '1' OR p.tipo LIKE '%TRACTO%' OR p.tipo LIKE '%CAMION%')";
            } else if (filtro === 'No Motora') {
                sql += " AND (p.motora = 'NO' OR p.motora = '0' OR p.tipo LIKE '%REMOLQUE%' OR p.tipo LIKE '%CARRETA%')";
            }

            sql += " ORDER BY d.remanente_promedio ASC, i.placa ASC";

            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error("Error obteniendo requerimientos de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── GET /api/neumaticos/historial-posicion/:placa/:posicion ───
    // Solo lectura: lo medido en esa posición en cada inspección guardada (remanentes, PSI,
    // marca de rotación) y las rotaciones registradas en neumaticos_rotaciones que la tocan.
    router.get('/historial-posicion/:placa/:posicion', async (req, res) => {
        try {
            const tdb = getDb(req);
            const placa = (req.params.placa || '').trim().toUpperCase();
            const posicion = (req.params.posicion || '').trim().toUpperCase();
            if (!placa || !posicion) return res.status(400).json({ ok: false, error: 'Placa y posición requeridas' });

            const [inspecciones] = await tdb.query(`
                SELECT i.id_inspeccion, DATE_FORMAT(i.fecha_inspeccion, '%Y-%m-%d') AS fecha_inspeccion, i.km_vehiculo,
                       d.marca, d.modelo, d.medida, d.r1, d.r2, d.r3, d.r4, d.remanente_promedio,
                       d.presion_ant, d.presion_actual, d.estado, d.accion, d.rot, d.observaciones, d.alerta_cambio
                FROM neumaticos_inspecciones_det d
                INNER JOIN neumaticos_inspecciones i
                    ON d.id_inspeccion COLLATE utf8mb4_unicode_ci = i.id_inspeccion COLLATE utf8mb4_unicode_ci
                WHERE UPPER(TRIM(i.placa)) = ? AND UPPER(TRIM(d.posicion)) = ?
                ORDER BY i.fecha_inspeccion DESC, i.created_at DESC
                LIMIT 60
            `, [placa, posicion]);

            const [rotaciones] = await tdb.query(`
                SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, km_actual, posicion_origen, posicion_destino, motivo, tecnico
                FROM neumaticos_rotaciones
                WHERE UPPER(TRIM(placa)) = ? AND (UPPER(TRIM(posicion_origen)) = ? OR UPPER(TRIM(posicion_destino)) = ?)
                ORDER BY fecha DESC, id DESC
                LIMIT 60
            `, [placa, posicion, posicion]);

            res.json({ ok: true, placa, posicion, inspecciones, rotaciones });
        } catch (err) {
            console.error('Error en historial-posicion de neumáticos:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 8. 🚚 ESTADO ACTUAL DE NEUMÁTICOS POR PLACA (Visor Interactivo)
    // ============================================================
    router.get('/estado-actual/:placa', async (req, res) => {
        try {
            const tdb = getDb(req);
            const placa = (req.params.placa || '').trim().toUpperCase();

            if (!placa) {
                return res.status(400).json({ ok: false, error: 'Placa requerida' });
            }

            // Datos de la unidad desde tabla placas
            const [unidadRows] = await tdb.query(
                "SELECT * FROM placas WHERE placa COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci LIMIT 1",
                [placa]
            );
            const unidad = unidadRows[0] || { placa };

            // Obtener la última inspección de esta placa
            const [inspRows] = await tdb.query(
                "SELECT * FROM neumaticos_inspecciones WHERE placa COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci ORDER BY fecha_inspeccion DESC, created_at DESC LIMIT 1",
                [placa]
            );

            if (!inspRows || inspRows.length === 0) {
                return res.json({
                    ok: true,
                    placa,
                    unidad,
                    ultima_inspeccion: null,
                    posiciones: []
                });
            }

            const ultimaInsp = inspRows[0];

            // Obtener los detalles de las llantas en esa inspección
            const [detalles] = await tdb.query(
                "SELECT * FROM neumaticos_inspecciones_det WHERE id_inspeccion COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci ORDER BY CAST(posicion AS UNSIGNED) ASC, posicion ASC",
                [ultimaInsp.id_inspeccion]
            );

            res.json({
                ok: true,
                placa,
                unidad,
                ultima_inspeccion: ultimaInsp,
                posiciones: detalles || []
            });
        } catch (err) {
            console.error("Error obteniendo estado actual de neumáticos por placa:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── POST /api/neumaticos/importar — Importación masiva desde Excel ──────
    router.post('/importar', async (req, res) => {
        const tdb = getDb(req);
        const { inspecciones = [] } = req.body;

        if (!Array.isArray(inspecciones) || inspecciones.length === 0) {
            return res.status(400).json({ ok: false, error: 'No se recibieron datos de inspecciones para importar' });
        }

        try {
            await tdb.query('START TRANSACTION');

            let totalImportadas = 0;
            let totalLlantas = 0;

            for (const insp of inspecciones) {
                const placa = (insp.placa || '').trim().toUpperCase();
                let fecha_inspeccion = (insp.fecha_inspeccion || '').trim();
                
                // Formateo seguro de fecha
                if (!fecha_inspeccion || isNaN(new Date(fecha_inspeccion).getTime())) {
                    fecha_inspeccion = new Date().toISOString().split('T')[0];
                } else {
                    try {
                        fecha_inspeccion = new Date(fecha_inspeccion).toISOString().split('T')[0];
                    } catch(e) {
                        fecha_inspeccion = new Date().toISOString().split('T')[0];
                    }
                }

                const km_vehiculo = parseInt(insp.km_vehiculo || insp.odometro_km || insp.kilometraje || 0, 10);
                const items = insp.items || insp.llantas_inspeccionadas || [];

                if (!placa || items.length === 0) continue;

                const anioActual = new Date(fecha_inspeccion || Date.now()).getFullYear() || 2026;
                const rand = Math.floor(1000 + Math.random() * 9000);
                const id_inspeccion = insp.id_inspeccion || `NEU-${anioActual}-${rand}`;

                let fechaProxima = null;
                try {
                    const f = new Date(fecha_inspeccion);
                    f.setDate(f.getDate() + 30);
                    fechaProxima = f.toISOString().split('T')[0];
                } catch(e) {
                    fechaProxima = fecha_inspeccion;
                }

                await tdb.query(`
                    INSERT INTO neumaticos_inspecciones 
                    (id_inspeccion, placa, fecha_inspeccion, km_vehiculo, dias_propuestos, fecha_proxima, observaciones, inspector, total_llantas)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                    fecha_inspeccion = VALUES(fecha_inspeccion), km_vehiculo = VALUES(km_vehiculo), total_llantas = VALUES(total_llantas)
                `, [
                    id_inspeccion,
                    placa,
                    fecha_inspeccion,
                    km_vehiculo,
                    30,
                    fechaProxima,
                    insp.observaciones || insp.observaciones_generales || 'Importación Masiva Excel',
                    'Importador Excel',
                    items.length
                ]);

                // Limpiar detalles antiguos de esta inspección para evitar duplicados o conflictos
                await tdb.query("DELETE FROM neumaticos_inspecciones_det WHERE id_inspeccion = ?", [id_inspeccion]);

                for (const it of items) {
                    const r1 = parseInt(it.r1 || 0, 10);
                    const r2 = parseInt(it.r2 || 0, 10);
                    const r3 = parseInt(it.r3 || 0, 10);
                    const r4 = parseInt(it.r4 || 0, 10);
                    const rProm = (r4 > 0) ? (r1 + r2 + r3 + r4) / 4.0 : (r1 + r2 + r3) / 3.0;
                    const alertaCambio = rProm < MM_CRITICO ? 1 : 0;

                    await tdb.query(`
                        INSERT INTO neumaticos_inspecciones_det
                        (id_inspeccion, posicion, tipo_eje, marca, medida, modelo, r1, r2, r3, r4, presion_ant, presion_actual, estado, accion, rot, observaciones, foto1, foto2, foto3, alerta_cambio)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        id_inspeccion,
                        String(it.posicion || '1').toUpperCase(),
                        (it.tipo_eje || it.eje || '').toUpperCase(),
                        (it.marca || '').toUpperCase(),
                        (it.medida || '').toUpperCase(),
                        (it.modelo || '').toUpperCase(),
                        r1,
                        r2,
                        r3,
                        r4,
                        parseInt(it.presion_ant || 0, 10),
                        parseInt(it.presion_actual || 0, 10),
                        (it.estado || 'NUEVA').toUpperCase(),
                        it.accion || 'INSPECCION',
                        it.rot || 'NO',
                        it.observaciones || '',
                        it.foto1 || null,
                        it.foto2 || null,
                        it.foto3 || null,
                        alertaCambio
                    ]);
                    totalLlantas++;
                }
                totalImportadas++;
            }

            await tdb.query('COMMIT');
            return res.json({ ok: true, mensaje: `Se importaron ${totalImportadas} inspección(es) con ${totalLlantas} llanta(s) exitosamente.`, totalImportadas, totalLlantas });
        } catch (err) {
            await tdb.query('ROLLBACK');
            console.error("Error en importación de neumáticos:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── GET /api/neumaticos/exportar-datos — Exportación con 27 columnas oficiales ──────
    router.get('/exportar-datos', async (req, res) => {
        const tdb = getDb(req);
        try {
            const sql = `
                SELECT 
                    i.id_inspeccion AS ID,
                    DATE_FORMAT(i.fecha_inspeccion, '%Y-%m-%d') AS 'F. INSPECCION',
                    i.placa AS PLACA,
                    COALESCE(p.estado, 'Activa') AS 'ESTADO LLANT',
                    i.km_vehiculo AS KM,
                    d.posicion AS LLANTA,
                    COALESCE(p.cliente, 'PROPIO') AS 'DUEÑO',
                    COALESCE(p.marca, 'FLOTA') AS MARCA,
                    COALESCE(p.tipo, 'UNIDAD') AS UNIDAD,
                    COALESCE(d.tipo_eje, '') AS 'Delantera o Traccion',
                    d.marca AS 'MARCA DE LLANTA',
                    d.medida AS MEDIDA,
                    d.modelo AS MODELO,
                    d.r1 AS R1,
                    d.r2 AS R2,
                    d.r3 AS R3,
                    d.r4 AS R4,
                    d.presion_ant AS 'PRESION DE AIRE ANT',
                    d.presion_actual AS 'PRESION DE AIRE ACTUAL',
                    d.estado AS ESTADO,
                    d.accion AS ACCION,
                    d.observaciones AS OBS,
                    d.rot AS ROT,
                    LEAST(
                        COALESCE(NULLIF(d.r1, 0), 99),
                        COALESCE(NULLIF(d.r2, 0), 99),
                        COALESCE(NULLIF(d.r3, 0), 99),
                        COALESCE(NULLIF(d.r4, 0), 99)
                    ) AS 'R Min',
                    d.foto1 AS FOTO1,
                    d.foto2 AS FOTO2,
                    d.foto3 AS FOTO3
                FROM neumaticos_inspecciones_det d
                INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_general_ci = i.id_inspeccion COLLATE utf8mb4_general_ci
                LEFT JOIN placas p ON i.placa COLLATE utf8mb4_general_ci = p.placa COLLATE utf8mb4_general_ci
                ORDER BY i.fecha_inspeccion DESC, i.placa ASC, CAST(d.posicion AS UNSIGNED) ASC
            `;
            const [rows] = await tdb.query(sql);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error("Error exportando datos de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    return router;
};
