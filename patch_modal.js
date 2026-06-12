const fs = require('fs');
const path = 'modulos/mantenimiento/reportes-ot/logica.js';

let content = fs.readFileSync(path, 'utf8');

// 1. Add the column to rotRenderTabla
const trStart = "html += '<td style=\"font-size:0.78rem;color:var(--subtext);white-space:nowrap;\">' + rotFmtFecha(ot.fecha_ingreso || ot.creado_en) + '</td>';\\n        html += '</tr>';";
const trReplacement = `html += '<td style="font-size:0.78rem;color:var(--subtext);white-space:nowrap;">' + rotFmtFecha(ot.fecha_ingreso || ot.creado_en) + '</td>';\n        html += '<td style="text-align:center;"><button class="btn btn-sm" style="background:#f1f5f9;border:1px solid #e2e8f0;color:#3b82f6;border-radius:6px;padding:3px 8px;" onclick="event.stopPropagation(); window.rotVerFormatoOT(\\'' + rotEscHtml(String(idOT)) + '\\')"><i class="bi bi-eye-fill"></i></button></td>';\n        html += '</tr>';`;

if(content.includes("html += '<td style=\"font-size:0.78rem;color:var(--subtext);white-space:nowrap;\">' + rotFmtFecha(ot.fecha_ingreso || ot.creado_en) + '</td>';\n        html += '</tr>';")) {
    content = content.replace("html += '<td style=\"font-size:0.78rem;color:var(--subtext);white-space:nowrap;\">' + rotFmtFecha(ot.fecha_ingreso || ot.creado_en) + '</td>';\n        html += '</tr>';", trReplacement);
} else {
    // try looser matching
    content = content.replace(/html \+= '<td style="font-size:0\.78rem;color:var\(--subtext\);white-space:nowrap;">' \+ rotFmtFecha\(ot\.fecha_ingreso \|\| ot\.creado_en\) \+ '<\/td>';\s+html \+= '<\/tr>';/, trReplacement);
}

// 2. Add window.rotVerFormatoOT
const verFormatoFunc = `
window.rotVerFormatoOT = function(idOT) {
    if (typeof window.rotToast === 'function') window.rotToast('Cargando detalle de OT...', 'bg-info');
    
    // Fetch trabajos y materiales si no los tenemos
    Promise.all([
        fetch('/api/ot-trabajos?id_ot=' + encodeURIComponent(idOT)).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOT)).then(r => r.ok ? r.json() : []).catch(() => [])
    ]).then(function(res) {
        var trabajos = Array.isArray(res[0]) ? res[0] : [];
        var materiales = Array.isArray(res[1]) ? res[1] : [];
        var ot = window.rotData.find(function(o) { return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
        
        if (!ot) {
            alert('OT no encontrada.');
            return;
        }

        // Usamos un pequeño truco: llamamos a la misma función generarPDF_OT, pero sobreescribimos temporalmente window.open
        var originalOpen = window.open;
        var modalContentHtml = '';

        window.open = function() {
            return {
                document: {
                    open: function() {},
                    write: function(htmlStr) {
                        modalContentHtml = htmlStr;
                    },
                    close: function() {}
                },
                print: function() {},
                onload: null
            };
        };

        window.generarPDF_OT(ot, trabajos, materiales);
        
        // Restaurar window.open
        window.open = originalOpen;

        // Quitar el botón de imprimir del htmlStr porque aquí solo vamos a ver (y si queremos imprimir le ponemos un botón nativo del modal)
        modalContentHtml = modalContentHtml.replace('<button id="btnPrint" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>', '');

        // Mostrar en un modal con iframe
        if (!document.getElementById('modalFormatoOT')) {
            var m = document.createElement('div');
            m.innerHTML = '<div class="modal fade" id="modalFormatoOT" tabindex="-1" aria-hidden="true">'
                        + '  <div class="modal-dialog modal-xl modal-dialog-scrollable">'
                        + '    <div class="modal-content" style="height: 90vh;">'
                        + '      <div class="modal-header py-2" style="background:#f8fafc;">'
                        + '        <h5 class="modal-title fw-bold" style="font-size:15px; color:#1e293b;"><i class="bi bi-file-earmark-text text-primary"></i> Detalle de OT ' + rotEscHtml(idOT) + '</h5>'
                        + '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>'
                        + '      </div>'
                        + '      <div class="modal-body p-0" style="background:#e0e0e0; display:flex; justify-content:center;">'
                        + '         <iframe id="iframeFormatoOT" style="width:100%; height:100%; border:none;"></iframe>'
                        + '      </div>'
                        + '      <div class="modal-footer py-2" style="background:#f8fafc;">'
                        + '        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cerrar</button>'
                        + '        <button type="button" class="btn btn-sm btn-primary" onclick="window.generarPDF_OT(window.rotData.find(o=>String(o.ticket_entrada||o.id_ot)===String(\\'' + idOT + '\\')), ' + JSON.stringify(trabajos).replace(/"/g, '&quot;') + ', ' + JSON.stringify(materiales).replace(/"/g, '&quot;') + ')"><i class="bi bi-printer"></i> Imprimir</button>'
                        + '      </div>'
                        + '    </div>'
                        + '  </div>'
                        + '</div>';
            document.body.appendChild(m.firstChild);
        } else {
            // Actualizar título y botón imprimir
            var btnPrint = document.querySelector('#modalFormatoOT .btn-primary');
            if(btnPrint) {
                btnPrint.setAttribute('onclick', "window.generarPDF_OT(window.rotData.find(o=>String(o.ticket_entrada||o.id_ot)===String('" + idOT + "')), " + JSON.stringify(trabajos).replace(/"/g, '&quot;') + ", " + JSON.stringify(materiales).replace(/"/g, '&quot;') + ")");
            }
            var title = document.querySelector('#modalFormatoOT .modal-title');
            if(title) {
                title.innerHTML = '<i class="bi bi-file-earmark-text text-primary"></i> Detalle de OT ' + rotEscHtml(idOT);
            }
        }

        var myModal = new bootstrap.Modal(document.getElementById('modalFormatoOT'));
        myModal.show();

        setTimeout(function() {
            var iframe = document.getElementById('iframeFormatoOT');
            if (iframe) {
                iframe.srcdoc = modalContentHtml;
            }
        }, 100);

    });
};
`;

content += verFormatoFunc;

fs.writeFileSync(path, content, 'utf8');
console.log("Patched successfully!");
