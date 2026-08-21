// ================================================================
// MÓDULO: PLACAS — lógica aislada
// Cargado dinámicamente por cargarModuloAislado('mantenimiento/placas')
// ================================================================

// ── Variables de estado del módulo ──────────────────────────────
var dataGlobalPlacas    = window.dataGlobalPlacas || [];
var datosFiltradosPlacas = window.datosFiltradosPlacas || [];
var paginaActualPlacas  = window.paginaActualPlacas || 1;
var colActualesPlacas   = window.colActualesPlacas || 4;

var ITEMS_POR_PAGINA = 50;

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
    const modelos  = unicos(4);
    const tipos    = unicos(5);
    const subTipos = unicos(6);
    const colores  = unicos(7);
    const confs    = unicos(12);

    poblarClientes('p_cliente');
    poblar('p_marca',    marcas);
    poblar('p_modelo',   modelos);
    poblar('p_tipo',     tipos);
    poblar('p_sub_tipo', subTipos);
    poblar('p_color',    colores);
    poblar('p_conf',     confs);

    poblarClientes('e_cliente');
    poblar('e_marca',    marcas);
    poblar('e_modelo',   modelos);
    poblar('e_tipo',     tipos);
    poblar('e_sub_tipo', subTipos);
    poblar('e_color',    colores);
    poblar('e_conf',     confs);

    // Dynamic filtering of Modelos based on selected Marca
    window._actualizarModelosPorMarca = function(marcaId, modeloId) {
        const marcaTxtEl = document.getElementById(marcaId + '-txt');
        const selectedMarca = ((marcaTxtEl || {}).value || '').toString().trim().toUpperCase();

        let listModelos;
        if (!selectedMarca) {
            listModelos = unicos(4);
        } else {
            const seen = new Map();
            filas.forEach(f => {
                const mVal = (f[3] || '').toString().trim().toUpperCase();
                if (mVal === selectedMarca) {
                    const mod = (f[4] || '').toString().trim();
                    if (mod) { const key = mod.toUpperCase(); if (!seen.has(key)) seen.set(key, mod); }
                }
            });
            listModelos = [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
            if (listModelos.length === 0) listModelos = unicos(4);
        }
        poblar(modeloId, listModelos);
    };

    // Poblar dropdowns de Wialon
    function poblarWialon(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '<option value="">-- Búsqueda Automática (Recomendado) --</option>';
        if (CACHE && CACHE.wialon && Array.isArray(CACHE.wialon)) {
            const sortedWialon = CACHE.wialon.map(w => w.nombre_wialon).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
            sortedWialon.forEach(nombre => {
                const opt = document.createElement('option');
                opt.value = nombre;
                opt.textContent = nombre;
                el.appendChild(opt);
            });
        }
    }
    poblarWialon('p_wialon_name');
    poblarWialon('e_wialon_name');
};

// ── Carga principal ──────────────────────────────────────────────
function cargarTablaPlacas(forzarRefresh = false) {
    if (!forzarRefresh && window.dataGlobalPlacas && window.dataGlobalPlacas.length > 0) { mostrarPlacas(window.dataGlobalPlacas); return; }
    const c = document.getElementById('contenedorPlacasDinamico');
    if (c) c.innerHTML = '<tr><td colspan="25" class="text-center py-5" style="color:#94a3b8;"><span class="spinner-border text-warning spinner-border-sm me-2"></span> Cargando...</td></tr>';
    
    fetch('/api/script/obtenerDatosPlacas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
        .then(function(r) { return r.json(); })
        .then(function(r) {
            window.dataGlobalPlacas = r.data || [];
            mostrarPlacas(window.dataGlobalPlacas);
        })
        .catch(function() { mostrarPlacas([]); });
}

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
    const fields = ['nc_nombre', 'nc_ruc', 'nc_telefono', 'nc_email', 'nc_direccion', 'nc_notas'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const nc_ts = document.getElementById('nc_target_select');
    const nc_tr = document.getElementById('nc_target_ruc');
    if (nc_ts) nc_ts.value = targetSelectId || '';
    if (nc_tr) nc_tr.value = targetRucId    || '';
    const modalEl = document.getElementById('modalNuevoCliente');
    if (modalEl) new bootstrap.Modal(modalEl).show();
};

// ── Consulta SUNAT / RENIEC para Nuevo Cliente ──────────────────────────────
window.consultarDocNuevoCliente = async function() {
    let numInput = document.getElementById('nc_ruc');
    let razonInput = document.getElementById('nc_nombre');
    let dirInput = document.getElementById('nc_direccion');
    let notasInput = document.getElementById('nc_notas');
    if (!numInput || !razonInput) return;

    let num = numInput.value.trim();
    if (!num) return;

    let tipo = num.length === 11 ? 'RUC' : (num.length === 8 ? 'DNI' : 'RUC');
    let btnIcon = document.getElementById('nc_btn_search_icon');
    if (btnIcon) btnIcon.className = "spinner-border spinner-border-sm me-1";

    try {
        let res = await fetch('/api/proxy/documento?tipo=' + tipo + '&numero=' + num);
        if (!res.ok) throw new Error("Documento no encontrado");
        let data = await res.json();
        if (data && (data.nombre || data.razon_social)) {
            razonInput.value = (data.nombre || data.razon_social).toUpperCase();
            if (dirInput && data.direccion) dirInput.value = data.direccion.toUpperCase();
            if (notasInput) {
                let infoSunat = [];
                if (data.estado) infoSunat.push("ESTADO SUNAT: " + data.estado);
                if (data.condicion) infoSunat.push("CONDICIÓN: " + data.condicion);
                if (infoSunat.length) notasInput.value = infoSunat.join(" | ");
            }
            if (typeof window.rotToast === 'function') window.rotToast("Datos SUNAT/RENIEC obtenidos", "bg-success");
        }
    } catch (err) {
        console.warn('Consulta doc nuevo cliente:', err);
        if (typeof window.rotToast === 'function') window.rotToast("No se encontró RUC/DNI en SUNAT/RENIEC", "bg-warning");
    } finally {
        if (btnIcon) btnIcon.className = "bi bi-search me-1";
    }
};

// ── Consulta Ficha Técnica por Placa (Búsqueda Automática) ──────────────────
window.consultarDatosPlaca = async function(inputId) {
    let placaEl = document.getElementById(inputId) || document.querySelector(`[name="${inputId}"]`);
    if (!placaEl) return;
    let num = placaEl.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!num) { alert('Ingresa el número de placa'); return; }

    let isEdit = inputId.startsWith('e_');
    let prefix = isEdit ? 'e_' : 'p_';

    let btnIcon = document.getElementById(prefix + 'btn_search_placa_icon');
    if (btnIcon) btnIcon.className = "spinner-border spinner-border-sm";

    try {
        let res = await fetch('/api/proxy/placa?numero=' + num);
        if (!res.ok) {
            if (typeof window.rotToast === 'function') window.rotToast("Placa no encontrada en BD previa. Ingrese los datos.", "bg-warning");
            return;
        }
        let d = await res.json();

        if (d.placa) {
            placaEl.value = d.placa;
        }

        if (d.encontrado === false) {
            if (typeof window.rotToast === 'function') window.rotToast("Placa formateada como " + (d.placa || num) + ". Lista para registrar.", "bg-info");
            return;
        }

        // 1. Datos Generales
        if (d.cliente) {
            if (typeof window._cbSet === 'function') window._cbSet(prefix + 'cliente', d.cliente, d.cliente);
            else {
                let el = document.getElementById(prefix + 'cliente') || document.querySelector(`[name="${prefix}cliente"]`);
                if (el) el.value = d.cliente;
            }
        }
        if (d.ruc_dni) {
            let rucEl = document.getElementById(prefix + 'ruc') || document.querySelector(`[name="${prefix}ruc"]`);
            if (rucEl) rucEl.value = d.ruc_dni;
        }

        // 2. Especificaciones Técnicas
        if (d.marca) {
            if (typeof window._cbSet === 'function') window._cbSet(prefix + 'marca', d.marca, d.marca);
            else {
                let el = document.getElementById(prefix + 'marca') || document.querySelector(`[name="${prefix}marca"]`);
                if (el) el.value = d.marca;
            }
        }
        if (d.modelo) {
            let el = document.querySelector(`[name="${prefix}modelo"]`);
            if (el) el.value = d.modelo;
        }
        if (d.tipo) {
            if (typeof window._cbSet === 'function') window._cbSet(prefix + 'tipo', d.tipo, d.tipo);
            else {
                let el = document.getElementById(prefix + 'tipo') || document.querySelector(`[name="${prefix}tipo"]`);
                if (el) el.value = d.tipo;
            }
        }
        if (d.sub_tipo) {
            if (typeof window._cbSet === 'function') window._cbSet(prefix + 'sub_tipo', d.sub_tipo, d.sub_tipo);
            else {
                let el = document.getElementById(prefix + 'sub_tipo') || document.querySelector(`[name="${prefix}sub_tipo"]`);
                if (el) el.value = d.sub_tipo;
            }
        }

        // 3. Configuración Avanzada
        if (d.color && typeof window._cbSet === 'function') window._cbSet(prefix + 'color', d.color, d.color);
        if (d.nro_motor) { let el = document.querySelector(`[name="${prefix}nro_motor"]`); if (el) el.value = d.nro_motor; }
        if (d.nro_caja) { let el = document.querySelector(`[name="${prefix}nro_caja"]`); if (el) el.value = d.nro_caja; }
        if (d.nro_corona) { let el = document.querySelector(`[name="${prefix}nro_corona"]`); if (el) el.value = d.nro_corona; }
        if (d.nro_vin) { let el = document.querySelector(`[name="${prefix}nro_vin"]`); if (el) el.value = d.nro_vin; }
        if (d.configuracion && typeof window._cbSet === 'function') window._cbSet(prefix + 'conf', d.configuracion, d.configuracion);
        if (d.anio) { let el = document.querySelector(`[name="${prefix}anio"]`); if (el) el.value = d.anio; }
        if (d.combustible) { let el = document.querySelector(`[name="${prefix}comb"]`); if (el) el.value = d.combustible; }

        // 4. Pesos y Capacidades
        if (d.carga_util) { let el = document.querySelector(`[name="${prefix}carga_util"]`); if (el) el.value = d.carga_util; }
        if (d.peso_neto) { let el = document.querySelector(`[name="${prefix}peso_neto"]`); if (el) el.value = d.peso_neto; }
        if (d.peso_bruto) { let el = document.querySelector(`[name="${prefix}peso_bruto"]`); if (el) el.value = d.peso_bruto; }

        // Mostrar sección avanzada si estaba oculta
        let advCont = document.getElementById(isEdit ? 'contenedorCamposAvanzadosEdit' : 'contenedorCamposAvanzadosReg');
        if (advCont) advCont.classList.remove('d-none');

        if (typeof window.rotToast === 'function') window.rotToast("Ficha técnica obtenida", "bg-success");
    } catch (err) {
        console.warn('Consulta datos placa:', err);
        if (typeof window.rotToast === 'function') window.rotToast("No se encontraron datos automáticos para esta placa", "bg-warning");
    } finally {
        if (btnIcon) btnIcon.className = "bi bi-search";
    }
};

