/**
 * modal_inspeccion.js — Módulo Interactivo de Inspección de Neumáticos (Three.js 3D/2D + Bento UI)
 * ERP Azkell Fleet — Ultra-Optimized 60 FPS Engine
 */

(function() {
    // ── ESTADOS GLOBALES Y CATÁLOGOS ───────────────────────────────────────────────
    window._neuCatalogos = window._neuCatalogos || null;
    window._neuLlantasActuales = []; // inspectionQueue
    window._neuValR1 = 0;
    window._neuValR2 = 0;
    window._neuValR3 = 0;
    window._neuValR4 = 0;
    window._neuPosicionActiva = '1';
    window._neuFotos = { foto1: null, foto2: null, foto3: null };
    window._neuConfigActualKey = '6X4';
    window._neuXRayActive = false;
    window._neuViewMode = '2d'; // '2d', 'iso', 'lat'
    window._neuAnimationId = null;
    window._neuNeedsRender = true;

    // ── MAPEO VEHICULAR MTC Y CONFIGURACIONES PARAMÉTRICAS 3D ─────────────────────
    const ALIAS_MAPPER = {
        "C2": "4X2", "T2": "4X2", "4X2": "4X2",
        "C3": "6X4", "T3": "6X4", "6X4": "6X4",
        "6X2": "6X2",
        "R2": "R2",
        "S2": "S2", "S3": "S3",
        "T3S3": "T3S3", "C3S3": "T3S3"
    };

    const VEHICLE_CONFIGS_3D = {
        "4X2": {
            name: "C2 / T2 / 4x2 (6 Llantas)",
            totalTires: 6,
            positions: ["1", "2", "3", "4", "5", "6", "R"],
            axles: [
                { id: 1, z: -2.8, isDual: false, tires: [{ id: "1", side: "left", isOuter: false }, { id: "2", side: "right", isOuter: false }] },
                { id: 2, z: 2.4,  isDual: true,  tires: [{ id: "3", side: "left", isOuter: true }, { id: "4", side: "left", isOuter: false }, { id: "5", side: "right", isOuter: false }, { id: "6", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R", pos: [0, 0.6, -0.2] }]
        },
        "6X4": {
            name: "C3 / T3 / 6x4 (10 Llantas)",
            totalTires: 10,
            positions: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "R"],
            axles: [
                { id: 1, z: -3.6, isDual: false, tires: [{ id: "1", side: "left", isOuter: false }, { id: "2", side: "right", isOuter: false }] },
                { id: 2, z: 1.6,  isDual: true,  tires: [{ id: "3", side: "left", isOuter: true }, { id: "4", side: "left", isOuter: false }, { id: "5", side: "right", isOuter: false }, { id: "6", side: "right", isOuter: true }] },
                { id: 3, z: 3.5,  isDual: true,  tires: [{ id: "7", side: "left", isOuter: true }, { id: "8", side: "left", isOuter: false }, { id: "9", side: "right", isOuter: false }, { id: "10", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R", pos: [0, 0.6, -0.8] }]
        },
        "6X2": {
            name: "6x2 (8 Llantas)",
            totalTires: 8,
            positions: ["1", "2", "3", "4", "5", "6", "7", "8", "R"],
            axles: [
                { id: 1, z: -3.6, isDual: false, tires: [{ id: "1", side: "left", isOuter: false }, { id: "2", side: "right", isOuter: false }] },
                { id: 2, z: 1.6,  isDual: false, tires: [{ id: "3", side: "left", isOuter: false }, { id: "4", side: "right", isOuter: false }] },
                { id: 3, z: 3.5,  isDual: true,  tires: [{ id: "5", side: "left", isOuter: true }, { id: "6", side: "left", isOuter: false }, { id: "7", side: "right", isOuter: false }, { id: "8", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R", pos: [0, 0.6, -0.8] }]
        },
        "R2": {
            name: "R2 Carreta / Burrita (8 Llantas)",
            totalTires: 8,
            positions: ["1", "2", "3", "4", "5", "6", "7", "8", "R"],
            axles: [
                { id: 1, z: -1.8, isDual: true, tires: [{ id: "1", side: "left", isOuter: true }, { id: "2", side: "left", isOuter: false }, { id: "3", side: "right", isOuter: false }, { id: "4", side: "right", isOuter: true }] },
                { id: 2, z: 2.2,  isDual: true, tires: [{ id: "5", side: "left", isOuter: true }, { id: "6", side: "left", isOuter: false }, { id: "7", side: "right", isOuter: false }, { id: "8", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R", pos: [0, 0.6, 0.2] }]
        },
        "S2": {
            name: "S2 Semiremolque (8 Llantas)",
            totalTires: 8,
            positions: ["1", "2", "3", "4", "5", "6", "7", "8", "R1", "R2"],
            axles: [
                { id: 1, z: 1.6, isDual: true, tires: [{ id: "1", side: "left", isOuter: true }, { id: "2", side: "left", isOuter: false }, { id: "3", side: "right", isOuter: false }, { id: "4", side: "right", isOuter: true }] },
                { id: 2, z: 3.5, isDual: true, tires: [{ id: "5", side: "left", isOuter: true }, { id: "6", side: "left", isOuter: false }, { id: "7", side: "right", isOuter: false }, { id: "8", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R1", pos: [-0.85, 0.6, -1.2] }, { id: "R2", pos: [0.85, 0.6, -1.2] }]
        },
        "S3": {
            name: "S3 Semiremolque (12 Llantas)",
            totalTires: 12,
            positions: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "R1", "R2"],
            axles: [
                { id: 1, z: 1.0,  isDual: true, tires: [{ id: "1", side: "left", isOuter: true }, { id: "2", side: "left", isOuter: false }, { id: "3", side: "right", isOuter: false }, { id: "4", side: "right", isOuter: true }] },
                { id: 2, z: 2.85, isDual: true, tires: [{ id: "5", side: "left", isOuter: true }, { id: "6", side: "left", isOuter: false }, { id: "7", side: "right", isOuter: false }, { id: "8", side: "right", isOuter: true }] },
                { id: 3, z: 4.7,  isDual: true, tires: [{ id: "9", side: "left", isOuter: true }, { id: "10", side: "left", isOuter: false }, { id: "11", side: "right", isOuter: false }, { id: "12", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R1", pos: [-0.85, 0.6, -1.2] }, { id: "R2", pos: [0.85, 0.6, -1.2] }]
        },
        "T3S3": {
            name: "Combinación T3S3 / C3S3 (22 Llantas)",
            totalTires: 22,
            positions: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","R1","R2"],
            axles: [
                { id: 1, z: -8.0, isDual: false, tires: [{ id: "1", side: "left", isOuter: false }, { id: "2", side: "right", isOuter: false }] },
                { id: 2, z: -3.8, isDual: true,  tires: [{ id: "3", side: "left", isOuter: true }, { id: "4", side: "left", isOuter: false }, { id: "5", side: "right", isOuter: false }, { id: "6", side: "right", isOuter: true }] },
                { id: 3, z: -2.0, isDual: true,  tires: [{ id: "7", side: "left", isOuter: true }, { id: "8", side: "left", isOuter: false }, { id: "9", side: "right", isOuter: false }, { id: "10", side: "right", isOuter: true }] },
                { id: 4, z: 3.2,  isDual: true,  tires: [{ id: "11", side: "left", isOuter: true }, { id: "12", side: "left", isOuter: false }, { id: "13", side: "right", isOuter: false }, { id: "14", side: "right", isOuter: true }] },
                { id: 5, z: 5.0,  isDual: true,  tires: [{ id: "15", side: "left", isOuter: true }, { id: "16", side: "left", isOuter: false }, { id: "17", side: "right", isOuter: false }, { id: "18", side: "right", isOuter: true }] },
                { id: 6, z: 6.8,  isDual: true,  tires: [{ id: "19", side: "left", isOuter: true }, { id: "20", side: "left", isOuter: false }, { id: "21", side: "right", isOuter: false }, { id: "22", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R1", pos: [-0.85, 0.8, -5.2] }, { id: "R2", pos: [0.85, 0.8, 0.6] }]
        }
    };

    // ── ESTILOS CSS CON PROCESAMIENTO GPU Y SIN DOBLE BLUR ─────────────────────────
    if (!document.getElementById('estilos-drawer-neumaticos')) {
        const style = document.createElement('style');
        style.id = 'estilos-drawer-neumaticos';
        style.innerHTML = `
            .neu-drawer-backdrop {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.15) !important;
                z-index: 2090 !important;
                opacity: 0;
                transition: opacity 0.18s cubic-bezier(0, 0, 0.2, 1);
                pointer-events: none;
            }
            .neu-drawer-backdrop.show {
                display: block !important;
                opacity: 1 !important;
                pointer-events: auto !important;
            }
            .neu-sub-drawer {
                position: fixed !important;
                bottom: 0 !important;
                left: 50% !important;
                top: auto !important;
                right: auto !important;
                transform: translate3d(-50%, 100%, 0) !important;
                width: 100% !important;
                max-width: 700px !important;
                height: 92vh !important;
                max-height: 92vh !important;
                background: var(--surface, #ffffff) !important;
                border: 1px solid var(--border, #e2e8f0) !important;
                border-bottom: none !important;
                border-radius: 28px 28px 0 0 !important;
                box-shadow: 0 -16px 48px rgba(0,0,0,0.22) !important;
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
                will-change: transform;
                backface-visibility: hidden;
                -webkit-backface-visibility: hidden;
                z-index: 2100 !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                visibility: hidden;
                pointer-events: none;
                margin: 0 !important;
            }
            .neu-sub-drawer.open {
                transform: translate3d(-50%, 0, 0) !important;
                visibility: visible !important;
                pointer-events: auto !important;
                display: flex !important;
            }
            @media (max-width: 767.98px) {
                .neu-sub-drawer {
                    max-width: 100% !important;
                    left: 0 !important;
                    transform: translateY(100%) !important;
                    border-radius: 28px 28px 0 0 !important;
                }
                .neu-sub-drawer.open {
                    transform: translateY(0) !important;
                }
            }
            .neu-touch-btn-pos {
                min-width: 44px;
                height: 42px;
                font-size: 0.9rem;
                font-weight: 800;
                border-radius: 12px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                user-select: none;
                transition: background-color 0.1s ease;
            }
            .neu-touch-btn-pos:active { transform: scale(0.95); }
            .neu-touch-btn-r {
                min-width: 40px;
                height: 38px;
                font-size: 0.85rem;
                font-weight: 700;
                border-radius: 10px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .neu-scroll-x {
                display: flex;
                overflow-x: auto;
                scroll-behavior: smooth;
                -webkit-overflow-scrolling: touch;
                padding: 4px 2px;
                gap: 6px;
            }
            .neu-scroll-x::-webkit-scrollbar { height: 4px; }
            .neu-scroll-x::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            .neu-toast {
                position: fixed !important;
                bottom: 24px !important;
                left: 50% !important;
                transform: translateX(-50%) translateY(20px) !important;
                background: #0f172a !important;
                color: #ffffff !important;
                padding: 10px 22px !important;
                border-radius: 9999px !important;
                font-size: 0.85rem !important;
                font-weight: 700 !important;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
                z-index: 999999 !important;
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                opacity: 0 !important;
                transition: opacity 0.2s ease, transform 0.2s ease !important;
                pointer-events: none !important;
                border: 1px solid #334155 !important;
            }
            .neu-toast span, .neu-toast i {
                color: #ffffff !important;
            }
            .neu-toast.show {
                opacity: 1 !important;
                transform: translateX(-50%) translateY(0) !important;
            }
            .neu-row-active {
                background: rgba(37, 99, 235, 0.08) !important;
                font-weight: 600;
            }
        `;
        document.head.appendChild(style);
    }

    // ── CARGADOR EXTERNO DE THREE.JS Y ORBITCONTROLS ─────────────────────────────
    function loadThreeJs(callback) {
        if (window.THREE && window.THREE.OrbitControls) {
            callback();
            return;
        }
        if (window.THREE && !window.THREE.OrbitControls) {
            var script2 = document.createElement('script');
            script2.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
            script2.onload = callback;
            document.head.appendChild(script2);
            return;
        }
        var script1 = document.createElement('script');
        script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        script1.onload = function() {
            var script2 = document.createElement('script');
            script2.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
            script2.onload = callback;
            document.head.appendChild(script2);
        };
        document.head.appendChild(script1);
    }

    // ── CARGA DE CATÁLOGOS DESDE BACKEND ──────────────────────────────────────────
    window._cargarCatalogosNeumaticos = async function() {
        if (window._neuCatalogos) return window._neuCatalogos;
        try {
            const res = await fetch('/api/neumaticos/catalogos');
            const data = await res.json();
            if (data.ok) {
                window._neuCatalogos = data;
                return data;
            }
        } catch (e) {
            console.error('Error cargando catálogos de neumáticos:', e);
        }
        return { marcas: ['WINDPOWER','GOODYEAR','BRIDGESTONE','MICHELIN','ADVANCE'], medidas: ['275/70R22.5','295/80R22.5','315/80R22.5','11R22.5','12R22.5'], modelos: ['PROGUO1','KMAX','M729','XZY3','GL282A'], acciones: ['Inspección','Rotación','Cambio','Reparación','Reencauche','Baja'] };
    };

    // ── APERTURA DEL MODAL PRINCIPAL ──────────────────────────────────────────────
    window.rotAbrirInspeccionNeumaticos = async function(placa, idOT, kmVehiculo, configCode) {
        window._neuLlantasActuales = [];
        window._neuFotos = { foto1: null, foto2: null, foto3: null };
        window._neuValR1 = 0; window._neuValR2 = 0; window._neuValR3 = 0; window._neuValR4 = 0;
        window._neuPosicionActiva = '1';
        window._neuXRayActive = false;
        window._neuViewMode = '2d';

        // Mapear configuración si fue provista
        const rawCode = (configCode || '').toUpperCase().trim();
        window._neuConfigActualKey = ALIAS_MAPPER[rawCode] || '6X4';

        const hoy = new Date().toISOString().split('T')[0];
        const km = kmVehiculo || (window.rotData ? (window.rotData.find(o => o.id == idOT)?.kilometraje || '') : '');

        // Backdrop ligero de cierre
        let backdrop = document.getElementById('neuDrawerBackdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'neuDrawerBackdrop';
            backdrop.className = 'neu-drawer-backdrop';
            backdrop.onclick = window.rotCerrarModalInspeccionNeumaticos;
            document.body.appendChild(backdrop);
        }

        // Drawer
        let drawerEl = document.getElementById('rot-drawer-neumaticos');
        if (!drawerEl) {
            drawerEl = document.createElement('div');
            drawerEl.className = 'neu-sub-drawer';
            drawerEl.id = 'rot-drawer-neumaticos';
            drawerEl.innerHTML = `
                <!-- HEADER BENTO -->
                <div class="rot-drawer-hd d-flex align-items-center justify-content-between px-3 py-2 border-bottom bg-white" style="height: auto; min-height: 54px;">
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-sm btn-light border rounded-circle d-flex align-items-center justify-content-center me-1 shadow-2xs" 
                                onclick="window.rotCerrarModalInspeccionNeumaticos()" 
                                title="Volver" 
                                style="width: 34px; height: 34px; color: var(--subtext);">
                            <i class="bi bi-arrow-left"></i>
                        </button>
                        <div>
                            <span class="rot-drawer-title fw-bold text-dark d-flex align-items-center gap-2" style="font-size: 1.05rem;">
                                <i class="bi bi-disc-fill text-primary"></i> Inspección de Neumáticos
                                <span class="badge bg-primary rounded-pill px-2.5 py-0.5 fs-6 font-monospace" id="neu-badge-placa">${placa || 'PLACA'}</span>
                            </span>
                            <small class="text-muted d-block" style="font-size: 0.72rem;">Control táctil de cocadas, presiones y chasis interactivo</small>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-light border-0 rounded-circle p-1" onclick="window.rotCerrarModalInspeccionNeumaticos()" style="color:var(--subtext);" title="Cerrar">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>

                <!-- BODY SCROLL -->
                <div class="p-3 overflow-auto custom-scrollbar flex-grow-1" id="neu-drawer-scroll-body" style="background: #f8fafc; padding-bottom: 90px !important;">
                    
                    <!-- BENTO 1: Encabezado General -->
                    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
                        <div class="row g-2">
                            <div class="col-12 col-sm-4">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">Fecha de Inspección *</label>
                                <input type="date" class="form-control form-control-sm rounded-3 fw-bold font-monospace" id="neu-input-fecha" value="${hoy}" style="height: 38px;">
                            </div>
                            <div class="col-6 col-sm-4">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">Días Propuestos</label>
                                <div class="input-group input-group-sm" style="height: 38px;">
                                    <button class="btn btn-outline-secondary px-2.5" type="button" onclick="var el=document.getElementById('neu-input-dias'); el.value = Math.max(1, (parseInt(el.value)||30)-5);"><i class="bi bi-dash"></i></button>
                                    <input type="number" class="form-control text-center fw-bold font-monospace" id="neu-input-dias" value="30">
                                    <button class="btn btn-outline-secondary px-2.5" type="button" onclick="var el=document.getElementById('neu-input-dias'); el.value = (parseInt(el.value)||30)+5;"><i class="bi bi-plus"></i></button>
                                </div>
                            </div>
                            <div class="col-6 col-sm-4">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">KM Odómetro</label>
                                <input type="number" class="form-control form-control-sm rounded-3 fw-bold font-monospace" id="neu-input-km" value="${km}" style="height: 38px;">
                            </div>
                            <div class="col-12">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">Observaciones Generales</label>
                                <input type="text" class="form-control form-control-sm rounded-3" id="neu-input-obs-gen" placeholder="Ej: Inspección rutinaria de flota mensual..." style="height: 38px;">
                            </div>
                        </div>
                    </div>

                    <!-- BENTO 2: Esquema Interactivo 3D/2D de Chasis -->
                    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important; position:relative;">
                        <div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
                            <h6 class="fw-bold m-0 small text-dark d-flex align-items-center gap-1">
                                <i class="bi bi-truck text-primary"></i> ESQUEMA VISUAL DE EJES Y LLANTAS
                            </h6>
                            
                            <div class="d-flex align-items-center gap-1 flex-wrap">
                                <button class="btn btn-sm btn-primary py-1 px-2.5 rounded-pill fw-bold" id="btn-view-2d" onclick="window._neuSetViewMode('2d')" style="font-size: 0.76rem;">
                                    <i class="bi bi-arrows-fullscreen me-1"></i> Vista 2D
                                </button>
                                <button class="btn btn-sm btn-outline-secondary py-1 px-2.5 rounded-pill fw-bold" id="btn-view-iso" onclick="window._neuSetViewMode('iso')" style="font-size: 0.76rem;">
                                    <i class="bi bi-box-seam me-1"></i> Isométrica
                                </button>
                                <button class="btn btn-sm btn-outline-secondary py-1 px-2.5 rounded-pill fw-bold" id="btn-view-lat" onclick="window._neuSetViewMode('lat')" style="font-size: 0.76rem;">
                                    <i class="bi bi-truck me-1"></i> Lateral
                                </button>
                                <button class="btn btn-sm btn-outline-warning py-1 px-2.5 rounded-pill fw-bold" id="btn-xray" onclick="window._neuToggleXRay()" style="font-size: 0.76rem;">
                                    <i class="bi bi-eye-fill me-1"></i> Rayos X
                                </button>
                            </div>
                        </div>

                        <!-- Canvas 3D / 2D Wrapper -->
                        <div class="p-0 rounded-4 overflow-hidden position-relative" style="height: 380px; background: #f8fafc; border: 1px solid #cbd5e1;" id="neu-chassis-container">
                            <!-- Banner flotante de instrucción al arrastrar -->
                            <div id="dragInstructionBanner" style="position:absolute; top:10px; left:50%; transform:translateX(-50%); background: linear-gradient(90deg, #2563eb, #1d4ed8); color:#fff; padding:6px 18px; border-radius:30px; font-size:0.78rem; font-weight:700; display:none; pointer-events:none; z-index:20; box-shadow:0 6px 16px rgba(37,99,235,0.35);">
                                <i class="bi bi-hand-index-thumb-fill me-1 text-warning"></i> Arrastrando llanta — Suelta sobre otra posición para intercambiar
                            </div>
                        </div>

                        <!-- Leyenda Semáforo -->
                        <div class="d-flex justify-content-between align-items-center mt-2 px-1 flex-wrap gap-2" style="font-size: 0.74rem;">
                            <div class="d-flex align-items-center gap-2 flex-wrap">
                                <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:9px;height:9px;background:#10b981;"></span> <b>Óptima (>6mm)</b></div>
                                <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:9px;height:9px;background:#f59e0b;"></span> <b>Alerta (4-6mm)</b></div>
                                <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:9px;height:9px;background:#ef4444;"></span> <b>Crítica (≤4mm)</b></div>
                                <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:9px;height:9px;background:#2563eb;"></span> <b>Rotada 🔄</b></div>
                            </div>
                            <span class="text-muted fw-bold font-monospace" id="neu-chassis-stats-summary">Total: 0 llantas</span>
                        </div>
                    </div>

                    <!-- BENTO 3: Formulario Táctil de Llanta Seleccionada -->
                    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
                        <div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-primary rounded-circle d-flex align-items-center justify-content-center shadow-sm font-monospace" style="width:32px;height:32px; font-size:0.9rem;" id="neu-form-pos-badge">1</span>
                                <h6 class="fw-bold m-0 text-dark small">Datos de Llanta — Posición <span id="neu-pos-label-top" class="text-primary font-monospace">1</span></h6>
                            </div>
                            <button class="btn btn-sm btn-light border py-1 px-2.5 rounded-pill fw-bold text-muted" style="font-size:0.72rem;" onclick="window._neuLimpiarFormLlanta()">
                                <i class="bi bi-arrow-counterclockwise me-1"></i> Limpiar Campos
                            </button>
                        </div>

                        <!-- Selector Táctil de Posición -->
                        <div class="mb-3">
                            <label class="form-label text-muted fw-bold small mb-1 d-block" style="font-size:0.74rem;">SELECCIONAR POSICIÓN:</label>
                            <div class="neu-scroll-x" id="neu-pos-selector"></div>
                        </div>

                        <!-- Marca, Medida, Modelo con Buscador Autocomplete -->
                        <div class="row g-2 mb-3">
                            <div class="col-12 col-sm-4">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.72rem;">Marca</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('marcas')" class="text-primary small fw-bold" style="font-size:0.72rem;">+ Nueva</a>
                                </div>
                                <input type="text" class="form-control form-control-sm rounded-3 fw-bold text-uppercase" style="height: 38px;" id="neu-sel-marca" list="dl-neu-marcas" placeholder="Buscar marca..." autocomplete="off">
                                <datalist id="dl-neu-marcas"></datalist>
                            </div>
                            <div class="col-12 col-sm-4">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.72rem;">Medida</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('medidas')" class="text-primary small fw-bold" style="font-size:0.72rem;">+ Nueva</a>
                                </div>
                                <input type="text" class="form-control form-control-sm rounded-3 fw-bold text-uppercase font-monospace" style="height: 38px;" id="neu-sel-medida" list="dl-neu-medidas" placeholder="Buscar medida..." autocomplete="off">
                                <datalist id="dl-neu-medidas"></datalist>
                            </div>
                            <div class="col-12 col-sm-4">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.72rem;">Modelo</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('modelos')" class="text-primary small fw-bold" style="font-size:0.72rem;">+ Nuevo</a>
                                </div>
                                <input type="text" class="form-control form-control-sm rounded-3 fw-bold text-uppercase" style="height: 38px;" id="neu-sel-modelo" list="dl-neu-modelos" placeholder="Buscar modelo..." autocomplete="off">
                                <datalist id="dl-neu-modelos"></datalist>
                            </div>
                        </div>

                        <!-- Profundímetro Táctil (R1, R2, R3, R4) con Rango Completo 0..24mm -->
                        <div class="mb-3 p-2.5 rounded-4 bg-light border" style="border-color: #e2e8f0 !important;">
                            <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom flex-wrap gap-2">
                                <div>
                                    <h6 class="m-0 fw-bold text-dark d-flex align-items-center gap-1" style="font-size: 0.88rem;">
                                        <i class="bi bi-rulers text-primary"></i> Profundímetro Táctil (0 a 24 mm)
                                    </h6>
                                    <small class="text-muted" style="font-size:0.72rem;">Toca el número medido para cada ranura</small>
                                </div>
                                <span class="badge bg-white text-primary border shadow-sm px-2.5 py-1.5 fs-6 rounded-pill font-monospace" id="neu-r-prom-badge">Promedio: -- mm</span>
                            </div>

                            <!-- R1 (Exterior) -->
                            <div class="mb-2 p-2 bg-white rounded-3 border" style="border-color: #e2e8f0 !important;">
                                <div class="d-flex align-items-center justify-content-between mb-1">
                                    <span class="fw-bold text-dark" style="font-size:0.8rem;">
                                        <i class="bi bi-arrow-left-circle-fill text-primary me-1"></i> R1 — Ranura Exterior:
                                    </span>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:28px;height:28px;" onclick="window._neuAjustarR('r1', -1)"><i class="bi bi-dash"></i></button>
                                        <span class="badge bg-primary px-2.5 py-1 fs-6 rounded-pill font-monospace text-white fw-bold shadow-2xs" id="lbl-r1">0 mm</span>
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:28px;height:28px;" onclick="window._neuAjustarR('r1', 1)"><i class="bi bi-plus"></i></button>
                                    </div>
                                </div>
                                <div class="neu-scroll-x" id="neu-r1-buttons"></div>
                            </div>

                            <!-- R2 (Centro 1) -->
                            <div class="mb-2 p-2 bg-white rounded-3 border" style="border-color: #e2e8f0 !important;">
                                <div class="d-flex align-items-center justify-content-between mb-1">
                                    <span class="fw-bold text-dark" style="font-size:0.8rem;">
                                        <i class="bi bi-record-circle-fill text-primary me-1"></i> R2 — Ranura Central 1:
                                    </span>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:28px;height:28px;" onclick="window._neuAjustarR('r2', -1)"><i class="bi bi-dash"></i></button>
                                        <span class="badge bg-primary px-2.5 py-1 fs-6 rounded-pill font-monospace text-white fw-bold shadow-2xs" id="lbl-r2">0 mm</span>
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:28px;height:28px;" onclick="window._neuAjustarR('r2', 1)"><i class="bi bi-plus"></i></button>
                                    </div>
                                </div>
                                <div class="neu-scroll-x" id="neu-r2-buttons"></div>
                            </div>

                            <!-- R3 (Centro 2 / Interior) -->
                            <div class="mb-2 p-2 bg-white rounded-3 border" style="border-color: #e2e8f0 !important;">
                                <div class="d-flex align-items-center justify-content-between mb-1">
                                    <span class="fw-bold text-dark" style="font-size:0.8rem;">
                                        <i class="bi bi-arrow-right-circle-fill text-primary me-1"></i> R3 — Ranura Interior:
                                    </span>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:28px;height:28px;" onclick="window._neuAjustarR('r3', -1)"><i class="bi bi-dash"></i></button>
                                        <span class="badge bg-primary px-2.5 py-1 fs-6 rounded-pill font-monospace text-white fw-bold shadow-2xs" id="lbl-r3">0 mm</span>
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:28px;height:28px;" onclick="window._neuAjustarR('r3', 1)"><i class="bi bi-plus"></i></button>
                                    </div>
                                </div>
                                <div class="neu-scroll-x" id="neu-r3-buttons"></div>
                            </div>

                            <!-- R4 (Hombro Interior - Opcional) -->
                            <div class="p-2 bg-white rounded-3 border" style="border-color: #e2e8f0 !important;">
                                <div class="d-flex align-items-center justify-content-between mb-1">
                                    <span class="fw-bold text-dark" style="font-size:0.8rem;">
                                        <i class="bi bi-dash-circle text-muted me-1"></i> R4 — Hombro Interior (Opcional):
                                    </span>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:28px;height:28px;" onclick="window._neuAjustarR('r4', -1)"><i class="bi bi-dash"></i></button>
                                        <span class="badge bg-secondary px-2.5 py-1 fs-6 rounded-pill font-monospace text-white fw-bold" id="lbl-r4">0 mm</span>
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:28px;height:28px;" onclick="window._neuAjustarR('r4', 1)"><i class="bi bi-plus"></i></button>
                                    </div>
                                </div>
                                <div class="neu-scroll-x" id="neu-r4-buttons"></div>
                            </div>
                        </div>

                        <!-- Presión, Estado, Acción, ROT -->
                        <div class="row g-2 mb-3">
                            <div class="col-6 col-sm-3">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">Presión Ant. (PSI)</label>
                                <input type="number" class="form-control form-control-sm rounded-3 fw-bold text-center font-monospace" style="height: 38px;" id="neu-input-pres-ant" value="" placeholder="Ej: 100">
                            </div>
                            <div class="col-6 col-sm-3">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">Presión Actual (PSI)</label>
                                <input type="number" class="form-control form-control-sm rounded-3 fw-bold text-center text-primary font-monospace" style="height: 38px;" id="neu-input-pres-act" value="" placeholder="Ej: 110">
                            </div>
                            <div class="col-6 col-sm-2">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">Estado</label>
                                <select class="form-select form-select-sm rounded-3 fw-semibold" style="height: 38px;" id="neu-sel-estado">
                                    <option value="NUEVA">NUEVA</option>
                                    <option value="BUENA">BUENA</option>
                                    <option value="RECAPADA">RECAPADA</option>
                                    <option value="REGULAR">REGULAR</option>
                                    <option value="MALA">MALA</option>
                                    <option value="CRÍTICA">CRÍTICA</option>
                                </select>
                            </div>
                            <div class="col-6 col-sm-2">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.72rem;">Acción</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('acciones')" class="text-primary small fw-bold" style="font-size:0.7rem;">+ Nueva</a>
                                </div>
                                <select class="form-select form-select-sm rounded-3 fw-semibold" style="height: 38px;" id="neu-sel-accion">
                                    <option value="Inspección">Inspección</option>
                                    <option value="Rotación">Rotación</option>
                                    <option value="Cambio">Cambio</option>
                                    <option value="Reparación">Reparación</option>
                                    <option value="Reencauche">Reencauche</option>
                                    <option value="Baja">Baja</option>
                                </select>
                            </div>
                            <div class="col-12 col-sm-2">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">ROT (Rotación)</label>
                                <select class="form-select form-select-sm rounded-3 fw-semibold" style="height: 38px;" id="neu-sel-rot">
                                    <option value="NO">NO</option>
                                    <option value="SI">SI</option>
                                </select>
                            </div>
                        </div>

                        <!-- Fotos 1, 2, 3 -->
                        <div class="mb-3 p-2.5 bg-light rounded-3 border" style="border-color: #e2e8f0 !important;">
                            <label class="form-label text-muted fw-bold small mb-1.5 d-block" style="font-size:0.74rem;">
                                <i class="bi bi-camera-fill text-primary me-1"></i> Evidencia Fotográfica (Foto 1, Foto 2, Foto 3)
                            </label>
                            <div class="row g-2">
                                <div class="col-4">
                                    <input type="file" id="neu-file-foto1" accept="image/*" class="d-none" onchange="window._neuProcesarFoto(1, this)">
                                    <button type="button" class="btn btn-outline-secondary w-100 py-1.5 rounded-3 text-truncate fw-semibold d-flex flex-column align-items-center justify-content-center" style="height: 48px; font-size: 0.78rem;" onclick="document.getElementById('neu-file-foto1').click()" id="btn-neu-foto1">
                                        <i class="bi bi-camera fs-6"></i>
                                        <span>Foto 1</span>
                                    </button>
                                </div>
                                <div class="col-4">
                                    <input type="file" id="neu-file-foto2" accept="image/*" class="d-none" onchange="window._neuProcesarFoto(2, this)">
                                    <button type="button" class="btn btn-outline-secondary w-100 py-1.5 rounded-3 text-truncate fw-semibold d-flex flex-column align-items-center justify-content-center" style="height: 48px; font-size: 0.78rem;" onclick="document.getElementById('neu-file-foto2').click()" id="btn-neu-foto2">
                                        <i class="bi bi-camera fs-6"></i>
                                        <span>Foto 2</span>
                                    </button>
                                </div>
                                <div class="col-4">
                                    <input type="file" id="neu-file-foto3" accept="image/*" class="d-none" onchange="window._neuProcesarFoto(3, this)">
                                    <button type="button" class="btn btn-outline-secondary w-100 py-1.5 rounded-3 text-truncate fw-semibold d-flex flex-column align-items-center justify-content-center" style="height: 48px; font-size: 0.78rem;" onclick="document.getElementById('neu-file-foto3').click()" id="btn-neu-foto3">
                                        <i class="bi bi-camera fs-6"></i>
                                        <span>Foto 3</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Observación de la llanta -->
                        <div class="mb-3">
                            <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.74rem;">Observación de la Llanta (OBS)</label>
                            <input type="text" class="form-control form-control-sm rounded-3" style="height: 38px;" id="neu-input-obs-item" value="" placeholder="Ej: Desgaste regular, sin cortes...">
                        </div>

                        <!-- Botón Guardar / Actualizar Llanta en la Lista -->
                        <button class="btn btn-primary rounded-pill py-2.5 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2 w-100" style="font-size: 0.88rem;" onclick="window._neuGuardarLlantaEnLista()">
                            <i class="bi bi-check-circle-fill fs-6"></i> Guardar / Actualizar Llanta y Pasar a la Siguiente
                        </button>
                    </div>

                    <!-- BENTO 4: Llantas Inspeccionadas -->
                    <div class="card border-0 rounded-4 overflow-hidden bg-white shadow-2xs mb-3" style="border: 1px solid #e2e8f0 !important;">
                        <div class="card-header bg-light px-3 py-2.5 d-flex align-items-center justify-content-between border-bottom">
                            <div class="d-flex align-items-center gap-2">
                                <h6 class="m-0 fw-bold text-dark small">Llantas Agregadas a la Inspección</h6>
                                <span class="badge bg-primary rounded-pill px-2.5 fs-6 font-monospace" id="neu-tabla-count">0</span>
                            </div>
                            <small class="text-muted" style="font-size:0.72rem;">Haz clic en cualquier fila para editar su remanente</small>
                        </div>
                        <div class="table-responsive" style="max-height: 260px;">
                            <table class="table table-hover table-sm align-middle mb-0" style="font-size: 0.78rem;">
                                <thead class="table-light text-muted fw-bold">
                                    <tr>
                                        <th class="ps-3">Pos</th>
                                        <th>Marca</th>
                                        <th>Medida</th>
                                        <th>Modelo</th>
                                        <th class="text-center">R1</th>
                                        <th class="text-center">R2</th>
                                        <th class="text-center">R3</th>
                                        <th class="text-center">R4</th>
                                        <th class="text-center">Prom</th>
                                        <th class="text-center">Presión</th>
                                        <th>Estado</th>
                                        <th>Acción</th>
                                        <th class="text-center">ROT</th>
                                        <th class="text-center">Fotos</th>
                                        <th>Obs</th>
                                        <th class="text-center pe-3">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody id="neu-tabla-tbody">
                                    <tr><td colspan="16" class="text-center text-muted py-3">Aún no has agregado ninguna llanta a la inspección.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- FOOTER FIJO -->
                <div class="rot-drawer-footer bg-white border-top px-3 py-2 d-flex align-items-center justify-content-between gap-2" style="position: sticky; bottom: 0; z-index: 10; height: 56px;">
                    <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-3 py-1.5 fw-bold" onclick="window.rotCerrarModalInspeccionNeumaticos()">Cancelar</button>
                    <button type="button" class="btn btn-sm btn-success rounded-pill px-4 py-2 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-1.5 flex-grow-1" id="neu-btn-guardar-todo" onclick="window._neuGuardarInspeccionCompleta('${placa}', '${idOT||''}')">
                        <i class="bi bi-cloud-arrow-up-fill fs-6"></i> Guardar Inspección Completa
                    </button>
                </div>

                <!-- TOAST EMERGENTE CON TEXTO BLANCO -->
                <div id="neuToast" class="neu-toast">
                    <i class="bi bi-arrow-repeat text-info fs-6"></i>
                    <span id="neuToastMsg" style="color:#ffffff !important; font-weight:700;">Rotación realizada</span>
                </div>
            `;
            document.body.appendChild(drawerEl);
        }

        const bPlaca = document.getElementById('neu-badge-placa');
        if (bPlaca) bPlaca.innerText = placa || 'PLACA';

        // Apertura sincronizada acelerada por hardware
        drawerEl.style.display = 'flex';
        drawerEl.style.visibility = 'visible';
        backdrop.style.display = 'block';
        
        requestAnimationFrame(() => {
            drawerEl.classList.add('open');
            backdrop.classList.add('show');
        });

        // Configuración y render
        const cfg = VEHICLE_CONFIGS_3D[window._neuConfigActualKey] || VEHICLE_CONFIGS_3D["6X4"];
        window._neuRenderPosiciones(cfg.positions);
        window._neuRenderBotoneraR();
        window._neuRenderTablaLlantas();

        // Carga Three.js
        loadThreeJs(function() {
            window._neuInitThreeEngine(cfg);
        });

        window._neuUltimaInspeccionMap = {};
        const catsPromise = window._cargarCatalogosNeumaticos();
        const ultPromise = placa ? fetch('/api/neumaticos/placa-ultima/' + encodeURIComponent(placa)).then(r => r.json()).catch(() => null) : Promise.resolve(null);

        const [cats, resUlt] = await Promise.all([catsPromise, ultPromise]);
        
        if (cats) window._neuRellenarSelects(cats);
        if (resUlt && resUlt.ok) {
            if (resUlt.datosPosiciones) {
                window._neuUltimaInspeccionMap = resUlt.datosPosiciones;
            }
            if (resUlt.configuracion && !configCode) {
                const autoKey = String(resUlt.configuracion).toUpperCase().trim();
                const mappedAuto = ALIAS_MAPPER[autoKey] || ALIAS_MAPPER[autoKey.replace(/[^A-Z0-9]/g, '')];
                if (mappedAuto && mappedAuto !== window._neuConfigActualKey) {
                    window._neuCambiarConfiguracion(mappedAuto);
                }
            }
        }

        window._neuSeleccionarPosicion('1');
    };

    window.rotCerrarModalInspeccionNeumaticos = function() {
        const drawerEl = document.getElementById('rot-drawer-neumaticos');
        const backdrop = document.getElementById('neuDrawerBackdrop');
        if (drawerEl) {
            drawerEl.classList.remove('open');
            setTimeout(() => {
                if (!drawerEl.classList.contains('open')) {
                    drawerEl.style.visibility = 'hidden';
                    drawerEl.style.display = 'none';
                }
            }, 210);
        }
        if (backdrop) {
            backdrop.classList.remove('show');
            setTimeout(() => {
                if (!backdrop.classList.contains('show')) {
                    backdrop.style.display = 'none';
                }
            }, 210);
        }
        if (window._neuAnimationId) {
            cancelAnimationFrame(window._neuAnimationId);
            window._neuAnimationId = null;
        }
    };

    // ── NOTIFICACIÓN TOAST ───────────────────────────────────────────────────────
    function showToast(msg) {
        const toast = document.getElementById('neuToast');
        const toastMsg = document.getElementById('neuToastMsg');
        if (!toast || !toastMsg) return;
        toastMsg.innerText = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // ── CAMBIO DINÁMICO DE CONFIGURACIÓN VEHICULAR ────────────────────────────────
    window._neuCambiarConfiguracion = function(newKey) {
        window._neuConfigActualKey = newKey;
        const cfg = VEHICLE_CONFIGS_3D[newKey] || VEHICLE_CONFIGS_3D["6X4"];
        window._neuRenderPosiciones(cfg.positions);
        if (window._neuInitThreeEngine) {
            window._neuInitThreeEngine(cfg);
        }
        window._neuSeleccionarPosicion('1');
    };

    // ── RELLENAR SELECTS / DATALISTS CON SOPORTE ROBUSTO DE ACCIONES ─────────────
    window._neuRellenarSelects = function(cats) {
        const dlMarca  = document.getElementById('dl-neu-marcas');
        const dlMedida = document.getElementById('dl-neu-medidas');
        const dlModelo = document.getElementById('dl-neu-modelos');
        const selAccion = document.getElementById('neu-sel-accion');

        if (dlMarca && cats.marcas) dlMarca.innerHTML = cats.marcas.map(m => `<option value="${m}">`).join('');
        if (dlMedida && cats.medidas) dlMedida.innerHTML = cats.medidas.map(m => `<option value="${m}">`).join('');
        if (dlModelo && cats.modelos) dlModelo.innerHTML = cats.modelos.map(m => `<option value="${m}">`).join('');
        
        if (selAccion) {
            const defaultAcciones = ['Inspección', 'Rotación', 'Cambio', 'Reparación', 'Reencauche', 'Baja'];
            const allAcciones = Array.from(new Set([...defaultAcciones, ...(cats.acciones || [])]));
            const curVal = selAccion.value;
            selAccion.innerHTML = allAcciones.map(a => `<option value="${a}">${a}</option>`).join('');
            if (curVal) {
                window._neuSetAccionSelect(curVal);
            }
        }
    };

    // Helper para asignar valor al select de acción sin fallos por mayúsculas/acentos
    window._neuSetAccionSelect = function(val) {
        const sel = document.getElementById('neu-sel-accion');
        if (!sel) return;
        const target = (val || 'Inspección').trim();
        sel.value = target;
        if (sel.selectedIndex === -1) {
            const targetNorm = target.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            for (let i = 0; i < sel.options.length; i++) {
                const optNorm = sel.options[i].value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                if (optNorm === targetNorm) {
                    sel.selectedIndex = i;
                    return;
                }
            }
            const opt = document.createElement('option');
            opt.value = target;
            opt.innerText = target;
            sel.appendChild(opt);
            sel.value = target;
        }
    };

    // ── RENDER POSICIONES EN BARRA TÁCTIL ─────────────────────────────────────────
    window._neuRenderPosiciones = function(posArray) {
        const wrap = document.getElementById('neu-pos-selector');
        if (!wrap) return;
        wrap.innerHTML = posArray.map(p => {
            const hasRot = window._neuLlantasActuales.some(l => String(l.posicion) === String(p) && l.rot === 'SI');
            return `
                <button type="button" class="btn ${p === window._neuPosicionActiva ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary'} neu-touch-btn-pos position-relative font-monospace" onclick="window._neuSeleccionarPosicion('${p}')" id="btn-pos-${p}">
                    ${p} ${hasRot ? '<span style="font-size:0.65rem; position:absolute; top:2px; right:3px;">🔄</span>' : ''}
                </button>
            `;
        }).join('');
    };

    // ── MOTOR GRÁFICO 3D / 2D ULTRA-OPTIMIZADO (60 FPS NATIVO) ───────────────────
    window._neuInitThreeEngine = function(cfg) {
        const container = document.getElementById('neu-chassis-container');
        if (!container || !window.THREE) return;

        // Limpiar canvas anterior si existe
        const oldCanvas = container.querySelector('canvas');
        if (oldCanvas) oldCanvas.remove();

        const width = container.clientWidth || 660;
        const height = container.clientHeight || 380;

        // Scene, Camera, Renderer con optimizaciones GPU
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf8fafc);

        const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
        
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance",
            precision: "mediump"
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.shadowMap.enabled = false;
        container.appendChild(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enableRotate = false;
        controls.enablePan = false;
        controls.enableZoom = false;

        // Luces optimizadas
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
        sunLight.position.set(8, 18, 10);
        scene.add(sunLight);

        const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
        fillLight.position.set(-8, 10, -10);
        scene.add(fillLight);

        // Rejilla de referencia
        const gridHelper = new THREE.GridHelper(50, 50, 0x94a3b8, 0xe2e8f0);
        gridHelper.position.y = 0;
        scene.add(gridHelper);

        // Grupo principal del vehículo
        const vehicleGroup = new THREE.Group();
        scene.add(vehicleGroup);

        // Materiales estándar ultraligeros
        const cabPaintMat = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            metalness: 0.2,
            roughness: 0.3,
            transparent: true,
            opacity: window._neuXRayActive ? 0.18 : 1.0
        });

        const darkChassisMat = new THREE.MeshStandardMaterial({
            color: 0x334155,
            metalness: 0.6,
            roughness: 0.4,
            transparent: true,
            opacity: window._neuXRayActive ? 0.20 : 1.0
        });

        const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.65 });

        // Identificar si es carreta o semiremolque (S2, S3, R2)
        const isTrailer = cfg.name.includes("Carreta") || cfg.name.includes("Remolque") || cfg.name.includes("Semiremolque") || cfg.name.includes("S2") || cfg.name.includes("S3") || cfg.name.includes("R2");
        
        let allZ = [];
        cfg.axles.forEach(a => allZ.push(a.z));
        if (cfg.spares) cfg.spares.forEach(s => allZ.push(s.pos[2]));
        if (isTrailer) allZ.push(Math.min(...cfg.axles.map(a => a.z)) - 2.0); // Kingpin/Lanza
        else allZ.push(Math.min(...cfg.axles.map(a => a.z)) - 2.8); // Bumper cabina

        const minZ = Math.min(...allZ);
        const maxZ = Math.max(...allZ);
        const frameLength = Math.max(9, (maxZ - minZ) + 2.0);
        const centerZ = (minZ + maxZ) / 2;

        // Vigas de acero longitudinales del chasis
        const railGeo = new THREE.BoxGeometry(0.18, 0.35, frameLength);
        const railL = new THREE.Mesh(railGeo, darkChassisMat);
        railL.position.set(-0.55, 0.85, centerZ);
        const railR = railL.clone();
        railR.position.x = 0.55;
        vehicleGroup.add(railL);
        vehicleGroup.add(railR);

        // Tanques de combustible (SOLO PARA CAMIONES / TRACTOS — NUNCA EN SEMIREMOLQUES S2/S3/R2)
        let tankGroup = null;
        if (!isTrailer) {
            tankGroup = new THREE.Group();
            const tankGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.6, 14);
            tankGeo.rotateX(Math.PI / 2);
            
            const tankMat = new THREE.MeshStandardMaterial({ 
                color: 0x64748b, 
                metalness: 0.8, 
                roughness: 0.3,
                transparent: true,
                opacity: window._neuXRayActive ? 0.0 : 1.0
            });

            // Ubicar tanques entre cabina y ejes traseros (sin tapar llantas)
            const frontAxleZ = Math.min(...cfg.axles.map(a => a.z));
            const tankZ = frontAxleZ + 2.0;

            const tankL = new THREE.Mesh(tankGeo, tankMat);
            tankL.position.set(-1.05, 0.75, tankZ);
            const tankR = tankL.clone();
            tankR.position.x = 1.05;

            tankGroup.add(tankL);
            tankGroup.add(tankR);
            tankGroup.visible = !window._neuXRayActive;
            vehicleGroup.add(tankGroup);
        }

        // Elemento Frontal (-Z = Frente apuntando Hacia Arriba)
        const frontAxleZ = Math.min(...cfg.axles.map(a => a.z));

        if (isTrailer) {
            // Lanza triangular / Kingpin frontal en -Z
            const hitchGroup = new THREE.Group();
            const hitchGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 10);
            const hitchLeft = new THREE.Mesh(hitchGeo, darkChassisMat);
            hitchLeft.rotation.z = Math.PI / 4;
            hitchLeft.position.set(-0.4, 0.6, minZ + 0.6);
            
            const hitchRight = new THREE.Mesh(hitchGeo, darkChassisMat);
            hitchRight.rotation.z = -Math.PI / 4;
            hitchRight.position.set(0.4, 0.6, minZ + 0.6);
            
            const kingpinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12);
            const kingpinMesh = new THREE.Mesh(kingpinGeo, chromeMat);
            kingpinMesh.position.set(0, 0.6, minZ);
            
            hitchGroup.add(hitchLeft);
            hitchGroup.add(hitchRight);
            hitchGroup.add(kingpinMesh);
            vehicleGroup.add(hitchGroup);
        } else {
            // Cabina completa de camión/tracto en -Z (frente hacia arriba)
            const cabGroup = new THREE.Group();

            const bodyGeo = new THREE.BoxGeometry(2.3, 2.4, 2.6);
            const cabMesh = new THREE.Mesh(bodyGeo, cabPaintMat);
            cabMesh.position.set(0, 1.9, frontAxleZ - 0.4);
            cabGroup.add(cabMesh);

            const hoodGeo = new THREE.BoxGeometry(2.2, 1.3, 1.5);
            const hoodMesh = new THREE.Mesh(hoodGeo, cabPaintMat);
            hoodMesh.position.set(0, 1.35, frontAxleZ - 1.9);
            cabGroup.add(hoodMesh);

            const grilleGeo = new THREE.BoxGeometry(1.8, 1.0, 0.1);
            const grilleMesh = new THREE.Mesh(grilleGeo, chromeMat);
            grilleMesh.position.set(0, 1.25, frontAxleZ - 2.66);
            cabGroup.add(grilleMesh);

            const windGeo = new THREE.BoxGeometry(2.1, 0.9, 0.1);
            const windMesh = new THREE.Mesh(windGeo, glassMat);
            windMesh.position.set(0, 2.35, frontAxleZ - 1.7);
            windMesh.rotation.x = -0.2;
            cabGroup.add(windMesh);

            const bumperGeo = new THREE.BoxGeometry(2.4, 0.45, 0.3);
            const bumperMesh = new THREE.Mesh(bumperGeo, chromeMat);
            bumperMesh.position.set(0, 0.6, frontAxleZ - 2.65);
            cabGroup.add(bumperMesh);

            vehicleGroup.add(cabGroup);
        }

        // Textura optimizada de rodamiento de llanta
        const treadCanvas = document.createElement('canvas');
        treadCanvas.width = 256;
        treadCanvas.height = 256;
        const ctx = treadCanvas.getContext('2d');
        ctx.fillStyle = '#1e1e24';
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#0a0a0d';
        ctx.lineWidth = 8;
        for (let y = 0; y < 256; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(90, y + 6);
            ctx.lineTo(166, y + 6);
            ctx.lineTo(256, y);
            ctx.stroke();
        }
        const treadTexture = new THREE.CanvasTexture(treadCanvas);
        treadTexture.wrapS = THREE.RepeatWrapping;
        treadTexture.wrapT = THREE.RepeatWrapping;
        treadTexture.repeat.set(1, 6);

        const rubberMat = new THREE.MeshStandardMaterial({ map: treadTexture, color: 0x222328, roughness: 0.85 });
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.25 });
        const hubMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 });

        // Geometrías compartidas
        const rubberGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.36, 18);
        rubberGeo.rotateZ(Math.PI / 2);

        const rimGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.37, 14);
        rimGeo.rotateZ(Math.PI / 2);

        const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.39, 10);
        hubGeo.rotateZ(Math.PI / 2);

        const ringGeo = new THREE.TorusGeometry(0.46, 0.04, 8, 18);
        ringGeo.rotateY(Math.PI / 2);

        const tireMeshesMap = {};
        const tireObjectsArray = [];
        const slotPositionsMap = {};

        // Generar Neumático 3D genérico
        function createTireMesh3D(posId) {
            const tireGroup = new THREE.Group();
            
            const rubberMesh = new THREE.Mesh(rubberGeo, rubberMat);
            tireGroup.add(rubberMesh);

            const rimMesh = new THREE.Mesh(rimGeo, rimMat);
            tireGroup.add(rimMesh);

            const hubMesh = new THREE.Mesh(hubGeo, hubMat);
            tireGroup.add(hubMesh);

            const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.position.x = 0.18;
            tireGroup.add(ringMesh);
            tireGroup.ringMesh = ringMesh;

            // Etiqueta Sprite 2D de posición
            const labelCanvas = document.createElement('canvas');
            labelCanvas.width = 64; labelCanvas.height = 64;
            const lCtx = labelCanvas.getContext('2d');
            lCtx.fillStyle = '#2563eb';
            lCtx.beginPath(); lCtx.arc(32, 32, 28, 0, Math.PI * 2); lCtx.fill();
            lCtx.fillStyle = '#ffffff'; lCtx.font = 'bold 30px Inter, sans-serif'; lCtx.textAlign = 'center'; lCtx.textBaseline = 'middle';
            lCtx.fillText(posId, 32, 32);

            const labelTex = new THREE.CanvasTexture(labelCanvas);
            const spriteMat = new THREE.SpriteMaterial({ map: labelTex });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.scale.set(0.7, 0.7, 1);
            sprite.position.set(0, 0.75, 0);
            tireGroup.add(sprite);

            tireGroup.userData = { isTire: true, id: String(posId) };
            rubberMesh.userData = { isTire: true, id: String(posId), parentGroup: tireGroup };

            return tireGroup;
        }

        // Posicionar ejes y llantas en el vehículo con separación ergonómica
        const axleGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.1, 10);
        axleGeo.rotateZ(Math.PI / 2);

        cfg.axles.forEach(axle => {
            const axleMesh = new THREE.Mesh(axleGeo, darkChassisMat);
            axleMesh.position.set(0, 0.6, axle.z);
            vehicleGroup.add(axleMesh);

            axle.tires.forEach(t => {
                const mesh = createTireMesh3D(t.id);
                let xPos = 0;
                if (t.side === "left") {
                    xPos = t.isOuter ? -1.52 : -0.96;
                } else {
                    xPos = t.isOuter ? 1.52 : 0.96;
                }
                const posVec = new THREE.Vector3(xPos, 0.6, axle.z);
                mesh.position.copy(posVec);
                mesh.userData.defaultPos = posVec.clone();
                vehicleGroup.add(mesh);

                tireMeshesMap[t.id] = mesh;
                slotPositionsMap[t.id] = posVec.clone();
                tireObjectsArray.push(mesh.children[0]);
            });
        });

        // Posicionar repuestos con encuadre visible dentro del chasis
        if (cfg.spares) {
            cfg.spares.forEach(sp => {
                const mesh = createTireMesh3D(sp.id);
                const posVec = new THREE.Vector3(sp.pos[0], sp.pos[1], sp.pos[2]);
                mesh.position.copy(posVec);
                mesh.userData.defaultPos = posVec.clone();
                vehicleGroup.add(mesh);

                tireMeshesMap[sp.id] = mesh;
                slotPositionsMap[sp.id] = posVec.clone();
                tireObjectsArray.push(mesh.children[0]);
            });
        }

        // Anillo de resaltado verde sobre destino en Drag & Drop (Hover)
        const dropRingGeo = new THREE.TorusGeometry(0.72, 0.08, 8, 20);
        dropRingGeo.rotateY(Math.PI / 2);
        const dropRingMat = new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.95 });
        const dragHoverHighlightMesh = new THREE.Mesh(dropRingGeo, dropRingMat);
        dragHoverHighlightMesh.visible = false;
        scene.add(dragHoverHighlightMesh);

        // ── AJUSTE DE CÁMARA 2D (Frente hacia arriba con UP = [0, 0, -1] y encuadre 100% de llantas) ──
        window._neuUpdateCameraView = function() {
            const totalSpan = maxZ - minZ;
            const autoHeight = Math.max(18, totalSpan * 1.95);

            if (window._neuViewMode === '2d') {
                camera.up.set(0, 0, -1);
                camera.position.set(0, autoHeight, centerZ);
                camera.lookAt(0, 0, centerZ);
                controls.target.set(0, 0, centerZ);
                controls.enableRotate = false; controls.enablePan = false; controls.enableZoom = false;
            } else if (window._neuViewMode === 'iso') {
                camera.up.set(0, 1, 0);
                camera.position.set(10, autoHeight * 0.7, centerZ + 10);
                camera.lookAt(0, 0, centerZ);
                controls.target.set(0, 0, centerZ);
                controls.enableRotate = true; controls.enablePan = true; controls.enableZoom = true;
            } else if (window._neuViewMode === 'lat') {
                camera.up.set(0, 1, 0);
                camera.position.set(14, 1.5, centerZ);
                camera.lookAt(0, 0, centerZ);
                controls.target.set(0, 0, centerZ);
                controls.enableRotate = true; controls.enablePan = true; controls.enableZoom = true;
            }
            controls.update();
            window._neuNeedsRender = true;
        };
        window._neuUpdateCameraView();

        const totalCount = Object.keys(tireMeshesMap).length;
        const summaryEl = document.getElementById('neu-chassis-stats-summary');
        if (summaryEl) summaryEl.innerText = `Total: ${totalCount} llantas`;

        // ── ACTUALIZACIÓN DE COLORES Y ESTADOS EN 3D ────────────────────────────────
        window._neuActualizar3DColores = function() {
            Object.keys(tireMeshesMap).forEach(id => {
                const meshGroup = tireMeshesMap[id];
                if (!meshGroup || !meshGroup.ringMesh) return;

                const lData = window._neuLlantasActuales.find(item => String(item.posicion) === String(id));
                const isActive = String(window._neuPosicionActiva) === String(id);
                const ring = meshGroup.ringMesh;

                if (lData) {
                    if (lData.rot === 'SI') {
                        ring.material.color.setHex(0x2563eb);
                    } else {
                        const prom = parseFloat(lData.remanente_promedio || 0);
                        if (prom <= 4.0) ring.material.color.setHex(0xef4444);
                        else if (prom <= 6.0) ring.material.color.setHex(0xf59e0b);
                        else ring.material.color.setHex(0x10b981);
                    }
                } else {
                    ring.material.color.setHex(isActive ? 0x2563eb : 0x10b981);
                }

                if (isActive) {
                    meshGroup.scale.set(1.08, 1.08, 1.08);
                } else {
                    meshGroup.scale.set(1.0, 1.0, 1.0);
                }
            });
            window._neuNeedsRender = true;
        };
        window._neuActualizar3DColores();

        // ── RAYCASTING Y DRAG & DROP OPTIMIZADO POR RAF (ZERO LAG) ───────────────────
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);
        const planeIntersect = new THREE.Vector3();

        let isPointerDown = false;
        let isDragging = false;
        let startPointerPos = { x: 0, y: 0 };
        let draggedTireGroup = null;
        let draggedTireId = null;
        let hoverTargetId = null;
        let isPointerMovePending = false;
        let currentEvent = null;

        const canvasEl = renderer.domElement;

        canvasEl.addEventListener('pointerdown', (e) => {
            const rect = canvasEl.getBoundingClientRect();
            pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            startPointerPos = { x: e.clientX, y: e.clientY };
            raycaster.setFromCamera(pointer, camera);

            const intersects = raycaster.intersectObjects(tireObjectsArray, false);
            if (intersects.length > 0) {
                const hitObj = intersects[0].object;
                const parentGroup = hitObj.userData.parentGroup;
                if (parentGroup) {
                    isPointerDown = true;
                    draggedTireGroup = parentGroup;
                    draggedTireId = parentGroup.userData.id;
                    try { canvasEl.setPointerCapture(e.pointerId); } catch(err) {}
                }
            }
        });

        function handlePointerMoveBatched() {
            isPointerMovePending = false;
            if (!isPointerDown || !draggedTireGroup || !currentEvent) return;

            const e = currentEvent;
            const dist = Math.hypot(e.clientX - startPointerPos.x, e.clientY - startPointerPos.y);
            
            if (dist > 6 && !isDragging) {
                isDragging = true;
                draggedTireGroup.scale.set(1.15, 1.15, 1.15);
                const banner = document.getElementById('dragInstructionBanner');
                if (banner) {
                    banner.style.display = 'block';
                    banner.innerHTML = `<i class="bi bi-arrows-move me-1 text-warning"></i> Arrastrando Llanta #${draggedTireId} — Suelta sobre otra posición para intercambiar`;
                }
            }

            if (isDragging) {
                const rect = canvasEl.getBoundingClientRect();
                pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                raycaster.setFromCamera(pointer, camera);
                if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
                    draggedTireGroup.position.copy(planeIntersect);
                }

                const intersects = raycaster.intersectObjects(tireObjectsArray, false);
                let hitTarget = null;
                for (let i = 0; i < intersects.length; i++) {
                    const tid = intersects[i].object.userData.id;
                    if (tid && tid !== draggedTireId) {
                        hitTarget = tid;
                        break;
                    }
                }

                if (hitTarget) {
                    hoverTargetId = hitTarget;
                    const targetGroup = tireMeshesMap[hitTarget];
                    if (targetGroup) {
                        dragHoverHighlightMesh.position.copy(targetGroup.position);
                        dragHoverHighlightMesh.visible = true;
                    }
                } else {
                    hoverTargetId = null;
                    dragHoverHighlightMesh.visible = false;
                }
                window._neuNeedsRender = true;
            }
        }

        canvasEl.addEventListener('pointermove', (e) => {
            if (!isPointerDown || !draggedTireGroup) return;
            currentEvent = e;
            if (!isPointerMovePending) {
                isPointerMovePending = true;
                requestAnimationFrame(handlePointerMoveBatched);
            }
        });

        const endDragHandler = (e) => {
            if (!isPointerDown) return;

            try { canvasEl.releasePointerCapture(e.pointerId); } catch(err) {}

            const banner = document.getElementById('dragInstructionBanner');
            if (banner) banner.style.display = 'none';
            dragHoverHighlightMesh.visible = false;

            const meshToRestore = draggedTireGroup;
            const sourceId = draggedTireId;
            const targetId = hoverTargetId;

            if (isDragging && meshToRestore && sourceId) {
                if (targetId && targetId !== sourceId) {
                    window._neuEjecutarRotacion(sourceId, targetId);
                    meshToRestore.position.copy(meshToRestore.userData.defaultPos);
                    meshToRestore.scale.set(1.0, 1.0, 1.0);
                    window._neuNeedsRender = true;
                } else {
                    const targetPos = meshToRestore.userData.defaultPos.clone();
                    const startPos = meshToRestore.position.clone();
                    let startTime = null;

                    meshToRestore.scale.set(1.0, 1.0, 1.0);

                    function animateLerp(time) {
                        if (!startTime) startTime = time;
                        const progress = Math.min((time - startTime) / 140, 1);
                        if (meshToRestore) {
                            meshToRestore.position.lerpVectors(startPos, targetPos, progress);
                            window._neuNeedsRender = true;
                        }
                        if (progress < 1) {
                            requestAnimationFrame(animateLerp);
                        } else if (meshToRestore) {
                            meshToRestore.position.copy(targetPos);
                            window._neuNeedsRender = true;
                        }
                    }
                    requestAnimationFrame(animateLerp);
                }
            } else if (sourceId) {
                window._neuSeleccionarPosicion(sourceId);
            }

            if (meshToRestore) {
                meshToRestore.scale.set(1.0, 1.0, 1.0);
            }

            isPointerDown = false;
            isDragging = false;
            draggedTireGroup = null;
            draggedTireId = null;
            hoverTargetId = null;
            currentEvent = null;
            window._neuNeedsRender = true;
        };

        canvasEl.addEventListener('pointerup', endDragHandler);
        canvasEl.addEventListener('pointercancel', endDragHandler);

        // Renderizado fluido a demanda y continuo durante interacción
        controls.addEventListener('change', () => {
            window._neuNeedsRender = true;
        });

        function animate() {
            window._neuAnimationId = requestAnimationFrame(animate);
            if (controls.dampingFactor && controls.state !== -1) {
                controls.update();
                window._neuNeedsRender = true;
            }
            if (window._neuNeedsRender || isDragging) {
                renderer.render(scene, camera);
                window._neuNeedsRender = false;
            }
        }
        window._neuNeedsRender = true;
        animate();

        window._neuRefrescar3D = function() {
            window._neuActualizar3DColores();
        };

        window._neuToggleXRay = function() {
            window._neuXRayActive = !window._neuXRayActive;
            const btn = document.getElementById('btn-xray');
            if (btn) {
                btn.className = window._neuXRayActive 
                    ? 'btn btn-sm btn-warning text-dark py-1 px-2.5 rounded-pill fw-bold' 
                    : 'btn btn-sm btn-outline-warning py-1 px-2.5 rounded-pill fw-bold';
            }
            cabPaintMat.opacity = window._neuXRayActive ? 0.18 : 1.0;
            darkChassisMat.opacity = window._neuXRayActive ? 0.20 : 1.0;
            if (tankGroup) {
                tankGroup.visible = !window._neuXRayActive;
            }
            window._neuNeedsRender = true;
        };
    };

    // ── NAVEGACIÓN VISTAS 2D / ISOMÉTRICA / LATERAL ─────────────────────────────────
    window._neuSetViewMode = function(mode) {
        window._neuViewMode = mode;
        ['2d', 'iso', 'lat'].forEach(m => {
            const btn = document.getElementById(`btn-view-${m}`);
            if (btn) btn.className = (m === mode) ? 'btn btn-sm btn-primary py-1 px-2.5 rounded-pill fw-bold' : 'btn btn-sm btn-outline-secondary py-1 px-2.5 rounded-pill fw-bold';
        });
        if (window._neuUpdateCameraView) window._neuUpdateCameraView();
    };

    // ── LÓGICA DE NEGOCIO: EJECUTAR ROTACIÓN Y AUTO-REGISTRO ───────────────────────
    window._neuEjecutarRotacion = function(sourceId, targetId) {
        const sId = String(sourceId);
        const tId = String(targetId);

        let sourceItem = window._neuLlantasActuales.find(l => String(l.posicion) === sId);
        let targetItem = window._neuLlantasActuales.find(l => String(l.posicion) === tId);

        // Posición Origen sId (ahora tiene la llanta que vino de tId)
        if (!sourceItem) {
            const prev = (window._neuUltimaInspeccionMap || {})[sId.toUpperCase()] || {};
            sourceItem = {
                posicion: sId,
                id: sId,
                marca: prev.marca || 'WINDPOWER',
                medida: prev.medida || '275/70R22.5',
                modelo: prev.modelo || 'PROGUO1',
                r1: prev.r1 || 12, r2: prev.r2 || 12, r3: prev.r3 || 12, r4: prev.r4 || 0,
                remanente_promedio: 12.0,
                average: "12.0",
                presion_ant: prev.presion_actual || 100,
                presion_actual: prev.presion_actual || 100,
                estado: prev.estado || 'NUEVA',
                accion: 'Rotación',
                rot: 'SI',
                rotTarget: tId,
                observaciones: `De Posición #${tId} a Posición #${sId}`,
                obs: `De Posición #${tId} a Posición #${sId}`
            };
            window._neuLlantasActuales.push(sourceItem);
        } else {
            sourceItem.rot = 'SI';
            sourceItem.rotTarget = tId;
            sourceItem.accion = 'Rotación';
            sourceItem.observaciones = `De Posición #${tId} a Posición #${sId}`;
            sourceItem.obs = `De Posición #${tId} a Posición #${sId}`;
        }

        // Posición Destino tId (ahora tiene la llanta que vino de sId)
        if (!targetItem) {
            const prevT = (window._neuUltimaInspeccionMap || {})[tId.toUpperCase()] || {};
            targetItem = {
                posicion: tId,
                id: tId,
                marca: prevT.marca || 'WINDPOWER',
                medida: prevT.medida || '275/70R22.5',
                modelo: prevT.modelo || 'PROGUO1',
                r1: prevT.r1 || 12, r2: prevT.r2 || 12, r3: prevT.r3 || 12, r4: prevT.r4 || 0,
                remanente_promedio: 12.0,
                average: "12.0",
                presion_ant: prevT.presion_actual || 100,
                presion_actual: prevT.presion_actual || 100,
                estado: prevT.estado || 'NUEVA',
                accion: 'Rotación',
                rot: 'SI',
                rotTarget: sId,
                observaciones: `De Posición #${sId} a Posición #${tId}`,
                obs: `De Posición #${sId} a Posición #${tId}`
            };
            window._neuLlantasActuales.push(targetItem);
        } else {
            targetItem.rot = 'SI';
            targetItem.rotTarget = sId;
            targetItem.accion = 'Rotación';
            targetItem.observaciones = `De Posición #${sId} a Posición #${tId}`;
            targetItem.obs = `De Posición #${sId} a Posición #${tId}`;
        }

        // Renderizar tabla y 3D
        window._neuRenderTablaLlantas();
        if (window._neuRefrescar3D) window._neuRefrescar3D();
        
        showToast(`Rotación realizada: Posición #${sId} ⇄ Posición #${tId}`);
        window._neuSeleccionarPosicion(sId);
    };

    // ── MANEJO DEL FORMULARIO DE LLANTA Y MEDICIONES TÁCTILES ─────────────────────
    window._neuSeleccionarPosicion = function(pos) {
        window._neuPosicionActiva = String(pos);
        const b = document.getElementById('neu-form-pos-badge');
        if (b) b.innerText = pos;
        const labelTop = document.getElementById('neu-pos-label-top');
        if (labelTop) labelTop.innerText = pos;

        // Actualizar barra de selección de posiciones
        document.querySelectorAll('#neu-pos-selector button').forEach(btn => {
            btn.className = 'btn btn-outline-secondary neu-touch-btn-pos position-relative font-monospace';
        });
        const activeBtn = document.getElementById(`btn-pos-${pos}`);
        if (activeBtn) {
            activeBtn.className = 'btn btn-primary text-white shadow-sm neu-touch-btn-pos position-relative font-monospace';
            activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }

        window._neuLimpiarFormLlanta();

        const existente = window._neuLlantasActuales.find(l => String(l.posicion) === String(pos));
        if (existente) {
            if (document.getElementById('neu-sel-marca')) document.getElementById('neu-sel-marca').value = existente.marca || '';
            if (document.getElementById('neu-sel-medida')) document.getElementById('neu-sel-medida').value = existente.medida || '';
            if (document.getElementById('neu-sel-modelo')) document.getElementById('neu-sel-modelo').value = existente.modelo || '';
            window._neuSetR('r1', existente.r1 || 0);
            window._neuSetR('r2', existente.r2 || 0);
            window._neuSetR('r3', existente.r3 || 0);
            window._neuSetR('r4', existente.r4 || 0);
            if (document.getElementById('neu-input-pres-ant')) document.getElementById('neu-input-pres-ant').value = (existente.presion_ant || existente.presion_ant === 0) ? existente.presion_ant : '';
            if (document.getElementById('neu-input-pres-act')) document.getElementById('neu-input-pres-act').value = (existente.presion_actual || existente.presion_actual === 0) ? existente.presion_actual : '';
            if (document.getElementById('neu-sel-estado')) document.getElementById('neu-sel-estado').value = existente.estado || 'NUEVA';
            
            // Asignación garantizada de acción (Rotación si fue rotada, o existente.accion)
            const accionVal = (existente.rot === 'SI' || existente.accion === 'Rotación') ? 'Rotación' : (existente.accion || 'Inspección');
            window._neuSetAccionSelect(accionVal);
            
            if (document.getElementById('neu-sel-rot')) document.getElementById('neu-sel-rot').value = existente.rot || 'NO';
            if (document.getElementById('neu-input-obs-item')) document.getElementById('neu-input-obs-item').value = existente.observaciones || existente.obs || '';
            
            window._neuFotos = { foto1: existente.foto1 || null, foto2: existente.foto2 || null, foto3: existente.foto3 || null };
            [1, 2, 3].forEach(n => {
                const btn = document.getElementById(`btn-neu-foto${n}`);
                if (btn) {
                    if (window._neuFotos[`foto${n}`]) {
                        btn.className = 'btn btn-success w-100 py-1.5 rounded-3 text-truncate fw-bold text-white shadow-2xs d-flex flex-column align-items-center justify-content-center';
                        btn.innerHTML = `<i class="bi bi-check-circle-fill fs-6"></i><span>Foto ${n} lista</span>`;
                    } else {
                        btn.className = 'btn btn-outline-secondary w-100 py-1.5 rounded-3 text-truncate fw-semibold d-flex flex-column align-items-center justify-content-center';
                        btn.innerHTML = `<i class="bi bi-camera fs-6"></i><span>Foto ${n}</span>`;
                    }
                }
            });
        } else if (window._neuUltimaInspeccionMap && window._neuUltimaInspeccionMap[String(pos).toUpperCase()]) {
            const prev = window._neuUltimaInspeccionMap[String(pos).toUpperCase()];
            if (document.getElementById('neu-sel-marca')) document.getElementById('neu-sel-marca').value = prev.marca || 'WINDPOWER';
            if (document.getElementById('neu-sel-medida')) document.getElementById('neu-sel-medida').value = prev.medida || '275/70R22.5';
            if (document.getElementById('neu-sel-modelo')) document.getElementById('neu-sel-modelo').value = prev.modelo || 'PROGUO1';
            window._neuSetR('r1', prev.r1 || 12);
            window._neuSetR('r2', prev.r2 || 12);
            window._neuSetR('r3', prev.r3 || 12);
            window._neuSetR('r4', prev.r4 || 0);
            if (document.getElementById('neu-input-pres-ant')) document.getElementById('neu-input-pres-ant').value = prev.presion_actual || 100;
            if (document.getElementById('neu-input-pres-act')) document.getElementById('neu-input-pres-act').value = prev.presion_actual || 100;
            if (document.getElementById('neu-sel-estado')) document.getElementById('neu-sel-estado').value = prev.estado || 'NUEVA';
            window._neuSetAccionSelect('Inspección');
            if (document.getElementById('neu-sel-rot')) document.getElementById('neu-sel-rot').value = 'NO';
        } else {
            window._neuSetAccionSelect('Inspección');
            if (document.getElementById('neu-sel-rot')) document.getElementById('neu-sel-rot').value = 'NO';
        }

        window._neuCalcularPromedio();
        window._neuRenderTablaLlantas();
        if (window._neuRefrescar3D) window._neuRefrescar3D();
    };

    // Renderizar botonera 0..24mm para R1, R2, R3, R4 con Auto-Scroll
    window._neuRenderBotoneraR = function() {
        ['r1', 'r2', 'r3', 'r4'].forEach(tipo => {
            const container = document.getElementById(`neu-${tipo}-buttons`);
            if (!container) return;
            const current = window[`_neuVal${tipo.toUpperCase()}`] || 0;
            let html = '';
            
            const isZero = current === 0;
            html += `
                <button type="button" class="btn ${isZero ? 'btn-secondary text-white shadow-sm' : 'btn-outline-secondary'} neu-touch-btn-r font-monospace" style="min-width:52px;" onclick="window._neuSetR('${tipo}', 0)" id="btn-val-${tipo}-0">
                    0 mm
                </button>
            `;

            for (let i = 1; i <= 24; i++) {
                const isActive = i === current;
                const activeClass = isActive ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary';
                html += `
                    <button type="button" class="btn ${activeClass} neu-touch-btn-r font-monospace" onclick="window._neuSetR('${tipo}', ${i})" id="btn-val-${tipo}-${i}">
                        ${i}
                    </button>
                `;
            }
            container.innerHTML = html;
            const lbl = document.getElementById(`lbl-${tipo}`);
            if (lbl) {
                lbl.innerText = `${current} mm`;
                lbl.className = (current > 0) ? 'badge bg-primary px-2.5 py-1 fs-6 rounded-pill font-monospace text-white fw-bold' : 'badge bg-secondary px-2.5 py-1 fs-6 rounded-pill font-monospace text-white fw-bold';
            }

            // Auto-scroll hacia el valor actual
            setTimeout(() => {
                const activeBtn = document.getElementById(`btn-val-${tipo}-${current}`);
                if (activeBtn) {
                    activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            }, 60);
        });
        window._neuCalcularPromedio();
    };

    window._neuSetR = function(tipo, val) {
        const num = Math.max(0, Math.min(26, parseInt(val, 10) || 0));
        window[`_neuVal${tipo.toUpperCase()}`] = num;

        const lbl = document.getElementById(`lbl-${tipo}`);
        if (lbl) {
            lbl.innerText = `${num} mm`;
            lbl.className = (num > 0) ? 'badge bg-primary px-2.5 py-1 fs-6 rounded-pill font-monospace text-white fw-bold shadow-2xs' : 'badge bg-secondary px-2.5 py-1 fs-6 rounded-pill font-monospace text-white fw-bold';
        }

        const btnZero = document.getElementById(`btn-val-${tipo}-0`);
        if (btnZero) btnZero.className = (num === 0) ? 'btn btn-secondary text-white shadow-sm neu-touch-btn-r font-monospace' : 'btn btn-outline-secondary neu-touch-btn-r font-monospace';

        for (let i = 1; i <= 24; i++) {
            const btn = document.getElementById(`btn-val-${tipo}-${i}`);
            if (btn) btn.className = (i === num) ? 'btn btn-primary text-white shadow-sm neu-touch-btn-r font-monospace' : 'btn btn-outline-secondary neu-touch-btn-r font-monospace';
        }

        // Auto-scroll del botón seleccionado al centro de la vista
        const selectedBtn = document.getElementById(`btn-val-${tipo}-${num}`);
        if (selectedBtn) {
            selectedBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }

        window._neuCalcularPromedio();
    };

    window._neuAjustarR = function(tipo, delta) {
        const current = window[`_neuVal${tipo.toUpperCase()}`] || 0;
        window._neuSetR(tipo, current + delta);
    };

    window._neuCalcularPromedio = function() {
        const r1 = window._neuValR1 || 0;
        const r2 = window._neuValR2 || 0;
        const r3 = window._neuValR3 || 0;
        const r4 = window._neuValR4 || 0;

        const lbl = document.getElementById('neu-r-prom-badge');
        if (!lbl) return;

        if (r1 === 0 && r2 === 0 && r3 === 0 && r4 === 0) {
            lbl.innerHTML = `<span class="text-muted font-monospace">Promedio: -- mm (Sin medir)</span>`;
            return;
        }

        const promVal = (r4 > 0) ? ((r1 + r2 + r3 + r4) / 4.0) : ((r1 + r2 + r3) / 3.0);
        const prom = promVal.toFixed(1);
        let color = promVal > 6.0 ? '#10b981' : (promVal > 4.0 ? '#f59e0b' : '#ef4444');
        let statusBadge = promVal <= 4.0 ? '<span class="badge bg-danger ms-1 text-white">CRÍTICA (≤4mm)</span>' : (promVal <= 6.0 ? '<span class="badge bg-warning text-dark ms-1">ALERTA</span>' : '<span class="badge bg-success ms-1 text-white">ÓPTIMA</span>');
        lbl.innerHTML = `Promedio: <b style="color:${color};" class="font-monospace">${prom} mm</b> ${statusBadge}`;
    };

    window._neuProcesarFoto = function(num, input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            window._neuFotos[`foto${num}`] = e.target.result;
            const btn = document.getElementById(`btn-neu-foto${num}`);
            if (btn) {
                btn.className = 'btn btn-success w-100 py-1.5 rounded-3 text-truncate fw-bold text-white shadow-2xs d-flex flex-column align-items-center justify-content-center';
                btn.innerHTML = `<i class="bi bi-check-circle-fill fs-6"></i><span>Foto ${num} lista</span>`;
            }
        };
        reader.readAsDataURL(file);
    };

    window._neuLimpiarFotos = function() {
        window._neuFotos = { foto1: null, foto2: null, foto3: null };
        [1, 2, 3].forEach(n => {
            const btn = document.getElementById(`btn-neu-foto${n}`);
            if (btn) {
                btn.className = 'btn btn-outline-secondary w-100 py-1.5 rounded-3 text-truncate fw-semibold d-flex flex-column align-items-center justify-content-center';
                btn.innerHTML = `<i class="bi bi-camera fs-6"></i><span>Foto ${n}</span>`;
            }
            const inp = document.getElementById(`neu-file-foto${n}`);
            if (inp) inp.value = '';
        });
    };

    window._neuLimpiarFormLlanta = function() {
        if (document.getElementById('neu-sel-marca')) document.getElementById('neu-sel-marca').value = '';
        if (document.getElementById('neu-sel-medida')) document.getElementById('neu-sel-medida').value = '';
        if (document.getElementById('neu-sel-modelo')) document.getElementById('neu-sel-modelo').value = '';

        window._neuSetR('r1', 0);
        window._neuSetR('r2', 0);
        window._neuSetR('r3', 0);
        window._neuSetR('r4', 0);

        if (document.getElementById('neu-input-pres-ant')) document.getElementById('neu-input-pres-ant').value = '';
        if (document.getElementById('neu-input-pres-act')) document.getElementById('neu-input-pres-act').value = '';
        if (document.getElementById('neu-sel-estado')) document.getElementById('neu-sel-estado').value = 'NUEVA';
        window._neuSetAccionSelect('Inspección');
        if (document.getElementById('neu-sel-rot')) document.getElementById('neu-sel-rot').value = 'NO';
        if (document.getElementById('neu-input-obs-item')) document.getElementById('neu-input-obs-item').value = '';

        window._neuLimpiarFotos();
    };

    // ── GUARDAR / ACTUALIZAR LLANTA EN INSPECCIÓN ─────────────────────────────────
    window._neuGuardarLlantaEnLista = function() {
        const pos = window._neuPosicionActiva || '1';
        const marca = document.getElementById('neu-sel-marca')?.value || '';
        const medida = document.getElementById('neu-sel-medida')?.value || '';
        const modelo = document.getElementById('neu-sel-modelo')?.value || '';
        const r1 = window._neuValR1 || 0;
        const r2 = window._neuValR2 || 0;
        const r3 = window._neuValR3 || 0;
        const r4 = window._neuValR4 || 0;

        if (r1 === 0 && r2 === 0 && r3 === 0 && r4 === 0) {
            alert(`⚠️ Por favor ingresa las mediciones de remanente para la Llanta Posición #${pos}.`);
            return;
        }

        const rPromVal = (r4 > 0) ? ((r1 + r2 + r3 + r4) / 4.0) : ((r1 + r2 + r3) / 3.0);
        const rProm = parseFloat(rPromVal.toFixed(1));
        const presion_ant = parseInt(document.getElementById('neu-input-pres-ant')?.value || 0, 10);
        const presion_actual = parseInt(document.getElementById('neu-input-pres-act')?.value || 0, 10);
        const estado = document.getElementById('neu-sel-estado')?.value || 'NUEVA';
        const accion = document.getElementById('neu-sel-accion')?.value || 'Inspección';
        const rot = document.getElementById('neu-sel-rot')?.value || 'NO';
        const observaciones = document.getElementById('neu-input-obs-item')?.value || 'Ninguna';

        const idx = window._neuLlantasActuales.findIndex(l => String(l.posicion) === String(pos));
        const prevItem = idx !== -1 ? window._neuLlantasActuales[idx] : null;

        const isRotacion = (rot === 'SI' || accion === 'Rotación' || (prevItem && prevItem.rot === 'SI'));

        const item = {
            posicion: String(pos),
            id: String(pos),
            positionName: `Eje ${pos}`,
            marca,
            medida,
            modelo,
            r1, r2, r3, r4,
            remanente_promedio: rProm,
            average: String(rProm),
            presion_ant,
            presion_actual,
            psiAnt: presion_ant,
            psiActual: presion_actual,
            estado,
            state: estado,
            accion: isRotacion ? 'Rotación' : accion,
            action: isRotacion ? 'Rotación' : accion,
            rot: isRotacion ? 'SI' : 'NO',
            rotTarget: prevItem ? prevItem.rotTarget : null,
            observaciones: (observaciones && observaciones !== 'Ninguna') ? observaciones : (prevItem ? prevItem.observaciones : 'Ninguna'),
            obs: (observaciones && observaciones !== 'Ninguna') ? observaciones : (prevItem ? prevItem.obs : 'Ninguna'),
            foto1: window._neuFotos.foto1 || (prevItem ? prevItem.foto1 : null),
            foto2: window._neuFotos.foto2 || (prevItem ? prevItem.foto2 : null),
            foto3: window._neuFotos.foto3 || (prevItem ? prevItem.foto3 : null),
            photos: [!!(window._neuFotos.foto1 || prevItem?.foto1), !!(window._neuFotos.foto2 || prevItem?.foto2), !!(window._neuFotos.foto3 || prevItem?.foto3)]
        };

        if (idx !== -1) {
            window._neuLlantasActuales[idx] = item;
            showToast(`✅ Remanente actualizado para Llanta #${pos}`);
        } else {
            window._neuLlantasActuales.push(item);
            showToast(`✅ Llanta #${pos} guardada en inspección`);
        }

        window._neuRenderTablaLlantas();
        if (window._neuRefrescar3D) window._neuRefrescar3D();

        const cfg = VEHICLE_CONFIGS_3D[window._neuConfigActualKey] || VEHICLE_CONFIGS_3D["6X4"];
        const ordenPos = cfg.positions;
        const curIdx = ordenPos.indexOf(String(pos));
        if (curIdx !== -1 && curIdx < ordenPos.length - 1) {
            const nextPos = ordenPos[curIdx + 1];
            window._neuSeleccionarPosicion(nextPos);
        }
    };

    // ── RENDER TABLA CON FILAS EDITABLES Y BADGES DE ALTO CONTRASTE ────────────────
    window._neuRenderTablaLlantas = function() {
        const tbody = document.getElementById('neu-tabla-tbody');
        const countBadge = document.getElementById('neu-tabla-count');
        if (countBadge) countBadge.innerText = window._neuLlantasActuales.length;
        if (!tbody) return;

        if (window._neuLlantasActuales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" class="text-center text-muted py-3">Aún no has agregado ninguna llanta a la inspección.</td></tr>';
            return;
        }

        window._neuLlantasActuales.sort((a, b) => {
            const numA = parseInt(a.posicion || a.id, 10);
            const numB = parseInt(b.posicion || b.id, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            if (!isNaN(numA)) return -1;
            if (!isNaN(numB)) return 1;
            return String(a.posicion).localeCompare(String(b.posicion));
        });

        tbody.innerHTML = window._neuLlantasActuales.map((l, index) => {
            const prom = l.remanente_promedio;
            const badgeClass = prom <= 4.0 ? 'bg-danger text-white' : (prom <= 6.0 ? 'bg-warning text-dark' : 'bg-success text-white');
            const fotosCount = (l.foto1 ? 1 : 0) + (l.foto2 ? 1 : 0) + (l.foto3 ? 1 : 0);
            const fotosBadge = fotosCount > 0 
                ? `<span class="badge bg-primary text-white rounded-pill px-2 py-0.5"><i class="bi bi-camera-fill me-1"></i>${fotosCount}</span>` 
                : `<span class="text-muted small">-</span>`;

            // Badge ROT con contraste 100% garantizado (fondo oscuro -> texto blanco / fondo claro -> texto oscuro)
            const isRot = l.rot === 'SI';
            const rotBadge = isRot 
                ? `<span class="badge rounded-pill shadow-2xs" style="background:#2563eb !important; color:#ffffff !important; font-weight:700; font-size:0.75rem; padding:4px 10px; display:inline-flex; align-items:center; gap:3px;"><i class="bi bi-arrow-repeat"></i> SÍ</span>`
                : `<span class="badge rounded-pill" style="background:#f1f5f9 !important; color:#475569 !important; border:1px solid #cbd5e1 !important; font-weight:600; font-size:0.75rem; padding:4px 8px;">NO</span>`;

            const isSelected = String(l.posicion) === String(window._neuPosicionActiva);

            return `
                <tr class="${isSelected ? 'neu-row-active' : ''}" style="cursor: pointer;" onclick="window._neuSeleccionarPosicion('${l.posicion}')" title="Haz clic para editar esta llanta">
                    <td class="ps-3"><span class="badge bg-primary text-white rounded-pill px-2.5 py-0.5 fs-6 font-monospace">#${l.posicion}</span></td>
                    <td class="fw-bold text-dark">${l.marca || '---'}</td>
                    <td class="small font-monospace">${l.medida || '---'}</td>
                    <td><span class="badge bg-light text-dark border">${l.modelo || '---'}</span></td>
                    <td class="text-center fw-bold font-monospace text-dark">${l.r1}</td>
                    <td class="text-center fw-bold font-monospace text-dark">${l.r2}</td>
                    <td class="text-center fw-bold font-monospace text-dark">${l.r3}</td>
                    <td class="text-center text-muted small font-monospace">${l.r4 || 0}</td>
                    <td class="text-center"><span class="badge ${badgeClass} px-2 py-0.5 font-monospace fw-bold">${prom} mm</span></td>
                    <td class="text-center small font-monospace text-dark">${l.presion_ant} ➔ <b>${l.presion_actual} PSI</b></td>
                    <td><span class="badge bg-secondary bg-opacity-10 text-secondary fw-semibold">${l.estado}</span></td>
                    <td><span class="badge bg-info bg-opacity-10 text-info fw-semibold">${l.accion}</span></td>
                    <td class="text-center">${rotBadge}</td>
                    <td class="text-center font-monospace">${fotosBadge}</td>
                    <td class="text-truncate small ${isRot ? 'text-primary fw-bold' : 'text-muted'}" style="max-width:140px;" title="${l.observaciones || l.obs || ''}">${l.observaciones || l.obs || 'Ninguna'}</td>
                    <td class="text-center pe-3 text-nowrap">
                        <button class="btn btn-outline-primary btn-sm py-0 px-2 rounded-pill me-1" onclick="event.stopPropagation(); window._neuSeleccionarPosicion('${l.posicion}')" title="Editar remanente"><i class="bi bi-pencil-fill"></i></button>
                        <button class="btn btn-outline-danger btn-sm py-0 px-2 rounded-pill" onclick="event.stopPropagation(); window._neuEliminarLlanta(${index})" title="Eliminar"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    window._neuEliminarLlanta = function(index) {
        window._neuLlantasActuales.splice(index, 1);
        window._neuRenderTablaLlantas();
        if (window._neuRefrescar3D) window._neuRefrescar3D();
    };

    // ── AGREGAR CATÁLOGO EN CALIENTE ──────────────────────────────────────────────
    window._neuAgregarNuevoCatalogo = async function(tipo) {
        const nombreTipo = tipo === 'marcas' ? 'Marca' : (tipo === 'modelos' ? 'Modelo' : (tipo === 'medidas' ? 'Medida' : 'Acción'));
        const valor = prompt(`Ingrese el nombre de la nueva ${nombreTipo}:`);
        if (!valor || !valor.trim()) return;

        try {
            const res = await fetch(`/api/neumaticos/catalogos/${tipo}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: valor.trim() })
            });
            const data = await res.json();
            if (data.ok) {
                alert(`✅ ${nombreTipo} "${valor}" registrada exitosamente.`);
                window._neuCatalogos = null;
                const cats = await window._cargarCatalogosNeumaticos();
                window._neuRellenarSelects(cats);
                if (tipo === 'marcas') document.getElementById('neu-sel-marca').value = valor.toUpperCase();
                if (tipo === 'medidas') document.getElementById('neu-sel-medida').value = valor.toUpperCase();
                if (tipo === 'modelos') document.getElementById('neu-sel-modelo').value = valor.toUpperCase();
                if (tipo === 'acciones') window._neuSetAccionSelect(valor);
            } else {
                alert(`Error: ${data.error || 'No se pudo registrar'}`);
            }
        } catch (e) {
            alert(`Error de conexión: ${e.message}`);
        }
    };

    // ── GUARDAR INSPECCIÓN COMPLETA (PAYLOAD ESTRUCTURADO) ───────────────────────
    window._neuGuardarInspeccionCompleta = async function(placa, idOT) {
        if (window._neuLlantasActuales.length === 0) {
            alert('Debes agregar al menos una llanta a la inspección antes de guardar.');
            return;
        }

        const fecha_inspeccion = document.getElementById('neu-input-fecha')?.value;
        const dias_propuestos = parseInt(document.getElementById('neu-input-dias')?.value || 30, 10);
        const km_vehiculo = parseInt(document.getElementById('neu-input-km')?.value || 0, 10);
        const observaciones = document.getElementById('neu-input-obs-gen')?.value || '';
        const inspector = localStorage.getItem('fleet_user') || 'Supervisor';

        const btn = document.getElementById('neu-btn-guardar-todo');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Guardando...';
        }

        const payload = {
            id_ot: idOT || null,
            vehiculo_placa: placa,
            placa: placa,
            configuracion: window._neuConfigActualKey,
            dias_propuestos: String(dias_propuestos),
            odometro_km: String(km_vehiculo),
            observaciones_generales: observaciones,
            fecha_inspeccion,
            inspector,
            items: window._neuLlantasActuales,
            llantas_inspeccionadas: window._neuLlantasActuales
        };

        try {
            const res = await fetch('/api/neumaticos/inspecciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.ok) {
                alert('✅ Inspección de neumáticos guardada con éxito.');
                window.rotCerrarModalInspeccionNeumaticos();

                if (typeof window.rotRecargarDetalleOT === 'function' && idOT) {
                    window.rotRecargarDetalleOT(idOT);
                }
                if (typeof window.neuAnalisisCargar === 'function') window.neuAnalisisCargar();
                if (typeof window.neuUltimasCargar === 'function') window.neuUltimasCargar();
            } else {
                alert(`Error al guardar: ${data.error || 'Error desconocido'}`);
            }
        } catch (e) {
            alert(`Error de red: ${e.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill me-1 fs-6"></i> Guardar Inspección Completa';
            }
        }
    };

})();
