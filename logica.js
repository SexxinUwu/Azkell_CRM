
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
const CACHE = { placas: null, fleetrun: null, usuarios: null, seguridad: null, auditoria: null, statusMant: null, statusFlota: null, wialon: null, conductores: null };
const CACHE_TIME = {};

let dataGlobalPlacas  = []; let dataGlobalFleetrun = []; let dataGlobalInspecciones = [];
let dataGlobalSeguridad = []; let dataGlobalUsuarios = []; let dataGlobalAuditoria = []; let dataGlobalStatusFlota = [];
let dataTiposMant     = []; let isHistorialFleetrun = false; let expandAllState = false; let expandAllSFState = false; 

let isHistorialStatus = false; let expandStatusMap = {}; let expandAllStatusState = false; let expandSFMap = {};
let chartTotalInst = null, chartMotorasInst = null, chartNoMotorasInst = null; 
Chart.register(ChartDataLabels); 

let currentTab = 0; let canvasFirma; let ctxFirma; let dibujando = false;

document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.getElementById('theme-toggle'); const body = document.body; const saved = localStorage.getItem('theme');
  if (saved === 'dark') applyDark(true, false);
  if (toggle) toggle.addEventListener('change', () => applyDark(toggle.checked, true));
  function applyDark(isDark, save) {
    if (toggle) toggle.checked = isDark; body.classList.toggle('dark', isDark); document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
    if (save) localStorage.setItem('theme', isDark ? 'dark' : 'light');
    initTooltips();
    actualizarColoresGraficos();
  }
  verificarSesionGuardada();
  document.body.addEventListener('mousemove', registrarActividad); document.body.addEventListener('keypress', registrarActividad); document.body.addEventListener('click', registrarActividad);
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
function parseDateToDDMMYYYY(dateStr) { if(!dateStr) return "-"; if(dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dateStr; let d = new Date(dateStr); if(isNaN(d.getTime())) return dateStr; let day = d.getDate().toString().padStart(2, '0'); let month = (d.getMonth() + 1).toString().padStart(2, '0'); let year = d.getFullYear(); return `${day}/${month}/${year}`; }
function normalizeStr(str) { return str ? str.toString().trim().toUpperCase() : ""; }

// =======================================================
// 🛡️ NÚCLEO DE SEGURIDAD Y ENRUTAMIENTO RBAC
// =======================================================

function verificarSesionGuardada() {
    const guardadoUser = localStorage.getItem('crm_user');
    const guardadoTime = localStorage.getItem('crm_ultimo_acceso');
    const guardadoCorreo = localStorage.getItem('crm_correo');
    const guardadoPermisos = localStorage.getItem('crm_permisos');
    const guardadoRol = localStorage.getItem('crm_rol');

    if (guardadoUser && guardadoTime && Date.now() - parseInt(guardadoTime) < TIEMPO_INACTIVIDAD) {
        usuarioLogueado = guardadoUser;
        rolLogueado = guardadoRol && guardadoRol !== 'null' ? guardadoRol : 'Personalizado';
        registrarActividad();

        try {
            let parsed = JSON.parse(guardadoPermisos || '{}');
            if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            permisosUsuario = parsed;
        } catch(e) { permisosUsuario = {}; }

        document.getElementById('nombre-usuario-top').innerText = usuarioLogueado;
        document.getElementById('perfil-nombre').innerText = usuarioLogueado;
        if (guardadoCorreo) document.getElementById('perfil-correo').innerText = guardadoCorreo;
        let inputInsp = document.getElementById('input-inspector-nuevo'); if(inputInsp) inputInsp.value = usuarioLogueado;

        let p = permisosUsuario || {};
        // 👑 ESCUDO DEFINITIVO: Si eres admin@azkell.com, eres Dios, sin importar la memoria
        let isAdm = p.admin === true || (guardadoCorreo && guardadoCorreo.toLowerCase() === 'admin@azkell.com');

        let rolHtml = (guardadoCorreo && guardadoCorreo.toLowerCase() === 'admin@azkell.com') ? '<span class="badge bg-dark text-warning shadow-sm"><i class="bi bi-star-fill"></i> Fundador</span>'
                    : (isAdm ? '<span class="badge bg-warning text-dark shadow-sm"><i class="bi bi-star-fill"></i> Administrador</span>'
                    : `<span class="badge bg-primary shadow-sm"><i class="bi bi-person-gear"></i> ${rolLogueado}</span>`);

        let topBadge = document.getElementById('badge-rol-top'); if(topBadge) topBadge.innerHTML = rolHtml;
        let perfilBadge = document.getElementById('perfil-rol-badge'); if(perfilBadge) perfilBadge.innerHTML = rolHtml;

        // 🧹 Ocultar Menús Base
        const nMant = document.getElementById('wrap-mantenimiento'); const nAlm = document.getElementById('wrap-almacen'); const nFlo = document.getElementById('wrap-flota'); const nUsu = document.getElementById('wrap-usuarios'); const nAud = document.getElementById('wrap-auditoria');
        const cMant = document.getElementById('menuMantenimiento'); const cAlm = document.getElementById('menuAlmacen'); const cFlo = document.getElementById('menuFlota');
        [nMant, nAlm, nFlo, nUsu, nAud].forEach(el => { if (el) el.style.display = 'none'; });
        [cMant, cAlm, cFlo].forEach(el => { if (!el) return; el.classList.remove('show'); el.style.display = 'none'; });

        // 🧠 APERTURA INTELIGENTE: Muestra el módulo pero lo mantiene CERRADO
        let showMant = isAdm || p.mod_mant || p.insp?.l || p.placas?.l || p.fleet?.l;
        let showAlm = isAdm || p.mod_alm || p.placas?.l;
        let showFlota = isAdm || p.mod_flota || p.gps?.l || p.status?.l || p.seg?.l || p.cond?.l;

        // 👁️ Renderizar Sidebar según Matriz
        const mStatus = document.getElementById('btnMenuStatusMant'); const mPlacas = document.getElementById('btnMenuPlacasMant'); const mFleet = document.getElementById('btnMenuFleetrun');
        const aPlacas = document.getElementById('btnMenuPlacasAlmacen');
        const fGps = document.getElementById('btnMenuUbicacion'); const fStatus = document.getElementById('btnMenuStatusFlota'); const fSeg = document.getElementById('btnMenuSeguridad'); const fCond = document.getElementById('btnMenuConductores');

        // 👉 EL CAMBIO: Ya no le inyectamos la clase "show" para que arranquen cerrados
        if (showMant) { if(nMant) nMant.style.display = 'block'; if(cMant) cMant.style.removeProperty('display'); }
        if (mStatus) mStatus.style.display = (isAdm || p.insp?.l) ? 'block' : 'none';
        if (mPlacas) mPlacas.style.display = (isAdm || p.placas?.l) ? 'block' : 'none';
        if (mFleet) mFleet.style.display = (isAdm || p.fleet?.l) ? 'block' : 'none';

        if (showAlm) { if(nAlm) nAlm.style.display = 'block'; if(cAlm) cAlm.style.removeProperty('display'); }
        if (aPlacas) aPlacas.style.display = (isAdm || p.placas?.l) ? 'block' : 'none';

        if (showFlota) { if(nFlo) nFlo.style.display = 'block'; if(cFlo) cFlo.style.removeProperty('display'); }
        if (fGps) fGps.style.display = (isAdm || p.gps?.l) ? 'block' : 'none';
        if (fStatus) fStatus.style.display = (isAdm || p.status?.l) ? 'block' : 'none';
        if (fSeg) fSeg.style.display = (isAdm || p.seg?.l) ? 'block' : 'none';
        if (fCond) fCond.style.display = (isAdm || p.cond?.l) ? 'block' : 'none';

        if (isAdm) { if(nUsu) nUsu.style.display = 'block'; }
        if (isAdm || p.mod_auditoria) { if(nAud) nAud.style.display = 'block'; }

        document.getElementById('pantalla-login').style.display = 'none';
        document.getElementById('app-crm').style.display = 'flex';

        // 🚀 Redirección Automática
        if (isAdm || p.insp?.l) cambiarModulo('statusMant', 'btnMenuStatusMant');
        else if (p.status?.l) cambiarModulo('statusFlota', 'btnMenuStatusFlota');
        else if (p.placas?.l) cambiarModulo('placas', 'btnMenuPlacasMant');
        else if (p.fleet?.l) cambiarModulo('fleetrun', 'btnMenuFleetrun');
        else if (p.gps?.l) cambiarModulo('ubicacion', 'btnMenuUbicacion');
        else {
            document.getElementById('tituloTopBar').innerText = "Acceso Restringido";
            document.querySelectorAll('.modulo-wrapper').forEach(m => m.style.display = 'none');
            let modStatus = document.getElementById('moduloStatus');
            if(modStatus) {
                modStatus.style.display = 'flex';
                document.getElementById('cuerpoTablaStatus').innerHTML = '<tr><td colspan="10" class="text-center py-5"><i class="bi bi-shield-lock-fill text-warning" style="font-size:4rem;"></i><br><h4 class="mt-3 text-dark fw-bold">Cuenta Restringida</h4><p class="text-muted">No tienes módulos asignados. Contacta al administrador.</p></td></tr>';
                let pGraficos = document.getElementById('panelGraficosStatus'); if(pGraficos) pGraficos.style.display = 'none';
            }
        }

        google.script.run.withSuccessHandler(d => {
            dataGlobalPlacas = d; CACHE['placas'] = d; CACHE_TIME['placas'] = Date.now();
            let placasSet = new Set(); d.forEach(r => { if(r[0] && r[0]!=="Placa" && r[0]!=="PLACA") placasSet.add(r[0]) });
            rellenarDatalist('dl-placas', placasSet); recargarWialon();
        }).obtenerDatosPlacas();

        google.script.run.withSuccessHandler(d => {
            dataTiposMant = d;
        }).obtenerTiposMantenimiento();

        google.script.run.withSuccessHandler(tipos => {
            let tpMpSet = new Set(tipos);
            rellenarDatalist('dl-tpmp', tpMpSet);
        }).obtenerTPMP();

        return;
    }
    document.getElementById('app-crm').style.display = 'none'; document.getElementById('pantalla-login').style.display = 'flex';
}

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

async function iniciarSesion(event, formObj) {
    event.preventDefault(); 
    const btn = document.getElementById('btn-login'); 
    const msg = document.getElementById('mensaje-login');
    btn.disabled = true; 
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verificando...'; 
    msg.style.display = 'none';

    try {
        // Hacemos la llamada HTTP a nuestro propio servidor Node.js
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo: formObj.correo.value, password: formObj.password.value })
        });
        
        const respuesta = await response.json();

        if (respuesta.exito) {
            localStorage.setItem('crm_user', respuesta.nombre);
            localStorage.setItem('crm_rol', respuesta.rol);
            localStorage.setItem('crm_correo', formObj.correo.value);
            localStorage.setItem('crm_permisos', respuesta.permisos || '{}');
            localStorage.setItem('crm_ultimo_acceso', Date.now());
            formObj.reset();
            btn.disabled = false;
            btn.innerHTML = 'Ingresar al Sistema';
            verificarSesionGuardada(); 
        } else { 
            msg.innerText = respuesta.mensaje; 
            msg.style.display = 'block'; 
            btn.disabled = false; 
            btn.innerHTML = 'Ingresar al Sistema'; 
        }
    } catch(error) {
        msg.innerText = 'Error de red: El servidor local no está encendido.'; 
        msg.style.display = 'block'; 
        btn.disabled = false; 
        btn.innerHTML = 'Ingresar al Sistema'; 
    }
}

