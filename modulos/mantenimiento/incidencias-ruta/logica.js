// ── LÓGICA DE INCIDENCIAS EN RUTA — ERP AZKELL FLEET ───────────────────────────
(function() {
    window._incData = [];
    window._incCatalogoPlacas = [];
    window._incPaginaActual = 1;
    window._incLimitePorPagina = 50;
    window._incTotalPaginas = 1;
    window._incSortField = 'fecha_falla';
    window._incSortDir = 'DESC';
    let _incSearchTimeout = null;

    window._incTabActiva = 'matriz'; // 'matriz' | 'graficas'
    window._incCharts = {
        mensual: null,
        area: null,
        topPlacas: null,
        topFallas: null,
        responsables: null
    };

    // Inicializador del módulo (llamado por el router SPA de logica.js)
    window.init_mantenimiento_incidencias_ruta = function() {
        window.incCargarCatalogos();
        window.incCargarDatos();
        window.incSetupEventos();
    };

    // Alternar entre Matriz de Registros y Gráficas Analíticas
    window.incCambiarTab = function(tab) {
        window._incTabActiva = tab;
        const viewMatriz = document.getElementById('inc-view-matriz');
        const viewGraficas = document.getElementById('inc-view-graficas');
        const btnMatriz = document.getElementById('btn-tab-inc-matriz');
        const btnGraficas = document.getElementById('btn-tab-inc-graficas');

        if (tab === 'graficas') {
            if (viewMatriz) viewMatriz.style.display = 'none';
            if (viewGraficas) viewGraficas.style.display = 'block';

            if (btnMatriz) {
                btnMatriz.classList.remove('active', 'btn-primary');
                btnMatriz.classList.add('text-secondary');
            }
            if (btnGraficas) {
                btnGraficas.classList.add('active', 'btn-primary', 'text-white');
                btnGraficas.classList.remove('text-secondary');
            }

            // Cargar y renderizar gráficos
            window.incCargarGraficas();
        } else {
            if (viewMatriz) viewMatriz.style.display = 'block';
            if (viewGraficas) viewGraficas.style.display = 'none';

            if (btnMatriz) {
                btnMatriz.classList.add('active', 'btn-primary', 'text-white');
                btnMatriz.classList.remove('text-secondary');
            }
            if (btnGraficas) {
                btnGraficas.classList.remove('active', 'btn-primary', 'text-white');
                btnGraficas.classList.add('text-secondary');
            }
        }
    };

    // Cargar Datos Analíticos para Gráficos desde el Backend
    window.incCargarGraficas = async function() {
        const anio = document.getElementById('inc-analytics-anio')?.value || new Date().getFullYear();
        try {
            const res = await fetch(`/api/mantenimiento/incidencias-ruta/analytics?anio=${encodeURIComponent(anio)}`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Error al obtener analítica');

            // 1. Render Mini KPIs Bento
            const r = data.resumen || {};
            const elCostoProm = document.getElementById('ga-kpi-costo-prom');
            if (elCostoProm) elCostoProm.innerText = `S/ ${(r.costoPromedio || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            const elTransbordo = document.getElementById('ga-kpi-transbordo');
            if (elTransbordo) elTransbordo.innerText = `${r.tasaTransbordo || 0}%`;
            const elTransSub = document.getElementById('ga-kpi-transbordo-sub');
            if (elTransSub) elTransSub.innerText = `${r.totalTransbordos || 0} de ${r.total || 0} con pase de carga`;

            const elEficacia = document.getElementById('ga-kpi-eficacia');
            const porcEficacia = (r.total > 0) ? Math.round(((r.totalAtendidos || 0) / r.total) * 100) : 100;
            if (elEficacia) elEficacia.innerText = `${porcEficacia}%`;
            const elEficaciaSub = document.getElementById('ga-kpi-eficacia-sub');
            if (elEficaciaSub) elEficaciaSub.innerText = `${r.totalPendientes || 0} casos pendientes`;

            const elGastoAnual = document.getElementById('ga-kpi-gasto-anual');
            if (elGastoAnual) elGastoAnual.innerText = `S/ ${(r.totalCosto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            // 2. Render de los 5 Gráficos
            window.incRenderGraficoMensual(data.mensual || {});
            window.incRenderGraficoArea(data.areaMap || {});
            window.incRenderGraficoTopPlacas(data.topPlacas || []);
            window.incRenderGraficoTopFallas(data.topFallas || []);
            window.incRenderGraficoResponsables(data.topResponsables || []);

        } catch (err) {
            console.error('Error cargando gráficas de incidencias:', err);
        }
    };

    // Helper Chart Constructor Seguro
    function _getChart() {
        return window.Chart || (typeof Chart !== 'undefined' ? Chart : null);
    }

    // ── 1. Gráfico Mensual (Incidencias + Gasto) ──
    window.incRenderGraficoMensual = function(mensualData) {
        const canvas = document.getElementById('chartIncMensual');
        if (!canvas) return;
        const C = _getChart();
        if (!C) return;

        if (window._incCharts.mensual) {
            window._incCharts.mensual.destroy();
            window._incCharts.mensual = null;
        }

        const labels = mensualData.labels || ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
        const incidencias = mensualData.incidencias || [];
        const costos = mensualData.costos || [];

        window._incCharts.mensual = new C(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Gasto en Carretera (S/)',
                        data: costos,
                        borderColor: '#7c3aed',
                        backgroundColor: 'rgba(124, 58, 237, 0.1)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.35,
                        yAxisID: 'y1',
                        pointRadius: 4,
                        pointBackgroundColor: '#7c3aed'
                    },
                    {
                        type: 'bar',
                        label: 'Cant. Incidencias',
                        data: incidencias,
                        backgroundColor: '#0284c7',
                        borderRadius: 6,
                        barThickness: 18,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { font: { size: 11, weight: 'bold' } } },
                    datalabels: false,
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                if (ctx.dataset.yAxisID === 'y1') {
                                    return ` Gasto: S/ ${Number(ctx.raw || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
                                }
                                return ` Incidencias: ${ctx.raw} eventos`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'N° Incidencias', font: { size: 10 } },
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Gasto S/', font: { size: 10 } },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true
                    }
                }
            }
        });
    };

    // ── 2. Gráfico por Área (Donut) ──
    window.incRenderGraficoArea = function(areaMap) {
        const canvas = document.getElementById('chartIncArea');
        if (!canvas) return;
        const C = _getChart();
        if (!C) return;

        if (window._incCharts.area) {
            window._incCharts.area.destroy();
            window._incCharts.area = null;
        }

        const labels = Object.keys(areaMap);
        const data = Object.values(areaMap);
        const colors = ['#0284c7', '#7c3aed', '#f59e0b', '#10b981', '#64748b'];

        window._incCharts.area = new C(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['Sin Datos'],
                datasets: [{
                    data: data.length ? data : [1],
                    backgroundColor: data.length ? colors.slice(0, labels.length) : ['#e2e8f0'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: { display: false },
                    datalabels: false,
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ` ${ctx.label}: ${ctx.raw} incidencias`;
                            }
                        }
                    }
                }
            }
        });

        // Leyenda HTML personalizada
        const legendDiv = document.getElementById('chartIncAreaLegend');
        if (legendDiv) {
            legendDiv.innerHTML = labels.map((l, i) => `
                <div class="d-flex align-items-center gap-1.5">
                    <span class="rounded-circle" style="width:10px; height:10px; background:${colors[i % colors.length]};"></span>
                    <span>${l}: <b>${areaMap[l]}</b></span>
                </div>
            `).join('');
        }
    };

    // ── 3. Gráfico Top Placas (Barras Horizontales) ──
    window.incRenderGraficoTopPlacas = function(topPlacas) {
        const canvas = document.getElementById('chartIncTopPlacas');
        if (!canvas) return;
        const C = _getChart();
        if (!C) return;

        if (window._incCharts.topPlacas) {
            window._incCharts.topPlacas.destroy();
            window._incCharts.topPlacas = null;
        }

        const labels = topPlacas.map(p => `${p.placa} (${p.tipo})`);
        const data = topPlacas.map(p => p.count);

        window._incCharts.topPlacas = new C(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Sin Datos'],
                datasets: [{
                    label: 'Cantidad de Fallas',
                    data: data.length ? data : [0],
                    backgroundColor: '#ef4444',
                    borderRadius: 6,
                    barThickness: 16
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: false,
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const p = topPlacas[ctx.dataIndex];
                                return ` ${ctx.raw} fallas — Gasto: S/ ${(p?.costo || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { display: true } },
                    y: { grid: { display: false } }
                }
            }
        });
    };

    // ── 4. Gráfico Top Fallas (Pareto Horizontal) ──
    window.incRenderGraficoTopFallas = function(topFallas) {
        const canvas = document.getElementById('chartIncTopFallas');
        if (!canvas) return;
        const C = _getChart();
        if (!C) return;

        if (window._incCharts.topFallas) {
            window._incCharts.topFallas.destroy();
            window._incCharts.topFallas = null;
        }

        const labels = topFallas.map(f => f.falla);
        const data = topFallas.map(f => f.count);

        window._incCharts.topFallas = new C(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Sin Datos'],
                datasets: [{
                    label: 'Frecuencia',
                    data: data.length ? data : [0],
                    backgroundColor: '#f59e0b',
                    borderRadius: 6,
                    barThickness: 16
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: false,
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ` ${ctx.raw} ocurrencias registradas`;
                            }
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { display: true } },
                    y: { grid: { display: false } }
                }
            }
        });
    };

    // ── 5. Gráfico por Responsables (Barras Verticales) ──
    window.incRenderGraficoResponsables = function(topResponsables) {
        const canvas = document.getElementById('chartIncResponsables');
        if (!canvas) return;
        const C = _getChart();
        if (!C) return;

        if (window._incCharts.responsables) {
            window._incCharts.responsables.destroy();
            window._incCharts.responsables = null;
        }

        const labels = topResponsables.map(r => r.nombre);
        const data = topResponsables.map(r => r.count);

        window._incCharts.responsables = new C(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Sin Asignar'],
                datasets: [{
                    label: 'Incidencias Gestionadas',
                    data: data.length ? data : [0],
                    backgroundColor: '#06b6d4',
                    borderRadius: 6,
                    barThickness: 22
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: false,
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ` ${ctx.raw} incidencias atendidas`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { display: true } }
                }
            }
        });
    };

    // Filtrar interactivamente haciendo clic en los Cards Bento KPI
    window.incFiltrarPorKPI = function(tipo) {
        // Remover clase active de todas las cards
        document.querySelectorAll('.inc-kpi-clickable').forEach(card => card.classList.remove('active'));

        const selSolucion = document.getElementById('inc-filter-solucion');

        if (tipo === 'ALL') {
            document.getElementById('kpi-card-total')?.classList.add('active');
            if (selSolucion) selSolucion.value = 'ALL';
            window._incSortField = 'fecha_falla';
            window._incSortDir = 'DESC';
        } else if (tipo === 'Pendiente') {
            document.getElementById('kpi-card-pendientes')?.classList.add('active');
            if (selSolucion) selSolucion.value = 'Pendiente';
        } else if (tipo === 'Atendido') {
            document.getElementById('kpi-card-atendidas')?.classList.add('active');
            if (selSolucion) selSolucion.value = 'Atendido';
        } else if (tipo === 'COSTO') {
            document.getElementById('kpi-card-costo')?.classList.add('active');
            if (selSolucion) selSolucion.value = 'ALL';
            window._incSortField = 'total_costo';
            window._incSortDir = 'DESC';
        }

        window.incActualizarIconosOrden();
        window.incCargarDatos(1);
    };

    // Alternar orden al hacer clic en un encabezado
    window.incOrdenarPor = function(columna) {
        if (window._incSortField === columna) {
            window._incSortDir = window._incSortDir === 'ASC' ? 'DESC' : 'ASC';
        } else {
            window._incSortField = columna;
            // Para fecha y costo iniciar DESC (más reciente/más alto primero), para texto iniciar ASC
            window._incSortDir = (columna === 'fecha_falla' || columna === 'total_costo' || columna === 'id') ? 'DESC' : 'ASC';
        }
        window.incActualizarIconosOrden();
        window.incCargarDatos(1);
    };

    // Actualizar iconos de orden en los encabezados
    window.incActualizarIconosOrden = function() {
        const iconos = document.querySelectorAll('.inc-sort-icon');
        iconos.forEach(icon => {
            icon.className = 'bi bi-arrow-down-up inc-sort-icon ms-1';
        });

        const iconoActivo = document.getElementById(`sort-icon-${window._incSortField}`);
        if (iconoActivo) {
            iconoActivo.className = window._incSortDir === 'ASC'
                ? 'bi bi-sort-down-alt inc-sort-icon active ms-1'
                : 'bi bi-sort-down inc-sort-icon active ms-1';
        }
    };

    // Configurar listeners de búsqueda y eventos
    window.incSetupEventos = function() {
        const searchInput = document.getElementById('inc-filter-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(_incSearchTimeout);
                _incSearchTimeout = setTimeout(() => {
                    window.incCargarDatos(1);
                }, 300);
            });
        }
        window.incActualizarIconosOrden();
    };

    // Cargar Catálogo de Placas y Conductores para los combos de búsqueda interactiva
    window.incCargarCatalogos = async function() {
        try {
            const res = await fetch('/api/mantenimiento/incidencias-ruta/catalogo-placas');
            const data = await res.json();
            if (data.ok) {
                window._incCatalogoPlacas = data.data || [];
                window._incCatalogoConductores = data.conductores || [];

                // Llenar selector de filtros de placa
                const selFiltro = document.getElementById('inc-filter-placa');
                if (selFiltro) {
                    selFiltro.innerHTML = '<option value="ALL">Todas las Placas</option>' +
                        (data.data || []).map(p => `<option value="${p.placa}">${p.placa}</option>`).join('');
                }

                // Inicializar combo interactivo de Placa
                if (typeof window._cbInit === 'function') {
                    const itemsPlacas = (data.data || []).map(p => ({
                        value: p.placa,
                        label: p.placa + (p.marca ? ' - ' + p.marca : '')
                    }));
                    window._cbInit('inc-form-placa', itemsPlacas, 'SELECCIONE PLACA...');

                    // Callback cuando el usuario selecciona una placa en el combo
                    window._cbOnSelect('inc-form-placa', function(val) {
                        window.incOnPlacaChange(val);
                    });

                    // Inicializar combo interactivo de Conductor
                    const itemsCond = (data.conductores || []).map(c => ({
                        value: c,
                        label: c
                    }));
                    window._cbInit('inc-form-conductor', itemsCond, 'SELECCIONE CONDUCTOR O ESCRIBA NOMBRE...');
                }
            }
        } catch (err) {
            console.error('Error cargando catálogos de incidencias:', err);
        }
    };

    // Al cambiar la placa en el combo, auto-llenar marca y tipo de unidad
    window.incOnPlacaChange = function(placaSeleccionada) {
        if (!placaSeleccionada) return;
        const encontrada = (window._incCatalogoPlacas || []).find(p => p.placa === placaSeleccionada);
        if (encontrada) {
            const elMarca = document.getElementById('inc-form-marca');
            const elTipo = document.getElementById('inc-form-tipo');

            if (elMarca) elMarca.value = encontrada.marca || '';
            if (elTipo && !elTipo.value) elTipo.value = encontrada.tipo || '';
        }
    };

    // Cargar Datos Paginados y KPIs desde el Backend
    window.incCargarDatos = async function(pagina = 1) {
        window._incPaginaActual = pagina;
        const tbody = document.getElementById('inc-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="15" class="text-center py-5 text-secondary">
                        <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                        Cargando incidencias en ruta...
                    </td>
                </tr>
            `;
        }

        const params = new URLSearchParams({
            page: window._incPaginaActual,
            limit: window._incLimitePorPagina,
            sortField: window._incSortField || 'fecha_falla',
            sortDir: window._incSortDir || 'DESC'
        });

        const search = document.getElementById('inc-filter-search')?.value;
        const mes = document.getElementById('inc-filter-mes')?.value;
        const placa = document.getElementById('inc-filter-placa')?.value;
        const area = document.getElementById('inc-filter-area')?.value;
        const solucion = document.getElementById('inc-filter-solucion')?.value;

        if (search) params.append('search', search);
        if (mes && mes !== 'ALL') params.append('mes', mes);
        if (placa && placa !== 'ALL') params.append('placa', placa);
        if (area && area !== 'ALL') params.append('area', area);
        if (solucion && solucion !== 'ALL') params.append('solucionado', solucion);

        try {
            const res = await fetch(`/api/mantenimiento/incidencias-ruta?${params.toString()}`);
            const data = await res.json();

            if (data.ok) {
                window._incData = data.data || [];
                window._incTotalPaginas = data.totalPages || 1;

                window.incRenderKPIs(data.kpis);
                window.incRenderTabla(data.data || []);
                window.incRenderPaginacion(data.total || 0);
                window.incActualizarIconosOrden();
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="15" class="text-center text-danger py-4">Error: ${data.error || 'No se pudieron cargar los datos'}</td></tr>`;
            }
        } catch (err) {
            console.error('Error al obtener incidencias:', err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="15" class="text-center text-danger py-4">Error de conexión con el servidor.</td></tr>`;
        }
    };

    // Renderizar KPIs Bento
    window.incRenderKPIs = function(kpis = {}) {
        const elTotal = document.getElementById('kpi-total-incidencias');
        const elPend = document.getElementById('kpi-pendientes');
        const elAtend = document.getElementById('kpi-atendidas');
        const elCosto = document.getElementById('kpi-costo-total');

        if (elTotal) elTotal.textContent = kpis.totalRegistros || 0;
        if (elPend) elPend.textContent = kpis.totalPendientes || 0;
        if (elAtend) elAtend.textContent = kpis.totalAtendidos || 0;
        if (elCosto) {
            const val = parseFloat(kpis.costoTotalAcumulado) || 0;
            elCosto.textContent = `S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    };

    // Renderizar Filas de la Tabla (Formato exacto al Excel con diseño visual pro)
    window.incRenderTabla = function(items = []) {
        const tbody = document.getElementById('inc-tbody');
        if (!tbody) return;

        if (!items || items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="15" class="text-center py-5 text-secondary">
                        <i class="bi bi-inbox fs-3 d-block mb-2 text-muted"></i>
                        No se encontraron incidencias registradas con los filtros actuales.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = items.map(r => {
            // Badge Solución
            const esAtendido = r.solucionado === 'Atendido';
            const badgeSolucion = esAtendido
                ? `<span class="badge-solucion-atendido" onclick="window.incToggleSolucionRapido(${r.id})" title="Clic para alternar estado"><i class="bi bi-check2"></i> Atendido</span>`
                : `<span class="badge-solucion-pendiente" onclick="window.incToggleSolucionRapido(${r.id})" title="Clic para alternar estado"><i class="bi bi-clock"></i> Pendiente</span>`;

            // Badge Transbordo
            const badgeTransbordo = r.transbordo === 'SI'
                ? `<span class="badge-transbordo-si">SI</span>`
                : `<span class="badge-transbordo-no">NO</span>`;

            // Badge Área Responsable
            let badgeArea = `<span class="badge-area badge-area-mant">${r.area_responsable || 'Mantenimiento'}</span>`;
            if (r.area_responsable === 'Flota') badgeArea = `<span class="badge-area badge-area-flota">Flota</span>`;
            if (r.area_responsable === 'Operaciones') badgeArea = `<span class="badge-area badge-area-ops">Operaciones</span>`;

            // Renderizar desglose de costos
            let desgloseHtml = '<span class="text-muted" style="font-size:0.75rem;">S/ 0.00</span>';
            if (Array.isArray(r.costos_detalle) && r.costos_detalle.length > 0) {
                desgloseHtml = r.costos_detalle.map(c => `
                    <div class="costo-item-chip">
                        <strong>- ${c.concepto || 'Item'}:</strong> S/ ${parseFloat(c.monto || 0).toFixed(2)}
                    </div>
                `).join('');
            }

            const totalFormateado = (parseFloat(r.total_costo) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            // Formatear visualmente la fecha como DD/MM/YYYY
            let fechaVisual = '—';
            if (r.fecha_falla) {
                const fParts = String(r.fecha_falla).split('T')[0].split('-');
                if (fParts.length === 3) {
                    fechaVisual = `${fParts[2]}/${fParts[1]}/${fParts[0]}`;
                } else {
                    fechaVisual = r.fecha_falla;
                }
            }

            return `
                <tr>
                    <td class="fw-bold text-dark text-nowrap" style="min-width:110px;">${fechaVisual}</td>
                    <td class="text-nowrap" style="min-width:100px;">
                        <span class="badge bg-dark text-white fw-bold px-2 py-1" style="font-size:0.75rem;">${r.placa}</span>
                    </td>
                    <td class="fw-bold text-dark text-nowrap" style="min-width:170px;">${r.conductor || '<span class="text-dark fw-bold">—</span>'}</td>
                    <td class="text-nowrap" style="min-width:100px;"><span class="badge bg-white text-dark border border-secondary fw-bold">${r.marca || '—'}</span></td>
                    <td class="fw-bold text-dark" style="min-width:200px;">${r.ubicacion || '—'}</td>
                    <td class="text-nowrap" style="min-width:120px;"><span class="badge bg-white text-dark border border-secondary fw-bold">${r.tipo_unidad || 'TRACTO'}</span></td>
                    <td class="text-center text-nowrap" style="min-width:100px;">${badgeTransbordo}</td>
                    <td class="fw-bold text-dark" style="min-width:280px;">${r.motivo || '—'}</td>
                    <td class="fw-bold text-dark" style="min-width:380px; font-size:0.83rem;">${r.falla || '—'}</td>
                    <td class="text-nowrap" style="min-width:130px;">${badgeArea}</td>
                    <td class="fw-bold text-dark text-nowrap" style="min-width:150px;">${r.responsable || '—'}</td>
                    <td style="min-width:200px;">${desgloseHtml}</td>
                    <td class="fw-bolder text-primary text-nowrap" style="min-width:120px; font-size:0.90rem;">S/ ${totalFormateado}</td>
                    <td class="text-center text-nowrap" style="min-width:130px;">${badgeSolucion}</td>
                    <td class="text-end text-nowrap" style="min-width:90px;">
                        <button class="btn btn-sm btn-light border border-secondary text-dark py-1 px-2 me-1 fw-bold" title="Editar" onclick='window.incAbrirModalEditar(${JSON.stringify(r)})'>
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-light border border-danger text-danger py-1 px-2 fw-bold" title="Eliminar" onclick="window.incEliminar(${r.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    // Renderizar Paginación
    window.incRenderPaginacion = function(totalRegistros) {
        const elInfo = document.getElementById('inc-paginacion-info');
        const elControles = document.getElementById('inc-paginacion-controles');
        if (elInfo) elInfo.textContent = `Total: ${totalRegistros} incidencias registradas (Página ${window._incPaginaActual} de ${window._incTotalPaginas})`;

        if (!elControles) return;
        if (window._incTotalPaginas <= 1) {
            elControles.innerHTML = '';
            return;
        }

        let html = `
            <button class="btn btn-sm btn-light border py-1 px-2" ${window._incPaginaActual <= 1 ? 'disabled' : ''} onclick="window.incCargarDatos(${window._incPaginaActual - 1})">
                <i class="bi bi-chevron-left"></i>
            </button>
            <span class="px-2 fw-bold text-secondary" style="font-size:0.8rem;">${window._incPaginaActual} / ${window._incTotalPaginas}</span>
            <button class="btn btn-sm btn-light border py-1 px-2" ${window._incPaginaActual >= window._incTotalPaginas ? 'disabled' : ''} onclick="window.incCargarDatos(${window._incPaginaActual + 1})">
                <i class="bi bi-chevron-right"></i>
            </button>
        `;
        elControles.innerHTML = html;
    };

    // Toggle rápido de solución (Atendido <-> Pendiente) directamente desde la tabla
    window.incToggleSolucionRapido = async function(id) {
        try {
            const res = await fetch(`/api/mantenimiento/incidencias-ruta/${id}/toggle-solucion`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.ok) {
                window.incCargarDatos(window._incPaginaActual);
            } else {
                alert('Error: ' + (data.error || 'No se pudo actualizar el estado'));
            }
        } catch (e) {
            console.error('Error toggling solucion:', e);
            alert('Error de conexión con el servidor.');
        }
    };

    // =========================================================================
    // MODAL DRAWER BOTTOM SHEET & GESTIÓN DE COSTOS
    // =========================================================================

    // Abrir Modal para Nuevo Registro
    window.incAbrirModalNuevo = function() {
        document.getElementById('inc-form').reset();
        document.getElementById('inc-form-id').value = '';
        document.getElementById('inc-modal-titulo').textContent = 'Registrar Incidencia en Ruta';

        // Resetear combos interactivos
        const txtPlaca = document.getElementById('inc-form-placa-txt');
        const valPlaca = document.getElementById('inc-form-placa');
        if (txtPlaca) txtPlaca.value = '';
        if (valPlaca) valPlaca.value = '';

        const txtCond = document.getElementById('inc-form-conductor-txt');
        const valCond = document.getElementById('inc-form-conductor');
        if (txtCond) txtCond.value = '';
        if (valCond) valCond.value = '';

        // Fecha por defecto: Hoy
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('inc-form-fecha').value = hoy;

        // Resetear toggle de solución a Pendiente por defecto
        window.incSetSolucionForm('Pendiente');

        // Limpiar tabla de costos y agregar una fila inicial
        const tbodyCostos = document.getElementById('inc-costos-tbody');
        if (tbodyCostos) tbodyCostos.innerHTML = '';
        window.incAgregarFilaCosto('', '');

        window.incMostrarDrawer();
    };

    // Abrir Modal para Editar
    window.incAbrirModalEditar = function(item) {
        document.getElementById('inc-form-id').value = item.id;
        document.getElementById('inc-modal-titulo').textContent = `Editar Incidencia (${item.codigo || item.placa})`;

        document.getElementById('inc-form-fecha').value = item.fecha_falla || '';
        
        // Sincronizar combo de Placa
        const txtPlaca = document.getElementById('inc-form-placa-txt');
        const valPlaca = document.getElementById('inc-form-placa');
        if (txtPlaca) txtPlaca.value = item.placa || '';
        if (valPlaca) valPlaca.value = item.placa || '';

        // Sincronizar combo de Conductor
        const txtCond = document.getElementById('inc-form-conductor-txt');
        const valCond = document.getElementById('inc-form-conductor');
        if (txtCond) txtCond.value = item.conductor || '';
        if (valCond) valCond.value = item.conductor || '';

        document.getElementById('inc-form-marca').value = item.marca || '';
        document.getElementById('inc-form-tipo').value = item.tipo_unidad || '';
        document.getElementById('inc-form-ubicacion').value = item.ubicacion || '';
        document.getElementById('inc-form-transbordo').value = item.transbordo || 'NO';
        document.getElementById('inc-form-area').value = item.area_responsable || 'Mantenimiento';
        document.getElementById('inc-form-responsable').value = item.responsable || '';
        document.getElementById('inc-form-motivo').value = item.motivo || '';
        document.getElementById('inc-form-falla').value = item.falla || '';

        window.incSetSolucionForm(item.solucionado || 'Pendiente');

        // Cargar costos
        const tbodyCostos = document.getElementById('inc-costos-tbody');
        if (tbodyCostos) tbodyCostos.innerHTML = '';

        if (Array.isArray(item.costos_detalle) && item.costos_detalle.length > 0) {
            item.costos_detalle.forEach(c => {
                window.incAgregarFilaCosto(c.concepto || '', c.monto || '');
            });
        } else {
            window.incAgregarFilaCosto('', '');
        }

        window.incCalcularTotalCostos();
        window.incMostrarDrawer();
    };

    window.incMostrarDrawer = function() {
        const modalEl = document.getElementById('modalIncidenciaRuta');
        if (modalEl && typeof bootstrap !== 'undefined') {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    };

    window.incCerrarModal = function() {
        const modalEl = document.getElementById('modalIncidenciaRuta');
        if (modalEl && typeof bootstrap !== 'undefined') {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
    };

    // Alternar Solución en el formulario
    window.incAlternarSolucionForm = function() {
        const actual = document.getElementById('inc-form-solucion').value;
        const nuevo = actual === 'Atendido' ? 'Pendiente' : 'Atendido';
        window.incSetSolucionForm(nuevo);
    };

    window.incSetSolucionForm = function(estado) {
        const inputHidden = document.getElementById('inc-form-solucion');
        const wrap = document.getElementById('inc-toggle-wrap');
        const btnPend = document.getElementById('btn-toggle-pend');
        const btnAtend = document.getElementById('btn-toggle-atend');

        if (inputHidden) inputHidden.value = estado;

        if (estado === 'Atendido') {
            if (wrap) wrap.classList.add('is-atendido');
            if (btnPend) btnPend.className = 'solucion-toggle-btn';
            if (btnAtend) btnAtend.className = 'solucion-toggle-btn active-atend';
        } else {
            if (wrap) wrap.classList.remove('is-atendido');
            if (btnPend) btnPend.className = 'solucion-toggle-btn active-pend';
            if (btnAtend) btnAtend.className = 'solucion-toggle-btn';
        }
    };

    // Agregar Fila de Costo a la tabla del formulario
    window.incAgregarFilaCosto = function(concepto = '', monto = '') {
        const tbody = document.getElementById('inc-costos-tbody');
        if (!tbody) return;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <input type="text" class="form-control form-control-sm inc-costo-concepto" placeholder="Ej. PIÑON, MANO DE OBRA, AUXILIO MECANICO..." value="${concepto}">
            </td>
            <td>
                <div class="input-group input-group-sm">
                    <span class="input-group-text">S/</span>
                    <input type="number" step="0.01" class="form-control inc-costo-monto" placeholder="0.00" value="${monto}" oninput="window.incCalcularTotalCostos()">
                </div>
            </td>
            <td class="text-center">
                <button type="button" class="btn btn-sm btn-link text-danger p-0" onclick="this.closest('tr').remove(); window.incCalcularTotalCostos();" title="Eliminar fila">
                    <i class="bi bi-x-circle fs-5"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
        window.incCalcularTotalCostos();
    };

    // Calcular la sumatoria de todos los costos ingresados en el formulario
    window.incCalcularTotalCostos = function() {
        const montos = document.querySelectorAll('.inc-costo-monto');
        let total = 0;
        montos.forEach(inp => {
            const val = parseFloat(inp.value);
            if (!isNaN(val)) total += val;
        });

        const totalInput = document.getElementById('inc-form-total-costo');
        if (totalInput) {
            totalInput.value = total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    };

    // Guardar (Crear o Editar)
    window.incGuardarRegistro = async function() {
        const id = document.getElementById('inc-form-id').value;
        const fecha_falla = document.getElementById('inc-form-fecha').value;
        const placa = (document.getElementById('inc-form-placa')?.value || document.getElementById('inc-form-placa-txt')?.value || '').trim();
        const conductor = (document.getElementById('inc-form-conductor')?.value || document.getElementById('inc-form-conductor-txt')?.value || '').trim();

        if (!fecha_falla || !placa) {
            alert('Por favor completa los campos requeridos: Fecha de falla y Placa.');
            return;
        }

        // Recolectar costos
        const filas = document.querySelectorAll('#inc-costos-tbody tr');
        const costos_detalle = [];
        filas.forEach(tr => {
            const c = tr.querySelector('.inc-costo-concepto')?.value?.trim();
            const m = parseFloat(tr.querySelector('.inc-costo-monto')?.value) || 0;
            if (c || m > 0) {
                costos_detalle.push({ concepto: c || 'Gasto', monto: m });
            }
        });

        const payload = {
            fecha_falla,
            placa,
            conductor,
            marca: document.getElementById('inc-form-marca').value,
            tipo_unidad: document.getElementById('inc-form-tipo').value,
            ubicacion: document.getElementById('inc-form-ubicacion').value,
            transbordo: document.getElementById('inc-form-transbordo').value,
            area_responsable: document.getElementById('inc-form-area').value,
            responsable: document.getElementById('inc-form-responsable').value,
            motivo: document.getElementById('inc-form-motivo').value,
            falla: document.getElementById('inc-form-falla').value,
            solucionado: document.getElementById('inc-form-solucion').value,
            costos_detalle
        };

        const url = id ? `/api/mantenimiento/incidencias-ruta/${id}` : '/api/mantenimiento/incidencias-ruta';
        const method = id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.ok) {
                window.incCerrarModal();
                window.incCargarDatos(window._incPaginaActual);
            } else {
                alert('Error al guardar: ' + (data.error || 'No se pudo completar el registro'));
            }
        } catch (e) {
            console.error('Error guardando incidencia:', e);
            alert('Error de conexión al intentar guardar.');
        }
    };

    // Eliminar
    window.incEliminar = async function(id) {
        if (!confirm('¿Estás seguro de eliminar este registro de incidencia en ruta?')) return;

        try {
            const res = await fetch(`/api/mantenimiento/incidencias-ruta/${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();

            if (data.ok) {
                window.incCargarDatos(window._incPaginaActual);
            } else {
                alert('Error al eliminar: ' + (data.error || 'No se pudo eliminar el registro'));
            }
        } catch (e) {
            console.error('Error eliminando:', e);
            alert('Error de conexión con el servidor.');
        }
    };

    // Descargar Plantilla Excel (Sin Marca ni Tipo, el sistema los autocompleta por Placa)
    window.incDescargarPlantilla = function() {
        const encabezados = [
            'FECHA FALLA',
            'PLACA',
            'CONDUCTOR',
            'UBICACION',
            'TRANSBORDO',
            'MOTIVO',
            'FALLA',
            'Responsabilidad de Area',
            'RESPONSABLE',
            'COSTO',
            'TOTAL COSTO',
            'Se dio solucion?'
        ];

        const ejemploFila1 = [
            '2026-08-20',
            'ADH982',
            'CARLOS MENDOZA',
            'MATUCANA',
            'NO',
            'FUGA REFRIGERANTE',
            'SE SALIO MANGUERA DEL RADIADOR',
            'Mantenimiento',
            'FALLA MECANICA',
            '- PAGO DE HORA EXTRA PERSONAL 50\n- PAGO DE PEAJE 20',
            '70',
            'Atendido'
        ];

        const ejemploFila2 = [
            '2026-08-21',
            'AZP977',
            'JORGE RAMIREZ',
            'PUCALLPA',
            'SI',
            'UNIDAD NO ARRANCA',
            'SE SALIO PIÑON DEL ARRANCADOR',
            'Mantenimiento',
            'FALLA MECANICA',
            '- PIÑON 120\n- MANO DE OBRA 120\n- OTROS GASTOS 100',
            '340',
            'Pendiente'
        ];

        if (typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.aoa_to_sheet([encabezados, ejemploFila1, ejemploFila2]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Incidencias');
            XLSX.writeFile(wb, 'Plantilla_Incidencias_Ruta.xlsx');
        } else {
            // Fallback a CSV
            let csvContent = '\uFEFF' + [encabezados, ejemploFila1, ejemploFila2].map(e => e.map(val => `"${(val+'').replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Plantilla_Incidencias_Ruta.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    // Procesar e Importar Archivo Excel
    window.incProcesarArchivoExcel = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                let jsonRows = [];

                if (typeof XLSX !== 'undefined') {
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheet = workbook.SheetNames[0];
                    jsonRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { raw: false, dateNF: 'yyyy-mm-dd' });
                } else {
                    alert('Librería XLSX no cargada. Por favor recarga la página.');
                    return;
                }

                if (!jsonRows || jsonRows.length === 0) {
                    alert('El archivo seleccionado no contiene filas de datos.');
                    return;
                }

                // Helper infalible para parsear fechas de Excel en cualquier formato
                const parsearFechaExcel = (raw) => {
                    if (!raw) return '';
                    if (raw instanceof Date && !isNaN(raw)) {
                        const y = raw.getUTCFullYear();
                        const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
                        const d = String(raw.getUTCDate()).padStart(2, '0');
                        return `${y}-${m}-${d}`;
                    }
                    let str = String(raw).trim();
                    if (!str) return '';

                    // Si es número serial de Excel (ej: 46028 -> 2026-01-08)
                    if (/^\d{5}$/.test(str)) {
                        const dateObj = new Date(Math.round((Number(str) - 25569) * 86400 * 1000));
                        if (!isNaN(dateObj)) {
                            const y = dateObj.getUTCFullYear();
                            const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
                            const d = String(dateObj.getUTCDate()).padStart(2, '0');
                            return `${y}-${m}-${d}`;
                        }
                    }

                    const meses = {
                        'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
                        'jul': '07', 'ago': '08', 'set': '09', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
                    };

                    // Formato 06-ene-26 o 06-ene-2026
                    let mTexto = str.match(/^(\d{1,2})[-\/ ]([a-zA-Z]{3,4})[-\/ ](\d{2,4})$/);
                    if (mTexto) {
                        let dia = mTexto[1].padStart(2, '0');
                        let mesStr = mTexto[2].toLowerCase().substring(0, 3);
                        let mes = meses[mesStr] || '01';
                        let anio = mTexto[3];
                        if (anio.length === 2) anio = '20' + anio;
                        return `${anio}-${mes}-${dia}`;
                    }

                    // Formato YYYY-MM-DD
                    let mIso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
                    if (mIso) {
                        return `${mIso[1]}-${mIso[2].padStart(2, '0')}-${mIso[3].padStart(2, '0')}`;
                    }

                    // Formato con barras o guiones: p1/p2/p3
                    let mNum = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
                    if (mNum) {
                        let p1 = parseInt(mNum[1], 10);
                        let p2 = parseInt(mNum[2], 10);
                        let anio = mNum[3];
                        if (anio.length === 2) anio = '20' + anio;

                        let dia, mes;
                        // Si p2 > 12, p1 es mes y p2 es dia (formato US M/D/Y)
                        if (p2 > 12) {
                            mes = String(p1).padStart(2, '0');
                            dia = String(p2).padStart(2, '0');
                        } else {
                            // Por defecto en Perú / LATAM es D/M/Y
                            dia = String(p1).padStart(2, '0');
                            mes = String(p2).padStart(2, '0');
                        }
                        return `${anio}-${mes}-${dia}`;
                    }

                    return str;
                };

                const normalizar = (str) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();

                const registrosParaSubir = jsonRows.map(row => {
                    const rowKeys = Object.keys(row);
                    const findVal = (exactKeyList) => {
                        // 1. Primero búsqueda exacta normalizada
                        for (const k of rowKeys) {
                            const normK = normalizar(k);
                            for (const target of exactKeyList) {
                                if (normK === normalizar(target)) {
                                    return row[k];
                                }
                            }
                        }
                        // 2. Si no encuentra exacta, búsqueda por inclusión pero evitando falsos positivos
                        for (const k of rowKeys) {
                            const normK = normalizar(k);
                            for (const target of exactKeyList) {
                                const normTarget = normalizar(target);
                                if (normK.includes(normTarget) && !normK.includes('fechafalla') && normTarget === 'falla') {
                                    return row[k];
                                }
                            }
                        }
                        return '';
                    };

                    const rawFecha = findVal(['fecha falla', 'fechafalla', 'fecha', 'dia']);
                    const fechaFalla = parsearFechaExcel(rawFecha);

                    const placaNormalizada = (findVal(['placa', 'vehiculo', 'unidad']) || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
                    const placaInfo = (window._incCatalogoPlacas || []).find(p => p.placa.replace(/[^A-Z0-9]/g, '') === placaNormalizada);

                    return {
                        fecha_falla: fechaFalla || new Date().toISOString().split('T')[0],
                        placa: placaNormalizada,
                        conductor: findVal(['conductor', 'chofer']),
                        marca: findVal(['marca']) || (placaInfo ? placaInfo.marca : ''),
                        ubicacion: findVal(['ubicacion', 'lugar', 'ruta']),
                        tipo_unidad: findVal(['unidad de negocio', 'unidaddenegocio', 'tipo', 'clase']) || (placaInfo ? placaInfo.tipo : ''),
                        transbordo: findVal(['transbordo']),
                        motivo: findVal(['motivo', 'problema']),
                        falla: findVal(['falla', 'diagnostico', 'falladetallada']),
                        area_responsable: findVal(['responsabilidad de area', 'responsabilidaddearea', 'area', 'responsabilidad']),
                        responsable: findVal(['responsable', 'causa']),
                        costo_individual_texto: findVal(['costo', 'desglose']),
                        total_costo: parseFloat((findVal(['total costo', 'totalcosto', 'total']) || '').toString().replace(/[^0-9.]/g, '')) || 0,
                        solucionado: findVal(['se dio solucion', 'sediosolucion', 'solucion', 'estado', 'atendido'])
                    };
                }).filter(r => r.placa);

                if (registrosParaSubir.length === 0) {
                    alert('No se encontraron registros con columna PLACA válida en el archivo.');
                    return;
                }

                if (!confirm(`Se detectaron ${registrosParaSubir.length} registros listos para importar. ¿Deseas proceder?`)) {
                    event.target.value = '';
                    return;
                }

                const res = await fetch('/api/mantenimiento/incidencias-ruta/importar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ registros: registrosParaSubir })
                });

                const respData = await res.json();
                if (respData.ok) {
                    alert(`✅ Importación completada con éxito:\n• Insertados: ${respData.insertados}\n• Errores/Omitidos: ${respData.errores}`);
                    window.incCargarDatos(1);
                } else {
                    alert('Error en importación: ' + (respData.error || 'No se pudo procesar el archivo'));
                }
            } catch (err) {
                console.error('Error importando Excel:', err);
                alert('Error al leer el archivo Excel.');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // Auto-inicialización si el DOM ya está listo
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        window.init_mantenimiento_incidencias_ruta();
    } else {
        document.addEventListener('DOMContentLoaded', window.init_mantenimiento_incidencias_ruta);
    }
})();

