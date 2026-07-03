let dataDocFlota = [];

function init_docflota() {
    cargarTablaDocFlota();
}

function cargarTablaDocFlota(forzarServer = false) {
    if(!forzarServer && dataDocFlota.length > 0) {
        mostrarTablaDocFlota(dataDocFlota);
        return;
    }
    
    document.getElementById('cache-badge-docflota').innerHTML = '<i class="bi bi-arrow-repeat spin"></i> <span id="cache-label-docflota">Cargando...</span>';
    
    fetch('/api/script/obtenerDatosDocumentosFlota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
    .then(r => r.json())
    .then(r => {
        dataDocFlota = r.data || [];
        mostrarTablaDocFlota(dataDocFlota);
        document.getElementById('cache-badge-docflota').innerHTML = '<i class="bi bi-database-check"></i> <span id="cache-label-docflota">Actualizado</span>';
        document.getElementById('cache-badge-docflota').classList.add('updated');
        setTimeout(() => document.getElementById('cache-badge-docflota').classList.remove('updated'), 2000);
    })
    .catch(e => {
        console.error("Error al cargar documentos flota:", e);
        document.getElementById('cache-badge-docflota').innerHTML = '<i class="bi bi-exclamation-triangle"></i> <span id="cache-label-docflota">Error</span>';
    });
}

function calcularEstadoDocumento(fechaVencimiento) {
    if(!fechaVencimiento) return { texto: 'Indefinido', color: 'secondary', dias: '-' };
    
    // Si la fecha está en formato DD/MM/YYYY, convertir a YYYY-MM-DD para el parseo
    let dStr = fechaVencimiento;
    if(dStr.includes('/')) {
        let p = dStr.split('/');
        dStr = `${p[2]}-${p[1]}-${p[0]}`;
    } else if (dStr.includes('T')) {
        dStr = dStr.split('T')[0];
    }
    
    const dVenc = new Date(dStr + "T00:00:00");
    if(isNaN(dVenc.getTime())) return { texto: 'Error Fecha', color: 'secondary', dias: '-' };
    
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    
    const diffTime = dVenc - hoy;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return { texto: 'VENCIDO', color: 'danger', bg: '#fee2e2', colorText: '#ef4444', dias: diffDays };
    if (diffDays <= 30) return { texto: 'PRÓXIMO', color: 'warning', bg: '#fef3c7', colorText: '#f59e0b', dias: diffDays };
    return { texto: 'VIGENTE', color: 'success', bg: '#d1fae5', colorText: '#10b981', dias: diffDays };
}

function formatearFechaDoc(fechaStr) {
    if(!fechaStr) return '-';
    let dStr = fechaStr;
    if(dStr.includes('/')) return dStr; // ya está formateada
    if(dStr.includes('T')) dStr = dStr.split('T')[0];
    
    const p = dStr.split('-');
    if(p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
    return dStr;
}

function mostrarTablaDocFlota(datos) {
    const tbody = document.getElementById('tbDocFlota');
    tbody.innerHTML = '';
    
    let kpiTot = 0, kpiVig = 0, kpiProx = 0, kpiVen = 0;
    
    if(datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No hay documentos registrados.</td></tr>';
        actualizarKPIDocs(0,0,0,0);
        return;
    }
    
    datos.forEach(d => {
        kpiTot++;
        const estado = calcularEstadoDocumento(d.fecha_vencimiento);
        if(estado.texto === 'VIGENTE') kpiVig++;
        else if(estado.texto === 'PRÓXIMO') kpiProx++;
        else if(estado.texto === 'VENCIDO') kpiVen++;
        
        let colorPlaca = '#2563eb';
        
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = (e) => {
            // Evitar si hace clic en botón eliminar o en sí mismo
            if(e.target.closest('.btn-delete-doc')) return;
            abrirExpedientePlaca(d.placa);
        };
        
        tr.innerHTML = `
            <td><span class="fw-bold" style="color: ${colorPlaca}; background-color: #eff6ff; padding: 4px 8px; border-radius: 6px;">${d.placa}</span></td>
            <td><span class="fw-bold text-dark">${d.tipo_documento}</span></td>
            <td><span class="text-muted">${d.nro_constancia || '-'}</span> <br> <small style="font-size:0.7rem; color:var(--subtext);">${d.entidad || ''}</small></td>
            <td><span class="fw-bold" style="color:var(--text);">${formatearFechaDoc(d.fecha_vencimiento)}</span></td>
            <td><span class="badge" style="background-color: ${estado.bg}; color: ${estado.colorText}; font-size: 0.8rem; padding: 6px 10px; border-radius: 8px;">${estado.dias} días</span></td>
            <td class="text-center"><span class="badge" style="background-color: ${estado.bg}; color: ${estado.colorText}; font-weight: 600;">${estado.texto}</span></td>
            <td class="text-center">
                <button class="btn btn-sm btn-light text-danger rounded-circle shadow-sm btn-delete-doc" style="width:32px; height:32px;" onclick="eliminarDocumentoFlota('${d.id}', event)" title="Eliminar Documento">
                    <i class="bi bi-trash3"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    actualizarKPIDocs(kpiTot, kpiVig, kpiProx, kpiVen);
}

function actualizarKPIDocs(t, vi, pr, ve) {
    document.getElementById('kpi-doc-total').textContent = t;
    document.getElementById('kpi-doc-vigente').textContent = vi;
    document.getElementById('kpi-doc-proximo').textContent = pr;
    document.getElementById('kpi-doc-vencido').textContent = ve;
}

function filtrarTablaDocFlota() {
    const q = document.getElementById('inputBuscarDocFlota').value.toLowerCase();
    const tipo = document.getElementById('filtroTipoDocFlota').value;
    
    let filtrados = dataDocFlota.filter(d => {
        let matchTexto = (d.placa && d.placa.toLowerCase().includes(q)) || 
                         (d.nro_constancia && d.nro_constancia.toLowerCase().includes(q));
        let matchTipo = tipo ? d.tipo_documento === tipo : true;
        return matchTexto && matchTipo;
    });
    
    mostrarTablaDocFlota(filtrados);
}

function filtrarDocumentosPorEstado(estadoText) {
    // estadoText: 'VENCIDO', 'PROXIMO', 'VIGENTE', ''
    document.getElementById('inputBuscarDocFlota').value = '';
    document.getElementById('filtroTipoDocFlota').value = '';
    
    if(!estadoText) {
        mostrarTablaDocFlota(dataDocFlota);
        return;
    }
    
    let filtrados = dataDocFlota.filter(d => {
        let est = calcularEstadoDocumento(d.fecha_vencimiento);
        if(estadoText === 'PROXIMO' && est.texto === 'PRÓXIMO') return true;
        if(estadoText === 'VIGENTE' && est.texto === 'VIGENTE') return true;
        if(estadoText === 'VENCIDO' && est.texto === 'VENCIDO') return true;
        return false;
    });
    
    mostrarTablaDocFlota(filtrados);
}

function abrirModalDocumentoFlota(placa = '') {
    document.getElementById('formDocFlota').reset();
    document.getElementById('docflota_id').value = '';
    if(placa) {
        document.getElementById('docflota_placa').value = placa;
        document.getElementById('docflota_placa').readOnly = true;
    } else {
        document.getElementById('docflota_placa').readOnly = false;
    }
    var myModal = new bootstrap.Modal(document.getElementById('modalDocFlota'));
    myModal.show();
}

function guardarDocumentoFlota(e) {
    e.preventDefault();
    const btn = document.getElementById('btnGuardarDocFlota');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    
    const form = document.getElementById('formDocFlota');
    const data = {};
    const elements = form.elements;
    for(let i=0; i<elements.length; i++) {
        if(elements[i].name) data[elements[i].name] = elements[i].value;
    }
    data.usuario = usuarioLogueado;
    
    fetch('/api/script/guardarDocumentoFlota', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ args: [data] }) })
    .then(r => r.json())
    .then(r => {
        if(r.data === 'Éxito') {
            bootstrap.Modal.getInstance(document.getElementById('modalDocFlota')).hide();
            cargarTablaDocFlota(true);
            
            // Si el drawer está abierto para esa placa, recargarlo
            let placaActualDrawer = document.getElementById('expediente-placa-title').textContent;
            if(placaActualDrawer && placaActualDrawer === data.placa.toUpperCase()) {
                setTimeout(() => abrirExpedientePlaca(data.placa), 500);
            }
        } else {
            alert(r.data);
        }
        btn.disabled = false;
        btn.innerHTML = 'Guardar Documento';
    })
    .catch(err => {
        alert("Error de red");
        btn.disabled = false;
        btn.innerHTML = 'Guardar Documento';
    });
}

function abrirExpedientePlaca(placa) {
    document.getElementById('expediente-placa-title').textContent = placa.toUpperCase();
    
    const docs = dataDocFlota.filter(d => d.placa.toUpperCase() === placa.toUpperCase());
    docs.sort((a,b) => {
        let da = new Date(a.fecha_vencimiento); let db = new Date(b.fecha_vencimiento);
        return da - db;
    });
    
    const container = document.getElementById('listaExpedienteDocs');
    container.innerHTML = '';
    
    if(docs.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4">No hay documentos registrados para esta unidad.</div>';
    } else {
        docs.forEach(d => {
            const estado = calcularEstadoDocumento(d.fecha_vencimiento);
            const emision = formatearFechaDoc(d.fecha_emision);
            const vencimiento = formatearFechaDoc(d.fecha_vencimiento);
            
            let cardHtml = `
            <div class="card border-0 shadow-sm mb-2" style="border-radius: 12px; border-left: 4px solid ${estado.colorText} !important;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="fw-bold mb-0 text-dark">${d.tipo_documento}</h6>
                            <small class="text-muted">${d.nro_constancia || 'Sin constancia'}</small>
                        </div>
                        <span class="badge" style="background-color: ${estado.bg}; color: ${estado.colorText}; font-size: 0.7rem;">${estado.texto}</span>
                    </div>
                    <div class="d-flex justify-content-between mt-2 pt-2 border-top">
                        <div><small class="text-muted d-block" style="font-size:0.7rem;">Emisión</small><span class="fw-bold" style="font-size:0.85rem;">${emision}</span></div>
                        <div class="text-end"><small class="text-muted d-block" style="font-size:0.7rem;">Vencimiento</small><span class="fw-bold" style="font-size:0.85rem; color:${estado.colorText}">${vencimiento}</span></div>
                    </div>
                    ${d.entidad ? `<div class="mt-2"><small class="text-muted d-block" style="font-size:0.7rem;">Entidad Emitente</small><span style="font-size:0.85rem;">${d.entidad}</span></div>` : ''}
                    ${d.observaciones ? `<div class="mt-2 p-2 bg-light rounded"><small class="text-muted d-block" style="font-size:0.7rem;">Observaciones</small><span style="font-size:0.8rem;">${d.observaciones}</span></div>` : ''}
                </div>
            </div>
            `;
            container.innerHTML += cardHtml;
        });
    }
    
    const btnHtml = `<button class="btn btn-primary w-100 fw-bold shadow-sm rounded-pill mt-3" onclick="abrirModalDocumentoFlota('${placa}')"><i class="bi bi-plus-lg"></i> Agregar Documento</button>`;
    container.innerHTML += btnHtml;
    
    var offcanvas = new bootstrap.Offcanvas(document.getElementById('drawerExpedientePlaca'));
    offcanvas.show();
}

function eliminarDocumentoFlota(idDoc, event) {
    if(event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if(!confirm("¿Estás seguro de eliminar este documento? Esta acción no se puede deshacer.")) return;
    
    fetch('/api/script/eliminarDocumento', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: idDoc, coleccion: 'DocumentosFlota', usuario: usuarioLogueado }) })
    .then(r => r.json())
    .then(r => {
        if(r.data === 'Éxito') {
            cargarTablaDocFlota(true);
        } else {
            alert(r.data);
        }
    });
}

function exportarExcelDocFlota() {
    if(dataDocFlota.length === 0) return alert("No hay datos para exportar.");
    
    let csv = "PLACA,TIPO DOCUMENTO,ENTIDAD,CONSTANCIA,FECHA EMISION,FECHA VENCIMIENTO,ESTADO,DIAS RESTANTES,OBSERVACIONES\n";
    dataDocFlota.forEach(d => {
        let est = calcularEstadoDocumento(d.fecha_vencimiento);
        csv += `${d.placa},${d.tipo_documento},${d.entidad || ''},${d.nro_constancia || ''},${formatearFechaDoc(d.fecha_emision)},${formatearFechaDoc(d.fecha_vencimiento)},${est.texto},${est.dias},"${(d.observaciones || '').replace(/"/g, '""')}"\n`;
    });
    
    let blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement("a");
    let url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Documentos_Flota_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function descargarPlantillaDocs() {
    let csv = "PLACA,TC_VENCIMIENTO,SOAT_CONSTANCIA,SOAT_VENCIMIENTO,MATPEL_CONSTANCIA,MATPEL_EMISION,MATPEL_VENCIMIENTO,RT_EMISION,RT_VENCIMIENTO,BONI_VENCIMIENTO,SEGVEH_ENTIDAD,SEGVEH_ASESOR,SEGVEH_VENCIMIENTO,SEGCARGA_ENTIDAD,SEGCARGA_ASESOR,SEGCARGA_EMISION,SEGCARGA_VENCIMIENTO,FUMIG_EMISION,FUMIG_VENCIMIENTO,EXTINTORES_CANT,EXTINTORES_VENCIMIENTO\n";
    let blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement("a");
    let url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Plantilla_Documentos_Flota.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function procesarImportacionDocumentos(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lineas = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if(lineas.length < 2) return alert("El archivo está vacío o no tiene el formato correcto.");
        
        const delimitador = lineas[0].includes(';') ? ';' : ',';
        const headers = lineas[0].split(delimitador);
        let documentosAImportar = [];
        
        for(let i=1; i<lineas.length; i++) {
            let row = lineas[i].split(delimitador);
            if(row.length < headers.length) continue;
            
            let obj = {};
            headers.forEach((h, idx) => { obj[h.trim()] = row[idx]?.trim(); });
            
            let placa = obj['PLACA'];
            if(!placa) continue;
            
            const pushDoc = (tipo, emision, vencimiento, constancia='', entidad='', asesor='', observaciones='') => {
                if (vencimiento || emision || constancia || observaciones) {
                    documentosAImportar.push({
                        placa: placa, tipo_documento: tipo, entidad: entidad, 
                        nro_constancia: constancia, fecha_emision: emision, 
                        fecha_vencimiento: vencimiento, asesor: asesor, observaciones: observaciones
                    });
                }
            };
            
            pushDoc('Tarjeta de Circulación', null, obj['TC_VENCIMIENTO']);
            pushDoc('SOAT', null, obj['SOAT_VENCIMIENTO'], obj['SOAT_CONSTANCIA']);
            pushDoc('Certificado MATPEL', obj['MATPEL_EMISION'], obj['MATPEL_VENCIMIENTO'], obj['MATPEL_CONSTANCIA']);
            pushDoc('Revisión Técnica', obj['RT_EMISION'], obj['RT_VENCIMIENTO']);
            pushDoc('Bonificación', null, obj['BONI_VENCIMIENTO']);
            pushDoc('Seguro Vehicular', null, obj['SEGVEH_VENCIMIENTO'], '', obj['SEGVEH_ENTIDAD'], obj['SEGVEH_ASESOR']);
            pushDoc('Seguro Carga', obj['SEGCARGA_EMISION'], obj['SEGCARGA_VENCIMIENTO'], '', obj['SEGCARGA_ENTIDAD'], obj['SEGCARGA_ASESOR']);
            pushDoc('Certificado Fumigación', obj['FUMIG_EMISION'], obj['FUMIG_VENCIMIENTO']);
            
            let notasExtintor = obj['EXTINTORES_CANT'] ? `Cantidad: ${obj['EXTINTORES_CANT']}` : '';
            if (obj['EXTINTORES_VENCIMIENTO'] || notasExtintor) {
                pushDoc('Extintores', null, obj['EXTINTORES_VENCIMIENTO'], '', '', '', notasExtintor);
            }
        }
        
        if (documentosAImportar.length === 0) return alert("No se encontraron documentos válidos para importar.");
        
        document.getElementById('cache-badge-docflota').innerHTML = '<i class="bi bi-arrow-repeat spin"></i> <span id="cache-label-docflota">Importando...</span>';
        
        fetch('/api/script/importarDocumentosFlota', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ args: [documentosAImportar] }) })
        .then(r => r.json())
        .then(r => {
            if(r.data === 'Éxito') {
                alert(`¡Importación exitosa! Se procesaron ${documentosAImportar.length} documentos.`);
                cargarTablaDocFlota(true);
            } else {
                alert("Hubo un error al importar: " + r.data);
            }
        });
        
        event.target.value = '';
    };
    reader.readAsText(file);
}
