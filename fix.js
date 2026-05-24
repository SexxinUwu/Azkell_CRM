const fs = require('fs');

function fixRouter(file) {
    if (!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/app\.(get|post|put|delete)\('\/api\//g, "router.$1('/");
    fs.writeFileSync(file, code);
}

fixRouter('routes/planificacion.js');
fixRouter('routes/legacy.js');
