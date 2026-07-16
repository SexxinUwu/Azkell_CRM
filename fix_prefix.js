const fs = require('fs');

const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/routes/almacen.js';
let content = fs.readFileSync(path, 'utf8');

// Replace the ID generation logic for POST /inventario
content = content.replace(
    /const descFinal = descGenerada \|\| descripcion \|\| 'Sin nombre';\s*_generarCodigoAlmacen\('INV', null, \(err, id\) => \{/,
    `const descFinal = descGenerada || descripcion || 'Sin nombre';

    const prefix = (tipo === 'Servicio' || tipo === 'SERV') ? 'SERV' : 'INV';
    _generarCodigoAlmacen(prefix, null, (err, id) => {`
);

fs.writeFileSync(path, content);
console.log('Patched backend to use SERV prefix');
