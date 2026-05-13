// ================================================================
// 🚛 MÓDULO STATUS FLOTA - LÓGICA AISLADA
// ================================================================

window.dataGlobalStatusFlota = window.dataGlobalStatusFlota || [];
window.expandSFMap         = window.expandSFMap         || {};
window.expandAllSFState    = window.expandAllSFState    || false;
window.sfComboData         = window.sfComboData         || {};

// ================================================================
// 🔽 COMBOS MODERNOS - reemplaza datalists nativos
// ================================================================
function sfSearch(tipo, val) {
    const panel = document.getElementById('sfPanel_' + tipo);
    if (!panel) return;
    const q = (val || '').toUpperCase().trim();
    const items = window.sfComboData[tipo] || [];
    const filtered = q
        ? items.filter(i => i.v.toUpperCase().includes(q) || (i.s || '').toUpperCase().includes(q))
        : items.slice(0, 60);
    if (!filtered.length) { panel.classList.remove('show'); return; }
    panel.innerHTML = filtered.slice(0, 50).map(i => {
        const esc = (i.v || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
        return `<div class="sf-opt" data-sf-tipo="${tipo}" data-sf-val="${esc}" onmousedown="sfPickThis(this)">
            <span class="fw-bold">${i.v}</span>
            ${i.s ? `<span class="sf-sub">${i.s}</span>` : ''}
        </div>`;
    }).join('');
    panel.classList.add('show');
}

function sfHide(tipo) {
    setTimeout(() => {
        const p = document.getElementById('sfPanel_' + tipo);
        if (p) p.classList.remove('show');
    }, 180);
}

function sfPickThis(el) {
    const tipo = el.getAttribute('data-sf-tipo');
    const val  = el.getAttribute('data-sf-val');
    const inp  = document.getElementById('sf_' + tipo);
    if (inp) inp.value = val;
    const p = document.getElementById('sfPanel_' + tipo);
    if (p) p.classList.remove('show');
    if (tipo === 'motora' || tipo === 'nomotora') {
        if (window.autocompletarStatus) window.autocompletarStatus(tipo);
    }
}

function sfPick(tipo, val) {
    sfPickThis({ getAttribute: (k) => k === 'data-sf-tipo' ? tipo : val });
}

function sfInitCombos() {
    // Placas para motora y no motora
    const allPlacas = (window.dataGlobalPlacas || []).map(p => ({ v: p[0] || '', s: p[1] || '' })).filter(p => p.v);
    window.sfComboData.motora   = allPlacas;
    window.sfComboData.nomotora = allPlacas;

    // Zonas: solo las 3 definidas
    window.sfComboData.zona = ['Lavado', 'Mantenimiento', 'Patio'].map(z => ({ v: z, s: '' }));

    // Estados definidos
    const estadosBase = ['Cargado', 'Con Devolución', 'Disponible', 'En Mantenimiento', 'Vacío'];
    const estadosExist = [...new Set((window.dataGlobalStatusFlota || []).map(f => f[9]).filter(Boolean))];
    window.sfComboData.estado = [...new Set([...estadosBase, ...estadosExist])].map(e => ({ v: e, s: '' }));
}

function sfResetKm() {
    const km = document.getElementById('sf_kilometraje');
    if (!km) return;
    km.disabled = true;
    km.value = '';
    km.placeholder = 'Elige primero la Motora';
    km.classList.add('sf-km-locked');
}

function sfEnableKm() {
    const km = document.getElementById('sf_kilometraje');
    if (!km) return;
    km.disabled = false;
    km.placeholder = 'Ej: 125000';
    km.classList.remove('sf-km-locked');
}

// ================================================================
// 🔄 RECARGAR Y RESETEAR
// ================================================================
function resetearYRecargarStatusFlota() {
    let tzOffset = (new Date()).getTimezoneOffset() * 60000;
    let hoyISO = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
    document.getElementById('filtroStatusFecha').value = hoyISO;
    document.getElementById('filtroStatusCorte').value = "";
    CACHE['statusFlota'] = null;
    cargarStatusFlota();
}

function cargarStatusFlota() {
    cargarModulo('statusFlota', mostrarStatusFlota, 'obtenerDatosStatusFlota');
}

// ================================================================
// 🔲 MODAL NUEVO STATUS
// ================================================================
function abrirModalNuevoStatusFlota() {
    const _fSF = document.getElementById('formStatusFlota');
    if (_fSF) _fSF.reset();
    document.getElementById('sf_id').value = '';
    document.getElementById('sf_cliente_motora').value = '';
    document.getElementById('sf_cliente_nomotora').value = '';
    document.getElementById('sf_zona').value = '';
    sfResetKm();

    let tzOffset = (new Date()).getTimezoneOffset() * 60000;
    document.getElementById('sf_fecha').value = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];

    let hora = new Date().getHours();
    if (hora >= 4 && hora < 12) document.getElementById('corte1').checked = true;
    else if (hora >= 12 && hora < 16) document.getElementById('corte2').checked = true;
    else document.getElementById('corte3').checked = true;

    sfInitCombos();

    // Cargar conductores en combo
    fetch('/api/conductores-lista')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                window.sfComboData.conductor = data
                    .filter(c => c.nombre)
                    .map(c => ({ v: c.nombre, s: c.licencia || '' }));
            }
        })
        .catch(e => console.error("Error cargando conductores:", e));

    new bootstrap.Offcanvas(document.getElementById('modalStatusFlota')).show();
}

