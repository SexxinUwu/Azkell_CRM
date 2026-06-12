// ================================================================
// Módulo Almacén / Salidas — Azkell Fleet
// Ruta SPA: almacen/salidas
// Entry point: window.init_salidas()
// Copia funcional de almacen-ot con prefijo 'sal'
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.salData       = window.salData       || [];
window.salDatosFil   = window.salDatosFil   || [];
window.salTabActiva  = window.salTabActiva  || 'pend';
window.salDetalleId  = window.salDetalleId  || null;
window._salItemIdx   = window._salItemIdx   || 0;
window._salPlacas    = window._salPlacas    || [];
window._salConductores = window._salConductores || [];
window._salInvData   = window._salInvData   || [];
window._salPag       = window._salPag       || 1;
window._SAL_POR_PAG  = 25;

window._salIrPag = function(p) {
    window._salPag = p;
    window.salRenderTabla();
};

// ── Entry point ──────────────────────────────────────────────────
window.init_salidas = function() {
    window.salTabActiva = 'desp';
    salSincronizarTabs();
    salCargar();
    _salCargarSelectores();
    window._salMobileInit();
};

// ── Mobile Init ───────────────────────────────────────────────────
window._salMobileInit = function() {
    var isMob = window.innerWidth < 768;
    ['sal-m-header','sal-m-tabs','sal-search-compact','sal-fab-wrap'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = isMob ? 'flex' : 'none';
    });
    // Iniciales avatar
    var av = document.getElementById('sal-m-avatar');
    if (av) {
        var email = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
        var partes = email.split('@')[0].split(/[._-]/);
        var inits = partes.length >= 2 ? (partes[0][0]+partes[1][0]).toUpperCase() : email.substr(0,2).toUpperCase();
        av.textContent = inits || 'SA';
    }
};

window._salToggleFiltrosMobile = function() {
    var el = document.getElementById('sal-filtros-mobile');
    if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
};

window._salSyncMTabs = function(tab) {
    ['pend','desp','anulado'].forEach(function(t) {
        var btn = document.getElementById('sal-m-tab-'+t);
        if (btn) btn.classList.toggle('active', t === tab);
    });
};

// ── Carga de datos ─────────────────────────────────────────────
window.salCargar = function() {
    var tbody = document.getElementById('sal-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="sal-td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';

    fetch('/api/almacen/salidas')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            window.salData = Array.isArray(data) ? data : [];
            window._salRenderKPIs(window.salData);
            salActualizarBadges();
            salRenderTabla();
        })
        .catch(function(err) {
            console.error('Error cargando almacén salidas:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al cargar datos de almacén', 'danger');
            var tb = document.getElementById('sal-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="7" class="sal-td-placeholder">Error al cargar datos</td></tr>';
        });
};

// ── Cargar selectores para el formulario ──────────────────────
function _salCargarSelectores() {
    fetch('/api/conductores-lista')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            window._salConductores = d || [];
            var items = (d || []).map(function(c) {
                var nom = (c.nombre || '').trim();
                return nom ? { value: nom, label: nom } : null;
            }).filter(Boolean);
            window._cbInit('sal-f-responsable', items, 'Buscar responsable…');
        })
        .catch(function() {});

    fetch('/api/placas-lista')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            window._salPlacas = d || [];
            var items = (d || []).map(function(p) {
                var placa = (p.placa || '').toUpperCase();
                return { value: placa, label: placa };
            }).filter(function(x) { return x.value; }).sort(function(a,b){ return a.label.localeCompare(b.label); });
            window._cbInit('sal-f-placa', items, 'Buscar placa…');
        })
        .catch(function() {});

    fetch('/api/almacen/inventario')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            window._salInvData = d || [];
            var dl = document.getElementById('sal-inv-list');
            if (dl) dl.innerHTML = (d || []).map(function(a) {
                return '<option value="' + salEsc(a.id + ' — ' + a.descripcion) + '">';
            }).join('');
        })
        .catch(function() {});

    fetch('/api/ordenes-trabajo')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            window._salOTs = d || [];
            var items = (d || []).map(function(o) {
                var idOt  = (o.id_ot || '').toUpperCase();
                var placa = (o.placa || '').toUpperCase();
                if (!idOt) return null;
                return { value: idOt, label: placa ? idOt + ' — ' + placa : idOt };
            }).filter(Boolean);
            window._cbInit('sal-f-ot', items, 'Buscar N° OT o placa…');
            window._cbOnSelect('sal-f-ot', function(val) {
                var ot = (window._salOTs || []).find(function(o) {
                    return (o.id_ot || '').toUpperCase() === val;
                });
                if (ot && ot.placa) {
                    var tipoEl = document.getElementById('sal-f-tipo');
                    if (tipoEl && tipoEl.value !== 'Vehiculo') {
                        tipoEl.value = 'Vehiculo';
                        if (typeof window.salToggleTipo === 'function') window.salToggleTipo();
                    }
                    if (typeof window._cbSet === 'function') {
                        window._cbSet('sal-f-placa', ot.placa.toUpperCase(), ot.placa.toUpperCase());
                    }
                }
            });
        })
        .catch(function() {});

    var fechaEl = document.getElementById('sal-f-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().split('T')[0];
}

// ── Helpers ──────────────────────────────────────────────────
function salEsc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function salFmtMoney(val) {
    return 'S/.' + parseFloat(val || 0).toFixed(2);
}

function salFmtDate(iso) {
    if (!iso) return '—';
    var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return s || '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' });
}

function salBadge(estado) {
    if (estado === 'Despachado') return '<span class="sal-badge badge-despachado">Despachado</span>';
    if (estado === 'Anulado')   return '<span class="sal-badge badge-anulado">Anulado</span>';
    return '<span class="sal-badge badge-pendiente">Pendiente</span>';
}

function salDescLimpia(desc, invId) {
    if (!desc) return '—';
    if (invId && desc.indexOf(invId + ' — ') === 0) return desc.slice(invId.length + 3);
    var sep = desc.indexOf(' — ');
    return sep !== -1 ? desc.slice(sep + 3) : desc;
}

// ── Badges de tabs ────────────────────────────────────────────
function salActualizarBadges() {
    var pend   = window.salData.filter(function(m) { return m.estado !== 'Despachado' && m.estado !== 'Anulado'; }).length;
    var desp   = window.salData.filter(function(m) { return m.estado === 'Despachado'; }).length;
    var anulado= window.salData.filter(function(m) { return m.estado === 'Anulado'; }).length;
    var bp = document.getElementById('sal-badge-pend');
    var bd = document.getElementById('sal-badge-desp');
    var ba = document.getElementById('sal-badge-anulado');
    if (bp) bp.textContent = pend;
    if (bd) bd.textContent = desp;
    if (ba) ba.textContent = anulado;
}