function cerrarSesion() {
    localStorage.removeItem('crm_user'); localStorage.removeItem('crm_rol'); localStorage.removeItem('crm_correo'); localStorage.removeItem('crm_ultimo_acceso'); localStorage.removeItem('crm_permisos');
    usuarioLogueado = ''; rolLogueado = ''; permisosUsuario = {};

    // 🧹 Limpieza Total de Pantalla (Evita que el siguiente usuario vea pantallas que no debe)
    ['menuMantenimiento', 'menuAlmacen', 'menuFlota'].forEach(id => { const el = document.getElementById(id); if (!el) return; el.classList.remove('show'); el.style.display = 'none'; const inst = bootstrap.Collapse.getInstance(el); if (inst) inst.dispose(); });
    document.querySelectorAll('.modulo-wrapper').forEach(m => m.style.display = 'none');

    document.getElementById('app-crm').style.display = 'none'; document.getElementById('pantalla-login').style.display = 'flex';
}

function aplicarPermisosBotonesUI() {
    let p = permisosUsuario || {};
    let correoActual = (localStorage.getItem('crm_correo') || '').toLowerCase();
    let isAdm = p.admin === true || correoActual === 'admin@azkell.com';

    const check = (selector, permiso) => {
        // Aplicamos a TODOS los botones que coincidan (para asegurar que se borre bien)
        document.querySelectorAll(selector).forEach(btn => {
            btn.style.display = (isAdm || permiso === true) ? 'inline-block' : 'none';
        });
    };

    check('button[onclick="abrirModalNuevaInspeccion()"]', p.insp?.c);
    check('#btnNuevaPlaca', p.placas?.c);
    check('#btnNuevoFleetrun', p.fleet?.c);
    check('button[onclick="abrirModalNuevoStatusFlota()"]', p.status?.c);
    check('#btnNuevoReporteSeguridad', p.seg?.c);
    check('button[onclick="abrirModalConductor()"]', p.cond?.c);
    check('button[onclick="abrirModalGestorUsuario()"]', false); // Oculto directo, se abre desde tabla
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
            if (document.getElementById('moduloStatus').style.display === 'flex') mostrarStatusInspecciones(dataGlobalInspecciones);
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
      seguridad:   { id: 'cuerpoTabla', cols: 6 },
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
    seguridad: () => cargarModulo('seguridad', mostrarDatosSeguridad, 'obtenerDatosSeguridad'),
    auditoria: () => cargarModulo('auditoria', mostrarAuditoria, 'obtenerDatosAuditoria'),
    statusMant: () => cargarModulo('statusMant', mostrarStatusInspecciones, 'obtenerDatosInspecciones'),
    conductores: () => cargarModulo('conductores', mostrarConductores, 'obtenerDatosConductores'),
    statusFlota: () => cargarModulo('statusFlota', mostrarStatusFlota, 'obtenerDatosStatusFlota')
  };
  if (acciones[nombre]) acciones[nombre]();
}


const PERMISOS_MODULO = { 'placas': ['Administrador', 'Inspector', 'Mantenimiento'], 'almacenPlacas': ['Administrador', 'Inspector', 'Almacén', 'Almacen'], 'seguridad': ['Administrador', 'Inspector', 'Flota'], 'statusMant': ['Administrador', 'Inspector', 'Mantenimiento'], 'statusFlota': ['Administrador', 'Inspector', 'Flota'], 'fleetrun': ['Administrador', 'Inspector', 'Mantenimiento'], 'usuarios': ['Administrador', 'Inspector'], 'auditoria': ['Administrador'], 'ubicacion': ['Administrador', 'Flota', 'Inspector', 'Mantenimiento'], 'conductores': ['Administrador', 'Inspector', 'Flota'] };

function cambiarModulo(modulo, idBoton) {
    let bloqueado = false;
    let p = permisosUsuario || {};
    let correoActual = (localStorage.getItem('crm_correo') || '').toLowerCase();
    let isAdm = p.admin === true || correoActual === 'admin@azkell.com';

    // Muro de Contención Estricto
    if (modulo === 'statusMant' && !isAdm && !p.insp?.l) bloqueado = true;
    if ((modulo === 'placas' || modulo === 'almacenPlacas') && !isAdm && !p.placas?.l) bloqueado = true;
    if (modulo === 'fleetrun' && !isAdm && !p.fleet?.l) bloqueado = true;
    if (modulo === 'ubicacion' && !isAdm && !p.gps?.l) bloqueado = true;
    if (modulo === 'statusFlota' && !isAdm && !p.status?.l) bloqueado = true;
    if (modulo === 'seguridad' && !isAdm && !p.seg?.l) bloqueado = true;
    if (modulo === 'conductores' && !isAdm && !p.cond?.l) bloqueado = true;
    if (modulo === 'usuarios' && !isAdm) bloqueado = true;
    if (modulo === 'auditoria' && !isAdm && !p.mod_auditoria) bloqueado = true;

    if (bloqueado) return;

    document.querySelectorAll('.modulo-wrapper').forEach(m => { m.style.display = 'none'; });
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    if (idBoton) { const btnActivo = document.getElementById(idBoton); if (btnActivo) btnActivo.classList.add('active'); }
    const titulo = document.getElementById('tituloTopBar');

    if (modulo === 'seguridad') { let el=document.getElementById('moduloSeguridad'); if(el) el.style.display = 'flex'; titulo.innerText = 'Seguridad - Flota'; cargarModulo('seguridad', mostrarDatosSeguridad, 'obtenerDatosSeguridad'); }
    else if (modulo === 'usuarios') { let el=document.getElementById('moduloUsuarios'); if(el) el.style.display = 'flex'; titulo.innerText = 'Gestión de Usuarios'; cargarModulo('usuarios', mostrarUsuarios, 'obtenerDatosUsuarios'); }
    else if (modulo === 'auditoria') { let el=document.getElementById('moduloAuditoria'); if(el) el.style.display = 'flex'; titulo.innerText = 'Control y Auditoría'; cargarModulo('auditoria', mostrarAuditoria, 'obtenerDatosAuditoria'); }
    else if (modulo === 'placas' || modulo === 'almacenPlacas') { let el=document.getElementById('moduloPlacas'); if(el) el.style.display = 'flex'; titulo.innerText = (modulo === 'placas') ? 'Gestión de Placas' : 'Inventario de Placas'; cargarModulo('placas', mostrarPlacas, 'obtenerDatosPlacas'); }
    else if (modulo === 'fleetrun') { let el=document.getElementById('moduloFleetrun'); if(el) el.style.display = 'flex'; titulo.innerText = 'Sistema Fleetrun'; cargarModulo('fleetrun', mostrarFleetrun, 'obtenerDatosFleetrun'); }
    else if (modulo === 'statusMant') { let el=document.getElementById('moduloStatus'); if(el) el.style.display = 'flex'; titulo.innerText = 'Análisis de Inspecciones'; cargarModulo('statusMant', mostrarStatusInspecciones, 'obtenerDatosInspecciones'); }
    else if (modulo === 'statusFlota') { let el=document.getElementById('moduloStatusFlota'); if(el) el.style.display = 'flex'; titulo.innerText = 'Status de Flota'; cargarModulo('statusFlota', mostrarStatusFlota, 'obtenerDatosStatusFlota'); }
    else if (modulo === 'ubicacion') { let el=document.getElementById('moduloUbicacion'); if(el) el.style.display = 'flex'; titulo.innerText = 'Ubicación GPS Flota'; recargarWialon(true); }
    else if (modulo === 'conductores') { let el=document.getElementById('moduloConductores'); if(el) el.style.display = 'flex'; titulo.innerText = 'Directorio de Conductores'; cargarModulo('conductores', mostrarConductores, 'obtenerDatosConductores'); }

    if (window.innerWidth <= 768) closeSidebar();
    aplicarPermisosBotonesUI();
}
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

// ==========================================
// 🔥 MÓDULO ANÁLISIS DE INSPECCIONES (STATUS) 🔥
// ==========================================
function toggleGraficosStatus() { let panel = document.getElementById('panelGraficosStatus'); let btn = document.getElementById('btnToggleGraficos'); if(panel.style.display === 'none') { panel.style.display = 'flex'; btn.innerHTML = '<i class="bi bi-eye-slash-fill"></i> Ocultar Gráficos'; } else { panel.style.display = 'none'; btn.innerHTML = '<i class="bi bi-eye-fill"></i> Mostrar Gráficos'; } }
function toggleVistaStatus() { isHistorialStatus = !isHistorialStatus; let textBtn = document.getElementById('text-toggle-status'); if(textBtn) { textBtn.innerText = isHistorialStatus ? "Ver Últimos Registros" : "Ver Historial"; } expandAllStatusState = false; expandStatusMap = {}; mostrarStatusInspecciones(dataGlobalInspecciones); }
function toggleGroupRowStatus(classTipo) { expandStatusMap[classTipo] = !expandStatusMap[classTipo]; filtrarStatusAvanzado(); }
function toggleAllStatusGroups() { expandAllStatusState = !expandAllStatusState; for(let key in expandStatusMap) { expandStatusMap[key] = expandAllStatusState; } const headers = document.querySelectorAll('#cuerpoTablaStatus tr.group-header'); headers.forEach(header => { let matchIcon = header.querySelector('i').className.match(/toggle-icon-(\w+)/); if(matchIcon) expandStatusMap[matchIcon[1]] = expandAllStatusState; }); filtrarStatusAvanzado(); }