// ================================================================
// 🔀 GRUPOS - EXPANDIR / COLAPSAR
// ================================================================
function toggleGroupRowSF(claseZ) {
    expandSFMap[claseZ] = !expandSFMap[claseZ];
    filtrarStatusFlotaAvanzado();
}

function toggleAllSFGroups() {
    expandAllSFState = !expandAllSFState;
    const headers = document.querySelectorAll('#cuerpoTablaStatusFlota tr.group-header');
    headers.forEach(header => {
        const claseZ = header.getAttribute('data-group-clase');
        expandSFMap[claseZ] = expandAllSFState;
    });
    filtrarStatusFlotaAvanzado();
}

// ================================================================
// 🔍 TIPO COMPUESTO (MOTORA + NO MOTORA)
// ================================================================
window.obtenerTipoCompuesto = function(motora, nomotora) {
    const limpiarTexto = (txt) => {
        if (!txt) return "";
        // Corregir encoding y pasar a title case
        return txt
            .replace(/Ã³/g, 'ó').replace(/Ã"/g, 'Ó')
            .replace(/Ã¡/g, 'á').replace(/Ã©/g, 'é').replace(/Ã­/g, 'í').replace(/Ã±/g, 'ñ')
            .toLowerCase()
            .replace(/(^|[\s\-])(\S)/g, (_, sep, ch) => sep + ch.toUpperCase());
    };

    let tMot = "", tNoMot = "";

    if (motora && motora !== "-") {
        let p = dataGlobalPlacas.find(x => normalizeStr(x[0]) === normalizeStr(motora));
        if (p && p[5] && p[5] !== "-") tMot = limpiarTexto(p[5]);
    }
    if (nomotora && nomotora !== "-") {
        let p = dataGlobalPlacas.find(x => normalizeStr(x[0]) === normalizeStr(nomotora));
        if (p && p[5] && p[5] !== "-") tNoMot = limpiarTexto(p[5]);
    }

    if (tMot && tNoMot) return `${tMot} - ${tNoMot}`;
    if (tMot) return tMot;
    if (tNoMot) return tNoMot;
    return "SIN TIPO REGISTRADO";
};

// ================================================================
// 📋 MOSTRAR TABLA STATUS FLOTA
// ================================================================
function mostrarStatusFlota(datos) {
    if (!dataGlobalInspecciones || dataGlobalInspecciones.length === 0) {
        const _cS = document.getElementById('cuerpoTablaStatusFlota');
        if (_cS) _cS.innerHTML = typeof generarSkeletonHtml === 'function'
            ? generarSkeletonHtml(9, 6)
            : '<tr><td colspan="9" class="text-center py-4"><span class="spinner-border text-warning spinner-border-sm"></span> Cruzando datos con Inspecciones Mecánicas...</td></tr>';
        fetch('/api/script/obtenerDatosInspecciones', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args: [] })
        })
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(r => {
            dataGlobalInspecciones = (r.data && r.data.length > 0) ? r.data : ['__CARGADO__'];
            window.dataGlobalInspecciones = dataGlobalInspecciones;
            mostrarStatusFlota(datos);
        })
        .catch(err => {
            console.error('Error cargando inspecciones:', err);
            dataGlobalInspecciones = ['__CARGADO__'];
            window.dataGlobalInspecciones = dataGlobalInspecciones;
            mostrarStatusFlota(datos);
        });
        return;
    }

    let tzOffset = (new Date()).getTimezoneOffset() * 60000;
    let hoyISO = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
    if (!document.getElementById('filtroStatusFecha').value) {
        document.getElementById('filtroStatusFecha').value = hoyISO;
    }

    dataGlobalStatusFlota = datos;
    window.dataGlobalStatusFlota = datos;
    let html = '';
    if (!datos || datos.length === 0) {
        html = '<tr><td colspan="9" class="text-center py-4 text-muted">No hay registros de Status Flota.</td></tr>';
    } else {
        let mapTipos = new Map();
        let setClis = new Set();

        datos.forEach(fila => {
            let motora = fila[3];
            let nomotora = fila[4];
            let tipoDinamico = obtenerTipoCompuesto(motora, nomotora);

            if (!mapTipos.has(tipoDinamico)) mapTipos.set(tipoDinamico, []);
            mapTipos.get(tipoDinamico).push(fila);
            setClis.add(fila[5]); setClis.add(fila[6]);
        });

        mapTipos.forEach((registros, tipoName) => {
            let claseZ = normalizarClase(tipoName);
            let isExpandido = expandSFMap[claseZ] !== false;
            let iconClass = isExpandido ? 'bi bi-chevron-down' : 'bi bi-chevron-right';

            html += `<tr class="group-header data-row-sf" style="cursor:pointer;" onclick="toggleGroupRowSF('${claseZ}')" data-group-clase="${claseZ}">
                <td colspan="10" class="text-start" style="padding-left: 20px;">
                    <i class="bi ${iconClass} ms-1 me-2 text-warning"></i>
                    <i class="bi bi-truck text-primary me-2"></i><span class="fw-bold sf-group-label">${tipoName}</span>
                    <span class="group-count badge bg-secondary ms-2">${registros.length}</span>
                </td>
            </tr>`;

            registros.forEach(fila => {
                let id = fila[0]; let fecha = fila[1]; let corte = fila[2];
                let motora = fila[3]; let nomotora = fila[4];
                let cliMot = fila[5]; let cliNoMot = fila[6];
                let zona = fila[7] || '';
                let conductor = fila[8]; let estado = fila[9]; let obs = fila[10] || 'Sin observaciones';
                let km = fila[11] || '';

                let getDias = (placa) => {
                    if (!placa || placa === "-") return "-";
                    let inspList = dataGlobalInspecciones.filter(i => normalizeStr(i.placa) === normalizeStr(placa));
                    if (inspList.length === 0) return `<span class="badge bg-secondary">S/I</span>`;

                    let parseD = (str) => {
                        if (!str) return 0;
                        if (String(str).includes('/')) { let p = String(str).split('/'); return new Date(p[2], p[1]-1, p[0]).getTime(); }
                        return new Date(String(str).split('T')[0]).getTime() || 0;
                    };

                    inspList.sort((a, b) => parseD(b.fecha_ingreso || b[1]) - parseD(a.fecha_ingreso || a[1]));
                    let insp = inspList[0];
                    let fIngreso = String(insp.fecha_ingreso || insp[1] || '');
                    let dProp = parseInt(insp.dias_propuestos || insp[6]) || 30;

                    let fIng;
                    if (fIngreso.includes('/')) {
                        const p = fIngreso.split('/');
                        fIng = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
                    } else {
                        fIng = new Date(fIngreso.split('T')[0]);
                    }
                    if (isNaN(fIng.getTime())) return `<span class="badge bg-secondary">S/F</span>`;
                    fIng.setDate(fIng.getDate() + dProp);

                    let hoy = new Date(); hoy.setHours(0, 0, 0, 0);
                    let dias = Math.ceil((fIng - hoy) / (1000 * 60 * 60 * 24));

                    if (dias < 0) return `<span class="badge bg-danger text-white shadow-sm" title="Vencido hace ${Math.abs(dias)} días">${Math.abs(dias)}d</span>`;
                    else if (dias <= 7) return `<span class="badge bg-warning text-dark shadow-sm" title="Faltan ${dias} días">${dias}d</span>`;
                    else return `<span class="badge bg-success text-white shadow-sm" title="Faltan ${dias} días">${dias}d</span>`;
                };

                let kmCell = km ? `<span class="fw-bold"><i class="bi bi-speedometer2 text-muted me-1"></i>${parseInt(km).toLocaleString()}</span>` : '<span class="text-muted">-</span>';
                const toTC = s => s ? s.toLowerCase().replace(/(^|[\s])(\S)/g, (_, sp, ch) => sp + ch.toUpperCase()) : '-';
                let bEst = `<span class="fw-bold text-primary">${estado || '-'}</span>`;
                let bZona = zona === 'Lavado'
                    ? '<span class="badge bg-info text-dark">Lavado</span>'
                    : zona === 'Mantenimiento'
                        ? '<span class="badge bg-warning text-dark">Mantenimiento</span>'
                        : zona === 'Patio'
                            ? '<span class="badge bg-secondary text-white">Patio</span>'
                            : (zona ? `<span class="badge bg-light text-dark border">${zona}</span>` : '<span class="text-muted">-</span>');

                let canEditSF = window.checkPerm('status','e');
                let canDeleteSF = window.checkPerm('status','d');
                let itemsSF = '';
                if(canEditSF) itemsSF += `<li><a class="dropdown-item fw-bold" href="#" onclick="abrirModalEditarStatusFlota('${id}')"><i class="bi bi-pencil text-warning"></i> Editar</a></li>`;
                if(canEditSF && canDeleteSF) itemsSF += `<li><hr class="dropdown-divider"></li>`;
                if(canDeleteSF) itemsSF += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${id}','StatusFlota')"><i class="bi bi-trash"></i> Eliminar</a></li>`;
                let menuAcciones = itemsSF ? `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${itemsSF}</ul></div>` : `<span class="text-muted"><i class="bi bi-dash"></i></span>`;

                html += `<tr class="child-row-sf data-row-status-flota" style="display:${isExpandido ? '' : 'none'};" data-climot="${cliMot}" data-clinomot="${cliNoMot}" data-zona="${tipoName}" data-fecha="${fecha}" data-corte="${corte}">
                    <td class="fw-bold text-secondary">${motora || '-'}</td>
                    <td>${kmCell}</td>
                    <td>${getDias(motora)}</td>
                    <td class="fw-bold text-secondary">${nomotora || '-'}</td>
                    <td>${getDias(nomotora)}</td>
                    <td>${toTC(conductor)}</td>
                    <td>${bEst}</td>
                    <td>${bZona}</td>
                    <td class="text-wrap" style="max-width: 150px;">${obs}</td>
                    <td>${menuAcciones}</td>
                </tr>`;
            });
        });

        rellenarFiltroCheck('filtroSFCliente', setClis, 'filtrarStatusFlotaAvanzado');
    }

    document.getElementById('cuerpoTablaStatusFlota').innerHTML = html;
    filtrarStatusFlotaAvanzado();
}

