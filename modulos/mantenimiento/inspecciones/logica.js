// ================================================================
// MÓDULO: INSPECCIONES — análisis de estados y formulario wizard
// Cargado dinámicamente por cargarModuloAislado('mantenimiento/inspecciones')
// ================================================================

// Paginación inspecciones (patrón window para SPA)
window.dataFinalInspGlobal = window.dataFinalInspGlobal || [];
window.inspPorPagina = window.inspPorPagina || parseInt(localStorage.getItem('fleet_insp_ppp') || '50');
window.inspPaginaActual = window.inspPaginaActual || 1;

window.DYNAMIC_INSP_SCHEMA = window.DYNAMIC_INSP_SCHEMA || [];
fetch('/api/mantenimiento/inspecciones/config')
    .then(r => r.json())
    .then(res => {
        if (res.ok && res.data) {
            window.DYNAMIC_INSP_SCHEMA = res.data.map(d => {
                let parsedItems = [];
                try { parsedItems = typeof d.items_json === 'string' ? JSON.parse(d.items_json) : d.items_json; } catch(e){}
                return { tab: d.titulo, template_id: d.template_id, items: parsedItems };
            });
        }
    })
    .catch(err => console.error("Error preloading config insp:", err));

// ── Lightbox para evidencias fotográficas ─────────────────────────
window.verFotoEvidencia = function (urlFoto, titulo) {
    var modalId = 'modal-foto-evidencia';
    var existing = document.getElementById(modalId);
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.id = modalId;
    div.className = 'modal fade';
    div.tabIndex = -1;
    div.innerHTML =
        '<div class="modal-dialog modal-lg modal-dialog-centered">' +
        '<div class="modal-content" style="background:var(--surface);color:var(--text);">' +
        '<div class="modal-header border-0 pb-1">' +
        '<h6 class="modal-title fw-semibold"><i class="bi bi-camera-fill me-2 text-secondary"></i>' +
        (titulo || 'Evidencia fotográfica').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</h6>' +
        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
        '</div>' +
        '<div class="modal-body text-center p-2">' +
        '<img src="' + urlFoto + '" class="img-fluid rounded" style="max-height:70vh;object-fit:contain;" ' +
        'onerror="this.src=\'\';this.alt=\'No se pudo cargar la imagen\';">' +
        '</div>' +
        '<div class="modal-footer border-0 pt-1">' +
        '<a href="' + urlFoto + '" target="_blank" class="btn btn-sm btn-outline-secondary">' +
        '<i class="bi bi-box-arrow-up-right me-1"></i>Abrir original</a>' +
        '<button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cerrar</button>' +
        '</div>' +
        '</div>' +
        '</div>';
    document.body.appendChild(div);
    var modal = bootstrap.Modal.getOrCreateInstance(div);
    modal.show();
    div.addEventListener('hidden.bs.modal', function () { div.remove(); });
};

// ==========================================
// 🔥 MÓDULO ANÁLISIS DE INSPECCIONES (STATUS) 🔥
// ==========================================
function toggleGraficosStatus() { let panel = document.getElementById('panelGraficosStatus'); if (panel.style.display === 'none') { panel.style.display = 'flex'; } else { panel.style.display = 'none'; } }
function toggleVistaStatus() { isHistorialStatus = !isHistorialStatus; let textBtn = document.getElementById('text-toggle-status'); if (textBtn) { textBtn.innerText = isHistorialStatus ? "Ver Últimos Registros" : "Ver Historial"; } expandAllStatusState = false; expandStatusMap = {}; mostrarStatusInspecciones(dataGlobalInspecciones); }
function toggleGroupRowStatus(classTipo) { expandStatusMap[classTipo] = !expandStatusMap[classTipo]; filtrarStatusAvanzado(); }
function toggleAllStatusGroups() { expandAllStatusState = !expandAllStatusState; for (let key in expandStatusMap) { expandStatusMap[key] = expandAllStatusState; } const headers = document.querySelectorAll('#cuerpoTablaStatus tr.group-header'); headers.forEach(header => { let matchIcon = header.querySelector('i').className.match(/toggle-icon-(\w+)/); if (matchIcon) expandStatusMap[matchIcon[1]] = expandAllStatusState; }); filtrarStatusAvanzado(); }