// ── Tabs ──────────────────────────────────────────────────────
window.salCambiarTab = function(tab) {
    window.salTabActiva = tab;
    salSincronizarTabs();
    window.salDetalleId = null;
    var panel = document.getElementById('sal-panel-detalle');
    if (panel) panel.classList.remove('open');
    salRenderTabla();
};

function salSincronizarTabs() {
    ['pend', 'desp', 'anulado'].forEach(function(t) {
        var el = document.getElementById('sal-tab-' + t);
        if (el) el.classList.toggle('active', t === window.salTabActiva);
    });
}

// ── Filtrar ───────────────────────────────────────────────────
window.salFiltrar = function() { salRenderTabla(); };

function salGetFiltros() {
    return {
        search: ((document.getElementById('sal-search') || {}).value || '').toLowerCase().trim(),
        ot:     ((document.getElementById('sal-fil-ot') || {}).value || '').trim().toLowerCase(),
        placa:  ((document.getElementById('sal-fil-placa') || {}).value || '').trim().toUpperCase(),
        mes:    ((document.getElementById('sal-fil-mes') || {}).value || '').trim(),
        desde:  ((document.getElementById('sal-fil-desde') || {}).value || '').trim(),
        hasta:  ((document.getElementById('sal-fil-hasta') || {}).value || '').trim(),
        estado: ((document.getElementById('sal-fil-estado') || {}).value || '').trim()
    };
}

// ── Render tabla ──────────────────────────────────────────────
window.salRenderTabla = function() {
    var tbody = document.getElementById('sal-tbody');
    if (!tbody) return;

    var f = salGetFiltros();

    var datos = window.salData.filter(function(m) {
        if (!f.estado) {
            if (window.salTabActiva === 'pend'    && (m.estado === 'Despachado' || m.estado === 'Anulado')) return false;
            if (window.salTabActiva === 'desp'    && m.estado !== 'Despachado') return false;
            if (window.salTabActiva === 'anulado' && m.estado !== 'Anulado')    return false;
        } else {
            if (m.estado !== f.estado) return false;
        }
        if (f.ot && String(m.ticket_ot || '').toLowerCase().indexOf(f.ot) === -1) return false;
        if (f.placa && String(m.placa || '').toUpperCase().indexOf(f.placa) === -1) return false;
        if (f.mes) {
            var fechaStr = m.fecha ? String(m.fecha).split('T')[0] : '';
            if (!fechaStr.startsWith(f.mes)) return false;
        }
        if (f.desde || f.hasta) {
            var fechaStr2 = m.fecha ? String(m.fecha).split('T')[0] : '';
            if (f.desde && fechaStr2 < f.desde) return false;
            if (f.hasta && fechaStr2 > f.hasta) return false;
        }
        if (f.search) {
            var artDesc = (m.items || []).map(function(it) { return it.descripcion || ''; }).join(' ');
            var s = [m.id, m.ticket_ot, m.placa, m.responsable, artDesc].join(' ').toLowerCase();
            if (s.indexOf(f.search) === -1) return false;
        }
        return true;
    });

    window.salDatosFil = datos;

    var paginEl = document.getElementById('sal-paginacion');
    var totalPag = Math.ceil(datos.length / window._SAL_POR_PAG);
    if (totalPag === 0) totalPag = 1;
    if (window._salPag > totalPag) window._salPag = totalPag;
    if (window._salPag < 1) window._salPag = 1;
    
    var pag = window._salPag;
    var inicio = (pag - 1) * window._SAL_POR_PAG;
    var datosPag = datos.slice(inicio, inicio + window._SAL_POR_PAG);

    if (datos.length === 0) {
        var msg = window.salTabActiva === 'pend' ? 'Sin solicitudes pendientes'
                : window.salTabActiva === 'anulado' ? 'Sin salidas anuladas'
                : 'Sin salidas registradas';
        tbody.innerHTML = '<tr><td colspan="11" class="sal-td-placeholder" style="text-align:center"><i class="bi bi-box" style="font-size:1.5rem; opacity:0.3"></i><br>' + msg + '</td></tr>';
        if (paginEl) paginEl.innerHTML = '';
        return;
    }

    tbody.innerHTML = '';
    datosPag.forEach(function(m) {
        var items = m.items || [];

        var filteredItems = items;
        if (f.search) {
            var salidaText = [m.id, m.ticket_ot, m.placa, m.responsable].join(' ').toLowerCase();
            if (salidaText.indexOf(f.search) === -1) {
                filteredItems = items.filter(function(it) {
                    return [(it.inventario_id || ''), (it.descripcion || '')].join(' ').toLowerCase().indexOf(f.search) !== -1;
                });
            }
        }

        if (!filteredItems.length) {
            var tr = document.createElement('tr');
            if (m.id === window.salDetalleId) tr.classList.add('sal-row-active');
            tr.innerHTML =
                '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + salEsc(m.id || '—') + '</span></td>'
                + '<td>' + salFmtDate(m.fecha) + '</td>'
                + '<td class="col-hide-mob"><strong>' + salEsc(m.ticket_ot || '—') + '</strong></td>'
                + '<td>' + salEsc(m.placa || '—') + '</td>'
                + '<td class="col-hide-mob">' + salEsc(m.responsable || '—') + '</td>'
                + '<td colspan="3" style="color:var(--subtext);font-size:0.78rem;">Sin artículos</td>'
                + '<td class="col-hide-mob"></td>'
                + '<td class="col-hide-mob"></td>'
                + '<td>' + salBadge(m.estado) + '</td>';
            tr.onclick = (function(row) { return function() { salAbrirDetalle(row); }; })(m);
            tbody.appendChild(tr);
            return;
        }

        filteredItems.forEach(function(it, idx) {
            var tr = document.createElement('tr');
            var isFirst = idx === 0;
            var isLast  = idx === filteredItems.length - 1;
            if (m.id === window.salDetalleId) tr.classList.add('sal-row-active');
            if (!isFirst) tr.classList.add('sal-item-sub');
            if (isLast && filteredItems.length > 1) tr.classList.add('sal-item-last');
            var nombre = salDescLimpia(it.descripcion, it.inventario_id);
            var cant   = parseFloat(it.cantidad || 0);
            var cu     = parseFloat(it.costo_unitario || 0);
            tr.innerHTML =
                '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + salEsc(m.id || '—') + '</span></td>'
                + '<td style="white-space:nowrap;">' + salFmtDate(m.fecha) + '</td>'
                + '<td class="col-hide-mob"><strong>' + salEsc(m.ticket_ot || '—') + '</strong></td>'
                + '<td>' + salEsc(m.placa || '—') + '</td>'
                + '<td class="col-hide-mob">' + salEsc(m.responsable || '—') + '</td>'
                + '<td class="col-hide-mob" style="font-size:0.75rem;color:var(--subtext);font-family:monospace;white-space:nowrap;">' + salEsc(it.inventario_id || '—') + '</td>'
                + '<td class="col-articulo" style="font-size:0.82rem;">' + salEsc(nombre) + '</td>'
                + '<td class="text-end" style="font-size:0.82rem;">' + cant.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</td>'
                + '<td class="text-end col-hide-mob" style="font-size:0.82rem;">' + salFmtMoney(cu) + '</td>'
                + '<td class="text-end col-hide-mob">' + (isFirst ? '<strong style="color:#16a34a;">' + salFmtMoney(m.total_pen) + '</strong>' : '') + '</td>'
                + '<td>' + (isFirst ? salBadge(m.estado) : '') + '</td>';
            tr.onclick = (function(row) { return function() { salAbrirDetalle(row); }; })(m);
            tbody.appendChild(tr);
        });
    });

    if (paginEl) {
        if (totalPag <= 1) { paginEl.innerHTML = ''; return; }
        var btns = '';
        btns += '<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:' + (pag<=1?'0.35':'1') + ';" ' + (pag<=1?'disabled':'') + ' onclick="window._salIrPag(' + (pag-1) + ')"><i class="bi bi-chevron-left"></i></button>';
        btns += '<span style="font-size:.8rem;font-weight:700;color:var(--subtext);">Pág. <b style="color:var(--text)">' + pag + '</b> / ' + totalPag + '</span>';
        btns += '<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:' + (pag>=totalPag?'0.35':'1') + ';" ' + (pag>=totalPag?'disabled':'') + ' onclick="window._salIrPag(' + (pag+1) + ')"><i class="bi bi-chevron-right"></i></button>';
        paginEl.innerHTML = '<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem .75rem;">' + btns + '</div>';
    }
};

