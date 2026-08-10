/**
 * modulos/sistema/superadmin/logica.js — Azkell SaaS Master
 * Lógica del panel SuperAdmin de Gestión de Empresas y Autoprovisionamiento de BD.
 */

var saasEmpresasLista = [];

function init_superadmin() {
    console.log('🚀 Inicializando Módulo SuperAdmin SaaS...');
    saasCargarEmpresas();
}

function saasCargarEmpresas() {
    var tbody = document.getElementById('saas_tabla_empresas');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-secondary"><div class="spinner-border spinner-border-sm me-2 text-primary"></div>Cargando empresas registradas...</td></tr>';
    }

    fetch('/api/superadmin/empresas', {
        headers: { 'X-Master-Key': 'azkell_saas_secret_2026' }
    })
        .then(r => {
            if (!r.ok) throw new Error('No autorizado o error del servidor');
            return r.json();
        })
        .then(data => {
            saasEmpresasLista = Array.isArray(data) ? data : [];
            saasRenderizarTabla();
            saasActualizarKPIs();
        })
        .catch(err => {
            console.warn('Error cargando empresas SaaS:', err);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger"><i class="bi bi-exclamation-triangle-fill me-2"></i>Error al conectar con la base de datos maestra azkell_master.</td></tr>';
            }
        });
}

function saasActualizarKPIs() {
    var elEmpresas = document.getElementById('saas_kpi_empresas');
    var elBds = document.getElementById('saas_kpi_bds');

    if (elEmpresas) elEmpresas.innerText = saasEmpresasLista.length;
    if (elBds) elBds.innerText = saasEmpresasLista.length;
}

function saasRenderizarTabla() {
    var tbody = document.getElementById('saas_tabla_empresas');
    if (!tbody) return;

    if (saasEmpresasLista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><i class="bi bi-inbox fs-4 d-block mb-1"></i>No hay empresas registradas aún. ¡Haz clic en "Nueva Empresa SaaS" para provisionar la primera!</td></tr>';
        return;
    }

    var html = '';
    saasEmpresasLista.forEach(e => {
        var subUrl = `https://${e.slug}.azkell.com`;
        var esActivo = e.estado === 'activo';
        var badgeEstado = esActivo 
            ? '<span class="badge bg-success-subtle text-success px-2 py-1"><i class="bi bi-circle-fill me-1" style="font-size:0.55rem;"></i>Activo</span>'
            : '<span class="badge bg-danger-subtle text-danger px-2 py-1"><i class="bi bi-circle-fill me-1" style="font-size:0.55rem;"></i>Suspendido</span>';

        html += `
        <tr>
            <td>
                <div class="fw-bold text-dark">${e.nombre_empresa || 'Empresa'}</div>
                <div class="text-secondary small">RUC: ${e.ruc || 'Sin RUC'} | Admin: ${e.admin_email || 'n/a'}</div>
            </td>
            <td>
                <a href="${subUrl}" target="_blank" class="subdomain-badge text-decoration-none">
                    <i class="bi bi-link-45deg me-1"></i>${e.slug}.azkell.com
                </a>
            </td>
            <td>
                <span class="db-badge"><i class="bi bi-database me-1 text-primary"></i>${e.db_name || 'azkell_tenant_' + e.slug}</span>
            </td>
            <td>
                <span class="badge bg-light text-dark border me-1">${e.plan || 'Profesional'}</span>
                <span class="text-muted small">(${e.max_unidades || 100} veh.)</span>
            </td>
            <td>${badgeEstado}</td>
            <td class="text-end">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-secondary" onclick="window.saasAbrirModalEditar(${e.id})" title="Editar Plan / Vehículos">
                        <i class="bi bi-pencil-fill me-1"></i>Editar
                    </button>
                    <a href="${subUrl}" target="_blank" class="btn btn-primary fw-bold text-white shadow-sm" title="Entrar a esta Empresa como SuperAdmin">
                        <i class="bi bi-rocket-takeoff-fill me-1"></i>Entrar a Empresa
                    </a>
                    ${esActivo 
                        ? `<button class="btn btn-danger" onclick="window.saasCambiarEstado(${e.id}, 'suspendido')" title="Suspender Acceso"><i class="bi bi-pause-circle"></i> Suspender</button>`
                        : `<button class="btn btn-success" onclick="window.saasCambiarEstado(${e.id}, 'activo')" title="Activar Acceso"><i class="bi bi-play-circle"></i> Activar</button>`
                    }
                </div>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
}

function saasAbrirModalNueva() {
    document.getElementById('formNuevaEmpresa').reset();
    document.getElementById('saas_f_password').value = saasGenerarPassSec();
    document.getElementById('saasBackdrop').classList.add('open');
    document.getElementById('modalNuevaEmpresa').classList.add('open');
}

function saasCerrarModal() {
    document.getElementById('saasBackdrop').classList.remove('open');
    document.getElementById('modalNuevaEmpresa').classList.remove('open');
}

function saasAbrirModalEditar(id) {
    var emp = saasEmpresasLista.find(x => Number(x.id) === Number(id));
    if (!emp) return;

    document.getElementById('saas_edit_id').value = emp.id;
    document.getElementById('saas_edit_nombre').value = emp.nombre_empresa || '';
    document.getElementById('saas_edit_ruc').value = emp.ruc || '';
    document.getElementById('saas_edit_email').value = emp.admin_email || '';
    document.getElementById('saas_edit_plan').value = emp.plan || 'Profesional';
    document.getElementById('saas_edit_max_unidades').value = emp.max_unidades || 100;
    document.getElementById('saas_edit_estado').value = emp.estado || 'activo';

    document.getElementById('saasBackdrop').classList.add('open');
    var m = document.getElementById('modalEditarEmpresa');
    if (m) m.style.transform = 'translateX(-50%) translateY(0)';
}

function saasCerrarModalEditar() {
    document.getElementById('saasBackdrop').classList.remove('open');
    var m = document.getElementById('modalEditarEmpresa');
    if (m) m.style.transform = 'translateX(-50%) translateY(100%)';
}

function saasGuardarEdicion(e) {
    e.preventDefault();
    var id = document.getElementById('saas_edit_id').value;
    var nombre_empresa = document.getElementById('saas_edit_nombre').value.trim();
    var ruc = document.getElementById('saas_edit_ruc').value.trim();
    var admin_email = document.getElementById('saas_edit_email').value.trim();
    var plan = document.getElementById('saas_edit_plan').value;
    var max_unidades = document.getElementById('saas_edit_max_unidades').value;
    var estado = document.getElementById('saas_edit_estado').value;

    fetch(`/api/superadmin/empresas/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': 'azkell_saas_secret_2026'
        },
        body: JSON.stringify({ nombre_empresa, ruc, admin_email, plan, max_unidades, estado })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        saasCerrarModalEditar();
        if (window.Toast) window.Toast.fire({ icon: 'success', title: 'Empresa actualizada correctamente' });
        else alert('Empresa actualizada correctamente');
        saasCargarEmpresas();
    })
    .catch(err => {
        if (window.Toast) window.Toast.fire({ icon: 'error', title: err.message });
        else alert(err.message);
    });
}

