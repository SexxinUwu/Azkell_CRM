const fs = require('fs');

const pathVista = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/vista.html';
const pathLogica = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';

let vista = fs.readFileSync(pathVista, 'utf8');
let logica = fs.readFileSync(pathLogica, 'utf8');

// 1. Remove disabled from Placa, fix _cbFiltrar -> _entCbFiltrar
vista = vista.replace(/<input type="text" id="ent-f-ot-placa" class="ent-input-sm w-100" disabled placeholder="Se llenar[^"]*">/, 
                      '<input type="text" id="ent-f-ot-placa" class="ent-input-sm w-100" placeholder="Placa o vehículo...">');

vista = vista.replace(/oninput="window\._cbFiltrar\('ent-f-ot'\)"/g, 'oninput="window._entCbFiltrar(\'ent-f-ot\')"');
vista = vista.replace(/onfocus="window\._cbFiltrar\('ent-f-ot'\)"/g, 'onfocus="window._entCbFiltrar(\'ent-f-ot\')"');

// 2. Add id to modal title
if (!vista.includes('id="ent-modal-title"')) {
    vista = vista.replace(/<div style="font-size:\.95rem;font-weight:900;color:#0f172a;line-height:1\.1;">Nueva Orden de Compra<\/div>/, 
                          '<div id="ent-modal-title" style="font-size:.95rem;font-weight:900;color:#0f172a;line-height:1.1;">Nueva Orden de Compra</div>');
}

fs.writeFileSync(pathVista, vista);
console.log('Fixed vista.html: title id, ot dropdown positioning, editable placa');

// 3. Update dynamic title in _entToggleTipoOrden
const toggleTitleCode = `
        var titleEl = document.getElementById('ent-modal-title');
        if (titleEl) {
            titleEl.textContent = tipo.toLowerCase() === 'orden de servicio' ? 'Nueva Orden de Servicio' : 'Nueva Orden de Compra';
        }
`;

if (!logica.includes("titleEl.textContent = tipo.toLowerCase()")) {
    logica = logica.replace(
        /if \(tipo\.toLowerCase\(\) === 'orden de servicio'\) \{/,
        toggleTitleCode + "\n        if (tipo.toLowerCase() === 'orden de servicio') {"
    );
    fs.writeFileSync(pathLogica, logica);
    console.log('Fixed logica.js: dynamic title update');
} else {
    console.log('Dynamic title already in logica.js');
}

// 4. Also we need to make sure `ent-f-ot-placa` can be saved.
// In `guardarEntrada` we already do:
//       var ot_id = window._cbGet('ent-f-ot') || '';
//       if (tipo_orden.toLowerCase() === 'orden de servicio') {
//           placa = (document.getElementById('ent-f-ot-placa') || {}).value || '';
//       } else { ... }
// That is correct and it reads whatever the user typed or what was auto-filled!