// ── Guarda el nuevo cliente desde el modal y lo inyecta en el select ─────────
window.guardarNuevoCliente = function() {
    const nombre    = (document.getElementById('nc_nombre')?.value    || '').trim().toUpperCase();
    const ruc       = (document.getElementById('nc_ruc')?.value       || '').trim();
    const telefono  = (document.getElementById('nc_telefono')?.value  || '').trim();
    const email     = (document.getElementById('nc_email')?.value     || '').trim();
    const direccion = (document.getElementById('nc_direccion')?.value || '').trim();
    const notas     = (document.getElementById('nc_notas')?.value     || '').trim();

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
    if (!window.checkPerm('placas', 'l')) {
        var wrap = document.getElementById('moduloPlacas') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
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
    _restaurarFiltrosPlacas();
    if (datosFiltradosPlacas.length === 0 && datosUtiles.length > 0) {
        if (typeof window.limpiarFiltrosPlacas === 'function') window.limpiarFiltrosPlacas();
    } else {
        renderizarPaginaPlacas();
    }
    if (typeof window.actualizarBadgesSidebar === 'function') window.actualizarBadgesSidebar();
}

// ── Filtro avanzado ──────────────────────────────────────────────
// ── Filtrado por Tipo KPI / Segmented Control ─────────────────────
window.filtrarPorTipoKPI = function(tipo, element) {
    if (window._kpiFiltroActivo === tipo && tipo !== 'total') {
        window._kpiFiltroActivo = null;
        tipo = 'total';
    } else if (tipo === 'total') {
        window._kpiFiltroActivo = null;
    } else {
        window._kpiFiltroActivo = tipo;
    }

    // Actualizar clases activas en Tarjetas KPI
    document.querySelectorAll('.ck-kpi-card').forEach(c => {
        if (c.getAttribute('data-tipo-kpi') === tipo) c.classList.add('active');
        else c.classList.remove('active');
    });

    // Actualizar pills segmentadas
    document.querySelectorAll('#btn-group-tipos-placas .ck-segment-item').forEach(b => {
        if (b.getAttribute('data-tipo-kpi') === tipo) b.classList.add('active');
        else b.classList.remove('active');
    });

    window.filtrarPlacasAvanzado();
};

window.filtrarPlacasAvanzado = function() {
    const txt = document.getElementById('buscadorPlacas')?.value.toLowerCase() || '';
    const kpiFiltroActivo = window._kpiFiltroActivo || null;

    let kpiCamion=0, kpiCarreta=0, kpiSemi=0, kpiTracto=0, kpiTotal=0;
    let datosUtiles = dataGlobalPlacas.filter(f => (f[0]||'').toUpperCase() !== 'PLACA');
    
    datosFiltradosPlacas = datosUtiles.filter(row => {
        // 1. Buscador de texto general (busca en TODAS las columnas)
        const rowTexto = row.map(v => (v||'').toLowerCase().trim()).join(' ');
        if (txt && !rowTexto.includes(txt)) return false;

        // 2. Filtros Avanzados por Columna
        for (let colIndex in window.placasFiltros) {
            if (window.placasFiltros[colIndex].size > 0) {
                let val = row[colIndex] ? row[colIndex].trim() : '';
                if (val === '') val = '(Vacío)';
                if (!window.placasFiltros[colIndex].has(val)) {
                    return false; // No cumple un filtro activo
                }
            }
        }
        
        // 3. KPI Counting (ignorando el filtro KPI actual)
        kpiTotal++;
        const tip = row[5] ? row[5].trim() : '';
        const t = tip.toLowerCase();
        if (t.includes('cami') || t.includes('camion')) kpiCamion++;
        else if (t.includes('carreta')) kpiCarreta++;
        else if (t.includes('semirremolque')||t.includes('semi')) kpiSemi++;
        else if (t.includes('tracto')) kpiTracto++;

        // 4. Aplicar Filtro KPI si está activo
        if (kpiFiltroActivo) {
            if (kpiFiltroActivo === 'camion' && !(t.includes('cami') || t.includes('camion'))) return false;
            if (kpiFiltroActivo === 'carreta' && !t.includes('carreta')) return false;
            if (kpiFiltroActivo === 'semi' && !(t.includes('semirremolque') || t.includes('semi'))) return false;
            if (kpiFiltroActivo === 'tracto' && !t.includes('tracto')) return false;
        }

        return true;
    });

    const safe = v => document.getElementById(v);
    if (safe('kpi-total')) safe('kpi-total').innerText = kpiTotal;
    if (safe('kpi-camion')) safe('kpi-camion').innerText = kpiCamion;
    if (safe('kpi-carreta')) safe('kpi-carreta').innerText = kpiCarreta;
    if (safe('kpi-semi')) safe('kpi-semi').innerText = kpiSemi;
    if (safe('kpi-tracto')) safe('kpi-tracto').innerText = kpiTracto;
    
    paginaActualPlacas = 1;
    renderizarPaginaPlacas();
};

function actualizarIndicadoresPlacas(datos) {
    let camiones = 0, carretas = 0, semirremolques = 0, tractos = 0, total = 0;

    datos.forEach(fila => {
        if ((fila[0] || '').toUpperCase() === 'PLACA') return;
        total++;
        const tipo = (fila[5] || '').toString().trim().toUpperCase();
        if (tipo.includes('CAMI')) camiones++;
        else if (tipo.includes('CARRETA')) carretas++;
        else if (tipo.includes('SEMI')) semirremolques++;
        else if (tipo.includes('TRACTO')) tractos++;
    });

    const elTotal = document.getElementById('kpi-total');
    const elCamiones = document.getElementById('kpi-camion');
    const elCarretas = document.getElementById('kpi-carreta');
    const elSemis = document.getElementById('kpi-semi');
    const elTractos = document.getElementById('kpi-tracto');

    if (elTotal) elTotal.innerText = total;
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
    const infoPag = document.getElementById('placas-contador');
    const ctrlPag = document.getElementById('controles-paginacion-placas');
    
    if (!contenedor) return;

    actualizarIndicadoresPlacas(datosFiltradosPlacas);

    if (datosFiltradosPlacas.length === 0) {
        contenedor.innerHTML = '<tr><td colspan="30" style="text-align:center;padding:3rem;color:#94a3b8;"><i class="bi bi-inbox fs-2 d-block mb-2"></i>No hay vehículos que coincidan.</td></tr>';
        if(infoPag) infoPag.innerText = '0 resultados'; if(ctrlPag) ctrlPag.innerHTML = ''; return;
    }

    const canEditP = window.checkPerm('placas','e');
    const canDeleteP = window.checkPerm('placas','d');

    const totalPaginas = Math.ceil(datosFiltradosPlacas.length / ITEMS_POR_PAGINA);
    if(paginaActualPlacas > totalPaginas) paginaActualPlacas = totalPaginas;
    const inicio = (paginaActualPlacas - 1) * ITEMS_POR_PAGINA;
    const datosPagina = datosFiltradosPlacas.slice(inicio, inicio + ITEMS_POR_PAGINA);

    if(infoPag) infoPag.innerText = datosFiltradosPlacas.length + ' placa(s)';

    let html = '';
    let htmlCards = '';
    
    datosPagina.forEach((fila) => {
        const plc = (fila[0]||'').trim();
        const cliente = (fila[1]||'').trim();
        const ruc = (fila[2]||'').trim();
        const marca = (fila[3]||'').trim();
        const modelo = (fila[4]||'').trim();
        const tipo = (fila[5]||'').trim();
        const anio = (fila[13]||'').trim();
        const est = fila[18] ? fila[18].trim() : '';
        const indexGlobal = dataGlobalPlacas.findIndex(x => x[0] === plc);

        let menuAcciones = '';
        if (canEditP || canDeleteP) {
            let items = '';
            if (canEditP) items += '<li><a class="dropdown-item fw-semibold py-2" href="javascript:void(0)" onclick="abrirModalEditarPlaca(' + indexGlobal + ')"><i class="bi bi-pencil text-primary me-2"></i> Editar</a></li>';
            if (canEditP && canDeleteP) items += '<li><hr class="dropdown-divider my-1"></li>';
            if (canDeleteP) items += '<li><a class="dropdown-item text-danger fw-bold py-2" href="javascript:void(0)" onclick="eliminarPlacaDesdeTarjeta(\'' + plc + '\')"><i class="bi bi-trash me-2"></i> Eliminar</a></li>';
            
            menuAcciones = '<div class="dropstart text-center">' +
                '<button class="btn btn-sm btn-light border-0 shadow-none" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="background:transparent; color:#64748b; padding:4px 8px; border-radius:6px;" onclick="event.stopPropagation()">' +
                '<i class="bi bi-three-dots-vertical fs-6"></i>' +
                '</button>' +
                '<ul class="dropdown-menu shadow-sm border" style="border-radius:10px; font-size:0.85rem; z-index:1050;">' +
                items +
                '</ul>' +
                '</div>';
        } else {
            menuAcciones = '<span class="text-muted"><i class="bi bi-dash"></i></span>';
        }

        let checkHtml = '<input type="checkbox" class="form-check-input chk-bulk-placas m-0" value="'+plc+'" style="cursor: pointer;" onchange="window._placasToggleSel(\''+plc+'\', this.checked)">';

        var estadoHtml = est === 'Activa'
            ? '<span style="font-size:0.7rem;font-weight:700;color:#16a34a;background:#dcfce7;padding:0.2rem 0.5rem;border-radius:12px;">Activa</span>'
            : (est === 'Inactiva' ? '<span style="font-size:0.7rem;font-weight:700;color:#475569;background:#e2e8f0;padding:0.2rem 0.5rem;border-radius:12px;">Inactiva</span>' : est);

        var estadoBadgeMobile = est === 'Activa'
            ? '<span class="badge rounded-pill fw-bold text-success" style="background:#dcfce7; border:1px solid #a7f3d0; font-size:0.72rem; padding:4px 10px;">Activa</span>'
            : '<span class="badge rounded-pill fw-bold text-secondary" style="background:#e2e8f0; border:1px solid #cbd5e1; font-size:0.72rem; padding:4px 10px;">Inactiva</span>';

        var tipoLower = tipo.toLowerCase();
        var tipoIcon = (tipoLower.indexOf('camion') !== -1) ? 'bi-truck' :
                       (tipoLower.indexOf('tracto') !== -1) ? 'bi-truck-front' :
                       (tipoLower.indexOf('carreta') !== -1) ? 'bi-truck-flatbed' : 'bi-shield-shaded';

        // 1. Desktop Row
        html += '<tr style="border-bottom: 1px solid var(--border); transition: background 0.2s; cursor:pointer;" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'transparent\'" onclick="abrirDetallePlaca(event, '+indexGlobal+')">';
        html += '<td style="text-align:center; padding:0.75rem 0.5rem;" onclick="event.stopPropagation()">' + checkHtml + '</td>';
        
        // Mapeo sincronizado con los 28 campos + estado + acciones
        const ordenVisual = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 24, 25, 26, 27, 13, 14, 28, 15, 16, 17, 19, 20, 21, 22, 18];
        for (let i of ordenVisual) {
            let val = (fila[i] !== undefined && fila[i] !== null && String(fila[i]).trim() !== '') ? String(fila[i]).trim() : '—';
            let tdStyle = 'padding:0.75rem 0.5rem; color:var(--text);';
            
            if (i === 0) {
                html += '<td style="' + tdStyle + ' font-weight:700;">' + val + '</td>';
            } else if (i === 18) {
                html += '<td style="' + tdStyle + ' text-align:center;">' + estadoHtml + '</td>';
            }
            else {
                html += '<td style="' + tdStyle + ' font-size:0.85rem;">' + val + '</td>';
            }
        }

        // Columna Acciones
        html += '<td style="padding:0.75rem 0.5rem; text-align:center;" onclick="event.stopPropagation()">' + menuAcciones + '</td>';
        html += '</tr>';

        // 2. Mobile Card (1:1 Reporte de Fallas)
        htmlCards += '<div class="card mb-2 shadow-2xs border rounded-3 p-3 bg-white" onclick="abrirDetallePlaca(event, ' + indexGlobal + ')" style="cursor: pointer;">'
                   + '<div class="d-flex justify-content-between align-items-center mb-2">'
                   + '  <div class="d-flex align-items-center gap-2">'
                   + '    <span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-1" style="font-size:0.92rem; letter-spacing:0.5px;">' + plc + '</span>'
                   + '    <span class="badge rounded-pill fw-bold text-uppercase" style="background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe; font-size:0.68rem; padding:3px 8px;"><i class="bi ' + tipoIcon + ' me-1"></i>' + (tipo || 'UNIDAD') + '</span>'
                   + '  </div>'
                   + '  <div class="d-flex align-items-center gap-1">' + estadoBadgeMobile + '<div onclick="event.stopPropagation();">' + menuAcciones + '</div></div>'
                   + '</div>'
                   + '<div class="d-flex flex-column gap-1" style="font-size:0.82rem;">'
                   + '  <div class="d-flex justify-content-between"><span class="text-secondary">Cliente:</span><span class="fw-bold text-dark text-truncate text-end" style="max-width:200px;">' + (cliente || '—') + '</span></div>'
                   + '  <div class="d-flex justify-content-between"><span class="text-secondary">Marca / Modelo:</span><span class="fw-semibold text-dark">' + (marca || '—') + (modelo ? ' • ' + modelo : '') + (anio ? ' (' + anio + ')' : '') + '</span></div>'
                   + (ruc ? '  <div class="d-flex justify-content-between"><span class="text-secondary">RUC / DNI:</span><span class="text-muted font-monospace">' + ruc + '</span></div>' : '')
                   + '</div></div>';
    });

    contenedor.innerHTML = html;
    const cardContainer = document.getElementById('placasCardContainer');
    if (cardContainer) {
        cardContainer.innerHTML = htmlCards || '<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2"></i>No hay vehículos que coincidan.</div>';
    }

    // Actualizar controles paginación
    let pagHtml = '';
    if (totalPaginas > 1) {
        pagHtml += '<nav><ul class="pagination pagination-sm mb-0 shadow-sm" style="border-radius: 8px; overflow: hidden; font-size: 0.85rem;">';
        
        pagHtml += '<li class="page-item ' + (paginaActualPlacas<=1?'disabled':'') + '"><button class="page-link border-0 text-dark fw-bold" onclick="cambiarPaginaPlacas(-1)"><i class="bi bi-chevron-left"></i></button></li>';
        
        var start = Math.max(1, paginaActualPlacas - 2), end = Math.min(totalPaginas, start + 4);
        if (end - start < 4) start = Math.max(1, end - 4);
        
        for (var i = start; i <= end; i++) {
            if (i === paginaActualPlacas) {
                pagHtml += '<li class="page-item active"><button class="page-link border-0 bg-primary text-white fw-bold shadow-sm rounded-2 mx-1">' + i + '</button></li>';
            } else {
                pagHtml += '<li class="page-item"><button class="page-link border-0 text-muted fw-bold mx-1 hover-bg-light rounded-2" onclick="window._placasIrPagina('+i+')">' + i + '</button></li>';
            }
        }
        
        pagHtml += '<li class="page-item ' + (paginaActualPlacas>=totalPaginas?'disabled':'') + '"><button class="page-link border-0 text-dark fw-bold" onclick="cambiarPaginaPlacas(1)"><i class="bi bi-chevron-right"></i></button></li>';
        
        pagHtml += '</ul></nav>';
        pagHtml += '<span class="text-muted fw-bold ms-3" style="font-size: 0.8rem;">Página '+paginaActualPlacas+' de '+totalPaginas+'</span>';
    }
        if(ctrlPag) ctrlPag.innerHTML = pagHtml;

    if (window.placasSeleccionadasGlobalmente) {
        const selSet = new Set(window.placasSeleccionadasGlobalmente);
        document.querySelectorAll('.chk-bulk-placas').forEach(function(chk) {
            chk.checked = selSet.has(chk.value);
        });
    }
}

