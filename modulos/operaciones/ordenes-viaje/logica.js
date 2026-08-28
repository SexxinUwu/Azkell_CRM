// ================================================================
// 🚍 MÓDULO: ÓRDENES DE VIAJE — LÓGICA (OPERACIONES)
// ================================================================

window.dataGlobalOrdenesViajeModulo = [];
window.datosFiltradosOrdenesViajeModulo = [];
var _ovPaginaActual = 1;
var _ovItemsPorPagina = 25;
var _ovDebounceTimer = null;

window.init_ordenes_viaje = function() {
    window.ovCargarDatos();
};

window.ovCargarDatos = async function() {
    var tbody = document.getElementById('ov-tabla-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5 text-secondary">
                    <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                    <div class="small fw-semibold">Consultando base de datos local...</div>
                </td>
            </tr>
        `;
    }

    try {
        var res = await fetch('/api/operaciones/ordenes-viaje?limit=1500');
        var json = await res.json();
        var lista = (json && json.ok && Array.isArray(json.data)) ? json.data : [];

        window.dataGlobalOrdenesViajeModulo = lista;
        window.ovActualizarKPIs(lista);
        window.ovAplicarFiltros();
    } catch(err) {
        console.error('Error cargando ordenes de viaje:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-5 text-danger">
                        <i class="bi bi-exclamation-triangle fs-3 d-block mb-2"></i>
                        <div class="fw-bold">Error al conectar con la base de datos</div>
                        <small class="text-muted">${err.message}</small>
                    </td>
                </tr>
            `;
        }
    }
};

window.ovActualizarKPIs = function(lista) {
    var total = lista.length;
    var carretas = 0;
    var conductoresSet = new Set();
    var rutas = 0;

    lista.forEach(function(v) {
        if (v.placa_remolque && String(v.placa_remolque).trim().length > 0) carretas++;
        if (v.conductor && String(v.conductor).trim().length > 0) conductoresSet.add(v.conductor.trim().toUpperCase());
        if (v.ruta && String(v.ruta).trim().length > 0) rutas++;
    });

    var kTotal = document.getElementById('ov-kpi-total');
    var kCarretas = document.getElementById('ov-kpi-carretas');
    var kConductores = document.getElementById('ov-kpi-conductores');
    var kRutas = document.getElementById('ov-kpi-rutas');
    var badgeTotal = document.getElementById('ov-lbl-total-badge');

    if (kTotal) kTotal.textContent = total.toLocaleString();
    if (kCarretas) kCarretas.textContent = carretas.toLocaleString();
    if (kConductores) kConductores.textContent = conductoresSet.size.toLocaleString();
    if (kRutas) kRutas.textContent = rutas.toLocaleString();
    if (badgeTotal) badgeTotal.textContent = total + ' registros';
};

window.ovOnFiltrarDebounced = function() {
    clearTimeout(_ovDebounceTimer);
    _ovDebounceTimer = setTimeout(function() {
        window.ovOnFiltrar();
    }, 200);
};

window.ovOnFiltrar = function() {
    _ovPaginaActual = 1;
    window.ovAplicarFiltros();
};

