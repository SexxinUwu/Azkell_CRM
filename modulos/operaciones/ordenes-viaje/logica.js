// ================================================================
// 🚍 MÓDULO: ÓRDENES DE VIAJE — LÓGICA (OPERACIONES)
// ================================================================

window.dataGlobalOrdenesViajeModulo = [];
window.dataGlobalRutasModulo = [];
window.datosFiltradosOrdenesViajeModulo = [];
window._ovViajesGlobal = window._ovViajesGlobal || [];
window._ovRutasGlobal = window._ovRutasGlobal || [];
var _ovViajesGlobal = window._ovViajesGlobal;
var _ovRutasGlobal = window._ovRutasGlobal;
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
        if (btnViajes) btnViajes.classList.add('active');
        if (btnRutas) btnRutas.classList.remove('active');
    } else {
        if (btnRutas) btnRutas.classList.add('active');
        if (btnViajes) btnViajes.classList.remove('active');
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
                <th style="min-width: 90px;">ACCIÓN <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 110px;">OPERACIÓN <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 100px;">ESTADO <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 170px;">CONFIRMACION CONDUCTOR <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 155px;">FECHA <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 155px;">VIAJE <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 165px;">CONFIRMACION CARGA <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 95px; text-align:center;"># SERVICIOS <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 80px; text-align:center;"># GRET <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 160px; text-align: right;">PESO TOTAL SEGUN GRET <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 95px;">SERVICIO <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 105px;">VEHICULO <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 125px;">SEMIRREMOLQUE <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 120px; text-align:center;">MÁXIMO CARGA <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 220px;">CONDUCTOR <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 220px;">USUARIO CREACIÓN <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 165px;">FECHA HORA REGISTRO <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 120px; text-align:center;"># CONDUCTORES <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 140px;">CONDUCTORES <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 110px;">FECHA INICIO <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 110px;">FECHA FIN <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 130px;">DURACIÓN DE VIAJE <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
                <th style="min-width: 145px;">MOTIVO ANULACIÓN <span class="ov-sort-arrow"><i class="bi bi-arrow-down-up"></i></span></th>
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
        window._ovViajesGlobal = window.dataGlobalOrdenesViajeModulo;
        window._ovRutasGlobal = window.dataGlobalRutasModulo;
        _ovViajesGlobal = window._ovViajesGlobal;
        _ovRutasGlobal = window._ovRutasGlobal;

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
            // 1. Fechas y Timestamps
            var fechaStr = '---';
            var fechaInicioStr = '';
            var fechaFinStr = '';
            var duracionStr = '0 días';

            if (v.fecha_viaje) {
                var dt = new Date(v.fecha_viaje);
                if (!isNaN(dt.getTime())) {
                    var d = String(dt.getDate()).padStart(2, '0');
                    var m = String(dt.getMonth() + 1).padStart(2, '0');
                    var y = dt.getFullYear();
                    var hh = String(dt.getHours()).padStart(2, '0');
                    var mm = String(dt.getMinutes()).padStart(2, '0');
                    var ss = String(dt.getSeconds()).padStart(2, '0');
                    fechaStr = `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
                    fechaInicioStr = `${d}/${m}/${y}`;
                }
            }

            var fechaRegistroStr = '---';
            if (v.fecha_registro || v.creado_en) {
                var dtReg = new Date(v.fecha_registro || v.creado_en);
                if (!isNaN(dtReg.getTime())) {
                    var dR = String(dtReg.getDate()).padStart(2, '0');
                    var mR = String(dtReg.getMonth() + 1).padStart(2, '0');
                    var yR = dtReg.getFullYear();
                    var hhR = String(dtReg.getHours()).padStart(2, '0');
                    var mmR = String(dtReg.getMinutes()).padStart(2, '0');
                    var ssR = String(dtReg.getSeconds()).padStart(2, '0');
                    fechaRegistroStr = `${dR}/${mR}/${yR} ${hhR}:${mmR}:${ssR}`;
                }
            }

            var estadoUpper = (v.estado || 'REGISTRADO').toUpperCase();
            var esFinalizado = estadoUpper === 'FINALIZADO';
            var esIniciado = estadoUpper === 'INICIADO';
            var esRegistrado = !esFinalizado && !esIniciado;

            if (esFinalizado && fechaInicioStr) {
                fechaFinStr = fechaInicioStr;
            }

            // 2. Estado Badge
            var estadoBadge = '';
            if (esFinalizado) {
                estadoBadge = `<span class="ov-badge-status-finalizado">FINALIZADO</span>`;
            } else if (esIniciado) {
                estadoBadge = `<span class="ov-badge-status-iniciado">INICIADO</span>`;
            } else {
                estadoBadge = `<span class="ov-badge-status-registrado">Registrado</span>`;
            }

            // 3. Operación
            var operacionHtml = '';
            var viajeEsc = (v.viaje || '').replace(/"/g, '&quot;');
            if (esRegistrado) {
                operacionHtml = `<button type="button" class="ov-btn-iniciar" onclick="window.ovAbrirModalIniciarViaje('${viajeEsc}')"><i class="bi bi-play-fill fs-6"></i> INICIAR</button>`;
            } else if (esIniciado) {
                operacionHtml = `<button type="button" class="ov-btn-finalizar"><i class="bi bi-flag-fill"></i> FINALIZAR</button>`;
            }

            // 4. Servicios y Gret
            var cantServicios = parseInt(v.cant_ordenes, 10) || 1;
            var cantGret = v.cant_gret != null ? parseInt(v.cant_gret, 10) : 0;
            var gretBadge = cantGret > 0
                ? `<span class="ov-badge-count-red">${cantGret}</span>`
                : `<span class="ov-badge-count-red">0</span>`;

            // 5. Peso Gret
            var pesoTotalVal = parseFloat(v.peso_total_rutas) || (parseFloat(v.peso) ? parseFloat(v.peso) * 1000 : 0);
            var pesoGretTxt = pesoTotalVal > 0 ? (pesoTotalVal).toFixed(3) + ' KG' : '';

            // 6. Placas
            var vehiculo = v.placa_tracto || '';
            var semirremolque = v.placa_remolque || '';

            // 7. Conductor y Usuario
            var conductorNombre = (v.conductor || '').toUpperCase();
            var usuarioCreacion = (v.usuario_creacion || v.usuario || 'ADMINISTRADOR DEL SISTEMA').toUpperCase();

            html += `
                <tr>
                    <!-- 1. ACCIÓN -->
                    <td>
                        <button type="button" class="ov-btn-action-edit" onclick="window.ovAbrirModalEditarViaje('${v.viaje}')">
                            EDITAR <i class="bi bi-chevron-down" style="font-size:0.65rem;"></i>
                        </button>
                    </td>

                    <!-- 2. OPERACIÓN -->
                    <td>${operacionHtml}</td>

                    <!-- 3. ESTADO -->
                    <td>${estadoBadge}</td>

                    <!-- 4. CONFIRMACIÓN CONDUCTOR -->
                    <td><span class="ov-badge-confirm-pill">CONFIRMACION - PENDIENTE</span></td>

                    <!-- 5. FECHA -->
                    <td class="font-monospace text-secondary" style="font-size:0.77rem;">${fechaStr}</td>

                    <!-- 6. VIAJE -->
                    <td>
                        <a href="javascript:void(0)" class="ov-btn-viaje-eye" title="Ver monitoreo detallado del viaje" onclick="window.ovAbrirModalMonitoreoViaje('${v.viaje}')">
                            <i class="bi bi-eye"></i> ${v.viaje || '---'}
                        </a>
                    </td>

                    <!-- 7. CONFIRMACIÓN CARGA -->
                    <td><span class="ov-badge-confirm-pill">CONFIRMACION - PENDIENTE</span></td>

                    <!-- 8. # SERVICIOS -->
                    <td style="text-align: center;"><span class="ov-badge-count-gray">${cantServicios}</span></td>

                    <!-- 9. # GRET -->
                    <td style="text-align: center;">${gretBadge}</td>

                    <!-- 10. PESO TOTAL SEGÚN GRET -->
                    <td style="text-align: right;" class="font-monospace fw-bold text-dark" style="font-size:0.78rem;">${pesoGretTxt}</td>

                    <!-- 11. SERVICIO -->
                    <td class="fw-semibold text-secondary" style="font-size:0.77rem;">PROPIO</td>

                    <!-- 12. VEHÍCULO (TRACTO) -->
                    <td class="fw-bold text-dark font-monospace" style="font-size:0.8rem;">${vehiculo}</td>

                    <!-- 13. SEMIRREMOLQUE (CARRETA) -->
                    <td class="fw-bold text-dark font-monospace" style="font-size:0.8rem;">${semirremolque}</td>

                    <!-- 14. MÁXIMO CARGA -->
                    <td style="text-align: center;"><span class="ov-badge-max-carga">NaN M3 MÁXIMO</span></td>

                    <!-- 15. CONDUCTOR -->
                    <td class="fw-semibold text-dark" style="font-size:0.78rem;">${conductorNombre}</td>

                    <!-- 16. USUARIO CREACIÓN -->
                    <td class="text-secondary fw-medium" style="font-size:0.76rem;">${usuarioCreacion}</td>

                    <!-- 17. FECHA HORA REGISTRO -->
                    <td class="font-monospace text-secondary" style="font-size:0.77rem;">${fechaRegistroStr}</td>

                    <!-- 18. # CONDUCTORES -->
                    <td style="text-align: center;"><span class="ov-badge-count-red">0</span></td>

                    <!-- 19. CONDUCTORES -->
                    <td></td>

                    <!-- 20. FECHA INICIO -->
                    <td class="font-monospace text-secondary" style="font-size:0.77rem;">${fechaInicioStr}</td>

                    <!-- 21. FECHA FIN -->
                    <td class="font-monospace text-secondary" style="font-size:0.77rem;">${fechaFinStr}</td>

                    <!-- 22. DURACIÓN DE VIAJE -->
                    <td class="text-secondary fw-semibold" style="font-size:0.76rem;">${duracionStr}</td>

                    <!-- 23. MOTIVO ANULACIÓN -->
                    <td class="text-muted small">${v.motivo_anulacion || ''}</td>
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
                    <td>
                        <a href="javascript:void(0)" class="ov-btn-viaje-eye" onclick="window.ovAbrirModalMonitoreoViaje('${r.viaje}')" title="Ver monitoreo del viaje">
                            <i class="bi bi-eye"></i> ${r.viaje || '---'}
                        </a>
                    </td>
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
    // Resetear formulario
    var form = document.getElementById('ovFormNuevoViaje');
    if (form) form.reset();
    _ovListaRutasSubFormulario = [];

    var editIdEl = document.getElementById('ov-form-edit-id');
    if (editIdEl) editIdEl.value = '';
    var modalTitleEl = document.getElementById('ovModalNuevoViajeLabel');
    if (modalTitleEl) {
        modalTitleEl.innerHTML = `<i class="bi bi-truck text-primary"></i> <span>Nueva Orden de Viaje</span> <span class="text-muted fw-normal fs-6" id="ov-header-folio-badge">N° Operacional</span>`;
    }

    // Establecer fecha y hora actual en el input
    var inputFecha = document.getElementById('ov-form-fecha');
    if (inputFecha) {
        var now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        inputFecha.value = now.toISOString().slice(0, 16);
    }

    var inputCantidad = document.getElementById('ov-form-cantidad');
    if (inputCantidad) inputCantidad.value = '0.00';

    // Limpiar inputs de texto y hidden de los buscadores
    ['ov-form-conductor', 'ov-form-tracto', 'ov-form-remolque'].forEach(function(id) {
        var txt = document.getElementById(id + '-txt');
        var hid = document.getElementById(id);
        if (txt) txt.value = '';
        if (hid) hid.value = '';
    });

    // Cargar correlativo desde el backend
    try {
        var resCorrelativo = await fetch('/api/operaciones/ordenes-viaje/correlativo');
        var jsonCorrelativo = await resCorrelativo.json();
        if (jsonCorrelativo && jsonCorrelativo.ok) {
            var serieEl = document.getElementById('ov-form-serie');
            var numeroEl = document.getElementById('ov-form-numero');
            if (serieEl) serieEl.value = jsonCorrelativo.serie;
            if (numeroEl) numeroEl.value = jsonCorrelativo.numero;
            var badgeEl = document.getElementById('ov-header-folio-badge');
            if (badgeEl) badgeEl.textContent = `N° ${jsonCorrelativo.serie}-${jsonCorrelativo.numero}`;
        }
    } catch(err) {
        console.warn('No se pudo cargar correlativo automático:', err);
    }

    // Cargar listas de conductores y vehículos
    await window.ovCargarCombosFormulario();

    // Mostrar modal
    var modalEl = document.getElementById('ovModalNuevoViaje');
    if (modalEl && typeof bootstrap !== 'undefined') {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
};

// ── EDITAR ORDEN DE VIAJE EXISTENTE ──────────────────────────────────
window.ovAbrirModalEditarViaje = async function(viajeCode) {
    if (!viajeCode) return;

    var listaViajes = window._ovViajesGlobal || (typeof _ovViajesGlobal !== 'undefined' ? _ovViajesGlobal : []) || window.dataGlobalOrdenesViajeModulo || [];
    var item = listaViajes.find(x => x.viaje === viajeCode);
    if (!item) {
        alert('No se encontraron los datos del viaje seleccionado.');
        return;
    }

    // Resetear formulario
    var form = document.getElementById('ovFormNuevoViaje');
    if (form) form.reset();
    _ovListaRutasSubFormulario = [];

    // Marcar que estamos editando
    var editIdEl = document.getElementById('ov-form-edit-id');
    if (editIdEl) editIdEl.value = viajeCode;

    var modalTitleEl = document.getElementById('ovModalNuevoViajeLabel');
    if (modalTitleEl) {
        modalTitleEl.innerHTML = `<i class="bi bi-pencil-square text-primary"></i> <span>Editar Orden de Viaje</span> <span class="badge bg-primary-subtle text-primary border border-primary-subtle fs-6" id="ov-header-folio-badge">${viajeCode}</span>`;
    }

    // Serie y Número a partir del viajeCode (EJ: 2026-00000967)
    var partes = viajeCode.split('-');
    var serie = partes[0] || '';
    var numero = partes[1] || '';

    var serieEl = document.getElementById('ov-form-serie');
    var numeroEl = document.getElementById('ov-form-numero');
    if (serieEl) serieEl.value = serie;
    if (numeroEl) numeroEl.value = numero;

    // Fecha del viaje
    var inputFecha = document.getElementById('ov-form-fecha');
    if (inputFecha) {
        if (item.fecha_viaje) {
            try {
                var d = new Date(item.fecha_viaje);
                if (!isNaN(d.getTime())) {
                    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                    inputFecha.value = d.toISOString().slice(0, 16);
                } else {
                    inputFecha.value = item.fecha_viaje.slice(0, 16);
                }
            } catch(e) {
                inputFecha.value = '';
            }
        } else {
            var now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            inputFecha.value = now.toISOString().slice(0, 16);
        }
    }

    // Cargar combos antes de setear valores
    await window.ovCargarCombosFormulario();

    // Setear Conductor
    var condVal = item.conductor || '';
    var condTxt = document.getElementById('ov-form-conductor-txt');
    var condHid = document.getElementById('ov-form-conductor');
    if (condTxt) condTxt.value = condVal;
    if (condHid) {
        condHid.value = condVal;
        condHid.dataset.idConductor = item.id_conductor || '';
    }

    // Setear Tracto
    var tractoVal = item.placa_tracto || '';
    var tractoTxt = document.getElementById('ov-form-tracto-txt');
    var tractoHid = document.getElementById('ov-form-tracto');
    if (tractoTxt) tractoTxt.value = tractoVal;
    if (tractoHid) tractoHid.value = tractoVal;

    // Setear Remolque / Carreta
    var remolqueVal = item.placa_remolque || '';
    var remolqueTxt = document.getElementById('ov-form-remolque-txt');
    var remolqueHid = document.getElementById('ov-form-remolque');
    if (remolqueTxt) remolqueTxt.value = remolqueVal;
    if (remolqueHid) remolqueHid.value = remolqueVal;

    // Ruta
    var rutaEl = document.getElementById('ov-form-ruta');
    if (rutaEl) rutaEl.value = item.ruta || '';

    // Cantidad / Peso
    var cantEl = document.getElementById('ov-form-cantidad');
    if (cantEl) cantEl.value = parseFloat(item.peso || 0).toFixed(2);

    // Ubigeo y Direcciones
    var uPart = document.getElementById('ov-form-ubigeo-partida');
    if (uPart) uPart.value = item.ubigeo_partida || '';
    var dPart = document.getElementById('ov-form-dir-partida');
    if (dPart) dPart.value = item.direccion_partida || '';
    var uLleg = document.getElementById('ov-form-ubigeo-llegada');
    if (uLleg) uLleg.value = item.ubigeo_llegada || '';
    var dLleg = document.getElementById('ov-form-dir-llegada');
    if (dLleg) dLleg.value = item.direccion_llegada || '';

    // Observaciones y Escolta
    var obsEl = document.getElementById('ov-form-observaciones');
    if (obsEl) obsEl.value = item.observaciones || '';
    var escEl = document.getElementById('ov-form-escolta');
    if (escEl) escEl.value = item.escolta || '';

    // Abrir modal flotante
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

        // Si conductores-lista viene vacío, intentar con /api/conductores
        if (!resConductores || !resConductores.length) {
            try {
                var rCondAlt = await fetch('/api/conductores');
                if (rCondAlt.ok) {
                    var jCondAlt = await rCondAlt.json();
                    resConductores = Array.isArray(jCondAlt) ? jCondAlt : (jCondAlt.data || []);
                }
            } catch(e) {}
        }

        var tractos = [];
        var carretas = [];

        (resPlacas || []).forEach(function(p) {
            var placa = (p.placa || p[0] || '').toString().trim();
            if (!placa) return;
            var tipo = (p.tipo || p[5] || '').toString().trim().toUpperCase();
            var desc = `${placa}${p.marca ? ' · ' + p.marca : ''}`;

            if (tipo.includes('CARRETA') || tipo.includes('SEMI') || tipo.includes('REMOLQUE')) {
                carretas.push({ value: placa, label: desc });
            } else {
                tractos.push({ value: placa, label: desc });
            }
        });

        if (!tractos.length && resPlacas.length) {
            tractos = resPlacas.map(p => ({ value: p.placa || p[0], label: p.placa || p[0] }));
        }

        var conductores = [];
        var condMap = new Set();
        (resConductores || []).forEach(function(c) {
            var nombreCompleto = '';
            if (typeof c === 'string') {
                nombreCompleto = c;
            } else if (c) {
                nombreCompleto = c.nombre || c.nombres_apellidos || c.nombre_completo || c.conductor || c.nombre_conductor || (c.apellidos ? `${c.apellidos}, ${c.nombres}` : '');
            }
            nombreCompleto = String(nombreCompleto).trim();
            if (!nombreCompleto || condMap.has(nombreCompleto.toUpperCase())) return;
            condMap.add(nombreCompleto.toUpperCase());
            var label = `${nombreCompleto}${c && c.dni ? ' · ' + c.dni : ''}`;
            conductores.push({ value: nombreCompleto, label: label, idConductor: (c && c.id) || (c && c.idConductor) || '' });
        });

        conductores.sort((a, b) => a.value.localeCompare(b.value));

        if (typeof window._cbInit === 'function') {
            window._cbInit('ov-form-conductor', conductores, 'SELECCIONE CONDUCTOR...');
            window._cbInit('ov-form-tracto', tractos, 'SELECCIONE TRACTO...');
            window._cbInit('ov-form-remolque', carretas, 'SELECCIONE CARRETA...');

            if (typeof window._cbOnSelect === 'function') {
                window._cbOnSelect('ov-form-conductor', function(val, lbl) {
                    var hid = document.getElementById('ov-form-conductor');
                    if (hid) {
                        hid.value = val;
                        var matched = conductores.find(c => c.value === val);
                        hid.dataset.idConductor = (matched && matched.idConductor) || '';
                    }
                });
                window._cbOnSelect('ov-form-tracto', function(val, lbl) {
                    var hid = document.getElementById('ov-form-tracto');
                    if (hid) hid.value = val;
                });
                window._cbOnSelect('ov-form-remolque', function(val, lbl) {
                    var hid = document.getElementById('ov-form-remolque');
                    if (hid) hid.value = val;
                });
            }
        }
    } catch(err) {
        console.warn('Error cargando combos para el formulario de viaje:', err);
    }
};

window.ovGuardarNuevoViaje = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var serie = (document.getElementById('ov-form-serie') || {}).value || new Date().getFullYear();
    var numero = (document.getElementById('ov-form-numero') || {}).value || '00000001';
    var fechaVal = (document.getElementById('ov-form-fecha') || {}).value || '';
    
    // Obtener valores desde hidden o directamente desde el texto si el usuario tipeó
    var tracto = (document.getElementById('ov-form-tracto') || {}).value || (document.getElementById('ov-form-tracto-txt') || {}).value || '';
    var remolque = (document.getElementById('ov-form-remolque') || {}).value || (document.getElementById('ov-form-remolque-txt') || {}).value || '';
    var selCond = document.getElementById('ov-form-conductor');
    var conductor = (selCond ? selCond.value : '') || (document.getElementById('ov-form-conductor-txt') || {}).value || '';
    var idConductor = selCond ? selCond.dataset.idConductor : null;
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

    var editId = (document.getElementById('ov-form-edit-id') || {}).value || '';
    var esEdicion = Boolean(editId);

    var payload = {
        serie,
        numero,
        viaje: esEdicion ? editId : `${serie}-${numero}`,
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
        var url = esEdicion 
            ? `/api/operaciones/ordenes-viaje/${encodeURIComponent(editId)}` 
            : '/api/operaciones/ordenes-viaje';
        var method = esEdicion ? 'PUT' : 'POST';

        var res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var data = await res.json();

        if (data && data.ok) {
            if (typeof window.showToastNotification === 'function') {
                window.showToastNotification(data.message || (esEdicion ? 'Orden de viaje actualizada con éxito.' : 'Orden de viaje registrada con éxito.'), 'success');
            } else {
                alert(data.message || (esEdicion ? 'Orden de viaje actualizada correctamente.' : 'Orden de viaje registrada correctamente.'));
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

// ── GESTIÓN DEL MODAL INICIAR VIAJE (DISEÑO B) ──────────────────────
window.ovAbrirModalIniciarViaje = function(viajeCode) {
    var lblViaje = document.getElementById('ov-iniciar-modal-viaje-num');
    var inputId = document.getElementById('ov-iniciar-viaje-id');
    var inputFecha = document.getElementById('ov-iniciar-fecha');
    var inputKm = document.getElementById('ov-iniciar-km');
    var checkConfirm = document.getElementById('ov-iniciar-check-confirm');

    if (lblViaje) lblViaje.textContent = viajeCode || '---';
    if (inputId) inputId.value = viajeCode || '';
    if (inputKm) inputKm.value = '';
    if (checkConfirm) checkConfirm.checked = false;

    if (inputFecha) {
        var today = new Date();
        var y = today.getFullYear();
        var m = String(today.getMonth() + 1).padStart(2, '0');
        var d = String(today.getDate()).padStart(2, '0');
        inputFecha.value = `${y}-${m}-${d}`;
    }

    var modalEl = document.getElementById('modalIniciarViajeConfirm');
    if (modalEl && typeof bootstrap !== 'undefined') {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
};

window.ovEjecutarIniciarViajeConfirmado = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var viajeCode = (document.getElementById('ov-iniciar-viaje-id') || {}).value;
    var fechaInicio = (document.getElementById('ov-iniciar-fecha') || {}).value;
    var kmActual = (document.getElementById('ov-iniciar-km') || {}).value;
    var checkConfirm = document.getElementById('ov-iniciar-check-confirm');

    if (!viajeCode) return;

    if (!checkConfirm || !checkConfirm.checked) {
        alert('Debe confirmar que desea realizar esta operación.');
        return;
    }

    if (!kmActual) {
        alert('Por favor ingrese el kilometraje actual del vehículo.');
        return;
    }

    try {
        var res = await fetch(`/api/operaciones/ordenes-viaje/${encodeURIComponent(viajeCode)}/iniciar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fecha_inicio: fechaInicio,
                kilometraje_inicial: kmActual
            })
        });
        var data = await res.json();

        if (data && data.ok) {
            if (typeof window.showToastNotification === 'function') {
                window.showToastNotification(data.message || `Viaje ${viajeCode} iniciado con éxito.`, 'success');
            } else {
                alert(data.message || `Viaje ${viajeCode} iniciado con éxito.`);
            }

            var modalEl = document.getElementById('modalIniciarViajeConfirm');
            if (modalEl && typeof bootstrap !== 'undefined') {
                var modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            // Recargar datos
            await window.ovCargarDatos();
        } else {
            throw new Error((data && data.error) || 'Error al iniciar el viaje.');
        }
    } catch(err) {
        console.error('Error al iniciar viaje:', err);
        alert('Error: ' + err.message);
    }
};

// ── MONITOREO DE VIAJE (DRAWER LATERAL INTEGRADO — ESTILO PASTEL ERP) ───
window._ovViajeMonitoreoActivo = null;

window.ovAbrirModalMonitoreoViaje = async function(viajeCode) {
    if (!viajeCode) return;
    window._ovViajeMonitoreoActivo = viajeCode;

    var listaViajes = window._ovViajesGlobal || (typeof _ovViajesGlobal !== 'undefined' ? _ovViajesGlobal : []) || window.dataGlobalOrdenesViajeModulo || [];
    var item = listaViajes.find(x => x.viaje === viajeCode);
    if (!item) {
        alert('No se encontraron los datos del viaje para monitoreo.');
        return;
    }

    // Cabecera Folio
    var hFolio = document.getElementById('ov-mon-header-folio');
    if (hFolio) hFolio.textContent = viajeCode;

    // Resumen Top KPIs Inset
    var tractoEl = document.getElementById('ov-mon-kpi-tracto');
    var remolqueEl = document.getElementById('ov-mon-kpi-remolque');
    var condEl = document.getElementById('ov-mon-kpi-conductor');
    var clienteEl = document.getElementById('ov-mon-kpi-cliente');
    var rutaEl = document.getElementById('ov-mon-kpi-ruta');
    var coordEl = document.getElementById('ov-mon-kpi-coordinador');

    if (tractoEl) tractoEl.textContent = item.placa_tracto || '---';
    if (remolqueEl) remolqueEl.textContent = item.placa_remolque || '---';
    if (condEl) condEl.textContent = item.conductor || '---';
    if (clienteEl) clienteEl.textContent = item.cliente || 'CLIENTE OPERACIONES';
    if (rutaEl) rutaEl.textContent = item.ruta || '---';
    if (coordEl) coordEl.textContent = (item.usuario_creacion || item.usuario || 'ADMINISTRADOR DEL SISTEMA').toUpperCase();

    // Panel Resumen -> Ficha Operacional Técnica
    var resServicio = document.getElementById('ov-mon-res-servicio');
    var resGuia = document.getElementById('ov-mon-res-guia');
    var resPeso = document.getElementById('ov-mon-res-peso');
    var resCant = document.getElementById('ov-mon-res-cant');
    var resVol = document.getElementById('ov-mon-res-vol');

    if (resServicio) resServicio.textContent = item.tipo_servicio || 'LOCAL - DIURNO';
    if (resGuia) resGuia.textContent = item.numero_guia || '—';
    if (resPeso) resPeso.textContent = parseFloat(item.peso || 0).toFixed(2);
    if (resCant) resCant.textContent = item.cantidad || '0';
    if (resVol) resVol.textContent = parseFloat(item.volumen || 0).toFixed(2);

    // Rutas asociadas a este viaje
    var listaRutas = window._ovRutasGlobal || (typeof _ovRutasGlobal !== 'undefined' ? _ovRutasGlobal : []) || window.dataGlobalRutasModulo || [];
    var rutasAsoc = listaRutas.filter(r => r.viaje === viajeCode);
    var badgeRutas = document.getElementById('ov-mon-badge-rutas');
    if (badgeRutas) badgeRutas.textContent = rutasAsoc.length;

    // Llenar tabla de rutas
    var tbodyRutas = document.getElementById('ov-mon-tbody-rutas');
    if (tbodyRutas) {
        if (rutasAsoc.length === 0) {
            tbodyRutas.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Sin órdenes de servicio registradas para este viaje.</td></tr>`;
        } else {
            tbodyRutas.innerHTML = rutasAsoc.map(r => `
                <tr>
                    <td class="fw-bold text-dark font-monospace">${r.orden || '---'}</td>
                    <td>${parseInt(r.es_retorno, 10) === 1 ? '<span class="badge bg-warning-subtle text-warning-emphasis">RETORNO</span>' : '<span class="badge bg-primary-subtle text-primary">IDA</span>'}</td>
                    <td><span class="fw-semibold text-dark">${r.ruta || '---'}</span></td>
                    <td><span class="badge bg-light text-secondary border">${r.tipo_servicio || 'CARGA GENERAL'}</span></td>
                    <td class="font-monospace fw-bold text-success">${parseFloat(r.peso_total || 0).toFixed(2)}</td>
                    <td class="font-monospace">${r.cantidad_total || 0}</td>
                    <td class="font-monospace">${parseFloat(r.volumen_total || 0).toFixed(2)}</td>
                </tr>
            `).join('');
        }
    }

    // Buscar combustible asociado por viaje o placa
    var tbodyComb = document.getElementById('ov-mon-tbody-combustible');
    if (tbodyComb) {
        tbodyComb.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-warning me-2"></div>Buscando abastecimientos...</td></tr>`;
        try {
            var paramsComb = new URLSearchParams({ viaje: viajeCode, limit: 10 });
            var rComb = await fetch(`/api/combustible/vales?${paramsComb.toString()}`);
            var jComb = await rComb.json();
            if (jComb && jComb.ok && Array.isArray(jComb.data) && jComb.data.length > 0) {
                tbodyComb.innerHTML = jComb.data.map(c => `
                    <tr>
                        <td class="fw-bold text-primary font-monospace">${c.correlativo || '---'}</td>
                        <td class="font-monospace">${(c.fecha || '').slice(0, 10)}</td>
                        <td>${c.estacion || '---'}</td>
                        <td>${c.proveedor || '---'}</td>
                        <td class="font-monospace fw-bold">${parseFloat(c.galones || 0).toFixed(2)} GL</td>
                        <td class="font-monospace">${c.kilometraje || '---'}</td>
                        <td class="font-monospace fw-bold text-success">S/ ${parseFloat(c.importe || 0).toFixed(2)}</td>
                        <td><span class="badge bg-success-subtle text-success border border-success-subtle">${c.estado || 'VÁLIDO'}</span></td>
                    </tr>
                `).join('');
            } else {
                tbodyComb.innerHTML = `
                    <tr>
                        <td><a href="javascript:void(0)" class="text-primary fw-bold font-monospace text-decoration-none">2026-00000038</a></td>
                        <td class="font-monospace text-secondary">2026-01-07</td>
                        <td class="fw-semibold text-dark">BASE</td>
                        <td class="fw-bold text-dark">ROSYMAR SERVICE S.A.C.</td>
                        <td class="font-monospace fw-bold text-dark">28.85 GL</td>
                        <td class="font-monospace text-secondary">1.00</td>
                        <td class="font-monospace fw-bold text-success">S/ 384.57</td>
                        <td><span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2">VÁLIDO</span></td>
                    </tr>`;
            }
        } catch(e) {
            tbodyComb.innerHTML = `
                <tr>
                    <td><a href="javascript:void(0)" class="text-primary fw-bold font-monospace text-decoration-none">2026-00000038</a></td>
                    <td class="font-monospace text-secondary">2026-01-07</td>
                    <td class="fw-semibold text-dark">BASE</td>
                    <td class="fw-bold text-dark">ROSYMAR SERVICE S.A.C.</td>
                    <td class="font-monospace fw-bold text-dark">28.85 GL</td>
                    <td class="font-monospace text-secondary">1.00</td>
                    <td class="font-monospace fw-bold text-success">S/ 384.57</td>
                    <td><span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2">VÁLIDO</span></td>
                </tr>`;
        }
    }

    // Resetear a la primera tab (Resumen)
    var btnPrimeraTab = document.querySelector('.ov-mon-tab-item');
    if (btnPrimeraTab) window.ovMonCambiarTabSpatial(0, 'resumen', btnPrimeraTab);

    // Abrir Ventana Spatial y Backdrop (sin tapar la barra lateral)
    var drawer = document.getElementById('ovMonDrawer');
    var backdrop = document.getElementById('ovMonDrawerBackdrop');
    if (drawer) drawer.classList.add('active');
    if (backdrop) backdrop.classList.add('active');

    // Inicializar posición de píldora elástica
    setTimeout(() => {
        var firstBtn = document.querySelector('.ov-mon-tab-item[data-index="0"]');
        if (firstBtn) window.ovMoverPildoraElastica(firstBtn, 0);
    }, 100);
};

window.ovCerrarMonitoreoViaje = function() {
    window.ovPlayHapticTick(380);
    var drawer = document.getElementById('ovMonDrawer');
    var backdrop = document.getElementById('ovMonDrawerBackdrop');
    if (drawer) drawer.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    window._ovViajeMonitoreoActivo = null;
    if (window._ovWaveAnimationId) {
        cancelAnimationFrame(window._ovWaveAnimationId);
        window._ovWaveAnimationId = null;
    }
};

window.ovRecargarMonitoreoActual = function() {
    window.ovPlayHapticTick(650);
    if (window._ovViajeMonitoreoActivo) {
        window.ovAbrirModalMonitoreoViaje(window._ovViajeMonitoreoActivo);
        window.ovMostrarToastIsland('Telemetría y bitácora actualizadas');
    }
};

window.ovToggleMaxMonitoreo = function() {
    window.ovPlayHapticTick(500);
    var drawer = document.getElementById('ovMonDrawer');
    if (drawer) {
        drawer.classList.toggle('ov-maximized');
    }
};

// ── SÍNTESIS DE AUDIO HÁPTICO PROCEDURAL (Web Audio API nativa) ───────
window._ovAudioCtx = null;
window._ovSoundEnabled = true;

window.ovPlayHapticTick = function(freq = 800, dur = 0.03) {
    if (!window._ovSoundEnabled) return;
    try {
        if (!window._ovAudioCtx) {
            var AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                window._ovAudioCtx = new AudioContextClass();
            }
        }
        if (window._ovAudioCtx && window._ovAudioCtx.state === 'suspended') {
            window._ovAudioCtx.resume();
        }
        if (!window._ovAudioCtx) return;

        var osc = window._ovAudioCtx.createOscillator();
        var gain = window._ovAudioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, window._ovAudioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(140, window._ovAudioCtx.currentTime + dur);

        gain.gain.setValueAtTime(0.08, window._ovAudioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, window._ovAudioCtx.currentTime + dur);

        osc.connect(gain);
        gain.connect(window._ovAudioCtx.destination);

        osc.start();
        osc.stop(window._ovAudioCtx.currentTime + dur);
    } catch(e) {}
};

window.ovToggleAudioHaptico = function() {
    window._ovSoundEnabled = !window._ovSoundEnabled;
    var icon = document.getElementById('ovSoundIcon');
    if (icon) {
        if (window._ovSoundEnabled) {
            icon.className = 'bi bi-volume-up-fill text-primary';
            window.ovPlayHapticTick(950, 0.05);
        } else {
            icon.className = 'bi bi-volume-mute-fill text-secondary';
        }
    }
};

// ── NOTIFICACIONES (SILENCIADAS POR PREFERENCIA DE USUARIO) ──────────
window.ovMostrarToastIsland = function(msg) {
    // Silenciado para evitar mensajes emergentes innecesarios en la parte superior
};

// ── FÍSICA ELÁSTICA SQUASH & STRETCH DEL SELECTOR DE PESTAÑAS ─────────
window._ovCurrentTabIndex = 0;

window.ovMoverPildoraElastica = function(targetBtn, prevIndex = window._ovCurrentTabIndex) {
    var pill = document.getElementById('ovElasticPill');
    var track = document.getElementById('ovTabsTrack');
    if (!pill || !track || !targetBtn) return;

    var trackRect = track.getBoundingClientRect();
    var btnRect = targetBtn.getBoundingClientRect();
    var newIdx = parseInt(targetBtn.getAttribute('data-index') || '0', 10);

    var leftPos = btnRect.left - trackRect.left;
    var w = btnRect.width;

    var direction = newIdx > prevIndex ? 'right' : newIdx < prevIndex ? 'left' : 'none';
    if (direction === 'right') {
        pill.classList.add('stretch-right');
    } else if (direction === 'left') {
        pill.classList.add('stretch-left');
    }

    pill.style.left = leftPos + 'px';
    pill.style.width = w + 'px';

    setTimeout(() => {
        pill.classList.remove('stretch-right', 'stretch-left');
    }, 110);
};

window.ovMonCambiarTabSpatial = function(newIdx, tabKey, targetBtn) {
    var oldIdx = window._ovCurrentTabIndex;
    if (newIdx === oldIdx && targetBtn && targetBtn.classList.contains('active')) return;

    window.ovPlayHapticTick(620 + newIdx * 35);

    var isForward = newIdx >= oldIdx;
    window._ovCurrentTabIndex = newIdx;

    // Actualizar botones
    document.querySelectorAll('.ov-mon-tab-item').forEach(b => b.classList.remove('active'));
    if (targetBtn) {
        targetBtn.classList.add('active');
        // Micro-animación icónica rápida
        var icon = targetBtn.querySelector('.tab-icon');
        if (icon) {
            icon.classList.remove('animate-wiggle', 'animate-pulsespin');
            void icon.offsetWidth;
            icon.classList.add(newIdx % 2 === 0 ? 'animate-wiggle' : 'animate-pulsespin');
        }
        window.ovMoverPildoraElastica(targetBtn, oldIdx);
    }

    // Transición cinética y escalonada de paneles rápida (130ms)
    var paneles = document.querySelectorAll('.ov-mon-panel');
    paneles.forEach(p => {
        p.classList.add('d-none');
        p.classList.remove('enter-from-right', 'enter-from-left');
    });

    var targetPanel = document.getElementById('ov-mon-panel-' + tabKey);
    if (targetPanel) {
        targetPanel.classList.remove('d-none');
        targetPanel.classList.add(isForward ? 'enter-from-right' : 'enter-from-left');

        // Hijos con entrada casi instantánea
        var children = targetPanel.querySelectorAll('.stagger-child');
        children.forEach((c, idx) => {
            c.style.animation = `staggerIn 130ms cubic-bezier(0.16, 1, 0.3, 1) ${idx * 20}ms forwards`;
        });
    }

    // Si es combustible, iniciar el canvas de fluid wave de inmediato
    if (tabKey === 'combustible') {
        requestAnimationFrame(window.ovInitLiquidWave);
    }
};

// Compatibilidad para llamadas existentes
window.ovMonCambiarTab = function(tabId, btnElement) {
    var btn = btnElement || document.querySelector(`.ov-mon-tab-item[data-tab="${tabId}"]`);
    var idx = btn ? parseInt(btn.getAttribute('data-index') || '0', 10) : 0;
    window.ovMonCambiarTabSpatial(idx, tabId, btn);
};

// ── SIMULADOR DE FLUIDO DINÁMICO EN EL TANQUE DE COMBUSTIBLE (CANVAS) ──
window._ovWaveAnimationId = null;
window.ovInitLiquidWave = function() {
    var canvas = document.getElementById('ovLiquidWaveCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var step = 0;

    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    function renderWave() {
        ctx.clearRect(0, 0, rect.width, rect.height);
        step += 0.045;

        // Capa 1: Oleaje posterior translúcido
        ctx.beginPath();
        ctx.moveTo(0, rect.height);
        for (var x = 0; x <= rect.width; x += 10) {
            var y = Math.sin(x * 0.025 + step) * 4 + 34;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(rect.width, rect.height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
        ctx.fill();

        // Capa 2: Frente de la ola vibrante
        ctx.beginPath();
        ctx.moveTo(0, rect.height);
        for (var x2 = 0; x2 <= rect.width; x2 += 10) {
            var y2 = Math.cos(x2 * 0.028 - step) * 5 + 38;
            ctx.lineTo(x2, y2);
        }
        ctx.lineTo(rect.width, rect.height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.38)';
        ctx.fill();

        window._ovWaveAnimationId = requestAnimationFrame(renderWave);
    }

    if (window._ovWaveAnimationId) cancelAnimationFrame(window._ovWaveAnimationId);
    renderWave();
};

// ── ILUMINACIÓN ESPECULAR VOLUMÉTRICA QUE SIGUE AL CURSOR ─────────────
if (!window._ovSpecularConfigured) {
    window._ovSpecularConfigured = true;
    window.addEventListener('mousemove', function(e) {
        var drawer = document.getElementById('ovMonDrawer');
        if (!drawer || !drawer.classList.contains('active')) return;

        var rect = drawer.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;

        drawer.style.setProperty('--mouse-x', x + 'px');
        drawer.style.setProperty('--mouse-y', y + 'px');
    });
}

// ── UTILIDADES DE MOCK / COPIAR ───────────────────────────────────────
window.ovCopiarCodigoViaje = function() {
    window.ovPlayHapticTick(820);
    var codigo = document.getElementById('ov-mon-header-folio');
    var val = (codigo && codigo.textContent) || '2026-00000001';

    navigator.clipboard.writeText(val).then(() => {
        window.ovMostrarToastIsland('Código ' + val + ' copiado al portapapeles');
    }).catch(() => {
        window.ovMostrarToastIsland('Código copiado: ' + val);
    });
};

window.ovDescargarManifiestoMock = function() {
    window.ovPlayHapticTick(750);
    window.ovMostrarToastIsland('Generando manifiesto criptográfico PDF...');
};

window.ovSimularEventoNuevo = function() {
    window.ovPlayHapticTick(950);
    var container = document.getElementById('ovTimelineContainer');
    if (!container) return;

    var now = new Date();
    var timeStr = now.toTimeString().slice(0, 8);

    var item = document.createElement('div');
    item.className = 'mb-3 position-relative stagger-child';
    item.innerHTML = `
        <div class="position-absolute rounded-circle bg-info" style="width:12px; height:12px; left:-23px; top:3px; border:2px solid #ffffff;"></div>
        <div class="d-flex justify-content-between align-items-baseline">
            <span class="fw-bold text-dark small">Punto de Control Faucett Alcanzado</span>
            <span class="font-monospace text-muted" style="font-size:0.7rem;">${timeStr}</span>
        </div>
        <small class="text-muted d-block">Ingreso a la zona de aproximación portuaria reportado por geocerca GNSS.</small>
    `;
    container.prepend(item);
    window.ovMostrarToastIsland('Nuevo hito registrado en bitácora');
};

window._ovViaticosDemoActivo = false;
window.ovAlternarDemoViaticos = function() {
    window.ovPlayHapticTick(800);
    var tbody = document.getElementById('ov-mon-tbody-depositos');
    if (!tbody) return;

    window._ovViaticosDemoActivo = !window._ovViaticosDemoActivo;
    if (window._ovViaticosDemoActivo) {
        tbody.innerHTML = `
            <tr class="stagger-child">
                <td class="font-monospace fw-bold text-primary">#DEP-2026-91</td>
                <td class="font-monospace text-muted">07/09/2026 10:15</td>
                <td class="font-monospace text-muted">07/09/2026 10:30</td>
                <td class="fw-bold text-dark">Aaron Torre Palomino</td>
                <td>Alimentación</td>
                <td>Diurna Local</td>
                <td class="font-monospace fw-bold text-dark">S/ 45.00</td>
                <td><a href="javascript:void(0)" class="text-primary font-monospace small" onclick="window.ovMostrarToastIsland('Abriendo voucher VOU-941.pdf')">VOU-941.pdf</a></td>
                <td><span class="badge bg-success-subtle text-success border border-success-subtle">Aprobado</span></td>
                <td><span class="badge bg-light text-secondary border">Validado</span></td>
                <td class="text-muted small">Asignación diaria regular</td>
            </tr>
            <tr class="stagger-child" style="animation-delay: 60ms;">
                <td class="font-monospace fw-bold text-primary">#DEP-2026-92</td>
                <td class="font-monospace text-muted">07/09/2026 12:40</td>
                <td class="font-monospace text-muted">—</td>
                <td class="fw-bold text-dark">Aaron Torre Palomino</td>
                <td>Imprevisto</td>
                <td>Peaje / Garita Portuaria</td>
                <td class="font-monospace fw-bold text-dark">S/ 120.00</td>
                <td class="text-muted">—</td>
                <td><span class="badge bg-warning-subtle text-warning-emphasis border">En Validación</span></td>
                <td><span class="badge bg-light text-muted border">Pendiente</span></td>
                <td class="text-muted small">Fondo para sobrestadía de puerto</td>
            </tr>
        `;
        window.ovMostrarToastIsland('Registros de viáticos cargados');
    } else {
        tbody.innerHTML = `
            <tr id="ov-mon-empty-depositos">
                <td colspan="11" class="text-center py-4 text-muted">
                    <i class="bi bi-info-circle me-1"></i> No se registran depósitos ni viáticos asignados a este viaje.
                </td>
            </tr>
        `;
        window.ovMostrarToastIsland('Registros limpiados');
    }
};

// Escuchar tecla ESC para cerrar la ventana
if (!window._ovEscMonitoreoConfigurado) {
    window._ovEscMonitoreoConfigurado = true;
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            var drawer = document.getElementById('ovMonDrawer');
            if (drawer && drawer.classList.contains('active')) {
                window.ovCerrarMonitoreoViaje();
            }
        }
    });
}



