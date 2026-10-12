const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/logica.js';
let code = fs.readFileSync(path, 'utf8');

// Undo the bad injection
code = code.replace(
    /window\._invRenderStockBadge = function\(actual, min, tipo\) \{[\s\S]*?\}     if \(minA === 0 && minB !== 0\) return 1;/m,
    "if (minA === 0 && minB !== 0) return 1;"
);

// Fix the actual _invRenderStockBadge
code = code.replace(
    /window\._invRenderStockBadge = function\(actual, min\) \{[\s\S]*?return '<span class="badge bg-success">Óptimo<\/span>';\n\};/m,
    "window._invRenderStockBadge = function(actual, min, tipo) {\n    if (tipo === 'Servicio') return '-';\n    var st = parseFloat(actual||0);\n    var mn = parseFloat(min||0);\n    if(st <= 0) return '<span class=\"badge bg-danger\">Sin Stock</span>';\n    if(st <= mn) return '<span class=\"badge bg-warning text-dark\">Stock Bajo</span>';\n    return '<span class=\"badge bg-success\">Óptimo</span>';\n};"
);

// Fix the display column in grid
code = code.replace(
    /parseFloat\(item\.stock_actual\|\|0\)\.toLocaleString\('es-PE',\{minimumFractionDigits:2,maximumFractionDigits:2\}\),\n\s*window\._invRenderStockBadge\(item\.stock_actual, item\.stock_min\)/m,
    "item.tipo === 'Servicio' ? '-' : parseFloat(item.stock_actual||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}),\n              window._invRenderStockBadge(item.stock_actual, item.stock_min, item.tipo)"
);

fs.writeFileSync(path, code);
console.log('Fixed inventario logica');
