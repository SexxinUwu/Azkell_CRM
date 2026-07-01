
fetch('/api/conductores-lista')
    .then(function(r) { return r.json(); })
    .then(function(d) {
        window.dataGlobalConductores = (d || []).map(function(c) {
            var nom = (c.nombre || '').trim();
            return nom ? { value: nom, label: nom } : null;
        }).filter(Boolean);
    }).catch(function() {});

window._frTipoLista = window._frTipoLista || [];
fetch('/api/tipos-preventivo')
    .then(function(r) { return r.ok ? r.json() : { data: [] }; })
    .then(function(resp) {
        var lista = Array.isArray(resp) ? resp : (resp.data || []);
        window._frTipoLista = lista
            .filter(function(t) { return t.activo !== 0; })
            .map(function(t) { return (t.nombre || '').trim(); })
            .filter(function(n) { return n.length > 0; })
            .sort(function(a, b) { return a.localeCompare(b); });
            
        // Re-init if elements are already in DOM
        if (typeof window._cbInit === 'function') {
            window._cbInit('f_tipomp', window._frTipoLista.map(function(t){ return {value:t, label:t}; }), 'Buscar tipo...');
        }
    }).catch(function() {});

fetch('/api/tipos-mantenimiento')
    .then(function(r) { return r.ok ? r.json() : { data: [] }; })
    .then(function(j) {
        window.dataTiposMant = j.data || [];
    }).catch(function() {});


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

window._fleetrun_umbrales_uts = window._fleetrun_umbrales_uts || null;

