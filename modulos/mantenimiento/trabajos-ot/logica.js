// ================================================================
// Módulo Trabajos Anexos — Azkell Fleet
// Ruta SPA: mantenimiento/trabajos-ot
// Entry point: window.init_trabajos_ot()
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.totData      = window.totData      || [];
window.totDatosFil  = window.totDatosFil  || [];
window.totDetalleId = window.totDetalleId || null;

// ID único del trabajo: usa id_ot (nuevo schema) o ticket_visita como fallback para registros viejos
function totGetId(t) {
    return (String(t.id_ot || '').trim()) || (String(t.ticket_visita || '').trim()) || '';
}

// ── Entry point ──────────────────────────────────────────────────
window.init_trabajos_ot = function() {
    totCargar();
};

// ── Carga de datos ────────────────────────────────────────────────
window.totCargar = function() {
    var tbody = document.getElementById('tot-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';

    fetch('/api/ot-trabajos')
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function(data) {
            window.totData = Array.isArray(data) ? data : [];
            totRenderTabla();
        })
        .catch(function(err) {
            console.error('Error cargando trabajos OT:', err);
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Error al cargar trabajos de OT', 'danger');
            }
            var tb = document.getElementById('tot-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="7" class="td-placeholder">Error al cargar datos</td></tr>';
        });
};

// ── Helpers ───────────────────────────────────────────────────────
function totFmtMoney(val) {
    return 'S/.' + parseFloat(val || 0).toFixed(2);
}

function totFmtDateTime(iso) {
    if (!iso) return '—';
    // Tratar como hora local: reemplazar 'Z' o añadir offset cero para evitar conversión UTC
    var s = String(iso).replace('Z', '').replace('+00:00', '');
    // Si el string no tiene 'T', MySQL lo devuelve como 'YYYY-MM-DD HH:MM:SS' — reemplazar espacio por T
    if (s.indexOf('T') === -1) s = s.replace(' ', 'T');
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(iso).split('T')[0] || '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })
        + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function totFmtFecha(iso) {
    if (!iso) return '—';
    var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' });
}

function totBadge(estado) {
    if (estado === 'Aprobado') {
        return '<span class="tot-badge badge-aprobado">Aprobado</span>';
    }
    return '<span class="tot-badge badge-pendiente">Pendiente</span>';
}

function totParseDetalles(t) {
    try { return typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); }
    catch(e) { return {}; }
}

function totEsc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Filtrar ───────────────────────────────────────────────────────
window.totFiltrar = function() {
    totRenderTabla();
};

function totGetFiltros() {
    return {
        search: ((document.getElementById('tot-search') || {}).value || '').toLowerCase().trim(),
        ot:     ((document.getElementById('tot-fil-ot') || {}).value || '').trim().toLowerCase(),
        placa:  ((document.getElementById('tot-fil-placa') || {}).value || '').trim().toUpperCase(),
        mes:    ((document.getElementById('tot-fil-mes') || {}).value || '').trim(),
        desde:  ((document.getElementById('tot-fil-desde') || {}).value || '').trim(),
        hasta:  ((document.getElementById('tot-fil-hasta') || {}).value || '').trim(),
        estado: ((document.getElementById('tot-fil-estado') || {}).value || '').trim()
    };
}