// ── Detalle lateral ───────────────────────────────────────────
function salAbrirDetalle(m) {
    window.salDetalleId = m.id;
    salRenderTabla();
    var bd = document.getElementById('sal-det-backdrop');
    if (bd && window.innerWidth < 768) bd.style.display = 'block';

    var titulo = document.getElementById('sal-detalle-titulo');
    if (titulo) titulo.textContent = 'Salida ' + (m.id || '');

    var html = '';
    html += '<div style="font-size:1.2rem; font-weight:800; color:var(--text); margin-bottom:0.3rem;">' + salEsc(m.id || '—') + '</div>';
    html += '<div style="font-size:0.83rem; color:var(--subtext); margin-bottom:1rem;">OT: <strong>' + salEsc(m.ticket_ot || '—') + '</strong></div>';

    html += '<div class="sal-sec">';
    html += '<div class="sal-sec-hd">Cabecera</div>';
    html += '<div class="sal-field"><div class="sal-field-lbl">Estado</div><div class="sal-field-val">' + salBadge(m.estado) + '</div></div>';
    html += '<div class="sal-field"><div class="sal-field-lbl">Fecha</div><div class="sal-field-val">' + salFmtDate(m.fecha) + '</div></div>';
    html += '<div class="sal-field"><div class="sal-field-lbl">Placa</div><div class="sal-field-val"><strong>' + salEsc(m.placa || '—') + '</strong></div></div>';
    html += '<div class="sal-field"><div class="sal-field-lbl">Responsable</div><div class="sal-field-val">' + salEsc(m.responsable || '—') + '</div></div>';
    if (m.observaciones) html += '<div class="sal-field"><div class="sal-field-lbl">Observaciones</div><div class="sal-field-val" style="white-space:normal;font-size:0.78rem;">' + salEsc(m.observaciones) + '</div></div>';
    if (m.estado === 'Anulado' && m.motivo_anulacion) {
        html += '<div class="sal-field" style="background:rgba(220,38,38,0.04);"><div class="sal-field-lbl" style="color:#dc2626;">Motivo anulación</div><div class="sal-field-val" style="color:#dc2626;white-space:normal;font-size:0.78rem;">' + salEsc(m.motivo_anulacion) + '</div></div>';
    }
    html += '</div>';

    if (m.items && m.items.length) {
        html += '<div class="sal-sec">';
        html += '<div class="sal-sec-hd">Artículos</div>';
        m.items.forEach(function(it) {
            var imp = parseFloat(it.importe) || (parseFloat(it.cantidad) * parseFloat(it.costo_unitario));
            html += '<div class="sal-field" style="display:block;">'
                + '<div style="font-weight:700;color:var(--text);font-size:0.82rem;">' + salEsc(it.descripcion || it.inventario_id || '—') + '</div>'
                + '<div style="font-size:0.78rem;color:var(--subtext);">'
                + parseFloat(it.cantidad || 0).toLocaleString('es-PE', {maximumFractionDigits:3}) + ' u. · S/.' + parseFloat(it.costo_unitario || 0).toFixed(2) + ' c/u'
                + ' = <strong style="color:var(--text);">S/.' + imp.toFixed(2) + '</strong>'
                + '</div>'
                + '</div>';
        });
        html += '<div style="padding:8px 12px;font-weight:800;text-align:right;color:#16a34a;">Total: ' + salFmtMoney(m.total_pen) + '</div>';
        html += '</div>';
    }

    var scroll = document.getElementById('sal-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    var footer = document.getElementById('sal-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        var eId = salEsc(m.id);
        var puedeEditar   = window.checkPerm('sal_inv', 'e');
        var puedeEliminar = window.checkPerm('sal_inv', 'd');
        var btnDespachar = (puedeEditar && m.estado !== 'Despachado' && m.estado !== 'Anulado')
            ? '<button class="btn btn-sm btn-success flex-fill fw-bold ms-1" onclick="window.salDespachar(\'' + eId + '\')"><i class="bi bi-box-seam me-1"></i>Despachar</button>'
            : '';
        var btnAnular = puedeEliminar
            ? (m.estado !== 'Anulado'
                ? '<button class="btn btn-sm btn-outline-danger ms-auto" onclick="window.salAnular(\'' + eId + '\')"><i class="bi bi-slash-circle me-1"></i>Anular</button>'
                : '<span class="sal-badge badge-anulado ms-auto" style="font-size:0.72rem;padding:5px 10px;">Anulada</span>')
            : (m.estado === 'Anulado' ? '<span class="sal-badge badge-anulado ms-auto" style="font-size:0.72rem;padding:5px 10px;">Anulada</span>' : '');
        var btnEditar = puedeEditar
            ? '<button class="btn btn-sm btn-outline-warning ms-1 fw-bold" onclick="window.salEditarSalida(\'' + eId + '\')"><i class="bi bi-pencil-square me-1"></i>Editar</button>'
            : '';
        footer.innerHTML =
            '<button class="btn btn-sm btn-outline-secondary" onclick="window.salVerPDF(window.salData.find(function(x){return x.id===\'' + eId + '\';}))" style="min-width:70px;"><i class="bi bi-eye me-1"></i>Ver</button>'
          + '<button class="btn btn-sm btn-outline-primary ms-1" onclick="window.salGenerarPDF(window.salData.find(function(x){return x.id===\'' + eId + '\';}))" style="min-width:70px;"><i class="bi bi-filetype-pdf me-1"></i>PDF</button>'
          + btnEditar
          + (btnDespachar ? btnDespachar : '')
          + btnAnular;
    }

    var panel = document.getElementById('sal-panel-detalle');
    if (panel) panel.classList.add('open');
}

