// ═════════════════════════════════════════════════════════════════════
// MÓDULO: RRHH — PERSONAL & LEGAJOS DIGITALES 360° — Lógica SPA
// ERP Azkell
// ═════════════════════════════════════════════════════════════════════

window._rrhhPersonalList = [];
window._rrhhDniTimeout = null;
window._rrhhFotoBase64 = null;

window.init_rrhh_personal = function() {
    window.rrhhPersonalCargarListado();
    window.rrhhPersonalCargarKPIs();
};

window.rrhhPersonalCargarKPIs = async function() {
    try {
        var res = await fetch('/api/rrhh/kpis');
        var json = await res.json();
        if (json && json.ok && json.data) {
            var d = json.data;
            var elTot = document.getElementById('kpi-pers-total');
            var elAct = document.getElementById('kpi-pers-activos');
            var elCond = document.getElementById('kpi-pers-conductores');
            var elRuta = document.getElementById('kpi-pers-enruta');
            var elCont = document.getElementById('kpi-pers-contratos');
            var elAlert = document.getElementById('kpi-pers-alertas');

            if (elTot) elTot.textContent = d.total || '0';
            if (elAct) elAct.textContent = `${d.activos || '0'} Activos`;
            if (elCond) elCond.textContent = d.conductores || '0';
            if (elRuta) elRuta.textContent = `${d.conductores_en_ruta || '0'} En Ruta`;
            if (elCont) elCont.textContent = d.contratos_por_vencer || '0';
            if (elAlert) elAlert.textContent = (parseInt(d.sctr_alertas || 0) + parseInt(d.brevetes_por_vencer || 0)) || '0';
        }
    } catch(e) {
        console.warn('Error cargando KPIs de RRHH:', e);
    }
};

window.rrhhPersonalCargarListado = async function() {
    var tbody = document.getElementById('tabla-personal-tbody');
    if (!tbody) return;

    try {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2 text-primary"></span> Consultando colaboradores...</td></tr>`;
        var res = await fetch('/api/rrhh/personal');
        var json = await res.json();

        if (json && json.ok && Array.isArray(json.data)) {
            window._rrhhPersonalList = json.data;
            window.rrhhPersonalRenderizarTabla(json.data);
            window.rrhhPersonalCargarKPIs();
        } else {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-5 text-danger">No se pudo cargar la lista de personal.</td></tr>`;
        }
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-5 text-danger">Error de conexión: ${err.message}</td></tr>`;
    }
};

