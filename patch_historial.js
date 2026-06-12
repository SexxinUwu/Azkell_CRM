const fs = require('fs');
let js = fs.readFileSync('modulos/mantenimiento/status-rampa/logica.js', 'utf8');

// 1. Fix the Rampa Header to not squeeze text inside the 28px circle
const oldHeader = "html += '<span class=\"sr-badge-rampa\" style=\"background:#64748b;font-size:1rem;\">Rampa ' + esc(row.rampa || '?\"') + '</span>';";
const newHeader = "html += '<div style=\"font-size:1.1rem;font-weight:900;color:var(--text);margin-right:8px;display:flex;align-items:center;\">Rampa <span class=\"sr-badge-rampa\" style=\"background:#64748b;font-size:0.9rem;margin-left:6px;\">' + esc(row.rampa || '?\"') + '</span></div>';";

js = js.replace(oldHeader, newHeader);

// Wait, the character ? is encoded weirdly in the previous output as ?". 
// Let's do a safer replace using string splitting:
let parts = js.split(/html \+= '<span class="sr-badge-rampa" style="background:#64748b;font-size:1rem;">Rampa ' \+ esc\(row\.rampa \|\| '.*?'\) \+ '<\/span>';/);
if (parts.length === 2) {
    js = parts[0] + "html += '<div style=\"font-size:1.1rem;font-weight:900;color:var(--text);margin-right:8px;display:flex;align-items:center;\">Rampa <span class=\"sr-badge-rampa\" style=\"background:#64748b;font-size:0.9rem;margin-left:6px;\">' + esc(row.rampa || '?') + '</span></div>';" + parts[1];
}

// 2. Add OTs for the given rampa entry.
// We are in `window.srAbrirDetalleHistorial`
// Add a section after '</div>' of the "Fechas" box.
const addOTsBox = `
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

const replacePoint = "      html += '</div>';\n\n      var scroll  = document.getElementById('sr-hist-detalle-scroll');";
js = js.replace(replacePoint, "      html += '</div>';\n" + addOTsBox + "\n      var scroll  = document.getElementById('sr-hist-detalle-scroll');");

fs.writeFileSync('modulos/mantenimiento/status-rampa/logica.js', js);
console.log('patched historial header and ot box');
