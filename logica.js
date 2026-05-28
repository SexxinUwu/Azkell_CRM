
// ============================================================
// 🌉 PUENTE MÁGICO: EMULADOR DE GOOGLE APPS SCRIPT PARA NODE.JS
// ============================================================

// Mapa de métodos de lectura a stores IDB (para offline cache)
const IDB_READ_STORES = {
    obtenerDatosPlacas: 'placas',
    obtenerDatosFleetrun: 'fleetrun',
    obtenerDatosInspecciones: 'inspecciones',
    obtenerDatosConductores: 'conductores',
};

class GoogleRunner {
    constructor() {
        this.successCb = null;
        this.failureCb = null;
        this.proxyRef = null;
    }
    withSuccessHandler(cb) { this.successCb = cb; return this.proxyRef; }
    withFailureHandler(cb) { this.failureCb = cb; return this.proxyRef; }
    async _call(method, ...args) {
        const idbStore = IDB_READ_STORES[method];
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
                body: JSON.stringify({ args: parsedArgs, usuario: localStorage.getItem('fleet_correo') || 'sistema' })
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
            // 💾 Guardar en IDB si es un método de lectura con datos válidos
            if (idbStore && window.FleetDB && Array.isArray(json.data) && json.data.length > 0) {
                window.FleetDB.save(idbStore, json.data);
            }
        } catch (e) {
            // 📴 Fallback offline: intentar cargar desde IDB
            if (idbStore && window.FleetDB && this.successCb) {
                var _successCb = this.successCb;
                var _failureCb = this.failureCb;
                window.FleetDB.load(idbStore).then(function(record) {
                    if (record && record.data && record.data.length > 0) {
                        if (typeof window.mostrarOfflineBadge === 'function') {
                            var ts = new Date(record.ts);
                            var hora = ts.getHours().toString().padStart(2,'0') + ':' + ts.getMinutes().toString().padStart(2,'0');
                            window.mostrarOfflineBadge(idbStore, hora);
                        }
                        _successCb(record.data);
                    } else {
                        if (_failureCb) _failureCb(e); else console.error('Error BD:', e);
                    }
                }).catch(function() { if (_failureCb) _failureCb(e); else console.error('Error BD:', e); });
            } else {
                if (this.failureCb) this.failureCb(e); else console.error("Error BD:", e);
            }
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
window.dataGlobalPlacas = window.dataGlobalPlacas || [];
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
    const guardadoToken    = localStorage.getItem('fleet_token');

    if (!guardadoUser || !guardadoTime || !guardadoToken || Date.now() - parseInt(guardadoTime) >= TIEMPO_INACTIVIDAD) {
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

    // Avatar generado con iniciales en el topbar
    var avatarTopWrap = document.getElementById('topbar-avatar-icon');
    if (avatarTopWrap && typeof window.generarAvatar === 'function') {
        avatarTopWrap.outerHTML = window.generarAvatar(usuarioLogueado, 32).replace('class="user-avatar"','class="user-avatar" id="topbar-avatar-icon"');
    }
    // Avatar grande en dropdown de perfil
    var avatarDrop = document.getElementById('perfil-avatar-dropdown');
    if (avatarDrop && typeof window.generarAvatar === 'function') {
        avatarDrop.innerHTML = window.generarAvatar(usuarioLogueado, 68).replace(
            'border-radius:' + Math.round(68/3) + 'px',
            'border-radius:50%;width:100%;height:100%'
        );
    }

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
    const safe = (id, show) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (show) { el.style.removeProperty('display'); }
        else { el.style.setProperty('display', 'none', 'important'); }
    };
    const sec = (wrapId, collapseId, show) => {
        const w = document.getElementById(wrapId);
        const c = collapseId ? document.getElementById(collapseId) : null;
        if (w) { if (show) { w.style.removeProperty('display'); } else { w.style.setProperty('display', 'none', 'important'); } }
        if (c) { if (show) c.style.removeProperty('display'); else { c.classList.remove('show'); c.style.setProperty('display', 'none', 'important'); } }
    };

    // ── VISIBILIDAD DEL MENÚ (nivel Google/Microsoft) ─────────────────
    // Regla: cada nav-item se oculta si checkPerm(key,'l') === false.
    // La sección entera se oculta si NINGÚN ítem de ella es visible.

    var _cL = function(key) { return isAdm || window.checkPerm(key, 'l'); };

    // MANTENIMIENTO — ítems individuales
    var vInsp    = _cL('insp');
    var vPlacas  = _cL('placas');
    var vFleet   = _cL('fleet');
    var vPlan    = _cL('plan');
    var vOT      = _cL('ot');
    var vCfgMant = _cL('cfg_mant');

    safe('nav-inspecciones',    vInsp);
    safe('nav-placas',          vPlacas);
    safe('nav-fleetrun',        vFleet);
    safe('nav-status-rampa',    vOT);
    safe('nav-reportes-ot',     vOT);
    safe('nav-trabajos-ot',     vOT);
    safe('nav-otros-mant',      vOT || vPlan);
    safe('nav-ordenes',         vOT);
    // planificacion/backlog/kpis/productividad/finanzas están ocultos del sidebar
    // (accesibles vía hub Otros) — no llamar safe() sobre ellos


    var showMant = vInsp || vPlacas || vFleet || vPlan || vOT;
    safe('wrap-mantenimiento', showMant);

    // ALMACÉN — ítems individuales
    var vInv     = _cL('inv');
    var vEnt     = _cL('ent_inv');
    var vSal     = _cL('sal_inv');
    var vProv    = _cL('prov_inv');
    var vKardex  = _cL('kardex');
    var vCostos  = _cL('costos_inv');
    var vCfgAlm  = _cL('cfg_almacen');

    safe('nav-inventario',      vInv);
    safe('nav-entradas-inv',    vEnt);
    safe('nav-salidas-inv',     vSal);
    safe('nav-proveedores-inv', vProv);
    safe('nav-kardex',          vKardex);
    safe('nav-costos-inv',      vCostos);

    var showAlm = vInv || vEnt || vSal || vProv || vKardex || vCostos;
    safe('wrap-almacen', showAlm);

    // PREFERENCIAS — Config. Preventivos + Config. Taller + Config. Almacén (admin-only por defecto)
    safe('nav-configuracion-mp', vCfgMant);
    safe('nav-kits-mp',          vCfgMant);
    safe('nav-tipos-mp',         vCfgMant);
    safe('nav-config-metrica',   vCfgMant);
    safe('nav-situaciones',      vCfgMant || vCfgAlm || isAdm);
    safe('nav-familias-inv',     vCfgAlm);
    safe('nav-unidades-inv',     vCfgAlm);
    safe('nav-sistemas-inv',     vCfgAlm);
    safe('nav-marcas-inv',       vCfgAlm);

    // ADMINISTRACIÓN — hub visible si tiene algún permiso de configuración
    var showAdm = vCfgMant || vCfgAlm || isAdm;
    safe('wrap-administracion', showAdm);
    safe('nav-administracion',  showAdm);

    // Sub-labels de Preferencias
    var elSubCfgPrev   = document.getElementById('nav-sub-cfg-prev');
    var elSubCfgTaller = document.getElementById('nav-sub-cfg-taller');
    var elSubCfgAlm    = document.getElementById('nav-sub-cfg-alm');
    if (elSubCfgPrev)   elSubCfgPrev.style.display   = vCfgMant ? '' : 'none';
    if (elSubCfgTaller) elSubCfgTaller.style.display  = (vCfgMant || vCfgAlm || isAdm) ? '' : 'none';
    if (elSubCfgAlm)    elSubCfgAlm.style.display     = vCfgAlm  ? '' : 'none';

    var showPref = vCfgMant || vCfgAlm || isAdm;
    safe('wrap-preferencias', showPref);

    // FLOTA — ítems individuales
    var vGps    = _cL('gps');
    var vStatus = _cL('status');
    var vCond   = _cL('cond');

    safe('nav-ubicacion',    vGps);
    safe('nav-status-flota', vStatus);
    safe('nav-conductores',  vCond);
    safe('nav-talleres',     false); // no implementado aún

    var showFlota = vGps || vStatus || vCond;
    safe('wrap-flota', showFlota);
    safe('wrap-directorio', vCond);

    // SISTEMA — solo admin ve usuarios; auditoria puede tener permiso propio
    var vSeg   = isAdm;
    var vAudit = isAdm || window.checkPerm('mod_auditoria', 'l');

    safe('nav-usuarios',  vSeg);
    safe('nav-auditoria', vAudit);
    safe('wrap-usuarios',  vSeg);
    safe('wrap-auditoria', vAudit);
    // ─────────────────────────────────────────────────────────────────

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

    // --- Iniciar sincronización SSE en tiempo real ---
    if (typeof window.initSSE === 'function') window.initSSE();
    fetch('/api/script/obtenerDatosPlacas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
        .then(r => r.json()).then(r => {
            let d = r.data || [];
            dataGlobalPlacas = d; window.dataGlobalPlacas = d; CACHE['placas'] = d; CACHE_TIME['placas'] = Date.now();
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
        });
    fetch('/api/script/obtenerTiposMantenimiento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) }).then(r => r.json()).then(r => { dataTiposMant = r.data || []; });
    fetch('/api/script/obtenerTPMP', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) }).then(r => r.json()).then(r => { rellenarDatalist('dl-tpmp', new Set(r.data || [])); });

    // Precarga Fleetrun: llenar window.dataGlobalFleetrun y disparar re-render si el usuario ya está en ese módulo
    fetch('/api/script/obtenerDatosFleetrun', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
        .then(r => r.json()).then(r => {
        let d = r.data || [];
        window.dataGlobalFleetrun = d;
        dataGlobalFleetrun = d;
        if (localStorage.getItem('fleet_rutaActual') === 'mantenimiento/fleetrun') {
            if (typeof window.init_fleetrun === 'function') window.init_fleetrun();
        }
    });
}

// ══════════════════════════════════════════════════════════════════
// SCANNER GLOBAL — html5-qrcode (ZXing) + UI propia full-screen
// Uso: window._abrirEscaner(callback, titulo)
// ══════════════════════════════════════════════════════════════════
window._gscannerInstance = window._gscannerInstance || null;
window._gscannerCB       = window._gscannerCB       || null;
window._gscannerTorch    = window._gscannerTorch    || false;

window._abrirEscaner = function(callback, titulo) {
    window._gscannerCB = callback;
    var overlay = document.getElementById('gscanner-overlay');
    if (!overlay) { console.warn('Scanner overlay no encontrado'); return; }

    var tit = document.getElementById('gscanner-titulo');
    if (tit) tit.textContent = titulo || 'Escanear código';

    // Detener instancia previa
    if (window._gscannerInstance) {
        try { window._gscannerInstance.stop().catch(function(){}); } catch(e) {}
        window._gscannerInstance = null;
    }
    var reader = document.getElementById('gscanner-reader');
    if (reader) reader.innerHTML = '';

    // Mostrar overlay — fondo negro es normal mientras arranca la cámara
    overlay.style.display = 'block';
    window._gscannerTorch = false;
    var torchBtn = document.getElementById('gscanner-torch-btn');
    if (torchBtn) torchBtn.style.background = 'rgba(0,0,0,.45)';

    if (typeof Html5Qrcode === 'undefined') {
        overlay.style.display = 'none';
        alert('Scanner no disponible — recarga la página.');
        return;
    }

    try {
        // Especificar todos los formatos de código de barras + QR para máxima compatibilidad
        var formats = [];
        if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
            formats = [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.CODE_93,
                Html5QrcodeSupportedFormats.CODABAR,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.ITF,
                Html5QrcodeSupportedFormats.PDF_417,
                Html5QrcodeSupportedFormats.DATA_MATRIX
            ];
        }
        var initCfg = formats.length ? { formatsToSupport: formats } : {};
        window._gscannerInstance = new Html5Qrcode('gscanner-reader', initCfg);

        window._gscannerInstance.start(
            { facingMode: 'environment' },
            {
                fps: 25,
                qrbox: function(w, h) {
                    return { width: Math.round(w * 0.85), height: Math.round(h * 0.72) };
                },
                videoConstraints: {
                    facingMode: { ideal: 'environment' },
                    width:      { ideal: 1920 },
                    height:     { ideal: 1080 }
                },
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: false
            },
            function(decodedText) {
                var cb = window._gscannerCB;   // guardar ANTES de cerrar
                window._cerrarEscaner();
                if (typeof cb === 'function') cb(decodedText.trim());
            },
            function() { /* frame sin código — ignorar */ }
        )
        .catch(function(err) {
            overlay.style.display = 'none';
            alert('No se pudo acceder a la cámara: ' + (err.message || err));
        });

    } catch(e) {
        overlay.style.display = 'none';
        console.error('Scanner error:', e);
    }
};

window._gscannerToggleTorch = function() {
    if (!window._gscannerInstance) return;
    window._gscannerTorch = !window._gscannerTorch;
    try {
        var track = window._gscannerInstance.getRunningTrack();
        if (track && track.getCapabilities && track.getCapabilities().torch) {
            track.applyConstraints({ advanced: [{ torch: window._gscannerTorch }] });
        }
    } catch(e) {}
    var btn = document.getElementById('gscanner-torch-btn');
    if (btn) btn.style.background = window._gscannerTorch
        ? 'rgba(253,224,71,.55)'
        : 'rgba(0,0,0,.45)';
};

window._cerrarEscaner = function() {
    var overlay = document.getElementById('gscanner-overlay');
    if (overlay) overlay.style.display = 'none';
    if (window._gscannerInstance) {
        window._gscannerInstance.stop().catch(function() {});
        window._gscannerInstance = null;
    }
    window._gscannerCB    = null;
    window._gscannerTorch = false;
    var reader = document.getElementById('gscanner-reader');
    if (reader) reader.innerHTML = '';
    var btn = document.getElementById('gscanner-torch-btn');
    if (btn) btn.style.background = 'rgba(0,0,0,.45)';
};

function cerrarSesion() {
    if (window.cerrarSSE) window.cerrarSSE();
    window._permCache = null; // Invalidar cache de permisos
    localStorage.removeItem('fleet_user'); localStorage.removeItem('fleet_rol'); localStorage.removeItem('fleet_correo'); localStorage.removeItem('fleet_ultimo_acceso'); localStorage.removeItem('fleet_permisos'); localStorage.removeItem('fleet_token');
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

// ================================================================
// 📡 SSE — SINCRONIZACIÓN EN TIEMPO REAL (AppSheet-style)
// ================================================================
window._sse = window._sse || null;

window.initSSE = function() {
    if (window._sse) return;
    window._sse = new EventSource('/api/eventos');

    var CACHE_KEY_MAP = {
        fleetrun: 'fleetrun', placas: 'placas', inspecciones: 'statusMant',
        conductores: 'conductores', status: 'statusFlota', usuarios: 'usuarios'
    };
    var MODULO_RUTA = {
        fleetrun: 'mantenimiento/fleetrun', placas: 'mantenimiento/placas',
        inspecciones: 'mantenimiento/inspecciones', conductores: 'directorio/conductores',
        status: 'flota/status', usuarios: 'sistema/usuarios',
        planificacion: 'mantenimiento/planificacion'
    };

    window._sse.addEventListener('datos-actualizados', function(e) {
        var d; try { d = JSON.parse(e.data); } catch(err) { return; }
        var cacheKey = CACHE_KEY_MAP[d.modulo];
        if (cacheKey) { CACHE[cacheKey] = null; CACHE_TIME[cacheKey] = null; }
        var rutaActual = localStorage.getItem('fleet_rutaActual') || '';
        if (MODULO_RUTA[d.modulo] === rutaActual) {
            setTimeout(function() { recargarModulo(d.modulo); }, 800);
        }
        mostrarToastSSE(d.modulo);
    });
    // onerror: EventSource reconecta automáticamente, no se necesita ninguna acción
};

window.cerrarSSE = function() {
    if (window._sse) { window._sse.close(); window._sse = null; }
};

// ================================================================
// 💾 FleetDB — IndexedDB para modo offline
// ================================================================
window.FleetDB = (function() {
    var DB_NAME = 'AzkellFleet', VERSION = 1;
    var STORES = ['placas', 'fleetrun', 'inspecciones', 'conductores', 'wialon'];
    var db = null;

    function open() {
        return new Promise(function(resolve, reject) {
            if (db) { resolve(db); return; }
            if (!window.indexedDB) { reject(new Error('IDB no disponible')); return; }
            var req = indexedDB.open(DB_NAME, VERSION);
            req.onupgradeneeded = function(e) {
                var idb = e.target.result;
                STORES.forEach(function(s) {
                    if (!idb.objectStoreNames.contains(s)) idb.createObjectStore(s, { keyPath: '_ak' });
                });
            };
            req.onsuccess = function(e) { db = e.target.result; resolve(db); };
            req.onerror = function(e) { reject(e.target.error); };
        });
    }

    async function save(store, data) {
        try {
            var idb = await open();
            var tx = idb.transaction([store], 'readwrite');
            tx.objectStore(store).put({ _ak: store, data: data, ts: Date.now() });
        } catch(e) { console.warn('FleetDB.save:', e); }
    }

    async function load(store) {
        try {
            var idb = await open();
            return new Promise(function(resolve) {
                var tx = idb.transaction([store], 'readonly');
                var req = tx.objectStore(store).get(store);
                req.onsuccess = function() { resolve(req.result || null); };
                req.onerror = function() { resolve(null); };
            });
        } catch(e) { return null; }
    }

    async function clear(store) {
        try { var idb = await open(); idb.transaction([store], 'readwrite').objectStore(store).clear(); } catch(e) {}
    }

    // Abrir automáticamente al cargar
    open().catch(function() {});

    return { open: open, save: save, load: load, clear: clear };
})();

window.mostrarOfflineBadge = function(store, hora) {
    var nombres = { placas:'Placas', fleetrun:'Fleetrun', inspecciones:'Inspecciones', conductores:'Personal' };
    var nombre = nombres[store] || store;
    var chip = document.createElement('div');
    chip.style.cssText = 'position:fixed;bottom:80px;right:12px;background:#475569;color:#fff;padding:6px 14px;border-radius:99px;font-size:0.75rem;font-weight:600;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,.3);white-space:nowrap;';
    chip.innerHTML = '<i class="bi bi-wifi-off me-1"></i>Offline · ' + nombre + ' (' + hora + ')';
    document.body.appendChild(chip);
    setTimeout(function() { if (chip.parentNode) chip.remove(); }, 5000);
};

window.mostrarToastSSE = function(modulo) {
    var nombres = { fleetrun:'Fleetrun', placas:'Placas', inspecciones:'Inspecciones',
                    conductores:'Personal', status:'Status Flota', usuarios:'Usuarios' };
    var nombre = nombres[modulo] || modulo;
    var chip = document.createElement('div');
    chip.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--crm-accent);color:#fff;padding:6px 16px;border-radius:99px;font-size:0.78rem;font-weight:600;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,.25);opacity:0;transition:opacity .3s,transform .3s;pointer-events:none;white-space:nowrap;';
    chip.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>' + nombre + ' actualizado';
    document.body.appendChild(chip);
    requestAnimationFrame(function() {
        chip.style.opacity = '1';
        chip.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(function() {
        chip.style.opacity = '0'; chip.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(function() { if (chip.parentNode) chip.remove(); }, 350);
    }, 3500);
};

// ================================================================
// 🔔 PWA BADGE — Contador de vencidos en el ícono de la app
// ================================================================
window.actualizarPWABadge = function() {
    if (!('setAppBadge' in navigator)) return;
    var vencFleet = parseInt((document.getElementById('kpi-fleet-vencidos') || {}).textContent) || 0;
    var vencInsp  = parseInt((document.getElementById('kpi-val-vencidas')   || {}).textContent) || 0;
    var total = vencFleet + vencInsp;
    if (total > 0) navigator.setAppBadge(total).catch(function(){});
    else           navigator.clearAppBadge().catch(function(){});
};

// ================================================================
// 💊 SCORE DE SALUD DE FLOTA (0-100)
// ================================================================
window.calcularScoreSalud = function(placa) {
    placa = (placa || '').toUpperCase().trim();
    var score = 100;
    var hoy = new Date(); hoy.setHours(0,0,0,0);

    // --- Inspecciones ---
    var insps = (dataGlobalInspecciones || []).filter(function(i) {
        return normalizeStr(i.placa) === normalizeStr(placa) && i.estado !== 'Eliminada';
    });
    if (!insps.length) {
        score -= 40;
    } else {
        var ultima = insps.sort(function(a,b) {
            return (parseInt((b.id||'').split('-')[1])||0) - (parseInt((a.id||'').split('-')[1])||0);
        })[0];
        var diasRest = null;
        if (ultima.fecha_ingreso) {
            try {
                var fi; if (ultima.fecha_ingreso.includes('/')) { var px = ultima.fecha_ingreso.split('/'); fi = new Date(px[2],px[1]-1,px[0]); } else { fi = new Date(ultima.fecha_ingreso+'T00:00:00'); }
                var fp = new Date(fi.getTime()); fp.setDate(fp.getDate() + (parseInt(ultima.dias_propuestos)||30));
                diasRest = Math.ceil((fp - hoy) / 864e5);
            } catch(e) {}
        }
        if (diasRest === null) score -= 40;
        else if (diasRest < 0) score -= 30;
        else if (diasRest <= 7) score -= 15;
    }

    // --- Fleetrun MPs (toma el peor) ---
    var infoP = (dataGlobalPlacas||[]).find(function(p){ return normalizeStr(p[0])===normalizeStr(placa); });
    var utsP = infoP ? (infoP[19]||'NACIONAL').toUpperCase() : 'NACIONAL';
    var limKm = utsP === 'LOCAL' ? 100 : 1500;
    var recs = (dataGlobalFleetrun||[]).filter(function(r){ return normalizeStr(r[4])===normalizeStr(placa); });
    if (recs.length) {
        var wD = typeof buscarWialonPorPlaca === 'function' ? buscarWialonPorPlaca(placa) : null;
        var minFalta = recs.reduce(function(mn, r) {
            var falta = (parseFloat(r[11])||0) - (wD ? wD.km : (parseFloat(r[14])||0));
            return Math.min(mn, falta);
        }, Infinity);
        if (minFalta <= 0) score -= 30;
        else if (minFalta <= limKm) score -= 20;
    }
    return Math.max(0, Math.min(100, score));
};

window.scoreSaludBadge = function(placa) {
    var s = window.calcularScoreSalud(placa);
    var cls = s >= 75 ? 'success' : (s >= 50 ? 'warning' : 'danger');
    var ico = s >= 75 ? 'bi-heart-fill' : (s >= 50 ? 'bi-heart-half' : 'bi-heart');
    return '<span class="badge bg-'+cls+' ms-1" title="Score de Salud"><i class="bi '+ico+' me-1"></i>'+s+'/100</span>';
};

// ================================================================
// 🔍 OFFCANVAS DETALLE PLACA GLOBAL
// ================================================================
window.abrirDetallePlacaGlobal = function(placa, defaultTab) {
    placa = (placa || '').toUpperCase().trim();
    window._odpPlacaActual = placa;
    var elPlaca  = document.getElementById('odp-placa');
    var elBadges = document.getElementById('odp-badges');
    if (elPlaca) elPlaca.textContent = placa;
    var isFleetView = (defaultTab === 'fleet');

    // Mostrar solo pestaña MP cuando se abre desde Fleetrun
    document.querySelectorAll('#odpTabs .nav-item').forEach(function(li, idx) {
        li.style.display = isFleetView ? (idx === 2 ? '' : 'none') : '';
    });

    var infoP = (dataGlobalPlacas || []).find(function(p) { return normalizeStr(p[0]) === normalizeStr(placa); });

    // Badges de header
    if (elBadges) {
        if (infoP) {
            var estado = infoP[18] || '—';
            var bCls = estado === 'Activa' ? 'success' : 'secondary';
            elBadges.innerHTML = '<span class="badge bg-' + bCls + '">' + estado + '</span>'
                + (infoP[19] ? ' <span class="badge bg-info text-dark">' + infoP[19] + '</span>' : '')
                + (isFleetView ? '' : ' ' + window.scoreSaludBadge(placa));
        } else {
            elBadges.innerHTML = '';
        }
    }

    // --- Tab Info ---
    var infoEl = document.getElementById('odp-tab-info');
    if (infoEl) {
        if (!infoP) {
            infoEl.innerHTML = '<p class="text-muted text-center py-4">Sin datos de placa.</p>';
        } else {
            infoEl.innerHTML = '<table class="table table-sm table-borderless mb-0" style="font-size:0.82rem;"><tbody>'
                + _odpFila('Cliente', infoP[1]) + _odpFila('RUC/DNI', infoP[2])
                + _odpFila('Marca', infoP[3]) + _odpFila('Modelo', infoP[4])
                + _odpFila('Tipo', infoP[5]) + _odpFila('Sub Tipo', infoP[6])
                + _odpFila('Color', infoP[7]) + _odpFila('Año', infoP[13])
                + _odpFila('Combustible', infoP[14]) + _odpFila('N° Motor', infoP[8])
                + _odpFila('N° Caja', infoP[9]) + _odpFila('N° VIN', infoP[11])
                + _odpFila('Config.', infoP[12]) + _odpFila('Llantas', infoP[21])
                + _odpFila('En Uso', infoP[22])
                + '</tbody></table>';
        }
    }

    // --- Tab Inspecciones (últimas 5) ---
    var inspEl = document.getElementById('odp-tab-insp');
    if (inspEl) {
        var insps = (dataGlobalInspecciones || []).filter(function(i) {
            return normalizeStr(i.placa) === normalizeStr(placa);
        }).sort(function(a, b) {
            return (parseInt((b.id || '').split('-')[1]) || 0) - (parseInt((a.id || '').split('-')[1]) || 0);
        }).slice(0, 5);
        if (!insps.length) {
            inspEl.innerHTML = '<p class="text-muted text-center py-4">Sin inspecciones registradas.</p>';
        } else {
            var hoy = new Date(); hoy.setHours(0,0,0,0);
            inspEl.innerHTML = insps.map(function(i, idx) {
                var dias = '—'; var bCl = 'secondary'; var diasLabel = '—';
                if (i.fecha_ingreso) {
                    try {
                        var fi; if (i.fecha_ingreso.includes('/')) { var px = i.fecha_ingreso.split('/'); fi = new Date(px[2],px[1]-1,px[0]); } else { fi = new Date(i.fecha_ingreso + 'T00:00:00'); }
                        var fp = new Date(fi.getTime()); fp.setDate(fp.getDate() + (parseInt(i.dias_propuestos) || 30));
                        dias = Math.ceil((fp - hoy) / 864e5);
                        bCl = dias < 0 ? 'danger' : (dias <= 7 ? 'warning' : 'success');
                        diasLabel = dias < 0 ? 'Vencida' : (dias === 0 ? 'Vence hoy' : 'Faltan '+dias+'d');
                    } catch(e) {}
                }
                var lineH = idx < insps.length - 1 ? '<div style="width:2px;flex-grow:1;background:var(--border);margin-top:3px;min-height:16px;"></div>' : '';
                return '<div class="d-flex gap-2 mb-2" style="font-size:0.8rem;">'
                    + '<div class="d-flex flex-column align-items-center" style="min-width:1.8rem;">'
                    + '<div class="rounded-circle d-flex align-items-center justify-content-center bg-'+bCl+'" style="width:1.6rem;height:1.6rem;flex-shrink:0;">'
                    + '<i class="bi bi-clipboard2-check text-white" style="font-size:0.65rem;"></i></div>'
                    + lineH + '</div>'
                    + '<div class="flex-grow-1 pb-1">'
                    + '<div class="d-flex justify-content-between align-items-center">'
                    + '<span class="fw-bold" style="color:var(--crm-accent);">' + (i.id || '—') + '</span>'
                    + '<span class="badge bg-'+bCl+'" style="font-size:0.65rem;">' + diasLabel + '</span>'
                    + '</div>'
                    + '<div style="color:var(--subtext);font-size:0.75rem;">' + (i.fecha_ingreso || '—') + ' · ' + (i.tecnico || '—') + '</div>'
                    + '</div></div>';
            }).join('');
        }
    }

    // --- Tab Fleetrun (MPs agrupados por tipo, último por tipo, con historial) ---
    var fleetEl = document.getElementById('odp-tab-fleet');
    if (fleetEl) {
        var recs = (dataGlobalFleetrun || []).filter(function(r) {
            return normalizeStr(r[4]) === normalizeStr(placa);
        });
        var utsPlaca = infoP ? (infoP[19] || '') : '';
        window._odpFleetRecs = recs;
        window._odpFleetMode = 'current';
        window._odpFleetUts = utsPlaca;
        window._buildFleetTab('current');
    }

    // --- Tab GPS (solo texto — CLAUDE.md: GPS en Placas SOLO TEXTO) ---
    var gpsEl = document.getElementById('odp-tab-gps');
    if (gpsEl) {
        var wialon = ((CACHE && CACHE.wialon) ? CACHE.wialon : []).find(function(w) {
            return normalizeStr(w.placa) === normalizeStr(placa);
        });
        if (!wialon) {
            gpsEl.innerHTML = '<p class="text-muted text-center py-4"><i class="bi bi-geo-alt-fill me-2"></i>Sin datos GPS para esta placa.</p>';
        } else {
            gpsEl.innerHTML = '<div class="d-flex flex-column">'
                + _odpFila2('Unidad Wialon', wialon.nombre_wialon)
                + _odpFila2('KM Actual', (wialon.km || 0).toLocaleString() + ' km')
                + _odpFila2('Horas Motor', (wialon.horas || 0).toLocaleString() + ' h')
                + _odpFila2('Latitud', wialon.lat ? wialon.lat.toFixed(6) : '—')
                + _odpFila2('Longitud', wialon.lng ? wialon.lng.toFixed(6) : '—')
                + '</div>';
        }
    }

    // Navegar a la pestaña solicitada (o Info por defecto)
    var tabTarget = '#odp-tab-' + (defaultTab || 'info');
    var tabBtn = document.querySelector('#odpTabs [data-bs-target="' + tabTarget + '"]');
    if (tabBtn) bootstrap.Tab.getOrCreateInstance(tabBtn).show();
    var el = document.getElementById('offcanvasDetallePlacaGlobal');
    if (el) bootstrap.Offcanvas.getOrCreateInstance(el).show();
};

function _odpFila(label, val) {
    return '<tr><td class="text-muted fw-semibold" style="width:42%;white-space:nowrap;font-size:0.8rem;">' + label + '</td>'
        + '<td class="fw-bold" style="color:var(--text);font-size:0.8rem;">' + (val || '—') + '</td></tr>';
}
function _odpFila2(label, val) {
    return '<div class="d-flex justify-content-between py-2 px-1" style="border-bottom:1px solid var(--border);font-size:0.82rem;">'
        + '<span class="text-muted fw-semibold">' + label + '</span>'
        + '<span class="fw-bold" style="color:var(--text);">' + (val || '—') + '</span></div>';
}

window._buildFleetTab = function(mode) {
    var fleetEl = document.getElementById('odp-tab-fleet');
    if (!fleetEl) return;
    var recs = window._odpFleetRecs || [];
    var utsPlaca = window._odpFleetUts || '';
    var umbral = normalizeStr(utsPlaca) === 'LOCAL' ? 100 : 1500;
    if (!recs.length) {
        fleetEl.innerHTML = '<p class="text-muted text-center py-4">Sin registros de mantenimiento.</p>';
        return;
    }
    var recsToShow;
    if (mode === 'current') {
        var byTipo = {};
        recs.forEach(function(r) {
            var tipo = (r[8] || '').toUpperCase().trim();
            if (!byTipo[tipo] || parseInt(r[0]) > parseInt(byTipo[tipo][0])) byTipo[tipo] = r;
        });
        recsToShow = Object.values(byTipo);
        recsToShow.sort(function(a, b) {
            var ta = (a[8] || '').toUpperCase().trim();
            var tb = (b[8] || '').toUpperCase().trim();
            var mpa = ta.match(/^MP(\d+)$/); var mpb = tb.match(/^MP(\d+)$/);
            if (mpa && mpb) return parseInt(mpa[1]) - parseInt(mpb[1]);
            if (mpa) return -1; if (mpb) return 1;
            return ta.localeCompare(tb);
        });
    } else {
        recsToShow = recs.slice().sort(function(a, b) { return parseInt(b[0]) - parseInt(a[0]); });
    }
    var html = '<div class="px-2 pt-2 pb-1"><input type="text" class="form-control form-control-sm" placeholder="Buscar tipo de MP..." oninput="var q=this.value.toLowerCase();var fl=document.getElementById(\'odp-tab-fleet\');if(fl)fl.querySelectorAll(\'[data-mp-tipo]\').forEach(function(el){el.hidden=!el.dataset.mpTipo.toLowerCase().includes(q);});"></div>'
        + '<div style="font-size:0.82rem;">';
    recsToShow.forEach(function(r) {
        var kmProx = parseFloat(r[11]) || 0;
        var wD = typeof buscarWialonPorPlaca === 'function' ? buscarWialonPorPlaca(r[4]) : null;
        var kmGps = wD ? wD.km : (parseFloat(r[14]) || 0);
        var falta = kmProx - kmGps;
        var bCl = falta <= 0 ? 'danger' : (falta <= umbral ? 'warning' : 'success');
        var faltaLabel = (falta > 0 ? '+' : '') + falta.toLocaleString() + ' km';
        var fechaMost = typeof parseDateToDDMMYYYY === 'function' ? parseDateToDDMMYYYY(r[3]) : (r[3] || '-');
        var globalIdx = (window._odpFleetRecs || []).indexOf(r);
        html += '<div class="d-flex align-items-center gap-2 py-2 px-1" data-mp-tipo="' + (r[8] || '').replace(/"/g,'') + '" style="border-bottom:1px solid var(--border);cursor:pointer;" onclick="window._showMPDetail(' + globalIdx + ')">'
            + '<div class="rounded-circle d-flex align-items-center justify-content-center bg-' + bCl + '" style="width:2rem;height:2rem;flex-shrink:0;">'
            + '<i class="bi bi-tools text-white" style="font-size:0.7rem;"></i></div>'
            + '<div class="flex-grow-1 min-width-0">'
            + '<div class="fw-bold" style="color:var(--crm-accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (r[8] || '—') + '</div>'
            + (fechaMost !== '-' ? '<div style="color:var(--subtext);font-size:0.72rem;">' + fechaMost + '</div>' : '')
            + '</div>'
            + '<div class="text-end flex-shrink-0">'
            + '<span class="badge bg-' + bCl + '" style="font-size:0.7rem;">' + faltaLabel + '</span>'
            + '<div style="font-size:0.68rem;color:var(--subtext);margin-top:1px;">Próx: ' + kmProx.toLocaleString() + '</div>'
            + '</div>'
            + '<i class="bi bi-chevron-right text-muted flex-shrink-0" style="font-size:0.75rem;"></i>'
            + '</div>';
    });
    var toggleMode = mode === 'current' ? 'all' : 'current';
    var toggleLabel = mode === 'current'
        ? '<i class="bi bi-clock-history me-1"></i>Ver Historial Completo'
        : '<i class="bi bi-arrow-left me-1"></i>← Ver actuales';
    html += '</div><div class="p-2"><button class="btn btn-outline-secondary btn-sm w-100" onclick="window._toggleFleetTab(\'' + toggleMode + '\')">' + toggleLabel + '</button></div>';
    fleetEl.innerHTML = html;
};

window._toggleFleetTab = function(mode) {
    window._odpFleetMode = mode;
    window._buildFleetTab(mode);
};

window._showMPDetail = function(idx) {
    var r = (window._odpFleetRecs || [])[idx];
    if (!r) return;
    var fleetEl = document.getElementById('odp-tab-fleet');
    if (!fleetEl) return;
    var utsPlaca = window._odpFleetUts || '';
    var umbral = normalizeStr(utsPlaca) === 'LOCAL' ? 100 : 1500;
    var kmProx = parseFloat(r[11]) || 0;
    var wD = typeof buscarWialonPorPlaca === 'function' ? buscarWialonPorPlaca(r[4]) : null;
    var kmGps = wD ? wD.km : (parseFloat(r[14]) || 0);
    var falta = kmProx - kmGps;
    var bCl = falta <= 0 ? 'danger' : (falta <= umbral ? 'warning' : 'success');
    var bLabel = falta <= 0 ? 'Vencido' : (falta <= umbral ? 'Por Vencer' : 'Vigente');
    var fechaMost = typeof parseDateToDDMMYYYY === 'function' ? parseDateToDDMMYYYY(r[3]) : (r[3] || '-');
    fleetEl.innerHTML = '<div style="font-size:0.82rem;">'
        + '<button class="btn btn-link text-decoration-none ps-0 mb-2" style="color:var(--crm-accent);font-size:0.85rem;" onclick="window._buildFleetTab(window._odpFleetMode||\'current\')">'
        + '<i class="bi bi-arrow-left me-1"></i>← Volver a preventivos</button>'
        + '<div class="fw-bold mb-3" style="font-size:1rem;color:var(--text);">'
        + '<span class="badge bg-' + bCl + ' me-2">' + bLabel + '</span>' + (r[8] || '—') + '</div>'
        + '<div class="d-flex flex-column">'
        + _odpFila2('ID Mantenimiento', '#' + (r[0] || '—'))
        + _odpFila2('Fecha Registro', fechaMost)
        + _odpFila2('KM de Registro', (parseFloat(r[2]) || 0).toLocaleString() + ' km')
        + _odpFila2('Frecuencia', r[10] ? (parseFloat(r[10]).toLocaleString() + ' km') : '—')
        + _odpFila2('KM Próximo', kmProx.toLocaleString() + ' km')
        + _odpFila2('KM GPS Actual', kmGps.toLocaleString() + ' km')
        + _odpFila2('Falta / Exceso', (falta > 0 ? '+' : '') + falta.toLocaleString() + ' km')
        + _odpFila2('Técnico', r[13] || '—')
        + '</div></div>';
};

window.compartirPlacaWhatsApp = function() {
    var placa = window._odpPlacaActual || '';
    var infoP = (dataGlobalPlacas || []).find(function(p) { return (p[0] || '').toUpperCase() === placa; });
    var lineas = ['*Ficha Vehículo — Azkell Fleet*', '━━━━━━━━━━━━━━━━━━━━'];
    if (infoP) {
        lineas.push('🚛 *Placa:* ' + placa);
        if (infoP[1]) lineas.push('👤 *Cliente:* ' + infoP[1]);
        if (infoP[3]) lineas.push('🔧 *Marca:* ' + infoP[3]);
        if (infoP[4]) lineas.push('📋 *Modelo:* ' + infoP[4]);
        if (infoP[5]) lineas.push('🚌 *Tipo:* ' + infoP[5]);
        if (infoP[18]) lineas.push('🟢 *Estado:* ' + infoP[18]);
    } else {
        lineas.push('🚛 *Placa:* ' + (placa || 'Sin datos'));
    }
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(lineas.join('\n')), '_blank');
};

window.toggleModoRevisor = function() {
    var activo = document.body.classList.toggle('modo-revisor');
    localStorage.setItem('fleet_modoRevisor', activo ? '1' : '0');
    var btn = document.getElementById('btn-modo-revisor');
    if (btn) {
        btn.style.color = activo ? 'var(--bs-warning)' : 'var(--subtext)';
        btn.title = activo ? 'Modo Revisor ACTIVO — clic para desactivar' : 'Modo Revisor — oculta botones de edición';
    }
};
// Restaurar Modo Revisor al cargar
(function() {
    if (localStorage.getItem('fleet_modoRevisor') === '1') {
        document.body.classList.add('modo-revisor');
        var btn = document.getElementById('btn-modo-revisor');
        if (btn) { btn.style.color = 'var(--bs-warning)'; btn.title = 'Modo Revisor ACTIVO — clic para desactivar'; }
    }
})();

// ── PWA Notificaciones push ──────────────────────────────────────
window.verificarNotificacionesPWA = function() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') return;
    var insps = window.dataGlobalInspecciones || [];
    if (!insps.length) return;
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var todayStr = hoy.toISOString().slice(0, 10);
    if (localStorage.getItem('fleet_lastNotif') === todayStr) return;
    var vencidas = new Set(), porVencer = new Set();
    insps.forEach(function(i) {
        if (!i.fecha_ingreso) return;
        try {
            var fi = i.fecha_ingreso.includes('/') ? (function(){var px=i.fecha_ingreso.split('/');return new Date(px[2],px[1]-1,px[0]);})() : new Date(i.fecha_ingreso+'T00:00:00');
            var fp = new Date(fi); fp.setDate(fp.getDate()+(parseInt(i.dias_propuestos)||30));
            var dias = Math.ceil((fp-hoy)/864e5);
            if (dias < 0) vencidas.add(i.placa);
            else if (dias <= 7) porVencer.add(i.placa);
        } catch(e) {}
    });
    if (!vencidas.size && !porVencer.size) return;
    var body = '';
    if (vencidas.size) body += vencidas.size + ' placa(s) con inspección vencida. ';
    if (porVencer.size) body += porVencer.size + ' placa(s) por vencer en 7 días.';
    function _enviar() {
        new Notification('Azkell Fleet — Alertas', { body: body, icon: '/icons/icon-192.png' });
        localStorage.setItem('fleet_lastNotif', todayStr);
    }
    if (Notification.permission === 'granted') { _enviar(); }
    else { Notification.requestPermission().then(function(p){ if(p==='granted') _enviar(); }); }
};
// Programar chequeo a los 8 segundos de cargar (espera que cargue dataGlobalInspecciones)
setTimeout(function(){ if(typeof window.verificarNotificacionesPWA==='function') window.verificarNotificacionesPWA(); }, 8000);

// ================================================================
// 🔒 RBAC — Helpers de permisos (usados por todos los módulos)
// ================================================================
window._permCache = null; // Se invalida en login/logout

window.checkPerm = function(modKey, action) {
    try {
        if (!window._permCache) {
            window._permCache = JSON.parse(localStorage.getItem('fleet_permisos') || '{}');
        }
        var p = window._permCache;
        if (p.admin === true) return true;
        var m = p[modKey];
        if (m === undefined || m === null) return false;
        if (typeof m === 'boolean') return action === 'l' ? m : false;
        if (action === 'l') return m.l === 1 || m.l === true;
        return m[action] === 1 || m[action] === true;
    } catch(e) { return false; }
};

window.showNoPermMsg = function(containerIdOrEl) {
    var el = typeof containerIdOrEl === 'string' ? document.getElementById(containerIdOrEl) : containerIdOrEl;
    if (!el) return;
    el.innerHTML = '<div class="text-center py-5" style="color:var(--subtext);">'
        + '<i class="bi bi-shield-lock-fill fs-1 d-block mb-3" style="color:#f59e0b;"></i>'
        + '<div class="fw-bold mb-1" style="color:var(--text);">Acceso Restringido</div>'
        + '<div class="small">No cuentas con los permisos necesarios.<br>Contáctate con el administrador.</div>'
        + '</div>';
};

window.guardAction = function(modKey, action) {
    if (!window.checkPerm(modKey, action)) {
        var modal = document.getElementById('modalNoPermiso');
        if (modal) { (bootstrap.Modal.getInstance(modal)||new bootstrap.Modal(modal)).show(); }
        else { alert('No cuentas con los permisos necesarios. Contáctate con el administrador.'); }
        return false;
    }
    return true;
};

// Oculta botones/elementos sin permiso en el módulo activo
window.enforceModuleUI = function(modKey) {
    var pL = window.checkPerm(modKey,'l');
    var pC = window.checkPerm(modKey,'c');
    var pE = window.checkPerm(modKey,'e');
    var pD = window.checkPerm(modKey,'d');
    document.querySelectorAll('[data-perm-c]').forEach(function(el){ if(el.dataset.permC===modKey){ el.style.display=pC?'':'none'; } });
    document.querySelectorAll('[data-perm-e]').forEach(function(el){ if(el.dataset.permE===modKey){ el.style.display=pE?'':'none'; } });
    document.querySelectorAll('[data-perm-d]').forEach(function(el){ if(el.dataset.permD===modKey){ el.style.display=pD?'':'none'; } });
};

// ── PDF Ficha Individual de Placa ────────────────────────────────
window.exportarFichaPlacaPDF = function(placaArg) {
    var placa = (placaArg || (document.getElementById('det-placa-titulo')||{}).innerText || window._odpPlacaActual || '').toString().toUpperCase().trim();
    if (!placa) return;
    var p = (window.dataGlobalPlacas||[]).find(function(x){ return (x[0]||'').toUpperCase()===placa; });
    if (!p) { alert('Sin datos de placa para exportar.'); return; }
    var insps = (window.dataGlobalInspecciones||[]).filter(function(i){ return normalizeStr(i.placa)===placa; }).slice(0,8);
    var mps   = (window.dataGlobalFleetrun||[]).filter(function(r){ return normalizeStr(r[4])===placa; });
    function r2(a,b,c,d){ return '<tr><td style="color:#64748b;font-size:0.78rem;padding:3px 8px;width:25%">'+(a||'')+'</td><td style="font-weight:600;padding:3px 8px;width:25%">'+(b||'—')+'</td><td style="color:#64748b;font-size:0.78rem;padding:3px 8px;width:25%">'+(c||'')+'</td><td style="font-weight:600;padding:3px 8px;width:25%">'+(d||'—')+'</td></tr>'; }
    function sec(title,rows){ return '<div style="margin-bottom:12px"><div style="font-weight:700;color:#2D438A;font-size:0.82rem;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #2D438A;padding-bottom:3px;margin-bottom:5px">'+title+'</div><table style="width:100%;border-collapse:collapse;">'+rows+'</table></div>'; }
    var html='<div style="font-family:Arial,sans-serif;padding:18px;font-size:0.82rem;">'
        +'<div style="background:#2D438A;color:#fff;padding:14px 18px;border-radius:8px;margin-bottom:14px;">'
        +'<div style="font-size:2rem;font-weight:700;letter-spacing:3px;">'+placa+'</div>'
        +'<div style="margin-top:4px;opacity:.9">'+(p[1]||'Sin cliente')+(p[2]?' · RUC: '+p[2]:'')+'</div>'
        +'<div style="margin-top:6px"><span style="background:'+(p[18]==='Activa'?'#22c55e':'#ef4444')+';padding:2px 10px;border-radius:4px;font-size:0.82rem">'+(p[18]||'—')+'</span>'+(p[19]?' <span style="background:#06b6d4;padding:2px 10px;border-radius:4px;font-size:0.82rem">'+p[19]+'</span>':'')+'</div>'
        +'</div>';
    html+=sec('Especificaciones Técnicas',r2('Marca',p[3],'Modelo',p[4])+r2('Tipo',p[5],'Sub Tipo',p[6])+r2('Color',p[7],'Configuración',p[12])+r2('Año',p[13],'Combustible',p[14]));
    html+=sec('Datos de Identificación',r2('Nº Motor',p[8],'Nº Caja',p[9])+r2('Nº Corona',p[10],'Nº VIN',p[11]));
    html+=sec('Capacidades y Operatividad',r2('Carga Útil',p[15],'Peso Neto',p[16])+r2('Peso Bruto',p[17],'Llantas',p[21])+r2('Zona UTS',p[19],'En Uso',p[22]));
    if (insps.length) {
        var hoy=new Date(); hoy.setHours(0,0,0,0);
        html+='<div style="margin-bottom:12px"><div style="font-weight:700;color:#2D438A;font-size:0.82rem;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #2D438A;padding-bottom:3px;margin-bottom:5px">Últimas Inspecciones</div><table style="width:100%;border-collapse:collapse;font-size:0.78rem"><tr style="background:#f1f5f9;font-weight:700"><td style="padding:4px 8px">ID</td><td style="padding:4px 8px">Fecha</td><td style="padding:4px 8px">Técnico</td><td style="padding:4px 8px">Estado</td></tr>'
        +insps.map(function(i){
            var est='—', cls='#64748b';
            if(i.fecha_ingreso){ try{ var fi=i.fecha_ingreso.includes('/')?(function(){var px=i.fecha_ingreso.split('/');return new Date(px[2],px[1]-1,px[0]);})():new Date(i.fecha_ingreso+'T00:00:00'); var fp=new Date(fi);fp.setDate(fp.getDate()+(parseInt(i.dias_propuestos)||30)); var d=Math.ceil((fp-hoy)/864e5); est=d<0?'Vencida':(d<=7?'Por vencer':'Vigente'); cls=d<0?'#ef4444':(d<=7?'#f59e0b':'#22c55e'); }catch(e){} }
            return '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:3px 8px">'+(i.id||'—')+'</td><td style="padding:3px 8px">'+(i.fecha_ingreso||'—')+'</td><td style="padding:3px 8px">'+(i.tecnico||'—')+'</td><td style="padding:3px 8px;color:'+cls+';font-weight:700">'+est+'</td></tr>';
        }).join('')+'</table></div>';
    }
    if (mps.length) {
        html+='<div style="margin-bottom:12px"><div style="font-weight:700;color:#2D438A;font-size:0.82rem;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #2D438A;padding-bottom:3px;margin-bottom:5px">Mantenimientos Preventivos</div><table style="width:100%;border-collapse:collapse;font-size:0.78rem"><tr style="background:#f1f5f9;font-weight:700"><td style="padding:4px 8px">Tipo MP</td><td style="padding:4px 8px">Fecha Registro</td><td style="padding:4px 8px">Próx. Cambio</td><td style="padding:4px 8px">Observación</td></tr>'
        +mps.map(function(r){ return '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:3px 8px;font-weight:600">'+(r[8]||'—')+'</td><td style="padding:3px 8px">'+(parseDateToDDMMYYYY(r[3]))+'</td><td style="padding:3px 8px">'+(parseFloat(r[11])||0).toLocaleString()+' km</td><td style="padding:3px 8px;color:#64748b">'+(r[13]||'—')+'</td></tr>'; }).join('')+'</table></div>';
    }
    html+='<div style="text-align:right;color:#94a3b8;font-size:0.7rem;margin-top:8px">Generado por Azkell Fleet · '+new Date().toLocaleDateString('es-PE')+'</div></div>';
    html2pdf().set({ margin:[8,8,8,8], filename:'Ficha_'+placa+'.pdf', image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2,logging:false,useCORS:true}, jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} }).from(html).save();
};