window.ovAplicarFiltros = function() {
    var qEl = document.getElementById('ov-filtro-q');
    var tipoEl = document.getElementById('ov-filtro-tipo');

    var q = qEl ? (qEl.value || '').trim().toUpperCase() : '';
    var tipo = tipoEl ? tipoEl.value : 'TODOS';

    var lista = window.dataGlobalOrdenesViajeModulo || [];

    var filtrados = lista.filter(function(v) {
        // Filtro de Texto (Búsqueda general)
        if (q) {
            var num = (v.viaje || '').toUpperCase();
            var tracto = (v.placa_tracto || '').toUpperCase();
            var carreta = (v.placa_remolque || '').toUpperCase();
            var cond = (v.conductor || '').toUpperCase();
            var ruta = (v.ruta || '').toUpperCase();
            var match = num.includes(q) || tracto.includes(q) || carreta.includes(q) || cond.includes(q) || ruta.includes(q);
            if (!match) return false;
        }

        // Filtro por Tipo de Unidad
        if (tipo === 'CON_CARRETA') {
            if (!v.placa_remolque || !String(v.placa_remolque).trim()) return false;
        } else if (tipo === 'SOLO_TRACTO') {
            if (v.placa_remolque && String(v.placa_remolque).trim()) return false;
        } else if (tipo === 'CON_RUTA') {
            if (!v.ruta || !String(v.ruta).trim()) return false;
        }

        return true;
    });

    window.datosFiltradosOrdenesViajeModulo = filtrados;
    window.ovRenderizarTabla();
};

window.ovRenderizarTabla = function() {
    var tbody = document.getElementById('ov-tabla-body');
    var lblContador = document.getElementById('ov-lbl-contador-tabla');
    var infoPaginacion = document.getElementById('ov-info-paginacion');
    var btnPrev = document.getElementById('ov-btn-prev');
    var btnNext = document.getElementById('ov-btn-next');
    if (!tbody) return;

    var total = window.datosFiltradosOrdenesViajeModulo.length;
    var totalPaginas = Math.ceil(total / _ovItemsPorPagina) || 1;

    if (_ovPaginaActual > totalPaginas) _ovPaginaActual = totalPaginas;
    if (_ovPaginaActual < 1) _ovPaginaActual = 1;

    var inicio = (_ovPaginaActual - 1) * _ovItemsPorPagina;
    var fin = inicio + _ovItemsPorPagina;
    var pageItems = window.datosFiltradosOrdenesViajeModulo.slice(inicio, fin);

    if (lblContador) lblContador.textContent = `Mostrando ${total} viaje${total === 1 ? '' : 's'}`;
    if (infoPaginacion) infoPaginacion.textContent = `Página ${_ovPaginaActual} de ${totalPaginas} (${total} total)`;
    if (btnPrev) btnPrev.disabled = _ovPaginaActual <= 1;
    if (btnNext) btnNext.disabled = _ovPaginaActual >= totalPaginas;

    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5 text-secondary">
                    <i class="bi bi-search fs-3 d-block mb-2 text-muted"></i>
                    <div class="fw-bold">No se encontraron órdenes de viaje</div>
                    <small class="text-muted">Intenta ajustando los filtros de búsqueda o haz clic en "Sincronizar Órdenes de Viaje".</small>
                </td>
            </tr>
        `;
        return;
    }

    var html = '';
    pageItems.forEach(function(v) {
        var fechaStr = '---';
        if (v.fecha_viaje) {
            var d = new Date(v.fecha_viaje);
            fechaStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        }

        var carretaHtml = v.placa_remolque && v.placa_remolque.trim()
            ? `<span class="ov-badge-placa ov-badge-carreta"><i class="bi bi-truck-flatbed me-1"></i>${v.placa_remolque}</span>`
            : `<span class="text-muted small fst-italic">—</span>`;

        var rutaHtml = v.ruta && v.ruta.trim()
            ? `<span class="ov-badge-ruta"><i class="bi bi-signpost-2-fill text-primary me-1"></i>${v.ruta}</span>`
            : `<span class="text-muted small fst-italic">Sin ruta asignada</span>`;

        html += `
            <tr>
                <td>
                    <span class="ov-badge-viaje">${v.viaje || '---'}</span>
                </td>
                <td>
                    <div class="fw-semibold text-secondary" style="font-size:0.84rem;">
                        <i class="bi bi-clock-history me-1 text-muted"></i>${fechaStr}
                    </div>
                </td>
                <td>
                    <span class="ov-badge-placa ov-badge-tracto"><i class="bi bi-truck me-1"></i>${v.placa_tracto || '---'}</span>
                </td>
                <td>
                    ${carretaHtml}
                </td>
                <td>
                    <div class="fw-bold text-dark d-flex align-items-center gap-1" style="font-size:0.86rem;">
                        <i class="bi bi-person-fill text-secondary"></i>
                        <span>${v.conductor || 'SIN CONDUCTOR'}</span>
                    </div>
                </td>
                <td>
                    ${rutaHtml}
                </td>
                <td style="text-align: center;">
                    <span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" style="font-size:0.72rem; font-weight:700;">ACTIVO</span>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
};