function cargarTablaFleetrun(forzarRefresh = false) {
    if (!forzarRefresh && dataGlobalFleetrun.length > 0 && window._fleetrun_umbrales_uts !== null) { mostrarFleetrun(dataGlobalFleetrun); return; }
    const cuerpo = document.getElementById('cuerpoTablaFleetrun');
    if (cuerpo) {
        cuerpo.innerHTML = '<tr><td colspan="10" class="td-empty text-center py-5" style="color: var(--subtext); font-weight: 500;"><span class="spinner-border spinner-border-sm text-warning me-2"></span>Cargando mantenimientos...</td></tr>';
    }
    Promise.all([
        fetch('/api/configuracion').then(r => r.json()).catch(() => ({})),
        fetch('/api/script/obtenerDatosFleetrun', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) }).then(r => r.json()).catch(() => ({ data: [] }))
    ]).then(([configData, r]) => {
        let confStr = configData['fleetrun_uts_umbrales'] || '{}';
        try { window._fleetrun_umbrales_uts = JSON.parse(confStr); } catch(e) { window._fleetrun_umbrales_uts = {}; }
        mostrarFleetrun(r.data || []);
    });
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
      let idA = parseInt((a[0].match(/\d+$/) || [0])[0], 10);
      let idB = parseInt((b[0].match(/\d+$/) || [0])[0], 10);
      return idB - idA; // mismo día (o sin fecha) → mayor ID gana
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
  let cntVencido = 0, cntProximo = 0, cntVigente = 0;
  let placaEstadoMap = new Map(); let estadoPrio = { 'VIGENTE': 0, 'PROXIMO': 1, 'VENCIDO': 2 };
  if(!datosAMostrar || datosAMostrar.length === 0) { html = '<tr><td colspan="11" class="text-center py-4" style="color: var(--subtext) !important;">No hay mantenimientos.</td></tr>'; }
  else {
      let canEditF = window.checkPerm('fleet','e'); let canDeleteF = window.checkPerm('fleet','d'); let setFClientes = new Set(); let setFUts = new Set(); let mapPlacas = new Map();
      datosAMostrar.forEach((fila) => { let placaRaw = fila[4] || "-"; if(!mapPlacas.has(placaRaw)) mapPlacas.set(placaRaw, []); mapPlacas.get(placaRaw).push(fila); });
      window._totalGruposFleetrun = mapPlacas.size;
      window.fleetrunTotalPages = Math.ceil(mapPlacas.size / window.fleetrunPageSize) || 1;
      if(window.fleetrunCurrentPage > window.fleetrunTotalPages) window.fleetrunCurrentPage = window.fleetrunTotalPages;
      if(window.fleetrunCurrentPage < 1) window.fleetrunCurrentPage = 1;
      let _groupIndex = 0;
      mapPlacas.forEach((mantenimientos, placaRaw) => {
          let pageNum = Math.floor(_groupIndex / window.fleetrunPageSize) + 1;
          _groupIndex++;
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
          html += `<tr class="group-header data-row-fleetrun fleet-page fleet-page-${pageNum}" style="cursor:pointer;" onclick="toggleGroupRow('child-${classPlaca}', this)" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}">
              <td colspan="11" class="fw-bold text-start" style="background-color: rgba(128,128,128,0.1) !important; color: var(--text) !important;"><i class="bi bi-chevron-right ms-1 me-2 text-warning toggle-icon-${classPlaca}"></i> <span style="display:inline-block; min-width:80px;">${placaRaw}</span><i class="bi bi-info-circle-fill text-info ms-1" style="cursor:pointer;font-size:0.82rem;" title="Ver Detalle Placa" onclick="event.stopPropagation();if(typeof window.abrirDetallePlacaGlobal==='function')window.abrirDetallePlacaGlobal('${placaRaw}')"></i><span class="badge bg-secondary ms-2">${cli}</span><span class="badge bg-info text-dark ms-2">${utsDisplay}</span>${kmDiaBadge}<span class="badge bg-warning text-dark float-end">${mantenimientos.length} Registros</span></td></tr>`;
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

              let km_desde = km_gps - km_cambio;
              let km_restante = frecuencia - km_desde;
              if (km_restante < 0 && !isHistorialFleetrun) km_restante = km_prox - km_gps; // fallback si es data antigua que usaba km_prox
              let badgeClass = ""; let iconFalta = ""; let estadoKpi = "";
              
              let utsUmbral = 2000;
              let metricSuffix = esHoras ? '_HORAS' : '_KM';
              let combinedKey = utsDisplay.toUpperCase() + metricSuffix;
              
              if (window._fleetrun_umbrales_uts) {
                  if (window._fleetrun_umbrales_uts[combinedKey] !== undefined) {
                      utsUmbral = parseFloat(window._fleetrun_umbrales_uts[combinedKey]);
                  } else if (window._fleetrun_umbrales_uts[utsDisplay.toUpperCase()] !== undefined) {
                      utsUmbral = parseFloat(window._fleetrun_umbrales_uts[utsDisplay.toUpperCase()]);
                  }
              }
              
              if (km_restante <= 0) { badgeClass = "bg-danger text-white"; iconFalta = `<i class="bi bi-exclamation-circle-fill"></i>`; estadoKpi = "VENCIDO";
              } else if (km_restante <= utsUmbral) { badgeClass = "bg-warning text-dark"; iconFalta = `<i class="bi bi-exclamation-triangle-fill"></i>`; estadoKpi = "PROXIMO";
              } else { badgeClass = "bg-success text-white"; iconFalta = `<i class="bi bi-check-circle-fill"></i>`; estadoKpi = "VIGENTE"; }
              
              let _prio = estadoPrio[estadoKpi] || 0; let _prevE = placaEstadoMap.get(placaRaw); if (_prevE === undefined || _prio > (estadoPrio[_prevE] || 0)) { placaEstadoMap.set(placaRaw, estadoKpi); }
              let fmtTipo = `<span style="color: #2D438A; font-weight: bold;">${tipo_mp}</span>`;

              let gpsBadgeColor = esHoras ? 'bg-warning text-dark' : 'bg-primary';
              let gpsIcon       = esHoras ? 'bi-clock' : 'bi-broadcast';
              let gpsUnit       = esHoras ? ' h' : '';
              let fmtKmGps = isLive
                  ? `<span class="badge ${gpsBadgeColor} shadow-sm px-2"><i class="bi ${gpsIcon}"></i> ${km_gps.toLocaleString()}${gpsUnit}</span>`
                  : `<span style="color: #64748b; font-weight: bold;">${km_gps.toLocaleString()}${gpsUnit}</span>`;
              let fmtFalta = `<span class="badge ${badgeClass} shadow-sm" style="font-size: 0.8rem; padding: 0.4em 0.6em;">${iconFalta} ${km_restante.toLocaleString()}</span>`;

              let menuAcciones = ''; if (canEditF || canDeleteF) { let items = ''; if(canEditF) items += `<li><a class="dropdown-item" href="#" onclick="abrirModalEditarFleetrun('${id}')"><i class="bi bi-pencil text-primary"></i> Editar</a></li>`; if(canEditF && canDeleteF) items += `<li><hr class="dropdown-divider"></li>`; if(canDeleteF) items += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${id}', 'Fleetrun')"><i class="bi bi-trash"></i> Eliminar</a></li>`; menuAcciones = `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${items}</ul></div>`; } else { menuAcciones = `<span class="text-muted"><i class="bi bi-dash"></i></span>`; }
              let chkHtml = (window.modoSeleccion && window.modoSeleccion['fleetrun']) ? `<input type="checkbox" class="form-check-input float-start ms-2 chk-bulk-fleetrun" value="${id}" onclick="event.stopPropagation(); toggleBulkBtn('fleetrun')">` : '';
              let originalIndex = dataGlobalFleetrun.findIndex(x => x[0] === id);
              
              html += `<tr class="child-${classPlaca} clickable-row data-row-fleetrun child-row-fleetrun fleet-page fleet-page-${pageNum}" style="display:none;" onclick="if(window.modoSeleccion&&window.modoSeleccion['fleetrun']){seleccionarFilaFleetrun(event,this)}else if(!event.target.closest('.dropdown')&&!event.target.closest('.dropstart')&&!event.target.closest('.btn-icon-dropdown')){mostrarDetalleFleetrun(${originalIndex})}" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}" data-fecha="${fechaLimpia}" data-estado-kpi="${estadoKpi}">
                  <td class="text-start" style="font-size: 0.85rem;" data-value="${placaRaw}">${chkHtml}∟ <b>${placaRaw}</b></td>
                  <td>${utsDisplay}</td>
                  <td>${fechaLimpia}</td>
                  <td>${km_cambio.toLocaleString()}</td>
                  <td>${fmtTipo}</td>
                  <td><span class="badge bg-light text-primary border border-primary shadow-sm px-2 py-1"><i class="bi bi-arrow-repeat me-1"></i>${frecuencia.toLocaleString()}</span></td>
                  <td>${fmtKmGps}</td>
                  <td style="color: #64748b; font-weight: bold;">${km_desde.toLocaleString()}</td>
                  <td>${fmtFalta}</td>
                  <td class="text-center"><span class="badge ${badgeClass} w-100">${estadoKpi}</span></td>
                  <td>${menuAcciones}</td>
              </tr>`;
          });
      });
      placaEstadoMap.forEach(function(estado) { if (estado === 'VENCIDO') cntVencido++; else if (estado === 'PROXIMO') cntProximo++; else cntVigente++; });
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
  }
  
  tbodyFleetrun.innerHTML = html;
  if(typeof window.fleetrunPaginar === 'function') window.fleetrunPaginar(0);
  if(datosAMostrar && datosAMostrar.length > 0) {
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
  
  if (!isHistorialFleetrun) { 
      updateGraficoFleetrun(cntVencido, cntProximo, cntVigente, placaEstadoMap.size); 
  }
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
        var esHorasGrp = (window._metricaMap[(placaRaw||'').toUpperCase()] === 'horas');
        mantenimientos.forEach(function(fila) {
            var km_prox = parseFloat(fila[11]) || 0;
            var km_gps  = wialonData ? (esHorasGrp ? wialonData.horas : wialonData.km) : (parseFloat(fila[14]) || 0);
            var falta   = km_prox - km_gps;
            var estado;
            
            var utsUmbral = 2000;
            var utsDisp = (utsRaw === "-" || utsRaw === "") ? "-" : utsRaw.charAt(0).toUpperCase() + utsRaw.slice(1).toLowerCase();
            let metricSuffix = esHorasGrp ? '_HORAS' : '_KM';
            let combinedKey = utsDisp.toUpperCase() + metricSuffix;
            if (window._fleetrun_umbrales_uts) {
                if (window._fleetrun_umbrales_uts[combinedKey] !== undefined) {
                    utsUmbral = parseFloat(window._fleetrun_umbrales_uts[combinedKey]);
                } else if (window._fleetrun_umbrales_uts[utsDisp.toUpperCase()] !== undefined) {
                    utsUmbral = parseFloat(window._fleetrun_umbrales_uts[utsDisp.toUpperCase()]);
                }
            }
            
            if (falta <= 0) estado = 'VENCIDO';
            else if (falta <= utsUmbral) estado = 'PROXIMO';
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

        var badgeCls, badgeTextCls, badgeLabel;
        if (criticalEstado === 'VENCIDO')      { badgeCls = 'danger';  badgeLabel = 'VENCIDO';    badgeTextCls = 'text-danger'; }
        else if (criticalEstado === 'POR_VENCER') { badgeCls = 'warning'; badgeLabel = 'POR VENCER'; badgeTextCls = 'text-dark'; }
        else                                   { badgeCls = 'success'; badgeLabel = 'VIGENTE';    badgeTextCls = 'text-success'; }

        var numMPs = mantenimientos.length;
        var frecuencia = parseFloat(criticalMp[10]) || 0;
        var freqText = frecuencia > 0 ? `(${(frecuencia/1000).toFixed(0)}K)` : '';
        var nombreMP = (criticalMp[8] || '') + ' ' + freqText;

        var kmDesdeUlt = 0;
        var desgastePct = 0;
        if (frecuencia > 0) {
            var kmUltimo = km_prox - frecuencia;
            kmDesdeUlt = Math.max(0, km_gps - kmUltimo);
            desgastePct = Math.min(100, Math.round((kmDesdeUlt / frecuencia) * 100));
        }
        var barColor = (criticalEstado === 'VENCIDO') ? '#ef4444' : ((criticalEstado === 'POR_VENCER') ? '#f59e0b' : '#10b981');
        var esHorasLocal = window._metricaMap && window._metricaMap[placaRaw.toUpperCase()] === 'horas';
        var unitL = esHorasLocal ? ' h' : ' km';

        html += `<div class="card mb-3 border border-light shadow-sm bg-white" style="border-radius: 16px; cursor:pointer;" onclick="if(typeof window.abrirDetallePlacaGlobal==='function')window.abrirDetallePlacaGlobal('${placaRaw}','fleet')">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div class="d-flex align-items-center gap-2">
                        <div class="border rounded px-2 py-1 fw-bolder text-dark" style="font-size: 0.95rem; background-color: #f8fafc; border-color: #e2e8f0 !important;">${placaRaw}</div>
                        <div class="rounded px-2 py-1 text-secondary" style="font-size: 0.75rem; background-color: #f1f5f9;">${cli}</div>
                    </div>
                    <div class="rounded-pill px-2 py-1 fw-bold ${badgeTextCls}" style="font-size: 0.75rem; background-color: color-mix(in srgb, var(--bs-${badgeCls}) 15%, transparent);">${badgeLabel}</div>
                </div>
                
                <div class="d-flex justify-content-between align-items-end mb-1">
                    <div style="font-size: 0.75rem; color: #64748b;">${esHorasLocal ? 'Horas Motor' : 'KM GPS'} Actual: <span class="fw-bolder text-dark" style="font-size: 0.85rem;">${km_gps.toLocaleString()}${unitL}</span></div>
                    <div style="font-size: 0.75rem; color: #64748b;">Próximo: ${km_prox.toLocaleString()}${unitL}</div>
                </div>
                
                <div class="progress mb-1" style="height: 6px; background-color: #e2e8f0; border-radius: 4px;">
                    <div class="progress-bar" role="progressbar" style="width: ${desgastePct}%; background-color: ${barColor}; border-radius: 4px;"></div>
                </div>
                
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div style="font-size: 0.7rem; color: #94a3b8;">${kmDesdeUlt.toLocaleString()}${unitL} desde últ. serv.</div>
                    <div style="font-size: 0.7rem; color: #94a3b8;">${desgastePct}% de desgaste</div>
                </div>
                
                <hr class="my-2" style="border-top: 1px dashed #cbd5e1; opacity: 1;">
                
                <div class="d-flex justify-content-between align-items-center mt-2">
                    <div class="fw-bold d-flex align-items-center" style="font-size: 0.85rem; color: #0284c7;">
                        <i class="bi bi-wrench-adjustable me-2" style="font-size: 1rem;"></i>${nombreMP}
                    </div>
                    <div class="rounded-pill px-2 py-1 fw-bold" style="font-size: 0.7rem; color: #0284c7; background-color: #e0f2fe;">${numMPs} Registros</div>
                </div>
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
    let cntVigente = 0, cntProximo = 0, cntVencido = 0;
    let placasMostradas = new Set();
    let estadoPrio = { 'VIGENTE': 0, 'PROXIMO': 1, 'VENCIDO': 2 };

    const headers = document.querySelectorAll('#cuerpoTablaFleetrun tr.group-header');
    headers.forEach(header => {
        const placaRaw = header.getAttribute('data-placa'); const classPlaca = normalizarClase(placaRaw);
        const cli = header.getAttribute('data-cliente'); const uts = header.getAttribute('data-uts');
        let childRows = document.querySelectorAll(`.child-${classPlaca}`);
        let hasVisibleChild = false;
        let matchCli = (!chkCli.length || chkCli.includes(cli)); let matchUts = (!chkUts.length || chkUts.includes(uts));
        let bestKpiFila = null;
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
                    if (!bestKpiFila || estadoPrio[kpiFila] > estadoPrio[bestKpiFila]) { bestKpiFila = kpiFila; }
                } else {
                    row.style.display = 'none';
                }
            });
            if (hasVisibleChild) {
                placasMostradas.add(placaRaw);
                if (bestKpiFila === 'VIGENTE') cntVigente++;
                else if (bestKpiFila === 'PROXIMO') cntProximo++;
                else if (bestKpiFila === 'VENCIDO') cntVencido++;
            }
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
    updateGraficoFleetrun(cntVencido, cntProximo, cntVigente, placasMostradas.size);

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
        var utsUmbral = 2000;
        var esHoras = (window._metricaMap[placaRaw.toUpperCase()] === 'horas');
        var metricSuffix = esHoras ? '_HORAS' : '_KM';
        var combinedKey = utsDisp.toUpperCase() + metricSuffix;
        if (window._fleetrun_umbrales_uts) {
            if (window._fleetrun_umbrales_uts[combinedKey] !== undefined) {
                utsUmbral = parseFloat(window._fleetrun_umbrales_uts[combinedKey]);
            } else if (window._fleetrun_umbrales_uts[utsDisp.toUpperCase()] !== undefined) {
                utsUmbral = parseFloat(window._fleetrun_umbrales_uts[utsDisp.toUpperCase()]);
            }
        }
        if (falta_km <= 0) estado = 'VENCIDO';
        else if (falta_km <= utsUmbral) estado = 'PROXIMO';
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


window.fleetrunTiposMulti = [];

// ── Buscar frecuencia para un tipo desde dataTiposMant ──────────
window._buscarFrecuenciaTipo = function(tipoMP) {
    if (!window.dataTiposMant || !window.dataTiposMant.length) return 0;
    
    var _normStr = function(s) {
        if (!s) return '';
        return s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    };

    var marca = _normStr(document.getElementById('f_marca').value);
    var uts = _normStr(document.getElementById('f_uts').value);
    var combustible = _normStr(document.getElementById('f_combustible').value);
    var modelo = _normStr(document.getElementById('f_modelo').value);
    tipoMP = _normStr(tipoMP);
    
    if (!marca || !tipoMP) return 0;

    var match = window.dataTiposMant.find(function(t) {
        var tMarca = _normStr(t.marca);
        var tTipoMP = _normStr(t.tipo_mp);
        var tUts = _normStr(t.uts);
        var tComb = _normStr(t.combustible);
        var tMod = _normStr(t.modelo);
        
        return (!tMarca || tMarca === marca) &&
               (!tTipoMP || tTipoMP === tipoMP) &&
               (!tUts || tUts === uts) &&
               (!tComb || tComb === combustible) &&
               (!tMod || tMod === modelo);
    });
    if (!match) return 0;

    var placaInput = document.getElementById('f_placa').value;
    var pMatch = window.dataGlobalPlacas && window.dataGlobalPlacas.find(function(p) { return p[0] === placaInput; });
    var metrica = (pMatch && pMatch[23] ? pMatch[23].toString().toUpperCase() : 'KM');
    if (metrica.includes('HR') || metrica.includes('HORA')) {
        return parseFloat(match.frecuencia_horas) || parseFloat(match.frecuencia_km) || 0;
    }
    return parseFloat(match.frecuencia_km) || parseFloat(match.frecuencia_horas) || 0;
};

// ── Agregar tipo con cálculo inteligente ─────────────────────────
window.agregarTipoMulti = function(val) {
    if (!val) return;
    val = val.toUpperCase().trim();
    if (window.fleetrunTiposMulti.find(function(t) { return t.tipo === val; })) return;
    
    var frec = window._buscarFrecuenciaTipo(val);
    var kmAct = parseFloat(document.getElementById('f_kmact').value) || 0;
    var kmProx = frec > 0 ? (kmAct + frec) : 0;
    
    window.fleetrunTiposMulti.push({ tipo: val, frecuencia: frec, kmProximo: kmProx });
    window.renderTiposMulti();
};

// ── Eliminar tipo ────────────────────────────────────────────────
window.eliminarTipoMulti = function(val) {
    window.fleetrunTiposMulti = window.fleetrunTiposMulti.filter(function(t) { return t.tipo !== val; });
    window.renderTiposMulti();
};

// ── Recalcular todos los tipos cuando cambia KM Actual ──────────
window.recalcularTodosMulti = function() {
    var kmAct = parseFloat(document.getElementById('f_kmact').value) || 0;
    window.fleetrunTiposMulti.forEach(function(item) {
        if (item.frecuencia > 0) {
            item.kmProximo = kmAct + item.frecuencia;
        }
    });
    window.renderTiposMulti();
};

// ── Detectar unidad de métrica ──────────────────────────────────
window._frGetUnidad = function() {
    var placaInput = (document.getElementById('f_placa') || {}).value || '';
    var metrica = (window._metricaMap[(placaInput).toUpperCase()] || 'km');
    return (metrica === 'horas') ? 'h' : 'km';
};

// ── Renderizar tabla multi-item ──────────────────────────────────
window.renderTiposMulti = function() {
    var tbody = document.getElementById('f_tipomp-items-tbody');
    if (!tbody) return;
    var unidad = window._frGetUnidad();

    if (!window.fleetrunTiposMulti.length) {
        tbody.innerHTML = '<tr id="f_tipomp-empty-row"><td colspan="4" class="text-center py-3" style="color:#94a3b8; font-size:0.8rem;"><i class="bi bi-inbox me-1"></i>Agrega tipos de mantenimiento</td></tr>';
    } else {
        tbody.innerHTML = window.fleetrunTiposMulti.map(function(item, idx) {
            var frecStr = item.frecuencia > 0 
                ? item.frecuencia.toLocaleString('es-PE') + ' ' + unidad 
                : '<span style="color:#f59e0b"><i class="bi bi-exclamation-triangle-fill me-1"></i>Sin frec.</span>';
            var proxStr = item.kmProximo > 0 
                ? '<span class="fw-bold" style="color:#059669">' + item.kmProximo.toLocaleString('es-PE') + ' ' + unidad + '</span>' 
                : '—';
            return '<tr style="border-top:1px solid #e2e8f0; transition:background 0.15s;" onmouseenter="this.style.background=\'#f1f5f9\'" onmouseleave="this.style.background=\'transparent\'">' +
                '<td class="ps-3 py-2"><span class="badge rounded-pill px-2 py-1 shadow-sm" style="background:#0369a1; font-size:0.78rem; font-weight:600;">' + item.tipo + '</span></td>' +
                '<td class="text-center py-2" style="font-size:0.82rem; color:#334155;">' + frecStr + '</td>' +
                '<td class="text-center py-2" style="font-size:0.82rem;">' + proxStr + '</td>' +
                '<td class="pe-3 py-2 text-center"><button type="button" class="btn btn-sm p-0 border-0" style="width:24px;height:24px;border-radius:50%;background:#fee2e2;color:#dc2626;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseenter="this.style.background=\'#dc2626\';this.style.color=\'#fff\'" onmouseleave="this.style.background=\'#fee2e2\';this.style.color=\'#dc2626\'" onclick="window.eliminarTipoMulti(\'' + item.tipo + '\')"><i class="bi bi-x" style="font-size:0.9rem;"></i></button></td>' +
                '</tr>';
        }).join('');
    }

    // Update hidden field with tipos array for form submission
    var hid = document.getElementById('f_tipomp');
    if (hid) hid.value = JSON.stringify(window.fleetrunTiposMulti.map(function(t) { return t.tipo; }));

    // Sync count badge on table wrapper
    var wrap = document.getElementById('f_tipomp-table-wrap');
    if (wrap) {
        wrap.style.borderColor = window.fleetrunTiposMulti.length > 0 ? '#818cf8' : '#e2e8f0';
    }
};

window.onBlurTipomp = function(el) {
    setTimeout(function() {
        var val = el.value.trim().toUpperCase();
        if (val) {
            window.agregarTipoMulti(val);
        }
        el.value = '';
        window._cbHide('f_tipomp');
    }, 200);
};

window._cbOnSelect('f_placa', function() { window.autocompletarFleetrun('f'); window.recalcularTodosMultiDesdeAutocompletar(); });
window._cbOnSelect('eF_placa', function() { window.autocompletarFleetrun('eF'); window.calcularFrecuenciaFleetrun('eF'); });
window._cbOnSelect('f_tipomp', function(val) { window.agregarTipoMulti(val); document.getElementById('f_tipomp-txt').value = ''; });
window._cbOnSelect('eF_tipomp', function() { window.calcularFrecuenciaFleetrun('eF'); });

// When placa changes, recalculate all existing types with the new vehicle data
window.recalcularTodosMultiDesdeAutocompletar = function() {
    var kmAct = parseFloat(document.getElementById('f_kmact').value) || 0;
    window.fleetrunTiposMulti.forEach(function(item) {
        var frec = window._buscarFrecuenciaTipo(item.tipo);
        item.frecuencia = frec;
        item.kmProximo = frec > 0 ? (kmAct + frec) : 0;
    });
    window.renderTiposMulti();
};

function abrirModalNuevoFleetrun() { document.getElementById('formFleetrun').reset(); document.getElementById('f_id').value = ''; window.fleetrunTiposMulti = []; window.renderTiposMulti(); let tzOffset = (new Date()).getTimezoneOffset() * 60000; let today = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0]; document.getElementById('f_fecha').value = today; autocompletarFecha('f'); 
    if (window.dataGlobalPlacas) window._cbInit('f_placa', window.dataGlobalPlacas.map(function(p){ return {value:p[0], label:p[0]}; }), 'Buscar placa...');
    if (window._frTipoLista) window._cbInit('f_tipomp', window._frTipoLista.map(function(t){ return {value:t, label:t}; }), 'Buscar tipo...');
    if (window.dataGlobalConductores) window._cbInit('f_tec', window.dataGlobalConductores, 'Buscar responsable…');
  new bootstrap.Offcanvas(document.getElementById('drawerFleetrun')).show(); }

window.autocompletarFleetrun = function(prefix) {
    let placaInput = normalizeStr(document.getElementById(prefix + '_placa').value);
    let match = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placaInput);

    if(match) {
        document.getElementById(prefix + '_marca').value = match[3] || "";
        document.getElementById(prefix + '_dueno').value = match[1] || "";
        document.getElementById(prefix + '_uts').value = match[19] || "";
        
        let combustibleElem = document.getElementById(prefix + '_combustible');
        if (combustibleElem) {
            let combVal = match[14] || "";
            combVal = combVal.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            combustibleElem.value = combVal;
            if (!combustibleElem.value && combVal) {
                // If it doesn't match the dropdown options, just set the text if it was a text input, but it's a select.
            }
        }
        let modeloElem = document.getElementById(prefix + '_modelo');
        if (modeloElem) {
            modeloElem.value = match[4] || "";
        }

        let wialonElem = document.getElementById(prefix + '_kmgps');
        if (wialonElem && typeof buscarWialonPorPlaca === 'function') {
            let wD = buscarWialonPorPlaca(match[0]);
            if (wD && wD.km) {
                wialonElem.value = Math.round(wD.km);
            } else {
                wialonElem.value = '';
            }
        }

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
        <div class="px-2 mb-4">
            <h4 class="fw-bolder text-dark mb-0">${fila[4] || '-'}</h4>
            <div class="text-secondary" style="font-size: 0.8rem;">${marca} • ${dueno}</div>
        </div>
        
        <div class="border rounded-4 bg-white shadow-sm overflow-hidden mb-3">
            <ul class="list-group list-group-flush" style="font-size: 0.85rem;">
                <li class="list-group-item d-flex justify-content-between align-items-center py-3">
                    <span class="text-secondary">ID Mantenimiento</span>
                    <span class="fw-bolder text-dark">${idStr}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center py-3">
                    <span class="text-secondary">Fecha Registro</span>
                    <span class="fw-bold text-dark">${fecha}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center py-3">
                    <span class="text-secondary">${esHorasDet ? 'Horas de Registro' : 'KM de Registro'}</span>
                    <span class="fw-bold text-dark">${km_actual.toLocaleString()} ${unidadFalta}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center py-3">
                    <span class="text-secondary">Frecuencia</span>
                    <span class="fw-bolder" style="color: #d97706;">${frecuencia.toLocaleString()} ${unidadFalta}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center py-3">
                    <span class="text-secondary">${esHorasDet ? 'Horas Próximo' : 'KM Próximo'}</span>
                    <span class="fw-bolder text-dark">${km_prox.toLocaleString()} ${unidadFalta}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center py-3">
                    <span class="text-secondary">${gpsLabel}</span>
                    <span class="fw-bolder" style="color: #0284c7;">${km_gps.toLocaleString()} ${unidadFalta}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center py-3">
                    <span class="text-secondary">Estado</span>
                    <span class="badge ${badgeClass} shadow-sm px-2 py-1 rounded-3" style="font-size: 0.75rem;">${estadoText} (Faltan ${falta_km.toLocaleString()} ${unidadFalta})</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center py-3">
                    <span class="text-secondary">Técnico</span>
                    <span class="fw-bolder text-dark">${tecnico}</span>
                </li>
            </ul>
        </div>
    `;

    if (obs && obs.trim() !== "" && obs.trim() !== "-") {
        html += `
            <div class="p-3 rounded-4 bg-white shadow-sm border">
                <h6 class="fw-bolder mb-2" style="font-size: 0.75rem; color: #1e293b;">OBSERVACIONES</h6>
                <p class="mb-0 text-dark" style="font-size: 0.85rem; line-height: 1.4;">${obs}</p>
            </div>
        `;
    }

    document.getElementById('detalleFleetrunContenido').innerHTML = html;
    let offcanvasElement = document.getElementById('offcanvasFleetrun');
    let bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasElement);
    if (!bsOffcanvas) bsOffcanvas = new bootstrap.Offcanvas(offcanvasElement);
    bsOffcanvas.show();
};

function abrirModalEditarFleetrun(idReg) { const p = dataGlobalFleetrun.find(x => x[0] === idReg); if (!p) return; document.getElementById('formEditarFleetrun').reset(); let dDate = new Date(p[1]); let fechaFormat = isNaN(dDate.getTime()) ? "" : dDate.toISOString().split('T')[0]; document.getElementById('eF_id').value = p[0]; document.getElementById('eF_fecha').value = fechaFormat; document.getElementById('eF_mes').value = p[2]; document.getElementById('eF_anio').value = fechaFormat ? fechaFormat.split('-')[0] : ''; document.getElementById('eF_placa').value = p[4]; document.getElementById('eF_marca').value = p[5]; document.getElementById('eF_dueno').value = p[6]; document.getElementById('eF_uts').value = p[7]; document.getElementById('eF_kmact').value = p[9]; document.getElementById('eF_freckm').value = p[10]; document.getElementById('eF_kmprox').value = p[11]; document.getElementById('eF_obs').value = p[12]; document.getElementById('eF_tec').value = p[13]; document.getElementById('eF_kmgps').value = p[14]; frPlacaInit('eF', p[4]); frTipoInit('eF', p[8]);const btn = document.getElementById('btnActualizarFleetrun'); btn.disabled = false; btn.innerHTML = 'Actualizar Registro'; new bootstrap.Offcanvas(document.getElementById('drawerEditarFleetrun')).show(); }

function enviarFleetrun(event, formObj) {
    event.preventDefault();
    if (!window.guardAction('fleet','c')) return;
    const btn = document.getElementById('btnGuardarFleetrun');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    formObj.usuarioAutor.value = usuarioLogueado;
    const data = {};
    for (let i = 0; i < formObj.elements.length; i++) {
        const el = formObj.elements[i];
        if (el.name) {
            let val = el.value;
            if (!val && document.getElementById(el.id + '-txt')) val = document.getElementById(el.id + '-txt').value;
            data[el.name] = val;
        }
    }
    
    if (data.f_fecha) {
        let dDate = new Date(data.f_fecha + "T00:00:00");
        if (!isNaN(dDate.getTime())) {
            data.f_mes = (dDate.getMonth() + 1).toString();
            data.f_anio = dDate.getFullYear().toString();
        }
    }

    // Use the pre-calculated multi-tipo objects
    let tiposData = window.fleetrunTiposMulti || [];
    
    if (tiposData.length === 0) {
        alert("Selecciona al menos un tipo de mantenimiento.");
        btn.disabled = false; btn.innerHTML = 'Guardar Registro';
        return;
    }

    let results = [];
    let chain = Promise.resolve();

    tiposData.forEach((item) => {
        chain = chain.then(() => {
            let recData = {...data};
            recData.f_tipomp = item.tipo;
            
            // Use pre-calculated values from the intelligent table
            recData.f_freckm = item.frecuencia || 0;
            recData.f_kmprox = item.kmProximo || '';

            return fetch('/api/script/guardarFleetrun', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ args: [recData] }) 
            }).then(r => r.json()).then(r => {
                results.push(r);
            });
        });
    });

    chain.then(() => {
        let allSuccess = results.every(r => r.data === 'Éxito');
        if (allSuccess) {
            formObj.reset();
            window.fleetrunTiposMulti = [];
            window.renderTiposMulti();
            let offcanvasEl = document.getElementById('drawerFleetrun');
            if (offcanvasEl) {
                let instance = bootstrap.Offcanvas.getInstance(offcanvasEl);
                if (instance) instance.hide();
            }
            cargarTablaFleetrun(true);
        } else {
            let errors = results.filter(r => r.data !== 'Éxito').map(r => r.data).join('\\n');
            alert("Algunos registros fallaron:\\n" + errors);
            cargarTablaFleetrun(true);
        }
        btn.disabled = false; btn.innerHTML = 'Guardar Registro';
    }).catch(e => {
        alert('Error de red: ' + e.message);
        btn.disabled = false; btn.innerHTML = 'Guardar Registro';
    });
}

