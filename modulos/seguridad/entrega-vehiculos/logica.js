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

    window.evRenderizarTabla = function(data) {
        const tbody = document.getElementById('ev-list-tbody');
        const count = document.getElementById('ev-lbl-tabla-count');
        if (!tbody) return;

        if (count) count.textContent = `${data.length} actas registradas`;

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2"></i>No hay actas de entrega registradas para ${window._evEmpresaActiva}. Haz clic en "Registrar Entrega".</td></tr>`;
            return;
        }

        const esAdmin = (localStorage.getItem('fleet_role') || '').toLowerCase().includes('admin') ||
                        (localStorage.getItem('fleet_rol') || '').toLowerCase().includes('admin');

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

    // ── ELIMINAR REGISTRO (SOLO ADMINISTRADOR) ─────────────────────
    window.evEliminarRegistro = async function(id, folio) {
        const esAdmin = (localStorage.getItem('fleet_role') || '').toLowerCase().includes('admin') ||
                        (localStorage.getItem('fleet_rol') || '').toLowerCase().includes('admin');
        if (!esAdmin) {
            alert('⛔ Acceso denegado: Solo los usuarios con rol de Administrador pueden eliminar actas de entrega.');
            return;
        }

        if (!confirm(`¿Estás seguro de que deseas eliminar el acta ${folio}? Esta acción no se puede deshacer.`)) {
            return;
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
                alert('🗑️ Registro eliminado exitosamente.');
                window.evCargarDatos();
            } else {
                alert('Error al eliminar: ' + (json.error || 'Ocurrió un problema'));
            }
        } catch(e) {
            console.error('Error al eliminar entrega:', e);
            alert('Error de conexión al servidor.');
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

    function _evRenderTracto(axlesCount, isChata) {
        const frontAxleX = isChata ? 200 : 270;
        const rearAxle1X = axlesCount === 3 ? 580 : 620;
        const rearAxle2X = axlesCount === 3 ? 695 : null;
        const chassisEndX = axlesCount === 3 ? rearAxle2X + 65 : rearAxle1X + 70;
        const chassisStartX = isChata ? 140 : 155;
        const fifthWheelX = axlesCount === 3 ? (rearAxle1X + rearAxle2X) / 2 : rearAxle1X;

        let out = `
            <rect x="${chassisStartX}" y="215" width="${chassisEndX - chassisStartX}" height="22" rx="3" fill="url(#evChassisGrad)" stroke="#0f172a" stroke-width="2.5" />
            <rect x="${chassisStartX + 10}" y="222" width="${chassisEndX - chassisStartX - 20}" height="4" fill="#334155" />
            <circle cx="${chassisEndX - 10}" cy="226" r="3" fill="#ef4444" />
            ${isChata ? _evRenderCabinaChata(135) : _evRenderCabinaTrompa(145)}
            <g>
                <rect x="${frontAxleX + 60}" y="220" width="${rearAxle1X - frontAxleX - 95}" height="30" rx="6" fill="url(#evFuelGrad)" stroke="#334155" stroke-width="2" />
                <circle cx="${frontAxleX + 80}" cy="230" r="3.5" fill="#1e293b" />
                <rect x="${frontAxleX + 50}" y="238" width="${rearAxle1X - frontAxleX - 75}" height="5" rx="2" fill="#475569" />
            </g>
            <g id="quintaRueda">
                <polygon points="${fifthWheelX - 32},215 ${fifthWheelX - 20},186 ${fifthWheelX + 20},186 ${fifthWheelX + 32},215" fill="#1e293b" stroke="#0f172a" stroke-width="2" />
                <rect x="${fifthWheelX - 38}" y="178" width="76" height="9" rx="3" fill="#0f172a" stroke="#020617" stroke-width="2" />
                <rect x="${fifthWheelX - 4}" y="178" width="8" height="5" fill="#64748b" />
                <g transform="translate(${fifthWheelX}, 162)">
                    <rect x="-42" y="-10" width="84" height="17" rx="3" fill="#1e293b" />
                    <text x="0" y="2" font-size="8.5" font-weight="700" fill="#38bdf8" text-anchor="middle" font-family="'Inter', sans-serif">QUINTA RUEDA</text>
                    <line x1="0" y1="7" x2="0" y2="16" stroke="#0284c7" stroke-width="1.5" />
                </g>
            </g>
        `;

        if (axlesCount === 3) {
            out += `<path d="M ${rearAxle1X - 54} 238 A 52 52 0 0 1 ${rearAxle1X + 50} 214 L ${rearAxle2X - 50} 214 A 52 52 0 0 1 ${rearAxle2X + 54} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
                    <line x1="${chassisEndX}" y1="220" x2="${chassisEndX}" y2="265" stroke="#1e293b" stroke-width="6" stroke-linecap="round" />`;
        } else {
            out += `<path d="M ${rearAxle1X - 54} 238 A 52 52 0 0 1 ${rearAxle1X + 54} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round"/>
                    <line x1="${chassisEndX}" y1="220" x2="${chassisEndX}" y2="265" stroke="#1e293b" stroke-width="6" stroke-linecap="round" />`;
        }

        out += _evRenderWheel(frontAxleX, 252, 'E1: Direccional');
        out += _evRenderWheel(rearAxle1X, 252, 'E2: Tracción 1');
        if (rearAxle2X) out += _evRenderWheel(rearAxle2X, 252, 'E3: Tracción 2');
        return out;
    }

    function _evRenderCamionRigido(axlesCount, isChata, isFurgon) {
        const frontAxleX = isChata ? 180 : 250;
        const rearAxle1X = axlesCount === 3 ? 610 : 660;
        const rearAxle2X = axlesCount === 3 ? 725 : null;
        const chassisStartX = isChata ? 120 : 135;
        const chassisEndX = axlesCount === 3 ? rearAxle2X + 70 : rearAxle1X + 80;
        const bodyStartX = isChata ? 305 : 360;
        const bodyWidth = chassisEndX - bodyStartX + 10;

        let out = `
            <rect x="${chassisStartX}" y="215" width="${chassisEndX - chassisStartX}" height="22" rx="3" fill="url(#evChassisGrad)" stroke="#0f172a" stroke-width="2.5" />
            <rect x="${chassisStartX + 10}" y="222" width="${chassisEndX - chassisStartX - 20}" height="4" fill="#334155" />
            <circle cx="${chassisEndX - 10}" cy="226" r="3" fill="#ef4444" />
            ${isChata ? _evRenderCabinaChata(115) : _evRenderCabinaTrompa(125)}
        `;

        if (isFurgon) {
            out += `
                <g>
                    <rect x="${bodyStartX}" y="75" width="${bodyWidth}" height="140" rx="4" fill="url(#evBodyGrad)" stroke="#334155" stroke-width="2.5" />
                    <line x1="${bodyStartX + bodyWidth * 0.25}" y1="85" x2="${bodyStartX + bodyWidth * 0.25}" y2="205" stroke="#cbd5e1" stroke-width="2" />
                    <line x1="${bodyStartX + bodyWidth * 0.5}" y1="85" x2="${bodyStartX + bodyWidth * 0.5}" y2="205" stroke="#cbd5e1" stroke-width="2" />
                    <line x1="${bodyStartX + bodyWidth * 0.75}" y1="85" x2="${bodyStartX + bodyWidth * 0.75}" y2="205" stroke="#cbd5e1" stroke-width="2" />
                    <rect x="${bodyStartX + 10}" y="85" width="${bodyWidth - 20}" height="120" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6 3" />
                    <text x="${bodyStartX + bodyWidth/2}" y="148" font-size="12" font-weight="700" fill="#64748b" text-anchor="middle" font-family="'Inter', sans-serif">CARROCERÍA FURGÓN</text>
                </g>
            `;
        } else {
            out += `
                <g>
                    <rect x="${bodyStartX}" y="195" width="${bodyWidth}" height="20" rx="3" fill="#cbd5e1" stroke="#334155" stroke-width="2" />
                    <rect x="${bodyStartX}" y="150" width="10" height="50" fill="#475569" />
                    <rect x="${bodyStartX + bodyWidth - 8}" y="150" width="8" height="50" fill="#475569" />
                    <line x1="${bodyStartX}" y1="170" x2="${bodyStartX + bodyWidth}" y2="170" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4"/>
                    <text x="${bodyStartX + bodyWidth/2}" y="185" font-size="11" font-weight="700" fill="#64748b" text-anchor="middle" font-family="'Inter', sans-serif">PLATAFORMA RÍGIDA</text>
                </g>
            `;
        }

        out += `<rect x="${frontAxleX + 55}" y="222" width="${rearAxle1X - frontAxleX - 95}" height="26" rx="5" fill="url(#evFuelGrad)" stroke="#334155" stroke-width="2" />`;

        if (axlesCount === 3) {
            out += `<path d="M ${rearAxle1X - 52} 238 A 50 50 0 0 1 ${rearAxle1X + 48} 215 L ${rearAxle2X - 48} 215 A 50 50 0 0 1 ${rearAxle2X + 52} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />`;
        } else {
            out += `<path d="M ${rearAxle1X - 52} 238 A 50 50 0 0 1 ${rearAxle1X + 52} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />`;
        }

        out += _evRenderWheel(frontAxleX, 252, 'E1: Direccional');
        out += _evRenderWheel(rearAxle1X, 252, 'E2: Posterior 1');
        if (rearAxle2X) out += _evRenderWheel(rearAxle2X, 252, 'E3: Posterior 2');
        return out;
    }

    function _evRenderSemirremolque(axlesCount, isFurgon) {
        const semiStartX = 140;
        const semiEndX = 810;
        const width = semiEndX - semiStartX;
        let r1, r2, r3;
        if (axlesCount === 3) {
            r1 = 570; r2 = 665; r3 = 760;
        } else {
            r1 = 640; r2 = 745; r3 = null;
        }

        let out = `
            <rect x="${semiStartX}" y="205" width="${width}" height="18" rx="2" fill="url(#evChassisGrad)" stroke="#0f172a" stroke-width="2.5" />
            <g id="kingpinAcople">
                <rect x="${semiStartX + 35}" y="222" width="70" height="6" rx="2" fill="#0f172a" />
                <polygon points="${semiStartX + 66},228 ${semiStartX + 74},228 ${semiStartX + 72},238 ${semiStartX + 68},238" fill="#eab308" stroke="#a16207" stroke-width="1.5" />
                <g transform="translate(${semiStartX + 70}, 252)">
                    <rect x="-38" y="-9" width="76" height="16" rx="3" fill="#ca8a04" />
                    <text x="0" y="3" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle" font-family="'Inter', sans-serif">PERNO REY</text>
                </g>
            </g>
            <g id="patasApoyo">
                <rect x="${semiStartX + 160}" y="215" width="16" height="65" fill="#334155" stroke="#0f172a" stroke-width="2"/>
                <rect x="${semiStartX + 154}" y="278" width="28" height="7" rx="2" fill="#1e293b" />
                <line x1="${semiStartX + 168}" y1="220" x2="${semiStartX + 205}" y2="250" stroke="#475569" stroke-width="3" />
                <text x="${semiStartX + 168}" y="302" font-size="8" font-weight="700" fill="#475569" text-anchor="middle" font-family="'Inter', sans-serif">PATAS RETRÁCTILES</text>
            </g>
            <rect x="${semiStartX + 215}" y="226" width="${r1 - (semiStartX + 235)}" height="12" rx="2" fill="#94a3b8" stroke="#475569" stroke-width="1.5" />
            <rect x="${semiEndX - 8}" y="215" width="8" height="65" fill="#1e293b" />
            <rect x="${semiEndX - 18}" y="270" width="18" height="10" fill="#ef4444" stroke="#991b1b" stroke-width="1.5" />
        `;

        if (isFurgon) {
            out += `
                <g>
                    <rect x="${semiStartX}" y="65" width="${width}" height="140" rx="3" fill="url(#evBodyGrad)" stroke="#334155" stroke-width="2.5" />
                    <line x1="${semiStartX + width * 0.2}" y1="75" x2="${semiStartX + width * 0.2}" y2="195" stroke="#cbd5e1" stroke-width="2" />
                    <line x1="${semiStartX + width * 0.4}" y1="75" x2="${semiStartX + width * 0.4}" y2="195" stroke="#cbd5e1" stroke-width="2" />
                    <line x1="${semiStartX + width * 0.6}" y1="75" x2="${semiStartX + width * 0.6}" y2="195" stroke="#cbd5e1" stroke-width="2" />
                    <line x1="${semiStartX + width * 0.8}" y1="75" x2="${semiStartX + width * 0.8}" y2="195" stroke="#cbd5e1" stroke-width="2" />
                    <text x="${semiStartX + width/2}" y="140" font-size="14" font-weight="700" fill="#64748b" text-anchor="middle" font-family="'Inter', sans-serif">SEMIRREMOLQUE ${axlesCount === 3 ? 'S3 (3 EJES)' : 'S2 (2 EJES)'}</text>
                </g>
            `;
        } else {
            out += `
                <g>
                    <rect x="${semiStartX}" y="190" width="${width}" height="18" rx="2" fill="#94a3b8" stroke="#334155" stroke-width="2" />
                    <rect x="${semiStartX}" y="145" width="10" height="50" fill="#1e293b" />
                    <text x="${semiStartX + width/2}" y="180" font-size="12" font-weight="700" fill="#475569" text-anchor="middle" font-family="'Inter', sans-serif">PLATAFORMA PLANA</text>
                </g>
            `;
        }

        if (axlesCount === 3) {
            out += `<path d="M ${r1 - 50} 235 A 48 48 0 0 1 ${r1 + 46} 210 L ${r3 - 46} 210 A 48 48 0 0 1 ${r3 + 50} 235" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />`;
        } else {
            out += `<path d="M ${r1 - 50} 235 A 48 48 0 0 1 ${r1 + 46} 210 L ${r2 - 46} 210 A 48 48 0 0 1 ${r2 + 50} 235" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />`;
        }

        out += _evRenderWheel(r1, 252, 'E1: Trídem');
        out += _evRenderWheel(r2, 252, 'E2: Trídem');
        if (r3) out += _evRenderWheel(r3, 252, 'E3: Trídem');
        return out;
    }

    function _evRenderRemolqueR2(isFurgon) {
        const trailerStartX = 230;
        const trailerEndX = 810;
        const width = trailerEndX - trailerStartX;
        const frontAxleX = trailerStartX + 85;
        const rearAxleX = trailerEndX - 95;

        let out = `
            <g id="lanzaRemolque">
                <circle cx="115" cy="245" r="10" fill="none" stroke="#eab308" stroke-width="4" />
                <line x1="125" y1="245" x2="${trailerStartX + 30}" y2="225" stroke="#1e293b" stroke-width="5" stroke-linecap="round"/>
                <line x1="125" y1="245" x2="${trailerStartX + 30}" y2="245" stroke="#1e293b" stroke-width="5" stroke-linecap="round"/>
                <rect x="155" y="235" width="22" height="12" fill="#ca8a04" rx="2" />
                <text x="145" y="270" font-size="8.5" font-weight="700" fill="#a16207" text-anchor="middle" font-family="'Inter', sans-serif">LANZA CON ARGOLLA</text>
            </g>
            <g id="tornamesa">
                <ellipse cx="${frontAxleX}" cy="216" rx="35" ry="5" fill="#475569" stroke="#0f172a" stroke-width="2"/>
                <circle cx="${frontAxleX}" cy="216" r="6" fill="#1e293b" />
            </g>
            <rect x="${trailerStartX}" y="205" width="${width}" height="18" rx="2" fill="url(#evChassisGrad)" stroke="#0f172a" stroke-width="2.5" />
        `;

        if (isFurgon) {
            out += `
                <g>
                    <rect x="${trailerStartX}" y="70" width="${width}" height="135" rx="3" fill="url(#evBodyGrad)" stroke="#334155" stroke-width="2.5" />
                    <line x1="${trailerStartX + width * 0.33}" y1="80" x2="${trailerStartX + width * 0.33}" y2="195" stroke="#cbd5e1" stroke-width="2" />
                    <line x1="${trailerStartX + width * 0.66}" y1="80" x2="${trailerStartX + width * 0.66}" y2="195" stroke="#cbd5e1" stroke-width="2" />
                    <text x="${trailerStartX + width/2}" y="140" font-size="13" font-weight="700" fill="#64748b" text-anchor="middle" font-family="'Inter', sans-serif">REMOLQUE R2 (2 EJES DISTRIBUIDOS)</text>
                </g>
            `;
        } else {
            out += `
                <g>
                    <rect x="${trailerStartX}" y="190" width="${width}" height="18" rx="2" fill="#94a3b8" stroke="#334155" stroke-width="2" />
                    <rect x="${trailerStartX}" y="150" width="8" height="45" fill="#1e293b" />
                    <rect x="${trailerEndX - 8}" y="150" width="8" height="45" fill="#1e293b" />
                    <text x="${trailerStartX + width/2}" y="180" font-size="12" font-weight="700" fill="#475569" text-anchor="middle" font-family="'Inter', sans-serif">PLATAFORMA REMOLQUE</text>
                </g>
            `;
        }

        out += `
            <path d="M ${frontAxleX - 50} 236 A 48 48 0 0 1 ${frontAxleX + 50} 236" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            <path d="M ${rearAxleX - 50} 236 A 48 48 0 0 1 ${rearAxleX + 50} 236" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
        `;

        out += _evRenderWheel(frontAxleX, 252, 'E1: Dir. Tornamesa');
        out += _evRenderWheel(rearAxleX, 252, 'E2: Posterior');
        return out;
    }

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

    // ── GENERACIÓN E IMPRESIÓN DEL PDF OFICIAL CON DISEÑO BENTO PASTEL (A4 EJECUTIVO) ──────
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

            const empLogoUrl = localStorage.getItem('fleet_empresa_logo') || '';
            const fechaStr = r.fecha ? r.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10);
            const kmFmt = parseFloat(r.kilometraje || 0).toLocaleString('es-PE');

            // Determinar configuración técnica para el croquis vectorial en PDF
            let pdfConfig = (r.configuracion || (r.tipo && r.tipo.includes('CARRETA') ? 'R2' : 'T3')).toUpperCase().trim();
            if (pdfConfig === '6X4' || pdfConfig === '6X2' || pdfConfig.includes('T3')) pdfConfig = 'T3';
            else if (pdfConfig === '4X2' || pdfConfig.includes('T2')) pdfConfig = 'T2';
            else if (pdfConfig.includes('C3') || pdfConfig.includes('VOLQUETE')) pdfConfig = 'C3';
            else if (pdfConfig.includes('C2')) pdfConfig = 'C2';
            else if (pdfConfig.includes('S3') || pdfConfig.includes('SE3')) pdfConfig = 'S3';
            else if (pdfConfig.includes('S2') || pdfConfig.includes('SE2')) pdfConfig = 'S2';
            else if (pdfConfig.includes('R2') || pdfConfig.includes('REMOLQUE')) pdfConfig = 'R2';
            else pdfConfig = 'T3';

            let pdfSvgDiagram = `
                <svg viewBox="80 40 760 270" style="width: 100%; max-width: 760px; height: 165px; display: block; margin: 0 auto;">
                    <defs>
                        <linearGradient id="evChassisGradPdf" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#475569"/><stop offset="100%" stop-color="#1e293b"/></linearGradient>
                        <linearGradient id="evCabGradPdf" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="60%" stop-color="#f8fafc"/><stop offset="100%" stop-color="#e2e8f0"/></linearGradient>
                        <linearGradient id="evGlassGradPdf" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#bae6fd"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient>
                        <linearGradient id="evFuelGradPdf" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#cbd5e1"/><stop offset="50%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#64748b"/></linearGradient>
                        <linearGradient id="evTireGradPdf" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#334155"/><stop offset="100%" stop-color="#0f172a"/></linearGradient>
                        <linearGradient id="evBodyGradPdf" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="70%" stop-color="#f1f5f9"/><stop offset="100%" stop-color="#e2e8f0"/></linearGradient>
                    </defs>
                    <line x1="40" y1="295" x2="880" y2="295" stroke="#cbd5e1" stroke-width="2.5" stroke-dasharray="8 6" />
            `;

            if (pdfConfig === 'T3') pdfSvgDiagram += _evRenderTracto(3, true);
            else if (pdfConfig === 'T2') pdfSvgDiagram += _evRenderTracto(2, true);
            else if (pdfConfig === 'C3') pdfSvgDiagram += _evRenderCamionRigido(3, true, true);
            else if (pdfConfig === 'C2') pdfSvgDiagram += _evRenderCamionRigido(2, true, true);
            else if (pdfConfig === 'S3') pdfSvgDiagram += _evRenderSemirremolque(3, true);
            else if (pdfConfig === 'S2') pdfSvgDiagram += _evRenderSemirremolque(2, true);
            else if (pdfConfig === 'R2') pdfSvgDiagram += _evRenderRemolqueR2(true);
            pdfSvgDiagram += `</svg>`;

            const printWin = window.open('', '_blank');
            printWin.document.write(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>Acta de Entrega de Vehículo - ${r.numero_inventario || r.id}</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap">
                    <style>
                        @page { 
                            size: A4 portrait; 
                            margin: 5mm 6mm; 
                        }
                        * { box-sizing: border-box; }
                        body { 
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
                            font-size: 8.5px; 
                            color: #0f172a; 
                            background: #ffffff; 
                            margin: 0; 
                            padding: 0;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        .font-mono { font-family: 'JetBrains Mono', monospace; }
                        .doc-box {
                            border: 1.5px solid #0f172a;
                            border-radius: 7px;
                            overflow: hidden;
                            background: #ffffff;
                            margin-bottom: 5px;
                        }
                        .doc-row {
                            display: grid;
                            border-bottom: 1.5px solid #0f172a;
                        }
                        .doc-row:last-child {
                            border-bottom: none;
                        }
                        .badge-pastel-lemon {
                            background-color: #f7fee7;
                            color: #3f6212;
                            border: 1px solid #bef264;
                        }
                        .badge-pastel-amber {
                            background-color: #fffbeb;
                            color: #b45309;
                            border: 1px solid #fde68a;
                        }
                        .badge-pastel-red {
                            background-color: #fef2f2;
                            color: #b91c1c;
                            border: 1px solid #fecaca;
                        }
                    </style>
                </head>
                <body class="p-1">
                    <main class="w-full max-w-[840px] mx-auto bg-white">

                        <!-- 1. ENCABEZADO INSTITUCIONAL SGC -->
                        <header class="doc-box">
                            <div class="doc-row" style="grid-template-columns: 24% 52% 24%;">
                                <!-- Logo Empresa -->
                                <div class="p-2 flex flex-col items-center justify-center text-center bg-white" style="border-right: 1.5px solid #0f172a;">
                                    ${empLogoUrl ? `<img src="${empLogoUrl}" style="max-height: 32px; max-width: 110px; object-fit: contain;">` : `
                                        <div class="font-extrabold text-slate-900 text-xs tracking-tight uppercase">${r.empresa || 'MARSISA'}</div>
                                    `}
                                    <span class="text-[7.5px] font-bold tracking-wider text-slate-500 uppercase mt-0.5">Transporte & Logística</span>
                                </div>

                                <!-- Título Oficial -->
                                <div class="p-2 flex flex-col items-center justify-center text-center bg-slate-50/70" style="border-right: 1.5px solid #0f172a;">
                                    <h1 class="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight uppercase leading-tight">INVENTARIO FÍSICO ESTADO DE VEHÍCULO</h1>
                                    <p class="text-[8.5px] font-semibold text-slate-600 mt-0.5 uppercase">Acta de Entrega y Recepción Técnica de Unidades</p>
                                </div>

                                <!-- Control Documentario SGC -->
                                <div class="text-[9px] flex flex-col justify-between bg-white divide-y-[1.5px] divide-slate-900">
                                    <div class="px-2 py-0.5 flex justify-between items-center"><span class="font-bold text-slate-600 uppercase text-[8.5px]">Código:</span><span class="font-mono font-bold text-slate-900">F-SEG-004</span></div>
                                    <div class="px-2 py-0.5 flex justify-between items-center"><span class="font-bold text-slate-600 uppercase text-[8.5px]">Versión:</span><span class="font-mono font-bold text-slate-900">01</span></div>
                                    <div class="px-2 py-0.5 flex justify-between items-center"><span class="font-bold text-slate-600 uppercase text-[8.5px]">Fecha:</span><span class="font-mono font-semibold text-slate-900">10/11/2025</span></div>
                                </div>
                            </div>

                            <!-- Metadata Matrix Bento -->
                            <div class="doc-row" style="grid-template-columns: repeat(3, minmax(0, 1fr)); font-size: 9px;">
                                <div class="divide-y-[1.5px] divide-slate-900" style="border-right: 1.5px solid #0f172a;">
                                    <div class="px-2 py-1 flex justify-between items-center bg-white"><span class="font-bold text-slate-600 uppercase text-[8px]">Nº Inventario:</span><span class="font-mono font-bold text-sky-700 text-[10px]">${r.numero_inventario || r.id}</span></div>
                                    <div class="px-2 py-1 flex justify-between items-center bg-white"><span class="font-bold text-slate-600 uppercase text-[8px]">Entregado Por:</span><span class="font-bold text-slate-900 truncate max-w-[130px]">${r.quien_entrega}</span></div>
                                </div>
                                <div class="divide-y-[1.5px] divide-slate-900" style="border-right: 1.5px solid #0f172a;">
                                    <div class="px-2 py-1 flex justify-between items-center bg-white"><span class="font-bold text-slate-600 uppercase text-[8px]">Motivo:</span><span class="font-bold text-slate-900 uppercase">${r.motivo || 'ENTREGA DE UNIDAD'}</span></div>
                                    <div class="px-2 py-1 flex justify-between items-center bg-white"><span class="font-bold text-slate-600 uppercase text-[8px]">Recibido Por:</span><span class="font-bold text-slate-900 truncate max-w-[130px]">${r.quien_recibe}</span></div>
                                </div>
                                <div class="divide-y-[1.5px] divide-slate-900">
                                    <div class="px-2 py-1 flex justify-between items-center bg-white"><span class="font-bold text-slate-600 uppercase text-[8px]">Fecha Emisión:</span><span class="font-mono font-semibold text-slate-900">${fechaStr}</span></div>
                                    <div class="px-2 py-1 flex justify-between items-center bg-emerald-50/60"><span class="font-bold text-slate-600 uppercase text-[8px]">Estado:</span><span class="badge-pastel-lemon font-extrabold px-2 py-0.2 rounded-full text-[8px] uppercase">CONFORME</span></div>
                                </div>
                            </div>
                        </header>

                        <!-- 2. FICHA TÉCNICA DEL VEHÍCULO -->
                        <section class="doc-box">
                            <div class="px-3 py-0.5 bg-slate-900 text-white flex items-center justify-between">
                                <span class="text-[9px] font-extrabold uppercase tracking-wider text-white">Ficha Técnica y Datos del Vehículo</span>
                                <span class="text-[7.5px] font-mono text-sky-300">REGISTRO FLOTA</span>
                            </div>

                            <div class="doc-row" style="grid-template-columns: 15% 18% 18% 18% 16% 15%; text-align:center; font-size: 8px;">
                                <div class="p-1 font-bold text-slate-600 uppercase bg-slate-100/70" style="border-right: 1.5px solid #0f172a;">CLASE</div>
                                <div class="p-1 font-bold text-slate-600 uppercase bg-slate-100/70" style="border-right: 1.5px solid #0f172a;">MARCA</div>
                                <div class="p-1 font-bold text-slate-600 uppercase bg-slate-100/70" style="border-right: 1.5px solid #0f172a;">TIPO</div>
                                <div class="p-1 font-bold text-slate-600 uppercase bg-slate-100/70" style="border-right: 1.5px solid #0f172a;">MODELO</div>
                                <div class="p-1 font-bold text-slate-600 uppercase bg-slate-100/70" style="border-right: 1.5px solid #0f172a;">PLACA</div>
                                <div class="p-1 font-bold text-slate-600 uppercase bg-slate-100/70">COLOR</div>
                            </div>

                            <div class="doc-row" style="grid-template-columns: 15% 18% 18% 18% 16% 15%; text-align:center; font-size: 8.5px; font-weight: 700;">
                                <div class="p-1 uppercase text-slate-800" style="border-right: 1.5px solid #0f172a;">${r.clase || 'TRACTO'}</div>
                                <div class="p-1 uppercase text-slate-800" style="border-right: 1.5px solid #0f172a;">${r.marca || '---'}</div>
                                <div class="p-1 uppercase text-slate-800" style="border-right: 1.5px solid #0f172a;">${r.tipo || r.clase || 'TRACTO'}</div>
                                <div class="p-1 uppercase text-slate-800" style="border-right: 1.5px solid #0f172a;">${r.modelo || '---'}</div>
                                <div class="p-1 font-mono text-sky-800 font-extrabold bg-sky-50/50" style="border-right: 1.5px solid #0f172a;">${r.placa}</div>
                                <div class="p-1 uppercase text-slate-800">${r.color || '---'}</div>
                            </div>

                            <div class="doc-row" style="grid-template-columns: 35% 35% 30%; text-align:center; font-size: 8px;">
                                <div class="p-1 font-bold text-slate-600 uppercase bg-slate-100/70" style="border-right: 1.5px solid #0f172a;">NÚMERO DEL MOTOR</div>
                                <div class="p-1 font-bold text-slate-600 uppercase bg-slate-100/70" style="border-right: 1.5px solid #0f172a;">NÚMERO DE SERIE / VIN</div>
                                <div class="p-1 font-bold text-slate-600 uppercase bg-slate-100/70">KILOMETRAJE ACTUAL</div>
                            </div>

                            <div class="doc-row" style="grid-template-columns: 35% 35% 30%; text-align:center; font-size: 8.5px; font-weight: 700;">
                                <div class="p-1 font-mono uppercase text-slate-800" style="border-right: 1.5px solid #0f172a;">${r.numero_motor || '---'}</div>
                                <div class="p-1 font-mono uppercase text-slate-800" style="border-right: 1.5px solid #0f172a;">${r.numero_serie || '---'}</div>
                                <div class="p-1 font-mono text-emerald-800 font-extrabold bg-emerald-50/50">${kmFmt} KM</div>
                            </div>
                        </section>

                        <!-- 3. MATRIZ DE CALIFICACIÓN DE SISTEMAS Y ACCESORIOS -->
                        <section class="mb-1.5">
                            <div class="grid grid-cols-3 gap-1" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px;">
                                ${[
                                    GRUPOS_SISTEMAS.slice(0, 5),
                                    GRUPOS_SISTEMAS.slice(5, 10),
                                    GRUPOS_SISTEMAS.slice(10)
                                ].map(colGrupos => `
                                    <div class="doc-box mb-0">
                                        <table style="width:100%; border-collapse: collapse; font-size: 7.5px;">
                                            <thead>
                                                <tr style="background:#0f172a; color:#ffffff;">
                                                    <th style="padding: 2px 4px; text-align:left; font-size:7.5px; font-weight:800; text-transform:uppercase;">PARTES Y ACCESORIOS</th>
                                                    <th style="padding: 2px 2px; text-align:center; width:20px; font-size:7px;">CANT</th>
                                                    <th style="padding: 2px 2px; text-align:center; width:30px; font-size:7px;">ESTADO</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${colGrupos.map(grp => `
                                                    <tr style="background:#f1f5f9; border-top:1px solid #0f172a; border-bottom:1px solid #0f172a;">
                                                        <td colspan="3" style="padding: 1.5px 3px; font-weight: 800; font-size: 7.5px; color: #1e293b; text-transform: uppercase;">
                                                            • ${grp.titulo}
                                                        </td>
                                                    </tr>
                                                    ${grp.items.map(it => {
                                                        const k = it.toLowerCase().replace(/[^a-z0-9]/g, '_');
                                                        const est = partes[k] || 'B';
                                                        let badgeHtml = '<span class="badge-pastel-lemon px-1 py-0.1 rounded font-extrabold text-[7px]">OK</span>';
                                                        if (est === 'R') badgeHtml = '<span class="badge-pastel-amber px-1 py-0.1 rounded font-extrabold text-[7px]">REG</span>';
                                                        if (est === 'M') badgeHtml = '<span class="badge-pastel-red px-1 py-0.1 rounded font-extrabold text-[7px]">MAL</span>';

                                                        return `
                                                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                                                <td style="padding: 1px 3px; color: #334155; font-weight: 500;">${it}</td>
                                                                <td style="padding: 1px 2px; text-align:center; font-family:monospace; font-weight:bold; color:#64748b;">1</td>
                                                                <td style="padding: 1px 2px; text-align:center;">${badgeHtml}</td>
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

                        <!-- 4. DIAGRAMA VECTORIAL 2D DE LA UNIDAD SEGÚN CONFIGURACIÓN -->
                        <section class="doc-box p-1 text-center bg-slate-50/50 mb-1.5">
                            <div class="flex justify-between items-center px-2 pb-0.5 border-b border-slate-300 mb-0.5">
                                <span class="font-extrabold text-slate-800 text-[8px] uppercase">Diagrama Técnico del Estado de la Unidad</span>
                                <span class="badge-pastel-lemon font-mono font-extrabold text-[7.5px] px-2 py-0.2 rounded-full uppercase">CONFIGURACIÓN: ${pdfConfig}</span>
                            </div>
                            <div class="py-0.5">
                                ${pdfSvgDiagram}
                            </div>
                        </section>

                        <!-- 5. OBSERVACIONES DE LA ENTREGA -->
                        <section class="doc-box p-1.5 bg-slate-50/60 mb-1.5">
                            <span class="font-bold text-slate-700 text-[8px] uppercase block mb-0.5">Observaciones Técnicas Registradas:</span>
                            <p class="text-[8px] text-slate-800 m-0 font-medium leading-snug">
                                ${r.observaciones ? r.observaciones.toUpperCase() : 'LA UNIDAD VEHICULAR SE ENTREGA EN CONDICIONES OPERATIVAS Y CON SU EQUIPAMIENTO COMPLETO SEGÚN DETALLE SUPERIOR.'}
                            </p>
                        </section>

                        <!-- 6. FIRMAS DIGITALES DE CONFORMIDAD -->
                        <section class="doc-box mb-0">
                            <div class="doc-row" style="grid-template-columns: 1fr 1fr;">
                                <div class="p-1.5 flex flex-col items-center justify-between text-center bg-white min-h-[64px]" style="border-right: 1.5px solid #0f172a;">
                                    <div class="w-full flex items-center justify-center h-8">
                                        ${r.firma_entrega ? `<img src="${r.firma_entrega}" style="max-height: 32px; max-width: 150px;" crossorigin="anonymous">` : '<span class="text-slate-300 italic text-[7.5px]">Firma digitalizada</span>'}
                                    </div>
                                    <div class="w-full pt-0.5 border-t border-slate-400">
                                        <div class="font-bold text-slate-900 text-[8.5px] uppercase">${r.quien_entrega}</div>
                                        <div class="text-[7px] text-slate-500 font-semibold uppercase">ENTREGADO POR (CONTROL DE SEGURIDAD)</div>
                                    </div>
                                </div>

                                <div class="p-1.5 flex flex-col items-center justify-between text-center bg-white min-h-[64px]">
                                    <div class="w-full flex items-center justify-center h-8">
                                        ${r.firma_recibe ? `<img src="${r.firma_recibe}" style="max-height: 32px; max-width: 150px;" crossorigin="anonymous">` : '<span class="text-slate-300 italic text-[7.5px]">Firma digitalizada</span>'}
                                    </div>
                                    <div class="w-full pt-0.5 border-t border-slate-400">
                                        <div class="font-bold text-slate-900 text-[8.5px] uppercase">${r.quien_recibe}</div>
                                        <div class="text-[7px] text-slate-500 font-semibold uppercase">RECIBIDO POR (CONDUCTOR ASIGNADO)</div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <!-- Pie de Página -->
                        <div class="flex justify-between items-center text-[6.5px] text-slate-400 mt-0.5 px-1 font-mono">
                            <span>ERP AZKELL FLEET • SISTEMA DE GESTIÓN INTEGRAL DE TRANSPORTE</span>
                            <span>FECHA DE IMPRESIÓN: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}</span>
                        </div>

                    </main>

                    <script>
                        window.onload = function() {
                            setTimeout(function() {
                                window.print();
                            }, 400);
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
