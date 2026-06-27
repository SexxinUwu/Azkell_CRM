const fs = require('fs');

let lines = fs.readFileSync('modulos/mantenimiento/reportes-ot/logica.js', 'utf8').split('\n');

let newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("if (accion === 'reactivar') {")) {
        skip = true;
        continue;
    }
    if (skip && lines[i].includes("if (accion === 'eliminar') {")) {
        skip = false;
        // Insert clean block right before "eliminar"
        newLines.push(`    if (accion === 'reactivar') {
        if (!window.guardAction('ot', 'e')) return;
        rotConfirmModerno('Reactivar OT', '¿Deseas reactivar la OT ' + idOT + '? Volverá a estar En Proceso.', function() {
            fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'reactivar' })
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
`);
        // Fall through to push 'eliminar'
    }
    
    if (!skip) {
        newLines.push(lines[i]);
    }
}

fs.writeFileSync('modulos/mantenimiento/reportes-ot/logica.js', newLines.join('\n'));
console.log('Fixed duplications!');
