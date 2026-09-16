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
        // Último día del mes actual para que cubra todo el mes en curso
        const ultimoDiaMes = new Date(y, ahora.getMonth() + 1, 0).getDate();
        const dFin = String(ultimoDiaMes).padStart(2, '0');

        // Primer día del mes actual para "Desde"
        const fDesde = document.getElementById('os-filtro-desde');
        if (fDesde && !fDesde.value) {
            fDesde.value = `${y}-${m}-01`;
        }

        // Fin de mes para "Hasta" (para que no se corten servicios programados o creados con fecha futura/hoy)
        const fHasta = document.getElementById('os-filtro-hasta');
        if (fHasta && !fHasta.value) {
            fHasta.value = `${y}-${m}-${dFin}`;
        }
    }

    async function cargarClientesFiltro() {
        try {
            const resp = await fetch('/api/clientes');
            const data = await resp.json();
            _clientesCache = Array.isArray(data) ? data : (data.data || []);

            const selFiltro = document.getElementById('os-filtro-cliente');
            const datalistModal = document.getElementById('os-clientes-datalist');

            if (selFiltro) {
                selFiltro.innerHTML = '<option value="TODOS">Seleccione...</option>' + 
                    _clientesCache.map(c => `<option value="${escapeHtml(c.razon_social)}">${escapeHtml(c.razon_social)}</option>`).join('');
            }
            if (datalistModal) {
                datalistModal.innerHTML = _clientesCache.map(c => `<option value="${escapeHtml(c.razon_social)}"></option>`).join('');
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
                <td colspan="19" class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm text-warning me-2"></div>
                    Cargando órdenes de servicio...
                </td>
            </tr>
        `;

        const desde = document.getElementById('os-filtro-desde')?.value || '';
        const hasta = document.getElementById('os-filtro-hasta')?.value || '';

        const params = new URLSearchParams();
        if (desde) params.append('fecha_desde', desde);
        if (hasta) params.append('fecha_hasta', hasta);

        try {
            const resp = await fetch(`/api/operaciones/ordenes-servicio?${params.toString()}`);
            const result = await resp.json();

            if (result.ok) {
                _osData = result.data || [];
                _osFilteredData = [..._osData];
                renderizarTabla(_osFilteredData);
            } else {
                tbody.innerHTML = `<tr><td colspan="19" class="text-center py-4 text-danger">Error: ${result.error || 'No se pudo cargar la información'}</td></tr>`;
            }
        } catch (err) {
            console.error("Error al consultar órdenes de servicio:", err);
            tbody.innerHTML = `<tr><td colspan="19" class="text-center py-4 text-danger">Error de conexión: ${err.message}</td></tr>`;
        }
    };

    function renderizarTabla(lista) {
        const tbody = document.getElementById('os-tbody');
        if (!tbody) return;

        if (!lista || lista.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="19" class="text-center py-5 text-muted">
                        <i class="bi bi-inbox fs-3 d-block mb-2 opacity-50"></i>
                        No hay órdenes de servicio registradas para los filtros seleccionados.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        lista.forEach(item => {
            const badgeViaje = item.viaje_asignado 
                ? `<span class="fw-bold text-dark font-monospace">${escapeHtml(item.viaje_asignado)}</span>`
                : `<span class="text-muted opacity-50">—</span>`;

            const fInicio = item.fecha_fmt ? formatFecha(item.fecha_fmt) : '—';
            const fleteVal = parseFloat(item.costo_flete) || 0.00;
            const sustentoBtn = item.sustento_url 
                ? `<a href="${item.sustento_url}" target="_blank" class="btn btn-sm btn-outline-primary py-0 px-1.5" title="Ver Sustento"><i class="bi bi-file-earmark-arrow-down"></i></a>`
                : `<span class="text-muted opacity-50">—</span>`;

            // Badge estilizado de Estado de Servicio
            const estServ = String(item.estado_servicio || 'PENDIENTE').toUpperCase();
            let badgeEstado = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle font-monospace px-2 py-1"><i class="bi bi-clock me-1"></i>PENDIENTE</span>';
            if (estServ === 'INICIADO') {
                badgeEstado = '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle font-monospace px-2 py-1"><i class="bi bi-play-circle me-1"></i>INICIADO</span>';
            } else if (estServ === 'FINALIZADO') {
                badgeEstado = '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle font-monospace px-2 py-1"><i class="bi bi-check2-circle me-1"></i>FINALIZADO</span>';
            } else if (estServ === 'ANULADO' || estServ === 'CANCELADO') {
                badgeEstado = '<span class="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle font-monospace px-2 py-1"><i class="bi bi-x-circle me-1"></i>ANULADO</span>';
            }

            html += `
                <tr>
                    <td class="text-nowrap col-sticky-os-accion">
                        <div class="dropdown d-inline-block">
                            <button class="btn btn-sm os-btn-editar-drop dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-strategy="fixed" aria-expanded="false">
                                ACCIÓN
                            </button>
                            <ul class="dropdown-menu shadow-sm border-0" style="font-size:0.8rem;">
                                <li><a class="dropdown-item fw-bold text-primary" href="javascript:void(0)" onclick="window.osAbrirModalEditar(${item.id})"><i class="bi bi-pencil-square me-1"></i> Modificar Orden</a></li>
                                ${estServ !== 'INICIADO' && estServ !== 'FINALIZADO' ? `<li><a class="dropdown-item text-primary fw-bold" href="javascript:void(0)" onclick="window.osCambiarEstado(${item.id}, 'INICIADO', '${escapeHtml(item.codigo_orden)}')"><i class="bi bi-play-fill me-1"></i> Iniciar Servicio</a></li>` : ''}
                                ${estServ === 'INICIADO' ? `<li><a class="dropdown-item text-warning fw-bold" href="javascript:void(0)" onclick="window.osCambiarEstado(${item.id}, 'PENDIENTE', '${escapeHtml(item.codigo_orden)}')"><i class="bi bi-arrow-counterclockwise me-1"></i> Volver a Pendiente</a></li>` : ''}
                                ${estServ !== 'FINALIZADO' ? `<li><a class="dropdown-item text-success fw-bold" href="javascript:void(0)" onclick="window.osCambiarEstado(${item.id}, 'FINALIZADO', '${escapeHtml(item.codigo_orden)}')"><i class="bi bi-check2-circle me-1"></i> Finalizar Servicio</a></li>` : ''}
                                ${estServ !== 'ANULADO' ? `<li><a class="dropdown-item text-danger" href="javascript:void(0)" onclick="window.osCambiarEstado(${item.id}, 'ANULADO', '${escapeHtml(item.codigo_orden)}')"><i class="bi bi-x-circle me-1"></i> Anular Orden</a></li>` : ''}
                            </ul>
                        </div>
                    </td>
                    <td class="text-nowrap font-monospace fw-bold text-primary" style="cursor:pointer;" onclick="window.osAbrirModalEditar(${item.id})" title="Ver detalles">${escapeHtml(item.codigo_orden)}</td>
                    <td class="text-center text-nowrap">${badgeEstado}</td>
                    <td class="text-nowrap font-monospace">${fInicio}</td>
                    <td class="text-nowrap">${badgeViaje}</td>
                    <td class="text-nowrap font-monospace fw-semibold">${escapeHtml(item.placa_tracto || '—')}</td>
                    <td class="text-nowrap font-monospace fw-semibold">${escapeHtml(item.placa_carreta || '—')}</td>
                    <td class="text-nowrap fw-bold text-dark">${escapeHtml(item.cliente_nombre || '—')}</td>
                    <td class="text-nowrap">${escapeHtml(item.tipo_contratacion || 'CLIENTE DIRECTO')}</td>
                    <td class="text-nowrap">${escapeHtml(item.modalidad_ejecucion || 'PROPIO')}</td>
                    <td class="text-nowrap">${(item.es_retorno === 1 || item.es_retorno === '1' || item.es_retorno === true) ? '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle font-monospace"><i class="bi bi-arrow-left me-0.5"></i>RETORNO</span>' : '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle font-monospace"><i class="bi bi-arrow-right me-0.5"></i>IDA</span>'}</td>
                    <td class="text-nowrap">${escapeHtml(item.tipo_servicio || 'CARGA GENERAL')}</td>
                    <td class="text-nowrap">${escapeHtml(item.destinatario || '—')}</td>
                    <td class="text-center font-monospace">${item.puntos_carga || 1}</td>
                    <td class="text-center font-monospace">${item.puntos_destino || 1}</td>
                    <td class="text-nowrap">${escapeHtml(item.tipo_costo || 'COSTO TARIFA')}</td>
                    <td class="text-nowrap">${escapeHtml(item.impuesto || 'INCLUYE IGV')}</td>
                    <td class="text-nowrap font-monospace">${escapeHtml(item.moneda || 'SOLES')}</td>
                    <td class="text-end font-monospace fw-bold text-dark">${item.moneda === 'DÓLARES' ? '$' : 'S/'} ${fleteVal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-center text-nowrap">${sustentoBtn}</td>
                    <td class="text-nowrap" style="max-width:180px; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(item.observaciones || '')}">${escapeHtml(item.observaciones || '—')}</td>
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
    // ── Cambio Dinámico de Moneda y Tipo de Cambio ──────────────────
    window.osCambiarMoneda = function (moneda) {
        const grp = document.getElementById('os-grp-tipo-cambio');
        const inp = document.getElementById('os-input-tipo-cambio');
        const isDolares = (moneda === 'DÓLARES' || moneda === 'DOLARES');
        if (grp) {
            grp.style.display = isDolares ? 'block' : 'none';
        }
        if (isDolares && inp) {
            if (!inp.value || inp.value === '3.750' || inp.value === '0') {
                inp.value = '3.40';
            }
        }
    };

    // ── Abrir Modal para Nuevo ──────────────────────────────────────
    window.osAbrirModalNuevo = async function (viajeAsignado = '', origen = 'modulo_propio', datosExtra = {}) {
        window._osOrigenApertura = origen;
        document.getElementById('modalOsFormLabel').textContent = 'Nueva Orden';
        document.getElementById('formOrdenServicio').reset();
        document.getElementById('os-input-id').value = '';
        _docsAdjuntosActuales = [];
        renderizarDocsAdjuntos();

        // Moneda por defecto SOLES y Tipo de Cambio oculto
        const selMoneda = document.getElementById('os-input-moneda');
        if (selMoneda) selMoneda.value = 'SOLES';
        window.osCambiarMoneda('SOLES');

        // Inicializar rutas con 1 fila por defecto según Imagen 1
        _osRutasActuales = [];
        window.osAgregarFilaRuta();

        // Asignar Tracto y Carreta (ATP999)
        const inpTracto = document.getElementById('os-input-tracto');
        const inpCarreta = document.getElementById('os-input-carreta');
        if (inpTracto) inpTracto.value = datosExtra.placa_tracto || '';
        if (inpCarreta) inpCarreta.value = datosExtra.placa_carreta || datosExtra.placa_remolque || '';

        // Si viene cliente asignado
        const inpCliente = document.getElementById('os-input-cliente');
        if (inpCliente && datosExtra.cliente) inpCliente.value = datosExtra.cliente;

        const selEsRetorno = document.getElementById('os-input-es-retorno');
        if (selEsRetorno) selEsRetorno.value = '0';

        // Selectores default
        const selTipoCosto = document.getElementById('os-input-tipo-costo');
        if (selTipoCosto) selTipoCosto.value = 'COSTO TARIFA';
        const selImpuesto = document.getElementById('os-input-impuesto');
        if (selImpuesto) selImpuesto.value = 'INCLUYE IGV';
        const selPuntosCarga = document.getElementById('os-input-puntos-carga');
        if (selPuntosCarga) selPuntosCarga.value = '1';
        const selPuntosDestino = document.getElementById('os-input-puntos-destino');
        if (selPuntosDestino) selPuntosDestino.value = '1';
        const inpCostoFlete = document.getElementById('os-input-costo-flete');
        if (inpCostoFlete) inpCostoFlete.value = '0.00';

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

        // Correlativo autogenerado (inicia en 00000001)
        document.getElementById('os-input-serie').value = '2026';
        document.getElementById('os-input-numero').value = '00000001';
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

        // Fecha actual en hora local (evita desfase UTC de toISOString)
        const ahoraLocal = new Date();
        const yLocal = ahoraLocal.getFullYear();
        const mLocal = String(ahoraLocal.getMonth() + 1).padStart(2, '0');
        const dLocal = String(ahoraLocal.getDate()).padStart(2, '0');
        const hoy = `${yLocal}-${mLocal}-${dLocal}`;
        document.getElementById('os-input-fecha').value = hoy;

        // Activar tab de Orden de Servicio por defecto
        activarTab('tab-os-orden-link');

        // Si se abre desde detalle de viaje, ocultar momentáneamente el drawer para evitar doble cortina oscura
        if (origen === 'detalle_viaje') {
            const drawer = document.getElementById('ovMonDrawer');
            const backdrop = document.getElementById('ovMonDrawerBackdrop');
            if (drawer) drawer.classList.remove('active');
            if (backdrop) backdrop.classList.remove('active');
        }

        const modalEl = document.getElementById('modalOsForm');
        if (modalEl && modalEl.parentElement !== document.body) {
            document.body.appendChild(modalEl);
        }

        // Listener de cierre seguro para restaurar drawer de viaje si fue el origen
        if (modalEl && !modalEl._hasDrawerRestoreListener) {
            modalEl._hasDrawerRestoreListener = true;
            modalEl.addEventListener('hidden.bs.modal', function () {
                if (window._osOrigenApertura === 'detalle_viaje') {
                    const drawer = document.getElementById('ovMonDrawer');
                    const backdrop = document.getElementById('ovMonDrawerBackdrop');
                    if (drawer) drawer.classList.add('active');
                    if (backdrop) backdrop.classList.add('active');
                    if (typeof window.ovRecargarMonitoreoActual === 'function') {
                        window.ovRecargarMonitoreoActual();
                    }
                }
            });
        }

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
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

            const monedaVal = item.moneda || 'SOLES';
            document.getElementById('os-input-moneda').value = monedaVal;
            window.osCambiarMoneda(monedaVal);
            if (item.tipo_cambio) {
                document.getElementById('os-input-tipo-cambio').value = item.tipo_cambio;
            }

            document.getElementById('os-input-tracto').value = item.placa_tracto || '';
            document.getElementById('os-input-carreta').value = item.placa_carreta || '';

            document.getElementById('os-input-tipo-contratacion').value = item.tipo_contratacion || 'CLIENTE DIRECTO';
            document.getElementById('os-input-modalidad-ejecucion').value = item.modalidad_ejecucion || 'PROPIO';
            document.getElementById('os-input-cliente').value = item.cliente_nombre || '';
            const tServ = String(item.tipo_servicio || '').toUpperCase();
            document.getElementById('os-input-tipo-servicio').value = (tServ.includes('LOCAL')) ? 'TRANSPORTE LOCAL' : 'TRANSPORTE NACIONAL';
            const selEsRetorno = document.getElementById('os-input-es-retorno');
            if (selEsRetorno) selEsRetorno.value = (item.es_retorno === 1 || item.es_retorno === '1' || item.es_retorno === true) ? '1' : '0';
            document.getElementById('os-input-tipo-costo').value = item.tipo_costo || 'COSTO TARIFA';
            document.getElementById('os-input-impuesto').value = item.impuesto || 'INCLUYE IGV';
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

            // Si se abre desde detalle de viaje, ocultar momentáneamente el drawer para evitar doble cortina oscura
            if (origen === 'detalle_viaje') {
                const drawer = document.getElementById('ovMonDrawer');
                const backdrop = document.getElementById('ovMonDrawerBackdrop');
                if (drawer) drawer.classList.remove('active');
                if (backdrop) backdrop.classList.remove('active');
            }

            const modalEl = document.getElementById('modalOsForm');
            if (modalEl && modalEl.parentElement !== document.body) {
                document.body.appendChild(modalEl);
            }

            // Listener de cierre seguro para restaurar drawer de viaje si fue el origen
            if (modalEl && !modalEl._hasDrawerRestoreListener) {
                modalEl._hasDrawerRestoreListener = true;
                modalEl.addEventListener('hidden.bs.modal', function () {
                    if (window._osOrigenApertura === 'detalle_viaje') {
                        const drawer = document.getElementById('ovMonDrawer');
                        const backdrop = document.getElementById('ovMonDrawerBackdrop');
                        if (drawer) drawer.classList.add('active');
                        if (backdrop) backdrop.classList.add('active');
                        if (typeof window.ovRecargarMonitoreoActual === 'function') {
                            window.ovRecargarMonitoreoActual();
                        }
                    }
                });
            }

            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
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
        const es_retorno = parseInt(document.getElementById('os-input-es-retorno')?.value || '0', 10);
        const tipo_costo = document.getElementById('os-input-tipo-costo')?.value;
        const impuesto = document.getElementById('os-input-impuesto')?.value;
        const costo_flete = document.getElementById('os-input-costo-flete')?.value;
        const puntos_carga = document.getElementById('os-input-puntos-carga')?.value;
        const puntos_destino = document.getElementById('os-input-puntos-destino')?.value;
        const destinatario = document.getElementById('os-input-destinatario')?.value;
        const observaciones = document.getElementById('os-input-observaciones')?.value;
        const viaje_asignado = document.getElementById('os-input-viaje-asignado')?.value?.trim() || null;
        const placa_tracto = document.getElementById('os-input-tracto')?.value?.trim() || null;
        const placa_carreta = document.getElementById('os-input-carreta')?.value?.trim() || null;

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
            es_retorno,
            tipo_costo,
            impuesto,
            costo_flete,
            puntos_carga,
            puntos_destino,
            destinatario,
            observaciones,
            viaje_asignado,
            placa_tracto,
            placa_carreta,
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
                const esNuevo = !id;
                const nuevoCodigo = result.codigo_orden || `${serie}-${numero}`;
                const osGuardadaId = result.id || id;

                window.osRegresarAtras();
                if (window._osOrigenApertura !== 'detalle_viaje') {
                    window.osCargarTabla();
                }

                // Si es un nuevo registro y tiene viaje vinculado, ofrecer generar la caja de cochera al conductor
                if (esNuevo) {
                    setTimeout(async () => {
                        let nombreCond = '';
                        let rutaViaje = '';
                        if (viaje_asignado) {
                            try {
                                const rV = await fetch(`/api/operaciones/ordenes-viaje?q=${encodeURIComponent(viaje_asignado)}`);
                                const dV = await rV.json();
                                if (dV.ok && Array.isArray(dV.data)) {
                                    const vEncontrado = dV.data.find(v => v.viaje === viaje_asignado);
                                    if (vEncontrado) {
                                        nombreCond = vEncontrado.conductor || '';
                                        rutaViaje = vEncontrado.ruta || '';
                                    }
                                }
                            } catch(eIgn) {}
                        }

                        window.osAbrirModalCocheraExpress({
                            id: osGuardadaId,
                            codigo_orden: nuevoCodigo,
                            viaje_asignado: viaje_asignado,
                            placa_tracto: placa_tracto,
                            conductor: nombreCond,
                            ruta: rutaViaje
                        });
                    }, 250);
                } else {
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({ icon: 'success', title: '¡Guardado!', text: result.message || 'Orden de servicio guardada exitosamente.', timer: 1800, showConfirmButton: false });
                    } else {
                        alert(result.message || "Orden de servicio guardada exitosamente.");
                    }
                }
            } else {
                alert("Error: " + (result.error || 'No se pudo guardar la orden'));
            }
        } catch (err) {
            console.error("Error guardando orden:", err);
            alert("Error de conexión: " + err.message);
        }
    };

    // ── Cambiar Estado (Iniciar, Finalizar o Anular) ────────────────
    window.osCambiarEstado = async function (id, nuevoEstado, codigoOrden = '') {
        if (nuevoEstado === 'INICIADO') {
            // Abrir modal estilizado con diseño IDÉNTICO al de Iniciar Viaje (Diseño B)
            var lblCodigo = document.getElementById('os-iniciar-modal-codigo');
            var inputId = document.getElementById('os-iniciar-id');
            var inputFecha = document.getElementById('os-iniciar-fecha');
            var checkConfirm = document.getElementById('os-iniciar-check-confirm');

            if (lblCodigo) lblCodigo.textContent = codigoOrden || String(id);
            if (inputId) inputId.value = id;
            if (checkConfirm) checkConfirm.checked = false;

            if (inputFecha) {
                var today = new Date();
                var y = today.getFullYear();
                var m = String(today.getMonth() + 1).padStart(2, '0');
                var d = String(today.getDate()).padStart(2, '0');
                inputFecha.value = `${y}-${m}-${d}`;
            }

            var modalEl = document.getElementById('modalIniciarServicioConfirm');
            if (modalEl && typeof bootstrap !== 'undefined') {
                var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                modal.show();
            }
            return;
        }

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

    // ── Ejecutar Inicio de Servicio Confirmado desde el Modal Estilizado ─
    window.osEjecutarIniciarServicioConfirmado = async function (e) {
        if (e && e.preventDefault) e.preventDefault();

        var id = (document.getElementById('os-iniciar-id') || {}).value;
        var fechaInicio = (document.getElementById('os-iniciar-fecha') || {}).value;
        var checkConfirm = document.getElementById('os-iniciar-check-confirm');

        if (!id) return;

        if (!checkConfirm || !checkConfirm.checked) {
            alert('Debe confirmar que desea realizar esta operación.');
            return;
        }

        var btnSubmit = document.getElementById('btnEjecutarIniciarServicio');
        if (btnSubmit) btnSubmit.disabled = true;

        try {
            const resp = await fetch(`/api/operaciones/ordenes-servicio/${id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    estado_servicio: 'INICIADO',
                    fecha_inicio: fechaInicio
                })
            });
            const res = await resp.json();

            if (res.ok) {
                var modalEl = document.getElementById('modalIniciarServicioConfirm');
                if (modalEl && typeof bootstrap !== 'undefined') {
                    var modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }
                window.osCargarTabla();

                // Si viene información de cochera, abrir de inmediato el formulario express de Caja
                if (res.cochera && window.osAbrirModalCocheraExpress) {
                    setTimeout(() => {
                        window.osAbrirModalCocheraExpress(res.cochera);
                    }, 350);
                }
            } else {
                alert("Error al iniciar servicio: " + (res.error || ''));
            }
        } catch (err) {
            alert("Error al conectar con el servidor: " + err.message);
        } finally {
            if (btnSubmit) btnSubmit.disabled = false;
        }
    };

    // =========================================================================
    // 🔍 SELECTOR DE GRES SIN ASIGNAR (Modal Secundario - Imagen 4)
    // =========================================================================

    window.osAbrirSelectorGre = async function () {
        const modalEl = document.getElementById('modalOsSelectorGre');
        if (modalEl && modalEl.parentElement !== document.body) {
            document.body.appendChild(modalEl);
        }
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        setTimeout(() => {
            const backdrops = document.querySelectorAll('.modal-backdrop');
            if (backdrops.length > 1) {
                backdrops[backdrops.length - 1].style.zIndex = '1080';
            }
        }, 50);
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
        disponibles.forEach((g, idx) => {
            const fCarga = g.fecha_traslado || g.fecha_emision || '—';
            const fEntrega = g.fecha_traslado || '—';
            const jsonDoc = encodeURIComponent(JSON.stringify(g));

            html += `
                <tr>
                    <td class="text-center">
                        <input type="checkbox" class="form-check-input os-gre-row-check" data-json="${jsonDoc}" onchange="window.osActualizarContadorGresSeleccionadas()">
                    </td>
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
        window.osActualizarContadorGresSeleccionadas();
    }

    window.osToggleSeleccionarTodasGres = function(checked) {
        document.querySelectorAll('.os-gre-row-check').forEach(chk => {
            chk.checked = checked;
        });
        window.osActualizarContadorGresSeleccionadas();
    };

    window.osActualizarContadorGresSeleccionadas = function() {
        const checks = document.querySelectorAll('.os-gre-row-check:checked');
        const counter = document.getElementById('os-gre-seleccionados-counter');
        if (counter) {
            counter.textContent = `${checks.length} guía(s) seleccionada(s)`;
        }
    };

    window.osAnexarGresSeleccionadasMultiples = function() {
        const checks = document.querySelectorAll('.os-gre-row-check:checked');
        if (checks.length === 0) {
            alert('Por favor seleccione al menos una guía con las casillas.');
            return;
        }

        let agregadas = 0;
        checks.forEach(chk => {
            const rawJson = chk.getAttribute('data-json');
            if (rawJson) {
                try {
                    const g = JSON.parse(decodeURIComponent(rawJson));
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
                    agregadas++;
                } catch (_) {}
            }
        });

        renderizarDocsAdjuntos();

        // Cerrar modal selector
        const modalEl = document.getElementById('modalOsSelectorGre');
        if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
        document.body.classList.add('modal-open');
    };

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

    // =========================================================================
    // 🚗 CAJA POR COCHERA DEL CONDUCTOR (EXPRESS)
    // =========================================================================
    window._osBancosEmpresaCache = [];
    window._osCuentasConductorCache = [];

    window.osAbrirModalCocheraExpress = async function (datos) {
        if (!datos) return;
        const modalEl = document.getElementById('modalOsExpressCochera');
        if (!modalEl) return;

        // Resumen
        document.getElementById('os-cochera-resumen-os').textContent = datos.codigo_orden || '—';
        document.getElementById('os-cochera-resumen-ov').textContent = datos.viaje_asignado || 'Sin Asignar';
        document.getElementById('os-cochera-resumen-conductor').textContent = datos.conductor || 'CONDUCTOR';
        document.getElementById('os-cochera-resumen-placa').textContent = datos.placa_tracto || '—';

        // Inputs ocultos
        document.getElementById('os-cochera-input-os-id').value = datos.id || '';
        document.getElementById('os-cochera-input-viaje').value = datos.viaje_asignado || '';
        document.getElementById('os-cochera-input-placa').value = datos.placa_tracto || '';
        document.getElementById('os-cochera-input-conductor').value = datos.conductor || '';
        document.getElementById('os-cochera-input-ruta').value = datos.ruta || '';

        // Reset inputs editables
        document.getElementById('os-cochera-input-monto').value = '30.00';
        document.getElementById('os-cochera-input-modalidad').value = 'TRANSFERENCIA BANCARIA';
        document.getElementById('os-cochera-input-cuenta-conductor').value = '';

        // Cargar cuentas de empresa
        const selEmpresa = document.getElementById('os-cochera-input-cuenta-empresa');
        if (selEmpresa) {
            selEmpresa.innerHTML = '<option value="">Cargando cuentas...</option>';
            try {
                const resp = await fetch('/api/tesoreria/bancos');
                const res = await resp.json();
                if (res.ok && Array.isArray(res.data)) {
                    window._osBancosEmpresaCache = res.data.filter(b => b.estado === 'ACTIVO');
                    selEmpresa.innerHTML = '<option value="">-- Seleccionar cuenta de empresa --</option>';
                    window._osBancosEmpresaCache.forEach((b, idx) => {
                        const optText = `${b.banco} (${b.moneda || 'SOLES'} - ${b.tipo_cuenta || 'CTE'}): ${b.numero_cuenta}`;
                        const opt = new Option(optText, optText);
                        opt.dataset.banco = b.banco;
                        opt.dataset.moneda = b.moneda;
                        opt.dataset.numero = b.numero_cuenta;
                        // Preseleccionar BCP Soles por defecto o la primera
                        if (idx === 0 || (b.banco && b.banco.toUpperCase().includes('BCP') && (b.moneda === 'SOLES' || !b.moneda))) {
                            opt.selected = true;
                        }
                        selEmpresa.add(opt);
                    });
                } else {
                    selEmpresa.innerHTML = '<option value="">-- Sin cuentas registradas --</option>';
                }
            } catch(e) {
                selEmpresa.innerHTML = '<option value="">-- Error cargando cuentas --</option>';
            }
        }

        // Consultar cuentas del conductor desde el directorio de seguridad/personal
        const dlCuentas = document.getElementById('os-cochera-dl-cuentas-conductor');
        const inpCtaCond = document.getElementById('os-cochera-input-cuenta-conductor');
        if (dlCuentas) dlCuentas.innerHTML = '';
        window._osCuentasConductorCache = [];

        if (datos.conductor) {
            try {
                const rP = await fetch('/api/seguridad/recursos');
                const dP = await rP.json();
                if (dP && Array.isArray(dP.conductores)) {
                    const cMatch = dP.conductores.find(c => (c.nombre_completo || c.nombre || '').toLowerCase().includes(datos.conductor.toLowerCase()));
                    if (cMatch) {
                        const lista = [];
                        if (cMatch.numero_cuenta) lista.push(`${cMatch.banco || 'BANCO'}: ${cMatch.numero_cuenta}`);
                        if (cMatch.cci) lista.push(`CCI: ${cMatch.cci}`);
                        if (cMatch.telefono || cMatch.celular) lista.push(`YAPE / PLIN: ${cMatch.telefono || cMatch.celular}`);
                        window._osCuentasConductorCache = lista;
                        if (dlCuentas) {
                            dlCuentas.innerHTML = lista.map(cta => `<option value="${cta}">`).join('');
                        }
                    }
                }
            } catch(e) {}
        }

        // Sincronizar automáticamente la cuenta del conductor con el banco de la empresa seleccionado
        window.osAlCambiarCuentaEmpresaCochera(selEmpresa ? selEmpresa.value : '');

        // Mostrar el modal express
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    };

    window.osAlCambiarCuentaEmpresaCochera = function (valEmpresa) {
        const inpCtaCond = document.getElementById('os-cochera-input-cuenta-conductor');
        if (!inpCtaCond) return;

        const selEmpresa = document.getElementById('os-cochera-input-cuenta-empresa');
        let bancoEmpresa = '';
        if (selEmpresa && selEmpresa.selectedOptions && selEmpresa.selectedOptions[0]) {
            bancoEmpresa = (selEmpresa.selectedOptions[0].dataset.banco || '').toUpperCase();
        }

        // Si tenemos cuentas en caché del conductor, buscar coincidencia por banco
        if (window._osCuentasConductorCache && window._osCuentasConductorCache.length > 0) {
            let coincidente = window._osCuentasConductorCache.find(c => bancoEmpresa && c.toUpperCase().includes(bancoEmpresa));
            if (!coincidente) {
                coincidente = window._osCuentasConductorCache[0];
            }
            if (coincidente && !inpCtaCond.value) {
                inpCtaCond.value = coincidente;
            }
        }
    };

    window.osGuardarCajaCocheraExpress = async function (e) {
        if (e && e.preventDefault) e.preventDefault();

        const monto = parseFloat(document.getElementById('os-cochera-input-monto')?.value) || 0;
        if (monto <= 0) {
            alert('Por favor ingrese un monto válido para la cochera.');
            return;
        }

        const btn = document.getElementById('os-cochera-btn-guardar');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Registrando...';
        }

        const viaje = document.getElementById('os-cochera-input-viaje')?.value || '';
        const placa = document.getElementById('os-cochera-input-placa')?.value || '';
        const conductor = document.getElementById('os-cochera-input-conductor')?.value || '';
        const ruta = document.getElementById('os-cochera-input-ruta')?.value || '';
        const ctaEmpresa = document.getElementById('os-cochera-input-cuenta-empresa')?.value || '';
        const ctaConductor = document.getElementById('os-cochera-input-cuenta-conductor')?.value || '';
        const modalidad = document.getElementById('os-cochera-input-modalidad')?.value || 'TRANSFERENCIA BANCARIA';

        // Obtener correlativo de caja
        let serieCaja = String(new Date().getFullYear());
        let numeroCaja = '00000001';
        try {
            const rCorr = await fetch('/api/tesoreria/caja/correlativo');
            const dCorr = await rCorr.json();
            if (dCorr.ok) {
                serieCaja = dCorr.serie;
                numeroCaja = dCorr.numero;
            }
        } catch(e) {}

        const hoy = new Date();
        const ymd = hoy.toISOString().slice(0, 10);
        const hhmmss = hoy.toTimeString().slice(0, 8);

        const formData = new FormData();
        formData.append('fecha', ymd);
        formData.append('hora', hhmmss);
        formData.append('serie', serieCaja);
        formData.append('numero', numeroCaja);
        formData.append('orden_viaje', viaje);
        formData.append('conductor', conductor);
        formData.append('ruta_viaje', ruta);
        formData.append('placa', placa);
        formData.append('autoriza', 'Marco Rosas');
        formData.append('motivo', 'Gastos de Viaje y Ruta');
        formData.append('sub_motivo', 'Cochera / Parqueo de ruta');
        formData.append('centro_costo', 'CC-300: Operaciones de Ruta (Costo Servicio)');
        formData.append('modalidad_pago', modalidad);
        formData.append('moneda', 'SOLES');
        formData.append('tipo_cambio', '1.000');
        formData.append('tipo_persona', 'CONDUCTOR');
        formData.append('persona', conductor);
        formData.append('importe_total', monto);
        formData.append('descripcion', 'Cochera de Conductor por Orden de Servicio');
        formData.append('tipo_comprobante', 'SIN COMPROBANTE');
        formData.append('cuenta_bancaria_persona', ctaConductor);
        formData.append('cuenta_bancaria_empresa', ctaEmpresa);
        formData.append('observacion', `Generado automáticamente desde Operaciones para el viaje ${viaje}`);
        formData.append('no_aplica_liquidacion', 0);
        const usuarioActualReg = localStorage.getItem('fleet_nombre_usuario') || localStorage.getItem('fleet_user') || (typeof usuarioLogueado !== 'undefined' && usuarioLogueado) || 'Sthefano Avila';
        formData.append('usuario_creacion', usuarioActualReg);

        try {
            const resp = await fetch('/api/tesoreria/caja', {
                method: 'POST',
                body: formData
            });
            const res = await resp.json();
            if (res.ok) {
                const modalEl = document.getElementById('modalOsExpressCochera');
                if (modalEl) {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: '¡Caja Generada!',
                        text: `Se registró la caja Nº ${serieCaja}-${numeroCaja} por concepto de Cochera (S/ ${monto.toFixed(2)}).`,
                        timer: 2500,
                        showConfirmButton: false
                    });
                } else {
                    alert(`¡Caja de Cochera Nº ${serieCaja}-${numeroCaja} registrada exitosamente!`);
                }
            } else {
                alert('Error al generar la caja de cochera: ' + (res.error || 'No se pudo procesar'));
            }
        } catch(err) {
            console.error('Error al enviar caja express:', err);
            alert('Error de conexión: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check2-circle"></i> Generar Caja';
            }
        }
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

