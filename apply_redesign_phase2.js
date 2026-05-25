const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'estilos.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Eliminar el bloque previo de la fase 5
if (css.includes('/* ============================================================\n   💎 FASE 5')) {
    css = css.split('/* ============================================================\n   💎 FASE 5')[0];
}

const overrideCss = `/* ============================================================
   💎 FASE 5.1: REDISEÑO MINIMALISTA PRO (Corregido)
   ============================================================ */

/* 1. Fondos Generales (Mejora de Contraste) */
:root {
    /* Gris perla ligeramente más profundo para contrastar con las tarjetas blancas */
    --bg-modern: #e2e8f0; 
}
body.dark {
    /* Gris casi negro oscuro, y tarjetas un poco más claras */
    --bg-modern: #0f172a;
    --surface: #1e293b;
    --border: #334155;
    --text: #f8fafc;
}

/* 2. Rediseño del Layout (Aplicado a Light y Dark Mode) */
body { background-color: var(--bg-modern) !important; }
.content { background-color: transparent !important; }
.main-area { padding: 0 12px 12px 0 !important; }
#app-crm { padding: 12px; background-color: var(--bg-modern); }

/* 3. Sidebar Flotante (Efecto Cápsula en Escritorio y MÓVIL) */
.sidebar {
    height: calc(100vh - 24px) !important;
    border-radius: 24px !important;
    margin-right: 12px !important;
    box-shadow: 0 10px 40px rgba(0,0,0,0.06) !important;
    border: 1px solid rgba(0,0,0,0.03) !important;
    overflow: hidden;
}
body.dark .sidebar {
    background-color: var(--surface) !important;
    border: 1px solid rgba(255,255,255,0.05) !important;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3) !important;
}

/* Aplicando el diseño cápsula también en teléfonos móviles */
@media (max-width: 768px) {
    #app-crm { padding: 8px; }
    .sidebar { 
        height: calc(100% - 16px) !important; 
        border-radius: 20px !important; 
        margin: 8px !important; 
    }
    .main-area { padding: 0 8px 8px 8px !important; }
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

/* 5. Refinamiento de Tarjetas y Tablas (Sombreado Premium) */
.card, .kpi-card, .pregunta-box, .detalle-item {
    background-color: var(--surface) !important;
    border-radius: 20px !important;
    border: 1px solid rgba(0,0,0,0.04) !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.04) !important;
}
body.dark .card, body.dark .kpi-card, body.dark .pregunta-box, body.dark .detalle-item {
    border: 1px solid rgba(255,255,255,0.04) !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2) !important;
}
.table-custom th {
    border-bottom: 2px solid rgba(0,0,0,0.03) !important;
    background-color: transparent !important;
    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;
}
body.dark .table-custom th { border-bottom-color: rgba(255,255,255,0.03) !important; }
.table-custom td { border-top: 1px solid rgba(0,0,0,0.02) !important; }
body.dark .table-custom td { border-top: 1px solid rgba(255,255,255,0.02) !important; }

/* Legibilidad de color de texto en botones modo oscuro */
body.dark .btn-primary, body.dark .btn-outline-primary, body.dark .btn-outline-info {
    color: #ffffff !important;
}

/* Fin del override */
`;

fs.writeFileSync(cssPath, css + '\n' + overrideCss);
console.log('CSS phase 5.1 applied successfully.');
