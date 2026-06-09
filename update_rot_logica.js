const fs = require('fs');
const path = require('path');

const logicaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/logica.js');
let content = fs.readFileSync(logicaPath, 'utf8');

// 1. Update rotChipEstado
content = content.replace(
    /window\.rotChipEstado = function\(btn, estado\) \{[\s\S]*?window\.rotFiltrar\(\);\n\};/,
    `window.rotChipEstado = function(btn, estado) {
    document.querySelectorAll('#moduloReportesOT .rot-chip').forEach(function(c) { c.classList.remove('active'); });
    document.querySelectorAll('#moduloReportesOT .rot-mobile-chip').forEach(function(c) { 
        c.className = "rot-mobile-chip px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-full text-xs font-semibold whitespace-nowrap transition-all border-0";
    });
    
    if (btn) {
        if(btn.classList.contains('rot-chip')) {
            btn.classList.add('active');
        } else {
            btn.className = "rot-mobile-chip px-3 py-1.5 bg-brand-500 text-white rounded-full text-xs font-semibold whitespace-nowrap shadow-md transition-all border-0";
        }
    }
    
    window._rotFiltroEstado = estado;
    window.rotFiltrar();
};`
);

// 2. Update rotFiltrar to check both search inputs
content = content.replace(
    /var libre   = rotVal\('rot-busqueda-libre'\)\.toLowerCase\(\);/,
    `var libre   = (rotVal('rot-busqueda-libre') || rotVal('rotMobileSearch')).toLowerCase();`
);

// 3. Update rotRenderKPIs to update mobile KPIs too
content = content.replace(
    /rotSetTxt\('rot-kpi-filtradas', total\);/,
    `rotSetTxt('rot-kpi-filtradas', total);

    // Mobile KPIs
    rotSetTxt('rotMobileKpiTotal', total);
    rotSetTxt('rotMobileKpiCorrectivos', corr);
    rotSetTxt('rotMobileKpiPreventivos', prev);
    rotSetTxt('rotMobileKpiCosto', rotFmtMoney(cTotal));
    rotSetTxt('rotMobileKpiProceso', enProc);`
);

// 4. Replace rotRenderTabla to populate both desktop and mobile
const rotRenderTablaTarget = `window.rotRenderTabla = function(lista) {
    var tbody = document.getElementById('rot-tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="td-empty">No hay resultados con los filtros aplicados.</td></tr>';
        return;
    }

    var html = '';
    for (var i = 0; i < lista.length; i++) {
        var ot  = lista[i];
        var det = rotDetalles(ot);
        var esActiva = (window.rotDetalleId !== null && String(window.rotDetalleId) === String(ot.ticket_entrada || ot.id_ot));
        var idOT = ot.ticket_entrada || ot.id_ot || '—';
        var obs  = rotEscHtml((det.motivo || ot.observaciones || '').substring(0, 80)) + ((det.motivo || ot.observaciones || '').length > 80 ? '…' : '');

        html += '<tr class="' + (esActiva ? 'rot-row-activa' : '') + '" onclick="window.rotAbrirDetalle(\\'' + rotEscHtml(String(ot.ticket_entrada || ot.id_ot || '')) + '\\')">';
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
};`;