function mostrarStatusInspecciones(inspecciones) {
    if (procesadorErroresCuota(inspecciones, 'cuerpoTablaStatus')) return;
    dataGlobalInspecciones = inspecciones;
    let hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let numId = (id) => parseInt((id || '').split('-')[1]) || 0;
    let inspeccionesOrdenadas = [...inspecciones].sort((a, b) => numId(b.id) - numId(a.id));
    inspeccionesOrdenadas = inspeccionesOrdenadas.filter(i => i.estado !== 'Eliminada');
    let dataFinal = [];

    let placasActivasEnUso = (window.dataGlobalPlacas || []).filter(p => {
        if ((p[0] || '').toUpperCase() === 'PLACA') return false;
        let estado = normalizeStr(p[18] || p[8] || '');
        let enUso = normalizeStr(p[22] || p[13] || '');
        // Incluir todas las ACTIVAS excepto las explícitamente marcadas como NO en uso
        return estado === "ACTIVA" && enUso !== "NO";
    });

    if (!isHistorialStatus) {
        placasActivasEnUso.forEach(p => {
            let placaStr = normalizeStr(p[0]);
            let insp = inspeccionesOrdenadas.find(i => normalizeStr(i.placa) === placaStr);
            dataFinal.push({ infoPlaca: p, insp: insp });
        });
    } else {
        inspeccionesOrdenadas.forEach(insp => {
            let placaStr = normalizeStr(insp.placa);
            let p = (window.dataGlobalPlacas || []).find(pl => normalizeStr(pl[0]) === placaStr) || [insp.placa, "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"];
            dataFinal.push({ infoPlaca: p, insp: insp });
        });
    }

    // — Paginación — guardar total y cortar dataFinal
    window.dataFinalInspGlobal = dataFinal;
    if (isHistorialStatus && window.inspPorPagina > 0) {
        let _ini = (window.inspPaginaActual - 1) * window.inspPorPagina;
        if (_ini >= dataFinal.length && dataFinal.length > 0) { window.inspPaginaActual = 1; _ini = 0; }
        dataFinal = dataFinal.slice(_ini, _ini + window.inspPorPagina);
    }

    let mapTipos = new Map(); let setClis = new Set(), setMarcas = new Set(), setEstadosStatus = new Set();
    dataFinal.forEach(item => {
        let tipoRaw = item.infoPlaca[5] ? item.infoPlaca[5].toString().trim().toUpperCase() : "SIN TIPO";
        let tipoDisplay = tipoRaw === "SIN TIPO" || tipoRaw === "" ? "SIN TIPO" : tipoRaw.charAt(0).toUpperCase() + tipoRaw.slice(1).toLowerCase();
        if (!mapTipos.has(tipoDisplay)) mapTipos.set(tipoDisplay, []);
        mapTipos.get(tipoDisplay).push(item);
    });

    let html = '';
    if (dataFinal.length === 0) { html = '<tr><td colspan="10" class="text-center py-4">No hay datos para analizar.</td></tr>'; }
    else {
        mapTipos.forEach((registros, tipoDisplay) => {
            let classTipo = normalizarClase(tipoDisplay);
            if (expandStatusMap[classTipo] === undefined) expandStatusMap[classTipo] = false;

            html += `<tr class="group-header data-row-status" style="cursor:pointer;" onclick="toggleGroupRowStatus('${classTipo}')">
              <td colspan="10" class="d-none d-md-table-cell fw-bold text-start" style="background-color: rgba(128,128,128,0.1) !important; color: var(--text) !important;">
                  <i class="bi bi-chevron-right ms-1 me-2 text-warning toggle-icon-${classTipo}"></i>
                  <span style="display:inline-block; min-width:80px;"><i class="bi bi-tag text-secondary"></i> <span class="text-uppercase">${tipoDisplay}</span></span>
                  <span class="badge bg-warning text-dark float-end span-conteo-${classTipo}">${registros.length} Unidades</span>
              </td>
              <td colspan="10" class="d-block d-md-none p-0 border-0 bg-white">
                  <div class="d-flex align-items-center justify-content-between p-3 border-bottom" style="background-color: #ffffff;">
                      <div class="d-flex align-items-center gap-3">
                          <i class="bi bi-truck" style="color: #f59e0b;"></i>
                          <span class="fw-bold text-dark" style="font-size: 14px;">${tipoDisplay}</span>
                          <span class="badge bg-light text-secondary rounded-pill span-conteo-${classTipo}" style="font-size: 10px; border: 1px solid #e2e8f0;">${registros.length}</span>
                      </div>
                      <i class="bi bi-chevron-down text-secondary toggle-icon-${classTipo}"></i>
                  </div>
              </td></tr>`;

            registros.forEach((item) => {
                let p = item.infoPlaca; let insp = item.insp;
                let placa = p[0];
                let cli = p[1] || "-";
                let mar = p[3] || "-";
                let mod = p[5] || "-";
                let motora = p[20] || p[11] || "-";

                if (cli !== "-") setClis.add(cli); if (mar !== "-") setMarcas.add(mar);

                let fIngresoBonita = "-"; let diasRestantes = -9999; let tecnico = "-"; let colorFalta = ""; let txtEstado = ""; let estadoVigente2 = "";

                if (insp && insp.fecha_ingreso) {
                    fIngresoBonita = parseDateToDDMMYYYY(insp.fecha_ingreso); tecnico = insp.tecnico;
                    let fIngreso;
                    if (insp.fecha_ingreso.includes('/')) {
                        let px = insp.fecha_ingreso.split('/'); fIngreso = new Date(px[2], px[1] - 1, px[0]);
                    } else {
                        // ISO "2026-02-20" o "2026-02-20T00:00:00.000Z" — tomar solo la parte de fecha
                        let ds = insp.fecha_ingreso.split('T')[0].split('-');
                        fIngreso = ds.length === 3 ? new Date(parseInt(ds[0]), parseInt(ds[1]) - 1, parseInt(ds[2])) : new Date(insp.fecha_ingreso);
                    }

                    let dProp = parseInt(insp.dias_propuestos) || 30;
                    let fProx = new Date(fIngreso.getTime()); fProx.setDate(fProx.getDate() + dProp);
                    diasRestantes = Math.ceil((fProx - hoy) / (1000 * 60 * 60 * 24));
                }

                let textoBadgeProx = "";
                if (diasRestantes < 0 && diasRestantes !== -9999) {
                    colorFalta = "#dc2626"; txtEstado = "NO VIGENTE"; estadoVigente2 = "NO VIGENTE";
                    textoBadgeProx = `Vencido hace ${Math.abs(diasRestantes)} días`;
                } else if (diasRestantes >= 0 && diasRestantes <= 7) {
                    colorFalta = "#eab308"; txtEstado = "PRÓXIMO A VENCER"; estadoVigente2 = "PRÓXIMO A VENCER";
                    textoBadgeProx = `Faltan ${diasRestantes} días`;
                } else if (diasRestantes > 7) {
                    colorFalta = "#16a34a"; txtEstado = "VIGENTE"; estadoVigente2 = "VIGENTE";
                    textoBadgeProx = `Faltan ${diasRestantes} días`;
                } else {
                    colorFalta = "#dc2626"; txtEstado = "NO VIGENTE"; estadoVigente2 = "NO VIGENTE";
                }

                if (estadoVigente2 !== "") setEstadosStatus.add(estadoVigente2);

                let badgeProx = diasRestantes === -9999 ? `<span class="badge bg-danger shadow-sm">Sin Registro</span>` : `<span class="badge p-1 px-2 shadow-sm text-white" style="background-color: ${colorFalta};">${textoBadgeProx}</span>`;
                let badgeEst = `<span style="color: ${colorFalta}; font-weight: bold; font-size: 0.8rem;">${txtEstado}</span>`;
                let subCli = `<br><span class="text-muted" style="font-size: 0.75rem;">${cli}</span>`;

                let checkHtml = (window.modoSeleccion && window.modoSeleccion['statusMant'] && insp && insp.id)
                    ? `<input type="checkbox" class="form-check-input chk-bulk-statusMant" value="${insp.id}" style="pointer-events: none; transform: scale(1.2); margin-right: 8px;">`
                    : '';

                let ubicacionHtml = '<span class="text-muted" style="font-size: 0.8rem;"><i class="bi bi-geo-alt-fill"></i> N/A</span>';
                let wialonData = buscarWialonPorPlaca(placa);
                if (wialonData && wialonData.lat !== 0) {
                    ubicacionHtml = `
                  <div class="text-start">
                      <button class="badge bg-primary text-white shadow-sm mb-1 border-0" onclick="abrirMapaFlotante('${placa}', ${wialonData.lat}, ${wialonData.lng})"><i class="bi bi-map-fill"></i> Mapa</button>
                      <button class="badge bg-secondary text-white shadow-sm mb-1 border-0" onclick="obtenerDireccion(${wialonData.lat}, ${wialonData.lng}, this)"><i class="bi bi-signpost-2"></i> Calle</button><br>
                      <span style="font-size: 0.75rem; color: var(--text); font-weight: bold;"><i class="bi bi-speedometer"></i> ${wialonData.km.toLocaleString()} km</span>
                  </div>`;
                }

                let menuAcciones = '';
                if (insp && insp.id) {
                    let items = `<li><a class="dropdown-item fw-bold" href="javascript:void(0)" onclick="verDetalleInspeccion('${insp.id}', false)"><i class="bi bi-eye text-primary"></i> Ver Resumen</a></li>`;
                    items += `<li><a class="dropdown-item fw-bold" href="javascript:void(0)" onclick="verDetalleInspeccion('${insp.id}', true)"><i class="bi bi-file-pdf text-danger"></i> Exportar a PDF</a></li>`;
                    if (window.checkPerm('insp', 'e')) {
                        items += `<li><hr class="dropdown-divider"></li>`;
                        items += `<li><a class="dropdown-item" href="javascript:void(0)" onclick="abrirModalEditarInspeccion('${insp.id}')"><i class="bi bi-pencil text-warning"></i> Editar / Re-Firmar</a></li>`;
                    }
                    if (window.checkPerm('insp', 'd')) {
                        items += `<li><a class="dropdown-item text-danger fw-bold" href="javascript:void(0)" onclick="eliminarRegistro('${insp.id}', 'Inspecciones')"><i class="bi bi-trash"></i> Eliminar Definitivo</a></li>`;
                    }
                    menuAcciones = `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${items}</ul></div>`;
                } else {
                    if (window.checkPerm && window.checkPerm('insp', 'c')) {
                        menuAcciones = `<button class="btn btn-sm btn-outline-primary fw-bold" onclick="abrirModalNuevaInspeccion('${placa}')" title="Registrar primera inspección"><i class="bi bi-plus-lg"></i> Registrar</button>`;
                    } else {
                        menuAcciones = '<span class="text-muted"><i class="bi bi-dash"></i></span>';
                    }
                }

                let txtBadgeReact = diasRestantes === -9999 ? "SIN REGISTRO" : "REGISTRADO";
                let txtKmReact = (wialonData && wialonData.lat !== 0) ? `${wialonData.km.toLocaleString()} km` : "N/A";

                let btnRegistrar = '';
                if (!insp || !insp.id) {
                    if (window.checkPerm && window.checkPerm('insp', 'c')) {
                        btnRegistrar = `<button class="btn btn-sm d-flex align-items-center gap-1 shadow-sm" style="color: #2563eb; background-color: #eff6ff; border: 1px solid #dbeafe; font-size: 13px; font-weight: bold; padding: 0.375rem 0.75rem; border-radius: 8px;" onclick="event.stopPropagation(); abrirModalNuevaInspeccion('${placa}')"><i class="bi bi-plus-lg" style="stroke-width: 2;"></i> Registrar</button>`;
                    }
                } else {
                    btnRegistrar = `<button class="btn btn-sm d-flex align-items-center gap-1 shadow-sm" style="color: #059669; background-color: #d1fae5; border: 1px solid #a7f3d0; font-size: 13px; font-weight: bold; padding: 0.375rem 0.75rem; border-radius: 8px;" onclick="event.stopPropagation(); verDetalleInspeccion('${insp.id}', false)"><i class="bi bi-eye"></i> Ver</button>`;
                }

                let daysOverdueHTML = '';
                if (diasRestantes < 0 && diasRestantes !== -9999) {
                    daysOverdueHTML = `<span style="font-size: 10px; font-weight: bold; background-color: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 9999px; border: 1px solid #fecaca; display: flex; align-items: center; gap: 4px;"><i class="bi bi-exclamation-circle-fill"></i> NO VIGENTE (-${Math.abs(diasRestantes)}d)</span>`;
                } else if (diasRestantes >= 0 && diasRestantes !== -9999) {
                    daysOverdueHTML = `<span style="font-size: 10px; font-weight: bold; background-color: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 9999px; border: 1px solid #bbf7d0; display: flex; align-items: center; gap: 4px;"><i class="bi bi-check-circle-fill"></i> VIGENTE (${diasRestantes}d)</span>`;
                }

                html += `<tr class="child-st-${classTipo} clickable-row data-row-status child-row-status" style="display:none;" data-cliente="${cli}" data-marca="${mar}" data-estado-v2="${estadoVigente2}" data-motor="${motora}" data-dias="${diasRestantes}" onclick="seleccionarFilaInspeccion(event, this)">
              <td class="d-none d-md-table-cell fw-bold text-primary" data-value="${placa}">${checkHtml}${placa} ${subCli}</td><td class="d-none" data-value="${cli}">${cli}</td><td class="d-none d-md-table-cell">${mod}</td>
              <td class="d-none d-md-table-cell text-truncate" style="max-width: 100px;">${tecnico}</td><td class="d-none d-md-table-cell">${fIngresoBonita}</td><td class="d-none d-md-table-cell" data-value="${diasRestantes}">${badgeProx}</td>
              <td class="d-none d-md-table-cell" data-value="${txtEstado}">${badgeEst}</td><td class="d-none" data-value="${estadoVigente2}">${estadoVigente2}</td>
              <td class="d-none d-md-table-cell">${ubicacionHtml}</td><td class="d-none d-md-table-cell">${menuAcciones}</td>
              <td class="d-block d-md-none p-0 border-0 bg-white">
                  ${isHistorialStatus ? `
                  <div class="p-3 border-bottom d-flex flex-column gap-2" style="background-color: #f8fafc; cursor: pointer;" onclick="verDetalleInspeccion('${insp.id}', false)">
                      <div class="d-flex justify-content-between align-items-center w-100">
                          <div class="d-flex align-items-center gap-2">
                              <span class="bg-white border text-dark font-monospace fw-bold shadow-sm" style="font-size: 14px; letter-spacing: 2px; padding: 2px 10px; border-radius: 6px; border-color: #e5e7eb;">${placa}</span>
                              <span style="font-size: 9px; font-weight: bold; background-color: ${diasRestantes < 0 && diasRestantes !== -9999 ? '#fee2e2' : '#d1fae5'}; color: ${diasRestantes < 0 && diasRestantes !== -9999 ? '#b91c1c' : '#047857'}; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">${txtEstado}</span>
                          </div>
                          <span style="font-size: 11px; font-weight: bold; background-color: #10b981; color: white; padding: 4px 10px; border-radius: 6px;">
                              ${diasRestantes === -9999 ? 'Sin Registro' : (diasRestantes < 0 ? `Vencido hace ${Math.abs(diasRestantes)}d` : `Faltan ${diasRestantes} días`)}
                          </span>
                      </div>
                      <div class="d-flex align-items-center gap-3 w-100 mt-1" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 12px;">
                          <div class="d-flex align-items-center gap-1" style="color: #64748b; font-size: 12px; font-weight: 600;">
                              <i class="bi bi-person text-secondary"></i> <span class="text-truncate" style="max-width:100px;">${tecnico}</span>
                          </div>
                          <span style="color: #cbd5e1;">•</span>
                          <div class="d-flex align-items-center gap-1" style="color: #64748b; font-size: 12px; font-weight: 600;">
                              <i class="bi bi-calendar text-secondary"></i> ${fIngresoBonita}
                          </div>
                      </div>
                      <div class="d-flex justify-content-between align-items-end w-100 mt-1">
                          <div class="d-flex flex-column gap-1" style="font-size: 13px; color: #64748b; font-weight: 500;">
                              <span class="text-dark">${cli} <span class="mx-1" style="color: #cbd5e1;">•</span> ${mod}</span>
                          </div>
                          <div class="d-flex align-items-center gap-1 bg-light border px-2 py-1 rounded-pill shadow-sm" style="font-size: 11px; color: #475569; font-weight: 600;">
                              <i class="bi bi-geo-alt text-primary"></i> ${txtKmReact}
                          </div>
                      </div>
                  </div>
                  ` : `
                  <div class="p-3 border-bottom d-flex flex-column gap-2" style="background-color: #f8fafc;">
                      <div class="d-flex justify-content-between align-items-start w-100">
                          <div class="d-flex align-items-center gap-2 flex-wrap">
                              <span class="bg-white border text-dark font-monospace fw-bold shadow-sm" style="font-size: 14px; letter-spacing: 2px; padding: 2px 10px; border-radius: 6px; border-color: #e5e7eb;">${placa}</span>
                              ${daysOverdueHTML}
                          </div>
                          ${btnRegistrar}
                      </div>
                      <div class="d-flex justify-content-between align-items-end w-100 mt-1">
                          <div class="d-flex flex-column gap-1" style="font-size: 13px; color: #64748b; font-weight: 500;">
                              <span class="text-dark">${cli} <span class="mx-1" style="color: #cbd5e1;">•</span> ${mod}</span>
                              <div class="d-flex align-items-center gap-1">
                                  <i class="bi bi-geo-alt text-primary" style="font-size: 13px;"></i>
                                  ${txtKmReact}
                              </div>
                          </div>
                          <span style="font-size: 10px; font-weight: bold; text-transform: uppercase; padding: 2px 8px; border-radius: 6px; ${diasRestantes === -9999 ? 'background-color: #e2e8f0; color: #475569;' : 'background-color: #d1fae5; color: #047857;'}">
                              ${txtBadgeReact}
                          </span>
                      </div>
                  </div>
                  `}
              </td></tr>`;
            });
        });
        rellenarFiltroCheck('filtroStatusCliente', setClis, 'filtrarStatusAvanzado'); rellenarFiltroCheck('filtroStatusMarca', setMarcas, 'filtrarStatusAvanzado'); rellenarFiltroCheck('filtroStatusEstado', setEstadosStatus, 'filtrarStatusAvanzado');
    }
    const _tablaBody = document.getElementById('cuerpoTablaStatus');
    if (!_tablaBody) return;
    _tablaBody.innerHTML = html;
    filtrarStatusAvanzado();
    _renderInspPaginacion(window.dataFinalInspGlobal.length);
    // Aplicar filtro pendiente desde navegación (ej: click en card del dashboard)
    if (window._pendingInspFilter) {
        var _pf = window._pendingInspFilter;
        window._pendingInspFilter = null;
        var _chks = document.querySelectorAll('#filtroStatusEstado input[type="checkbox"]');
        if (_chks.length > 0) {
            _chks.forEach(function (c) { c.checked = (c.value === _pf); });
            filtrarStatusAvanzado();
            // Mostrar badge visual de filtro activo
            var _buscador = document.getElementById('buscadorStatus');
            if (_buscador) _buscador.placeholder = 'Filtrado: ' + _pf;
        }
    }
    if (typeof window.initColPicker === 'function') {
        window.initColPicker('col-picker-insp', 'tablaStatus', [
            { label: 'Tipo', idx: 2, visible: true },
            { label: 'Técnico', idx: 3, visible: true },
            { label: 'Fecha Insp.', idx: 4, visible: true },
            { label: 'Prox. Insp.', idx: 5, visible: true },
            { label: 'GPS', idx: 8, visible: true }
        ], 'fleet_cols_insp');
    }
}