window._placasIrPagina = function(pag) {
    const totalPaginas = Math.ceil(datosFiltradosPlacas.length / ITEMS_POR_PAGINA);
    paginaActualPlacas = Math.max(1, Math.min(totalPaginas, pag));
    renderizarPaginaPlacas();
};

window._placasToggleSel = function(id, checked) {
    window.placasSeleccionadasGlobalmente = window.placasSeleccionadasGlobalmente || [];
    if (checked) {
        if (!window.placasSeleccionadasGlobalmente.includes(id)) window.placasSeleccionadasGlobalmente.push(id);
    } else {
        window.placasSeleccionadasGlobalmente = window.placasSeleccionadasGlobalmente.filter(x => x !== id);
    }
    _placasActualizarBtnMasivo();
};

window._placasToggleSelAll = function(checked) {
    window.placasSeleccionadasGlobalmente = window.placasSeleccionadasGlobalmente || [];
    document.querySelectorAll('.chk-bulk-placas').forEach(chk => {
        chk.checked = checked;
        window._placasToggleSel(chk.value, checked);
    });
};

function _placasActualizarBtnMasivo() {
    var arr = window.placasSeleccionadasGlobalmente || [];
    var btn = document.getElementById('placas-btn-eliminar-masivo');
    if (btn) {
        if (arr.length > 0 && window.checkPerm('placas','d')) {
            btn.style.display = 'inline-block';
            btn.innerHTML = '<i class="bi bi-trash me-1"></i>Eliminar ' + arr.length + ' seleccionadas';
        } else {
            btn.style.display = 'none';
        }
    }
}

