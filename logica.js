
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
const CACHE = { placas: null, fleetrun: null, usuarios: null, auditoria: null, statusMant: null, statusFlota: null, wialon: null, conductores: null };
const CACHE_TIME = {};

let dataGlobalFleetrun = []; let dataGlobalInspecciones = [];
let dataGlobalUsuarios = []; let dataGlobalAuditoria = []; let dataGlobalStatusFlota = []; let dataGlobalOrdenes = [];
let dataTiposMant     = []; let isHistorialFleetrun = false; let expandAllState = false; let expandAllSFState = false; 

let isHistorialStatus = false; let expandStatusMap = {}; let expandAllStatusState = false; let expandSFMap = {};
let chartTotalInst = null, chartMotorasInst = null, chartNoMotorasInst = null;
// 🔥 NUEVAS VARIABLES PARA EL DASHBOARD
let mapDashboardInst = null;
let chartDashboardInst = null;
let chartDashFleetrunInst = null;
let chartGeneralInspeccionesInst = null;
let chartTiposInspeccionInst = null;
Chart.register(ChartDataLabels); 

let currentTab = 0; let canvasFirma; let ctxFirma; let dibujando = false;

document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.getElementById('theme-toggle');
  const body = document.body;
  const saved = localStorage.getItem('theme');
  const btnTheme = document.getElementById('btn-theme-toggle');

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
    actualizarColoresGraficos();
  }

  let usuarioGuardado = localStorage.getItem('crm_user');
  if (!usuarioGuardado) {
    cargarModuloAislado('login');
  } else {
    if (typeof restaurarCascaronApp === 'function') restaurarCascaronApp();
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
function toggleSidebar() { const sidebar = document.getElementById('sidebarMenu'); const backdrop = document.getElementById('sidebarBackdrop'); if (window.innerWidth <= 768) { const isOpen = sidebar.classList.contains('mobile-open'); sidebar.classList.toggle('mobile-open', !isOpen); backdrop.classList.toggle('active', !isOpen); } else { sidebar.classList.toggle('collapsed'); setTimeout(initTooltips, 300); } }
function closeSidebar() { document.getElementById('sidebarMenu').classList.remove('mobile-open'); document.getElementById('sidebarBackdrop').classList.remove('active'); }
function togglePassword(inputId, btn) { const input = document.getElementById(inputId); const icon = btn.querySelector('i'); if (input.type === 'password') { input.type = 'text'; icon.classList.replace('bi-eye-fill', 'bi-eye-slash-fill'); } else { input.type = 'password'; icon.classList.replace('bi-eye-slash-fill', 'bi-eye-fill'); } }
function registrarActividad() { if (usuarioLogueado) localStorage.setItem('crm_ultimo_acceso', Date.now()); }
function verificarInactividad() { if (usuarioLogueado) { const ultimo = localStorage.getItem('crm_ultimo_acceso'); if (ultimo && (Date.now() - parseInt(ultimo) > TIEMPO_INACTIVIDAD)) cerrarSesion(); } }
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
        document.getElementById('contenedorPrincipal').innerHTML = `
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

window.aplicarPermisosBotonesUI = function() {
    let p = permisosUsuario || {};
    let correoActual = (localStorage.getItem('crm_correo') || '').toLowerCase();
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
            if (document.getElementById('moduloFleetrun').style.display === 'flex') mostrarFleetrun(dataGlobalFleetrun);
            if (document.getElementById('moduloUbicacion').style.display === 'flex' || forzarVista) mostrarUbicaciones(d);
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
    document.getElementById('mapa-placa-titulo').innerText = placa;
    // Usamos el Iframe gratuito de Google Maps
    document.getElementById('iframeMapaGPS').src = `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
    new bootstrap.Modal(document.getElementById('modalMapaGPS')).show();
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
    document.getElementById('cuerpoTablaUbicacion').innerHTML = html;
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
      auditoria:   { id: 'cuerpoTablaAuditoria', cols: 4 },
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
    usuarios: () => cargarModulo('usuarios', mostrarUsuarios, 'obtenerDatosUsuarios'),
    auditoria: () => cargarModulo('auditoria', mostrarAuditoria, 'obtenerDatosAuditoria'),
    statusMant: () => cargarModulo('statusMant', mostrarStatusInspecciones, 'obtenerDatosInspecciones'),
    conductores: () => cargarModulo('conductores', mostrarConductores, 'obtenerDatosConductores'),
    statusFlota: () => cargarModulo('statusFlota', mostrarStatusFlota, 'obtenerDatosStatusFlota')
  };
  if (acciones[nombre]) acciones[nombre]();
  if (nombre === 'status' || nombre === 'todos') {
    if (window.cargarCatalogosTaller) window.cargarCatalogosTaller();
    if (window.cargarTableroStatus) window.cargarTableroStatus();
  }
  if (nombre === 'ordenes' || nombre === 'todos') {
    if (window.cargarCatalogosTaller) window.cargarCatalogosTaller();
    if (window.cargarOrdenesTablero) window.cargarOrdenesTablero();
  }
}


const PERMISOS_MODULO = { 'placas': ['Administrador', 'Inspector', 'Mantenimiento'], 'almacenPlacas': ['Administrador', 'Inspector', 'Almacén', 'Almacen'], 'statusMant': ['Administrador', 'Inspector', 'Mantenimiento'], 'statusFlota': ['Administrador', 'Inspector', 'Flota'], 'fleetrun': ['Administrador', 'Inspector', 'Mantenimiento'], 'usuarios': ['Administrador', 'Inspector'], 'auditoria': ['Administrador'], 'ubicacion': ['Administrador', 'Flota', 'Inspector', 'Mantenimiento'], 'conductores': ['Administrador', 'Inspector', 'Flota'] };

window.cambiarModulo = function(modulo, idBoton) {
    localStorage.setItem('ultimoModuloCRM', modulo);
    let bloqueado = false;
    let p = permisosUsuario || {};
    let correoActual = (localStorage.getItem('crm_correo') || '').toLowerCase();
    let isAdm = p?.admin === true || correoActual === 'admin@azkell.com';

    if (modulo === 'statusMant' && !isAdm && !p?.insp?.l) bloqueado = true;
    if ((modulo === 'placas' || modulo === 'almacenPlacas') && !isAdm && !p?.placas?.l) bloqueado = true;
    if (modulo === 'fleetrun' && !isAdm && !p?.fleet?.l) bloqueado = true;
    if (modulo === 'ubicacion' && !isAdm && !p?.gps?.l) bloqueado = true;
    if (modulo === 'statusFlota' && !isAdm && !p?.status?.l) bloqueado = true;
    if (modulo === 'conductores' && !isAdm && !p?.cond?.l) bloqueado = true;
    if (modulo === 'usuarios' && !isAdm) bloqueado = true;
    if (modulo === 'auditoria' && !isAdm && !p?.mod_auditoria) bloqueado = true;

    if (bloqueado) return;

    document.querySelectorAll('.modulo-wrapper').forEach(m => { m.style.display = 'none'; });
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    if (idBoton) { const btnActivo = document.getElementById(idBoton); if (btnActivo) btnActivo.classList.add('active'); }
    const titulo = document.getElementById('tituloTopBar');

    if (modulo === 'dashboard') { let el=document.getElementById('moduloDashboard'); if(el) el.style.display = 'flex'; titulo.innerText = 'Centro de Comando'; recargarDashboard(); }
    else if (modulo === 'usuarios') { let el=document.getElementById('moduloUsuarios'); if(el) el.style.display = 'flex'; titulo.innerText = 'Gestión de Usuarios'; cargarModulo('usuarios', mostrarUsuarios, 'obtenerDatosUsuarios'); }
    else if (modulo === 'auditoria') { let el=document.getElementById('moduloAuditoria'); if(el) el.style.display = 'flex'; titulo.innerText = 'Control y Auditoría'; cargarModulo('auditoria', mostrarAuditoria, 'obtenerDatosAuditoria'); }
    else if (modulo === 'status') {
        let el = document.getElementById('moduloStatusTaller');
        if(el) el.style.display = 'block';
        titulo.innerText = 'Status del Taller';
        window.moduloActualTallerMaster = 'status'; // 🔥 flag para toggleFabMenu
        if(window.cargarCatalogosTaller) window.cargarCatalogosTaller();
        if(window.cargarTableroStatus) window.cargarTableroStatus();

        // 🔥 INYECTAR OPCIÓN EN EL BOTÓN FLOTANTE "MÁS" GLOBAL (+)
        let fabContent = document.getElementById('fabActionListContent');
        let btnFab = document.getElementById('btnFabMain');
        if (fabContent && btnFab) {
            fabContent.innerHTML = `
                <div class="d-flex align-items-center justify-content-end gap-2 mb-2" onclick="abrirIngresoUnidad(); if(window.toggleFabMenu) toggleFabMenu();" style="cursor: pointer;">
                    <span class="badge bg-danger shadow-sm px-3 py-2" style="font-size: 0.9rem;">Registrar Ingreso</span>
                    <button class="btn btn-danger rounded-circle shadow-sm d-flex justify-content-center align-items-center" style="width: 45px; height: 45px;">
                        <i class="bi bi-car-front-fill"></i>
                    </button>
                </div>
            `;
            btnFab.style.display = 'flex';
        }
    }
    else if (modulo === 'ordenes') { let el=document.getElementById('moduloOrdenes'); if(el) el.style.display = 'block'; titulo.innerText = 'Órdenes de Trabajo'; if(window.cargarCatalogosTaller) window.cargarCatalogosTaller(); if(window.cargarOrdenesTablero) window.cargarOrdenesTablero(); }
    else if (modulo === 'placas' || modulo === 'almacenPlacas') { let el=document.getElementById('moduloPlacas'); if(el) el.style.display = 'flex'; titulo.innerText = (modulo === 'placas') ? 'Gestión de Placas' : 'Inventario de Placas'; cargarModulo('placas', mostrarPlacas, 'obtenerDatosPlacas'); }
    else if (modulo === 'fleetrun') { let el=document.getElementById('moduloFleetrun'); if(el) el.style.display = 'flex'; titulo.innerText = 'Sistema Fleetrun'; cargarModulo('fleetrun', mostrarFleetrun, 'obtenerDatosFleetrun'); }
    else if (modulo === 'statusMant') { cargarModuloAislado('mantenimiento/inspecciones'); }
    else if (modulo === 'statusFlota') { let el=document.getElementById('moduloStatusFlota'); if(el) el.style.display = 'flex'; titulo.innerText = 'Status de Flota'; cargarModulo('statusFlota', mostrarStatusFlota, 'obtenerDatosStatusFlota'); }
    else if (modulo === 'ubicacion') { let el=document.getElementById('moduloUbicacion'); if(el) el.style.display = 'flex'; titulo.innerText = 'Ubicación GPS Flota'; recargarWialon(true); }
    else if (modulo === 'conductores') { let el=document.getElementById('moduloConductores'); if(el) el.style.display = 'flex'; titulo.innerText = 'Directorio de Conductores'; cargarModulo('conductores', mostrarConductores, 'obtenerDatosConductores'); }

    if (window.innerWidth <= 768) closeSidebar();
    aplicarPermisosBotonesUI();
}

