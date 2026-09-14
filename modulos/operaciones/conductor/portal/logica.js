// ═══════════════════════════════════════════════════════════════════
// MÓDULO: CONDUCTOR (Portal Móvil de Rendición y Viajes) — Lógica SPA
// ERP Azkell
// ═══════════════════════════════════════════════════════════════════

window._condViajeActivoData = null;

window.init_conductor_portal = function() {
    // Si hay un DNI almacenado en sesión o preferencia, usarlo
    var userStorage = localStorage.getItem('fleet_user_dni') || localStorage.getItem('fleet_user') || '';
    var inputDni = document.getElementById('cond-input-dni');
    if (inputDni && userStorage && !inputDni.value) {
        inputDni.value = userStorage;
    }
    window.condCargarPortal();
};

// Cargar portal del conductor por DNI o usuario
window.condCargarPortal = async function() {
    var inputDni = document.getElementById('cond-input-dni');
    var dniVal = (inputDni ? inputDni.value : '').trim();

    // Si no ingresó DNI manual, tomar el de sesión si existe
    if (!dniVal && typeof window.usuarioLogueado !== 'undefined' && window.usuarioLogueado) {
        dniVal = window.usuarioLogueado;
    }

    var url = `/api/operaciones/conductor-portal/viaje-activo`;
    if (dniVal) {
        // Verificar si es numérico (DNI) o nombre
        if (/^\d+$/.test(dniVal)) {
            url += `?dni=${encodeURIComponent(dniVal)}`;
        } else {
            url += `?nombre=${encodeURIComponent(dniVal)}`;
        }
    }

    try {
        var res = await fetch(url);
        var json = await res.json();

        if (!json || !json.ok) {
            alert('No se pudo conectar al servidor de viajes.');
            return;
        }

        var cond = json.conductor || {};
        var viaje = json.viaje;
        var balance = json.balance || { total_asignado: 0, total_rendido: 0, saldo_restante: 0 };
        var gastos = json.gastos || [];

        window._condViajeActivoData = json;

        // Actualizar datos del conductor
        var lblNom = document.getElementById('cond-nombre-label');
        var lblDni = document.getElementById('cond-dni-label');
        if (lblNom) lblNom.textContent = cond.nombre ? `Hola, ${cond.nombre}` : 'Bienvenido, Conductor';
        if (lblDni) lblDni.textContent = cond.dni ? `DNI: ${cond.dni}` : 'Conductor de Ruta';

        // Actualizar tarjeta del Viaje
        var boxHero = document.getElementById('cond-hero-trip');
        var lblCod = document.getElementById('cond-viaje-codigo');
        var lblEst = document.getElementById('cond-viaje-estado');
        var lblFec = document.getElementById('cond-viaje-fecha');
        var lblPlacas = document.getElementById('cond-viaje-placas');
        var lblRuta = document.getElementById('cond-viaje-ruta');

        if (!viaje) {
            if (lblCod) lblCod.textContent = 'Sin Viaje Activo';
            if (lblEst) {
                lblEst.textContent = 'DISPONIBLE EN BASE';
                lblEst.className = 'badge bg-secondary-subtle text-secondary border rounded-pill px-2.5 py-1 font-monospace';
            }
            if (lblPlacas) lblPlacas.textContent = '--- / ---';
            if (lblRuta) lblRuta.textContent = 'A la espera de programación de ruta';
            if (lblFec) lblFec.textContent = 'Hoy';
        } else {
            if (lblCod) lblCod.textContent = `Viaje: ${viaje.codigo}`;
            if (lblEst) {
                lblEst.textContent = (viaje.estado || 'EN RUTA').toUpperCase();
                lblEst.className = 'badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1 fw-bold font-monospace';
            }
            if (lblPlacas) lblPlacas.textContent = `${viaje.placa_tracto || '---'} / ${viaje.placa_remolque || '---'}`;
            if (lblRuta) {
                lblRuta.textContent = viaje.ruta || '---';
                lblRuta.title = viaje.ruta || '';
            }
            if (lblFec) lblFec.textContent = viaje.fecha || '---';
        }

        // Actualizar KPIs de Dinero
        var kpiDep = document.getElementById('cond-kpi-depositado');
        var kpiRen = document.getElementById('cond-kpi-rendido');
        var kpiSal = document.getElementById('cond-kpi-saldo');

        if (kpiDep) kpiDep.textContent = `S/ ${parseFloat(balance.total_asignado || 0).toFixed(2)}`;
        if (kpiRen) kpiRen.textContent = `S/ ${parseFloat(balance.total_rendido || 0).toFixed(2)}`;
        if (kpiSal) {
            var salNum = parseFloat(balance.saldo_restante || 0);
            kpiSal.textContent = `S/ ${salNum.toFixed(2)}`;
            kpiSal.className = salNum >= 0 ? 'fw-bold font-monospace text-success fs-5' : 'fw-bold font-monospace text-danger fs-5';
        }

        // Renderizar lista de gastos
        var containerGastos = document.getElementById('cond-lista-gastos');
        var badgeTotal = document.getElementById('cond-badge-total-gastos');
        if (badgeTotal) badgeTotal.textContent = `${gastos.length} registrados`;

        if (!containerGastos) return;

        if (gastos.length === 0) {
            containerGastos.innerHTML = `
                <div class="text-center py-4 text-muted small">
                    <i class="bi bi-inbox fs-4 d-block mb-1 text-secondary"></i>
                    Aún no has registrado gastos en este viaje. Pulsa "Rendir Gastos" para empezar.
                </div>
            `;
            return;
        }

        containerGastos.innerHTML = gastos.map(g => {
            var sUrl = g.sustento_url;
            var linkFoto = sUrl ? `<a href="${sUrl}" target="_blank" class="btn btn-xs btn-outline-primary py-0.5 px-2 rounded-pill fw-bold" style="font-size:0.75rem;"><i class="bi bi-image me-1"></i> Ver Foto</a>` : '<span class="text-muted small">Sin Foto</span>';
            return `
                <div class="cond-gasto-item">
                    <div>
                        <div class="d-flex align-items-center gap-2 mb-0.5">
                            <span class="badge bg-light text-dark border fw-bold" style="font-size:0.7rem;">${g.tipo_gasto}</span>
                            <span class="text-muted font-monospace" style="font-size:0.72rem;">${g.fecha || ''}</span>
                        </div>
                        <small class="text-secondary d-block">${g.sub_motivo || g.detalle || 'Gasto de ruta'}</small>
                    </div>
                    <div class="text-end">
                        <span class="d-block font-monospace fw-bold text-dark fs-6">S/ ${parseFloat(g.importe || 0).toFixed(2)}</span>
                        ${linkFoto}
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error cargando portal de conductor:', err);
    }
};

window.condCambiarDni = function() {
    var val = (document.getElementById('cond-input-dni')?.value || '').trim();
    if (val) localStorage.setItem('fleet_user_dni', val);
    window.condCargarPortal();
};

// ── BOTÓN 1: ABRIR MODAL PARA SUBIR GASTO / TOMAR FOTO ──────────────
window.condAbrirModalSubirGasto = function() {
    if (!window._condViajeActivoData || !window._condViajeActivoData.viaje) {
        alert('Actualmente no tienes un viaje activo asignado para liquidar.');
        return;
    }

    var viaje = window._condViajeActivoData.viaje;
    var subEl = document.getElementById('cond-modal-subtitulo');
    if (subEl) subEl.textContent = `Viaje: ${viaje.codigo} | ${viaje.placa_tracto}`;

    var form = document.getElementById('condFormNuevoGasto');
    if (form) form.reset();

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('condModalSubirGasto'));
    modal.show();
};

// Guardar gasto desde la interfaz del conductor
window.condGuardarGasto = async function(e) {
    if (e) e.preventDefault();
    if (!window._condViajeActivoData || !window._condViajeActivoData.viaje) return;

    var viaje = window._condViajeActivoData.viaje;
    var cond = window._condViajeActivoData.conductor || {};

    var btn = document.getElementById('cond-btn-enviar-gasto');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Subiendo foto...';
    }

    try {
        var formData = new FormData();
        formData.append('orden_viaje', viaje.codigo);
        formData.append('conductor', cond.nombre || 'Conductor');
        formData.append('tipo_gasto', document.getElementById('cond-gasto-tipo')?.value || 'COCHERA');
        formData.append('sub_motivo', document.getElementById('cond-gasto-nota')?.value || document.getElementById('cond-gasto-tipo')?.value || 'Gasto ruta');
        formData.append('importe', document.getElementById('cond-gasto-importe')?.value || '0');
        formData.append('detalle', document.getElementById('cond-gasto-nota')?.value || 'Registrado desde portal móvil conductor');
        formData.append('usuario_creacion', cond.nombre ? `${cond.nombre} (Conductor)` : 'CONDUCTOR MÓVIL');

        var fileInput = document.getElementById('cond-gasto-foto');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            formData.append('sustento', fileInput.files[0]);
        }

        var res = await fetch('/api/tesoreria/liquidaciones-gastos', {
            method: 'POST',
            body: formData
        });
        var json = await res.json();

        if (json && json.ok) {
            alert('¡Gasto registrado con éxito!');
            var modal = bootstrap.Modal.getInstance(document.getElementById('condModalSubirGasto'));
            if (modal) modal.hide();
            window.condCargarPortal();
        } else {
            alert(json.error || 'No se pudo registrar el gasto');
        }
    } catch(err) {
        alert('Error al subir comprobante: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill me-1"></i> Subir Mi Gasto';
        }
    }
};

// ── BOTÓN 2: AVISO PRÓXIMAMENTE PARA VALES DE COMBUSTIBLE ──────────
window.condAvisoCombustibleProximamente = function() {
    alert('⛽ Módulo de Vales de Combustible para Conductor:\n\nEsta función estará disponible muy pronto para que registres tus cargas de Diésel y Urea en ruta de manera directa.');
};
