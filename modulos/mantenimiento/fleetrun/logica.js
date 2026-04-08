// ================================================================
// MÓDULO: FLEETRUN — Sistema de Mantenimiento Preventivo
// Aislado en SPA: Modulos/Mantenimiento/fleetrun/
// ================================================================

// 🔥 VARIABLES GLOBALES FLEETRUN (patrón seguro para SPA: evita redeclaración en re-visita)
window.dataGlobalFleetrun   = window.dataGlobalFleetrun   || [];
window.isHistorialFleetrun  = window.isHistorialFleetrun  || false;
window.expandAllState       = window.expandAllState       || false;
window.chartDashFleetrunInst = window.chartDashFleetrunInst || null;

function cargarTablaFleetrun(forzarRefresh = false) {
    if (!forzarRefresh && dataGlobalFleetrun.length > 0) { mostrarFleetrun(dataGlobalFleetrun); return; }
    const cuerpo = document.getElementById('cuerpoTablaFleetrun');
    if (cuerpo) {
        cuerpo.innerHTML = typeof generarSkeletonHtml === 'function'
            ? generarSkeletonHtml(10, 6)
            : '<tr><td colspan="10" class="text-center py-4"><span class="spinner-border text-warning spinner-border-sm"></span> Cargando...</td></tr>';
    }
    google.script.run.withSuccessHandler(mostrarFleetrun).obtenerDatosFleetrun();
}

function toggleVistaFleetrun() { isHistorialFleetrun = !isHistorialFleetrun; let textBtn = document.getElementById('text-toggle-fleetrun'); if(textBtn) { textBtn.innerText = isHistorialFleetrun ? "Ver Últimos Preventivos" : "Ver Historial Completo"; } expandAllState = false; mostrarFleetrun(dataGlobalFleetrun); }

function toggleAllFleetrunGroups() { expandAllState = !expandAllState; const rows = document.querySelectorAll('.child-row-fleetrun'); const icons = document.querySelectorAll('#cuerpoTablaFleetrun .group-header i'); rows.forEach(row => { let header = row.previousElementSibling; while(header && !header.classList.contains('group-header')) { header = header.previousElementSibling; } if(header && header.style.display !== 'none') { row.style.display = expandAllState ? '' : 'none'; } }); icons.forEach(i => { if(i.classList.contains('text-warning')) { i.className = expandAllState ? "bi bi-chevron-down ms-1 me-2 text-warning" : "bi bi-chevron-right ms-1 me-2 text-warning"; } }); }

