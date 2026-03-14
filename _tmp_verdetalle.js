function verDetalleInspeccion(idBusqueda, autoDescargarPDF) {
    let insp = dataGlobalInspecciones.find(i => i.id === idBusqueda);
    if(!insp) return;

    let fIng = parseDateToDDMMYYYY(insp.fecha_ingreso);
    let htmlFallas = ""; let countFallas = 0;

    let htmlEvidenciasPDF = ""; let contEvidencias = 1;

    try {
        let detallesArray = [];
        if (typeof insp.detalles_json === 'string') {
            try { detallesArray = JSON.parse(insp.detalles_json); } catch(e){}
        } else if (Array.isArray(insp.detalles_json)) {
            detallesArray = insp.detalles_json;
        }

        if(detallesArray && detallesArray.length > 0) {
            detallesArray.forEach(d => {
                if(d.estado === "SIN DATOS" || d.estado === "") return;

                let colorTxt = ""; let icon = ""; let pdfClass = "";
                if(d.estado === "FALLA") {
                    colorTxt = "color: #dc2626; font-weight: bold;"; icon = "❌"; countFallas++;
                    pdfClass = "text-danger-pdf";
                }
                else if(d.estado === "OK") {
                    colorTxt = "color: #16a34a; font-weight: bold;"; icon = "✅";
                    pdfClass = "text-success-pdf";
                }
                else {
                    colorTxt = "color: #0ea5e9; font-weight: bold;"; icon = "ℹ️";
                    pdfClass = "text-info-pdf";
                }

                let extraFotoBtn = "";
                if (d.foto && d.foto.length > 100) {
                    extraFotoBtn = `<br><button class="btn btn-sm btn-secondary mt-1 py-0 px-2 shadow-sm" onclick="verFotoEvidencia('${d.foto}')"><i class="bi bi-camera"></i> Ver Evidencia ${contEvidencias}</button>`;
                    htmlEvidenciasPDF += `
                        <div style="margin-bottom: 25px; page-break-inside: avoid;">
                            <h5 style="margin-bottom: 8px; color: #1e293b; text-align: left; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Evidencia ${contEvidencias}: ${d.categoria.replace(/^\d+\.\s*/, '')} - ${d.item}</h5>
                            <img src="${d.foto}" style="max-width: 90%; max-height: 400px; border: 2px solid #94a3b8; border-radius: 6px; padding: 4px; display: inline-block;">
                            ${d.observacion ? `<p style="text-align: left; font-style: italic; color: #dc2626; margin-top: 5px;">Detalle: ${d.observacion}</p>` : ''}
                        </div>
                    `;
                    contEvidencias++;
                }

                htmlFallas += `<div style="border-bottom: 1px solid #e2e8f0; padding: 5px 0;"><strong>${d.categoria.replace(/^\d+\.\s*/, '')} - ${d.item}:</strong> <span class="${pdfClass}" style="${colorTxt}">${icon} ${d.estado}</span>${d.observacion ? `<br><em style="color: #64748b; font-size: 11px;">Obs: ${d.observacion}</em>` : ''}${extraFotoBtn}</div>`;
            });
        }
    } catch(e) { htmlFallas = "<p class='text-danger'>Error al leer los detalles históricos.</p>"; }

    if(htmlFallas === "") htmlFallas = "<p class='text-center text-muted mt-3'>No hay fallas ni diagnósticos registrados en este reporte.</p>";

    let htmlModal = `
    <div class="col-md-6"><div class="insp-detail-card shadow-sm"><div class="insp-detail-title"><i class="bi bi-card-checklist text-primary"></i> REGISTRO GENERAL</div><div class="insp-row"><span style="color:var(--text)">Fecha de Inspección</span><span style="color:var(--text)">${fIng}</span></div><div class="insp-row"><span style="color:var(--text)">Placa</span><span class="text-primary fw-bold">${insp.placa}</span></div><div class="insp-row"><span style="color:var(--text)">Kilometraje</span><span style="color:var(--text)">${insp.km_tablero || '-'}</span></div><div class="insp-row"><span style="color:var(--text)">Fallas Detectadas</span><span class="text-danger fw-bold">${countFallas}</span></div></div></div>
    <div class="col-md-6"><div class="insp-detail-card shadow-sm"><div class="insp-detail-title"><i class="bi bi-person-badge text-primary"></i> FIRMA Y RESPONSABLE</div><div class="insp-row"><span style="color:var(--text)">Técnico Inspector</span><span style="color:var(--text)">${insp.tecnico || '-'}</span></div>
    <div class="text-center mt-3 p-2 border rounded bg-white" id="firma-visual-modal"><span class="text-muted"><span class="spinner-border spinner-border-sm"></span> Verificando firma...</span></div></div></div>
    <div class="col-12"><div class="card p-3 shadow-sm"><h6 class="fw-bold text-primary border-bottom pb-2">DIAGNÓSTICO</h6><div style="max-height: 300px; overflow-y:auto; font-size: 0.9rem; color:var(--text);">${htmlFallas}</div></div></div>`;

    document.getElementById('pdf-insp-placa').innerText = insp.placa;
    document.getElementById('pdf-insp-fecha').innerText = fIng;
    document.getElementById('pdf-insp-tecnico').innerText = insp.tecnico || '';
    document.getElementById('pdf-insp-km').innerText = insp.km_tablero || '-';
    document.getElementById('pdf-insp-cliente').innerText = insp.cliente || (dataGlobalPlacas.find(p => normalizeStr(p[0]) === normalizeStr(insp.placa)) || [])[1] || "";
    document.getElementById('pdf-insp-detalle-fallas').innerHTML = htmlFallas;

    let ctnEvidencias = document.getElementById('pdf-insp-evidencias-container');
    if (ctnEvidencias) {
        if (htmlEvidenciasPDF !== "") {
            document.getElementById('pdf-insp-evidencias').innerHTML = htmlEvidenciasPDF;
            ctnEvidencias.style.display = 'block';
        } else {
            ctnEvidencias.style.display = 'none';
        }
    }

    document.getElementById('contenedor-resumen-insp').innerHTML = htmlModal;
    new bootstrap.Modal(document.getElementById('modalResumenInspeccion')).show();

    let firmaImgPDF = document.getElementById('pdf-insp-firma');
    if(insp.url_firma && insp.url_firma.length > 100) {
        firmaImgPDF.src = insp.url_firma;
        firmaImgPDF.style.display = 'inline-block';
        document.getElementById('firma-visual-modal').innerHTML = `<img src="${insp.url_firma}" style="max-height: 100px; max-width:100%;">`;
        if(autoDescargarPDF) setTimeout(generarPDFInspeccion, 500);
    } else {
        firmaImgPDF.style.display = 'none'; document.getElementById('firma-visual-modal').innerHTML = '<span class="text-muted">Sin firma registrada</span>';
        if(autoDescargarPDF) setTimeout(generarPDFInspeccion, 500);
    }
}

window.verFotoEvidencia = function(base64Image) {
    document.getElementById('mapa-placa-titulo').innerText = "Evidencia Fotográfica";
    document.getElementById('iframeMapaGPS').outerHTML = `<img id="iframeMapaGPS" src="${base64Image}" style="width: 100%; height: 100%; object-fit: contain; background: #000;">`;
    new bootstrap.Modal(document.getElementById('modalMapaGPS')).show();
};