function _renderInspPaginacion(total) {
    var info = document.getElementById('insp-info-paginacion');
    var ctrls = document.getElementById('insp-controles-paginacion');
    var sel = document.getElementById('sel-insp-ppp');
    var row = document.getElementById('insp-paginacion-row');
    if (!info || !ctrls) return;
    if (sel) sel.value = String(window.inspPorPagina || 50);
    var ppp = window.inspPorPagina;
    var totalPag = ppp > 0 ? Math.ceil(total / ppp) : 1;
    var pag = window.inspPaginaActual;
    var ini = ppp > 0 ? (pag - 1) * ppp + 1 : 1;
    var fin = ppp > 0 ? Math.min(pag * ppp, total) : total;
    info.textContent = total === 0 ? 'Sin resultados' : 'Mostrando ' + ini + '–' + fin + ' de ' + total;
    if (row) row.style.display = totalPag <= 1 ? 'none' : '';
    var btns = '';
    btns += '<button class="btn-pag-nav" onclick="cambiarPaginaInsp(-1)" ' + (pag <= 1 ? 'disabled' : '') + '><i class="bi bi-chevron-left"></i></button>';
    for (var i = 1; i <= totalPag; i++) {
        if (totalPag > 7 && Math.abs(i - pag) > 2 && i !== 1 && i !== totalPag) {
            if (i === 2 || i === totalPag - 1) { btns += '<span class="btn-pag-nav" style="pointer-events:none">…</span>'; }
            continue;
        }
        btns += '<button class="btn-pag-nav' + (i === pag ? ' active' : '') + '" onclick="cambiarPaginaInsp(' + i + ', true)">' + i + '</button>';
    }
    btns += '<button class="btn-pag-nav" onclick="cambiarPaginaInsp(1)" ' + (pag >= totalPag ? 'disabled' : '') + '><i class="bi bi-chevron-right"></i></button>';
    ctrls.innerHTML = btns;
}

window.cambiarPaginaInsp = function (val, absoluto) {
    var ppp = window.inspPorPagina;
    var total = window.dataFinalInspGlobal.length;
    var totalPag = ppp > 0 ? Math.ceil(total / ppp) : 1;
    window.inspPaginaActual = absoluto ? val : Math.max(1, Math.min(window.inspPaginaActual + val, totalPag));
    mostrarStatusInspecciones(dataGlobalInspecciones);
};

window.cambiarInspPorPagina = function (val) {
    window.inspPorPagina = parseInt(val) || 0;
    localStorage.setItem('fleet_insp_ppp', window.inspPorPagina);
    window.inspPaginaActual = 1;
    mostrarStatusInspecciones(dataGlobalInspecciones);
};

function filtrarStatusAvanzado() {
    const txt = document.getElementById('buscadorStatus')?.value.toLowerCase() || '';
    const chkCli = Array.from(document.querySelectorAll('#filtroStatusCliente input:checked')).map(e => e.value);
    const chkMar = Array.from(document.querySelectorAll('#filtroStatusMarca input:checked')).map(e => e.value);
    const chkEst = Array.from(document.querySelectorAll('#filtroStatusEstado input:checked')).map(e => e.value);
    let isFiltering = txt !== '' || chkCli.length > 0 || chkMar.length > 0 || chkEst.length > 0;

    let cntTotalVig = 0, cntTotalNoVig = 0;
    let cntMotVig = 0, cntMotNoVig = 0;
    let cntNoMotVig = 0, cntNoMotNoVig = 0;

    const headers = document.querySelectorAll('#cuerpoTablaStatus tr.group-header');
    headers.forEach(header => {
        let matchIcon = header.querySelector('i').className.match(/toggle-icon-(\w+)/);
        if (!matchIcon) return;
        let classTipo = matchIcon[1];
        let childRows = document.querySelectorAll(`.child-st-${classTipo}`);
        let visibleCount = 0;

        childRows.forEach(row => {
            let cli = row.getAttribute('data-cliente');
            let mar = row.getAttribute('data-marca');
            let est = row.getAttribute('data-estado-v2');
            let textoFila = row.textContent.toLowerCase();

            let matchCli = (!chkCli.length || chkCli.includes(cli));
            let matchMar = (!chkMar.length || chkMar.includes(mar));
            let matchEst = (!chkEst.length || chkEst.includes(est));
            let matchTxt = (!txt || textoFila.includes(txt));

            if (matchCli && matchMar && matchEst && matchTxt) {
                visibleCount++;
                row.style.display = (isFiltering || expandStatusMap[classTipo]) ? '' : 'none';

                if (!isHistorialStatus) {
                    let dias = parseInt(row.getAttribute('data-dias'));
                    let mot = row.getAttribute('data-motor') || '';
                    let esMotora = mot.toUpperCase().trim() === 'MOTORA';

                    if (dias >= 0) {
                        cntTotalVig++;
                        if (esMotora) cntMotVig++; else cntNoMotVig++;
                    } else {
                        cntTotalNoVig++;
                        if (esMotora) cntMotNoVig++; else cntNoMotNoVig++;
                    }
                }
            } else {
                row.style.display = 'none';
            }
        });

        let icon = header.querySelector('i'); let spanConteo = header.querySelector(`.span-conteo-${classTipo}`);
        if (visibleCount > 0) {
            header.style.display = '';
            if (spanConteo) spanConteo.innerText = visibleCount + " Unidades";
            if (icon) icon.className = (isFiltering || expandStatusMap[classTipo]) ? `bi bi-chevron-down ms-1 me-2 text-warning toggle-icon-${classTipo}` : `bi bi-chevron-right ms-1 me-2 text-warning toggle-icon-${classTipo}`;
        } else {
            header.style.display = 'none';
        }
    });

    if (!isHistorialStatus) {
        updateGraficosEnVivo(cntTotalVig, cntTotalNoVig, cntMotVig, cntMotNoVig, cntNoMotVig, cntNoMotNoVig);
    }
}

