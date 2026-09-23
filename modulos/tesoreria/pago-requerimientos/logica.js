/**
 * ====================================================================
 * 💳 MÓDULO TESORERÍA: PAGO DE REQUERIMIENTOS (LÓGICA SPA)
 * Gestión y procesamiento de Órdenes de Compra Aprobadas por Gerencia
 * ====================================================================
 */

(function () {
    let prDataCache = [];
    let prFiltroEstado = 'Aprobado'; // 'Aprobado' (Por Pagar), 'Procesado' (Pagados), 'TODOS'
    let prFiltroMoneda = 'TODAS';   // 'TODAS', 'PEN', 'USD'

    // Inicializador del módulo
    window.inicializarModuloPagoRequerimientos = function () {
        console.log("💳 [Pago de Requerimientos] Módulo inicializado.");
        configurarEventosPagoReq();
        window.cargarPagoRequerimientos(true);
    };

    // Alias estándar de carga modular
    window.init_pago_requerimientos = window.inicializarModuloPagoRequerimientos;
    window.init_tesoreria_pago_requerimientos = window.inicializarModuloPagoRequerimientos;

    /**
     * Configuración de eventos de UI y listeners
     */
    function configurarEventosPagoReq() {
        const inputBusqueda = document.getElementById('busquedaPagoReq');
        if (inputBusqueda) {
            inputBusqueda.addEventListener('input', () => {
                filtrarTablaPagoReq();
            });
        }
    }

    /**
     * Cargar listado de órdenes de compra desde el backend
     */
    window.cargarPagoRequerimientos = async function (forzar = false) {
        const tbody = document.getElementById('tbodyPagoReq');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    <span class="fw-semibold">Cargando órdenes de compra para tesorería...</span>
                </td>
            </tr>
        `;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/tesoreria/pago-requerimientos', {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'Content-Type': 'application/json'
                }
            });

            if (!res.ok) {
                throw new Error(`Error ${res.status}: ${res.statusText}`);
            }

            const resJson = await res.json();
            const data = Array.isArray(resJson) ? resJson : (resJson.data || []);
            prDataCache = Array.isArray(data) ? data : [];

            calcularKPIsPagoReq(prDataCache);
            filtrarTablaPagoReq();

        } catch (err) {
            console.error("❌ Error al cargar pago de requerimientos:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle-fill me-1"></i>
                        Error al cargar datos: ${err.message}. 
                        <button class="btn btn-sm btn-outline-danger ms-2" onclick="window.cargarPagoRequerimientos(true)">Reintentar</button>
                    </td>
                </tr>
            `;
        }
    };

    /**
     * Calcular métricas Bento de cabecera
     */
    function calcularKPIsPagoReq(items) {
        let porPagarCount = 0;
        let totalSoles = 0;
        let totalDolares = 0;
        let pagadosCount = 0;

        items.forEach(oc => {
            const estado = (oc.estado || '').toUpperCase();
            const esPendiente = estado === 'APROBADO' || estado === 'AUTORIZADO';
            const esPagado = estado === 'PROCESADO' || estado === 'PAGADO';
            const importe = parseFloat(oc.monto_total || oc.importe_total || 0) || 0;
            const moneda = (oc.moneda || 'SOLES').toUpperCase();

            if (esPendiente) {
                porPagarCount++;
                if (moneda.includes('DOL') || moneda === 'USD' || moneda === 'US$') {
                    totalDolares += importe;
                } else {
                    totalSoles += importe;
                }
            } else if (esPagado) {
                pagadosCount++;
            }
        });

        const elPorPagar = document.getElementById('kpi-por-pagar');
        const elSoles = document.getElementById('kpi-soles');
        const elDolares = document.getElementById('kpi-dolares');
        const elPagados = document.getElementById('kpi-pagados');

        if (elPorPagar) elPorPagar.textContent = porPagarCount;
        if (elSoles) elSoles.textContent = `S/ ${totalSoles.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (elDolares) elDolares.textContent = `US$ ${totalDolares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (elPagados) elPagados.textContent = pagadosCount;
    }

    /**
     * Cambio de filtro de estado (Segmented buttons)
     */
    window.setFiltroEstado = function (estado, btn) {
        prFiltroEstado = estado;
        document.querySelectorAll('#filtro-estado-group .pr-segment-item').forEach(el => el.classList.remove('active'));
        if (btn) btn.classList.add('active');
        filtrarTablaPagoReq();
    };

    /**
     * Cambio de filtro de moneda
     */
    window.setFiltroMoneda = function (moneda, btn) {
        prFiltroMoneda = moneda;
        document.querySelectorAll('#filtro-moneda-group .pr-segment-item').forEach(el => el.classList.remove('active'));
        if (btn) btn.classList.add('active');
        filtrarTablaPagoReq();
    };

    /**
     * Filtro rápido al hacer clic en KPI card
     */
    window.filtrarPorKPI = function (tipo) {
        if (tipo === 'por-pagar' || tipo === 'soles' || tipo === 'dolares') {
            const btnPend = document.getElementById('filtro-estado-pendientes');
            window.setFiltroEstado('Aprobado', btnPend);
            if (tipo === 'soles') {
                const btnPEN = document.getElementById('filtro-moneda-pen');
                window.setFiltroMoneda('PEN', btnPEN);
            } else if (tipo === 'dolares') {
                const btnUSD = document.getElementById('filtro-moneda-usd');
                window.setFiltroMoneda('USD', btnUSD);
            }
        } else if (tipo === 'pagados') {
            const btnProc = document.getElementById('filtro-estado-procesados');
            window.setFiltroEstado('Procesado', btnProc);
        }
    };

    /**
     * Filtrar y renderizar la tabla principal
     */
    function filtrarTablaPagoReq() {
        const tbody = document.getElementById('tbodyPagoReq');
        const emptyState = document.getElementById('pr-empty-state');
        if (!tbody) return;

        const txtBusqueda = (document.getElementById('busquedaPagoReq')?.value || '').toLowerCase().trim();

        const filtrados = prDataCache.filter(item => {
            const estado = (item.estado || '').toUpperCase();
            const esPendiente = estado === 'APROBADO' || estado === 'AUTORIZADO';
            const esPagado = estado === 'PROCESADO' || estado === 'PAGADO';

            // 1. Filtro de Estado
            if (prFiltroEstado === 'Aprobado' && !esPendiente) return false;
            if (prFiltroEstado === 'Procesado' && !esPagado) return false;

            // 2. Filtro de Moneda
            const moneda = (item.moneda || 'SOLES').toUpperCase();
            const isUSD = moneda.includes('DOL') || moneda === 'USD' || moneda === 'US$';
            if (prFiltroMoneda === 'PEN' && isUSD) return false;
            if (prFiltroMoneda === 'USD' && !isUSD) return false;

            // 3. Filtro de Búsqueda de Texto
            if (txtBusqueda) {
                const searchCorpus = [
                    item.id,
                    item.codigo_oc || `OC-${item.id}`,
                    item.centro_costo || '',
                    item.sub_motivo || '',
                    item.motivo || '',
                    item.solicitante || '',
                    item.creado_por_nombre || item.creado_por || '',
                    item.aprobado_por_nombre || item.aprobado_por || '',
                    item.proveedor_nombre || item.proveedor || '',
                    item.proveedor_ruc || '',
                    item.cuenta_bancaria || '',
                    item.numero_operacion || ''
                ].join(' ').toLowerCase();

                if (!searchCorpus.includes(txtBusqueda)) return false;
            }

            return true;
        });

        const contador = document.getElementById('pr-contador-registros');
        if (contador) {
            contador.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'registro' : 'registros'}`;
        }

        if (filtrados.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        tbody.innerHTML = filtrados.map(item => renderFilaPagoReq(item)).join('');
    }

    /**
     * Renderizar fila individual con las 13 columnas exactas
     */
    function renderFilaPagoReq(item) {
        const estado = (item.estado || '').toUpperCase();
        const esPendiente = estado === 'APROBADO' || estado === 'AUTORIZADO';
        const esPagado = estado === 'PROCESADO' || estado === 'PAGADO';

        // 1. Monto y Moneda
        const monedaRaw = (item.moneda || 'SOLES').toUpperCase();
        const esUSD = monedaRaw.includes('DOL') || monedaRaw === 'USD' || monedaRaw === 'US$';
        const simboloMoneda = esUSD ? 'US$' : 'S/';
        const importeNum = parseFloat(item.monto_total || item.importe_total || 0) || 0;
        const importeFormateado = importeNum.toLocaleString(esUSD ? 'en-US' : 'es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // 2. Cálculo de Días Restantes / Semáforo
        const diasBadge = calcularBadgeDiasRestantes(item.fecha, item.dias_credito || item.dias_pago || 0, esPagado);

        // 3. Botón de Acción
        let colAccion = '';
        if (esPendiente) {
            colAccion = `
                <button type="button" class="btn btn-proceder-req shadow-sm" onclick="window.abrirModalProcederPago(${item.id})">
                    <i class="bi bi-play-circle-fill"></i> PROCEDER
                </button>
            `;
        } else {
            colAccion = `
                <div class="d-flex align-items-center gap-1.5">
                    <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1 rounded-pill fw-bold" style="font-size:0.72rem;">
                        <i class="bi bi-check2-all me-0.5"></i> PROCESADO
                    </span>
                    ${item.voucher_url ? `
                        <a href="${item.voucher_url}" target="_blank" class="btn btn-sm btn-outline-secondary p-1 rounded-circle" title="Ver Voucher" style="width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center;">
                            <i class="bi bi-image" style="font-size:0.75rem;"></i>
                        </a>
                    ` : ''}
                </div>
            `;
        }

        // 4. Folio OC y link a detalle
        const folioOC = item.codigo_oc || (item.id ? `2026-${String(item.id).padStart(8, '0')}` : '-');
        const motivoOC = item.motivo || `ORDEN DE COMPRA: ${folioOC}`;

        // 5. Cuentas bancarias formateadas
        const cuentaBancaria = item.cuenta_bancaria || item.cuenta_bancaria_proveedor || 'No especificada';

        // 6. Fechas
        const fechaReg = item.fecha ? String(item.fecha).substring(0, 10) : '-';
        const fechaAprob = item.fecha_aprobacion ? formatearFechaHora(item.fecha_aprobacion) : '-';

        return `
            <tr>
                <!-- 1. Acción -->
                <td class="text-center">${colAccion}</td>
                
                <!-- 2. Moneda + Monto -->
                <td>
                    <span class="badge ${esUSD ? 'bg-primary bg-opacity-10 text-primary' : 'bg-success bg-opacity-10 text-success'} fw-bold me-1" style="font-size:0.72rem;">
                        ${simboloMoneda}
                    </span>
                    <span class="fw-bolder text-dark" style="font-size:0.82rem;">${importeFormateado}</span>
                </td>

                <!-- 3. Solicitante -->
                <td>
                    <span class="fw-bold text-dark text-uppercase" style="font-size:0.78rem;">${escapeHtml(item.solicitante || 'NO ESPECIFICADO')}</span>
                </td>

                <!-- 4. Centro de Costo -->
                <td>
                    <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2 py-0.5 fw-bold" style="font-size:0.72rem;">
                        ${escapeHtml(item.centro_costo || 'CC-100')}
                    </span>
                </td>

                <!-- 5. Motivo -->
                <td>
                    <span class="text-secondary fw-semibold text-truncate d-inline-block" style="max-width: 170px; font-size:0.78rem;" title="${escapeHtml(motivoOC)}">
                        ${escapeHtml(motivoOC)}
                    </span>
                </td>

                <!-- 6. Folio OC -->
                <td>
                    <button type="button" class="btn btn-sm p-0 text-primary fw-bold text-decoration-underline" onclick="window.verDetalleOC(${item.id})" style="font-size:0.78rem;">
                        <i class="bi bi-file-earmark-text me-0.5"></i>${escapeHtml(folioOC)}
                    </button>
                </td>

                <!-- 6. Usuario Creación -->
                <td>
                    <span class="text-muted fw-semibold text-uppercase" style="font-size:0.75rem;">
                        ${escapeHtml(item.creado_por_nombre || item.creado_por || '-')}
                    </span>
                </td>

                <!-- 7. Fecha Registro -->
                <td>
                    <span class="text-secondary fw-semibold" style="font-size:0.75rem;">${fechaReg}</span>
                </td>

                <!-- 8. Días Restantes -->
                <td class="text-center">${diasBadge}</td>

                <!-- 9. Usuario Aprobación -->
                <td>
                    <span class="text-dark fw-bold text-uppercase" style="font-size:0.75rem;">
                        ${escapeHtml(item.aprobado_por_nombre || item.aprobado_por || '-')}
                    </span>
                </td>

                <!-- 10. Fecha Aprobación -->
                <td>
                    <span class="text-muted small" style="font-size:0.72rem;">${fechaAprob}</span>
                </td>

                <!-- 11. Proveedor -->
                <td>
                    <span class="fw-bold text-dark text-truncate d-inline-block" style="max-width: 180px; font-size:0.78rem;" title="${escapeHtml(item.proveedor_nombre || item.proveedor || '-')}">
                        ${escapeHtml(item.proveedor_nombre || item.proveedor || '-')}
                    </span>
                </td>

                <!-- 12. Cuenta Bancaria -->
                <td>
                    <span class="text-secondary small fw-semibold text-truncate d-inline-block" style="max-width: 220px; font-size:0.73rem;" title="${escapeHtml(cuentaBancaria)}">
                        ${escapeHtml(cuentaBancaria)}
                    </span>
                </td>
            </tr>
        `;
    }

    /**
     * Calcular badge de días restantes / antigüedad
     */
    function calcularBadgeDiasRestantes(fechaStr, diasCredito = 0, esPagado = false) {
        if (esPagado) {
            return `<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 px-2 py-1 rounded-pill" style="font-size:0.7rem;">Liquidado</span>`;
        }

        if (!fechaStr) {
            return `<span class="text-muted small">-</span>`;
        }

        try {
            const fechaEmision = new Date(fechaStr);
            const fechaVenc = new Date(fechaEmision);
            fechaVenc.setDate(fechaVenc.getDate() + (parseInt(diasCredito) || 0));

            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            fechaVenc.setHours(0, 0, 0, 0);

            const diffTime = fechaVenc.getTime() - hoy.getTime();
            const diffDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDias < 0) {
                return `<span class="badge bg-danger text-white px-2 py-1 rounded-pill fw-bold" style="font-size:0.7rem; letter-spacing:0.3px;">Hace ${Math.abs(diffDias)} días</span>`;
            } else if (diffDias === 0) {
                return `<span class="badge bg-warning text-dark px-2 py-1 rounded-pill fw-bold" style="font-size:0.7rem;">Vence Hoy</span>`;
            } else if (diffDias <= 3) {
                return `<span class="badge bg-warning bg-opacity-25 text-dark border border-warning px-2 py-1 rounded-pill fw-bold" style="font-size:0.7rem;">Faltan ${diffDias} días</span>`;
            } else {
                return `<span class="badge bg-success bg-opacity-15 text-success border border-success border-opacity-25 px-2 py-1 rounded-pill fw-bold" style="font-size:0.7rem;">Faltan ${diffDias} días</span>`;
            }
        } catch (e) {
            return `<span class="text-muted small">-</span>`;
        }
    }

    /**
     * Abrir modal para Proceder con el Requerimiento
     */
    window.abrirModalProcederPago = function (id) {
        const item = prDataCache.find(x => x.id === id || String(x.id) === String(id));
        if (!item) {
            alert("No se encontró la orden de compra seleccionada.");
            return;
        }

        // Llenar campos del modal
        const folioOC = item.codigo_oc || (item.id ? `2026-${String(item.id).padStart(8, '0')}` : '-');
        const monedaRaw = (item.moneda || 'SOLES').toUpperCase();
        const esUSD = monedaRaw.includes('DOL') || monedaRaw === 'USD' || monedaRaw === 'US$';
        const simbolo = esUSD ? 'US$' : 'S/';
        const importeNum = parseFloat(item.monto_total || item.importe_total || 0) || 0;
        const importeFormateado = importeNum.toLocaleString(esUSD ? 'en-US' : 'es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        document.getElementById('pago_oc_id').value = item.id;
        document.getElementById('pago_oc_moneda').value = esUSD ? 'USD' : 'PEN';
        document.getElementById('pago_oc_importe').value = importeNum;

        document.getElementById('pago_txt_oc').value = folioOC;
        document.getElementById('pago_txt_solicitante').value = item.solicitante || 'NO ESPECIFICADO';
        document.getElementById('pago_txt_proveedor').value = item.proveedor_nombre || item.proveedor || '-';
        document.getElementById('pago_num_constancia').value = '';
        document.getElementById('pago_txt_cuenta_destino').value = item.cuenta_bancaria || item.cuenta_bancaria_proveedor || 'No especificada';
        document.getElementById('pago_select_cuenta_origen').value = esUSD ? 'BCP - CTA CTE DOLARES' : 'BCP - CTA CTE SOLES';
        document.getElementById('pago_txt_descripcion').value = item.motivo || `ORDEN DE COMPRA: ${folioOC}`;
        document.getElementById('pago_badge_importe').textContent = `${simbolo} ${importeFormateado}`;

        // Reset confirmación y archivo
        document.getElementById('chkConfirmarProceder').checked = true;
        window.quitarPagoVoucher();

        // Mostrar Modal Bootstrap
        const modalEl = document.getElementById('modalProcederPagoReq');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    };

    /**
     * Manejar preview de imagen del voucher
     */
    window.handlePagoVoucherPreview = function (input) {
        if (!input || !input.files || !input.files[0]) return;
        const file = input.files[0];
        const previewBox = document.getElementById('pago_voucher_preview_box');
        const previewImg = document.getElementById('pago_voucher_preview_img');
        const previewName = document.getElementById('pago_voucher_preview_name');

        if (previewName) previewName.textContent = file.name;

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (e) {
                if (previewImg) previewImg.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            // PDF icon placeholder
            if (previewImg) previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23dc3545" class="bi bi-file-earmark-pdf" viewBox="0 0 16 16"><path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/></svg>';
        }

        if (previewBox) previewBox.style.display = 'flex';
    };

    /**
     * Quitar voucher seleccionado
     */
    window.quitarPagoVoucher = function () {
        const fileInput = document.getElementById('pago_file_voucher');
        if (fileInput) fileInput.value = '';
        const previewBox = document.getElementById('pago_voucher_preview_box');
        if (previewBox) previewBox.style.display = 'none';
    };

    /**
     * Ejecutar el envío de pago (Procesar Requerimiento)
     */
    window.ejecutarProcesarPago = async function () {
        const ocId = document.getElementById('pago_oc_id')?.value;
        const numConstancia = document.getElementById('pago_num_constancia')?.value?.trim();
        const cuentaOrigen = document.getElementById('pago_select_cuenta_origen')?.value;
        const chkConfirm = document.getElementById('chkConfirmarProceder')?.checked;

        if (!ocId) {
            alert("Error: Identificador de orden de compra no válido.");
            return;
        }

        if (!numConstancia) {
            alert("Por favor, ingrese el Número de Constancia de Depósito / Operación.");
            document.getElementById('pago_num_constancia')?.focus();
            return;
        }

        if (!cuentaOrigen) {
            alert("Por favor, seleccione la Cuenta de Origen de la empresa.");
            document.getElementById('pago_select_cuenta_origen')?.focus();
            return;
        }

        if (!chkConfirm) {
            alert("Debe marcar la casilla de confirmación para proceder con el requerimiento.");
            return;
        }

        const btnSubmit = document.getElementById('btnEjecutarPagoSubmit');
        const originalBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<div class="spinner-border spinner-border-sm me-1" role="status"></div> Procesando...`;
        }

        try {
            const formData = new FormData();
            formData.append('numero_operacion', numConstancia);
            formData.append('cuenta_origen', cuentaOrigen);
            
            const fileInput = document.getElementById('pago_file_voucher');
            if (fileInput && fileInput.files && fileInput.files[0]) {
                formData.append('voucher', fileInput.files[0]);
            }

            const token = localStorage.getItem('token');
            const res = await fetch(`/api/tesoreria/pago-requerimientos/${ocId}/procesar`, {
                method: 'POST',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: formData
            });

            const resData = await res.json();

            if (!res.ok || !resData.success) {
                throw new Error(resData.error || resData.message || `Error del servidor (${res.status})`);
            }

            // Cerrar modal
            const modalEl = document.getElementById('modalProcederPagoReq');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            // Notificación exitosa
            if (window.Swal) {
                Swal.fire({
                    icon: 'success',
                    title: '¡Requerimiento Procesado!',
                    text: `La Orden de Compra pasó al estado Procesado y se registró en Tesorería.`,
                    timer: 2500,
                    showConfirmButton: false,
                    borderRadius: '16px'
                });
            } else {
                alert("¡Pago procesado con éxito! El estado de la orden pasó a Procesado.");
            }

            // Recargar datos
            await window.cargarPagoRequerimientos(true);

        } catch (err) {
            console.error("❌ Error al procesar pago:", err);
            alert(`No se pudo procesar el requerimiento: ${err.message}`);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = originalBtnHtml;
            }
        }
    };

    /**
     * Ver Detalle de Ítems de la Orden de Compra
     */
    window.verDetalleOC = function (id) {
        const item = prDataCache.find(x => x.id === id || String(x.id) === String(id));
        if (!item) return;

        const folioOC = item.codigo_oc || (item.id ? `2026-${String(item.id).padStart(8, '0')}` : '-');
        const lblFolio = document.getElementById('lblDetalleOCFolio');
        const lblProv = document.getElementById('lblDetalleOCProveedor');
        const tbody = document.getElementById('tbodyDetalleOCItems');

        if (lblFolio) lblFolio.textContent = `Orden de Compra: ${folioOC}`;
        if (lblProv) lblProv.textContent = `Proveedor: ${item.proveedor_nombre || item.proveedor || '-'} | Solicitante: ${item.solicitante || '-'}`;

        if (tbody) {
            const items = Array.isArray(item.items) ? item.items : [];
            if (items.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center py-3 text-muted">
                            ${item.motivo ? escapeHtml(item.motivo) : 'Sin desglose de ítems disponible.'}
                        </td>
                    </tr>
                `;
            } else {
                const monedaRaw = (item.moneda || 'SOLES').toUpperCase();
                const esUSD = monedaRaw.includes('DOL') || monedaRaw === 'USD' || monedaRaw === 'US$';
                const simbolo = esUSD ? 'US$' : 'S/';

                tbody.innerHTML = items.map((it, idx) => {
                    const cant = parseFloat(it.cantidad || 0);
                    const precio = parseFloat(it.precio_unitario || it.costo_unitario || 0);
                    const subtotal = parseFloat(it.subtotal || it.importe || (cant * precio));

                    return `
                        <tr>
                            <td class="ps-3 text-muted fw-bold">${idx + 1}</td>
                            <td class="fw-semibold text-dark">${escapeHtml(it.descripcion || it.nombre_producto || it.item || 'Ítem')}</td>
                            <td class="text-center fw-bold">${cant}</td>
                            <td class="text-end text-muted">${simbolo} ${precio.toFixed(2)}</td>
                            <td class="text-end pe-3 fw-bold text-dark">${simbolo} ${subtotal.toFixed(2)}</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        const modalEl = document.getElementById('modalDetalleOCPagoReq');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    };

    /**
     * Exportar listado actual a Excel / CSV
     */
    window.exportarExcelPagoRequerimientos = function () {
        if (!prDataCache || prDataCache.length === 0) {
            alert("No hay registros para exportar.");
            return;
        }

        try {
            const filasExportar = prDataCache.map((item, idx) => {
                const estado = (item.estado || '').toUpperCase();
                const folioOC = item.codigo_oc || (item.id ? `2026-${String(item.id).padStart(8, '0')}` : '-');
                const moneda = (item.moneda || 'SOLES').toUpperCase().includes('DOL') ? 'USD' : 'PEN';
                const monto = parseFloat(item.monto_total || item.importe_total || 0) || 0;

                return {
                    'N°': idx + 1,
                    'ESTADO': estado,
                    'MONEDA': moneda,
                    'MONTO': monto,
                    'SOLICITANTE': item.solicitante || '',
                    'MOTIVO': item.motivo || '',
                    'ORDEN DE COMPRA': folioOC,
                    'USUARIO CREACIÓN': item.creado_por_nombre || item.creado_por || '',
                    'FECHA REGISTRO': item.fecha ? String(item.fecha).substring(0, 10) : '',
                    'USUARIO APROBACIÓN': item.aprobado_por_nombre || item.aprobado_por || '',
                    'FECHA APROBACIÓN': item.fecha_aprobacion ? formatearFechaHora(item.fecha_aprobacion) : '',
                    'PROVEEDOR': item.proveedor_nombre || item.proveedor || '',
                    'RUC': item.proveedor_ruc || '',
                    'CUENTA DESTINO': item.cuenta_bancaria || '',
                    'N° OPERACIÓN / CONSTANCIA': item.numero_operacion || ''
                };
            });

            if (window.XLSX) {
                const ws = XLSX.utils.json_to_sheet(filasExportar);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Pago_Requerimientos");
                XLSX.writeFile(wb, `Pago_Requerimientos_Tesoreria_${new Date().toISOString().substring(0, 10)}.xlsx`);
            } else {
                // Descarga CSV fallback
                const headers = Object.keys(filasExportar[0]).join(';');
                const rows = filasExportar.map(r => Object.values(r).map(val => `"${String(val).replace(/"/g, '""')}"`).join(';')).join('\n');
                const csvContent = "\uFEFF" + headers + "\n" + rows;
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.setAttribute("download", `Pago_Requerimientos_Tesoreria_${new Date().toISOString().substring(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (err) {
            console.error("❌ Error al exportar Excel:", err);
            alert("No se pudo exportar el archivo Excel.");
        }
    };

    /**
     * Funciones utilitarias
     */
    function formatearFechaHora(dStr) {
        if (!dStr) return '-';
        try {
            const d = new Date(dStr);
            if (isNaN(d.getTime())) return dStr;
            const dia = String(d.getDate()).padStart(2, '0');
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            const anio = d.getFullYear();
            const hora = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            return `${dia}/${mes}/${anio} ${hora}:${min}`;
        } catch (e) {
            return dStr;
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

})();