// ── Render tabla ──────────────────────────────────────────────────
window.totRenderTabla = function() {
    var tbody = document.getElementById('tot-tbody');
    if (!tbody) return;

    var f = totGetFiltros();

    var datos = window.totData.filter(function(t) {
        var det = totParseDetalles(t);
        // Filtro estado
        if (f.estado && t.estado !== f.estado) return false;
        // Filtro N° OT
        if (f.ot && String(t.id_ot || '').toLowerCase().indexOf(f.ot) === -1) return false;
        // Filtro placa
        if (f.placa && String(t.placa || '').toUpperCase().indexOf(f.placa) === -1) return false;
        // Filtro mes
        if (f.mes) {
            var fechaStr = t.fecha_trabajo ? String(t.fecha_trabajo).split('T')[0] : '';
            if (!fechaStr.startsWith(f.mes)) return false;
        }
        // Filtro desde/hasta
        if (f.desde || f.hasta) {
            var fechaStr2 = t.fecha_trabajo ? String(t.fecha_trabajo).split('T')[0] : '';
            if (f.desde && fechaStr2 < f.desde) return false;
            if (f.hasta && fechaStr2 > f.hasta) return false;
        }
        // Buscador libre
        if (f.search) {
            var s = [t.ticket_visita, t.id_ot, det.personal || t.tecnico, t.placa, t.trabajo_realizado].join(' ').toLowerCase();
            if (s.indexOf(f.search) === -1) return false;
        }
        return true;
    });

    window.totDatosFil = datos;

    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder"><i class="bi bi-tools" style="font-size:1.5rem; opacity:0.3"></i><br>Sin trabajos encontrados</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    datos.forEach(function(t) {
        var det = totParseDetalles(t);
        // Calcular horas de trabajo
        var tiempoHrs = '—';
        if (t.fecha_trabajo && t.fecha_salida) {
            var tIni = new Date(t.fecha_trabajo).getTime();
            var tFin = new Date(t.fecha_salida).getTime();
            if (!isNaN(tIni) && !isNaN(tFin) && tFin > tIni) {
                var hrs = (tFin - tIni) / 3600000;
                tiempoHrs = hrs.toFixed(1) + ' h';
            }
        }
        var tr = document.createElement('tr');
        if (totGetId(t) === window.totDetalleId) tr.classList.add('tot-row-active');
        tr.innerHTML =
            '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + totEsc(totGetId(t) || '—') + '</span></td>'
            + '<td><strong>' + totEsc(t.ot_id || '—') + '</strong></td>'
            + '<td style="font-size:0.79rem;">' + totFmtDateTime(t.fecha_trabajo) + '</td>'
            + '<td style="max-width:200px;white-space:normal;font-size:0.81rem;">' + totEsc(t.trabajo_realizado || '—') + '</td>'
            + '<td>' + totEsc(det.personal || t.tecnico || '—') + '</td>'
            + '<td style="font-size:0.79rem;">' + totFmtDateTime(t.fecha_salida) + '</td>'
            + '<td><strong style="color:#16a34a;">' + totFmtMoney(det.costo) + '</strong></td>'
            + '<td style="font-size:0.82rem;">' + totEsc(tiempoHrs) + '</td>';
        tr.onclick = (function(row) {
            return function() { totAbrirDetalle(row); };
        })(t);
        tbody.appendChild(tr);
    });
};

