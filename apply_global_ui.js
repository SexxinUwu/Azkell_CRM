const fs = require('fs');
const path = require('path');

// ============================================
// FASE 1, 2 Y 3: Modificar estilos.css
// ============================================
const cssPath = path.join(__dirname, 'estilos.css');
let css = fs.readFileSync(cssPath, 'utf8');

const globalCssAdditions = `
/* ============================================================
   FASE 4: Rediseño Global UI (One UI 8.5 Style + Modulos Redondeados)
   ============================================================ */

/* 1. Redondeo maestro de todos los contenedores principales de los módulos */
/* Apuntamos al primer hijo directo de #layout-content que normalmente es el contenedor del módulo */
#layout-content > div {
    margin: 16px;
    height: calc(100% - 32px) !important;
    border-radius: 24px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    overflow: hidden;
    background: var(--bg); /* o var(--surface) dependiendo del módulo */
    border: 1px solid var(--border);
    position: relative;
}

@media (max-width: 768px) {
    #layout-content > div {
        margin: 10px;
        height: calc(100% - 20px) !important;
        border-radius: 20px;
    }
}

/* Excepción: Si algún módulo usa flex-col internamente, aseguramos que se comporte bien */
#layout-content > div > .gu-header,
#layout-content > div > .audit-header,
#layout-content > div > .inv-header {
    border-radius: 24px 24px 0 0;
}
@media (max-width: 768px) {
    #layout-content > div > .gu-header,
    #layout-content > div > .audit-header,
    #layout-content > div > .inv-header {
        border-radius: 20px 20px 0 0;
    }
}

/* 2. Rediseño del Bottom Nav (Estilo One UI 8.5 Píldora Flotante) */
.bottom-nav {
    position: fixed;
    bottom: 16px !important; /* Despegado del fondo */
    left: 50%;
    transform: translateX(-50%);
    width: 90% !important;
    max-width: 400px;
    height: 64px !important;
    background: color-mix(in srgb, var(--surface) 85%, transparent) !important;
    -webkit-backdrop-filter: blur(12px) saturate(180%);
    backdrop-filter: blur(12px) saturate(180%);
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent) !important;
    border-radius: 40px !important;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15), 0 2px 10px rgba(0,0,0,0.05);
    z-index: 1060 !important; /* Superior a offcanvas (1045) y modals (1050) */
    display: flex;
    justify-content: space-around;
    align-items: center;
    padding: 0 8px;
}

/* 3. Ajuste de contenido para evitar colisión con el Bottom Nav flotante */
/* Añadimos padding inferior generoso a los cuerpos de offcanvas y modales globales */
.offcanvas-body {
    padding-bottom: 90px !important;
}
.modal-body {
    padding-bottom: 40px !important;
}

/* Deshacer el borde superior feo original del bottom-nav si lo tenía */
.bottom-nav { border-top: none; }
`;

if (!css.includes('FASE 4: Rediseño Global UI')) {
    css += '\n' + globalCssAdditions;
    fs.writeFileSync(cssPath, css);
    console.log('estilos.css actualizado con diseño One UI y bordes maestros.');
}

// ============================================
// FASE 4: Importar fuente Oswald en Index.html
// ============================================
const indexPath = path.join(__dirname, 'Index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

// Modificar Google Fonts para incluir Oswald
if (indexHtml.includes('family=Inter') && !indexHtml.includes('family=Oswald')) {
    indexHtml = indexHtml.replace(
        'family=Inter:wght@400;500;600;700;800&display=swap',
        'family=Inter:wght@400;500;600;700;800&family=Oswald:wght@400;500;600;700&display=swap'
    );
    fs.writeFileSync(indexPath, indexHtml);
    console.log('Index.html actualizado con fuente Oswald.');
}

// ============================================
// FASE 4: Añadir botón Oswald en Apariencia
// ============================================
const aparenciaPath = path.join(__dirname, 'modulos/sistema/configuracion/vista.html');
if (fs.existsSync(aparenciaPath)) {
    let aparienciaHtml = fs.readFileSync(aparenciaPath, 'utf8');
    
    // Buscamos el contenedor de los botones de fuentes.
    // Viendo el código típico de los botones:
    // <div class="font-preview ... onclick="setGlobalFont('Inter')">
    if (aparienciaHtml.includes("setGlobalFont('Inter')") && !aparienciaHtml.includes("setGlobalFont('Oswald')")) {
        const oswaldButton = `
          <!-- Oswald -->
          <div class="col-4 col-md-3">
              <div class="font-preview w-100 text-center" onclick="setGlobalFont('Oswald')" id="font-opt-Oswald">
                  <div class="fw-bold mb-1" style="font-size:1.4rem;font-family:'Oswald',sans-serif;">Aa</div>
                  <div class="text-muted" style="font-size:0.75rem;">Oswald</div>
              </div>
          </div>`;
          
        // Injectar el botón después de Inter o Sistema
        aparienciaHtml = aparienciaHtml.replace(
            /(<div class="col-4 col-md-3">\s*<div class="font-preview w-100 text-center" onclick="setGlobalFont\('Sistema'\)" id="font-opt-Sistema">[\s\S]*?<\/div>\s*<\/div>)/,
            `$1\n${oswaldButton}`
        );
        fs.writeFileSync(aparenciaPath, aparienciaHtml);
        console.log('configuracion/vista.html actualizado con la opción de fuente Oswald.');
    } else {
        console.log('No se pudo inyectar el botón de fuente en configuracion/vista.html o ya existe.');
    }
}
