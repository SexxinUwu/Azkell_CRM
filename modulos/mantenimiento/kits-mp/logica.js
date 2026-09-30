// =========================================================================
// MÓDULO: KITS DE MANTENIMIENTO PREVENTIVO — LÓGICA REDISEÑADA (1:1 MASTER-DETAIL)
// =========================================================================

window.kitsData = window.kitsData || [];
window.kitsDataFil = window.kitsDataFil || [];
window._kitsAlmacenItems = window._kitsAlmacenItems || [];
window._kitsTiposMPList = window._kitsTiposMPList || [];
window._marcasMotorasFlota = window._marcasMotorasFlota || [];
window.kitsRowCounter = 0;
window.kitsDeletedItemIds = [];
window._kitEditandoGrupo = null;
window.kitsSidebarMarcaSeleccionada = '';
window.kitsFiltroSegmentoActual = 'TODOS';

/**
 * Entry point del módulo
 */
window['init_kits-mp'] = function () {
    if (!window.checkPerm('cfg_mant', 'l')) {
        window.showNoPermMsg('mod-kits-mp');
        return;
    }

    // Inicializar y cargar datos
    window.kitsCargarTabla(true);
};

/**
 * Cargar datos de Kits, Inventario, Tipos de Preventivo y Flota de Motoras
 */
window.kitsCargarTabla = function (forzarRecarga) {
    const tbody = document.getElementById('kits-tbody');
    const mobileContainer = document.getElementById('kitsCardContainer');

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2"></div> Cargando kits de mantenimiento...
                </td>
            </tr>
        `;
    }
    if (mobileContainer) {
        mobileContainer.innerHTML = `
            <div class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2"></div> Cargando kits de mantenimiento...
            </div>
        `;
    }

    Promise.all([
        fetch('/api/mantenimiento-kits').then(r => r.ok ? r.json() : { data: [] }),
        fetch('/api/almacen/inventario').then(r => r.ok ? r.json() : []),
        fetch('/api/tipos-preventivo').then(r => r.ok ? r.json() : { data: [] }),
        fetch('/api/placas-lista').then(r => r.ok ? r.json() : []).catch(() => [])
    ]).then(([kitsResp, invData, tiposResp, placasResp]) => {
        // 1. Mapear inventario para autocompletado, stock en vivo y sincronización de costos
        window._kitsAlmacenItems = (invData || []).map(x => {
            const nom = (x.descripcion || x.articulo || x.nombre || '').trim();
            const unid = (x.unidad || x.unidad_medida || 'UND').toUpperCase();
            const cu = parseFloat(x.costo_soles != null ? x.costo_soles : (x.costo_referencial != null ? x.costo_referencial : (x.costo_unitario || 0))) || 0;
            const stk = parseFloat(x.stock != null ? x.stock : (x.stock_actual != null ? x.stock_actual : (x.cantidad != null ? x.cantidad : 0))) || 0;
            return {
                nombre: nom,
                unidad: unid,
                costo: cu,
                stock: stk
            };
        }).filter(x => x.nombre !== '');

        // 2. Mapear tipos de preventivo
        window._kitsTiposMPList = (tiposResp.data || []).map(t => t.nombre || t.tipo || t).filter(Boolean);
        if (!window._kitsTiposMPList.length) {
            window._kitsTiposMPList = ['MP1', 'MP2', 'MP3', 'MP4', 'INSPECCION'];
        }

        // 3. Procesar datos de kits con costos y stock sincronizados
        window.kitsData = (kitsResp.data || []).map(k => {
            const cant = parseFloat(k.cantidad || 1);
            let cu = parseFloat(k.costo_unitario || 0);

            // Sincronizar con el costo y stock actual de inventario si existe
            const invItem = window._kitsAlmacenItems.find(x => x.nombre.toLowerCase() === (k.item_nombre || '').toLowerCase());
            if (invItem && invItem.costo > 0) {
                cu = invItem.costo;
            }
            const stockActual = invItem ? invItem.stock : 0;
            const ct = parseFloat(k.costo_total || (cant * cu));

            return {
                id: k.id,
                marca_vehiculo: (k.marca_vehiculo || 'GENERAL').trim(),
                modelo_vehiculo: (k.modelo_vehiculo || 'TODOS LOS MODELOS').trim(),
                tipo_mp: (k.tipo_mp || 'MP1').trim().toUpperCase(),
                nombre_kit: (k.nombre_kit || '').trim(),
                item_nombre: (k.item_nombre || '').trim(),
                cantidad: cant,
                unidad_medida: (k.unidad_medida || (invItem ? invItem.unidad : 'UND')).toUpperCase(),
                costo_unitario: cu,
                costo_total: ct,
                stock_almacen: stockActual,
                observaciones: k.observaciones || ''
            };
        });

        // 4. Extraer únicamente las Marcas de Unidades "MOTORAS" registradas en la flota del ERP
        const marcasMotorasSet = new Set();
        const placasArr = Array.isArray(placasResp) ? placasResp : [];
        const noMotorasKeywords = ['REMOLQUE', 'SEMIREMOLQUE', 'SEMI REMOLQUE', 'CARRETA', 'PLATAFORMA', 'BATEA', 'CAMABAJA', 'FURGON REMOLQUE'];

        placasArr.forEach(p => {
            const m = (p.marca || '').trim();
            if (!m || m === '-' || m === 'S/M' || m.toUpperCase() === 'SIN MARCA') return;

            const motoraVal = (p.motora || '').toString().trim().toUpperCase();
            const tipoVal = (p.tipo || '').toString().trim().toUpperCase();
            const subTipoVal = (p.sub_tipo || '').toString().trim().toUpperCase();

            const esNoMotora = noMotorasKeywords.some(k => tipoVal.includes(k) || subTipoVal.includes(k) || motoraVal.includes('NO'));
            const esMotora = motoraVal === 'MOTORA' || motoraVal === 'SI' || motoraVal === '1' ||
                             tipoVal.includes('TRACTO') || tipoVal.includes('CAMION') || tipoVal.includes('CAMIONETA') || tipoVal.includes('VOLQUETE') || tipoVal.includes('REMOLCADOR') ||
                             (!esNoMotora && !tipoVal.includes('REMOLQUE'));

            if (esMotora) {
                // Formatear marca con mayúscula inicial si es todo mayúsculas o mantener estilo
                marcasMotorasSet.add(m);
            }
        });

        // Asegurar que también se incluyan las marcas que ya tienen kits registrados
        window.kitsData.forEach(k => {
            if (k.marca_vehiculo && k.marca_vehiculo !== 'GENERAL') {
                marcasMotorasSet.add(k.marca_vehiculo);
            }
        });

        window._marcasMotorasFlota = Array.from(marcasMotorasSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        window.kitsDataFil = window.kitsData.slice();

        // 5. Poblar sidebar lateral de Marcas Motoras
        window.kitsPoblarSidebarMarcas();

        // 6. Renderizar vista
        window.kitsFiltrar();

    }).catch(err => {
        console.error('Error cargando kits de mantenimiento:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-5 text-danger">
                        <i class="bi bi-exclamation-triangle fs-4 d-block mb-2"></i>
                        Error al cargar la información de kits.
                    </td>
                </tr>
            `;
        }
    });
};