function mostrarStatusInspecciones(inspecciones) {
  if (procesadorErroresCuota(inspecciones, 'cuerpoTablaStatus')) return;
  dataGlobalInspecciones = inspecciones; let hoy = new Date(); hoy.setHours(0,0,0,0);
  let inspeccionesOrdenadas = [...inspecciones].sort((a,b) => new Date(b.fecha_ingreso) - new Date(a.fecha_ingreso));
  let dataFinal = [];

  let placasActivasEnUso = dataGlobalPlacas.filter(p => normalizeStr(p[8]) === "ACTIVA" && normalizeStr(p[13]) === "SI");

  if (!isHistorialStatus) {
      placasActivasEnUso.forEach(p => { let placaStr = normalizeStr(p[0]); let insp = inspeccionesOrdenadas.find(i => normalizeStr(i.placa) === placaStr); dataFinal.push({ infoPlaca: p, insp: insp }); });
  } else {
      inspeccionesOrdenadas.forEach(insp => { let placaStr = normalizeStr(insp.placa); let p = dataGlobalPlacas.find(pl => normalizeStr(pl[0]) === placaStr) || [insp.placa, "-","-","-","-","-","-","-","-","-","-","-","-","-"]; dataFinal.push({ infoPlaca: p, insp: insp }); });
  }

  let mapTipos = new Map(); let setClis = new Set(), setMarcas = new Set(), setEstadosStatus = new Set();
  dataFinal.forEach(item => {
      let tipoRaw = item.infoPlaca[2] ? item.infoPlaca[2].trim().toUpperCase() : "SIN TIPO";
      let tipoDisplay = tipoRaw === "SIN TIPO" ? "SIN TIPO" : tipoRaw.charAt(0).toUpperCase() + tipoRaw.slice(1).toLowerCase();
      if(!mapTipos.has(tipoDisplay)) mapTipos.set(tipoDisplay, []); mapTipos.get(tipoDisplay).push(item);
  });

  let html = '';
  if(dataFinal.length === 0) { html = '<tr><td colspan="10" class="text-center py-4">No hay datos para analizar.</td></tr>'; } 
  else {
      mapTipos.forEach((registros, tipoDisplay) => {
          let classTipo = normalizarClase(tipoDisplay);
          if (expandStatusMap[classTipo] === undefined) expandStatusMap[classTipo] = false;

          html += `<tr class="group-header data-row-status" style="cursor:pointer;" onclick="toggleGroupRowStatus('${classTipo}')">
              <td colspan="10" class="fw-bold text-start" style="background-color: rgba(128,128,128,0.1) !important; color: var(--text) !important;">
                  <i class="bi bi-chevron-right ms-1 me-2 text-warning toggle-icon-${classTipo}"></i> 
                  <span style="display:inline-block; min-width:80px;"><i class="bi bi-tag text-secondary"></i> <span class="text-uppercase">${tipoDisplay}</span></span>
                  <span class="badge bg-warning text-dark float-end span-conteo-${classTipo}">${registros.length} Unidades</span>
              </td></tr>`;

          registros.forEach((item) => {
              let p = item.infoPlaca; let insp = item.insp; let placa = p[0]; let cli = p[1] || "-"; let mod = p[3] || "-"; let mar = p[4] || "-"; let motora = p[11] || "-";
              if(cli !== "-") setClis.add(cli); if(mar !== "-") setMarcas.add(mar);

              let fIngresoBonita = "-"; let diasRestantes = -9999; let tecnico = "-"; let colorFalta = ""; let txtEstado = ""; let estadoVigente2 = "";

              if(insp && insp.fecha_ingreso) {
                  fIngresoBonita = parseDateToDDMMYYYY(insp.fecha_ingreso); tecnico = insp.tecnico;
                  // 1. Convertimos la fecha robustamente (soporta "YYYY-MM-DD" o "DD/MM/YYYY")
                  let fIngreso;
                  if (insp.fecha_ingreso.includes('/')) {
                      let p = insp.fecha_ingreso.split('/'); fIngreso = new Date(p[2], p[1]-1, p[0]);
                  } else {
                      fIngreso = new Date(insp.fecha_ingreso + "T00:00:00");
                  }

                  // 2. Sumamos los días propuestos
                  let dProp = parseInt(insp.dias_propuestos) || 30;
                  let fProx = new Date(fIngreso.getTime()); fProx.setDate(fProx.getDate() + dProp);

                  // 3. Calculamos la diferencia
                  diasRestantes = Math.ceil((fProx - hoy) / (1000 * 60 * 60 * 24));
              }

              let textoBadgeProx = "";
              if (diasRestantes < 0) {
                  colorFalta = "#dc2626"; txtEstado = "NO VIGENTE"; estadoVigente2 = "NO VIGENTE";
                  textoBadgeProx = `Vencido hace ${Math.abs(diasRestantes)} días`;
              } else if (diasRestantes >= 0 && diasRestantes <= 7) {
                  colorFalta = "#eab308"; txtEstado = "PRÓXIMO A VENCER"; estadoVigente2 = "PRÓXIMO A VENCER";
                  textoBadgeProx = `Faltan ${diasRestantes} días`;
              } else {
                  colorFalta = "#16a34a"; txtEstado = "VIGENTE"; estadoVigente2 = "VIGENTE";
                  textoBadgeProx = `Faltan ${diasRestantes} días`;
              }
              if(estadoVigente2 !== "") setEstadosStatus.add(estadoVigente2);

              let badgeProx = diasRestantes === -9999 ? `<span class="badge bg-danger shadow-sm">Sin Registro</span>` : `<span class="badge p-1 px-2 shadow-sm text-white" style="background-color: ${colorFalta};">${textoBadgeProx}</span>`;
              let badgeEst = `<span style="color: ${colorFalta}; font-weight: bold; font-size: 0.8rem;">${txtEstado}</span>`;
              let subCli = `<br><span class="text-muted" style="font-size: 0.75rem;">${cli}</span>`;
              
              // 🔥 WIALON GPS INYECCIÓN EN TABLA INSPECCIONES 🔥
              let ubicacionHtml = '<span class="text-muted" style="font-size: 0.8rem;"><i class="bi bi-geo-alt-fill"></i> N/A</span>';
              let wialonData = buscarWialonPorPlaca(placa);
              if (wialonData && wialonData.lat !== 0) {
                  ubicacionHtml = `
                  <div class="text-start">
                      <button class="badge bg-primary text-white shadow-sm mb-1 border-0" onclick="abrirMapaFlotante('${placa}', ${wialonData.lat}, ${wialonData.lng})"><i class="bi bi-map-fill"></i> Mapa</button>
                      <button class="badge bg-secondary text-white shadow-sm mb-1 border-0" onclick="obtenerDireccion(${wialonData.lat}, ${wialonData.lng}, this)"><i class="bi bi-signpost-2"></i> Calle</button><br>
                      <span style="font-size: 0.75rem; color: var(--text); font-weight: bold;"><i class="bi bi-speedometer"></i> ${wialonData.km.toLocaleString()} km</span>
                  </div>`;
              }

              let menuAcciones = '';
              if (insp && insp.id) {
                  let items = `<li><a class="dropdown-item fw-bold" href="#" onclick="verDetalleInspeccion('${insp.id}', false)"><i class="bi bi-eye text-primary"></i> Ver Resumen</a></li>`;
                  items += `<li><a class="dropdown-item fw-bold" href="#" onclick="verDetalleInspeccion('${insp.id}', true)"><i class="bi bi-file-pdf text-danger"></i> Exportar a PDF</a></li>`;
                  items += `<li><hr class="dropdown-divider"></li>`;
                  items += `<li><a class="dropdown-item" href="#" onclick="abrirModalEditarInspeccion('${insp.id}')"><i class="bi bi-pencil text-warning"></i> Editar / Re-Firmar</a></li>`;
                  items += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${insp.id}', 'Inspecciones')"><i class="bi bi-trash"></i> Eliminar Definitivo</a></li>`;
                  menuAcciones = `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${items}</ul></div>`;
              } else { menuAcciones = '<span class="text-muted"><i class="bi bi-dash"></i></span>'; }

              html += `<tr class="child-st-${classTipo} clickable-row data-row-status child-row-status" style="display:none;" data-cliente="${cli}" data-marca="${mar}" data-estado-v2="${estadoVigente2}" data-motor="${motora}" data-dias="${diasRestantes}">
              <td class="fw-bold text-primary" data-value="${placa}">${placa} ${subCli}</td><td class="d-none" data-value="${cli}">${cli}</td><td>${mod}</td>
              <td class="text-truncate" style="max-width: 100px;">${tecnico}</td><td>${fIngresoBonita}</td><td data-value="${diasRestantes}">${badgeProx}</td>
              <td data-value="${txtEstado}">${badgeEst}</td><td class="d-none" data-value="${estadoVigente2}">${estadoVigente2}</td>
              <td>${ubicacionHtml}</td><td>${menuAcciones}</td></tr>`;
          });
      });
      rellenarFiltroCheck('filtroStatusCliente', setClis, 'filtrarStatusAvanzado'); rellenarFiltroCheck('filtroStatusMarca', setMarcas, 'filtrarStatusAvanzado'); rellenarFiltroCheck('filtroStatusEstado', setEstadosStatus, 'filtrarStatusAvanzado');
  }
  document.getElementById('cuerpoTablaStatus').innerHTML = html;
  filtrarStatusAvanzado(); 
}

function filtrarStatusAvanzado() {
  const txt = document.getElementById('buscadorStatus')?.value.toLowerCase() || '';
  const chkCli = Array.from(document.querySelectorAll('#filtroStatusCliente input:checked')).map(e=>e.value);
  const chkMar = Array.from(document.querySelectorAll('#filtroStatusMarca input:checked')).map(e=>e.value);
  const chkEst = Array.from(document.querySelectorAll('#filtroStatusEstado input:checked')).map(e=>e.value);
  let isFiltering = txt !== '' || chkCli.length > 0 || chkMar.length > 0 || chkEst.length > 0;

  let cntTotalVig = 0, cntTotalNoVig = 0; let cntMotVig = 0, cntMotNoVig = 0; let cntNoMotVig = 0, cntNoMotNoVig = 0;

  const headers = document.querySelectorAll('#cuerpoTablaStatus tr.group-header');
  headers.forEach(header => {
    let matchIcon = header.querySelector('i').className.match(/toggle-icon-(\w+)/);
    if(!matchIcon) return;
    let classTipo = matchIcon[1];
    let childRows = document.querySelectorAll(`.child-st-${classTipo}`);
    let visibleCount = 0;
    
    childRows.forEach(row => {
        let cli = row.getAttribute('data-cliente'); let mar = row.getAttribute('data-marca'); 
        let est = row.getAttribute('data-estado-v2'); let mot = row.getAttribute('data-motor');
        let dias = parseInt(row.getAttribute('data-dias')); let textoFila = row.textContent.toLowerCase(); 
        
        let matchCli = (!chkCli.length || chkCli.includes(cli)); let matchMar = (!chkMar.length || chkMar.includes(mar)); 
        let matchEst = (!chkEst.length || chkEst.includes(est)); let matchTxt = (!txt || textoFila.includes(txt));
        
        if(matchCli && matchMar && matchEst && matchTxt) {
            visibleCount++;
            let isVigenteChart = dias >= 0;
            if(isVigenteChart) { cntTotalVig++; if(normalizeStr(mot).includes("UNIDAD MOTORA")) cntMotVig++; else cntNoMotVig++; } 
            else { cntTotalNoVig++; if(normalizeStr(mot).includes("UNIDAD MOTORA")) cntMotNoVig++; else cntNoMotNoVig++; }
            
            row.style.display = (isFiltering || expandStatusMap[classTipo]) ? '' : 'none'; 
        } else {
            row.style.display = 'none';
        }
    });

    let icon = header.querySelector('i'); let spanConteo = header.querySelector(`.span-conteo-${classTipo}`);
    if(visibleCount > 0) {
        header.style.display = '';
        if(spanConteo) spanConteo.innerText = visibleCount + " Unidades";
        if(icon) icon.className = (isFiltering || expandStatusMap[classTipo]) ? `bi bi-chevron-down ms-1 me-2 text-warning toggle-icon-${classTipo}` : `bi bi-chevron-right ms-1 me-2 text-warning toggle-icon-${classTipo}`;
    } else { 
        header.style.display = 'none'; 
    }
  });

  if(!isHistorialStatus) { updateGraficosEnVivo(cntTotalVig, cntTotalNoVig, cntMotVig, cntMotNoVig, cntNoMotVig, cntNoMotNoVig); }
}

function initGrafico(canvasId) {
    let ctx = document.getElementById(canvasId); if(!ctx) return null;
    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Vigente', 'No Vigente'], datasets: [{ data: [1], backgroundColor: ['#475569'], borderWidth: 2, hoverOffset: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '55%',
            layout: { padding: { left: 30, right: 30, top: 10, bottom: 10 } },
            plugins: {
                legend: { position: 'bottom', labels: { font: {family: 'Oswald'} } },
                datalabels: { anchor: 'end', align: 'end', offset: 5, font: { weight: 'bold', size: 13, family: 'Oswald' }, formatter: (value, context) => { let total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0); if (total === 0 || value === 0 || context.chart.data.labels[0]==='Sin Datos') return ""; return Math.round((value / total) * 100) + "%"; } }
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
        else { chart.data.labels = ['Vigente', 'No Vigente']; chart.data.datasets[0].data = [v, nv]; chart.data.datasets[0].backgroundColor = ['#16a34a', '#dc2626']; }
        chart.update();
    }
    refrescarDatos(chartTotalInst, vigTot, noVigTot); refrescarDatos(chartMotorasInst, vigMot, noVigMot); refrescarDatos(chartNoMotorasInst, vigNoMot, noVigNoMot);
    actualizarColoresGraficos();
}

// FUNCIÓN PARA CAMBIAR COLOR DINÁMICO DE GRÁFICOS (MODO OSCURO/CLARO)
function actualizarColoresGraficos() {
    const charts = [chartTotalInst, chartMotorasInst, chartNoMotorasInst];
    const isDark = document.body.classList.contains('dark');
    const textColor = isDark ? '#f8fafc' : '#1a1a2e'; // Blanco en oscuro, oscuro en claro
    const borderColor = isDark ? '#1e293b' : '#ffffff'; // Color superficie del tema

    charts.forEach(chart => {
        if (chart) {
            // Actualizar leyenda
            chart.options.plugins.legend.labels.color = textColor;
            // Actualizar etiquetas de datos (%)
            chart.options.plugins.datalabels.color = textColor;
            // Actualizar borde de datasets (evitar líneas oscuras en círculos)
            chart.data.datasets[0].borderColor = borderColor;
            // Repintar con nueva config
            chart.update();
        }
    });
}

