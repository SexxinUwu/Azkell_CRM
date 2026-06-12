const fs = require('fs');
const path = 'modulos/mantenimiento/reportes-ot/logica.js';

let content = fs.readFileSync(path, 'utf8');

// 1. Replace the "Plantilla OT" button call
const oldButton = `onclick="event.stopPropagation(); window.generarPDF_OT({ id_ot: '" + rotEscHtml(idOT) + "', placa: '" + rotEscHtml(ot.placa) + "' }, [], []);"`;
const newButton = `onclick="event.stopPropagation(); window.rotGenerarPlantillaVaciaOT('" + rotEscHtml(idOT) + "', '" + rotEscHtml(ot.placa) + "');"`;

content = content.replace(oldButton, newButton);

// 2. Change the html2pdf section to use window.print
const startHtml2Pdf = 'document.body.appendChild(container);';
const endHtml2Pdf = '});\n};';

const startIndex = content.indexOf(startHtml2Pdf);
const endIndex = content.indexOf(endHtml2Pdf, startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.error("html2pdf section not found");
    process.exit(1);
}

const replacement = `    var htmlBody = container.innerHTML;
    var finalHtml = '<!DOCTYPE html>\\n<html lang="es">\\n<head>\\n<meta charset="UTF-8">\\n<title>Orden de Trabajo</title>\\n'
                  + '<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap" rel="stylesheet">\\n'
                  + '<style>\\n'
                  + 'body { background-color: #e0e0e0; margin: 0; padding: 20px; display: flex; justify-content: center; }\\n'
                  + '#btnPrint { position: fixed; top: 20px; right: 20px; background-color: #000; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; z-index: 1000; font-family: Oswald, sans-serif; font-size: 14px; }\\n'
                  + '#btnPrint:hover { opacity: 0.9; }\\n'
                  + '@media print { body { background: none; padding: 0; margin: 0; display: block; } #btnPrint { display: none; } .page-container { margin: 0 !important; box-shadow: none !important; } }\\n'
                  + '</style>\\n</head>\\n<body>\\n'
                  + '<button id="btnPrint" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>\\n'
                  + htmlBody
                  + '\\n</body>\\n</html>';

    var win = window.open('', '_blank');
    win.document.open();
    win.document.write(finalHtml);
    win.document.close();
    win.onload = function() {
        setTimeout(function() {
            win.print();
        }, 500);
    };
};

window.rotGenerarPlantillaVaciaOT = function(idOt, placa) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando plantilla...', 'bg-info');
    window.generarPDF_OT({ id_ot: idOt, placa: placa }, [], []);
};`;

content = content.substring(0, startIndex) + replacement + content.substring(endIndex + endHtml2Pdf.length);

fs.writeFileSync(path, content, 'utf8');
console.log("Patched successfully");
