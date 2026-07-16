const fs = require('fs');

const pathVista = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/vista.html';
let vista = fs.readFileSync(pathVista, 'utf8');

// Inject CSS
if (!vista.includes('.form-servicio-mode')) {
    vista = vista.replace(
        '<style>',
        `<style>
    .form-servicio-mode .ent-doc-card > div > div:not(.servicio-keep) {
        display: none !important;
    }
    .form-servicio-mode .ent-doc-card:not(:first-child) {
        display: none !important;
    }
    `
    );
}

// Add servicio-keep to Articulo div
vista = vista.replace(
    /<!-- Art\u00edculo -->\s*<div>\s*<div class="ent-field-label">Art\u00edculo <span style="color:#ef4444;">\*<\/span><\/div>/,
    `<!-- Art\u00edculo -->
          <div class="servicio-keep">
            <div class="ent-field-label">Art\u00edculo <span style="color:#ef4444;">*</span></div>`
);
fs.writeFileSync(pathVista, vista);
console.log('Patched vista');

const pathLogica = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/logica.js';
let logica = fs.readFileSync(pathLogica, 'utf8');

// Update logica.js
logica = logica.replace(
    /var isServicio = window\._invActiveTab === 'servicios';[\s\S]*?if \(isServicio && !id\) \{/,
    `var isServicio = window._invActiveTab === 'servicios';
        
        var f = document.getElementById('form-inv-articulo');
        if (f) {
            if (isServicio) {
                f.classList.add('form-servicio-mode');
            } else {
                f.classList.remove('form-servicio-mode');
            }
        }
        
        if (isServicio && !id) {`
);

fs.writeFileSync(pathLogica, logica);
console.log('Patched logica');
