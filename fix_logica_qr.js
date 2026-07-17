const fs = require('fs');
let c = fs.readFileSync('modulos/mantenimiento/reportes-ot/logica.js', 'utf8');

c = c.replace(/('<td>' \+\r?\n\s+')<input type="text" class="form-control form-control-sm rot-mat-item-desc" list="rot-mat-inv-list" placeholder="[^"]+" data-idx="' \+ idx \+ '" oninput="window\._rotBuscarArtMat\(this,' \+ idx \+ '\)">' \+\r?\n\s+'<input type="hidden" class="rot-mat-item-inv-id" data-idx="' \+ idx \+ '">/g, 
  `$1<div style="display:flex;gap:4px;align-items:center;">' +
                '<input type="text" class="form-control form-control-sm rot-mat-item-desc" list="rot-mat-inv-list" placeholder="Artículo…" data-idx="' + idx + '" oninput="window._rotBuscarArtMat(this,' + idx + ')">' +
                '<button type="button" class="btn btn-sm btn-outline-secondary" style="flex-shrink:0;padding:2px 7px;" ' +
                    'onclick="window._rotAbrirQR(' + idx + ')" title="Escanear código de barras">' +
                    '<i class="bi bi-upc-scan"></i>' +
                '</button>' +
            '</div>' +
            '<input type="hidden" class="rot-mat-item-inv-id" data-idx="' + idx + '">`);

fs.writeFileSync('modulos/mantenimiento/reportes-ot/logica.js', c);
console.log("Done");
