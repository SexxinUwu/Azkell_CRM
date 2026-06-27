const fs = require('fs');

let rbac = fs.readFileSync('rbac.js', 'utf8');

rbac = rbac.replace(
    /else if \(path\.startsWith\('\/almacen\/familias'\) \|\| path\.startsWith\('\/almacen\/marcas'\) \|\| path\.startsWith\('\/almacen\/sistemas'\)\) mod = \['cfg_almacen'\];/g,
    "else if (path.startsWith('/almacen/familias') || path.startsWith('/almacen/marcas') || path.startsWith('/almacen/sistemas')) mod = ['cfg_almacen', 'inv'];"
);

fs.writeFileSync('rbac.js', rbac);
console.log('RBAC fixed for familias and marcas!');
