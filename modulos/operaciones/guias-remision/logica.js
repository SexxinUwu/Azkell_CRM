/**
 * MÓDULO: GUÍAS DE REMISIÓN DE TRANSPORTISTA (GRE SUNAT)
 * Lógica Frontend y Conexión Asíncrona
 */
(function() {
    window._greGuiasData = [];
    window._greTipoFiltro = 'TODAS';

    // Inicializador del Módulo
    window.inicializarModuloGuiasRemision = async function() {
        // Establecer fechas por defecto (mes actual)
        const hoy = new Date();
        const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        
        const formatYMD = (d) => d.toISOString().slice(0, 10);
        
        const fDesde = document.getElementById('gre-filter-desde');
        const fHasta = document.getElementById('gre-filter-hasta');
        if (fDesde && !fDesde.value) fDesde.value = formatYMD(primerDia);
        if (fHasta && !fHasta.value) fHasta.value = formatYMD(hoy);

        await window.greCargarGuias();
    };

    // Filtrar por Segmento (Todas, Remitente 09, Transportista 31)
    window.greFiltrarTipo = function(tipo) {
        window._greTipoFiltro = tipo || 'TODAS';

        document.getElementById('gre-tab-todas')?.classList.toggle('active', window._greTipoFiltro === 'TODAS');
        document.getElementById('gre-tab-remitente')?.classList.toggle('active', window._greTipoFiltro === '09');
        document.getElementById('gre-tab-transportista')?.classList.toggle('active', window._greTipoFiltro === '31');

        window.greCargarGuias();
    };

    // Limpiar todos los filtros
    window.greLimpiarFiltros = function() {
        const fPlaca = document.getElementById('gre-filter-placa');
        const fSearch = document.getElementById('gre-filter-search');
        const fDesde = document.getElementById('gre-filter-desde');
        const fHasta = document.getElementById('gre-filter-hasta');

        if (fPlaca) fPlaca.value = '';
        if (fSearch) fSearch.value = '';

        const hoy = new Date();
        const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const formatYMD = (d) => d.toISOString().slice(0, 10);
        if (fDesde) fDesde.value = formatYMD(primerDia);
        if (fHasta) fHasta.value = formatYMD(hoy);

        window.greFiltrarTipo('TODAS');
    };

    // 1. Cargar Guías desde el Backend
    window.greCargarGuias = async function() {
        const tbody = document.getElementById('gre-tbody');
        if (!tbody) return;

        const fDesde = document.getElementById('gre-filter-desde')?.value || '';
        const fHasta = document.getElementById('gre-filter-hasta')?.value || '';
        const fPlaca = document.getElementById('gre-filter-placa')?.value || '';
        const fSearch = document.getElementById('gre-filter-search')?.value || '';

        const params = new URLSearchParams();
        if (fDesde) params.append('desde', fDesde);
        if (fHasta) params.append('hasta', fHasta);
        if (fPlaca) params.append('placa', fPlaca);
        if (fSearch) params.append('search', fSearch);
        if (window._greTipoFiltro && window._greTipoFiltro !== 'TODAS') {
            params.append('tipoDoc', window._greTipoFiltro);
        }

        try {
            const resp = await fetch(`/api/guias-remision?${params.toString()}`);
            const result = await resp.json();

            if (result.ok) {
                window._greGuiasData = result.data || [];
                window.greRenderTabla(window._greGuiasData);
                window.greCalcularKPIs(window._greGuiasData);
            } else {
                tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4 text-danger">Error: ${result.error || 'No se pudo cargar las guías'}</td></tr>`;
            }
        } catch (err) {
            console.error("Error al cargar guías:", err);
            tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4 text-danger">Error de conexión: ${err.message}</td></tr>`;
        }
    };

    // 2. Renderizar Tabla
    window.greRenderTabla = function(guias) {
        const tbody = document.getElementById('gre-tbody');
        const counter = document.getElementById('gre-counter-badge');
        if (!tbody) return;

        if (counter) counter.textContent = `Mostrando ${guias.length} guías`;

        if (!guias || guias.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="14" class="text-center py-5 text-muted">
                        <i class="bi bi-inbox fs-3 d-block mb-2 text-secondary opacity-50"></i>
                        No se encontraron guías de remisión para los filtros seleccionados.
                    </td>
                </tr>
            `;
            return;
        }

        const esc = (txt) => (txt || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");

        let html = '';
        guias.forEach((g, idx) => {
            const pesoKg = Number(g.peso_bruto_total || 0);
            const pesoTn = (pesoKg / 1000).toFixed(2);

            const badgeEstado = g.estado_sunat === 'ACEPTADO'
                ? `<span class="badge bg-success bg-opacity-10 text-success border border-success-subtle px-2 py-1"><i class="bi bi-check-circle-fill me-1"></i>Aceptado (CDR)</span>`
                : `<span class="badge bg-warning bg-opacity-10 text-warning border px-2 py-1">${esc(g.estado_sunat)}</span>`;

            html += `
                <tr>
                    <td class="font-monospace fw-bold" style="color:#0284c7;">
                        ${esc(g.numero_guia)}
                    </td>
                    <td>${badgeEstado}</td>
                    <td class="text-muted small">${esc(g.fecha_emision)}</td>
                    <td class="text-muted small">${esc(g.fecha_traslado)}</td>
                    <td class="fw-semibold text-dark text-truncate" style="max-width: 180px;" title="${esc(g.remitente_razon_social)}">
                        ${esc(g.remitente_razon_social)}
                    </td>
                    <td class="text-truncate" style="max-width: 180px;" title="${esc(g.destinatario_razon_social)}">
                        ${esc(g.destinatario_razon_social)}
                    </td>
                    <td class="text-truncate text-muted small" style="max-width: 160px;" title="${esc(g.punto_partida_direccion)}">
                        <i class="bi bi-geo-alt text-success me-1"></i>${esc(g.punto_partida_direccion)}
                    </td>
                    <td class="text-truncate text-muted small" style="max-width: 160px;" title="${esc(g.punto_llegada_direccion)}">
                        <i class="bi bi-geo-alt-fill text-danger me-1"></i>${esc(g.punto_llegada_direccion)}
                    </td>
                    <td class="text-center font-monospace fw-bold text-dark" style="font-size:0.82rem;">
                        ${esc(g.placa_tracto || '—')}
                    </td>
                    <td class="text-center font-monospace fw-semibold text-secondary" style="font-size:0.82rem;">
                        ${esc(g.placa_carreta || '—')}
                    </td>
                    <td class="text-truncate small fw-semibold" style="max-width: 160px;" title="${esc(g.conductor_nombre)}">
                        <i class="bi bi-person-fill text-primary me-1"></i>${esc(g.conductor_nombre || '—')}
                    </td>
                    <td class="text-end font-monospace fw-bold text-dark">
                        ${pesoKg.toLocaleString('es-PE', { minimumFractionDigits: 2 })} ${esc(g.unidad_medida || 'KGM')}
                    </td>
                    <td class="text-center">
                        <button class="btn btn-outline-info btn-sm rounded-pill py-0 px-2 fw-semibold" style="font-size:0.75rem;" onclick="window.greVerDetalleItems(${idx})">
                            <i class="bi bi-box-seam me-1"></i>${g.items ? g.items.length : 0} ítems
                        </button>
                    </td>
                    <td class="text-center">
                        <div class="d-inline-flex align-items-center gap-1">
                            ${(g.tipo_documento === '09' || (g.numero_guia && (g.numero_guia.startsWith('T') || g.numero_guia.startsWith('09')))) ? `
                                <button class="btn btn-warning btn-sm rounded-pill py-0 px-2 fw-bold text-dark d-flex align-items-center gap-1 shadow-2xs" style="font-size:0.72rem;" onclick="window.grtEmitirDesdeGre(${g.id})" title="Emitir GRT Transportista a partir de esta GRE">
                                    <i class="bi bi-truck-flatbed"></i> Emitir GRT
                                </button>
                            ` : (g.num_ticket ? `
                                <button class="btn btn-outline-primary btn-sm rounded-pill py-0 px-2 fw-semibold" style="font-size:0.72rem;" onclick="window.grtConsultarTicket(${g.id})" title="Consultar Ticket SUNAT">
                                    <i class="bi bi-arrow-repeat"></i> Ticket
                                </button>
                            ` : '')}
                            <button class="btn btn-outline-danger btn-sm rounded-circle p-1" onclick="window.greEliminarGuia(${g.id})" title="Eliminar guía">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    };

    // 3. Calcular KPIs
    window.greCalcularKPIs = function(guias) {
        const totalGuias = guias.length;
        let totalPesoKg = 0;
        let totalAceptadas = 0;
        const tractosSet = new Set();

        guias.forEach(g => {
            totalPesoKg += Number(g.peso_bruto_total || 0);
            if (g.estado_sunat === 'ACEPTADO') totalAceptadas++;
            if (g.placa_tracto) tractosSet.add(g.placa_tracto.trim().toUpperCase());
        });

        const totalTn = (totalPesoKg / 1000).toFixed(2);

        const elTotGuias = document.getElementById('gre-kpi-total-guias');
        const elPesoTotal = document.getElementById('gre-kpi-peso-total');
        const elPesoSub = document.getElementById('gre-kpi-peso-sub');
        const elAceptadas = document.getElementById('gre-kpi-aceptadas');
        const elTractos = document.getElementById('gre-kpi-tractos');

        if (elTotGuias) elTotGuias.textContent = totalGuias.toLocaleString();
        if (elPesoTotal) elPesoTotal.textContent = `${Number(totalTn).toLocaleString()} TN`;
        if (elPesoSub) elPesoSub.textContent = `${totalPesoKg.toLocaleString()} KGM acumulados`;
        if (elAceptadas) elAceptadas.textContent = totalAceptadas.toLocaleString();
        if (elTractos) elTractos.textContent = tractosSet.size.toLocaleString();
    };

    // 4. Abrir Modales
    window.greAbrirModalConsultarSunat = function() {
        const modalEl = document.getElementById('greModalConsultar');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.greAbrirModalCargaLote = function() {
        const modalEl = document.getElementById('greModalLote');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.greAbrirModalConfigSunat = async function() {
        try {
            const resp = await fetch('/api/guias-remision/credenciales-sunat');
            const res = await resp.json();
            if (res.ok && res.credenciales) {
                const c = res.credenciales;
                if (document.getElementById('greCfgRuc')) document.getElementById('greCfgRuc').value = c.sunat_ruc_emisor || '';
                if (document.getElementById('greCfgClientId')) document.getElementById('greCfgClientId').value = c.sunat_client_id || '';
                if (document.getElementById('greCfgUsuarioSol')) document.getElementById('greCfgUsuarioSol').value = c.sunat_usuario_sol || '';
            }
        } catch (e) {
            console.error("Error cargando config SUNAT:", e);
        }
        const modalEl = document.getElementById('greModalConfigSunat');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // 5. Ejecutar Consulta Individual a SUNAT
    window._greUltimaConsultaData = null;

    window.greLimpiarConsultaForm = function() {
        if (document.getElementById('greInputRucEmisor')) document.getElementById('greInputRucEmisor').value = '';
        if (document.getElementById('greInputSerie')) document.getElementById('greInputSerie').value = '';
        if (document.getElementById('greInputCorrelativo')) document.getElementById('greInputCorrelativo').value = '';
        if (document.getElementById('greInputFechaEmision')) document.getElementById('greInputFechaEmision').value = '';
        const resEl = document.getElementById('greResultadoConsulta');
        if (resEl) resEl.classList.add('d-none');
        window._greUltimaConsultaData = null;
    };

    window.greEjecutarConsultaSunat = async function(e) {
        if (e) e.preventDefault();

        const inputRuc = document.getElementById('greInputRucEmisor');
        const inputSerie = document.getElementById('greInputSerie');
        const inputCorrelativo = document.getElementById('greInputCorrelativo');
        const btn = document.getElementById('greBtnSubmitConsulta');
        const resContenedor = document.getElementById('greResultadoConsulta');

        const rucEmisor = (inputRuc?.value || '').trim();
        const serie = (inputSerie?.value || '').trim().toUpperCase();
        const correlativo = (inputCorrelativo?.value || '').trim();
        const tipoRadio = document.querySelector('input[name="greTipoConsultaRadio"]:checked');
        const tipoDoc = tipoRadio ? tipoRadio.value : '09';

        if (!rucEmisor || !serie || !correlativo) {
            alert('Por favor complete todos los campos: RUC del emisor, Serie y Número.');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Consultando en SUNAT...';
        }

        try {
            const params = new URLSearchParams({
                rucEmisor,
                serie,
                correlativo,
                tipoDoc,
                guardar: 'false'
            });

            // Agregar fecha de emisión si está disponible
            const fechaEmision = (document.getElementById('greInputFechaEmision')?.value || '').trim();
            if (fechaEmision) {
                params.append('fechaEmision', fechaEmision);
            }

            const resp = await fetch(`/api/guias-remision/consultar-sunat?${params.toString()}`);
            const result = await resp.json();

            if (resContenedor) resContenedor.classList.remove('d-none');

            const banner = document.getElementById('greEstadoBanner');
            const icon = document.getElementById('greEstadoIcon');
            const titulo = document.getElementById('greEstadoTitulo');
            const sub = document.getElementById('greEstadoSub');
            const badge = document.getElementById('greEstadoBadge');
            const cardDetalle = document.getElementById('greCardDetalleExtraido');

            if (result.ok && result.data) {
                const guia = result.data;
                window._greUltimaConsultaData = guia;

                // Estado: GUÍA RECIBIDA / AUTORIZADA
                if (banner) {
                    banner.className = 'alert alert-success d-flex align-items-center justify-content-between p-3 rounded-3 mb-3 border-success-subtle';
                }
                if (icon) icon.innerHTML = '<i class="bi bi-patch-check-fill text-success fs-3"></i>';
                if (titulo) {
                    titulo.textContent = 'Guía Recibida (Autorizada en SUNAT)';
                    titulo.className = 'fw-bold m-0 text-success';
                }
                if (sub) sub.textContent = `Emisión: ${guia.fecha_emision || 'Hoy'} | Traslado: ${guia.fecha_traslado || 'Hoy'}`;
                if (badge) {
                    badge.className = 'badge bg-success text-white px-3 py-2 rounded-pill fw-bold';
                    badge.innerHTML = '<i class="bi bi-check2-all me-1"></i>Válida en SUNAT';
                }

                if (cardDetalle) cardDetalle.classList.remove('d-none');

                // Rellenar Ficha Técnica
                const elNum = document.getElementById('greDetalleNumeroGuia');
                const elRem = document.getElementById('greResRemitente');
                const elDes = document.getElementById('greResDestinatario');
                const elPart = document.getElementById('greResPartida');
                const elLleg = document.getElementById('greResLlegada');
                const elPeso = document.getElementById('greResPeso');
                const elPlac = document.getElementById('greResPlacas');
                const elCond = document.getElementById('greResConductor');
                const tbody = document.getElementById('greResTbodyItems');

                if (elNum) elNum.textContent = `${guia.numero_guia || (serie + '-' + correlativo)}`;
                if (elRem) elRem.textContent = `${guia.remitente_razon_social || '—'} (RUC: ${guia.remitente_ruc || rucEmisor})`;
                if (elDes) elDes.textContent = `${guia.destinatario_razon_social || '—'} (RUC: ${guia.destinatario_ruc || '—'})`;
                if (elPart) elPart.textContent = `${guia.punto_partida_direccion || '—'} [Ubigeo: ${guia.punto_partida_ubigeo || '—'}]`;
                if (elLleg) elLleg.textContent = `${guia.punto_llegada_direccion || '—'} [Ubigeo: ${guia.punto_llegada_ubigeo || '—'}]`;
                
                const pesoNum = Number(guia.peso_bruto_total || 0);
                if (elPeso) elPeso.textContent = `${pesoNum.toLocaleString('es-PE', { minimumFractionDigits: 2 })} ${guia.unidad_medida || 'KGM'}`;
                if (elPlac) elPlac.textContent = `Tracto: ${guia.placa_tracto || '—'} | Carreta: ${guia.placa_carreta || '—'}`;
                if (elCond) elCond.textContent = `${guia.conductor_nombre || '—'} (${guia.conductor_tipo_doc || 'DNI'}: ${guia.conductor_num_doc || '—'})`;

                // Renderizar Ítems
                if (tbody) {
                    if (guia.items && guia.items.length > 0) {
                        tbody.innerHTML = guia.items.map(it => `
                            <tr>
                                <td class="font-monospace fw-bold text-primary">${it.codigo || '—'}</td>
                                <td class="fw-semibold text-dark">${it.descripcion || '—'}</td>
                                <td class="text-end font-monospace">${Number(it.cantidad || 1).toLocaleString()}</td>
                                <td class="text-center font-monospace">${it.unidad_medida || 'NIU'}</td>
                                <td class="text-end font-monospace">${Number(it.peso_unitario || 0).toFixed(2)}</td>
                            </tr>
                        `).join('');
                    } else {
                        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-2 text-muted">Sin desglose de ítems</td></tr>';
                    }
                }
            } else {
                // Estado: GUÍA NO EXISTE / NO ENCONTRADA
                window._greUltimaConsultaData = null;
                if (banner) {
                    banner.className = 'alert alert-danger d-flex align-items-center justify-content-between p-3 rounded-3 mb-3 border-danger-subtle';
                }
                if (icon) icon.innerHTML = '<i class="bi bi-x-circle-fill text-danger fs-3"></i>';
                if (titulo) {
                    titulo.textContent = 'Guía No Existe en SUNAT';
                    titulo.className = 'fw-bold m-0 text-danger';
                }
                if (sub) sub.textContent = result.error || 'El comprobante no fue encontrado en los padrones de SUNAT para este emisor.';
                if (badge) {
                    badge.className = 'badge bg-danger text-white px-3 py-2 rounded-pill fw-bold';
                    badge.innerHTML = '<i class="bi bi-exclamation-octagon me-1"></i>No Encontrada';
                }
                if (cardDetalle) cardDetalle.classList.add('d-none');

                // Si SUNAT sugiere registro manual, mostrar botón directo
                if (result.sugerencia === 'REGISTRO_MANUAL') {
                    if (sub) {
                        sub.innerHTML = (result.error || '') + 
                            '<br><a href="#" class="fw-bold text-primary mt-1 d-inline-block" onclick="window.greAbrirRegistroManual(); return false;">' +
                            '<i class="bi bi-pencil-square me-1"></i>Abrir Registro Manual de GRE</a>';
                    }
                }
            }
        } catch (err) {
            console.error("Error consultando SUNAT:", err);
            alert(`Error de red al consultar SUNAT: ${err.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-search"></i> Consultar en SUNAT';
            }
        }
    };

    // Guardar Guía Consultada en el ERP
    window.greGuardarGuiaConsultada = async function() {
        if (!window._greUltimaConsultaData) return;
        const btn = document.getElementById('greBtnGuardarErp');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…';
        }

        try {
            const guia = window._greUltimaConsultaData;
            const params = new URLSearchParams({
                numero: guia.numero_guia,
                rucEmisor: guia.remitente_ruc,
                tipoDoc: guia.tipo_documento,
                guardar: 'true'
            });

            const resp = await fetch(`/api/guias-remision/consultar-sunat?${params.toString()}`);
            const result = await resp.json();

            if (result.ok) {
                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta(`✓ Guía ${guia.numero_guia} guardada exitosamente en el historial del ERP.`, 'success');
                }
                const modalEl = document.getElementById('greModalConsultar');
                if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
                window.greLimpiarConsultaForm();
                await window.greCargarGuias();
            } else {
                alert(`Error al guardar: ${result.error || 'No se pudo guardar la guía'}`);
            }
        } catch (e) {
            console.error("Error al guardar guía:", e);
            alert("Error de conexión al registrar la guía.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Registrar en Historial del ERP';
            }
        }
    };

    // 6. Procesar Carga Masiva (Lote)
    window.greProcesarLote = async function() {
        const textarea = document.getElementById('greTextareaLote');
        const btn = document.getElementById('greBtnSubmitLote');
        if (!textarea || !textarea.value.trim()) {
            alert('Por favor ingrese al menos un número de guía.');
            return;
        }

        const lineas = textarea.value.split('\n').map(l => l.trim().toUpperCase()).filter(Boolean);
        if (lineas.length === 0) return;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Procesando ${lineas.length} guías...`;
        }

        let procesadas = 0;
        for (const num of lineas) {
            try {
                await fetch(`/api/guias-remision/consultar-sunat?numero=${encodeURIComponent(num)}&tipoDoc=31`);
                procesadas++;
            } catch (e) {
                console.warn(`Fallo al procesar guía ${num}:`, e);
            }
        }

        const modalEl = document.getElementById('greModalLote');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
        textarea.value = '';

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-play-circle-fill"></i> Procesar Lote de Guías';
        }

        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta(`✓ Se procesaron ${procesadas} de ${lineas.length} guías en lote.`, 'success');
        }
        await window.greCargarGuias();
    };

    // 7. Ver Detalle de Ítems
    window.greVerDetalleItems = function(idx) {
        const guia = window._greGuiasData[idx];
        if (!guia) return;

        const titulo = document.getElementById('greModalItemsTitulo');
        const sub = document.getElementById('greModalItemsSub');
        const tbody = document.getElementById('greModalItemsTbody');

        if (titulo) titulo.textContent = `Bienes Transportados - Guía ${guia.numero_guia}`;
        if (sub) sub.textContent = `Remitente: ${guia.remitente_razon_social} → Destino: ${guia.punto_llegada_direccion}`;

        if (tbody) {
            const items = guia.items || [];
            if (items.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No se registraron ítems individuales para esta guía.</td></tr>`;
            } else {
                tbody.innerHTML = items.map(it => `
                    <tr>
                        <td class="font-monospace fw-bold text-primary">${it.codigo || '—'}</td>
                        <td class="fw-semibold text-dark">${it.descripcion}</td>
                        <td class="text-end font-monospace fw-bold">${Number(it.cantidad || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                        <td class="text-center"><span class="badge bg-light text-dark border">${it.unidad_medida || 'NIU'}</span></td>
                        <td class="text-end font-monospace text-muted">${Number(it.peso_unitario || 0).toFixed(2)}</td>
                    </tr>
                `).join('');
            }
        }

        const modalEl = document.getElementById('greModalDetalleItems');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // 8. Guardar Configuración SUNAT
    window.greGuardarConfigSunat = async function(e) {
        if (e) e.preventDefault();

        const btn = document.getElementById('greBtnSaveConfig');
        const payload = {
            sunat_ruc_emisor: document.getElementById('greCfgRuc')?.value || '',
            sunat_client_id: document.getElementById('greCfgClientId')?.value || '',
            sunat_client_secret: document.getElementById('greCfgClientSecret')?.value || '',
            sunat_usuario_sol: document.getElementById('greCfgUsuarioSol')?.value || '',
            sunat_modo_entorno: document.getElementById('greCfgEntorno')?.value || 'produccion'
        };

        if (btn) btn.disabled = true;

        try {
            const resp = await fetch('/api/guias-remision/credenciales-sunat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const res = await resp.json();

            if (res.ok) {
                const modalEl = document.getElementById('greModalConfigSunat');
                if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta("✓ Credenciales de SUNAT guardadas exitosamente.", "success");
                }
            } else {
                alert(`Error: ${res.error || 'No se pudo guardar la configuración'}`);
            }
        } catch (err) {
            console.error("Error guardando credenciales:", err);
            alert(`Error de conexión: ${err.message}`);
        } finally {
            if (btn) btn.disabled = false;
        }
    };

    // 9. Eliminar Guía
    window.greEliminarGuia = async function(id) {
        if (!confirm('¿Está seguro de eliminar esta Guía de Remisión del sistema?')) return;

        try {
            const resp = await fetch(`/api/guias-remision/${id}`, { method: 'DELETE' });
            const res = await resp.json();
            if (res.ok) {
                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta("✓ Guía eliminada correctamente.", "info");
                }
                await window.greCargarGuias();
            } else {
                alert(`Error: ${res.error}`);
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    };

    // 10. Exportar a Excel
    window.greExportarExcel = function() {
        if (typeof XLSX === 'undefined') {
            alert('Librería SheetJS no disponible.');
            return;
        }

        if (!window._greGuiasData || window._greGuiasData.length === 0) {
            alert('No hay guías de remisión para exportar.');
            return;
        }

        const exportData = window._greGuiasData.map(g => ({
            "N° GUÍA": g.numero_guia,
            "ESTADO SUNAT": g.estado_sunat,
            "FECHA EMISIÓN": g.fecha_emision,
            "FECHA TRASLADO": g.fecha_traslado,
            "RUC REMITENTE": g.remitente_ruc,
            "REMITENTE": g.remitente_razon_social,
            "RUC DESTINATARIO": g.destinatario_ruc,
            "DESTINATARIO": g.destinatario_razon_social,
            "PUNTO PARTIDA": g.punto_partida_direccion,
            "PUNTO LLEGADA": g.punto_llegada_direccion,
            "PLACA TRACTO": g.placa_tracto,
            "PLACA CARRETA": g.placa_carreta,
            "CONDUCTOR": g.conductor_nombre,
            "LICENCIA": g.conductor_licencia,
            "PESO BRUTO (KGM)": Number(g.peso_bruto_total || 0),
            "TOTAL ÍTEMS": g.items ? g.items.length : 0
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Guias_Remision_SUNAT");
        XLSX.writeFile(wb, `Guias_Remision_SUNAT_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // =========================================================================
    // SECCIÓN GRT: EMISIÓN Y CONTROL DE GUÍA DE REMISIÓN TRANSPORTISTA (31)
    // =========================================================================
    window._grtListaGresDisponibles = [];

    // Abrir Modal de Emisión de GRT
    window.grtAbrirModalEmitir = async function(preselectGreId = null) {
        const modalEl = document.getElementById('grtModalEmitir');
        if (!modalEl) return;

        // Limpiar o resetear formulario
        const fEmision = document.getElementById('grtInputFechaEmision');
        const fTraslado = document.getElementById('grtInputFechaTraslado');
        const hoy = new Date().toISOString().slice(0, 10);
        if (fEmision) fEmision.value = hoy;
        if (fTraslado) fTraslado.value = hoy;

        // Listener para Switch de Modo Real vs Simulación
        const switchModo = document.getElementById('grtSwitchModoReal');
        const switchLbl = document.getElementById('grtSwitchModoLbl');
        if (switchModo && switchLbl) {
            switchModo.onchange = function() {
                if (switchModo.checked) {
                    switchLbl.textContent = "Modo SUNAT Oficial (Real)";
                    switchLbl.className = "form-check-label small fw-bold text-danger user-select-none";
                } else {
                    switchLbl.textContent = "Modo Simulación (Pruebas)";
                    switchLbl.className = "form-check-label small fw-bold text-dark user-select-none";
                }
            };
        }

        // Obtener siguiente correlativo sugerido
        try {
            const resp = await fetch('/api/guias-remision/siguiente-correlativo?serie=V001');
            const res = await resp.json();
            if (res.ok && res.correlativo) {
                const corrInput = document.getElementById('grtInputCorrelativo');
                if (corrInput) corrInput.value = res.correlativo;
            }
        } catch (e) {
            console.warn("No se pudo obtener correlativo sugerido:", e);
        }

        // Cargar GREs para buscador
        await window.grtCargarGresDisponibles();

        if (preselectGreId) {
            await window.grtSeleccionarGre(preselectGreId);
        }

        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // Emitir GRT directamente desde la fila de una GRE en la tabla
    window.grtEmitirDesdeGre = function(greId) {
        window.grtAbrirModalEmitir(greId);
    };

    // Cargar catálogo de GREs registradas para el buscador
    window.grtCargarGresDisponibles = async function() {
        try {
            const resp = await fetch('/api/guias-remision/buscar-gre');
            const res = await resp.json();
            if (res.ok) {
                window._grtListaGresDisponibles = res.data || [];
            }
        } catch (e) {
            console.warn("Error cargando GREs disponibles:", e);
        }
    };

    // Filtrar sugerencias de GRE al escribir
    window.grtFiltrarGreSugerencias = function() {
        const input = document.getElementById('grtInputBuscarGre');
        const listEl = document.getElementById('grtContenedorSugerenciasGre');
        if (!input || !listEl) return;

        const term = input.value.trim().toLowerCase();
        if (!term) {
            listEl.classList.add('d-none');
            return;
        }

        const matches = window._grtListaGresDisponibles.filter(g => 
            (g.numero_guia && g.numero_guia.toLowerCase().includes(term)) ||
            (g.remitente_razon_social && g.remitente_razon_social.toLowerCase().includes(term)) ||
            (g.remitente_ruc && g.remitente_ruc.includes(term))
        );

        if (matches.length === 0) {
            listEl.innerHTML = `<div class="list-group-item small text-muted">No se encontraron GRE registradas con ese término.</div>`;
            listEl.classList.remove('d-none');
            return;
        }

        let html = '';
        matches.slice(0, 8).forEach(g => {
            html += `
                <button type="button" class="list-group-item list-group-item-action py-2 px-3 text-start" onclick="window.grtSeleccionarGre(${g.id})">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <strong class="font-monospace text-primary">${g.numero_guia}</strong>
                        <span class="badge bg-light text-dark border font-monospace">${Number(g.peso_bruto_total || 0).toFixed(2)} ${g.unidad_medida || 'KGM'}</span>
                    </div>
                    <div class="small text-truncate text-dark fw-semibold">${g.remitente_razon_social || '—'}</div>
                    <div class="small text-truncate text-muted" style="font-size:0.72rem;">
                        <i class="bi bi-geo-alt text-success me-1"></i>${g.punto_partida_direccion || 'Origen'} &rarr; ${g.punto_llegada_direccion || 'Destino'}
                    </div>
                </button>
            `;
        });

        listEl.innerHTML = html;
        listEl.classList.remove('d-none');
    };

    // Seleccionar una GRE y precargar campos en la GRT
    window.grtSeleccionarGre = async function(greId) {
        const listEl = document.getElementById('grtContenedorSugerenciasGre');
        if (listEl) listEl.classList.add('d-none');

        const g = window._grtListaGresDisponibles.find(x => Number(x.id) === Number(greId)) ||
                  window._greGuiasData.find(x => Number(x.id) === Number(greId));

        if (!g) return;

        // 1. Vincular IDs
        const idVinculada = document.getElementById('grtGreIdVinculada');
        const numVinculada = document.getElementById('grtGreNumVinculada');
        const inputBuscar = document.getElementById('grtInputBuscarGre');
        if (idVinculada) idVinculada.value = g.id;
        if (numVinculada) numVinculada.value = `Vinculada: ${g.numero_guia}`;
        if (inputBuscar) inputBuscar.value = g.numero_guia;

        // 2. Precargar Remitente y Destinatario
        if (document.getElementById('grtInputRemitenteRuc')) document.getElementById('grtInputRemitenteRuc').value = g.remitente_ruc || '';
        if (document.getElementById('grtInputRemitenteRazon')) document.getElementById('grtInputRemitenteRazon').value = g.remitente_razon_social || '';
        if (document.getElementById('grtInputDestinatarioRuc')) document.getElementById('grtInputDestinatarioRuc').value = g.destinatario_ruc || '';
        if (document.getElementById('grtInputDestinatarioRazon')) document.getElementById('grtInputDestinatarioRazon').value = g.destinatario_razon_social || '';

        // 3. Precargar Ruta y Ubigeos
        if (document.getElementById('grtInputPartidaUbigeo')) document.getElementById('grtInputPartidaUbigeo').value = g.punto_partida_ubigeo || '150101';
        if (document.getElementById('grtInputPartidaDir')) document.getElementById('grtInputPartidaDir').value = g.punto_partida_direccion || '';
        if (document.getElementById('grtInputLlegadaUbigeo')) document.getElementById('grtInputLlegadaUbigeo').value = g.punto_llegada_ubigeo || '150101';
        if (document.getElementById('grtInputLlegadaDir')) document.getElementById('grtInputLlegadaDir').value = g.punto_llegada_direccion || '';

        // 4. Precargar Vehículo y Conductor si ya venían asignados
        if (g.placa_tracto && document.getElementById('grtInputPlacaTracto')) document.getElementById('grtInputPlacaTracto').value = g.placa_tracto;
        if (g.placa_carreta && document.getElementById('grtInputPlacaCarreta')) document.getElementById('grtInputPlacaCarreta').value = g.placa_carreta;
        if (g.conductor_num_doc && document.getElementById('grtInputCondDoc')) document.getElementById('grtInputCondDoc').value = g.conductor_num_doc;
        if (g.conductor_nombre && document.getElementById('grtInputCondNombre')) document.getElementById('grtInputCondNombre').value = g.conductor_nombre;
        if (g.conductor_licencia && document.getElementById('grtInputCondLicencia')) document.getElementById('grtInputCondLicencia').value = g.conductor_licencia;

        // 5. Precargar Carga y Peso
        if (document.getElementById('grtInputPesoTotal')) document.getElementById('grtInputPesoTotal').value = Number(g.peso_bruto_total || 0).toFixed(2);
        if (document.getElementById('grtSelectUnidadMedida')) document.getElementById('grtSelectUnidadMedida').value = g.unidad_medida || 'KGM';

        // 6. Precargar Ítems si existen en la GRE
        const tbodyItems = document.getElementById('grtTbodyItems');
        if (tbodyItems && g.items && g.items.length > 0) {
            tbodyItems.innerHTML = '';
            g.items.forEach(it => {
                tbodyItems.innerHTML += `
                    <tr>
                        <td><input type="text" class="form-control form-control-sm grt-it-codigo font-monospace" value="${it.codigo || '001'}"></td>
                        <td><input type="text" class="form-control form-control-sm grt-it-desc" value="${it.descripcion || 'MERCADERIA'}" required></td>
                        <td><input type="number" step="0.01" class="form-control form-control-sm grt-it-cant text-end font-monospace" value="${Number(it.cantidad || 1)}" required></td>
                        <td>
                            <select class="form-select form-select-sm grt-it-um text-center">
                                <option value="NIU" ${it.unidad_medida === 'NIU' ? 'selected' : ''}>NIU</option>
                                <option value="KGM" ${it.unidad_medida === 'KGM' ? 'selected' : ''}>KGM</option>
                                <option value="BX" ${it.unidad_medida === 'BX' ? 'selected' : ''}>CAJAS</option>
                            </select>
                        </td>
                        <td class="text-center">
                            <button type="button" class="btn btn-outline-danger btn-sm rounded-circle p-1" onclick="this.closest('tr').remove()">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta(`✓ Datos precargados desde la GRE ${g.numero_guia}`, "success");
        }
    };

    // Desvincular GRE
    window.grtDesvincularGre = function() {
        const idVinculada = document.getElementById('grtGreIdVinculada');
        const numVinculada = document.getElementById('grtGreNumVinculada');
        const inputBuscar = document.getElementById('grtInputBuscarGre');
        if (idVinculada) idVinculada.value = '';
        if (numVinculada) numVinculada.value = 'Ninguna vinculada';
        if (inputBuscar) inputBuscar.value = '';
    };

    // Agregar Fila de Ítem en Formulario GRT
    window.grtAgregarFilaItem = function() {
        const tbody = document.getElementById('grtTbodyItems');
        if (!tbody) return;
        const count = tbody.querySelectorAll('tr').length + 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="form-control form-control-sm grt-it-codigo font-monospace" value="${String(count).padStart(3, '0')}"></td>
            <td><input type="text" class="form-control form-control-sm grt-it-desc" placeholder="Descripción del bien transportado" required></td>
            <td><input type="number" step="0.01" class="form-control form-control-sm grt-it-cant text-end font-monospace" value="1" required></td>
            <td>
                <select class="form-select form-select-sm grt-it-um text-center">
                    <option value="NIU" selected>NIU</option>
                    <option value="KGM">KGM</option>
                    <option value="BX">CAJAS</option>
                </select>
            </td>
            <td class="text-center">
                <button type="button" class="btn btn-outline-danger btn-sm rounded-circle p-1" onclick="this.closest('tr').remove()">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    };

    // Ejecutar Emisión y Envío de GRT (Simulación o SUNAT Real)
    window.grtEjecutarEmision = async function(e) {
        if (e) e.preventDefault();

        const btn = document.getElementById('grtBtnSubmitEmision');
        const switchModo = document.getElementById('grtSwitchModoReal');
        const modo = (switchModo && switchModo.checked) ? 'PRODUCCION' : 'SIMULACION';

        // Recolectar ítems
        const items = [];
        document.querySelectorAll('#grtTbodyItems tr').forEach(tr => {
            const cod = tr.querySelector('.grt-it-codigo')?.value || '';
            const desc = tr.querySelector('.grt-it-desc')?.value || '';
            const cant = tr.querySelector('.grt-it-cant')?.value || 1;
            const um = tr.querySelector('.grt-it-um')?.value || 'NIU';
            if (desc.trim()) {
                items.push({ codigo: cod, descripcion: desc, cantidad: Number(cant), unidad_medida: um });
            }
        });

        const grtPayload = {
            serie: document.getElementById('grtInputSerie')?.value || 'V001',
            correlativo: document.getElementById('grtInputCorrelativo')?.value || null,
            fecha_emision: document.getElementById('grtInputFechaEmision')?.value,
            fecha_traslado: document.getElementById('grtInputFechaTraslado')?.value,
            motivo_traslado: document.getElementById('grtSelectMotivo')?.value || '01',
            gre_relacionada_id: document.getElementById('grtGreIdVinculada')?.value || null,
            gre_relacionada_numero: document.getElementById('grtGreNumVinculada')?.value.replace('Vinculada: ', '') || null,
            remitente_ruc: document.getElementById('grtInputRemitenteRuc')?.value,
            remitente_razon_social: document.getElementById('grtInputRemitenteRazon')?.value,
            destinatario_ruc: document.getElementById('grtInputDestinatarioRuc')?.value,
            destinatario_razon_social: document.getElementById('grtInputDestinatarioRazon')?.value,
            punto_partida_ubigeo: document.getElementById('grtInputPartidaUbigeo')?.value,
            punto_partida_direccion: document.getElementById('grtInputPartidaDir')?.value,
            punto_llegada_ubigeo: document.getElementById('grtInputLlegadaUbigeo')?.value,
            punto_llegada_direccion: document.getElementById('grtInputLlegadaDir')?.value,
            placa_tracto: document.getElementById('grtInputPlacaTracto')?.value,
            placa_carreta: document.getElementById('grtInputPlacaCarreta')?.value,
            conductor_tipo_doc: 'DNI',
            conductor_num_doc: document.getElementById('grtInputCondDoc')?.value,
            conductor_nombre: document.getElementById('grtInputCondNombre')?.value,
            conductor_licencia: document.getElementById('grtInputCondLicencia')?.value,
            peso_bruto_total: Number(document.getElementById('grtInputPesoTotal')?.value || 0),
            unidad_medida: document.getElementById('grtSelectUnidadMedida')?.value || 'KGM',
            modo_emision: modo,
            items
        };

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${modo === 'SIMULACION' ? 'Simulando Emisión...' : 'Enviando a SUNAT...'}`;
        }

        try {
            const resp = await fetch('/api/guias-remision/emitir-grt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(grtPayload)
            });

            const res = await resp.json();

            if (res.ok) {
                const modalEl = document.getElementById('grtModalEmitir');
                if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta(`✓ ${res.message} Ticket: ${res.num_ticket || 'OK'}`, "success");
                } else {
                    alert(`${res.message}\nTicket SUNAT: ${res.num_ticket || 'OK'}`);
                }

                // Recargar tabla de guías
                await window.greCargarGuias();
            } else {
                alert(`Error al emitir GRT: ${res.error || 'Fallo desconocido'}`);
            }
        } catch (err) {
            console.error("Error en emisión GRT:", err);
            alert(`Error de conexión: ${err.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="bi bi-send-fill"></i> Emitir y Despachar a SUNAT`;
            }
        }
    };

    // Consultar Ticket de GRT en SUNAT
    window.grtConsultarTicket = async function(guiaId) {
        try {
            const resp = await fetch(`/api/guias-remision/consultar-ticket/${guiaId}`);
            const res = await resp.json();
            if (res.ok) {
                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta("✓ Estado de ticket actualizado.", "info");
                }
                await window.greCargarGuias();
            } else {
                alert(`Error consultando ticket: ${res.error}`);
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    };

    // ── Registro Manual de GRE ──
    window.greAbrirRegistroManual = function() {
        // Pre-llenar con datos de la última consulta si existen
        const modalConsultar = document.getElementById('greModalConsultar');
        if (modalConsultar) {
            const instance = bootstrap.Modal.getInstance(modalConsultar);
            if (instance) instance.hide();
        }

        const serie = (document.getElementById('greInputSerie')?.value || '').trim().toUpperCase();
        const correlativo = (document.getElementById('greInputCorrelativo')?.value || '').trim();
        const ruc = (document.getElementById('greInputRucEmisor')?.value || '').trim();
        const fechaEmi = (document.getElementById('greInputFechaEmision')?.value || '').trim();

        setTimeout(() => {
            const numGuia = (serie && correlativo) ? `${serie}-${correlativo.padStart(8, '0')}` : '';
            if (document.getElementById('greManualNumGuia')) document.getElementById('greManualNumGuia').value = numGuia;
            if (document.getElementById('greManualRucRemitente')) document.getElementById('greManualRucRemitente').value = ruc;
            if (document.getElementById('greManualFechaEmision')) document.getElementById('greManualFechaEmision').value = fechaEmi || new Date().toISOString().slice(0, 10);

            const modalManual = document.getElementById('greModalRegistroManual');
            if (modalManual) bootstrap.Modal.getOrCreateInstance(modalManual).show();
        }, 350);
    };

    window.greSubmitRegistroManual = async function(e) {
        if (e) e.preventDefault();
        const btn = document.getElementById('greBtnSubmitManual');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Registrando…';
        }

        try {
            const payload = {
                numero_guia: (document.getElementById('greManualNumGuia')?.value || '').trim().toUpperCase(),
                tipo_documento: document.getElementById('greManualTipoDoc')?.value || '09',
                fecha_emision: document.getElementById('greManualFechaEmision')?.value || '',
                fecha_traslado: document.getElementById('greManualFechaTraslado')?.value || '',
                remitente_ruc: (document.getElementById('greManualRucRemitente')?.value || '').trim(),
                remitente_razon_social: (document.getElementById('greManualRazonRemitente')?.value || '').trim(),
                destinatario_ruc: (document.getElementById('greManualRucDest')?.value || '').trim(),
                destinatario_razon_social: (document.getElementById('greManualRazonDest')?.value || '').trim(),
                peso_bruto_total: parseFloat(document.getElementById('greManualPeso')?.value || '0'),
                punto_partida_direccion: (document.getElementById('greManualPartida')?.value || '').trim(),
                punto_llegada_direccion: (document.getElementById('greManualLlegada')?.value || '').trim(),
                placa_tracto: (document.getElementById('greManualPlacaTracto')?.value || '').trim().toUpperCase(),
                placa_carreta: (document.getElementById('greManualPlacaCarreta')?.value || '').trim().toUpperCase(),
                conductor_num_doc: (document.getElementById('greManualDniConductor')?.value || '').trim(),
                conductor_nombre: (document.getElementById('greManualNombreConductor')?.value || '').trim(),
                observaciones: (document.getElementById('greManualObservaciones')?.value || '').trim()
            };

            if (!payload.numero_guia || !payload.remitente_ruc) {
                alert('Número de guía y RUC del remitente son obligatorios.');
                return;
            }

            const resp = await fetch('/api/guias-remision/registrar-gre-manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await resp.json();

            if (result.ok) {
                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta(`✓ ${result.message}`, 'success');
                } else {
                    alert(result.message);
                }
                const modalManual = document.getElementById('greModalRegistroManual');
                if (modalManual) bootstrap.Modal.getInstance(modalManual)?.hide();

                // Limpiar formulario
                document.getElementById('greFormRegistroManual')?.reset();

                await window.greCargarGuias();
            } else {
                alert(`Error: ${result.error}`);
            }
        } catch (err) {
            console.error("Error en registro manual GRE:", err);
            alert(`Error de conexión: ${err.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Registrar GRE en el ERP';
            }
        }
    };

    // Auto-inicializar
    window.inicializarModuloGuiasRemision();
})();