// ── Detalle lateral ───────────────────────────────────────────────
function totAbrirDetalle(t) {
    window.totDetalleId = totGetId(t);
    totRenderTabla();

    var det = totParseDetalles(t);
    var idDisplay = totGetId(t);

    var titulo = document.getElementById('tot-detalle-titulo');
    if (titulo) titulo.textContent = 'Trabajo ' + idDisplay;

    var html = '';
    html += '<div style="font-size:1.3rem; font-weight:800; color:var(--text); margin-bottom:0.4rem;">' + totEsc(idDisplay || '—') + '</div>';
    html += '<div style="font-size:0.83rem; color:var(--subtext); margin-bottom:1rem;">N° OT: <strong>' + totEsc(t.ot_id || '—') + '</strong></div>';

    html += '<div class="tot-sec">';
    html += '<div class="tot-sec-hd">Información del Trabajo</div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Estado</div><div class="tot-field-val">' + totBadge(t.estado) + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Placa</div><div class="tot-field-val"><strong>' + totEsc(t.placa || '—') + '</strong></div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Trabajador(es)</div><div class="tot-field-val" style="white-space:normal;">' + totEsc(det.personal || t.tecnico || '—') + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Descripción</div><div class="tot-field-val" style="white-space:normal;">' + totEsc(t.trabajo_realizado || '—') + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">F/H Inicio</div><div class="tot-field-val">' + totFmtDateTime(t.fecha_trabajo) + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">F/H Fin</div><div class="tot-field-val">' + totFmtDateTime(t.fecha_salida) + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Costo M.O.</div><div class="tot-field-val"><span style="font-size:1.05rem; color:#16a34a; font-weight:800;">' + totFmtMoney(det.costo) + '</span></div></div>';
    if (t.creado_en) {
        html += '<div class="tot-field"><div class="tot-field-lbl">Registrado</div><div class="tot-field-val" style="font-size:0.75rem;">' + totFmtDateTime(t.creado_en) + '</div></div>';
    }
    html += '</div>';

    var scroll = document.getElementById('tot-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    var footer = document.getElementById('tot-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        footer.innerHTML =
            '<button class="btn btn-sm btn-primary flex-fill fw-bold" onclick="window.totAbrirEditar(\'' + idDisplay + '\')"><i class="bi bi-pencil me-1"></i>Editar Trabajo</button>'
            + '<button class="btn btn-sm btn-danger ms-2" style="min-width:38px;" onclick="window.totEliminar(\'' + idDisplay + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>';
    }

    var panel = document.getElementById('tot-panel-detalle');
    if (panel) panel.classList.add('open');
}

window.totCerrarDetalle = function() {
    var panel = document.getElementById('tot-panel-detalle');
    if (panel) panel.classList.remove('open');
    window.totDetalleId = null;
    totRenderTabla();
};

// ── Eliminar trabajo ──────────────────────────────────────────────
window.totEliminar = function(ticket) {
    if (!confirm('¿Eliminar el trabajo ' + ticket + '? Esta acción no se puede deshacer.')) return;
    fetch('/api/ot-trabajos/' + encodeURIComponent(ticket), { method: 'DELETE' })
        .then(function(r) {
            if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'HTTP ' + r.status); });
            return r.json();
        })
        .then(function() {
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Trabajo eliminado correctamente', 'success');
            }
            window.totDetalleId = null;
            var panel = document.getElementById('tot-panel-detalle');
            if (panel) panel.classList.remove('open');
            totCargar();
        })
        .catch(function(err) {
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Error al eliminar: ' + err.message, 'danger');
            }
        });
};

// ── Abrir drawer edición ──────────────────────────────────────────
window.totAbrirEditar = function(ticket) {
    var t = window.totData.find(function(x) { return totGetId(x) === String(ticket); });
    if (!t) return;
    var det = totParseDetalles(t);

    var toLocalDT = function(iso) {
        if (!iso) return '';
        var s = String(iso).replace('Z', '').replace('+00:00', '');
        if (s.indexOf('T') === -1) s = s.replace(' ', 'T');
        return s.slice(0, 16); // YYYY-MM-DDTHH:MM para datetime-local
    };

    var set = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
    set('tot-ed-ticket',    ticket);
    set('tot-ed-desc',      t.trabajo_realizado || '');
    set('tot-ed-costo',     det.costo !== undefined ? det.costo : '0');
    set('tot-ed-fecha-ini', toLocalDT(t.fecha_trabajo));
    set('tot-ed-fecha-fin', toLocalDT(t.fecha_salida));

    var estEl = document.getElementById('tot-ed-estado');
    if (estEl) estEl.value = t.estado || 'Pendiente';

    var tit = document.getElementById('tot-ed-titulo');
    if (tit) tit.textContent = 'Editar ' + ticket;

    // Inicializar multiselect con el personal actual
    totMsInit(det.personal || t.tecnico || '');

    var drawer = document.getElementById('tot-drawer-editar');
    if (drawer) drawer.classList.add('open');
};

window.totCerrarDrawerEditar = function() {
    var drawer = document.getElementById('tot-drawer-editar');
    if (drawer) drawer.classList.remove('open');
};

