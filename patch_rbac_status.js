const fs = require('fs');

let rbac = fs.readFileSync('rbac.js', 'utf8');

// Add 'status' to the guardarStatusFlota route
rbac = rbac.replace(
    /else if \(path\.startsWith\('\/script\/guardarStatusFlota'\)\) mod = \['status_rampa', 'fleet', 'ot'\];/g,
    "else if (path.startsWith('/script/guardarStatusFlota')) mod = ['status_rampa', 'fleet', 'ot', 'status'];"
);

// Add /almacen/notificaciones to globalReferenceGets so it doesn't throw 403 on polling for non-almacen users
rbac = rbac.replace(
    "        '/catalogos_taller'\n    ];",
    "        '/catalogos_taller',\n        '/almacen/notificaciones/resumen'\n    ];"
);

fs.writeFileSync('rbac.js', rbac);
console.log('RBAC fixed for Status Flota and Notificaciones!');