// Aplica color de acento guardado (accesible desde módulo configuración)
window.applyAccent = function(hex, save) {
    // Seteamos en body (inline) para ganar sobre cualquier :root redefinido
    document.body.style.setProperty('--accent', hex);
    document.body.style.setProperty('--crm-accent', hex);
    document.body.style.setProperty('--crm-accent-light', hex + '1a'); // 10% opacity
    if (save) localStorage.setItem('fleet_accent', hex);
};

// ============================================================
// 🔑 INTERCEPTOR FETCH GLOBAL — inyecta JWT en todas las peticiones /api/
// ============================================================
(function installFetchInterceptor() {
    if (window._fetchInterceptorInstalled) return;
    window._fetchInterceptorInstalled = true;
    const _orig = window.fetch.bind(window);
    window.fetch = async function(url, options) {
        options = options || {};
        const urlStr = typeof url === 'string' ? url : String(url);
        if (!urlStr.startsWith('/api/')) return _orig(url, options);
        let urlFinal = url;
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            const base = window._FLEET_API_BASE || '';
            if (base) urlFinal = base + urlStr;
        }
        const token = localStorage.getItem('fleet_token');
        if (token) {
            options = Object.assign({}, options);
            options.headers = Object.assign({}, options.headers || {}, { 'Authorization': 'Bearer ' + token });
        }
        const response = await _orig(urlFinal, options);
        if (response.status === 401) {
            setTimeout(function() { if (typeof cerrarSesion === 'function') cerrarSesion(); }, 0);
        }
        return response;
    };
})();

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
        const all = ['mantenimiento','almacen','flota','directorio','sistema','configuracion','administracion'];
        all.forEach(function(id) {
            const items = document.getElementById('section-items-' + id);
            const btn   = document.querySelector('.nav-section-toggle[data-section="' + id + '"]');
            if (!items) return;
            items.classList.add('nav-section-collapsed');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
    } catch(e) {}
};
function closeSidebar() { document.getElementById('sidebarMenu').classList.remove('mobile-open'); document.getElementById('sidebarBackdrop').classList.remove('active'); }
function togglePassword(inputId, btn) { const input = document.getElementById(inputId); const icon = btn.querySelector('i'); if (input.type === 'password') { input.type = 'text'; icon.classList.replace('bi-eye-fill', 'bi-eye-slash-fill'); } else { input.type = 'password'; icon.classList.replace('bi-eye-slash-fill', 'bi-eye-fill'); } }
function registrarActividad() { if (usuarioLogueado) localStorage.setItem('fleet_ultimo_acceso', Date.now()); }
function verificarInactividad() {
    if (usuarioLogueado) {
        const ultimo = localStorage.getItem('fleet_ultimo_acceso');
        if (ultimo && (Date.now() - parseInt(ultimo) > TIEMPO_INACTIVIDAD)) {
            const modal = document.getElementById('modal-sesion-expirada');
            if (modal && !document.querySelector('#modal-sesion-expirada.show')) {
                new bootstrap.Modal(modal).show();
            }
        }
    }
}
function badgeRol(rol) { const clases = { 'Administrador':'role-admin','Inspector':'role-inspector', 'Mantenimiento':'role-mant','Almacén':'role-alm','Almacen':'role-alm','Flota':'role-flota' }; return `<span class="role-badge ${clases[rol]||''}">${rol}</span>`; }
function parseDateToDDMMYYYY(dateStr) {
    if(!dateStr) return "-";
    if(typeof dateStr === 'string' && dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        if(dateStr.endsWith('/2000') && dateStr.startsWith('01/01/')) return '-';
        return dateStr;
    }
    if (typeof dateStr === 'string' && dateStr.includes('-')) {
        let p = dateStr.split('T')[0].split('-');
        if(p.length === 3) {
            if(p[0] === '2000' && p[1] === '01' && p[2] === '01') return '-';
            return `${p[2]}/${p[1]}/${p[0]}`;
        }
    }
    let d = new Date(dateStr);
    if(isNaN(d.getTime())) return dateStr;
    if(d.getFullYear() === 2000 && d.getMonth() === 0 && d.getDate() === 1) return '-';
    let day = d.getDate().toString().padStart(2, '0');
    let month = (d.getMonth() + 1).toString().padStart(2, '0');
    let year = d.getFullYear();
    return `${day}/${month}/${year}`;
}
// ================================================================
// COMBOBOX GLOBAL — Searchable dropdown reutilizable (v1)
// Uso en HTML:
//   <div class="position-relative">
//     <input type="text" id="XXXX-txt" class="form-control" placeholder="…"
//            autocomplete="off" oninput="window._cbFiltrar('XXXX')"
//            onfocus="window._cbFiltrar('XXXX')" onblur="window._cbHide('XXXX')">
//     <input type="hidden" id="XXXX">
//     <div id="XXXX-dd" class="cb-dropdown"></div>
//   </div>
// ================================================================
window._cbData      = window._cbData      || {};
window._cbCallbacks = window._cbCallbacks || {};

