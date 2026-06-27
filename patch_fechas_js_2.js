const fs = require('fs');

let logica = fs.readFileSync('modulos/mantenimiento/reportes-ot/logica.js', 'utf8');

logica = logica.replace(
    /ftHtml \+= '<button class="btn btn-sm btn-outline-secondary" onclick="window\.rotAccion\(\\'pdf\\',\\'' \+ esc\(idOT\) \+ '\\'\)">'/g,
    `if (puedeEditar) {
        ftHtml += '<button class="btn btn-sm btn-outline-info" onclick="window.rotAbrirEditarFechas(\\'' + esc(idOT) + '\\')">'
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
    
    document.getElementById('rot-panel-editar-fechas').classList.add('open');
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
        document.getElementById('rot-panel-editar-fechas').classList.remove('open');
        window.rotCerrarDetalle();
        window.rotCargar();
    })
    .catch(function(e) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al actualizar las fechas.', 'danger');
    });
};
`;

if (!logica.includes('rotAbrirEditarFechas')) {
    logica += '\n\n' + fnFechas;
}

fs.writeFileSync('modulos/mantenimiento/reportes-ot/logica.js', logica);
console.log('Patched logica.js successfully');
