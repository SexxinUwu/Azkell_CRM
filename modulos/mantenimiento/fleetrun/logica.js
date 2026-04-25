// ================================================================
// MÓDULO: FLEETRUN — Sistema de Mantenimiento Preventivo
// Aislado en SPA: Modulos/Mantenimiento/fleetrun/
// ================================================================

// 🔥 VARIABLES GLOBALES FLEETRUN (patrón seguro para SPA: evita redeclaración en re-visita)
window.dataGlobalFleetrun   = window.dataGlobalFleetrun   || [];
window.isHistorialFleetrun  = window.isHistorialFleetrun  || false;
window.expandAllState       = window.expandAllState       || false;
window.chartDashFleetrunInst = window.chartDashFleetrunInst || null;
window._metricaMap          = window._metricaMap          || {}; // placa.toUpperCase() → 'km' | 'horas'
window._kmDiaMap            = window._kmDiaMap            || {}; // placa.toUpperCase() → km/día promedio
window._fleetrunDetalleId   = window._fleetrunDetalleId   || null; // ID del registro abierto en offcanvas

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

  let _hoy = Date.now();
  let datosOrdenados = [...datos].sort((a, b) => {
      let ta = parseFecha(a[3]), tb = parseFecha(b[3]);
      // Registros con fecha futura (>1 día adelante) van al final para que no "ganen" el mapa
      let aFuturo = ta > _hoy + 86400000;
      let bFuturo = tb > _hoy + 86400000;
      if (aFuturo !== bFuturo) return aFuturo ? 1 : -1;
      if (tb !== ta) return tb - ta; // más reciente primero
      return parseInt(b[15] || 0) - parseInt(a[15] || 0); // mismo día → mayor id DB gana (último registrado)
  });

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
      let canEditF = window.checkPerm('fleet','e'); let canDeleteF = window.checkPerm('fleet','d'); let setFClientes = new Set(); let setFUts = new Set(); let mapPlacas = new Map();
      datosAMostrar.forEach((fila) => { let placaRaw = fila[4] || "-"; if(!mapPlacas.has(placaRaw)) mapPlacas.set(placaRaw, []); mapPlacas.get(placaRaw).push(fila); });
      mapPlacas.forEach((mantenimientos, placaRaw) => {
          let infoP = dataGlobalPlacas.find(p => p[0] === placaRaw); let cli = infoP ? infoP[1] : (mantenimientos[0][6] || "-"); let utsRaw = (infoP && infoP[19] && String(infoP[19]).trim() !== '') ? infoP[19] : (mantenimientos[0][7] || "-"); let utsDisplay = (utsRaw === "-" || utsRaw === "") ? "-" : utsRaw.charAt(0).toUpperCase() + utsRaw.slice(1).toLowerCase();
          let isActive = infoP && infoP[18] === 'Activa'; if(isActive && cli && cli !== "-") setFClientes.add(cli); if(utsDisplay !== "-") setFUts.add(utsDisplay);
          let classPlaca = normalizarClase(placaRaw);
          let kmDiaInfo = window._kmDiaMap[(placaRaw||'').toUpperCase()];
          let esHorasGrp = (window._metricaMap[(placaRaw||'').toUpperCase()] === 'horas');
          let kmDiaBadge = '';
          if (kmDiaInfo) {
              let val = esHorasGrp ? kmDiaInfo.horas_dia : kmDiaInfo.km_dia;
              let unit = esHorasGrp ? 'h/día' : 'km/día';
              if (val != null && val > 0) {
                  kmDiaBadge = `<span class="badge bg-dark ms-2" style="font-size:0.65rem;opacity:0.75"><i class="bi bi-graph-up me-1"></i>${Number(val).toLocaleString()} ${unit}</span>`;
              }
          }
          html += `<tr class="group-header data-row-fleetrun" style="cursor:pointer;" onclick="toggleGroupRow('child-${classPlaca}', this)" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}">
              <td colspan="10" class="fw-bold text-start" style="background-color: rgba(128,128,128,0.1) !important; color: var(--text) !important;"><i class="bi bi-chevron-right ms-1 me-2 text-warning toggle-icon-${classPlaca}"></i> <span style="display:inline-block; min-width:80px;">${placaRaw}</span><i class="bi bi-info-circle-fill text-info ms-1" style="cursor:pointer;font-size:0.82rem;" title="Ver Detalle Placa" onclick="event.stopPropagation();if(typeof window.abrirDetallePlacaGlobal==='function')window.abrirDetallePlacaGlobal('${placaRaw}')"></i><span class="badge bg-secondary ms-2">${cli}</span><span class="badge bg-info text-dark ms-2">${utsDisplay}</span>${kmDiaBadge}<span class="badge bg-warning text-dark float-end">${mantenimientos.length} Registros</span></td></tr>`;
          mantenimientos.forEach((fila) => {
              let id = fila[0]; let fechaStr = fila[3]; let tipo_mp = fila[8]; let obs = fila[12] || ''; let km_cambio = parseFloat(fila[9]) || 0; let frecuencia = parseFloat(fila[10]) || 0; let km_prox = parseFloat(fila[11]) || 0; let fechaLimpia = parseDateToDDMMYYYY(fechaStr);

              let km_gps = parseFloat(fila[14]) || 0;
              let isLive = false;
              let wialonData = buscarWialonPorPlaca(placaRaw);
              let esHoras = (window._metricaMap[placaRaw.toUpperCase()] === 'horas');
              if (wialonData) {
                  km_gps = esHoras ? (wialonData.horas || 0) : wialonData.km;
                  isLive = true;
              }

              let falta_km = km_prox - km_gps; let badgeClass = ""; let iconFalta = ""; let estadoKpi = "";
              if (falta_km <= 0) { badgeClass = "bg-danger text-white"; iconFalta = `<i class="bi bi-exclamation-circle-fill"></i>`; estadoKpi = "VENCIDO"; cntVenc++;
              } else if (falta_km > 0 && ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100))) { badgeClass = "bg-warning text-dark"; iconFalta = `<i class="bi bi-exclamation-triangle-fill"></i>`; estadoKpi = "POR_VENCER"; cntPV++;
              } else { badgeClass = "bg-success text-white"; iconFalta = `<i class="bi bi-check-circle-fill"></i>`; estadoKpi = "VIGENTE"; cntVig++; }
              let fmtTipo = `<span style="color: #2D438A; font-weight: bold;">${tipo_mp}</span>`; let fmtFrec = `<span style="color: orange; font-weight: bold;">${frecuencia.toLocaleString()}</span>`;

              let gpsBadgeColor = esHoras ? 'bg-warning text-dark' : 'bg-primary';
              let gpsIcon       = esHoras ? 'bi-clock' : 'bi-broadcast';
              let gpsUnit       = esHoras ? ' h' : '';
              let fmtKmGps = isLive
                  ? `<span class="badge ${gpsBadgeColor} shadow-sm px-2"><i class="bi ${gpsIcon}"></i> ${km_gps.toLocaleString()}${gpsUnit}</span>`
                  : `<span style="color: #64748b; font-weight: bold;">${km_gps.toLocaleString()}${gpsUnit}</span>`;
              let fmtFalta = `<span class="badge ${badgeClass} shadow-sm" style="font-size: 0.8rem; padding: 0.4em 0.6em;">${iconFalta} ${falta_km.toLocaleString()}</span>`;

              let menuAcciones = ''; if (canEditF || canDeleteF) { let items = ''; if(canEditF) items += `<li><a class="dropdown-item" href="#" onclick="abrirModalEditarFleetrun('${id}')"><i class="bi bi-pencil text-primary"></i> Editar</a></li>`; if(canEditF && canDeleteF) items += `<li><hr class="dropdown-divider"></li>`; if(canDeleteF) items += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${id}', 'Fleetrun')"><i class="bi bi-trash"></i> Eliminar</a></li>`; menuAcciones = `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${items}</ul></div>`; } else { menuAcciones = `<span class="text-muted"><i class="bi bi-dash"></i></span>`; }
              let chkHtml = (window.modoSeleccion && window.modoSeleccion['fleetrun']) ? `<input type="checkbox" class="form-check-input float-start ms-2 chk-bulk-fleetrun" value="${id}" onclick="event.stopPropagation(); toggleBulkBtn('fleetrun')">` : '';
              let originalIndex = dataGlobalFleetrun.findIndex(x => x[0] === id);
              html += `<tr class="child-${classPlaca} clickable-row data-row-fleetrun child-row-fleetrun" style="display:none;" onclick="if(window.modoSeleccion&&window.modoSeleccion['fleetrun']){seleccionarFilaFleetrun(event,this)}else if(!event.target.closest('.dropdown')&&!event.target.closest('.dropstart')&&!event.target.closest('.btn-icon-dropdown')){mostrarDetalleFleetrun(${originalIndex})}" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}" data-fecha="${fechaLimpia}" data-estado-kpi="${estadoKpi}"><td class="text-end text-muted" style="font-size: 0.75rem;" data-value="${placaRaw}">${chkHtml}∟</td><td>${fechaLimpia}</td><td>${fmtTipo}</td><td>${km_cambio.toLocaleString()}</td><td>${fmtFalta}</td><td>${km_prox.toLocaleString()}</td><td class="text-truncate" style="max-width: 150px;">${obs}</td><td>${fmtFrec}</td><td>${fmtKmGps}</td><td>${menuAcciones}</td></tr>`;
          });
      });
      rellenarFiltroCheck('filtroFleetCliente', setFClientes, 'filtrarFleetrunAvanzado'); rellenarFiltroCheck('filtroFleetUts', setFUts, 'filtrarFleetrunAvanzado');
  }
  // ── Preservar grupos expandidos antes de re-render ───────────────────────
  var _expandedGroupsBefore = new Set();
  var tbodyFleetrun = document.getElementById('cuerpoTablaFleetrun');
  if (tbodyFleetrun) {
      document.querySelectorAll('#cuerpoTablaFleetrun tr.child-row-fleetrun').forEach(function(row) {
          if (row.style.display !== 'none') {
              row.classList.forEach(function(c) {
                  if (c.startsWith('child-') && c !== 'child-row-fleetrun') _expandedGroupsBefore.add(c);
              });
          }
      });
      tbodyFleetrun.innerHTML = html;
      // ── Restaurar grupos que estaban abiertos ────────────────────────────────
      _expandedGroupsBefore.forEach(function(groupClass) {
          document.querySelectorAll('#cuerpoTablaFleetrun .' + groupClass + '.child-row-fleetrun').forEach(function(row) {
              row.style.display = '';
          });
          var placaClass = groupClass.replace('child-', '');
          var icon = document.querySelector('#cuerpoTablaFleetrun .toggle-icon-' + placaClass);
          if (icon) icon.className = icon.className.replace('bi-chevron-right', 'bi-chevron-down');
      });
  }
  // ── Refrescar offcanvas si sigue abierto ─────────────────────────────────
  var _ocElFr = document.getElementById('offcanvasFleetrun');
  if (_ocElFr && window._fleetrunDetalleId) {
      var _bsOCFr = bootstrap.Offcanvas.getInstance(_ocElFr);
      if (_bsOCFr && _bsOCFr._isShown) {
          var _detIdx = window.dataGlobalFleetrun.findIndex(function(x) { return x[0] === window._fleetrunDetalleId; });
          if (_detIdx >= 0) window.mostrarDetalleFleetrun(_detIdx);
      } else {
          window._fleetrunDetalleId = null;
      }
  }
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

  // Guardar referencia para filtrado en cards móvil
  window._fleetrunDatosAMostrar = datosAMostrar;

  // Modo móvil: mostrar cards, ocultar tabla
  var isMovil = window.innerWidth < 768;
  var tableWrap = document.getElementById('fleetrun-tabla-wrap');
  var cardCont  = document.getElementById('fleetrunCardContainer');
  if (isMovil) {
      if (tableWrap) tableWrap.style.display = 'none';
      if (cardCont)  { cardCont.style.display = ''; mostrarFleetrunCards(datosAMostrar); }
  } else {
      if (tableWrap) tableWrap.style.display = '';
      if (cardCont)  cardCont.style.display = 'none';
  }

  // PWA Badge
  if (typeof window.actualizarPWABadge === 'function') window.actualizarPWABadge();
}