function verDetalleInspeccion(idBusqueda, autoDescargarPDF) {
    let insp = dataGlobalInspecciones.find(i => i.id === idBusqueda);
    if (!insp) return;

    let fIng = parseDateToDDMMYYYY(insp.fecha_ingreso);
    let htmlFallas = ""; let countFallas = 0;

    let htmlEvidenciasPDF = ""; let contEvidencias = 1;

    try {
        let detallesArray = [];
        if (typeof insp.detalles_json === 'string') {
            try { detallesArray = JSON.parse(insp.detalles_json); } catch (e) { }
        } else if (Array.isArray(insp.detalles_json)) {
            detallesArray = insp.detalles_json;
        }

        if (detallesArray && detallesArray.length > 0) {
            detallesArray.forEach(d => {
                if (d.estado === "SIN DATOS" || d.estado === "") return;

                let colorTxt = ""; let icon = ""; let pdfClass = "";
                if (d.estado === "FALLA") {
                    colorTxt = "color: #dc2626; font-weight: bold;"; icon = "❌"; countFallas++;
                    pdfClass = "text-danger-pdf";
                } else if (d.estado === "OK") {
                    colorTxt = "color: #16a34a; font-weight: bold;"; icon = "✅";
                    pdfClass = "text-success-pdf";
                } else {
                    colorTxt = "color: #0ea5e9; font-weight: bold;"; icon = "ℹ️";
                    pdfClass = "text-info-pdf";
                }

                let extraFotoBtn = "";
                if (d.foto && d.foto.length > 100) {
                    let nombreFallaSeguro = d.item.replace(/'/g, "\\'");
                    extraFotoBtn = `<br><button class="btn btn-sm btn-secondary mt-1 py-0 px-2 shadow-sm" onclick="verFotoEvidencia('${d.foto}', 'Evidencia ${contEvidencias}: ${nombreFallaSeguro}')"><i class="bi bi-camera"></i> Ver Evidencia ${contEvidencias}</button>`;
                    htmlEvidenciasPDF += `
                        <div class="pdf-evidencia-card">
                            <h5>Evidencia ${contEvidencias}: ${d.item}</h5>
                            <img src="${d.foto}">
                            ${d.observacion ? `<p>${d.observacion}</p>` : ''}
                        </div>
                    `;
                    contEvidencias++;
                }

                htmlFallas += `<div class="pdf-falla-item"><strong>${d.categoria.replace(/^\d+\.\s*/, '')} - ${d.item}:</strong> <span class="${pdfClass}" style="${colorTxt}">${icon} ${d.estado}</span>${d.observacion ? `<span class="pdf-falla-obs">Obs: ${d.observacion}</span>` : ''}${extraFotoBtn}</div>`;
            });
        }
    } catch (e) { htmlFallas = "<p class='text-danger'>Error al leer los detalles históricos.</p>"; }

    if (htmlFallas === "") htmlFallas = "<p class='text-center text-muted mt-3'>No hay fallas ni diagnósticos registrados en este reporte.</p>";

    let htmlModal = `
    <div class="col-md-6"><div class="insp-detail-card shadow-sm"><div class="insp-detail-title"><i class="bi bi-card-checklist text-primary"></i> REGISTRO GENERAL</div><div class="insp-row"><span style="color:var(--text)">Fecha de Inspección</span><span style="color:var(--text)">${fIng}</span></div><div class="insp-row"><span style="color:var(--text)">Placa</span><span class="text-primary fw-bold">${insp.placa}</span></div><div class="insp-row"><span style="color:var(--text)">Kilometraje</span><span style="color:var(--text)">${insp.km_tablero || '-'}</span></div><div class="insp-row"><span style="color:var(--text)">Fallas Detectadas</span><span class="text-danger fw-bold">${countFallas}</span></div></div></div>
    <div class="col-md-6"><div class="insp-detail-card shadow-sm"><div class="insp-detail-title"><i class="bi bi-person-badge text-primary"></i> FIRMA Y RESPONSABLE</div><div class="insp-row"><span style="color:var(--text)">Técnico Inspector</span><span style="color:var(--text)">${insp.tecnico || '-'}</span></div>
    <div class="text-center mt-3 p-2 border rounded bg-white" id="firma-visual-modal"><span class="text-muted"><span class="spinner-border spinner-border-sm"></span> Verificando firma...</span></div></div></div>
    <div class="col-12"><div class="card p-3 shadow-sm"><h6 class="fw-bold text-primary border-bottom pb-2">DIAGNÓSTICO</h6><div style="max-height: 300px; overflow-y:auto; font-size: 0.9rem; color:var(--text);">${htmlFallas}</div></div></div>`;

    // GENERAR CHECKLIST PARA PDF
    let htmlChecklist = "";
    const romanos = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
    let detallesArrayParaPDF = [];
    try { detallesArrayParaPDF = typeof insp.detalles_json === 'string' ? JSON.parse(insp.detalles_json) : (insp.detalles_json || []); } catch(e){}

    if (window.DYNAMIC_INSP_SCHEMA && window.DYNAMIC_INSP_SCHEMA.length > 0) {
        window.DYNAMIC_INSP_SCHEMA.forEach((sec, idxCat) => {
            htmlChecklist += `<tr class="sec-row"><td colspan="4">${romanos[idxCat] || (idxCat+1)}. ${sec.tab.toUpperCase()}</td></tr>`;
            if (sec.items) {
                sec.items.forEach((item, idxItem) => {
                    let lbl = typeof item === 'string' ? item : item.label;
                    let match = detallesArrayParaPDF.find(d => d.item && normalizeStr(d.item) === normalizeStr(lbl));
                    
                    let sqOk = "";
                    let sqMal = "";
                    let obs = "";

                    if (match && match.estado) {
                        if (match.estado === "OK") sqOk = "sq-green";
                        if (match.estado === "FALLA") sqMal = "sq-red";
                        obs = match.observacion || "";
                    }

                    htmlChecklist += `<tr>
                        <td>${idxItem + 1}. ${lbl}</td>
                        <td class="w-chk"><div class="sq ${sqOk}"></div></td>
                        <td class="w-chk"><div class="sq ${sqMal}"></div></td>
                        <td class="w-obs" style="font-size: 8px;">${obs}</td>
                    </tr>`;
                });
            }
        });
    }

    let rId = document.getElementById('pdf-insp-reporte');
    if (rId) rId.innerText = insp.id || '';
    
    let rPlaca = document.getElementById('pdf-insp-placa');
    if (rPlaca) rPlaca.innerText = insp.placa || '';
    
    let rRampa = document.getElementById('pdf-insp-rampa');
    if (rRampa) rRampa.innerText = ''; // Dejar en blanco

    let rFecha = document.getElementById('pdf-insp-fecha');
    if (rFecha) rFecha.innerText = fIng || '';

    let rKm = document.getElementById('pdf-insp-km');
    if (rKm) rKm.innerText = insp.km_tablero || '-';

    let lblTecnicoFirma = document.getElementById('pdf-insp-tecnico-firma');
    if (lblTecnicoFirma) lblTecnicoFirma.innerText = insp.tecnico || '';

    let checklistBody = document.getElementById('pdf-insp-checklist-body');
    if (checklistBody) checklistBody.innerHTML = htmlChecklist;

    let ctnEvidencias = document.getElementById('pdf-insp-evidencias-container');
    if (ctnEvidencias) {
        if (htmlEvidenciasPDF !== "") {
            document.getElementById('pdf-insp-evidencias').innerHTML = htmlEvidenciasPDF;
            ctnEvidencias.style.display = 'block';
        } else {
            ctnEvidencias.style.display = 'none';
        }
    }

    let btnIrOtContainer = document.getElementById('btn-ir-ot-container');
    if (btnIrOtContainer) {
        if (insp.id_ot) {
            btnIrOtContainer.innerHTML = `<button type="button" class="btn btn-outline-info btn-sm fw-bold" onclick="bootstrap.Modal.getInstance(document.getElementById('modalResumenInspeccion')).hide(); window.rotAbrirDetalle('${insp.id_ot}')"><i class="bi bi-box-arrow-up-right"></i> Ir a OT</button>`;
        } else {
            btnIrOtContainer.innerHTML = '';
        }
    }
    document.getElementById('contenedor-resumen-insp').innerHTML = htmlModal;
    new bootstrap.Modal(document.getElementById('modalResumenInspeccion')).show();

    let firmaImgPDF = document.getElementById('pdf-insp-firma');
    if (insp.url_firma && insp.url_firma.length > 100) {
        firmaImgPDF.src = insp.url_firma;
        firmaImgPDF.style.display = 'inline-block';
        document.getElementById('firma-visual-modal').innerHTML = `<img src="${insp.url_firma}" style="max-height: 100px; max-width:100%;">`;
        if (autoDescargarPDF) setTimeout(generarPDFInspeccion, 500);
    } else {
        firmaImgPDF.style.display = 'none'; document.getElementById('firma-visual-modal').innerHTML = '<span class="text-muted">Sin firma registrada</span>';
        if (autoDescargarPDF) setTimeout(generarPDFInspeccion, 500);
    }
}

function generarPDFInspeccion() {
    const btnElement = event.currentTarget || document.querySelector('#modalResumenInspeccion .btn-outline-danger');
    let textoOriginal = "Exportar PDF";
    if (btnElement) { textoOriginal = btnElement.innerHTML; btnElement.innerHTML = '<i class="bi bi-hourglass-split"></i> Creando...'; btnElement.classList.add('disabled'); }

    const elemento = document.getElementById('pdf-inspeccion');
    document.getElementById('contenedor-pdf-inspeccion').style.display = 'block';

    html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: `Inspeccion_${document.getElementById('pdf-insp-placa').innerText}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(elemento).save().then(() => {
        document.getElementById('contenedor-pdf-inspeccion').style.display = 'none';
        if (btnElement) { btnElement.innerHTML = textoOriginal; btnElement.classList.remove('disabled'); }
    });
}

// ==========================================
// 🔥 GUARDADO DEL WIZARD DE INSPECCIONES 🔥
// ==========================================

async function procesarGuardadoInspeccion() {
    var isNew = !document.getElementById('i_id_inspeccion').value;
    if (!window.guardAction('insp', isNew ? 'c' : 'e')) return;
    const btn = document.getElementById('btnWizGuardar');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando Evidencias...';

    let idInsp = document.getElementById('i_id_inspeccion').value;
    if (!idInsp) {
        let anioActual = new Date().getFullYear();
        let prefix = `Insp-${anioActual}-`;
        let max = 0;
        if (window.dataGlobalInspecciones) {
            window.dataGlobalInspecciones.forEach(i => {
                if (i.id && i.id.startsWith(prefix)) {
                    let num = parseInt(i.id.split('-')[2]);
                    if (!isNaN(num) && num > max) max = num;
                }
            });
        }
        idInsp = prefix + (max + 1).toString().padStart(4, '0');
    }
    let fecha = document.getElementById('i_fecha').value;
    let placa = document.getElementById('i_placa').value.toUpperCase();
    let km = document.getElementById('i_kmtablero').value;
    let cliente = document.getElementById('i_cliente').value;
    let tecnico = document.getElementById('i_tecnico').value;
    let dias = document.getElementById('i_dias').value || "30";

    if (!placa || !tecnico) {
        alert("⚠️ La Placa y el Técnico son obligatorios.");
        btn.disabled = false; btn.innerHTML = 'Guardar Registro';
        return;
    }

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    let detalles = [];

    for (let i = 0; i < window.DYNAMIC_INSP_SCHEMA.length; i++) {
        let sec = window.DYNAMIC_INSP_SCHEMA[i];
        if (sec.items) {
            for (let j = 0; j < sec.items.length; j++) {
                let item = sec.items[j];
                let lbl = typeof item === 'string' ? item : item.label;
                let t = typeof item === 'string' ? 'okfalla' : item.type;
                let uid = `p_${i}_${j}`;
                let estado = "SIN DATOS", obs = "", fotoEvidencia = "";

                if (t === 'okfalla') {
                    let ok = document.getElementById(`${uid}_ok`);
                    let fa = document.getElementById(`${uid}_fa`);
                    if (ok && ok.dataset.chk === '1') estado = "OK";
                    if (fa && fa.dataset.chk === '1') {
                        estado = "FALLA";
                        let obsEl = document.getElementById(`obs_${uid}`);
                        if (obsEl) obs = obsEl.value;
                        let inputFoto = document.getElementById(`foto_${uid}`);
                        if (inputFoto && inputFoto.files && inputFoto.files.length > 0) {
                            try {
                                let file = inputFoto.files[0];
                                let tempId = 'Insp_' + Date.now();
                                let resUpload = await fetch('/api/mantenimiento/inspecciones/upload-url', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ idInsp: tempId, fileName: file.name, fileType: file.type })
                                }).then(r => r.json());
                                
                                if (resUpload.ok && resUpload.uploadUrl) {
                                    await fetch(resUpload.uploadUrl, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': file.type },
                                        body: file
                                    });
                                    fotoEvidencia = resUpload.finalUrl;
                                } else {
                                    fotoEvidencia = await fileToBase64(file); // fallback
                                }
                            } catch (e) { 
                                console.log("Error subiendo foto a S3, usando fallback", e);
                                fotoEvidencia = await fileToBase64(inputFoto.files[0]);
                            }
                        }
                    }
                } else if (t === 'percent') {
                    let val = document.getElementById(`val_${uid}`);
                    if (val && val.value) estado = val.value + "%";
                } else if (t === 'text') {
                    let txt = document.getElementById(`txt_${uid}`);
                    if (txt && txt.value) { estado = "REGISTRADO"; obs = txt.value; }
                }
                detalles.push({ categoria: sec.tab, item: lbl, estado: estado, observacion: obs, foto: fotoEvidencia });
            }
        }
    }

    let firmaData = (canvasFirma && ctxFirma) ? canvasFirma.toDataURL("image/png") : "";
    let idOt = "";
    let iIdOt = document.getElementById('i_id_ot');
    if (iIdOt) idOt = iIdOt.value;

    let datos = {
        form: {
            id: idInsp, id_ot: idOt, fecha_ingreso: fecha, placa: placa, km_tablero: km, cliente: cliente, tecnico: tecnico, dias_propuestos: dias,
            detalles_json: JSON.stringify(detalles), firma_base64: firmaData, usuarioAutor: usuarioLogueado
        }
    };

    fetch('/api/script/guardarInspeccion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
    })
        .then(res => res.json())
        .then(r => {
            if (r.data === 'Éxito') {
                bootstrap.Offcanvas.getInstance(document.getElementById('drawerInspeccion')).hide();
                recargarModulo('statusMant');
            } else { alert("Error: " + r.data); }
            btn.disabled = false; btn.innerHTML = 'Guardar Registro';
        }).catch(e => { alert("Error de red: " + e.message); btn.disabled = false; btn.innerHTML = 'Guardar Registro'; });
}

// ============================================================
// 🚀 AUTOCOMPLETAR INFO EN INSPECCIONES
// ============================================================
window.autocompletarInfoInsp = function () {
    let placaInput = normalizeStr(document.getElementById('i_placa').value);
    let match = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placaInput);

    if (match) {
        document.getElementById('i_cliente').value = match[1] || "";
        document.getElementById('i_modelo').value = match[5] || "";
    } else {
        document.getElementById('i_cliente').value = "";
        document.getElementById('i_modelo').value = "";
    }

    let wialonData = buscarWialonPorPlaca(placaInput);
    if (wialonData) {
        document.getElementById('i_kmgps').value = wialonData.km;
    } else {
        document.getElementById('i_kmgps').value = '';
    }
};

// ============================================================
// 🚀 RENDERIZADO MODERNO Y APERTURA DE MODALES
// ============================================================

window.renderModernInspForm = function() {
    let html = '<input type="hidden" id="i_id_inspeccion" value="">'
             + '<input type="hidden" id="i_id_ot" value="">';
    
    // Tarjeta 1: Registro Fijo
    html += `<div class="card shadow-sm border-0 mb-3" style="border-radius:12px;">
        <div class="card-header bg-white border-bottom-0 pb-0 pt-3">
            <h6 class="fw-bold text-primary m-0"><i class="bi bi-card-heading me-1"></i> 1. DATOS DE REGISTRO</h6>
        </div>
        <div class="card-body">
            <div class="row g-3">
                <div class="col-12">
                    <label class="fw-bold text-primary" style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;">Fecha de Ingreso</label>
                    <input type="date" class="form-control fw-bold shadow-sm text-primary" id="i_fecha" required style="border-radius:12px;min-height:44px;border:1.5px solid var(--border);">
                </div>
                <div class="col-12">
                    <label class="fw-bold text-primary" style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;">
                        <i class="bi bi-truck"></i> Placa *
                    </label>
                    <div class="position-relative">
                        <input type="text" id="i_placa-txt" class="form-control fw-bold shadow-sm text-primary"
                               placeholder="Buscar placa..." autocomplete="off" required
                               style="border-radius:12px;min-height:44px;border:1.5px solid var(--border);text-transform:uppercase;"
                               oninput="this.value=this.value.toUpperCase();window._cbFiltrar('i_placa')"
                               onfocus="window._cbFiltrar('i_placa')"
                               onblur="window._cbHide('i_placa')">
                        <input type="hidden" id="i_placa" name="i_placa">
                        <div id="i_placa-dd" class="cb-dropdown"></div>
                    </div>
                </div>
                <div class="col-12">
                    <label class="fw-bold text-primary" style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;">Kilometraje de Tablero</label>
                    <input type="number" class="form-control fw-bold shadow-sm text-primary" id="i_kmtablero" placeholder="Ej: 150000" style="border-radius:12px;min-height:44px;border:1.5px solid var(--border);">
                </div>
                <div class="col-12">
                    <label class="fw-bold text-primary" style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;">Cliente</label>
                    <input type="text" class="form-control fw-bold shadow-sm text-primary bg-light" id="i_cliente" readonly style="border-radius:12px;min-height:44px;border:1.5px solid var(--border);">
                </div>
                <div class="col-12">
                    <label class="fw-bold text-primary" style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;">Tipo</label>
                    <input type="text" class="form-control fw-bold shadow-sm text-primary bg-light text-uppercase" id="i_modelo" readonly style="border-radius:12px;min-height:44px;border:1.5px solid var(--border);">
                </div>
                <div class="col-12">
                    <label class="fw-bold text-primary" style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;"><i class="bi bi-geo-alt-fill"></i> GPS</label>
                    <input type="number" class="form-control text-primary bg-light fw-bold shadow-sm" id="i_kmgps" readonly placeholder="Calculando..." style="border-radius:12px;min-height:44px;border:1.5px solid var(--border);">
                </div>
            </div>
        </div>
    </div>`;

    // Tarjetas Dinámicas de Categorías
    window.DYNAMIC_INSP_SCHEMA.forEach((sec, i) => {
        html += `<div class="card shadow-sm border-0 mb-3" style="border-radius:12px;">
            <div class="card-header bg-white border-bottom-0 pb-0 pt-3">
                <h6 class="fw-bold text-primary m-0"><i class="bi bi-list-check me-1"></i> ${i+2}. ${sec.tab}</h6>
            </div>
            <div class="card-body">`;
            
        sec.items.forEach((item, j) => {
            let lbl = typeof item === 'string' ? item : item.label; 
            let t = typeof item === 'string' ? 'okfalla' : item.type; 
            let uid = `p_${i}_${j}`;
            
            html += `<div class="mb-4 border-bottom pb-3 last-border-0">
                <label class="fw-bold text-dark d-block mb-2" style="font-size:0.9rem;">${lbl}</label>`;

            if (t === 'okfalla') {
                html += `<div class="d-flex gap-2 w-100">
                    <input type="radio" class="btn-check" name="${uid}" id="${uid}_ok" value="OK" onclick="toggleRadioOkFalla(this, 'f_${uid}', false)">
                    <label class="btn btn-outline-success fw-bold flex-grow-1" for="${uid}_ok" style="border-radius:8px;">OK</label>
                    <input type="radio" class="btn-check" name="${uid}" id="${uid}_fa" value="FALLA" onclick="toggleRadioOkFalla(this, 'f_${uid}', true)">
                    <label class="btn btn-outline-danger fw-bold flex-grow-1" for="${uid}_fa" style="border-radius:8px;">FALLA</label>
                </div>
                <div id="f_${uid}" style="display:none;" class="mt-2 p-3 bg-light rounded border-start border-danger border-4 shadow-sm">
                    <label class="form-label text-danger fw-bold" style="font-size:0.8rem;"><i class="bi bi-pencil-square"></i> Observación</label>
                    <textarea class="form-control mb-2 border-danger" rows="2" id="obs_${uid}" placeholder="Describe la falla..."></textarea>
                    <label class="form-label text-danger fw-bold mt-2" style="font-size:0.8rem;"><i class="bi bi-camera"></i> Evidencia (Opcional)</label>
                    <input type="file" class="form-control border-danger form-control-sm" id="foto_${uid}" accept="image/*">
                </div>`;
            } else if (t === 'percent') {
                html += `<input type="hidden" id="val_${uid}" value="">
                <div class="d-flex flex-wrap gap-1">`;
                [10,20,30,40,50,60,70,80,90,100].forEach(pct => { 
                    html += `<button type="button" class="btn btn-outline-primary btn-sm fw-bold pct-btn pct-${uid} flex-grow-1 shadow-sm" style="border-radius:6px; min-width:40px;" onclick="seleccionarPorcentaje('${uid}', ${pct}, this)">${pct}%</button>`; 
                });
                html += `</div>`;
            } else if (t === 'text') {
                html += `<textarea class="form-control border-primary shadow-sm" rows="2" id="txt_${uid}" placeholder="Ingresa el detalle..." style="border-radius:8px;"></textarea>`;
            }
            html += `</div>`;
        });
        html += `</div></div>`;
    });

    // Tarjeta Final: Firma
    html += `<div class="card shadow-sm border-0 mb-3" style="border-radius:12px;">
        <div class="card-header bg-white border-bottom-0 pb-0 pt-3">
            <h6 class="fw-bold text-primary m-0"><i class="bi bi-pen me-1"></i> ${window.DYNAMIC_INSP_SCHEMA.length + 2}. FIRMA</h6>
        </div>
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md-8 mb-3">
                    <label class="fw-bold text-primary" style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;">Técnico Inspector *</label>
                    <div class="position-relative">
                        <input type="text" id="i_tecnico-txt" class="form-control form-control-sm text-uppercase shadow-sm"
                               placeholder="Selecciona o escribe uno nuevo" autocomplete="off" required
                               style="border-radius:12px;min-height:44px;border:1.5px solid var(--border);"
                               oninput="this.value=this.value.toUpperCase();window._cbFiltrar('i_tecnico')"
                               onfocus="window._cbFiltrar('i_tecnico')"
                               onblur="window._cbHide('i_tecnico')">
                        <input type="hidden" id="i_tecnico" name="i_tecnico">
                        <div id="i_tecnico-dd" class="cb-dropdown"></div>
                    </div>
                </div>
                <div class="col-md-4 mb-3">
                    <label class="fw-bold text-primary" style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;">Días Propuestos</label>
                    <input type="number" class="form-control fw-bold shadow-sm" id="i_dias" value="30" style="border-radius:12px;min-height:44px;border:1.5px solid var(--border);">
                </div>
            </div>
            <div class="mb-2">
                <label class="fw-bold text-primary mb-2" style="font-size:0.8rem;"><i class="bi bi-pen"></i> Firma del Técnico</label>
                <canvas id="canvasFirma" class="firma-pad shadow-sm border rounded w-100" style="height: 150px; background:#f8fafc;"></canvas>
                <button type="button" class="btn btn-sm btn-outline-danger mt-2 w-100 fw-bold" onclick="limpiarFirma()"><i class="bi bi-eraser"></i> Borrar Firma</button>
            </div>
        </div>
    </div>`;

    document.getElementById('wizard-dynamic-tabs').innerHTML = html;
    
    // 🔥 INICIALIZAR LIBRERÍA DE BÚSQUEDA DESPUÉS DE RENDERIZAR 🔥
    let listPlacas = (window.dataGlobalPlacas || [])
        .map(function(p){ return (p[0]||'').trim().toUpperCase(); })
        .filter(function(p,i,a){ return p && p !== 'PLACA' && a.indexOf(p) === i; })
        .sort();
    window._cbInit('i_placa', listPlacas, 'BUSCAR PLACA...');
    window._cbOnSelect('i_placa', function(val) {
        document.getElementById('i_placa-txt').value = val;
        document.getElementById('i_placa').value = val;
        window.autocompletarInfoInsp();
    });
    
    let opcionesTecnicos = new Set();
    if (window.dataGlobalUsuarios) window.dataGlobalUsuarios.forEach(u => { if(u[1]) opcionesTecnicos.add(u[1]); });
    if (window.dataGlobalInspecciones) window.dataGlobalInspecciones.forEach(i => { if(i.tecnico) opcionesTecnicos.add(i.tecnico); });

    let cacheCond = (window.CACHE && window.CACHE.conductores) ? window.CACHE.conductores : window.dataGlobalConductores;
    
    if (cacheCond && cacheCond.length > 0) {
        cacheCond.forEach(c => { if(c.nombre) opcionesTecnicos.add(c.nombre); });
        window._cbInit('i_tecnico', Array.from(opcionesTecnicos).sort(), 'Buscar técnico...');
    } else {
        window._cbInit('i_tecnico', Array.from(opcionesTecnicos).sort(), 'Cargando directorio...');
        fetch('/api/conductores')
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                window.CACHE = window.CACHE || {};
                window.CACHE.conductores = data;
                window.dataGlobalConductores = data;
                data.forEach(c => { if(c.nombre) opcionesTecnicos.add(c.nombre); });
                window._cbInit('i_tecnico', Array.from(opcionesTecnicos).sort(), 'Buscar técnico...');
            })
            .catch(e => {
                window._cbInit('i_tecnico', Array.from(opcionesTecnicos).sort(), 'Buscar técnico...');
            });
    }
    window._cbOnSelect('i_tecnico', function(val) {
        document.getElementById('i_tecnico-txt').value = val;
        document.getElementById('i_tecnico').value = val;
    });

    // Permitir ingreso libre para técnico y placa
    let inputTec = document.getElementById('i_tecnico-txt');
    if (inputTec) inputTec.addEventListener('input', function() { document.getElementById('i_tecnico').value = this.value; });
    
    let inputPla = document.getElementById('i_placa-txt');
    if (inputPla) inputPla.addEventListener('input', function() { document.getElementById('i_placa').value = this.value; window.autocompletarInfoInsp(); });
    
    setTimeout(initFirma, 500);
};

window.abrirModalNuevaInspeccion = function (placaPreselect, idOtPreselect, kmPreselect) {
    window.renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');
    if (formEl) formEl.reset();
    
    let idInput = document.getElementById('i_id_inspeccion');
    if (idInput) idInput.value = "";

    let idOtInput = document.getElementById('i_id_ot');
    if (idOtInput) idOtInput.value = idOtPreselect || "";

    let tzOffset = (new Date()).getTimezoneOffset() * 60000;
    document.getElementById('i_fecha').value = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];

    document.querySelectorAll('[id^="f_p_"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.pct-btn').forEach(btn => {
        btn.classList.remove('btn-primary', 'text-white');
        btn.classList.add('btn-outline-primary');
    });
    document.querySelectorAll('[id^="val_p_"]').forEach(el => el.value = '');
    document.querySelectorAll('input[type="radio"]').forEach(r => r.dataset.chk = '0');

    if (kmPreselect) {
        let iKm = document.getElementById('i_kmtablero');
        if (iKm) iKm.value = kmPreselect;
    }

    if (placaPreselect) {
        setTimeout(() => {
            let iPlaca = document.getElementById('i_placa');
            if (iPlaca) {
                iPlaca.value = placaPreselect;
                let txt = document.getElementById('i_placa-txt');
                if(txt) txt.value = placaPreselect;
                autocompletarInfoInsp();
            }
        }, 50);
    }

    new bootstrap.Offcanvas(document.getElementById('drawerInspeccion')).show();
};

window.abrirModalEditarInspeccion = function (idBusqueda) {
    let insp = dataGlobalInspecciones.find(i => i.id === idBusqueda);
    if (!insp) return;

    window.renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');
    if(formEl) formEl.reset();
    
    let idInput = document.getElementById('i_id_inspeccion');
    if(idInput) idInput.value = insp.id;

    document.querySelectorAll('[id^="f_p_"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.pct-btn').forEach(btn => {
        btn.classList.remove('btn-primary', 'text-white');
        btn.classList.add('btn-outline-primary');
    });
    document.querySelectorAll('[id^="val_p_"]').forEach(el => el.value = '');
    document.querySelectorAll('input[type="radio"]').forEach(r => r.dataset.chk = '0');

    let fIngreso;
    if (insp.fecha_ingreso && insp.fecha_ingreso.includes('/')) {
        let p = insp.fecha_ingreso.split('/'); fIngreso = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    } else if (insp.fecha_ingreso) {
        fIngreso = insp.fecha_ingreso.split('T')[0];
    } else { fIngreso = ""; }

    document.getElementById('i_fecha').value = fIngreso;
    
    setTimeout(() => {
        document.getElementById('i_placa').value = insp.placa || "";
        let txtPla = document.getElementById('i_placa-txt');
        if(txtPla) txtPla.value = insp.placa || "";
    }, 50);
    document.getElementById('i_kmtablero').value = insp.km_tablero || "";
    document.getElementById('i_cliente').value = insp.cliente || "";
    document.getElementById('i_tecnico').value = insp.tecnico || "";
    document.getElementById('i_dias').value = insp.dias_propuestos || "30";

    autocompletarInfoInsp();

    let arr = [];
    try {
        arr = typeof insp.detalles_json === 'string' ? JSON.parse(insp.detalles_json) : insp.detalles_json;
    } catch (e) { }

    if (Array.isArray(arr)) {
        window.DYNAMIC_INSP_SCHEMA.forEach((sec, i) => {
            if (sec.items) {
                sec.items.forEach((item, j) => {
                    let lbl = typeof item === 'string' ? item : item.label;
                    let t = typeof item === 'string' ? 'okfalla' : item.type;
                    let uid = `p_${i}_${j}`;

                    let res = arr.find(x => x.item === lbl && x.categoria === sec.tab);

                    if (res && res.estado && res.estado !== "SIN DATOS" && res.estado !== "") {
                        if (t === 'okfalla') {
                            if (res.estado === 'OK') {
                                let rOk = document.getElementById(`${uid}_ok`);
                                if (rOk) { rOk.checked = true; rOk.dataset.chk = '1'; }
                            }
                            else if (res.estado === 'FALLA') {
                                let rFa = document.getElementById(`${uid}_fa`);
                                if (rFa) {
                                    rFa.checked = true; rFa.dataset.chk = '1';
                                    toggleFalla(`f_${uid}`, true);
                                    if (res.observacion) document.getElementById(`obs_${uid}`).value = res.observacion;
                                }
                            }
                        } else if (t === 'percent') {
                            let val = res.estado.replace('%', '');
                            let inpVal = document.getElementById(`val_${uid}`);
                            if (inpVal) inpVal.value = val;
                            document.querySelectorAll(`.pct-${uid}`).forEach(b => {
                                if (b.innerText === res.estado || b.innerText === val + '%') {
                                    b.classList.remove('btn-outline-primary');
                                    b.classList.add('btn-primary', 'text-white');
                                }
                            });
                        } else if (t === 'text') {
                            let txt = document.getElementById(`txt_${uid}`);
                            if (txt) {
                                txt.value = res.observacion || (res.estado !== 'REGISTRADO' ? res.estado : "");
                            }
                        }
                    }
                });
            }
        });
    }

    window.cambiarPestana(0);
    new bootstrap.Offcanvas(document.getElementById('drawerInspeccion')).show();
};

// ============================================================
// 🖱️ LÓGICA DE SELECCIÓN MASIVA PARA INSPECCIONES
// ============================================================

window.activarModoSeleccionStatusMant = function () {
    window.modoSeleccion = window.modoSeleccion || {};
    window.modoSeleccion['statusMant'] = !window.modoSeleccion['statusMant'];

    const btnActivar = document.getElementById('btn-activar-sel-statusMant');
    const btnAll = document.getElementById('btn-select-all-statusMant');
    const btnBulk = document.getElementById('btn-bulk-statusMant');

    if (window.modoSeleccion['statusMant']) {
        if (btnActivar) {
            btnActivar.innerHTML = '<i class="bi bi-x-circle"></i> <span>Cancelar Selección</span>';
            btnActivar.classList.replace('btn-outline-secondary', 'btn-outline-danger');
        }
        if (btnAll) { btnAll.classList.remove('d-none'); btnAll.innerHTML = '<i class="bi bi-check-square"></i> Seleccionar Todo'; btnAll.classList.replace('btn-primary', 'btn-outline-primary'); }
    } else {
        if (btnActivar) {
            btnActivar.innerHTML = '<i class="bi bi-ui-checks"></i> <span data-i18n="common.select">Seleccionar</span>';
            btnActivar.classList.replace('btn-outline-danger', 'btn-outline-secondary');
        }
        if (btnAll) { btnAll.classList.add('d-none'); }
        if (btnBulk) { btnBulk.classList.add('d-none'); }
        document.querySelectorAll('.chk-bulk-statusMant').forEach(c => c.checked = false);
        document.querySelectorAll('.child-row-status').forEach(c => c.classList.remove('row-selected'));
    }

    mostrarStatusInspecciones(dataGlobalInspecciones);
};

window.seleccionarFilaInspeccion = function (event, trElement) {
    if (window.modoSeleccion && window.modoSeleccion['statusMant']) {
        if (event.target.closest('.btn-icon-dropdown') || event.target.closest('.dropdown-menu') || event.target.closest('.badge')) return;

        const checkbox = trElement.querySelector('.chk-bulk-statusMant');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) trElement.classList.add('row-selected');
            else trElement.classList.remove('row-selected');
            toggleBulkBtn('statusMant');
        }
    }
};

window.seleccionarTodasLasStatusMant = function () {
    const btnAll = document.getElementById('btn-select-all-statusMant');
    const checkboxes = document.querySelectorAll('.chk-bulk-statusMant');

    const accionEsMarcar = btnAll.innerText.includes('Seleccionar Todo');

    checkboxes.forEach(chk => {
        chk.checked = accionEsMarcar;
        const row = chk.closest('.child-row-status');
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

    toggleBulkBtn('statusMant');
};

// Actualiza contador y visibilidad del botón trash
window.toggleBulkBtn = function (contexto) {
    var checkboxes = document.querySelectorAll('.chk-bulk-' + contexto);
    var checked = Array.from(checkboxes).filter(function (c) { return c.checked; }).length;
    var btn = document.getElementById('btn-bulk-' + contexto);
    var cnt = document.getElementById('cnt-bulk-' + contexto);
    if (cnt) cnt.textContent = checked;
    if (btn) {
        if (checked > 0) btn.classList.remove('d-none');
        else btn.classList.add('d-none');
    }
};

// Elimina los registros seleccionados
window.eliminarMasivo = function (coleccion, contexto) {
    var checkboxes = document.querySelectorAll('.chk-bulk-' + contexto + ':checked');
    var ids = Array.from(checkboxes).map(function (c) { return c.value; });
    if (!ids.length) return;
    if (!confirm('¿Eliminar ' + ids.length + ' registro(s) seleccionado(s)? Esta acción no se puede deshacer.')) return;

    fetch('/api/eliminarMasivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids, coleccion: coleccion })
    })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (r) {
            if (r.error) { alert('Error: ' + r.error); return; }
            alert('✅ ' + (r.afectados || ids.length) + ' registro(s) eliminado(s).');
            window.modoSeleccion = window.modoSeleccion || {};
            window.modoSeleccion[contexto] = true; // para que activar lo desactive
            window.activarModoSeleccionStatusMant();
            // Recargar datos
            if (typeof cargarModulosMant === 'function') cargarModulosMant();
            else {
                fetch('/api/script/obtenerDatosInspecciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
                    .then(function (r) { return r.json(); })
                    .then(function (r) {
                        dataGlobalInspecciones = r.data || [];
                        window.dataGlobalInspecciones = dataGlobalInspecciones;
                        mostrarStatusInspecciones(dataGlobalInspecciones);
                    });
            }
        })
        .catch(function (err) { alert('Error al eliminar: ' + err.message); });
};

// ============================================================
// 📥 IMPORTACIÓN / EXPORTACIÓN MASIVA DE INSPECCIONES
// ============================================================

function obtenerCabecerasDinamicas() {
    let headers = [];
    window.DYNAMIC_INSP_SCHEMA.forEach(sec => {
        if (sec.items) {
            sec.items.forEach(item => {
                headers.push(typeof item === 'string' ? item : item.label);
            });
        }
    });
    return headers;
}

window.descargarPlantillaInspecciones = function () {
    const baseHeaders = ['ID', 'FECHA INGRESO', 'PLACA', 'KM TABLERO', 'CLIENTE', 'TECNICO', 'DIAS PROPUESTOS'];
    const dynamicHeaders = obtenerCabecerasDinamicas();
    const allHeaders = [...baseHeaders, ...dynamicHeaders];

    let filaEjemplo = ['(Dejar vacío para nuevo)', '2024-05-20', 'ABC-123', '150000', 'EMPRESA SAC', 'JUAN PEREZ', '30'];
    dynamicHeaders.forEach(h => {
        filaEjemplo.push(h.includes('Porcentaje') || h.includes('%') ? '50%' : 'OK');
    });

    const ws = XLSX.utils.aoa_to_sheet([allHeaders, filaEjemplo]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Inspecciones");
    XLSX.writeFile(wb, "Plantilla_Importacion_Inspecciones.xlsx");
};

window.exportarExcelInspecciones = function () {
    if (!dataGlobalInspecciones || dataGlobalInspecciones.length === 0) {
        alert("No hay inspecciones cargadas para exportar.");
        return;
    }

    const baseHeaders = ['ID', 'FECHA INGRESO', 'PLACA', 'KM TABLERO', 'CLIENTE', 'TECNICO', 'DIAS PROPUESTOS'];
    const dynamicHeaders = obtenerCabecerasDinamicas();
    const ws_data = [[...baseHeaders, ...dynamicHeaders]];

    dataGlobalInspecciones.forEach(i => {
        if (i.estado === 'Eliminada') return;

        let row = [i.id || '', i.fecha_ingreso || '', i.placa || '', i.km_tablero || '', i.cliente || '', i.tecnico || '', i.dias_propuestos || ''];

        let detMap = {};
        try {
            let dArr = typeof i.detalles_json === 'string' ? JSON.parse(i.detalles_json) : i.detalles_json;
            if (Array.isArray(dArr)) dArr.forEach(d => detMap[d.item] = d);
        } catch (e) { }

        dynamicHeaders.forEach(h => {
            let d = detMap[h];
            if (d && d.estado && d.estado !== 'SIN DATOS') {
                row.push(d.observacion ? `${d.estado} | ${d.observacion}` : d.estado);
            } else {
                row.push('');
            }
        });

        ws_data.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Base_Inspecciones");
    XLSX.writeFile(wb, "Reporte_Inspecciones_Completas.xlsx");
};

window.importarExcelInspecciones = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false, dateNF: 'yyyy-mm-dd' });

        if (rawJson.length === 0) {
            alert("El archivo Excel está vacío o no tiene datos válidos.");
            return;
        }

        const confirmar = await (typeof window.confirmar === 'function'
            ? window.confirmar({ titulo: 'Importar Inspecciones', mensaje: `Se importarán o actualizarán <strong>${rawJson.length} inspecciones</strong>. ¿Continuar?`, textoConfirmar: 'Sí, importar' })
            : Promise.resolve(confirm(`Se importarán o actualizarán ${rawJson.length} inspecciones.\n¿Continuar?`)));
        if (!confirmar) { event.target.value = ''; return; }

        document.body.style.cursor = 'wait';

        let registrosProcesados = rawJson.map(r => {
            let detalles = [];

            window.DYNAMIC_INSP_SCHEMA.forEach(sec => {
                if (sec.items) {
                    sec.items.forEach(item => {
                        let lbl = typeof item === 'string' ? item : item.label;
                        let cellVal = r[lbl];

                        if (cellVal && String(cellVal).trim() !== '') {
                            let strVal = String(cellVal).trim();
                            let upperVal = strVal.toUpperCase();
                            let estadoF = "REGISTRADO", obsF = "";

                            if (upperVal.includes('OK')) {
                                estadoF = 'OK';
                                let idx = upperVal.indexOf('OK');
                                obsF = strVal.substring(idx + 2).replace(/^[\s|:-]+/, '').trim();
                            } else if (upperVal.includes('FALLA')) {
                                estadoF = 'FALLA';
                                let idx = upperVal.indexOf('FALLA');
                                obsF = strVal.substring(idx + 5).replace(/^[\s|:-]+/, '').trim();
                            } else if (strVal.includes('%')) {
                                estadoF = strVal;
                            } else {
                                estadoF = "REGISTRADO";
                                obsF = strVal;
                            }

                            detalles.push({
                                categoria: sec.tab,
                                item: lbl,
                                estado: estadoF,
                                observacion: obsF,
                                foto: ""
                            });
                        }
                    });
                }
            });

            let fechaIngreso = r['FECHA INGRESO'] || '';
            if (fechaIngreso.includes('/')) {
                let p = fechaIngreso.split('/');
                if (p[2] && p[2].length === 4) {
                    fechaIngreso = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
                }
            }

            return {
                id: r['ID'] && String(r['ID']).trim() !== '(Dejar vacío para nuevo)' ? String(r['ID']).trim() : `INSP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                fecha_ingreso: fechaIngreso,
                placa: r['PLACA'] || '',
                km_tablero: r['KM TABLERO'] || '',
                cliente: r['CLIENTE'] || '',
                tecnico: r['TECNICO'] || '',
                dias_propuestos: r['DIAS PROPUESTOS'] || '30',
                detalles_json: JSON.stringify(detalles)
            };
        });

        fetch('/api/importarInspeccionesMasivo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registros: registrosProcesados })
        })
            .then(res => res.json())
            .then(r => {
                document.body.style.cursor = 'default';
                event.target.value = '';
                if (r.errores > 0 && r.ok === 0 && r.detalle) {
                    alert(`❌ Importación fallida.\nError del servidor: ${r.detalle}`);
                } else {
                    alert(`✅ Importación completada.\nProcesados con éxito: ${r.ok}\nErrores/Omitidos: ${r.errores}${r.detalle ? '\n\nDetalle: ' + r.detalle : ''}`);
                }
                if (r.ok > 0) recargarModulo('statusMant');
            })
            .catch(err => {
                document.body.style.cursor = 'default';
                event.target.value = '';
                alert("❌ Error subiendo archivo: " + err.message);
            });
    };
    reader.readAsArrayBuffer(file);
};