// =====================================================================
// 🚀 ROUTER EMPRESARIAL: Carga módulos desde subcarpetas físicamente
// =====================================================================
window.cargarModuloAislado = async function(rutaModulo) {
    // 1. Ocultar TODOS los módulos antiguos que siguen en el Index.html
    document.querySelectorAll('.modulo-wrapper, .container-fluid').forEach(el => {
        if(el.id && el.id.startsWith('modulo')) el.style.display = 'none';
    });

    // 2. Asegurar que el contenedor principal sea visible
    const appCrm = document.getElementById('app-crm');
    if (appCrm) appCrm.style.display = 'flex';

    // 3. Mostrar nuestro escenario dinámico y poner un spinner
    const root = document.getElementById('root-dinamico');
    root.style.display = 'block';
    root.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted fw-bold">Cargando módulo...</p></div>';

    try {
        // 3. Traer el diseño (HTML) desde la carpeta específica
        const respHTML = await fetch(`/modulos/${rutaModulo}/vista.html`);
        if(!respHTML.ok) throw new Error(`No se encontró vista.html en /modulos/${rutaModulo}`);
        root.innerHTML = await respHTML.text();

        // 4. Crear un ID único para el script (ej: script-mantenimiento-placas)
        const scriptId = `script-${rutaModulo.replace('/', '-')}`;

        // 5. Inyectar la lógica (JS) solo si no se ha cargado antes
        if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = `/modulos/${rutaModulo}/logica.js`;
            // Llamar la función init una vez que el JS ha cargado por primera vez
            let nombreCarpeta = rutaModulo.split('/')[1] || rutaModulo.split('/')[0];
            let funcionInit = `init_${nombreCarpeta}`;
            script.onload = function() {
                if (typeof window[funcionInit] === 'function') window[funcionInit]();
            };
            document.body.appendChild(script);
        } else {
            // Si el JS ya estaba cargado, llamamos a su función de inicio automático (si existe)
            // Extraemos la última palabra (ej: de 'mantenimiento/placas' extraemos 'placas')
            let nombreCarpeta = rutaModulo.split('/')[1] || rutaModulo.split('/')[0];
            let funcionInit = `init_${nombreCarpeta}`;
            if (typeof window[funcionInit] === 'function') {
                window[funcionInit]();
            }
        }
    } catch(e) {
        root.innerHTML = `<div class="alert alert-danger m-4 shadow-sm"><i class="bi bi-exclamation-triangle-fill"></i> Error de Arquitectura: ${e.message}</div>`;
    }
};

function procesadorErroresCuota(datos, containerId) {
    if (typeof datos === 'string' && datos.includes('ERROR_BACKEND')) { 
        let msg = datos;
        if(datos.includes('Quota exceeded') || datos.includes('Límite')) msg = "🚨 <b>Límite de Lecturas de Firebase Alcanzado (50,000 al día)</b>.<br>El sistema se ha pausado por hoy para no generar cobros. Usa tu caché local o se reactivará solo a medianoche.";
        document.getElementById(containerId).innerHTML = `<tr><td colspan="15" class="text-center py-5 text-danger fs-6">${msg}</td></tr>`; 
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
        typeof chartDashFleetrunInst !== 'undefined' ? chartDashFleetrunInst : null,
        typeof chartFleetrunInst !== 'undefined' ? chartFleetrunInst : null,
        typeof chartGeneralInspeccionesInst !== 'undefined' ? chartGeneralInspeccionesInst : null
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
function rellenarFiltroCheck(idLista, setObj, fnName) { const ul = document.getElementById(idLista); if (!ul) return; ul.innerHTML = ''; Array.from(setObj).sort().forEach(v => { if (v.trim() && v.trim() !== '-') { ul.innerHTML += `<li><label class="dropdown-item form-check-label d-flex align-items-center"><input type="checkbox" class="form-check-input me-2 mt-0" value="${v}" onchange="${fnName}()"> ${v}</label></li>`; } }); }
function cargarTablaFleetrun(forzarRefresh = false) { if(!forzarRefresh && dataGlobalFleetrun.length > 0) { mostrarFleetrun(dataGlobalFleetrun); return; } document.getElementById('cuerpoTablaFleetrun').innerHTML = '<tr><td colspan="10" class="text-center py-4"><span class="spinner-border text-warning spinner-border-sm"></span> Cargando...</td></tr>'; google.script.run.withSuccessHandler(mostrarFleetrun).obtenerDatosFleetrun(); }
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
      let p = permisosUsuario || {}; let isAdmF = p.admin === true || (localStorage.getItem('crm_correo') || '').toLowerCase() === 'admin@azkell.com'; let canEditF = isAdmF || p.fleet?.e === true; let canDeleteF = isAdmF || p.fleet?.d === true; let setFClientes = new Set(); let setFUts = new Set(); let mapPlacas = new Map(); 
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
  document.getElementById('cuerpoTablaFleetrun').innerHTML = html;
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

    document.getElementById('detalleFleetrunContenido').innerHTML = html;
    let offcanvasElement = document.getElementById('offcanvasFleetrun');
    let bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasElement);
    if (!bsOffcanvas) bsOffcanvas = new bootstrap.Offcanvas(offcanvasElement);
    bsOffcanvas.show();
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

function filtrarTabla(idTabla, idBuscador) { const filtro = document.getElementById(idBuscador || 'buscadorAuditoria')?.value.toLowerCase() || ''; const filas = document.getElementById(idTabla).getElementsByTagName('tr'); for (let i = 1; i < filas.length; i++) { const textoFila = filas[i].textContent || filas[i].innerText; filas[i].style.display = textoFila.toLowerCase().indexOf(filtro) > -1 ? '' : 'none'; } }
function eliminarRegistro(id, coleccion) { itemAEliminarID = id; itemAEliminarCol = coleccion; document.getElementById('delete-record-id').innerText = id; const input = document.getElementById('input-confirmar-eliminar'); input.value = ''; document.getElementById('msg-error-eliminar').style.display = 'none'; const label = document.getElementById('label-confirmar'); const hint = document.getElementById('hint-azkell'); if (coleccion === 'Usuarios') { label.innerHTML = 'Ingresa la <span class="text-danger fw-bold border-bottom border-danger pb-1">Clave Maestra</span> para confirmar'; input.placeholder = ''; input.type = 'password'; if (hint) hint.style.display = 'block'; } else { label.innerHTML = 'Escribe la palabra <span class="text-danger fw-bold border-bottom border-danger pb-1">Si</span> para confirmar'; input.placeholder = 'Si'; input.type = 'text'; if (hint) hint.style.display = 'none'; } new bootstrap.Modal(document.getElementById('modalConfirmarEliminar')).show(); }

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

function cargarTablaAuditoria(forzarRefresh = false) { if(!forzarRefresh && dataGlobalAuditoria.length > 0) { mostrarAuditoria(dataGlobalAuditoria); return; } document.getElementById('cuerpoTablaAuditoria').innerHTML = '<tr><td colspan="4" class="text-center py-4"><span class="spinner-border text-warning spinner-border-sm"></span> Cargando bitácora...</td></tr>'; google.script.run.withSuccessHandler(mostrarAuditoria).obtenerDatosAuditoria(); }
function mostrarAuditoria(datos) { if(procesadorErroresCuota(datos, 'cuerpoTablaAuditoria')) return; dataGlobalAuditoria = datos; let html = ''; if (!datos || datos.length === 0) { html = '<tr><td colspan="4" class="text-center py-4" style="color:var(--subtext)!important">Aún no hay registros de actividad.</td></tr>'; } else { datos.forEach(fila => { const badge = fila[2] === 'CREÓ' ? '<span class="badge bg-success">CREÓ</span>' : fila[2] === 'MODIFICÓ' ? '<span class="badge bg-warning text-dark">MODIFICÓ</span>' : '<span class="badge bg-danger">ELIMINÓ</span>'; html += `<tr><td style="color:var(--subtext)!important"><i class="bi bi-clock"></i> ${fila[0]}</td><td class="fw-bold">${fila[1]}</td><td>${badge}</td><td class="text-wrap">${fila[3]}</td></tr>`; }); } document.getElementById('cuerpoTablaAuditoria').innerHTML = html; }

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
            let correoActual = (localStorage.getItem('crm_correo') || '').toLowerCase();
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
    document.getElementById('cuerpoTablaUsuarios').innerHTML = html;
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
        document.getElementById('tituloModalUser').innerHTML = '<i class="bi bi-person-plus-fill text-success"></i> Crear Nuevo Personal';
        document.getElementById('gu_id').value = '';
    } else {
        if (esClon) {
            document.getElementById('tituloModalUser').innerHTML = `<i class="bi bi-copy text-success"></i> Clonando permisos de: ${filaData[1]}`;
            document.getElementById('gu_id').value = '';
            document.getElementById('gu_nombre').value = '';
            document.getElementById('gu_correo').value = '';
            document.getElementById('gu_password').value = '';
            document.getElementById('gu_cargo').value = filaData[2];
        } else {
            document.getElementById('tituloModalUser').innerHTML = '<i class="bi bi-pencil-square text-warning"></i> Editar Accesos de Personal';
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
            document.getElementById('tituloModalUser').innerHTML = '<i class="bi bi-shield-lock-fill text-warning"></i> Cuenta Fundador (Intocable)';
            if (adminSwitch) { adminSwitch.checked = true; adminSwitch.disabled = true; }
            toggleAdminUI(true);
            document.getElementById('gu_estado').value = 'Activo';
            document.getElementById('gu_estado').disabled = true;
            document.getElementById('gu_correo').readOnly = true;
        }
    }
    new bootstrap.Modal(document.getElementById('modalGestorUsuario')).show();
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