function mostrarFleetrunCards(datosAMostrar) {
    var container = document.getElementById('fleetrunCardContainer');
    if (!container) return;
    if (!datosAMostrar || datosAMostrar.length === 0) {
        container.innerHTML = '<p class="text-center py-4 text-muted">No hay mantenimientos.</p>';
        return;
    }

    var mapPlacas = new Map();
    datosAMostrar.forEach(function(fila) {
        var p = fila[4] || '-';
        if (!mapPlacas.has(p)) mapPlacas.set(p, []);
        mapPlacas.get(p).push(fila);
    });

    var html = '';
    var estadoOrder = { VENCIDO: 0, POR_VENCER: 1, VIGENTE: 2 };

    mapPlacas.forEach(function(mantenimientos, placaRaw) {
        var infoP = (dataGlobalPlacas || []).find(function(p) { return p[0] === placaRaw; });
        var cli    = infoP ? infoP[1] : (mantenimientos[0][6] || '-');
        var utsRaw = (infoP && infoP[19] && String(infoP[19]).trim() !== '') ? infoP[19] : (mantenimientos[0][7] || '-');
        var wialonData = buscarWialonPorPlaca(placaRaw);

        // Determinar el MP más crítico
        var criticalMp = null, criticalEstado = 'VIGENTE';
        mantenimientos.forEach(function(fila) {
            var km_prox = parseFloat(fila[11]) || 0;
            var km_gps  = wialonData ? wialonData.km : (parseFloat(fila[14]) || 0);
            var falta   = km_prox - km_gps;
            var estado;
            if (falta <= 0) estado = 'VENCIDO';
            else if ((normalizeStr(utsRaw) === 'NACIONAL' && falta <= 1500) || (normalizeStr(utsRaw) === 'LOCAL' && falta <= 100)) estado = 'POR_VENCER';
            else estado = 'VIGENTE';
            if (estadoOrder[estado] < estadoOrder[criticalEstado] || !criticalMp) {
                criticalMp = fila; criticalEstado = estado;
            }
        });
        if (!criticalMp) criticalMp = mantenimientos[0];

        var tipo_mp    = criticalMp[8];
        var fechaLimpia = parseDateToDDMMYYYY(criticalMp[3]);
        var km_prox    = parseFloat(criticalMp[11]) || 0;
        var km_gps     = wialonData ? wialonData.km : (parseFloat(criticalMp[14]) || 0);
        var falta_km   = km_prox - km_gps;
        var originalIndex = dataGlobalFleetrun.findIndex(function(x) { return x[0] === criticalMp[0]; });

        var badgeCls, badgeIcon, badgeLabel, borderColor;
        if (criticalEstado === 'VENCIDO')      { badgeCls = 'danger';  badgeIcon = 'bi-exclamation-circle-fill';    badgeLabel = 'Vencido';    borderColor = 'var(--bs-danger)'; }
        else if (criticalEstado === 'POR_VENCER') { badgeCls = 'warning'; badgeIcon = 'bi-exclamation-triangle-fill'; badgeLabel = 'Por Vencer'; borderColor = 'var(--bs-warning)'; }
        else                                   { badgeCls = 'success'; badgeIcon = 'bi-check-circle-fill';          badgeLabel = 'Vigente';    borderColor = 'var(--bs-success)'; }

        var utsHtml = (utsRaw && utsRaw !== '-') ? `<span class="badge bg-info text-dark ms-1" style="font-size:0.68rem;">${utsRaw}</span>` : '';
        var multiHtml = mantenimientos.length > 1 ? `<div class="mt-1" style="font-size:0.71rem;color:var(--subtext);"><i class="bi bi-layers me-1"></i>${mantenimientos.length} tipos de MP</div>` : '';

        html += `<div class="card mb-2 shadow-sm" style="border-left:4px solid ${borderColor};cursor:pointer;" onclick="if(typeof window.abrirDetallePlacaGlobal==='function')window.abrirDetallePlacaGlobal('${placaRaw}','fleet')">
            <div class="card-body py-2 px-3">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <div>
                        <span class="fw-bold" style="font-size:1rem;color:var(--text);">${placaRaw}</span>
                        <i class="bi bi-info-circle-fill text-info ms-1" style="font-size:0.8rem;cursor:pointer;" title="Detalle Placa" onclick="event.stopPropagation();if(typeof window.abrirDetallePlacaGlobal==='function')window.abrirDetallePlacaGlobal('${placaRaw}','fleet')"></i>
                        <span class="badge bg-secondary ms-2" style="font-size:0.68rem;">${cli}</span>
                        ${utsHtml}
                    </div>
                    <span class="badge bg-${badgeCls}" style="font-size:0.71rem;color:${badgeCls==='warning'?'#000':'#fff'};">
                        <i class="bi ${badgeIcon}"></i> ${badgeLabel}
                    </span>
                </div>
                ${multiHtml}
            </div>
        </div>`;
    });
    container.innerHTML = html;
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

    // En móvil: re-renderizar cards con datos filtrados
    if (window.innerWidth < 768 && window._fleetrunDatosAMostrar) {
        mostrarFleetrunCards(_filtrarDatosAMostrar(window._fleetrunDatosAMostrar));
    }
};

