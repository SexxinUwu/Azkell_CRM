// ================================================================
// Módulo Backlog Pendientes — Azkell Fleet
// Ruta SPA: mantenimiento/backlog-taller
// Entry point: window.init_backlog_taller()
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.bktData     = window.bktData     || [];
window.bktDatosFil = window.bktDatosFil || [];

// ── Entry point ──────────────────────────────────────────────────
window.init_backlog_taller = function() {
    bktCargar();
};

// ── Carga de datos ────────────────────────────────────────────────
window.bktCargar = function() {
    var tbody = document.getElementById('bkt-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';

    fetch('/api/ot-backlog')
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function(data) {
            window.bktData = Array.isArray(data) ? data : [];
            bktRenderTabla();
        })
        .catch(function(err) {
            console.error('Error cargando backlog:', err);
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Error al cargar el backlog', 'danger');
            }
            var tb = document.getElementById('bkt-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="9" class="td-placeholder">Error al cargar datos</td></tr>';
        });
};

// ── Helpers ───────────────────────────────────────────────────────
function bktFmtFecha(iso) {
    if (!iso) return '—';
    var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ── Filtrar ───────────────────────────────────────────────────────
window.bktFiltrar = function() {
    bktRenderTabla();
};

function bktGetFiltros() {
    return {
        search: ((document.getElementById('bkt-search') || {}).value || '').toLowerCase().trim(),
        placa:  ((document.getElementById('bkt-fil-placa') || {}).value || '').trim().toUpperCase(),
        estado: ((document.getElementById('bkt-fil-estado') || {}).value || '').trim()
    };
}

// ── Render tabla ──────────────────────────────────────────────────
window.bktRenderTabla = function() {
    var tbody = document.getElementById('bkt-tbody');
    if (!tbody) return;

    var f = bktGetFiltros();

    var datos = window.bktData.filter(function(b) {
        if (f.estado && b.estado !== f.estado) return false;
        if (f.placa && String(b.placa || '').toUpperCase().indexOf(f.placa) === -1) return false;
        if (f.search) {
            var s = [b.backlog_id, b.placa, b.tema, b.tarea, b.reportado_por].join(' ').toLowerCase();
            if (s.indexOf(f.search) === -1) return false;
        }
        return true;
    });

    window.bktDatosFil = datos;

    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="td-placeholder"><i class="bi bi-list-task" style="font-size:1.5rem; opacity:0.3"></i><br>Sin tareas en backlog</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    datos.forEach(function(b) {
        var tr = document.createElement('tr');
        var chipHtml = bktChip(b);
        tr.innerHTML =
            '<td><span style="font-size:0.72rem;font-weight:700;color:var(--primary,#5865F2);">' + (b.backlog_id || '—') + '</span></td>'
            + '<td>' + bktFmtFecha(b.fecha_reporte || b.creado_en) + '</td>'
            + '<td><strong>' + (b.tema || '—') + '</strong></td>'
            + '<td><strong>' + (b.placa || '—') + '</strong></td>'
            + '<td>' + (b.km ? b.km + ' km' : '—') + '</td>'
            + '<td>' + (b.reportado_por || '—') + '</td>'
            + '<td style="white-space:normal; max-width:260px; font-size:0.8rem;">' + (b.tarea || '—') + '</td>'
            + '<td>' + chipHtml + '</td>'
            + '<td><button class="btn btn-sm" style="color:#dc2626;padding:2px 6px;" '
            + 'onclick="window.bktEliminar(' + b.id + '); event.stopPropagation();" title="Eliminar"><i class="bi bi-trash" style="font-size:0.75rem;"></i></button></td>';
        tbody.appendChild(tr);
    });
};

// Genera el chip toggle para el estado
function bktChip(b) {
    var esPendiente = b.estado !== 'Realizado';
    if (esPendiente) {
        return '<button class="bkt-chip chip-pendiente" title="Haz clic para marcar como Realizado" '
            + 'onclick="window.bktToggleEstado(' + b.id + ', \'Realizado\'); event.stopPropagation();">'
            + 'Pendiente</button>';
    } else {
        return '<button class="bkt-chip chip-realizado" title="Haz clic para marcar como Pendiente" '
            + 'onclick="window.bktToggleEstado(' + b.id + ', \'Pendiente\'); event.stopPropagation();">'
            + 'Realizado</button>';
    }
}

// ── Toggle estado ─────────────────────────────────────────────────
window.bktToggleEstado = function(id, nuevoEstado) {
    // Actualización optimista en memoria
    var item = window.bktData.find(function(b) { return b.id === id; });
    if (item) {
        item.estado = nuevoEstado;
        bktRenderTabla();
    }

    fetch('/api/ot-backlog/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado })
    })
    .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    })
    .then(function() {
        // Silencioso — la UI ya está actualizada
    })
    .catch(function(err) {
        console.error('Error actualizando estado backlog:', err);
        // Revertir en caso de error
        if (item) {
            item.estado = nuevoEstado === 'Realizado' ? 'Pendiente' : 'Realizado';
            bktRenderTabla();
        }
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Error al actualizar el estado', 'danger');
        }
    });
};

