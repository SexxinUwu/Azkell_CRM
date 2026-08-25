// ── LÓGICA DE INCIDENCIAS EN RUTA — ERP AZKELL FLEET ───────────────────────────
(function() {
    window._incData = [];
    window._incCatalogoPlacas = [];
    window._incPaginaActual = 1;
    window._incLimitePorPagina = 50;
    window._incTotalPaginas = 1;
    let _incSearchTimeout = null;

    // Inicializador del módulo (llamado por el router SPA de logica.js)
    window.init_mantenimiento_incidencias_ruta = function() {
        window.incCargarCatalogos();
        window.incCargarDatos();
        window.incSetupEventos();
    };

    // Configurar listeners de búsqueda y eventos
    window.incSetupEventos = function() {
        const searchInput = document.getElementById('inc-filter-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(_incSearchTimeout);
                _incSearchTimeout = setTimeout(() => {
                    window.incCargarDatos(1);
                }, 300);
            });
        }
    };

    // Cargar Catálogo de Placas para el selector y autocompletado
    window.incCargarCatalogos = async function() {
        try {
            const res = await fetch('/api/mantenimiento/incidencias-ruta/catalogo-placas');
            const data = await res.json();
            if (data.ok && Array.isArray(data.data)) {
                window._incCatalogoPlacas = data.data;

                // Llenar selector de filtros
                const selFiltro = document.getElementById('inc-filter-placa');
                if (selFiltro) {
                    selFiltro.innerHTML = '<option value="ALL">Todas las Placas</option>' +
                        data.data.map(p => `<option value="${p.placa}">${p.placa}</option>`).join('');
                }

                // Llenar selector del formulario modal
                const selForm = document.getElementById('inc-form-placa');
                if (selForm) {
                    selForm.innerHTML = '<option value="">Selecciona una placa...</option>' +
                        data.data.map(p => `<option value="${p.placa}">${p.placa} - ${p.marca || ''}</option>`).join('');
                }
            }
        } catch (e) {
            console.error('Error cargando catálogo de placas para incidencias:', e);
        }
    };

    // Al cambiar la placa en el formulario, auto-llenar marca, tipo y conductor
    window.incOnPlacaChange = function(placaSeleccionada) {
        if (!placaSeleccionada) return;
        const encontrada = (window._incCatalogoPlacas || []).find(p => p.placa === placaSeleccionada);
        if (encontrada) {
            const elMarca = document.getElementById('inc-form-marca');
            const elTipo = document.getElementById('inc-form-tipo');
            const elCond = document.getElementById('inc-form-conductor');

            if (elMarca) elMarca.value = encontrada.marca || '';
            if (elTipo && !elTipo.value) elTipo.value = encontrada.tipo || '';
            if (elCond && !elCond.value) elCond.value = encontrada.conductor || '';
        }
    };

    // Cargar Datos Paginados y KPIs desde el Backend
    window.incCargarDatos = async function(pagina = 1) {
        window._incPaginaActual = pagina;
        const tbody = document.getElementById('inc-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="15" class="text-center py-5 text-secondary">
                        <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                        Cargando incidencias en ruta...
                    </td>
                </tr>
            `;
        }

        const params = new URLSearchParams({
            page: window._incPaginaActual,
            limit: window._incLimitePorPagina
        });

        const search = document.getElementById('inc-filter-search')?.value;
        const mes = document.getElementById('inc-filter-mes')?.value;
        const placa = document.getElementById('inc-filter-placa')?.value;
        const area = document.getElementById('inc-filter-area')?.value;
        const solucion = document.getElementById('inc-filter-solucion')?.value;

        if (search) params.append('search', search);
        if (mes && mes !== 'ALL') params.append('mes', mes);
        if (placa && placa !== 'ALL') params.append('placa', placa);
        if (area && area !== 'ALL') params.append('area', area);
        if (solucion && solucion !== 'ALL') params.append('solucionado', solucion);

        try {
            const res = await fetch(`/api/mantenimiento/incidencias-ruta?${params.toString()}`);
            const data = await res.json();

            if (data.ok) {
                window._incData = data.data || [];
                window._incTotalPaginas = data.totalPages || 1;

                window.incRenderKPIs(data.kpis);
                window.incRenderTabla(data.data || []);
                window.incRenderPaginacion(data.total || 0);
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="15" class="text-center text-danger py-4">Error: ${data.error || 'No se pudieron cargar los datos'}</td></tr>`;
            }
        } catch (err) {
            console.error('Error al obtener incidencias:', err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="15" class="text-center text-danger py-4">Error de conexión con el servidor.</td></tr>`;
        }
    };

    // Renderizar KPIs Bento
    window.incRenderKPIs = function(kpis = {}) {
        const elTotal = document.getElementById('kpi-total-incidencias');
        const elPend = document.getElementById('kpi-pendientes');
        const elAtend = document.getElementById('kpi-atendidas');
        const elCosto = document.getElementById('kpi-costo-total');

        if (elTotal) elTotal.textContent = kpis.totalRegistros || 0;
        if (elPend) elPend.textContent = kpis.totalPendientes || 0;
        if (elAtend) elAtend.textContent = kpis.totalAtendidos || 0;
        if (elCosto) {
            const val = parseFloat(kpis.costoTotalAcumulado) || 0;
            elCosto.textContent = `S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    };

    // Renderizar Filas de la Tabla (Formato exacto al Excel con diseño visual pro)
    window.incRenderTabla = function(items = []) {
        const tbody = document.getElementById('inc-tbody');
        if (!tbody) return;

        if (!items || items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="15" class="text-center py-5 text-secondary">
                        <i class="bi bi-inbox fs-3 d-block mb-2 text-muted"></i>
                        No se encontraron incidencias registradas con los filtros actuales.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = items.map(r => {
            // Badge Solución
            const esAtendido = r.solucionado === 'Atendido';
            const badgeSolucion = esAtendido
                ? `<span class="badge-solucion-atendido" onclick="window.incToggleSolucionRapido(${r.id})" title="Clic para alternar estado"><i class="bi bi-check2"></i> Atendido</span>`
                : `<span class="badge-solucion-pendiente" onclick="window.incToggleSolucionRapido(${r.id})" title="Clic para alternar estado"><i class="bi bi-clock"></i> Pendiente</span>`;

            // Badge Transbordo
            const badgeTransbordo = r.transbordo === 'SI'
                ? `<span class="badge-transbordo-si">SI</span>`
                : `<span class="badge-transbordo-no">NO</span>`;

            // Badge Área Responsable
            let badgeArea = `<span class="badge-area badge-area-mant">${r.area_responsable || 'Mantenimiento'}</span>`;
            if (r.area_responsable === 'Flota') badgeArea = `<span class="badge-area badge-area-flota">Flota</span>`;
            if (r.area_responsable === 'Operaciones') badgeArea = `<span class="badge-area badge-area-ops">Operaciones</span>`;

            // Renderizar desglose de costos
            let desgloseHtml = '<span class="text-muted" style="font-size:0.75rem;">S/ 0.00</span>';
            if (Array.isArray(r.costos_detalle) && r.costos_detalle.length > 0) {
                desgloseHtml = r.costos_detalle.map(c => `
                    <div class="costo-item-chip">
                        <strong>- ${c.concepto || 'Item'}:</strong> S/ ${parseFloat(c.monto || 0).toFixed(2)}
                    </div>
                `).join('');
            }

            const totalFormateado = (parseFloat(r.total_costo) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            return `
                <tr>
                    <td class="fw-bold text-dark text-nowrap">${r.fecha_falla || '—'}</td>
                    <td>
                        <span class="badge bg-dark text-white fw-bold px-2 py-1" style="font-size:0.75rem;">${r.placa}</span>
                    </td>
                    <td class="fw-semibold text-dark">${r.conductor || '<span class="text-muted">No asignado</span>'}</td>
                    <td><span class="badge bg-light text-secondary border fw-semibold">${r.marca || '—'}</span></td>
                    <td class="fw-semibold text-secondary">${r.ubicacion || '—'}</td>
                    <td><span class="badge bg-light text-dark border">${r.tipo_unidad || 'TRACTO'}</span></td>
                    <td class="text-center">${badgeTransbordo}</td>
                    <td class="fw-semibold text-dark" style="max-width:200px;">${r.motivo || '—'}</td>
                    <td class="text-secondary" style="max-width:240px; font-size:0.78rem;">${r.falla || '—'}</td>
                    <td>${badgeArea}</td>
                    <td class="text-secondary fw-semibold">${r.responsable || '—'}</td>
                    <td style="min-width: 180px;">${desgloseHtml}</td>
                    <td class="fw-bolder text-primary text-nowrap" style="font-size:0.85rem;">S/ ${totalFormateado}</td>
                    <td class="text-center">${badgeSolucion}</td>
                    <td class="text-end text-nowrap">
                        <button class="btn btn-sm btn-light border py-1 px-2 me-1" title="Editar" onclick='window.incAbrirModalEditar(${JSON.stringify(r)})'>
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-light border text-danger py-1 px-2" title="Eliminar" onclick="window.incEliminar(${r.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    // Renderizar Paginación
    window.incRenderPaginacion = function(totalRegistros) {
        const elInfo = document.getElementById('inc-paginacion-info');
        const elControles = document.getElementById('inc-paginacion-controles');
        if (elInfo) elInfo.textContent = `Total: ${totalRegistros} incidencias registradas (Página ${window._incPaginaActual} de ${window._incTotalPaginas})`;

        if (!elControles) return;
        if (window._incTotalPaginas <= 1) {
            elControles.innerHTML = '';
            return;
        }

        let html = `
            <button class="btn btn-sm btn-light border py-1 px-2" ${window._incPaginaActual <= 1 ? 'disabled' : ''} onclick="window.incCargarDatos(${window._incPaginaActual - 1})">
                <i class="bi bi-chevron-left"></i>
            </button>
            <span class="px-2 fw-bold text-secondary" style="font-size:0.8rem;">${window._incPaginaActual} / ${window._incTotalPaginas}</span>
            <button class="btn btn-sm btn-light border py-1 px-2" ${window._incPaginaActual >= window._incTotalPaginas ? 'disabled' : ''} onclick="window.incCargarDatos(${window._incPaginaActual + 1})">
                <i class="bi bi-chevron-right"></i>
            </button>
        `;
        elControles.innerHTML = html;
    };

    // Toggle rápido de solución (Atendido <-> Pendiente) directamente desde la tabla
    window.incToggleSolucionRapido = async function(id) {
        try {
            const res = await fetch(`/api/mantenimiento/incidencias-ruta/${id}/toggle-solucion`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.ok) {
                window.incCargarDatos(window._incPaginaActual);
            } else {
                alert('Error: ' + (data.error || 'No se pudo actualizar el estado'));
            }
        } catch (e) {
            console.error('Error toggling solucion:', e);
            alert('Error de conexión con el servidor.');
        }
    };

    // =========================================================================
    // MODAL DRAWER BOTTOM SHEET & GESTIÓN DE COSTOS
    // =========================================================================

    // Abrir Modal para Nuevo Registro
    window.incAbrirModalNuevo = function() {
        document.getElementById('inc-form').reset();
        document.getElementById('inc-form-id').value = '';
        document.getElementById('inc-modal-titulo').textContent = 'Registrar Incidencia en Ruta';

        // Fecha por defecto: Hoy
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('inc-form-fecha').value = hoy;

        // Resetear toggle de solución a Pendiente por defecto
        window.incSetSolucionForm('Pendiente');

        // Limpiar tabla de costos y agregar una fila inicial
        const tbodyCostos = document.getElementById('inc-costos-tbody');
        if (tbodyCostos) tbodyCostos.innerHTML = '';
        window.incAgregarFilaCosto('', '');

        window.incMostrarDrawer();
    };

    // Abrir Modal para Editar
    window.incAbrirModalEditar = function(item) {
        document.getElementById('inc-form-id').value = item.id;
        document.getElementById('inc-modal-titulo').textContent = `Editar Incidencia (${item.codigo || item.placa})`;

        document.getElementById('inc-form-fecha').value = item.fecha_falla || '';
        document.getElementById('inc-form-placa').value = item.placa || '';
        document.getElementById('inc-form-conductor').value = item.conductor || '';
        document.getElementById('inc-form-marca').value = item.marca || '';
        document.getElementById('inc-form-tipo').value = item.tipo_unidad || '';
        document.getElementById('inc-form-ubicacion').value = item.ubicacion || '';
        document.getElementById('inc-form-transbordo').value = item.transbordo || 'NO';
        document.getElementById('inc-form-area').value = item.area_responsable || 'Mantenimiento';
        document.getElementById('inc-form-responsable').value = item.responsable || '';
        document.getElementById('inc-form-motivo').value = item.motivo || '';
        document.getElementById('inc-form-falla').value = item.falla || '';

        window.incSetSolucionForm(item.solucionado || 'Pendiente');

        // Cargar costos
        const tbodyCostos = document.getElementById('inc-costos-tbody');
        if (tbodyCostos) tbodyCostos.innerHTML = '';

        if (Array.isArray(item.costos_detalle) && item.costos_detalle.length > 0) {
            item.costos_detalle.forEach(c => {
                window.incAgregarFilaCosto(c.concepto || '', c.monto || '');
            });
        } else {
            window.incAgregarFilaCosto('', '');
        }

        window.incCalcularTotalCostos();
        window.incMostrarDrawer();
    };

    window.incMostrarDrawer = function() {
        const overlay = document.getElementById('inc-drawer-overlay');
        const sheet = document.getElementById('inc-drawer-sheet');
        if (overlay && sheet) {
            overlay.classList.add('active');
            sheet.classList.add('active');
        }
    };

    window.incCerrarModal = function() {
        const overlay = document.getElementById('inc-drawer-overlay');
        const sheet = document.getElementById('inc-drawer-sheet');
        if (overlay && sheet) {
            sheet.classList.remove('active');
            overlay.classList.remove('active');
        }
    };

    // Alternar Solución en el formulario
    window.incAlternarSolucionForm = function() {
        const actual = document.getElementById('inc-form-solucion').value;
        const nuevo = actual === 'Atendido' ? 'Pendiente' : 'Atendido';
        window.incSetSolucionForm(nuevo);
    };

    window.incSetSolucionForm = function(estado) {
        const inputHidden = document.getElementById('inc-form-solucion');
        const wrap = document.getElementById('inc-toggle-wrap');
        const btnPend = document.getElementById('btn-toggle-pend');
        const btnAtend = document.getElementById('btn-toggle-atend');

        if (inputHidden) inputHidden.value = estado;

        if (estado === 'Atendido') {
            if (wrap) wrap.classList.add('is-atendido');
            if (btnPend) btnPend.className = 'solucion-toggle-btn';
            if (btnAtend) btnAtend.className = 'solucion-toggle-btn active-atend';
        } else {
            if (wrap) wrap.classList.remove('is-atendido');
            if (btnPend) btnPend.className = 'solucion-toggle-btn active-pend';
            if (btnAtend) btnAtend.className = 'solucion-toggle-btn';
        }
    };

    // Agregar Fila de Costo a la tabla del formulario
    window.incAgregarFilaCosto = function(concepto = '', monto = '') {
        const tbody = document.getElementById('inc-costos-tbody');
        if (!tbody) return;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <input type="text" class="form-control form-control-sm inc-costo-concepto" placeholder="Ej. PIÑON, MANO DE OBRA, AUXILIO MECANICO..." value="${concepto}">
            </td>
            <td>
                <div class="input-group input-group-sm">
                    <span class="input-group-text">S/</span>
                    <input type="number" step="0.01" class="form-control inc-costo-monto" placeholder="0.00" value="${monto}" oninput="window.incCalcularTotalCostos()">
                </div>
            </td>
            <td class="text-center">
                <button type="button" class="btn btn-sm btn-link text-danger p-0" onclick="this.closest('tr').remove(); window.incCalcularTotalCostos();" title="Eliminar fila">
                    <i class="bi bi-x-circle fs-5"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
        window.incCalcularTotalCostos();
    };

    // Calcular la sumatoria de todos los costos ingresados en el formulario
    window.incCalcularTotalCostos = function() {
        const montos = document.querySelectorAll('.inc-costo-monto');
        let total = 0;
        montos.forEach(inp => {
            const val = parseFloat(inp.value);
            if (!isNaN(val)) total += val;
        });

        const totalInput = document.getElementById('inc-form-total-costo');
        if (totalInput) {
            totalInput.value = total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    };

    // Guardar (Crear o Editar)
    window.incGuardarRegistro = async function() {
        const id = document.getElementById('inc-form-id').value;
        const fecha_falla = document.getElementById('inc-form-fecha').value;
        const placa = document.getElementById('inc-form-placa').value;

        if (!fecha_falla || !placa) {
            alert('Por favor completa los campos requeridos: Fecha de falla y Placa.');
            return;
        }

        // Recolectar costos
        const filas = document.querySelectorAll('#inc-costos-tbody tr');
        const costos_detalle = [];
        filas.forEach(tr => {
            const c = tr.querySelector('.inc-costo-concepto')?.value?.trim();
            const m = parseFloat(tr.querySelector('.inc-costo-monto')?.value) || 0;
            if (c || m > 0) {
                costos_detalle.push({ concepto: c || 'Gasto', monto: m });
            }
        });

        const payload = {
            fecha_falla,
            placa,
            conductor: document.getElementById('inc-form-conductor').value,
            marca: document.getElementById('inc-form-marca').value,
            tipo_unidad: document.getElementById('inc-form-tipo').value,
            ubicacion: document.getElementById('inc-form-ubicacion').value,
            transbordo: document.getElementById('inc-form-transbordo').value,
            area_responsable: document.getElementById('inc-form-area').value,
            responsable: document.getElementById('inc-form-responsable').value,
            motivo: document.getElementById('inc-form-motivo').value,
            falla: document.getElementById('inc-form-falla').value,
            solucionado: document.getElementById('inc-form-solucion').value,
            costos_detalle
        };

        const url = id ? `/api/mantenimiento/incidencias-ruta/${id}` : '/api/mantenimiento/incidencias-ruta';
        const method = id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.ok) {
                window.incCerrarModal();
                window.incCargarDatos(window._incPaginaActual);
            } else {
                alert('Error al guardar: ' + (data.error || 'No se pudo completar el registro'));
            }
        } catch (e) {
            console.error('Error guardando incidencia:', e);
            alert('Error de conexión al intentar guardar.');
        }
    };

    // Eliminar
    window.incEliminar = async function(id) {
        if (!confirm('¿Estás seguro de eliminar este registro de incidencia en ruta?')) return;

        try {
            const res = await fetch(`/api/mantenimiento/incidencias-ruta/${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();

            if (data.ok) {
                window.incCargarDatos(window._incPaginaActual);
            } else {
                alert('Error al eliminar: ' + (data.error || 'No se pudo eliminar el registro'));
            }
        } catch (e) {
            console.error('Error eliminando:', e);
            alert('Error de conexión con el servidor.');
        }
    };

    // Auto-inicialización si el DOM ya está listo
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        window.init_mantenimiento_incidencias_ruta();
    } else {
        document.addEventListener('DOMContentLoaded', window.init_mantenimiento_incidencias_ruta);
    }
})();
