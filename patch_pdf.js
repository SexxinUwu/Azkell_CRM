const fs = require('fs');
const path = 'modulos/mantenimiento/reportes-ot/logica.js';

let content = fs.readFileSync(path, 'utf8');

const startMarker = 'window.generarPDF_OT = function(ot, trabajos, materiales) {';
const endMarker = "doc.save('OT_' + idOt + '.pdf');";

const startIndex = content.indexOf(startMarker);
const endMarkerIndex = content.indexOf(endMarker, startIndex);
const endIndex = content.indexOf('};', endMarkerIndex) + 2;

if (startIndex === -1 || endMarkerIndex === -1 || endIndex === -1) {
    console.error("Markers not found");
    process.exit(1);
}

const newFunction = `window.generarPDF_OT = function(ot, trabajos, materiales) {
    if (typeof window.html2pdf !== 'function') {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Librería html2pdf no cargada.', 'danger');
        return;
    }

    var det = {};
    try { det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(e) {}

    var numOT = ot.id_ot || ot.ticket_entrada || '';
    var numPart = numOT, anioPart = '';
    if (numOT.includes('-')) {
        var parts = numOT.split('-');
        if (parts.length >= 3) {
            anioPart = parts[1];
            numPart = parts[2];
        } else {
            numPart = numOT;
        }
    }

    var pMarca = det.marca || '';
    var pCliente = det.cliente || ot.cliente || '';
    if (window.dataGlobalPlacas && ot.placa) {
        var pData = window.dataGlobalPlacas.find(function(p) { return p[0] === ot.placa; });
        if (pData) {
            if (!pCliente) pCliente = pData[1];
            if (!pMarca) pMarca = pData[3];
        }
    }

    function formatDT(iso) {
        if (!iso) return { d: '—', h: '—' };
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return { d: '—', h: '—' };
            var dd = String(d.getDate()).padStart(2,'0');
            var mm = String(d.getMonth()+1).padStart(2,'0');
            var yy = d.getFullYear();
            var hh = String(d.getHours()).padStart(2,'0');
            var min = String(d.getMinutes()).padStart(2,'0');
            return { d: dd+'/'+mm+'/'+yy, h: hh+':'+min };
        } catch(e) { return { d: '—', h: '—' }; }
    }

    var iniDT = formatDT(ot.fecha_ingreso || ot.fecha_inicio_ot);
    var finDT = formatDT(ot.fecha_hora_salida);

    var htmlMotivos = '';
    if (det.motivo) {
        htmlMotivos = '<tr><td class="text-center">1</td><td>' + rotEscHtml(det.motivo) + '</td><td class="text-center">' + rotEscHtml(det.supervisor || '—') + '</td></tr>';
    } else {
        htmlMotivos = '<tr><td colspan="3" class="text-center" style="color:#888; font-style: italic; padding: 4px;">No hay motivos de ingreso registrados.</td></tr>';
    }

    var htmlTrabajos = '';
    var trbArr = trabajos || [];
    for (var i=0; i<10; i++) {
        if (i < trbArr.length) {
            var t = trbArr[i];
            var det2 = {};
            try { det2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
            
            var tIni = formatDT(t.fecha_inicio || t.fecha || t.fecha_creacion);
            var tFin = formatDT(t.fecha_fin || t.fecha_cierre);
            var tIniStr = (tIni.d !== '—') ? tIni.d + ' ' + tIni.h : '—';
            var tFinStr = (tFin.d !== '—') ? tFin.d + ' ' + tFin.h : '—';
            
            htmlTrabajos += '<tr>'
                + '<td class="text-center">' + (i+1) + '</td>'
                + '<td class="text-center">' + tIniStr + '</td>'
                + '<td>' + rotEscHtml(t.trabajo_realizado || '—') + '</td>'
                + '<td class="text-center">' + rotEscHtml(det2.personal || t.tecnico || '—') + '</td>'
                + '<td class="text-center">' + tFinStr + '</td>'
                + '</tr>';
        } else {
            htmlTrabajos += '<tr><td class="text-center">' + (i+1) + '</td><td></td><td></td><td></td><td></td></tr>';
        }
    }

    var htmlBacklog = '<tr><td colspan="3" class="text-center" style="color:#888; font-style: italic; padding: 4px;">No hay mantenimientos pendientes reportados.</td></tr>';

    var container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    
    container.innerHTML = \`
    <div class="page-container" style="width: 210mm; min-height: 296mm; background: white; padding: 6mm 10mm; box-sizing: border-box; position: relative; display: flex; flex-direction: column; overflow: hidden; font-family: 'Oswald', sans-serif; color: #000;">
        <style>
            .page-container * { font-family: 'Oswald', sans-serif !important; box-sizing: border-box; }
            .iso-header { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 4px; table-layout: fixed; flex-shrink: 0; }
            .iso-header td { border: 1px solid #000; text-align: center; vertical-align: middle; }
            .logo-cell { width: 20%; padding: 2px; }
            .title-cell { width: 55%; font-size: 24px; font-weight: bold; line-height: 1; text-transform: uppercase; color: #000; }
            .sub-title { font-size: 12px; font-weight: normal; color: #333; letter-spacing: 1px; }
            .qms-item { width: 25%; font-size: 10px; text-align: left !important; padding: 1px 5px; height: 16px; }
            
            .data-grid { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 5px; table-layout: fixed; flex-shrink: 0; }
            .data-grid td { border: 1px solid #000; padding: 1px 4px; font-size: 11px; font-weight: bold; height: 20px; vertical-align: middle; }
            .val-normal { font-weight: normal; margin-left: 4px; }
            .val-blue { color: #1e60bf; font-size: 14px; margin-left: 4px; }
            
            .aviso { background-color: #f2f2f2; padding: 3px 8px; font-size: 11px; font-weight: bold; text-align: center; border: 2px solid #000; margin-bottom: 5px; flex-shrink: 0; }
            .aviso span { color: #cc2222; font-size: 13px; margin-left: 5px; }
            
            .section-title { background: #444444; color: #fff; font-weight: 700; font-size: 11px; letter-spacing: .5px; padding: 2px 8px; text-align: center; text-transform: uppercase; border: 2px solid #000; border-bottom: none; flex-shrink: 0; margin: 0; }
            
            .content-table { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 5px; table-layout: fixed; font-size: 10px; flex-shrink: 0; }
            .content-table th { background-color: #444444; color: white; text-align: left; padding: 2px 4px; border: 1px solid #000; }
            .content-table td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; word-break: break-word; }
            .text-center { text-align: center !important; }
            .trabajos-table td { height: 20px; }
            
            .observaciones-box { flex-grow: 1; border: 2px solid #000; margin-bottom: 15px; padding: 5px; min-height: 40px; }
            
            .footer { flex-shrink: 0; height: 90px; display: flex; justify-content: space-between; align-items: flex-end; padding: 0 10px 10px 10px; }
            .sign-box { width: 30%; text-align: center; padding-top: 60px; }
            .sign-line { border-top: 2px solid #000; margin-bottom: 3px; }
            .sign-label { font-weight: bold; font-size: 11px; }
        </style>

        <table class="iso-header">
            <tr>
                <td class="logo-cell" rowspan="3">
                    <img src="https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500" alt="Logo Empresa" style="max-width: 100%; max-height: 45px; object-fit: contain;">
                </td>
                <td class="title-cell" rowspan="3">
                    ORDEN DE TRABAJO<br>
                    <span class="sub-title">MANTENIMIENTO MECÁNICO</span>
                </td>
                <td class="qms-item"><b>CÓDIGO:</b> F-MAN-002</td>
            </tr>
            <tr><td class="qms-item"><b>VERSIÓN:</b> 0</td></tr>
            <tr><td class="qms-item"><b>F. EMISIÓN:</b> 10/11/2025</td></tr>
        </table>

        <table class="data-grid">
            <tr>
                <td style="width: 33%;">Nº OT: <span class="val-blue">\${numPart}\${anioPart ? '-' + anioPart : ''}</span></td>
                <td style="width: 33%;">Placa: <span class="val-normal">\${rotEscHtml(ot.placa || '—')}</span></td>
                <td style="width: 34%;">Marca: <span class="val-normal">\${rotEscHtml(pMarca || '—')}</span></td>
            </tr>
            <tr>
                <td>Cliente: <span class="val-normal">\${rotEscHtml(pCliente || '—')}</span></td>
                <td>Kms GPS: <span class="val-normal">\${rotEscHtml(det.km_gps || '—')}</span></td>
                <td>Kms Tablero: <span class="val-normal">\${rotEscHtml(det.km || '—')}</span></td>
            </tr>
            <tr>
                <td>Tipo OT: <span class="val-normal">\${rotEscHtml(det.tipo_ot || '—')}</span></td>
                <td>Sub Tipo: <span class="val-normal">\${rotEscHtml(det.sub_tipo || '—')}</span></td>
                <td>Rampa: <span class="val-normal">\${rotEscHtml(det.rampa_origen || '—')}</span></td>
            </tr>
            <tr>
                <td colspan="2">Inicio: <span class="val-normal">\${iniDT.d} &nbsp;&nbsp;|&nbsp;&nbsp; Hora: \${iniDT.h}</span></td>
                <td>Término: <span class="val-normal">\${finDT.d} &nbsp;&nbsp;|&nbsp;&nbsp; Hora: \${finDT.h}</span></td>
            </tr>
        </table>

        <div class="aviso">
            Se le informa que la unidad ingresó a mantenimiento para el siguiente servicio. PLACA: <span>\${rotEscHtml(ot.placa || '—')}</span>
        </div>

        <div class="section-title">Motivo de ingreso</div>
        <table class="content-table">
            <thead>
                <tr>
                    <th style="width: 30px;" class="text-center">#</th>
                    <th>Lista de motivos</th>
                    <th style="width: 120px;" class="text-center">Técnico</th>
                </tr>
            </thead>
            <tbody>
                \${htmlMotivos}
            </tbody>
        </table>

        <div class="section-title">Backlog</div>
        <table class="content-table">
            <thead>
                <tr>
                    <th style="width: 30px;" class="text-center">#</th>
                    <th>Lista de mantenimientos pendientes</th>
                    <th style="width: 60px;" class="text-center">Check</th>
                </tr>
            </thead>
            <tbody>
                \${htmlBacklog}
            </tbody>
        </table>

        <div class="section-title">Trabajos a realizar</div>
        <table class="content-table trabajos-table">
            <thead>
                <tr>
                    <th style="width: 30px;" class="text-center">#</th>
                    <th style="width: 100px;" class="text-center">Fecha/Hora inicio</th>
                    <th>Trabajo a realizar</th>
                    <th style="width: 80px;" class="text-center">Técnico</th>
                    <th style="width: 100px;" class="text-center">Fecha/Hora término</th>
                </tr>
            </thead>
            <tbody>
                \${htmlTrabajos}
            </tbody>
        </table>

        <div class="section-title">Observaciones</div>
        <div class="observaciones-box"></div>
        
        <div class="footer">
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Jefe de Taller</div>
            </div>
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Operaciones</div>
            </div>
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Planner de Mantenimiento</div>
            </div>
        </div>
    </div>\`;

    document.body.appendChild(container);

    html2pdf().set({
        margin: 0,
        filename: 'OT_' + numOT + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container.children[0]).save().then(function() {
        setTimeout(function(){ container.remove(); }, 1000);
    });
};`;

content = content.substring(0, startIndex) + newFunction + content.substring(endIndex);
fs.writeFileSync(path, content, 'utf8');
console.log("Patched successfully");
