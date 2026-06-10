const fs = require('fs');
const path = require('path');

const logicaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/logica.js');
const vistaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/vista.html');

let logicaContent = fs.readFileSync(logicaPath, 'utf8');
let vistaContent = fs.readFileSync(vistaPath, 'utf8');

// 1. Clean logica.js
// Remove Tailwind CDN Injection
logicaContent = logicaContent.replace(/\/\/ Inject Tailwind for mobile view dynamically[\s\S]*?\n\)\(\);\n/g, '');

// Fix rotRenderTabla (restore it to 49d73b1 state)
const startIdx = logicaContent.indexOf('window.rotRenderTabla = function(lista) {');
if(startIdx > -1) {
    let endIdx = logicaContent.indexOf('window.rotAbrirDetalle = function', startIdx);
    if(endIdx === -1) endIdx = logicaContent.indexOf('// ── Abrir drawer de detalle', startIdx);

    const newRenderTabla = `window.rotRenderTabla = function(lista) {
    var tbody = document.getElementById('rot-tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="td-empty">No hay resultados con los filtros aplicados.</td></tr>';
        return;
    }

    var html = '';
    for (var i = 0; i < lista.length; i++) {
        var ot  = lista[i];
        var det = rotDetalles(ot);
        var esActiva = (window.rotDetalleId !== null && String(window.rotDetalleId) === String(ot.ticket_entrada || ot.id_ot));
        var idOT = ot.ticket_entrada || ot.id_ot || '—';
        var obs  = rotEscHtml((det.motivo || ot.observaciones || '').substring(0, 80)) + ((det.motivo || ot.observaciones || '').length > 80 ? '…' : '');

        html += '<tr class="' + (esActiva ? 'rot-row-activa' : '') + '" onclick="window.rotAbrirDetalle(\\'' + rotEscHtml(String(idOT)) + '\\')">';
        html += '<td onclick="event.stopPropagation();" style="white-space:nowrap;padding:8px 10px;">' + rotBotonesAccion(ot) + '</td>';
        html += '<td style="font-weight:800;color:var(--primary,#5865F2);white-space:nowrap;">' + rotEscHtml(String(idOT)) + '</td>';
        html += '<td style="font-weight:700;">' + rotEscHtml(ot.placa || '—') + '</td>';
        html += '<td style="font-size:0.85rem;color:var(--text);">' + rotEscHtml(det.km ? Number(det.km).toLocaleString('es-PE') + ' km' : '—') + '</td>';
        html += '<td>' + rotBadgeTipo(det.tipo_ot || ot.tipo || '') + (det.sub_tipo ? '<span style="color:var(--subtext);font-size:0.78rem;margin-left:5px;">' + rotEscHtml(det.sub_tipo) + '</span>' : '') + '</td>';
        html += '<td style="font-size:0.8rem;">' + rotEscHtml(det.supervisor || ot.supervisor || '—') + '</td>';
        html += '<td>' + rotBadgeSituacion(det.situacion_inicial || ot.situacion) + '</td>';
        html += '<td style="font-size:0.78rem;color:var(--subtext);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + rotEscHtml(det.motivo || ot.observaciones || '') + '">' + (obs || '—') + '</td>';
        html += '<td style="font-weight:700;color:#16a34a;">' + rotFmtMoney(ot.costo_total) + '</td>';
        html += '<td style="font-size:0.78rem;color:var(--subtext);white-space:nowrap;">' + rotFmtFecha(ot.fecha_ingreso || ot.creado_en) + '</td>';
        html += '</tr>';
    }
    
    tbody.innerHTML = html;
};

`;

    logicaContent = logicaContent.substring(0, startIdx) + newRenderTabla + logicaContent.substring(endIdx);
}

fs.writeFileSync(logicaPath, logicaContent, 'utf8');

// 2. Clean vista.html
// Remove the Mobile UI section
const startMobileIdx = vistaContent.indexOf('<!-- Contenedor principal de la Vista Móvil -->');
const endMobileIdx = vistaContent.indexOf('<!-- ── OFFCANVAS DETALLE PLACA GLOBAL ──────────────────── -->');

if (startMobileIdx > -1 && endMobileIdx > startMobileIdx) {
    vistaContent = vistaContent.substring(0, startMobileIdx) + vistaContent.substring(endMobileIdx);
} else {
    // If we can't find that exact comment, let's look for <div id="rot-mobile-view"
    const startDiv = vistaContent.indexOf('<div id="rot-mobile-view"');
    if (startDiv > -1) {
        // Find closing tag somehow, or just cut until offcanvas
        if (endMobileIdx > startDiv) {
            vistaContent = vistaContent.substring(0, startDiv) + vistaContent.substring(endMobileIdx);
        }
    }
}

// Remove Tailwind CSS script from vista.html
vistaContent = vistaContent.replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*/g, '');
vistaContent = vistaContent.replace(/<!-- Tailwind CSS \(Scoped to mobile view if possible, disabled preflight\) -->[\s\S]*?<\/script>\s*/g, '');

fs.writeFileSync(vistaPath, vistaContent, 'utf8');
console.log("Successfully restored pure desktop logic and removed mobile layout.");
