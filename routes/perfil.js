// Token de la sesión de la petición: cookie HttpOnly primero, luego Authorization: Bearer (apps nativas).
function tokenDeSesion(req) {
    const cookies = String((req.headers && req.headers['cookie']) || '');
    for (const c of cookies.split(';')) {
        const idx = c.indexOf('=');
        if (idx < 0 || c.slice(0, idx).trim() !== 'azkell_session') continue;
        const v = c.slice(idx + 1).trim();
        try { return decodeURIComponent(v); } catch { return v; }
    }
    const auth = req.headers && req.headers['authorization'];
    return auth && auth.startsWith('Bearer ') && auth.slice(7) ? auth.slice(7) : '';
}

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { motivoClaveRechazada } = require('../services/politica_clave');
const crypto = require('crypto');
const { getPresignedUploadUrl, getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');

// Fotos y portadas de perfil: solo imágenes, siempre bajo perfil/ (el bucket es privado)
const TIPOS_IMAGEN_PERFIL = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const CLAVE_IMAGEN_PERFIL = /^perfil\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

module.exports = (db, logAudit) => {
    const tdb = req => req.db || db;
    // GET /api/perfil/me
    router.get('/perfil/me', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        tdb(req).query(
            `SELECT u.nombre, u.correo, u.cargo, u.telefono, u.avatar_url, u.banner_url, u.firma_digital, u.preferencias_json, u.rol, u.rol_id, u.permisos_json, r.nombre AS rol_nombre, r.permisos_json AS r_permisos_json, r.es_admin AS rol_es_admin
             FROM usuarios u
             LEFT JOIN roles r ON u.rol_id = r.id
             WHERE u.correo = ?`,
            [req.user.correo],
            (err, results) => {
                if (err) return res.status(500).json({ error: err.message });
                if (results.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
                
                const user = results[0];
                let permisosFinales = {};
                let correoMin = (user.correo || '').trim().toLowerCase();
                let rolLabel = user.rol_nombre || user.rol || 'Personalizado';
                let esAdmin = (user.rol && user.rol.toLowerCase().includes('admin')) || user.rol_es_admin;
                if (correoMin === 'admin@azkell.com') {
                    permisosFinales = { admin: true };
                    rolLabel = 'Fundador';
                } else if (esAdmin) {
                    permisosFinales = { admin: true };
                    rolLabel = user.rol || user.rol_nombre || 'Administrador';
                } else {
                    try {
                        let raw = user.r_permisos_json || user.permisos_json || '{}';
                        permisosFinales = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                        if (typeof permisosFinales === 'string') permisosFinales = JSON.parse(permisosFinales);
                    } catch (e) { permisosFinales = {}; }
                }
                user.rol = rolLabel;
                user.permisos = permisosFinales;
                try {
                    user.preferencias = user.preferencias_json ? JSON.parse(user.preferencias_json) : {};
                } catch(e) {
                    user.preferencias = {};
                }
                delete user.preferencias_json;
                delete user.r_permisos_json;
                res.json(user);
            }
        );
    });

    // PUT /api/perfil/me
    router.put('/perfil/me', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        const { nombre, telefono, avatar_url, banner_url, firma_digital } = req.body;
        
        const fields = [];
        const values = [];
        
        if (nombre !== undefined) { fields.push('nombre=?'); values.push(nombre); }
        if (telefono !== undefined) { fields.push('telefono=?'); values.push(telefono); }
        if (avatar_url !== undefined) { fields.push('avatar_url=?'); values.push(avatar_url); }
        if (banner_url !== undefined) { fields.push('banner_url=?'); values.push(banner_url); }
        if (firma_digital !== undefined) { fields.push('firma_digital=?'); values.push(firma_digital); }
        
        if (fields.length === 0) return res.json({ ok: true });
        
        values.push(req.user.correo);

        // "Antes" para el registro firmado: los datos de perfil tal como estaban (sin fotos ni firma)
        tdb(req).query('SELECT nombre, telefono FROM usuarios WHERE correo=?', [req.user.correo], (errA, filasA) => {
            if (!errA && filasA && filasA[0]) req.auditAntes = filasA[0];
            tdb(req).query(`UPDATE usuarios SET ${fields.join(',')} WHERE correo=?`, values, (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (logAudit) logAudit(req.user.correo, 'perfil', 'ACTUALIZÓ', 'Datos de perfil');
                res.json({ ok: true });
            });
        });
    });

    // PUT /api/perfil/preferencias
    router.put('/perfil/preferencias', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        const prefsStr = JSON.stringify(req.body.preferencias || {});
        tdb(req).query('UPDATE usuarios SET preferencias_json=? WHERE correo=?', [prefsStr, req.user.correo], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    });

    // PUT /api/perfil/password
    router.put('/perfil/password', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        const { actual, nueva } = req.body;
        if (!actual || !nueva) return res.status(400).json({ error: 'Faltan datos' });
        
        tdb(req).query('SELECT password FROM usuarios WHERE correo=?', [req.user.correo], async (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            if (results.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
            
            const hashDb = results[0].password;
            let esValida = false;
            
            if (hashDb && (hashDb.startsWith('$2b$') || hashDb.startsWith('$2a$'))) {
                esValida = await bcrypt.compare(actual, hashDb);
            } else {
                esValida = (actual === hashDb);
            }
            
            if (!esValida) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

            const motivo = await motivoClaveRechazada(nueva, actual);
            if (motivo) return res.status(400).json({ error: motivo });

            // La clave nueva solo se guarda como hash; password_visible queda vacío (no hay texto plano)
            const newHash = await bcrypt.hash(nueva, 10);
            tdb(req).query('UPDATE usuarios SET password=?, password_visible=? WHERE correo=?', [newHash, '', req.user.correo], (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (logAudit) logAudit(req.user.correo, 'perfil', 'CAMBIO CLAVE', 'Cambió su contraseña');
                res.json({ ok: true });
            });
        });
    });

    // GET /api/perfil/sesiones (Con limpieza automática de sesiones > 12 horas)
    router.get('/perfil/sesiones', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        // Limpieza de sesiones inactivas
        tdb(req).query(
            'DELETE FROM sesiones_activas WHERE TIMESTAMPDIFF(HOUR, ultima_actividad, NOW()) > 12 OR TIMESTAMPDIFF(DAY, fecha_login, NOW()) >= 1',
            () => {}
        );

        tdb(req).query(
            'SELECT id, ip, dispositivo, fecha_login, ultima_actividad, (token = ?) as actual FROM sesiones_activas WHERE usuario_correo = ? ORDER BY ultima_actividad DESC',
            [tokenDeSesion(req), req.user.correo],
            (err, results) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(results);
            }
        );
    });

    // DELETE /api/perfil/sesiones-otras (Cerrar todas las demás sesiones excepto la actual)
    router.delete('/perfil/sesiones-otras', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        const currentToken = tokenDeSesion(req);
        
        tdb(req).query(
            'DELETE FROM sesiones_activas WHERE usuario_correo = ? AND token != ?',
            [req.user.correo, currentToken],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true, eliminadas: result.affectedRows });
            }
        );
    });

    // DELETE /api/perfil/sesiones/:id
    router.delete('/perfil/sesiones/:id', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        tdb(req).query(
            'DELETE FROM sesiones_activas WHERE id = ? AND usuario_correo = ?',
            [req.params.id, req.user.correo],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true });
            }
        );
    });

    // GET /api/perfil/imagen-upload-url — URL firmada para subir foto o portada directo a S3 (solo imágenes)
    router.get('/perfil/imagen-upload-url', async (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        const tipo = String(req.query.contentType || '').toLowerCase();
        if (!TIPOS_IMAGEN_PERFIL[tipo]) return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG o WebP.' });
        try {
            const key = `perfil/${crypto.randomUUID()}.${TIPOS_IMAGEN_PERFIL[tipo]}`;
            const uploadUrl = await getPresignedUploadUrl(key, tipo, 300);
            const region = (process.env.AWS_REGION || 'us-east-2').trim();
            const bucket = (process.env.AWS_BUCKET_NAME || '').trim();
            res.json({ uploadUrl, fileUrl: `https://${bucket}.s3.${region}.amazonaws.com/${key}` });
        } catch (e) {
            console.error('Error generando URL de imagen de perfil:', e);
            res.status(500).json({ error: 'No se pudo preparar la subida. Intenta de nuevo.' });
        }
    });

    // POST /api/perfil/imagen-lectura — URL firmada (1 h) para ver una foto o portada de perfil
    router.post('/perfil/imagen-lectura', async (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        const clave = s3KeyFromUrl(String((req.body && req.body.url) || ''));
        if (!clave || !CLAVE_IMAGEN_PERFIL.test(clave)) return res.status(400).json({ error: 'Imagen no válida' });
        try {
            res.json({ url: await getPresignedUrl(clave, 3600) });
        } catch (e) {
            console.error('Error firmando imagen de perfil:', e);
            res.status(500).json({ error: 'No se pudo abrir la imagen.' });
        }
    });

    // POST /api/auth/logout (Eliminar token de base de datos)
    router.post('/auth/logout', (req, res) => {
        const token = tokenDeSesion(req);
        if (token) {
            tdb(req).query('DELETE FROM sesiones_activas WHERE token = ?', [token], () => {});
        }
        res.json({ ok: true });
    });

    return router;
};
