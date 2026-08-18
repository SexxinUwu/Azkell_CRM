/**
 * modal_inspeccion.js — Módulo Interactivo de Inspección de Neumáticos
 * ERP Azkell Fleet
 */

(function() {
    window._neuCatalogos = window._neuCatalogos || null;
    window._neuLlantasActuales = [];

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

    // Abrir Modal de Inspección
    window.rotAbrirInspeccionNeumaticos = async function(placa, idOT, kmVehiculo) {
        window._neuLlantasActuales = [];
        const hoy = new Date().toISOString().split('T')[0];
        const km = kmVehiculo || 0;
        const usuarioLogueado = localStorage.getItem('fleet_user') || 'Supervisor';

        // Asegurar modal en el DOM
        let modalEl = document.getElementById('modalInspeccionNeumaticos');
        if (!modalEl) {
            const div = document.createElement('div');
            div.innerHTML = `
            <div class="modal fade" id="modalInspeccionNeumaticos" tabindex="-1" aria-hidden="true" data-bs-backdrop="static" style="z-index: 2050 !important;">
                <div class="modal-dialog modal-xl modal-fullscreen-lg-down modal-dialog-centered modal-dialog-scrollable" style="z-index: 2051;">
                    <div class="modal-content border-0 rounded-4 shadow-lg overflow-hidden" style="background: var(--surface, #ffffff);">
                        <!-- Header -->
                        <div class="modal-header border-bottom px-3 px-md-4 py-3 bg-light d-flex align-items-center justify-content-between">
                            <div class="d-flex align-items-center gap-2 gap-md-3">
                                <div class="rounded-3 p-2 d-flex align-items-center justify-content-center" style="background: rgba(37,99,235,0.1); color: #2563eb;">
                                    <i class="bi bi-disc-fill fs-5"></i>
                                </div>
                                <div>
                                    <h6 class="modal-title fw-bold text-dark m-0 d-flex align-items-center gap-2" style="font-size: 0.95rem;">
                                        Inspección de Neumáticos
                                        <span class="badge bg-primary px-2 px-md-3 py-1 rounded-pill" id="neu-badge-placa" style="font-size:0.75rem;">---</span>
                                    </h6>
                                    <small class="text-muted d-none d-sm-inline" id="neu-sub-info">Control milimétrico de cocada, presiones y diagnóstico</small>
                                </div>
                            </div>
                            <button type="button" class="btn-close shadow-none" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>

                        <!-- Body -->
                        <div class="modal-body p-3 p-md-4" style="max-height: 85vh;">
                            <!-- Paso 1: Cabecera General -->
                            <div class="row g-2 g-md-3 mb-3 mb-md-4 p-3 rounded-4 bg-light border" style="border-color: var(--border, #e2e8f0) !important;">
                                <div class="col-12 col-sm-6 col-md-3">
                                    <label class="form-label text-muted fw-bold small mb-1">Fecha de Inspección *</label>
                                    <input type="date" class="form-control form-control-sm rounded-3 fw-bold" id="neu-input-fecha" value="${hoy}">
                                </div>
                                <div class="col-6 col-sm-3 col-md-2">
                                    <label class="form-label text-muted fw-bold small mb-1">Días Propuestos *</label>
                                    <div class="input-group input-group-sm">
                                        <button class="btn btn-outline-secondary" type="button" onclick="var el=document.getElementById('neu-input-dias'); el.value = Math.max(1, (parseInt(el.value)||30)-5);"><i class="bi bi-dash"></i></button>
                                        <input type="number" class="form-control text-center fw-bold" id="neu-input-dias" value="30">
                                        <button class="btn btn-outline-secondary" type="button" onclick="var el=document.getElementById('neu-input-dias'); el.value = (parseInt(el.value)||30)+5;"><i class="bi bi-plus"></i></button>
                                    </div>
                                </div>
                                <div class="col-6 col-sm-3 col-md-2">
                                    <label class="form-label text-muted fw-bold small mb-1">KM Odómetro</label>
                                    <input type="number" class="form-control form-control-sm rounded-3 fw-bold" id="neu-input-km" value="${km}">
                                </div>
                                <div class="col-12 col-md-5">
                                    <label class="form-label text-muted fw-bold small mb-1">Observaciones Generales</label>
                                    <input type="text" class="form-control form-control-sm rounded-3" id="neu-input-obs-gen" placeholder="Ej: Inspección rutinaria de flota mensual...">
                                </div>
                            </div>

                            <!-- Chassis & Form Grid -->
                            <div class="row g-3 g-md-4">
                                <!-- Columna Izquierda: Diagrama Interactivo del Vehículo -->
                                <div class="col-lg-5 col-md-12">
                                    <div class="card border rounded-4 p-3 h-100 bg-white shadow-2xs" style="border-color: var(--border, #e2e8f0) !important;">
                                        <div class="d-flex align-items-center justify-content-between mb-2">
                                            <h6 class="fw-bold m-0 small text-dark d-flex align-items-center gap-2">
                                                <i class="bi bi-truck text-primary"></i> Esquema Visual de Ejes
                                            </h6>
                                            <span class="badge bg-secondary bg-opacity-10 text-secondary small px-2 py-1 rounded-pill" style="font-size:0.68rem;">Toca una llanta</span>
                                        </div>
                                        
                                        <!-- Diagrama SVG Interactivo -->
                                        <div class="p-2 text-center rounded-3 bg-light d-flex flex-column align-items-center justify-content-center" style="min-height: 240px;" id="neu-chassis-container">
                                            <!-- Inyectado dinámicamente -->
                                        </div>

                                        <!-- Leyenda -->
                                        <div class="d-flex justify-content-center gap-3 mt-3 flex-wrap" style="font-size: 0.72rem;">
                                            <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:10px;height:10px;background:#22c55e;"></span> Óptima (>6mm)</div>
                                            <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:10px;height:10px;background:#eab308;"></span> Alerta (4-6mm)</div>
                                            <div class="d-flex align-items-center gap-1"><span class="rounded-circle d-inline-block" style="width:10px;height:10px;background:#ef4444;"></span> Crítica (≤4mm)</div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Columna Derecha: Formulario Individual de Llanta -->
                                <div class="col-lg-7 col-md-12">
                                    <div class="card border rounded-4 p-3 bg-white shadow-2xs" style="border-color: var(--border, #e2e8f0) !important;">
                                        <div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                                            <h6 class="fw-bold m-0 small text-dark d-flex align-items-center gap-2">
                                                <i class="bi bi-ui-checks-grid text-primary"></i> Datos de Llanta — Posición <span class="badge bg-primary rounded-pill px-2" id="neu-form-pos-badge">1</span>
                                            </h6>
                                            <button class="btn btn-sm btn-light border py-0 px-2 fw-bold text-muted" style="font-size:0.7rem;" onclick="window._neuLimpiarFormLlanta()"><i class="bi bi-arrow-counterclockwise"></i> Limpiar</button>
                                        </div>

                                        <!-- Selector Táctil de Posición -->
                                        <div class="mb-3">
                                            <label class="form-label text-muted fw-bold small mb-1 d-block" style="font-size:0.75rem;">Posición de Llanta</label>
                                            <div class="d-flex flex-wrap gap-1" id="neu-pos-selector">
                                                <!-- Botones 1..12 y R -->
                                            </div>
                                        </div>

                                        <!-- Marca, Medida, Modelo -->
                                        <div class="row g-2 mb-3">
                                            <div class="col-12 col-sm-4">
                                                <div class="d-flex justify-content-between align-items-center mb-1">
                                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.75rem;">Marca</label>
                                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('marcas')" class="text-primary small fw-bold" style="font-size:0.7rem;">+ Nueva</a>
                                                </div>
                                                <select class="form-select form-select-sm rounded-3 fw-semibold" id="neu-sel-marca"></select>
                                            </div>
                                            <div class="col-12 col-sm-4">
                                                <div class="d-flex justify-content-between align-items-center mb-1">
                                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.75rem;">Medida</label>
                                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('medidas')" class="text-primary small fw-bold" style="font-size:0.7rem;">+ Nueva</a>
                                                </div>
                                                <select class="form-select form-select-sm rounded-3 fw-semibold" id="neu-sel-medida"></select>
                                            </div>
                                            <div class="col-12 col-sm-4">
                                                <div class="d-flex justify-content-between align-items-center mb-1">
                                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.75rem;">Modelo</label>
                                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('modelos')" class="text-primary small fw-bold" style="font-size:0.7rem;">+ Nuevo</a>
                                                </div>
                                                <select class="form-select form-select-sm rounded-3 fw-semibold" id="neu-sel-modelo"></select>
                                            </div>
                                        </div>

                                        <!-- Remanentes R1, R2, R3 (Botones 1..20) -->
                                        <div class="mb-3 p-2 rounded-3 bg-light border">
                                            <label class="form-label text-dark fw-bold small mb-2 d-flex justify-content-between" style="font-size:0.75rem;">
                                                <span>Profundímetro / Remanente (mm)</span>
                                                <span class="text-primary" id="neu-r-prom-badge">Promedio: 0 mm</span>
                                            </label>

                                            <!-- R1 -->
                                            <div class="mb-2">
                                                <div class="d-flex align-items-center justify-content-between mb-1">
                                                    <span class="text-muted small fw-bold" style="font-size:0.72rem;">R1 (Ext.): <b class="text-dark" id="lbl-r1">10 mm</b></span>
                                                    <div class="d-flex gap-1" id="neu-r1-quick"></div>
                                                </div>
                                                <input type="range" class="form-range" min="1" max="20" value="10" id="neu-range-r1" oninput="document.getElementById('lbl-r1').innerText = this.value + ' mm'; window._neuCalcularPromedio();">
                                            </div>

                                            <!-- R2 -->
                                            <div class="mb-2">
                                                <div class="d-flex align-items-center justify-content-between mb-1">
                                                    <span class="text-muted small fw-bold" style="font-size:0.72rem;">R2 (Centro): <b class="text-dark" id="lbl-r2">10 mm</b></span>
                                                    <div class="d-flex gap-1" id="neu-r2-quick"></div>
                                                </div>
                                                <input type="range" class="form-range" min="1" max="20" value="10" id="neu-range-r2" oninput="document.getElementById('lbl-r2').innerText = this.value + ' mm'; window._neuCalcularPromedio();">
                                            </div>

                                            <!-- R3 -->
                                            <div class="mb-1">
                                                <div class="d-flex align-items-center justify-content-between mb-1">
                                                    <span class="text-muted small fw-bold" style="font-size:0.72rem;">R3 (Int.): <b class="text-dark" id="lbl-r3">10 mm</b></span>
                                                    <div class="d-flex gap-1" id="neu-r3-quick"></div>
                                                </div>
                                                <input type="range" class="form-range" min="1" max="20" value="10" id="neu-range-r3" oninput="document.getElementById('lbl-r3').innerText = this.value + ' mm'; window._neuCalcularPromedio();">
                                            </div>
                                        </div>

                                        <!-- Presión, Estado, Acción -->
                                        <div class="row g-2 mb-3">
                                            <div class="col-6 col-sm-3">
                                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">Presión Ant. (PSI)</label>
                                                <input type="number" class="form-control form-control-sm rounded-3 fw-bold" id="neu-input-pres-ant" value="100">
                                            </div>
                                            <div class="col-6 col-sm-3">
                                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">Presión Actual (PSI)</label>
                                                <input type="number" class="form-control form-control-sm rounded-3 fw-bold" id="neu-input-pres-act" value="110">
                                            </div>
                                            <div class="col-6 col-sm-3">
                                                <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">Estado</label>
                                                <select class="form-select form-select-sm rounded-3 fw-semibold" id="neu-sel-estado">
                                                    <option value="NUEVA">NUEVA</option>
                                                    <option value="RENCAUCHADA">RENCAUCHADA</option>
                                                </select>
                                            </div>
                                            <div class="col-6 col-sm-3">
                                                <div class="d-flex justify-content-between align-items-center mb-1">
                                                    <label class="form-label text-muted fw-bold small m-0" style="font-size:0.72rem;">Acción</label>
                                                    <a href="javascript:void(0)" onclick="window._neuAgregarNuevoCatalogo('acciones')" class="text-primary small fw-bold" style="font-size:0.68rem;">+ Nueva</a>
                                                </div>
                                                <select class="form-select form-select-sm rounded-3 fw-semibold" id="neu-sel-accion"></select>
                                            </div>
                                        </div>

                                        <!-- Observación de la llanta -->
                                        <div class="mb-3">
                                            <label class="form-label text-muted fw-bold small mb-1" style="font-size:0.72rem;">Observación de la Llanta</label>
                                            <input type="text" class="form-control form-control-sm rounded-3" id="neu-input-obs-item" value="Ninguna" placeholder="Ej: Desgaste irregular lado derecho, alinear...">
                                        </div>

                                        <!-- Botón Agregar Llanta a la Lista -->
                                        <div class="d-flex justify-content-end gap-2">
                                            <button class="btn btn-primary btn-sm rounded-pill px-4 py-2 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2 w-100 w-sm-auto" onclick="window._neuGuardarLlantaEnLista()">
                                                <i class="bi bi-check2-circle fs-6"></i> Guardar Llanta en Lista
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Tabla Acumulativa: Llantas Inspeccionadas -->
                            <div class="mt-4 card border rounded-4 overflow-hidden bg-white shadow-2xs" style="border-color: var(--border, #e2e8f0) !important;">
                                <div class="card-header bg-light px-3 py-2 d-flex align-items-center justify-content-between border-bottom">
                                    <div class="d-flex align-items-center gap-2">
                                        <h6 class="m-0 fw-bold text-dark small">Llantas Inspeccionadas</h6>
                                        <span class="badge bg-primary rounded-pill" id="neu-tabla-count">0</span>
                                    </div>
                                    <small class="text-muted">Se guardarán al presionar el botón final</small>
                                </div>
                                <div class="table-responsive" style="max-height: 250px;">
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
                                                <th class="text-center">Promedio</th>
                                                <th class="text-center">Presión</th>
                                                <th>Estado</th>
                                                <th>Acción</th>
                                                <th>Observaciones</th>
                                                <th class="text-center pe-3">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody id="neu-tabla-tbody">
                                            <tr><td colspan="13" class="text-center text-muted py-3">Aún no has agregado ninguna llanta a la inspección.</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div class="modal-footer border-top px-4 py-3 bg-light d-flex align-items-center justify-content-between">
                            <button type="button" class="btn btn-outline-secondary rounded-pill px-4 fw-bold" data-bs-dismiss="modal">Cancelar</button>
                            <button type="button" class="btn btn-success rounded-pill px-4 py-2 fw-bold shadow-sm d-flex align-items-center gap-2" id="neu-btn-guardar-todo" onclick="window._neuGuardarInspeccionCompleta('${placa}', '${idOT||''}')">
                                <i class="bi bi-cloud-arrow-up-fill"></i> Guardar Inspección Completa
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            `;
            document.body.appendChild(div);
            modalEl = document.getElementById('modalInspeccionNeumaticos');
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

        // Renderizar Esquema de Chasis
        window._neuRenderChassis(placa);

        // Renderizar Botones rápidos de remanente
        window._neuRenderQuickButtons();

        // Renderizar tabla vacía
        window._neuRenderTablaLlantas();

        // Mostrar Modal Bootstrap con z-index superior al drawer de OT
        modalEl.style.zIndex = '2050';
        const bsModal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        
        modalEl.addEventListener('shown.bs.modal', function onShown() {
            modalEl.removeEventListener('shown.bs.modal', onShown);
            const backdrops = document.querySelectorAll('.modal-backdrop');
            backdrops.forEach(b => {
                b.style.zIndex = '2045';
            });
        });

        bsModal.show();
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

    // Renderizar botones de posición
    window._neuPosicionActiva = '1';
    window._neuRenderPosiciones = function(posArray) {
        const wrap = document.getElementById('neu-pos-selector');
        if (!wrap) return;
        wrap.innerHTML = posArray.map(p => `
            <button type="button" class="btn btn-sm ${p === window._neuPosicionActiva ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary'} fw-bold px-3 py-1 rounded-3" onclick="window._neuSeleccionarPosicion('${p}')" id="btn-pos-${p}">
                ${p}
            </button>
        `).join('');
    };

    window._neuSeleccionarPosicion = function(pos) {
        window._neuPosicionActiva = pos;
        const b = document.getElementById('neu-form-pos-badge');
        if (b) b.innerText = pos;

        document.querySelectorAll('#neu-pos-selector button').forEach(btn => {
            btn.className = 'btn btn-sm btn-outline-secondary fw-bold px-3 py-1 rounded-3';
        });
        const activeBtn = document.getElementById(`btn-pos-${pos}`);
        if (activeBtn) activeBtn.className = 'btn btn-sm btn-primary text-white shadow-sm fw-bold px-3 py-1 rounded-3';

        // Si la llanta ya está en la lista actual, cargar sus valores para edición rápida
        const existente = window._neuLlantasActuales.find(l => String(l.posicion) === String(pos));
        if (existente) {
            if (document.getElementById('neu-sel-marca')) document.getElementById('neu-sel-marca').value = existente.marca;
            if (document.getElementById('neu-sel-medida')) document.getElementById('neu-sel-medida').value = existente.medida;
            if (document.getElementById('neu-sel-modelo')) document.getElementById('neu-sel-modelo').value = existente.modelo;
            if (document.getElementById('neu-range-r1')) {
                document.getElementById('neu-range-r1').value = existente.r1;
                document.getElementById('lbl-r1').innerText = existente.r1 + ' mm';
            }
            if (document.getElementById('neu-range-r2')) {
                document.getElementById('neu-range-r2').value = existente.r2;
                document.getElementById('lbl-r2').innerText = existente.r2 + ' mm';
            }
            if (document.getElementById('neu-range-r3')) {
                document.getElementById('neu-range-r3').value = existente.r3;
                document.getElementById('lbl-r3').innerText = existente.r3 + ' mm';
            }
            if (document.getElementById('neu-input-pres-ant')) document.getElementById('neu-input-pres-ant').value = existente.presion_ant || 0;
            if (document.getElementById('neu-input-pres-act')) document.getElementById('neu-input-pres-act').value = existente.presion_actual || 0;
            if (document.getElementById('neu-sel-estado')) document.getElementById('neu-sel-estado').value = existente.estado || 'NUEVA';
            if (document.getElementById('neu-sel-accion')) document.getElementById('neu-sel-accion').value = existente.accion || 'Inspeccion';
            if (document.getElementById('neu-input-obs-item')) document.getElementById('neu-input-obs-item').value = existente.observaciones || 'Ninguna';
        }
        window._neuCalcularPromedio();
    };

    // Botones rápidos para remanentes
    window._neuRenderQuickButtons = function() {
        const quickValues = [4, 8, 12, 16];
        ['r1', 'r2', 'r3'].forEach(r => {
            const container = document.getElementById(`neu-${r}-quick`);
            if (container) {
                container.innerHTML = quickValues.map(v => `
                    <button type="button" class="btn btn-xs btn-outline-secondary px-1 py-0" style="font-size:0.65rem;" onclick="document.getElementById('neu-range-${r}').value = ${v}; document.getElementById('lbl-${r}').innerText = '${v} mm'; window._neuCalcularPromedio();">${v}</button>
                `).join('');
            }
        });
        window._neuCalcularPromedio();
    };

    window._neuCalcularPromedio = function() {
        const r1 = parseInt(document.getElementById('neu-range-r1')?.value || 10, 10);
        const r2 = parseInt(document.getElementById('neu-range-r2')?.value || 10, 10);
        const r3 = parseInt(document.getElementById('neu-range-r3')?.value || 10, 10);
        const prom = ((r1 + r2 + r3) / 3.0).toFixed(1);
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

        // Esquema estilizado de camión/remolque con llantas interactivas
        container.innerHTML = `
            <svg viewBox="0 0 220 320" width="180" height="260" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.08));">
                <!-- Chasis Central -->
                <rect x="95" y="20" width="30" height="270" rx="6" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>
                <!-- Cabina / Frente -->
                <path d="M 80 20 L 140 20 L 135 70 L 85 70 Z" fill="#94a3b8" opacity="0.4" rx="4"/>
                <text x="110" y="45" font-size="9" font-weight="bold" fill="#475569" text-anchor="middle">FRENTE</text>

                <!-- Eje 1 (Direccional) -->
                <line x1="45" y1="60" x2="175" y2="60" stroke="#64748b" stroke-width="4"/>
                <!-- Llanta 1 (Izquierda) -->
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('1')">
                    <rect id="svg-tire-1" x="25" y="40" width="22" height="40" rx="5" fill="#22c55e" stroke="#15803d" stroke-width="2"/>
                    <text x="36" y="64" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">1</text>
                </g>
                <!-- Llanta 2 (Derecha) -->
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('2')">
                    <rect id="svg-tire-2" x="173" y="40" width="22" height="40" rx="5" fill="#22c55e" stroke="#15803d" stroke-width="2"/>
                    <text x="184" y="64" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle">2</text>
                </g>

                <!-- Eje 2 (Tracción 1 Dual) -->
                <line x1="30" y1="170" x2="190" y2="170" stroke="#64748b" stroke-width="4"/>
                <!-- Llantas Duales Izquierda (3 y 4) -->
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('3')">
                    <rect id="svg-tire-3" x="10" y="150" width="18" height="40" rx="4" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="19" y="174" font-size="9" font-weight="900" fill="#ffffff" text-anchor="middle">3</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('4')">
                    <rect id="svg-tire-4" x="32" y="150" width="18" height="40" rx="4" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="41" y="174" font-size="9" font-weight="900" fill="#ffffff" text-anchor="middle">4</text>
                </g>
                <!-- Llantas Duales Derecha (5 y 6) -->
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('5')">
                    <rect id="svg-tire-5" x="170" y="150" width="18" height="40" rx="4" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="179" y="174" font-size="9" font-weight="900" fill="#ffffff" text-anchor="middle">5</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('6')">
                    <rect id="svg-tire-6" x="192" y="150" width="18" height="40" rx="4" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="201" y="174" font-size="9" font-weight="900" fill="#ffffff" text-anchor="middle">6</text>
                </g>

                <!-- Eje 3 (Tracción 2 Dual) -->
                <line x1="30" y1="230" x2="190" y2="230" stroke="#64748b" stroke-width="4"/>
                <!-- Llantas Duales Izquierda (7 y 8) -->
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('7')">
                    <rect id="svg-tire-7" x="10" y="210" width="18" height="40" rx="4" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="19" y="234" font-size="9" font-weight="900" fill="#ffffff" text-anchor="middle">7</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('8')">
                    <rect id="svg-tire-8" x="32" y="210" width="18" height="40" rx="4" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="41" y="234" font-size="9" font-weight="900" fill="#ffffff" text-anchor="middle">8</text>
                </g>
                <!-- Llantas Duales Derecha (9 y 10) -->
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('9')">
                    <rect id="svg-tire-9" x="170" y="210" width="18" height="40" rx="4" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="179" y="234" font-size="9" font-weight="900" fill="#ffffff" text-anchor="middle">9</text>
                </g>
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('10')">
                    <rect id="svg-tire-10" x="192" y="210" width="18" height="40" rx="4" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
                    <text x="201" y="234" font-size="9" font-weight="900" fill="#ffffff" text-anchor="middle">10</text>
                </g>

                <!-- Repuesto (R) -->
                <g style="cursor:pointer;" onclick="window._neuSeleccionarPosicion('R')">
                    <rect id="svg-tire-R" x="96" y="110" width="28" height="18" rx="4" fill="#64748b" stroke="#334155" stroke-width="1.5"/>
                    <text x="110" y="123" font-size="9" font-weight="900" fill="#ffffff" text-anchor="middle">R</text>
                </g>
            </svg>
        `;
        window._neuActualizarColoresChassis();
    };

    window._neuActualizarColoresChassis = function() {
        window._neuLlantasActuales.forEach(l => {
            const svgTire = document.getElementById(`svg-tire-${l.posicion}`);
            if (svgTire) {
                const prom = (l.r1 + l.r2 + l.r3) / 3.0;
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
        const r1 = parseInt(document.getElementById('neu-range-r1')?.value || 10, 10);
        const r2 = parseInt(document.getElementById('neu-range-r2')?.value || 10, 10);
        const r3 = parseInt(document.getElementById('neu-range-r3')?.value || 10, 10);
        const presion_ant = parseInt(document.getElementById('neu-input-pres-ant')?.value || 0, 10);
        const presion_actual = parseInt(document.getElementById('neu-input-pres-act')?.value || 0, 10);
        const estado = document.getElementById('neu-sel-estado')?.value || 'NUEVA';
        const accion = document.getElementById('neu-sel-accion')?.value || 'Inspeccion';
        const observaciones = document.getElementById('neu-input-obs-item')?.value || 'Ninguna';

        const item = {
            posicion: pos,
            marca,
            medida,
            modelo,
            r1,
            r2,
            r3,
            remanente_promedio: parseFloat(((r1 + r2 + r3) / 3.0).toFixed(1)),
            presion_ant,
            presion_actual,
            estado,
            accion,
            observaciones
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
            tbody.innerHTML = '<tr><td colspan="13" class="text-center text-muted py-3">Aún no has agregado ninguna llanta a la inspección.</td></tr>';
            return;
        }

        tbody.innerHTML = window._neuLlantasActuales.map((l, index) => {
            const prom = l.remanente_promedio;
            const badgeClass = prom <= 4 ? 'bg-danger' : (prom <= 6 ? 'bg-warning text-dark' : 'bg-success');
            return `
                <tr>
                    <td class="ps-3"><span class="badge bg-primary rounded-pill px-2">${l.posicion}</span></td>
                    <td class="fw-bold">${l.marca}</td>
                    <td>${l.medida}</td>
                    <td><span class="badge bg-light text-dark border">${l.modelo}</span></td>
                    <td class="text-center fw-bold">${l.r1}</td>
                    <td class="text-center fw-bold">${l.r2}</td>
                    <td class="text-center fw-bold">${l.r3}</td>
                    <td class="text-center"><span class="badge ${badgeClass} px-2 py-1">${prom} mm</span></td>
                    <td class="text-center small">${l.presion_ant} ➔ <b>${l.presion_actual} PSI</b></td>
                    <td><span class="badge bg-secondary bg-opacity-10 text-secondary">${l.estado}</span></td>
                    <td><span class="badge bg-info bg-opacity-10 text-info">${l.accion}</span></td>
                    <td class="text-truncate text-muted small" style="max-width:140px;">${l.observaciones || 'Ninguna'}</td>
                    <td class="text-center pe-3">
                        <button class="btn btn-outline-danger btn-xs py-0 px-2 rounded-pill" onclick="window._neuEliminarLlanta(${index})"><i class="bi bi-trash"></i></button>
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
        document.getElementById('neu-range-r1').value = 10;
        document.getElementById('lbl-r1').innerText = '10 mm';
        document.getElementById('neu-range-r2').value = 10;
        document.getElementById('lbl-r2').innerText = '10 mm';
        document.getElementById('neu-range-r3').value = 10;
        document.getElementById('lbl-r3').innerText = '10 mm';
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
                const modalEl = document.getElementById('modalInspeccionNeumaticos');
                if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();

                // Refrescar sección en Detalle de OT si está abierto
                if (typeof window.rotRecargarDetalleOT === 'function' && idOT) {
                    window.rotRecargarDetalleOT(idOT);
                }
            } else {
                alert(`Error al guardar: ${data.error || 'Error desconocido'}`);
            }
        } catch (e) {
            alert(`Error de red: ${e.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill me-1"></i> Guardar Inspección Completa';
            }
        }
    };

})();