window.rrhhPersonalRenderizarTabla = function(lista) {
    var tbody = document.getElementById('tabla-personal-tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="38" class="text-center py-5 text-muted">
                    <i class="bi bi-people fs-2 d-block mb-2 text-secondary"></i>
                    No se encontraron colaboradores registrados con los filtros aplicados.
                </td>
            </tr>
        `;
        return;
    }

    var rolClases = {
        'CONDUCTOR': 'rol-conductor',
        'MECANICO_TALLER': 'rol-mecanico',
        'ADMINISTRATIVO': 'rol-admin',
        'LIMPIEZA_SERVICIOS': 'rol-limpieza',
        'SEGURIDAD_CONTROL': 'rol-seguridad'
    };

    var html = lista.map(function(p, idx) {
        var rolClass = rolClases[p.categoria_rol] || 'bg-light text-dark border';

        // Semáforo de estado de contrato
        var estContratoBadge = '<span class="badge bg-light text-dark border">VIGENTE</span>';
        if (p.tipo_contrato === 'INDETERMINADO') {
            estContratoBadge = '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-infinity"></i> INDETERMINADO</span>';
        } else if (p.fecha_fin_contrato) {
            var fFin = new Date(p.fecha_fin_contrato);
            var hoy = new Date();
            var diffDias = Math.ceil((fFin - hoy) / (1000 * 60 * 60 * 24));
            
            if (diffDias < 0) {
                estContratoBadge = `<span class="badge bg-danger text-white">VENCIDO (${Math.abs(diffDias)}d)</span>`;
            } else if (diffDias <= 30) {
                estContratoBadge = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">VENCE EN ${diffDias}D</span>`;
            } else {
                estContratoBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle">VIGENTE</span>`;
            }
        }

        // Estado general
        var badgeEst = p.estado === 'ACTIVO' 
            ? 'bg-success-subtle text-success border border-success-subtle' 
            : (p.estado === 'VACACIONES' ? 'bg-info-subtle text-info border' : 'bg-secondary-subtle text-secondary border');

        var sctrSaludBadge = p.sctr_salud_vigente ? '<span class="badge bg-success-subtle text-success border border-success-subtle">VIGENTE</span>' : '<span class="badge bg-danger text-white">SIN SCTR</span>';
        var sctrPensionBadge = p.sctr_pension_vigente ? '<span class="badge bg-success-subtle text-success border border-success-subtle">VIGENTE</span>' : '<span class="badge bg-secondary-subtle text-secondary">N/A</span>';
        var emoBadge = p.emo_condicion === 'APTO' ? '<span class="badge bg-success-subtle text-success border border-success-subtle">APTO</span>' : `<span class="badge bg-warning-subtle text-warning-emphasis border">${p.emo_condicion || 'PENDIENTE'}</span>`;

        var tallasEpp = `P:${p.talla_polo || 'M'} | Pant:${p.talla_pantalon || '32'} | Calz:${p.talla_calzado || '41'}`;
        var contactoEmerg = p.contacto_emergencia_nombre ? `${p.contacto_emergencia_nombre} (${p.contacto_emergencia_telefono || '—'})` : '—';

        return `
            <tr>
                <td class="ps-3 text-center text-muted font-monospace">${idx + 1}</td>
                <td class="font-monospace fw-bold text-dark">${p.numero_documento}</td>
                <td class="fw-bold text-primary">${p.apellidos}, ${p.nombres}</td>
                <td class="font-monospace">${p.telefono || '—'}</td>
                <td>${p.email || '—'}</td>
                <td><span class="badge bg-light text-dark border font-monospace">${p.area || 'OPERACIONES'}</span></td>
                <td><span class="rrhh-badge-rol ${rolClass}">${p.categoria_rol ? p.categoria_rol.replace('_', ' ') : '—'}</span></td>
                <td class="fw-semibold text-dark">${p.cargo || '—'}</td>
                <td><span class="badge font-monospace" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">${p.centro_costo_codigo || 'CC-300'}</span></td>
                <td>${p.sede || 'BASE PRINCIPAL'}</td>
                <td class="font-monospace">${p.fecha_ingreso ? p.fecha_ingreso.slice(0, 10) : '—'}</td>
                <td><span class="badge bg-light text-dark border">${p.tipo_contrato || 'PLAZO_FIJO'}</span></td>
                <td class="font-monospace">${p.fecha_inicio_contrato ? p.fecha_inicio_contrato.slice(0, 10) : '—'}</td>
                <td class="font-monospace">${p.fecha_fin_contrato ? p.fecha_fin_contrato.slice(0, 10) : (p.tipo_contrato === 'INDETERMINADO' ? 'Indeterminado' : '—')}</td>
                <td>${estContratoBadge}</td>
                <td class="font-monospace fw-bold text-success text-end">S/ ${parseFloat(p.sueldo_basico || 0).toFixed(2)}</td>
                <td class="font-monospace text-end">${p.tiene_asignacion_familiar ? 'S/ 113.00' : 'S/ 0.00'}</td>
                <td class="font-monospace text-end">S/ ${parseFloat(p.bono_fijo || 0).toFixed(2)}</td>
                <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace">${p.regimen_pensionario || 'ONP'}</span></td>
                <td class="font-monospace small">${p.tipo_comision_afp || 'FLUJO'}</td>
                <td class="font-monospace">${p.cuspp || '—'}</td>
                <td>${p.banco_haberes || '—'}</td>
                <td class="font-monospace">${p.cuenta_haberes || '—'}</td>
                <td class="font-monospace">${p.cci_haberes || '—'}</td>
                <td>${p.banco_cts || '—'}</td>
                <td class="font-monospace">${p.cuenta_cts || '—'}</td>
                <td class="text-center"><span class="badge bg-danger-subtle text-danger border border-danger-subtle fw-bold">${p.grupo_sanguineo || 'O+'}</span></td>
                <td class="font-monospace fw-bold">${p.licencia_conducir || '—'}</td>
                <td class="text-center"><span class="badge bg-secondary-subtle text-secondary font-monospace">${p.licencia_categoria || '—'}</span></td>
                <td class="font-monospace">${p.licencia_vencimiento ? p.licencia_vencimiento.slice(0, 10) : '—'}</td>
                <td>${sctrSaludBadge}</td>
                <td>${sctrPensionBadge}</td>
                <td>${emoBadge}</td>
                <td class="font-monospace">${p.emo_fecha_vencimiento ? p.emo_fecha_vencimiento.slice(0, 10) : '—'}</td>
                <td class="font-monospace small">${tallasEpp}</td>
                <td class="small">${contactoEmerg}</td>
                <td><span class="badge ${badgeEst} px-2 py-1 rounded-pill" style="font-size:0.68rem;">${p.estado}</span></td>
                <td class="text-end pe-3">
                    <div class="btn-group">
                        <button type="button" class="btn btn-sm btn-outline-primary rounded-circle me-1" style="width:30px;height:30px;padding:0;" onclick="window.rrhhPersonalVerFicha(${p.id})" title="Ver Ficha 360°"><i class="bi bi-eye-fill"></i></button>
                        <button type="button" class="btn btn-sm btn-outline-secondary rounded-circle me-1" style="width:30px;height:30px;padding:0;" onclick="window.rrhhPersonalAbrirModalEditar(${p.id})" title="Editar"><i class="bi bi-pencil-fill"></i></button>
                        <button type="button" class="btn btn-sm btn-outline-danger rounded-circle" style="width:30px;height:30px;padding:0;" onclick="window.rrhhPersonalEliminar(${p.id})" title="Eliminar"><i class="bi bi-trash-fill"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html;
};

window.rrhhPersonalFiltrar = function() {
    var txt = (document.getElementById('filtro-pers-busqueda')?.value || '').toLowerCase().trim();
    var rol = document.getElementById('filtro-pers-rol')?.value || 'TODOS';
    var est = document.getElementById('filtro-pers-estado')?.value || 'TODOS';

    var filtrados = window._rrhhPersonalList.filter(function(p) {
        var matchTxt = !txt || 
            (p.nombres && p.nombres.toLowerCase().includes(txt)) || 
            (p.apellidos && p.apellidos.toLowerCase().includes(txt)) || 
            (p.numero_documento && p.numero_documento.includes(txt)) ||
            (p.cargo && p.cargo.toLowerCase().includes(txt));
        
        var matchRol = (rol === 'TODOS') || (p.categoria_rol === rol);
        var matchEst = (est === 'TODOS') || (p.estado === est);

        return matchTxt && matchRol && matchEst;
    });

    window.rrhhPersonalRenderizarTabla(filtrados);
};

window.rrhhPersonalLimpiarFiltros = function() {
    if (document.getElementById('filtro-pers-busqueda')) document.getElementById('filtro-pers-busqueda').value = '';
    if (document.getElementById('filtro-pers-rol')) document.getElementById('filtro-pers-rol').value = 'TODOS';
    if (document.getElementById('filtro-pers-estado')) document.getElementById('filtro-pers-estado').value = 'TODOS';
    window.rrhhPersonalRenderizarTabla(window._rrhhPersonalList);
};

// ── Control de Pestañas Apple Segmented ────────────────────────────────
window.rrhhPersonalSwitchTab = function(tabId) {
    document.querySelectorAll('.rrhh-tab-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.rrhh-tab-pane').forEach(function(pane) {
        pane.classList.toggle('d-none', pane.id !== tabId);
    });

    if (tabId === 'tab-pers-fotocheck') {
        window.rrhhPersonalActualizarFotocheckPreview();
    }
};

// ── Interactividad DNI y RENIEC ─────────────────────────────────────────
window.rrhhPersonalOnTipoDocChange = function(tipo) {
    var docInput = document.getElementById('pers-num-doc');
    var hint = document.getElementById('pers-doc-hint');
    var btn = document.getElementById('btn-pers-buscar-dni');
    if (tipo === 'DNI') {
        if (docInput) { docInput.maxLength = 8; docInput.placeholder = '12345678'; }
        if (hint) hint.innerHTML = '<i class="bi bi-magic text-primary me-1"></i> Digite los 8 dígitos para autocompletar nombres.';
        if (btn) btn.classList.remove('d-none');
    } else if (tipo === 'CE') {
        if (docInput) { docInput.maxLength = 12; docInput.placeholder = '001234567'; }
        if (hint) hint.innerHTML = '<i class="bi bi-info-circle text-muted me-1"></i> Carnet de Extranjería / Documento especial.';
    } else {
        if (docInput) { docInput.maxLength = 15; docInput.placeholder = 'Pasaporte'; }
        if (hint) hint.innerHTML = '<i class="bi bi-info-circle text-muted me-1"></i> Pasaporte u otro documento de identidad.';
    }
};

window.rrhhPersonalOnDocInput = function(val) {
    var tipo = document.getElementById('pers-tipo-doc')?.value || 'DNI';
    var cleanVal = (val || '').trim();
    if (tipo === 'DNI' && cleanVal.length === 8 && /^\d{8}$/.test(cleanVal)) {
        clearTimeout(window._rrhhDniTimeout);
        window._rrhhDniTimeout = setTimeout(function() {
            window.rrhhPersonalConsultarDNI();
        }, 300);
    }
};

window.rrhhPersonalConsultarDNI = async function() {
    var tipo = document.getElementById('pers-tipo-doc')?.value || 'DNI';
    var numDoc = (document.getElementById('pers-num-doc')?.value || '').trim();
    
    if (!numDoc) {
        if (typeof window.rotToast === 'function') window.rotToast('Ingrese un número de documento', 'bg-warning');
        return;
    }

    if (tipo === 'DNI' && numDoc.length !== 8) {
        if (typeof window.rotToast === 'function') window.rotToast('El DNI debe tener 8 dígitos numéricos', 'bg-warning');
        return;
    }

    var icon = document.getElementById('icon-pers-buscar-dni');
    var btn = document.getElementById('btn-pers-buscar-dni');
    var hint = document.getElementById('pers-doc-hint');
    
    if (icon) icon.className = 'spinner-border spinner-border-sm';
    if (btn) btn.disabled = true;
    if (hint) hint.innerHTML = '<span class="spinner-border spinner-border-sm text-primary me-1"></span> Consultando datos...';

    try {
        var res = await fetch(`/api/proxy/documento?tipo=${tipo}&numero=${numDoc}`);
        var data = await res.json();

        if (res.ok && data && (data.nombres || data.nombre || data.razonSocial || data.razon_social)) {
            var nom = data.nombres || '';
            var ape = '';
            if (data.apellidoPaterno || data.apellidoMaterno || data.apellido_paterno || data.apellido_materno) {
                ape = `${data.apellidoPaterno || data.apellido_paterno || ''} ${data.apellidoMaterno || data.apellido_materno || ''}`.trim();
            } else if (data.apellidos) {
                ape = data.apellidos.trim();
            }

            if (!nom && data.nombre) {
                nom = data.nombre.trim();
            }

            var elNom = document.getElementById('pers-nombres');
            var elApe = document.getElementById('pers-apellidos');
            var elDir = document.getElementById('pers-direccion');
            var elFec = document.getElementById('pers-fecha-nac');

            if (elNom && nom) elNom.value = nom.toUpperCase();
            if (elApe && ape) elApe.value = ape.toUpperCase();
            if (elDir && data.direccion) elDir.value = data.direccion.toUpperCase();
            if (elFec && (data.fecha_nacimiento || data.fechaNacimiento)) {
                elFec.value = (data.fecha_nacimiento || data.fechaNacimiento).slice(0, 10);
            }

            // Sincronizar brevete si es conductor y está vacío
            var brevInput = document.getElementById('pers-licencia-num');
            if (brevInput && !brevInput.value) {
                brevInput.value = 'Q' + numDoc;
            }

            if (hint) hint.innerHTML = '<span class="text-success fw-bold"><i class="bi bi-check-circle-fill me-1"></i> Datos obtenidos exitosamente</span>';
            if (typeof window.rotToast === 'function') window.rotToast('✨ Datos de DNI obtenidos', 'bg-success');
            
            window.rrhhPersonalActualizarFotocheckPreview();
        } else {
            if (hint) hint.innerHTML = '<span class="text-warning"><i class="bi bi-exclamation-triangle-fill me-1"></i> No se encontraron datos para este DNI</span>';
            if (typeof window.rotToast === 'function') window.rotToast('No se encontraron datos para este DNI', 'bg-warning');
        }
    } catch(err) {
        console.warn('Error consultando DNI en RRHH:', err);
        if (hint) hint.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle-fill me-1"></i> Error: ${err.message}</span>`;
        if (typeof window.rotToast === 'function') window.rotToast('Error al consultar DNI', 'bg-danger');
    } finally {
        if (icon) icon.className = 'bi bi-search';
        if (btn) btn.disabled = false;
    }
};

