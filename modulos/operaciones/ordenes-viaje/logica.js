// ================================================================
// 🚍 MÓDULO: ÓRDENES DE VIAJE — LÓGICA (OPERACIONES)
// ================================================================

window.dataGlobalOrdenesViajeModulo = [];
window.dataGlobalRutasModulo = [];
window.datosFiltradosOrdenesViajeModulo = [];
var _ovModoVistaActual = 'viajes'; // 'viajes' | 'rutas'
var _ovPaginaActual = 1;
var _ovItemsPorPagina = 25;
var _ovDebounceTimer = null;

window.init_ordenes_viaje = function() {
    window.ovCargarDatos();
};

window.ovCambiarModoVista = function(modo) {
    if (_ovModoVistaActual === modo) return;
    _ovModoVistaActual = modo;

    var btnViajes = document.getElementById('ov-tab-viajes');
    var btnRutas = document.getElementById('ov-tab-rutas');

    if (modo === 'viajes') {
        if (btnViajes) { btnViajes.classList.add('active', 'bg-white', 'shadow-sm'); btnViajes.classList.remove('text-secondary'); }
        if (btnRutas) { btnRutas.classList.remove('active', 'bg-white', 'shadow-sm'); btnRutas.classList.add('text-secondary'); }
    } else {
        if (btnRutas) { btnRutas.classList.add('active', 'bg-white', 'shadow-sm'); btnRutas.classList.remove('text-secondary'); }
        if (btnViajes) { btnViajes.classList.remove('active', 'bg-white', 'shadow-sm'); btnViajes.classList.add('text-secondary'); }
    }

    _ovPaginaActual = 1;
    window.ovConfigurarThead();
    window.ovAplicarFiltros();
};

window.ovConfigurarThead = function() {
    var thead = document.getElementById('ov-tabla-thead');
    if (!thead) return;

    if (_ovModoVistaActual === 'viajes') {
        thead.innerHTML = `
            <tr>
                <th style="width: 140px;">N° Viaje</th>
                <th style="width: 130px;">Fecha / Hora</th>
                <th style="width: 100px;">Tracto</th>
                <th style="width: 100px;">Carreta</th>
                <th>Conductor Asignado</th>
                <th>Órdenes y Rutas Asignadas</th>
                <th style="width: 120px; text-align: right;">Carga Ida</th>
                <th style="width: 120px; text-align: right;">Carga Retorno</th>
                <th style="width: 120px; text-align: right;">Peso Total</th>
                <th style="width: 80px; text-align: center;">Estado</th>
            </tr>
        `;
    } else {
        thead.innerHTML = `
            <tr>
                <th style="width: 130px;">N° Viaje</th>
                <th style="width: 130px;">N° Orden Serv.</th>
                <th style="width: 110px; text-align: center;">Tramo</th>
                <th style="width: 100px;">Tracto</th>
                <th style="width: 100px;">Carreta</th>
                <th>Conductor</th>
                <th>Ruta Despachada</th>
                <th style="width: 140px;">Tipo de Servicio</th>
                <th style="width: 110px; text-align: right;">Peso Carga</th>
                <th style="width: 80px; text-align: center;">Estado</th>
            </tr>
        `;
    }
};

window.ovCargarDatos = async function() {
    window.ovConfigurarThead();
    var tbody = document.getElementById('ov-tabla-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5 text-secondary">
                    <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                    <div class="small fw-semibold">Consultando base de datos local del ERP...</div>
                </td>
            </tr>
        `;
    }

    try {
        // Cargar vista de viajes y vista de rutas en paralelo
        var [resViajes, resRutas] = await Promise.all([
            fetch('/api/operaciones/ordenes-viaje?limit=2500'),
            fetch('/api/operaciones/ordenes-viaje?vista=rutas&limit=4000')
        ]);

        var jsonViajes = await resViajes.json();
        var jsonRutas = await resRutas.json();

        window.dataGlobalOrdenesViajeModulo = (jsonViajes && jsonViajes.ok && Array.isArray(jsonViajes.data)) ? jsonViajes.data : [];
        window.dataGlobalRutasModulo = (jsonRutas && jsonRutas.ok && Array.isArray(jsonRutas.data)) ? jsonRutas.data : [];

        window.ovActualizarKPIs();
        window.ovAplicarFiltros();
    } catch(err) {
        console.error('Error cargando ordenes de viaje:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-5 text-danger">
                        <i class="bi bi-exclamation-triangle fs-3 d-block mb-2"></i>
                        <div class="fw-bold">Error al conectar con la base de datos</div>
                        <small class="text-muted">${err.message}</small>
                    </td>
                </tr>
            `;
        }
    }
};

