/**
 * modal_inspeccion.js — Módulo Interactivo de Inspección de Neumáticos (Bottom Sheet / Sub-Drawer)
 * ERP Azkell Fleet
 */

(function() {
    window._neuCatalogos = window._neuCatalogos || null;
    window._neuLlantasActuales = [];
    window._neuValR1 = 10;
    window._neuValR2 = 10;
    window._neuValR3 = 10;
    window._neuValR4 = 0;
    window._neuPosicionActiva = '1';
    window._neuFotos = { foto1: null, foto2: null, foto3: null };

    // Inyectar estilos CSS para el Bottom Sheet si no existen
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
                max-width: 740px !important;
                height: 92vh !important;
                max-height: 92vh !important;
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
                    left: 0 !important;
                    transform: translate3d(0, 100%, 0) !important;
                    border-radius: 24px 24px 0 0 !important;
                    height: 94vh !important;
                    max-height: 94vh !important;
                }
                .neu-sub-drawer.open {
                    transform: translate3d(0, 0, 0) !important;
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
                min-width: 46px;
                height: 46px;
                font-size: 1.05rem;
                font-weight: 800;
                border-radius: 12px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                user-select: none;
                transition: transform 0.1s ease, background-color 0.15s ease;
            }
            .neu-touch-btn-pos:active {
                transform: scale(0.92);
            }
            .neu-touch-btn-r {
                min-width: 40px;
                height: 40px;
                font-size: 0.95rem;
                font-weight: 700;
                border-radius: 10px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                user-select: none;
                transition: transform 0.1s ease, background-color 0.15s ease;
            }
            .neu-touch-btn-r:active {
                transform: scale(0.92);
            }
            .neu-scroll-x {
                display: flex;
                overflow-x: auto;
                scroll-behavior: smooth;
                -webkit-overflow-scrolling: touch;
                padding-bottom: 4px;
                gap: 6px;
            }
            .neu-scroll-x::-webkit-scrollbar {
                height: 4px;
            }
            .neu-scroll-x::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    // Cargar catálogos desde el backend
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
            marcas: ['GOODYEAR', 'MICHELIN', 'GITI', 'BRIDGESTONE', 'KUNLUN', 'CONTINENTAL', 'TRIANGLE', 'WESTLAKE', 'YOKOHAMA'],
            modelos: ['GAU867', 'KT512', 'Y999', 'KMAX', '366', 'TR685', 'F820', 'RS618A'],
            medidas: ['295/80R22.5', '275/70R22.5', '245/70R19.5', '11R22.5', '315/80R22.5'],
            acciones: ['Inspeccion', 'Reparacion', 'Cambio', 'Instalacion', 'Rotacion'],
            estados: ['NUEVA', 'RENCAUCHADA']
        };
    };

    // Abrir Drawer de Inspección
    window.rotAbrirInspeccionNeumaticos = async function(placa, idOT, kmVehiculo) {
        window._neuLlantasActuales = [];
        const hoy = new Date().toISOString().split('T')[0];
        const km = kmVehiculo || 0;

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
                                onclick="window.rotCerrarModalInspeccionNeumaticos()" 
                                title="Volver" 
                                style="width: 40px; height: 40px; color: var(--subtext);">
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
                    <button class="btn btn-light border-0 rounded-circle p-2" onclick="window.rotCerrarModalInspeccionNeumaticos()" style="color:var(--subtext);">
                        <i class="bi bi-x-lg fs-5"></i>
                    </button>
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

                    <!-- BENTO 2: Esquema Interactivo de Chasis -->
                    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid var(--border, #e2e8f0) !important;">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <h6 class="fw-bold m-0 small text-dark d-flex align-items-center gap-2">
                                <i class="bi bi-truck text-primary fs-6"></i> Esquema Visual de Ejes y Llantas
                            </h6>
                            <span class="badge bg-secondary bg-opacity-10 text-secondary px-2 py-1 rounded-pill" style="font-size:0.72rem;">Toca una llanta para seleccionarla</span>
                        </div>
                        
                        <div class="p-2 text-center rounded-3 bg-light d-flex flex-column align-items-center justify-content-center" style="min-height: 220px;" id="neu-chassis-container"></div>

                        <!-- Leyenda Semáforo -->
                        <div class="d-flex justify-content-center gap-3 mt-3 flex-wrap" style="font-size: 0.78rem;">
                            <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:12px;height:12px;background:#22c55e;"></span> <b>Óptima (>6mm)</b></div>
                            <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:12px;height:12px;background:#eab308;"></span> <b>Alerta (4-6mm)</b></div>
                            <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:12px;height:12px;background:#ef4444;"></span> <b>Crítica (≤4mm)</b></div>
                        </div>
                    </div>

                    <!-- BENTO 3: Formulario Táctil de Llanta Seleccionada -->
                    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid var(--border, #e2e8f0) !important;">
                        <div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-primary rounded-circle d-flex align-items-center justify-content-center fs-6 shadow-sm" style="width:34px;height:34px;" id="neu-form-pos-badge">1</span>
                                <h6 class="fw-bold m-0 text-dark">Datos de Llanta Seleccionada</h6>
                            </div>
                            <button class="btn btn-sm btn-light border py-1 px-3 rounded-pill fw-bold text-muted" style="font-size:0.75rem;" onclick="window._neuLimpiarFormLlanta()">
                                <i class="bi bi-arrow-counterclockwise me-1"></i> Limpiar
                            </button>
                        </div>

                        <!-- Selector Táctil de Posición -->
                        <div class="mb-3">
                            <label class="form-label text-muted fw-bold small mb-2 d-block" style="font-size:0.78rem;">Seleccionar Posición:</label>
                            <div class="neu-scroll-x" id="neu-pos-selector"></div>
                        </div>

                        <!-- Marca, Medida, Modelo -->
                        <div class="row g-2 mb-3">
                            <div class="col-12 col-sm-4">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.75rem;">Marca</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('marcas')" class="text-primary small fw-bold" style="font-size:0.75rem;">+ Nueva</a>
                                </div>
                                <select class="form-select rounded-3 fw-semibold" style="height: 46px;" id="neu-sel-marca"></select>
                            </div>
                            <div class="col-12 col-sm-4">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.75rem;">Medida</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('medidas')" class="text-primary small fw-bold" style="font-size:0.75rem;">+ Nueva</a>
                                </div>
                                <select class="form-select rounded-3 fw-semibold" style="height: 46px;" id="neu-sel-medida"></select>
                            </div>
                            <div class="col-12 col-sm-4">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.75rem;">Modelo</label>
                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('modelos')" class="text-primary small fw-bold" style="font-size:0.75rem;">+ Nuevo</a>
                                </div>
                                <select class="form-select rounded-3 fw-semibold" style="height: 46px;" id="neu-sel-modelo"></select>
                            </div>
                        </div>

                        <!-- Profundímetro Táctil (R1, R2, R3, R4) -->
                        <div class="mb-3 p-3 rounded-4 bg-light border" style="border-color: var(--border, #e2e8f0) !important;">
                            <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom flex-wrap gap-2">
                                <div>
                                    <h6 class="m-0 fw-bold text-dark d-flex align-items-center gap-1" style="font-size: 0.95rem;">
                                        <i class="bi bi-rulers text-primary"></i> Profundímetro Táctil (mm)
                                    </h6>
                                    <small class="text-muted" style="font-size:0.75rem;">Toca directamente el número medido para cada ranura</small>
                                </div>
                                <span class="badge bg-white text-primary border shadow-sm px-3 py-2 fs-6 rounded-pill" id="neu-r-prom-badge">Promedio: 10.0 mm</span>
                            </div>

                            <!-- R1 (Exterior) -->
                            <div class="mb-3 p-2 bg-white rounded-3 border" style="border-color: var(--border, #e2e8f0) !important;">
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <span class="fw-bold text-dark" style="font-size:0.85rem;">
                                        <i class="bi bi-arrow-left-circle-fill text-primary me-1"></i> R1 — Hombro Exterior:
                                    </span>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold rounded-circle" style="width:34px;height:34px;" onclick="window._neuAjustarR('r1', -1)"><i class="bi bi-dash fs-5"></i></button>
                                        <span class="badge bg-primary px-3 py-1 fs-6 rounded-pill shadow-2xs" id="lbl-r1">10 mm</span>
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
                                        <span class="badge bg-primary px-3 py-1 fs-6 rounded-pill shadow-2xs" id="lbl-r2">10 mm</span>
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
                                        <span class="badge bg-primary px-3 py-1 fs-6 rounded-pill shadow-2xs" id="lbl-r3">10 mm</span>
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
                                <input type="number" class="form-control rounded-3 fw-bold text-center fs-6" style="height: 46px;" id="neu-input-pres-ant" value="100">
                            </div>
                            <div class="col-6 col-sm-3">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.75rem;">Presión Actual (PSI)</label>
                                <input type="number" class="form-control rounded-3 fw-bold text-center fs-6 text-primary" style="height: 46px;" id="neu-input-pres-act" value="110">
                            </div>
                            <div class="col-6 col-sm-2">
                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.75rem;">Estado</label>
                                <select class="form-select rounded-3 fw-semibold" style="height: 46px;" id="neu-sel-estado">
                                    <option value="NUEVA">NUEVA</option>
                                    <option value="RENCAUCHADA">RENCAUCHADA</option>
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
                                    <option value="POS-1">➔ Pos 1</option>
                                    <option value="POS-2">➔ Pos 2</option>
                                    <option value="POS-3">➔ Pos 3</option>
                                    <option value="POS-4">➔ Pos 4</option>
                                    <option value="POS-5">➔ Pos 5</option>
                                    <option value="POS-6">➔ Pos 6</option>
                                    <option value="POS-7">➔ Pos 7</option>
                                    <option value="POS-8">➔ Pos 8</option>
                                    <option value="POS-9">➔ Pos 9</option>
                                    <option value="POS-10">➔ Pos 10</option>
                                    <option value="POS-11">➔ Pos 11</option>
                                    <option value="POS-12">➔ Pos 12</option>
                                    <option value="POS-R">➔ Pos R</option>
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
                            <input type="text" class="form-control rounded-3" style="height: 46px; font-size: 0.95rem;" id="neu-input-obs-item" value="Ninguna" placeholder="Ej: Desgaste irregular lado derecho, alinear...">
                        </div>

                        <!-- Botón Agregar Llanta a la Lista -->
                        <button class="btn btn-primary btn-lg rounded-pill py-3 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2 w-100 fs-6" onclick="window._neuGuardarLlantaEnLista()">
                            <i class="bi bi-plus-circle-fill fs-5"></i> Guardar Llanta en Inspección
                        </button>
                    </div>

                    <!-- BENTO 4: Llantas Inspeccionadas -->
                    <div class="card border-0 rounded-4 overflow-hidden bg-white shadow-2xs mb-4" style="border: 1px solid var(--border, #e2e8f0) !important;">
                        <div class="card-header bg-light px-3 py-3 d-flex align-items-center justify-content-between border-bottom">
                            <div class="d-flex align-items-center gap-2">
                                <h6 class="m-0 fw-bold text-dark">Llantas Agregadas a la Inspección</h6>
                                <span class="badge bg-primary rounded-pill px-3 fs-6" id="neu-tabla-count">0</span>
                            </div>
                            <small class="text-muted">Se guardarán en la nube</small>
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
            `;
            document.body.appendChild(drawerEl);
        }

        // Setear datos de la placa y encabezados
        document.getElementById('neu-badge-placa').innerText = (placa || 'SIN-PLACA').toUpperCase();
        document.getElementById('neu-input-fecha').value = hoy;
        document.getElementById('neu-input-km').value = km || 0;
        document.getElementById('neu-input-dias').value = 30;
        document.getElementById('neu-input-obs-gen').value = '';

        // Cargar Catálogos
        const cats = await window._cargarCatalogosNeumaticos();
        window._neuRellenarSelects(cats);

        // Renderizar botones de posiciones 1..12 y R
        window._neuRenderPosiciones(['1','2','3','4','5','6','7','8','9','10','11','12','R']);

        // Renderizar Chasis Esquema
        window._neuRenderChassis(placa);

        // Renderizar Botoneras táctiles 1..20 de remanentes
        window._neuRenderBotoneraR();

        // Renderizar tabla vacía
        window._neuRenderTablaLlantas();

        // Abrir Drawer y Backdrop
        if (drawerEl.parentElement !== document.body) {
            document.body.appendChild(drawerEl);
        }
        drawerEl.classList.add('open');
        backdrop.classList.add('show');
    };

    window.rotCerrarModalInspeccionNeumaticos = function() {
        const drawerEl = document.getElementById('rot-drawer-neumaticos');
        const backdrop = document.getElementById('neuDrawerBackdrop');
        if (drawerEl) drawerEl.classList.remove('open');
        if (backdrop) backdrop.classList.remove('show');
    };

    // Rellenar selectores de marca, medida, modelo y acción
    window._neuRellenarSelects = function(cats) {
        const selMarca  = document.getElementById('neu-sel-marca');
        const selMedida = document.getElementById('neu-sel-medida');
        const selModelo = document.getElementById('neu-sel-modelo');
        const selAccion = document.getElementById('neu-sel-accion');

        if (selMarca) {
            selMarca.innerHTML = cats.marcas.map(m => `<option value="${m}">${m}</option>`).join('');
            if (cats.marcas.includes('GITI')) selMarca.value = 'GITI';
            else if (cats.marcas.includes('GOODYEAR')) selMarca.value = 'GOODYEAR';
        }
        if (selMedida) {
            selMedida.innerHTML = cats.medidas.map(m => `<option value="${m}">${m}</option>`).join('');
            if (cats.medidas.includes('295/80R22.5')) selMedida.value = '295/80R22.5';
            else if (cats.medidas.includes('275/70R22.5')) selMedida.value = '275/70R22.5';
        }
        if (selModelo) {
            selModelo.innerHTML = cats.modelos.map(m => `<option value="${m}">${m}</option>`).join('');
            if (cats.modelos.includes('GAU867')) selModelo.value = 'GAU867';
        }
        if (selAccion) {
            selAccion.innerHTML = cats.acciones.map(a => `<option value="${a}">${a}</option>`).join('');
            selAccion.value = 'Inspeccion';
        }
    };

    // Renderizar botones de posición táctiles grandes
    window._neuRenderPosiciones = function(posArray) {
        const wrap = document.getElementById('neu-pos-selector');
        if (!wrap) return;
        wrap.innerHTML = posArray.map(p => `
            <button type="button" class="btn ${p === window._neuPosicionActiva ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary'} neu-touch-btn-pos" onclick="window._neuSeleccionarPosicion('${p}')" id="btn-pos-${p}">
                ${p}
            </button>
        `).join('');
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

    window._neuSeleccionarPosicion = function(pos) {
        window._neuPosicionActiva = pos;
        const b = document.getElementById('neu-form-pos-badge');
        if (b) b.innerText = pos;

        document.querySelectorAll('#neu-pos-selector button').forEach(btn => {
            btn.className = 'btn btn-outline-secondary neu-touch-btn-pos';
        });
        const activeBtn = document.getElementById(`btn-pos-${pos}`);
        if (activeBtn) activeBtn.className = 'btn btn-primary text-white shadow-sm neu-touch-btn-pos';

        // Si la llanta ya está en la lista actual, cargar sus valores para edición rápida
        const existente = window._neuLlantasActuales.find(l => String(l.posicion) === String(pos));
        if (existente) {
            if (document.getElementById('neu-sel-marca')) document.getElementById('neu-sel-marca').value = existente.marca;
            if (document.getElementById('neu-sel-medida')) document.getElementById('neu-sel-medida').value = existente.medida;
            if (document.getElementById('neu-sel-modelo')) document.getElementById('neu-sel-modelo').value = existente.modelo;
            window._neuSetR('r1', existente.r1 || 10);
            window._neuSetR('r2', existente.r2 || 10);
            window._neuSetR('r3', existente.r3 || 10);
            window._neuSetR('r4', existente.r4 || 0);
            if (document.getElementById('neu-input-pres-ant')) document.getElementById('neu-input-pres-ant').value = existente.presion_ant || 0;
            if (document.getElementById('neu-input-pres-act')) document.getElementById('neu-input-pres-act').value = existente.presion_actual || 0;
            if (document.getElementById('neu-sel-estado')) document.getElementById('neu-sel-estado').value = existente.estado || 'NUEVA';
            if (document.getElementById('neu-sel-accion')) document.getElementById('neu-sel-accion').value = existente.accion || 'Inspeccion';
            if (document.getElementById('neu-sel-rot')) document.getElementById('neu-sel-rot').value = existente.rot || 'NO';
            if (document.getElementById('neu-input-obs-item')) document.getElementById('neu-input-obs-item').value = existente.observaciones || 'Ninguna';
            
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
        } else {
            window._neuSetR('r1', 10);
            window._neuSetR('r2', 10);
            window._neuSetR('r3', 10);
            window._neuSetR('r4', 0);
            window._neuLimpiarFotos();
        }
        window._neuCalcularPromedio();
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

    // Renderizar botonera 1 a 20 mm con botones táctiles grandes
    window._neuRenderBotoneraR = function() {
        ['r1', 'r2', 'r3', 'r4'].forEach(tipo => {
            const container = document.getElementById(`neu-${tipo}-buttons`);
            if (!container) return;
            const current = window[`_neuVal${tipo.toUpperCase()}`] || (tipo === 'r4' ? 0 : 10);
            let html = '';
            
            if (tipo === 'r4') {
                const isZero = current === 0;
                html += `
                    <button type="button" class="btn ${isZero ? 'btn-secondary text-white shadow-sm' : 'btn-outline-secondary'} neu-touch-btn-r" style="min-width:70px;" onclick="window._neuSetR('${tipo}', 0)" id="btn-val-${tipo}-0">
                        0 (N/A)
                    </button>
                `;
            }

            for (let i = 1; i <= 20; i++) {
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
            if (lbl) lbl.innerText = `${current} mm`;
        });
        window._neuCalcularPromedio();
    };

    window._neuSetR = function(tipo, val) {
        const minVal = (tipo === 'r4') ? 0 : 1;
        const num = Math.max(minVal, Math.min(20, parseInt(val, 10) || minVal));
        window[`_neuVal${tipo.toUpperCase()}`] = num;

        const lbl = document.getElementById(`lbl-${tipo}`);
        if (lbl) lbl.innerText = `${num} mm`;

        // Actualizar estados visuales de los botones
        if (tipo === 'r4') {
            const btnZero = document.getElementById(`btn-val-r4-0`);
            if (btnZero) btnZero.className = (num === 0) ? 'btn btn-secondary text-white shadow-sm neu-touch-btn-r' : 'btn btn-outline-secondary neu-touch-btn-r';
        }

        for (let i = 1; i <= 20; i++) {
            const btn = document.getElementById(`btn-val-${tipo}-${i}`);
            if (btn) {
                btn.className = (i === num) 
                    ? 'btn btn-primary text-white shadow-sm neu-touch-btn-r' 
                    : 'btn btn-outline-secondary neu-touch-btn-r';
            }
        }

        window._neuCalcularPromedio();
    };

    window._neuAjustarR = function(tipo, delta) {
        const current = window[`_neuVal${tipo.toUpperCase()}`] || (tipo === 'r4' ? 0 : 10);
        window._neuSetR(tipo, current + delta);
    };

    window._neuCalcularPromedio = function() {
        const r1 = window._neuValR1 || 10;
        const r2 = window._neuValR2 || 10;
        const r3 = window._neuValR3 || 10;
        const r4 = window._neuValR4 || 0;
        const prom = (r4 > 0) ? ((r1 + r2 + r3 + r4) / 4.0).toFixed(1) : ((r1 + r2 + r3) / 3.0).toFixed(1);
        const lbl = document.getElementById('neu-r-prom-badge');
        if (lbl) {
            let color = prom > 6 ? '#16a34a' : (prom > 4 ? '#d97706' : '#dc2626');
            lbl.innerHTML = `Promedio: <b style="color:${color}">${prom} mm</b> ${prom <= 4 ? '<span class="badge bg-danger ms-1">⚠️ Cambio</span>' : ''}`;
        }
    };

    // Renderizar Chasis SVG Interactivo
    window._neuRenderChassis = function(placa) {
        const container = document.getElementById('neu-chassis-container');
        if (!container) return;

        container.innerHTML = `
            <svg viewBox="0 0 220 320" style="width: 100%; max-width: 200px; height: 260px; display: block; margin: 0 auto; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.08));">
                <!-- Chasis Central -->
                <rect x="95" y="20" width="30" height="270" rx="6" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>
                <!-- Cabina / Frente -->
                <path d="M 80 20 L 140 20 L 135 70 L 85 70 Z" fill="#94a3b8" opacity="0.4" rx="4"/>
                <text x="110" y="45" font-size="9" font-weight="bold" fill="#475569" text-anchor="middle">FRENTE</text>

                <!-- Eje 1 (Direccional) -->
                <line x1="45" y1="60" x2="175" y2="60" stroke="#64748b" stroke-width="4"/>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('1')">
                    <rect id="svg-tire-1" x="25" y="40" width="24" height="42" rx="6" fill="#22c55e" stroke="#15803d" stroke-width="2"/>
                    <text x="37" y="66" font-size="11" font-weight="900" fill="#ffffff" text-anchor="middle">1</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('2')">
                    <rect id="svg-tire-2" x="171" y="40" width="24" height="42" rx="6" fill="#22c55e" stroke="#15803d" stroke-width="2"/>
                    <text x="183" y="66" font-size="11" font-weight="900" fill="#ffffff" text-anchor="middle">2</text>
                </g>

                <!-- Eje 2 (Tracción 1 Dual) -->
                <line x1="30" y1="170" x2="190" y2="170" stroke="#64748b" stroke-width="4"/>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('3')">
                    <rect id="svg-tire-3" x="8" y="150" width="20" height="42" rx="5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="18" y="176" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">3</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('4')">
                    <rect id="svg-tire-4" x="32" y="150" width="20" height="42" rx="5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="42" y="176" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">4</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('5')">
                    <rect id="svg-tire-5" x="168" y="150" width="20" height="42" rx="5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="178" y="176" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">5</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('6')">
                    <rect id="svg-tire-6" x="192" y="150" width="20" height="42" rx="5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="202" y="176" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">6</text>
                </g>

                <!-- Eje 3 (Tracción 2 Dual) -->
                <line x1="30" y1="230" x2="190" y2="230" stroke="#64748b" stroke-width="4"/>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('7')">
                    <rect id="svg-tire-7" x="8" y="210" width="20" height="42" rx="5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="18" y="236" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">7</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('8')">
                    <rect id="svg-tire-8" x="32" y="210" width="20" height="42" rx="5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="42" y="236" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">8</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('9')">
                    <rect id="svg-tire-9" x="168" y="210" width="20" height="42" rx="5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="178" y="236" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">9</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('10')">
                    <rect id="svg-tire-10" x="192" y="210" width="20" height="42" rx="5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="202" y="236" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">10</text>
                </g>

                <!-- Repuesto (R) -->
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('R')">
                    <rect id="svg-tire-R" x="95" y="110" width="30" height="20" rx="5" fill="#64748b" stroke="#334155" stroke-width="1.5"/>
                    <text x="110" y="124" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">R</text>
                </g>
            </svg>
        `;
        window._neuActualizarColoresChassis();
    };

    window._neuActualizarColoresChassis = function() {
        window._neuLlantasActuales.forEach(l => {
            const svgTire = document.getElementById(`svg-tire-${l.posicion}`);
            if (svgTire) {
                const prom = parseFloat(l.remanente_promedio || 0);
                if (prom <= 4.0) {
                    svgTire.setAttribute('fill', '#ef4444');
                    svgTire.setAttribute('stroke', '#b91c1c');
                } else if (prom <= 6.0) {
                    svgTire.setAttribute('fill', '#eab308');
                    svgTire.setAttribute('stroke', '#a16207');
                } else {
                    svgTire.setAttribute('fill', '#22c55e');
                    svgTire.setAttribute('stroke', '#15803d');
                }
            }
        });
    };

    // Guardar Llanta en Lista local
    window._neuGuardarLlantaEnLista = function() {
        const pos = window._neuPosicionActiva || '1';
        const marca = document.getElementById('neu-sel-marca')?.value || '';
        const medida = document.getElementById('neu-sel-medida')?.value || '';
        const modelo = document.getElementById('neu-sel-modelo')?.value || '';
        const r1 = window._neuValR1 || 10;
        const r2 = window._neuValR2 || 10;
        const r3 = window._neuValR3 || 10;
        const r4 = window._neuValR4 || 0;
        const rProm = (r4 > 0) ? ((r1 + r2 + r3 + r4) / 4.0) : ((r1 + r2 + r3) / 3.0);
        const presion_ant = parseInt(document.getElementById('neu-input-pres-ant')?.value || 0, 10);
        const presion_actual = parseInt(document.getElementById('neu-input-pres-act')?.value || 0, 10);
        const estado = document.getElementById('neu-sel-estado')?.value || 'NUEVA';
        const accion = document.getElementById('neu-sel-accion')?.value || 'Inspeccion';
        const rot = document.getElementById('neu-sel-rot')?.value || 'NO';
        const observaciones = document.getElementById('neu-input-obs-item')?.value || 'Ninguna';

        const item = {
            posicion: pos,
            marca,
            medida,
            modelo,
            r1,
            r2,
            r3,
            r4,
            remanente_promedio: parseFloat(rProm.toFixed(1)),
            presion_ant,
            presion_actual,
            estado,
            accion,
            rot,
            observaciones,
            foto1: window._neuFotos.foto1 || null,
            foto2: window._neuFotos.foto2 || null,
            foto3: window._neuFotos.foto3 || null
        };

        // Reemplazar si ya existe la posición o agregar
        const idx = window._neuLlantasActuales.findIndex(l => String(l.posicion) === String(pos));
        if (idx !== -1) {
            window._neuLlantasActuales[idx] = item;
        } else {
            window._neuLlantasActuales.push(item);
        }

        window._neuRenderTablaLlantas();
        window._neuActualizarColoresChassis();

        // Pasar a la siguiente posición automáticamente si es número
        const num = parseInt(pos, 10);
        if (!isNaN(num) && num < 12) {
            window._neuSeleccionarPosicion(String(num + 1));
        } else if (num === 12) {
            window._neuSeleccionarPosicion('R');
        }
    };

    // Renderizar Tabla
    window._neuRenderTablaLlantas = function() {
        const tbody = document.getElementById('neu-tabla-tbody');
        const countBadge = document.getElementById('neu-tabla-count');
        if (countBadge) countBadge.innerText = window._neuLlantasActuales.length;
        if (!tbody) return;

        if (window._neuLlantasActuales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" class="text-center text-muted py-4">Aún no has agregado ninguna llanta a la inspección.</td></tr>';
            return;
        }

        tbody.innerHTML = window._neuLlantasActuales.map((l, index) => {
            const prom = l.remanente_promedio;
            const badgeClass = prom <= 4 ? 'bg-danger' : (prom <= 6 ? 'bg-warning text-dark' : 'bg-success');
            const fotosCount = (l.foto1 ? 1 : 0) + (l.foto2 ? 1 : 0) + (l.foto3 ? 1 : 0);
            const fotosBadge = fotosCount > 0 
                ? `<span class="badge bg-primary rounded-pill px-2 py-1"><i class="bi bi-camera-fill me-1"></i>${fotosCount}</span>` 
                : `<span class="text-muted small">-</span>`;

            return `
                <tr>
                    <td class="ps-3"><span class="badge bg-primary rounded-pill px-2 fs-6">${l.posicion}</span></td>
                    <td class="fw-bold">${l.marca}</td>
                    <td>${l.medida}</td>
                    <td><span class="badge bg-light text-dark border">${l.modelo}</span></td>
                    <td class="text-center fw-bold">${l.r1}</td>
                    <td class="text-center fw-bold">${l.r2}</td>
                    <td class="text-center fw-bold">${l.r3}</td>
                    <td class="text-center text-muted small">${l.r4 || 0}</td>
                    <td class="text-center"><span class="badge ${badgeClass} px-2 py-1">${prom} mm</span></td>
                    <td class="text-center small">${l.presion_ant} ➔ <b>${l.presion_actual} PSI</b></td>
                    <td><span class="badge bg-secondary bg-opacity-10 text-secondary">${l.estado}</span></td>
                    <td><span class="badge bg-info bg-opacity-10 text-info">${l.accion}</span></td>
                    <td><span class="badge ${l.rot !== 'NO' ? 'bg-warning text-dark' : 'bg-light text-muted border'}">${l.rot || 'NO'}</span></td>
                    <td class="text-center">${fotosBadge}</td>
                    <td class="text-truncate text-muted small" style="max-width:140px;">${l.observaciones || 'Ninguna'}</td>
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
        window._neuActualizarColoresChassis();
    };

    window._neuLimpiarFormLlanta = function() {
        document.getElementById('neu-input-obs-item').value = 'Ninguna';
        window._neuSetR('r1', 10);
        window._neuSetR('r2', 10);
        window._neuSetR('r3', 10);
        window._neuSetR('r4', 0);
        if (document.getElementById('neu-sel-rot')) document.getElementById('neu-sel-rot').value = 'NO';
        window._neuLimpiarFotos();
        window._neuCalcularPromedio();
    };

    // Agregar nuevo catálogo en caliente
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
                window._neuCatalogos = null; // forzar recarga
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

    // Guardar Toda la Inspección
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

        try {
            const res = await fetch('/api/neumaticos/inspecciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_ot: idOT || null,
                    placa,
                    fecha_inspeccion,
                    dias_propuestos,
                    km_vehiculo,
                    observaciones,
                    inspector,
                    items: window._neuLlantasActuales
                })
            });
            const data = await res.json();
            if (data.ok) {
                alert('✅ Inspección de neumáticos guardada con éxito.');
                window.rotCerrarModalInspeccionNeumaticos();

                // Refrescar sección en Detalle de OT si está abierto
                if (typeof window.rotRecargarDetalleOT === 'function' && idOT) {
                    window.rotRecargarDetalleOT(idOT);
                }
                // Refrescar análisis o ultimas si estamos en esos módulos
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
