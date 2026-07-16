const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let code = fs.readFileSync(path, 'utf8');

// Unhide buttons
code = code.replace(
    /'<button class="btn btn-xs btn-outline-primary" onclick="event.stopPropagation\(\); window.generarComprobanteEntrada\('\\'' \+ _entEsc\(d.id\) \+ '\\'\)'" title="PDF" style="display:none;"><i class="bi bi-file-earmark-pdf"><\/i><\/button>' \+/g,
    '\'<button class="btn btn-xs btn-outline-primary" onclick="event.stopPropagation(); window.generarComprobanteEntrada(\\\'\' + _entEsc(d.id) + \'\\\')" title="Ver PDF"><i class="bi bi-eye"></i></button>\' +'
);

code = code.replace(
    /'<button class="btn btn-sm btn-outline-primary flex-fill" onclick="window.generarComprobanteEntrada\('\\'' \+ _entEsc\(id\) \+ '\\'\)'" style="display:none;">' \+\s*'<i class="bi bi-file-earmark-pdf me-1"><\/i>PDF<\/button>' \+/g,
    '\'<button class="btn btn-sm btn-outline-primary flex-fill" onclick="window.generarComprobanteEntrada(\\\'\' + _entEsc(id) + \'\\\')">\' +\n            \'<i class="bi bi-eye me-1"></i>Ver PDF</button>\' +'
);

