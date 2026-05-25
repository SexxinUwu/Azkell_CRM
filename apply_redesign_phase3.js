const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'estilos.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Eliminar cualquier bloque previo de la fase 3 si existe para no duplicar
if (css.includes('/* ============================================================\n   💎 FASE 6: AJUSTES FINALES')) {
    css = css.split('/* ============================================================\n   💎 FASE 6: AJUSTES FINALES')[0];
}

const overrideCss = `/* ============================================================
   💎 FASE 6: AJUSTES FINALES (Móvil, Dark Mode y FABs)
   ============================================================ */

/* 1. Solución de Desbordamiento del Menú en Móvil */
@media (max-width: 768px) {
    .sidebar {
        /* Cuando está oculto, que se esconda completamente incluyendo la sombra y márgenes */
        transform: translateX(calc(-100% - 40px)) !important; 
    }
    .sidebar.mobile-open {
        transform: translateX(0) !important;
    }
}

/* 2. Legibilidad de Textos en Modo Oscuro */
body.dark {
    color: #f8fafc !important; /* Texto base brillante */
}
body.dark .text-muted, 
body.dark .nav-section-label,
body.dark .small,
body.dark p {
    color: #cbd5e1 !important; /* Grises más claros para subtítulos */
}
body.dark .card, 
body.dark .kpi-card, 
body.dark .pregunta-box, 
body.dark .detalle-item,
body.dark .table-custom td {
    color: #f8fafc !important;
}

/* 3. Estilos de FABs (Botones flotantes animados) globales */
.fab-menu {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 1050;
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 12px;
}
.fab-main {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: var(--crm-accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    cursor: pointer;
    transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s;
    border: none;
}
.fab-main:hover {
    transform: scale(1.05);
}
.fab-menu.fab-menu-open .fab-main {
    transform: rotate(45deg);
}
.fab-options {
    display: flex;
    flex-direction: column-reverse;
    gap: 12px;
    opacity: 0;
    pointer-events: none;
    transform: translateY(20px);
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.fab-menu.fab-menu-open .fab-options {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
}
.fab-item {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: flex-end;
    cursor: pointer;
}
.fab-item-label {
    background: rgba(0,0,0,0.75);
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    white-space: nowrap;
}
body.dark .fab-item-label {
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(4px);
}
.fab-item-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background-color: var(--surface);
    color: var(--crm-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
    border: 1px solid var(--border);
    transition: transform 0.2s;
}
.fab-item:hover .fab-item-btn {
    transform: scale(1.1);
    background-color: var(--crm-accent);
    color: white;
}
`;

fs.writeFileSync(cssPath, css + '\n' + overrideCss);
console.log('CSS phase 6 applied successfully.');
