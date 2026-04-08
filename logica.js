
// ============================================================
// 🌉 PUENTE MÁGICO: EMULADOR DE GOOGLE APPS SCRIPT PARA NODE.JS
// ============================================================
class GoogleRunner {
    constructor() {
        this.successCb = null;
        this.failureCb = null;
        this.proxyRef = null;
    }
    withSuccessHandler(cb) { this.successCb = cb; return this.proxyRef; }
    withFailureHandler(cb) { this.failureCb = cb; return this.proxyRef; }
    async _call(method, ...args) {
        try {
            let parsedArgs = args.map(arg => {
                if (arg instanceof HTMLFormElement) {
                    let obj = {};
                    new FormData(arg).forEach((value, key) => obj[key] = value);
                    return obj;
                }
                return arg;
            });

            let res = await fetch('/api/script/' + method, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ args: parsedArgs })
            });
            let json = await res.json();

            // 🧹 FILTRO PURIFICADOR GLOBAL: Arregla "CamiÃ³n" y tildes rotas en todo el CRM al instante
            if (json.data && typeof json.data === 'object') {
                let strData = JSON.stringify(json.data);
                strData = strData.replace(/CamiÃ³n/gi, 'Camión')
                                 .replace(/CAMIÃ.N/g, 'CAMIÓN')
                                 .replace(/CamiÃ.n/g, 'Camión')
                                 .replace(/Ã³/g, 'ó')
                                 .replace(/Ã"/g, 'Ó')
                                 .replace(/Ã±/g, 'ñ')
                                 .replace(/Ã'/g, 'Ñ')
                                 .replace(/Ã/g, 'í');
                json.data = JSON.parse(strData);
            }

            if (this.successCb) this.successCb(json.data);
        } catch (e) {
            if (this.failureCb) this.failureCb(e); else console.error("Error BD:", e);
        }
    }
}
const google = {
    script: {
        get run() {
            let runner = new GoogleRunner();
            let proxy = new Proxy(runner, {
                get: function(target, prop) {
                    if (typeof target[prop] === 'function') return target[prop].bind(target);
                    if (prop in target) return target[prop];
                    return (...args) => target._call(prop, ...args);
                }
            });
            runner.proxyRef = proxy;
            return proxy;
        }
    }
};
// ============================================================
// (AQUÍ DEBAJO CONTINÚA TU CÓDIGO NORMAL: let usuarioLogueado...)

// ============================================================
//  JS_Logica.html — Azkell CRM (Fase Final: Caché + API Wialon)
// ============================================================

let usuarioLogueado   = ''; let rolLogueado       = ''; let permisosUsuario = {}; const TIEMPO_INACTIVIDAD = 30 * 60 * 1000;
let itemAEliminarID   = ''; let itemAEliminarCol  = ''; let tooltipList       = []; 

// 🔥 SISTEMA DE CACHÉ EN MEMORIA
const CACHE = { placas: null, fleetrun: null, usuarios: null, statusMant: null, statusFlota: null, wialon: null, conductores: null };
const CACHE_TIME = {};

let dataGlobalFleetrun = []; let dataGlobalInspecciones = [];
let dataTiposMant     = []; let isHistorialFleetrun = false; let expandAllState = false;

let isHistorialStatus = false; let expandStatusMap = {}; let expandAllStatusState = {};
let chartTotalInst = null, chartMotorasInst = null, chartNoMotorasInst = null;
Chart.register(ChartDataLabels); 

let currentTab = 0; let canvasFirma; let ctxFirma; let dibujando = false;

// ================================================================
// FUNCIONES DE SESIÓN — extraídas de Modulos/login/logica.js
// ================================================================

window.verificarSesionGuardada = function() {
    const guardadoUser     = localStorage.getItem('fleet_user');
    const guardadoTime     = localStorage.getItem('fleet_ultimo_acceso');
    const guardadoCorreo   = localStorage.getItem('fleet_correo');
    const guardadoPermisos = localStorage.getItem('fleet_permisos');
    const guardadoRol      = localStorage.getItem('fleet_rol');

    if (!guardadoUser || !guardadoTime || Date.now() - parseInt(guardadoTime) >= TIEMPO_INACTIVIDAD) {
        cargarModuloAislado('login');
        return;
    }

    usuarioLogueado = guardadoUser;
    rolLogueado = guardadoRol && guardadoRol !== 'null' ? guardadoRol : 'Personalizado';
    registrarActividad();

    try {
        let parsed = JSON.parse(guardadoPermisos || '{}');
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        permisosUsuario = parsed || {};
    } catch(e) { permisosUsuario = {}; }

    // --- Topbar ---
    let nombreUsuarioTopEl = document.getElementById('nombre-usuario-top');
    if (nombreUsuarioTopEl) nombreUsuarioTopEl.innerText = usuarioLogueado;

    let perfilNombreEl = document.getElementById('perfil-nombre');
    if (perfilNombreEl) perfilNombreEl.innerText = usuarioLogueado;

    if (guardadoCorreo) {
        let perfilCorreoEl = document.getElementById('perfil-correo');
        if (perfilCorreoEl) perfilCorreoEl.innerText = guardadoCorreo;
    }
    let inputInsp = document.getElementById('input-inspector-nuevo'); if (inputInsp) inputInsp.value = usuarioLogueado;

    let p = permisosUsuario || {};
    let isAdm = p?.admin === true || (guardadoCorreo && guardadoCorreo.toLowerCase() === 'admin@azkell.com');

    let rolHtml = (guardadoCorreo && guardadoCorreo.toLowerCase() === 'admin@azkell.com')
        ? '<span class="badge bg-dark text-warning shadow-sm"><i class="bi bi-star-fill"></i> Fundador</span>'
        : (isAdm ? '<span class="badge bg-warning text-dark shadow-sm"><i class="bi bi-star-fill"></i> Administrador</span>'
        : `<span class="badge bg-primary shadow-sm"><i class="bi bi-person-gear"></i> ${rolLogueado}</span>`);

    let topBadge = document.getElementById('badge-rol-top'); if (topBadge) topBadge.innerHTML = rolHtml;
    let perfilBadge = document.getElementById('perfil-rol-badge'); if (perfilBadge) perfilBadge.innerHTML = rolHtml;

    // --- Helpers de visibilidad ---
    const safe = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; };
    const sec = (wrapId, collapseId, show) => {
        const w = document.getElementById(wrapId);
        const c = collapseId ? document.getElementById(collapseId) : null;
        if (w) w.style.display = show ? '' : 'none';
        if (c) { if (show) c.style.removeProperty('display'); else { c.classList.remove('show'); c.style.display = 'none'; } }
    };

    // --- Ocultar todo primero ---
    ['wrap-mantenimiento', 'wrap-almacen', 'wrap-flota', 'wrap-directorio', 'wrap-usuarios', 'wrap-auditoria']
        .forEach(id => safe(id, false));
    ['menuMantenimiento', 'menuAlmacen', 'menuFlota'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('show'); el.style.display = 'none'; }
    });

    // --- Visibilidad por permisos ---
    const showMant  = isAdm || p?.insp?.l  || p?.placas?.l || p?.fleet?.l;
    const showAlm   = isAdm || p?.placas?.l;
    const showFlota = isAdm || p?.gps?.l   || p?.status?.l || p?.cond?.l;
    const showDir   = isAdm || p?.cond?.l;

    sec('wrap-mantenimiento', 'menuMantenimiento', showMant);
    safe('btnMenuStatusMant', isAdm || p?.insp?.l);
    safe('btnMenuPlacasMant', isAdm || p?.placas?.l);
    safe('btnMenuFleetrun',   isAdm || p?.fleet?.l);

    sec('wrap-almacen', 'menuAlmacen', showAlm);
    safe('btnMenuInventario', isAdm || p?.placas?.l);

    sec('wrap-flota', 'menuFlota', showFlota);
    safe('btnMenuUbicacion',   isAdm || p?.gps?.l);
    safe('btnMenuStatusFlota', isAdm || p?.status?.l);
    safe('btnMenuConductores', isAdm || p?.cond?.l);

    sec('wrap-directorio', null, showDir);
    safe('wrap-usuarios',  isAdm);
    safe('wrap-auditoria', isAdm || p?.mod_auditoria);

    // --- Mostrar app y cargar módulo guardado o por defecto ---
    let rootDinamico = document.getElementById('root-dinamico');
    if (rootDinamico) rootDinamico.style.display = 'none';

    let appCrmEl = document.getElementById('app-crm');
    if (appCrmEl) appCrmEl.style.display = 'flex';

    let rutaGuardada = localStorage.getItem('fleet_rutaActual');
    if (rutaGuardada && rutaGuardada !== 'login') {
        cargarModuloAislado(rutaGuardada);
    } else {
        cargarModuloAislado('dashboard');
    }

    // --- Precarga de datos ---
    google.script.run.withSuccessHandler(d => {
        dataGlobalPlacas = d; CACHE['placas'] = d; CACHE_TIME['placas'] = Date.now();
        let placasSet = new Set(); d.forEach(r => { if (r[0] && r[0] !== 'Placa' && r[0] !== 'PLACA') placasSet.add(r[0]); });
        rellenarDatalist('dl-placas', placasSet);
        if (typeof poblarSelectsFormularios === 'function') {
            poblarSelectsFormularios(d);
        }
        recargarWialon();
        // Si el usuario llegó a Fleetrun antes que las placas cargaran, re-renderizar ahora con el filtro correcto
        if (localStorage.getItem('fleet_rutaActual') === 'mantenimiento/fleetrun'
            && typeof mostrarFleetrun === 'function'
            && dataGlobalFleetrun && dataGlobalFleetrun.length > 0) {
            mostrarFleetrun(dataGlobalFleetrun);
        }
    }).obtenerDatosPlacas();
    google.script.run.withSuccessHandler(d => { dataTiposMant = d; }).obtenerTiposMantenimiento();
    google.script.run.withSuccessHandler(tipos => { rellenarDatalist('dl-tpmp', new Set(tipos)); }).obtenerTPMP();

    // Precarga Fleetrun: llenar window.dataGlobalFleetrun y disparar re-render si el usuario ya está en ese módulo
    google.script.run.withSuccessHandler(d => {
        window.dataGlobalFleetrun = d;
        dataGlobalFleetrun = d;
        if (localStorage.getItem('fleet_rutaActual') === 'mantenimiento/fleetrun') {
            if (typeof window.init_fleetrun === 'function') window.init_fleetrun();
        }
    }).obtenerDatosFleetrun();
}

function cerrarSesion() {
    localStorage.removeItem('fleet_user'); localStorage.removeItem('fleet_rol'); localStorage.removeItem('fleet_correo'); localStorage.removeItem('fleet_ultimo_acceso'); localStorage.removeItem('fleet_permisos');
    usuarioLogueado = ''; rolLogueado = ''; permisosUsuario = {};

    // 🧹 Limpieza Total de Pantalla
    ['menuMantenimiento', 'menuAlmacen', 'menuFlota'].forEach(id => { const el = document.getElementById(id); if (!el) return; el.classList.remove('show'); el.style.display = 'none'; const inst = bootstrap.Collapse.getInstance(el); if (inst) inst.dispose(); });
    document.querySelectorAll('.modulo-wrapper').forEach(m => m.style.display = 'none');

    let appCrmEl2 = document.getElementById('app-crm');
    if (appCrmEl2) appCrmEl2.style.display = 'none';
    cargarModuloAislado('login');
}

window.restaurarCascaronApp = function() {
    const sb = document.getElementById('sidebarMenu');
    const tb = document.querySelector('.topbar');
    if(sb) sb.style.display = '';
    if(tb) tb.style.display = '';
};

// Aplica color de acento guardado (accesible desde módulo configuración)
window.applyAccent = function(hex, save) {
    // Seteamos en body (inline) para ganar sobre cualquier :root redefinido
    document.body.style.setProperty('--accent', hex);
    document.body.style.setProperty('--crm-accent', hex);
    document.body.style.setProperty('--crm-accent-light', hex + '1a'); // 10% opacity
    if (save) localStorage.setItem('fleet_accent', hex);
};

document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.getElementById('theme-toggle');
  const body = document.body;
  const saved = localStorage.getItem('theme');
  const btnTheme = document.getElementById('btn-theme-toggle');

  // Restaurar acento guardado
  const savedAccent = localStorage.getItem('fleet_accent');
  if (savedAccent) window.applyAccent(savedAccent, false);

  // Restaurar tamaño de fuente guardado
  const savedFont = parseInt(localStorage.getItem('fleet_fontsize'));
  if (savedFont && savedFont >= 10 && savedFont <= 20) {
    document.documentElement.style.fontSize = savedFont + 'px';
  }

  // Restaurar tipo de fuente guardado
  const _FF_MAP = {
    inter:  "'Inter', system-ui, -apple-system, sans-serif",
    system: "system-ui, -apple-system, sans-serif",
    serif:  "Georgia, 'Times New Roman', serif",
    mono:   "'Consolas', 'Courier New', monospace"
  };
  const savedFontFamily = localStorage.getItem('fleet_fontfamily') || 'inter';
  document.documentElement.style.setProperty('--font-family', _FF_MAP[savedFontFamily] || _FF_MAP.inter);
  document.documentElement.style.setProperty('--bs-body-font-family', _FF_MAP[savedFontFamily] || _FF_MAP.inter);

  // Restaurar accesibilidad
  if (localStorage.getItem('fleet_reduce_anims') === 'true') {
    document.body.classList.add('reduce-motion');
  }
  if (localStorage.getItem('fleet_sidebar_compact') === 'true') {
    document.body.classList.add('sidebar-compact');
  }

  if (saved === 'dark') applyDark(true, false);

  if (toggle) {
    toggle.addEventListener('change', () => applyDark(toggle.checked, true));
  }

  function applyDark(isDark, save) {
    if (toggle) toggle.checked = isDark;
    body.classList.toggle('dark', isDark);
    document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
    if (save) localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (btnTheme) {
        btnTheme.innerHTML = isDark
          ? '<i class="bi bi-sun-fill text-warning"></i>'
          : '<i class="bi bi-moon-stars-fill"></i>';
    }
    // Sincronizar switch del módulo configuración si está abierto
    const switchCfgDark = document.getElementById('cfg-switch-dark');
    if (switchCfgDark) switchCfgDark.checked = isDark;
    actualizarColoresGraficos();
  }
  // Exponer applyDark para que el módulo configuración lo pueda llamar
  window.applyDark = applyDark;

  let usuarioGuardado = localStorage.getItem('fleet_user');
  if (!usuarioGuardado) {
    cargarModuloAislado('login');
  } else {
    if (typeof restaurarCascaronApp === 'function') restaurarCascaronApp();
    if (typeof window.restoreNavSections === 'function') window.restoreNavSections();
    verificarSesionGuardada();
  }
  document.body.addEventListener('mousemove', registrarActividad);
  document.body.addEventListener('keypress', registrarActividad);
  document.body.addEventListener('click', registrarActividad);
  setInterval(verificarInactividad, 60000);

  generarWizardFase3();
});

function normalizarClase(str) { return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, ''); }
function initTooltips() {
    tooltipList.forEach(t => t.dispose());
    tooltipList = [];
    const sidebar = document.getElementById('sidebarMenu');
    if (sidebar && sidebar.classList.contains('collapsed')) {
        const items = [].slice.call(document.querySelectorAll('.sidebar a'));
        items.forEach(el => {
            let textSpan = el.querySelector('.link-text');
            if (textSpan && textSpan.innerText.trim() !== '') {
                el.setAttribute('data-bs-title', textSpan.innerText.trim());
                let t = new bootstrap.Tooltip(el, {
                    trigger: 'hover',
                    placement: 'right',
                    animation: true
                });
                el.addEventListener('click', () => t.hide());
                tooltipList.push(t);
            }
        });
    } else {
        const items = [].slice.call(document.querySelectorAll('.sidebar a'));
        items.forEach(el => el.removeAttribute('data-bs-title'));
    }
}
function toggleSidebar() {
    const sidebar = document.getElementById('sidebarMenu');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (window.innerWidth <= 768) {
        const isOpen = sidebar.classList.contains('mobile-open');
        sidebar.classList.toggle('mobile-open', !isOpen);
        if (backdrop) backdrop.classList.toggle('active', !isOpen);
    } else {
        sidebar.classList.toggle('collapsed');
        setTimeout(initTooltips, 300);
    }
}

window.toggleNavSection = function(sectionId) {
    const items = document.getElementById('section-items-' + sectionId);
    const btn   = document.querySelector('.nav-section-toggle[data-section="' + sectionId + '"]');
    if (!items) return;
    const isCollapsed = items.classList.toggle('nav-section-collapsed');
    if (btn) btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    // Animación de entrada solo al expandir
    if (!isCollapsed) {
        items.classList.add('nav-section-expanding');
        setTimeout(function() { items.classList.remove('nav-section-expanding'); }, 420);
    }
    // Persistir estado
    try {
        const saved = JSON.parse(localStorage.getItem('fleet_nav_sections') || '{}');
        saved[sectionId] = isCollapsed ? 'collapsed' : 'expanded';
        localStorage.setItem('fleet_nav_sections', JSON.stringify(saved));
    } catch(e) {}
};

