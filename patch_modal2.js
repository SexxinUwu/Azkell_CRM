const fs = require('fs');
const path = 'modulos/mantenimiento/reportes-ot/logica.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /'        <button type="button" class="btn btn-sm btn-primary" onclick="window\.generarPDF_OT\(window\.rotData\.find\(o=>String\(o\.ticket_entrada\|\|o\.id_ot\)===String\(\\''.*?\\'\)\), ' \+ JSON\.stringify\(trabajos\).*?\+ '\)"><i class="bi bi-printer"><\/i> Imprimir<\/button>'/g,
    `'        <button type="button" class="btn btn-sm btn-primary" onclick="window.generarPDF_OT(window.rotData.find(o=>String(o.ticket_entrada||o.id_ot)===String(\\'' + idOT + '\\')), window.currentVerTrabajos, window.currentVerMateriales)"><i class="bi bi-printer"></i> Imprimir</button>'`
);

content = content.replace(
    /btnPrint\.setAttribute\('onclick', "window\.generarPDF_OT\(.*?\)/,
    `btnPrint.setAttribute('onclick', "window.generarPDF_OT(window.rotData.find(o=>String(o.ticket_entrada||o.id_ot)===String('" + idOT + "')), window.currentVerTrabajos, window.currentVerMateriales)")`
);

// We must also set the global variables right before we open the modal
const searchTarget = `var myModal = new bootstrap.Modal(document.getElementById('modalFormatoOT'));`;
const insertVars = `window.currentVerTrabajos = trabajos;\n        window.currentVerMateriales = materiales;\n        `;

if(content.includes(searchTarget) && !content.includes('window.currentVerTrabajos = trabajos;')) {
    content = content.replace(searchTarget, insertVars + searchTarget);
}

fs.writeFileSync(path, content, 'utf8');
console.log("Safely patched onclick");
