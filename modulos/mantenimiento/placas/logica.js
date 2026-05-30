// ================================================================
// MÓDULO: PLACAS — lógica aislada
// Cargado dinámicamente por cargarModuloAislado('mantenimiento/placas')
// ================================================================

// ── Variables de estado del módulo ──────────────────────────────
var dataGlobalPlacas    = window.dataGlobalPlacas || [];
var datosFiltradosPlacas = window.datosFiltradosPlacas || [];
var paginaActualPlacas  = window.paginaActualPlacas || 1;
var colActualesPlacas   = window.colActualesPlacas || 4;
window.filasPlacasConfig = window.filasPlacasConfig || parseInt(localStorage.getItem('fleet_placas_filas') || '4');
var ITEMS_POR_PAGINA    = colActualesPlacas * window.filasPlacasConfig;

// ── Poblar selects dinámicos desde dataGlobalPlacas ──────────────
window.poblarSelectsFormularios = function(datos) {
    if (!datos || datos.length === 0) return;
    const filas = datos.filter(f => (f[0]||'').toUpperCase() !== 'PLACA');

    function unicos(idx) {
        const seen = new Map();
        filas.forEach(f => {
            const v = (f[idx]||'').toString().trim();
            if (v) { const key = v.toUpperCase(); if (!seen.has(key)) seen.set(key, v); }
        });
        return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
    }

    function poblar(id, valores) {
        if (typeof window._cbInit !== 'function') return;
        var items = valores.map(function(v) { return { value: v, label: v }; });
        window._cbInit(id, items, 'Buscar…');
    }

    function poblarClientes(id) {
        if (typeof window._cbInit !== 'function') return;
        const mapaClientes = new Map();
        filas.forEach(f => { const n = (f[1]||'').toString().trim(); if (n && !mapaClientes.has(n)) mapaClientes.set(n, (f[2]||'').toString().trim()); });
        var items = [...mapaClientes.keys()].sort().map(function(n) { return { value: n, label: n }; });
        window._cbInit(id, items, 'Buscar cliente…');
    }

    const marcas   = unicos(3);
    const tipos    = unicos(5);
    const subTipos = unicos(6);
    const colores  = unicos(7);
    const confs    = unicos(12);

    poblarClientes('p_cliente');
    poblar('p_marca',    marcas);
    poblar('p_tipo',     tipos);
    poblar('p_sub_tipo', subTipos);
    poblar('p_color',    colores);
    poblar('p_conf',     confs);

    poblarClientes('e_cliente');
    poblar('e_marca',    marcas);
    poblar('e_tipo',     tipos);
    poblar('e_sub_tipo', subTipos);
    poblar('e_color',    colores);
    poblar('e_conf',     confs);
};