// ── Guardar edición ───────────────────────────────────────────────
window.totGuardarEdicion = function() {
    var ticket = ((document.getElementById('tot-ed-ticket')    || {}).value || '').trim();
    var desc   = ((document.getElementById('tot-ed-desc')      || {}).value || '').trim();
    var pers   = ((document.getElementById('tot-ed-personal')  || {}).value || '').trim();
    var fIni   = ((document.getElementById('tot-ed-fecha-ini') || {}).value || '');
    var fFin   = ((document.getElementById('tot-ed-fecha-fin') || {}).value || '');
    var costo  = parseFloat((document.getElementById('tot-ed-costo')   || {}).value || 0);
    var estado = ((document.getElementById('tot-ed-estado')    || {}).value || 'Pendiente');

    if (!ticket) return;
    if (!desc) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La descripción es requerida', 'danger'); return; }

    fetch('/api/ot-trabajos/' + encodeURIComponent(ticket), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accion: 'editar',
            trabajo_realizado: desc,
            fecha_trabajo: fIni || null,
            fecha_salida:  fFin || null,
            personal:      pers,
            costo:         costo,
            estado:        estado
        })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        window.totCerrarDrawerEditar();
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Trabajo actualizado correctamente', 'success');
        }
        window.totDetalleId = null;
        var panel = document.getElementById('tot-panel-detalle');
        if (panel) panel.classList.remove('open');
        totCargar();
    })
    .catch(function(err) {
        console.error('Error editando trabajo:', err);
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Error al guardar los cambios', 'danger');
        }
    });
};

// ── Poblar / Multiselect Personal ────────────────────────────────────────────
window._totPersonalLista = window._totPersonalLista || [];
window._totSeleccionados = window._totSeleccionados || [];

function totMsInit(valorActual) {
    window._totSeleccionados = valorActual
        ? valorActual.split(',').map(function(n){ return n.trim(); }).filter(Boolean)
        : [];
    totMsRenderBox();
    var dd = document.getElementById('tot-ms-dropdown');
    if (dd) dd.style.display = 'none';
    var s = document.getElementById('tot-ms-search');
    if (s) s.value = '';
    var cnt = document.getElementById('tot-ms-count');
    if (cnt) cnt.textContent = window._totSeleccionados.length + ' seleccionados';

    var doRender = function() { totMsRenderOptions(''); window.totCalcularCostoAuto(); };
    if (window._totPersonalLista.length > 0) { doRender(); return; }
    
    // ✨ Cargar personal desde nueva BD taller_personal ✨
    window._totPersonalDatos = {};
    fetch('/api/taller-personal')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            window._totPersonalLista = data.map(function(p) {
                var n = (p.nombre || '').trim();
                window._totPersonalDatos[n] = parseFloat(p.costo_hora || 0);
                return n;
            }).filter(Boolean).sort();
            doRender();
        })
        .catch(function() {});
}

// ✨ Algoritmo de autocalculo de costo basado en horas netas trabajadas ✨
window.totCalcularCostoAuto = function() {
    var fIni = document.getElementById('tot-ed-fecha-ini').value;
    var fFin = document.getElementById('tot-ed-fecha-fin').value;
    if (!fIni || !fFin) return;

    var inicio = new Date(fIni);
    var fin = new Date(fFin);
    if (fin <= inicio) return;

    var esMinutoLaboral = function(d) {
        var day = d.getDay(); // 0=Domingo, 1=Lunes..6=Sábado
        var h = d.getHours();
        if (day === 0) return false;
        if (h < 8) return false;
        if (day >= 1 && day <= 5 && h >= 18) return false;
        if (day === 6 && h >= 14) return false;
        if (day >= 1 && day <= 5 && h === 13) return false; // Almuerzo
        return true;
    };

    var minutosNetos = 0;
    var current = new Date(inicio.getTime());
    while(current < fin) {
        var nextMinute = new Date(current.getTime() + 60000);
        if (nextMinute > fin) {
            var diff = (fin - current) / 60000;
            if (esMinutoLaboral(current)) minutosNetos += diff;
            break;
        } else {
            if (esMinutoLaboral(current)) minutosNetos += 1;
            current = nextMinute;
        }
    }

    var costoHoraTotal = 0;
    window._totSeleccionados.forEach(function(n) {
        costoHoraTotal += window._totPersonalDatos[n] || 0;
    });

    var total = (minutosNetos / 60) * costoHoraTotal;
    var costoInput = document.getElementById('tot-ed-costo');
    if (costoInput) costoInput.value = total.toFixed(2);
};

