const fs = require('fs');
const path = require('path');

const vistaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/vista.html');
const logicaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/logica.js');

let vistaContent = fs.readFileSync(vistaPath, 'utf8');
let logicaContent = fs.readFileSync(logicaPath, 'utf8');

// 1. Remove the old rot-mobile-view block and the custom bottom bar/FAB
vistaContent = vistaContent.replace(/<div id="rot-mobile-view"[\s\S]*?<\/div>\s*<!-- Cajón Inferior/g, '<!-- Cajón Inferior');

// We also need to strip out the old Drawers and Overlays since we will replace them cleanly.
// Let's just find where rot-mobile-view starts, and where the end of the file is, and replace that whole chunk.
const startIdx = vistaContent.indexOf('<!-- Contenedor principal de la Vista Móvil -->');
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
    background: #020617;
    color: #f1f5f9;
    font-family: 'Inter', sans-serif;
    display: none;
    flex-direction: column;
    position: relative;
    z-index: 10;
}
@media (max-width: 991.98px) {
    #rot-mobile-view { display: flex !important; }
}

/* Header */
.rot-m-header { background: #0f172a; padding: 12px 16px; border-bottom: 1px solid #1e293b; flex-shrink: 0; }
.rot-m-header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.rot-m-header-left { display: flex; align-items: center; gap: 8px; }
.rot-m-header-icon { width: 32px; height: 32px; background: #1d4ed8; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(29,78,216,0.3); }
.rot-m-header-title { font-size: 14px; font-weight: 700; color: #fff; margin: 0; line-height: 1.2; }
.rot-m-header-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; background: rgba(16,185,129,0.1); color: #34d399; padding: 2px 6px; border-radius: 99px; font-weight: 500; }
.rot-m-header-dot { width: 4px; height: 4px; border-radius: 50%; background: #34d399; animation: pulse 2s infinite; }
.rot-m-header-right { display: flex; align-items: center; gap: 6px; }
.rot-m-header-btn { width: 32px; height: 32px; border-radius: 50%; background: #1e293b; display: flex; align-items: center; justify-content: center; color: #cbd5e1; border: none; cursor: pointer; }

.rot-m-search-row { display: flex; gap: 8px; }
.rot-m-search-wrap { position: relative; flex: 1; }
.rot-m-search-wrap i { position: absolute; left: 12px; top: 10px; color: #94a3b8; font-size: 12px; }
.rot-m-search { width: 100%; background: #1e293b; color: #e2e8f0; border: 1px solid #334155; border-radius: 12px; padding: 6px 12px 6px 32px; font-size: 12px; outline: none; }
.rot-m-search:focus { border-color: #1d4ed8; }
.rot-m-btn-filter { background: #1d4ed8; color: #fff; border: none; border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; }

/* Main Scroll */
.rot-m-main { flex: 1; overflow-y: auto; background: #020617; padding-bottom: 80px; }
.rot-m-no-scrollbar::-webkit-scrollbar { display: none; }

/* KPIs */
.rot-m-kpi-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 16px 8px; }
.rot-m-kpi-title-main { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin: 0; }
.rot-m-kpi-swipe { font-size: 10px; color: #60a5fa; font-weight: 500; display: flex; align-items: center; gap: 4px; }
.rot-m-kpi-scroll { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 0 16px 8px; }
.rot-m-kpi { background: #0f172a; border-radius: 12px; padding: 12px; min-width: 128px; flex-shrink: 0; scroll-snap-align: start; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-left: 4px solid #1d4ed8; display: flex; flex-direction: column; justify-content: space-between; }
.rot-m-kpi.red { border-left-color: #ef4444; }
.rot-m-kpi.blue { border-left-color: #3b82f6; }
.rot-m-kpi.green { border-left-color: #10b981; }
.rot-m-kpi.orange { border-left-color: #f97316; }
.rot-m-kpi-title { font-size: 10px; font-weight: 500; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
.rot-m-kpi-val { font-size: 24px; font-weight: 700; color: #fff; line-height: 1; margin-bottom: 4px; }
.rot-m-kpi-sub { font-size: 9px; color: #64748b; font-weight: 400; }

/* Quick actions */
.rot-m-quick-scroll { padding: 8px 16px; display: flex; gap: 8px; overflow-x: auto; }
.rot-m-quick-btn { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); color: #34d399; border-radius: 8px; padding: 6px 12px; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; cursor: pointer; }
.rot-m-quick-btn.red { background: rgba(244,63,94,0.1); border-color: rgba(244,63,94,0.2); color: #fb7185; }

/* Tabs */
.rot-m-tabs-wrap { padding: 8px 16px; }
.rot-m-tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.rot-m-tab { background: #1e293b; color: #cbd5e1; border: none; border-radius: 99px; padding: 6px 12px; font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: 0.2s; }
.rot-m-tab.active { background: #1d4ed8; color: #fff; }

/* Cards List */
.rot-m-list { padding: 8px 16px 24px; display: flex; flex-direction: column; gap: 12px; }
.rot-m-card { background: #0f172a; border-radius: 16px; padding: 16px; border: 1px solid #1e293b; position: relative; overflow: hidden; }
.rot-m-card-stripe { position: absolute; top: 0; left: 0; bottom: 0; width: 6px; background: #1d4ed8; }
.rot-m-card-stripe.bg-yellow { background: #f59e0b; }
.rot-m-card-stripe.bg-blue { background: #3b82f6; }
.rot-m-card-stripe.bg-orange { background: #ea580c; }
.rot-m-card-stripe.bg-green { background: #10b981; }
.rot-m-card-stripe.bg-red { background: #ef4444; }

.rot-m-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; padding-left: 8px; }
.rot-m-ot-title { font-size: 16px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 6px; margin: 0; }
.rot-m-badge { padding: 4px 10px; border-radius: 99px; font-size: 10px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
.rot-m-badge.bg-yellow { background: rgba(245,158,11,0.1); color: #f59e0b; }
.rot-m-badge.bg-blue { background: rgba(59,130,246,0.1); color: #3b82f6; }
.rot-m-badge.bg-orange { background: rgba(234,88,12,0.1); color: #ea580c; }
.rot-m-badge.bg-green { background: rgba(16,185,129,0.1); color: #10b981; }
.rot-m-badge.bg-red { background: rgba(239,68,68,0.1); color: #ef4444; }

.rot-m-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 8px; border-top: 1px solid #1e293b; border-bottom: 1px solid #1e293b; margin-bottom: 12px; }
.rot-m-info-item { display: flex; gap: 8px; align-items: flex-start; }
.rot-m-icon-box { width: 24px; height: 24px; border-radius: 6px; background: rgba(51,65,85,0.5); display: flex; justify-content: center; align-items: center; color: #94a3b8; font-size: 10px; flex-shrink: 0; }
.rot-m-info-content { display: flex; flex-direction: column; }
.rot-m-info-label { font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 2px; }
.rot-m-info-val { font-size: 11px; color: #e2e8f0; font-weight: 500; }
.rot-m-info-pill { background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; display: inline-block; margin-right: 4px; margin-top: 2px; }
.rot-m-info-pill.red { background: rgba(239,68,68,0.15); color: #ef4444; border-color: rgba(239,68,68,0.3); }

.rot-m-obs { background: rgba(2,6,23,0.6); padding: 10px; border-radius: 12px; font-size: 11px; color: #cbd5e1; border-left: 2px solid #334155; margin: 0 8px 16px; font-style: italic; }
.rot-m-card-footer { display: flex; justify-content: space-between; align-items: center; padding-left: 8px; }
.rot-m-date { font-size: 10px; color: #64748b; font-weight: 500; }
.rot-m-btn-icon { width: 32px; height: 32px; background: #1e293b; color: #cbd5e1; border: none; border-radius: 8px; display: flex; justify-content: center; align-items: center; cursor: pointer; }

/* Drawers & Overlays */
.rot-m-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.6); z-index: 40; display: none; }
.rot-m-overlay.open { display: block; }
.rot-m-drawer { position: absolute; bottom: 0; left: 0; right: 0; background: #0f172a; border-top-left-radius: 24px; border-top-right-radius: 24px; transform: translateY(100%); transition: transform 0.3s ease-out; z-index: 50; padding: 24px; border-top: 1px solid #1e293b; max-height: 85vh; display: flex; flex-direction: column; }
.rot-m-drawer.open { transform: translateY(0); }
.rot-m-drawer-handle { width: 48px; height: 4px; background: #334155; border-radius: 99px; margin: 0 auto 20px; }
.rot-m-drawer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.rot-m-drawer-title { font-size: 16px; font-weight: 700; color: #fff; margin: 0; display: flex; align-items: center; gap: 8px; }
.rot-m-drawer-clear { background: none; border: none; color: #60a5fa; font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; }
.rot-m-drawer-content { overflow-y: auto; flex: 1; padding-bottom: 24px; }

/* Form inputs */
.rot-m-form-group { margin-bottom: 16px; }
.rot-m-label { display: block; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; }
.rot-m-input { width: 100%; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 8px 12px; color: #fff; font-size: 12px; outline: none; }
.rot-m-input:focus { border-color: #1d4ed8; }

.rot-m-btn-block { width: 100%; display: flex; justify-content: center; align-items: center; gap: 8px; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; margin-bottom: 12px; }
.rot-m-btn-primary { background: #1d4ed8; color: #fff; }
.rot-m-btn-secondary { background: #1e293b; color: #e2e8f0; }
.rot-m-btn-actions { background: #f59e0b; color: #fff; }

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: .5; }
}
</style>

<div id="rot-mobile-view">
    <!-- Header -->
    <header class="rot-m-header">
        <div class="rot-m-header-top">
            <div class="rot-m-header-left">
                <div class="rot-m-header-icon">AF</div>
                <div>
                    <h1 class="rot-m-header-title">Azkell Fleet</h1>
                    <span class="rot-m-header-badge">
                        <span class="rot-m-header-dot"></span> GPS Activo
                    </span>
                </div>
            </div>
            <div class="rot-m-header-right">
                <button class="rot-m-header-btn" onclick="window.rotCargar()"><i class="bi bi-arrow-clockwise"></i></button>
                <button class="rot-m-header-btn" onclick="showToast('Notificaciones')"><i class="bi bi-bell"></i></button>
            </div>
        </div>
        <div class="rot-m-search-row">
            <div class="rot-m-search-wrap">
                <i class="bi bi-search"></i>
                <input type="text" id="rotMobileSearch" class="rot-m-search" placeholder="N° OT, Placa, Supervisor..." oninput="window.rotFiltrar()">
            </div>
            <button class="rot-m-btn-filter" onclick="toggleFilterDrawer()"><i class="bi bi-sliders"></i> Filtros</button>
        </div>
    </header>

    <!-- Main Scroll -->
    <main class="rot-m-main rot-m-no-scrollbar">
        <!-- KPIs -->
        <div class="rot-m-kpi-header">
            <h2 class="rot-m-kpi-title-main">Resumen Operativo</h2>
            <span class="rot-m-kpi-swipe">Desliza <i class="bi bi-chevron-right"></i></span>
        </div>
        <div class="rot-m-kpi-scroll rot-m-no-scrollbar">
            <div class="rot-m-kpi">
                <span class="rot-m-kpi-title">TOTAL OTS</span>
                <div>
                    <div class="rot-m-kpi-val" id="rotMobileKpiTotal">0</div>
                    <div class="rot-m-kpi-sub">Mostrando</div>
                </div>
            </div>
            <div class="rot-m-kpi red">
                <span class="rot-m-kpi-title">CORRECTIVOS</span>
                <div>
                    <div class="rot-m-kpi-val" id="rotMobileKpiCorrectivos">0</div>
                    <div class="rot-m-kpi-sub" style="color:#f87171">Urgencias</div>
                </div>
            </div>
            <div class="rot-m-kpi blue">
                <span class="rot-m-kpi-title">PREVENTIVOS</span>
                <div>
                    <div class="rot-m-kpi-val" id="rotMobileKpiPreventivos">0</div>
                    <div class="rot-m-kpi-sub" style="color:#60a5fa">Mantenimientos</div>
                </div>
            </div>
            <div class="rot-m-kpi green">
                <span class="rot-m-kpi-title" style="color:#fff">COSTO TOTAL</span>
                <div>
                    <div class="rot-m-kpi-val" id="rotMobileKpiCosto" style="color:#34d399; font-size:18px;">S/ 0.00</div>
                    <div class="rot-m-kpi-sub">Costo acumulado</div>
                </div>
            </div>
            <div class="rot-m-kpi orange">
                <span class="rot-m-kpi-title">EN PROCESO</span>
                <div>
                    <div class="rot-m-kpi-val" id="rotMobileKpiProceso">0</div>
                    <div class="rot-m-kpi-sub" style="color:#fb923c">En Taller</div>
                </div>
            </div>
        </div>

        <!-- Quick actions -->
        <div class="rot-m-quick-scroll rot-m-no-scrollbar">
            <button class="rot-m-quick-btn" onclick="window.rotExportar()"><i class="bi bi-file-earmark-excel"></i> Exportar Excel</button>
            <button class="rot-m-quick-btn red" onclick="window.rotExportarPDF()"><i class="bi bi-file-earmark-pdf"></i> Exportar PDF</button>
        </div>

        <!-- Tabs -->
        <div class="rot-m-tabs-wrap">
            <div class="rot-m-tabs rot-m-no-scrollbar" id="rotMobileStatusTabs">
                <button data-estado="" onclick="window.rotChipEstado(this,'')" class="rot-m-tab active">Todos</button>
                <button data-estado="Pendiente" onclick="window.rotChipEstado(this,'Pendiente')" class="rot-m-tab">Pendiente</button>
                <button data-estado="En Proceso" onclick="window.rotChipEstado(this,'En Proceso')" class="rot-m-tab">En Proceso</button>
                <button data-estado="Pausada" onclick="window.rotChipEstado(this,'Pausada')" class="rot-m-tab">Pausada</button>
                <button data-estado="Finalizado" onclick="window.rotChipEstado(this,'Finalizado')" class="rot-m-tab">Finalizado</button>
            </div>
        </div>

        <!-- Cards List -->
        <div class="rot-m-list" id="otListMobile">
            <!-- Filled via JS -->
        </div>
    </main>
</div>

<!-- Overlay -->
<div id="rotMobileOverlay" class="rot-m-overlay" onclick="closeAllDrawers()"></div>

<!-- Filter Drawer -->
<div id="rotMobileFilterDrawer" class="rot-m-drawer">
    <div class="rot-m-drawer-handle"></div>
    <div class="rot-m-drawer-header">
        <h3 class="rot-m-drawer-title"><i class="bi bi-sliders" style="color:#60a5fa"></i> Filtros Avanzados</h3>
        <button class="rot-m-drawer-clear" onclick="resetFilters()">Limpiar todo</button>
    </div>
    <div class="rot-m-drawer-content rot-m-no-scrollbar">
        <div class="rot-m-form-group">
            <label class="rot-m-label">Número de OT</label>
            <input type="text" id="rotMobileFilOt" class="rot-m-input" placeholder="Ej. OT-2026-0001" oninput="document.getElementById('rot-fil-ot').value=this.value;">
        </div>
        <div class="rot-m-form-group">
            <label class="rot-m-label">Placa del Vehículo</label>
            <input type="text" id="rotMobileFilPlaca" class="rot-m-input" placeholder="Ej. A5B891" oninput="this.value=this.value.toUpperCase(); document.getElementById('rot-fil-placa').value=this.value;">
        </div>
        <div class="rot-m-form-group">
            <label class="rot-m-label">Rango de Fecha</label>
            <div style="display: flex; gap: 8px;">
                <input type="date" id="rotMobileFilDesde" class="rot-m-input" onchange="document.getElementById('rot-fil-desde').value=this.value;">
                <input type="date" id="rotMobileFilHasta" class="rot-m-input" onchange="document.getElementById('rot-fil-hasta').value=this.value;">
            </div>
        </div>
    </div>
    <div style="display:flex; gap:8px;">
        <button class="rot-m-btn-block rot-m-btn-secondary" style="flex:1;" onclick="closeAllDrawers()">Cancelar</button>
        <button class="rot-m-btn-block rot-m-btn-primary" style="flex:1;" onclick="window.rotFiltrar(); closeAllDrawers()">Aplicar Filtros</button>
    </div>
</div>

<!-- Contextual Drawer (Action Menu) -->
<div id="rotMobileActionDrawer" class="rot-m-drawer">
    <div class="rot-m-drawer-handle"></div>
    <div class="rot-m-drawer-header">
        <h3 class="rot-m-drawer-title"><i class="bi bi-lightning-charge" style="color:#f59e0b"></i> Acciones</h3>
    </div>
    <div class="rot-m-drawer-content rot-m-no-scrollbar" id="rotMobileActionContent">
        <!-- Rendered dynamically -->
    </div>
    <button class="rot-m-btn-block rot-m-btn-secondary" onclick="closeAllDrawers()">Cancelar</button>
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

// 2. Refactor rotRenderTablaMobile in logica.js
// First, let's remove the injected tailwind CDN script
logicaContent = logicaContent.replace(/\/\/ Inject Tailwind for mobile view dynamically[\s\S]*?\n\)\(\);\n/g, '');

const newRenderHTML = `
// Reemplazar la funcion rotRenderTablaMobile original
function rotRenderTablaMobile(datos) {
    var container = document.getElementById('otListMobile');
    if (!container) return;
    
    if (datos.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 40px 20px; color: #64748b; font-size: 13px;"><i class="bi bi-inbox" style="font-size: 32px; display: block; margin-bottom: 12px; color: #334155;"></i> No se encontraron OTs</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < datos.length; i++) {
        var ot = datos[i];
        
        // Colores por estado
        var stripeColor = '';
        var badgeColor = '';
        if (ot.estado === 'Pendiente') { stripeColor = 'bg-yellow'; badgeColor = 'bg-yellow'; }
        else if (ot.estado === 'En Proceso') { stripeColor = 'bg-blue'; badgeColor = 'bg-blue'; }
        else if (ot.estado === 'Pausada') { stripeColor = 'bg-orange'; badgeColor = 'bg-orange'; }
        else if (ot.estado === 'Finalizado') { stripeColor = 'bg-green'; badgeColor = 'bg-green'; }
        else if (ot.estado === 'Anulado') { stripeColor = 'bg-red'; badgeColor = 'bg-red'; }

        // Tipos
        var isPrev = ot.tipo_ot === 'Preventivo';
        var typePill = isPrev ? '<span class="rot-m-info-pill">Prev.</span>' : '<span class="rot-m-info-pill red">Corr.</span>';
        
        // Acciones para el Drawer (stringifyed)
        var btnAcciones = '';
        if (ot.estado === 'Pendiente') btnAcciones += '<button class="rot-m-btn-block rot-m-btn-primary" onclick="closeAllDrawers();"><i class="bi bi-play-fill"></i> Iniciar OT</button>';
        if (ot.estado === 'En Proceso') {
            btnAcciones += '<button class="rot-m-btn-block rot-m-btn-actions" onclick="closeAllDrawers();"><i class="bi bi-pause-fill"></i> Pausar OT</button>';
            btnAcciones += '<button class="rot-m-btn-block" style="background:#10b981; color:#fff;" onclick="closeAllDrawers();"><i class="bi bi-check-lg"></i> Cerrar OT</button>';
        }
        btnAcciones += '<button class="rot-m-btn-block rot-m-btn-secondary" onclick="closeAllDrawers(); if(typeof window.rotAbrirDetalle === \\'function\\') window.rotAbrirDetalle(\\'' + ot.id_ot + '\\');"><i class="bi bi-list-ul"></i> Ver Detalles Completos</button>';
        var encodedActions = encodeURIComponent(btnAcciones);

        html += '<div class="rot-m-card">';
        html += '<div class="rot-m-card-stripe ' + stripeColor + '"></div>';
        
        html += '<div class="rot-m-card-header">';
        html += '<h3 class="rot-m-ot-title">' + ot.id_ot + ' <i class="bi bi-check-circle-fill" style="color:#10b981; font-size:12px;"></i></h3>';
        html += '<span class="rot-m-badge ' + badgeColor + '"><span class="rot-m-header-dot" style="animation:none;"></span> ' + ot.estado + '</span>';
        html += '</div>';

        html += '<div class="rot-m-card-grid">';
        html += '<div class="rot-m-info-item">';
        html += '<div class="rot-m-icon-box"><i class="bi bi-truck"></i></div>';
        html += '<div class="rot-m-info-content"><span class="rot-m-info-label">Placa</span><span class="rot-m-info-val">' + ot.placa + '</span></div>';
        html += '</div>';

        html += '<div class="rot-m-info-item">';
        html += '<div class="rot-m-icon-box"><i class="bi bi-speedometer2"></i></div>';
        html += '<div class="rot-m-info-content"><span class="rot-m-info-label">Odómetro</span><span class="rot-m-info-val">' + ot.kilometraje + ' km</span></div>';
        html += '</div>';

        html += '<div class="rot-m-info-item" style="grid-column: span 2;">';
        html += '<div class="rot-m-icon-box"><i class="bi bi-tools"></i></div>';
        html += '<div class="rot-m-info-content"><span class="rot-m-info-label">Tipo & Tarea</span><span class="rot-m-info-val">' + typePill + ' ' + ot.tipo_servicio + '</span></div>';
        html += '</div>';

        html += '<div class="rot-m-info-item" style="grid-column: span 2;">';
        html += '<div class="rot-m-icon-box"><i class="bi bi-person"></i></div>';
        html += '<div class="rot-m-info-content"><span class="rot-m-info-label">Asignado a</span><span class="rot-m-info-val">' + ot.encargado + '</span></div>';
        html += '</div>';
        html += '</div>'; // End grid

        if (ot.observacion) {
            html += '<div class="rot-m-obs">"' + ot.observacion + '"</div>';
        }

        html += '<div class="rot-m-card-footer">';
        html += '<span class="rot-m-date"><i class="bi bi-calendar3" style="margin-right:4px;"></i> ' + ot.fecha_creacion + '</span>';
        html += '<button class="rot-m-btn-icon" onclick="document.getElementById(\\'rotMobileActionContent\\').innerHTML=decodeURIComponent(\\'' + encodedActions + '\\'); openActionDrawer(); event.stopPropagation();"><i class="bi bi-three-dots-vertical"></i></button>';
        html += '</div>';

        html += '</div>'; // End card
    }
    container.innerHTML = html;
}
`;

// Replace the old rotRenderTablaMobile function in logica.js
const regex = /function rotRenderTablaMobile\(datos\) \{[\s\S]*?\}\s*(?=\n\/\/ \-\-\-|\nfunction|\nwindow)/;
logicaContent = logicaContent.replace(regex, newRenderHTML);

fs.writeFileSync(logicaPath, logicaContent, 'utf8');

console.log("Refactored to semantic HTML/CSS successfully.");
