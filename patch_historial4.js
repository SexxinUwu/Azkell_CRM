const fs = require('fs');
let js = fs.readFileSync('modulos/mantenimiento/status-rampa/logica.js', 'utf8');

const targetStr = "html += fld('Liberado por', esc(row.liberado_por || '?'));\n      html += '</div>';";
const targetStr2 = "html += fld('Liberado por', esc(row.liberado_por || '?'));\n        html += '</div>';";

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

if (js.includes(targetStr)) {
    js = js.replace(targetStr, targetStr + "\n" + addOTsBox);
} else if (js.includes(targetStr2)) {
    js = js.replace(targetStr2, targetStr2 + "\n" + addOTsBox);
} else {
    // try index
    let idx = js.indexOf("html += fld('Liberado por'");
    if (idx !== -1) {
        let nextDiv = js.indexOf("</div>';", idx);
        if (nextDiv !== -1) {
            let insertPos = nextDiv + 8;
            js = js.substring(0, insertPos) + "\n" + addOTsBox + js.substring(insertPos);
        }
    }
}

fs.writeFileSync('modulos/mantenimiento/status-rampa/logica.js', js);
console.log('patched OT box');