function mostrarFleetrun(datos) {
  if (procesadorErroresCuota(datos, 'cuerpoTablaFleetrun')) return;
  dataGlobalFleetrun = datos;
  window.dataGlobalFleetrun = datos; // sincronizar para acceso cross-módulo

  let parseFecha = (str) => {
      if(!str) return 0;
      let p = str.split('/');
      if(p.length === 3) return new Date(p[2], p[1]-1, p[0]).getTime();
      return new Date(str).getTime() || 0;
  };

  let datosOrdenados = [...datos].sort((a,b) => parseFecha(b[3]) - parseFecha(a[3]));

  let datosAMostrar = [];
  if (isHistorialFleetrun) {
      datosAMostrar = datosOrdenados;
  } else {
      let mapa = new Map();
      datosOrdenados.forEach(row => {
          let placa = normalizeStr(row[4]);
          let tipo = normalizeStr(row[8]);
          let key = placa + "_" + tipo;

          let infoPlaca = (dataGlobalPlacas && dataGlobalPlacas.length > 0)
              ? dataGlobalPlacas.find(p => normalizeStr(p[0]) === placa)
              : null;
          // Race condition F5: si placas no cargaron aún, mostrar todo; root re-renderizará cuando lleguen
          const placasListas = dataGlobalPlacas && dataGlobalPlacas.length > 0;
          if (!mapa.has(key) && (!placasListas || (infoPlaca && infoPlaca[18] === 'Activa'))) {
              mapa.set(key, row);
          }
      });
      datosAMostrar = Array.from(mapa.values());
  }

  let html = '';
  let cntVig = 0, cntPV = 0, cntVenc = 0;
  if(!datosAMostrar || datosAMostrar.length === 0) { html = '<tr><td colspan="10" class="text-center py-4" style="color: var(--subtext) !important;">No hay mantenimientos.</td></tr>'; }
  else {
      let p = permisosUsuario || {}; let isAdmF = p.admin === true || (localStorage.getItem('crm_correo') || '').toLowerCase() === 'admin@azkell.com'; let canEditF = isAdmF || p.fleet?.e === true; let canDeleteF = isAdmF || p.fleet?.d === true; let setFClientes = new Set(); let setFUts = new Set(); let mapPlacas = new Map();
      datosAMostrar.forEach((fila) => { let placaRaw = fila[4] || "-"; if(!mapPlacas.has(placaRaw)) mapPlacas.set(placaRaw, []); mapPlacas.get(placaRaw).push(fila); });
      mapPlacas.forEach((mantenimientos, placaRaw) => {
          let infoP = dataGlobalPlacas.find(p => p[0] === placaRaw); let cli = infoP ? infoP[1] : (mantenimientos[0][6] || "-"); let utsRaw = (infoP && infoP[19] && String(infoP[19]).trim() !== '') ? infoP[19] : (mantenimientos[0][7] || "-"); let utsDisplay = (utsRaw === "-" || utsRaw === "") ? "-" : utsRaw.charAt(0).toUpperCase() + utsRaw.slice(1).toLowerCase();
          let isActive = infoP && infoP[18] === 'Activa'; if(isActive && cli && cli !== "-") setFClientes.add(cli); if(utsDisplay !== "-") setFUts.add(utsDisplay);
          let classPlaca = normalizarClase(placaRaw);
          html += `<tr class="group-header data-row-fleetrun" style="cursor:pointer;" onclick="toggleGroupRow('child-${classPlaca}', this)" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}">
              <td colspan="10" class="fw-bold text-start" style="background-color: rgba(128,128,128,0.1) !important; color: var(--text) !important;"><i class="bi bi-chevron-right ms-1 me-2 text-warning toggle-icon-${classPlaca}"></i> <span style="display:inline-block; min-width:80px;">${placaRaw}</span><span class="badge bg-secondary ms-2">${cli}</span><span class="badge bg-info text-dark ms-2">${utsDisplay}</span><span class="badge bg-warning text-dark float-end">${mantenimientos.length} Registros</span></td></tr>`;
          mantenimientos.forEach((fila) => {
              let id = fila[0]; let fechaStr = fila[3]; let tipo_mp = fila[8]; let obs = fila[14] || ''; let km_cambio = parseFloat(fila[9]) || 0; let frecuencia = parseFloat(fila[10]) || 0; let km_prox = parseFloat(fila[11]) || 0; let fechaLimpia = parseDateToDDMMYYYY(fechaStr);

              let km_gps = parseFloat(fila[14]) || 0;
              let isLive = false;
              let wialonData = buscarWialonPorPlaca(placaRaw);
              if (wialonData) {
                  km_gps = wialonData.km;
                  isLive = true;
              }

              let falta_km = km_prox - km_gps; let badgeClass = ""; let iconFalta = ""; let estadoKpi = "";
              if (falta_km <= 0) { badgeClass = "bg-danger text-white"; iconFalta = `<i class="bi bi-exclamation-circle-fill"></i>`; estadoKpi = "VENCIDO"; cntVenc++;
              } else if (falta_km > 0 && ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100))) { badgeClass = "bg-warning text-dark"; iconFalta = `<i class="bi bi-exclamation-triangle-fill"></i>`; estadoKpi = "POR_VENCER"; cntPV++;
              } else { badgeClass = "bg-success text-white"; iconFalta = `<i class="bi bi-check-circle-fill"></i>`; estadoKpi = "VIGENTE"; cntVig++; }
              let fmtTipo = `<span style="color: #2D438A; font-weight: bold;">${tipo_mp}</span>`; let fmtFrec = `<span style="color: orange; font-weight: bold;">${frecuencia.toLocaleString()}</span>`;

              let fmtKmGps = isLive ? `<span class="badge bg-primary shadow-sm px-2"><i class="bi bi-broadcast"></i> ${km_gps.toLocaleString()}</span>` : `<span style="color: #64748b; font-weight: bold;">${km_gps.toLocaleString()}</span>`;
              let fmtFalta = `<span class="badge ${badgeClass} shadow-sm" style="font-size: 0.8rem; padding: 0.4em 0.6em;">${iconFalta} ${falta_km.toLocaleString()}</span>`;

              let menuAcciones = ''; if (canEditF || canDeleteF) { let items = ''; if(canEditF) items += `<li><a class="dropdown-item" href="#" onclick="abrirModalEditarFleetrun('${id}')"><i class="bi bi-pencil text-primary"></i> Editar</a></li>`; if(canEditF && canDeleteF) items += `<li><hr class="dropdown-divider"></li>`; if(canDeleteF) items += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${id}', 'Fleetrun')"><i class="bi bi-trash"></i> Eliminar</a></li>`; menuAcciones = `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${items}</ul></div>`; } else { menuAcciones = `<span class="text-muted"><i class="bi bi-dash"></i></span>`; }
              let chkHtml = (window.modoSeleccion && window.modoSeleccion['fleetrun']) ? `<input type="checkbox" class="form-check-input float-start ms-2 chk-bulk-fleetrun" value="${id}" onclick="event.stopPropagation(); toggleBulkBtn('fleetrun')">` : '';
              let originalIndex = dataGlobalFleetrun.findIndex(x => x[0] === id);
              html += `<tr class="child-${classPlaca} clickable-row data-row-fleetrun child-row-fleetrun" style="display:none;" onclick="if(window.modoSeleccion&&window.modoSeleccion['fleetrun']){seleccionarFilaFleetrun(event,this)}else if(!event.target.closest('.dropdown')&&!event.target.closest('.btn-icon-dropdown')){mostrarDetalleFleetrun(${originalIndex})}" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}" data-fecha="${fechaLimpia}" data-estado-kpi="${estadoKpi}"><td class="text-end text-muted" style="font-size: 0.75rem;" data-value="${placaRaw}">${chkHtml}∟</td><td>${fechaLimpia}</td><td>${fmtTipo}</td><td>${km_cambio.toLocaleString()}</td><td>${fmtFalta}</td><td>${km_prox.toLocaleString()}</td><td class="text-truncate" style="max-width: 150px;">${obs}</td><td>${fmtFrec}</td><td>${fmtKmGps}</td><td>${menuAcciones}</td></tr>`;
          });
      });
      rellenarFiltroCheck('filtroFleetCliente', setFClientes, 'filtrarFleetrunAvanzado'); rellenarFiltroCheck('filtroFleetUts', setFUts, 'filtrarFleetrunAvanzado');
  }
  document.getElementById('cuerpoTablaFleetrun').innerHTML = html;
  let kpiV = document.getElementById('kpi-fleet-vigentes'); if(kpiV) kpiV.textContent = cntVig;
  let kpiP = document.getElementById('kpi-fleet-porvencer'); if(kpiP) kpiP.textContent = cntPV;
  let kpiVe = document.getElementById('kpi-fleet-vencidos'); if(kpiVe) kpiVe.textContent = cntVenc;
  if (!isHistorialFleetrun) { updateGraficoFleetrun(cntVig, cntPV, cntVenc); }
  if (typeof window.initColPicker === 'function') {
      window.initColPicker('col-picker-fleet', 'tablaFleetrun', [
          {label: 'Fecha',         idx: 1, visible: true},
          {label: 'Tipo MP',       idx: 2, visible: true},
          {label: 'KM Cambio',     idx: 3, visible: true},
          {label: 'Falta',         idx: 4, visible: true},
          {label: 'Prox. Cambio',  idx: 5, visible: true},
          {label: 'Observación',   idx: 6, visible: true},
          {label: 'Frecuencia',    idx: 7, visible: true},
          {label: 'KM GPS',        idx: 8, visible: true}
      ], 'fleet_cols_fleetrun');
  }
}