window.salCerrarDetalle = function() {
    var panel = document.getElementById('sal-panel-detalle');
    if (panel) panel.classList.remove('open');
    var bd = document.getElementById('sal-det-backdrop');
    if (bd) bd.style.display = 'none';
    window.salDetalleId = null;
    salRenderTabla();
};

// ── Despachar salida ──────────────────────────────────────────────
window.salDespachar = function(id) {
    if (!window.guardAction('sal_inv', 'e')) return;
    if (!confirm('¿Despachar la salida ' + id + '? El stock del inventario será descontado.')) return;
    fetch('/api/almacen/salidas/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'despachar' })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Salida ' + id + ' despachada — stock descontado', 'success');
        window.salDetalleId = null;
        var panel = document.getElementById('sal-panel-detalle');
        if (panel) panel.classList.remove('open');
        salCargar();
    })
    .catch(function(err) {
        console.error('Error despachando salida:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al despachar la salida', 'danger');
    });
};

// ── Anular salida ─────────────────────────────────────────────
window.salAnular = function(id) {
    if (!window.guardAction('sal_inv', 'd')) return;
    var motivo = window.prompt('Motivo de anulación (obligatorio):');
    if (motivo === null) return; // cancelado
    motivo = motivo.trim();
    if (!motivo) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('El motivo es obligatorio para anular', 'warning'); return; }

    fetch('/api/almacen/salidas/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'anular', motivo: motivo })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Salida ' + id + ' anulada — stock restaurado', 'success');
        window.salDetalleId = null;
        var panel = document.getElementById('sal-panel-detalle');
        if (panel) panel.classList.remove('open');
        salCargar();
    })
    .catch(function(err) {
        console.error('Error anulando salida:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al anular la salida', 'danger');
    });
};

// ── Eliminar salida ───────────────────────────────────────────
window.salEliminar = function(id) {
    if (!confirm('¿Eliminar la salida ' + id + '? El stock volverá a su valor anterior.')) return;
    fetch('/api/almacen/salidas/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Salida eliminada — stock restaurado', 'success');
            window.salDetalleId = null;
            var panel = document.getElementById('sal-panel-detalle');
            if (panel) panel.classList.remove('open');
            salCargar();
        })
        .catch(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar la salida', 'danger');
        });
};

// ── Construir HTML del comprobante ────────────────────────────
function salBuildPDFHtml(m) {
    var id      = m.id || '—';
    var fecha   = m.fecha ? String(m.fecha).split('T')[0] : '—';
    var totalPen = parseFloat(m.total_pen || 0);
    var itemsHTML = (m.items || []).map(function(it, i) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || 0) || cant * cu;
        var bgRow = i % 2 === 0 ? '#f9fafb' : '#ffffff';
        return '<tr style="background:' + bgRow + '">'
            + '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">' + salEsc(it.descripcion || it.inventario_id || '—') + '</td>'
            + '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center">' + cant.toLocaleString('es-PE', { maximumFractionDigits: 3 }) + '</td>'
            + '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">S/ ' + cu.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '</td>'
            + '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">S/ ' + imp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>'
            + '</tr>';
    }).join('');

    var estadoBadge = m.estado === 'Anulado'
        ? '<span style="display:inline-block;padding:2px 10px;background:#fee2e2;color:#dc2626;border-radius:12px;font-size:11px;font-weight:700;margin-left:8px;">ANULADA</span>'
        : '';
    var motivoHtml = (m.estado === 'Anulado' && m.motivo_anulacion)
        ? '<div style="padding:10px 14px;background:#fee2e2;border-radius:6px;border-left:3px solid #dc2626;font-size:12px;margin-bottom:12px"><b>Motivo anulación: </b>' + salEsc(m.motivo_anulacion) + '</div>'
        : '';

    return '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#1e293b">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #2563eb">'
            + '<div><div style="font-size:22px;font-weight:700;color:#2563eb">AZKELL FLEET</div><div style="font-size:11px;color:#64748b;margin-top:2px">Sistema de Gestión de Flotas</div></div>'
            + '<div style="text-align:right"><div style="font-size:18px;font-weight:700">COMPROBANTE DE SALIDA' + estadoBadge + '</div>'
            + '<div style="font-size:13px;color:#2563eb;font-weight:600;margin-top:4px">' + salEsc(id) + '</div>'
            + '<div style="font-size:11px;color:#64748b;margin-top:2px">Fecha: ' + fecha + '</div></div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:14px 16px;background:#f1f5f9;border-radius:8px">'
            + '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">OT Referencia</div><div style="font-size:13px;font-weight:600">' + salEsc(m.ticket_ot || '—') + '</div></div>'
            + '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Tipo Destino</div><div style="font-size:13px;font-weight:600">' + salEsc(m.tipo_destino || '—') + '</div></div>'
            + '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Placa</div><div style="font-size:13px;font-weight:600">' + salEsc(m.placa || '—') + '</div></div>'
            + '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Responsable</div><div style="font-size:13px;font-weight:600">' + salEsc(m.responsable || '—') + '</div></div>'
        + '</div>'
        + motivoHtml
        + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'
            + '<thead><tr style="background:#2563eb;color:#fff">'
                + '<th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase">Artículo</th>'
                + '<th style="padding:9px 10px;text-align:center;font-size:11px;text-transform:uppercase">Cantidad</th>'
                + '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Costo Unit.</th>'
                + '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Importe</th>'
            + '</tr></thead>'
            + '<tbody>' + itemsHTML + '</tbody>'
        + '</table>'
        + '<div style="display:flex;justify-content:flex-end;margin-bottom:20px">'
            + '<div style="min-width:220px">'
                + '<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#2563eb;color:#fff;border-radius:6px;font-size:14px;font-weight:700">'
                    + '<span>TOTAL PEN</span><span>S/ ' + totalPen.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span>'
                + '</div>'
            + '</div>'
        + '</div>'
        + (m.observaciones ? '<div style="padding:10px 14px;background:#fef9c3;border-radius:6px;border-left:3px solid #eab308;font-size:12px;margin-bottom:12px"><b>Obs.: </b>' + salEsc(m.observaciones) + '</div>' : '')
        + '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">'
            + '<span>Generado: ' + new Date().toLocaleString('es-PE') + '</span>'
            + '<span>Azkell Fleet — Sistema de Gestión de Flotas</span>'
        + '</div>'
    + '</div>';
}

