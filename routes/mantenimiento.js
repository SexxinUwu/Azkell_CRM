const express = require('express');

module.exports = function (db, logAudit) {
    const router = express.Router();

    // GET /api/mantenimiento/inspecciones/config
    router.get('/inspecciones/config', (req, res) => {
        const query = 'SELECT * FROM mant_insp_templates ORDER BY orden ASC';
        db.query(query, (err, rows) => {
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

        db.getConnection((err, conn) => {
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

    return router;
};
