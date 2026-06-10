const fs = require('fs');
const path = require('path');

const logicaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/logica.js');
let logicaContent = fs.readFileSync(logicaPath, 'utf8');

// 1. Remove Tailwind CDN Injection
logicaContent = logicaContent.replace(/\/\/ Inject Tailwind for mobile view dynamically[\s\S]*?\n\)\(\);\n/g, '');

// 2. We need to rewrite rotRenderTabla to use the proper desktop HTML AND the new semantic mobile HTML!
// We'll replace the ENTIRE rotRenderTabla function.
const startIdx = logicaContent.indexOf('window.rotRenderTabla = function(lista) {');
if(startIdx > -1) {
    // Find the end of rotRenderTabla function
    let endIdx = logicaContent.indexOf('window.rotAbrirDetalle = function', startIdx);

    const newRenderTabla = `window.rotRenderTabla = function(lista) {
    var tbody = document.getElementById('rot-tbody');
    var mobileList = document.getElementById('otListMobile');
    
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="td-empty">No hay resultados con los filtros aplicados.</td></tr>';
        if(mobileList) mobileList.innerHTML = '<div style="text-align:center; padding: 40px 20px; color: #94a3b8; font-size: 13px;"><i class="bi bi-inbox" style="font-size: 32px; display: block; margin-bottom: 12px; color: #cbd5e1;"></i> No se encontraron OTs</div>';
        return;
    }

    var html = '';
    var mobileHtml = '';
    
    for (var i = 0; i < lista.length; i++) {
        var ot  = lista[i];
        var det = rotDetalles(ot);
        var esActiva = (window.rotDetalleId !== null && String(window.rotDetalleId) === String(ot.ticket_entrada || ot.id_ot));
        var idOT = ot.ticket_entrada || ot.id_ot || '—';
        var obs  = rotEscHtml((det.motivo || ot.observaciones || '').substring(0, 80)) + ((det.motivo || ot.observaciones || '').length > 80 ? '…' : '');

        // --- DESKTOP ROW ---
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
        
        // --- MOBILE CARD ---
        var estado = ot.estado || 'Pendiente';
        var stripeClass = '';
        if (estado === 'Pendiente') stripeClass = 'c-orange';
        else if (estado === 'En Proceso') stripeClass = 'c-blue';
        else if (estado === 'Pausada') stripeClass = 'c-orange';
        else if (estado === 'Finalizado') stripeClass = 'c-green';
        else if (estado === 'Anulado') stripeClass = 'c-red';

        var isPrev = (det.tipo_ot || ot.tipo || '').toLowerCase().indexOf('prev') !== -1;
        var badgeType = isPrev ? '<span class="rot2-badge">PREVENTIVO</span>' : '<span class="rot2-badge red">CORRECTIVO</span>';
        
        var btnAcciones = '';
        if (estado === 'Pendiente') btnAcciones += '<button class="rot2-btn-clear rot2-btn-solid" style="width:100%; margin-bottom:12px;" onclick="closeAllDrawers();"><i class="bi bi-play-fill"></i> Iniciar OT</button>';
        if (estado === 'En Proceso') {
            btnAcciones += '<button class="rot2-btn-clear rot2-btn-solid" style="width:100%; margin-bottom:12px; background:#f59e0b;" onclick="closeAllDrawers();"><i class="bi bi-pause-fill"></i> Pausar OT</button>';
            btnAcciones += '<button class="rot2-btn-clear rot2-btn-solid" style="width:100%; margin-bottom:12px; background:#10b981;" onclick="closeAllDrawers();"><i class="bi bi-check-lg"></i> Cerrar OT</button>';
        }
        btnAcciones += '<button class="rot2-btn-clear rot2-btn-outline" style="width:100%;" onclick="closeAllDrawers(); if(typeof window.rotAbrirDetalle === \\'function\\') window.rotAbrirDetalle(\\'' + idOT + '\\');"><i class="bi bi-list-ul"></i> Ver Detalles Completos</button>';
        var encodedActions = encodeURIComponent(btnAcciones);

        var primaryAction = '';
        if (estado === 'Pendiente') primaryAction = '<button class="rot2-btn-clear rot2-btn-action blue" onclick="event.stopPropagation();">Iniciar</button>';
        else if (estado === 'En Proceso') primaryAction = '<button class="rot2-btn-clear rot2-btn-action" onclick="event.stopPropagation();">Pausar</button>';

        mobileHtml += '<div class="rot2-card" onclick="if(typeof window.rotAbrirDetalle === \\'function\\') window.rotAbrirDetalle(\\'' + idOT + '\\');">';
        mobileHtml += '<div class="rot2-card-stripe ' + stripeClass + '"></div>';
        mobileHtml += '<div class="rot2-card-header">';
        mobileHtml += '<div class="rot2-badge-box">' + badgeType + '</div>';
        mobileHtml += '<span class="rot2-badge-outline"><span class="dot"></span> ' + estado + '</span>';
        mobileHtml += '</div>';
        mobileHtml += '<h3 class="rot2-card-title">' + idOT + '</h3>';
        mobileHtml += '<div class="rot2-card-grid">';
        mobileHtml += '<div class="rot2-c-row"><span class="rot2-c-lbl">PLACA / UNIDAD</span><span class="rot2-c-val">' + (ot.placa||'—') + '</span></div>';
        mobileHtml += '<div class="rot2-c-row"><span class="rot2-c-lbl">KILOMETRAJE</span><span class="rot2-c-val">' + (det.km?Number(det.km).toLocaleString('es-PE')+' km':'—') + '</span></div>';
        mobileHtml += '<div class="rot2-c-row"><span class="rot2-c-lbl">TIPO DE TRABAJO</span><span class="rot2-c-val">' + (det.tipo_ot||ot.tipo||'—') + '</span></div>';
        mobileHtml += '</div>';
        mobileHtml += '<div class="rot2-card-footer">';
        mobileHtml += '<div class="rot2-c-cost"><span class="rot2-c-lbl">COSTO</span><span class="rot2-c-val-lrg">' + rotFmtMoney(ot.costo_total) + '</span></div>';
        mobileHtml += '<div class="rot2-c-actions">';
        mobileHtml += '<button class="rot2-btn-clear rot2-btn-dots" onclick="event.stopPropagation(); document.getElementById(\\'rotMobileActionContent\\').innerHTML=decodeURIComponent(\\'' + encodedActions + '\\'); openActionDrawer();"><i class="bi bi-three-dots"></i></button>';
        mobileHtml += primaryAction;
        mobileHtml += '</div>';
        mobileHtml += '</div>';
        mobileHtml += '</div>';
    }
    
    tbody.innerHTML = html;
    if(mobileList) mobileList.innerHTML = mobileHtml;
}

`;

    logicaContent = logicaContent.substring(0, startIdx) + newRenderTabla + logicaContent.substring(endIdx);
    fs.writeFileSync(logicaPath, logicaContent, 'utf8');
    console.log("Successfully fixed logica.js!");
} else {
    console.log("ERROR: Could not find window.rotRenderTabla");
}