// ── Lógica de Área Operativa y Centro de Costos ────────────────────────
window.rrhhPersonalOnAreaChange = function(area) {
    var ccSelect = document.getElementById('pers-centro-costo');
    if (!ccSelect) return;

    var mapping = {
        'GERENCIA': 'CC-100',
        'ADMINISTRACION': 'CC-100',
        'COMERCIAL': 'CC-200',
        'OPERACIONES': 'CC-300',
        'FLOTA': 'CC-300',
        'MANTENIMIENTO': 'CC-400',
        'ALMACEN': 'CC-500'
    };

    if (mapping[area]) {
        ccSelect.value = mapping[area];
    }
};

// ── Lógica de Tipos de Contrato y Cálculo Automático de Fechas ─────────
window.rrhhPersonalOnTipoContratoChange = function(tipo) {
    var wrapMeses = document.getElementById('wrap-pers-meses-contrato');
    var finInput = document.getElementById('pers-fin-contrato');
    var mesesSelect = document.getElementById('pers-meses-duracion');

    if (tipo === 'INDETERMINADO') {
        if (wrapMeses) wrapMeses.classList.add('d-none');
        if (finInput) {
            finInput.value = '';
            finInput.disabled = true;
            finInput.placeholder = 'Indeterminado';
        }
    } else if (tipo === 'LOCACION_SERVICIOS') {
        if (wrapMeses) wrapMeses.classList.add('d-none');
        if (finInput) {
            finInput.value = '';
            finInput.disabled = true;
            finInput.placeholder = 'Sin vencimiento';
        }
    } else if (tipo === 'PERIODO_PRUEBA') {
        if (wrapMeses) wrapMeses.classList.remove('d-none');
        if (mesesSelect) mesesSelect.value = '3';
        if (finInput) finInput.disabled = false;
        window.rrhhPersonalRecalcularFechaFin();
    } else {
        // PLAZO_FIJO o PRACTICANTE
        if (wrapMeses) wrapMeses.classList.remove('d-none');
        if (finInput) finInput.disabled = false;
        window.rrhhPersonalRecalcularFechaFin();
    }
};

window.rrhhPersonalRecalcularFechaFin = function() {
    var tipo = document.getElementById('pers-tipo-contrato')?.value;
    if (tipo === 'INDETERMINADO' || tipo === 'LOCACION_SERVICIOS') return;

    var inicioVal = document.getElementById('pers-inicio-contrato')?.value;
    var mesesVal = document.getElementById('pers-meses-duracion')?.value;
    var finInput = document.getElementById('pers-fin-contrato');
    if (!inicioVal || !finInput || mesesVal === 'CUSTOM') return;

    var meses = parseInt(mesesVal, 10);
    if (isNaN(meses) || meses <= 0) return;

    var d = new Date(inicioVal + 'T00:00:00');
    d.setMonth(d.getMonth() + meses);
    d.setDate(d.getDate() - 1); // El contrato termina un día antes al completar el ciclo

    finInput.value = d.toISOString().slice(0, 10);
};

window.rrhhPersonalToggleRol = function(rol) {
    var boxLic = document.getElementById('box-pers-licencia');
    var boxCat = document.getElementById('box-pers-licencia-cat');
    var boxVenc = document.getElementById('box-pers-licencia-venc');
    var esConductor = (rol === 'CONDUCTOR');

    if (boxLic) boxLic.style.opacity = esConductor ? '1' : '0.6';
    if (boxCat) boxCat.style.opacity = esConductor ? '1' : '0.6';
    if (boxVenc) boxVenc.style.opacity = esConductor ? '1' : '0.6';
};

// ── Gestión de Fotografía y Fotocheck ──────────────────────────────────
window.rrhhPersonalOnFotoSelect = function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(evt) {
        window._rrhhFotoBase64 = evt.target.result;
        var prev = document.getElementById('pers-foto-preview');
        var fcAvatar = document.getElementById('fc-avatar');
        if (prev) prev.src = window._rrhhFotoBase64;
        if (fcAvatar) fcAvatar.src = window._rrhhFotoBase64;
    };
    reader.readAsDataURL(file);
};

