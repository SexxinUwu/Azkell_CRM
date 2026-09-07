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
var _ovListaRutasSubFormulario = []; // Para el modal de nuevo viaje

// Formatear fecha local en formato YYYY-MM-DD
function _ovObtenerFechaHoyString() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

window.init_ordenes_viaje = function() {
    // Inicializar inputs de fechas pastel con la fecha de hoy si están vacíos
    var inputDesde = document.getElementById('ov-filtro-fecha-desde');
    var inputHasta = document.getElementById('ov-filtro-fecha-hasta');
    var hoyStr = _ovObtenerFechaHoyString();

    if (inputDesde && !inputDesde.value) inputDesde.value = hoyStr;
    if (inputHasta && !inputHasta.value) inputHasta.value = hoyStr;

    window.ovCargarDatos();
};

window.ovCambiarModoVista = function(modo) {
    if (_ovModoVistaActual === modo) return;
    _ovModoVistaActual = modo;

    var btnViajes = document.getElementById('ov-tab-viajes');
    var btnRutas = document.getElementById('ov-tab-rutas');

    if (modo === 'viajes') {
        if (btnViajes) { btnViajes.classList.add('active', 'bg-white', 'shadow-2xs'); btnViajes.classList.remove('text-secondary'); }
        if (btnRutas) { btnRutas.classList.remove('active', 'bg-white', 'shadow-2xs'); btnRutas.classList.add('text-secondary'); }
    } else {
        if (btnRutas) { btnRutas.classList.add('active', 'bg-white', 'shadow-2xs'); btnRutas.classList.remove('text-secondary'); }
        if (btnViajes) { btnViajes.classList.remove('active', 'bg-white', 'shadow-2xs'); btnViajes.classList.add('text-secondary'); }
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
                <th style="width: 130px;">N° Viaje</th>
                <th style="width: 135px;" title="Fecha y Hora de programación / salida estimada"><i class="bi bi-calendar-event me-1"></i>F. / H. Salida</th>
                <th style="width: 95px;">Tracto</th>
                <th style="width: 95px;">Carreta</th>
                <th>Conductor Asignado</th>
                <th>Órdenes y Rutas Asignadas</th>
                <th style="width: 110px; text-align: right;">Carga Ida</th>
                <th style="width: 110px; text-align: right;">Carga Retorno</th>
                <th style="width: 110px; text-align: right;">Peso Total</th>
                <th style="width: 75px; text-align: center;">Estado</th>
            </tr>
        `;
    } else {
        thead.innerHTML = `
            <tr>
                <th style="width: 125px;">N° Viaje</th>
                <th style="width: 125px;">N° Orden Serv.</th>
                <th style="width: 100px; text-align: center;">Tramo</th>
                <th style="width: 95px;">Tracto</th>
                <th style="width: 95px;">Carreta</th>
                <th>Conductor</th>
                <th>Ruta Despachada</th>
                <th style="width: 130px;">Tipo de Servicio</th>
                <th style="width: 105px; text-align: right;">Peso Carga</th>
                <th style="width: 75px; text-align: center;">Estado</th>
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
                <td colspan="10" class="text-center py-4 text-secondary">
                    <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                    <div class="small fw-semibold">Consultando base de datos del ERP...</div>
                </td>
            </tr>
        `;
    }

    try {
        var inputDesde = document.getElementById('ov-filtro-fecha-desde');
        var inputHasta = document.getElementById('ov-filtro-fecha-hasta');
        var fDesde = inputDesde ? inputDesde.value : '';
        var fHasta = inputHasta ? inputHasta.value : '';

        var qViajes = '/api/operaciones/ordenes-viaje?limit=2500';
        var qRutas = '/api/operaciones/ordenes-viaje?vista=rutas&limit=4000';

        if (fDesde) {
            qViajes += '&fecha_desde=' + encodeURIComponent(fDesde);
            qRutas += '&fecha_desde=' + encodeURIComponent(fDesde);
        }
        if (fHasta) {
            qViajes += '&fecha_hasta=' + encodeURIComponent(fHasta);
            qRutas += '&fecha_hasta=' + encodeURIComponent(fHasta);
        }

        var [resViajes, resRutas] = await Promise.all([
            fetch(qViajes),
            fetch(qRutas)
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
                    <td colspan="10" class="text-center py-4 text-danger">
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

    // Si hay viajes registrados pero sin detalle en rutas (ej. nuevo viaje creado con peso principal)
    if (pesoIdaKg === 0 && pesoRetornoKg === 0) {
        viajes.forEach(function(v) {
            var p = parseFloat(v.peso) || 0;
            pesoIdaKg += (p * 1000);
        });
    }

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

window.ovOnCambiarFecha = function() {
    window.ovCargarDatos();
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
    var inputDesde = document.getElementById('ov-filtro-fecha-desde');
    var inputHasta = document.getElementById('ov-filtro-fecha-hasta');

    if (viajeEl) viajeEl.value = '';
    if (qEl) qEl.value = '';
    if (tramoEl) tramoEl.value = 'TODOS';
    if (inputDesde) inputDesde.value = '';
    if (inputHasta) inputHasta.value = '';

    window.ovCargarDatos();
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

    if (infoPaginacion) infoPaginacion.textContent = `Página ${_ovPaginaActual} de ${totalPaginas} (${total} registros)`;
    if (btnPrev) btnPrev.disabled = _ovPaginaActual <= 1;
    if (btnNext) btnNext.disabled = _ovPaginaActual >= totalPaginas;

    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-4 text-secondary">
                    <i class="bi bi-inbox fs-3 d-block mb-1 text-muted"></i>
                    <div class="fw-bold" style="font-size:0.85rem;">No se encontraron viajes para los filtros seleccionados</div>
                    <small class="text-muted" style="font-size:0.75rem;">Modifica el rango de fechas o haz clic en "Registrar Nuevo Viaje".</small>
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

            var rutaTexto = v.rutas_list || v.ruta || 'Sin ruta especificada';
            var cantOrdenes = parseInt(v.cant_ordenes, 10) || 0;
            var ordenesBadge = cantOrdenes > 0 
                ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle me-1" style="font-size:0.7rem;">${cantOrdenes} O/S</span>`
                : '';

            var pesoIdaVal = parseFloat(v.peso_ida) || 0;
            var pesoRetornoVal = parseFloat(v.peso_retorno) || 0;
            var pesoTotalVal = parseFloat(v.peso_total_rutas) || (parseFloat(v.peso) ? parseFloat(v.peso) * 1000 : 0);

            html += `
                <tr>
                    <td><span class="ov-badge-viaje">${v.viaje || '---'}</span></td>
                    <td><div class="fw-semibold text-secondary" style="font-size:0.78rem;"><i class="bi bi-clock-history me-1 text-muted"></i>${fechaStr}</div></td>
                    <td><span class="ov-badge-placa ov-badge-tracto"><i class="bi bi-truck me-1"></i>${v.placa_tracto || '---'}</span></td>
                    <td>${carretaHtml}</td>
                    <td><div class="fw-bold text-dark" style="font-size:0.8rem;"><i class="bi bi-person-fill text-secondary me-1"></i>${v.conductor || 'SIN CONDUCTOR'}</div></td>
                    <td>
                        <div class="d-flex align-items-center gap-1 flex-wrap">
                            ${ordenesBadge}
                            <span class="small text-secondary text-truncate" style="max-width: 250px;" title="${rutaTexto}">${rutaTexto}</span>
                        </div>
                    </td>
                    <td style="text-align: right;">
                        <span class="badge ${pesoIdaVal > 0 ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-light text-muted'} font-monospace px-2 py-1" style="font-size:0.76rem;">
                            ${pesoIdaVal > 0 ? (pesoIdaVal / 1000).toFixed(2) + ' TN' : '0.00 TN'}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <span class="badge ${pesoRetornoVal > 0 ? 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' : 'bg-light text-muted'} font-monospace px-2 py-1" style="font-size:0.76rem;">
                            ${pesoRetornoVal > 0 ? (pesoRetornoVal / 1000).toFixed(2) + ' TN' : '0.00 TN'}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <span class="badge bg-light text-dark border border-secondary-subtle font-monospace px-2 py-1 fw-bold" style="font-size:0.78rem;">
                            ${(pesoTotalVal / 1000).toFixed(2)} TN
                        </span>
                    </td>
                    <td style="text-align: center;"><span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" style="font-size:0.7rem; font-weight:700;">${v.estado || 'ACTIVO'}</span></td>
                </tr>
            `;
        });
    } else {
        // Modo Rutas y Órdenes de Servicio
        pageItems.forEach(function(r) {
            var esRetorno = parseInt(r.es_retorno, 10) === 1;
            var tramoBadge = esRetorno
                ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1 fw-bold" style="font-size:0.7rem;"><i class="bi bi-arrow-left me-1"></i>RETORNO</span>`
                : `<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 fw-bold" style="font-size:0.7rem;"><i class="bi bi-arrow-right me-1"></i>IDA</span>`;

            var pesoR = parseFloat(r.peso_total) || 0;
            var carretaHtml = r.placa_remolque && r.placa_remolque.trim()
                ? `<span class="ov-badge-placa ov-badge-carreta"><i class="bi bi-truck-flatbed me-1"></i>${r.placa_remolque}</span>`
                : `<span class="text-muted small fst-italic">—</span>`;

            html += `
                <tr>
                    <td><span class="ov-badge-viaje">${r.viaje || '---'}</span></td>
                    <td>
                        <span class="badge bg-light text-dark border border-secondary-subtle px-2 py-1 font-monospace fw-bold" style="font-size:0.78rem;">
                            <i class="bi bi-receipt me-1 text-primary"></i>${r.orden || '---'}
                        </span>
                    </td>
                    <td style="text-align: center;">${tramoBadge}</td>
                    <td><span class="ov-badge-placa ov-badge-tracto"><i class="bi bi-truck me-1"></i>${r.placa_tracto || '---'}</span></td>
                    <td>${carretaHtml}</td>
                    <td><div class="fw-bold text-dark small"><i class="bi bi-person-fill text-secondary me-1"></i>${r.conductor || '---'}</div></td>
                    <td><span class="fw-semibold text-dark small"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${r.ruta || '---'}</span></td>
                    <td><span class="badge bg-secondary-subtle text-secondary small text-truncate" style="max-width: 140px;">${r.tipo_servicio || 'CARGA GENERAL'}</span></td>
                    <td style="text-align: right;">
                        <span class="badge ${pesoR > 0 ? 'bg-light text-dark border border-secondary-subtle' : 'bg-light text-muted'} font-monospace px-2 py-1 fw-bold" style="font-size:0.78rem;">
                            ${pesoR > 0 ? (pesoR / 1000).toFixed(2) + ' TN' : '0.00 TN'}
                        </span>
                    </td>
                    <td style="text-align: center;"><span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" style="font-size:0.7rem; font-weight:700;">${r.estado || 'ACTIVO'}</span></td>
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

// ── GESTIÓN DEL MODAL NUEVO VIAJE ───────────────────────────────────
window.ovAbrirModalNuevoViaje = async function() {
    _ovListaRutasSubFormulario = [];
    window.ovRenderizarSubRutas();

    var form = document.getElementById('ovFormNuevoViaje');
    if (form) form.reset();

    // Resetear a la primera pestaña
    var firstTab = document.getElementById('ov-tab-orden-viaje-btn');
    if (firstTab && typeof bootstrap !== 'undefined' && bootstrap.Tab) {
        new bootstrap.Tab(firstTab).show();
    }

    // Establecer fecha y hora actual en el input
    var inputFecha = document.getElementById('ov-form-fecha');
    if (inputFecha) {
        var now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        inputFecha.value = now.toISOString().slice(0, 16);
    }

    // Cargar correlativo desde el backend
    try {
        var resCorrelativo = await fetch('/api/operaciones/ordenes-viaje/correlativo');
        var jsonCorrelativo = await resCorrelativo.json();
        if (jsonCorrelativo && jsonCorrelativo.ok) {
            var serieEl = document.getElementById('ov-form-serie');
            var numeroEl = document.getElementById('ov-form-numero');
            if (serieEl) serieEl.value = jsonCorrelativo.serie;
            if (numeroEl) numeroEl.value = jsonCorrelativo.numero;
        }
    } catch(err) {
        console.warn('No se pudo cargar correlativo automático:', err);
    }

    // Cargar listas de conductores y vehículos
    window.ovCargarCombosFormulario();

    // Mostrar modal
    var modalEl = document.getElementById('ovModalNuevoViaje');
    if (modalEl && typeof bootstrap !== 'undefined') {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
};

window.ovCargarCombosFormulario = async function() {
    try {
        var [resPlacas, resConductores] = await Promise.all([
            fetch('/api/placas-lista').then(r => r.ok ? r.json() : []).catch(() => []),
            fetch('/api/conductores-lista').then(r => r.ok ? r.json() : []).catch(() => [])
        ]);

        var selTracto = document.getElementById('ov-form-tracto');
        var selRemolque = document.getElementById('ov-form-remolque');
        var selCond = document.getElementById('ov-form-conductor');

        if (selTracto) {
            selTracto.innerHTML = '<option value="">Seleccione...</option>';
            var tractos = (resPlacas || []).filter(p => !p.tipo || p.tipo.toUpperCase().includes('TRACTO') || p.tipo.toUpperCase().includes('REMOLCADOR') || !p.tipo.toUpperCase().includes('SEMI'));
            (tractos.length ? tractos : resPlacas).forEach(function(p) {
                var opt = document.createElement('option');
                opt.value = p.placa;
                opt.textContent = `${p.placa} ${p.marca ? '· ' + p.marca : ''} ${p.modelo ? '· ' + p.modelo : ''}`;
                selTracto.appendChild(opt);
            });
        }

        if (selRemolque) {
            selRemolque.innerHTML = '<option value="">Seleccione...</option>';
            var remolques = (resPlacas || []).filter(p => p.tipo && (p.tipo.toUpperCase().includes('SEMI') || p.tipo.toUpperCase().includes('REMOLQUE') || p.tipo.toUpperCase().includes('CARRETA')));
            (remolques.length ? remolques : resPlacas).forEach(function(p) {
                var opt = document.createElement('option');
                opt.value = p.placa;
                opt.textContent = `${p.placa} ${p.marca ? '· ' + p.marca : ''}`;
                selRemolque.appendChild(opt);
            });
        }

        if (selCond) {
            selCond.innerHTML = '<option value="">Seleccione...</option>';
            (resConductores || []).forEach(function(c) {
                var opt = document.createElement('option');
                var nombreCompleto = c.nombre_completo || c.nombres || c.conductor || (c.apellidos ? `${c.apellidos}, ${c.nombres}` : 'Conductor');
                opt.value = nombreCompleto;
                opt.dataset.idConductor = c.id || '';
                opt.textContent = `${nombreCompleto} ${c.dni ? '· ' + c.dni : ''}`;
                selCond.appendChild(opt);
            });
        }
    } catch(err) {
        console.warn('Error cargando combos para el formulario de viaje:', err);
    }
};

window.ovAgregarFilaRuta = function() {
    var osEl = document.getElementById('ov-form-nueva-os');
    var rutaEl = document.getElementById('ov-form-nueva-ruta-sub');
    var pesoEl = document.getElementById('ov-form-nuevo-peso-sub');

    var os = osEl ? (osEl.value || '').trim().toUpperCase() : '';
    var r = rutaEl ? (rutaEl.value || '').trim().toUpperCase() : '';
    var p = pesoEl ? parseFloat(pesoEl.value) || 0 : 0;

    if (!os) {
        alert('Por favor ingrese el número de Orden de Servicio o Guía.');
        return;
    }

    _ovListaRutasSubFormulario.push({
        orden: os,
        ruta: r,
        peso_total: p * 1000, // guardar en kg para coherencia
        peso_tn: p,
        tipo_servicio: 'CARGA GENERAL',
        es_retorno: 0
    });

    if (osEl) osEl.value = '';
    if (rutaEl) rutaEl.value = '';
    if (pesoEl) pesoEl.value = '';

    window.ovRenderizarSubRutas();
};

window.ovEliminarFilaRuta = function(idx) {
    _ovListaRutasSubFormulario.splice(idx, 1);
    window.ovRenderizarSubRutas();
};

window.ovRenderizarSubRutas = function() {
    var tbody = document.getElementById('ov-form-rutas-tbody');
    if (!tbody) return;

    if (_ovListaRutasSubFormulario.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No hay órdenes secundarias vinculadas aún.</td></tr>`;
        return;
    }

    var html = '';
    _ovListaRutasSubFormulario.forEach(function(item, idx) {
        html += `
            <tr>
                <td class="fw-bold text-dark font-monospace">${item.orden}</td>
                <td>${item.ruta || '<span class="text-muted fst-italic">—</span>'}</td>
                <td class="text-end fw-bold">${(item.peso_tn || (item.peso_total / 1000)).toFixed(2)} TN</td>
                <td class="text-center">
                    <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 rounded-2" onclick="window.ovEliminarFilaRuta(${idx})" title="Quitar">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
};

window.ovGuardarNuevoViaje = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var serie = (document.getElementById('ov-form-serie') || {}).value || new Date().getFullYear();
    var numero = (document.getElementById('ov-form-numero') || {}).value || '00000001';
    var fechaVal = (document.getElementById('ov-form-fecha') || {}).value || '';
    var tracto = (document.getElementById('ov-form-tracto') || {}).value || '';
    var remolque = (document.getElementById('ov-form-remolque') || {}).value || '';
    var selCond = document.getElementById('ov-form-conductor');
    var conductor = selCond ? selCond.value : '';
    var idConductor = selCond && selCond.selectedOptions[0] ? selCond.selectedOptions[0].dataset.idConductor : null;
    var ruta = (document.getElementById('ov-form-ruta') || {}).value || '';
    var cantidad = parseFloat((document.getElementById('ov-form-cantidad') || {}).value) || 0;
    var ubigeoPartida = (document.getElementById('ov-form-ubigeo-partida') || {}).value || '';
    var dirPartida = (document.getElementById('ov-form-dir-partida') || {}).value || '';
    var ubigeoLlegada = (document.getElementById('ov-form-ubigeo-llegada') || {}).value || '';
    var dirLlegada = (document.getElementById('ov-form-dir-llegada') || {}).value || '';
    var observaciones = (document.getElementById('ov-form-observaciones') || {}).value || '';
    var escolta = (document.getElementById('ov-form-escolta') || {}).value || '';

    if (!tracto || !conductor || !ruta) {
        alert('Por favor complete los campos obligatorios: Conductor, Vehículo (Tracto) y Ruta.');
        return;
    }

    var payload = {
        serie,
        numero,
        viaje: `${serie}-${numero}`,
        fecha_viaje: fechaVal ? fechaVal.replace('T', ' ') + ':00' : null,
        id_conductor: idConductor,
        conductor,
        placa_tracto: tracto,
        placa_remolque: remolque,
        ruta,
        peso: cantidad,
        ubigeo_partida: ubigeoPartida,
        direccion_partida: dirPartida,
        ubigeo_llegada: ubigeoLlegada,
        direccion_llegada: dirLlegada,
        observaciones,
        escolta,
        rutas: _ovListaRutasSubFormulario
    };

    try {
        var res = await fetch('/api/operaciones/ordenes-viaje', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var data = await res.json();

        if (data && data.ok) {
            if (typeof window.showToastNotification === 'function') {
                window.showToastNotification(data.message || 'Orden de viaje registrada con éxito.', 'success');
            } else {
                alert(data.message || 'Orden de viaje registrada correctamente.');
            }

            var modalEl = document.getElementById('ovModalNuevoViaje');
            if (modalEl && typeof bootstrap !== 'undefined') {
                var modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            // Recargar datos y mantener en la vista
            await window.ovCargarDatos();
        } else {
            throw new Error((data && data.error) || 'Error al guardar la orden de viaje.');
        }
    } catch(err) {
        console.error('Error guardando orden de viaje:', err);
        alert('Error: ' + err.message);
    }
};
