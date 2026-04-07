// ================================================================
// MÓDULO: PLACAS — lógica aislada
// Cargado dinámicamente por cargarModuloAislado('mantenimiento/placas')
// ================================================================

// ── Variables de estado del módulo ──────────────────────────────
let dataGlobalPlacas    = [];
let datosFiltradosPlacas = [];
let paginaActualPlacas  = 1;
let colActualesPlacas   = 4;
let ITEMS_POR_PAGINA    = 16;

// ── Poblar selects dinámicos desde dataGlobalPlacas ──────────────
window.poblarSelectsFormularios = function(datos) {
    if (!datos || datos.length === 0) return;
    const filas = datos.filter(f => (f[0]||'').toUpperCase() !== 'PLACA');

    function unicos(idx) {
        const set = new Set();
        filas.forEach(f => { const v = (f[idx]||'').toString().trim().toUpperCase(); if (v) set.add(v); });
        return [...set].sort();
    }

    function poblar(id, valores) {
        const sel = document.getElementById(id);
        if (!sel) return;
        const valorActual = sel.value;
        sel.innerHTML = '<option value="">Seleccione...</option>';
        valores.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
        if (valorActual) sel.value = valorActual;
    }

    function poblarClientes(id) {
        const sel = document.getElementById(id);
        if (!sel) return;
        const valorActual = sel.value;
        const mapaClientes = new Map();
        filas.forEach(f => { const n = (f[1]||'').toString().trim(); if (n && !mapaClientes.has(n)) mapaClientes.set(n, (f[2]||'').toString().trim()); });
        sel.innerHTML = '<option value="">Seleccione Cliente...</option>';
        [...mapaClientes.keys()].sort().forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
        if (valorActual) sel.value = valorActual;
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
function cargarTablaPlacas(forzarRefresh = false) { if(!forzarRefresh && dataGlobalPlacas.length > 0) { mostrarPlacas(dataGlobalPlacas); return; } document.getElementById('contenedorPlacasDinamico').innerHTML = '<div class="w-100 text-center py-5"><span class="spinner-border text-warning spinner-border-sm"></span> Cargando...</div>'; google.script.run.withSuccessHandler(mostrarPlacas).obtenerDatosPlacas(); }

window.cambiarColumnasPlacas = function(cols) {
    colActualesPlacas = parseInt(cols);
    ITEMS_POR_PAGINA = colActualesPlacas * 4;
    paginaActualPlacas = 1;
    const contenedor = document.getElementById('contenedorPlacasDinamico');
    if (contenedor) contenedor.className = `flex-grow-1 overflow-auto p-3 placas-grid-view grid-cols-${colActualesPlacas}`;
    renderizarPaginaPlacas();
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

    let perms = permisosUsuario || {};
    let isAdmP = perms.admin === true || (localStorage.getItem('crm_correo') || '').toLowerCase() === 'admin@azkell.com';
    const canEditP = isAdmP || perms.placas?.e === true;
    const canDeleteP = isAdmP || perms.placas?.d === true;

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
        const est = fila[18] ? fila[18].trim() : '';
        const badgeCls = est === 'Activa' ? 'badge-green' : (est === 'Inactiva' ? 'badge-red' : '');
        const indexGlobal = dataGlobalPlacas.findIndex(x => x[0] === plc);

        if (cli !== clienteActual) {
            clienteActual = cli;
            html += `<div class="group-header-left"><i class="bi bi-building me-2 text-primary"></i> ${cli}</div>`;
        }

        let menuAcciones = '';
        if (canEditP || canDeleteP) {
            let items = '';
            if (canEditP) items += `<li><a class="dropdown-item fw-bold" href="#" onclick="abrirModalEditarPlaca(${indexGlobal})"><i class="bi bi-pencil text-primary"></i> Editar</a></li>`;
            if (canEditP && canDeleteP) items += `<li><hr class="dropdown-divider"></li>`;
            if (canDeleteP) items += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="event.stopPropagation(); if(confirm('¿Eliminar ${plc} definitivamente?')) { fetch('/api/script/eliminarDocumento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:['${plc}'],coleccion:'Placas',usuario:usuarioLogueado})}).then(r=>r.json()).then(r=>{ if(r.data==='Éxito') cargarTablaPlacas(true); else alert(r.data); }); }"><i class="bi bi-trash"></i> Eliminar</a></li>`;
            menuAcciones = `<div class="dropdown ms-1" onclick="event.stopPropagation()"><button class="btn-dots" type="button" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${items}</ul></div>`;
        }

        let checkHtml = window.modoSeleccion && window.modoSeleccion['placas'] ? `<input type="checkbox" class="form-check-input chk-bulk-placas" value="${plc}" style="pointer-events: none;">` : '';

        html += `<div class="card-premium" onclick="abrirDetallePlaca(event, ${indexGlobal})">
            <div class="card-header-theme">
                <div class="d-flex align-items-center gap-2">${checkHtml}<div class="card-title-prem">${plc}</div></div>
                ${menuAcciones}
            </div>
            <div class="card-data-row"><span>MARCA</span><span title="${mar}">${mar}</span></div>
            <div class="card-data-row"><span>ESTADO</span><span class="badge-premium ${badgeCls}">${est}</span></div>
        </div>`;
    });

    contenedor.innerHTML = html;
    const fin = Math.min(inicio + ITEMS_POR_PAGINA, datosFiltradosPlacas.length);
    if(infoPag) infoPag.innerText = `Mostrando ${inicio + 1}–${fin} de ${datosFiltradosPlacas.length} placas`;
    let btnHtml = `<button class="btn-pag-nav" onclick="cambiarPaginaPlacas(-1)" ${paginaActualPlacas === 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>`;
    btnHtml += `<span class="px-3 fw-bold text-primary" style="font-size:0.9rem;">Pág. ${paginaActualPlacas} / ${totalPaginas}</span>`;
    btnHtml += `<button class="btn-pag-nav" onclick="cambiarPaginaPlacas(1)" ${paginaActualPlacas >= totalPaginas ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>`;
    if(ctrlPag) ctrlPag.innerHTML = btnHtml;
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
            if (checkbox.checked) tarjeta.classList.add('card-selected');
            else tarjeta.classList.remove('card-selected');
            if (typeof toggleBulkBtn === 'function') toggleBulkBtn('placas');
        }
        return;
    }

    if (event.target.closest('.dropdown') || event.target.closest('.chk-bulk-placas') || event.target.closest('.btn-dots')) return;
    const p = dataGlobalPlacas[index];
    if (!p) return;

    document.getElementById('det-placa-titulo').innerText = p[0] || 'SIN PLACA';

    const ids = ['det-cliente','det-ruc','det-marca','det-modelo','det-tipo','det-sub_tipo','det-color','det-nro_motor','det-nro_caja','det-nro_corona','det-nro_vin','det-conf','det-anio','det-comb','det-carga_util','det-peso_neto','det-peso_bruto','det-estado','det-uts','det-motora','det-llantas','det-enuso'];
    ids.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = p[i + 1] ? p[i + 1] : '-';
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

    new bootstrap.Offcanvas(document.getElementById('offcanvasDetallePlaca')).show();
}

// ── Modal editar ────────────────────────────────────────────────
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

    ids.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) {
            const valorLimpio = p[i] ? p[i].toString().trim() : '';
            if (el.tagName === 'SELECT' && valorLimpio !== '') {
                let options = Array.from(el.options);
                let match = options.find(opt => opt.value.toUpperCase() === valorLimpio.toUpperCase());
                if (match) {
                    el.value = match.value;
                } else if (el.classList.contains('sel-inteligente')) {
                    const nuevaOpcion = new Option(valorLimpio.toUpperCase(), valorLimpio.toUpperCase());
                    el.insertBefore(nuevaOpcion, el.lastElementChild);
                    el.value = valorLimpio.toUpperCase();
                } else {
                    el.value = valorLimpio;
                }
            } else {
                el.value = valorLimpio;
            }
        }
    });

    const btn = document.getElementById('btnActualizarPlaca');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-pencil-square"></i> Actualizar Ficha';
    }

    new bootstrap.Modal(document.getElementById('modalEditarPlaca')).show();
};

function enviarPlaca(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnGuardarPlaca'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...'; formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { formObj.reset(); bootstrap.Modal.getInstance(document.getElementById('modalPlaca')).hide(); cargarTablaPlacas(true); } else alert(r); btn.disabled = false; btn.innerHTML = 'Guardar'; }).withFailureHandler(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Guardar'; }).guardarPlaca(formObj); }
function enviarEdicionPlaca(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnActualizarPlaca'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Actualizando...'; formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { bootstrap.Modal.getInstance(document.getElementById('modalEditarPlaca')).hide(); cargarTablaPlacas(true); } else alert(r); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).withFailureHandler(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).actualizarPlaca(formObj); }

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
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (rawJson.length === 0) {
            alert("El archivo Excel está vacío o no tiene datos válidos.");
            return;
        }

        const confirmar = confirm(`Se importarán ${rawJson.length} registros.\n¿Continuar?`);
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

    const btnAll = document.getElementById('btn-select-all-placas');
    const btnBulk = document.getElementById('btn-bulk-placas');

    if (window.modoSeleccion['placas']) {
        btnAll.classList.remove('d-none');
        btnAll.innerHTML = '<i class="bi bi-check-square"></i> Seleccionar Todo';
        btnAll.classList.replace('btn-primary', 'btn-outline-primary');
    } else {
        btnAll.classList.add('d-none');
        btnBulk.classList.add('d-none');
        document.querySelectorAll('.chk-bulk-placas').forEach(c => c.checked = false);
        document.querySelectorAll('.card-premium').forEach(c => c.classList.remove('card-selected'));
    }

    renderizarPaginaPlacas();
};

window.seleccionarTodasLasPlacas = function() {
    const btnAll = document.getElementById('btn-select-all-placas');
    const checkboxes = document.querySelectorAll('.chk-bulk-placas');

    const accionEsMarcar = btnAll.innerText.includes('Seleccionar Todo');

    checkboxes.forEach(chk => {
        chk.checked = accionEsMarcar;
        const tarjeta = chk.closest('.card-premium');
        if (tarjeta) {
            if (accionEsMarcar) tarjeta.classList.add('card-selected');
            else tarjeta.classList.remove('card-selected');
        }
    });

    if (accionEsMarcar) {
        window.placasSeleccionadasGlobalmente = dataGlobalPlacas
            .filter(f => (f[0] || '').toUpperCase() !== 'PLACA')
            .map(f => f[0]);
    } else {
        window.placasSeleccionadasGlobalmente = [];
    }

    if (accionEsMarcar) {
        btnAll.innerHTML = '<i class="bi bi-check-square-fill"></i> Desmarcar Todo';
        btnAll.classList.replace('btn-outline-primary', 'btn-primary');
    } else {
        btnAll.innerHTML = '<i class="bi bi-check-square"></i> Seleccionar Todo';
        btnAll.classList.replace('btn-primary', 'btn-outline-primary');
    }

    const btnEliminar = document.getElementById('btn-bulk-placas');
    const countSpan = document.getElementById('cnt-bulk-placas');
    if (btnEliminar && countSpan) {
        const cantidad = window.placasSeleccionadasGlobalmente ? window.placasSeleccionadasGlobalmente.length : 0;
        countSpan.innerText = cantidad;
        if (cantidad > 0) btnEliminar.classList.remove('d-none');
        else btnEliminar.classList.add('d-none');
    }
};

// ================================================================
// 🚀 FUNCIÓN DE ARRANQUE — llamada por el Router al (re)cargar
// ================================================================
window.init_placas = function() {
    cargarTablaPlacas();

    const fabMenu = document.getElementById('fab-menu');
    if (fabMenu) {
        fabMenu.innerHTML = `
            <li><button class="dropdown-item fw-bold text-primary" onclick="document.getElementById('btnNuevaPlaca').click()"><i class="bi bi-plus-circle"></i> Nueva Placa</button></li>
            <li><button class="dropdown-item fw-bold text-success" onclick="descargarExcelDinamico('tablaPlacasHidden','Base_Placas')"><i class="bi bi-file-earmark-excel"></i> Exportar</button></li>
        `;
    }
};