window._cbInit = function(id, items, placeholder) {
    window._cbData[id] = (items || []).map(function(it) {
        if (typeof it === 'string') return { value: it, label: it };
        return { value: String(it.value != null ? it.value : (it.label || '')), label: String(it.label || it.value || '') };
    });
    var txt = document.getElementById(id + '-txt');
    if (txt && placeholder) txt.placeholder = placeholder;
};

window._cbOnSelect = function(id, fn) {
    window._cbCallbacks[id] = fn;
};

window._cbFiltrar = function(id) {
    var q  = ((document.getElementById(id + '-txt') || {}).value || '').toLowerCase().trim();
    var dd = document.getElementById(id + '-dd');
    if (!dd) return;
    var lista = (window._cbData[id] || []).filter(function(it) {
        return !q || it.label.toLowerCase().includes(q);
    });
    if (!lista.length) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = lista.map(function(it) {
        var vs = _escCbA(it.value), ls = _escCbA(it.label);
        return '<div class="cb-opt" data-cb="' + id + '" data-v="' + vs + '" data-l="' + ls + '"' +
            ' onmouseover="this.style.background=\'var(--hover,#e8eeff)\'"' +
            ' onmouseout="this.style.background=\'\'"' +
            ' onmousedown="window._cbPick(this)">' + _escCbH(it.label) + '</div>';
    }).join('');
};

