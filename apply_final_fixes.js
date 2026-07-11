const fs = require('fs');
const path = require('path');

// 1. Fix logica.js
const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');
js = js.replace(/if \(p\.marca_vehiculo\) marcasSet\[p\.marca_vehiculo\.trim\(\)\.toUpperCase\(\)\] = true;/g, 'if (p.marca) marcasSet[p.marca.trim().toUpperCase()] = true;');
fs.writeFileSync(fileJs, js, 'utf8');

// 2. Fix vista.html CSS
const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

const missingCSS = `
/* ─── Clases de Entradas para diseño idéntico ─────────────── */
.ent-doc-card {
    background: #fff;
    border-radius: 24px;
    padding: 14px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 2px 8px rgba(0,0,0,.04);
    margin-bottom: 12px;
}
.ent-field-label {
    font-size: .56rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .09em;
    color: #94a3b8;
    margin-bottom: 3px;
}
.ent-input-sm {
    width: 100%;
    height: 38px;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    padding: 0 11px;
    font-size: 12px;
    font-weight: 700;
    outline: none;
    transition: all .2s;
    color: #0f172a;
}
.ent-input-sm:focus { border-color: #2563eb; background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
`;

if (!html.includes('.ent-doc-card')) {
    html = html.replace('</style>', missingCSS + '\n</style>');
    fs.writeFileSync(fileHtml, html, 'utf8');
}

console.log('Fix applied.');