// ── Carga principal ──────────────────────────────────────────────
function cargarTablaPlacas(forzarRefresh = false) {
    if (!forzarRefresh && dataGlobalPlacas.length > 0) { mostrarPlacas(dataGlobalPlacas); return; }
    if (typeof window.mostrarSkeleton === 'function') {
        window.mostrarSkeleton('contenedorPlacasDinamico', 'cards', 8);
    } else {
        const c = document.getElementById('contenedorPlacasDinamico');
        if (c) c.innerHTML = '<div class="w-100 text-center py-5"><span class="spinner-border text-warning spinner-border-sm"></span> Cargando...</div>';
    }
    fetch('/api/script/obtenerDatosPlacas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
        .then(function(r) { return r.json(); })
        .then(function(r) { mostrarPlacas(r.data || []); })
        .catch(function() { mostrarPlacas([]); });
}

window.cambiarColumnasPlacas = function(cols) {
    colActualesPlacas = parseInt(cols);
    ITEMS_POR_PAGINA = colActualesPlacas * window.filasPlacasConfig;
    localStorage.setItem('fleet_pref_placas_cols', colActualesPlacas);
    paginaActualPlacas = 1;
    const contenedor = document.getElementById('contenedorPlacasDinamico');
    if (contenedor) contenedor.className = `flex-grow-1 overflow-auto p-3 placas-grid-view grid-cols-${colActualesPlacas}`;
    renderizarPaginaPlacas();
};

window.cambiarFilasPlacas = function(filas) {
    window.filasPlacasConfig = parseInt(filas) || 4;
    localStorage.setItem('fleet_placas_filas', window.filasPlacasConfig);
    ITEMS_POR_PAGINA = colActualesPlacas * window.filasPlacasConfig;
    paginaActualPlacas = 1;
    renderizarPaginaPlacas();
};

// ── Autocompleta RUC al seleccionar cliente ──────────────────────────────────
window.autocompletarRucSelect = function(clienteNombre, rucFieldId) {
    if (!clienteNombre || !dataGlobalPlacas) return;
    const nombre = clienteNombre.toString().trim().toUpperCase();
    const match = dataGlobalPlacas.find(f => (f[1]||'').toString().trim().toUpperCase() === nombre);
    const rucEl = document.getElementById(rucFieldId);
    if (rucEl && match) rucEl.value = match[2] || '';
};

// ── Abre modal para agregar nuevo cliente ────────────────────────────────────
window.abrirModalNuevoCliente = function(targetSelectId, targetRucId) {
    const nc_nombre = document.getElementById('nc_nombre');
    const nc_ruc    = document.getElementById('nc_ruc');
    const nc_ts     = document.getElementById('nc_target_select');
    const nc_tr     = document.getElementById('nc_target_ruc');
    if (nc_nombre) nc_nombre.value = '';
    if (nc_ruc)    nc_ruc.value    = '';
    if (nc_ts)     nc_ts.value     = targetSelectId || '';
    if (nc_tr)     nc_tr.value     = targetRucId    || '';
    const modalEl = document.getElementById('modalNuevoCliente');
    if (modalEl) new bootstrap.Modal(modalEl).show();
};

// ── Guarda el nuevo cliente desde el modal y lo inyecta en el select ─────────
window.guardarNuevoCliente = function() {
    const nombre = (document.getElementById('nc_nombre')?.value || '').trim().toUpperCase();
    const ruc    = (document.getElementById('nc_ruc')?.value    || '').trim();
    if (!nombre) { alert('Ingresa la Razón Social del cliente.'); return; }

    const targetSelectId = document.getElementById('nc_target_select')?.value || '';
    const targetRucId    = document.getElementById('nc_target_ruc')?.value    || '';

    // Añadir al dataset del combobox (si no existe) y seleccionar
    if (typeof window._cbSet === 'function' && document.getElementById(targetSelectId + '-txt')) {
        if (window._cbData && window._cbData[targetSelectId]) {
            var existe = window._cbData[targetSelectId].some(function(it) { return it.value === nombre; });
            if (!existe) window._cbData[targetSelectId].push({ value: nombre, label: nombre });
        }
        window._cbSet(targetSelectId, nombre, nombre);
        if (typeof window._cbCallbacks !== 'undefined' && window._cbCallbacks[targetSelectId]) {
            window._cbCallbacks[targetSelectId](nombre, nombre);
        }
    } else {
        const sel = document.getElementById(targetSelectId);
        if (sel) {
            const existe = [...sel.options].some(o => o.value === nombre);
            if (!existe) { const opt = document.createElement('option'); opt.value = nombre; opt.textContent = nombre; sel.appendChild(opt); }
            sel.value = nombre;
        }
    }

    // Rellenar RUC
    const rucEl = document.getElementById(targetRucId);
    if (rucEl) rucEl.value = ruc;

    bootstrap.Modal.getInstance(document.getElementById('modalNuevoCliente'))?.hide();
};

function mostrarPlacas(datos) {
    if(procesadorErroresCuota(datos, 'contenedorPlacasDinamico')) return;
    dataGlobalPlacas = datos;
    if (typeof poblarSelectsFormularios === 'function') poblarSelectsFormularios(datos);
    let datosUtiles = datos.filter(f => (f[0]||'').toUpperCase() !== 'PLACA');
    datosUtiles.sort((a, b) => {
        const cliA = (a[1]||'').trim().toUpperCase();
        const cliB = (b[1]||'').trim().toUpperCase();
        if (cliA !== cliB) return cliA.localeCompare(cliB);
        return (a[0]||'').localeCompare(b[0]||'');
    });
    datosFiltradosPlacas = datosUtiles;
    const setClientes = new Set(), setTipos = new Set(), setMarcas = new Set(), setEstados = new Set();
    let setFormPlacas=new Set(), setFormClientes=new Set(), setFormTipos=new Set(), setFormMarcas=new Set(), setFormModelos=new Set(), setFormConfs=new Set(), setFormCombs=new Set(), setFormUts=new Set();
    datosUtiles.forEach((fila) => {
        const plc = fila[0] ? fila[0].trim() : ''; const cli = fila[1] ? fila[1].trim() : ''; const tip = fila[5] ? fila[5].trim() : ''; const mar = fila[3] ? fila[3].trim() : ''; const mod = fila[4] ? fila[4].trim() : ''; const ruc = fila[2] ? fila[2].trim() : ''; const cnf = fila[12] ? fila[12].trim() : ''; const cmb = fila[14] ? fila[14].trim() : ''; const est = fila[18] ? fila[18].trim() : ''; const uts = fila[19] ? fila[19].trim() : '';
        if (cli && cli !== '-') setClientes.add(cli);
        if (tip && tip !== '-') setTipos.add(tip);
        if (mar && mar !== '-') setMarcas.add(mar);
        if (est === 'Activa' || est === 'Inactiva') setEstados.add(est);
        if(plc && plc!=="-") setFormPlacas.add(plc); if(cli && cli!=="-") setFormClientes.add(cli); if(tip && tip!=="-") setFormTipos.add(tip); if(mod && mod!=="-") setFormModelos.add(mod); if(mar && mar!=="-") setFormMarcas.add(mar); if(cnf && cnf!=="-") setFormConfs.add(cnf); if(cmb && cmb!=="-") setFormCombs.add(cmb); if(uts && uts!=="-") setFormUts.add(uts);
    });
    rellenarFiltroCheck('filtroCliente', setClientes, 'filtrarPlacasAvanzado');
    rellenarFiltroCheck('filtroTipo', setTipos, 'filtrarPlacasAvanzado');
    rellenarFiltroCheck('filtroMarca', setMarcas, 'filtrarPlacasAvanzado');
    rellenarFiltroCheck('filtroEstado', setEstados, 'filtrarPlacasAvanzado');
    rellenarDatalist('dl-placas', setFormPlacas); rellenarDatalist('i_placa', setFormPlacas); rellenarDatalist('dl-clientes', setFormClientes); rellenarDatalist('dl-tipos', setFormTipos); rellenarDatalist('dl-marcas', setFormMarcas); rellenarDatalist('dl-modelos', setFormModelos); rellenarDatalist('dl-confs', setFormConfs); rellenarDatalist('dl-combs', setFormCombs); rellenarDatalist('dl-uts', setFormUts);
    paginaActualPlacas = 1;
    cambiarColumnasPlacas(colActualesPlacas);
    if (typeof window.actualizarBadgesSidebar === 'function') window.actualizarBadgesSidebar();
    _restaurarFiltrosPlacas();
}

// ── Filtro avanzado ──────────────────────────────────────────────
window.filtrarPlacasAvanzado = function() {
    const txt = document.getElementById('buscadorPlacas')?.value.toLowerCase() || '';
    const chkCli = Array.from(document.querySelectorAll('#filtroCliente input:checked')).map(e=>e.value);
    const chkTip = Array.from(document.querySelectorAll('#filtroTipo input:checked')).map(e=>e.value);
    const chkMar = Array.from(document.querySelectorAll('#filtroMarca input:checked')).map(e=>e.value);
    const chkEst = Array.from(document.querySelectorAll('#filtroEstado input:checked')).map(e=>e.value);
    let kpiCamion=0, kpiCarreta=0, kpiSemi=0, kpiTracto=0;
    let datosUtiles = dataGlobalPlacas.filter(f => (f[0]||'').toUpperCase() !== 'PLACA');
    datosFiltradosPlacas = datosUtiles.filter(row => {
        const plc = (row[0]||'').toLowerCase();
        const cli = row[1] ? row[1].trim() : '';
        const tip = row[5] ? row[5].trim() : '';
        const mar = row[3] ? row[3].trim() : '';
        const est = row[18] ? row[18].trim() : '';
        const textoFila = plc + ' ' + mar.toLowerCase();
        const ok = ((!txt || textoFila.includes(txt)) && (!chkCli.length || chkCli.includes(cli)) && (!chkTip.length || chkTip.includes(tip)) && (!chkMar.length || chkMar.includes(mar)) && (!chkEst.length || chkEst.includes(est)));
        if (ok) {
            const t = tip.toLowerCase();
            if (t.includes('cami') || t.includes('camion')) kpiCamion++;
            else if (t.includes('carreta')) kpiCarreta++;
            else if (t.includes('semirremolque')||t.includes('semi')) kpiSemi++;
            else if (t.includes('tracto')) kpiTracto++;
        }
        return ok;
    });
    const safe = v => document.getElementById(v);
    if (safe('kpi-camion')) safe('kpi-camion').innerText = kpiCamion;
    if (safe('kpi-carreta')) safe('kpi-carreta').innerText = kpiCarreta;
    if (safe('kpi-semi')) safe('kpi-semi').innerText = kpiSemi;
    if (safe('kpi-tracto')) safe('kpi-tracto').innerText = kpiTracto;
    paginaActualPlacas = 1;
    renderizarPaginaPlacas();
    _guardarFiltrosPlacas();
};

function actualizarIndicadoresPlacas(datos) {
    let camiones = 0, carretas = 0, semirremolques = 0, tractos = 0;

    datos.forEach(fila => {
        if ((fila[0] || '').toUpperCase() === 'PLACA') return;
        const tipo = (fila[5] || '').toString().trim().toUpperCase();
        if (tipo.includes('CAMI')) camiones++;
        else if (tipo.includes('CARRETA')) carretas++;
        else if (tipo.includes('SEMI')) semirremolques++;
        else if (tipo.includes('TRACTO')) tractos++;
    });

    const elCamiones = document.getElementById('kpi-camion');
    const elCarretas = document.getElementById('kpi-carreta');
    const elSemis = document.getElementById('kpi-semi');
    const elTractos = document.getElementById('kpi-tracto');

    if (elCamiones) elCamiones.innerText = camiones;
    if (elCarretas) elCarretas.innerText = carretas;
    if (elSemis) elSemis.innerText = semirremolques;
    if (elTractos) elTractos.innerText = tractos;
}

// ── Helpers Features ────────────────────────────────────────────

function _contarAlertasCliente(cli) {
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var venc = 0, pv = 0;
    (window.dataGlobalInspecciones || []).forEach(function(i) {
        var placaDelCliente = (window.dataGlobalPlacas || []).find(function(p) {
            return p[1] && p[1].trim() === cli && p[0] && p[0].trim() === (i.placa || '').trim();
        });
        if (!placaDelCliente) return;
        if (!i.fecha_ingreso) return;
        try {
            var fi; if (i.fecha_ingreso.includes('/')) { var px = i.fecha_ingreso.split('/'); fi = new Date(px[2],px[1]-1,px[0]); } else { fi = new Date(i.fecha_ingreso + 'T00:00:00'); }
            var fp = new Date(fi); fp.setDate(fp.getDate() + (parseInt(i.dias_propuestos) || 30));
            var dias = Math.ceil((fp - hoy) / 864e5);
            if (dias < 0) venc++;
            else if (dias <= 7) pv++;
        } catch(e) {}
    });
    return { venc: venc, pv: pv };
}

function _timelinePlaca(plc) {
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var insps = (window.dataGlobalInspecciones || []).filter(function(i) {
        return (i.placa || '').toUpperCase().trim() === plc.toUpperCase().trim();
    }).slice(0, 5);
    while (insps.length < 5) insps.push(null);
    return insps.map(function(i) {
        if (!i || !i.fecha_ingreso) return 'tl-empty';
        try {
            var fi; if (i.fecha_ingreso.includes('/')) { var px = i.fecha_ingreso.split('/'); fi = new Date(px[2],px[1]-1,px[0]); } else { fi = new Date(i.fecha_ingreso + 'T00:00:00'); }
            var fp = new Date(fi); fp.setDate(fp.getDate() + (parseInt(i.dias_propuestos) || 30));
            var dias = Math.ceil((fp - hoy) / 864e5);
            return dias < 0 ? 'tl-venc' : (dias <= 7 ? 'tl-pv' : 'tl-ok');
        } catch(e) { return 'tl-empty'; }
    });
}

window.mostrarKPIsCliente = function(cli) {
    var placasCli = (window.dataGlobalPlacas || []).filter(function(p) { return p[1] && p[1].trim() === cli; });
    var total = placasCli.length;
    var activas = placasCli.filter(function(p) { return p[18] === 'Activa'; }).length;
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var venc = 0, pv = 0, ok = 0, sinInsp = 0, ultInspMs = 0, ultInspFecha = '—';

    function parseInspFecha(f) {
        if (!f) return null;
        if (f.includes('/')) { var px = f.split('/'); return new Date(px[2], px[1]-1, px[0]); }
        return new Date(f + 'T00:00:00');
    }

    // Por cada placa del cliente, tomar SOLO la inspección más reciente
    placasCli.forEach(function(placa) {
        var pNum = (placa[0] || '').trim().toUpperCase();
        var insps = (window.dataGlobalInspecciones || []).filter(function(i) {
            return (i.placa || '').trim().toUpperCase() === pNum && i.fecha_ingreso;
        });
        if (!insps.length) { sinInsp++; return; }
        // Ordenar desc y tomar la más reciente
        insps.sort(function(a, b) {
            return (parseInspFecha(b.fecha_ingreso) || 0) - (parseInspFecha(a.fecha_ingreso) || 0);
        });
        var latest = insps[0];
        try {
            var fi = parseInspFecha(latest.fecha_ingreso);
            var fp = new Date(fi); fp.setDate(fp.getDate() + (parseInt(latest.dias_propuestos) || 30));
            var dias = Math.ceil((fp - hoy) / 864e5);
            if (dias < 0) venc++; else if (dias <= 7) pv++; else ok++;
            if (fi && fi.getTime() > ultInspMs) { ultInspMs = fi.getTime(); ultInspFecha = latest.fecha_ingreso; }
        } catch(e) {}
    });
    var modal = document.getElementById('modalKPIsCliente');
    var nombre = document.getElementById('kpi-cli-nombre');
    var body = document.getElementById('kpi-cli-body');
    if (!modal || !nombre || !body) return;
    nombre.textContent = cli;
    var sinInspHtml = sinInsp > 0
        ? '<div class="text-muted small mt-1"><i class="bi bi-exclamation-circle me-1 text-warning"></i>' + sinInsp + ' unidad(es) sin inspección registrada</div>'
        : '';
    body.innerHTML = '<div class="row g-2 mb-3">'
        + '<div class="col-6"><div class="kpi-mini-card"><div class="kpi-mini-val">' + total + '</div><div class="kpi-mini-lbl">Unidades</div></div></div>'
        + '<div class="col-6"><div class="kpi-mini-card kpi-green"><div class="kpi-mini-val">' + activas + '</div><div class="kpi-mini-lbl">Activas</div></div></div>'
        + '<div class="col-4"><div class="kpi-mini-card kpi-red"><div class="kpi-mini-val">' + venc + '</div><div class="kpi-mini-lbl">Insp. Vencidas</div></div></div>'
        + '<div class="col-4"><div class="kpi-mini-card kpi-yellow"><div class="kpi-mini-val">' + pv + '</div><div class="kpi-mini-lbl">Por Vencer</div></div></div>'
        + '<div class="col-4"><div class="kpi-mini-card kpi-blue"><div class="kpi-mini-val">' + ok + '</div><div class="kpi-mini-lbl">Al día</div></div></div>'
        + '</div>'
        + '<div class="text-muted small"><i class="bi bi-clock-history me-1"></i>Última inspección registrada: <strong>' + ultInspFecha + '</strong></div>'
        + sinInspHtml;
    bootstrap.Modal.getOrCreateInstance(modal).show();
};

// ── Paginación y renderizado ─────────────────────────────────────
function renderizarPaginaPlacas() {
    const contenedor = document.getElementById('contenedorPlacasDinamico');
    const infoPag = document.getElementById('info-paginacion-placas');
    const ctrlPag = document.getElementById('controles-paginacion-placas');
    const tablaExport = document.getElementById('tablaPlacasHidden');
    if (!contenedor) return;

    // Tabla oculta para exportar (todos los filtrados)
    let htmlExport = '<tr><th>PLACA</th><th>CLIENTE</th><th>RUC_DNI</th><th>MARCA</th><th>MODELO</th><th>TIPO</th><th>SUB TIPO</th><th>COLOR</th><th>NRO MOTOR</th><th>NRO CAJA</th><th>NRO CORONA</th><th>NRO VIN</th><th>CONFIGURACION</th><th>ANIO</th><th>COMBUSTIBLE</th><th>CARGA UTIL</th><th>PESO NETO</th><th>PESO BRUTO</th><th>ESTADO</th><th>UTS</th><th>MOTORA</th><th>LLANTAS</th><th>EN_USO</th></tr>';
    datosFiltradosPlacas.forEach(f => { htmlExport += `<tr>${f.map(celda => `<td>${celda || ''}</td>`).join('')}</tr>`; });
    if(tablaExport) tablaExport.innerHTML = htmlExport;

    // KPIs actualizados con los datos filtrados actuales
    actualizarIndicadoresPlacas(datosFiltradosPlacas);

    if (datosFiltradosPlacas.length === 0) {
        contenedor.innerHTML = '<div class="w-100 text-center py-5 text-muted" style="grid-column: 1 / -1;"><i class="bi bi-search fs-1"></i><br>No hay vehículos que coincidan.</div>';
        if(infoPag) infoPag.innerText = '0 resultados'; if(ctrlPag) ctrlPag.innerHTML = ''; return;
    }

    const canEditP = window.checkPerm('placas','e');
    const canDeleteP = window.checkPerm('placas','d');

    const totalPaginas = Math.ceil(datosFiltradosPlacas.length / ITEMS_POR_PAGINA);
    if(paginaActualPlacas > totalPaginas) paginaActualPlacas = totalPaginas;
    const inicio = (paginaActualPlacas - 1) * ITEMS_POR_PAGINA;
    const datosPagina = datosFiltradosPlacas.slice(inicio, inicio + ITEMS_POR_PAGINA);

    let html = '';
    let clienteActual = null;
    datosPagina.forEach((fila) => {
        const plc = (fila[0]||'').trim();
        const cli = fila[1] ? fila[1].trim() : 'Sin Asignar';
        const mar = fila[3] ? fila[3].trim() : '-';
        const tip = fila[5] ? fila[5].trim() : '-';
        const est = fila[18] ? fila[18].trim() : '';
        const badgeCls = est === 'Activa' ? 'badge-green' : (est === 'Inactiva' ? 'badge-red' : '');
        const indexGlobal = dataGlobalPlacas.findIndex(x => x[0] === plc);

        if (cli !== clienteActual) {
            clienteActual = cli;
            var alertas = _contarAlertasCliente(cli);
            var badgesHtml = '';
            if (alertas.venc > 0) badgesHtml += `<span class="badge bg-danger ms-2" style="font-size:0.65rem;">${alertas.venc} venc.</span>`;
            if (alertas.pv > 0) badgesHtml += `<span class="badge bg-warning text-dark ms-1" style="font-size:0.65rem;">${alertas.pv} x/venc</span>`;
            html += `<div class="group-header-left d-flex align-items-center" style="cursor:pointer;" onclick="mostrarKPIsCliente('${cli.replace(/'/g, "\\'")}')"><i class="bi bi-building me-2 text-primary"></i> ${cli}${badgesHtml}<i class="bi bi-bar-chart-fill ms-auto text-primary opacity-50" style="font-size:0.75rem;"></i></div>`;
        }

        let menuAcciones = '';
        if (canEditP || canDeleteP) {
            let items = '';
            if (canEditP) items += `<li><a class="dropdown-item fw-bold" href="#" onclick="abrirModalEditarPlaca(${indexGlobal})"><i class="bi bi-pencil text-primary"></i> Editar</a></li>`;
            if (canEditP && canDeleteP) items += `<li><hr class="dropdown-divider"></li>`;
            if (canDeleteP) items += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="event.stopPropagation(); eliminarPlacaDesdeTarjeta('${plc}')"><i class="bi bi-trash"></i> Eliminar</a></li>`;
            menuAcciones = `<div class="dropdown ms-1" onclick="event.stopPropagation()"><button class="btn btn-sm btn-light border-0 px-2" style="background:transparent; color:#94a3b8;" type="button" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow-sm" style="border-radius:12px; font-size:0.85rem;">${items}</ul></div>`;
        }

        let checkHtml = window.modoSeleccion && window.modoSeleccion['placas'] ? `<input type="checkbox" class="form-check-input chk-bulk-placas me-2" value="${plc}" style="pointer-events: none; width:1.2rem; height:1.2rem;">` : '';

        var tl = _timelinePlaca(plc);
        var tlHtml = `<div class="d-flex align-items-center gap-1 mt-1" title="Historial inspecciones">${tl.map((cls,i) => `<span class="${cls}" style="width:6px;height:6px;border-radius:50%;display:inline-block;background-color:${cls==='tl-venc'?'#ef4444':cls==='tl-pv'?'#eab308':cls==='tl-ok'?'#22c55e':'#e2e8f0'}"></span>`).join('')}</div>`;

        // Icon based on type
        let icono = 'bi-truck';
        const tipLower = tip.toLowerCase();
        if (tipLower.includes('carreta') || tipLower.includes('semi')) icono = 'bi-truck-flatbed';
        else if (tipLower.includes('tracto')) icono = 'bi-truck-front';

        html += `
        <div class="placas-modern-card" data-placa="${plc}" onclick="abrirDetallePlaca(event, ${indexGlobal})">
            ${checkHtml}
            <div class="placas-modern-icon">
                <i class="bi ${icono} fs-5"></i>
            </div>
            
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    <span class="placas-modern-badge">${plc}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.375rem; color: #64748b; font-size: 13px; font-weight: 500;">
                    <span>${tip}</span>
                    <span style="width: 3px; height: 3px; border-radius: 50%; background: #cbd5e1;"></span>
                    <span>${mar}</span>
                </div>
                ${tlHtml}
            </div>
            
            <div style="display: flex; align-items: center; gap: 0.25rem;">
                ${menuAcciones}
                <button style="width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #94a3b8; border: none; background: transparent;">
                    <i class="bi bi-chevron-right"></i>
                </button>
            </div>
        </div>`;
    });

    contenedor.innerHTML = html;
    // Feature 2 — Long-press en móvil → bottom sheet acciones
    if (window.innerWidth < 768) {
        contenedor.querySelectorAll('.card-premium').forEach(function(card) {
            var timer = null;
            card.addEventListener('touchstart', function(e) {
                timer = setTimeout(function() {
                    timer = null;
                    var plc = card.dataset.placa;
                    if (!plc) return;
                    var bsEl = document.getElementById('bottomSheetPlacas');
                    var bsPlaca = document.getElementById('bs-placa-nombre');
                    var bsIdx = document.getElementById('bs-placa-index');
                    if (!bsEl) return;
                    if (bsPlaca) bsPlaca.textContent = plc;
                    if (bsIdx) bsIdx.value = (window.dataGlobalPlacas || []).findIndex(function(x) { return x[0] === plc; });
                    bootstrap.Offcanvas.getOrCreateInstance(bsEl).show();
                }, 600);
            }, { passive: true });
            card.addEventListener('touchend', function() { clearTimeout(timer); timer = null; }, { passive: true });
            card.addEventListener('touchmove', function() { clearTimeout(timer); timer = null; }, { passive: true });
        });
    }
    if (typeof window.initSwipeCards === 'function') window.initSwipeCards('contenedorPlacasDinamico');
    const fin = Math.min(inicio + ITEMS_POR_PAGINA, datosFiltradosPlacas.length);
    if(infoPag) infoPag.innerText = `Mostrando ${inicio + 1}–${fin} de ${datosFiltradosPlacas.length} placas`;
    let btnHtml = `<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid #e2e8f0;background:#ffffff;color:#0f172a;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:${paginaActualPlacas === 1 ? '0.35' : '1'};" ${paginaActualPlacas === 1 ? 'disabled' : ''} onclick="cambiarPaginaPlacas(-1)"><i class="bi bi-chevron-left"></i></button>`;
    btnHtml += `<span style="font-size:.8rem;font-weight:700;color:#64748b;padding:0 0.5rem;">Pág. <b style="color:#0f172a">${paginaActualPlacas}</b> / ${totalPaginas}</span>`;
    btnHtml += `<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid #e2e8f0;background:#ffffff;color:#0f172a;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:${paginaActualPlacas >= totalPaginas ? '0.35' : '1'};" ${paginaActualPlacas >= totalPaginas ? 'disabled' : ''} onclick="cambiarPaginaPlacas(1)"><i class="bi bi-chevron-right"></i></button>`;
    if(ctrlPag) ctrlPag.innerHTML = `<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem .75rem;">${btnHtml}</div>`;

    // Sincronizar estado de checkboxes con la selección global (para páginas distintas)
    if (window.modoSeleccion && window.modoSeleccion['placas'] && window.placasSeleccionadasGlobalmente) {
        const selSet = new Set(window.placasSeleccionadasGlobalmente);
        document.querySelectorAll('.chk-bulk-placas').forEach(function(chk) {
            const marcada = selSet.has(chk.value);
            chk.checked = marcada;
            const tarjeta = chk.closest('.card-premium');
            if (tarjeta) tarjeta.classList.toggle('card-selected', marcada);
        });
    }
}

window.cambiarPaginaPlacas = function(direccion) {
    paginaActualPlacas += direccion;
    renderizarPaginaPlacas();
};

// ── Panel de detalle (offcanvas) ─────────────────────────────────
window.abrirDetallePlaca = function(event, index) {
    if (window.modoSeleccion && window.modoSeleccion['placas']) {
        if (event.target.closest('.btn-dots') || event.target.closest('.dropdown-menu')) return;

        const tarjeta = event.target.closest('.card-premium');
        if (!tarjeta) return;

        const checkbox = tarjeta.querySelector('.chk-bulk-placas');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            if (typeof window.toggleSeleccionPlaca === 'function') {
                window.toggleSeleccionPlaca(checkbox, checkbox.value);
            } else {
                if (checkbox.checked) tarjeta.classList.add('card-selected');
                else tarjeta.classList.remove('card-selected');
            }
        }
        return;
    }

    if (event.target.closest('.dropdown') || event.target.closest('.chk-bulk-placas') || event.target.closest('.btn-dots')) return;
    const p = dataGlobalPlacas[index];
    if (!p) return;

    document.getElementById('det-placa-titulo').innerText = p[0] || 'SIN PLACA';

    const ids = ['det-cliente','det-ruc','det-marca','det-modelo','det-tipo','det-sub_tipo','det-color','det-nro_motor','det-nro_caja','det-nro_corona','det-nro_vin','det-conf','det-anio','det-comb','det-carga_util','det-peso_neto','det-peso_bruto','det-estado','det-uts','det-motora','det-llantas','det-enuso'];
    var _detTc = function(s) { return s ? String(s).trim().replace(/\b\w+/g, function(w){ return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase(); }) : s; };
    var _detTcIds = ['det-marca','det-tipo','det-sub_tipo','det-color','det-conf'];
    ids.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) {
            var raw = p[i + 1] ? p[i + 1] : '-';
            el.innerText = (_detTcIds.indexOf(id) >= 0 && raw !== '-') ? _detTc(raw) : raw;
            if (id === 'det-estado') {
                el.className = 'badge-premium ' + (p[i + 1] === 'Activa' ? 'badge-green' : 'badge-red');
            }
        }
    });

    const btnEditar = document.getElementById('btn-editar-offcanvas');
    if (btnEditar) {
        btnEditar.onclick = function() {
            bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasDetallePlaca')).hide();
            abrirModalEditarPlaca(index);
        };
    }

    // ── Datos GPS (pestaña GPS del offcanvas) ─────────────────────────────
    const placaActual = (p[0] || '').toString().trim().toUpperCase();
    const elGpsUbic  = document.getElementById('detalleGpsUbicacion');
    const elGpsKm    = document.getElementById('detalleGpsKm');
    const elGpsHoras = document.getElementById('detalleGpsHoras');
    const sinGps = '<span class="text-muted fst-italic small">Sin conexión GPS activa</span>';

    if (elGpsUbic) elGpsUbic.innerHTML = sinGps;
    if (elGpsKm)   elGpsKm.innerHTML   = sinGps;
    if (elGpsHoras) elGpsHoras.innerHTML = sinGps;

    const wialonData = (typeof buscarWialonPorPlaca === 'function') ? buscarWialonPorPlaca(placaActual) : null;
    if (wialonData) {
        const tienePos = wialonData.lat && wialonData.lat !== 0;
        const kmTxt    = wialonData.km > 0 ? `${Number(wialonData.km).toLocaleString()} km` : null;
        const horasTxt = wialonData.horas > 0 ? `${Number(wialonData.horas).toLocaleString()} h` : null;

        if (elGpsKm && kmTxt)       elGpsKm.innerHTML    = `<span class="fw-bold">${kmTxt}</span>`;
        if (elGpsHoras && horasTxt) elGpsHoras.innerHTML = `<span class="fw-bold">${horasTxt}</span>`;

        if (tienePos && elGpsUbic) {
            // Spinner mientras carga la dirección textual
            elGpsUbic.innerHTML = `<span class="spinner-border spinner-border-sm text-primary me-1"></span><small class="text-muted">Obteniendo dirección...</small>`;

            (async () => {
                let dirTxt = `${wialonData.lat.toFixed(5)}, ${wialonData.lng.toFixed(5)}`; // fallback coords
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${wialonData.lat}&lon=${wialonData.lng}`);
                    const data = await res.json();
                    const calle  = data.address?.road || data.address?.suburb || data.address?.neighbourhood || 'Sin nombre';
                    const ciudad = data.address?.city || data.address?.town || data.address?.county || '';
                    dirTxt = ciudad ? `${calle}, ${ciudad}` : calle;
                } catch(e) { /* usa las coordenadas de fallback */ }

                if (!elGpsUbic || !document.contains(elGpsUbic)) return;

                const urlMaps = `https://www.google.com/maps?q=${wialonData.lat},${wialonData.lng}`;
                const msgWsp  = encodeURIComponent(`📍 Ubicación de *${placaActual}*:\n${dirTxt}\n${urlMaps}`);

                const textSpan = document.createElement('span');
                textSpan.className = 'fw-bold flex-grow-1';
                textSpan.textContent = dirTxt;

                const btnCopy = document.createElement('button');
                btnCopy.className = 'btn btn-sm p-0 ms-2 text-secondary';
                btnCopy.title = 'Copiar dirección';
                btnCopy.innerHTML = '<i class="bi bi-clipboard"></i>';
                btnCopy.onclick = () => {
                    navigator.clipboard.writeText(dirTxt);
                    btnCopy.innerHTML = '<i class="bi bi-clipboard-check text-success"></i>';
                    setTimeout(() => { btnCopy.innerHTML = '<i class="bi bi-clipboard"></i>'; }, 2000);
                };

                const btnWsp = document.createElement('button');
                btnWsp.className = 'btn btn-sm p-0 ms-1 text-success';
                btnWsp.title = 'Compartir por WhatsApp';
                btnWsp.innerHTML = '<i class="bi bi-whatsapp"></i>';
                btnWsp.onclick = () => window.open(`https://api.whatsapp.com/send?text=${msgWsp}`, '_blank');

                const wrapper = document.createElement('div');
                wrapper.className = 'd-flex align-items-center gap-1';
                wrapper.appendChild(textSpan);
                wrapper.appendChild(btnCopy);
                wrapper.appendChild(btnWsp);

                elGpsUbic.innerHTML = '';
                elGpsUbic.appendChild(wrapper);
            })();
        }
    }

    // ── Pestaña Inspecciones ──────────────────────────────────────────────────
    const inspPanelEl = document.getElementById('tab-insp-panel-body');
    if (inspPanelEl) {
        const insps = (window.dataGlobalInspecciones || []).filter(function(i) {
            return (i.placa || '').toString().toUpperCase().trim() === placaActual;
        }).sort(function(a, b) { return parseInt(b.id || 0) - parseInt(a.id || 0); }).slice(0, 5);
        if (!insps.length) {
            inspPanelEl.innerHTML = '<div class="text-muted text-center py-4"><i class="bi bi-clipboard2-x fs-3 opacity-50"></i><div class="mt-2 small">Sin registros de inspección.</div></div>';
        } else {
            const hoy2 = new Date(); hoy2.setHours(0,0,0,0);
            inspPanelEl.innerHTML = insps.map(function(i, idx) {
                let bCl = 'secondary', diasLabel = '—';
                try {
                    let fi; const fv = i.fecha_ingreso || '';
                    if (fv.includes('/')) { const px = fv.split('/'); fi = new Date(px[2],px[1]-1,px[0]); } else { fi = new Date(fv + 'T00:00:00'); }
                    const fp = new Date(fi.getTime()); fp.setDate(fp.getDate() + (parseInt(i.dias_propuestos) || 30));
                    const dias = Math.ceil((fp - hoy2) / 864e5);
                    bCl = dias < 0 ? 'danger' : (dias <= 7 ? 'warning' : 'success');
                    diasLabel = dias < 0 ? 'Vencida' : (dias === 0 ? 'Vence hoy' : 'Faltan ' + dias + 'd');
                } catch(e) {}
                const lineH = idx < insps.length - 1 ? '<div style="width:2px;flex-grow:1;background:var(--border);margin-top:3px;min-height:14px;"></div>' : '';
                return '<div class="d-flex gap-2 mb-2" style="font-size:0.8rem;">'
                    + '<div class="d-flex flex-column align-items-center" style="min-width:1.8rem;">'
                    + '<div class="rounded-circle d-flex align-items-center justify-content-center bg-' + bCl + '" style="width:1.5rem;height:1.5rem;flex-shrink:0;">'
                    + '<i class="bi bi-clipboard2-check text-white" style="font-size:0.6rem;"></i></div>'
                    + lineH + '</div>'
                    + '<div class="flex-grow-1 pb-1">'
                    + '<div class="d-flex justify-content-between align-items-center">'
                    + '<span class="fw-bold" style="color:var(--crm-accent);">#' + (i.id || '—') + '</span>'
                    + '<span class="badge bg-' + bCl + '" style="font-size:0.62rem;">' + diasLabel + '</span>'
                    + '</div>'
                    + '<div style="color:var(--subtext);font-size:0.72rem;">' + (i.fecha_ingreso || '—') + (i.tecnico ? ' · ' + i.tecnico : '') + '</div>'
                    + '</div></div>';
            }).join('');
        }
    }

    // ── Pestaña MP (Fleetrun) ─────────────────────────────────────────────────
    const fleetPanelEl = document.getElementById('tab-fleet-panel-body');
    if (fleetPanelEl) {
        const fleetRecs = (window.dataGlobalFleetrun || []).filter(function(r) {
            return (r[4] || '').toString().toUpperCase().trim() === placaActual;
        });
        if (!fleetRecs.length) {
            fleetPanelEl.innerHTML = '<div class="text-muted text-center py-4"><i class="bi bi-tools fs-3 opacity-50"></i><div class="mt-2 small">Sin registros de mantenimiento.</div></div>';
        } else {
            // Latest per tipo_mp
            const byTipo = {};
            fleetRecs.forEach(function(r) {
                const tipo = (r[8] || '').toUpperCase().trim();
                if (!byTipo[tipo] || parseInt(r[0]) > parseInt(byTipo[tipo][0])) byTipo[tipo] = r;
            });
            let recsLatest = Object.values(byTipo);
            recsLatest.sort(function(a, b) {
                const ta = (a[8] || '').toUpperCase().trim(), tb = (b[8] || '').toUpperCase().trim();
                const mpa = ta.match(/^MP(\d+)$/), mpb = tb.match(/^MP(\d+)$/);
                if (mpa && mpb) return parseInt(mpa[1]) - parseInt(mpb[1]);
                if (mpa) return -1; if (mpb) return 1;
                return ta.localeCompare(tb);
            });
            const utsP = p[19] || '';
            const umbralP = (utsP || '').toUpperCase() === 'LOCAL' ? 100 : 1500;
            const wD2 = typeof buscarWialonPorPlaca === 'function' ? buscarWialonPorPlaca(placaActual) : null;
            fleetPanelEl.innerHTML = recsLatest.map(function(r) {
                const kmProx = parseFloat(r[11]) || 0;
                const kmGps = wD2 ? wD2.km : (parseFloat(r[14]) || 0);
                const falta = kmProx - kmGps;
                const bCl = falta <= 0 ? 'danger' : (falta <= umbralP ? 'warning' : 'success');
                const faltaLabel = (falta > 0 ? '+' : '') + falta.toLocaleString() + ' km';
                const fechaM = typeof parseDateToDDMMYYYY === 'function' ? parseDateToDDMMYYYY(r[3]) : (r[3] || '-');
                return '<div class="d-flex align-items-center gap-2 py-2 px-1" style="border-bottom:1px solid var(--border);font-size:0.8rem;">'
                    + '<div class="rounded-circle d-flex align-items-center justify-content-center bg-' + bCl + '" style="width:1.8rem;height:1.8rem;flex-shrink:0;">'
                    + '<i class="bi bi-tools text-white" style="font-size:0.65rem;"></i></div>'
                    + '<div class="flex-grow-1 min-width-0">'
                    + '<div class="fw-bold" style="color:var(--crm-accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (r[8] || '—') + '</div>'
                    + (fechaM !== '-' ? '<div style="color:var(--subtext);font-size:0.7rem;">' + fechaM + '</div>' : '')
                    + '</div>'
                    + '<div class="text-end flex-shrink-0">'
                    + '<span class="badge bg-' + bCl + '" style="font-size:0.65rem;">' + faltaLabel + '</span>'
                    + '<div style="font-size:0.65rem;color:var(--subtext);margin-top:1px;">Próx: ' + kmProx.toLocaleString() + '</div>'
                    + '</div></div>';
            }).join('');
        }
    }

    // Resetear a primera pestaña al abrir offcanvas
    const tabGenBtn = document.getElementById('tab-general-btn');
    if (tabGenBtn) bootstrap.Tab.getOrCreateInstance(tabGenBtn).show();

    // Guardar placa activa para historial
    window._placaDetalleActual = placaActual;

    new bootstrap.Offcanvas(document.getElementById('offcanvasDetallePlaca')).show();
}

