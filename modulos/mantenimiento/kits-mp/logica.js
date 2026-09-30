// =========================================================================
// MÓDULO: KITS DE MANTENIMIENTO PREVENTIVO — LÓGICA REDISEÑADA (1:1 MASTER-DETAIL & DRILL-DOWN MÓVIL)
// =========================================================================

window.kitsData = window.kitsData || [];
window.kitsDataFil = window.kitsDataFil || [];
window._kitsAlmacenItems = window._kitsAlmacenItems || [];
window._kitsTiposMPList = window._kitsTiposMPList || [];
window._marcasMotorasFlota = window._marcasMotorasFlota || [];
window._modelosPorMarcaMap = window._modelosPorMarcaMap || new Map();
window._marcasExpandedSet = window._marcasExpandedSet || new Set();
window._kitsModalModelosSeleccionados = window._kitsModalModelosSeleccionados || new Set();
window._kitsMobileVistaActual = 'marcas'; // 'marcas' | 'detalle'
window.kitsRowCounter = 0;
window.kitsDeletedItemIds = [];
window._kitEditandoGrupo = null;
window.kitsSidebarMarcaSeleccionada = '';
window.kitsSidebarModeloSeleccionado = '';

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
    const mobileTableContainer = document.getElementById('kits-mobile-table-container');

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2"></div> Cargando kits de mantenimiento...
                </td>
            </tr>
        `;
    }
    if (mobileTableContainer) {
        mobileTableContainer.innerHTML = `
            <div class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2"></div> Cargando información...
            </div>
        `;
    }

    Promise.all([
        fetch('/api/mantenimiento-kits').then(r => r.ok ? r.json() : { data: [] }),
        fetch('/api/almacen/inventario').then(r => r.ok ? r.json() : []),
        fetch('/api/tipos-preventivo').then(r => r.ok ? r.json() : { data: [] }),
        fetch('/api/placas-lista').then(r => r.ok ? r.json() : []).catch(() => [])
    ]).then(([kitsResp, invData, tiposResp, placasResp]) => {
        // 1. Mapear inventario para autocompletado, stock en vivo y sincronización
        window._kitsAlmacenItems = (invData || []).map(x => {
            const rawId = (x.id || '').toString().trim();
            let codInv = rawId;
            if (/^\d+$/.test(rawId)) {
                codInv = 'INV-' + rawId.padStart(4, '0');
            }
            const codArt = (x.codigo_articulo || x.codigo_item || x.codigo_barras || '').toString().trim();
            const nom = (x.descripcion || x.articulo || x.nombre || '').toString().trim();
            const art = (x.articulo || '').toString().trim();
            const unid = (x.unidad || x.unidad_medida || 'UND').toString().toUpperCase().trim();
            const cu = parseFloat(x.costo_soles != null ? x.costo_soles : (x.costo_referencial != null ? x.costo_referencial : (x.costo_unitario || 0))) || 0;
            const stk = parseFloat(x.stock_actual != null ? x.stock_actual : (x.stock != null ? x.stock : (x.cantidad != null ? x.cantidad : 0))) || 0;
            return {
                id: rawId,
                codInv: codInv,
                codigo_articulo: codArt,
                codigo: codInv || codArt || (rawId ? `INV-${rawId}` : ''),
                nombre: nom,
                articulo: art,
                unidad: unid,
                costo: cu,
                stock: stk
            };
        }).filter(x => x.nombre !== '' || x.codigo !== '');

        // 2. Mapear tipos de preventivo
        window._kitsTiposMPList = (tiposResp.data || []).map(t => t.nombre || t.tipo || t).filter(Boolean);
        if (!window._kitsTiposMPList.length) {
            window._kitsTiposMPList = ['MP1', 'MP2', 'MP3', 'MP4', 'INSPECCION'];
        }

        // 3. Procesar datos de kits con sincronización en tiempo real desde Almacén
        window.kitsData = (kitsResp.data || []).map(k => {
            const cant = parseFloat(k.cantidad || 1);
            let cu = parseFloat(k.costo_unitario || 0);

            const kCod = (k.item_codigo || '').toString().trim();
            const kNom = (k.item_nombre || '').toString().trim();

            // Sincronizar en vivo con Almacén por código de inventario o por nombre/tokens
            const invItem = window.kitsBuscarItemAlmacen(kCod, kNom);

            if (invItem && invItem.costo > 0) {
                cu = invItem.costo;
            }
            const stockActual = invItem ? invItem.stock : 0;
            const ct = parseFloat(k.costo_total || (cant * cu));

            let codFinal = invItem ? (invItem.codInv || invItem.codigo || invItem.codigo_articulo) : kCod;
            if (/^\d+$/.test(codFinal)) {
                codFinal = 'INV-' + codFinal.padStart(4, '0');
            }

            return {
                id: k.id,
                marca_vehiculo: (k.marca_vehiculo || 'GENERAL').trim().toUpperCase(),
                modelo_vehiculo: (k.modelo_vehiculo || 'TODOS LOS MODELOS').trim().toUpperCase(),
                tipo_mp: (k.tipo_mp || 'MP1').trim().toUpperCase(),
                nombre_kit: (k.nombre_kit || '').trim(),
                item_codigo: codFinal || '-',
                item_nombre: (invItem ? invItem.nombre : kNom),
                cantidad: cant,
                unidad_medida: (k.unidad_medida || (invItem ? invItem.unidad : 'UND')).toUpperCase(),
                costo_unitario: cu,
                costo_total: ct,
                stock_almacen: stockActual,
                observaciones: k.observaciones || ''
            };
        });

        // 4. Extraer únicamente las Marcas de Unidades "MOTORAS" registradas en la flota del ERP (DEDUPLICADAS) y sus Modelos
        const marcasMotorasMap = new Map();
        window._modelosPorMarcaMap = new Map();
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
                const upper = m.toUpperCase();
                if (!marcasMotorasMap.has(upper)) {
                    marcasMotorasMap.set(upper, upper);
                }
                if (!window._modelosPorMarcaMap.has(upper)) {
                    window._modelosPorMarcaMap.set(upper, new Set());
                }
                const mod = (p.modelo || '').toString().trim().toUpperCase();
                if (mod && mod !== '-' && mod !== 'S/M' && mod !== 'TODOS LOS MODELOS' && mod !== 'TODOS') {
                    window._modelosPorMarcaMap.get(upper).add(mod);
                }
            }
        });

        // Asegurar que también se incluyan las marcas y modelos de los kits ya existentes
        window.kitsData.forEach(k => {
            const m = (k.marca_vehiculo || '').trim().toUpperCase();
            if (m && m !== 'GENERAL') {
                if (!marcasMotorasMap.has(m)) {
                    marcasMotorasMap.set(m, m);
                }
                if (!window._modelosPorMarcaMap.has(m)) {
                    window._modelosPorMarcaMap.set(m, new Set());
                }
                const mod = (k.modelo_vehiculo || '').trim().toUpperCase();
                if (mod && mod !== '-' && mod !== 'TODOS LOS MODELOS' && mod !== 'TODOS') {
                    window._modelosPorMarcaMap.get(m).add(mod);
                }
            }
        });

        window._marcasMotorasFlota = Array.from(marcasMotorasMap.values()).sort((a, b) => a.localeCompare(b));

        window.kitsDataFil = window.kitsData.slice();

        // 5. Poblar sidebar Desktop y lista de marcas Móvil
        window.kitsPoblarSidebarMarcas();

        // 6. Renderizar vista
        window.kitsFiltrar();

    }).catch(err => {
        console.error('Error cargando kits de mantenimiento:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-5 text-danger">
                        <i class="bi bi-exclamation-triangle fs-4 d-block mb-2"></i>
                        Error al cargar la información de kits.
                    </td>
                </tr>
            `;
        }
    });
};

