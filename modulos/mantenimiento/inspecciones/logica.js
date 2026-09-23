// ================================================================
// MÓDULO: INSPECCIONES — análisis de estados y formulario wizard
// Cargado dinámicamente por cargarModuloAislado('mantenimiento/inspecciones')
// ================================================================

window.normalizeStr = window.normalizeStr || function(str) {
    return (str || '').toString().trim().toUpperCase();
};

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
    var btnFre = document.getElementById('btnToggleFrenos');
    var paneGen = document.getElementById('insp-general');
    var paneFre = document.getElementById('insp-frenos');
    var kpisGen = document.getElementById('panelKPIsGenerales');
    var toolsGen = document.getElementById('panelHerramientasStatus');
    var graficosPanel = document.getElementById('panelGraficosStatus');

    if (tab === 'frenos') {
        if (btnFre) {
            btnFre.classList.add('active', 'border-danger', 'bg-danger-subtle', 'text-danger');
            btnFre.classList.remove('bg-white', 'text-secondary');
        }
        if (paneGen) {
            paneGen.classList.remove('show', 'active');
            paneGen.style.display = 'none';
        }
        if (paneFre) {
            paneFre.classList.add('show', 'active');
            paneFre.style.display = 'flex';
        }
        if (kpisGen) kpisGen.style.display = 'none';
        if (toolsGen) toolsGen.style.display = 'none';
        if (graficosPanel) graficosPanel.style.display = 'none';

        if (typeof window.renderTablaFrenos === 'function') {
            window.renderTablaFrenos(dataGlobalInspecciones || window.dataGlobalInspecciones || []);
        }
    } else {
        if (btnFre) {
            btnFre.classList.remove('active', 'border-danger', 'bg-danger-subtle', 'text-danger');
            btnFre.classList.add('bg-white', 'text-secondary');
        }
        if (paneFre) {
            paneFre.classList.remove('show', 'active');
            paneFre.style.display = 'none';
        }
        if (paneGen) {
            paneGen.classList.add('show', 'active');
            paneGen.style.display = 'flex';
        }
        if (kpisGen) kpisGen.style.display = '';
        if (toolsGen) toolsGen.style.display = '';
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

window._inspFiltroCard = 'total';
window._inspFiltroUbicacion = 'todos';

window.filtrarInspCard = function(tipo, cardEl) {
    window._inspFiltroCard = tipo || 'total';
    // Al seleccionar cualquier card, el filtro inferior de ubicación se marca en "todos" por defecto
    window._inspFiltroUbicacion = 'todos';

    // Actualizar clase activa en cards superiores
    document.querySelectorAll('#moduloStatus .ck-kpi-card').forEach(function(el) {
        var cardId = 'insp-kpi-' + (tipo === 'verde' ? 'conformes' : (tipo === 'amarillo' ? 'alerta' : (tipo === 'rojo' ? 'criticas' : 'total')));
        el.classList.toggle('active', el.id === cardId);
    });

    // Resetear segmented control inferior a "todos"
    document.querySelectorAll('#btn-group-estados-insp .ck-segment-item').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-ubicacion') === 'todos');
    });

    filtrarStatusAvanzado();
};

window.filtrarInspUbicacion = function(ubi, btn) {
    window._inspFiltroUbicacion = ubi || 'todos';

    // Actualizar clase activa en segmented control inferior
    document.querySelectorAll('#btn-group-estados-insp .ck-segment-item').forEach(function(b) {
        b.classList.toggle('active', b === btn || b.getAttribute('data-ubicacion') === ubi);
    });

    filtrarStatusAvanzado();
};

window.filtrarInspSemaforoSegment = function(tipo, btn) {
    window.filtrarInspCard(tipo);
};
window.filtrarTablaPorSemaforo = window.filtrarInspCard;

// ── Cache y Helper de Ubicación (Unidades en Base vs Telemetría GPS) ──
window._cacheUnidadesPanorama = window._cacheUnidadesPanorama || [];
window._unidadesBaseMap = window._unidadesBaseMap || new Map();
window._acoplamientoCarretaMap = window._acoplamientoCarretaMap || new Map();

window.cargarDatosUnidadesBase = async function() {
    try {
        const clean = str => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        // Consultar el Panorama 360° en Vivo de Seguridad (fuente de verdad de Unidades en Base y en Ruta)
        const res = await fetch('/api/seguridad/unidades-base/panorama-en-vivo');
        const json = await res.json();
        
        const baseMap = new Map();
        const acoplMap = new Map();

        if (json && json.ok && Array.isArray(json.items || json.panorama)) {
            const list = json.items || json.panorama || [];
            window._cacheUnidadesPanorama = list;
            
            list.forEach(item => {
                const cPlaca = clean(item.placa);
                const cCamion = clean(item.placa_camion);
                const cCarreta = clean(item.placa_carreta);
                
                // Mapear si la carreta está acoplada a un camión
                if (cCarreta && cCamion && cCarreta !== '—' && cCamion !== '—' && cCarreta !== cCamion) {
                    acoplMap.set(cCarreta, cCamion);
                }

                // Determinar si la unidad está en base según Seguridad (Status Operativo)
                const statusOp = String(item.status_operativo || '').toUpperCase().trim();
                const esEnBase = statusOp === 'EN BASE' || statusOp.includes('BASE') || item.esRuta === false;

                if (esEnBase) {
                    if (cPlaca && cPlaca !== '—') baseMap.set(cPlaca, item);
                    if (cCamion && cCamion !== '—') baseMap.set(cCamion, item);
                    if (cCarreta && cCarreta !== '—') baseMap.set(cCarreta, item);
                }
            });
        }

        window._unidadesBaseMap = baseMap;
        window._acoplamientoCarretaMap = acoplMap;
    } catch(e) {
        console.warn('No se pudo cargar panorama de unidades en base:', e);
    }
};

