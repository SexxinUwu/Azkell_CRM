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
            const importe = parseFloat(oc.importe || oc.total_pen || oc.monto_total || oc.importe_total || 0) || 0;
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
     * Renderizar fila individual con las 14 columnas completas
     */
    function renderFilaPagoReq(item) {
        const estado = (item.estado || '').toUpperCase();
        const esPendiente = estado === 'APROBADO' || estado === 'AUTORIZADO';
        const esPagado = estado === 'PROCESADO' || estado === 'PAGADO';

        // 1. Monto y Moneda
        const monedaRaw = (item.moneda || 'SOLES').toUpperCase();
        const esUSD = monedaRaw.includes('DOL') || monedaRaw === 'USD' || monedaRaw === 'US$';
        const simboloMoneda = esUSD ? 'US$' : 'S/';
        const importeNum = parseFloat(item.importe || item.total_pen || item.monto_total || item.importe_total || 0) || 0;
        const importeFormateado = importeNum.toLocaleString(esUSD ? 'en-US' : 'es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // 2. Cálculo de Días Restantes / Semáforo
        const diasBadge = calcularBadgeDiasRestantes(item.fecha, item.dias_credito || item.dias_pagar || 0, item.condicion_pago, esPagado);

        // 3. Botón de Acción
        let colAccion = '';
        if (esPendiente) {
            colAccion = `
                <button type="button" class="btn btn-proceder-req shadow-sm" onclick="window.abrirModalProcederPago('${escapeHtml(String(item.id))}')">
                    <i class="bi bi-play-circle-fill"></i> PROCEDER
                </button>
            `;
        } else {
            colAccion = `
                <div class="d-flex align-items-center gap-1.5">
                    <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1 rounded-pill fw-bold" style="font-size:0.72rem;">
                        <i class="bi bi-check2-all me-0.5"></i> PROCESADO
                    </span>
                    ${item.url_voucher_presigned || item.url_voucher || item.voucher_url ? `
                        <a href="${item.url_voucher_presigned || item.url_voucher || item.voucher_url}" target="_blank" class="btn btn-sm btn-outline-secondary p-1 rounded-circle" title="Ver Voucher" style="width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center;">
                            <i class="bi bi-image" style="font-size:0.75rem;"></i>
                        </a>
                    ` : ''}
                </div>
            `;
        }

        // 4. Folio OC y link a detalle
        const folioOC = item.folio || item.codigo_oc || item.id || '-';
        const codLimpio = String(folioOC).replace(/^ENT-/i, '');
        const motivoOC = item.motivo_entrada || item.motivo || `ORDEN DE COMPRA: ${folioOC}`;

        // 5. Cuentas bancarias formateadas con monedas
        const cuentaDestino = item.cuenta_bancaria || item.cuenta_bancaria_proveedor || 'No especificada';
        const cuentaDestinoMoneda = (item.cuenta_destino_moneda || item.moneda || 'PEN').toUpperCase();
        const esUSDDestino = cuentaDestinoMoneda.includes('DOL') || cuentaDestinoMoneda === 'USD' || cuentaDestinoMoneda === 'US$';

        const cuentaOrigen = item.cuenta_bancaria_empresa || '';
        const cuentaOrigenMoneda = (cuentaOrigen.toUpperCase().includes('DOL') || cuentaOrigen.toUpperCase().includes('USD')) ? 'USD' : 'PEN';
        const esUSDOrigen = cuentaOrigenMoneda === 'USD';

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
                    <span class="fw-bolder text-dark" style="font-size:0.84rem;">${importeFormateado}</span>
                </td>

                <!-- 3. Solicitante -->
                <td>
                    <span class="fw-bold text-dark text-uppercase" style="font-size:0.78rem;">${escapeHtml(item.solicitante || 'NO ESPECIFICADO')}</span>
                </td>

                <!-- 4. Centro de Costo -->
                <td>
                    <span class="badge font-monospace fw-bold" style="font-size:0.74rem; background:#eff6ff; color:#0f172a !important; border:1px solid #bfdbfe; border-radius:6px; padding:3px 8px;">
                        ${escapeHtml(item.centro_costo || 'CC-100')}
                    </span>
                </td>

                <!-- 5. Motivo -->
                <td>
                    <span class="text-secondary fw-semibold" style="font-size:0.78rem;">
                        ${escapeHtml(motivoOC)}
                    </span>
                </td>

                <!-- 6. Folio OC -->
                <td>
                    <button type="button" class="btn btn-sm p-0 text-primary fw-bold text-decoration-underline d-inline-flex align-items-center gap-1" onclick="window.verDetalleOC('${escapeHtml(String(item.id))}')" style="font-size:0.78rem;">
                        <i class="bi bi-file-earmark-text"></i> ${escapeHtml(folioOC)}
                    </button>
                </td>

                <!-- 7. Usuario Creación -->
                <td>
                    <span class="text-muted fw-semibold text-uppercase" style="font-size:0.75rem;">
                        ${escapeHtml(item.creador_nombre || item.creado_por_nombre || item.creado_por || '-')}
                    </span>
                </td>

                <!-- 8. Fecha Registro -->
                <td>
                    <span class="text-secondary fw-semibold" style="font-size:0.75rem;">${fechaReg}</span>
                </td>

                <!-- 9. Días Restantes -->
                <td class="text-center">${diasBadge}</td>

                <!-- 10. Usuario Aprobación -->
                <td>
                    <span class="text-dark fw-bold text-uppercase" style="font-size:0.75rem;">
                        ${escapeHtml(item.aprobador_nombre || item.aprobado_por_nombre || item.aprobado_por || '-')}
                    </span>
                </td>

                <!-- 11. Fecha Aprobación -->
                <td>
                    <span class="text-muted small" style="font-size:0.72rem;">${fechaAprob}</span>
                </td>

                <!-- 12. Proveedor -->
                <td>
                    <span class="fw-bold text-dark" style="font-size:0.8rem;">
                        ${escapeHtml(item.proveedor_nombre || item.proveedor || '-')}
                    </span>
                </td>

                <!-- 13. Cuenta Destino (Proveedor) -->
                <td>
                    <div class="d-inline-flex align-items-center gap-1.5">
                        <span class="badge ${esUSDDestino ? 'bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25' : 'bg-success bg-opacity-10 text-success border border-success border-opacity-25'} fw-bold" style="font-size:0.68rem;">
                            ${esUSDDestino ? 'USD' : 'PEN'}
                        </span>
                        <span class="text-dark fw-semibold" style="font-size:0.75rem;">
                            ${escapeHtml(cuentaDestino)}
                        </span>
                    </div>
                </td>

                <!-- 14. Cuenta Origen (Empresa) -->
                <td>
                    <div class="d-inline-flex align-items-center gap-1.5">
                        ${cuentaOrigen ? `
                            <span class="badge ${esUSDOrigen ? 'bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25' : 'bg-success bg-opacity-10 text-success border border-success border-opacity-25'} fw-bold" style="font-size:0.68rem;">
                                ${esUSDOrigen ? 'USD' : 'PEN'}
                            </span>
                            <span class="text-secondary fw-semibold" style="font-size:0.75rem;">
                                ${escapeHtml(cuentaOrigen)}
                            </span>
                        ` : `
                            <span class="text-muted small fst-italic">— Pendiente de Pago —</span>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * Calcular badge de días restantes / antigüedad
     */
    function calcularBadgeDiasRestantes(fechaStr, diasCredito = 0, condicionPago = 'Al contado', esPagado = false) {
        if (esPagado) {
            return `<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 px-2.5 py-1 rounded-pill fw-bold" style="font-size:0.72rem;"><i class="bi bi-check2-circle me-1"></i>Liquidado</span>`;
        }

        const cond = (condicionPago || 'Al contado').toLowerCase();
        const esCredito = cond.includes('crédito') || cond.includes('credito');

        if (!esCredito) {
            return `<span class="badge bg-light text-secondary border border-secondary border-opacity-25 px-2.5 py-1 rounded-pill fw-bold" style="font-size:0.72rem;">Al Contado</span>`;
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
                return `<span class="badge bg-danger text-white px-2.5 py-1 rounded-pill fw-bold shadow-2xs" style="font-size:0.72rem; letter-spacing:0.3px;"><i class="bi bi-exclamation-circle-fill me-1"></i>Vencido hace ${Math.abs(diffDias)} días</span>`;
            } else if (diffDias === 0) {
                return `<span class="badge bg-warning text-dark px-2.5 py-1 rounded-pill fw-bold shadow-2xs" style="font-size:0.72rem;"><i class="bi bi-clock-history me-1"></i>Vence Hoy</span>`;
            } else if (diffDias <= 3) {
                return `<span class="badge bg-warning bg-opacity-25 text-dark border border-warning px-2.5 py-1 rounded-pill fw-bold" style="font-size:0.72rem;">Faltan ${diffDias} días</span>`;
            } else {
                return `<span class="badge bg-success bg-opacity-15 text-success border border-success border-opacity-25 px-2.5 py-1 rounded-pill fw-bold" style="font-size:0.72rem;">Faltan ${diffDias} días</span>`;
            }
        } catch (e) {
            return `<span class="text-muted small">-</span>`;
        }
    }

    /**
     * Cargar Cuentas Bancarias de la Empresa en el selector de origen
     */
    window.prCargarCuentasOrigenSelect = async function (cuentaSeleccionada, esUSD) {
        const sel = document.getElementById('pago_select_cuenta_origen');
        if (!sel) return;
        sel.innerHTML = '<option value="">Cargando cuentas...</option>';

        try {
            const resp = await fetch('/api/tesoreria/bancos');
            const res = await resp.json();
            const bancos = (res && res.ok && Array.isArray(res.data)) ? res.data.filter(b => b.estado === 'ACTIVO' || !b.estado) : [];

            sel.innerHTML = '<option value="">Seleccionar cuenta de origen...</option>';

            if (!bancos.length) {
                const optS = new Option('BCP - CTA CTE SOLES', 'BCP - CTA CTE SOLES');
                const optD = new Option('BCP - CTA CTE DÓLARES', 'BCP - CTA CTE DÓLARES');
                sel.add(optS);
                sel.add(optD);
                sel.value = esUSD ? 'BCP - CTA CTE DÓLARES' : 'BCP - CTA CTE SOLES';
                return;
            }

            let matched = false;
            bancos.forEach((b) => {
                const mon = (b.moneda || 'SOLES').toUpperCase();
                const monLabel = (mon.includes('DOL') || mon === 'USD' || mon === 'US$') ? 'DÓLARES' : 'SOLES';
                const num = (b.numero_cuenta || '').trim();
                const tipo = b.tipo_cuenta || 'CTA CTE';
                const label = `${b.banco} - ${tipo} [${monLabel}] - ${num}`;

                const opt = new Option(label, label);
                opt.dataset.banco = b.banco;
                opt.dataset.moneda = monLabel;
                opt.dataset.numero = num;

                // Comprobar si coincide con la cuenta bancaria de la empresa guardada en la OC
                if (cuentaSeleccionada) {
                    const ctaSelClean = String(cuentaSeleccionada).trim();
                    if (ctaSelClean === label || (num && ctaSelClean.includes(num)) || (b.banco && ctaSelClean.includes(b.banco) && ctaSelClean.includes(monLabel))) {
                        opt.selected = true;
                        matched = true;
                    }
                }
                sel.add(opt);
            });

            // Si no hubo coincidencia exacta con lo de la OC, preseleccionar según la moneda de la orden
            if (!matched) {
                const targetMon = esUSD ? 'DÓLARES' : 'SOLES';
                for (let i = 0; i < sel.options.length; i++) {
                    const opt = sel.options[i];
                    if (opt.dataset.moneda === targetMon) {
                        opt.selected = true;
                        matched = true;
                        break;
                    }
                }
                if (!matched && sel.options.length > 1) {
                    sel.selectedIndex = 1;
                }
            }
        } catch (e) {
            console.warn('Error cargando cuentas origen:', e);
            sel.innerHTML = '<option value="">Seleccionar cuenta de origen...</option><option value="BCP - CTA CTE SOLES">BCP - CTA CTE SOLES</option>';
        }
    };

    /**
     * Abrir modal para Proceder con el Requerimiento
     */
    window.abrirModalProcederPago = async function (id) {
        const item = prDataCache.find(x => x.id === id || String(x.id) === String(id));
        if (!item) {
            alert("No se encontró la orden de compra seleccionada.");
            return;
        }

        // Llenar campos del modal
        const folioOC = item.folio || item.codigo_oc || item.id || '-';
        const monedaRaw = (item.moneda || 'SOLES').toUpperCase();
        const esUSD = monedaRaw.includes('DOL') || monedaRaw === 'USD' || monedaRaw === 'US$';
        const simbolo = esUSD ? 'US$' : 'S/';
        const importeNum = parseFloat(item.importe || item.total_pen || item.monto_total || item.importe_total || 0) || 0;
        const importeFormateado = importeNum.toLocaleString(esUSD ? 'en-US' : 'es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        document.getElementById('pago_oc_id').value = item.id;
        document.getElementById('pago_oc_moneda').value = esUSD ? 'USD' : 'PEN';
        document.getElementById('pago_oc_importe').value = importeNum;

        document.getElementById('pago_txt_oc').value = folioOC;
        document.getElementById('pago_txt_solicitante').value = item.solicitante || 'NO ESPECIFICADO';
        document.getElementById('pago_txt_proveedor').value = item.proveedor_nombre || item.proveedor || '-';
        document.getElementById('pago_num_constancia').value = '';
        document.getElementById('pago_txt_cuenta_destino').value = item.cuenta_bancaria || item.cuenta_bancaria_proveedor || 'No especificada';
        document.getElementById('pago_txt_descripcion').value = item.motivo_entrada || item.motivo || `ORDEN DE COMPRA: ${folioOC}`;
        document.getElementById('pago_badge_importe').textContent = `${simbolo} ${importeFormateado}`;

        // Cargar y preseleccionar cuentas bancarias de la empresa
        await window.prCargarCuentasOrigenSelect(item.cuenta_bancaria_empresa, esUSD);

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

            if (!res.ok || (!resData.ok && !resData.success)) {
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
     * Ver Detalle Completo de la Orden de Compra (Modal 1:1 ERP)
     */
    window.verDetalleOC = function (id) {
        const item = prDataCache.find(x => x.id === id || String(x.id) === String(id));
        if (!item) {
            alert("No se encontró la orden de compra seleccionada.");
            return;
        }

        window._ocSeleccionadaDetalle = item.id;

        const codLimpio = String(item.id || item.folio || '').replace(/^ENT-/i, '');
        const lblFolio = document.getElementById('lblDetalleOCFolio');
        if (lblFolio) lblFolio.textContent = `Órden de Compra: ${codLimpio}`;

        const solEl = document.getElementById('pr-det-oc-solicitante');
        if (solEl) solEl.textContent = (item.solicitante || item.autoriza || '—').toUpperCase();

        const creadorEl = document.getElementById('pr-det-oc-creador');
        if (creadorEl) creadorEl.textContent = (item.creador_nombre || item.creado_por || 'SISTEMA').toUpperCase();

        const fecEl = document.getElementById('pr-det-oc-fecha');
        if (fecEl) fecEl.textContent = formatearFechaHora(item.fecha || item.created_at);

        const tipEl = document.getElementById('pr-det-oc-tipo');
        if (tipEl) tipEl.textContent = (item.tipo_orden || 'ORDEN DE COMPRA').toUpperCase();

        const motEl = document.getElementById('pr-det-oc-motivo');
        if (motEl) motEl.textContent = (item.motivo_entrada || item.motivo || 'Sin motivo').toUpperCase();

        const monPagoEl = document.getElementById('pr-det-oc-moneda-pago');
        if (monPagoEl) {
            const monedaRaw = (item.moneda || 'SOLES').toUpperCase();
            const esUSD = monedaRaw.includes('DOL') || monedaRaw === 'USD' || monedaRaw === 'US$';
            const monText = esUSD ? 'DÓLARES (USD)' : 'SOLES (PEN)';
            let pagoText = (item.condicion_pago || 'AL CONTADO').toUpperCase();
            const esCredito = pagoText.includes('CRÉDITO') || pagoText.includes('CREDITO');
            if (esCredito && item.dias_credito) {
                pagoText += ' (' + item.dias_credito + ' DÍAS)';
            }
            monPagoEl.textContent = `${monText} • ${pagoText}`;
        }

        const desEl = document.getElementById('pr-det-oc-destino');
        if (desEl) {
            let desText = '';
            if (item.placa) desText += 'UNIDAD ' + item.placa;
            if (item.ot_id) desText += (desText ? ' | ' : '') + 'OT: ' + item.ot_id;
            if (!desText) desText = 'SEDE PRINCIPAL / ALMACÉN';
            desEl.textContent = desText;
        }

        const provEl = document.getElementById('pr-det-oc-proveedor');
        if (provEl) {
            let pText = item.proveedor_nombre || item.proveedor || 'Sin Proveedor';
            if (item.proveedor_ruc) pText += ' (RUC: ' + item.proveedor_ruc + ')';
            provEl.textContent = pText;
        }

        const estEl = document.getElementById('pr-det-oc-estado');
        if (estEl) {
            const estNorm = (item.estado || 'APROBADA').toUpperCase();
            let badgeHtml = '<span class="badge bg-success fw-bold px-2.5 py-1" style="font-size:0.75rem;">APROBADA</span>';
            if (estNorm === 'PROCESADO' || estNorm === 'PROCESADA' || estNorm === 'PAGADO' || estNorm === 'PAGADA') {
                badgeHtml = '<span class="badge bg-primary fw-bold px-2.5 py-1" style="font-size:0.75rem;">PROCESADA</span>';
            }
            const aprobador = item.aprobador_nombre || item.aprobado_por;
            if (aprobador) {
                badgeHtml += ' <span class="ms-2 text-dark fw-bold" style="font-size:0.8rem;"><i class="bi bi-person-check-fill text-success me-1"></i>Aprobado por: ' + escapeHtml(aprobador) + '</span>';
            }
            estEl.innerHTML = badgeHtml;
        }

        // Adjuntos
        const cotAdjEl = document.getElementById('pr-det-oc-adj-cotizacion');
        if (cotAdjEl) {
            const urlCot = item.url_cotizacion_presigned || item.url_cotizacion;
            cotAdjEl.innerHTML = urlCot ? `<a href="${urlCot}" target="_blank" class="text-primary fw-bold text-decoration-none"><i class="bi bi-file-earmark-text"></i> Ver Cotización</a>` : `<span class="text-muted fst-italic">Sin archivo</span>`;
        }

        const facAdjEl = document.getElementById('pr-det-oc-adj-factura');
        if (facAdjEl) {
            const urlFac = item.url_factura_presigned || item.url_factura;
            facAdjEl.innerHTML = urlFac ? `<a href="${urlFac}" target="_blank" class="text-success fw-bold text-decoration-none"><i class="bi bi-file-earmark-check"></i> Ver Factura</a>` : `<span class="text-muted fst-italic">Sin archivo</span>`;
        }

        const vouAdjEl = document.getElementById('pr-det-oc-adj-voucher');
        if (vouAdjEl) {
            const urlVou = item.url_voucher_presigned || item.url_voucher;
            vouAdjEl.innerHTML = urlVou ? `<a href="${urlVou}" target="_blank" class="text-danger fw-bold text-decoration-none"><i class="bi bi-file-earmark-pdf"></i> Ver Voucher</a>` : `<span class="text-muted fst-italic">Sin archivo</span>`;
        }

        // Artículos
        const tbody = document.getElementById('tbodyDetalleOCItems');
        const items = Array.isArray(item.items) ? item.items : [];
        const monedaRaw = (item.moneda || 'SOLES').toUpperCase();
        const esUSD = monedaRaw.includes('DOL') || monedaRaw === 'USD' || monedaRaw === 'US$';
        const sym = esUSD ? 'US$ ' : 'S/ ';
        let totalCalc = 0;

        if (tbody) {
            if (items.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3 fst-italic">${item.motivo ? escapeHtml(item.motivo) : 'No hay artículos registrados en esta orden.'}</td></tr>`;
            } else {
                tbody.innerHTML = items.map((it, idx) => {
                    const cant = parseFloat(it.cantidad || 0);
                    const cu = parseFloat(it.costo_unitario || it.precio_unitario || 0);
                    const imp = parseFloat(it.importe || (cant * cu));
                    totalCalc += imp;
                    const codArt = it.inventario_id || it.codigo || it.cod_art || `INV-${String(idx + 1).padStart(4, '0')}`;
                    const descArt = it.descripcion || it.nombre_producto || it.item || 'Artículo';

                    return `
                        <tr>
                            <td class="text-center fw-bold text-secondary">${idx + 1}</td>
                            <td class="text-center fw-bold text-dark">${cant.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</td>
                            <td class="text-center font-monospace fw-bold text-dark">${escapeHtml(codArt)}</td>
                            <td class="fw-semibold text-dark">${escapeHtml(descArt)}</td>
                            <td class="text-end fw-semibold text-dark">${sym}${cu.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="text-end fw-bold text-dark">${sym}${imp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        const totalReal = (item.importe != null && parseFloat(item.importe) > 0) ? parseFloat(item.importe) : ((item.total_pen != null && parseFloat(item.total_pen) > 0) ? parseFloat(item.total_pen) : totalCalc);
        const totGenEl = document.getElementById('pr-det-oc-total-general');
        if (totGenEl) {
            totGenEl.textContent = sym + totalReal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        const totLetEl = document.getElementById('pr-det-oc-total-letras');
        if (totLetEl) {
            const monedaTxt = esUSD ? 'DÓLARES AMERICANOS' : 'SOLES';
            totLetEl.textContent = `${numeroALetras(totalReal)} ${monedaTxt}`;
        }

        const modalEl = document.getElementById('modalDetalleOCPagoReq');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    };

    /**
     * Imprimir / Ver PDF desde el modal de detalle
     */
    window.imprimirPDFDesdeDetalleOC = function () {
        if (!window._ocSeleccionadaDetalle) return;
        if (typeof window.generarComprobanteEntrada === 'function') {
            window.generarComprobanteEntrada(window._ocSeleccionadaDetalle);
        } else {
            // Intentar invocar comprobante o abrir ventana
            window.print();
        }
    };

    /**
     * Convertidor de número a letras con fallback
     */
    function numeroALetras(num) {
        if (typeof window.numeroALetras === 'function') {
            return window.numeroALetras(num);
        }
        const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
        const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
        const diezY = ['', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
        const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

        num = parseFloat(num) || 0;
        const entero = Math.floor(num);
        const centavos = Math.round((num - entero) * 100);
        const centavosStr = String(centavos).padStart(2, '0') + '/100';

        if (entero === 0) return 'CERO CON ' + centavosStr;
        if (entero === 100) return 'CIEN CON ' + centavosStr;

        function seccion(n) {
            let res = '';
            const c = Math.floor(n / 100);
            const d = Math.floor((n % 100) / 10);
            const u = n % 10;

            if (c > 0) res += centenas[c] + ' ';
            if (d === 1 && u > 0) {
                res += diezY[u] + ' ';
            } else {
                if (d > 0) res += decenas[d] + (u > 0 ? ' Y ' : ' ');
                if (u > 0) res += unidades[u] + ' ';
            }
            return res.trim();
        }

        let letras = '';
        const miles = Math.floor(entero / 1000);
        const resto = entero % 1000;

        if (miles === 1) letras += 'MIL ';
        else if (miles > 1) letras += seccion(miles) + ' MIL ';

        if (resto > 0) letras += seccion(resto) + ' ';

        return (letras.trim() + ' CON ' + centavosStr).toUpperCase();
    }

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
                const folioOC = item.folio || item.codigo_oc || (item.id ? (String(item.id).startsWith('ENT') || String(item.id).startsWith('OC') ? String(item.id) : `2026-${String(item.id).padStart(8, '0')}`) : '-');
                const moneda = (item.moneda || 'SOLES').toUpperCase().includes('DOL') ? 'USD' : 'PEN';
                const monto = parseFloat(item.importe || item.total_pen || item.monto_total || item.importe_total || 0) || 0;

                return {
                    'N°': idx + 1,
                    'ESTADO': estado,
                    'MONEDA': moneda,
                    'MONTO': monto,
                    'CONDICIÓN DE PAGO': item.condicion_pago || 'Al contado',
                    'DÍAS CRÉDITO': item.dias_credito || 0,
                    'SOLICITANTE': item.solicitante || '',
                    'CENTRO COSTO': item.centro_costo || '',
                    'MOTIVO': item.motivo_entrada || item.motivo || '',
                    'ORDEN DE COMPRA': folioOC,
                    'USUARIO CREACIÓN': item.creador_nombre || item.creado_por_nombre || item.creado_por || '',
                    'FECHA REGISTRO': item.fecha ? String(item.fecha).substring(0, 10) : '',
                    'USUARIO APROBACIÓN': item.aprobador_nombre || item.aprobado_por_nombre || item.aprobado_por || '',
                    'FECHA APROBACIÓN': item.fecha_aprobacion ? formatearFechaHora(item.fecha_aprobacion) : '',
                    'PROVEEDOR': item.proveedor_nombre || item.proveedor || '',
                    'RUC': item.proveedor_ruc || '',
                    'CUENTA DESTINO': item.cuenta_bancaria || item.cuenta_bancaria_proveedor || '',
                    'CUENTA ORIGEN': item.cuenta_bancaria_empresa || '',
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
