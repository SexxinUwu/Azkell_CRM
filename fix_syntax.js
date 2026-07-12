const fs = require('fs');
const path = require('path');

const fileRoutes = path.join(__dirname, 'routes', 'almacen.js');
let routes = fs.readFileSync(fileRoutes, 'utf8');

// Replace the dangling code block
const badSyntax = `            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
    });
});`;

routes = routes.replace(badSyntax, '');
fs.writeFileSync(fileRoutes, routes, 'utf8');
console.log('Fixed syntax error in almacen.js');