window.restoreNavSections = function() {
    try {
        const saved = JSON.parse(localStorage.getItem('fleet_nav_sections') || '{}');
        Object.keys(saved).forEach(function(sectionId) {
            if (saved[sectionId] === 'collapsed') {
                const items = document.getElementById('section-items-' + sectionId);
                const btn   = document.querySelector('.nav-section-toggle[data-section="' + sectionId + '"]');
                if (items) items.classList.add('nav-section-collapsed');
                if (btn)   btn.setAttribute('aria-expanded', 'false');
            }
        });
    } catch(e) {}
};
function closeSidebar() { document.getElementById('sidebarMenu').classList.remove('mobile-open'); document.getElementById('sidebarBackdrop').classList.remove('active'); }
function togglePassword(inputId, btn) { const input = document.getElementById(inputId); const icon = btn.querySelector('i'); if (input.type === 'password') { input.type = 'text'; icon.classList.replace('bi-eye-fill', 'bi-eye-slash-fill'); } else { input.type = 'password'; icon.classList.replace('bi-eye-slash-fill', 'bi-eye-fill'); } }
function registrarActividad() { if (usuarioLogueado) localStorage.setItem('fleet_ultimo_acceso', Date.now()); }
function verificarInactividad() { if (usuarioLogueado) { const ultimo = localStorage.getItem('fleet_ultimo_acceso'); if (ultimo && (Date.now() - parseInt(ultimo) > TIEMPO_INACTIVIDAD)) cerrarSesion(); } }
function badgeRol(rol) { const clases = { 'Administrador':'role-admin','Inspector':'role-inspector', 'Mantenimiento':'role-mant','Almacén':'role-alm','Almacen':'role-alm','Flota':'role-flota' }; return `<span class="role-badge ${clases[rol]||''}">${rol}</span>`; }
function parseDateToDDMMYYYY(dateStr) {
    if(!dateStr) return "-";
    if(typeof dateStr === 'string' && dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dateStr;
    if (typeof dateStr === 'string' && dateStr.includes('-')) {
        let p = dateStr.split('T')[0].split('-');
        if(p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
    }
    let d = new Date(dateStr);
    if(isNaN(d.getTime())) return dateStr;
    let day = d.getDate().toString().padStart(2, '0');
    let month = (d.getMonth() + 1).toString().padStart(2, '0');
    let year = d.getFullYear();
    return `${day}/${month}/${year}`;
}
function normalizeStr(str) { return str ? str.toString().trim().toUpperCase() : ""; }

// =======================================================
// 🛡️ NÚCLEO DE SEGURIDAD Y ENRUTAMIENTO RBAC
// =======================================================

// =======================================================
// 🛡️ NÚCLEO DE SEGURIDAD Y ENRUTAMIENTO (BLINDADO)
// =======================================================

function inicializarMenu() {
    console.log("Inicializando Menú con permisos:", permisosUsuario);

    const contenedorMenu = document.getElementById('contenedorMenu');
    if (!contenedorMenu) return;

    let primerModuloAccesible = null;

    MODULOS_SISTEMA.forEach((modulo) => {
        // Obtenemos los permisos específicos para este módulo
        const pMod = permisosUsuario[modulo.id] || {};
        const tieneAcceso = (pMod.leer === true);

        // Buscamos el elemento del menú correspondiente en el HTML
        const elementoMenu = document.querySelector(`.nav-link[onclick*="recargarModulo('${modulo.id}')"]`);

        if (elementoMenu) {
            if (tieneAcceso) {
                elementoMenu.parentElement.style.display = 'block'; // Mostramos el botón
                // Guardamos el primer módulo al que el usuario SI tiene acceso
                if (!primerModuloAccesible) primerModuloAccesible = modulo.id;
            } else {
                elementoMenu.parentElement.style.display = 'none'; // Ocultamos el botón
            }
        }
    });

    // 🚀 LÓGICA DE ENTRADA INTELIGENTE:
    if (primerModuloAccesible) {
        console.log(`Cargando primer módulo accesible: ${primerModuloAccesible}`);
        recargarModulo(primerModuloAccesible);
    } else {
        // Si no tiene acceso a NADA (Usuario nuevo sin permisos)
        console.warn("El usuario no tiene permisos para ningún módulo.");
        let contenedorPrincipalEl = document.getElementById('contenedorPrincipal');
        if (contenedorPrincipalEl) {
            contenedorPrincipalEl.innerHTML = `
                <div class="container text-center mt-5">
                    <div class="card shadow-lg p-5 bg-light border-warning">
                        <i class="bi bi-shield-lock-fill text-warning" style="font-size: 4rem;"></i>
                        <h2 class="mt-3 text-dark">Acceso Restringido</h2>
                        <p class="lead text-muted">Su cuenta está activa, pero aún no tiene módulos asignados.<br>Por favor, contacte al administrador para configurar sus accesos.</p>
                    </div>
                </div>
            `;
        }
    }
}

window.aplicarPermisosBotonesUI = function() {
    let p = permisosUsuario || {};
    let correoActual = (localStorage.getItem('fleet_correo') || '').toLowerCase();
    let isAdm = p?.admin === true || correoActual === 'admin@azkell.com';

    const check = (selector, permiso) => {
        document.querySelectorAll(selector).forEach(btn => {
            btn.style.display = (isAdm || permiso === true) ? 'inline-block' : 'none';
        });
    };

    check('button[onclick="abrirModalNuevaInspeccion()"]', p?.insp?.c);
    check('#btnNuevaPlaca', p?.placas?.c);
    check('#btnNuevoFleetrun', p?.fleet?.c);
    check('button[onclick="abrirModalNuevoStatusFlota()"]', p?.status?.c);
    check('button[onclick="abrirModalConductor()"]', p?.cond?.c);
    check('button[onclick="abrirModalGestorUsuario()"]', false);
}

// ============================================================
// 🔥 WIALON GPS Y CACHÉ 🔥
// ============================================================
function recargarWialon(forzarVista = false) {
    let btn = document.getElementById('btn-wialon-status');
    let txt = document.getElementById('wialon-text');
    if(btn) { btn.className = 'btn btn-sm btn-outline-warning ms-3'; txt.innerText = 'Conectando...'; }
    
    google.script.run.withSuccessHandler(d => {
        if(d && !d.error) {
            CACHE['wialon'] = d;
            if(btn) { btn.className = 'btn btn-sm ms-3 btn-primary'; txt.innerText = 'GPS Activo'; }
            
            // Si las tablas están visibles, se refrescan solas para inyectar GPS
            if (document.getElementById('moduloStatus')?.style.display === 'flex') mostrarStatusInspecciones(dataGlobalInspecciones);
            let modFleetrunEl = document.getElementById('moduloFleetrun');
            if (modFleetrunEl && modFleetrunEl.style.display === 'flex') mostrarFleetrun(dataGlobalFleetrun);
            if (typeof window.renderListaUnidadesGPS === 'function') window.renderListaUnidadesGPS(d);
        } else {
            if(btn) { btn.className = 'btn btn-sm btn-danger ms-3 text-white'; txt.innerText = 'Error GPS'; }
            console.error("Error Wialon:", d.error);
        }
    }).obtenerDatosWialon();
}

function buscarWialonPorPlaca(placa) {
    if(!CACHE.wialon || !Array.isArray(CACHE.wialon)) return null;
    // Quitamos guiones y espacios para que la comparación sea perfecta
    let pLimpia = placa.toString().replace(/[^A-Z0-9]/ig, '').toUpperCase();
    return CACHE.wialon.find(w => {
        let wPlaca = w.placa ? w.placa.replace(/[^A-Z0-9]/ig, '').toUpperCase() : "";
        let wNom = w.nombre_wialon ? w.nombre_wialon.replace(/[^A-Z0-9]/ig, '').toUpperCase() : "";
        return wPlaca.includes(pLimpia) || wNom.includes(pLimpia);
    });
}

function abrirMapaFlotante(placa, lat, lng) {
    let mapaTituloEl = document.getElementById('mapa-placa-titulo');
    if (mapaTituloEl) mapaTituloEl.innerText = placa;

    let iframeMapaEl = document.getElementById('iframeMapaGPS');
    if (iframeMapaEl) iframeMapaEl.src = `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;

    let modalMapaEl = document.getElementById('modalMapaGPS');
    if (modalMapaEl) new bootstrap.Modal(modalMapaEl).show();
}

function mostrarUbicaciones(datosWialon) {
    let html = '';
    if(!datosWialon || datosWialon.length === 0) {
        html = '<tr><td colspan="5" class="text-center py-4 text-muted">No se detectaron vehículos conectados al GPS.</td></tr>';
    } else {
        datosWialon.forEach(w => {
        let linkMapa = (w.lat !== 0 && w.lng !== 0) ? `
                <div class="dropstart text-center">
                    <button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown" title="Opciones">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu shadow">
                        <li><a class="dropdown-item fw-bold text-primary" href="#" onclick="abrirMapaFlotante('${w.placa}', ${w.lat}, ${w.lng})"><i class="bi bi-map-fill"></i> Ver en Mapa</a></li>
                        <li><a class="dropdown-item fw-bold" href="#" onclick="obtenerDireccion(${w.lat}, ${w.lng}, this)"><i class="bi bi-signpost-split"></i> Extraer Calle</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item fw-bold text-success" href="#" onclick="event.preventDefault(); compartirUbicacion('${w.nombre_wialon}', ${w.lat}, ${w.lng})"><i class="bi bi-whatsapp"></i> Compartir por Wsp</a></li>
                    </ul>
                </div>
            ` : '<span class="text-muted"><i class="bi bi-geo-alt"></i> Sin señal GPS</span>';
            html += `<tr class="data-row-ubicacion">
                <td class="fw-bold text-secondary">${w.nombre_wialon}</td>
                <td class="fw-bold text-primary">${w.placa}</td>
                <td class="fw-bold" style="color: #0ea5e9;">${w.km.toLocaleString()} km</td>
                <td class="fw-bold" style="color: #f59e0b;">${w.horas.toLocaleString()} hrs</td>
                <td>${linkMapa}</td>
            </tr>`;
        });
    }
    let cuerpoTablaUbicacionEl = document.getElementById('cuerpoTablaUbicacion');
    if (cuerpoTablaUbicacionEl) cuerpoTablaUbicacionEl.innerHTML = html;
}

function tiempoDesde(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff/60)}m`;
  return `hace ${Math.floor(diff/3600)}h`;
}

function actualizarBadge(modulo, esLive) {
  const badge = document.getElementById(`cache-badge-${modulo}`);
  const label = document.getElementById(`cache-label-${modulo}`);
  if (!badge || !label) return;
  if (esLive) {
    badge.className = 'cache-badge live'; label.innerHTML = '🟢 Actualizado ' + tiempoDesde(CACHE_TIME[modulo]);
  } else {
    badge.className = 'cache-badge'; label.innerHTML = '⚡ Caché ' + tiempoDesde(CACHE_TIME[modulo]);
  }
}

function setBtnLoading(modulo, loading) {
  const btn = document.getElementById(`btn-reload-${modulo}`);
  if (!btn) return;
  btn.classList.toggle('spinning', loading);
  btn.disabled = loading;
}

// Creador de Skeletons HTML
function generarSkeletonHtml(columnas, filas = 6) {
    let html = '';
    for (let i = 0; i < filas; i++) {
        html += '<tr class="skeleton-row">';
        for (let j = 0; j < columnas; j++) {
            let width = Math.floor(Math.random() * (90 - 40 + 1) + 40);
            html += `<td><span class="skeleton-box" style="width: ${width}%;"></span></td>`;
        }
        html += '</tr>';
    }
    return html;
}

function cargarModulo(nombre, fnRender, fnBackend) {
  if (CACHE[nombre] !== null && CACHE[nombre].length > 0) {
    fnRender(CACHE[nombre]);
    actualizarBadge(nombre, false);
    return;
  }
  setBtnLoading(nombre, true);
  const label = document.getElementById(`cache-label-${nombre}`);
  if (label) label.textContent = 'Cargando BD...';

  // ⚡ SKELETONS AL INSTANTE MIENTRAS CARGA LA BD
  const tablaInfo = {
      placas:      { id: 'cuerpoTablaPlacas', cols: 9 },
      fleetrun:    { id: 'cuerpoTablaFleetrun', cols: 10 },
      usuarios:    { id: 'cuerpoTablaUsuarios', cols: 7 },
      statusMant:  { id: 'cuerpoTablaStatus', cols: 10 },
      conductores: { id: 'cuerpoTablaConductores', cols: 7 },
      statusFlota: { id: 'cuerpoTablaStatusFlota', cols: 9 }
  };
  if (tablaInfo[nombre]) {
      let tb = document.getElementById(tablaInfo[nombre].id);
      if (tb) tb.innerHTML = generarSkeletonHtml(tablaInfo[nombre].cols);
  }

  google.script.run.withSuccessHandler(datos => {
      if (typeof datos === 'string' && datos.includes('Quota exceeded')) { datos = "🚨 Límite Diario de Firebase (50,000 lecturas) Alcanzado por hoy. El sistema reanudará a medianoche."; }
      CACHE[nombre] = typeof datos === 'string' ? [] : datos;
      CACHE_TIME[nombre] = Date.now();
      setBtnLoading(nombre, false);
      fnRender(datos);
      actualizarBadge(nombre, true);
    }).withFailureHandler(err => {
      setBtnLoading(nombre, false); if(label) label.textContent = 'Error Red';
    })[fnBackend]();
}

function recargarModulo(nombre) {
  CACHE[nombre] = null; CACHE_TIME[nombre] = null;
  const acciones = {
    placas: () => cargarModulo('placas', mostrarPlacas, 'obtenerDatosPlacas'),
    fleetrun: () => cargarModulo('fleetrun', mostrarFleetrun, 'obtenerDatosFleetrun'),
    statusMant: () => cargarModulo('statusMant', mostrarStatusInspecciones, 'obtenerDatosInspecciones')
  };
  if (acciones[nombre]) acciones[nombre]();
}



const PERMISOS_MODULO = { 'placas': ['Administrador', 'Inspector', 'Mantenimiento'], 'almacenPlacas': ['Administrador', 'Inspector', 'Almacén', 'Almacen'], 'statusMant': ['Administrador', 'Inspector', 'Mantenimiento'], 'statusFlota': ['Administrador', 'Inspector', 'Flota'], 'fleetrun': ['Administrador', 'Inspector', 'Mantenimiento'], 'auditoria': ['Administrador'], 'ubicacion': ['Administrador', 'Flota', 'Inspector', 'Mantenimiento'] };

window.cambiarModulo = function(modulo, idBoton) {
    let bloqueado = false;
    let p = permisosUsuario || {};
    let correoActual = (localStorage.getItem('fleet_correo') || '').toLowerCase();
    let isAdm = p?.admin === true || correoActual === 'admin@azkell.com';

    if (modulo === 'statusMant' && !isAdm && !p?.insp?.l) bloqueado = true;
    if ((modulo === 'placas' || modulo === 'almacenPlacas') && !isAdm && !p?.placas?.l) bloqueado = true;
    if (modulo === 'fleetrun' && !isAdm && !p?.fleet?.l) bloqueado = true;
    if (modulo === 'ubicacion' && !isAdm && !p?.gps?.l) bloqueado = true;
    if (modulo === 'statusFlota' && !isAdm && !p?.status?.l) bloqueado = true;

    if (bloqueado) return;

    document.querySelectorAll('.modulo-wrapper').forEach(m => { m.style.display = 'none'; });
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    if (idBoton) { const btnActivo = document.getElementById(idBoton); if (btnActivo) btnActivo.classList.add('active'); }
    const titulo = document.getElementById('tituloTopBar');

    if (modulo === 'dashboard') { cargarModuloAislado('dashboard'); }
    else if (modulo === 'placas' || modulo === 'almacenPlacas') { let el=document.getElementById('moduloPlacas'); if(el) el.style.display = 'flex'; if(titulo) titulo.innerText = (modulo === 'placas') ? 'Gestión de Placas' : 'Inventario de Placas'; cargarModulo('placas', mostrarPlacas, 'obtenerDatosPlacas'); }
    else if (modulo === 'fleetrun') { let el=document.getElementById('moduloFleetrun'); if(el) el.style.display = 'flex'; if(titulo) titulo.innerText = 'Sistema Fleetrun'; cargarModulo('fleetrun', mostrarFleetrun, 'obtenerDatosFleetrun'); }
    else if (modulo === 'statusMant') { cargarModuloAislado('mantenimiento/inspecciones'); }
    else if (modulo === 'ubicacion') { cargarModuloAislado('flota/ubicacion'); }

    if (window.innerWidth <= 768) closeSidebar();
    aplicarPermisosBotonesUI();
}

// =====================================================================
// 🔔 UX GLOBAL: Toasts, Progress Bar, Contadores, Empty States
// =====================================================================

window.mostrarToast = function(mensaje, tipo, duracion) {
    tipo     = tipo     || 'success';
    duracion = duracion || 3500;
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons  = { success:'bi-check-circle-fill', error:'bi-x-circle-fill', warning:'bi-exclamation-triangle-fill', info:'bi-info-circle-fill' };
    const colors = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
    const color  = colors[tipo] || colors.success;
    const icon   = icons[tipo]  || icons.success;
    const id     = 'toast-' + Date.now();

    const t = document.createElement('div');
    t.className = 'global-toast';
    t.id = id;
    t.style.setProperty('--toast-dur', duracion + 'ms');
    t.innerHTML =
        '<i class="bi ' + icon + ' toast-icon" style="color:' + color + '"></i>' +
        '<span class="toast-msg">' + mensaje + '</span>' +
        '<button class="toast-close" onclick="document.getElementById(\'' + id + '\').remove()" aria-label="Cerrar"><i class="bi bi-x"></i></button>' +
        '<div class="toast-progress" style="background:' + color + '"></div>';

    container.appendChild(t);
    requestAnimationFrame(function() { requestAnimationFrame(function() { t.classList.add('show'); }); });

    setTimeout(function() {
        t.classList.remove('show');
        setTimeout(function() { if (t.parentNode) t.remove(); }, 300);
    }, duracion);
};

// Override global de window.alert → redirige a toast automáticamente
// Upgradea toda la app sin tocar cada archivo individualmente
(function() {
    var _nativeAlert = window.alert;
    window.alert = function(msg) {
        var container = document.getElementById('toast-container');
        if (!container || typeof window.mostrarToast !== 'function') { _nativeAlert(msg); return; }
        var s = String(msg || '').replace(/\n/g, '<br>');
        var tipo = 'info';
        if (/^(error|❌|✗)/i.test(s))                                           tipo = 'error';
        else if (/✅|éxito|completad|guardad|eliminad|registrad|importad/i.test(s)) tipo = 'success';
        else if (/⚠️|warning|obligatorio|primero|vacío|inválido/i.test(s))      tipo = 'warning';
        var dur = tipo === 'error' ? 5000 : tipo === 'success' ? 3500 : 4000;
        window.mostrarToast(s, tipo, dur);
    };
})();

// Barra de progreso de navegación (uso interno de cargarModuloAislado)
window._navProgress = (function() {
    var _tick = null;
    var _prog = 0;
    return {
        start: function() {
            var bar = document.getElementById('nav-progress-bar');
            if (!bar) return;
            clearInterval(_tick);
            _prog = 0;
            bar.style.transition = 'none';
            bar.style.width = '0%';
            bar.classList.add('active');
            _tick = setInterval(function() {
                _prog = Math.min(_prog + Math.random() * 12, 85);
                bar.style.transition = 'width 0.3s ease';
                bar.style.width = _prog + '%';
            }, 250);
        },
        done: function() {
            var bar = document.getElementById('nav-progress-bar');
            if (!bar) return;
            clearInterval(_tick);
            bar.style.transition = 'width 0.2s ease';
            bar.style.width = '100%';
            setTimeout(function() {
                bar.classList.remove('active');
                bar.style.transition = 'none';
                bar.style.width = '0%';
            }, 280);
        }
    };
})();

window.animarContador = function(el, valorFinal, duracion) {
    if (!el || isNaN(valorFinal)) return;
    duracion = duracion || 800;
    if (document.body.classList.contains('reduce-motion')) { el.textContent = valorFinal; return; }
    var start = null;
    function step(ts) {
        if (!start) start = ts;
        var progress = Math.min((ts - start) / duracion, 1);
        var eased    = 1 - Math.pow(1 - progress, 3); // ease-out cúbico
        el.textContent = Math.round(eased * valorFinal);
        if (progress < 1) { requestAnimationFrame(step); }
        else { el.textContent = valorFinal; el.classList.add('counter-done'); setTimeout(function() { el.classList.remove('counter-done'); }, 350); }
    }
    requestAnimationFrame(step);
};

window.generarEstadoVacio = function(icono, titulo, descripcion, compacto) {
    icono       = icono       || 'bi-inbox';
    titulo      = titulo      || 'Sin datos';
    descripcion = descripcion || 'No hay registros para mostrar.';
    var cls = compacto ? 'empty-state empty-state-sm' : 'empty-state';
    return '<div class="' + cls + '">' +
        '<i class="bi ' + icono + ' empty-icon"></i>' +
        '<h5>' + titulo + '</h5>' +
        '<p>' + descripcion + '</p>' +
        '</div>';
};

// =====================================================================
// 🗺️ ROUTER UX: Títulos, Menú Activo y Persistencia de Ruta
// =====================================================================

const TITULOS_MODULOS = {
    'dashboard':                   'Centro de Comando',
    'mantenimiento/inspecciones':  'Análisis de Inspecciones',
    'mantenimiento/placas':        'Gestión de Placas',
    'mantenimiento/fleetrun':      'Sistema Fleetrun',
    'almacen/inventario':          'Inventario',
    'flota/status':                'Status de Flota',
    'flota/ubicacion':             'Ubicación GPS Flota',
    'directorio/conductores':      'Directorio de Conductores',
    'sistema/usuarios':            'Gestión de Usuarios',
    'sistema/auditoria':           'Bitácora de Auditoría',
};

const MENU_IDS = {
    'dashboard':                   'nav-dashboard',
    'mantenimiento/inspecciones':  'nav-inspecciones',
    'mantenimiento/placas':        'nav-placas',
    'mantenimiento/fleetrun':      'nav-fleetrun',
    'almacen/inventario':          'nav-inventario',
    'flota/status':                'nav-status-flota',
    'flota/ubicacion':             'nav-ubicacion',
    'directorio/conductores':      'nav-conductores',
    'sistema/usuarios':            'nav-usuarios',
    'sistema/auditoria':           'nav-auditoria',
};

const MENU_SECTION = {
    'mantenimiento/inspecciones': 'mantenimiento',
    'mantenimiento/placas':       'mantenimiento',
    'mantenimiento/fleetrun':     'mantenimiento',
    'almacen/inventario':         'almacen',
    'flota/status':               'flota',
    'flota/ubicacion':            'flota',
    'directorio/conductores':     'directorio',
    'sistema/usuarios':           'sistema',
    'sistema/auditoria':          'sistema',
};

function actualizarTituloHeader(ruta) {
    const titulo = document.getElementById('tituloTopBar');
    if (titulo) titulo.innerText = TITULOS_MODULOS[ruta] || 'Azkell Fleet';
}

function marcarMenuActivo(ruta) {
    document.querySelectorAll('#sidebarMenu .nav-item').forEach(a => a.classList.remove('active'));
    document.querySelectorAll('.nav-section-toggle').forEach(b => b.classList.remove('section-has-active'));
    const idActivo = MENU_IDS[ruta];
    if (idActivo) {
        const el = document.getElementById(idActivo);
        if (el) el.classList.add('active');
    }
    // Marcar sección padre y auto-expandir si está colapsada
    const seccion = MENU_SECTION[ruta];
    if (seccion) {
        const sectionBtn = document.querySelector('.nav-section-toggle[data-section="' + seccion + '"]');
        if (sectionBtn) sectionBtn.classList.add('section-has-active');
        const sectionItems = document.getElementById('section-items-' + seccion);
        if (sectionItems && sectionItems.classList.contains('nav-section-collapsed')) {
            window.toggleNavSection(seccion);
        }
    }
}

window.cargarConfigSection = function(section) {
    window._pendingCfgSection = section;
    document.querySelectorAll('#sidebarMenu .nav-item').forEach(a => a.classList.remove('active'));
    document.querySelectorAll('.nav-section-toggle').forEach(b => b.classList.remove('section-has-active'));
    const cfgMap = { perfil:'nav-cfg-perfil', apariencia:'nav-cfg-apariencia', accesibilidad:'nav-cfg-accesibilidad', idioma:'nav-cfg-idioma' };
    const el = document.getElementById(cfgMap[section] || 'nav-cfg-perfil');
    if (el) el.classList.add('active');
    // Marcar sección configuración como activa
    const cfgBtn = document.querySelector('.nav-section-toggle[data-section="configuracion"]');
    if (cfgBtn) cfgBtn.classList.add('section-has-active');
    // Auto-expandir si estaba colapsada
    const cfgItems = document.getElementById('section-items-configuracion');
    if (cfgItems && cfgItems.classList.contains('nav-section-collapsed')) {
        window.toggleNavSection('configuracion');
    }
    cargarModuloAislado('sistema/configuracion');
};

window.cargarModuloAislado = async function(rutaModulo) {
    // 🔒 GUARDAR RUTA ACTUAL — ignora login para evitar infinite loop
    if (rutaModulo !== 'login') localStorage.setItem('fleet_rutaActual', rutaModulo);

    // 🧹 LIMPIEZA BOOTSTRAP — elimina backdrops huérfanos y clases del body
    document.querySelectorAll('.modal-backdrop, .offcanvas-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open', 'offcanvas-open');
    document.body.style.paddingRight = '';
    document.body.style.overflow = '';

    // ⏳ PROGRESS BAR
    window._navProgress.start();

    // 1. Ocultar TODOS los módulos antiguos que siguen en el Index.html
    document.querySelectorAll('.modulo-wrapper, .container-fluid').forEach(el => {
        if(el.id && el.id.startsWith('modulo')) el.style.display = 'none';
    });

    // 2. Asegurar que el contenedor principal sea visible
    const appCrm = document.getElementById('app-crm');
    if (appCrm) appCrm.style.display = 'flex';

    // 3. Mostrar nuestro escenario dinámico y poner un spinner
    const root = document.getElementById('root-dinamico');
    if (root) {
        root.style.display = 'flex';
        root.style.flexDirection = 'column';
        root.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted fw-bold">Cargando módulo...</p></div>';
    } else {
        console.error('Elemento root-dinamico no encontrado');
        return;
    }

    // Ruta en disco — todo minúsculas (compatible con Linux/Render)
    const _rutaDisco = '/modulos/' + rutaModulo;

    try {
        // 3. Traer el diseño (HTML) desde la carpeta específica
        const respHTML = await fetch(`${_rutaDisco}/vista.html`);
        if(!respHTML.ok) throw new Error(`No se encontró vista.html en ${_rutaDisco}`);
        root.innerHTML = ''; // limpieza explícita — evita solapamiento si dos navegaciones se solapan
        root.innerHTML = await respHTML.text();
        if (typeof window.applyI18n === 'function') window.applyI18n();

        // UX: actualizar título del header y resaltar enlace activo en el sidebar
        actualizarTituloHeader(rutaModulo);
        marcarMenuActivo(rutaModulo);

        // 4. Crear un ID único para el script (ej: script-mantenimiento-placas)
        const scriptId = `script-${rutaModulo.replace('/', '-')}`;

        // 5. Inyectar la lógica (JS) solo si no se ha cargado antes
        if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = `${_rutaDisco}/logica.js`;
            // Llamar la función init una vez que el JS ha cargado por primera vez
            let nombreCarpeta = rutaModulo.split('/')[1] || rutaModulo.split('/')[0];
            let funcionInit = `init_${nombreCarpeta}`;
            script.onload = function() {
                if (typeof window[funcionInit] === 'function') window[funcionInit]();
            };
            document.body.appendChild(script);
        } else {
            // Si el JS ya estaba cargado, llamamos a su función de inicio automático (si existe)
            let nombreCarpeta = rutaModulo.split('/')[1] || rutaModulo.split('/')[0];
            let funcionInit = `init_${nombreCarpeta}`;
            if (typeof window[funcionInit] === 'function') {
                window[funcionInit]();
            }
        }
        window._navProgress.done();
    } catch(e) {
        window._navProgress.done();
        if (root) root.innerHTML = `<div class="alert alert-danger m-4 shadow-sm"><i class="bi bi-exclamation-triangle-fill"></i> Error de Arquitectura: ${e.message}</div>`;
    }
};

function procesadorErroresCuota(datos, containerId) {
    if (typeof datos === 'string' && datos.includes('ERROR_BACKEND')) {
        let msg = datos;
        if(datos.includes('Quota exceeded') || datos.includes('Límite')) msg = "🚨 <b>Límite de Lecturas de Firebase Alcanzado (50,000 al día)</b>.<br>El sistema se ha pausado por hoy para no generar cobros. Usa tu caché local o se reactivará solo a medianoche.";

        let containerEl = document.getElementById(containerId);
        if (containerEl) containerEl.innerHTML = `<tr><td colspan="15" class="text-center py-5 text-danger fs-6">${msg}</td></tr>`;
        return true;
    }
    return false;
}

function sortTable(tableId, colIndex) { const table = document.getElementById(tableId); const tbody = table.querySelector('tbody'); const rows = Array.from(tbody.querySelectorAll('tr')); if (rows.length === 0 || rows[0].innerText.includes('Cargando') || rows[0].innerText.includes('Selecciona')) return; let dir = table.getAttribute('data-sort-dir') === 'asc' ? 'desc' : 'asc'; table.setAttribute('data-sort-dir', dir); const headers = table.querySelectorAll('th'); headers.forEach((th, idx) => { let icon = th.querySelector('i'); if (icon && idx !== headers.length - 1) { icon.className = (idx === colIndex) ? (dir === 'asc' ? 'bi bi-sort-alpha-down ms-1 text-warning' : 'bi bi-sort-alpha-up ms-1 text-warning') : 'bi bi-arrow-down-up ms-1 text-muted'; } }); rows.sort((a, b) => { const cellA = a.querySelectorAll('td')[colIndex]?.innerText.trim().toLowerCase() || ''; const cellB = b.querySelectorAll('td')[colIndex]?.innerText.trim().toLowerCase() || ''; const matchA = cellA.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); const matchB = cellB.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (matchA && matchB) { const dA = new Date(matchA[3], matchA[2]-1, matchA[1]).getTime(); const dB = new Date(matchB[3], matchB[2]-1, matchB[1]).getTime(); if (dA !== dB) return dir === 'asc' ? dA - dB : dB - dA; } const numA = cellA.match(/-?(\d+)/); const numB = cellB.match(/-?(\d+)/); if (numA && numB && !cellA.includes('uts')) return dir === 'asc' ? parseInt(numA[0]) - parseInt(numB[0]) : parseInt(numB[0]) - parseInt(numA[0]); if (cellA < cellB) return dir === 'asc' ? -1 : 1; if (cellA > cellB) return dir === 'asc' ? 1 : -1; return 0; }); rows.forEach(row => tbody.appendChild(row)); }

