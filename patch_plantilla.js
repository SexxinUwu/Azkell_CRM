const fs = require('fs');
const path = 'modulos/mantenimiento/reportes-ot/logica.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix print colors
content = content.replace(
    "@media print { body { background: none; padding: 0; margin: 0; display: block; }",
    "@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } body { background: none; padding: 0; margin: 0; display: block; }"
);

// We should also replace standard @media print rules that might be there
content = content.replace(
    "@media print {\n            @page { size: A4; margin: 0; }\n            body { background: none; padding: 0; margin: 0; }",
    "@media print {\n            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }\n            @page { size: A4; margin: 0; }\n            body { background: none; padding: 0; margin: 0; }"
);

// 2. Replace descargarPlantillaVaciaOT entirely
const functionStart = 'window.descargarPlantillaVaciaOT = function(idOt, placa, fechaIng, km, rampa) {';
const functionEnd = '        });\n};'; // We need to be careful with regex here
// Let's use a simpler way: find index of start, find index of end
const startIdx = content.indexOf(functionStart);
if (startIdx !== -1) {
    // The function ends with: "        });\n};" or similar, just before window.generarPDF_OT
    const nextFuncIdx = content.indexOf('window.generarPDF_OT = function', startIdx);
    if (nextFuncIdx !== -1) {
        const replacement = `window.descargarPlantillaVaciaOT = function(idOt, placa, fechaIng, km, rampa) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando plantilla...', 'bg-info');
    var ot = (window.rotData || []).find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
    if (!ot) {
        ot = { ticket_entrada: idOt, placa: placa, fecha_ingreso: fechaIng, km_tablero: km, id_rampa: rampa };
    }
    // Llama al motor de PDF en alta calidad con arrays vacíos
    window.generarPDF_OT(ot, [], []);
};\n\n`;
        content = content.substring(0, startIdx) + replacement + content.substring(nextFuncIdx);
    }
}

// Ensure patch_status.js is applied
const footerStart = "footer.innerHTML = '<button class=\"btn btn-sm btn-outline-secondary\" onclick=\"window.srAbrirDrawerEdicion(' + id + ')\"><i class=\"bi bi-pencil me-1\"></i>Editar Ingreso</button>'";
const footerEnd = "             + '<button class=\"btn btn-sm btn-outline-danger ms-auto\" onclick=\"window.srLiberarRampa(' + id + ')\"><i class=\"bi bi-box-arrow-right me-1\"></i>Liberar</button>';";

fs.writeFileSync(path, content, 'utf8');
console.log("Patched logica.js successfully");