// ==========================================
// 🔥 FASE 3: GENERADOR DINÁMICO DEL SÚPER WIZARD 🔥
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
            htmlTabs += `<div class="row"><div class="col-md-4 mb-3"><label class="fw-bold">Fecha de Ingreso</label><input type="date" class="form-control fw-bold text-primary" id="i_fecha" required></div><div class="col-md-4 mb-3"><label class="fw-bold">Placa</label><input type="text" class="form-control text-uppercase" id="i_placa" list="dl-placas" oninput="autocompletarInfoInsp()" required></div><div class="col-md-4 mb-3"><label class="fw-bold">KM Tablero</label><input type="number" class="form-control text-danger fw-bold border-danger" id="i_kmtablero" placeholder="Ej: 150000" required></div></div><div class="row"><div class="col-md-4 mb-3"><label class="fw-bold text-secondary">Dueño (Cliente)</label><input type="text" class="form-control bg-light" id="i_cliente" readonly></div><div class="col-md-4 mb-3"><label class="form-label fw-bold text-secondary">Modelo UTS</label><input type="text" class="form-control bg-light" id="i_modelo" readonly></div><div class="col-md-4 mb-3"><label class="form-label fw-bold text-secondary"><i class="bi bi-geo-alt-fill"></i> Kilometraje Wialon GPS</label><input type="number" class="form-control text-primary bg-light fw-bold" id="i_kmgps" readonly placeholder="Calculando..."></div></div>`;
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
                    </div><div id="f_${uid}" style="display:none;" class="mt-3 p-3 bg-light rounded border-start border-danger border-4 shadow-inner"><label class="form-label text-danger fw-bold"><i class="bi bi-pencil-square"></i> Observación</label><textarea class="form-control mb-2 border-danger" rows="2" id="obs_${uid}" placeholder="Describe la falla..."></textarea></div>`;
                } else if (t === 'percent') {
                    htmlTabs += `<input type="hidden" id="val_${uid}" value=""><div class="percent-grid mt-2">`;
                    [10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100].forEach(pct => { htmlTabs += `<button type="button" class="btn btn-outline-primary btn-sm fw-bold pct-btn pct-${uid} shadow-sm" onclick="seleccionarPorcentaje('${uid}', ${pct}, this)">${pct}%</button>`; });
                    htmlTabs += `</div>`;
                } else if (t === 'text') { htmlTabs += `<textarea class="form-control mt-2 border-primary" rows="2" id="txt_${uid}" placeholder="Ingresa el detalle..."></textarea>`; }
                htmlTabs += `</div>`;
            });
        }
        htmlTabs += `</div>`;
    });

    let wH = document.getElementById('wizardHeaders'); if(wH) wH.innerHTML = htmlHeaders;
    let wD = document.getElementById('wizard-dynamic-tabs'); if(wD) wD.innerHTML = htmlTabs;
}

function toggleRadioOkFalla(el, cajaId, isFalla) {
    if (el.dataset.chk === '1') { el.checked = false; el.dataset.chk = '0'; toggleFalla(cajaId, false); } 
    else { document.getElementsByName(el.name).forEach(e => e.dataset.chk = '0'); el.dataset.chk = '1'; toggleFalla(cajaId, isFalla); }
}

function abrirModalNuevaInspeccion() {
    document.getElementById('formNuevaInspeccion').reset();
    document.getElementById('i_id_inspeccion').value = ""; 
    let tzOffset = (new Date()).getTimezoneOffset() * 60000;
    document.getElementById('i_fecha').value = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
    
    document.querySelectorAll('[id^="f_p_"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.pct-btn').forEach(btn => { btn.classList.remove('btn-primary', 'text-white'); btn.classList.add('btn-outline-primary'); });
    document.querySelectorAll('[id^="val_p_"]').forEach(el => el.value = '');
    document.querySelectorAll('input[type="radio"]').forEach(r => r.dataset.chk = '0');
    
    cambiarPestana(0); new bootstrap.Modal(document.getElementById('modalInspeccion')).show();
}

function abrirModalEditarInspeccion(idBusqueda) {
    let insp = dataGlobalInspecciones.find(i => i.id === idBusqueda); 
    if(!insp) return;
    
    document.getElementById('formNuevaInspeccion').reset();
    document.getElementById('i_id_inspeccion').value = insp.id; 
    
    document.querySelectorAll('[id^="f_p_"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.pct-btn').forEach(btn => { btn.classList.remove('btn-primary', 'text-white'); btn.classList.add('btn-outline-primary'); });
    document.querySelectorAll('[id^="val_p_"]').forEach(el => el.value = '');
    document.querySelectorAll('input[type="radio"]').forEach(r => r.dataset.chk = '0');

    document.getElementById('i_fecha').value = insp.fecha_ingreso || "";
    document.getElementById('i_placa').value = insp.placa || "";
    document.getElementById('i_kmtablero').value = insp.km_tablero || "";
    document.getElementById('i_cliente').value = insp.cliente || "";
    document.getElementById('i_tecnico').value = insp.tecnico || "";
    document.getElementById('i_dias').value = insp.dias_propuestos || "30";

    if(insp.detalles_json && insp.detalles_json.includes("[")) {
        try {
            let arr = JSON.parse(insp.detalles_json);
            WIZARD_SCHEMA.forEach((sec, i) => {
                if(sec.items) {
                    sec.items.forEach((item, j) => {
                        let lbl = typeof item === 'string' ? item : item.label; let t = typeof item === 'string' ? 'okfalla' : item.type; let uid = `p_${i}_${j}`;
                        let res = arr.find(x => x.item === lbl && x.categoria === sec.tab);
                        if(res && res.estado !== "SIN DATOS") {
                            if(t === 'okfalla') {
                                if(res.estado === 'OK') { document.getElementById(`${uid}_ok`).checked = true; document.getElementById(`${uid}_ok`).dataset.chk = '1'; } 
                                else if (res.estado === 'FALLA') { document.getElementById(`${uid}_fa`).checked = true; document.getElementById(`${uid}_fa`).dataset.chk = '1'; toggleFalla(`f_${uid}`, true); if(res.observacion) document.getElementById(`obs_${uid}`).value = res.observacion; }
                            } else if (t === 'percent') {
                                let val = res.estado.replace('%',''); document.getElementById(`val_${uid}`).value = val;
                                document.querySelectorAll(`.pct-${uid}`).forEach(b => { if(b.innerText === res.estado) { b.classList.remove('btn-outline-primary'); b.classList.add('btn-primary', 'text-white'); } });
                            } else if (t === 'text') {
                                if(res.observacion) document.getElementById(`txt_${uid}`).value = res.observacion;
                            }
                        }
                    });
                }
            });
        } catch(e) {}
    }
    
    cambiarPestana(0); new bootstrap.Modal(document.getElementById('modalInspeccion')).show();
}

function autocompletarInfoInsp() { 
    let placaInput = normalizeStr(document.getElementById('i_placa').value);
    let match = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placaInput); 
    if(match) { document.getElementById('i_cliente').value = match[1] || ""; document.getElementById('i_modelo').value = match[3] || ""; } 
    
    let wialonData = buscarWialonPorPlaca(placaInput);
    if(wialonData) {
        document.getElementById('i_kmgps').value = wialonData.km;
    } else { document.getElementById('i_kmgps').value = ''; }
}

function cambiarPestana(index) {
    if(index > 0 && !document.getElementById('i_placa').value) { alert("⚠️ Primero debes ingresar la Placa."); return; }
    currentTab = index;
    document.querySelectorAll('.wizard-tab').forEach((tab, i) => tab.classList.toggle('active', i === index));
    document.querySelectorAll('.wizard-step').forEach((step, i) => step.classList.toggle('active', i === index));
    let activeBtn = document.getElementById('step-btn-' + index); if(activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    let btnAnt = document.getElementById('btnWizAnterior'); if(btnAnt) btnAnt.disabled = (index === 0);
    let isLastTab = (index === document.querySelectorAll('.wizard-tab').length - 1);
    let btnSig = document.getElementById('btnWizSiguiente'); if(btnSig) btnSig.style.display = isLastTab ? 'none' : 'block';
    let btnGua = document.getElementById('btnWizGuardar'); if(btnGua) btnGua.style.display = isLastTab ? 'block' : 'none';
    if(isLastTab) setTimeout(initFirma, 300); 
}
function moverWizard(step) { let n = currentTab + step; if(n >= 0 && n < WIZARD_SCHEMA.length) cambiarPestana(n); }
function initFirma() { canvasFirma = document.getElementById('canvasFirma'); if(!canvasFirma) return; ctxFirma = canvasFirma.getContext('2d'); canvasFirma.width = canvasFirma.offsetWidth; canvasFirma.height = canvasFirma.offsetHeight; ctxFirma.lineWidth = 3; ctxFirma.lineCap = 'round'; ctxFirma.strokeStyle = '#000000'; canvasFirma.onmousedown = startDrawing; canvasFirma.onmouseup = stopDrawing; canvasFirma.onmousemove = draw; canvasFirma.onmouseout = stopDrawing; canvasFirma.addEventListener('touchstart', startDrawingTouch, {passive: false}); canvasFirma.addEventListener('touchend', stopDrawing); canvasFirma.addEventListener('touchmove', drawTouch, {passive: false}); }
function startDrawing(e) { dibujando = true; draw(e); } function stopDrawing() { dibujando = false; ctxFirma.beginPath(); }
function draw(e) { if (!dibujando) return; let rect = canvasFirma.getBoundingClientRect(); ctxFirma.lineTo(e.clientX - rect.left, e.clientY - rect.top); ctxFirma.stroke(); ctxFirma.beginPath(); ctxFirma.moveTo(e.clientX - rect.left, e.clientY - rect.top); }
function startDrawingTouch(e) { e.preventDefault(); dibujando = true; drawTouch(e); }
function drawTouch(e) { if (!dibujando) return; e.preventDefault(); let rect = canvasFirma.getBoundingClientRect(); let touch = e.touches[0]; ctxFirma.lineTo(touch.clientX - rect.left, touch.clientY - rect.top); ctxFirma.stroke(); ctxFirma.beginPath(); ctxFirma.moveTo(touch.clientX - rect.left, touch.clientY - rect.top); }
function limpiarFirma() { if(ctxFirma && canvasFirma) { ctxFirma.clearRect(0, 0, canvasFirma.width, canvasFirma.height); ctxFirma.beginPath(); } }

function verDetalleInspeccion(idBusqueda, autoDescargarPDF) {
    let insp = dataGlobalInspecciones.find(i => i.id === idBusqueda); 
    if(!insp) return;

    let fIng = parseDateToDDMMYYYY(insp.fecha_ingreso);
    let htmlFallas = ""; let countFallas = 0;
    
    try {
        if(insp.detalles_json && insp.detalles_json.includes("[")) {
            let detallesArray = JSON.parse(insp.detalles_json);
            detallesArray.forEach(d => {
                let colorTxt = ""; let icon = "";
                if(d.estado === "FALLA") { colorTxt = "color: #dc2626; font-weight: bold;"; icon = "❌"; countFallas++; }
                else if(d.estado === "OK") { colorTxt = "color: #16a34a; font-weight: bold;"; icon = "✅"; }
                else if(d.estado === "SIN DATOS") { colorTxt = "color: #94a3b8; font-style: italic;"; icon = "➖"; }
                else { colorTxt = "color: #0ea5e9; font-weight: bold;"; icon = "ℹ️"; }
                
                htmlFallas += `<div style="border-bottom: 1px solid #e2e8f0; padding: 5px 0;"><strong>${d.categoria.replace(/^\d+\.\s*/, '')} - ${d.item}:</strong> <span style="${colorTxt}">${icon} ${d.estado}</span>${d.observacion ? `<br><em style="color: #64748b; font-size: 11px;">Obs: ${d.observacion}</em>` : ''}</div>`;
            });
        } 
        else { 
            let ignorarKeys = ["ID", "PLACA", "FECHA_DE_INGRESO", "URL_FIRMA", "DETALLES_JSON", "CLIENTE", "TECNICO", "KM_TABLERO", "DIAS_PROPUESTOS", "ESTADO_INSPECCION", "ESTADO"];
            Object.keys(insp).forEach(k => {
                if(ignorarKeys.includes(k.toUpperCase())) return; 
                let val = insp[k];
                if(val === null || val === undefined || val === "" || val === "-") return; 
                val = val.toString().trim(); let valUpper = val.toUpperCase();
                
                let colorTxt = "color: #0ea5e9; font-weight: bold;"; let icon = "ℹ️";
                if(valUpper === "FALLA" || valUpper === "MALO" || valUpper === "NO") { colorTxt = "color: #dc2626; font-weight: bold;"; icon = "❌"; countFallas++; }
                else if(valUpper === "OK" || valUpper === "BUENO" || valUpper === "SI" || valUpper === "ACTIVA") { colorTxt = "color: #16a34a; font-weight: bold;"; icon = "✅"; }
                else if(valUpper === "SIN DATOS" || valUpper === "N/A" || valUpper === "NINGUNO") { colorTxt = "color: #94a3b8; font-style: italic;"; icon = "➖"; }
                
                htmlFallas += `<div style="border-bottom: 1px solid #e2e8f0; padding: 5px 0;"><strong style="text-transform: capitalize;">${k.replace(/_/g, ' ').toLowerCase()}:</strong> <span style="${colorTxt}">${icon} ${val}</span></div>`;
            });
        }
    } catch(e) { htmlFallas = "<p class='text-danger'>Error al leer los detalles históricos.</p>"; }
    
    if(htmlFallas === "") htmlFallas = "<p class='text-center text-muted mt-3'>No hay fallas ni respuestas registradas en este reporte.</p>";

    let htmlModal = `
    <div class="col-md-6"><div class="insp-detail-card shadow-sm"><div class="insp-detail-title"><i class="bi bi-card-checklist text-primary"></i> REGISTRO GENERAL</div><div class="insp-row"><span>Fecha de Inspección</span><span>${fIng}</span></div><div class="insp-row"><span>Placa</span><span class="text-primary fw-bold">${insp.placa}</span></div><div class="insp-row"><span>Kilometraje</span><span>${insp.km_tablero || '-'}</span></div><div class="insp-row"><span>Fallas Detectadas</span><span class="text-danger fw-bold">${countFallas}</span></div></div></div>
    <div class="col-md-6"><div class="insp-detail-card shadow-sm"><div class="insp-detail-title"><i class="bi bi-person-badge text-primary"></i> FIRMA Y RESPONSABLE</div><div class="insp-row"><span>Técnico Inspector</span><span>${insp.tecnico || '-'}</span></div>
    <div class="text-center mt-3 p-2 border rounded bg-white" id="firma-visual-modal"><span class="text-muted"><span class="spinner-border spinner-border-sm"></span> Verificando firma...</span></div></div></div>
    <div class="col-12"><div class="card p-3 shadow-sm"><h6 class="fw-bold text-primary border-bottom pb-2">Detalle de Inspección Completa</h6><div style="max-height: 300px; overflow-y:auto; font-size: 0.9rem;">${htmlFallas}</div></div></div>`;

    document.getElementById('pdf-insp-placa').innerText = insp.placa; 
    document.getElementById('pdf-insp-fecha').innerText = fIng; 
    document.getElementById('pdf-insp-tecnico').innerText = insp.tecnico || '';
    document.getElementById('pdf-insp-km').innerText = insp.km_tablero || '-';
    document.getElementById('pdf-insp-cliente').innerText = insp.cliente || (dataGlobalPlacas.find(p => normalizeStr(p[0]) === normalizeStr(insp.placa)) || [])[1] || "";
    document.getElementById('pdf-insp-detalle-fallas').innerHTML = htmlFallas;
    
    document.getElementById('contenedor-resumen-insp').innerHTML = htmlModal; 
    new bootstrap.Modal(document.getElementById('modalResumenInspeccion')).show();

    let firmaImgPDF = document.getElementById('pdf-insp-firma');
    if(insp.url_firma && insp.url_firma.includes('drive.google')) {
        google.script.run.withSuccessHandler(base64 => {
            if(base64) { 
                firmaImgPDF.src = base64; firmaImgPDF.style.display = 'inline-block'; 
                document.getElementById('firma-visual-modal').innerHTML = `<img src="${base64}" style="max-height: 100px; max-width:100%;">`;
                if(autoDescargarPDF) setTimeout(generarPDFInspeccion, 500); 
            } else {
                firmaImgPDF.style.display = 'none'; document.getElementById('firma-visual-modal').innerHTML = '<span class="text-muted">Error al cargar firma</span>';
                if(autoDescargarPDF) setTimeout(generarPDFInspeccion, 500);
            }
        }).obtenerImagenBase64(insp.url_firma);
    } else { 
        firmaImgPDF.style.display = 'none'; document.getElementById('firma-visual-modal').innerHTML = '<span class="text-muted">Sin firma registrada</span>';
        if(autoDescargarPDF) setTimeout(generarPDFInspeccion, 500);
    }
}

function generarPDFInspeccion() {
    const btnElement = event.currentTarget || document.querySelector('#modalResumenInspeccion .btn-outline-danger'); 
    let textoOriginal = "Exportar PDF";
    if(btnElement) { textoOriginal = btnElement.innerHTML; btnElement.innerHTML = '<i class="bi bi-hourglass-split"></i> Creando...'; btnElement.classList.add('disabled'); }
    
    const elemento = document.getElementById('pdf-inspeccion');
    document.getElementById('contenedor-pdf-inspeccion').style.display = 'block';
    
    html2pdf().set({ margin: 15, filename: `Inspeccion_${document.getElementById('pdf-insp-placa').innerText}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(elemento).save().then(() => { 
        document.getElementById('contenedor-pdf-inspeccion').style.display = 'none'; 
        if(btnElement) { btnElement.innerHTML = textoOriginal; btnElement.classList.remove('disabled'); }
    });
}

