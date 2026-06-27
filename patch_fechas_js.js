const fs = require('fs');

// --- Patch logica.js ---
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
    fs.writeFileSync('modulos/mantenimiento/reportes-ot/logica.js', logica);
    console.log('Patched logica.js');
}

// --- Patch taller.js ---
let taller = fs.readFileSync('routes/taller.js', 'utf8');

const routeFechas = `
router.put('/ordenes-trabajo/:id/fechas', (req, res) => {
    const ticketId = req.params.id;
    const { fecha_inicio_ot, fecha_hora_salida } = req.body;
    db.query(
        "UPDATE ordenes_trabajo SET fecha_inicio_ot=?, fecha_hora_salida=? WHERE ticket_entrada=?",
        [fecha_inicio_ot || null, fecha_hora_salida || null, ticketId],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && (req.body && req.body.usuario)) { 
                logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ FECHAS', req.path); 
            }
            res.json({ ok: true });
        }
    );
});
`;

if (!taller.includes('/ordenes-trabajo/:id/fechas')) {
    taller = taller.replace('module.exports = router;', routeFechas + '\nmodule.exports = router;');
    fs.writeFileSync('routes/taller.js', taller);
    console.log('Patched taller.js');
}
