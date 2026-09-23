/**
 * ====================================================================
 * 📊 MÓDULO TESORERÍA: MOVIMIENTOS (LÓGICA SPA)
 * Libro General Unificado de Bancos y Caja (Ingresos y Egresos)
 * ====================================================================
 */

(function () {
    let movDataCache = [];
    let movTipoFiltro = 'TODOS'; // 'TODOS', 'EGRESO', 'INGRESO'

    // Inicializador del módulo
    window.inicializarModuloMovimientos = function () {
        console.log("📊 [Movimientos Tesorería] Módulo inicializado.");

        // Fechas por defecto: mes actual
        const hoy = new Date();
        const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const formatYMD = (d) => d.toISOString().slice(0, 10);

        const fDesde = document.getElementById('mov-filtro-desde');
        const fHasta = document.getElementById('mov-filtro-hasta');
        if (fDesde && !fDesde.value) fDesde.value = formatYMD(primerDia);
        if (fHasta && !fHasta.value) fHasta.value = formatYMD(hoy);

        configurarEventosMovimientos();
        window.cargarMovimientosTesoreria(true);
    };

    // Alias estándar de carga modular
    window.init_tesoreria_movimientos = window.inicializarModuloMovimientos;
    window.init_movimientos = window.inicializarModuloMovimientos;

    /**
     * Configuración de eventos de UI
     */
    function configurarEventosMovimientos() {
        const inputBusqueda = document.getElementById('busquedaMovimientos');
        if (inputBusqueda) {
            inputBusqueda.addEventListener('input', () => {
                filtrarTablaMovimientos();
            });
        }
    }

    /**
     * Cargar movimientos desde el backend
     */
    window.cargarMovimientosTesoreria = async function (forzar = false) {
        const tbody = document.getElementById('tbodyMovimientos');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="22" class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    <span class="fw-semibold">Cargando movimientos de tesorería...</span>
                </td>
            </tr>
        `;

        const banco = (document.getElementById('mov-filtro-banco')?.value || 'TODOS');
        const estado = (document.getElementById('mov-filtro-estado')?.value || 'PROCESADO');
        const fDesde = (document.getElementById('mov-filtro-desde')?.value || '');
        const fHasta = (document.getElementById('mov-filtro-hasta')?.value || '');

        const params = new URLSearchParams();
        if (banco && banco !== 'TODOS') params.append('banco', banco);
        if (estado && estado !== 'TODOS') params.append('estado', estado);
        if (fDesde) params.append('fecha_desde', fDesde);
        if (fHasta) params.append('fecha_hasta', fHasta);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/tesoreria/movimientos?${params.toString()}`, {
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
            movDataCache = Array.isArray(data) ? data : [];

            calcularKPIsMovimientos(movDataCache);
            filtrarTablaMovimientos();

        } catch (err) {
            console.error("❌ Error al cargar movimientos:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="22" class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle-fill me-1"></i>
                        Error al cargar movimientos: ${err.message}.
                        <button class="btn btn-sm btn-outline-danger ms-2" onclick="window.cargarMovimientosTesoreria(true)">Reintentar</button>
                    </td>
                </tr>
            `;
        }
    };

    /**
     * Calcular KPIs Bento
     */
    function calcularKPIsMovimientos(items) {
        let totalIngresos = 0;
        let totalEgresos = 0;

        items.forEach(it => {
            const monto = parseFloat(it.monto || it.total || it.importe || 0) || 0;
            const tipo = (it.tipo_movimiento || 'EGRESO').toUpperCase();

            if (tipo === 'INGRESO') {
                totalIngresos += monto;
            } else {
                totalEgresos += monto;
            }
        });

        const balanceNeto = totalIngresos - totalEgresos;

        const elIngresos = document.getElementById('kpi-mov-ingresos');
        const elEgresos = document.getElementById('kpi-mov-egresos');
        const elBalance = document.getElementById('kpi-mov-balance');
        const elTotal = document.getElementById('kpi-mov-total');

        if (elIngresos) elIngresos.textContent = `S/ ${totalIngresos.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (elEgresos) elEgresos.textContent = `S/ ${totalEgresos.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (elBalance) {
            elBalance.textContent = `S/ ${balanceNeto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            elBalance.className = `fs-4 fw-bolder lh-1 ${balanceNeto >= 0 ? 'text-primary' : 'text-danger'}`;
        }
        if (elTotal) elTotal.textContent = items.length;
    }

    /**
     * Segmented Control de Tipo de Movimiento
     */
    window.setFiltroTipoMov = function (tipo, btn) {
        movTipoFiltro = tipo;
        document.querySelectorAll('#mov-tipo-segmented .mov-segment-item').forEach(el => el.classList.remove('active'));
        if (btn) btn.classList.add('active');
        filtrarTablaMovimientos();
    };

    /**
     * Filtro al hacer clic en KPI
     */
    window.filtrarMovPorKPI = function (tipo) {
        if (tipo === 'ingreso') {
            const btnIng = document.getElementById('mov-seg-ingresos');
            window.setFiltroTipoMov('INGRESO', btnIng);
        } else if (tipo === 'egreso') {
            const btnEg = document.getElementById('mov-seg-egresos');
            window.setFiltroTipoMov('EGRESO', btnEg);
        } else {
            const btnTod = document.getElementById('mov-seg-todos');
            window.setFiltroTipoMov('TODOS', btnTod);
        }
    };

    /**
     * Filtrar datos en memoria y renderizar tabla
     */
    window.filtrarTablaMovimientos = function () {
        const tbody = document.getElementById('tbodyMovimientos');
        const emptyState = document.getElementById('mov-empty-state');
        if (!tbody) return;

        const txtBusqueda = (document.getElementById('busquedaMovimientos')?.value || '').toLowerCase().trim();

        const filtrados = movDataCache.filter(item => {
            const tipo = (item.tipo_movimiento || 'EGRESO').toUpperCase();

            // 1. Filtro Tipo Movimiento
            if (movTipoFiltro === 'EGRESO' && tipo !== 'EGRESO') return false;
            if (movTipoFiltro === 'INGRESO' && tipo !== 'INGRESO') return false;

            // 2. Filtro Buscador General
            if (txtBusqueda) {
                const searchCorpus = [
                    item.id,
                    item.caja_folio || '',
                    item.motivo || '',
                    item.sub_motivo || '',
                    item.descripcion || '',
                    item.numero_operacion || '',
                    item.numero_factura || '',
                    item.beneficiario || '',
                    item.tipo_persona || '',
                    item.solicitante || '',
                    item.autoriza || '',
                    item.banco_cuenta || '',
                    item.centro_costo || '',
                    item.placa || '',
                    item.orden_viaje || '',
                    item.estado || ''
                ].join(' ').toLowerCase();

                if (!searchCorpus.includes(txtBusqueda)) return false;
            }

            return true;
        });

        const contador = document.getElementById('mov-contador-registros');
        if (contador) {
            contador.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'registro' : 'registros'}`;
        }

        if (filtrados.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        tbody.innerHTML = filtrados.map(item => renderFilaMovimiento(item)).join('');
    };

    /**
     * Renderizar fila individual con las 22 columnas
     */
    function renderFilaMovimiento(item) {
        const tipo = (item.tipo_movimiento || 'EGRESO').toUpperCase();
        const esIngreso = tipo === 'INGRESO';
        const montoNum = parseFloat(item.monto || 0) || 0;
        const monedaRaw = (item.moneda || 'SOLES').toUpperCase();
        const esUSD = monedaRaw.includes('DOL') || monedaRaw === 'USD' || monedaRaw === 'US$';
        const simbolo = esUSD ? 'US$' : 'S/';

        const montoFmt = `${simbolo} ${montoNum.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const debeFmt = esIngreso ? montoNum.toFixed(2) : '-';
        const haberFmt = !esIngreso ? montoNum.toFixed(2) : '-';

        // 1. Archivo / Voucher
        const voucherUrl = item.voucher_url_presigned || item.voucher_url;
        let colArchivo = '-';
        if (voucherUrl) {
            colArchivo = `
                <button type="button" class="btn btn-sm btn-light border text-primary p-1 rounded-circle shadow-sm" onclick="window.abrirVisorVoucher('${voucherUrl}', '${item.caja_folio || item.id}', '${escapeHtml(item.beneficiario || '')}')" title="Ver Comprobante">
                    <i class="bi bi-file-earmark-arrow-down-fill text-danger" style="font-size:0.88rem;"></i>
                </button>
            `;
        }

        // 2. Badge Tipo
        const badgeTipo = esIngreso
            ? `<span class="badge-tipo-ingreso"><i class="bi bi-arrow-down-left me-0.5"></i>INGRESO</span>`
            : `<span class="badge-tipo-egreso"><i class="bi bi-arrow-up-right me-0.5"></i>EGRESO</span>`;

        // 3. Fechas
        const fechaDep = item.fecha_valuta ? String(item.fecha_valuta).substring(0, 10) : (item.fecha ? String(item.fecha).substring(0, 10) : '-');
        const fechaAprob = item.fecha_aprobacion ? String(item.fecha_aprobacion).substring(0, 10) : '-';

        // 4. Datos Operativos
        let datosOp = '-';
        if (item.placa && item.placa !== '-' || item.orden_viaje && item.orden_viaje !== '-') {
            datosOp = `<span class="badge bg-light text-dark border small fw-bold">${escapeHtml(item.placa || '')}</span> <span class="text-muted small">${escapeHtml(item.orden_viaje || '')}</span>`;
        }

        // 5. Estado Badge
        const estado = (item.estado || 'PROCESADO').toUpperCase();
        let badgeEstado = `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-0.5 rounded-pill fw-bold" style="font-size:0.7rem;">PROCESADO</span>`;
        if (estado === 'APROBADO') {
            badgeEstado = `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2 py-0.5 rounded-pill fw-bold" style="font-size:0.7rem;">APROBADO</span>`;
        } else if (estado === 'PENDIENTE') {
            badgeEstado = `<span class="badge bg-warning bg-opacity-25 text-dark border border-warning px-2 py-0.5 rounded-pill fw-bold" style="font-size:0.7rem;">PENDIENTE</span>`;
        } else if (estado === 'ANULADO') {
            badgeEstado = `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2 py-0.5 rounded-pill fw-bold" style="font-size:0.7rem;">ANULADO</span>`;
        }

        return `
            <tr>
                <!-- 1. Archivo -->
                <td class="text-center ps-3">${colArchivo}</td>

                <!-- 2. Monto -->
                <td class="fw-bolder text-dark">${montoFmt}</td>

                <!-- 3. Tipo Movimiento -->
                <td>${badgeTipo}</td>

                <!-- 4. Debe -->
                <td class="text-end fw-semibold ${esIngreso ? 'text-success' : 'text-muted'}">${debeFmt}</td>

                <!-- 5. Haber -->
                <td class="text-end fw-semibold ${!esIngreso ? 'text-danger' : 'text-muted'}">${haberFmt}</td>

                <!-- 6. Motivo -->
                <td><span class="fw-bold text-dark text-truncate d-inline-block" style="max-width: 160px;" title="${escapeHtml(item.motivo)}">${escapeHtml(item.motivo)}</span></td>

                <!-- 7. Sub Motivo -->
                <td><span class="text-secondary fw-semibold text-truncate d-inline-block" style="max-width: 150px;" title="${escapeHtml(item.sub_motivo)}">${escapeHtml(item.sub_motivo)}</span></td>

                <!-- 8. Caja / Folio -->
                <td><span class="badge bg-light text-primary border fw-bold" style="font-size:0.75rem;">${escapeHtml(item.caja_folio)}</span></td>

                <!-- 9. Descripción -->
                <td><span class="text-muted small text-truncate d-inline-block" style="max-width: 230px;" title="${escapeHtml(item.descripcion)}">${escapeHtml(item.descripcion)}</span></td>

                <!-- 10. Tipo Caja -->
                <td><span class="badge bg-light text-secondary border small">${escapeHtml(item.tipo_caja)}</span></td>

                <!-- 11. Fecha Depósito -->
                <td><span class="text-secondary fw-semibold small">${fechaDep}</span></td>

                <!-- 12. N° Operación -->
                <td><span class="fw-bold text-dark small">${escapeHtml(item.numero_operacion)}</span></td>

                <!-- 13. N° Factura -->
                <td><span class="text-muted small">${escapeHtml(item.numero_factura)}</span></td>

                <!-- 14. Beneficiario -->
                <td><span class="fw-bold text-dark text-truncate d-inline-block" style="max-width: 190px;" title="${escapeHtml(item.beneficiario)}">${escapeHtml(item.beneficiario)}</span></td>

                <!-- 15. Tipo Persona -->
                <td><span class="badge bg-light text-dark border small">${escapeHtml(item.tipo_persona)}</span></td>

                <!-- 16. Solicitante -->
                <td><span class="text-secondary small text-uppercase">${escapeHtml(item.solicitante)}</span></td>

                <!-- 17. Autoriza -->
                <td><span class="text-dark fw-semibold small text-uppercase">${escapeHtml(item.autoriza)}</span></td>

                <!-- 18. Fecha Aprobación -->
                <td><span class="text-muted small">${fechaAprob}</span></td>

                <!-- 19. Centro Costo -->
                <td><span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-20 px-2 py-0.5 rounded-pill small fw-bold">${escapeHtml(item.centro_costo)}</span></td>

                <!-- 20. Datos Operativos -->
                <td>${datosOp}</td>

                <!-- 21. Estado -->
                <td class="text-center">${badgeEstado}</td>

                <!-- 22. Banco / Cuenta -->
                <td class="pe-3"><span class="text-secondary small fw-semibold text-truncate d-inline-block" style="max-width: 210px;" title="${escapeHtml(item.banco_cuenta)}">${escapeHtml(item.banco_cuenta)}</span></td>
            </tr>
        `;
    }

    /**
     * Modal para ver comprobante / voucher
     */
    window.abrirVisorVoucher = function (url, folio, beneficiario) {
        if (!url) return;

        const lblTitulo = document.getElementById('lblVisorVoucherTitulo');
        const lblSub = document.getElementById('lblVisorVoucherSubtitulo');
        const img = document.getElementById('imgVisorVoucher');
        const iframe = document.getElementById('iframeVisorVoucher');
        const btnDesc = document.getElementById('btnDescargarVoucherModal');

        if (lblTitulo) lblTitulo.textContent = `Comprobante: ${folio}`;
        if (lblSub) lblSub.textContent = `Beneficiario: ${beneficiario || '-'}`;
        if (btnDesc) btnDesc.href = url;

        const esPdf = url.toLowerCase().includes('.pdf');
        if (esPdf) {
            if (img) img.style.display = 'none';
            if (iframe) {
                iframe.src = url;
                iframe.style.display = 'block';
            }
        } else {
            if (iframe) iframe.style.display = 'none';
            if (img) {
                img.src = url;
                img.style.display = 'block';
            }
        }

        const modalEl = document.getElementById('modalVisorVoucherMov');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    };

    /**
     * Exportar a Excel
     */
    window.exportarExcelMovimientos = function () {
        if (!movDataCache || movDataCache.length === 0) {
            alert("No hay registros de movimientos para exportar.");
            return;
        }

        try {
            const filas = movDataCache.map((it, idx) => ({
                'N°': idx + 1,
                'FOLIO / CAJA': it.caja_folio || it.id,
                'TIPO MOVIMIENTO': it.tipo_movimiento || 'EGRESO',
                'MONEDA': it.moneda || 'SOLES',
                'MONTO': parseFloat(it.monto || 0),
                'DEBE': parseFloat(it.debe || 0),
                'HABER': parseFloat(it.haber || 0),
                'MOTIVO': it.motivo || '',
                'SUB MOTIVO': it.sub_motivo || '',
                'DESCRIPCIÓN': it.descripcion || '',
                'TIPO CAJA': it.tipo_caja || '',
                'FECHA DEPÓSITO': it.fecha_valuta ? String(it.fecha_valuta).substring(0, 10) : '',
                'N° OPERACIÓN': it.numero_operacion || '',
                'N° FACTURA': it.numero_factura || '',
                'BENEFICIARIO': it.beneficiario || '',
                'TIPO PERSONA': it.tipo_persona || '',
                'SOLICITANTE': it.solicitante || '',
                'AUTORIZA': it.autoriza || '',
                'FECHA APROBACIÓN': it.fecha_aprobacion ? String(it.fecha_aprobacion).substring(0, 10) : '',
                'CENTRO COSTO': it.centro_costo || '',
                'PLACA / UNIDAD': it.placa || '',
                'ORDEN VIAJE': it.orden_viaje || '',
                'ESTADO': it.estado || 'PROCESADO',
                'BANCO / CUENTA': it.banco_cuenta || ''
            }));

            if (window.XLSX) {
                const ws = XLSX.utils.json_to_sheet(filas);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Movimientos_Tesoreria");
                XLSX.writeFile(wb, `Movimientos_Tesoreria_${new Date().toISOString().substring(0, 10)}.xlsx`);
            } else {
                const headers = Object.keys(filas[0]).join(';');
                const rows = filas.map(r => Object.values(r).map(val => `"${String(val).replace(/"/g, '""')}"`).join(';')).join('\n');
                const csvContent = "\uFEFF" + headers + "\n" + rows;
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.setAttribute("download", `Movimientos_Tesoreria_${new Date().toISOString().substring(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (e) {
            console.error("Error exportando a Excel:", e);
            alert("No se pudo exportar a Excel.");
        }
    };

    /**
     * Imprimir Listado
     */
    window.imprimirMovimientos = function () {
        window.print();
    };

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