// ==========================================
// 🚛 MODULE STATUS FLOTA (AGRUPADO POR TIPO DINÁMICO)
// ==========================================

function resetearYRecargarStatusFlota() {
    let tzOffset = (new Date()).getTimezoneOffset() * 60000;
    let hoyISO = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
    document.getElementById('filtroStatusFecha').value = hoyISO;
    document.getElementById('filtroStatusCorte').value = "";
    recargarModulo('statusFlota');
}

function abrirModalNuevoStatusFlota() {
    document.getElementById('formStatusFlota').reset();
    document.getElementById('sf_id').value = '';
    document.getElementById('sf_cliente_motora').value = '';
    document.getElementById('sf_cliente_nomotora').value = '';
    document.getElementById('sf_zona').value = '';

    let tzOffset = (new Date()).getTimezoneOffset() * 60000;
    document.getElementById('sf_fecha').value = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];

    let hora = new Date().getHours();
    if (hora >= 4 && hora < 12) document.getElementById('corte1').checked = true;
    else if (hora >= 12 && hora < 16) document.getElementById('corte2').checked = true;
    else document.getElementById('corte3').checked = true;

    new bootstrap.Modal(document.getElementById('modalStatusFlota')).show();

    // 🧠 MAGIA: Jalar los conductores automáticamente al abrir la ventana desde Node.js (Aiven)
    const dlConductores = document.getElementById('dl-conductores-status');
    if (dlConductores) {
        fetch('/api/script/obtenerDatosConductores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args: [] }) // Aquí estaba el truco, nuestro emulador espera 'args'
        })
        .then(res => res.json())
        .then(r => {
            let htmlOptions = '';
            // Si viene envuelto en r.data.data lo desencapsulamos
            let dataArray = r.data && Array.isArray(r.data) ? r.data : (r.data && r.data.data ? r.data.data : []);
            if (Array.isArray(dataArray)) {
                dataArray.forEach(fila => {
                    let nombre = fila.nombre || fila[1];
                    if (nombre) htmlOptions += `<option value="${nombre}">`;
                });
            }
            dlConductores.innerHTML = htmlOptions;
        })
        .catch(e => console.error("Error cargando lista de conductores:", e));
    }
}

function toggleGroupRowSF(claseZ) {
    expandSFMap[claseZ] = !expandSFMap[claseZ];
    filtrarStatusFlotaAvanzado();
}

