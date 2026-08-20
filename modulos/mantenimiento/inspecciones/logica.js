// ================================================================
// MÓDULO: INSPECCIONES — análisis de estados y formulario wizard
// Cargado dinámicamente por cargarModuloAislado('mantenimiento/inspecciones')
// ================================================================

// Paginación inspecciones (patrón window para SPA)
window.dataFinalInspGlobal = window.dataFinalInspGlobal || [];
window.inspPorPagina = window.inspPorPagina || parseInt(localStorage.getItem('fleet_insp_ppp') || '50');
window.inspPaginaActual = window.inspPaginaActual || 1;

window.DYNAMIC_INSP_SCHEMA = window.DYNAMIC_INSP_SCHEMA || [];

window.ensureInspConfig = function() {
    if (window.DYNAMIC_INSP_SCHEMA && window.DYNAMIC_INSP_SCHEMA.length > 0) return Promise.resolve();
    if (typeof window.rotToast === 'function') window.rotToast("Cargando módulos...", "bg-info");
    return fetch('/api/mantenimiento/inspecciones/config')
        .then(r => r.json())
        .then(res => {
            if (res.ok && res.data) {
                window.DYNAMIC_INSP_SCHEMA = res.data.map(d => {
                    let parsedItems = [];
                    try { parsedItems = typeof d.items_json === 'string' ? JSON.parse(d.items_json) : d.items_json; } catch(e){}
                    return { tab: d.titulo, template_id: d.template_id, items: parsedItems };
                });
            } else {
                window.DYNAMIC_INSP_SCHEMA = [];
            }
        }).catch(e => { console.error("Error al cargar cfg inspecciones", e); window.DYNAMIC_INSP_SCHEMA = []; });
};

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
window.verFotoEvidencia = function (fotoOrIndex, titulo = '') {
    let isIndex = typeof fotoOrIndex === 'number' || (typeof fotoOrIndex === 'string' && !isNaN(fotoOrIndex) && !fotoOrIndex.includes('http'));
    let currentIndex = isIndex ? parseInt(fotoOrIndex) : 0;
    let singleMode = !isIndex;
    let photosList = singleMode ? [{url: fotoOrIndex, titulo: titulo}] : (window._currentInspPhotos || []);
    
    if (photosList.length === 0) return;
    if (currentIndex >= photosList.length) currentIndex = 0;

    var overlayId = 'overlay-foto-evidencia';
    var existing = document.getElementById(overlayId);
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.id = overlayId;
    div.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 1090; display: flex; flex-direction: column; align-items: center; justify-content: center; user-select: none;";
    
    let isZoomed = false;
    let zoomLevel = 2;

    div.innerHTML = `
        <div style="position: absolute; top: 20px; right: 25px; color: white; font-size: 32px; cursor: pointer; text-shadow: 0px 2px 4px rgba(0,0,0,0.5); z-index: 1092;" onclick="document.getElementById('${overlayId}').remove();">
            <i class="bi bi-x"></i>
        </div>
        
        <div id="gallery-prev" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: white; font-size: 40px; cursor: pointer; padding: 20px; z-index: 1092; text-shadow: 0px 2px 4px rgba(0,0,0,0.5);">
            <i class="bi bi-chevron-left"></i>
        </div>
        <div id="gallery-next" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: white; font-size: 40px; cursor: pointer; padding: 20px; z-index: 1092; text-shadow: 0px 2px 4px rgba(0,0,0,0.5);">
            <i class="bi bi-chevron-right"></i>
        </div>

        <div id="gallery-img-container" style="width: 100vw; height: 80vh; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative;">
            <img id="gallery-img" src="" style="max-width: 95vw; max-height: 80vh; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); transition: transform 0.2s ease-out; transform-origin: center center;">
        </div>
        
        <div id="gallery-title" style="color: white; margin-top: 20px; font-weight: 600; font-size: 16px; text-shadow: 0px 2px 4px rgba(0,0,0,0.8); z-index: 1091; text-align: center; padding: 0 20px;"></div>
    `;
    
    document.body.appendChild(div);

    let imgEl = document.getElementById('gallery-img');
    let titleEl = document.getElementById('gallery-title');
    let prevBtn = document.getElementById('gallery-prev');
    let nextBtn = document.getElementById('gallery-next');
    let imgContainer = document.getElementById('gallery-img-container');

    function renderImg() {
        let photo = photosList[currentIndex];
        imgEl.src = photo.url;
        let safeTitle = (photo.titulo || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (photosList.length > 1) {
            titleEl.innerHTML = safeTitle + ` <span style="font-size:13px; color:#ccc; font-weight:normal;"><br>(${currentIndex + 1} de ${photosList.length})</span>`;
        } else {
            titleEl.innerHTML = safeTitle;
        }
        
        prevBtn.style.display = currentIndex > 0 ? 'block' : 'none';
        nextBtn.style.display = currentIndex < photosList.length - 1 ? 'block' : 'none';
        
        isZoomed = false;
        zoomLevel = 1;
        panX = 0; panY = 0;
        imgEl.style.transform = "translate(0px, 0px) scale(1)";
        imgEl.style.transformOrigin = "center center";
        imgContainer.style.cursor = "zoom-in";
    }

    zoomLevel = 1;
    let panX = 0, panY = 0;
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialPinchDist = null;
    let initialZoom = 1;
    let touchstartX = 0;

    renderImg();

    prevBtn.onclick = (e) => { e.stopPropagation(); if (currentIndex > 0) { currentIndex--; renderImg(); } };
    nextBtn.onclick = (e) => { e.stopPropagation(); if (currentIndex < photosList.length - 1) { currentIndex++; renderImg(); } };

    imgContainer.onclick = (e) => {
        if (e.pointerType === "touch") return; 
        e.stopPropagation();
        if (zoomLevel === 1) {
            zoomLevel = 2;
            let rect = imgEl.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;
            let xPercent = (x / rect.width) * 100;
            let yPercent = (y / rect.height) * 100;
            
            if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
                imgEl.style.transformOrigin = `${xPercent}% ${yPercent}%`;
            } else {
                imgEl.style.transformOrigin = `center center`;
            }
            imgEl.style.transform = `translate(0px, 0px) scale(${zoomLevel})`;
            imgContainer.style.cursor = "zoom-out";
            
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            isZoomed = true;
        } else {
            zoomLevel = 1;
            panX = 0; panY = 0;
            imgEl.style.transform = "translate(0px, 0px) scale(1)";
            imgContainer.style.cursor = "zoom-in";
            
            prevBtn.style.display = currentIndex > 0 ? 'block' : 'none';
            nextBtn.style.display = currentIndex < photosList.length - 1 ? 'block' : 'none';
            isZoomed = false;
        }
    };

    function getDistance(touches) {
        return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
    }

    div.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            initialPinchDist = getDistance(e.touches);
            initialZoom = zoomLevel;
            isDragging = false;
        } else if (e.touches.length === 1) {
            if (zoomLevel > 1) {
                isDragging = true;
                startX = e.touches[0].pageX - panX;
                startY = e.touches[0].pageY - panY;
            } else {
                touchstartX = e.changedTouches[0].screenX;
            }
        }
    }, {passive: false});

    div.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && initialPinchDist) {
            e.preventDefault(); 
            let currentDist = getDistance(e.touches);
            let scale = currentDist / initialPinchDist;
            zoomLevel = Math.min(Math.max(1, initialZoom * scale), 5);
            imgEl.style.transformOrigin = 'center center';
            imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
            
            if (zoomLevel > 1) {
                isZoomed = true;
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
            } else {
                isZoomed = false;
                panX = 0; panY = 0;
                imgEl.style.transform = `translate(0px, 0px) scale(1)`;
                prevBtn.style.display = currentIndex > 0 ? 'block' : 'none';
                nextBtn.style.display = currentIndex < photosList.length - 1 ? 'block' : 'none';
            }
        } else if (e.touches.length === 1 && isDragging && zoomLevel > 1) {
            e.preventDefault();
            panX = e.touches[0].pageX - startX;
            panY = e.touches[0].pageY - startY;
            imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
        }
    }, {passive: false});

    div.addEventListener('touchend', e => {
        if (e.touches.length < 2) {
            initialPinchDist = null;
        }
        if (e.touches.length === 0) {
            isDragging = false;
            if (!isZoomed && e.changedTouches.length > 0) {
                let touchendX = e.changedTouches[0].screenX;
                if (touchendX < touchstartX - 50 && currentIndex < photosList.length - 1) {
                    currentIndex++; renderImg();
                }
                if (touchendX > touchstartX + 50 && currentIndex > 0) {
                    currentIndex--; renderImg();
                }
            }
        }
    });

    div.onclick = function(e) {
        if (e.target === div || e.target === titleEl) {
            div.remove();
        }
    };

    document.addEventListener('keydown', function keyHandler(e) {
        if (!document.getElementById(overlayId)) {
            document.removeEventListener('keydown', keyHandler);
            return;
        }
        if (e.key === 'ArrowLeft' && currentIndex > 0) {
            currentIndex--; renderImg();
        } else if (e.key === 'ArrowRight' && currentIndex < photosList.length - 1) {
            currentIndex++; renderImg();
        } else if (e.key === 'Escape') {
            div.remove();
        }
    });
};

// ==========================================
// 🔥 MÓDULO ANÁLISIS DE INSPECCIONES (STATUS) 🔥
// ==========================================
window.cambiarInspTab = function(tab) {
    var btnGen = document.getElementById('insp-general-tab');
    var btnFre = document.getElementById('insp-frenos-tab');
    var paneGen = document.getElementById('insp-general');
    var paneFre = document.getElementById('insp-frenos');

    if (tab === 'frenos') {
        if (btnGen) btnGen.classList.remove('active');
        if (btnFre) btnFre.classList.add('active');
        if (paneGen) {
            paneGen.classList.remove('show', 'active');
            paneGen.style.display = 'none';
        }
        if (paneFre) {
            paneFre.classList.add('show', 'active');
            paneFre.style.display = 'flex';
        }
        if (typeof window.renderTablaFrenos === 'function') {
            window.renderTablaFrenos(dataGlobalInspecciones);
        }
    } else {
        if (btnFre) btnFre.classList.remove('active');
        if (btnGen) btnGen.classList.add('active');
        if (paneFre) {
            paneFre.classList.remove('show', 'active');
            paneFre.style.display = 'none';
        }
        if (paneGen) {
            paneGen.classList.add('show', 'active');
            paneGen.style.display = 'flex';
        }
    }
    if (typeof window.actualizarVistaGraficos === 'function') {
        window.actualizarVistaGraficos();
    }
};

window.graficosStatusAbiertos = false;
window.actualizarVistaGraficos = function() {
    let panelG = document.getElementById('panelGraficosStatus'); 
    let panelF = document.getElementById('panelGraficosFrenos');
    let isFrenos = document.getElementById('insp-frenos-tab') && document.getElementById('insp-frenos-tab').classList.contains('active');
    
    if (panelG) panelG.style.display = (window.graficosStatusAbiertos && !isFrenos) ? 'flex' : 'none';
    if (panelF) panelF.style.display = (window.graficosStatusAbiertos && isFrenos) ? 'flex' : 'none';
    
    if (window.graficosStatusAbiertos && isFrenos && typeof updateFrenosKPIs === 'function') {
        updateFrenosKPIs();
    }
};
window.toggleGraficosStatus = function() { 
    window.graficosStatusAbiertos = !window.graficosStatusAbiertos; 
    window.actualizarVistaGraficos();
    if (window.graficosStatusAbiertos && typeof filtrarStatusAvanzado === 'function') {
        filtrarStatusAvanzado();
    }
};
function toggleVistaStatus() { 
    isHistorialStatus = !isHistorialStatus; 
    window.inspPaginaActual = 1; 
    let textBtn = document.getElementById('text-toggle-status'); 
    if (textBtn) { 
        textBtn.innerText = isHistorialStatus ? "Ver Últimos Registros" : "Ver Historial"; 
    } 
    var btnMob = document.getElementById('btnMobileHistorial');
    if (btnMob) {
        if (isHistorialStatus) {
            btnMob.classList.add('active-historial');
            btnMob.innerHTML = '<i class="bi bi-clock-history me-1"></i><span style="font-weight: 700; font-size: 0.78rem;">Historial</span>';
        } else {
            btnMob.classList.remove('active-historial');
            btnMob.innerHTML = '<i class="bi bi-clock-history" style="font-size: 17px;"></i>';
        }
    }
    var mobBannerLbl = document.getElementById('insp-mob-mode-label');
    if (mobBannerLbl) {
        if (isHistorialStatus) {
            mobBannerLbl.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#818cf8;display:inline-block;box-shadow:0 0 8px #818cf8;"></span><span>Modo: Historial Completo</span>';
        } else {
            mobBannerLbl.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;box-shadow:0 0 8px #10b981;"></span><span>Modo: Últimas Inspecciones (Vigentes)</span>';
        }
    }
    expandAllStatusState = false; 
    expandStatusMap = {}; 
    mostrarStatusInspecciones(dataGlobalInspecciones); 
}
function toggleGroupRowStatus(classTipo) { expandStatusMap[classTipo] = !expandStatusMap[classTipo]; filtrarStatusAvanzado(); }
function toggleAllStatusGroups() { expandAllStatusState = !expandAllStatusState; for (let key in expandStatusMap) { expandStatusMap[key] = expandAllStatusState; } const headers = document.querySelectorAll('#cuerpoTablaStatus tr.group-header'); headers.forEach(header => { let matchIcon = header.querySelector('i').className.match(/toggle-icon-(\w+)/); if (matchIcon) expandStatusMap[matchIcon[1]] = expandAllStatusState; }); filtrarStatusAvanzado(); }

