// =========================================================================
// ⛽ LÓGICA: ESTACIONES DE PROVEEDORES — ERP AZKELL FLEET (OPERACIONES)
// =========================================================================

(function() {
    'use strict';

    window._epData = [];
    window._epPaginaActual = 1;
    window._epLimite = 50;
    window._epTotalRegistros = 0;
    window._epTotalPaginas = 1;
    window._epBusquedaTimeout = null;
    window._epModalInst = null;
    window._epProveedoresList = [];

    // Función inicializadora llamada por el cargador dinámico
    window.init_combustible_estaciones = function() {
        window.epInicializar();
    };
    window.init_operaciones_combustible_estaciones = function() {
        window.epInicializar();
    };

    window.epInicializar = function() {
        window._epPaginaActual = 1;
        window.epCargarDatos(1);
        window.epCargarListaProveedores();
    };

    // ── CARGAR LISTA DE PROVEEDORES PARA EL DATALIST DEL MODAL ───────────
    window.epCargarListaProveedores = async function() {
        try {
            const res = await fetch('/api/combustible/estaciones-proveedores?limit=500');
            const data = await res.json();
            if (data.ok && Array.isArray(data.data)) {
                window._epProveedoresList = data.data;
                const dl = document.getElementById('ep-datalist-proveedores');
                if (dl) {
                    dl.innerHTML = data.data.map(p => `<option value="${p.proveedor_razon_social}"></option>`).join('');
                }
            }
        } catch (e) {
            console.warn('Error cargando sugerencias de proveedores:', e);
        }
    };

    // ── CARGAR DATOS PAGINADOS DESDE EL SERVIDOR ─────────────────────────
    window.epCargarDatos = async function(pagina = 1) {
        window._epPaginaActual = pagina;
        const tbody = document.getElementById('ep-tbody');
        const q = (document.getElementById('ep-txt-buscar')?.value || '').trim();

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-warning me-2"></div>
                        Cargando estaciones de proveedores...
                    </td>
                </tr>
            `;
        }

        try {
            const params = new URLSearchParams({
                page: window._epPaginaActual,
                limit: window._epLimite,
                q: q
            });

            const res = await fetch(`/api/combustible/estaciones-proveedores?${params.toString()}`);
            const json = await res.json();

            if (json.ok && Array.isArray(json.data)) {
                window._epData = json.data;
                window._epTotalRegistros = json.total || 0;
                window._epTotalPaginas = json.totalPages || 1;
                window.epRenderizarTabla();
                window.epActualizarPaginacion();
            } else {
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-4">Error al cargar datos: ${json.error || 'Desconocido'}</td></tr>`;
                }
            }
        } catch (err) {
            console.error('Error epCargarDatos:', err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-4">Error de conexión al servidor.</td></tr>`;
            }
        }
    };

    // ── RENDERIZAR TABLA CON BOTÓN EDITAR (DROPDOWN) ─────────────────────
    window.epRenderizarTabla = function() {
        const tbody = document.getElementById('ep-tbody');
        if (!tbody) return;

        if (window._epData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center py-5 text-muted">
                        <i class="bi bi-geo-alt display-6 d-block mb-2 text-warning opacity-50"></i>
                        <strong>No se encontraron estaciones de proveedores</strong>
                        <p class="small text-muted mb-0">Haga clic en "+ Nuevo" o sincronice con la base de datos.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = window._epData.map((item, idx) => {
            const estaciones = (item.estaciones_nombres || '').trim();
            const rucBadge = item.proveedor_ruc ? `<span class="badge bg-light text-secondary border ms-1" style="font-size:0.68rem;">RUC: ${item.proveedor_ruc}</span>` : '';

            return `
                <tr>
                    <td>
                        <div class="ep-btn-group-action dropdown">
                            <button type="button" class="ep-btn-edit" onclick="window.epEditarItem(${item.id})">
                                EDITAR
                            </button>
                            <button type="button" class="ep-btn-edit-caret dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false">
                                <span class="visually-hidden">Toggle Dropdown</span>
                            </button>
                            <ul class="dropdown-menu shadow-sm" style="font-size:0.78rem; border-radius:6px;">
                                <li><a class="dropdown-item" href="javascript:void(0)" onclick="window.epEditarItem(${item.id})"><i class="bi bi-pencil me-1.5 text-primary"></i> Editar Estación</a></li>
                                <li><hr class="dropdown-divider my-1"></li>
                                <li><a class="dropdown-item text-danger" href="javascript:void(0)" onclick="window.epEliminarItem(${item.id})"><i class="bi bi-trash me-1.5"></i> Eliminar</a></li>
                            </ul>
                        </div>
                    </td>
                    <td class="fw-bold text-dark">
                        ${item.proveedor_razon_social || '-'}
                        ${rucBadge}
                    </td>
                    <td class="text-secondary" style="line-height:1.45; max-width: 650px;">
                        ${estaciones || '<span class="text-muted fst-italic">Sin estaciones registradas</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    };

    // ── ACTUALIZAR INDICADORES DE PAGINACIÓN ─────────────────────────────
    window.epActualizarPaginacion = function() {
        const total = window._epTotalRegistros;
        const page = window._epPaginaActual;
        const limit = window._epLimite;
        const desde = total === 0 ? 0 : (page - 1) * limit + 1;
        const hasta = Math.min(page * limit, total);

        const lblContador = document.getElementById('ep-lbl-contador');
        if (lblContador) {
            lblContador.innerText = `Mostrando ${desde} a ${hasta} de ${total} registros`;
        }

        const lblPag = document.getElementById('ep-lbl-pagina');
        if (lblPag) {
            lblPag.innerText = `Página ${page} de ${window._epTotalPaginas || 1}`;
        }

        const btnPrev = document.getElementById('ep-btn-prev');
        const btnNext = document.getElementById('ep-btn-next');
        if (btnPrev) btnPrev.disabled = (page <= 1);
        if (btnNext) btnNext.disabled = (page >= window._epTotalPaginas);
    };

    window.epCambiarPagina = function(delta) {
        const nueva = window._epPaginaActual + delta;
        if (nueva >= 1 && nueva <= window._epTotalPaginas) {
            window.epCargarDatos(nueva);
        }
    };

    // ── BUSCADOR CON DEBOUNCE ────────────────────────────────────────────
    window.epOnBuscarDebounced = function() {
        clearTimeout(window._epBusquedaTimeout);
        window._epBusquedaTimeout = setTimeout(() => {
            window.epCargarDatos(1);
        }, 300);
    };

    // ── MODAL NUEVO / EDITAR ─────────────────────────────────────────────
    window.epAbrirModalNuevo = function() {
        const modalEl = document.getElementById('epModalEstacion');
        if (!modalEl) return;

        document.getElementById('ep-form-id').value = '';
        document.getElementById('ep-form-proveedor').value = '';
        document.getElementById('ep-form-ruc').value = '';
        document.getElementById('ep-modal-titulo').innerText = 'Nueva estación';

        const cont = document.getElementById('ep-estaciones-inputs-container');
        if (cont) {
            cont.innerHTML = `
                <div class="d-flex gap-2 mb-2 ep-station-row">
                    <input type="text" class="ep-form-control text-uppercase ep-station-input" placeholder="Nombre de estación (ej: BASE, NAZCA, CHALHUANCA)" required>
                </div>
            `;
        }

        window._epModalInst = new bootstrap.Modal(modalEl);
        window._epModalInst.show();
    };

    window.epEditarItem = function(id) {
        const item = window._epData.find(x => x.id === id);
        if (!item) return;

        const modalEl = document.getElementById('epModalEstacion');
        if (!modalEl) return;

        document.getElementById('ep-form-id').value = item.id;
        document.getElementById('ep-form-proveedor').value = item.proveedor_razon_social || '';
        document.getElementById('ep-form-ruc').value = item.proveedor_ruc || '';
        document.getElementById('ep-modal-titulo').innerText = 'Editar estación';

        const cont = document.getElementById('ep-estaciones-inputs-container');
        if (cont) {
            const arr = (item.estaciones_nombres || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);

            if (arr.length === 0) arr.push('');

            cont.innerHTML = arr.map((est, i) => `
                <div class="d-flex gap-2 mb-2 ep-station-row">
                    <input type="text" class="ep-form-control text-uppercase ep-station-input" value="${est}" placeholder="Nombre de estación" required>
                    ${i > 0 ? `<button type="button" class="btn btn-outline-danger btn-sm px-2" onclick="this.closest('.ep-station-row').remove()"><i class="bi bi-trash"></i></button>` : ''}
                </div>
            `).join('');
        }

        window._epModalInst = new bootstrap.Modal(modalEl);
        window._epModalInst.show();
    };

    window.epAgregarFilaEstacion = function() {
        const cont = document.getElementById('ep-estaciones-inputs-container');
        if (!cont) return;

        const div = document.createElement('div');
        div.className = 'd-flex gap-2 mb-2 ep-station-row';
        div.innerHTML = `
            <input type="text" class="ep-form-control text-uppercase ep-station-input" placeholder="Nombre de estación" required>
            <button type="button" class="btn btn-outline-danger btn-sm px-2" onclick="this.closest('.ep-station-row').remove()"><i class="bi bi-trash"></i></button>
        `;
        cont.appendChild(div);
        div.querySelector('input')?.focus();
    };

    window.epGuardarEstacion = async function(e) {
        e.preventDefault();
        const id = document.getElementById('ep-form-id').value;
        const proveedor = document.getElementById('ep-form-proveedor').value.trim();
        const ruc = document.getElementById('ep-form-ruc').value.trim();

        const inputs = document.querySelectorAll('.ep-station-input');
        const nombresArr = [];
        inputs.forEach(inp => {
            const val = inp.value.trim();
            if (val && !nombresArr.includes(val)) nombresArr.push(val);
        });

        if (!proveedor) {
            alert('Por favor ingrese el nombre o razón social del proveedor.');
            return;
        }
        if (nombresArr.length === 0) {
            alert('Por favor ingrese al menos una estación para este proveedor.');
            return;
        }

        const payload = {
            proveedor_razon_social: proveedor,
            proveedor_ruc: ruc || null,
            estaciones_nombres: nombresArr.join(', ')
        };

        const btnSubmit = document.getElementById('ep-btn-submit');
        const prevText = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Guardando...`;

        try {
            const url = id ? `/api/combustible/estaciones-proveedores/${id}` : '/api/combustible/estaciones-proveedores';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.ok) {
                if (window._epModalInst) window._epModalInst.hide();
                window.epCargarDatos(window._epPaginaActual);
                window.epCargarListaProveedores();
            } else {
                alert(`Error al guardar: ${data.error || 'No se pudo completar la operación'}`);
            }
        } catch (err) {
            alert('Error de conexión con el servidor.');
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = prevText;
        }
    };

    window.epEliminarItem = async function(id) {
        const item = window._epData.find(x => x.id === id);
        const nombre = item ? item.proveedor_razon_social : `ID ${id}`;
        if (!confirm(`¿Está seguro de eliminar al proveedor "${nombre}" y sus estaciones asociadas?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/combustible/estaciones-proveedores/${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.ok) {
                window.epCargarDatos(window._epPaginaActual);
            } else {
                alert(`Error al eliminar: ${data.error || 'No se pudo eliminar'}`);
            }
        } catch (err) {
            alert('Error de red al intentar eliminar el registro.');
        }
    };

    // ── SINCRONIZACIÓN CON LA BASE DE DATOS EXTERNA ──────────────────────
    window.epSincronizarRemoto = async function() {
        if (!confirm('¿Desea sincronizar la lista de estaciones y proveedores con la base de datos externa de MarsisaSoft?')) {
            return;
        }

        const tbody = document.getElementById('ep-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-warning me-2"></div>
                        Sincronizando proveedores y estaciones con la base de datos...
                    </td>
                </tr>
            `;
        }

        try {
            const res = await fetch('/api/combustible/estaciones-proveedores/sincronizar-remoto', { method: 'POST' });
            const data = await res.json();
            if (data.ok) {
                alert(`✅ ${data.mensaje}`);
                window.epCargarDatos(1);
            } else {
                alert(`Error al sincronizar: ${data.error || 'No se pudo completar'}`);
                window.epCargarDatos(1);
            }
        } catch (e) {
            alert('Error de conexión durante la sincronización.');
            window.epCargarDatos(1);
        }
    };

    // ── ACCIONES DE TOOLBAR: IMPRIMIR Y EXPORTAR EXCEL ───────────────────
    window.epImprimir = function() {
        window.print();
    };

    window.epExportarExcel = async function() {
        if (typeof XLSX === 'undefined') {
            alert('La librería SheetJS no está cargada para exportar.');
            return;
        }

        try {
            const res = await fetch('/api/combustible/estaciones-proveedores?limit=5000');
            const json = await res.json();
            if (!json.ok || !json.data) return alert('No se pudieron obtener los datos para exportar.');

            const rows = json.data.map(d => ({
                'PROVEEDOR': d.proveedor_razon_social,
                'RUC': d.proveedor_ruc || '',
                'ESTACIONES / NOMBRE': d.estaciones_nombres
            }));

            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Estaciones Proveedores');
            XLSX.writeFile(wb, `Estaciones_Proveedores_Combustible_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (e) {
            alert('Error exportando a Excel.');
        }
    };

    window.epAlternarColumnas = function() {
        alert('Todas las columnas principales (Proveedor, Nombre/Estaciones) se encuentran visibles.');
    };

})();
