// =========================================================================
// MÓDULO SEGURIDAD: CHECKLIST "ENTREGA DE VEHÍCULOS"
// Formato Oficial: Inventario Físico Estado de Vehículo
// Lógica de Negocio + Portal Bento Multi-Empresa + Dibujo por Configuración
// =========================================================================

(function() {
    'use strict';

    window.dataGlobalEntregaVehiculos = [];
    window._evEmpresaActiva = localStorage.getItem('sgu_empresa_activa') || 'TODAS';
    window._evCatalogoPlacas = [];
    window._evCatalogoConductores = [];
    window._evCatalogoEmpresas = [];
    window._evItemsStates = {};
    window._evCantidades = {};
    window._evCurrentConfiguracion = 'T3';

    // Estructura de Partes y Accesorios agrupada por sistemas
    const GRUPOS_SISTEMAS = [
        {
            id: 'frente_exterior',
            titulo: 'Frente Exterior',
            icon: 'bi-truck',
            items: ['Emblemas', 'Persianas', 'Defensa Delantera', 'Luz Chica', 'Unidades', 'Direccionales']
        },
        {
            id: 'interior_motor',
            titulo: 'Interior del Motor',
            icon: 'bi-gear-wide-connected',
            items: ['Batería Marca', 'Tapa Radiador', 'Tapa Aceite', 'Varilla Medidora de Aceite', 'Correas de Ventilador', 'Corneta', 'Sirenas']
        },
        {
            id: 'frente_superior',
            titulo: 'Frente Superior',
            icon: 'bi-window-fullscreen',
            items: ['Vidrio Panorámico', 'Brazos Limpia Brisas', 'Cuchillas Limpia Brisas', 'Antena Radio']
        },
        {
            id: 'costado_izquierdo',
            titulo: 'Costado Izquierdo',
            icon: 'bi-arrow-left-square',
            items: ['Vidrios Laterales', 'Manija', 'Cerraduras', 'Copas Ruedas']
        },
        {
            id: 'estribos',
            titulo: 'Estribos',
            icon: 'bi-signpost-2',
            items: ['Estribo Derecho', 'Estribo Izquierdo']
        },
        {
            id: 'costado_trasero',
            titulo: 'Costado Trasero',
            icon: 'bi-arrow-down-square',
            items: ['Emblemas', 'Defensa Trasera', 'Steps Frenos', 'Luces de Parqueo', 'Freno Auxiliar']
        },
        {
            id: 'direccionales_luces',
            titulo: 'Direccionales y Luces',
            icon: 'bi-lightbulb',
            items: ['Direccionales', 'Reversos', 'Vidrios Traseros', 'Tapa Tanque Combustible']
        },
        {
            id: 'costado_derecho',
            titulo: 'Costado Derecho',
            icon: 'bi-arrow-right-square',
            items: ['Vidrios Laterales', 'Manijas', 'Cerraduras', 'Copas Ruedas']
        },
        {
            id: 'llaves',
            titulo: 'Llaves',
            icon: 'bi-key',
            items: ['Puertas', 'Ignición', 'Baúl']
        },
        {
            id: 'interior_vehiculo',
            titulo: 'Interior del Vehículo (Cabina)',
            icon: 'bi-car-front',
            items: ['Consola', 'Autoradio', 'Guantera', 'Seguro Puerta', 'Manija Puerta', 'Manija Vidrio', 'Luz Interior', 'Cojinería', 'Forros', 'Tapetes', 'Cenicero', 'Descansabrazos', 'Descansacabezas', 'Radio Teléfono', 'Intercomunicador', 'Espejo Retrovisor']
        },
        {
            id: 'tablero_controles',
            titulo: 'Tablero de Controles e Instrumentos',
            icon: 'bi-speedometer2',
            items: ['Switch Ignición', 'Interruptor Luces Delanteras', 'Interruptor Luces Parqueo', 'Direccionales', 'Claxon', 'Sirena', 'Calefacción', 'Tacómetro', 'Encendedor Cigarrillos', 'Velocímetro', 'Medidor de Combustible', 'Medidor de Temperatura', 'Medidor de Aceite']
        },
        {
            id: 'herramientas',
            titulo: 'Herramientas',
            icon: 'bi-tools',
            items: ['Gata', 'Llave de Ruedas', 'Cable de Corriente', 'Palancas', 'Destornillador', 'Desarmador Mixto', 'Llaves Fijas', 'Alicate', 'Linterna (Pilas o Conexión)', 'Kit de Herramientas', 'Llave Allen para Semirremolque', 'Llave Allen para Doble Nivel', 'Pernos de Seguridad']
        },
        {
            id: 'seguridad_emergencia',
            titulo: 'Señales de Advertencia y Seguridad',
            icon: 'bi-exclamation-triangle',
            items: ['Triángulos', 'Lámparas de Luz Intermitente', 'Tacos para Bloquear Vehículo', 'Extintor (Expira)', 'Conos', 'Bonificación Vehicular', 'Mando']
        }
    ];

    // Variables de canvas
    let _canvasEntrega, _ctxEntrega, _dibujandoEntrega = false;
    let _canvasRecibe, _ctxRecibe, _dibujandoRecibe = false;

    window.init_seguridad_entrega_vehiculos = window.init_entrega_vehiculos = window.inicializarModuloEntregaVehiculos = function() {
        window.evActualizarUsuarioActual();
        window.evIrAPortal();
        window.evRenderizarSistemas();
        window.evCargarRecursos();
        window.evCargarPortalStats();
        window.evInitCanvasFirmas();
    };

    window.evActualizarUsuarioActual = function() {
        const lsUser = localStorage.getItem('fleet_user') || 'Oficial de Seguridad';
        const elUserName = document.getElementById('ev-portal-user-name');
        const elUserAvatar = document.getElementById('ev-portal-user-avatar');
        if (elUserName) elUserName.textContent = lsUser;
        if (elUserAvatar) {
            const p = lsUser.trim().split(' ');
            const ini = p.length > 1 ? (p[0][0] + p[1][0]) : lsUser.substring(0, 2);
            elUserAvatar.textContent = ini.toUpperCase();
        }

        const elEnt = document.getElementById('ev-f-entrega');
        if (elEnt) elEnt.value = lsUser.toUpperCase();

        const elFirmaEntNom = document.getElementById('ev-lbl-firma-entrega-nom');
        if (elFirmaEntNom) elFirmaEntNom.textContent = lsUser.toUpperCase();
    };

    // ── GESTIÓN DE VISTAS (Portal -> Lista -> Formulario) ───────────
    window.evShowView = function(viewName) {
        ['portal', 'list', 'form'].forEach(v => {
            const el = document.getElementById(`ev-${v}`);
            if (el) {
                if (v === viewName) {
                    el.classList.add('active');
                    el.style.display = 'block';
                } else {
                    el.classList.remove('active');
                    el.style.display = 'none';
                }
            }
        });
    };

    window.evIrAPortal = function() {
        window.evShowView('portal');
        window.evCargarPortalStats();
    };

    window.evSeleccionarEmpresa = function(empresa) {
        window._evEmpresaActiva = empresa;
        localStorage.setItem('sgu_empresa_activa', empresa);
        window.evShowView('list');

        const badge = document.getElementById('ev-active-company-badge');
        if (badge) badge.textContent = empresa;

        window.evCargarDatos();
    };

    // ── CARGAR RECURSOS Y STATS DEL PORTAL ─────────────────────────
    window.evCargarRecursos = async function() {
        try {
            const res = await fetch('/api/seguridad/recursos');
            const data = await res.json();
            if (data) {
                window._evCatalogoPlacas = data.placas || [];
                window._evCatalogoConductores = data.conductores || [];
                window._evCatalogoEmpresas = data.empresas || [];

                const dlP = document.getElementById('ev-dl-placas');
                const dlC = document.getElementById('ev-dl-conductores');

                if (dlP) dlP.innerHTML = (data.placas || []).map(p => `<option value="${p}">`).join('');
                if (dlC) dlC.innerHTML = (data.conductores || []).map(c => `<option value="${c}">`).join('');
            }
        } catch(e) {
            console.warn('Error cargando recursos:', e);
        }
    };

    window.evCargarPortalStats = async function() {
        const grid = document.getElementById('ev-portal-companies-grid');
        if (!grid) return;

        grid.innerHTML = '<div class="col-12 text-center py-4 text-muted"><i class="bi bi-arrow-repeat spin fs-4 d-block mb-2"></i> Actualizando empresas de flota...</div>';

        try {
            const res = await fetch('/api/seguridad/empresas-stats');
            const data = await res.json();
            const empresas = (data && data.empresas) || [];
            const global = (data && data.global) || { total_flota: 0, en_ruta: 0, completados: 0, alertas: 0 };

            if (!empresas.length) {
                grid.innerHTML = '<div class="col-12 text-center py-4 text-muted">No se encontraron empresas registradas.</div>';
                return;
            }

            let html = '';
            const colorPalettes = [
                { bg: '#eff6ff', color: '#0284c7', icon: 'bi-building-fill' },
                { bg: '#f0fdf4', color: '#16a34a', icon: 'bi-truck-front-fill' },
                { bg: '#fffbeb', color: '#d97706', icon: 'bi-geo-alt-fill' },
                { bg: '#fdf2f8', color: '#db2777', icon: 'bi-box-seam-fill' }
            ];

            empresas.forEach((emp, idx) => {
                const pal = colorPalettes[idx % colorPalettes.length];
                html += `
                    <div class="col-12 col-md-6 col-lg-4">
                        <div class="ev-company-card" onclick="window.evSeleccionarEmpresa('${emp.empresa}')">
                            <div>
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <div class="ev-company-icon" style="background:${pal.bg}; color:${pal.color};">
                                        <i class="bi ${pal.icon}"></i>
                                    </div>
                                    <span class="badge bg-light text-secondary border rounded-pill px-2 py-1" style="font-size:0.72rem;">${emp.total_flota || 0} Unidades</span>
                                </div>
                                <h4 class="fw-bold mb-1 text-dark" style="letter-spacing:-0.02em;">${emp.empresa}</h4>
                                <p class="text-secondary small mb-3">Gestión de entrega de unidades ${emp.empresa}</p>
                            </div>

                            <div class="d-flex align-items-center justify-content-between p-2 rounded-3 mb-3" style="background:#f8fafc; border:1px solid #f1f5f9;">
                                <div class="text-center flex-fill border-end">
                                    <div class="fw-bold text-primary" style="font-size:1.1rem;">${emp.en_ruta || 0}</div>
                                    <span class="text-muted" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">En Ruta</span>
                                </div>
                                <div class="text-center flex-fill border-end">
                                    <div class="fw-bold text-success" style="font-size:1.1rem;">${emp.completados || 0}</div>
                                    <span class="text-muted" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">Entregados</span>
                                </div>
                                <div class="text-center flex-fill">
                                    <div class="fw-bold text-secondary" style="font-size:1.1rem;">${emp.total_flota || 0}</div>
                                    <span class="text-muted" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">Flota</span>
                                </div>
                            </div>

                            <button class="btn btn-primary w-100 rounded-3 fw-bold py-2 shadow-2xs" style="font-size:0.85rem; background:#0284c7; border-color:#0284c7;">
                                <i class="bi bi-clipboard-check me-1"></i> Gestionar CheckList ➜
                            </button>
                        </div>
                    </div>
                `;
            });

            // Tarjeta Consolidada "Todas las Empresas"
            html += `
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="ev-company-card" style="border: 2px dashed #cbd5e1; background: #fafafa;" onclick="window.evSeleccionarEmpresa('TODAS')">
                        <div>
                            <div class="d-flex align-items-center justify-content-between mb-2">
                                <div class="ev-company-icon" style="background:#334155; color:#ffffff;">
                                    <i class="bi bi-globe2"></i>
                                </div>
                                <span class="badge bg-dark text-white rounded-pill px-2 py-1" style="font-size:0.72rem;">Consolidado</span>
                            </div>
                            <h4 class="fw-bold mb-1 text-dark">TODAS LAS EMPRESAS</h4>
                            <p class="text-secondary small mb-3">Vista general combinada de todas las empresas</p>
                        </div>

                        <div class="d-flex align-items-center justify-content-between p-2 rounded-3 mb-3" style="background:#ffffff; border:1px solid #e2e8f0;">
                            <div class="text-center flex-fill border-end">
                                <div class="fw-bold text-primary" style="font-size:1.1rem;">${global.en_ruta || 0}</div>
                                <span class="text-muted" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">En Ruta</span>
                            </div>
                            <div class="text-center flex-fill border-end">
                                <div class="fw-bold text-success" style="font-size:1.1rem;">${global.completados || 0}</div>
                                <span class="text-muted" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">Entregados</span>
                            </div>
                            <div class="text-center flex-fill">
                                <div class="fw-bold text-secondary" style="font-size:1.1rem;">${global.total_flota || 0}</div>
                                <span class="text-muted" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">Total Flota</span>
                            </div>
                        </div>

                        <button class="btn btn-outline-dark w-100 rounded-3 fw-bold py-2" style="font-size:0.85rem;">
                            <i class="bi bi-eye me-1"></i> Ver Flota Global ➜
                        </button>
                    </div>
                </div>
            `;

            grid.innerHTML = html;
        } catch(e) {
            console.error('Error stats:', e);
            grid.innerHTML = '<div class="col-12 text-center py-4 text-danger">Error al cargar estadísticas de empresas.</div>';
        }
    };

    // ── CARGAR Y RENDERIZAR TABLA DE REGISTROS ─────────────────────
    window.evCargarDatos = async function() {
        const tbody = document.getElementById('ev-list-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted"><i class="bi bi-arrow-repeat spin me-2"></i> Cargando actas de entrega...</td></tr>';

        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const empParam = (window._evEmpresaActiva && window._evEmpresaActiva !== 'TODAS') ? `?empresa=${encodeURIComponent(window._evEmpresaActiva)}` : '';
            const res = await fetch(`/api/seguridad/entrega-vehiculos${empParam}`, {
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            const json = await res.json();
            if (json.ok && Array.isArray(json.data)) {
                window.dataGlobalEntregaVehiculos = json.data;
                window.evRenderizarTabla(json.data);
                window.evActualizarKPIs(json.data);
            }
        } catch(e) {
            console.error('Error cargando datos:', e);
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Error al cargar entregas.</td></tr>';
        }
    };

    window.evActualizarKPIs = function(data) {
        const total = data.length;
        const hoyStr = new Date().toISOString().slice(0, 10);
        const hoy = data.filter(r => (r.fecha || '').slice(0, 10) === hoyStr).length;
        const vehiculos = new Set(data.map(r => r.placa)).size;

        const elTot = document.getElementById('ev-kpi-total');
        const elHoy = document.getElementById('ev-kpi-hoy');
        const elVeh = document.getElementById('ev-kpi-vehiculos');
        if (elTot) elTot.textContent = total;
        if (elHoy) elHoy.textContent = hoy;
        if (elVeh) elVeh.textContent = vehiculos;
    };

    window.evRenderizarTabla = function(data) {
        const tbody = document.getElementById('ev-list-tbody');
        const count = document.getElementById('ev-lbl-tabla-count');
        if (!tbody) return;

        if (count) count.textContent = `${data.length} actas registradas`;

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2"></i>No hay actas de entrega registradas para ${window._evEmpresaActiva}. Haz clic en "Registrar Entrega".</td></tr>`;
            return;
        }

        let html = '';
        data.forEach(r => {
            let fechaFmt = r.fecha || '---';
            if (r.fecha && r.fecha.includes('-')) {
                const p = r.fecha.slice(0, 10).split('-');
                if (p.length === 3) fechaFmt = `${p[2]}/${p[1]}/${p[0]}`;
            }

            html += `
                <tr>
                    <td><span class="badge bg-light text-dark border font-monospace fw-bold px-2 py-1">${r.numero_inventario || r.id}</span></td>
                    <td><span class="font-monospace fw-semibold">${fechaFmt}</span></td>
                    <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace fw-bold px-2 py-1">${r.placa}</span></td>
                    <td><div class="fw-bold text-dark small"><i class="bi bi-person-fill text-secondary me-1"></i>${r.quien_entrega}</div></td>
                    <td><div class="fw-bold text-dark small"><i class="bi bi-person-check-fill text-success me-1"></i>${r.quien_recibe}</div></td>
                    <td><span class="font-monospace fw-bold text-dark">${parseFloat(r.kilometraje || 0).toLocaleString('es-PE')} km</span></td>
                    <td><small class="text-muted text-truncate d-block" style="max-width:200px;">${r.observaciones || 'Sin observaciones'}</small></td>
                    <td style="text-align:center;">
                        <button type="button" class="btn btn-sm btn-outline-primary rounded-2 px-2 py-1 fw-bold" onclick="window.evImprimirPDF('${r.id}')" title="Imprimir Acta PDF">
                            <i class="bi bi-file-earmark-pdf-fill me-1"></i> PDF
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    };

    window.evFiltrarTabla = function(query) {
        const q = (query || '').trim().toLowerCase();
        const filtrados = (window.dataGlobalEntregaVehiculos || []).filter(r => {
            return !q || 
                (r.numero_inventario || '').toLowerCase().includes(q) ||
                (r.placa || '').toLowerCase().includes(q) ||
                (r.quien_entrega || '').toLowerCase().includes(q) ||
                (r.quien_recibe || '').toLowerCase().includes(q) ||
                (r.observaciones || '').toLowerCase().includes(q);
        });
        window.evRenderizarTabla(filtrados);
    };

    // ── FORMULARIO: APERTURA Y AUTOCOMPLETADOS ──────────────────────
    window.evAbrirNuevoFormulario = async function() {
        window.evShowView('form');
        window.evActualizarUsuarioActual();

        // 1. Obtener correlativo sucesivo exacto (0001, 0002, etc.)
        const invEl = document.getElementById('ev-f-nro-inv');
        if (invEl) invEl.value = 'Calculando...';

        try {
            const resFolio = await fetch('/api/seguridad/entrega-vehiculos/next-folio');
            const dataFolio = await resFolio.json();
            if (dataFolio && dataFolio.ok && invEl) {
                invEl.value = dataFolio.folio;
            } else if (invEl) {
                invEl.value = `ENT-${new Date().getFullYear()}-0001`;
            }
        } catch(e) {
            if (invEl) invEl.value = `ENT-${new Date().getFullYear()}-0001`;
        }

        const hoy = new Date().toISOString().slice(0, 10);
        const fFecha = document.getElementById('ev-f-fecha');
        if (fFecha) fFecha.value = hoy;

        const fMotivo = document.getElementById('ev-f-motivo');
        if (fMotivo) fMotivo.value = 'ENTREGA DE UNIDAD';

        // Reset campos técnicos
        ['ev-f-recibe', 'ev-f-clase', 'ev-f-marca', 'ev-f-modelo', 'ev-f-placa', 'ev-f-color', 'ev-f-motor', 'ev-f-serie', 'ev-f-km', 'ev-f-obs'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        window._evItemsStates = {};
        window._evCantidades = {};
        window._evCurrentConfiguracion = 'T3';
        window.evRenderizarSistemas();
        window.evRenderizarCroquis('T3');
        window.evSyncNombresFirmas();
        window.evLimpiarFirma('entrega');
        window.evLimpiarFirma('recibe');
    };

    window.evCancelarFormulario = function() {
        window.evShowView('list');
    };

    window.evSyncNombresFirmas = function() {
        const lsUser = localStorage.getItem('fleet_user') || 'Oficial de Seguridad';
        const elFirmaEntNom = document.getElementById('ev-lbl-firma-entrega-nom');
        if (elFirmaEntNom) elFirmaEntNom.textContent = lsUser.toUpperCase();

        const recibeVal = document.getElementById('ev-f-recibe')?.value || 'CONDUCTOR / RECEPTOR';
        const elFirmaRecNom = document.getElementById('ev-lbl-firma-recibe-nom');
        if (elFirmaRecNom) elFirmaRecNom.textContent = recibeVal.trim().toUpperCase() || 'CONDUCTOR / RECEPTOR';
    };

    // ── AUTOCOMPLETADO EXACTO DESDE LA BASE DE DATOS DE PLACAS ────
    window.evOnPlacaInput = async function(placa) {
        const cleanP = String(placa || '').trim().toUpperCase();
        if (cleanP.length < 3) return;

        try {
            const res = await fetch(`/api/seguridad/entrega-vehiculos/placa-detalle/${encodeURIComponent(cleanP)}`);
            const json = await res.json();
            if (json && json.ok && json.data) {
                const d = json.data;
                const setVal = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.value = (val !== null && val !== undefined) ? val : '';
                };

                setVal('ev-f-clase', d.tipo || 'TRACTO');
                setVal('ev-f-marca', d.marca);
                setVal('ev-f-modelo', d.modelo);
                setVal('ev-f-color', d.color);
                setVal('ev-f-motor', d.numero_motor);
                setVal('ev-f-serie', d.numero_serie);
                setVal('ev-f-km', d.kilometraje || 0);

                const config = d.configuracion || (d.tipo && d.tipo.includes('CARRETA') ? 'R2' : 'T3');
                window._evCurrentConfiguracion = config;
                window.evRenderizarCroquis(config);
            }
        } catch(e) {
            console.warn('Error al autocompletar placa:', e);
        }
    };

    // ── RENDERIZAR DIAGRAMA SVG SEGÚN CONFIGURACIÓN (T2, T3, C2, C3, R2, Se3, etc.) ──
    window.evRenderizarCroquis = function(configStr) {
        const cont = document.getElementById('ev-croquis-svg-container');
        const tag = document.getElementById('ev-lbl-config-tag');
        if (!cont) return;

        const conf = (configStr || 'T3').toUpperCase().trim();
        if (tag) tag.textContent = `CONFIGURACIÓN: ${conf}`;

        let svg = '';
        if (conf.includes('R') || conf.includes('SE') || conf.includes('CARRETA') || conf.includes('FURGON')) {
            // Remolque / Semirremolque / Carreta (R2, R3, Se3)
            svg = `
                <svg width="340" height="95" viewBox="0 0 400 120" style="max-width:100%; height:auto;">
                    <!-- Carreta Chasis -->
                    <rect x="30" y="25" width="330" height="60" rx="4" fill="#f8fafc" stroke="#0f172a" stroke-width="3"/>
                    <rect x="35" y="30" width="100" height="50" rx="2" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1"/>
                    <rect x="145" y="30" width="100" height="50" rx="2" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1"/>
                    <rect x="255" y="30" width="100" height="50" rx="2" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1"/>
                    <!-- Pines / Ejes -->
                    <circle cx="50" cy="95" r="14" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                    <circle cx="270" cy="95" r="14" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                    <circle cx="310" cy="95" r="14" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                    <circle cx="350" cy="95" r="14" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                    <text x="195" y="60" text-anchor="middle" font-size="12" font-weight="bold" fill="#475569">REMOLQUE / CARRETA (${conf})</text>
                </svg>
            `;
        } else if (conf === 'T2' || conf === 'C2') {
            // Tracto 2 Ejes / Camión 2 Ejes
            svg = `
                <svg width="340" height="95" viewBox="0 0 400 120" style="max-width:100%; height:auto;">
                    <rect x="20" y="28" width="90" height="62" rx="6" fill="#e2e8f0" stroke="#0f172a" stroke-width="3"/>
                    <rect x="110" y="45" width="180" height="45" rx="3" fill="#f8fafc" stroke="#0f172a" stroke-width="3"/>
                    <rect x="30" y="36" width="35" height="25" rx="3" fill="#bae6fd" stroke="#0284c7" stroke-width="1.5"/>
                    <circle cx="55" cy="95" r="14" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                    <circle cx="250" cy="95" r="14" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                    <text x="200" y="70" text-anchor="middle" font-size="12" font-weight="bold" fill="#475569">UNIDAD (${conf} - 2 EJES)</text>
                </svg>
            `;
        } else {
            // Tracto 3 Ejes Standard (T3, C3, 6x4)
            svg = `
                <svg width="340" height="95" viewBox="0 0 400 120" style="max-width:100%; height:auto;">
                    <rect x="20" y="25" width="90" height="65" rx="6" fill="#e2e8f0" stroke="#0f172a" stroke-width="3"/>
                    <rect x="110" y="35" width="250" height="55" rx="4" fill="#f8fafc" stroke="#0f172a" stroke-width="3"/>
                    <rect x="30" y="34" width="38" height="26" rx="3" fill="#bae6fd" stroke="#0284c7" stroke-width="1.5"/>
                    <circle cx="55" cy="95" r="14" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                    <circle cx="270" cy="95" r="14" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                    <circle cx="310" cy="95" r="14" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                    <circle cx="350" cy="95" r="14" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                    <text x="220" y="65" text-anchor="middle" font-size="12" font-weight="bold" fill="#475569">TRACTO / CAMIÓN (${conf})</text>
                </svg>
            `;
        }

        cont.innerHTML = svg;
    };

    // ── RENDERIZAR SISTEMAS Y COMPONENTES ─────────────────────────
    window.evRenderizarSistemas = function() {
        const cont = document.getElementById('ev-sistemas-accordion-container');
        if (!cont) return;

        let html = '';
        GRUPOS_SISTEMAS.forEach((grp, idx) => {
            const collapseId = `ev-collapse-sys-${grp.id}`;
            const isFirst = idx < 2;

            html += `
                <div class="ev-system-card" id="ev-card-${grp.id}">
                    <div class="ev-system-header" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="${isFirst}">
                        <div class="d-flex align-items-center gap-2">
                            <i class="bi ${grp.icon} text-primary fs-5"></i>
                            <strong class="text-dark" style="font-size:0.92rem;">${grp.titulo}</strong>
                            <span class="badge bg-light text-secondary border rounded-pill px-2 py-1" style="font-size:0.7rem;">${grp.items.length} ítems</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-success-subtle text-success border border-success-subtle d-none" id="ev-badge-count-${grp.id}" style="font-size:0.7rem;"></span>
                            <i class="bi bi-chevron-down text-secondary" style="transition: transform 0.2s ease;"></i>
                        </div>
                    </div>

                    <div class="collapse ${isFirst ? 'show' : ''}" id="${collapseId}">
                        <div class="p-2 bg-white">
            `;

            grp.items.forEach(it => {
                const cleanKey = it.toLowerCase().replace(/[^a-z0-9]/g, '_');
                html += `
                    <div class="ev-item-row" id="ev-row-${cleanKey}">
                        <div class="fw-semibold text-dark" style="font-size:0.86rem;">
                            ${it}
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="d-flex align-items-center gap-1">
                                <small class="text-muted" style="font-size:0.72rem;">Cant:</small>
                                <input type="number" id="ev-cant-${cleanKey}" class="ev-form-input text-center p-1 font-monospace" value="1" min="1" max="99" style="width: 48px; height: 30px; font-size:0.82rem;" onchange="window._evCantidades['${cleanKey}'] = this.value">
                            </div>
                            <div class="ev-pill-states">
                                <button type="button" class="ev-state-pill" id="ev-pill-${cleanKey}-b" onclick="window.evSetItemState('${cleanKey}', 'B', '${grp.id}')" title="Bueno">B</button>
                                <button type="button" class="ev-state-pill" id="ev-pill-${cleanKey}-r" onclick="window.evSetItemState('${cleanKey}', 'R', '${grp.id}')" title="Regular">R</button>
                                <button type="button" class="ev-state-pill" id="ev-pill-${cleanKey}-m" onclick="window.evSetItemState('${cleanKey}', 'M', '${grp.id}')" title="Malo">M</button>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `
                        </div>
                    </div>
                </div>
            `;
        });

        cont.innerHTML = html;
    };

    window.evSetItemState = function(key, state, grpId) {
        const cur = window._evItemsStates[key];
        ['b', 'r', 'm'].forEach(s => {
            const pill = document.getElementById(`ev-pill-${key}-${s}`);
            if (pill) pill.className = 'ev-state-pill';
        });

        if (cur === state) {
            delete window._evItemsStates[key];
        } else {
            window._evItemsStates[key] = state;
            const pill = document.getElementById(`ev-pill-${key}-${state.toLowerCase()}`);
            if (pill) pill.classList.add(`active-${state.toLowerCase()}`);
        }

        window.evActualizarBadgeGrupo(grpId);
    };

    window.evActualizarBadgeGrupo = function(grpId) {
        if (!grpId) return;
        const grp = GRUPOS_SISTEMAS.find(g => g.id === grpId);
        if (!grp) return;

        let marcados = 0;
        grp.items.forEach(it => {
            const k = it.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (window._evItemsStates[k]) marcados++;
        });

        const badge = document.getElementById(`ev-badge-count-${grpId}`);
        if (badge) {
            if (marcados > 0) {
                badge.textContent = `${marcados}/${grp.items.length} calificados`;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        }
    };

    window.evMarcarTodosBueno = function() {
        GRUPOS_SISTEMAS.forEach(grp => {
            grp.items.forEach(it => {
                const k = it.toLowerCase().replace(/[^a-z0-9]/g, '_');
                window.evSetItemState(k, 'B', grp.id);
            });
        });
    };

    window.evFiltrarItems = function(query) {
        const q = (query || '').trim().toLowerCase();
        GRUPOS_SISTEMAS.forEach(grp => {
            let matches = 0;
            grp.items.forEach(it => {
                const k = it.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const row = document.getElementById(`ev-row-${k}`);
                if (row) {
                    const match = !q || it.toLowerCase().includes(q);
                    row.style.display = match ? 'flex' : 'none';
                    if (match) matches++;
                }
            });

            const card = document.getElementById(`ev-card-${grp.id}`);
            const collapse = document.getElementById(`ev-collapse-sys-${grp.id}`);
            if (card) {
                card.style.display = matches > 0 ? 'block' : 'none';
            }
            if (q && collapse && matches > 0) {
                collapse.classList.add('show');
            }
        });
    };

    // ── GESTIÓN DE FIRMAS EN CANVAS ───────────────────────────────
    window.evInitCanvasFirmas = function() {
        _canvasEntrega = document.getElementById('ev-canvas-entrega');
        _canvasRecibe = document.getElementById('ev-canvas-recibe');

        const setupCanvas = (canvas, type) => {
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth || 340;
            canvas.height = canvas.offsetHeight || 120;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#0f172a';

            const start = (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
                const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
                if (type === 'entrega') _dibujandoEntrega = true; else _dibujandoRecibe = true;
                ctx.beginPath();
                ctx.moveTo(x, y);
            };
            const move = (e) => {
                const isDraw = type === 'entrega' ? _dibujandoEntrega : _dibujandoRecibe;
                if (!isDraw) return;
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
                const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
                ctx.lineTo(x, y);
                ctx.stroke();
            };
            const stop = () => {
                if (type === 'entrega') _dibujandoEntrega = false; else _dibujandoRecibe = false;
            };

            canvas.addEventListener('mousedown', start);
            canvas.addEventListener('mousemove', move);
            canvas.addEventListener('mouseup', stop);
            canvas.addEventListener('mouseleave', stop);
            canvas.addEventListener('touchstart', start, { passive: true });
            canvas.addEventListener('touchmove', move, { passive: true });
            canvas.addEventListener('touchend', stop);
        };

        setupCanvas(_canvasEntrega, 'entrega');
        setupCanvas(_canvasRecibe, 'recibe');
    };

    window.evLimpiarFirma = function(tipo) {
        const c = tipo === 'entrega' ? _canvasEntrega : _canvasRecibe;
        if (c) {
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);
        }
    };

    // ── GUARDAR FORMULARIO EN BASE DE DATOS ───────────────────────
    window.evGuardarFormulario = async function() {
        const getVal = id => document.getElementById(id)?.value || '';

        const placa = getVal('ev-f-placa').trim().toUpperCase();
        const entrega = getVal('ev-f-entrega').trim().toUpperCase();
        const recibe = getVal('ev-f-recibe').trim().toUpperCase();

        if (!placa || !entrega || !recibe) {
            alert('Por favor completa la Placa Principal, Quien Entrega y Quien Recibe.');
            return;
        }

        const payload = {
            numero_inventario: getVal('ev-f-nro-inv'),
            fecha: getVal('ev-f-fecha') || new Date().toISOString().slice(0, 10),
            motivo: 'ENTREGA DE UNIDAD',
            quien_entrega: entrega,
            quien_recibe: recibe,
            clase: getVal('ev-f-clase'),
            marca: getVal('ev-f-marca'),
            tipo: getVal('ev-f-clase'),
            modelo: getVal('ev-f-modelo'),
            placa: placa,
            color: getVal('ev-f-color'),
            cilindros: '6',
            numero_motor: getVal('ev-f-motor'),
            numero_serie: getVal('ev-f-serie'),
            kilometraje: parseFloat(getVal('ev-f-km')) || 0,
            inventario_partes_json: window._evItemsStates,
            observaciones: getVal('ev-f-obs'),
            doc_entrega: entrega,
            doc_recibe: recibe,
            firma_entrega: _canvasEntrega ? _canvasEntrega.toDataURL() : null,
            firma_recibe: _canvasRecibe ? _canvasRecibe.toDataURL() : null,
            empresa: window._evEmpresaActiva === 'TODAS' ? 'MARSISA' : window._evEmpresaActiva
        };

        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const res = await fetch('/api/seguridad/entrega-vehiculos', {
                method: 'POST',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const json = await res.json();
            if (json.ok) {
                alert('✅ Acta de Entrega de Vehículo guardada exitosamente.');
                window.evImprimirPDF(json.id);
                window.evShowView('list');
                window.evCargarDatos();
            } else {
                alert('Error al guardar: ' + (json.error || 'Ocurrió un problema'));
            }
        } catch(e) {
            console.error('Error al guardar entrega:', e);
            alert('Error de conexión al servidor.');
        }
    };

    // ── GENERACIÓN E IMPRESIÓN DEL PDF OFICIAL (FORMATO A4) ──────
    window.evImprimirPDF = async function(id) {
        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const res = await fetch(`/api/seguridad/entrega-vehiculos/${encodeURIComponent(id)}`, {
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            const json = await res.json();
            if (!json.ok || !json.data) {
                alert('No se pudo obtener la información del registro.');
                return;
            }

            const r = json.data;
            let partes = {};
            try { partes = typeof r.inventario_partes_json === 'string' ? JSON.parse(r.inventario_partes_json) : (r.inventario_partes_json || {}); } catch(e) {}

            const printWin = window.open('', '_blank');
            printWin.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Inventario Físico Estado de Vehículo - ${r.numero_inventario || r.id}</title>
                    <style>
                        @page { size: A4; margin: 8mm; }
                        body { font-family: Arial, sans-serif; font-size: 8.5px; color: #000; margin: 0; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
                        th, td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
                        th { background: #e5e5e5; font-weight: bold; text-align: center; }
                        .text-center { text-align: center; }
                        .fw-bold { font-weight: bold; }
                        .header-table td { border: 2px solid #000; }
                    </style>
                </head>
                <body>
                    <!-- Header -->
                    <table class="header-table" style="margin-bottom: 6px;">
                        <tr>
                            <td style="width: 25%; text-align: center; padding: 5px;">
                                <strong style="font-size: 14px;">${r.empresa || 'MARSISA'}</strong><br><small>TRANSPORTES</small>
                            </td>
                            <td style="width: 55%; text-align: center;">
                                <div style="font-size: 8px;">FORMATO</div>
                                <div style="font-size: 11px; font-weight: bold;">INVENTARIO FÍSICO ESTADO DE VEHÍCULO</div>
                            </td>
                            <td style="width: 20%; font-size: 8px; line-height: 1.3;">
                                <strong>Versión:</strong> 0<br>
                                <strong>Fecha:</strong> ${r.fecha ? r.fecha.slice(0,10) : ''}
                            </td>
                        </tr>
                    </table>

                    <!-- General Info -->
                    <table>
                        <tr>
                            <td style="width: 25%;"><strong>Número de Inventario:</strong></td>
                            <td style="width: 35%;">${r.numero_inventario || r.id}</td>
                            <td style="width: 15%;"><strong>Fecha:</strong></td>
                            <td style="width: 25%;">${r.fecha ? r.fecha.slice(0,10) : ''}</td>
                        </tr>
                        <tr>
                            <td><strong>Motivo:</strong></td>
                            <td colspan="3">${r.motivo || 'ENTREGA DE UNIDAD'}</td>
                        </tr>
                        <tr>
                            <td><strong>Nombre de quien entrega:</strong></td>
                            <td>${r.quien_entrega}</td>
                            <td><strong>Nombre de quien recibe:</strong></td>
                            <td>${r.quien_recibe}</td>
                        </tr>
                    </table>

                    <!-- Vehículo -->
                    <table>
                        <thead>
                            <tr>
                                <th>CLASE</th><th>MARCA</th><th>TIPO</th><th>MODELO</th><th>PLACAS</th><th>COLOR</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="text-center">
                                <td>${r.clase || 'TRACTO'}</td>
                                <td>${r.marca || '---'}</td>
                                <td>${r.tipo || '---'}</td>
                                <td>${r.modelo || '---'}</td>
                                <td class="fw-bold">${r.placa}</td>
                                <td>${r.color || '---'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table>
                        <thead>
                            <tr>
                                <th>NÚMERO DEL MOTOR</th><th>NÚMERO DE SERIE / VIN</th><th>KILOMETRAJE</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="text-center">
                                <td>${r.numero_motor || '---'}</td>
                                <td>${r.numero_serie || '---'}</td>
                                <td class="fw-bold">${parseFloat(r.kilometraje || 0).toLocaleString('es-PE')} km</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Matriz de Partes y Accesorios -->
                    <div style="display: flex; gap: 4px; margin-bottom: 4px;">
                        ${[
                            GRUPOS_SISTEMAS.slice(0, 5),
                            GRUPOS_SISTEMAS.slice(5, 10),
                            GRUPOS_SISTEMAS.slice(10)
                        ].map(colGrupos => `
                            <div style="flex: 1;">
                                <table style="font-size: 7.5px;">
                                    <thead>
                                        <tr>
                                            <th>PARTES Y ACCESORIOS</th>
                                            <th style="width: 20px;">Cant</th>
                                            <th style="width: 35px;">Estado<br>B|R|M</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${colGrupos.map(grp => `
                                            <tr><td colspan="3" style="background:#e5e5e5; font-weight:bold;">${grp.titulo}</td></tr>
                                            ${grp.items.map(it => {
                                                const k = it.toLowerCase().replace(/[^a-z0-9]/g, '_');
                                                const est = partes[k] || '';
                                                return `
                                                    <tr>
                                                        <td>${it}</td>
                                                        <td class="text-center">1</td>
                                                        <td class="text-center fw-bold">${est === 'B' ? '✓' : (est === 'R' ? 'R' : (est === 'M' ? 'X' : ''))}</td>
                                                    </tr>
                                                `;
                                            }).join('')}
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Observaciones -->
                    <div style="border: 1px solid #000; padding: 4px; margin-bottom: 4px;">
                        <strong>OBSERVACIONES:</strong> ${r.observaciones || 'Sin observaciones adicionales registradas al momento de la entrega.'}
                    </div>

                    <!-- Firmas -->
                    <table style="margin-top: 6px;">
                        <tr>
                            <td style="width: 50%; height: 60px; vertical-align: bottom; text-align: center;">
                                ${r.firma_entrega ? `<img src="${r.firma_entrega}" style="max-height: 45px;"><br>` : ''}
                                ____________________________________<br>
                                <strong>Entregado por:</strong> ${r.quien_entrega}
                            </td>
                            <td style="width: 50%; height: 60px; vertical-align: bottom; text-align: center;">
                                ${r.firma_recibe ? `<img src="${r.firma_recibe}" style="max-height: 45px;"><br>` : ''}
                                ____________________________________<br>
                                <strong>Recibido por:</strong> ${r.quien_recibe}
                            </td>
                        </tr>
                    </table>

                    <script>
                        window.onload = function() {
                            window.print();
                        };
                    </script>
                </body>
                </html>
            `);
            printWin.document.close();
        } catch(e) {
            console.error('Error generando PDF:', e);
            alert('Error al generar PDF.');
        }
    };

    if (document.getElementById('moduloEntregaVehiculos')) {
        window.inicializarModuloEntregaVehiculos();
    }
})();