// ================================================================
// 🔍 FILTRO AVANZADO
// ================================================================
function filtrarStatusFlotaAvanzado() {
    const txt = document.getElementById('buscadorStatusFlota')?.value.toLowerCase() || '';
    const dateF = document.getElementById('filtroStatusFecha')?.value || '';
    const corte = document.getElementById('filtroStatusCorte')?.value || '';
    const chkCli = Array.from(document.querySelectorAll('#filtroSFCliente input:checked')).map(e => e.value);

    const headers = document.querySelectorAll('#cuerpoTablaStatusFlota tr.group-header');
    headers.forEach(header => {
        const claseZ = header.getAttribute('data-group-clase');
        const childRows = document.querySelectorAll(`.child-row-sf[data-zona="${header.querySelector('.sf-group-label')?.innerText || ''}"]`);
        let hasVisibleChild = false;
        let isExpanded = expandSFMap[claseZ] !== false;

        childRows.forEach(row => {
            const rCliMot = row.getAttribute('data-climot'); const rCliNoMot = row.getAttribute('data-clinomot');
            const rCorte = row.getAttribute('data-corte'); const rFecha = row.getAttribute('data-fecha');
            const textoFila = row.innerText.toLowerCase();

            const matchTxt = !txt || textoFila.includes(txt);
            const matchCli = !chkCli.length || chkCli.includes(rCliMot) || chkCli.includes(rCliNoMot);
            const matchCorte = !corte || corte === rCorte;

            let matchFecha = true;
            if (dateF) {
                let dbFecha = rFecha;
                if (dbFecha && dbFecha.includes('T')) dbFecha = dbFecha.split('T')[0];
                if (dbFecha && dbFecha.includes('/')) dbFecha = dbFecha.split('/').reverse().join('-');
                matchFecha = (dbFecha === dateF);
            }

            const pasaFiltro = matchTxt && matchCli && matchCorte && matchFecha;

            if (pasaFiltro) {
                row.style.display = isExpanded ? '' : 'none';
                hasVisibleChild = true;
            } else {
                row.style.display = 'none';
            }
        });

        header.style.display = hasVisibleChild ? '' : 'none';
        let icon = header.querySelector('i:first-child');
        if (icon) icon.className = isExpanded ? 'bi bi-chevron-down ms-1 me-2 text-warning' : 'bi bi-chevron-right ms-1 me-2 text-warning';
    });
}

