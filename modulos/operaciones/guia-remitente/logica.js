/**
 * LÓGICA DE NEGOCIO GUÍA DE REMISIÓN ELECTRÓNICA - REMITENTE (GRE)
 * Tipo Documento: 09 | Serie: T001
 * Estilo Apple-like Reporte de Fallas / Checklist
 */

(function() {
    'use strict';

    // Estado local del módulo
    window._greState = {
        guias: [],
        kpis: { total: 0, emitidas: 0, pendientes: 0, aceptadas: 0, anuladas: 0, peso_total_kg: 0 },
        filtroEstado: 'TODOS',
        filtroModalidad: 'TODAS',
        busqueda: '',
        paginaActual: 1,
        porPagina: 50,
        totalRegistros: 0,
        guiaSeleccionada: null
    };

    const API_BASE = '/api/guia-remitente';

    // ═══════════════════════════════════════════════════════════════
    // 1. INICIALIZACIÓN SPA
    // ═══════════════════════════════════════════════════════════════
    window.init_guia_remitente = function() {
        console.log("🚀 [GRE] Inicializando Módulo Guía de Remisión Remitente...");
        
        // Configurar fechas por defecto en filtros o variables
        window.greCargarKpis();
        window.greCargarGuias();

        // Escuchar eventos websocket en vivo si existe broadcast
        if (window._socket && typeof window._socket.on === 'function') {
            window._socket.off('gre_emitida');
            window._socket.on('gre_emitida', function(data) {
                console.log("⚡ [GRE] Evento WebSocket gre_emitida recibido:", data);
                window.greCargarKpis();
                window.greCargarGuias();
            });
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // 2. CARGA DE KPIS
    // ═══════════════════════════════════════════════════════════════
    window.greCargarKpis = async function() {
        try {
            const res = await fetch(`${API_BASE}/kpis`);
            const data = await res.json();
            if (data.success && data.kpis) {
                window._greState.kpis = data.kpis;
                const totalEl = document.getElementById('greKpiTotal');
                const emitidasEl = document.getElementById('greKpiEmitidas');
                const pendientesEl = document.getElementById('greKpiPendientes');
                const pesoEl = document.getElementById('greKpiPesoTotal');

                if (totalEl) totalEl.innerText = Number(data.kpis.total || 0).toLocaleString();
                if (emitidasEl) emitidasEl.innerText = Number(data.kpis.emitidas || 0).toLocaleString();
                if (pendientesEl) pendientesEl.innerText = Number(data.kpis.pendientes || 0).toLocaleString();
                if (pesoEl) {
                    const tn = (Number(data.kpis.peso_total_kg || 0) / 1000).toFixed(2);
                    pesoEl.innerText = `${tn} TN`;
                }
            }
        } catch (e) {
            console.error("[GRE] Error al cargar KPIs:", e);
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // 3. CARGA Y FILTRADO DE GUÍAS
    // ═══════════════════════════════════════════════════════════════
    window.greCargarGuias = async function() {
        try {
            const q = encodeURIComponent(window._greState.busqueda || '');
            const estado = encodeURIComponent(window._greState.filtroEstado || 'TODOS');
            const modalidad = encodeURIComponent(window._greState.filtroModalidad || 'TODAS');
            const offset = (window._greState.paginaActual - 1) * window._greState.porPagina;
            const limit = window._greState.porPagina;

            const url = `${API_BASE}?q=${q}&estado=${estado}&modalidad=${modalidad}&limit=${limit}&offset=${offset}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                window._greState.guias = data.guias || [];
                window._greState.totalRegistros = data.total || 0;
                window.greRenderizarTabla();
                window.greRenderizarMobileCards();
                window.greActualizarPaginacion();
            } else {
                console.error("[GRE] Error cargando lista:", data.error);
            }
        } catch (e) {
            console.error("[GRE] Error en fetch de guías:", e);
        }
    };

    window.greSetFiltroEstado = function(estado, btn) {
        window._greState.filtroEstado = estado;
        window._greState.paginaActual = 1;
        document.querySelectorAll('#greSegmentedFilters .gre-pill-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        window.greCargarGuias();
    };

    window.greFiltrarTabla = function() {
        const input = document.getElementById('greInputBusqueda');
        const selMod = document.getElementById('greSelectModalidad');
        if (input) window._greState.busqueda = input.value.trim();
        if (selMod) window._greState.filtroModalidad = selMod.value;
        window._greState.paginaActual = 1;
        window.greCargarGuias();
    };

    // ═══════════════════════════════════════════════════════════════
    // 4. RENDERIZADO DE TABLA (ESCRITORIO)
    // ═══════════════════════════════════════════════════════════════
    window.greRenderizarTabla = function() {
        const tbody = document.getElementById('greTablaCuerpo');
        if (!tbody) return;

        const guias = window._greState.guias;
        if (guias.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-5 text-muted">
                        <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                        No se encontraron guías de remisión remitente con los filtros seleccionados
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = guias.map(g => {
            const statusBadge = window.greObtenerBadgeEstado(g.estado, g.apisunat_status);
            const fechaStr = g.fecha_emision ? String(g.fecha_emision).split('T')[0] : '-';
            const modalidadText = g.modalidad_transporte === '02' ? 'Privado (Propio)' : 'Público (Tercero)';
            const modalidadBadgeClass = g.modalidad_transporte === '02' ? 'bg-primary-subtle text-primary' : 'bg-info-subtle text-info';

            return `
                <tr>
                    <td>
                        <input type="checkbox" class="gre-row-check" value="${g.id}">
                    </td>
                    <td>
                        <div class="fw-bold text-dark font-monospace">${g.numero_guia || '-'}</div>
                        <small class="text-muted">${g.descripcion_motivo || 'VENTA'}</small>
                    </td>
                    <td>
                        <div class="fw-semibold">${fechaStr}</div>
                        <small class="text-muted">Traslado: ${g.fecha_traslado ? String(g.fecha_traslado).split('T')[0] : fechaStr}</small>
                    </td>
                    <td>
                        <span class="badge ${modalidadBadgeClass} border" style="font-size: 0.72rem;">${modalidadText}</span>
                    </td>
                    <td>
                        <div class="fw-semibold text-truncate" style="max-width: 220px;" title="${g.destinatario_razon_social || ''}">${g.destinatario_razon_social || '-'}</div>
                        <small class="text-muted">RUC: ${g.destinatario_ruc || '-'}</small>
                    </td>
                    <td>
                        <div class="small text-truncate" style="max-width: 220px;" title="${g.partida_direccion || ''}">
                            <i class="bi bi-geo-alt-fill text-danger"></i> ${g.partida_direccion || '-'}
                        </div>
                        <div class="small text-truncate mt-1" style="max-width: 220px;" title="${g.llegada_direccion || ''}">
                            <i class="bi bi-flag-fill text-success"></i> ${g.llegada_direccion || '-'}
                        </div>
                    </td>
                    <td>
                        <div class="fw-bold">${Number(g.peso_total || 0).toFixed(2)} ${g.unidad_medida || 'KGM'}</div>
                        <small class="text-muted">${g.total_bultos || 1} bulto(s)</small>
                    </td>
                    <td>
                        ${statusBadge}
                    </td>
                    <td style="text-align: right;">
                        <div class="d-inline-flex gap-1">
                            <button class="gre-action-btn" title="Ver Detalle y PDF" onclick="window.greVerDetalle(${g.id})">
                                <i class="bi bi-eye"></i>
                            </button>
                            ${(g.estado === 'BORRADOR' || !g.estado) ? `
                                <button class="gre-action-btn btn-emitir" title="Emitir a SUNAT" onclick="window.greEmitirGuia(${g.id})">
                                    <i class="bi bi-send-fill"></i>
                                </button>
                                <button class="gre-action-btn" title="Editar Borrador" onclick="window.greEditarGuia(${g.id})">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="gre-action-btn text-danger" title="Eliminar" onclick="window.greEliminarGuia(${g.id}, '${g.numero_guia}')">
                                    <i class="bi bi-trash"></i>
                                </button>
                            ` : `
                                <button class="gre-action-btn" title="Sincronizar SUNAT" onclick="window.greSincronizarApisunat(${g.id})">
                                    <i class="bi bi-arrow-repeat"></i>
                                </button>
                                ${g.pdf_url ? `
                                    <a class="gre-action-btn text-danger" href="${g.pdf_url}" target="_blank" title="Descargar PDF">
                                        <i class="bi bi-file-earmark-pdf-fill"></i>
                                    </a>
                                ` : ''}
                                ${g.xml_url ? `
                                    <a class="gre-action-btn text-primary" href="${g.xml_url}" target="_blank" title="Descargar XML">
                                        <i class="bi bi-filetype-xml"></i>
                                    </a>
                                ` : ''}
                                ${g.cdr_url ? `
                                    <a class="gre-action-btn text-success" href="${g.cdr_url}" target="_blank" title="Descargar CDR">
                                        <i class="bi bi-shield-check"></i>
                                    </a>
                                ` : ''}
                            `}
                            <button class="gre-action-btn" title="Duplicar como nueva" onclick="window.greDuplicarGuia(${g.id})">
                                <i class="bi bi-files"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    };

    // ═══════════════════════════════════════════════════════════════
    // 5. RENDERIZADO DE CARDS (MÓVIL)
    // ═══════════════════════════════════════════════════════════════
    window.greRenderizarMobileCards = function() {
        const container = document.getElementById('greMobileCardsCuerpo');
        if (!container) return;

        const guias = window._greState.guias;
        if (guias.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="bi bi-inbox fs-2 d-block mb-2"></i>
                    No hay guías para mostrar
                </div>
            `;
            return;
        }

        container.innerHTML = guias.map(g => {
            const statusBadge = window.greObtenerBadgeEstado(g.estado, g.apisunat_status);
            const fechaStr = g.fecha_emision ? String(g.fecha_emision).split('T')[0] : '-';
            const modalidadText = g.modalidad_transporte === '02' ? 'Privado' : 'Público';

            return `
                <div class="gre-mobile-card">
                    <div class="gre-mc-header">
                        <div>
                            <div class="gre-mc-title font-monospace">${g.numero_guia || '-'}</div>
                            <span class="badge bg-light text-secondary border mt-1">${modalidadText}</span>
                        </div>
                        ${statusBadge}
                    </div>
                    <div class="gre-mc-row">
                        <span class="label">Emisión:</span>
                        <span class="val">${fechaStr}</span>
                    </div>
                    <div class="gre-mc-row">
                        <span class="label">Destinatario:</span>
                        <span class="val text-truncate" style="max-width: 180px;">${g.destinatario_razon_social || '-'}</span>
                    </div>
                    <div class="gre-mc-row">
                        <span class="label">Ruta:</span>
                        <span class="val text-truncate" style="max-width: 180px;">${g.partida_direccion || ''} → ${g.llegada_direccion || ''}</span>
                    </div>
                    <div class="gre-mc-row">
                        <span class="label">Peso:</span>
                        <span class="val fw-bold text-primary">${Number(g.peso_total || 0).toFixed(2)} ${g.unidad_medida || 'KGM'}</span>
                    </div>
                    <div class="gre-mc-actions">
                        <button class="btn btn-sm btn-outline-secondary" onclick="window.greVerDetalle(${g.id})">
                            <i class="bi bi-eye"></i> Detalle
                        </button>
                        ${(g.estado === 'BORRADOR' || !g.estado) ? `
                            <button class="btn btn-sm btn-primary" onclick="window.greEmitirGuia(${g.id})">
                                <i class="bi bi-send-fill"></i> Emitir
                            </button>
                            <button class="btn btn-sm btn-outline-primary" onclick="window.greEditarGuia(${g.id})">
                                <i class="bi bi-pencil"></i>
                            </button>
                        ` : `
                            ${g.pdf_url ? `
                                <a class="btn btn-sm btn-outline-danger" href="${g.pdf_url}" target="_blank">
                                    <i class="bi bi-file-pdf"></i> PDF
                                </a>
                            ` : ''}
                        `}
                        <button class="btn btn-sm btn-outline-secondary" onclick="window.greDuplicarGuia(${g.id})">
                            <i class="bi bi-files"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    };

    // Helper de Badges
    window.greObtenerBadgeEstado = function(estado, apisunatStatus) {
        if (apisunatStatus === 'SUCCESS' || apisunatStatus === 'ACEPTADO' || estado === 'EMITIDA') {
            return `<span class="gre-badge gre-badge-emitida"><i class="bi bi-check-circle-fill"></i> EMITIDA SUNAT</span>`;
        }
        if (apisunatStatus === 'ERROR') {
            return `<span class="gre-badge gre-badge-error"><i class="bi bi-exclamation-circle-fill"></i> ERROR SUNAT</span>`;
        }
        if (estado === 'ANULADO') {
            return `<span class="gre-badge gre-badge-anulada"><i class="bi bi-x-circle-fill"></i> ANULADA</span>`;
        }
        return `<span class="gre-badge gre-badge-borrador"><i class="bi bi-pencil-fill"></i> BORRADOR</span>`;
    };

    // Paginación
    window.greActualizarPaginacion = function() {
        const infoEl = document.getElementById('greInfoPaginacion');
        const contEl = document.getElementById('greControlesPaginacion');
        if (!infoEl || !contEl) return;

        const total = window._greState.totalRegistros;
        const limit = window._greState.porPagina;
        const page = window._greState.paginaActual;
        const totalPaginas = Math.ceil(total / limit) || 1;

        infoEl.innerText = `Mostrando ${(page - 1) * limit + 1} - ${Math.min(page * limit, total)} de ${total} guías`;

        let btnsHtml = '';
        if (page > 1) {
            btnsHtml += `<button class="btn btn-sm btn-outline-secondary" onclick="window.greCambiarPagina(${page - 1})"><i class="bi bi-chevron-left"></i></button>`;
        }
        btnsHtml += `<span class="btn btn-sm btn-light disabled">Pág ${page} / ${totalPaginas}</span>`;
        if (page < totalPaginas) {
            btnsHtml += `<button class="btn btn-sm btn-outline-secondary" onclick="window.greCambiarPagina(${page + 1})"><i class="bi bi-chevron-right"></i></button>`;
        }
        contEl.innerHTML = btnsHtml;
    };

    window.greCambiarPagina = function(p) {
        window._greState.paginaActual = p;
        window.greCargarGuias();
    };

    // ═══════════════════════════════════════════════════════════════
    // 6. FORMULARIO DRAWER CREAR / EDITAR
    // ═══════════════════════════════════════════════════════════════
    window.greAbrirModalCrear = async function() {
        const overlay = document.getElementById('greDrawerOverlay');
        const titulo = document.getElementById('greDrawerTitulo');
        const form = document.getElementById('greFormulario');
        if (!overlay || !form) return;

        form.reset();
        document.getElementById('greFormId').value = '';
        if (titulo) titulo.innerHTML = `<i class="bi bi-file-earmark-arrow-up-fill text-primary"></i> <span>Nueva Guía de Remisión Remitente (GRE)</span>`;

        // Fechas de hoy
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('greFormFechaEmision').value = hoy;
        document.getElementById('greFormFechaTraslado').value = hoy;
        document.getElementById('greFormSerie').value = 'T001';
        document.getElementById('greFormModalidad').value = '01';
        window.greToggleModalidadTransporte('01');

        // Sugerir datos de remitente (YOGUI TRANSPORT o empresa configurada)
        document.getElementById('greFormRemitenteRuc').value = '20609532484';
        document.getElementById('greFormRemitenteRazon').value = 'YOGUI TRANSPORT S.A.C.';
        document.getElementById('greFormPartidaUbigeo').value = '150101';
        document.getElementById('greFormPartidaDireccion').value = 'AV. NESTOR GAMBETTA KM 3.5 - CALLAO';

        // Obtener correlativo sugerido
        await window.greActualizarCorrelativoSugerido();

        // Limpiar y crear item por defecto
        const tbodyItems = document.getElementById('greItemsTablaCuerpo');
        if (tbodyItems) tbodyItems.innerHTML = '';
        window.greAgregarFilaItem({
            codigo: 'CARGA-01',
            descripcion: 'CARGA GENERAL / MERCADERIA',
            cantidad: 1,
            unidad_medida: 'NIU',
            peso_unitario: 1.00
        });

        overlay.classList.add('active');
    };

    window.greEditarGuia = async function(id) {
        try {
            const res = await fetch(`${API_BASE}/${id}`);
            const data = await res.json();
            if (!data.success || !data.guia) {
                alert("Error cargando guía: " + (data.error || 'No encontrada'));
                return;
            }

            const g = data.guia;
            const overlay = document.getElementById('greDrawerOverlay');
            const titulo = document.getElementById('greDrawerTitulo');
            if (!overlay) return;

            if (titulo) titulo.innerHTML = `<i class="bi bi-pencil-square text-primary"></i> <span>Editar Guía Remitente ${g.numero_guia}</span>`;

            document.getElementById('greFormId').value = g.id;
            document.getElementById('greFormSerie').value = g.serie || 'T001';
            document.getElementById('greFormCorrelativo').value = g.correlativo || '';
            document.getElementById('greFormFechaEmision').value = g.fecha_emision ? String(g.fecha_emision).split('T')[0] : '';
            document.getElementById('greFormFechaTraslado').value = g.fecha_traslado ? String(g.fecha_traslado).split('T')[0] : '';
            document.getElementById('greFormModalidad').value = g.modalidad_transporte || '01';
            document.getElementById('greFormMotivo').value = g.motivo_traslado || '01';
            document.getElementById('greFormDescMotivo').value = g.descripcion_motivo || 'VENTA';

            document.getElementById('greFormRemitenteRuc').value = g.remitente_ruc || '';
            document.getElementById('greFormRemitenteRazon').value = g.remitente_razon_social || '';
            document.getElementById('greFormDestinatarioRuc').value = g.destinatario_ruc || '';
            document.getElementById('greFormDestinatarioRazon').value = g.destinatario_razon_social || '';

            document.getElementById('greFormPartidaUbigeo').value = g.partida_ubigeo || '';
            document.getElementById('greFormPartidaDireccion').value = g.partida_direccion || '';
            document.getElementById('greFormLlegadaUbigeo').value = g.llegada_ubigeo || '';
            document.getElementById('greFormLlegadaDireccion').value = g.llegada_direccion || '';

            // Transporte público
            document.getElementById('greFormTranspRuc').value = g.transportista_ruc || '';
            document.getElementById('greFormTranspRazon').value = g.transportista_razon_social || '';
            document.getElementById('greFormTranspMtc').value = g.transportista_reg_mtc || '';

            // Transporte privado
            document.getElementById('greFormVehiculoPlaca').value = g.vehiculo_placa || '';
            document.getElementById('greFormVehiculoSecundario').value = g.vehiculo_secundario_placa || '';
            document.getElementById('greFormConductorDni').value = g.conductor_num_doc || '';
            document.getElementById('greFormConductorNombres').value = g.conductor_nombres || '';
            document.getElementById('greFormConductorApellidos').value = g.conductor_apellidos || '';
            document.getElementById('greFormConductorLicencia').value = g.conductor_licencia || '';

            window.greToggleModalidadTransporte(g.modalidad_transporte || '01');

            document.getElementById('greFormPesoTotal').value = g.peso_total || '1.00';
            document.getElementById('greFormUnidadMedida').value = g.unidad_medida || 'KGM';
            document.getElementById('greFormTotalBultos').value = g.total_bultos || 1;
            document.getElementById('greFormIndicadorTransbordo').checked = !!g.indicador_transbordo;

            document.getElementById('greFormOrdenViaje').value = g.orden_viaje || '';
            document.getElementById('greFormOrdenServicio').value = g.orden_servicio || '';
            document.getElementById('greFormGrtVinculada').value = g.grt_vinculada_numero || '';
            document.getElementById('greFormObservaciones').value = g.observaciones || '';

            // Renderizar items
            const tbodyItems = document.getElementById('greItemsTablaCuerpo');
            if (tbodyItems) {
                tbodyItems.innerHTML = '';
                if (Array.isArray(g.items) && g.items.length > 0) {
                    g.items.forEach(it => window.greAgregarFilaItem(it));
                } else {
                    window.greAgregarFilaItem({
                        codigo: 'CARGA-01',
                        descripcion: 'CARGA GENERAL',
                        cantidad: 1,
                        unidad_medida: 'NIU',
                        peso_unitario: g.peso_total || 1.00
                    });
                }
            }

            overlay.classList.add('active');
        } catch (e) {
            console.error("[GRE] Error cargando detalle:", e);
            alert("Ocurrió un error al cargar los datos de la guía.");
        }
    };

    window.greCerrarDrawer = function() {
        const overlay = document.getElementById('greDrawerOverlay');
        if (overlay) overlay.classList.remove('active');
    };

    window.greToggleModalidadTransporte = function(modalidad) {
        const secPub = document.getElementById('greSectionTranspPublico');
        const secPriv = document.getElementById('greSectionTranspPrivado');
        if (modalidad === '02') {
            if (secPub) secPub.classList.add('d-none');
            if (secPriv) secPriv.classList.remove('d-none');
        } else {
            if (secPub) secPub.classList.remove('d-none');
            if (secPriv) secPriv.classList.add('d-none');
        }
    };

    window.greActualizarDescripcionMotivo = function(selectEl) {
        const opt = selectEl.options[selectEl.selectedIndex];
        const desc = opt.getAttribute('data-desc') || opt.text;
        const hiddenDesc = document.getElementById('greFormDescMotivo');
        if (hiddenDesc) hiddenDesc.value = desc;
    };

    window.greActualizarCorrelativoSugerido = async function() {
        try {
            const serie = document.getElementById('greFormSerie').value || 'T001';
            const res = await fetch(`${API_BASE}/ultimo-correlativo?serie=${encodeURIComponent(serie)}`);
            const data = await res.json();
            if (data.success && data.proximo) {
                const corrEl = document.getElementById('greFormCorrelativo');
                if (corrEl) corrEl.value = data.proximo;
            }
        } catch (e) {
            console.error("[GRE] Error obteniendo correlativo:", e);
        }
    };

    // Búsqueda de RUC en SUNAT
    window.greBuscarRuc = async function(tipo) {
        let inputRuc = null;
        let inputRazon = null;

        if (tipo === 'remitente') {
            inputRuc = document.getElementById('greFormRemitenteRuc');
            inputRazon = document.getElementById('greFormRemitenteRazon');
        } else if (tipo === 'destinatario') {
            inputRuc = document.getElementById('greFormDestinatarioRuc');
            inputRazon = document.getElementById('greFormDestinatarioRazon');
        } else if (tipo === 'transportista') {
            inputRuc = document.getElementById('greFormTranspRuc');
            inputRazon = document.getElementById('greFormTranspRazon');
        }

        if (!inputRuc || !inputRuc.value || inputRuc.value.length < 8) {
            alert("Ingrese un número de RUC válido de 11 dígitos");
            return;
        }

        const ruc = inputRuc.value.trim();
        try {
            const res = await fetch(`/api/clientes/consulta-ruc/${ruc}`);
            const data = await res.json();
            if (data.success && (data.razon_social || data.nombre)) {
                if (inputRazon) inputRazon.value = data.razon_social || data.nombre;
                if (tipo === 'destinatario' && data.direccion) {
                    const dirLlegada = document.getElementById('greFormLlegadaDireccion');
                    if (dirLlegada && !dirLlegada.value) dirLlegada.value = data.direccion;
                    if (data.ubigeo) {
                        const ubiLlegada = document.getElementById('greFormLlegadaUbigeo');
                        if (ubiLlegada && !ubiLlegada.value) ubiLlegada.value = data.ubigeo;
                    }
                }
            } else {
                alert("No se encontraron datos automáticos para este RUC. Puede ingresarlo manualmente.");
            }
        } catch (e) {
            console.error("[GRE] Error buscando RUC:", e);
            alert("No se pudo conectar al servicio de consulta RUC.");
        }
    };

    // Búsqueda de DNI Conductor
    window.greBuscarDniConductor = async function() {
        const inputDni = document.getElementById('greFormConductorDni');
        const inputNom = document.getElementById('greFormConductorNombres');
        const inputApe = document.getElementById('greFormConductorApellidos');

        if (!inputDni || inputDni.value.length < 8) {
            alert("Ingrese un DNI de 8 dígitos");
            return;
        }

        try {
            const res = await fetch(`/api/directorio/conductores?q=${encodeURIComponent(inputDni.value.trim())}`);
            const data = await res.json();
            if (data.success && Array.isArray(data.conductores) && data.conductores.length > 0) {
                const c = data.conductores[0];
                if (inputNom) inputNom.value = c.nombres || '';
                if (inputApe) inputApe.value = c.apellidos || '';
                if (c.licencia) {
                    const licEl = document.getElementById('greFormConductorLicencia');
                    if (licEl) licEl.value = c.licencia;
                }
            } else {
                alert("Conductor no encontrado en el directorio interno. Ingréselo manualmente.");
            }
        } catch (e) {
            console.error("[GRE] Error buscando conductor:", e);
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // AUTOCOMPLETAR DESDE ORDEN DE VIAJE (OV)
    // ═══════════════════════════════════════════════════════════════
    window.greAutocompletarDesdeOV = async function() {
        const input = document.getElementById('gre_buscar_ov_input');
        if (!input || !input.value.trim()) {
            alert("Ingrese el número de la Orden de Viaje (Ej: OV-2026-001)");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/buscar-ov/${encodeURIComponent(input.value.trim())}`);
            const data = await res.json();
            if (data.ok && data.ov) {
                const ov = data.ov;
                if (ov.placa_tracto) document.getElementById('greFormVehiculoPlaca').value = ov.placa_tracto;
                if (ov.placa_remolque) document.getElementById('greFormVehiculoSecundario').value = ov.placa_remolque;
                if (ov.conductor) {
                    if (ov.conductor.nombres) document.getElementById('greFormConductorNombres').value = ov.conductor.nombres;
                    if (ov.conductor.num_doc) document.getElementById('greFormConductorDni').value = ov.conductor.num_doc;
                    if (ov.conductor.licencia) document.getElementById('greFormConductorLicencia').value = ov.conductor.licencia;
                }
                if (ov.ubigeo_partida) document.getElementById('greFormPartidaUbigeo').value = ov.ubigeo_partida;
                if (ov.direccion_partida) document.getElementById('greFormPartidaDireccion').value = ov.direccion_partida;
                if (ov.ubigeo_llegada) document.getElementById('greFormLlegadaUbigeo').value = ov.ubigeo_llegada;
                if (ov.direccion_llegada) document.getElementById('greFormLlegadaDireccion').value = ov.direccion_llegada;
                if (ov.peso) document.getElementById('greFormPesoTotal').value = ov.peso;
                if (ov.viaje) {
                    const ovEl = document.getElementById('greFormOrdenViaje');
                    if (ovEl) ovEl.value = ov.viaje;
                }
                alert(`✅ Datos importados correctamente de la Orden de Viaje: ${ov.viaje}`);
            } else {
                alert("No se encontró la Orden de Viaje especificada.");
            }
        } catch (e) {
            console.error("[GRE] Error buscando OV:", e);
            alert("Error al buscar Orden de Viaje.");
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // 7. GESTIÓN DE ITEMS EN TABLA
    // ═══════════════════════════════════════════════════════════════
    window.greAgregarFilaItem = function(item = {}) {
        const tbody = document.getElementById('greItemsTablaCuerpo');
        if (!tbody) return;

        const idx = tbody.children.length + 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <input type="text" class="form-control form-control-sm item-codigo" value="${item.codigo || `ITM-${idx}`}" placeholder="Código">
            </td>
            <td>
                <input type="text" class="form-control form-control-sm item-desc" value="${item.descripcion || 'CARGA GENERAL'}" placeholder="Descripción detallada" required>
            </td>
            <td>
                <input type="number" step="0.01" class="form-control form-control-sm item-cant" value="${item.cantidad || 1}" required onchange="window.greRecalcularPesoTotal()">
            </td>
            <td>
                <select class="form-select form-select-sm item-um">
                    <option value="NIU" ${item.unidad_medida === 'NIU' ? 'selected' : ''}>NIU (Unid)</option>
                    <option value="KGM" ${item.unidad_medida === 'KGM' ? 'selected' : ''}>KGM (Kg)</option>
                    <option value="TNE" ${item.unidad_medida === 'TNE' ? 'selected' : ''}>TNE (Tn)</option>
                    <option value="BX" ${item.unidad_medida === 'BX' ? 'selected' : ''}>BX (Caja)</option>
                    <option value="PK" ${item.unidad_medida === 'PK' ? 'selected' : ''}>PK (Paquete)</option>
                </select>
            </td>
            <td>
                <input type="number" step="0.01" class="form-control form-control-sm item-peso" value="${item.peso_unitario || 0}" placeholder="Peso Kg" onchange="window.greRecalcularPesoTotal()">
            </td>
            <td class="text-center">
                <button type="button" class="btn btn-sm text-danger p-0" onclick="window.greEliminarFilaItem(this)" title="Quitar item">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    };

    window.greEliminarFilaItem = function(btn) {
        const tr = btn.closest('tr');
        if (tr) {
            tr.remove();
            window.greRecalcularPesoTotal();
        }
    };

    window.greRecalcularPesoTotal = function() {
        const rows = document.querySelectorAll('#greItemsTablaCuerpo tr');
        let totalPeso = 0;
        let totalBultos = 0;

        rows.forEach(r => {
            const cant = parseFloat(r.querySelector('.item-cant')?.value) || 0;
            const peso = parseFloat(r.querySelector('.item-peso')?.value) || 0;
            totalBultos += cant;
            totalPeso += (peso > 0 ? peso * cant : 0);
        });

        if (totalPeso > 0) {
            const pesoEl = document.getElementById('greFormPesoTotal');
            if (pesoEl) pesoEl.value = totalPeso.toFixed(2);
        }
        if (totalBultos > 0) {
            const bultosEl = document.getElementById('greFormTotalBultos');
            if (bultosEl) bultosEl.value = Math.max(1, Math.round(totalBultos));
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // 8. GUARDAR Y EMITIR
    // ═══════════════════════════════════════════════════════════════
    window.greEjecutarGuardar = function(emitirInmediatamente = false) {
        window._greEmitirTrasGuardar = emitirInmediatamente;
        const btnSubmit = document.getElementById('greBtnSubmitOculto');
        if (btnSubmit) btnSubmit.click();
    };

    window.greGuardarFormulario = async function(event) {
        event.preventDefault();

        // Extraer items
        const itemRows = document.querySelectorAll('#greItemsTablaCuerpo tr');
        const items = [];
        itemRows.forEach((r, idx) => {
            items.push({
                item_numero: idx + 1,
                codigo: r.querySelector('.item-codigo')?.value || `ITM-${idx + 1}`,
                descripcion: r.querySelector('.item-desc')?.value || 'CARGA GENERAL',
                cantidad: parseFloat(r.querySelector('.item-cant')?.value) || 1,
                unidad_medida: r.querySelector('.item-um')?.value || 'NIU',
                peso_unitario: parseFloat(r.querySelector('.item-peso')?.value) || 0
            });
        });

        const id = document.getElementById('greFormId').value;
        const modalidad = document.getElementById('greFormModalidad').value;

        const payload = {
            serie: document.getElementById('greFormSerie').value.toUpperCase().trim(),
            correlativo: document.getElementById('greFormCorrelativo').value,
            fecha_emision: document.getElementById('greFormFechaEmision').value,
            fecha_traslado: document.getElementById('greFormFechaTraslado').value,
            modalidad_transporte: modalidad,
            motivo_traslado: document.getElementById('greFormMotivo').value,
            descripcion_motivo: document.getElementById('greFormDescMotivo').value,
            remitente_ruc: document.getElementById('greFormRemitenteRuc').value.trim(),
            remitente_razon_social: document.getElementById('greFormRemitenteRazon').value.trim(),
            destinatario_ruc: document.getElementById('greFormDestinatarioRuc').value.trim(),
            destinatario_razon_social: document.getElementById('greFormDestinatarioRazon').value.trim(),
            partida_ubigeo: document.getElementById('greFormPartidaUbigeo').value.trim(),
            partida_direccion: document.getElementById('greFormPartidaDireccion').value.trim(),
            llegada_ubigeo: document.getElementById('greFormLlegadaUbigeo').value.trim(),
            llegada_direccion: document.getElementById('greFormLlegadaDireccion').value.trim(),
            transportista_ruc: document.getElementById('greFormTranspRuc')?.value?.trim() || null,
            transportista_razon_social: document.getElementById('greFormTranspRazon')?.value?.trim() || null,
            transportista_reg_mtc: document.getElementById('greFormTranspMtc')?.value?.trim() || null,
            vehiculo_placa: document.getElementById('greFormVehiculoPlaca')?.value?.trim() || null,
            vehiculo_secundario_placa: document.getElementById('greFormVehiculoSecundario')?.value?.trim() || null,
            conductor_num_doc: document.getElementById('greFormConductorDni')?.value?.trim() || null,
            conductor_nombres: document.getElementById('greFormConductorNombres')?.value?.trim() || null,
            conductor_apellidos: document.getElementById('greFormConductorApellidos')?.value?.trim() || null,
            conductor_licencia: document.getElementById('greFormConductorLicencia')?.value?.trim() || null,
            peso_total: parseFloat(document.getElementById('greFormPesoTotal').value) || 1,
            unidad_medida: document.getElementById('greFormUnidadMedida').value || 'KGM',
            total_bultos: parseInt(document.getElementById('greFormTotalBultos').value) || 1,
            indicador_transbordo: document.getElementById('greFormIndicadorTransbordo').checked,
            orden_viaje: document.getElementById('greFormOrdenViaje').value.trim() || null,
            orden_servicio: document.getElementById('greFormOrdenServicio').value.trim() || null,
            grt_vinculada_numero: document.getElementById('greFormGrtVinculada').value.trim() || null,
            observaciones: document.getElementById('greFormObservaciones').value.trim() || null,
            items
        };

        try {
            const url = id ? `${API_BASE}/${id}` : API_BASE;
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!data.success) {
                alert("Error al guardar guía: " + (data.error || 'Verifique los campos'));
                return;
            }

            const guardadoId = id || data.id;
            window.greCerrarDrawer();
            window.greCargarKpis();
            window.greCargarGuias();

            if (window._greEmitirTrasGuardar && guardadoId) {
                window.greEmitirGuia(guardadoId);
            } else {
                alert("Guía Remitente guardada correctamente.");
            }
        } catch (e) {
            console.error("[GRE] Error guardando formulario:", e);
            alert("Ocurrió un error inesperado al guardar.");
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // 9. EMISIÓN DIRECTA ANTE APISUNAT
    // ═══════════════════════════════════════════════════════════════
    window.greEmitirGuia = async function(id) {
        if (!confirm("¿Desea emitir formalmente esta Guía de Remisión Remitente a SUNAT?")) return;

        try {
            const res = await fetch(`${API_BASE}/${id}/emitir`, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                alert(`✅ Guía emitida con éxito ante SUNAT.\nEstado: ${data.status}`);
                window.greCargarKpis();
                window.greCargarGuias();
                if (data.pdfUrl) {
                    window.greVerDetalle(id);
                }
            } else {
                alert(`❌ Error al emitir GRE: ${data.error || 'Respuesta inválida de SUNAT'}`);
                window.greCargarGuias();
            }
        } catch (e) {
            console.error("[GRE] Error en emisión:", e);
            alert("Error al conectar con el servidor de facturación SUNAT.");
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // 10. SINCRONIZACIÓN Y DETALLE MODAL
    // ═══════════════════════════════════════════════════════════════
    window.greSincronizarApisunat = async function(id) {
        try {
            const res = await fetch(`${API_BASE}/${id}/sincronizar`);
            const data = await res.json();
            if (data.success) {
                alert(`Estado sincronizado: ${data.status}`);
                window.greCargarKpis();
                window.greCargarGuias();
            } else {
                alert("Error sincronizando: " + (data.error || 'No se pudo sincronizar'));
            }
        } catch (e) {
            console.error("[GRE] Error sincronizando:", e);
        }
    };

    window.greDuplicarGuia = async function(id) {
        if (!confirm("¿Desea duplicar esta guía como un nuevo borrador?")) return;
        try {
            const res = await fetch(`${API_BASE}/${id}/duplicar`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert(`Guía duplicada correctamente: ${data.numeroGuia}`);
                window.greCargarKpis();
                window.greCargarGuias();
            } else {
                alert("Error al duplicar: " + data.error);
            }
        } catch (e) {
            console.error("[GRE] Error duplicando:", e);
        }
    };

    window.greEliminarGuia = async function(id, numeroGuia) {
        if (!confirm(`¿Está seguro de eliminar el borrador ${numeroGuia}? Esta acción no se puede deshacer.`)) return;
        try {
            const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                alert("Guía eliminada.");
                window.greCargarKpis();
                window.greCargarGuias();
            } else {
                alert("Error eliminando: " + data.error);
            }
        } catch (e) {
            console.error("[GRE] Error eliminando:", e);
        }
    };

    window.greVerDetalle = async function(id) {
        try {
            const res = await fetch(`${API_BASE}/${id}`);
            const data = await res.json();
            if (!data.success || !data.guia) return;

            const g = data.guia;
            const modal = new bootstrap.Modal(document.getElementById('greModalDetalle'));

            document.getElementById('greModalDetalleTitulo').innerText = `Guía Remitente ${g.numero_guia}`;
            
            const badgeEl = document.getElementById('greModalDetalleBadge');
            if (badgeEl) badgeEl.innerHTML = window.greObtenerBadgeEstado(g.estado, g.apisunat_status);

            document.getElementById('greDetalleDestinatario').innerText = g.destinatario_razon_social || '-';
            document.getElementById('greDetalleDestinatarioRuc').innerText = `RUC: ${g.destinatario_ruc || '-'}`;
            document.getElementById('greDetallePartida').innerText = `${g.partida_direccion || '-'} (${g.partida_ubigeo || ''})`;
            document.getElementById('greDetalleLlegada').innerText = `${g.llegada_direccion || '-'} (${g.llegada_ubigeo || ''})`;

            const modText = g.modalidad_transporte === '02' 
                ? `Privado | Placa: ${g.vehiculo_placa || '-'} | Chofer: ${g.conductor_nombres || ''} (Lic: ${g.conductor_licencia || '-'})`
                : `Público | Empresa: ${g.transportista_razon_social || '-'} (RUC: ${g.transportista_ruc || '-'})`;
            document.getElementById('greDetalleTransporteInfo').innerText = modText;
            document.getElementById('greDetalleCargaInfo').innerText = `${g.peso_total || 0} ${g.unidad_medida || 'KGM'} | ${g.total_bultos || 1} bulto(s) | ${g.items ? g.items.length : 0} items`;

            // Enlaces a archivos
            const enlacesEl = document.getElementById('greDetalleEnlacesArchivos');
            if (enlacesEl) {
                enlacesEl.innerHTML = `
                    ${g.pdf_url ? `<a href="${g.pdf_url}" target="_blank" class="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-between"><i class="bi bi-file-pdf-fill"></i> Descargar Representación Impresa (PDF) <i class="bi bi-download"></i></a>` : '<div class="text-muted small">PDF no generado aún</div>'}
                    ${g.xml_url ? `<a href="${g.xml_url}" target="_blank" class="btn btn-sm btn-outline-primary d-flex align-items-center justify-content-between"><i class="bi bi-filetype-xml"></i> Descargar Comprobante UBL 2.1 (XML) <i class="bi bi-download"></i></a>` : ''}
                    ${g.cdr_url ? `<a href="${g.cdr_url}" target="_blank" class="btn btn-sm btn-outline-success d-flex align-items-center justify-content-between"><i class="bi bi-shield-check"></i> Descargar Constancia de Recepción (CDR) <i class="bi bi-download"></i></a>` : ''}
                `;
            }

            // Iframe PDF
            const iframe = document.getElementById('greIframePdf');
            if (iframe) {
                iframe.src = g.pdf_url || 'about:blank';
            }

            // Acciones footer
            const footerAcciones = document.getElementById('greDetalleAccionesFooter');
            if (footerAcciones) {
                footerAcciones.innerHTML = `
                    ${(g.estado === 'BORRADOR' || !g.estado) ? `
                        <button class="btn btn-primary" onclick="bootstrap.Modal.getInstance(document.getElementById('greModalDetalle')).hide(); window.greEmitirGuia(${g.id})">
                            <i class="bi bi-send-fill"></i> Emitir a SUNAT
                        </button>
                    ` : `
                        <button class="btn btn-outline-primary" onclick="window.greSincronizarApisunat(${g.id})">
                            <i class="bi bi-arrow-repeat"></i> Sincronizar Estado
                        </button>
                    `}
                `;
            }

            modal.show();
        } catch (e) {
            console.error("[GRE] Error cargando detalle modal:", e);
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // 11. EXPORTACIÓN EXCEL / CSV
    // ═══════════════════════════════════════════════════════════════
    window.greExportarExcel = function() {
        const guias = window._greState.guias;
        if (!guias || guias.length === 0) {
            alert("No hay guías para exportar.");
            return;
        }

        const headers = ["Número Guía", "Fecha Emisión", "Fecha Traslado", "Modalidad", "Motivo", "Destinatario RUC", "Destinatario", "Partida", "Llegada", "Peso Total", "Unidad", "Estado SUNAT"];
        const rows = guias.map(g => [
            `"${g.numero_guia || ''}"`,
            `"${g.fecha_emision ? String(g.fecha_emision).split('T')[0] : ''}"`,
            `"${g.fecha_traslado ? String(g.fecha_traslado).split('T')[0] : ''}"`,
            `"${g.modalidad_transporte === '02' ? 'Privado' : 'Público'}"`,
            `"${g.descripcion_motivo || ''}"`,
            `"${g.destinatario_ruc || ''}"`,
            `"${(g.destinatario_razon_social || '').replace(/"/g, '""')}"`,
            `"${(g.partida_direccion || '').replace(/"/g, '""')}"`,
            `"${(g.llegada_direccion || '').replace(/"/g, '""')}"`,
            g.peso_total || 0,
            `"${g.unidad_medida || 'KGM'}"`,
            `"${g.apisunat_status || g.estado || 'BORRADOR'}"`
        ]);

        const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Guias_Remitente_GRE_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    window.greSeleccionarTodos = function(checked) {
        document.querySelectorAll('.gre-row-check').forEach(cb => cb.checked = checked);
    };

})();