const rotRenderTablaReplacement = `window.rotRenderTabla = function(lista) {
    var tbody = document.getElementById('rot-tbody');
    var mobileList = document.getElementById('otListMobile');
    
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="td-empty">No hay resultados con los filtros aplicados.</td></tr>';
        if(mobileList) mobileList.innerHTML = '<div class="text-center text-slate-500 text-xs py-8">No hay resultados</div>';
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

        // Desktop Row
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
        
        // Mobile Card
        var isPreventivo = (det.tipo_ot || ot.tipo || '').toLowerCase().indexOf('prev') !== -1;
        var estado = ot.estado || 'Pendiente';
        var stripeClass = isPreventivo ? 'bg-blue-500' : 'bg-red-500';
        var typeText = isPreventivo ? 'Preventivo' : 'Correctivo';
        var typeColorText = isPreventivo ? 'text-blue-400' : 'text-red-400';
        var typeBg = isPreventivo ? 'bg-blue-500/10' : 'bg-red-500/10';
        var typeIcon = isPreventivo ? 'fa-circle-check text-brand-400' : 'fa-triangle-exclamation text-red-400';
        
        var estadoBadge = '';
        if(estado === 'Pendiente') estadoBadge = '<span class="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Pendiente</span>';
        else if(estado === 'En Proceso') estadoBadge = '<span class="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span> En Proceso</span>';
        else if(estado === 'Pausada') estadoBadge = '<span class="inline-flex items-center gap-1 text-[10px] font-bold bg-orange-500/10 text-orange-400 px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-orange-400"></span> Pausada</span>';
        else if(estado === 'Finalizado') estadoBadge = '<span class="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Finalizado</span>';
        else estadoBadge = '<span class="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-500/10 text-slate-400 px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> '+estado+'</span>';
        
        var fullObs = rotEscHtml(det.motivo || ot.observaciones || 'Sin observaciones');
        var kmStr = det.km ? Number(det.km).toLocaleString('es-PE') + ' km' : '—';
        var supStr = rotEscHtml(det.supervisor || ot.supervisor || '—');
        var fechaStr = (ot.fecha_ingreso || ot.creado_en) ? (ot.fecha_ingreso || ot.creado_en).substring(0,10) : '—';
        var subTypeStr = det.sub_tipo ? rotEscHtml(det.sub_tipo) : typeText;
        
        mobileHtml += '<div class="ot-card bg-slate-900 rounded-2xl p-4 border border-slate-800 shadow-md relative overflow-hidden transition-all duration-200 active:scale-[0.99] hover:border-slate-700 m-0" data-status="'+estado+'" onclick="window.rotAbrirDetalle(\\''+idOT+'\\')">';
        mobileHtml += '  <div class="absolute left-0 top-0 bottom-0 w-1.5 ' + stripeClass + '"></div>';
        mobileHtml += '  <div class="flex justify-between items-start mb-2.5 pl-1.5">';
        mobileHtml += '    <div>';
        mobileHtml += '      <span class="text-[10px] font-bold '+typeColorText+' uppercase tracking-widest block mb-0.5">' + typeText + '</span>';
        mobileHtml += '      <h3 class="text-sm font-extrabold text-white flex items-center gap-1.5 m-0">' + idOT + ' <i class="fa-solid '+typeIcon+' text-[10px]"></i></h3>';
        mobileHtml += '    </div>';
        mobileHtml += '    <div class="flex flex-col items-end gap-1">';
        mobileHtml += '      ' + estadoBadge;
        mobileHtml += '      <span class="text-[10px] text-slate-400">' + fechaStr + '</span>';
        mobileHtml += '    </div>';
        mobileHtml += '  </div>';
        mobileHtml += '  <div class="grid grid-cols-2 gap-y-2.5 gap-x-2 pl-1.5 py-3 border-y border-slate-800/80 my-3 text-xs">';
        mobileHtml += '    <div class="flex items-center gap-2">';
        mobileHtml += '      <div class="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 m-0"><i class="fa-solid fa-car"></i></div>';
        mobileHtml += '      <div><span class="text-[9px] text-slate-500 uppercase font-semibold block m-0">PLACA</span><span class="font-bold text-slate-200 m-0">' + rotEscHtml(ot.placa||'—') + '</span></div>';
        mobileHtml += '    </div>';
        mobileHtml += '    <div class="flex items-center gap-2">';
        mobileHtml += '      <div class="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 m-0"><i class="fa-solid fa-gauge"></i></div>';
        mobileHtml += '      <div><span class="text-[9px] text-slate-500 uppercase font-semibold block m-0">KILOMETRAJE</span><span class="font-semibold text-slate-200 m-0">' + kmStr + '</span></div>';
        mobileHtml += '    </div>';
        mobileHtml += '    <div class="col-span-2 flex items-center gap-2">';
        mobileHtml += '      <div class="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 m-0"><i class="fa-solid fa-wrench"></i></div>';
        mobileHtml += '      <div class="overflow-hidden"><span class="text-[9px] text-slate-500 uppercase font-semibold block m-0">TIPO / SUBTIPO</span><span class="font-semibold text-slate-200 truncate block m-0"><span class="'+typeColorText+' text-[10px] font-bold px-1.5 py-0.5 rounded '+typeBg+' mr-1">' + (isPreventivo?'Prev.':'Corr.') + '</span> ' + subTypeStr + '</span></div>';
        mobileHtml += '    </div>';
        mobileHtml += '    <div class="col-span-2 flex items-center gap-2">';
        mobileHtml += '      <div class="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 m-0"><i class="fa-solid fa-user-gear"></i></div>';
        mobileHtml += '      <div class="overflow-hidden"><span class="text-[9px] text-slate-500 uppercase font-semibold block m-0">SUPERVISOR</span><span class="font-semibold text-slate-300 truncate block text-[11px] m-0">' + supStr + '</span></div>';
        mobileHtml += '    </div>';
        mobileHtml += '  </div>';
        mobileHtml += '  <div class="bg-slate-950/60 p-2.5 rounded-xl text-[11px] text-slate-300 pl-3 mb-4 border-l-2 border-slate-700 m-0">';
        mobileHtml += '    <span class="text-[9px] font-bold text-slate-500 block uppercase mb-0.5">Observación:</span> "' + fullObs + '"';
        mobileHtml += '  </div>';
        mobileHtml += '  <div class="flex justify-between items-center pl-1.5">';
        mobileHtml += '    <div><span class="text-[9px] text-slate-500 font-semibold block m-0">COSTO TOTAL</span><span class="text-sm font-bold text-emerald-400 m-0">' + rotFmtMoney(ot.costo_total) + '</span></div>';
        mobileHtml += '    <div class="flex gap-1.5"><button onclick="event.stopPropagation(); toggleActionDrawer(\\''+idOT+'\\', \\''+estado+'\\')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1 border-0 m-0 w-10 h-10"><i class="fa-solid fa-ellipsis-vertical"></i></button></div>';
        mobileHtml += '  </div>';
        mobileHtml += '</div>';
    }

    tbody.innerHTML = html;
    if(mobileList) mobileList.innerHTML = mobileHtml;
};`;

// Attempt replace
if(content.includes(rotRenderTablaTarget)) {
    content = content.replace(rotRenderTablaTarget, rotRenderTablaReplacement);
} else {
    console.error("Target string not found, doing loose replace");
    // Fallback: replace everything between window.rotRenderTabla = function(lista) { and the next //
    const startIdx = content.indexOf('window.rotRenderTabla = function(lista) {');
    const endIdx = content.indexOf('// ── Abrir drawer', startIdx);
    if(startIdx !== -1 && endIdx !== -1) {
        content = content.substring(0, startIdx) + rotRenderTablaReplacement + '\n\n' + content.substring(endIdx);
    }
}

fs.writeFileSync(logicaPath, content, 'utf8');
console.log('Successfully updated logica.js with mobile bindings');
