const fs = require('fs');

let rbac = fs.readFileSync('rbac.js', 'utf8');

// Fix Almacen user for /ot-materiales
rbac = rbac.replace(
    /else if \(path\.startsWith\('\/ot-materiales'\) \|\| path\.startsWith\('\/taller\/repuestos'\)\) mod = \['ot', 'trabajos_ot', 'status_rampa'\];/g,
    "else if (path.startsWith('/ot-materiales') || path.startsWith('/taller/repuestos')) mod = ['ot', 'trabajos_ot', 'status_rampa', 'sal_inv', 'inv'];"
);

// Fix Flota user for /script/guardarStatusFlota
rbac = rbac.replace(
    /else if \(path\.startsWith\('\/script\/'\)\) \{/g,
    "else if (path.startsWith('/script/guardarStatusFlota')) mod = ['status_rampa', 'fleet', 'ot'];\n    else if (path.startsWith('/script/')) {"
);

fs.writeFileSync('rbac.js', rbac);
console.log('RBAC fixed for Flota and Almacen!');
