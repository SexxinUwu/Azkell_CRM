// ═════════════════════════════════════════════════════════════════════
// MÓDULO: RRHH — PERSONAL & LEGAJOS DIGITALES 360° — Lógica SPA
// ERP Azkell
// ═════════════════════════════════════════════════════════════════════

window._rrhhPersonalList = [];

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
                <td colspan="9" class="text-center py-5 text-muted">
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

    var html = lista.map(function(p) {
        var rolClass = rolClases[p.categoria_rol] || 'bg-light text-dark border';
        var iniciales = (p.nombres.charAt(0) + (p.apellidos.charAt(0) || '')).toUpperCase();
        var fotoHtml = p.foto_url 
            ? `<img src="${p.foto_url}" class="table-personal-avatar border" alt="">`
            : `<div class="table-personal-avatar border">${iniciales}</div>`;

        // Semáforo de vencimiento de contrato
        var contratoHtml = `<span class="badge bg-light text-dark border">${p.tipo_contrato}</span>`;
        if (p.fecha_fin_contrato) {
            var fFin = new Date(p.fecha_fin_contrato);
            var hoy = new Date();
            var diffDias = Math.ceil((fFin - hoy) / (1000 * 60 * 60 * 24));
            
            if (diffDias < 0) {
                contratoHtml += `<div class="text-danger fw-bold small mt-1 font-monospace"><i class="bi bi-exclamation-triangle-fill"></i> Venció (${p.fecha_fin_contrato})</div>`;
            } else if (diffDias <= 30) {
                contratoHtml += `<div class="text-warning fw-bold small mt-1 font-monospace"><i class="bi bi-clock-history"></i> Vence en ${diffDias}d (${p.fecha_fin_contrato})</div>`;
            } else {
                contratoHtml += `<div class="text-muted small mt-1 font-monospace">${p.fecha_fin_contrato}</div>`;
            }
        }

        // Semáforo SST / Brevete
        var sstHtml = '';
        if (p.categoria_rol === 'CONDUCTOR') {
            var breveteTxt = p.licencia_conducir ? `${p.licencia_categoria || 'A-III'} (${p.licencia_conducir})` : 'Sin brevete';
            var sctrBadge = p.sctr_salud_vigente ? `<span class="badge bg-success-subtle text-success border border-success-subtle py-0.5">SCTR OK</span>` : `<span class="badge bg-danger text-white py-0.5">SIN SCTR</span>`;
            sstHtml = `<div class="small fw-semibold text-dark mb-0.5 font-monospace">${breveteTxt}</div>${sctrBadge}`;
        } else {
            var sctrBadge2 = p.sctr_salud_vigente ? `<span class="badge bg-success-subtle text-success border border-success-subtle py-0.5">SCTR OK</span>` : `<span class="badge bg-secondary-subtle text-secondary py-0.5">N/A</span>`;
            sstHtml = `<div class="small text-muted mb-0.5">EMO: ${p.emo_condicion || 'APTO'}</div>${sctrBadge2}`;
        }

        // Estado
        var badgeEst = p.estado === 'ACTIVO' 
            ? 'bg-success-subtle text-success border border-success-subtle' 
            : (p.estado === 'VACACIONES' ? 'bg-info-subtle text-info border' : 'bg-secondary-subtle text-secondary border');

        return `
            <tr>
                <td class="ps-4">
                    <div class="d-flex align-items-center gap-2.5">
                        ${fotoHtml}
                        <div>
                            <strong class="d-block text-dark">${p.apellidos}, ${p.nombres}</strong>
                            <small class="text-muted"><i class="bi bi-telephone me-1"></i>${p.telefono || 'Sin teléfono'}</small>
                        </div>
                    </div>
                </td>
                <td class="font-monospace fw-bold text-secondary">${p.numero_documento}</td>
                <td>
                    <span class="rrhh-badge-rol ${rolClass} d-inline-block mb-1">${p.categoria_rol.replace('_', ' ')}</span>
                    <div class="fw-semibold text-dark small">${p.cargo}</div>
                </td>
                <td>
                    <div class="fw-semibold text-dark small">${p.area || 'OPERACIONES'}</div>
                    <small class="text-muted font-monospace">${p.sede || 'BASE'}</small>
                </td>
                <td>${contratoHtml}</td>
                <td>
                    <div class="font-monospace fw-bold text-success">S/ ${parseFloat(p.sueldo_basico || 0).toFixed(2)}</div>
                    <small class="text-muted font-monospace">${p.regimen_pensionario}</small>
                </td>
                <td>${sstHtml}</td>
                <td><span class="badge ${badgeEst} px-2 py-1 rounded-pill" style="font-size:0.68rem;">${p.estado}</span></td>
                <td class="text-end pe-4">
                    <div class="btn-group">
                        <button type="button" class="btn btn-sm btn-outline-primary rounded-circle me-1" style="width:32px;height:32px;padding:0;" onclick="window.rrhhPersonalVerFicha(${p.id})" title="Ver Ficha 360°"><i class="bi bi-eye-fill"></i></button>
                        <button type="button" class="btn btn-sm btn-outline-secondary rounded-circle me-1" style="width:32px;height:32px;padding:0;" onclick="window.rrhhPersonalAbrirModalEditar(${p.id})" title="Editar"><i class="bi bi-pencil-fill"></i></button>
                        <button type="button" class="btn btn-sm btn-outline-danger rounded-circle" style="width:32px;height:32px;padding:0;" onclick="window.rrhhPersonalEliminar(${p.id})" title="Eliminar"><i class="bi bi-trash-fill"></i></button>
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

window.rrhhPersonalToggleRol = function(rol) {
    var boxLic = document.getElementById('box-pers-licencia');
    var boxCat = document.getElementById('box-pers-licencia-cat');
    var boxVenc = document.getElementById('box-pers-licencia-venc');
    var esConductor = (rol === 'CONDUCTOR');

    if (boxLic) boxLic.style.opacity = esConductor ? '1' : '0.6';
    if (boxCat) boxCat.style.opacity = esConductor ? '1' : '0.6';
    if (boxVenc) boxVenc.style.opacity = esConductor ? '1' : '0.6';
};

window.rrhhPersonalOnTipoDocChange = function(tipo) {
    var docInput = document.getElementById('pers-num-doc');
    var hint = document.getElementById('pers-doc-hint');
    var btn = document.getElementById('btn-pers-buscar-dni');
    if (tipo === 'DNI') {
        if (docInput) { docInput.maxLength = 8; docInput.placeholder = '12345678'; }
        if (hint) hint.innerHTML = '<i class="bi bi-magic text-primary me-1"></i> Digite los 8 dígitos para autocompletar nombres desde RENIEC.';
        if (btn) btn.classList.remove('d-none');
    } else if (tipo === 'CE') {
        if (docInput) { docInput.maxLength = 12; docInput.placeholder = '001234567'; }
        if (hint) hint.innerHTML = '<i class="bi bi-info-circle text-muted me-1"></i> Carnet de Extranjería / Documento especial.';
    } else {
        if (docInput) { docInput.maxLength = 15; docInput.placeholder = 'Pasaporte'; }
        if (hint) hint.innerHTML = '<i class="bi bi-info-circle text-muted me-1"></i> Pasaporte u otro documento de identidad.';
    }
};

window._rrhhDniTimeout = null;
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
    if (hint) hint.innerHTML = '<span class="spinner-border spinner-border-sm text-primary me-1"></span> Consultando RENIEC / SUNAT...';

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

            if (hint) hint.innerHTML = '<span class="text-success fw-bold"><i class="bi bi-check-circle-fill me-1"></i> Datos obtenidos de RENIEC exitosamente</span>';
            if (typeof window.rotToast === 'function') window.rotToast('✨ Datos obtenidos de RENIEC', 'bg-success');
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

window.rrhhPersonalAbrirModalNuevo = function() {
    var form = document.getElementById('formPersonal');
    if (form) form.reset();

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

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalPersonalForm'));
    modal.show();
};

window.rrhhPersonalAbrirModalEditar = function(id) {
    var p = window._rrhhPersonalList.find(x => x.id == id);
    if (!p) return;

    var idEl = document.getElementById('pers-id');
    if (idEl) idEl.value = p.id;

    var lblT = document.getElementById('modalPersonalFormLabel');
    if (lblT) lblT.textContent = `Editar Colaborador — ${p.apellidos}, ${p.nombres}`;

    var setVal = function(elemId, val) {
        var el = document.getElementById(elemId);
        if (el) el.value = val || '';
    };

    setVal('pers-tipo-doc', p.tipo_documento);
    setVal('pers-num-doc', p.numero_documento);
    setVal('pers-nombres', p.nombres);
    setVal('pers-apellidos', p.apellidos);
    setVal('pers-sexo', p.sexo);
    setVal('pers-fecha-nac', p.fecha_nacimiento ? p.fecha_nacimiento.slice(0, 10) : '');
    setVal('pers-telefono', p.telefono);
    setVal('pers-email', p.email);
    setVal('pers-direccion', p.direccion);
    setVal('pers-contacto-emergencia', p.contacto_emergencia_nombre ? `${p.contacto_emergencia_nombre} (${p.contacto_emergencia_parentesco || ''}) ${p.contacto_emergencia_telefono || ''}` : '');

    setVal('pers-rol', p.categoria_rol);
    setVal('pers-cargo', p.cargo);
    setVal('pers-area', p.area);
    setVal('pers-sede', p.sede);
    setVal('pers-centro-costo', p.centro_costo_codigo);
    setVal('pers-fecha-ingreso', p.fecha_ingreso ? p.fecha_ingreso.slice(0, 10) : '');

    setVal('pers-tipo-contrato', p.tipo_contrato);
    setVal('pers-inicio-contrato', p.fecha_inicio_contrato ? p.fecha_inicio_contrato.slice(0, 10) : '');
    setVal('pers-fin-contrato', p.fecha_fin_contrato ? p.fecha_fin_contrato.slice(0, 10) : '');
    setVal('pers-sueldo', parseFloat(p.sueldo_basico || 0).toFixed(2));
    setVal('pers-bono', parseFloat(p.bono_fijo || 0).toFixed(2));
    setVal('pers-asig-familiar', p.tiene_asignacion_familiar ? '1' : '0');
    setVal('pers-regimen-pension', p.regimen_pensionario);
    setVal('pers-cuspp', p.cuspp);
    setVal('pers-banco-haberes', p.banco_haberes);
    setVal('pers-cuenta-haberes', p.cuenta_haberes);
    setVal('pers-cci-haberes', p.cci_haberes);

    setVal('pers-licencia-num', p.licencia_conducir);
    setVal('pers-licencia-cat', p.licencia_categoria);
    setVal('pers-licencia-venc', p.licencia_vencimiento ? p.licencia_vencimiento.slice(0, 10) : '');
    setVal('pers-sctr-salud', p.sctr_salud_vigente ? '1' : '0');
    setVal('pers-sctr-pension', p.sctr_pension_vigente ? '1' : '0');
    setVal('pers-emo-condicion', p.emo_condicion);

    window.rrhhPersonalToggleRol(p.categoria_rol);

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
        
        categoria_rol: document.getElementById('pers-rol')?.value,
        cargo: document.getElementById('pers-cargo')?.value,
        area: document.getElementById('pers-area')?.value,
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
        
        licencia_conducir: document.getElementById('pers-licencia-num')?.value,
        licencia_categoria: document.getElementById('pers-licencia-cat')?.value,
        licencia_vencimiento: document.getElementById('pers-licencia-venc')?.value || null,
        sctr_salud_vigente: document.getElementById('pers-sctr-salud')?.value,
        sctr_pension_vigente: document.getElementById('pers-sctr-pension')?.value,
        emo_condicion: document.getElementById('pers-emo-condicion')?.value
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
            alert(esEdicion ? '¡Colaborador actualizado con éxito!' : '¡Colaborador registrado con éxito!');
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
            window.rrhhPersonalCargarListado();
        } else {
            alert(json.error || 'No se pudo eliminar');
        }
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

window.rrhhPersonalVerFicha = async function(id) {
    try {
        var res = await fetch(`/api/rrhh/personal/${id}`);
        var json = await res.json();
        if (!json || !json.ok || !json.data) return;

        var p = json.data;
        var lic = json.licencias || [];
        var sst = json.sst || [];

        var elNom = document.getElementById('ficha-nombre');
        var elCar = document.getElementById('ficha-cargo');
        var elAv = document.getElementById('ficha-avatar');
        var elBody = document.getElementById('ficha-body');

        if (elNom) elNom.textContent = `${p.apellidos}, ${p.nombres}`;
        if (elCar) elCar.textContent = `${p.cargo} — ${p.categoria_rol}`;
        if (elAv) elAv.textContent = (p.nombres.charAt(0) + (p.apellidos.charAt(0) || '')).toUpperCase();

        var licHtml = lic.length ? lic.map(l => `
            <div class="p-2 border rounded-3 mb-1.5 bg-white small d-flex justify-content-between">
                <div><strong>${l.tipo}</strong> (${l.dias_totales} días): ${l.motivo || 'Sin motivo'}</div>
                <span class="font-monospace text-muted">${l.fecha_inicio} al ${l.fecha_fin}</span>
            </div>
        `).join('') : '<p class="text-muted small">Sin licencias registradas.</p>';

        var sstHtml = sst.length ? sst.map(s => `
            <div class="p-2 border rounded-3 mb-1.5 bg-white small d-flex justify-content-between">
                <div><strong>${s.tipo_registro}</strong>: ${s.descripcion}</div>
                <span class="font-monospace text-muted">${s.fecha_registro}</span>
            </div>
        `).join('') : '<p class="text-muted small">Sin constancias SST registradas.</p>';

        if (elBody) {
            elBody.innerHTML = `
                <div class="row g-3 mb-3">
                    <div class="col-12 col-md-4">
                        <div class="p-3 bg-white border rounded-4">
                            <small class="text-muted fw-bold d-block text-uppercase">DNI / DOCUMENTO</small>
                            <span class="fw-bold fs-6 font-monospace">${p.numero_documento}</span>
                        </div>
                    </div>
                    <div class="col-12 col-md-4">
                        <div class="p-3 bg-white border rounded-4">
                            <small class="text-muted fw-bold d-block text-uppercase">SUELDO BÁSICO</small>
                            <span class="fw-bold fs-6 font-monospace text-success">S/ ${parseFloat(p.sueldo_basico || 0).toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="col-12 col-md-4">
                        <div class="p-3 bg-white border rounded-4">
                            <small class="text-muted fw-bold d-block text-uppercase">RÉGIMEN PENSIÓN</small>
                            <span class="fw-bold fs-6 font-monospace">${p.regimen_pensionario}</span>
                        </div>
                    </div>
                </div>

                <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white border">
                    <h6 class="fw-bold text-dark mb-2"><i class="bi bi-shield-check text-primary me-1"></i> Cumplimiento SST y Habilitaciones (Ley 29783)</h6>
                    <div class="row g-2 small">
                        <div class="col-6"><strong>Póliza SCTR Salud:</strong> ${p.sctr_salud_vigente ? '<span class="text-success fw-bold">VIGENTE</span>' : '<span class="text-danger fw-bold">NO VIGENTE</span>'}</div>
                        <div class="col-6"><strong>Póliza SCTR Pensión:</strong> ${p.sctr_pension_vigente ? '<span class="text-success fw-bold">VIGENTE</span>' : '<span class="text-danger fw-bold">NO VIGENTE</span>'}</div>
                        <div class="col-6"><strong>Condición Médica EMO:</strong> <span class="fw-bold">${p.emo_condicion}</span></div>
                        <div class="col-6"><strong>Brevete MTC:</strong> <span class="font-monospace fw-bold">${p.licencia_conducir || 'N/A'} (${p.licencia_categoria || '---'})</span></div>
                    </div>
                </div>

                <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white border">
                    <h6 class="fw-bold text-dark mb-2"><i class="bi bi-file-earmark-medical text-info me-1"></i> Historial de Licencias y Vacaciones</h6>
                    ${licHtml}
                </div>

                <div class="card border-0 shadow-2xs rounded-4 p-3 mb-0 bg-white border">
                    <h6 class="fw-bold text-dark mb-2"><i class="bi bi-award text-warning me-1"></i> Registros y Capacitaciones SST</h6>
                    ${sstHtml}
                </div>
            `;
        }

        var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalPersonalFicha'));
        modal.show();
    } catch(e) {
        console.error(e);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.init_rrhh_personal);
} else {
    window.init_rrhh_personal();
}
