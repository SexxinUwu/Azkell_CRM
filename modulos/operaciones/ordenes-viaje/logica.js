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
var _ovSortCol = null; // Columna activa para ordenar
var _ovSortAsc = true; // true: asc, false: desc

window.ovOrdenarPorColumna = function(columna) {
    if (_ovSortCol === columna) {
        _ovSortAsc = !_ovSortAsc;
    } else {
        _ovSortCol = columna;
        _ovSortAsc = true;
    }
    _ovPaginaActual = 1;
    window.ovConfigurarThead();
    window.ovAplicarFiltros();
};

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

    function _sortIcon(col) {
        var activeClass = _ovSortCol === col ? ' active' : '';
        var iconClass = 'bi bi-arrow-down-up';
        if (_ovSortCol === col) {
            iconClass = _ovSortAsc ? 'bi bi-arrow-up' : 'bi bi-arrow-down';
        }
        return `<span class="ov-sort-arrow${activeClass}" onclick="event.stopPropagation(); window.ovOrdenarPorColumna('${col}')" title="Ordenar por esta columna"><i class="${iconClass}"></i></span>`;
    }

    if (_ovModoVistaActual === 'viajes') {
        thead.innerHTML = `
            <tr>
                <th class="ov-col-sticky-action text-center" style="width: 62px; min-width: 62px; max-width: 62px;">ACCIÓN</th>
                <th style="min-width: 100px;">OPERACIÓN ${_sortIcon('estado')}</th>
                <th style="min-width: 95px;">ESTADO ${_sortIcon('estado')}</th>
                <th style="min-width: 140px;">F. Y HORA CREACIÓN ${_sortIcon('fecha_creacion')}</th>
                <th style="min-width: 145px;">N° VIAJE ${_sortIcon('viaje')}</th>
                <th style="min-width: 170px;">CONDUCTOR ${_sortIcon('conductor')}</th>
                <th style="min-width: 100px;">VEHÍCULO (TRACTO) ${_sortIcon('tracto')}</th>
                <th style="min-width: 105px;">KM (TRACTO) ${_sortIcon('km_tracto')}</th>
                <th style="min-width: 105px;">SEMIRREMOLQUE ${_sortIcon('remolque')}</th>
                <th style="min-width: 110px;">CONFIGURACIÓN ${_sortIcon('configuracion')}</th>
                <th style="min-width: 115px;">HORAS TERMOKING ${_sortIcon('horas_remolque')}</th>
                <th style="min-width: 160px;">RUTA PROGRAMADA ${_sortIcon('ruta')}</th>
                <th style="min-width: 120px; text-align: right;">CANTIDAD / PESO (TN) ${_sortIcon('peso')}</th>
                <th style="min-width: 135px;">F. Y HORA INICIO ${_sortIcon('fecha_inicio')}</th>
                <th style="min-width: 135px;">F. Y HORA CIERRE ${_sortIcon('fecha_fin')}</th>
                <th style="min-width: 150px;">USUARIO CREACIÓN ${_sortIcon('usuario_creacion')}</th>
                <th style="min-width: 150px;">USUARIO FINALIZACIÓN ${_sortIcon('usuario_finalizacion')}</th>
            </tr>
        `;
    } else {
        thead.innerHTML = `
            <tr>
                <th style="width: 125px;">N° Viaje ${_sortIcon('viaje')}</th>
                <th style="width: 125px;">N° Orden Serv. ${_sortIcon('orden')}</th>
                <th style="width: 100px; text-align: center;">Tramo ${_sortIcon('tramo')}</th>
                <th style="width: 95px;">Tracto ${_sortIcon('tracto')}</th>
                <th style="width: 95px;">Carreta ${_sortIcon('remolque')}</th>
                <th>Conductor ${_sortIcon('conductor')}</th>
                <th>Ruta Despachada ${_sortIcon('ruta')}</th>
                <th style="width: 130px;">Tipo de Servicio ${_sortIcon('tipo_servicio')}</th>
                <th style="width: 105px; text-align: right;">Peso Carga ${_sortIcon('peso')}</th>
                <th style="width: 75px; text-align: center;">Estado ${_sortIcon('estado')}</th>
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
                <td colspan="17" class="text-center py-4 text-secondary">
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
                    <td colspan="16" class="text-center py-4 text-danger">
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

        // Aplicar ordenamiento dinámico por columna seleccionada
        if (_ovSortCol) {
            filtradosV.sort(function(a, b) {
                var valA = '';
                var valB = '';

                switch (_ovSortCol) {
                    case 'fecha_creacion':
                        valA = new Date(a.fecha_registro || a.creado_en || 0).getTime() || 0;
                        valB = new Date(b.fecha_registro || b.creado_en || 0).getTime() || 0;
                        break;
                    case 'fecha_inicio':
                        valA = new Date(a.fecha_inicio || a.fecha_viaje || 0).getTime() || 0;
                        valB = new Date(b.fecha_inicio || b.fecha_viaje || 0).getTime() || 0;
                        break;
                    case 'fecha_fin':
                        valA = new Date(a.fecha_fin || 0).getTime() || 0;
                        valB = new Date(b.fecha_fin || 0).getTime() || 0;
                        break;
                    case 'viaje':
                        valA = (a.viaje || '').toUpperCase();
                        valB = (b.viaje || '').toUpperCase();
                        break;
                    case 'conductor':
                        valA = (a.conductor || '').toUpperCase();
                        valB = (b.conductor || '').toUpperCase();
                        break;
                    case 'tracto':
                        valA = (a.placa_tracto || '').toUpperCase();
                        valB = (b.placa_tracto || '').toUpperCase();
                        break;
                    case 'km_tracto':
                        valA = parseFloat(a.kilometraje_inicial || a.km || 0);
                        valB = parseFloat(b.kilometraje_inicial || b.km || 0);
                        break;
                    case 'remolque':
                        valA = (a.placa_remolque || '').toUpperCase();
                        valB = (b.placa_remolque || '').toUpperCase();
                        break;
                    case 'horas_remolque':
                        valA = parseFloat(a.horas_motor_remolque || 0);
                        valB = parseFloat(b.horas_motor_remolque || 0);
                        break;
                    case 'ruta':
                        valA = (a.ruta || '').toUpperCase();
                        valB = (b.ruta || '').toUpperCase();
                        break;
                    case 'peso':
                        valA = parseFloat(a.peso) || (parseFloat(a.peso_total_rutas) ? parseFloat(a.peso_total_rutas) / 1000 : 0);
                        valB = parseFloat(b.peso) || (parseFloat(b.peso_total_rutas) ? parseFloat(b.peso_total_rutas) / 1000 : 0);
                        break;
                    case 'usuario_creacion':
                        valA = (a.usuario_creacion || a.usuario || '').toUpperCase();
                        valB = (b.usuario_creacion || b.usuario || '').toUpperCase();
                        break;
                    case 'usuario_finalizacion':
                        valA = (a.usuario_finalizacion || '').toUpperCase();
                        valB = (b.usuario_finalizacion || '').toUpperCase();
                        break;
                    case 'estado':
                        valA = (a.estado || '').toUpperCase();
                        valB = (b.estado || '').toUpperCase();
                        break;
                    default:
                        valA = (a[_ovSortCol] || '').toString().toUpperCase();
                        valB = (b[_ovSortCol] || '').toString().toUpperCase();
                        break;
                }

                if (typeof valA === 'number' && typeof valB === 'number') {
                    return _ovSortAsc ? (valA - valB) : (valB - valA);
                }
                return _ovSortAsc
                    ? String(valA).localeCompare(String(valB))
                    : String(valB).localeCompare(String(valA));
            });
        }

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

        // Aplicar ordenamiento dinámico en modo rutas
        if (_ovSortCol) {
            filtradosR.sort(function(a, b) {
                var valA = '';
                var valB = '';

                switch (_ovSortCol) {
                    case 'viaje':
                        valA = (a.viaje || '').toUpperCase();
                        valB = (b.viaje || '').toUpperCase();
                        break;
                    case 'orden':
                        valA = (a.orden || '').toUpperCase();
                        valB = (b.orden || '').toUpperCase();
                        break;
                    case 'conductor':
                        valA = (a.conductor || '').toUpperCase();
                        valB = (b.conductor || '').toUpperCase();
                        break;
                    case 'tracto':
                        valA = (a.placa_tracto || '').toUpperCase();
                        valB = (b.placa_tracto || '').toUpperCase();
                        break;
                    case 'remolque':
                        valA = (a.placa_remolque || '').toUpperCase();
                        valB = (b.placa_remolque || '').toUpperCase();
                        break;
                    case 'configuracion':
                        valA = (a.configuracion || '').toUpperCase();
                        valB = (b.configuracion || '').toUpperCase();
                        break;
                    case 'ruta':
                        valA = (a.ruta || '').toUpperCase();
                        valB = (b.ruta || '').toUpperCase();
                        break;
                    case 'peso':
                        valA = parseFloat(a.peso_total) || 0;
                        valB = parseFloat(b.peso_total) || 0;
                        break;
                    case 'tramo':
                        valA = parseInt(a.es_retorno, 10) || 0;
                        valB = parseInt(b.es_retorno, 10) || 0;
                        break;
                    case 'tipo_servicio':
                        valA = (a.tipo_servicio || '').toUpperCase();
                        valB = (b.tipo_servicio || '').toUpperCase();
                        break;
                    case 'estado':
                        valA = (a.estado || '').toUpperCase();
                        valB = (b.estado || '').toUpperCase();
                        break;
                    default:
                        valA = (a[_ovSortCol] || '').toString().toUpperCase();
                        valB = (b[_ovSortCol] || '').toString().toUpperCase();
                        break;
                }

                if (typeof valA === 'number' && typeof valB === 'number') {
                    return _ovSortAsc ? (valA - valB) : (valB - valA);
                }
                return _ovSortAsc
                    ? String(valA).localeCompare(String(valB))
                    : String(valB).localeCompare(String(valA));
            });
        }

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
                <td colspan="17" class="text-center py-4 text-secondary">
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

            var fechaCreacionStr = fechaRegistroStr;
            var fechaInicioFmt = '---';
            if (v.fecha_inicio) {
                var dtIni = new Date(v.fecha_inicio);
                if (!isNaN(dtIni.getTime())) {
                    var dI = String(dtIni.getDate()).padStart(2, '0');
                    var mI = String(dtIni.getMonth() + 1).padStart(2, '0');
                    var yI = dtIni.getFullYear();
                    var hhI = String(dtIni.getHours()).padStart(2, '0');
                    var mmI = String(dtIni.getMinutes()).padStart(2, '0');
                    var ssI = String(dtIni.getSeconds()).padStart(2, '0');
                    fechaInicioFmt = `${dI}/${mI}/${yI} ${hhI}:${mmI}:${ssI}`;
                }
            } else if (v.fecha_viaje && (esIniciado || esFinalizado)) {
                fechaInicioFmt = fechaStr;
            }

            var fechaCierreFmt = '---';
            if (v.fecha_fin) {
                var dtFin = new Date(v.fecha_fin);
                if (!isNaN(dtFin.getTime())) {
                    var dF = String(dtFin.getDate()).padStart(2, '0');
                    var mF = String(dtFin.getMonth() + 1).padStart(2, '0');
                    var yF = dtFin.getFullYear();
                    var hhF = String(dtFin.getHours()).padStart(2, '0');
                    var mmF = String(dtFin.getMinutes()).padStart(2, '0');
                    var ssF = String(dtFin.getSeconds()).padStart(2, '0');
                    fechaCierreFmt = `${dF}/${mF}/${yF} ${hhF}:${mmF}:${ssF}`;
                }
            }

            var estadoUpper = (v.estado || 'REGISTRADO').toUpperCase();
            var esFinalizado = estadoUpper === 'FINALIZADO';
            var esIniciado = estadoUpper === 'INICIADO';
            var esRegistrado = !esFinalizado && !esIniciado;

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
            var viajeEsc = (v.viaje || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            var placaEsc = (v.placa_tracto || '').replace(/"/g, '&quot;');
            if (esRegistrado) {
                operacionHtml = `<button type="button" class="ov-btn-iniciar" onclick="window.ovAbrirModalIniciarViaje('${viajeEsc}', '${placaEsc}')"><i class="bi bi-play-fill fs-6"></i> INICIAR</button>`;
            } else if (esIniciado) {
                operacionHtml = `<button type="button" class="ov-btn-finalizar" onclick="window.ovAbrirModalFinalizarViaje('${viajeEsc}', '${placaEsc}')"><i class="bi bi-flag-fill"></i> FINALIZAR</button>`;
            } else {
                operacionHtml = `<span class="badge bg-secondary-subtle text-secondary font-monospace" style="font-size:0.7rem;"><i class="bi bi-check2-all me-1"></i>CERRADO</span>`;
            }

            // 4. Conductor y Usuarios
            var conductorNombre = (v.conductor || '').toUpperCase();
            var usuarioCreacion = (v.usuario_creacion || v.usuario || 'ADMINISTRADOR DEL SISTEMA').toUpperCase();
            var usuarioFinalizacion = (v.usuario_finalizacion || '—').toUpperCase();

            // Limpieza de usuario si contiene correo (mostrar solo nombre)
            if (usuarioCreacion.includes('@')) {
                usuarioCreacion = usuarioCreacion.split('@')[0];
            }
            if (usuarioFinalizacion.includes('@')) {
                usuarioFinalizacion = usuarioFinalizacion.split('@')[0];
            }

            // 5. Placas y carga
            var vehiculo = v.placa_tracto || '';
            var semirremolque = v.placa_remolque || '';
            var kmTractoVal = v.kilometraje_inicial != null && v.kilometraje_inicial !== '' ? Number(v.kilometraje_inicial) : null;
            var kmTractoHtml = kmTractoVal != null
                ? `<span class="badge bg-light text-dark border font-monospace px-2 py-1"><i class="bi bi-speedometer2 text-primary me-1"></i>${kmTractoVal.toLocaleString()} km</span>`
                : `<span class="text-muted font-monospace small">---</span>`;

            var horasRemolqueVal = v.horas_motor_remolque != null && v.horas_motor_remolque !== '' ? Number(v.horas_motor_remolque) : null;
            var horasRemolqueHtml = horasRemolqueVal != null
                ? `<span class="badge bg-warning-subtle text-dark border border-warning-subtle font-monospace px-2 py-1"><i class="bi bi-clock-history text-warning me-1"></i>${horasRemolqueVal.toLocaleString()} hrs</span>`
                : `<span class="text-muted font-monospace small">---</span>`;

            var pesoTnVal = parseFloat(v.peso) || (parseFloat(v.peso_total_rutas) ? parseFloat(v.peso_total_rutas) / 1000 : 0);
            var pesoTnTxt = pesoTnVal > 0 ? (pesoTnVal).toFixed(2) + ' TN' : '0.00 TN';
            var rutaTxt = (v.ruta || '---').toUpperCase();

            html += `
                <tr>
                    <!-- 1. ACCIÓN (COLUMNA FIJA / STICKY CON BOTÓN DE 3 PUNTOS Y MENÚ FLOTANTE) -->
                    <td class="ov-col-sticky-action text-center" onclick="event.stopPropagation();">
                        <div class="dropdown d-inline-block">
                            <button class="ov-btn-action-dots" type="button" data-bs-toggle="dropdown" data-bs-boundary="viewport" data-bs-popper-config='{"strategy":"fixed"}' aria-expanded="false" title="Acciones del viaje">
                                <i class="bi bi-three-dots-vertical"></i>
                            </button>
                            <ul class="dropdown-menu ov-actions-dropdown-menu shadow-lg border">
                                <li>
                                    <a class="dropdown-item fw-semibold text-dark" href="javascript:void(0)" onclick="window.ovAbrirModalEditarViaje('${viajeEsc}')">
                                        <i class="bi bi-pencil text-primary" style="font-size:0.95rem;"></i>
                                        <span>Editar</span>
                                    </a>
                                </li>
                                <li><hr class="dropdown-divider my-1 border-secondary-subtle"></li>
                                <li>
                                    <a class="dropdown-item fw-bold text-danger item-delete" href="javascript:void(0)" onclick="window.ovAbrirModalEliminarViaje('${viajeEsc}')">
                                        <i class="bi bi-trash3 text-danger" style="font-size:0.95rem;"></i>
                                        <span>Eliminar</span>
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </td>

                    <!-- 2. OPERACIÓN -->
                    <td>${operacionHtml}</td>

                    <!-- 3. ESTADO -->
                    <td>${estadoBadge}</td>

                    <!-- 4. F. Y HORA CREACIÓN -->
                    <td class="font-monospace text-secondary" style="font-size:0.75rem;">${fechaCreacionStr}</td>

                    <!-- 5. N° VIAJE -->
                    <td>
                        <a href="javascript:void(0)" class="ov-btn-viaje-eye fw-bold" style="white-space: nowrap !important; display: inline-flex; align-items: center;" title="Ver monitoreo detallado del viaje" onclick="window.ovAbrirModalMonitoreoViaje('${v.viaje}')">
                            <i class="bi bi-eye"></i> ${v.viaje || '---'}
                        </a>
                    </td>

                    <!-- 6. CONDUCTOR -->
                    <td class="fw-semibold text-dark" style="font-size:0.78rem;">${conductorNombre || '---'}</td>

                    <!-- 7. VEHÍCULO (TRACTO) -->
                    <td class="fw-bold text-dark font-monospace" style="font-size:0.8rem;">${vehiculo || '---'}</td>

                    <!-- 8. KM (TRACTO) -->
                    <td>${kmTractoHtml}</td>

                    <!-- 9. SEMIRREMOLQUE (CARRETA) -->
                    <td class="fw-bold text-dark font-monospace" style="font-size:0.8rem;">${semirremolque || '---'}</td>

                    <!-- 9.1 CONFIGURACIÓN VEHICULAR CONJUNTA -->
                    <td>
                        <span class="badge ${v.configuracion && v.configuracion !== '---' ? 'bg-primary-subtle text-primary border border-primary-subtle' : 'bg-light text-muted'} font-monospace px-2 py-1 fw-bold" style="font-size:0.75rem;">
                            ${v.configuracion || '---'}
                        </span>
                    </td>

                    <!-- 10. HORAS TERMOKING -->
                    <td>${horasRemolqueHtml}</td>

                    <!-- 11. RUTA PROGRAMADA -->
                    <td class="fw-semibold text-dark small">
                        <i class="bi bi-geo-alt-fill text-danger me-1"></i>${rutaTxt}
                    </td>

                    <!-- 12. CANTIDAD / PESO (TN) -->
                    <td style="text-align: right;" class="font-monospace fw-bold text-dark">
                        <span class="badge ${pesoTnVal > 0 ? 'bg-light text-dark border border-secondary-subtle' : 'bg-light text-muted'} font-monospace px-2 py-1 fw-bold">
                            ${pesoTnTxt}
                        </span>
                    </td>

                    <!-- 13. F. Y HORA INICIO -->
                    <td class="font-monospace text-secondary" style="font-size:0.75rem;">${fechaInicioFmt}</td>

                    <!-- 14. F. Y HORA CIERRE -->
                    <td class="font-monospace text-secondary" style="font-size:0.75rem;">${fechaCierreFmt}</td>

                    <!-- 15. USUARIO CREACIÓN -->
                    <td class="fw-semibold text-dark" style="font-size:0.76rem;">
                        <span class="badge bg-light text-dark border px-2 py-1">${usuarioCreacion}</span>
                    </td>

                    <!-- 16. USUARIO FINALIZACIÓN -->
                    <td class="fw-semibold text-dark" style="font-size:0.76rem;">
                        <span class="badge ${usuarioFinalizacion !== '—' ? 'bg-primary-subtle text-primary border border-primary-subtle' : 'bg-light text-muted border'} px-2 py-1">${usuarioFinalizacion}</span>
                    </td>
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
    var btnEliminarModal = document.getElementById('ov-btn-eliminar-modal');
    if (btnEliminarModal) {
        btnEliminarModal.classList.add('d-none');
        btnEliminarModal.classList.remove('d-inline-flex');
    }
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

    // Limpiar kilometraje, horas motor y configuraciones
    var kmTractoInput = document.getElementById('ov-form-km-tracto');
    if (kmTractoInput) kmTractoInput.value = '';
    var horasRemolqueInput = document.getElementById('ov-form-horas-remolque');
    if (horasRemolqueInput) horasRemolqueInput.value = '';
    var confTractoInput = document.getElementById('ov-form-config-tracto');
    if (confTractoInput) confTractoInput.value = '';
    var confRemolqueInput = document.getElementById('ov-form-config-remolque');
    if (confRemolqueInput) confRemolqueInput.value = '';

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

    var btnEliminarModal = document.getElementById('ov-btn-eliminar-modal');
    if (btnEliminarModal) {
        btnEliminarModal.classList.remove('d-none');
        btnEliminarModal.classList.add('d-inline-flex');
    }

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

    // Kilometraje Tracto y Horas Motor Remolque
    var kmTractoInput = document.getElementById('ov-form-km-tracto');
    if (kmTractoInput) kmTractoInput.value = item.kilometraje_inicial != null ? item.kilometraje_inicial : '';
    var horasRemolqueInput = document.getElementById('ov-form-horas-remolque');
    if (horasRemolqueInput) horasRemolqueInput.value = item.horas_motor_remolque != null ? item.horas_motor_remolque : '';

    // Configuraciones de placas
    var confTractoInput = document.getElementById('ov-form-config-tracto');
    if (confTractoInput) confTractoInput.value = item.configuracion_tracto || '';
    var confRemolqueInput = document.getElementById('ov-form-config-remolque');
    if (confRemolqueInput) confRemolqueInput.value = item.configuracion_remolque || '';

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
        window._ovPlacasConfigMap = {};

        (resPlacas || []).forEach(function(p) {
            var placa = (p.placa || p[0] || '').toString().trim().toUpperCase();
            if (!placa) return;
            var conf = (p.configuracion || p.tipo || '').toString().trim().toUpperCase();
            if (conf) {
                window._ovPlacasConfigMap[placa] = conf;
            }
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
                window._cbOnSelect('ov-form-tracto', async function(val, lbl) {
                    var hid = document.getElementById('ov-form-tracto');
                    if (hid) hid.value = val;
                    // Autocompletar configuración del tracto si existe en tabla placas
                    var inputConfTracto = document.getElementById('ov-form-config-tracto');
                    if (inputConfTracto && val && window._ovPlacasConfigMap) {
                        var cVal = window._ovPlacasConfigMap[val.toUpperCase()] || '';
                        if (cVal) inputConfTracto.value = cVal;
                    }
                    if (val) {
                        var tele = await window.ovObtenerTelemetryGPS(val);
                        var inputKm = document.getElementById('ov-form-km-tracto');
                        if (inputKm && tele && tele.km > 0) {
                            inputKm.value = Math.round(tele.km);
                        }
                    }
                });
                window._cbOnSelect('ov-form-remolque', async function(val, lbl) {
                    var hid = document.getElementById('ov-form-remolque');
                    if (hid) hid.value = val;
                    // Autocompletar configuración de carreta si existe en tabla placas
                    var inputConfRem = document.getElementById('ov-form-config-remolque');
                    if (inputConfRem && val && window._ovPlacasConfigMap) {
                        var cVal = window._ovPlacasConfigMap[val.toUpperCase()] || '';
                        if (cVal) inputConfRem.value = cVal;
                    }
                    if (val) {
                        var tele = await window.ovObtenerTelemetryGPS(val);
                        var inputHoras = document.getElementById('ov-form-horas-remolque');
                        if (inputHoras && tele && tele.horas > 0) {
                            inputHoras.value = Math.round(tele.horas);
                        }
                    }
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
    var kmTracto = parseInt((document.getElementById('ov-form-km-tracto') || {}).value, 10) || null;
    var horasRemolque = parseInt((document.getElementById('ov-form-horas-remolque') || {}).value, 10) || null;
    var configTracto = ((document.getElementById('ov-form-config-tracto') || {}).value || '').trim().toUpperCase();
    var configRemolque = ((document.getElementById('ov-form-config-remolque') || {}).value || '').trim().toUpperCase();
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
        configuracion_tracto: configTracto,
        configuracion_remolque: configRemolque,
        kilometraje_inicial: kmTracto,
        horas_motor_remolque: horasRemolque,
        ruta,
        peso: cantidad,
        ubigeo_partida: ubigeoPartida,
        direccion_partida: dirPartida,
        ubigeo_llegada: ubigeoLlegada,
        direccion_llegada: dirLlegada,
        observaciones,
        escolta,
        usuario_creacion: (typeof window.usuarioLogueado !== 'undefined' && window.usuarioLogueado) || localStorage.getItem('fleet_user') || 'ADMINISTRADOR DEL SISTEMA',
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

// ── HELPER TELEMETRÍA GPS / ODOMETRO & HORAS MOTOR WIALON ───────────
window.ovObtenerTelemetryGPS = async function(placa) {
    if (!placa) return { km: 0, horas: 0 };
    var pStr = placa.toString().trim().toUpperCase();

    // 1. Probar CACHE.wialon local
    if (typeof CACHE !== 'undefined' && Array.isArray(CACHE.wialon) && CACHE.wialon.length > 0) {
        var w = CACHE.wialon.find(x => (x.placa || '').toString().trim().toUpperCase() === pStr);
        if (w && (w.km > 0 || w.horas > 0)) {
            return { km: w.km || 0, horas: w.horas || 0 };
        }
    }

    // 2. Probar /api/disponibilidad-flota
    try {
        var r = await fetch('/api/disponibilidad-flota');
        if (r.ok) {
            var data = await r.json();
            var list = Array.isArray(data) ? data : (data.data || []);
            var match = list.find(v => (v.placa || '').toString().trim().toUpperCase() === pStr);
            if (match) {
                return {
                    km: parseFloat(match.km || match.kilometraje || match.km_wialon || 0),
                    horas: parseFloat(match.horas_motor || match.horas_wialon || match.horas || 0)
                };
            }
        }
    } catch(e) {}

    // 3. Probar /api/vehiculos-flota
    try {
        var r2 = await fetch('/api/vehiculos-flota');
        if (r2.ok) {
            var data2 = await r2.json();
            var list2 = Array.isArray(data2) ? data2 : [];
            var match2 = list2.find(v => (v.placa || '').toString().trim().toUpperCase() === pStr);
            if (match2) {
                return {
                    km: parseFloat(match2.km || match2.kilometraje || match2.km_inicial || 0),
                    horas: parseFloat(match2.horas_motor || match2.horas || 0)
                };
            }
        }
    } catch(e) {}

    // 4. Intentar script Wialon en tiempo real
    try {
        var r3 = await fetch('/api/script/obtenerDatosWialon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args: [] })
        });
        var res3 = await r3.json();
        var list3 = (res3 && res3.data) ? res3.data : [];
        if (Array.isArray(list3)) {
            if (typeof CACHE !== 'undefined') CACHE.wialon = list3;
            var match3 = list3.find(w => (w.placa || '').toString().trim().toUpperCase() === pStr);
            if (match3) {
                return {
                    km: parseFloat(match3.km || 0),
                    horas: parseFloat(match3.horas || match3.horas_motor || 0)
                };
            }
        }
    } catch(err) {}

    return { km: 0, horas: 0 };
};

window.ovObtenerKmTelemetriaVehiculo = async function(placa) {
    var tele = await window.ovObtenerTelemetryGPS(placa);
    return tele && tele.km > 0 ? Math.round(tele.km) : null;
};

// ── GESTIÓN DEL MODAL INICIAR VIAJE (DISEÑO B) ──────────────────────
window.ovAbrirModalIniciarViaje = async function(viajeCode, placaVehiculo) {
    var lblViaje = document.getElementById('ov-iniciar-modal-viaje-num');
    var inputId = document.getElementById('ov-iniciar-viaje-id');
    var inputFecha = document.getElementById('ov-iniciar-fecha');
    var checkConfirm = document.getElementById('ov-iniciar-check-confirm');

    if (lblViaje) lblViaje.textContent = viajeCode || '---';
    if (inputId) inputId.value = viajeCode || '';
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
    var checkConfirm = document.getElementById('ov-iniciar-check-confirm');

    if (!viajeCode) return;

    if (!checkConfirm || !checkConfirm.checked) {
        alert('Debe confirmar que desea realizar esta operación.');
        return;
    }

    try {
        var res = await fetch(`/api/operaciones/ordenes-viaje/${encodeURIComponent(viajeCode)}/iniciar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fecha_inicio: fechaInicio
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

            await window.ovCargarDatos();
        } else {
            throw new Error((data && data.error) || 'Error al iniciar el viaje.');
        }
    } catch(err) {
        console.error('Error al iniciar viaje:', err);
        alert('Error: ' + err.message);
    }
};

// ── GESTIÓN DE FINALIZACIÓN DE VIAJES ────────────────────────────────
window.ovAbrirModalFinalizarViaje = async function(viajeCode, placaVehiculo) {
    if (!viajeCode) return;

    var lblViaje = document.getElementById('ov-finalizar-modal-viaje-num');
    var inputId = document.getElementById('ov-finalizar-viaje-id');
    var inputFecha = document.getElementById('ov-finalizar-fecha');
    var inputKm = document.getElementById('ov-finalizar-km');
    var checkConfirm = document.getElementById('ov-finalizar-check-confirm');
    var badgeTelemetria = document.getElementById('ov-finalizar-km-telemetria-badge');
    var hintTelemetria = document.getElementById('ov-finalizar-km-telemetria-hint');

    // Identificar placa desde fila si no vino por parámetro
    if (!placaVehiculo && viajeCode && Array.isArray(window._ordenesViajeCache)) {
        var vItem = window._ordenesViajeCache.find(x => x.viaje === viajeCode);
        if (vItem) placaVehiculo = vItem.placa_tracto;
    }

    if (lblViaje) lblViaje.textContent = viajeCode;
    if (inputId) inputId.value = viajeCode;
    if (inputFecha) inputFecha.value = new Date().toISOString().slice(0, 10);
    if (inputKm) {
        inputKm.value = '';
        inputKm.placeholder = 'Consultando telemetría...';
    }
    if (checkConfirm) checkConfirm.checked = false;

    if (badgeTelemetria) {
        badgeTelemetria.innerHTML = `<i class="bi bi-arrow-repeat spin me-1 text-primary"></i> Consultando GPS...`;
        badgeTelemetria.className = 'badge bg-light text-secondary border font-monospace';
    }
    if (hintTelemetria) {
        hintTelemetria.textContent = 'Consultando odómetro satelital del vehículo ' + (placaVehiculo || '') + '...';
    }

    var modalEl = document.getElementById('modalFinalizarViajeConfirm');
    if (modalEl && typeof bootstrap !== 'undefined') {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }

    // Consultar telemetría asíncrona de la placa para odómetro de llegada
    if (placaVehiculo) {
        var kmGps = await window.ovObtenerKmTelemetriaVehiculo(placaVehiculo);
        if (kmGps != null && kmGps > 0) {
            if (inputKm) {
                inputKm.value = kmGps;
                inputKm.placeholder = 'EJ: ' + kmGps;
            }
            if (badgeTelemetria) {
                badgeTelemetria.innerHTML = `<i class="bi bi-broadcast text-success me-1"></i> GPS: ${placaVehiculo} (${kmGps.toLocaleString()} km)`;
                badgeTelemetria.className = 'badge bg-success-subtle text-success border border-success-subtle font-monospace';
            }
            if (hintTelemetria) {
                hintTelemetria.textContent = `Odómetro satelital obtenido automáticamente (${kmGps} km). Es completamente editable si deseas corregirlo.`;
            }
        } else {
            if (inputKm) inputKm.placeholder = 'EJ: 126200';
            if (badgeTelemetria) {
                badgeTelemetria.innerHTML = `<i class="bi bi-exclamation-circle me-1 text-muted"></i> Sin Odómetro GPS`;
                badgeTelemetria.className = 'badge bg-light text-muted border font-monospace';
            }
            if (hintTelemetria) {
                hintTelemetria.textContent = 'No se detectó odómetro satelital activo para la placa ' + placaVehiculo + '. Ingrésalo manualmente.';
            }
        }
    } else {
        if (inputKm) inputKm.placeholder = 'EJ: 126200';
        if (badgeTelemetria) badgeTelemetria.style.display = 'none';
        if (hintTelemetria) hintTelemetria.textContent = 'Ingresa el kilometraje de cierre del vehículo.';
    }
};

window.ovEjecutarFinalizarViajeConfirmado = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var viajeCode = (document.getElementById('ov-finalizar-viaje-id') || {}).value;
    var fechaFin = (document.getElementById('ov-finalizar-fecha') || {}).value;
    var kmActual = (document.getElementById('ov-finalizar-km') || {}).value;
    var checkConfirm = document.getElementById('ov-finalizar-check-confirm');

    if (!viajeCode) return;

    if (!checkConfirm || !checkConfirm.checked) {
        alert('Debe confirmar que desea finalizar este viaje.');
        return;
    }

    var btnSubmit = document.getElementById('btnEjecutarFinalizarViaje');
    if (btnSubmit) btnSubmit.disabled = true;

    try {
        var userFinaliza = (typeof window.usuarioLogueado !== 'undefined' && window.usuarioLogueado) || localStorage.getItem('fleet_user') || 'ADMINISTRADOR DEL SISTEMA';

        var res = await fetch(`/api/operaciones/ordenes-viaje/${encodeURIComponent(viajeCode)}/finalizar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fecha_fin: fechaFin,
                kilometraje_final: kmActual,
                usuario_finalizacion: userFinaliza
            })
        });
        var data = await res.json();

        if (data && data.ok) {
            if (typeof window.showToastNotification === 'function') {
                window.showToastNotification(data.message || `Viaje ${viajeCode} finalizado con éxito.`, 'success');
            } else {
                alert(data.message || `Viaje ${viajeCode} finalizado con éxito.`);
            }

            var modalEl = document.getElementById('modalFinalizarViajeConfirm');
            if (modalEl && typeof bootstrap !== 'undefined') {
                var modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            // Recargar datos
            await window.ovCargarDatos();
        } else {
            throw new Error((data && data.error) || 'Error al finalizar el viaje.');
        }
    } catch(err) {
        console.error('Error al finalizar viaje:', err);
        alert('Error: ' + err.message);
    } finally {
        if (btnSubmit) btnSubmit.disabled = false;
    }
};

// ── GESTIÓN DE ELIMINACIÓN DE VIAJES ─────────────────────────────────
window.ovAbrirModalEliminarViaje = function(viajeCode) {
    if (!viajeCode) return;

    var lblViaje = document.getElementById('ov-eliminar-modal-viaje-num');
    var inputId = document.getElementById('ov-eliminar-viaje-id');
    var checkConfirm = document.getElementById('ov-eliminar-check-confirm');

    if (lblViaje) lblViaje.textContent = viajeCode;
    if (inputId) inputId.value = viajeCode;
    if (checkConfirm) checkConfirm.checked = false;

    var modalEl = document.getElementById('modalEliminarViajeConfirm');
    if (modalEl && typeof bootstrap !== 'undefined') {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
};

window.ovEliminarDesdeModalEdicion = function() {
    var editId = (document.getElementById('ov-form-edit-id') || {}).value;
    if (!editId) {
        alert('No se pudo identificar la orden de viaje a eliminar.');
        return;
    }

    // Cerrar modal de edición
    var modalEditEl = document.getElementById('ovModalNuevoViaje');
    if (modalEditEl && typeof bootstrap !== 'undefined') {
        var modalEdit = bootstrap.Modal.getInstance(modalEditEl);
        if (modalEdit) modalEdit.hide();
    }

    // Abrir modal de confirmación de eliminación
    window.ovAbrirModalEliminarViaje(editId);
};

window.ovEjecutarEliminarViajeConfirmado = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var viajeCode = (document.getElementById('ov-eliminar-viaje-id') || {}).value;
    var checkConfirm = document.getElementById('ov-eliminar-check-confirm');

    if (!viajeCode) return;

    if (!checkConfirm || !checkConfirm.checked) {
        alert('Debe confirmar que desea eliminar este viaje.');
        return;
    }

    var btnSubmit = document.getElementById('btnEjecutarEliminarViaje');
    if (btnSubmit) btnSubmit.disabled = true;

    try {
        var res = await fetch(`/api/operaciones/ordenes-viaje/${encodeURIComponent(viajeCode)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        var data = await res.json();

        if (data && data.ok) {
            if (typeof window.showToastNotification === 'function') {
                window.showToastNotification(data.message || `Orden de Viaje ${viajeCode} eliminada con éxito.`, 'success');
            } else {
                alert(data.message || `Orden de Viaje ${viajeCode} eliminada con éxito.`);
            }

            var modalEl = document.getElementById('modalEliminarViajeConfirm');
            if (modalEl && typeof bootstrap !== 'undefined') {
                var modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            // Recargar datos y actualizar tabla
            await window.ovCargarDatos();
        } else {
            throw new Error((data && data.error) || 'Error al eliminar la orden de viaje.');
        }
    } catch(err) {
        console.error('Error al eliminar orden de viaje:', err);
        alert('Error: ' + err.message);
    } finally {
        if (btnSubmit) btnSubmit.disabled = false;
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
    window._ovViajeItemActivo = item;

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

    if (resServicio) resServicio.textContent = item.tipo_servicio || '—';
    if (resGuia) resGuia.textContent = item.numero_guia || '—';
    if (resPeso) resPeso.textContent = parseFloat(item.peso || 0).toFixed(2);
    if (resCant) resCant.textContent = item.cantidad || '0';
    if (resVol) resVol.textContent = parseFloat(item.volumen || 0).toFixed(2);

    // Rutas asociadas a este viaje
    var listaRutas = window._ovRutasGlobal || (typeof _ovRutasGlobal !== 'undefined' ? _ovRutasGlobal : []) || window.dataGlobalRutasModulo || [];
    var rutasAsoc = listaRutas.filter(r => r.viaje === viajeCode);
    var badgeRutas = document.getElementById('ov-mon-badge-rutas');
    if (badgeRutas) badgeRutas.textContent = rutasAsoc.length;

    // Llenar tabla de órdenes de servicio vinculadas en tiempo real
    var tbodyRutas = document.getElementById('ov-mon-tbody-rutas');
    if (tbodyRutas) {
        tbodyRutas.innerHTML = `<tr><td colspan="13" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Buscando órdenes de servicio asociadas...</td></tr>`;
        (async () => {
            try {
                var rOs = await fetch(`/api/operaciones/ordenes-servicio?viaje=${encodeURIComponent(viajeCode)}`);
                var jOs = await rOs.json();
                var listaOS = (jOs && jOs.ok && Array.isArray(jOs.data)) ? jOs.data : [];
                
                // Si no vinieron de API o viene vacío, combinar con rutasAsoc locales si existen
                if (listaOS.length === 0 && rutasAsoc.length > 0) {
                    listaOS = rutasAsoc.map(r => ({
                        id: r.id || r.orden,
                        codigo_orden: r.orden,
                        estado_servicio: 'INICIADO',
                        fecha_fmt: (item.fecha_viaje || '').slice(0, 10),
                        tipo_contratacion: 'PROPIO',
                        cliente_nombre: item.cliente,
                        remitente: r.remitente || item.cliente,
                        tipo_servicio: r.tipo_servicio || 'CARGA GENERAL',
                        volumen_documentos: r.volumen_total || 0,
                        carga_doc: r.cantidad_total || 0,
                        peso_documentos: r.peso_total || 0
                    }));
                }

                if (badgeRutas) badgeRutas.textContent = listaOS.length;
                if (listaOS.length > 0) {
                    tbodyRutas.innerHTML = listaOS.map(os => {
                        const liqTexto = os.estado_liquidacion || 'PENDIENTE';
                        const badgeLiq = `<span class="badge bg-warning bg-opacity-10 text-warning border border-warning-subtle font-monospace px-2 py-0.5" style="font-size:0.68rem;">${liqTexto}</span>`;
                        const esRetorno = os.es_retorno === 1 || os.es_retorno === '1' || os.es_retorno === true;
                        const badgeSentido = esRetorno 
                            ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle font-monospace"><i class="bi bi-arrow-left me-0.5"></i>RETORNO</span>`
                            : `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle font-monospace"><i class="bi bi-arrow-right me-0.5"></i>IDA</span>`;

                        return `
                        <tr style="cursor:pointer;" onclick="window.ovVerEditarOrdenServicio('${os.id || os.codigo_orden || ''}')" title="Clic para ver o editar Orden de Servicio">
                            <td class="fw-bold text-primary font-monospace">${os.codigo_orden || '---'}</td>
                            <td><span class="badge ${os.estado_servicio === 'FINALIZADO' ? 'bg-primary' : 'bg-success-subtle text-success border border-success-subtle'}">${os.estado_servicio || 'INICIADO'}</span></td>
                            <td>${badgeLiq}</td>
                            <td class="font-monospace text-secondary">${os.fecha_fmt || (item.fecha_viaje || '').slice(0, 10) || '---'}</td>
                            <td><span class="badge bg-light text-secondary border">${os.tipo_contratacion || 'PROPIO'}</span></td>
                            <td class="fw-semibold text-dark text-truncate" style="max-width:140px;" title="${os.cliente_nombre || item.cliente || ''}">${os.cliente_nombre || item.cliente || 'CLIENTE'}</td>
                            <td class="text-muted small text-truncate" style="max-width:140px;" title="${os.destinatario || ''}">${os.destinatario || '---'}</td>
                            <td>${badgeSentido}</td>
                            <td><span class="badge bg-light text-secondary border">${os.tipo_servicio || 'CARGA GENERAL'}</span></td>
                            <td class="fw-semibold text-dark">${os.ruta || item.ruta || '---'}</td>
                            <td class="font-monospace">${parseFloat(os.volumen_documentos || 0).toFixed(3)}</td>
                            <td class="font-monospace">${os.carga_doc || 0}</td>
                            <td class="font-monospace fw-bold text-success">${parseFloat(os.peso_documentos || 0).toFixed(2)}</td>
                        </tr>
                        `;
                    }).join('');
                } else {
                    if (badgeRutas) badgeRutas.textContent = '0';
                    tbodyRutas.innerHTML = `<tr><td colspan="13" class="text-center py-4 text-muted"><i class="bi bi-inbox me-1"></i> Sin órdenes de servicio vinculadas a este viaje.</td></tr>`;
                }
            } catch (err) {
                if (badgeRutas) badgeRutas.textContent = '0';
                tbodyRutas.innerHTML = `<tr><td colspan="13" class="text-center py-4 text-muted"><i class="bi bi-inbox me-1"></i> Sin órdenes de servicio vinculadas a este viaje.</td></tr>`;
            }

            // ── Cargar Documentos de Transporte (GREs) Vinculados a las OS del Viaje ──
            var tbodyDocs = document.getElementById('ov-mon-tbody-documentos');
            var badgeDocs = document.getElementById('ov-mon-badge-documentos');
            var resPesoEl = document.getElementById('ov-mon-res-peso');

            if (tbodyDocs) {
                try {
                    let totalDocsViaje = [];
                    let pesoTotalCalculado = 0;

                    if (Array.isArray(listaOS) && listaOS.length > 0) {
                        for (const o of listaOS) {
                            if (Array.isArray(o.documentos) && o.documentos.length > 0) {
                                o.documentos.forEach(d => {
                                    totalDocsViaje.push({ ...d, codigo_orden: o.codigo_orden, estado_liquidacion: o.estado_liquidacion });
                                    pesoTotalCalculado += parseFloat(d.peso || 0);
                                });
                            } else {
                                // Consultar detalle individual si no vinieron embebidos
                                try {
                                    var rDet = await fetch(`/api/operaciones/ordenes-servicio/${o.id || o.codigo_orden}`);
                                    var jDet = await rDet.json();
                                    if (jDet && jDet.ok && jDet.data && Array.isArray(jDet.data.documentos)) {
                                        jDet.data.documentos.forEach(d => {
                                            totalDocsViaje.push({ ...d, codigo_orden: o.codigo_orden, estado_liquidacion: o.estado_liquidacion });
                                            pesoTotalCalculado += parseFloat(d.peso || 0);
                                        });
                                    }
                                } catch (_) {}
                            }
                        }
                    }

                    if (badgeDocs) badgeDocs.textContent = totalDocsViaje.length;
                    if (resPesoEl && pesoTotalCalculado > 0) {
                        resPesoEl.textContent = (pesoTotalCalculado / 1000).toFixed(2);
                    }

                    if (totalDocsViaje.length > 0) {
                        tbodyDocs.innerHTML = totalDocsViaje.map(d => `
                            <tr>
                                <td class="fw-bold text-primary font-monospace">${d.codigo_orden || '---'}</td>
                                <td class="font-monospace fw-bold text-dark">${d.numero_documento || '---'}</td>
                                <td><span class="badge bg-warning bg-opacity-10 text-warning border border-warning-subtle font-monospace">${d.estado_liquidacion || 'PENDIENTE'}</span></td>
                                <td class="font-monospace text-secondary">${(d.fecha_carga || '').slice(0, 10) || '---'}</td>
                                <td class="font-monospace">${d.gr_remitente || '---'}</td>
                                <td class="font-monospace">${d.numero_transporte || '---'}</td>
                                <td class="fw-semibold text-dark text-truncate" style="max-width:140px;" title="${d.remitente || ''}">${d.remitente || '---'}</td>
                                <td class="text-dark text-truncate" style="max-width:140px;" title="${d.destinatario || ''}">${d.destinatario || '---'}</td>
                                <td class="text-muted small text-truncate" style="max-width:160px;">${d.direccion_destino || '---'}</td>
                                <td class="font-monospace text-secondary">${d.placa_referencia || item.placa_tracto || '---'}</td>
                                <td class="font-monospace text-end">${parseFloat(d.volumen || 0).toFixed(3)}</td>
                                <td class="font-monospace text-end">${d.cantidad || 1}</td>
                                <td class="font-monospace text-end fw-bold text-success">${parseFloat(d.peso || 0).toLocaleString()}</td>
                                <td class="font-monospace text-secondary">${(d.fecha_entrega || '').slice(0, 10) || '---'}</td>
                                <td class="text-end">
                                    <button type="button" class="btn btn-outline-primary btn-sm py-0 px-2 fw-bold" style="font-size:0.68rem;" onclick="if(typeof cargarModuloAislado==='function') cargarModuloAislado('operaciones/guias-remision');">
                                        <i class="bi bi-eye"></i> Ver
                                    </button>
                                </td>
                            </tr>
                        `).join('');
                    } else {
                        tbodyDocs.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-muted"><i class="bi bi-inbox me-1"></i> No se registran documentos de transporte para este viaje.</td></tr>`;
                    }
                } catch (eDoc) {
                    tbodyDocs.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-muted"><i class="bi bi-inbox me-1"></i> No se registran documentos de transporte para este viaje.</td></tr>`;
                }
            }
        })();
    }

    // ── 1. ABRIR VENTANA Y BACKDROP AL INSTANTE (0ms retraso, fluidez total 60fps) ──
    var drawer = document.getElementById('ovMonDrawer');
    var backdrop = document.getElementById('ovMonDrawerBackdrop');
    if (drawer) {
        drawer.style.left = '';
        drawer.style.right = '';
        drawer.style.width = '';
        drawer.classList.add('active');
    }
    if (backdrop) backdrop.classList.add('active');

    // Resetear a la primera tab (Resumen)
    var btnPrimeraTab = document.querySelector('.ov-mon-tab-item');
    if (btnPrimeraTab) window.ovMonCambiarTabSpatial(0, 'resumen', btnPrimeraTab);

    // Inicializar posición de píldora elástica
    setTimeout(() => {
        var firstBtn = document.querySelector('.ov-mon-tab-item[data-index="0"]');
        if (firstBtn) window.ovMoverPildoraElastica(firstBtn, 0);
    }, 50);

    // ── 2. CARGA ASÍNCRONA EN SEGUNDO PLANO (NO BLOQUEA LA APERTURA) ──
    // Buscar combustible asociado por viaje o placa
    var tbodyComb = document.getElementById('ov-mon-tbody-combustible');
    if (tbodyComb) {
        tbodyComb.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-warning me-2"></div>Buscando abastecimientos...</td></tr>`;
        (async () => {
            try {
                var paramsComb = new URLSearchParams({ viaje: viajeCode, limit: 20 });
                var rComb = await fetch(`/api/combustible/vales?${paramsComb.toString()}`);
                var jComb = await rComb.json();
                var badgeComb = document.getElementById('ov-mon-tab-comb-badge');
                if (jComb && jComb.ok && Array.isArray(jComb.data) && jComb.data.length > 0) {
                    if (badgeComb) badgeComb.textContent = jComb.data.length;
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
                            <td class="text-center">
                                <button type="button" class="btn btn-outline-warning btn-sm py-0 px-2 fw-bold" style="font-size:0.7rem;" onclick="window.ovVerEditarValeCombustible('${c.id || ''}')" title="Ver / Editar Vale">
                                    <i class="bi bi-pencil-square"></i> Ver
                                </button>
                            </td>
                        </tr>
                    `).join('');
                } else {
                    if (badgeComb) badgeComb.textContent = '0';
                    tbodyComb.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted"><i class="bi bi-inbox me-1"></i> No se registran abastecimientos para este viaje.</td></tr>`;
                }
            } catch(e) {
                var badgeCombCatch = document.getElementById('ov-mon-tab-comb-badge');
                if (badgeCombCatch) badgeCombCatch.textContent = '0';
                tbodyComb.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted"><i class="bi bi-inbox me-1"></i> No se registran abastecimientos para este viaje.</td></tr>`;
            }
        })();
    }

    // ── Obtener Capacidad Real de Tanque desde la tabla de Placas ──
    var capEl = document.getElementById('ov-mon-comb-capacidad');
    var autoEl = document.getElementById('ov-mon-comb-autonomia');
    var tractoPlaca = (item.placa_tracto || '').trim().toUpperCase();

    if (capEl) {
        capEl.textContent = 'Consultando...';
        (async () => {
            try {
                if (!window._ovPlacasCache || !window._ovPlacasCache.length) {
                    var rPlacas = await fetch('/api/placas-lista').then(r => r.ok ? r.json() : []).catch(() => []);
                    if (Array.isArray(rPlacas)) window._ovPlacasCache = rPlacas;
                }
                
                var pObj = (window._ovPlacasCache || []).find(p => {
                    var pl = (p.placa || p[0] || '').toString().trim().toUpperCase();
                    return pl === tractoPlaca;
                });

                var capTanqueNum = 0;
                if (pObj) {
                    var rawCap = pObj.capacidad_tanque || pObj['CAPACIDAD DE TANQUE TOTAL'] || pObj['Capacidad Tanque Total'] || '';
                    if (!rawCap && (pObj.tanque_1 || pObj.tanque_2 || pObj.tanque_3)) {
                        var t1 = parseFloat(pObj.tanque_1) || 0;
                        var t2 = parseFloat(pObj.tanque_2) || 0;
                        var t3 = parseFloat(pObj.tanque_3) || 0;
                        rawCap = t1 + t2 + t3;
                    }
                    capTanqueNum = parseFloat(rawCap) || 0;
                }

                if (capTanqueNum > 0) {
                    capEl.textContent = `${capTanqueNum % 1 === 0 ? capTanqueNum : capTanqueNum.toFixed(1)} Gal`;
                    if (autoEl) {
                        var autEst = Math.round(capTanqueNum * 6.5);
                        autoEl.textContent = `Autonomía: ~${autEst} km`;
                    }
                } else {
                    capEl.textContent = '150 Gal';
                    if (autoEl) autoEl.textContent = 'Autonomía: ~980 km';
                }
            } catch(e) {
                capEl.textContent = '150 Gal';
            }
        })();
    }
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

