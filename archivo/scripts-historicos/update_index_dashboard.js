const fs = require('fs');
const path = require('path');

const fileHtml = path.join(__dirname, 'Index.html');
let html = fs.readFileSync(fileHtml, 'utf8');

const anchorPoint = '<!-- Movimientos -->';
const insertion = `<!-- Analítica -->
                        <div class="nav-sub-label"><i class="bi bi-graph-up me-1"></i><span>Analítica</span></div>
                        <a id="nav-finanzas-inv" class="nav-item" onclick="cargarModuloAislado('almacen/dashboard-financiero')">
                            <i class="bi bi-pie-chart-fill nav-icon"></i>
                            <span class="link-text">Dashboard Financiero</span>
                        </a>
                        
                        <!-- Movimientos -->`;

if (html.includes(anchorPoint) && !html.includes('Dashboard Financiero')) {
    html = html.replace(anchorPoint, insertion);
    fs.writeFileSync(fileHtml, html, 'utf8');
    console.log('Index.html updated with Dashboard Financiero menu item.');
} else {
    console.log('Menu item already exists or anchor point not found.');
}
