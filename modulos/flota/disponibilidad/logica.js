// ================================================================
// 🚛 MÓDULO: DISPONIBILIDAD DE FLOTA - LÓGICA AISLADA (ERP)
// ================================================================

window.dispDatos = [];
window.dispPlacas = [];
window.dispConductores = [];
window._dispFiltroEstadoActivo = 'TODOS';
window._dispFiltroTipoActivo = 'TODOS';
window._dispItemEliminarId = null;

// ── Cargar Datos del Servidor ─────────────────────────────────────
window.dispCargarDatos = async function () {
    if (typeof window.checkPerm === 'function' && !window.checkPerm('disponibilidad', 'l')) {
        const tbody = document.getElementById('disp-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-5 text-danger">
                        <i class="bi bi-shield-lock-fill fs-2 d-block mb-2"></i>
                        No tiene permisos asignados para acceder a Disponibilidad de Flota.
                    </td>
                </tr>
            `;
        }
        return;
    }

    const tbody = document.getElementById('disp-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-4 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                    Cargando disponibilidad de flota...
                </td>
            </tr>
        `;
    }

    try {
        const [resDisp, resPlacas, resCond] = await Promise.all([
            fetch('/api/disponibilidad-flota').then(r => r.json()).catch(() => []),
            fetch('/api/placas-lista').then(r => r.json()).catch(() => []),
            fetch('/api/conductores-lista').then(r => r.json()).catch(() => [])
        ]);

        window.dispDatos = Array.isArray(resDisp) ? resDisp : (resDisp.data || []);
        window.dispPlacas = Array.isArray(resPlacas) ? resPlacas : (resPlacas.data || []);
        window.dispConductores = Array.isArray(resCond) ? resCond : (resCond.data || []);

        window.dispActualizarKPIs();
        window.dispFiltrar();
    } catch (err) {
        console.error('Error cargando disponibilidad de flota:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle-fill me-1"></i> Error al cargar datos: ${err.message}
                    </td>
                </tr>
            `;
        }
    }
};

// ── Actualizar Métricas Superiores ────────────────────────────────
window.dispActualizarKPIs = function () {
    const datos = window.dispDatos || [];
    const total = datos.length;

    let camiones = 0;
    let carretas = 0;
    let enBase = 0;
    let enRuta = 0;
    let enMant = 0;

    datos.forEach(d => {
        if (d.is_motora || (d.placa_camion && d.placa_camion.trim())) camiones++;
        if (!d.is_motora || (d.placa_carreta && d.placa_carreta.trim())) carretas++;

        const est = (d.estado || 'En Base').toLowerCase();
        if (est.includes('mant') || est.includes('taller')) enMant++;
        else if (est.includes('ruta')) enRuta++;
        else enBase++;
    });

    const setKpi = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setKpi('disp-kpi-total', total);
    setKpi('disp-kpi-todas-count', total);
    setKpi('disp-kpi-camiones', camiones);
    setKpi('disp-kpi-carretas', carretas);
    setKpi('disp-kpi-base', enBase);
    setKpi('disp-kpi-ruta', enRuta);
    setKpi('disp-kpi-mant', enMant);
};

// ── Filtros por Pill / Estado / Tipo ──────────────────────────────
window.dispFiltrarPorEstado = function (estado, el) {
    window._dispFiltroEstadoActivo = estado;
    window._dispFiltroTipoActivo = 'TODOS';
    document.querySelectorAll('.disp-kpi-pill').forEach(p => p.classList.remove('active'));
    if (el) el.classList.add('active');
    window.dispFiltrar();
};

window.dispFiltrarPorTipo = function (tipo, el) {
    window._dispFiltroTipoActivo = tipo;
    window._dispFiltroEstadoActivo = 'TODOS';
    document.querySelectorAll('.disp-kpi-pill').forEach(p => p.classList.remove('active'));
    if (el) el.classList.add('active');
    window.dispFiltrar();
};

// ── Filtrado y Render de Tabla ────────────────────────────────────
window.dispFiltrar = function () {
    const q = (document.getElementById('disp-filtro-search')?.value || '').toLowerCase().trim();
    const filtroEstado = window._dispFiltroEstadoActivo;
    const filtroTipo = window._dispFiltroTipoActivo;

    const filtrados = (window.dispDatos || []).filter(item => {
        // Filtro por Estado
        if (filtroEstado !== 'TODOS') {
            if (filtroEstado === 'En Base' && item.estado !== 'En Base') return false;
            if (filtroEstado === 'En Ruta' && item.estado !== 'En Ruta') return false;
            if (filtroEstado === 'En Mantenimiento' && item.estado !== 'En Mantenimiento') return false;
        }

        // Filtro por Tipo
        if (filtroTipo !== 'TODOS') {
            if (filtroTipo === 'CAMION' && !item.is_motora && !item.placa_camion) return false;
            if (filtroTipo === 'CARRETA' && item.is_motora && !item.placa_carreta) return false;
        }

        // Filtro de Búsqueda
        if (q) {
            const matches = [
                item.placa_camion || '',
                item.placa_carreta || '',
                item.conductor_asignado || '',
                item.marca || '',
                item.tipo_unidad || '',
                item.estado || '',
                item.observaciones || '',
                item.capacidad_tanque || ''
            ].some(val => String(val).toLowerCase().includes(q));

            if (!matches) return false;
        }

        return true;
    });

    const contadorEl = document.getElementById('disp-contador-registros');
    if (contadorEl) {
        contadorEl.innerText = `${filtrados.length} de ${window.dispDatos.length} unidades`;
    }

    window.dispRenderizarTabla(filtrados);
};

// ── Renderizar Filas de la Tabla ──────────────────────────────────
window.dispRenderizarTabla = function (datos) {
    const tbody = document.getElementById('disp-table-body');
    if (!tbody) return;

    if (!datos || datos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                    No se encontraron unidades con los filtros seleccionados.
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    datos.forEach((item, index) => {
        const num = index + 1;
        const est = item.estado || 'En Base';

        let estadoBadge = '';
        if (est === 'En Mantenimiento') {
            estadoBadge = `<span class="disp-badge-estado disp-badge-mant"><span class="disp-dot"></span>En Mantenimiento</span>`;
        } else if (est === 'En Ruta') {
            estadoBadge = `<span class="disp-badge-estado disp-badge-ruta"><span class="disp-dot"></span>En Ruta</span>`;
        } else {
            estadoBadge = `<span class="disp-badge-estado disp-badge-base"><span class="disp-dot"></span>En Base</span>`;
        }

        const capTanque = item.capacidad_tanque || '—';
        const conductor = item.conductor_asignado ? _dispEsc(item.conductor_asignado) : '<span class="text-muted">—</span>';
        const obs = item.observaciones ? _dispEsc(item.observaciones) : '<span class="text-muted">—</span>';

        html += `
            <tr data-disp-id="${item.id || ''}">
                <td class="text-center fw-bold text-muted" style="font-size:0.75rem;">${num}</td>
                <td>
                    ${item.placa_camion ? `
                        <span class="disp-placa-badge">
                            <i class="bi bi-truck text-primary"></i> ${_dispEsc(item.placa_camion)}
                        </span>
                    ` : '<span class="text-muted fw-bold">—</span>'}
                </td>
                <td>
                    ${item.placa_carreta ? `
                        <span class="disp-placa-badge disp-placa-carreta">
                            <i class="bi bi-link-45deg text-warning"></i> ${_dispEsc(item.placa_carreta)}
                        </span>
                    ` : '<span class="text-muted fw-bold">—</span>'}
                </td>
                <td>
                    <div class="fw-bold text-dark" style="font-size:0.82rem;">
                        ${conductor}
                    </div>
                </td>
                <td class="text-center">
                    ${estadoBadge}
                </td>
                <td>
                    <span class="fw-bold text-uppercase" style="font-size:0.8rem; color:#334155;">
                        ${_dispEsc(item.marca || '—')}
                    </span>
                </td>
                <td>
                    <span class="fw-bold" style="font-size:0.8rem; color:#0369a1;">
                        ${_dispEsc(capTanque)}
                    </span>
                </td>
                <td>
                    <span class="text-secondary fw-semibold" style="font-size:0.8rem;">
                        ${_dispEsc(item.tipo_unidad || '—')}
                    </span>
                </td>
                <td>
                    <span class="text-truncate d-inline-block" style="max-width:260px; font-size:0.78rem; color:#64748b;" title="${_dispEsc(item.observaciones || '')}">
                        ${obs}
                    </span>
                </td>
                <td class="text-center">
                    <div class="d-flex align-items-center justify-content-center gap-1">
                        <button class="disp-act-btn" onclick="window.dispEditarFila(${index})" title="Editar registro">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        ${item.id ? `
                            <button class="disp-act-btn delete" onclick="window.dispAbrirModalEliminar(${item.id}, '${_dispEsc(item.placa_camion || item.placa_carreta || 'Unidad')}')" title="Eliminar registro">
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

// ── Modal Formulario (Nuevo / Editar) ─────────────────────────────
window.dispAbrirModalNuevo = function () {
    const modalEl = document.getElementById('modalDisponibilidad');
    if (!modalEl) return;

    document.getElementById('disp-f-id').value = '';
    document.getElementById('disp-f-placa-camion').value = '';
    document.getElementById('disp-f-placa-carreta').value = '';
    document.getElementById('disp-f-conductor-asignado').value = '';
    document.getElementById('disp-f-marca').value = '';
    document.getElementById('disp-f-capacidad').value = '';
    document.getElementById('disp-f-tipo-unidad').value = '';
    document.getElementById('disp-f-estado').value = 'En Base';
    document.getElementById('disp-f-observaciones').value = '';

    document.getElementById('disp-modal-title').innerText = 'Registrar Unidad en Disponibilidad';
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.dispEditarFila = function (index) {
    const item = (window.dispDatos || [])[index];
    if (!item) return;

    const modalEl = document.getElementById('modalDisponibilidad');
    if (!modalEl) return;

    document.getElementById('disp-f-id').value = item.id || '';
    document.getElementById('disp-f-placa-camion').value = item.placa_camion || '';
    document.getElementById('disp-f-placa-carreta').value = item.placa_carreta || '';
    document.getElementById('disp-f-conductor-asignado').value = item.conductor_asignado || '';
    document.getElementById('disp-f-marca').value = item.marca || '';
    document.getElementById('disp-f-capacidad').value = item.capacidad_tanque || '';
    document.getElementById('disp-f-tipo-unidad').value = item.tipo_unidad || '';
    document.getElementById('disp-f-estado').value = item.estado || 'En Base';
    document.getElementById('disp-f-observaciones').value = item.observaciones || '';

    const labelPlaca = item.placa_camion || item.placa_carreta || 'Unidad';
    document.getElementById('disp-modal-title').innerText = `Editar Disponibilidad (${labelPlaca})`;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.guardarFormularioDisponibilidad = async function (e) {
    if (e) e.preventDefault();

    const id = document.getElementById('disp-f-id').value;
    const cam = (document.getElementById('disp-f-placa-camion').value || '').trim().toUpperCase();
    const car = (document.getElementById('disp-f-placa-carreta').value || '').trim().toUpperCase();

    if (!cam && !car) {
        alert('Ingresa al menos la Placa de Camión o la Placa de Carreta.');
        return;
    }

    const payload = {
        placa_camion: cam,
        placa_carreta: car,
        conductor_asignado: (document.getElementById('disp-f-conductor-asignado').value || '').trim(),
        marca: (document.getElementById('disp-f-marca').value || '').trim().toUpperCase(),
        capacidad_tanque: (document.getElementById('disp-f-capacidad').value || '').trim(),
        tipo_unidad: (document.getElementById('disp-f-tipo-unidad').value || '').trim(),
        estado: (document.getElementById('disp-f-estado').value || 'En Base').trim(),
        observaciones: (document.getElementById('disp-f-observaciones').value || '').trim(),
        actualizado_por: localStorage.getItem('fleet_user') || 'Sistema',
        creado_por: localStorage.getItem('fleet_user') || 'Sistema'
    };

    const btn = document.getElementById('disp-btn-guardar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...'; }

    try {
        const url = id ? `/api/disponibilidad-flota/${id}` : '/api/disponibilidad-flota';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.error) throw new Error(res.error);

        const modalEl = document.getElementById('modalDisponibilidad');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Disponibilidad actualizada exitosamente', 'success');
        } else {
            alert('✅ Registro guardado correctamente');
        }

        await window.dispCargarDatos();
    } catch (err) {
        alert('Error al guardar: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>Guardar Registro'; }
    }
};

// ── Modal Eliminar ────────────────────────────────────────────────
window.dispAbrirModalEliminar = function (id, nombre) {
    window._dispItemEliminarId = id;
    const modalEl = document.getElementById('modalEliminarDisponibilidadConfirm');
    const lbl = document.getElementById('disp-eliminar-nombre');
    if (lbl) lbl.innerText = nombre;
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window._ejecutarEliminarDisponibilidadConfirmado = async function () {
    const id = window._dispItemEliminarId;
    if (!id) return;

    try {
        const res = await fetch(`/api/disponibilidad-flota/${id}`, { method: 'DELETE' }).then(r => r.json());
        if (res.error) throw new Error(res.error);

        const modalEl = document.getElementById('modalEliminarDisponibilidadConfirm');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Registro eliminado', 'info');
        }
        await window.dispCargarDatos();
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
};

// ── Autocomplete Placa Camión ─────────────────────────────────────
window.dispBuscarPlacaCamion = function (val) {
    const panel = document.getElementById('disp-panel-camion');
    if (!panel) return;

    const q = (val || '').toUpperCase().trim();
    const matches = (window.dispPlacas || []).filter(p => {
        const pl = (p.placa || '').toUpperCase();
        const tipo = (p.tipo || '').toUpperCase();
        const isMotora = p.motora === '1' || p.motora === 1 || ['CAMION', 'TRACTO', 'VOLQUETE', 'FURGON', 'CISTERNA'].some(t => tipo.includes(t));
        return isMotora && (!q || pl.includes(q));
    }).slice(0, 15);

    if (!matches.length) {
        panel.style.display = 'none';
        return;
    }

    panel.innerHTML = matches.map(p => `
        <div class="disp-combo-item d-flex justify-content-between align-items-center" onclick="window.dispSeleccionarPlacaCamion('${_dispEsc(p.placa)}')">
            <span class="fw-bold">${_dispEsc(p.placa)}</span>
            <span class="text-muted small">${_dispEsc(p.marca || '')} • ${_dispEsc(p.tipo || '')}</span>
        </div>
    `).join('');

    panel.style.display = 'block';
};

window.dispSeleccionarPlacaCamion = function (placa) {
    const p = (window.dispPlacas || []).find(x => (x.placa || '').toUpperCase() === placa.toUpperCase());
    document.getElementById('disp-f-placa-camion').value = placa;
    if (p) {
        if (p.marca) document.getElementById('disp-f-marca').value = p.marca;
        if (p.tipo) document.getElementById('disp-f-tipo-unidad').value = p.tipo;
        if (p.capacidad_tanque) document.getElementById('disp-f-capacidad').value = p.capacidad_tanque;
    }
    const panel = document.getElementById('disp-panel-camion');
    if (panel) panel.style.display = 'none';
};

// ── Autocomplete Placa Carreta ────────────────────────────────────
window.dispBuscarPlacaCarreta = function (val) {
    const panel = document.getElementById('disp-panel-carreta');
    if (!panel) return;

    const q = (val || '').toUpperCase().trim();
    const matches = (window.dispPlacas || []).filter(p => {
        const pl = (p.placa || '').toUpperCase();
        const tipo = (p.tipo || '').toUpperCase();
        const isCarreta = !p.motora && (tipo.includes('CARRETA') || tipo.includes('REMOLQUE') || tipo.includes('SEMI'));
        return isCarreta && (!q || pl.includes(q));
    }).slice(0, 15);

    if (!matches.length) {
        panel.style.display = 'none';
        return;
    }

    panel.innerHTML = matches.map(p => `
        <div class="disp-combo-item d-flex justify-content-between align-items-center" onclick="window.dispSeleccionarPlacaCarreta('${_dispEsc(p.placa)}')">
            <span class="fw-bold">${_dispEsc(p.placa)}</span>
            <span class="text-muted small">${_dispEsc(p.tipo || 'Carreta')}</span>
        </div>
    `).join('');

    panel.style.display = 'block';
};

window.dispSeleccionarPlacaCarreta = function (placa) {
    document.getElementById('disp-f-placa-carreta').value = placa;
    const panel = document.getElementById('disp-panel-carreta');
    if (panel) panel.style.display = 'none';
};

// ── Autocomplete Conductor ────────────────────────────────────────
window.dispBuscarConductor = function (val) {
    const panel = document.getElementById('disp-panel-cond-asignado');
    if (!panel) return;

    const q = (val || '').toLowerCase().trim();
    const matches = (window.dispConductores || []).filter(c => {
        const nom = (c.nombre || c.nombres || c.conductor || '').toLowerCase();
        return !q || nom.includes(q);
    }).slice(0, 15);

    if (!matches.length) {
        panel.style.display = 'none';
        return;
    }

    panel.innerHTML = matches.map(c => {
        const nombre = c.nombre || c.nombres || c.conductor || '';
        return `
            <div class="disp-combo-item" onclick="window.dispSeleccionarConductor('${_dispEsc(nombre)}')">
                <span class="fw-bold">${_dispEsc(nombre)}</span>
            </div>
        `;
    }).join('');

    panel.style.display = 'block';
};

window.dispSeleccionarConductor = function (nombre) {
    document.getElementById('disp-f-conductor-asignado').value = nombre;
    const panel = document.getElementById('disp-panel-cond-asignado');
    if (panel) panel.style.display = 'none';
};

// ── Exportar Excel ────────────────────────────────────────────────
window.dispExportarExcel = function () {
    if (typeof XLSX === 'undefined') {
        alert('Librería XLSX no disponible');
        return;
    }

    const rows = (window.dispDatos || []).map((d, i) => ({
        '#': i + 1,
        'PLACA CAMIÓN': d.placa_camion || '—',
        'PLACA CARRETA': d.placa_carreta || '—',
        'CONDUCTOR': d.conductor_asignado || '—',
        'ESTADO': d.estado || 'En Base',
        'MARCA': d.marca || '—',
        'CAPACIDAD TANQUE': d.capacidad_tanque || '—',
        'TIPO UNIDAD': d.tipo_unidad || '—',
        'OBSERVACIONES': d.observaciones || '—'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Disponibilidad Flota');
    XLSX.writeFile(wb, `Disponibilidad_Flota_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// ── Modal Cuadro Resumen ──────────────────────────────────────────
window.dispAbrirModalCuadro = function () {
    const modalEl = document.getElementById('modalDisponibilidadCuadro');
    const bodyEl = document.getElementById('disp-cuadro-body');
    if (!modalEl || !bodyEl) return;

    const datos = window.dispDatos || [];
    const tipos = {};

    datos.forEach(d => {
        const t = d.tipo_unidad || 'Otros';
        if (!tipos[t]) tipos[t] = { total: 0, base: 0, ruta: 0, mant: 0 };
        tipos[t].total++;
        if (d.estado === 'En Mantenimiento') tipos[t].mant++;
        else if (d.estado === 'En Ruta') tipos[t].ruta++;
        else tipos[t].base++;
    });

    let html = `
        <div class="table-responsive">
            <table class="table table-bordered align-middle">
                <thead class="table-light">
                    <tr>
                        <th class="fw-bold">TIPO DE UNIDAD</th>
                        <th class="text-center fw-bold">TOTAL</th>
                        <th class="text-center fw-bold text-success">EN BASE</th>
                        <th class="text-center fw-bold text-primary">EN RUTA</th>
                        <th class="text-center fw-bold text-danger">EN MANTENIMIENTO</th>
                    </tr>
                </thead>
                <tbody>
    `;

    Object.keys(tipos).forEach(k => {
        const item = tipos[k];
        html += `
            <tr>
                <td class="fw-bold">${_dispEsc(k)}</td>
                <td class="text-center fw-bold">${item.total}</td>
                <td class="text-center text-success fw-bold">${item.base}</td>
                <td class="text-center text-primary fw-bold">${item.ruta}</td>
                <td class="text-center text-danger fw-bold">${item.mant}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    bodyEl.innerHTML = html;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// ── Helper Escapar HTML ───────────────────────────────────────────
function _dispEsc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Inicializador del Módulo ──────────────────────────────────────
window.init_disponibilidad = function () {
    window.dispCargarDatos();
};