function cargarTablaPlacas(forzarRefresh = false) { if(!forzarRefresh && dataGlobalPlacas.length > 0) { mostrarPlacas(dataGlobalPlacas); return; } document.getElementById('cuerpoTablaPlacas').innerHTML = '<tr><td colspan="9" class="text-center py-4"><span class="spinner-border text-warning spinner-border-sm"></span> Cargando...</td></tr>'; google.script.run.withSuccessHandler(mostrarPlacas).obtenerDatosPlacas(); }
function mostrarPlacas(datos) { if(procesadorErroresCuota(datos, 'cuerpoTablaPlacas')) return; datos.sort((a, b) => { const cliA = (a[1]||'').trim().toUpperCase(); const cliB = (b[1]||'').trim().toUpperCase(); const wA = cliA.includes('ROSYMAR') ? 1 : cliA.includes('YOGUI') ? 2 : 3; const wB = cliB.includes('ROSYMAR') ? 1 : cliB.includes('YOGUI') ? 2 : 3; if (wA !== wB) return wA - wB; if (cliA !== cliB) return cliA.localeCompare(cliB); const estA = (a[8]||'').trim(); const estB = (b[8]||'').trim(); if (estA !== estB) return estA.localeCompare(estB); return (a[0]||'').localeCompare(b[0]||''); }); dataGlobalPlacas = datos; let p = permisosUsuario || {}; let isAdmP = p.admin === true || (localStorage.getItem('crm_correo') || '').toLowerCase() === 'admin@azkell.com'; const canEditP = isAdmP || p.placas?.e === true; const canDeleteP = isAdmP || p.placas?.d === true; let html = ''; if (!datos || datos.length === 0) { html = '<tr><td colspan="9" class="text-center py-4" style="color:var(--subtext)!important">No hay placas registradas.</td></tr>'; } else { const setClientes = new Set(), setTipos = new Set(), setMarcas = new Set(), setEstados = new Set(); let setFormPlacas=new Set(), setFormClientes=new Set(), setFormTipos=new Set(), setFormMarcas=new Set(), setFormModelos=new Set(), setFormConfs=new Set(), setFormCombs=new Set(), setFormUts=new Set(); let clienteActual = null; datos.forEach((fila, index) => { if ((fila[0]||'').toUpperCase() === 'PLACA') return; const plc = fila[0] ? fila[0].trim() : ''; const cli = fila[1] ? fila[1].trim() : ''; const tip = fila[2] ? fila[2].trim() : ''; const mod = fila[3] ? fila[3].trim() : ''; const mar = fila[4] ? fila[4].trim() : ''; const ruc = fila[5] ? fila[5].trim() : ''; const cnf = fila[6] ? fila[6].trim() : ''; const cmb = fila[7] ? fila[7].trim() : ''; const est = fila[8] ? fila[8].trim() : ''; const uts = fila[10] ? fila[10].trim() : ''; if (cli && cli !== '-' && cli.toUpperCase() !== 'CLIENTE') setClientes.add(cli); if (tip && tip !== '-' && tip.toUpperCase() !== 'TIPO') setTipos.add(tip); if (mar && mar !== '-' && mar.toUpperCase() !== 'MARCA') setMarcas.add(mar); if (est === 'Activa' || est === 'Inactiva') setEstados.add(est); if(plc && plc!=="-") setFormPlacas.add(plc); if(cli && cli!=="-") setFormClientes.add(cli); if(tip && tip!=="-") setFormTipos.add(tip); if(mod && mod!=="-") setFormModelos.add(mod); if(mar && mar!=="-") setFormMarcas.add(mar); if(cnf && cnf!=="-") setFormConfs.add(cnf); if(cmb && cmb!=="-") setFormCombs.add(cmb); if(uts && uts!=="-") setFormUts.add(uts); if (cli !== clienteActual) { clienteActual = cli; const displayCli = cli || 'Sin Asignar'; html += `<tr class="group-header" data-group-cliente="${cli}"><td colspan="9"><i class="bi bi-building me-2 text-warning"></i>${displayCli} <span class="group-count">0</span></td></tr>`; } const bEst = est === 'Activa' ? '<span class="badge bg-success">Activa</span>' : est === 'Inactiva' ? '<span class="badge bg-danger">Inactiva</span>' : `<span class="badge bg-secondary">${est}</span>`; let menuAcciones = ''; if (canEditP || canDeleteP) { let items = ''; if (canEditP) items += `<li><a class="dropdown-item" href="#" onclick="abrirModalEditarPlaca(${index})"><i class="bi bi-pencil text-primary"></i> Editar Placa</a></li>`; if (canEditP && canDeleteP) items += `<li><hr class="dropdown-divider"></li>`; if (canDeleteP) items += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${fila[0]}','Placas')"><i class="bi bi-trash"></i> Eliminar</a></li>`; menuAcciones = `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${items}</ul></div>`; } else { menuAcciones = '<span class="text-muted"><i class="bi bi-dash"></i></span>'; } html += `<tr class="clickable-row data-row" onclick="abrirDetallePlaca(event,${index})" data-cliente="${cli}" data-tipo="${tip}" data-marca="${mar}" data-estado="${est}"><td class="fw-bold" data-value="${fila[0]}">${fila[0]}</td><td>${cli||'-'}</td><td>${tip||'-'}</td><td>${mar||'-'}</td><td>${bEst}</td><td>${fila[10]||'-'}</td><td>${fila[11]||'-'}</td><td>${fila[13]||'-'}</td><td>${menuAcciones}</td></tr>`; }); rellenarFiltroCheck('filtroCliente', setClientes, 'filtrarPlacasAvanzado'); rellenarFiltroCheck('filtroTipo', setTipos, 'filtrarPlacasAvanzado'); rellenarFiltroCheck('filtroMarca', setMarcas, 'filtrarPlacasAvanzado'); rellenarFiltroCheck('filtroEstado', setEstados, 'filtrarPlacasAvanzado'); rellenarDatalist('dl-placas', setFormPlacas); rellenarDatalist('dl-clientes', setFormClientes); rellenarDatalist('dl-tipos', setFormTipos); rellenarDatalist('dl-marcas', setFormMarcas); rellenarDatalist('dl-modelos', setFormModelos); rellenarDatalist('dl-confs', setFormConfs); rellenarDatalist('dl-combs', setFormCombs); rellenarDatalist('dl-uts', setFormUts); } document.getElementById('cuerpoTablaPlacas').innerHTML = html; filtrarPlacasAvanzado(); }
function rellenarDatalist(id, setObj) { const dl = document.getElementById(id); if (!dl) return; dl.innerHTML = ''; Array.from(setObj).sort().forEach(v => { dl.innerHTML += `<option value="${v}">`; }); }
function autocompletarRuc(clienteIngresado, inputRucId) { let rucInput = document.getElementById(inputRucId); if (!rucInput || !clienteIngresado) return; let match = dataGlobalPlacas.find(p => p[1] && p[1].trim().toLowerCase() === clienteIngresado.trim().toLowerCase() && p[5] && p[5].trim() !== "" && p[5].trim() !== "-"); if (match) { rucInput.value = match[5].trim(); } }
function rellenarFiltroCheck(idLista, setObj, fnName) { const ul = document.getElementById(idLista); if (!ul) return; ul.innerHTML = ''; Array.from(setObj).sort().forEach(v => { if (v.trim() && v.trim() !== '-') { ul.innerHTML += `<li><label class="dropdown-item form-check-label d-flex align-items-center"><input type="checkbox" class="form-check-input me-2 mt-0" value="${v}" onchange="${fnName}()"> ${v}</label></li>`; } }); }
function filtrarPlacasAvanzado() { const txt = document.getElementById('buscadorPlacas')?.value.toLowerCase() || ''; const chkCli = Array.from(document.querySelectorAll('#filtroCliente input:checked')).map(e=>e.value); const chkTip = Array.from(document.querySelectorAll('#filtroTipo input:checked')).map(e=>e.value); const chkMar = Array.from(document.querySelectorAll('#filtroMarca input:checked')).map(e=>e.value); const chkEst = Array.from(document.querySelectorAll('#filtroEstado input:checked')).map(e=>e.value); let kpiCamion=0, kpiCarreta=0, kpiSemi=0, kpiTracto=0; const conteoClientes = {}; const filas = document.querySelectorAll('#cuerpoTablaPlacas tr.data-row'); filas.forEach(row => { const cli = row.getAttribute('data-cliente'); const tip = row.getAttribute('data-tipo'); const mar = row.getAttribute('data-marca'); const est = row.getAttribute('data-estado'); const textoFila = row.innerText.toLowerCase(); const ok = ((!txt || textoFila.includes(txt)) && (!chkCli.length || chkCli.includes(cli)) && (!chkTip.length || chkTip.includes(tip)) && (!chkMar.length || chkMar.includes(mar)) && (!chkEst.length || chkEst.includes(est))); if (ok) { row.style.display = ''; conteoClientes[cli] = (conteoClientes[cli] || 0) + 1; const t = (tip||'').toLowerCase(); if (t.includes('cami') || t.includes('camion')) kpiCamion++; else if (t.includes('carreta')) kpiCarreta++; else if (t.includes('semirremolque')||t.includes('semi')) kpiSemi++; else if (t.includes('tracto')) kpiTracto++; } else { row.style.display = 'none'; } }); document.querySelectorAll('#cuerpoTablaPlacas tr.group-header').forEach(g => { const cli = g.getAttribute('data-group-cliente'); const total = conteoClientes[cli] || 0; g.style.display = total > 0 ? '' : 'none'; const badge = g.querySelector('.group-count'); if (badge) badge.innerText = total; }); const safe = v => document.getElementById(v); if (safe('kpi-camion')) safe('kpi-camion').innerText = kpiCamion; if (safe('kpi-carreta')) safe('kpi-carreta').innerText = kpiCarreta; if (safe('kpi-semi')) safe('kpi-semi').innerText = kpiSemi; if (safe('kpi-tracto')) safe('kpi-tracto').innerText = kpiTracto; }
function abrirDetallePlaca(event, index) { if (event.target.closest('.dropdown') || event.target.closest('.btn-icon-dropdown')) return; const p = dataGlobalPlacas[index]; if (!p) return; ['det-placa','det-cliente','det-tipo','det-modelo','det-marca','det-ruc','det-conf','det-comb','det-estado','det-operativo','det-uts','det-motora','det-llantas','det-enuso'].forEach((id, i) => { const el = document.getElementById(id); if(el) el.innerText = p[i] || '-'; }); new bootstrap.Modal(document.getElementById('modalDetallePlaca')).show(); }
function abrirModalEditarPlaca(index) { const p = dataGlobalPlacas[index]; if (!p) return; document.getElementById('formEditarPlaca')?.reset(); ['e_placa','e_cliente','e_tipo','e_modelo','e_marca','e_ruc','e_conf','e_comb','e_estado','e_operativo','e_uts','e_motora','e_llantas','e_enuso'].forEach((id, i) => { const el = document.getElementById(id); if(el) el.value = p[i] || ''; }); const btn = document.getElementById('btnActualizarPlaca'); if(btn){ btn.disabled = false; btn.innerHTML = 'Actualizar Placa';} new bootstrap.Modal(document.getElementById('modalEditarPlaca')).show(); }
function enviarPlaca(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnGuardarPlaca'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...'; formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { formObj.reset(); bootstrap.Modal.getInstance(document.getElementById('modalPlaca')).hide(); cargarTablaPlacas(true); } else alert(r); btn.disabled = false; btn.innerHTML = 'Guardar'; }).withFailureHandler(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Guardar'; }).guardarPlaca(formObj); }
function enviarEdicionPlaca(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnActualizarPlaca'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Actualizando...'; formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { bootstrap.Modal.getInstance(document.getElementById('modalEditarPlaca')).hide(); cargarTablaPlacas(true); } else alert(r); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).withFailureHandler(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).actualizarPlaca(formObj); }

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
  let datosOrdenados = [...datos].sort((a,b) => parseFecha(b[1]) - parseFecha(a[1]));

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
          if (infoPlaca && infoPlaca[8] === 'Activa' && !mapa.has(key)) {
              mapa.set(key, row);
          }
      });
      datosAMostrar = Array.from(mapa.values());
  }

  let html = '';
  if(!datosAMostrar || datosAMostrar.length === 0) { html = '<tr><td colspan="10" class="text-center py-4" style="color: var(--subtext) !important;">No hay mantenimientos.</td></tr>'; } 
  else {
      let p = permisosUsuario || {}; let isAdmF = p.admin === true || (localStorage.getItem('crm_correo') || '').toLowerCase() === 'admin@azkell.com'; let canEditF = isAdmF || p.fleet?.e === true; let canDeleteF = isAdmF || p.fleet?.d === true; let setFClientes = new Set(); let setFUts = new Set(); let mapPlacas = new Map(); 
      datosAMostrar.forEach((fila) => { let placaRaw = fila[4] || "-"; if(!mapPlacas.has(placaRaw)) mapPlacas.set(placaRaw, []); mapPlacas.get(placaRaw).push(fila); });
      mapPlacas.forEach((mantenimientos, placaRaw) => {
          let infoP = dataGlobalPlacas.find(p => p[0] === placaRaw); let cli = infoP ? infoP[1] : (mantenimientos[0][6] || "-"); let utsRaw = infoP ? infoP[10] : (mantenimientos[0][7] || "-"); let utsDisplay = (utsRaw === "-" || utsRaw === "") ? "-" : utsRaw.charAt(0).toUpperCase() + utsRaw.slice(1).toLowerCase();
          let isActive = infoP && infoP[8] === 'Activa'; if(isActive && cli && cli !== "-") setFClientes.add(cli); if(utsDisplay !== "-") setFUts.add(utsDisplay);
          let classPlaca = normalizarClase(placaRaw);
          html += `<tr class="group-header data-row-fleetrun" style="cursor:pointer;" onclick="toggleGroupRow('child-${classPlaca}', this)" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}">
              <td colspan="10" class="fw-bold text-start" style="background-color: rgba(128,128,128,0.1) !important; color: var(--text) !important;"><i class="bi bi-chevron-right ms-1 me-2 text-warning toggle-icon-${classPlaca}"></i> <span style="display:inline-block; min-width:80px;">${placaRaw}</span><span class="badge bg-secondary ms-2">${cli}</span><span class="badge bg-info text-dark ms-2">${utsDisplay}</span><span class="badge bg-warning text-dark float-end">${mantenimientos.length} Registros</span></td></tr>`;
          mantenimientos.forEach((fila) => {
              let id = fila[0]; let fechaStr = fila[1]; let tipo_mp = fila[8]; let obs = fila[12]; let km_cambio = parseFloat(fila[9]) || 0; let frecuencia = parseFloat(fila[10]) || 0; let km_prox = parseFloat(fila[11]) || 0; let fechaLimpia = parseDateToDDMMYYYY(fechaStr);
              
              // 🔥 WIALON GPS INYECCIÓN EN FLEETRUN 🔥
              let km_gps = parseFloat(fila[14]) || 0;
              let isLive = false;
              let wialonData = buscarWialonPorPlaca(placaRaw);
              if (wialonData) {
                  km_gps = wialonData.km;
                  isLive = true;
              }
              
              let falta_km = km_prox - km_gps; let colorFalta = ""; let iconFalta = "";
              if (falta_km <= 0) { colorFalta = "#dc2626"; iconFalta = `<i class="bi bi-exclamation-circle-fill"></i>`; } else if (falta_km > 0 && ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100))) { colorFalta = "#eab308"; iconFalta = `<i class="bi bi-exclamation-triangle-fill"></i>`; } else { colorFalta = "#16a34a"; iconFalta = `<i class="bi bi-check-circle-fill"></i>`; }
              let fmtTipo = `<span style="color: #2D438A; font-weight: bold;">${tipo_mp}</span>`; let fmtFrec = `<span style="color: orange; font-weight: bold;">${frecuencia.toLocaleString()}</span>`; 
              
              let fmtKmGps = isLive ? `<span class="badge bg-primary shadow-sm px-2"><i class="bi bi-broadcast"></i> ${km_gps.toLocaleString()}</span>` : `<span style="color: #64748b; font-weight: bold;">${km_gps.toLocaleString()}</span>`; 
              let fmtFalta = `<span style="color: ${colorFalta}; font-weight: bold;">${iconFalta} ${falta_km.toLocaleString()}</span>`;
              
              let menuAcciones = ''; if (canEditF || canDeleteF) { let items = ''; if(canEditF) items += `<li><a class="dropdown-item" href="#" onclick="abrirModalEditarFleetrun('${id}')"><i class="bi bi-pencil text-primary"></i> Editar</a></li>`; if(canEditF && canDeleteF) items += `<li><hr class="dropdown-divider"></li>`; if(canDeleteF) items += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${id}', 'Fleetrun')"><i class="bi bi-trash"></i> Eliminar</a></li>`; menuAcciones = `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${items}</ul></div>`; } else { menuAcciones = `<span class="text-muted"><i class="bi bi-dash"></i></span>`; }
              let originalIndex = dataGlobalFleetrun.findIndex(x => x[0] === id); 
              html += `<tr class="child-${classPlaca} clickable-row data-row-fleetrun child-row-fleetrun" style="display:none;" onclick="abrirDetalleFleetrun(event, ${originalIndex})" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}" data-fecha="${fechaLimpia}"><td class="text-end text-muted" style="font-size: 0.75rem;" data-value="${placaRaw}">∟</td><td>${fechaLimpia}</td><td>${fmtTipo}</td><td>${km_cambio.toLocaleString()}</td><td>${fmtFalta}</td><td>${km_prox.toLocaleString()}</td><td class="text-truncate" style="max-width: 150px;">${obs}</td><td>${fmtFrec}</td><td>${fmtKmGps}</td><td>${menuAcciones}</td></tr>`;
          });
      });
      rellenarFiltroCheck('filtroFleetCliente', setFClientes, 'filtrarFleetrunAvanzado'); rellenarFiltroCheck('filtroFleetUts', setFUts, 'filtrarFleetrunAvanzado');
  }
  document.getElementById('cuerpoTablaFleetrun').innerHTML = html;
}
function filtrarFleetrunAvanzado() { const txt = document.getElementById('buscadorFleetrun')?.value.toLowerCase() || ''; const dateF = document.getElementById('buscadorFechaFleetrun')?.value || ''; let dateCompare = ''; if(dateF) { let p = dateF.split('-'); dateCompare = `${p[2]}/${p[1]}/${p[0]}`; } const chkCli = Array.from(document.querySelectorAll('#filtroFleetCliente input:checked')).map(e=>e.value); const chkUts = Array.from(document.querySelectorAll('#filtroFleetUts input:checked')).map(e=>e.value); let isFiltering = txt !== '' || dateCompare !== '' || chkCli.length > 0 || chkUts.length > 0; const headers = document.querySelectorAll('#cuerpoTablaFleetrun tr.group-header'); headers.forEach(header => { const placaRaw = header.getAttribute('data-placa'); const classPlaca = normalizarClase(placaRaw); const cli = header.getAttribute('data-cliente'); const uts = header.getAttribute('data-uts'); let childRows = document.querySelectorAll(`.child-${classPlaca}`); let hasVisibleChild = false; let matchCli = (!chkCli.length || chkCli.includes(cli)); let matchUts = (!chkUts.length || chkUts.includes(uts)); if(matchCli && matchUts) { childRows.forEach(row => { let textoRow = row.innerText.toLowerCase() + " " + placaRaw.toLowerCase(); let rowFecha = row.getAttribute('data-fecha'); let matchTxt = (!txt || textoRow.includes(txt)); let matchDate = (!dateCompare || rowFecha === dateCompare); if(matchTxt && matchDate) { row.style.display = isFiltering ? '' : (expandAllState ? '' : 'none'); hasVisibleChild = true; } else { row.style.display = 'none'; } }); let icon = header.querySelector('i'); if(icon) { if (isFiltering && hasVisibleChild) icon.className = "bi bi-chevron-down ms-1 me-2 text-warning"; else icon.className = expandAllState ? "bi bi-chevron-down ms-1 me-2 text-warning" : "bi bi-chevron-right ms-1 me-2 text-warning"; } } else { childRows.forEach(row => row.style.display = 'none'); } header.style.display = hasVisibleChild ? '' : 'none'; }); }
function abrirModalNuevoFleetrun() { document.getElementById('formFleetrun').reset(); document.getElementById('f_id').value = ''; let tzOffset = (new Date()).getTimezoneOffset() * 60000; let today = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0]; document.getElementById('f_fecha').value = today; autocompletarFecha('f'); new bootstrap.Modal(document.getElementById('modalFleetrun')).show(); }
function autocompletarFecha(prefix) { let dateInput = document.getElementById(prefix + '_fecha').value; if(dateInput) { let d = new Date(dateInput + "T00:00:00"); const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]; document.getElementById(prefix + '_mes').value = meses[d.getMonth()]; document.getElementById(prefix + '_anio').value = d.getFullYear(); } }

