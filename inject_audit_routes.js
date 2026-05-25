const fs = require('fs');

function addAudit(filePath) {
    let code = fs.readFileSync(filePath, 'utf8');
    
    // Cambiar la firma para aceptar logAudit
    if (code.includes('module.exports = (db, _multerInv) => {')) {
        code = code.replace('module.exports = (db, _multerInv) => {', 'module.exports = (db, _multerInv, logAudit) => {');
    } else if (code.includes('module.exports = (db) => {')) {
        code = code.replace('module.exports = (db) => {', 'module.exports = (db, logAudit) => {');
    }

    // Inyectar logAudit en respuestas exitosas de creación, edición o eliminación
    // Esto es un enfoque heurístico pero efectivo para abarcar todos los movimientos.
    
    code = code.replace(/res\.json\(\{\s*ok:\s*true(.*?)\}\);/g, (match, p1) => {
        // Obtenemos el nombre de la ruta o intentamos inferir el mdulo y accin
        return `if(typeof logAudit === 'function' && req.body.usuario) { logAudit(req.body.usuario, req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } ${match}`;
    });

    fs.writeFileSync(filePath, code);
    console.log('Audit injected to ' + filePath);
}

addAudit('./routes/almacen.js');
addAudit('./routes/taller.js');