function descargarExcelDinamico(tablaId, nombreArchivo) { 
  let table = document.getElementById(tablaId); let rows = table.querySelectorAll('tr'); let data = [];
  rows.forEach(row => {
      if(row.style.display !== 'none' && !row.classList.contains('group-header')) {
          let rowData = []; let cells = row.querySelectorAll('th, td');
          for(let i=0; i<cells.length-1; i++) { 
              let val = cells[i].getAttribute('data-value');
              if(val === null || val === undefined) val = cells[i].textContent.trim(); 
              val = val.replace(/^∟/g, '').trim(); 
              rowData.push(val); 
          }
          if(rowData.length > 0) data.push(rowData);
      }
  });
  let ws = XLSX.utils.aoa_to_sheet(data); let wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos"); XLSX.writeFile(wb, nombreArchivo + ".xlsx");
}


function initGrafico(canvasId) {
    let ctx = document.getElementById(canvasId); if(!ctx) return null;
    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Vigentes', 'Vencidas'], datasets: [{ data: [1], backgroundColor: ['#475569'], borderWidth: 2, hoverOffset: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            layout: { padding: { left: 10, right: 10, top: 10, bottom: 10 } },
            plugins: {
                legend: { position: 'bottom', labels: { font: {family: 'Inter', weight: 'bold'} } },
                datalabels: {
                    color: '#000000',
                    font: { weight: 'bold', size: 12, family: 'Inter' },
                    formatter: (value, context) => {
                        let total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        if (total === 0 || value === 0 || context.chart.data.labels[0]==='Sin Datos') return "";
                        return Math.round((value / total) * 100) + "%";
                    }
                }
            }
        }
    });
}
function updateGraficosEnVivo(vigTot, noVigTot, vigMot, noVigMot, vigNoMot, noVigNoMot) {
    // Si el canvas fue reemplazado por el SPA router, destruir la instancia obsoleta
    if (chartTotalInst    && !document.contains(chartTotalInst.canvas))    { chartTotalInst.destroy();    chartTotalInst    = null; }
    if (chartMotorasInst  && !document.contains(chartMotorasInst.canvas))  { chartMotorasInst.destroy();  chartMotorasInst  = null; }
    if (chartNoMotorasInst && !document.contains(chartNoMotorasInst.canvas)) { chartNoMotorasInst.destroy(); chartNoMotorasInst = null; }
    if(!chartTotalInst) chartTotalInst = initGrafico('chartTotal');
    if(!chartMotorasInst) chartMotorasInst = initGrafico('chartMotoras');
    if(!chartNoMotorasInst) chartNoMotorasInst = initGrafico('chartNoMotoras');

    function refrescarDatos(chart, v, nv) {
        if(!chart) return;
        if(v + nv === 0) { chart.data.labels = ['Sin Datos']; chart.data.datasets[0].data = [1]; chart.data.datasets[0].backgroundColor = ['#475569']; }
        else { chart.data.labels = ['Vigentes', 'Vencidas']; chart.data.datasets[0].data = [v, nv]; chart.data.datasets[0].backgroundColor = ['#10b981', '#ef4444']; }
        chart.update();
    }
    refrescarDatos(chartTotalInst, vigTot, noVigTot); refrescarDatos(chartMotorasInst, vigMot, noVigMot); refrescarDatos(chartNoMotorasInst, vigNoMot, noVigNoMot);
    actualizarColoresGraficos();
}

// FUNCIÓN PARA CAMBIAR COLOR DINÁMICO DE GRÁFICOS (MODO OSCURO/CLARO)
function actualizarColoresGraficos() {
    const charts = [
        typeof chartTotalInst !== 'undefined' ? chartTotalInst : null,
        typeof chartMotorasInst !== 'undefined' ? chartMotorasInst : null,
        typeof chartNoMotorasInst !== 'undefined' ? chartNoMotorasInst : null,
        typeof chartFleetrunInst !== 'undefined' ? chartFleetrunInst : null
    ];

    const isDark = document.body.classList.contains('dark');
    const textColor = isDark ? '#f8fafc' : '#1a1a2e';
    const borderColor = isDark ? '#1e293b' : '#ffffff';
    const labelColor = isDark ? '#ffffff' : '#000000';

    charts.forEach(chart => {
        if (chart) {
            chart.options.plugins.legend.labels.color = textColor;
            if(chart.options.plugins.datalabels) {
                chart.options.plugins.datalabels.color = labelColor;
            }
            chart.data.datasets[0].borderColor = borderColor;
            chart.update();
        }
    });
}

// ==========================================
// 🔥 FASE 3: GENERADOR DINÁMICO DEL SÚPER WIZARD 🔥
// ==========================================
// ==========================================
// FASE 3: GENERADOR DINÁMICO DEL SÚPER WIZARD
// ==========================================
const WIZARD_SCHEMA = [
    { tab: "1. REGISTRO", type: "registro" },
    { tab: "2. II. MOTOR", items: ["1. Niveles de Motor", "2. Sistema lubricacion de fugas", "3. Sistema Combustible", "4. Sistema de Refrigeracion", "5. Correas, ventilador y accesorios", "6. Codigo Falla", "II.7 Otros"] },
    { tab: "3. III. S. ELÉCTRICO", items: ["1. Inspeccion de Luces General", {label: "2. Amperaje de bateria", type:"text"}] },
    { tab: "4. S. DE AIRE", items: ["Inspeccion General de Aire", "Mantenimiento de Valvulas", "Inspeccion de Manitos de aire"] },
    { tab: "5. IV. TRANSMISIÓN", items: ["1. Embrague", "2. Caja de Cambios", "3. Diferencial", "4. Cardanes", "IV. 5 Otros"] },
    { tab: "6. V. DIRECCIÓN", items: ["1. Servo direccion", "2. Alinemiento", "3. Pines, bocinas y terminales", "4. CAJA DE DIRECCION", "V.5 Otros"] },
    { tab: "7. VI. FRENOS", items: ["1. Limpieza y regulacion", {label: "Zapatas Delanteras /Pastillas Delanteras", type:"percent"}, {label: "Zapata De Traccion/Primer Eje De Traccion", type:"percent"}, {label: "Zapatas Eje Loco/ Segundo Eje De Traccion", type:"percent"}, {label: "Disco De Embrague", type:"percent"}, "VI.4 Otros"] },
    { tab: "8. VII. SUSPENSIÓN", items: ["1. Mueles, Bolsas De Aire", "VII 2. Amortiguadores", "VII 3. Eje Barras Estabilizadoraa", "VII.4 Otros"] },
    { tab: "9. VIII. HERMETIZADO", items: ["VIII.1 Cabina Exterior e Interior", "VIII.2 Puerta, chapa y asientos", "VIII.3 Chasis, tornamesa y bastidor", "VIII.4 Furgon extructuras laterales", "VIII.5 Otros"] },
    { tab: "10. IX. DAÑOS", items: [{label: "IX. Daños Encontrados", type:"text"}] },
    { tab: "11. X. FIRMA", type: "firma" }
];