// Filtra el array de datos raw según los controles activos (buscador, checkboxes)
function _filtrarDatosAMostrar(datos) {
    var txt = (document.getElementById('buscadorFleetrun')?.value || '').toLowerCase();
    var dateF = document.getElementById('buscadorFechaFleetrun')?.value || '';
    var dateCompare = '';
    if (dateF) { var pf = dateF.split('-'); dateCompare = pf[2]+'/'+pf[1]+'/'+pf[0]; }
    var chkCli = Array.from(document.querySelectorAll('#filtroFleetCliente input:checked')).map(function(e){return e.value;});
    var chkUts = Array.from(document.querySelectorAll('#filtroFleetUts input:checked')).map(function(e){return e.value;});
    var chkEst = Array.from(document.querySelectorAll('#filtroFleetEstado input:checked')).map(function(e){return e.value;});

    return datos.filter(function(fila) {
        var placaRaw = (fila[4] || '').toLowerCase();
        var tipo     = (fila[1] || '').toLowerCase();
        var dueno    = (fila[6] || '').toLowerCase();
        var fechaFila = fila[3] || '';
        var infoP    = dataGlobalPlacas.find(function(p){ return p[0] === fila[4]; });
        var cli      = infoP ? (infoP[1] || '') : (fila[6] || '');
        var utsRaw   = infoP && infoP[19] ? String(infoP[19]).trim() : (fila[7] || '');
        var utsDisp  = utsRaw ? utsRaw.charAt(0).toUpperCase()+utsRaw.slice(1).toLowerCase() : '-';

        // Cálculo estado KPI
        var km_actual = parseFloat(fila[2]) || 0;
        var km_prox   = parseFloat(fila[12]) || 0;
        var falta_km  = km_prox - km_actual;
        var estado;
        if (falta_km <= 0) estado = 'VENCIDO';
        else if (falta_km <= 1000) estado = 'POR_VENCER';
        else estado = 'VIGENTE';

        var textoFila = placaRaw + ' ' + tipo + ' ' + dueno;
        if (txt && !textoFila.includes(txt)) return false;
        if (dateCompare && fechaFila !== dateCompare) return false;
        if (chkCli.length && !chkCli.includes(cli)) return false;
        if (chkUts.length && !chkUts.includes(utsDisp)) return false;
        if (chkEst.length && !chkEst.includes(estado)) return false;
        return true;
    });
}

