const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// The broken code starts at:
//         window._cbSet('inv-f-moneda', 'PEN', 'PEN (S/)');
//         var tcRow0 = document.getElementById('inv-tc-row');
//     if (!id) return;

const regex = /window\._cbSet\('inv-f-moneda',\s*'PEN',\s*'PEN\s*\(S\/\)'\);\s*var\s*tcRow0\s*=\s*document\.getElementById\('inv-tc-row'\);\s*if\s*\(!id\)\s*return;/;

const replaceJs = `window._cbSet('inv-f-moneda', 'PEN', 'PEN (S/)');
        var tcRow0 = document.getElementById('inv-tc-row');
        if (tcRow0) tcRow0.style.display = 'none';
        // Default unidad = Unidades
        window._cbSet('inv-f-unidad', 'Unidades', 'Unidades');
        window.invMsInit('');
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
    if (!id) return;`;

if (regex.test(js)) {
    js = js.replace(regex, replaceJs);
    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('Successfully fixed logica.js missing lines!');
} else {
    console.log('Could not find the broken block in logica.js');
}
