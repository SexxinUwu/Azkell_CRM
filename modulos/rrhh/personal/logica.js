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
        var base64 = evt.target.result;
        window._rrhhFotoBase64 = base64;
        
        var hid = document.getElementById('pers-foto-url');
        if (hid) hid.value = base64;
        
        var prev1 = document.getElementById('pers-foto-preview');
        var prev2 = document.getElementById('pers-foto-preview-fc');
        var fcAvatar = document.getElementById('fc-avatar');
        
        if (prev1) prev1.src = base64;
        if (prev2) prev2.src = base64;
        if (fcAvatar) fcAvatar.src = base64;
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

    var hidFoto = document.getElementById('pers-foto-url');
    if (hidFoto) hidFoto.value = '';

    var inpFoto1 = document.getElementById('pers-foto-input');
    if (inpFoto1) inpFoto1.value = '';
    var inpFoto2 = document.getElementById('pers-foto-input-fc');
    if (inpFoto2) inpFoto2.value = '';

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

    var defaultSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 24 24' fill='%23cbd5e1'><circle cx='12' cy='8' r='4'/><path d='M12 14c-6.1 0-8 4-8 4v2h16v-2s-1.9-4-8-4z'/></svg>";
    var prevFoto = document.getElementById('pers-foto-preview');
    var prevFc = document.getElementById('pers-foto-preview-fc');
    var fcAvatar = document.getElementById('fc-avatar');
    if (prevFoto) prevFoto.src = defaultSvg;
    if (prevFc) prevFc.src = defaultSvg;
    if (fcAvatar) fcAvatar.src = defaultSvg;

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
    var prevFc = document.getElementById('pers-foto-preview-fc');
    var fcAvatar = document.getElementById('fc-avatar');
    window._rrhhFotoBase64 = p.foto_url || null;
    var defaultSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 24 24' fill='%23cbd5e1'><circle cx='12' cy='8' r='4'/><path d='M12 14c-6.1 0-8 4-8 4v2h16v-2s-1.9-4-8-4z'/></svg>";
    var fotoVal = p.foto_url || defaultSvg;
    if (prevFoto) prevFoto.src = fotoVal;
    if (prevFc) prevFc.src = fotoVal;
    if (fcAvatar) fcAvatar.src = fotoVal;
    var hidFoto = document.getElementById('pers-foto-url');
    if (hidFoto) hidFoto.value = p.foto_url || '';

    var inpFoto1 = document.getElementById('pers-foto-input');
    if (inpFoto1) inpFoto1.value = '';
    var inpFoto2 = document.getElementById('pers-foto-input-fc');
    if (inpFoto2) inpFoto2.value = '';

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
        talla_chaleco: document.getElementById('pers-talla-chaleco')?.value,
        foto_url: window._rrhhFotoBase64 || document.getElementById('pers-foto-url')?.value || null
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

// ── Ficha 360° Visualización Detallada (1:1 Idéntico a Checklist Unidades con Blob URL) ───
window._rrhhColaboradorFichaActual = null;