window.filtrarFleetrunAvanzado = function() {
    const txt = document.getElementById('buscadorFleetrun')?.value.toLowerCase() || '';
    const dateF = document.getElementById('buscadorFechaFleetrun')?.value || '';
    let dateCompare = ''; if(dateF) { let p = dateF.split('-'); dateCompare = `${p[2]}/${p[1]}/${p[0]}`; }
    const chkCli = Array.from(document.querySelectorAll('#filtroFleetCliente input:checked')).map(e=>e.value);
    const chkUts = Array.from(document.querySelectorAll('#filtroFleetUts input:checked')).map(e=>e.value);
    const chkEst = Array.from(document.querySelectorAll('#filtroFleetEstado input:checked')).map(e=>e.value);

    let isFiltering = txt !== '' || dateCompare !== '' || chkCli.length > 0 || chkUts.length > 0 || chkEst.length > 0;
    let cntTotalVig = 0, cntTotalPV = 0, cntTotalVenc = 0;

    const headers = document.querySelectorAll('#cuerpoTablaFleetrun tr.group-header');
    headers.forEach(header => {
        const placaRaw = header.getAttribute('data-placa'); const classPlaca = normalizarClase(placaRaw);
        const cli = header.getAttribute('data-cliente'); const uts = header.getAttribute('data-uts');
        let childRows = document.querySelectorAll(`.child-${classPlaca}`);
        let hasVisibleChild = false;
        let matchCli = (!chkCli.length || chkCli.includes(cli)); let matchUts = (!chkUts.length || chkUts.includes(uts));
        if(matchCli && matchUts) {
            childRows.forEach(row => {
                let textoRow = row.innerText.toLowerCase() + " " + placaRaw.toLowerCase();
                let rowFecha = row.getAttribute('data-fecha');
                let kpiFila = row.getAttribute('data-estado-kpi');
                let matchTxt = (!txt || textoRow.includes(txt));
                let matchDate = (!dateCompare || rowFecha === dateCompare);
                let matchKpi = (!chkEst.length || chkEst.includes(kpiFila));
                if(matchTxt && matchDate && matchKpi) {
                    row.style.display = isFiltering ? '' : (expandAllState ? '' : 'none');
                    hasVisibleChild = true;
                    if (kpiFila === 'VIGENTE') cntTotalVig++;
                    else if (kpiFila === 'POR_VENCER') cntTotalPV++;
                    else if (kpiFila === 'VENCIDO') cntTotalVenc++;
                } else {
                    row.style.display = 'none';
                }
            });
            let icon = header.querySelector('i');
            if(icon) {
                if (isFiltering && hasVisibleChild) icon.className = "bi bi-chevron-down ms-1 me-2 text-warning";
                else icon.className = expandAllState ? "bi bi-chevron-down ms-1 me-2 text-warning" : "bi bi-chevron-right ms-1 me-2 text-warning";
            }
        } else {
            childRows.forEach(row => row.style.display = 'none');
        }
        header.style.display = hasVisibleChild ? '' : 'none';
    });
    updateGraficoFleetrun(cntTotalVig, cntTotalPV, cntTotalVenc);
};