// ── ACCIONES DIRECTAS DESDE EL DETALLE DEL VIAJE (AGREGAR / EDITAR) ───
window.ovAgregarValeCombustibleDesdeDetalle = function() {
    var viajeCode = window._ovViajeMonitoreoActivo;
    if (typeof window.cvAbrirModalNuevo === 'function') {
        window.cvAbrirModalNuevo();
        var fViaje = document.getElementById('cv-f-viaje');
        if (fViaje && viajeCode) fViaje.value = viajeCode;
    } else if (typeof window.cargarModuloAislado === 'function') {
        window.cargarModuloAislado('operaciones/combustible-vales');
    } else {
        alert('Módulo de Vales de Combustible disponible en el menú de Operaciones.');
    }
};

window.ovVerEditarValeCombustible = function(valeId) {
    if (typeof window.cvAbrirModalEditar === 'function') {
        window.cvAbrirModalEditar(valeId);
    } else {
        alert(`Vale de Combustible seleccionado: ${valeId}`);
    }
};

window.ovAgregarOrdenServicioDesdeDetalle = function() {
    var viajeCode = window._ovViajeMonitoreoActivo;
    if (typeof window.osAbrirModalNuevo === 'function') {
        window.osAbrirModalNuevo();
    } else if (typeof window.cargarModuloAislado === 'function') {
        window.cargarModuloAislado('operaciones/ordenes-servicio');
    } else {
        alert('Módulo de Órdenes de Servicio disponible en el menú de Operaciones.');
    }
};

