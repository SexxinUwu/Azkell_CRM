const fs = require('fs');
let logica = fs.readFileSync('modulos/mantenimiento/reportes-ot/logica.js', 'utf8');

// 1. esAprobada
logica = logica.replace(
    "var esAprobada = (estado === 'Aprobada' || estado === 'En Proceso' || estado === 'Pausada');",
    "var esAprobada = (estado === 'Aprobada' || estado === 'En Proceso' || estado === 'Pausada' || estado === 'Finalizado' || estado === 'Cerrada');"
);

// 2. rotAgregarSalida
logica = logica.replace(
    "if (estadoOT === 'Finalizado' || estadoOT === 'Cerrada' || estadoOT === 'Anulado') {",
    "if (estadoOT === 'Anulado') {"
);

// 3. Reactivar OT button in footer
logica = logica.replace(
    "} else if (estado === 'Aprobada') {\n            ftHtml += '<button class=\"btn btn-sm btn-primary\" onclick=\"window.rotAccion(\\'cerrar\\',\\'' + esc(idOT) + '\\')\">'\n                    + '<i class=\"bi bi-lock-fill me-1\"></i>Cerrar OT</button>';\n        }",
    "} else if (estado === 'Aprobada') {\n            ftHtml += '<button class=\"btn btn-sm btn-primary\" onclick=\"window.rotAccion(\\'cerrar\\',\\'' + esc(idOT) + '\\')\">'\n                    + '<i class=\"bi bi-lock-fill me-1\"></i>Cerrar OT</button>';\n        } else if (estado === 'Finalizado' || estado === 'Cerrada') {\n            ftHtml += '<button class=\"btn btn-sm btn-outline-success\" onclick=\"window.rotAccion(\\'reactivar\\',\\'' + esc(idOT) + '\\')\">'\n                    + '<i class=\"bi bi-arrow-counterclockwise me-1\"></i>Reactivar OT</button>';\n        }"
);

// 4. rotAccion reactivar logic
const eliminarLogic = "if (accion === 'eliminar') {";
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

    `;
logica = logica.replace(eliminarLogic, reactivarLogic + eliminarLogic);

fs.writeFileSync('modulos/mantenimiento/reportes-ot/logica.js', logica);
console.log('Patched logica.js');