function abrirModalNuevoFleetrun() { document.getElementById('formFleetrun').reset(); document.getElementById('f_id').value = ''; let tzOffset = (new Date()).getTimezoneOffset() * 60000; let today = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0]; document.getElementById('f_fecha').value = today; autocompletarFecha('f'); new bootstrap.Modal(document.getElementById('modalFleetrun')).show(); }

window.autocompletarFleetrun = function(prefix) {
    let placaInput = normalizeStr(document.getElementById(prefix + '_placa').value);
    let match = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placaInput);

    if(match) {
        document.getElementById(prefix + '_marca').value = match[3] || "";
        document.getElementById(prefix + '_dueno').value = match[1] || "";
        document.getElementById(prefix + '_uts').value = match[19] || "";
        calcularFrecuencia(prefix);
    } else {
        document.getElementById(prefix + '_marca').value = "";
        document.getElementById(prefix + '_dueno').value = "";
        document.getElementById(prefix + '_uts').value = "";
    }

    let wialonData = buscarWialonPorPlaca(placaInput);
    if(wialonData) {
        document.getElementById(prefix + '_kmgps').value = wialonData.km;
    } else { document.getElementById(prefix + '_kmgps').value = ''; }
};

window.mostrarDetalleFleetrun = function(index) {
    if (!dataGlobalFleetrun || !dataGlobalFleetrun[index]) return;
    let fila = dataGlobalFleetrun[index];

    let idStr = fila[0] || "-";
    let fecha = fila[3] || "-";
    let placa = normalizeStr(fila[4]) || "-";

    let infoPlaca = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placa);
    let marca = infoPlaca ? (infoPlaca[2] || fila[5] || "-") : (fila[5] || "-");
    let dueno = infoPlaca ? (infoPlaca[3] || fila[6] || "-") : (fila[6] || "-");
    let utsRaw = (infoPlaca && infoPlaca[19] && String(infoPlaca[19]).trim() !== '') ? infoPlaca[19] : (fila[7] || "-");

    let tipo_mp = fila[8] || "-";
    let km_actual = parseFloat(fila[9]) || 0;
    let frecuencia = parseFloat(fila[10]) || 0;
    let km_prox = parseFloat(fila[11]) || 0;
    let tecnico = fila[12] || "-";
    let obs = fila[13] || "";

    let isLive = false;
    let km_gps = 0;
    let wialonData = buscarWialonPorPlaca(placa);
    if (wialonData) { km_gps = wialonData.km; isLive = true; }

    let falta_km = km_prox - km_gps;
    let badgeClass = "", estadoText = "";
    if (falta_km <= 0) {
        badgeClass = "bg-danger text-white"; estadoText = "VENCIDO";
    } else if ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100)) {
        badgeClass = "bg-warning text-dark"; estadoText = "POR VENCER";
    } else {
        badgeClass = "bg-success text-white"; estadoText = "VIGENTE";
    }

    let html = `
        <div class="text-center mb-4">
            <h3 class="fw-bold text-primary mb-1">${fila[4] || '-'}</h3>
            <div class="text-muted small mb-2">${marca} • ${dueno}</div>
            <span class="badge bg-primary text-white shadow-sm me-1">${tipo_mp}</span>
            <span class="badge shadow-sm px-2 py-1" style="background-color: var(--text) !important; color: var(--surface) !important; border: 1px solid var(--border); font-weight: bold;">${utsRaw}</span>
        </div>
        <ul class="list-group list-group-flush shadow-sm rounded border" style="font-size: 0.9rem;">
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-hash"></i> ID Mantenimiento</span>
                <span class="fw-bold">${idStr}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-calendar3"></i> Fecha Registro</span>
                <span>${fecha}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-speedometer"></i> KM de Registro</span>
                <span>${km_actual.toLocaleString()} km</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-arrow-repeat"></i> Frecuencia</span>
                <span class="text-warning fw-bold">${frecuencia.toLocaleString()} km</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-flag"></i> KM Próximo</span>
                <span class="fw-bold">${km_prox.toLocaleString()} km</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-broadcast"></i> KM GPS Actual</span>
                ${isLive ? `<span class="badge bg-primary px-2 py-1"><i class="bi bi-broadcast"></i> ${km_gps.toLocaleString()} km</span>` : `<span class="text-secondary fw-bold">${km_gps.toLocaleString()} km</span>`}
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-heart-pulse"></i> Estado</span>
                <span class="badge ${badgeClass} shadow-sm px-2 py-1" style="font-size: 0.8rem;">${estadoText} (Faltan ${falta_km.toLocaleString()} km)</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-person-badge"></i> Técnico</span>
                <span class="text-end" style="max-width: 55%;">${tecnico}</span>
            </li>
        </ul>
    `;

    if (obs && obs.trim() !== "" && obs.trim() !== "-") {
        html += `
            <div class="mt-4 p-3 rounded shadow-sm border" style="background-color: var(--surface);">
                <h6 class="fw-bold text-danger mb-2" style="font-size: 0.8rem;"><i class="bi bi-card-text"></i> OBSERVACIONES</h6>
                <p class="mb-0" style="color: var(--text); font-size: 0.85rem; line-height: 1.4;">${obs}</p>
            </div>
        `;
    }

    document.getElementById('detalleFleetrunContenido').innerHTML = html;
    let offcanvasElement = document.getElementById('offcanvasFleetrun');
    let bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasElement);
    if (!bsOffcanvas) bsOffcanvas = new bootstrap.Offcanvas(offcanvasElement);
    bsOffcanvas.show();
};

