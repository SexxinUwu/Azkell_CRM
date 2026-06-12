const fs = require('fs');
const path = 'modulos/mantenimiento/status-rampa/logica.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Add "Eliminar" to the drawer footer
const footerStart = "footer.innerHTML = '<button class=\"btn btn-sm btn-outline-secondary\" onclick=\"window.srAbrirDrawerEdicion(' + id + ')\"><i class=\"bi bi-pencil me-1\"></i>Editar Ingreso</button>'";
const footerEnd = "             + '<button class=\"btn btn-sm btn-outline-danger ms-auto\" onclick=\"window.srLiberarRampa(' + id + ')\"><i class=\"bi bi-box-arrow-right me-1\"></i>Liberar</button>';";

if(content.includes(footerStart) && !content.includes('srEliminarRegistroGeneral')) {
    content = content.replace(footerEnd, 
        "             + '<button class=\"btn btn-sm btn-danger ms-2\" onclick=\"window.srEliminarRegistroGeneral(' + id + ', \\'' + (e.ticket_entrada || e.id_ot || '') + '\\')\"><i class=\"bi bi-trash me-1\"></i>Eliminar</button>'\n" +
        footerEnd);
}

// 2. Add the `srEliminarRegistroGeneral` function
const eliminarFunc = `
window.srEliminarRegistroGeneral = function(idRampa, ticketOT) {
    if (!confirm('¿Eliminar este registro de rampa?\\n\\n¡ATENCIÓN! Esto también eliminará permanentemente la Orden de Trabajo (' + ticketOT + '), sus trabajos, repuestos e inspecciones vinculadas. Esta acción no se puede deshacer.')) return;
    
    // Primero eliminamos la OT y luego la rampa (o viceversa)
    var p1 = ticketOT ? fetch('/api/ordenes-trabajo/' + encodeURIComponent(ticketOT), { method: 'DELETE' }).then(function(r){return r.json();}) : Promise.resolve();
    
    p1.then(function() {
        return fetch('/api/taller-rampas/' + idRampa, { method: 'DELETE' }).then(function(r){return r.json();});
    }).then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Registro y OT vinculada eliminados', 'success');
        srCerrarDrawers();
        srFetchData();
    }).catch(function(err) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar', 'danger');
        console.error(err);
    });
};
`;

if(!content.includes('window.srEliminarRegistroGeneral = function')) {
    content += eliminarFunc;
}

fs.writeFileSync(path, content, 'utf8');
console.log("Patched status rampa successfully");