function autocompletarFleetrun(prefix) { 
    let placaInput = normalizeStr(document.getElementById(prefix + '_placa').value); 
    let match = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placaInput); 
    if(match) { 
        document.getElementById(prefix + '_marca').value = match[4] || ""; 
        document.getElementById(prefix + '_dueno').value = match[1] || ""; 
        document.getElementById(prefix + '_uts').value = match[10] || ""; 
        calcularFrecuencia(prefix); 
    }
    
    let wialonData = buscarWialonPorPlaca(placaInput);
    if(wialonData) {
        document.getElementById(prefix + '_kmgps').value = wialonData.km;
    } else { document.getElementById(prefix + '_kmgps').value = ''; }
}

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
function abrirDetalleFleetrun(event, index) { if (event.target.closest('.dropdown') || event.target.closest('.btn-icon-dropdown')) return; const p = dataGlobalFleetrun[index]; if (!p) return; ['detF-id','detF-fecha','detF-mes','detF-anio','detF-placa','detF-marca','detF-dueno','detF-uts','detF-tipomp','detF-kmact','detF-freckm','detF-kmprox','detF-kmgps','detF-tec','detF-obs'].forEach((id, i) => { let val = p[i] || '-'; if(id === 'detF-fecha') val = parseDateToDDMMYYYY(val); const el = document.getElementById(id); if(el) el.innerText = val; }); new bootstrap.Modal(document.getElementById('modalDetalleFleetrun')).show(); }
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