// ── Historial de cambios por placa ──────────────────────────────
window._cargarHistorialPlaca = function() {
    var placa = window._placaDetalleActual;
    var body  = document.getElementById('tab-historial-body');
    if (!body || !placa) return;

    body.innerHTML = '<div class="text-center py-4"><span class="spinner-border spinner-border-sm text-primary me-2"></span>Cargando historial...</div>';

    fetch('/api/placas/' + encodeURIComponent(placa) + '/historial')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(rows) {
            if (!rows.length) {
                body.innerHTML = '<div class="text-muted text-center py-5"><i class="bi bi-clock-history fs-3 opacity-40"></i><div class="mt-2 small">Sin cambios registrados aún.</div><div class="text-muted" style="font-size:0.72rem;margin-top:4px">Los cambios aparecerán aquí al editar la placa.</div></div>';
                return;
            }

            var _nombreCampo = {
                cliente:'Cliente', ruc_dni:'RUC/DNI', marca:'Marca', modelo_uts:'Modelo',
                tipo:'Tipo', sub_tipo:'Sub Tipo', color:'Color', nro_motor:'Nº Motor',
                nro_caja:'Nº Caja', nro_corona:'Nº Corona', nro_vin:'Nº VIN',
                configuracion:'Configuración', anio:'Año', combustible:'Combustible',
                carga_util:'Carga Útil', peso_neto:'Peso Neto', peso_bruto:'Peso Bruto',
                estado:'Estado', uts:'Zona UTS', motora:'Motora', llantas:'Llantas', en_uso:'En Uso'
            };

            // Agrupar entradas por fecha+usuario (misma edición)
            var grupos = [];
            var mapaGrupo = {};
            rows.forEach(function(r) {
                var d  = new Date(r.fecha);
                var ts = d.toLocaleDateString('es-PE', {day:'2-digit',month:'short',year:'numeric'});
                var hr = d.toLocaleTimeString('es-PE', {hour:'2-digit',minute:'2-digit'});
                var key = r.usuario + '|' + ts + '|' + hr;
                if (!mapaGrupo[key]) {
                    mapaGrupo[key] = { ts: ts, hr: hr, usuario: r.usuario || 'Sistema', items: [] };
                    grupos.push(mapaGrupo[key]);
                }
                mapaGrupo[key].items.push(r);
            });

            body.innerHTML = grupos.map(function(g, gi) {
                var isLast = gi === grupos.length - 1;
                var itemsHtml = g.items.map(function(it) {
                    var isEstado = it.campo === 'estado';
                    var badgeAnt = it.valor_ant
                        ? '<span class="badge" style="background:#fee2e2;color:#991b1b;font-weight:500;font-size:0.68rem">' + (it.valor_ant || '—') + '</span>'
                        : '<span class="text-muted" style="font-size:0.72rem">vacío</span>';
                    var badgeNue = it.valor_nuevo
                        ? '<span class="badge" style="background:#dcfce7;color:#166534;font-weight:500;font-size:0.68rem">' + it.valor_nuevo + '</span>'
                        : '<span class="text-muted" style="font-size:0.72rem">vacío</span>';
                    return '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:0.78rem;flex-wrap:wrap">'
                        + '<span style="color:var(--subtext);min-width:80px;font-size:0.72rem">' + (_nombreCampo[it.campo] || it.campo) + '</span>'
                        + badgeAnt
                        + '<i class="bi bi-arrow-right" style="color:#94a3b8;font-size:0.65rem"></i>'
                        + badgeNue
                        + '</div>';
                }).join('');

                var lineH = !isLast ? '<div style="width:2px;flex-grow:1;background:var(--border);margin-top:3px;min-height:12px;"></div>' : '';

                return '<div class="d-flex gap-2 mb-2">'
                    + '<div class="d-flex flex-column align-items-center" style="min-width:1.8rem">'
                    + '<div class="rounded-circle d-flex align-items-center justify-content-center" style="width:1.6rem;height:1.6rem;flex-shrink:0;background:var(--crm-accent, #2563eb)">'
                    + '<i class="bi bi-pencil text-white" style="font-size:0.55rem"></i></div>'
                    + lineH + '</div>'
                    + '<div class="flex-grow-1 pb-2" style="border-bottom:' + (!isLast ? '1px solid var(--border)' : 'none') + '">'
                    + '<div class="d-flex justify-content-between align-items-center mb-1">'
                    + '<span style="font-size:0.75rem;font-weight:600;color:var(--crm-accent)">' + (g.usuario) + '</span>'
                    + '<span style="font-size:0.68rem;color:var(--subtext)">' + g.ts + ' · ' + g.hr + '</span>'
                    + '</div>'
                    + itemsHtml
                    + '</div></div>';
            }).join('');
        })
        .catch(function(err) {
            if (body) body.innerHTML = '<div class="text-center py-4 text-danger small"><i class="bi bi-exclamation-circle me-1"></i>Error: ' + err.message + '</div>';
        });
};
window.abrirModalEditarPlaca = function(index) {
    const p = dataGlobalPlacas[index];
    if (!p) return;

    const form = document.getElementById('formEditarPlaca');
    if (form) form.reset();

    poblarSelectsFormularios(dataGlobalPlacas);

    const ids = [
        'e_placa', 'e_cliente', 'e_ruc', 'e_marca', 'e_modelo', 'e_tipo', 'e_sub_tipo',
        'e_color', 'e_nro_motor', 'e_nro_caja', 'e_nro_corona', 'e_nro_vin', 'e_conf',
        'e_anio', 'e_comb', 'e_carga_util', 'e_peso_neto', 'e_peso_bruto', 'e_estado',
        'e_uts', 'e_motora', 'e_llantas', 'e_enuso'
    ];

    var _editTc = function(s) { return s ? String(s).trim().replace(/\b\w+/g, function(w){ return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase(); }) : s; };
    var _editTcIds = ['e_marca','e_tipo','e_sub_tipo','e_color','e_conf'];

    ids.forEach((id, i) => {
        const valorLimpio = p[i] ? p[i].toString().trim() : '';
        // Si el campo usa combobox, actualizar con _cbSet
        if (typeof window._cbSet === 'function' && document.getElementById(id + '-txt')) {
            var labelCb = (_editTcIds.indexOf(id) >= 0 && valorLimpio) ? _editTc(valorLimpio) : valorLimpio;
            window._cbSet(id, valorLimpio, labelCb);
            return;
        }
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'SELECT' && valorLimpio !== '') {
                let options = Array.from(el.options);
                let match = options.find(opt => opt.value.toUpperCase() === valorLimpio.toUpperCase());
                if (match) {
                    el.value = match.value;
                } else if (el.classList.contains('sel-inteligente')) {
                    const nuevaOpcion = new Option(valorLimpio, valorLimpio);
                    el.insertBefore(nuevaOpcion, el.lastElementChild);
                    el.value = valorLimpio;
                } else {
                    el.value = valorLimpio;
                }
            } else {
                el.value = valorLimpio;
            }
        }
    });

    // Precargar campo métrica
    var elMetrica = document.getElementById('e_metrica');
    if (elMetrica && p.metrica !== undefined && p.metrica !== null) {
        elMetrica.value = p.metrica;
    }

    // Autocompletar RUC tras setear cliente en modo edición
    const editCliente = typeof window._cbGet === 'function' ? window._cbGet('e_cliente') : '';
    if (editCliente) window.autocompletarRucSelect(editCliente, 'e_ruc');

    const btn = document.getElementById('btnActualizarPlaca');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-pencil-square"></i> Actualizar Ficha';
    }

    new bootstrap.Modal(document.getElementById('modalEditarPlaca')).show();
};

