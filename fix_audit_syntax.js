const fs = require('fs');

function fixAudit(filePath) {
    let code = fs.readFileSync(filePath, 'utf8');
    
    // Fix instances of: return if(typeof logAudit === 'function' && req.body.usuario) { ... } res.json(...);
    // by wrapping the return in a block: return (function(){ if(...) {...} return res.json(...); })();
    // Actually, simpler: replace `return if(typeof logAudit` with `{ if(typeof logAudit` 
    // AND we need to close the brace after res.json(...)
    
    // Using a regex to capture the whole `return if(...) { ... } res.json(...);`
    const regex = /return\s+if\(typeof logAudit === 'function' && req\.body\.usuario\)\s*\{\s*logAudit\([^}]+\);\s*\}\s*res\.json\(([^)]+)\);/g;
    
    code = code.replace(regex, (match, p1) => {
        return `{ if(typeof logAudit === 'function' && req.body.usuario) { logAudit(req.body.usuario, req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json(${p1}); }`;
    });

    fs.writeFileSync(filePath, code);
    console.log('Fixed syntax in ' + filePath);
}

fixAudit('./routes/almacen.js');
fixAudit('./routes/taller.js');