function enviarEdicionFleetrun(event, formObj) {
    event.preventDefault();
    if (!window.guardAction('fleet','e')) return;
    const btn = document.getElementById('btnActualizarFleetrun');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Actualizando...';
    formObj.usuarioAutor.value = usuarioLogueado;
    const data = {};
    for (let i = 0; i < formObj.elements.length; i++) {
        const el = formObj.elements[i];
        if (el.name) {
            let val = el.value;
            if (!val && document.getElementById(el.id + '-txt')) val = document.getElementById(el.id + '-txt').value;
            data[el.name] = val;
        }
    }
    
    if (data.editF_fecha) {
        let dDate = new Date(data.editF_fecha + "T00:00:00");
        if (!isNaN(dDate.getTime())) {
            data.editF_mes = (dDate.getMonth() + 1).toString();
            data.editF_anio = dDate.getFullYear().toString();
        }
    }

    fetch('/api/script/actualizarFleetrun', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [data] }) })
        .then(function(r) { return r.json(); })
        .then(function(r) {
            if (r.data === 'Éxito') {
                bootstrap.Offcanvas.getInstance(document.getElementById('drawerEditarFleetrun')).hide();
                cargarTablaFleetrun(true);
            } else { alert(r.data); }
            btn.disabled = false; btn.innerHTML = 'Actualizar';
        })
        .catch(function(e) { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Actualizar'; });
}

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
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true });

        if (rawJson.length === 0) { alert("Archivo vacío o inválido."); return; }

        const ok = await (typeof window.confirmar === 'function'
            ? window.confirmar({ titulo: 'Importar Fleetrun', mensaje: `Se importarán o actualizarán <strong>${rawJson.length} registros</strong> en Fleetrun. ¿Continuar?`, textoConfirmar: 'Sí, importar' })
            : Promise.resolve(confirm(`Se importarán o actualizarán ${rawJson.length} registros en Fleetrun.\n¿Continuar?`)));
        if (!ok) { event.target.value = ''; return; }

        document.body.style.cursor = 'wait';


        let registrosProcesados = rawJson.map((rawRow, idx) => {
            let r = {};
            // Limpieza agresiva: elimina BOM, espacios no-breaking y cualquier char invisible
            for (let k in rawRow) {
                let clean = k.replace(/[\u0000-\u001F\u007F-\u00A0\uFEFF]/g, '').toUpperCase().trim();
                r[clean] = rawRow[k];
            }

            let rawFecha = r['FECHA INGRESO'] || r['FECHA'] || r['FECHA REGISTRO'] || '';
            let fechaIngreso = '';
            if (rawFecha instanceof Date && !isNaN(rawFecha)) {
                let y = rawFecha.getFullYear();
                let m = String(rawFecha.getMonth() + 1).padStart(2, '0');
                let d = String(rawFecha.getDate()).padStart(2, '0');
                fechaIngreso = `${y}-${m}-${d}`;
            } else {
                fechaIngreso = String(rawFecha).trim();
                if (fechaIngreso.includes('/')) {
                    let p = fechaIngreso.split('/');
                    let p0 = p[0].trim().padStart(2, '0');
                    let p1 = p[1].trim().padStart(2, '0');
                    let p2 = p[2] ? p[2].trim() : '';
                    if (p2.length === 2) p2 = '20' + p2;
                    if (p2.length === 4) {
                        if (parseInt(p1) > 12) {
                            fechaIngreso = `${p2}-${p0}-${p1}`;
                        } else {
                            fechaIngreso = `${p2}-${p1}-${p0}`;
                        }
                    }
                } else if (fechaIngreso.includes('-')) {
                    let p = fechaIngreso.split('-');
                    let p0 = p[0].trim();
                    let p2 = p[2].trim();
                    if (p0.length === 2 && p2.length === 4) {
                        fechaIngreso = `${p2}-${p[1].trim().padStart(2, '0')}-${p0.padStart(2, '0')}`;
                    }
                }
            }
            let kmactStr = String(r['KM ACTUAL'] || '0').replace(/,/g, '');
            let kmact = parseFloat(kmactStr) || 0;
            let frecStr = String(r['FRECUENCIA'] || '0').replace(/,/g, '');
            let frec = parseFloat(frecStr) || 0;
            
            let placaVal = String(r['PLACA'] || r['PLACA Y MARCA'] || r['PLACA / MARCA'] || r['UNIDAD'] || r['VEHICULO'] || '').trim();
            let marca = '', dueno = '', uts = '', combustible = '', modelo = '', wialonKm = '';
            
            let pMatch = window.dataGlobalPlacas && window.dataGlobalPlacas.find(p => p[0].toLowerCase() === placaVal.toLowerCase());
            if (pMatch) {
                dueno = pMatch[1] || '';
                marca = pMatch[3] || '';
                modelo = pMatch[4] || '';
                combustible = pMatch[14] || '';
                uts = pMatch[19] || '';
            }

            if (typeof buscarWialonPorPlaca === 'function') {
                let wD = buscarWialonPorPlaca(placaVal);
                if (wD && wD.km) {
                    wialonKm = Math.round(wD.km).toString();
                }
            }

            return {
                id: r['ID'] || `FLT-${Date.now()}-${idx}`,
                fecha: fechaIngreso,
                placa: placaVal,
                tipomp: r['TIPO MP'] || '',
                kmact: kmact.toString(),
                freckm: frec.toString(),
                kmprox: (kmact + frec).toString(),
                tec: r['TECNICO'] || '',
                obs: r['OBSERVACION'] || '',
                mes: fechaIngreso ? fechaIngreso.split('-')[1] : '',
                anio: fechaIngreso ? fechaIngreso.split('-')[0] : '',
                marca: marca,
                dueno: dueno,
                uts: uts,
                combustible: combustible,
                modelo: modelo,
                km_gps: wialonKm
            };

        });

        if (registrosProcesados.length > 0 && registrosProcesados.every(r => !r.placa || r.placa.trim() === '')) {
            let keys = Object.keys(rawJson[0] || {}).map(k => JSON.stringify(k)).join(', ');
            alert(`Error: no se encontró placa en ninguna fila.\nColumnas raw del Excel: ${keys}`);
            document.body.style.cursor = 'default'; event.target.value = '';
            return;
        }

        fetch('/api/importarFleetrunMasivo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registros: registrosProcesados })
        }).then(res => res.json()).then(r => {
            document.body.style.cursor = 'default'; event.target.value = '';
            alert(`Importación completada.\nProcesados: ${r.ok}\nErrores: ${r.errores}\nDetalle: ${r.detalle || 'Ninguno'}`);
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
            labels: ['Vencidos', 'Próximos a Vencer', 'Vigentes'],
            datasets: [{ data: [1, 0, 0], backgroundColor: ['#dc3545', '#ffc107', '#198754'], borderWidth: 2, hoverOffset: 4 }]
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
                    let estadoVal = ['VENCIDO', 'PROXIMO', 'VIGENTE'][index] || '';
                    window.filtrarDesdeKpiFleetrun(estadoVal);
                }
            }
        }
    });
};

