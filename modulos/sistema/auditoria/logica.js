// ================================================================
// MÓDULO: AUDITORÍA — Historial de Actividad (Discord style)
// ================================================================

window.dataAuditoria = window.dataAuditoria || [];
window._auditFilter  = window._auditFilter  || 'all';

var _AUDIT_COLORS = ['#5865F2','#57F287','#1ABC9C','#E67E22','#9B59B6','#ED4245','#EB459E','#3498DB','#FEE75C','#E91E63'];
function _auditColor(str) {
    var h = 0;
    for (var i = 0; i < (str||'').length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xFFFFFF;
    return _AUDIT_COLORS[Math.abs(h) % _AUDIT_COLORS.length];
}
function _auditInitials(str) {
    var parts = (str || 'S').split(/[@.\s]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || 'S').slice(0, 2).toUpperCase();
}
function _relativeTime(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d)) return dateStr || '';
    var diff = Date.now() - d.getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'ahora';
    if (mins < 60) return 'hace ' + mins + 'm';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24)  return 'hace ' + hrs + 'h';
    var days = Math.floor(hrs / 24);
    if (days < 7)  return 'hace ' + days + 'd';
    return d.toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'2-digit' });
}
function _fullTime(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d)) return '';
    return d.toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function _dayLabel(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d)) return '';
    var today = new Date(); today.setHours(0,0,0,0);
    var yd = new Date(today); yd.setDate(yd.getDate() - 1);
    var dd = new Date(d); dd.setHours(0,0,0,0);
    if (dd.getTime() === today.getTime()) return 'Hoy';
    if (dd.getTime() === yd.getTime()) return 'Ayer';
    return d.toLocaleDateString('es-PE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
}

window.cargarAuditoria = async function(forzar) {
    if (!forzar && window.dataAuditoria.length > 0) { window.renderAuditFeed(window.dataAuditoria); return; }
    var feed = document.getElementById('auditFeed');
    if (feed) feed.innerHTML = '<div class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Cargando historial...</div>';
    try {
        var res = await fetch('/api/auditoria?limit=300');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();
        window.dataAuditoria = json.data || [];
        window.renderAuditFeed(window.dataAuditoria);
    } catch(e) {
        if (feed) feed.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-wifi-off me-2 fs-3 opacity-50 d-block mb-2"></i>Error al cargar.<br><small class="opacity-75">' + e.message + '</small></div>';
    }
};

window.renderAuditFeed = function(datos) {
    var feed = document.getElementById('auditFeed');
    if (!feed) return;
    var filter = window._auditFilter || 'all';
    var modFilter = (document.getElementById('auditModuloFilter') || {}).value || '';
    var search = ((document.getElementById('auditSearch') || {}).value || '').toLowerCase().trim();

    var filtered = datos.filter(function(r) {
        if (filter !== 'all' && r.accion !== filter) return false;
        if (modFilter && r.modulo !== modFilter) return false;
        if (search) {
            var hay = ((r.usuario||'') + ' ' + (r.accion||'') + ' ' + (r.modulo||'') + ' ' + (r.detalle||'')).toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    var sub = document.getElementById('audit-subtitle');
    if (sub) sub.textContent = filtered.length + ' evento' + (filtered.length !== 1 ? 's' : '') + (datos.length !== filtered.length ? ' (de ' + datos.length + ' totales)' : '');

    if (!filtered.length) {
        feed.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 opacity-30 d-block mb-2"></i>Sin eventos para los filtros seleccionados.</div>';
        return;
    }

    var _MODULO_COLOR = { fleetrun:'#5865F2', placas:'#1ABC9C', inspecciones:'#f59e0b', usuarios:'#9B59B6', status:'#ED4245' };

    var html = '';
    var lastDay = null;
    filtered.forEach(function(r) {
        var day = _dayLabel(r.fecha);
        if (day !== lastDay) {
            html += '<div class="audit-day-sep">' + day + '</div>';
            lastDay = day;
        }
        var color = _auditColor(r.usuario || '');
        var initials = _auditInitials(r.usuario || '');
        var badgeClass = r.accion === 'CREÓ' ? 'audit-badge-cre' : (r.accion === 'MODIFICÓ' ? 'audit-badge-mod' : 'audit-badge-del');
        var modBg = _MODULO_COLOR[r.modulo] || '#6b7280';
        html += '<div class="audit-msg">'
            + '<div class="audit-avatar" style="background:' + color + ';" title="' + (r.usuario||'') + '">' + initials + '</div>'
            + '<div class="flex-grow-1 min-width-0">'
            + '<div class="audit-meta">'
            + '<span class="audit-name">' + (r.usuario || 'sistema') + '</span>'
            + '<span class="audit-time" title="' + _fullTime(r.fecha) + '">' + _relativeTime(r.fecha) + '</span>'
            + '<span class="audit-badge ' + badgeClass + '">' + (r.accion || '?') + '</span>'
            + '<span class="audit-badge" style="background:' + modBg + '1a;color:' + modBg + ';">' + (r.modulo || '?') + '</span>'
            + '</div>'
            + '<div class="audit-detail">' + (r.detalle || '—') + '</div>'
            + '</div></div>';
    });
    feed.innerHTML = html;
};

window.setAuditFilter = function(f) {
    window._auditFilter = f;
    document.querySelectorAll('#auditChips .audit-chip').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.filter === f);
    });
    window.renderAuditFeed(window.dataAuditoria);
};

window.filtrarAuditFeed = function() { window.renderAuditFeed(window.dataAuditoria); };

window.init_auditoria = function() {
    window.dataAuditoria = [];
    window._auditFilter = 'all';
    window.cargarAuditoria(true);
};
