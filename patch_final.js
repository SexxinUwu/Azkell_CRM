const fs = require('fs');

// PATCH VISTA.HTML
let html = fs.readFileSync('modulos/mantenimiento/status-rampa/vista.html', 'utf8');

html = html.replace(
    '<div class="sr-detail-panel" id="sr-panel-detalle">',
    '<div class="sr-drawer-global" id="sr-panel-detalle">'
);
html = html.replace(
    '<div class="sr-detail-panel" id="sr-panel-detalle-hist">',
    '<div class="sr-drawer-global" id="sr-panel-detalle-hist">'
);

// We know the exact string, so no need for complex regex.
html = html.replace(
    `<div style="display:flex; align-items:center; justify-content:space-between; padding:0 1rem; height:48px; border-bottom:1px solid var(--border); flex-shrink:0;">
                <span style="font-size:0.88rem; font-weight:800; color:var(--text);">Detalle de Rampa</span>
                <button class="btn btn-sm" onclick="window.srCerrarDetalle()" style="color:var(--subtext);">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>`,
    `<div class="sr-drawer-hd">
                <span class="sr-drawer-title">Detalle de Rampa</span>
                <button class="btn btn-sm" onclick="window.srCerrarDetalle()" style="color:var(--subtext);">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>`
);

html = html.replace(
    `<div style="display:flex; align-items:center; justify-content:space-between; padding:0 1rem; height:48px; border-bottom:1px solid var(--border); flex-shrink:0;">
                        <span style="font-size:0.88rem; font-weight:800; color:var(--text);">Detalle Historial</span>
                        <button class="btn btn-sm" onclick="window.srCerrarDetalleHist()" style="color:var(--subtext);">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>`,
    `<div class="sr-drawer-hd">
                <span class="sr-drawer-title">Detalle Historial</span>
                <button class="btn btn-sm" onclick="window.srCerrarDetalleHist()" style="color:var(--subtext);">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>`
);

html = html.replace(
    'class="sr-detail-scroll" id="sr-detalle-scroll"',
    'class="sr-drawer-body" id="sr-detalle-scroll"'
);
html = html.replace(
    'class="sr-detail-footer" id="sr-detalle-footer"',
    'class="sr-drawer-footer" id="sr-detalle-footer" style="padding: 0.75rem 1rem; border-top: 1px solid var(--border); display: flex; gap: 0.5rem; flex-wrap: wrap;"'
);

html = html.replace(
    'class="sr-detail-scroll" id="sr-hist-detalle-scroll"',
    'class="sr-drawer-body" id="sr-hist-detalle-scroll"'
);
html = html.replace(
    'class="sr-detail-footer" id="sr-hist-detalle-footer"',
    'class="sr-drawer-footer" id="sr-hist-detalle-footer" style="padding: 0.75rem 1rem; border-top: 1px solid var(--border); display: flex; gap: 0.5rem; flex-wrap: wrap;"'
);

fs.writeFileSync('modulos/mantenimiento/status-rampa/vista.html', html);
console.log('vista.html updated!');

// PATCH SERVER.JS & REPORTES OT
let srv = fs.readFileSync('server.js', 'utf8');
srv = srv.replace(
    /const nuevoIdOT = "OT-" \+ String\(ultimo\)\.padStart\(4, '0'\) \+ "-" \+ currentYear;/g,
    'const nuevoIdOT = "OT-" + currentYear + "-" + String(ultimo).padStart(4, "0");'
);
srv = srv.replace(
    /const correlativoID = `ST-\$\{nextNum\}-\$\{year\}`;/g,
    'const correlativoID = `ST-${year}-${nextNum}`;'
);
fs.writeFileSync('server.js', srv);
console.log('server.js updated!');

let rep = fs.readFileSync('modulos/mantenimiento/reportes-ot/logica.js', 'utf8');
rep = rep.replace(
    `            anioPart = parts[1];
            numPart = parts[2];`,
    `            if (parts[1].startsWith('20')) {
                anioPart = parts[1];
                numPart = parts[2];
            } else {
                anioPart = parts[2];
                numPart = parts[1];
            }`
);
rep = rep.replace(
    /Nº OT: <span class="val-blue">\$\{numPart\}\$\{anioPart \? '-' \+ anioPart : ''\}<\/span>/g,
    'Nº OT: <span class="val-blue">${anioPart ? anioPart + "-" : ""}${numPart}</span>'
);
fs.writeFileSync('modulos/mantenimiento/reportes-ot/logica.js', rep);
console.log('reportes-ot/logica.js updated!');