// ================================================================
// 🔄 AUTOCOMPLETAR PLACA → CLIENTE (+ control km)
// ================================================================
window.autocompletarStatus = function(tipo) {
    let placaInput = normalizeStr(document.getElementById('sf_' + tipo).value);
    let fieldCli = document.getElementById('sf_cliente_' + tipo);

    if (!placaInput) {
        fieldCli.value = '';
        if (tipo === 'motora') sfResetKm();
        return;
    }
    let matchPlaca = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placaInput);
    fieldCli.value = matchPlaca ? (matchPlaca[1] || 'Sin Cliente') : 'No Registrada';
    if (tipo === 'motora') sfEnableKm();
};

// ================================================================
// 💾 GUARDAR REGISTRO STATUS FLOTA
// ================================================================
function enviarStatusFlota(event, formObj) {
    event.preventDefault();
    var isNew = !formObj.sf_id.value;
    if (!window.guardAction('status', isNew ? 'c' : 'e')) return;
    const btn = document.getElementById('btnGuardarSF');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    if (!formObj.sf_id.value) {
        formObj.sf_id.value = "SF-" + Date.now();
    }
    formObj.usuarioAutor.value = usuarioLogueado;

    let fechaGuardada = formObj.sf_fecha.value;
    let corteGuardado = formObj.querySelector('input[name="sf_corte"]:checked').value;

    const formData = new FormData(formObj);
    const formDataObj = {
        form: {
            sf_id: formData.get('sf_id'),
            sf_fecha: formData.get('sf_fecha'),
            sf_corte: formData.get('sf_corte'),
            sf_motora: formData.get('sf_motora'),
            sf_nomotora: formData.get('sf_nomotora'),
            sf_cliente_motora: formData.get('sf_cliente_motora'),
            sf_cliente_nomotora: formData.get('sf_cliente_nomotora'),
            sf_zona: formData.get('sf_zona'),
            sf_conductor: formData.get('sf_conductor'),
            sf_estado: formData.get('sf_estado'),
            sf_obs: formData.get('sf_obs'),
            sf_kilometraje: formData.get('sf_kilometraje') || null,
            usuarioAutor: usuarioLogueado
        }
    };

    fetch('/api/script/guardarStatusFlota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formDataObj)
    })
    .then(res => res.json())
    .then(r => {
        if (r.data === 'Éxito') {
            formObj.reset();
            formObj.sf_fecha.value = fechaGuardada;
            document.getElementById('corte' + corteGuardado).checked = true;
            document.getElementById('sf_id').value = '';
            document.querySelectorAll('[id^="sf_cliente_"]').forEach(el => el.value = '');
            sfResetKm();

            btn.innerHTML = '<i class="bi bi-check-circle"></i> ¡Guardado!';
            btn.classList.replace('btn-primary', 'btn-success');
            btn.classList.replace('btn-warning', 'btn-success');
            setTimeout(() => {
                btn.innerHTML = 'Guardar Registro';
                btn.classList.replace('btn-success', 'btn-primary');
                btn.classList.remove('text-dark');
                btn.disabled = false;
                document.getElementById('sf_motora').focus();
            }, 1000);

            CACHE['statusFlota'] = null;
            cargarStatusFlota();
        } else {
            alert(r.data);
            btn.disabled = false;
            btn.innerHTML = 'Guardar Registro';
        }
    })
    .catch(e => {
        alert('Error de red: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = 'Guardar Registro';
    });
}