/**
 * Helper inteligente para resolver ítems de Almacén en vivo por Código o Descripción
 */
window.kitsBuscarItemAlmacen = function (kCod, kNom) {
    const codStr = (kCod || '').toString().trim().toLowerCase();
    const nomStr = (kNom || '').toString().trim().toLowerCase();
    if (!codStr && !nomStr) return null;

    // 1. Coincidencia directa por ID o código de inventario
    if (codStr && codStr !== '-' && codStr !== '—') {
        const byCod = (window._kitsAlmacenItems || []).find(x => 
            (x.codInv && x.codInv.toLowerCase() === codStr) ||
            (x.codigo && x.codigo.toLowerCase() === codStr) ||
            (x.codigo_articulo && x.codigo_articulo.toLowerCase() === codStr) ||
            (x.id && x.id.toString().toLowerCase() === codStr)
        );
        if (byCod) return byCod;
    }

    // 2. Coincidencia directa por nombre exacto
    if (nomStr) {
        const byExactNom = (window._kitsAlmacenItems || []).find(x => 
            x.nombre.toLowerCase() === nomStr ||
            (x.articulo && x.articulo.toLowerCase() === nomStr)
        );
        if (byExactNom) return byExactNom;
    }

    // 3. Coincidencia inteligente por tokens alfanuméricos / número de parte
    if (nomStr || (codStr && codStr !== '-')) {
        const cleanNom = nomStr.replace(/[()\-–—/]/g, ' ').replace(/\s+/g, ' ').trim();
        const tokens = cleanNom.split(' ').filter(t => t.length >= 2);

        // A. Si el código de parte del ítem de almacén está contenido en kNom
        for (const itm of (window._kitsAlmacenItems || [])) {
            if (itm.codigo_articulo && itm.codigo_articulo.length >= 3) {
                const caNorm = itm.codigo_articulo.toLowerCase().replace(/[()\-–—/]/g, ' ').trim();
                if (cleanNom.includes(caNorm)) return itm;
            }
        }

        // B. Si múltiples tokens significativos coinciden
        for (const itm of (window._kitsAlmacenItems || [])) {
            const itmNorm = (itm.nombre + ' ' + (itm.codigo_articulo || '') + ' ' + (itm.articulo || '')).toLowerCase().replace(/[()\-–—/]/g, ' ');
            const matchedTokens = tokens.filter(tk => itmNorm.includes(tk));
            if (matchedTokens.length >= 2 && matchedTokens.length >= Math.floor(tokens.length * 0.6)) {
                return itm;
            }
        }

        // C. Substring parcial
        for (const itm of (window._kitsAlmacenItems || [])) {
            const itmNom = itm.nombre.toLowerCase();
            if (itmNom.includes(nomStr) || (nomStr.length >= 5 && nomStr.includes(itmNom))) {
                return itm;
            }
        }
    }

    return null;
};

/**
 * Poblar lista del Sidebar Desktop y Lista de Marcas Móvil (1:1 Imagen 2)
 */
window.kitsPoblarSidebarMarcas = function () {
    const listDesktop = document.getElementById('kits-nav-sidebar-list');
    const listMobile = document.getElementById('kits-mobile-marcas-list');

    // Calcular marcas motoras disponibles y cuántos ítems de kit tienen configurados (1 sola entrada por marca)
    const marcasMap = new Map(); // key: UPPERCASE, value: { display: string, count: number }

    // 1. Inicializar todas las marcas motoras registradas con 0
    (window._marcasMotorasFlota || []).forEach(m => {
        if (m) {
            const upper = m.toUpperCase().trim();
            if (!marcasMap.has(upper)) {
                marcasMap.set(upper, { display: upper, count: 0 });
            }
        }
    });

    // 2. Contar ítems de kits configurados para cada marca
    window.kitsData.forEach(k => {
        const m = (k.marca_vehiculo || '').trim().toUpperCase();
        if (m && m !== 'GENERAL') {
            if (marcasMap.has(m)) {
                marcasMap.get(m).count++;
            } else {
                marcasMap.set(m, { display: m, count: 1 });
            }
        }
    });

    const marcasSorted = Array.from(marcasMap.values()).sort((a, b) => a.display.localeCompare(b.display));
    const isTodosActive = !window.kitsSidebarMarcaSeleccionada && !window.kitsSidebarModeloSeleccionado;

    // A. Renderizar Sidebar Desktop
    if (listDesktop) {
        let htmlDesktop = `
            <div class="kits-nav-item ${isTodosActive ? 'active' : ''}" data-marca="" data-modelo="" onclick="window.kitsSeleccionarMarcaSidebar('', this)">
                <span class="fw-bold">Todos</span>
                <span class="badge bg-light text-secondary rounded-pill font-monospace" id="badge-count-sidebar-todos">${window.kitsData.length}</span>
            </div>
        `;

        marcasSorted.forEach(item => {
            const marca = item.display;
            const count = item.count;
            const isBrandSelected = window.kitsSidebarMarcaSeleccionada.toUpperCase() === marca.toUpperCase();
            const isExactBrandActive = isBrandSelected && !window.kitsSidebarModeloSeleccionado;
            const isExpanded = window._marcasExpandedSet && window._marcasExpandedSet.has(marca);

            const modelosSet = window._modelosPorMarcaMap ? (window._modelosPorMarcaMap.get(marca) || new Set()) : new Set();
            const modelosArr = Array.from(modelosSet).sort();
            const hasModels = modelosArr.length > 0;

            htmlDesktop += `
                <div class="kits-nav-item ${isExactBrandActive ? 'active' : ''}" data-marca="${escapeHtml(marca)}" data-modelo="" onclick="window.kitsSeleccionarMarcaSidebar('${escapeHtml(marca)}', this)">
                    <div class="d-flex align-items-center gap-1 text-truncate">
                        ${hasModels ? `
                            <span class="p-1 text-secondary d-inline-flex align-items-center justify-content-center" style="width:20px; cursor:pointer;" onclick="window.kitsToggleMarcaChevron('${escapeHtml(marca)}', event)" title="${isExpanded ? 'Ocultar modelos' : 'Ver modelos'}">
                                <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'}" style="font-size: 0.72rem; color:#64748b;"></i>
                            </span>
                        ` : '<span style="width:14px; display:inline-block;"></span>'}
                        <span class="text-truncate">${escapeHtml(marca)}</span>
                    </div>
                    ${count > 0 ? `<span class="badge bg-light text-secondary rounded-pill font-monospace" style="font-size: 0.70rem;">${count}</span>` : '<span class="badge text-muted font-monospace" style="font-size: 0.65rem; opacity: 0.5;">0</span>'}
                </div>
            `;

            // Renderizar sub-ítems de modelos si la marca está expandida en desktop
            if (hasModels && isExpanded) {
                modelosArr.forEach(mod => {
                    const countMod = window.kitsData.filter(k => 
                        k.marca_vehiculo.toUpperCase() === marca.toUpperCase() && 
                        k.modelo_vehiculo.toUpperCase() === mod.toUpperCase()
                    ).length;

                    const isModelActive = isBrandSelected && window.kitsSidebarModeloSeleccionado.toUpperCase() === mod.toUpperCase();

                    htmlDesktop += `
                        <div class="kits-nav-subitem ${isModelActive ? 'active' : ''}" data-marca="${escapeHtml(marca)}" data-modelo="${escapeHtml(mod)}" onclick="window.kitsSeleccionarModeloSidebar('${escapeHtml(marca)}', '${escapeHtml(mod)}', this)">
                            <span class="text-truncate"><i class="bi bi-arrow-return-right me-1 text-muted" style="font-size:0.65rem;"></i>${escapeHtml(mod)}</span>
                            ${countMod > 0 ? `<span class="badge bg-light text-secondary rounded-pill font-monospace" style="font-size: 0.68rem;">${countMod}</span>` : '<span class="badge text-muted font-monospace" style="font-size: 0.62rem; opacity: 0.4;">0</span>'}
                        </div>
                    `;
                });
            }
        });

        listDesktop.innerHTML = htmlDesktop;
    }

    // B. Renderizar Lista Móvil NATIVA (1:1 Imagen 2)
    if (listMobile) {
        let htmlMobile = `
            <div class="kits-mobile-row" onclick="window.kitsMobileSeleccionarMarca('')">
                <span class="fw-bold">Todos</span>
                <div class="d-flex align-items-center gap-2">
                    ${window.kitsData.length > 0 ? `<span class="badge bg-light text-secondary rounded-pill font-monospace">${window.kitsData.length}</span>` : ''}
                    <i class="bi bi-chevron-right text-muted" style="font-size: 0.85rem;"></i>
                </div>
            </div>
        `;

        marcasSorted.forEach(item => {
            const marca = item.display;
            const count = item.count;

            htmlMobile += `
                <div class="kits-mobile-row" onclick="window.kitsMobileSeleccionarMarca('${escapeHtml(marca)}')">
                    <span class="fw-bold text-dark">${escapeHtml(marca)}</span>
                    <div class="d-flex align-items-center gap-2">
                        ${count > 0 ? `<span class="badge bg-light text-secondary rounded-pill font-monospace">${count}</span>` : ''}
                        <i class="bi bi-chevron-right text-muted" style="font-size: 0.85rem;"></i>
                    </div>
                </div>
            `;
        });

        listMobile.innerHTML = htmlMobile;
    }
};

