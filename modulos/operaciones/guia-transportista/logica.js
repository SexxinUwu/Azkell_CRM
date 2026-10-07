/**
 * LÓGICA — GUÍA DE REMISIÓN TRANSPORTISTA (GRT)
 * Módulo independiente • Tipo 31 • Serie V
 */

(function() {
    'use strict';

    const API = '/api/guia-transportista';
    let _data = [];
    let _filtroEstado = 'TODOS';
    let _filtroBuscar = '';
    let _eliminarId = null;

    let _conductoresCache = [];

    // ═══════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════
    window.init_guia_transportista = function() {
        console.log('[GRT] Módulo inicializado');
        cargarKPIs();
        cargarTabla();
        cargarCatalogosGRT();
        setFechasDefault();
    };

    async function cargarCatalogosGRT() {
        try {
            // 1. Cargar Placas de la Flota
            let rPlacas = [];
            try {
                const resP = await fetch(`${API}/placas-lista`);
                if (resP.ok) {
                    const jsonP = await resP.json();
                    rPlacas = jsonP.data || (Array.isArray(jsonP) ? jsonP : []);
                }
            } catch (_) {}
            if (!rPlacas.length) {
                try {
                    rPlacas = await fetch('/api/placas-lista').then(r => r.ok ? r.json() : []).catch(() => []);
                } catch (_) {}
            }

            if (Array.isArray(rPlacas) && rPlacas.length) {
                const dlTracto = document.getElementById('grt_lista_placas_tracto');
                const dlCarreta = document.getElementById('grt_lista_placas_carreta');
                
                const tractos = [];
                const carretas = [];

                rPlacas.forEach(p => {
                    const placa = (typeof p === 'string' ? p : (p.placa || p.nombre || p[0] || '')).toString().trim().toUpperCase();
                    if (!placa) return;
                    const tipo = (typeof p === 'object' && p.tipo ? p.tipo : '').toUpperCase();
                    if (tipo.includes('CARRETA') || tipo.includes('SEMI') || tipo.includes('REMOLQUE')) {
                        carretas.push(placa);
                    } else {
                        tractos.push(placa);
                    }
                });

                const allPlacas = rPlacas.map(p => (typeof p === 'string' ? p : (p.placa || p.nombre || p[0] || ''))).filter(Boolean);

                if (dlTracto) {
                    const listT = tractos.length ? tractos : allPlacas;
                    dlTracto.innerHTML = listT.map(p => `<option value="${p}">`).join('');
                }
                if (dlCarreta) {
                    const listC = carretas.length ? carretas : allPlacas;
                    dlCarreta.innerHTML = listC.map(p => `<option value="${p}">`).join('');
                }
            }

            // 2. Cargar Conductores y DNI/Licencia
            let rCond = [];
            try {
                const resC = await fetch(`${API}/conductores-lista`);
                if (resC.ok) {
                    const jsonC = await resC.json();
                    rCond = jsonC.data || (Array.isArray(jsonC) ? jsonC : []);
                }
            } catch (_) {}
            if (!rCond.length) {
                try {
                    rCond = await fetch('/api/conductores').then(r => r.ok ? r.json() : []).catch(() => []);
                    if (!rCond.length) {
                        rCond = await fetch('/api/conductores-lista').then(r => r.ok ? r.json() : []).catch(() => []);
                    }
                } catch (_) {}
            }

            if (Array.isArray(rCond) && rCond.length) {
                _conductoresCache = rCond;
                const dlCond = document.getElementById('grt_lista_conductores');
                if (dlCond) {
                    dlCond.innerHTML = rCond.map(c => {
                        let nombre = '';
                        if (typeof c === 'string') {
                            nombre = c;
                        } else if (c) {
                            nombre = (c.nombre || `${c.nombres || ''} ${c.apellidos || ''}`).trim();
                        }
                        return nombre ? `<option value="${nombre}">` : '';
                    }).filter(Boolean).join('');
                }
            }
        } catch (e) {
            console.warn('[GRT] Aviso cargando catálogos:', e);
        }
    }

    window.grtSeleccionarConductor = function(nombre) {
        if (!nombre || !_conductoresCache.length) return;
        const norm = nombre.trim().toUpperCase();
        const found = _conductoresCache.find(c => {
            if (typeof c === 'string') return c.toUpperCase() === norm;
            const full = (c.nombre || `${c.nombres || ''} ${c.apellidos || ''}`).trim().toUpperCase();
            return full === norm || (c.nombres && c.nombres.toUpperCase() === norm) || (c.nombre && c.nombre.toUpperCase() === norm);
        });
        if (found && typeof found === 'object') {
            if (found.dni || found.numero_documento) setVal('grt_conductor_num_doc', found.dni || found.numero_documento);
            if (found.licencia || found.numero_licencia) setVal('grt_conductor_licencia', found.licencia || found.numero_licencia);
            if (found.apellidos) setVal('grt_conductor_apellidos', found.apellidos);
        }
    };

    function setFechasDefault() {
        const hoy = new Date().toISOString().slice(0, 10);
        const fe = document.getElementById('grt_fecha_emision');
        const ft = document.getElementById('grt_fecha_traslado');
        if (fe && !fe.value) fe.value = hoy;
        if (ft && !ft.value) ft.value = hoy;
    }

    // ═══════════════════════════════════════════════════════════
    // TOAST
    // ═══════════════════════════════════════════════════════════
    function toast(msg, duration) {
        duration = duration || 3000;
        const t = document.getElementById('grtToast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(function() { t.classList.remove('show'); }, duration);
    }

    // ═══════════════════════════════════════════════════════════
    // KPIs
    // ═══════════════════════════════════════════════════════════
    async function cargarKPIs() {
        try {
            const resp = await fetch(API + '/kpis');
            const json = await resp.json();
            if (json.ok && json.kpis) {
                const k = json.kpis;
                setText('kpi-grt-total', k.total || 0);
                setText('kpi-grt-borradores', k.borradores || 0);
                setText('kpi-grt-aceptadas', k.aceptadas || 0);
                setText('kpi-grt-rechazadas', k.rechazadas || 0);
            }
        } catch (e) {
            console.error('[GRT] Error cargando KPIs:', e);
        }
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ═══════════════════════════════════════════════════════════
    // CARGAR TABLA
    // ═══════════════════════════════════════════════════════════
    async function cargarTabla() {
        try {
            let url = API + '/?limit=200';
            if (_filtroEstado && _filtroEstado !== 'TODOS') url += '&estado=' + _filtroEstado;
            if (_filtroBuscar) url += '&buscar=' + encodeURIComponent(_filtroBuscar);

            const resp = await fetch(url);
            const json = await resp.json();

            if (json.ok) {
                _data = json.data || [];
                renderTabla();
                renderCards();
            }
        } catch (e) {
            console.error('[GRT] Error cargando tabla:', e);
            const tbody = document.getElementById('grtTbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger fw-bold">Error cargando datos</td></tr>';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // RENDER TABLA DESKTOP
    // ═══════════════════════════════════════════════════════════
    function renderTabla() {
        const tbody = document.getElementById('grtTbody');
        if (!tbody) return;

        if (!_data.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2"></i>No hay guías transportista registradas</td></tr>';
            return;
        }

        let html = '';
        _data.forEach(function(g) {
            const fecha = g.fecha_emision ? new Date(g.fecha_emision).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
            const badge = getBadge(g.estado);
            const esBorrador = g.estado === 'BORRADOR';
            const tieneDocId = !!g.apisunat_document_id;

            html += '<tr style="transition: background 0.15s;">';
            html += '<td class="ps-4 py-3"><span class="fw-bold text-dark">' + esc(g.numero_guia) + '</span></td>';
            html += '<td class="py-3 text-muted small">' + fecha + '</td>';
            html += '<td class="py-3"><span class="fw-semibold text-dark small">' + esc(g.remitente_razon_social || '-') + '</span><br><span class="text-muted" style="font-size:0.72rem;">' + esc(g.remitente_ruc || '') + '</span></td>';
            html += '<td class="py-3"><span class="fw-semibold text-dark small">' + esc(g.destinatario_razon_social || '-') + '</span><br><span class="text-muted" style="font-size:0.72rem;">' + esc(g.destinatario_ruc || '') + '</span></td>';
            html += '<td class="py-3"><span class="badge bg-light text-dark border fw-bold" style="font-size:0.78rem;">' + esc(g.vehiculo_placa || '-') + '</span></td>';
            html += '<td class="py-3 small">' + esc(g.conductor_nombres || '-') + '</td>';
            html += '<td class="py-3 text-center">' + badge + '</td>';

            // Acciones
            html += '<td class="pe-4 py-3 text-end">';
            html += '<div class="d-flex gap-1 justify-content-end flex-wrap">';
            html += '<button class="grt-act-btn grt-btn-view" onclick="window.grtVerDetalle(' + g.id + ')" title="Ver"><i class="bi bi-eye"></i></button>';

            if (esBorrador) {
                html += '<button class="grt-act-btn grt-btn-emit" onclick="window.grtEmitirDirecto(' + g.id + ')" title="Emitir SUNAT"><i class="bi bi-lightning-charge-fill"></i></button>';
                html += '<button class="grt-act-btn grt-btn-edit" onclick="window.grtEditar(' + g.id + ')" title="Editar"><i class="bi bi-pencil"></i></button>';
            }

            if (tieneDocId) {
                html += '<button class="grt-act-btn grt-btn-sync" onclick="window.grtSincronizar(' + g.id + ')" title="Sincronizar SUNAT"><i class="bi bi-arrow-repeat"></i></button>';
            }

            if (g.pdf_url) {
                html += '<a class="grt-act-btn grt-btn-pdf" href="' + esc(g.pdf_url) + '" target="_blank" title="PDF"><i class="bi bi-file-earmark-pdf"></i></a>';
            }

            html += '<button class="grt-act-btn grt-btn-dup" onclick="window.grtDuplicar(' + g.id + ')" title="Duplicar"><i class="bi bi-copy"></i></button>';

            if (esBorrador) {
                html += '<button class="grt-act-btn grt-btn-del" onclick="window.grtPrepararEliminar(' + g.id + ', \'' + esc(g.numero_guia) + '\')" title="Eliminar"><i class="bi bi-trash3"></i></button>';
            }

            html += '</div></td>';
            html += '</tr>';
        });

        tbody.innerHTML = html;
    }

    // ═══════════════════════════════════════════════════════════
    // RENDER CARDS MOBILE
    // ═══════════════════════════════════════════════════════════
    function renderCards() {
        const container = document.getElementById('grtCardContainer');
        if (!container) return;

        if (!_data.length) {
            container.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2"></i>No hay guías</div>';
            return;
        }

        let html = '';
        _data.forEach(function(g) {
            const fecha = g.fecha_emision ? new Date(g.fecha_emision).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '-';
            const badge = getBadge(g.estado);
            const esBorrador = g.estado === 'BORRADOR';

            html += '<div class="grt-mobile-card" onclick="window.grtVerDetalle(' + g.id + ')">';
            html += '<div class="d-flex justify-content-between align-items-start mb-2">';
            html += '<div><span class="fw-bold text-dark" style="font-size:0.92rem;">' + esc(g.numero_guia) + '</span><br>';
            html += '<span class="text-muted" style="font-size:0.75rem;">' + fecha + '</span></div>';
            html += badge;
            html += '</div>';
            html += '<div class="d-flex justify-content-between align-items-center">';
            html += '<div><span class="small fw-semibold text-dark">' + esc(g.remitente_razon_social || '-') + '</span>';
            html += '<br><span style="font-size:0.72rem;" class="text-muted"><i class="bi bi-truck me-1"></i>' + esc(g.vehiculo_placa || '-') + ' • ' + esc(g.conductor_nombres || '-') + '</span></div>';
            if (esBorrador) {
                html += '<button class="btn btn-sm rounded-pill fw-bold px-3" style="background:#f59e0b;color:#fff;font-size:0.75rem;" onclick="event.stopPropagation();window.grtEmitirDirecto(' + g.id + ')"><i class="bi bi-lightning-charge-fill me-1"></i>Emitir</button>';
            }
            html += '</div></div>';
        });

        container.innerHTML = html;
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════
    function getBadge(estado) {
        var cls = 'grt-badge-borrador';
        var icon = '✏️';
        if (estado === 'EMITIDA' || estado === 'PENDIENTE') { cls = 'grt-badge-emitida'; icon = '📤'; }
        else if (estado === 'ACEPTADA') { cls = 'grt-badge-aceptada'; icon = '✅'; }
        else if (estado === 'RECHAZADA') { cls = 'grt-badge-rechazada'; icon = '❌'; }
        return '<span class="grt-badge ' + cls + '">' + icon + ' ' + esc(estado) + '</span>';
    }

    function esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ═══════════════════════════════════════════════════════════
    // FILTROS
    // ═══════════════════════════════════════════════════════════
    window.grtFiltrar = function() {
        var el = document.getElementById('grtBuscador');
        _filtroBuscar = el ? el.value.trim() : '';
        cargarTabla();
    };

    window.grtFiltrarEstado = function(estado, btn) {
        _filtroEstado = estado;
        document.querySelectorAll('#grt-filtros-estado .grt-seg-item').forEach(function(b) { b.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        cargarTabla();
    };

    window.grtRecargar = function() {
        toast('Recargando...');
        cargarKPIs();
        cargarTabla();
    };

    function setVal(id, value) {
        var el = document.getElementById(id);
        if (el) el.value = (value !== null && value !== undefined) ? value : '';
    }

    // ═══════════════════════════════════════════════════════════
    // ABRIR MODAL NUEVA GRT
    // ═══════════════════════════════════════════════════════════
    window.grtAbrirNueva = async function() {
        setVal('grtEditId', '');
        var form = document.getElementById('formGRT');
        if (form) form.reset();
        var title = document.getElementById('grtModalTitle');
        if (title) title.textContent = 'Nueva Guía Transportista';
        setFechasDefault();
        cargarCatalogosGRT();

        // Obtener siguiente correlativo
        try {
            const resp = await fetch(API + '/ultimo-correlativo?serie=V001');
            const json = await resp.json();
            if (json.ok) {
                setVal('grt_correlativo', String(json.correlativo_sugerido).padStart(8, '0'));
            }
        } catch (_) {}

        var modalEl = document.getElementById('modalNuevaGRT');
        if (modalEl) {
            var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    // ═══════════════════════════════════════════════════════════
    // EDITAR GRT
    // ═══════════════════════════════════════════════════════════
    window.grtEditar = async function(id) {
        try {
            const resp = await fetch(API + '/' + id);
            const json = await resp.json();
            if (!json.ok) return toast('Error: ' + (json.error || 'No encontrada'));

            const g = json.guia;
            setVal('grtEditId', g.id);
            var title = document.getElementById('grtModalTitle');
            if (title) title.textContent = 'Editar ' + g.numero_guia;
            setVal('grt_serie', g.serie || 'V001');
            setVal('grt_correlativo', String(g.correlativo).padStart(8, '0'));
            setVal('grt_fecha_emision', g.fecha_emision ? g.fecha_emision.slice(0, 10) : '');
            setVal('grt_fecha_traslado', g.fecha_traslado ? g.fecha_traslado.slice(0, 10) : '');
            setVal('grt_motivo_traslado', g.motivo_traslado || '01');
            setVal('grt_peso_total', g.peso_total || 1);
            setVal('grt_registro_mtc', g.transportista_reg_mtc || '');
            setVal('grt_remitente_ruc', g.remitente_ruc || '');
            setVal('grt_remitente_razon_social', g.remitente_razon_social || '');
            setVal('grt_destinatario_ruc', g.destinatario_ruc || '');
            setVal('grt_destinatario_razon_social', g.destinatario_razon_social || '');
            setVal('grt_partida_ubigeo', g.partida_ubigeo || '');
            setVal('grt_partida_direccion', g.partida_direccion || '');
            setVal('grt_llegada_ubigeo', g.llegada_ubigeo || '');
            setVal('grt_llegada_direccion', g.llegada_direccion || '');
            setVal('grt_vehiculo_placa', g.vehiculo_placa || '');
            setVal('grt_vehiculo_secundario_placa', g.vehiculo_secundario_placa || '');
            setVal('grt_conductor_num_doc', g.conductor_num_doc || '');
            setVal('grt_conductor_licencia', g.conductor_licencia || '');
            setVal('grt_conductor_nombres', g.conductor_nombres || '');
            setVal('grt_conductor_apellidos', g.conductor_apellidos || '');
            setVal('grt_costo_flete', g.costo_flete || 0);
            setVal('grt_observaciones', g.observaciones || '');
            setVal('grt_orden_servicio', g.orden_servicio || '');
            setVal('grt_gre_vinculada', g.gre_vinculada_numero || '');

            // Items
            if (json.items && json.items.length) {
                setVal('grt_descripcion_carga', json.items[0].descripcion || 'CARGA GENERAL');
                setVal('grt_cantidad', json.items[0].cantidad || 1);
                setVal('grt_unidad_item', json.items[0].unidad_medida || 'NIU');
            }

            var modalEl = document.getElementById('modalNuevaGRT');
            if (modalEl) {
                var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                modal.show();
            }
        } catch (e) {
            toast('Error cargando guía');
        }
    };

    // ═══════════════════════════════════════════════════════════
    // GUARDAR (Crear o Editar)
    // ═══════════════════════════════════════════════════════════
    window.grtGuardar = async function(e) {
        if (e) e.preventDefault();

        const editId = document.getElementById('grtEditId').value;
        const body = recogerFormulario();

        if (!body.remitente_ruc || !body.destinatario_ruc || !body.vehiculo_placa || !body.conductor_num_doc) {
            toast('⚠️ Completa los campos obligatorios');
            return false;
        }

        try {
            const url = editId ? (API + '/' + editId) : API;
            const method = editId ? 'PUT' : 'POST';

            const resp = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const json = await resp.json();

            if (json.ok) {
                toast('✅ ' + (json.message || 'Guardado'));
                cerrarModal('modalNuevaGRT');
                cargarKPIs();
                cargarTabla();
            } else {
                toast('❌ ' + (json.error || 'Error al guardar'));
            }
        } catch (e) {
            toast('❌ Error de conexión');
        }
        return false;
    };

    // ═══════════════════════════════════════════════════════════
    // GUARDAR Y EMITIR
    // ═══════════════════════════════════════════════════════════
    window.grtGuardarYEmitir = async function() {
        const editId = document.getElementById('grtEditId').value;
        const body = recogerFormulario();

        if (!body.remitente_ruc || !body.destinatario_ruc || !body.vehiculo_placa || !body.conductor_num_doc) {
            toast('⚠️ Completa los campos obligatorios');
            return;
        }

        try {
            // Primero guardar
            const url = editId ? (API + '/' + editId) : API;
            const method = editId ? 'PUT' : 'POST';
            const resp = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const json = await resp.json();
            if (!json.ok) { toast('❌ ' + (json.error || 'Error')); return; }

            const guiaId = editId || json.id;
            toast('📤 Emitiendo a SUNAT...');

            // Luego emitir
            const emitResp = await fetch(API + '/' + guiaId + '/emitir', { method: 'POST' });
            const emitJson = await emitResp.json();

            if (emitJson.ok) {
                toast('✅ ' + (emitJson.message || 'Emitida exitosamente'));
                cerrarModal('modalNuevaGRT');
                cargarKPIs();
                cargarTabla();
            } else {
                toast('⚠️ ' + (emitJson.error || 'Error en emisión'));
            }
        } catch (e) {
            toast('❌ Error de conexión');
        }
    };

    // ═══════════════════════════════════════════════════════════
    // EMITIR DIRECTO (desde tabla)
    // ═══════════════════════════════════════════════════════════
    window.grtEmitirDirecto = async function(id) {
        toast('📤 Emitiendo GRT...');
        try {
            const resp = await fetch(API + '/' + id + '/emitir', { method: 'POST' });
            const json = await resp.json();
            if (json.ok) {
                toast('✅ ' + (json.message || 'Emitida'));
                cargarKPIs();
                cargarTabla();
            } else {
                toast('⚠️ ' + (json.error || 'Error'));
            }
        } catch (e) {
            toast('❌ Error de conexión');
        }
    };

    // ═══════════════════════════════════════════════════════════
    // SINCRONIZAR CON APISUNAT
    // ═══════════════════════════════════════════════════════════
    window.grtSincronizar = async function(id) {
        toast('🔄 Sincronizando con SUNAT...');
        try {
            const resp = await fetch(API + '/' + id + '/sincronizar');
            const json = await resp.json();
            if (json.ok) {
                toast('✅ Estado: ' + (json.apisunat_status || json.estado));
                cargarKPIs();
                cargarTabla();
            } else {
                toast('⚠️ ' + (json.error || 'Error sincronizando'));
            }
        } catch (e) {
            toast('❌ Error de conexión');
        }
    };

    // ═══════════════════════════════════════════════════════════
    // DUPLICAR
    // ═══════════════════════════════════════════════════════════
    window.grtDuplicar = async function(id) {
        try {
            const resp = await fetch(API + '/' + id + '/duplicar', { method: 'POST' });
            const json = await resp.json();
            if (json.ok) {
                toast('📋 Guía duplicada: ' + json.numero_guia);
                cargarKPIs();
                cargarTabla();
            } else {
                toast('❌ ' + (json.error || 'Error'));
            }
        } catch (e) {
            toast('❌ Error');
        }
    };

    // ═══════════════════════════════════════════════════════════
    // VER DETALLE
    // ═══════════════════════════════════════════════════════════
    window.grtVerDetalle = async function(id) {
        try {
            const resp = await fetch(API + '/' + id);
            const json = await resp.json();
            if (!json.ok) return toast('Error cargando detalle');

            const g = json.guia;
            const items = json.items || [];

            document.getElementById('grtDetalleTitle').textContent = g.numero_guia;
            document.getElementById('grtDetalleSubtitle').textContent = 'Estado: ' + g.estado + (g.apisunat_status ? ' | SUNAT: ' + g.apisunat_status : '');

            const fecha = g.fecha_emision ? new Date(g.fecha_emision).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
            const fechaT = g.fecha_traslado ? new Date(g.fecha_traslado).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';

            let html = '';
            html += '<div class="card p-3 mb-3"><h6 class="fw-bold text-dark mb-2" style="font-size:0.85rem;"><i class="bi bi-info-circle text-warning me-1"></i>General</h6>';
            html += '<div class="row g-2 small">';
            html += '<div class="col-6"><strong>Emisión:</strong> ' + fecha + '</div>';
            html += '<div class="col-6"><strong>Traslado:</strong> ' + fechaT + '</div>';
            html += '<div class="col-6"><strong>Motivo:</strong> ' + esc(g.motivo_traslado) + ' - ' + esc(g.descripcion_motivo) + '</div>';
            html += '<div class="col-6"><strong>Peso:</strong> ' + g.peso_total + ' ' + g.unidad_medida + '</div>';
            if (g.costo_flete) html += '<div class="col-6"><strong>Flete:</strong> S/. ' + Number(g.costo_flete).toFixed(2) + '</div>';
            html += '</div></div>';

            html += '<div class="card p-3 mb-3"><h6 class="fw-bold text-dark mb-2" style="font-size:0.85rem;"><i class="bi bi-person-badge text-info me-1"></i>Remitente</h6>';
            html += '<div class="small"><strong>' + esc(g.remitente_razon_social) + '</strong><br>RUC: ' + esc(g.remitente_ruc) + '</div></div>';

            html += '<div class="card p-3 mb-3"><h6 class="fw-bold text-dark mb-2" style="font-size:0.85rem;"><i class="bi bi-geo-alt text-danger me-1"></i>Destinatario</h6>';
            html += '<div class="small"><strong>' + esc(g.destinatario_razon_social) + '</strong><br>RUC: ' + esc(g.destinatario_ruc) + '</div></div>';

            html += '<div class="card p-3 mb-3"><h6 class="fw-bold text-dark mb-2" style="font-size:0.85rem;"><i class="bi bi-signpost-2 text-primary me-1"></i>Ruta</h6>';
            html += '<div class="small"><strong>Origen:</strong> [' + esc(g.partida_ubigeo) + '] ' + esc(g.partida_direccion) + '<br>';
            html += '<strong>Destino:</strong> [' + esc(g.llegada_ubigeo) + '] ' + esc(g.llegada_direccion) + '</div></div>';

            html += '<div class="card p-3 mb-3"><h6 class="fw-bold text-dark mb-2" style="font-size:0.85rem;"><i class="bi bi-truck text-success me-1"></i>Vehículo & Conductor</h6>';
            html += '<div class="small"><strong>Tracto:</strong> ' + esc(g.vehiculo_placa);
            if (g.vehiculo_secundario_placa) html += ' | <strong>Carreta:</strong> ' + esc(g.vehiculo_secundario_placa);
            html += '<br><strong>Conductor:</strong> ' + esc(g.conductor_nombres) + ' ' + esc(g.conductor_apellidos || '');
            html += '<br><strong>DNI:</strong> ' + esc(g.conductor_num_doc) + ' | <strong>Licencia:</strong> ' + esc(g.conductor_licencia);
            html += '</div></div>';

            if (items.length) {
                html += '<div class="card p-3 mb-3"><h6 class="fw-bold text-dark mb-2" style="font-size:0.85rem;"><i class="bi bi-box-seam text-secondary me-1"></i>Items</h6>';
                html += '<table class="table table-sm small m-0"><thead><tr><th>#</th><th>Descripción</th><th>Cant.</th><th>Und.</th></tr></thead><tbody>';
                items.forEach(function(it) {
                    html += '<tr><td>' + it.item_numero + '</td><td>' + esc(it.descripcion) + '</td><td>' + it.cantidad + '</td><td>' + esc(it.unidad_medida) + '</td></tr>';
                });
                html += '</tbody></table></div>';
            }

            document.getElementById('grtDetalleBody').innerHTML = html;

            // Footer actions
            let footer = '';
            if (g.estado === 'BORRADOR') {
                footer += '<button class="btn btn-warning fw-bold rounded-3 px-3" onclick="cerrarModal(\'modalDetalleGRT\');window.grtEditar(' + g.id + ')"><i class="bi bi-pencil me-1"></i>Editar</button>';
                footer += '<button class="btn btn-success fw-bold rounded-3 px-3" onclick="cerrarModal(\'modalDetalleGRT\');window.grtEmitirDirecto(' + g.id + ')"><i class="bi bi-lightning-charge-fill me-1"></i>Emitir</button>';
            }
            if (g.apisunat_document_id) {
                footer += '<button class="btn btn-primary fw-bold rounded-3 px-3" onclick="window.grtSincronizar(' + g.id + ')"><i class="bi bi-arrow-repeat me-1"></i>Sincronizar</button>';
            }
            if (g.pdf_url) {
                footer += '<a class="btn btn-danger fw-bold rounded-3 px-3" href="' + esc(g.pdf_url) + '" target="_blank"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</a>';
            }
            footer += '<button class="btn btn-outline-secondary fw-bold rounded-3 px-3" onclick="window.grtDuplicar(' + g.id + ')"><i class="bi bi-copy me-1"></i>Duplicar</button>';
            document.getElementById('grtDetalleFooter').innerHTML = footer;

            var modal = new bootstrap.Modal(document.getElementById('modalDetalleGRT'));
            modal.show();
        } catch (e) {
            toast('Error');
        }
    };

    // ═══════════════════════════════════════════════════════════
    // ELIMINAR
    // ═══════════════════════════════════════════════════════════
    window.grtPrepararEliminar = function(id, numero) {
        _eliminarId = id;
        document.getElementById('grtEliminarMsg').textContent = '¿Eliminar borrador ' + numero + '?';
        var modal = new bootstrap.Modal(document.getElementById('modalEliminarGRT'));
        modal.show();
    };

    window.grtConfirmarEliminar = async function() {
        if (!_eliminarId) return;
        try {
            const resp = await fetch(API + '/' + _eliminarId, { method: 'DELETE' });
            const json = await resp.json();
            if (json.ok) {
                toast('🗑️ Borrador eliminado');
                cerrarModal('modalEliminarGRT');
                cargarKPIs();
                cargarTabla();
            } else {
                toast('❌ ' + (json.error || 'Error'));
            }
        } catch (e) {
            toast('❌ Error');
        }
        _eliminarId = null;
    };

    // ═══════════════════════════════════════════════════════════
    // BÚSQUEDA RUC (vía API SUNAT pública)
    // ═══════════════════════════════════════════════════════════
    window.grtBuscarRuc = async function(tipo) {
        const rucInput = document.getElementById('grt_' + tipo + '_ruc');
        const rsInput = document.getElementById('grt_' + tipo + '_razon_social');
        const ruc = rucInput ? rucInput.value.trim() : '';

        if (!ruc || ruc.length < 8) {
            toast('⚠️ Ingresa un RUC/DNI válido');
            return;
        }

        toast('🔍 Buscando...');
        try {
            // Intentar con la API pública de consulta RUC
            const resp = await fetch('https://dniruc.apisperu.com/api/v1/ruc/' + ruc + '?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9');
            if (resp.ok) {
                const data = await resp.json();
                if (data.razonSocial) {
                    rsInput.value = data.razonSocial;
                    toast('✅ ' + data.razonSocial);
                    return;
                }
            }
        } catch (_) {}

        // Fallback: buscar en BD local (clientes)
        try {
            const resp2 = await fetch('/api/clientes?buscar=' + encodeURIComponent(ruc));
            const json2 = await resp2.json();
            if (json2.ok && json2.data && json2.data.length) {
                rsInput.value = json2.data[0].razon_social || json2.data[0].nombre || '';
                toast('✅ Encontrado en BD local');
                return;
            }
        } catch (_) {}

        toast('⚠️ No se encontró resultado para ' + ruc);
    };

    // ═══════════════════════════════════════════════════════════
    // EXPORTAR EXCEL
    // ═══════════════════════════════════════════════════════════
    window.grtExportarExcel = function() {
        if (!_data.length) return toast('No hay datos para exportar');
        let csv = 'Nº Guía,Fecha,Remitente,RUC Remitente,Destinatario,RUC Destinatario,Placa,Conductor,Estado\n';
        _data.forEach(function(g) {
            csv += '"' + (g.numero_guia || '') + '","' + (g.fecha_emision || '') + '","' + (g.remitente_razon_social || '') + '","' + (g.remitente_ruc || '') + '","' + (g.destinatario_razon_social || '') + '","' + (g.destinatario_ruc || '') + '","' + (g.vehiculo_placa || '') + '","' + (g.conductor_nombres || '') + '","' + (g.estado || '') + '"\n';
        });
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'guias_transportista_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        toast('📊 Excel exportado');
    };

    // ═══════════════════════════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════════════════════════
    function recogerFormulario() {
        return {
            serie: val('grt_serie') || 'V001',
            fecha_emision: val('grt_fecha_emision'),
            fecha_traslado: val('grt_fecha_traslado'),
            motivo_traslado: val('grt_motivo_traslado'),
            descripcion_motivo: document.getElementById('grt_motivo_traslado') ? document.getElementById('grt_motivo_traslado').options[document.getElementById('grt_motivo_traslado').selectedIndex].text.split(' - ')[1] || 'VENTA' : 'VENTA',
            peso_total: val('grt_peso_total'),
            registro_mtc: val('grt_registro_mtc'),
            remitente_ruc: val('grt_remitente_ruc'),
            remitente_razon_social: val('grt_remitente_razon_social'),
            destinatario_ruc: val('grt_destinatario_ruc'),
            destinatario_razon_social: val('grt_destinatario_razon_social'),
            partida_ubigeo: val('grt_partida_ubigeo'),
            partida_direccion: val('grt_partida_direccion'),
            llegada_ubigeo: val('grt_llegada_ubigeo'),
            llegada_direccion: val('grt_llegada_direccion'),
            vehiculo_placa: val('grt_vehiculo_placa'),
            vehiculo_secundario_placa: val('grt_vehiculo_secundario_placa'),
            conductor_num_doc: val('grt_conductor_num_doc'),
            conductor_licencia: val('grt_conductor_licencia'),
            conductor_nombres: val('grt_conductor_nombres'),
            conductor_apellidos: val('grt_conductor_apellidos'),
            costo_flete: val('grt_costo_flete'),
            observaciones: val('grt_observaciones'),
            orden_servicio: val('grt_orden_servicio'),
            gre_vinculada_numero: val('grt_gre_vinculada'),
            descripcion_carga: val('grt_descripcion_carga'),
            items: [{
                codigo: '001',
                descripcion: val('grt_descripcion_carga') || 'CARGA GENERAL',
                cantidad: parseFloat(val('grt_cantidad')) || 1,
                unidad_medida: val('grt_unidad_item') || 'NIU'
            }]
        };
    }

    function val(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function cerrarModal(id) {
        var el = document.getElementById(id);
        if (el) {
            var inst = bootstrap.Modal.getInstance(el);
            if (inst) inst.hide();
        }
    }
    // ═══════════════════════════════════════════════════════════
    // AUTOCOMPLETAR DESDE ORDEN DE VIAJE (OV)
    // ═══════════════════════════════════════════════════════════
    window.grtAutocompletarDesdeOV = async function() {
        const input = document.getElementById('grt_buscar_ov_input');
        if (!input || !input.value.trim()) {
            toast('⚠️ Ingrese el número de la Orden de Viaje');
            return;
        }

        try {
            toast('🔍 Buscando Orden de Viaje...');
            const res = await fetch(`${API}/buscar-ov/${encodeURIComponent(input.value.trim())}`);
            const data = await res.json();
            if (data.ok && data.ov) {
                const ov = data.ov;
                if (ov.placa_tracto) document.getElementById('grt_vehiculo_placa').value = ov.placa_tracto;
                if (ov.placa_remolque) document.getElementById('grt_vehiculo_secundario_placa').value = ov.placa_remolque;
                if (ov.conductor) {
                    if (ov.conductor.nombres) document.getElementById('grt_conductor_nombres').value = ov.conductor.nombres;
                    if (ov.conductor.num_doc) document.getElementById('grt_conductor_num_doc').value = ov.conductor.num_doc;
                    if (ov.conductor.licencia) document.getElementById('grt_conductor_licencia').value = ov.conductor.licencia;
                }
                if (ov.ubigeo_partida) document.getElementById('grt_partida_ubigeo').value = ov.ubigeo_partida;
                if (ov.direccion_partida) document.getElementById('grt_partida_direccion').value = ov.direccion_partida;
                if (ov.ubigeo_llegada) document.getElementById('grt_llegada_ubigeo').value = ov.ubigeo_llegada;
                if (ov.direccion_llegada) document.getElementById('grt_llegada_direccion').value = ov.direccion_llegada;
                if (ov.peso) document.getElementById('grt_peso_total').value = ov.peso;
                if (ov.viaje) {
                    const osEl = document.getElementById('grt_orden_servicio');
                    if (osEl && !osEl.value) osEl.value = ov.viaje;
                }
                toast(`✅ Datos importados de OV: ${ov.viaje}`);
            } else {
                toast('❌ ' + (data.error || 'No se encontró la Orden de Viaje'));
            }
        } catch (e) {
            console.error("[GRT] Error buscando OV:", e);
            toast('❌ Error buscando Orden de Viaje');
        }
    };

    // Exponer cerrarModal globalmente para uso desde HTML renderizado
    window.cerrarModal = cerrarModal;

})();