// ── Generar PDF de salida (descarga) ─────────────────────────
window.salGenerarPDF = function(m) {
    if (!m) return;
    if (typeof html2pdf === 'undefined') {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Librería html2pdf no cargada', 'danger');
        return;
    }
    var opt = {
        margin: [8, 8, 8, 8],
        filename: 'Salida_' + (m.id || 'sin-id') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    var wrapper = document.createElement('div');
    wrapper.innerHTML = salBuildPDFHtml(m);
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    document.body.appendChild(wrapper);
    html2pdf().set(opt).from(wrapper.firstChild).save().then(function() {
        document.body.removeChild(wrapper);
    });
};

// ── Previsualizar comprobante en nueva pestaña ────────────────
window.salVerPDF = function(m) {
    if (!m) return;
    if (typeof html2pdf === 'undefined') {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Librería html2pdf no cargada', 'danger');
        return;
    }
    var opt = {
        margin: [8, 8, 8, 8],
        filename: 'Salida_' + (m.id || '') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    var wrapper = document.createElement('div');
    wrapper.innerHTML = salBuildPDFHtml(m);
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    document.body.appendChild(wrapper);
    html2pdf().set(opt).from(wrapper.firstChild).outputPdf('bloburl').then(function(url) {
        document.body.removeChild(wrapper);
        window.open(url, '_blank');
    });
};

window.salEditarSalida = function(id) {
    if (!window.guardAction('sal_inv', 'e')) return;
    var m = window.salData.find(function(x) { return x.id === id; });
    if (!m) return;
    
    // Preparar UI
    window.salAbrirNuevo();
    
    // Cargar datos en drawer
    window._salEditId = id;
    var titleEl = document.querySelector('.sal-drawer-title');
    if (titleEl) titleEl.innerHTML = '<i class="bi bi-pencil-square text-warning me-2"></i>Editar Solicitud ' + id;
    
    // Llenar campos cabecera
    if (m.ticket_ot) window._cbSet('sal-f-ot', m.ticket_ot, m.ticket_ot);
    var fechaEl = document.getElementById('sal-f-fecha');
    if (fechaEl && m.fecha) fechaEl.value = m.fecha.substring(0, 10);
    
    var tipoEl = document.getElementById('sal-f-tipo');
    if (tipoEl) {
        tipoEl.value = m.placa ? 'Vehiculo' : 'Personal';
        window.salToggleTipo();
    }
    
    if (m.placa) window._cbSet('sal-f-placa', m.placa, m.placa);
    if (m.responsable) window._cbSet('sal-f-responsable', m.responsable, m.responsable);
    
    var obsEl = document.getElementById('sal-f-obs');
    if (obsEl) obsEl.value = m.observaciones || '';
    
    // Limpiar items creados por salAbrirNuevo y cargar los existentes
    var tbody = document.getElementById('sal-items-tbody');
    if (tbody) tbody.innerHTML = '';
    
    if (m.items && m.items.length) {
        m.items.forEach(function(it) {
            var idx = window._salItemIdx++;
            var tr = document.createElement('tr');
            tr.id = 'sal-item-' + idx;
            tr.innerHTML =
                '<td>' +
                    '<div style="display:flex;gap:4px;align-items:center;">' +
                        '<input type="text" class="form-control form-control-sm sal-item-desc" list="sal-inv-list" placeholder="Buscar artículo…" ' +
                            'data-idx="' + idx + '" oninput="window._salBuscarArt(this,' + idx + ')" value="' + salEsc(it.inventario_id + ' — ' + (it.descripcion || '')) + '">' +
                        '<button type="button" class="btn btn-sm btn-outline-secondary" style="flex-shrink:0;padding:2px 7px;" ' +
                            'onclick="window._salAbrirQR(' + idx + ')" title="Escanear código de barras">' +
                            '<i class="bi bi-upc-scan"></i>' +
                        '</button>' +
                    '</div>' +
                    '<input type="hidden" class="sal-item-inv-id" data-idx="' + idx + '" value="' + salEsc(it.inventario_id) + '">' +
                '</td>' +
                '<td><input type="number" class="form-control form-control-sm sal-item-cant" data-idx="' + idx + '" value="' + parseFloat(it.cantidad || 0) + '" min="0.001" step="0.001" oninput="window._salCalcItem(' + idx + ')"></td>' +
                '<td><input type="number" class="form-control form-control-sm sal-item-cu" data-idx="' + idx + '" value="' + parseFloat(it.costo_unitario || 0) + '" min="0" step="0.01" oninput="window._salCalcItem(' + idx + ')"></td>' +
                '<td><input type="number" class="form-control form-control-sm sal-item-imp" data-idx="' + idx + '" value="' + (parseFloat(it.cantidad || 0) * parseFloat(it.costo_unitario || 0)).toFixed(2) + '" readonly></td>' +
                '<td><button type="button" class="btn btn-sm btn-outline-danger" onclick="window._salQuitarItem(' + idx + ')"><i class="bi bi-x"></i></button></td>';
            if (tbody) tbody.appendChild(tr);
        });
        _salActualizarTotal();
    }
    
    // Cerrar el detalle para mostrar el form claramente
    window.salCerrarDetalle();
};

// ── Nueva Solicitud: Abrir / Cerrar ───────────────────────────
window.salAbrirNuevo = function() {
    if (!window.guardAction('sal_inv', 'c')) return;
    var ids = ['sal-f-obs'];
    ids.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
    window._cbReset('sal-f-ot');
    window._cbReset('sal-f-placa');
    window._cbReset('sal-f-responsable');
    var fechaEl = document.getElementById('sal-f-fecha');
    if (fechaEl) fechaEl.value = new Date().toISOString().split('T')[0];
    var tipoEl = document.getElementById('sal-f-tipo');
    if (tipoEl) tipoEl.value = 'Vehiculo';
    var tbody = document.getElementById('sal-items-tbody');
    if (tbody) tbody.innerHTML = '';
    window._salItemIdx = 0;
    var totalEl = document.getElementById('sal-items-total');
    if (totalEl) totalEl.textContent = 'S/. 0.00';
    _salAgregarItem();

    // Reset edit mode
    window._salEditId = null;
    var titleEl = document.querySelector('.sal-drawer-title');
    if (titleEl) titleEl.innerHTML = '<i class="bi bi-arrow-up-circle-fill text-primary me-2"></i>Nueva Solicitud';

    // Listener OT → auto-completar Placa (manejado por _cbOnSelect en _salCargarSelectores)

    var drawer = document.getElementById('sal-drawer-nuevo');
    if (drawer) drawer.classList.add('open');
    var bd = document.getElementById('salNuevoBackdrop');
    if (bd) bd.classList.add('open');
};

window.salCerrarNuevo = function() {
    var drawer = document.getElementById('sal-drawer-nuevo');
    if (drawer) drawer.classList.remove('open');
    var bd = document.getElementById('salNuevoBackdrop');
    if (bd) bd.classList.remove('open');
};

// ── Auto-completar Placa al ingresar N° OT ────────────────────
window._salBuscarPlacaPorOT = function() {
    var otEl = document.getElementById('sal-f-ot');
    var otVal = otEl ? otEl.value.trim() : '';
    if (!otVal) return;
    fetch('/api/ordenes/by-ticket?id=' + encodeURIComponent(otVal))
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(ot) {
            if (!ot || !ot.placa) return;
            // Asegurar tipo = Vehículo para mostrar el campo placa
            var tipoEl = document.getElementById('sal-f-tipo');
            if (tipoEl && tipoEl.value !== 'Vehiculo') {
                tipoEl.value = 'Vehiculo';
                window.salToggleTipo();
            }
            // Rellenar combobox placa
            if (typeof window._cbSet === 'function') {
                window._cbSet('sal-f-placa', ot.placa, ot.placa);
            }
        })
        .catch(function() {});
};

// ── Items del formulario ──────────────────────────────────────
window._salAgregarItem = function() {
    var tbody = document.getElementById('sal-items-tbody');
    if (!tbody) return;
    var idx = window._salItemIdx++;
    var tr = document.createElement('tr');
    tr.id = 'sal-item-' + idx;
    tr.innerHTML =
        '<td>' +
            '<div style="display:flex;gap:4px;align-items:center;">' +
                '<input type="text" class="form-control form-control-sm sal-item-desc" list="sal-inv-list" placeholder="Buscar artículo…" ' +
                    'data-idx="' + idx + '" oninput="window._salBuscarArt(this,' + idx + ')">' +
                '<button type="button" class="btn btn-sm btn-outline-secondary" style="flex-shrink:0;padding:2px 7px;" ' +
                    'onclick="window._salAbrirQR(' + idx + ')" title="Escanear código de barras">' +
                    '<i class="bi bi-upc-scan"></i>' +
                '</button>' +
            '</div>' +
            '<input type="hidden" class="sal-item-inv-id" data-idx="' + idx + '">' +
        '</td>' +
        '<td><input type="number" class="form-control form-control-sm sal-item-cant" data-idx="' + idx + '" value="1" min="0.001" step="0.001" oninput="window._salCalcItem(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm sal-item-cu" data-idx="' + idx + '" value="0" min="0" step="0.01" oninput="window._salCalcItem(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm sal-item-imp" data-idx="' + idx + '" value="0" readonly></td>' +
        '<td><button type="button" class="btn btn-sm btn-outline-danger" onclick="window._salQuitarItem(' + idx + ')"><i class="bi bi-x"></i></button></td>';
    tbody.appendChild(tr);
};

window._salQrTargetIdx = window._salQrTargetIdx || null;

window._salAbrirQR = function(idx) {
    window._salQrTargetIdx = idx;
    window._abrirEscaner(function(valor) {
        window._salSeleccionarItemPorQR(valor, window._salQrTargetIdx);
    }, 'Escanear Artículo');
};

window._salSeleccionarItemPorQR = function(valor, idx) {
    var item = (window._salInvData || []).find(function(d) {
        return String(d.id).trim() === valor.trim() ||
               (d.codigo_barras && d.codigo_barras.trim() === valor.trim());
    });
    if (!item) {
        if (typeof window.mostrarToast === 'function') window.mostrarToast('Artículo no encontrado: ' + valor, 'danger');
        else alert('Artículo no encontrado: ' + valor);
        return;
    }
    var descEl = document.querySelector('.sal-item-desc[data-idx="' + idx + '"]');
    var hidEl  = document.querySelector('.sal-item-inv-id[data-idx="' + idx + '"]');
    var cuEl   = document.querySelector('.sal-item-cu[data-idx="' + idx + '"]');
    if (descEl) descEl.value = item.id + ' — ' + (item.descripcion || '');
    if (hidEl)  hidEl.value  = item.id;
    if (cuEl)   { cuEl.value = parseFloat(item.costo_soles != null ? item.costo_soles : item.costo_referencial || 0).toFixed(2); window._salCalcItem(idx); }
    // Enfocar cantidad
    var cantEl = document.querySelector('.sal-item-cant[data-idx="' + idx + '"]');
    if (cantEl) { cantEl.focus(); cantEl.select(); }
    if (typeof window.mostrarToast === 'function') window.mostrarToast('Artículo: ' + (item.descripcion || item.id), 'success');
};

window._salBuscarArt = function(input, idx) {
    var val = input.value || '';
    var invId = val.split(' — ')[0].trim();
    var item = (window._salInvData || []).find(function(d) { return d.id === invId; });
    if (item) {
        var hidEl = document.querySelector('.sal-item-inv-id[data-idx="' + idx + '"]');
        if (hidEl) hidEl.value = item.id;
        var cuEl = document.querySelector('.sal-item-cu[data-idx="' + idx + '"]');
        var costoSoles = parseFloat(item.costo_soles != null ? item.costo_soles : item.costo_referencial || 0);
        if (cuEl) { cuEl.value = costoSoles.toFixed(2); window._salCalcItem(idx); }
    }
};

window._salCalcItem = function(idx) {
    var cant = parseFloat((document.querySelector('.sal-item-cant[data-idx="' + idx + '"]') || {}).value) || 0;
    var cu   = parseFloat((document.querySelector('.sal-item-cu[data-idx="' + idx + '"]')   || {}).value) || 0;
    var impEl = document.querySelector('.sal-item-imp[data-idx="' + idx + '"]');
    if (impEl) impEl.value = (cant * cu).toFixed(2);
    _salActualizarTotal();
};

window._salQuitarItem = function(idx) {
    var tr = document.getElementById('sal-item-' + idx);
    if (tr) tr.remove();
    _salActualizarTotal();
};

function _salActualizarTotal() {
    var imps = document.querySelectorAll('.sal-item-imp');
    var total = 0;
    imps.forEach(function(el) { total += parseFloat(el.value) || 0; });
    var el = document.getElementById('sal-items-total');
    if (el) el.textContent = 'S/. ' + total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Alerta Moderna (Estilo Azkell) ──────────────────────────────
window.salAlertModerno = function(titulo, mensaje) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);opacity:0;transition:opacity 0.2s ease;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;width:90%;max-width:380px;box-shadow:0 10px 25px rgba(0,0,0,0.2);transform:scale(0.95);transition:transform 0.2s ease;text-align:center;';

    box.innerHTML = 
        '<div style="margin-bottom:12px;">' +
        '<i class="bi bi-x-circle-fill text-danger" style="font-size:3rem;"></i>' +
        '</div>' +
        '<h6 style="margin:0 0 12px 0;font-weight:800;font-size:1.15rem;color:#1e293b;">' + titulo + '</h6>' +
        '<div style="margin:0 0 20px 0;font-size:0.9rem;color:#475569;line-height:1.5;text-align:left;">' + mensaje + '</div>' +
        '<button class="btn btn-sm" id="btn-ok" style="background:#5865F2;color:#fff;font-weight:700;padding:8px 24px;border-radius:8px;width:100%;font-size:0.95rem;">Aceptar</button>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(function(){
        overlay.style.opacity = '1';
        box.style.transform = 'scale(1)';
    });

    var ok = box.querySelector('#btn-ok');

    function cerrar() {
        overlay.style.opacity = '0';
        box.style.transform = 'scale(0.95)';
        setTimeout(function(){ if(overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    }

    overlay.addEventListener('click', function(e) { if(e.target === overlay) cerrar(); });
    ok.addEventListener('click', cerrar);
};

// ── Guardar nueva solicitud ───────────────────────────────────
window.salGuardarNuevo = function() {
    var get = function(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var idOt    = get('sal-f-ot');
    var fecha   = get('sal-f-fecha');
    var tipo    = get('sal-f-tipo');
    var placa   = (window._cbGet('sal-f-placa') || '').toUpperCase();
    var resp    = window._cbGetText('sal-f-responsable') || get('sal-f-responsable-txt') || '';
    var obs     = get('sal-f-obs');

    if (!fecha) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La fecha es requerida', 'danger'); return; }

    var invIds = document.querySelectorAll('.sal-item-inv-id');
    var descs  = document.querySelectorAll('.sal-item-desc');
    var cants  = document.querySelectorAll('.sal-item-cant');
    var cus    = document.querySelectorAll('.sal-item-cu');
    var imps   = document.querySelectorAll('.sal-item-imp');
    var items  = [];
    var requestedStock = {};

    for (var i = 0; i < cants.length; i++) {
        var desc = descs[i] ? descs[i].value.trim() : '';
        var invId = invIds[i] ? invIds[i].value : '';
        if (!desc && !invId) continue;
        var cant = parseFloat(cants[i].value) || 0;
        var cu   = parseFloat(cus[i].value)   || 0;
        var imp  = parseFloat(imps[i].value)  || cant * cu;
        if (cant <= 0) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Cantidad inválida en fila ' + (i + 1), 'danger'); return; }
        
        if (invId) {
            requestedStock[invId] = (requestedStock[invId] || 0) + cant;
        }
        
        items.push({ inventario_id: invId || null, descripcion: desc, cantidad: cant, costo_unitario: cu, importe: imp });
    }

    if (!items.length) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Agrega al menos un artículo', 'danger'); return; }

    // Validar el stock acumulado
    var stockErrors = [];
    for (var invIdKey in requestedStock) {
        var invItem = (window._salInvData || []).find(function(d) { return d.id === invIdKey; });
        if (invItem) {
            var stock = parseFloat(invItem.stock_actual || 0);
            if (requestedStock[invIdKey] > stock) {
                var descCorta = invItem.descripcion || invIdKey;
                stockErrors.push({
                    desc: descCorta,
                    stock: stock,
                    req: requestedStock[invIdKey]
                });
            }
        }
    }

    if (stockErrors.length > 0) {
        var msg = '<p style="text-align:center;margin-bottom:12px;">Se ha detectado stock insuficiente para los siguientes artículos:</p>';
        msg += '<div style="max-height:180px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#f8fafc;margin-bottom:12px;scrollbar-width:thin;">';
        stockErrors.forEach(function(e, idx) {
            var isLast = idx === stockErrors.length - 1;
            msg += '<div style="padding-bottom:8px;' + (isLast ? '' : 'margin-bottom:8px;border-bottom:1px dashed #cbd5e1;') + '">';
            msg += '<div style="font-weight:700;color:#1e293b;font-size:0.85rem;margin-bottom:6px;word-break:break-word;">' + salEsc(e.desc) + '</div>';
            msg += '<div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#475569;">';
            msg += '<span>Stock: <b style="color:#0f172a;">' + e.stock.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</b></span>';
            msg += '<span>Sol.: <b style="color:#ef4444;">' + e.req.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</b></span>';
            msg += '</div>';
            msg += '</div>';
        });
        msg += '</div>';
        
        window.salAlertModerno('Stock Insuficiente', msg);
        return;
    }

    var body = {
        ticket_ot:    idOt,
        fecha:        fecha,
        tipo_destino: tipo || 'Vehiculo',
        placa:        tipo === 'Vehiculo' ? placa : null,
        responsable:  resp,
        observaciones: obs,
        moneda:       'PEN',
        tipo_cambio:  1,
        creado_por:   localStorage.getItem('fleet_correo') || '',
        items:        items
    };

    var editId = window._salEditId || null;
    var method = editId ? 'PUT' : 'POST';
    var url    = editId ? '/api/almacen/salidas/' + encodeURIComponent(editId) : '/api/almacen/salidas';
    if (editId) body.accion = 'editar';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(function(r) {
        if (!r.ok) return r.json().then(function(e){ throw new Error(e.error || 'HTTP ' + r.status); });
        return r.json();
    })
    .then(function(d) {
        window.salCerrarNuevo();
        window._salEditId = null;
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta((editId ? 'Salida actualizada' : 'Salida ' + (d.id || '') + ' registrada'), 'success');
        salCargar();
    })
    .catch(function(err) {
        console.error('Error guardando salida:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta(err.message || 'Error al guardar la salida', 'danger');
    });
};





// ── Toggle tipo destino ───────────────────────────────────────
window.salToggleTipo = function() {
    var tipo = (document.getElementById('sal-f-tipo') || {}).value || '';
    var rowPlaca = document.getElementById('sal-row-placa');
    if (rowPlaca) rowPlaca.style.display = tipo === 'Vehiculo' ? '' : 'none';
    if (tipo !== 'Vehiculo') {
        window._cbReset('sal-f-placa');
    }
};

// ── Exportar a Excel ─────────────────────────────────────────
window.salExportar = function() {
    var datos = window.salDatosFil.length > 0 ? window.salDatosFil : window.salData;
    if (!datos.length) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No hay datos para exportar', 'warning');
        return;
    }

    if (typeof window.descargarExcelDinamico === 'function') {
        var tmpId = 'sal-export-tmp';
        var ex = document.getElementById(tmpId); if (ex) ex.remove();
        var tbl = document.createElement('table');
        tbl.id = tmpId; tbl.style.display = 'none';
        var thead = '<thead><tr><th>ID Solicitud</th><th>Fecha</th><th>N° OT</th><th>Placa</th><th>Responsable</th><th>Código</th><th>Artículo</th><th>Cantidad</th><th>Costo Unit.</th><th>Estado</th></tr></thead>';
        var rows = [];
        datos.forEach(function(m) {
            var items = m.items || [];
            var fecha = salFmtDate(m.fecha);
            if (!items.length) {
                rows.push('<tr>'
                    + '<td>' + salEsc(m.id||'') + '</td>'
                    + '<td>' + fecha + '</td>'
                    + '<td>' + salEsc(m.ticket_ot||'') + '</td>'
                    + '<td>' + salEsc(m.placa||'') + '</td>'
                    + '<td>' + salEsc(m.responsable||'') + '</td>'
                    + '<td></td><td>Sin artículos</td><td></td><td></td>'
                    + '<td>' + salEsc(m.estado||'') + '</td>'
                    + '</tr>');
            } else {
                items.forEach(function(it) {
                    var nombre = salDescLimpia(it.descripcion, it.inventario_id);
                    rows.push('<tr>'
                        + '<td>' + salEsc(m.id||'') + '</td>'
                        + '<td>' + fecha + '</td>'
                        + '<td>' + salEsc(m.ticket_ot||'') + '</td>'
                        + '<td>' + salEsc(m.placa||'') + '</td>'
                        + '<td>' + salEsc(m.responsable||'') + '</td>'
                        + '<td>' + salEsc(it.inventario_id||'') + '</td>'
                        + '<td class="col-articulo">' + salEsc(nombre) + '</td>'
                        + '<td>' + (it.cantidad||0) + '</td>'
                        + '<td>' + parseFloat(it.costo_unitario||0).toFixed(2) + '</td>'
                        + '<td>' + salEsc(m.estado||'') + '</td>'
                        + '</tr>');
                });
            }
        });
        tbl.innerHTML = thead + '<tbody>' + rows.join('') + '</tbody>';
        document.body.appendChild(tbl);
        window.descargarExcelDinamico(tmpId, 'Almacen_Salidas');
        setTimeout(function() { var el = document.getElementById(tmpId); if (el) el.remove(); }, 1000);
        return;
    }

    var cabecera = ['ID Solicitud','Fecha','N° OT','Placa','Responsable','Código','Artículo','Cantidad','Costo Unit.','Estado'];
    var csvRows = [cabecera];
    datos.forEach(function(m) {
        var items = m.items || [];
        var fecha = salFmtDate(m.fecha);
        if (!items.length) {
            csvRows.push([m.id||'', fecha, m.ticket_ot||'', m.placa||'', m.responsable||'', '', 'Sin artículos', '', '', m.estado||'']);
        } else {
            items.forEach(function(it) {
                var nombre = salDescLimpia(it.descripcion, it.inventario_id);
                csvRows.push([m.id||'', fecha, m.ticket_ot||'', m.placa||'', m.responsable||'',
                    it.inventario_id||'', nombre, it.cantidad||0,
                    parseFloat(it.costo_unitario||0).toFixed(2), m.estado||'']);
            });
        }
    });
    var csv = csvRows.map(function(r) { return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'Almacen_Salidas.csv'; a.click();
    URL.revokeObjectURL(url);
};

// ── KPI Row ───────────────────────────────────────────────────────
window._salRenderKPIs = function(data) {
    var el = document.getElementById('sal-kpi-row');
    if (!el) return;
    var pend = data.filter(function(d){ return d.estado === 'Pendiente'; }).length;
    var desp = data.filter(function(d){ return d.estado === 'Despachado'; }).length;
    var hoy = new Date();
    var mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0');
    var esteMes = data.filter(function(d){
        return (d.fecha || '').slice(0,7) === mesActual && d.estado === 'Despachado';
    }).length;
    var card = 'flex:0 0 auto;min-width:130px;display:flex;justify-content:space-between;align-items:center;' +
               'padding:.85rem 1rem;border-radius:18px;border:1.5px solid;gap:.6rem;';
    var lbl  = 'font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.2rem;';
    var num  = 'font-size:1.6rem;font-weight:900;line-height:1;';
    var ico  = 'width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;';
    el.innerHTML =
        '<div style="' + card + 'background:#fffbeb;border-color:#fde68a;">' +
          '<div><div style="' + lbl + 'color:#92400e;">Pendientes</div><div style="' + num + 'color:#d97706;">' + pend + '</div></div>' +
          '<div style="' + ico + 'background:#fef3c7;color:#d97706;"><i class="bi bi-hourglass-split" style="font-size:1.2rem;"></i></div>' +
        '</div>' +
        '<div style="' + card + 'background:#1e293b;border-color:#1e293b;">' +
          '<div><div style="' + lbl + 'color:#94a3b8;">Despachadas</div><div style="' + num + 'color:#fff;">' + desp + '</div></div>' +
          '<div style="' + ico + 'background:rgba(255,255,255,.12);color:#fff;"><i class="bi bi-check2-circle" style="font-size:1.2rem;"></i></div>' +
        '</div>' +
        '<div style="' + card + 'background:var(--surface,#fff);border-color:var(--border,#e2e8f0);">' +
          '<div><div style="' + lbl + 'color:var(--subtext,#64748b);">Este Mes</div><div style="' + num + 'color:var(--text,#0f172a);">' + esteMes + '</div></div>' +
          '<div style="' + ico + 'background:#eff6ff;color:#2563eb;"><i class="bi bi-calendar-check" style="font-size:1.2rem;"></i></div>' +
        '</div>';
    // Sync badges mobile
    var bP = document.getElementById('sal-m-badge-pend');
    var bD = document.getElementById('sal-m-badge-desp');
    if (bP) bP.textContent = pend > 0 ? '(' + pend + ')' : '';
    if (bD) bD.textContent = desp > 0 ? '(' + desp + ')' : '';
};