function abrirModalEditarFleetrun(idReg) { const p = dataGlobalFleetrun.find(x => x[0] === idReg); if (!p) return; document.getElementById('formEditarFleetrun').reset(); let dDate = new Date(p[1]); let fechaFormat = isNaN(dDate.getTime()) ? "" : dDate.toISOString().split('T')[0]; document.getElementById('eF_id').value = p[0]; document.getElementById('eF_fecha').value = fechaFormat; document.getElementById('eF_mes').value = p[2]; document.getElementById('eF_anio').value = p[3]; document.getElementById('eF_placa').value = p[4]; document.getElementById('eF_marca').value = p[5]; document.getElementById('eF_dueno').value = p[6]; document.getElementById('eF_uts').value = p[7]; document.getElementById('eF_tipomp').value = p[8]; document.getElementById('eF_kmact').value = p[9]; document.getElementById('eF_freckm').value = p[10]; document.getElementById('eF_kmprox').value = p[11]; document.getElementById('eF_obs').value = p[12]; document.getElementById('eF_tec').value = p[13]; document.getElementById('eF_kmgps').value = p[14]; const btn = document.getElementById('btnActualizarFleetrun'); btn.disabled = false; btn.innerHTML = 'Actualizar Registro'; new bootstrap.Modal(document.getElementById('modalEditarFleetrun')).show(); }

function enviarFleetrun(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnGuardarFleetrun'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...'; if(!formObj.f_id.value) formObj.f_id.value = "FL-" + Date.now(); formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { formObj.reset(); bootstrap.Modal.getInstance(document.getElementById('modalFleetrun')).hide(); cargarTablaFleetrun(true); } else alert(r); btn.disabled = false; btn.innerHTML = 'Guardar'; }).withFailureHandler(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Guardar'; }).guardarFleetrun(formObj); }

function enviarEdicionFleetrun(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnActualizarFleetrun'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Actualizando...'; formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { bootstrap.Modal.getInstance(document.getElementById('modalEditarFleetrun')).hide(); cargarTablaFleetrun(true); } else alert(r); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).withFailureHandler(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).actualizarFleetrun(formObj); }

window.activarModoSeleccionFleetrun = function() {
    window.modoSeleccion = window.modoSeleccion || {};
    window.modoSeleccion['fleetrun'] = !window.modoSeleccion['fleetrun'];

    const btnAll = document.getElementById('btn-select-all-fleetrun');
    const btnBulk = document.getElementById('btn-bulk-fleetrun');
    const btnActivar = document.getElementById('btn-activar-sel-fleetrun');

    if (window.modoSeleccion['fleetrun']) {
        btnAll.classList.remove('d-none');
        btnAll.innerHTML = '<i class="bi bi-check-square"></i> Seleccionar Todo';
        btnAll.classList.replace('btn-primary', 'btn-outline-primary');

        if(btnActivar) {
            btnActivar.classList.replace('btn-outline-secondary', 'btn-secondary');
            btnActivar.classList.add('text-white');
            btnActivar.innerHTML = '<i class="bi bi-x-circle"></i> Cancelar Selección';
        }
    } else {
        btnAll.classList.add('d-none');
        btnBulk.classList.add('d-none');

        btnAll.innerHTML = '<i class="bi bi-check-square"></i> Seleccionar Todo';
        btnAll.classList.replace('btn-primary', 'btn-outline-primary');

        if(btnActivar) {
            btnActivar.classList.replace('btn-secondary', 'btn-outline-secondary');
            btnActivar.classList.remove('text-white');
            btnActivar.innerHTML = '<i class="bi bi-ui-checks"></i> Seleccionar';
        }

        document.querySelectorAll('.chk-bulk-fleetrun').forEach(c => c.checked = false);
        document.querySelectorAll('.child-row-fleetrun').forEach(c => c.classList.remove('row-selected'));
    }
    mostrarFleetrun(dataGlobalFleetrun);
};