function enviarPlaca(event, formObj) {
    event.preventDefault();
    if (!window.guardAction('placas', 'c')) return;
    const btn = document.getElementById('btnGuardarPlaca');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    formObj.usuarioAutor.value = usuarioLogueado;
    const data = {};
    for (let i = 0; i < formObj.elements.length; i++) {
        const el = formObj.elements[i];
        if (el.name) data[el.name] = el.value;
    }
    fetch('/api/script/guardarPlaca', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [data] }) })
        .then(function(r) { return r.json(); })
        .then(function(r) {
            if (r.data === 'Éxito') {
                formObj.reset();
                bootstrap.Modal.getInstance(document.getElementById('modalPlaca')).hide();
                cargarTablaPlacas(true);
            } else { alert(r.data); }
            btn.disabled = false; btn.innerHTML = 'Guardar';
        })
        .catch(function(e) { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Guardar'; });
}

function enviarEdicionPlaca(event, formObj) {
    event.preventDefault();
    if (!window.guardAction('placas', 'e')) return;
    var btn = document.getElementById('btnActualizarPlaca');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Actualizando...'; }

    var get = function(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
    var cb  = function(id) { return typeof window._cbGet === 'function' ? (window._cbGet(id) || '') : get(id + '-txt') || get(id); };

    var placa = get('e_placa');
    var camposRequeridos = [
        'cliente','ruc_dni','marca','modelo_uts','tipo','sub_tipo','color',
        'nro_motor','nro_caja','nro_corona','nro_vin','configuracion','anio',
        'combustible','carga_util','peso_neto','peso_bruto','estado','uts','motora','llantas','en_uso','metrica'
    ];
        // Obtener valor de metrica (puedes ajustar el id según tu formulario)
        var getMetrica = function() {
            var el = document.getElementById('e_metrica');
            var val = el ? (el.value || '').trim() : '';
            // ENUM('km','horas') NOT NULL — nunca enviar vacío
            return (val === 'horas') ? 'horas' : 'km';
        };
    var payload = {};
    camposRequeridos.forEach(function(c) {
        switch(c) {
            case 'cliente': payload[c] = cb('e_cliente'); break;
            case 'ruc_dni': payload[c] = get('e_ruc'); break;
            case 'marca': payload[c] = cb('e_marca'); break;
            case 'modelo_uts': payload[c] = get('e_modelo'); break;
            case 'tipo': payload[c] = cb('e_tipo'); break;
            case 'sub_tipo': payload[c] = cb('e_sub_tipo'); break;
            case 'color': payload[c] = cb('e_color'); break;
            case 'nro_motor': payload[c] = get('e_nro_motor'); break;
            case 'nro_caja': payload[c] = get('e_nro_caja'); break;
            case 'nro_corona': payload[c] = get('e_nro_corona'); break;
            case 'nro_vin': payload[c] = get('e_nro_vin'); break;
            case 'configuracion': payload[c] = cb('e_conf'); break;
            case 'anio': payload[c] = get('e_anio'); break;
            case 'combustible': payload[c] = cb('e_comb'); break;
            case 'carga_util': payload[c] = get('e_carga_util'); break;
            case 'peso_neto': payload[c] = get('e_peso_neto'); break;
            case 'peso_bruto': payload[c] = get('e_peso_bruto'); break;
            case 'estado': payload[c] = get('e_estado'); break;
            case 'uts': payload[c] = get('e_uts'); break;
            case 'motora': payload[c] = get('e_motora'); break;
            case 'llantas': payload[c] = get('e_llantas'); break;
            case 'en_uso': payload[c] = get('e_enuso'); break;
            case 'metrica': payload[c] = getMetrica(); break;
            default: payload[c] = '';
        }
        if (payload[c] === undefined || payload[c] === null) payload[c] = '';
    });
    payload.usuario_autor = localStorage.getItem('fleet_user') || '';

    fetch('/api/placas/' + encodeURIComponent(placa), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'HTTP ' + r.status); });
        return r.json();
    })
    .then(function(r) {
        var modal = bootstrap.Modal.getInstance(document.getElementById('modalEditarPlaca'));
        if (modal) modal.hide();
        recargarModulo('placas');
        if (typeof window.mostrarToast === 'function') window.mostrarToast('Placa actualizada (' + (r.cambios || 0) + ' cambio' + (r.cambios !== 1 ? 's' : '') + ')', 'success');
    })
    .catch(function(err) {
        alert('Error al actualizar: ' + err.message);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-pencil-square"></i> Actualizar Ficha'; }
    });
}

