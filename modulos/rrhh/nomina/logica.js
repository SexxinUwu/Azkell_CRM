// ═════════════════════════════════════════════════════════════════════
// MÓDULO: RRHH — NÓMINA & CUMPLIMIENTO SST — Lógica SPA
// ERP Azkell
// ═════════════════════════════════════════════════════════════════════

window._rrhhNominaData = null;

window.init_rrhh_nomina = function() {
    var d = new Date();
    var selMes = document.getElementById('nom-filtro-mes');
    var selAnio = document.getElementById('nom-filtro-anio');
    if (selMes) selMes.value = String(d.getMonth() + 1);
    if (selAnio) selAnio.value = String(d.getFullYear());

    window.rrhhNominaCargar();
};

window.rrhhNominaCambiarTab = function(tab) {
    var pNom = document.getElementById('tab-pane-nomina');
    var pSst = document.getElementById('tab-pane-sst');
    var bNom = document.getElementById('tab-btn-nomina');
    var bSst = document.getElementById('tab-btn-sst');

    if (tab === 'nomina') {
        if (pNom) pNom.classList.remove('d-none');
        if (pSst) pSst.classList.add('d-none');
        if (bNom) bNom.classList.add('active');
        if (bSst) bSst.classList.remove('active');
        window.rrhhNominaCargar();
    } else {
        if (pNom) pNom.classList.add('d-none');
        if (pSst) pSst.classList.remove('d-none');
        if (bNom) bNom.classList.remove('active');
        if (bSst) bSst.classList.add('active');
        window.rrhhNominaCargarSST();
    }
};

window.rrhhNominaCargar = async function() {
    var tbody = document.getElementById('tabla-nomina-tbody');
    if (!tbody) return;

    var anio = document.getElementById('nom-filtro-anio')?.value || new Date().getFullYear();
    var mes = document.getElementById('nom-filtro-mes')?.value || (new Date().getMonth() + 1);

    try {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2 text-primary"></span> Calculando planilla del periodo...</td></tr>`;

        var res = await fetch(`/api/rrhh/nomina/resumen?anio=${anio}&mes=${mes}`);
        var json = await res.json();

        if (!json || !json.ok) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-danger">Error al calcular nómina.</td></tr>`;
            return;
        }

        window._rrhhNominaData = json;
        var lista = json.data || [];

        var kpiNeto = document.getElementById('kpi-nom-neto');
        var kpiEss = document.getElementById('kpi-nom-essalud');
        var kpiTot = document.getElementById('kpi-nom-total');

        if (kpiNeto) kpiNeto.textContent = `S/ ${parseFloat(json.total_neto_planilla || 0).toFixed(2)}`;
        if (kpiEss) kpiEss.textContent = `S/ ${parseFloat(json.total_essalud || 0).toFixed(2)}`;
        if (kpiTot) kpiTot.textContent = String(json.total_colaboradores || '0');

        if (!lista.length) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-muted">No hay colaboradores activos en este periodo.</td></tr>`;
            return;
        }

        tbody.innerHTML = lista.map(function(r) {
            return `
                <tr>
                    <td class="ps-4">
                        <strong class="d-block text-dark">${r.nombre_completo}</strong>
                        <small class="text-muted font-monospace">${r.documento} — ${r.cargo}</small>
                    </td>
                    <td>
                        <div class="fw-bold text-dark font-monospace">${r.dias_trabajados}d trabajados</div>
                        <small class="text-danger">${r.faltas} faltas / ${r.minutos_tardanza}min tard.</small>
                    </td>
                    <td>
                        <div class="font-monospace fw-semibold">S/ ${parseFloat(r.sueldo_basico + r.asignacion_familiar).toFixed(2)}</div>
                        <small class="text-muted">${r.asignacion_familiar > 0 ? '+ Asig. Fam' : 'Sin Asig.'}</small>
                    </td>
                    <td class="font-monospace text-primary fw-semibold">S/ ${parseFloat(r.horas_extras_importe || 0).toFixed(2)}</td>
                    <td class="font-monospace fw-bold text-dark fs-6">S/ ${parseFloat(r.total_ingresos || 0).toFixed(2)}</td>
                    <td>
                        <div class="font-monospace text-danger">- S/ ${parseFloat(r.descuento_pension || 0).toFixed(2)}</div>
                        <small class="text-muted font-monospace">${r.regimen_pensionario}</small>
                    </td>
                    <td class="font-monospace text-danger">- S/ ${parseFloat(r.descuento_faltas + r.descuento_tardanzas).toFixed(2)}</td>
                    <td>
                        <span class="font-monospace fw-bolder text-success fs-6">S/ ${parseFloat(r.neto_pagar || 0).toFixed(2)}</span>
                    </td>
                    <td>
                        <div class="fw-semibold text-dark small">${r.banco}</div>
                        <small class="text-muted font-monospace">${r.cuenta}</small>
                    </td>
                    <td class="text-end pe-4">
                        <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3 fw-bold" onclick="window.rrhhNominaVerBoleta(${r.id})">
                            <i class="bi bi-receipt me-1"></i> Boleta
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-danger">Error: ${err.message}</td></tr>`;
    }
};

