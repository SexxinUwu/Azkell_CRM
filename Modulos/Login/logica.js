// ================================================================
// MÓDULO: LOGIN — verificación de sesión, inicio y cierre
// Cargado dinámicamente por cargarModuloAislado('login')
// ================================================================

window.verificarSesionGuardada = function() {
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
            permisosUsuario = parsed || {};
        } catch(e) { permisosUsuario = {}; }

        document.getElementById('nombre-usuario-top').innerText = usuarioLogueado;
        document.getElementById('perfil-nombre').innerText = usuarioLogueado;
        if (guardadoCorreo) document.getElementById('perfil-correo').innerText = guardadoCorreo;
        let inputInsp = document.getElementById('input-inspector-nuevo'); if(inputInsp) inputInsp.value = usuarioLogueado;

        let p = permisosUsuario || {};
        let isAdm = p?.admin === true || (guardadoCorreo && guardadoCorreo.toLowerCase() === 'admin@azkell.com');

        let rolHtml = (guardadoCorreo && guardadoCorreo.toLowerCase() === 'admin@azkell.com') ? '<span class="badge bg-dark text-warning shadow-sm"><i class="bi bi-star-fill"></i> Fundador</span>'
                    : (isAdm ? '<span class="badge bg-warning text-dark shadow-sm"><i class="bi bi-star-fill"></i> Administrador</span>'
                    : `<span class="badge bg-primary shadow-sm"><i class="bi bi-person-gear"></i> ${rolLogueado}</span>`);

        let topBadge = document.getElementById('badge-rol-top'); if(topBadge) topBadge.innerHTML = rolHtml;
        let perfilBadge = document.getElementById('perfil-rol-badge'); if(perfilBadge) perfilBadge.innerHTML = rolHtml;

        const nMant = document.getElementById('wrap-mantenimiento'); const nAlm = document.getElementById('wrap-almacen'); const nFlo = document.getElementById('wrap-flota'); const nUsu = document.getElementById('wrap-usuarios'); const nAud = document.getElementById('wrap-auditoria');
        const cMant = document.getElementById('menuMantenimiento'); const cAlm = document.getElementById('menuAlmacen'); const cFlo = document.getElementById('menuFlota');
        [nMant, nAlm, nFlo, nUsu, nAud].forEach(el => { if (el) el.style.display = 'none'; });
        [cMant, cAlm, cFlo].forEach(el => { if (!el) return; el.classList.remove('show'); el.style.display = 'none'; });

        let showMant = isAdm || p?.mod_mant || p?.insp?.l || p?.placas?.l || p?.fleet?.l;
        let showAlm = isAdm || p?.mod_alm || p?.placas?.l;
        let showFlota = isAdm || p?.mod_flota || p?.gps?.l || p?.status?.l || p?.cond?.l;

        const mStatus = document.getElementById('btnMenuStatusMant'); const mPlacas = document.getElementById('btnMenuPlacasMant'); const mFleet = document.getElementById('btnMenuFleetrun');
        const aPlacas = document.getElementById('btnMenuPlacasAlmacen');
        const fGps = document.getElementById('btnMenuUbicacion'); const fStatus = document.getElementById('btnMenuStatusFlota'); const fCond = document.getElementById('btnMenuConductores');

        if (showMant) { if(nMant) nMant.style.display = 'block'; if(cMant) cMant.style.removeProperty('display'); }
        if (mStatus) mStatus.style.display = (isAdm || p?.insp?.l) ? 'block' : 'none';
        if (mPlacas) mPlacas.style.display = (isAdm || p?.placas?.l) ? 'block' : 'none';
        if (mFleet) mFleet.style.display = (isAdm || p?.fleet?.l) ? 'block' : 'none';

        if (showAlm) { if(nAlm) nAlm.style.display = 'block'; if(cAlm) cAlm.style.removeProperty('display'); }
        if (aPlacas) aPlacas.style.display = (isAdm || p?.placas?.l) ? 'block' : 'none';

        if (showFlota) { if(nFlo) nFlo.style.display = 'block'; if(cFlo) cFlo.style.removeProperty('display'); }
        if (fGps) fGps.style.display = (isAdm || p?.gps?.l) ? 'block' : 'none';
        if (fStatus) fStatus.style.display = (isAdm || p?.status?.l) ? 'block' : 'none';
        if (fCond) fCond.style.display = (isAdm || p?.cond?.l) ? 'block' : 'none';

        if (isAdm) { if(nUsu) nUsu.style.display = 'block'; }
        if (isAdm || p?.mod_auditoria) { if(nAud) nAud.style.display = 'block'; }

        document.getElementById('root-dinamico').style.display = 'none';
        document.getElementById('app-crm').style.display = 'flex';

        cambiarModulo('dashboard', 'nav-dashboard');

        google.script.run.withSuccessHandler(d => {
            dataGlobalPlacas = d; CACHE['placas'] = d; CACHE_TIME['placas'] = Date.now();
            let placasSet = new Set(); d.forEach(r => { if(r[0] && r[0]!=="Placa" && r[0]!=="PLACA") placasSet.add(r[0]) });
            rellenarDatalist('dl-placas', placasSet);
            poblarSelectsFormularios(d);
            recargarWialon();
        }).obtenerDatosPlacas();

        google.script.run.withSuccessHandler(d => { dataTiposMant = d; }).obtenerTiposMantenimiento();
        google.script.run.withSuccessHandler(tipos => { rellenarDatalist('dl-tpmp', new Set(tipos)); }).obtenerTPMP();

        return;
    }
    document.getElementById('app-crm').style.display = 'none';
}

async function iniciarSesion(event, formObj) {
    event.preventDefault();
    const btn = document.getElementById('btn-login');
    const msg = document.getElementById('mensaje-login');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verificando...';
    msg.style.display = 'none';

    try {
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
            restaurarCascaronApp();
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

    // 🧹 Limpieza Total de Pantalla
    ['menuMantenimiento', 'menuAlmacen', 'menuFlota'].forEach(id => { const el = document.getElementById(id); if (!el) return; el.classList.remove('show'); el.style.display = 'none'; const inst = bootstrap.Collapse.getInstance(el); if (inst) inst.dispose(); });
    document.querySelectorAll('.modulo-wrapper').forEach(m => m.style.display = 'none');

    document.getElementById('app-crm').style.display = 'none';
    cargarModuloAislado('login');
}

// ================================================================
// 🚀 FUNCIONES DE ARRANQUE — llamadas por el Router
// ================================================================
window.init_login = function() {
    const sb = document.getElementById('sidebarMenu');
    const tb = document.querySelector('.topbar');
    if(sb) sb.style.display = 'none';
    if(tb) tb.style.display = 'none';
    const main = document.querySelector('.main-area');
    if(main) main.style.padding = '0';
};

window.restaurarCascaronApp = function() {
    const sb = document.getElementById('sidebarMenu');
    const tb = document.querySelector('.topbar');
    if(sb) sb.style.display = '';
    if(tb) tb.style.display = '';
};