window._cbPick = function(el) {
    var id  = el.getAttribute('data-cb');
    var val = el.getAttribute('data-v');
    var lbl = el.getAttribute('data-l');
    window._cbSet(id, val, lbl);
    var dd = document.getElementById(id + '-dd');
    if (dd) dd.style.display = 'none';
    if (window._cbCallbacks && window._cbCallbacks[id]) window._cbCallbacks[id](val, lbl);
};

window._cbHide = function(id) {
    setTimeout(function() {
        var dd  = document.getElementById(id + '-dd');
        if (dd) dd.style.display = 'none';
        // Free-text fallback: si escribió algo pero no seleccionó opción, preservar texto
        var txt = document.getElementById(id + '-txt');
        var hid = document.getElementById(id);
        if (txt && hid && txt !== hid && txt.value.trim() && !hid.value) {
            hid.value = txt.value.trim().toUpperCase();
        }
    }, 180);
};

window._cbSet = function(id, val, lbl) {
    var txt = document.getElementById(id + '-txt');
    var hid = document.getElementById(id);
    if (txt) txt.value = (lbl !== undefined && lbl !== null) ? lbl : (val || '');
    if (hid && hid !== txt) hid.value = val || '';
};

window._cbGet     = function(id) { return ((document.getElementById(id) || {}).value || '').trim(); };
window._cbGetText = function(id) { return ((document.getElementById(id + '-txt') || {}).value || '').trim(); };
window._cbReset   = function(id) { window._cbSet(id, '', ''); };

// Variante para selects de filtro (barras de búsqueda):
// oninput → filtra opciones; si texto vacío, limpia hidden y dispara callback
window._cbFiltrarFilter = function(id) {
    window._cbFiltrar(id);
    var txt = document.getElementById(id + '-txt');
    var hid = document.getElementById(id);
    if (txt && hid && !txt.value.trim()) {
        hid.value = '';
        if (window._cbCallbacks && window._cbCallbacks[id]) window._cbCallbacks[id]('', '');
    }
};
// onblur para filtros: si texto no coincide con selección, limpiar (no free-text fallback)
window._cbHideFilter = function(id) {
    setTimeout(function() {
        var dd  = document.getElementById(id + '-dd');
        if (dd) dd.style.display = 'none';
        var txt = document.getElementById(id + '-txt');
        var hid = document.getElementById(id);
        if (txt && hid) txt.value = hid.value || '';
    }, 180);
};

