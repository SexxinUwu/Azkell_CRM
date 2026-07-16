const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let code = fs.readFileSync(path, 'utf8');

const htmlBuilder = `
window.generarComprobanteEntrada = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }

    var htmlContent = window._entGenerarHtmlPDF(d);
    
    var htmlCompleto = '<!DOCTYPE html><html><head><title>Orden de Compra ' + d.id + '</title>' +
        '<style>' +
        'body { background-color: #cbd5e1; margin: 0; padding: 40px 20px; font-family: "Inter", Arial, sans-serif; }' +
        '#btnPrint { position: fixed; top: 20px; right: 20px; background-color: #0f172a; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3); z-index: 1000; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }' +
        '#btnPrint:hover { background-color: #1e293b; transform: translateY(-2px); box-shadow: 0 6px 12px rgba(0,0,0,0.4); }' +
        '.page-container { background: #fff; padding: 0; box-shadow: 0 10px 30px rgba(0,0,0,0.15); margin: 0 auto; width: 210mm; min-height: 297mm; box-sizing: border-box; }' +
        '@media print { ' +
        '  @page { size: A4 portrait; margin: 0; }' +
        '  body { background: none; padding: 0; margin: 0; }' +
        '  #btnPrint { display: none; }' +
        '  .page-container { box-shadow: none; width: 100%; height: auto; margin: 0; }' +
        '}' +
        '</style>' +
        '</head><body>' +
        '<button id="btnPrint" onclick="window.print()"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5 1a2 2 0 0 0-2 2v1h10V3a2 2 0 0 0-2-2H5zm6 8H5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1z"/><path d="M0 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2H2a2 2 0 0 1-2-2V7zm2.5 1a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/></svg> Imprimir / Guardar PDF</button>' +
        '<div class="page-container">' + htmlContent + '</div>' +
        '</body></html>';

    var win = window.open('', '_blank');
    if (win) {
        win.document.open();
        win.document.write(htmlCompleto);
        win.document.close();
    } else {
        alert("Por favor habilite las ventanas emergentes (pop-ups) para ver el PDF.");
    }
};

window.previsualizarComprobanteEntrada = window.generarComprobanteEntrada;
`;

const startIdx = code.indexOf('window.generarComprobanteEntrada = function(id) {');
if (startIdx !== -1) {
    const endStr = 'window.exportarEntradasExcel = function() {';
    const endIdx = code.indexOf(endStr);
    if (endIdx !== -1) {
        code = code.substring(0, startIdx) + htmlBuilder + '\n\n' + code.substring(endIdx);
    }
}

// Adjust the inner div width to match A4 100% instead of hardcoded 750px
code = code.replace(
    /'<div style="font-family:\\'Inter\\', Arial, sans-serif;width:750px;margin:0 auto;padding:40px;color:#0f172a;box-sizing:border-box;">' \+/,
    '\'<div style="font-family:\\\'Inter\\\', Arial, sans-serif;width:100%;margin:0 auto;padding:40px;color:#0f172a;box-sizing:border-box;">\' +'
);

fs.writeFileSync(path, code);
console.log('Done!');
