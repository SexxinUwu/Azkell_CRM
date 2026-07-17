const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

module.exports = (db, logAudit) => {
    // GET /api/perfil/me
    router.get('/perfil/me', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        db.query(
            'SELECT nombre, correo, cargo, telefono, avatar_url, banner_url, firma_digital, preferencias_json FROM usuarios WHERE correo = ?',
            [req.user.correo],
            (err, results) => {
                if (err) return res.status(500).json({ error: err.message });
                if (results.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
                
                const user = results[0];
                try {
                    user.preferencias = user.preferencias_json ? JSON.parse(user.preferencias_json) : {};
                } catch(e) {
                    user.preferencias = {};
                }
                delete user.preferencias_json;
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

    // GET /api/perfil/sesiones
    router.get('/perfil/sesiones', (req, res) => {
        if (!req.user || !req.user.correo) return res.status(401).json({ error: 'No autenticado' });
        
        db.query(
            'SELECT id, ip, dispositivo, fecha_login, ultima_actividad, (token = ?) as actual FROM sesiones_activas WHERE usuario_correo = ? ORDER BY ultima_actividad DESC',
            [req.headers.authorization?.slice(7) || '', req.user.correo],
            (err, results) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(results);
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

    return router;
};