/**
 * Navegación Móvil: Mostrar Pantalla 1 (Lista de Marcas)
 */
window.kitsMobileMostrarMarcas = function () {
    window._kitsMobileVistaActual = 'marcas';
    const viewMarcas = document.getElementById('kits-mobile-view-marcas');
    const viewDetalle = document.getElementById('kits-mobile-view-detalle');
    if (viewMarcas) viewMarcas.style.display = 'block';
    if (viewDetalle) viewDetalle.style.display = 'none';
};

/**
 * Navegación Móvil: Seleccionar Marca y Mostrar Pantalla 2 (Detalle Imagen 3)
 */
window.kitsMobileSeleccionarMarca = function (marca, modelo) {
    window.kitsSidebarMarcaSeleccionada = (marca || '').trim();
    window.kitsSidebarModeloSeleccionado = (modelo || '').trim();
    window._kitsMobileVistaActual = 'detalle';

    const viewMarcas = document.getElementById('kits-mobile-view-marcas');
    const viewDetalle = document.getElementById('kits-mobile-view-detalle');
    if (viewMarcas) viewMarcas.style.display = 'none';
    if (viewDetalle) viewDetalle.style.display = 'block';

    const brandTitleEl = document.getElementById('kits-mobile-detalle-brand-title');
    const subbrandTitleEl = document.getElementById('kits-mobile-detalle-subbrand-title');
    if (brandTitleEl) brandTitleEl.textContent = marca ? marca : 'Todos los Filtros';
    if (subbrandTitleEl) subbrandTitleEl.textContent = marca ? marca : 'Tipo de Mantt';

    window.kitsFiltrar();
};

/**
 * Toggle de buscador en la vista móvil
 */
window.kitsMobileToggleSearch = function () {
    const wrap = document.getElementById('kits-mobile-search-bar-wrap');
    if (!wrap) return;
    if (wrap.style.display === 'none' || !wrap.style.display) {
        wrap.style.display = 'block';
        const input = document.getElementById('buscadorKitsMobile');
        if (input) input.focus();
    } else {
        wrap.style.display = 'none';
    }
};

/**
 * Filtro desde el buscador móvil
 */
window.kitsFiltrarMobile = function (query) {
    const desktopSearch = document.getElementById('buscadorKitsLive');
    if (desktopSearch) desktopSearch.value = query || '';
    window.kitsFiltrar();
};

/**
 * Toggle para expandir/ocultar los modelos de una marca en el sidebar desktop
 */
window.kitsToggleMarcaChevron = function (marca, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (!marca) return;
    if (window._marcasExpandedSet.has(marca)) {
        window._marcasExpandedSet.delete(marca);
    } else {
        window._marcasExpandedSet.add(marca);
    }
    window.kitsPoblarSidebarMarcas();
};

/**
 * Seleccionar Marca completa del sidebar
 */
window.kitsSeleccionarMarcaSidebar = function (marca, el) {
    if (!marca) {
        window.kitsSidebarMarcaSeleccionada = '';
        window.kitsSidebarModeloSeleccionado = '';
        window.kitsPoblarSidebarMarcas();
        window.kitsFiltrar();
        return;
    }

    if (window.kitsSidebarMarcaSeleccionada === marca && !window.kitsSidebarModeloSeleccionado) {
        if (window._marcasExpandedSet.has(marca)) {
            window._marcasExpandedSet.delete(marca);
        } else {
            window._marcasExpandedSet.add(marca);
        }
    } else {
        window.kitsSidebarMarcaSeleccionada = marca;
        window.kitsSidebarModeloSeleccionado = '';
        window._marcasExpandedSet.add(marca);
    }

    window.kitsPoblarSidebarMarcas();
    window.kitsFiltrar();
};

/**
 * Seleccionar Modelo específico de una Marca en el sidebar
 */
window.kitsSeleccionarModeloSidebar = function (marca, modelo, el) {
    window.kitsSidebarMarcaSeleccionada = (marca || '').trim();
    window.kitsSidebarModeloSeleccionado = (modelo || '').trim();
    window._marcasExpandedSet.add(marca);

    window.kitsPoblarSidebarMarcas();
    window.kitsFiltrar();
};

/**
 * Resetear filtros
 */
