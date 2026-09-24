// ================================================================
// Módulo Almacén / Salidas — Azkell Fleet
// Ruta SPA: almacen/salidas
// Entry point: window.init_salidas()
// Copia funcional de almacen-ot con prefijo 'sal'
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.salData = window.salData || [];
window.salDatosFil = window.salDatosFil || [];
window.salTabActiva = window.salTabActiva || 'pend';
window.salDetalleId = window.salDetalleId || null;
window._salItemIdx = window._salItemIdx || 0;
window._salPlacas = window._salPlacas || [];
window._salConductores = window._salConductores || [];
window._salInvData = window._salInvData || [];
window._salPag = window._salPag || 1;
window._SAL_POR_PAG = 25;

window._salIrPag = function (p) {
    window._salPag = p;
    window.salRenderTabla();
};

// ── Entry point ──────────────────────────────────────────────────
window.init_salidas = function () {
    if (!window.checkPerm('sal_inv', 'l')) {
        var wrap = document.getElementById('mod-salidas') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    if (!window.checkPerm('sal_inv', 'l')) {
        var wrap = document.getElementById('mod-salidas') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    window.salTabActiva = 'desp';
    salSincronizarTabs();
    salCargar();
    _salCargarSelectores();
    window._salMobileInit();
};

// ── Mobile Init ───────────────────────────────────────────────────
window._salMobileInit = function () {
    var isMob = window.innerWidth < 768;
    ['sal-m-header', 'sal-m-tabs', 'sal-search-compact', 'sal-fab-wrap'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = isMob ? 'flex' : 'none';
    });
    // Iniciales avatar
    var av = document.getElementById('sal-m-avatar');
    if (av) {
        var email = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
        var partes = email.split('@')[0].split(/[._-]/);
        var inits = partes.length >= 2 ? (partes[0][0] + partes[1][0]).toUpperCase() : email.substr(0, 2).toUpperCase();
        av.textContent = inits || 'SA';
    }
};

window._salToggleFiltrosMobile = function () {
    var el = document.getElementById('sal-filtros-mobile');
    if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
};

window._salSyncMTabs = function (tab) {
    ['pend', 'desp', 'anulado'].forEach(function (t) {
        var btn = document.getElementById('sal-m-tab-' + t);
        if (btn) btn.classList.toggle('active', t === tab);
    });
};

// ── Carga de datos ─────────────────────────────────────────────
window.salCargar = function () {
    var tbody = document.getElementById('sal-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="sal-td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';

    fetch('/api/almacen/salidas')
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) {
            window.salData = Array.isArray(data) ? data : [];
            window._salRenderKPIs(window.salData);
            salActualizarBadges();
            salRenderTabla();
        })
        .catch(function (err) {
            console.error('Error cargando almacén salidas:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al cargar datos de almacén', 'danger');
            var tb = document.getElementById('sal-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="7" class="sal-td-placeholder">Error al cargar datos</td></tr>';
        });
};

// ── Cargar selectores para el formulario ──────────────────────
function _salCargarSelectores() {
    fetch('/api/conductores-lista')
        .then(function (r) { return r.json(); })
        .then(function (d) {
            window._salConductores = d || [];
            var items = (d || []).map(function (c) {
                var nom = (c.nombre || '').trim();
                return nom ? { value: nom, label: nom } : null;
            }).filter(Boolean);
            window._cbInit('sal-f-responsable', items, 'Buscar responsable…');
        })
        .catch(function () { });

    fetch('/api/placas-lista')
        .then(function (r) { return r.json(); })
        .then(function (d) {
            window._salPlacas = d || [];
            var items = (d || []).map(function (p) {
                var placa = (p.placa || '').toUpperCase();
                return { value: placa, label: placa };
            }).filter(function (x) { return x.value; }).sort(function (a, b) { return a.label.localeCompare(b.label); });
            window._cbInit('sal-f-placa', items, 'Buscar placa…');
        })
        .catch(function () { });

    fetch('/api/almacen/inventario')
        .then(function (r) { return r.json(); })
        .then(function (d) {
            window._salInvData = d || [];
            var dl = document.getElementById('sal-inv-list');
            if (dl) dl.innerHTML = (d || []).map(function (a) {
                return '<option value="' + salEsc(a.id + ' — ' + a.descripcion) + '">';
            }).join('');
        })
        .catch(function () { });

    fetch('/api/ordenes-trabajo')
        .then(function (r) { return r.json(); })
        .then(function (d) {
            window._salOTs = d || [];
            var items = (d || []).map(function (o) {
                var idOt = (o.id_ot || '').toUpperCase();
                var placa = (o.placa || '').toUpperCase();
                if (!idOt) return null;
                return { value: idOt, label: placa ? idOt + ' — ' + placa : idOt };
            }).filter(Boolean);
            window._cbInit('sal-f-ot', items, 'Buscar N° OT o placa…');
            window._cbOnSelect('sal-f-ot', function (val) {
                var ot = (window._salOTs || []).find(function (o) {
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
        .catch(function () { });

    var fechaEl = document.getElementById('sal-f-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().split('T')[0];
}

// ── Helpers ──────────────────────────────────────────────────
function salEsc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function salFmtMoney(val) {
    return 'S/.' + parseFloat(val || 0).toFixed(2);
}

function salFmtDate(iso, createdAt) {
    var raw = createdAt || iso;
    if (!raw) return '—';
    try {
        var s = String(raw);
        var d;
        if (s.includes('T') || s.includes(' ')) {
            d = new Date(s.replace(' ', 'T'));
        } else {
            d = new Date(s + 'T00:00:00');
        }
        if (isNaN(d.getTime())) return String(raw);
        var dateStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
        var timeStr = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
        if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
            return dateStr;
        }
        return dateStr + ' ' + timeStr;
    } catch (e) { return String(raw); }
}

function salBadge(estado) {
    if (estado === 'Despachado') return '<span class="sal-badge badge-despachado">Despachado</span>';
    if (estado === 'Anulado') return '<span class="sal-badge badge-anulado">Anulado</span>';
    return '<span class="sal-badge badge-pendiente">Pendiente</span>';
}

function _salFmtSolicitante(val) {
    if (!val || val === '—') return '—';
    var str = String(val).trim();
    if (str.includes('@')) {
        var userPart = str.split('@')[0].replace(/[._-]/g, ' ');
        return userPart.charAt(0).toUpperCase() + userPart.slice(1);
    }
    return str;
}

function salDescLimpia(desc, invId) {
    if (!desc) return '—';
    if (invId && desc.indexOf(invId + ' — ') === 0) return desc.slice(invId.length + 3);
    var match = desc.match(/^[A-Z0-9]+-\d+\s*—\s*(.*)/i);
    if (match) return match[1];
    return desc;
}

window._salRenderKPIs = function (data) {
    var total = (data || []).length;
    var pendientes = 0;
    var despachadas = 0;
    var otsSet = {};

    (data || []).forEach(function (m) {
        if (m.estado === 'Despachado') {
            despachadas++;
        } else if (m.estado !== 'Anulado') {
            pendientes++;
        }
        var ot = m.ticket_ot || m.id_ot;
        if (ot) otsSet[String(ot).trim()] = true;
    });

    var setKpi = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setKpi('kpi-sal-total', total);
    setKpi('kpi-sal-pendientes', pendientes);
    setKpi('kpi-sal-despachadas', despachadas);
    setKpi('kpi-sal-ots', Object.keys(otsSet).length);
};

// ── Badges de tabs ────────────────────────────────────────────
function salActualizarBadges() {
    var pend = window.salData.filter(function (m) { return m.estado !== 'Despachado' && m.estado !== 'Anulado'; }).length;
    var desp = window.salData.filter(function (m) { return m.estado === 'Despachado'; }).length;
    var anulado = window.salData.filter(function (m) { return m.estado === 'Anulado'; }).length;
    var bp = document.getElementById('sal-badge-pend');
    var bd = document.getElementById('sal-badge-desp');
    var ba = document.getElementById('sal-badge-anulado');
    if (bp) bp.textContent = pend;
    if (bd) bd.textContent = desp;
    if (ba) ba.textContent = anulado;
    window._salRenderKPIs(window.salData);
}

// ── Tabs ──────────────────────────────────────────────────────
window.salCambiarTab = function (tab) {
    window.salTabActiva = tab;
    salSincronizarTabs();
    var cardTotal = document.getElementById('sal-kpi-total-card');
    var cardPend = document.getElementById('sal-kpi-pendientes-card');
    var cardDesp = document.getElementById('sal-kpi-despachadas-card');
    if (cardTotal) cardTotal.classList.toggle('active', tab === 'desp');
    if (cardPend) cardPend.classList.toggle('active', tab === 'pend');
    if (cardDesp) cardDesp.classList.toggle('active', tab === 'desp');
    window.salDetalleId = null;
    var panel = document.getElementById('sal-panel-detalle');
    if (panel) panel.classList.remove('open');
    salRenderTabla();
};

function salSincronizarTabs() {
    ['pend', 'desp', 'anulado'].forEach(function (t) {
        var el = document.getElementById('sal-tab-' + t);
        if (el) el.classList.toggle('active', t === window.salTabActiva);
    });
}

// ── Filtrar ───────────────────────────────────────────────────
function _salTipoOrdenBadge(t) {
    var val = (t || 'Orden de Salida').trim();
    if (val === 'Ajuste de Inventario (Resta)' || val.toLowerCase().includes('ajuste')) {
        return '<span class="badge bg-warning text-dark" style="font-size:0.62rem;letter-spacing:0.04em;font-weight:800;border-radius:99px;padding:5px 12px;text-transform:uppercase;">AJUSTE (RESTA)</span>';
    }
    return '<span class="badge bg-primary" style="font-size:0.62rem;letter-spacing:0.04em;font-weight:800;border-radius:99px;padding:5px 12px;text-transform:uppercase;">ORDEN DE SALIDA</span>';
}

window.salFiltrar = function () { salRenderTabla(); };

function salGetFiltros() {
    return {
        search: ((document.getElementById('sal-search') || {}).value || '').toLowerCase().trim(),
        ot: ((document.getElementById('sal-fil-ot') || {}).value || '').trim().toLowerCase(),
        placa: ((document.getElementById('sal-fil-placa') || {}).value || '').trim().toUpperCase(),
        mes: ((document.getElementById('sal-fil-mes') || {}).value || '').trim(),
        desde: ((document.getElementById('sal-fil-desde') || {}).value || '').trim(),
        hasta: ((document.getElementById('sal-fil-hasta') || {}).value || '').trim(),
        estado: ((document.getElementById('sal-fil-estado') || {}).value || '').trim()
    };
}

// ── Render tabla ──────────────────────────────────────────────
window.salRenderTabla = function () {
    var tbody = document.getElementById('sal-tbody');
    if (!tbody) return;

    var f = salGetFiltros();

    var datos = window.salData.filter(function (m) {
        if (!f.estado) {
            if (window.salTabActiva === 'pend' && (m.estado === 'Despachado' || m.estado === 'Anulado')) return false;
            if (window.salTabActiva === 'desp' && m.estado !== 'Despachado') return false;
            if (window.salTabActiva === 'anulado' && m.estado !== 'Anulado') return false;
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
            var artDesc = (m.items || []).map(function (it) { return it.descripcion || ''; }).join(' ');
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
        tbody.innerHTML = '<tr><td colspan="13" class="sal-td-placeholder" style="text-align:center"><i class="bi bi-box" style="font-size:1.5rem; opacity:0.3"></i><br>' + msg + '</td></tr>';
        var cardContainer = document.getElementById('salCardContainer');
        if (cardContainer) cardContainer.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>' + msg + '</div>';
        if (paginEl) paginEl.innerHTML = '';
        return;
    }

    tbody.innerHTML = '';
    var cardContainer = document.getElementById('salCardContainer');
    var htmlCards = '';

    datosPag.forEach(function (m) {
        var items = m.items || [];
        var fechaCorta = m.fecha ? new Date(String(m.fecha).replace(' ', 'T')).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
        var countItems = items.length;
        var totalCant = items.reduce(function (acc, it) { return acc + (parseFloat(it.cantidad) || 0); }, 0);

        var badgeEstadoMobile = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">Pendiente</span>';
        if (m.estado === 'Despachado') {
            badgeEstadoMobile = '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">Despachado</span>';
        } else if (m.estado === 'Anulado') {
            badgeEstadoMobile = '<span class="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">Anulado</span>';
        }

        htmlCards += `
        <div class="sal-mobile-card">
            <!-- Header Card: ID Solicitud + Fecha + Estado -->
            <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="d-flex align-items-center gap-2">
                    <span class="fw-bolder text-primary font-monospace" style="font-size:0.95rem;">${salEsc(m.id || '—')}</span>
                    <span class="text-muted small" style="font-size:0.75rem;">• ${fechaCorta}</span>
                </div>
                <div>${badgeEstadoMobile}</div>
            </div>

            <!-- Placa y OT -->
            <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
                ${m.placa ? `<span class="badge bg-light text-dark border fw-bold px-2 py-1" style="font-size:0.8rem; border-radius:6px;">🚛 ${salEsc(m.placa)}</span>` : ''}
                ${m.ticket_ot ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-bold px-2 py-1" style="font-size:0.75rem; border-radius:6px;"><i class="bi bi-card-checklist me-1"></i>${salEsc(m.ticket_ot)}</span>` : ''}
                <span class="badge bg-secondary-subtle text-secondary border fw-semibold px-2 py-1" style="font-size:0.72rem; border-radius:6px;">${salEsc(m.tipo_orden || 'Salida')}</span>
            </div>

            <!-- Solicitante y Responsable -->
            <div class="mb-2">
                <div class="fw-bold text-dark" style="font-size:0.88rem;">${salEsc(m.responsable || 'Sin Responsable')}</div>
                <div class="text-muted small" style="font-size:0.75rem;"><i class="bi bi-person-fill text-primary me-1"></i>Solicitante: <strong>${salEsc(_salFmtSolicitante(m.creado_por))}</strong></div>
                ${m.observaciones ? `<div class="text-muted small mt-1 text-truncate" style="font-size:0.75rem;"><i class="bi bi-chat-left-text me-1"></i>${salEsc(m.observaciones)}</div>` : ''}
            </div>

            <!-- Resumen de Artículos & Importe -->
            <div class="d-flex align-items-center justify-content-between pt-2 border-top mb-3">
                <span class="badge bg-light text-dark border fw-semibold" style="font-size:0.75rem; border-radius:6px;">
                    <i class="bi bi-box-seam me-1 text-primary"></i>${countItems} ${countItems === 1 ? 'Artículo' : 'Artículos'} (${totalCant.toLocaleString('es-PE', { maximumFractionDigits: 2 })} u.)
                </span>
                <span class="fw-bold text-success font-monospace" style="font-size:0.9rem;">${salFmtMoney(m.total_pen)}</span>
            </div>

            <!-- Botones de Acción Móvil -->
            <div class="d-flex align-items-center justify-content-between gap-1 pt-2 border-top">
                <button type="button" class="btn btn-sm btn-outline-primary fw-bold flex-grow-1 d-flex align-items-center justify-content-center gap-1 py-1" onclick="salAbrirDetalle(window.salData.find(function(x){return x.id==='${salEsc(m.id)}';}))" style="border-radius:8px; font-size:0.78rem;">
                    <i class="bi bi-eye"></i> Detalle
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger fw-semibold px-3 py-1 d-flex align-items-center gap-1" onclick="window.salVerPDF(window.salData.find(function(x){return x.id==='${salEsc(m.id)}';}))" title="PDF" style="border-radius:8px; font-size:0.78rem;">
                    <i class="bi bi-file-earmark-pdf"></i> PDF
                </button>
                <div class="dropdown">
                    <button class="btn btn-sm btn-light border shadow-2xs rounded-3 px-2 py-1" type="button" data-bs-toggle="dropdown" data-bs-boundary="viewport" aria-expanded="false" style="border-radius:8px;">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3 p-1" style="font-size: 0.82rem; min-width: 170px; z-index: 1050;">
                        <li>
                            <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="salAbrirDetalle(window.salData.find(function(x){return x.id==='${salEsc(m.id)}';}))">
                                <i class="bi bi-eye text-primary fs-6"></i> Ver Detalle
                            </a>
                        </li>
                        <li>
                            <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.salGenerarPDF(window.salData.find(function(x){return x.id==='${salEsc(m.id)}';}))">
                                <i class="bi bi-download text-success fs-6"></i> Descargar PDF
                            </a>
                        </li>
                        ${m.estado === 'Pendiente' ? `
                        <li><hr class="dropdown-divider my-1"></li>
                        <li>
                            <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-semibold text-danger" href="javascript:void(0)" onclick="salAnular('${salEsc(m.id)}')">
                                <i class="bi bi-slash-circle text-danger fs-6"></i> Anular Salida
                            </a>
                        </li>
                        ` : ''}
                    </ul>
                </div>
            </div>
        </div>
        `;

        var filteredItems = items;
        if (f.search) {
            var salidaText = [m.id, m.ticket_ot, m.placa, m.responsable].join(' ').toLowerCase();
            if (salidaText.indexOf(f.search) === -1) {
                filteredItems = items.filter(function (it) {
                    return [(it.inventario_id || ''), (it.descripcion || '')].join(' ').toLowerCase().indexOf(f.search) !== -1;
                });
            }
        }

        if (!filteredItems.length) {
            var tr = document.createElement('tr');
            if (m.id === window.salDetalleId) tr.classList.add('sal-row-active');
            tr.innerHTML =
                '<td class="ps-3 fw-bold text-primary font-monospace" style="font-size:0.85rem;">' + salEsc(m.id || '—') + '</td>'
                + '<td style="white-space:nowrap;font-weight:600;font-size:0.82rem;">' + salFmtDate(m.fecha, m.created_at) + '</td>'
                + '<td style="vertical-align:middle;">' + _salTipoOrdenBadge(m.tipo_orden) + '</td>'
                + '<td><strong>' + salEsc(m.ticket_ot || '—') + '</strong></td>'
                + '<td>' + salEsc(m.placa || '—') + '</td>'
                + '<td>' + salEsc(m.responsable || '—') + '</td>'
                + '<td><span style="font-size:0.78rem;font-weight:600;color:var(--text);">' + salEsc(_salFmtSolicitante(m.creado_por)) + '</span></td>'
                + '<td colspan="3" style="color:var(--subtext);font-size:0.78rem;">Sin artículos</td>'
                + '<td></td>'
                + '<td></td>'
                + '<td class="pe-3">' + salBadge(m.estado) + '</td>';
            tr.onclick = (function (row) { return function () { salAbrirDetalle(row); }; })(m);
            tbody.appendChild(tr);
            return;
        }

        filteredItems.forEach(function (it, idx) {
            var tr = document.createElement('tr');
            var isFirst = idx === 0;
            var isLast = idx === filteredItems.length - 1;
            if (m.id === window.salDetalleId) tr.classList.add('sal-row-active');
            if (!isFirst) tr.classList.add('sal-item-sub');
            if (isLast && filteredItems.length > 1) tr.classList.add('sal-item-last');
            var nombre = salDescLimpia(it.descripcion, it.inventario_id);
            var cant = parseFloat(it.cantidad || 0);
            var cu = parseFloat(it.costo_unitario || 0);
            tr.innerHTML =
                '<td class="ps-3 fw-bold text-primary font-monospace" style="font-size:0.85rem;">' + salEsc(m.id || '—') + '</td>'
                + '<td style="white-space:nowrap;font-weight:600;font-size:0.82rem;">' + salFmtDate(m.fecha, m.created_at) + '</td>'
                + '<td style="vertical-align:middle;">' + _salTipoOrdenBadge(m.tipo_orden) + '</td>'
                + '<td><strong>' + salEsc(m.ticket_ot || '—') + '</strong></td>'
                + '<td>' + salEsc(m.placa || '—') + '</td>'
                + '<td>' + salEsc(m.responsable || '—') + '</td>'
                + '<td><span style="font-size:0.78rem;font-weight:600;color:var(--text);">' + salEsc(_salFmtSolicitante(m.creado_por)) + '</span></td>'
                + '<td style="font-size:0.75rem;color:var(--subtext);font-family:monospace;white-space:nowrap;">' + salEsc(it.inventario_id || '—') + '</td>'
                + '<td class="col-articulo" style="font-size:0.82rem;">' + salEsc(nombre) + '</td>'
                + '<td class="text-end" style="font-size:0.82rem;">' + cant.toLocaleString('es-PE', { maximumFractionDigits: 3 }) + '</td>'
                + '<td class="text-end" style="font-size:0.82rem;">' + salFmtMoney(cu) + '</td>'
                + '<td class="text-end">' + (isFirst ? '<strong style="color:#16a34a;">' + salFmtMoney(m.total_pen) + '</strong>' : '') + '</td>'
                + '<td class="pe-3">' + (isFirst ? salBadge(m.estado) : '') + '</td>';
            tr.onclick = (function (row) { return function () { salAbrirDetalle(row); }; })(m);
            tbody.appendChild(tr);
        });
    });

    if (cardContainer) cardContainer.innerHTML = htmlCards;

    if (paginEl) {
        if (totalPag <= 1) { paginEl.innerHTML = ''; return; }
        var btns = '';
        btns += '<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:' + (pag <= 1 ? '0.35' : '1') + ';" ' + (pag <= 1 ? 'disabled' : '') + ' onclick="window._salIrPag(' + (pag - 1) + ')"><i class="bi bi-chevron-left"></i></button>';
        btns += '<span style="font-size:.8rem;font-weight:700;color:var(--subtext);">Pág. <b style="color:var(--text)">' + pag + '</b> / ' + totalPag + '</span>';
        btns += '<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:' + (pag >= totalPag ? '0.35' : '1') + ';" ' + (pag >= totalPag ? 'disabled' : '') + ' onclick="window._salIrPag(' + (pag + 1) + ')"><i class="bi bi-chevron-right"></i></button>';
        paginEl.innerHTML = '<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem .75rem;">' + btns + '</div>';
    }
};

// ── Detalle modal centrado / bottom sheet ──────────────────────
function salAbrirDetalle(m) {
    if (!m) return;
    window.salDetalleId = m.id;
    salRenderTabla();

    var bd = document.getElementById('sal-det-backdrop');
    if (bd) {
        bd.classList.add('open');
        bd.style.display = 'block';
    }

    var titulo = document.getElementById('sal-detalle-titulo');
    if (titulo) titulo.textContent = 'Salida ' + (m.id || '');

    var items = m.items || [];
    var totalCant = items.reduce(function (acc, it) { return acc + (parseFloat(it.cantidad) || 0); }, 0);
    var esPendiente = (m.estado === 'Pendiente');

    var html = `
    <!-- Card 1: Bento Card Cabecera & Info General -->
    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
        <div class="d-flex align-items-center justify-content-between mb-2.5 pb-2 border-bottom">
            <div>
                <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.65rem; letter-spacing: 0.5px;">Folio de Salida</span>
                <span class="fw-bolder text-primary" style="font-size: 1.15rem; letter-spacing: -0.02em;">${salEsc(m.id || '—')}</span>
            </div>
            <div>
                ${salBadge(m.estado)}
            </div>
        </div>

        <div class="row g-2">
            <div class="col-6 col-md-4">
                <div class="p-2 rounded-3" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">N° OT</span>
                    <div class="d-flex align-items-center gap-1 mt-0.5">
                        <i class="bi bi-tools text-primary" style="font-size: 0.75rem;"></i>
                        <span class="fw-bold text-dark" style="font-size: 0.82rem;">${salEsc(m.ticket_ot || '—')}</span>
                    </div>
                </div>
            </div>

            <div class="col-6 col-md-4">
                <div class="p-2 rounded-3" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">Placa / Destino</span>
                    <div class="d-flex align-items-center gap-1 mt-0.5">
                        <i class="bi bi-truck text-secondary" style="font-size: 0.75rem;"></i>
                        <span class="fw-bold text-dark text-truncate" style="font-size: 0.82rem;">${salEsc(m.placa || '—')}</span>
                    </div>
                </div>
            </div>

            <div class="col-12 col-md-4">
                <div class="p-2 rounded-3" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">Fecha de Registro</span>
                    <div class="d-flex align-items-center gap-1 mt-0.5">
                        <i class="bi bi-calendar3 text-muted" style="font-size: 0.75rem;"></i>
                        <span class="fw-semibold text-dark" style="font-size: 0.8rem;">${salFmtDate(m.fecha, m.created_at)}</span>
                    </div>
                </div>
            </div>

            <div class="col-6">
                <div class="p-2 rounded-3" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">Responsable</span>
                    <div class="d-flex align-items-center gap-1 mt-0.5">
                        <i class="bi bi-person-fill text-muted" style="font-size: 0.75rem;"></i>
                        <span class="fw-bold text-dark text-truncate" style="font-size: 0.82rem;">${salEsc(m.responsable || '—')}</span>
                    </div>
                </div>
            </div>

            <div class="col-6">
                <div class="p-2 rounded-3" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">Solicitante</span>
                    <div class="d-flex align-items-center gap-1 mt-0.5">
                        <i class="bi bi-person-badge text-muted" style="font-size: 0.75rem;"></i>
                        <span class="fw-bold text-dark text-truncate" style="font-size: 0.82rem;">${salEsc(_salFmtSolicitante(m.creado_por))}</span>
                    </div>
                </div>
            </div>
        </div>
        
        ${m.observaciones ? `
        <div class="mt-2.5 p-2 rounded-3" style="background: #f1f5f9;">
            <span class="text-muted text-uppercase fw-bold d-block mb-1" style="font-size: 0.62rem;"><i class="bi bi-chat-left-text me-1"></i>Observaciones / Motivo</span>
            <div class="text-dark fw-medium" style="font-size: 0.8rem;">${salEsc(m.observaciones)}</div>
        </div>
        ` : ''}

        ${(m.estado === 'Anulado' && m.motivo_anulacion) ? `
        <div class="mt-2.5 p-2 rounded-3" style="background: #fef2f2; border: 1px solid #fecaca;">
            <span class="text-danger text-uppercase fw-bold d-block mb-1" style="font-size: 0.62rem;"><i class="bi bi-exclamation-octagon me-1"></i>Motivo de Anulación</span>
            <div class="text-danger fw-semibold" style="font-size: 0.8rem;">${salEsc(m.motivo_anulacion)}</div>
        </div>
        ` : ''}
    </div>

    <!-- Card 2: Lista de Artículos / Repuestos Despachados -->
    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important; overflow: hidden;">
        <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
            <div class="d-flex align-items-center gap-2 fw-bold text-dark" style="font-size: 0.82rem; text-transform: uppercase;">
                <i class="bi bi-box-seam-fill text-primary" style="font-size: 0.95rem;"></i>
                <span>Artículos (${items.length})</span>
            </div>
            <div class="d-flex align-items-center gap-2.5">
                ${esPendiente && items.length > 1 ? `
                <div class="d-flex align-items-center gap-1.5 bg-light px-2.5 py-1 rounded-2 border" style="cursor: pointer;" onclick="document.getElementById('sal-chk-select-all').click()">
                    <input type="checkbox" id="sal-chk-select-all" checked onchange="window._salToggleSelectAll(this.checked)" onclick="event.stopPropagation()" style="width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: #0284c7;">
                    <label for="sal-chk-select-all" class="small fw-bold text-secondary m-0" style="font-size: 0.72rem; user-select: none; cursor: pointer;">Todos</label>
                </div>
                ` : ''}
                <span class="badge bg-light text-secondary border rounded-pill px-2.5 py-1" style="font-size: 0.7rem; font-weight: 700;">
                    ${totalCant.toLocaleString('es-PE', { maximumFractionDigits: 3 })} Unidades
                </span>
            </div>
        </div>

        <div class="d-flex flex-column gap-2" id="sal-items-detail-list">
    `;

    if (items.length) {
        items.forEach(function (it, idx) {
            var cant = parseFloat(it.cantidad || 0);
            var cu = parseFloat(it.costo_unitario || 0);
            var imp = parseFloat(it.importe) || (cant * cu);

            // Buscar stock disponible en el inventario cargado
            var invItem = null;
            if (window._salInvData && Array.isArray(window._salInvData)) {
                invItem = window._salInvData.find(function(x) {
                    if (it.inventario_id && x.id === it.inventario_id) return true;
                    if (it.descripcion && x.descripcion === it.descripcion) return true;
                    if (it.descripcion && x.id && it.descripcion.startsWith(x.id)) return true;
                    return false;
                });
            }

            var stockDisp = (invItem && invItem.stock_actual != null) ? parseFloat(invItem.stock_actual) : null;
            var tieneStock = (stockDisp == null || stockDisp >= cant);

            html += `
            <div class="p-2.5 rounded-3 d-flex align-items-center justify-content-between gap-2.5" style="background: ${tieneStock ? '#ffffff' : '#fff5f5'}; border: 1.5px solid ${tieneStock ? '#e2e8f0' : '#fca5a5'}; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div class="d-flex align-items-center gap-2.5" style="min-width: 0; flex: 1;">
                    ${esPendiente ? `
                    <div class="d-flex align-items-center justify-content-center flex-shrink-0" style="width: 26px;">
                        <input type="checkbox" class="sal-item-chk" 
                               value="${it.id || idx}" 
                               data-item-id="${it.id || ''}"
                               data-cant="${cant}"
                               data-stock="${stockDisp != null ? stockDisp : 999}"
                               data-desc="${salEsc(it.descripcion || it.inventario_id || '')}"
                               ${tieneStock ? 'checked' : ''}
                               onchange="window._salActualizarContadorDespacho()"
                               style="width: 19px; height: 19px; margin: 0; cursor: pointer; border-radius: 4px; accent-color: #0284c7;">
                    </div>
                    ` : ''}

                    <div class="d-flex align-items-center justify-content-center rounded-3 flex-shrink-0" style="width: 36px; height: 36px; background: ${tieneStock ? '#e0f2fe' : '#fee2e2'}; color: ${tieneStock ? '#0284c7' : '#ef4444'};">
                        <i class="bi ${tieneStock ? 'bi-box-seam' : 'bi-exclamation-triangle-fill'}" style="font-size: 0.95rem;"></i>
                    </div>

                    <div style="min-width: 0; flex: 1;">
                        <div class="fw-bold text-dark text-truncate" style="font-size: 0.84rem;" title="${salEsc(it.descripcion || it.inventario_id || '—')}">
                            ${salEsc(it.descripcion || it.inventario_id || '—')}
                        </div>
                        <div class="text-secondary small d-flex align-items-center gap-1.5 flex-wrap" style="font-size: 0.72rem; margin-top: 2px;">
                            ${it.inventario_id ? `<span class="badge bg-light text-dark border rounded-1 px-1.5 py-0.5" style="font-size:0.65rem; font-weight:700;">${salEsc(it.inventario_id)}</span>` : ''}
                            <span class="fw-bold text-dark">${cant.toLocaleString('es-PE', { maximumFractionDigits: 3 })} u.</span>
                            <span class="text-muted">·</span>
                            <span>S/. ${cu.toFixed(2)} c/u</span>
                            ${stockDisp != null ? `
                            <span class="badge ${tieneStock ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'} rounded-pill px-2 py-0.5" style="font-size: 0.65rem; font-weight: 700;">
                                Stock: ${stockDisp} u. ${tieneStock ? '(Disponible)' : '(Insuficiente)'}
                            </span>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <div class="text-end flex-shrink-0 ps-1">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.60rem;">Subtotal</span>
                    <span class="fw-bolder text-dark" style="font-size: 0.88rem;">S/. ${imp.toFixed(2)}</span>
                </div>
            </div>
            `;
        });
    } else {
        html += '<div class="text-center py-3 text-muted small">No hay ítems registrados en esta salida.</div>';
    }

    html += `
        </div>

        <!-- Total General -->
        <div class="d-flex align-items-center justify-content-between mt-3 pt-2.5 border-top bg-white p-2.5 rounded-3 border">
            <span class="fw-bold text-dark" style="font-size: 0.9rem;">Monto Total Solicitud:</span>
            <span class="fw-bolder text-success" style="font-size: 1.25rem;">${salFmtMoney(m.total_pen)}</span>
        </div>
    </div>
    `;

    var scroll = document.getElementById('sal-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    var footer = document.getElementById('sal-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        var eId = salEsc(m.id);
        var puedeEditar = window.checkPerm('sal_inv', 'e');
        var puedeEliminar = window.checkPerm('sal_inv', 'd');

        var btnDespachar = (puedeEditar && m.estado !== 'Despachado' && m.estado !== 'Anulado')
            ? `
            <button type="button" id="btn-sal-despachar-action" class="btn w-100 fw-bold d-flex align-items-center justify-content-center gap-2"
                    style="border-radius: 9999px; height: 50px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; font-size: 0.95rem; border: none; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);"
                    onclick="window.salDespachar('${eId}')">
                <i class="bi bi-box-seam-fill fs-6"></i> <span id="lbl-sal-despachar-txt">Despachar Salida</span>
            </button>
            ` : '';

        var btnPdfPrincipal = `
            <button type="button" class="btn w-100 fw-bold d-flex align-items-center justify-content-center gap-2"
                    style="border-radius: 9999px; height: 50px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #fff; font-size: 0.95rem; border: none; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);"
                    onclick="window.salGenerarPDF(window.salData.find(function(x){return x.id==='${eId}';}))">
                <i class="bi bi-file-earmark-pdf-fill fs-6"></i> Descargar Documento PDF
            </button>
        `;

        var btnVer = `
            <button type="button" class="btn flex-fill fw-bold d-flex align-items-center justify-content-center gap-1.5"
                    style="border-radius: 9999px; height: 46px; background: #ffffff; color: #1e293b; border: 1.5px solid #e2e8f0; font-size: 0.88rem; box-shadow: 0 2px 6px rgba(0,0,0,0.03);"
                    onclick="window.salVerPDF(window.salData.find(function(x){return x.id==='${eId}';}))">
                <i class="bi bi-eye-fill text-primary"></i> Vista Previa
            </button>
        `;

        var btnEditar = puedeEditar
            ? `
            <button type="button" class="btn flex-fill fw-bold d-flex align-items-center justify-content-center gap-1.5"
                    style="border-radius: 9999px; height: 46px; background: #fefce8; color: #a16207; border: 1.5px solid #fef08a; font-size: 0.88rem;"
                    onclick="window.salEditarSalida('${eId}')">
                <i class="bi bi-pencil-square"></i> Editar
            </button>
            ` : '';

        var btnAnular = puedeEliminar
            ? (m.estado !== 'Anulado'
                ? `
                <button type="button" class="btn flex-fill fw-bold d-flex align-items-center justify-content-center gap-1.5"
                        style="border-radius: 9999px; height: 46px; background: #fef2f2; color: #dc2626; border: 1.5px solid #fecaca; font-size: 0.88rem;"
                        onclick="window.salAnular('${eId}')">
                    <i class="bi bi-slash-circle"></i> Anular
                </button>
                `
                : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill py-2 px-3 fw-bold flex-fill text-center" style="font-size:0.8rem;">Salida Anulada</span>')
            : '';

        footer.innerHTML = `
            <div class="d-flex flex-column gap-2 w-100">
                ${btnDespachar ? btnDespachar : btnPdfPrincipal}
                <div class="d-flex align-items-center gap-2 w-100">
                    ${btnVer}
                    ${btnEditar}
                    ${btnAnular}
                </div>
            </div>
        `;

        if (typeof window._salActualizarContadorDespacho === 'function') {
            window._salActualizarContadorDespacho();
        }
    }

    var panel = document.getElementById('sal-panel-detalle');
    if (panel) {
        panel.classList.add('open');
        panel.style.visibility = 'visible';
    }
}

window.salCerrarDetalle = function () {
    var panel = document.getElementById('sal-panel-detalle');
    if (panel) {
        panel.classList.remove('open');
        panel.style.visibility = 'hidden';
    }
    var bd = document.getElementById('sal-det-backdrop');
    if (bd) {
        bd.classList.remove('open');
        bd.style.display = 'none';
    }
    window.salDetalleId = null;
    salRenderTabla();
};

window._salToggleSelectAll = function(checked) {
    var chks = document.querySelectorAll('.sal-item-chk');
    chks.forEach(function(c) { c.checked = checked; });
    if (typeof window._salActualizarContadorDespacho === 'function') {
        window._salActualizarContadorDespacho();
    }
};

window._salActualizarContadorDespacho = function() {
    var chks = document.querySelectorAll('.sal-item-chk');
    var total = chks.length;
    var checkedCount = 0;
    chks.forEach(function(c) { if (c.checked) checkedCount++; });

    var lbl = document.getElementById('lbl-sal-despachar-txt');
    if (lbl) {
        if (total > 1 && checkedCount < total && checkedCount > 0) {
            lbl.textContent = 'Despachar Selección (' + checkedCount + ' de ' + total + ')';
        } else {
            lbl.textContent = 'Despachar Salida';
        }
    }
};

// ── Despachar salida (Abre Modal de Confirmación Idéntico al Reporte de Fallas) ─
window.salDespachar = function (id) {
    if (!window.guardAction('sal_inv', 'e')) return;
    var m = (window.salData || []).find(function(x) { return x.id === id; });
    if (!m) return;

    var chks = document.querySelectorAll('.sal-item-chk');
    var selectedIds = [];
    var sinStockList = [];

    if (chks.length > 0) {
        var checkedAny = false;
        chks.forEach(function(c) {
            if (c.checked) {
                checkedAny = true;
                var itId = c.getAttribute('data-item-id');
                if (itId) selectedIds.push(parseInt(itId, 10));
                var cant = parseFloat(c.getAttribute('data-cant') || 0);
                var stock = parseFloat(c.getAttribute('data-stock') || 0);
                if (stock < cant) {
                    sinStockList.push(c.getAttribute('data-desc') + ' (Req: ' + cant + ', Disp: ' + (stock <= 0 ? 0 : stock) + ')');
                }
            }
        });

        if (!checkedAny) {
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Debes seleccionar al menos un repuesto para despachar.', 'warning');
            }
            return;
        }

        if (sinStockList.length > 0) {
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('No se puede despachar porque los siguientes repuestos seleccionados no cuentan con stock disponible en almacén:\n• ' + sinStockList.join('\n• ') + '\n\nPor favor, desmárcalos para despachar solo los que tienen stock disponible.', 'danger');
            }
            return;
        }
    }

    window._salDespachoPendiente = {
        id: id,
        item_ids: selectedIds,
        selectedCount: selectedIds.length || (m.items || []).length,
        totalCount: (m.items || []).length
    };

    var txtResumen = document.getElementById('sal-despachar-modal-msg') || document.getElementById('sal-despachar-resumen-txt');
    if (txtResumen) {
        if (m.items && m.items.length > 1 && selectedIds.length > 0 && selectedIds.length < m.items.length) {
            txtResumen.innerHTML = '¿Despachar <strong>' + selectedIds.length + ' de ' + m.items.length + '</strong> repuestos seleccionados de la salida <strong class="text-dark">' + salEsc(id) + '</strong>?<br><span class="text-primary fw-bold">El resto de repuestos quedará como pendiente en una nueva salida.</span>';
        } else {
            txtResumen.innerHTML = '¿Despachar los repuestos de la salida <strong class="text-dark">' + salEsc(id) + '</strong>?<br>El stock del inventario de almacén será descontado inmediatamente.';
        }
    }

    // Cerrar el drawer de detalle
    window.salCerrarDetalle();

    // Abrir Modal de Confirmación
    var modalEl = document.getElementById('modalSalidaDespacharConfirm');
    if (modalEl) {
        var modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalInstance.show();
    }
};

window._ejecutarSalidaDespacharConfirmado = function() {
    if (!window._salDespachoPendiente || !window._salDespachoPendiente.id) return;
    var info = window._salDespachoPendiente;
    var id = info.id;
    var itemIds = info.item_ids;

    // Ocultar modal
    var modalEl = document.getElementById('modalSalidaDespacharConfirm');
    if (modalEl) {
        var modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
    }

    var usuario = (window.currentUser && (window.currentUser.nombre || window.currentUser.usuario)) || 'Almacén';

    fetch('/api/almacen/salidas/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'despachar', item_ids: itemIds, usuario: usuario })
    })
    .then(function(r) {
        return r.json().then(function(d) {
            if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
            return d;
        });
    })
    .then(function(res) {
        if (res.parcial && res.nuevo_pendiente_id) {
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Salida ' + id + ' despachada con éxito. Los ítems pendientes quedaron en la salida ' + res.nuevo_pendiente_id + '.', 'success');
            }
        } else {
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Salida ' + id + ' despachada con éxito — stock descontado.', 'success');
            }
        }
        window._salDespachoPendiente = null;
        salCargar();
    })
    .catch(function(err) {
        console.error('Error despachando salida:', err);
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta(err.message || 'Error al despachar la salida', 'danger');
        }
    });
};

// ── Anular salida (Abre Modal de Confirmación Idéntico al Reporte de Fallas) ──
window.salAnular = function (id) {
    if (!window.guardAction('sal_inv', 'd')) return;
    window._salAnularPendienteId = id;

    var lbl = document.getElementById('sal-anular-folio-lbl');
    if (lbl) lbl.textContent = id;

    var txt = document.getElementById('sal-motivo-anulacion-input') || document.getElementById('sal-anular-motivo-txt');
    if (txt) { txt.value = ''; }

    // Cerrar drawer de detalle
    window.salCerrarDetalle();

    // Abrir Modal de Confirmación
    var modalEl = document.getElementById('modalSalidaAnularConfirm');
    if (modalEl) {
        var modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalInstance.show();
        setTimeout(function() {
            if (txt) txt.focus();
        }, 300);
    }
};

window._ejecutarSalidaAnularConfirmado = function() {
    var id = window._salAnularPendienteId;
    if (!id) return;

    var txt = document.getElementById('sal-motivo-anulacion-input') || document.getElementById('sal-anular-motivo-txt');
    var motivo = (txt && txt.value) ? txt.value.trim() : '';
    if (!motivo) {
        motivo = 'Anulado por el usuario';
    }

    // Ocultar modal
    var modalEl = document.getElementById('modalSalidaAnularConfirm');
    if (modalEl) {
        var modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
    }

    var usuario = (window.currentUser && (window.currentUser.nombre || window.currentUser.usuario)) || 'Almacén';

    fetch('/api/almacen/salidas/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'anular', motivo: motivo, usuario: usuario })
    })
    .then(function(r) {
        return r.json().then(function(d) {
            if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
            return d;
        });
    })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Salida ' + id + ' anulada correctamente.', 'success');
        }
        window._salAnularPendienteId = null;
        salCargar();
    })
    .catch(function(err) {
        console.error('Error anulando salida:', err);
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta(err.message || 'Error al anular la salida', 'danger');
        }
    });
};