window.rrhhNominaVerBoleta = function(id) {
    if (!window._rrhhNominaData || !window._rrhhNominaData.data) return;
    var r = window._rrhhNominaData.data.find(x => x.id == id);
    if (!r) return;

    var periodo = window._rrhhNominaData.periodo || '---';
    var modalBody = document.getElementById('boleta-modal-body');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <div class="boleta-print-box shadow-sm">
            <div class="text-center border-bottom pb-3 mb-3">
                <h5 class="fw-bold text-dark m-0">BOLETA DE PAGO DE REMUNERACIONES</h5>
                <small class="text-muted fw-bold">D.S. N° 001-98-TR / LEY DE PRODUCTIVIDAD Y COMPETITIVIDAD LABORAL</small>
                <div class="fw-bold mt-1 text-primary">PERIODO: ${periodo}</div>
            </div>

            <div class="row g-2 small mb-3 border-bottom pb-3">
                <div class="col-6"><strong>TRABAJADOR:</strong> ${r.nombre_completo}</div>
                <div class="col-6"><strong>DNI / DOC:</strong> ${r.documento}</div>
                <div class="col-6"><strong>CARGO / ROL:</strong> ${r.cargo} (${r.rol})</div>
                <div class="col-6"><strong>RÉGIMEN PENSIÓN:</strong> ${r.regimen_pensionario}</div>
                <div class="col-6"><strong>DÍAS LABORADOS:</strong> ${r.dias_trabajados} días</div>
                <div class="col-6"><strong>FALTAS / TARDANZAS:</strong> ${r.faltas} días / ${r.minutos_tardanza} min</div>
            </div>

            <div class="row g-3 mb-3">
                <div class="col-6">
                    <h6 class="fw-bold text-success border-bottom pb-1 mb-2">INGRESOS DEL TRABAJADOR</h6>
                    <table class="w-100 small">
                        <tr><td>Sueldo Básico:</td><td class="text-end font-monospace">S/ ${parseFloat(r.sueldo_basico).toFixed(2)}</td></tr>
                        <tr><td>Asignación Familiar:</td><td class="text-end font-monospace">S/ ${parseFloat(r.asignacion_familiar).toFixed(2)}</td></tr>
                        <tr><td>Bono / Movilidad:</td><td class="text-end font-monospace">S/ ${parseFloat(r.bono_fijo).toFixed(2)}</td></tr>
                        <tr><td>Horas Extras:</td><td class="text-end font-monospace">S/ ${parseFloat(r.horas_extras_importe).toFixed(2)}</td></tr>
                        <tr class="fw-bold border-top"><td>TOTAL INGRESOS:</td><td class="text-end font-monospace">S/ ${parseFloat(r.total_ingresos).toFixed(2)}</td></tr>
                    </table>
                </div>
                <div class="col-6">
                    <h6 class="fw-bold text-danger border-bottom pb-1 mb-2">DESCUENTOS AL TRABAJADOR</h6>
                    <table class="w-100 small">
                        <tr><td>Aporte Pensión (${r.regimen_pensionario}):</td><td class="text-end font-monospace">S/ ${parseFloat(r.descuento_pension).toFixed(2)}</td></tr>
                        <tr><td>Descuento Faltas:</td><td class="text-end font-monospace">S/ ${parseFloat(r.descuento_faltas).toFixed(2)}</td></tr>
                        <tr><td>Descuento Tardanzas:</td><td class="text-end font-monospace">S/ ${parseFloat(r.descuento_tardanzas).toFixed(2)}</td></tr>
                        <tr class="fw-bold border-top"><td>TOTAL DESCUENTOS:</td><td class="text-end font-monospace">S/ ${parseFloat(r.total_descuentos).toFixed(2)}</td></tr>
                    </table>
                </div>
            </div>

            <div class="p-3 bg-light rounded-3 d-flex justify-content-between align-items-center mb-4 border">
                <div>
                    <strong>NETO A PAGAR:</strong>
                    <small class="text-muted d-block font-monospace">Abono en: ${r.banco} — ${r.cuenta}</small>
                </div>
                <div class="fs-4 fw-bold font-monospace text-success">S/ ${parseFloat(r.neto_pagar).toFixed(2)}</div>
            </div>

            <div class="row pt-5 text-center small">
                <div class="col-6">
                    <div class="border-top border-dark pt-1 mx-3">EMPLEADOR / RRHH</div>
                </div>
                <div class="col-6">
                    <div class="border-top border-dark pt-1 mx-3">FIRMA DEL TRABAJADOR</div>
                </div>
            </div>
        </div>
    `;

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalBoletaView'));
    modal.show();
};

window.rrhhNominaCargarSST = async function() {
    var tbody = document.getElementById('tabla-sst-tbody');
    if (!tbody) return;

    try {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2 text-primary"></span> Consultando registros de SST...</td></tr>`;

        var res = await fetch('/api/rrhh/sst');
        var json = await res.json();

        if (!json || !json.ok) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-danger">Error al cargar registros SST.</td></tr>`;
            return;
        }

        var lista = json.data || [];
        if (!lista.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted">No hay constancias de SST registradas aún. Pulsa "Registrar Constancia SST" para agregar la primera.</td></tr>`;
            return;
        }

        tbody.innerHTML = lista.map(function(s) {
            var docLink = s.documento_url ? `<a href="${s.documento_url}" target="_blank" class="btn btn-sm btn-outline-primary rounded-pill px-3"><i class="bi bi-file-earmark-arrow-down-fill me-1"></i> Ver Cargo</a>` : '<span class="text-muted small">Sin archivo</span>';
            var badgeFirma = s.firmado ? `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1"><i class="bi bi-check-circle-fill me-1"></i> Firmado</span>` : `<span class="badge bg-warning-subtle text-warning border px-2 py-1">Pendiente Firma</span>`;

            return `
                <tr>
                    <td class="ps-4">
                        <strong class="d-block text-dark">${s.apellidos}, ${s.nombres}</strong>
                        <small class="text-muted font-monospace">${s.numero_documento} — ${s.cargo}</small>
                    </td>
                    <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-bold">${s.tipo_registro}</span></td>
                    <td class="fw-semibold text-dark">${s.descripcion}</td>
                    <td class="font-monospace text-muted">${s.fecha_registro ? s.fecha_registro.slice(0, 10) : '---'}</td>
                    <td class="font-monospace text-muted">${s.fecha_vencimiento ? s.fecha_vencimiento.slice(0, 10) : 'N/A'}</td>
                    <td>${badgeFirma}</td>
                    <td class="text-end pe-4">${docLink}</td>
                </tr>
            `;
        }).join('');

    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-danger">Error: ${e.message}</td></tr>`;
    }
};