window.kitsResetFiltros = function () {
    const searchInput = document.getElementById('buscadorKitsLive');
    if (searchInput) searchInput.value = '';

    window.kitsSidebarMarcaSeleccionada = '';
    window.kitsSidebarModeloSeleccionado = '';
    window.kitsPoblarSidebarMarcas();
    window.kitsFiltrar();
};

/**
 * Filtro unificado en vivo (Buscador Único + Sidebar Marca / Modelo)
 */
window.kitsFiltrar = function () {
    const qDesktop = ((document.getElementById('buscadorKitsLive') || {}).value || '').toLowerCase().trim();
    const qMobile = ((document.getElementById('buscadorKitsMobile') || {}).value || '').toLowerCase().trim();
    const q = qMobile || qDesktop;

    const selMarca = (window.kitsSidebarMarcaSeleccionada || '').toUpperCase().trim();
    const selModelo = (window.kitsSidebarModeloSeleccionado || '').toUpperCase().trim();

    window.kitsDataFil = window.kitsData.filter(k => {
        const kMarca = (k.marca_vehiculo || '').toUpperCase().trim();
        const kMod = (k.modelo_vehiculo || '').toUpperCase().trim();

        // Filtro por Marca seleccionada
        if (selMarca) {
            if (kMarca !== selMarca) return false;
        }

        // Filtro por Modelo específico (ej. P450)
        if (selModelo && selModelo !== 'TODOS' && selModelo !== 'TODOS LOS MODELOS') {
            if (kMod !== selModelo && kMod !== 'TODOS LOS MODELOS' && kMod !== 'TODOS') return false;
        }

        // Búsqueda en texto libre
        if (q) {
            const corpus = [
                k.marca_vehiculo,
                k.modelo_vehiculo,
                k.tipo_mp,
                k.nombre_kit,
                k.item_nombre,
                k.item_codigo,
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
 * Columnas: CÓDIGO | DESCRIPCIÓN | CANTIDAD | STOCK ALMACÉN | ACCIÓN
 */
window.kitsRenderizarTablaDesktop = function () {
    const tbody = document.getElementById('kits-tbody');
    if (!tbody) return;

    if (!window.kitsDataFil.length) {
        const targetLabel = window.kitsSidebarModeloSeleccionado
            ? `${window.kitsSidebarMarcaSeleccionada} • ${window.kitsSidebarModeloSeleccionado}`
            : window.kitsSidebarMarcaSeleccionada;

        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                    ${targetLabel ? `No hay kits configurados para <strong>${escapeHtml(targetLabel)}</strong>.` : 'No se encontraron repuestos o kits con los criterios de búsqueda.'}
                    <div class="mt-3">
                        <button type="button" class="btn btn-sm btn-primary rounded-3 px-3 py-1.5 fw-bold" onclick="window.kitsAbrirModal('${escapeHtml(window.kitsSidebarMarcaSeleccionada)}', '${escapeHtml(window.kitsSidebarModeloSeleccionado)}')" style="background:#0284c7; border-color:#0284c7;">
                            <i class="bi bi-plus-lg me-1"></i> Configurar Kit para este Vehículo
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
                <td colspan="5" class="py-3 px-4" style="background: #ffffff; border-top: 1.5px solid #e2e8f0; border-bottom: 1px solid #f1f5f9;">
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
            const kCod = (it.item_codigo || '').toString().trim();
            const kNom = (it.item_nombre || '').toString().trim();

            // Sincronización en tiempo real con inventario
            const invItem = window.kitsBuscarItemAlmacen(kCod, kNom);

            let displayCodigo = invItem ? (invItem.codInv || invItem.codigo || invItem.codigo_articulo) : kCod;
            if (!displayCodigo || displayCodigo === '-') {
                displayCodigo = '—';
            } else if (/^\d+$/.test(displayCodigo)) {
                displayCodigo = 'INV-' + displayCodigo.padStart(4, '0');
            }

            const displayNombre = (invItem ? invItem.nombre : kNom) || '—';
            const stockNum = invItem != null ? invItem.stock : (it.stock_almacen != null ? it.stock_almacen : 0);
            const stockColorClass = stockNum > 0 ? 'text-dark fw-bold' : 'text-muted';

            html += `
                <tr class="kits-item-row hover:bg-slate-50 transition-colors" style="cursor: default;">
                    <!-- Columna 1: Código del artículo (INV-XXXX) -->
                    <td class="ps-4 py-3 align-middle" style="border-bottom: 1px solid #f8fafc; width: 140px;">
                        <span class="badge bg-white text-dark border font-monospace fw-bold px-2 py-1" style="font-size: 0.80rem; border-color: #cbd5e1 !important; letter-spacing: 0.3px;">
                            ${escapeHtml(displayCodigo)}
                        </span>
                    </td>

                    <!-- Columna 2: Descripción completa tal cual sale en Inventario -->
                    <td class="py-3 align-middle" style="border-bottom: 1px solid #f8fafc;">
                        <span class="fw-bold text-dark" style="font-size: 0.88rem; color: #1e293b;">
                            ${escapeHtml(displayNombre)}
                        </span>
                    </td>

                    <!-- Columna 3: Cantidad -->
                    <td class="py-3 text-center align-middle font-monospace" style="border-bottom: 1px solid #f8fafc; font-size: 0.88rem; color: #334155; width: 120px;">
                        ${it.cantidad.toFixed(2)}
                    </td>

                    <!-- Columna 4: Stock Almacén en vivo -->
                    <td class="py-3 text-center align-middle font-monospace ${stockColorClass}" style="border-bottom: 1px solid #f8fafc; font-size: 0.88rem; width: 140px;">
                        ${stockNum}
                    </td>

                    <!-- Columna 5: Botón de Acción Chevron > -->
                    <td class="pe-4 py-3 text-end align-middle" style="border-bottom: 1px solid #f8fafc; width: 60px;">
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
 * Renderizar Tabla Segmentada para Móvil (1:1 con Imagen 3)
 * Columnas: Codigo / Descripción | Cantidad | Stock Almacen
 */
window.kitsRenderizarCardsMobile = function () {
    const container = document.getElementById('kits-mobile-table-container');
    const counterEl = document.getElementById('kits-mobile-items-count');
    if (!container) return;

    if (counterEl) {
        counterEl.textContent = `${window.kitsDataFil.length} ${window.kitsDataFil.length === 1 ? 'ítem' : 'ítems'}`;
    }

    if (!window.kitsDataFil.length) {
        const targetLabel = window.kitsSidebarModeloSeleccionado
            ? `${window.kitsSidebarMarcaSeleccionada} • ${window.kitsSidebarModeloSeleccionado}`
            : window.kitsSidebarMarcaSeleccionada;

        container.innerHTML = `
            <div class="text-center py-5 text-muted p-4">
                <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                ${targetLabel ? `No hay filtros o kits registrados para <strong>${escapeHtml(targetLabel)}</strong>.` : 'No se encontraron repuestos con los criterios actuales.'}
                <div class="mt-3">
                    <button type="button" class="btn btn-sm btn-primary rounded-pill px-3 py-2 fw-bold" onclick="window.kitsAbrirModal('${escapeHtml(window.kitsSidebarMarcaSeleccionada)}', '${escapeHtml(window.kitsSidebarModeloSeleccionado)}')" style="background:#0284c7; border-color:#0284c7;">
                        <i class="bi bi-plus-lg me-1"></i> Configurar Filtros
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // Agrupar ítems por Sección / Tipo de MP
    const grupos = new Map();
    window.kitsDataFil.forEach(k => {
        const groupTitle = (k.nombre_kit || k.tipo_mp || 'GENERAL').trim();
        if (!grupos.has(groupTitle)) {
            grupos.set(groupTitle, []);
        }
        grupos.get(groupTitle).push(k);
    });

    let html = `
        <table class="kits-mobile-table">
            <thead>
                <tr>
                    <th style="width: 52%;">Codigo / Descripción</th>
                    <th class="text-center" style="width: 22%;">Cantidad</th>
                    <th class="text-center" style="width: 26%;">Stock Almacen</th>
                </tr>
            </thead>
            <tbody>
    `;

    grupos.forEach((items, groupTitle) => {
        // Fila Encabezado de Sección en Negrita (1:1 Imagen 3)
        html += `
            <tr>
                <td colspan="3" class="kits-mobile-type-title">
                    <div class="d-flex align-items-center justify-content-between">
                        <span class="fw-black text-dark text-uppercase">${escapeHtml(groupTitle)}</span>
                    </div>
                </td>
            </tr>
        `;

        // Filas de repuestos
        items.forEach(it => {
            const kCod = (it.item_codigo || '').toString().trim();
            const kNom = (it.item_nombre || '').toString().trim();

            const invItem = window.kitsBuscarItemAlmacen(kCod, kNom);

            let displayCodigo = invItem ? (invItem.codInv || invItem.codigo || invItem.codigo_articulo) : kCod;
            if (!displayCodigo || displayCodigo === '-') {
                displayCodigo = '—';
            } else if (/^\d+$/.test(displayCodigo)) {
                displayCodigo = 'INV-' + displayCodigo.padStart(4, '0');
            }

            const displayNombre = (invItem ? invItem.nombre : kNom) || '—';
            const stockNum = invItem != null ? invItem.stock : (it.stock_almacen != null ? it.stock_almacen : 0);

            html += `
                <tr onclick="window.kitsEditarKit('${escapeHtml(it.marca_vehiculo)}', '${escapeHtml(it.modelo_vehiculo)}', '${escapeHtml(it.tipo_mp)}')" style="cursor: pointer;">
                    <td class="align-middle">
                        <div class="d-flex flex-column gap-0.5">
                            ${displayCodigo && displayCodigo !== '—' ? `<span class="badge bg-light text-dark border font-monospace fw-bold px-1.5 py-0.5 me-auto mb-1" style="font-size: 0.72rem; border-color: #cbd5e1 !important;">${escapeHtml(displayCodigo)}</span>` : ''}
                            <span class="fw-bold text-dark" style="font-size: 0.82rem; line-height: 1.3;">
                                ${escapeHtml(displayNombre)}
                            </span>
                        </div>
                    </td>
                    <td class="text-center align-middle font-monospace fw-bold" style="font-size: 0.85rem; color: #334155;">
                        ${it.cantidad.toFixed(2)}
                    </td>
                    <td class="text-center align-middle font-monospace fw-bold" style="font-size: 0.85rem; color: ${stockNum > 0 ? '#0f172a' : '#94a3b8'};">
                        ${stockNum}
                    </td>
                </tr>
            `;
        });
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
};

// =========================================================================
// MODAL / DRAWER DE FORMULARIO (NUEVO / EDITAR KIT)
// =========================================================================

/**
 * Abrir Drawer para Nuevo Kit
 */
window.kitsAbrirModal = function (presetMarca, presetModelo) {
    window._kitEditandoGrupo = null;
    window.kitsDeletedItemIds = [];
    window.kitsRowCounter = 0;

    const lblTitulo = document.getElementById('lblTituloModalKit');
    const lblSub = document.getElementById('lblSubtituloModalKit');
    if (lblTitulo) lblTitulo.textContent = 'Nuevo Kit de Mantenimiento';
    if (lblSub) lblSub.textContent = 'Configure el vehículo, tipo de preventivo y agregue repuestos requeridos';

    const pMarca = presetMarca || window.kitsSidebarMarcaSeleccionada || '';
    const pModelo = presetModelo || window.kitsSidebarModeloSeleccionado || '';

    // Poblar selects y comboboxes del modal
    window.kitsPoblarSelectsModal(pMarca, pModelo, '');

    const txtAlias = document.getElementById('modalKitNombreAlias');
    const txtObs = document.getElementById('modalKitObservaciones');
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
 * Poblar comboboxes y selectores del Modal (Marcas Motoras, Modelos Multi-Select, Tipos MP)
 */
window.kitsPoblarSelectsModal = function (presetMarca, presetModelo, presetTipo) {
    // 1. Combobox Marca
    const marcasArr = Array.from(new Set(
        (window._marcasMotorasFlota && window._marcasMotorasFlota.length
            ? window._marcasMotorasFlota
            : window.kitsData.map(k => k.marca_vehiculo))
        .filter(Boolean)
        .map(m => m.trim().toUpperCase())
    )).sort();

    const itemsMarca = marcasArr.map(m => ({ value: m, label: m }));
    if (typeof window._cbInit === 'function') {
        window._cbInit('modalKitMarca', itemsMarca, 'SELECCIONE MARCA...');
        window._cbOnSelect('modalKitMarca', function (val) {
            window.kitsModalMarcaCambiada();
        });
    }

    if (presetMarca) {
        if (typeof window._cbSet === 'function') window._cbSet('modalKitMarca', presetMarca, presetMarca);
    } else {
        if (typeof window._cbSet === 'function') window._cbSet('modalKitMarca', '', '');
    }

    // 2. Combobox Tipo MP (Con buscador escribible en vivo)
    const itemsTipo = (window._kitsTiposMPList || []).map(t => ({ value: t, label: t }));
    if (typeof window._cbInit === 'function') {
        window._cbInit('modalKitTipoMP', itemsTipo, 'SELECCIONE TIPO...');
        window._cbOnSelect('modalKitTipoMP', function (val) {
            window.kitsModalActualizarTitulo();
        });
    }

    if (presetTipo) {
        if (typeof window._cbSet === 'function') window._cbSet('modalKitTipoMP', presetTipo, presetTipo);
    } else {
        if (typeof window._cbSet === 'function') window._cbSet('modalKitTipoMP', '', '');
    }

    // 3. Poblar dropdown de modelos multi-select
    window.kitsModalMarcaCambiada(presetModelo);
};

/**
 * Evento al cambiar la Marca dentro del Modal
 */
window.kitsModalMarcaCambiada = function (presetModelo) {
    let marca = '';
    if (typeof window._cbGet === 'function') {
        marca = window._cbGet('modalKitMarca');
    }
    if (!marca) {
        const inputMarca = document.getElementById('modalKitMarca');
        marca = inputMarca ? inputMarca.value : '';
    }

    window.kitsModalPoblarDropdownModelos(marca, presetModelo);
    window.kitsModalActualizarTitulo();
};

/**
 * Toggle de visualización del dropdown de modelos con checkboxes
 */
window.kitsModalToggleDropdownModelos = function (event) {
    if (event) event.stopPropagation();
    const dd = document.getElementById('modalKitModelosDropdown');
    if (!dd) return;
    dd.style.display = (dd.style.display === 'none' || !dd.style.display) ? 'block' : 'none';
};

/**
 * Poblar el dropdown de modelos multi-select según la marca seleccionada
 */
window.kitsModalPoblarDropdownModelos = function (marca, presetModelos) {
    const dd = document.getElementById('modalKitModelosDropdown');
    if (!dd) return;

    const modelosSet = new Set();
    if (marca) {
        const fromMap = window._modelosPorMarcaMap ? window._modelosPorMarcaMap.get(marca.toUpperCase()) : null;
        if (fromMap && fromMap.size > 0) {
            fromMap.forEach(m => modelosSet.add(m));
        }
        if (window.dataGlobalPlacas && Array.isArray(window.dataGlobalPlacas)) {
            window.dataGlobalPlacas.forEach(p => {
                const pMarca = (p[3] || '').trim().toUpperCase();
                const pMod = (p[4] || '').trim().toUpperCase();
                if (pMarca === marca.toUpperCase() && pMod && pMod !== '-') {
                    modelosSet.add(pMod);
                }
            });
        }
        window.kitsData.forEach(k => {
            if (k.marca_vehiculo.toUpperCase() === marca.toUpperCase() && k.modelo_vehiculo && k.modelo_vehiculo !== 'TODOS LOS MODELOS' && k.modelo_vehiculo !== 'TODOS') {
                modelosSet.add(k.modelo_vehiculo.toUpperCase());
            }
        });
    }

    const modelosArr = Array.from(modelosSet).sort();

    // Establecer selección inicial
    window._kitsModalModelosSeleccionados.clear();
    if (presetModelos) {
        if (Array.isArray(presetModelos)) {
            presetModelos.forEach(m => { if (m) window._kitsModalModelosSeleccionados.add(m.toUpperCase()); });
        } else if (typeof presetModelos === 'string' && presetModelos.trim()) {
            if (presetModelos.toUpperCase() !== 'TODOS LOS MODELOS' && presetModelos.toUpperCase() !== 'TODOS') {
                window._kitsModalModelosSeleccionados.add(presetModelos.toUpperCase());
            }
        }
    }

    if (!modelosArr.length) {
        dd.innerHTML = `
            <div class="p-3 text-center text-muted small">
                <i class="bi bi-info-circle me-1"></i>No hay modelos específicos registrados para <strong>${escapeHtml(marca || 'esta marca')}</strong>.
                <div class="mt-1 fw-semibold text-primary">Se aplicará a "TODOS LOS MODELOS".</div>
            </div>
        `;
        window.kitsModalRenderModelosChips();
        return;
    }

    let html = '';
    modelosArr.forEach(mod => {
        const isChecked = window._kitsModalModelosSeleccionados.has(mod.toUpperCase());
        html += `
            <label class="d-flex align-items-center gap-2 p-2 rounded-2 hover:bg-slate-100" style="cursor:pointer; font-size:0.88rem; font-weight:600; color:#1e293b; user-select:none;">
                <input type="checkbox" class="form-check-input mt-0 kit-cb-modelo" value="${escapeHtml(mod)}" ${isChecked ? 'checked' : ''} onchange="window.kitsModalToggleModeloCheckbox('${escapeHtml(mod)}', this.checked)">
                <span class="flex-grow-1">${escapeHtml(mod)}</span>
            </label>
        `;
    });

    dd.innerHTML = html;
    window.kitsModalRenderModelosChips();
};

/**
 * Toggle de checkbox de modelo individual
 */
window.kitsModalToggleModeloCheckbox = function (modelo, isChecked) {
    const modUpper = (modelo || '').trim().toUpperCase();
    if (!modUpper) return;

    if (isChecked) {
        window._kitsModalModelosSeleccionados.add(modUpper);
    } else {
        window._kitsModalModelosSeleccionados.delete(modUpper);
    }

    window.kitsModalRenderModelosChips();
    window.kitsModalActualizarTitulo();
};

/**
 * Renderizar pastillas / chips de modelos seleccionados
 */
window.kitsModalRenderModelosChips = function () {
    const chipsContainer = document.getElementById('modalKitModelosChips');
    const placeholder = document.getElementById('modalKitModelosPlaceholder');
    if (!chipsContainer || !placeholder) return;

    if (!window._kitsModalModelosSeleccionados.size) {
        chipsContainer.innerHTML = '';
        placeholder.style.display = 'inline';
        placeholder.textContent = 'TODOS LOS MODELOS (O elija varios)';
    } else {
        placeholder.style.display = 'none';
        const chipsHtml = Array.from(window._kitsModalModelosSeleccionados).map(mod => `
            <span class="kit-model-chip">
                <span>${escapeHtml(mod)}</span>
                <span class="btn-remove-chip" onclick="event.stopPropagation(); window.kitsModalRemoverModeloChip('${escapeHtml(mod)}')">&times;</span>
            </span>
        `).join('');
        chipsContainer.innerHTML = chipsHtml;
    }
};

/**
 * Quitar un chip de modelo
 */
window.kitsModalRemoverModeloChip = function (modelo) {
    const modUpper = (modelo || '').trim().toUpperCase();
    window._kitsModalModelosSeleccionados.delete(modUpper);

    // Desmarcar checkbox en el dropdown
    const dd = document.getElementById('modalKitModelosDropdown');
    if (dd) {
        const cbs = dd.querySelectorAll('.kit-cb-modelo');
        cbs.forEach(cb => {
            if (cb.value.toUpperCase() === modUpper) {
                cb.checked = false;
            }
        });
    }

    window.kitsModalRenderModelosChips();
    window.kitsModalActualizarTitulo();
};

/**
 * Seleccionar todos los modelos disponibles para la marca
 */
window.kitsModalModelosSeleccionarTodos = function () {
    const dd = document.getElementById('modalKitModelosDropdown');
    if (!dd) return;
    const cbs = dd.querySelectorAll('.kit-cb-modelo');
    cbs.forEach(cb => {
        cb.checked = true;
        window._kitsModalModelosSeleccionados.add(cb.value.toUpperCase());
    });
    window.kitsModalRenderModelosChips();
    window.kitsModalActualizarTitulo();
};

/**
 * Limpiar todos los modelos seleccionados
 */
window.kitsModalModelosLimpiar = function () {
    const dd = document.getElementById('modalKitModelosDropdown');
    if (dd) {
        const cbs = dd.querySelectorAll('.kit-cb-modelo');
        cbs.forEach(cb => { cb.checked = false; });
    }
    window._kitsModalModelosSeleccionados.clear();
    window.kitsModalRenderModelosChips();
    window.kitsModalActualizarTitulo();
};

/**
 * Actualizar título dinámico del modal
 */
window.kitsModalActualizarTitulo = function () {
    let m = (typeof window._cbGet === 'function' ? window._cbGet('modalKitMarca') : '') || (document.getElementById('modalKitMarca')?.value || '');
    let t = (typeof window._cbGet === 'function' ? window._cbGet('modalKitTipoMP') : '') || (document.getElementById('modalKitTipoMP')?.value || '');
    const lblTitulo = document.getElementById('lblTituloModalKit');

    if (!window._kitEditandoGrupo && lblTitulo) {
        const modCount = window._kitsModalModelosSeleccionados.size;
        let modStr = '';
        if (modCount === 1) {
            modStr = ' • ' + Array.from(window._kitsModalModelosSeleccionados)[0];
        } else if (modCount > 1) {
            modStr = ` • ${modCount} Modelos`;
        }

        if (m || t) {
            lblTitulo.textContent = `Configurar Kit: ${m || 'Vehículo'}${modStr} (${t || 'MP'})`;
        } else {
            lblTitulo.textContent = 'Nuevo Kit de Mantenimiento';
        }
    }
};

/**
 * Agregar Fila Dinámica de Repuesto/Material en el Modal (1:1 Con Reporte de Fallas - Casillas Cómodas y Espaciosas)
 */
window.kitsModalAgregarFila = function (data = {}) {
    const container = document.getElementById('modalKitItemsContainer');
    if (!container) return;

    const rowId = `kit_row_${++window.kitsRowCounter}`;
    const listCodId = `dl_cod_${rowId}`;
    const listNomId = `dl_nom_${rowId}`;

    const cant = parseFloat(data.cantidad || 1);
    let cu = parseFloat(data.costo_unitario || 0);

    const kCod = (data.item_codigo || '').toString().trim();
    const kNom = (data.item_nombre || '').toString().trim();

    // Sincronizar con inventario en vivo si existe
    const invItem = window.kitsBuscarItemAlmacen(kCod, kNom);

    let codigoVal = invItem ? (invItem.codInv || invItem.codigo || invItem.codigo_articulo) : kCod;
    if (codigoVal === '-' || codigoVal === '—') codigoVal = '';
    else if (/^\d+$/.test(codigoVal)) codigoVal = 'INV-' + codigoVal.padStart(4, '0');

    const nombreVal = invItem ? invItem.nombre : kNom;
    const unidVal = data.unidad_medida || (invItem ? invItem.unidad : 'UND');
    if (invItem && invItem.costo > 0 && cu <= 0) {
        cu = invItem.costo;
    }

    const row = document.createElement('div');
    row.id = rowId;
    row.className = 'kit-item-row-card p-3 rounded-4 mb-2 bg-white border border-slate-200 shadow-2xs';
    if (data.id) row.dataset.id = data.id;
    row.dataset.unidad = unidVal;
    row.dataset.costo = cu;

    row.innerHTML = `
        <div class="row g-2 align-items-center">
            <!-- 1. Código del Artículo (con Datalist de Almacén) -->
            <div class="col-12 col-md-3">
                <label class="form-label d-block mb-1 text-secondary fw-bold" style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.4px;">Código Artículo</label>
                <div class="position-relative">
                    <input type="text" class="form-control font-monospace fw-bold kit-input-codigo text-uppercase border-secondary-subtle"
                           list="${listCodId}"
                           placeholder="CÓDIGO..."
                           value="${escapeHtml(codigoVal)}"
                           oninput="window.kitsModalItemCodigoCambiado(this, '${rowId}')"
                           autocomplete="off"
                           style="min-height: 42px; font-size: 0.90rem;">
                    <datalist id="${listCodId}">
                        ${(window._kitsAlmacenItems || []).map(it => `<option value="${escapeHtml(it.codInv || it.codigo)}">${escapeHtml(it.nombre)}</option>`).join('')}
                    </datalist>
                </div>
            </div>

            <!-- 2. Repuesto / Descripción Completa del Artículo -->
            <div class="col-12 col-md-6">
                <label class="form-label d-block mb-1 text-secondary fw-bold" style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.4px;">Repuesto / Lubricante / Material</label>
                <div class="position-relative">
                    <input type="text" class="form-control fw-bold kit-input-nombre border-secondary-subtle"
                           list="${listNomId}"
                           placeholder="Escriba o elija del inventario..."
                           value="${escapeHtml(nombreVal)}"
                           oninput="window.kitsModalItemNombreCambiado(this, '${rowId}')"
                           autocomplete="off"
                           style="min-height: 42px; font-size: 0.90rem;">
                    <datalist id="${listNomId}">
                        ${(window._kitsAlmacenItems || []).map(it => `<option value="${escapeHtml(it.nombre)}">${escapeHtml(it.codInv || it.codigo)}</option>`).join('')}
                    </datalist>
                </div>
            </div>

            <!-- 3. Cantidad -->
            <div class="col-8 col-md-2">
                <label class="form-label d-block mb-1 text-secondary fw-bold text-center" style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.4px;">Cantidad</label>
                <input type="number" class="form-control text-center font-monospace fw-bold kit-input-cant border-secondary-subtle"
                       value="${cant}" step="0.01" min="0.01"
                       oninput="window.kitsModalRecalcularTotales()"
                       style="min-height: 42px; font-size: 0.90rem;">
            </div>

            <!-- 4. Botón Eliminar Fila -->
            <div class="col-4 col-md-1 text-end pt-md-4">
                <button type="button" class="btn btn-outline-danger border-danger-subtle rounded-3 p-0 d-inline-flex align-items-center justify-content-center"
                        title="Quitar ítem" onclick="window.kitsModalEliminarFila('${rowId}')"
                        style="width: 42px; height: 42px; font-size: 1.1rem;">
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
        </div>

        <!-- Hint de Stock en Almacén -->
        <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top border-slate-100">
            <small class="text-muted font-monospace kit-stock-hint" style="font-size:0.75rem;">
                ${invItem ? `<i class="bi bi-box-seam me-1 text-primary"></i>Stock Almacén: <strong>${invItem.stock}</strong> ${invItem.unidad}` : '<span class="text-muted fst-italic">Ingrese código o nombre para vincular a Almacén</span>'}
            </small>
        </div>
    `;

    container.appendChild(row);
    window.kitsModalRecalcularTotales();
};

/**
 * Evento al escribir o elegir un Código del datalist
 */
window.kitsModalItemCodigoCambiado = function (inputEl, rowId) {
    const val = (inputEl.value || '').trim();
    if (!val) return;

    const matched = window.kitsBuscarItemAlmacen(val, '');
    if (matched) {
        const row = document.getElementById(rowId);
        if (row) {
            const nomInput = row.querySelector('.kit-input-nombre');
            const hintEl = row.querySelector('.kit-stock-hint');

            if (nomInput) nomInput.value = matched.nombre;
            row.dataset.unidad = matched.unidad || 'UND';
            row.dataset.costo = matched.costo || 0;
            if (hintEl) hintEl.innerHTML = `<i class="bi bi-box-seam me-1 text-primary"></i>Stock Almacén: <strong>${matched.stock}</strong> ${matched.unidad}`;

            window.kitsModalRecalcularTotales();
        }
    }
};

/**
 * Evento al escribir o elegir un repuesto del datalist
 */
window.kitsModalItemNombreCambiado = function (inputEl, rowId) {
    const val = (inputEl.value || '').trim();
    if (!val) return;

    const matched = window.kitsBuscarItemAlmacen('', val);
    if (matched) {
        const row = document.getElementById(rowId);
        if (row) {
            const codInput = row.querySelector('.kit-input-codigo');
            const hintEl = row.querySelector('.kit-stock-hint');

            let codVal = matched.codInv || matched.codigo || matched.codigo_articulo;
            if (/^\d+$/.test(codVal)) codVal = 'INV-' + codVal.padStart(4, '0');

            if (codInput && codVal) codInput.value = codVal;
            row.dataset.unidad = matched.unidad || 'UND';
            row.dataset.costo = matched.costo || 0;
            if (hintEl) hintEl.innerHTML = `<i class="bi bi-box-seam me-1 text-primary"></i>Stock Almacén: <strong>${matched.stock}</strong> ${matched.unidad}`;

            window.kitsModalRecalcularTotales();
        }
    }
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
 * Recalcular totales / contador de ítems del Modal
 */
window.kitsModalRecalcularTotales = function () {
    const container = document.getElementById('modalKitItemsContainer');
    if (!container) return;

    const rows = container.querySelectorAll('.kit-item-row-card');
    const counterEl = document.getElementById('modalKitItemsCounter');
    if (counterEl) {
        counterEl.textContent = `${rows.length} ${rows.length === 1 ? 'Ítem' : 'Ítems'}`;
    }
};

/**
 * Guardar Kit (Soporta Generación Independiente Multi-Modelo)
 */
window.kitsModalGuardar = function () {
    let marca = (typeof window._cbGet === 'function' ? window._cbGet('modalKitMarca') : '') || (document.getElementById('modalKitMarca')?.value || '');
    let tipo = (typeof window._cbGet === 'function' ? window._cbGet('modalKitTipoMP') : '') || (document.getElementById('modalKitTipoMP')?.value || '');
    const txtAlias = document.getElementById('modalKitNombreAlias');
    const txtObs = document.getElementById('modalKitObservaciones');

    marca = (marca || '').trim().toUpperCase();
    tipo = (tipo || '').trim().toUpperCase();
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

    const baseItems = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const itemCodigo = (r.querySelector('.kit-input-codigo')?.value || '').trim();
        const itemNombre = (r.querySelector('.kit-input-nombre')?.value || '').trim();
        const cant = parseFloat(r.querySelector('.kit-input-cant')?.value || 0) || 0;
        const id = r.dataset.id ? parseInt(r.dataset.id) : null;

        if (!itemNombre) {
            return alert(`El ítem #${i + 1} no tiene nombre de repuesto.`);
        }
        if (cant <= 0) {
            return alert(`El ítem "${itemNombre}" debe tener una cantidad mayor a 0.`);
        }

        // Vincular con Almacén en vivo para obtener unidad y costo referencial exactos
        const invMatch = window.kitsBuscarItemAlmacen(itemCodigo, itemNombre);
        const unid = (invMatch ? invMatch.unidad : (r.dataset.unidad || 'UND')).toUpperCase();
        const cu = invMatch ? (invMatch.costo || 0) : (parseFloat(r.dataset.costo || 0) || 0);
        const ct = cant * cu;

        let codFinal = invMatch ? (invMatch.codInv || invMatch.codigo || invMatch.codigo_articulo) : itemCodigo;
        if (/^\d+$/.test(codFinal)) codFinal = 'INV-' + codFinal.padStart(4, '0');

        baseItems.push({
            id,
            nombre_kit: alias,
            item_codigo: codFinal || '-',
            item_nombre: invMatch ? invMatch.nombre : itemNombre,
            cantidad: cant,
            unidad_medida: unid,
            costo_unitario: cu,
            costo_total: ct,
            observaciones: obs,
            orden: i + 1
        });
    }

    if (!baseItems.length && !window.kitsDeletedItemIds.length) {
        return alert('Debe registrar al menos un ítem o repuesto en el kit.');
    }

    const promises = [];

    // 1. Eliminar ítems quitados
    window.kitsDeletedItemIds.forEach(id => {
        promises.push(fetch(`/api/mantenimiento-kits/${id}`, { method: 'DELETE' }));
    });

    // 2. Determinar modelos a generar independientemente
    let modelosToSave = Array.from(window._kitsModalModelosSeleccionados);
    if (!modelosToSave.length) {
        modelosToSave = ['TODOS LOS MODELOS'];
    }

    if (window._kitEditandoGrupo) {
        // En modo edición: Determinar cuál es el modelo principal editado
        const origModel = (window._kitEditandoGrupo.modelo || '').toUpperCase();
        const targetPrimary = modelosToSave.includes(origModel) ? origModel : modelosToSave[0];

        // A. Actualizar/guardar los ítems del modelo principal
        baseItems.forEach(it => {
            const payload = {
                ...it,
                marca_vehiculo: marca,
                modelo_vehiculo: targetPrimary,
                tipo_mp: tipo
            };
            const method = it.id ? 'PUT' : 'POST';
            const url = it.id ? `/api/mantenimiento-kits/${it.id}` : '/api/mantenimiento-kits';

            promises.push(
                fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
            );
        });

        // B. Para todos los DEMÁS modelos seleccionados (ej: P-410 A4X2, R-500, etc.), generar de forma independiente
        const otherModels = modelosToSave.filter(m => m !== targetPrimary);
        otherModels.forEach(otherMod => {
            baseItems.forEach(it => {
                const payload = {
                    marca_vehiculo: marca,
                    modelo_vehiculo: otherMod,
                    tipo_mp: tipo,
                    nombre_kit: it.nombre_kit,
                    item_codigo: it.item_codigo,
                    item_nombre: it.item_nombre,
                    cantidad: it.cantidad,
                    unidad_medida: it.unidad_medida,
                    costo_unitario: it.costo_unitario,
                    costo_total: it.costo_total,
                    orden: it.orden,
                    observaciones: it.observaciones
                };

                promises.push(
                    fetch('/api/mantenimiento-kits', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })
                );
            });
        });
    } else {
        // En modo nuevo: Para cada modelo seleccionado, generar kit de forma independiente
        modelosToSave.forEach(mod => {
            baseItems.forEach(it => {
                const payload = {
                    marca_vehiculo: marca,
                    modelo_vehiculo: mod,
                    tipo_mp: tipo,
                    nombre_kit: it.nombre_kit,
                    item_codigo: it.item_codigo,
                    item_nombre: it.item_nombre,
                    cantidad: it.cantidad,
                    unidad_medida: it.unidad_medida,
                    costo_unitario: it.costo_unitario,
                    costo_total: it.costo_total,
                    orden: it.orden,
                    observaciones: it.observaciones
                };

                promises.push(
                    fetch('/api/mantenimiento-kits', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })
                );
            });
        });
    }

    const btnGuardar = document.getElementById('btnGuardarKitMP');
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

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
        })
        .finally(() => {
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = '<i class="bi bi-check-circle-fill"></i> Guardar Kit';
            }
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

// Listener global para cerrar dropdowns de selección múltiple al hacer clic fuera
document.addEventListener('click', function (e) {
    const chipContainer = document.getElementById('modalKitModelosChipsContainer');
    const dropdown = document.getElementById('modalKitModelosDropdown');
    if (chipContainer && dropdown && !chipContainer.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// Helper de escape HTML
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