window.totMsToggle = function() {
    var dd = document.getElementById('tot-ms-dropdown');
    var box = document.getElementById('tot-ms-box');
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) {
        dd.style.display = 'none';
        if (box) box.style.borderColor = '';
    } else {
        dd.style.display = 'block';
        if (box) box.style.borderColor = 'var(--primary, #5865F2)';
        var search = document.getElementById('tot-ms-search');
        if (search) { search.value = ''; search.focus(); }
        totMsRenderOptions('');
    }
};

window.totMsFiltrar = function(query) { totMsRenderOptions(query || ''); };

function totMsRenderOptions(query) {
    var container = document.getElementById('tot-ms-options');
    if (!container) return;
    var q = (query || '').toLowerCase();
    var filtrados = window._totPersonalLista.filter(function(n) {
        return !q || n.toLowerCase().indexOf(q) !== -1;
    });
    if (filtrados.length === 0) {
        container.innerHTML = '<div style="padding:10px 14px; color:var(--subtext); font-size:0.83rem; text-align:center;">Sin resultados</div>';
        return;
    }
    container.innerHTML = filtrados.map(function(n) {
        var checked = window._totSeleccionados.indexOf(n) !== -1;
        var nEsc = n.replace(/'/g, "\\'");
        var costoStr = (window._totPersonalDatos[n] || 0).toFixed(2);
        return '<label style="display:flex; align-items:center; justify-content:space-between; padding:9px 14px; cursor:pointer; font-size:0.85rem; color:var(--text);" '
            + 'onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'\'">'
            + '<div style="display:flex; align-items:center; gap:10px;"><input type="checkbox" ' + (checked ? 'checked' : '') + ' '
            + 'onclick="event.stopPropagation(); totMsToggleItem(\'' + nEsc + '\')" '
            + 'style="accent-color:var(--primary, #5865F2); width:14px; height:14px; cursor:pointer; flex-shrink:0;">'
            + n + '</div>'
            + '<small style="color:var(--subtext)">S/ ' + costoStr + '/h</small></label>';
    }).join('');
}

window.totMsToggleItem = function(nombre) {
    var idx = window._totSeleccionados.indexOf(nombre);
    if (idx === -1) window._totSeleccionados.push(nombre);
    else window._totSeleccionados.splice(idx, 1);
    totMsRenderBox();
    totMsRenderOptions((document.getElementById('tot-ms-search') || {}).value || '');
    var cnt = document.getElementById('tot-ms-count');
    if (cnt) cnt.textContent = window._totSeleccionados.length + ' seleccionados';
    var hidden = document.getElementById('tot-ed-personal');
    if (hidden) hidden.value = window._totSeleccionados.join(', ');
    window.totCalcularCostoAuto();
};

window.totMsLimpiar = function() {
    window._totSeleccionados = [];
    totMsRenderBox();
    totMsRenderOptions('');
    var cnt = document.getElementById('tot-ms-count');
    if (cnt) cnt.textContent = '0 seleccionados';
    var hidden = document.getElementById('tot-ed-personal');
    if (hidden) hidden.value = '';
    window.totCalcularCostoAuto();
};

function totMsRenderBox() {
    var box = document.getElementById('tot-ms-box');
    if (!box) return;
    var sel = window._totSeleccionados;
    if (sel.length === 0) {
        box.innerHTML = '<span style="color:var(--subtext); font-size:0.85rem;">Selecciona técnico(s)...</span>';
    } else {
        box.innerHTML = sel.map(function(n) {
            var nEsc = n.replace(/'/g, "\\'");
            return '<span style="display:inline-flex; align-items:center; gap:4px; background:var(--primary, #5865F2); color:#fff; padding:3px 8px 3px 10px; border-radius:6px; font-size:0.76rem; font-weight:600;">'
                + n
                + '<span style="cursor:pointer; opacity:0.8; font-size:1rem; line-height:1;" '
                + 'onmousedown="event.stopPropagation(); event.preventDefault(); totMsToggleItem(\'' + nEsc + '\')">×</span>'
                + '</span>';
        }).join('');
    }
}

// Cerrar dropdown al clicar fuera (safe para SPA)
window._totMsOutsideClick = function(e) {
    var wrapper = document.getElementById('tot-ms-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        var dd = document.getElementById('tot-ms-dropdown');
        var box = document.getElementById('tot-ms-box');
        if (dd) dd.style.display = 'none';
        if (box) box.style.borderColor = '';
    }
};
document.removeEventListener('click', window._totMsOutsideClick);
document.addEventListener('click', window._totMsOutsideClick);


// ── Exportar a Excel ──────────────────────────────────────────────
window.totExportar = function() {
    var datos = window.totDatosFil.length > 0 ? window.totDatosFil : window.totData;
    if (datos.length === 0) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('No hay datos para exportar', 'warning');
        }
        return;
    }

    if (typeof window.descargarExcelDinamico === 'function') {
        var tmpId = 'tot-export-tmp';
        var existing = document.getElementById(tmpId);
        if (existing) existing.remove();

        var tbl = document.createElement('table');
        tbl.id = tmpId;
        tbl.style.display = 'none';
        var thead = '<thead><tr><th>ID Trabajo</th><th>N° OT</th><th>Placa</th><th>Trabajador(es)</th><th>Descripción</th><th>F/H Inicio</th><th>F/H Fin</th><th>Costo</th><th>Estado</th></tr></thead>';
        var tbody = '<tbody>' + datos.map(function(t) {
            var det = totParseDetalles(t);
            return '<tr>'
                + '<td>' + (t.ticket_visita || '') + '</td>'
                + '<td>' + (t.id_ot || '') + '</td>'
                + '<td>' + (t.placa || '') + '</td>'
                + '<td>' + (det.personal || t.tecnico || '') + '</td>'
                + '<td>' + (t.trabajo_realizado || '') + '</td>'
                + '<td>' + totFmtDateTime(t.fecha_trabajo) + '</td>'
                + '<td>' + totFmtDateTime(t.fecha_salida) + '</td>'
                + '<td>' + totFmtMoney(det.costo) + '</td>'
                + '<td>' + (t.estado || '') + '</td>'
                + '</tr>';
        }).join('') + '</tbody>';
        tbl.innerHTML = thead + tbody;
        document.body.appendChild(tbl);
        window.descargarExcelDinamico(tmpId, 'Trabajos_OT');
        setTimeout(function() { var el = document.getElementById(tmpId); if (el) el.remove(); }, 1000);
        return;
    }

    // Fallback CSV
    var rows = [['ID Trabajo','N° OT','Placa','Trabajador(es)','Descripción','F/H Inicio','F/H Fin','Costo','Estado']];
    datos.forEach(function(t) {
        var det = totParseDetalles(t);
        rows.push([
            t.ticket_visita || '',
            t.id_ot || '',
            t.placa || '',
            det.personal || t.tecnico || '',
            t.trabajo_realizado || '',
            totFmtDateTime(t.fecha_trabajo),
            totFmtDateTime(t.fecha_salida),
            totFmtMoney(det.costo),
            t.estado || ''
        ]);
    });
    var csv = rows.map(function(r) { return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'Trabajos_OT.csv'; a.click();
    URL.revokeObjectURL(url);
};