window.ovVerEditarOrdenServicio = function(codigoOrden) {
    if (typeof window.osAbrirModalEditarCodigo === 'function') {
        window.osAbrirModalEditarCodigo(codigoOrden);
    } else if (typeof window.cargarModuloAislado === 'function') {
        window.cargarModuloAislado('operaciones/ordenes-servicio');
    } else {
        alert(`Orden de Servicio: ${codigoOrden}`);
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

    // Si es seguimiento GPS, renderizar o recalcular mapa Leaflet
    if (tabKey === 'gps') {
        setTimeout(() => {
            window.ovRenderGpsMap();
        }, 60);
    }
};

// ── RUTA INTERACTIVA Y MAPA SATELITAL (LEAFLET) ───────────────────────
window._ovMapInstance = null;

window.ovRenderGpsMap = function() {
    var container = document.getElementById('ov-map-seguimiento');
    if (!container || typeof L === 'undefined') return;

    var viajeCode = window._ovViajeMonitoreoActivo;
    var listaViajes = window._ovViajesGlobal || (typeof _ovViajesGlobal !== 'undefined' ? _ovViajesGlobal : []) || window.dataGlobalOrdenesViajeModulo || [];
    var item = listaViajes.find(x => x.viaje === viajeCode) || {};

    // Obtener ruta y puntos de partida / llegada
    var rutaTxt = (item.ruta || '').trim();
    var partidaTxt = 'LIMA / CALLAO';
    var llegadaTxt = rutaTxt || 'DESTINO NACIONAL';

    var txtPartidaEl = document.getElementById('ov-map-txt-partida');
    var txtLlegadaEl = document.getElementById('ov-map-txt-llegada');
    if (txtPartidaEl) txtPartidaEl.textContent = partidaTxt;
    if (txtLlegadaEl) txtLlegadaEl.textContent = llegadaTxt;

    // Coordenadas base por ciudad / punto conocido en Perú
    var ciudadesCoords = {
        'AREQUIPA': [-16.409047, -71.537451],
        'TRUJILLO': [-8.11599, -79.02998],
        'CHICLAYO': [-6.77137, -79.84088],
        'PIURA': [-5.19449, -80.63282],
        'CUSCO': [-13.53195, -71.96746],
        'HUANCAYO': [-12.06513, -75.20486],
        'ICA': [-14.06777, -75.72861],
        'PISCO': [-13.710278, -76.205],
        'CHINCHA': [-13.41847, -76.13235],
        'TACNA': [-18.00657, -70.24627],
        'CHIMBOTE': [-9.07444, -78.59361],
        'LIMA': [-12.046374, -77.042793],
        'CALLAO': [-12.0565, -77.1181]
    };

    var startCoords = [-12.046374, -77.042793]; // Lima
    var endCoords = [-16.409047, -71.537451];   // Arequipa por defecto si no coincide

    var matchKey = Object.keys(ciudadesCoords).find(c => rutaTxt.toUpperCase().includes(c));
    if (matchKey && matchKey !== 'LIMA' && matchKey !== 'CALLAO') {
        endCoords = ciudadesCoords[matchKey];
    } else if (matchKey === 'CALLAO' || matchKey === 'LIMA') {
        endCoords = [-12.000, -77.000];
    }

    if (!window._ovMapInstance) {
        window._ovMapInstance = L.map('ov-map-seguimiento', {
            zoomControl: true,
            attributionControl: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(window._ovMapInstance);
    }

    // Limpiar capas previas excepto el tilelayer
    window._ovMapInstance.eachLayer(layer => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
            window._ovMapInstance.removeLayer(layer);
        }
    });

    // Icono Verde Partida
    var startIcon = L.divIcon({
        className: 'ov-map-marker-start',
        html: `<div style="background:#16a34a; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid #fff;"><i class="bi bi-geo-alt-fill" style="font-size:14px;"></i></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28]
    });

    // Icono Rojo Llegada
    var endIcon = L.divIcon({
        className: 'ov-map-marker-end',
        html: `<div style="background:#dc2626; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid #fff;"><i class="bi bi-flag-fill" style="font-size:13px;"></i></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28]
    });

    var markerStart = L.marker(startCoords, { icon: startIcon }).addTo(window._ovMapInstance);
    markerStart.bindPopup(`<b>Punto de Partida:</b><br>${partidaTxt}`);

    var markerEnd = L.marker(endCoords, { icon: endIcon }).addTo(window._ovMapInstance);
    markerEnd.bindPopup(`<b>Punto de Llegada:</b><br>${llegadaTxt}`);

    // Trazar línea de ruta
    var routeLine = L.polyline([startCoords, endCoords], {
        color: '#0284c7',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 8'
    }).addTo(window._ovMapInstance);

    var bounds = L.latLngBounds([startCoords, endCoords]);
    window._ovMapInstance.fitBounds(bounds, { padding: [50, 50] });

    setTimeout(() => {
        if (window._ovMapInstance) window._ovMapInstance.invalidateSize();
    }, 150);
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

// ── ILUMINACIÓN ESPECULAR (DESACTIVADA PARA MÁXIMA NITIDEZ Y RENDIMIENTO) ──
// Se neutraliza el cálculo dinámico en mousemove para evitar repintados continuos en la GPU
window._ovSpecularConfigured = true;

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

// ── REFRESCAR MONITOREO ACTUAL ──────────────────────────────────────
window.ovRecargarMonitoreoActual = function() {
    if (window._ovViajeMonitoreoActivo) {
        window.ovAbrirModalMonitoreoViaje(window._ovViajeMonitoreoActivo);
    }
};

// ── INTEGRACIÓN CON FORMULARIOS DE OS Y VALES DESDE DETALLE DE VIAJE ───

// 1. Órdenes de Servicio
window.ovAgregarOrdenServicioDesdeDetalle = async function() {
    const viajeCode = window._ovViajeMonitoreoActivo;
    if (!viajeCode) return;
    const item = window._ovViajeItemActivo || {};
    await asegurarModuloOrdenesServicioCargado();
    if (typeof window.osAbrirModalNuevo === 'function') {
        window.osAbrirModalNuevo(viajeCode, 'detalle_viaje', {
            placa_tracto: item.placa_tracto || '',
            placa_carreta: item.placa_remolque || item.placa_carreta || '',
            cliente: item.cliente || '',
            conductor: item.conductor || ''
        });
    }
};

window.ovVerEditarOrdenServicio = async function(idOCodigo) {
    if (!idOCodigo) return;
    await asegurarModuloOrdenesServicioCargado();
    if (typeof window.osAbrirModalEditar === 'function') {
        window.osAbrirModalEditar(idOCodigo, 'detalle_viaje');
    }
};

async function asegurarModuloOrdenesServicioCargado() {
    if (!document.getElementById('modalOsForm')) {
        try {
            const resp = await fetch('/modulos/operaciones/ordenes-servicio/vista.html');
            const html = await resp.text();
            const div = document.createElement('div');
            div.innerHTML = html;
            
            // Inyectar estilos
            div.querySelectorAll('style').forEach(st => document.head.appendChild(st));
            
            // Inyectar modales
            const modalForm = div.querySelector('#modalOsForm');
            const modalGre = div.querySelector('#modalOsSelectorGre');
            if (modalForm) document.body.appendChild(modalForm);
            if (modalGre) document.body.appendChild(modalGre);
        } catch (e) {
            console.error("Error cargando vista de órdenes de servicio:", e);
        }
    }

    if (typeof window.osAbrirModalNuevo !== 'function') {
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = '/modulos/operaciones/ordenes-servicio/logica.js?v=' + Date.now();
            script.onload = () => resolve();
            script.onerror = () => resolve();
            document.body.appendChild(script);
        });
    }
}

