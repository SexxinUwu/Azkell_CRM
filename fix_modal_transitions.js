const fs = require('fs');
const path = require('path');

// 1. Fix logica.js missing lines
const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const searchJs = `        var tcRow0 = document.getElementById('inv-tc-row');
    if (!id) return;
    
    if (!confirm('¿Estás seguro de que deseas eliminar el artículo ' + id + '? Esta acción lo desactivará o eliminará del sistema.')) return;`;

const replaceJs = `        var tcRow0 = document.getElementById('inv-tc-row');
        if (tcRow0) tcRow0.style.display = 'none';
        // Default unidad = Unidades
        window._cbSet('inv-f-unidad', 'Unidades', 'Unidades');
    }

    var modal = document.getElementById('inv-form-drawer');
    if (modal) { 
        modal.style.display = 'flex'; 
        void modal.offsetWidth; 
        modal.classList.add('open'); 
    }
    var bd = document.getElementById('inv-drawer-backdrop');
    if (bd) bd.style.display = 'block';
};

window._invEliminarArticuloActual = function() {
    var editId = document.getElementById('inv-edit-id');
    var id = editId ? editId.value : '';
    if (!id) return;
    
    if (!confirm('¿Estás seguro de que deseas eliminar el artículo ' + id + '? Esta acción lo desactivará o eliminará del sistema.')) return;`;

if (js.includes(searchJs)) {
    js = js.replace(searchJs, replaceJs);
    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('logica.js fixed');
} else {
    console.log('searchJs not found in logica.js!');
}

// 2. Fix vista.html transitions
const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

// Desktop transition
html = html.replace(/transition:right \.3s cubic-bezier\(\.4,0,\.2,1\);/g, 'transition:none;');
// Mobile transition
html = html.replace(/transition: bottom \.35s cubic-bezier\(\.4,0,\.2,1\) !important;/g, 'transition:none !important;');

fs.writeFileSync(fileHtml, html, 'utf8');
console.log('vista.html transitions removed');
