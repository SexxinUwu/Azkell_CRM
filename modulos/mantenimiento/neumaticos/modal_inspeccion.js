/**
 * modal_inspeccion.js — Módulo Interactivo de Inspección de Neumáticos (Three.js 3D/2D + Bento UI)
 * ERP Azkell Fleet
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

    // ── MAPEO VEHICULAR MTC Y CONFIGURACIONES PARAMÉTRICAS 3D ─────────────────────
    const ALIAS_MAPPER = {
        "C2": "4X2", "T2": "4X2", "4X2": "4X2",
        "C3": "6X4", "T3": "6X4", "6X4": "6X4",
        "6X2": "6X2",
        "S2": "S2", "S3": "S3",
        "T3S3": "T3S3", "C3S3": "T3S3"
    };

    const VEHICLE_CONFIGS_3D = {
        "4X2": {
            name: "C2 / T2 / 4x2 (6 Llantas)",
            totalTires: 6,
            positions: ["1", "2", "3", "4", "5", "6", "R"],
            axles: [
                { id: 1, z: -2.2, isDual: false, tires: [{ id: "1", side: "left", isOuter: false }, { id: "2", side: "right", isOuter: false }] },
                { id: 2, z: 1.8,  isDual: true,  tires: [{ id: "3", side: "left", isOuter: true }, { id: "4", side: "left", isOuter: false }, { id: "5", side: "right", isOuter: false }, { id: "6", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R", pos: [0, 0.4, -0.2] }]
        },
        "6X4": {
            name: "C3 / T3 / 6x4 (10 Llantas)",
            totalTires: 10,
            positions: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "R"],
            axles: [
                { id: 1, z: -3.0, isDual: false, tires: [{ id: "1", side: "left", isOuter: false }, { id: "2", side: "right", isOuter: false }] },
                { id: 2, z: 1.2,  isDual: true,  tires: [{ id: "3", side: "left", isOuter: true }, { id: "4", side: "left", isOuter: false }, { id: "5", side: "right", isOuter: false }, { id: "6", side: "right", isOuter: true }] },
                { id: 3, z: 2.8,  isDual: true,  tires: [{ id: "7", side: "left", isOuter: true }, { id: "8", side: "left", isOuter: false }, { id: "9", side: "right", isOuter: false }, { id: "10", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R", pos: [0, 0.4, -0.8] }]
        },
        "6X2": {
            name: "6x2 (8 Llantas)",
            totalTires: 8,
            positions: ["1", "2", "3", "4", "5", "6", "7", "8", "R"],
            axles: [
                { id: 1, z: -3.0, isDual: false, tires: [{ id: "1", side: "left", isOuter: false }, { id: "2", side: "right", isOuter: false }] },
                { id: 2, z: 1.2,  isDual: false, tires: [{ id: "3", side: "left", isOuter: false }, { id: "4", side: "right", isOuter: false }] },
                { id: 3, z: 2.8,  isDual: true,  tires: [{ id: "5", side: "left", isOuter: true }, { id: "6", side: "left", isOuter: false }, { id: "7", side: "right", isOuter: false }, { id: "8", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R", pos: [0, 0.4, -0.8] }]
        },
        "S2": {
            name: "S2 Semiremolque (8 Llantas)",
            totalTires: 8,
            positions: ["1", "2", "3", "4", "5", "6", "7", "8", "R1", "R2"],
            axles: [
                { id: 1, z: 1.0, isDual: true, tires: [{ id: "1", side: "left", isOuter: true }, { id: "2", side: "left", isOuter: false }, { id: "3", side: "right", isOuter: false }, { id: "4", side: "right", isOuter: true }] },
                { id: 2, z: 2.6, isDual: true, tires: [{ id: "5", side: "left", isOuter: true }, { id: "6", side: "left", isOuter: false }, { id: "7", side: "right", isOuter: false }, { id: "8", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R1", pos: [-0.4, 0.4, -1.8] }, { id: "R2", pos: [0.4, 0.4, -1.8] }]
        },
        "S3": {
            name: "S3 Semiremolque (12 Llantas)",
            totalTires: 12,
            positions: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "R1", "R2"],
            axles: [
                { id: 1, z: 0.0, isDual: true, tires: [{ id: "1", side: "left", isOuter: true }, { id: "2", side: "left", isOuter: false }, { id: "3", side: "right", isOuter: false }, { id: "4", side: "right", isOuter: true }] },
                { id: 2, z: 1.6, isDual: true, tires: [{ id: "5", side: "left", isOuter: true }, { id: "6", side: "left", isOuter: false }, { id: "7", side: "right", isOuter: false }, { id: "8", side: "right", isOuter: true }] },
                { id: 3, z: 3.2, isDual: true, tires: [{ id: "9", side: "left", isOuter: true }, { id: "10", side: "left", isOuter: false }, { id: "11", side: "right", isOuter: false }, { id: "12", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R1", pos: [-0.4, 0.4, -2.2] }, { id: "R2", pos: [0.4, 0.4, -2.2] }]
        },
        "T3S3": {
            name: "T3S3 Tracto-Semiremolque (22 Llantas)",
            totalTires: 22,
            positions: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","R1","R2"],
            axles: [
                { id: 1, z: -5.5, isDual: false, tires: [{ id: "1", side: "left", isOuter: false }, { id: "2", side: "right", isOuter: false }] },
                { id: 2, z: -3.8, isDual: true,  tires: [{ id: "3", side: "left", isOuter: true }, { id: "4", side: "left", isOuter: false }, { id: "5", side: "right", isOuter: false }, { id: "6", side: "right", isOuter: true }] },
                { id: 3, z: -2.2, isDual: true,  tires: [{ id: "7", side: "left", isOuter: true }, { id: "8", side: "left", isOuter: false }, { id: "9", side: "right", isOuter: false }, { id: "10", side: "right", isOuter: true }] },
                { id: 4, z: 2.0,  isDual: true,  tires: [{ id: "11", side: "left", isOuter: true }, { id: "12", side: "left", isOuter: false }, { id: "13", side: "right", isOuter: false }, { id: "14", side: "right", isOuter: true }] },
                { id: 5, z: 3.6,  isDual: true,  tires: [{ id: "15", side: "left", isOuter: true }, { id: "16", side: "left", isOuter: false }, { id: "17", side: "right", isOuter: false }, { id: "18", side: "right", isOuter: true }] },
                { id: 6, z: 5.2,  isDual: true,  tires: [{ id: "19", side: "left", isOuter: true }, { id: "20", side: "left", isOuter: false }, { id: "21", side: "right", isOuter: false }, { id: "22", side: "right", isOuter: true }] }
            ],
            spares: [{ id: "R1", pos: [-0.4, 0.4, -0.4] }, { id: "R2", pos: [0.4, 0.4, -0.4] }]
        }
    };

    // ── INYECCIÓN DE ESTILOS CSS ───────────────────────────────────────────────────
    if (!document.getElementById('estilos-drawer-neumaticos')) {
        const style = document.createElement('style');
        style.id = 'estilos-drawer-neumaticos';
        style.innerHTML = `
            .neu-sub-drawer {
                position: fixed !important;
                bottom: 0 !important;
                left: 50% !important;
                top: auto !important;
                right: auto !important;
                transform: translate3d(-50%, 100%, 0) !important;
                width: 100% !important;
                max-width: 760px !important;
                height: 94vh !important;
                max-height: 94vh !important;
                background: #f8fafc !important;
                border: 1px solid var(--border, #e2e8f0) !important;
                border-bottom: none !important;
                border-radius: 28px 28px 0 0 !important;
                box-shadow: 0 -16px 56px rgba(0,0,0,0.35) !important;
                transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
                will-change: transform;
                z-index: 2150 !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                visibility: hidden;
                margin: 0 !important;
            }
            .neu-sub-drawer.open {
                transform: translate3d(-50%, 0, 0) !important;
                visibility: visible !important;
                display: flex !important;
            }
            @media (max-width: 767.98px) {
                .neu-sub-drawer {
                    max-width: 100% !important;
                    height: 94vh !important;
                }
            }
            .neu-drawer-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.55);
                z-index: 2140;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            }
            .neu-drawer-backdrop.show {
                opacity: 1;
                pointer-events: auto;
            }
            .neu-touch-btn-pos {
                min-width: 50px;
                height: 48px;
                font-size: 1.05rem;
                font-weight: 800;
                border-radius: 14px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                user-select: none;
                transition: transform 0.1s ease, background-color 0.15s ease;
            }
            .neu-touch-btn-pos:active { transform: scale(0.92); }
            .neu-touch-btn-r {
                min-width: 42px;
                height: 42px;
                font-size: 0.95rem;
                font-weight: 700;
                border-radius: 10px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .neu-scroll-x {
                display: flex;
                overflow-x: auto;
                scroll-behavior: smooth;
                -webkit-overflow-scrolling: touch;
                padding: 4px 2px;
                gap: 8px;
            }
            .neu-scroll-x::-webkit-scrollbar { height: 4px; }
            .neu-scroll-x::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            .neu-toast {
                position: absolute;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: #0f172a;
                color: #ffffff;
                padding: 10px 20px;
                border-radius: 30px;
                font-size: 0.85rem;
                font-weight: 700;
                box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                z-index: 2200;
                display: flex;
                align-items: center;
                gap: 8px;
                opacity: 0;
                transition: opacity 0.25s ease, transform 0.25s ease;
                pointer-events: none;
            }
            .neu-toast.show {
                opacity: 1;
                transform: translate(-50%, -10px);
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
        return {
            marcas: ['WINDPOWER', 'GOODYEAR', 'MICHELIN', 'GITI', 'BRIDGESTONE', 'KUNLUN', 'CONTINENTAL', 'TRIANGLE', 'WESTLAKE', 'YOKOHAMA'],
            modelos: ['PROGUO1', 'GAU867', 'KT512', 'Y999', 'KMAX', '366', 'TR685', 'F820', 'RS618A'],
            medidas: ['275/70R22.5', '295/80R22.5', '245/70R19.5', '11R22.5', '315/80R22.5'],
            acciones: ['Inspeccion', 'Rotación', 'Reparacion', 'Cambio', 'Instalacion'],
            estados: ['NUEVA', 'BUENA', 'RECAPADA', 'REGULAR', 'MALA', 'CRÍTICA']
        };
    };

    // ── ABRIR DRAWER SUB-MODAL ────────────────────────────────────────────────────
    window.rotAbrirInspeccionNeumaticos = async function(placa, idOT, kmVehiculo, configCode) {
        window._neuLlantasActuales = [];
        const hoy = new Date().toISOString().split('T')[0];
        const km = kmVehiculo || 0;

        // Determinar clave de configuración 3D a partir de alias MTC
        const aliasKey = (configCode || '').toUpperCase().trim();
        const mappedKey = ALIAS_MAPPER[aliasKey] || ALIAS_MAPPER[aliasKey.replace(/[^A-Z0-9]/g, '')] || '6X4';
        window._neuConfigActualKey = mappedKey;

        // Asegurar backdrop
        let backdrop = document.getElementById('neuDrawerBackdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'neuDrawerBackdrop';
            backdrop.className = 'neu-drawer-backdrop';
            backdrop.onclick = window.rotCerrarModalInspeccionNeumaticos;
            document.body.appendChild(backdrop);
        }

        // Asegurar Drawer en el DOM
        let drawerEl = document.getElementById('rot-drawer-neumaticos');
        if (!drawerEl) {
            drawerEl = document.createElement('div');
            drawerEl.className = 'neu-sub-drawer';
            drawerEl.id = 'rot-drawer-neumaticos';
            drawerEl.innerHTML = `
                <!-- HEADER BENTO -->
                <div class="d-flex align-items-center justify-content-between px-3 px-md-4 py-3 border-bottom bg-white" style="min-height: 62px;">
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-light border rounded-circle d-flex align-items-center justify-content-center shadow-2xs" 
                                onclick="window.rotCerrarModalInspeccionNeumaticos()" title="Volver" style="width: 40px; height: 40px; color: var(--subtext);">
                            <i class="bi bi-arrow-left fs-5"></i>
                        </button>
                        <div>
                            <span class="fw-bold text-dark d-flex align-items-center gap-2" style="font-size: 1.15rem;">
                                <i class="bi bi-disc-fill text-primary"></i> Inspección de Neumáticos
                                <span class="badge bg-primary rounded-pill px-3 py-1 fs-6" id="neu-badge-placa">PLACA</span>
                            </span>
                            <small class="text-muted d-block" style="font-size: 0.75rem;">Control táctil de cocadas, presiones y chasis interactivo</small>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <select id="neu-select-config" class="form-select form-select-sm rounded-pill fw-bold text-primary border-primary" style="width: auto; max-width: 220px;" onchange="window._neuCambiarConfiguracion(this.value)">
                            <option value="6X4">C3 / T3 / 6x4 (10 Llantas)</option>
                            <option value="4X2">C2 / T2 / 4x2 (6 Llantas)</option>
                            <option value="6X2">6x2 (8 Llantas)</option>
                            <option value="S2">S2 Semiremolque (8 Llantas)</option>
                            <option value="S3">S3 Semiremolque (12 Llantas)</option>
                            <option value="T3S3">T3S3 Tracto-Semiremolque (22 Llantas)</option>
                        </select>
                        <button class="btn btn-light border-0 rounded-circle p-2" onclick="window.rotCerrarModalInspeccionNeumaticos()" style="color:var(--subtext);">
                            <i class="bi bi-x-lg fs-5"></i>
                        </button>
                    </div>
                </div>

                <!-- BODY SCROLL -->
                <div class="p-3 p-md-4 overflow-auto custom-scrollbar flex-grow-1" id="neu-drawer-scroll-body" style="background: #f8fafc; padding-bottom: 120px !important;">
                    
                    <!-- BENTO 1: Encabezado General -->
                    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid var(--border, #e2e8f0) !important;">
                        <div class="row g-2 g-md-3">
                            <div class="col-12 col-sm-4">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.75rem;">Fecha de Inspección *</label>
                                <input type="date" class="form-control rounded-3 fw-bold" style="height: 46px; font-size: 0.95rem;" id="neu-input-fecha" value="${hoy}">
                            </div>
                            <div class="col-6 col-sm-4">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.75rem;">Días Propuestos</label>
                                <div class="input-group" style="height: 46px;">
                                    <button class="btn btn-outline-secondary px-3" type="button" onclick="var el=document.getElementById('neu-input-dias'); el.value = Math.max(1, (parseInt(el.value)||30)-5);"><i class="bi bi-dash fs-5"></i></button>
                                    <input type="number" class="form-control text-center fw-bold fs-6" id="neu-input-dias" value="30">
                                    <button class="btn btn-outline-secondary px-3" type="button" onclick="var el=document.getElementById('neu-input-dias'); el.value = (parseInt(el.value)||30)+5;"><i class="bi bi-plus fs-5"></i></button>
                                </div>
                            </div>
                            <div class="col-6 col-sm-4">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.75rem;">KM Odómetro</label>
                                <input type="number" class="form-control rounded-3 fw-bold fs-6" style="height: 46px;" id="neu-input-km" value="${km}">
                            </div>
                            <div class="col-12">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.75rem;">Observaciones Generales</label>
                                <input type="text" class="form-control rounded-3" style="height: 44px; font-size: 0.95rem;" id="neu-input-obs-gen" placeholder="Ej: Inspección rutinaria de flota mensual...">
                            </div>
                        </div>
                    </div>

                    <!-- BENTO 2: Esquema Interactivo 3D/2D de Chasis -->
                    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid var(--border, #e2e8f0) !important; position:relative;">
                        <div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
                            <h6 class="fw-bold m-0 small text-dark d-flex align-items-center gap-2">
                                <i class="bi bi-truck text-primary fs-6"></i> ESQUEMA VISUAL DE EJES Y LLANTAS
                                <small class="text-muted fw-normal" style="font-size:0.72rem;">Toca o arrastra cualquier llanta</small>
                            </h6>
                            
                            <div class="d-flex align-items-center gap-1 flex-wrap">
                                <button class="btn btn-sm btn-primary py-1 px-3 rounded-pill fw-bold" id="btn-view-2d" onclick="window._neuSetViewMode('2d')">
                                    <i class="bi bi-arrows-fullscreen me-1"></i> Vista 2D
                                </button>
                                <button class="btn btn-sm btn-outline-secondary py-1 px-3 rounded-pill fw-bold" id="btn-view-iso" onclick="window._neuSetViewMode('iso')">
                                    <i class="bi bi-box-seam me-1"></i> Isométrica
                                </button>
                                <button class="btn btn-sm btn-outline-secondary py-1 px-3 rounded-pill fw-bold" id="btn-view-lat" onclick="window._neuSetViewMode('lat')">
                                    <i class="bi bi-truck me-1"></i> Lateral
                                </button>
                                <button class="btn btn-sm btn-outline-warning py-1 px-3 rounded-pill fw-bold" id="btn-xray" onclick="window._neuToggleXRay()">
                                    <i class="bi bi-eye-fill me-1"></i> Rayos X
                                </button>
                            </div>
                        </div>

                        <!-- Canvas 3D / 2D Wrapper -->
                        <div class="p-0 rounded-4 bg-slate-100 overflow-hidden position-relative" style="height: 340px; background:#f1f5f9; border:1px solid #e2e8f0;" id="neu-chassis-container">
                            <!-- Banner flotante de instrucción al arrastrar -->
                            <div id="dragInstructionBanner" style="position:absolute; top:12px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.88); color:#fff; padding:6px 16px; border-radius:20px; font-size:0.78rem; font-weight:700; display:none; pointer-events:none; z-index:10; box-shadow:0 4px 12px rgba(0,0,0,0.25);">
                                <i class="bi bi-arrows-move me-1 text-info"></i> Arrastrando llanta — Suelta sobre otra llanta para rotar
                            </div>
                        </div>

                        <!-- Leyenda Semáforo -->
                        <div class="d-flex justify-content-between align-items-center mt-2 px-1 flex-wrap gap-2" style="font-size: 0.76rem;">
                            <div class="d-flex align-items-center gap-3">
                                <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:10px;height:10px;background:#22c55e;"></span> <b>Óptima (>6mm)</b></div>
                                <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:10px;height:10px;background:#eab308;"></span> <b>Alerta (4-6mm)</b></div>
                                <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:10px;height:10px;background:#ef4444;"></span> <b>Crítica (≤4mm)</b></div>
                                <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:10px;height:10px;background:#3b82f6;"></span> <b>Rotada 🔄</b></div>
                            </div>
                            <span class="text-muted fw-semibold" id="neu-chassis-stats-summary">Total: 0 llantas</span>
                        </div>
                    </div>

                    <!-- BENTO 3: Formulario Táctil de Llanta Seleccionada -->
                    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid var(--border, #e2e8f0) !important;">
                        <div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-primary rounded-circle d-flex align-items-center justify-content-center fs-6 shadow-sm" style="width:34px;height:34px;" id="neu-form-pos-badge">1</span>
                                <h6 class="fw-bold m-0 text-dark">Datos de Llanta — Posición <span id="neu-pos-label-top" class="text-primary">1</span></h6>
                            </div>
                            <button class="btn btn-sm btn-light border py-1 px-3 rounded-pill fw-bold text-muted" style="font-size:0.75rem;" onclick="window._neuLimpiarFormLlanta()">
                                <i class="bi bi-arrow-counterclockwise me-1"></i> Limpiar Campos
                            </button>
                        </div>

                        <!-- Selector Táctil de Posición -->
                        <div class="mb-3">
                            <label class="form-label text-muted fw-bold small mb-2 d-block" style="font-size:0.78rem;">SELECCIONAR POSICIÓN:</label>
                            <div class="neu-scroll-x" id="neu-pos-selector"></div>
                        </div>

                        <!-- Marca, Medida, Modelo con Buscador Autocomplete -->
                        <div class="row g-2 mb-3">
                            <div class="col-12 col-sm-4">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.75rem;">Marca</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('marcas')" class="text-primary small fw-bold" style="font-size:0.75rem;">+ Nueva</a>
                                </div>
                                <input type="text" class="form-control rounded-3 fw-bold text-uppercase" style="height: 46px;" id="neu-sel-marca" list="dl-neu-marcas" placeholder="Escribe o busca marca..." autocomplete="off">
                                <datalist id="dl-neu-marcas"></datalist>
                            </div>
                            <div class="col-12 col-sm-4">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.75rem;">Medida</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('medidas')" class="text-primary small fw-bold" style="font-size:0.75rem;">+ Nueva</a>
                                </div>
                                <input type="text" class="form-control rounded-3 fw-bold text-uppercase" style="height: 46px;" id="neu-sel-medida" list="dl-neu-medidas" placeholder="Escribe o busca medida..." autocomplete="off">
                                <datalist id="dl-neu-medidas"></datalist>
                            </div>
                            <div class="col-12 col-sm-4">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.75rem;">Modelo</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('modelos')" class="text-primary small fw-bold" style="font-size:0.75rem;">+ Nuevo</a>
                                </div>
                                <input type="text" class="form-control rounded-3 fw-bold text-uppercase" style="height: 46px;" id="neu-sel-modelo" list="dl-neu-modelos" placeholder="Escribe o busca modelo..." autocomplete="off">
                                <datalist id="dl-neu-modelos"></datalist>
                            </div>
                        </div>

                        <!-- Profundímetro Táctil (R1, R2, R3, R4) -->
                        <div class="mb-3 p-3 rounded-4 bg-light border" style="border-color: var(--border, #e2e8f0) !important;">
                            <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom flex-wrap gap-2">
                                <div>
                                    <h6 class="m-0 fw-bold text-dark d-flex align-items-center gap-1" style="font-size: 0.95rem;">
                                        <i class="bi bi-rulers text-primary"></i> Profundímetro Táctil (mm)
                                    </h6>
                                    <small class="text-muted" style="font-size:0.75rem;">Toca el número medido para cada ranura</small>
                                </div>
                                <span class="badge bg-white text-primary border shadow-sm px-3 py-2 fs-6 rounded-pill" id="neu-r-prom-badge">Promedio: -- mm</span>
                            </div>

                            <!-- R1 (Exterior) -->
                            <div class="mb-3 p-2 bg-white rounded-3 border" style="border-color: var(--border, #e2e8f0) !important;">
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <span class="fw-bold text-dark" style="font-size:0.85rem;">
                                        <i class="bi bi-arrow-left-circle-fill text-primary me-1"></i> R1 — Hombro Exterior:
                                    </span>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:34px;height:34px;" onclick="window._neuAjustarR('r1', -1)"><i class="bi bi-dash fs-5"></i></button>
                                        <span class="badge bg-secondary px-3 py-1 fs-6 rounded-pill shadow-2xs" id="lbl-r1">0 mm</span>
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:34px;height:34px;" onclick="window._neuAjustarR('r1', 1)"><i class="bi bi-plus fs-5"></i></button>
                                    </div>
                                </div>
                                <div class="neu-scroll-x" id="neu-r1-buttons"></div>
                            </div>

                            <!-- R2 (Centro 1) -->
                            <div class="mb-3 p-2 bg-white rounded-3 border" style="border-color: var(--border, #e2e8f0) !important;">
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <span class="fw-bold text-dark" style="font-size:0.85rem;">
                                        <i class="bi bi-record-circle-fill text-primary me-1"></i> R2 — Ranura Central 1:
                                    </span>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:34px;height:34px;" onclick="window._neuAjustarR('r2', -1)"><i class="bi bi-dash fs-5"></i></button>
                                        <span class="badge bg-secondary px-3 py-1 fs-6 rounded-pill shadow-2xs" id="lbl-r2">0 mm</span>
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:34px;height:34px;" onclick="window._neuAjustarR('r2', 1)"><i class="bi bi-plus fs-5"></i></button>
                                    </div>
                                </div>
                                <div class="neu-scroll-x" id="neu-r2-buttons"></div>
                            </div>

                            <!-- R3 (Centro 2 / Interior) -->
                            <div class="mb-3 p-2 bg-white rounded-3 border" style="border-color: var(--border, #e2e8f0) !important;">
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <span class="fw-bold text-dark" style="font-size:0.85rem;">
                                        <i class="bi bi-arrow-right-circle-fill text-primary me-1"></i> R3 — Ranura Interior:
                                    </span>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:34px;height:34px;" onclick="window._neuAjustarR('r3', -1)"><i class="bi bi-dash fs-5"></i></button>
                                        <span class="badge bg-secondary px-3 py-1 fs-6 rounded-pill shadow-2xs" id="lbl-r3">0 mm</span>
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:34px;height:34px;" onclick="window._neuAjustarR('r3', 1)"><i class="bi bi-plus fs-5"></i></button>
                                    </div>
                                </div>
                                <div class="neu-scroll-x" id="neu-r3-buttons"></div>
                            </div>

                            <!-- R4 (Hombro Interior - Opcional) -->
                            <div class="p-2 bg-white rounded-3 border" style="border-color: var(--border, #e2e8f0) !important;">
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <span class="fw-bold text-dark" style="font-size:0.85rem;">
                                        <i class="bi bi-dash-circle-dotted text-secondary me-1"></i> R4 — Hombro Interior (Opcional):
                                    </span>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:34px;height:34px;" onclick="window._neuAjustarR('r4', -1)"><i class="bi bi-dash fs-5"></i></button>
                                        <span class="badge bg-secondary px-3 py-1 fs-6 rounded-pill shadow-2xs" id="lbl-r4">0 mm</span>
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:34px;height:34px;" onclick="window._neuAjustarR('r4', 1)"><i class="bi bi-plus fs-5"></i></button>
                                    </div>
                                </div>
                                <div class="neu-scroll-x" id="neu-r4-buttons"></div>
                            </div>
                        </div>

                        <!-- Presión, Estado, Acción, ROT -->
                        <div class="row g-2 mb-3">
                            <div class="col-6 col-sm-3">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.75rem;">Presión Ant. (PSI)</label>
                                <input type="number" class="form-control rounded-3 fw-bold text-center fs-6" style="height: 46px;" id="neu-input-pres-ant" value="" placeholder="Ej: 100">
                            </div>
                            <div class="col-6 col-sm-3">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.75rem;">Presión Actual (PSI)</label>
                                <input type="number" class="form-control rounded-3 fw-bold text-center fs-6 text-primary" style="height: 46px;" id="neu-input-pres-act" value="" placeholder="Ej: 110">
                            </div>
                            <div class="col-6 col-sm-2">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.75rem;">Estado</label>
                                <select class="form-select rounded-3 fw-semibold" style="height: 46px;" id="neu-sel-estado">
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
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.75rem;">Acción</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('acciones')" class="text-primary small fw-bold" style="font-size:0.72rem;">+ Nueva</a>
                                </div>
                                <select class="form-select rounded-3 fw-semibold" style="height: 46px;" id="neu-sel-accion"></select>
                            </div>
                            <div class="col-12 col-sm-2">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.75rem;">ROT (Rotación)</label>
                                <select class="form-select rounded-3 fw-semibold" style="height: 46px;" id="neu-sel-rot">
                                    <option value="NO">NO</option>
                                    <option value="SI">SI</option>
                                </select>
                            </div>
                        </div>

                        <!-- Fotos 1, 2, 3 -->
                        <div class="mb-3 p-3 bg-light rounded-3 border" style="border-color: var(--border, #e2e8f0) !important;">
                            <label class="form-label text-muted fw-bold small mb-2 d-block" style="font-size:0.78rem;">
                                <i class="bi bi-camera-fill text-primary me-1"></i> Evidencia Fotográfica (Foto 1, Foto 2, Foto 3)
                            </label>
                            <div class="row g-2">
                                <div class="col-4">
                                    <input type="file" id="neu-file-foto1" accept="image/*" class="d-none" onchange="window._neuProcesarFoto(1, this)">
                                    <button type="button" class="btn btn-outline-secondary w-100 py-2 rounded-3 text-truncate fw-semibold d-flex flex-column align-items-center justify-content-center" style="height: 54px; font-size: 0.82rem;" onclick="document.getElementById('neu-file-foto1').click()" id="btn-neu-foto1">
                                        <i class="bi bi-camera fs-5"></i>
                                        <span>Foto 1</span>
                                    </button>
                                </div>
                                <div class="col-4">
                                    <input type="file" id="neu-file-foto2" accept="image/*" class="d-none" onchange="window._neuProcesarFoto(2, this)">
                                    <button type="button" class="btn btn-outline-secondary w-100 py-2 rounded-3 text-truncate fw-semibold d-flex flex-column align-items-center justify-content-center" style="height: 54px; font-size: 0.82rem;" onclick="document.getElementById('neu-file-foto2').click()" id="btn-neu-foto2">
                                        <i class="bi bi-camera fs-5"></i>
                                        <span>Foto 2</span>
                                    </button>
                                </div>
                                <div class="col-4">
                                    <input type="file" id="neu-file-foto3" accept="image/*" class="d-none" onchange="window._neuProcesarFoto(3, this)">
                                    <button type="button" class="btn btn-outline-secondary w-100 py-2 rounded-3 text-truncate fw-semibold d-flex flex-column align-items-center justify-content-center" style="height: 54px; font-size: 0.82rem;" onclick="document.getElementById('neu-file-foto3').click()" id="btn-neu-foto3">
                                        <i class="bi bi-camera fs-5"></i>
                                        <span>Foto 3</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Observación de la llanta -->
                        <div class="mb-3">
                            <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.78rem;">Observación de la Llanta (OBS)</label>
                            <input type="text" class="form-control rounded-3" style="height: 46px; font-size: 0.95rem;" id="neu-input-obs-item" value="" placeholder="Ej: Desgaste regular, sin cortes...">
                        </div>

                        <!-- Botón Agregar Llanta a la Lista -->
                        <button class="btn btn-primary btn-lg rounded-pill py-3 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2 w-100 fs-6" onclick="window._neuGuardarLlantaEnLista()">
                            <i class="bi bi-plus-circle-fill fs-5"></i> Guardar Llanta en Inspección y Pasar a la Siguiente
                        </button>
                    </div>

                    <!-- BENTO 4: Llantas Inspeccionadas -->
                    <div class="card border-0 rounded-4 overflow-hidden bg-white shadow-2xs mb-4" style="border: 1px solid var(--border, #e2e8f0) !important;">
                        <div class="card-header bg-light px-3 py-3 d-flex align-items-center justify-content-between border-bottom">
                            <div class="d-flex align-items-center gap-2">
                                <h6 class="m-0 fw-bold text-dark">Llantas Agregadas a la Inspección</h6>
                                <span class="badge bg-primary rounded-pill px-3 fs-6" id="neu-tabla-count">0</span>
                            </div>
                            <small class="text-muted">Ordenamiento numérico estricto por posición</small>
                        </div>
                        <div class="table-responsive" style="max-height: 280px;">
                            <table class="table table-hover table-sm align-middle mb-0" style="font-size: 0.82rem;">
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
                                        <th>ROT</th>
                                        <th class="text-center">Fotos</th>
                                        <th>Obs</th>
                                        <th class="text-center pe-3">Acción</th>
                                    </tr>
                                </thead>
                                <tbody id="neu-tabla-tbody">
                                    <tr><td colspan="16" class="text-center text-muted py-4">Aún no has agregado ninguna llanta a la inspección.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- FOOTER FIJO -->
                <div class="d-flex align-items-center justify-content-between gap-3 p-3 bg-white border-top shadow-lg" style="position: sticky; bottom: 0; z-index: 10;">
                    <button type="button" class="btn btn-outline-secondary rounded-pill px-4 py-2 fw-bold" onclick="window.rotCerrarModalInspeccionNeumaticos()">Cancelar</button>
                    <button type="button" class="btn btn-success rounded-pill px-4 py-3 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2 flex-grow-1 fs-6" id="neu-btn-guardar-todo" onclick="window._neuGuardarInspeccionCompleta('${placa}', '${idOT||''}')">
                        <i class="bi bi-cloud-arrow-up-fill fs-5"></i> Guardar Inspección Completa
                    </button>
                </div>

                <!-- TOAST EMERGENTE -->
                <div id="neuToast" class="neu-toast">
                    <i class="bi bi-arrow-repeat text-info fs-5"></i>
                    <span id="neuToastMsg">Rotación realizada</span>
                </div>
            `;
            document.body.appendChild(drawerEl);
        }

        // Seleccionar opción en el selector de configuración
        const selConfig = document.getElementById('neu-select-config');
        if (selConfig) selConfig.value = window._neuConfigActualKey;

        // Abrir modal con animación
        drawerEl.classList.add('open');
        backdrop.classList.add('show');

        // Setear encabezados
        document.getElementById('neu-badge-placa').innerText = (placa || 'SIN-PLACA').toUpperCase();
        document.getElementById('neu-input-fecha').value = hoy;
        document.getElementById('neu-input-km').value = km || '';
        document.getElementById('neu-input-dias').value = 30;
        document.getElementById('neu-input-obs-gen').value = '';

        // Configurar posiciones y renderizar 3D / Tabla / Botonera
        const cfg = VEHICLE_CONFIGS_3D[window._neuConfigActualKey] || VEHICLE_CONFIGS_3D["6X4"];
        window._neuRenderPosiciones(cfg.positions);
        window._neuRenderBotoneraR();
        window._neuRenderTablaLlantas();

        // Cargar Three.js e Iniciar Escena 3D
        loadThreeJs(function() {
            window._neuInitThreeEngine(cfg);
        });

        // Cargar Catálogos y Última Inspección en Paralelo
        window._neuUltimaInspeccionMap = {};
        const catsPromise = window._cargarCatalogosNeumaticos();
        const ultPromise = placa ? fetch('/api/neumaticos/placa-ultima/' + encodeURIComponent(placa)).then(r => r.json()).catch(() => null) : Promise.resolve(null);

        const [cats, resUlt] = await Promise.all([catsPromise, ultPromise]);
        
        if (cats) window._neuRellenarSelects(cats);
        if (resUlt && resUlt.ok && resUlt.datosPosiciones) {
            window._neuUltimaInspeccionMap = resUlt.datosPosiciones;
        }

        window._neuSeleccionarPosicion('1');
    };

    window.rotCerrarModalInspeccionNeumaticos = function() {
        const drawerEl = document.getElementById('rot-drawer-neumaticos');
        const backdrop = document.getElementById('neuDrawerBackdrop');
        if (drawerEl) drawerEl.classList.remove('open');
        if (backdrop) backdrop.classList.remove('show');
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
        setTimeout(() => toast.classList.remove('show'), 3200);
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

    // ── RELLENAR SELECTS / DATALISTS ─────────────────────────────────────────────
    window._neuRellenarSelects = function(cats) {
        const dlMarca  = document.getElementById('dl-neu-marcas');
        const dlMedida = document.getElementById('dl-neu-medidas');
        const dlModelo = document.getElementById('dl-neu-modelos');
        const selAccion = document.getElementById('neu-sel-accion');

        if (dlMarca && cats.marcas) dlMarca.innerHTML = cats.marcas.map(m => `<option value="${m}">`).join('');
        if (dlMedida && cats.medidas) dlMedida.innerHTML = cats.medidas.map(m => `<option value="${m}">`).join('');
        if (dlModelo && cats.modelos) dlModelo.innerHTML = cats.modelos.map(m => `<option value="${m}">`).join('');
        if (selAccion && cats.acciones) {
            selAccion.innerHTML = cats.acciones.map(a => `<option value="${a}">${a}</option>`).join('');
            selAccion.value = 'Inspeccion';
        }
    };

    // ── RENDER POSICIONES EN BARRA TÁCTIL ─────────────────────────────────────────
    window._neuRenderPosiciones = function(posArray) {
        const wrap = document.getElementById('neu-pos-selector');
        if (!wrap) return;
        wrap.innerHTML = posArray.map(p => {
            const hasRot = window._neuLlantasActuales.some(l => String(l.posicion) === String(p) && l.rot === 'SI');
            return `
                <button type="button" class="btn ${p === window._neuPosicionActiva ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary'} neu-touch-btn-pos position-relative" onclick="window._neuSeleccionarPosicion('${p}')" id="btn-pos-${p}">
                    ${p} ${hasRot ? '<span style="font-size:0.7rem; position:absolute; top:2px; right:4px;">🔄</span>' : ''}
                </button>
            `;
        }).join('');
    };

    // ── MOTOR GRÁFICO 3D / 2D (THREE.JS + POINTER EVENTS DRAG & DROP) ──────────────
    window._neuInitThreeEngine = function(cfg) {
        const container = document.getElementById('neu-chassis-container');
        if (!container || !window.THREE) return;

        // Limpiar canvas anterior si existe
        const oldCanvas = container.querySelector('canvas');
        if (oldCanvas) oldCanvas.remove();

        const width = container.clientWidth || 700;
        const height = container.clientHeight || 340;

        // Scene, Camera, Renderer
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf1f5f9);

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableRotate = false;
        controls.enablePan = false;
        controls.enableZoom = false;

        // Luces
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        scene.add(dirLight);

        // Grupo principal del vehículo
        const vehicleGroup = new THREE.Group();
        scene.add(vehicleGroup);

        // Materiales del chasis
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5, roughness: 0.4, transparent: true, opacity: 0.95 });
        const cabinMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.2, roughness: 0.3, transparent: true, opacity: 0.95 });

        // Encontrar dimensiones Z de ejes
        let minZ = 0, maxZ = 0;
        cfg.axles.forEach(a => {
            if (a.z < minZ) minZ = a.z;
            if (a.z > maxZ) maxZ = a.z;
        });

        // 1. Chasis central (Vigas de acero)
        const frameLength = (maxZ - minZ) + 3.0;
        const centerZ = (minZ + maxZ) / 2;
        const frameGeo = new THREE.BoxGeometry(0.8, 0.2, frameLength);
        const frameMesh = new THREE.Mesh(frameGeo, frameMat);
        frameMesh.position.set(0, 0.2, centerZ);
        vehicleGroup.add(frameMesh);

        // 2. Cabina (frente)
        const cabinGeo = new THREE.BoxGeometry(1.6, 1.2, 1.8);
        const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
        cabinMesh.position.set(0, 0.8, minZ - 1.2);
        vehicleGroup.add(cabinMesh);

        // Textura procedural de rodamiento de llanta (Canvas2D)
        const treadCanvas = document.createElement('canvas');
        treadCanvas.width = 256;
        treadCanvas.height = 256;
        const ctx = treadCanvas.getContext('2d');
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#0f172a';
        for (let y = 0; y < 256; y += 32) {
            ctx.fillRect(16, y + 4, 100, 14);
            ctx.fillRect(140, y + 16, 100, 14);
        }
        const treadTexture = new THREE.CanvasTexture(treadCanvas);
        treadTexture.wrapS = THREE.RepeatWrapping;
        treadTexture.wrapT = THREE.RepeatWrapping;
        treadTexture.repeat.set(1, 4);

        const rubberMat = new THREE.MeshStandardMaterial({ map: treadTexture, color: 0x1e293b, roughness: 0.8 });
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.2 });

        // Colección de objetos 3D de llantas para Raycasting
        const tireMeshesMap = {};
        const tireObjectsArray = [];

        // Generar Neumático 3D genérico
        function createTireMesh3D(posId) {
            const tireGroup = new THREE.Group();
            
            // Goma neumático
            const rubberGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.32, 24);
            rubberGeo.rotateZ(Math.PI / 2);
            const rubberMesh = new THREE.Mesh(rubberGeo, rubberMat);
            rubberMesh.castShadow = true;
            tireGroup.add(rubberMesh);

            // Rin de aluminio
            const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.33, 16);
            rimGeo.rotateZ(Math.PI / 2);
            const rimMesh = new THREE.Mesh(rimGeo, rimMat);
            tireGroup.add(rimMesh);

            // Anillo exterior indicador (Torus)
            const ringGeo = new THREE.TorusGeometry(0.51, 0.04, 8, 24);
            ringGeo.rotateY(Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            tireGroup.add(ringMesh);
            tireGroup.ringMesh = ringMesh;

            // Etiqueta 3D Canvas con el número de posición
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
            sprite.scale.set(0.65, 0.65, 1);
            sprite.position.set(0, 0.65, 0);
            tireGroup.add(sprite);

            tireGroup.userData = { isTire: true, id: String(posId) };
            rubberMesh.userData = { isTire: true, id: String(posId), parentGroup: tireGroup };

            return tireGroup;
        }

        // Posicionar ejes y llantas en el vehículo
        cfg.axles.forEach(axle => {
            // Eje tubo
            const axleGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.0, 12);
            axleGeo.rotateZ(Math.PI / 2);
            const axleMesh = new THREE.Mesh(axleGeo, frameMat);
            axleMesh.position.set(0, 0.4, axle.z);
            vehicleGroup.add(axleMesh);

            axle.tires.forEach(t => {
                const mesh = createTireMesh3D(t.id);
                let xPos = 0;
                if (t.side === "left") {
                    xPos = t.isOuter ? -1.45 : -0.92;
                } else {
                    xPos = t.isOuter ? 1.45 : 0.92;
                }
                const posVec = new THREE.Vector3(xPos, 0.4, axle.z);
                mesh.position.copy(posVec);
                mesh.userData.defaultPos = posVec.clone();
                vehicleGroup.add(mesh);

                tireMeshesMap[t.id] = mesh;
                tireObjectsArray.push(mesh.children[0]); // rubberMesh para raycast
            });
        });

        // Posicionar repuestos
        if (cfg.spares) {
            cfg.spares.forEach(sp => {
                const mesh = createTireMesh3D(sp.id);
                const posVec = new THREE.Vector3(sp.pos[0], sp.pos[1], sp.pos[2]);
                mesh.position.copy(posVec);
                mesh.userData.defaultPos = posVec.clone();
                vehicleGroup.add(mesh);

                tireMeshesMap[sp.id] = mesh;
                tireObjectsArray.push(mesh.children[0]);
            });
        }

        // Anillo de resaltado verde sobre destino en Drag & Drop (Hover)
        const highlightGeo = new THREE.RingGeometry(0.55, 0.68, 32);
        highlightGeo.rotateX(-Math.PI / 2);
        const highlightMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
        const highlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
        highlightMesh.visible = false;
        scene.add(highlightMesh);

        // ── AJUSTE DE CÁMARA 90° CENITAL 2D (autoHeight + 55% margen) ────────────────
        window._neuUpdateCameraView = function() {
            const totalLength = frameLength;
            const autoHeight = Math.max(10, totalLength * 1.55);

            if (window._neuViewMode === '2d') {
                camera.position.set(0, autoHeight, centerZ + 0.0001);
                camera.lookAt(0, 0, centerZ);
                controls.enableRotate = false; controls.enablePan = false; controls.enableZoom = false;
            } else if (window._neuViewMode === 'iso') {
                camera.position.set(autoHeight * 0.7, autoHeight * 0.7, centerZ + autoHeight * 0.7);
                camera.lookAt(0, 0, centerZ);
                controls.enableRotate = true; controls.enablePan = true; controls.enableZoom = true;
            } else if (window._neuViewMode === 'lat') {
                camera.position.set(autoHeight * 1.2, 0.5, centerZ);
                camera.lookAt(0, 0, centerZ);
                controls.enableRotate = true; controls.enablePan = true; controls.enableZoom = true;
            }
            controls.update();
        };
        window._neuUpdateCameraView();

        // Actualizar resumen estadísticas de llantas
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
                        ring.material.color.setHex(0x3b82f6); // Azul rotación
                    } else {
                        const prom = parseFloat(lData.remanente_promedio || 0);
                        if (prom <= 4.0) ring.material.color.setHex(0xef4444); // Red
                        else if (prom <= 6.0) ring.material.color.setHex(0xeab308); // Yellow
                        else ring.material.color.setHex(0x22c55e); // Green
                    }
                } else {
                    ring.material.color.setHex(isActive ? 0x2563eb : 0x94a3b8);
                }

                // Resaltar escala de llanta activa
                if (isActive) {
                    meshGroup.scale.set(1.1, 1.1, 1.1);
                } else {
                    meshGroup.scale.set(1.0, 1.0, 1.0);
                }
            });
        };
        window._neuActualizar3DColores();

        // ── RAYCASTING Y LÓGICA DRAG & DROP DE ROTACIONES (POINTER EVENTS) ───────────
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4);
        const planeIntersect = new THREE.Vector3();

        let isPointerDown = false;
        let isDragging = false;
        let startPointerPos = { x: 0, y: 0 };
        let draggedTireGroup = null;
        let draggedTireId = null;
        let hoverTargetId = null;

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
                    canvasEl.setPointerCapture(e.pointerId);
                }
            }
        });

        canvasEl.addEventListener('pointermove', (e) => {
            if (!isPointerDown || !draggedTireGroup) return;

            const dist = Math.hypot(e.clientX - startPointerPos.x, e.clientY - startPointerPos.y);
            
            // Activar arrastre si se supera umbral de 8px
            if (dist > 8 && !isDragging) {
                isDragging = true;
                draggedTireGroup.scale.set(1.18, 1.18, 1.18);
                const banner = document.getElementById('dragInstructionBanner');
                if (banner) {
                    banner.style.display = 'block';
                    banner.innerHTML = `<i class="bi bi-arrows-move me-1 text-info"></i> Arrastrando Llanta #${draggedTireId} — Suelta sobre otra llanta para rotar`;
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

                // Raycast para detectar llanta objetivo debajo
                const intersects = raycaster.intersectObjects(tireObjectsArray, false);
                let hitTarget = null;
                for (let hit of intersects) {
                    const tid = hit.object.userData.id;
                    if (tid && tid !== draggedTireId) {
                        hitTarget = tid;
                        break;
                    }
                }

                if (hitTarget) {
                    hoverTargetId = hitTarget;
                    const targetGroup = tireMeshesMap[hitTarget];
                    if (targetGroup) {
                        highlightMesh.position.set(targetGroup.position.x, 0.41, targetGroup.position.z);
                        highlightMesh.visible = true;
                    }
                } else {
                    hoverTargetId = null;
                    highlightMesh.visible = false;
                }
            }
        });

        const endDragHandler = (e) => {
            if (!isPointerDown) return;

            const banner = document.getElementById('dragInstructionBanner');
            if (banner) banner.style.display = 'none';
            highlightMesh.visible = false;

            if (isDragging && draggedTireGroup) {
                if (hoverTargetId && hoverTargetId !== draggedTireId) {
                    // INTERCAMBIO / ROTACIÓN AUTOMÁTICA
                    window._neuEjecutarRotacion(draggedTireId, hoverTargetId);
                    // Resetear posición física en 3D
                    draggedTireGroup.position.copy(draggedTireGroup.userData.defaultPos);
                } else {
                    // RETORNO SUAVE (LERP)
                    const targetPos = draggedTireGroup.userData.defaultPos;
                    let startTime = null;
                    const startPos = draggedTireGroup.position.clone();
                    
                    function animateLerp(time) {
                        if (!startTime) startTime = time;
                        const progress = Math.min((time - startTime) / 180, 1);
                        draggedTireGroup.position.lerpVectors(startPos, targetPos, progress);
                        if (progress < 1) requestAnimationFrame(animateLerp);
                    }
                    requestAnimationFrame(animateLerp);
                }
            } else if (draggedTireId) {
                // CLIC SIMPLE: Seleccionar posición
                window._neuSeleccionarPosicion(draggedTireId);
            }

            if (draggedTireGroup) {
                draggedTireGroup.scale.set(1.0, 1.0, 1.0);
            }

            isPointerDown = false;
            isDragging = false;
            draggedTireGroup = null;
            draggedTireId = null;
            hoverTargetId = null;
        };

        canvasEl.addEventListener('pointerup', endDragHandler);
        canvasEl.addEventListener('pointercancel', endDragHandler);

        // ── LOOP DE RENDERIZADO 60 FPS ──────────────────────────────────────────────
        function animate() {
            window._neuAnimationId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        // Guardar referencias globales de actualización
        window._neuRefrescar3D = function() {
            window._neuActualizar3DColores();
        };
    };

    // ── NAVEGACIÓN VISTAS 2D / ISOMÉTRICA / LATERAL / RAYOS X ───────────────────────
    window._neuSetViewMode = function(mode) {
        window._neuViewMode = mode;
        ['2d', 'iso', 'lat'].forEach(m => {
            const btn = document.getElementById(`btn-view-${m}`);
            if (btn) btn.className = (m === mode) ? 'btn btn-sm btn-primary py-1 px-3 rounded-pill fw-bold' : 'btn btn-sm btn-outline-secondary py-1 px-3 rounded-pill fw-bold';
        });
        if (window._neuUpdateCameraView) window._neuUpdateCameraView();
    };

    window._neuToggleXRay = function() {
        window._neuXRayActive = !window._neuXRayActive;
        const btn = document.getElementById('btn-xray');
        if (btn) {
            btn.className = window._neuXRayActive 
                ? 'btn btn-sm btn-warning text-dark py-1 px-3 rounded-pill fw-bold' 
                : 'btn btn-sm btn-outline-warning py-1 px-3 rounded-pill fw-bold';
        }
    };

    // ── LÓGICA DE NEGOCIO: EJECUTAR ROTACIÓN Y AUTO-REGISTRO ───────────────────────
    window._neuEjecutarRotacion = function(sourceId, targetId) {
        // Buscar o crear registros de ambas llantas
        let sourceItem = window._neuLlantasActuales.find(l => String(l.posicion) === String(sourceId));
        let targetItem = window._neuLlantasActuales.find(l => String(l.posicion) === String(targetId));

        if (!sourceItem) {
            const prev = (window._neuUltimaInspeccionMap || {})[String(sourceId).toUpperCase()] || {};
            sourceItem = {
                posicion: String(sourceId),
                id: String(sourceId),
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
                rotTarget: String(targetId),
                observaciones: `De Posición #${sourceId} a Posición #${targetId}`
            };
            window._neuLlantasActuales.push(sourceItem);
        } else {
            sourceItem.rot = 'SI';
            sourceItem.rotTarget = String(targetId);
            sourceItem.accion = 'Rotación';
            sourceItem.observaciones = `De Posición #${sourceId} a Posición #${targetId}`;
        }

        if (!targetItem) {
            const prevT = (window._neuUltimaInspeccionMap || {})[String(targetId).toUpperCase()] || {};
            targetItem = {
                posicion: String(targetId),
                id: String(targetId),
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
                rotTarget: String(sourceId),
                observaciones: `De Posición #${targetId} a Posición #${sourceId}`
            };
            window._neuLlantasActuales.push(targetItem);
        } else {
            targetItem.rot = 'SI';
            targetItem.rotTarget = String(sourceId);
            targetItem.accion = 'Rotación';
            targetItem.observaciones = `De Posición #${targetId} a Posición #${sourceId}`;
        }

        // Renderizar tabla y 3D
        window._neuRenderTablaLlantas();
        if (window._neuRefrescar3D) window._neuRefrescar3D();
        
        // Notificación Toast emergente
        showToast(`Rotación realizada: Posición #${sourceId} ⇄ Posición #${targetId}`);
        
        // Seleccionar automáticamente la llanta origen en el formulario
        window._neuSeleccionarPosicion(sourceId);
    };

    // ── MANEJO DEL FORMULARIO DE LLANTA Y MEDICIONES TÁCTILES ─────────────────────
    window._neuSeleccionarPosicion = function(pos) {
        window._neuPosicionActiva = String(pos);
        const b = document.getElementById('neu-form-pos-badge');
        if (b) b.innerText = pos;
        const labelTop = document.getElementById('neu-pos-label-top');
        if (labelTop) labelTop.innerText = pos;

        // Actualizar barra scroll táctil de botones
        document.querySelectorAll('#neu-pos-selector button').forEach(btn => {
            btn.className = 'btn btn-outline-secondary neu-touch-btn-pos position-relative';
        });
        const activeBtn = document.getElementById(`btn-pos-${pos}`);
        if (activeBtn) {
            activeBtn.className = 'btn btn-primary text-white shadow-sm neu-touch-btn-pos position-relative';
            activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }

        window._neuLimpiarFormLlanta();

        // Cargar datos si existe en lista o en última inspección
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
            if (document.getElementById('neu-sel-accion')) document.getElementById('neu-sel-accion').value = existente.accion || 'Inspeccion';
            if (document.getElementById('neu-sel-rot')) document.getElementById('neu-sel-rot').value = existente.rot || 'NO';
            if (document.getElementById('neu-input-obs-item')) document.getElementById('neu-input-obs-item').value = existente.observaciones || '';
            
            window._neuFotos = { foto1: existente.foto1 || null, foto2: existente.foto2 || null, foto3: existente.foto3 || null };
            [1, 2, 3].forEach(n => {
                const btn = document.getElementById(`btn-neu-foto${n}`);
                if (btn) {
                    if (window._neuFotos[`foto${n}`]) {
                        btn.className = 'btn btn-success w-100 py-2 rounded-3 text-truncate fw-bold text-white shadow-2xs d-flex flex-column align-items-center justify-content-center';
                        btn.innerHTML = `<i class="bi bi-check-circle-fill fs-5"></i><span>Foto ${n} cargada</span>`;
                    } else {
                        btn.className = 'btn btn-outline-secondary w-100 py-2 rounded-3 text-truncate fw-semibold d-flex flex-column align-items-center justify-content-center';
                        btn.innerHTML = `<i class="bi bi-camera fs-5"></i><span>Foto ${n}</span>`;
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
            if (document.getElementById('neu-sel-accion')) document.getElementById('neu-sel-accion').value = 'Inspeccion';
            if (document.getElementById('neu-sel-rot')) document.getElementById('neu-sel-rot').value = 'NO';
        }

        window._neuCalcularPromedio();
        if (window._neuRefrescar3D) window._neuRefrescar3D();
    };

    // Renderizar botonera 0..20mm para R1, R2, R3, R4
    window._neuRenderBotoneraR = function() {
        ['r1', 'r2', 'r3', 'r4'].forEach(tipo => {
            const container = document.getElementById(`neu-${tipo}-buttons`);
            if (!container) return;
            const current = window[`_neuVal${tipo.toUpperCase()}`] || 0;
            let html = '';
            
            const isZero = current === 0;
            html += `
                <button type="button" class="btn ${isZero ? 'btn-secondary text-white shadow-sm' : 'btn-outline-secondary'} neu-touch-btn-r" style="min-width:56px;" onclick="window._neuSetR('${tipo}', 0)" id="btn-val-${tipo}-0">
                    0 mm
                </button>
            `;

            for (let i = 1; i <= 16; i++) {
                const isActive = i === current;
                const activeClass = isActive ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary';
                html += `
                    <button type="button" class="btn ${activeClass} neu-touch-btn-r" onclick="window._neuSetR('${tipo}', ${i})" id="btn-val-${tipo}-${i}">
                        ${i}
                    </button>
                `;
            }
            container.innerHTML = html;
            const lbl = document.getElementById(`lbl-${tipo}`);
            if (lbl) {
                lbl.innerText = `${current} mm`;
                lbl.className = (current > 0) ? 'badge bg-primary px-3 py-1 fs-6 rounded-pill shadow-2xs' : 'badge bg-secondary px-3 py-1 fs-6 rounded-pill shadow-2xs';
            }
        });
        window._neuCalcularPromedio();
    };

    window._neuSetR = function(tipo, val) {
        const num = Math.max(0, Math.min(20, parseInt(val, 10) || 0));
        window[`_neuVal${tipo.toUpperCase()}`] = num;

        const lbl = document.getElementById(`lbl-${tipo}`);
        if (lbl) {
            lbl.innerText = `${num} mm`;
            lbl.className = (num > 0) ? 'badge bg-primary px-3 py-1 fs-6 rounded-pill shadow-2xs' : 'badge bg-secondary px-3 py-1 fs-6 rounded-pill shadow-2xs';
        }

        const btnZero = document.getElementById(`btn-val-${tipo}-0`);
        if (btnZero) btnZero.className = (num === 0) ? 'btn btn-secondary text-white shadow-sm neu-touch-btn-r' : 'btn btn-outline-secondary neu-touch-btn-r';

        for (let i = 1; i <= 16; i++) {
            const btn = document.getElementById(`btn-val-${tipo}-${i}`);
            if (btn) btn.className = (i === num) ? 'btn btn-primary text-white shadow-sm neu-touch-btn-r' : 'btn btn-outline-secondary neu-touch-btn-r';
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
            lbl.innerHTML = `<span class="text-muted">Promedio: -- mm (Sin medir)</span>`;
            return;
        }

        const promVal = (r4 > 0) ? ((r1 + r2 + r3 + r4) / 4.0) : ((r1 + r2 + r3) / 3.0);
        const prom = promVal.toFixed(1);
        let color = promVal > 6.0 ? '#16a34a' : (promVal > 4.0 ? '#d97706' : '#dc2626');
        let statusBadge = promVal <= 4.0 ? '<span class="badge bg-danger ms-1">CRÍTICA (≤4mm)</span>' : (promVal <= 6.0 ? '<span class="badge bg-warning text-dark ms-1">ALERTA</span>' : '<span class="badge bg-success ms-1">ÓPTIMA</span>');
        lbl.innerHTML = `Promedio: <b style="color:${color}">${prom} mm</b> ${statusBadge}`;
    };

    window._neuProcesarFoto = function(num, input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            window._neuFotos[`foto${num}`] = e.target.result;
            const btn = document.getElementById(`btn-neu-foto${num}`);
            if (btn) {
                btn.className = 'btn btn-success w-100 py-2 rounded-3 text-truncate fw-bold text-white shadow-2xs d-flex flex-column align-items-center justify-content-center';
                btn.innerHTML = `<i class="bi bi-check-circle-fill fs-5"></i><span>Foto ${num} lista</span>`;
            }
        };
        reader.readAsDataURL(file);
    };

    window._neuLimpiarFotos = function() {
        window._neuFotos = { foto1: null, foto2: null, foto3: null };
        [1, 2, 3].forEach(n => {
            const btn = document.getElementById(`btn-neu-foto${n}`);
            if (btn) {
                btn.className = 'btn btn-outline-secondary w-100 py-2 rounded-3 text-truncate fw-semibold d-flex flex-column align-items-center justify-content-center';
                btn.innerHTML = `<i class="bi bi-camera fs-5"></i><span>Foto ${n}</span>`;
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
        if (document.getElementById('neu-sel-accion')) document.getElementById('neu-sel-accion').value = 'Inspeccion';
        if (document.getElementById('neu-sel-rot')) document.getElementById('neu-sel-rot').value = 'NO';
        if (document.getElementById('neu-input-obs-item')) document.getElementById('neu-input-obs-item').value = '';

        window._neuLimpiarFotos();
    };

    // ── AGREGAR LLANTA A INSPECTION QUEUE Y SECTOR SEQUENTIAL FOCUS ───────────────
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
        const accion = document.getElementById('neu-sel-accion')?.value || 'Inspeccion';
        const rot = document.getElementById('neu-sel-rot')?.value || 'NO';
        const observaciones = document.getElementById('neu-input-obs-item')?.value || 'Ninguna';

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
            accion,
            action: accion,
            rot,
            observaciones,
            obs: observaciones,
            foto1: window._neuFotos.foto1 || null,
            foto2: window._neuFotos.foto2 || null,
            foto3: window._neuFotos.foto3 || null,
            photos: [!!window._neuFotos.foto1, !!window._neuFotos.foto2, !!window._neuFotos.foto3]
        };

        const idx = window._neuLlantasActuales.findIndex(l => String(l.posicion) === String(pos));
        if (idx !== -1) {
            window._neuLlantasActuales[idx] = item;
        } else {
            window._neuLlantasActuales.push(item);
        }

        window._neuRenderTablaLlantas();
        if (window._neuRefrescar3D) window._neuRefrescar3D();

        // Avanzar a la siguiente posición
        const cfg = VEHICLE_CONFIGS_3D[window._neuConfigActualKey] || VEHICLE_CONFIGS_3D["6X4"];
        const ordenPos = cfg.positions;
        const curIdx = ordenPos.indexOf(String(pos));
        if (curIdx !== -1 && curIdx < ordenPos.length - 1) {
            const nextPos = ordenPos[curIdx + 1];
            window._neuSeleccionarPosicion(nextPos);
        } else {
            showToast(`✅ Inspección registrada para Llanta #${pos}. ¡Unidad completa!`);
        }
    };

    // ── RENDER TABLA CON ORDENAMIENTO NUMÉRICO ESTRICTO ─────────────────────────────
    window._neuRenderTablaLlantas = function() {
        const tbody = document.getElementById('neu-tabla-tbody');
        const countBadge = document.getElementById('neu-tabla-count');
        if (countBadge) countBadge.innerText = window._neuLlantasActuales.length;
        if (!tbody) return;

        if (window._neuLlantasActuales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" class="text-center text-muted py-4">Aún no has agregado ninguna llanta a la inspección.</td></tr>';
            return;
        }

        // ORDENAMIENTO NUMÉRICO ESTRICTO POR POSICIÓN (#1, #2, #3...)
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
            const badgeClass = prom <= 4.0 ? 'bg-danger' : (prom <= 6.0 ? 'bg-warning text-dark' : 'bg-success');
            const fotosCount = (l.foto1 ? 1 : 0) + (l.foto2 ? 1 : 0) + (l.foto3 ? 1 : 0);
            const fotosBadge = fotosCount > 0 
                ? `<span class="badge bg-primary rounded-pill px-2 py-1"><i class="bi bi-camera-fill me-1"></i>${fotosCount}</span>` 
                : `<span class="text-muted small">-</span>`;

            const isRot = l.rot === 'SI';
            const rotBadge = isRot 
                ? `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary px-2 py-1">SÍ 🔄</span>`
                : `<span class="badge bg-light text-muted border">NO</span>`;

            return `
                <tr>
                    <td class="ps-3"><span class="badge bg-primary rounded-pill px-2.5 py-1 fs-6">${l.posicion}</span></td>
                    <td class="fw-bold text-dark">${l.marca || '---'}</td>
                    <td class="small">${l.medida || '---'}</td>
                    <td><span class="badge bg-light text-dark border">${l.modelo || '---'}</span></td>
                    <td class="text-center fw-bold">${l.r1}</td>
                    <td class="text-center fw-bold">${l.r2}</td>
                    <td class="text-center fw-bold">${l.r3}</td>
                    <td class="text-center text-muted small">${l.r4 || 0}</td>
                    <td class="text-center"><span class="badge ${badgeClass} px-2 py-1">${prom} mm</span></td>
                    <td class="text-center small">${l.presion_ant} ➔ <b>${l.presion_actual} PSI</b></td>
                    <td><span class="badge bg-secondary bg-opacity-10 text-secondary">${l.estado}</span></td>
                    <td><span class="badge bg-info bg-opacity-10 text-info">${l.accion}</span></td>
                    <td>${rotBadge}</td>
                    <td class="text-center">${fotosBadge}</td>
                    <td class="text-truncate text-muted small" style="max-width:150px;" title="${l.observaciones || ''}">${l.observaciones || 'Ninguna'}</td>
                    <td class="text-center pe-3">
                        <button class="btn btn-outline-danger btn-sm py-0 px-2 rounded-pill" onclick="window._neuEliminarLlanta(${index})"><i class="bi bi-trash"></i></button>
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
                if (tipo === 'acciones') document.getElementById('neu-sel-accion').value = valor.toUpperCase();
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
                btn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill me-1 fs-5"></i> Guardar Inspección Completa';
            }
        }
    };

})();
