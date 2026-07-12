const fs = require('fs');
const path = require('path');

const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

// Fix CSS class
html = html.replace(
    /\.fin-td-nombre \{ font-weight: 600; color: #2563eb; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; \}/,
    '.fin-td-nombre { font-weight: 600; color: #2563eb; }'
);

// Fix headers Top 10
const regexTop10 = /<th>ARTÍCULO<\/th>\s*<th>STOCK<\/th>\s*<th style="text-align: right;">TOTAL \(S\/\)<\/th>/;
const repTop10 = '<th style="width: 100%">ARTÍCULO</th>\n                            <th style="white-space: nowrap;">STOCK</th>\n                            <th style="white-space: nowrap; text-align: right;">TOTAL (S/)</th>';
html = html.replace(regexTop10, repTop10);

// Fix headers Inventario Muerto
const regexMuerto = /<th>ARTÍCULO<\/th>\s*<th>ÚLTIMA SALIDA<\/th>\s*<th style="text-align: right;">VALOR PERDIDO \(S\/\)<\/th>/;
const repMuerto = '<th style="width: 100%">ARTÍCULO</th>\n                            <th style="white-space: nowrap;">ÚLTIMA SALIDA</th>\n                            <th style="white-space: nowrap; text-align: right;">VALOR PERDIDO (S/)</th>';
html = html.replace(regexMuerto, repMuerto);

fs.writeFileSync(fileHtml, html, 'utf8');
console.log('Vista updated successfully.');