// Lector de Mentes: Busca el tipo de ambas placas y las junta
window.obtenerTipoCompuesto = function(motora, nomotora) {
    // Limpiador automático de tildes rotas (UTF-8)
    const limpiarTexto = (txt) => {
        if (!txt) return "";
        return txt.toUpperCase()
            .replace(/Ã³/g, 'Ó')
            .replace(/Ã"/g, 'Ó')
            .replace(/CAMIÃ³N/g, 'CAMIÓN')
            .replace(/CAMIÃ"N/g, 'CAMIÓN');
    };

    let tMot = "", tNoMot = "";

    if (motora && motora !== "-") {
        let p = dataGlobalPlacas.find(x => normalizeStr(x[0]) === normalizeStr(motora));
        if (p && p[5] && p[5] !== "-") tMot = limpiarTexto(p[5]); // Índice 5 es TIPO
    }
    if (nomotora && nomotora !== "-") {
        let p = dataGlobalPlacas.find(x => normalizeStr(x[0]) === normalizeStr(nomotora));
        if (p && p[5] && p[5] !== "-") tNoMot = limpiarTexto(p[5]); // Índice 5 es TIPO
    }

    if (tMot && tNoMot) return `${tMot} - ${tNoMot}`;
    if (tMot) return tMot;
    if (tNoMot) return tNoMot;
    return "SIN TIPO REGISTRADO";
};

function mostrarStatusFlota(datos) {
    if (!dataGlobalInspecciones || dataGlobalInspecciones.length === 0) {
        document.getElementById('cuerpoTablaStatusFlota').innerHTML = '<tr><td colspan="9" class="text-center py-4"><span class="spinner-border text-warning spinner-border-sm"></span> Cruzando datos con Inspecciones Mecánicas...</td></tr>';
        google.script.run.withSuccessHandler(insp => {
            dataGlobalInspecciones = insp;
            mostrarStatusFlota(datos);
        }).obtenerDatosInspecciones();
        return;
    }

    // Configurar Fecha de Hoy por defecto si no hay nada escrito
    let tzOffset = (new Date()).getTimezoneOffset() * 60000;
    let hoyISO = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
    if (!document.getElementById('filtroStatusFecha').value) {
        document.getElementById('filtroStatusFecha').value = hoyISO;
    }

    dataGlobalStatusFlota = datos;
    let html = '';
    if (!datos || datos.length === 0) {
        html = '<tr><td colspan="9" class="text-center py-4 text-muted">No hay registros de Status Flota.</td></tr>';
    } else {
        let mapTipos = new Map();
        let setClis = new Set();

        datos.forEach(fila => {
            let motora = fila[3];
            let nomotora = fila[4];
            let tipoDinamico = obtenerTipoCompuesto(motora, nomotora);

            if (!mapTipos.has(tipoDinamico)) mapTipos.set(tipoDinamico, []);
            mapTipos.get(tipoDinamico).push(fila);
            setClis.add(fila[5]); setClis.add(fila[6]);
        });

        mapTipos.forEach((registros, tipoName) => {
            let claseZ = normalizarClase(tipoName);
            let isExpandido = expandSFMap[claseZ] !== false;
            let iconClass = isExpandido ? 'bi bi-chevron-down' : 'bi bi-chevron-right';

            html += `<tr class="group-header data-row-sf" style="cursor:pointer;" onclick="toggleGroupRowSF('${claseZ}')" data-group-clase="${claseZ}">
                <td colspan="9" class="text-start" style="padding-left: 20px;">
                    <i class="bi ${iconClass} ms-1 me-2 text-warning"></i>
                    <i class="bi bi-truck text-primary me-2"></i><span class="text-uppercase fw-bold">${tipoName}</span>
                    <span class="group-count badge bg-secondary ms-2">${registros.length}</span>
                </td>
            </tr>`;

            registros.forEach(fila => {
                let id = fila[0]; let fecha = fila[1]; let corte = fila[2];
                let motora = fila[3]; let nomotora = fila[4];
                let cliMot = fila[5]; let cliNoMot = fila[6];
                let zona = fila[7] || '';
                let conductor = fila[8]; let estado = fila[9]; let obs = fila[10] || 'Sin observaciones';

                let getDias = (placa) => {
                    if (!placa || placa === "-") return "-";
                    let inspList = dataGlobalInspecciones.filter(i => normalizeStr(i.placa) === normalizeStr(placa));
                    if (inspList.length === 0) return `<span class="badge bg-secondary">S/I</span>`;

                    let parseD = (str) => {
                        if (!str) return 0;
                        if (str.includes('/')) { let p = str.split('/'); return new Date(p[2], p[1] - 1, p[0]).getTime(); }
                        return new Date(str + "T00:00:00").getTime() || 0;
                    };

                    inspList.sort((a, b) => parseD(b.fecha_ingreso || b[1]) - parseD(a.fecha_ingreso || a[1]));
                    let insp = inspList[0];
                    let fIngreso = insp.fecha_ingreso || insp[1];
                    let dProp = parseInt(insp.dias_propuestos || insp[6]) || 30;

                    let fIng = fIngreso.includes('/') ? new Date(fIngreso.split('/')[2], fIngreso.split('/')[1] - 1, fIngreso.split('/')[0]) : new Date(fIngreso + "T00:00:00");
                    fIng.setDate(fIng.getDate() + dProp);

                    let hoy = new Date(); hoy.setHours(0, 0, 0, 0);
                    let dias = Math.ceil((fIng - hoy) / (1000 * 60 * 60 * 24));

                    if (dias < 0) return `<span class="badge bg-danger text-white shadow-sm">Vencido ${Math.abs(dias)}d</span>`;
                    else if (dias <= 7) return `<span class="badge bg-warning text-dark shadow-sm">Faltan ${dias}d</span>`;
                    else return `<span class="badge bg-success text-white shadow-sm">Faltan ${dias}d</span>`;
                };

                let bEst = estado === 'Vacío' ? '<span class="text-muted fw-bold">VACÍO</span>' : `<span class="text-primary fw-bold text-uppercase">${estado}</span>`;
                let bZona = zona === 'Lavado' ? '<span class="badge bg-info text-dark">LAVADO</span>' : (zona === 'Mantenimiento' ? '<span class="badge bg-warning text-dark">MANTENIMIENTO</span>' : '<span class="text-muted">-</span>');

                let pSF = permisosUsuario || {};
                let isAdmSF = pSF.admin === true || (localStorage.getItem('crm_correo') || '').toLowerCase() === 'admin@azkell.com';
                let canEditSF = isAdmSF || pSF.status?.e === true;
                let canDeleteSF = isAdmSF || pSF.status?.d === true;
                let itemsSF = '';
                if(canEditSF) itemsSF += `<li><a class="dropdown-item fw-bold" href="#" onclick="abrirModalEditarStatusFlota('${id}')"><i class="bi bi-pencil text-warning"></i> Editar</a></li>`;
                if(canEditSF && canDeleteSF) itemsSF += `<li><hr class="dropdown-divider"></li>`;
                if(canDeleteSF) itemsSF += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${id}','StatusFlota')"><i class="bi bi-trash"></i> Eliminar</a></li>`;
                let menuAcciones = itemsSF ? `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${itemsSF}</ul></div>` : `<span class="text-muted"><i class="bi bi-dash"></i></span>`;

                html += `<tr class="child-row-sf data-row-status-flota" style="display:${isExpandido ? '' : 'none'};" data-climot="${cliMot}" data-clinomot="${cliNoMot}" data-zona="${tipoName}" data-fecha="${fecha}" data-corte="${corte}">
                    <td class="fw-bold text-secondary">${motora || '-'}</td>
                    <td>${getDias(motora)}</td>
                    <td class="fw-bold text-secondary">${nomotora || '-'}</td>
                    <td>${getDias(nomotora)}</td>
                    <td class="text-uppercase">${conductor || '-'}</td>
                    <td>${bEst}</td>
                    <td>${bZona}</td>
                    <td class="text-wrap" style="max-width: 150px;">${obs}</td>
                    <td>${menuAcciones}</td>
                </tr>`;
            });
        });

        rellenarFiltroCheck('filtroSFCliente', setClis, 'filtrarStatusFlotaAvanzado');
    }

    document.getElementById('cuerpoTablaStatusFlota').innerHTML = html;
    filtrarStatusFlotaAvanzado();
}

function filtrarStatusFlotaAvanzado() {
    const txt = document.getElementById('buscadorStatusFlota')?.value.toLowerCase() || '';
    const dateF = document.getElementById('filtroStatusFecha')?.value || '';
    const corte = document.getElementById('filtroStatusCorte')?.value || '';
    const chkCli = Array.from(document.querySelectorAll('#filtroSFCliente input:checked')).map(e => e.value);

    const headers = document.querySelectorAll('#cuerpoTablaStatusFlota tr.group-header');
    headers.forEach(header => {
        const claseZ = header.getAttribute('data-group-clase');
        const childRows = document.querySelectorAll(`.child-row-sf[data-zona="${header.querySelector('.text-uppercase')?.innerText || ''}"]`);
        let hasVisibleChild = false;
        let isExpanded = expandSFMap[claseZ] !== false;

        childRows.forEach(row => {
            const rCliMot = row.getAttribute('data-climot'); const rCliNoMot = row.getAttribute('data-clinomot');
            const rCorte = row.getAttribute('data-corte'); const rFecha = row.getAttribute('data-fecha');
            const textoFila = row.innerText.toLowerCase();

            const matchTxt = !txt || textoFila.includes(txt);
            const matchCli = !chkCli.length || chkCli.includes(rCliMot) || chkCli.includes(rCliNoMot);
            const matchCorte = !corte || corte === rCorte;

            let matchFecha = true;
            if (dateF) {
                let dbFecha = rFecha;
                if (dbFecha && dbFecha.includes('T')) dbFecha = dbFecha.split('T')[0];
                if (dbFecha && dbFecha.includes('/')) dbFecha = dbFecha.split('/').reverse().join('-');
                matchFecha = (dbFecha === dateF);
            }

            const pasaFiltro = matchTxt && matchCli && matchCorte && matchFecha;

            if (pasaFiltro) {
                row.style.display = isExpanded ? '' : 'none';
                hasVisibleChild = true;
            } else {
                row.style.display = 'none';
            }
        });

        header.style.display = hasVisibleChild ? '' : 'none';
        let icon = header.querySelector('i:first-child');
        if (icon) icon.className = isExpanded ? 'bi bi-chevron-down ms-1 me-2 text-warning' : 'bi bi-chevron-right ms-1 me-2 text-warning';
    });
}

window.autocompletarStatus = function(tipo) {
    let placaInput = normalizeStr(document.getElementById('sf_' + tipo).value);
    let fieldCli = document.getElementById('sf_cliente_' + tipo);

    if (!placaInput) {
        fieldCli.value = '';
        return;
    }

    // Extraer cliente desde placas globales (Índice 1 es CLIENTE)
    let matchPlaca = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placaInput);
    fieldCli.value = matchPlaca ? (matchPlaca[1] || 'Sin Cliente') : 'No Registrada';
};

function enviarStatusFlota(event, formObj) {
    event.preventDefault();
    const btn = document.getElementById('btnGuardarSF');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    if (!formObj.sf_id.value) {
        formObj.sf_id.value = "SF-" + Date.now();
    }
    formObj.usuarioAutor.value = usuarioLogueado;

    // Guardar en memoria la fecha y turno actual para no borrarlos
    let fechaGuardada = formObj.sf_fecha.value;
    let corteGuardado = formObj.querySelector('input[name="sf_corte"]:checked').value;

    // Convertir formulario a objeto para enviar
    const formData = new FormData(formObj);
    const formDataObj = {
        form: {
            sf_id: formData.get('sf_id'),
            sf_fecha: formData.get('sf_fecha'),
            sf_corte: formData.get('sf_corte'),
            sf_motora: formData.get('sf_motora'),
            sf_nomotora: formData.get('sf_nomotora'),
            sf_cliente_motora: formData.get('sf_cliente_motora'),
            sf_cliente_nomotora: formData.get('sf_cliente_nomotora'),
            sf_zona: formData.get('sf_zona'),
            sf_conductor: formData.get('sf_conductor'),
            sf_estado: formData.get('sf_estado'),
            sf_obs: formData.get('sf_obs'),
            usuarioAutor: usuarioLogueado
        }
    };

    fetch('/api/script/guardarStatusFlota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formDataObj)
    })
    .then(res => res.json())
    .then(r => {
        if (r.data === 'Éxito') {
            formObj.reset();

            // 1. Restaurar valores fijos
            formObj.sf_fecha.value = fechaGuardada;
            document.getElementById('corte' + corteGuardado).checked = true;
            document.getElementById('sf_id').value = '';

            // 2. Limpiar campos de cliente
            document.querySelectorAll('[id^="sf_cliente_"]').forEach(el => el.value = '');

            // 3. Efecto visual de éxito SIN CERRAR la ventana
            btn.innerHTML = '<i class="bi bi-check-circle"></i> ¡Guardado!';
            btn.classList.replace('btn-primary', 'btn-success');
            btn.classList.replace('btn-warning', 'btn-success');

            setTimeout(() => {
                btn.innerHTML = 'Guardar Registro';
                btn.classList.replace('btn-success', 'btn-primary');
                btn.classList.remove('text-dark');
                btn.disabled = false;
                document.getElementById('sf_motora').focus(); // Pone el cursor listo para la siguiente placa
            }, 1000);

            recargarModulo('statusFlota');
        } else {
            alert(r.data);
            btn.disabled = false;
            btn.innerHTML = 'Guardar Registro';
        }
    })
    .catch(e => {
        alert('Error de red: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = 'Guardar Registro';
    });
}

function toggleAllSFGroups() {
    expandAllSFState = !expandAllSFState;

    // Actualizar expandSFMap para TODAS las zonas
    const headers = document.querySelectorAll('#cuerpoTablaStatusFlota tr.group-header');
    headers.forEach(header => {
        const claseZ = header.getAttribute('data-group-clase');
        expandSFMap[claseZ] = expandAllSFState;
    });

    // Llamar a filtrarStatusFlotaAvanzado para respetar filtros
    filtrarStatusFlotaAvanzado();
}

function abrirModalEditarStatusFlota(id) {
    if (event) event.preventDefault();

    let fila = dataGlobalStatusFlota.find(f => f[0] === id);
    if (!fila) {
        alert("No se encontró el registro para editar.");
        return;
    }

    document.getElementById('formStatusFlota').reset();
    document.getElementById('sf_id').value = fila[0];

    let dDate = new Date(fila[1] + "T00:00:00");
    let fechaFormat = isNaN(dDate.getTime()) ? "" : dDate.toISOString().split('T')[0];
    document.getElementById('sf_fecha').value = fechaFormat || fila[1];

    let corte = fila[2];
    if (corte) {
        let radio = document.getElementById('corte' + corte);
        if (radio) radio.checked = true;
    }

    document.getElementById('sf_motora').value = fila[3] || '';
    document.getElementById('sf_nomotora').value = fila[4] || '';
    document.getElementById('sf_cliente_motora').value = fila[5] || '';
    document.getElementById('sf_cliente_nomotora').value = fila[6] || '';
    document.getElementById('sf_zona').value = fila[7] || '';
    document.getElementById('sf_conductor').value = fila[8] || '';
    document.getElementById('sf_estado').value = fila[9] || '';
    document.getElementById('sf_obs').value = fila[10] || '';

    autocompletarStatus('motora');
    autocompletarStatus('nomotora');

    const btn = document.getElementById('btnGuardarSF');
    btn.innerHTML = '<i class="bi bi-pencil-square"></i> Actualizar';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-warning', 'text-dark');

    new bootstrap.Modal(document.getElementById('modalStatusFlota')).show();
}


window.generarPDFStatusFlota = function(event) {
    // El seguro: busca el botón de forma inteligente aunque no se pase el evento
    let btn = (event && event.currentTarget) ? event.currentTarget : document.querySelector('button[onclick*="generarPDFStatusFlota"]');
    let txtOriginal = '';
    if (btn) {
        txtOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Generando...';
        btn.classList.add('disabled');
    }

    // Extraer Filtros Actuales para el Título
    let corteSeleccionado = document.getElementById('filtroStatusCorte')?.value;
    let textoCorte = corteSeleccionado ? `Corte ${corteSeleccionado}` : "Todos los cortes";
    let fechaRaw = document.getElementById('filtroStatusFecha')?.value || new Date().toISOString().split('T')[0];
    let fechaBonita = fechaRaw.split('-').reverse().join('/');

    let htmlCuerpo = '';
    const filas = document.querySelectorAll('#cuerpoTablaStatusFlota tr');

    filas.forEach(row => {
        if (row.style.display !== 'none') {
            if (row.classList.contains('group-header')) {
                let txtTipo = row.querySelector('span.text-uppercase');
                if (txtTipo) {
                    htmlCuerpo += `<tr><td colspan="6" style="background-color: #cbd5e1; font-weight: bold; padding: 4px 8px; color:#1e293b; text-align:left; font-size: 11px;">${txtTipo.innerText}</td></tr>`;
                }
            } else if (row.classList.contains('child-row-sf')) {
                let celdas = row.querySelectorAll('td');
                htmlCuerpo += `<tr>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #2563eb; font-size: 9px; line-height: 1.1; width: 12%;">${celdas[0]?.innerText || ''}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b; font-size: 9px; line-height: 1.1; width: 12%;">${celdas[2]?.innerText || ''}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-size: 9px; line-height: 1.1; width: 22%;">${celdas[4]?.innerText || ''}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-size: 9px; line-height: 1.1; width: 12%;">${celdas[5]?.innerText || ''}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; font-weight: bold; font-size: 9px; line-height: 1.1; width: 12%;">${celdas[6]?.innerText || ''}</td>
                    <td style="padding: 3px 4px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 9px; line-height: 1.1; width: 30%; word-break: break-word;">${celdas[7]?.innerText || ''}</td>
                </tr>`;
            }
        }
    });

    if (!htmlCuerpo) htmlCuerpo = '<tr><td colspan="6" class="text-center py-4" style="font-size: 10px;">No hay datos en la pantalla para exportar.</td></tr>';

    document.getElementById('pdf-sf-body').innerHTML = htmlCuerpo;

    document.querySelector('#pdf-status-flota p').innerHTML = `<span style="font-size: 14px;">Reporte de Status de Flota</span> <br> <span style="font-size: 11px;"><b>Fecha:</b> ${fechaBonita} | <b>Turno:</b> ${textoCorte}</span>`;
    document.getElementById('pdf-sf-fecha-gen').innerText = new Date().toLocaleDateString('es-PE');

    const elemento = document.getElementById('pdf-status-flota');
    document.getElementById('contenedor-pdf-status-flota').style.display = 'block';

    let nombreArchivo = `Status_Flota_${textoCorte.replace(/ /g, '_')}_${fechaRaw}.pdf`;

    html2pdf().set({
        margin: [8, 10, 8, 10],
        filename: nombreArchivo,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(elemento).save().then(() => {
        document.getElementById('contenedor-pdf-status-flota').style.display = 'none';
        if (btn) {
            btn.innerHTML = txtOriginal;
            btn.classList.remove('disabled');
        }
    });
};


// ============================================================
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
        document.getElementById('contenedor-instalar').style.display = 'none';
    }
});

