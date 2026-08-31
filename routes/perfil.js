const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

module.exports = (db, logAudit) => {
    // GET /api/perfil/me
    router.get('/perfil/me', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        db.query(
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
        
        db.query(`UPDATE usuarios SET ${fields.join(',')} WHERE correo=?`, values, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (logAudit) logAudit(req.user.correo, 'perfil', 'ACTUALIZÓ', 'Datos de perfil');
            res.json({ ok: true });
        });
    });

    // PUT /api/perfil/preferencias
    router.put('/perfil/preferencias', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        const prefsStr = JSON.stringify(req.body.preferencias || {});
        db.query('UPDATE usuarios SET preferencias_json=? WHERE correo=?', [prefsStr, req.user.correo], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    });

    // PUT /api/perfil/password
    router.put('/perfil/password', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        const { actual, nueva } = req.body;
        if (!actual || !nueva) return res.status(400).json({ error: 'Faltan datos' });
        
        db.query('SELECT password FROM usuarios WHERE correo=?', [req.user.correo], async (err, results) => {
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
            
            const newHash = await bcrypt.hash(nueva, 10);
            db.query('UPDATE usuarios SET password=?, password_visible=? WHERE correo=?', [newHash, nueva, req.user.correo], (err2) => {
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
        db.query(
            'DELETE FROM sesiones_activas WHERE TIMESTAMPDIFF(HOUR, ultima_actividad, NOW()) > 12 OR TIMESTAMPDIFF(DAY, fecha_login, NOW()) >= 1',
            () => {}
        );

        db.query(
            'SELECT id, ip, dispositivo, fecha_login, ultima_actividad, (token = ?) as actual FROM sesiones_activas WHERE usuario_correo = ? ORDER BY ultima_actividad DESC',
            [req.headers.authorization?.slice(7) || '', req.user.correo],
            (err, results) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(results);
            }
        );
    });

    // DELETE /api/perfil/sesiones-otras (Cerrar todas las demás sesiones excepto la actual)
    router.delete('/perfil/sesiones-otras', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        const currentToken = req.headers.authorization?.slice(7) || '';
        
        db.query(
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
        
        db.query(
            'DELETE FROM sesiones_activas WHERE id = ? AND usuario_correo = ?',
            [req.params.id, req.user.correo],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true });
            }
        );
    });

    // POST /api/auth/logout (Eliminar token de base de datos)
    router.post('/auth/logout', (req, res) => {
        const token = req.headers.authorization?.slice(7) || '';
        if (token) {
            db.query('DELETE FROM sesiones_activas WHERE token = ?', [token], () => {});
        }
        res.json({ ok: true });
    });

    return router;
};