function saasGenerarSlugAuto() {
    var nombre = document.getElementById('saas_f_nombre').value || '';
    var slugInput = document.getElementById('saas_f_slug');
    if (slugInput) {
        var clean = nombre.toLowerCase().trim()
            .replace(/s\.a\.c\.|s\.a\.|e\.i\.r\.l\.|s\.r\.l\./g, '')
            .replace(/[^a-z0-9]/g, '');
        slugInput.value = clean;
    }
}

function saasGenerarPassSec() {
    var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    var pass = "";
    for (var i = 0; i < 10; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
}

function saasConsultarRUC() {
    var ruc = document.getElementById('saas_f_ruc').value.trim();
    if (!ruc || ruc.length !== 11) {
        if (window.Toast) window.Toast.fire({ icon: 'warning', title: 'Ingrese un RUC válido de 11 dígitos' });
        return;
    }

    if (window.Toast) window.Toast.fire({ icon: 'info', title: 'Buscando en SUNAT...' });

    fetch('/api/proxy/sunat?doc=' + ruc)
        .then(r => r.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            var nombre = data.razon_social || data.nombre || '';
            if (nombre) {
                document.getElementById('saas_f_nombre').value = nombre.toUpperCase();
                saasGenerarSlugAuto();
                if (window.Toast) window.Toast.fire({ icon: 'success', title: 'SUNAT: ' + nombre });
            }
        })
        .catch(err => {
            if (window.Toast) window.Toast.fire({ icon: 'error', title: 'No se encontraron datos del RUC' });
        });
}

