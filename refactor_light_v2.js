const fs = require('fs');
const path = require('path');

const vistaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/vista.html');
const logicaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/logica.js');

let vistaContent = fs.readFileSync(vistaPath, 'utf8');
let logicaContent = fs.readFileSync(logicaPath, 'utf8');

// 1. Remove old mobile view
const startIdx = vistaContent.indexOf('<div id="rot-mobile-view"');
if(startIdx > -1) {
    vistaContent = vistaContent.substring(0, startIdx);
}

const newMobileHTML = `
<!-- Contenedor principal de la Vista Móvil -->
<style>
/* Reset and base */
#rot-mobile-view {
    margin: -15px -25px; /* Cover padding of root-dinamico */
    height: calc(100% + 30px);
    width: calc(100% + 50px);
    background: #f8fafc;
    color: #0f172a;
    font-family: 'Inter', system-ui, sans-serif;
    display: none;
    flex-direction: column;
    position: relative;
    z-index: 10;
}
@media (max-width: 991.98px) {
    #rot-mobile-view { display: flex !important; }
}

/* Base Classes */
.rot2-flex-c { display: flex; align-items: center; }
.rot2-flex-b { display: flex; align-items: center; justify-content: space-between; }
.rot2-no-scroll::-webkit-scrollbar { display: none; }
.rot2-btn-clear { background: none; border: none; padding: 0; outline: none; cursor: pointer; }

/* Header */
.rot2-header { background: #ffffff; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; flex-shrink: 0; }
.rot2-header-top { margin-bottom: 16px; }
.rot2-logo-af { width: 36px; height: 36px; background: #2563eb; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 800; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.2); }
.rot2-title-box { margin-left: 10px; }
.rot2-title { font-size: 15px; font-weight: 800; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 6px; }
.rot2-dot-green { width: 6px; height: 6px; border-radius: 50%; background: #10b981; }
.rot2-subtitle { font-size: 11px; color: #64748b; font-weight: 500; }
.rot2-header-actions { display: flex; gap: 8px; }
.rot2-btn-icon-top { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #475569; display: flex; align-items: center; justify-content: center; position: relative; }
.rot2-bell-dot { position: absolute; top: 6px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; border: 1px solid #ffffff; }

/* Tabs Header */
.rot2-tabs-header { display: flex; background: #f1f5f9; border-radius: 12px; padding: 4px; margin-bottom: 16px; }
.rot2-tab-btn { flex: 1; padding: 8px 0; border-radius: 8px; font-size: 12px; font-weight: 700; color: #64748b; text-align: center; border: none; background: transparent; display: flex; justify-content: center; align-items: center; gap: 6px; }
.rot2-tab-btn.active { background: #ffffff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }

/* Search Row */
.rot2-search-row { display: flex; gap: 8px; }
.rot2-search-box { flex: 1; position: relative; }
.rot2-search-box i { position: absolute; left: 12px; top: 10px; color: #94a3b8; font-size: 14px; }
.rot2-search-box input { width: 100%; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 10px; padding: 8px 12px 8px 34px; font-size: 12px; color: #0f172a; outline: none; }
.rot2-search-box input:focus { border-color: #2563eb; background: #ffffff; }
.rot2-btn-filter { background: #f1f5f9; color: #475569; font-weight: 700; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0 14px; display: flex; align-items: center; gap: 6px; }

/* Main Scroll */
.rot2-main { flex: 1; overflow-y: auto; padding: 16px; padding-bottom: 40px; }

/* KPI Grid */
.rot2-kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.rot2-kpi { background: #ffffff; border-radius: 16px; padding: 14px; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.02); border: 1px solid #f1f5f9; }
.rot2-kpi-icon { width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
.rot2-kpi-blue .rot2-kpi-icon { background: #eff6ff; color: #2563eb; }
.rot2-kpi-red .rot2-kpi-icon { background: #fef2f2; color: #ef4444; }
.rot2-kpi-green .rot2-kpi-icon { background: #f0fdf4; color: #10b981; }
.rot2-kpi-yellow .rot2-kpi-icon { background: #fffbeb; color: #d97706; }
.rot2-kpi-info { display: flex; flex-direction: column; }
.rot2-kpi-lbl { font-size: 9px; font-weight: 800; color: #94a3b8; margin-bottom: 2px; }
.rot2-kpi-val { font-size: 16px; font-weight: 800; color: #0f172a; line-height: 1; }

/* Exports */
.rot2-exports { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.rot2-btn-export { border-radius: 12px; padding: 10px; font-size: 12px; font-weight: 700; display: flex; justify-content: center; align-items: center; gap: 8px; border: 1px solid; }
.rot2-btn-excel { background: #f0fdf4; border-color: #bbf7d0; color: #16a34a; }
.rot2-btn-pdf { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

/* Pills */
.rot2-pills { display: flex; gap: 8px; overflow-x: auto; margin-bottom: 16px; padding-bottom: 4px; }
.rot2-pill { padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; background: #ffffff; color: #475569; white-space: nowrap; }
.rot2-pill.active { background: #2563eb; border-color: #2563eb; color: #ffffff; }

/* Cards */
.rot2-list { display: flex; flex-direction: column; gap: 16px; }
.rot2-card { background: #ffffff; border-radius: 16px; border: 1px solid #f1f5f9; box-shadow: 0 4px 12px rgba(0,0,0,0.03); position: relative; overflow: hidden; padding: 16px; }
.rot2-card-stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: #2563eb; }
.rot2-card-stripe.c-red { background: #ef4444; }
.rot2-card-stripe.c-orange { background: #f59e0b; }
.rot2-card-stripe.c-green { background: #10b981; }

.rot2-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; margin-left: 6px; }
.rot2-badge-box { display: flex; gap: 6px; }
.rot2-badge { background: #eff6ff; color: #2563eb; font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 6px; letter-spacing: 0.5px; }
.rot2-badge.red { background: #fef2f2; color: #ef4444; }
.rot2-badge-outline { background: #ffffff; border: 1px solid #bfdbfe; color: #2563eb; font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 99px; display: flex; align-items: center; gap: 4px; }
.rot2-badge-outline .dot { width: 5px; height: 5px; border-radius: 50%; background: #2563eb; }

.rot2-card-title { font-size: 16px; font-weight: 800; color: #0f172a; margin: 0 0 12px 6px; }

.rot2-card-grid { background: #f8fafc; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; margin-left: 6px; }
.rot2-c-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px; }
.rot2-c-row:last-child { border-bottom: none; padding-bottom: 0; }
.rot2-c-lbl { font-size: 10px; font-weight: 700; color: #94a3b8; }
.rot2-c-val { font-size: 11px; font-weight: 700; color: #0f172a; }

.rot2-card-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-left: 6px; }
.rot2-c-cost { display: flex; flex-direction: column; gap: 2px; }
.rot2-c-val-lrg { font-size: 16px; font-weight: 800; color: #0f172a; }

.rot2-c-actions { display: flex; gap: 8px; align-items: center; }
.rot2-btn-dots { width: 32px; height: 32px; background: #f1f5f9; border-radius: 16px; display: flex; justify-content: center; align-items: center; color: #475569; font-size: 16px; font-weight: bold; cursor: pointer; border: none; }
.rot2-btn-action { background: #f59e0b; color: #ffffff; font-size: 12px; font-weight: 700; border-radius: 16px; padding: 0 16px; height: 32px; border: none; cursor: pointer; }
.rot2-btn-action.blue { background: #2563eb; }
.rot2-btn-action.green { background: #10b981; }

/* Filter Sheet */
.rot2-overlay { position: absolute; inset: 0; background: rgba(15,23,42,0.6); z-index: 40; display: none; backdrop-filter: blur(2px); }
.rot2-overlay.open { display: block; }
.rot2-sheet { position: absolute; bottom: 0; left: 0; right: 0; background: #ffffff; border-top-left-radius: 32px; border-top-right-radius: 32px; transform: translateY(100%); transition: transform 0.3s ease-out; z-index: 50; display: flex; flex-direction: column; max-height: 90vh; }
.rot2-sheet.open { transform: translateY(0); }
.rot2-sheet-handle { width: 40px; height: 4px; background: #cbd5e1; border-radius: 4px; margin: 12px auto; }
.rot2-sheet-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px 20px; }
.rot2-sheet-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 8px; }
.rot2-sheet-clear { background: #fef2f2; color: #ef4444; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 8px; display: flex; align-items: center; gap: 6px; }

.rot2-sheet-body { flex: 1; overflow-y: auto; padding: 0 24px 24px; display: flex; flex-direction: column; gap: 16px; }
.rot2-s-lbl { font-size: 10px; font-weight: 800; color: #64748b; margin-bottom: 8px; display: block; }
.rot2-s-box { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px; }
.rot2-input { width: 100%; border: none; outline: none; font-size: 13px; color: #0f172a; font-weight: 500; background: transparent; }
.rot2-input::placeholder { color: #94a3b8; }
.rot2-s-date-row { display: flex; gap: 12px; }
.rot2-s-date-row input { flex: 1; }

.rot2-sheet-footer { display: flex; gap: 12px; padding: 16px 24px 24px; border-top: 1px solid #f1f5f9; background: #ffffff; }
.rot2-btn-outline { flex: 1; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; background: #ffffff; color: #475569; font-size: 14px; font-weight: 700; text-align: center; }
.rot2-btn-solid { flex: 1; padding: 12px; border-radius: 12px; border: none; background: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; text-align: center; }

</style>

<div id="rot-mobile-view">
    <!-- Header -->
    <header class="rot2-header">
        <div class="rot2-header-top rot2-flex-b">
            <div class="rot2-flex-c">
                <div class="rot2-logo-af">AF</div>
                <div class="rot2-title-box">
                    <h1 class="rot2-title">Azkell Fleet <span class="rot2-dot-green"></span></h1>
                    <span class="rot2-subtitle">Logística & Mantenimiento</span>
                </div>
            </div>
            <div class="rot2-header-actions">
                <button class="rot2-btn-clear rot2-btn-icon-top" onclick="window.rotCargar()"><i class="bi bi-arrow-clockwise"></i></button>
                <button class="rot2-btn-clear rot2-btn-icon-top" onclick="showToast('Notificaciones')"><i class="bi bi-bell"></i><span class="rot2-bell-dot"></span></button>
            </div>
        </div>
        
        <div class="rot2-tabs-header">
            <button class="rot2-btn-clear rot2-tab-btn active"><i class="bi bi-file-text"></i> Reportes OT</button>
            <button class="rot2-btn-clear rot2-tab-btn" onclick="if(typeof window.cargarModuloAislado === 'function') window.cargarModuloAislado('mantenimiento/inspecciones');"><i class="bi bi-ui-checks"></i> Inspecciones</button>
        </div>

        <div class="rot2-search-row">
            <div class="rot2-search-box">
                <i class="bi bi-search"></i>
                <input type="text" id="rotMobileSearch" placeholder="Buscar placa, técnico, cliente..." oninput="window.rotFiltrar()">
            </div>
            <button class="rot2-btn-clear rot2-btn-filter" onclick="toggleFilterDrawer()"><i class="bi bi-sliders"></i> Filtros</button>
        </div>
    </header>

    <!-- Main Content -->
    <main class="rot2-main rot2-no-scroll">
        <!-- KPIs -->
        <div class="rot2-kpi-grid">
            <div class="rot2-kpi rot2-kpi-blue">
                <div class="rot2-kpi-icon"><i class="bi bi-folder-fill"></i></div>
                <div class="rot2-kpi-info">
                    <span class="rot2-kpi-lbl">TOTAL OTS</span>
                    <span class="rot2-kpi-val" id="rotMobileKpiTotal">0</span>
                </div>
            </div>
            <div class="rot2-kpi rot2-kpi-red">
                <div class="rot2-kpi-icon"><i class="bi bi-tools"></i></div>
                <div class="rot2-kpi-info">
                    <span class="rot2-kpi-lbl">CORRECTIVOS</span>
                    <span class="rot2-kpi-val" id="rotMobileKpiCorrectivos">0</span>
                </div>
            </div>
            <div class="rot2-kpi rot2-kpi-green">
                <div class="rot2-kpi-icon"><i class="bi bi-shield-fill-check"></i></div>
                <div class="rot2-kpi-info">
                    <span class="rot2-kpi-lbl">PREVENTIVOS</span>
                    <span class="rot2-kpi-val" id="rotMobileKpiPreventivos">0</span>
                </div>
            </div>
            <div class="rot2-kpi rot2-kpi-yellow">
                <div class="rot2-kpi-icon"><i class="bi bi-coin"></i></div>
                <div class="rot2-kpi-info">
                    <span class="rot2-kpi-lbl">COSTO ACUM.</span>
                    <span class="rot2-kpi-val" id="rotMobileKpiCosto">S/ 0.00</span>
                </div>
            </div>
        </div>

        <!-- Exports -->
        <div class="rot2-exports">
            <button class="rot2-btn-clear rot2-btn-export rot2-btn-excel" onclick="window.rotExportar()"><i class="bi bi-file-earmark-excel"></i> Excel</button>
            <button class="rot2-btn-clear rot2-btn-export rot2-btn-pdf" onclick="window.rotExportarPDF()"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
        </div>

        <!-- Filter Pills -->
        <div class="rot2-pills rot2-no-scroll" id="rotMobileStatusTabs">
            <button class="rot2-btn-clear rot2-pill active" data-estado="" onclick="window.rotChipEstado(this,'')">Todos</button>
            <button class="rot2-btn-clear rot2-pill" data-estado="Pendiente" onclick="window.rotChipEstado(this,'Pendiente')">Pendientes</button>
            <button class="rot2-btn-clear rot2-pill" data-estado="En Proceso" onclick="window.rotChipEstado(this,'En Proceso')">En Proceso</button>
            <button class="rot2-btn-clear rot2-pill" data-estado="Pausada" onclick="window.rotChipEstado(this,'Pausada')">Pausadas</button>
            <button class="rot2-btn-clear rot2-pill" data-estado="Finalizado" onclick="window.rotChipEstado(this,'Finalizado')">Finalizados</button>
        </div>

        <!-- Cards List -->
        <div class="rot2-list" id="otListMobile">
            <!-- Renderizado desde JS -->
        </div>
    </main>
</div>

<!-- Overlay -->
<div id="rotMobileOverlay" class="rot2-overlay" onclick="closeAllDrawers()"></div>

<!-- Filter Sheet -->
<div id="rotMobileFilterDrawer" class="rot2-sheet">
    <div class="rot2-sheet-handle"></div>
    <div class="rot2-sheet-header">
        <h3 class="rot2-sheet-title"><i class="bi bi-funnel-fill text-primary"></i> Filtros Avanzados</h3>
        <button class="rot2-btn-clear rot2-sheet-clear" onclick="resetFilters()"><i class="bi bi-trash"></i> Limpiar Filtros</button>
    </div>
    
    <div class="rot2-sheet-body rot2-no-scroll">
        <div>
            <span class="rot2-s-lbl">NÚMERO DE OT</span>
            <div class="rot2-s-box">
                <input type="text" id="rotMobileFilOt" class="rot2-input" placeholder="Ej. OT-2026-0001" oninput="document.getElementById('rot-fil-ot').value=this.value;">
            </div>
        </div>

        <div>
            <span class="rot2-s-lbl">PLACA DE VEHÍCULO</span>
            <div class="rot2-s-box">
                <input type="text" id="rotMobileFilPlaca" class="rot2-input" placeholder="Ej. A5B891" oninput="this.value=this.value.toUpperCase(); document.getElementById('rot-fil-placa').value=this.value;">
            </div>
        </div>

        <div>
            <span class="rot2-s-lbl">RANGO DE FECHAS</span>
            <div class="rot2-s-box rot2-s-date-row">
                <input type="date" id="rotMobileFilDesde" class="rot2-input" onchange="document.getElementById('rot-fil-desde').value=this.value;">
                <input type="date" id="rotMobileFilHasta" class="rot2-input" onchange="document.getElementById('rot-fil-hasta').value=this.value;">
            </div>
        </div>
    </div>

    <div class="rot2-sheet-footer">
        <button class="rot2-btn-clear rot2-btn-outline" onclick="closeAllDrawers()">Cancelar</button>
        <button class="rot2-btn-clear rot2-btn-solid" onclick="window.rotFiltrar(); closeAllDrawers()">Aplicar Filtros</button>
    </div>
</div>

<!-- Contextual Actions Sheet -->
<div id="rotMobileActionDrawer" class="rot2-sheet" style="max-height: 50vh;">
    <div class="rot2-sheet-handle"></div>
    <div class="rot2-sheet-header">
        <h3 class="rot2-sheet-title"><i class="bi bi-lightning-charge-fill text-warning"></i> Acciones Rápidas</h3>
    </div>
    <div class="rot2-sheet-body rot2-no-scroll" style="padding-bottom: 0;" id="rotMobileActionContent">
        <!-- Rendered from JS -->
    </div>
    <div class="rot2-sheet-footer">
        <button class="rot2-btn-clear rot2-btn-outline" onclick="closeAllDrawers()">Cancelar</button>
    </div>
</div>

<script>
    function toggleFilterDrawer() {
        document.getElementById('rotMobileOverlay').classList.add('open');
        document.getElementById('rotMobileFilterDrawer').classList.add('open');
    }
    function openActionDrawer() {
        document.getElementById('rotMobileOverlay').classList.add('open');
        document.getElementById('rotMobileActionDrawer').classList.add('open');
    }
    function closeAllDrawers() {
        document.getElementById('rotMobileOverlay').classList.remove('open');
        document.getElementById('rotMobileFilterDrawer').classList.remove('open');
        document.getElementById('rotMobileActionDrawer').classList.remove('open');
    }
    function resetFilters() {
        document.getElementById('rotMobileFilOt').value = '';
        document.getElementById('rotMobileFilPlaca').value = '';
        document.getElementById('rotMobileFilDesde').value = '';
        document.getElementById('rotMobileFilHasta').value = '';
        document.getElementById('rotMobileSearch').value = '';
        
        document.getElementById('rot-fil-ot').value = '';
        document.getElementById('rot-fil-placa').value = '';
        document.getElementById('rot-fil-desde').value = '';
        document.getElementById('rot-fil-hasta').value = '';
        
        window.rotChipEstado(document.querySelector('#rotMobileStatusTabs button[data-estado=""]'), '');
        window.rotFiltrar();
        closeAllDrawers();
    }
</script>
`;

