const fs = require('fs');
const path = require('path');

// --- Backend: routes/almacen.js ---
const fileRoutes = path.join(__dirname, 'routes', 'almacen.js');
let routes = fs.readFileSync(fileRoutes, 'utf8');

const regexUpload = /\/\/ Upload imagen de artículo → Cloudinary[\s\S]*?router\.delete\('\/inventario\/:id\/imagen', \(req, res\) => \{[\s\S]*?\}\);/;
const repUpload = `// Upload imagen de artículo → AWS S3
router.post('/inventario/:id/imagen', _multerInv.single('imagen'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
    try {
        const { uploadToS3, deleteFromS3, s3KeyFromUrl } = require('../utils/s3');
        db.query('SELECT imagen_url FROM inventario WHERE id=?', [req.params.id], async (err, rows) => {
            if (!err && rows && rows.length > 0 && rows[0].imagen_url) {
                const oldKey = s3KeyFromUrl(rows[0].imagen_url);
                if (oldKey) await deleteFromS3(oldKey).catch(() => {});
            }
            
            const ext = req.file.originalname.split('.').pop() || 'jpg';
            const s3Key = \`almacen/inventario/\${req.params.id}/\${Date.now()}.\${ext}\`;
            const url = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
            
            db.query('UPDATE inventario SET imagen_url=? WHERE id=?', [url, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); }
                res.json({ ok: true, imagen_url: url });
            });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Eliminar imagen de artículo → AWS S3
router.delete('/inventario/:id/imagen', (req, res) => {
    try {
        const { deleteFromS3, s3KeyFromUrl } = require('../utils/s3');
        db.query('SELECT imagen_url FROM inventario WHERE id=?', [req.params.id], async (err, rows) => {
            if (!err && rows && rows.length > 0 && rows[0].imagen_url) {
                const oldKey = s3KeyFromUrl(rows[0].imagen_url);
                if (oldKey) await deleteFromS3(oldKey).catch(() => {});
            }
            db.query('UPDATE inventario SET imagen_url=NULL WHERE id=?', [req.params.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'ELIMINÓ', req.path); }
                res.json({ ok: true });
            });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});`;

if (regexUpload.test(routes)) {
    routes = routes.replace(regexUpload, repUpload);
    fs.writeFileSync(fileRoutes, routes, 'utf8');
    console.log('routes/almacen.js updated for AWS S3.');
} else {
    console.log('Regex not matched in routes/almacen.js');
}

// --- Frontend: modulos/almacen/inventario/logica.js ---
const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const regexObsRender = /\(item\.observaciones \? row\('Observaciones', _invEsc\(item\.observaciones\), true\) : ''\)/;
const repObsRender = `(function() {
                if (!item.observaciones) return '';
                var escaped = _invEsc(item.observaciones);
                var parts = escaped.split(/(?=\\[REG \\d{4}-\\d{2}-\\d{2}\\])/);
                var formatted = escaped;
                if (parts.length > 1) {
                    formatted = '<div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">' +
                        parts.map(function(p) { 
                            return p.trim() ? '<div style="background:rgba(0,0,0,0.02); padding:8px 12px; border-radius:8px; border:1px solid var(--border); font-size:0.8rem; line-height:1.4;">' + p.trim() + '</div>' : ''; 
                        }).join('') +
                        '</div>';
                }
                return row('Observaciones', formatted, true);
            })()`;

if (regexObsRender.test(js)) {
    js = js.replace(regexObsRender, repObsRender);
    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('logica.js updated for observaciones formatting.');
} else {
    console.log('Regex not matched in logica.js');
}