function mostrarStatusInspecciones(inspecciones) {
    if (procesadorErroresCuota(inspecciones, 'cuerpoTablaStatus')) return;
    dataGlobalInspecciones = inspecciones;
    let hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let numId = (id) => {
        if (!id) return 0;
        let parts = id.split('-');
        if (parts.length > 2 && parts[1].length === 4) {
            // format INSP-2026-06-0001
            return parseInt(parts[1] + parts[2] + parts[3]) || 0;
        }
        return parseInt(parts[1]) || 0;
    };
    let parseFechaVal = (i) => {
        if (!i || !i.fecha_ingreso) return 0;
        if (i.fecha_ingreso.includes('/')) {
            let p = i.fecha_ingreso.split('/');
            return new Date(p[2], p[1]-1, p[0]).getTime() || 0;
        }
        return new Date(i.fecha_ingreso).getTime() || 0;
    };

    let inspeccionesOrdenadas = [...inspecciones].sort((a, b) => {
        let fa = parseFechaVal(a), fb = parseFechaVal(b);
        if (fb !== fa) return fb - fa;
        return numId(b.id) - numId(a.id);
    });
    inspeccionesOrdenadas = inspeccionesOrdenadas.filter(i => i.estado !== 'Eliminada');
    
    let inspeccionesGeneral = inspeccionesOrdenadas.filter(i => i.tipo_inspeccion !== 'Solo Frenos');
    let dataFinal = [];

    let placasActivasEnUso = (window.dataGlobalPlacas || []).filter(p => {
        if ((p[0] || '').toUpperCase() === 'PLACA') return false;
        let estado = normalizeStr(p[18] || p[8] || '');
        let enUso = normalizeStr(p[22] || p[13] || '');
        return estado === "ACTIVA" && enUso !== "NO";
    });

    let cleanPlaca = (str) => (str || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!isHistorialStatus) {
        placasActivasEnUso.forEach(p => {
            let pClean = cleanPlaca(p[0]);
            let insp = inspeccionesGeneral.find(i => cleanPlaca(i.placa) === pClean);
            dataFinal.push({ infoPlaca: p, insp: insp });
        });
    } else {
        inspeccionesGeneral.forEach(insp => {
            let iClean = cleanPlaca(insp.placa);
            let p = (window.dataGlobalPlacas || []).find(pl => cleanPlaca(pl[0]) === iClean) || [insp.placa, "-", "-", "-", "-", (insp.tipo_vehiculo || "SIN TIPO"), "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"];
            dataFinal.push({ infoPlaca: p, insp: insp });
        });
        placasActivasEnUso.forEach(p => {
            let pClean = cleanPlaca(p[0]);
            let tieneInsp = inspeccionesGeneral.some(i => cleanPlaca(i.placa) === pClean);
            if (!tieneInsp) {
                dataFinal.push({ infoPlaca: p, insp: null });
            }
        });
    }

    // — Guardar referencia global de todos los registros para filtrado y paginación
    window.dataFinalInspGlobal = dataFinal;

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

                // Determinar si es la última inspección (la más reciente) de esta placa
                let esUltimaInsp = false;
                if (insp && insp.id) {
                    let pClean = cleanPlaca(placa);
                    let ultimaInspPlaca = inspeccionesGeneral.find(i => cleanPlaca(i.placa) === pClean);
                    if (ultimaInspPlaca && ultimaInspPlaca.id === insp.id) {
                        esUltimaInsp = true;
                    }
                } else if (!insp) {
                    esUltimaInsp = true;
                }

                let fIngresoBonita = "-"; let diasRestantes = -9999; let tecnico = "-"; let colorFalta = ""; let txtEstado = ""; let estadoVigente2 = "";

                if (insp && insp.fecha_ingreso) {
                    fIngresoBonita = parseDateToDDMMYYYY(insp.fecha_ingreso); tecnico = insp.tecnico;
                    let fIngreso;
                    if (insp.fecha_ingreso.includes('/')) {
                        let px = insp.fecha_ingreso.split('/'); fIngreso = new Date(px[2], px[1] - 1, px[0]);
                    } else {
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

                let badgeProx = (diasRestantes === -9999)
                    ? `<span class="badge bg-secondary shadow-sm">Sin Registro</span>`
                    : ((isHistorialStatus && !esUltimaInsp)
                        ? `<span class="badge bg-light text-secondary border shadow-2xs">REGISTRADO</span>`
                        : `<span class="badge p-1 px-2 shadow-sm text-white" style="background-color: ${colorFalta};">${textoBadgeProx}</span>`);

                let badgeEst = (isHistorialStatus && !esUltimaInsp)
                    ? `<span style="color: #64748b; font-weight: bold; font-size: 0.8rem;">REGISTRADO</span>`
                    : `<span style="color: ${colorFalta}; font-weight: bold; font-size: 0.8rem;">${txtEstado}</span>`;

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
                    btnRegistrar = `<span class="text-muted" style="font-size:12px;">Sin registro</span>`;
                } else {
                    btnRegistrar = `<button class="btn btn-sm d-flex align-items-center gap-1 shadow-sm" style="color: #059669; background-color: #d1fae5; border: 1px solid #a7f3d0; font-size: 13px; font-weight: bold; padding: 0.375rem 0.75rem; border-radius: 8px;" onclick="event.stopPropagation(); verDetalleInspeccion('${insp.id}', false)"><i class="bi bi-eye"></i> Ver</button>`;
                }

                let daysOverdueHTML = '';
                let colorBanda = '#94a3b8';

                if (!insp || !insp.id) {
                    daysOverdueHTML = `<span style="font-size: 10px; font-weight: bold; background-color: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 9999px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 4px;"><i class="bi bi-dash-circle"></i> SIN REGISTRO</span>`;
                    colorBanda = '#94a3b8';
                } else if (isHistorialStatus && !esUltimaInsp) {
                    daysOverdueHTML = `<span style="font-size: 10px; font-weight: bold; background-color: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 9999px; border: 1px solid #cbd5e1; display: flex; align-items: center; gap: 4px;"><i class="bi bi-archive-fill"></i> REGISTRADO</span>`;
                    colorBanda = '#94a3b8';
                } else {
                    if (diasRestantes < 0 && diasRestantes !== -9999) {
                        let cantD = Math.abs(diasRestantes);
                        let lblD = cantD === 1 ? 'Venció hace 1 día' : `Venció hace ${cantD} días`;
                        daysOverdueHTML = `<span style="font-size: 10px; font-weight: bold; background-color: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 9999px; border: 1px solid #fecaca; display: flex; align-items: center; gap: 4px;"><i class="bi bi-exclamation-circle-fill"></i> ${lblD}</span>`;
                        colorBanda = '#dc2626';
                    } else if (diasRestantes >= 0 && diasRestantes <= 7 && diasRestantes !== -9999) {
                        let cantD = diasRestantes;
                        let lblD = cantD === 1 ? 'Falta 1 día' : (cantD === 0 ? 'Vence hoy' : `Faltan ${cantD} días`);
                        daysOverdueHTML = `<span style="font-size: 10px; font-weight: bold; background-color: #fef3c7; color: #b45309; padding: 2px 8px; border-radius: 9999px; border: 1px solid #fde68a; display: flex; align-items: center; gap: 4px;"><i class="bi bi-clock-history"></i> ${lblD}</span>`;
                        colorBanda = '#f59e0b';
                    } else if (diasRestantes > 7) {
                        let cantD = diasRestantes;
                        let lblD = cantD === 1 ? 'Falta 1 día' : `Faltan ${cantD} días`;
                        daysOverdueHTML = `<span style="font-size: 10px; font-weight: bold; background-color: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 9999px; border: 1px solid #bbf7d0; display: flex; align-items: center; gap: 4px;"><i class="bi bi-check-circle-fill"></i> ${lblD}</span>`;
                        colorBanda = '#10b981';
                    }
                }

                html += `<tr class="child-st-${classTipo} clickable-row data-row-status child-row-status" style="display:none;" data-cliente="${cli}" data-marca="${mar}" data-estado-v2="${estadoVigente2}" data-motor="${motora}" data-dias="${diasRestantes}" onclick="seleccionarFilaInspeccion(event, this)">
              <td class="d-none d-md-table-cell fw-bold text-primary" data-value="${placa}">${checkHtml}${placa} ${subCli}</td><td class="d-none" data-value="${cli}">${cli}</td><td class="d-none d-md-table-cell">${mod}</td>
              <td class="d-none d-md-table-cell text-truncate" style="max-width: 100px;">${tecnico}</td><td class="d-none d-md-table-cell">${fIngresoBonita}</td><td class="d-none d-md-table-cell" data-value="${diasRestantes}">${badgeProx}</td>
              <td class="d-none d-md-table-cell" data-value="${txtEstado}">${badgeEst}</td><td class="d-none" data-value="${estadoVigente2}">${estadoVigente2}</td>
              <td class="d-none d-md-table-cell">${ubicacionHtml}</td><td class="d-none d-md-table-cell">${menuAcciones}</td>
              <td class="d-block d-md-none p-2 border-0 bg-transparent">
                  <div class="insp-mob-card p-3 rounded-4 shadow-sm border bg-white mb-2" style="position: relative; overflow: hidden; border-left: 5px solid ${colorBanda} !important;">
                      <div class="d-flex justify-content-between align-items-center mb-2">
                          <div class="d-flex align-items-center gap-2 flex-wrap">
                              <span class="bg-light border text-dark font-monospace fw-bold px-2 py-1 rounded shadow-2xs" style="font-size: 13px; letter-spacing: 1px;">${placa}</span>
                              ${daysOverdueHTML}
                          </div>
                          ${insp && insp.id ? `
                              <button class="btn btn-sm btn-light border fw-bold text-primary px-3 shadow-2xs rounded-pill" onclick="event.stopPropagation(); verDetalleInspeccion('${insp.id}', false)">
                                  <i class="bi bi-eye-fill"></i> Ver
                              </button>
                          ` : btnRegistrar}
                      </div>

                      <div class="d-flex justify-content-between align-items-center py-2 px-2 my-2 rounded-3" style="background: rgba(0,0,0,0.025); font-size: 0.8rem;">
                          <div class="d-flex align-items-center gap-2 text-muted fw-semibold">
                              <i class="bi bi-building text-secondary"></i>
                              <span class="text-dark text-truncate" style="max-width: 140px;">${cli}</span>
                              <span>•</span>
                              <span>${mod}</span>
                          </div>
                          ${insp && insp.id ? `<span class="badge bg-secondary text-white font-monospace" style="font-size: 0.7rem;">${insp.id}</span>` : ''}
                      </div>

                      <div class="d-flex justify-content-between align-items-center mt-2 pt-1" style="font-size: 0.78rem; color: var(--subtext);">
                          <div class="d-flex align-items-center gap-2">
                              <span class="fw-semibold"><i class="bi bi-person text-secondary me-1"></i>${tecnico}</span>
                              <span>•</span>
                              <span><i class="bi bi-calendar text-secondary me-1"></i>${fIngresoBonita}</span>
                          </div>
                          <div class="d-flex align-items-center gap-1 font-monospace fw-bold text-dark">
                              <i class="bi bi-speedometer text-primary"></i> ${txtKmReact}
                          </div>
                      </div>
                  </div>
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
            { label: 'Semáforo', idx: 6, visible: true },
            { label: 'Ubicación GPS', idx: 8, visible: true }
        ], 'fleet_cols_insp');
    }
    
    // Renderizar tabla de frenos — usar variable local dataGlobalInspecciones
    // (window.dataGlobalInspecciones no existe; la variable es local al módulo)
    if (typeof renderTablaFrenos === 'function') {
        renderTablaFrenos(dataGlobalInspecciones);
    }
}
window.toggleMobileFiltrosSheet = function() {
    var b = document.querySelector('#btnFiltrosInsp');
    var m = b ? b.nextElementSibling : null;
    var ov = document.getElementById('mobFiltOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'mobFiltOverlay';
        ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:9999;display:none;backdrop-filter:blur(4px);transition:opacity 0.25s ease;';
        ov.onclick = function() {
            if (m) m.classList.remove('show');
            ov.style.display = 'none';
        };
        document.body.appendChild(ov);
    }
    window._mobFiltOverlay = ov;
    if (m) {
        var isShown = m.classList.contains('show');
        if (isShown) {
            m.classList.remove('show');
            ov.style.display = 'none';
        } else {
            m.classList.add('show');
            ov.style.display = 'block';
        }
    }
};

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

window._inspFiltroSemaforo = window._inspFiltroSemaforo || 'total';

window.filtrarTablaPorSemaforo = function(tipo, btn) {
    window._inspFiltroSemaforo = tipo || 'total';
    document.querySelectorAll('#moduloStatus .ck-kpi-card').forEach(function(el) {
        var cardId = 'insp-kpi-' + (tipo === 'verde' ? 'conformes' : (tipo === 'amarillo' ? 'alerta' : (tipo === 'rojo' ? 'criticas' : 'total')));
        el.classList.toggle('active', el.id === cardId);
    });
    filtrarStatusAvanzado();
};

function filtrarStatusAvanzado() {
    const txt = document.getElementById('buscadorStatus')?.value.toLowerCase() || '';
    const chkCli = Array.from(document.querySelectorAll('#filtroStatusCliente input:checked')).map(e => e.value);
    const chkMar = Array.from(document.querySelectorAll('#filtroStatusMarca input:checked')).map(e => e.value);
    const chkEst = Array.from(document.querySelectorAll('#filtroStatusEstado input:checked')).map(e => e.value);
    const filtroSem = window._inspFiltroSemaforo || 'total';
    let isFiltering = txt !== '' || chkCli.length > 0 || chkMar.length > 0 || chkEst.length > 0 || filtroSem !== 'total';

    let cntTotalVig = 0, cntTotalNoVig = 0;
    let cntMotVig = 0, cntMotNoVig = 0;
    let cntNoMotVig = 0, cntNoMotNoVig = 0;

    let kpiTotal = 0, kpiConformes = 0, kpiAlerta = 0, kpiCriticas = 0;

    const headers = document.querySelectorAll('#cuerpoTablaStatus tr.group-header');
    let totalVisiblesMob = 0;
    headers.forEach(header => {
        let matchIcon = header.querySelector('i').className.match(/toggle-icon-(\w+)/);
        if (!matchIcon) return;
        let classTipo = matchIcon[1];
        let childRows = document.querySelectorAll(`.child-st-${classTipo}`);
        let visibleCount = 0;

        childRows.forEach(row => {
            let cli = row.getAttribute('data-cliente');
            let mar = row.getAttribute('data-marca');
            let est = (row.getAttribute('data-estado-v2') || '').toLowerCase();
            let textoFila = row.textContent.toLowerCase();
            let dias = parseInt(row.getAttribute('data-dias'));

            // Clasificar estado semafórico para KPI
            kpiTotal++;
            if (isNaN(dias) || dias < 0 || est.includes('vencid') || est.includes('crit') || est.includes('no vigente')) {
                kpiCriticas++;
            } else if (dias <= 7 || est.includes('alert') || est.includes('observ') || est.includes('próximo') || est.includes('proximo')) {
                kpiAlerta++;
            } else {
                kpiConformes++;
            }

            let matchCli = (!chkCli.length || chkCli.includes(cli));
            let matchMar = (!chkMar.length || chkMar.includes(mar));
            let matchEst = (!chkEst.length || chkEst.includes(est));
            let matchTxt = (!txt || textoFila.includes(txt));

            let matchSem = true;
            if (filtroSem === 'verde') {
                matchSem = dias > 7 && !est.includes('vencid') && !est.includes('alert') && !est.includes('no vigente');
            } else if (filtroSem === 'amarillo') {
                matchSem = (dias >= 0 && dias <= 7) || est.includes('alert') || est.includes('observ') || est.includes('próximo') || est.includes('proximo');
            } else if (filtroSem === 'rojo') {
                matchSem = isNaN(dias) || dias < 0 || est.includes('vencid') || est.includes('crit') || est.includes('no vigente');
            }

            if (matchCli && matchMar && matchEst && matchTxt && matchSem) {
                visibleCount++;
                row.style.display = (isFiltering || expandStatusMap[classTipo]) ? '' : 'none';

                if (!isHistorialStatus) {
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
            totalVisiblesMob += visibleCount;
            header.style.display = '';
            if (spanConteo) spanConteo.innerText = visibleCount + " Unidades";
            if (icon) icon.className = (isFiltering || expandStatusMap[classTipo]) ? `bi bi-chevron-down ms-1 me-2 text-warning toggle-icon-${classTipo}` : `bi bi-chevron-right ms-1 me-2 text-warning toggle-icon-${classTipo}`;
        } else {
            header.style.display = 'none';
        }
    });

    const setKpi = (id, v) => { var el = document.getElementById(id); if (el) el.textContent = v; };
    setKpi('kpi-insp-total', kpiTotal);
    setKpi('kpi-insp-conformes', kpiConformes);
    setKpi('kpi-insp-alerta', kpiAlerta);
    setKpi('kpi-insp-criticas', kpiCriticas);

    var mobCnt = document.getElementById('insp-mob-mode-count');
    if (mobCnt) mobCnt.textContent = totalVisiblesMob + (totalVisiblesMob === 1 ? ' registro' : ' registros');

    if (!isHistorialStatus) {
        try { updateGraficosEnVivo(cntTotalVig, cntTotalNoVig, cntMotVig, cntMotNoVig, cntNoMotVig, cntNoMotNoVig); } catch(e) { }
    }

    // Filtrar también tabla Frenos y cards móviles si están renderizadas
    let rowsFrenos = document.querySelectorAll('#cuerpoTablaFrenos tr');
    if (rowsFrenos.length > 0) {
        rowsFrenos.forEach(row => {
            if (row.cells && row.cells.length > 1) {
                let textoFila = row.textContent.toLowerCase();
                row.style.display = (!txt || textoFila.includes(txt)) ? '' : 'none';
            }
        });
    }
    let cardsFrenos = document.querySelectorAll('#frenosMobileContainer .card');
    if (cardsFrenos.length > 0) {
        cardsFrenos.forEach(card => {
            let textoCard = card.textContent.toLowerCase();
            card.style.display = (!txt || textoCard.includes(txt)) ? '' : 'none';
        });
    }
}

window.verDetalleInspeccion = async function(idBusqueda, autoDescargarPDF) {
    if (!document.getElementById('modalResumenInspeccion')) {
        if (typeof window.rotToast === 'function') window.rotToast("Cargando visor de reportes...", "bg-info");
        try {
            let res = await fetch('/modulos/mantenimiento/inspecciones/vista.html');
            let html = await res.text();
            let tmp = document.createElement('div');
            tmp.innerHTML = html;
            let modal = tmp.querySelector('#modalResumenInspeccion');
            let pdfContainer = tmp.querySelector('#contenedor-pdf-inspeccion');
            if (modal) document.body.appendChild(modal);
            if (pdfContainer) document.body.appendChild(pdfContainer);
            await new Promise(r => setTimeout(r, 50));
        } catch(e) { console.error("Error loading vista", e); return; }
    }

    if (!window.DYNAMIC_INSP_SCHEMA || window.DYNAMIC_INSP_SCHEMA.length === 0) {
        try {
            let reqCfg = await fetch('/api/mantenimiento/inspecciones/configuracion', { method: 'GET' });
            let resCfg = await reqCfg.json();
            if (resCfg.data && resCfg.data.length > 0) {
                window.DYNAMIC_INSP_SCHEMA = resCfg.data.map(d => {
                    let items = d.items;
                    try { if (typeof items === 'string') items = JSON.parse(items); } catch(e){}
                    return { tab: d.tab, items: items };
                });
            } else {
                window.DYNAMIC_INSP_SCHEMA = [];
            }
        } catch (e) {
            console.error("Error loading schema", e);
            window.DYNAMIC_INSP_SCHEMA = [];
        }
    }

    let dataLocal = window.dataGlobalInspecciones || [];
    let insp = dataLocal.find(i => i.id === idBusqueda);
    if (!insp) {
        try {
            if (typeof window.rotToast === 'function') window.rotToast("Cargando detalles...", "bg-info");
            let req = await fetch('/api/script/obtenerDatosInspecciones', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] })
            });
            let res = await req.json();
            window.dataGlobalInspecciones = res.data || [];
            insp = window.dataGlobalInspecciones.find(i => i.id === idBusqueda);
        } catch (e) { console.error(e); }
    }
    if (!insp) { alert("No se encontró la inspección."); return; }

    window._lastInspDetalle = insp;

    let detallesArray = [];
    try { detallesArray = typeof insp.detalles_json === 'string' ? JSON.parse(insp.detalles_json) : (insp.detalles_json || []); } catch (e) { }

    let s3Urls = [];
    detallesArray.forEach(d => {
        if (d.foto && d.foto.startsWith('https://') && d.foto.includes('.s3.')) s3Urls.push(d.foto);
        if (d.categoria === "FIRMAS_EXTRA" && d.foto && d.foto.startsWith('https://') && d.foto.includes('.s3.')) s3Urls.push(d.foto);
    });
    if (insp.url_firma && insp.url_firma.startsWith('https://') && insp.url_firma.includes('.s3.')) s3Urls.push(insp.url_firma);

    let signedMap = {};
    if (s3Urls.length > 0) {
        try {
            if (typeof window.rotToast === 'function') window.rotToast("Cargando evidencias temporales...", "bg-info");
            let reqUrl = await fetch('/api/mantenimiento/inspecciones/presign-read', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: s3Urls })
            });
            let resUrl = await reqUrl.json();
            if (resUrl.signed) signedMap = resUrl.signed;
        } catch (e) { console.error("Error presigning", e); }
    }

    let fIng = parseDateToDDMMYYYY(insp.fecha_ingreso);
    let countFallas = 0;
    let firmaJefePDF = ""; let nombreJefePDF = "";
    let firmaPlannerPDF = ""; let nombrePlannerPDF = "";
    window.EVIDENCIAS_TMP = window.EVIDENCIAS_TMP || {};

    let htmlEvidenciasPDF = ""; let htmlEvidenciasUI = ""; let contEvidencias = 1;
    window._currentInspPhotos = [];

    detallesArray.forEach(d => {
        if (d.estado === "SIN DATOS" || d.estado === "") return;

        let fotoReal = signedMap[d.foto] || d.foto;

        if (d.categoria === "FIRMAS_EXTRA") {
            if (d.item === "Jefe de Taller") { firmaJefePDF = fotoReal; nombreJefePDF = d.estado; }
            if (d.item === "Planner de Mant.") { firmaPlannerPDF = fotoReal; nombrePlannerPDF = d.estado; }
            return;
        }

        if (d.estado === "FALLA") countFallas++;

        if (fotoReal && fotoReal.length > 100) {
            let tmpKey = 'ev_' + Date.now() + '_' + Math.floor(Math.random()*1000);
            window.EVIDENCIAS_TMP[tmpKey] = fotoReal;
            
            let photoIndex = window._currentInspPhotos.length;
            window._currentInspPhotos.push({
                url: fotoReal,
                titulo: `Evidencia ${contEvidencias}: ${d.item}`
            });
            
            let btnVer = `<button type="button" data-html2canvas-ignore="true" class="btn btn-sm btn-primary mt-2 py-1 px-3 shadow-sm pdf-hide-btn" onclick="window.verFotoEvidencia(${photoIndex})"><i class="bi bi-camera"></i> Abrir Evidencia</button>`;
            
            htmlEvidenciasPDF += `
                <div class="pdf-evidencia-card">
                    <h5>Evidencia ${contEvidencias}: ${d.item}</h5>
                    <img src="${fotoReal}">
                    ${d.observacion ? `<p>${d.observacion}</p>` : ''}
                    <div style="text-align:center;">${btnVer}</div>
                </div>
            `;

            htmlEvidenciasUI += `<img src="${fotoReal}" onclick="window.verFotoEvidencia(${photoIndex})" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1px solid #cbd5e1; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" title="${d.item}">`;

            contEvidencias++;
        }
    });

    let htmlChecklistPDF = "";
    let htmlUI = `
    <div class="p-0 p-md-4" style="background-color: #f8fafc; min-height: 100%;">
        <div class="d-flex flex-wrap gap-3 gap-md-4 mb-3 p-3 bg-white rounded-0 rounded-md shadow-sm" style="border: 1px solid #e2e8f0; border-left: 0; border-right: 0;">
            <div class="flex-grow-1">
                <span class="text-uppercase" style="font-size: 11px; color: #64748b; font-weight: bold; letter-spacing: 0.5px;">Nº Reporte</span>
                <div style="font-size: 15px; font-weight: 800; color: #0284c7;">${insp.id || '-'}</div>
            </div>
            <div>
                <span class="text-uppercase" style="font-size: 11px; color: #64748b; font-weight: bold; letter-spacing: 0.5px;">Vehículo</span>
                <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${insp.placa || '-'}</div>
            </div>
            <div>
                <span class="text-uppercase" style="font-size: 11px; color: #64748b; font-weight: bold; letter-spacing: 0.5px;">Fecha</span>
                <div style="font-size: 14px; font-weight: 600; color: #334155;">${fIng || '-'}</div>
            </div>
            <div>
                <span class="text-uppercase" style="font-size: 11px; color: #64748b; font-weight: bold; letter-spacing: 0.5px;">Técnico</span>
                <div style="font-size: 14px; font-weight: 600; color: #334155;">${insp.tecnico || '-'}</div>
            </div>
            <div>
                <span class="text-uppercase" style="font-size: 11px; color: #64748b; font-weight: bold; letter-spacing: 0.5px;">Kilometraje</span>
                <div style="font-size: 14px; font-weight: 600; color: #334155;">${insp.km_tablero || '-'}</div>
            </div>
        </div>
        <div class="bg-white rounded-0 rounded-md shadow-sm p-0 p-md-4 pb-4" style="border: 1px solid #e2e8f0; border-left: 0; border-right: 0;">
    `;
    const romanos = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

    htmlUI += `<div class="table-responsive">
        <table class="table table-borderless align-middle mb-0" style="min-width: 500px;">
            <thead style="border-bottom: 2px solid #cbd5e1;">
                <tr>
                    <th class="text-uppercase px-3" style="font-size: 11px; color: #64748b; width: 40%; border-right: 1px solid #e2e8f0;">Criterio</th>
                    <th class="text-uppercase text-center" style="font-size: 11px; color: #64748b; width: 20%; border-right: 1px solid #e2e8f0;">Estado</th>
                    <th class="text-uppercase px-3" style="font-size: 11px; color: #64748b; width: 40%;">Observación</th>
                </tr>
            </thead>
            <tbody>`;

    if (window.DYNAMIC_INSP_SCHEMA && window.DYNAMIC_INSP_SCHEMA.length > 0) {
        window.DYNAMIC_INSP_SCHEMA.forEach((sec, idxCat) => {
            htmlChecklistPDF += `<tr class="sec-row"><td colspan="4">${romanos[idxCat] || (idxCat+1)}. ${sec.tab.toUpperCase()}</td></tr>`;
            let catUI = '';
            let hasItems = false;
            if (sec.items) {
                sec.items.forEach((item, idxItem) => {
                    let lbl = typeof item === 'string' ? item : item.label;
                    let secTabNorm = normalizeStr(sec.tab);
                    let match = detallesArray.find(d => {
                        if (!d.item || !d.categoria) return false;
                        let catNorm = normalizeStr(d.categoria.replace(/^\d+\.\s*/, ''));
                        return normalizeStr(d.item) === normalizeStr(lbl) && catNorm === secTabNorm;
                    });
                    let obs = (match && match.observacion) ? match.observacion : "";
                    
                    let rowspan = sec.items.length;
                    let allObs = sec.items.map(i => {
                        let lbl2 = typeof i === 'string' ? i : i.label;
                        let secTabNorm2 = normalizeStr(sec.tab);
                        let m = detallesArray.find(d => {
                            if (!d.item || !d.categoria) return false;
                            let catNorm2 = normalizeStr(d.categoria.replace(/^\d+\.\s*/, ''));
                            return normalizeStr(d.item) === normalizeStr(lbl2) && catNorm2 === secTabNorm2;
                        });
                        return (m && m.observacion) ? m.observacion : "";
                    }).filter(x => x).join('<br>');
                    let obsTd = (idxItem === 0) ? `<td class="w-obs" rowspan="${rowspan}" style="vertical-align:top; border-left: 1px solid #000; padding: 4px;">${allObs}</td>` : '';
                    htmlChecklistPDF += `<tr>
                        <td class="w-crit">${idxItem + 1}. ${lbl}</td>
                        <td class="w-chk th-center"><span class="chk-icon ${match && match.estado === 'OK' ? 'chk-green' : ''}" style="${match && match.estado !== 'OK' && match.estado !== 'FALLA' && match.estado !== 'SIN DATOS' ? 'font-size:10px;font-family:sans-serif;font-weight:bold;color:#2563eb;' : ''}">${match && match.estado === 'OK' ? '✓' : (match && match.estado !== 'FALLA' && match.estado !== 'SIN DATOS' ? match.estado : '')}</span></td>
                        <td class="w-chk th-center"><span class="chk-icon ${match && match.estado === 'FALLA' ? 'chk-red' : ''}">${match && match.estado === 'FALLA' ? '✗' : ''}</span></td>
                        ${obsTd}
                    </tr>`;

                    if (match && match.estado && match.estado !== "SIN DATOS") {
                        hasItems = true;
                        let badgeHtml;
                        if (match.estado === 'OK') {
                            badgeHtml = `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3 py-1">OK</span>`;
                        } else if (match.estado === 'FALLA') {
                            badgeHtml = `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 rounded-pill px-3 py-1">MAL</span>`;
                        } else {
                            badgeHtml = `<span class="badge bg-primary bg-opacity-10 border border-primary border-opacity-25 rounded-pill px-3 py-1" style="color: #1e40af !important; font-weight: 700;">${match.estado}</span>`;
                        }
                        
                        let obsHtml = obs ? `<span style="font-size: 13px; color: #000; font-weight: bold;">${obs}</span>` : '';

                        catUI += `<tr style="border-bottom: 1px solid #f1f5f9;">
                            <td class="px-3 py-2" style="font-size: 13px; color: #475569; border-right: 1px solid #e2e8f0;">${lbl}</td>
                            <td class="text-center py-2" style="border-right: 1px solid #e2e8f0; width: 120px;">${badgeHtml}</td>
                            <td class="px-3 py-2" style="font-size: 13px; color: #000;">${obsHtml}</td>
                        </tr>`;
                    }
                });
            }
            if (hasItems) {
                htmlUI += `<tr><td colspan="3" class="fw-bold px-3" style="background-color: #f8fafc; font-size: 13px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-top: 16px; padding-bottom: 8px;">${romanos[idxCat] || (idxCat+1)}. ${sec.tab}</td></tr>`;
                htmlUI += catUI;
            }
        });
    }

    htmlUI += `</tbody></table></div>`;

    if (contEvidencias > 1) {
        htmlUI += `<div class="mt-4 pt-2">
            <h6 style="font-size: 13px; font-weight: bold; color: #1e293b; margin-bottom: 12px;">Evidencias Fotográficas (${contEvidencias - 1})</h6>
            <div class="d-flex gap-2 overflow-auto pb-2" style="scrollbar-width: thin;">${htmlEvidenciasUI}</div>
        </div>`;
    }

    let firmaPrincipalReal = signedMap[insp.url_firma] || insp.url_firma;
    let firmasHtmlUI = "";
    if (firmaPrincipalReal && firmaPrincipalReal.length > 100) {
        firmasHtmlUI += `<div class="text-center"><img src="${firmaPrincipalReal}" style="max-height: 120px; max-width: 250px; object-fit: contain; display: block; margin: 0 auto; border-bottom: 2px solid #ccc;"><span style="font-size: 14px; font-weight: bold;">Técnico Inspector</span><br><span style="font-size: 12px;">${insp.tecnico || '-'}</span></div>`;
    }

    if (firmasHtmlUI !== "") {
        htmlUI += `<div class="mt-4 pt-3 border-top d-flex justify-content-around flex-wrap gap-3">${firmasHtmlUI}</div>`;
    }

    htmlUI += `</div></div>`; // Close cards

    if (!autoDescargarPDF) {
        let modalBody = document.querySelector('#modalResumenInspeccion .modal-body');
        if (modalBody) {
            modalBody.innerHTML = htmlUI;
        }
    }

    let btnIrOtContainer = document.getElementById('btn-ir-ot-container');
    if (btnIrOtContainer) {
        if (insp.id_ot) {
            btnIrOtContainer.innerHTML = `<button type="button" class="btn btn-outline-info btn-sm fw-bold" onclick="bootstrap.Modal.getInstance(document.getElementById('modalResumenInspeccion')).hide(); if(typeof window.rotAbrirDetalle === 'function'){ window.rotAbrirDetalle('${insp.id_ot}'); } else { if(typeof window.cargarModuloAislado === 'function') window.cargarModuloAislado('mantenimiento/reportes-ot'); setTimeout(()=> { if(typeof window.rotAbrirDetalle === 'function') window.rotAbrirDetalle('${insp.id_ot}'); }, 800); }"><i class="bi bi-box-arrow-up-right"></i> Ir a OT</button>`;
        } else {
            btnIrOtContainer.innerHTML = '';
        }
    }

    // Se ha eliminado la inyección del HTML del PDF en el modal, ahora usamos la vista UI limpia.

    let modalDialog = document.querySelector('#modalResumenInspeccion .modal-dialog');
    if(modalDialog) {
        modalDialog.classList.remove('modal-lg');
        modalDialog.classList.add('modal-xl', 'modal-fullscreen-lg-down');
    }
    
    let modalBody = document.querySelector('#modalResumenInspeccion .modal-body');
    if(modalBody) {
        modalBody.classList.remove('p-4');
        modalBody.classList.add('p-0', 'p-md-4');
    }

    if (autoDescargarPDF) {
        setTimeout(generarPDFInspeccion, 500);
    } else {
        let modalEl = document.getElementById('modalResumenInspeccion');
        if (modalEl && modalEl.parentElement !== document.body) {
            document.body.appendChild(modalEl);
        }
        modalEl.style.setProperty('z-index', '1080', 'important');
        let modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        setTimeout(() => {
            let backdrops = document.querySelectorAll('.modal-backdrop');
            if (backdrops.length > 0) {
                backdrops[backdrops.length - 1].style.setProperty('z-index', '1070', 'important');
            }
        }, 100);
    }
}

