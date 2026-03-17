// ============================================================
// 🌉 EMULADOR DE GOOGLE APPS SCRIPT PARA NODE.JS
// ============================================================
class GoogleRunner {
    constructor() { this.successCb = null; this.failureCb = null; this.proxyRef = null; }
    withSuccessHandler(cb) { this.successCb = cb; return this.proxyRef; }
    withFailureHandler(cb) { this.failureCb = cb; return this.proxyRef; }
    async _call(method, ...args) {
        try {
            let parsedArgs = args.map(arg => {
                if (arg instanceof HTMLFormElement) { let obj = {}; new FormData(arg).forEach((value, key) => obj[key] = value); return obj; }
                return arg;
            });
            let res = await fetch('/api/script/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: parsedArgs }) });
            let json = await res.json();
            if (json.data && typeof json.data === 'object') {
                let strData = JSON.stringify(json.data);
                strData = strData.replace(/CamiÃ³n/gi, 'Camión').replace(/CAMIÃ.N/g, 'CAMIÓN').replace(/Ã³/g, 'ó').replace(/Ã"/g, 'Ó').replace(/Ã±/g, 'ñ').replace(/Ã'/g, 'Ñ').replace(/Ã/g, 'í');
                json.data = JSON.parse(strData);
            }
            if (this.successCb) this.successCb(json.data);
        } catch (e) { if (this.failureCb) this.failureCb(e); else console.error("Error BD:", e); }
    }
}
const google = { script: { get run() { let runner = new GoogleRunner(); let proxy = new Proxy(runner, { get: function(target, prop) { if (typeof target[prop] === 'function') return target[prop].bind(target); if (prop in target) return target[prop]; return (...args) => target._call(prop, ...args); } }); runner.proxyRef = proxy; return proxy; } } };

// ============================================================
// GLOBALES Y NAVEGACIÓN
// ============================================================
let usuarioLogueado = ''; let rolLogueado = ''; let permisosUsuario = {}; const TIEMPO_INACTIVIDAD = 30 * 60 * 1000;
const CACHE = { placas: null, fleetrun: null, usuarios: null, seguridad: null, auditoria: null, statusMant: null, statusFlota: null, wialon: null, conductores: null };
let dataGlobalPlacas = []; let dataGlobalFleetrun = []; let dataGlobalInspecciones = []; let dataGlobalStatusFlota = []; let dataTiposMant = []; 
let isHistorialFleetrun = false; let isHistorialStatus = false; let expandAllState = false; let expandAllSFState = false; let expandSFMap = {}; let chartTotalInst = null, chartMotorasInst = null, chartNoMotorasInst = null; 
let currentTab = 0; let canvasFirma; let ctxFirma; let dibujando = false;

document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.getElementById('theme-toggle'); const body = document.body; const saved = localStorage.getItem('theme');
  if (saved === 'dark') applyDark(true, false);
  if (toggle) toggle.addEventListener('change', () => applyDark(toggle.checked, true));
  function applyDark(isDark, save) {
    if (toggle) toggle.checked = isDark; body.classList.toggle('dark', isDark); document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
    if (save) localStorage.setItem('theme', isDark ? 'dark' : 'light');
    actualizarColoresGraficos();
  }
  verificarSesionGuardada();
  document.body.addEventListener('mousemove', registrarActividad); document.body.addEventListener('keypress', registrarActividad); document.body.addEventListener('click', registrarActividad);
  setInterval(verificarInactividad, 60000);
  generarWizardFase3(); 
});