window.rrhhPersonalActualizarFotocheckPreview = function() {
    var empNombre = (localStorage.getItem('fleet_empresa_nombre') || 'AZKELL TRANSPORTES S.A.C.').toUpperCase();
    var empLogo = localStorage.getItem('fleet_empresa_logo') || document.getElementById('nav-logo-img')?.src || '/favicon-2003.png';

    var elEmp = document.getElementById('fc-empresa');
    var elLogo = document.getElementById('fc-logo');
    if (elEmp) elEmp.textContent = empNombre;
    if (elLogo && empLogo) elLogo.src = empLogo;

    var nom = (document.getElementById('pers-nombres')?.value || '').trim();
    var ape = (document.getElementById('pers-apellidos')?.value || '').trim();
    var cargo = (document.getElementById('pers-cargo')?.value || '').trim();
    var area = (document.getElementById('pers-area')?.value || 'OPERACIONES').trim();
    var dni = (document.getElementById('pers-num-doc')?.value || '00000000').trim();

    var fcNom = document.getElementById('fc-nombre');
    var fcCargo = document.getElementById('fc-cargo');
    var fcArea = document.getElementById('fc-area');
    var fcDni = document.getElementById('fc-dni');

    if (fcNom) fcNom.textContent = (ape || nom) ? `${ape}, ${nom}` : 'NOMBRES Y APELLIDOS';
    if (fcCargo) fcCargo.textContent = cargo || 'CARGO DEL COLABORADOR';
    if (fcArea) fcArea.textContent = area || 'OPERACIONES';
    if (fcDni) fcDni.textContent = `DNI: ${dni}`;

    // Render QR
    var qrContainer = document.getElementById('fc-qrcode');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        var qrData = `AZKELL|DNI:${dni}|COLABORADOR:${nom} ${ape}|CARGO:${cargo}|VALIDO:ACTIVO`;
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: qrData,
                width: 90,
                height: 90,
                colorDark: '#0f172a',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        } else {
            qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(qrData)}" style="width:90px;height:90px;" alt="QR">`;
        }
    }
};

