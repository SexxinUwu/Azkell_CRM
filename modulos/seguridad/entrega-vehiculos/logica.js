// =========================================================================
// MÓDULO FLOTA: CHECKLIST "ENTREGA DE VEHÍCULOS"
// Formato Oficial: Inventario Físico Estado de Vehículo
// Lógica de Negocio + Portal Bento Multi-Empresa + Plantilla Dinámica
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

    // Estructura de Partes y Accesorios agrupada por sistemas (Plantilla por Defecto)
    const GRUPOS_SISTEMAS_DEFAULT = [
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

    let _evGlobalTemplate = null;
    try {
        const saved = localStorage.getItem('ev_global_template_flota') || localStorage.getItem('ev_global_template');
        if (saved) _evGlobalTemplate = JSON.parse(saved);
    } catch(e) {}
    if (!_evGlobalTemplate || !Array.isArray(_evGlobalTemplate) || _evGlobalTemplate.length === 0) {
        _evGlobalTemplate = JSON.parse(JSON.stringify(GRUPOS_SISTEMAS_DEFAULT));
    }

    let _evEditingTemplate = [];

    // Variables de canvas
    let _canvasEntrega, _ctxEntrega, _dibujandoEntrega = false;
    let _canvasRecibe, _ctxRecibe, _dibujandoRecibe = false;

    window.init_flota_entrega_vehiculos = window.init_seguridad_entrega_vehiculos = window.init_entrega_vehiculos = window.inicializarModuloEntregaVehiculos = function() {
        window.evActualizarUsuarioActual();
        window.evIrAPortal();
        window.evRenderizarSistemas();
        window.evCargarRecursos();
        window.evCargarPortalStats();
        window.evInitCanvasFirmas();
    };

    window.evActualizarUsuarioActual = function() {
        const lsUser = localStorage.getItem('fleet_user') || 'Supervisor de Flota';
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

    // ── GESTIÓN DE VISTAS (Portal -> Lista -> Formulario -> Plantilla) ───────────
    window.evShowView = function(viewName) {
        ['portal', 'list', 'form', 'settings'].forEach(v => {
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

    window.evNav = function(viewName) {
        window.evShowView(viewName);
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

    // ── CONSTRUCTOR DINÁMICO DE PLANTILLA (FULL SCREEN) ────────────
    window.evAbrirPlantilla = function() {
        _evEditingTemplate = JSON.parse(JSON.stringify(_evGlobalTemplate));
        window.evShowView('settings');
        window.evRenderizarSettings();
    };

    window.evRenderizarSettings = function() {
        const c = document.getElementById('ev-settings-container');
        if (!c) return;

        if (!_evEditingTemplate.length) {
            c.innerHTML = '<div class="text-center py-5 text-muted bg-white rounded-4 border"><i class="bi bi-grid fs-2 d-block mb-2 text-secondary"></i>No hay categorías. Crea una nueva haciendo clic en "+ Añadir Nueva Categoría".</div>';
            return;
        }

        let html = '';
        _evEditingTemplate.forEach((cat, index) => {
            html += `
                <div class="ev-form-card mb-3">
                    <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                        <div class="d-flex align-items-center gap-2 flex-grow-1 me-2">
                            <span class="badge rounded-circle d-flex align-items-center justify-content-center" style="width:28px;height:28px;background:#0284c7;color:#fff;font-size:0.85rem;font-weight:700;">${index + 1}</span>
                            <input type="text" class="ev-form-input-clean fw-bold text-dark border-0 bg-transparent p-0" 
                                style="font-size:1rem; font-weight:800; box-shadow:none;" 
                                value="${(cat.titulo || cat.title || '').replace(/"/g, '&quot;')}" 
                                oninput="window.evUpdateSettingsCatTitle('${cat.id}', this.value)" 
                                placeholder="Nombre de Categoría">
                        </div>
                        <button class="btn btn-sm btn-outline-danger" onclick="window.evDelSettingsCat('${cat.id}')" title="Eliminar Categoría" style="border-radius:8px;">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
            `;

            (cat.items || []).forEach((item, itemIdx) => {
                const itemLabel = typeof item === 'string' ? item : (item.label || item.texto || '');
                html += `
                    <div class="d-flex align-items-center justify-content-between gap-2 mb-2 ps-2 ps-md-3 flex-wrap flex-sm-nowrap">
                        <i class="bi bi-dot fs-4 text-secondary d-none d-sm-inline"></i>
                        <input type="text" class="form-control form-control-sm flex-grow-1" 
                            style="font-size:0.88rem; font-weight:600; border:1px solid #e2e8f0; border-radius:10px; padding:0.5rem 0.8rem; background:#f8fafc;" 
                            value="${itemLabel.replace(/"/g, '&quot;')}" 
                            oninput="window.evUpdateSettingsItemLabel('${cat.id}', ${itemIdx}, this.value)" 
                            placeholder="Nombre de Subcategoría / Ítem">
                        <button class="btn btn-sm btn-light text-secondary border" onclick="window.evDelSettingsItem('${cat.id}', ${itemIdx})" title="Eliminar ítem" style="border-radius:8px; padding:0.4rem 0.65rem;">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                `;
            });

            html += `
                    <button class="btn btn-sm btn-light border w-100 mt-2 fw-semibold text-secondary" onclick="window.evAddSettingsItem('${cat.id}')" style="border-radius:10px; padding:0.6rem;">
                        <i class="bi bi-plus-lg me-1"></i> Añadir Subcategoría
                    </button>
                </div>
            `;
        });

        c.innerHTML = html;
    };

    window.evUpdateSettingsCatTitle = function(catId, val) {
        const cat = _evEditingTemplate.find(c => c.id === catId);
        if (cat) cat.titulo = val;
    };

    window.evUpdateSettingsItemLabel = function(catId, itemIdx, val) {
        const cat = _evEditingTemplate.find(c => c.id === catId);
        if (!cat || !cat.items) return;
        if (typeof cat.items[itemIdx] === 'string') {
            cat.items[itemIdx] = val;
        } else if (cat.items[itemIdx]) {
            cat.items[itemIdx].label = val;
        }
    };

    window.evAddSettingsCat = function() {
        _evEditingTemplate.push({
            id: 'cat_' + Date.now(),
            titulo: 'Nueva Categoría',
            icon: 'bi-card-checklist',
            items: []
        });
        window.evRenderizarSettings();
    };

    window.evDelSettingsCat = function(catId) {
        if (!confirm('¿Eliminar esta categoría completa y todos sus ítems?')) return;
        _evEditingTemplate = _evEditingTemplate.filter(c => c.id !== catId);
        window.evRenderizarSettings();
    };

    window.evAddSettingsItem = function(catId) {
        const cat = _evEditingTemplate.find(c => c.id === catId);
        if (!cat) return;
        cat.items = cat.items || [];
        cat.items.push('Nuevo Ítem de Revisión');
        window.evRenderizarSettings();
    };

    window.evDelSettingsItem = function(catId, itemIdx) {
        const cat = _evEditingTemplate.find(c => c.id === catId);
        if (!cat || !cat.items) return;
        cat.items.splice(itemIdx, 1);
        window.evRenderizarSettings();
    };

    window.evRestaurarConfigPlantilla = function() {
        if (!confirm('¿Deseas restablecer la plantilla a las categorías originales de fábrica?')) return;
        _evEditingTemplate = JSON.parse(JSON.stringify(GRUPOS_SISTEMAS_DEFAULT));
        window.evRenderizarSettings();
    };

    window.evGuardarSettings = function() {
        _evGlobalTemplate = JSON.parse(JSON.stringify(_evEditingTemplate));
        try {
            localStorage.setItem('ev_global_template_flota', JSON.stringify(_evGlobalTemplate));
        } catch(e) {}
        window.evRenderizarSistemas();
        window.evShowView('list');
        alert('✅ Plantilla de Entrega de Vehículos guardada exitosamente.');
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
            const res = await fetch('/api/seguridad/entrega-vehiculos/stats');
            const data = await res.json();
            const empresas = (data && data.empresas) || [];
            const global = (data && data.global) || { total_flota: 0, total_actas: 0, hoy: 0 };

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
                                    <div class="fw-bold text-primary" style="font-size:1.1rem;">${emp.total_actas || 0}</div>
                                    <span class="text-muted" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">Actas</span>
                                </div>
                                <div class="text-center flex-fill border-end">
                                    <div class="fw-bold text-success" style="font-size:1.1rem;">${emp.hoy || 0}</div>
                                    <span class="text-muted" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">Hoy</span>
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
                                <div class="fw-bold text-primary" style="font-size:1.1rem;">${global.total_actas || 0}</div>
                                <span class="text-muted" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">Actas</span>
                            </div>
                            <div class="text-center flex-fill border-end">
                                <div class="fw-bold text-success" style="font-size:1.1rem;">${global.hoy || 0}</div>
                                <span class="text-muted" style="font-size:0.65rem; font-weight:700; text-transform:uppercase;">Hoy</span>
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

    function _evEsAdmin() {
        const ADMIN_ROLES = ['administrador', 'admin', 'sistema', 'master', 'fundador', 'superadmin'];
        try {
            if (typeof rolLogueado !== 'undefined' && rolLogueado) {
                if (ADMIN_ROLES.includes(String(rolLogueado).toLowerCase().trim())) return true;
            }
            if (typeof userRole !== 'undefined' && userRole) {
                if (ADMIN_ROLES.includes(String(userRole).toLowerCase().trim())) return true;
            }
        } catch(e) {}

        const keys = ['fleet_role', 'fleet_rol', 'user_role', 'user_rol', 'role', 'rol', 'fleet_perfil', 'perfil'];
        for (const k of keys) {
            const v = (localStorage.getItem(k) || sessionStorage.getItem(k) || '').toLowerCase().trim();
            if (v && ADMIN_ROLES.some(r => v.includes(r))) return true;
        }

        try {
            const userObj = JSON.parse(localStorage.getItem('fleet_user_data') || localStorage.getItem('fleet_user_obj') || '{}');
            if (userObj && (userObj.es_admin || (userObj.rol && ADMIN_ROLES.includes(String(userObj.rol).toLowerCase())))) return true;
        } catch(e) {}

        const adminBadge = document.querySelector('.badge.bg-warning, .badge-warning, #p-cargo-head, [class*="admin"]');
        if (adminBadge && adminBadge.textContent.toLowerCase().includes('administrador')) return true;

        return false;
    }

    window.evRenderizarTabla = function(data) {
        const tbody = document.getElementById('ev-list-tbody');
        const count = document.getElementById('ev-lbl-tabla-count');
        if (!tbody) return;

        if (count) count.textContent = `${data.length} actas registradas`;

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2"></i>No hay actas de entrega registradas para ${window._evEmpresaActiva}. Haz clic en "Registrar Entrega".</td></tr>`;
            return;
        }

        const esAdmin = _evEsAdmin();

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
                        <div class="ev-btn-action-group">
                            <button type="button" class="ev-btn-action ev-btn-act-view" onclick="window.evVerDetalle('${r.id}')" title="Ver Detalle">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button type="button" class="ev-btn-action ev-btn-act-edit" onclick="window.evEditarRegistro('${r.id}')" title="Editar Acta">
                                <i class="bi bi-pencil-square"></i>
                            </button>
                            <button type="button" class="ev-btn-action ev-btn-act-pdf" onclick="window.evImprimirPDF('${r.id}')" title="Imprimir Acta PDF">
                                <i class="bi bi-file-earmark-pdf-fill me-1"></i> PDF
                            </button>
                            <button type="button" class="ev-btn-action ev-btn-act-wa" onclick="window.evCompartirWhatsApp('${r.id}')" title="Enviar directamente por WhatsApp">
                                <i class="bi bi-whatsapp"></i>
                            </button>
                            ${esAdmin ? `
                                <button type="button" class="ev-btn-action ev-btn-act-del" onclick="window.evEliminarRegistro('${r.id}', '${r.numero_inventario || r.id}')" title="Eliminar Registro (Solo Administrador)">
                                    <i class="bi bi-trash3-fill"></i>
                                </button>
                            ` : ''}
                        </div>
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

    // ── ELIMINAR REGISTRO (SOLO ADMINISTRADOR CON MODAL CIRCULAR) ─
    window._evIdEliminarPendiente = null;

    window.evEliminarRegistro = function(id, folio) {
        if (!_evEsAdmin()) {
            alert('⛔ Acceso denegado: Solo los usuarios con rol de Administrador pueden eliminar actas de entrega.');
            return;
        }

        window._evIdEliminarPendiente = id;
        const modalEl = document.getElementById('ev-delete-modal');
        if (modalEl && typeof bootstrap !== 'undefined') {
            const modalInst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            modalInst.show();
        } else if (confirm(`¿Eliminar el acta ${folio}? Esta acción no se puede deshacer.`)) {
            window.evEjecutarEliminacionConfirmada();
        }
    };

    window.evEjecutarEliminacionConfirmada = async function() {
        const id = window._evIdEliminarPendiente;
        if (!id) return;

        const modalEl = document.getElementById('ev-delete-modal');
        if (modalEl && typeof bootstrap !== 'undefined') {
            const modalInst = bootstrap.Modal.getInstance(modalEl);
            if (modalInst) modalInst.hide();
        }

        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const res = await fetch(`/api/seguridad/entrega-vehiculos/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });
            const json = await res.json();
            if (json.ok) {
                window.evCargarDatos();
            } else {
                alert('Error al eliminar: ' + (json.error || 'Ocurrió un problema'));
            }
        } catch(e) {
            console.error('Error al eliminar entrega:', e);
            alert('Error de conexión al servidor.');
        } finally {
            window._evIdEliminarPendiente = null;
        }
    };

    // ── VER DETALLE Y EDITAR REGISTRO ──────────────────────────────
    window.evVerDetalle = async function(id) {
        await window.evCargarRegistroEnFormulario(id, true);
    };

    window.evEditarRegistro = async function(id) {
        await window.evCargarRegistroEnFormulario(id, false);
    };

    window.evCargarRegistroEnFormulario = async function(id, esSoloLectura) {
        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const res = await fetch(`/api/seguridad/entrega-vehiculos/${encodeURIComponent(id)}`, {
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            const json = await res.json();
            if (!json.ok || !json.data) {
                alert('No se pudo cargar el registro.');
                return;
            }

            const r = json.data;
            window.evShowView('form');

            const editIdEl = document.getElementById('ev-f-edit-id');
            const titleEl = document.getElementById('ev-form-header-titulo');
            const folioSubEl = document.getElementById('ev-form-header-folio');
            const btnGuardarTxt = document.getElementById('ev-btn-guardar-txt');

            if (editIdEl) editIdEl.value = esSoloLectura ? '' : r.id;
            if (titleEl) titleEl.textContent = esSoloLectura ? `Detalle de Entrega: ${r.numero_inventario || r.id}` : `Editar Entrega: ${r.numero_inventario || r.id}`;
            if (folioSubEl) folioSubEl.textContent = `Placa: ${r.placa} • Conductor: ${r.quien_recibe}`;
            if (btnGuardarTxt) btnGuardarTxt.textContent = esSoloLectura ? 'Generar PDF' : 'Actualizar y Generar PDF';

            const setVal = (fid, val) => {
                const el = document.getElementById(fid);
                if (el) el.value = val !== undefined && val !== null ? val : '';
            };

            setVal('ev-f-nro-inv', r.numero_inventario || r.id);
            setVal('ev-f-fecha', r.fecha ? r.fecha.slice(0, 10) : '');
            setVal('ev-f-motivo', r.motivo || 'ENTREGA DE UNIDAD');
            setVal('ev-f-entrega', r.quien_entrega);
            setVal('ev-f-recibe', r.quien_recibe);
            setVal('ev-f-placa', r.placa);
            setVal('ev-f-clase', r.clase || r.tipo || 'TRACTO');
            setVal('ev-f-marca', r.marca);
            setVal('ev-f-modelo', r.modelo);
            setVal('ev-f-color', r.color);
            setVal('ev-f-motor', r.numero_motor);
            setVal('ev-f-serie', r.numero_serie);
            setVal('ev-f-km', r.kilometraje || 0);
            setVal('ev-f-obs', r.observaciones);

            // Partes y Estados
            let partes = {};
            try { partes = typeof r.inventario_partes_json === 'string' ? JSON.parse(r.inventario_partes_json) : (r.inventario_partes_json || {}); } catch(e) {}
            window._evItemsStates = partes || {};

            window.evRenderizarSistemas();
            Object.keys(window._evItemsStates).forEach(k => {
                const st = window._evItemsStates[k];
                const pill = document.getElementById(`ev-pill-${k}-${st.toLowerCase()}`);
                if (pill) pill.classList.add(`active-${st.toLowerCase()}`);
            });

            // Configuración y Diagrama
            const config = (r.configuracion || (r.tipo && r.tipo.includes('CARRETA') ? 'R2' : 'T3')).toUpperCase();
            window._evCurrentConfiguracion = config;
            window.evRenderizarCroquis(config);
            window.evSyncNombresFirmas();

            // Cargar firmas si existen
            if (_canvasEntrega && r.firma_entrega) {
                const img = new Image();
                img.onload = () => { _ctxEntrega = _canvasEntrega.getContext('2d'); _ctxEntrega.clearRect(0,0,_canvasEntrega.width,_canvasEntrega.height); _ctxEntrega.drawImage(img, 0, 0); };
                img.src = r.firma_entrega;
            }
            if (_canvasRecibe && r.firma_recibe) {
                const img2 = new Image();
                img2.onload = () => { _ctxRecibe = _canvasRecibe.getContext('2d'); _ctxRecibe.clearRect(0,0,_canvasRecibe.width,_canvasRecibe.height); _ctxRecibe.drawImage(img2, 0, 0); };
                img2.src = r.firma_recibe;
            }

        } catch(e) {
            console.error('Error cargando detalle:', e);
        }
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
        const lsUser = localStorage.getItem('fleet_user') || 'Supervisor de Flota';
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

    // ── MOTOR DE DIBUJO VECTORIAL 2D PARAMÉTRICO SEGÚN CONFIGURACIÓN (T3, T2, C3, C2, S3, S2, R2) ──
    window._evCabinaEstilo = 'chata'; // 'chata' o 'trompa'
    window._evCarroceriaEstilo = 'furgon'; // 'furgon' o 'plataforma'

    window.evSetCabEstilo = function(estilo) {
        window._evCabinaEstilo = estilo;
        const btnC = document.getElementById('ev-btn-cab-chata');
        const btnT = document.getElementById('ev-btn-cab-trompa');
        if (btnC && btnT) {
            if (estilo === 'chata') {
                btnC.className = 'btn btn-sm btn-light border fw-bold text-dark shadow-xs';
                btnT.className = 'btn btn-sm text-secondary fw-semibold';
            } else {
                btnT.className = 'btn btn-sm btn-light border fw-bold text-dark shadow-xs';
                btnC.className = 'btn btn-sm text-secondary fw-semibold';
            }
        }
        window.evRenderizarCroquis(window._evCurrentConfiguracion);
    };

    window.evSetBodyEstilo = function(estilo) {
        window._evCarroceriaEstilo = estilo;
        const btnF = document.getElementById('ev-btn-body-furgon');
        const btnP = document.getElementById('ev-btn-body-plat');
        if (btnF && btnP) {
            if (estilo === 'furgon') {
                btnF.className = 'btn btn-sm btn-light border fw-bold text-dark shadow-xs';
                btnP.className = 'btn btn-sm text-secondary fw-semibold';
            } else {
                btnP.className = 'btn btn-sm btn-light border fw-bold text-dark shadow-xs';
                btnF.className = 'btn btn-sm text-secondary fw-semibold';
            }
        }
        window.evRenderizarCroquis(window._evCurrentConfiguracion);
    };

    window.evRenderizarCroquis = function(configStr) {
        const cont = document.getElementById('ev-croquis-svg-container');
        const tag = document.getElementById('ev-lbl-config-tag');
        const sub = document.getElementById('ev-lbl-config-sub');
        const cabCtrl = document.getElementById('ev-ctrl-cabina');
        const bodyCtrl = document.getElementById('ev-ctrl-body');
        if (!cont) return;

        let code = (configStr || 'T3').toUpperCase().trim();
        // Normalizaciones comunes
        if (code === '6X4' || code === '6X2' || code.includes('T3')) code = 'T3';
        else if (code === '4X2' || code.includes('T2')) code = 'T2';
        else if (code.includes('C3') || code.includes('VOLQUETE')) code = 'C3';
        else if (code.includes('C2')) code = 'C2';
        else if (code.includes('S3') || code.includes('SE3') || code.includes('3 EJES')) code = 'S3';
        else if (code.includes('S2') || code.includes('SE2') || code.includes('2 EJES')) code = 'S2';
        else if (code.includes('R2') || code.includes('REMOLQUE') || code.includes('CARRETA')) code = 'R2';
        else code = 'T3';

        window._evCurrentConfiguracion = code;

        const isChata = window._evCabinaEstilo === 'chata';
        const isFurgon = window._evCarroceriaEstilo === 'furgon';

        const specs = {
            'T3': { nombre: 'Tractocamión T3 (6x4 / 6x2)', desc: 'Tractocamión de 3 Ejes (1 Direccional + Tándem Trasero) con Quinta Rueda', esMotor: true, tieneCarroceria: false },
            'T2': { nombre: 'Tractocamión T2 (4x2)', desc: 'Tractocamión de 2 Ejes (1 Direccional + 1 Motriz Trasero) con Quinta Rueda', esMotor: true, tieneCarroceria: false },
            'C3': { nombre: 'Camión Rígido C3 (6x4 / 6x2)', desc: 'Camión Rígido de 3 Ejes con Carrocería Integrada', esMotor: true, tieneCarroceria: true },
            'C2': { nombre: 'Camión Rígido C2 (4x2)', desc: 'Camión Rígido de 2 Ejes para Distribución', esMotor: true, tieneCarroceria: true },
            'S3': { nombre: 'Semirremolque S3 (3 Ejes Trídem)', desc: 'Semirremolque de 3 Ejes (Trídem) con Perno Rey y Patas de Apoyo', esMotor: false, tieneCarroceria: true },
            'S2': { nombre: 'Semirremolque S2 (2 Ejes Tándem)', desc: 'Semirremolque de 2 Ejes (Tándem) con Perno Rey y Patas de Apoyo', esMotor: false, tieneCarroceria: true },
            'R2': { nombre: 'Remolque R2 (2 Ejes con Lanza)', desc: 'Remolque Equilibrado de 2 Ejes con Barra de Tiro (Lanza) y Tornamesa', esMotor: false, tieneCarroceria: true }
        };

        const currentSpec = specs[code] || specs['T3'];
        if (tag) tag.textContent = `CONFIGURACIÓN: ${code}`;
        if (sub) sub.textContent = currentSpec.desc;

        if (cabCtrl) cabCtrl.style.display = currentSpec.esMotor ? 'flex' : 'none';
        if (bodyCtrl) bodyCtrl.style.display = currentSpec.tieneCarroceria ? 'flex' : 'none';

        // Estructura Vectorial Completa
        let svgHtml = `
            <svg viewBox="0 0 920 340" style="width: 100%; max-width: 820px; height: auto; display: block; margin: 0 auto;" class="select-none">
                <defs>
                    <linearGradient id="evChassisGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#475569" />
                        <stop offset="100%" stop-color="#1e293b" />
                    </linearGradient>
                    <linearGradient id="evCabGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#ffffff" />
                        <stop offset="60%" stop-color="#f8fafc" />
                        <stop offset="100%" stop-color="#e2e8f0" />
                    </linearGradient>
                    <linearGradient id="evGlassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#bae6fd" />
                        <stop offset="100%" stop-color="#38bdf8" />
                    </linearGradient>
                    <linearGradient id="evFuelGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#cbd5e1" />
                        <stop offset="50%" stop-color="#94a3b8" />
                        <stop offset="100%" stop-color="#64748b" />
                    </linearGradient>
                    <linearGradient id="evTireGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#334155" />
                        <stop offset="100%" stop-color="#0f172a" />
                    </linearGradient>
                    <linearGradient id="evBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#ffffff" />
                        <stop offset="70%" stop-color="#f1f5f9" />
                        <stop offset="100%" stop-color="#e2e8f0" />
                    </linearGradient>
                </defs>

                <!-- LÍNEA DE SUELO / ASFALTO -->
                <line x1="40" y1="295" x2="880" y2="295" stroke="#cbd5e1" stroke-width="2.5" stroke-dasharray="8 6" />
        `;

        if (code === 'T3') {
            svgHtml += _evRenderTracto(3, isChata);
        } else if (code === 'T2') {
            svgHtml += _evRenderTracto(2, isChata);
        } else if (code === 'C3') {
            svgHtml += _evRenderCamionRigido(3, isChata, isFurgon);
        } else if (code === 'C2') {
            svgHtml += _evRenderCamionRigido(2, isChata, isFurgon);
        } else if (code === 'S3') {
            svgHtml += _evRenderSemirremolque(3, isFurgon);
        } else if (code === 'S2') {
            svgHtml += _evRenderSemirremolque(2, isFurgon);
        } else if (code === 'R2') {
            svgHtml += _evRenderRemolqueR2(isFurgon);
        }

        svgHtml += `</svg>`;
        cont.innerHTML = svgHtml;
    };

    function _evRenderWheel(cx, cy, label) {
        return `
            <g>
                <circle cx="${cx}" cy="${cy}" r="43" fill="url(#evTireGrad)" stroke="#020617" stroke-width="2.8" />
                <circle cx="${cx}" cy="${cy}" r="37" fill="none" stroke="#475569" stroke-width="1.5" stroke-dasharray="4 3" />
                <circle cx="${cx}" cy="${cy}" r="26" fill="#f1f5f9" stroke="#64748b" stroke-width="2" />
                <circle cx="${cx}" cy="${cy}" r="20" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5" />
                <circle cx="${cx}" cy="${cy}" r="9" fill="#1e293b" />
                <circle cx="${cx - 13}" cy="${cy}" r="2.2" fill="#475569" />
                <circle cx="${cx + 13}" cy="${cy}" r="2.2" fill="#475569" />
                <circle cx="${cx}" cy="${cy - 13}" r="2.2" fill="#475569" />
                <circle cx="${cx}" cy="${cy + 13}" r="2.2" fill="#475569" />
                <circle cx="${cx - 9}" cy="${cy - 9}" r="2.2" fill="#475569" />
                <circle cx="${cx + 9}" cy="${cy + 9}" r="2.2" fill="#475569" />
                <circle cx="${cx - 9}" cy="${cy + 9}" r="2.2" fill="#475569" />
                <circle cx="${cx + 9}" cy="${cy - 9}" r="2.2" fill="#475569" />
                <circle cx="${cx}" cy="${cy}" r="3.5" fill="#94a3b8" stroke="#334155" stroke-width="1"/>
                <text x="${cx}" y="${cy + 58}" font-size="9.5" font-weight="700" fill="#475569" text-anchor="middle" font-family="'Inter', sans-serif">${label}</text>
            </g>
        `;
    }

    function _evRenderCabinaChata(startX) {
        return `
            <g id="cabinaChata">
                <path d="M ${startX} 245 L ${startX} 125 Q ${startX + 2} 80 ${startX + 40} 76 L ${startX + 165} 76 Q ${startX + 180} 80 ${startX + 185} 92 L ${startX + 185} 245 Z" fill="url(#evCabGrad)" stroke="#1e293b" stroke-width="2.5" />
                <path d="M ${startX + 35} 76 Q ${startX + 95} 60 ${startX + 190} 62 L ${startX + 185} 78 Z" fill="#cbd5e1" stroke="#334155" stroke-width="1.5"/>
                <path d="M ${startX + 8} 128 L ${startX + 8} 110 Q ${startX + 12} 90 ${startX + 40} 88 L ${startX + 78} 88 L ${startX + 78} 135 Z" fill="url(#evGlassGrad)" stroke="#0284c7" stroke-width="1.8" />
                <path d="M ${startX + 85} 88 L ${startX + 152} 88 Q ${startX + 158} 88 ${startX + 158} 96 L ${startX + 158} 138 L ${startX + 85} 138 Z" fill="url(#evGlassGrad)" stroke="#0284c7" stroke-width="1.8" />
                <rect x="${startX - 6}" y="105" width="7" height="38" rx="2.5" fill="#0f172a" />
                <line x1="${startX + 1}" y1="112" x2="${startX + 10}" y2="112" stroke="#0f172a" stroke-width="2" />
                <line x1="${startX + 1}" y1="130" x2="${startX + 10}" y2="130" stroke="#0f172a" stroke-width="2" />
                <rect x="${startX + 88}" y="148" width="12" height="3.5" rx="1.5" fill="#0f172a" />
                <rect x="${startX - 2}" y="165" width="8" height="42" fill="#334155" />
                <polygon points="${startX - 1},210 ${startX + 8},210 ${startX + 8},228 ${startX - 1},228" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5" />
                <path d="M ${startX - 4} 225 L ${startX + 12} 225 L ${startX + 12} 248 L ${startX - 2} 248 Z" fill="#1e293b" stroke="#0f172a" stroke-width="2" />
                <path d="M ${startX + 12} 238 A 52 52 0 0 1 ${startX + 120} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            </g>
        `;
    }

    function _evRenderCabinaTrompa(startX) {
        return `
            <g id="cabinaTrompa">
                <path d="M ${startX} 235 L ${startX} 175 Q ${startX + 2} 158 ${startX + 22} 158 L ${startX + 110} 158 L ${startX + 110} 235 Z" fill="url(#evCabGrad)" stroke="#1e293b" stroke-width="2.5"/>
                <path d="M ${startX + 110} 158 L ${startX + 110} 95 Q ${startX + 112} 80 ${startX + 130} 78 L ${startX + 220} 78 L ${startX + 220} 235 L ${startX + 110} 235 Z" fill="url(#evCabGrad)" stroke="#1e293b" stroke-width="2.5"/>
                <rect x="${startX + 222}" y="52" width="7" height="145" rx="3" fill="#cbd5e1" stroke="#475569" stroke-width="1.5" />
                <path d="M ${startX + 222} 52 Q ${startX + 225} 38 ${startX + 238} 40" fill="none" stroke="#cbd5e1" stroke-width="4.5" stroke-linecap="round"/>
                <polygon points="${startX + 112},150 ${startX + 112},98 ${startX + 144},92 ${startX + 144},150" fill="url(#evGlassGrad)" stroke="#0284c7" stroke-width="1.8" />
                <rect x="${startX + 150}" y="95" width="52" height="40" rx="3" fill="url(#evGlassGrad)" stroke="#0284c7" stroke-width="1.8" />
                <rect x="${startX - 4}" y="162" width="7" height="58" rx="2" fill="#94a3b8" stroke="#1e293b" stroke-width="2"/>
                <circle cx="${startX + 15}" cy="195" r="7.5" fill="#fef08a" stroke="#ca8a04" stroke-width="1.8" />
                <path d="M ${startX + 70} 238 A 52 52 0 0 1 ${startX + 180} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            </g>
        `;
    }

    function _evRenderTracto(numEjes, isChata) {
        const startX = 140;
        let cabHtml = isChata ? _evRenderCabinaChata(startX) : _evRenderCabinaTrompa(startX);
        const chassisLen = numEjes === 3 ? 560 : 440;

        let out = `
            <g id="tractoT">
                <rect x="${startX + 20}" y="235" width="${chassisLen}" height="20" rx="3" fill="url(#evChassisGrad)" stroke="#0f172a" stroke-width="2"/>
                <rect x="${startX + 195}" y="222" width="130" height="28" rx="5" fill="url(#evFuelGrad)" stroke="#334155" stroke-width="1.8"/>
                <rect x="${startX + 215}" y="220" width="4" height="32" fill="#334155"/>
                <rect x="${startX + 295}" y="220" width="4" height="32" fill="#334155"/>
                <polygon points="${startX + chassisLen - 80},235 ${startX + chassisLen - 45},220 ${startX + chassisLen - 20},220 ${startX + chassisLen + 10},235" fill="#0f172a" stroke="#475569" stroke-width="1.5" />
                <line x1="${startX + chassisLen - 40}" y1="219" x2="${startX + chassisLen - 15}" y2="219" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                <text x="${startX + chassisLen - 30}" y="210" font-size="8.5" font-weight="800" fill="#0284c7" text-anchor="middle" font-family="'Inter', sans-serif">5TA RUEDA</text>
                ${cabHtml}
                ${_evRenderWheel(startX + 65, 252, 'EJE 1 (DIR)')}
        `;

        if (numEjes === 3) {
            out += `
                <path d="M ${startX + chassisLen - 160} 238 A 52 52 0 0 1 ${startX + chassisLen - 50} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                <path d="M ${startX + chassisLen - 55} 238 A 52 52 0 0 1 ${startX + chassisLen + 55} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                ${_evRenderWheel(startX + chassisLen - 105, 252, 'EJE 2 (TRAC)')}
                ${_evRenderWheel(startX + chassisLen, 252, 'EJE 3 (TRAC)')}
            `;
        } else {
            out += `
                <path d="M ${startX + chassisLen - 60} 238 A 52 52 0 0 1 ${startX + chassisLen + 50} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                ${_evRenderWheel(startX + chassisLen - 5, 252, 'EJE 2 (TRAC)')}
            `;
        }

        out += `</g>`;
        return out;
    }

    function _evRenderCamionRigido(numEjes, isChata, isFurgon) {
        const startX = 120;
        let cabHtml = isChata ? _evRenderCabinaChata(startX) : _evRenderCabinaTrompa(startX);
        const bodyStart = isChata ? startX + 190 : startX + 225;
        const bodyWidth = 530;
        const totalLen = bodyStart + bodyWidth - startX;

        let bodyHtml = '';
        if (isFurgon) {
            bodyHtml = `
                <g id="bodyFurgon">
                    <rect x="${bodyStart}" y="70" width="${bodyWidth}" height="165" rx="5" fill="url(#evBodyGrad)" stroke="#1e293b" stroke-width="2.5" />
                    <line x1="${bodyStart + 130}" y1="70" x2="${bodyStart + 130}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                    <line x1="${bodyStart + 265}" y1="70" x2="${bodyStart + 265}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                    <line x1="${bodyStart + 400}" y1="70" x2="${bodyStart + 400}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                    <rect x="${bodyStart + bodyWidth - 12}" y="115" width="6" height="45" rx="2" fill="#0f172a" />
                    <rect x="${bodyStart + 15}" y="75" width="4" height="4" fill="#f59e0b" />
                    <rect x="${bodyStart + bodyWidth - 18}" y="75" width="4" height="4" fill="#ef4444" />
                </g>
            `;
        } else {
            bodyHtml = `
                <g id="bodyPlataforma">
                    <rect x="${bodyStart}" y="200" width="${bodyWidth}" height="35" rx="3" fill="#f8fafc" stroke="#1e293b" stroke-width="2" />
                    <line x1="${bodyStart}" y1="140" x2="${bodyStart + bodyWidth}" y2="140" stroke="#334155" stroke-width="3" />
                    <line x1="${bodyStart}" y1="170" x2="${bodyStart + bodyWidth}" y2="170" stroke="#334155" stroke-width="3" />
                    <line x1="${bodyStart + 40}" y1="140" x2="${bodyStart + 40}" y2="200" stroke="#334155" stroke-width="3" />
                    <line x1="${bodyStart + 180}" y1="140" x2="${bodyStart + 180}" y2="200" stroke="#334155" stroke-width="3" />
                    <line x1="${bodyStart + 320}" y1="140" x2="${bodyStart + 320}" y2="200" stroke="#334155" stroke-width="3" />
                    <line x1="${bodyStart + 460}" y1="140" x2="${bodyStart + 460}" y2="200" stroke="#334155" stroke-width="3" />
                </g>
            `;
        }

        let out = `
            <g id="camionRigido">
                <rect x="${startX + 20}" y="235" width="${totalLen - 20}" height="20" rx="3" fill="url(#evChassisGrad)" stroke="#0f172a" stroke-width="2"/>
                <rect x="${startX + 185}" y="222" width="110" height="28" rx="5" fill="url(#evFuelGrad)" stroke="#334155" stroke-width="1.8"/>
                ${bodyHtml}
                ${cabHtml}
                ${_evRenderWheel(startX + 65, 252, 'EJE 1 (DIR)')}
        `;

        if (numEjes === 3) {
            out += `
                <path d="M ${bodyStart + bodyWidth - 170} 238 A 52 52 0 0 1 ${bodyStart + bodyWidth - 60} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                <path d="M ${bodyStart + bodyWidth - 65} 238 A 52 52 0 0 1 ${bodyStart + bodyWidth + 45} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                ${_evRenderWheel(bodyStart + bodyWidth - 115, 252, 'EJE 2 (TRAC)')}
                ${_evRenderWheel(bodyStart + bodyWidth - 10, 252, 'EJE 3 (TRAC)')}
            `;
        } else {
            out += `
                <path d="M ${bodyStart + bodyWidth - 90} 238 A 52 52 0 0 1 ${bodyStart + bodyWidth + 20} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                ${_evRenderWheel(bodyStart + bodyWidth - 35, 252, 'EJE 2 (TRAC)')}
            `;
        }

        out += `</g>`;
        return out;
    }

    function _evRenderSemirremolque(numEjes, isFurgon) {
        const startX = 110;
        const bodyWidth = 700;

        let bodyHtml = '';
        if (isFurgon) {
            bodyHtml = `
                <g id="bodySemiFurgon">
                    <rect x="${startX}" y="60" width="${bodyWidth}" height="175" rx="6" fill="url(#evBodyGrad)" stroke="#1e293b" stroke-width="2.5" />
                    <line x1="${startX + 140}" y1="60" x2="${startX + 140}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                    <line x1="${startX + 280}" y1="60" x2="${startX + 280}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                    <line x1="${startX + 420}" y1="60" x2="${startX + 420}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                    <line x1="${startX + 560}" y1="60" x2="${startX + 560}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                    <rect x="${startX + 15}" y="65" width="5" height="5" fill="#f59e0b" />
                    <rect x="${startX + bodyWidth - 18}" y="65" width="5" height="5" fill="#ef4444" />
                </g>
            `;
        } else {
            bodyHtml = `
                <g id="bodySemiPlataforma">
                    <rect x="${startX}" y="195" width="${bodyWidth}" height="40" rx="3" fill="#f8fafc" stroke="#1e293b" stroke-width="2.2" />
                    <line x1="${startX}" y1="130" x2="${startX + bodyWidth}" y2="130" stroke="#334155" stroke-width="3" />
                    <line x1="${startX}" y1="162" x2="${startX + bodyWidth}" y2="162" stroke="#334155" stroke-width="3" />
                    <line x1="${startX + 40}" y1="130" x2="${startX + 40}" y2="195" stroke="#334155" stroke-width="3" />
                    <line x1="${startX + 180}" y1="130" x2="${startX + 180}" y2="195" stroke="#334155" stroke-width="3" />
                    <line x1="${startX + 320}" y1="130" x2="${startX + 320}" y2="195" stroke="#334155" stroke-width="3" />
                    <line x1="${startX + 460}" y1="130" x2="${startX + 460}" y2="195" stroke="#334155" stroke-width="3" />
                    <line x1="${startX + 600}" y1="130" x2="${startX + 600}" y2="195" stroke="#334155" stroke-width="3" />
                </g>
            `;
        }

        let out = `
            <g id="semirremolqueS">
                ${bodyHtml}
                <line x1="${startX + 55}" y1="235" x2="${startX + 55}" y2="252" stroke="#0284c7" stroke-width="5" stroke-linecap="round"/>
                <circle cx="${startX + 55}" cy="254" r="5" fill="#0284c7" />
                <text x="${startX + 55}" y="270" font-size="8.5" font-weight="800" fill="#0284c7" text-anchor="middle" font-family="'Inter', sans-serif">KING PIN</text>

                <!-- Patas de apoyo -->
                <rect x="${startX + 150}" y="235" width="10" height="52" fill="#334155" stroke="#0f172a" stroke-width="1.5" />
                <rect x="${startX + 144}" y="284" width="22" height="6" rx="2" fill="#0f172a" />
                <text x="${startX + 155}" y="302" font-size="8" font-weight="700" fill="#64748b" text-anchor="middle" font-family="'Inter', sans-serif">PATAS</text>
        `;

        if (numEjes === 3) {
            out += `
                <path d="M ${startX + bodyWidth - 275} 238 A 50 50 0 0 1 ${startX + bodyWidth - 175} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                <path d="M ${startX + bodyWidth - 180} 238 A 50 50 0 0 1 ${startX + bodyWidth - 80} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                <path d="M ${startX + bodyWidth - 85} 238 A 50 50 0 0 1 ${startX + bodyWidth + 15} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                ${_evRenderWheel(startX + bodyWidth - 225, 252, 'EJE 1')}
                ${_evRenderWheel(startX + bodyWidth - 130, 252, 'EJE 2')}
                ${_evRenderWheel(startX + bodyWidth - 35, 252, 'EJE 3')}
            `;
        } else {
            out += `
                <path d="M ${startX + bodyWidth - 195} 238 A 50 50 0 0 1 ${startX + bodyWidth - 95} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                <path d="M ${startX + bodyWidth - 100} 238 A 50 50 0 0 1 ${startX + bodyWidth} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                ${_evRenderWheel(startX + bodyWidth - 145, 252, 'EJE 1')}
                ${_evRenderWheel(startX + bodyWidth - 50, 252, 'EJE 2')}
            `;
        }

        out += `</g>`;
        return out;
    }

    function _evRenderRemolqueR2(isFurgon) {
        const startX = 180;
        const bodyWidth = 600;

        let bodyHtml = '';
        if (isFurgon) {
            bodyHtml = `
                <g id="bodyRemolqueFurgon">
                    <rect x="${startX}" y="70" width="${bodyWidth}" height="165" rx="6" fill="url(#evBodyGrad)" stroke="#1e293b" stroke-width="2.5" />
                    <line x1="${startX + 150}" y1="70" x2="${startX + 150}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                    <line x1="${startX + 300}" y1="70" x2="${startX + 300}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                    <line x1="${startX + 450}" y1="70" x2="${startX + 450}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                </g>
            `;
        } else {
            bodyHtml = `
                <g id="bodyRemolquePlat">
                    <rect x="${startX}" y="195" width="${bodyWidth}" height="40" rx="3" fill="#f8fafc" stroke="#1e293b" stroke-width="2.2" />
                    <line x1="${startX}" y1="135" x2="${startX + bodyWidth}" y2="135" stroke="#334155" stroke-width="3" />
                    <line x1="${startX}" y1="165" x2="${startX + bodyWidth}" y2="165" stroke="#334155" stroke-width="3" />
                    <line x1="${startX + 50}" y1="135" x2="${startX + 50}" y2="195" stroke="#334155" stroke-width="3" />
                    <line x1="${startX + 200}" y1="135" x2="${startX + 200}" y2="195" stroke="#334155" stroke-width="3" />
                    <line x1="${startX + 350}" y1="135" x2="${startX + 350}" y2="195" stroke="#334155" stroke-width="3" />
                    <line x1="${startX + 500}" y1="135" x2="${startX + 500}" y2="195" stroke="#334155" stroke-width="3" />
                </g>
            `;
        }

        let out = `
            <g id="remolqueR2">
                ${bodyHtml}
                <line x1="${startX - 75}" y1="245" x2="${startX}" y2="235" stroke="#0284c7" stroke-width="5" stroke-linecap="round"/>
                <circle cx="${startX - 75}" cy="245" r="7" fill="#0284c7" />
                <text x="${startX - 75}" y="265" font-size="8.5" font-weight="800" fill="#0284c7" text-anchor="middle" font-family="'Inter', sans-serif">LANZA</text>

                <path d="M ${startX + 20} 238 A 50 50 0 0 1 ${startX + 120} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                ${_evRenderWheel(startX + 70, 252, 'EJE DEL (DIR)')}

                <path d="M ${startX + bodyWidth - 120} 238 A 50 50 0 0 1 ${startX + bodyWidth - 20} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                ${_evRenderWheel(startX + bodyWidth - 70, 252, 'EJE TRAS')}
            </g>
        `;
        return out;
    }

    // ── RENDERIZAR SISTEMAS Y ACORDEONES SEGÚN PLANTILLA ACTIVA ────
    window.evRenderizarSistemas = function() {
        const cont = document.getElementById('ev-sistemas-accordion-container');
        if (!cont) return;

        const templateList = _evGlobalTemplate || GRUPOS_SISTEMAS_DEFAULT;
        let html = '';

        templateList.forEach((grp, idx) => {
            const isFirst = idx === 0;
            const items = grp.items || [];
            html += `
                <div class="ev-system-card" id="ev-card-${grp.id}">
                    <div class="ev-system-header" data-bs-toggle="collapse" data-bs-target="#ev-collapse-sys-${grp.id}" aria-expanded="${isFirst ? 'true' : 'false'}">
                        <div class="d-flex align-items-center gap-2">
                            <i class="bi ${grp.icon || 'bi-card-checklist'} text-primary fs-5"></i>
                            <span class="fw-bold text-dark" style="font-size:0.92rem;">${grp.titulo || grp.title}</span>
                            <span class="badge bg-secondary-subtle text-secondary rounded-pill px-2" style="font-size:0.72rem;">${items.length} ítems</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-1 d-none" id="ev-badge-count-${grp.id}" style="font-size:0.7rem;">0 calificados</span>
                            <i class="bi bi-chevron-down text-secondary"></i>
                        </div>
                    </div>
                    <div class="collapse ${isFirst ? 'show' : ''}" id="ev-collapse-sys-${grp.id}">
                        <div class="p-2 bg-white">
            `;

            items.forEach((item) => {
                const itemLabel = typeof item === 'string' ? item : (item.label || item.texto || '');
                const cleanKey = itemLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
                html += `
                    <div class="ev-item-row" id="ev-row-${cleanKey}">
                        <div class="d-flex align-items-center gap-2 flex-grow-1">
                            <i class="bi bi-dot text-secondary fs-4 d-none d-sm-inline"></i>
                            <span class="fw-semibold text-dark" style="font-size:0.86rem;">${itemLabel}</span>
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
        const templateList = _evGlobalTemplate || GRUPOS_SISTEMAS_DEFAULT;
        const grp = templateList.find(g => g.id === grpId);
        if (!grp) return;

        let marcados = 0;
        (grp.items || []).forEach(it => {
            const itemLabel = typeof it === 'string' ? it : (it.label || it.texto || '');
            const k = itemLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (window._evItemsStates[k]) marcados++;
        });

        const badge = document.getElementById(`ev-badge-count-${grpId}`);
        if (badge) {
            if (marcados > 0) {
                badge.textContent = `${marcados}/${(grp.items || []).length} calificados`;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        }
    };

    window.evMarcarTodosBueno = function() {
        const templateList = _evGlobalTemplate || GRUPOS_SISTEMAS_DEFAULT;
        templateList.forEach(grp => {
            (grp.items || []).forEach(it => {
                const itemLabel = typeof it === 'string' ? it : (it.label || it.texto || '');
                const k = itemLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
                window.evSetItemState(k, 'B', grp.id);
            });
        });
    };

    window.evFiltrarItems = function(query) {
        const q = (query || '').trim().toLowerCase();
        const templateList = _evGlobalTemplate || GRUPOS_SISTEMAS_DEFAULT;
        templateList.forEach(grp => {
            let matches = 0;
            (grp.items || []).forEach(it => {
                const itemLabel = typeof it === 'string' ? it : (it.label || it.texto || '');
                const k = itemLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const row = document.getElementById(`ev-row-${k}`);
                if (row) {
                    const match = !q || itemLabel.toLowerCase().includes(q);
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

    // ── GUARDAR FORMULARIO EN BASE DE DATOS (CREAR O EDITAR) ──────
    window.evGuardarFormulario = async function() {
        const getVal = id => document.getElementById(id)?.value || '';

        const editId = getVal('ev-f-edit-id');
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
            const url = editId ? `/api/seguridad/entrega-vehiculos/${encodeURIComponent(editId)}` : '/api/seguridad/entrega-vehiculos';
            const method = editId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const json = await res.json();
            if (json.ok) {
                const targetId = editId || json.id;
                alert(editId ? '✅ Acta de Entrega actualizada exitosamente.' : '✅ Acta de Entrega guardada exitosamente.');
                window.evImprimirPDF(targetId);
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

    // ── OBTENCIÓN Y NORMALIZACIÓN DE CONFIGURACIÓN VEHICULAR ───────
    function _evObtenerConfiguracion(r) {
        let pdfConfig = (r.configuracion || (r.tipo && r.tipo.includes('CARRETA') ? 'R2' : 'T3')).toUpperCase().trim();
        if (pdfConfig === '6X4' || pdfConfig === '6X2' || pdfConfig.includes('T3')) return 'T3';
        if (pdfConfig === '4X2' || pdfConfig.includes('T2')) return 'T2';
        if (pdfConfig.includes('C3') || pdfConfig.includes('VOLQUETE')) return 'C3';
        if (pdfConfig.includes('C2')) return 'C2';
        if (pdfConfig.includes('S3') || pdfConfig.includes('SE3')) return 'S3';
        if (pdfConfig.includes('S2') || pdfConfig.includes('SE2')) return 'S2';
        if (pdfConfig.includes('R2') || pdfConfig.includes('REMOLQUE')) return 'R2';
        return 'T3';
    }

    // ── GENERADOR DE STRING SVG OFICIAL PARA LA UNIDAD ──────────────
    function _evGenerarSvgDiagrama(pdfConfig) {
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 340" width="920" height="340" style="background:#ffffff;display:block;margin:0 auto;">
            <defs>
                <linearGradient id="evChassisGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#475569"/><stop offset="100%" stop-color="#1e293b"/></linearGradient>
                <linearGradient id="evCabGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="60%" stop-color="#f8fafc"/><stop offset="100%" stop-color="#e2e8f0"/></linearGradient>
                <linearGradient id="evGlassGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#bae6fd"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient>
                <linearGradient id="evFuelGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#cbd5e1"/><stop offset="50%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#64748b"/></linearGradient>
                <linearGradient id="evTireGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#334155"/><stop offset="100%" stop-color="#0f172a"/></linearGradient>
                <linearGradient id="evBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="70%" stop-color="#f1f5f9"/><stop offset="100%" stop-color="#e2e8f0"/></linearGradient>
            </defs>
            <line x1="40" y1="295" x2="880" y2="295" stroke="#cbd5e1" stroke-width="2.5" stroke-dasharray="8 6" />`;

        if (pdfConfig === 'T3') svg += _evRenderTracto(3, true);
        else if (pdfConfig === 'T2') svg += _evRenderTracto(2, true);
        else if (pdfConfig === 'C3') svg += _evRenderCamionRigido(3, true, true);
        else if (pdfConfig === 'C2') svg += _evRenderCamionRigido(2, true, true);
        else if (pdfConfig === 'S3') svg += _evRenderSemirremolque(3, true);
        else if (pdfConfig === 'S2') svg += _evRenderSemirremolque(2, true);
        else if (pdfConfig === 'R2') svg += _evRenderRemolqueR2(true);
        else svg += _evRenderTracto(3, true);

        svg += `</svg>`;
        return svg;
    }

    // ── RASTERIZADOR DE SVG A PNG ULTRA ALTA DEFINICIÓN ──
    async function _evRasterizarSvgAPng(svgString) {
        return new Promise(function(resolve) {
            try {
                var width = 1840;
                var height = 680;
                var blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                var img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = function() {
                    try {
                        var canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        var ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);
                        URL.revokeObjectURL(url);
                        var pngDataUrl = canvas.toDataURL('image/png');
                        resolve(pngDataUrl);
                    } catch(err) {
                        console.error('Error dibujando canvas SVG:', err);
                        URL.revokeObjectURL(url);
                        resolve('');
                    }
                };
                img.onerror = function(err) {
                    console.error('Error cargando Image SVG:', err);
                    URL.revokeObjectURL(url);
                    resolve('');
                };
                img.src = url;
            } catch(e) {
                console.error('Error en _evRasterizarSvgAPng:', e);
                resolve('');
            }
        });
    }

    // ── GENERADOR DE PLANTILLA HTML PARA PDF OFICIAL ───────────────
    function _evConstruirHtmlPDF(r, diagramaDataUrl) {
        let partes = {};
        try { partes = typeof r.inventario_partes_json === 'string' ? JSON.parse(r.inventario_partes_json) : (r.inventario_partes_json || {}); } catch(e) {}

        const empLogoUrl = localStorage.getItem('fleet_empresa_logo') || '';
        const fechaStr = r.fecha ? r.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10);
        const kmFmt = parseFloat(r.kilometraje || 0).toLocaleString('es-PE');
        const pdfConfig = _evObtenerConfiguracion(r);
        const templateList = _evGlobalTemplate || GRUPOS_SISTEMAS_DEFAULT;

        const diagramaHtml = diagramaDataUrl
            ? `<img src="${diagramaDataUrl}" style="width: 100%; max-width: 740px; height: 135px; object-fit: contain; display: block; margin: 0 auto;" alt="Diagrama Unidad">`
            : _evGenerarSvgDiagrama(pdfConfig);

        const third = Math.ceil(templateList.length / 3);
        const col1 = templateList.slice(0, third);
        const col2 = templateList.slice(third, third * 2);
        const col3 = templateList.slice(third * 2);

        return `
            <main class="report-page w-full max-w-[840px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-3 sm:p-4 text-slate-900 mx-auto" style="box-sizing:border-box;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;">

                <!-- 1. ENCABEZADO INSTITUCIONAL OFICIAL SGC -->
                <header class="doc-grid-box rounded-lg overflow-hidden bg-white mb-2" style="border:1.5px solid #0F172A;">
                    <div class="grid grid-cols-12 divide-x-[1.5px] divide-slate-900 border-b-[1.5px] border-slate-900" style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));border-bottom:1.5px solid #0F172A;">
                        <!-- Logo Empresa -->
                        <div class="col-span-3 p-1.5 flex flex-col items-center justify-center bg-white text-center" style="grid-column:span 3 / span 3;border-right:1.5px solid #0F172A;">
                            ${empLogoUrl ? `<img src="${empLogoUrl}" style="max-height:30px;max-width:110px;object-fit:contain;" crossorigin="anonymous">` : `
                                <div class="text-xs font-extrabold tracking-tight text-slate-900 leading-none">${r.empresa || 'MARSISA'}</div>
                            `}
                            <span class="text-[7.5px] font-semibold tracking-wider text-slate-500 uppercase mt-0.5">Transporte & Logística</span>
                        </div>

                        <!-- Título Oficial -->
                        <div class="col-span-6 p-1.5 flex flex-col items-center justify-center text-center bg-slate-50/50" style="grid-column:span 6 / span 6;border-right:1.5px solid #0F172A;">
                            <h1 class="text-xs font-extrabold text-slate-900 tracking-tight uppercase leading-tight">INVENTARIO FÍSICO ESTADO DE VEHÍCULO</h1>
                            <p class="text-[8.5px] font-semibold text-slate-600 tracking-normal mt-0.5 uppercase">Acta de Entrega y Recepción Técnica de Unidades</p>
                        </div>

                        <!-- Control Documentario SGC -->
                        <div class="col-span-3 text-[9px] flex flex-col divide-y-[1.5px] divide-slate-900 bg-white" style="grid-column:span 3 / span 3;">
                            <div class="px-2 py-0.5 flex items-center justify-between" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-600 uppercase text-[8px]">Código:</span><span class="font-mono font-bold text-slate-900">F-SEG-004</span></div>
                            <div class="px-2 py-0.5 flex items-center justify-between" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-600 uppercase text-[8px]">Versión:</span><span class="font-mono font-bold text-slate-900">01</span></div>
                            <div class="px-2 py-0.5 flex items-center justify-between"><span class="font-bold text-slate-600 uppercase text-[8px]">Fecha:</span><span class="font-mono font-semibold text-slate-900">10/11/2025</span></div>
                        </div>
                    </div>

                    <!-- Metadata Matrix Bento -->
                    <div class="grid grid-cols-3 divide-x-[1.5px] divide-slate-900 text-[9.5px]" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));">
                        <div class="divide-y-[1.5px] divide-slate-900" style="border-right:1.5px solid #0F172A;">
                            <div class="px-2 py-0.5 flex items-center justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-700 text-[8px] uppercase">Nº Inventario:</span><span class="font-mono font-bold text-[#0284C7] text-[10px]">${r.numero_inventario || r.id}</span></div>
                            <div class="px-2 py-0.5 flex items-center justify-between bg-white"><span class="font-bold text-slate-700 text-[8px] uppercase">Entregado Por:</span><span class="font-bold text-slate-900 truncate max-w-[130px] text-[8.5px]">${r.quien_entrega}</span></div>
                        </div>
                        <div class="divide-y-[1.5px] divide-slate-900" style="border-right:1.5px solid #0F172A;">
                            <div class="px-2 py-0.5 flex items-center justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-700 text-[8px] uppercase">Motivo:</span><span class="font-bold text-slate-900 uppercase text-[8px]">${r.motivo || 'ENTREGA DE UNIDAD'}</span></div>
                            <div class="px-2 py-0.5 flex items-center justify-between bg-white"><span class="font-bold text-slate-700 text-[8px] uppercase">Recibido Por:</span><span class="font-bold text-slate-900 truncate max-w-[130px] text-[8.5px]">${r.quien_recibe}</span></div>
                        </div>
                        <div class="divide-y-[1.5px] divide-slate-900">
                            <div class="px-2 py-0.5 flex items-center justify-between bg-white" style="border-bottom:1.5px solid #0F172A;"><span class="font-bold text-slate-700 text-[8px] uppercase">Fecha Emisión:</span><span class="font-mono font-medium text-slate-900 text-[8.5px]">${fechaStr}</span></div>
                            <div class="px-2 py-0.5 flex items-center justify-between bg-emerald-50/50"><span class="font-bold text-slate-700 text-[8px] uppercase">Estado:</span><span class="font-bold text-emerald-600 text-[8.5px] tracking-tight uppercase flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block"></span>Conforme</span></div>
                        </div>
                    </div>
                </header>

                <!-- 2. FICHA TÉCNICA DEL VEHÍCULO -->
                <section class="doc-grid-box rounded-lg overflow-hidden bg-white mb-2" style="border:1.5px solid #0F172A;">
                    <div class="px-3 py-0.5 bg-slate-900 text-white flex items-center justify-between" style="background:#0F172A;">
                        <span class="text-[9px] font-bold uppercase tracking-wider text-white">Ficha Técnica y Datos del Vehículo</span>
                        <span class="text-[7.5px] font-mono text-sky-300">REGISTRO FLOTA</span>
                    </div>

                    <div class="grid grid-cols-6 divide-x-[1.5px] divide-slate-900 text-center border-b-[1.5px] border-slate-900" style="display:grid; grid-template-columns: 15% 18% 18% 18% 16% 15%; border-bottom:1.5px solid #0F172A;">
                        <div class="p-0.5 font-bold text-slate-600 uppercase bg-slate-100/70 text-[7.5px]" style="border-right:1.5px solid #0F172A;">CLASE</div>
                        <div class="p-0.5 font-bold text-slate-600 uppercase bg-slate-100/70 text-[7.5px]" style="border-right:1.5px solid #0F172A;">MARCA</div>
                        <div class="p-0.5 font-bold text-slate-600 uppercase bg-slate-100/70 text-[7.5px]" style="border-right:1.5px solid #0F172A;">TIPO</div>
                        <div class="p-0.5 font-bold text-slate-600 uppercase bg-slate-100/70 text-[7.5px]" style="border-right:1.5px solid #0F172A;">MODELO</div>
                        <div class="p-0.5 font-bold text-slate-600 uppercase bg-slate-100/70 text-[7.5px]" style="border-right:1.5px solid #0F172A;">PLACA</div>
                        <div class="p-0.5 font-bold text-slate-600 uppercase bg-slate-100/70 text-[7.5px]">COLOR</div>
                    </div>

                    <div class="grid grid-cols-6 divide-x-[1.5px] divide-slate-900 text-center border-b-[1.5px] border-slate-900 font-bold text-[8px]" style="display:grid; grid-template-columns: 15% 18% 18% 18% 16% 15%; border-bottom:1.5px solid #0F172A;">
                        <div class="p-0.5 uppercase text-slate-800" style="border-right:1.5px solid #0F172A;">${r.clase || 'TRACTO'}</div>
                        <div class="p-0.5 uppercase text-slate-800" style="border-right:1.5px solid #0F172A;">${r.marca || '---'}</div>
                        <div class="p-0.5 uppercase text-slate-800" style="border-right:1.5px solid #0F172A;">${r.tipo || r.clase || 'TRACTO'}</div>
                        <div class="p-0.5 uppercase text-slate-800" style="border-right:1.5px solid #0F172A;">${r.modelo || '---'}</div>
                        <div class="p-0.5 font-mono text-sky-800 font-extrabold bg-sky-50/50" style="border-right:1.5px solid #0F172A;">${r.placa}</div>
                        <div class="p-0.5 uppercase text-slate-800">${r.color || '---'}</div>
                    </div>

                    <div class="grid grid-cols-3 divide-x-[1.5px] divide-slate-900 text-center border-b-[1.5px] border-slate-900" style="display:grid; grid-template-columns: 35% 35% 30%; border-bottom:1.5px solid #0F172A;">
                        <div class="p-0.5 font-bold text-slate-600 uppercase bg-slate-100/70 text-[7.5px]" style="border-right:1.5px solid #0F172A;">NÚMERO DEL MOTOR</div>
                        <div class="p-0.5 font-bold text-slate-600 uppercase bg-slate-100/70 text-[7.5px]" style="border-right:1.5px solid #0F172A;">NÚMERO DE SERIE / VIN</div>
                        <div class="p-0.5 font-bold text-slate-600 uppercase bg-slate-100/70 text-[7.5px]">KILOMETRAJE ACTUAL</div>
                    </div>

                    <div class="grid grid-cols-3 divide-x-[1.5px] divide-slate-900 text-center font-bold text-[8px]" style="display:grid; grid-template-columns: 35% 35% 30%;">
                        <div class="p-0.5 font-mono uppercase text-slate-800" style="border-right:1.5px solid #0F172A;">${r.numero_motor || '---'}</div>
                        <div class="p-0.5 font-mono uppercase text-slate-800" style="border-right:1.5px solid #0F172A;">${r.numero_serie || '---'}</div>
                        <div class="p-0.5 font-mono text-emerald-800 font-extrabold bg-emerald-50/50">${kmFmt} KM</div>
                    </div>
                </section>

                <!-- 3. MATRIZ DE CALIFICACIÓN DE SISTEMAS Y ACCESORIOS -->
                <section class="mb-2">
                    <div class="grid grid-cols-3 gap-1" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px;">
                        ${[col1, col2, col3].map(colGrupos => `
                            <div class="doc-grid-box rounded-lg overflow-hidden bg-white" style="border:1.5px solid #0F172A;">
                                <table style="width:100%; border-collapse: collapse; font-size: 7.2px;">
                                    <thead>
                                        <tr style="background:#0F172A; color:#ffffff;">
                                            <th style="padding: 1.5px 3px; text-align:left; font-size:7.2px; font-weight:800; text-transform:uppercase;">PARTES Y ACCESORIOS</th>
                                            <th style="padding: 1.5px 2px; text-align:center; width:20px; font-size:6.8px;">CANT</th>
                                            <th style="padding: 1.5px 2px; text-align:center; width:28px; font-size:6.8px;">ESTADO</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${colGrupos.map(grp => `
                                            <tr style="background:#F1F5F9; border-top:1px solid #0F172A; border-bottom:1px solid #0F172A;">
                                                <td colspan="3" style="padding: 1px 3px; font-weight: 800; font-size: 7.2px; color: #1E293B; text-transform: uppercase;">
                                                    • ${grp.titulo || grp.title}
                                                </td>
                                            </tr>
                                            ${(grp.items || []).map(it => {
                                                const itemLabel = typeof it === 'string' ? it : (it.label || it.texto || '');
                                                const k = itemLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
                                                const est = partes[k] || 'B';
                                                let badgeHtml = '<span class="px-1 py-0.2 rounded font-extrabold text-[6.8px] bg-emerald-100 text-emerald-800 border border-emerald-300">OK</span>';
                                                if (est === 'R') badgeHtml = '<span class="px-1 py-0.2 rounded font-extrabold text-[6.8px] bg-amber-100 text-amber-800 border border-amber-300">REG</span>';
                                                if (est === 'M') badgeHtml = '<span class="px-1 py-0.2 rounded font-extrabold text-[6.8px] bg-rose-100 text-rose-800 border border-rose-300">MAL</span>';

                                                return `
                                                    <tr style="border-bottom: 1px solid #E2E8F0;">
                                                        <td style="padding: 0.8px 3px; color: #334155; font-weight: 500; font-size: 7px;">${itemLabel}</td>
                                                        <td style="padding: 0.8px 2px; text-align:center; font-family:monospace; font-weight:bold; color:#64748B; font-size: 7px;">1</td>
                                                        <td style="padding: 0.8px 2px; text-align:center;">${badgeHtml}</td>
                                                    </tr>
                                                `;
                                            }).join('')}
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `).join('')}
                    </div>
                </section>

                <!-- 4. DIAGRAMA TÉCNICO DEL ESTADO DE LA UNIDAD SEGÚN CONFIGURACIÓN -->
                <section class="doc-grid-box rounded-lg overflow-hidden bg-white mb-2 p-1 text-center" style="border:1.5px solid #0F172A; background: rgba(248, 250, 252, 0.5);">
                    <div class="flex justify-between items-center px-2 pb-0.5 border-b border-slate-300 mb-0.5">
                        <span class="font-extrabold text-slate-800 text-[8px] uppercase">Diagrama Técnico del Estado de la Unidad</span>
                        <span class="font-mono font-extrabold text-[7.5px] px-2 py-0.2 rounded-full uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">CONFIGURACIÓN: ${pdfConfig}</span>
                    </div>
                    <div class="py-0.5">
                        ${diagramaHtml}
                    </div>
                </section>

                <!-- 5. OBSERVACIONES DE LA ENTREGA -->
                <section class="doc-grid-box rounded-lg p-1.5 bg-white mb-2" style="border:1.5px solid #0F172A;">
                    <span class="font-bold text-slate-700 text-[8px] uppercase block mb-0.5">Observaciones Técnicas Registradas:</span>
                    <p class="text-[7.5px] text-slate-800 m-0 font-medium leading-snug">
                        ${r.observaciones ? r.observaciones.toUpperCase() : 'LA UNIDAD VEHICULAR SE ENTREGA EN CONDICIONES OPERATIVAS Y CON SU EQUIPAMIENTO COMPLETO SEGÚN DETALLE SUPERIOR.'}
                    </p>
                </section>

                <!-- 6. FIRMAS DIGITALES DE CONFORMIDAD -->
                <footer class="doc-grid-box rounded-lg p-2 bg-white" style="border:1.5px solid #0F172A;">
                    <div class="grid grid-cols-2 gap-2" style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div class="p-1.5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col items-center justify-between text-center min-h-[56px]" style="border:1px solid #E2E8F0; background:#F8FAFC;">
                            <div class="h-7 flex items-center justify-center">
                                ${r.firma_entrega ? `<img src="${r.firma_entrega}" style="max-height: 26px; max-width: 140px; object-fit: contain;" crossorigin="anonymous">` : '<span class="text-slate-300 italic text-[7px]">Firma digitalizada</span>'}
                            </div>
                            <div class="w-full pt-1 border-t border-slate-300" style="border-top:1px solid #CBD5E1;">
                                <div class="font-bold text-slate-900 text-[8px] uppercase">${r.quien_entrega}</div>
                                <div class="text-[6.8px] text-slate-500 font-semibold uppercase">ENTREGADO POR (CONTROL DE FLOTA)</div>
                            </div>
                        </div>

                        <div class="p-1.5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col items-center justify-between text-center min-h-[56px]" style="border:1px solid #E2E8F0; background:#F8FAFC;">
                            <div class="h-7 flex items-center justify-center">
                                ${r.firma_recibe ? `<img src="${r.firma_recibe}" style="max-height: 26px; max-width: 140px; object-fit: contain;" crossorigin="anonymous">` : '<span class="text-slate-300 italic text-[7px]">Firma digitalizada</span>'}
                            </div>
                            <div class="w-full pt-1 border-t border-slate-300" style="border-top:1px solid #CBD5E1;">
                                <div class="font-bold text-slate-900 text-[8px] uppercase">${r.quien_recibe}</div>
                                <div class="text-[6.8px] text-slate-500 font-semibold uppercase">RECIBIDO POR (CONDUCTOR ASIGNADO)</div>
                            </div>
                        </div>
                    </div>
                </footer>

                <!-- Pie de Página -->
                <div class="flex justify-between items-center text-[6.5px] text-slate-400 mt-1 px-1 font-mono">
                    <span>ERP AZKELL FLEET • SISTEMA DE GESTIÓN INTEGRAL DE TRANSPORTE</span>
                    <span>FECHA DE IMPRESIÓN: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}</span>
                </div>

            </main>
        `;
    }

    // ── MOTOR DE GENERACIÓN PDF ULTRA ALTA RESOLUCIÓN (IDÉNTICO A CHECKLIST DE UNIDADES) ──
    async function _evRenderPdfBlob(htmlBody, filename) {
        return new Promise(function(resolve, reject) {
            var iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed; top:-10000px; left:-10000px; width:840px; height:1200px; border:none; z-index:-999;';
            document.body.appendChild(iframe);

            var doc = iframe.contentWindow.document;
            doc.open();
            doc.write('<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n'
                + '<script src="https://cdn.tailwindcss.com"></script>\n'
                + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
                + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">\n'
                + '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></scr' + 'ipt>\n'
                + '<style>\n'
                + 'body { background-color:#FFFFFF; color:#0F172A; margin:0; padding:0; -webkit-font-smoothing:antialiased; font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif; }\n'
                + '.doc-grid-box { border: 1.5px solid #0F172A; }\n'
                + '.report-page { width:100%; max-width:820px; box-sizing:border-box; padding:8px 12px; background:#FFFFFF; margin:0 auto; }\n'
                + '.report-page-break { page-break-before:always !important; }\n'
                + 'img { display: block; max-width: 100%; }\n'
                + '</style>\n</head>\n<body>\n'
                + '<div id="ev-pdf-render-root" style="width:100%; max-width:820px; margin:0 auto;">' + htmlBody + '</div>\n'
                + '</body>\n</html>');
            doc.close();

            iframe.onload = async function() {
                try {
                    await new Promise(function(r) { setTimeout(r, 600); });
                    var targetEl = doc.getElementById('ev-pdf-render-root');
                    var opt = {
                        margin:       0,
                        filename:     filename,
                        image:        { type: 'jpeg', quality: 0.98 },
                        html2canvas:  { scale: 2.5, useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: 840 },
                        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                        pagebreak:    { mode: ['css', 'legacy'] }
                    };

                    var pdfBlob = await iframe.contentWindow.html2pdf().set(opt).from(targetEl).outputPdf('blob');
                    iframe.remove();
                    resolve(pdfBlob);
                } catch(e) {
                    iframe.remove();
                    reject(e);
                }
            };
        });
    }

    // ── VENTANA DE IMPRESIÓN Y DESCARGA DIRECTA ──
    function _evAbrirVentanaImpresion(htmlBody, filename, titulo, autoPrint) {
        var finalHtml = '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n'
            + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
            + '<title>' + (titulo || 'Acta de Entrega de Vehículo • Marsisa SGC 2026') + '</title>\n'
            + '<script src="https://cdn.tailwindcss.com"></script>\n'
            + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">\n'
            + '<style>\n'
            + 'body {\n'
            + '  background-color: #F1F5F9;\n'
            + '  color: #0F172A;\n'
            + '  -webkit-font-smoothing: antialiased;\n'
            + '  -moz-osx-font-smoothing: grayscale;\n'
            + '}\n'
            + '.doc-grid-box { border: 1.5px solid #0F172A; }\n'
            + '.btn-action { transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }\n'
            + '.btn-action:hover { transform: translateY(-1px); }\n'
            + '.btn-action:active { transform: scale(0.98); }\n'
            + '.report-page-break { page-break-before: always !important; }\n'
            + '@media print {\n'
            + '  @page {\n'
            + '    size: A4 portrait;\n'
            + '    margin: 4mm 5mm;\n'
            + '  }\n'
            + '  body {\n'
            + '    background: #FFFFFF !important;\n'
            + '    padding: 0 !important;\n'
            + '    margin: 0 !important;\n'
            + '    -webkit-print-color-adjust: exact !important;\n'
            + '    print-color-adjust: exact !important;\n'
            + '  }\n'
            + '  .no-print {\n'
            + '    display: none !important;\n'
            + '  }\n'
            + '  .report-page {\n'
            + '    box-shadow: none !important;\n'
            + '    border: none !important;\n'
            + '    border-radius: 0 !important;\n'
            + '    padding: 0 !important;\n'
            + '    margin: 0 !important;\n'
            + '    width: 100% !important;\n'
            + '    max-width: 100% !important;\n'
            + '  }\n'
            + '}\n'
            + '</style>\n</head>\n<body class="py-4 md:py-6 px-2 sm:px-4 flex flex-col items-center min-h-screen">\n'
            + '  <!-- TOP APP TOOLBAR -->\n'
            + '  <nav class="no-print w-full max-w-[840px] mb-4 flex flex-wrap items-center justify-between gap-3 bg-white/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-200/80 shadow-xs">\n'
            + '    <div class="flex items-center gap-3">\n'
            + '      <button onclick="window.close()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition">\n'
            + '        <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>\n'
            + '        <span>Cerrar Vista</span>\n'
            + '      </button>\n'
            + '      <div class="h-4 w-px bg-slate-200"></div>\n'
            + '      <div class="flex items-center gap-2">\n'
            + '        <span class="text-xs font-bold text-slate-900 font-mono">' + (titulo || 'ACTA DE ENTREGA') + '</span>\n'
            + '        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">F-SEG-004</span>\n'
            + '      </div>\n'
            + '    </div>\n'
            + '    <div class="flex items-center gap-2">\n'
            + '      <button onclick="window.print()" class="btn-action inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-medium rounded-xl shadow-xs transition">\n'
            + '        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>\n'
            + '        <span>Guardar / Descargar PDF (Vectorial HD)</span>\n'
            + '      </button>\n'
            + '    </div>\n'
            + '  </nav>\n'
            + '  <!-- MAIN CONTENT ROOT -->\n'
            + '  <div id="ev-pdf-root" class="w-full flex flex-col items-center">\n'
            + htmlBody
            + '\n  </div>\n'
            + '  <aside class="no-print mt-3 text-center text-[10px] text-slate-400">\n'
            + '    Azkell Fleet • Documento digital de control vehicular 2026\n'
            + '  </aside>\n'
            + (autoPrint ? '<script>window.onload = function() { setTimeout(function(){ window.print(); }, 400); };</scr' + 'ipt>\n' : '')
            + '</body>\n</html>';

        var blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    }

    // ── OBTENCIÓN DEL NOMBRE DE ARCHIVO PDF ESTANDARIZADO ──────────
    function _evGetPdfFilename(r) {
        const placa = (r.placa || 'UNIDAD').toUpperCase().trim();
        let fechaStr = '';
        if (r.fecha) {
            const rawFecha = r.fecha.slice(0, 10);
            const parts = rawFecha.split('-');
            if (parts.length === 3) {
                fechaStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else {
                fechaStr = rawFecha.replace(/\//g, '-');
            }
        } else {
            const d = new Date();
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            fechaStr = `${day}-${month}-${year}`;
        }
        return `Entrega de Vehiculo - ${placa} - ${fechaStr}.pdf`;
    }

    // ── COMPARTIR DIRECTAMENTE EL ARCHIVO PDF POR WHATSAPP ─────────
    window.evCompartirWhatsApp = async function(id) {
        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const res = await fetch(`/api/seguridad/entrega-vehiculos/${encodeURIComponent(id)}`, {
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            const json = await res.json();
            if (!json.ok || !json.data) {
                alert('No se pudo obtener el registro para compartir.');
                return;
            }

            const r = json.data;
            const filename = _evGetPdfFilename(r);

            const pdfConfig = _evObtenerConfiguracion(r);
            const svgStr = _evGenerarSvgDiagrama(pdfConfig);
            const diagramaDataUrl = await _evRasterizarSvgAPng(svgStr);

            const htmlBody = _evConstruirHtmlPDF(r, diagramaDataUrl);
            const pdfBlob = await _evRenderPdfBlob(htmlBody, filename);
            const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                try {
                    await navigator.share({
                        files: [pdfFile],
                        title: filename
                    });
                    return;
                } catch (shareErr) {
                    if (shareErr.name === 'AbortError') return;
                    console.warn('Fallo navigator.share en entrega, ejecutando fallback:', shareErr);
                }
            }

            const fileUrl = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = fileUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            window.open('https://api.whatsapp.com/send', '_blank');

        } catch(e) {
            if (e.name === 'AbortError') return;
            console.error('Error al compartir PDF por WhatsApp:', e);
            alert('Error al generar y compartir el PDF por WhatsApp.');
        }
    };

    // ── GENERACIÓN E IMPRESIÓN DEL PDF OFICIAL ──────
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
            const filename = _evGetPdfFilename(r);

            const pdfConfig = _evObtenerConfiguracion(r);
            const svgStr = _evGenerarSvgDiagrama(pdfConfig);
            const diagramaDataUrl = await _evRasterizarSvgAPng(svgStr);

            const htmlBody = _evConstruirHtmlPDF(r, diagramaDataUrl);

            _evAbrirVentanaImpresion(htmlBody, filename, filename.replace('.pdf', ''), true);
        } catch(e) {
            console.error('Error generando PDF:', e);
            alert('Error al generar PDF.');
        }
    };

    if (document.getElementById('moduloEntregaVehiculos')) {
        window.inicializarModuloEntregaVehiculos();
    }
})();
