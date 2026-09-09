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
        
        const formatFechaPeru = (fechaStr) => {
            if (!fechaStr) return '—';
            const s = String(fechaStr).trim();
            if (!s || s === '—' || s === 'null' || s === 'undefined') return '—';
            const datePart = s.split('T')[0];
            if (datePart.includes('-')) {
                const parts = datePart.split('-');
                if (parts.length === 3) {
                    const [y, m, d] = parts;
                    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
                }
            }
            return datePart;
        };
        window._formatFechaPeru = formatFechaPeru;
        
        const fDesde = document.getElementById('gre-filter-desde');
        const fHasta = document.getElementById('gre-filter-hasta');
        if (fDesde && !fDesde.value) fDesde.value = formatYMD(primerDia);
        if (fHasta && !fHasta.value) fHasta.value = formatYMD(hoy);

        // Configurar Drag and Drop y limpieza para el Modal de XML
        const modalConsultar = document.getElementById('greModalConsultar');
        const overlay = document.getElementById('greDropzoneOverlay');
        if (modalConsultar) {
            modalConsultar.addEventListener('hidden.bs.modal', () => {
                if (typeof window.greLimpiarYSubirOtroXml === 'function') {
                    window.greLimpiarYSubirOtroXml();
                }
            });

            ['dragenter', 'dragover'].forEach(ev => {
                modalConsultar.addEventListener(ev, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (overlay) overlay.classList.remove('d-none');
                }, false);
            });

            ['dragleave'].forEach(ev => {
                modalConsultar.addEventListener(ev, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (overlay) overlay.classList.add('d-none');
                }, false);
            });

            modalConsultar.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (overlay) overlay.classList.add('d-none');
                const dt = e.dataTransfer;
                if (dt && dt.files && dt.files.length > 0) {
                    window.greHandleXmlFileUpload(dt.files);
                }
            }, false);
        }

        // Aplicar modo activo (GRE o GRT)
        const modoGuardado = window._greModoActivo || sessionStorage.getItem('gre_modo_activo') || 'GRE';
        window.greCambiarModoVista(modoGuardado, false);

        await window.greCargarGuias();
    };

    // Cambiar dinámicamente entre modo GRE (Remitente 09) y GRT (Transportista 31)
    window.greCambiarModoVista = function(modo, recargar = true) {
        window._greModoActivo = (modo === 'GRT') ? 'GRT' : 'GRE';
        try { sessionStorage.setItem('gre_modo_activo', window._greModoActivo); } catch(e) {}

        const isGRT = window._greModoActivo === 'GRT';
        const tituloEl = document.getElementById('greTituloModulo');
        const subtituloEl = document.getElementById('greSubtituloModulo');
        const badgeEl = document.getElementById('greBadgeSubtipo');
        const iconEl = document.getElementById('greHeaderIcon');
        const iconWrap = document.getElementById('greHeaderIconWrap');
        const tituloTablaCard = document.getElementById('greTituloTablaCard');

        // Botones de acción contextuales en el header
        const btnEmitirGrt = document.getElementById('greBtnEmitirGrt');
        const btnSubirXml = document.getElementById('greBtnSubirXmlSunat');
        const btnCargaLote = document.getElementById('greBtnCargaLote');

        if (isGRT) {
            if (tituloEl) tituloEl.textContent = 'Guía de Remisión de Transportista (GRT)';
            if (subtituloEl) subtituloEl.textContent = 'Emisión propia de GRT, asignación de tracto, carreta, conductor y despacho SUNAT';
            if (badgeEl) {
                badgeEl.className = 'badge bg-warning bg-opacity-10 text-warning border px-2.5 py-1 rounded-pill small fw-bold';
                badgeEl.innerHTML = '<i class="bi bi-truck-flatbed me-1"></i>SUNAT GRT (Transportista)';
            }
            if (iconEl) iconEl.className = 'bi bi-truck-flatbed fs-4';
            if (iconWrap) {
                iconWrap.style.background = 'rgba(245, 158, 11, 0.15)';
                iconWrap.style.color = '#d97706';
            }
            if (tituloTablaCard) tituloTablaCard.textContent = 'Historial de Guías de Remisión de Transportista (GRT)';

            // En GRT NO deben salir las opciones de XML ni Carga masiva de GRE
            if (btnEmitirGrt) btnEmitirGrt.style.display = 'inline-flex';
            if (btnSubirXml) btnSubirXml.style.display = 'none';
            if (btnCargaLote) btnCargaLote.style.display = 'none';

            window._greTipoFiltro = '31';
        } else {
            if (tituloEl) tituloEl.textContent = 'Guía de Remisión Electrónica (GRE)';
            if (subtituloEl) subtituloEl.textContent = 'Recepción, consulta de XML SUNAT y validación de carga del cliente';
            if (badgeEl) {
                badgeEl.className = 'badge bg-info bg-opacity-10 text-info border px-2.5 py-1 rounded-pill small fw-bold';
                badgeEl.innerHTML = '<i class="bi bi-shield-check me-1"></i>SUNAT GRE (Remitente)';
            }
            if (iconEl) iconEl.className = 'bi bi-file-earmark-arrow-up-fill fs-4';
            if (iconWrap) {
                iconWrap.style.background = 'rgba(14, 165, 233, 0.12)';
                iconWrap.style.color = '#0284c7';
            }
            if (tituloTablaCard) tituloTablaCard.textContent = 'Historial de Guías de Remisión Electrónica (GRE)';

            // En GRE mostramos Subir XML y Carga Masiva; ocultamos Emitir GRT del encabezado
            if (btnEmitirGrt) btnEmitirGrt.style.display = 'none';
            if (btnSubirXml) btnSubirXml.style.display = 'inline-flex';
            if (btnCargaLote) btnCargaLote.style.display = 'inline-flex';

            window._greTipoFiltro = '09';
        }

        if (recargar) {
            window.greCargarGuias();
        }
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

        window._greTipoFiltro = (window._greModoActivo === 'GRT') ? '31' : '09';
        window.greCargarGuias();
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

            const fEmi = (window._formatFechaPeru || formatFechaPeru)(g.fecha_emision);
            const hEmi = (g.hora_emision && String(g.hora_emision).trim()) 
                ? ` <span class="text-muted opacity-75" style="font-size:0.7rem;"><i class="bi bi-clock me-0.5"></i>${esc(g.hora_emision)}</span>` 
                : '';
            const fTras = (window._formatFechaPeru || formatFechaPeru)(g.fecha_traslado || g.fecha_emision);

            html += `
                <tr>
                    <td class="font-monospace fw-bold text-nowrap" style="color:#0052cc; cursor:pointer;" onclick="window.greVerDetalleSunatPorIndice(${idx})" title="Ver Detalle Oficial de GRE SUNAT">
                        <i class="bi bi-file-earmark-text me-1"></i>${esc(g.numero_guia)}
                    </td>
                    <td class="text-nowrap">${badgeEstado}</td>
                    <td class="text-nowrap font-monospace fw-semibold text-dark">
                        ${fEmi}${hEmi}
                    </td>
                    <td class="text-nowrap font-monospace text-secondary">
                        ${fTras}
                    </td>
                    <td>
                        <span class="gre-cell-clip fw-semibold text-dark" style="max-width: 170px;" title="${esc(g.remitente_razon_social)}">
                            ${esc(g.remitente_razon_social)}
                        </span>
                    </td>
                    <td>
                        <span class="gre-cell-clip text-dark" style="max-width: 170px;" title="${esc(g.destinatario_razon_social)}">
                            ${esc(g.destinatario_razon_social)}
                        </span>
                    </td>
                    <td>
                        <span class="gre-cell-clip text-muted" style="max-width: 160px;" title="${esc(g.punto_partida_direccion)}">
                            <i class="bi bi-geo-alt text-success me-1"></i>${esc(g.punto_partida_direccion)}
                        </span>
                    </td>
                    <td>
                        <span class="gre-cell-clip text-muted" style="max-width: 160px;" title="${esc(g.punto_llegada_direccion)}">
                            <i class="bi bi-geo-alt-fill text-danger me-1"></i>${esc(g.punto_llegada_direccion)}
                        </span>
                    </td>
                    <td class="text-center font-monospace fw-bold text-dark text-nowrap">
                        ${esc(g.placa_tracto || '—')}
                    </td>
                    <td class="text-center font-monospace fw-semibold text-secondary text-nowrap">
                        ${esc(g.placa_carreta || '—')}
                    </td>
                    <td>
                        <span class="gre-cell-clip fw-semibold text-dark" style="max-width: 150px;" title="${esc(g.conductor_nombre)}">
                            <i class="bi bi-person-fill text-primary me-1"></i>${esc(g.conductor_nombre || '—')}
                        </span>
                    </td>
                    <td class="text-end font-monospace fw-bold text-dark text-nowrap">
                        ${pesoKg.toLocaleString('es-PE', { minimumFractionDigits: 2 })} ${esc(g.unidad_medida || 'KGM')}
                    </td>
                    <td class="text-center text-nowrap">
                        <button class="btn btn-outline-info btn-sm rounded-pill py-0 px-2 fw-semibold" style="font-size:0.72rem; line-height: 1.5;" onclick="window.greVerDetalleItems(${idx})">
                            <i class="bi bi-box-seam me-1"></i>${g.items ? g.items.length : 0} ítems
                        </button>
                    </td>
                    <td class="text-center text-nowrap">
                        <div class="d-inline-flex align-items-center gap-1">
                            ${(g.tipo_documento === '09' || (g.numero_guia && (g.numero_guia.startsWith('T') || g.numero_guia.startsWith('09')))) ? `
                                <button class="btn btn-warning btn-sm rounded-pill py-0 px-2 fw-bold text-dark d-flex align-items-center gap-1 shadow-2xs" style="font-size:0.7rem; line-height: 1.5;" onclick="window.grtEmitirDesdeGre(${g.id})" title="Emitir GRT Transportista a partir de esta GRE">
                                    <i class="bi bi-truck-flatbed"></i> Emitir GRT
                                </button>
                            ` : (g.num_ticket ? `
                                <button class="btn btn-outline-primary btn-sm rounded-pill py-0 px-2 fw-semibold" style="font-size:0.7rem; line-height: 1.5;" onclick="window.grtConsultarTicket(${g.id})" title="Consultar Ticket SUNAT">
                                    <i class="bi bi-arrow-repeat"></i> Ticket
                                </button>
                            ` : '')}
                            <button class="btn btn-outline-danger btn-sm rounded-circle p-1" style="line-height: 1;" onclick="window.greEliminarGuia(${g.id})" title="Eliminar guía">
                                <i class="bi bi-trash" style="font-size:0.75rem;"></i>
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
        if (typeof window.greLimpiarYSubirOtroXml === 'function') {
            window.greLimpiarYSubirOtroXml();
        }
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

    // ══════════════════════════════════════════════════════════
    // 5. SUBIR XML DE SUNAT, PARSEAR Y VISOR OFICIAL DE GRE
    // ══════════════════════════════════════════════════════════
    window._greUltimaConsultaData = null;

    // Manejar selección o arrastre de archivo XML
    window.greHandleXmlFileUpload = function(files) {
        if (!files || files.length === 0) return;
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.xml')) {
            alert('Por favor seleccione un archivo con formato XML válido descargado de SUNAT (.xml).');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const xmlText = e.target.result;
            window.greProcesarContenidoXml(xmlText);
        };
        reader.onerror = function() {
            alert('No se pudo leer el archivo seleccionado.');
        };
        reader.readAsText(file);
    };

    // Parser UBL 2.1 del lado cliente (Instantáneo y 100% fiel a SUNAT)
    function parseUblXmlClient(xmlStr) {
        if (!xmlStr || typeof xmlStr !== 'string') return null;

        const getVal = (tag, str) => {
            if (!str) return '';
            const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, 'i');
            const m = str.match(regex);
            return m ? m[1].trim() : '';
        };

        const getAttr = (tag, attr, str) => {
            if (!str) return '';
            const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*\\s+${attr}=["']([^"']+)["'][^>]*>`, 'i');
            const m = str.match(regex);
            return m ? m[1].trim() : '';
        };

        const rawNumeroGuia = getVal('ID', xmlStr);
        let numero_guia = rawNumeroGuia;
        if (rawNumeroGuia && rawNumeroGuia.includes('-')) {
            const parts = rawNumeroGuia.split('-');
            const serie = parts[0].trim().toUpperCase();
            let correlativo = parts[1].trim();
            if (/^\d+$/.test(correlativo)) {
                correlativo = correlativo.padStart(8, '0');
            }
            numero_guia = `${serie}-${correlativo}`;
        }
        const fecha_emision = getVal('IssueDate', xmlStr);
        const hora_emision = getVal('IssueTime', xmlStr);
        const tipo_documento = getVal('DespatchAdviceTypeCode', xmlStr) || '09';

        // Emisor / Remitente
        const mEmisor = xmlStr.match(/<(?:\w+:)?DespatchSupplierParty[\s\S]*?<\/(?:\w+:)?DespatchSupplierParty>/i);
        const emisorBloque = mEmisor ? mEmisor[0] : '';
        const remitente_ruc = getVal('ID', emisorBloque);
        const remitente_razon_social = getVal('RegistrationName', emisorBloque);

        // Destinatario
        const mDest = xmlStr.match(/<(?:\w+:)?DeliveryCustomerParty[\s\S]*?<\/(?:\w+:)?DeliveryCustomerParty>/i);
        const destBloque = mDest ? mDest[0] : '';
        const destinatario_ruc = getVal('ID', destBloque);
        const destinatario_razon_social = getVal('RegistrationName', destBloque);

        // Shipment / Datos de Traslado
        const mShip = xmlStr.match(/<(?:\w+:)?Shipment[\s\S]*?<\/(?:\w+:)?Shipment>/i);
        const shipBloque = mShip ? mShip[0] : '';
        const motivo_traslado = getVal('HandlingCode', shipBloque) || '01';
        const descripcion_motivo = getVal('Information', shipBloque) || 'VENTA';
        const peso_bruto_total = parseFloat(getVal('GrossWeightMeasure', shipBloque) || 0);
        const unidad_medida = getAttr('GrossWeightMeasure', 'unitCode', shipBloque) || 'KGM';

        // Transportista / Carrier
        const mCarrier = shipBloque.match(/<(?:\w+:)?CarrierParty[\s\S]*?<\/(?:\w+:)?CarrierParty>/i);
        const carBloque = mCarrier ? mCarrier[0] : '';
        const transportista_ruc = getVal('ID', carBloque);
        const transportista_razon_social = getVal('RegistrationName', carBloque);
        const registro_mtc = getVal('CompanyID', carBloque);

        // Partida (OriginAddress o DespatchAddress)
        const mPartida = (shipBloque || xmlStr).match(/<(?:\w+:)?(?:OriginAddress|DespatchAddress)[\s\S]*?<\/(?:\w+:)?(?:OriginAddress|DespatchAddress)>/i);
        const partBloque = mPartida ? mPartida[0] : '';
        const punto_partida_ubigeo = getVal('ID', partBloque);
        const punto_partida_direccion = getVal('Line', partBloque) || getVal('StreetName', partBloque) || '';

        // Llegada (DeliveryAddress)
        const mLlegada = (shipBloque || xmlStr).match(/<(?:\w+:)?DeliveryAddress[\s\S]*?<\/(?:\w+:)?DeliveryAddress>/i);
        const llegBloque = mLlegada ? mLlegada[0] : '';
        const punto_llegada_ubigeo = getVal('ID', llegBloque);
        const punto_llegada_direccion = getVal('Line', llegBloque) || getVal('StreetName', llegBloque) || '';

        // Etapa de transporte / Fecha inicio
        const mStage = (shipBloque || xmlStr).match(/<(?:\w+:)?ShipmentStage[\s\S]*?<\/(?:\w+:)?ShipmentStage>/i);
        const stageBloque = mStage ? mStage[0] : '';
        const fecha_traslado = getVal('StartDate', stageBloque) || fecha_emision;
        const modalidadCode = getVal('TransportModeCode', stageBloque);
        const modalidad_traslado = modalidadCode === '02' ? 'Privado' : 'Público';

        // Limpiar comentarios XML y CDATA redundantes para análisis seguro
        const cleanXml = xmlStr.replace(/<!--[\s\S]*?-->/g, '');

        // 🚗 VEHÍCULOS (RoadTransport, TransportMeans, AttachedTransportMeans, TransportEquipment)
        let placa_tracto = '';
        let placa_carreta = '';
        let tuce = '';
        let autorizacion_mtc = '';

        // Buscar bloques explícitos RoadTransport o TransportMeans (Vehículo Principal)
        const mRoad = cleanXml.match(/<(?:\w+:)?RoadTransport[\s\S]*?<\/(?:\w+:)?RoadTransport>/i)
            || cleanXml.match(/<(?:\w+:)?TransportMeans[\s\S]*?<\/(?:\w+:)?TransportMeans>/i);
        if (mRoad) {
            placa_tracto = getVal('LicensePlateID', mRoad[0]) || getVal('ID', mRoad[0]);
        }

        // Buscar bloques AttachedTransportMeans o TransportEquipment (Vehículo Secundario / Carreta)
        const mEquip = cleanXml.match(/<(?:\w+:)?(?:AttachedTransportMeans|TransportEquipment)[\s\S]*?<\/(?:\w+:)?(?:AttachedTransportMeans|TransportEquipment)>/i);
        if (mEquip) {
            const val = getVal('LicensePlateID', mEquip[0]) || getVal('ID', mEquip[0]);
            if (val) placa_carreta = val;
        }

        // Si no se asignó placa principal pero hay LicensePlateID en el XML
        if (!placa_tracto) {
            const plateMatches = [...cleanXml.matchAll(/<(?:\w+:)?LicensePlateID[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:\w+:)?LicensePlateID>/gi)]
                .map(m => m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim().toUpperCase())
                .filter(p => p.length >= 4 && p.length <= 12 && !p.includes('<'));

            if (plateMatches.length > 0) {
                placa_tracto = plateMatches[0];
                if (plateMatches.length > 1 && !placa_carreta) {
                    placa_carreta = plateMatches[1];
                }
            }
        }

        // Si la placa secundaria quedó igual a la principal, se limpia
        if (placa_carreta === placa_tracto) {
            placa_carreta = '';
        }

        // TUCE o Certificado de Habilitación Vehicular
        const mTuce = cleanXml.match(/<(?:\w+:)?(?:ApplicableTransportMeans|RoadTransport|ShipmentStage)[\s\S]*?<(?:\w+:)?(?:CertificateID|RegistrationID|LicenseNumberID)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:\w+:)?(?:CertificateID|RegistrationID|LicenseNumberID)>/i)
            || cleanXml.match(/15M\w+/i);
        if (mTuce) {
            tuce = (mTuce[1] || mTuce[0]).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        }

        // Autorización Especial MTC
        const mMtcAut = cleanXml.match(/<(?:\w+:)?(?:SpecialAuthorizationID|AuthorizationID)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:\w+:)?(?:SpecialAuthorizationID|AuthorizationID)>/i)
            || cleanXml.match(/1520\d+/i);
        if (mMtcAut) {
            autorizacion_mtc = (mMtcAut[1] || mMtcAut[0]).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        }

        // 👤 CONDUCTORES (DriverPerson)
        const mDriver = cleanXml.match(/<(?:\w+:)?DriverPerson[\s\S]*?<\/(?:\w+:)?DriverPerson>/i);
        const driverBloque = mDriver ? mDriver[0] : '';
        
        let conductor_num_doc = getVal('ID', driverBloque).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        // Si no viene en DriverPerson buscar por DNI de 8 dígitos
        if (!conductor_num_doc || conductor_num_doc.length < 8) {
            const mDni = cleanXml.match(/<(?:\w+:)?ID[^>]*schemeID=["']1["'][^>]*>(?:<!\[CDATA\[)?(\d{8})(?:\]\]>)?<\//i)
                || cleanXml.match(/\b(7\d{7}|4\d{7}|0\d{7}|1\d{7}|2\d{7})\b/);
            if (mDni) conductor_num_doc = (mDni[1] || mDni[0]).trim();
        }
        
        let firstName = getVal('FirstName', driverBloque).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        let familyName = getVal('FamilyName', driverBloque).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        let conductor_nombre = '';
        if (firstName && familyName) {
            const fNorm = firstName.toLowerCase();
            const famNorm = familyName.toLowerCase();
            if (fNorm === famNorm || fNorm.includes(famNorm)) {
                conductor_nombre = firstName;
            } else if (famNorm.includes(fNorm)) {
                conductor_nombre = familyName;
            } else {
                conductor_nombre = `${firstName} ${familyName}`;
            }
        } else {
            conductor_nombre = (firstName || familyName || getVal('Name', driverBloque) || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        }

        // Limpiar duplicaciones de palabras idénticas en el nombre completo (ej: "HUAMANI QUISPE ORLANDO HUAMANI QUISPE ORLANDO")
        if (conductor_nombre) {
            const words = conductor_nombre.split(/\s+/).filter(Boolean);
            const half = Math.floor(words.length / 2);
            if (half >= 2 && words.slice(0, half).join(' ') === words.slice(half).join(' ')) {
                conductor_nombre = words.slice(0, half).join(' ');
            }
        }

        // Licencia de Conducir (IdentityDocumentReference o ID dentro de DriverPerson)
        let conductor_licencia = '';
        const mLicBlock = driverBloque.match(/<(?:\w+:)?IdentityDocumentReference[\s\S]*?<\/(?:\w+:)?IdentityDocumentReference>/i);
        if (mLicBlock) {
            conductor_licencia = getVal('ID', mLicBlock[0]).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        }
        if (!conductor_licencia) {
            // Regex directo para capturar licencias peruanas estándar (ej: Q73815086, Z73815086)
            const mLicMatch = cleanXml.match(/<(?:\w+:)?ID[^>]*>(?:<!\[CDATA\[)?([A-Z]\d{8})(?:\]\]>)?<\/(?:\w+:)?ID>/i)
                || cleanXml.match(/\b([A-Z]\d{8})\b/i);
            if (mLicMatch) {
                conductor_licencia = mLicMatch[1].trim().toUpperCase();
            }
        }
        // Limpiar cualquier residuo de etiqueta o CDATA
        conductor_licencia = conductor_licencia.replace(/<[^>]*>|<!\[CDATA\[|\]\]>/g, '').trim();

        // Observaciones / Note
        const observaciones = getVal('Note', cleanXml);

        // Ítems de la Guía
        const itemRegex = /<(?:\w+:)?DespatchLine[\s\S]*?<\/(?:\w+:)?DespatchLine>/gi;
        const items = [];
        let match;
        while ((match = itemRegex.exec(cleanXml)) !== null) {
            const itStr = match[0];
            const num = parseInt(getVal('ID', itStr), 10) || (items.length + 1);
            const cant = parseFloat(getVal('DeliveredQuantity', itStr) || 1);
            const uMed = getAttr('DeliveredQuantity', 'unitCode', itStr) || 'NIU';
            const desc = getVal('Description', itStr) || getVal('Name', itStr);
            
            const mSell = itStr.match(/<(?:\w+:)?SellersItemIdentification[\s\S]*?<\/(?:\w+:)?SellersItemIdentification>/i);
            const codBien = mSell ? getVal('ID', mSell[0]) : '';

            const mComm = itStr.match(/<(?:\w+:)?CommodityClassification[\s\S]*?<\/(?:\w+:)?CommodityClassification>/i);
            const codSunat = mComm ? getVal('ItemClassificationCode', mComm[0]) : '';

            items.push({
                item_numero: num,
                bien_normalizado: 'NO',
                codigo_bien: codBien,
                codigo_sunat: codSunat,
                codigo_gtin: '',
                codigo_subpartida: '',
                codigo: codBien || `ITM-${num}`,
                descripcion: desc,
                unidad_medida: uMed,
                cantidad: cant,
                peso_unitario: 0
            });
        }

        // Hash digital (DigestValue) para QR oficial SUNAT
        const mDigest = xmlStr.match(/<(?:\w+:)?DigestValue[^>]*>([\s\S]*?)<\/(?:\w+:)?DigestValue>/i);
        const xml_hash = mDigest ? mDigest[1].trim() : '';

        return {
            numero_guia,
            tipo_documento,
            fecha_emision,
            hora_emision,
            fecha_traslado,
            remitente_ruc,
            remitente_razon_social,
            destinatario_ruc,
            destinatario_razon_social,
            motivo_traslado,
            descripcion_motivo,
            peso_bruto_total,
            unidad_medida,
            modalidad_traslado,
            transportista_ruc,
            transportista_razon_social,
            registro_mtc,
            punto_partida_ubigeo,
            punto_partida_direccion,
            punto_llegada_ubigeo,
            punto_llegada_direccion,
            placa_tracto,
            placa_carreta,
            tuce,
            autorizacion_mtc,
            conductor_nombre,
            conductor_num_doc,
            conductor_licencia,
            xml_hash,
            observaciones_sunat: observaciones || 'Esta es una representación impresa sin valor tributario de la Guía de Remisión Electrónica, generada en el sistema de la SUNAT. Puede verificarla utilizando su clave SOL.',
            items
        };
    }

    // Procesar contenido XML (vía cliente y confirmación con backend)
    window.greProcesarContenidoXml = async function(xmlText) {
        if (!xmlText || typeof xmlText !== 'string' || !xmlText.trim()) {
            alert('El contenido XML está vacío.');
            return;
        }

        let guia = parseUblXmlClient(xmlText);

        // Si el parser cliente no extrajo número de guía, intentar con backend
        if (!guia || !guia.numero_guia) {
            try {
                const resp = await fetch('/api/guias-remision/parse-xml', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ xml_contenido: xmlText })
                });
                const resJson = await resp.json();
                if (resJson.ok && resJson.data) {
                    guia = resJson.data;
                }
            } catch (err) {
                console.warn("Fallo parser de backend:", err);
            }
        }

        if (!guia || !guia.numero_guia) {
            alert('No se pudo identificar una Guía de Remisión Electrónica válida (UBL 2.1 DespatchAdvice) en el archivo proporcionado.');
            return;
        }

        guia.xml_contenido = xmlText;
        window._greUltimaConsultaData = guia;

        // Renderizar en el Visor Oficial estilo SUNAT
        window.greRenderizarDetalleSunat(guia);
    };

    // Renderizar Ficha Técnica Oficial estilo SUNAT (Imágenes 2 y 3)
    window.greRenderizarDetalleSunat = function(guia) {
        if (!guia) return;

        // Mostrar sección del Visor y ocultar upload
        const seccionUpload = document.getElementById('greSeccionUploadXml');
        const seccionVisor = document.getElementById('greSeccionVisorSunat');
        if (seccionUpload) seccionUpload.classList.add('d-none');
        if (seccionVisor) seccionVisor.classList.remove('d-none');

        // Generar QR dinámico fiel al formato técnico oficial de SUNAT (Anexo VII)
        // Formato SUNAT: [RUC Emisor]|[Tipo Doc]|[Serie]|[Correlativo]|[Peso Bruto]|[Fecha Emisión]|[Tipo Doc Adq]|[Num Doc Adq]|[Hash DigestValue]|
        let serie = 'T001', correlativo = '00000001';
        if (guia.numero_guia && String(guia.numero_guia).includes('-')) {
            const parts = String(guia.numero_guia).split('-');
            serie = parts[0].trim();
            correlativo = parts[1].trim();
        } else if (guia.numero_guia) {
            correlativo = String(guia.numero_guia).trim();
        }

        const tipoDocDest = (guia.destinatario_ruc && String(guia.destinatario_ruc).length === 8) ? '1' : '6';
        const hashVal = guia.xml_hash || '';
        const qrData = `${guia.remitente_ruc || ''}|${guia.tipo_documento || '09'}|${serie}|${correlativo}|${Number(guia.peso_bruto_total || 0).toFixed(2)}|${guia.fecha_emision || ''}|${tipoDocDest}|${guia.destinatario_ruc || ''}|${hashVal}|`;

        const elQr = document.getElementById('sunatDetalleQr');
        if (elQr) {
            elQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=115x115&ecc=M&data=${encodeURIComponent(qrData)}`;
            elQr.title = `QR Oficial SUNAT:\n${qrData}`;
        }

        // Encabezado Emisor
        const elEmisor = document.getElementById('sunatDetalleEmisor');
        const elFecEmi = document.getElementById('sunatDetalleFecEmision');
        const elFecCdr = document.getElementById('sunatDetalleFecCdr');
        const elRucEmi = document.getElementById('sunatDetalleRucEmisor');
        const elTipoGre = document.getElementById('sunatDetalleTipoGRE');
        const elNumGuia = document.getElementById('sunatDetalleNumeroGuia');

        const fmtF = window._formatFechaPeru || ((s) => (s ? String(s).split('T')[0] : '—'));
        const fEmiFormat = fmtF(guia.fecha_emision);
        const fCdrFormat = fmtF(guia.fecha_cdr || guia.fecha_emision);
        const fTrasFormat = fmtF(guia.fecha_traslado || guia.fecha_emision);

        if (elEmisor) elEmisor.textContent = guia.remitente_razon_social || '—';
        if (elFecEmi) elFecEmi.textContent = `${fEmiFormat} ${guia.hora_emision || ''}`.trim();
        if (elFecCdr) elFecCdr.textContent = `${fCdrFormat} ${guia.hora_cdr || ''}`.trim();
        if (elRucEmi) elRucEmi.textContent = guia.remitente_ruc || '—';
        if (elTipoGre) elTipoGre.textContent = guia.tipo_documento === '31' ? 'TRANSPORTISTA' : 'REMITENTE';

        // Formatear N° EG07 - 00000003 tal cual como en SUNAT
        let numVisual = guia.numero_guia || '—';
        if (numVisual && numVisual.includes('-')) {
            const p = numVisual.split('-');
            const s = p[0].trim().toUpperCase();
            let c = p[1].trim();
            if (/^\d+$/.test(c)) c = c.padStart(8, '0');
            numVisual = `${s} - ${c}`;
        }
        if (elNumGuia) elNumGuia.textContent = numVisual;

        // Datos del Traslado
        const elFecTras = document.getElementById('sunatDetalleFecTraslado');
        const elMotivo = document.getElementById('sunatDetalleMotivo');
        const elDescMot = document.getElementById('sunatDetalleDescMotivo');
        const elPartida = document.getElementById('sunatDetallePartida');
        const elLlegada = document.getElementById('sunatDetalleLlegada');
        const elDest = document.getElementById('sunatDetalleDestinatario');

        if (elFecTras) elFecTras.textContent = fTrasFormat;
        if (elMotivo) elMotivo.textContent = guia.descripcion_motivo || 'Venta';
        if (elDescMot) elDescMot.textContent = (guia.descripcion_motivo || 'VENTA').toUpperCase();
        if (elPartida) elPartida.textContent = `${guia.punto_partida_direccion || '—'} ${guia.punto_partida_ubigeo ? '[UBIGEO: ' + guia.punto_partida_ubigeo + ']' : ''}`;
        if (elLlegada) elLlegada.textContent = `${guia.punto_llegada_direccion || '—'} ${guia.punto_llegada_ubigeo ? '[UBIGEO: ' + guia.punto_llegada_ubigeo + ']' : ''}`;
        if (elDest) elDest.textContent = `${guia.destinatario_razon_social || '—'} - RUC N° ${guia.destinatario_ruc || '—'}`;

        // Bienes por transportar (Tabla de Ítems)
        const tbody = document.getElementById('sunatDetalleTbodyItems');
        if (tbody) {
            if (guia.items && guia.items.length > 0) {
                tbody.innerHTML = guia.items.map((it, idx) => `
                    <tr>
                        <td class="text-center font-monospace text-muted py-1.5">${it.item_numero || (idx + 1)}</td>
                        <td class="text-center py-1.5">${it.bien_normalizado || 'NO'}</td>
                        <td class="font-monospace text-primary fw-semibold py-1.5">${it.codigo_bien || it.codigo || '—'}</td>
                        <td class="font-monospace py-1.5">${it.codigo_sunat || '—'}</td>
                        <td class="font-monospace text-muted py-1.5">${it.codigo_subpartida || '—'}</td>
                        <td class="font-monospace text-muted py-1.5">${it.codigo_gtin || '—'}</td>
                        <td class="text-dark fw-semibold py-1.5">${it.descripcion || '—'}</td>
                        <td class="text-center font-monospace py-1.5">${it.unidad_medida || 'NIU'}</td>
                        <td class="text-end font-monospace fw-bold py-1.5">${Number(it.cantidad || 1).toLocaleString()}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center py-3 text-muted">Sin bienes registrados</td></tr>';
            }
        }

        // Totales y Transporte
        const elUniPeso = document.getElementById('sunatDetalleUnidadPeso');
        const elPesoTot = document.getElementById('sunatDetallePesoTotal');
        const elVolM3 = document.getElementById('sunatDetalleVolumenM3');
        const elMod = document.getElementById('sunatDetalleModalidad');
        const elTrans = document.getElementById('sunatDetalleTransportista');
        const elMtc = document.getElementById('sunatDetalleMtc');
        const elTracto = document.getElementById('sunatDetalleTracto');
        const elCarreta = document.getElementById('sunatDetalleCarreta');
        const elCond = document.getElementById('sunatDetalleConductor');
        const elObs = document.getElementById('sunatDetalleObservaciones');

        const esPublico = (guia.modalidad_traslado || '').toLowerCase().includes('públ') || (guia.modalidad_traslado || '').toLowerCase().includes('publ');
        const tieneVehiculo = Boolean(guia.placa_tracto && guia.placa_tracto !== '—' && String(guia.placa_tracto).trim() !== '');
        const tieneCarreta = Boolean(guia.placa_carreta && guia.placa_carreta !== '—' && String(guia.placa_carreta).trim() !== '');
        const tieneConductor = Boolean(guia.conductor_nombre && guia.conductor_nombre !== '—' && String(guia.conductor_nombre).trim() !== '');

        if (elUniPeso) elUniPeso.textContent = guia.unidad_medida || 'KGM';
        const pesoNum = Number(guia.peso_bruto_total || 0);
        if (elPesoTot) elPesoTot.textContent = pesoNum.toLocaleString('es-PE', { minimumFractionDigits: 2 });
        if (elVolM3) elVolM3.value = guia.volumen_m3 || '';
        if (elMod) elMod.textContent = guia.modalidad_traslado || 'Público';

        // Indicador oficial de registro de vehículos SUNAT
        const elIndVeh = document.getElementById('sunatDetalleIndVehiculos');
        if (elIndVeh) elIndVeh.textContent = (tieneVehiculo || tieneConductor) ? 'Sí' : 'No';

        const elBadgeAsig = document.getElementById('sunatDetalleBadgeAsignacion');
        if (elBadgeAsig) {
            if (tieneVehiculo || tieneConductor) {
                elBadgeAsig.textContent = 'Registrados por Remitente';
                elBadgeAsig.className = 'badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-0.5';
            } else if (esPublico) {
                elBadgeAsig.textContent = 'Asignación en GRT';
                elBadgeAsig.className = 'badge bg-warning bg-opacity-15 text-dark border border-warning border-opacity-50 px-2 py-0.5';
            } else {
                elBadgeAsig.textContent = 'Sin asignar';
                elBadgeAsig.className = 'badge bg-secondary bg-opacity-10 text-secondary border px-2 py-0.5';
            }
        }

        if (elTrans) {
            if (guia.transportista_razon_social || guia.transportista_ruc) {
                elTrans.textContent = `${guia.transportista_razon_social || '—'} - RUC N° ${guia.transportista_ruc || '—'}`;
            } else {
                elTrans.textContent = '— (No especificado)';
            }
        }
        if (elMtc) elMtc.textContent = guia.registro_mtc || '—';

        // Renderizar Vehículo Principal (Tracto)
        if (elTracto) {
            if (tieneVehiculo) {
                elTracto.textContent = guia.placa_tracto;
                elTracto.className = "font-monospace fw-bold text-dark";
            } else if (esPublico) {
                elTracto.textContent = "— (Se asigna en GRT Transportista)";
                elTracto.className = "font-monospace text-muted";
            } else {
                elTracto.textContent = "—";
            }
        }

        // TUCE / Certificado de Habilitación Vehicular
        const elTuce = document.getElementById('sunatDetalleTuce');
        const elTuceWrap = document.getElementById('sunatDetalleTuceWrap');
        if (elTuce && elTuceWrap) {
            if (guia.tuce) {
                elTuce.textContent = guia.tuce;
                elTuceWrap.classList.remove('d-none');
            } else {
                elTuceWrap.classList.add('d-none');
            }
        }

        // Autorización Especial MTC
        const elMtcAut = document.getElementById('sunatDetalleMtcAut');
        const elMtcAutWrap = document.getElementById('sunatDetalleMtcAutWrap');
        if (elMtcAut && elMtcAutWrap) {
            if (guia.autorizacion_mtc) {
                elMtcAut.textContent = guia.autorizacion_mtc;
                elMtcAutWrap.classList.remove('d-none');
            } else {
                elMtcAutWrap.classList.add('d-none');
            }
        }

        // Vehículo Secundario (Carreta / Semirremolque)
        const elCarretaRow = document.getElementById('sunatDetalleCarretaRow');
        if (elCarreta) {
            if (tieneCarreta) {
                elCarreta.textContent = guia.placa_carreta;
                elCarreta.className = "font-monospace fw-bold text-dark";
                if (elCarretaRow) elCarretaRow.classList.remove('d-none');
            } else {
                if (elCarretaRow) elCarretaRow.classList.add('d-none');
            }
        }

        // Conductor Principal
        if (elCond) {
            if (tieneConductor) {
                const docPart = guia.conductor_num_doc ? ` - DNI N° ${guia.conductor_num_doc}` : '';
                const licLimpia = (guia.conductor_licencia || '').replace(/<[^>]*>|<!\[CDATA\[|\]\]>/g, '').trim();
                const licPart = licLimpia ? ` | Número de licencia de conducir: ${licLimpia}` : '';
                elCond.textContent = `${guia.conductor_nombre}${docPart}${licPart}`;
                elCond.className = "fw-semibold text-dark";
            } else if (esPublico) {
                elCond.textContent = "— (No registrado por remitente; se asigna en la GRT de la empresa)";
                elCond.className = "fst-italic text-muted small";
            } else {
                elCond.textContent = "—";
            }
        }

        if (elObs) elObs.textContent = guia.observaciones_sunat || 'Esta es una representación impresa sin valor tributario de la Guía de Remisión Electrónica, generada en el sistema de la SUNAT. Puede verificarla utilizando su clave SOL';
    };

    // Ver Detalle Oficial SUNAT para una guía existente en la tabla
    window.greVerDetalleSunatPorIndice = function(idx) {
        if (!window._greGuiasData || !window._greGuiasData[idx]) return;
        const guia = window._greGuiasData[idx];
        window._greUltimaConsultaData = guia;

        const modalEl = document.getElementById('greModalConsultar');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();

        window.greRenderizarDetalleSunat(guia);
    };

    // Regresar al área de subir otro XML y limpiar todo el estado
    window.greLimpiarYSubirOtroXml = function() {
        const fileInput = document.getElementById('greInputXmlFile');
        if (fileInput) fileInput.value = '';
        const txtXml = document.getElementById('greTextareaXml');
        if (txtXml) txtXml.value = '';
        const inpSerie = document.getElementById('greInputSerieBd');
        if (inpSerie) inpSerie.value = '';
        const inpNum = document.getElementById('greInputNumeroBd');
        if (inpNum) inpNum.value = '';

        const seccionUpload = document.getElementById('greSeccionUploadXml');
        const seccionVisor = document.getElementById('greSeccionVisorSunat');
        if (seccionUpload) seccionUpload.classList.remove('d-none');
        if (seccionVisor) seccionVisor.classList.add('d-none');

        const boxPegar = document.getElementById('greBoxPegarXml');
        if (boxPegar) boxPegar.classList.add('d-none');
        const boxBuscar = document.getElementById('greBoxBusquedaManual');
        if (boxBuscar) boxBuscar.classList.add('d-none');

        // Limpiar elementos de texto para que la nueva consulta arranque 100% limpia
        const elEmisor = document.getElementById('sunatDetalleEmisor');
        if (elEmisor) elEmisor.textContent = '';
        const elNumGuia = document.getElementById('sunatDetalleNumeroGuia');
        if (elNumGuia) elNumGuia.textContent = '';
        const elFecEmi = document.getElementById('sunatDetalleFecEmision');
        if (elFecEmi) elFecEmi.textContent = '';
        const elFecCdr = document.getElementById('sunatDetalleFecCdr');
        if (elFecCdr) elFecCdr.textContent = '';
        const elFecTras = document.getElementById('sunatDetalleFecTraslado');
        if (elFecTras) elFecTras.textContent = '';
        const elPartida = document.getElementById('sunatDetallePartida');
        if (elPartida) elPartida.textContent = '';
        const elLlegada = document.getElementById('sunatDetalleLlegada');
        if (elLlegada) elLlegada.textContent = '';
        const elDest = document.getElementById('sunatDetalleDestinatario');
        if (elDest) elDest.textContent = '';
        const tbody = document.getElementById('sunatDetalleTbodyItems');
        if (tbody) tbody.innerHTML = '';
        const elVolM3 = document.getElementById('sunatDetalleVolumenM3');
        if (elVolM3) elVolM3.value = '';
        const elQr = document.getElementById('sunatDetalleQr');
        if (elQr) elQr.src = '';
        const elTracto = document.getElementById('sunatDetalleTracto');
        if (elTracto) elTracto.textContent = '—';
        const elCarreta = document.getElementById('sunatDetalleCarreta');
        if (elCarreta) elCarreta.textContent = '—';
        const elCond = document.getElementById('sunatDetalleConductor');
        if (elCond) elCond.textContent = '—';

        window._greUltimaConsultaData = null;
    };

    // Toggle para pegar XML
    window.greTogglePegarXml = function() {
        const box = document.getElementById('greBoxPegarXml');
        if (box) box.classList.toggle('d-none');
    };

    window.greProcesarXmlPegado = function() {
        const txt = document.getElementById('greTextareaXml');
        if (!txt || !txt.value.trim()) {
            alert('Por favor pegue el texto del archivo XML.');
            return;
        }
        window.greProcesarContenidoXml(txt.value);
    };

    // Toggle para búsqueda manual en BD
    window.greToggleBusquedaManual = function() {
        const box = document.getElementById('greBoxBusquedaManual');
        if (box) box.classList.toggle('d-none');
    };

    window.greBuscarGuiaEnBd = async function(e) {
        if (e) e.preventDefault();
        const serie = (document.getElementById('greInputSerieBd')?.value || '').trim().toUpperCase();
        const correlativo = (document.getElementById('greInputNumeroBd')?.value || '').trim();

        if (!serie || !correlativo) {
            alert('Ingrese Serie y Número para buscar en el historial local.');
            return;
        }

        const numCompleto = `${serie}-${correlativo.padStart(8, '0')}`;
        try {
            const resp = await fetch(`/api/guias-remision?search=${encodeURIComponent(numCompleto)}`);
            const res = await resp.json();
            if (res.ok && res.data && res.data.length > 0) {
                const guia = res.data[0];
                window._greUltimaConsultaData = guia;
                window.greRenderizarDetalleSunat(guia);
            } else {
                alert(`La guía ${numCompleto} no se encuentra guardada en la base de datos local del ERP.`);
            }
        } catch (err) {
            alert('Error buscando en la base de datos: ' + err.message);
        }
    };

    // Guardar Guía en el ERP desde el Visor de XML
    window.greGuardarGuiaDesdeXml = async function() {
        if (!window._greUltimaConsultaData) {
            alert('No hay ninguna guía cargada para guardar.');
            return;
        }

        const btn = document.getElementById('greBtnGuardarXml');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando en ERP...';
        }

        try {
            const guia = window._greUltimaConsultaData;
            const elVolM3 = document.getElementById('sunatDetalleVolumenM3');
            if (elVolM3 && elVolM3.value) {
                guia.volumen_m3 = parseFloat(elVolM3.value) || null;
            }

            const resp = await fetch('/api/guias-remision/guardar-gre-xml', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(guia)
            });

            const result = await resp.json();

            if (result.ok) {
                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta(`✓ ${result.message || 'Guía guardada exitosamente en el ERP'}`, 'success');
                } else {
                    alert(`✓ ${result.message || 'Guía guardada exitosamente en el ERP'}`);
                }
                // Refrescar listado general
                if (typeof window.greCargarGuias === 'function') {
                    await window.greCargarGuias();
                }

                // Cerrar modal automáticamente tras guardar para volver a la tabla del ERP
                setTimeout(() => {
                    const modalEl = document.getElementById('greModalConsultar');
                    if (modalEl) {
                        const mInst = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
                        mInst.hide();
                    }
                    if (typeof window.greLimpiarYSubirOtroXml === 'function') {
                        window.greLimpiarYSubirOtroXml();
                    }
                }, 700);
            } else {
                alert(`Error al guardar en el ERP: ${result.error || 'Error desconocido'}`);
            }
        } catch (err) {
            console.error("Error guardando guía:", err);
            alert(`Error de red al guardar: ${err.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill me-1"></i> Guardar en Sistema ERP';
            }
        }
    };

    // Emitir GRT Transportista a partir de la GRE cargada
    window.greEmitirGrtDesdeXml = function() {
        if (!window._greUltimaConsultaData) {
            alert('Primero suba o seleccione una guía de remisión.');
            return;
        }

        const guia = window._greUltimaConsultaData;

        // Cerrar modal de visor
        const modalVisor = document.getElementById('greModalConsultar');
        if (modalVisor) bootstrap.Modal.getInstance(modalVisor)?.hide();

        // Abrir modal de emisión de GRT y pre-llenar con los datos oficiales
        if (typeof window.grtAbrirModalEmitir === 'function') {
            window.grtAbrirModalEmitir();

            setTimeout(() => {
                // Pre-rellenar campos en el formulario de emisión de GRT
                const elGreRef = document.getElementById('grtInputDocRelacionado');
                const elRemRuc = document.getElementById('grtInputRemitenteRuc');
                const elRemNom = document.getElementById('grtInputRemitenteNombre');
                const elDesRuc = document.getElementById('grtInputDestinatarioRuc');
                const elDesNom = document.getElementById('grtInputDestinatarioNombre');
                const elPartDir = document.getElementById('grtInputPartidaDireccion');
                const elPartUbi = document.getElementById('grtInputPartidaUbigeo');
                const elLlegDir = document.getElementById('grtInputLlegadaDireccion');
                const elLlegUbi = document.getElementById('grtInputLlegadaUbigeo');
                const elPeso = document.getElementById('grtInputPesoBruto');
                const elTracto = document.getElementById('grtInputPlacaTracto');
                const elCarreta = document.getElementById('grtInputPlacaCarreta');
                const elCondNom = document.getElementById('grtInputConductorNombre');
                const elCondDni = document.getElementById('grtInputConductorDni');

                if (elGreRef) elGreRef.value = guia.numero_guia || '';
                if (elRemRuc) elRemRuc.value = guia.remitente_ruc || '';
                if (elRemNom) elRemNom.value = guia.remitente_razon_social || '';
                if (elDesRuc) elDesRuc.value = guia.destinatario_ruc || '';
                if (elDesNom) elDesNom.value = guia.destinatario_razon_social || '';
                if (elPartDir) elPartDir.value = guia.punto_partida_direccion || '';
                if (elPartUbi) elPartUbi.value = guia.punto_partida_ubigeo || '';
                if (elLlegDir) elLlegDir.value = guia.punto_llegada_direccion || '';
                if (elLlegUbi) elLlegUbi.value = guia.punto_llegada_ubigeo || '';
                if (elPeso) elPeso.value = Number(guia.peso_bruto_total || 0);
                if (elTracto && guia.placa_tracto) elTracto.value = guia.placa_tracto;
                if (elCarreta && guia.placa_carreta) elCarreta.value = guia.placa_carreta;
                if (elCondNom && guia.conductor_nombre) elCondNom.value = guia.conductor_nombre;
                if (elCondDni && guia.conductor_num_doc) elCondDni.value = guia.conductor_num_doc;

                // Pre-rellenar ítems si existen
                if (guia.items && guia.items.length > 0 && typeof window.grtCargarItemsDesdeGre === 'function') {
                    window.grtCargarItemsDesdeGre(guia.items);
                }
            }, 300);
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

        const exportData = window._greGuiasData.map(g => {
            const fmtF = window._formatFechaPeru || ((s) => s);
            return {
                "N° GUÍA": g.numero_guia,
                "ESTADO SUNAT": g.estado_sunat,
                "FECHA EMISIÓN": fmtF(g.fecha_emision) + (g.hora_emision ? ` ${g.hora_emision}` : ''),
                "FECHA TRASLADO": fmtF(g.fecha_traslado || g.fecha_emision),
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
            };
        });

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