const htmlBuilder = `
window._entGenerarHtmlPDF = function(d) {
    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '-';
    var totalPen = parseFloat(d.total_pen || 0);
    var monSimbolo = d.moneda === 'USD' ? 'USD' : 'PEN';

    function numeroALetras(num) {
        var data = { enteros: Math.floor(num), centavos: Math.round(num * 100) - Math.floor(num) * 100 };
        function Unidades(num){ switch(num) { case 1: return 'UN'; case 2: return 'DOS'; case 3: return 'TRES'; case 4: return 'CUATRO'; case 5: return 'CINCO'; case 6: return 'SEIS'; case 7: return 'SIETE'; case 8: return 'OCHO'; case 9: return 'NUEVE'; } return ''; }
        function Decenas(num){ var decena = Math.floor(num/10); var unidad = num - (decena * 10); switch(decena) { case 1: switch(unidad) { case 0: return 'DIEZ'; case 1: return 'ONCE'; case 2: return 'DOCE'; case 3: return 'TRECE'; case 4: return 'CATORCE'; case 5: return 'QUINCE'; default: return 'DIECI' + Unidades(unidad); } case 2: switch(unidad) { case 0: return 'VEINTE'; default: return 'VEINTI' + Unidades(unidad); } case 3: return DecenasY('TREINTA', unidad); case 4: return DecenasY('CUARENTA', unidad); case 5: return DecenasY('CINCUENTA', unidad); case 6: return DecenasY('SESENTA', unidad); case 7: return DecenasY('SETENTA', unidad); case 8: return DecenasY('OCHENTA', unidad); case 9: return DecenasY('NOVENTA', unidad); case 0: return Unidades(unidad); } return Unidades(num); }
        function DecenasY(strSin, numUnidades) { if (numUnidades > 0) return strSin + ' Y ' + Unidades(numUnidades); return strSin; }
        function Centenas(num) { var centenas = Math.floor(num / 100); var decenas = num - (centenas * 100); switch(centenas){ case 1: if (decenas > 0) return 'CIENTO ' + Decenas(decenas); return 'CIEN'; case 2: return 'DOSCIENTOS ' + Decenas(decenas); case 3: return 'TRESCIENTOS ' + Decenas(decenas); case 4: return 'CUATROCIENTOS ' + Decenas(decenas); case 5: return 'QUINIENTOS ' + Decenas(decenas); case 6: return 'SEISCIENTOS ' + Decenas(decenas); case 7: return 'SETECIENTOS ' + Decenas(decenas); case 8: return 'OCHOCIENTOS ' + Decenas(decenas); case 9: return 'NOVECIENTOS ' + Decenas(decenas); } return Decenas(decenas); }
        function Seccion(num, divisor, strSingular, strPlural) { var cientos = Math.floor(num / divisor); var resto = num - (cientos * divisor); var letras = ''; if (cientos > 0) if (cientos > 1) letras = Centenas(cientos) + ' ' + strPlural; else letras = strSingular; if (resto > 0) letras += ''; return letras; }
        function Miles(num) { var divisor = 1000; var cientos = Math.floor(num / divisor); var resto = num - (cientos * divisor); var strMiles = Seccion(num, divisor, 'UN MIL', 'MIL'); var strCentenas = Centenas(resto); if(strMiles == '') return strCentenas; return strMiles + ' ' + strCentenas; }
        function Millones(num) { var divisor = 1000000; var cientos = Math.floor(num / divisor); var resto = num - (cientos * divisor); var strMillones = Seccion(num, divisor, 'UN MILLON', 'MILLONES'); var strMiles = Miles(resto); if(strMillones == '') return strMiles; return strMillones + ' ' + strMiles; }
        if(data.enteros == 0) return 'CERO CON ' + (data.centavos<10?'0':'') + data.centavos + '/100'; return Millones(data.enteros) + ' CON ' + (data.centavos<10?'0':'') + data.centavos + '/100';
    }

    var itemsHTML = (d.items || []).map(function(it, i) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || cant * cu || 0);
        return '<tr>' +
            '<td style="padding:10px 5px;text-align:center;">' + cant.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</td>' +
            '<td style="padding:10px 5px;text-transform:uppercase;">' + (it.descripcion || it.inventario_id || '-') + '</td>' +
            '<td style="padding:10px 5px;text-align:center;">GENERICO</td>' +
            '<td style="padding:10px 5px;text-align:right;">' + cu.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</td>' +
            '<td style="padding:10px 5px;text-align:right;">' + imp.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
        '</tr>';
    }).join('');

    var txtMoneda = monSimbolo === 'USD' ? 'DÓLARES' : 'SOLES';
    var txtMonedaS = monSimbolo === 'USD' ? 'US$' : 'S/';
    var totalText = totalPen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});

    var condPagoText = (d.condicion_pago || 'AL CONTADO').toUpperCase();
    if (d.condicion_pago && d.condicion_pago.toLowerCase() === 'a cr\u00e9dito') {
        condPagoText = 'CRÉDITO / ' + (d.dias_credito||0) + ' DIAS';
    }

    return '' +
    '<div style="font-family:Arial,sans-serif;width:750px;margin:0 auto;padding:40px;color:#333;box-sizing:border-box;">' +

        '<!-- HEADER -->' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:30px;">' +
            '<div style="width:50%;">' +
                '<div style="font-size:32px;font-weight:900;color:#0f172a;letter-spacing:-1px;line-height:1;">' +
                    'AZKELL <span style="color:#16a34a;">FLEET</span>' +
                '</div>' +
                '<div style="font-size:14px;font-weight:bold;margin-top:8px;color:#0f172a;">AZKELL S.A.C.</div>' +
                '<div style="font-size:10px;color:#555;margin-top:4px;">' +
                    'AV. PRINCIPAL LOTE 10, LIMA<br>' +
                    'sistemas@azkell.com' +
                '</div>' +
            '</div>' +
            '<div style="width:230px;border:1px solid #e2e8f0;border-radius:6px;text-align:center;padding:15px;background:#f8fafc;">' +
                '<div style="font-size:14px;font-weight:bold;color:#0ea5e9;">RUC: 20601234567</div>' +
                '<div style="font-size:16px;font-weight:bold;margin:8px 0;text-transform:uppercase;color:#0f172a;">ORDEN DE COMPRA</div>' +
                '<div style="font-size:14px;font-weight:bold;color:#0f172a;">' + d.id + '</div>' +
            '</div>' +
        '</div>' +

        '<!-- DETAILS -->' +
        '<div style="display:flex;gap:20px;margin-bottom:20px;">' +
            '<div style="flex:1;background:#f1f5f9;border-radius:8px;padding:15px;font-size:11px;">' +
                '<div style="font-weight:bold;font-size:12px;margin-bottom:15px;color:#0f172a;">Datos del Solicitante</div>' +
                '<div style="font-weight:bold;font-size:13px;text-transform:uppercase;margin-bottom:15px;color:#0f172a;">' + (d.creado_por || '-') + '</div>' +
                '<table style="width:100%;font-size:11px;color:#334155;border-collapse:collapse;">' +
                    '<tr><td style="padding:6px 0;width:80px;">Tipo</td><td style="padding:6px 0;text-transform:uppercase;">' + (d.tipo_orden || 'ORDEN DE COMPRA') + '</td></tr>' +
                    '<tr><td style="padding:6px 0;border-top:1px solid #e2e8f0;">Motivo</td><td style="padding:6px 0;border-top:1px solid #e2e8f0;text-transform:uppercase;">' + (d.motivo_entrada || '-') + '</td></tr>' +
                    '<tr><td style="padding:6px 0;border-top:1px solid #e2e8f0;">Proveedor</td><td style="padding:6px 0;border-top:1px solid #e2e8f0;text-transform:uppercase;">' + (d.proveedor_nombre || '-') + '</td></tr>' +
                    '<tr><td style="padding:6px 0;border-top:1px solid #e2e8f0;">Vehículo</td><td style="padding:6px 0;border-top:1px solid #e2e8f0;text-transform:uppercase;">' + (d.placa || '-') + '</td></tr>' +
                '</table>' +
            '</div>' +

            '<div style="width:230px;background:#f1f5f9;border-radius:8px;padding:15px;font-size:11px;color:#334155;">' +
                '<table style="width:100%;border-collapse:collapse;">' +
                    '<tr><td style="padding:6px 0;">Fecha</td><td style="padding:6px 0;text-align:right;">' + fecha.split('-').reverse().join('/') + '</td></tr>' +
                    '<tr><td style="padding:6px 0;border-top:1px solid #e2e8f0;">Moneda</td><td style="padding:6px 0;border-top:1px solid #e2e8f0;text-align:right;text-transform:uppercase;">' + txtMoneda + '</td></tr>' +
                    '<tr><td style="padding:6px 0;border-top:1px solid #e2e8f0;">Tipo Cambio</td><td style="padding:6px 0;border-top:1px solid #e2e8f0;text-align:right;">' + (d.moneda === 'USD' ? parseFloat(d.tipo_cambio || 3.4).toFixed(4) : '-') + '</td></tr>' +
                    '<tr><td style="padding:6px 0;border-top:1px solid #e2e8f0;">Condición<br>de Pago</td><td style="padding:6px 0;border-top:1px solid #e2e8f0;text-align:right;text-transform:uppercase;">' + condPagoText + '</td></tr>' +
                '</table>' +
            '</div>' +
        '</div>' +

        '<!-- TABLE -->' +
        '<div style="background:#f1f5f9;border-radius:8px;padding:15px;margin-bottom:20px;">' +
            '<table style="width:100%;font-size:11px;border-collapse:collapse;color:#334155;">' +
                '<thead>' +
                    '<tr>' +
                        '<th style="padding-bottom:10px;text-align:center;border-bottom:1px solid #cbd5e1;width:50px;color:#0f172a;">Cant.</th>' +
                        '<th style="padding-bottom:10px;text-align:left;border-bottom:1px solid #cbd5e1;color:#0f172a;">Descripción</th>' +
                        '<th style="padding-bottom:10px;text-align:center;border-bottom:1px solid #cbd5e1;width:80px;color:#0f172a;">Marca</th>' +
                        '<th style="padding-bottom:10px;text-align:right;border-bottom:1px solid #cbd5e1;width:80px;color:#0f172a;">P.U.</th>' +
                        '<th style="padding-bottom:10px;text-align:right;border-bottom:1px solid #cbd5e1;width:90px;color:#0f172a;">Importe</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody>' +
                    itemsHTML +
                '</tbody>' +
            '</table>' +
            '<div style="text-align:right;padding-top:15px;font-size:14px;color:#0f172a;border-top:1px solid #cbd5e1;margin-top:5px;">' +
                '<b>TOTAL: &nbsp;&nbsp;&nbsp; ' + txtMonedaS + ' ' + totalText + '</b>' +
            '</div>' +
            '<div style="text-align:center;margin-top:20px;font-size:11px;color:#334155;">' +
                '<b>Importe en letras:</b> ' + numeroALetras(totalPen) + ' ' + txtMoneda +
            '</div>' +
        '</div>' +

        '<!-- OBSERVACIONES -->' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;font-size:10px;color:#334155;">' +
            '<b>Observación:</b> ' + (d.observaciones || 'NINGUNA') +
        '</div>' +

    '</div>';
};

window.generarComprobanteEntrada = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }

    var html = window._entGenerarHtmlPDF(d);

    var opt = {
        margin: [8, 8, 8, 8],
        filename: 'Orden_de_Compra_' + id + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:750px';
    document.body.appendChild(wrapper);

    html2pdf().set(opt).from(wrapper.firstChild).save().then(function() {
        document.body.removeChild(wrapper);
    });
};

window.previsualizarComprobanteEntrada = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }

    var html = window._entGenerarHtmlPDF(d);

    var opt = { margin:[8,8,8,8], filename:'Orden_de_Compra_'+id+'.pdf',
        image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2,useCORS:true},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} };

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:750px';
    document.body.appendChild(wrapper);

    html2pdf().set(opt).from(wrapper.firstChild).outputPdf('bloburl').then(function(url) {
        window.open(url, '_blank');
        document.body.removeChild(wrapper);
    }).catch(function() {
        document.body.removeChild(wrapper);
        alert('Error al generar PDF');
    });
};
`;

const startIdx = code.indexOf('window.generarComprobanteEntrada = function(id) {');
if (startIdx !== -1) {
    const endStr = 'window.exportarEntradasExcel = function() {';
    const endIdx = code.indexOf(endStr);
    if (endIdx !== -1) {
        code = code.substring(0, startIdx) + htmlBuilder + '\n\n' + code.substring(endIdx);
    }
}

fs.writeFileSync(path, code);
console.log('Done updating!');
