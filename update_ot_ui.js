const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/mantenimiento/reportes-ot/logica.js';
let code = fs.readFileSync(path, 'utf8');

// 1. Add the UI section for Servicios Externos
const uiSection = `
      // Salidas de Almacén (placeholder)
      html += '<div class="rot-sec" id="rot-sec-materiales">'
            + '<div class="rot-sec-hd" style="display:flex;align-items:center;justify-content:space-between;color:var(--primary,#5865F2);">Salidas de Almacén <span id="rot-mat-count" style="background:rgba(88,101,242,0.12);color:var(--primary,#5865F2);border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span>'
            + (esAprobada ? '<button class="btn btn-sm rot-btn-agregar" style="padding:1px 8px;font-size:0.7rem;background:rgba(88,101,242,0.1);color:#5865F2;font-weight:700;border-radius:12px;margin-left:auto;" onclick="event.stopPropagation();window.rotAgregarSalida(\\'' + rotEscHtml(idOT) + '\\')"><i class="bi bi-plus"></i> Agregar</button>' : '') + '</div>'
            + '<div id="rot-mat-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
            + '</div>';

      // Órdenes de Servicio de Terceros
      html += '<div class="rot-sec" id="rot-sec-servicios">'
            + '<div class="rot-sec-hd" style="display:flex;align-items:center;justify-content:space-between;color:#0ea5e9;">Servicios de Terceros <span id="rot-srv-count" style="background:rgba(14,165,233,0.12);color:#0ea5e9;border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span>'
            + (esAprobada ? '<button class="btn btn-sm rot-btn-agregar" style="padding:1px 8px;font-size:0.7rem;background:rgba(14,165,233,0.1);color:#0ea5e9;font-weight:700;border-radius:12px;margin-left:auto;" onclick="event.stopPropagation();window.location.hash=\\'#/almacen/entradas\\';"><i class="bi bi-box-arrow-up-right"></i> Ir a Entradas</button>' : '') + '</div>'
            + '<div id="rot-srv-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
            + '</div>';
`;

code = code.replace(
    /\/\/ Salidas de Almacén \(placeholder\)[\s\S]*?\+ '<\/div>';/m,
    uiSection
);

// 2. Fetch both Salidas and Entradas (Órdenes de Servicio)
const fetchSection = `
      // Cargar salidas y servicios en paralelo
      Promise.all([
          fetch('/api/almacen/salidas/ot/' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : {data:[]}; }),
          fetch('/api/almacen/entradas?ot_id=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : {data:[]}; })
      ]).then(function(results) {
          var salidas = results[0].data || [];
          var servicios = (results[1].data || []).filter(function(e) { return e.tipo_orden === 'Orden de Servicio'; });
          
          window._rotSalidasDeOT = salidas;
          window._rotServiciosDeOT = servicios;
          rotRenderSalidasAsociadas(idOT);
          rotRenderServiciosAsociados(idOT);
      }).catch(function() {
          rotRenderSalidasAsociadas(idOT);
          rotRenderServiciosAsociados(idOT);
      });
`;

code = code.replace(
    /fetch\('\/api\/almacen\/salidas\/ot\/' \+ encodeURIComponent\(idOT\)\)[\s\S]*?rotRenderSalidasAsociadas\(idOT\);\n\s*\}\);/m,
    fetchSection
);

// 3. Render logic for Servicios
const renderServiciosLogic = `
function rotRenderServiciosAsociados(idOT) {
    var body = document.getElementById('rot-srv-body');
    var count = document.getElementById('rot-srv-count');
    if (!body) return;

    var srv = window._rotServiciosDeOT || [];
    if (count) count.innerText = srv.length;

    if (srv.length === 0) {
        body.innerHTML = '<div style="padding:12px;text-align:center;color:var(--subtext);font-size:0.8rem;">No hay servicios de terceros registrados</div>';
        return;
    }

    var html = '<div style="display:flex;flex-direction:column;gap:6px;padding:8px 12px 12px;">';
    srv.forEach(function(s) {
        var pre = s.moneda === 'USD' ? 'US$' : 'S/';
        var num = (s.id||'').replace(/^ENT-/, '');
        html += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px;cursor:pointer;transition:border-color 0.2s;" onclick="window.location.hash=\\'#/almacen/entradas?id=' + s.id + '\\'">'
              + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'
              + '<span style="font-size:0.75rem;font-weight:700;color:var(--text);">' + (s.proveedor_nombre||'Sin Proveedor') + '</span>'
              + '<span style="font-size:0.8rem;font-weight:800;color:#0ea5e9;">' + pre + ' ' + parseFloat(s.total_pen||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>'
              + '</div>'
              + '<div style="font-size:0.7rem;color:var(--subtext);display:flex;justify-content:space-between;">'
              + '<span>N° ' + num + ' &bull; ' + (s.fecha ? s.fecha.split('T')[0] : '') + '</span>'
              + '</div></div>';
    });
    html += '</div>';
    body.innerHTML = html;
}
`;

code = code.replace(
    /function rotRenderSalidasAsociadas\(idOT\) \{/m,
    renderServiciosLogic + "\nfunction rotRenderSalidasAsociadas(idOT) {"
);

fs.writeFileSync(path, code);
console.log('update_ot_ui.js applied!');