window.ovCambiarPagina = function(delta) {
    _ovPaginaActual += delta;
    window.ovRenderizarTabla();
};

window.ovLimpiarFiltros = function() {
    var qEl = document.getElementById('ov-filtro-q');
    var tipoEl = document.getElementById('ov-filtro-tipo');
    if (qEl) qEl.value = '';
    if (tipoEl) tipoEl.value = 'TODOS';
    window.ovOnFiltrar();
};

window.ovEjecutarSincronizacion = async function(isSilent) {
    var btn = document.getElementById('btn-ov-sync');
    var msgEl = document.getElementById('ov-sync-status-msg');
    if (btn) {
        btn.classList.add('loading');
        btn.disabled = true;
    }
    if (msgEl) {
        msgEl.innerHTML = `<span class="text-primary d-inline-flex align-items-center gap-1"><i class="bi bi-arrow-repeat spin" style="animation: ov-spin 0.8s linear infinite;"></i> Sincronizando con base de datos de Marsisa...</span>`;
    }

    try {
        if (!isSilent && typeof window.showToastNotification === 'function') {
            window.showToastNotification('Sincronizando órdenes de viaje con el servidor...', 'info');
        }

        var res = await fetch('/api/operaciones/ordenes-viaje/sincronizar', { method: 'POST' });
        var data = await res.json();

        if (data && data.ok) {
            if (data.syncSkipped) {
                if (msgEl) {
                    msgEl.innerHTML = `<span class="text-muted d-inline-flex align-items-center gap-1"><i class="bi bi-info-circle"></i> Sincronización remota externa solo aplica para Marsisa.</span>`;
                }
                if (!isSilent && typeof window.showToastNotification === 'function') {
                    window.showToastNotification(data.message || 'La sincronización remota externa solo aplica para Marsisa.', 'info');
                }
                return;
            }

            var fetchRes = await fetch('/api/operaciones/ordenes-viaje?limit=1500');
            var fetchJson = await fetchRes.json();
            window.dataGlobalOrdenesViajeModulo = (fetchJson && fetchJson.data) || [];

            window.ovActualizarKPIs(window.dataGlobalOrdenesViajeModulo);
            window.ovAplicarFiltros();

            var horaActual = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            var cantNuevos = data.insertados || 0;
            var cantAct = data.actualizados || 0;

            if (msgEl) {
                msgEl.innerHTML = `<span class="text-success d-inline-flex align-items-center gap-1"><i class="bi bi-check-circle-fill"></i> Sincronización completa (${cantNuevos} nuevos viajes) · ${horaActual}</span>`;
            }

            if (typeof window.showToastNotification === 'function') {
                window.showToastNotification(`Sincronización completada: ${cantNuevos} nuevos viajes insertados.`, 'success');
            }
        } else {
            throw new Error((data && data.error) || 'Error durante la sincronización');
        }
    } catch(err) {
        console.error('Error al sincronizar:', err);
        if (msgEl) {
            msgEl.innerHTML = `<span class="text-danger d-inline-flex align-items-center gap-1"><i class="bi bi-exclamation-triangle-fill"></i> Error de sincronización: ${err.message}</span>`;
        }
        if (typeof window.showToastNotification === 'function') {
            window.showToastNotification('Error al sincronizar: ' + err.message, 'error');
        }
    } finally {
        if (btn) {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }
};