/**
 * Poblar lista del Sidebar Lateral Izquierdo (Todos + Solo Marcas Motoras)
 */
window.kitsPoblarSidebarMarcas = function () {
    const listContainer = document.getElementById('kits-nav-sidebar-list');
    if (!listContainer) return;

    // Calcular marcas motoras disponibles y cuántos ítems de kit tienen configurados
    const marcasMap = new Map();

    // 1. Inicializar todas las marcas motoras registradas con 0
    (window._marcasMotorasFlota || []).forEach(m => {
        if (m) marcasMap.set(m, 0);
    });

    // 2. Contar ítems de kits configurados para cada marca
    window.kitsData.forEach(k => {
        const m = (k.marca_vehiculo || '').trim();
        if (m) {
            // Buscar si coincide ignorando mayúsculas/minúsculas
            let matchedKey = null;
            for (let key of marcasMap.keys()) {
                if (key.toUpperCase() === m.toUpperCase()) {
                    matchedKey = key;
                    break;
                }
            }
            if (matchedKey) {
                marcasMap.set(matchedKey, (marcasMap.get(matchedKey) || 0) + 1);
            } else {
                marcasMap.set(m, 1);
            }
        }
    });

    const marcasSorted = Array.from(marcasMap.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    let html = `
        <div class="kits-nav-item ${!window.kitsSidebarMarcaSeleccionada ? 'active' : ''}" data-marca="" onclick="window.kitsSeleccionarMarcaSidebar('', this)">
            <span>Todos</span>
            <span class="badge bg-light text-secondary rounded-pill font-monospace" id="badge-count-sidebar-todos">${window.kitsData.length}</span>
        </div>
    `;

    marcasSorted.forEach(marca => {
        const count = marcasMap.get(marca) || 0;
        const isActive = window.kitsSidebarMarcaSeleccionada.toUpperCase() === marca.toUpperCase();
        html += `
            <div class="kits-nav-item ${isActive ? 'active' : ''}" data-marca="${escapeHtml(marca)}" onclick="window.kitsSeleccionarMarcaSidebar('${escapeHtml(marca)}', this)">
                <span class="text-truncate">${escapeHtml(marca)}</span>
                ${count > 0 ? `<span class="badge bg-light text-secondary rounded-pill font-monospace" style="font-size: 0.70rem;">${count}</span>` : '<span class="badge text-muted font-monospace" style="font-size: 0.65rem; opacity: 0.5;">0</span>'}
            </div>
        `;
    });

    listContainer.innerHTML = html;
};

/**
 * Filtrar ítems de la lista del sidebar
 */
window.kitsFiltrarSidebarMarcas = function () {
    const q = ((document.getElementById('buscadorSidebarMarcas') || {}).value || '').toLowerCase().trim();
    const items = document.querySelectorAll('#kits-nav-sidebar-list .kits-nav-item');

    items.forEach(it => {
        const marca = (it.getAttribute('data-marca') || '').toLowerCase();
        const text = it.textContent.toLowerCase();
        if (!q || !marca || text.includes(q)) {
            it.style.display = 'flex';
        } else {
            it.style.display = 'none';
        }
    });
};

/**
 * Seleccionar marca del sidebar lateral
 */
window.kitsSeleccionarMarcaSidebar = function (marca, el) {
    window.kitsSidebarMarcaSeleccionada = (marca || '').trim();

    const items = document.querySelectorAll('#kits-nav-sidebar-list .kits-nav-item');
    items.forEach(it => it.classList.remove('active'));
    if (el) el.classList.add('active');

    window.kitsFiltrar();
};

/**
 * Filtrar por segmento rápido de Tipo MP (TODOS, MP1, MP2, MP3, OTROS)
 */
window.kitsFiltrarSegmento = function (tipo, btnEl) {
    window.kitsFiltroSegmentoActual = tipo;

    const group = document.getElementById('btn-group-tipos-mp');
    if (group) {
        group.querySelectorAll('.ck-segment-item').forEach(b => b.classList.remove('active'));
    }
    if (btnEl) btnEl.classList.add('active');

    window.kitsFiltrar();
};

/**
 * Resetear filtros
 */
window.kitsResetFiltros = function () {
    const searchInput = document.getElementById('buscadorKitsLive');
    if (searchInput) searchInput.value = '';

    const sidebarSearch = document.getElementById('buscadorSidebarMarcas');
    if (sidebarSearch) sidebarSearch.value = '';

    window.kitsSidebarMarcaSeleccionada = '';
    const todosSidebarItem = document.querySelector('#kits-nav-sidebar-list .kits-nav-item:first-child');
    if (todosSidebarItem) {
        document.querySelectorAll('#kits-nav-sidebar-list .kits-nav-item').forEach(b => b.classList.remove('active'));
        todosSidebarItem.classList.add('active');
    }

    window.kitsFiltrarSegmento('TODOS', document.querySelector('#btn-group-tipos-mp button:first-child'));
};

/**
 * Filtro unificado en vivo (Búsqueda + Sidebar Marca + Segmento)
 */
window.kitsFiltrar = function () {
    const q = ((document.getElementById('buscadorKitsLive') || {}).value || '').toLowerCase().trim();
    const selMarca = (window.kitsSidebarMarcaSeleccionada || '').toUpperCase().trim();
    const segTipo = window.kitsFiltroSegmentoActual || 'TODOS';

    window.kitsDataFil = window.kitsData.filter(k => {
        // Filtro por Segmento de Tipo MP
        if (segTipo !== 'TODOS') {
            if (segTipo === 'OTROS') {
                if (['MP1', 'MP2', 'MP3'].includes(k.tipo_mp)) return false;
            } else {
                if (k.tipo_mp !== segTipo) return false;
            }
        }

        // Filtro por Marca seleccionada en Sidebar
        if (selMarca) {
            const m = (k.marca_vehiculo || '').toUpperCase().trim();
            const mod = (k.modelo_vehiculo || '').toUpperCase().trim();
            if (m !== selMarca && mod !== selMarca) return false;
        }

        // Búsqueda en texto libre
        if (q) {
            const corpus = [
                k.marca_vehiculo,
                k.modelo_vehiculo,
                k.tipo_mp,
                k.nombre_kit,
                k.item_nombre,
                k.unidad_medida,
                k.observaciones
            ].join(' ').toLowerCase();

            if (!corpus.includes(q)) return false;
        }

        return true;
    });

    // Renderizar Vistas (Desktop y Mobile)
    window.kitsRenderizarTablaDesktop();
    window.kitsRenderizarCardsMobile();
};

/**
 * Renderizar Tabla de Escritorio (Desktop)
 * Segmentada por tipo de mantenimiento / kit con encabezados en negrita (1:1 a la imagen de referencia)
 */
window.kitsRenderizarTablaDesktop = function () {
    const tbody = document.getElementById('kits-tbody');
    if (!tbody) return;

    if (!window.kitsDataFil.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                    ${window.kitsSidebarMarcaSeleccionada ? `No hay kits configurados para la marca <strong>${escapeHtml(window.kitsSidebarMarcaSeleccionada)}</strong>.` : 'No se encontraron repuestos o kits con los criterios de búsqueda.'}
                    <div class="mt-3">
                        <button type="button" class="btn btn-sm btn-primary rounded-3 px-3 py-1.5 fw-bold" onclick="window.kitsAbrirModal()" style="background:#0284c7; border-color:#0284c7;">
                            <i class="bi bi-plus-lg me-1"></i> Configurar Kit para esta Marca
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    // Agrupar ítems por (nombre_kit o tipo_mp) para crear las secciones segmentadas en negrita
    const grupos = new Map();

    window.kitsDataFil.forEach(k => {
        const groupTitle = (k.nombre_kit || k.tipo_mp || 'GENERAL').trim();
        if (!grupos.has(groupTitle)) {
            grupos.set(groupTitle, []);
        }
        grupos.get(groupTitle).push(k);
    });

    let html = '';

    grupos.forEach((items, groupTitle) => {
        // Fila Encabezado de Tipo / Sección de Mantenimiento (En Negrita como en la imagen)
        html += `
            <tr class="kits-type-header-row">
                <td colspan="4" class="py-3 px-4" style="background: #ffffff; border-top: 1.5px solid #e2e8f0; border-bottom: 1px solid #f1f5f9;">
                    <div class="d-flex align-items-center justify-content-between">
                        <span class="fw-black text-dark" style="font-size: 0.92rem; letter-spacing: -0.2px; font-weight: 800;">
                            ${escapeHtml(groupTitle)}
                        </span>
                    </div>
                </td>
            </tr>
        `;

        // Filas de repuestos dentro de esta sección
        items.forEach(it => {
            const stockNum = it.stock_almacen != null ? it.stock_almacen : 0;
            const stockColorClass = stockNum > 0 ? 'text-dark fw-bold' : 'text-muted';

            html += `
                <tr class="kits-item-row hover:bg-slate-50 transition-colors" style="cursor: default;">
                    <!-- Columna 1: Codigo / Descripción del repuesto -->
                    <td class="ps-4 py-3 align-middle" style="border-bottom: 1px solid #f8fafc;">
                        <span class="fw-bold text-dark" style="font-size: 0.88rem; color: #1e293b;">
                            ${escapeHtml(it.item_nombre || '—')}
                        </span>
                    </td>

                    <!-- Columna 2: Cantidad -->
                    <td class="py-3 text-center align-middle font-monospace" style="border-bottom: 1px solid #f8fafc; font-size: 0.88rem; color: #334155;">
                        ${it.cantidad.toFixed(2)}
                    </td>

                    <!-- Columna 3: Stock Almacen -->
                    <td class="py-3 text-center align-middle font-monospace ${stockColorClass}" style="border-bottom: 1px solid #f8fafc; font-size: 0.88rem;">
                        ${stockNum}
                    </td>

                    <!-- Columna 4: Botón de Acción Chevron > -->
                    <td class="pe-4 py-3 text-end align-middle" style="border-bottom: 1px solid #f8fafc;">
                        <button type="button" class="btn btn-sm btn-link text-secondary p-1 text-decoration-none"
                                title="Editar configuración del kit"
                                onclick="window.kitsEditarKit('${escapeHtml(it.marca_vehiculo)}', '${escapeHtml(it.modelo_vehiculo)}', '${escapeHtml(it.tipo_mp)}')"
                                style="font-size: 1rem; color: #64748b;">
                            <i class="bi bi-chevron-right"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    });

    tbody.innerHTML = html;
};

/**
 * Renderizar Tarjetas Nativas para Móvil
 */
window.kitsRenderizarCardsMobile = function () {
    const container = document.getElementById('kitsCardContainer');
    if (!container) return;

    if (!window.kitsDataFil.length) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                Sin kits de mantenimiento encontrados.
            </div>
        `;
        return;
    }

    // Agrupar por Kit
    const kitsAgrupados = {};
    window.kitsDataFil.forEach(k => {
        const kitKey = `${k.marca_vehiculo}__${k.modelo_vehiculo}__${k.tipo_mp}`;
        if (!kitsAgrupados[kitKey]) {
            kitsAgrupados[kitKey] = {
                marca: k.marca_vehiculo,
                modelo: k.modelo_vehiculo,
                tipo_mp: k.tipo_mp,
                nombre_kit: k.nombre_kit,
                items: []
            };
        }
        kitsAgrupados[kitKey].items.push(k);
    });

    let html = '';
    Object.values(kitsAgrupados).forEach(g => {
        const totalCosto = g.items.reduce((acc, it) => acc + parseFloat(it.costo_total || 0), 0);

        let badgeTipoStyle = 'background:#eff6ff; color:#0284c7; border:1px solid #bae6fd;';
        if (g.tipo_mp === 'MP2') badgeTipoStyle = 'background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;';
        else if (g.tipo_mp === 'MP3') badgeTipoStyle = 'background:#fffbeb; color:#d97706; border:1px solid #fde68a;';

        html += `
            <div class="ck-mobile-card mb-3" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:14px; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
                <!-- Encabezado de la Tarjeta Móvil -->
                <div class="d-flex align-items-center justify-content-between pb-2 mb-2 border-bottom border-slate-100">
                    <div class="d-flex align-items-center gap-2">
                        <div class="p-2 rounded-3 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width: 34px; height: 34px;">
                            <i class="bi bi-truck"></i>
                        </div>
                        <div>
                            <div class="fw-black text-dark" style="font-size: 0.95rem;">${escapeHtml(g.marca)}</div>
                            <div class="text-secondary small fw-bold">${escapeHtml(g.modelo)}</div>
                        </div>
                    </div>
                    <span class="badge rounded-pill fw-bold text-uppercase px-2.5 py-1" style="${badgeTipoStyle} font-size: 0.72rem;">
                        ${escapeHtml(g.tipo_mp)}
                    </span>
                </div>

                ${g.nombre_kit ? `<div class="fw-black text-dark small mb-2" style="font-size:0.85rem;"><strong>${escapeHtml(g.nombre_kit)}</strong></div>` : ''}

                <!-- Desglose de Ítems -->
                <div class="d-flex flex-column gap-2 my-2.5">
                    ${g.items.map(it => `
                        <div class="d-flex align-items-center justify-content-between p-2 rounded-2 bg-light/70 border border-slate-100">
                            <div style="min-width:0; flex:1;" class="pe-2">
                                <div class="fw-bold text-dark text-truncate" style="font-size: 0.82rem;">${escapeHtml(it.item_nombre)}</div>
                                <div class="text-secondary small font-monospace" style="font-size: 0.72rem;">
                                    Cant: ${it.cantidad.toFixed(2)} | Stock: ${it.stock_almacen || 0}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- Pie de la Tarjeta Móvil -->
                <div class="d-flex align-items-center justify-content-between pt-2 border-top border-slate-100">
                    <div>
                        <span class="text-secondary small fw-bold text-uppercase d-block" style="font-size: 0.65rem;">Costo Estimado</span>
                        <span class="fw-black text-dark font-monospace" style="font-size: 0.95rem;">
                            S/ ${totalCosto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    <button type="button" class="btn btn-sm btn-primary rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-1.5 shadow-sm"
                            onclick="window.kitsEditarKit('${escapeHtml(g.marca)}', '${escapeHtml(g.modelo)}', '${escapeHtml(g.tipo_mp)}')"
                            style="background: #0284c7; border-color: #0284c7; font-size: 0.78rem;">
                        <i class="bi bi-pencil-square"></i> Editar Kit
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};

// =========================================================================
// MODAL / DRAWER DE FORMULARIO (NUEVO / EDITAR KIT)
// =========================================================================

/**
 * Abrir Drawer para Nuevo Kit
 */
window.kitsAbrirModal = function () {
    window._kitEditandoGrupo = null;
    window.kitsDeletedItemIds = [];
    window.kitsRowCounter = 0;

    const lblTitulo = document.getElementById('lblTituloModalKit');
    const lblSub = document.getElementById('lblSubtituloModalKit');
    if (lblTitulo) lblTitulo.textContent = 'Nuevo Kit de Mantenimiento';
    if (lblSub) lblSub.textContent = 'Configure el vehículo, tipo de preventivo y agregue repuestos requeridos';

    // Poblar selects del modal con las marcas motoras
    window.kitsPoblarSelectsModal();

    // Limpiar campos
    const selMarca = document.getElementById('modalKitMarca');
    const selModelo = document.getElementById('modalKitModelo');
    const selTipo = document.getElementById('modalKitTipoMP');
    const txtAlias = document.getElementById('modalKitNombreAlias');
    const txtObs = document.getElementById('modalKitObservaciones');

    if (selMarca) selMarca.value = window.kitsSidebarMarcaSeleccionada || '';
    if (selModelo) selModelo.value = 'TODOS LOS MODELOS';
    if (selTipo) selTipo.value = '';
    if (txtAlias) txtAlias.value = '';
    if (txtObs) txtObs.value = '';

    const container = document.getElementById('modalKitItemsContainer');
    if (container) container.innerHTML = '';

    // Agregar primera fila vacía
    window.kitsModalAgregarFila();
    window.kitsModalRecalcularTotales();

    // Mostrar modal
    const modalEl = document.getElementById('modalNuevoKitMP');
    if (modalEl) {
        const m = bootstrap.Modal.getOrCreateInstance(modalEl);
        m.show();
    }
};

/**
 * Abrir Drawer para Editar un Kit existente
 */
window.kitsEditarKit = function (marca, modelo, tipo) {
    window._kitEditandoGrupo = { marca, modelo, tipo };
    window.kitsDeletedItemIds = [];
    window.kitsRowCounter = 0;

    const lblTitulo = document.getElementById('lblTituloModalKit');
    const lblSub = document.getElementById('lblSubtituloModalKit');
    if (lblTitulo) lblTitulo.textContent = `Editar Kit: ${marca} • ${modelo} (${tipo})`;
    if (lblSub) lblSub.textContent = 'Modifique los repuestos, cantidades o costos asignados al kit';

    window.kitsPoblarSelectsModal(marca, modelo, tipo);

    // Obtener los ítems pertenecientes al kit
    const items = window.kitsData.filter(x =>
        x.marca_vehiculo.toUpperCase() === (marca || '').toUpperCase() &&
        x.modelo_vehiculo.toUpperCase() === (modelo || 'TODOS LOS MODELOS').toUpperCase() &&
        x.tipo_mp.toUpperCase() === (tipo || '').toUpperCase()
    );

    const txtAlias = document.getElementById('modalKitNombreAlias');
    const txtObs = document.getElementById('modalKitObservaciones');
    if (txtAlias) txtAlias.value = items[0]?.nombre_kit || '';
    if (txtObs) txtObs.value = items[0]?.observaciones || '';

    const container = document.getElementById('modalKitItemsContainer');
    if (container) container.innerHTML = '';

    if (items.length > 0) {
        items.forEach(it => window.kitsModalAgregarFila(it));
    } else {
        window.kitsModalAgregarFila();
    }

    window.kitsModalRecalcularTotales();

    const modalEl = document.getElementById('modalNuevoKitMP');
    if (modalEl) {
        const m = bootstrap.Modal.getOrCreateInstance(modalEl);
        m.show();
    }
};

/**
 * Poblar selects dentro del Modal (Marcas Motoras, Modelos, Tipos MP)
 */
window.kitsPoblarSelectsModal = function (presetMarca, presetModelo, presetTipo) {
    const selMarca = document.getElementById('modalKitMarca');
    const selModelo = document.getElementById('modalKitModelo');
    const selTipo = document.getElementById('modalKitTipoMP');

    if (selMarca) {
        const marcasArr = (window._marcasMotorasFlota && window._marcasMotorasFlota.length)
            ? window._marcasMotorasFlota
            : Array.from(new Set(window.kitsData.map(k => k.marca_vehiculo).filter(Boolean))).sort();

        selMarca.innerHTML = '<option value="">Seleccione marca motora...</option>' +
            marcasArr.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

        if (presetMarca) {
            // Buscar coincidencia insensible a mayúsculas
            const match = marcasArr.find(m => m.toUpperCase() === presetMarca.toUpperCase());
            if (match) selMarca.value = match;
            else selMarca.value = presetMarca;
        }
    }

    if (selTipo) {
        selTipo.innerHTML = '<option value="">Seleccione tipo...</option>' +
            window._kitsTiposMPList.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

        if (presetTipo && window._kitsTiposMPList.includes(presetTipo.toUpperCase())) {
            selTipo.value = presetTipo.toUpperCase();
        }
    }

    window.kitsModalMarcaCambiada(presetModelo);
};

/**
 * Evento al cambiar la Marca dentro del Modal
 */
window.kitsModalMarcaCambiada = function (presetModelo) {
    const selMarca = document.getElementById('modalKitMarca');
    const selModelo = document.getElementById('modalKitModelo');
    if (!selModelo) return;

    const marca = selMarca ? selMarca.value : '';
    const modelosSet = new Set(['TODOS LOS MODELOS']);

    if (marca) {
        if (window.dataGlobalPlacas && Array.isArray(window.dataGlobalPlacas)) {
            window.dataGlobalPlacas.forEach(p => {
                const mMarca = (p[3] || '').trim().toUpperCase();
                const mMod = (p[4] || '').trim().toUpperCase();
                if (mMarca === marca.toUpperCase() && mMod && mMod !== '-') {
                    modelosSet.add(mMod);
                }
            });
        }
        window.kitsData.forEach(k => {
            if (k.marca_vehiculo.toUpperCase() === marca.toUpperCase() && k.modelo_vehiculo) {
                modelosSet.add(k.modelo_vehiculo);
            }
        });
    }

    const modelosArr = Array.from(modelosSet).sort();
    selModelo.innerHTML = modelosArr.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

    if (presetModelo && modelosArr.includes(presetModelo.toUpperCase())) {
        selModelo.value = presetModelo.toUpperCase();
    }

    window.kitsModalActualizarTitulo();
};

/**
 * Actualizar título dinámico del modal en edición
 */
window.kitsModalActualizarTitulo = function () {
    const selMarca = document.getElementById('modalKitMarca');
    const selModelo = document.getElementById('modalKitModelo');
    const selTipo = document.getElementById('modalKitTipoMP');
    const lblTitulo = document.getElementById('lblTituloModalKit');

    if (!window._kitEditandoGrupo && lblTitulo) {
        const m = selMarca ? selMarca.value : '';
        const mod = selModelo ? selModelo.value : '';
        const t = selTipo ? selTipo.value : '';
        if (m || t) {
            lblTitulo.textContent = `Configurar Kit: ${m || 'Vehículo'} ${mod && mod !== 'TODOS LOS MODELOS' ? '• ' + mod : ''} (${t || 'MP'})`;
        } else {
            lblTitulo.textContent = 'Configurar Kit de Mantenimiento';
        }
    }
};

/**
 * Agregar Fila Dinámica de Repuesto/Material en el Modal
 */
window.kitsModalAgregarFila = function (data = {}) {
    const container = document.getElementById('modalKitItemsContainer');
    if (!container) return;

    const rowId = `kit_row_${++window.kitsRowCounter}`;
    const listId = `dl_inv_${rowId}`;

    const cant = parseFloat(data.cantidad || 1);
    const cu = parseFloat(data.costo_unitario || 0);
    const ct = parseFloat(data.costo_total || (cant * cu));

    const row = document.createElement('div');
    row.id = rowId;
    row.className = 'kit-item-row-card';
    if (data.id) row.dataset.id = data.id;

    row.innerHTML = `
        <div class="row g-2 align-items-center">
            <!-- Repuesto / Nombre con Datalist de Almacén -->
            <div class="col-12 col-md-5">
                <label class="form-label d-block mb-1 text-muted" style="font-size:0.65rem;">Repuesto / Lubricante / Material</label>
                <div class="position-relative">
                    <input type="text" class="form-control form-control-sm fw-bold kit-input-nombre"
                           list="${listId}"
                           placeholder="Escriba o elija del inventario..."
                           value="${escapeHtml(data.item_nombre || '')}"
                           oninput="window.kitsModalItemNombreCambiado(this, '${rowId}')"
                           autocomplete="off">
                    <datalist id="${listId}">
                        ${window._kitsAlmacenItems.map(it => `<option value="${escapeHtml(it.nombre)}"></option>`).join('')}
                    </datalist>
                </div>
            </div>

            <!-- Cantidad -->
            <div class="col-4 col-md-2">
                <label class="form-label d-block mb-1 text-muted" style="font-size:0.65rem;">Cantidad</label>
                <input type="number" class="form-control form-control-sm text-center font-monospace fw-bold kit-input-cant"
                       value="${cant}" step="0.01" min="0.01"
                       oninput="window.kitsModalRecalcularFila('${rowId}')">
            </div>

            <!-- Unidad -->
            <div class="col-4 col-md-2">
                <label class="form-label d-block mb-1 text-muted" style="font-size:0.65rem;">Unidad</label>
                <input type="text" class="form-control form-control-sm text-center font-monospace fw-bold kit-input-unid text-uppercase"
                       value="${escapeHtml(data.unidad_medida || 'UND')}" placeholder="UND">
            </div>

            <!-- Costo Unitario -->
            <div class="col-4 col-md-2">
                <label class="form-label d-block mb-1 text-muted" style="font-size:0.65rem;">C. Unitario (S/)</label>
                <input type="number" class="form-control form-control-sm text-end font-monospace kit-input-costo"
                       value="${cu.toFixed(2)}" step="0.01" min="0"
                       oninput="window.kitsModalRecalcularFila('${rowId}')">
            </div>

            <!-- Botón Eliminar Fila -->
            <div class="col-12 col-md-1 text-end pt-md-3">
                <button type="button" class="btn btn-sm btn-outline-danger rounded-2 p-1 px-2 w-100 w-md-auto"
                        title="Quitar ítem" onclick="window.kitsModalEliminarFila('${rowId}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>

        <!-- Subtotal de la fila -->
        <div class="d-flex justify-content-end align-items-center gap-2 mt-1 pt-1 border-top border-slate-200">
            <span class="text-secondary small" style="font-size:0.70rem;">Subtotal:</span>
            <span class="fw-bold text-success font-monospace small kit-span-subtotal">S/ ${ct.toFixed(2)}</span>
        </div>
    `;

    container.appendChild(row);
    window.kitsModalRecalcularTotales();
};

/**
 * Evento al escribir o elegir un repuesto del datalist
 */
window.kitsModalItemNombreCambiado = function (inputEl, rowId) {
    const val = (inputEl.value || '').trim();
    if (!val) return;

    const matched = window._kitsAlmacenItems.find(x => x.nombre.toLowerCase() === val.toLowerCase());
    if (matched) {
        const row = document.getElementById(rowId);
        if (row) {
            const unidInput = row.querySelector('.kit-input-unid');
            const costoInput = row.querySelector('.kit-input-costo');
            if (unidInput && matched.unidad) unidInput.value = matched.unidad;
            if (costoInput && matched.costo > 0) costoInput.value = matched.costo.toFixed(2);
            window.kitsModalRecalcularFila(rowId);
        }
    }
};

/**
 * Recalcular subtotal de una fila específica
 */
window.kitsModalRecalcularFila = function (rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const cantEl = row.querySelector('.kit-input-cant');
    const costoEl = row.querySelector('.kit-input-costo');
    const subtotalEl = row.querySelector('.kit-span-subtotal');

    const cant = parseFloat(cantEl ? cantEl.value : 0) || 0;
    const costo = parseFloat(costoEl ? costoEl.value : 0) || 0;
    const subtotal = cant * costo;

    if (subtotalEl) {
        subtotalEl.textContent = `S/ ${subtotal.toFixed(2)}`;
    }

    window.kitsModalRecalcularTotales();
};

/**
 * Eliminar una fila del modal
 */
window.kitsModalEliminarFila = function (rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    if (row.dataset.id) {
        window.kitsDeletedItemIds.push(parseInt(row.dataset.id));
    }
    row.remove();
    window.kitsModalRecalcularTotales();
};

/**
 * Recalcular totales generales del Modal
 */
window.kitsModalRecalcularTotales = function () {
    const container = document.getElementById('modalKitItemsContainer');
    if (!container) return;

    const rows = container.querySelectorAll('.kit-item-row-card');
    let grandTotal = 0;

    rows.forEach(r => {
        const cant = parseFloat(r.querySelector('.kit-input-cant')?.value || 0) || 0;
        const costo = parseFloat(r.querySelector('.kit-input-costo')?.value || 0) || 0;
        grandTotal += cant * costo;
    });

    const counterEl = document.getElementById('modalKitItemsCounter');
    if (counterEl) {
        counterEl.textContent = `${rows.length} ${rows.length === 1 ? 'Ítem' : 'Ítems'}`;
    }

    const previewEl = document.getElementById('modalKitCostoTotalPreview');
    if (previewEl) {
        previewEl.textContent = `S/ ${grandTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
};

/**
 * Guardar Kit (Crear / Actualizar en lote)
 */
window.kitsModalGuardar = function () {
    const selMarca = document.getElementById('modalKitMarca');
    const selModelo = document.getElementById('modalKitModelo');
    const selTipo = document.getElementById('modalKitTipoMP');
    const txtAlias = document.getElementById('modalKitNombreAlias');
    const txtObs = document.getElementById('modalKitObservaciones');

    const marca = (selMarca ? selMarca.value : '').trim().toUpperCase();
    const modelo = (selModelo ? selModelo.value : 'TODOS LOS MODELOS').trim().toUpperCase() || 'TODOS LOS MODELOS';
    const tipo = (selTipo ? selTipo.value : '').trim().toUpperCase();
    const alias = (txtAlias ? txtAlias.value : '').trim();
    const obs = (txtObs ? txtObs.value : '').trim();

    if (!marca) {
        return alert('Por favor seleccione la marca del vehículo.');
    }
    if (!tipo) {
        return alert('Por favor seleccione el tipo de preventivo (MP1, MP2, etc.).');
    }

    const container = document.getElementById('modalKitItemsContainer');
    const rows = container ? container.querySelectorAll('.kit-item-row-card') : [];

    const itemsToSave = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const itemNombre = (r.querySelector('.kit-input-nombre')?.value || '').trim();
        const cant = parseFloat(r.querySelector('.kit-input-cant')?.value || 0) || 0;
        const unid = (r.querySelector('.kit-input-unid')?.value || 'UND').trim().toUpperCase();
        const cu = parseFloat(r.querySelector('.kit-input-costo')?.value || 0) || 0;
        const ct = cant * cu;
        const id = r.dataset.id ? parseInt(r.dataset.id) : null;

        if (!itemNombre) {
            return alert(`El ítem #${i + 1} no tiene nombre de repuesto.`);
        }
        if (cant <= 0) {
            return alert(`El ítem "${itemNombre}" debe tener una cantidad mayor a 0.`);
        }

        itemsToSave.push({
            id,
            marca_vehiculo: marca,
            modelo_vehiculo: modelo,
            tipo_mp: tipo,
            nombre_kit: alias,
            item_nombre: itemNombre,
            cantidad: cant,
            unidad_medida: unid,
            costo_unitario: cu,
            costo_total: ct,
            observaciones: obs
        });
    }

    if (!itemsToSave.length && !window.kitsDeletedItemIds.length) {
        return alert('Debe registrar al menos un ítem o repuesto en el kit.');
    }

    // Ejecutar promesas de guardado y eliminación
    const promises = [];

    // 1. Eliminar ítems quitados
    window.kitsDeletedItemIds.forEach(id => {
        promises.push(fetch(`/api/mantenimiento-kits/${id}`, { method: 'DELETE' }));
    });

    // 2. Guardar o actualizar ítems
    itemsToSave.forEach(it => {
        const method = it.id ? 'PUT' : 'POST';
        const url = it.id ? `/api/mantenimiento-kits/${it.id}` : '/api/mantenimiento-kits';

        promises.push(
            fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(it)
            })
        );
    });

    Promise.all(promises)
        .then(() => {
            // Cerrar modal
            const modalEl = document.getElementById('modalNuevoKitMP');
            if (modalEl) {
                const m = bootstrap.Modal.getInstance(modalEl);
                if (m) m.hide();
            }

            // Recargar tabla
            window.kitsCargarTabla(true);
        })
        .catch(err => {
            console.error('Error guardando kit de mantenimiento:', err);
            alert('Ocurrió un error al guardar los cambios del kit.');
        });
};

// =========================================================================
// ELIMINACIÓN DE ÍTEMS (MODAL CONFIRMACIÓN 1:1 REPORTE DE FALLAS)
// =========================================================================

/**
 * Abrir diálogo de confirmación para eliminar un ítem
 */
window.kitsEliminarItem = function (id, nombre) {
    const lblTitulo = document.getElementById('lblEliminarKitTitulo');
    const lblMsg = document.getElementById('lblEliminarKitMsg');
    const btnConfirm = document.getElementById('btnConfirmarEliminarKitAccion');

    if (lblTitulo) lblTitulo.textContent = '¿Eliminar ítem del kit?';
    if (lblMsg) lblMsg.innerHTML = `¿Está seguro de eliminar <strong>"${escapeHtml(nombre)}"</strong> de la configuración?`;

    if (btnConfirm) {
        btnConfirm.onclick = function () {
            fetch(`/api/mantenimiento-kits/${id}`, { method: 'DELETE' })
                .then(r => {
                    const modalEl = document.getElementById('modalEliminarKitConfirm');
                    if (modalEl) {
                        const m = bootstrap.Modal.getInstance(modalEl);
                        if (m) m.hide();
                    }
                    window.kitsCargarTabla(true);
                })
                .catch(err => {
                    console.error('Error eliminando ítem:', err);
                    alert('No se pudo eliminar el ítem.');
                });
        };
    }

    const modalEl = document.getElementById('modalEliminarKitConfirm');
    if (modalEl) {
        const m = bootstrap.Modal.getOrCreateInstance(modalEl);
        m.show();
    }
};

// =========================================================================
// EXPORTACIÓN & IMPORTACIÓN DE EXCEL
// =========================================================================

/**
 * Exportar tabla de Kits a Excel
 */
window.kitsExportarExcel = function () {
    if (!window.kitsDataFil || !window.kitsDataFil.length) {
        return alert('No hay datos para exportar.');
    }

    if (typeof XLSX === 'undefined') {
        return alert('La librería de exportación a Excel (XLSX) no está disponible.');
    }

    const rows = window.kitsDataFil.map(k => ({
        'Marca': k.marca_vehiculo,
        'Modelo': k.modelo_vehiculo,
        'Tipo MP': k.tipo_mp,
        'Alias Kit': k.nombre_kit || '',
        'Repuesto / Ítem': k.item_nombre,
        'Cantidad': k.cantidad,
        'Unidad': k.unidad_medida,
        'Costo Unitario (S/)': k.costo_unitario,
        'Costo Total (S/)': k.costo_total,
        'Observaciones': k.observaciones || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kits_MP');
    XLSX.writeFile(wb, `Kits_Mantenimiento_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

/**
 * Descargar Plantilla Oficial de Excel para Importación
 */
window.kitsDescargarPlantilla = function () {
    if (typeof XLSX === 'undefined') {
        return alert('Librería XLSX no disponible.');
    }

    const plantillaData = [
        {
            'Marca': 'VOLVO',
            'Modelo': 'FH 500',
            'Tipo MP': 'MP1',
            'Alias Kit': 'Kit Filtros Motor',
            'Repuesto / Ítem': 'FILTRO DE ACEITE',
            'Cantidad': 2,
            'Unidad': 'UND',
            'Costo Unitario': 65.00,
            'Observaciones': 'Cambio preventivo'
        },
        {
            'Marca': 'VOLVO',
            'Modelo': 'FH 500',
            'Tipo MP': 'MP1',
            'Alias Kit': 'Kit Filtros Motor',
            'Repuesto / Ítem': 'ACEITE DE MOTOR 15W-40',
            'Cantidad': 10,
            'Unidad': 'GAL',
            'Costo Unitario': 85.00,
            'Observaciones': ''
        }
    ];

    const ws = XLSX.utils.json_to_sheet(plantillaData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla_Kits');
    XLSX.writeFile(wb, 'Plantilla_Kits_Mantenimiento.xlsx');
};

/**
 * Importar masivamente desde Excel
 */
window.kitsImportarExcel = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
        return alert('Librería XLSX no disponible para procesar el archivo.');
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(ws);

            if (!json.length) {
                return alert('El archivo Excel está vacío.');
            }

            const itemsImportados = json.map(r => ({
                marca_vehiculo: (r['Marca'] || r['marca'] || '').trim().toUpperCase(),
                modelo_vehiculo: (r['Modelo'] || r['modelo'] || 'TODOS LOS MODELOS').trim().toUpperCase(),
                tipo_mp: (r['Tipo MP'] || r['tipo_mp'] || 'MP1').trim().toUpperCase(),
                nombre_kit: (r['Alias Kit'] || r['nombre_kit'] || '').trim(),
                item_nombre: (r['Repuesto / Ítem'] || r['item_nombre'] || r['Repuesto'] || '').trim(),
                cantidad: parseFloat(r['Cantidad'] || r['cantidad'] || 1) || 1,
                unidad_medida: (r['Unidad'] || r['unidad_medida'] || 'UND').trim().toUpperCase(),
                costo_unitario: parseFloat(r['Costo Unitario'] || r['costo_unitario'] || 0) || 0,
                costo_total: (parseFloat(r['Cantidad'] || 1) || 1) * (parseFloat(r['Costo Unitario'] || 0) || 0),
                observaciones: (r['Observaciones'] || r['observaciones'] || '').trim()
            })).filter(x => x.marca_vehiculo && x.item_nombre);

            if (!itemsImportados.length) {
                return alert('No se encontraron registros válidos con columnas Marca y Repuesto.');
            }

            fetch('/api/mantenimiento-kits/importarMasivo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: itemsImportados })
            })
                .then(r => r.json())
                .then(res => {
                    alert(`Se importaron ${itemsImportados.length} registros exitosamente.`);
                    window.kitsCargarTabla(true);
                })
                .catch(err => {
                    console.error('Error importando:', err);
                    alert('Error al enviar la importación masiva.');
                });

        } catch (err) {
            console.error('Error parseando excel:', err);
            alert('Error leyendo el archivo Excel.');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};

// Helper de escape HTML
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
