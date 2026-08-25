// ── LÓGICA DE VALES DE COMBUSTIBLE — ERP AZKELL FLEET (OPERACIONES) ────────────────
(function() {
    window._cvData = [];
    window._cvPaginaActual = 1;
    window._cvLimitePorPagina = 50;
    window._cvTotalPaginas = 1;
    window._cvTotalRegistros = 0;
    window._cvSeleccionados = new Set();
    window._cvParsedImportData = [];
    window._cvSortBy = 'correlativo';
    window._cvSortDir = 'DESC';
    let _cvSearchTimeout = null;

    // Inicializador del módulo
    window.inicializarModuloCombustibleVales = function() {
        const isMarsisa = (window.location.hostname || '').toLowerCase().includes('marsisa') ||
                          (localStorage.getItem('tenant_slug') || '').toLowerCase().includes('marsisa') ||
                          (window.location.hostname || '').includes('localhost');
        const btnSync = document.getElementById('cv-btn-sync-remoto');
        if (btnSync) {
            btnSync.style.display = isMarsisa ? 'inline-flex' : 'none';
        }

        // Configurar por defecto siempre Fecha Actual de Perú (America/Lima UTC-5)
        const getTodayPeru = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const today = getTodayPeru();
        const fd = document.getElementById('cv-filter-fecha-desde');
        const fh = document.getElementById('cv-filter-fecha-hasta');
        if (fd && !fd.value) fd.value = today;
        if (fh && !fh.value) fh.value = today;

        window.cvActualizarIconosOrden();
        window._cvCargarCatalogos();
        window.cvCargarDatos();
    };

    // ── GESTOR DE ORDENAMIENTO POR COLUMNA ──────────────────────────────────────────
    window.cvOrdenarPor = function(col) {
        if (window._cvSortBy === col) {
            window._cvSortDir = (window._cvSortDir === 'ASC' ? 'DESC' : 'ASC');
        } else {
            window._cvSortBy = col;
            window._cvSortDir = (col === 'fecha' || col === 'correlativo' || col === 'kilometraje' || col === 'galones' || col === 'importe') ? 'DESC' : 'ASC';
        }
        window.cvActualizarIconosOrden();
        window.cvCargarDatos(1);
    };

    window.cvActualizarIconosOrden = function() {
        document.querySelectorAll('.cv-sort-icon').forEach(icon => {
            icon.className = 'bi bi-arrow-down-up cv-sort-icon text-muted';
        });
        const activeIcon = document.getElementById(`cv-ico-${window._cvSortBy}`);
        if (activeIcon) {
            if (window._cvSortDir === 'ASC') {
                activeIcon.className = 'bi bi-arrow-up cv-sort-icon text-warning fw-bold';
            } else {
                activeIcon.className = 'bi bi-arrow-down cv-sort-icon text-warning fw-bold';
            }
        }
    };

    // ── SINCRONIZACIÓN DIRECTA DESDE HOST REMOTO (168.231.98.23) ───────────────────
    window.cvSincronizarRemoto = async function() {
        const btn = document.getElementById('cv-btn-sync-remoto');
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1.5"></span> Sincronizando...`;
        }

        try {
            const res = await fetch('/api/combustible/sincronizar-remoto', { method: 'POST' });
            const data = await res.json();
            if (data.ok) {
                alert(`✅ ${data.mensaje || 'Sincronización completada exitosamente.'}`);
                window._cvCargarCatalogos();
                window.cvCargarDatos(1);
            } else {
                alert(`⚠️ Error en sincronización: ${data.error || 'No se pudo sincronizar'}`);
            }
        } catch (e) {
            alert('Error al conectar con el servidor de sincronización.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = oldHtml;
            }
        }
    };

    // Cargar opciones para filtros
    window._cvCargarCatalogos = async function() {
        try {
            const res = await fetch('/api/combustible/catalogos');
            const data = await res.json();
            if (data.ok) {
                const selP = document.getElementById('cv-filter-placa');
                if (selP && data.placas) {
                    selP.innerHTML = '<option value="ALL">Todas las Placas</option>' +
                        data.placas.map(p => `<option value="${p}">${p}</option>`).join('');
                }
                const selC = document.getElementById('cv-filter-combustible');
                if (selC && data.combustibles) {
                    selC.innerHTML = '<option value="ALL">Todos los Combustibles</option>' +
                        data.combustibles.map(c => `<option value="${c}">${c}</option>`).join('');
                }
            }
        } catch (e) {
            console.error('Error cargando catálogos de combustible:', e);
        }
    };

    // Cargar datos paginados desde el Backend
    window.cvCargarDatos = async function(pagina = 1) {
        window._cvPaginaActual = pagina;
        const tbody = document.getElementById('cv-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="33" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                        Cargando vales de combustible...
                    </td>
                </tr>
            `;
        }

        const params = new URLSearchParams({
            page: window._cvPaginaActual,
            limit: window._cvLimitePorPagina,
            sort_by: window._cvSortBy || 'correlativo',
            sort_dir: window._cvSortDir || 'DESC'
        });

        const s = document.getElementById('cv-filter-search')?.value;
        const p = document.getElementById('cv-filter-placa')?.value;
        const c = document.getElementById('cv-filter-combustible')?.value;
        const e = document.getElementById('cv-filter-estado')?.value;
        const fd = document.getElementById('cv-filter-fecha-desde')?.value;
        const fh = document.getElementById('cv-filter-fecha-hasta')?.value;

        if (s) params.append('search', s);
        if (p && p !== 'ALL') params.append('placa', p);
        if (c && c !== 'ALL') params.append('combustible', c);
        if (e && e !== 'ALL') params.append('estado', e);
        if (fd) params.append('fecha_desde', fd);
        if (fh) params.append('fecha_hasta', fh);

        try {
            const res = await fetch(`/api/combustible/vales?${params.toString()}`);
            const data = await res.json();

            if (data.ok) {
                window._cvData = data.data || [];
                window._cvTotalRegistros = data.total || 0;
                window._cvTotalPaginas = data.totalPages || 1;

                window.cvRenderKPIs(data.kpis);
                window.cvRenderTabla();
                window.cvRenderPaginacion();
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="33" class="text-center text-danger py-4">Error: ${data.error || 'No se pudieron cargar los datos'}</td></tr>`;
            }
        } catch (err) {
            console.error('Error al obtener vales:', err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="33" class="text-center text-danger py-4">Error de conexión con el servidor.</td></tr>`;
        }
    };

    // Renderizar KPIs
    window.cvRenderKPIs = function(kpis = {}) {
        const totalV = kpis.totalVales || 0;
        const totalG = kpis.totalGalones || 0;
        const totalI = kpis.totalGasto || 0;
        const promC  = kpis.costoPromedioGalon || (totalG > 0 ? (totalI / totalG) : 0);

        const elV = document.getElementById('cv-kpi-total-vales');
        const elG = document.getElementById('cv-kpi-total-galones');
        const elI = document.getElementById('cv-kpi-total-importe');
        const elC = document.getElementById('cv-kpi-costo-promedio');

        if (elV) elV.textContent = totalV.toLocaleString();
        if (elG) elG.textContent = totalG.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Gln';
        if (elI) elI.textContent = 'S/ ' + totalI.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (elC) elC.textContent = 'S/ ' + promC.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Renderizar Tabla
    window.cvRenderTabla = function() {
        const tbody = document.getElementById('cv-tbody');
        const badge = document.getElementById('cv-tabla-total-badge');
        const pagInfo = document.getElementById('cv-tabla-pag-info');

        if (badge) badge.textContent = `${window._cvTotalRegistros.toLocaleString()} Registros`;
        if (pagInfo) pagInfo.textContent = `Página ${window._cvPaginaActual} de ${window._cvTotalPaginas}`;

        if (!tbody) return;

        if (window._cvData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="33" class="text-center py-5 text-muted">
                        <i class="bi bi-inbox fs-2 d-block mb-2"></i>
                        No se encontraron vales de combustible con los filtros actuales.
                    </td>
                </tr>
            `;
            return;
        }

        const fmtFecha = (f) => {
            if (!f) return '—';
            const d = new Date(f);
            if (isNaN(d.getTime())) return f;
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        const esc = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let html = '';
        window._cvData.forEach(row => {
            const isSelected = window._cvSeleccionados.has(row.id);
            const estadoBadge = row.estado === 'VÁLIDO' 
                ? '<span class="badge" style="background:#059669; color:#fff; font-size:0.68rem; font-weight:700;">VÁLIDO</span>'
                : '<span class="badge" style="background:#dc2626; color:#fff; font-size:0.68rem; font-weight:700;">ANULADO</span>';

            const pagoBadge = (row.estado_pago || '').toUpperCase() === 'PAGADO'
                ? '<span class="badge" style="background:#059669; color:#fff; font-size:0.68rem; font-weight:700;">PAGADO</span>'
                : '<span class="badge" style="background:#dc2626; color:#fff; font-size:0.68rem; font-weight:700;">NO EXISTE PAGO</span>';

            const cajaBadge = (row.estado_caja || '').toUpperCase() === 'PROCESADO'
                ? '<span class="badge" style="background:#059669; color:#fff; font-size:0.68rem; font-weight:700;">PROCESADO</span>'
                : esc(row.estado_caja || '—');

            const km = parseFloat(row.kilometraje || 0);
            const peso = parseFloat(row.peso_tn || 0);
            const gal = parseFloat(row.galones || 0);
            const costoGl = parseFloat(row.costo_gl || 0);
            const importe = parseFloat(row.importe || 0);

            html += `
                <tr class="${isSelected ? 'cv-row-selected' : ''}" id="cv-tr-${row.id}">
                    <td class="text-center">
                        <input type="checkbox" class="form-check-input cv-row-chk" data-id="${row.id}" ${isSelected ? 'checked' : ''} onchange="window.cvToggleSelectRow(${row.id}, this)">
                    </td>
                    <td>
                        <div class="dropdown">
                            <button class="btn btn-sm dropdown-toggle py-0.5 px-2 bg-white text-dark shadow-2xs fw-semibold" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="font-size: 0.72rem; border: 1px solid #cbd5e1; border-radius: 4px;">
                                EDITAR
                            </button>
                            <ul class="dropdown-menu shadow-sm" style="font-size: 0.8rem; z-index: 1050;">
                                <li><a class="dropdown-item py-1" href="javascript:void(0)" onclick="window.cvAbrirModalEditar(${row.id})"><i class="bi bi-pencil me-1.5 text-primary"></i> Editar Vale</a></li>
                                <li><a class="dropdown-item py-1 text-danger" href="javascript:void(0)" onclick="window.cvEliminarVale(${row.id})"><i class="bi bi-x-circle me-1.5"></i> Anular Vale</a></li>
                            </ul>
                        </div>
                    </td>
                    <td>${fmtFecha(row.fecha)}</td>
                    <td>${estadoBadge}</td>
                    <td><span class="font-monospace fw-semibold text-secondary">${esc(row.correlativo || '—')}</span></td>
                    <td>${pagoBadge}</td>
                    <td><span class="font-monospace text-dark fw-semibold" style="font-size:0.75rem;">${esc(row.viaje || '—')}</span></td>
                    <td><span class="font-monospace text-secondary" style="font-size:0.75rem;">${esc(row.caja || '—')}</span></td>
                    <td>${cajaBadge}</td>
                    <td><span class="text-secondary small fw-semibold">${esc(row.clase_vehiculo || 'TRACTO')}</span></td>
                    <td>
                        <span class="fw-bold text-dark font-monospace" style="font-size:0.8rem; letter-spacing:0.5px;">
                            ${esc(row.vehiculo || '—')}
                        </span>
                    </td>
                    <td class="fw-semibold text-dark text-truncate" style="max-width: 180px;" title="${esc(row.conductor)}">${esc(row.conductor || '—')}</td>
                    <td class="text-secondary small text-truncate" style="max-width: 200px;" title="${esc(row.ruta)}">${esc(row.ruta || '—')}</td>
                    <td>${esc(row.departamento || '—')}</td>
                    <td>${esc(row.provincia || '—')}</td>
                    <td>${esc(row.distrito || '—')}</td>
                    <td class="text-truncate" style="max-width: 150px;" title="${esc(row.estacion)}">${esc(row.estacion || '—')}</td>
                    <td><span class="badge bg-info bg-opacity-10 text-info border fw-bold" style="font-size:0.7rem;">${esc(row.tipo_combustible || 'D2')}</span></td>
                    <td class="text-truncate" style="max-width: 180px;" title="${esc(row.proveedor)}">${esc(row.proveedor || '—')}</td>
                    <td><span class="font-monospace small text-muted">${esc(row.ruc || '—')}</span></td>
                    <td class="text-end font-monospace">${km > 0 ? km.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace">${peso > 0 ? peso.toLocaleString('es-PE', { minimumFractionDigits: 2 }) : '—'}</td>
                    <td class="text-end font-monospace fw-bold text-primary">${gal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace">S/ ${costoGl.toFixed(2)}</td>
                    <td><span class="badge bg-light text-secondary border" style="font-size:0.68rem;">${esc(row.tipo_pago || '—')}</span></td>
                    <td class="text-center font-monospace">${row.dias_credito || 0}</td>
                    <td><span class="badge bg-light text-dark border" style="font-size:0.68rem;">${esc(row.moneda || 'SOLES')}</span></td>
                    <td class="text-end font-monospace fw-bold text-success">S/ ${importe.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td><span class="font-monospace small text-secondary">${esc(row.numero_comprobante || '—')}</span></td>
                    <td>${row.tipo_cambio ? row.tipo_cambio : '—'}</td>
                    <td>${row.archivo_url ? `<a href="${row.archivo_url}" target="_blank" class="btn btn-xs btn-outline-primary py-0 px-1"><i class="bi bi-file-earmark-pdf"></i></a>` : '—'}</td>
                    <td class="text-truncate" style="max-width: 140px;" title="${esc(row.observacion)}">${esc(row.observacion || '—')}</td>
                    <td><span class="badge bg-secondary bg-opacity-10 text-secondary border" style="font-size:0.68rem;">${esc(row.tipo || 'RECARGA VUELTA')}</span></td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        window.cvActualizarBotonEliminarMasivo();
    };

    // Renderizar Paginación
    window.cvRenderPaginacion = function() {
        const container = document.getElementById('cv-paginacion-botones');
        const leyenda = document.getElementById('cv-paginacion-leyenda');

        const inicio = (window._cvPaginaActual - 1) * window._cvLimitePorPagina + 1;
        const fin = Math.min(window._cvTotalRegistros, window._cvPaginaActual * window._cvLimitePorPagina);

        if (leyenda) {
            leyenda.textContent = window._cvTotalRegistros > 0 
                ? `Mostrando ${inicio.toLocaleString()} a ${fin.toLocaleString()} de ${window._cvTotalRegistros.toLocaleString()} vales`
                : `Mostrando 0 vales`;
        }

        if (!container) return;

        if (window._cvTotalPaginas <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = `
            <button class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1" ${window._cvPaginaActual <= 1 ? 'disabled' : ''} onclick="window.cvCargarDatos(${window._cvPaginaActual - 1})">
                <i class="bi bi-chevron-left"></i>
            </button>
        `;

        const maxButtons = 5;
        let startPage = Math.max(1, window._cvPaginaActual - 2);
        let endPage = Math.min(window._cvTotalPaginas, startPage + maxButtons - 1);
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        for (let p = startPage; p <= endPage; p++) {
            const isAct = (p === window._cvPaginaActual);
            html += `
                <button class="btn btn-sm ${isAct ? 'btn-primary text-white fw-bold' : 'btn-outline-secondary'} rounded-pill px-2.5 py-1 font-monospace" onclick="window.cvCargarDatos(${p})">
                    ${p}
                </button>
            `;
        }

        html += `
            <button class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1" ${window._cvPaginaActual >= window._cvTotalPaginas ? 'disabled' : ''} onclick="window.cvCargarDatos(${window._cvPaginaActual + 1})">
                <i class="bi bi-chevron-right"></i>
            </button>
        `;

        container.innerHTML = html;
    };

    // Cambiar límite por página (50, 100, 200)
    window.cvCambiarLimite = function(lim) {
        window._cvLimitePorPagina = parseInt(lim, 10) || 50;
        window.cvCargarDatos(1);
    };

    // Filtros con Debounce
    window.cvAplicarFiltrosDebounced = function() {
        clearTimeout(_cvSearchTimeout);
        _cvSearchTimeout = setTimeout(() => {
            window.cvCargarDatos(1);
        }, 300);
    };

    window.cvAplicarFiltros = function() {
        window.cvCargarDatos(1);
    };

    // Manejo de Selección Múltiple
    window.cvToggleSelectAll = function(chk) {
        const checked = chk.checked;
        window._cvData.forEach(row => {
            if (checked) window._cvSeleccionados.add(row.id);
            else window._cvSeleccionados.delete(row.id);
        });
        window.cvRenderTabla();
    };

    window.cvToggleSelectRow = function(id, chk) {
        if (chk.checked) window._cvSeleccionados.add(id);
        else window._cvSeleccionados.delete(id);
        
        const tr = document.getElementById(`cv-tr-${id}`);
        if (tr) tr.className = chk.checked ? 'cv-row-selected' : '';
        
        window.cvActualizarBotonEliminarMasivo();
    };

    window.cvActualizarBotonEliminarMasivo = function() {
        const btn = document.getElementById('cv-btn-eliminar-masivo');
        const countSpan = document.getElementById('cv-count-seleccionados');
        const count = window._cvSeleccionados.size;

        if (countSpan) countSpan.textContent = count;
        if (btn) {
            if (count > 0) {
                btn.classList.remove('d-none');
                btn.classList.add('d-flex');
            } else {
                btn.classList.add('d-none');
                btn.classList.remove('d-flex');
            }
        }
    };

    // Eliminación Masiva
    window.cvEliminarSeleccionados = async function() {
        const count = window._cvSeleccionados.size;
        if (count === 0) return;

        if (!confirm(`¿Estás seguro de que deseas eliminar definitivamente los ${count} vales seleccionados? Esta acción no se puede deshacer.`)) {
            return;
        }

        try {
            const res = await fetch('/api/combustible/vales/eliminar-masivo?hard=true', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(window._cvSeleccionados) })
            });
            const data = await res.json();
            if (data.ok) {
                alert(`✅ ${data.mensaje || 'Vales eliminados con éxito.'}`);
                window._cvSeleccionados.clear();
                window.cvCargarDatos(window._cvPaginaActual);
            } else {
                alert(`Error: ${data.error || 'No se pudieron eliminar los vales.'}`);
            }
        } catch (e) {
            alert('Error de conexión al eliminar vales.');
        }
    };

    // Eliminar o Anular Vale Individual
    window.cvEliminarVale = async function(id) {
        if (!confirm(`¿Deseas eliminar este vale (#${id})? Presiona Aceptar para confirmar.`)) return;

        try {
            const res = await fetch(`/api/combustible/vales/${id}?hard=true`, { method: 'DELETE' });
            const data = await res.json();
            if (data.ok) {
                window._cvSeleccionados.delete(id);
                window.cvCargarDatos(window._cvPaginaActual);
            } else {
                alert(`Error: ${data.error || 'No se pudo eliminar el vale'}`);
            }
        } catch (e) {
            alert('Error al conectar con el servidor.');
        }
    };

    // ── PROCESAMIENTO E IMPORTACIÓN EXCEL MARSISASOFT ───────────────────────────
    window.cvAbrirModalImportar = function() {
        window._cvParsedImportData = [];
        const box = document.getElementById('cv-import-preview-box');
        if (box) box.classList.add('d-none');
        const btn = document.getElementById('cv-btn-confirmar-import');
        if (btn) btn.disabled = true;
        const input = document.getElementById('cv-file-input');
        if (input) input.value = '';

        const modalEl = document.getElementById('cvModalImportar');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    };

    window.cvProcesarArchivoExcel = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (typeof XLSX === 'undefined') {
            alert('La librería SheetJS no está cargada. Por favor recarga la página.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                if (rows.length === 0) {
                    alert('El archivo no contiene filas de datos.');
                    return;
                }

                window._cvParsedImportData = rows;

                document.getElementById('cv-import-filename').textContent = file.name;
                document.getElementById('cv-import-count-badge').textContent = `${rows.length.toLocaleString()} vales detectados`;

                const tbody = document.getElementById('cv-import-preview-tbody');
                if (tbody) {
                    const previewRows = rows.slice(0, 5);
                    tbody.innerHTML = previewRows.map(r => {
                        const fecha = r.FECHA || r.fecha || '—';
                        const viaje = r.VIAJE || r.viaje || '—';
                        const veh = r.VEHICULO || r.vehiculo || r.PLACA || r.placa || '—';
                        const cond = r.CONDUCTOR || r.conductor || '—';
                        const ruta = r.RUTA || r.ruta || '—';
                        const grifo = r.ESTACIÓN || r.ESTACION || r.estacion || r.PROVEEDOR || '—';
                        const gal = r.GALONES || r.galones || '0';
                        const imp = r.IMPORTE || r.importe || '0';

                        return `
                            <tr>
                                <td>${fecha}</td>
                                <td>${viaje}</td>
                                <td><strong>${veh}</strong></td>
                                <td>${cond}</td>
                                <td>${ruta}</td>
                                <td>${grifo}</td>
                                <td class="text-end text-primary fw-bold">${gal}</td>
                                <td class="text-end text-success fw-bold">${imp}</td>
                            </tr>
                        `;
                    }).join('');
                }

                document.getElementById('cv-import-preview-box').classList.remove('d-none');
                document.getElementById('cv-btn-confirmar-import').disabled = false;
            } catch (err) {
                console.error(err);
                alert('Error al leer el archivo Excel: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    window.cvConfirmarImportacion = async function() {
        if (!window._cvParsedImportData || window._cvParsedImportData.length === 0) {
            alert('No hay datos para importar.');
            return;
        }

        const btn = document.getElementById('cv-btn-confirmar-import');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Importando ${window._cvParsedImportData.length} vales...`;
        }

        try {
            const res = await fetch('/api/combustible/vales/importar-masivo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vales: window._cvParsedImportData })
            });
            const data = await res.json();

            if (data.ok) {
                alert(`✅ ${data.mensaje || 'Importación completada con éxito.'}`);
                const modalEl = document.getElementById('cvModalImportar');
                if (modalEl) {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }
                window._cvCargarCatalogos();
                window.cvCargarDatos(1);
            } else {
                alert(`Error al importar: ${data.error || 'Falló la inserción'}`);
            }
        } catch (e) {
            alert('Error de conexión al enviar el archivo.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="bi bi-check-lg"></i> Importar Vales al ERP`;
            }
        }
    };

    // ── EXPORTAR A EXCEL (XLSX) ────────────────────────────────────────────────
    window.cvExportarExcel = async function() {
        if (typeof XLSX === 'undefined') {
            alert('Librería SheetJS no disponible.');
            return;
        }

        const params = new URLSearchParams({ limit: 5000 });
        const s = document.getElementById('cv-filter-search')?.value;
        const p = document.getElementById('cv-filter-placa')?.value;
        const c = document.getElementById('cv-filter-combustible')?.value;
        const e = document.getElementById('cv-filter-estado')?.value;
        const fd = document.getElementById('cv-filter-fecha-desde')?.value;
        const fh = document.getElementById('cv-filter-fecha-hasta')?.value;

        if (s) params.append('search', s);
        if (p && p !== 'ALL') params.append('placa', p);
        if (c && c !== 'ALL') params.append('combustible', c);
        if (e && e !== 'ALL') params.append('estado', e);
        if (fd) params.append('fecha_desde', fd);
        if (fh) params.append('fecha_hasta', fh);

        try {
            const res = await fetch(`/api/combustible/vales?${params.toString()}`);
            const data = await res.json();
            const exportRows = data.ok ? data.data : window._cvData;

            if (!exportRows || exportRows.length === 0) {
                alert('No hay vales para exportar.');
                return;
            }

            const exportData = exportRows.map(r => ({
                "FECHA": r.fecha,
                "ESTADO": r.estado,
                "CORRELATIVO": r.correlativo,
                "ESTADO PAGO": r.estado_pago,
                "VIAJE": r.viaje,
                "CAJA": r.caja,
                "ESTADO CAJA": r.estado_caja,
                "CLASE VEHICULO": r.clase_vehiculo,
                "VEHICULO": r.vehiculo,
                "CONDUCTOR": r.conductor,
                "RUTA": r.ruta,
                "DEPARTAMENTO": r.departamento,
                "PROVINCIA": r.provincia,
                "DISTRITO": r.distrito,
                "ESTACIÓN": r.estacion,
                "TIPO COMBUSTIBLE": r.tipo_combustible,
                "PROVEEDOR": r.proveedor,
                "RUC": r.ruc,
                "KILOMETRAJE": r.kilometraje,
                "PESO (Tn)": r.peso_tn,
                "GALONES": r.galones,
                "COSTO/GL": r.costo_gl,
                "TIPO PAGO": r.tipo_pago,
                "DÍAS CRÉDITO": r.dias_credito,
                "MONEDA": r.moneda,
                "IMPORTE": r.importe,
                "NÚMERO COMPROBANTE": r.numero_comprobante,
                "TIPO CAMBIO": r.tipo_cambio,
                "OBSERVACIÓN": r.observacion,
                "TIPO": r.tipo
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Vales_Combustible");
            XLSX.writeFile(wb, `Vales_Combustible_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (e) {
            alert('Error exportando vales a Excel.');
        }
    };

    // ── FORMULARIO MODAL NUEVO / EDITAR ────────────────────────────────────────
    window.cvAbrirModalNuevo = function() {
        document.getElementById('cv-form-id').value = '';
        document.getElementById('cv-modal-form-title').textContent = 'Nuevo Vale de Combustible';
        document.getElementById('cv-form-vale').reset();
        
        const now = new Date();
        const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        document.getElementById('cv-f-fecha').value = localIso;

        const modalEl = document.getElementById('cvModalForm');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.cvAbrirModalEditar = function(id) {
        const item = window._cvData.find(r => r.id === id);
        if (!item) return;

        document.getElementById('cv-form-id').value = item.id;
        document.getElementById('cv-modal-form-title').textContent = `Editar Vale #${item.id} (${item.vehiculo})`;

        if (item.fecha) {
            const dt = new Date(item.fecha);
            const localIso = new Date(dt.getTime() - (dt.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            document.getElementById('cv-f-fecha').value = localIso;
        }
        document.getElementById('cv-f-correlativo').value = item.correlativo || '';
        document.getElementById('cv-f-estado').value = item.estado || 'VÁLIDO';
        document.getElementById('cv-f-vehiculo').value = item.vehiculo || '';
        document.getElementById('cv-f-viaje').value = item.viaje || '';
        document.getElementById('cv-f-clase').value = item.clase_vehiculo || 'TRACTO';
        document.getElementById('cv-f-tipo').value = item.tipo || 'RECARGA VUELTA';
        document.getElementById('cv-f-conductor').value = item.conductor || '';
        document.getElementById('cv-f-ruta').value = item.ruta || '';
        document.getElementById('cv-f-estacion').value = item.estacion || '';
        document.getElementById('cv-f-proveedor').value = item.proveedor || '';
        document.getElementById('cv-f-combustible').value = item.tipo_combustible || 'D2';
        document.getElementById('cv-f-kilometraje').value = item.kilometraje || 0;
        document.getElementById('cv-f-galones').value = item.galones || 0;
        document.getElementById('cv-f-costo-gl').value = item.costo_gl || 0;
        document.getElementById('cv-f-importe').value = item.importe || 0;
        document.getElementById('cv-f-comprobante').value = item.numero_comprobante || '';
        document.getElementById('cv-f-tipo-pago').value = item.tipo_pago || 'ANTICIPO';
        document.getElementById('cv-f-estado-pago').value = item.estado_pago || 'NO PAGADO';
        document.getElementById('cv-f-obs').value = item.observacion || '';

        const modalEl = document.getElementById('cvModalForm');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.cvRecalcularTotalForm = function() {
        const gal = parseFloat(document.getElementById('cv-f-galones')?.value || 0);
        const cgl = parseFloat(document.getElementById('cv-f-costo-gl')?.value || 0);
        if (gal > 0 && cgl > 0) {
            document.getElementById('cv-f-importe').value = (gal * cgl).toFixed(2);
        }
    };

    window.cvGuardarFormulario = async function(event) {
        event.preventDefault();
        const id = document.getElementById('cv-form-id').value;
        const isEdit = !!id;

        const payload = {
            fecha: document.getElementById('cv-f-fecha').value,
            correlativo: document.getElementById('cv-f-correlativo').value,
            estado: document.getElementById('cv-f-estado').value,
            vehiculo: document.getElementById('cv-f-vehiculo').value.toUpperCase().trim(),
            viaje: document.getElementById('cv-f-viaje').value.trim(),
            clase_vehiculo: document.getElementById('cv-f-clase').value.trim(),
            tipo: document.getElementById('cv-f-tipo').value.trim(),
            conductor: document.getElementById('cv-f-conductor').value.trim(),
            ruta: document.getElementById('cv-f-ruta').value.trim(),
            estacion: document.getElementById('cv-f-estacion').value.trim(),
            proveedor: document.getElementById('cv-f-proveedor').value.trim(),
            tipo_combustible: document.getElementById('cv-f-combustible').value.trim(),
            kilometraje: parseFloat(document.getElementById('cv-f-kilometraje').value || 0),
            galones: parseFloat(document.getElementById('cv-f-galones').value || 0),
            costo_gl: parseFloat(document.getElementById('cv-f-costo-gl').value || 0),
            importe: parseFloat(document.getElementById('cv-f-importe').value || 0),
            numero_comprobante: document.getElementById('cv-f-comprobante').value.trim(),
            tipo_pago: document.getElementById('cv-f-tipo-pago').value,
            estado_pago: document.getElementById('cv-f-estado-pago').value,
            observacion: document.getElementById('cv-f-obs').value.trim()
        };

        try {
            const url = isEdit ? `/api/combustible/vales/${id}` : '/api/combustible/vales';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.ok) {
                alert(`✅ ${data.mensaje || 'Guardado exitosamente'}`);
                const modalEl = document.getElementById('cvModalForm');
                if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
                window.cvCargarDatos(window._cvPaginaActual);
            } else {
                alert(`Error: ${data.error || 'No se pudo guardar'}`);
            }
        } catch (e) {
            alert('Error de conexión al guardar el formulario.');
        }
    };

    // ── COMPRAS EXTERNAS (FACTURAS DE GRIFOS) ───────────────────────────
    window._cvComprasExternasData = [];
    window.cvAbrirModalComprasExternas = function() {
        const modalEl = document.getElementById('cvModalComprasExternas');
        if (!modalEl) return;
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        window.cvCargarComprasExternas();
    };

    window.cvCargarComprasExternas = async function() {
        const tbody = document.getElementById('cv-modal-ce-tbody');
        const countBadge = document.getElementById('cv-modal-ce-count');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Cargando facturas sincronizadas...</td></tr>`;
        }

        try {
            const res = await fetch('/api/combustible/compras-externas');
            const data = await res.json();

            if (data.ok && Array.isArray(data.data)) {
                window._cvComprasExternasData = data.data;
                if (countBadge) countBadge.textContent = `${data.data.length} Facturas`;
                window.cvRenderComprasExternas(data.data);
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-danger">No se pudieron obtener las compras externas.</td></tr>`;
            }
        } catch (e) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-danger">Error conectando con el servidor.</td></tr>`;
        }
    };

    window.cvRenderComprasExternas = function(items) {
        const tbody = document.getElementById('cv-modal-ce-tbody');
        if (!tbody) return;
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-muted">No se encontraron facturas externas.</td></tr>`;
            return;
        }

        const fmtFecha = (f) => {
            if (!f) return '—';
            const d = new Date(f);
            if (isNaN(d.getTime())) return f;
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
        };

        let html = '';
        items.forEach(r => {
            const sunatBadge = (r.estado_sunat || '').toUpperCase() === 'ACEPTADA'
                ? '<span class="badge bg-success bg-opacity-10 text-success fw-bold px-2 py-0.5">ACEPTADA</span>'
                : `<span class="badge bg-secondary bg-opacity-10 text-secondary fw-bold px-2 py-0.5">${r.estado_sunat || 'EMITIDA'}</span>`;

            const pagoBadge = (r.estado_pago || '').toUpperCase() === 'PAGADO'
                ? '<span class="badge" style="background:#059669; color:#fff; font-size:0.68rem; font-weight:700;">PAGADO</span>'
                : '<span class="badge" style="background:#dc2626; color:#fff; font-size:0.68rem; font-weight:700;">PENDIENTE</span>';

            html += `
                <tr>
                    <td>${fmtFecha(r.fecha_abastecimiento || r.fecha)}</td>
                    <td><span class="font-monospace fw-bold text-dark">${r.comprobante || '—'}</span></td>
                    <td class="text-truncate fw-semibold" style="max-width:180px;">${r.proveedor || '—'}</td>
                    <td><span class="font-monospace small text-muted">${r.proveedor_ruc || '—'}</span></td>
                    <td><span class="fw-bold text-primary font-monospace">${r.placa || '—'}</span></td>
                    <td class="text-truncate" style="max-width:140px;">${r.conductor || '—'}</td>
                    <td class="text-end font-monospace fw-bold">${parseFloat(r.galones || 0).toFixed(2)}</td>
                    <td class="text-end font-monospace">S/ ${parseFloat(r.costo_por_galon || 0).toFixed(2)}</td>
                    <td class="text-end font-monospace fw-bold text-success">S/ ${parseFloat(r.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td>${sunatBadge}</td>
                    <td>${pagoBadge}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    };

    window.cvFiltrarComprasExternas = function(q) {
        const query = (q || '').toLowerCase().trim();
        if (!query) {
            window.cvRenderComprasExternas(window._cvComprasExternasData);
            return;
        }
        const filtered = window._cvComprasExternasData.filter(r => 
            (r.comprobante || '').toLowerCase().includes(query) ||
            (r.proveedor || '').toLowerCase().includes(query) ||
            (r.placa || '').toLowerCase().includes(query) ||
            (r.conductor || '').toLowerCase().includes(query)
        );
        window.cvRenderComprasExternas(filtered);
    };

    window.cvImprimirTabla = function() {
        window.print();
    };

    window.cvLimpiarFiltros = function() {
        const getTodayPeru = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const today = getTodayPeru();
        const s = document.getElementById('cv-filter-search'); if (s) s.value = '';
        const p = document.getElementById('cv-filter-placa'); if (p) p.value = 'ALL';
        const e = document.getElementById('cv-filter-estado'); if (e) e.value = 'ALL';
        const c = document.getElementById('cv-filter-combustible'); if (c) c.value = 'ALL';
        const fd = document.getElementById('cv-filter-fecha-desde'); if (fd) fd.value = today;
        const fh = document.getElementById('cv-filter-fecha-hasta'); if (fh) fh.value = today;
        window.cvCargarDatos(1);
    };

    // Auto-inicializar
    window.inicializarModuloCombustibleVales();
})();