window.seleccionarFilaFleetrun = function(event, trElement) {
    if (window.modoSeleccion && window.modoSeleccion['fleetrun']) {
        if (event.target.closest('.btn-icon-dropdown') || event.target.closest('.dropdown-menu')) return;
        const checkbox = trElement.querySelector('.chk-bulk-fleetrun');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) trElement.classList.add('row-selected');
            else trElement.classList.remove('row-selected');
            toggleBulkBtn('fleetrun');
        }
    }
};

window.seleccionarTodasLasFleetrun = function() {
    const btnAll = document.getElementById('btn-select-all-fleetrun');
    const checkboxes = document.querySelectorAll('.chk-bulk-fleetrun');
    const accionEsMarcar = btnAll.innerText.includes('Seleccionar Todo');

    checkboxes.forEach(chk => {
        chk.checked = accionEsMarcar;
        const row = chk.closest('.child-row-fleetrun');
        if (row) {
            if (accionEsMarcar) row.classList.add('row-selected');
            else row.classList.remove('row-selected');
        }
    });

    if (accionEsMarcar) {
        btnAll.innerHTML = '<i class="bi bi-check-square-fill"></i> Desmarcar Todo';
        btnAll.classList.replace('btn-outline-primary', 'btn-primary');
    } else {
        btnAll.innerHTML = '<i class="bi bi-check-square"></i> Seleccionar Todo';
        btnAll.classList.replace('btn-primary', 'btn-outline-primary');
    }
    toggleBulkBtn('fleetrun');
};

