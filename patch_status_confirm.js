const fs = require('fs');
const path = 'modulos/mantenimiento/status-rampa/logica.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Add srConfirmModerno if not exists
if (!content.includes('function srConfirmModerno')) {
    const confirmFunc = `
function srConfirmModerno(titulo, mensaje, onConfirm) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);opacity:0;transition:opacity 0.2s ease;';

    var box = document.createElement('div');
    box.className = 'rot-confirm-box';
    box.style.cssText = 'background:#fff;border-radius:12px;padding:20px;width:90%;max-width:380px;box-shadow:0 10px 25px rgba(0,0,0,0.2);transform:scale(0.95);transition:transform 0.2s ease;';

    box.innerHTML = 
        '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
        '<i class="bi bi-exclamation-triangle-fill text-danger" style="font-size:1.5rem;margin-right:12px;"></i>' +
        '<h6 style="margin:0;font-weight:700;font-size:1.05rem;color:#1e293b;">' + titulo + '</h6>' +
        '</div>' +
        '<p style="margin:0 0 20px 0;font-size:0.9rem;color:#475569;line-height:1.4;">' + mensaje + '</p>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
        '<button class="btn btn-sm btn-light" id="btn-cancel" style="border:1px solid #cbd5e1;color:#475569;font-weight:600;padding:6px 12px;border-radius:6px;">Cancelar</button>' +
        '<button class="btn btn-sm btn-danger" id="btn-ok" style="font-weight:600;padding:6px 12px;border-radius:6px;">Sí, eliminar</button>' +
        '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(function(){
        overlay.style.opacity = '1';
        box.style.transform = 'scale(1)';
    });

    var cancel = box.querySelector('#btn-cancel');
    var ok = box.querySelector('#btn-ok');

    function cerrar() {
        overlay.style.opacity = '0';
        box.style.transform = 'scale(0.95)';
        setTimeout(function(){ if(overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    }

    cancel.addEventListener('click', cerrar);
    overlay.addEventListener('click', function(e) { if(e.target === overlay) cerrar(); });

    ok.addEventListener('click', function() {
        cerrar();
        onConfirm();
    });
}
`;
    content += confirmFunc;
}

// 2. Replace the window.srEliminarRegistroGeneral function
const funcStart = 'window.srEliminarRegistroGeneral = function(idRampa, ticketOT) {';
if (content.includes(funcStart)) {
    // Find the end of the function. We know it ends with "};" after console.error(err);
    const oldCode = `window.srEliminarRegistroGeneral = function(idRampa, ticketOT) {
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
};`;
    
    const newCode = `window.srEliminarRegistroGeneral = function(idRampa, ticketOT) {
    srConfirmModerno(
        '¿Eliminar registro de rampa?',
        '¡ATENCIÓN! Esto también eliminará permanentemente la Orden de Trabajo asociada (' + ticketOT + '), sus trabajos, repuestos e inspecciones vinculadas. <b>Esta acción no se puede deshacer.</b>',
        function() {
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
        }
    );
};`;
    
    // Since we appended the function dynamically with fs.writeFileSync in previous steps, 
    // it's easier to just use string replace.
    content = content.replace(oldCode, newCode);
    
    // Fallback if exact match fails
    if (!content.includes('srConfirmModerno(')) {
        const regex = /window\.srEliminarRegistroGeneral = function\(idRampa, ticketOT\) \{[\s\S]*?console\.error\(err\);\n    \}\);\n\};/;
        content = content.replace(regex, newCode);
    }
}

fs.writeFileSync(path, content, 'utf8');
console.log("Patched status rampa confirm successfully");