function generarWizardFase3() {
    let htmlHeaders = ''; let htmlTabs = '';
    htmlTabs += `<input type="hidden" id="i_id_inspeccion" value="">`;

    WIZARD_SCHEMA.forEach((sec, i) => {
        htmlHeaders += `<div class="wizard-step ${i===0?'active':''}" id="step-btn-${i}" onclick="cambiarPestana(${i})">${sec.tab}</div>`;
        htmlTabs += `<div class="wizard-tab ${i===0?'active':''}" id="tab-${i}">`;
        htmlTabs += `<h5 class="fw-bold mb-3 border-bottom pb-2 text-primary">${sec.tab.substring(sec.tab.indexOf(' ')+1)}</h5>`;

        if(sec.type === "registro") {
            htmlTabs += `<div class="row">
                <div class="col-md-4 mb-3">
                    <label class="fw-bold">Fecha de Ingreso</label>
                    <input type="date" class="form-control fw-bold text-primary border-primary shadow-sm" id="i_fecha" required>
                </div>
                <div class="col-md-4 mb-3">
                    <label class="fw-bold text-primary d-flex justify-content-between">
                        <span><i class="bi bi-truck"></i> Placa *</span>
                        <a href="#" class="text-success small fw-bold text-decoration-none" onclick="document.getElementById('formPlaca').reset(); new bootstrap.Modal(document.getElementById('modalPlaca')).show();"><i class="bi bi-plus-circle-fill"></i> Nueva Placa</a>
                    </label>
                    <input type="text" class="form-control text-uppercase border-primary fw-bold shadow-sm" id="i_placa" list="dl-placas" onchange="autocompletarInfoInsp()" oninput="autocompletarInfoInsp()" placeholder="Escribe para buscar..." autocomplete="off" required>
                </div>
                <div class="col-md-4 mb-3">
                    <label class="fw-bold">KM Tablero (Opcional)</label>
                    <input type="number" class="form-control text-danger fw-bold border-danger shadow-sm" id="i_kmtablero" placeholder="Ej: 150000">
                </div>
            </div>
            <div class="row">
                <div class="col-md-4 mb-3">
                    <label class="fw-bold text-secondary">Dueño (Cliente)</label>
                    <input type="text" class="form-control bg-light shadow-sm" id="i_cliente" readonly>
                </div>
                <div class="col-md-4 mb-3">
                    <label class="form-label fw-bold text-secondary">Tipo</label>
                    <input type="text" class="form-control bg-light text-uppercase shadow-sm" id="i_modelo" readonly>
                </div>
                <div class="col-md-4 mb-3">
                    <label class="form-label fw-bold text-secondary"><i class="bi bi-geo-alt-fill"></i> KM GPS (Wialon)</label>
                    <input type="number" class="form-control text-primary bg-light fw-bold shadow-sm" id="i_kmgps" readonly placeholder="Calculando...">
                </div>
            </div>`;
        }
        else if (sec.type === "firma") {
            htmlTabs += `<div class="row"><div class="col-md-8 mb-3"><label class="fw-bold text-primary">Técnico Inspector</label><input type="text" class="form-control fw-bold text-uppercase" id="i_tecnico" list="dl-tecnicos" placeholder="Selecciona o escribe uno nuevo" required></div><div class="col-md-4 mb-3"><label class="fw-bold text-primary">Días Propuestos</label><input type="number" class="form-control fw-bold" id="i_dias" value="30"></div></div><div class="mb-3"><label class="fw-bold text-primary mb-2"><i class="bi bi-pen"></i> Firma del Técnico</label><canvas id="canvasFirma" class="firma-pad shadow-sm"></canvas><button type="button" class="btn btn-sm btn-outline-danger mt-2 w-100 fw-bold" onclick="limpiarFirma()"><i class="bi bi-eraser"></i> Borrar Firma</button></div>`;
        }
        else {
            sec.items.forEach((item, j) => {
                let lbl = typeof item === 'string' ? item : item.label; let t = typeof item === 'string' ? 'okfalla' : item.type; let uid = `p_${i}_${j}`;
                htmlTabs += `<div class="pregunta-box"><label class="fw-bold text-secondary">${lbl}</label>`;

                if (t === 'okfalla') {
                    htmlTabs += `<div class="btn-group w-100 mt-2 shadow-sm" role="group">
                        <input type="radio" class="btn-check" name="${uid}" id="${uid}_ok" value="OK" onclick="toggleRadioOkFalla(this, 'f_${uid}', false)">
                        <label class="btn btn-outline-success fw-bold" for="${uid}_ok">OK</label>
                        <input type="radio" class="btn-check" name="${uid}" id="${uid}_fa" value="FALLA" onclick="toggleRadioOkFalla(this, 'f_${uid}', true)">
                        <label class="btn btn-outline-danger fw-bold" for="${uid}_fa">FALLA</label>
                    </div>
                    <div id="f_${uid}" style="display:none;" class="mt-3 p-3 bg-light rounded border-start border-danger border-4 shadow-inner">
                        <label class="form-label text-danger fw-bold"><i class="bi bi-pencil-square"></i> Observación</label>
                        <textarea class="form-control mb-2 border-danger" rows="2" id="obs_${uid}" placeholder="Describe la falla..."></textarea>
                        <label class="form-label text-danger fw-bold mt-2"><i class="bi bi-camera"></i> Evidencia (Opcional)</label>
                        <input type="file" class="form-control border-danger form-control-sm" id="foto_${uid}" accept="image/*">
                    </div>`;
                } else if (t === 'percent') {
                    htmlTabs += `<input type="hidden" id="val_${uid}" value=""><div class="percent-grid mt-2">`;
                    [10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100].forEach(pct => { htmlTabs += `<button type="button" class="btn btn-outline-primary btn-sm fw-bold pct-btn pct-${uid} shadow-sm" onclick="seleccionarPorcentaje('${uid}', ${pct}, this)">${pct}%</button>`; });
                    htmlTabs += `</div>`;
                } else if (t === 'text') {
                    htmlTabs += `<textarea class="form-control mt-2 border-primary" rows="2" id="txt_${uid}" placeholder="Ingresa el detalle..."></textarea>`;
                }
                htmlTabs += `</div>`;
            });
        }
        htmlTabs += `</div>`;
    });

    let wH = document.getElementById('wizardHeaders'); if(wH) wH.innerHTML = htmlHeaders;
    let wD = document.getElementById('wizard-dynamic-tabs'); if(wD) wD.innerHTML = htmlTabs;
}


function moverWizard(step) { let n = currentTab + step; if(n >= 0 && n < WIZARD_SCHEMA.length) cambiarPestana(n); }
function initFirma() { canvasFirma = document.getElementById('canvasFirma'); if(!canvasFirma) return; ctxFirma = canvasFirma.getContext('2d'); canvasFirma.width = canvasFirma.offsetWidth; canvasFirma.height = canvasFirma.offsetHeight; ctxFirma.lineWidth = 3; ctxFirma.lineCap = 'round'; ctxFirma.strokeStyle = '#000000'; canvasFirma.onmousedown = startDrawing; canvasFirma.onmouseup = stopDrawing; canvasFirma.onmousemove = draw; canvasFirma.onmouseout = stopDrawing; canvasFirma.addEventListener('touchstart', startDrawingTouch, {passive: false}); canvasFirma.addEventListener('touchend', stopDrawing); canvasFirma.addEventListener('touchmove', drawTouch, {passive: false}); }
function startDrawing(e) { dibujando = true; draw(e); } function stopDrawing() { dibujando = false; ctxFirma.beginPath(); }
function draw(e) { if (!dibujando) return; let rect = canvasFirma.getBoundingClientRect(); ctxFirma.lineTo(e.clientX - rect.left, e.clientY - rect.top); ctxFirma.stroke(); ctxFirma.beginPath(); ctxFirma.moveTo(e.clientX - rect.left, e.clientY - rect.top); }
function startDrawingTouch(e) { e.preventDefault(); dibujando = true; drawTouch(e); }
function drawTouch(e) { if (!dibujando) return; e.preventDefault(); let rect = canvasFirma.getBoundingClientRect(); let touch = e.touches[0]; ctxFirma.lineTo(touch.clientX - rect.left, touch.clientY - rect.top); ctxFirma.stroke(); ctxFirma.beginPath(); ctxFirma.moveTo(touch.clientX - rect.left, touch.clientY - rect.top); }
function limpiarFirma() { if(ctxFirma && canvasFirma) { ctxFirma.clearRect(0, 0, canvasFirma.width, canvasFirma.height); ctxFirma.beginPath(); } }


function rellenarDatalist(id, setObj) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
        el.innerHTML = '<option value="">Seleccione...</option>';
        Array.from(setObj).sort().forEach(v => { el.innerHTML += `<option value="${v}">${v}</option>`; });
    } else {
        el.innerHTML = '';
        Array.from(setObj).sort().forEach(v => { el.innerHTML += `<option value="${v}">`; });
    }
}
function autocompletarRuc(clienteIngresado, inputRucId) { let rucInput = document.getElementById(inputRucId); if (!rucInput || !clienteIngresado) return; let match = dataGlobalPlacas.find(p => p[1] && p[1].trim().toLowerCase() === clienteIngresado.trim().toLowerCase() && p[2] && p[2].trim() !== "" && p[2].trim() !== "-"); if (match) { rucInput.value = match[2].trim(); } }
function rellenarFiltroCheck(idLista, setObj, fnName) {
    const ul = document.getElementById(idLista);
    if (!ul) return;
    ul.innerHTML = '';
    Array.from(setObj).sort().forEach(v => {
        if (v.trim() && v.trim() !== '-') {
            ul.innerHTML += `<li><label class="dropdown-item form-check-label d-flex align-items-center"><input type="checkbox" class="form-check-input me-2 mt-0" value="${v}" onchange="${fnName}()"> ${v}</label></li>`;
        }
    });
}
function cargarTablaFleetrun(forzarRefresh = false) {
    if(!forzarRefresh && dataGlobalFleetrun.length > 0) {
        mostrarFleetrun(dataGlobalFleetrun);
        return;
    }
    let cuerpoTablaFleetrunEl = document.getElementById('cuerpoTablaFleetrun');
    if (cuerpoTablaFleetrunEl) cuerpoTablaFleetrunEl.innerHTML = '<tr><td colspan="10" class="text-center py-4"><span class="spinner-border text-warning spinner-border-sm"></span> Cargando...</td></tr>';
    google.script.run.withSuccessHandler(mostrarFleetrun).obtenerDatosFleetrun();
}
function toggleVistaFleetrun() { isHistorialFleetrun = !isHistorialFleetrun; let textBtn = document.getElementById('text-toggle-fleetrun'); if(textBtn) { textBtn.innerText = isHistorialFleetrun ? "Ver Últimos Preventivos" : "Ver Historial Completo"; } expandAllState = false; mostrarFleetrun(dataGlobalFleetrun); }
function toggleGroupRow(className, trElement) { let rows = document.querySelectorAll('.' + className); let icon = trElement.querySelector('i'); let isHidden = false; if(rows.length > 0) isHidden = rows[0].style.display === 'none'; rows.forEach(row => { row.style.display = isHidden ? '' : 'none'; }); if(icon) { icon.className = isHidden ? "bi bi-chevron-down ms-1 me-2 text-warning" : "bi bi-chevron-right ms-1 me-2 text-warning"; } }
function toggleAllFleetrunGroups() { expandAllState = !expandAllState; const rows = document.querySelectorAll('.child-row-fleetrun'); const icons = document.querySelectorAll('#cuerpoTablaFleetrun .group-header i'); rows.forEach(row => { let header = row.previousElementSibling; while(header && !header.classList.contains('group-header')) { header = header.previousElementSibling; } if(header && header.style.display !== 'none') { row.style.display = expandAllState ? '' : 'none'; } }); icons.forEach(i => { if(i.classList.contains('text-warning')) { i.className = expandAllState ? "bi bi-chevron-down ms-1 me-2 text-warning" : "bi bi-chevron-right ms-1 me-2 text-warning"; } }); }

function mostrarFleetrun(datos) {
  if (procesadorErroresCuota(datos, 'cuerpoTablaFleetrun')) return;
  dataGlobalFleetrun = datos;

  // 1. Convertidor de fechas a prueba de fallos (convierte DD/MM/YYYY a un número para ordenar)
  let parseFecha = (str) => {
      if(!str) return 0;
      let p = str.split('/');
      if(p.length === 3) return new Date(p[2], p[1]-1, p[0]).getTime();
      return new Date(str).getTime() || 0;
  };

  // 2. Ordenamos obligatoriamente del MÁS NUEVO al MÁS VIEJO
  let datosOrdenados = [...datos].sort((a,b) => parseFecha(b[3]) - parseFecha(a[3]));

  let datosAMostrar = [];
  if (isHistorialFleetrun) {
      datosAMostrar = datosOrdenados;
  } else {
      let mapa = new Map();
      datosOrdenados.forEach(row => {
          let placa = normalizeStr(row[4]);
          let tipo = normalizeStr(row[8]);
          let key = placa + "_" + tipo; // Agrupamos por Placa + Tipo MP

          let infoPlaca = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placa);

          // Al estar ordenado, el primer registro que entra al Map es el último que se hizo
          if (infoPlaca && infoPlaca[18] === 'Activa' && !mapa.has(key)) {
              mapa.set(key, row);
          }
      });
      datosAMostrar = Array.from(mapa.values());
  }

  let html = '';
  let cntVig = 0, cntPV = 0, cntVenc = 0;
  if(!datosAMostrar || datosAMostrar.length === 0) { html = '<tr><td colspan="10" class="text-center py-4" style="color: var(--subtext) !important;">No hay mantenimientos.</td></tr>'; }
  else {
      let p = permisosUsuario || {}; let isAdmF = p.admin === true || (localStorage.getItem('fleet_correo') || '').toLowerCase() === 'admin@azkell.com'; let canEditF = isAdmF || p.fleet?.e === true; let canDeleteF = isAdmF || p.fleet?.d === true; let setFClientes = new Set(); let setFUts = new Set(); let mapPlacas = new Map(); 
      datosAMostrar.forEach((fila) => { let placaRaw = fila[4] || "-"; if(!mapPlacas.has(placaRaw)) mapPlacas.set(placaRaw, []); mapPlacas.get(placaRaw).push(fila); });
      mapPlacas.forEach((mantenimientos, placaRaw) => {
          let infoP = dataGlobalPlacas.find(p => p[0] === placaRaw); let cli = infoP ? infoP[1] : (mantenimientos[0][6] || "-"); let utsRaw = (infoP && infoP[19] && String(infoP[19]).trim() !== '') ? infoP[19] : (mantenimientos[0][7] || "-"); let utsDisplay = (utsRaw === "-" || utsRaw === "") ? "-" : utsRaw.charAt(0).toUpperCase() + utsRaw.slice(1).toLowerCase();
          let isActive = infoP && infoP[18] === 'Activa'; if(isActive && cli && cli !== "-") setFClientes.add(cli); if(utsDisplay !== "-") setFUts.add(utsDisplay);
          let classPlaca = normalizarClase(placaRaw);
          html += `<tr class="group-header data-row-fleetrun" style="cursor:pointer;" onclick="toggleGroupRow('child-${classPlaca}', this)" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}">
              <td colspan="10" class="fw-bold text-start" style="background-color: rgba(128,128,128,0.1) !important; color: var(--text) !important;"><i class="bi bi-chevron-right ms-1 me-2 text-warning toggle-icon-${classPlaca}"></i> <span style="display:inline-block; min-width:80px;">${placaRaw}</span><span class="badge bg-secondary ms-2">${cli}</span><span class="badge bg-info text-dark ms-2">${utsDisplay}</span><span class="badge bg-warning text-dark float-end">${mantenimientos.length} Registros</span></td></tr>`;
          mantenimientos.forEach((fila) => {
              let id = fila[0]; let fechaStr = fila[3]; let tipo_mp = fila[8]; let obs = fila[14] || ''; let km_cambio = parseFloat(fila[9]) || 0; let frecuencia = parseFloat(fila[10]) || 0; let km_prox = parseFloat(fila[11]) || 0; let fechaLimpia = parseDateToDDMMYYYY(fechaStr);
              
              // 🔥 WIALON GPS INYECCIÓN EN FLEETRUN 🔥
              let km_gps = parseFloat(fila[14]) || 0;
              let isLive = false;
              let wialonData = buscarWialonPorPlaca(placaRaw);
              if (wialonData) {
                  km_gps = wialonData.km;
                  isLive = true;
              }
              
              let falta_km = km_prox - km_gps; let badgeClass = ""; let iconFalta = ""; let estadoKpi = "";
              if (falta_km <= 0) { badgeClass = "bg-danger text-white"; iconFalta = `<i class="bi bi-exclamation-circle-fill"></i>`; estadoKpi = "VENCIDO"; cntVenc++;
              } else if (falta_km > 0 && ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100))) { badgeClass = "bg-warning text-dark"; iconFalta = `<i class="bi bi-exclamation-triangle-fill"></i>`; estadoKpi = "POR_VENCER"; cntPV++;
              } else { badgeClass = "bg-success text-white"; iconFalta = `<i class="bi bi-check-circle-fill"></i>`; estadoKpi = "VIGENTE"; cntVig++; }
              let fmtTipo = `<span style="color: #2D438A; font-weight: bold;">${tipo_mp}</span>`; let fmtFrec = `<span style="color: orange; font-weight: bold;">${frecuencia.toLocaleString()}</span>`;

              let fmtKmGps = isLive ? `<span class="badge bg-primary shadow-sm px-2"><i class="bi bi-broadcast"></i> ${km_gps.toLocaleString()}</span>` : `<span style="color: #64748b; font-weight: bold;">${km_gps.toLocaleString()}</span>`;
              let fmtFalta = `<span class="badge ${badgeClass} shadow-sm" style="font-size: 0.8rem; padding: 0.4em 0.6em;">${iconFalta} ${falta_km.toLocaleString()}</span>`;
              
              let menuAcciones = ''; if (canEditF || canDeleteF) { let items = ''; if(canEditF) items += `<li><a class="dropdown-item" href="#" onclick="abrirModalEditarFleetrun('${id}')"><i class="bi bi-pencil text-primary"></i> Editar</a></li>`; if(canEditF && canDeleteF) items += `<li><hr class="dropdown-divider"></li>`; if(canDeleteF) items += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${id}', 'Fleetrun')"><i class="bi bi-trash"></i> Eliminar</a></li>`; menuAcciones = `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${items}</ul></div>`; } else { menuAcciones = `<span class="text-muted"><i class="bi bi-dash"></i></span>`; }
              let chkHtml = (window.modoSeleccion && window.modoSeleccion['fleetrun']) ? `<input type="checkbox" class="form-check-input float-start ms-2 chk-bulk-fleetrun" value="${id}" onclick="event.stopPropagation(); toggleBulkBtn('fleetrun')">` : '';
              let originalIndex = dataGlobalFleetrun.findIndex(x => x[0] === id);
              html += `<tr class="child-${classPlaca} clickable-row data-row-fleetrun child-row-fleetrun" style="display:none;" onclick="if(window.modoSeleccion&&window.modoSeleccion['fleetrun']){seleccionarFilaFleetrun(event,this)}else if(!event.target.closest('.dropdown')&&!event.target.closest('.btn-icon-dropdown')){mostrarDetalleFleetrun(${originalIndex})}" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}" data-fecha="${fechaLimpia}" data-estado-kpi="${estadoKpi}"><td class="text-end text-muted" style="font-size: 0.75rem;" data-value="${placaRaw}">${chkHtml}∟</td><td>${fechaLimpia}</td><td>${fmtTipo}</td><td>${km_cambio.toLocaleString()}</td><td>${fmtFalta}</td><td>${km_prox.toLocaleString()}</td><td class="text-truncate" style="max-width: 150px;">${obs}</td><td>${fmtFrec}</td><td>${fmtKmGps}</td><td>${menuAcciones}</td></tr>`;
          });
      });
      rellenarFiltroCheck('filtroFleetCliente', setFClientes, 'filtrarFleetrunAvanzado'); rellenarFiltroCheck('filtroFleetUts', setFUts, 'filtrarFleetrunAvanzado');
  }
  let cuerpoTablaFleetrunEl2 = document.getElementById('cuerpoTablaFleetrun');
  if (cuerpoTablaFleetrunEl2) cuerpoTablaFleetrunEl2.innerHTML = html;
  let kpiV = document.getElementById('kpi-fleet-vigentes'); if(kpiV) kpiV.textContent = cntVig;
  let kpiP = document.getElementById('kpi-fleet-porvencer'); if(kpiP) kpiP.textContent = cntPV;
  let kpiVe = document.getElementById('kpi-fleet-vencidos'); if(kpiVe) kpiVe.textContent = cntVenc;
  if (!isHistorialFleetrun) { updateGraficoFleetrun(cntVig, cntPV, cntVenc); }
}
window.filtrarFleetrunAvanzado = function() {
    const txt = document.getElementById('buscadorFleetrun')?.value.toLowerCase() || '';
    const dateF = document.getElementById('buscadorFechaFleetrun')?.value || '';
    let dateCompare = ''; if(dateF) { let p = dateF.split('-'); dateCompare = `${p[2]}/${p[1]}/${p[0]}`; }
    const chkCli = Array.from(document.querySelectorAll('#filtroFleetCliente input:checked')).map(e=>e.value);
    const chkUts = Array.from(document.querySelectorAll('#filtroFleetUts input:checked')).map(e=>e.value);
    const chkEst = Array.from(document.querySelectorAll('#filtroFleetEstado input:checked')).map(e=>e.value);

    let isFiltering = txt !== '' || dateCompare !== '' || chkCli.length > 0 || chkUts.length > 0 || chkEst.length > 0;
    let cntTotalVig = 0, cntTotalPV = 0, cntTotalVenc = 0;

    const headers = document.querySelectorAll('#cuerpoTablaFleetrun tr.group-header');
    headers.forEach(header => {
        const placaRaw = header.getAttribute('data-placa'); const classPlaca = normalizarClase(placaRaw);
        const cli = header.getAttribute('data-cliente'); const uts = header.getAttribute('data-uts');
        let childRows = document.querySelectorAll(`.child-${classPlaca}`);
        let hasVisibleChild = false;
        let matchCli = (!chkCli.length || chkCli.includes(cli)); let matchUts = (!chkUts.length || chkUts.includes(uts));
        if(matchCli && matchUts) {
            childRows.forEach(row => {
                let textoRow = row.innerText.toLowerCase() + " " + placaRaw.toLowerCase();
                let rowFecha = row.getAttribute('data-fecha');
                let kpiFila = row.getAttribute('data-estado-kpi');
                let matchTxt = (!txt || textoRow.includes(txt));
                let matchDate = (!dateCompare || rowFecha === dateCompare);
                let matchKpi = (!chkEst.length || chkEst.includes(kpiFila));
                if(matchTxt && matchDate && matchKpi) {
                    row.style.display = isFiltering ? '' : (expandAllState ? '' : 'none');
                    hasVisibleChild = true;
                    if (kpiFila === 'VIGENTE') cntTotalVig++;
                    else if (kpiFila === 'POR_VENCER') cntTotalPV++;
                    else if (kpiFila === 'VENCIDO') cntTotalVenc++;
                } else {
                    row.style.display = 'none';
                }
            });
            let icon = header.querySelector('i');
            if(icon) {
                if (isFiltering && hasVisibleChild) icon.className = "bi bi-chevron-down ms-1 me-2 text-warning";
                else icon.className = expandAllState ? "bi bi-chevron-down ms-1 me-2 text-warning" : "bi bi-chevron-right ms-1 me-2 text-warning";
            }
        } else {
            childRows.forEach(row => row.style.display = 'none');
        }
        header.style.display = hasVisibleChild ? '' : 'none';
    });
    updateGraficoFleetrun(cntTotalVig, cntTotalPV, cntTotalVenc);
};
function abrirModalNuevoFleetrun() { document.getElementById('formFleetrun').reset(); document.getElementById('f_id').value = ''; let tzOffset = (new Date()).getTimezoneOffset() * 60000; let today = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0]; document.getElementById('f_fecha').value = today; autocompletarFecha('f'); new bootstrap.Modal(document.getElementById('modalFleetrun')).show(); }
function autocompletarFecha(prefix) { let dateInput = document.getElementById(prefix + '_fecha').value; if(dateInput) { let d = new Date(dateInput + "T00:00:00"); const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]; document.getElementById(prefix + '_mes').value = meses[d.getMonth()]; document.getElementById(prefix + '_anio').value = d.getFullYear(); } }