window.descargarPlantillaFleetrun = function() {
    const ws_data = [
        ['FECHA INGRESO', 'PLACA', 'TIPO MP', 'KM ACTUAL', 'FRECUENCIA', 'TECNICO', 'OBSERVACION'],
        ['2024-05-20', 'ABC-123', 'MP1', '150000', '15000', 'JUAN PEREZ', 'Mantenimiento preventivo general']
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Fleetrun");
    XLSX.writeFile(wb, "Plantilla_Importacion_Fleetrun.xlsx");
};

window.exportarExcelFleetrun = function() {
    if (!dataGlobalFleetrun || dataGlobalFleetrun.length === 0) {
        alert("No hay mantenimientos cargados para exportar."); return;
    }
    const ws_data = [['ID', 'FECHA INGRESO', 'PLACA', 'TIPO MP', 'KM ACTUAL', 'FRECUENCIA', 'KM PROXIMO', 'TECNICO', 'OBSERVACION']];
    dataGlobalFleetrun.forEach(f => {
        if (f.estado === 'Eliminada') return;
        ws_data.push([f[0]||'', f[3]||'', f[4]||'', f[8]||'', f[9]||'', f[10]||'', f[11]||'', f[13]||'', f[14]||'']);
    });
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Base_Fleetrun");
    XLSX.writeFile(wb, "Reporte_Fleetrun_Completo.xlsx");
};

window.importarExcelFleetrun = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false, dateNF: 'yyyy-mm-dd' });

        if (rawJson.length === 0) { alert("Archivo vacío o inválido."); return; }

        const ok = await (typeof window.confirmar === 'function'
            ? window.confirmar({ titulo: 'Importar Fleetrun', mensaje: `Se importarán o actualizarán <strong>${rawJson.length} registros</strong> en Fleetrun. ¿Continuar?`, textoConfirmar: 'Sí, importar' })
            : Promise.resolve(confirm(`Se importarán o actualizarán ${rawJson.length} registros en Fleetrun.\n¿Continuar?`)));
        if (!ok) { event.target.value = ''; return; }

        document.body.style.cursor = 'wait';

        let registrosProcesados = rawJson.map(r => {
            let fechaIngreso = r['FECHA INGRESO'] || '';
            if (fechaIngreso.includes('/')) {
                let p = fechaIngreso.split('/');
                if (p[2] && p[2].length === 4) fechaIngreso = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
            }
            let kmact = parseFloat(r['KM ACTUAL'] || 0);
            let frec = parseFloat(r['FRECUENCIA'] || 0);
            return {
                id: r['ID'] || `FLT-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                fecha: fechaIngreso,
                placa: r['PLACA'] || '',
                tipomp: r['TIPO MP'] || '',
                kmact: kmact.toString(),
                freckm: frec.toString(),
                kmprox: (kmact + frec).toString(),
                tec: r['TECNICO'] || '',
                obs: r['OBSERVACION'] || '',
                mes: fechaIngreso ? fechaIngreso.split('-')[1] : '',
                anio: fechaIngreso ? fechaIngreso.split('-')[0] : ''
            };
        });

        fetch('/api/importarFleetrunMasivo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registros: registrosProcesados })
        }).then(res => res.json()).then(r => {
            document.body.style.cursor = 'default'; event.target.value = '';
            alert(`Importación completada.\nProcesados: ${r.ok}\nErrores: ${r.errores}`);
            recargarModulo('fleetrun');
        }).catch(err => {
            document.body.style.cursor = 'default'; event.target.value = '';
            alert("Error: " + err.message);
        });
    };
    reader.readAsArrayBuffer(file);
};

window.chartFleetrunInst = window.chartFleetrunInst || null;

window.toggleGraficosFleetrun = function() {
    let panel = document.getElementById('panelGraficosFleetrun');
    let btn = document.getElementById('btnToggleGraficosFleetrun');
    if(panel.style.display === 'none') {
        panel.style.display = 'flex';
        btn.innerHTML = '<i class="bi bi-eye-slash-fill"></i> Ocultar Gráficos';
    } else {
        panel.style.display = 'none';
        btn.innerHTML = '<i class="bi bi-eye-fill"></i> Mostrar Gráficos';
    }
};

window.initGraficoFleetrun = function() {
    let ctx = document.getElementById('chartFleetrunStatus');
    if(!ctx) return null;

    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Vigentes', 'Por Vencer', 'Vencidos'],
            datasets: [{ data: [1, 0, 0], backgroundColor: ['#16a34a', '#eab308', '#dc2626'], borderWidth: 2, hoverOffset: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            layout: { padding: { left: 10, right: 10, top: 10, bottom: 10 } },
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Inter', weight: 'bold' } } },
                datalabels: {
                    color: document.body.classList.contains('dark') ? '#ffffff' : '#000000',
                    font: { weight: 'bold', size: 12, family: 'Inter' },
                    formatter: (value, context) => {
                        let total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        if (total === 0 || value === 0 || context.chart.data.labels[0] === 'Sin Datos') return "";
                        return Math.round((value / total) * 100) + "%";
                    }
                }
            },
            onClick: (e, elements, chart) => {
                if (elements.length > 0 && chart.data.labels[0] !== 'Sin Datos') {
                    const index = elements[0].index;
                    let estadoVal = ['VIGENTE', 'POR_VENCER', 'VENCIDO'][index] || '';
                    document.querySelectorAll('#filtroFleetEstado input:checked').forEach(c => c.checked = false);
                    let checkbox = document.querySelector(`#filtroFleetEstado input[value="${estadoVal}"]`);
                    if(checkbox) checkbox.checked = true;
                    filtrarFleetrunAvanzado();
                }
            }
        }
    });
};

window.updateGraficoFleetrun = function(vigentes, porVencer, vencidos) {
    if(!window.chartFleetrunInst) window.chartFleetrunInst = initGraficoFleetrun();
    if(!window.chartFleetrunInst) return;
    let isDark = document.body.classList.contains('dark');
    window.chartFleetrunInst.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1a1a2e';
    window.chartFleetrunInst.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
    window.chartFleetrunInst.options.plugins.datalabels.color = isDark ? '#ffffff' : '#000000';
    if(vigentes + porVencer + vencidos === 0) {
        window.chartFleetrunInst.data.labels = ['Sin Datos'];
        window.chartFleetrunInst.data.datasets[0].data = [1];
        window.chartFleetrunInst.data.datasets[0].backgroundColor = ['#475569'];
    } else {
        window.chartFleetrunInst.data.labels = ['Vigentes', 'Por Vencer', 'Vencidos'];
        window.chartFleetrunInst.data.datasets[0].data = [vigentes, porVencer, vencidos];
        window.chartFleetrunInst.data.datasets[0].backgroundColor = ['#16a34a', '#eab308', '#dc2626'];
    }
    window.chartFleetrunInst.update();
};

