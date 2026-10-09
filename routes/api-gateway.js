const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// ── En-memoria Rate Limiter por API Key ─────────────────────
const _apiKeyRpmMap = new Map(); // { keyString: [timestamp, timestamp, ...] }

// ── Middleware para Validación de API Keys de Terceros ─────
function validarApiKey(scopeRequerido) {
    return async function(req, res, next) {
        const startMs = Date.now();
        const targetDb = req.db || global.db;
        
        // 1. Extraer API Key del header Authorization (Bearer ak_live_...) o X-API-Key
        let rawKey = req.headers['x-api-key'] || '';
        const authHeader = req.headers['authorization'] || '';
        if (!rawKey && authHeader.startsWith('Bearer ')) {
            rawKey = authHeader.substring(7).trim();
        }

        if (!rawKey) {
            return res.status(401).json({
                error: 'No autorizado. Debes enviar tu API Key en el header "Authorization: Bearer <tu_api_key>" o "X-API-Key: <tu_api_key>".'
            });
        }

        try {
            // 2. Consultar la API Key en la base de datos MySQL
            targetDb.query(
                "SELECT * FROM api_keys WHERE api_key = ? LIMIT 1",
                [rawKey],
                (err, rows) => {
                    if (err || !rows || rows.length === 0) {
                        return res.status(401).json({ error: 'API Key inválida o no registrada en el ERP.' });
                    }

                    const keyData = rows[0];

                    // 3. Verificar estado
                    if (keyData.estado !== 'activo') {
                        return res.status(403).json({
                            error: `Esta API Key se encuentra ${keyData.estado.toUpperCase()}. Contacta al administrador del ERP.`
                        });
                    }

                    // 4. Verificar scopes requeridos
                    let scopes = [];
                    try {
                        scopes = typeof keyData.scopes === 'string' ? JSON.parse(keyData.scopes) : (keyData.scopes || []);
                    } catch(e) {
                        scopes = String(keyData.scopes || '').split(',').map(s => s.trim());
                    }

                    if (scopeRequerido && !scopes.includes('*') && !scopes.includes(scopeRequerido)) {
                        return res.status(403).json({
                            error: `Permiso insuficiente. Esta API Key no tiene asignado el scope requerido: "${scopeRequerido}".`
                        });
                    }

                    // 5. Rate Limiting por minuto (RPM)
                    const limitRpm = keyData.limite_rpm || 60;
                    const now = Date.now();
                    let timestamps = _apiKeyRpmMap.get(rawKey) || [];
                    timestamps = timestamps.filter(t => now - t < 60000);
                    if (timestamps.length >= limitRpm) {
                        return res.status(429).json({
                            error: `Límite de peticiones excedido (${limitRpm} req/min). Por favor espere unos segundos.`
                        });
                    }
                    timestamps.push(now);
                    _apiKeyRpmMap.set(rawKey, timestamps);

                    // 6. Actualizar contadores de uso en segundo plano
                    targetDb.query(
                        "UPDATE api_keys SET ultimo_uso = NOW(), peticiones_total = peticiones_total + 1 WHERE id = ?",
                        [keyData.id],
                        () => {}
                    );

                    // 7. Registrar log de auditoría
                    res.on('finish', () => {
                        const durationMs = Date.now() - startMs;
                        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
                        targetDb.query(
                            `INSERT INTO api_logs (api_key_id, api_key_nombre, endpoint, metodo, ip, status_code, tiempo_ms)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [keyData.id, keyData.nombre, req.originalUrl || req.url, req.method, clientIp.substring(0, 45), res.statusCode, durationMs],
                            () => {}
                        );
                    });

                    req.apiKeyUser = keyData;
                    next();
                }
            );
        } catch(eCatch) {
            return res.status(500).json({ error: 'Error interno de validación de API: ' + eCatch.message });
        }
    };
}

// ============================================================
// 🌐 ENDPOINTS PÚBLICOS V1 (REST API PARA CLIENTES Y PARTNERS)
// ============================================================

// 1. GET /api/v1/flota/unidades — Catálogo maestro de vehículos
router.get('/v1/flota/unidades', validarApiKey('flota:read'), (req, res) => {
    const targetDb = req.db || global.db;
    targetDb.query(
        `SELECT placa, cliente AS empresa, tipo, marca, modelo_uts AS modelo, 
                configuracion, combustible, anio, estado, serie_chasis, vin 
         FROM placas ORDER BY placa`,
        (err, rows) => {
            if (err) return res.status(500).json({ ok: false, error: err.message });
            res.json({
                ok: true,
                total: (rows || []).length,
                data: rows || []
            });
        }
    );
});

// 2. GET /api/v1/flota/gps-live — Telemetría satelital en tiempo real
router.get('/v1/flota/gps-live', validarApiKey('gps:read'), (req, res) => {
    const targetDb = req.db || global.db;
    // Si tenemos cache de Wialon en memoria o en global, devolverlo enriquecido
    const wialonCache = global._wialonCache && global._wialonCache.data ? global._wialonCache.data : (global._wialonCache || []);
    
    if (Array.isArray(wialonCache) && wialonCache.length > 0) {
        return res.json({
            ok: true,
            total_unidades: wialonCache.length,
            timestamp: new Date().toISOString(),
            data: wialonCache
        });
    }

    // Fallback: responder con última ubicación conocida
    targetDb.query(
        `SELECT placa, cliente AS empresa, tipo, marca, modelo_uts AS modelo 
         FROM placas WHERE estado = 'Activo' ORDER BY placa`,
        (err, rows) => {
            if (err) return res.status(500).json({ ok: false, error: err.message });
            res.json({
                ok: true,
                total_unidades: (rows || []).length,
                timestamp: new Date().toISOString(),
                data: (rows || []).map(r => ({
                    placa: r.placa,
                    empresa: r.empresa,
                    tipo: r.tipo,
                    marca_modelo: `${r.marca || ''} ${r.modelo || ''}`.trim(),
                    estado_motor: 'offline',
                    velocidad: 0,
                    lat: null,
                    lng: null,
                    ubicacion: 'Sin telemetría en vivo en este momento'
                }))
            });
        }
    );
});

// 3. GET /api/v1/mantenimiento/ordenes — Órdenes de Trabajo (OT)
router.get('/v1/mantenimiento/ordenes', validarApiKey('ot:read'), (req, res) => {
    const targetDb = req.db || global.db;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const estado = req.query.estado || '';
    
    let sql = "SELECT * FROM reportes_ot";
    let params = [];
    if (estado) {
        sql += " WHERE estado = ?";
        params.push(estado);
    }
    sql += " ORDER BY id_ot DESC LIMIT ?";
    params.push(limit);

    targetDb.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ ok: false, error: err.message });
        res.json({
            ok: true,
            total: (rows || []).length,
            data: rows || []
        });
    });
});

// 4. GET /api/v1/almacen/stock — Existencias e Inventario
router.get('/v1/almacen/stock', validarApiKey('inventario:read'), (req, res) => {
    const targetDb = req.db || global.db;
    targetDb.query(
        `SELECT id, codigo, descripcion, familia, marca, unidad_medida, stock_actual, stock_minimo, precio_unitario 
         FROM inventario ORDER BY descripcion`,
        (err, rows) => {
            if (err) return res.status(500).json({ ok: false, error: err.message });
            res.json({
                ok: true,
                total: (rows || []).length,
                data: rows || []
            });
        }
    );
});

// 5. GET /api/v1/operaciones/guias — Guías de Remisión
router.get('/v1/operaciones/guias', validarApiKey('guias:read'), (req, res) => {
    const targetDb = req.db || global.db;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    targetDb.query(
        `SELECT id, numero_guia, fecha_emision, cliente_razon_social, placa_tracto, placa_carreta, 
                conductor_nombre, peso_bruto_total, estado_sunat 
         FROM guias_remision ORDER BY id DESC LIMIT ?`,
        [limit],
        (err, rows) => {
            if (err) return res.status(500).json({ ok: false, error: err.message });
            res.json({
                ok: true,
                total: (rows || []).length,
                data: rows || []
            });
        }
    );
});

// ============================================================
// 🔒 ENDPOINTS DE GESTIÓN INTERNA (PANEL SISTEMA → API GATEWAY)
// ============================================================

// Listar todas las API Keys
router.get('/sistema/api-keys', (req, res) => {
    const targetDb = req.db || global.db;
    targetDb.query(
        "SELECT id, nombre, api_key, cliente_empresa, scopes, limite_rpm, estado, ultimo_uso, peticiones_total, creado_por, created_at FROM api_keys ORDER BY id DESC",
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// Crear una nueva API Key
router.post('/sistema/api-keys', (req, res) => {
    const targetDb = req.db || global.db;
    const { nombre, cliente_empresa, scopes, limite_rpm } = req.body;
    
    if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'El nombre descriptivo de la API Key es requerido.' });
    }

    const randomBytes = crypto.randomBytes(24).toString('hex');
    const newApiKey = `ak_live_${randomBytes}`;
    const scopesJson = JSON.stringify(Array.isArray(scopes) && scopes.length ? scopes : ['gps:read', 'flota:read']);
    const rpm = Number(limite_rpm) || 60;
    const autor = req.user ? (req.user.nombre || req.user.usuario || 'Admin') : 'Admin';

    targetDb.query(
        `INSERT INTO api_keys (nombre, api_key, cliente_empresa, scopes, limite_rpm, estado, creado_por)
         VALUES (?, ?, ?, ?, ?, 'activo', ?)`,
        [nombre.trim(), newApiKey, (cliente_empresa || '').trim(), scopesJson, rpm, autor],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                ok: true,
                id: result.insertId,
                api_key: newApiKey,
                mensaje: 'API Key generada con éxito. Cópiala y guárdala en un lugar seguro.'
            });
        }
    );
});

// Actualizar estado (Activar / Pausar / Revocar)
router.put('/sistema/api-keys/:id/estado', (req, res) => {
    const targetDb = req.db || global.db;
    const id = req.params.id;
    const { estado } = req.body;
    
    if (!['activo', 'inactivo', 'revocado'].includes(estado)) {
        return res.status(400).json({ error: 'Estado no válido.' });
    }

    targetDb.query(
        "UPDATE api_keys SET estado = ? WHERE id = ?",
        [estado, id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, mensaje: `API Key actualizada a estado "${estado}".` });
        }
    );
});

// Eliminar API Key
router.delete('/sistema/api-keys/:id', (req, res) => {
    const targetDb = req.db || global.db;
    const id = req.params.id;
    targetDb.query(
        "DELETE FROM api_keys WHERE id = ?",
        [id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, mensaje: 'API Key eliminada correctamente.' });
        }
    );
});

// Métricas de uso y logs recientes
router.get('/sistema/api-keys/metrics', (req, res) => {
    const targetDb = req.db || global.db;
    targetDb.query(
        `SELECT 
            COUNT(CASE WHEN estado = 'activo' THEN 1 END) AS total_activas,
            SUM(peticiones_total) AS peticiones_historicas
         FROM api_keys`,
        (err, rows) => {
            const stats = rows && rows[0] ? rows[0] : { total_activas: 0, peticiones_historicas: 0 };
            
            // Obtener logs recientes
            targetDb.query(
                "SELECT * FROM api_logs ORDER BY id DESC LIMIT 50",
                (errL, logRows) => {
                    res.json({
                        total_activas: stats.total_activas || 0,
                        peticiones_historicas: stats.peticiones_historicas || 0,
                        logs: logRows || []
                    });
                }
            );
        }
    );
});

module.exports = router;
