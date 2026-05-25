const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'estilos.css');
let css = fs.readFileSync(cssPath, 'utf8');

const overrideCss = `
/* ============================================================
   💎 FASE 5: REDISEÑO MODERNO (FLOTANTE & ESMERALDA)
   ============================================================ */

/* 1. Nueva Paleta de Colores (Emerald Green Moderno) */
:root {
    --crm-accent: #059669 !important; /* Verde Esmeralda */
    --crm-accent-light: rgba(5, 150, 105, 0.15) !important;
    --bg-modern: #f1f5f9;
}
body.dark {
    --crm-accent: #10b981 !important; /* Verde más claro para Dark Mode */
    --crm-accent-light: rgba(16, 185, 129, 0.2) !important;
    --bg-modern: #0f172a;
}

/* 2. Rediseño del Layout (Fondo) */
body {
    background-color: var(--bg-modern) !important;
}
.content {
    background-color: transparent !important;
}

/* 3. Sidebar Flotante (Efecto Cápsula) */
#app-crm {
    padding: 12px;
    background-color: var(--bg-modern);
}
.sidebar {
    height: calc(100vh - 24px) !important;
    border-radius: 24px !important;
    margin-right: 12px !important;
    box-shadow: 0 10px 40px rgba(0,0,0,0.06) !important;
    border: 1px solid rgba(0,0,0,0.03) !important;
    overflow: hidden;
}
body.dark .sidebar {
    border: 1px solid rgba(255,255,255,0.05) !important;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3) !important;
}

/* En móviles, la sidebar ocupa toda la pantalla de todas formas, ajustamos */
@media (max-width: 768px) {
    #app-crm { padding: 0; }
    .sidebar { height: 100% !important; border-radius: 0 !important; margin: 0 !important; }
}

/* 4. Topbar Glassmorphism y Flotante */
.topbar {
    border-radius: 20px !important;
    margin: 0 12px 12px 0 !important;
    background: rgba(255, 255, 255, 0.8) !important;
    backdrop-filter: blur(20px) saturate(180%) !important;
    -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
    border: 1px solid rgba(0,0,0,0.05) !important;
    box-shadow: 0 4px 15px rgba(0,0,0,0.02) !important;
}
body.dark .topbar {
    background: rgba(30, 41, 59, 0.8) !important;
    border: 1px solid rgba(255,255,255,0.05) !important;
}
@media (max-width: 768px) {
    .topbar { margin: 8px !important; border-radius: 12px !important; }
}

/* 5. Área Principal (Main Area) Espaciado */
.main-area {
    padding: 0 12px 12px 0 !important;
}
@media (max-width: 768px) {
    .main-area { padding: 0 8px 8px 8px !important; }
}

/* 6. Refinamiento de Tarjetas y Sombras */
.card, .kpi-card, .pregunta-box, .detalle-item {
    border-radius: 20px !important;
    border: 1px solid rgba(0,0,0,0.04) !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.04) !important;
}
body.dark .card, body.dark .kpi-card, body.dark .pregunta-box, body.dark .detalle-item {
    border: 1px solid rgba(255,255,255,0.04) !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2) !important;
}
.kpi-card { border-left-width: 6px !important; border-left-color: var(--crm-accent) !important; }

/* 7. Eliminar bordes duros de tablas */
.table-custom th {
    border-bottom: 2px solid rgba(0,0,0,0.03) !important;
    background-color: transparent !important;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
body.dark .table-custom th { border-bottom-color: rgba(255,255,255,0.03) !important; }
.table-custom td { border-top: 1px solid rgba(0,0,0,0.02) !important; }
body.dark .table-custom td { border-top: 1px solid rgba(255,255,255,0.02) !important; }
.clickable-row:hover td { background-color: var(--crm-accent-light) !important; }

/* 8. Botones suaves */
.btn { border-radius: 12px !important; }
.btn-sm { border-radius: 8px !important; }
`;

if (!css.includes('💎 FASE 5: REDISEÑO MODERNO')) {
    fs.writeFileSync(cssPath, css + '\n' + overrideCss);
    console.log('CSS updated successfully.');
} else {
    console.log('CSS already updated.');
}