// ── Importación Excel ────────────────────────────────────────────
window.descargarPlantillaPlacas = function() {
    const ws_data = [
        ['PLACA', 'CLIENTE', 'RUC / DNI', 'MARCA', 'MODELO UTS', 'TIPO', 'SUB TIPO', 'COLOR', 'Nº MOTOR', 'Nº CAJA', 'Nº CORONA', 'Nº VIN', 'CONFIGURACION', 'AÑO', 'COMBUSTIBLE', 'CARGA UTIL', 'PESO NETO', 'PESO BRUTO', 'ESTADO', 'UTS', 'MOTORA', 'LLANTAS', 'EN USO?'],
        ['ABC-123', 'EMPRESA EJEMPLO SAC', '20123456789', 'VOLVO', 'FH 460', 'CAMION', 'FURGON', 'BLANCO', 'MOT-999', 'CAJ-888', 'COR-777', 'VIN-555', '6X4', '2024', 'DIESEL', '30.5', '8.2', '38.7', 'Activa', 'NACIONAL', 'Motora', '10', 'Si']
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Placas");
    XLSX.writeFile(wb, "Plantilla_Importacion_Placas.xlsx");
};

window.importarExcelPlacas = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (rawJson.length === 0) {
            alert("El archivo Excel está vacío o no tiene datos válidos.");
            return;
        }

        const confirmar = await (typeof window.confirmar === 'function'
            ? window.confirmar({ titulo: 'Importar Placas', mensaje: `Se importarán <strong>${rawJson.length} registros</strong>. ¿Continuar?`, textoConfirmar: 'Sí, importar' })
            : Promise.resolve(confirm(`Se importarán ${rawJson.length} registros.\n¿Continuar?`)));
        if (!confirmar) { event.target.value = ''; return; }

        document.body.style.cursor = 'wait';

        fetch('/api/importarPlacasMasivo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registros: rawJson })
        })
        .then(res => res.json())
        .then(r => {
            document.body.style.cursor = 'default';
            event.target.value = '';
            alert(`✅ Importación completada.\nProcesados con éxito: ${r.ok}\nErrores/Omitidos: ${r.errores}`);
            recargarModulo('placas');
        })
        .catch(err => {
            document.body.style.cursor = 'default';
            event.target.value = '';
            alert("❌ Error subiendo archivo: " + err.message);
        });
    };
    reader.readAsArrayBuffer(file);
};

