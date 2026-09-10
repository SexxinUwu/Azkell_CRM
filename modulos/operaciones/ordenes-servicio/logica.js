// ============================================================
// 💼 MÓDULO: ÓRDENES DE SERVICIO — ERP AZKELL FLEET (OPERACIONES)
// ============================================================

(function () {
    let _osData = [];
    let _osFilteredData = [];
    let _clientesCache = [];
    let _docsAdjuntosActuales = [];
    let _gresDisponiblesCache = [];
    let _osRutasActuales = [];
    window._osOrigenApertura = 'modulo_propio';

    // Inicialización del módulo
    window.init_operaciones_ordenes_servicio = function () {
        initFechasPorDefecto();
        cargarClientesFiltro();
        window.osCargarTabla();
    };

    window.init_ordenes_servicio = window.init_operaciones_ordenes_servicio;

    function initFechasPorDefecto() {
        const ahora = new Date();
        const y = ahora.getFullYear();
        const m = String(ahora.getMonth() + 1).padStart(2, '0');
        const d = String(ahora.getDate()).padStart(2, '0');

        // Primer día del mes actual para "Desde"
        const fDesde = document.getElementById('os-filtro-desde');
        if (fDesde && !fDesde.value) {
            fDesde.value = `${y}-${m}-01`;
        }

        // Hoy para "Hasta"
        const fHasta = document.getElementById('os-filtro-hasta');
        if (fHasta && !fHasta.value) {
            fHasta.value = `${y}-${m}-${d}`;
        }
    }

    async function cargarClientesFiltro() {
        try {
            const resp = await fetch('/api/clientes');
            const data = await resp.json();
            _clientesCache = Array.isArray(data) ? data : (data.data || []);

            const selFiltro = document.getElementById('os-filtro-cliente');
            const selModal = document.getElementById('os-input-cliente');

            if (selFiltro) {
                selFiltro.innerHTML = '<option value="TODOS">Seleccione...</option>' + 
                    _clientesCache.map(c => `<option value="${escapeHtml(c.razon_social)}">${escapeHtml(c.razon_social)}</option>`).join('');
            }
            if (selModal) {
                selModal.innerHTML = '<option value="">Seleccione...</option>' + 
                    _clientesCache.map(c => `<option value="${escapeHtml(c.razon_social)}" data-id="${c.id}">${escapeHtml(c.razon_social)}</option>`).join('');
            }
        } catch (e) {
            console.warn("Error cargando clientes:", e);
        }
    }

    // ── Cargar tabla principal desde API ─────────────────────────────
    window.osCargarTabla = async function () {
        const tbody = document.getElementById('os-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="13" class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm text-warning me-2"></div>
                    Cargando órdenes de servicio...
                </td>
            </tr>
        `;

        const desde = document.getElementById('os-filtro-desde')?.value || '';
        const hasta = document.getElementById('os-filtro-hasta')?.value || '';
        const cliente = document.getElementById('os-filtro-cliente')?.value || 'TODOS';
        const tipoRes = document.getElementById('os-filtro-tipo-res')?.value || 'SEGÚN FECHA';

        const params = new URLSearchParams();
        if (tipoRes === 'SEGÚN FECHA') {
            if (desde) params.append('fecha_desde', desde);
            if (hasta) params.append('fecha_hasta', hasta);
        }
        if (cliente && cliente !== 'TODOS') params.append('cliente', cliente);

        try {
            const resp = await fetch(`/api/operaciones/ordenes-servicio?${params.toString()}`);
            const result = await resp.json();

            if (result.ok) {
                _osData = result.data || [];
                _osFilteredData = [..._osData];
                renderizarTabla(_osFilteredData);
            } else {
                tbody.innerHTML = `<tr><td colspan="13" class="text-center py-4 text-danger">Error: ${result.error || 'No se pudo cargar la información'}</td></tr>`;
            }
        } catch (err) {
            console.error("Error al consultar órdenes de servicio:", err);
            tbody.innerHTML = `<tr><td colspan="13" class="text-center py-4 text-danger">Error de conexión: ${err.message}</td></tr>`;
        }
    };

    function renderizarTabla(lista) {
        const tbody = document.getElementById('os-tbody');
        if (!tbody) return;

        if (!lista || lista.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" class="text-center py-5 text-muted">
                        <i class="bi bi-inbox fs-3 d-block mb-2 opacity-50"></i>
                        No hay órdenes de servicio registradas para los filtros seleccionados.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        lista.forEach(item => {
            const estadoServ = item.estado_servicio || 'INICIADO';
            let badgeServicio = '';
            if (estadoServ === 'FINALIZADO') {
                badgeServicio = `<span class="badge bg-primary bg-opacity-80 text-white px-2 py-0.5" style="font-size:0.68rem;">FINALIZADO</span>`;
            } else if (estadoServ === 'INICIADO') {
                badgeServicio = `<span class="badge bg-success bg-opacity-80 text-white px-2 py-0.5" style="font-size:0.68rem;">INICIADO</span>`;
            } else {
                badgeServicio = `<span class="badge bg-danger bg-opacity-80 text-white px-2 py-0.5" style="font-size:0.68rem;">ANULADO</span>`;
            }

            const viajeAsignado = item.viaje_asignado ? `@${item.viaje_asignado}` : 'Sin asignar';
            const badgeViaje = item.viaje_asignado 
                ? `<span class="badge bg-light text-dark border px-2 py-0.5 font-monospace" style="font-size:0.7rem;">${viajeAsignado}</span>`
                : `<span class="badge bg-danger bg-opacity-80 text-white px-2 py-0.5" style="font-size:0.68rem;">Sin asignar</span>`;

            const estadoViaje = item.viaje_asignado ? (item.estado_viaje || 'FINALIZADO') : 'Sin asignar';
            const badgeEstadoViaje = item.viaje_asignado
                ? `<span class="badge bg-primary bg-opacity-80 text-white px-2 py-0.5" style="font-size:0.68rem;">${escapeHtml(estadoViaje)}</span>`
                : `<span class="badge bg-danger bg-opacity-80 text-white px-2 py-0.5" style="font-size:0.68rem;">Sin asignar</span>`;

            const badgeDescarga = `<span class="badge bg-secondary bg-opacity-25 text-secondary border px-2 py-0.5" style="font-size:0.68rem;">${escapeHtml(item.estado_descarga || 'PENDIENTE')}</span>`;
            
            const countDoc = item.carga_doc || 0;
            const badgeCargaDoc = countDoc > 0
                ? `<span class="badge bg-secondary text-white px-2 py-0.5 font-monospace">${countDoc}</span>`
                : `<span class="badge bg-danger text-white px-2 py-0.5 font-monospace">0</span>`;

            const fInicio = item.fecha_fmt ? formatFecha(item.fecha_fmt) : '—';
            const fFin = item.fecha_fin_fmt ? formatFecha(item.fecha_fin_fmt) : '—';

            // Cálculos y formateos para nuevas columnas
            const volumenVal = parseFloat(item.volumen_documentos) || 0.000;
            const cantidadVal = parseFloat(item.carga_doc) || 0;
            const pesoVal = parseFloat(item.peso_documentos) || 0.00;
            const fleteVal = parseFloat(item.costo_flete) || 0.00;
            const costoMedidaVal = parseFloat(item.costo_medida) || fleteVal;
            const cargosVal = parseFloat(item.cargos_adicionales) || 0.00;
            const descuentosVal = parseFloat(item.descuentos) || 0.00;
            const subtotalVal = parseFloat(item.subtotal) || (fleteVal + cargosVal - descuentosVal);
            const igvVal = parseFloat(item.igv) || ((item.impuesto || '').includes('18') ? Number((subtotalVal * 0.18).toFixed(2)) : 0.00);
            const vehiculoStr = item.placa_tracto ? `${item.placa_tracto}${item.placa_carreta ? ' / ' + item.placa_carreta : ''}` : '—';
            const sustentoBtn = item.sustento_url 
                ? `<a href="${item.sustento_url}" target="_blank" class="btn btn-sm btn-outline-primary py-0 px-1.5" title="Ver Sustento"><i class="bi bi-file-earmark-arrow-down"></i></a>`
                : `<span class="text-muted opacity-50">—</span>`;

            html += `
                <tr>
                    <td class="text-nowrap">
                        <div class="dropdown d-inline-block">
                            <button class="btn btn-sm os-btn-editar-drop dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                EDITAR
                            </button>
                            <ul class="dropdown-menu shadow-sm border-0" style="font-size:0.8rem;">
                                <li><a class="dropdown-item fw-bold text-primary" href="javascript:void(0)" onclick="window.osAbrirModalEditar(${item.id})"><i class="bi bi-pencil-square me-1"></i> Modificar Orden</a></li>
                                <li><a class="dropdown-item text-success fw-bold" href="javascript:void(0)" onclick="window.osCambiarEstado(${item.id}, 'FINALIZADO')"><i class="bi bi-check2-circle me-1"></i> Marcar como Finalizado</a></li>
                                <li><a class="dropdown-item text-danger" href="javascript:void(0)" onclick="window.osCambiarEstado(${item.id}, 'ANULADO')"><i class="bi bi-x-circle me-1"></i> Anular Orden</a></li>
                            </ul>
                        </div>
                    </td>
                    <td class="text-nowrap font-monospace text-secondary">${fInicio}</td>
                    <td class="text-nowrap font-monospace fw-semibold">${fInicio}</td>
                    <td class="text-nowrap font-monospace text-muted">${fFin}</td>
                    <td class="text-nowrap font-monospace fw-bold text-dark" style="cursor:pointer;" onclick="window.osAbrirModalEditar(${item.id})" title="Ver detalles">${escapeHtml(item.codigo_orden)}</td>
                    <td class="text-nowrap">${badgeServicio}</td>
                    <td class="text-nowrap">${badgeViaje}</td>
                    <td class="text-nowrap">${badgeEstadoViaje}</td>
                    <td class="text-nowrap">${badgeDescarga}</td>
                    <td class="text-center text-nowrap">${badgeCargaDoc}</td>
                    <td class="text-nowrap fw-semibold">${escapeHtml(item.conductor || '—')}</td>
                    <td class="text-nowrap">${escapeHtml(item.tipo_contratacion || 'CLIENTE DIRECTO')}</td>
                    <td class="text-nowrap fw-bold text-dark">${escapeHtml(item.cliente_nombre || '—')}</td>
                    <td class="text-nowrap">${escapeHtml(item.cliente_nombre || '—')}</td>
                    <td class="text-center font-monospace">${item.puntos_carga || 1}</td>
                    <td class="text-center font-monospace">${item.puntos_destino || 1}</td>
                    <td class="text-nowrap font-monospace text-muted">${escapeHtml(item.ruta_sistema || item.tipo_servicio || '—')}</td>
                    <td class="text-nowrap">${escapeHtml(item.tipo_servicio || 'CARGA GENERAL')}</td>
                    <td class="text-end font-monospace">${volumenVal.toFixed(3)}</td>
                    <td class="text-end font-monospace">${cantidadVal.toLocaleString()}</td>
                    <td class="text-end font-monospace">${pesoVal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-nowrap">${escapeHtml(item.tipo_costo || 'POR VIAJE')}</td>
                    <td class="text-nowrap">${escapeHtml(item.impuesto || 'IGV 18%')}</td>
                    <td class="text-nowrap font-monospace">${escapeHtml(item.moneda || 'SOLES')}</td>
                    <td class="text-nowrap">${escapeHtml(item.tipo_medida || 'VIAJE')}</td>
                    <td class="text-end font-monospace">${costoMedidaVal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace text-secondary">${cargosVal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace text-danger">${descuentosVal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace fw-semibold">${subtotalVal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace text-muted">${igvVal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace fw-bold text-dark">${fleteVal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace">${item.kilometraje_fin ? Number(item.kilometraje_fin).toLocaleString() : '—'}</td>
                    <td class="text-nowrap font-monospace text-secondary">${escapeHtml(item.usuario_creacion || 'ADMINISTRADOR')}</td>
                    <td class="text-nowrap" style="max-width:180px; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(item.observaciones || '')}">${escapeHtml(item.observaciones || '—')}</td>
                    <td class="text-nowrap font-monospace fw-semibold">${escapeHtml(vehiculoStr)}</td>
                    <td class="text-nowrap font-monospace">${escapeHtml(item.factura || '—')}</td>
                    <td class="text-center text-nowrap">${sustentoBtn}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // ── Buscador local en tabla ─────────────────────────────────────
    window.osFiltrarLocalmente = function (termino) {
        const q = (termino || '').toLowerCase().trim();
        if (!q) {
            renderizarTabla(_osData);
            return;
        }
        _osFilteredData = _osData.filter(i => 
            (i.codigo_orden || '').toLowerCase().includes(q) ||
            (i.cliente_nombre || '').toLowerCase().includes(q) ||
            (i.conductor || '').toLowerCase().includes(q) ||
            (i.viaje_asignado || '').toLowerCase().includes(q) ||
            (i.tipo_servicio || '').toLowerCase().includes(q)
        );
        renderizarTabla(_osFilteredData);
    };

    // ── Botón Atrás Contextual ──────────────────────────────────────
    window.osRegresarAtras = function () {
        const modalEl = document.getElementById('modalOsForm');
        if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
        if (window._osOrigenApertura === 'detalle_viaje') {
            const drawer = document.getElementById('ovMonDrawer');
            const backdrop = document.getElementById('ovMonDrawerBackdrop');
            if (drawer) drawer.classList.add('active');
            if (backdrop) backdrop.classList.add('active');
            if (typeof window.ovRecargarMonitoreoActual === 'function') {
                window.ovRecargarMonitoreoActual();
            }
        }
    };

    // ── Abrir Modal para Nuevo ──────────────────────────────────────
    window.osAbrirModalNuevo = async function (viajeAsignado = '', origen = 'modulo_propio') {
        window._osOrigenApertura = origen;
        document.getElementById('modalOsFormLabel').textContent = 'Nueva Orden';
        document.getElementById('formOrdenServicio').reset();
        document.getElementById('os-input-id').value = '';
        _docsAdjuntosActuales = [];
        renderizarDocsAdjuntos();

        // Inicializar rutas con 1 fila por defecto según Imagen 1
        _osRutasActuales = [];
        window.osAgregarFilaRuta();

        // Configurar campo de Orden de Viaje Asignada
        const inpViaje = document.getElementById('os-input-viaje-asignado');
        const lockIcon = document.getElementById('os-viaje-lock-icon');
        const lockStatus = document.getElementById('os-viaje-lock-status');
        const helpText = document.getElementById('os-viaje-help-text');

        if (viajeAsignado && String(viajeAsignado).trim() !== '') {
            if (inpViaje) {
                inpViaje.value = String(viajeAsignado).trim();
                inpViaje.readOnly = true;
                inpViaje.classList.add('bg-warning-subtle');
            }
            if (lockIcon) lockIcon.className = 'bi bi-lock-fill text-warning';
            if (lockStatus) {
                lockStatus.className = 'badge bg-warning-subtle text-warning-emphasis border border-warning-subtle font-monospace';
                lockStatus.textContent = 'Bloqueado (Desde Viaje)';
            }
            if (helpText) helpText.textContent = 'Vinculada directamente al monitoreo de este viaje.';
        } else {
            if (inpViaje) {
                inpViaje.value = '';
                inpViaje.readOnly = false;
                inpViaje.classList.remove('bg-warning-subtle');
            }
            if (lockIcon) lockIcon.className = 'bi bi-unlock text-muted';
            if (lockStatus) {
                lockStatus.className = 'badge bg-light text-muted border font-monospace';
                lockStatus.textContent = 'Desbloqueado';
            }
            if (helpText) helpText.textContent = 'Puede ingresar o vincular la orden de viaje aquí.';
        }

        // Obtener correlativo autogenerado
        try {
            const r = await fetch('/api/operaciones/ordenes-servicio/correlativo');
            const d = await r.json();
            if (d.ok) {
                document.getElementById('os-input-serie').value = d.serie;
                document.getElementById('os-input-numero').value = d.numero;
            }
        } catch (e) {
            console.warn("No se pudo obtener correlativo:", e);
        }

        // Fecha actual
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('os-input-fecha').value = hoy;

        // Activar tab de Orden de Servicio por defecto
        activarTab('tab-os-orden-link');

        const modalEl = document.getElementById('modalOsForm');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();

        // Elevar backdrop sobre ovMonDrawer (z-index 1070)
        setTimeout(() => {
            const backdrops = document.querySelectorAll('.modal-backdrop');
            if (backdrops.length > 0) {
                const lastBd = backdrops[backdrops.length - 1];
                lastBd.style.zIndex = '1070';
                lastBd.style.backgroundColor = 'rgba(15, 23, 42, 0.68)';
                lastBd.style.opacity = '1';
            }
        }, 15);
    };

    // ── Abrir Modal para Editar ─────────────────────────────────────
    window.osAbrirModalEditar = async function (id, origen = 'modulo_propio') {
        window._osOrigenApertura = origen;
        document.getElementById('modalOsFormLabel').textContent = 'Editar Orden';
        document.getElementById('formOrdenServicio').reset();
        document.getElementById('os-input-id').value = id;

        try {
            const resp = await fetch(`/api/operaciones/ordenes-servicio/${id}`);
            const res = await resp.json();
            if (!res.ok || !res.data) {
                alert("No se pudo cargar la orden: " + (res.error || ''));
                return;
            }

            const item = res.data;
            document.getElementById('os-input-id').value = item.id;
            document.getElementById('os-input-serie').value = item.serie || '2026';
            document.getElementById('os-input-numero').value = item.numero || '';
            document.getElementById('os-input-fecha').value = item.fecha_fmt || '';
            document.getElementById('os-input-moneda').value = item.moneda || 'SOLES';
            document.getElementById('os-input-tipo-cambio').value = item.tipo_cambio || '3.750';
            document.getElementById('os-input-tipo-contratacion').value = item.tipo_contratacion || 'CLIENTE DIRECTO';
            document.getElementById('os-input-modalidad-ejecucion').value = item.modalidad_ejecucion || 'PROPIO';
            document.getElementById('os-input-cliente').value = item.cliente_nombre || '';
            document.getElementById('os-input-tipo-servicio').value = item.tipo_servicio || 'CARGA GENERAL';
            document.getElementById('os-input-tipo-costo').value = item.tipo_costo || 'POR VIAJE';
            document.getElementById('os-input-impuesto').value = item.impuesto || 'IGV 18%';
            document.getElementById('os-input-costo-flete').value = item.costo_flete || '0.00';
            document.getElementById('os-input-puntos-carga').value = item.puntos_carga || '1';
            document.getElementById('os-input-puntos-destino').value = item.puntos_destino || '1';
            document.getElementById('os-input-destinatario').value = item.destinatario || '';
            document.getElementById('os-input-observaciones').value = item.observaciones || '';

            // Configurar campo de Orden de Viaje Asignada
            const inpViaje = document.getElementById('os-input-viaje-asignado');
            const lockIcon = document.getElementById('os-viaje-lock-icon');
            const lockStatus = document.getElementById('os-viaje-lock-status');
            const helpText = document.getElementById('os-viaje-help-text');

            const viajeCode = item.viaje_asignado || '';
            if (inpViaje) inpViaje.value = viajeCode;

            if (origen === 'detalle_viaje' || viajeCode) {
                if (inpViaje) {
                    inpViaje.readOnly = (origen === 'detalle_viaje');
                    if (origen === 'detalle_viaje') inpViaje.classList.add('bg-warning-subtle');
                    else inpViaje.classList.remove('bg-warning-subtle');
                }
                if (lockIcon) lockIcon.className = (origen === 'detalle_viaje') ? 'bi bi-lock-fill text-warning' : 'bi bi-unlock text-muted';
                if (lockStatus) {
                    lockStatus.className = (origen === 'detalle_viaje') ? 'badge bg-warning-subtle text-warning-emphasis border border-warning-subtle font-monospace' : 'badge bg-light text-muted border font-monospace';
                    lockStatus.textContent = (origen === 'detalle_viaje') ? 'Bloqueado (Desde Viaje)' : 'Vinculado';
                }
                if (helpText) helpText.textContent = (origen === 'detalle_viaje') ? 'Vinculada directamente al monitoreo de este viaje.' : 'Orden vinculada a viaje.';
            } else {
                if (inpViaje) {
                    inpViaje.readOnly = false;
                    inpViaje.classList.remove('bg-warning-subtle');
                }
                if (lockIcon) lockIcon.className = 'bi bi-unlock text-muted';
                if (lockStatus) {
                    lockStatus.className = 'badge bg-light text-muted border font-monospace';
                    lockStatus.textContent = 'Desbloqueado';
                }
                if (helpText) helpText.textContent = 'Puede ingresar o vincular la orden de viaje aquí.';
            }

            // Rutas asociadas a esta orden
            _osRutasActuales = (item.rutas || []).map(r => ({
                ruta: r.ruta || '',
                distancia_km: r.distancia_km || '',
                galones: r.galones || ''
            }));
            if (_osRutasActuales.length === 0) {
                window.osAgregarFilaRuta();
            } else {
                osRenderizarTablaRutas();
            }

            _docsAdjuntosActuales = (item.documentos || []).map(d => ({
                id: d.id,
                guia_remision_id: d.guia_remision_id,
                numero_documento: d.numero_documento,
                gr_remitente: d.gr_remitente || '—',
                numero_transporte: d.numero_transporte || '—',
                placa_referencia: d.placa_referencia || '—',
                volumen: parseFloat(d.volumen) || 0.000,
                cantidad: parseFloat(d.cantidad) || 0.00,
                peso: parseFloat(d.peso) || 0.00,
                remitente: d.remitente || '—',
                destinatario: d.destinatario || '—',
                fecha_carga: d.fecha_carga_fmt || '—',
                fecha_entrega: d.fecha_entrega_fmt || '—'
            }));

            renderizarDocsAdjuntos();

            // Pestaña inicial según origen
            activarTab(origen === 'detalle_viaje' ? 'tab-os-orden-link' : 'tab-os-documentos-link');

            const modalEl = document.getElementById('modalOsForm');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();

            // Elevar backdrop sobre ovMonDrawer (z-index 1070)
            setTimeout(() => {
                const backdrops = document.querySelectorAll('.modal-backdrop');
                if (backdrops.length > 0) {
                    const lastBd = backdrops[backdrops.length - 1];
                    lastBd.style.zIndex = '1070';
                    lastBd.style.backgroundColor = 'rgba(15, 23, 42, 0.68)';
                    lastBd.style.opacity = '1';
                }
            }, 15);
        } catch (err) {
            console.error("Error al abrir edición:", err);
            alert("Error: " + err.message);
        }
    };

    window.osAbrirModalEditarCodigo = async function (codigo, origen = 'detalle_viaje') {
        return window.osAbrirModalEditar(codigo, origen);
    };

    // ── GESTIÓN DE FILAS DE RUTAS (Imagen 1) ────────────────────────
    window.osAgregarFilaRuta = function (rutaVal = '', distVal = '', galVal = '') {
        _osRutasActuales.push({
            ruta: rutaVal,
            distancia_km: distVal,
            galones: galVal
        });
        osRenderizarTablaRutas();
    };

    window.osEliminarFilaRuta = function (idx) {
        _osRutasActuales.splice(idx, 1);
        if (_osRutasActuales.length === 0) {
            _osRutasActuales.push({ ruta: '', distancia_km: '', galones: '' });
        }
        osRenderizarTablaRutas();
    };

    window.osActualizarRutaCampo = function (idx, campo, valor) {
        if (_osRutasActuales[idx]) {
            _osRutasActuales[idx][campo] = valor;
        }
    };

    function osRenderizarTablaRutas() {
        const tbody = document.getElementById('os-rutas-tbody');
        if (!tbody) return;

        if (!_osRutasActuales || _osRutasActuales.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-4 text-muted">
                        No hay rutas configuradas. Haga clic en <b>+ Agregar</b> para añadir una.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        _osRutasActuales.forEach((r, idx) => {
            html += `
                <tr>
                    <td>
                        <input type="text" list="os-rutas-datalist" class="form-control form-control-sm text-uppercase fw-semibold" placeholder="Ej: LIMA - PIURA" value="${escapeHtml(r.ruta || '')}" oninput="window.osActualizarRutaCampo(${idx}, 'ruta', this.value)">
                    </td>
                    <td>
                        <input type="number" step="0.1" class="form-control form-control-sm font-monospace" placeholder="0" value="${escapeHtml(String(r.distancia_km !== undefined ? r.distancia_km : ''))}" oninput="window.osActualizarRutaCampo(${idx}, 'distancia_km', this.value)">
                    </td>
                    <td>
                        <input type="number" step="0.1" class="form-control form-control-sm font-monospace" placeholder="0" value="${escapeHtml(String(r.galones !== undefined ? r.galones : ''))}" oninput="window.osActualizarRutaCampo(${idx}, 'galones', this.value)">
                    </td>
                    <td class="text-center">
                        <button type="button" class="btn btn-danger btn-sm p-1 px-2.5 rounded-2 shadow-2xs" onclick="window.osEliminarFilaRuta(${idx})" title="Eliminar fila">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    function activarTab(tabLinkId) {
        const linkEl = document.getElementById(tabLinkId);
        if (linkEl) {
            const trigger = new bootstrap.Tab(linkEl);
            trigger.show();
        }
    }

    // ── Renderizar tabla de documentos adjuntos a la OS (Imagen 3) ──
    function renderizarDocsAdjuntos() {
        const tbody = document.getElementById('os-docs-tbody');
        const countSpan = document.getElementById('os-doc-total-count');
        const volSpan = document.getElementById('os-doc-total-volumen');
        if (!tbody) return;

        let totalVol = 0;
        _docsAdjuntosActuales.forEach(d => {
            totalVol += parseFloat(d.volumen) || 0;
        });

        if (countSpan) countSpan.textContent = _docsAdjuntosActuales.length;
        if (volSpan) volSpan.textContent = totalVol.toFixed(3);

        if (_docsAdjuntosActuales.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center py-4 text-muted">
                        No hay documentos anexados aún. Haga clic en <b>+ Agregar</b> para vincular una GRE.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        _docsAdjuntosActuales.forEach((doc, idx) => {
            html += `
                <tr>
                    <td class="text-nowrap font-monospace">${escapeHtml(doc.fecha_carga || '—')}</td>
                    <td class="text-nowrap font-monospace fw-bold text-primary">${escapeHtml(doc.numero_documento || '—')}</td>
                    <td class="text-nowrap">${escapeHtml(doc.gr_remitente || '—')}</td>
                    <td class="text-nowrap font-monospace">${escapeHtml(doc.numero_transporte || '—')}</td>
                    <td class="text-nowrap font-monospace fw-bold">${escapeHtml(doc.placa_referencia || '—')}</td>
                    <td class="text-end font-monospace">${Number(doc.volumen || 0).toFixed(3)}</td>
                    <td class="text-end font-monospace">${Number(doc.cantidad || 0).toLocaleString()}</td>
                    <td class="text-end font-monospace">${Number(doc.peso || 0).toLocaleString()}</td>
                    <td class="text-nowrap" style="max-width:140px; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(doc.remitente)}">${escapeHtml(doc.remitente)}</td>
                    <td class="text-nowrap" style="max-width:140px; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(doc.destinatario)}">${escapeHtml(doc.destinatario)}</td>
                    <td class="text-nowrap font-monospace">${escapeHtml(doc.fecha_entrega || '—')}</td>
                    <td class="text-center text-nowrap">
                        <button type="button" class="btn btn-outline-danger btn-sm py-0 px-1.5" onclick="window.osRemoverDocAdjunto(${idx})" title="Desvincular Guía">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    window.osRemoverDocAdjunto = function (idx) {
        _docsAdjuntosActuales.splice(idx, 1);
        renderizarDocsAdjuntos();
    };

    // ── Guardar Orden de Servicio (Create / Update) ──────────────────
    window.osGuardarOrdenDirecto = function () {
        const form = document.getElementById('formOrdenServicio');
        if (form) {
            form.requestSubmit();
        }
    };

    window.osGuardarOrden = async function (e) {
        if (e && e.preventDefault) e.preventDefault();

        const id = document.getElementById('os-input-id')?.value;
        const serie = document.getElementById('os-input-serie')?.value || '2026';
        const numero = document.getElementById('os-input-numero')?.value;
        const fecha = document.getElementById('os-input-fecha')?.value;
        const moneda = document.getElementById('os-input-moneda')?.value;
        const tipo_cambio = document.getElementById('os-input-tipo-cambio')?.value;
        const tipo_contratacion = document.getElementById('os-input-tipo-contratacion')?.value;
        const modalidad_ejecucion = document.getElementById('os-input-modalidad-ejecucion')?.value;
        const cliente_nombre = document.getElementById('os-input-cliente')?.value;
        const tipo_servicio = document.getElementById('os-input-tipo-servicio')?.value;
        const tipo_costo = document.getElementById('os-input-tipo-costo')?.value;
        const impuesto = document.getElementById('os-input-impuesto')?.value;
        const costo_flete = document.getElementById('os-input-costo-flete')?.value;
        const puntos_carga = document.getElementById('os-input-puntos-carga')?.value;
        const puntos_destino = document.getElementById('os-input-puntos-destino')?.value;
        const destinatario = document.getElementById('os-input-destinatario')?.value;
        const observaciones = document.getElementById('os-input-observaciones')?.value;
        const viaje_asignado = document.getElementById('os-input-viaje-asignado')?.value?.trim() || null;

        if (!cliente_nombre) {
            alert("Por favor seleccione un Cliente/Remitente (*).");
            activarTab('tab-os-orden-link');
            return;
        }

        const rutasLimpia = _osRutasActuales.filter(r => (r.ruta && r.ruta.trim() !== '') || r.distancia_km || r.galones);

        const payload = {
            serie,
            numero,
            fecha,
            moneda,
            tipo_cambio,
            tipo_contratacion,
            modalidad_ejecucion,
            cliente_nombre,
            tipo_servicio,
            tipo_costo,
            impuesto,
            costo_flete,
            puntos_carga,
            puntos_destino,
            destinatario,
            observaciones,
            viaje_asignado,
            rutas: rutasLimpia,
            documentos: _docsAdjuntosActuales
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/operaciones/ordenes-servicio/${id}` : '/api/operaciones/ordenes-servicio';

        try {
            const resp = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await resp.json();

            if (result.ok) {
                alert(result.message || "Orden de servicio guardada exitosamente.");
                window.osRegresarAtras();
                if (window._osOrigenApertura !== 'detalle_viaje') {
                    window.osCargarTabla();
                }
            } else {
                alert("Error: " + (result.error || 'No se pudo guardar la orden'));
            }
        } catch (err) {
            console.error("Error guardando orden:", err);
            alert("Error de conexión: " + err.message);
        }
    };

    // ── Cambiar Estado (Finalizar o Anular) ──────────────────────────
    window.osCambiarEstado = async function (id, nuevoEstado) {
        if (!confirm(`¿Está seguro de marcar la orden de servicio como ${nuevoEstado}?`)) return;
        try {
            const resp = await fetch(`/api/operaciones/ordenes-servicio/${id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado_servicio: nuevoEstado })
            });
            const res = await resp.json();
            if (res.ok) {
                window.osCargarTabla();
            } else {
                alert("Error: " + (res.error || ''));
            }
        } catch (e) {
            alert("Error al actualizar estado: " + e.message);
        }
    };

    // =========================================================================
    // 🔍 SELECTOR DE GRES SIN ASIGNAR (Modal Secundario - Imagen 4)
    // =========================================================================

    window.osAbrirSelectorGre = async function () {
        const modalEl = document.getElementById('modalOsSelectorGre');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        await window.osRecargarGresDisponibles();
    };

    window.osRecargarGresDisponibles = async function () {
        const tbody = document.getElementById('os-gre-selector-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="text-center py-4 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                    Consultando guías de remisión disponibles...
                </td>
            </tr>
        `;

        try {
            const resp = await fetch('/api/guias-remision/disponibles-sin-servicio');
            const res = await resp.json();

            if (res.ok) {
                _gresDisponiblesCache = res.data || [];
                renderizarGresDisponibles(_gresDisponiblesCache);
            } else {
                tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-danger">${res.error || 'Error al cargar guías'}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-danger">Error: ${e.message}</td></tr>`;
        }
    };

    function renderizarGresDisponibles(lista) {
        const tbody = document.getElementById('os-gre-selector-tbody');
        if (!tbody) return;

        // Filtrar las que ya están adjuntas localmente
        const yaAdjuntas = new Set(_docsAdjuntosActuales.map(d => d.numero_documento));
        const disponibles = (lista || []).filter(g => !yaAdjuntas.has(g.numero_guia));

        if (disponibles.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center py-5 text-muted">
                        No hay datos disponibles en la tabla
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        disponibles.forEach(g => {
            const fCarga = g.fecha_traslado || g.fecha_emision || '—';
            const fEntrega = g.fecha_traslado || '—';
            const jsonDoc = encodeURIComponent(JSON.stringify(g));

            html += `
                <tr>
                    <td class="text-nowrap font-monospace">${escapeHtml(fCarga)}</td>
                    <td class="text-nowrap font-monospace fw-bold text-primary">${escapeHtml(g.numero_guia)}</td>
                    <td class="text-nowrap">${escapeHtml(g.numero_guia)}</td>
                    <td class="text-nowrap font-monospace">${escapeHtml(g.numero_guia)}</td>
                    <td class="text-nowrap font-monospace fw-bold">${escapeHtml(g.placa_tracto || '—')}</td>
                    <td class="text-nowrap" style="max-width:140px; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(g.remitente_razon_social)}">${escapeHtml(g.remitente_razon_social || '—')}</td>
                    <td class="text-nowrap" style="max-width:140px; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(g.destinatario_razon_social)}">${escapeHtml(g.destinatario_razon_social || '—')}</td>
                    <td class="text-end font-monospace">${Number(g.volumen_m3 || 0).toFixed(3)}</td>
                    <td class="text-end font-monospace">${Number(g.total_items || 1).toLocaleString()}</td>
                    <td class="text-end font-monospace">${Number(g.peso_bruto_total || 0).toLocaleString()}</td>
                    <td class="text-nowrap font-monospace">${escapeHtml(fEntrega)}</td>
                    <td class="text-center text-nowrap">
                        <button type="button" class="btn btn-sm btn-primary py-0 px-2 fw-bold" onclick="window.osSeleccionarGre('${jsonDoc}')">
                            <i class="bi bi-plus-circle me-1"></i> Anexar
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    window.osFiltrarGresDisponibles = function (txt) {
        const q = (txt || '').toLowerCase().trim();
        if (!q) {
            renderizarGresDisponibles(_gresDisponiblesCache);
            return;
        }
        const filtradas = _gresDisponiblesCache.filter(g =>
            (g.numero_guia || '').toLowerCase().includes(q) ||
            (g.remitente_razon_social || '').toLowerCase().includes(q) ||
            (g.destinatario_razon_social || '').toLowerCase().includes(q) ||
            (g.placa_tracto || '').toLowerCase().includes(q)
        );
        renderizarGresDisponibles(filtradas);
    };

    window.osSeleccionarGre = function (jsonDocEnc) {
        try {
            const g = JSON.parse(decodeURIComponent(jsonDocEnc));
            _docsAdjuntosActuales.push({
                guia_remision_id: g.id,
                numero_documento: g.numero_guia,
                tipo_documento: 'GRE',
                gr_remitente: g.numero_guia,
                numero_transporte: g.numero_guia,
                placa_referencia: g.placa_tracto || '',
                volumen: parseFloat(g.volumen_m3) || 0.000,
                cantidad: parseFloat(g.total_items) || 1.00,
                peso: parseFloat(g.peso_bruto_total) || 0.00,
                remitente: g.remitente_razon_social || '',
                destinatario: g.destinatario_razon_social || '',
                fecha_carga: g.fecha_traslado || g.fecha_emision || '',
                fecha_entrega: g.fecha_traslado || ''
            });

            renderizarDocsAdjuntos();

            // Cerrar el selector y volver al modal principal
            const modalEl = document.getElementById('modalOsSelectorGre');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            // Asegurar que el modal principal mantenga el scroll
            document.body.classList.add('modal-open');
        } catch (e) {
            console.error("Error al anexar GRE:", e);
            alert("Error al seleccionar la guía.");
        }
    };

    // ── Exportar a Excel e Imprimir ─────────────────────────────────
    window.osExportarExcel = function () {
        if (typeof window.descargarExcelDinamico === 'function') {
            window.descargarExcelDinamico('tablaOrdenesServicio', 'Ordenes_de_Servicio_Azkell');
        } else {
            alert("Módulo de exportación no disponible.");
        }
    };

    window.osImprimirTabla = function () {
        window.print();
    };

    window.osToggleColumnas = function () {
        alert("Personalización de visibilidad de columnas disponible en la próxima actualización.");
    };

    // ── Helpers ─────────────────────────────────────────────────────
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatFecha(isoStr) {
        if (!isoStr) return '—';
        const p = isoStr.split('-');
        if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
        return isoStr;
    }

})();