// 3. Ocultar si ya se instaló
window.addEventListener('appinstalled', () => {
    document.getElementById('contenedor-instalar').style.display = 'none';
    console.log('Azkell CRM fue instalado como App nativa');
});

// ==========================================
// 🧑‍✈️ MÓDULO DE CONDUCTORES
// ==========================================
let dataGlobalConductores = [];
let expandCondMap = {};
let expandAllCondState = true;

function toTitleCase(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
}

function toggleGroupRowCond(claseEst) {
    expandCondMap[claseEst] = !expandCondMap[claseEst];
    mostrarConductores(dataGlobalConductores);
}

function toggleAllCondGroups() {
    expandAllCondState = !expandAllCondState;
    for (let key in expandCondMap) expandCondMap[key] = expandAllCondState;
    mostrarConductores(dataGlobalConductores);
}

function mostrarConductores(datos) {
    dataGlobalConductores = datos;
    let html = '';
    let listOpciones = new Set();

    const limpiarN = (txt) => {
        if (!txt) return "";
        return txt.toString().replace(/Ã±/g, 'ñ').replace(/Ã'/g, 'Ñ');
    };

    if (!datos || datos.length === 0) {
        html = '<tr><td colspan="7" class="text-center py-4">No hay conductores registrados.</td></tr>';
    } else {
        let mapEstados = new Map();

        datos.forEach(fila => {
            let estado = fila.estado || "Desconocido";
            if (!mapEstados.has(estado)) mapEstados.set(estado, []);
            mapEstados.get(estado).push(fila);

            if(estado.toLowerCase() === 'activo' && fila.nombre) {
                listOpciones.add(toTitleCase(limpiarN(fila.nombre.toString())));
            }
        });

        mapEstados.forEach((registros, estado) => {
            let claseE = normalizarClase(estado.toString());
            if (expandCondMap[claseE] === undefined) expandCondMap[claseE] = expandAllCondState;
            let isExpandido = expandCondMap[claseE];
            let iconClass = isExpandido ? 'bi bi-chevron-down' : 'bi bi-chevron-right';
            let colorEstado = estado === 'Activo' ? 'text-success' : (estado === 'Cesado' ? 'text-secondary' : 'text-danger');

            html += `<tr class="group-header" style="cursor:pointer;" onclick="toggleGroupRowCond('${claseE}')">
                <td colspan="7" class="text-start" style="padding-left: 20px;">
                    <i class="bi ${iconClass} ms-1 me-2 ${colorEstado}"></i>
                    <i class="bi bi-people-fill ${colorEstado} me-2"></i><span class="text-uppercase fw-bold">${estado}</span>
                    <span class="group-count badge bg-secondary ms-2">${registros.length}</span>
                </td>
            </tr>`;

            if (isExpandido) {
                registros.forEach(f => {
                    let nombreLimpio = limpiarN(f.nombre || "-");
                    let nombre = toTitleCase(nombreLimpio);
                    let empresa = f.empresa ? f.empresa.toString().replace(/TERCERO/gi, '3ro') : "-";
                    let telf = f.telefono ? f.telefono.toString().replace(/[^0-9]/g, '') : "";
                    let dni = f.dni ? f.dni.toString() : "-";
                    let licencia = f.licencia ? f.licencia.toString() : "-";

                    let linkTelf = "-";
                    if (telf.length >= 9) {
                        let wspLink = `https://wa.me/51${telf}`;
                        linkTelf = `
                            <div class="d-flex gap-1">
                                <a href="tel:${telf}" class="btn btn-sm btn-outline-primary p-1 px-2 shadow-sm" title="Llamar" onclick="event.stopPropagation();"><i class="bi bi-telephone-fill"></i></a>
                                <a href="${wspLink}" target="_blank" class="btn btn-sm btn-success p-1 px-2 shadow-sm" title="WhatsApp" onclick="event.stopPropagation();"><i class="bi bi-whatsapp"></i></a>
                                <span class="align-self-center ms-1 fw-bold" style="font-size:0.85rem;">${telf}</span>
                            </div>
                        `;
                    } else if (telf) {
                        linkTelf = `<span class="text-muted">${telf}</span>`;
                    }

                    let bEst = estado === 'Activo' ? '<span class="badge bg-success">Activo</span>' : (estado === 'Cesado' ? '<span class="badge bg-secondary">Cesado</span>' : '<span class="badge bg-danger">Bloqueado</span>');
                    let jsonSeguro = JSON.stringify(f).replace(/'/g, "&#39;");

                    html += `<tr class="clickable-row" onclick='abrirModalConductor(${jsonSeguro})'>
                        <td class="fw-bold" style="color: #1e293b;" data-value="${nombre}"><i class="bi bi-person-circle text-muted me-2"></i> ${nombre}</td>
                        <td class="d-none" data-value="${empresa}">${empresa}</td>
                        <td data-value="${dni}">${dni}</td>
                        <td class="d-none" data-value="${licencia}">${licencia}</td>
                        <td data-value="${telf}">${linkTelf}</td>
                        <td class="d-none" data-value="${estado}">${estado}</td>
                        <td></td>
                    </tr>`;
                });
            }
        });
    }

    document.getElementById('cuerpoTablaConductores').innerHTML = html;
    rellenarDatalist('dl-conductores', listOpciones);
}

function abrirModalConductor(f = null) {
    document.getElementById('formConductor').reset();
    document.getElementById('c_foto_base64').value = "";
    document.getElementById('c_foto_preview').src = "https://via.placeholder.com/120";

    const camposText = ['c_nombre', 'c_empresa', 'c_telefono', 'c_dni', 'c_licencia'];
    const camposSelect = ['c_estado'];

    if (f) {
        document.getElementById('tituloModalConductor').innerHTML = '<i class="bi bi-person-badge"></i> Ficha de Conductor';

        const limpiar = t => t ? t.toString().replace(/Ã±/g, 'ñ').replace(/Ã'/g, 'Ñ') : "";

        document.getElementById('c_id').value = f.idConductor;
        document.getElementById('c_nombre').value = toTitleCase(limpiar(f.nombre));
        document.getElementById('c_empresa').value = f.empresa || "";
        document.getElementById('c_telefono').value = f.telefono || "";
        document.getElementById('c_dni').value = f.dni || "";
        document.getElementById('c_licencia').value = f.licencia || "";
        document.getElementById('c_estado').value = f.estado || "Activo";
        if (f.foto) {
            document.getElementById('c_foto_preview').src = f.foto;
            document.getElementById('c_foto_base64').value = f.foto;
        }

        camposText.forEach(id => document.getElementById(id).readOnly = true);
        camposSelect.forEach(id => document.getElementById(id).disabled = true);
        document.getElementById('c_foto_preview').style.pointerEvents = 'none';

        document.getElementById('btnEditarConductor').style.display = 'inline-block';
        document.getElementById('btnGuardarConductor').style.display = 'none';

    } else {
        document.getElementById('tituloModalConductor').innerHTML = '<i class="bi bi-person-plus-fill"></i> Nuevo Conductor';
        document.getElementById('c_id').value = "";

        camposText.forEach(id => document.getElementById(id).readOnly = false);
        camposSelect.forEach(id => document.getElementById(id).disabled = false);
        document.getElementById('c_foto_preview').style.pointerEvents = 'auto';

        document.getElementById('btnEditarConductor').style.display = 'none';
        document.getElementById('btnGuardarConductor').style.display = 'inline-block';
    }

    new bootstrap.Modal(document.getElementById('modalConductor')).show();
}

function activarEdicionConductor() {
    const camposText = ['c_nombre', 'c_empresa', 'c_telefono', 'c_dni', 'c_licencia'];
    const camposSelect = ['c_estado'];

    camposText.forEach(id => document.getElementById(id).readOnly = false);
    camposSelect.forEach(id => document.getElementById(id).disabled = false);
    document.getElementById('c_foto_preview').style.pointerEvents = 'auto';

    document.getElementById('btnEditarConductor').style.display = 'none';
    document.getElementById('btnGuardarConductor').style.display = 'inline-block';
}

function previsualizarFotoConductor(input) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('c_foto_preview').src = e.target.result;
            document.getElementById('c_foto_base64').value = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function guardarConductor(event, formObj) {
    event.preventDefault();
    const btn = document.getElementById('btnGuardarConductor');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    let datos = {
        idConductor: document.getElementById('c_id').value,
        c_nombre: document.getElementById('c_nombre').value,
        c_empresa: document.getElementById('c_empresa').value,
        c_telefono: document.getElementById('c_telefono').value,
        c_dni: document.getElementById('c_dni').value,
        c_licencia: document.getElementById('c_licencia').value,
        c_estado: document.getElementById('c_estado').value,
        c_foto_base64: document.getElementById('c_foto_base64').value
    };

    fetch('/api/script/guardarConductor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [datos] })
    })
    .then(res => res.json())
    .then(r => {
        if (r.data === 'Éxito') {
            bootstrap.Modal.getInstance(document.getElementById('modalConductor')).hide();
            recargarModulo('conductores');
        } else {
            alert("Error: " + r.data);
        }
        btn.disabled = false;
        btn.innerHTML = 'Guardar Conductor';
    }).catch(e => {
        alert("Error: " + e.message);
        btn.disabled = false;
        btn.innerHTML = 'Guardar Conductor';
    });
}

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
    document.getElementById('spotlight-overlay').style.display = 'flex';
    setTimeout(() => document.getElementById('spotlight-input').focus(), 100);
}

function cerrarSpotlight() {
    document.getElementById('spotlight-overlay').style.display = 'none';
    document.getElementById('spotlight-input').value = '';
    document.getElementById('spotlight-results').innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-keyboard text-secondary" style="font-size: 3rem;"></i><br><small class="mt-2 d-block">Escribe al menos 3 letras para buscar mágicamente en todo el CRM.</small></div>';
}

// Atajos de teclado Pro (Ctrl+K o Cmd+K para abrir, ESC para cerrar)
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); abrirSpotlight();
    }
    if (e.key === 'Escape' && document.getElementById('spotlight-overlay').style.display === 'flex') {
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
    let conductores = CACHE.conductores || dataGlobalConductores || [];

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
                     onclick="cerrarSpotlight(); cambiarModulo('conductores'); setTimeout(() => { document.getElementById('buscadorConductores').value='${dni || nombre}'; filtrarTabla('cuerpoTablaConductores', 'buscadorConductores'); }, 300);">
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
// 📊 DASHBOARD — GRÁFICO FLEETRUN
// ============================================================

window.procesarFleetrunParaDashboard = function() {
    if (!dataGlobalFleetrun || dataGlobalFleetrun.length === 0 || !dataGlobalPlacas || dataGlobalPlacas.length === 0) {
        setTimeout(procesarFleetrunParaDashboard, 500);
        return;
    }

    let cntTotalVig = 0, cntTotalPV = 0, cntTotalVenc = 0;
    let parseFecha = (str) => {
        if(!str) return 0;
        if(str.includes('/')) { let p = str.split('/'); return new Date(p[2], p[1]-1, p[0]).getTime(); }
        return new Date(str).getTime() || 0;
    };

    let mapa = new Map();
    [...dataGlobalFleetrun].sort((a,b) => parseFecha(b[3]) - parseFecha(a[3])).forEach(row => {
        let placa = normalizeStr(row[4]);
        let tipo = normalizeStr(row[8]);
        let key = placa + "_" + tipo;

        let infoPlaca = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placa);
        if (infoPlaca && infoPlaca[18] === 'Activa' && !mapa.has(key)) {
            // Guardamos tanto la fila como la info de la placa
            mapa.set(key, { row: row, infoPlaca: infoPlaca });
        }
    });

    let datosActuales = Array.from(mapa.values());

    datosActuales.forEach((item) => {
        let fila = item.row;
        let infoPlaca = item.infoPlaca;

        let placaRaw = fila[4];
        let km_prox = parseFloat(fila[11]) || 0;

        // 🔥 REGLA DE ORO: Si Placas (19) está vacío, usa el respaldo de Fleetrun (7)
        let utsRaw = (infoPlaca && infoPlaca[19] && String(infoPlaca[19]).trim() !== '') ? infoPlaca[19] : (fila[7] || "-");

        let km_gps = 0;
        let wialonData = buscarWialonPorPlaca(placaRaw);
        if (wialonData) { km_gps = wialonData.km; }

        let falta_km = km_prox - km_gps;

        if (falta_km <= 0) {
            cntTotalVenc++;
        } else if (falta_km > 0 && ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100))) {
            cntTotalPV++;
        } else {
            cntTotalVig++;
        }
    });

    updateGraficoDashFleetrun(cntTotalVig, cntTotalPV, cntTotalVenc);
};

