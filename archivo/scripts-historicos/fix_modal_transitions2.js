const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const searchJs = `        var tcRow0 = document.getElementById('inv-tc-row');
    if (!id) return;
    
    if (!confirm('¿Estás seguro de que deseas eliminar el artículo ' + id + '? Esta acción lo desactivará o eliminará del sistema.')) return;`;

const replaceJs = `        var tcRow0 = document.getElementById('inv-tc-row');
        if (tcRow0) tcRow0.style.display = 'none';
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

js = js.replace(searchJs, replaceJs);
fs.writeFileSync(fileJs, js, 'utf8');
console.log('Fixed syntax error in logica.js');