window.filtrarDesdeKpiFleetrun = function(estadoVal) {
    document.querySelectorAll('#filtroFleetEstado input:checked').forEach(c => c.checked = false);
    if (estadoVal) {
        let checkbox = document.querySelector(`#filtroFleetEstado input[value="${estadoVal}"]`);
        if(checkbox) checkbox.checked = true;
    }
    filtrarFleetrunAvanzado();
};

window.updateGraficoFleetrun = function(vencidos, proximos, vigentes, totalFlota) {
    // 1. Actualizar Datos de Empresa y Fecha
    const empNombre = localStorage.getItem('fleet_empresa_nombre') || 'Azkell Fleet';
    const empLogo = localStorage.getItem('fleet_empresa_logo') || '';
    
    const elNombreEmp = document.getElementById('scania-nombre-empresa');
    if (elNombreEmp) elNombreEmp.textContent = empNombre;
    
    const elLogoEmp = document.getElementById('scania-logo-empresa');
    if (elLogoEmp && empLogo) {
        elLogoEmp.src = empLogo;
        elLogoEmp.style.display = 'block';
    }

    const elFecha = document.getElementById('scania-fecha-actual');
    if (elFecha) {
        const ahora = new Date();
        const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        let fecStr = ahora.toLocaleDateString('es-ES', opciones);
        fecStr = fecStr.charAt(0).toUpperCase() + fecStr.slice(1);
        elFecha.textContent = fecStr;
    }

    // 2. Actualizar KPIs Numéricos
    const kpiTotal = document.getElementById('sca-kpi-total');
    const kpiCrit = document.getElementById('sca-kpi-critico');
    const pctCrit = document.getElementById('sca-pct-critico');
    const kpiRiesgo = document.getElementById('sca-kpi-riesgo');
    const pctRiesgo = document.getElementById('sca-pct-riesgo');
    const kpiOper = document.getElementById('sca-kpi-operativo');
    const pctOper = document.getElementById('sca-pct-operativo');

    if (kpiTotal) kpiTotal.textContent = totalFlota || 0;
    
    const calcPct = (val) => totalFlota ? Math.round((val / totalFlota) * 100) + '%' : '0%';
    
    if (kpiCrit) { kpiCrit.textContent = vencidos || 0; pctCrit.textContent = calcPct(vencidos); }
    if (kpiRiesgo) { kpiRiesgo.textContent = proximos || 0; pctRiesgo.textContent = calcPct(proximos); }
    if (kpiOper) { kpiOper.textContent = vigentes || 0; pctOper.textContent = calcPct(vigentes); }

    // 3. Actualizar Gráfico Donut
    if(!window.chartFleetrunInst) window.chartFleetrunInst = initGraficoFleetrun();
    if(!window.chartFleetrunInst) return;
    let isDark = document.body.classList.contains('dark');
    window.chartFleetrunInst.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1a1a2e';
    window.chartFleetrunInst.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
    
    let totalMant = (vencidos || 0) + (proximos || 0) + (vigentes || 0);
    if(totalMant === 0) {
        window.chartFleetrunInst.data.labels = ['Sin Datos'];
        window.chartFleetrunInst.data.datasets[0].data = [1];
        window.chartFleetrunInst.data.datasets[0].backgroundColor = ['#475569'];
    } else {
        window.chartFleetrunInst.data.labels = ['Vencidos', 'Próximos', 'Vigentes'];
        window.chartFleetrunInst.data.datasets[0].data = [vencidos, proximos, vigentes];
        window.chartFleetrunInst.data.datasets[0].backgroundColor = ['#dc3545', '#ffc107', '#198754'];
    }
    window.chartFleetrunInst.update();
};

