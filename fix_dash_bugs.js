const fs = require('fs');
const path = require('path');

// 1. Fix logica.js
const fileJs = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// The injected block that needs to be moved
const badBlockRegex = /window\.finAbrirInvFam = function\(familia\) \{[\s\S]*?\}\s*;\s*/;
const match = js.match(badBlockRegex);

if (match) {
    const injectedCode = match[0];
    // Remove it from where it is
    js = js.replace(injectedCode, '');
    
    // Add it to the end of the file
    js += '\n\n// Funciones globales de modales extraídas del onClick\n' + injectedCode;
    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('Fixed logica.js error by moving window.finAbrirInvFam to global scope.');
} else {
    console.log('Could not find window.finAbrirInvFam block in logica.js');
}

// 2. Fix vista.html pagination
const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

// Cut the pagination from Top 10
const pagHtml = `<div id="fin-pag-muerto" class="mt-3 d-flex justify-content-end gap-3 align-items-center"></div>`;
if (html.includes(pagHtml)) {
    // Remove from first place
    html = html.replace(pagHtml, '');
    // Append to Inventario Muerto table
    const muertoTableEnd = `                        <tbody id="fin-tb-muerto">\n                            <!-- JS Injected -->\n                        </tbody>\n                    </table>\n                </div>`;
    if (html.includes(muertoTableEnd)) {
        html = html.replace(muertoTableEnd, muertoTableEnd + '\n                ' + pagHtml);
        fs.writeFileSync(fileHtml, html, 'utf8');
        console.log('Fixed pagination position in vista.html');
    } else {
        console.log('Could not find Inventario Muerto table end.');
    }
} else {
    console.log('Could not find fin-pag-muerto div.');
}