function _escCbA(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function _escCbH(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// ================================================================

function normalizeStr(str) { return str ? str.toString().trim().toUpperCase() : ""; }

// ══════════════════════════════════════════════════════════════════
// window.SS — SearchSelect global reutilizable
// Uso:
//   1. En el HTML inyectar: SS.html('wid','hidden-id','hidden-name','Placeholder','Buscar...')
//   2. Después de inyectar el HTML: SS.init('wid', ['op1','op2'], valorActual, onSelectFn)
//   3. Para ediciones programáticas: SS.setValue('wid', valor)
// ══════════════════════════════════════════════════════════════════
window.SS = (function() {
    var _store = {};

    function _ids(wid) {
        return {
            wrap:  'ss-W-' + wid,
            box:   'ss-B-' + wid,
            lbl:   'ss-L-' + wid,
            dd:    'ss-D-' + wid,
            busq:  'ss-S-' + wid,
            opts:  'ss-O-' + wid
        };
    }

    function html(wid, hiddenId, hiddenName, placeholder, searchPh, extraClass) {
        var ids = _ids(wid);
        var cls = extraClass || '';
        return '<div id="' + ids.wrap + '" class="ss-wrapper ' + cls + '" style="position:relative;">'
            + '<div id="' + ids.box + '" class="form-select ss-box border-primary shadow-sm"'
            + ' style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none;"'
            + ' onclick="window.SS.toggle(\'' + wid + '\')">'
            + '<span id="' + ids.lbl + '" class="ss-lbl" style="color:#6c757d;font-size:0.875rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">'
            + (placeholder || '— Seleccionar —') + '</span>'
            + '<i class="bi bi-chevron-down" style="flex-shrink:0;font-size:0.75rem;margin-left:4px;"></i>'
            + '</div>'
            + '<input type="hidden" id="' + hiddenId + '" name="' + hiddenName + '">'
            + '<div id="' + ids.dd + '" class="ss-dropdown" style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;z-index:3000;background:var(--card,#fff);border:1px solid var(--primary,#5865F2);border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.18);">'
            + '<div style="padding:8px 8px 4px;">'
            + '<input type="text" id="' + ids.busq + '" class="form-control form-control-sm ss-search" placeholder="' + (searchPh || 'Buscar...') + '"'
            + ' oninput="window.SS.filter(this.value,\'' + wid + '\')" autocomplete="off"'
            + ' style="border-color:var(--primary,#5865F2);">'
            + '</div>'
            + '<div id="' + ids.opts + '" class="ss-options" style="max-height:220px;overflow-y:auto;"></div>'
            + '</div>'
            + '</div>';
    }

    function init(wid, lista, valorActual, onSelect) {
        var ids = _ids(wid);
        _store[wid] = { lista: lista, onSelect: onSelect || null };
        var hidden = document.getElementById(ids.busq.replace('ss-S-', ''));
        // find hidden input: the one after the box — use stored wid pattern
        setValue(wid, valorActual || '');
        var dd = document.getElementById(ids.dd);
        if (dd) dd.style.display = 'none';
        var busq = document.getElementById(ids.busq);
        if (busq) busq.value = '';
        _render('', wid);
    }

    function toggle(wid) {
        var ids = _ids(wid);
        var dd  = document.getElementById(ids.dd);
        var box = document.getElementById(ids.box);
        if (!dd) return;
        var isOpen = dd.style.display !== 'none';
        if (isOpen) {
            dd.style.display = 'none';
            if (box) box.style.borderColor = '';
        } else {
            if (box) {
                var rect = box.getBoundingClientRect();
                dd.style.position = 'fixed';
                dd.style.top  = (rect.bottom + 2) + 'px';
                dd.style.left = rect.left + 'px';
                dd.style.width = rect.width + 'px';
                dd.style.right = 'auto';
            }
            dd.style.display = 'block';
            if (box) box.style.borderColor = 'var(--primary,#5865F2)';
            var busq = document.getElementById(ids.busq);
            if (busq) { busq.value = ''; busq.focus(); }
            _render('', wid);
        }
    }

    function filter(q, wid) { _render(q || '', wid); }

    function select(valor, wid) {
        var ids = _ids(wid);
        var dd  = document.getElementById(ids.dd);
        var box = document.getElementById(ids.box);
        // find hidden: we stored hiddenId in _store
        var store = _store[wid] || {};
        var hidden = store.hiddenEl || null;
        if (hidden) { hidden.value = valor; }
        var lbl = document.getElementById(ids.lbl);
        if (lbl) { lbl.textContent = valor || (store.placeholder || '— Seleccionar —'); lbl.style.color = valor ? 'var(--text,#212529)' : '#6c757d'; }
        if (dd) dd.style.display = 'none';
        if (box) box.style.borderColor = '';
        if (store.onSelect) store.onSelect(valor);
    }

    function setValue(wid, valor) {
        var ids = _ids(wid);
        var store = _store[wid] || {};
        var hidden = store.hiddenEl || null;
        if (hidden) hidden.value = valor || '';
        var lbl = document.getElementById(ids.lbl);
        if (lbl) { lbl.textContent = valor || (store.placeholder || '— Seleccionar —'); lbl.style.color = valor ? 'var(--text,#212529)' : '#6c757d'; }
    }

    function _getLista(wid) {
        var store = _store[wid];
        if (!store) return [];
        return typeof store.lista === 'function' ? store.lista() : (store.lista || []);
    }

    function _render(query, wid) {
        var ids = _ids(wid);
        var container = document.getElementById(ids.opts);
        if (!container) return;
        var q = (query || '').toUpperCase();
        var store = _store[wid] || {};
        var hidden = store.hiddenEl;
        var actual = hidden ? (hidden.value || '').toUpperCase() : '';
        var lista = _getLista(wid);
        var filtrados = q ? lista.filter(function(n) { return (n || '').toUpperCase().indexOf(q) !== -1; }) : lista;
        if (filtrados.length === 0) {
            container.innerHTML = '<div style="padding:10px 14px;color:var(--subtext,#6c757d);font-size:0.83rem;text-align:center;">Sin resultados</div>';
            return;
        }
        container.innerHTML = filtrados.map(function(n) {
            var isSelected = (n || '').toUpperCase() === actual;
            var nEsc = String(n).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
            return '<div onclick="window.SS.select(\'' + nEsc + '\',\'' + wid + '\')"'
                + ' style="padding:9px 14px;cursor:pointer;font-size:0.85rem;font-weight:600;letter-spacing:0.03em;color:var(--text,#212529);'
                + (isSelected ? 'background:var(--primary,#5865F2);color:#fff;' : '')
                + '" onmouseenter="this.style.background=this.style.background||\'var(--bg,#f8f9fa)\'"'
                + ' onmouseleave="this.style.background=\'\'"> '
                + n + '</div>';
        }).join('');
    }

    // Cerrar al clicar fuera — un solo listener global
    document.addEventListener('click', function(e) {
        Object.keys(_store).forEach(function(wid) {
            var wrap = document.getElementById('ss-W-' + wid);
            if (wrap && !wrap.contains(e.target)) {
                var dd  = document.getElementById('ss-D-' + wid);
                var box = document.getElementById('ss-B-' + wid);
                if (dd) dd.style.display = 'none';
                if (box) box.style.borderColor = '';
            }
        });
    });

    // init v2 que también guarda hiddenEl y placeholder
    function initFull(wid, hiddenId, lista, valorActual, onSelect, placeholder) {
        _store[wid] = {
            lista: lista,
            onSelect: onSelect || null,
            placeholder: placeholder || '— Seleccionar —',
            hiddenEl: document.getElementById(hiddenId) || null
        };
        var ids = _ids(wid);
        var dd = document.getElementById(ids.dd);
        if (dd) dd.style.display = 'none';
        var busq = document.getElementById(ids.busq);
        if (busq) busq.value = '';
        setValue(wid, valorActual || '');
        _render('', wid);
    }

    return {
        html: html,
        init: initFull,   // SS.init(wid, hiddenId, lista, valorActual, onSelect, placeholder)
        toggle: toggle,
        filter: filter,
        select: select,
        setValue: setValue
    };
})();

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
    
    fetch('/api/script/obtenerDatosWialon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) }).then(r => r.json()).then(r => {
        let d = r.data || {};
        if(d && !d.error) {
            CACHE['wialon'] = d;
            if(btn) { btn.className = 'btn btn-sm ms-3 btn-primary'; txt.innerText = 'GPS Activo'; }
            
            // Si las tablas están visibles, se refrescan solas para inyectar GPS
            if (document.getElementById('moduloStatus')?.style.display === 'flex') mostrarStatusInspecciones(dataGlobalInspecciones);
            // SPA: verificar ruta actual en lugar del elemento legacy #moduloFleetrun
            if (localStorage.getItem('fleet_rutaActual') === 'mantenimiento/fleetrun' && typeof window.mostrarFleetrun === 'function') {
                window.mostrarFleetrun(window.dataGlobalFleetrun);
            }
            if (typeof window.renderListaUnidadesGPS === 'function') window.renderListaUnidadesGPS(d);
        } else {
            if(btn) { btn.className = 'btn btn-sm btn-danger ms-3 text-white'; txt.innerText = 'Error GPS'; }
            console.error("Error Wialon:", d.error);
        }
    }).catch(e => {
        if(btn) { btn.className = 'btn btn-sm btn-danger ms-3 text-white'; txt.innerText = 'Error GPS'; }
    });
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

  fetch('/api/script/' + fnBackend, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) })
    .then(r => r.json())
    .then(r => {
      let datos = r.data || [];
      if (typeof datos === 'string' && datos.includes('Quota exceeded')) { datos = "🚨 Límite Diario de Firebase (50,000 lecturas) Alcanzado por hoy. El sistema reanudará a medianoche."; }
      CACHE[nombre] = typeof datos === 'string' ? [] : datos;
      CACHE_TIME[nombre] = Date.now();
      setBtnLoading(nombre, false);
      fnRender(datos);
      actualizarBadge(nombre, true);
    }).catch(err => {
      setBtnLoading(nombre, false); if(label) label.textContent = 'Error Red';
    });
}

