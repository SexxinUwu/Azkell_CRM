const fs = require('fs');
const path = 'modulos/mantenimiento/reportes-ot/logica.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Replace the onclick of the Plantilla OT button
content = content.replace(
    'onclick=\\"event.stopPropagation(); window.generarPDF_OT({ id_ot: \'" + rotEscHtml(idOT) + "\', placa: \'" + rotEscHtml(ot.placa) + "\' }, [], []);\\">"',
    'onclick=\\"event.stopPropagation(); window.rotDescargarPlantillaOT(\'" + rotEscHtml(idOT) + "\', \'" + rotEscHtml(ot.placa) + "\');\\">"'
);

// 2. Insert window.rotDescargarPlantillaOT next to window.descargarPlantillaVaciaOT
const funcStart = 'window.descargarPlantillaVaciaOT = function(idOt, placa, fechaIng, km, rampa) {';
if (content.includes(funcStart) && !content.includes('window.rotDescargarPlantillaOT = function')) {
    const newFunc = `window.rotDescargarPlantillaOT = function(idOt, placa) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando plantilla OT...', 'bg-info');
    
    // Buscar en memoria
    var ot = null;
    if (window.rotData) ot = window.rotData.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
    if (!ot && window.srData) ot = window.srData.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
    if (!ot && window.srOtData) ot = window.srOtData.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
    if (!ot && window.srEntradas) ot = window.srEntradas.find(function(o) { return String(o.ticket_entrada||o.id_ot||o.ticket) === String(idOt); });

    if (ot) {
        window.generarPDF_OT(ot, [], []);
        return;
    }

    // Buscar por API
    fetch('/api/ordenes-trabajo')
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(data) {
          if (!window.rotData) window.rotData = data;
          var found = data.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
          if (!found) found = { ticket_entrada: idOt, placa: placa };
          window.generarPDF_OT(found, [], []);
      })
      .catch(function(e) {
          console.error(e);
          window.generarPDF_OT({ ticket_entrada: idOt, placa: placa }, [], []);
      });
};\n\n`;
    content = content.replace(funcStart, newFunc + funcStart);
}

fs.writeFileSync(path, content, 'utf8');
console.log("Patched Plantilla OT successfully");
