const fs = require('fs');
const path = 'modulos/mantenimiento/reportes-ot/logica.js';
let content = fs.readFileSync(path, 'utf8');

const targetStr = "try { det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(e) {}";

if (content.includes(targetStr) && !content.includes('// Merge con padre si es OT hija')) {
    const replacement = targetStr + `\n
    // Merge con padre si es OT hija
    if (ot.ticket_visita) {
        var pOT = null;
        if (window.rotData) pOT = window.rotData.find(function(x){return x.ticket_entrada === ot.ticket_visita;});
        if (!pOT && window.srEntradas) pOT = window.srEntradas.find(function(x){return x.ticket_entrada === ot.ticket_visita || x.ticket === ot.ticket_visita;});
        
        if (pOT) {
            var detP = {};
            try { detP = typeof pOT.detalles_json === 'string' ? JSON.parse(pOT.detalles_json) : (pOT.detalles_json||{}); } catch(e){}
            det.motivo = det.motivo || detP.motivo || pOT.observaciones || pOT.motivo || '';
            det.cliente = det.cliente || detP.cliente || pOT.cliente || '';
            det.km_gps = det.km_gps || detP.km_gps || pOT.km_gps || '';
            det.km_tablero = det.km_tablero || detP.km_tablero || pOT.km_tablero || pOT.km || '';
            det.rampa_origen = det.rampa_origen || detP.rampa_origen || pOT.txtRampa || pOT.rampa || '';
            ot.fecha_ingreso = ot.fecha_ingreso || pOT.fecha_ingreso || pOT.creado_en || '';
        }
    }\n`;
    content = content.replace(targetStr, replacement);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Patched generarPDF_OT successfully");
} else {
    console.log("Could not find target or already patched");
}
