/**
 * MÓDULO: GUÍAS DE REMISIÓN DE TRANSPORTISTA (GRE SUNAT)
 * Lógica Frontend y Conexión Asíncrona
 */
(function() {
    window._greGuiasData = [];

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
                        <button class="btn btn-outline-danger btn-sm rounded-circle p-1" onclick="window.greEliminarGuia(${g.id})" title="Eliminar guía">
                            <i class="bi bi-trash"></i>
                        </button>
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
                if (document.getElementById('greCfgEntorno')) document.getElementById('greCfgEntorno').value = c.sunat_modo_entorno || 'produccion';
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

    // Auto-inicializar
    window.inicializarModuloGuiasRemision();
})();