window.initGraficoDashFleetrun = function() {
    let ctx = document.getElementById('chartDashFleetrunStatus');
    if (!ctx) return null;
    Chart.defaults.font.family = 'Inter';

    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Vigentes', 'Por Vencer', 'Vencidos'],
            datasets: [{
                data: [1, 0, 0],
                backgroundColor: ['#16a34a', '#eab308', '#dc2626'],
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            layout: { padding: { left: 10, right: 10, top: 10, bottom: 10 } },
            plugins: {
                legend: { position: 'bottom', labels: { font: { weight: 'bold' } } },
                datalabels: {
                    color: document.body.classList.contains('dark') ? '#ffffff' : '#000000',
                    font: { weight: 'bold', size: 12 },
                    formatter: (value, context) => {
                        let total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        if (total === 0 || value === 0 || context.chart.data.labels[0] === 'Sin Datos') return "";
                        return Math.round((value / total) * 100) + "%";
                    }
                }
            }
        }
    });
};

window.updateGraficoDashFleetrun = function(vigentes, porVencer, vencidos) {
    if(!chartDashFleetrunInst) chartDashFleetrunInst = initGraficoDashFleetrun();
    if(!chartDashFleetrunInst) return;
    let isDark = document.body.classList.contains('dark');
    chartDashFleetrunInst.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1a1a2e';
    chartDashFleetrunInst.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
    chartDashFleetrunInst.options.plugins.datalabels.color = isDark ? '#ffffff' : '#000000';
    if(vigentes + porVencer + vencidos === 0) {
        chartDashFleetrunInst.data.labels = ['Sin Datos'];
        chartDashFleetrunInst.data.datasets[0].data = [1];
        chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#475569'];
    } else {
        chartDashFleetrunInst.data.labels = ['Vigentes', 'Por Vencer', 'Vencidos'];
        chartDashFleetrunInst.data.datasets[0].data = [vigentes, porVencer, vencidos];
        chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#16a34a', '#eab308', '#dc2626'];
    }
    chartDashFleetrunInst.update();
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

window.cargarOrdenesTablero = function() {
    fetch('/api/taller/kanban')
    .then(res => res.json())
    .then(r => {
        if (r.error) return console.error(r.error);
        dataGlobalOrdenes = r.data || [];
        renderizarKanban();
    })
    .catch(e => console.error("Error cargando OTs Kanban:", e));
};

window.cargarTableroStatus = function() {
    fetch('/api/taller/status')
    .then(res => res.json())
    .then(r => {
        if(r.error) return console.error(r.error);
        window.dataGlobalTallerMaster = r.data || [];

        renderizarFiltrosStatus();
        aplicarMultiFiltroStatus(); // 🔥 SE FILTRA AUTOMÁTICAMENTE AL CARGAR
    })
    .catch(e => console.error("Error cargando status:", e));
};

// 🔥 DIBUJANTE DEL MULTI-FILTRO (Dropdown con Checkboxes)
window.renderizarFiltrosStatus = function() {
    const contenedor = document.getElementById('box-filtros-status');
    if(!contenedor) return;

    let html = `
        <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle shadow-sm" type="button" data-bs-toggle="dropdown" aria-expanded="false" data-bs-auto-close="outside">
                <i class="bi bi-funnel"></i> Filtrar Situaciones
            </button>
            <ul class="dropdown-menu shadow-sm p-2 border-0" style="width: 260px; font-size: 0.85rem; max-height: 400px; overflow-y: auto;">
                <li>
                    <div class="form-check border-bottom pb-2 mb-2">
                        <input class="form-check-input" type="checkbox" id="filtroTodasSit" onchange="toggleTodasSituaciones(this)">
                        <label class="form-check-label fw-bold" for="filtroTodasSit">Seleccionar Todas</label>
                    </div>
                </li>
    `;

    // Generar checkboxes: Por defecto, todas chequeadas MENOS "Finalizado"
    catalogosTaller.situaciones.forEach(s => {
        let esFinalizado = s.nombre.toLowerCase().includes('finalizado');
        let checkeado = esFinalizado ? '' : 'checked';

        html += `
                <li>
                    <div class="form-check mb-1">
                        <input class="form-check-input chk-situacion" type="checkbox" value="${s.id}" id="chkSit_${s.id}" ${checkeado} onchange="aplicarMultiFiltroStatus()">
                        <label class="form-check-label text-truncate w-100" for="chkSit_${s.id}">${s.nombre}</label>
                    </div>
                </li>
        `;
    });

    html += `</ul></div>`;
    contenedor.innerHTML = html;
};

// 🔥 MOTOR 1: MARCAR/DESMARCAR TODAS
window.toggleTodasSituaciones = function(cajaMaestra) {
    let checkboxes = document.querySelectorAll('.chk-situacion');
    checkboxes.forEach(chk => chk.checked = cajaMaestra.checked);
    aplicarMultiFiltroStatus();
};

// 🔥 MOTOR 2: APLICAR LOS FILTROS SELECCIONADOS
window.aplicarMultiFiltroStatus = function() {
    // 1. Obtener todos los IDs que están con el "check" puesto
    let checkboxes = document.querySelectorAll('.chk-situacion:checked');
    let idsActivos = Array.from(checkboxes).map(chk => parseInt(chk.value));

    // 2. Controlar la caja maestra "Seleccionar Todas"
    let todasBox = document.getElementById('filtroTodasSit');
    if(todasBox) {
        todasBox.checked = (checkboxes.length === document.querySelectorAll('.chk-situacion').length);
    }

    // 3. Filtrar los datos en memoria y redibujar las tarjetas
    let dataFiltrada = window.dataGlobalTallerMaster.filter(u => idsActivos.includes(u.idSituacion));
    renderizarTableroStatusTaller(dataFiltrada);

    // Limpiamos la barra de búsqueda de texto si se usa el filtro de casillas
    document.getElementById('busquedaTaller').value = '';
};

window.renderizarTableroStatusTaller = function(data) {
    const contenedor = document.getElementById('tableroStatusTaller');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    if (data.length === 0) {
        contenedor.innerHTML = '<div class="text-center py-5 w-100 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2"></i> No hay unidades activas en Taller</div>';
        return;
    }
    data.forEach(unidad => {
        contenedor.innerHTML += `
            <div class="col card-unidad" data-search="${unidad.placa} ${unidad.id_ot || ''}">
                <div class="card h-100 shadow-sm border-0" style="background-color: var(--surface); color: var(--text); border-radius: 10px;">
                    <div class="card-header border-0 bg-transparent p-3 pb-1 d-flex justify-content-between align-items-start">
                        <div>
                            <span class="fs-5 fw-bold text-danger text-uppercase lh-sm d-block">${unidad.placa}</span>
                            <small class="text-muted fw-bold" style="font-size: 0.7rem;"><i class="bi bi-geo-alt"></i> ${unidad.txtRampa || 'Sin Ubicación'}</small>
                        </div>
                        <div class="dropdown">
                            <button class="btn btn-sm btn-light border-0 py-0 px-2 text-muted shadow-none bg-transparent" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                <i class="bi bi-three-dots-vertical"></i>
                            </button>
                            <ul class="dropdown-menu shadow-sm border-0" style="font-size: 0.85rem;">
                                <li><a class="dropdown-item text-danger" href="#" onclick="eliminarStatusTaller('${unidad.ticket_entrada}', '${unidad.placa}')"><i class="bi bi-trash"></i> Eliminar Registro</a></li>
                            </ul>
                        </div>
                    </div>
                    <div class="card-body p-3 pt-1">
                        <div class="fw-bold mb-1" style="font-size: 0.8rem;">OT Master: ${unidad.id_ot || '-'}</div>
                        <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                            <span class="badge bg-secondary shadow-sm" style="font-size: 0.65rem;">${unidad.txtSituacion || '-'}</span>
                            <small class="text-muted fw-bold" style="font-size: 0.7rem;"><i class="bi bi-arrow-right-circle text-danger"></i> ${unidad.fase_ot}</small>
                        </div>
                    </div>
                    <div class="card-footer border-0 bg-transparent p-0 overflow-hidden" style="border-radius: 0 0 10px 10px;">
                        <button class="btn btn-danger w-100 btn-sm rounded-0 fw-bold shadow-none" onclick="abrirExpedienteOTMaster('${unidad.ticket_entrada}')">
                            <i class="bi bi-folder2-open"></i> Ver Expediente
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
};

window.filtrarTableroStatus = function() {
    let texto = document.getElementById('busquedaTaller').value.toLowerCase();
    let tarjetas = document.querySelectorAll('.card-unidad');
    tarjetas.forEach(card => {
        let contenido = card.getAttribute('data-search').toLowerCase();
        card.style.display = contenido.includes(texto) ? 'block' : 'none';
    });
};

window.filtrarStatusPorSituacion = function(idSituacion, btnTarget) {
    let botones = document.getElementById('box-filtros-status').querySelectorAll('button');
    botones.forEach(b => {
        b.classList.remove('btn-dark', 'text-white');
        b.classList.add('btn-outline-secondary');
    });
    btnTarget.classList.remove('btn-outline-secondary');
    btnTarget.classList.add('btn-dark', 'text-white');
    let dataFiltrada = idSituacion === 0
        ? window.dataGlobalTallerMaster
        : window.dataGlobalTallerMaster.filter(u => u.idSituacion == idSituacion);
    renderizarTableroStatusTaller(dataFiltrada);
    document.getElementById('busquedaTaller').value = '';
};

window.abrirExpedienteOTMaster = function(ticket_entrada) {
    dataGlobalOrdenes = window.dataGlobalTallerMaster || [];
    let index = dataGlobalOrdenes.findIndex(ot => ot.ticket_entrada === ticket_entrada);
    if (index !== -1) {
        verDetalleOT(index);
    } else {
        alert("No se pudo cargar el expediente de esta unidad.");
    }
};

window.abrirIngresoUnidad = async function() {
    if (!catalogosTaller || catalogosTaller.rampas.length === 0) {
        try {
            let res = await fetch('/api/catalogos_taller');
            let data = await res.json();
            if (!data.error) catalogosTaller = data;
        } catch(e) { console.error("Error forzando catálogos:", e); }
    }
    let optRampas = catalogosTaller.rampas.map(r => `<option value="${r.id}">${r.nombre}</option>`).join('');
    let optSituaciones = catalogosTaller.situaciones.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    let optPlacas = dataGlobalPlacas ? dataGlobalPlacas.map(p => `<option value="${p[0]}">${p[2]} - ${p[3]}</option>`).join('') : '';

    let html = `
        <div class="alert alert-danger shadow-sm border-0 mb-4" style="background-color: rgba(220, 38, 38, 0.1); color: #dc2626;">
            <i class="bi bi-clipboard-check fw-bold"></i> <strong>RECEPCIÓN DE UNIDAD</strong><br>
            <small>Registra el ingreso a Taller y asigna su ubicación.</small>
        </div>
        <form id="formNuevaOT" onsubmit="guardarNuevaOT(event)">
            <div class="mb-3">
                <label class="form-label small fw-bold text-muted"><i class="bi bi-search"></i> Buscar Placa (Ref)</label>
                <input list="listaPlacasOT" class="form-control text-uppercase shadow-sm" id="otPlaca" placeholder="Escribe para buscar..." autocomplete="off" required>
                <datalist id="listaPlacasOT">${optPlacas}</datalist>
                <small class="text-primary mt-1 d-block" style="cursor: pointer;" onclick="document.getElementById('formPlaca').reset(); new bootstrap.Modal(document.getElementById('modalPlaca')).show();"><i class="bi bi-plus-circle"></i> + Nueva Placa</small>
            </div>
            <div class="row mb-3">
                <div class="col-6">
                    <label class="form-label small fw-bold text-muted"><i class="bi bi-calendar3"></i> Fecha de Ingreso</label>
                    <input type="date" class="form-control shadow-sm" id="otFecha" value="${new Date().toISOString().split('T')[0]}" required style="-webkit-appearance: none; -moz-appearance: none;">
                </div>
                <div class="col-6">
                    <label class="form-label small fw-bold text-muted"><i class="bi bi-clock"></i> Hora</label>
                    <input type="time" class="form-control shadow-sm" id="otHora" value="${new Date().toTimeString().slice(0,5)}" required style="-webkit-appearance: none; -moz-appearance: none;">
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-6">
                    <label class="form-label small fw-bold text-muted"><i class="bi bi-calendar-x text-danger"></i> Salida Estimada</label>
                    <input type="date" class="form-control shadow-sm border-danger" id="otFechaEst">
                </div>
                <div class="col-6">
                    <label class="form-label small fw-bold text-muted"><i class="bi bi-clock-history text-danger"></i> Hora Est.</label>
                    <input type="time" class="form-control shadow-sm border-danger" id="otHoraEst">
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-6">
                    <label class="form-label small fw-bold text-muted"><i class="bi bi-geo-alt"></i> Ubicación / Rampa</label>
                    <select class="form-select shadow-sm" id="otRampa" required>
                        <option value="">Seleccione...</option>
                        ${optRampas}
                    </select>
                </div>
                <div class="col-6">
                    <label class="form-label small fw-bold text-muted"><i class="bi bi-tag"></i> Situación</label>
                    <select class="form-select shadow-sm" id="otSituacion" required>
                        <option value="">Seleccione...</option>
                        ${optSituaciones}
                    </select>
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-6">
                    <label class="form-label small fw-bold text-muted"><i class="bi bi-speedometer"></i> Kilometraje (Opcional)</label>
                    <input type="number" class="form-control shadow-sm" id="otKm">
                </div>
                <div class="col-6">
                    <label class="form-label small fw-bold text-muted"><i class="bi bi-fuel-pump"></i> Combustible</label>
                    <select class="form-select shadow-sm" id="otCombustible">
                        <option value="Reserva">Reserva</option>
                        <option value="1/4">1/4 Tanque</option>
                        <option value="1/2">1/2 Tanque</option>
                        <option value="3/4">3/4 Tanque</option>
                        <option value="Lleno">Lleno</option>
                    </select>
                </div>
            </div>
            <div class="mb-4">
                <label class="form-label small fw-bold text-muted"><i class="bi bi-chat-left-text"></i> Motivo de Ingreso</label>
                <textarea class="form-control shadow-sm" id="otMotivo" rows="3" placeholder="Ej: Mantenimiento preventivo, falla en frenos..." required></textarea>
            </div>
            <button type="submit" class="btn btn-danger w-100 fw-bold shadow-lg py-2">
                <i class="bi bi-play-circle"></i> Generar Ticket de Visita
            </button>
        </form>
    `;
    document.getElementById('detalleOTContenido').innerHTML = html;
    document.getElementById('offcanvasOTLabel').innerHTML = '<i class="bi bi-car-front"></i> Nuevo Ingreso';
    let bsOffcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasOT'));
    if (!bsOffcanvas) bsOffcanvas = new bootstrap.Offcanvas(document.getElementById('offcanvasOT'));
    bsOffcanvas.show();
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

    document.getElementById('detalleOTContenido').innerHTML = html;
    document.getElementById('offcanvasOTLabel').innerHTML = `Expediente de Unidad`;

    let bsOffcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasOT'));
    if (!bsOffcanvas) bsOffcanvas = new bootstrap.Offcanvas(document.getElementById('offcanvasOT'));
    bsOffcanvas.show();

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
    document.getElementById(`box-ubicacion-${ticket}`).innerHTML = html;
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
    document.getElementById('otTotalCalculado').innerText = "$ " + total.toFixed(2);
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

// WIDGET DE RAMPAS EN VIVO (DASHBOARD)
// 🔥 WIDGET DEL DASHBOARD (BLINDADO)
window.cargarDashRampas = async function() {
    let tbody = document.getElementById('tbDashRampas');
    if(!tbody) return;

    try {
        // Aseguramos que los catálogos existan
        if (!catalogosTaller || !catalogosTaller.rampas || catalogosTaller.rampas.length === 0) {
            let resCat = await fetch('/api/catalogos_taller');
            let dataCat = await resCat.json();
            if (!dataCat.error) catalogosTaller = dataCat;
        }

        let res = await fetch('/api/taller/status');
        let r = await res.json();

        if(r.error) throw new Error(r.error);

        let html = '';
        catalogosTaller.rampas.forEach(rampa => {
            let unidad = r.data.find(u => u.id_rampa == rampa.id && u.txtSituacion.toLowerCase() !== 'finalizado');
            if(unidad) {
                let detalles = {};
                try { detalles = JSON.parse(unidad.detalles_json || '{}'); } catch(e){}

                // Leemos la columna correcta
                let salidaStr = unidad.fecha_hora_salida ? new Date(unidad.fecha_hora_salida).toLocaleString('es-PE', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : '-';

                html += `
                    <tr>
                        <td class="fw-bold text-danger border-end">${rampa.nombre}</td>
                        <td><span class="badge bg-primary fs-6 shadow-sm">${unidad.placa}</span></td>
                        <td><span class="badge bg-secondary">${unidad.txtSituacion || '-'}</span></td>
                        <td class="text-muted"><i class="bi bi-clock"></i> ${new Date(unidad.fecha_ingreso).toLocaleString('es-PE', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</td>
                        <td class="text-danger fw-bold" style="font-size: 0.8rem;"><i class="bi bi-calendar-x"></i> ${salidaStr}</td>
                        <td class="text-truncate" style="max-width: 150px;" title="${detalles.motivo || ''}">${detalles.motivo || '-'}</td>
                    </tr>`;
            } else {
                html += `
                    <tr>
                        <td class="fw-bold text-muted border-end">${rampa.nombre}</td>
                        <td colspan="5" class="text-muted fst-italic bg-light">Libre</td>
                    </tr>`;
            }
        });
        tbody.innerHTML = html;
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Error cargando rampas: ${error.message}</td></tr>`;
    }
};

// ============================================================
// GESTOR DE PERSISTENCIA (ANTI-RECARGA INFALIBLE)
// ============================================================
setTimeout(() => {
    const moduloGuardado = localStorage.getItem('ultimoModuloCRM');
    if (moduloGuardado && moduloGuardado !== 'dash' && moduloGuardado !== 'dashboard') {
        let btnMenu = document.querySelector(`[onclick*="cambiarModulo('${moduloGuardado}'"]`);
        if (btnMenu) {
            cambiarModulo(moduloGuardado, btnMenu);
        } else {
            document.querySelectorAll('.modulo-wrapper').forEach(m => m.style.display = 'none');
            let mod = document.getElementById(moduloGuardado === 'ordenes' ? 'moduloOrdenes' : moduloGuardado === 'status' ? 'moduloStatusTaller' : 'modulo' + moduloGuardado.charAt(0).toUpperCase() + moduloGuardado.slice(1));
            if (mod) mod.style.display = 'block';
        }
    }
}, 300);

window.eliminarStatusTaller = function(ticket, placa) {
    if (!confirm(`¿Estás seguro de ELIMINAR el ingreso de la unidad ${placa}?\nSe borrarán también todas las Órdenes de Trabajo atadas a esta visita.\n\nEsta acción no se puede deshacer.`)) return;

    fetch(`/api/taller/status/${ticket}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(r => {
        if (r.error) throw new Error(r.error);
        cargarTableroStatus();
        if (window.cargarDashRampas) cargarDashRampas();
    })
    .catch(e => alert("Error eliminando: " + e.message));
};

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