window.autocompletarFleetrun = function(prefix) {
    let placaInput = normalizeStr(document.getElementById(prefix + '_placa').value);
    let match = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placaInput);

    if(match) {
        document.getElementById(prefix + '_marca').value = match[3] || "";
        document.getElementById(prefix + '_dueno').value = match[1] || "";
        document.getElementById(prefix + '_uts').value = match[19] || "";
        calcularFrecuencia(prefix);
    } else {
        document.getElementById(prefix + '_marca').value = "";
        document.getElementById(prefix + '_dueno').value = "";
        document.getElementById(prefix + '_uts').value = "";
    }

    let wialonData = buscarWialonPorPlaca(placaInput);
    if(wialonData) {
        document.getElementById(prefix + '_kmgps').value = wialonData.km;
    } else { document.getElementById(prefix + '_kmgps').value = ''; }
};

function calcularFrecuencia(prefix) {
    let marca = normalizeStr(document.getElementById(prefix + '_marca').value);
    let tipoMP = normalizeStr(document.getElementById(prefix + '_tipomp').value);
    let uts = normalizeStr(document.getElementById(prefix + '_uts').value);
    let inputFrecuencia = document.getElementById(prefix + '_freckm');
    let fVal = 0;

    if (tipoMP && dataTiposMant && dataTiposMant.length > 0) {
        let frecMatch = dataTiposMant.find(t =>
            normalizeStr(t.marca) === marca &&
            normalizeStr(t.tipo_mp) === tipoMP &&
            normalizeStr(t.uts) === uts
        );
        if (!frecMatch) {
            frecMatch = dataTiposMant.find(t =>
                normalizeStr(t.marca) === marca &&
                normalizeStr(t.tipo_mp) === tipoMP &&
                (normalizeStr(t.uts) === "" || !t.uts)
            );
        }
        if (!frecMatch) {
            frecMatch = dataTiposMant.find(t =>
                normalizeStr(t.tipo_mp) === tipoMP &&
                (normalizeStr(t.uts) === "" || !t.uts) &&
                (normalizeStr(t.marca) === "" || !t.marca)
            );
        }
        if (frecMatch) {
            let valorFrecuencia = frecMatch.frecuencia || frecMatch.frecuencia_km || frecMatch.Frecuencia || 0;
            let valStr = valorFrecuencia.toString().trim();

            let lastDot = valStr.lastIndexOf('.');
            let lastComma = valStr.lastIndexOf(',');
            let lastSeparator = Math.max(lastDot, lastComma);

            if (lastSeparator === valStr.length - 3) {
                valStr = valStr.substring(0, lastSeparator);
            }

            valStr = valStr.replace(/[,.]/g, '');
            fVal = parseInt(valStr) || 0;
        }
    }

    if (fVal > 0) {
        inputFrecuencia.value = fVal;
    }
    calcularProximo(prefix);
}

function calcularProximo(prefix) {
    let kmAct = parseFloat(document.getElementById(prefix + '_kmact').value) || 0;
    let frec = parseFloat(document.getElementById(prefix + '_freckm').value) || 0;
    if (kmAct > 0 && frec > 0) {
        document.getElementById(prefix + '_kmprox').value = kmAct + frec;
    } else {
        document.getElementById(prefix + '_kmprox').value = '';
    }
}
window.mostrarDetalleFleetrun = function(index) {
    if (!dataGlobalFleetrun || !dataGlobalFleetrun[index]) return;
    let fila = dataGlobalFleetrun[index];

    let idStr = fila[0] || "-";
    let fecha = fila[3] || "-";
    let placa = normalizeStr(fila[4]) || "-";

    let infoPlaca = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placa);
    let marca = infoPlaca ? (infoPlaca[2] || fila[5] || "-") : (fila[5] || "-");
    let dueno = infoPlaca ? (infoPlaca[3] || fila[6] || "-") : (fila[6] || "-");
    let utsRaw = (infoPlaca && infoPlaca[19] && String(infoPlaca[19]).trim() !== '') ? infoPlaca[19] : (fila[7] || "-");

    let tipo_mp = fila[8] || "-";
    let km_actual = parseFloat(fila[9]) || 0;
    let frecuencia = parseFloat(fila[10]) || 0;
    let km_prox = parseFloat(fila[11]) || 0;
    let tecnico = fila[12] || "-";
    let obs = fila[13] || "";

    let isLive = false;
    let km_gps = 0;
    let wialonData = buscarWialonPorPlaca(placa);
    if (wialonData) { km_gps = wialonData.km; isLive = true; }

    let falta_km = km_prox - km_gps;
    let badgeClass = "", estadoText = "";
    if (falta_km <= 0) {
        badgeClass = "bg-danger text-white"; estadoText = "VENCIDO";
    } else if ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100)) {
        badgeClass = "bg-warning text-dark"; estadoText = "POR VENCER";
    } else {
        badgeClass = "bg-success text-white"; estadoText = "VIGENTE";
    }

    let html = `
        <div class="text-center mb-4">
            <h3 class="fw-bold text-primary mb-1">${fila[4] || '-'}</h3>
            <div class="text-muted small mb-2">${marca} • ${dueno}</div>
            <span class="badge bg-primary text-white shadow-sm me-1">${tipo_mp}</span>
            <span class="badge shadow-sm px-2 py-1" style="background-color: var(--text) !important; color: var(--surface) !important; border: 1px solid var(--border); font-weight: bold;">${utsRaw}</span>
        </div>
        <ul class="list-group list-group-flush shadow-sm rounded border" style="font-size: 0.9rem;">
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-hash"></i> ID Mantenimiento</span>
                <span class="fw-bold">${idStr}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-calendar3"></i> Fecha Registro</span>
                <span>${fecha}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-speedometer"></i> KM de Registro</span>
                <span>${km_actual.toLocaleString()} km</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-arrow-repeat"></i> Frecuencia</span>
                <span class="text-warning fw-bold">${frecuencia.toLocaleString()} km</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-flag"></i> KM Próximo</span>
                <span class="fw-bold">${km_prox.toLocaleString()} km</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-broadcast"></i> KM GPS Actual</span>
                ${isLive ? `<span class="badge bg-primary px-2 py-1"><i class="bi bi-broadcast"></i> ${km_gps.toLocaleString()} km</span>` : `<span class="text-secondary fw-bold">${km_gps.toLocaleString()} km</span>`}
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-heart-pulse"></i> Estado</span>
                <span class="badge ${badgeClass} shadow-sm px-2 py-1" style="font-size: 0.8rem;">${estadoText} (Faltan ${falta_km.toLocaleString()} km)</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background-color: var(--surface); color: var(--text); padding: 12px 15px;">
                <span class="fw-bold text-muted small"><i class="bi bi-person-badge"></i> Técnico</span>
                <span class="text-end" style="max-width: 55%;">${tecnico}</span>
            </li>
        </ul>
    `;

    if (obs && obs.trim() !== "" && obs.trim() !== "-") {
        html += `
            <div class="mt-4 p-3 rounded shadow-sm border" style="background-color: var(--surface);">
                <h6 class="fw-bold text-danger mb-2" style="font-size: 0.8rem;"><i class="bi bi-card-text"></i> OBSERVACIONES</h6>
                <p class="mb-0" style="color: var(--text); font-size: 0.85rem; line-height: 1.4;">${obs}</p>
            </div>
        `;
    }

    let detalleFleetrunEl = document.getElementById('detalleFleetrunContenido');
    if (detalleFleetrunEl) detalleFleetrunEl.innerHTML = html;

    let offcanvasElement = document.getElementById('offcanvasFleetrun');
    if (offcanvasElement) {
        let bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasElement);
        if (!bsOffcanvas) bsOffcanvas = new bootstrap.Offcanvas(offcanvasElement);
        bsOffcanvas.show();
    }
};
function abrirModalEditarFleetrun(idReg) { const p = dataGlobalFleetrun.find(x => x[0] === idReg); if (!p) return; document.getElementById('formEditarFleetrun').reset(); let dDate = new Date(p[1]); let fechaFormat = isNaN(dDate.getTime()) ? "" : dDate.toISOString().split('T')[0]; document.getElementById('eF_id').value = p[0]; document.getElementById('eF_fecha').value = fechaFormat; document.getElementById('eF_mes').value = p[2]; document.getElementById('eF_anio').value = p[3]; document.getElementById('eF_placa').value = p[4]; document.getElementById('eF_marca').value = p[5]; document.getElementById('eF_dueno').value = p[6]; document.getElementById('eF_uts').value = p[7]; document.getElementById('eF_tipomp').value = p[8]; document.getElementById('eF_kmact').value = p[9]; document.getElementById('eF_freckm').value = p[10]; document.getElementById('eF_kmprox').value = p[11]; document.getElementById('eF_obs').value = p[12]; document.getElementById('eF_tec').value = p[13]; document.getElementById('eF_kmgps').value = p[14]; const btn = document.getElementById('btnActualizarFleetrun'); btn.disabled = false; btn.innerHTML = 'Actualizar Registro'; new bootstrap.Modal(document.getElementById('modalEditarFleetrun')).show(); }
function enviarFleetrun(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnGuardarFleetrun'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...'; if(!formObj.f_id.value) formObj.f_id.value = "FL-" + Date.now(); formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { formObj.reset(); bootstrap.Modal.getInstance(document.getElementById('modalFleetrun')).hide(); cargarTablaFleetrun(true); } else alert(r); btn.disabled = false; btn.innerHTML = 'Guardar'; }).withFailureHandler(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Guardar'; }).guardarFleetrun(formObj); }
function enviarEdicionFleetrun(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnActualizarFleetrun'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Actualizando...'; formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { bootstrap.Modal.getInstance(document.getElementById('modalEditarFleetrun')).hide(); cargarTablaFleetrun(true); } else alert(r); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).withFailureHandler(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).actualizarFleetrun(formObj); }

// TRADUCTOR DE COORDENADAS A CALLES (OpenStreetMap)
window.obtenerDireccion = async function(lat, lng, btn) {
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    try {
        let res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        let data = await res.json();
        let calle = data.address.road || data.address.suburb || "Zona sin nombre";
        let ciudad = data.address.city || data.address.town || "";
        btn.parentElement.innerHTML = `<span class="text-success fw-bold" style="font-size: 0.85rem;"><i class="bi bi-geo-alt-fill"></i> ${calle}, ${ciudad}</span>`;
    } catch(e) {
        btn.innerHTML = 'Error de conexión';
    }
};

function filtrarTabla(idTabla, idBuscador) {
    const filtro = document.getElementById(idBuscador || 'buscadorAuditoria')?.value.toLowerCase() || '';
    const tablaEl = document.getElementById(idTabla);
    if (!tablaEl) return;
    const filas = tablaEl.getElementsByTagName('tr');
    for (let i = 1; i < filas.length; i++) {
        const textoFila = filas[i].textContent || filas[i].innerText;
        if (filas[i]) filas[i].style.display = textoFila.toLowerCase().indexOf(filtro) > -1 ? '' : 'none';
    }
}
function eliminarRegistro(id, coleccion) {
    itemAEliminarID = id;
    itemAEliminarCol = coleccion;

    let deleteRecordIdEl = document.getElementById('delete-record-id');
    if (deleteRecordIdEl) deleteRecordIdEl.innerText = id;

    const input = document.getElementById('input-confirmar-eliminar');
    if (input) input.value = '';

    let msgErrorEl = document.getElementById('msg-error-eliminar');
    if (msgErrorEl) msgErrorEl.style.display = 'none';

    const label = document.getElementById('label-confirmar');
    const hint = document.getElementById('hint-azkell');

    if (coleccion === 'Usuarios') {
        if (label) label.innerHTML = 'Ingresa la <span class="text-danger fw-bold border-bottom border-danger pb-1">Clave Maestra</span> para confirmar';
        if (input) {
            input.placeholder = '';
            input.type = 'password';
        }
        if (hint) hint.style.display = 'block';
    } else {
        if (label) label.innerHTML = 'Escribe la palabra <span class="text-danger fw-bold border-bottom border-danger pb-1">Si</span> para confirmar';
        if (input) {
            input.placeholder = 'Si';
            input.type = 'text';
        }
        if (hint) hint.style.display = 'none';
    }

    let modalEl = document.getElementById('modalConfirmarEliminar');
    if (modalEl) new bootstrap.Modal(modalEl).show();
}

function procesarEliminacion() {
    const inputVal = document.getElementById('input-confirmar-eliminar').value.trim();
    const msgError = document.getElementById('msg-error-eliminar');
    const btn = document.getElementById('btn-procesar-eliminar');
    let esValido = false;

    if (itemAEliminarCol === 'Usuarios') {
        esValido = inputVal === 'Azkell';
        msgError.innerHTML = '<i class="bi bi-x-circle"></i> Contraseña Maestra Incorrecta.';
    } else {
        esValido = inputVal.toLowerCase() === 'si';
        msgError.innerHTML = '<i class="bi bi-x-circle"></i> Debes escribir "Si".';
    }

    if (esValido) {
        msgError.style.display = 'none';
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Borrando...';

        fetch('/api/script/eliminarDocumento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: itemAEliminarID,
                coleccion: itemAEliminarCol,
                usuario: usuarioLogueado
            })
        })
        .then(res => res.json())
        .then(r => {
            if (r.data === 'Éxito') {
                bootstrap.Modal.getInstance(document.getElementById('modalConfirmarEliminar')).hide();
                if (itemAEliminarCol === 'Placas') cargarTablaPlacas(true);
                else if (itemAEliminarCol === 'Fleetrun') cargarTablaFleetrun(true);
                else if (itemAEliminarCol === 'StatusFlota') recargarModulo('statusFlota');
                else if (itemAEliminarCol === 'Inspecciones') { dataGlobalInspecciones = []; recargarModulo('statusMant'); }
                else if (itemAEliminarCol === 'Usuarios') recargarModulo('usuarios');
            } else {
                alert('Error: ' + r.data);
            }
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3-fill"></i> Eliminar';
        })
        .catch(e => {
            alert('Error de red: ' + e.message);
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3-fill"></i> Eliminar';
        });
    } else {
        msgError.style.display = 'block';
        document.getElementById('input-confirmar-eliminar').focus();
    }
}


// ==========================================
// 🛡️ SÚPER GESTOR DE USUARIOS Y PERMISOS
// ==========================================
const MODULOS_SISTEMA = [
    { id: 'mantenimiento', nombre: 'Mantenimiento (Insp/Fleet)' },
    { id: 'almacen', nombre: 'Almacén (Inventario)' },
    { id: 'flota', nombre: 'Flota (Status/GPS/Seg/Cond)' },
    { id: 'usuarios', nombre: 'Gestión de Usuarios' },
    { id: 'auditoria', nombre: 'Auditoría y Logs', soloLectura: true }
];

window.syncPlacasUI = function(el, type) {
    document.querySelectorAll(`.p-chk.sync-placas.p-${type}`).forEach(c => c.checked = el.checked);
}
window.toggleAdminUI = function(isAdmin) {
    document.querySelectorAll('.p-chk, .p-mod').forEach(c => {
        if (isAdmin) { c.checked = true; c.disabled = true; }
        else { c.disabled = false; }
    });
    let sw = document.getElementById('gu_is_admin');
    if (sw) sw.checked = isAdmin;
}

function mostrarUsuarios(datos) {
    dataGlobalUsuarios = datos;
    let html = '';
    if (!datos || datos.length === 0) {
        html = '<tr><td colspan="7" class="text-center py-4 text-muted">No hay usuarios registrados.</td></tr>';
    } else {
        datos.forEach((fila) => {
            const estadoBadge = fila[5] === 'Activo' ? '<span class="badge bg-success shadow-sm">Activo</span>' : '<span class="badge bg-danger shadow-sm">Inactivo</span>';
            let pObj = {};
            try {
                let raw = fila[7] || '{}';
                pObj = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                if (typeof pObj === 'string') pObj = JSON.parse(pObj);
            } catch(e){}

            let esAdminMaster = (fila[3] || '').trim().toLowerCase() === 'admin@azkell.com';
            let esAdmin = esAdminMaster || pObj.admin === true;

            const rolBadge = esAdminMaster ? '<span class="badge bg-dark text-warning shadow-sm"><i class="bi bi-star-fill"></i> Fundador</span>'
                           : (esAdmin ? '<span class="badge bg-warning text-dark shadow-sm"><i class="bi bi-star-fill"></i> Administrador</span>'
                           : '<span class="badge bg-primary shadow-sm"><i class="bi bi-person-gear"></i> Personalizado</span>');

            let menuAcciones = '<span class="text-muted"><i class="bi bi-dash"></i></span>';

            // 👑 Solo los Administradores y el Fundador ven los 3 puntitos
            let correoActual = (localStorage.getItem('fleet_correo') || '').toLowerCase();
            if (permisosUsuario.admin === true || correoActual === 'admin@azkell.com') {
                menuAcciones = `<div class="dropstart text-center">
                    <button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button>
                    <ul class="dropdown-menu shadow">
                        <li><a class="dropdown-item fw-bold" href="#" onclick="abrirModalGestorUsuario('${fila[0]}', false)"><i class="bi bi-pencil text-primary"></i> Editar Permisos</a></li>
                        <li><a class="dropdown-item fw-bold text-success" href="#" onclick="abrirModalGestorUsuario('${fila[0]}', true)"><i class="bi bi-copy"></i> Clonar Usuario</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${fila[0]}','Usuarios')"><i class="bi bi-trash"></i> Eliminar Definitivo</a></li>
                    </ul>
                </div>`;
            }
            html += `<tr><td class="fw-bold text-secondary">${fila[0]}</td><td class="fw-bold" style="color:#1e293b;">${fila[1]}</td><td>${fila[2]}</td><td>${fila[3]}</td><td>${rolBadge}</td><td>${estadoBadge}</td><td>${menuAcciones}</td></tr>`;
        });
    }
    let cuerpoTablaUsuariosEl = document.getElementById('cuerpoTablaUsuarios');
    if (cuerpoTablaUsuariosEl) cuerpoTablaUsuariosEl.innerHTML = html;
}