function recargarModulo(nombre) {
  CACHE[nombre] = null; CACHE_TIME[nombre] = null;
  const acciones = {
    placas:       () => { if (typeof window.cargarTablaPlacas   === 'function') window.cargarTablaPlacas(true); },
    fleetrun:     () => { if (typeof window.cargarTablaFleetrun === 'function') { window.dataGlobalFleetrun = []; window.cargarTablaFleetrun(true); } },
    statusMant:   () => { if (typeof window.recargarInspecciones === 'function') window.recargarInspecciones(); },
    inspecciones: () => { if (typeof window.recargarInspecciones === 'function') window.recargarInspecciones(); },
    conductores:  () => { if (typeof window.cargarTablaConductores === 'function') window.cargarTablaConductores(true); },
    status:       () => { if (typeof window.cargarStatusFlota     === 'function') window.cargarStatusFlota(true); },
    ubicacion:    () => { if (typeof recargarWialon === 'function') recargarWialon(true); },
    planificacion:() => { if (typeof window.cargarBoardPlan       === 'function') window.cargarBoardPlan(); }
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

// Alias Bootstrap-style: 'danger' → 'error', resto pasa directo
window.mostrarAlerta = function(mensaje, tipo) {
    var t = (tipo === 'danger') ? 'error' : (tipo || 'info');
    window.mostrarToast(mensaje, t);
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

window.sparklineSVG = function(data, color) {
    if (!data || data.length < 2) return '';
    var min = Math.min.apply(null, data);
    var max = Math.max.apply(null, data);
    var range = max - min || 1;
    var W = 80, H = 28, pad = 2;
    var pts = data.map(function(v, i) {
        var x = (i / (data.length - 1)) * W;
        var y = H - pad - ((v - min) / range) * (H - pad * 2);
        return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var fill = (color || '#007aff') + '22';
    var lastPt = data.map(function(v, i) {
        var x = (i / (data.length - 1)) * W;
        var y = H - pad - ((v - min) / range) * (H - pad * 2);
        return { x: parseFloat(x.toFixed(1)), y: parseFloat(y.toFixed(1)) };
    });
    var areaPath = 'M' + lastPt[0].x + ',' + H + ' L' + pts.split(' ').map(function(p) { return p; }).join(' L') + ' L' + lastPt[lastPt.length-1].x + ',' + H + ' Z';
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="overflow:visible">' +
        '<path d="' + areaPath + '" fill="' + fill + '" />' +
        '<polyline points="' + pts + '" fill="none" stroke="' + (color || '#007aff') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
};

// ── Skeleton loaders genéricos ─────────────────────────────────────────────
window.mostrarSkeleton = function(containerId, tipo, count) {
    var el = document.getElementById(containerId);
    if (!el) return;
    count = count || 5;
    var html = '';
    if (tipo === 'cards') {
        html = '<div class="row g-3">';
        for (var i = 0; i < count; i++) {
            html += '<div class="col-6 col-md-3 skeleton-card-wrap"><div class="skeleton"></div></div>';
        }
        html += '</div>';
    } else if (tipo === 'table') {
        var widths = [0.4, 2, 1, 1, 0.6];
        for (var i = 0; i < count; i++) {
            html += '<div class="skeleton-row">';
            widths.forEach(function(f) {
                html += '<div class="skeleton" style="flex:' + f + ';height:30px;border-radius:4px"></div>';
            });
            html += '</div>';
        }
    } else {
        var pcts = [100, 75, 90, 60, 82, 70, 95, 55];
        for (var i = 0; i < count; i++) {
            html += '<div class="skeleton" style="height:13px;width:' + pcts[i % pcts.length] + '%;border-radius:4px;margin-bottom:7px"></div>';
        }
    }
    el.innerHTML = html;
};

// ── Column picker — muestra/oculta columnas de tabla, persiste en localStorage ──
window.initColPicker = function(containerId, tableId, cols, lsKey) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var saved = JSON.parse(localStorage.getItem(lsKey) || 'null');
    if (saved) {
        cols.forEach(function(c) { if (saved[c.idx] !== undefined) c.visible = saved[c.idx]; });
    }
    window._applyColVis(tableId, cols);
    var items = cols.map(function(c) {
        return '<li><label class="dropdown-item d-flex align-items-center gap-2 small py-1" onclick="event.stopPropagation()">'
            + '<input type="checkbox" class="form-check-input m-0" ' + (c.visible ? 'checked' : '')
            + ' onchange="window._toggleCol(\'' + tableId + '\',' + c.idx + ',this.checked,\'' + lsKey + '\')">'
            + c.label + '</label></li>';
    }).join('');
    container.innerHTML = '<div class="dropdown">'
        + '<button class="btn btn-sm btn-outline-secondary" data-bs-toggle="dropdown" title="Columnas visibles">'
        + '<i class="bi bi-layout-three-columns"></i></button>'
        + '<ul class="dropdown-menu dropdown-menu-end shadow">'
        + '<li><h6 class="dropdown-header small">Mostrar columnas</h6></li>'
        + items + '</ul></div>';
};
window._applyColVis = function(tableId, cols) {
    var table = document.getElementById(tableId);
    if (!table) return;
    cols.forEach(function(c) {
        table.querySelectorAll('tr > *:nth-child(' + (c.idx + 1) + ')').forEach(function(cell) {
            cell.classList.toggle('d-none', !c.visible);
        });
    });
};
window._toggleCol = function(tableId, colIdx, visible, lsKey) {
    var table = document.getElementById(tableId);
    if (!table) return;
    table.querySelectorAll('tr > *:nth-child(' + (colIdx + 1) + ')').forEach(function(cell) {
        cell.classList.toggle('d-none', !visible);
    });
    var state = JSON.parse(localStorage.getItem(lsKey) || '{}');
    state[colIdx] = visible;
    localStorage.setItem(lsKey, JSON.stringify(state));
};

// ── Swipe-to-reveal en cards (para divs con .card-premium) ─────────────────
window.initSwipeCards = function(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var startX, startY, target;
    var SWIPE_THRESHOLD = 60;

    function closeSwiped(except) {
        container.querySelectorAll('.card-premium.swiped').forEach(function(c) {
            if (c !== except) c.classList.remove('swiped');
        });
    }

    container.addEventListener('touchstart', function(e) {
        var card = e.target.closest('.card-premium');
        if (!card) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        target = card;
    }, {passive: true});

    container.addEventListener('touchmove', function(e) {
        if (!target) return;
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        if (Math.abs(dy) > Math.abs(dx) + 10) { target = null; return; }
        if (dx < -SWIPE_THRESHOLD) {
            closeSwiped(target);
            target.classList.add('swiped');
        } else if (dx > 20 && target.classList.contains('swiped')) {
            target.classList.remove('swiped');
        }
    }, {passive: true});

    container.addEventListener('touchend', function() { target = null; }, {passive: true});

    // Cerrar al click fuera del área de acciones
    container.addEventListener('click', function(e) {
        if (!e.target.closest('.card-swipe-actions')) {
            closeSwiped(null);
        }
    });
};

// ── Badges dinámicos de alerta en sidebar ─────────────────────────────────
window.actualizarBadgesSidebar = function() {
    // Badge INSPECCIONES — vencidas + próximas a vencer (≤7d)
    var badgeInsp = document.getElementById('badge-insp-alerta');
    if (badgeInsp && window.dataGlobalInspecciones && window.dataGlobalPlacas) {
        var hoy = new Date(); hoy.setHours(0,0,0,0);
        var inspecciones = window.dataGlobalInspecciones.filter(function(i) { return i.estado !== 'Eliminada'; });
        var placasActivas = window.dataGlobalPlacas.filter(function(p) {
            if ((p[0] || '').toUpperCase() === 'PLACA') return false;
            var est = (typeof normalizeStr === 'function') ? normalizeStr(p[18] || p[8] || '') : (p[18] || p[8] || '').toUpperCase().trim();
            var enUso = (typeof normalizeStr === 'function') ? normalizeStr(p[22] || p[13] || '') : (p[22] || p[13] || '').toUpperCase().trim();
            return est === 'ACTIVA' && (enUso === 'SI' || enUso === 'SÍ');
        });
        var alertas = 0, vencidas = 0;
        placasActivas.forEach(function(p) {
            var placaStr = (typeof normalizeStr === 'function') ? normalizeStr(p[0]) : (p[0] || '').toUpperCase().trim();
            var insp = inspecciones.slice().sort(function(a, b) {
                var pa = parseInt((a.id || '').split('-')[1]) || 0;
                var pb = parseInt((b.id || '').split('-')[1]) || 0;
                return pb - pa;
            }).find(function(i) {
                var pl = (typeof normalizeStr === 'function') ? normalizeStr(i.placa) : (i.placa||'').toUpperCase().trim();
                return pl === placaStr;
            });
            if (!insp || !insp.fecha_ingreso) { alertas++; vencidas++; return; }
            var fi;
            try {
                fi = insp.fecha_ingreso.includes('/')
                    ? new Date((function(px){ return new Date(px[2], px[1]-1, px[0]); })(insp.fecha_ingreso.split('/')))
                    : new Date(insp.fecha_ingreso + 'T00:00:00');
            } catch(e) { alertas++; vencidas++; return; }
            var dProp = parseInt(insp.dias_propuestos) || 30;
            var fProx = new Date(fi.getTime());
            fProx.setDate(fProx.getDate() + dProp);
            var dias = Math.ceil((fProx - hoy) / 86400000);
            if (dias < 0)       { alertas++; vencidas++; }
            else if (dias <= 7) { alertas++; }
        });
        if (alertas > 0) {
            badgeInsp.textContent = alertas > 99 ? '99+' : alertas;
            badgeInsp.style.display = '';
            badgeInsp.className = 'nav-item-badge' + (vencidas > 0 ? '' : ' warning');
        } else {
            badgeInsp.style.display = 'none';
        }
    }

    // Badge PLACAS — total flota activa
    var badgePlacas = document.getElementById('badge-placas-activas');
    if (badgePlacas && window.dataGlobalPlacas) {
        var total = window.dataGlobalPlacas.filter(function(p) {
            if ((p[0] || '').toUpperCase() === 'PLACA') return false;
            var est = (typeof normalizeStr === 'function') ? normalizeStr(p[18] || p[8] || '') : (p[18] || p[8] || '').toUpperCase().trim();
            return est === 'ACTIVA';
        }).length;
        if (total > 0) {
            badgePlacas.textContent = total;
            badgePlacas.style.display = '';
            badgePlacas.className = 'nav-item-badge success';
        } else {
            badgePlacas.style.display = 'none';
        }
    }
};

// ── Pull-to-refresh (mobile) — ELIMINADO ──────────────────────────────────────

// ── History API — botón atrás nativo en móvil ─────────────────────────────────
window._navFromPopstate = false;
window.addEventListener('popstate', function(e) {
    // Si hay un offcanvas o modal abierto, cerrarlo en lugar de navegar
    var openOffcanvas = document.querySelector('.offcanvas.show');
    if (openOffcanvas) {
        var bsOffcanvas = bootstrap.Offcanvas.getInstance(openOffcanvas);
        if (bsOffcanvas) { bsOffcanvas.hide(); }
        // Reinsert state para no retroceder más
        var ruta = localStorage.getItem('fleet_rutaActual') || 'dashboard';
        history.pushState({ ruta: ruta }, '', '#' + ruta.replace(/\//g, '-'));
        return;
    }
    var ruta = (e.state && e.state.ruta) ? e.state.ruta : (localStorage.getItem('fleet_rutaActual') || 'dashboard');
    window._navFromPopstate = true;
    cargarModuloAislado(ruta);
});
// Estado inicial en history al cargar la app
(function() {
    var rutaActual = localStorage.getItem('fleet_rutaActual') || 'dashboard';
    if (!history.state) {
        history.replaceState({ ruta: rutaActual }, '', '#' + rutaActual.replace(/\//g, '-'));
    }
})();

// ─── Modal de confirmación elegante ─────────────────────────────
window._confirmarResolve = null;
window.confirmar = function(opts) {
    if (typeof opts === 'string') opts = { mensaje: opts };
    opts = Object.assign({ titulo: '¿Estás seguro?', mensaje: '', icono: '⚠️', tipo: 'warning', conCodigo: false, codigoEsperado: 'ELIMINAR', btnConfirmar: 'Confirmar', btnCancelar: 'Cancelar' }, opts);

    return new Promise(function(resolve) {
        window._confirmarResolve = resolve;
        var modal = document.getElementById('modal-confirmar');
        if (!modal) { resolve(window.confirm(opts.mensaje)); return; }

        var colorMap = { danger: '#ef4444', warning: '#f59e0b', info: '#3b82f6', success: '#10b981' };
        var color    = colorMap[opts.tipo] || colorMap.warning;

        document.getElementById('mc-icon-wrap').innerHTML = '<span style="font-size:2.5rem">' + opts.icono + '</span>';
        document.getElementById('mc-title').textContent   = opts.titulo;
        document.getElementById('mc-msg').innerHTML       = opts.mensaje;

        var btnConfirm  = document.getElementById('mc-btn-confirm');
        var codeWrap    = document.getElementById('mc-code-wrap');
        var codeInput   = document.getElementById('mc-code-input');
        var codeHint    = document.getElementById('mc-code-hint');

        btnConfirm.textContent   = opts.btnConfirmar;
        btnConfirm.className     = 'btn fw-bold px-4';
        btnConfirm.style.cssText = 'border-radius:10px; background:' + color + '; color:#fff; border:none;';

        if (opts.conCodigo) {
            codeWrap.style.display = '';
            codeHint.textContent   = '"' + opts.codigoEsperado + '"';
            codeInput.value        = '';
            btnConfirm.disabled    = true;
            codeInput.oninput      = function() {
                btnConfirm.disabled = codeInput.value.trim().toUpperCase() !== opts.codigoEsperado.toUpperCase();
            };
        } else {
            codeWrap.style.display = 'none';
            btnConfirm.disabled    = false;
        }

        btnConfirm.onclick = function() {
            var bsM = bootstrap.Modal.getInstance(modal);
            if (bsM) bsM.hide();
            resolve(true);
        };

        var bsCancelBtn = document.getElementById('mc-btn-cancel');
        bsCancelBtn.onclick = function() { resolve(false); };

        modal.addEventListener('hidden.bs.modal', function handler() {
            modal.removeEventListener('hidden.bs.modal', handler);
            if (window._confirmarResolve === resolve) { resolve(false); window._confirmarResolve = null; }
        }, { once: true });

        new bootstrap.Modal(modal).show();
    });
};

// Override de confirm() → modal elegante (non-blocking, devuelve true por defecto para código legado)
(function() {
    var _nativeConfirm = window.confirm;
    window.confirm = function(msg) {
        var container = document.getElementById('modal-confirmar');
        if (!container) return _nativeConfirm(msg);
        // Para código legado que usa confirm() síncrono, usamos confirmar() en background y devolvemos true
        // El código legado DEBERÍA migrarse a window.confirmar()
        return _nativeConfirm(msg);
    };
})();

// ─── Bottom nav — estado activo ─────────────────────────────────
window.setBottomNavActive = function(id) {
    document.querySelectorAll('.bottom-nav-item').forEach(function(el) { el.classList.remove('active'); });
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
};

// Llama cuando cambia el módulo activo — limpia todos y activa el que corresponde (o deja todo limpio)
function actualizarBottomNavActivo(ruta) {
    document.querySelectorAll('.bottom-nav-item').forEach(function(el) { el.classList.remove('active'); });
    var id = '';
    if (ruta === 'dashboard') id = 'bnav-dashboard';
    else if (ruta.startsWith('flota/')) id = 'bnav-flota';
    else if (ruta.startsWith('mantenimiento/')) id = 'bnav-mantenimiento';
    else if (ruta.startsWith('almacen/')) id = 'bnav-almacen';
    else if (ruta.startsWith('directorio/')) id = 'bnav-directorio';
    else if (ruta.startsWith('sistema/') || ruta.startsWith('administracion')) id = 'bnav-config';
    
    if (id) { var el = document.getElementById(id); if (el) el.classList.add('active'); }
}

// ─── Historial de navegación reciente ───────────────────────────
var NOMBRES_MODULOS_RECIENTES = {
    'dashboard':                  'Dashboard',
    'mantenimiento/inspecciones': 'Inspecciones',
    'mantenimiento/placas':       'Placas',
    'mantenimiento/fleetrun':     'Fleetrun',
    'mantenimiento/otros':        'Otros Mant.',
    'mantenimiento/planificacion':'Planificación',
    'mantenimiento/configuracion-mp': 'Frecuencias MP',
    'mantenimiento/kits-mp':          'Kits MP',
    'mantenimiento/tipos-mp':         'Tipos MP',
    'mantenimiento/config-metrica':   'Config. Métrica',
    'almacen/inventario':         'Inventario',
    'almacen/entradas':           'Entradas',
    'almacen/salidas':            'Salidas',
    'almacen/proveedores':        'Proveedores',
    'almacen/kardex':             'Kardex',
    'almacen/costos':             'Costos',
    'almacen/unidades':           'Unidades',
    'almacen/sistemas':           'Sistemas',
    'almacen/familias':           'Familias',
    'almacen/marcas':             'Marcas',
    'preferencias/situaciones':   'Situaciones',
    'flota/status':               'Status Flota',
    'flota/ubicacion':            'GPS',
    'directorio/conductores':     'Personal',
    'sistema/usuarios':           'Usuarios',
    'sistema/auditoria':          'Auditoría',
    'sistema/configuracion':      'Configuración',
};
var ICONOS_MODULOS_RECIENTES = {
    'dashboard':                  'bi-grid-1x2-fill',
    'mantenimiento/inspecciones': 'bi-clipboard2-pulse-fill',
    'mantenimiento/placas':       'bi-truck',
    'mantenimiento/fleetrun':     'bi-speedometer2',
    'mantenimiento/otros':        'bi-grid-fill',
    'mantenimiento/planificacion':'bi-calendar2-check',
    'mantenimiento/configuracion-mp': 'bi-sliders',
    'mantenimiento/kits-mp':          'bi-tools',
    'mantenimiento/tipos-mp':         'bi-card-list',
    'mantenimiento/config-metrica':   'bi-speedometer2',
    'almacen/inventario':         'bi-box-fill',
    'almacen/entradas':           'bi-arrow-down-circle-fill',
    'almacen/salidas':            'bi-arrow-up-circle-fill',
    'almacen/proveedores':        'bi-building-fill',
    'almacen/kardex':             'bi-journal-text',
    'almacen/costos':             'bi-graph-up-arrow',
    'almacen/unidades':           'bi-rulers',
    'almacen/sistemas':           'bi-diagram-3-fill',
    'almacen/familias':           'bi-tags-fill',
    'almacen/marcas':             'bi-award-fill',
    'flota/status':               'bi-activity',
    'flota/ubicacion':            'bi-geo-alt-fill',
    'directorio/conductores':     'bi-person-vcard-fill',
    'sistema/usuarios':           'bi-people-fill',
    'sistema/auditoria':          'bi-journal-code',
    'sistema/configuracion':      'bi-gear-fill',
};

function pushReciente(ruta) {
    if (!ruta || ruta === 'login') return;
    try {
        var recientes = JSON.parse(localStorage.getItem('fleet_nav_recientes') || '[]');
        recientes = recientes.filter(function(r) { return r.ruta !== ruta; });
        recientes.unshift({ ruta: ruta, ts: Date.now() });
        recientes = recientes.slice(0, 10);
        localStorage.setItem('fleet_nav_recientes', JSON.stringify(recientes));
    } catch(e) {}
}

// ─── Sesión expirada — renovar ───────────────────────────────────
window._renovarSesion = function() {
    var modal = document.getElementById('modal-sesion-expirada');
    if (modal) {
        var bsM = bootstrap.Modal.getInstance(modal);
        if (bsM) bsM.hide();
    }
    localStorage.setItem('fleet_ultimo_acceso', Date.now());
    registrarActividad();
    window.mostrarToast('Sesión renovada. ¡Bienvenido de nuevo! 👋', 'success', 3000);
};

// ─── Temas predefinidos ──────────────────────────────────────────
var TEMAS_PREDEFINIDOS = {
    default:  { accent: '#2563eb', tema: null },
    linear:   { accent: '#5e6ad2', tema: 'linear' },
    vercel:   { accent: '#000000', tema: 'vercel' },
    github:   { accent: '#0969da', tema: 'github' },
    emerald:  { accent: '#059669', tema: 'emerald' },
    rose:     { accent: '#e11d48', tema: 'rose' },
    amber:    { accent: '#d97706', tema: 'amber' },
};
window.aplicarTema = function(nombreTema) {
    var tema = TEMAS_PREDEFINIDOS[nombreTema];
    if (!tema) return;
    document.body.removeAttribute('data-theme');
    if (tema.tema) document.body.setAttribute('data-theme', tema.tema);
    if (typeof window.applyAccent === 'function') window.applyAccent(tema.accent, true);
    localStorage.setItem('fleet_tema', nombreTema);
    window.mostrarToast('Tema "' + nombreTema + '" aplicado', 'success', 2000);
};
(function() {
    var temaGuardado = localStorage.getItem('fleet_tema');
    if (temaGuardado && TEMAS_PREDEFINIDOS[temaGuardado]) {
        var t = TEMAS_PREDEFINIDOS[temaGuardado];
        if (t.tema) document.body.setAttribute('data-theme', t.tema);
    }
})();

// ─── Ripple effect global ────────────────────────────────────────
document.addEventListener('click', function(e) {
    if (document.body.classList.contains('reduce-motion')) return;
    var target = e.target.closest('.btn, .nav-item, .bottom-nav-item');
    if (!target) return;
    var rect   = target.getBoundingClientRect();
    var size   = Math.max(rect.width, rect.height) * 1.5;
    var x      = e.clientX - rect.left - size / 2;
    var y      = e.clientY - rect.top  - size / 2;
    var wave   = document.createElement('span');
    wave.className = 'ripple-wave';
    wave.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + x + 'px;top:' + y + 'px;';
    target.appendChild(wave);
    setTimeout(function() { if (wave.parentNode) wave.remove(); }, 550);
}, true);

// =====================================================================
// 🗺️ ROUTER UX: Títulos, Menú Activo y Persistencia de Ruta
// =====================================================================

const TITULOS_MODULOS = {
    'dashboard':                   'Centro de Comando',
    'mantenimiento/inspecciones':  'Análisis de Inspecciones',
    'mantenimiento/placas':        'Gestión de Placas',
    'mantenimiento/fleetrun':      'Sistema Fleetrun',
    'mantenimiento/otros':         'Otros — Mantenimiento',
    'mantenimiento/planificacion': 'Planificación de Mantenimientos',
    'mantenimiento/configuracion-mp': 'Frecuencias de Mantenimiento',
    'mantenimiento/kits-mp':          'Kits de Mantenimiento',
    'mantenimiento/tipos-mp':         'Tipos de Preventivo',
    'mantenimiento/config-metrica':   'Config. Métrica por Placa',
    'almacen/inventario':          'Inventario',
    'almacen/unidades':            'Unidades de Medida',
    'almacen/sistemas':            'Sistemas y Sub-Sistemas',
    'almacen/familias':            'Familias de Artículos',
    'almacen/marcas':              'Marcas de Fabricante',
    'preferencias/situaciones':    'Catálogo de Situaciones',
    'flota/status':                'Status de Flota',
    'flota/ubicacion':             'GPS',
    'directorio/conductores':      'Directorio de Personal',
    'sistema/usuarios':            'Gestión de Usuarios',
    'sistema/auditoria':           'Bitácora de Auditoría',
    'administracion':              'Administración',
};

const MENU_IDS = {
    'dashboard':                   'nav-dashboard',
    'mantenimiento/inspecciones':  'nav-inspecciones',
    'mantenimiento/placas':        'nav-placas',
    'mantenimiento/fleetrun':      'nav-fleetrun',
    'mantenimiento/otros':         'nav-otros-mant',
    'mantenimiento/planificacion': 'nav-otros-mant',
    'mantenimiento/configuracion-mp':  'nav-administracion',
    'mantenimiento/kits-mp':           'nav-administracion',
    'mantenimiento/tipos-mp':          'nav-administracion',
    'mantenimiento/config-metrica':    'nav-administracion',
    'mantenimiento/ordenes':           'nav-ordenes',
    'mantenimiento/status-rampa':      'nav-status-rampa',
    'mantenimiento/reportes-ot':       'nav-reportes-ot',
    'mantenimiento/trabajos-ot':       'nav-trabajos-ot',

    'mantenimiento/backlog-taller':    'nav-otros-mant',
    'mantenimiento/kpis-taller':       'nav-otros-mant',
    'mantenimiento/productividad':     'nav-otros-mant',
    'mantenimiento/finanzas-taller':   'nav-otros-mant',
    'almacen/inventario':          'nav-inventario',
    'almacen/entradas':            'nav-entradas-inv',
    'almacen/salidas':             'nav-salidas-inv',
    'almacen/proveedores':         'nav-administracion',
    'almacen/kardex':              'nav-kardex',
    'almacen/costos':              'nav-costos-inv',
    'almacen/unidades':            'nav-administracion',
    'almacen/sistemas':            'nav-administracion',
    'almacen/familias':            'nav-administracion',
    'almacen/marcas':              'nav-administracion',
    'preferencias/situaciones':    'nav-administracion',
    'administracion':              'nav-administracion',
    'flota/status':                'nav-status-flota',
    'flota/ubicacion':             'nav-ubicacion',
    'directorio/conductores':      'nav-conductores',
    'sistema/usuarios':            'nav-usuarios',
    'sistema/auditoria':           'nav-auditoria',
};

const MENU_SECTION = {
    'mantenimiento/inspecciones': 'mantenimiento',
    'mantenimiento/placas':       'administracion',
    'mantenimiento/fleetrun':     'mantenimiento',
    'almacen/inventario':         'almacen',
    'almacen/entradas':           'almacen',
    'almacen/salidas':            'almacen',
    'almacen/proveedores':        'almacen',
    'almacen/kardex':             'almacen',
    'almacen/costos':             'almacen',
    'almacen/unidades':           'almacen',
    'almacen/sistemas':           'almacen',
    'almacen/familias':           'almacen',
    'almacen/marcas':             'almacen',
    'preferencias/situaciones':   'administracion',
    'administracion':             'administracion',
    'mantenimiento/configuracion-mp': 'administracion',
    'mantenimiento/kits-mp':          'administracion',
    'mantenimiento/tipos-mp':         'administracion',
    'mantenimiento/config-metrica':   'administracion',
    'mantenimiento/status-rampa':     'mantenimiento',
    'mantenimiento/reportes-ot':      'mantenimiento',
    'mantenimiento/trabajos-ot':      'mantenimiento',
    'mantenimiento/otros':            'mantenimiento',
    'mantenimiento/backlog-taller':   'mantenimiento',
    'mantenimiento/kpis-taller':      'mantenimiento',
    'mantenimiento/productividad':    'mantenimiento',
    'mantenimiento/finanzas-taller':  'mantenimiento',
    'mantenimiento/planificacion':    'mantenimiento',
    'mantenimiento/ordenes':          'mantenimiento',
    'flota/ubicacion':            'flota',
    'directorio/conductores':     'directorio',
    'sistema/usuarios':           'configuracion',
    'sistema/auditoria':          'configuracion',
};

const BREADCRUMB_MAP = {
    'dashboard':                  [],
    'mantenimiento/inspecciones': ['Mantenimiento','Inspecciones'],
    'mantenimiento/placas':       ['Administración','Placas'],
    'mantenimiento/fleetrun':     ['Mantenimiento','Fleetrun'],
    'mantenimiento/otros':        ['Mantenimiento','Otros'],
    'almacen/inventario':         ['Almacén','Inventario'],
    'almacen/unidades':           ['Administración','Unidades de Medida'],
    'almacen/sistemas':           ['Administración','Sistemas'],
    'almacen/familias':           ['Administración','Familias'],
    'almacen/marcas':             ['Administración','Marcas'],
    'preferencias/situaciones':   ['Administración','Situaciones'],
    'mantenimiento/configuracion-mp': ['Administración','Frecuencias MP'],
    'mantenimiento/kits-mp':          ['Administración','Kits MP'],
    'mantenimiento/tipos-mp':         ['Administración','Tipos MP'],
    'mantenimiento/config-metrica':   ['Preferencias','Config. Métrica'],
    'mantenimiento/ordenes':          ['Mantenimiento','Órdenes de Mto.'],
    'mantenimiento/status-rampa':     ['Mantenimiento','Status Rampa'],
    'mantenimiento/reportes-ot':      ['Mantenimiento','Reportes OT'],
    'mantenimiento/trabajos-ot':      ['Mantenimiento','Trabajos Anexos'],
    'mantenimiento/backlog-taller':   ['Otros','Backlog Pendientes'],
    'mantenimiento/kpis-taller':      ['Otros','Métricas y KPIs'],
    'mantenimiento/productividad':    ['Otros','Productividad Personal'],
    'mantenimiento/finanzas-taller':  ['Otros','Reporte Financiero'],
    'mantenimiento/planificacion':    ['Otros','Planificación de Mantenimientos'],
    'flota/status':               ['Flota','Status'],
    'flota/ubicacion':            ['Flota','GPS'],
    'directorio/conductores':     ['Directorio','Personal'],
    'sistema/usuarios':           ['Configuración','Usuarios'],
    'sistema/auditoria':          ['Configuración','Auditoría'],
    'sistema/configuracion':      ['Sistema','Configuración'],
};

function actualizarTituloHeader(ruta) {
    const titulo = document.getElementById('tituloTopBar');
    if (titulo) titulo.innerText = TITULOS_MODULOS[ruta] || 'Azkell Fleet';
    // Breadcrumb
    const bc   = document.getElementById('breadcrumb-nav');
    if (!bc) return;
    const crumbs = BREADCRUMB_MAP[ruta];
    if (!crumbs || crumbs.length === 0) { bc.innerHTML = ''; return; }
    bc.innerHTML = '<i class="bi bi-house-fill topbar-bc-home"></i>' +
        crumbs.map(function(c, i) {
            return '<span class="topbar-bc-sep">›</span><span class="topbar-bc-item' + (i === crumbs.length - 1 ? ' active' : '') + '">' + c + '</span>';
        }).join('');
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
    if (rutaModulo !== 'login') {
        localStorage.setItem('fleet_rutaActual', rutaModulo);
        pushReciente(rutaModulo);
        // 📍 HISTORY API — botón atrás nativo en móvil
        if (!window._navFromPopstate) {
            var hashRuta = '#' + rutaModulo.replace(/\//g, '-');
            history.pushState({ ruta: rutaModulo }, '', hashRuta);
        }
        window._navFromPopstate = false;
    }

    // 🧹 LIMPIEZA BOOTSTRAP — elimina backdrops huérfanos y clases del body
    document.querySelectorAll('.modal-backdrop, .offcanvas-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open', 'offcanvas-open');
    document.body.style.paddingRight = '';
    document.body.style.overflow = '';

    // 🧹 DISPOSE TOOLTIPS — evita crash tooltip.js al navegar entre módulos
    tooltipList.forEach(function(t) { try { t.dispose(); } catch(e) {} });
    tooltipList = [];
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function(el) {
        try { const tip = bootstrap.Tooltip.getInstance(el); if (tip) tip.dispose(); } catch(e) {}
    });

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
        const respHTML = await fetch(`${_rutaDisco}/vista.html?v=${Date.now()}`, { cache: 'no-cache' });
        if(!respHTML.ok) throw new Error(`No se encontró vista.html en ${_rutaDisco}`);
        root.innerHTML = ''; // limpieza explícita — evita solapamiento si dos navegaciones se solapan
        root.classList.add('module-transitioning');
        root.innerHTML = await respHTML.text();

        // ← Botón "Atrás a Administración" para sub-módulos admin
        const ADMIN_SUBRUTAS = [
            'almacen/proveedores','almacen/familias','almacen/unidades',
            'almacen/sistemas','almacen/marcas',
            'mantenimiento/configuracion-mp','mantenimiento/kits-mp',
            'mantenimiento/tipos-mp','mantenimiento/config-metrica',
            'preferencias/situaciones','sistema/integraciones'
        ];
        if (ADMIN_SUBRUTAS.includes(rutaModulo)) {
            var backBtn = document.createElement('div');
            backBtn.style.cssText = 'flex-shrink:0;padding:.45rem 1rem .25rem;';
            backBtn.innerHTML = '<button onclick="cargarModuloAislado(\'administracion\')" ' +
                'style="display:inline-flex;align-items:center;gap:.45rem;padding:.42rem 1rem;' +
                'border-radius:10px;border:none;background:#1e293b;' +
                'color:#fff;font-size:.78rem;font-weight:700;cursor:pointer;' +
                'box-shadow:0 2px 8px rgba(0,0,0,.18);transition:background .15s,transform .1s;"' +
                ' onmouseover="this.style.background=\'#0f172a\';this.style.transform=\'translateX(-2px)\'"' +
                ' onmouseout="this.style.background=\'#1e293b\';this.style.transform=\'\'">' +
                '<i class="bi bi-arrow-left" style="font-size:.9rem;"></i>Administración</button>';
            root.insertBefore(backBtn, root.firstChild);
        }
        if (typeof window.applyI18n === 'function') window.applyI18n();
        // Transición fade-in
        requestAnimationFrame(function() {
            requestAnimationFrame(function() { root.classList.remove('module-transitioning'); });
        });

        // UX: actualizar título del header y resaltar enlace activo en el sidebar
        actualizarTituloHeader(rutaModulo);
        marcarMenuActivo(rutaModulo);

        // 4. Crear un ID único para el script (ej: script-mantenimiento-placas)
        const scriptId = `script-${rutaModulo.replace('/', '-')}`;

        // 5. Inyectar la lógica (JS) — siempre recarga para reflejar cambios recientes
        const oldScript = document.getElementById(scriptId);
        if (oldScript) oldScript.remove();

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `${_rutaDisco}/logica.js?v=${Date.now()}`;
        let nombreCarpeta = (rutaModulo.split('/')[1] || rutaModulo.split('/')[0]).replace(/-/g, '_');
        let funcionInit = `init_${nombreCarpeta}`;
        script.onload = function() {
            if (typeof window[funcionInit] === 'function') {
                window[funcionInit]();
            } else {
                // Fallback: módulos con guiones en el nombre (ej: init_configuracion-mp)
                var carpetaOriginal = rutaModulo.split('/')[1] || rutaModulo.split('/')[0];
                var funcionInitHyphen = 'init_' + carpetaOriginal;
                if (typeof window[funcionInitHyphen] === 'function') window[funcionInitHyphen]();
            }
        };
        document.body.appendChild(script);
        window._navProgress.done();
        // Actualizar visibilidad FAB según módulo activo
        if (typeof actualizarFAB === 'function') actualizarFAB();
        // Actualizar ítem activo en bottom nav
        if (typeof actualizarBottomNavActivo === 'function') actualizarBottomNavActivo(rutaModulo);
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
            layout: { padding: 6 },
            plugins: {
                legend: { position: 'right', labels: { font: {family: 'Inter', weight: 'bold', size: 11}, boxWidth: 12, padding: 8 } },
                datalabels: {
                    display: function(ctx) {
                        var total = ctx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                        if (!total || ctx.chart.data.labels[0]==='Sin Datos') return false;
                        return (ctx.dataset.data[ctx.dataIndex] / total) >= 0.06;
                    },
                    color: '#ffffff',
                    font: { weight: 'bold', size: 11, family: 'Inter' },
                    formatter: function(value, ctx) {
                        var total = ctx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                        if (!total || ctx.chart.data.labels[0]==='Sin Datos') return '';
                        return Math.round(value/total*100)+'%';
                    },
                    anchor: 'center', align: 'center'
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
                <div class="col-12 mb-3">
                    <label class="fw-bold">Fecha de Ingreso</label>
                    <input type="date" class="form-control fw-bold text-primary border-primary shadow-sm" id="i_fecha" required>
                </div>
                <div class="col-12 mb-3">
                    <label class="fw-bold text-primary">
                        <i class="bi bi-truck"></i> Placa *
                    </label>
                    ${window.SS.html('insp-placa','i_placa','i_placa','ESCRIBE PARA BUSCAR...','Buscar placa...')}
                </div>
                <div class="col-12 mb-3">
                    <label class="fw-bold">KM Tablero (Opcional)</label>
                    <input type="number" class="form-control text-danger fw-bold border-danger shadow-sm" id="i_kmtablero" placeholder="Ej: 150000">
                </div>
                <div class="col-12 mb-3">
                    <label class="fw-bold text-secondary">Dueño (Cliente)</label>
                    <input type="text" class="form-control bg-light shadow-sm" id="i_cliente" readonly>
                </div>
                <div class="col-12 mb-3">
                    <label class="form-label fw-bold text-secondary">Tipo</label>
                    <input type="text" class="form-control bg-light text-uppercase shadow-sm" id="i_modelo" readonly>
                </div>
                <div class="col-12 mb-3">
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
    // Inicializar SS para placa
    window.SS.init('insp-placa', 'i_placa',
        function() {
            return (window.dataGlobalPlacas || [])
                .map(function(p){ return (p[0]||'').trim().toUpperCase(); })
                .filter(function(p,i,a){ return p && p !== 'PLACA' && a.indexOf(p) === i; })
                .sort();
        },
        '', window.autocompletarInfoInsp, 'ESCRIBE PARA BUSCAR...'
    );
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
    fetch('/api/script/obtenerDatosFleetrun', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) }).then(r => r.json()).then(r => mostrarFleetrun(r.data || []));
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
function enviarFleetrun(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnGuardarFleetrun'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...'; if(!formObj.f_id.value) formObj.f_id.value = "FL-" + Date.now(); formObj.usuarioAutor.value = usuarioLogueado; const data = {}; for (let i = 0; i < formObj.elements.length; i++) { const el = formObj.elements[i]; if (el.name) data[el.name] = el.value; } fetch('/api/script/guardarFleetrun', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [data] }) }).then(r => r.json()).then(r => { if (r.data === 'Éxito') { formObj.reset(); bootstrap.Modal.getInstance(document.getElementById('modalFleetrun')).hide(); cargarTablaFleetrun(true); } else alert(r.data); btn.disabled = false; btn.innerHTML = 'Guardar'; }).catch(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Guardar'; }); }
function enviarEdicionFleetrun(event, formObj) { event.preventDefault(); const btn = document.getElementById('btnActualizarFleetrun'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Actualizando...'; formObj.usuarioAutor.value = usuarioLogueado; const data = {}; for (let i = 0; i < formObj.elements.length; i++) { const el = formObj.elements[i]; if (el.name) data[el.name] = el.value; } fetch('/api/script/actualizarFleetrun', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [data] }) }).then(r => r.json()).then(r => { if (r.data === 'Éxito') { bootstrap.Modal.getInstance(document.getElementById('modalEditarFleetrun')).hide(); cargarTablaFleetrun(true); } else alert(r.data); btn.disabled = false; btn.innerHTML = 'Actualizar'; }).catch(e => { alert('Error de red: ' + e.message); btn.disabled = false; btn.innerHTML = 'Actualizar'; }); }

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
        <tr data-k="cond"><td class="text-start ps-3 fw-semibold text-secondary small">Personal</td>
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

// Mapa de acciones FAB por ruta. `null` = módulo sin FAB (botón "+" oculto).
var FAB_ACCIONES_POR_RUTA = {
    // Con acciones
    'mantenimiento/inspecciones': [
        { icon: 'bi-plus-lg', cls: 'primary',      texto: 'Registrar Inspección', fn: function() { if(typeof abrirModalNuevaInspeccion==='function') abrirModalNuevaInspeccion(); } },
        { icon: 'bi-clock-history', cls: 'info',   texto: 'Ver Historial',        fn: function() { if(typeof toggleVistaStatus==='function') toggleVistaStatus(); } },
        { icon: 'bi-arrows-expand', cls: 'warning', texto: 'Expandir Todo',       fn: function() { if(typeof toggleAllStatusGroups==='function') toggleAllStatusGroups(); } }
    ],
    'mantenimiento/placas': [
        { icon: 'bi-plus-lg', cls: 'primary', texto: 'Registrar Placa', fn: function() { var b = document.getElementById('btnNuevaPlaca'); if(b) b.click(); } }
    ],
    'directorio/conductores': [
        { icon: 'bi-person-plus-fill', cls: 'primary', texto: 'Nuevo Conductor', fn: function() { if(typeof abrirModalConductor==='function') abrirModalConductor(); } }
    ],
    'sistema/usuarios': [
        { icon: 'bi-person-plus-fill', cls: 'primary', texto: 'Nuevo Usuario', fn: function() { var b = document.getElementById('btnNuevoUsuario'); if(b) b.click(); } }
    ],
    'mantenimiento/fleetrun': [
        { icon: 'bi-plus-lg',         cls: 'primary',   texto: 'Nuevo Preventivo',           fn: function() { if(typeof window.abrirModalNuevoFleetrun==='function') window.abrirModalNuevoFleetrun(); } },
        { icon: 'bi-clock-history',    cls: 'info',      texto: 'Ver Historial Completo',      fn: function() { if(typeof toggleVistaFleetrun==='function') toggleVistaFleetrun(); } },
        { icon: 'bi-download',         cls: 'success',   texto: 'Exportar Excel',              fn: function() { if(typeof window.exportarExcelFleetrun==='function') window.exportarExcelFleetrun(); } }
    ],
    'mantenimiento/planificacion': [
        { icon: 'bi-plus-lg', cls: 'primary', texto: 'Nueva Planificación', fn: function() { if(typeof window.abrirModalNuevoPlan==='function') window.abrirModalNuevoPlan(); } }
    ],
    // Sin FAB
    'flota/status':             null,
    'flota/ubicacion':          null,
    'sistema/auditoria':        null,
    'sistema/configuracion':    null,
    'dashboard':                null,
    'almacen/inventario':       null,
    'almacen/unidades':         null,
    'almacen/sistemas':         null,
    'almacen/familias':         null,
    'almacen/marcas':           null,
};

function actualizarFAB() {
    if (window.innerWidth > 768) return;
    var fabContainer = document.querySelector('.fab-container');
    if (!fabContainer) return;
    var ruta = localStorage.getItem('fleet_rutaActual') || '';
    // Si está explícitamente mapeado como null → ocultar FAB
    if (FAB_ACCIONES_POR_RUTA.hasOwnProperty(ruta) && FAB_ACCIONES_POR_RUTA[ruta] === null) {
        fabContainer.style.visibility = 'hidden';
        fabContainer.style.pointerEvents = 'none';
    } else {
        fabContainer.style.visibility = '';
        fabContainer.style.pointerEvents = '';
    }
}

function generarListaAccionesFab() {
    const listContent = document.getElementById('fabActionListContent');
    listContent.innerHTML = '';

    const ruta = localStorage.getItem('fleet_rutaActual') || '';
    const accionesRuta = FAB_ACCIONES_POR_RUTA[ruta];

    // Usar acciones del mapa si están definidas
    if (Array.isArray(accionesRuta) && accionesRuta.length > 0) {
        accionesRuta.forEach(function(acc) {
            var item = document.createElement('div');
            item.className = 'fab-action-item';
            item.innerHTML = '<i class="bi ' + acc.icon + ' text-' + acc.cls + ' me-2"></i>' + acc.texto;
            item.addEventListener('click', function() {
                try { acc.fn(); } catch(e) { console.error(e); }
                setTimeout(toggleFabMenu, 150);
            });
            listContent.appendChild(item);
        });
        return;
    }

    // Fallback DOM scraping para módulos no mapeados
    let moduloActual = null;
    document.querySelectorAll('[id^="modulo"]').forEach(mod => {
        const display = window.getComputedStyle(mod).display;
        if (display === 'block' || display === 'flex') moduloActual = mod;
    });
    if (!moduloActual) { listContent.innerHTML = '<div class="text-center p-3 text-muted" style="font-size:0.8rem;">Sin acciones</div>'; return; }

    const divBotonesAll = moduloActual.querySelectorAll('.controls-row .d-flex.align-items-center.gap-2');
    const divBotones = divBotonesAll[divBotonesAll.length - 1];
    if (!divBotones) { listContent.innerHTML = '<div class="text-center p-3 text-muted" style="font-size:0.8rem;">Sin acciones</div>'; return; }

    const buttons = divBotones.querySelectorAll('button:not(.dropdown-toggle), .dropdown-item, .cache-badge');
    if (buttons.length === 0) { listContent.innerHTML = '<div class="text-center p-3 text-muted" style="font-size:0.8rem;">Sin acciones</div>'; return; }

    buttons.forEach(btn => {
        if (btn.style.display === 'none' || window.getComputedStyle(btn).display === 'none') return;
        // Excluir botones de recarga (solo icono bi-arrow-clockwise o title="Actualizar")
        if (btn.title === 'Actualizar') return;
        var icons = btn.querySelectorAll('i');
        if (icons.length === 1 && icons[0].className.includes('bi-arrow-clockwise') && btn.textContent.trim().length <= 1) return;
        let clonedBtn = btn.cloneNode(true);
        clonedBtn.removeAttribute('id');
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
        if (clonedBtn.tagName.toLowerCase() === 'span') { clonedBtn.style.cursor = 'default'; }
        else { clonedBtn.addEventListener('click', () => { setTimeout(toggleFabMenu, 150); }); }
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
            fetch('/api/script/obtenerDatosConductores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) }).then(r => r.json()).then(r => {
                let d = r.data || [];
                let driversSet = new Set();
                d.forEach(r => { if (r[1]) driversSet.add(r[1]); });
                rellenarDatalist(datalistID, driversSet);
            });
        }
    }, { once: true });
}

// ============================================================
// 🔍 LÓGICA DEL BUSCADOR GLOBAL (SPOTLIGHT)
// ============================================================

function abrirSpotlight() {
    let spotlightOverlayEl = document.getElementById('spotlight-overlay');
    if (spotlightOverlayEl) spotlightOverlayEl.style.display = 'flex';
    // Mostrar recientes al abrir
    const resContainer = document.getElementById('spotlight-results');
    if (resContainer) _renderRecientesSpotlight(resContainer);
    setTimeout(() => {
        let spotlightInputEl = document.getElementById('spotlight-input');
        if (spotlightInputEl) spotlightInputEl.focus();
    }, 100);
}

function _renderRecientesSpotlight(container) {
    try {
        var recientes = JSON.parse(localStorage.getItem('fleet_nav_recientes') || '[]').slice(0, 6);
        if (recientes.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-keyboard text-secondary" style="font-size:3rem;"></i><br><small class="mt-2 d-block">Escribe al menos 3 letras para buscar.</small></div>';
            return;
        }
        var html = '<div class="px-3 pt-3 pb-1" style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--subtext);">Recientes</div>';
        html += '<div class="d-flex flex-column gap-1 px-2 pb-2">';
        recientes.forEach(function(r) {
            var nombre = NOMBRES_MODULOS_RECIENTES[r.ruta] || r.ruta;
            var icono  = ICONOS_MODULOS_RECIENTES[r.ruta]  || 'bi-circle';
            html += '<button class="spotlight-card d-flex align-items-center gap-3 w-100 text-start btn-unstyled" onclick="cerrarSpotlight(); cargarModuloAislado(\'' + r.ruta + '\')" style="background:none;border:none;padding:10px 12px;border-radius:10px;cursor:pointer;transition:background 0.15s;">' +
                '<div style="width:34px;height:34px;border-radius:9px;background:rgba(37,99,235,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
                '<i class="bi ' + icono + '" style="color:var(--crm-accent);font-size:1rem;"></i></div>' +
                '<div><div style="font-size:0.875rem;font-weight:600;color:var(--text);">' + nombre + '</div>' +
                '<div style="font-size:0.72rem;color:var(--subtext);">Visitado recientemente</div></div>' +
                '<i class="bi bi-arrow-right ms-auto" style="color:var(--subtext);font-size:0.8rem;"></i></button>';
        });
        html += '</div>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '';
    }
}

function cerrarSpotlight() {
    let spotlightOverlayEl2 = document.getElementById('spotlight-overlay');
    if (spotlightOverlayEl2) spotlightOverlayEl2.style.display = 'none';

    let spotlightInputEl2 = document.getElementById('spotlight-input');
    if (spotlightInputEl2) spotlightInputEl2.value = '';

    let spotlightResultsEl = document.getElementById('spotlight-results');
    if (spotlightResultsEl) spotlightResultsEl.innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-keyboard text-secondary" style="font-size: 3rem;"></i><br><small class="mt-2 d-block">Escribe al menos 3 letras para buscar mágicamente en todo el CRM.</small></div>';
}

// Atajos de teclado globales
document.addEventListener('keydown', (e) => {
    // No activar si estamos en un input / textarea / contenteditable
    const tag     = document.activeElement ? document.activeElement.tagName : '';
    const editing = ['INPUT','TEXTAREA','SELECT'].includes(tag) || document.activeElement.isContentEditable;

    // Ctrl+K / Cmd+K — Spotlight
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); abrirSpotlight(); return;
    }
    // Ctrl+F — foco en buscador del módulo actual
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const buscador = document.querySelector('#root-dinamico input[type="text"][id*="buscador"], #root-dinamico input[type="search"]');
        if (buscador) { e.preventDefault(); buscador.focus(); buscador.select(); }
        return;
    }
    // ESC — cerrar Spotlight / modales
    let spotlightOverlayEl3 = document.getElementById('spotlight-overlay');
    if (e.key === 'Escape' && spotlightOverlayEl3 && spotlightOverlayEl3.style.display === 'flex') {
        cerrarSpotlight(); return;
    }

    if (editing) return; // los atajos de letra solo fuera de inputs

    switch(e.key) {
        case '?':
            e.preventDefault();
            new bootstrap.Modal(document.getElementById('modal-shortcuts')).show();
            break;
        case 'g': case 'G':
            if (!e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); cargarModuloAislado('dashboard'); }
            break;
        case 'e': case 'E':
            // Ej: click en primer botón de exportar visible
            var expBtn = document.querySelector('#root-dinamico [onclick*="exportar"], #root-dinamico [onclick*="descargar"], #root-dinamico .btn-reload-cache');
            if (expBtn) { e.preventDefault(); expBtn.click(); }
            break;
        case 'n': case 'N':
            // Abrir primer modal/botón de "Nuevo" visible
            var newBtn = document.querySelector('#root-dinamico [data-bs-toggle="modal"][title*="uevo"], #root-dinamico .btn[onclick*="abrirModal"]');
            if (newBtn) { e.preventDefault(); newBtn.click(); }
            break;
        case 'r': case 'R':
            // Reload módulo actual
            var reloadBtn = document.querySelector('#root-dinamico .btn-reload-cache');
            if (reloadBtn) { e.preventDefault(); reloadBtn.click(); }
            break;
    }
});

// ============================================================
// 🔍 LÓGICA DEL BUSCADOR GLOBAL V2 (CENTRO DE CONTROL)
// ============================================================
window.buscarSpotlight = function(query) {
    query = query.toLowerCase().trim();
    const resContainer = document.getElementById('spotlight-results');

    if (query.length < 3) {
        _renderRecientesSpotlight(resContainer);
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

    // 3. Buscar en Inspecciones (por placa, técnico)
    var inspData = window.dataGlobalInspecciones || [];
    if (inspData.length > 0 && count < 12) {
        var hoyS = new Date(); hoyS.setHours(0,0,0,0);
        var vistasInsp = new Set();
        inspData.forEach(function(i) {
            if (count >= 13) return;
            var pStr = (i.placa || '').toLowerCase();
            var tStr = (i.tecnico || '').toLowerCase();
            if (!(pStr.includes(query) || tStr.includes(query))) return;
            var key = (i.placa || '').toUpperCase();
            if (vistasInsp.has(key)) return;
            vistasInsp.add(key);
            var dias = '—'; var bClI = 'secondary';
            if (i.fecha_ingreso) {
                try {
                    var fi = i.fecha_ingreso.includes('/') ? (function(){var px=i.fecha_ingreso.split('/');return new Date(px[2],px[1]-1,px[0]);})() : new Date(i.fecha_ingreso+'T00:00:00');
                    var fp = new Date(fi); fp.setDate(fp.getDate()+(parseInt(i.dias_propuestos)||30));
                    dias = Math.ceil((fp-hoyS)/864e5);
                    bClI = dias<0?'danger':(dias<=7?'warning':'success');
                    dias = dias<0?'Vencida':(dias===0?'Hoy':'Faltan '+dias+'d');
                } catch(e) { dias='—'; }
            }
            html += '<div class="spotlight-card d-flex justify-content-between align-items-center" onclick="cerrarSpotlight();cargarModuloAislado(\'mantenimiento/inspecciones\');setTimeout(function(){var el=document.getElementById(\'buscadorStatus\');if(el){el.value=\''+key+'\';if(typeof filtrarStatusAvanzado===\'function\')filtrarStatusAvanzado();}},1200);">'
                + '<div><div class="fw-bold" style="color:#0ea5e9;font-size:0.95rem;"><i class="bi bi-clipboard2-check me-2"></i>' + key + '</div>'
                + '<div class="text-muted small mt-1">' + (i.tecnico||'Sin técnico') + ' · <span class="badge bg-'+bClI+'" style="font-size:0.65rem;">' + dias + '</span></div></div>'
                + '<i class="bi bi-arrow-right text-muted"></i></div>';
            count++;
        });
    }

    // 4. Buscar en Fleetrun (por tipo_mp)
    var fleetData = window.dataGlobalFleetrun || [];
    if (fleetData.length > 0 && count < 15 && query.length >= 3) {
        var tiposEncontrados = new Set();
        fleetData.forEach(function(r) {
            if (count >= 15) return;
            var tipoStr = (r[8] || '').toLowerCase();
            if (!tipoStr.includes(query)) return;
            if (tiposEncontrados.has(tipoStr)) return;
            tiposEncontrados.add(tipoStr);
            var cantPlacas = fleetData.filter(function(x) { return (x[8]||'').toLowerCase() === tipoStr; }).length;
            html += '<div class="spotlight-card d-flex justify-content-between align-items-center" onclick="cerrarSpotlight();cargarModuloAislado(\'mantenimiento/fleetrun\');setTimeout(function(){var el=document.getElementById(\'buscadorFleetrun\');if(el){el.value=\''+r[8]+'\';if(typeof filtrarFleetrunAvanzado===\'function\')filtrarFleetrunAvanzado();}},400);">'
                + '<div><div class="fw-bold" style="color:#2D438A;font-size:0.95rem;"><i class="bi bi-tools me-2"></i>' + (r[8]||'—') + '</div>'
                + '<div class="text-muted small mt-1">' + cantPlacas + ' registro' + (cantPlacas!==1?'s':'') + ' encontrado' + (cantPlacas!==1?'s':'') + '</div></div>'
                + '<i class="bi bi-arrow-right text-muted"></i></div>';
            count++;
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

// Habilita/deshabilita el botón de acción masiva según checkboxes marcados
window.toggleBulkBtn = function(modulo) {
    var checked = document.querySelectorAll('.chk-bulk-' + modulo + ':checked').length;
    var btnBulk = document.getElementById('btn-bulk-' + modulo);
    if (btnBulk) {
        btnBulk.disabled = checked === 0;
        btnBulk.innerHTML = checked > 0
            ? '<i class="bi bi-trash-fill me-1"></i>Eliminar (' + checked + ')'
            : '<i class="bi bi-trash me-1"></i>Eliminar sel.';
    }
};

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