// ================================================================
// 🚀 FUNCIÓN DE ARRANQUE — llamada por el Router
// ================================================================
window.init_inspecciones = function () {
    if (!window.checkPerm('insp', 'l')) {
        window.showNoPermMsg('mod-inspecciones');
        return;
    }
    // Ocultar botones sin permiso crear
    var btnNuevo = document.querySelector('#mod-inspecciones [onclick*="abrirModalInspeccion"], [onclick*="abrirWizard"]');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('insp', 'c') ? '' : 'none';
    // Leer filtro pendiente desde navegación por dashboard
    var navFilter = localStorage.getItem('fleet_insp_nav_filter');
    if (navFilter) {
        localStorage.removeItem('fleet_insp_nav_filter');
        window._pendingInspFilter = navFilter;
    }
    if (typeof generarWizardFase3 === 'function') generarWizardFase3();
    // En móvil: gráficos ocultos por defecto para no ocupar espacio al entrar
    if (window.innerWidth < 768) {
        var panel = document.getElementById('panelGraficosStatus');
        var btn = document.getElementById('btnToggleGraficos');
        if (panel) panel.style.display = 'none';
        if (btn) btn.innerHTML = '<i class="bi bi-eye-fill"></i> <span data-i18n="common.charts">Gráficos</span>';
    }
    if (dataGlobalInspecciones && dataGlobalInspecciones.length > 0) {
        mostrarStatusInspecciones(dataGlobalInspecciones);
    } else {
        recargarModulo('statusMant');
    }
};

