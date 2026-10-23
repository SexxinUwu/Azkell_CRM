// @ts-nocheck
// Copias del clásico (modulos/mantenimiento/reportes-ot/logica.js): plantilla de inspecciones y plantilla de llantas.
// El diseño y el contenido no cambian. Solo cambia el final: devuelven el HTML y el servidor lo convierte a PDF.
import { rotEscHtml } from './otPdfClasico';

export function htmlPlantillaInspeccion(idOt, placa, fechaIng, km, rampa) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando plantilla...', 'bg-info');
    return fetch('/api/mantenimiento/inspecciones/config')
        .then(function(r) { return r.json(); })
        .then(function(res) {
            var schema = res.data ? res.data.map(function(d) {
                var parsed = [];
                try { parsed = typeof d.items_json === 'string' ? JSON.parse(d.items_json) : d.items_json; } catch(e){}
                return { tab: d.titulo, items: parsed };
            }) : [];
            
            var dtStr = '____/____/______';
            if (fechaIng) {
                var parts = fechaIng.split('T')[0].split('-');
                if(parts.length === 3) dtStr = parts[2] + '/' + parts[1] + '/' + parts[0];
            }
            var kmStr = km ? Number(km).toLocaleString('es-PE') : '________________';

            var tbody = '';
            var romanos = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV'];
            schema.forEach(function(sec, idxCat) {
                tbody += '<tr class="sec-row"><td colspan="3">' + (romanos[idxCat] || (idxCat+1)) + '. ' + sec.tab.toUpperCase() + '</td></tr>';
                if (sec.items) {
                    var itemsArr = Array.isArray(sec.items) ? sec.items : [];
                    itemsArr.forEach(function(item, idxItem) {
                        var lbl = typeof item === 'string' ? item : item.label;
                        tbody += '<tr>'
                               + '<td>' + (idxItem+1) + '. ' + rotEscHtml(lbl) + '</td>'
                               + '<td class="w-chk"><div class="sq sq-green"></div> &nbsp; <div class="sq sq-red"></div></td>'
                               + '<td></td>'
                               + '</tr>';
                    });
                }
            });

            var empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';
            var html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reporte Fallas Mecánicas</title>
    <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&display=swap" rel="stylesheet">
    <style>
        :root {
            --blue-header: #0053b3;
            --blue-num: #4a86e8;
            --chk-green: #00ff00;
            --chk-red: #ff0000;
        }
        * {
            font-family: 'Oswald', sans-serif !important;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body {
            background-color: #e0e0e0;
            margin: 0;
            padding: 20px;
        }
        #btnPrint {
            position: fixed; top: 20px; right: 20px;
            background-color: #000; color: #fff; border: none;
            padding: 8px 16px; border-radius: 4px;
            font-size: 14px;
            cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3); z-index: 1000;
        }
        #btnPrint:hover { opacity: 0.9; }
        .page-container {
            width: 210mm;
            height: 296mm;
            background: white;
            padding: 5mm 10mm;
            box-sizing: border-box;
            box-shadow: 0 0 15px rgba(0,0,0,0.2);
            position: relative;
            display: flex;
            flex-direction: column;
            margin: 0 auto;
        }
        .iso-header {
            width: 100%;
            border-collapse: collapse;
            border: 2px solid #000;
            margin-bottom: -2px;
            table-layout: fixed;
            flex-shrink: 0;
        }
        .iso-header td {
            border: 1px solid #000;
            text-align: center;
            vertical-align: middle;
        }
        .logo-cell { 
            width: 20%; 
            padding: 2px;
        }
        .title-cell { 
            width: 55%; 
            font-size: 24px;
            font-weight: bold; 
            line-height: 1; 
            text-transform: uppercase; 
            color: #000;
        }
        .sub-title { 
            font-size: 12px; 
            font-weight: normal; 
            color: #333; 
            letter-spacing: 1px;
        }
        .qms-item { 
            width: 25%; 
            font-size: 10px; 
            text-align: left !important; 
            padding: 1px 4px; 
            height: 16px; 
        }
        .data-grid {
            width: 100%;
            border-collapse: collapse;
            border: 2px solid #000;
            margin-bottom: 4px;
            table-layout: fixed;
            flex-shrink: 0;
        }
        .data-grid td {
            border: 1px solid #000;
            padding: 1px 4px;
            font-size: 11px;
            font-weight: bold;
            height: 20px;
            vertical-align: middle;
        }
        .col-left { width: 35%; }
        .col-mid { width: 35%; }
        .col-right { width: 30%; vertical-align: top !important; padding-top: 2px !important; }
        .val-normal { font-weight: normal; margin-left: 3px; }
        .val-blue { color: var(--blue-num); font-size: 13px; margin-left: 3px; }
        .table-wrapper {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            margin-bottom: 5px;
        }
        .checklist-table {
            width: 100%;
            flex-grow: 1;
            border-collapse: collapse;
            border: 2px solid #000;
            font-size: 9.5px;
        }
        .checklist-table th {
            background-color: var(--blue-header);
            color: white;
            text-transform: uppercase;
            padding: 2px;
            border: 1px solid #000;
            text-align: left;
        }
        .checklist-table th.th-center { text-align: center; }
        .checklist-table td {
            border: 1px solid #000;
            padding: 1px 3px;
            vertical-align: middle;
        }
        .sec-row td {
            background-color: #f2f2f2;
            font-weight: bold;
            border-top: 2px solid #000;
            padding: 1px 3px;
        }
        .w-crit { width: 45%; }
        .w-chk { width: 10%; text-align: center; padding: 0; }
        .w-obs { width: 45%; }
        .sq {
            display: inline-block;
            width: 9px; height: 9px;
            background: #fff; margin-top: 2px;
        }
        .sq-green { border: 2px solid var(--chk-green); }
        .sq-red { border: 2px solid var(--chk-red); }
        .footer {
            flex-shrink: 0;
            height: 45px;
            display: flex;
            justify-content: center;
            align-items: flex-end;
            padding: 0 10px;
        }
        .sign-box {
            width: 30%;
            text-align: center;
        }
        .sign-line {
            border-top: 2px solid #000;
            margin-bottom: 2px;
        }
        .sign-label {
            font-weight: bold;
            font-size: 11px;
        }
        @media print {
            @page { size: A4; margin: 0; }
            body { background: none; padding: 0; margin: 0; }
            #btnPrint { display: none; }
            .page-container { 
                width: 210mm; 
                height: 296mm; 
                padding: 5mm 10mm;
                box-shadow: none; 
                border: none; 
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <button id="btnPrint" onclick="window.print()">Print PDF</button>
    <div class="page-container">
        <table class="iso-header">
            <tr>
                <td class="logo-cell" rowspan="3">
                    <img src="${empLogoUrl}" alt="Logo Empresa" style="max-width: 100%; max-height: 45px; object-fit: contain;">
                </td>
                <td class="title-cell" rowspan="3">
                    INSPECCIÓN DE PRE USO DE UNIDAD<br>
                    <span class="sub-title">REPORTE DE FALLAS MECÁNICAS</span>
                </td>
                <td class="qms-item"><b>CÓDIGO:</b> F-MAN-003</td>
            </tr>
            <tr><td class="qms-item"><b>VERSIÓN:</b> 0</td></tr>
            <tr><td class="qms-item"><b>F. EMISIÓN:</b> 10/11/2025</td></tr>
        </table>
        <table class="data-grid">
            <tr>
                <td class="col-left">Nº de Reporte: <span class="val-blue">${rotEscHtml(idOt)}</span></td>
                <td class="col-mid">Placa: <span class="val-normal">${rotEscHtml(placa)}</span></td>
                <td class="col-right" rowspan="2">
                    Rampa:<br>
                    <span class="val-normal" style="display: block; margin-top: 1px; word-wrap: break-word;">${rotEscHtml(rampa || '')}</span>
                </td>
            </tr>
            <tr>
                <td>Fecha de Ingreso: <span class="val-normal">${rotEscHtml(dtStr)}</span></td>
                <td>Kilometraje: <span class="val-normal">${rotEscHtml(kmStr)}</span></td>
            </tr>
        </table>
        <div class="table-wrapper">
            <table class="checklist-table">
                <thead>
                    <tr>
                        <th class="w-crit">CRITERIOS</th>
                        <th class="w-chk th-center">ESTADO</th>
                        <th class="w-obs th-center">OBSERVACION</th>
                    </tr>
                </thead>
                <tbody>${tbody}</tbody>
            </table>
        </div>
        <div class="footer">
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Tecnico</div>
            </div>
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Jefe de taller</div>
            </div>
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Planner de Mantenimiento</div>
            </div>
        </div>
    </div>
</body>
</html>`;

            return html;
        });
}

export async function htmlPlantillaLlantas(idOt, otObj) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando Plantilla de Llantas A4...', 'bg-info');
    
    var ot = otObj || { id_ot: idOt, ticket_entrada: idOt, placa: '---' };

    var placa = (ot.placa || ot.placa_vehiculo || '---').toUpperCase().trim();
    var tipoOT = (ot.tipo_ot || ot.tipo || 'Preventivo').toUpperCase();
    var fechaInicio = ot.fecha_inicio_ot || ot.fecha_ingreso || ot.creado_en || new Date().toISOString().split('T')[0];
    try { fechaInicio = String(fechaInicio).split('T')[0]; } catch(e){}
    var detL = {};
    try { detL = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(e){}
    var rawKmL = detL.km_tablero || detL.km || ot.km_tablero || ot.km || ot.km_gps || '';
    var kmTablero = '---';
    if (rawKmL) {
        var nKmL = Number(String(rawKmL).replace(/[^0-9\.]/g, ''));
        kmTablero = (!isNaN(nKmL) && nKmL > 0) ? nKmL.toLocaleString('es-PE') + ' km' : String(rawKmL);
    }
    var rampa = detL.rampa_origen || detL.rampa || ot.txtRampa || ot.rampa || '---';

    // Obtener logo y datos de empresa
    var empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || '';
    var empNombre  = (localStorage.getItem('fleet_empresa_nombre') || 'EMPRESA').toUpperCase();

    var logoHtml = empLogoUrl 
        ? `<img src="${empLogoUrl}" style="max-height: 55px; max-width: 180px; object-fit: contain;">`
        : `<div class="company-name-text">${empNombre}</div>`;

    var renderFilaPosBlanco = function(posKey) {
        return `<tr>
            <td></td>
            <td class="pos-number">${posKey}</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td class="col-est-nueva option-text">Nueva</td>
            <td class="col-est-reen option-text">Reencauchada</td>
            <td></td>
            <td></td>
        </tr>`;
    };

    var posSec1 = ['1','2','3','4','5','6','7','8','9','10','11','12','R'];
    var posSec2 = ['1','2'];

    var htmlRows1 = posSec1.map(renderFilaPosBlanco).join('');
    var htmlRows2 = posSec2.map(renderFilaPosBlanco).join('');

    var fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Plantilla de Llantas - OT ${idOt}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
    * { box-sizing: border-box; }
    body {
        font-family: 'Oswald', sans-serif;
        font-size: 11px;
        margin: 0;
        padding: 15px;
        background-color: #e0e0e0;
        color: #000000;
    }
    .print-btn-container { text-align: center; margin-bottom: 12px; }
    .btn-print {
        background-color: #000000;
        color: #ffffff;
        border: none;
        padding: 10px 25px;
        font-family: 'Oswald', sans-serif;
        font-size: 14px;
        font-weight: 700;
        text-transform: uppercase;
        cursor: pointer;
        border-radius: 4px;
        letter-spacing: 1px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .btn-print:hover { opacity: 0.9; }
    .report-container {
        width: 100%;
        max-width: 1120px;
        margin: 0 auto;
        border: 2px solid #000000;
        background-color: #fff;
        padding: 12px;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; color: #000000; }
    
    /* CABECERA CON LOGO EMPRESA Y RECUADRO DE CÓDIGO A LA ESQUINA */
    .header-table { width: 100%; border-collapse: collapse; border: 2px solid #000000; margin-bottom: 8px; }
    .header-table td { border: 1px solid #000000; padding: 4px; vertical-align: middle; }
    .logo-cell { width: 220px; text-align: center; border-right: 1px solid #000000; }
    .company-name-text { font-family: 'Inter', sans-serif; font-weight: 800; font-size: 22px; color: #000000; text-transform: uppercase; }
    .title-cell { text-align: center; border-right: 1px solid #000000; }
    .main-title { font-weight: 700; font-size: 22px; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.1; }
    
    .qms-box-cell { width: 180px; padding: 0 !important; border: none !important; }
    .qms-subtable { width: 100%; border-collapse: collapse; font-family: 'Oswald', sans-serif; font-size: 10px; }
    .qms-subtable td { border-bottom: 1px solid #000000; padding: 2px 6px !important; text-align: left; height: 18px; }
    .qms-subtable tr:last-child td { border-bottom: none; }
    
    /* CUADRO INFO VEHÍCULO (SEGUNDA IMAGEN MARSISA) */
    .info-section-table { width: 100%; margin: 6px 0 10px 0; border-collapse: collapse; }
    .info-section-table td { vertical-align: middle; padding: 0; }
    .vehicle-box {
        border: 2px solid #000000;
        padding: 6px 10px;
        width: 640px;
        font-family: 'Oswald', sans-serif;
        font-size: 11px;
        line-height: 1.4;
    }
    .v-row { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 2px; }
    .v-row:last-child { margin-bottom: 0; }
    .v-label { font-weight: 700; text-transform: uppercase; }
    .v-val { font-weight: 400; font-family: 'Inter', sans-serif; }
    .chk-box { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 10px; }
    .chk-sq { width: 12px; height: 12px; border: 1px solid #000; display: inline-block; }

    .rampa-cell { text-align: right; vertical-align: middle !important; padding-right: 20px; }
    .rampa-label { font-size: 24px; font-weight: 700; }
    .rampa-value { font-size: 24px; font-weight: 400; margin-left: 8px; }

    /* GRILLA 100% BLANCA DE LLANTAS */
    .grid-table th, .grid-table td {
        border: 1px solid #000000;
        text-align: center;
        padding: 1px 2px;
        font-size: 11px;
        height: 19px;
        overflow: hidden;
        white-space: nowrap;
        vertical-align: middle;
        font-weight: 300;
        line-height: 1.1;
        color: #000000;
    }
    .grid-table th {
        font-weight: 500;
        background-color: #ffffff;
        text-transform: uppercase;
        height: 26px;
        white-space: normal;
        font-size: 10px;
        color: #000000;
    }
    .col-idx { width: 30px; }
    .col-pos { width: 40px; }
    .col-data-main { width: 95px; }
    .col-r { width: 18px; }
    .col-presion { width: 80px; }
    .col-est-nueva { width: 45px; }
    .col-est-reen { width: 65px; }
    .col-accion { width: 60px; }
    .col-obs { width: auto; }
    .option-text { font-size: 9px; font-weight: 500; }
    .pos-number { font-weight: 700; font-size: 12px; }
    .border-top-thick { border-top: 2px solid #000000; }
    .spacer { height: 8px; border-left: 2px solid #000000; border-right: 2px solid #000000; }
    
    .obs-container { padding: 6px 0 4px 0; font-size: 11px; }
    .obs-label { font-weight: 700; margin-bottom: 2px; display: block; }
    .obs-box { width: 100%; min-height: 55px; border: 2px solid #000000; }

    .signature-table { width: 100%; margin-top: 10px; font-family: 'Inter', sans-serif; font-size: 9.5px; }
    .signature-table td { text-align: center; vertical-align: bottom; height: 40px; }
    .signature-line { border-top: 1px solid #000; margin: 0 25px; padding-top: 3px; font-weight: 600; text-transform: uppercase; }

    @media print {
        @page { size: A4 landscape; margin: 4mm; }
        body { margin: 0; padding: 0; background-color: #fff; color: #000; }
        .print-btn-container { display: none !important; }
        .report-container { width: 100%; max-width: none; border: 2px solid #000; margin: 0; }
        .grid-table td { height: 19px !important; }
        .grid-table th { height: 26px !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: #000 !important; border-color: #000 !important; }
    }
</style>
</head>
<body>
    <div class="print-btn-container">
        <button class="btn-print" onclick="window.print()">🖨️ Imprimir Plantilla de Llantas (A4 Landscape)</button>
    </div>
    <div class="report-container">
        <table class="header-table">
            <tr>
                <td class="logo-cell" rowspan="3">
                    ${logoHtml}
                </td>
                <td class="title-cell" rowspan="3">
                    <div class="main-title">INSPECCIÓN DE NEUMÁTICOS</div>
                </td>
                <td class="qms-box-cell" style="border-bottom: 1px solid #000;">
                    <div style="padding: 2px 6px;"><b>CÓDIGO:</b> F-MAN-002</div>
                </td>
            </tr>
            <tr>
                <td class="qms-box-cell" style="border-bottom: 1px solid #000;">
                    <div style="padding: 2px 6px;"><b>VERSIÓN:</b> 0</div>
                </td>
            </tr>
            <tr>
                <td class="qms-box-cell">
                    <div style="padding: 2px 6px;"><b>F. EMISIÓN:</b> 10/11/2025</div>
                </td>
            </tr>
        </table>

        <table class="info-section-table">
            <tr>
                <td>
                    <div class="vehicle-box">
                        <div class="v-row">
                            <div><span class="v-label">FECHA:</span> <span class="v-val">${fechaInicio}</span></div>
                            <div><span class="v-label">PLACAS:</span> <span class="v-val" style="font-weight:700;">${placa}</span></div>
                            <div><span class="v-label">KILOMETRAJE:</span> <span class="v-val">${kmTablero}</span></div>
                            <div><span class="v-label">OT Nº:</span> <span class="v-val" style="font-weight:700;">${idOt}</span></div>
                        </div>
                        <div class="v-row">
                            <div><span class="v-label">TIPO OT:</span> <span class="v-val">${tipoOT}</span></div>
                            <div class="chk-box"><span class="chk-sq"></span> DUAL</div>
                            <div class="chk-box"><span class="chk-sq"></span> BALÓN</div>
                            <div class="chk-box"><span class="chk-sq"></span> VISUALIZACIÓN DE ZAPATAS</div>
                        </div>
                    </div>
                </td>
                <td class="rampa-cell">
                    <span class="rampa-label">RAMPA:</span>
                    <span class="rampa-value">${rampa}</span>
                </td>
            </tr>
        </table>

        <table class="grid-table border-top-thick">
            <thead>
                <tr>
                    <th class="col-idx">I.</th>
                    <th class="col-pos">Posición</th>
                    <th class="col-data-main">Marca</th>
                    <th class="col-data-main">Medida</th>
                    <th class="col-data-main">Modelo</th>
                    <th class="col-r">R1</th>
                    <th class="col-r">R2</th>
                    <th class="col-r">R3</th>
                    <th class="col-presion">Presión Aire<br>Encontrada</th>
                    <th class="col-presion">Presión Aire<br>Actual</th>
                    <th colspan="2" style="width: 110px;">Estado</th>
                    <th class="col-accion">Acción</th>
                    <th class="col-obs">Observación</th>
                </tr>
            </thead>
            <tbody>
                ${htmlRows1}
            </tbody>
        </table>

        <div class="spacer"></div>

        <table class="grid-table border-top-thick">
            <thead>
                <tr>
                    <th class="col-idx">II.</th>
                    <th class="col-pos">Posición</th>
                    <th class="col-data-main">Marca</th>
                    <th class="col-data-main">Medida</th>
                    <th class="col-data-main">Modelo</th>
                    <th class="col-r">R1</th>
                    <th class="col-r">R2</th>
                    <th class="col-r">R3</th>
                    <th class="col-presion">Presión Aire<br>Encontrada</th>
                    <th class="col-presion">Presión Aire<br>Actual</th>
                    <th colspan="2" style="width: 110px;">Estado</th>
                    <th class="col-accion">Acción</th>
                    <th class="col-obs">Observación</th>
                </tr>
            </thead>
            <tbody>
                ${htmlRows2}
            </tbody>
        </table>

        <div class="obs-container">
            <span class="obs-label">Observaciones :</span>
            <div class="obs-box"></div>
        </div>

        <table class="signature-table">
            <tr>
                <td><div class="signature-line">FIRMA TÉCNICO RAMPA</div></td>
                <td><div class="signature-line">FIRMA INSPECTOR DE FLOTA</div></td>
                <td><div class="signature-line">SUPERVISOR DE MANTENIMIENTO</div></td>
            </tr>
        </table>
    </div>
</body>
</html>`;

    return fullHtml;
};