// ── Eliminar backlog ──────────────────────────────────────────────
window.bktEliminar = function(id) {
    if (!confirm('¿Eliminar este item del backlog? Esta acción no se puede deshacer.')) return;

    fetch('/api/ot-backlog/' + id, { method: 'DELETE' })
    .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    })
    .then(function() {
        window.bktData = window.bktData.filter(function(b) { return b.id !== id; });
        bktRenderTabla();
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Backlog eliminado', 'success');
        }
    })
    .catch(function(err) {
        console.error('Error eliminando backlog:', err);
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Error al eliminar', 'danger');
        }
    });
};

// ── Drawer Nuevo Backlog ──────────────────────────────────────────
window.bktAbrirNuevo = function() {
    var el;
    el = document.getElementById('bkt-f-placa');  if (el) el.value = '';
    el = document.getElementById('bkt-f-km');     if (el) el.value = '';
    el = document.getElementById('bkt-f-tema');   if (el) el.value = '';
    el = document.getElementById('bkt-f-reporta');if (el) el.value = '';
    el = document.getElementById('bkt-f-tarea');  if (el) el.value = '';

    var drawer = document.getElementById('bkt-drawer-nuevo');
    if (drawer) drawer.classList.add('open');
    var bd = document.getElementById('bktDrawerBackdrop');
    if (bd) bd.classList.add('open');
};

window.bktCerrarDrawer = function() {
    var drawer = document.getElementById('bkt-drawer-nuevo');
    if (drawer) drawer.classList.remove('open');
    var bd = document.getElementById('bktDrawerBackdrop');
    if (bd) bd.classList.remove('open');
};

// ── Guardar nuevo backlog ─────────────────────────────────────────
window.bktGuardar = function() {
    var get = function(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };

    var placa = get('bkt-f-placa').toUpperCase();
    var tarea = get('bkt-f-tarea');

    if (!placa) { alert('La placa es requerida'); return; }
    if (!tarea) { alert('La descripción de la tarea es requerida'); return; }

    var body = {
        placa:         placa,
        km:            parseInt(get('bkt-f-km')) || 0,
        tema:          get('bkt-f-tema'),
        tarea:         tarea,
        reportado_por: get('bkt-f-reporta'),
        estado:        'Pendiente',
        creado_por:    localStorage.getItem('fleet_correo') || ''
    };

    fetch('/api/ot-backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    })
    .then(function() {
        window.bktCerrarDrawer();
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Backlog registrado exitosamente', 'success');
        }
        bktCargar();
    })
    .catch(function(err) {
        console.error('Error guardando backlog:', err);
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Error al guardar el backlog', 'danger');
        }
    });
};

// ── Exportar a Excel ──────────────────────────────────────────────
window.bktExportar = function() {
    var datos = window.bktDatosFil.length > 0 ? window.bktDatosFil : window.bktData;
    if (datos.length === 0) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('No hay datos para exportar', 'warning');
        }
        return;
    }

    if (typeof window.descargarExcelDinamico === 'function') {
        var tmpId = 'bkt-export-tmp';
        var existing = document.getElementById(tmpId);
        if (existing) existing.remove();

        var tbl = document.createElement('table');
        tbl.id = tmpId;
        tbl.style.display = 'none';
        var thead = '<thead><tr><th>F. Registro</th><th>Tema</th><th>Placa</th><th>Kilometraje</th><th>Reportado por</th><th>Tarea Pendiente</th><th>Estado</th></tr></thead>';
        var tbodyHtml = '<tbody>' + datos.map(function(b) {
            return '<tr>'
                + '<td>' + bktFmtFecha(b.fecha_reporte || b.creado_en) + '</td>'
                + '<td>' + (b.tema || '') + '</td>'
                + '<td>' + (b.placa || '') + '</td>'
                + '<td>' + (b.km || '') + '</td>'
                + '<td>' + (b.reportado_por || '') + '</td>'
                + '<td>' + (b.tarea || '') + '</td>'
                + '<td>' + (b.estado || '') + '</td>'
                + '</tr>';
        }).join('') + '</tbody>';
        tbl.innerHTML = thead + tbodyHtml;
        document.body.appendChild(tbl);
        window.descargarExcelDinamico(tmpId, 'Backlog_Taller');
        setTimeout(function() { var el = document.getElementById(tmpId); if (el) el.remove(); }, 1000);
        return;
    }

    // Fallback CSV
    var rows = [['F. Registro','Tema','Placa','Kilometraje','Reportado por','Tarea Pendiente','Estado']];
    datos.forEach(function(b) {
        rows.push([
            bktFmtFecha(b.fecha_reporte || b.creado_en),
            b.tema || '',
            b.placa || '',
            b.km || '',
            b.reportado_por || '',
            b.tarea || '',
            b.estado || ''
        ]);
    });
    var csv = rows.map(function(r) { return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'Backlog_Taller.csv'; a.click();
    URL.revokeObjectURL(url);
};
