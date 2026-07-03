var vehiculosFlota = [];
var placasCatalogo = [];
var currentPlaca = null;
var currentFiltroKPI = 'total';

function init_docflota() {
    cargarDatosPlacasCatalogo();
    cargarDatosVehiculos();
}

function cargarDatosPlacasCatalogo() {
    fetch('/api/script/obtenerDatosPlacas', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ args: [] }) })
    .then(r => r.json())
    .then(r => {
        placasCatalogo = Array.isArray(r.data) ? r.data : [];
    }).catch(e => console.error("Error cargando catálogo de placas:", e));
}

function calcularEstado(fechaVencimiento) {
    if (!fechaVencimiento) return { text: 'Indefinido', class: 's-gray', color: '#94a3b8', bgClass: 'bg-gray', bdgClass: 'bdg-gray', score: -1, diff: null };
    
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const ven = new Date(fechaVencimiento);
    ven.setHours(0,0,0,0);
    
    if(isNaN(ven.getTime())) return { text: 'Indefinido', class: 's-gray', color: '#94a3b8', bgClass: 'bg-gray', bdgClass: 'bdg-gray', score: -1, diff: null };

    const diffTime = ven.getTime() - hoy.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: 'Vencido', class: 's-red', color: '#ef4444', bgClass: 'bg-red', bdgClass: 'bdg-red', score: 0, diff: diffDays };
    if (diffDays <= 15) return { text: 'Crítico', class: 's-orange', color: '#ea580c', bgClass: 'bg-orange', bdgClass: 'bdg-red', score: 1, diff: diffDays };
    if (diffDays <= 30) return { text: 'Alerta', class: 's-yellow', color: '#f59e0b', bgClass: 'bg-yellow', bdgClass: 'bdg-red', score: 2, diff: diffDays };
    return { text: 'Vigente', class: 's-green', color: '#10b981', bgClass: 'bg-green', bdgClass: 'bdg-green', score: 3, diff: diffDays };
}

