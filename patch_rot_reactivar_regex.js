const fs = require('fs');
let logica = fs.readFileSync('modulos/mantenimiento/reportes-ot/logica.js', 'utf8');

// 1. esAprobada
logica = logica.replace(
    /var esAprobada = \(estado === 'Aprobada' \|\| estado === 'En Proceso' \|\| estado === 'Pausada'\);/g,
    "var esAprobada = (estado === 'Aprobada' || estado === 'En Proceso' || estado === 'Pausada' || estado === 'Finalizado' || estado === 'Cerrada');"
);

// 2. rotAgregarSalida
logica = logica.replace(
    /if \(estadoOT === 'Finalizado' \|\| estadoOT === 'Cerrada' \|\| estadoOT === 'Anulado'\) \{/g,
    "if (estadoOT === 'Anulado') {"
);

// 3. Reactivar OT button in footer
logica = logica.replace(
    /\} else if \(estado === 'Aprobada'\) \{\s*ftHtml \+= '<button class="btn btn-sm btn-primary" onclick="window\.rotAccion\(\\'cerrar\\',\\'' \+ esc\(idOT\) \+ '\\'\)">'\s*\+ '<i class="bi bi-lock-fill me-1"><\/i>Cerrar OT<\/button>';\s*\}/g,
    `} else if (estado === 'Aprobada') {
            ftHtml += '<button class="btn btn-sm btn-primary" onclick="window.rotAccion(\\'cerrar\\',\\'' + esc(idOT) + '\\')">'
                    + '<i class="bi bi-lock-fill me-1"></i>Cerrar OT</button>';
        } else if (estado === 'Finalizado' || estado === 'Cerrada') {
            ftHtml += '<button class="btn btn-sm btn-outline-success" onclick="window.rotAccion(\\'reactivar\\',\\'' + esc(idOT) + '\\')">'
                    + '<i class="bi bi-arrow-counterclockwise me-1"></i>Reactivar OT</button>';
        }`
);

// 4. rotAccion reactivar logic
const reactivarLogic = `    if (accion === 'reactivar') {
        if (!window.guardAction('ot', 'e')) return;
        rotConfirmModerno('Reactivar OT', '¿Deseas reactivar la OT ' + idOT + '? Volverá a estar En Proceso.', function() {
            fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'reanudar' })
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

    if (accion === 'eliminar') {`;

logica = logica.replace(/if \(accion === 'eliminar'\) \{/g, reactivarLogic);

fs.writeFileSync('modulos/mantenimiento/reportes-ot/logica.js', logica);
console.log('Patched logica.js');