function normalizarClase(str) { return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, ''); }
function toggleSidebar() { const sidebar = document.getElementById('sidebarMenu'); const backdrop = document.getElementById('sidebarBackdrop'); if (window.innerWidth <= 768) { const isOpen = sidebar.classList.contains('mobile-open'); sidebar.classList.toggle('mobile-open', !isOpen); backdrop.classList.toggle('active', !isOpen); } else { sidebar.classList.toggle('collapsed'); } }
function closeSidebar() { document.getElementById('sidebarMenu').classList.remove('mobile-open'); document.getElementById('sidebarBackdrop').classList.remove('active'); }
function togglePassword(inputId, btn) { const input = document.getElementById(inputId); const icon = btn.querySelector('i'); if (input.type === 'password') { input.type = 'text'; icon.classList.replace('bi-eye-fill', 'bi-eye-slash-fill'); } else { input.type = 'password'; icon.classList.replace('bi-eye-slash-fill', 'bi-eye-fill'); } }
function registrarActividad() { if (usuarioLogueado) localStorage.setItem('crm_ultimo_acceso', Date.now()); }
function verificarInactividad() { if (usuarioLogueado) { const ultimo = localStorage.getItem('crm_ultimo_acceso'); if (ultimo && (Date.now() - parseInt(ultimo) > TIEMPO_INACTIVIDAD)) cerrarSesion(); } }
function parseDateToDDMMYYYY(dateStr) { if(!dateStr) return "-"; if(typeof dateStr === 'string' && dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dateStr; if (typeof dateStr === 'string' && dateStr.includes('-')) { let p = dateStr.split('T')[0].split('-'); if(p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`; } let d = new Date(dateStr); if(isNaN(d.getTime())) return dateStr; let day = d.getDate().toString().padStart(2, '0'); let month = (d.getMonth() + 1).toString().padStart(2, '0'); return `${day}/${month}/${d.getFullYear()}`; }
function normalizeStr(str) { return str ? str.toString().trim().toUpperCase() : ""; }

function verificarSesionGuardada() {
    const guardadoUser = localStorage.getItem('crm_user'); const guardadoTime = localStorage.getItem('crm_ultimo_acceso'); const guardadoCorreo = localStorage.getItem('crm_correo'); const guardadoPermisos = localStorage.getItem('crm_permisos'); const guardadoRol = localStorage.getItem('crm_rol');
    if (guardadoUser && guardadoTime && Date.now() - parseInt(guardadoTime) < TIEMPO_INACTIVIDAD) {
        usuarioLogueado = guardadoUser; rolLogueado = guardadoRol && guardadoRol !== 'null' ? guardadoRol : 'Personalizado'; registrarActividad();
        try { let parsed = JSON.parse(guardadoPermisos || '{}'); permisosUsuario = (typeof parsed === 'string') ? JSON.parse(parsed) : parsed; } catch(e) { permisosUsuario = {}; }
        document.getElementById('nombre-usuario-top').innerText = usuarioLogueado; document.getElementById('perfil-nombre').innerText = usuarioLogueado; if (guardadoCorreo) document.getElementById('perfil-correo').innerText = guardadoCorreo;
        
        let p = permisosUsuario || {}; let isAdm = p.admin === true || (guardadoCorreo && guardadoCorreo.toLowerCase() === 'admin@azkell.com');
        let rolHtml = (guardadoCorreo && guardadoCorreo.toLowerCase() === 'admin@azkell.com') ? '<i class="bi bi-star-fill"></i> Fundador' : (isAdm ? '<i class="bi bi-star-fill"></i> Administrador' : `<i class="bi bi-person-gear"></i> ${rolLogueado}`);
        document.getElementById('perfil-rol-badge').innerHTML = rolHtml;

        ['wrap-mantenimiento', 'wrap-almacen', 'wrap-flota', 'wrap-usuarios', 'wrap-auditoria'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        let showMant = isAdm || p.mod_mant || p.insp?.l || p.placas?.l || p.fleet?.l; let showAlm = isAdm || p.mod_alm || p.placas?.l; let showFlota = isAdm || p.mod_flota || p.gps?.l || p.status?.l || p.seg?.l || p.cond?.l;
        
        if (showMant) document.getElementById('wrap-mantenimiento').style.display = 'block';
        if (showAlm) document.getElementById('wrap-almacen').style.display = 'block';
        if (showFlota) document.getElementById('wrap-flota').style.display = 'block';
        if (isAdm) document.getElementById('wrap-usuarios').style.display = 'block';
        if (isAdm || p.mod_auditoria) document.getElementById('wrap-auditoria').style.display = 'block';

        document.getElementById('pantalla-login').style.display = 'none'; document.getElementById('app-crm').style.display = 'flex';
        
        if (isAdm || p.insp?.l) cambiarModulo('statusMant', 'btnMenuStatusMant');
        else if (p.status?.l) cambiarModulo('statusFlota', 'btnMenuStatusFlota');
        else if (p.placas?.l) cambiarModulo('placas', 'btnMenuPlacasMant');
        else if (p.fleet?.l) cambiarModulo('fleetrun', 'btnMenuFleetrun');
        else if (p.gps?.l) cambiarModulo('ubicacion', 'btnMenuUbicacion');

        google.script.run.withSuccessHandler(d => {
            dataGlobalPlacas = d; CACHE['placas'] = d; 
            let placasSet = new Set(); d.forEach(r => { if(r[0] && r[0]!=="Placa" && r[0]!=="PLACA") placasSet.add(r[0]) });
            rellenarDatalist('dl-placas', placasSet); recargarWialon();
        }).obtenerDatosPlacas();
        google.script.run.withSuccessHandler(d => { dataTiposMant = d; }).obtenerTiposMantenimiento();
        return;
    }
    document.getElementById('app-crm').style.display = 'none'; document.getElementById('pantalla-login').style.display = 'flex';
}

async function iniciarSesion(event, formObj) {
    event.preventDefault(); const btn = document.getElementById('btn-login'); const msg = document.getElementById('mensaje-login');
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verificando...'; msg.style.display = 'none';
    try {
        const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: formObj.correo.value, password: formObj.password.value }) });
        const respuesta = await response.json();
        if (respuesta.exito) {
            localStorage.setItem('crm_user', respuesta.nombre); localStorage.setItem('crm_rol', respuesta.rol); localStorage.setItem('crm_correo', formObj.correo.value); localStorage.setItem('crm_permisos', respuesta.permisos || '{}'); localStorage.setItem('crm_ultimo_acceso', Date.now());
            formObj.reset(); btn.disabled = false; btn.innerHTML = 'Ingresar al Sistema'; verificarSesionGuardada(); 
        } else { msg.innerText = respuesta.mensaje; msg.style.display = 'block'; btn.disabled = false; btn.innerHTML = 'Ingresar al Sistema'; }
    } catch(error) { msg.innerText = 'Error de red: Servidor apagado.'; msg.style.display = 'block'; btn.disabled = false; btn.innerHTML = 'Ingresar al Sistema'; }
}

function cerrarSesion() {
    localStorage.removeItem('crm_user'); localStorage.removeItem('crm_rol'); localStorage.removeItem('crm_correo'); localStorage.removeItem('crm_ultimo_acceso'); localStorage.removeItem('crm_permisos');
    usuarioLogueado = ''; rolLogueado = ''; permisosUsuario = {};
    document.querySelectorAll('.modulo-wrapper').forEach(m => m.style.display = 'none');
    document.getElementById('app-crm').style.display = 'none'; document.getElementById('pantalla-login').style.display = 'flex';
}

function cargarModulo(nombre, fnRender, fnBackend) {
  if (CACHE[nombre] !== null && CACHE[nombre].length > 0) { fnRender(CACHE[nombre]); return; }
  let container = nombre === 'placas' ? 'contenedorPlacasDinamico' : (nombre === 'statusMant' ? 'contenedorStatusDinamico' : 'cuerpoTablaFleetrun');
  if(document.getElementById(container)) document.getElementById(container).innerHTML = '<div class="w-100 text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Cargando datos...</div>';
  google.script.run.withSuccessHandler(datos => {
      CACHE[nombre] = typeof datos === 'string' ? [] : datos;
      fnRender(datos);
  })[fnBackend]();
}

function recargarModulo(nombre) {
  CACHE[nombre] = null; 
  const acciones = { placas: () => cargarModulo('placas', mostrarPlacas, 'obtenerDatosPlacas'), fleetrun: () => cargarModulo('fleetrun', mostrarFleetrun, 'obtenerDatosFleetrun'), statusMant: () => cargarModulo('statusMant', mostrarStatusInspecciones, 'obtenerDatosInspecciones'), statusFlota: () => cargarModulo('statusFlota', mostrarStatusFlota, 'obtenerDatosStatusFlota') };
  if (acciones[nombre]) acciones[nombre]();
}

function cambiarModulo(modulo, idBoton) {
    document.querySelectorAll('.modulo-wrapper').forEach(m => { m.style.display = 'none'; });
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    if (idBoton) { const btnActivo = document.getElementById(idBoton); if (btnActivo) btnActivo.classList.add('active'); }
    const titulo = document.getElementById('tituloTopBar');

    if (modulo === 'placas' || modulo === 'almacenPlacas') { let el=document.getElementById('moduloPlacas'); if(el) el.style.display = 'flex'; titulo.innerText = (modulo === 'placas') ? 'Gestión de Placas' : 'Inventario de Placas'; cargarModulo('placas', mostrarPlacas, 'obtenerDatosPlacas'); }
    else if (modulo === 'statusMant') { let el=document.getElementById('moduloStatus'); if(el) el.style.display = 'flex'; titulo.innerText = 'Análisis de Inspecciones'; cargarModulo('statusMant', mostrarStatusInspecciones, 'obtenerDatosInspecciones'); }
    else if (modulo === 'fleetrun') { let el=document.getElementById('moduloFleetrun'); if(el) el.style.display = 'flex'; titulo.innerText = 'Sistema Fleetrun'; cargarModulo('fleetrun', mostrarFleetrun, 'obtenerDatosFleetrun'); }
    else if (modulo === 'statusFlota') { let el=document.getElementById('moduloStatusFlota'); if(el) el.style.display = 'flex'; titulo.innerText = 'Status de Flota'; cargarModulo('statusFlota', mostrarStatusFlota, 'obtenerDatosStatusFlota'); }
    
    if (window.innerWidth <= 768) closeSidebar();
}

// ============================================================
// 📡 WIALON GPS ROBUSTO
// ============================================================
function recargarWialon(forzarVista = false) {
    let btn = document.getElementById('btn-wialon-status'); let txt = document.getElementById('wialon-text');
    if(btn) { btn.className = 'btn btn-sm btn-outline-warning ms-3 rounded-pill px-3 shadow-sm'; txt.innerText = 'Conectando...'; }
    google.script.run.withSuccessHandler(d => {
        if(d && Array.isArray(d)) {
            CACHE['wialon'] = d;
            if(btn) { btn.className = 'btn btn-sm ms-3 btn-primary rounded-pill px-3 shadow-sm text-white'; txt.innerText = 'GPS Activo'; }
            let mStatus = document.getElementById('moduloStatus'); let mFleet = document.getElementById('moduloFleetrun');
            if (mStatus && (mStatus.style.display === 'flex' || mStatus.style.display === 'block')) mostrarStatusInspecciones(dataGlobalInspecciones);
            if (mFleet && (mFleet.style.display === 'flex' || mFleet.style.display === 'block')) mostrarFleetrun(dataGlobalFleetrun);
        } else {
            if(btn) { btn.className = 'btn btn-sm btn-danger ms-3 text-white rounded-pill px-3 shadow-sm'; txt.innerText = 'Error GPS'; }
        }
    }).obtenerDatosWialon();
}

function buscarWialonPorPlaca(placa) {
    if(!CACHE.wialon || !Array.isArray(CACHE.wialon)) return null;
    let pLimpia = placa.toString().replace(/[^A-Z0-9]/ig, '').toUpperCase();
    return CACHE.wialon.find(w => {
        let wPlaca = w.placa ? w.placa.replace(/[^A-Z0-9]/ig, '').toUpperCase() : "";
        let wNom = w.nombre_wialon ? w.nombre_wialon.replace(/[^A-Z0-9]/ig, '').toUpperCase() : "";
        return wPlaca.includes(pLimpia) || wNom.includes(pLimpia);
    });
}

function abrirMapaFlotante(placa, lat, lng) {
    document.getElementById('mapa-placa-titulo').innerHTML = `<i class="bi bi-geo-alt-fill"></i> Ubicación GPS: ${placa}`;
    document.getElementById('iframeMapaGPS').src = `https://maps.google.com/maps?q=${lat},${lng}&hl=es&z=16&output=embed`;
    new bootstrap.Modal(document.getElementById('modalMapaGPS')).show();
}

// ============================================================
// 🚙 MÓDULO PLACAS (TARJETAS SAAS)
// ============================================================
window.cambiarVistaPlacas = function(vista) {
    document.querySelectorAll('.btn-view-toggle').forEach(b => b.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    const contenedor = document.getElementById('contenedorPlacasDinamico');
    if(contenedor) contenedor.className = (vista === 'grid' ? 'placas-grid-view' : 'placas-list-view') + ' pb-5';
};

function mostrarPlacas(datos) { 
    if(!Array.isArray(datos)) return;
    datos.sort((a, b) => (a[0]||'').localeCompare(b[0]||'')); dataGlobalPlacas = datos; 
    let html = ''; let kpiCamion=0, kpiCarreta=0, kpiSemi=0, kpiTracto=0; 
    
    if (datos.length === 0 || (datos.length === 1 && datos[0][0].toUpperCase() === 'PLACA')) { 
        html = '<div class="w-100 text-center py-5 text-muted">No hay vehículos registrados.</div>'; 
    } else { 
        const setClientes = new Set(), setTipos = new Set(), setEstados = new Set(); 
        datos.forEach((fila, index) => { 
            if ((fila[0]||'').toUpperCase() === 'PLACA') return; 
            const plc = fila[0] ? fila[0].trim() : ''; const cli = fila[1] ? fila[1].trim() : 'Sin Asignar'; const tip = fila[2] ? fila[2].trim() : '-'; const mod = fila[3] ? fila[3].trim() : '-'; const mar = fila[4] ? fila[4].trim() : '-'; const uts = fila[10] ? fila[10].trim() : '-'; const est = fila[8] ? fila[8].trim() : ''; const enUso = fila[13] ? fila[13].trim().toUpperCase() : 'NO';
            
            if (cli !== '-' && cli.toUpperCase() !== 'CLIENTE') setClientes.add(cli); 
            if (tip !== '-' && tip.toUpperCase() !== 'TIPO') setTipos.add(tip); 
            if (est === 'Activa' || est === 'Inactiva') setEstados.add(est); 
            if (est === 'Eliminada') return; // Ocultamos papelera
            
            const t = tip.toLowerCase(); 
            if (t.includes('cami') || t.includes('camion')) kpiCamion++; else if (t.includes('carreta')) kpiCarreta++; else if (t.includes('semirremolque')||t.includes('semi')) kpiSemi++; else if (t.includes('tracto')) kpiTracto++; 

            let badgeCls = est === 'Activa' ? 'badge-green' : 'badge-red';
            let iconBadge = est === 'Activa' ? '<i class="bi bi-check-circle-fill me-1"></i>' : '<i class="bi bi-x-circle-fill me-1"></i>';

            let menuAcciones = `<div class="dropdown" onclick="event.stopPropagation()"><button class="btn-dots" type="button" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow"><li><a class="dropdown-item fw-bold" href="#" onclick="abrirModalEditarPlaca(${index})"><i class="bi bi-pencil text-primary"></i> Editar</a></li></ul></div>`; 

            html += `<div class="card-premium" onclick="abrirPanelDetallePlaca(event, ${index})" data-index="${index}" data-cliente="${cli}" data-tipo="${tip}" data-estado="${est}">
                <div class="card-header-theme">
                    <div><div class="card-title-prem">${plc}</div><div class="card-sub-prem text-truncate" style="max-width:140px;">${cli}</div></div>
                    <div class="d-flex align-items-center gap-2"><span class="badge-premium ${badgeCls}">${iconBadge}${est}</span>${menuAcciones}</div>
                </div>
                <div class="card-body-wrap border-top-theme">
                    <div class="card-data-row"><span>TIPO</span> <span class="theme-text">${tip}</span></div>
                    <div class="card-data-row"><span>MARCA</span> <span class="theme-text">${mar} ${mod !== '-' ? mod : ''}</span></div>
                    <div class="card-data-row"><span>EN USO</span> <span class="${enUso==='SI' ? 'text-primary' : 'text-muted'} fw-bold">${enUso}</span></div>
                </div>
            </div>`;
        }); 
        const fillList = (id, set, mobile) => { let el = document.getElementById(id + (mobile ? '-mobile' : '')); if(!el) return; el.innerHTML = `<li><button class="dropdown-item text-danger py-1" onclick="document.querySelectorAll('#${id}${mobile?'-mobile':''} input').forEach(c=>c.checked=false); filtrarPlacasAvanzado()"><i class="bi bi-x-circle"></i> Limpiar</button></li><li><hr class="dropdown-divider"></li>`; Array.from(set).sort().forEach(v => { const sid = `chk-${id}${mobile?'-m':''}-${normalizarClase(v)}`; el.innerHTML += `<li><div class="form-check px-3 py-1"><input class="form-check-input ms-0 me-2" type="checkbox" value="${v}" id="${sid}" onchange="filtrarPlacasAvanzado()"><label class="form-check-label small theme-text" for="${sid}">${v}</label></div></li>`; }); };
        fillList('filtroCliente', setClientes, false); fillList('filtroTipo', setTipos, false); fillList('filtroEstado', setEstados, false);
        fillList('filtroCliente', setClientes, true); fillList('filtroTipo', setTipos, true); fillList('filtroEstado', setEstados, true);
    } 
    document.getElementById('contenedorPlacasDinamico').innerHTML = html; 
    document.getElementById('kpi-camion').innerText = kpiCamion; document.getElementById('kpi-carreta').innerText = kpiCarreta; document.getElementById('kpi-semi').innerText = kpiSemi; document.getElementById('kpi-tracto').innerText = kpiTracto; 
}

window.filtrarPlacasAvanzado = function() {
    const txt = document.getElementById('buscadorPlacas')?.value.toLowerCase() || ''; 
    const chkCli = Array.from(document.querySelectorAll('#filtroCliente input:checked, #filtroCliente-mobile input:checked')).map(e=>e.value); 
    const chkTip = Array.from(document.querySelectorAll('#filtroTipo input:checked, #filtroTipo-mobile input:checked')).map(e=>e.value); 
    const chkEst = Array.from(document.querySelectorAll('#filtroEstado input:checked, #filtroEstado-mobile input:checked')).map(e=>e.value); 
    document.querySelectorAll('#contenedorPlacasDinamico .card-premium').forEach(card => {
        const cli = card.getAttribute('data-cliente'); const tip = card.getAttribute('data-tipo'); const est = card.getAttribute('data-estado');
        const okTxt = !txt || card.innerText.toLowerCase().includes(txt);
        const okCli = chkCli.length === 0 || chkCli.includes(cli);
        const okTip = chkTip.length === 0 || chkTip.includes(tip);
        const okEst = chkEst.length === 0 || chkEst.includes(est);
        card.style.display = (okTxt && okCli && okTip && okEst) ? '' : 'none';
    });
};

window.abrirPanelDetallePlaca = function(event, index) { 
    if (event.target.closest('.dropdown') || event.target.closest('.btn-icon-dropdown')) return;
    const p = dataGlobalPlacas[index]; if (!p) return; 
    document.querySelectorAll('#contenedorPlacasDinamico .card-premium').forEach(c => c.classList.remove('active')); event.currentTarget.classList.add('active');
    const setSafe = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val || '-'; };
    setSafe('det-placa-header', p[0]); setSafe('det-marca-header', p[4]); setSafe('det-modelo-header', p[3]);
    const badge = document.getElementById('det-estado-badge');
    if(badge) { badge.className = `badge-premium ${p[8]==='Activa' ? 'badge-green' : 'badge-red'}`; badge.innerHTML = p[8]==='Activa' ? '<i class="bi bi-check-circle-fill me-1"></i>Activa' : '<i class="bi bi-x-circle-fill me-1"></i>Inactiva'; }
    setSafe('det-cliente', p[1]); setSafe('det-ruc', p[5]); setSafe('det-uts', p[10]); setSafe('det-operativo', p[9]); setSafe('det-enuso', p[13]); setSafe('det-tipo', p[2]); setSafe('det-motora', p[11]); setSafe('det-conf', p[6]); setSafe('det-comb', p[7]); setSafe('det-llantas', p[12]);
    document.getElementById('paneDetallePlaca').classList.remove('d-none');
};
window.cerrarPanelDetallePlaca = function() { document.getElementById('paneDetallePlaca').classList.add('d-none'); document.querySelectorAll('#contenedorPlacasDinamico .card-premium').forEach(c => c.classList.remove('active')); };


// ============================================================
// 🛡️ MÓDULO ANÁLISIS DE INSPECCIONES (STATUS)
// ============================================================
window.cambiarVistaInsp = function(vista) {
    window.vistaActualInsp = vista;
    document.querySelectorAll('.btn-view-toggle').forEach(b => b.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    const contenedor = document.getElementById('contenedorStatusDinamico');
    if(contenedor) contenedor.className = (vista === 'grid' ? 'status-grid-view' : 'status-list-view') + ' pb-5';
};

function mostrarStatusInspecciones(inspecciones) {
  if (!Array.isArray(inspecciones)) return;
  dataGlobalInspecciones = inspecciones; let hoy = new Date(); hoy.setHours(0,0,0,0);
  let numId = (id) => parseInt((id || '').split('-')[1]) || 0;
  let inspeccionesOrdenadas = [...inspecciones].sort((a, b) => numId(b.id) - numId(a.id));
  inspeccionesOrdenadas = inspeccionesOrdenadas.filter(i => i.estado !== 'Eliminada'); 
  
  let dataFinal = [];
  
  // 🔥 CONDICIÓN ESTRICTA: PLACA ESTÁ "ACTIVA" Y "EN USO"
  let placasActivasEnUso = dataGlobalPlacas.filter(p => {
      let estado = p[8] ? p[8].toString().trim().toUpperCase() : "";
      let enUso = p[13] ? p[13].toString().trim().toUpperCase() : "";
      return estado === "ACTIVA" && enUso === "SI";
  });

  if (!isHistorialStatus) {
      // Muestra solo la última inspección de las placas "Activas y En Uso"
      placasActivasEnUso.forEach(p => { 
          let placaStr = normalizeStr(p[0]); 
          let insp = inspeccionesOrdenadas.find(i => normalizeStr(i.placa) === placaStr); 
          dataFinal.push({ infoPlaca: p, insp: insp }); 
      });
  } else {
      inspeccionesOrdenadas.forEach(insp => { 
          let placaStr = normalizeStr(insp.placa); 
          let p = dataGlobalPlacas.find(pl => normalizeStr(pl[0]) === placaStr) || [insp.placa, "-","-","-","-","-","-","-","-","-","-","-","-","-"]; 
          dataFinal.push({ infoPlaca: p, insp: insp }); 
      });
  }

  let html = ''; let setClis = new Set(), setEstadosStatus = new Set();
  let cntTotalVig = 0, cntTotalNoVig = 0, cntMotVig = 0, cntMotNoVig = 0, cntNoMotVig = 0, cntNoMotNoVig = 0;

  if(dataFinal.length === 0) { 
      html = '<div class="w-100 text-center py-5 text-muted">No hay inspecciones para las placas Activas y en Uso.</div>'; 
  } else {
      dataFinal.forEach((item, index) => {
          let p = item.infoPlaca; let insp = item.insp; let placa = p[0]; let cli = p[1] || "-"; let mod = p[3] || "-"; let motora = p[11] || "-";
          if(cli !== "-") setClis.add(cli); 

          let fIngresoBonita = "-"; let diasRestantes = -9999; let tecnico = "Sin asignar"; let txtEstado = ""; let textoBadgeProx = "";
          
          if(insp && insp.fecha_ingreso) {
              fIngresoBonita = parseDateToDDMMYYYY(insp.fecha_ingreso); tecnico = insp.tecnico || tecnico;
              let fIngreso = insp.fecha_ingreso.includes('/') ? new Date(insp.fecha_ingreso.split('/')[2], insp.fecha_ingreso.split('/')[1]-1, insp.fecha_ingreso.split('/')[0]) : new Date(insp.fecha_ingreso + "T00:00:00");
              let dProp = parseInt(insp.dias_propuestos) || 30;
              let fProx = new Date(fIngreso.getTime()); fProx.setDate(fProx.getDate() + dProp);
              diasRestantes = Math.ceil((fProx - hoy) / (1000 * 60 * 60 * 24));
          }

          if (diasRestantes === -9999) { txtEstado = "SIN REGISTRO"; textoBadgeProx = "No Aplica"; } 
          else if (diasRestantes < 0) { txtEstado = "VENCIDO"; textoBadgeProx = `Hace ${Math.abs(diasRestantes)} d`; cntTotalNoVig++; if(normalizeStr(motora).includes("MOTORA")) cntMotNoVig++; else cntNoMotNoVig++; } 
          else if (diasRestantes <= 7) { txtEstado = "POR VENCER"; textoBadgeProx = `Faltan ${diasRestantes} d`; cntTotalVig++; if(normalizeStr(motora).includes("MOTORA")) cntMotVig++; else cntNoMotVig++; } 
          else { txtEstado = "VIGENTE"; textoBadgeProx = `Faltan ${diasRestantes} d`; cntTotalVig++; if(normalizeStr(motora).includes("MOTORA")) cntMotVig++; else cntNoMotVig++; }
          
          if(txtEstado !== "SIN REGISTRO") setEstadosStatus.add(txtEstado);
          let badgeCls = txtEstado === 'VIGENTE' ? 'badge-green' : (txtEstado === 'VENCIDO' ? 'badge-red' : (txtEstado === 'POR VENCER' ? 'badge-yellow' : 'badge-secondary'));

          window[`inspDataTemp_${index}`] = { placa: placa, cliente: cli, tecnico: tecnico, fecha_ingreso: fIngresoBonita, estado: txtEstado, fallas: insp?.detalles_json || null, id: insp?.id || null, badgeCls: badgeCls, textoBadgeProx: textoBadgeProx };

          html += `
          <div class="status-card" onclick="abrirPanelDetalleStatus(event, ${index})" data-index="${index}" data-cliente="${cli}" data-estado="${txtEstado}" data-txt="${placa} ${tecnico}">
              <div class="status-card-header">
                  <div><div class="status-card-title">${placa}</div><div class="status-card-subtitle text-truncate" style="max-width:140px;"><i class="bi bi-person me-1"></i>${tecnico}</div></div>
                  <div class="d-flex flex-column align-items-end gap-1">
                      <span class="status-card-badge badge-premium ${badgeCls}">${txtEstado}</span>
                      <span style="font-size:0.7rem; color:var(--prem-muted); font-weight:bold;">${textoBadgeProx}</span>
                  </div>
              </div>
              <div class="status-card-body">
                  <div class="status-card-field"><div class="status-card-field-label">FECHA</div><div class="status-card-field-value theme-text">${fIngresoBonita}</div></div>
                  <div class="status-card-field"><div class="status-card-field-label">CLIENTE</div><div class="status-card-field-value theme-text text-truncate" style="max-width:100px;">${cli}</div></div>
              </div>
          </div>`;
      });
      
      const fillList = (id, set, isMobile) => { let suffix = isMobile ? '-mobile' : ''; let ul = document.getElementById(id + suffix); if(!ul) return; ul.innerHTML = `<li><button class="dropdown-item text-danger py-1" onclick="document.querySelectorAll('#${id}${suffix} input').forEach(c=>c.checked=false); filtrarStatusAvanzado()"><i class="bi bi-x-circle"></i> Limpiar</button></li><li><hr class="dropdown-divider"></li>`; Array.from(set).sort().forEach(v => { const sid = `chk-${id}${suffix}-${normalizarClase(v)}`; ul.innerHTML += `<li><div class="form-check px-3 py-1"><input class="form-check-input ms-0 me-2" type="checkbox" value="${v}" id="${sid}" onchange="filtrarStatusAvanzado()"><label class="form-check-label small theme-text" for="${sid}">${v}</label></div></li>`; }); };
      fillList('filtroStatusCliente', setClis, false); fillList('filtroStatusEstado', setEstadosStatus, false);
      fillList('filtroStatusCliente', setClis, true); fillList('filtroStatusEstado', setEstadosStatus, true);
  }
  document.getElementById('contenedorStatusDinamico').innerHTML = html;
  updateGraficosEnVivo(cntTotalVig, cntTotalNoVig, cntMotVig, cntMotNoVig, cntNoMotVig, cntNoMotNoVig);
}

window.filtrarStatusAvanzado = function() {
    const txt = document.getElementById('buscadorStatus')?.value.toLowerCase() || ''; 
    const chkCli = Array.from(document.querySelectorAll('#filtroStatusCliente input:checked, #filtroStatusCliente-mobile input:checked')).map(e=>e.value); 
    const chkEst = Array.from(document.querySelectorAll('#filtroStatusEstado input:checked, #filtroStatusEstado-mobile input:checked')).map(e=>e.value); 
    document.querySelectorAll('#contenedorStatusDinamico .status-card').forEach(card => {
        const cli = card.getAttribute('data-cliente'); const est = card.getAttribute('data-estado'); const texto = card.getAttribute('data-txt').toLowerCase();
        const okTxt = !txt || texto.includes(txt); const okCli = chkCli.length === 0 || chkCli.includes(cli); const okEst = chkEst.length === 0 || chkEst.includes(est);
        card.style.display = (okTxt && okCli && okEst) ? '' : 'none';
    });
};

window.abrirPanelDetalleStatus = function(event, index) {
    const obj = window[`inspDataTemp_${index}`]; if(!obj) return;
    document.querySelectorAll('#contenedorStatusDinamico .status-card').forEach(c => c.classList.remove('active')); event.currentTarget.classList.add('active');
    document.getElementById('det-insp-placa').innerText = obj.placa;
    const badge = document.getElementById('det-insp-estado'); badge.className = `badge-premium ${obj.badgeCls}`; badge.innerHTML = obj.estado;
    document.getElementById('det-insp-fecha').innerText = obj.fecha_ingreso; document.getElementById('det-insp-tec').innerText = obj.tecnico;
    document.getElementById('det-insp-km').innerText = obj.km ? obj.km.toLocaleString() + ' km' : '-'; document.getElementById('det-insp-prox').innerText = obj.textoBadgeProx;

    let ubicacionHtml = '<span class="text-muted small">Sin conexión GPS</span>';
    let wialonData = buscarWialonPorPlaca(obj.placa);
    if (wialonData && wialonData.lat !== 0) {
        ubicacionHtml = `<div class="d-flex gap-2"><button class="btn btn-sm btn-primary fw-bold text-white py-0 px-2" onclick="abrirMapaFlotante('${obj.placa}', ${wialonData.lat}, ${wialonData.lng})"><i class="bi bi-map"></i> Mapa</button><span class="badge bg-secondary d-flex align-items-center"><i class="bi bi-speedometer me-1"></i> ${wialonData.km.toLocaleString()} km</span></div>`;
    }
    document.getElementById('det-insp-wialon').innerHTML = ubicacionHtml;

    let htmlFallas = "";
    if (obj.fallas) {
        try {
            let detallesArray = typeof obj.fallas === 'string' ? JSON.parse(obj.fallas) : obj.fallas;
            detallesArray.forEach(d => {
                if(d.estado === "SIN DATOS" || d.estado === "") return;
                let colorTxt = "var(--prem-text)"; let icon = "ℹ️";
                if(d.estado === "FALLA") { colorTxt = "var(--prem-red-txt)"; icon = "❌"; } else if(d.estado === "OK") { colorTxt = "var(--prem-green-txt)"; icon = "✅"; }
                let fotoBtn = ""; if (d.foto && d.foto.length > 100) { let nombreSeguro = d.item.replace(/'/g, "\\'"); fotoBtn = `<button class="btn btn-sm btn-outline-secondary py-0 px-2 ms-2" onclick="verFotoEvidencia('${d.foto}', 'Evidencia: ${nombreSeguro}')"><i class="bi bi-camera"></i> Foto</button>`; }
                htmlFallas += `<div class="p-2 border-bottom-theme mb-1"><strong class="d-block text-muted small">${d.categoria.replace(/^\d+\.\s*/, '')}</strong><span class="theme-text">${d.item}:</span> <span style="color:${colorTxt}; font-weight:bold;">${icon} ${d.estado}</span> ${fotoBtn} ${d.observacion ? `<div class="text-danger small mt-1 fst-italic">Obs: ${d.observacion}</div>` : ''}</div>`;
            });
        } catch(e) {}
    }
    if(htmlFallas === "") htmlFallas = '<div class="text-muted p-2">Sin hallazgos registrados.</div>';
    document.getElementById('det-insp-fallas-container').innerHTML = htmlFallas;

    let btnPdf = document.getElementById('btnPdfPaneStatus'); let btnEdit = document.getElementById('btnEditPaneStatus');
    if (obj.id) {
        btnPdf.style.display = 'block'; btnPdf.onclick = () => verDetalleInspeccion(obj.id, false);
        btnEdit.style.display = 'block'; btnEdit.onclick = () => abrirModalEditarInspeccion(obj.id);
    } else { btnPdf.style.display = 'none'; btnEdit.style.display = 'none'; }
    document.getElementById('paneDetalleStatus').classList.remove('d-none');
};
window.cerrarPanelDetalleStatus = function() { document.getElementById('paneDetalleStatus').classList.add('d-none'); document.querySelectorAll('#contenedorStatusDinamico .status-card').forEach(c => c.classList.remove('active')); };


// ============================================================
// ⚙️ MÓDULO FLEETRUN (TABLA MODERNA EXPANDIBLE)
// ============================================================
function mostrarFleetrun(datos) {
  if (procesadorErroresCuota(datos, 'cuerpoTablaFleetrun')) return;
  dataGlobalFleetrun = datos;

  let parseFecha = (str) => {
      if(!str) return 0; let p = str.split('/'); if(p.length === 3) return new Date(p[2], p[1]-1, p[0]).getTime();
      let isoTest = new Date(str).getTime(); return isNaN(isoTest) ? 0 : isoTest;
  };
  let datosOrdenados = [...datos].sort((a,b) => parseFecha(b[1]) - parseFecha(a[1]));

  let datosAMostrar = [];
  if (isHistorialFleetrun) {
      datosAMostrar = datosOrdenados;
  } else {
      let mapa = new Map();
      datosOrdenados.forEach(row => {
          let placa = normalizeStr(row[4]); let tipo = normalizeStr(row[8]); let key = placa + "_" + tipo; 
          let infoPlaca = dataGlobalPlacas.find(p => normalizeStr(p[0]) === placa);
          
          // 🔥 CONDICIÓN ESTRICTA: PLACA ESTÁ "ACTIVA" Y "EN USO"
          let estado = infoPlaca && infoPlaca[8] ? infoPlaca[8].toString().trim().toUpperCase() : "";
          let enUso = infoPlaca && infoPlaca[13] ? infoPlaca[13].toString().trim().toUpperCase() : "";

          if (estado === 'ACTIVA' && enUso === 'SI' && !mapa.has(key)) {
              mapa.set(key, row);
          }
      });
      datosAMostrar = Array.from(mapa.values());
  }

  let html = '';
  if(!datosAMostrar || datosAMostrar.length === 0) { html = '<tr><td colspan="10" class="text-center py-4" style="color: var(--subtext) !important;">No hay mantenimientos preventivos para las placas Activas y en Uso.</td></tr>'; } 
  else {
      let p = permisosUsuario || {}; let isAdmF = p.admin === true || (localStorage.getItem('crm_correo') || '').toLowerCase() === 'admin@azkell.com'; let canEditF = isAdmF || p.fleet?.e === true; let canDeleteF = isAdmF || p.fleet?.d === true; let setFClientes = new Set(); let setFUts = new Set(); let mapPlacas = new Map(); 
      datosAMostrar.forEach((fila) => { let placaRaw = fila[4] || "-"; if(!mapPlacas.has(placaRaw)) mapPlacas.set(placaRaw, []); mapPlacas.get(placaRaw).push(fila); });
      
      mapPlacas.forEach((mantenimientos, placaRaw) => {
          let infoP = dataGlobalPlacas.find(p => p[0] === placaRaw); 
          let cli = infoP ? infoP[1] : (mantenimientos[0][6] || "-"); 
          let utsRaw = infoP ? infoP[10] : (mantenimientos[0][7] || "-"); 
          let utsDisplay = (utsRaw === "-" || utsRaw === "") ? "-" : utsRaw.charAt(0).toUpperCase() + utsRaw.slice(1).toLowerCase();
          
          if(cli && cli !== "-") setFClientes.add(cli); if(utsDisplay !== "-") setFUts.add(utsDisplay);
          
          let classPlaca = normalizarClase(placaRaw);
          html += `<tr class="group-header data-row-fleetrun" style="cursor:pointer;" onclick="toggleGroupRow('child-${classPlaca}', this)" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}">
              <td colspan="10" class="fw-bold text-start"><i class="bi bi-chevron-right ms-1 me-2 text-primary toggle-icon-${classPlaca}"></i> <span style="display:inline-block; min-width:80px; color: var(--text);">${placaRaw}</span><span class="badge bg-secondary ms-2">${cli}</span><span class="badge bg-primary ms-2">${utsDisplay}</span><span class="group-count float-end">${mantenimientos.length} Registros</span></td></tr>`;
          
          mantenimientos.forEach((fila) => {
              let id = fila[0]; let fechaStr = fila[1]; let tipo_mp = fila[8]; let obs = fila[12]; let km_cambio = parseFloat(fila[9]) || 0; let frecuencia = parseFloat(fila[10]) || 0; let km_prox = parseFloat(fila[11]) || 0; let fechaLimpia = parseDateToDDMMYYYY(fechaStr);
              
              let km_gps = parseFloat(fila[14]) || 0;
              let isLive = false; let wialonData = buscarWialonPorPlaca(placaRaw);
              if (wialonData) { km_gps = wialonData.km; isLive = true; }
              
              let falta_km = km_prox - km_gps; let colorFalta = ""; let iconFalta = "";
              if (falta_km <= 0) { colorFalta = "var(--prem-red-txt)"; iconFalta = `<i class="bi bi-exclamation-circle-fill"></i>`; } else if (falta_km > 0 && ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100))) { colorFalta = "#f59e0b"; iconFalta = `<i class="bi bi-exclamation-triangle-fill"></i>`; } else { colorFalta = "var(--prem-green-txt)"; iconFalta = `<i class="bi bi-check-circle-fill"></i>`; }
              let fmtTipo = `<span style="color: var(--crm-accent); font-weight: bold;">${tipo_mp}</span>`; let fmtFrec = `<span style="color: #f59e0b; font-weight: bold;">${frecuencia.toLocaleString()}</span>`; 
              
              let fmtKmGps = isLive ? `<span class="badge bg-primary shadow-sm px-2"><i class="bi bi-broadcast"></i> ${km_gps.toLocaleString()}</span>` : `<span style="color: var(--subtext); font-weight: bold;">${km_gps.toLocaleString()}</span>`; 
              let fmtFalta = `<span style="color: ${colorFalta}; font-weight: bold;">${iconFalta} ${falta_km.toLocaleString()}</span>`;
              
              let menuAcciones = ''; if (canEditF || canDeleteF) { let items = ''; if(canEditF) items += `<li><a class="dropdown-item" href="#" onclick="abrirModalEditarFleetrun('${id}')"><i class="bi bi-pencil text-primary"></i> Editar</a></li>`; if(canEditF && canDeleteF) items += `<li><hr class="dropdown-divider"></li>`; if(canDeleteF) items += `<li><a class="dropdown-item text-danger fw-bold" href="#" onclick="eliminarRegistro('${id}', 'Fleetrun')"><i class="bi bi-trash"></i> Eliminar</a></li>`; menuAcciones = `<div class="dropstart text-center"><button class="btn-dots" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu shadow">${items}</ul></div>`; } else { menuAcciones = `<span class="text-muted"><i class="bi bi-dash"></i></span>`; }
              let originalIndex = dataGlobalFleetrun.findIndex(x => x[0] === id); 
              html += `<tr class="child-${classPlaca} clickable-row data-row-fleetrun child-row-fleetrun" style="display:none;" data-cliente="${cli}" data-uts="${utsDisplay}" data-placa="${placaRaw}" data-fecha="${fechaLimpia}"><td class="text-end text-muted" style="font-size: 0.75rem;" data-value="${placaRaw}">∟</td><td>${fechaLimpia}</td><td>${fmtTipo}</td><td>${km_cambio.toLocaleString()}</td><td>${fmtFalta}</td><td>${km_prox.toLocaleString()}</td><td class="text-truncate" style="max-width: 150px;">${obs}</td><td>${fmtFrec}</td><td>${fmtKmGps}</td><td>${menuAcciones}</td></tr>`;
          });
      });
      rellenarFiltroCheck('filtroFleetCliente', setFClientes, 'filtrarFleetrunAvanzado'); rellenarFiltroCheck('filtroFleetUts', setFUts, 'filtrarFleetrunAvanzado');
  }
  document.getElementById('cuerpoTablaFleetrun').innerHTML = html;
}

function filtrarFleetrunAvanzado() { const txt = document.getElementById('buscadorFleetrun')?.value.toLowerCase() || ''; const dateF = document.getElementById('buscadorFechaFleetrun')?.value || ''; let dateCompare = ''; if(dateF) { let p = dateF.split('-'); dateCompare = `${p[2]}/${p[1]}/${p[0]}`; } const chkCli = Array.from(document.querySelectorAll('#filtroFleetCliente input:checked')).map(e=>e.value); const chkUts = Array.from(document.querySelectorAll('#filtroFleetUts input:checked')).map(e=>e.value); let isFiltering = txt !== '' || dateCompare !== '' || chkCli.length > 0 || chkUts.length > 0; const headers = document.querySelectorAll('#cuerpoTablaFleetrun tr.group-header'); headers.forEach(header => { const placaRaw = header.getAttribute('data-placa'); const classPlaca = normalizarClase(placaRaw); const cli = header.getAttribute('data-cliente'); const uts = header.getAttribute('data-uts'); let childRows = document.querySelectorAll(`.child-${classPlaca}`); let hasVisibleChild = false; let matchCli = (!chkCli.length || chkCli.includes(cli)); let matchUts = (!chkUts.length || chkUts.includes(uts)); if(matchCli && matchUts) { childRows.forEach(row => { let textoRow = row.innerText.toLowerCase() + " " + placaRaw.toLowerCase(); let rowFecha = row.getAttribute('data-fecha'); let matchTxt = (!txt || textoRow.includes(txt)); let matchDate = (!dateCompare || rowFecha === dateCompare); if(matchTxt && matchDate) { row.style.display = isFiltering ? '' : (expandAllState ? '' : 'none'); hasVisibleChild = true; } else { row.style.display = 'none'; } }); let icon = header.querySelector('i'); if(icon) { if (isFiltering && hasVisibleChild) icon.className = "bi bi-chevron-down ms-1 me-2 text-primary"; else icon.className = expandAllState ? "bi bi-chevron-down ms-1 me-2 text-primary" : "bi bi-chevron-right ms-1 me-2 text-primary"; } } else { childRows.forEach(row => row.style.display = 'none'); } header.style.display = hasVisibleChild ? '' : 'none'; }); }
function toggleGroupRow(className, trElement) { let rows = document.querySelectorAll('.' + className); let icon = trElement.querySelector('i'); let isHidden = false; if(rows.length > 0) isHidden = rows[0].style.display === 'none'; rows.forEach(row => { row.style.display = isHidden ? '' : 'none'; }); if(icon) { icon.className = isHidden ? "bi bi-chevron-down ms-1 me-2 text-primary" : "bi bi-chevron-right ms-1 me-2 text-primary"; } }
function toggleAllFleetrunGroups() { expandAllState = !expandAllState; const rows = document.querySelectorAll('.child-row-fleetrun'); const icons = document.querySelectorAll('#cuerpoTablaFleetrun .group-header i'); rows.forEach(row => { let header = row.previousElementSibling; while(header && !header.classList.contains('group-header')) { header = header.previousElementSibling; } if(header && header.style.display !== 'none') { row.style.display = expandAllState ? '' : 'none'; } }); icons.forEach(i => { if(i.classList.contains('text-primary')) { i.className = expandAllState ? "bi bi-chevron-down ms-1 me-2 text-primary" : "bi bi-chevron-right ms-1 me-2 text-primary"; } }); }

// Resto de la lógica (generarPDF, WIZARD, Conductores) queda intacto como en tu código original.

// IMPORTANTE: Asegúrate de tener estas dos funciones de utilidad para rellenar los filtros visuales (para Placas, Status, Fleetrun)
function rellenarFiltroCheck(idUl, setDatos, funcionFiltrar) {
    let ul = document.getElementById(idUl);
    if (!ul) return;
    ul.innerHTML = `<li><button class="dropdown-item text-danger py-1 fw-bold" onclick="document.querySelectorAll('#${idUl} input').forEach(c=>c.checked=false); ${funcionFiltrar}(); event.stopPropagation();"><i class="bi bi-x-circle"></i> Limpiar Filtro</button></li><li><hr class="dropdown-divider"></li>`;
    Array.from(setDatos).sort().forEach(val => {
        let sid = 'chk_' + idUl + '_' + normalizarClase(val);
        ul.innerHTML += `<li><div class="form-check px-3 py-1"><input class="form-check-input ms-0 me-2" type="checkbox" value="${val}" id="${sid}" onchange="${funcionFiltrar}(); event.stopPropagation();"><label class="form-check-label small theme-text" for="${sid}">${val}</label></div></li>`;
    });
}
function rellenarDatalist(id, setDatos) {
    let dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = '';
    Array.from(setDatos).sort().forEach(val => {
        dl.innerHTML += `<option value="${val}">`;
    });
}