window.eliminarMasivoPlacas = function() {
    var arr = (window.placasSeleccionadasGlobalmente && window.placasSeleccionadasGlobalmente.length > 0)
        ? window.placasSeleccionadasGlobalmente.slice()
        : Array.from(document.querySelectorAll('.chk-bulk-placas:checked')).map(function(c) { return c.value; }).filter(Boolean);

    if (!arr.length) {
        alert('Selecciona al menos una placa para eliminar.');
        return;
    }
    
    if (!confirm('¿Seguro que deseas eliminar ' + arr.length + ' placa(s) seleccionada(s)? Esta acción no se puede deshacer.')) return;
    
    var btn = document.getElementById('placas-btn-eliminar-masivo');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Eliminando...'; }

    fetch('/api/eliminarMasivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: arr, coleccion: 'Placas' })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.error) {
            alert('Error: ' + res.error);
            return;
        }
        window.placasSeleccionadasGlobalmente = [];
        _placasActualizarBtnMasivo();
        cargarTablaPlacas(true);
    })
    .catch(function(err) {
        console.warn('Error en eliminarMasivo, probando fallback:', err);
        var usr = (typeof usuarioLogueado !== 'undefined' && usuarioLogueado) ? usuarioLogueado : (localStorage.getItem('fleet_user') || 'sistema');
        fetch('/api/script/eliminarDocumento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: arr, coleccion: 'Placas', usuario: usr })
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            window.placasSeleccionadasGlobalmente = [];
            _placasActualizarBtnMasivo();
            cargarTablaPlacas(true);
        })
        .catch(function() {
            alert('Ocurrió un error al intentar eliminar las placas seleccionadas.');
        });
    })
    .finally(function() {
        if (btn) { btn.disabled = false; }
    });
};

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

    const mapDet = {
        'det-cliente': p[1],
        'det-ruc': p[2],
        'det-marca': p[3],
        'det-modelo': p[4],
        'det-tipo': p[5],
        'det-sub_tipo': p[6],
        'det-color': p[7],
        'det-nro_motor': p[8],
        'det-nro_caja': p[9],
        'det-nro_corona': p[10],
        'det-nro_vin': p[11],
        'det-conf': p[12],
        'det-tanque_1': p[24],
        'det-tanque_2': p[25],
        'det-tanque_3': p[26],
        'det-capacidad_tanque': p[27],
        'det-anio': p[13],
        'det-comb': p[14],
        'det-tara': p[28],
        'det-carga_util': p[15],
        'det-peso_neto': p[16],
        'det-peso_bruto': p[17],
        'det-estado': p[18],
        'det-uts': p[19],
        'det-motora': p[20],
        'det-llantas': p[21],
        'det-enuso': p[22]
    };
    var _detTc = function(s) { return s ? String(s).trim().replace(/\b\w+/g, function(w){ return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase(); }) : s; };
    var _detTcIds = ['det-marca','det-tipo','det-sub_tipo','det-color','det-conf'];
    Object.keys(mapDet).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            var raw = (mapDet[id] !== undefined && mapDet[id] !== null && String(mapDet[id]).trim() !== '') ? String(mapDet[id]).trim() : '—';
            el.innerText = (_detTcIds.indexOf(id) >= 0 && raw !== '—') ? _detTc(raw) : raw;
            if (id === 'det-estado') {
                el.className = 'badge-premium ' + (mapDet[id] === 'Activa' ? 'badge-green' : 'badge-red');
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
                    const res = await fetch(`/api/proxy/geocode?lat=${wialonData.lat}&lon=${wialonData.lng}`);
                    const data = await res.json();
                    const calle  = data.address?.road || data.address?.suburb || data.address?.neighbourhood || 'Sin nombre';
                    const ciudad = data.address?.city || data.address?.town || data.address?.county || '';
                    dirTxt = (calle !== 'Sin nombre' || ciudad) ? (ciudad ? `${calle}, ${ciudad}` : calle) : (data.display_name || dirTxt);
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
            return (i.placa || '').toString().toUpperCase().trim() === placaActual.toUpperCase().trim() && (i.estado !== 'Eliminada');
        }).sort(function(a, b) {
            var numA = parseInt((a.id || '').split('-').pop()) || 0;
            var numB = parseInt((b.id || '').split('-').pop()) || 0;
            return numB - numA;
        });

        if (!insps.length) {
            inspPanelEl.innerHTML = '<div class="text-muted text-center py-4"><i class="bi bi-clipboard2-x fs-3 opacity-50"></i><div class="mt-2 small">Sin registros de inspección.</div></div>';
        } else {
            let firstGeneralIdx = insps.findIndex(i => i.tipo_inspeccion !== 'Solo Frenos');
            const hoy2 = new Date(); hoy2.setHours(0,0,0,0);
            inspPanelEl.innerHTML = insps.map(function(i, idx) {
                let bCl = 'secondary', diasLabel = '—';
                if (idx === firstGeneralIdx) {
                    try {
                        let fi; const fv = i.fecha_ingreso || '';
                        if (fv.includes('/')) { const px = fv.split('/'); fi = new Date(px[2],px[1]-1,px[0]); } else { fi = new Date(fv + 'T00:00:00'); }
                        const fp = new Date(fi.getTime()); fp.setDate(fp.getDate() + (parseInt(i.dias_propuestos) || 30));
                        const dias = Math.ceil((fp - hoy2) / 864e5);
                        bCl = dias < 0 ? 'danger' : (dias <= 7 ? 'warning' : 'success');
                        diasLabel = dias < 0 ? 'Vencida' : (dias === 0 ? 'Vence hoy' : 'Faltan ' + dias + 'd');
                    } catch(e) {}
                } else {
                    bCl = 'secondary';
                    diasLabel = 'Registrada';
                }
                const lineH = idx < insps.length - 1 ? '<div style="width:2px;flex-grow:1;background:var(--border);margin-top:4px;min-height:20px;"></div>' : '';
                let tipoBadge = '';
                if (i.tipo_inspeccion === 'Solo Frenos') {
                    tipoBadge = '<span class="badge bg-danger text-white ms-2" style="font-size:0.7rem; font-weight: 600; padding: 0.25rem 0.5rem;"><i class="bi bi-stop-circle-fill me-1"></i>Frenos</span>';
                } else {
                    tipoBadge = '<span class="badge bg-primary text-white ms-2" style="font-size:0.7rem; font-weight: 600; padding: 0.25rem 0.5rem;"><i class="bi bi-card-checklist me-1"></i>General</span>';
                }
                return '<div class="d-flex gap-3 mb-3">'
                    + '<div class="d-flex flex-column align-items-center" style="width:2.2rem;">'
                    + '<div class="rounded-circle d-flex align-items-center justify-content-center bg-' + bCl + ' text-white shadow-sm" style="width:2.2rem;height:2.2rem;flex-shrink:0;">'
                    + '<i class="bi bi-clipboard2-check" style="font-size:1.1rem;"></i></div>'
                    + lineH + '</div>'
                    + '<div class="flex-grow-1 bg-light rounded-3 p-3 border text-start shadow-sm">'
                    + '<div class="d-flex justify-content-between align-items-center mb-2">'
                    + '<span class="fw-bold text-dark d-flex align-items-center" style="font-size:0.95rem;">#' + (i.id || '—') + tipoBadge + '</span>'
                    + '<span class="badge bg-' + bCl + ' text-white px-2 py-1" style="font-size:0.75rem;">' + diasLabel + '</span>'
                    + '</div>'
                    + '<div style="color:var(--subtext);font-size:0.85rem;" class="mb-1"><i class="bi bi-calendar3 me-2"></i> ' + (i.fecha_ingreso || '—') + '</div>'
                    + '<div style="color:var(--subtext);font-size:0.85rem;"><i class="bi bi-person me-2"></i> ' + (i.tecnico || 'Sin asignar') + '</div>'
                    + '</div></div>';
            }).join('');
        }
    }

    // ── Pestaña MP (Fleetrun) ─────────────────────────────────────────────────
    const fleetPanelEl = document.getElementById('odp-tab-fleet');
    if (fleetPanelEl) {
        const fleetRecs = (window.dataGlobalFleetrun || []).filter(function(r) {
            return (r[4] || '').toString().toUpperCase().trim() === placaActual;
        });
        const utsP = p[19] || '';
        
        window._odpFleetRecs = fleetRecs;
        window._odpFleetMode = 'current';
        window._odpFleetUts = utsP;
        window._odpPlacaActual = placaActual;
        
        if (typeof window._buildFleetTab === 'function') {
            window._buildFleetTab('current');
        }
    }

    // Resetear a primera pestaña al abrir offcanvas
    const tabGenBtn = document.getElementById('tab-general-btn');
    if (tabGenBtn) bootstrap.Tab.getOrCreateInstance(tabGenBtn).show();

    // Guardar placa activa para historial
    window._placaDetalleActual = placaActual;

    bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('offcanvasDetallePlaca')).show();
}

