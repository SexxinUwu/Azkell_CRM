const fs = require('fs');
const path = 'modulos/mantenimiento/reportes-ot/logica.js';
let content = fs.readFileSync(path, 'utf8');

const oldFuncStart = "window.descargarPlantillaVaciaOT = function(idOt, placa, fechaIng, km, rampa) {";
const nextFuncRegex = /window\.generarPDF_OT = function/s;

const startIdx = content.indexOf(oldFuncStart);
if (startIdx !== -1) {
    const endMatch = nextFuncRegex.exec(content.substring(startIdx));
    if (endMatch) {
        const nextFuncIdx = startIdx + endMatch.index;
        
        const newFunc = `window.descargarPlantillaVaciaOT = function(idOt, placa, fechaIng, km, rampa) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando plantilla...', 'bg-info');
    
    // Primero buscar en memoria
    var ot = null;
    if (window.rotData) ot = window.rotData.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
    if (!ot && window.srData) ot = window.srData.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
    if (!ot && window.srOtData) ot = window.srOtData.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
    if (!ot && window.srEntradas) ot = window.srEntradas.find(function(o) { return String(o.ticket_entrada||o.id_ot||o.ticket) === String(idOt); });

    if (ot) {
        window.generarPDF_OT(ot, [], []);
        return;
    }

    // Si no está en memoria, la buscamos por API para traer todos los detalles_json
    fetch('/api/ordenes-trabajo')
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(data) {
          if (!window.rotData) window.rotData = data;
          var found = data.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
          if (!found) {
              found = { ticket_entrada: idOt, placa: placa, fecha_ingreso: fechaIng, km_tablero: km, id_rampa: rampa };
          }
          window.generarPDF_OT(found, [], []);
      })
      .catch(function(e) {
          console.error(e);
          var dummy = { ticket_entrada: idOt, placa: placa, fecha_ingreso: fechaIng, km_tablero: km, id_rampa: rampa };
          window.generarPDF_OT(dummy, [], []);
      });
};

`;
        content = content.substring(0, startIdx) + newFunc + content.substring(nextFuncIdx);
        fs.writeFileSync(path, content, 'utf8');
        console.log("Patched descargarPlantillaVaciaOT successfully");
    } else {
        console.log("Could not find window.generarPDF_OT to replace until");
    }
} else {
    console.log("Could not find window.descargarPlantillaVaciaOT");
}