// ── Selección masiva ────────────────────────────────────────────
window.activarModoSeleccionPlacas = function() {
    window.modoSeleccion = window.modoSeleccion || {};
    window.modoSeleccion['placas'] = !window.modoSeleccion['placas'];

    const btnActivar = document.getElementById('btn-activar-sel-placas');
    const btnAll     = document.getElementById('btn-select-all-placas');
    const btnBulk    = document.getElementById('btn-bulk-placas');

    if (window.modoSeleccion['placas']) {
        if (btnActivar) {
            btnActivar.classList.replace('btn-outline-secondary', 'btn-secondary');
            btnActivar.classList.add('text-white');
            btnActivar.innerHTML = '<i class="bi bi-x-circle"></i> Cancelar Selección';
        }
        if (btnAll) {
            btnAll.classList.remove('d-none');
            btnAll.innerHTML = '<i class="bi bi-check-square"></i> Seleccionar Todo';
            btnAll.classList.replace('btn-primary', 'btn-outline-primary');
        }
    } else {
        if (btnActivar) {
            btnActivar.classList.replace('btn-secondary', 'btn-outline-secondary');
            btnActivar.classList.remove('text-white');
            btnActivar.innerHTML = '<i class="bi bi-ui-checks"></i> <span data-i18n="common.select">Seleccionar</span>';
        }
        if (btnAll) btnAll.classList.add('d-none');
        if (btnBulk) btnBulk.classList.add('d-none');
        window.placasSeleccionadasGlobalmente = [];
        document.querySelectorAll('.chk-bulk-placas').forEach(c => c.checked = false);
        document.querySelectorAll('.card-premium').forEach(c => c.classList.remove('card-selected'));
    }

    renderizarPaginaPlacas();
};