window.rrhhPersonalImprimirFotocheck = function() {
    window.rrhhPersonalActualizarFotocheckPreview();
    var card = document.getElementById('fotocheck-card-render');
    if (!card) return;

    var win = window.open('', '_blank', 'width=800,height=700');
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Fotocheck Oficial - ${document.getElementById('pers-num-doc')?.value || 'Personal'}</title>
            <style>
                body {
                    margin: 0;
                    padding: 40px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: #f1f5f9;
                    font-family: system-ui, -apple-system, sans-serif;
                }
                .print-container {
                    background: #ffffff;
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }
                ${document.querySelector('style')?.innerHTML || ''}
                @media print {
                    body { background: #ffffff; padding: 0; }
                    .print-container { box-shadow: none; padding: 0; }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="margin-bottom: 20px;">
                <button onclick="window.print()" style="padding: 10px 24px; font-weight: bold; background: #0284c7; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 15px;">
                    🖨️ Imprimir Fotocheck
                </button>
            </div>
            <div class="print-container">
                ${card.outerHTML}
            </div>
        </body>
        </html>
    `);
    win.document.close();
    setTimeout(() => { win.focus(); }, 300);
};

// ── Modal Form: Apertura y Relleno ─────────────────────────────────────
window.rrhhPersonalAbrirModalNuevo = function() {
    var form = document.getElementById('formPersonal');
    if (form) form.reset();

    window._rrhhFotoBase64 = null;
    var idEl = document.getElementById('pers-id');
    if (idEl) idEl.value = '';

    var lblT = document.getElementById('modalPersonalFormLabel');
    if (lblT) lblT.textContent = 'Nuevo Colaborador';

    var lblS = document.getElementById('modalPersonalFormSub');
    if (lblS) lblS.textContent = 'Legajo Digital 360°';

    var hint = document.getElementById('pers-doc-hint');
    if (hint) hint.innerHTML = '<i class="bi bi-magic text-primary me-1"></i> Digite el DNI para autocompletar nombres.';

    var fIng = document.getElementById('pers-fecha-ingreso');
    if (fIng) fIng.value = new Date().toISOString().slice(0, 10);

    var fIniCont = document.getElementById('pers-inicio-contrato');
    if (fIniCont) fIniCont.value = new Date().toISOString().slice(0, 10);

    var prevFoto = document.getElementById('pers-foto-preview');
    if (prevFoto) prevFoto.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 24 24' fill='%23cbd5e1'><circle cx='12' cy='8' r='4'/><path d='M12 14c-6.1 0-8 4-8 4v2h16v-2s-1.9-4-8-4z'/></svg>";

    window.rrhhPersonalSwitchTab('tab-pers-identidad');
    window.rrhhPersonalOnTipoContratoChange('PLAZO_FIJO');
    window.rrhhPersonalOnAreaChange('OPERACIONES');

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalPersonalForm'));
    modal.show();
};

window.rrhhPersonalAbrirModalEditar = function(id) {
    var p = window._rrhhPersonalList.find(x => x.id == id);
    if (!p) return;

    window._rrhhFotoBase64 = null;
    var idEl = document.getElementById('pers-id');
    if (idEl) idEl.value = p.id;

    var lblT = document.getElementById('modalPersonalFormLabel');
    if (lblT) lblT.textContent = `Editar Colaborador — ${p.apellidos}, ${p.nombres}`;

    var setVal = function(elemId, val) {
        var el = document.getElementById(elemId);
        if (el) el.value = val || '';
    };

    setVal('pers-tipo-doc', p.tipo_documento || 'DNI');
    setVal('pers-num-doc', p.numero_documento);
    setVal('pers-nombres', p.nombres);
    setVal('pers-apellidos', p.apellidos);
    setVal('pers-sexo', p.sexo || 'M');
    setVal('pers-fecha-nac', p.fecha_nacimiento ? p.fecha_nacimiento.slice(0, 10) : '');
    setVal('pers-telefono', p.telefono);
    setVal('pers-email', p.email);
    setVal('pers-direccion', p.direccion);
    setVal('pers-contacto-emergencia', p.contacto_emergencia_nombre ? `${p.contacto_emergencia_nombre} (${p.contacto_emergencia_parentesco || ''}) ${p.contacto_emergencia_telefono || ''}` : '');

    setVal('pers-area', p.area || 'OPERACIONES');
    setVal('pers-rol', p.categoria_rol);
    setVal('pers-cargo', p.cargo);
    setVal('pers-sede', p.sede || 'BASE PRINCIPAL');
    setVal('pers-centro-costo', p.centro_costo_codigo || 'CC-300');
    setVal('pers-fecha-ingreso', p.fecha_ingreso ? p.fecha_ingreso.slice(0, 10) : '');

    setVal('pers-tipo-contrato', p.tipo_contrato || 'PLAZO_FIJO');
    setVal('pers-inicio-contrato', p.fecha_inicio_contrato ? p.fecha_inicio_contrato.slice(0, 10) : '');
    setVal('pers-fin-contrato', p.fecha_fin_contrato ? p.fecha_fin_contrato.slice(0, 10) : '');
    setVal('pers-sueldo', parseFloat(p.sueldo_basico || 0).toFixed(2));
    setVal('pers-bono', parseFloat(p.bono_fijo || 0).toFixed(2));
    setVal('pers-asig-familiar', p.tiene_asignacion_familiar ? '1' : '0');
    setVal('pers-regimen-pension', p.regimen_pensionario || 'ONP');
    setVal('pers-cuspp', p.cuspp);
    setVal('pers-banco-haberes', p.banco_haberes || 'BCP');
    setVal('pers-cuenta-haberes', p.cuenta_haberes);
    setVal('pers-cci-haberes', p.cci_haberes);

    setVal('pers-grupo-sanguineo', p.grupo_sanguineo || 'O+');
    setVal('pers-licencia-num', p.licencia_conducir);
    setVal('pers-licencia-cat', p.licencia_categoria || 'A-IIIC');
    setVal('pers-licencia-venc', p.licencia_vencimiento ? p.licencia_vencimiento.slice(0, 10) : '');
    setVal('pers-sctr-salud', p.sctr_salud_vigente ? '1' : '0');
    setVal('pers-sctr-pension', p.sctr_pension_vigente ? '1' : '0');
    setVal('pers-emo-condicion', p.emo_condicion || 'APTO');

    setVal('pers-talla-polo', p.talla_polo || 'M');
    setVal('pers-talla-pantalon', p.talla_pantalon || '32');
    setVal('pers-talla-calzado', p.talla_calzado || '41');
    setVal('pers-talla-chaleco', p.talla_chaleco || 'ESTANDAR');

    var prevFoto = document.getElementById('pers-foto-preview');
    if (prevFoto) prevFoto.src = p.foto_url || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 24 24' fill='%23cbd5e1'><circle cx='12' cy='8' r='4'/><path d='M12 14c-6.1 0-8 4-8 4v2h16v-2s-1.9-4-8-4z'/></svg>";

    window.rrhhPersonalToggleRol(p.categoria_rol);
    window.rrhhPersonalOnTipoContratoChange(p.tipo_contrato || 'PLAZO_FIJO');
    window.rrhhPersonalSwitchTab('tab-pers-identidad');

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalPersonalForm'));
    modal.show();
};

window.rrhhPersonalGuardar = async function(e) {
    if (e) e.preventDefault();

    var btn = document.getElementById('pers-btn-guardar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...'; }

    var id = (document.getElementById('pers-id')?.value || '').trim();
    var esEdicion = !!id;

    var payload = {
        tipo_documento: document.getElementById('pers-tipo-doc')?.value,
        numero_documento: document.getElementById('pers-num-doc')?.value,
        nombres: document.getElementById('pers-nombres')?.value,
        apellidos: document.getElementById('pers-apellidos')?.value,
        sexo: document.getElementById('pers-sexo')?.value,
        fecha_nacimiento: document.getElementById('pers-fecha-nac')?.value || null,
        telefono: document.getElementById('pers-telefono')?.value,
        email: document.getElementById('pers-email')?.value,
        direccion: document.getElementById('pers-direccion')?.value,
        contacto_emergencia_nombre: document.getElementById('pers-contacto-emergencia')?.value,
        
        area: document.getElementById('pers-area')?.value,
        categoria_rol: document.getElementById('pers-rol')?.value,
        cargo: document.getElementById('pers-cargo')?.value,
        sede: document.getElementById('pers-sede')?.value,
        centro_costo_codigo: document.getElementById('pers-centro-costo')?.value,
        fecha_ingreso: document.getElementById('pers-fecha-ingreso')?.value,
        
        tipo_contrato: document.getElementById('pers-tipo-contrato')?.value,
        fecha_inicio_contrato: document.getElementById('pers-inicio-contrato')?.value || null,
        fecha_fin_contrato: document.getElementById('pers-fin-contrato')?.value || null,
        sueldo_basico: document.getElementById('pers-sueldo')?.value || '0',
        bono_fijo: document.getElementById('pers-bono')?.value || '0',
        tiene_asignacion_familiar: document.getElementById('pers-asig-familiar')?.value,
        regimen_pensionario: document.getElementById('pers-regimen-pension')?.value,
        cuspp: document.getElementById('pers-cuspp')?.value,
        banco_haberes: document.getElementById('pers-banco-haberes')?.value,
        cuenta_haberes: document.getElementById('pers-cuenta-haberes')?.value,
        cci_haberes: document.getElementById('pers-cci-haberes')?.value,
        
        grupo_sanguineo: document.getElementById('pers-grupo-sanguineo')?.value,
        licencia_conducir: document.getElementById('pers-licencia-num')?.value,
        licencia_categoria: document.getElementById('pers-licencia-cat')?.value,
        licencia_vencimiento: document.getElementById('pers-licencia-venc')?.value || null,
        sctr_salud_vigente: document.getElementById('pers-sctr-salud')?.value,
        sctr_pension_vigente: document.getElementById('pers-sctr-pension')?.value,
        emo_condicion: document.getElementById('pers-emo-condicion')?.value,
        
        talla_polo: document.getElementById('pers-talla-polo')?.value,
        talla_pantalon: document.getElementById('pers-talla-pantalon')?.value,
        talla_calzado: document.getElementById('pers-talla-calzado')?.value,
        talla_chaleco: document.getElementById('pers-talla-chaleco')?.value
    };

    try {
        var url = esEdicion ? `/api/rrhh/personal/${id}` : `/api/rrhh/personal`;
        var method = esEdicion ? 'PUT' : 'POST';

        var res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var json = await res.json();

        if (json && json.ok) {
            if (typeof window.rotToast === 'function') {
                window.rotToast(esEdicion ? '✨ Colaborador actualizado con éxito' : '✨ Colaborador registrado con éxito', 'bg-success');
            } else {
                alert(esEdicion ? '¡Colaborador actualizado con éxito!' : '¡Colaborador registrado con éxito!');
            }
            var modal = bootstrap.Modal.getInstance(document.getElementById('modalPersonalForm'));
            if (modal) modal.hide();
            window.rrhhPersonalCargarListado();
        } else {
            alert(json.error || 'No se pudo guardar el registro');
        }
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Guardar Colaborador'; }
    }
};

window.rrhhPersonalEliminar = async function(id) {
    if (!confirm('¿Está seguro de eliminar a este colaborador del sistema?')) return;
    try {
        var res = await fetch(`/api/rrhh/personal/${id}`, { method: 'DELETE' });
        var json = await res.json();
        if (json && json.ok) {
            if (typeof window.rotToast === 'function') window.rotToast('Colaborador eliminado', 'bg-info');
            window.rrhhPersonalCargarListado();
        } else {
            alert(json.error || 'No se pudo eliminar');
        }
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

// ── Exportación a Excel con Listas Desplegables Nativas ─────────────────
window.rrhhPersonalExportarExcel = async function() {
    if (typeof XLSX === 'undefined') {
        if (typeof window.loadLazyLib === 'function') {
            await window.loadLazyLib('xlsx');
        }
    }

    if (typeof XLSX === 'undefined') {
        alert('La librería Excel aún se está cargando. Por favor, intente en unos segundos.');
        return;
    }

    var lista = window._rrhhPersonalList || [];
    if (lista.length === 0) {
        alert('No hay datos de colaboradores para exportar.');
        return;
    }

    // Cabeceras enriquecidas
    var headers = [
        'ID', 'TIPO DOC', 'N° DOCUMENTO', 'APELLIDOS', 'NOMBRES', 'GÉNERO', 'FECHA NACIMIENTO',
        'TELÉFONO', 'CORREO ELECTRÓNICO', 'DIRECCIÓN', 'ÁREA OPERATIVA', 'ROL / CATEGORÍA',
        'CARGO / PUESTO', 'CENTRO DE COSTOS', 'SEDE / BASE', 'FECHA INGRESO', 'TIPO CONTRATO',
        'INICIO CONTRATO', 'FIN CONTRATO', 'ESTADO CONTRATO', 'SUELDO BÁSICO (S/)', 'ASIG. FAMILIAR (S/)', 'BONO FIJO (S/)',
        'RÉGIMEN PENSIÓN', 'COMISIÓN AFP', 'CUSPP', 'BANCO HABERES', 'CUENTA SUELDO', 'CCI HABERES',
        'BANCO CTS', 'CUENTA CTS', 'GRUPO SANGUÍNEO', 'N° LICENCIA', 'CAT. LICENCIA', 'VENC. LICENCIA',
        'SCTR SALUD', 'SCTR PENSIÓN', 'CONDICIÓN EMO', 'VENC. EMO', 'TALLA POLO', 'TALLA PANTALÓN',
        'TALLA CALZADO', 'TALLA CHALECO', 'CONTACTO EMERGENCIA', 'ESTADO'
    ];

    var rows = lista.map(function(p) {
        var estContrato = 'VIGENTE';
        if (p.tipo_contrato === 'INDETERMINADO') {
            estContrato = 'INDETERMINADO';
        } else if (p.fecha_fin_contrato) {
            var fFin = new Date(p.fecha_fin_contrato);
            var hoy = new Date();
            var diffDias = Math.ceil((fFin - hoy) / (1000 * 60 * 60 * 24));
            if (diffDias < 0) estContrato = `VENCIDO (${Math.abs(diffDias)}d)`;
            else if (diffDias <= 30) estContrato = `VENCE EN ${diffDias}D`;
            else estContrato = 'VIGENTE';
        }

        return [
            p.id,
            p.tipo_documento || 'DNI',
            p.numero_documento || '',
            p.apellidos || '',
            p.nombres || '',
            p.sexo || 'M',
            p.fecha_nacimiento ? p.fecha_nacimiento.slice(0, 10) : '',
            p.telefono || '',
            p.email || '',
            p.direccion || '',
            p.area || 'OPERACIONES',
            p.categoria_rol || 'ADMINISTRATIVO',
            p.cargo || '',
            p.centro_costo_codigo || 'CC-100',
            p.sede || 'BASE PRINCIPAL',
            p.fecha_ingreso ? p.fecha_ingreso.slice(0, 10) : '',
            p.tipo_contrato || 'PLAZO_FIJO',
            p.fecha_inicio_contrato ? p.fecha_inicio_contrato.slice(0, 10) : '',
            p.fecha_fin_contrato ? p.fecha_fin_contrato.slice(0, 10) : '',
            estContrato,
            parseFloat(p.sueldo_basico || 0),
            p.tiene_asignacion_familiar ? 113.00 : 0.00,
            parseFloat(p.bono_fijo || 0),
            p.regimen_pensionario || 'ONP',
            p.tipo_comision_afp || 'FLUJO',
            p.cuspp || '',
            p.banco_haberes || 'BCP',
            p.cuenta_haberes || '',
            p.cci_haberes || '',
            p.banco_cts || '',
            p.cuenta_cts || '',
            p.grupo_sanguineo || 'O+',
            p.licencia_conducir || '',
            p.licencia_categoria || '',
            p.licencia_vencimiento ? p.licencia_vencimiento.slice(0, 10) : '',
            p.sctr_salud_vigente ? 'ACTIVO' : 'NO CUBIERTO',
            p.sctr_pension_vigente ? 'ACTIVO' : 'NO CUBIERTO',
            p.emo_condicion || 'APTO',
            p.talla_polo || 'M',
            p.talla_pantalon || '32',
            p.talla_calzado || '41',
            p.talla_chaleco || 'ESTANDAR'
        ];
    });

    var wsData = [headers].concat(rows);
    var ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ajustar anchos de columnas
    var colWidths = headers.map(function(h) {
        return { wch: Math.max(h.length + 4, 14) };
    });
    ws['!cols'] = colWidths;

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Personal_Legajos_360');

    var fechaHoy = new Date().toISOString().slice(0, 10);
    var nombreArchivo = `RRHH_Gestion_Personal_Legajos_${fechaHoy}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);

    if (typeof window.rotToast === 'function') {
        window.rotToast('📥 Archivo Excel generado con éxito', 'bg-success');
    }
};

// ── Ficha 360° Visualización Detallada ─────────────────────────────────
// ── Ficha 360° Visualización Detallada (Formato Oficial Documentario A4) ───
window._rrhhColaboradorFichaActual = null;

window.rrhhPersonalVerFicha = async function(id) {
    try {
        var res = await fetch(`/api/rrhh/personal/${id}`);
        var json = await res.json();
        if (!json || !json.ok || !json.data) return;

        var p = json.data;
        window._rrhhColaboradorFichaActual = p;

        var elNom = document.getElementById('ficha-nombre');
        var elCar = document.getElementById('ficha-cargo');
        var elAv = document.getElementById('ficha-avatar');
        var elBody = document.getElementById('ficha-body');

        if (elNom) elNom.textContent = `${p.apellidos}, ${p.nombres}`;
        if (elCar) elCar.textContent = `${p.cargo} — ${p.area || 'OPERACIONES'}`;
        if (elAv) elAv.textContent = (p.nombres.charAt(0) + (p.apellidos.charAt(0) || '')).toUpperCase();

        var empNombre = (localStorage.getItem('fleet_empresa_nombre') || 'AZKELL TRANSPORTES S.A.C.').toUpperCase();
        var empLogo = localStorage.getItem('fleet_empresa_logo') || document.getElementById('nav-logo-img')?.src || '/favicon-2003.png';
        var fotoSrc = p.foto_url || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='150' viewBox='0 0 24 24' fill='%23cbd5e1'><circle cx='12' cy='8' r='4'/><path d='M12 14c-6.1 0-8 4-8 4v2h16v-2s-1.9-4-8-4z'/></svg>";

        var fechaEmision = p.fecha_ingreso ? p.fecha_ingreso.slice(0, 10) : new Date().toISOString().slice(0, 10);

        var docHtml = `
            <div class="ficha-paper-container" id="ficha-print-area">
                
                <!-- Encabezado Documentario -->
                <table class="ficha-doc-header">
                    <tr>
                        <td style="width: 25%; text-align: center; background: #ffffff;">
                            <img src="${empLogo}" alt="Logo Empresa" style="max-height: 48px; max-width: 170px; object-fit: contain;">
                            <div style="font-size: 0.72rem; font-weight: 800; color: #334155; margin-top: 4px;">${empNombre}</div>
                        </td>
                        <td style="width: 50%; text-align: center;">
                            <div class="ficha-doc-title">FICHA DE REGISTRO<br>DE INGRESO DE PERSONAL</div>
                        </td>
                        <td style="width: 25%; padding: 0;">
                            <table class="ficha-doc-meta-table">
                                <tr>
                                    <td class="ficha-doc-lbl" style="width: 45%;">Registro</td>
                                    <td class="ficha-doc-val">RH 004</td>
                                </tr>
                                <tr>
                                    <td class="ficha-doc-lbl">Versión</td>
                                    <td class="ficha-doc-val">1</td>
                                </tr>
                                <tr>
                                    <td class="ficha-doc-lbl">Fecha</td>
                                    <td class="ficha-doc-val font-monospace">${fechaEmision}</td>
                                </tr>
                                <tr>
                                    <td class="ficha-doc-lbl">Página</td>
                                    <td class="ficha-doc-val">1 de 1</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>

                <div class="ficha-doc-main-sub">FICHA PERSONAL</div>

                <!-- A) DATOS PERSONALES -->
                <div class="ficha-doc-section-head">A) DATOS PERSONALES</div>
                <table class="ficha-doc-table">
                    <tr>
                        <td class="ficha-doc-lbl">Nombre Completo:</td>
                        <td class="ficha-doc-val fw-bold" colspan="3" style="font-size: 0.88rem; color: #0284c7;">${p.apellidos}, ${p.nombres}</td>
                        <td rowspan="6" style="width: 130px; text-align: center; vertical-align: middle; background: #fafafa; padding: 4px;">
                            <div class="ficha-doc-photo-box">
                                <img src="${fotoSrc}" alt="Foto ${p.nombres}">
                            </div>
                            <small class="text-muted d-block mt-1" style="font-size: 0.65rem; font-weight: bold;">FOTO OFICIAL</small>
                        </td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">DNI / Documento:</td>
                        <td class="ficha-doc-val font-monospace fw-bold">${p.numero_documento}</td>
                        <td class="ficha-doc-lbl">Fecha Nacimiento:</td>
                        <td class="ficha-doc-val font-monospace">${p.fecha_nacimiento ? p.fecha_nacimiento.slice(0, 10) : '—'}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Nacionalidad:</td>
                        <td class="ficha-doc-val">${p.nacionalidad || 'PERUANA'}</td>
                        <td class="ficha-doc-lbl">Estado Civil:</td>
                        <td class="ficha-doc-val">${p.estado_civil || 'SOLTERO(A)'}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Dirección:</td>
                        <td class="ficha-doc-val" colspan="3">${p.direccion || '—'}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Distrito / Prov:</td>
                        <td class="ficha-doc-val">${p.distrito || '—'} / ${p.provincia || '—'}</td>
                        <td class="ficha-doc-lbl">Teléfono / Celular:</td>
                        <td class="ficha-doc-val font-monospace">${p.telefono || '—'}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Correo Electrónico:</td>
                        <td class="ficha-doc-val" colspan="3">${p.email || '—'}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">AFP / ONP:</td>
                        <td class="ficha-doc-val fw-bold">${p.regimen_pensionario || 'ONP'}</td>
                        <td class="ficha-doc-lbl">Comisión AFP:</td>
                        <td class="ficha-doc-val" colspan="2">${p.tipo_comision_afp || 'FLUJO'} &nbsp;|&nbsp; <strong>CUSPP:</strong> <span class="font-monospace">${p.cuspp || '—'}</span></td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Especifique Tallas:</td>
                        <td class="ficha-doc-val" colspan="4">
                            <strong>Zapato/Calzado:</strong> ${p.talla_calzado || '41'} &nbsp;&nbsp;|&nbsp;&nbsp; 
                            <strong>Camisa/Polo:</strong> ${p.talla_polo || 'M'} &nbsp;&nbsp;|&nbsp;&nbsp; 
                            <strong>Pantalón:</strong> ${p.talla_pantalon || '32'} &nbsp;&nbsp;|&nbsp;&nbsp; 
                            <strong>Chaleco:</strong> ${p.talla_chaleco || 'ESTÁNDAR'}
                        </td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">¿Tiene Hijos? / Asig. Fam:</td>
                        <td class="ficha-doc-val" colspan="4">
                            <span class="badge ${p.tiene_asignacion_familiar ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-light text-dark border'} fw-bold me-2">
                                ${p.tiene_asignacion_familiar ? 'SÍ (Percibe S/ 113.00 de Asignación Familiar)' : 'NO APLICA'}
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Contacto de Emergencia:</td>
                        <td class="ficha-doc-val" colspan="4">
                            <strong>Nombre:</strong> ${p.contacto_emergencia_nombre || '—'} &nbsp;&nbsp;|&nbsp;&nbsp;
                            <strong>Parentesco:</strong> ${p.contacto_emergencia_parentesco || '—'} &nbsp;&nbsp;|&nbsp;&nbsp;
                            <strong>Teléfono:</strong> <span class="font-monospace">${p.contacto_emergencia_telefono || '—'}</span>
                        </td>
                    </tr>
                </table>

                <!-- B) DATOS LABORALES, CONTRATO Y CENTRO DE COSTOS -->
                <div class="ficha-doc-section-head">B) DATOS LABORALES, CONTRATO Y CENTRO DE COSTOS</div>
                <table class="ficha-doc-table">
                    <tr>
                        <td class="ficha-doc-lbl">Cargo / Puesto:</td>
                        <td class="ficha-doc-val fw-bold">${p.cargo}</td>
                        <td class="ficha-doc-lbl">Área Operativa:</td>
                        <td class="ficha-doc-val">${p.area || 'OPERACIONES'}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Rol / Categoría:</td>
                        <td class="ficha-doc-val">${p.categoria_rol ? p.categoria_rol.replace('_', ' ') : '—'}</td>
                        <td class="ficha-doc-lbl">Centro de Costos:</td>
                        <td class="ficha-doc-val font-monospace fw-bold text-primary">${p.centro_costo_codigo || 'CC-100'}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Sede / Base:</td>
                        <td class="ficha-doc-val">${p.sede || 'BASE PRINCIPAL'}</td>
                        <td class="ficha-doc-lbl">Fecha de Ingreso:</td>
                        <td class="ficha-doc-val font-monospace fw-bold">${p.fecha_ingreso ? p.fecha_ingreso.slice(0, 10) : '—'}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Tipo de Contrato:</td>
                        <td class="ficha-doc-val fw-bold">${p.tipo_contrato || 'PLAZO_FIJO'}</td>
                        <td class="ficha-doc-lbl">Vigencia Contrato:</td>
                        <td class="ficha-doc-val font-monospace">
                            ${p.fecha_inicio_contrato ? p.fecha_inicio_contrato.slice(0, 10) : '—'} al 
                            ${p.fecha_fin_contrato ? p.fecha_fin_contrato.slice(0, 10) : (p.tipo_contrato === 'INDETERMINADO' ? 'INDETERMINADO' : '—')}
                        </td>
                    </tr>
                </table>

                <!-- C) PLANILLAS, REMUNERACIONES Y CUENTAS BANCARIAS -->
                <div class="ficha-doc-section-head">C) PLANILLAS, REMUNERACIONES Y CUENTAS BANCARIAS</div>
                <table class="ficha-doc-table">
                    <tr>
                        <td class="ficha-doc-lbl">Sueldo Básico:</td>
                        <td class="ficha-doc-val font-monospace fw-bold text-success">S/ ${parseFloat(p.sueldo_basico || 0).toFixed(2)}</td>
                        <td class="ficha-doc-lbl">Asignación Familiar:</td>
                        <td class="ficha-doc-val font-monospace">${p.tiene_asignacion_familiar ? 'S/ 113.00' : 'S/ 0.00'}</td>
                        <td class="ficha-doc-lbl">Bono Fijo:</td>
                        <td class="ficha-doc-val font-monospace">S/ ${parseFloat(p.bono_fijo || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Banco Haberes:</td>
                        <td class="ficha-doc-val fw-bold">${p.banco_haberes || 'BCP'}</td>
                        <td class="ficha-doc-lbl">N° Cuenta Sueldo:</td>
                        <td class="ficha-doc-val font-monospace">${p.cuenta_haberes || '—'}</td>
                        <td class="ficha-doc-lbl">CCI Haberes:</td>
                        <td class="ficha-doc-val font-monospace">${p.cci_haberes || '—'}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Banco Depósito CTS:</td>
                        <td class="ficha-doc-val fw-bold">${p.banco_cts || '—'}</td>
                        <td class="ficha-doc-lbl">N° Cuenta CTS:</td>
                        <td class="ficha-doc-val font-monospace" colspan="3">${p.cuenta_cts || '—'}</td>
                    </tr>
                </table>

                <!-- D) SEGURIDAD Y SALUD EN EL TRABAJO (SST) & CONDUCCIÓN -->
                <div class="ficha-doc-section-head">D) SEGURIDAD Y SALUD EN EL TRABAJO (SST) & CONDUCCIÓN</div>
                <table class="ficha-doc-table">
                    <tr>
                        <td class="ficha-doc-lbl">Grupo Sanguíneo:</td>
                        <td class="ficha-doc-val fw-bold text-danger">${p.grupo_sanguineo || 'O+'}</td>
                        <td class="ficha-doc-lbl">Brevete MTC:</td>
                        <td class="ficha-doc-val font-monospace fw-bold">${p.licencia_conducir || 'N/A'} (Cat: ${p.licencia_categoria || '---'})</td>
                        <td class="ficha-doc-lbl">Venc. Brevete:</td>
                        <td class="ficha-doc-val font-monospace">${p.licencia_vencimiento ? p.licencia_vencimiento.slice(0, 10) : '—'}</td>
                    </tr>
                    <tr>
                        <td class="ficha-doc-lbl">Póliza SCTR Salud:</td>
                        <td class="ficha-doc-val fw-bold ${p.sctr_salud_vigente ? 'text-success' : 'text-danger'}">${p.sctr_salud_vigente ? 'VIGENTE' : 'NO CUBIERTO'}</td>
                        <td class="ficha-doc-lbl">Póliza SCTR Pensión:</td>
                        <td class="ficha-doc-val fw-bold ${p.sctr_pension_vigente ? 'text-success' : 'text-danger'}">${p.sctr_pension_vigente ? 'VIGENTE' : 'NO CUBIERTO'}</td>
                        <td class="ficha-doc-lbl">Examen Médico EMO:</td>
                        <td class="ficha-doc-val"><strong>${p.emo_condicion || 'APTO'}</strong> (${p.emo_fecha_vencimiento ? p.emo_fecha_vencimiento.slice(0, 10) : '—'})</td>
                    </tr>
                </table>

                <!-- Firmas y Declaración -->
                <div style="margin-top: 25px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
                    <p style="font-size: 0.68rem; color: #64748b; text-align: justify; margin-bottom: 20px;">
                        Declaro bajo juramento que toda la información consignada en la presente Ficha de Registro de Personal es verídica y autorizo a la empresa a su verificación correspondiente conforme a las normativas laborales vigentes.
                    </p>
                    <table style="width: 100%; margin-top: 20px;">
                        <tr>
                            <td style="width: 40%; text-align: center; vertical-align: bottom;">
                                <div class="ficha-sign-line">
                                    FIRMA DEL COLABORADOR<br>
                                    <span style="font-size: 0.7rem; font-weight: normal;">DNI: ${p.numero_documento}</span>
                                </div>
                            </td>
                            <td style="width: 20%; text-align: center; vertical-align: middle;">
                                <div class="ficha-huella-box">
                                    HUELLA<br>DIGITAL
                                </div>
                            </td>
                            <td style="width: 40%; text-align: center; vertical-align: bottom;">
                                <div class="ficha-sign-line">
                                    RECURSOS HUMANOS / GERENCIA<br>
                                    <span style="font-size: 0.7rem; font-weight: normal;">${empNombre}</span>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>

            </div>
        `;

        if (elBody) {
            elBody.innerHTML = docHtml;
        }

        var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalPersonalFicha'));
        modal.show();
    } catch(err) {
        console.error('Error abriendo Ficha 360:', err);
    }
};

window.rrhhPersonalAbrirModalEditarDesdeFicha = function() {
    if (window._rrhhColaboradorFichaActual && window._rrhhColaboradorFichaActual.id) {
        var modalFicha = bootstrap.Modal.getInstance(document.getElementById('modalPersonalFicha'));
        if (modalFicha) modalFicha.hide();
        window.rrhhPersonalAbrirModalEditar(window._rrhhColaboradorFichaActual.id);
    }
};

window.rrhhPersonalImprimirFicha = function() {
    var content = document.getElementById('ficha-print-area');
    if (!content) return;

    var empNombre = (localStorage.getItem('fleet_empresa_nombre') || 'AZKELL TRANSPORTES S.A.C.').toUpperCase();
    var p = window._rrhhColaboradorFichaActual || {};
    var dni = p.numero_documento || 'Colaborador';

    var win = window.open('', '_blank', 'width=950,height=800');
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ficha de Registro de Ingreso - ${dni}</title>
            <style>
                @page {
                    size: A4 portrait;
                    margin: 12mm 15mm 12mm 15mm;
                }
                body {
                    margin: 0;
                    padding: 20px;
                    background: #f1f5f9;
                    font-family: Arial, Helvetica, sans-serif;
                    color: #0f172a;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .print-toolbar {
                    text-align: center;
                    margin-bottom: 20px;
                }
                .btn-print {
                    background: #0284c7;
                    color: #ffffff;
                    border: none;
                    padding: 10px 24px;
                    font-size: 15px;
                    font-weight: bold;
                    border-radius: 8px;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
                }
                ${document.querySelector('style')?.innerHTML || ''}
                @media print {
                    body { background: #ffffff; padding: 0; }
                    .print-toolbar { display: none !important; }
                    .ficha-paper-container { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: 100% !important; }
                }
            </style>
        </head>
        <body>
            <div class="print-toolbar">
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir Ficha / Guardar como PDF</button>
            </div>
            ${content.outerHTML}
        </body>
        </html>
    `);
    win.document.close();
    setTimeout(() => { win.focus(); }, 300);
};

// ── Inicialización Automática ──────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.init_rrhh_personal);
} else {
    window.init_rrhh_personal();
}