window.procesarFleetrunParaDashboard = function() {
    if (!dataGlobalFleetrun || dataGlobalFleetrun.length === 0 || !dataGlobalPlacas || dataGlobalPlacas.length === 0) {
        setTimeout(procesarFleetrunParaDashboard, 500);
        return;
    }

    let cntCrit = 0, cntRiesgo = 0, cntInmed = 0, cntOper = 0;
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
        let km_prox = parseFloat(fila[11]) || 0;
        let km_cambio = parseFloat(fila[9]) || 0;
        let frecuencia = parseFloat(fila[10]) || 0;
        let placaRaw = fila[4];

        let km_gps = 0;
        let wialonData = buscarWialonPorPlaca(placaRaw);
        if (wialonData) { km_gps = wialonData.km; }

        let km_desde = km_gps - km_cambio;
        let km_restante = frecuencia - km_desde;
        if (km_restante < 0 && !isHistorialFleetrun) km_restante = km_prox - km_gps;

        if (km_restante <= 0) {
            cntCrit++;
        } else if (km_restante <= 1000) {
            cntRiesgo++;
        } else if (km_restante <= 2500) {
            cntInmed++;
        } else {
            cntOper++;
        }
    });

    updateGraficoDashFleetrun(cntCrit, cntRiesgo, cntInmed, cntOper);
};