// Actualiza contador y visibilidad del botón Eliminar
window._actualizarContadorBulkPlacas = function() {
    const btnBulk  = document.getElementById('btn-bulk-placas');
    const cntSpan  = document.getElementById('cnt-bulk-placas');
    const cantidad = (window.placasSeleccionadasGlobalmente || []).length;
    if (cntSpan) cntSpan.innerText = cantidad;
    if (btnBulk) {
        if (cantidad > 0) btnBulk.classList.remove('d-none');
        else btnBulk.classList.add('d-none');
    }
    // Sincronizar botón "Seleccionar Todo" / "Desmarcar Todo"
    const btnAll = document.getElementById('btn-select-all-placas');
    const totalFiltrados = (datosFiltradosPlacas || []).length;
    if (btnAll && totalFiltrados > 0 && cantidad >= totalFiltrados) {
        btnAll.innerHTML = '<i class="bi bi-check-square-fill"></i> Desmarcar Todo';
        btnAll.classList.replace('btn-outline-primary', 'btn-primary');
    } else if (btnAll) {
        btnAll.innerHTML = '<i class="bi bi-check-square"></i> Seleccionar Todo';
        btnAll.classList.replace('btn-primary', 'btn-outline-primary');
    }
};

window.seleccionarTodasLasPlacas = function() {
    const btnAll = document.getElementById('btn-select-all-placas');
    if (!btnAll) return;
    const accionEsMarcar = btnAll.innerText.includes('Seleccionar Todo');

    if (accionEsMarcar) {
        // Seleccionar TODAS las filtradas (todas las páginas)
        window.placasSeleccionadasGlobalmente = (datosFiltradosPlacas || [])
            .filter(f => (f[0] || '').toUpperCase() !== 'PLACA')
            .map(f => f[0]);
    } else {
        window.placasSeleccionadasGlobalmente = [];
    }

    // Marcar/desmarcar los checkboxes visibles en la página actual
    document.querySelectorAll('.chk-bulk-placas').forEach(chk => {
        chk.checked = accionEsMarcar;
        const tarjeta = chk.closest('.card-premium');
        if (tarjeta) tarjeta.classList.toggle('card-selected', accionEsMarcar);
    });

    window._actualizarContadorBulkPlacas();
};

// Al hacer click en checkbox individual de una tarjeta
window.toggleSeleccionPlaca = function(chk, plc) {
    window.placasSeleccionadasGlobalmente = window.placasSeleccionadasGlobalmente || [];
    if (chk.checked) {
        if (!window.placasSeleccionadasGlobalmente.includes(plc))
            window.placasSeleccionadasGlobalmente.push(plc);
        chk.closest('.card-premium')?.classList.add('card-selected');
    } else {
        window.placasSeleccionadasGlobalmente = window.placasSeleccionadasGlobalmente.filter(p => p !== plc);
        chk.closest('.card-premium')?.classList.remove('card-selected');
    }
    window._actualizarContadorBulkPlacas();
};

// ── Eliminar masivo de placas ────────────────────────────────────────────────
window.eliminarMasivo = function(coleccion, contexto) {
    // Preferir selección global (todas las páginas) sobre DOM visible
    var ids = (window.placasSeleccionadasGlobalmente && window.placasSeleccionadasGlobalmente.length > 0)
        ? window.placasSeleccionadasGlobalmente.slice()
        : Array.from(document.querySelectorAll('.chk-bulk-' + contexto + ':checked')).map(function(c) { return c.value; });

    if (!ids.length) { alert('Selecciona al menos una placa.'); return; }
    if (!confirm('¿Eliminar ' + ids.length + ' placa(s) seleccionada(s)?\nEsta acción no se puede deshacer.')) return;

    fetch('/api/eliminarMasivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids, coleccion: coleccion })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(r) {
        if (r.error) { alert('Error: ' + r.error); return; }
        alert('✅ ' + (r.afectados || ids.length) + ' placa(s) eliminada(s).');
        window.modoSeleccion = window.modoSeleccion || {};
        window.modoSeleccion['placas'] = true;
        if (typeof window.activarModoSeleccionPlacas === 'function') window.activarModoSeleccionPlacas();
        cargarTablaPlacas(true);
    })
    .catch(function(err) { alert('Error al eliminar: ' + err.message); });
};

// ── Eliminar placa desde tarjeta (confirm elegante) ─────────────────────────
window.eliminarPlacaDesdeTarjeta = function(plc) {
    if (!window.guardAction('placas', 'd')) return;
    var doDelete = function() {
        fetch('/api/script/eliminarDocumento', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [plc], coleccion: 'Placas', usuario: usuarioLogueado })
        }).then(function(r) { return r.json(); }).then(function(r) {
            if (r.data === 'Éxito') cargarTablaPlacas(true);
            else alert(r.data);
        });
    };
    if (typeof window.confirmar === 'function') {
        window.confirmar({ titulo: 'Eliminar Placa', mensaje: '¿Seguro que deseas eliminar <strong>' + plc + '</strong>? Esta acción no se puede deshacer.', textoConfirmar: 'Sí, eliminar', peligroso: true })
            .then(function(ok) { if (ok) doDelete(); });
    } else {
        if (confirm('¿Eliminar ' + plc + ' definitivamente?')) doDelete();
    }
};