window.ovActualizarKPIs = function() {
    var viajes = window.dataGlobalOrdenesViajeModulo || [];
    var rutas = window.dataGlobalRutasModulo || [];

    var totalViajes = viajes.length;
    var totalOrdenes = rutas.length;
    var pesoIdaKg = 0;
    var pesoRetornoKg = 0;

    rutas.forEach(function(r) {
        var p = parseFloat(r.peso_total) || 0;
        if (parseInt(r.es_retorno, 10) === 1) {
            pesoRetornoKg += p;
        } else {
            pesoIdaKg += p;
        }
    });

    var kTotal = document.getElementById('ov-kpi-total');
    var kOrdenes = document.getElementById('ov-kpi-ordenes');
    var kPesoIda = document.getElementById('ov-kpi-peso-ida');
    var kPesoRetorno = document.getElementById('ov-kpi-peso-retorno');
    var badgeTotal = document.getElementById('ov-lbl-total-badge');

    if (kTotal) kTotal.textContent = totalViajes.toLocaleString();
    if (kOrdenes) kOrdenes.textContent = totalOrdenes.toLocaleString();
    if (kPesoIda) kPesoIda.textContent = (pesoIdaKg / 1000).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' TN';
    if (kPesoRetorno) kPesoRetorno.textContent = (pesoRetornoKg / 1000).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' TN';
    if (badgeTotal) badgeTotal.textContent = `${totalViajes} viajes · ${totalOrdenes} O/S`;
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

window.ovLimpiarFiltros = function() {
    var viajeEl = document.getElementById('ov-filtro-viaje');
    var qEl = document.getElementById('ov-filtro-q');
    var tramoEl = document.getElementById('ov-filtro-tramo');
    if (viajeEl) viajeEl.value = '';
    if (qEl) qEl.value = '';
    if (tramoEl) tramoEl.value = 'TODOS';
    window.ovOnFiltrar();
};

window.ovAplicarFiltros = function() {
    var viajeEl = document.getElementById('ov-filtro-viaje');
    var qEl = document.getElementById('ov-filtro-q');
    var tramoEl = document.getElementById('ov-filtro-tramo');

    var fViaje = viajeEl ? (viajeEl.value || '').trim().toUpperCase() : '';
    var q = qEl ? (qEl.value || '').trim().toUpperCase() : '';
    var tramo = tramoEl ? tramoEl.value : 'TODOS';

    if (_ovModoVistaActual === 'viajes') {
        var listaV = window.dataGlobalOrdenesViajeModulo || [];
        var filtradosV = listaV.filter(function(v) {
            // Filtro exclusivo por N° de Viaje
            if (fViaje) {
                var numViaje = (v.viaje || '').toUpperCase();
                if (!numViaje.includes(fViaje)) return false;
            }

            // Filtro general (O/S, Placa, Conductor, Rutas)
            if (q) {
                var tracto = (v.placa_tracto || '').toUpperCase();
                var carreta = (v.placa_remolque || '').toUpperCase();
                var cond = (v.conductor || '').toUpperCase();
                var ruta = (v.ruta || '').toUpperCase();
                var ords = (v.ordenes_list || '').toUpperCase();
                var ruts = (v.rutas_list || '').toUpperCase();
                var match = tracto.includes(q) || carreta.includes(q) || cond.includes(q) || ruta.includes(q) || ords.includes(q) || ruts.includes(q);
                if (!match) return false;
            }

            if (tramo === 'SOLO_IDA') {
                if ((parseFloat(v.peso_ida) || 0) <= 0 && (!v.ruta || v.ruta.toUpperCase().includes('RETORNO'))) return false;
            } else if (tramo === 'SOLO_RETORNO') {
                if ((parseFloat(v.peso_retorno) || 0) <= 0 && (!v.rutas_list || !v.rutas_list.toUpperCase().includes('RETORNO'))) return false;
            }

            return true;
        });
        window.datosFiltradosOrdenesViajeModulo = filtradosV;
    } else {
        var listaR = window.dataGlobalRutasModulo || [];
        var filtradosR = listaR.filter(function(r) {
            // Filtro exclusivo por N° de Viaje
            if (fViaje) {
                var numViaje = (r.viaje || '').toUpperCase();
                if (!numViaje.includes(fViaje)) return false;
            }

            // Filtro general (O/S, Placa, Conductor, Ruta, Tipo Servicio)
            if (q) {
                var orden = (r.orden || '').toUpperCase();
                var ruta = (r.ruta || '').toUpperCase();
                var tipoServ = (r.tipo_servicio || '').toUpperCase();
                var cond = (r.conductor || '').toUpperCase();
                var tracto = (r.placa_tracto || '').toUpperCase();
                var carreta = (r.placa_remolque || '').toUpperCase();
                var match = orden.includes(q) || ruta.includes(q) || tipoServ.includes(q) || cond.includes(q) || tracto.includes(q) || carreta.includes(q);
                if (!match) return false;
            }

            if (tramo === 'SOLO_IDA' && parseInt(r.es_retorno, 10) !== 0) return false;
            if (tramo === 'SOLO_RETORNO' && parseInt(r.es_retorno, 10) !== 1) return false;

            return true;
        });
        window.datosFiltradosOrdenesViajeModulo = filtradosR;
    }

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

    var itemLabel = _ovModoVistaActual === 'viajes' ? 'viaje' : 'orden/ruta';
    if (lblContador) lblContador.textContent = `Mostrando ${total} ${itemLabel}${total === 1 ? '' : 's'}`;
    if (infoPaginacion) infoPaginacion.textContent = `Página ${_ovPaginaActual} de ${totalPaginas} (${total} total)`;
    if (btnPrev) btnPrev.disabled = _ovPaginaActual <= 1;
    if (btnNext) btnNext.disabled = _ovPaginaActual >= totalPaginas;

    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5 text-secondary">
                    <i class="bi bi-search fs-3 d-block mb-2 text-muted"></i>
                    <div class="fw-bold">No se encontraron registros</div>
                    <small class="text-muted">Ajusta los filtros o sincroniza la información desde el botón superior.</small>
                </td>
            </tr>
        `;
        return;
    }

    var html = '';

    if (_ovModoVistaActual === 'viajes') {
        pageItems.forEach(function(v) {
            var fechaStr = '---';
            if (v.fecha_viaje) {
                // Si viene como string 'YYYY-MM-DD HH:mm:ss' o ISO
                var fVal = String(v.fecha_viaje);
                var match = fVal.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
                if (match) {
                    var y = match[1], m = match[2], d = match[3], hh = parseInt(match[4], 10), mm = match[5];
                    var ampm = hh >= 12 ? 'p. m.' : 'a. m.';
                    var hh12 = hh % 12 || 12;
                    var hhStr = hh12 < 10 ? '0' + hh12 : '' + hh12;
                    fechaStr = `${d}/${m}/${y} ${hhStr}:${mm} ${ampm}`;
                } else {
                    var dt = new Date(v.fecha_viaje);
                    fechaStr = dt.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
                }
            }

            var carretaHtml = v.placa_remolque && v.placa_remolque.trim()
                ? `<span class="ov-badge-placa ov-badge-carreta"><i class="bi bi-truck-flatbed me-1"></i>${v.placa_remolque}</span>`
                : `<span class="text-muted small fst-italic">—</span>`;

            var rutaTexto = v.rutas_list || v.ruta || 'Sin rutas registradas';
            var cantOrdenes = parseInt(v.cant_ordenes, 10) || 0;
            var ordenesBadge = cantOrdenes > 0 
                ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle me-1" style="font-size:0.75rem;">${cantOrdenes} O/S</span>`
                : '';

            var pesoIdaVal = parseFloat(v.peso_ida) || 0;
            var pesoRetornoVal = parseFloat(v.peso_retorno) || 0;
            var pesoTotalVal = parseFloat(v.peso_total_rutas) || parseFloat(v.peso) || 0;

            html += `
                <tr>
                    <td><span class="ov-badge-viaje">${v.viaje || '---'}</span></td>
                    <td><div class="fw-semibold text-secondary" style="font-size:0.83rem;"><i class="bi bi-clock-history me-1 text-muted"></i>${fechaStr}</div></td>
                    <td><span class="ov-badge-placa ov-badge-tracto"><i class="bi bi-truck me-1"></i>${v.placa_tracto || '---'}</span></td>
                    <td>${carretaHtml}</td>
                    <td><div class="fw-bold text-dark" style="font-size:0.85rem;"><i class="bi bi-person-fill text-secondary me-1"></i>${v.conductor || 'SIN CONDUCTOR'}</div></td>
                    <td>
                        <div class="d-flex align-items-center gap-1 flex-wrap">
                            ${ordenesBadge}
                            <span class="small text-secondary text-truncate" style="max-width: 280px;" title="${rutaTexto}">${rutaTexto}</span>
                        </div>
                    </td>
                    <td style="text-align: right;">
                        <span class="badge ${pesoIdaVal > 0 ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-light text-muted'} font-monospace px-2 py-1" style="font-size:0.8rem;">
                            ${pesoIdaVal > 0 ? (pesoIdaVal / 1000).toFixed(2) + ' TN' : '0.00 TN'}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <span class="badge ${pesoRetornoVal > 0 ? 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' : 'bg-light text-muted'} font-monospace px-2 py-1" style="font-size:0.8rem;">
                            ${pesoRetornoVal > 0 ? (pesoRetornoVal / 1000).toFixed(2) + ' TN' : '0.00 TN'}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <span class="badge bg-light text-dark border border-secondary-subtle font-monospace px-2 py-1 fw-bold" style="font-size:0.82rem;">
                            ${(pesoTotalVal / 1000).toFixed(2)} TN
                        </span>
                    </td>
                    <td style="text-align: center;"><span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" style="font-size:0.72rem; font-weight:700;">ACTIVO</span></td>
                </tr>
            `;
        });
    } else {
        // Modo Rutas y Órdenes de Servicio
        pageItems.forEach(function(r) {
            var esRetorno = parseInt(r.es_retorno, 10) === 1;
            var tramoBadge = esRetorno
                ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1 fw-bold" style="font-size:0.75rem;"><i class="bi bi-arrow-left me-1"></i>RETORNO</span>`
                : `<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 fw-bold" style="font-size:0.75rem;"><i class="bi bi-arrow-right me-1"></i>IDA</span>`;

            var pesoR = parseFloat(r.peso_total) || 0;
            var carretaHtml = r.placa_remolque && r.placa_remolque.trim()
                ? `<span class="ov-badge-placa ov-badge-carreta"><i class="bi bi-truck-flatbed me-1"></i>${r.placa_remolque}</span>`
                : `<span class="text-muted small fst-italic">—</span>`;

            html += `
                <tr>
                    <td><span class="ov-badge-viaje">${r.viaje || '---'}</span></td>
                    <td>
                        <span class="badge bg-light text-dark border border-secondary-subtle px-2 py-1 font-monospace fw-bold" style="font-size:0.82rem;">
                            <i class="bi bi-receipt me-1 text-primary"></i>${r.orden || '---'}
                        </span>
                    </td>
                    <td style="text-align: center;">${tramoBadge}</td>
                    <td><span class="ov-badge-placa ov-badge-tracto"><i class="bi bi-truck me-1"></i>${r.placa_tracto || '---'}</span></td>
                    <td>${carretaHtml}</td>
                    <td><div class="fw-bold text-dark small"><i class="bi bi-person-fill text-secondary me-1"></i>${r.conductor || '---'}</div></td>
                    <td><span class="fw-semibold text-dark small"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${r.ruta || '---'}</span></td>
                    <td><span class="badge bg-secondary-subtle text-secondary small text-truncate" style="max-width: 140px;">${r.tipo_servicio || 'ESTÁNDAR'}</span></td>
                    <td style="text-align: right;">
                        <span class="badge ${pesoR > 0 ? 'bg-light text-dark border border-secondary-subtle' : 'bg-light text-muted'} font-monospace px-2 py-1 fw-bold" style="font-size:0.82rem;">
                            ${pesoR > 0 ? (pesoR / 1000).toFixed(2) + ' TN' : '0.00 TN'}
                        </span>
                    </td>
                    <td style="text-align: center;"><span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" style="font-size:0.72rem; font-weight:700;">ACTIVO</span></td>
                </tr>
            `;
        });
    }

    tbody.innerHTML = html;
};