window.initGraficoDashFleetrun = function() {
    let ctx = document.getElementById('chartDashFleetrunStatus');
    if (!ctx) return null;
    Chart.defaults.font.family = 'Inter';

    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Críticos', 'En Riesgo', 'Inmediatos', 'Operativos'],
            datasets: [{
                data: [1, 0, 0, 0],
                backgroundColor: ['#dc3545', '#fd7e14', '#ffc107', '#198754'],
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

window.updateGraficoDashFleetrun = function(criticos, riesgo, inmediatos, operativos) {
    if(!chartDashFleetrunInst) chartDashFleetrunInst = initGraficoDashFleetrun();
    if(!chartDashFleetrunInst) return;
    let isDark = document.body.classList.contains('dark');
    chartDashFleetrunInst.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1a1a2e';
    chartDashFleetrunInst.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
    let totalMant = (criticos || 0) + (riesgo || 0) + (inmediatos || 0) + (operativos || 0);
    if(totalMant === 0) {
        chartDashFleetrunInst.data.labels = ['Sin Datos'];
        chartDashFleetrunInst.data.datasets[0].data = [1];
        chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#475569'];
    } else {
        chartDashFleetrunInst.data.labels = ['Críticos', 'En Riesgo', 'Inmediatos', 'Operativos'];
        chartDashFleetrunInst.data.datasets[0].data = [criticos, riesgo, inmediatos, operativos];
        chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#dc3545', '#fd7e14', '#ffc107', '#198754'];
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

// ── Searchable single-select para Placa ─────────────────────────────────────
function frPlacaInit(prefix, valorActual) {
    var hidden = document.getElementById(prefix + '_placa');
    var lbl    = document.getElementById('frPlacaLbl-' + prefix);
    var dd     = document.getElementById('frPlacaDD-' + prefix);
    var busq   = document.getElementById('frPlacaBusq-' + prefix);
    if (hidden) hidden.value = valorActual || '';
    if (lbl) { lbl.textContent = valorActual || 'Selecciona una placa...'; lbl.style.color = valorActual ? 'var(--text,#212529)' : '#6c757d'; }
    if (dd) dd.style.display = 'none';
    if (busq) busq.value = '';
    frPlacaRender('', prefix);
}

window.frPlacaToggle = function(prefix) {
    var dd  = document.getElementById('frPlacaDD-' + prefix);
    var box = document.getElementById('frPlacaBox-' + prefix);
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) {
        dd.style.display = 'none';
        if (box) box.style.borderColor = '';
    } else {
        
        dd.style.display = 'block';
        if (box) box.style.borderColor = 'var(--primary, #5865F2)';
        var busq = document.getElementById('frPlacaBusq-' + prefix);
        if (busq) { busq.value = ''; busq.focus(); }
        frPlacaRender('', prefix);
    }
};

window.frPlacaFiltrar = function(query, prefix) { frPlacaRender(query || '', prefix); };

function frPlacaRender(query, prefix) {
    var container = document.getElementById('frPlacaOpts-' + prefix);
    if (!container) return;
    var q = (query || '').toUpperCase();
    var hidden = document.getElementById(prefix + '_placa');
    var actual = (hidden ? hidden.value : '').toUpperCase();
    var lista = (window.dataGlobalPlacas || [])
        .map(function(p) { return (p[0] || '').trim().toUpperCase(); })
        .filter(function(p, i, arr) { return p && arr.indexOf(p) === i; })
        .sort();
    var filtrados = q ? lista.filter(function(p) { return p.indexOf(q) !== -1; }) : lista;
    if (filtrados.length === 0) {
        container.innerHTML = '<div style="padding:10px 14px; color:var(--subtext,#6c757d); font-size:0.83rem; text-align:center;">Sin resultados</div>';
        return;
    }
    container.innerHTML = filtrados.map(function(placa) {
        var isSelected = placa === actual;
        var pEsc = placa.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return '<div onclick="window.frPlacaSelect(\'' + pEsc + '\',\'' + prefix + '\')" '
            + 'style="padding:9px 14px; cursor:pointer; font-size:0.85rem; font-weight:600; letter-spacing:0.04em; color:var(--text,#212529);'
            + (isSelected ? ' background:var(--primary,#5865F2); color:#fff;' : '')
            + '" onmouseenter="this.style.background=this.style.background||\'var(--bg,#f8f9fa)\'" '
            + 'onmouseleave="this.style.background=\'\'"> '
            + placa + '</div>';
    }).join('');
}

window.frPlacaSelect = function(valor, prefix) {
    var hidden = document.getElementById(prefix + '_placa');
    var lbl    = document.getElementById('frPlacaLbl-' + prefix);
    var dd     = document.getElementById('frPlacaDD-' + prefix);
    var box    = document.getElementById('frPlacaBox-' + prefix);
    if (hidden) hidden.value = valor;
    if (lbl) { lbl.textContent = valor; lbl.style.color = 'var(--text,#212529)'; }
    if (dd) dd.style.display = 'none';
    if (box) box.style.borderColor = '';
    if (typeof window.autocompletarFleetrun === 'function') window.autocompletarFleetrun(prefix);
};

// Cerrar al clicar fuera (safe SPA)
window._frPlacaOutsideClick = function(e) {
    ['f', 'eF'].forEach(function(prefix) {
        var wrapper = document.getElementById('frPlacaW-' + prefix);
        if (wrapper && !wrapper.contains(e.target)) {
            var dd  = document.getElementById('frPlacaDD-' + prefix);
            var box = document.getElementById('frPlacaBox-' + prefix);
            if (dd) dd.style.display = 'none';
            if (box) box.style.borderColor = '';
        }
    });
};
document.removeEventListener('click', window._frPlacaOutsideClick);
document.addEventListener('click', window._frPlacaOutsideClick);

// ── Searchable single-select para Tipo de Mantenimiento ─────────────────────
window._frTipoLista = window._frTipoLista || [];

function frTipoInit(prefix, valorActual) {
    var hidden = document.getElementById(prefix + '_tipomp');
    var lbl    = document.getElementById('frTipoLbl-' + prefix);
    var dd     = document.getElementById('frTipoDD-' + prefix);
    var busq   = document.getElementById('frTipoBusq-' + prefix);
    if (hidden) hidden.value = valorActual || '';
    if (lbl) lbl.textContent = valorActual || '— Seleccionar tipo —';
    if (lbl) lbl.style.color = valorActual ? 'var(--text,#212529)' : '#6c757d';
    if (dd) dd.style.display = 'none';
    if (busq) busq.value = '';

    var doRender = function() { frTipoRender('', prefix); };
    if (window._frTipoLista.length > 0) { doRender(); return; }
    
    fetch('/api/tipos-preventivo')
        .then(function(r) { return r.ok ? r.json() : { data: [] }; })
        .then(function(resp) {
            var lista = Array.isArray(resp) ? resp : (resp.data || []);
            window._frTipoLista = lista
                .filter(function(t) { return t.activo !== 0; })
                .map(function(t) { return (t.nombre || '').trim(); })
                .filter(function(n) { return n.length > 0; })
                .sort(function(a, b) { return a.localeCompare(b); });
            doRender();
        })
        .catch(function() {});
}

window.frTipoToggle = function(prefix) {
    var dd  = document.getElementById('frTipoDD-' + prefix);
    var box = document.getElementById('frTipoBox-' + prefix);
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) {
        dd.style.display = 'none';
        if (box) box.style.borderColor = '';
    } else {
        
        dd.style.display = 'block';
        if (box) box.style.borderColor = 'var(--primary, #5865F2)';
        var busq = document.getElementById('frTipoBusq-' + prefix);
        if (busq) { busq.value = ''; busq.focus(); }
        frTipoRender('', prefix);
    }
};

window.frTipoFiltrar = function(query, prefix) { frTipoRender(query || '', prefix); };

function frTipoRender(query, prefix) {
    var container = document.getElementById('frTipoOpts-' + prefix);
    if (!container) return;
    var q = (query || '').toLowerCase();
    var hidden = document.getElementById(prefix + '_tipomp');
    var actual = hidden ? (hidden.value || '').toUpperCase() : '';
    var filtrados = window._frTipoLista.filter(function(n) {
        return !q || n.toLowerCase().indexOf(q) !== -1;
    });
    if (filtrados.length === 0) {
        container.innerHTML = '<div style="padding:10px 14px; color:var(--subtext,#6c757d); font-size:0.83rem; text-align:center;">Sin resultados</div>';
        return;
    }
    container.innerHTML = filtrados.map(function(n) {
        var isSelected = n.toUpperCase() === actual;
        var nEsc = n.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return '<div onclick="window.frTipoSelect(\'' + nEsc + '\',\'' + prefix + '\')" '
            + 'style="padding:9px 14px; cursor:pointer; font-size:0.85rem; color:var(--text,#212529);'
            + (isSelected ? ' background:var(--primary,#5865F2); color:#fff; font-weight:600;' : '')
            + '" onmouseenter="if(!this.classList.contains(\'fr-sel\')) this.style.background=\'var(--bg,#f8f9fa)\'" '
            + 'onmouseleave="if(!this.classList.contains(\'fr-sel\')) this.style.background=\'\'"> '
            + n + '</div>';
    }).join('');
}

window.frTipoSelect = function(valor, prefix) {
    var hidden = document.getElementById(prefix + '_tipomp');
    var lbl    = document.getElementById('frTipoLbl-' + prefix);
    var dd     = document.getElementById('frTipoDD-' + prefix);
    var box    = document.getElementById('frTipoBox-' + prefix);
    if (hidden) hidden.value = valor;
    if (lbl) { lbl.textContent = valor; lbl.style.color = 'var(--text,#212529)'; }
    if (dd) dd.style.display = 'none';
    if (box) box.style.borderColor = '';
    if (typeof calcularFrecuencia === 'function') calcularFrecuencia(prefix);
};

// Cerrar al clicar fuera (safe SPA)
window._frTipoOutsideClick = function(e) {
    ['f', 'eF'].forEach(function(prefix) {
        var wrapper = document.getElementById('frTipoW-' + prefix);
        if (wrapper && !wrapper.contains(e.target)) {
            var dd  = document.getElementById('frTipoDD-' + prefix);
            var box = document.getElementById('frTipoBox-' + prefix);
            if (dd) dd.style.display = 'none';
            if (box) box.style.borderColor = '';
        }
    });
};
document.removeEventListener('click', window._frTipoOutsideClick);
document.addEventListener('click', window._frTipoOutsideClick);

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

    // Ocultar filtro Empresa para no administradores/fundadores
    let role = window.userRole || localStorage.getItem('fleet_rol') || 'tecnico';
    let wrapFiltroEmp = document.getElementById('filtroFleetClienteWrap');
    if (wrapFiltroEmp) {
        if (role !== 'admin' && role !== 'fundador' && role !== 'Administrador') {
            wrapFiltroEmp.style.display = 'none';
        } else {
            wrapFiltroEmp.style.display = 'inline-block';
        }
    }

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


window.calcularFrecuenciaFleetrun = function(prefix) {
    if (!window.dataTiposMant || window.dataTiposMant.length === 0) return;
    let tipoMP = (document.getElementById(prefix + '_tipomp').value || '').trim().toLowerCase();
    
    // Si el valor empieza por [ es porque es JSON (modo multi)
    if (tipoMP.startsWith('[')) {
        try {
            let arr = JSON.parse(tipoMP);
            if (arr.length === 1) tipoMP = arr[0].toLowerCase();
            else return; // If 0 or >1, we don't calculate a single frequency
        } catch(e) {}
    }
    
    window.calcularFrecuenciaFleetrunMulti(tipoMP, prefix);
};

window.calcularFrecuenciaFleetrunMulti = function(tipoMP, prefix) {
    if (!window.dataTiposMant || window.dataTiposMant.length === 0) return;
    
    let marca = (document.getElementById(prefix + '_marca').value || '').trim().toLowerCase();
    tipoMP = (tipoMP || '').trim().toLowerCase();
    let uts = (document.getElementById(prefix + '_uts').value || '').trim().toLowerCase();
    let combustible = (document.getElementById(prefix + '_combustible').value || '').trim().toLowerCase();
    let modelo = (document.getElementById(prefix + '_modelo').value || '').trim().toLowerCase();

    if (!marca || !tipoMP) return;

    let match = window.dataTiposMant.find(t => {
        let tMarca = (t.marca || '').trim().toLowerCase();
        let tTipoMP = (t.tipo_mp || '').trim().toLowerCase();
        let tUts = (t.uts || '').trim().toLowerCase();
        let tComb = (t.combustible || '').trim().toLowerCase();
        let tMod = (t.modelo || '').trim().toLowerCase();
        
        let matchMarca = (!tMarca || tMarca === marca);
        let matchTipoMP = (!tTipoMP || tTipoMP === tipoMP);
        let matchUts = (!tUts || tUts === uts);
        let matchComb = (!tComb || tComb === combustible);
        let matchMod = (!tMod || tMod === modelo);
        
        return matchMarca && matchTipoMP && matchUts && matchComb && matchMod;
    });

    if (match) {
        let placaInput = document.getElementById(prefix + '_placa').value;
        let pMatch = window.dataGlobalPlacas && window.dataGlobalPlacas.find(p => p[0] === placaInput);
        let metrica = (pMatch && pMatch[23] ? pMatch[23].toString().toUpperCase() : 'KM');
        
        let frec = 0;
        if (metrica.includes('HR') || metrica.includes('HORA')) {
            frec = match.frecuencia_horas || match.frecuencia_km || 0;
        } else {
            frec = match.frecuencia_km || match.frecuencia_horas || 0;
        }

        if (frec > 0) {
            let elemFrec = document.getElementById(prefix + '_freckm');
            if (elemFrec) {
                elemFrec.value = frec;
                if (typeof window.calcularProximo === 'function') {
                    window.calcularProximo(prefix);
                }
            }
        }
    }
};