// 2. Vales de Combustible
window.ovAgregarValeCombustibleDesdeDetalle = async function() {
    const viajeCode = window._ovViajeMonitoreoActivo;
    if (!viajeCode) return;
    await asegurarModuloCombustibleValesCargado();
    if (typeof window.cvAbrirModalNuevo === 'function') {
        window.cvAbrirModalNuevo(viajeCode, 'detalle_viaje');
    }
};

window.ovVerEditarValeCombustible = async function(id) {
    if (!id) return;
    await asegurarModuloCombustibleValesCargado();
    if (typeof window.cvAbrirModalEditar === 'function') {
        window.cvAbrirModalEditar(id, 'detalle_viaje');
    }
};

async function asegurarModuloCombustibleValesCargado() {
    if (!document.getElementById('cvModalForm')) {
        try {
            const resp = await fetch('/modulos/operaciones/combustible-vales/vista.html');
            const html = await resp.text();
            const div = document.createElement('div');
            div.innerHTML = html;
            
            div.querySelectorAll('style').forEach(st => document.head.appendChild(st));
            
            const modalForm = div.querySelector('#cvModalForm');
            const modalCompras = div.querySelector('#cvModalComprasExternas');
            if (modalForm) document.body.appendChild(modalForm);
            if (modalCompras) document.body.appendChild(modalCompras);
        } catch (e) {
            console.error("Error cargando vista de vales de combustible:", e);
        }
    }

    if (typeof window.cvAbrirModalNuevo !== 'function') {
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = '/modulos/operaciones/combustible-vales/logica.js?v=' + Date.now();
            script.onload = () => resolve();
            script.onerror = () => resolve();
            document.body.appendChild(script);
        });
    }
}