window.ovCambiarPagina = function(delta) {
    _ovPaginaActual += delta;
    window.ovRenderizarTabla();
};

window.ovEjecutarSincronizacion = async function(isSilent) {
    var btn = document.getElementById('btn-ov-sync');
    var msgEl = document.getElementById('ov-sync-status-msg');
    if (btn) {
        btn.classList.add('loading');
        btn.disabled = true;
    }
    if (msgEl) {
        msgEl.innerHTML = `<span class="text-primary d-inline-flex align-items-center gap-1"><i class="bi bi-arrow-repeat spin" style="animation: ov-spin 0.8s linear infinite;"></i> Sincronizando viajes y órdenes de servicio desde Marsisa...</span>`;
    }

    try {
        if (!isSilent && typeof window.showToastNotification === 'function') {
            window.showToastNotification('Sincronizando viajes y órdenes de servicio con el servidor...', 'info');
        }

        var res = await fetch('/api/operaciones/ordenes-viaje/sincronizar', { method: 'POST' });
        var data = await res.json();

        if (data && data.ok) {
            if (data.syncSkipped) {
                if (msgEl) {
                    msgEl.innerHTML = `<span class="text-muted d-inline-flex align-items-center gap-1"><i class="bi bi-info-circle"></i> Sincronización remota externa solo aplica para Marsisa.</span>`;
                }
                return;
            }

            await window.ovCargarDatos();

            var horaActual = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            var viajesProc = data.total_viajes_remoto || 0;
            var rutasProc = data.total_rutas_remoto || 0;

            if (msgEl) {
                msgEl.innerHTML = `<span class="text-success d-inline-flex align-items-center gap-1"><i class="bi bi-check-circle-fill"></i> Panorama completo sincronizado (${viajesProc} viajes / ${rutasProc} órdenes de ruta) · ${horaActual}</span>`;
            }

            if (typeof window.showToastNotification === 'function') {
                window.showToastNotification(`Sincronización exitosa: ${viajesProc} viajes y ${rutasProc} órdenes de ruta procesadas.`, 'success');
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