function saasGuardarEmpresa(e) {
    e.preventDefault();

    var slug = document.getElementById('saas_f_slug').value.trim().toLowerCase();
    var nombre_empresa = document.getElementById('saas_f_nombre').value.trim();
    var ruc = document.getElementById('saas_f_ruc').value.trim();
    var admin_email = document.getElementById('saas_f_email').value.trim();
    var admin_password = document.getElementById('saas_f_password').value;
    var plan = document.getElementById('saas_f_plan').value;
    var max_unidades = document.getElementById('saas_f_max_unidades').value;

    if (!slug || !nombre_empresa || !admin_email || !admin_password) {
        if (window.Toast) window.Toast.fire({ icon: 'warning', title: 'Complete todos los campos obligatorios' });
        return;
    }

    var btn = document.getElementById('btnGuardarSaas');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Provisionando Base de Datos MySQL...';
    }

    fetch('/api/superadmin/empresas', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': 'azkell_saas_secret_2026'
        },
        body: JSON.stringify({
            slug,
            nombre_empresa,
            ruc,
            admin_email,
            admin_password,
            plan,
            max_unidades
        })
    })
    .then(r => r.json())
    .then(res => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-database-add me-1"></i> Crear Empresa y Provisionar BD';
        }

        if (res.error) {
            if (window.Swal) Swal.fire('Error', res.error, 'error');
            else alert('Error: ' + res.error);
            return;
        }

        saasCerrarModal();
        if (window.Swal) {
            Swal.fire({
                icon: 'success',
                title: '🚀 ¡Empresa SaaS Provisionada con Éxito!',
                html: `
                <div class="text-start fs-6">
                    <p class="mb-1"><b>Empresa:</b> ${nombre_empresa}</p>
                    <p class="mb-1"><b>Subdominio:</b> <a href="https://${slug}.azkell.com" target="_blank">https://${slug}.azkell.com</a></p>
                    <p class="mb-1"><b>Base de Datos MySQL:</b> <code>${res.db_name}</code></p>
                    <p class="mb-1"><b>Usuario Admin:</b> ${admin_email}</p>
                    <p class="mb-0"><b>Contraseña Admin:</b> <code>${admin_password}</code></p>
                </div>
                `,
                confirmButtonText: 'Genial, Entendido'
            });
        } else {
            alert(`Empresa ${nombre_empresa} provisionada con exito en https://${slug}.azkell.com`);
        }
        saasCargarEmpresas();
    })
    .catch(err => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-database-add me-1"></i> Crear Empresa y Provisionar BD';
        }
        if (window.Swal) Swal.fire('Error', err.message, 'error');
        else alert('Error: ' + err.message);
    });
}

function saasCambiarEstado(id, nuevoEstado) {
    var accion = nuevoEstado === 'activo' ? 'activar' : 'suspender';

    var ejecutar = function() {
        fetch(`/api/superadmin/empresas/${id}/estado`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': 'azkell_saas_secret_2026'
            },
            body: JSON.stringify({ estado: nuevoEstado })
        })
        .then(r => r.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            if (window.Toast) window.Toast.fire({ icon: 'success', title: `Empresa ${accion}da con éxito` });
            else alert(`Empresa ${accion}da con éxito`);
            saasCargarEmpresas();
        })
        .catch(err => {
            if (window.Toast) window.Toast.fire({ icon: 'error', title: err.message });
            else alert('Error: ' + err.message);
        });
    };

    if (window.Swal) {
        Swal.fire({
            title: `¿Desea ${accion} la empresa?`,
            text: nuevoEstado === 'suspendido' ? 'La empresa no podrá ingresar a su sistema temporalmente.' : 'La empresa recuperará el acceso a su sistema.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: `Sí, ${accion}`,
            cancelButtonText: 'Cancelar'
        }).then(res => {
            if (res.isConfirmed) ejecutar();
        });
    } else {
        if (confirm(`¿Está seguro de ${accion} el acceso a esta empresa?`)) {
            ejecutar();
        }
    }
}

// Exponer funciones globales
window.init_superadmin = init_superadmin;
window.saasCargarEmpresas = saasCargarEmpresas;
window.saasAbrirModalNueva = saasAbrirModalNueva;
window.saasCerrarModal = saasCerrarModal;
window.saasAbrirModalEditar = saasAbrirModalEditar;
window.saasCerrarModalEditar = saasCerrarModalEditar;
window.saasGuardarEdicion = saasGuardarEdicion;
window.saasGenerarSlugAuto = saasGenerarSlugAuto;
window.saasGenerarPassSec = saasGenerarPassSec;
window.saasConsultarRUC = saasConsultarRUC;
window.saasGuardarEmpresa = saasGuardarEmpresa;
window.saasCambiarEstado = saasCambiarEstado;