window.procesarFleetrunParaDashboard = function() {
    if (!dataGlobalFleetrun || dataGlobalFleetrun.length === 0 || !dataGlobalPlacas || dataGlobalPlacas.length === 0) {
        setTimeout(procesarFleetrunParaDashboard, 500);
        return;
    }

    let cntTotalVig = 0, cntTotalPV = 0, cntTotalVenc = 0;
    let parseFecha = (str) => {
        if(!str) return 0;
        if(str.includes('/')) { let p = str.split('/'); return new Date(p[2], p[1]-1, p[0]).getTime(); }
        return new Date(str).getTime() || 0;
    };

    let mapa = new Map();
    [...dataGlobalFleetrun].sort((a,b) => parseFecha(b[3]) - parseFecha(a[3])).forEach(row => {
        let placa = normalizeStr(row[4]);
        let tipo = normalizeStr(row[8]);
        let key = placa + "_" + tipo;

        let infoPlaca = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placa);
        if (infoPlaca && infoPlaca[18] === 'Activa' && !mapa.has(key)) {
            mapa.set(key, { row: row, infoPlaca: infoPlaca });
        }
    });

    let datosActuales = Array.from(mapa.values());

    datosActuales.forEach((item) => {
        let fila = item.row;
        let infoPlaca = item.infoPlaca;

        let placaRaw = fila[4];
        let km_prox = parseFloat(fila[11]) || 0;

        let utsRaw = (infoPlaca && infoPlaca[19] && String(infoPlaca[19]).trim() !== '') ? infoPlaca[19] : (fila[7] || "-");

        let km_gps = 0;
        let wialonData = buscarWialonPorPlaca(placaRaw);
        if (wialonData) { km_gps = wialonData.km; }

        let falta_km = km_prox - km_gps;

        if (falta_km <= 0) {
            cntTotalVenc++;
        } else if (falta_km > 0 && ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100))) {
            cntTotalPV++;
        } else {
            cntTotalVig++;
        }
    });

    updateGraficoDashFleetrun(cntTotalVig, cntTotalPV, cntTotalVenc);
};

window.initGraficoDashFleetrun = function() {
    let ctx = document.getElementById('chartDashFleetrunStatus');
    if (!ctx) return null;
    Chart.defaults.font.family = 'Inter';

    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Vigentes', 'Por Vencer', 'Vencidos'],
            datasets: [{
                data: [1, 0, 0],
                backgroundColor: ['#16a34a', '#eab308', '#dc2626'],
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            layout: { padding: { left: 10, right: 10, top: 10, bottom: 10 } },
            plugins: {
                legend: { position: 'bottom', labels: { font: { weight: 'bold' } } },
                datalabels: {
                    color: document.body.classList.contains('dark') ? '#ffffff' : '#000000',
                    font: { weight: 'bold', size: 12 },
                    formatter: (value, context) => {
                        let total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        if (total === 0 || value === 0 || context.chart.data.labels[0] === 'Sin Datos') return "";
                        return Math.round((value / total) * 100) + "%";
                    }
                }
            }
        }
    });
};

window.updateGraficoDashFleetrun = function(vigentes, porVencer, vencidos) {
    if(!chartDashFleetrunInst) chartDashFleetrunInst = initGraficoDashFleetrun();
    if(!chartDashFleetrunInst) return;
    let isDark = document.body.classList.contains('dark');
    chartDashFleetrunInst.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1a1a2e';
    chartDashFleetrunInst.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
    chartDashFleetrunInst.options.plugins.datalabels.color = isDark ? '#ffffff' : '#000000';
    if(vigentes + porVencer + vencidos === 0) {
        chartDashFleetrunInst.data.labels = ['Sin Datos'];
        chartDashFleetrunInst.data.datasets[0].data = [1];
        chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#475569'];
    } else {
        chartDashFleetrunInst.data.labels = ['Vigentes', 'Por Vencer', 'Vencidos'];
        chartDashFleetrunInst.data.datasets[0].data = [vigentes, porVencer, vencidos];
        chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#16a34a', '#eab308', '#dc2626'];
    }
    chartDashFleetrunInst.update();
};

// ================================================================
// 🚀 FUNCIÓN DE ARRANQUE — llamada por el Router
// ================================================================
window.init_fleetrun = function() {
    // El router re-inyecta el HTML → el canvas es nuevo → destruir instancia anterior del gráfico
    if (window.chartFleetrunInst) {
        window.chartFleetrunInst.destroy();
        window.chartFleetrunInst = null;
    }

    // Usar datos ya en memoria si existen (evita re-fetch innecesario y la race condition con placas)
    const datosEnMemoria = (window.dataGlobalFleetrun && window.dataGlobalFleetrun.length > 0)
        ? window.dataGlobalFleetrun
        : dataGlobalFleetrun;

    if (datosEnMemoria.length > 0) {
        mostrarFleetrun(datosEnMemoria);
    } else {
        cargarTablaFleetrun();
    }
};

// Alias global para recargarModulo (main logica.js)
window.cargarTablaFleetrun = function(forzar) { cargarTablaFleetrun(forzar); };