// ================================================================
// ✏️ EDITAR STATUS FLOTA
// ================================================================
function abrirModalEditarStatusFlota(id) {
    if (event) event.preventDefault();

    let fila = dataGlobalStatusFlota.find(f => f[0] === id);
    if (!fila) { alert("No se encontró el registro para editar."); return; }

    document.getElementById('formStatusFlota')?.reset();
    sfResetKm();
    sfInitCombos();

    document.getElementById('sf_id').value = fila[0];

    let dDate = new Date(fila[1] + "T00:00:00");
    let fechaFormat = isNaN(dDate.getTime()) ? "" : dDate.toISOString().split('T')[0];
    document.getElementById('sf_fecha').value = fechaFormat || fila[1];

    let corte = fila[2];
    if (corte) { let radio = document.getElementById('corte' + corte); if (radio) radio.checked = true; }

    document.getElementById('sf_motora').value = fila[3] || '';
    document.getElementById('sf_nomotora').value = fila[4] || '';
    document.getElementById('sf_cliente_motora').value = fila[5] || '';
    document.getElementById('sf_cliente_nomotora').value = fila[6] || '';
    document.getElementById('sf_zona').value = fila[7] || '';
    document.getElementById('sf_conductor').value = fila[8] || '';
    document.getElementById('sf_estado').value = fila[9] || '';
    document.getElementById('sf_obs').value = fila[10] || '';

    // Km: índice 11 tras añadir la columna al array
    let kmVal = fila[11] || '';
    const kmEl = document.getElementById('sf_kilometraje');
    if (kmEl) {
        if (fila[3]) {
            sfEnableKm();
            kmEl.value = kmVal;
        } else {
            sfResetKm();
        }
    }

    // Cargar conductores en combo para edición
    fetch('/api/conductores-lista')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                window.sfComboData.conductor = data
                    .filter(c => c.nombre)
                    .map(c => ({ v: c.nombre, s: c.licencia || '' }));
            }
        })
        .catch(() => {});

    autocompletarStatus('motora');
    autocompletarStatus('nomotora');

    const btn = document.getElementById('btnGuardarSF');
    btn.innerHTML = '<i class="bi bi-pencil-square"></i> Actualizar';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-warning', 'text-dark');

    new bootstrap.Offcanvas(document.getElementById('modalStatusFlota')).show();
}