function generarMatrizUI() {
    const target = document.getElementById('bodyMatrizPermisos');
    if (!target) return;
    target.innerHTML = `
        <tr><th colspan="5" style="background-color: #1e293b; color: #fff;" class="text-start ps-3 py-2 small fw-bold"><i class="bi bi-tools text-warning me-2"></i>MANTENIMIENTO</th></tr>
        <tr data-k="insp"><td class="text-start ps-3 fw-semibold text-secondary small">Inspecciones</td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="insp" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="insp" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="insp" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="insp" style="width:18px;height:18px;cursor:pointer;"></td></tr>
        <tr data-k="fleet"><td class="text-start ps-3 fw-semibold text-secondary small">Fleetrun</td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="fleet" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="fleet" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="fleet" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="fleet" style="width:18px;height:18px;cursor:pointer;"></td></tr>
        <tr><th colspan="5" style="background-color: #1e293b; color: #fff;" class="text-start ps-3 py-2 small fw-bold"><i class="bi bi-box-seam text-info me-2"></i>ALMACÉN</th></tr>
        <tr data-k="placas"><td class="text-start ps-3 fw-semibold text-secondary small">Placas <small class="text-muted">(Mant+Alm)</small></td>
            <td><input type="checkbox" class="form-check-input p-chk p-l sync-placas p-placas" data-k="placas" style="width:18px;height:18px;cursor:pointer;" onchange="syncPlacasUI(this,'l')"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c sync-placas p-placas" data-k="placas" style="width:18px;height:18px;cursor:pointer;" onchange="syncPlacasUI(this,'c')"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e sync-placas p-placas" data-k="placas" style="width:18px;height:18px;cursor:pointer;" onchange="syncPlacasUI(this,'e')"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d sync-placas p-placas" data-k="placas" style="width:18px;height:18px;cursor:pointer;" onchange="syncPlacasUI(this,'d')"></td></tr>
        <tr><th colspan="5" style="background-color: #1e293b; color: #fff;" class="text-start ps-3 py-2 small fw-bold"><i class="bi bi-truck-front text-success me-2"></i>FLOTA</th></tr>
        <tr data-k="status"><td class="text-start ps-3 fw-semibold text-secondary small">Status Flota</td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="status" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="status" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="status" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="status" style="width:18px;height:18px;cursor:pointer;"></td></tr>
        <tr data-k="cond"><td class="text-start ps-3 fw-semibold text-secondary small">Conductores</td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="cond" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="cond" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="cond" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="cond" style="width:18px;height:18px;cursor:pointer;"></td></tr>
        <tr data-k="gps"><td class="text-start ps-3 fw-semibold text-secondary small">GPS / Ubicación</td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="gps" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="gps" style="width:18px;height:18px;cursor:pointer;" disabled></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="gps" style="width:18px;height:18px;cursor:pointer;" disabled></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="gps" style="width:18px;height:18px;cursor:pointer;" disabled></td></tr>
        <tr><th colspan="5" style="background-color: #1e293b; color: #fff;" class="text-start ps-3 py-2 small fw-bold"><i class="bi bi-shield-fill-check text-primary me-2"></i>MÓDULOS EXTRA</th></tr>
        <tr><td class="text-start ps-3 fw-semibold text-secondary small">Auditoría</td>
            <td><input type="checkbox" class="form-check-input p-mod" data-k="mod_auditoria" style="width:18px;height:18px;cursor:pointer;"></td>
            <td colspan="3" class="text-muted small text-center">Solo lectura</td></tr>
    `;
}

function logicaCheckboxes(chk, moduloId, accion) {
    let tr = chk.closest('tr');
    let chkLeer = tr.querySelector('.p-leer');
    if (chk.checked && accion !== 'leer') {
        chkLeer.checked = true;
    }
    if (!chk.checked && accion === 'leer') {
        tr.querySelectorAll('.perm-chk').forEach(c => c.checked = false);
    }
}

function abrirModalGestorUsuario(idBusqueda = null, esClon = false) {
    if (typeof idBusqueda === 'object') idBusqueda = null;

    document.getElementById('formGestorUsuario').reset();
    generarMatrizUI();

    document.querySelectorAll('.p-chk, .p-mod').forEach(c => { c.checked = false; c.disabled = false; });
    document.getElementById('gu_estado').disabled = false;
    document.getElementById('gu_correo').readOnly = false;
    let adminSwitch = document.getElementById('gu_is_admin');
    if (adminSwitch) { adminSwitch.checked = false; adminSwitch.disabled = false; }

    let filaData = idBusqueda ? dataGlobalUsuarios.find(u => u[0] === idBusqueda) : null;

    if (!filaData) {
        let tituloModalUserEl = document.getElementById('tituloModalUser');
        if (tituloModalUserEl) tituloModalUserEl.innerHTML = '<i class="bi bi-person-plus-fill text-success"></i> Crear Nuevo Personal';
        document.getElementById('gu_id').value = '';
    } else {
        let tituloModalUserEl = document.getElementById('tituloModalUser');
        if (esClon) {
            if (tituloModalUserEl) tituloModalUserEl.innerHTML = `<i class="bi bi-copy text-success"></i> Clonando permisos de: ${filaData[1]}`;
            document.getElementById('gu_id').value = '';
            document.getElementById('gu_nombre').value = '';
            document.getElementById('gu_correo').value = '';
            document.getElementById('gu_password').value = '';
            document.getElementById('gu_cargo').value = filaData[2];
        } else {
            if (tituloModalUserEl) tituloModalUserEl.innerHTML = '<i class="bi bi-pencil-square text-warning"></i> Editar Accesos de Personal';
            document.getElementById('gu_id').value = filaData[0];
            document.getElementById('gu_nombre').value = filaData[1];
            document.getElementById('gu_cargo').value = filaData[2];
            document.getElementById('gu_correo').value = filaData[3];
            document.getElementById('gu_password').value = filaData[6];
            document.getElementById('gu_estado').value = filaData[5];
        }

        let pObj = {};
        try {
            let raw = filaData[7] || '{}';
            pObj = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
            if (typeof pObj === 'string') pObj = JSON.parse(pObj);
        } catch(e) { pObj = {}; }

        if (adminSwitch) adminSwitch.checked = pObj.admin === true;
        if (pObj.admin === true) toggleAdminUI(true);

        const setRow = (key, obj) => {
            if (!obj) return;
            document.querySelectorAll(`.p-chk[data-k="${key}"]`).forEach(chk => {
                if (chk.classList.contains('p-l') && obj.l) chk.checked = true;
                if (chk.classList.contains('p-c') && obj.c) chk.checked = true;
                if (chk.classList.contains('p-e') && obj.e) chk.checked = true;
                if (chk.classList.contains('p-d') && obj.d) chk.checked = true;
            });
        };
        setRow('insp', pObj.insp); setRow('placas', pObj.placas); setRow('fleet', pObj.fleet);
        setRow('gps', { l: pObj.gps?.l });
        setRow('status', pObj.status); setRow('seg', pObj.seg); setRow('cond', pObj.cond);
        let modAud = document.querySelector('.p-mod[data-k="mod_auditoria"]');
        if (modAud) modAud.checked = !!pObj.mod_auditoria;

        if ((filaData[3] || '').trim().toLowerCase() === 'admin@azkell.com' && !esClon) {
            if (tituloModalUserEl) tituloModalUserEl.innerHTML = '<i class="bi bi-shield-lock-fill text-warning"></i> Cuenta Fundador (Intocable)';
            if (adminSwitch) { adminSwitch.checked = true; adminSwitch.disabled = true; }
            toggleAdminUI(true);
            document.getElementById('gu_estado').value = 'Activo';
            document.getElementById('gu_estado').disabled = true;
            document.getElementById('gu_correo').readOnly = true;
        }
    }
    let modalGestorEl = document.getElementById('modalGestorUsuario');
    if (modalGestorEl) new bootstrap.Modal(modalGestorEl).show();
}

function procesarGuardadoUsuario(event, formObj) {
    event.preventDefault();
    const btn = document.getElementById('btnGuardarUser');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    const getChk = (key, cls) => document.querySelector(`.p-chk[data-k="${key}"].${cls}`)?.checked || false;
    const getL = k => getChk(k, 'p-l'), getC = k => getChk(k, 'p-c'), getE = k => getChk(k, 'p-e'), getD = k => getChk(k, 'p-d');
    let isAdmin = document.getElementById('gu_is_admin')?.checked || false;
    let pObj = {
        admin:  isAdmin,
        insp:   { l: getL('insp'),   c: getC('insp'),   e: getE('insp'),   d: getD('insp')   },
        placas: { l: getL('placas'), c: getC('placas'), e: getE('placas'), d: getD('placas') },
        fleet:  { l: getL('fleet'),  c: getC('fleet'),  e: getE('fleet'),  d: getD('fleet')  },
        gps:    { l: getL('gps') },
        status: { l: getL('status'), c: getC('status'), e: getE('status'), d: getD('status') },
        seg:    { l: getL('seg'),    c: getC('seg'),    e: getE('seg'),    d: getD('seg')    },
        cond:   { l: getL('cond'),   c: getC('cond'),   e: getE('cond'),   d: getD('cond')   },
        mod_auditoria: document.querySelector('.p-mod[data-k="mod_auditoria"]')?.checked || false
    };

    document.getElementById('gu_permisos').value = JSON.stringify(pObj);

    fetch('/api/script/actualizarUsuario', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [{
            idUsuarioEdit:       document.getElementById('gu_id').value,
            nombreUsuarioEdit:   document.getElementById('gu_nombre').value,
            cargoUsuarioEdit:    document.getElementById('gu_cargo').value,
            correoUsuarioEdit:   document.getElementById('gu_correo').value,
            passwordUsuarioEdit: document.getElementById('gu_password').value,
            estadoUsuarioEdit:   document.getElementById('gu_estado').value,
            permisos_json:       document.getElementById('gu_permisos').value
        }]})
    })
    .then(r => r.json())
    .then(r => {
        if (r.data === 'Éxito') {
            bootstrap.Modal.getInstance(document.getElementById('modalGestorUsuario')).hide();
            recargarModulo('usuarios');
        } else { alert("Error: " + r.data); }
        btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Guardar Accesos';
    })
    .catch(e => {
        alert("Error de Red: " + e.message);
        btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Guardar Accesos';
    });
}
function enviarPreguntaIA() {
    const input = document.getElementById('inputPregunta');
    const pregunta = input.value.trim();
    if (!pregunta) return;

    const historial = document.getElementById('chat-historial');
    historial.innerHTML += `<div class="mb-2 text-end"><span class="border p-2 rounded d-inline-block chat-bubble bg-warning text-dark">${pregunta}</span></div>`;
    input.value = '';

    const btn = document.getElementById('btnEnviarIA');
    btn.disabled = true;

    // Le enviamos un resumen ligero en vez de toda la base de datos para que no se cuelgue
    let resumenContexto = "Resumen actual de BD: " + dataGlobalPlacas.length + " placas, " + dataGlobalInspecciones.length + " inspecciones.";

    google.script.run.withSuccessHandler(r => {
        historial.innerHTML += `<div class="mb-2 text-start"><span class="border p-2 rounded d-inline-block chat-bubble" style="background-color: var(--surface); color: var(--text);">${r}</span></div>`;
        historial.scrollTop = historial.scrollHeight;
        btn.disabled = false;
    }).withFailureHandler(e => {
        historial.innerHTML += `<div class="mb-2 text-start"><span class="border p-2 rounded d-inline-block chat-bubble text-danger">Error: ${e.message}</span></div>`;
        btn.disabled = false;
    }).consultarGemini(pregunta, resumenContexto);
}
// 🚀 RESTAURADO: LÓGICA DE BOTONES OK / FALLA Y PORCENTAJES
// ============================================================

window.toggleRadioOkFalla = function(el, cajaId, isFalla) {
    if (el.dataset.chk === '1') {
        el.checked = false;
        el.dataset.chk = '0';
        toggleFalla(cajaId, false);
    } else {
        document.getElementsByName(el.name).forEach(e => e.dataset.chk = '0');
        el.dataset.chk = '1';
        toggleFalla(cajaId, isFalla);
    }
};

window.toggleFalla = function(cajaId, isFalla) {
    let el = document.getElementById(cajaId);
    if(el) {
        el.style.display = isFalla ? 'block' : 'none';
        if(!isFalla) {
            let obsId = cajaId.replace('f_', 'obs_');
            let obsEl = document.getElementById(obsId);
            if(obsEl) obsEl.value = ''; // Limpia obs si cambia a OK

            let fotoId = cajaId.replace('f_', 'foto_');
            let fotoEl = document.getElementById(fotoId);
            if(fotoEl) fotoEl.value = ''; // Limpia la foto adjunta si cambia a OK
        }
    }
};

window.seleccionarPorcentaje = function(uid, pct, btn) {
    document.getElementById(`val_${uid}`).value = pct;
    document.querySelectorAll(`.pct-${uid}`).forEach(b => {
        b.classList.remove('btn-primary', 'text-white');
        b.classList.add('btn-outline-primary');
    });
    btn.classList.remove('btn-outline-primary');
    btn.classList.add('btn-primary', 'text-white');
};

// ==========================================
// 📱 LÓGICA UX MÓVIL: BOTÓN ACCIONES (FAB)
// ==========================================

function toggleFabMenu() {
    if (window.innerWidth > 768) return;

    // 🔥 INYECTAR CONTENIDO si estamos en Status Taller
    if (window.moduloActualTallerMaster === 'status') {
        let fabContent = document.getElementById('fabActionListContent');
        if (fabContent) {
            fabContent.innerHTML = `
                <div class="d-flex align-items-center justify-content-end gap-2 mb-2" onclick="abrirIngresoUnidad(); if(window.toggleFabMenu) toggleFabMenu();" style="cursor: pointer;">
                    <span class="badge bg-danger shadow-sm px-3 py-2 text-white" style="font-size: 0.9rem;">Registrar Ingreso</span>
                    <button class="btn btn-danger rounded-circle shadow-sm d-flex justify-content-center align-items-center" style="width: 45px; height: 45px;">
                        <i class="bi bi-car-front-fill"></i>
                    </button>
                </div>
            `;
        }
    }

    const wrapper = document.getElementById('fabActionListWrapper');
    const btnMain = document.getElementById('btnFabMain');

    if (wrapper.classList.contains('show')) {
        wrapper.classList.remove('show');
        btnMain.classList.remove('open');
    } else {
        generarListaAccionesFab();
        wrapper.classList.add('show');
        btnMain.classList.add('open');
    }
}

function generarListaAccionesFab() {
    const listContent = document.getElementById('fabActionListContent');
    listContent.innerHTML = '';

    let moduloActual = null;
    document.querySelectorAll('[id^="modulo"]').forEach(mod => {
        const display = window.getComputedStyle(mod).display;
        if (display === 'block' || display === 'flex') {
            moduloActual = mod;
        }
    });

    if (!moduloActual) return;

    const divBotonesAll = moduloActual.querySelectorAll('.controls-row .d-flex.align-items-center.gap-2');
    const divBotones = divBotonesAll[divBotonesAll.length - 1];

    if (!divBotones) return;

    // 🔥 MAGIA: Ahora buscamos botones normales Y TAMBIÉN las opciones dentro de los menús desplegables (.dropdown-item)
    const buttons = divBotones.querySelectorAll('button:not(.dropdown-toggle), .dropdown-item, .cache-badge');

    if (buttons.length === 0) {
        listContent.innerHTML = '<div class="text-center p-3 text-muted" style="font-size:0.8rem;">Sin acciones</div>';
        return;
    }

    buttons.forEach(btn => {
        if (btn.style.display === 'none' || window.getComputedStyle(btn).display === 'none') return;

        let clonedBtn = btn.cloneNode(true);
        clonedBtn.removeAttribute('id');

        // Convertimos el diseño al estándar del botón flotante
        clonedBtn.className = 'fab-action-item text-decoration-none';

        const originalClasses = btn.className;
        const icon = clonedBtn.querySelector('i');

        if (icon) {
            if (originalClasses.includes('success')) icon.classList.add('text-success');
            else if (originalClasses.includes('info')) icon.classList.add('text-info');
            else if (originalClasses.includes('warning') || originalClasses.includes('text-warning')) icon.classList.add('text-warning');
            else if (originalClasses.includes('danger')) icon.classList.add('text-danger');
            else if (originalClasses.includes('primary')) icon.classList.add('text-primary');
        }

        if(clonedBtn.tagName.toLowerCase() === 'span') {
            clonedBtn.style.cursor = 'default';
        } else {
            clonedBtn.addEventListener('click', () => { setTimeout(toggleFabMenu, 150); });
        }

        listContent.appendChild(clonedBtn);
    });
}

// Cerrar lista si tocas fuera
document.addEventListener('click', function(event) {
    const container = document.querySelector('.fab-container');
    const wrapper = document.getElementById('fabActionListWrapper');
    if (container && !container.contains(event.target) && wrapper && wrapper.classList.contains('show')) {
        toggleFabMenu();
    }
});

// ==========================================
// 📲 BOTÓN DE INSTALACIÓN PWA (EN EL MENÚ LATERAL)
// ==========================================
let deferredPrompt;

// 1. Atrapamos el evento del navegador
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const contenedorInstall = document.getElementById('contenedor-instalar');
    if (contenedorInstall) {
        contenedorInstall.style.display = 'block';
    }
});

// 2. Acción al hacer clic en Instalar App en el menú
document.getElementById('btn-install-sidebar')?.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('El usuario instaló Azkell CRM');
        }

        deferredPrompt = null;
        let contenedorInstallEl1 = document.getElementById('contenedor-instalar');
        if (contenedorInstallEl1) contenedorInstallEl1.style.display = 'none';
    }
});

// 3. Ocultar si ya se instaló
window.addEventListener('appinstalled', () => {
    let contenedorInstallEl2 = document.getElementById('contenedor-instalar');
    if (contenedorInstallEl2) contenedorInstallEl2.style.display = 'none';
    console.log('Azkell CRM fue instalado como App nativa');
});


// ==========================================
// 🛡️ FUNCIONES DE COMPARTIR UBICACIÓN Y CONDUCTORES
// ==========================================

// Hacemos la función global (window) para que el HTML siempre la encuentre
window.compartirUbicacion = function(nombreDispositivo, lat, lon) {
    if (!lat || !lon) {
        alert("Ubicación GPS aún no detectada.");
        return;
    }
    const urlMaps = `https://www.google.com/maps?q=${lat},${lon}`;
    const textoWhatsApp = `📍 Ubicación actual de *${nombreDispositivo}*:\n${urlMaps}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textoWhatsApp)}`, '_blank');
}