window.rrhhNominaAbrirModalSST = async function() {
    var sel = document.getElementById('sst-personal-id');
    if (sel) {
        try {
            var res = await fetch('/api/rrhh/personal');
            var json = await res.json();
            if (json && json.ok && json.data) {
                sel.innerHTML = json.data.map(p => `
                    <option value="${p.id}">${p.apellidos}, ${p.nombres} (${p.categoria_rol})</option>
                `).join('');
            }
        } catch(e) {}
    }

    var fHoy = document.getElementById('sst-fecha');
    if (fHoy) fHoy.value = new Date().toISOString().slice(0, 10);

    var form = document.getElementById('formSST');
    if (form) form.reset();
    if (fHoy) fHoy.value = new Date().toISOString().slice(0, 10);

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalSSTForm'));
    modal.show();
};

window.rrhhNominaGuardarSST = async function(e) {
    if (e) e.preventDefault();

    var btn = document.getElementById('sst-btn-guardar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...'; }

    var formData = new FormData();
    formData.append('personal_id', document.getElementById('sst-personal-id')?.value || '');
    formData.append('tipo_registro', document.getElementById('sst-tipo')?.value || 'ENTREGA_EPP');
    formData.append('descripcion', document.getElementById('sst-desc')?.value || '');
    formData.append('fecha_registro', document.getElementById('sst-fecha')?.value || '');
    formData.append('fecha_vencimiento', document.getElementById('sst-venc')?.value || '');
    formData.append('firmado', document.getElementById('sst-firmado')?.checked ? '1' : '0');

    var fileInput = document.getElementById('sst-archivo');
    if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('documento', fileInput.files[0]);
    }

    try {
        var res = await fetch('/api/rrhh/sst', {
            method: 'POST',
            body: formData
        });
        var json = await res.json();
        if (json && json.ok) {
            alert('¡Constancia SST guardada con éxito!');
            var modal = bootstrap.Modal.getInstance(document.getElementById('modalSSTForm'));
            if (modal) modal.hide();
            window.rrhhNominaCargarSST();
        } else {
            alert(json.error || 'No se pudo guardar');
        }
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Guardar Constancia SST'; }
    }
};

window.rrhhNominaExportarExcel = function() {
    if (!window._rrhhNominaData || !window._rrhhNominaData.data) {
        alert('No hay datos calculados para exportar');
        return;
    }

    var lista = window._rrhhNominaData.data;
    var csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "DOCUMENTO,COLABORADOR,CARGO,ROL,DIAS TRABAJADOS,SUELDO BASICO,TOTAL INGRESOS,TOTAL DESCUENTOS,NETO A PAGAR,BANCO,CUENTA,CCI\r\n";

    lista.forEach(function(r) {
        var row = `"${r.documento}","${r.nombre_completo}","${r.cargo}","${r.rol}",${r.dias_trabajados},${r.sueldo_basico},${r.total_ingresos},${r.total_descuentos},${r.neto_pagar},"${r.banco}","${r.cuenta}","${r.cci}"`;
        csvContent += row + "\r\n";
    });

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Planilla_${window._rrhhNominaData.periodo || '2026'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.init_rrhh_nomina);
} else {
    window.init_rrhh_nomina();
}