function abrirModalNuevoFleetrun() { document.getElementById('formFleetrun').reset(); document.getElementById('f_id').value = ''; let tzOffset = (new Date()).getTimezoneOffset() * 60000; let today = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0]; document.getElementById('f_fecha').value = today; autocompletarFecha('f'); poblarSelectTipoMantt('f_tipomp', ''); new bootstrap.Modal(document.getElementById('modalFleetrun')).show(); }

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
        let esHorasForm = (window._metricaMap[(placaInput || '').toUpperCase()] === 'horas');
        document.getElementById(prefix + '_kmgps').value = esHorasForm ? (wialonData.horas || '') : wialonData.km;
    } else { document.getElementById(prefix + '_kmgps').value = ''; }
};

window.mostrarDetalleFleetrun = function(index) {
    if (!dataGlobalFleetrun || !dataGlobalFleetrun[index]) return;
    let fila = dataGlobalFleetrun[index];
    window._fleetrunDetalleId = fila[0] || null; // tracking para refresh tras reload

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
    let tecnico = fila[13] || "-";
    let obs = fila[12] || "";

    let isLive = false;
    let km_gps = 0;
    let wialonData = buscarWialonPorPlaca(placa);
    let esHorasDet = (window._metricaMap[(placa||'').toUpperCase()] === 'horas');
    if (wialonData) {
        km_gps = esHorasDet ? (wialonData.horas || 0) : wialonData.km;
        isLive = true;
    }

    let falta_km = km_prox - km_gps;
    let badgeClass = "", estadoText = "";
    if (falta_km <= 0) {
        badgeClass = "bg-danger text-white"; estadoText = "VENCIDO";
    } else if ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100)) {
        badgeClass = "bg-warning text-dark"; estadoText = "POR VENCER";
    } else {
        badgeClass = "bg-success text-white"; estadoText = "VIGENTE";
    }

    let gpsLabel      = esHorasDet ? 'Horas Motor Actual' : 'KM GPS Actual';
    let gpsIcon       = esHorasDet ? 'bi-clock'           : 'bi-broadcast';
    let gpsBadgeCls   = esHorasDet ? 'bg-warning text-dark' : 'bg-primary';
    let gpsUnit       = esHorasDet ? ' h'                  : ' km';
    let unidadFalta   = esHorasDet ? 'h'                   : 'km';

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
                <span class="fw-bold text-muted small"><i class="bi bi-speedometer"></i> ${esHorasDet ? 'Horas de Registro' : 'KM de Registro'}</span>
                <span>${km_actual.toLocaleString()} ${unidadFalta}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-arrow-repeat"></i> Frecuencia</span>
                <span class="text-warning fw-bold">${frecuencia.toLocaleString()} ${unidadFalta}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-flag"></i> ${esHorasDet ? 'Horas Próximo' : 'KM Próximo'}</span>
                <span class="fw-bold">${km_prox.toLocaleString()} ${unidadFalta}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi ${gpsIcon}"></i> ${gpsLabel}</span>
                ${isLive ? `<span class="badge ${gpsBadgeCls} px-2 py-1"><i class="bi ${gpsIcon}"></i> ${km_gps.toLocaleString()}${gpsUnit}</span>` : `<span class="text-secondary fw-bold">${km_gps.toLocaleString()}${gpsUnit}</span>`}
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-heart-pulse"></i> Estado</span>
                <span class="badge ${badgeClass} shadow-sm px-2 py-1" style="font-size: 0.8rem;">${estadoText} (Faltan ${falta_km.toLocaleString()} ${unidadFalta})</span>
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

