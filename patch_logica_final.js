const fs = require('fs');

let logica = fs.readFileSync('modulos/mantenimiento/reportes-ot/logica.js', 'utf8');

// Fix duplicated `if (accion === 'reactivar') { ... }` blocks
// The easiest way is to use a regex to strip ALL of them, then inject one clean version before `if (accion === 'eliminar')`.
let reactivarBlockRegex = /if\s*\(accion\s*===\s*'reactivar'\)\s*\{[\s\S]*?\}\s*\},?\s*'success'\);\s*return;\s*\}/g;
logica = logica.replace(reactivarBlockRegex, '');

// Clean any leftover duplicated `if (accion === 'eliminar')` just in case
// Let's just find the first `if (accion === 'eliminar')` and insert the correct `reactivar` above it.
const cleanReactivar = `
    if (accion === 'reactivar') {
        if (!window.guardAction('ot', 'e')) return;
        rotConfirmModerno('Reactivar OT', '¿Deseas reactivar la OT ' + idOT + '? Volverá a estar En Proceso.', function() {
            fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'reactivar' }) // <-- FIXED! Was 'reanudar'
            })
            .then(function(res) { if(!res.ok) throw new Error(res.status); return res.json(); })
            .then(function() {
                if(typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT reactivada', 'success');
                window.rotCerrarDetalle();
                window.rotCargar();
            })
            .catch(function(err) {
                if(typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al reactivar OT', 'danger');
            });
        }, 'success');
        return;
    }
`;

logica = logica.replace("if (accion === 'eliminar') {", cleanReactivar + "\n    if (accion === 'eliminar') {");

// Now apply the Editar Fechas changes
logica = logica.replace(
    /ftHtml \+= '<button class="btn btn-sm btn-outline-secondary" onclick="window\.rotAccion\(\\'pdf\\',\\'' \+ esc\(idOT\) \+ '\\'\)">'/g,
    `if (puedeEditar) {
        ftHtml += '<button class="btn btn-sm btn-outline-info" onclick="window.rotAbrirSubDrawer(\\'rot-drawer-editar-fechas\\')">'
                + '<i class="bi bi-calendar3 me-1"></i>Editar Fechas</button>';
    }
    ftHtml += '<button class="btn btn-sm btn-outline-secondary" onclick="window.rotAccion(\\'pdf\\',\\'' + esc(idOT) + '\\')">'`
);

const fnFechas = `
window.rotAbrirEditarFechas = function(idOT) {
    if (!window.guardAction('ot', 'e')) return;
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot) return;
    
    window.rotEditFechasId = idOT;
    
    var fIniStr = ot.fecha_ingreso || ot.fecha_inicio_ot || '';
    var fFinStr = ot.fecha_hora_salida || '';
    
    var formatForInput = function(isoStr) {
        if (!isoStr) return '';
        try {
            var d = new Date(isoStr);
            if (isNaN(d.getTime())) return '';
            var pad = function(n) { return String(n).padStart(2, '0'); };
            return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch(e) { return ''; }
    };

    document.getElementById('rot-ef-inicio').value = formatForInput(fIniStr);
    document.getElementById('rot-ef-termino').value = formatForInput(fFinStr);
    
    window.rotAbrirSubDrawer('rot-drawer-editar-fechas');
};

window.rotGuardarFechas = function() {
    var idOT = window.rotEditFechasId;
    if (!idOT) return;
    
    var ini = document.getElementById('rot-ef-inicio').value;
    var fin = document.getElementById('rot-ef-termino').value;
    
    if (ini && fin && new Date(ini) > new Date(fin)) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La fecha de inicio no puede ser mayor al término.', 'warning');
        return;
    }
    
    fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT) + '/fechas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_inicio_ot: ini || null, fecha_hora_salida: fin || null })
    })
    .then(function(r) { if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(r) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Fechas actualizadas correctamente.', 'success');
        window.rotCerrarSubDrawer('rot-drawer-editar-fechas');
        window.rotCerrarDetalle();
        window.rotCargar();
    })
    .catch(function(e) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al actualizar las fechas.', 'danger');
    });
};
`;

if (!logica.includes('rotGuardarFechas')) {
    logica += '\n\n' + fnFechas;
}

// Ensure the button inside ftHtml calls window.rotAbrirEditarFechas(idOT) instead of rotAbrirSubDrawer directly, so it formats the dates first!
logica = logica.replace(`window.rotAbrirSubDrawer(\\'rot-drawer-editar-fechas\\')`, `window.rotAbrirEditarFechas(\\'' + esc(idOT) + '\\')`);

fs.writeFileSync('modulos/mantenimiento/reportes-ot/logica.js', logica);
console.log('Logica cleaned up and patched!');