function inicializarConductoresDatalist(inputID, datalistID) {
    const elInput = document.getElementById(inputID);
    if (!elInput) return;
    elInput.addEventListener('focus', function() {
        if (CACHE['conductores'] && CACHE['conductores'].length > 0) {
            let driversSet = new Set();
            CACHE['conductores'].forEach(r => { if (r[1]) driversSet.add(r[1]); });
            rellenarDatalist(datalistID, driversSet);
        } else {
            google.script.run.withSuccessHandler(d => {
                let driversSet = new Set();
                d.forEach(r => { if (r[1]) driversSet.add(r[1]); });
                rellenarDatalist(datalistID, driversSet);
            }).obtenerDatosConductores();
        }
    }, { once: true });
}

// ============================================================
// 🔍 LÓGICA DEL BUSCADOR GLOBAL (SPOTLIGHT)
// ============================================================

function abrirSpotlight() {
    let spotlightOverlayEl = document.getElementById('spotlight-overlay');
    if (spotlightOverlayEl) spotlightOverlayEl.style.display = 'flex';

    setTimeout(() => {
        let spotlightInputEl = document.getElementById('spotlight-input');
        if (spotlightInputEl) spotlightInputEl.focus();
    }, 100);
}

function cerrarSpotlight() {
    let spotlightOverlayEl2 = document.getElementById('spotlight-overlay');
    if (spotlightOverlayEl2) spotlightOverlayEl2.style.display = 'none';

    let spotlightInputEl2 = document.getElementById('spotlight-input');
    if (spotlightInputEl2) spotlightInputEl2.value = '';

    let spotlightResultsEl = document.getElementById('spotlight-results');
    if (spotlightResultsEl) spotlightResultsEl.innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-keyboard text-secondary" style="font-size: 3rem;"></i><br><small class="mt-2 d-block">Escribe al menos 3 letras para buscar mágicamente en todo el CRM.</small></div>';
}

// Atajos de teclado Pro (Ctrl+K o Cmd+K para abrir, ESC para cerrar)
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        abrirSpotlight();
    }
    let spotlightOverlayEl3 = document.getElementById('spotlight-overlay');
    if (e.key === 'Escape' && spotlightOverlayEl3 && spotlightOverlayEl3.style.display === 'flex') {
        cerrarSpotlight();
    }
});

// ============================================================
// 🔍 LÓGICA DEL BUSCADOR GLOBAL V2 (CENTRO DE CONTROL)
// ============================================================
window.buscarSpotlight = function(query) {
    query = query.toLowerCase().trim();
    const resContainer = document.getElementById('spotlight-results');

    if (query.length < 3) {
        resContainer.innerHTML = '<div class="text-center text-muted py-5"><span class="spinner-grow spinner-grow-sm text-warning mb-2"></span><br><small>Sigue escribiendo...</small></div>';
        return;
    }

    let html = '';
    let count = 0;

    let placas = CACHE.placas || dataGlobalPlacas || [];
    let conductores = CACHE.conductores || (window.dataGlobalConductores) || [];

    // 1. Buscar Vehículos/Placas
    if (placas.length > 0) {
        placas.forEach(p => {
            if (count >= 8) return;
            const placa = (p[0]||'').toLowerCase(); const cliente = (p[1]||'').toLowerCase();
            if (placa.includes(query) || cliente.includes(query)) {
                let wialonData = buscarWialonPorPlaca(p[0]) || { km: 0 };
                let kmBadge = wialonData.km > 0 ? `<span class="badge bg-primary shadow-sm"><i class="bi bi-geo-alt-fill"></i> ${wialonData.km.toLocaleString()} km</span>` : '';
                let estadoColor = p[8] === 'Activa' ? 'text-success' : 'text-danger';

                // 🔥 TARJETA: CENTRO DE CONTROL
                html += `
                <div class="spotlight-card" style="cursor: default;">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="fw-bold text-primary fs-5" style="letter-spacing: 1px;"><i class="bi bi-truck me-2"></i>${p[0]}</div>
                            <div class="text-muted small mt-1">
                                <span class="fw-bold text-dark">${p[1] || 'Sin cliente'}</span> • ${p[2] || 'Sin Tipo'} • <span class="fw-bold ${estadoColor}">${p[8] || ''}</span>
                            </div>
                        </div>
                        <div class="text-end">${kmBadge}</div>
                    </div>
                    <div class="d-flex gap-2 mt-3 pt-3 border-top">
                        <button class="btn btn-sm btn-outline-secondary w-100 fw-bold" onclick="cerrarSpotlight(); cambiarModulo('placas'); setTimeout(() => { document.getElementById('buscadorPlacas').value='${p[0]}'; filtrarPlacasAvanzado(); }, 300);"><i class="bi bi-card-list"></i> Ficha</button>
                        <button class="btn btn-sm btn-outline-info w-100 fw-bold" onclick="cerrarSpotlight(); cargarModuloAislado('mantenimiento/inspecciones'); setTimeout(() => { let el=document.getElementById('buscadorStatus'); if(el){ el.value='${p[0]}'; filtrarStatusAvanzado(); } }, 1200);"><i class="bi bi-activity"></i> Insp.</button>
                        <button class="btn btn-sm btn-outline-warning w-100 fw-bold text-dark" onclick="cerrarSpotlight(); cambiarModulo('fleetrun'); setTimeout(() => { document.getElementById('buscadorFleetrun').value='${p[0]}'; filtrarFleetrunAvanzado(); }, 300);"><i class="bi bi-speedometer2"></i> Fleetrun</button>
                        <button class="btn btn-sm btn-outline-primary w-100 fw-bold" onclick="cerrarSpotlight(); cambiarModulo('statusFlota'); setTimeout(() => { document.getElementById('buscadorStatusFlota').value='${p[0]}'; filtrarStatusFlotaAvanzado(); }, 300);"><i class="bi bi-truck-front"></i> Status</button>
                    </div>
                </div>`;
                count++;
            }
        });
    }

    // 2. Buscar Conductores (soporta objetos BD o arrays posicionales)
    if (conductores.length > 0) {
        conductores.forEach(c => {
            if (count >= 12) return;
            const nombre = (c.nombre || c[1] || '').toLowerCase();
            const dni = (c.dni || c[3] || '').toLowerCase();
            const empresa = c.empresa || c[2] || '';
            const telefono = c.telefono || c[4] || '';

            if (nombre.includes(query) || dni.includes(query)) {
                let telLink = telefono ? `<i class="bi bi-whatsapp text-success"></i> ${telefono}` : '';
                html += `
                <div class="spotlight-card d-flex justify-content-between align-items-center"
                     onclick="cerrarSpotlight(); cargarModuloAislado('directorio/conductores'); setTimeout(() => { document.getElementById('buscadorConductores').value='${dni || nombre}'; filtrarTabla('cuerpoTablaConductores', 'buscadorConductores'); }, 300);">
                    <div>
                        <div class="fw-bold fs-6" style="color: #0ea5e9;"><i class="bi bi-person-vcard me-2"></i>${toTitleCase(nombre)}</div>
                        <div class="text-muted small mt-1">DNI: ${dni || '-'} • ${empresa || '-'}</div>
                    </div>
                    <div class="text-end small text-muted">
                        ${telLink}<br>
                        <i class="bi bi-arrow-right mt-2 d-inline-block"></i>
                    </div>
                </div>`;
                count++;
            }
        });
    }

    if (html === '') {
        html = `<div class="text-center text-muted py-5"><i class="bi bi-emoji-frown fs-1"></i><br><h6 class="mt-3">No encontramos resultados para "${query}"</h6></div>`;
    }

    resContainer.innerHTML = html;
};



// ============================================================
// 🛠️ LÓGICA DE SELECCIÓN Y EXCEL PARA FLEETRUN
// ============================================================

window.activarModoSeleccionFleetrun = function() {
    window.modoSeleccion = window.modoSeleccion || {};
    window.modoSeleccion['fleetrun'] = !window.modoSeleccion['fleetrun'];

    const btnAll = document.getElementById('btn-select-all-fleetrun');
    const btnBulk = document.getElementById('btn-bulk-fleetrun');
    const btnActivar = document.getElementById('btn-activar-sel-fleetrun');

    if (window.modoSeleccion['fleetrun']) {
        btnAll.classList.remove('d-none');
        btnAll.innerHTML = '<i class="bi bi-check-square"></i> Seleccionar Todo';
        btnAll.classList.replace('btn-primary', 'btn-outline-primary');

        if(btnActivar) {
            btnActivar.classList.replace('btn-outline-secondary', 'btn-secondary');
            btnActivar.classList.add('text-white');
            btnActivar.innerHTML = '<i class="bi bi-x-circle"></i> Cancelar Selección';
        }
    } else {
        btnAll.classList.add('d-none');
        btnBulk.classList.add('d-none');

        // Limpieza visual forzada (evita el efecto fantasma)
        btnAll.innerHTML = '<i class="bi bi-check-square"></i> Seleccionar Todo';
        btnAll.classList.replace('btn-primary', 'btn-outline-primary');

        if(btnActivar) {
            btnActivar.classList.replace('btn-secondary', 'btn-outline-secondary');
            btnActivar.classList.remove('text-white');
            btnActivar.innerHTML = '<i class="bi bi-ui-checks"></i> Seleccionar';
        }

        document.querySelectorAll('.chk-bulk-fleetrun').forEach(c => c.checked = false);
        document.querySelectorAll('.child-row-fleetrun').forEach(c => c.classList.remove('row-selected'));
    }
    mostrarFleetrun(dataGlobalFleetrun);
};

window.seleccionarFilaFleetrun = function(event, trElement) {
    if (window.modoSeleccion && window.modoSeleccion['fleetrun']) {
        if (event.target.closest('.btn-icon-dropdown') || event.target.closest('.dropdown-menu')) return;
        const checkbox = trElement.querySelector('.chk-bulk-fleetrun');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) trElement.classList.add('row-selected');
            else trElement.classList.remove('row-selected');
            toggleBulkBtn('fleetrun');
        }
    }
};

window.seleccionarTodasLasFleetrun = function() {
    const btnAll = document.getElementById('btn-select-all-fleetrun');
    const checkboxes = document.querySelectorAll('.chk-bulk-fleetrun');
    const accionEsMarcar = btnAll.innerText.includes('Seleccionar Todo');

    checkboxes.forEach(chk => {
        chk.checked = accionEsMarcar;
        const row = chk.closest('.child-row-fleetrun');
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
    toggleBulkBtn('fleetrun');
};

window.descargarPlantillaFleetrun = function() {
    const ws_data = [
        ['FECHA INGRESO', 'PLACA', 'TIPO MP', 'KM ACTUAL', 'FRECUENCIA', 'TECNICO', 'OBSERVACION'],
        ['2024-05-20', 'ABC-123', 'MP1', '150000', '15000', 'JUAN PEREZ', 'Mantenimiento preventivo general']
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Fleetrun");
    XLSX.writeFile(wb, "Plantilla_Importacion_Fleetrun.xlsx");
};

window.exportarExcelFleetrun = function() {
    if (!dataGlobalFleetrun || dataGlobalFleetrun.length === 0) {
        alert("No hay mantenimientos cargados para exportar."); return;
    }
    const ws_data = [['ID', 'FECHA INGRESO', 'PLACA', 'TIPO MP', 'KM ACTUAL', 'FRECUENCIA', 'KM PROXIMO', 'TECNICO', 'OBSERVACION']];
    dataGlobalFleetrun.forEach(f => {
        if (f.estado === 'Eliminada') return;
        ws_data.push([f[0]||'', f[3]||'', f[4]||'', f[8]||'', f[9]||'', f[10]||'', f[11]||'', f[13]||'', f[14]||'']);
    });
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Base_Fleetrun");
    XLSX.writeFile(wb, "Reporte_Fleetrun_Completo.xlsx");
};

window.importarExcelFleetrun = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false, dateNF: 'yyyy-mm-dd' });

        if (rawJson.length === 0) { alert("Archivo vacío o inválido."); return; }
        if (!confirm(`Se importarán o actualizarán ${rawJson.length} registros en Fleetrun.\n¿Continuar?`)) {
            event.target.value = ''; return;
        }

        document.body.style.cursor = 'wait';

        let registrosProcesados = rawJson.map(r => {
            let fechaIngreso = r['FECHA INGRESO'] || '';
            if (fechaIngreso.includes('/')) {
                let p = fechaIngreso.split('/');
                if (p[2] && p[2].length === 4) fechaIngreso = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
            }
            let kmact = parseFloat(r['KM ACTUAL'] || 0);
            let frec = parseFloat(r['FRECUENCIA'] || 0);
            return {
                id: r['ID'] || `FLT-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                fecha: fechaIngreso,
                placa: r['PLACA'] || '',
                tipomp: r['TIPO MP'] || '',
                kmact: kmact.toString(),
                freckm: frec.toString(),
                kmprox: (kmact + frec).toString(),
                tec: r['TECNICO'] || '',
                obs: r['OBSERVACION'] || '',
                mes: fechaIngreso ? fechaIngreso.split('-')[1] : '',
                anio: fechaIngreso ? fechaIngreso.split('-')[0] : ''
            };
        });

        fetch('/api/importarFleetrunMasivo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registros: registrosProcesados })
        }).then(res => res.json()).then(r => {
            document.body.style.cursor = 'default'; event.target.value = '';
            alert(`✅ Importación completada.\nProcesados: ${r.ok}\nErrores: ${r.errores}`);
            recargarModulo('fleetrun');
        }).catch(err => {
            document.body.style.cursor = 'default'; event.target.value = '';
            alert("❌ Error: " + err.message);
        });
    };
    reader.readAsArrayBuffer(file);
};

// ============================================================
// 📊 GRÁFICOS Y DASHBOARD INTERNO DE FLEETRUN
// ============================================================
let chartFleetrunInst = null;

window.toggleGraficosFleetrun = function() {
    let panel = document.getElementById('panelGraficosFleetrun');
    let btn = document.getElementById('btnToggleGraficosFleetrun');
    if(panel.style.display === 'none') {
        panel.style.display = 'flex';
        btn.innerHTML = '<i class="bi bi-eye-slash-fill"></i> Ocultar Gráficos';
    } else {
        panel.style.display = 'none';
        btn.innerHTML = '<i class="bi bi-eye-fill"></i> Mostrar Gráficos';
    }
};

window.initGraficoFleetrun = function() {
    let ctx = document.getElementById('chartFleetrunStatus');
    if(!ctx) return null;

    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Vigentes', 'Por Vencer', 'Vencidos'],
            datasets: [{ data: [1, 0, 0], backgroundColor: ['#16a34a', '#eab308', '#dc2626'], borderWidth: 2, hoverOffset: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            layout: { padding: { left: 10, right: 10, top: 10, bottom: 10 } },
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Inter', weight: 'bold' } } },
                datalabels: {
                    color: document.body.classList.contains('dark') ? '#ffffff' : '#000000',
                    font: { weight: 'bold', size: 12, family: 'Inter' },
                    formatter: (value, context) => {
                        let total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        if (total === 0 || value === 0 || context.chart.data.labels[0] === 'Sin Datos') return "";
                        return Math.round((value / total) * 100) + "%";
                    }
                }
            },
            onClick: (e, elements, chart) => {
                if (elements.length > 0 && chart.data.labels[0] !== 'Sin Datos') {
                    const index = elements[0].index;
                    let estadoVal = ['VIGENTE', 'POR_VENCER', 'VENCIDO'][index] || '';
                    document.querySelectorAll('#filtroFleetEstado input:checked').forEach(c => c.checked = false);
                    let checkbox = document.querySelector(`#filtroFleetEstado input[value="${estadoVal}"]`);
                    if(checkbox) checkbox.checked = true;
                    filtrarFleetrunAvanzado();
                }
            }
        }
    });
};

window.updateGraficoFleetrun = function(vigentes, porVencer, vencidos) {
    if(!chartFleetrunInst) chartFleetrunInst = initGraficoFleetrun();
    if(!chartFleetrunInst) return;
    let isDark = document.body.classList.contains('dark');
    chartFleetrunInst.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1a1a2e';
    chartFleetrunInst.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
    chartFleetrunInst.options.plugins.datalabels.color = isDark ? '#ffffff' : '#000000';
    if(vigentes + porVencer + vencidos === 0) {
        chartFleetrunInst.data.labels = ['Sin Datos'];
        chartFleetrunInst.data.datasets[0].data = [1];
        chartFleetrunInst.data.datasets[0].backgroundColor = ['#475569'];
    } else {
        chartFleetrunInst.data.labels = ['Vigentes', 'Por Vencer', 'Vencidos'];
        chartFleetrunInst.data.datasets[0].data = [vigentes, porVencer, vencidos];
        chartFleetrunInst.data.datasets[0].backgroundColor = ['#16a34a', '#eab308', '#dc2626'];
    }
    chartFleetrunInst.update();
};

// ============================================================
// 🔥 MÓDULO ÓRDENES DE TRABAJO (OT)
// ============================================================

let catalogosTaller = { rampas: [], situaciones: [] };

window.cargarCatalogosTaller = function() {
    fetch('/api/catalogos_taller')
    .then(res => res.json())
    .then(data => { if (!data.error) catalogosTaller = data; })
    .catch(e => console.error("Error cargando catálogos:", e));
};











window.guardarNuevaOT = function(e) {
    e.preventDefault();
    const placa = document.getElementById('otPlaca').value.toUpperCase().trim();
    const fecha = document.getElementById('otFecha').value;
    const hora = document.getElementById('otHora').value;
    const fecha_est = document.getElementById('otFechaEst').value;
    const hora_est = document.getElementById('otHoraEst').value;
    const km = document.getElementById('otKm').value;
    const combustible = document.getElementById('otCombustible').value;
    const motivo = document.getElementById('otMotivo').value;
    const id_rampa = document.getElementById('otRampa').value;
    const id_situacion = document.getElementById('otSituacion').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generando...';
    btn.disabled = true;
    fetch('/api/ordenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa, fecha, hora, fecha_est, hora_est, km, combustible, motivo, id_rampa, id_situacion, usuario: usuarioLogueado || 'Admin' })
    })
    .then(res => res.json())
    .then(r => {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
        if (r.error) { alert('Error: ' + r.error); return; }
        let bsOffcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasOT'));
        if (bsOffcanvas) bsOffcanvas.hide();
        cargarTableroStatus();
    })
    .catch(err => {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
        alert('Error de red: ' + err.message);
    });
};

