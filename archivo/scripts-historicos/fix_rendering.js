const fs = require('fs');
const p = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/mantenimiento/reportes-ot/logica.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(
    /window\.rotOtInspeccionesActivas = Array\.isArray\(res\[3\]\) \? res\[3\] : \[\];/,
    `window.rotOtInspeccionesActivas = Array.isArray(res[3]) ? res[3] : [];
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

fs.writeFileSync(p, c);
console.log('Injected rendering logic successfully');