// ================================================================
// 📄 EXPORTAR PDF STATUS FLOTA
// ================================================================
window.generarPDFStatusFlota = function(event) {
    let btn = (event && event.currentTarget) ? event.currentTarget : document.querySelector('button[onclick*="generarPDFStatusFlota"]');
    let txtOriginal = '';
    if (btn) {
        txtOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Generando...';
        btn.classList.add('disabled');
    }

    let corteSeleccionado = document.getElementById('filtroStatusCorte')?.value;
    let textoCorte = corteSeleccionado ? `Corte ${corteSeleccionado}` : "Todos los cortes";
    let fechaRaw = document.getElementById('filtroStatusFecha')?.value || new Date().toISOString().split('T')[0];
    let fechaBonita = fechaRaw.split('-').reverse().join('/');

    let htmlCuerpo = '';
    const filas = document.querySelectorAll('#cuerpoTablaStatusFlota tr');

    filas.forEach(row => {
        if (row.style.display !== 'none') {
            if (row.classList.contains('group-header')) {
                let txtTipo = row.querySelector('span.text-uppercase');
                if (txtTipo) {
                    htmlCuerpo += `<tr><td colspan="7" style="background-color: #cbd5e1; font-weight: bold; padding: 4px 8px; color:#1e293b; text-align:left; font-size: 11px;">${txtTipo.innerText}</td></tr>`;
                }
            } else if (row.classList.contains('child-row-sf')) {
                let celdas = row.querySelectorAll('td');
                // Orden nuevo: motora(0) | km(1) | inspMot(2) | nomotora(3) | inspNoMot(4) | conductor(5) | estado(6) | zona(7) | obs(8)
                htmlCuerpo += `<tr>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #2563eb; font-size: 9px; line-height: 1.1; width: 12%;">${celdas[0]?.innerText || ''}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-size: 9px; line-height: 1.1; width: 8%;">${celdas[1]?.innerText || '-'}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b; font-size: 9px; line-height: 1.1; width: 12%;">${celdas[3]?.innerText || ''}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-size: 9px; line-height: 1.1; width: 20%;">${celdas[5]?.innerText || ''}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-size: 9px; line-height: 1.1; width: 12%;">${celdas[6]?.innerText || ''}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-weight: bold; font-size: 9px; line-height: 1.1; width: 10%;">${celdas[7]?.innerText || ''}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 9px; line-height: 1.1; width: 26%; word-break: break-word;">${celdas[8]?.innerText || ''}</td>
                </tr>`;
            }
        }
    });

    if (!htmlCuerpo) htmlCuerpo = '<tr><td colspan="6" class="text-center py-4" style="font-size: 10px;">No hay datos en la pantalla para exportar.</td></tr>';

    document.getElementById('pdf-sf-body').innerHTML = htmlCuerpo;
    document.querySelector('#pdf-status-flota p').innerHTML = `<span style="font-size: 14px;">Reporte de Status de Flota</span> <br> <span style="font-size: 11px;"><b>Fecha:</b> ${fechaBonita} | <b>Turno:</b> ${textoCorte}</span>`;
    document.getElementById('pdf-sf-fecha-gen').innerText = new Date().toLocaleDateString('es-PE');

    const elemento = document.getElementById('pdf-status-flota');
    document.getElementById('contenedor-pdf-status-flota').style.display = 'block';

    let nombreArchivo = `Status_Flota_${textoCorte.replace(/ /g, '_')}_${fechaRaw}.pdf`;

    html2pdf().set({
        margin: [8, 10, 8, 10],
        filename: nombreArchivo,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(elemento).save().then(() => {
        document.getElementById('contenedor-pdf-status-flota').style.display = 'none';
        if (btn) { btn.innerHTML = txtOriginal; btn.classList.remove('disabled'); }
    });
};

// ================================================================
// 🎯 MÓDULO INIT (con fix Leaflet)
// ================================================================
window.init_status = function() {
    if (!window.checkPerm('status', 'l')) {
        window.showNoPermMsg('mod-status-flota');
        return;
    }
    var btnNuevo = document.querySelector('[onclick*="abrirModalNuevoStatusFlota"]');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('status','c') ? '' : 'none';
    if(typeof cargarStatusFlota === 'function') cargarStatusFlota();

    // FAB mobile — toggle
    window._sfFABToggle = function() {
        const btn      = document.getElementById('sf-fab-btn');
        const menu     = document.getElementById('sf-fab-menu');
        const backdrop = document.getElementById('sf-fab-backdrop');
        const isOpen   = btn && btn.classList.contains('fab-open');
        if (isOpen) {
            btn      && btn.classList.remove('fab-open');
            menu     && menu.classList.remove('fab-menu-open');
            if (backdrop) backdrop.style.display = 'none';
        } else {
            btn      && btn.classList.add('fab-open');
            menu     && menu.classList.add('fab-menu-open');
            if (backdrop) backdrop.style.display = 'block';
        }
    };
    window._sfFABClose = function() {
        const btn      = document.getElementById('sf-fab-btn');
        const menu     = document.getElementById('sf-fab-menu');
        const backdrop = document.getElementById('sf-fab-backdrop');
        btn      && btn.classList.remove('fab-open');
        menu     && menu.classList.remove('fab-menu-open');
        if (backdrop) backdrop.style.display = 'none';
    };

    setTimeout(() => {
        if(typeof initMapaFlota === 'function') initMapaFlota();
        if(window.mapaFlota) window.mapaFlota.invalidateSize();
    }, 300);
};