function generarPDFInspeccion() {
    var insp = window._lastInspDetalle;
    if (!insp) { alert('No hay datos de inspección cargados.'); return; }

    var logoEl = document.getElementById('pdf_inspeccion_vista_logo');
    if (logoEl) {
        var empLogo = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64;
        if (empLogo) logoEl.src = empLogo;
    }

    var fIng = parseDateToDDMMYYYY(insp.fecha_ingreso);
    var detallesArr = [];
    try { detallesArr = typeof insp.detalles_json === 'string' ? JSON.parse(insp.detalles_json) : (insp.detalles_json || []); } catch(e){}

    // Collect S3 URLs that need presigning
    var s3Urls = [];
    detallesArr.forEach(function(d) {
        if (d.foto && d.foto.startsWith('https://') && d.foto.includes('.s3.')) {
            s3Urls.push(d.foto);
        }
    });
    if (insp.url_firma && insp.url_firma.startsWith('https://') && insp.url_firma.includes('.s3.')) {
        s3Urls.push(insp.url_firma);
    }

    var rampaPdf = '';
    if (insp.id_ot) {
        var otList = window.rotData || (window.dataGlobalOT || []);
        var otMatch = otList.find(function(o){ return String(o.ticket_entrada) === String(insp.id_ot) || String(o.id_ot) === String(insp.id_ot); });
        if (!otMatch && window.srData) otMatch = window.srData.find(function(o){ return String(o.ticket_entrada) === String(insp.id_ot) || String(o.id_ot) === String(insp.id_ot); });
        if (otMatch) {
             var detOt = {};
             try { detOt = typeof otMatch.detalles_json === 'string' ? JSON.parse(otMatch.detalles_json) : (otMatch.detalles_json||{}); }catch(e){}
             rampaPdf = detOt.rampa_origen || '';
        }
    }

    var presignPromise;
    if (s3Urls.length > 0) {
        presignPromise = fetch('/api/mantenimiento/inspecciones/presign-read', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ urls: s3Urls })
        }).then(function(r){ return r.json(); }).then(function(res){ return res.signed || {}; }).catch(function(){ return {}; });
    } else {
        presignPromise = Promise.resolve({});
    }

    presignPromise.then(function(signedMap) {
        // Build checklist body
        var tbody = '';
        var romanos = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV'];
        var schema = window.DYNAMIC_INSP_SCHEMA || [];
        schema.forEach(function(sec, idxCat) {
            tbody += '<tr class="sec-row"><td colspan="4">' + (romanos[idxCat]||(idxCat+1)) + '. ' + sec.tab.toUpperCase() + '</td></tr>';
            if (sec.items) {
                sec.items.forEach(function(item, idxItem) {
                    var lbl = typeof item === 'string' ? item : item.label;
                    var match = detallesArr.find(function(d){ 
                        if (!d.item || !d.categoria) return false;
                        var catNorm = (d.categoria.replace(/^\d+\.\s*/, '')).trim().toLowerCase();
                        return d.item.trim().toLowerCase() === lbl.trim().toLowerCase() && catNorm === sec.tab.trim().toLowerCase();
                    });
                    var estadoHtml = '', obs = '';
                    var sqGreen = '<div style="display:inline-block;width:12px;height:12px;border:2px solid #16a34a;margin-right:8px;vertical-align:middle;text-align:center;line-height:10px;font-size:10px;font-weight:bold;color:#16a34a;">&nbsp;</div>';
                    var sqRed = '<div style="display:inline-block;width:12px;height:12px;border:2px solid #dc2626;vertical-align:middle;text-align:center;line-height:10px;font-size:10px;font-weight:bold;color:#dc2626;">&nbsp;</div>';

                    if (match && match.estado) {
                        if (match.estado === 'OK') {
                            sqGreen = '<div style="display:inline-block;width:12px;height:12px;border:2px solid #16a34a;margin-right:8px;vertical-align:middle;text-align:center;line-height:10px;font-size:10px;font-weight:bold;color:#16a34a;">✓</div>';
                        }
                        if (match.estado === 'FALLA') {
                            sqRed = '<div style="display:inline-block;width:12px;height:12px;border:2px solid #dc2626;vertical-align:middle;text-align:center;line-height:10px;font-size:10px;font-weight:bold;color:#dc2626;">✗</div>';
                        }
                        obs = match.observacion || '';
                    }
                    let obsTd = `<td class="w-obs" style="vertical-align:middle; border-left:1px solid #000; padding:1px 4px;">${obs}</td>`;
                    tbody += '<tr><td>' + (idxItem+1) + '. ' + lbl + '</td><td class="w-chk" style="text-align:center;">' + sqGreen + '</td><td class="w-chk" style="text-align:center;">' + sqRed + '</td>' + obsTd + '</tr>';
                });
            }
        });

        // Build evidences HTML
        var htmlEvidencias = '';
        var contEv = 1;
        detallesArr.forEach(function(d) {
            if (d.categoria === 'FIRMAS_EXTRA') return;
            if (d.foto && d.foto.length > 100) {
                var fotoUrl = d.foto;
                if (signedMap[fotoUrl]) fotoUrl = signedMap[fotoUrl];
                htmlEvidencias += '<div style="border:1px solid #000;padding:5px;text-align:center;page-break-inside:avoid;"><h5 style="margin:0 0 4px 0;font-size:11px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:2px;">Evidencia ' + contEv + ': ' + d.item + '</h5><img src="' + fotoUrl + '" style="max-width:100%;max-height:180px;object-fit:contain;display:block;margin:0 auto;">' + (d.observacion ? '<p style="margin:4px 0 0;font-size:10px;">' + d.observacion + '</p>' : '') + '</div>';
                contEv++;
            }
        });

        // Build firmas extra
        var firmaJefeImg = '', firmaJefeNombre = '', firmaPlannerImg = '', firmaPlannerNombre = '';
        detallesArr.forEach(function(d) {
            if (d.categoria !== 'FIRMAS_EXTRA') return;
            if (d.item === 'Jefe de Taller') { firmaJefeImg = signedMap[d.foto] || d.foto || ''; firmaJefeNombre = d.estado || ''; }
            if (d.item === 'Planner de Mant.') { firmaPlannerImg = signedMap[d.foto] || d.foto || ''; firmaPlannerNombre = d.estado || ''; }
        });

        var inspUrlFirma = (insp.url_firma && signedMap[insp.url_firma]) ? signedMap[insp.url_firma] : (insp.url_firma || '');
        var logoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';

        var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Inspección - ' + (insp.placa||'') + '</title>'
            + '<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap" rel="stylesheet">'
            + '<style>'
            + ':root{--blue-header:#0053b3;--blue-num:#4a86e8;}'
            + '*{font-family:"Oswald",sans-serif!important;box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}'
            + 'body{background-color:#e0e0e0;margin:0;padding:20px;}'
            + '#btnPrint{position:fixed;top:20px;right:20px;background-color:#000;color:#fff;border:none;padding:8px 16px;border-radius:4px;font-size:14px;cursor:pointer;box-shadow:0 2px 5px rgba(0,0,0,0.3);z-index:1000;}'
            + '#btnPrint:hover{opacity:0.9;}'
            + '.page-container{width:210mm;min-height:296mm;background:white;padding:5mm 10mm;box-sizing:border-box;box-shadow:0 0 15px rgba(0,0,0,0.2);position:relative;display:flex;flex-direction:column;margin:0 auto 20px;}'
            + '.iso-header{width:100%;border-collapse:collapse;border:2px solid #000;margin-bottom:-2px;table-layout:fixed;flex-shrink:0;}'
            + '.iso-header td{border:1px solid #000;text-align:center;vertical-align:middle;}'
            + '.logo-cell{width:20%;padding:2px;} .title-cell{width:55%;font-size:24px;font-weight:bold;line-height:1;text-transform:uppercase;color:#000;}'
            + '.sub-title{font-size:12px;font-weight:normal;color:#333;letter-spacing:1px;}'
            + '.qms-item{width:25%;font-size:10px;text-align:left!important;padding:1px 4px;height:16px;}'
            + '.data-grid{width:100%;border-collapse:collapse;border:2px solid #000;margin-bottom:4px;table-layout:fixed;flex-shrink:0;}'
            + '.data-grid td{border:1px solid #000;padding:1px 4px;font-size:11px;font-weight:bold;height:20px;vertical-align:middle;}'
            + '.col-left{width:35%;} .col-mid{width:35%;} .col-right{width:30%;vertical-align:top!important;padding-top:2px!important;}'
            + '.val-normal{font-weight:normal;margin-left:3px;} .val-blue{color:var(--blue-num);font-size:13px;margin-left:3px;}'
            + '.table-wrapper{flex-grow:1;display:flex;flex-direction:column;margin-bottom:5px;}'
            + '.checklist-table{width:100%;flex-grow:1;border-collapse:collapse;border:2px solid #000;font-size:8.5px;}'
            + '.checklist-table th{background-color:var(--blue-header);color:white;text-transform:uppercase;padding:2px;border:1px solid #000;text-align:left;}'
            + '.checklist-table th.th-center{text-align:center;}'
            + '.checklist-table td{border:1px solid #000;padding:0px 2px;vertical-align:middle;}'
            + '.sec-row td{background-color:#f2f2f2;font-weight:bold;border-top:2px solid #000;padding:1px 3px;}'
            + '.w-crit{width:45%;} .w-chk{width:10%;text-align:center;padding:0;} .w-obs{width:35%;}'
            + '.chk-icon { display:inline-block; width:14px; height:14px; border:1px solid #000; line-height:14px; text-align:center; font-size:11px; font-weight:bold; margin-top:2px; }'
            + '.chk-green { background-color:#dcfce7; color:#16a34a; border-color:#16a34a; }'
            + '.chk-red { background-color:#fee2e2; color:#dc2626; border-color:#dc2626; }'
            + '.footer{flex-shrink:0;display:flex;justify-content:center;align-items:flex-end;padding:0 10px;margin-top:auto;padding-top:30px;}'
            + '.sign-box{width:30%;text-align:center;} .sign-line{border-top:2px solid #000;margin-bottom:2px;} .sign-label{font-weight:bold;font-size:11px;}'
            + '.sign-img{max-height:40px;max-width:100%;display:block;margin:0 auto 2px;}'
            + '.evidencias-section{page-break-before:always;margin-top:20px;}'
            + '.pdf-evidencias-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px;width:100%;}'
            + '@media print{'
            + '  @page{size:A4;margin:0;}'
            + '  body{background:none;padding:0;margin:0;}'
            + '  #btnPrint{display:none;}'
            + '  .page-container{width:210mm;height:296mm;padding:5mm 10mm;box-shadow:none;border:none;margin:0;display:flex;}'
            + '  .table-wrapper{flex-grow:1;margin-bottom:0;}'
            + '  .footer{padding-top:8px;margin-top:auto;page-break-inside:avoid;}'
            + '}'
            + '</style></head><body>'
            + '<button id="btnPrint" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>'
            + '<div class="page-container">'
            + '<table class="iso-header"><tr><td class="logo-cell" rowspan="3"><img src="' + logoUrl + '" alt="Logo" style="max-width:100%;max-height:45px;object-fit:contain;"></td>'
            + '<td class="title-cell" rowspan="3">INSPECCIÓN DE PRE USO DE UNIDAD<br><span class="sub-title">REPORTE DE FALLAS MECÁNICAS</span></td>'
            + '<td class="qms-item"><b>CÓDIGO:</b> F-MAN-003</td></tr>'
            + '<tr><td class="qms-item"><b>VERSIÓN:</b> 0</td></tr>'
            + '<tr><td class="qms-item"><b>F. EMISIÓN:</b> 10/11/2025</td></tr></table>'
            + '<table class="data-grid"><tr><td class="col-left">Nº de Reporte: <span class="val-blue">' + (insp.id||'') + '</span></td><td class="col-mid">Placa: <span class="val-normal">' + (insp.placa||'') + '</span></td><td class="col-right" rowspan="2">Rampa:<br><span class="val-normal">' + rampaPdf + '</span></td></tr>'
            + '<tr><td>Fecha de Ingreso: <span class="val-normal">' + (fIng||'') + '</span></td><td>Kilometraje: <span class="val-normal">' + (insp.km_tablero||'-') + '</span></td></tr></table>'
            + '<div class="table-wrapper"><table class="checklist-table"><thead><tr><th class="w-crit">CRITERIOS</th><th class="w-chk th-center">B</th><th class="w-chk th-center">M</th><th class="w-obs th-center">OBSERVACION</th></tr></thead><tbody>' + tbody + '</tbody></table></div>'
            + '<div class="footer">'
            + '<div class="sign-box">' + (inspUrlFirma && inspUrlFirma.length > 100 ? '<img class="sign-img" src="' + inspUrlFirma + '">' : '') + '<div class="sign-line"></div><div class="sign-label">Técnico Inspector<br><span style="font-weight:normal;">' + (insp.tecnico||'') + '</span></div></div>'
            + '</div></div>';

        // Evidencias page
        if (htmlEvidencias) {
            html += '<div class="page-container evidencias-section">'
                + '<div style="background-color:#0053b3;color:white;font-size:12px;font-weight:bold;text-align:center;border:2px solid #000;padding:4px;text-transform:uppercase;margin-bottom:10px;">EVIDENCIA FOTOGRÁFICA</div>'
                + '<div class="pdf-evidencias-grid">' + htmlEvidencias + '</div></div>';
        }

        html += '</body></html>';

        var win = window.open('', '_blank');
        win.document.open();
        win.document.write(html);
        win.document.close();
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
    isNew = !idInsp;

    let fecha = document.getElementById('i_fecha').value;
    let placa = document.getElementById('i_placa').value.toUpperCase();
    let km = document.getElementById('i_kmtablero').value;
    let cliente = document.getElementById('i_cliente').value;
    let tecnico = document.getElementById('i_tecnico').value;
    let iDias = document.getElementById('i_dias'); let dias = iDias ? (iDias.value || '30') : '30';

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

    let canvasFirmaLoc = document.getElementById('canvasFirma');
    let isBlank = false;
    if (canvasFirmaLoc) {
        let canvasVacio = document.createElement('canvas');
        canvasVacio.width = canvasFirmaLoc.width;
        canvasVacio.height = canvasFirmaLoc.height;
        isBlank = (canvasFirmaLoc.toDataURL("image/png") === canvasVacio.toDataURL("image/png"));
    }

    let firmaData = "";
    if (canvasFirmaLoc && !isBlank) {
        firmaData = canvasFirmaLoc.toDataURL("image/png");
    } else if (window._currentEditSignature) {
        firmaData = window._currentEditSignature;
    }

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
                let finalId = isNew ? r.id : idInsp;
                let offEl = document.getElementById('drawerInspeccion');
                if (offEl) {
                    offEl.classList.remove("open");
                }
                if (window.dataGlobalInspecciones) {
                    let existing = window.dataGlobalInspecciones.find(x => x.id === finalId);
                    if (!existing) {
                        window.dataGlobalInspecciones.push({
                            id: finalId, placa: placa, tecnico: tecnico, fecha_ingreso: fecha, detalles_json: JSON.stringify(detalles), url_firma: firmaData
                        });
                    } else {
                        existing.placa = placa;
                        existing.tecnico = tecnico;
                        existing.fecha_ingreso = fecha;
                        existing.detalles_json = JSON.stringify(detalles);
                        if (firmaData && firmaData.length > 100) existing.url_firma = firmaData;
                    }
                }
                recargarModulo('statusMant');
                if (typeof window.rotAbrirDetalle === 'function' && idOt) {
                    window.rotAbrirDetalle(idOt);
                }
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
    
    // Tarjeta 1: Registro Fijo (Bento Card)
    html += `
    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
        <div class="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
            <span class="badge bg-primary bg-opacity-10 text-primary rounded-pill px-2.5 py-1 fw-bold" style="font-size:0.75rem;">
                <i class="bi bi-card-checklist me-1"></i> 1. DATOS DE REGISTRO
            </span>
        </div>
        <div class="row g-2">
            <div class="col-md-6 col-12">
                <label class="form-label fw-bold" style="font-size:0.72rem; color:#475569; text-transform:uppercase; margin-bottom:3px;">N° Registro</label>
                <input type="text" class="form-control form-control-sm bg-light text-uppercase fw-semibold" id="i_id_inspeccion_show" readonly placeholder="Automático" style="border-radius:8px; font-size:0.82rem;">
            </div>
            <div class="col-md-6 col-12">
                <label class="form-label fw-bold" style="font-size:0.72rem; color:#475569; text-transform:uppercase; margin-bottom:3px;">Fecha de Ingreso</label>
                <input type="date" class="form-control form-control-sm bg-white" id="i_fecha" required style="border-radius:8px; font-size:0.82rem;">
            </div>
            <div class="col-md-6 col-12">
                <label class="form-label fw-bold" style="font-size:0.72rem; color:#475569; text-transform:uppercase; margin-bottom:3px;">
                    <i class="bi bi-truck me-1 text-primary"></i> Placa de Unidad *
                </label>
                <div class="position-relative">
                    <input type="text" id="i_placa-txt" class="form-control form-control-sm bg-white fw-bold"
                           placeholder="BUSCAR PLACA..." autocomplete="off" required
                           style="text-transform:uppercase; border-radius:8px; font-size:0.82rem;"
                           oninput="this.value=this.value.toUpperCase();window._cbFiltrar('i_placa')"
                           onfocus="window._cbFiltrar('i_placa')"
                           onblur="window._cbHide('i_placa')">
                    <input type="hidden" id="i_placa" name="i_placa">
                    <div id="i_placa-dd" class="cb-dropdown shadow-sm" style="border-radius:10px; font-size:0.82rem;"></div>
                </div>
            </div>
            <div class="col-md-6 col-12">
                <label class="form-label fw-bold" style="font-size:0.72rem; color:#475569; text-transform:uppercase; margin-bottom:3px;">Kilometraje de Tablero</label>
                <input type="number" class="form-control form-control-sm bg-white fw-semibold" id="i_kmtablero" placeholder="Ej: 150000" style="border-radius:8px; font-size:0.82rem;">
            </div>
            <div class="col-md-6 col-12">
                <label class="form-label fw-bold" style="font-size:0.72rem; color:#475569; text-transform:uppercase; margin-bottom:3px;">Cliente / Operación</label>
                <input type="text" class="form-control form-control-sm bg-light fw-medium" id="i_cliente" readonly style="border-radius:8px; font-size:0.82rem;">
            </div>
            <div class="col-md-6 col-12">
                <label class="form-label fw-bold" style="font-size:0.72rem; color:#475569; text-transform:uppercase; margin-bottom:3px;">Tipo de Unidad</label>
                <input type="text" class="form-control form-control-sm bg-light text-uppercase fw-medium" id="i_modelo" readonly style="border-radius:8px; font-size:0.82rem;">
            </div>
            <div class="col-md-6 col-12">
                <label class="form-label fw-bold" style="font-size:0.72rem; color:#475569; text-transform:uppercase; margin-bottom:3px;">
                    <i class="bi bi-geo-alt-fill me-1 text-danger"></i> Kilometraje GPS
                </label>
                <input type="number" class="form-control form-control-sm bg-light fw-medium" id="i_kmgps" readonly placeholder="Calculando..." style="border-radius:8px; font-size:0.82rem;">
            </div>
            <div class="col-md-6 col-12 d-flex flex-column justify-content-end">
                <div class="form-check form-switch p-2 bg-light rounded-3 border d-flex align-items-center gap-2 mb-1" style="min-height:38px;">
                    <input class="form-check-input ms-0 me-2" type="checkbox" id="chk_30dias" checked onchange="document.getElementById('i_dias_container').style.display = this.checked ? 'none' : 'block'; document.getElementById('i_dias').value = this.checked ? '30' : '';" style="cursor:pointer;">
                    <label class="form-check-label fw-bold text-dark mb-0" style="font-size:0.78rem; cursor:pointer;" for="chk_30dias">Válido por 30 Días</label>
                </div>
                <div id="i_dias_container" style="display: none;" class="mt-1">
                    <input type="number" class="form-control form-control-sm bg-white" id="i_dias" value="30" placeholder="Días vigencia" style="border-radius:8px; font-size:0.82rem;">
                </div>
            </div>
        </div>
    </div>`;

    // Tarjetas Dinámicas de Categorías (Bento Cards)
    (window.DYNAMIC_INSP_SCHEMA || []).forEach((sec, i) => {
        let secNum = i + 2;
        let secTitle = (sec.tab || '').toUpperCase();
        html += `
        <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                <span class="badge bg-light text-dark border rounded-pill px-2.5 py-1 fw-bold d-inline-flex align-items-center gap-1.5" style="font-size:0.75rem;">
                    <i class="bi bi-ui-checks-grid text-primary"></i> ${secNum}. ${secTitle}
                </span>
                <small class="text-muted" style="font-size:0.7rem;">${(sec.items || []).length} ítems</small>
            </div>
            <div>`;
                
        (sec.items || []).forEach((item, j) => {
            let lbl = typeof item === 'string' ? item : item.label; 
            let t = typeof item === 'string' ? 'okfalla' : item.type; 
            let uid = `p_${i}_${j}`;
            let isLast = j === sec.items.length - 1;
            
            html += `
            <div class="mb-3 ${isLast ? '' : 'pb-3 border-bottom'}" style="border-color:#f1f5f9 !important;">
                <label class="fw-bold text-dark d-block mb-2" style="font-size:0.84rem; letter-spacing:-0.01em;">${lbl}</label>`;

            if (t === 'okfalla') {
                html += `
                <div class="d-flex gap-2 w-100 position-relative">
                    <input type="radio" class="btn-check" name="${uid}" id="${uid}_ok" value="OK" onclick="toggleRadioOkFalla(this, 'f_${uid}', false)">
                    <label class="btn btn-sm btn-outline-success fw-bold flex-grow-1 rounded-3 py-2 d-flex align-items-center justify-content-center gap-1.5 shadow-2xs" 
                           for="${uid}_ok" style="font-size:0.78rem; border-width:1.5px; text-transform:uppercase;">
                        <i class="bi bi-check-circle-fill"></i> OK
                    </label>
                    <input type="radio" class="btn-check" name="${uid}" id="${uid}_fa" value="FALLA" onclick="toggleRadioOkFalla(this, 'f_${uid}', true)">
                    <label class="btn btn-sm btn-outline-danger fw-bold flex-grow-1 rounded-3 py-2 d-flex align-items-center justify-content-center gap-1.5 shadow-2xs" 
                           for="${uid}_fa" style="font-size:0.78rem; border-width:1.5px; text-transform:uppercase;">
                        <i class="bi bi-exclamation-triangle-fill"></i> FALLA
                    </label>
                </div>
                <div id="f_${uid}" style="display:none;" class="mt-2.5 p-3 bg-danger bg-opacity-10 rounded-3 border border-danger border-opacity-25 shadow-2xs">
                    <label class="form-label text-danger fw-bold mb-1 d-flex align-items-center gap-1" style="font-size:0.75rem;">
                        <i class="bi bi-pencil-square"></i> Detalle de la Falla / Observación
                    </label>
                    <textarea class="form-control form-control-sm mb-2 border-danger bg-white" rows="2" id="obs_${uid}" 
                              placeholder="Describe el defecto, anomalía o recomendación..." style="border-radius:8px; font-size:0.8rem;"></textarea>
                    <label class="form-label text-danger fw-bold mb-1 d-flex align-items-center gap-1" style="font-size:0.75rem;">
                        <i class="bi bi-camera-fill"></i> Evidencia Fotográfica (Opcional)
                    </label>
                    <input type="file" class="form-control form-control-sm border-danger bg-white" id="foto_${uid}" accept="image/*" style="border-radius:8px; font-size:0.75rem;">
                </div>`;
            } else if (t === 'percent') {
                html += `
                <input type="hidden" id="val_${uid}" value="">
                <div class="d-flex flex-wrap gap-1">`;
                [10,20,30,40,50,60,70,80,90,100].forEach(pct => { 
                    html += `<button type="button" class="btn btn-outline-primary btn-sm fw-bold pct-btn pct-${uid} flex-grow-1 shadow-2xs" 
                                     style="border-radius:6px; min-width:40px; font-size:0.75rem; padding:4px 6px;" 
                                     onclick="seleccionarPorcentaje('${uid}', ${pct}, this)">${pct}%</button>`; 
                });
                html += `</div>`;
            } else if (t === 'text') {
                html += `<textarea class="form-control form-control-sm bg-white border" rows="2" id="txt_${uid}" 
                                   placeholder="Ingresa los comentarios o medidas..." style="border-radius:8px; text-transform:uppercase; font-size:0.8rem; font-weight:600;"></textarea>`;
            }
            html += `</div>`;
        });
        html += `</div></div>`;
    });

    // Tarjeta Final: Firma del Técnico Inspector
    let firmNum = (window.DYNAMIC_INSP_SCHEMA || []).length + 2;
    html += `
    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
        <div class="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
            <span class="badge bg-purple bg-opacity-10 text-purple rounded-pill px-2.5 py-1 fw-bold" style="color:#7c3aed; background:rgba(124,58,237,0.1); font-size:0.75rem;">
                <i class="bi bi-pen-fill me-1"></i> ${firmNum}. FIRMA Y VALIDACIÓN TÉCNICA
            </span>
        </div>
        <div>
            <div class="mb-3">
                <label class="form-label fw-bold" style="font-size:0.72rem; color:#475569; text-transform:uppercase; margin-bottom:3px;">Técnico Inspector *</label>
                <div class="position-relative">
                    <input type="text" class="form-control form-control-sm bg-white fw-bold" id="i_tecnico-txt" 
                           placeholder="BUSCAR O INGRESAR TÉCNICO..." autocomplete="off" 
                           oninput="this.value=this.value.toUpperCase();window._cbFiltrar('i_tecnico')" 
                           onfocus="window._cbFiltrar('i_tecnico')" 
                           onblur="window._cbHide('i_tecnico')" required 
                           style="text-transform:uppercase; border-radius:8px; font-size:0.82rem;">
                    <input type="hidden" id="i_tecnico">
                    <div id="i_tecnico-dd" class="cb-dropdown shadow-sm" style="border-radius:10px; font-size:0.82rem;"></div>
                </div>
            </div>
            <div>
                <label class="form-label fw-bold d-flex align-items-center justify-content-between" style="font-size:0.72rem; color:#475569; text-transform:uppercase; margin-bottom:4px;">
                    <span><i class="bi bi-pen me-1 text-primary"></i> Trazo de Firma del Inspector</span>
                    <button type="button" class="btn btn-link p-0 text-danger fw-bold text-decoration-none" style="font-size:0.72rem;" onclick="limpiarFirmaCanvas('canvasFirma')">
                        <i class="bi bi-eraser me-1"></i> Limpiar firma
                    </button>
                </label>
                <canvas id="canvasFirma" class="firma-pad shadow-2xs border rounded-3 w-100" style="height: 140px; background:#f8fafc; cursor:crosshair;"></canvas>
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
    
    setTimeout(function() {
        if(typeof window.initFirmaCanvas === 'function') {
            window.initFirmaCanvas('canvasFirma');
        } else if(typeof initFirma === 'function') { initFirma(); }
    }, 500);
};

window.initFirmaCanvas = function(id) {
    let cvs = document.getElementById(id);
    if (!cvs) return;
    let ctx = cvs.getContext('2d');
    cvs.width = cvs.offsetWidth || 300;
    cvs.height = cvs.offsetHeight || 150;
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#000000';
    let drawing = false;

    function getPos(e) {
        let rect = cvs.getBoundingClientRect();
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        }
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function start(e) { drawing = true; draw(e); }
    function stop() { drawing = false; ctx.beginPath(); }
    function draw(e) {
        if (!drawing) return;
        e.preventDefault();
        let pos = getPos(e);
        ctx.lineTo(pos.x, pos.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    }

    cvs.onmousedown = start; cvs.onmouseup = stop; cvs.onmousemove = draw; cvs.onmouseout = stop;
    cvs.addEventListener('touchstart', start, {passive: false});
    cvs.addEventListener('touchend', stop);
    cvs.addEventListener('touchmove', draw, {passive: false});
};

window.limpiarFirmaCanvas = function(id) {
    let cvs = document.getElementById(id);
    if (!cvs) return;
    let ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);
};

window.abrirModalNuevaInspeccion = async function (placaPreselect, idOtPreselect, kmPreselect) {
    if (!document.getElementById('drawerInspeccion')) {
        if (typeof window.rotToast === 'function') window.rotToast("Cargando formulario...", "bg-info");
        fetch('/modulos/mantenimiento/inspecciones/vista.html')
            .then(r => r.text())
            .then(html => {
                let tmp = document.createElement('div');
                tmp.innerHTML = html;
                let drawer = tmp.querySelector('#drawerInspeccion');
                if (drawer) {
                    document.body.appendChild(drawer);
                    window.abrirModalNuevaInspeccion(placaPreselect, idOtPreselect, kmPreselect);
                } else {
                    alert("No se encontró la vista de Inspecciones.");
                }
            })
            .catch(e => console.error(e));
        return;
    }

    await window.ensureInspConfig();
    window.renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');
    if (formEl) formEl.reset();
    
    let idInput = document.getElementById('i_id_inspeccion');
    if (idInput) idInput.value = "";

    let maxId = 0;
    let year = new Date().getFullYear();
    
    try {
        let res = await fetch('/api/script/obtenerDatosInspecciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args: [] })
        });
        let data = await res.json();
        if (data.data) {
            window.dataGlobalInspecciones = data.data;
        }
    } catch (e) {
        console.warn("No se pudo actualizar inspecciones", e);
    }

    if (window.dataGlobalInspecciones && window.dataGlobalInspecciones.length > 0) {
        window.dataGlobalInspecciones.forEach(row => {
            let parts = (row.id || '').split('-');
            if (parts.length === 3 && parts[1] == year) {
                let num = parseInt(parts[2], 10);
                if (num > maxId) maxId = num;
            }
        });
    }
    let showInput = document.getElementById('i_id_inspeccion_show');
    if (showInput) {
        showInput.value = "INSP-" + year + "-" + String(maxId + 1).padStart(4, '0');
    }

    let idOtInput = document.getElementById('i_id_ot');
    let inspHeaderLbl = document.getElementById('insp-header-ot-lbl');
    if (inspHeaderLbl) inspHeaderLbl.textContent = idOtPreselect ? "OT: " + idOtPreselect : "";
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

    setTimeout(() => {
        document.getElementById('i_placa').value = placaPreselect || "";
        let txtPla = document.getElementById('i_placa-txt');
        if(txtPla) txtPla.value = placaPreselect || "";
        window.autocompletarInfoInsp();

        let diasPrevios = "30";
        if (placaPreselect && dataGlobalInspecciones && dataGlobalInspecciones.length > 0) {
            let normalizeStr = (str) => (str || '').toString().trim().toUpperCase();
            let numId = (id) => {
                if (!id) return 0;
                let parts = id.toString().split('-');
                if (parts.length > 2 && parts[1].length === 4) { return parseInt(parts[1] + parts[2] + parts[3]) || 0; }
                return parseInt(parts[1]) || 0;
            };
            let inspOrd = [...dataGlobalInspecciones].sort((a, b) => numId(b.id) - numId(a.id));
            let prevInsp = inspOrd.find(i => normalizeStr(i.placa) === normalizeStr(placaPreselect));
            if (prevInsp && prevInsp.dias_propuestos) diasPrevios = prevInsp.dias_propuestos.toString();
        }

        let chk30 = document.getElementById('chk_30dias');
        let inputDias = document.getElementById('i_dias');
        let containerDias = document.getElementById('i_dias_container');
        if(diasPrevios == "30") {
            if(chk30) chk30.checked = true;
            if(containerDias) containerDias.style.display = 'none';
        } else {
            if(chk30) chk30.checked = false;
            if(containerDias) containerDias.style.display = 'block';
            if(inputDias) inputDias.value = diasPrevios;
        }

        let titleEl = document.querySelector('#drawerInspeccion h5');
        let indicator = document.getElementById('ot-linked-indicator');
        if (!indicator && titleEl) {
            indicator = document.createElement('span');
            indicator.id = 'ot-linked-indicator';
            indicator.className = 'badge ms-2 shadow-sm';
            indicator.style.backgroundColor = '#e0f2fe';
            indicator.style.color = '#0284c7';
            indicator.style.fontSize = '0.75rem';
            indicator.style.fontWeight = 'bold';
            indicator.style.border = '1px solid #7dd3fc';
            titleEl.appendChild(indicator);
        }
        if (indicator) {
            if (idOtPreselect) {
                indicator.innerHTML = `<i class="bi bi-link-45deg"></i> Vinculada a OT: ${idOtPreselect}`;
                indicator.style.display = 'inline-block';
            } else {
                indicator.style.display = 'none';
            }
        }
    }, 50);

    let offEl = document.getElementById('drawerInspeccion');
    if (offEl) {
        if (offEl.parentElement !== document.body) {
            document.body.appendChild(offEl);
        }
        offEl.style.zIndex = '1150';
        offEl.classList.add("open");
    }
};

window.abrirModalEditarInspeccion = async function (idBusqueda) {
    if (!document.getElementById('drawerInspeccion')) {
        if (typeof window.rotToast === 'function') window.rotToast("Cargando formulario...", "bg-info");
        fetch('/modulos/mantenimiento/inspecciones/vista.html')
            .then(r => r.text())
            .then(html => {
                let tmp = document.createElement('div');
                tmp.innerHTML = html;
                let drawer = tmp.querySelector('#drawerInspeccion');
                if (drawer) {
                    document.body.appendChild(drawer);
                    window.abrirModalEditarInspeccion(idBusqueda);
                } else {
                    alert("No se encontró la vista de Inspecciones.");
                }
            })
            .catch(e => console.error(e));
        return;
    }

    let insp = dataGlobalInspecciones.find(i => i.id === idBusqueda);
    if (!insp) return;

    await window.ensureInspConfig();
    window.renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');
    if(formEl) formEl.reset();
    
    let idInput = document.getElementById('i_id_inspeccion');
    if(idInput) idInput.value = insp.id;
    
    let idShow = document.getElementById('i_id_inspeccion_show');
    if(idShow) idShow.value = insp.id;

    window._currentEditSignature = insp.url_firma || "";

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
    if (document.getElementById('i_tecnico-txt')) document.getElementById('i_tecnico-txt').value = insp.tecnico || "";
    
    let diasPropuestos = insp.dias_propuestos || "30";
    let chk30 = document.getElementById('chk_30dias');
    let inputDias = document.getElementById('i_dias');
    let contDias = document.getElementById('i_dias_container');
    if (chk30 && inputDias && contDias) {
        if (diasPropuestos == "30") {
            chk30.checked = true;
            contDias.style.display = 'none';
            inputDias.value = "30";
        } else {
            chk30.checked = false;
            contDias.style.display = 'block';
            inputDias.value = diasPropuestos;
        }
    } else if (inputDias) {
        inputDias.value = diasPropuestos;
    }

    window.autocompletarInfoInsp();

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
                                    let caja = document.getElementById(`f_${uid}`);
                                    if (caja) caja.style.display = 'block';
                                    if (res.observacion) document.getElementById(`obs_${uid}`).value = res.observacion;
                                }
                            }
                        } else if (t === 'percent') {
                            let val = res.estado.replace('%', '');
                            let inpVal = document.getElementById(`val_${uid}`);
                            if (inpVal) inpVal.value = val;
                            document.querySelectorAll(`.pct-${uid}`).forEach(b => {
                                if (b.textContent.trim() === res.estado || b.textContent.trim() === val + '%') {
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


    let offEl = document.getElementById('drawerInspeccion');
    if (offEl) {
        if (offEl.parentElement !== document.body) {
            document.body.appendChild(offEl);
        }
        offEl.style.zIndex = '1150';
        offEl.classList.add("open");
    }
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

    fetch('/api/script/eliminarDocumento', {
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
        .then(function (r) {
            // Guardar en variable local Y en window para acceso externo
            dataGlobalInspecciones = r.data || [];
            window._dataGlobalInspeccionesRaw = dataGlobalInspecciones;
            mostrarStatusInspecciones(dataGlobalInspecciones);
        })
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
            let mod = document.getElementById('modalConfigInsp');
            if (mod && mod.parentElement !== document.body) {
                document.body.appendChild(mod);
            }
            new bootstrap.Modal(mod).show();
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

window.toggleRadioOkFalla = function(el, cajaId, isFalla) {
    let caja = document.getElementById(cajaId);
    if (!caja) return;
    
    if (el.dataset.chk === '1') {
        el.checked = false;
        el.dataset.chk = '0';
        caja.style.display = 'none';
    } else {
        let group = document.querySelectorAll(`input[name="${el.name}"]`);
        group.forEach(r => r.dataset.chk = '0');
        el.dataset.chk = '1';
        caja.style.display = isFalla ? 'block' : 'none';
    }
};

// ==========================================
// 🚀 MÓDULO DE FRENOS
// ==========================================

window.abrirModalFrenos = async function(placaPrevia) {
    let modalEl = document.getElementById('modalRegistrarFrenos');
    if (modalEl && modalEl.parentElement !== document.body) {
        document.body.appendChild(modalEl);
    }
    let form = document.getElementById('formRegistroFrenos');
    if (form) form.reset();
    
    // Si no hay placas cargadas, cargarlas
    if (!window.dataGlobalPlacas || window.dataGlobalPlacas.length === 0) {
        try {
            let r = await fetch('/api/script/obtenerPlacas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) }).then(res => res.json());
            if (r && r.data) window.dataGlobalPlacas = r.data;
        } catch(e) {}
    }
    
    let listPlacasFrenos = (window.dataGlobalPlacas || [])
        .map(function(p){ return (p[0]||'').trim().toUpperCase(); })
        .filter(function(p,i,a){ return p && p !== 'PLACA' && a.indexOf(p) === i; })
        .sort();
    
    if (typeof window._cbInit === 'function') {
        window._cbInit('rf-placa', listPlacasFrenos, 'BUSCAR PLACA...');
        window._cbOnSelect('rf-placa', function(val) {
            let txt = document.getElementById('rf-placa-txt');
            if (txt) txt.value = val;
            let hd = document.getElementById('rf-placa');
            if (hd) hd.value = val;
        });

        let opcionesTecnicos = new Set();
        if (window.dataGlobalUsuarios) window.dataGlobalUsuarios.forEach(u => { if(u[1]) opcionesTecnicos.add(u[1]); });
        if (window.dataGlobalInspecciones) window.dataGlobalInspecciones.forEach(i => { if(i.tecnico) opcionesTecnicos.add(i.tecnico); });
        
        let cacheCond = (window.CACHE && window.CACHE.conductores) ? window.CACHE.conductores : window.dataGlobalConductores;
        
        if (cacheCond && cacheCond.length > 0) {
            cacheCond.forEach(c => { if(c.nombre) opcionesTecnicos.add(c.nombre); });
            window._cbInit('rf-tecnico', Array.from(opcionesTecnicos).sort(), 'BUSCAR TÉCNICO...');
        } else {
            window._cbInit('rf-tecnico', Array.from(opcionesTecnicos).sort(), 'CARGANDO DIRECTORIO...');
            fetch('/api/conductores')
                .then(r => r.ok ? r.json() : [])
                .then(data => {
                    window.CACHE = window.CACHE || {};
                    window.CACHE.conductores = data;
                    window.dataGlobalConductores = data;
                    data.forEach(c => { if(c.nombre) opcionesTecnicos.add(c.nombre); });
                    window._cbInit('rf-tecnico', Array.from(opcionesTecnicos).sort(), 'BUSCAR TÉCNICO...');
                })
                .catch(e => window._cbInit('rf-tecnico', Array.from(opcionesTecnicos).sort(), 'BUSCAR TÉCNICO...'));
        }

        window._cbOnSelect('rf-tecnico', function(val) {
            let txt = document.getElementById('rf-tecnico-txt');
            if (txt) txt.value = val;
            let hd = document.getElementById('rf-tecnico');
            if (hd) hd.value = val;
        });
    }

    let inputPlaca = document.getElementById('rf-placa-txt');
    if (inputPlaca) {
        inputPlaca.value = '';
        inputPlaca.addEventListener('input', function() { document.getElementById('rf-placa').value = this.value; }, { once: true });
    }
    let inputTec = document.getElementById('rf-tecnico-txt');
    if (inputTec) {
        inputTec.value = '';
        inputTec.addEventListener('input', function() { document.getElementById('rf-tecnico').value = this.value; }, { once: true });
    }
    document.getElementById('rf-placa').value = '';
    document.getElementById('rf-tecnico').value = '';

    if (placaPrevia && typeof placaPrevia === 'string') {
        let pUpper = placaPrevia.trim().toUpperCase();
        if (inputPlaca) inputPlaca.value = pUpper;
        let hdPlaca = document.getElementById('rf-placa');
        if (hdPlaca) hdPlaca.value = pUpper;
    }

    let fechaInput = document.getElementById('rf-fecha');
    if (fechaInput) {
        fechaInput.value = new Date().toISOString().split('T')[0];
    }
    var m = new bootstrap.Modal(modalEl);
    m.show();
};

window.guardarRegistroFrenos = async function() {
    let placa = document.getElementById('rf-placa').value;
    let zapDel = document.getElementById('rf-zap-delantera').value;
    let zap1 = document.getElementById('rf-zap-1eje').value;
    let zap2 = document.getElementById('rf-zap-2eje').value;
    let disco = document.getElementById('rf-disco').value;
    let tecnico = document.getElementById('rf-tecnico').value;
    let obs = document.getElementById('rf-observacion').value;

    if (!placa || !tecnico) {
        alert("La Placa y el Técnico son obligatorios.");
        return;
    }

    let itemsFrenos = [
        { item: "Zapatas Delanteras", type: "porcentaje", estado: zapDel ? zapDel + "%" : "", obs: obs }
    ];
    if (zap1) itemsFrenos.push({ item: "Zapatas 1er Eje Tracción", type: "porcentaje", estado: zap1 + "%", obs: "" });
    if (zap2) itemsFrenos.push({ item: "Zapatas 2do Eje Loca", type: "porcentaje", estado: zap2 + "%", obs: "" });
    if (disco) itemsFrenos.push({ item: "Disco Embrague", type: "porcentaje", estado: disco + "%", obs: "" });

    let payload = {
        placa: placa,
        tecnico: tecnico,
        tipo_inspeccion: 'Solo Frenos',
        detalles_json: JSON.stringify([{ seccion: "Frenos", items: itemsFrenos }]),
        km_tablero: 0,
        fecha_ingreso: document.getElementById('rf-fecha') ? document.getElementById('rf-fecha').value : new Date().toISOString().split('T')[0],
        cliente: "-",
        dias_propuestos: 30,
        id_ot: null
    };

    let btn = document.querySelector('#modalRegistrarFrenos .btn-danger');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    }

    try {
        let res = await fetch('/api/script/guardarInspeccion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ form: payload })
        });
        let json = await res.json();
        if (json.data === 'Éxito') {
            if (typeof rotToast === 'function') rotToast("Inspección de frenos registrada", "bg-success");
            let m = bootstrap.Modal.getInstance(document.getElementById('modalRegistrarFrenos'));
            if(m) m.hide();
            // Recargar TODOS los datos de inspecciones y re-renderizar la tabla de frenos
            fetch('/api/script/obtenerDatosInspecciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
                .then(function(r) { return r.json(); })
                .then(function(r) {
                    dataGlobalInspecciones = r.data || [];
                    window._dataGlobalInspeccionesRaw = dataGlobalInspecciones;
                    if (typeof renderTablaFrenos === 'function') {
                        renderTablaFrenos(dataGlobalInspecciones);
                    }
                })
                .catch(function(e) { console.error('Error recargando frenos:', e); });
        } else {
            alert("Error: " + (json.data || "Error al guardar inspección"));
        }
    } catch (e) {
        console.error(e);
        alert("Error al guardar: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-save"></i> Registrar';
        }
    }
};

window.renderTablaFrenos = async function(todasLasInspecciones) {
    let tbody = document.getElementById('cuerpoTablaFrenos');
    let cardContainer = document.getElementById('frenosMobileContainer');
    if (!tbody && !cardContainer) return;

    // Si no hay datos de placas, intentar cargarlos
    if (!window.dataGlobalPlacas || window.dataGlobalPlacas.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2 text-danger"></span>Cargando datos de flota...</td></tr>';
        if (cardContainer) cardContainer.innerHTML = '<div class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2 text-danger"></span>Cargando datos de flota...</div>';
        try {
            let r = await fetch('/api/script/obtenerPlacas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ args: [] })
            }).then(res => res.json());
            if (r && r.data) window.dataGlobalPlacas = r.data;
        } catch(e) {}
    }

    let arrInspecciones = (todasLasInspecciones && todasLasInspecciones.length) ? todasLasInspecciones : (dataGlobalInspecciones || []);

    // Obtener la inspección más reciente de Frenos por placa (puede ser General con sección Frenos, o "Solo Frenos")
    let frenosMasRecientesPorPlaca = new Map();
    
    // Sort descending by ID — extract trailing number from IDs like 'INSP-2026-0085'
    const extractIdNum = (id) => { const m = String(id || '').match(/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };
    let arrOrdenado = [...arrInspecciones].sort((a, b) => {
        let iA = a.insp || a;
        let iB = b.insp || b;
        return extractIdNum(iB.id) - extractIdNum(iA.id);
    });

    arrOrdenado.forEach(item => {
        let insp = item.insp || item; // Extraer si viene en el wrapper {infoPlaca, insp}
        if (!insp || !insp.placa) return;
        let placaStr = (insp.placa || '').toUpperCase().trim();
        if (frenosMasRecientesPorPlaca.has(placaStr)) return; // Ya tenemos la más reciente
        
        let tieneFrenos = false;
        let dataFrenos = null;
        
        if (insp.tipo_inspeccion === 'Solo Frenos') {
            tieneFrenos = true;
        }
        
        if (insp.detalles_json) {
            try {
                let detalles = typeof insp.detalles_json === 'string' ? JSON.parse(insp.detalles_json) : insp.detalles_json;
                
                // Formato anidado (Solo Frenos)
                let secFrenos = detalles.find(s => {
                    let st = (s.seccion || "").toUpperCase();
                    return st.includes("FRENOS");
                });
                
                if (secFrenos && secFrenos.items && secFrenos.items.length > 0) {
                    tieneFrenos = true;
                    dataFrenos = secFrenos.items;
                } else {
                    // Formato plano (Wizard)
                    let itemsFrenosFlat = detalles.filter(d => {
                        let cat = (d.categoria || "").toUpperCase();
                        return cat.includes("FRENOS");
                    });
                    if (itemsFrenosFlat.length > 0) {
                        tieneFrenos = true;
                        dataFrenos = itemsFrenosFlat;
                    }
                }
            } catch(e) {}
        }

        if (tieneFrenos) {
            frenosMasRecientesPorPlaca.set(placaStr, { insp: insp, dataFrenos: dataFrenos });
        }
    });

    // Construir tabla con placas activas (al igual que Status)
    let htmlDesktop = '';
    let htmlMobile = '';
    let placasActivasEnUso = (window.dataGlobalPlacas || []).filter(p => {
        if ((p[0] || '').toUpperCase() === 'PLACA') return false;
        let estado = (p[18] || p[8] || '').trim().toUpperCase();
        let enUso = (p[22] || p[13] || '').trim().toUpperCase();
        return estado === "ACTIVA" && enUso !== "NO";
    });

    let cont = 1;
    let kpiFrenos = { vigentes: 0, alerta: 0, vencidos: 0, todos: placasActivasEnUso.length };

    // Función para renderizar badge de porcentaje moderno
    let renderBadge = (val) => {
        if (val === "-" || val === "" || String(val).trim().toUpperCase() === "SIN DATOS" || val === null || val === undefined) {
            return `<span class="text-muted small">—</span>`;
        }
        let num = parseInt(val);
        if (isNaN(num)) return `<span class="badge bg-light text-dark border">${val}</span>`;
        
        if (num <= 20) {
            return `<span class="badge rounded-pill fw-bold text-white px-2 py-1 shadow-2xs" style="background:#ef4444; font-size:0.78rem;" title="Crítico: Desgaste severo (${num}%)"><i class="bi bi-exclamation-triangle-fill me-1"></i>${num}%</span>`;
        } else if (num <= 30) {
            return `<span class="badge rounded-pill fw-bold px-2 py-1 shadow-2xs" style="background:#fef08a; color:#854d0e; border:1px solid #fde047; font-size:0.78rem;" title="Alerta: Desgaste próximo (${num}%)"><i class="bi bi-exclamation-circle-fill me-1"></i>${num}%</span>`;
        } else {
            return `<span class="badge rounded-pill fw-bold text-white px-2 py-1 shadow-2xs" style="background:#10b981; font-size:0.78rem;" title="Óptimo (${num}%)"><i class="bi bi-check-circle-fill me-1"></i>${num}%</span>`;
        }
    };

    // Función para renderizar minitarjeta móvil con barra de progreso
    let renderMobileGauge = (label, val) => {
        let num = parseInt(val);
        let color = '#10b981';
        let bgSubtle = '#f0fdf4';
        let textCls = 'text-success';
        let displayVal = isNaN(num) ? '—' : num + '%';
        
        if (!isNaN(num)) {
            if (num <= 20) {
                color = '#ef4444';
                bgSubtle = '#fef2f2';
                textCls = 'text-danger';
            } else if (num <= 30) {
                color = '#ca8a04';
                bgSubtle = '#fefce8';
                textCls = 'text-warning-emphasis';
            }
        }
        
        return `
            <div class="p-2 rounded-3 border" style="background:${bgSubtle}; min-width: 0;">
                <div class="text-secondary text-truncate" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">${label}</div>
                <div class="fw-bolder ${textCls} d-flex align-items-center justify-content-between mt-1" style="font-size:0.86rem;">
                    <span>${displayVal}</span>
                    ${!isNaN(num) ? `<div style="width:24px;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;"><div style="width:${Math.min(100, num)}%;height:100%;background:${color};border-radius:2px;"></div></div>` : ''}
                </div>
            </div>
        `;
    };

    placasActivasEnUso.forEach(p => {
        let placaStr = (p[0] || '').toUpperCase().trim();
        let itemFrenos = frenosMasRecientesPorPlaca.get(placaStr);
        
        let valZapDel = "-", valZap1 = "-", valZap2 = "-", valDisco = "-", obs = "-";
        let tec = "-", fec = "-";
        
        if (itemFrenos) {
            tec = itemFrenos.insp.tecnico || "-";
            if (itemFrenos.insp.fecha_ingreso) {
                let fi = itemFrenos.insp.fecha_ingreso;
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(fi)) {
                    fec = fi;
                } else {
                    let ds = fi.split('T')[0].split('-');
                    if (ds.length === 3) fec = `${ds[2]}/${ds[1]}/${ds[0]}`;
                    else fec = fi;
                }
            }
            if (itemFrenos.dataFrenos) {
                itemFrenos.dataFrenos.forEach(it => {
                    let nom = (it.item || '').toLowerCase();
                    let est = (it.estado || '').replace('%', '').trim();
                    if (nom.includes("delantera") || nom.includes("pastilla")) valZapDel = est;
                    else if (nom.includes("2do eje") || nom.includes("segundo eje") || (nom.includes("loca") && !nom.includes("1er"))) valZap2 = est;
                    else if (nom.includes("1er eje") || nom.includes("primer eje") || nom.includes("tracci")) valZap1 = est;
                    else if (nom.includes("embrague")) valDisco = est;
                    
                    if (it.obs) obs = it.obs;
                });
            }
        }

        let parseNum = (v) => { let n = parseInt(v); return isNaN(n) ? null : n; };
        let zD = parseNum(valZapDel), z1 = parseNum(valZap1), z2 = parseNum(valZap2), di = parseNum(valDisco);
        
        let estadoFrenosRow = "sin_datos";
        let hasData = (zD !== null || z1 !== null || z2 !== null || di !== null);
        if (hasData) {
            let minVal = Math.min(
                zD !== null ? zD : 999,
                z1 !== null ? z1 : 999,
                z2 !== null ? z2 : 999,
                di !== null ? di : 999
            );
            if (minVal <= 20) { kpiFrenos.vencidos++; estadoFrenosRow = "vencidos"; }
            else if (minVal <= 30) { kpiFrenos.alerta++; estadoFrenosRow = "alerta"; }
            else { kpiFrenos.vigentes++; estadoFrenosRow = "vigentes"; }
        }

        // 1. Desktop Row
        htmlDesktop += `
            <tr class="align-middle bg-white border-bottom" data-estado-frenos="${estadoFrenosRow}">
                <td class="text-muted fw-bold text-center ps-3" style="width:45px;">${cont++}</td>
                <td style="white-space:nowrap;"><span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-1" style="font-size:0.84rem; letter-spacing:0.5px;">${placaStr}</span></td>
                <td style="white-space:nowrap;"><span class="text-secondary fw-medium" style="font-size:0.82rem;">${fec}</span></td>
                <td class="text-center" style="white-space:nowrap;">${renderBadge(valZapDel)}</td>
                <td class="text-center" style="white-space:nowrap;">${renderBadge(valZap1)}</td>
                <td class="text-center" style="white-space:nowrap;">${renderBadge(valZap2)}</td>
                <td class="text-center" style="white-space:nowrap;">${renderBadge(valDisco)}</td>
                <td style="white-space:nowrap;"><span class="fw-semibold text-dark text-truncate d-inline-block" style="max-width:150px; font-size:0.82rem;" title="${tec}">${tec}</span></td>
                <td class="text-muted" style="font-size:0.82rem; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${obs}">${obs}</td>
                <td class="pe-3 text-center" style="width:80px;">
                    <button class="btn btn-sm btn-light border shadow-2xs rounded-3 text-danger p-1 d-flex align-items-center justify-content-center mx-auto" onclick="window.abrirModalFrenos('${placaStr}')" title="Registrar Medición para ${placaStr}" style="width:28px; height:28px;">
                        <i class="bi bi-plus-lg"></i>
                    </button>
                </td>
            </tr>
        `;

        // 2. Mobile Card
        htmlMobile += `
            <div class="card mb-2 shadow-2xs border rounded-3 p-3 bg-white" data-estado-frenos="${estadoFrenosRow}" data-placa="${placaStr}">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-1" style="font-size:0.88rem; letter-spacing:0.5px;">${placaStr}</span>
                        <span class="text-secondary small fw-medium">${fec !== '-' ? fec : 'Sin medición'}</span>
                    </div>
                    <div>
                        ${estadoFrenosRow === 'vencidos' ? '<span class="badge rounded-pill bg-danger text-white px-2 py-1 fw-bold" style="font-size:0.68rem;">CRÍTICO (≤20%)</span>' :
                          estadoFrenosRow === 'alerta' ? '<span class="badge rounded-pill bg-warning text-dark px-2 py-1 fw-bold" style="font-size:0.68rem;">ALERTA (21-30%)</span>' :
                          estadoFrenosRow === 'vigentes' ? '<span class="badge rounded-pill bg-success text-white px-2 py-1 fw-bold" style="font-size:0.68rem;">ÓPTIMO (>30%)</span>' :
                          '<span class="badge bg-light text-secondary border px-2 py-1" style="font-size:0.68rem;">SIN REGISTROS</span>'}
                    </div>
                </div>
                
                <div class="grid g-2 mb-2" style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
                    ${renderMobileGauge('Zap. Delantera', valZapDel)}
                    ${renderMobileGauge('Zap. 1er Eje', valZap1)}
                    ${renderMobileGauge('Zap. 2do Eje Loca', valZap2)}
                    ${renderMobileGauge('Disco Embrague', valDisco)}
                </div>

                <div class="d-flex justify-content-between align-items-center pt-2 border-top text-secondary" style="font-size:0.75rem;">
                    <div class="text-truncate me-2" title="${tec}">
                        <i class="bi bi-person-badge text-primary me-1"></i><span class="fw-semibold">${tec !== '-' ? tec : 'No asignado'}</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 rounded-2 fw-semibold d-flex align-items-center gap-1" style="font-size:0.75rem;" onclick="window.abrirModalFrenos('${placaStr}')">
                        <i class="bi bi-plus-circle"></i> Medir
                    </button>
                </div>
            </div>
        `;
    });

    if (placasActivasEnUso.length === 0) {
        htmlDesktop = '<tr><td colspan="10" class="text-center py-5 text-muted"><i class="bi bi-info-circle fs-4 d-block mb-2"></i> No hay unidades activas para monitorear.</td></tr>';
        htmlMobile = '<div class="text-center py-5 text-muted"><i class="bi bi-info-circle fs-3 d-block mb-2"></i> No hay unidades activas para monitorear.</div>';
    }

    if (tbody) tbody.innerHTML = htmlDesktop;
    if (cardContainer) cardContainer.innerHTML = htmlMobile;

    window.frenosKPIData = kpiFrenos;
    window.updateFrenosKPIs();
    if (typeof window.actualizarVistaGraficos === 'function') window.actualizarVistaGraficos();
};

window.updateFrenosKPIs = function() {
    if (!window.frenosKPIData) return;
    let elTodos = document.getElementById('frenos-cnt-todos');
    let elVigentes = document.getElementById('frenos-cnt-vigentes');
    let elAlerta = document.getElementById('frenos-cnt-alerta');
    let elVencidos = document.getElementById('frenos-cnt-vencidos');
    
    if (elTodos) elTodos.innerText = window.frenosKPIData.todos || 0;
    if (elVigentes) elVigentes.innerText = window.frenosKPIData.vigentes || 0;
    if (elAlerta) elAlerta.innerText = window.frenosKPIData.alerta || 0;
    if (elVencidos) elVencidos.innerText = window.frenosKPIData.vencidos || 0;
};

window.filtrarTablaFrenosPorKPI = function(estado, el) {
    let cards = document.querySelectorAll('.kpi-card-frenos');
    let wasActive = el && el.classList.contains('active');
    
    if (cards && cards.length) cards.forEach(c => c.classList.remove('active'));
    
    let targetEstado = estado;
    if (wasActive) {
        targetEstado = 'todos';
    } else if (el) {
        el.classList.add('active');
    }
    
    let rows = document.querySelectorAll('#cuerpoTablaFrenos tr');
    let cont = 1;
    rows.forEach(row => {
        if (!row.hasAttribute('data-estado-frenos')) return;
        
        let rowEstado = row.getAttribute('data-estado-frenos');
        if (targetEstado === 'todos' || rowEstado === targetEstado) {
            row.style.display = '';
            let tdIndex = row.querySelector('td:first-child');
            if (tdIndex) tdIndex.innerText = cont++;
        } else {
            row.style.display = 'none';
        }
    });

    let mobileCards = document.querySelectorAll('#frenosMobileContainer .card');
    mobileCards.forEach(card => {
        if (!card.hasAttribute('data-estado-frenos')) return;
        let cardEstado = card.getAttribute('data-estado-frenos');
        if (targetEstado === 'todos' || cardEstado === targetEstado) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
};

