const fs = require('fs');
let js = fs.readFileSync('modulos/mantenimiento/status-rampa/logica.js', 'utf8');

// 1. Prepend srFormatID
if (!js.includes('window.srFormatID = function')) {
    js = `\nwindow.srFormatID = function(id) {
    if (!id || !id.includes('-')) return id;
    var parts = id.split('-');
    if (parts.length >= 3) {
        if (parts[1].startsWith('20')) {
            return parts[1] + '-' + parts[2];
        } else {
            return parts[2] + '-' + parts[1];
        }
    }
    return id;
};\n` + js;
}

// 2. Fix the Delete button in srAbrirDetalle footer
js = js.replace(
    /onclick="window\.srEliminarStatusRampa\(' \+ id \+ '\)"/g,
    `onclick="window.srEliminarRegistroGeneral(' + id + ', \\'' + (e.ticket_entrada || e.id_ot || '') + '\\')"`
);

// 3. Add bottom:0 logic for drawers in srAbrirDetalle
js = js.replace(
    /panel\.classList\.add\('open'\);(\s*)var rampaIdx/g,
    `panel.classList.add('open');\n    var bd = document.getElementById('srDrawerBackdrop');\n    if (bd) bd.classList.add('open');\n\n    var rampaIdx`
);
// And in srCerrarDrawers
js = js.replace(
    /if \(p2\) p2\.classList\.remove\('open'\);(\s*)\}/g,
    `if (p2) p2.classList.remove('open');\n    var bd = document.getElementById('srDrawerBackdrop');\n    if (bd) bd.classList.remove('open');\n}`
);

// 4. Update the History Rampa Header and OT Box!
js = js.replace(
    /'<span class="sr-badge-rampa" style="background:#64748b;font-size:1rem;">Rampa ' \+ esc\(row\.rampa \|\| '—'\) \+ '<\/span>';/g,
    `'<div style="font-size:1.1rem;font-weight:900;color:var(--text);margin-right:8px;display:flex;align-items:center;">Rampa <span class="sr-badge-rampa" style="background:#64748b;font-size:0.9rem;margin-left:6px;">' + esc(row.rampa || '?') + '</span></div>';`
);

let otBox = `
    // Buscar OTs generadas en el intervalo de esta rampa para esta placa
    if (window.srOtData && window.srOtData.length) {
        var fStart = new Date(row.fecha_ingreso);
        var fEnd = row.fecha_liberado ? new Date(row.fecha_liberado) : new Date();
        fStart.setHours(0,0,0,0);
        fEnd.setHours(23,59,59,999);

        var ots = window.srOtData.filter(function(o) {
            if (String(o.placa).toUpperCase() !== String(row.placa).toUpperCase()) return false;
            var otD = new Date(o.fecha_ingreso);
            return otD >= fStart && otD <= fEnd;
        });

        if (ots.length) {
            html += '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:10px;">';
            html += '<div style="background:var(--bg);padding:8px 12px;font-size:0.73rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--subtext);border-bottom:1px solid var(--border);">Órdenes Generadas</div>';
            ots.forEach(function(o) {
                var idOt = o.id_ot || o.ticket_entrada;
                html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">';
                html += '<div>';
                html += '<div style="font-weight:700;color:var(--primary,#5865F2);font-size:0.85rem;">' + window.srFormatID(idOt) + '</div>';
                html += '<div style="font-size:0.75rem;color:var(--subtext);">' + esc(o.estado || '') + '</div>';
                html += '</div>';
                html += '<button class="btn btn-sm btn-light" style="padding:4px 8px;font-size:0.75rem;" onclick="window.srCerrarDetalleHist(); setTimeout(function(){window.srAbrirDetalleOT(\\'' + idOt + '\\')}, 300);"><i class="bi bi-eye"></i></button>';
                html += '</div>';
            });
            html += '</div>';
        }
    }
`;

js = js.replace(
    /html \+= fld\('Liberado por', esc\(row\.liberado_por \|\| '—'\)\);\n\s*html \+= '<\/div>';/g,
    `html += fld('Liberado por', esc(row.liberado_por || '?'));\n    html += '</div>';\n` + otBox
);

// 5. Append srEliminarRegistroGeneral and srConfirmModerno
let bottomCode = `

window.srEliminarRegistroGeneral = function(idRampa, ticketOT) {
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
};

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
if (!js.includes('window.srEliminarRegistroGeneral')) {
    js += bottomCode;
}

fs.writeFileSync('modulos/mantenimiento/status-rampa/logica.js', js);
console.log('Fixed logica.js perfectly!');