// ── Eliminar salida ───────────────────────────────────────────
window.salEliminar = function (id) {
    if (!confirm('¿Eliminar la salida ' + id + '? El stock volverá a su valor anterior.')) return;
    fetch('/api/almacen/salidas/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function () {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Salida eliminada — stock restaurado', 'success');
            window.salDetalleId = null;
            var panel = document.getElementById('sal-panel-detalle');
            if (panel) panel.classList.remove('open');
            salCargar();
        })
        .catch(function () {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar la salida', 'danger');
        });
};

// ── Construir HTML del comprobante ────────────────────────────
function salBuildPDFHtml(m) {
    var id = m.id || '—';
    var fecha = m.fecha ? String(m.fecha).split('T')[0] : '—';
    var totalPen = parseFloat(m.total_pen || 0);
    var itemsHTML = (m.items || []).map(function (it, i) {
        var cant = parseFloat(it.cantidad || 0);
        var cu = parseFloat(it.costo_unitario || 0);
        var imp = parseFloat(it.importe || 0) || cant * cu;
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
window.salGenerarPDF = function (m) {
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
    html2pdf().set(opt).from(wrapper.firstChild).save().then(function () {
        document.body.removeChild(wrapper);
    });
};

// ── Previsualizar comprobante en nueva pestaña ────────────────
window.salVerPDF = function (m) {
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
    html2pdf().set(opt).from(wrapper.firstChild).outputPdf('bloburl').then(function (url) {
        document.body.removeChild(wrapper);
        window.open(url, '_blank');
    });
};

window.salEditarSalida = function (id) {
    if (!window.guardAction('sal_inv', 'e')) return;
    var m = window.salData.find(function (x) { return x.id === id; });
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
        m.items.forEach(function (it) {
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
window.salAbrirNuevo = function () {
    if (!window.guardAction('sal_inv', 'c')) return;
    var ids = ['sal-f-obs'];
    ids.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
    window._cbReset('sal-f-ot');
    window._cbReset('sal-f-placa');
    window._cbReset('sal-f-responsable');
    var fechaEl = document.getElementById('sal-f-fecha');
    var tipoOrdEl = document.getElementById('sal-f-tipo-orden');
    if (tipoOrdEl) tipoOrdEl.value = 'Orden de Salida';
    var tipoEl = document.getElementById('sal-f-tipo');
    if (tipoEl) tipoEl.value = 'Vehiculo';
    salToggleTipoOrden();
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

window.salCerrarNuevo = function () {
    var drawer = document.getElementById('sal-drawer-nuevo');
    if (drawer) drawer.classList.remove('open');
    var bd = document.getElementById('salNuevoBackdrop');
    if (bd) bd.classList.remove('open');
    window.salCerrarSubDrawer('sal-drawer-kit');
};

// ── Auto-completar Placa al ingresar N° OT ────────────────────
window._salBuscarPlacaPorOT = function () {
    var otEl = document.getElementById('sal-f-ot');
    var otVal = otEl ? otEl.value.trim() : '';
    if (!otVal) return;
    fetch('/api/ordenes/by-ticket?id=' + encodeURIComponent(otVal))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (ot) {
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
        .catch(function () { });
};

// ── Lógica de Kits de Mantenimiento para Órdenes de Salida ─────────
window._salKitsDisponibles = window._salKitsDisponibles || [];
window._salKitSeleccionado = window._salKitSeleccionado || null;

window._obtenerVehiculoPorPlaca = window._obtenerVehiculoPorPlaca || async function (placa) {
    if (!placa) return null;
    placa = String(placa).trim().toUpperCase();

    // 1. Buscar en dataGlobalPlacas si existe
    if (Array.isArray(window.dataGlobalPlacas) && window.dataGlobalPlacas.length > 0) {
        var found = window.dataGlobalPlacas.find(function (p) {
            if (Array.isArray(p)) return (p[0] || '').trim().toUpperCase() === placa;
            return (p.placa || '').trim().toUpperCase() === placa;
        });
        if (found) {
            if (Array.isArray(found)) {
                return {
                    placa: placa,
                    marca: (found[3] || '').trim().toUpperCase(),
                    modelo: (found[4] || '').trim().toUpperCase()
                };
            } else {
                return {
                    placa: placa,
                    marca: (found.marca || '').trim().toUpperCase(),
                    modelo: (found.modelo || found.modelo_uts || '').trim().toUpperCase()
                };
            }
        }
    }

    // 2. Buscar en _salPlacas
    if (Array.isArray(window._salPlacas) && window._salPlacas.length > 0) {
        var foundSal = window._salPlacas.find(function (p) {
            return (p.placa || '').trim().toUpperCase() === placa;
        });
        if (foundSal && (foundSal.marca || foundSal.modelo)) {
            return {
                placa: placa,
                marca: (foundSal.marca || '').trim().toUpperCase(),
                modelo: (foundSal.modelo || foundSal.modelo_uts || '').trim().toUpperCase()
            };
        }
    }

    // 3. Fallback: consultar /api/placas-lista
    try {
        var resp = await fetch('/api/placas-lista');
        if (resp.ok) {
            var lista = await resp.json();
            if (Array.isArray(lista)) {
                window._salPlacas = lista;
                var item = lista.find(function (p) { return (p.placa || '').trim().toUpperCase() === placa; });
                if (item) {
                    return {
                        placa: placa,
                        marca: (item.marca || '').trim().toUpperCase(),
                        modelo: (item.modelo || item.modelo_uts || '').trim().toUpperCase()
                    };
                }
            }
        }
    } catch (e) { }

    return { placa: placa, marca: '', modelo: '' };
};

window._salAbrirModalKits = async function () {
    var placaEl = document.getElementById('sal-f-placa');
    var placaVal = placaEl ? (placaEl.value || '').trim().toUpperCase() : '';

    // Si no hay placa en el selector, intentar buscar si se seleccionó una OT
    if (!placaVal) {
        var otEl = document.getElementById('sal-f-ot');
        var otVal = otEl ? (otEl.value || '').trim().toUpperCase() : '';
        if (otVal && window._salOTs) {
            var otMatch = window._salOTs.find(function (o) { return (o.id_ot || '').toUpperCase() === otVal; });
            if (otMatch && otMatch.placa) placaVal = otMatch.placa.trim().toUpperCase();
        }
    }

    // Punto 4: Validación si no hay placa
    if (!placaVal) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Por favor, seleccione primero una placa o N° de OT para cargar sus kits correspondientes', 'warning');
        } else if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Por favor, seleccione primero una placa o N° de OT para cargar sus kits correspondientes', 'warning');
        } else {
            alert('Por favor, seleccione primero una placa o N° de OT para cargar sus kits correspondientes');
        }
        return;
    }

    var vehiculo = (typeof window._obtenerVehiculoPorPlaca === 'function')
        ? await window._obtenerVehiculoPorPlaca(placaVal)
        : null;

    if (!vehiculo) {
        // Búsqueda directa en _salPlacas o dataGlobalPlacas
        var foundPlaca = (window._salPlacas || []).find(function (p) { return (p.placa || '').toUpperCase() === placaVal; });
        var marca = foundPlaca ? (foundPlaca.marca || '').toUpperCase() : '';
        var modelo = foundPlaca ? (foundPlaca.modelo || foundPlaca.modelo_uts || '').toUpperCase() : '';
        vehiculo = { placa: placaVal, marca: marca, modelo: modelo };
    }

    var marca = vehiculo.marca || '';
    var modelo = vehiculo.modelo || '';

    var lblPlaca = document.getElementById('sal-kit-placa-lbl');
    var lblMarca = document.getElementById('sal-kit-marca-lbl');
    var lblModelo = document.getElementById('sal-kit-modelo-lbl');
    if (lblPlaca) lblPlaca.textContent = placaVal;
    if (lblMarca) lblMarca.textContent = marca || 'NO ESPECIFICADA';
    if (lblModelo) lblModelo.textContent = modelo || 'NO ESPECIFICADO';

    // Resetear selector y preview
    var selTipo = document.getElementById('sal-kit-select-tipo');
    var noKitsAlert = document.getElementById('sal-kit-no-kits');
    var prevWrap = document.getElementById('sal-kit-preview-wrap');
    var btnInsertar = document.getElementById('sal-btn-insertar-kit');
    if (selTipo) selTipo.innerHTML = '<option value="">— Cargando kits... —</option>';
    if (noKitsAlert) noKitsAlert.classList.add('d-none');
    if (prevWrap) prevWrap.classList.add('d-none');
    if (btnInsertar) btnInsertar.disabled = true;

    // Abrir Drawer al frente con las mismas dimensiones
    window.salAbrirSubDrawer('sal-drawer-kit');

    // Asegurar inventario cargado para validación de stock (Punto 6)
    if (!window._salInvData || !window._salInvData.length) {
        try {
            var rInv = await fetch('/api/almacen/inventario');
            if (rInv.ok) window._salInvData = await rInv.json();
        } catch (e) { }
    }

    // Consultar kits
    try {
        var respKits = await fetch('/api/mantenimiento-kits');
        var dataKits = respKits.ok ? await respKits.json() : { data: [] };
        var allKits = Array.isArray(dataKits.data) ? dataKits.data : (Array.isArray(dataKits) ? dataKits : []);

        // Filtrar estrictamente por Marca y Modelo de la placa
        var kitsFiltrados = allKits.filter(function (k) {
            var kMarca = (k.marca_vehiculo || '').trim().toUpperCase();
            var kModelo = (k.modelo_vehiculo || '').trim().toUpperCase();
            return kMarca === marca && kModelo === modelo;
        });

        window._salKitsDisponibles = kitsFiltrados;

        // Agrupar por tipo_mp / nombre_kit
        var grupos = {};
        kitsFiltrados.forEach(function (item) {
            var key = item.tipo_mp || item.nombre_kit || 'General';
            if (!grupos[key]) grupos[key] = [];
            grupos[key].push(item);
        });

        var keys = Object.keys(grupos);
        if (!keys.length) {
            if (selTipo) selTipo.innerHTML = '<option value="">— No hay kits para este modelo —</option>';
            if (noKitsAlert) noKitsAlert.classList.remove('d-none');
            return;
        }

        if (selTipo) {
            selTipo.innerHTML = '<option value="">— Seleccionar Kit (' + keys.length + ' disponibles) —</option>' +
                keys.map(function (k) {
                    var cantArt = grupos[k].length;
                    return '<option value="' + salEsc(k) + '">' + salEsc(k) + ' (' + cantArt + ' ' + (cantArt === 1 ? 'ítem' : 'ítems') + ')</option>';
                }).join('');
        }
    } catch (err) {
        console.error('Error cargando kits en salidas:', err);
        if (selTipo) selTipo.innerHTML = '<option value="">— Error al cargar kits —</option>';
    }
};

window._salOnKitSelected = function (tipoMp) {
    var prevWrap = document.getElementById('sal-kit-preview-wrap');
    var tb = document.getElementById('sal-kit-preview-tbody');
    var countEl = document.getElementById('sal-kit-items-count');
    var btnInsertar = document.getElementById('sal-btn-insertar-kit');

    if (!tipoMp) {
        if (prevWrap) prevWrap.classList.add('d-none');
        if (btnInsertar) btnInsertar.disabled = true;
        window._salKitSeleccionado = null;
        return;
    }

    var items = (window._salKitsDisponibles || []).filter(function (k) {
        return (k.tipo_mp || k.nombre_kit || 'General') === tipoMp;
    });

    window._salKitSeleccionado = { tipo: tipoMp, items: items };

    if (!items.length) {
        if (prevWrap) prevWrap.classList.add('d-none');
        if (btnInsertar) btnInsertar.disabled = true;
        return;
    }

    if (countEl) countEl.textContent = items.length;
    if (tb) {
        tb.innerHTML = items.map(function (it) {
            // Buscar stock en almacén para este ítem (Punto 6)
            var invItem = (window._salInvData || []).find(function (x) {
                var invNom = (x.descripcion || x.articulo || x.nombre || '').trim().toUpperCase();
                var kitNom = (it.item_nombre || '').trim().toUpperCase();
                return invNom === kitNom || invNom.includes(kitNom) || kitNom.includes(invNom);
            });

            var stock = invItem ? parseFloat(invItem.stock_actual != null ? invItem.stock_actual : (invItem.stock != null ? invItem.stock : 0)) : null;
            var cantReq = parseFloat(it.cantidad || 1);
            var stockBadge = '';

            if (stock === null) {
                stockBadge = '<span class="badge bg-light text-muted border">No inventariado</span>';
            } else if (stock >= cantReq) {
                stockBadge = '<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1"><i class="bi bi-check-circle-fill me-1"></i>' + stock + ' ' + (it.unidad_medida || 'UND') + '</span>';
            } else if (stock > 0) {
                stockBadge = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1"><i class="bi bi-exclamation-triangle-fill me-1"></i>Stock bajo: ' + stock + '</span>';
            } else {
                stockBadge = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1"><i class="bi bi-x-circle-fill me-1"></i>Sin Stock (0)</span>';
            }

            return `
                <tr>
                    <td class="fw-bold text-dark" style="padding: 8px 12px;">
                        <i class="bi bi-wrench-adjustable text-secondary me-1"></i> ${salEsc(it.item_nombre || '—')}
                    </td>
                    <td class="text-center fw-bold text-primary" style="padding: 8px 12px;">
                        ${cantReq}
                    </td>
                    <td class="text-center text-muted fw-medium" style="padding: 8px 12px; font-size: 0.76rem;">
                        ${salEsc(it.unidad_medida || 'UND')}
                    </td>
                    <td class="text-center" style="padding: 8px 12px;">
                        ${stockBadge}
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (prevWrap) prevWrap.classList.remove('d-none');
    if (btnInsertar) btnInsertar.disabled = false;
};

window._salInsertarKit = function () {
    if (!window._salKitSeleccionado || !window._salKitSeleccionado.items || !window._salKitSeleccionado.items.length) {
        return;
    }

    var kit = window._salKitSeleccionado;
    var items = kit.items;

    // Verificar si hay una fila inicial vacía para limpiarla
    var descs = document.querySelectorAll('.sal-item-desc');
    if (descs.length === 1 && !descs[0].value.trim()) {
        var singleTr = document.getElementById('sal-item-0');
        if (singleTr) singleTr.remove();
    }

    // Inyectar cada repuesto del kit (Punto 2 y 3: Acumulativo y editable)
    items.forEach(function (it) {
        var idx = window._salItemIdx++;
        var tbody = document.getElementById('sal-items-tbody');
        if (!tbody) return;

        var tr = document.createElement('tr');
        tr.id = 'sal-item-' + idx;
        tr.innerHTML = `
            <td style="padding:6px 8px;">
                <div style="display:flex;gap:4px;align-items:center;">
                    <input type="text" class="form-control form-control-sm sal-item-desc bg-white fw-medium" list="sal-inv-list" placeholder="Buscar artículo…" 
                        data-idx="${idx}" oninput="window._salBuscarArt(this, ${idx})" style="border-radius:8px; font-size:0.8rem;">
                    <button type="button" class="btn btn-sm btn-light border text-primary shadow-2xs" style="flex-shrink:0; padding:3px 8px; border-radius:8px;" 
                        onclick="window._salAbrirQR(${idx})" title="Escanear código de barras o QR">
                        <i class="bi bi-upc-scan"></i>
                    </button>
                </div>
                <input type="hidden" class="sal-item-inv-id" data-idx="${idx}">
            </td>
            <td style="padding:6px 8px; width:75px;">
                <input type="number" class="form-control form-control-sm sal-item-cant bg-white fw-bold text-center" data-idx="${idx}" value="${parseFloat(it.cantidad || 1)}" min="0.001" step="0.001" oninput="window._salCalcItem(${idx})" style="border-radius:8px; font-size:0.8rem;">
            </td>
            <td style="padding:6px 8px; width:105px;">
                <input type="number" class="form-control form-control-sm sal-item-cu bg-white fw-semibold" data-idx="${idx}" value="0" min="0" step="0.01" oninput="window._salCalcItem(${idx})" style="border-radius:8px; font-size:0.8rem;">
            </td>
            <td style="padding:6px 8px; width:100px;">
                <input type="number" class="form-control form-control-sm sal-item-imp bg-light fw-bold text-success" data-idx="${idx}" value="0" readonly style="border-radius:8px; font-size:0.8rem;">
            </td>
            <td style="padding:6px 8px; width:38px; text-align:center;">
                <button type="button" class="btn btn-sm btn-light border-0 text-danger rounded-circle p-1" onclick="window._salQuitarItem(${idx})" title="Eliminar fila">
                    <i class="bi bi-x-lg" style="font-size:0.75rem;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);

        // Buscar correspondencia en almacén
        var invItem = (window._salInvData || []).find(function (x) {
            var invNom = (x.descripcion || x.articulo || x.nombre || '').trim().toUpperCase();
            var kitNom = (it.item_nombre || '').trim().toUpperCase();
            return invNom === kitNom || invNom.includes(kitNom) || kitNom.includes(invNom);
        });

        var descEl = tr.querySelector('.sal-item-desc');
        var hidEl = tr.querySelector('.sal-item-inv-id');
        var cuEl = tr.querySelector('.sal-item-cu');

        if (invItem) {
            if (descEl) descEl.value = invItem.id + ' — ' + (invItem.descripcion || it.item_nombre);
            if (hidEl) hidEl.value = invItem.id;
            var costoSoles = parseFloat(invItem.costo_soles != null ? invItem.costo_soles : (invItem.costo_referencial || it.costo_unitario || 0));
            if (cuEl) cuEl.value = costoSoles.toFixed(2);
        } else {
            if (descEl) descEl.value = it.item_nombre || '';
            if (cuEl) cuEl.value = parseFloat(it.costo_unitario || 0).toFixed(2);
        }

        window._salCalcItem(idx);
    });

    _salActualizarTotal();

    // Cerrar sub-drawer
    window.salCerrarSubDrawer('sal-drawer-kit');

    if (typeof window.mostrarToast === 'function') {
        window.mostrarToast('Se agregaron ' + items.length + ' repuestos del kit ' + kit.tipo, 'success');
    } else if (typeof window.mostrarAlerta === 'function') {
        window.mostrarAlerta('Se agregaron ' + items.length + ' repuestos del kit ' + kit.tipo, 'success');
    }
};

window.salAbrirSubDrawer = function (id) {
    var d = document.getElementById(id);
    if (d) {
        if (d.parentElement !== document.body) {
            document.body.appendChild(d);
        }
        d.style.zIndex = '1150';
        d.classList.add('open');
    }
};

window.salCerrarSubDrawer = function (id) {
    var d = document.getElementById(id);
    if (d) d.classList.remove('open');
};

// ── Items del formulario ──────────────────────────────────────
window._salAgregarItem = function () {
    var tbody = document.getElementById('sal-items-tbody');
    if (!tbody) return;
    var idx = window._salItemIdx++;
    var tr = document.createElement('tr');
    tr.id = 'sal-item-' + idx;
    tr.innerHTML = `
        <td style="padding:6px 8px;">
            <div style="display:flex;gap:4px;align-items:center;">
                <input type="text" class="form-control form-control-sm sal-item-desc bg-white fw-medium" list="sal-inv-list" placeholder="Buscar artículo…" 
                    data-idx="${idx}" oninput="window._salBuscarArt(this, ${idx})" style="border-radius:8px; font-size:0.8rem;">
                <button type="button" class="btn btn-sm btn-light border text-primary shadow-2xs" style="flex-shrink:0; padding:3px 8px; border-radius:8px;" 
                    onclick="window._salAbrirQR(${idx})" title="Escanear código de barras o QR">
                    <i class="bi bi-upc-scan"></i>
                </button>
            </div>
            <input type="hidden" class="sal-item-inv-id" data-idx="${idx}">
        </td>
        <td style="padding:6px 8px; width:75px;">
            <input type="number" class="form-control form-control-sm sal-item-cant bg-white fw-bold text-center" data-idx="${idx}" value="1" min="0.001" step="0.001" oninput="window._salCalcItem(${idx})" style="border-radius:8px; font-size:0.8rem;">
        </td>
        <td style="padding:6px 8px; width:105px;">
            <input type="number" class="form-control form-control-sm sal-item-cu bg-white fw-semibold" data-idx="${idx}" value="0" min="0" step="0.01" oninput="window._salCalcItem(${idx})" style="border-radius:8px; font-size:0.8rem;">
        </td>
        <td style="padding:6px 8px; width:100px;">
            <input type="number" class="form-control form-control-sm sal-item-imp bg-light fw-bold text-success" data-idx="${idx}" value="0" readonly style="border-radius:8px; font-size:0.8rem;">
        </td>
        <td style="padding:6px 8px; width:38px; text-align:center;">
            <button type="button" class="btn btn-sm btn-light border-0 text-danger rounded-circle p-1" onclick="window._salQuitarItem(${idx})" title="Eliminar fila">
                <i class="bi bi-x-lg" style="font-size:0.75rem;"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
};

window._salQrTargetIdx = window._salQrTargetIdx || null;

window._salAbrirQR = function (idx) {
    window._salQrTargetIdx = idx;
    window._abrirEscaner(function (valor) {
        window._salSeleccionarItemPorQR(valor, window._salQrTargetIdx);
    }, 'Escanear Artículo');
};

window._salSeleccionarItemPorQR = function (valor, idx) {
    var item = (window._salInvData || []).find(function (d) {
        return String(d.id).trim() === valor.trim() ||
            (d.codigo_barras && d.codigo_barras.trim() === valor.trim());
    });
    if (!item) {
        if (typeof window.mostrarToast === 'function') window.mostrarToast('Artículo no encontrado: ' + valor, 'danger');
        else alert('Artículo no encontrado: ' + valor);
        return;
    }
    var descEl = document.querySelector('.sal-item-desc[data-idx="' + idx + '"]');
    var hidEl = document.querySelector('.sal-item-inv-id[data-idx="' + idx + '"]');
    var cuEl = document.querySelector('.sal-item-cu[data-idx="' + idx + '"]');
    if (descEl) descEl.value = item.id + ' — ' + (item.descripcion || '');
    if (hidEl) hidEl.value = item.id;
    if (cuEl) { cuEl.value = parseFloat(item.costo_soles != null ? item.costo_soles : item.costo_referencial || 0).toFixed(2); window._salCalcItem(idx); }
    // Enfocar cantidad
    var cantEl = document.querySelector('.sal-item-cant[data-idx="' + idx + '"]');
    if (cantEl) { cantEl.focus(); cantEl.select(); }
    if (typeof window.mostrarToast === 'function') window.mostrarToast('Artículo: ' + (item.descripcion || item.id), 'success');
};

window._salBuscarArt = function (input, idx) {
    var val = input.value || '';
    var invId = val.split(' — ')[0].trim();
    var item = (window._salInvData || []).find(function (d) { return d.id === invId; });
    if (item) {
        var hidEl = document.querySelector('.sal-item-inv-id[data-idx="' + idx + '"]');
        if (hidEl) hidEl.value = item.id;
        var cuEl = document.querySelector('.sal-item-cu[data-idx="' + idx + '"]');
        var costoSoles = parseFloat(item.costo_soles != null ? item.costo_soles : item.costo_referencial || 0);
        if (cuEl) { cuEl.value = costoSoles.toFixed(2); window._salCalcItem(idx); }
    }
};

window._salCalcItem = function (idx) {
    var cant = parseFloat((document.querySelector('.sal-item-cant[data-idx="' + idx + '"]') || {}).value) || 0;
    var cu = parseFloat((document.querySelector('.sal-item-cu[data-idx="' + idx + '"]') || {}).value) || 0;
    var impEl = document.querySelector('.sal-item-imp[data-idx="' + idx + '"]');
    if (impEl) impEl.value = (cant * cu).toFixed(2);
    _salActualizarTotal();
};

window._salQuitarItem = function (idx) {
    var tr = document.getElementById('sal-item-' + idx);
    if (tr) tr.remove();
    _salActualizarTotal();
};

function _salActualizarTotal() {
    var imps = document.querySelectorAll('.sal-item-imp');
    var total = 0;
    imps.forEach(function (el) { total += parseFloat(el.value) || 0; });
    var el = document.getElementById('sal-items-total');
    if (el) el.textContent = 'S/. ' + total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Alerta Moderna (Estilo Azkell) ──────────────────────────────
window.salAlertModerno = function (titulo, mensaje) {
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

    requestAnimationFrame(function () {
        overlay.style.opacity = '1';
        box.style.transform = 'scale(1)';
    });

    var ok = box.querySelector('#btn-ok');

    function cerrar() {
        overlay.style.opacity = '0';
        box.style.transform = 'scale(0.95)';
        setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    }

    overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrar(); });
    ok.addEventListener('click', cerrar);
};

// ── Guardar nueva solicitud ───────────────────────────────────
window.salGuardarNuevo = function () {
    var get = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var idOt = get('sal-f-ot');
    var fecha = get('sal-f-fecha');
    var tipo = get('sal-f-tipo');
    var placa = (window._cbGet('sal-f-placa') || '').toUpperCase();
    var resp = window._cbGetText('sal-f-responsable') || get('sal-f-responsable-txt') || '';
    var obs = get('sal-f-obs');

    if (!fecha) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La fecha es requerida', 'danger'); return; }

    var invIds = document.querySelectorAll('.sal-item-inv-id');
    var descs = document.querySelectorAll('.sal-item-desc');
    var cants = document.querySelectorAll('.sal-item-cant');
    var cus = document.querySelectorAll('.sal-item-cu');
    var imps = document.querySelectorAll('.sal-item-imp');
    var items = [];
    var requestedStock = {};

    for (var i = 0; i < cants.length; i++) {
        var desc = descs[i] ? descs[i].value.trim() : '';
        var invId = invIds[i] ? invIds[i].value : '';
        if (!desc && !invId) continue;
        var cant = parseFloat(cants[i].value) || 0;
        var cu = parseFloat(cus[i].value) || 0;
        var imp = parseFloat(imps[i].value) || cant * cu;
        if (cant <= 0) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Cantidad inválida en fila ' + (i + 1), 'danger'); return; }

        if (invId) {
            requestedStock[invId] = (requestedStock[invId] || 0) + cant;
        }

        items.push({ inventario_id: invId || null, descripcion: desc, cantidad: cant, costo_unitario: cu, importe: imp });
    }

    if (!items.length) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Agrega al menos un artículo', 'danger'); return; }

    // Validar el stock acumulado
    var stockErrors = [];
    var editId = window._salEditId || null;
    var isDespachado = false;
    var oldItems = [];

    if (editId) {
        var oldSalida = window.salData.find(function (x) { return x.id === editId; });
        if (oldSalida && (oldSalida.estado === 'Despachado' || !oldSalida.estado)) {
            isDespachado = true;
            oldItems = oldSalida.items || [];
        }
    }

    for (var invIdKey in requestedStock) {
        var invItem = (window._salInvData || []).find(function (d) { return d.id === invIdKey; });
        if (invItem) {
            var stock = parseFloat(invItem.stock_actual || 0);

            if (isDespachado) {
                var oldItemMatches = oldItems.filter(function (it) { return it.inventario_id === invIdKey; });
                oldItemMatches.forEach(function (old) {
                    stock += parseFloat(old.cantidad || 0);
                });
            }

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
        stockErrors.forEach(function (e, idx) {
            var isLast = idx === stockErrors.length - 1;
            msg += '<div style="padding-bottom:8px;' + (isLast ? '' : 'margin-bottom:8px;border-bottom:1px dashed #cbd5e1;') + '">';
            msg += '<div style="font-weight:700;color:#1e293b;font-size:0.85rem;margin-bottom:6px;word-break:break-word;">' + salEsc(e.desc) + '</div>';
            msg += '<div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#475569;">';
            msg += '<span>Stock: <b style="color:#0f172a;">' + e.stock.toLocaleString('es-PE', { maximumFractionDigits: 3 }) + '</b></span>';
            msg += '<span>Sol.: <b style="color:#ef4444;">' + e.req.toLocaleString('es-PE', { maximumFractionDigits: 3 }) + '</b></span>';
            msg += '</div>';
            msg += '</div>';
        });
        msg += '</div>';

        window.salAlertModerno('Stock Insuficiente', msg);
        return;
    }

    var body = {
        ticket_ot: idOt,
        fecha: fecha,
        tipo_destino: tipo || 'Vehiculo',
        placa: tipo === 'Vehiculo' ? placa : null,
        responsable: resp,
        observaciones: obs,
        moneda: 'PEN',
        tipo_cambio: 1,
        creado_por: localStorage.getItem('fleet_correo') || '',
        items: items
    };

    var editId = window._salEditId || null;
    var method = editId ? 'PUT' : 'POST';
    var url = editId ? '/api/almacen/salidas/' + encodeURIComponent(editId) : '/api/almacen/salidas';
    if (editId) body.accion = 'editar';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
        .then(function (r) {
            if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'HTTP ' + r.status); });
            return r.json();
        })
        .then(function (d) {
            window.salCerrarNuevo();
            window._salEditId = null;
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta((editId ? 'Salida actualizada' : 'Salida ' + (d.id || '') + ' registrada'), 'success');
            salCargar();
        })
        .catch(function (err) {
            console.error('Error guardando salida:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta(err.message || 'Error al guardar la salida', 'danger');
        });
};





// ── Dynamic UI Toggle por Tipo de Orden y Tipo Destino ───────
window.salToggleTipoOrden = function () {
    var tipoOrden = (document.getElementById('sal-f-tipo-orden') || {}).value || 'Orden de Salida';
    var isAjuste = tipoOrden === 'Ajuste de Inventario (Resta)';

    var colOt = document.getElementById('sal-col-ot');
    var colTipoDest = document.getElementById('sal-col-tipo-destino');
    var rowPlaca = document.getElementById('sal-row-placa');

    if (colOt) colOt.style.display = isAjuste ? 'none' : '';
    if (colTipoDest) colTipoDest.style.display = isAjuste ? 'none' : '';

    if (isAjuste) {
        if (rowPlaca) rowPlaca.style.display = 'none';
        if (typeof window._cbReset === 'function') {
            window._cbReset('sal-f-ot');
            window._cbReset('sal-f-placa');
        }
    } else {
        salToggleTipo();
    }
};

window.salToggleTipo = function () {
    var tipoOrden = (document.getElementById('sal-f-tipo-orden') || {}).value || 'Orden de Salida';
    if (tipoOrden === 'Ajuste de Inventario (Resta)') {
        var rowPlaca = document.getElementById('sal-row-placa');
        if (rowPlaca) rowPlaca.style.display = 'none';
        return;
    }
    var tipo = (document.getElementById('sal-f-tipo') || {}).value || '';
    var rowPlaca = document.getElementById('sal-row-placa');
    if (rowPlaca) rowPlaca.style.display = tipo === 'Vehiculo' ? '' : 'none';
    if (tipo !== 'Vehiculo') {
        window._cbReset('sal-f-placa');
    }
};

// ── Exportar a Excel ─────────────────────────────────────────
window.salExportar = function () {
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
        datos.forEach(function (m) {
            var items = m.items || [];
            var fecha = salFmtDate(m.fecha);
            if (!items.length) {
                rows.push('<tr>'
                    + '<td>' + salEsc(m.id || '') + '</td>'
                    + '<td>' + fecha + '</td>'
                    + '<td>' + salEsc(m.ticket_ot || '') + '</td>'
                    + '<td>' + salEsc(m.placa || '') + '</td>'
                    + '<td>' + salEsc(m.responsable || '') + '</td>'
                    + '<td></td><td>Sin artículos</td><td></td><td></td>'
                    + '<td>' + salEsc(m.estado || '') + '</td>'
                    + '</tr>');
            } else {
                items.forEach(function (it) {
                    var nombre = salDescLimpia(it.descripcion, it.inventario_id);
                    rows.push('<tr>'
                        + '<td>' + salEsc(m.id || '') + '</td>'
                        + '<td>' + fecha + '</td>'
                        + '<td>' + salEsc(m.ticket_ot || '') + '</td>'
                        + '<td>' + salEsc(m.placa || '') + '</td>'
                        + '<td>' + salEsc(m.responsable || '') + '</td>'
                        + '<td>' + salEsc(it.inventario_id || '') + '</td>'
                        + '<td class="col-articulo">' + salEsc(nombre) + '</td>'
                        + '<td>' + (it.cantidad || 0) + '</td>'
                        + '<td>' + parseFloat(it.costo_unitario || 0).toFixed(2) + '</td>'
                        + '<td>' + salEsc(m.estado || '') + '</td>'
                        + '</tr>');
                });
            }
        });
        tbl.innerHTML = thead + '<tbody>' + rows.join('') + '</tbody>';
        document.body.appendChild(tbl);
        window.descargarExcelDinamico(tmpId, 'Almacen_Salidas');
        setTimeout(function () { var el = document.getElementById(tmpId); if (el) el.remove(); }, 1000);
        return;
    }

    var cabecera = ['ID Solicitud', 'Fecha', 'N° OT', 'Placa', 'Responsable', 'Código', 'Artículo', 'Cantidad', 'Costo Unit.', 'Estado'];
    var csvRows = [cabecera];
    datos.forEach(function (m) {
        var items = m.items || [];
        var fecha = salFmtDate(m.fecha);
        if (!items.length) {
            csvRows.push([m.id || '', fecha, m.ticket_ot || '', m.placa || '', m.responsable || '', '', 'Sin artículos', '', '', m.estado || '']);
        } else {
            items.forEach(function (it) {
                var nombre = salDescLimpia(it.descripcion, it.inventario_id);
                csvRows.push([m.id || '', fecha, m.ticket_ot || '', m.placa || '', m.responsable || '',
                it.inventario_id || '', nombre, it.cantidad || 0,
                parseFloat(it.costo_unitario || 0).toFixed(2), m.estado || '']);
            });
        }
    });
    var csv = csvRows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'Almacen_Salidas.csv'; a.click();
    URL.revokeObjectURL(url);
};

// ── KPI Row ───────────────────────────────────────────────────────
window._salRenderKPIs = function (data) {
    var el = document.getElementById('sal-kpi-row');
    if (!el) return;
    var pend = data.filter(function (d) { return d.estado === 'Pendiente'; }).length;
    var desp = data.filter(function (d) { return d.estado === 'Despachado'; }).length;
    var hoy = new Date();
    var mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
    var esteMes = data.filter(function (d) {
        return (d.fecha || '').slice(0, 7) === mesActual && d.estado === 'Despachado';
    }).length;
    var card = 'flex:0 0 auto;min-width:130px;display:flex;justify-content:space-between;align-items:center;' +
        'padding:.85rem 1rem;border-radius:18px;border:1.5px solid;gap:.6rem;';
    var lbl = 'font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.2rem;';
    var num = 'font-size:1.6rem;font-weight:900;line-height:1;';
    var ico = 'width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;';
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