function formatearFechaVista(fechaIso) {
    if(!fechaIso) return '-';
    let d = new Date(fechaIso);
    if(isNaN(d.getTime())) return '-';
    if(d.getFullYear() === 2000 && d.getMonth() === 0) return '-';
    let day = d.getUTCDate().toString().padStart(2, '0');
    let month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}/${d.getUTCFullYear()}`;
}

function calcularMetadatos(v) {
    let docs = [
        calcularEstado(v.tc_vencimiento),
        calcularEstado(v.soat_vencimiento),
        calcularEstado(v.matpel_vencimiento),
        calcularEstado(v.rt_vencimiento),
        calcularEstado(v.boni_vencimiento),
        calcularEstado(v.sv_vencimiento),
        calcularEstado(v.sc_vencimiento),
        calcularEstado(v.fum_vencimiento),
        calcularEstado(v.ext_vencimiento)
    ];

    let docsRegistrados = 0;
    let docsVerdes = 0;
    let peorScore = 99;
    let peorEstado = { text: 'Ok', class: 's-green', color: '#10b981', bgClass: 'bg-green' };

    docs.forEach(est => {
        if (est.score !== -1) {
            docsRegistrados++;
            if (est.score === 3) docsVerdes++;
            if (est.score < peorScore) {
                peorScore = est.score;
                peorEstado = est;
            }
        }
    });

    let salud = docsRegistrados === 0 ? 0 : Math.round((docsVerdes / docsRegistrados) * 100);
    if(docsRegistrados === 0) peorEstado = { text: 'Sin Info', class: 's-gray', color: '#94a3b8', bgClass: 'bg-gray' };

    return { salud, peorEstado, docs };
}

function cargarDatosVehiculos() {
    document.getElementById('vehicle-list').innerHTML = '<div class="text-center" style="margin-top:2rem; color:#94a3b8;">Cargando flota...</div>';
    
    fetch('/api/script/obtenerVehiculosFlota', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ args: [] }) })
    .then(r => r.json())
    .then(r => {
        vehiculosFlota = Array.isArray(r.data) ? r.data : [];
        vehiculosFlota.forEach(v => {
            v._meta = calcularMetadatos(v);
        });
        actualizarKPIs();
        renderizarListaLateral();
        renderizarMatriz();
        
        if(currentPlaca) {
            const existe = vehiculosFlota.find(x => x.placa === currentPlaca);
            if(existe) seleccionarVehiculo(currentPlaca);
            else seleccionarVehiculo(null);
        } else if(vehiculosFlota.length > 0) {
            seleccionarVehiculo(vehiculosFlota[0].placa);
        } else {
            seleccionarVehiculo(null);
        }
    }).catch(e => {
        console.error(e);
        document.getElementById('vehicle-list').innerHTML = '<div class="text-center text-danger" style="margin-top:2rem;">Error al cargar</div>';
    });
}

function actualizarKPIs() {
    let t = vehiculosFlota.length;
    let vig = 0, ale = 0, ven = 0;
    
    vehiculosFlota.forEach(v => {
        if(v._meta.peorEstado.score === 3) vig++;
        else if(v._meta.peorEstado.score === 2 || v._meta.peorEstado.score === 1) ale++;
        else if(v._meta.peorEstado.score === 0) ven++;
    });

    document.getElementById('kpi-total').innerText = t;
    document.getElementById('kpi-vigente').innerText = vig;
    document.getElementById('kpi-alerta').innerText = ale;
    document.getElementById('kpi-vencido').innerText = ven;
}

function filtrarKPI(tipo, element) {
    document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
    currentFiltroKPI = tipo;
    renderizarListaLateral();
    renderizarMatriz();
}

function filtrarListaLocal() {
    renderizarListaLateral();
}

function renderizarListaLateral() {
    const listDiv = document.getElementById('vehicle-list');
    const term = (document.getElementById('fleet-search').value || '').toLowerCase();
    
    let html = '';
    
    let filtrados = vehiculosFlota.filter(v => {
        let matchTerm = v.placa.toLowerCase().includes(term) || (v.tipo || '').toLowerCase().includes(term);
        let matchKpi = true;
        if(currentFiltroKPI === 'vigente') matchKpi = (v._meta.peorEstado.score === 3);
        else if(currentFiltroKPI === 'alerta') matchKpi = (v._meta.peorEstado.score === 1 || v._meta.peorEstado.score === 2);
        else if(currentFiltroKPI === 'vencido') matchKpi = (v._meta.peorEstado.score === 0);
        
        return matchTerm && matchKpi;
    });

    if(filtrados.length === 0) {
        listDiv.innerHTML = '<div class="text-center" style="margin-top:2rem; font-size:0.9rem; color:#94a3b8;">No se encontraron vehículos.</div>';
        return;
    }

    filtrados.forEach(v => {
        let selCls = (currentPlaca === v.placa) ? 'selected' : '';
        html += `
        <div class="vehicle-item ${selCls}" onclick="seleccionarVehiculo('${v.placa}')" id="vi-${v.placa}">
            <div class="v-icon-circle"><i class="bi bi-arrow-left-right"></i></div>
            <div class="v-info">
                <span class="v-plate">${v.placa}</span>
                <span class="v-type">${v.tipo || '---'}</span>
            </div>
            <div class="status-dot ${v._meta.peorEstado.bgClass}"></div>
        </div>`;
    });
    
    listDiv.innerHTML = html;
}

function seleccionarVehiculo(placa) {
    document.querySelectorAll('.vehicle-item').forEach(el => el.classList.remove('selected'));
    if(placa) {
        const el = document.getElementById(`vi-${placa}`);
        if(el) el.classList.add('selected');
    }
    
    currentPlaca = placa;
    
    if(!placa) {
        document.getElementById('right-content-wrapper').style.display = 'none';
        document.getElementById('empty-state-panel').style.display = 'flex';
        return;
    }
    
    document.getElementById('right-content-wrapper').style.display = 'flex';
    document.getElementById('empty-state-panel').style.display = 'none';
    
    const v = vehiculosFlota.find(x => x.placa === placa);
    if(!v) return;

    // Ficha Header
    document.getElementById('ft-placa').innerText = v.placa;
    document.getElementById('ft-tipo').innerText = v.tipo || '---';
    document.getElementById('ft-marca-modelo').innerText = `${v.marca || '---'} - ${v.modelo || '---'}`;
    document.getElementById('ft-anio').innerText = v.anio || '---';
    document.getElementById('ft-chasis').innerText = v.chasis || '---';
    
    document.getElementById('ft-health-bar').style.width = `${v._meta.salud}%`;
    document.getElementById('ft-health-txt').innerText = `${v._meta.salud}%`;

    // Renderizar tarjetas de documentos exactas a la imagen
    const m = v._meta.docs;
    
    const renderCard = (id, title, num, bgClass, contentRows, est) => {
        let rowsHtml = '';
        contentRows.forEach(row => {
            rowsHtml += `
            <div class="doc-row">
                <span class="doc-label">${row.label}</span>
                <span class="doc-value">${row.val}</span>
            </div>`;
        });
        
        let estHtml = `<span class="footer-label">ESTADO</span>`;
        if(est.diff !== null) {
            estHtml += `<span class="footer-status ${est.class}">${est.diff}d (${est.text})</span>`;
        } else {
            estHtml += `<span class="footer-status" style="color:#94a3b8;">-</span>`;
        }

        let html = `
        <div class="doc-card-header">
            <div class="num-circle ${bgClass}">${num}</div>
            ${title}
        </div>
        <div class="doc-card-body">
            ${rowsHtml}
        </div>
        <div class="doc-card-footer">
            ${estHtml}
        </div>`;
        document.getElementById(id).innerHTML = html;
    };

    renderCard('card-tc', 'TARJ. CIRC...', 1, 'bg-c1', [
        {label: 'Emisión', val: '---'},
        {label: 'Vencimiento', val: formatearFechaVista(v.tc_vencimiento)}
    ], m[0]);
    
    renderCard('card-soat', 'SOAT', 2, 'bg-c2', [
        {label: 'N°', val: v.soat_constancia||'---'},
        {label: 'Entidad', val: v.soat_entidad||'---'},
        {label: 'Pago', val: v.soat_pago||'---'}
    ], m[1]);
        
    renderCard('card-matpel', 'MATPEL', 3, 'bg-c3', [
        {label: 'N°', val: v.matpel_constancia||'---'},
        {label: 'Emisión', val: formatearFechaVista(v.matpel_emision)}
    ], m[2]);
        
    renderCard('card-rt', 'REV. TÉCN...', 4, 'bg-c4', [
        {label: 'Emisión', val: formatearFechaVista(v.rt_emision)}
    ], m[3]);
        
    renderCard('card-boni', 'BONIFICA...', 5, 'bg-c5', [
        {label: 'Vencimiento', val: formatearFechaVista(v.boni_vencimiento)}
    ], m[4]);
        
    renderCard('card-sv', 'SEG. VEHI...', 6, 'bg-c6', [
        {label: 'Entidad', val: v.sv_entidad||'---'},
        {label: 'Asesor', val: v.sv_asesor||'---'}
    ], m[5]);
        
    renderCard('card-sc', 'SEG. CAR...', 7, 'bg-c7', [
        {label: 'Entidad', val: v.sc_entidad||'---'},
        {label: 'Emisión', val: formatearFechaVista(v.sc_emision)}
    ], m[6]);
        
    renderCard('card-fum', 'FUMIGACI...', 8, 'bg-c8', [
        {label: 'Emisión', val: formatearFechaVista(v.fum_emision)}
    ], m[7]);
        
    renderCard('card-ext', 'EXTINTOR...', 9, 'bg-c9', [
        {label: 'Cantidad', val: v.ext_cantidad||1}
    ], m[8]);
}

function renderizarMatriz() {
    const tbody = document.getElementById('matriz-body');
    let html = '';
    let filtrados = vehiculosFlota;

    const term = (document.getElementById('fleet-search').value || '').toLowerCase();
    filtrados = vehiculosFlota.filter(v => {
        let matchTerm = v.placa.toLowerCase().includes(term) || (v.tipo || '').toLowerCase().includes(term);
        let matchKpi = true;
        if(currentFiltroKPI === 'vigente') matchKpi = (v._meta.peorEstado.score === 3);
        else if(currentFiltroKPI === 'alerta') matchKpi = (v._meta.peorEstado.score === 1 || v._meta.peorEstado.score === 2);
        else if(currentFiltroKPI === 'vencido') matchKpi = (v._meta.peorEstado.score === 0);
        return matchTerm && matchKpi;
    });

    if(filtrados.length === 0){
        tbody.innerHTML = '<tr><td colspan="41" class="text-center" style="color:#94a3b8; padding:2rem;">No hay datos para mostrar en la matriz.</td></tr>';
        return;
    }

    filtrados.forEach((v, i) => {
        const m = v._meta.docs;
        const eD = (obj) => {
            if(!obj || obj.diff === null) return `<span class="badge-dias bdg-gray">-</span>`;
            return `<span class="badge-dias ${obj.bdgClass}">${obj.diff}</span>`;
        };
        const fB = (f) => {
            let fv = formatearFechaVista(f);
            if (fv !== '-') return `<span class="date-purple">${fv}</span>`;
            return fv;
        };

        html += `
        <tr>
            <td class="sticky-col" style="border-right: none; color:#94a3b8;">${i+1}</td>
            <td class="sticky-col-2">${v.placa}</td>
            <td>${v.propiedad||''}</td>
            <td>${v.empresa||''}</td>
            <td>${formatearFechaVista(v.fecha_entrega)}</td>
            <td>${v.tipo||''}</td>
            <td>${v.anio||''}</td>
            <td>${v.modelo||''}</td>
            <td>${v.color||''}</td>
            <td>${v.marca||''}</td>
            <td>${v.chasis||''}</td>
            
            <td>${fB(v.tc_vencimiento)}</td>
            <td>${eD(m[0])}</td>
            
            <td>${v.soat_constancia||''}</td>
            <td>${v.soat_entidad||''}</td>
            <td class="text-right">${v.soat_pago||''}</td>
            <td>${fB(v.soat_vencimiento)}</td>
            <td>${eD(m[1])}</td>

            <td>${v.matpel_constancia||''}</td>
            <td>${formatearFechaVista(v.matpel_emision)}</td>
            <td>${fB(v.matpel_vencimiento)}</td>
            <td>${eD(m[2])}</td>

            <td>${formatearFechaVista(v.rt_emision)}</td>
            <td>${fB(v.rt_vencimiento)}</td>
            <td>${eD(m[3])}</td>

            <td>${fB(v.boni_vencimiento)}</td>
            <td>${eD(m[4])}</td>

            <td>${v.sv_entidad||''}</td>
            <td>${v.sv_asesor||''}</td>
            <td>${fB(v.sv_vencimiento)}</td>
            <td>${eD(m[5])}</td>

            <td>${v.sc_entidad||''}</td>
            <td>${v.sc_asesor||''}</td>
            <td>${formatearFechaVista(v.sc_emision)}</td>
            <td>${fB(v.sc_vencimiento)}</td>
            <td>${eD(m[6])}</td>

            <td>${formatearFechaVista(v.fum_emision)}</td>
            <td>${fB(v.fum_vencimiento)}</td>
            <td>${eD(m[7])}</td>

            <td>${fB(v.ext_vencimiento)}</td>
            <td>${v.ext_cantidad||1}</td>
            <td>${eD(m[8])}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