// ── Historial de cambios por placa ──────────────────────────────
window._cargarHistorialPlaca = function() {
    var placa = window._placaDetalleActual;
    var body  = document.getElementById('tab-historial-body');
    if (!body || !placa) return;

    body.innerHTML = '<div class="text-center py-4"><span class="spinner-border spinner-border-sm text-primary me-2"></span>Cargando historial de trabajos...</div>';

    fetch('/api/ot-trabajos')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            var rows = (data || []).filter(function(t) {
                return (t.placa || '').toString().toUpperCase().trim() === placa.toUpperCase().trim();
            });
            rows.sort(function(a, b) { 
                var da = new Date(a.fecha_trabajo || 0).getTime();
                var db = new Date(b.fecha_trabajo || 0).getTime();
                return db - da; 
            });

            if (!rows.length) {
                body.innerHTML = '<div class="text-muted text-center py-5"><i class="bi bi-journal-medical fs-3 opacity-40"></i><div class="mt-2 small">Sin historial clínico aún.</div><div class="text-muted" style="font-size:0.72rem;margin-top:4px">Los trabajos realizados a esta placa aparecerán aquí.</div></div>';
                return;
            }

            body.innerHTML = '<div style="padding:0.5rem 1rem;">' + rows.map(function(t, idx) {
                var iso = t.fecha_trabajo || '';
                var s = String(iso).replace('Z', '').replace('+00:00', '');
                if (s.indexOf('T') === -1) s = s.replace(' ', 'T');
                var d = new Date(s);
                var fechaStr = isNaN(d.getTime()) ? (iso.split('T')[0] || '—') : d.toLocaleDateString('es-PE', {day:'2-digit',month:'short',year:'numeric'});
                
                var trabajo = t.trabajo_realizado || 'Trabajo sin descripción';
                
                var personal = t.tecnico || 'Sin asignar';
                var tipoOt = t.tipo || 'MANTENIMIENTO';
                try {
                    var det = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {});
                    if (det.personal) personal = det.personal;
                    if (det.tipo) tipoOt = det.tipo;
                } catch(e) {}

                var idTrabajo = t.id_ot || t.ticket_visita || 'TR';
                var idOt = t.ot_id || t.id_ot_padre || 'OT';
                if (!String(idOt).startsWith('OT-') && String(idOt) !== 'OT') idOt = 'OT-' + idOt;

                var lineH = idx < rows.length - 1 ? '<div style="width:2px;flex-grow:1;background:#e2e8f0;margin-top:2px;min-height:30px;"></div>' : '';
                
                return '<div class="d-flex gap-3 mb-3">'
                    + '<div class="d-flex flex-column align-items-center" style="width:1.5rem; margin-top:0.8rem;">'
                    + '<div class="rounded-circle d-flex align-items-center justify-content-center bg-white" style="width:1.5rem;height:1.5rem;flex-shrink:0; border: 1.5px solid #10b981;">'
                    + '<i class="bi bi-check2 text-success" style="font-size:0.9rem; -webkit-text-stroke: 0.5px;"></i></div>'
                    + lineH + '</div>'
                    
                    + '<div class="flex-grow-1 bg-white rounded-4 p-3 border" style="box-shadow: 0 2px 8px rgba(0,0,0,0.02); border-color:#e2e8f0 !important;">'
                    
                    + '<div class="d-flex justify-content-between align-items-center mb-2">'
                    + '  <div class="d-flex align-items-center gap-2">'
                    + '    <span class="badge" style="background-color:#eff6ff; color:#3b82f6; font-weight:700; font-size:0.75rem; letter-spacing:0.3px; padding:0.4rem 0.6rem;">#' + idOt + '</span>'
                    + '    <span style="color:#94a3b8; font-size:0.7rem; font-weight:700; letter-spacing:0.5px; text-transform:uppercase;">' + tipoOt + '</span>'
                    + '  </div>'
                    + '  <span class="badge rounded-pill" style="background-color:#dcfce7; color:#166534; font-weight:600; font-size:0.7rem; padding:0.35rem 0.6rem;"><i class="bi bi-check text-success me-1"></i>Finalizado</span>'
                    + '</div>'
                    
                    + '<div class="mb-3 mt-3">'
                    + '  <div class="fw-bold" style="color:#1e293b; font-size:0.9rem; line-height:1.3; margin-bottom:0.2rem;">' + trabajo + '</div>'
                    + '  <div style="color:#64748b; font-size:0.8rem; line-height:1.4;">Realizado por: ' + personal + '</div>'
                    + '</div>'
                    
                    + '<div class="d-flex align-items-center justify-content-between mt-1">'
                    + '  <div style="color:#94a3b8; font-size:0.8rem; font-weight:500;"><i class="bi bi-calendar3 me-1"></i> ' + fechaStr + '</div>'
                    + '  <a href="javascript:void(0)" class="text-primary text-decoration-none fw-bold" style="font-size:0.8rem;">Detalles <i class="bi bi-chevron-right" style="font-size:0.7rem;"></i></a>'
                    + '</div>'
                    
                    + '</div></div>';
            }).join('') + '</div>';
        })
        .catch(function(err) {
            if (body) body.innerHTML = '<div class="text-center py-4 text-danger small"><i class="bi bi-exclamation-circle me-1"></i>Error al cargar historial: ' + err.message + '</div>';
        });
};
window.abrirModalEditarPlaca = function(index) {
    const p = dataGlobalPlacas[index];
    if (!p) return;

    const form = document.getElementById('formEditarPlaca');
    if (form) form.reset();

    poblarSelectsFormularios(dataGlobalPlacas);

    const fieldMap = [
        { id: 'e_placa', idx: 0 },
        { id: 'e_cliente', idx: 1 },
        { id: 'e_ruc', idx: 2 },
        { id: 'e_marca', idx: 3 },
        { id: 'e_modelo', idx: 4 },
        { id: 'e_tipo', idx: 5 },
        { id: 'e_sub_tipo', idx: 6 },
        { id: 'e_color', idx: 7 },
        { id: 'e_nro_motor', idx: 8 },
        { id: 'e_nro_caja', idx: 9 },
        { id: 'e_nro_corona', idx: 10 },
        { id: 'e_nro_vin', idx: 11 },
        { id: 'e_conf', idx: 12 },
        { id: 'e_tanque_1', idx: 24 },
        { id: 'e_tanque_2', idx: 25 },
        { id: 'e_tanque_3', idx: 26 },
        { id: 'e_capacidad_tanque', idx: 27 },
        { id: 'e_anio', idx: 13 },
        { id: 'e_comb', idx: 14 },
        { id: 'e_tara', idx: 28 },
        { id: 'e_carga_util', idx: 15 },
        { id: 'e_peso_neto', idx: 16 },
        { id: 'e_peso_bruto', idx: 17 },
        { id: 'e_estado', idx: 18 },
        { id: 'e_uts', idx: 19 },
        { id: 'e_motora', idx: 20 },
        { id: 'e_llantas', idx: 21 },
        { id: 'e_enuso', idx: 22 },
        { id: 'e_wialon_name', idx: 23 }
    ];

    var _editTc = function(s) { return s ? String(s).trim().replace(/\b\w+/g, function(w){ return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase(); }) : s; };
    var _editTcIds = ['e_marca','e_modelo','e_tipo','e_sub_tipo','e_color','e_conf'];

    fieldMap.forEach(item => {
        const id = item.id;
        const valorLimpio = p[item.idx] ? p[item.idx].toString().trim() : '';
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

window._autoSumTanques = function(prefix) {
    var t1 = parseFloat(document.getElementById(prefix + 'tanque_1')?.value) || 0;
    var t2 = parseFloat(document.getElementById(prefix + 'tanque_2')?.value) || 0;
    var t3 = parseFloat(document.getElementById(prefix + 'tanque_3')?.value) || 0;
    var total = t1 + t2 + t3;
    var totEl = document.getElementById(prefix + 'capacidad_tanque');
    if (totEl && (t1 > 0 || t2 > 0 || t3 > 0)) {
        totEl.value = total > 0 ? (total % 1 === 0 ? total : total.toFixed(2)) : '';
    }
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
        'nro_motor','nro_caja','nro_corona','nro_vin','configuracion',
        'tanque_1','tanque_2','tanque_3','capacidad_tanque',
        'anio','combustible','tara','carga_util','peso_neto','peso_bruto','estado','uts','motora','llantas','en_uso','metrica', 'wialon_name'
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
            case 'tanque_1': payload[c] = get('e_tanque_1'); break;
            case 'tanque_2': payload[c] = get('e_tanque_2'); break;
            case 'tanque_3': payload[c] = get('e_tanque_3'); break;
            case 'capacidad_tanque': payload[c] = get('e_capacidad_tanque'); break;
            case 'anio': payload[c] = get('e_anio'); break;
            case 'combustible': payload[c] = cb('e_comb'); break;
            case 'tara': payload[c] = get('e_tara'); break;
            case 'carga_util': payload[c] = get('e_carga_util'); break;
            case 'peso_neto': payload[c] = get('e_peso_neto'); break;
            case 'peso_bruto': payload[c] = get('e_peso_bruto'); break;
            case 'estado': payload[c] = get('e_estado'); break;
            case 'uts': payload[c] = get('e_uts'); break;
            case 'motora': payload[c] = get('e_motora'); break;
            case 'llantas': payload[c] = get('e_llantas'); break;
            case 'en_uso': payload[c] = get('e_enuso'); break;
            case 'metrica': payload[c] = getMetrica(); break;
            case 'wialon_name': payload[c] = get('e_wialon_name'); break;
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
        ['PLACA', 'CLIENTE', 'RUC/DNI', 'MARCA', 'MODELO', 'TIPO', 'SUB TIPO', 'COLOR', 'NRO MOTOR', 'NRO CAJA', 'NRO CORONA', 'NRO VIN', 'CONFIGURACIÓN', 'Tanque 1', 'Tanque 2', 'Tanque 3', 'Capacitad de Tanque Total', 'AÑO', 'COMBUSTIBLE', 'TARA', 'CARGA ÚTIL', 'PESO NETO', 'PESO BRUTO', 'ESTADO', 'UTS', 'MOTORA', 'LLANTAS', 'EN USO'],
        ['ABC-123', 'EMPRESA EJEMPLO SAC', '20123456789', 'VOLVO', 'FH 460', 'CAMION', 'FURGON', 'BLANCO', 'MOT-999', 'CAJ-888', 'COR-777', 'VIN-555', '6X4', '100', '80', '50', '230', '2024', 'DIESEL', '7.5', '30.5', '8.2', '38.7', 'Activa', 'NACIONAL', 'Motora', '10', 'Si']
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
        var usr = (typeof usuarioLogueado !== 'undefined' && usuarioLogueado) ? usuarioLogueado : (localStorage.getItem('fleet_user') || 'sistema');
        fetch('/api/eliminarMasivo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [plc], coleccion: 'Placas' })
        })
        .then(function(r) { return r.json(); })
        .then(function(r) {
            if (r.error) {
                // Fallback a eliminarDocumento
                fetch('/api/script/eliminarDocumento', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: [plc], coleccion: 'Placas', usuario: usr })
                }).then(function(res) { return res.json(); }).then(function(res) {
                    if (res.data === 'Éxito' || !res.error) cargarTablaPlacas(true);
                    else alert(res.data || res.error);
                });
            } else {
                cargarTablaPlacas(true);
            }
        })
        .catch(function(err) {
            alert('Error al eliminar: ' + err.message);
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
            clientes: Array.from(document.querySelectorAll('#filtroCliente input:checked')).map(function(e){ return e.value; }),
            tipos:    Array.from(document.querySelectorAll('#filtroTipo input:checked')).map(function(e){ return e.value; }),
            marcas:   Array.from(document.querySelectorAll('#filtroMarca input:checked')).map(function(e){ return e.value; }),
            estados:  Array.from(document.querySelectorAll('#filtroEstado input:checked')).map(function(e){ return e.value; })
        };
        var key = 'fleet_filtros_placas_' + location.hostname;
        localStorage.setItem(key, JSON.stringify(state));
        var btn = document.getElementById('btn-limpiar-filtros-placas');
        var activo = state.clientes.length || state.tipos.length || state.marcas.length || state.estados.length;
        if (btn) btn.classList.toggle('d-none', !activo);
    } catch(e) { /* ignore */ }
}