function abrirModalEditarFleetrun(idReg) { const p = dataGlobalFleetrun.find(x => x[0] === idReg); if (!p) return; document.getElementById('formEditarFleetrun').reset(); let dDate = new Date(p[1]); let fechaFormat = isNaN(dDate.getTime()) ? "" : dDate.toISOString().split('T')[0]; document.getElementById('eF_id').value = p[0]; document.getElementById('eF_fecha').value = fechaFormat; document.getElementById('eF_mes').value = p[2]; document.getElementById('eF_anio').value = fechaFormat ? fechaFormat.split('-')[0] : ''; document.getElementById('eF_placa').value = p[4]; document.getElementById('eF_marca').value = p[5]; document.getElementById('eF_dueno').value = p[6]; document.getElementById('eF_uts').value = p[7]; document.getElementById('eF_kmact').value = p[9]; document.getElementById('eF_freckm').value = p[10]; document.getElementById('eF_kmprox').value = p[11]; document.getElementById('eF_obs').value = p[12]; document.getElementById('eF_tec').value = p[13]; document.getElementById('eF_kmgps').value = p[14]; poblarSelectTipoMantt('eF_tipomp', p[8]); const btn = document.getElementById('btnActualizarFleetrun'); btn.disabled = false; btn.innerHTML = 'Actualizar Registro'; new bootstrap.Modal(document.getElementById('modalEditarFleetrun')).show(); }

