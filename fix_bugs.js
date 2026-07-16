const fs = require('fs');
const pathEntradas = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let codeEnt = fs.readFileSync(pathEntradas, 'utf8');

// Fix entradas badge
codeEnt = codeEnt.replace(
    /'<td><span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' \+ _entEsc\(d\.id \|\| ''\) \+ '<\/span><\/td>' \+/,
    " '<td class=\"text-center\" style=\"vertical-align:middle;\">' + (isFirst ? tipoOrdBadge : '') + '<span class=\"badge bg-secondary fw-normal\" style=\"font-size:0.72rem;\">' + _entEsc(d.id || '') + '</span></td>' +"
);

fs.writeFileSync(pathEntradas, codeEnt);
console.log('Fixed entradas badge');

const pathRot = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/mantenimiento/reportes-ot/logica.js';
let codeRot = fs.readFileSync(pathRot, 'utf8');

// Remove Ir a Entradas
codeRot = codeRot.replace(
    /\+ \(esAprobada \? '<button class="btn btn-sm rot-btn-agregar" style="padding:1px 8px;font-size:0.7rem;background:rgba\(14,165,233,0\.1\);color:#0ea5e9;font-weight:700;border-radius:12px;margin-left:auto;" onclick="event\.stopPropagation\(\);window\.location\.hash=\\'#\/almacen\/entradas\\';"><i class="bi bi-box-arrow-up-right"><\/i> Ir a Entradas<\/button>' : ''\) \+ '<\/div>'/g,
    "+ '</div>'"
);

// Add to Promise.all
if (!codeRot.includes('/api/almacen/entradas?ot_id=')) {
    codeRot = codeRot.replace(
        /fetch\('\/api\/inspecciones-por-ot\?id_ot=' \+ encodeURIComponent\(idOT\)\)\.then\(function\(r\)\{ return r\.ok \? r\.json\(\) : \[\]; \}\)\.catch\(function\(\)\{ return \[\]; \}\)/,
        `fetch('/api/inspecciones-por-ot?id_ot=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/almacen/entradas?ot_id=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; })`
    );
}

// Ensure the results array index is correct
if (!codeRot.includes('var servicios = Array.isArray(res[4]) ? res[4] : [];')) {
    codeRot = codeRot.replace(
        /var inspecciones = Array\.isArray\(res\[3\]\) \? res\[3\] : \[\];/,
        `var inspecciones = Array.isArray(res[3]) ? res[3] : [];
          var servicios = Array.isArray(res[4]) ? res[4] : [];
          
          servicios = servicios.filter(function(s) { return s.tipo_orden === 'Orden de Servicio'; });
          
          var srvBody = document.getElementById('rot-srv-body');
          var srvCount = document.getElementById('rot-srv-count');
          if (srvCount) srvCount.textContent = servicios.length;
          if (srvBody) {
              if (!servicios.length) {
                  srvBody.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay servicios de terceros registrados.</div>';
              } else {
                  var sHTML = '';
                  servicios.forEach(function(srv) {
                      sHTML += '<div style="padding:10px 12px; border-bottom:1px solid var(--border); font-size:0.8rem;">' +
                               '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                                  '<strong>' + rotEscHtml(srv.id) + '</strong>' +
                                  '<span style="color:#16a34a; font-weight:bold;">S/ ' + Number(srv.total_pen || 0).toLocaleString('es-PE', {minimumFractionDigits:2}) + '</span>' +
                               '</div>' +
                               '<div style="color:var(--subtext); font-size:0.75rem; margin-top:4px;">Proveedor: ' + rotEscHtml(srv.proveedor_nombre || 'N/A') + '</div>' +
                               '</div>';
                  });
                  srvBody.innerHTML = sHTML;
              }
          }`
    );
}

fs.writeFileSync(pathRot, codeRot);
console.log('Fixed rot');