// Alias global para recargarModulo (main logica.js)
window.recargarInspecciones = function () {
    dataGlobalInspecciones = null;
    fetch('/api/script/obtenerDatosInspecciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
        .then(function (r) { return r.json(); })
        .then(function (r) { mostrarStatusInspecciones(r.data || []); })
        .catch(function () { mostrarStatusInspecciones([]); });
};


// ==========================================
// ⚙️ CONFIGURACIÓN DEL CHECKLIST
// ==========================================
window.abrirConfigInspecciones = function() {
    fetch('/api/mantenimiento/inspecciones/config')
        .then(r => r.json())
        .then(res => {
            let container = document.getElementById('config-insp-container');
            if (res.ok && res.data) {
                window.DYNAMIC_INSP_SCHEMA = res.data.map(d => {
                    let parsedItems = [];
                    try { parsedItems = typeof d.items_json === 'string' ? JSON.parse(d.items_json) : d.items_json; } catch(e){}
                    return { tab: d.titulo, template_id: d.template_id, items: parsedItems };
                });
            } else {
                window.DYNAMIC_INSP_SCHEMA = [];
            }
            window.renderConfigInspItems();
            new bootstrap.Modal(document.getElementById('modalConfigInsp')).show();
        })
        .catch(e => alert("Error al abrir configuración"));
};

window.renderConfigInspItems = function() {
    let container = document.getElementById('config-insp-container');
    let html = '';
    window.DYNAMIC_INSP_SCHEMA.forEach((cat, catIdx) => {
        let itemsHtml = '';
        (cat.items || []).forEach((item, itemIdx) => {
            let lbl = item.label || item;
            let type = item.type || 'okfalla';
            let icon = type==='okfalla' ? 'bi-check-circle' : (type==='percent' ? 'bi-percent' : 'bi-textarea-t');
            
            itemsHtml += `
                <div class="d-flex align-items-center gap-2 mb-2 bg-white p-2 rounded border shadow-sm item-row" data-catidx="${catIdx}" data-itemidx="${itemIdx}">
                    <i class="bi bi-grip-vertical text-muted cursor-move"></i>
                    <input type="text" class="form-control form-control-sm fw-bold flex-grow-1" value="${lbl}" onchange="actualizarItemConfigInsp(${catIdx}, ${itemIdx}, 'label', this.value)">
                    <select class="form-select form-select-sm" style="width: 130px;" onchange="actualizarItemConfigInsp(${catIdx}, ${itemIdx}, 'type', this.value)">
                        <option value="okfalla" ${type==='okfalla'?'selected':''}>OK / Falla</option>
                        <option value="percent" ${type==='percent'?'selected':''}>Porcentaje (%)</option>
                        <option value="text" ${type==='text'?'selected':''}>Texto Libre</option>
                    </select>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarItemConfigInsp(${catIdx}, ${itemIdx})"><i class="bi bi-trash"></i></button>
                </div>
            `;
        });

        html += `
            <div class="card shadow-sm border-0 mb-3 cat-card" style="border-radius:12px; border:1px solid #e2e8f0;">
                <div class="card-header d-flex justify-content-between align-items-center" style="background:#f1f5f9; border-radius:12px 12px 0 0;">
                    <div class="d-flex align-items-center gap-2 flex-grow-1">
                        <i class="bi bi-arrows-move text-muted cursor-move"></i>
                        <input type="text" class="form-control fw-bold border-0 bg-transparent text-primary" style="font-size:1.1rem; box-shadow:none;" value="${cat.tab}" onchange="actualizarCategoriaConfigInsp(${catIdx}, this.value)" placeholder="Nombre de la Categoría">
                    </div>
                    <button class="btn btn-sm btn-outline-danger ms-2" onclick="eliminarCategoriaConfigInsp(${catIdx})"><i class="bi bi-trash"></i> Eliminar</button>
                </div>
                <div class="card-body bg-light rounded-bottom p-3">
                    <div id="items-container-${catIdx}" class="items-sortable">
                        ${itemsHtml}
                    </div>
                    <button class="btn btn-sm btn-outline-primary mt-2 fw-bold w-100 shadow-sm" onclick="agregarItemConfigInsp(${catIdx})" style="border-style:dashed;"><i class="bi bi-plus-lg"></i> Agregar Ítem</button>
                </div>
            </div>
        `;
    });
    if(window.DYNAMIC_INSP_SCHEMA.length === 0) {
        html = '<div class="text-center py-4 text-muted">No hay categorías configuradas. Crea una para empezar.</div>';
    }
    container.innerHTML = html;
};

window.agregarCategoriaConfigInsp = function() {
    window.DYNAMIC_INSP_SCHEMA.push({ tab: "NUEVA CATEGORÍA", template_id: 'cat_' + Date.now(), items: [] });
    window.renderConfigInspItems();
};
window.eliminarCategoriaConfigInsp = function(idx) {
    if(confirm("¿Seguro que deseas eliminar esta categoría entera?")) {
        window.DYNAMIC_INSP_SCHEMA.splice(idx, 1);
        window.renderConfigInspItems();
    }
};
window.actualizarCategoriaConfigInsp = function(idx, val) {
    if(window.DYNAMIC_INSP_SCHEMA[idx]) window.DYNAMIC_INSP_SCHEMA[idx].tab = val;
};
window.agregarItemConfigInsp = function(catIdx) {
    window.DYNAMIC_INSP_SCHEMA[catIdx].items.push({ label: "Nuevo Ítem", type: "okfalla" });
    window.renderConfigInspItems();
};
window.eliminarItemConfigInsp = function(catIdx, itemIdx) {
    window.DYNAMIC_INSP_SCHEMA[catIdx].items.splice(itemIdx, 1);
    window.renderConfigInspItems();
};
window.actualizarItemConfigInsp = function(catIdx, itemIdx, field, val) {
    let item = window.DYNAMIC_INSP_SCHEMA[catIdx].items[itemIdx];
    if(typeof item === 'string') {
        window.DYNAMIC_INSP_SCHEMA[catIdx].items[itemIdx] = { label: item, type: 'okfalla' };
        item = window.DYNAMIC_INSP_SCHEMA[catIdx].items[itemIdx];
    }
    item[field] = val;
};
window.guardarConfigInsp = function() {
    let payload = {
        templates: window.DYNAMIC_INSP_SCHEMA.map(cat => ({
            titulo: cat.tab,
            template_id: cat.template_id || ('cat_' + Date.now() + Math.floor(Math.random()*1000)),
            items_json: cat.items
        }))
    };
    fetch('/api/mantenimiento/inspecciones/config/guardar', {
        method: 'POST', headers:{'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    }).then(r=>r.json()).then(res => {
        if(res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('modalConfigInsp')).hide();
            recargarModulo('statusMant');
        } else alert("Error guardando: " + res.error);
    });
};