function _restaurarFiltrosPlacas() {
    try {
        localStorage.removeItem('fleet_filtros_placas'); // Limpiar clave legacy global
        var key = 'fleet_filtros_placas_' + location.hostname;
        var saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (!saved) return;
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
        var activo = (saved.clientes && saved.clientes.length) || (saved.tipos && saved.tipos.length) || (saved.marcas && saved.marcas.length) || (saved.estados && saved.estados.length);
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
    localStorage.removeItem('fleet_filtros_placas_' + location.hostname);
    window._kpiFiltroActivo = null;
    var btn = document.getElementById('btn-limpiar-filtros-placas');
    if (btn) btn.classList.add('d-none');
    filtrarPlacasAvanzado();
};

// ================================================================
// 🚀 FUNCIÓN DE ARRANQUE — llamada por el Router al (re)cargar
// ================================================================
window.init_placas = function() {
    if (!window.checkPerm('placas', 'l')) {
        var wrap = document.getElementById('placas-app') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    window._placasActiveTab = 'lista';
    // Registrar callbacks de autocompletado RUC y filtrado Marca->Modelo
    if (typeof window._cbOnSelect === 'function') {
        window._cbOnSelect('p_cliente', function(val) { window.autocompletarRucSelect(val, 'p_ruc'); });
        window._cbOnSelect('e_cliente', function(val) { window.autocompletarRucSelect(val, 'e_ruc'); });
        window._cbOnSelect('p_marca', function(val) {
            if (typeof window._actualizarModelosPorMarca === 'function') window._actualizarModelosPorMarca('p_marca', 'p_modelo');
        });
        window._cbOnSelect('e_marca', function(val) {
            if (typeof window._actualizarModelosPorMarca === 'function') window._actualizarModelosPorMarca('e_marca', 'e_modelo');
        });
    }

    // Restaurar preferencia de columnas guardada
    const savedCols = parseInt(localStorage.getItem('fleet_pref_placas_cols') || '4');
    colActualesPlacas = savedCols;
    const selCols = document.querySelector('select[onchange="cambiarColumnasPlacas(this.value)"]');
    if (selCols) selCols.value = String(colActualesPlacas);

    // Restaurar preferencia de filas/página guardada
    const selFilas = document.getElementById('sel-filas-placas');
    if (selFilas) selFilas.value = String(window.filasPlacasConfig);
    ITEMS_POR_PAGINA = 50;

    // Precargar inspecciones si aún no están disponibles (para KPIs de cliente)
    var _arrancarPlacas = function() { cargarTablaPlacas(true); };
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

// =========================================================================
// FILTROS AVANZADOS (ESTILO APPSHEET)
// =========================================================================

window.placasFiltros = {}; // { colIndex: Set(val1, val2...) }
window._columnaActivaFiltro = -1;

var PLACAS_COLUMNAS = [
    "Placa", "Cliente", "RUC/DNI", "Marca", "Modelo", "Tipo", "Sub Tipo", "Color",
    "Nro Motor", "Nro Caja", "Nro Corona", "Nro VIN", "Configuración", "Año",
    "Combustible", "Carga Útil", "Peso Neto", "Peso Bruto", "Estado", "UTS",
    "Motora", "Llantas", "En Uso"
];

// Ocultar las columnas que no tengan sentido filtrar o que sean IDs
var COLUMNAS_IGNORADAS = [2]; // Ignoramos RUC/DNI para filtros

window.abrirFiltrosPlacas = function() {
    // Generar la lista principal
    const contenedor = document.getElementById('lista-columnas-filtro');
    let html = '';
    
    for (let i = 0; i < PLACAS_COLUMNAS.length; i++) {
        if (COLUMNAS_IGNORADAS.includes(i)) continue;
        
        let seleccionados = window.placasFiltros[i] ? window.placasFiltros[i].size : 0;
        let badge = seleccionados > 0 ? `<span class="badge bg-primary rounded-pill">${seleccionados}</span>` : '';
        
        html += `
            <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3" 
                    style="background: transparent; color: var(--text); border-color: var(--border); cursor: pointer;"
                    onclick="window.entrarFiltroDetalle(${i}, '${PLACAS_COLUMNAS[i]}')">
                <span class="fw-bold" style="font-size: 0.95rem;">${PLACAS_COLUMNAS[i]}</span>
                <div class="d-flex align-items-center gap-2">
                    ${badge}
                    <i class="bi bi-chevron-right text-muted"></i>
                </div>
            </button>
        `;
    }
    
    contenedor.innerHTML = html;
    
    // Reset view
    document.getElementById('filtros-slider').style.transform = 'translateX(0)';
    document.getElementById('header-filtros-main').classList.remove('d-none');
    document.getElementById('footer-filtros-main').classList.remove('d-none');
    document.getElementById('header-filtros-detalle').classList.add('d-none');
    const bsOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('offcanvasFiltrosPlacas'));
    bsOffcanvas.show();
};

window.entrarFiltroDetalle = function(colIndex, colName) {
    window._columnaActivaFiltro = colIndex;
    document.getElementById('titulo-columna-filtro').innerText = colName;
    document.getElementById('buscador-opciones-filtro').value = '';
    
    // Obtener valores únicos
    let valoresSet = new Set();
    window.dataGlobalPlacas.forEach(row => {
        if ((row[0]||'').toUpperCase() === 'PLACA') return;
        let val = row[colIndex] ? row[colIndex].trim() : '';
        if (val === '') val = '(Vacío)';
        valoresSet.add(val);
    });
    
    let valores = Array.from(valoresSet).sort();
    
    const contenedor = document.getElementById('lista-opciones-filtro');
    let html = '';
    
    let seleccionados = window.placasFiltros[colIndex] || new Set();
    
    valores.forEach(val => {
        let isChecked = seleccionados.has(val) ? 'checked' : '';
        html += `
            <div class="form-check py-2 border-bottom opt-filtro-item" style="border-color: var(--border) !important;">
                <input class="form-check-input" type="checkbox" value="${val}" id="chk-flt-${colIndex}-${val.replace(/[^a-zA-Z0-9]/g,'')}" ${isChecked} onchange="window._toggleFiltroValor(${colIndex}, this.value, this.checked)" style="transform: scale(1.2); cursor: pointer;">
                <label class="form-check-label w-100 ms-2" for="chk-flt-${colIndex}-${val.replace(/[^a-zA-Z0-9]/g,'')}" style="cursor: pointer; color: var(--text); font-size: 0.95rem;">
                    ${val}
                </label>
            </div>
        `;
    });
    
    contenedor.innerHTML = html;
    
    // Slide left
    document.getElementById('header-filtros-main').classList.add('d-none');
    document.getElementById('footer-filtros-main').classList.add('d-none');
    document.getElementById('header-filtros-detalle').classList.remove('d-none');
    document.getElementById('filtros-slider').style.transform = 'translateX(-100%)';
};

window.filtrosPlacasNavAtras = function() {
    window.abrirFiltrosPlacas(); // Re-render main list to update badges
};

window._toggleFiltroValor = function(colIndex, val, isChecked) {
    if (!window.placasFiltros[colIndex]) {
        window.placasFiltros[colIndex] = new Set();
    }
    if (isChecked) {
        window.placasFiltros[colIndex].add(val);
    } else {
        window.placasFiltros[colIndex].delete(val);
    }
    window.actualizarBadgeGlobalFiltros();
};

window.buscarEnFiltroOpciones = function(txt) {
    txt = txt.toLowerCase();
    const items = document.querySelectorAll('.opt-filtro-item');
    items.forEach(item => {
        const lbl = item.querySelector('label').innerText.toLowerCase();
        if (lbl.includes(txt)) {
            item.classList.remove('d-none');
        } else {
            item.classList.add('d-none');
        }
    });
};

window.limpiarFiltroColumnaActual = function() {
    let col = window._columnaActivaFiltro;
    if (window.placasFiltros[col]) {
        window.placasFiltros[col].clear();
    }
    document.querySelectorAll('.opt-filtro-item input[type="checkbox"]').forEach(chk => {
        chk.checked = false;
    });
    window.actualizarBadgeGlobalFiltros();
};

window.limpiarTodosFiltrosPlacas = function() {
    window.placasFiltros = {};
    window.actualizarBadgeGlobalFiltros();
    window.filtrarPlacasAvanzado();
    bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasFiltrosPlacas')).hide();
};

window.actualizarBadgeGlobalFiltros = function() {
    let totalActivos = 0;
    for (let col in window.placasFiltros) {
        if (window.placasFiltros[col].size > 0) totalActivos++;
    }
    const badge = document.getElementById('badge-filtros-placas');
    if (badge) {
        if (totalActivos > 0) {
            badge.innerText = totalActivos;
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }
    }
};

// ================================================================
// EXPORTAR A EXCEL (Sincronizado con todos los campos de la tabla)
// ================================================================
window.exportarPlacasExcel = function() {
    var datos = window.datosFiltradosPlacas && window.datosFiltradosPlacas.length > 0 ? window.datosFiltradosPlacas : window.dataGlobalPlacas;
    if (!datos || datos.length === 0) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No hay datos para exportar.', 'warning');
        return;
    }
    
    var headers = [
        'PLACA',
        'CLIENTE',
        'RUC/DNI',
        'MARCA',
        'MODELO',
        'TIPO',
        'SUB TIPO',
        'COLOR',
        'NRO MOTOR',
        'NRO CAJA',
        'NRO CORONA',
        'NRO VIN',
        'CONFIGURACIÓN',
        'Tanque 1',
        'Tanque 2',
        'Tanque 3',
        'Capacitad de Tanque Total',
        'AÑO',
        'COMBUSTIBLE',
        'TARA',
        'CARGA ÚTIL',
        'PESO NETO',
        'PESO BRUTO',
        'UTS',
        'MOTORA',
        'LLANTAS',
        'EN USO',
        'DISPOSITIVO GPS',
        'ESTADO'
    ];
    
    var exportData = [headers];
    
    var inicio = 0;
    if (datos.length > 0 && String(datos[0][0]).toUpperCase() === 'PLACA') {
        inicio = 1;
    }
    
    // Mapeo sincronizado con las columnas visuales de la tabla principal
    // 0: Placa, 1: Cliente, 2: RUC/DNI, 3: Marca, 4: Modelo, 5: Tipo, 6: SubTipo, 7: Color
    // 8: NroMotor, 9: NroCaja, 10: NroCorona, 11: NroVIN, 12: Configuracion
    // 24: Tanque 1, 25: Tanque 2, 26: Tanque 3, 27: Cap. Tanque Total
    // 13: Anio, 14: Combustible, 28: Tara, 15: CargaUtil, 16: PesoNeto, 17: PesoBruto, 19: UTS, 20: Motora, 21: Llantas, 22: EnUso, 23: WialonName, 18: Estado
    var ordenCampos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 24, 25, 26, 27, 13, 14, 28, 15, 16, 17, 19, 20, 21, 22, 23, 18];
    
    for (var i = inicio; i < datos.length; i++) {
        var row = datos[i];
        if (!row || !row[0]) continue;
        var rowData = ordenCampos.map(function(idx) {
            var val = row[idx];
            return (val !== undefined && val !== null) ? String(val).trim() : '';
        });
        exportData.push(rowData);
    }
    
    if (typeof XLSX === 'undefined') {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Librería de exportación no encontrada.', 'error');
        return;
    }
    
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(exportData);
    
    // Anchos de columna automáticos
    ws['!cols'] = headers.map(function(h, idx) {
        var maxLen = h.length;
        for (var r = 1; r < exportData.length; r++) {
            var cellVal = exportData[r][idx] ? String(exportData[r][idx]) : '';
            if (cellVal.length > maxLen) maxLen = cellVal.length;
        }
        return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Flota Total');
    XLSX.writeFile(wb, 'Reporte_Flota_Total.xlsx');
};
