// ================================================================
// 👥 MÓDULO USUARIOS Y PERMISOS - LÓGICA AISLADA
// ================================================================

let dataGlobalUsuarios = [];

// ================================================================
// 📊 FUNCIONES DE CARGAR DATOS
// ================================================================
function cargarTablaUsuarios() {
    cargarModulo('usuarios', mostrarUsuarios, 'obtenerDatosUsuarios');
}

// ================================================================
// 📋 MOSTRAR USUARIOS EN TABLA
// ================================================================
function mostrarUsuarios(datos) {
    dataGlobalUsuarios = datos;
    window.dataGlobalUsuarios = datos;
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

// ================================================================
// 🔐 GENERAR MATRIZ DE PERMISOS
// ================================================================
function generarMatrizUI() {
    const target = document.getElementById('bodyMatrizPermisos');
    if (!target) return;
    target.innerHTML = `
        <tr><th colspan="5" style="background-color: var(--crm-sidebar); color: var(--text);" class="text-start ps-3 py-2 small fw-bold"><i class="bi bi-tools text-warning me-2"></i>MANTENIMIENTO</th></tr>
        <tr data-k="insp"><td class="text-start ps-3 small"><span class="fw-semibold" style="color:var(--text);">Inspecciones</span><br><small class="text-muted">Registro y análisis de inspecciones</small></td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="insp" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="insp" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="insp" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="insp" style="width:18px;height:18px;cursor:pointer;"></td></tr>
        <tr data-k="fleet"><td class="text-start ps-3 small"><span class="fw-semibold" style="color:var(--text);">Fleetrun</span><br><small class="text-muted">Datos operativos de la flota</small></td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="fleet" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="fleet" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="fleet" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="fleet" style="width:18px;height:18px;cursor:pointer;"></td></tr>
        <tr><th colspan="5" style="background-color: var(--crm-sidebar); color: var(--text);" class="text-start ps-3 py-2 small fw-bold"><i class="bi bi-box-seam text-info me-2"></i>ALMACÉN</th></tr>
        <tr data-k="placas"><td class="text-start ps-3 small"><span class="fw-semibold" style="color:var(--text);">Placas <small class="text-muted">(Mant+Alm)</small></span><br><small class="text-muted">Fichas técnicas de vehículos</small></td>
            <td><input type="checkbox" class="form-check-input p-chk p-l sync-placas p-placas" data-k="placas" style="width:18px;height:18px;cursor:pointer;" onchange="syncPlacasUI(this,'l')"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c sync-placas p-placas" data-k="placas" style="width:18px;height:18px;cursor:pointer;" onchange="syncPlacasUI(this,'c')"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e sync-placas p-placas" data-k="placas" style="width:18px;height:18px;cursor:pointer;" onchange="syncPlacasUI(this,'e')"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d sync-placas p-placas" data-k="placas" style="width:18px;height:18px;cursor:pointer;" onchange="syncPlacasUI(this,'d')"></td></tr>
        <tr><th colspan="5" style="background-color: var(--crm-sidebar); color: var(--text);" class="text-start ps-3 py-2 small fw-bold"><i class="bi bi-truck-front text-success me-2"></i>FLOTA</th></tr>
        <tr data-k="status"><td class="text-start ps-3 small"><span class="fw-semibold" style="color:var(--text);">Status Flota</span><br><small class="text-muted">Estado y agrupación de unidades</small></td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="status" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="status" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="status" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="status" style="width:18px;height:18px;cursor:pointer;"></td></tr>
        <tr data-k="cond"><td class="text-start ps-3 small"><span class="fw-semibold" style="color:var(--text);">Conductores</span><br><small class="text-muted">Directorio de personal operativo</small></td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="cond" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="cond" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="cond" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="cond" style="width:18px;height:18px;cursor:pointer;"></td></tr>
        <tr data-k="gps"><td class="text-start ps-3 small"><span class="fw-semibold" style="color:var(--text);">GPS / Ubicación</span><br><small class="text-muted">Visualización en tiempo real</small></td>
            <td><input type="checkbox" class="form-check-input p-chk p-l" data-k="gps" style="width:18px;height:18px;cursor:pointer;"></td>
            <td><input type="checkbox" class="form-check-input p-chk p-c" data-k="gps" style="width:18px;height:18px;cursor:pointer;" disabled></td>
            <td><input type="checkbox" class="form-check-input p-chk p-e" data-k="gps" style="width:18px;height:18px;cursor:pointer;" disabled></td>
            <td><input type="checkbox" class="form-check-input p-chk p-d" data-k="gps" style="width:18px;height:18px;cursor:pointer;" disabled></td></tr>
        <tr><th colspan="5" style="background-color: var(--crm-sidebar); color: var(--text);" class="text-start ps-3 py-2 small fw-bold"><i class="bi bi-shield-fill-check text-primary me-2"></i>MÓDULOS EXTRA</th></tr>
        <tr><td class="text-start ps-3 small"><span class="fw-semibold" style="color:var(--text);">Auditoría</span><br><small class="text-muted">Bitácora de actividad del sistema</small></td>
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

// ================================================================
// 🔲 ABRIR MODAL GESTOR USUARIO
// ================================================================
window.abrirModalGestorUsuario = function(idBusqueda = null, esClon = false) {
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
};

// ================================================================
// 💾 GUARDAR USUARIO Y PERMISOS
// ================================================================
window.procesarGuardadoUsuario = function(event, formObj) {
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
};

// ================================================================
// 🎯 MÓDULO INIT
// ================================================================
window.init_usuarios = function() {
    if(typeof cargarTablaUsuarios === 'function') {
        cargarTablaUsuarios();
    }
};