window.rrhhPersonalVerFicha = async function(id) {
    try {
        var res = await fetch(`/api/rrhh/personal/${id}`);
        var json = await res.json();
        if (!json || !json.ok || !json.data) {
            alert('No se pudo cargar la información del colaborador.');
            return;
        }

        var rec = json.data;
        window._rrhhColaboradorFichaActual = rec;

        var empNombre = (localStorage.getItem('fleet_empresa_nombre') || 'AZKELL TRANSPORTES S.A.C.').toUpperCase();
        var empLogoUrl = localStorage.getItem('fleet_empresa_logo') || document.getElementById('nav-logo-img')?.src || '';
        
        var fotoSrc = rec.foto_url || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='130' height='155' viewBox='0 0 24 24' fill='%2394a3b8'><circle cx='12' cy='8' r='4'/><path d='M12 14c-6.1 0-8 4-8 4v2h16v-2s-1.9-4-8-4z'/></svg>";
        var fechaEmision = rec.fecha_ingreso ? rec.fecha_ingreso.slice(0, 10) : new Date().toISOString().slice(0, 10);
        var rolTexto = (rec.categoria_rol || 'ADMINISTRATIVO').replace(/_/g, ' ');
        var docId = 'F-RH-' + (String(rec.id).padStart(4, '0'));

        var htmlBody = '';

        // Contenedor principal de la hoja (840px estándar de checklist)
        htmlBody += '<main class="report-page w-full max-w-[840px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-4 sm:p-5 text-slate-900 mx-auto" style="box-sizing:border-box;font-family:\'Inter\',-apple-system,BlinkMacSystemFont,sans-serif;">';

        // 1. ENCABEZADO OFICIAL CON LOGO, TÍTULO Y METADATOS
        htmlBody += '<header class="doc-grid-box rounded-lg overflow-hidden bg-white mb-2.5" style="border:1.5px solid #0F172A;">';
        htmlBody += '<div class="grid grid-cols-12 divide-x-[1.5px] divide-slate-900" style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));border-bottom:1.5px solid #0F172A;">';
        
        // Columna 1: Logo de Empresa
        htmlBody += '<div class="col-span-3 p-2.5 flex flex-col items-center justify-center bg-white text-center" style="grid-column:span 3 / span 3;border-right:1.5px solid #0F172A;">';
        if (empLogoUrl) {
            htmlBody += '<img src="' + empLogoUrl + '" style="max-height:38px;max-width:130px;object-fit:contain;">';
        } else {
            htmlBody += '<div class="flex items-center gap-1.5 mb-0.5"><span class="text-sm font-extrabold tracking-tight text-slate-900">' + empNombre + '</span></div>';
        }
        htmlBody += '<span class="text-[7.5px] font-semibold tracking-wider text-slate-500 uppercase mt-0.5">Transporte & Logística</span>';
        htmlBody += '</div>';

        // Columna 2: Título Central
        htmlBody += '<div class="col-span-6 p-2 flex flex-col items-center justify-center text-center bg-slate-50/50" style="grid-column:span 6 / span 6;border-right:1.5px solid #0F172A;">';
        htmlBody += '<h1 class="text-xs font-black text-slate-900 tracking-tight uppercase">FICHA DE REGISTRO DE PERSONAL</h1>';
        htmlBody += '<p class="text-[8.5px] font-bold text-slate-600 tracking-wider uppercase mt-0.5">CONTROL DE RRHH, PLANILLAS Y LEGAJO DIGITAL 360°</p>';
        htmlBody += '</div>';

        // Columna 3: Control Documentario
        htmlBody += '<div class="col-span-3 divide-y-[1.5px] divide-slate-900 text-[8.5px] font-bold" style="grid-column:span 3 / span 3;">';
        htmlBody += '<div class="px-2 py-0.5 flex justify-between bg-slate-50/70" style="border-bottom:1.5px solid #0F172A;"><span class="text-slate-500 uppercase">CÓDIGO:</span><span class="font-mono text-slate-900">RH-004</span></div>';
        htmlBody += '<div class="px-2 py-0.5 flex justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="text-slate-500 uppercase">VERSIÓN:</span><span class="font-mono text-slate-900">01</span></div>';
        htmlBody += '<div class="px-2 py-0.5 flex justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="text-slate-500 uppercase">F. EMISIÓN:</span><span class="font-mono text-slate-900">' + fechaEmision + '</span></div>';
        htmlBody += '<div class="px-2 py-0.5 flex justify-between bg-white"><span class="text-slate-500 uppercase">PÁGINA:</span><span class="font-mono text-slate-900">1 de 1</span></div>';
        htmlBody += '</div>';

        htmlBody += '</div>';

        // Matriz de Metadatos Inferior: 3 Columnas x 3 Filas
        htmlBody += '<div class="grid grid-cols-3 divide-x-[1.5px] divide-slate-900 text-[10.5px]" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));">';
        
        // Columna 1
        htmlBody += '<div class="divide-y-[1.5px] divide-slate-900" style="border-right:1.5px solid #0F172A;">';
        htmlBody += '<div class="px-2 py-1 flex items-center justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-700 text-[9.5px] uppercase">Nº EXPEDIENTE:</span><span class="font-mono font-bold text-[#0284C7] text-[11px]">' + docId + '</span></div>';
        htmlBody += '<div class="px-2 py-1 flex items-center justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-700 text-[9.5px] uppercase">COLABORADOR:</span><span class="font-bold text-slate-900 text-[10.5px] truncate max-w-[145px]">' + rec.apellidos + ', ' + rec.nombres + '</span></div>';
        htmlBody += '<div class="px-2 py-1 flex items-center justify-between bg-white"><span class="font-bold text-slate-700 text-[9.5px] uppercase">FECHA INGRESO:</span><span class="font-mono font-medium text-slate-900">' + fechaEmision + '</span></div>';
        htmlBody += '</div>';

        // Columna 2
        htmlBody += '<div class="divide-y-[1.5px] divide-slate-900" style="border-right:1.5px solid #0F172A;">';
        htmlBody += '<div class="px-2 py-1 flex items-center justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-700 text-[9.5px] uppercase">ROL / CATEGORÍA:</span><span class="font-bold text-slate-900 text-[10.5px] uppercase">' + rolTexto + '</span></div>';
        htmlBody += '<div class="px-2 py-1 flex items-center justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-700 text-[9.5px] uppercase">CARGO:</span><span class="font-bold text-slate-900 uppercase">' + rec.cargo + '</span></div>';
        htmlBody += '<div class="px-2 py-1 flex items-center justify-between bg-white"><span class="font-bold text-slate-700 text-[9.5px] uppercase">CENTRO COSTOS:</span><span class="font-mono font-bold text-blue-700">' + (rec.centro_costo_codigo || 'CC-100') + '</span></div>';
        htmlBody += '</div>';

        // Columna 3
        var estadoBadge = rec.estado === 'ACTIVO'
            ? '<span class="font-bold text-emerald-600 text-[10.5px] tracking-tight uppercase flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>ACTIVO</span>'
            : '<span class="font-bold text-slate-600 text-[10.5px] tracking-tight uppercase flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-slate-500 inline-block"></span>' + (rec.estado || 'INACTIVO') + '</span>';

        htmlBody += '<div class="divide-y-[1.5px] divide-slate-900">';
        htmlBody += '<div class="px-2 py-1 flex items-center justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-700 text-[9.5px] uppercase">TIPO CONTRATO:</span><span class="font-bold text-slate-900 text-[10.5px] uppercase">' + (rec.tipo_contrato || 'PLAZO_FIJO') + '</span></div>';
        htmlBody += '<div class="px-2 py-1 flex items-center justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-700 text-[9.5px] uppercase">SEDE / BASE:</span><span class="font-bold text-slate-900 truncate max-w-[130px]">' + (rec.sede || 'BASE PRINCIPAL') + '</span></div>';
        htmlBody += '<div class="px-2 py-1 flex items-center justify-between bg-emerald-50/50"><span class="font-bold text-slate-700 text-[9.5px] uppercase">ESTADO:</span>' + estadoBadge + '</div>';
        htmlBody += '</div>';

        htmlBody += '</div>';
        htmlBody += '</header>';

        // 2. SECCIÓN: DATOS PERSONALES & IDENTIDAD CON FOTO EN LA ESQUINA
        htmlBody += '<section class="mb-2.5 doc-grid-box rounded-lg overflow-hidden bg-white" style="border:1.5px solid #0F172A;">';
        htmlBody += '<div class="px-3 py-1 bg-slate-900 text-white flex items-center justify-between" style="background:#0F172A;">';
        htmlBody += '<div class="flex items-center gap-1.5">';
        htmlBody += '<svg class="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>';
        htmlBody += '<h2 class="text-[10.5px] font-bold uppercase tracking-wider text-white">Datos Personales & Identidad del Colaborador</h2>';
        htmlBody += '</div>';
        htmlBody += '<span class="text-[8.5px] font-medium text-slate-300 font-mono">LEGAJO PERSONAL 360°</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="grid grid-cols-12 divide-x-[1.5px] divide-slate-900 text-xs" style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));">';
        
        // Lado Izquierdo: Lista estructurada de datos personales (Col span 9)
        htmlBody += '<div class="col-span-9 p-2.5 bg-white divide-y divide-slate-100" style="grid-column:span 9 / span 9;border-right:1.5px solid #0F172A;">';
        
        var datosPersonales = [
            { label: 'Nombre Completo', val: '<strong class="text-slate-900">' + rec.apellidos + ', ' + rec.nombres + '</strong>' },
            { label: 'DNI / Documento', val: '<span class="font-mono font-bold text-blue-700">' + rec.numero_documento + '</span> (' + (rec.tipo_documento || 'DNI') + ')' },
            { label: 'Fecha Nacimiento / Edad', val: (rec.fecha_nacimiento ? rec.fecha_nacimiento.slice(0, 10) : '—') + ' &bull; Nacionalidad: ' + (rec.nacionalidad || 'PERUANA') },
            { label: 'Estado Civil', val: rec.estado_civil || 'SOLTERO(A)' },
            { label: 'Dirección Domiciliaria', val: rec.direccion || '—' },
            { label: 'Distrito / Provincia', val: (rec.distrito || '—') + ' / ' + (rec.provincia || '—') },
            { label: 'Teléfono / Celular', val: '<span class="font-mono">' + (rec.telefono || '—') + '</span>' },
            { label: 'Correo Electrónico', val: rec.email || '—' },
            { label: 'Asignación Familiar', val: rec.tiene_asignacion_familiar ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800">SÍ (S/ 113.00 ACTIVO)</span>' : '<span class="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-slate-100 text-slate-600">NO APLICA</span>' },
            { label: 'Contacto de Emergencia', val: (rec.contacto_emergencia_nombre || '—') + ' (' + (rec.contacto_emergencia_parentesco || '—') + ') &bull; Tel: <span class="font-mono font-bold">' + (rec.contacto_emergencia_telefono || '—') + '</span>' }
        ];

        datosPersonales.forEach(function(item) {
            htmlBody += '<div class="py-1 flex items-center justify-between text-[10px]">';
            htmlBody += '<span class="text-slate-500 font-bold uppercase tracking-tight">' + item.label + ':</span>';
            htmlBody += '<span class="text-slate-800 text-right">' + item.val + '</span>';
            htmlBody += '</div>';
        });

        htmlBody += '</div>';

        // Lado Derecho: Foto Oficial en la Esquina (Col span 3)
        htmlBody += '<div class="col-span-3 p-2.5 bg-slate-50/50 flex flex-col items-center justify-center text-center" style="grid-column:span 3 / span 3;">';
        htmlBody += '<div class="p-1 bg-white rounded-lg shadow-xs mb-1.5" style="border:1.5px solid #0F172A;">';
        htmlBody += '<img src="' + fotoSrc + '" alt="Foto de ' + rec.nombres + '" style="width:115px;height:140px;object-fit:cover;border-radius:4px;display:block;">';
        htmlBody += '</div>';
        htmlBody += '<span class="px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-slate-900 text-white">FOTO OFICIAL</span>';
        htmlBody += '</div>';

        htmlBody += '</div>';
        htmlBody += '</section>';

        // 3. SECCIÓN: DETALLE DE PLANILLA, BANCOS Y REMUNERACIÓN
        htmlBody += '<section class="mb-2.5 doc-grid-box rounded-lg overflow-hidden bg-white" style="border:1.5px solid #0F172A;">';
        htmlBody += '<div class="px-3 py-1 bg-slate-900 text-white flex items-center justify-between" style="background:#0F172A;">';
        htmlBody += '<div class="flex items-center gap-1.5">';
        htmlBody += '<svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
        htmlBody += '<h2 class="text-[10.5px] font-bold uppercase tracking-wider text-white">Detalle de Planilla, Bancos y Remuneración</h2>';
        htmlBody += '</div>';
        htmlBody += '<span class="text-[8.5px] font-medium text-slate-300 font-mono">HABERES & CTS</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="grid grid-cols-2 divide-x-[1.5px] divide-slate-900 text-xs" style="display:grid;grid-template-columns:1fr 1fr;">';
        
        // Columna Izquierda: Sueldo y Régimen de Pensión
        htmlBody += '<div class="p-2.5 bg-white space-y-1" style="border-right:1.5px solid #0F172A;">';
        htmlBody += '<div class="flex items-center justify-between p-1 rounded-md bg-emerald-50/60 border border-emerald-200">';
        htmlBody += '<span class="font-bold text-slate-700 text-[10px] uppercase">Sueldo Básico:</span>';
        htmlBody += '<span class="font-mono font-extrabold text-emerald-700 text-[12px]">S/ ' + parseFloat(rec.sueldo_basico || 0).toFixed(2) + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Bono Fijo Mensual:</span>';
        htmlBody += '<span class="font-mono font-bold text-slate-800">S/ ' + parseFloat(rec.bono_fijo || 0).toFixed(2) + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Régimen Pensionario:</span>';
        htmlBody += '<span class="font-bold text-slate-900">' + (rec.regimen_pensionario || 'ONP') + ' (' + (rec.tipo_comision_afp || 'FLUJO') + ')</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Código CUSPP:</span>';
        htmlBody += '<span class="font-mono font-bold text-slate-700">' + (rec.cuspp || '—') + '</span>';
        htmlBody += '</div>';
        htmlBody += '</div>';

        // Columna Derecha: Cuentas Bancarias y CTS
        htmlBody += '<div class="p-2.5 bg-white space-y-1">';
        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Banco Haberes (Sueldo):</span>';
        htmlBody += '<span class="font-bold text-slate-900">' + (rec.banco_haberes || 'BCP') + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">N° Cuenta Sueldo:</span>';
        htmlBody += '<span class="font-mono font-bold text-slate-800">' + (rec.cuenta_haberes || '—') + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Código Interbancario (CCI):</span>';
        htmlBody += '<span class="font-mono text-slate-700">' + (rec.cci_haberes || '—') + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Banco & Cuenta CTS:</span>';
        htmlBody += '<span class="font-mono font-bold text-slate-800">' + (rec.banco_cts || '—') + ' / ' + (rec.cuenta_cts || '—') + '</span>';
        htmlBody += '</div>';
        htmlBody += '</div>';

        htmlBody += '</div>';
        htmlBody += '</section>';

        // 4. SECCIÓN: SEGURIDAD SST, BREVETES MTC, SALUD EMO & DOTACIÓN EPP
        htmlBody += '<section class="mb-2.5 doc-grid-box rounded-lg overflow-hidden bg-white" style="border:1.5px solid #0F172A;">';
        htmlBody += '<div class="px-3 py-1 bg-slate-900 text-white flex items-center justify-between" style="background:#0F172A;">';
        htmlBody += '<div class="flex items-center gap-1.5">';
        htmlBody += '<svg class="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>';
        htmlBody += '<h2 class="text-[10.5px] font-bold uppercase tracking-wider text-white">Seguridad SST, Brevete MTC, Salud EMO & Dotación EPP</h2>';
        htmlBody += '</div>';
        htmlBody += '<span class="text-[8.5px] font-medium text-slate-300 font-mono">SST & OPERACIONES</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="grid grid-cols-2 divide-x-[1.5px] divide-slate-900 text-xs" style="display:grid;grid-template-columns:1fr 1fr;">';
        
        // Columna Izquierda: SST & Brevete
        htmlBody += '<div class="p-2.5 bg-white space-y-1" style="border-right:1.5px solid #0F172A;">';
        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Grupo Sanguíneo:</span>';
        htmlBody += '<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-700 border border-rose-200">' + (rec.grupo_sanguineo || 'O+') + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Licencia Conducir MTC:</span>';
        htmlBody += '<span class="font-mono font-bold text-slate-900">' + (rec.licencia_conducir || 'N/A') + ' (Cat: ' + (rec.licencia_categoria || '---') + ')</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Vencimiento Brevete:</span>';
        htmlBody += '<span class="font-mono text-slate-700">' + (rec.licencia_vencimiento ? rec.licencia_vencimiento.slice(0, 10) : '—') + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Póliza SCTR Salud / Pensión:</span>';
        htmlBody += '<div class="flex gap-1">' + (rec.sctr_salud_vigente ? '<span class="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-emerald-100 text-emerald-800">SCTR SALUD ✔</span>' : '<span class="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-rose-100 text-rose-800">SIN SCTR SALUD</span>') + '</div>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Examen Médico (EMO):</span>';
        htmlBody += '<span class="font-bold text-slate-900">' + (rec.emo_condicion || 'APTO') + ' (' + (rec.emo_fecha_vencimiento ? rec.emo_fecha_vencimiento.slice(0, 10) : '—') + ')</span>';
        htmlBody += '</div>';
        htmlBody += '</div>';

        // Columna Derecha: Dotación y Tallas EPP
        htmlBody += '<div class="p-2.5 bg-white space-y-1">';
        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Talla Polo / Camisa:</span>';
        htmlBody += '<span class="font-mono font-bold text-slate-800">' + (rec.talla_polo || 'M') + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Talla Pantalón:</span>';
        htmlBody += '<span class="font-mono font-bold text-slate-800">' + (rec.talla_pantalon || '32') + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Calzado de Seguridad:</span>';
        htmlBody += '<span class="font-mono font-bold text-slate-800">' + (rec.talla_calzado || '41') + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Chaleco Reflectivo:</span>';
        htmlBody += '<span class="font-mono font-bold text-slate-800">' + (rec.talla_chaleco || 'ESTÁNDAR') + '</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="flex items-center justify-between p-1 text-[10px]">';
        htmlBody += '<span class="text-slate-500 font-bold uppercase">Vigencia de Contrato:</span>';
        htmlBody += '<span class="font-mono font-bold text-slate-700">' + (rec.fecha_inicio_contrato ? rec.fecha_inicio_contrato.slice(0, 10) : '—') + ' al ' + (rec.fecha_fin_contrato ? rec.fecha_fin_contrato.slice(0, 10) : (rec.tipo_contrato === 'INDETERMINADO' ? 'INDETERMINADO' : '—')) + '</span>';
        htmlBody += '</div>';
        htmlBody += '</div>';

        htmlBody += '</div>';
        htmlBody += '</section>';

        // 5. OBSERVACIONES & DECLARACIÓN
        htmlBody += '<div class="doc-grid-box rounded-lg px-3 py-1.5 mb-2.5 bg-white flex items-center justify-between text-[10.5px]" style="border:1.5px solid #0F172A;">';
        htmlBody += '<div class="flex items-center gap-2">';
        htmlBody += '<span class="font-extrabold text-slate-800 uppercase text-[10px]">DECLARACIÓN:</span>';
        htmlBody += '<span class="font-bold text-slate-700 uppercase tracking-tight text-[9.5px]">Declaro bajo juramento que los datos consignados en esta ficha son verídicos.</span>';
        htmlBody += '</div>';
        htmlBody += '<span class="text-[9px] font-mono text-slate-400">RRHH CONFORME</span>';
        htmlBody += '</div>';

        // 6. SECCIÓN DE FIRMAS DIGITALES
        htmlBody += '<footer class="doc-grid-box rounded-lg p-2.5 bg-white" style="border:1.5px solid #0F172A;">';
        htmlBody += '<div class="flex items-center gap-1.5 mb-2 pb-1 border-b border-slate-200" style="border-bottom:1px solid #E2E8F0;">';
        htmlBody += '<svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>';
        htmlBody += '<span class="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-700">Firmas Digitales & Huella de Conformidad</span>';
        htmlBody += '</div>';

        htmlBody += '<div class="grid grid-cols-12 gap-2.5 items-end" style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px;">';
        
        // Firma Colaborador (Col span 5)
        htmlBody += '<div class="col-span-5 p-2 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col items-center justify-between text-center min-h-[75px]" style="grid-column:span 5 / span 5;border:1px solid #E2E8F0;background:#F8FAFC;">';
        htmlBody += '<div class="h-8 flex items-center justify-center">';
        htmlBody += '<svg class="w-32 h-6 text-slate-900 stroke-current fill-none stroke-[1.8]" viewBox="0 0 140 40"><path d="M15 28 Q 35 4 55 18 T 95 24 T 125 12"/><path d="M45 22 L 75 8" stroke-width="1.2"/></svg>';
        htmlBody += '</div>';
        htmlBody += '<div class="w-full pt-1 border-t border-slate-200" style="border-top:1px solid #E2E8F0;">';
        htmlBody += '<span class="text-[10px] font-extrabold text-slate-900 block uppercase tracking-tight">Firma del Colaborador</span>';
        htmlBody += '<span class="text-[9px] text-slate-500 font-medium block truncate max-w-[200px] mx-auto">DNI: ' + rec.numero_documento + '</span>';
        htmlBody += '</div>';
        htmlBody += '</div>';

        // Huella Digital (Col span 2)
        htmlBody += '<div class="col-span-2 p-1 rounded-xl border border-slate-300 bg-white flex flex-col items-center justify-center text-center min-h-[75px]" style="grid-column:span 2 / span 2;border:1.5px dashed #64748B;">';
        htmlBody += '<span class="text-[7.5px] font-extrabold text-slate-400 block uppercase leading-tight">HUELLA<br>DIGITAL</span>';
        htmlBody += '</div>';

        // VoBo RRHH / Gerencia (Col span 5)
        htmlBody += '<div class="col-span-5 p-2 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col items-center justify-between text-center min-h-[75px]" style="grid-column:span 5 / span 5;border:1px solid #E2E8F0;background:#F8FAFC;">';
        htmlBody += '<div class="h-8 flex items-center justify-center">';
        htmlBody += '<svg class="w-32 h-6 text-slate-900 stroke-current fill-none stroke-[1.8]" viewBox="0 0 140 40"><path d="M20 30 Q 40 4 60 14 T 90 28 T 120 10"/><path d="M50 30 L 115 26" stroke-width="1.2"/></svg>';
        htmlBody += '</div>';
        htmlBody += '<div class="w-full pt-1 border-t border-slate-200" style="border-top:1px solid #E2E8F0;">';
        htmlBody += '<span class="text-[10px] font-extrabold text-slate-900 block uppercase tracking-tight">Recursos Humanos / Gerencia</span>';
        htmlBody += '<span class="text-[9px] text-slate-500 font-medium block">VoBo CONTROL Y REGISTRO</span>';
        htmlBody += '</div>';
        htmlBody += '</div>';

        htmlBody += '</div>';
        htmlBody += '</footer>';

        htmlBody += '</main>';

        // Documento final con Tailwind CSS y barra superior idéntica a checklist
        var finalHtml = '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n'
            + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
            + '<title>Ficha de Registro de Personal • ' + rec.apellidos + ', ' + rec.nombres + '</title>\n'
            + '<script src="https://cdn.tailwindcss.com"></script>\n'
            + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">\n'
            + '<style>\n'
            + 'body {\n'
            + '  background-color: #F1F5F9;\n'
            + '  color: #0F172A;\n'
            + '  -webkit-font-smoothing: antialiased;\n'
            + '  -moz-osx-font-smoothing: grayscale;\n'
            + '}\n'
            + '.doc-grid-box { border: 1.5px solid #0F172A; }\n'
            + '.btn-action { transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }\n'
            + '.btn-action:hover { transform: translateY(-1px); }\n'
            + '.btn-action:active { transform: scale(0.98); }\n'
            + '@media print {\n'
            + '  @page {\n'
            + '    size: A4 portrait;\n'
            + '    margin: 4mm 5mm;\n'
            + '  }\n'
            + '  body {\n'
            + '    background: #FFFFFF !important;\n'
            + '    padding: 0 !important;\n'
            + '    margin: 0 !important;\n'
            + '    -webkit-print-color-adjust: exact !important;\n'
            + '    print-color-adjust: exact !important;\n'
            + '  }\n'
            + '  .no-print {\n'
            + '    display: none !important;\n'
            + '  }\n'
            + '  .report-page {\n'
            + '    box-shadow: none !important;\n'
            + '    border: none !important;\n'
            + '    border-radius: 0 !important;\n'
            + '    padding: 0 !important;\n'
            + '    margin: 0 !important;\n'
            + '    width: 100% !important;\n'
            + '    max-width: 100% !important;\n'
            + '  }\n'
            + '}\n'
            + '</style>\n</head>\n<body class="py-4 md:py-6 px-2 sm:px-4 flex flex-col items-center min-h-screen">\n'
            + '  <!-- TOP APP TOOLBAR (1:1 IDÉNTICO A CHECKLIST) -->\n'
            + '  <nav class="no-print w-full max-w-[840px] mb-4 flex flex-wrap items-center justify-between gap-3 bg-white/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-200/80 shadow-xs">\n'
            + '    <div class="flex items-center gap-3">\n'
            + '      <button onclick="window.close()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition">\n'
            + '        <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>\n'
            + '        <span>Cerrar Vista</span>\n'
            + '      </button>\n'
            + '      <div class="h-4 w-px bg-slate-200"></div>\n'
            + '      <div class="flex items-center gap-2">\n'
            + '        <span class="text-xs font-bold text-slate-900 font-mono uppercase">' + rec.apellidos + ', ' + rec.nombres + '</span>\n'
            + '        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">' + docId + '</span>\n'
            + '      </div>\n'
            + '    </div>\n'
            + '    <div class="flex items-center gap-2">\n'
            + '      <button onclick="window.print()" class="btn-action inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-medium rounded-xl shadow-xs transition">\n'
            + '        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>\n'
            + '        <span>Guardar / Descargar PDF (Vectorial HD)</span>\n'
            + '      </button>\n'
            + '    </div>\n'
            + '  </nav>\n'
            + '  <!-- MAIN CONTENT ROOT -->\n'
            + '  <div id="rrhh-pdf-root" class="w-full flex flex-col items-center">\n'
            + htmlBody
            + '\n  </div>\n'
            + '  <aside class="no-print mt-3 text-center text-[10px] text-slate-400">\n'
            + '    Azkell ERP • Documento oficial de Legajo Digital de Personal 2026\n'
            + '  </aside>\n'
            + '</body>\n</html>';

        var blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');

    } catch(err) {
        console.error('Error generando Ficha PDF:', err);
        alert('Error al generar la ficha: ' + err.message);
    }
};

window.rrhhPersonalAbrirModalEditarDesdeFicha = function() {
    if (window._rrhhColaboradorFichaActual && window._rrhhColaboradorFichaActual.id) {
        window.rrhhPersonalAbrirModalEditar(window._rrhhColaboradorFichaActual.id);
    }
};

// ── Inicialización Automática ──────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.init_rrhh_personal);
} else {
    window.init_rrhh_personal();
}