window.asegurarWialonCache = async function() {
    if (typeof CACHE !== 'undefined' && Array.isArray(CACHE.wialon) && CACHE.wialon.length > 0) return;
    try {
        const r = await fetch('/api/script/obtenerDatosWialon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) });
        const res = await r.json();
        if (res && res.data && Array.isArray(res.data)) {
            if (typeof CACHE !== 'undefined') CACHE.wialon = res.data;
        }
    } catch(e) {}
};

window.asegurarNeumaticosInspecciones = async function() {
    if (window.dataGlobalNeumaticos && window.dataGlobalNeumaticos.length > 0) return window.dataGlobalNeumaticos;
    try {
        const r = await fetch('/api/neumaticos/inspecciones?limit=1000');
        const res = await r.json();
        if (res && res.ok && Array.isArray(res.data)) {
            window.dataGlobalNeumaticos = res.data;
            return res.data;
        }
    } catch(e) {
        console.warn("Error cargando inspecciones de neumáticos:", e);
    }
    return [];
};

function obtenerUbicacionUnidad(placa) {
    const clean = str => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const pClean = clean(placa);
    
    // 1. Si está registrada en Base según Status de Seguridad (Panorama 360° en Vivo)
    if (window._unidadesBaseMap && window._unidadesBaseMap.has(pClean)) {
        return {
            tipo: 'base',
            texto: 'En Base',
            badgeHtml: `<span class="badge rounded-pill fw-semibold px-2.5 py-1 text-nowrap" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 0.73rem;"><i class="bi bi-buildings-fill me-1 text-primary"></i>En Base</span>`,
            badgeMobile: `<span class="badge rounded-pill fw-semibold px-2 py-0.5 text-nowrap" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 0.72rem;"><i class="bi bi-buildings-fill me-1 text-primary"></i>En Base</span>`
        };
    }
    
    // 2. Si no está en base -> Está en operación / En Ruta (Camión o Carreta vinculada a su camión con GPS)
    return {
        tipo: 'ruta',
        texto: 'En Ruta',
        badgeHtml: `<span class="badge rounded-pill fw-semibold px-2.5 py-1 text-nowrap" style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-size: 0.73rem;"><i class="bi bi-geo-alt-fill me-1 text-success"></i>En Ruta</span>`,
        badgeMobile: `<span class="badge rounded-pill fw-semibold px-2 py-0.5 text-nowrap" style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-size: 0.72rem;"><i class="bi bi-geo-alt-fill me-1 text-success"></i>En Ruta</span>`
    };
}

function mostrarStatusInspecciones(inspecciones) {
    if (procesadorErroresCuota(inspecciones, 'cuerpoTablaStatus')) return;
    dataGlobalInspecciones = inspecciones;
    
    // Asegurar carga asíncrona de neumáticos para cobertura panorámica
    if (!window.dataGlobalNeumaticos) {
        window.asegurarNeumaticosInspecciones().then(() => {
            if (window.dataFinalInspGlobal && window.dataFinalInspGlobal.length > 0) {
                mostrarStatusInspecciones(dataGlobalInspecciones);
            }
        });
    }

    let hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let numId = (id) => {
        if (!id) return 0;
        let parts = id.split('-');
        if (parts.length > 2 && parts[1].length === 4) {
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

    window.dataFinalInspGlobal = dataFinal;

    let htmlTable = '';
    let htmlCards = '';

    if (dataFinal.length === 0) {
        htmlTable = '<tr><td colspan="10" class="text-center py-5 text-muted">No hay datos de inspecciones para mostrar.</td></tr>';
        htmlCards = '<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>No hay registros disponibles.</div>';
    } else {
        dataFinal.forEach((item) => {
            let p = item.infoPlaca;
            let insp = item.insp;
            let placa = p[0];
            let cli = p[1] || "-";
            let mar = p[3] || "-";
            let mod = p[5] || "-";
            let motora = p[20] || p[11] || "-";

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

            let fIngresoBonita = "-";
            let diasRestantes = -9999;
            let tecnico = "-";
            let colorFalta = "";
            let txtEstado = "";
            let estadoVigente2 = "";

            if (insp && insp.fecha_ingreso) {
                fIngresoBonita = parseDateToDDMMYYYY(insp.fecha_ingreso);
                tecnico = insp.tecnico || '-';
                let fIngreso;
                if (insp.fecha_ingreso.includes('/')) {
                    let px = insp.fecha_ingreso.split('/'); fIngreso = new Date(px[2], px[1] - 1, px[0]);
                } else {
                    let ds = insp.fecha_ingreso.split('T')[0].split('-');
                    fIngreso = ds.length === 3 ? new Date(parseInt(ds[0]), parseInt(ds[1]) - 1, parseInt(ds[2])) : new Date(insp.fecha_ingreso);
                }

                let dProp = parseInt(insp.dias_propuestos) || 30;
                let fProx = new Date(fIngreso.getTime());
                fProx.setDate(fProx.getDate() + dProp);
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

            let badgeProx = (diasRestantes === -9999)
                ? `<span class="badge bg-secondary-subtle text-secondary border fw-medium px-2 py-1 rounded-pill" style="font-size:0.75rem;">Sin Registro</span>`
                : ((isHistorialStatus && !esUltimaInsp)
                    ? `<span class="badge bg-light text-secondary border fw-semibold px-2 py-1 rounded-pill" style="font-size:0.75rem;">REGISTRADO</span>`
                    : `<span class="badge fw-bold px-2 py-1 rounded-pill text-white" style="background-color: ${colorFalta}; font-size:0.75rem;">${textoBadgeProx}</span>`);

            let badgeEst = (isHistorialStatus && !esUltimaInsp)
                ? `<span class="badge bg-light text-secondary border fw-semibold" style="font-size:0.75rem;">REGISTRADO</span>`
                : `<span class="badge fw-bold" style="background-color: ${colorFalta}20; color: ${colorFalta}; font-size:0.75rem; border: 1px solid ${colorFalta}40;">${txtEstado}</span>`;

            let checkHtml = (window.modoSeleccion && window.modoSeleccion['statusMant'] && insp && insp.id)
                ? `<input type="checkbox" class="form-check-input chk-bulk-statusMant me-2" value="${insp.id}" style="transform: scale(1.05);">`
                : '';

            // Obtener ubicación (En Base vs Telemetría GPS)
            let ubicacionInfo = obtenerUbicacionUnidad(placa);

            // Obtener kilometraje del reporte de la inspección
            let kmInspNum = insp ? (insp.km_tablero || insp.kilometraje || insp.km || '') : '';
            let txtKmInsp = (kmInspNum !== '' && !isNaN(Number(kmInspNum))) 
                ? `${Number(kmInspNum).toLocaleString()} km` 
                : '—';

            // ── NUEVO: Panorama de Evaluación / Cobertura (Mecánica vs Neumáticos) ──
            let tieneMec = Boolean(insp && insp.id);
            let tieneNeu = Array.isArray(window.dataGlobalNeumaticos) && window.dataGlobalNeumaticos.some(n => cleanPlaca(n.placa) === cleanPlaca(placa));

            let badgeEvaluacion = '';
            if (tieneMec && tieneNeu) {
                badgeEvaluacion = `<span class="badge rounded-pill fw-bold px-2.5 py-1 text-nowrap" style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-size: 0.73rem;"><i class="bi bi-shield-fill-check me-1 text-success"></i>Mecánica + Neumáticos</span>`;
            } else if (tieneMec && !tieneNeu) {
                badgeEvaluacion = `<span class="badge rounded-pill fw-semibold px-2.5 py-1 text-nowrap" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 0.73rem;"><i class="bi bi-wrench-adjustable me-1 text-primary"></i>Solo Mecánica</span>`;
            } else if (!tieneMec && tieneNeu) {
                badgeEvaluacion = `<span class="badge rounded-pill fw-semibold px-2.5 py-1 text-nowrap" style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; font-size: 0.73rem;"><i class="bi bi-disc-fill me-1 text-warning"></i>Solo Neumáticos</span>`;
            } else {
                badgeEvaluacion = `<span class="badge rounded-pill fw-medium px-2 py-0.5 text-nowrap bg-light text-secondary border" style="font-size: 0.72rem;"><i class="bi bi-dash-circle me-1"></i>Sin Registro</span>`;
            }

            let daysOverdueHTML = '';
            if (!insp || !insp.id) {
                daysOverdueHTML = `<span class="badge bg-light text-secondary border fw-bold" style="font-size: 0.72rem; border-radius: 6px;"><i class="bi bi-dash-circle me-1"></i> SIN REGISTRO</span>`;
            } else if (isHistorialStatus && !esUltimaInsp) {
                daysOverdueHTML = `<span class="badge bg-light text-secondary border fw-bold" style="font-size: 0.72rem; border-radius: 6px;"><i class="bi bi-archive-fill me-1"></i> REGISTRADO</span>`;
            } else {
                if (diasRestantes < 0 && diasRestantes !== -9999) {
                    let cantD = Math.abs(diasRestantes);
                    let lblD = cantD === 1 ? 'Venció hace 1 día' : `Venció hace ${cantD} días`;
                    daysOverdueHTML = `<span class="badge bg-danger-subtle text-danger fw-semibold" style="font-size: 0.72rem; border-radius: 6px;"><i class="bi bi-exclamation-circle-fill me-1"></i> ${lblD}</span>`;
                } else if (diasRestantes >= 0 && diasRestantes <= 7 && diasRestantes !== -9999) {
                    let cantD = diasRestantes;
                    let lblD = cantD === 1 ? 'Falta 1 día' : (cantD === 0 ? 'Vence hoy' : `Faltan ${cantD} días`);
                    daysOverdueHTML = `<span class="badge bg-warning-subtle text-warning-emphasis fw-semibold" style="font-size: 0.72rem; border-radius: 6px;"><i class="bi bi-clock-history me-1"></i> ${lblD}</span>`;
                } else if (diasRestantes > 7) {
                    let cantD = diasRestantes;
                    let lblD = cantD === 1 ? 'Falta 1 día' : `Faltan ${cantD} días`;
                    daysOverdueHTML = `<span class="badge bg-success-subtle text-success fw-semibold" style="font-size: 0.72rem; border-radius: 6px;"><i class="bi bi-check-circle-fill me-1"></i> ${lblD}</span>`;
                }
            }

            let badgeEstadoMobile = '';
            if (!insp || !insp.id) {
                badgeEstadoMobile = `<span class="badge bg-secondary-subtle text-secondary fw-semibold" style="font-size:0.72rem; border-radius:6px;">SIN REGISTRO</span>`;
            } else if (isHistorialStatus && !esUltimaInsp) {
                badgeEstadoMobile = `<span class="badge bg-light text-secondary border fw-semibold" style="font-size:0.72rem; border-radius:6px;">REGISTRADO</span>`;
            } else if (diasRestantes < 0) {
                badgeEstadoMobile = `<span class="badge bg-danger-subtle text-danger fw-semibold" style="font-size:0.72rem; border-radius:6px;">NO VIGENTE</span>`;
            } else if (diasRestantes <= 7) {
                badgeEstadoMobile = `<span class="badge bg-warning-subtle text-warning-emphasis fw-semibold" style="font-size:0.72rem; border-radius:6px;">EN ALERTA</span>`;
            } else {
                badgeEstadoMobile = `<span class="badge bg-success-subtle text-success fw-semibold" style="font-size:0.72rem; border-radius:6px;">CONFORME</span>`;
            }

            // 1. Desktop Row (Compact, Modern & with Row-level + Inspeccionar Button)
            htmlTable += `
            <tr class="clickable-row data-row-status" data-cliente="${cli}" data-marca="${mar}" data-estado-v2="${estadoVigente2}" data-motor="${motora}" data-dias="${diasRestantes}" data-ubicacion="${ubicacionInfo.tipo}">
                <td class="ps-3 py-1.5 fw-bold text-dark">
                    <div class="d-flex align-items-center gap-1.5">
                        ${checkHtml}
                        <div>
                            <span class="font-monospace fw-bold text-primary" style="font-size:0.86rem;">${placa}</span>
                            <span class="d-block text-muted" style="font-size:0.7rem; line-height:1.1;">${cli}</span>
                        </div>
                    </div>
                </td>
                <td class="py-1.5 text-secondary fw-medium" style="font-size:0.82rem;">${mod}</td>
                <td class="py-1.5 text-dark fw-semibold text-truncate" style="max-width: 120px; font-size:0.82rem;">${tecnico}</td>
                <td class="py-1.5 text-secondary" style="font-size:0.82rem;">${fIngresoBonita}</td>
                <td class="py-1.5" style="font-size:0.82rem;">${badgeProx}</td>
                <td class="py-1.5 text-center">${badgeEst}</td>
                <td class="py-1.5 text-center">${badgeEvaluacion}</td>
                <td class="py-1.5">${ubicacionInfo.badgeHtml}</td>
                <td class="py-1.5 text-end font-monospace fw-bold text-dark" style="font-size:0.82rem;">${txtKmInsp}</td>
                <td class="pe-3 py-1.5 text-end text-nowrap">
                    <div class="d-inline-flex align-items-center gap-1.5">
                        <button type="button" class="btn btn-sm btn-primary py-1 px-2.5 rounded-3 fw-bold d-inline-flex align-items-center gap-1 shadow-2xs" style="background: #0284c7; border-color: #0284c7; font-size: 0.76rem;" onclick="event.stopPropagation(); window.abrirModalSeleccionarTipoInspeccion('${placa}', ${kmInspNum ? Number(kmInspNum) : 0})" title="Realizar Inspección para ${placa}">
                            <i class="bi bi-plus-lg"></i><span>Inspeccionar</span>
                        </button>
                        <div class="dropdown d-inline-block">
                            <button class="btn btn-sm btn-light border-0 rounded-circle p-1 d-inline-flex align-items-center justify-content-center" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="width: 28px; height: 28px; color: #64748b;" title="Más opciones">
                                <i class="bi bi-three-dots-vertical"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 rounded-3 py-1" style="font-size: 0.82rem; min-width: 140px; z-index: 1050;">
                                ${insp && insp.id ? `
                                    <li><a class="dropdown-item py-1.5 d-flex align-items-center gap-2 text-dark" href="javascript:void(0)" onclick="event.stopPropagation(); window.verDetalleInspeccion('${insp.id}', false)"><i class="bi bi-eye text-primary"></i> Ver Detalle</a></li>
                                    <li><a class="dropdown-item py-1.5 d-flex align-items-center gap-2 text-dark" href="javascript:void(0)" onclick="event.stopPropagation(); window.verDetalleInspeccion('${insp.id}', true)"><i class="bi bi-file-earmark-pdf text-danger"></i> Exportar PDF</a></li>
                                    ${window.checkPerm && window.checkPerm('insp', 'e') ? `
                                    <li><a class="dropdown-item py-1.5 d-flex align-items-center gap-2 text-dark" href="javascript:void(0)" onclick="event.stopPropagation(); window.abrirModalEditarInspeccion('${insp.id}')"><i class="bi bi-pencil text-secondary"></i> Editar</a></li>` : ''}
                                    <li><hr class="dropdown-divider my-1"></li>
                                    ${window.checkPerm && window.checkPerm('insp', 'd') ? `
                                    <li><a class="dropdown-item py-1.5 d-flex align-items-center gap-2 text-danger" href="javascript:void(0)" onclick="event.stopPropagation(); window.eliminarInspeccion('${insp.id}')"><i class="bi bi-trash3"></i> Eliminar</a></li>` : ''}
                                ` : `
                                    <li><a class="dropdown-item py-1.5 d-flex align-items-center gap-2 text-primary fw-bold" href="javascript:void(0)" onclick="event.stopPropagation(); window.abrirModalSeleccionarTipoInspeccion('${placa}', ${kmInspNum ? Number(kmInspNum) : 0})"><i class="bi bi-plus-lg"></i> Registrar Inspección</a></li>
                                `}
                            </ul>
                        </div>
                    </div>
                </td>
            </tr>`;

            // 2. Mobile Native Card (1:1 Layout with Coverage Badge, Location and Quick Actions)
            htmlCards += `
            <div class="ck-mobile-card data-card-insp" data-cliente="${cli}" data-marca="${mar}" data-estado-v2="${estadoVigente2}" data-motor="${motora}" data-dias="${diasRestantes}" data-ubicacion="${ubicacionInfo.tipo}">
                <!-- Header Card: Folio/ID + Fecha + Estado -->
                <div class="d-flex align-items-center justify-content-between mb-1.5">
                    <div class="d-flex align-items-center gap-2">
                        <span class="fw-bolder text-primary font-monospace" style="font-size:0.92rem;">${insp && insp.id ? insp.id : 'SIN REGISTRO'}</span>
                        <span class="text-muted small" style="font-size:0.73rem;">• ${fIngresoBonita}</span>
                    </div>
                    <div>${badgeEstadoMobile}</div>
                </div>

                <!-- Placa, Modelo y Cobertura Evaluación -->
                <div class="d-flex flex-wrap align-items-center gap-1.5 mb-2">
                    <span class="badge bg-light text-dark border fw-bold px-2 py-0.5" style="font-size:0.78rem; border-radius:6px;">🚛 ${placa}</span>
                    ${mod && mod !== '-' ? `<span class="badge bg-light text-secondary border fw-medium px-2 py-0.5" style="font-size:0.75rem; border-radius:6px;">${mod}</span>` : ''}
                    <div>${badgeEvaluacion}</div>
                </div>

                <!-- Cliente/Técnico y Ubicación (Esquina Superior Derecha) -->
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <div>
                        <div class="fw-bold text-dark" style="font-size:0.85rem;">${cli !== '-' ? cli : 'Sin cliente asignado'}</div>
                        <div class="text-muted small" style="font-size:0.73rem;"><i class="bi bi-person-fill text-secondary me-1"></i>${tecnico !== '-' ? tecnico : 'Sin técnico asignado'}</div>
                    </div>
                    <div class="text-end flex-shrink-0 ms-2">
                        ${ubicacionInfo.badgeMobile}
                    </div>
                </div>

                <!-- Semáforo / Días restantes & Kilometraje del Reporte (Esquina Inferior Derecha) -->
                <div class="d-flex align-items-center justify-content-between pt-2 border-top mb-2.5">
                    <div>${daysOverdueHTML}</div>
                    <div class="text-end">
                        <span class="text-dark fw-bold font-monospace" style="font-size:0.78rem;">
                            <i class="bi bi-speedometer2 text-secondary me-1"></i>${txtKmInsp}
                        </span>
                    </div>
                </div>

                <!-- Botones de Acción Móvil -->
                <div class="d-flex align-items-center justify-content-between gap-1.5 pt-2 border-top">
                    <button type="button" class="btn btn-sm btn-primary fw-bold flex-grow-1 d-flex align-items-center justify-content-center gap-1.5 py-1.5 shadow-2xs" onclick="window.abrirModalSeleccionarTipoInspeccion('${placa}', ${kmInspNum ? Number(kmInspNum) : 0})" style="border-radius:8px; font-size:0.8rem; background: #0284c7; border-color: #0284c7;">
                        <i class="bi bi-plus-lg"></i> Inspeccionar
                    </button>
                    ${insp && insp.id ? `
                        <button type="button" class="btn btn-sm btn-outline-primary fw-bold px-2.5 py-1.5 d-flex align-items-center justify-content-center gap-1" onclick="window.verDetalleInspeccion('${insp.id}', false)" style="border-radius:8px; font-size:0.78rem;" title="Ver Detalle">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger fw-semibold px-2.5 py-1.5 d-flex align-items-center gap-1" onclick="window.verDetalleInspeccion('${insp.id}', true)" title="PDF" style="border-radius:8px; font-size:0.78rem;">
                            <i class="bi bi-file-earmark-pdf"></i>
                        </button>
                    ` : ''}
                    <div class="dropdown">
                        <button class="btn btn-sm btn-light border shadow-2xs rounded-3 px-2 py-1.5" type="button" data-bs-toggle="dropdown" data-bs-boundary="viewport" aria-expanded="false" style="border-radius:8px;">
                            <i class="bi bi-three-dots-vertical"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3 p-1" style="font-size: 0.82rem; min-width: 170px; z-index: 1050;">
                            ${insp && insp.id ? `
                                <li>
                                    <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.verDetalleInspeccion('${insp.id}', false)">
                                        <i class="bi bi-eye text-primary fs-6"></i> Ver Resumen
                                    </a>
                                </li>
                                <li>
                                    <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.verDetalleInspeccion('${insp.id}', true)">
                                        <i class="bi bi-file-pdf text-danger fs-6"></i> Exportar a PDF
                                    </a>
                                </li>
                                ${window.checkPerm && window.checkPerm('insp', 'e') ? `
                                <li>
                                    <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.abrirModalEditarInspeccion('${insp.id}')">
                                        <i class="bi bi-pencil text-secondary fs-6"></i> Editar / Re-firmar
                                    </a>
                                </li>` : ''}
                                ${window.checkPerm && window.checkPerm('insp', 'd') ? `
                                <li><hr class="dropdown-divider my-1"></li>
                                <li>
                                    <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 text-danger" href="javascript:void(0)" onclick="window.eliminarInspeccion('${insp.id}')">
                                        <i class="bi bi-trash3 fs-6"></i> Eliminar
                                    </a>
                                </li>` : ''}
                            ` : `
                                <li>
                                    <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 text-primary fw-bold" href="javascript:void(0)" onclick="window.abrirModalSeleccionarTipoInspeccion('${placa}', ${kmInspNum ? Number(kmInspNum) : 0})">
                                        <i class="bi bi-plus-lg fs-6"></i> Registrar Inspección
                                    </a>
                                </li>
                            `}
                        </ul>
                    </div>
                </div>
            </div>
            `;
        });
    }

    const _tablaBody = document.getElementById('cuerpoTablaStatus');
    const _cardCont = document.getElementById('inspCardContainer');
    if (_tablaBody) _tablaBody.innerHTML = htmlTable;
    if (_cardCont) _cardCont.innerHTML = htmlCards;

    filtrarStatusAvanzado();

    // Aplicar filtro pendiente desde navegación (ej: click en card del dashboard)
    if (window._pendingInspFilter) {
        var _pf = String(window._pendingInspFilter).toUpperCase();
        window._pendingInspFilter = null;
        var targetSem = 'total';
        if (_pf.includes('VIGENTE') || _pf.includes('CONFORME') || _pf === 'VERDE') targetSem = 'verde';
        else if (_pf.includes('PROXIMO') || _pf.includes('PRÓXIMO') || _pf.includes('ALERTA') || _pf === 'AMARILLO') targetSem = 'amarillo';
        else if (_pf.includes('NO VIGENTE') || _pf.includes('VENCID') || _pf.includes('CRIT') || _pf === 'ROJO') targetSem = 'rojo';
        else targetSem = 'total';

        window.filtrarInspSemaforoSegment(targetSem);
    }
    
    // Renderizar tabla de frenos
    if (typeof renderTablaFrenos === 'function') {
        renderTablaFrenos(dataGlobalInspecciones);
    }
}

function filtrarStatusAvanzado() {
    const txt = (document.getElementById('buscadorStatus')?.value || '').toLowerCase().trim();
    const filtroCard = window._inspFiltroCard || 'total';
    const filtroUbi = window._inspFiltroUbicacion || 'todos';

    let cntTotalVig = 0, cntTotalNoVig = 0;
    let cntMotVig = 0, cntMotNoVig = 0;
    let cntNoMotVig = 0, cntNoMotNoVig = 0;

    let kpiTotal = 0, kpiConformes = 0, kpiAlerta = 0, kpiCriticas = 0;

    // 1. Filtrar filas de tabla escritorio
    const rows = document.querySelectorAll('#cuerpoTablaStatus tr.data-row-status');
    rows.forEach(row => {
        let est = (row.getAttribute('data-estado-v2') || '').toLowerCase();
        let textoFila = row.textContent.toLowerCase();
        let dias = parseInt(row.getAttribute('data-dias'));
        let ubi = (row.getAttribute('data-ubicacion') || '').toLowerCase();

        // Clasificar estado semafórico para conteo de KPIs
        kpiTotal++;
        if (isNaN(dias) || dias < 0 || dias === -9999 || est.includes('vencid') || est.includes('crit') || est.includes('no vigente')) {
            kpiCriticas++;
        } else if (dias <= 7 || est.includes('alert') || est.includes('observ') || est.includes('próximo') || est.includes('proximo')) {
            kpiAlerta++;
        } else {
            kpiConformes++;
        }

        // A. Filtro de Texto
        let matchTxt = (!txt || textoFila.includes(txt));

        // B. Filtro Card (Semáforo)
        let matchCard = true;
        if (filtroCard === 'verde') {
            matchCard = dias > 7 && !est.includes('vencid') && !est.includes('alert') && !est.includes('no vigente') && dias !== -9999;
        } else if (filtroCard === 'amarillo') {
            matchCard = (dias >= 0 && dias <= 7 && dias !== -9999) || est.includes('alert') || est.includes('observ') || est.includes('próximo') || est.includes('proximo');
        } else if (filtroCard === 'rojo') {
            matchCard = isNaN(dias) || dias < 0 || dias === -9999 || est.includes('vencid') || est.includes('crit') || est.includes('no vigente');
        }

        // C. Filtro Ubicación (Todos vs En Base)
        let matchUbi = true;
        if (filtroUbi === 'base') {
            matchUbi = ubi === 'base' || textoFila.includes('en base');
        }

        if (matchTxt && matchCard && matchUbi) {
            row.style.display = '';
            if (!isHistorialStatus) {
                let mot = row.getAttribute('data-motor') || '';
                let esMotora = mot.toUpperCase().trim() === 'MOTORA';
                if (dias >= 0 && dias !== -9999) {
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

    // 2. Filtrar cards móviles
    const cards = document.querySelectorAll('#inspCardContainer .data-card-insp');
    cards.forEach(card => {
        let est = (card.getAttribute('data-estado-v2') || '').toLowerCase();
        let ubi = (card.getAttribute('data-ubicacion') || '').toLowerCase();
        let textoCard = card.textContent.toLowerCase();
        let dias = parseInt(card.getAttribute('data-dias'));

        let matchTxt = (!txt || textoCard.includes(txt));

        let matchCard = true;
        if (filtroCard === 'verde') {
            matchCard = dias > 7 && !est.includes('vencid') && !est.includes('alert') && !est.includes('no vigente') && dias !== -9999;
        } else if (filtroCard === 'amarillo') {
            matchCard = (dias >= 0 && dias <= 7 && dias !== -9999) || est.includes('alert') || est.includes('observ') || est.includes('próximo') || est.includes('proximo');
        } else if (filtroCard === 'rojo') {
            matchCard = isNaN(dias) || dias < 0 || dias === -9999 || est.includes('vencid') || est.includes('crit') || est.includes('no vigente');
        }

        let matchUbi = true;
        if (filtroUbi === 'base') {
            matchUbi = ubi === 'base' || textoCard.includes('en base');
        }

        card.style.display = (matchTxt && matchCard && matchUbi) ? '' : 'none';
    });

    // 3. Actualizar KPIs Bento
    const setKpi = (id, v) => { var el = document.getElementById(id); if (el) el.textContent = v; };
    setKpi('kpi-insp-total', kpiTotal);
    setKpi('kpi-insp-conformes', kpiConformes);
    setKpi('kpi-insp-alerta', kpiAlerta);
    setKpi('kpi-insp-criticas', kpiCriticas);

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
    
    // Agrupar ítems por categorías / sistemas de forma dinámica
    let categoriasMap = new Map();
    detallesArray.forEach(d => {
        if (!d || !d.categoria || d.categoria === "FIRMAS_EXTRA") return;
        let catName = d.categoria.replace(/^\d+[\.\-\)]\s*/, '').trim().toUpperCase();
        if (!categoriasMap.has(catName)) {
            categoriasMap.set(catName, []);
        }
        categoriasMap.get(catName).push(d);
    });

    // Extraer fallas detectadas
    let fallasDetectadas = detallesArray.filter(d => {
        if (!d || d.categoria === "FIRMAS_EXTRA") return false;
        let est = (d.estado || '').toUpperCase();
        return est === "FALLA" || est === "MAL" || (d.observacion && d.observacion.trim().length > 0 && est !== "OK" && est !== "SIN DATOS");
    });

    let totalItemsEvaluados = 0;
    categoriasMap.forEach(arr => totalItemsEvaluados += arr.length);

    // Badge estado semáforo
    let fProx = parseDateToDDMMYYYY(insp.proxima_inspeccion);
    let badgeSemaforo = '<span class="badge rounded-pill px-3 py-1.5 fw-bold" style="background:#dcfce7; color:#15803d; font-size:0.82rem;"><i class="bi bi-check-circle-fill me-1"></i> CONFORME</span>';
    if (countFallas > 0) {
        badgeSemaforo = `<span class="badge rounded-pill px-3 py-1.5 fw-bold" style="background:#fee2e2; color:#b91c1c; font-size:0.82rem;"><i class="bi bi-x-circle-fill me-1"></i> ${countFallas} FALLA(S)</span>`;
    }

    // ── 1. CARD: DATOS GENERALES (BENTO GRID) ──
    let htmlUI = `
        <!-- 1. DATOS DE LA INSPECCIÓN -->
        <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 pb-2 border-bottom">
                <div class="d-flex align-items-center gap-2">
                    <span class="p-2 rounded-3 text-primary d-flex align-items-center justify-content-center" style="background:#e0f2fe; width:36px; height:36px;">
                        <i class="bi bi-file-earmark-text-fill fs-5"></i>
                    </span>
                    <div>
                        <h6 class="fw-bold text-dark m-0" style="font-size:1.02rem;">Datos de la Inspección</h6>
                        <small class="text-muted" style="font-size:0.75rem;">Diagnóstico técnico y control vehicular</small>
                    </div>
                </div>
                <div>
                    ${badgeSemaforo}
                </div>
            </div>
            <div class="row g-2 g-md-3">
                <div class="col-6 col-md-3">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size:0.72rem; letter-spacing:0.5px;">Nº Reporte</span>
                    <span class="fw-bolder text-primary" style="font-size:0.95rem;">${insp.id || '-'}</span>
                </div>
                <div class="col-6 col-md-3">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size:0.72rem; letter-spacing:0.5px;">Vehículo / Placa</span>
                    <span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-1" style="font-size:0.9rem; letter-spacing:0.5px;">${insp.placa || '-'}</span>
                </div>
                <div class="col-6 col-md-3">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size:0.72rem; letter-spacing:0.5px;">Fecha Inspección</span>
                    <span class="fw-bold text-dark" style="font-size:0.88rem;">${fIng || '-'}</span>
                </div>
                <div class="col-6 col-md-3">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size:0.72rem; letter-spacing:0.5px;">Próxima Inspección</span>
                    <span class="fw-bold text-secondary" style="font-size:0.88rem;">${fProx || '-'}</span>
                </div>
                <div class="col-6 col-md-3">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size:0.72rem; letter-spacing:0.5px;">Tipo de Inspección</span>
                    <span class="fw-semibold text-dark" style="font-size:0.88rem;">${insp.tipo_inspeccion || 'General'}</span>
                </div>
                <div class="col-6 col-md-3">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size:0.72rem; letter-spacing:0.5px;">Técnico Inspector</span>
                    <span class="fw-semibold text-dark" style="font-size:0.88rem;">${insp.tecnico || '-'}</span>
                </div>
                <div class="col-6 col-md-3">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size:0.72rem; letter-spacing:0.5px;">Kilometraje Tablero</span>
                    <span class="fw-bold text-dark" style="font-size:0.88rem;">${insp.km_tablero ? (insp.km_tablero + ' km') : '-'}</span>
                </div>
                <div class="col-6 col-md-3">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size:0.72rem; letter-spacing:0.5px;">Diagnóstico Global</span>
                    <span class="fw-bold ${countFallas > 0 ? 'text-danger' : 'text-success'}" style="font-size:0.88rem;">
                        ${countFallas > 0 ? `<i class="bi bi-exclamation-octagon-fill me-1"></i> ${countFallas} Falla(s)` : `<i class="bi bi-check-circle-fill me-1"></i> 100% Conforme`}
                    </span>
                </div>
            </div>
        </div>
    `;

    // ── 2. CARD: FALLAS DETECTADAS (SI EXISTEN) ──
    if (fallasDetectadas.length > 0) {
        let fallasRowsHtml = '';
        fallasDetectadas.forEach(f => {
            fallasRowsHtml += `
                <tr class="align-middle bg-white border-bottom">
                    <td class="ps-3 py-2.5 fw-bold text-secondary" style="font-size:0.82rem; white-space:nowrap;">
                        <span class="badge bg-light text-dark border px-2 py-1">${f.categoria || 'GENERAL'}</span>
                    </td>
                    <td class="py-2.5 fw-bold text-dark" style="font-size:0.88rem;">${f.item}</td>
                    <td class="py-2.5 text-center" style="width:110px;">
                        <span class="badge rounded-pill fw-bold px-2.5 py-1" style="background:#fee2e2; color:#b91c1c; font-size:0.75rem;">
                            <i class="bi bi-x-circle-fill me-1"></i> ${f.estado || 'FALLA'}
                        </span>
                    </td>
                    <td class="pe-3 py-2.5 text-danger fw-semibold" style="font-size:0.84rem;">
                        ${f.observacion || 'Sin observación especificada'}
                    </td>
                </tr>
            `;
        });

        htmlUI += `
            <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #fee2e2 !important; background:#fffcfc !important;">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <h6 class="fw-bold text-danger m-0 d-flex align-items-center gap-2" style="font-size:0.95rem;">
                        <i class="bi bi-exclamation-triangle-fill"></i> Detalle de Fallas Detectadas (${fallasDetectadas.length})
                    </h6>
                </div>
                <div class="table-responsive rounded-3 border bg-white overflow-hidden">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="bg-light border-bottom">
                            <tr class="text-secondary" style="font-size:0.72rem; letter-spacing:0.5px; text-transform:uppercase;">
                                <th class="ps-3 py-2">Sistema</th>
                                <th class="py-2">Ítem / Componente</th>
                                <th class="py-2 text-center">Estado</th>
                                <th class="pe-3 py-2">Observación del Técnico</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${fallasRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ── 3. CARD: CHECKLIST COMPLETO SEGMENTADO POR SISTEMAS ──
    let sistemasHtml = '';
    categoriasMap.forEach((items, catName) => {
        let itemsHtml = '';
        items.forEach(d => {
            let est = (d.estado || '').toUpperCase().trim();
            let badgeItem = '';
            if (est === 'OK' || est === 'BUENO' || est === 'CONFORME') {
                badgeItem = `<span class="badge rounded-pill fw-bold px-3 py-1 shadow-2xs" style="background:#dcfce7; color:#15803d; font-size:0.75rem;"><i class="bi bi-check-lg me-1"></i>OK</span>`;
            } else if (est === 'FALLA' || est === 'MAL' || est === 'CRITICO') {
                badgeItem = `<span class="badge rounded-pill fw-bold px-3 py-1 shadow-2xs" style="background:#fee2e2; color:#b91c1c; font-size:0.75rem;"><i class="bi bi-x-lg me-1"></i>FALLA</span>`;
            } else if (est !== '' && est !== 'SIN DATOS') {
                badgeItem = `<span class="badge rounded-pill fw-bold px-2.5 py-1 shadow-2xs" style="background:#e0f2fe; color:#0369a1; font-size:0.75rem;">${d.estado}</span>`;
            } else {
                badgeItem = `<span class="text-muted small">—</span>`;
            }

            itemsHtml += `
                <div class="d-flex align-items-center justify-content-between p-2.5 px-3 border-bottom bg-white" style="font-size:0.86rem;">
                    <div class="d-flex align-items-start gap-2 flex-grow-1 me-3">
                        <i class="bi ${est === 'FALLA' || est === 'MAL' ? 'bi-exclamation-circle text-danger' : 'bi-check2 text-muted'} mt-0.5"></i>
                        <div>
                            <span class="fw-semibold text-dark">${d.item}</span>
                            ${d.observacion ? `<div class="text-danger small mt-0.5 fw-semibold"><i class="bi bi-info-circle me-1"></i>${d.observacion}</div>` : ''}
                        </div>
                    </div>
                    <div class="flex-shrink-0">
                        ${badgeItem}
                    </div>
                </div>
            `;
        });

        sistemasHtml += `
            <div class="border rounded-4 overflow-hidden mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
                <div class="px-3 py-2.5 bg-light d-flex align-items-center justify-content-between border-bottom">
                    <div class="d-flex align-items-center gap-2">
                        <span class="d-flex align-items-center justify-content-center rounded-circle text-primary" style="width:24px; height:24px; background:#eff6ff;">
                            <i class="bi bi-folder2-open" style="font-size:0.8rem;"></i>
                        </span>
                        <span class="fw-bolder text-dark" style="font-size:0.88rem; letter-spacing:0.5px;">${catName}</span>
                    </div>
                    <span class="badge bg-white border text-secondary rounded-pill px-2.5 py-1" style="font-size:0.72rem;">${items.length} ítems</span>
                </div>
                <div class="d-flex flex-column">
                    ${itemsHtml}
                </div>
            </div>
        `;
    });

    htmlUI += `
        <!-- 3. CHECKLIST POR SISTEMAS -->
        <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                <div class="d-flex align-items-center gap-2">
                    <span class="p-2 rounded-3 text-primary d-flex align-items-center justify-content-center" style="background:#eff6ff; width:36px; height:36px;">
                        <i class="bi bi-card-checklist fs-5"></i>
                    </span>
                    <div>
                        <h6 class="fw-bold text-dark m-0" style="font-size:1.02rem;">Checklist y Criterios Evaluados</h6>
                        <small class="text-muted" style="font-size:0.75rem;">Detalle por sistema y estado</small>
                    </div>
                </div>
                <span class="badge bg-secondary-subtle text-secondary rounded-pill px-2.5 py-1" style="font-size:0.75rem;">${totalItemsEvaluados} Criterios</span>
            </div>
            <div class="d-flex flex-column">
                ${sistemasHtml}
            </div>
        </div>
    `;

    // ── 4. CARD: EVIDENCIAS FOTOGRÁFICAS ──
    if (contEvidencias > 1) {
        htmlUI += `
            <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
                <div class="d-flex align-items-center justify-content-between mb-3">
                    <h6 class="fw-bold text-dark m-0 d-flex align-items-center gap-2" style="font-size:0.95rem;">
                        <i class="bi bi-camera-fill text-primary"></i> Evidencias Fotográficas (${contEvidencias - 1})
                    </h6>
                </div>
                <div class="d-flex gap-2.5 overflow-auto pb-2 custom-scrollbar">
                    ${htmlEvidenciasUI}
                </div>
            </div>
        `;
    }

    // ── 5. CARD: ÓRDENES DE TRABAJO (SI TIENE) ──
    if (insp.id_ot) {
        htmlUI += `
            <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e0f2fe !important; background:#f8fafc !important;">
                <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div class="d-flex align-items-center gap-2">
                        <span class="p-2 rounded-3 text-primary d-flex align-items-center justify-content-center" style="background:#e0f2fe; width:36px; height:36px;">
                            <i class="bi bi-tools fs-5"></i>
                        </span>
                        <div>
                            <h6 class="fw-bold text-dark m-0" style="font-size:0.95rem;">Órdenes de Trabajo Generadas</h6>
                            <small class="text-muted" style="font-size:0.75rem;">Mantenimiento y corrección en taller</small>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-primary fs-6 px-3 py-1.5 fw-bold rounded-pill">OT-${insp.id_ot}</span>
                        <button type="button" class="btn btn-primary btn-sm fw-bold rounded-pill px-3 shadow-2xs" onclick="bootstrap.Modal.getInstance(document.getElementById('modalResumenInspeccion')).hide(); if(typeof window.rotAbrirDetalle === 'function'){ window.rotAbrirDetalle('${insp.id_ot}'); } else { if(typeof window.cargarModuloAislado === 'function') window.cargarModuloAislado('mantenimiento/reportes-ot'); setTimeout(()=> { if(typeof window.rotAbrirDetalle === 'function') window.rotAbrirDetalle('${insp.id_ot}'); }, 800); }">
                            <i class="bi bi-box-arrow-up-right me-1"></i> Abrir OT
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ── 6. CARD: FIRMA DIGITAL ──
    let firmaPrincipalReal = signedMap[insp.url_firma] || insp.url_firma;
    let firmasHtmlUI = "";
    if (firmaPrincipalReal && firmaPrincipalReal.length > 100) {
        firmasHtmlUI += `
            <div class="text-center p-2 rounded-3 bg-light border">
                <img src="${firmaPrincipalReal}" style="max-height: 100px; max-width: 220px; object-fit: contain; display: block; margin: 0 auto;">
                <div class="border-top pt-1 mt-1">
                    <span class="fw-bold text-dark" style="font-size: 0.85rem;">Técnico Inspector</span><br>
                    <span class="text-secondary small">${insp.tecnico || '-'}</span>
                </div>
            </div>
        `;
    }
    if (firmasHtmlUI !== "") {
        htmlUI += `
            <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
                <h6 class="fw-bold text-dark mb-3 d-flex align-items-center gap-2" style="font-size:0.95rem;">
                    <i class="bi bi-pen-fill text-primary"></i> Firma y Validación
                </h6>
                <div class="d-flex justify-content-around flex-wrap gap-3">
                    ${firmasHtmlUI}
                </div>
            </div>
        `;
    }

    const folioTitleEl = document.getElementById('lbl-resumen-insp-folio');
    if (folioTitleEl) folioTitleEl.textContent = `Resumen de Inspección ${insp.id || ''}`;

    if (!autoDescargarPDF) {
        let modalBody = document.getElementById('det-insp-full-body') || document.querySelector('#modalResumenInspeccion .modal-body');
        if (modalBody) {
            modalBody.innerHTML = htmlUI;
        }
    }

    let btnIrOtContainer = document.getElementById('btn-ir-ot-container');
    if (btnIrOtContainer) {
        if (insp.id_ot) {
            btnIrOtContainer.innerHTML = `<button type="button" class="btn btn-outline-primary btn-sm fw-bold rounded-pill px-3 shadow-2xs" onclick="bootstrap.Modal.getInstance(document.getElementById('modalResumenInspeccion')).hide(); if(typeof window.rotAbrirDetalle === 'function'){ window.rotAbrirDetalle('${insp.id_ot}'); } else { if(typeof window.cargarModuloAislado === 'function') window.cargarModuloAislado('mantenimiento/reportes-ot'); setTimeout(()=> { if(typeof window.rotAbrirDetalle === 'function') window.rotAbrirDetalle('${insp.id_ot}'); }, 800); }"><i class="bi bi-box-arrow-up-right me-1"></i> Ir a OT</button>`;
        } else {
            btnIrOtContainer.innerHTML = '';
        }
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
                    let modal = bootstrap.Modal.getInstance(offEl);
                    if (modal) modal.hide();
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
    let placaEl = document.getElementById('i_placa');
    if (!placaEl) return;
    let placaInput = (placaEl.value || '').toString().trim().toUpperCase();
    let placasList = window.dataGlobalPlacas || [];
    let match = placasList.find(p => (p && p[0] ? p[0].toString().trim().toUpperCase() : '') === placaInput);

    let clientEl = document.getElementById('i_cliente');
    let modeloEl = document.getElementById('i_modelo');
    if (match) {
        if (clientEl) clientEl.value = match[1] || "";
        if (modeloEl) modeloEl.value = match[5] || "";
    } else {
        if (clientEl) clientEl.value = "";
        if (modeloEl) modeloEl.value = "";
    }

    let kmGpsEl = document.getElementById('i_kmgps');
    if (kmGpsEl) {
        if (typeof window.buscarWialonPorPlaca === 'function') {
            let wialonData = window.buscarWialonPorPlaca(placaInput);
            kmGpsEl.value = (wialonData && wialonData.km) ? wialonData.km : '';
        } else {
            kmGpsEl.value = '';
        }
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
        try {
            let res = await fetch('/modulos/mantenimiento/inspecciones/vista.html');
            let html = await res.text();
            let tmp = document.createElement('div');
            tmp.innerHTML = html;
            let drawer = tmp.querySelector('#drawerInspeccion');
            if (drawer) {
                document.body.appendChild(drawer);
                return window.abrirModalNuevaInspeccion(placaPreselect, idOtPreselect, kmPreselect);
            } else {
                alert("No se encontró la vista de Inspecciones.");
                return;
            }
        } catch(e) {
            console.error("Error al cargar vista inspecciones:", e);
            return;
        }
    }

    await window.ensureInspConfig();
    window.renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');
    if (formEl) formEl.reset();
    
    let idInput = document.getElementById('i_id_inspeccion');
    if (idInput) idInput.value = "";

    let maxId = 0;
    let year = new Date().getFullYear();
    
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
    let fechaEl = document.getElementById('i_fecha');
    if (fechaEl) fechaEl.value = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];

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
        let iPlaca = document.getElementById('i_placa');
        let txtPla = document.getElementById('i_placa-txt');
        if (iPlaca) iPlaca.value = placaPreselect;
        if (txtPla) txtPla.value = placaPreselect;
        window.autocompletarInfoInsp();
    }

    let offEl = document.getElementById('drawerInspeccion');
    if (offEl) {
        if (offEl.parentElement !== document.body) {
            document.body.appendChild(offEl);
        }
        offEl.style.setProperty('z-index', '1080', 'important');
        let modal = bootstrap.Modal.getOrCreateInstance(offEl);
        modal.show();
    }

    // Cargar / actualizar lista de inspecciones en segundo plano sin congelar UI
    fetch('/api/script/obtenerDatosInspecciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] })
    }).then(r => r.json()).then(data => {
        if (data && data.data) {
            window.dataGlobalInspecciones = data.data;
            let currentMax = 0;
            data.data.forEach(row => {
                let parts = (row.id || '').split('-');
                if (parts.length === 3 && parts[1] == year) {
                    let num = parseInt(parts[2], 10);
                    if (num > currentMax) currentMax = num;
                }
            });
            let showInp = document.getElementById('i_id_inspeccion_show');
            if (showInp && !document.getElementById('i_id_inspeccion')?.value) {
                showInp.value = "INSP-" + year + "-" + String(currentMax + 1).padStart(4, '0');
            }
        }
    }).catch(e => console.warn("Background update inspecciones:", e));
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
        let modal = bootstrap.Modal.getOrCreateInstance(offEl);
        modal.show();
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

    // Asegurar que las placas, inspecciones, unidades en base y telemetría estén en memoria
    const asegurarPlacasEInsp = async () => {
        try {
            await Promise.allSettled([
                (!window.dataGlobalPlacas || window.dataGlobalPlacas.length === 0) ? 
                    fetch('/api/script/obtenerDatosPlacas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
                        .then(r => r.json()).then(j => { window.dataGlobalPlacas = j.data || []; dataGlobalPlacas = window.dataGlobalPlacas; }) : Promise.resolve(),
                (!window.dataGlobalInspecciones || window.dataGlobalInspecciones.length === 0) ?
                    fetch('/api/script/obtenerDatosInspecciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
                        .then(r => r.json()).then(j => { window.dataGlobalInspecciones = j.data || []; dataGlobalInspecciones = window.dataGlobalInspecciones; }) : Promise.resolve(),
                window.cargarDatosUnidadesBase(),
                window.asegurarWialonCache()
            ]);
        } catch(e) {
            console.warn("Error cargando dependencias de inspecciones:", e);
        }
        mostrarStatusInspecciones(window.dataGlobalInspecciones || []);
    };

    asegurarPlacasEInsp();
};

// Alias global para recargarModulo (main logica.js)
window.recargarInspecciones = function () {
    dataGlobalInspecciones = null;
    Promise.allSettled([
        fetch('/api/script/obtenerDatosInspecciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
            .then(r => r.json()).then(r => {
                dataGlobalInspecciones = r.data || [];
                window._dataGlobalInspeccionesRaw = dataGlobalInspecciones;
            }),
        window.cargarDatosUnidadesBase(),
        window.asegurarWialonCache()
    ]).finally(function() {
        mostrarStatusInspecciones(dataGlobalInspecciones || []);
    });
};


// ==========================================
// ⚙️ CONFIGURACIÓN DINÁMICA DE SISTEMAS Y FALLAS
// ==========================================
window._inspConfigTabActiva = 'tracto';
window._inspConfigTemp = { tracto: [], remolque: [] };

function parseCodigoTextoInsp(itStr, fallbackIdx) {
    if (typeof itStr === 'object' && itStr !== null) {
        let label = itStr.label || itStr.texto || '';
        let m = String(label).trim().match(/^(\d+)\s*[-.)]?\s*(.*)$/);
        if (m) return { codigo: m[1].padStart(2, '0'), texto: m[2].trim() };
        return { codigo: String(fallbackIdx + 1).padStart(2, '0'), texto: label };
    }
    const raw = String(itStr || '').trim();
    const m = raw.match(/^(\d+)\s*[-.)]?\s*(.*)$/);
    if (m) {
        return {
            codigo: m[1].padStart(2, '0'),
            texto: m[2].trim()
        };
    }
    return {
        codigo: String(fallbackIdx + 1).padStart(2, '0'),
        texto: raw
    };
}

window.abrirConfigInspecciones = async function() {
    try {
        let res = await fetch('/api/mantenimiento/inspecciones/config').then(r => r.json());
        let templates = (res.ok && Array.isArray(res.data)) ? res.data : [];

        let parsedTracto = [];
        let parsedRemolque = [];

        templates.forEach(t => {
            let items = [];
            try {
                items = typeof t.items_json === 'string' ? JSON.parse(t.items_json) : (t.items_json || []);
            } catch(e) { items = []; }
            
            let tit = (t.titulo || '').toUpperCase();
            let obj = {
                key: t.template_id || ('sys_' + Date.now() + Math.floor(Math.random()*100)),
                title: t.titulo || 'SISTEMA',
                icon: (tit.includes('CARRETA') || tit.includes('REMOLQUE') || tit.includes('SUSPENSION')) ? 'bi-truck-flatbed' : 'bi-gear-fill',
                items: items
            };

            if (tit.includes('CARRETA') || tit.includes('REMOLQUE') || tit.includes('SEMIREMOLQUE') || t.template_id?.startsWith('rem_')) {
                parsedRemolque.push(obj);
            } else {
                parsedTracto.push(obj);
            }
        });

        // Si no habían templates cargados, inicializar con estructura predeterminada
        if (parsedTracto.length === 0 && parsedRemolque.length === 0) {
            parsedTracto = [
                { key: 'mot', title: 'MOTOR', icon: 'bi-gear-fill', items: ['01 Nivel de aceite motor', '02 Fugas de fluidos', '03 Filtro de aire', '04 Pérdida de potencia', '05 Compresora de aire'] },
                { key: 'caj', title: 'CAJA - CORONAS', icon: 'bi-gear-wide-connected', items: ['06 Embrague', '07 Palanca de cambios', '08 Freno de Motor', '09 Ruido en caja de cambios'] },
                { key: 'ref', title: 'REFRIGERACION', icon: 'bi-thermometer-half', items: ['10 Nivel de refrigerante', '11 Fugas de refrigerante', '12 Radiador, intercooler'] },
                { key: 'dir', title: 'DIRECCION', icon: 'bi-compass', items: ['13 Alineamiento y balanceo', '14 Caja de dirección', '15 Barras y terminales'] },
                { key: 'cab', title: 'CABINA Y CHASIS', icon: 'bi-truck-front', items: ['16 Tablero e instrumentos', '17 Lunas y parabrisas', '18 Cinturones de seguridad'] }
            ];
            parsedRemolque = [
                { key: 'fre', title: 'FRENOS', icon: 'bi-hand-index-thumb', items: ['19 Revisar Zapatas', '20 Pulpo de Freno', '21 Tanque de Aire', '22 Rachet de Freno'] },
                { key: 'car', title: 'CARRETA', icon: 'bi-truck-flatbed', items: ['23 Estado de triplay', '24 Pisos sin Óxido', '25 Tiro de Remolque', '26 Muelles y Soporte'] },
                { key: 'ele', title: 'SISTEMA ELECTRICO', icon: 'bi-lightning-charge', items: ['27 Luces en general', '28 Faros delanteros', '29 Baterías y bornes', '30 Testigos check engine'] },
                { key: 'sus', title: 'SUSPENSION', icon: 'bi-arrows-expand', items: ['31 Amortiguadores', '32 Bolsas de aire', '33 Muelles y grilletes'] }
            ];
        }

        window._inspConfigTemp = {
            tracto: parsedTracto,
            remolque: parsedRemolque
        };

        window._inspConfigTabActiva = 'tracto';
        window.ckActualizarBadgesTabsConfigInsp();
        window.ckRenderizarConfigSistemasInsp();

        let modalEl = document.getElementById('modalConfigInsp');
        if (modalEl) {
            if (modalEl.parentElement !== document.body) document.body.appendChild(modalEl);
            let modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    } catch (e) {
        console.error('Error al abrir configuración de inspecciones:', e);
        alert('Error al abrir la configuración.');
    }
};

window.ckActualizarBadgesTabsConfigInsp = function() {
    const cntT = document.getElementById('insp-cnt-cfg-tracto');
    const cntR = document.getElementById('insp-cnt-cfg-remolque');
    if (cntT) cntT.textContent = (window._inspConfigTemp.tracto || []).length;
    if (cntR) cntR.textContent = (window._inspConfigTemp.remolque || []).length;
};

window.ckCambiarTabConfigUnidadInsp = function(unidad) {
    window._inspConfigTabActiva = unidad;
    const btnT = document.getElementById('insp-tab-cfg-tracto');
    const btnR = document.getElementById('insp-tab-cfg-remolque');
    const cntT = document.getElementById('insp-cnt-cfg-tracto');
    const cntR = document.getElementById('insp-cnt-cfg-remolque');

    if (btnT && btnR) {
        if (unidad === 'tracto') {
            btnT.classList.add('active', 'fw-bold');
            btnT.classList.remove('text-secondary', 'fw-semibold');
            btnT.style.background = '#ffffff';
            btnT.style.color = '#0f172a';
            btnT.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
            if (cntT) { cntT.style.background = '#e0f2fe'; cntT.style.color = '#0284c7'; }

            btnR.classList.remove('active', 'fw-bold');
            btnR.classList.add('text-secondary', 'fw-semibold');
            btnR.style.background = 'transparent';
            btnR.style.color = '#64748b';
            btnR.style.boxShadow = 'none';
            if (cntR) { cntR.style.background = ''; cntR.style.color = ''; }
        } else {
            btnR.classList.add('active', 'fw-bold');
            btnR.classList.remove('text-secondary', 'fw-semibold');
            btnR.style.background = '#ffffff';
            btnR.style.color = '#0f172a';
            btnR.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
            if (cntR) { cntR.style.background = '#e0f2fe'; cntR.style.color = '#0284c7'; }

            btnT.classList.remove('active', 'fw-bold');
            btnT.classList.add('text-secondary', 'fw-semibold');
            btnT.style.background = 'transparent';
            btnT.style.color = '#64748b';
            btnT.style.boxShadow = 'none';
            if (cntT) { cntT.style.background = ''; cntT.style.color = ''; }
        }
    }
    window.ckRenderizarConfigSistemasInsp();
};

window.ckRenderizarConfigSistemasInsp = function() {
    const container = document.getElementById('config-insp-container');
    if (!container) return;

    const unidad = window._inspConfigTabActiva || 'tracto';
    const sistemas = window._inspConfigTemp[unidad] || [];
    window.ckActualizarBadgesTabsConfigInsp();

    if (sistemas.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted bg-white rounded-4 border shadow-2xs">
                <i class="bi bi-folder2-open fs-1 text-secondary d-block mb-2"></i>
                <div class="fw-bold">No hay sistemas configurados para ${unidad.toUpperCase()}.</div>
                <small class="text-secondary">Haz clic en "+ Nuevo Sistema" para comenzar.</small>
            </div>
        `;
        return;
    }

    let html = '';
    sistemas.forEach((sys, sysIdx) => {
        const title = (sys.title || 'SISTEMA').toUpperCase();
        const icon = sys.icon || (unidad === 'tracto' ? (title.includes('LLANTA') ? 'bi-disc' : (title.includes('MOTOR') ? 'bi-gear' : 'bi-sliders')) : 'bi-truck-flatbed');
        const items = Array.isArray(sys.items) ? sys.items : [];

        let itemsHtml = '';
        items.forEach((itTxt, itemIdx) => {
            const parsed = parseCodigoTextoInsp(itTxt, itemIdx);
            itemsHtml += `
                <div class="d-flex align-items-center gap-3 p-2.5 px-3 bg-white" style="border-bottom: 1px solid #f1f5f9;">
                    <span class="text-muted fw-bold" style="font-family: monospace; font-size: 0.85rem; width: 24px; min-width: 24px; color: #94a3b8;">${parsed.codigo}</span>
                    <input type="text" class="form-control form-control-sm fw-medium text-dark border-0 bg-transparent p-0 flex-grow-1" 
                        style="font-size: 0.9rem; box-shadow: none;" 
                        value="${parsed.texto.replace(/"/g, '&quot;')}" 
                        placeholder="Descripción del ítem..." 
                        oninput="window.ckActualizarItemFallaCompuestoInsp(${sysIdx}, ${itemIdx}, null, this.value)">
                    <button type="button" class="btn btn-link text-muted p-1 text-decoration-none ck-btn-trash-item" onclick="window.ckEliminarItemFallaInsp(${sysIdx}, ${itemIdx})" title="Eliminar ítem">
                        <i class="bi bi-trash3 fs-6"></i>
                    </button>
                </div>
            `;
        });

        html += `
            <div class="mb-4">
                <!-- Encabezado del Sistema -->
                <div class="d-flex align-items-center justify-content-between px-2 mb-2">
                    <div class="d-flex align-items-center gap-2 flex-grow-1" style="max-width: 85%;">
                        <div class="d-flex align-items-center justify-content-center rounded-circle text-secondary flex-shrink-0" style="width: 28px; height: 28px; background: #e2e8f0;">
                            <i class="bi ${icon}" style="font-size: 0.85rem;"></i>
                        </div>
                        <input type="text" class="form-control form-control-sm text-dark border-0 bg-transparent p-0 fw-bold" 
                            style="font-size: 0.95rem; letter-spacing: 0.02em; font-weight: 800 !important; box-shadow: none;" 
                            value="${title.replace(/"/g, '&quot;')}" 
                            oninput="window.ckActualizarTituloSistemaInsp(${sysIdx}, this.value)"
                            placeholder="NOMBRE SISTEMA">
                        <span class="badge bg-secondary-subtle text-secondary rounded-pill px-2.5 py-1 fw-normal flex-shrink-0" style="font-size: 0.72rem;">
                            ${items.length} ítems
                        </span>
                    </div>
                    <button type="button" class="btn btn-link text-muted p-1 text-decoration-none" onclick="window.ckEliminarSistemaInsp(${sysIdx})" title="Eliminar sistema">
                        <i class="bi bi-trash3 fs-6"></i>
                    </button>
                </div>

                <!-- Tarjeta con Ítems -->
                <div class="card border-0 rounded-4 shadow-2xs overflow-hidden bg-white" style="border: 1px solid #e2e8f0 !important;">
                    <div class="d-flex flex-column">
                        ${itemsHtml}
                        
                        <!-- Barra para añadir ítem -->
                        <div class="d-flex align-items-center gap-2 p-2.5 px-3 bg-white" style="border-top: ${items.length > 0 ? '1px solid #f1f5f9' : 'none'};">
                            <i class="bi bi-plus text-primary fs-5"></i>
                            <input type="text" class="form-control form-control-sm border-0 bg-transparent text-dark p-0 flex-grow-1" 
                                id="insp-new-item-input-${sysIdx}" 
                                style="font-size: 0.88rem; box-shadow: none;" 
                                placeholder="Añadir ítem a ${title} (presiona Enter)..." 
                                onkeydown="if(event.key==='Enter'){ event.preventDefault(); window.ckAgregarItemDesdeInputInsp(${sysIdx}); }">
                            <button type="button" class="btn btn-link text-primary fw-bold text-decoration-none p-0 px-2 flex-shrink-0" style="font-size: 0.85rem;" onclick="window.ckAgregarItemDesdeInputInsp(${sysIdx})">
                                Añadir
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};

window.ckAgregarItemDesdeInputInsp = function(sysIdx) {
    const unidad = window._inspConfigTabActiva || 'tracto';
    const input = document.getElementById(`insp-new-item-input-${sysIdx}`);
    if (!input) return;
    const txt = (input.value || '').trim();
    if (!txt) return;

    const sys = window._inspConfigTemp[unidad][sysIdx];
    if (!sys) return;
    if (!Array.isArray(sys.items)) sys.items = [];

    const nextNum = sys.items.length + 1;
    const padded = String(nextNum).padStart(2, '0');
    sys.items.push(`${padded} ${txt}`);
    input.value = '';
    window.ckRenderizarConfigSistemasInsp();
};

window.ckAgregarNuevoSistemaInsp = function() {
    const unidad = window._inspConfigTabActiva || 'tracto';
    if (!window._inspConfigTemp[unidad]) window._inspConfigTemp[unidad] = [];

    const nuevoIdx = window._inspConfigTemp[unidad].length + 1;
    const padded = String(nuevoIdx).padStart(2, '0');
    window._inspConfigTemp[unidad].push({
        key: 'sys_' + Date.now(),
        title: `NUEVO SISTEMA ${padded}`,
        icon: unidad === 'tracto' ? 'bi-gear' : 'bi-truck-flatbed',
        items: []
    });

    window.ckRenderizarConfigSistemasInsp();
};

window.ckEliminarSistemaInsp = function(sysIdx) {
    const unidad = window._inspConfigTabActiva || 'tracto';
    const sys = window._inspConfigTemp[unidad][sysIdx];
    const nombre = sys ? sys.title : 'este sistema';

    if (confirm(`¿Estás seguro de eliminar el sistema "${nombre}" y todos sus ítems asociados?`)) {
        window._inspConfigTemp[unidad].splice(sysIdx, 1);
        window.ckRenderizarConfigSistemasInsp();
    }
};

window.ckActualizarTituloSistemaInsp = function(sysIdx, val) {
    const unidad = window._inspConfigTabActiva || 'tracto';
    if (window._inspConfigTemp[unidad] && window._inspConfigTemp[unidad][sysIdx]) {
        window._inspConfigTemp[unidad][sysIdx].title = (val || '').toUpperCase();
    }
};

window.ckEliminarItemFallaInsp = function(sysIdx, itemIdx) {
    const unidad = window._inspConfigTabActiva || 'tracto';
    const sys = window._inspConfigTemp[unidad][sysIdx];
    if (sys && Array.isArray(sys.items)) {
        sys.items.splice(itemIdx, 1);
        window.ckRenderizarConfigSistemasInsp();
    }
};

window.ckActualizarItemFallaCompuestoInsp = function(sysIdx, itemIdx, newCodigo, newTexto) {
    const unidad = window._inspConfigTabActiva || 'tracto';
    const sys = window._inspConfigTemp[unidad][sysIdx];
    if (sys && Array.isArray(sys.items) && sys.items[itemIdx] !== undefined) {
        const current = parseCodigoTextoInsp(sys.items[itemIdx], itemIdx);
        const cod = (newCodigo !== null && newCodigo !== undefined) ? newCodigo.trim() : current.codigo;
        const txt = (newTexto !== null && newTexto !== undefined) ? newTexto.trim() : current.texto;
        sys.items[itemIdx] = cod ? `${cod} ${txt}` : txt;
    }
};

window.guardarConfigInsp = async function() {
    try {
        const templates = [];
        (window._inspConfigTemp.tracto || []).forEach(sys => {
            templates.push({
                titulo: sys.title,
                template_id: sys.key || ('sys_' + Date.now() + Math.floor(Math.random()*100)),
                items_json: sys.items || []
            });
        });
        (window._inspConfigTemp.remolque || []).forEach(sys => {
            templates.push({
                titulo: sys.title,
                template_id: sys.key?.startsWith('rem_') ? sys.key : ('rem_' + (sys.key || Date.now())),
                items_json: sys.items || []
            });
        });

        const res = await fetch('/api/mantenimiento/inspecciones/config/guardar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templates: templates })
        });
        const json = await res.json();

        if (json && json.ok) {
            window.DYNAMIC_INSP_SCHEMA = templates.map(t => ({
                tab: t.titulo,
                template_id: t.template_id,
                items: t.items_json
            }));

            const modalEl = document.getElementById('modalConfigInsp');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            if (typeof window.showToastNotification === 'function') {
                window.showToastNotification('✅ Configuración de inspecciones guardada exitosamente.', 'success');
            } else {
                alert('✅ Configuración de inspecciones guardada exitosamente.');
            }
            recargarModulo('statusMant');
        } else {
            alert('Error al guardar configuración: ' + (json.error || 'Error desconocido'));
        }
    } catch (e) {
        console.error('Error guardando configuración:', e);
        alert('Error de conexión al guardar configuración.');
    }
};

window.ckRestaurarConfigInsp = async function() {
    if (!confirm('¿Deseas restablecer todos los sistemas y fallas a la plantilla estándar?')) return;
    
    window._inspConfigTemp = {
        tracto: [
            { key: 'mot', title: 'MOTOR', icon: 'bi-gear-fill', items: ['01 Nivel de aceite motor', '02 Fugas de fluidos', '03 Filtro de aire', '04 Pérdida de potencia', '05 Compresora de aire'] },
            { key: 'caj', title: 'CAJA - CORONAS', icon: 'bi-gear-wide-connected', items: ['06 Embrague', '07 Palanca de cambios', '08 Freno de Motor', '09 Ruido en caja de cambios'] },
            { key: 'ref', title: 'REFRIGERACION', icon: 'bi-thermometer-half', items: ['10 Nivel de refrigerante', '11 Fugas de refrigerante', '12 Radiador, intercooler'] },
            { key: 'dir', title: 'DIRECCION', icon: 'bi-compass', items: ['13 Alineamiento y balanceo', '14 Caja de dirección', '15 Barras y terminales'] },
            { key: 'cab', title: 'CABINA Y CHASIS', icon: 'bi-truck-front', items: ['16 Tablero e instrumentos', '17 Lunas y parabrisas', '18 Cinturones de seguridad'] }
        ],
        remolque: [
            { key: 'fre', title: 'FRENOS', icon: 'bi-hand-index-thumb', items: ['19 Revisar Zapatas', '20 Pulpo de Freno', '21 Tanque de Aire', '22 Rachet de Freno'] },
            { key: 'car', title: 'CARRETA', icon: 'bi-truck-flatbed', items: ['23 Estado de triplay', '24 Pisos sin Óxido', '25 Tiro de Remolque', '26 Muelles y Soporte'] },
            { key: 'ele', title: 'SISTEMA ELECTRICO', icon: 'bi-lightning-charge', items: ['27 Luces en general', '28 Faros delanteros', '29 Baterías y bornes', '30 Testigos check engine'] },
            { key: 'sus', title: 'SUSPENSION', icon: 'bi-arrows-expand', items: ['31 Amortiguadores', '32 Bolsas de aire', '33 Muelles y grilletes'] }
        ]
    };
    window.ckRenderizarConfigSistemasInsp();
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

// ── 6. NUEVAS FUNCIONES: SELECTOR DE INSPECCIÓN Y MODAL DE ELIMINACIÓN ──
window._inspPlacaSeleccionada = '';
window._inspKmSeleccionado = 0;

window.abrirModalSeleccionarTipoInspeccion = function(placa, km) {
    window._inspPlacaSeleccionada = placa || '';
    window._inspKmSeleccionado = km || 0;
    var modalEl = document.getElementById('modalTipoInspeccionSeleccion');
    if (modalEl) {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
};

window.seleccionarTipoInspeccion = function(tipo) {
    var modalEl = document.getElementById('modalTipoInspeccionSeleccion');
    if (modalEl) {
        var modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }
    var placa = window._inspPlacaSeleccionada || '';
    var km = window._inspKmSeleccionado || 0;

    setTimeout(function() {
        if (tipo === 'neumaticos') {
            if (typeof window.rotAbrirInspeccionNeumaticos === 'function') {
                window.rotAbrirInspeccionNeumaticos(placa, '', km);
            } else {
                var script = document.createElement('script');
                script.src = '/modulos/mantenimiento/neumaticos/modal_inspeccion.js?v=' + Date.now();
                script.onload = function() {
                    if (typeof window.rotAbrirInspeccionNeumaticos === 'function') {
                        window.rotAbrirInspeccionNeumaticos(placa, '', km);
                    }
                };
                document.body.appendChild(script);
            }
        } else {
            window.abrirModalNuevaInspeccion(placa, '', km);
        }
    }, 150);
};

window._inspeccionIdAEliminar = null;
window.eliminarInspeccion = function(id) {
    window._inspeccionIdAEliminar = id;
    var modalEl = document.getElementById('modalEliminarInspeccionConfirm');
    if (modalEl) {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    } else {
        if (confirm('¿Desea eliminar esta inspección?')) {
            window._ejecutarEliminarInspeccionConfirmado();
        }
    }
};

window._ejecutarEliminarInspeccionConfirmado = async function() {
    var id = window._inspeccionIdAEliminar;
    if (!id) return;
    try {
        var btn = document.getElementById('btnConfirmarEliminarInspeccion');
        if (btn) btn.disabled = true;
        
        var resp = await fetch('/api/script/eliminarRegistro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args: [id, 'Inspecciones'] })
        });
        var data = await resp.json();
        
        var modalEl = document.getElementById('modalEliminarInspeccionConfirm');
        if (modalEl) {
            var modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
        
        if (data && (data.ok || data.status === 'success' || data.success)) {
            if (typeof window.rotToast === 'function') window.rotToast('Inspección eliminada correctamente', 'bg-success');
            if (typeof window.recargarModulo === 'function') window.recargarModulo('statusMant');
            else if (typeof window.inicializarModuloStatus === 'function') window.inicializarModuloStatus();
        } else {
            if (typeof window.rotToast === 'function') window.rotToast('Error: ' + (data?.message || 'No se pudo eliminar'), 'bg-danger');
            else alert('Error al eliminar: ' + (data?.message || 'Desconocido'));
        }
    } catch(err) {
        console.error('Error al eliminar inspección:', err);
        if (typeof window.rotToast === 'function') window.rotToast('Error de conexión', 'bg-danger');
    } finally {
        var btn = document.getElementById('btnConfirmarEliminarInspeccion');
        if (btn) btn.disabled = false;
        window._inspeccionIdAEliminar = null;
    }
};