vistaContent += newMobileHTML;
fs.writeFileSync(vistaPath, vistaContent, 'utf8');

// 2. Logica.js -> rotRenderTablaMobile Rewrite
const newRenderHTML = `
function rotRenderTablaMobile(datos) {
    var container = document.getElementById('otListMobile');
    if (!container) return;
    
    if (datos.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 40px 20px; color: #94a3b8; font-size: 13px;"><i class="bi bi-inbox" style="font-size: 32px; display: block; margin-bottom: 12px; color: #cbd5e1;"></i> No se encontraron OTs</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < datos.length; i++) {
        var ot = datos[i];
        
        var stripeClass = '';
        var pillLabel = ot.estado;
        if (ot.estado === 'Pendiente') stripeClass = 'c-orange';
        else if (ot.estado === 'En Proceso') stripeClass = 'c-blue';
        else if (ot.estado === 'Pausada') stripeClass = 'c-orange';
        else if (ot.estado === 'Finalizado') stripeClass = 'c-green';
        else if (ot.estado === 'Anulado') stripeClass = 'c-red';

        var isPrev = ot.tipo_ot === 'Preventivo';
        var badgeType = isPrev ? '<span class="rot2-badge">PREVENTIVO</span>' : '<span class="rot2-badge red">CORRECTIVO</span>';
        
        var btnAcciones = '';
        if (ot.estado === 'Pendiente') btnAcciones += '<button class="rot2-btn-clear rot2-btn-solid" style="width:100%; margin-bottom:12px;" onclick="closeAllDrawers();"><i class="bi bi-play-fill"></i> Iniciar OT</button>';
        if (ot.estado === 'En Proceso') {
            btnAcciones += '<button class="rot2-btn-clear rot2-btn-solid" style="width:100%; margin-bottom:12px; background:#f59e0b;" onclick="closeAllDrawers();"><i class="bi bi-pause-fill"></i> Pausar OT</button>';
            btnAcciones += '<button class="rot2-btn-clear rot2-btn-solid" style="width:100%; margin-bottom:12px; background:#10b981;" onclick="closeAllDrawers();"><i class="bi bi-check-lg"></i> Cerrar OT</button>';
        }
        btnAcciones += '<button class="rot2-btn-clear rot2-btn-outline" style="width:100%;" onclick="closeAllDrawers(); if(typeof window.rotAbrirDetalle === \\'function\\') window.rotAbrirDetalle(\\'' + ot.id_ot + '\\');"><i class="bi bi-list-ul"></i> Ver Detalles Completos</button>';
        var encodedActions = encodeURIComponent(btnAcciones);

        var primaryAction = '';
        if (ot.estado === 'Pendiente') primaryAction = '<button class="rot2-btn-clear rot2-btn-action blue" onclick="event.stopPropagation();">Iniciar</button>';
        else if (ot.estado === 'En Proceso') primaryAction = '<button class="rot2-btn-clear rot2-btn-action" onclick="event.stopPropagation();">Pausar</button>';

        html += '<div class="rot2-card" onclick="if(typeof window.rotAbrirDetalle === \\'function\\') window.rotAbrirDetalle(\\'' + ot.id_ot + '\\');">';
        html += '<div class="rot2-card-stripe ' + stripeClass + '"></div>';
        
        html += '<div class="rot2-card-header">';
        html += '<div class="rot2-badge-box">' + badgeType + '</div>';
        html += '<span class="rot2-badge-outline"><span class="dot"></span> ' + pillLabel + '</span>';
        html += '</div>';

        html += '<h3 class="rot2-card-title">' + ot.id_ot + '</h3>';

        html += '<div class="rot2-card-grid">';
        html += '<div class="rot2-c-row"><span class="rot2-c-lbl">PLACA / UNIDAD</span><span class="rot2-c-val">' + ot.placa + '</span></div>';
        html += '<div class="rot2-c-row"><span class="rot2-c-lbl">KILOMETRAJE</span><span class="rot2-c-val">' + ot.kilometraje + ' km</span></div>';
        html += '<div class="rot2-c-row"><span class="rot2-c-lbl">TIPO DE TRABAJO</span><span class="rot2-c-val">' + ot.tipo_servicio + '</span></div>';
        html += '</div>';

        html += '<div class="rot2-card-footer">';
        html += '<div class="rot2-c-cost"><span class="rot2-c-lbl">COSTO</span><span class="rot2-c-val-lrg">S/ 0.00</span></div>';
        html += '<div class="rot2-c-actions">';
        html += '<button class="rot2-btn-clear rot2-btn-dots" onclick="event.stopPropagation(); document.getElementById(\\'rotMobileActionContent\\').innerHTML=decodeURIComponent(\\'' + encodedActions + '\\'); openActionDrawer();"><i class="bi bi-three-dots"></i></button>';
        html += primaryAction;
        html += '</div>';
        html += '</div>';

        html += '</div>';
    }
    container.innerHTML = html;
}
`;

const regex = /function rotRenderTablaMobile\(datos\) \{[\s\S]*?\}\s*(?=\n\/\/ \-\-\-|\nfunction|\nwindow)/;
logicaContent = logicaContent.replace(regex, newRenderHTML);

fs.writeFileSync(logicaPath, logicaContent, 'utf8');

console.log("Applied complete new light UI design successfully.");