function cargarTablaSeguridad(forzarRefresh = false) { if(!forzarRefresh && dataGlobalSeguridad.length > 0) { mostrarDatosSeguridad(dataGlobalSeguridad); return; } document.getElementById('cuerpoTabla').innerHTML = '<tr><td colspan="6" class="text-center py-4"><span class="spinner-border text-warning spinner-border-sm"></span> Cargando datos...</td></tr>'; google.script.run.withSuccessHandler(mostrarDatosSeguridad).obtenerDatosSeguridad(); }
function mostrarDatosSeguridad(datos) { if(procesadorErroresCuota(datos, 'cuerpoTabla')) return; dataGlobalSeguridad = datos; let pS = permisosUsuario || {}; let isAdmS = pS.admin === true || (localStorage.getItem('crm_correo') || '').toLowerCase() === 'admin@azkell.com'; const canEditS = isAdmS || pS.seg?.e === true; const canDeleteS = isAdmS || pS.seg?.d === true; let html = ''; if (!datos || datos.length === 0) { html = '<tr><td colspan="6" class="text-center py-4" style="color:var(--subtext)!important">No hay registros aún.</td></tr>'; } else { datos.forEach(fila => { const estadoPuro = fila[6]; const badgeEstado = estadoPuro === 'Pendiente' ? '<span class="badge bg-danger">Pendiente</span>' : '<span class="badge bg-success">Revisado</span>'; const inspectorSeguro = (fila[2]||'').replace(/'/g, "\'"); const linkFoto = fila[5]; const itemFoto = linkFoto && linkFoto !== '' ? `<li><a class="dropdown-item" href="${linkFoto}" target="_blank"><i class="bi bi-image text-primary"></i> Ver Fotografía</a></li>` : `<li><a class="dropdown-item disabled" href="#"><i class="bi bi-image-alt"></i> Sin fotografía</a></li>`; const itemPdf = `<li><a class="dropdown-item fw-bold text-dark" href="#" onclick="generarPDF(event,'${fila[0]}','${fila[1]}','${inspectorSeguro}','${fila[3]}','${estadoPuro}','${linkFoto||''}')"><i class="bi bi-file-pdf text-danger"></i> Exportar a PDF</a></li>`; let itemsAdmin = ''; if (canEditS) itemsAdmin += `<li><a class="dropdown-item" href="#" onclick="abrirModalEditar('${fila[0]}','${inspectorSeguro}','${fila[3]}','${estadoPuro}')"><i class="bi bi-pencil text-warning"></i> Editar Reporte</a></li>`; if (canEditS && canDeleteS) itemsAdmin += `<li><hr class="dropdown-divider"></li>`; if (canDeleteS) itemsAdmin += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${fila[0]}','Seguridad')"><i class="bi bi-trash"></i> Eliminar Registro</a></li>`; const separador = itemsAdmin !== '' ? '<li><hr class="dropdown-divider"></li>' : ''; const menuAcciones = `<div class="dropstart text-center"><button class="btn-icon-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${itemFoto}${itemPdf}${separador}${itemsAdmin}</ul></div>`; html += `<tr><td class="fw-bold text-secondary">${fila[0]}</td><td>${fila[1]}</td><td>${fila[2]}</td><td>${fila[3]}</td><td data-estado="${estadoPuro}">${badgeEstado}</td><td>${menuAcciones}</td></tr>`; }); } document.getElementById('cuerpoTabla').innerHTML = html; }
function generarPDF(event, id, fecha, inspector, tipo, estado, urlImagen) { event.preventDefault(); const btnElement = event.currentTarget; const textoOriginal = btnElement.innerHTML; btnElement.innerHTML = '<i class="bi bi-hourglass-split"></i> Creando...'; btnElement.classList.add('disabled'); document.getElementById('pdf-id').innerText = id; document.getElementById('pdf-fecha').innerText = fecha; document.getElementById('pdf-inspector').innerText = inspector; document.getElementById('pdf-tipo').innerText = tipo; document.getElementById('pdf-estado').innerText = estado; const imgElement = document.getElementById('pdf-imagen'); const pSinImagen = document.getElementById('pdf-sin-imagen'); function dispararPDF() { const elemento = document.getElementById('reporte-imprimir'); document.getElementById('contenedor-pdf').style.display = 'block'; html2pdf().set({ margin:10, filename:`Reporte_${id}.pdf`, image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2}, jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} }).from(elemento).save().then(() => { document.getElementById('contenedor-pdf').style.display = 'none'; btnElement.innerHTML = textoOriginal; btnElement.classList.remove('disabled'); }); } if (urlImagen && urlImagen.includes('drive.google.com')) { google.script.run.withSuccessHandler(base64 => { if (base64) { imgElement.src = base64; imgElement.style.display='block'; pSinImagen.style.display='none'; imgElement.onload = () => dispararPDF(); } else { imgElement.style.display='none'; pSinImagen.style.display='block'; pSinImagen.innerText='Error al cargar foto'; dispararPDF(); } }).obtenerImagenBase64(urlImagen); } else { imgElement.style.display = 'none'; pSinImagen.style.display = 'block'; pSinImagen.innerText = 'No se adjuntó evidencia fotográfica'; dispararPDF(); } }
function filtrarTablaAvanzado() { const filtroTexto = document.getElementById('buscador')?.value.toLowerCase() || ''; const filtroFechaRaw = document.getElementById('buscadorFecha')?.value || ''; let fechaComparar = ''; if (filtroFechaRaw) { const p = filtroFechaRaw.split('-'); fechaComparar = p[2]+'/'+p[1]+'/'+p[0]; } const filas = document.getElementById('tablaSeguridad').getElementsByTagName('tr'); for (let i = 1; i < filas.length; i++) { const celdas = filas[i].getElementsByTagName('td'); if (celdas.length < 1) continue; const textoFila = filas[i].textContent || filas[i].innerText; const textoFecha = celdas[1] ? (celdas[1].textContent || celdas[1].innerText) : ''; const coincideTexto = textoFila.toLowerCase().indexOf(filtroTexto) > -1; const coincideFecha = !filtroFechaRaw || textoFecha.includes(fechaComparar); filas[i].style.display = (coincideTexto && coincideFecha) ? '' : 'none'; } }
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
                if (itemAEliminarCol === 'Seguridad') cargarTablaSeguridad(true);
                else if (itemAEliminarCol === 'Placas') cargarTablaPlacas(true);
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
        <tr data-k="seg"><td class="text-start ps-3 fw-semibold text-secondary small">Seguridad</td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="seg" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="seg" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="seg" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="seg" style="width:18px;height:18px;cursor:pointer;"></td></tr>
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
function enviarDatos(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnGuardar'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...'; formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { formObj.reset(); bootstrap.Modal.getInstance(document.getElementById('modalSeguridad')).hide(); dataGlobalSeguridad = []; cargarTablaSeguridad(); } else alert(r); btn.disabled = false; btn.innerHTML = 'Guardar Registro'; }).withFailureHandler(e => { alert('Error: ' + e.message); btn.disabled = false; btn.innerHTML = 'Guardar Registro'; }).guardarReporte(formObj); }
function abrirModalEditar(id, inspector, tipo, estado) { document.getElementById('formEditar').reset(); document.getElementById('edit-id').value = id; document.getElementById('edit-inspector').value = inspector; document.getElementById('edit-tipo').value = tipo; document.getElementById('edit-estado').value = estado; const btn = document.getElementById('btnActualizar'); btn.disabled = false; btn.innerHTML = 'Actualizar Cambios'; new bootstrap.Modal(document.getElementById('modalEditar')).show(); }
function enviarEdicion(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnActualizar'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Actualizando...'; formObj.usuarioAutor.value = usuarioLogueado; google.script.run.withSuccessHandler(r => { if (r === 'Éxito') { bootstrap.Modal.getInstance(document.getElementById('modalEditar')).hide(); dataGlobalSeguridad = []; cargarTablaSeguridad(); } else alert(r); btn.disabled = false; btn.innerHTML = 'Actualizar Cambios'; }).withFailureHandler(e => { alert('Error: ' + e.message); btn.disabled = false; btn.innerHTML = 'Actualizar Cambios'; }).actualizarReporte(formObj); }
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
function obtenerTipoCompuesto(motora, nomotora) {
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
        if (p && p[2] && p[2] !== "-") tMot = limpiarTexto(p[2]);
    }
    if (nomotora && nomotora !== "-") {
        let p = dataGlobalPlacas.find(x => normalizeStr(x[0]) === normalizeStr(nomotora));
        if (p && p[2] && p[2] !== "-") tNoMot = limpiarTexto(p[2]);
    }

    if (tMot && tNoMot) return `${tMot} - ${tNoMot}`;
    if (tMot) return tMot;
    if (tNoMot) return tNoMot;
    return "SIN TIPO REGISTRADO";
}

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

function autocompletarStatus(tipo) {
    let placaInput = normalizeStr(document.getElementById('sf_' + tipo).value);
    let fieldCli = document.getElementById('sf_cliente_' + tipo);

    if (!placaInput) {
        fieldCli.value = '';
        return;
    }

    // Extraer cliente desde placas globales
    let matchPlaca = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placaInput);
    fieldCli.value = matchPlaca ? (matchPlaca[1] || 'Sin Cliente') : 'No Registrada';
}

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
    let fila = dataGlobalStatusFlota.find(f => f[0] === id);
    if (!fila) return;

    document.getElementById('formStatusFlota').reset();
    document.getElementById('sf_id').value = fila[0];
    document.getElementById('sf_fecha').value = fila[1];

    let corte = fila[2];
    if (corte) document.getElementById('corte' + corte).checked = true;

    document.getElementById('sf_motora').value = fila[3] || '';
    document.getElementById('sf_nomotora').value = fila[4] || '';
    document.getElementById('sf_cliente_motora').value = fila[5] || '';
    document.getElementById('sf_cliente_nomotora').value = fila[6] || '';
    document.getElementById('sf_zona').value = fila[7] || '';
    document.getElementById('sf_conductor').value = fila[8] || '';
    document.getElementById('sf_estado').value = fila[9] || '';
    document.getElementById('sf_obs').value = fila[10] || '';

    // Disparar los colores de días
    autocompletarStatus('motora');
    autocompletarStatus('nomotora');

    const btn = document.getElementById('btnGuardarSF');
    btn.innerHTML = '<i class="bi bi-pencil-square"></i> Actualizar';
    btn.classList.replace('btn-primary', 'btn-warning');
    btn.classList.add('text-dark');

    new bootstrap.Modal(document.getElementById('modalStatusFlota')).show();
}


function generarPDFStatusFlota() {
    const btn = event.currentTarget;
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Generando...';
    btn.classList.add('disabled');

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
                    htmlCuerpo += `<tr><td colspan="6" style="background-color: #cbd5e1; font-weight: bold; padding: 10px 15px; color:#1e293b; text-align:left; font-size: 14px;">${txtTipo.innerText}</td></tr>`;
                }
            } else if (row.classList.contains('child-row-sf')) {
                let celdas = row.querySelectorAll('td');
                htmlCuerpo += `<tr>
                    <td style="padding: 8px 15px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #2563eb;">${celdas[0]?.innerText || ''}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">${celdas[2]?.innerText || ''}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${celdas[4]?.innerText || ''}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${celdas[5]?.innerText || ''}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${celdas[6]?.innerText || ''}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">${celdas[7]?.innerText || ''}</td>
                </tr>`;
            }
        }
    });

    if (!htmlCuerpo) htmlCuerpo = '<tr><td colspan="6" class="text-center py-4">No hay datos en la pantalla para exportar.</td></tr>';

    document.getElementById('pdf-sf-body').innerHTML = htmlCuerpo;

    // Inyectar el título con Fecha y Corte
    document.querySelector('#pdf-status-flota p').innerHTML = `Reporte de Status de Flota <br> <b>Fecha:</b> ${fechaBonita} | <b>Turno:</b> ${textoCorte}`;
    document.getElementById('pdf-sf-fecha-gen').innerText = new Date().toLocaleDateString('es-PE');

    const elemento = document.getElementById('pdf-status-flota');
    document.getElementById('contenedor-pdf-status-flota').style.display = 'block';

    let nombreArchivo = `Status_Flota_${textoCorte.replace(/ /g, '_')}_${fechaRaw}.pdf`;

    html2pdf().set({
        margin: 10, filename: nombreArchivo, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(elemento).save().then(() => {
        document.getElementById('contenedor-pdf-status-flota').style.display = 'none';
        btn.innerHTML = txtOriginal;
        btn.classList.remove('disabled');
    });
}

// ==========================================
// 🔥 GUARDADO DEL WIZARD DE INSPECCIONES 🔥
// ==========================================

function procesarGuardadoInspeccion() {
    const btn = document.getElementById('btnWizGuardar');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    let idInsp = document.getElementById('i_id_inspeccion').value || "INSP-" + Date.now();
    let fecha = document.getElementById('i_fecha').value;
    let placa = document.getElementById('i_placa').value.toUpperCase();
    let km = document.getElementById('i_kmtablero').value;
    let cliente = document.getElementById('i_cliente').value;
    let tecnico = document.getElementById('i_tecnico').value;
    let dias = document.getElementById('i_dias').value || "30";

    if(!placa || !tecnico || !km) {
        alert("⚠️ La Placa, el Kilometraje y el Técnico son obligatorios.");
        btn.disabled = false;
        btn.innerHTML = 'Guardar Registro';
        return;
    }

    // 1. Recolectar TODAS las respuestas dinámicas del Wizard
    let detalles = [];
    WIZARD_SCHEMA.forEach((sec, i) => {
        if(sec.items) {
            sec.items.forEach((item, j) => {
                let lbl = typeof item === 'string' ? item : item.label;
                let t = typeof item === 'string' ? 'okfalla' : item.type;
                let uid = `p_${i}_${j}`;
                let estado = "SIN DATOS";
                let obs = "";

                if(t === 'okfalla') {
                    let ok = document.getElementById(`${uid}_ok`);
                    let fa = document.getElementById(`${uid}_fa`);
                    if(ok && ok.dataset.chk === '1') estado = "OK";
                    if(fa && fa.dataset.chk === '1') {
                        estado = "FALLA";
                        obs = document.getElementById(`obs_${uid}`).value;
                    }
                } else if (t === 'percent') {
                    let val = document.getElementById(`val_${uid}`);
                    if(val && val.value) estado = val.value + "%";
                } else if (t === 'text') {
                    let txt = document.getElementById(`txt_${uid}`);
                    if(txt && txt.value) {
                        estado = "REGISTRADO";
                        obs = txt.value;
                    }
                }
                detalles.push({ categoria: sec.tab, item: lbl, estado: estado, observacion: obs });
            });
        }
    });

    // 2. Capturar la Firma Dibujada en Base64
    let firmaData = "";
    if(canvasFirma && ctxFirma) {
        firmaData = canvasFirma.toDataURL("image/png");
    }

    // 3. Empaquetar todo el JSON
    let datos = {
        form: {
            id: idInsp,
            fecha_ingreso: fecha,
            placa: placa,
            km_tablero: km,
            cliente: cliente,
            tecnico: tecnico,
            dias_propuestos: dias,
            detalles_json: JSON.stringify(detalles),
            firma_base64: firmaData,
            usuarioAutor: usuarioLogueado
        }
    };

    // 4. Enviar al Servidor Node.js
    fetch('/api/script/guardarInspeccion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
    })
    .then(res => res.json())
    .then(r => {
        if(r.data === 'Éxito') {
            bootstrap.Modal.getInstance(document.getElementById('modalInspeccion')).hide();
            recargarModulo('statusMant'); // Recarga la tabla para mostrar la nueva inspección
        } else {
            alert("Error: " + r.data);
        }
        btn.disabled = false;
        btn.innerHTML = 'Guardar Registro';
    })
    .catch(e => {
        alert("Error de red: " + e.message);
        btn.disabled = false;
        btn.innerHTML = 'Guardar Registro';
    });
}

// ============================================================
// AYUDANTES VISUALES DEL WIZARD (OK/FALLA y Porcentajes)
// ============================================================

function toggleFalla(cajaId, isFalla) {
    let el = document.getElementById(cajaId);
    if(el) {
        el.style.display = isFalla ? 'block' : 'none';
        if(!isFalla) {
            let obsId = cajaId.replace('f_', 'obs_');
            let obsEl = document.getElementById(obsId);
            if(obsEl) obsEl.value = ''; // Limpia obs si cambia a OK
        }
    }
}

function seleccionarPorcentaje(uid, pct, btn) {
    document.getElementById(`val_${uid}`).value = pct;
    document.querySelectorAll(`.pct-${uid}`).forEach(b => {
        b.classList.remove('btn-primary', 'text-white');
        b.classList.add('btn-outline-primary');
    });
    btn.classList.remove('btn-outline-primary');
    btn.classList.add('btn-primary', 'text-white');
}

// ==========================================
// 📱 LÓGICA UX MÓVIL: BOTÓN ACCIONES (FAB)
// ==========================================

function toggleFabMenu() {
    if (window.innerWidth > 768) return;
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

    // Radar Extremo: Busca el ÚLTIMO contenedor de herramientas, donde siempre están los botones
    const divBotonesAll = moduloActual.querySelectorAll('.controls-row .d-flex.align-items-center.gap-2');
    const divBotones = divBotonesAll[divBotonesAll.length - 1];

    if (!divBotones) return;

    // Solo clona botones y medidores de caché
    const buttons = divBotones.querySelectorAll('button, .cache-badge');

    if (buttons.length === 0) {
        listContent.innerHTML = '<div class="text-center p-3 text-muted" style="font-size:0.8rem;">Sin acciones</div>';
        return;
    }

    buttons.forEach(btn => {
        // 🛡️ FILTRO ESTRICTO: Si el botón original está oculto, NO lo clonamos
        if (btn.style.display === 'none' || window.getComputedStyle(btn).display === 'none') return;

        let clonedBtn = btn.cloneNode(true);
        clonedBtn.removeAttribute('id');
        clonedBtn.className = 'fab-action-item';

        // Mantener los colores de los íconos (Excel Verde, PDF Rojo, etc)
        const originalClasses = btn.className;
        const icon = clonedBtn.querySelector('i');

        if (icon) {
            if (originalClasses.includes('success')) icon.classList.add('text-success');
            else if (originalClasses.includes('info')) icon.classList.add('text-info');
            else if (originalClasses.includes('warning') || originalClasses.includes('text-warning')) icon.classList.add('text-warning');
            else if (originalClasses.includes('danger')) icon.classList.add('text-danger');
            else if (originalClasses.includes('primary')) icon.classList.add('text-primary');
        }

        // Si es el texto de "Caché", lo dejamos como informativo (no clickeable)
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
                        <button class="btn btn-sm btn-outline-info w-100 fw-bold" onclick="cerrarSpotlight(); cambiarModulo('statusMant'); setTimeout(() => { document.getElementById('buscadorStatus').value='${p[0]}'; filtrarStatusAvanzado(); }, 300);"><i class="bi bi-activity"></i> Insp.</button>
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

