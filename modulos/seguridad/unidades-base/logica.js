// ============================================================
// 🏢 MÓDULO: STATUS "UNIDADES EN BASE" (SEGURIDAD)
// Cargado dinámicamente por cargarModuloAislado('seguridad/unidades-base')
// ============================================================

(function() {
    window._subPanoramaData = window._subPanoramaData || { items: [], kpis: {} };
    window._subData = window._subData || [];
    window._subCatalogo = window._subCatalogo || { tractos: [], carretas: [], todas: [], conductores: [] };
    window._subEmpresaActiva = window._subEmpresaActiva || 'TODAS';
    window._subCorteActivo = window._subCorteActivo || 'ALL';
    window._subEstadoFiltroVista = window._subEstadoFiltroVista || 'ALL';
    let _subDebounceTimeout = null;

    // ── Obtener Corte Automático según la Hora Actual ─────────────
    // Corte 1 (Turno Día): 05:00 a 16:59 (5:00 am a 4:59 pm)
    // Corte 2 (Turno Noche): 17:00 a 04:59 (5:00 pm a 4:59 am)
    window.subObtenerCorteActual = function() {
        const ahora = new Date();
        const hora = ahora.getHours();
        if (hora >= 5 && hora < 17) {
            return 'Corte 1';
        } else {
            return 'Corte 2';
        }
    };

    // ── Inicialización Principal del Módulo ───────────────────────
    window.init_unidades_base = function() {
        console.log('🏢 Módulo Status Unidades en Base inicializado');
        
        // Configurar fecha de hoy por defecto si está vacío
        const filterFecha = document.getElementById('sub-filter-fecha');
        if (filterFecha && !filterFecha.value) {
            const hoy = new Date().toISOString().split('T')[0];
            filterFecha.value = hoy;
        }

        window.subCargarCatalogo();
        window.subCargarDatos();
    };

    // ── Helper de Peticiones con Token de Sesión ─────────────────
    function _subFetch(url, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        var token = localStorage.getItem('fleet_token') || localStorage.getItem('token') || '';
        if (token && !opts.headers['Authorization']) {
            opts.headers['Authorization'] = 'Bearer ' + token;
        }
        return fetch(url, opts).then(function(r) {
            if (!r.ok) {
                return r.json().catch(function(){ return {}; }).then(function(e) { 
                    throw new Error(e.error || ('Error ' + r.status)); 
                });
            }
            return r.json();
        });
    }

    // ── Cargar Catálogo de Placas y Conductores ───────────────────
    window.subCargarCatalogo = async function() {
        try {
            const data = await _subFetch('/api/seguridad/recursos').catch(() => null);
            if (data && (data.placas || data.conductores)) {
                let tractos = [];
                if (data.tractosPorEmpresa) {
                    Object.values(data.tractosPorEmpresa).forEach(arr => {
                        if (Array.isArray(arr)) tractos.push(...arr);
                    });
                }
                if (tractos.length === 0 && data.placas) {
                    const carretasSet = new Set(data.carretasGlobales || []);
                    tractos = data.placas.filter(p => !carretasSet.has(p));
                }

                window._subCatalogo = {
                    tractos: Array.from(new Set(tractos)),
                    carretas: data.carretasGlobales || [],
                    todas: data.placas || [],
                    conductores: data.conductores || []
                };
                return;
            }

            const dataAlt = await _subFetch('/api/seguridad/unidades-base/catalogo-placas');
            if (dataAlt) {
                window._subCatalogo = {
                    tractos: (dataAlt.tractos || []).map(p => p.placa || p),
                    carretas: (dataAlt.carretas || []).map(p => p.placa || p),
                    todas: (dataAlt.todas || []).map(p => p.placa || p),
                    conductores: dataAlt.conductores || []
                };
            }
        } catch(e) {
            console.warn('Advertencia cargando catálogo:', e.message);
        }
    };

    // ── Autocomplete Flotante ─────────────────────────────────────
    window._subHandleAutoInput = async function(input, type) {
        var allLists = document.querySelectorAll('.sub-autocomplete-list');
        allLists.forEach(function(l) {
            if (l !== input.nextElementSibling) l.classList.remove('show');
        });

        document.querySelectorAll('#modalSubUnidad .card, #modalSubUnidad .sub-form-card').forEach(c => c.style.zIndex = '1');
        var parentCard = input.closest('.sub-form-card');
        if (parentCard) parentCard.style.zIndex = '1050';

        var val = (input.value || '').toLowerCase().trim();
        var listEl = input.nextElementSibling;
        if (!listEl || !listEl.classList.contains('sub-autocomplete-list')) return;

        if (!window._subCatalogo || (!window._subCatalogo.tractos?.length && !window._subCatalogo.conductores?.length)) {
            await window.subCargarCatalogo();
        }

        var items = [];
        var catalogo = window._subCatalogo || {};

        if (type === 'tractos') {
            items = catalogo.tractos || [];
        } else if (type === 'carretas') {
            items = catalogo.carretas || [];
        } else if (type === 'conductores') {
            items = catalogo.conductores || [];
        }

        var filtered = items.filter(function(item) {
            if (!val) return true;
            return String(item).toLowerCase().includes(val);
        });

        filtered = filtered.slice(0, 50);

        var html = '';
        if (filtered.length === 0) {
            html = '<div class="sub-autocomplete-empty">No se encontraron coincidencias...</div>';
        } else {
            filtered.forEach(function(item) {
                var safeItem = String(item).replace(/'/g, "\\'");
                html += '<div class="sub-autocomplete-item" onclick="window._subSelectAutoItem(\'' + input.id + '\', \'' + safeItem + '\')">' + item + '</div>';
            });
        }

        listEl.innerHTML = html;
        listEl.classList.add('show');
    };

    window._subSelectAutoItem = function(inputId, value) {
        var input = document.getElementById(inputId);
        if (input) {
            input.value = value;
            var listEl = input.nextElementSibling;
            if (listEl) listEl.classList.remove('show');
        }
        document.querySelectorAll('#modalSubUnidad .card, #modalSubUnidad .sub-form-card').forEach(c => c.style.zIndex = '1');
    };

    // Cerrar listas de autocomplete al hacer clic fuera
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.sub-autocomplete-wrap')) {
            var lists = document.querySelectorAll('.sub-autocomplete-list');
            lists.forEach(function(l) { l.classList.remove('show'); });
            document.querySelectorAll('#modalSubUnidad .card, #modalSubUnidad .sub-form-card').forEach(c => c.style.zIndex = '1');
        }
    });

    // ── Cargar Datos en Vivo ──────────────────────────────────────
    window.subCargarDatos = async function() {
        const tbody = document.getElementById('sub-tbody');
        const search = document.getElementById('sub-filter-search')?.value || '';
        if (tbody && !search && (!window._subData || window._subData.length === 0)) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-5 text-secondary">
                        <div class="spinner-border spinner-border-sm text-primary me-2"></div> Sincronizando unidades...
                    </td>
                </tr>
            `;
        }

        const fecha = document.getElementById('sub-filter-fecha')?.value || '';
        const corte = window._subCorteActivo || 'ALL';
        const estado = document.getElementById('sub-filter-estado')?.value || 'ALL';
        const empresa = window._subEmpresaActiva || 'TODAS';

        const params = new URLSearchParams();
        if (fecha) params.append('fecha', fecha);
        if (corte && corte !== 'ALL') params.append('corte', corte);
        if (estado && estado !== 'ALL') params.append('estado', estado);
        if (search) params.append('search', search);
        if (empresa && empresa !== 'TODAS') params.append('empresa', empresa);

        try {
            const data = await _subFetch(`/api/seguridad/unidades-base/panorama-en-vivo?${params.toString()}`);
            if (data.ok) {
                window._subPanoramaData = data;
                window._subData = data.items || [];
                window.subActualizarKPIs(data.kpis);
                window.subRenderTabla(window._subData);
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">Error: ${data.error || 'No se pudieron obtener los datos'}</td></tr>`;
            }
        } catch(err) {
            console.error('Error cargando unidades en base:', err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">Error de conexión con el servidor.</td></tr>`;
        }
    };

    // ── Actualizar KPIs Bento ─────────────────────────────────────
    window.subActualizarKPIs = function(kpis = {}) {
        const elTotal = document.getElementById('sub-kpi-total');
        const elBase = document.getElementById('sub-kpi-base');
        const elRuta = document.getElementById('sub-kpi-ruta');
        const elTaller = document.getElementById('sub-kpi-taller');

        if (elTotal) elTotal.textContent = kpis.totalFlota ?? 0;
        if (elBase) elBase.textContent = kpis.enBase ?? 0;
        if (elRuta) elRuta.textContent = kpis.enRuta ?? 0;
        if (elTaller) elTaller.textContent = kpis.enTaller ?? 0;
    };

    // ── Helper: Formatear Nombre de Conductor a Title Case (Mayúsculas y Minúsculas) ──
    function _subFormatNombreConductor(nombre) {
        if (!nombre || !nombre.trim() || nombre.trim() === '---' || nombre.trim() === '—') return '---';
        const trimmed = nombre.trim();
        if (trimmed.toLowerCase() === 'sin asignar' || trimmed.toLowerCase() === 'sin conductor') return 'Sin asignar';

        const minusculas = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'o', 'u', 'da', 'do', 'dos', 'das']);
        const palabras = trimmed.toLowerCase().split(/\s+/);
        return palabras.map((palabra, idx) => {
            if (!palabra) return '';
            if (idx > 0 && minusculas.has(palabra)) {
                return palabra;
            }
            return palabra.charAt(0).toUpperCase() + palabra.slice(1);
        }).join(' ');
    }

    // ── Clasificar Registro por Grupo ─────────────────────────────
    window.subDeterminarTipo = function(r) {
        if (r.esRuta === true) {
            return 'EN RUTA (EN OPERACIÓN)';
        }

        const zona = (r.zona || 'Base').trim().toUpperCase();

        if (zona.includes('MANTENIMIENTO') || zona.includes('TALLER')) {
            return 'EN MANTENIMIENTO / TALLER';
        }

        if (zona.includes('LAVADO')) {
            return 'EN LAVADO';
        }

        const tieneCamion = Boolean(r.placa_camion && r.placa_camion.trim() && r.placa_camion.trim() !== '—' && r.placa_camion.trim() !== '---');
        const tieneCarreta = Boolean(r.placa_carreta && r.placa_carreta.trim() && r.placa_carreta.trim() !== '—' && r.placa_carreta.trim() !== '---');

        if (tieneCamion && tieneCarreta) return 'EN BASE (CAMIÓN - CARRETA)';
        if (tieneCamion && !tieneCarreta) return 'EN BASE (SOLO CAMIÓN / TRACTO)';
        return 'EN BASE (SOLO CARRETA / REMOLQUE)';
    };

    // ── Renderizar Tabla Segmentada ───────────────────────────────
    window.subRenderTabla = function(items = []) {
        const tbody = document.getElementById('sub-tbody');
        if (!tbody) return;

        let filteredItems = items || [];

        // 1. Filtro por Búsqueda (Texto en vivo)
        const searchInput = document.getElementById('sub-filter-search');
        const searchVal = (searchInput ? searchInput.value : '').trim().toUpperCase();
        const clean = str => (str || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');

        if (searchVal) {
            const cleanQ = clean(searchVal);
            filteredItems = filteredItems.filter(it => {
                const cPlaca = clean(it.placa);
                const cCamion = clean(it.placa_camion);
                const cCarreta = clean(it.placa_carreta);
                const cCond = clean(it.conductor);
                const cUbic = clean(it.ubicacion || it.zona);
                const cDest = clean(it.destino);
                const cViaje = clean(it.orden_viaje);
                const cObs = clean(it.observacion);
                const cMarca = clean(it.marca);

                return (cPlaca && cPlaca.includes(cleanQ)) ||
                       (cCamion && cCamion.includes(cleanQ)) ||
                       (cCarreta && cCarreta.includes(cleanQ)) ||
                       (cCond && cCond.includes(cleanQ)) ||
                       (cUbic && cUbic.includes(cleanQ)) ||
                       (cDest && cDest.includes(cleanQ)) ||
                       (cViaje && cViaje.includes(cleanQ)) ||
                       (cObs && cObs.includes(cleanQ)) ||
                       (cMarca && cMarca.includes(cleanQ));
            });
        }

        // 2. Filtro por Estado Dropdown
        const estadoSel = document.getElementById('sub-filter-estado')?.value || 'ALL';
        if (estadoSel && estadoSel !== 'ALL') {
            if (estadoSel === 'En Ruta') {
                filteredItems = filteredItems.filter(r => r.esRuta === true);
            } else {
                filteredItems = filteredItems.filter(r => {
                    const st = String(r.estado || r.estado_carga || '').toUpperCase();
                    return st.includes(estadoSel.toUpperCase());
                });
            }
        }

        // 3. Filtro por KPI Card seleccionado
        if (window._subEstadoFiltroVista && window._subEstadoFiltroVista !== 'ALL') {
            if (window._subEstadoFiltroVista === 'BASE') {
                filteredItems = filteredItems.filter(r => r.esRuta !== true && !String(r.zona || '').toUpperCase().includes('MANTENIMIENTO') && !String(r.zona || '').toUpperCase().includes('TALLER') && !String(r.zona || '').toUpperCase().includes('LAVADO'));
            } else if (window._subEstadoFiltroVista === 'RUTA') {
                filteredItems = filteredItems.filter(r => r.esRuta === true);
            } else if (window._subEstadoFiltroVista === 'TALLER') {
                filteredItems = filteredItems.filter(r => String(r.zona || '').toUpperCase().includes('MANTENIMIENTO') || String(r.zona || '').toUpperCase().includes('TALLER') || String(r.zona || '').toUpperCase().includes('LAVADO'));
            }
        }

        if (!filteredItems || filteredItems.length === 0) {
            const empNombre = window._subEmpresaActiva === 'TODAS' ? 'el filtro seleccionado' : window._subEmpresaActiva;
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-5 text-secondary">
                        <i class="bi bi-inbox fs-3 d-block mb-2 text-muted"></i>
                        No se encontraron unidades registradas para <b>${empNombre}</b>.
                    </td>
                </tr>
            `;
            return;
        }

        const grupos = {
            'EN BASE (CAMIÓN - CARRETA)': [],
            'EN BASE (SOLO CAMIÓN / TRACTO)': [],
            'EN BASE (SOLO CARRETA / REMOLQUE)': [],
            'EN RUTA (EN OPERACIÓN)': [],
            'EN MANTENIMIENTO / TALLER': [],
            'EN LAVADO': []
        };

        filteredItems.forEach(r => {
            const t = window.subDeterminarTipo(r);
            if (grupos[t]) grupos[t].push(r);
            else grupos['EN BASE (CAMIÓN - CARRETA)'].push(r);
        });

        let html = '';

        const ordenGrupos = [
            { key: 'EN BASE (CAMIÓN - CARRETA)', icon: 'bi-truck-flatbed', color: '#0284c7' },
            { key: 'EN BASE (SOLO CAMIÓN / TRACTO)', icon: 'bi-truck-front-fill', color: '#16a34a' },
            { key: 'EN BASE (SOLO CARRETA / REMOLQUE)', icon: 'bi-box-seam-fill', color: '#d97706' },
            { key: 'EN RUTA (EN OPERACIÓN)', icon: 'bi-signpost-2-fill', color: '#2563eb' },
            { key: 'EN MANTENIMIENTO / TALLER', icon: 'bi-tools', color: '#dc2626' },
            { key: 'EN LAVADO', icon: 'bi-droplet-fill', color: '#0891b2' }
        ];

        ordenGrupos.forEach(g => {
            const list = grupos[g.key];
            if (!list || list.length === 0) return;

            html += `
                <tr class="sub-section-divider">
                    <td colspan="9">
                        <i class="bi ${g.icon} me-1" style="color:${g.color};"></i>
                        ${g.key} <span class="badge bg-white text-dark border ms-2">${list.length}</span>
                    </td>
                </tr>
            `;

            list.forEach(r => {
                let textoCorte = r.corte || 'Corte 1';
                if (r.corte_hora) {
                    textoCorte += ` • ${r.corte_hora.substring(0, 5)}`;
                }
                let badgeCorte = `<span class="badge-corte-1">${textoCorte}</span>`;
                if (r.corte === 'Corte 2') badgeCorte = `<span class="badge-corte-2">${textoCorte}</span>`;
                if (r.esRuta) {
                    badgeCorte = `<span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-bold" style="font-size:0.72rem;"><i class="bi bi-broadcast me-1"></i>En Ruta</span>`;
                }

                let badgeEstado = `<span class="badge-estado-cargado">Cargado</span>`;
                if (r.estado === 'Con Devolución') badgeEstado = `<span class="badge-estado-devolucion">Con Devolución</span>`;
                if (r.estado === 'Vacío') badgeEstado = `<span class="badge-estado-vacio">Vacío</span>`;
                if (r.estado === 'Disponible') badgeEstado = `<span class="badge-estado-cargado">Disponible</span>`;
                if (r.esRuta) badgeEstado = `<span class="badge-estado-ruta"><i class="bi bi-geo-alt-fill me-1"></i>En Tránsito</span>`;

                const placaCamionHtml = (r.placa_camion && r.placa_camion.trim() && r.placa_camion.trim() !== '—' && r.placa_camion.trim() !== '---')
                    ? `<span class="fw-bold text-dark font-monospace" style="font-size:0.9rem;">${r.placa_camion}</span>`
                    : `<span class="text-muted small">—</span>`;

                const placaCarretaHtml = (r.placa_carreta && r.placa_carreta.trim() && r.placa_carreta.trim() !== '—' && r.placa_carreta.trim() !== '---') 
                    ? `<span class="fw-bold text-dark font-monospace" style="font-size:0.9rem;">${r.placa_carreta}</span>` 
                    : `<span class="text-muted small">—</span>`;

                const conductorHtml = (r.conductor && r.conductor.trim() && r.conductor.trim() !== '—' && r.conductor.trim() !== '---')
                    ? `<span class="fw-semibold text-dark">${r.conductor}</span>`
                    : `<span class="text-muted small">—</span>`;

                const empresaTitular = r.empresaTitular || r.empresa || '—';
                const ubicacionHtml = r.esRuta 
                    ? `<span class="text-primary fw-bold"><i class="bi bi-geo-alt-fill me-1"></i>${r.zona || 'En Ruta'}</span>`
                    : `<span class="fw-semibold text-dark">${r.zona || 'Base'}</span>`;

                let accionesHtml = '';
                if (!r.esRuta && r.id) {
                    accionesHtml = `
                        <button class="sub-btn-edit-cell me-1" title="Editar" onclick='window.subAbrirModalEditar(${JSON.stringify(r)})'>
                            <i class="bi bi-pencil-fill"></i>
                        </button>
                        <button class="sub-btn-del-cell" title="Eliminar" onclick="window.subEliminar(${r.id})">
                            <i class="bi bi-trash3-fill"></i>
                        </button>
                    `;
                } else if (r.esRuta) {
                    accionesHtml = `<span class="badge bg-light text-secondary border fw-normal" style="font-size:0.72rem;">Checklist Activo</span>`;
                } else {
                    const isCarreta = (!r.placa_camion || r.placa_camion === '—' || r.placa_camion === '---') && Boolean(r.placa_carreta && r.placa_carreta !== '—');
                    const targetPlaca = isCarreta ? (r.placa_carreta || '') : (r.placa_camion || '');
                    accionesHtml = `
                        <button class="btn btn-xs btn-outline-primary py-0 px-2 fw-bold" style="font-size:0.72rem;" onclick="window.subAbrirModalNuevoConPlaca('${targetPlaca}', ${isCarreta})">
                            <i class="bi bi-plus"></i> Registrar
                        </button>
                    `;
                }

                html += `
                    <tr>
                        <td>${badgeCorte}</td>
                        <td>${placaCamionHtml}</td>
                        <td>${placaCarretaHtml}</td>
                        <td>${conductorHtml}</td>
                        <td><span class="badge bg-light text-dark border fw-semibold" style="font-size:0.74rem;">${empresaTitular}</span></td>
                        <td>${ubicacionHtml}</td>
                        <td>${badgeEstado}</td>
                        <td class="text-secondary small" style="max-width:240px; word-break:break-word;">${r.observacion || '—'}</td>
                        <td class="text-end text-nowrap">${accionesHtml}</td>
                    </tr>
                `;
            });
        });

        tbody.innerHTML = html;
    };

    // ── Cambiar Filtro de Empresa ─────────────────────────────────
    window.subCambiarEmpresa = function(empresa) {
        window._subEmpresaActiva = empresa || 'TODAS';
        document.querySelectorAll('#sub-empresa-segmented .sub-segment-item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-empresa') === window._subEmpresaActiva);
        });
        window.subCargarDatos();
    };

    // ── Filtrar Estado desde los Cards de KPI ─────────────────────
    window.subFiltrarEstadoVista = function(estado) {
        window._subEstadoFiltroVista = estado;
        document.querySelectorAll('.sub-kpi-card').forEach(c => c.classList.remove('active'));
        
        if (estado === 'ALL') document.getElementById('kpi-card-total')?.classList.add('active');
        else if (estado === 'BASE') document.getElementById('kpi-card-base')?.classList.add('active');
        else if (estado === 'RUTA') document.getElementById('kpi-card-ruta')?.classList.add('active');
        else if (estado === 'TALLER') document.getElementById('kpi-card-taller')?.classList.add('active');

        window.subRenderTabla(window._subData);
    };

    // ── Filtrar por Segmented Cortes Horarios ─────────────────────
    window.subFiltrarCorteSegmented = function(corte) {
        window._subCorteActivo = corte || 'ALL';
        document.querySelectorAll('#sub-segmented-cortes .sub-segment-item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-corte') === window._subCorteActivo);
        });
        window.subCargarDatos();
    };

    // ── Debounce de Búsqueda ──────────────────────────────────────
    window.subDebounceBusqueda = function() {
        // Filtrado instantáneo en caliente en 0ms
        if (window._subData && Array.isArray(window._subData)) {
            window.subRenderTabla(window._subData);
        }
        clearTimeout(_subDebounceTimeout);
        _subDebounceTimeout = setTimeout(() => {
            window.subCargarDatos();
        }, 350);
    };

    // ── ⚡ Sincronización Automática 1-Click (Sin modales innecesarios) ──
    window.subSincronizarTurnoDirecto = async function() {
        const hoy = new Date().toISOString().split('T')[0];
        const corteAuto = window.subObtenerCorteActual();
        const btn = document.getElementById('sub-btn-sync-quick');

        if (btn) {
            btn.innerHTML = '<span class="spinner-border spinner-border-sm text-warning"></span>';
            btn.style.pointerEvents = 'none';
        }

        try {
            const data = await _subFetch('/api/seguridad/unidades-base/sincronizar-corte', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fecha: hoy, corte: corteAuto })
            });

            if (data.ok) {
                window.mostrarToast(`¡Sincronizado con éxito! (${corteAuto})`, 'success');
                window.subCargarDatos();
            } else {
                window.mostrarToast(data.error || 'No se pudo sincronizar el turno', 'danger');
            }
        } catch(e) {
            console.error('Error al sincronizar turno:', e);
            window.mostrarToast('Error al conectar con el servidor', 'danger');
        } finally {
            if (btn) {
                btn.innerHTML = '<i class="bi bi-lightning-charge-fill text-warning"></i>';
                btn.style.pointerEvents = 'auto';
            }
        }
    };

    // ── Abrir Modal Nuevo ─────────────────────────────────────────
    window.subAbrirModalNuevo = function() {
        document.getElementById('formSubUnidad')?.reset();
        document.getElementById('sub-form-id').value = '';
        document.getElementById('modalSubTitulo').textContent = 'Nuevo Registro de Unidad en Base';
        document.getElementById('modalSubSubtitulo').textContent = 'Control de permanencia vehicular';

        const hoy = new Date().toISOString().split('T')[0];
        const corteAuto = window.subObtenerCorteActual();

        const inputFecha = document.getElementById('sub-form-fecha');
        const inputCorte = document.getElementById('sub-form-corte');
        const inputZona = document.getElementById('sub-form-zona');
        const inputEstado = document.getElementById('sub-form-estado');

        if (inputFecha) inputFecha.value = hoy;
        if (inputCorte) inputCorte.value = corteAuto;
        if (inputZona) inputZona.value = 'Base';
        if (inputEstado) inputEstado.value = 'Cargado';

        const modalEl = document.getElementById('modalSubUnidad');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.subAbrirModalNuevoConPlaca = function(placa, esCarreta = false) {
        window.subAbrirModalNuevo();
        if (esCarreta) {
            const inputCarreta = document.getElementById('sub-form-placa-carreta');
            if (inputCarreta) inputCarreta.value = placa;
        } else {
            const inputPlaca = document.getElementById('sub-form-placa-camion');
            if (inputPlaca) inputPlaca.value = placa;
        }
    };

    // ── Abrir Modal Editar ────────────────────────────────────────
    window.subAbrirModalEditar = function(r) {
        if (!r) return;
        document.getElementById('sub-form-id').value = r.id || '';
        const tituloPlaca = (r.placa_camion && r.placa_camion !== '—') ? r.placa_camion : (r.placa_carreta || 'Unidad');
        document.getElementById('modalSubTitulo').textContent = 'Editar Registro de Unidad';
        document.getElementById('modalSubSubtitulo').textContent = `Placa: ${tituloPlaca}`;

        let f = r.fecha ? r.fecha.split('T')[0] : new Date().toISOString().split('T')[0];
        document.getElementById('sub-form-fecha').value = f;
        document.getElementById('sub-form-corte').value = r.corte || 'Corte 1';
        document.getElementById('sub-form-placa-camion').value = (r.placa_camion && r.placa_camion !== '—' && r.placa_camion !== '---') ? r.placa_camion : '';
        document.getElementById('sub-form-placa-carreta').value = (r.placa_carreta && r.placa_carreta !== '—' && r.placa_carreta !== '---') ? r.placa_carreta : '';
        document.getElementById('sub-form-conductor').value = (r.conductor && r.conductor !== '—' && r.conductor !== '---' && r.conductor !== 'Sin asignar') ? r.conductor : '';
        document.getElementById('sub-form-zona').value = r.zona || 'Base';
        document.getElementById('sub-form-estado').value = r.estado || 'Cargado';
        document.getElementById('sub-form-obs').value = r.observacion || '';

        const modalEl = document.getElementById('modalSubUnidad');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // ── Guardar Registro ──────────────────────────────────────────
    window.subGuardarRegistro = async function() {
        const id = document.getElementById('sub-form-id').value;
        const fecha = document.getElementById('sub-form-fecha').value;
        const corte = document.getElementById('sub-form-corte').value;
        const placaCamion = (document.getElementById('sub-form-placa-camion').value || '').trim();
        const placaCarreta = (document.getElementById('sub-form-placa-carreta').value || '').trim();
        const conductor = (document.getElementById('sub-form-conductor').value || '').trim();
        const zona = document.getElementById('sub-form-zona').value;
        const estado = document.getElementById('sub-form-estado').value;
        const observacion = document.getElementById('sub-form-obs').value;

        if (!fecha || !corte || (!placaCamion && !placaCarreta)) {
            window.mostrarToast('Por favor completa la fecha, corte y al menos la placa del camión o carreta', 'warning');
            return;
        }

        const btn = document.getElementById('btnSubGuardar');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...'; }

        const payload = {
            fecha, corte, placa_camion: placaCamion, placa_carreta: placaCarreta,
            conductor, zona, estado, observacion
        };

        try {
            const url = id ? `/api/seguridad/unidades-base/${id}` : '/api/seguridad/unidades-base';
            const method = id ? 'PUT' : 'POST';

            const data = await _subFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (data.ok) {
                window.mostrarToast(id ? 'Registro actualizado correctamente' : 'Unidad registrada en base', 'success');
                const modalEl = document.getElementById('modalSubUnidad');
                if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
                window.subCargarDatos();
            } else {
                window.mostrarToast(data.error || 'Error al procesar el registro', 'danger');
            }
        } catch(err) {
            console.error('Error al guardar unidad en base:', err);
            window.mostrarToast('Error de conexión con el servidor', 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Guardar Registro'; }
        }
    };

    // ── Eliminar Registro ─────────────────────────────────────────
    let _subIdParaEliminar = null;

    window.subEliminar = function(id) {
        _subIdParaEliminar = id;
        const modalEl = document.getElementById('sub-delete-modal');
        if (modalEl) {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
    };

    window._subEjecutarEliminacionConfirmada = async function() {
        if (!_subIdParaEliminar) return;
        const id = _subIdParaEliminar;
        _subIdParaEliminar = null;

        const modalEl = document.getElementById('sub-delete-modal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

        try {
            const data = await _subFetch(`/api/seguridad/unidades-base/${id}`, { method: 'DELETE' });
            if (data.ok) {
                window.mostrarToast('Registro eliminado correctamente', 'info');
                window.subCargarDatos();
            } else {
                window.mostrarToast(data.error || 'No se pudo eliminar', 'danger');
            }
        } catch(e) {
            window.mostrarToast('Error al intentar eliminar', 'danger');
        }
    };

    // ── Construir HTML del Documento PDF A4 Oficial (F-SEG-0010) ───
    function _subBuildPdfHtml() {
        const fechaFiltro = document.getElementById('sub-filter-fecha')?.value || new Date().toISOString().split('T')[0];
        const corteFiltro = window._subCorteActivo || 'ALL';
        const fParts = fechaFiltro.split('-');
        const fechaFormateada = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}/${fParts[0]}` : fechaFiltro;

        const items = window._subData || [];
        const empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';

        const grupos = {
            'EN BASE (CAMIÓN - CARRETA)': [],
            'EN BASE (SOLO CAMIÓN / TRACTO)': [],
            'EN BASE (SOLO CARRETA / REMOLQUE)': [],
            'EN RUTA (EN OPERACIÓN)': [],
            'EN MANTENIMIENTO / TALLER': [],
            'EN LAVADO': []
        };

        items.forEach(r => {
            const t = window.subDeterminarTipo(r);
            if (grupos[t]) grupos[t].push(r);
            else grupos['EN BASE (CAMIÓN - CARRETA)'].push(r);
        });

        let filasHtml = '';
        let itemIndex = 1;

        const ordenGrupos = [
            'EN BASE (CAMIÓN - CARRETA)',
            'EN BASE (SOLO CAMIÓN / TRACTO)',
            'EN BASE (SOLO CARRETA / REMOLQUE)',
            'EN RUTA (EN OPERACIÓN)',
            'EN MANTENIMIENTO / TALLER',
            'EN LAVADO'
        ];

        ordenGrupos.forEach(gKey => {
            const list = grupos[gKey];
            if (!list || list.length === 0) return;

            filasHtml += `
                <tr style="background:#e2e8f0; font-weight:bold;">
                    <td colspan="7" style="padding: 4px 6px; font-weight:800; font-size:9.5px; text-transform:uppercase; letter-spacing:0.5px; border: 1.5px solid #000;">
                        ■ ${gKey} (${list.length} ${list.length === 1 ? 'UNIDAD' : 'UNIDADES'})
                    </td>
                </tr>
            `;

            list.forEach(r => {
                const camionStr = (r.placa_camion && r.placa_camion.trim() && r.placa_camion.trim() !== '—' && r.placa_camion.trim() !== '---') ? r.placa_camion : '—';
                const carretaStr = (r.placa_carreta && r.placa_carreta.trim() && r.placa_carreta.trim() !== '—' && r.placa_carreta.trim() !== '---') ? r.placa_carreta : '—';
                const conductorFormateado = _subFormatNombreConductor(r.conductor);
                const zonaStr = r.zona || 'Base';

                filasHtml += `
                    <tr>
                        <td style="text-align:center; font-weight:bold; width:28px; padding:3px 2px; border:1px solid #000; font-size:9px;">${itemIndex++}</td>
                        <td style="text-align:center; font-weight:bold; color:#0f172a; width:58px; padding:3px 2px; border:1px solid #000; font-size:9px;">${r.esRuta ? 'En Ruta' : (r.corte || 'Corte 1')}</td>
                        <td style="text-align:center; font-family:monospace; font-weight:bold; font-size:10px; width:82px; padding:3px 2px; border:1px solid #000;">${camionStr}</td>
                        <td style="text-align:center; font-family:monospace; font-size:10px; width:80px; padding:3px 2px; border:1px solid #000;">${carretaStr}</td>
                        <td style="width:175px; font-size:9.5px; padding:3px 6px; border:1px solid #000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${conductorFormateado}</td>
                        <td style="text-align:center; font-weight:600; width:115px; font-size:9.5px; padding:3px 4px; border:1px solid #000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${zonaStr}</td>
                        <td style="font-size:9px; word-break:break-word; padding:3px 4px; border:1px solid #000;">${r.observacion || ''}</td>
                    </tr>
                `;
            });
        });

        return `
            <div style="width:210mm; min-height:297mm; background:#ffffff; padding:10mm 12mm; margin:0 auto; box-sizing:border-box; font-family:'Inter', sans-serif; color:#000000; display:flex; flex-direction:column;">
                <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:6px; table-layout:fixed;">
                    <tr>
                        <td style="width:22%; padding:4px; border:1px solid #000; text-align:center; vertical-align:middle;" rowspan="3">
                            <img src="${empLogoUrl}" alt="Logo Empresa" style="max-height:46px; max-width:100%; object-fit:contain;">
                        </td>
                        <td style="width:54%; border:1px solid #000; text-align:center; vertical-align:middle; font-size:18px; font-weight:700; line-height:1.1; text-transform:uppercase;" rowspan="3">
                            STATUS "UNIDADES EN BASE"<br>
                            <span style="font-size:10px; font-weight:500; color:#333; letter-spacing:0.5px; display:block; margin-top:3px;">CONTROL Y SEGURIDAD PATRIMONIAL</span>
                        </td>
                        <td style="width:24%; border:1px solid #000; font-size:9.5px; text-align:left; padding:2px 6px; height:17px;"><b>CÓDIGO:</b> F-SEG-0010</td>
                    </tr>
                    <tr><td style="border:1px solid #000; font-size:9.5px; text-align:left; padding:2px 6px; height:17px;"><b>VERSIÓN:</b> 0</td></tr>
                    <tr><td style="border:1px solid #000; font-size:9.5px; text-align:left; padding:2px 6px; height:17px;"><b>F. EMISIÓN:</b> ${fechaFormateada}</td></tr>
                </table>

                <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:6px; font-size:10.5px; font-weight:bold;">
                    <tr>
                        <td style="width:30%; border:1px solid #000; padding:4px 6px;">FECHA: <span style="font-weight:normal; margin-left:4px;">${fechaFormateada}</span></td>
                        <td style="width:35%; border:1px solid #000; padding:4px 6px;">EMPRESA: <span style="font-weight:normal; margin-left:4px;">${window._subEmpresaActiva}</span></td>
                        <td style="width:35%; border:1px solid #000; padding:4px 6px;">TOTAL REGISTRADAS: <span style="font-weight:bold; color:#0284c7; margin-left:4px;">${items.length}</span></td>
                    </tr>
                </table>

                <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:8px; font-size:9.5px; table-layout:fixed;">
                    <thead>
                        <tr style="background-color:#333333; color:#ffffff;">
                            <th style="width:28px; text-align:center; padding:5px 2px; border:1px solid #000; font-size:9px;">#</th>
                            <th style="width:58px; text-align:center; padding:5px 2px; border:1px solid #000; font-size:9px;">CORTE</th>
                            <th style="width:82px; text-align:center; padding:5px 2px; border:1px solid #000; font-size:9px;">SOLO CAMIÓN</th>
                            <th style="width:80px; text-align:center; padding:5px 2px; border:1px solid #000; font-size:9px;">CARRETA</th>
                            <th style="width:175px; text-align:center; padding:5px 4px; border:1px solid #000; font-size:9px;">CONDUCTOR</th>
                            <th style="width:115px; text-align:center; padding:5px 4px; border:1px solid #000; font-size:9px;">ZONA</th>
                            <th style="text-align:center; padding:5px 4px; border:1px solid #000; font-size:9px;">OBSERVACIONES</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasHtml}
                    </tbody>
                </table>

                <div style="margin-top:auto; border-top:1px solid #000; padding-top:6px; display:flex; justify-content:space-between; font-size:9px; color:#333;">
                    <div><b>ERP Azkell Fleet</b> — Módulo de Seguridad y Control Patrimonial</div>
                    <div>Generado el: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}</div>
                </div>
            </div>
        `;
    }

    // ── Motor de Generación de Blob PDF en Iframe Oculto ───────────
    async function _subRenderPdfBlob(htmlBody, filename) {
        return new Promise(function(resolve, reject) {
            var iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed; top:-10000px; left:-10000px; width:840px; height:1200px; border:none; z-index:-999;';
            document.body.appendChild(iframe);

            var doc = iframe.contentWindow.document;
            doc.open();
            doc.write('<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n'
                + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
                + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n'
                + '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></scr' + 'ipt>\n'
                + '<style>\n'
                + 'body { background-color:#FFFFFF; color:#0F172A; margin:0; padding:0; font-family:"Inter", sans-serif; }\n'
                + '</style>\n</head>\n<body>\n'
                + '<div id="sub-pdf-render-root">' + htmlBody + '</div>\n'
                + '</body>\n</html>');
            doc.close();

            iframe.onload = async function() {
                try {
                    await new Promise(function(r) { setTimeout(r, 400); });
                    var targetEl = doc.getElementById('sub-pdf-render-root');
                    var opt = {
                        margin:       0,
                        filename:     filename,
                        image:        { type: 'jpeg', quality: 0.98 },
                        html2canvas:  { scale: 2.2, useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: 840 },
                        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    };

                    var pdfBlob = await iframe.contentWindow.html2pdf().set(opt).from(targetEl).outputPdf('blob');
                    iframe.remove();
                    resolve(pdfBlob);
                } catch(e) {
                    iframe.remove();
                    reject(e);
                }
            };
        });
    }

    // ── 📲 COMPARTIR PDF POR WHATSAPP (1:1 Checklist de Unidades) ──
    window.subCompartirWhatsAppPDF = async function() {
        const fechaFiltro = document.getElementById('sub-filter-fecha')?.value || new Date().toISOString().split('T')[0];
        const fParts = fechaFiltro.split('-');
        const fechaFormateada = fParts.length === 3 ? `${fParts[2]}-${fParts[1]}-${fParts[0]}` : fechaFiltro;
        const filename = `${fechaFormateada} - Status Unidades en Base.pdf`;

        const btn = document.getElementById('sub-btn-share-pdf');
        if (btn) {
            btn.innerHTML = '<span class="spinner-border spinner-border-sm text-success"></span>';
            btn.style.pointerEvents = 'none';
        }

        window.mostrarToast('Preparando PDF para WhatsApp...', 'info');

        try {
            const htmlFinal = _subBuildPdfHtml();
            const pdfBlob = await _subRenderPdfBlob(htmlFinal, filename);
            const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

            // 1. Compartir nativo (Abre el diálogo del sistema para elegir la app de WhatsApp con el PDF adjunto)
            if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                try {
                    await navigator.share({
                        files: [pdfFile],
                        title: filename
                    });
                    return;
                } catch (shareErr) {
                    if (shareErr.name === 'AbortError') return; // Cancelado por el usuario
                    console.warn('Error en navigator.share:', shareErr);

                    if (shareErr.name === 'NotAllowedError') {
                        window._subPendingPdfFile = pdfFile;
                        window._subPendingPdfFilename = filename;
                        _subMostrarBotonReintentarShare();
                        return;
                    }
                }
            }

            // 2. Si el dispositivo no soporta navigator.share con archivos:
            window.location.href = 'whatsapp://';
            window.mostrarToast('Abriendo aplicación WhatsApp...', 'success');
        } catch(err) {
            console.error('Error al compartir PDF por WhatsApp:', err);
            window.mostrarToast('Error al generar PDF: ' + err.message, 'danger');
        } finally {
            if (btn) {
                btn.innerHTML = '<i class="bi bi-whatsapp text-success"></i>';
                btn.style.pointerEvents = 'auto';
            }
        }
    };

    // ── Helper para reintentar compartir con gesto directo si el navegador lo bloqueó ──
    function _subMostrarBotonReintentarShare() {
        var existing = document.getElementById('sub-reintentar-share-overlay');
        if (existing) existing.remove();

        var div = document.createElement('div');
        div.id = 'sub-reintentar-share-overlay';
        div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
        div.innerHTML = '<div style="background:#fff;border-radius:24px;padding:26px 20px;text-align:center;max-width:320px;width:88%;box-shadow:0 20px 40px rgba(0,0,0,0.25);">' +
            '<div style="width:58px;height:58px;background:#25D366;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 16px;">' +
            '<i class="bi bi-whatsapp"></i>' +
            '</div>' +
            '<h5 style="font-weight:800;color:#0f172a;margin-bottom:8px;font-size:1.1rem;">PDF Listo</h5>' +
            '<p style="color:#64748b;font-size:0.83rem;margin-bottom:20px;">Toca el botón para abrir WhatsApp y seleccionar el chat.</p>' +
            '<button id="sub-btn-touch-share" style="background:#25D366;color:#fff;font-weight:700;border:none;padding:12px 24px;border-radius:14px;width:100%;font-size:0.95rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 12px rgba(37,211,102,0.35);">' +
            '<i class="bi bi-share-fill"></i> Enviar por WhatsApp' +
            '</button>' +
            '<button onclick="document.getElementById(\'sub-reintentar-share-overlay\').remove()" style="background:transparent;color:#94a3b8;font-weight:600;border:none;margin-top:12px;font-size:0.8rem;cursor:pointer;">Cancelar</button>' +
            '</div>';
        document.body.appendChild(div);

        document.getElementById('sub-btn-touch-share').onclick = async function() {
            div.remove();
            if (window._subPendingPdfFile && navigator.canShare && navigator.canShare({ files: [window._subPendingPdfFile] })) {
                try {
                    await navigator.share({
                        files: [window._subPendingPdfFile],
                        title: window._subPendingPdfFilename || 'Status Unidades en Base.pdf'
                    });
                } catch(e) {
                    if (e.name !== 'AbortError') {
                        window.location.href = 'whatsapp://';
                    }
                }
            } else {
                window.location.href = 'whatsapp://';
            }
        };
    }

    // ── Exportador a PDF Oficial (F-SEG-0010) ──────────────────────
    window.subExportarPDF = function() {
        const fechaFiltro = document.getElementById('sub-filter-fecha')?.value || new Date().toISOString().split('T')[0];
        const fParts = fechaFiltro.split('-');
        const fechaFormateada = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}/${fParts[0]}` : fechaFiltro;

        const items = window._subData || [];
        if (items.length === 0) {
            window.mostrarToast('No hay registros para exportar en esta fecha', 'warning');
            return;
        }

        const ventana = window.open('', '_blank');
        if (!ventana) {
            alert('Por favor, permite las ventanas emergentes para generar el PDF.');
            return;
        }

        const htmlFinal = _subBuildPdfHtml();

        ventana.document.write(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Status Unidades en Base — F-SEG-0010</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    * { box-sizing: border-box; }
                    body {
                        background-color: #525659;
                        margin: 0;
                        padding: 20px 10px;
                        font-family: 'Inter', -apple-system, sans-serif;
                        color: #000000;
                        display: flex;
                        justify-content: center;
                    }
                    .btn-print-fixed {
                        position: fixed;
                        top: 16px;
                        right: 20px;
                        z-index: 9999;
                        background: #111827;
                        color: #ffffff;
                        border: 1px solid #374151;
                        border-radius: 6px;
                        padding: 8px 18px;
                        font-weight: 700;
                        font-size: 13px;
                        cursor: pointer;
                        box-shadow: 0 4px 14px rgba(0,0,0,0.3);
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .btn-print-fixed:hover { background: #1f2937; }
                    @media print {
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
                        body { background: #ffffff !important; padding: 0 !important; }
                        .btn-print-fixed { display: none !important; }
                        @page { size: A4 portrait; margin: 8mm; }
                    }
                </style>
            </head>
            <body>
                <button class="btn-print-fixed" onclick="window.print()">
                    🖨️ Imprimir / Guardar PDF
                </button>
                <div style="background:#ffffff; box-shadow:0 4px 25px rgba(0,0,0,0.4);">
                    ${htmlFinal}
                </div>
                <script>
                    window.onload = function() {
                        setTimeout(function() { window.print(); }, 500);
                    };
                </script>
            </body>
            </html>
        `);
        ventana.document.close();
    };

    // Auto-ejecución inmediata si la vista ya está en el DOM
    if (document.getElementById('moduloSegUnidadesBase')) {
        window.init_unidades_base();
    }
})();