// ── Filtros persistentes ─────────────────────────────────────────────────────
function _guardarFiltrosPlacas() {
    try {
        var state = {
            txt: document.getElementById('buscadorPlacas')?.value || '',
            clientes: Array.from(document.querySelectorAll('#filtroCliente input:checked')).map(function(e){ return e.value; }),
            tipos:    Array.from(document.querySelectorAll('#filtroTipo input:checked')).map(function(e){ return e.value; }),
            marcas:   Array.from(document.querySelectorAll('#filtroMarca input:checked')).map(function(e){ return e.value; }),
            estados:  Array.from(document.querySelectorAll('#filtroEstado input:checked')).map(function(e){ return e.value; })
        };
        localStorage.setItem('fleet_filtros_placas', JSON.stringify(state));
        var btn = document.getElementById('btn-limpiar-filtros-placas');
        var activo = state.txt || state.clientes.length || state.tipos.length || state.marcas.length || state.estados.length;
        if (btn) btn.classList.toggle('d-none', !activo);
    } catch(e) { /* ignore */ }
}

function _restaurarFiltrosPlacas() {
    try {
        var saved = JSON.parse(localStorage.getItem('fleet_filtros_placas') || 'null');
        if (!saved) return;
        var txtEl = document.getElementById('buscadorPlacas');
        if (txtEl && saved.txt) txtEl.value = saved.txt;
        function restoreGroup(gid, vals) {
            if (!vals || !vals.length) return;
            vals.forEach(function(v) {
                var inp = document.querySelector('#' + gid + ' input[value="' + CSS.escape(v) + '"]');
                if (inp) inp.checked = true;
            });
        }
        restoreGroup('filtroCliente', saved.clientes);
        restoreGroup('filtroTipo',    saved.tipos);
        restoreGroup('filtroMarca',   saved.marcas);
        restoreGroup('filtroEstado',  saved.estados);
        var activo = saved.txt || saved.clientes.length || saved.tipos.length || saved.marcas.length || saved.estados.length;
        if (activo) filtrarPlacasAvanzado();
        var btn = document.getElementById('btn-limpiar-filtros-placas');
        if (btn) btn.classList.toggle('d-none', !activo);
    } catch(e) { /* ignore */ }
}

window.limpiarFiltrosPlacas = function() {
    var txtEl = document.getElementById('buscadorPlacas');
    if (txtEl) txtEl.value = '';
    document.querySelectorAll('#filtroCliente input, #filtroTipo input, #filtroMarca input, #filtroEstado input').forEach(function(i) { i.checked = false; });
    localStorage.removeItem('fleet_filtros_placas');
    var btn = document.getElementById('btn-limpiar-filtros-placas');
    if (btn) btn.classList.add('d-none');
    filtrarPlacasAvanzado();
};

// ================================================================
// 🚀 FUNCIÓN DE ARRANQUE — llamada por el Router al (re)cargar
// ================================================================
window.init_placas = function() {
    if (!window.checkPerm('placas', 'l')) {
        window.showNoPermMsg('contenedorPlacasDinamico');
        return;
    }
    // Registrar callbacks de autocompletado RUC al seleccionar cliente
    if (typeof window._cbOnSelect === 'function') {
        window._cbOnSelect('p_cliente', function(val) { window.autocompletarRucSelect(val, 'p_ruc'); });
        window._cbOnSelect('e_cliente', function(val) { window.autocompletarRucSelect(val, 'e_ruc'); });
    }

    // Restaurar preferencia de columnas guardada
    const savedCols = parseInt(localStorage.getItem('fleet_pref_placas_cols') || '4');
    colActualesPlacas = savedCols;
    const selCols = document.querySelector('select[onchange="cambiarColumnasPlacas(this.value)"]');
    if (selCols) selCols.value = String(colActualesPlacas);

    // Restaurar preferencia de filas/página guardada
    const selFilas = document.getElementById('sel-filas-placas');
    if (selFilas) selFilas.value = String(window.filasPlacasConfig);
    ITEMS_POR_PAGINA = colActualesPlacas * window.filasPlacasConfig;

    // Precargar inspecciones si aún no están disponibles (para KPIs de cliente)
    var _arrancarPlacas = function() { cargarTablaPlacas(); };
    if (!window.dataGlobalInspecciones || window.dataGlobalInspecciones.length === 0) {
        fetch('/api/script/obtenerDatosInspecciones', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
            .then(function(r) { return r.ok ? r.json() : { data: [] }; })
            .then(function(j) {
                window.dataGlobalInspecciones = j.data || [];
                _arrancarPlacas();
            })
            .catch(function() { _arrancarPlacas(); });
    } else {
        _arrancarPlacas();
    }

    const fabMenu = document.getElementById('fab-menu');
    if (fabMenu) {
        fabMenu.innerHTML = `
            <li><button class="dropdown-item fw-bold text-primary" onclick="document.getElementById('btnNuevaPlaca').click()"><i class="bi bi-plus-circle"></i> Nueva Placa</button></li>
            <li><button class="dropdown-item fw-bold text-success" onclick="descargarExcelDinamico('tablaPlacasHidden','Base_Placas')"><i class="bi bi-file-earmark-excel"></i> Exportar</button></li>
        `;
    }

    // ── Toggle campos avanzados — Modal Registrar ───────────────
    const btnTogReg = document.getElementById('btnToggleAvanzadoReg');
    const contenedorReg = document.getElementById('contenedorCamposAvanzadosReg');
    if (btnTogReg && contenedorReg) {
        btnTogReg.addEventListener('click', function() {
            const estaOculto = contenedorReg.classList.contains('d-none');
            contenedorReg.classList.toggle('d-none');
            btnTogReg.innerHTML = estaOculto
                ? '<i class="bi bi-gear-fill"></i> Ocultar Configuración Avanzada'
                : '<i class="bi bi-gear"></i> Mostrar Configuración Avanzada';
        });
    }

    // ── Toggle campos avanzados — Modal Editar ──────────────────
    const btnTogEdit = document.getElementById('btnToggleAvanzadoEdit');
    const contenedorEdit = document.getElementById('contenedorCamposAvanzadosEdit');
    if (btnTogEdit && contenedorEdit) {
        btnTogEdit.addEventListener('click', function() {
            const estaOculto = contenedorEdit.classList.contains('d-none');
            contenedorEdit.classList.toggle('d-none');
            btnTogEdit.innerHTML = estaOculto
                ? '<i class="bi bi-gear-fill"></i> Ocultar Configuración Avanzada'
                : '<i class="bi bi-gear"></i> Mostrar Configuración Avanzada';
        });
    }

    // ── Resetear toggle al abrir los modales ────────────────────
    const modalReg = document.getElementById('modalPlaca');
    if (modalReg) {
        modalReg.addEventListener('show.bs.modal', function() {
            if (contenedorReg) contenedorReg.classList.add('d-none');
            if (btnTogReg) btnTogReg.innerHTML = '<i class="bi bi-gear"></i> Mostrar Configuración Avanzada';
        });
    }

    const modalEdit = document.getElementById('modalEditarPlaca');
    if (modalEdit) {
        modalEdit.addEventListener('show.bs.modal', function() {
            if (contenedorEdit) contenedorEdit.classList.add('d-none');
            if (btnTogEdit) btnTogEdit.innerHTML = '<i class="bi bi-gear"></i> Mostrar Configuración Avanzada';
        });
    }
};
// NOTA: cargarTablaPlacas es function declaration — va a window automáticamente al cargar el script.

// ============================================================
// 📱 QR POR PLACA
// ============================================================
window._qrPlacaActual = window._qrPlacaActual || '';

window.abrirQRPlaca = function(placa) {
    if (!placa) return;
    window._qrPlacaActual = placa;

    var label = document.getElementById('qr-placa-label');
    if (label) label.textContent = placa;

    // URL que abrirá directamente la ficha de esa placa en la app
    var appUrl = (window.location.origin || 'https://azkell-crm.onrender.com') +
                 '/?placa=' + encodeURIComponent(placa);
    var urlLabel = document.getElementById('qr-url-label');
    if (urlLabel) urlLabel.textContent = appUrl;

    // Limpiar canvas anterior y generar nuevo QR
    var wrap = document.getElementById('qr-canvas-wrap');
    if (wrap) wrap.innerHTML = '<div id="qr-canvas"></div>';

    if (typeof QRCode !== 'undefined') {
        new QRCode(document.getElementById('qr-canvas'), {
            text: appUrl,
            width: 200,
            height: 200,
            colorDark: '#1e293b',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    var modal = document.getElementById('modalQRPlaca');
    if (modal) (bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal)).show();
};

window.descargarQRPlaca = function() {
    var wrap = document.getElementById('qr-canvas-wrap');
    if (!wrap) return;
    var canvas = wrap.querySelector('canvas');
    if (!canvas) return;
    var link = document.createElement('a');
    link.download = 'QR_' + (window._qrPlacaActual || 'placa') + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    window.mostrarToast('QR descargado', 'success');
};