// 🔥 EL DIBUJANTE DEL TABLERO V2 (Con Rampas y Situaciones)
window.renderizarKanban = async function() {
    if (!catalogosTaller || catalogosTaller.rampas.length === 0) {
        try {
            let resCat = await fetch('/api/catalogos_taller');
            let dataCat = await resCat.json();
            if (!dataCat.error) catalogosTaller = dataCat;
        } catch(e) { console.error("Error forzando catálogos en Kanban:", e); }
    }
    const columnas = {
        'Recepción':          document.getElementById('kanban-recepcion'),
        'Diagnóstico':        document.getElementById('kanban-diagnostico'),
        'Presupuesto':        document.getElementById('kanban-presupuesto'),
        'Reparación':         document.getElementById('kanban-reparacion'),
        'Control de Calidad': document.getElementById('kanban-control'),
        'Entregado':          document.getElementById('kanban-entregado')
    };
    Object.values(columnas).forEach(col => { if (col) col.innerHTML = ''; });
    dataGlobalOrdenes.forEach((ot, index) => {
        let detalles = {};
        try { detalles = JSON.parse(ot.detalles_json || '{}'); } catch(e) {}
        const col = columnas[ot.estado] || columnas['Recepción'];
        const txtRampa = catalogosTaller.rampas.find(r => r.id == ot.id_rampa)?.nombre || 'Sin Rampa';
        const txtSituacion = catalogosTaller.situaciones.find(s => s.id == ot.id_situacion)?.nombre || 'Sin Situación';
        const idMostrar = ot.id_ot || ot.ticket_entrada;
        const htmlCard = `
            <div class="card shadow-sm mb-2 border-0 kpi-clickable" style="background-color: var(--surface); color: var(--text); border-left: 4px solid var(--crm-accent) !important; border-radius: 6px;" onclick="verDetalleOT(${index})">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="badge bg-primary text-white shadow-sm" style="font-size: 0.75rem;">${ot.placa}</span>
                        <small class="text-muted fw-bold" style="font-size: 0.7rem;"><i class="bi bi-geo-alt"></i> ${txtRampa}</small>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-1">
                        <div class="fw-bold text-danger" style="font-size: 0.85rem;">${idMostrar}</div>
                        <span class="badge bg-secondary" style="font-size: 0.65rem;">${txtSituacion}</span>
                    </div>
                    <div class="text-truncate text-muted mt-2" style="font-size: 0.75rem;" title="${detalles.motivo || ''}">
                        <i class="bi bi-chat-left-text"></i> ${detalles.motivo || 'Sin detalle'}
                    </div>
                </div>
            </div>
        `;
        if (col) col.innerHTML += htmlCard;
    });
};

// 🔥 LA MUTACIÓN DEL PANEL LATERAL (FLUJO COMPLETO)
// LA MUTACIÓN DEL PANEL LATERAL (EXPEDIENTE MAESTRO CON TABS)
// 🔥 EXPEDIENTE MAESTRO V3 (Sin pestañas, Vista Continua)
window.verDetalleOT = function(index) {
    let ot = dataGlobalOrdenes[index];
    let detalles = {};
    try { detalles = JSON.parse(ot.detalles_json || '{}'); } catch(e) {}

    let txtRampa = ot.txtRampa || 'Sin Rampa';
    let txtSituacion = ot.txtSituacion || 'Sin Situación';

    let html = `
        <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
            <h5 class="fw-bold mb-0 text-danger"><i class="bi bi-car-front"></i> ${ot.placa}</h5>
            <span class="badge bg-dark text-white shadow-sm">${txtSituacion}</span>
        </div>

        <div class="p-3 rounded shadow-sm border mb-3" style="background-color: var(--surface); color: var(--text); font-size: 0.85rem;">
            <div class="row mb-2">
                <div class="col-6"><strong><i class="bi bi-speedometer"></i> KM:</strong> ${detalles.km_ingreso || '-'}</div>
                <div class="col-6"><strong><i class="bi bi-geo-alt"></i> Rampa:</strong> ${txtRampa}</div>
            </div>
            <div class="row mb-2">
                <div class="col-6"><strong><i class="bi bi-fuel-pump"></i> Combust:</strong> ${detalles.combustible || '-'}</div>
                <div class="col-6"><strong><i class="bi bi-calendar3"></i> Ingreso:</strong> ${new Date(ot.fecha_ingreso).toLocaleDateString('es-PE')}</div>
            </div>
            <div class="mt-2 text-muted"><strong>Motivo Cliente:</strong> ${detalles.motivo || '-'}</div>
        </div>

        <div id="box-ubicacion-${ot.ticket_entrada}">
            <button class="btn btn-outline-secondary w-100 btn-sm shadow-sm mt-2" onclick="abrirEdicionUbicacion('${ot.ticket_entrada}', ${ot.id_rampa || 'null'}, ${ot.idSituacion || 'null'})">
                <i class="bi bi-arrow-left-right"></i> Cambiar Rampa / Situación
            </button>
        </div>

        <hr class="my-4" style="border-top: 2px dashed var(--border);">

        <h6 class="fw-bold text-danger mb-3"><i class="bi bi-tools"></i> ÓRDENES DE TRABAJO (OT)</h6>

        <form onsubmit="guardarNuevaOTHija(event, '${ot.ticket_entrada}')" class="p-3 mb-4 border rounded shadow-sm" style="background-color: var(--bg);">
            <div class="row g-2 mb-2">
                <div class="col-6">
                    <select class="form-select form-select-sm shadow-sm" id="tipoOtHija_${ot.ticket_entrada}" required>
                        <option value="">Tipo de OT...</option>
                        <option value="Correctivo">Correctivo</option>
                        <option value="Preventivo">Preventivo</option>
                    </select>
                </div>
                <div class="col-6">
                    <select class="form-select form-select-sm shadow-sm" id="subTipoOtHija_${ot.ticket_entrada}" required>
                        <option value="">Sub Tipo...</option>
                        <option value="Falla">Falla</option>
                        <option value="Rutina">Rutina</option>
                        <option value="Inspección">Inspección</option>
                    </select>
                </div>
            </div>
            <button type="submit" class="btn btn-primary btn-sm w-100 fw-bold shadow-sm"><i class="bi bi-plus-circle"></i> Generar Nueva OT</button>
        </form>

        <div id="listaOTHijas_${ot.ticket_entrada}">
            <div class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary"></div></div>
        </div>
    `;

    let detalleOTContenidoEl = document.getElementById('detalleOTContenido');
    if (detalleOTContenidoEl) detalleOTContenidoEl.innerHTML = html;

    let offcanvasOTLabelEl = document.getElementById('offcanvasOTLabel');
    if (offcanvasOTLabelEl) offcanvasOTLabelEl.innerHTML = `Expediente de Unidad`;

    let offcanvasOTEl = document.getElementById('offcanvasOT');
    if (offcanvasOTEl) {
        let bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasOTEl);
        if (!bsOffcanvas) bsOffcanvas = new bootstrap.Offcanvas(offcanvasOTEl);
        bsOffcanvas.show();
    }

    // Disparamos la carga de OTs Hijas automáticamente
    cargarOTHijas(ot.ticket_entrada);
};

window.guardarBacklogLocal = function(e, placa) {
    e.preventDefault();
    const input = document.getElementById('txtNuevoBacklog');
    const trabajo = input.value.trim();
    const btn = e.target.querySelector('button');
    const txtOriginal = btn.innerHTML;

    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    btn.disabled = true;

    fetch('/api/backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: placa, trabajo_pendiente: trabajo, fuente: 'Taller (Inspección Visual)', usuario: window.usuarioLogueado || 'Admin' })
    })
    .then(res => res.json())
    .then(r => {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
        if (r.error) return alert('Error: ' + r.error);
        input.value = '';
        cargarBacklogPlaca(placa);
    })
    .catch(err => {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
        alert("Error de red: " + err.message);
    });
};

window.cargarBacklogPlaca = function(placa) {
    const contenedor = document.getElementById('listaBacklogLocal');
    if (!contenedor) return;

    contenedor.innerHTML = '<div class="spinner-border spinner-border-sm text-warning mb-2"></div><br><small>Cargando historial...</small>';

    fetch(`/api/backlog/${placa}`)
    .then(res => res.json())
    .then(r => {
        if (r.error) throw new Error(r.error);

        if (r.data.length === 0) {
            contenedor.innerHTML = '<i class="bi bi-inbox fs-3 d-block mb-1"></i> No hay mantenimientos pendientes para esta unidad.';
            return;
        }

        contenedor.innerHTML = r.data.map(b => `
            <div class="border-bottom text-start pb-2 mb-2">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="badge ${b.estado === 'Pendiente' ? 'bg-danger' : 'bg-success'} shadow-sm">${b.estado}</span>
                    <small class="text-muted fw-bold" style="font-size: 0.7rem;"><i class="bi bi-calendar3"></i> ${new Date(b.fecha_deteccion).toLocaleDateString('es-PE')}</small>
                </div>
                <div class="small fw-bold text-dark lh-sm">${b.trabajo_pendiente}</div>
                <div class="text-muted mt-1" style="font-size: 0.65rem;">
                    <i class="bi bi-person-fill"></i> ${b.creado_por || 'Admin'} &nbsp;|&nbsp; <i class="bi bi-diagram-2-fill"></i> ${b.fuente}
                </div>
            </div>
        `).join('');
    })
    .catch(e => {
        contenedor.innerHTML = '<span class="text-danger small"><i class="bi bi-exclamation-triangle"></i> Error cargando backlog</span>';
    });
};

// EDITOR EN LÍNEA DE RAMPA Y SITUACIÓN
window.abrirEdicionUbicacion = function(ticket, rampaAct, sitAct) {
    let optRampas = catalogosTaller.rampas.map(r => `<option value="${r.id}" ${r.id == rampaAct ? 'selected' : ''}>${r.nombre}</option>`).join('');
    let optSituaciones = catalogosTaller.situaciones.map(s => `<option value="${s.id}" ${s.id == sitAct ? 'selected' : ''}>${s.nombre}</option>`).join('');

    let html = `
        <div class="p-3 mt-2 border rounded shadow-sm" style="background-color: var(--bg);">
            <div class="mb-2">
                <label class="small text-muted fw-bold"><i class="bi bi-geo-alt"></i> Mover a Rampa</label>
                <select class="form-select form-select-sm shadow-sm" id="editRampa_${ticket}">
                    <option value="">Seleccione...</option>
                    ${optRampas}
                </select>
            </div>
            <div class="mb-3">
                <label class="small text-muted fw-bold"><i class="bi bi-tag"></i> Cambiar Situación</label>
                <select class="form-select form-select-sm shadow-sm" id="editSit_${ticket}">
                    <option value="">Seleccione...</option>
                    ${optSituaciones}
                </select>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-success w-100 shadow-sm fw-bold" onclick="guardarUbicacion('${ticket}')">
                    <i class="bi bi-check-lg"></i> Guardar Cambios
                </button>
                <button class="btn btn-sm btn-light w-100 shadow-sm border text-muted" onclick="cargarTableroStatus(); bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasOT')).hide();">
                    Cancelar
                </button>
            </div>
        </div>
    `;
    let boxUbicacionEl = document.getElementById(`box-ubicacion-${ticket}`);
    if (boxUbicacionEl) boxUbicacionEl.innerHTML = html;
};

window.guardarUbicacion = function(ticket) {
    let id_rampa = document.getElementById(`editRampa_${ticket}`).value;
    let id_situacion = document.getElementById(`editSit_${ticket}`).value;

    let btn = event.target.closest('button');
    let txtOriginal = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>...';
    btn.disabled = true;

    fetch(`/api/ordenes/${ticket}/ubicacion`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_rampa, id_situacion })
    })
    .then(res => res.json())
    .then(r => {
        if (r.error) throw new Error(r.error);
        bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasOT')).hide();
        cargarTableroStatus();
    })
    .catch(e => {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
        alert("Error: " + e.message);
    });
};

// 🔥 CALCULADORA DE RENTABILIDAD (Regla de Oro TuulApp: precio = costo / (1 - margen))
window.calcularTotalOT = function() {
    let costo = parseFloat(document.getElementById('otCostoRepuestos').value) || 0;
    let margen = Math.min(parseFloat(document.getElementById('otMargen').value) || 0, 99);
    let manoObra = parseFloat(document.getElementById('otManoObra').value) || 0;
    let total = (costo / (1 - (margen / 100))) + manoObra;

    let otTotalCalculadoEl = document.getElementById('otTotalCalculado');
    if (otTotalCalculadoEl) otTotalCalculadoEl.innerText = "$ " + total.toFixed(2);
};

// 🔥 EL MOTOR DE AVANCE KANBAN
window.avanzarEstadoOT = function(e, idRegistro, nuevoEstado) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...';
    btn.disabled = true;

    let nuevosDetalles = {};
    let tecnicoAsignado = null;

    if (nuevoEstado === 'Diagnóstico') {
        tecnicoAsignado = document.getElementById('otTecnicoIn').value.trim();
        nuevosDetalles.tecnico = tecnicoAsignado;
    } else if (nuevoEstado === 'Presupuesto') {
        nuevosDetalles.hallazgos = document.getElementById('otHallazgosIn').value.trim();
        nuevosDetalles.repuestos_solicitados = document.getElementById('otRepuestosIn').value.trim();
    } else if (nuevoEstado === 'Reparación') {
        const costo = parseFloat(document.getElementById('otCostoRepuestos').value) || 0;
        const margen = Math.min(parseFloat(document.getElementById('otMargen').value) || 0, 99);
        const manoObra = parseFloat(document.getElementById('otManoObra').value) || 0;
        nuevosDetalles.costo_repuestos = costo;
        nuevosDetalles.margen = margen;
        nuevosDetalles.mano_obra = manoObra;
        nuevosDetalles.total_cotizado = (costo / (1 - (margen / 100))) + manoObra;
    } else if (nuevoEstado === 'Control de Calidad') {
        nuevosDetalles.trabajo_realizado = document.getElementById('otTrabajoRealizado').value.trim();
    } else if (nuevoEstado === 'Entregado') {
        nuevosDetalles.fecha_entrega = new Date().toISOString();
    }

    fetch(`/api/ordenes/${idRegistro}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado, nuevosDetalles, tecnico_asignado: tecnicoAsignado, usuario: usuarioLogueado || 'Admin' })
    })
    .then(res => res.json())
    .then(r => {
        if (r.error) throw new Error(r.error);
        bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasOT')).hide();
        cargarTableroStatus();
    })
    .catch(err => {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
        alert('Error: ' + err.message);
    });
};

// 🔥 NOTIFICADOR INTELIGENTE POR WHATSAPP
window.enviarWhatsAppOT = function(index) {
    let ot = dataGlobalOrdenes[index];
    let detalles = {};
    try { detalles = JSON.parse(ot.detalles_json || '{}'); } catch(e) {}

    let texto = "";
    if (ot.estado === 'Presupuesto') {
        texto = `Hola, somos el Taller Azkell. 🛠️\n\nTe enviamos el reporte de diagnóstico y cotización de la unidad *${ot.placa}*:\n\n*Motivo de Ingreso:* ${detalles.motivo || '-'}\n*Hallazgos del Mecánico:* ${detalles.hallazgos || '-'}\n*Repuestos Requeridos:* ${detalles.repuestos_solicitados || 'Ninguno'}\n\n💰 *PRECIO TOTAL:* $ ${parseFloat(detalles.total_cotizado || 0).toFixed(2)}\n\nPor favor, responde este mensaje con un "Sí apruebo" para iniciar la reparación de inmediato.`;
    } else if (ot.estado === 'Entregado') {
        texto = `¡Hola! Tu unidad *${ot.placa}* ya está lista y fue entregada. ✅\n\n*Trabajo realizado:* ${detalles.trabajo_realizado || 'Mantenimiento completado'}\n*Total Facturado:* $ ${parseFloat(detalles.total_cotizado || 0).toFixed(2)}\n\nGracias por confiar en nuestro servicio técnico. 🚗💨`;
    }

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank');
};

// [ELIMINADO] Gestor de persistencia legacy (ultimoModuloCRM) — reemplazado por fleet_rutaActual en cargarModuloAislado


// 🔥 GUARDAR UNA NUEVA OT HIJA
window.guardarNuevaOTHija = function(e, ticket) {
    e.preventDefault();
    const tipo_ot = document.getElementById(`tipoOtHija_${ticket}`).value;
    const sub_tipo = document.getElementById(`subTipoOtHija_${ticket}`).value;

    const btn = e.target.querySelector('button');
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm"></i> Generando...';
    btn.disabled = true;

    fetch('/api/taller/generar_ot', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ ticket_visita: ticket, tipo_ot, sub_tipo, usuario: window.usuarioActual || 'Admin' })
    })
    .then(res => res.json())
    .then(r => {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
        if(r.error) return alert("Error: " + r.error);
        cargarOTHijas(ticket);
        if(window.cargarOrdenesTablero) window.cargarOrdenesTablero();
    })
    .catch(err => {
        btn.innerHTML = txtOriginal; btn.disabled = false; alert(err.message);
    });
};

// 🔥 CARGAR LA LISTA DE OTs HIJAS EN EL EXPEDIENTE
window.cargarOTHijas = function(ticket) {
    fetch(`/api/taller/trabajos/${ticket}`)
    .then(res => res.json())
    .then(r => {
        let cont = document.getElementById(`listaOTHijas_${ticket}`);
        if(!cont) return;

        if(r.error || r.data.length === 0) {
            cont.innerHTML = '<div class="text-center text-muted small py-3 bg-light rounded border"><i class="bi bi-inbox fs-4 d-block mb-1"></i> Aún no has generado Órdenes de Trabajo.</div>';
            return;
        }

        let html = r.data.map(ot => `
            <div class="d-flex justify-content-between align-items-center p-2 mb-2 border rounded shadow-sm" style="background-color: var(--surface);">
                <div>
                    <div class="fw-bold text-danger mb-1" style="font-size: 0.85rem;">${ot.id_ot}</div>
                    <span class="badge bg-primary" style="font-size: 0.65rem;">${ot.tipo_ot} - ${ot.sub_tipo}</span>
                </div>
                <div class="text-end">
                    <span class="badge bg-dark text-white shadow-sm mb-1 d-block" style="font-size: 0.65rem;">${ot.estado}</span>
                    <button class="btn btn-sm btn-outline-danger py-0 px-2 mt-1" onclick="eliminarOTHija('${ot.id_ot}', '${ticket}')" title="Eliminar OT">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        cont.innerHTML = html;
    });
};

// 🔥 MOTOR PARA ELIMINAR OT HIJA
window.eliminarOTHija = function(id_ot, ticket) {
    if(!confirm(`¿Seguro que deseas ELIMINAR la orden ${id_ot}? Desaparecerá del Kanban de los mecánicos.`)) return;

    fetch(`/api/taller/trabajos/${id_ot}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(r => {
        if(r.error) throw new Error(r.error);
        cargarOTHijas(ticket);
        if(window.cargarOrdenesTablero) window.cargarOrdenesTablero();
    })
    .catch(e => alert("Error eliminando OT: " + e.message));
};

// 🔥 EXPORTAR STATUS A EXCEL (CSV)
window.exportarStatusExcel = function() {
    if (!window.dataGlobalTallerMaster || window.dataGlobalTallerMaster.length === 0) {
        return alert("No hay datos en el Status para exportar.");
    }

    let csv = "Ticket Visita,Placa,Rampa,Situación,Ingreso,Salida Estimada,OT Generadas,Creado Por\n";

    window.dataGlobalTallerMaster.forEach(u => {
        let fechaIngreso = new Date(u.fecha_ingreso).toLocaleString('es-PE');
        let fechaSalida = u.fecha_hora_salida ? new Date(u.fecha_hora_salida).toLocaleString('es-PE') : 'No definida';

        let rampa     = (u.txtRampa     || 'Sin Rampa').replace(/,/g, '');
        let situacion = (u.txtSituacion || 'Sin Situación').replace(/,/g, '');
        let otMaster  = (u.id_ot        || 'Ninguna');

        csv += `${u.ticket_entrada},${u.placa},${rampa},${situacion},${fechaIngreso},${fechaSalida},${otMaster},${u.creado_por}\n`;
    });

    let blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);

    let fechaHoy = new Date().toLocaleDateString('es-PE').replace(/\//g, '-');
    link.download = `Status_Taller_${fechaHoy}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