// Modal Logic
function switchTab(index, element) {
    document.querySelectorAll('.fm-tab').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${index}`).classList.add('active');
}

function abrirModalEdicion(placa) {
    document.getElementById('formVehiculoFlota').reset();
    
    const selectPlaca = document.getElementById('f_placa');
    let opts = '<option value="">Seleccione una placa...</option>';
    placasCatalogo.forEach(p => {
        opts += `<option value="${p.placa}">${p.placa} ${p.tipo ? '('+p.tipo+')' : ''}</option>`;
    });
    // Si la placa actual no está en el catálogo, la agregamos al select
    if (placa && !placasCatalogo.find(p => p.placa === placa)) {
        opts += `<option value="${placa}">${placa}</option>`;
    }
    selectPlaca.innerHTML = opts;
    selectPlaca.disabled = !!placa; // Solo lectura si estamos editando uno existente
    
    // Switch to first tab
    switchTab(0, document.querySelector('.fm-tab'));

    if(placa) {
        const v = vehiculosFlota.find(x => x.placa === placa);
        if(v) {
            document.getElementById('f_placa').value = v.placa || '';
            document.getElementById('f_tipo').value = v.tipo || '';
            document.getElementById('f_propiedad').value = v.propiedad || '';
            document.getElementById('f_empresa').value = v.empresa || '';
            document.getElementById('f_marca').value = v.marca || '';
            document.getElementById('f_modelo').value = v.modelo || '';
            document.getElementById('f_anio').value = v.anio || '';
            document.getElementById('f_color').value = v.color || '';
            document.getElementById('f_chasis').value = v.chasis || '';
            document.getElementById('f_fecha_entrega').value = (v.fecha_entrega||'').split('T')[0];
            
            document.getElementById('f_tc_vencimiento').value = (v.tc_vencimiento||'').split('T')[0];
            
            document.getElementById('f_soat_constancia').value = v.soat_constancia || '';
            document.getElementById('f_soat_entidad').value = v.soat_entidad || '';
            document.getElementById('f_soat_pago').value = v.soat_pago || '';
            document.getElementById('f_soat_vencimiento').value = (v.soat_vencimiento||'').split('T')[0];
            
            document.getElementById('f_matpel_constancia').value = v.matpel_constancia || '';
            document.getElementById('f_matpel_emision').value = (v.matpel_emision||'').split('T')[0];
            document.getElementById('f_matpel_vencimiento').value = (v.matpel_vencimiento||'').split('T')[0];
            
            document.getElementById('f_rt_emision').value = (v.rt_emision||'').split('T')[0];
            document.getElementById('f_rt_vencimiento').value = (v.rt_vencimiento||'').split('T')[0];
            
            document.getElementById('f_boni_vencimiento').value = (v.boni_vencimiento||'').split('T')[0];
            
            document.getElementById('f_sv_entidad').value = v.sv_entidad || '';
            document.getElementById('f_sv_asesor').value = v.sv_asesor || '';
            document.getElementById('f_sv_vencimiento').value = (v.sv_vencimiento||'').split('T')[0];
            
            document.getElementById('f_sc_entidad').value = v.sc_entidad || '';
            document.getElementById('f_sc_asesor').value = v.sc_asesor || ''; // fixed typo
            document.getElementById('f_sc_emision').value = (v.sc_emision||'').split('T')[0];
            document.getElementById('f_sc_vencimiento').value = (v.sc_vencimiento||'').split('T')[0];
            
            document.getElementById('f_fum_emision').value = (v.fum_emision||'').split('T')[0];
            document.getElementById('f_fum_vencimiento').value = (v.fum_vencimiento||'').split('T')[0];
            
            document.getElementById('f_ext_cantidad').value = v.ext_cantidad || 1;
            document.getElementById('f_ext_vencimiento').value = (v.ext_vencimiento||'').split('T')[0];
        }
    }
    
    document.getElementById('modalEdicionVehiculo').style.display = 'flex';
}

function autocompletarDatosPlaca(placaSeleccionada) {
    if(!placaSeleccionada) {
        document.getElementById('formVehiculoFlota').reset();
        return;
    }
    
    // 1. Ver si ya está en vehiculosFlota (editar)
    const v = vehiculosFlota.find(x => x.placa === placaSeleccionada);
    if(v) {
        abrirModalEdicion(placaSeleccionada);
        return;
    }

    // 2. Si no, llenar con datos del catálogo
    const p = placasCatalogo.find(x => x.placa === placaSeleccionada);
    if(p) {
        document.getElementById('f_tipo').value = p.tipo || '';
        document.getElementById('f_propiedad').value = p.propiedad || 'PROPIA';
        document.getElementById('f_empresa').value = p.empresa || 'MARSISA';
        document.getElementById('f_marca').value = p.marca || '';
        document.getElementById('f_modelo').value = p.modelo || '';
        document.getElementById('f_anio').value = p.anio || '';
        document.getElementById('f_color').value = p.color || '';
        document.getElementById('f_chasis').value = p.chasis_vin || p.chasis || '';
        document.getElementById('f_fecha_entrega').value = (p.fecha_ingreso || p.fecha_entrega || '').split('T')[0];
    }
}

function cerrarModalEdicion() {
    document.getElementById('modalEdicionVehiculo').style.display = 'none';
}

function guardarVehiculo() {
    const placa = document.getElementById('f_placa').value.trim();
    if(!placa) return alert('La placa es obligatoria');

    const data = {
        placa: placa,
        tipo: document.getElementById('f_tipo').value,
        propiedad: document.getElementById('f_propiedad').value,
        empresa: document.getElementById('f_empresa').value,
        marca: document.getElementById('f_marca').value,
        modelo: document.getElementById('f_modelo').value,
        anio: document.getElementById('f_anio').value,
        color: document.getElementById('f_color').value,
        chasis: document.getElementById('f_chasis').value,
        fecha_entrega: document.getElementById('f_fecha_entrega').value,
        tc_vencimiento: document.getElementById('f_tc_vencimiento').value,
        soat_constancia: document.getElementById('f_soat_constancia').value,
        soat_entidad: document.getElementById('f_soat_entidad').value,
        soat_pago: document.getElementById('f_soat_pago').value,
        soat_vencimiento: document.getElementById('f_soat_vencimiento').value,
        matpel_constancia: document.getElementById('f_matpel_constancia').value,
        matpel_emision: document.getElementById('f_matpel_emision').value,
        matpel_vencimiento: document.getElementById('f_matpel_vencimiento').value,
        rt_emision: document.getElementById('f_rt_emision').value,
        rt_vencimiento: document.getElementById('f_rt_vencimiento').value,
        boni_vencimiento: document.getElementById('f_boni_vencimiento').value,
        sv_entidad: document.getElementById('f_sv_entidad').value,
        sv_asesor: document.getElementById('f_sv_asesor').value,
        sv_vencimiento: document.getElementById('f_sv_vencimiento').value,
        sc_entidad: document.getElementById('f_sc_entidad').value,
        sc_asesor: document.getElementById('f_sc_asesor').value,
        sc_emision: document.getElementById('f_sc_emision').value,
        sc_vencimiento: document.getElementById('f_sc_vencimiento').value,
        fum_emision: document.getElementById('f_fum_emision').value,
        fum_vencimiento: document.getElementById('f_fum_vencimiento').value,
        ext_cantidad: document.getElementById('f_ext_cantidad').value,
        ext_vencimiento: document.getElementById('f_ext_vencimiento').value,
    };

    fetch('/api/script/guardarVehiculoFlota', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ args: [data] }) })
    .then(r => r.json())
    .then(r => {
        if(r.data === 'Éxito') {
            cerrarModalEdicion();
            cargarDatosVehiculos();
        } else {
            alert(r.data);
        }
    }).catch(e => console.error(e));
}

function eliminarVehiculoActual() {
    if(!currentPlaca) return;
    if(confirm(`¿Estás seguro de eliminar el expediente del vehículo ${currentPlaca}? Esta acción es irreversible.`)) {
        fetch('/api/script/eliminarDocumento', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ coleccion: 'VehiculosFlota', id: currentPlaca }) })
        .then(r => r.json())
        .then(r => {
            currentPlaca = null;
            cargarDatosVehiculos();
        });
    }
}

function exportarExcel() {
    if (typeof XLSX === 'undefined') return alert("XLSX no cargado");
    let wb = XLSX.utils.table_to_book(document.getElementById('tabla-matriz'), {sheet: "Control Flota"});
    XLSX.writeFile(wb, `Control_Flota_${Date.now()}.xlsx`);
}