function enviarFleetrun(event, formObj) { event.preventDefault(); if (!window.guardAction('fleet','c')) return; const btn = document.getElementById('btnGuardarFleetrun'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...'; if(!formObj.f_id.value) formObj.f_id.value = "FL-" + Date.now(); formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { formObj.reset(); bootstrap.Modal.getInstance(document.getElementById('modalFleetrun')).hide(); cargarTablaFleetrun(true); } else alert(r); btn.disabled = false; btn.innerHTML = 'Guardar'; }).withFailureHandler(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Guardar'; }).guardarFleetrun(formObj); }

function enviarEdicionFleetrun(event, formObj) { event.preventDefault(); if (!window.guardAction('fleet','e')) return; const btn = document.getElementById('btnActualizarFleetrun'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Actualizando...'; formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { bootstrap.Modal.getInstance(document.getElementById('modalEditarFleetrun')).hide(); cargarTablaFleetrun(true); } else alert(r); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).withFailureHandler(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).actualizarFleetrun(formObj); }

// ── Bulk selection helper (local al módulo) ───────────────────────────────
window.toggleBulkBtn = function(contexto) {
    var checkboxes = document.querySelectorAll('.chk-bulk-' + contexto);
    var checked = Array.from(checkboxes).filter(function(c) { return c.checked; }).length;
    var btn = document.getElementById('btn-bulk-' + contexto);
    var cnt = document.getElementById('cnt-bulk-' + contexto);
    if (cnt) cnt.textContent = checked;
    if (btn) {
        if (checked > 0) btn.classList.remove('d-none');
        else btn.classList.add('d-none');
    }
};

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

        let registrosProcesados = rawJson.map((r, idx) => {
            let fechaIngreso = r['FECHA INGRESO'] || '';
            if (fechaIngreso.includes('/')) {
                let p = fechaIngreso.split('/');
                if (p[2] && p[2].length === 4) fechaIngreso = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
            }
            let kmact = parseFloat(r['KM ACTUAL'] || 0);
            let frec = parseFloat(r['FRECUENCIA'] || 0);
            return {
                id: r['ID'] || `FLT-${Date.now()}-${idx}`,
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

window.limpiarFiltrosFleetrun = function() {
    var f = document.getElementById('buscadorFechaFleetrun');
    if (f) f.value = '';
    document.querySelectorAll('#filtroFleetCliente input[type=checkbox], #filtroFleetUts input[type=checkbox], #filtroFleetEstado input[type=checkbox]').forEach(function(cb) { cb.checked = false; });
    filtrarFleetrunAvanzado();
};

window.toggleGraficosFleetrun = function() {
    let panel = document.getElementById('panelGraficosFleetrun');
    if(panel.style.display === 'none') {
        panel.style.display = 'flex';
    } else {
        panel.style.display = 'none';
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
            layout: { padding: 6 },
            plugins: {
                legend: { position: 'right', labels: { font: { family: 'Inter', weight: 'bold', size: 11 }, boxWidth: 12, padding: 8 } },
                datalabels: {
                    display: function(ctx) {
                        var total = ctx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                        if (!total || ctx.chart.data.labels[0]==='Sin Datos') return false;
                        return (ctx.dataset.data[ctx.dataIndex] / total) >= 0.06;
                    },
                    color: '#ffffff',
                    font: { weight: 'bold', size: 11, family: 'Inter' },
                    formatter: function(value, ctx) {
                        var total = ctx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                        if (!total || ctx.chart.data.labels[0]==='Sin Datos') return '';
                        return Math.round(value/total*100)+'%';
                    },
                    anchor: 'center', align: 'center'
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
            layout: { padding: 6 },
            plugins: {
                legend: { position: 'right', labels: { font: { weight: 'bold', size: 11 }, boxWidth: 12, padding: 8 } },
                datalabels: {
                    display: function(ctx) {
                        var total = ctx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                        if (!total || ctx.chart.data.labels[0]==='Sin Datos') return false;
                        return (ctx.dataset.data[ctx.dataIndex] / total) >= 0.06;
                    },
                    color: '#ffffff',
                    font: { weight: 'bold', size: 11, family: 'Inter' },
                    formatter: function(value, ctx) {
                        var total = ctx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                        if (!total || ctx.chart.data.labels[0]==='Sin Datos') return '';
                        return Math.round(value/total*100)+'%';
                    },
                    anchor: 'center', align: 'center'
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

// ── Eliminar masivo de fleetrun ──────────────────────────────────────────────
window.eliminarMasivo = function(coleccion, contexto) {
    var checkboxes = document.querySelectorAll('.chk-bulk-' + contexto + ':checked');
    var ids = Array.from(checkboxes).map(function(c) { return c.value; });
    if (!ids.length) { alert('Selecciona al menos un registro.'); return; }
    if (!confirm('¿Eliminar ' + ids.length + ' registro(s) seleccionado(s)?\nEsta acción no se puede deshacer.')) return;

    fetch('/api/eliminarMasivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids, coleccion: coleccion })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(r) {
        if (r.error) { alert('Error: ' + r.error); return; }
        alert('✅ ' + (r.afectados || ids.length) + ' registro(s) eliminado(s).');
        window.modoSeleccion = window.modoSeleccion || {};
        window.modoSeleccion['fleetrun'] = true;
        if (typeof window.activarModoSeleccionFleetrun === 'function') window.activarModoSeleccionFleetrun();
        cargarTablaFleetrun(true);
    })
    .catch(function(err) { alert('Error al eliminar: ' + err.message); });
};

// ── Poblar select de Tipo de Mantenimiento ──────────────────────────────────
function poblarSelectTipoMantt(selectId, valorActual) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    // Jala de /api/tipos-preventivo (módulo Preferencias → Tipos MP)
    fetch('/api/tipos-preventivo')
        .then(function(r) { return r.ok ? r.json() : { data: [] }; })
        .then(function(resp) {
            var lista = Array.isArray(resp) ? resp : (resp.data || []);
            var tiposUnicos = lista
                .filter(function(t) { return t.activo !== 0; })
                .map(function(t) { return (t.nombre || '').trim(); })
                .filter(function(n) { return n.length > 0; })
                .sort(function(a, b) { return a.localeCompare(b); });
            sel.innerHTML = '<option value="">— Seleccionar tipo —</option>';
            tiposUnicos.forEach(function(tipo) {
                var opt = document.createElement('option');
                opt.value = tipo;
                opt.textContent = tipo;
                if (valorActual && tipo.toUpperCase() === valorActual.toUpperCase()) opt.selected = true;
                sel.appendChild(opt);
            });
        })
        .catch(function() {});
}

// ================================================================
// 🚀 FUNCIÓN DE ARRANQUE — llamada por el Router
// ================================================================
window.init_fleetrun = function() {
    if (!window.checkPerm('fleet', 'l')) {
        window.showNoPermMsg('mod-fleetrun');
        return;
    }
    var btnNuevoFR = document.getElementById('btnNuevoFleetrun');
    if (btnNuevoFR) btnNuevoFR.style.display = window.checkPerm('fleet','c') ? '' : 'none';
    if (window.chartFleetrunInst) {
        window.chartFleetrunInst.destroy();
        window.chartFleetrunInst = null;
    }

    // Cargar mapa de métricas (km vs horas motor) por placa
    fetch('/api/config-metrica')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            window._metricaMap = {};
            (data || []).forEach(function(row) {
                if (row.placa) window._metricaMap[row.placa.toUpperCase()] = row.metrica || 'km';
            });
        })
        .catch(function() {});

    // Cargar mapa de km/día (histórico GPS últimos 30 días)
    fetch('/api/km-historico')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            window._kmDiaMap = {};
            (data || []).forEach(function(row) {
                if (row.placa) window._kmDiaMap[row.placa.toUpperCase()] = {
                    km_dia:    row.km_dia,
                    horas_dia: row.horas_dia
                };
            });
        })
        .catch(function() {});

    // Si hay datos en memoria → mostrar inmediatamente para UX rápido
    // Luego SIEMPRE hacer fetch fresco (puede haber registros nuevos desde la última visita)
    const datosEnMemoria = (window.dataGlobalFleetrun && window.dataGlobalFleetrun.length > 0)
        ? window.dataGlobalFleetrun
        : null;

    if (datosEnMemoria) {
        mostrarFleetrun(datosEnMemoria); // render inmediato con caché
    }
    cargarTablaFleetrun(true); // fetch fresco en paralelo (actualiza la tabla al llegar)
};
// NOTA: cargarTablaFleetrun es function declaration — va a window automáticamente al cargar el script.
