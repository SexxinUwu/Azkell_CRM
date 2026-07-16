const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let code = fs.readFileSync(path, 'utf8');

// Unhide the buttons by exact string replacement
code = code.split('title="PDF" style="display:none;"><i class="bi bi-file-earmark-pdf"></i></button>').join('title="Ver PDF"><i class="bi bi-eye"></i></button>');
code = code.split('style="display:none;">\' +\n            \'<i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>').join('>\' +\n            \'<i class="bi bi-eye me-1"></i>Ver Orden</button>');

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
        var bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        return '<tr style="background-color: ' + bg + ';">' +
            '<td style="padding:12px;text-align:center;border-bottom:1px solid #e2e8f0;color:#475569;">' + cant.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</td>' +
            '<td style="padding:12px;text-transform:uppercase;border-bottom:1px solid #e2e8f0;font-weight:500;color:#0f172a;">' + (it.descripcion || it.inventario_id || '-') + '</td>' +
            '<td style="padding:12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#475569;">' + cu.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</td>' +
            '<td style="padding:12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">' + imp.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
        '</tr>';
    }).join('');

    var txtMoneda = monSimbolo === 'USD' ? 'DÓLARES' : 'SOLES';
    var txtMonedaS = monSimbolo === 'USD' ? 'US$' : 'S/';
    var totalText = totalPen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});

    var condPagoText = (d.condicion_pago || 'AL CONTADO').toUpperCase();
    if (d.condicion_pago && d.condicion_pago.toLowerCase() === 'a cr\u00e9dito') {
        condPagoText = 'CRÉDITO / ' + (d.dias_credito||0) + ' DÍAS';
    }

    return '' +
    '<div style="font-family:\\'Inter\\', Arial, sans-serif;width:750px;margin:0 auto;padding:40px;color:#0f172a;box-sizing:border-box;">' +

        '<!-- HEADER -->' +
        '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1e293b;padding-bottom:20px;margin-bottom:30px;">' +
            '<div>' +
                '<div style="font-size:36px;font-weight:900;color:#0f172a;letter-spacing:-1px;">' +
                    'AZKELL <span style="color:#2563eb;">CRM</span>' +
                '</div>' +
                '<div style="font-size:13px;color:#64748b;margin-top:5px;font-weight:500;">SISTEMA DE GESTIÓN EMPRESARIAL</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
                '<div style="font-size:24px;font-weight:800;color:#1e293b;letter-spacing:-0.5px;text-transform:uppercase;">ORDEN DE COMPRA</div>' +
                '<div style="font-size:16px;font-weight:700;color:#2563eb;margin-top:5px;">N° ' + d.id + '</div>' +
            '</div>' +
        '</div>' +

        '<!-- SUMMARY CARDS -->' +
        '<div style="display:flex;gap:15px;margin-bottom:25px;">' +
            '<div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:15px;">' +
                '<div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:5px;">Solicitante</div>' +
                '<div style="font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;">' + (d.creado_por || '-') + '</div>' +
            '</div>' +
            '<div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:15px;">' +
                '<div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:5px;">Fecha de Emisión</div>' +
                '<div style="font-size:14px;font-weight:700;color:#0f172a;">' + fecha.split('-').reverse().join('/') + '</div>' +
            '</div>' +
            '<div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:15px;">' +
                '<div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:5px;">Proveedor</div>' +
                '<div style="font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;">' + (d.proveedor_nombre || '-') + '</div>' +
            '</div>' +
        '</div>' +

        '<!-- ORDER DETAILS -->' +
        '<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:30px;overflow:hidden;">' +
            '<div style="background:#f1f5f9;padding:10px 15px;font-size:12px;font-weight:700;color:#334155;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.5px;">Detalles de la Orden</div>' +
            '<div style="display:flex;flex-wrap:wrap;padding:15px;">' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:11px;color:#64748b;display:block;margin-bottom:2px;">TIPO DE ORDEN</span>' +
                    '<span style="font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;">' + (d.tipo_orden || 'ORDEN DE COMPRA') + '</span>' +
                '</div>' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:11px;color:#64748b;display:block;margin-bottom:2px;">CONDICIÓN DE PAGO</span>' +
                    '<span style="font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;">' + condPagoText + '</span>' +
                '</div>' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:11px;color:#64748b;display:block;margin-bottom:2px;">MONEDA</span>' +
                    '<span style="font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;">' + txtMoneda + (d.moneda === "USD" ? " (T/C: " + parseFloat(d.tipo_cambio||3.4).toFixed(3) + ")" : "") + '</span>' +
                '</div>' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:11px;color:#64748b;display:block;margin-bottom:2px;">PLACA / VEHÍCULO</span>' +
                    '<span style="font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;">' + (d.placa || 'N/A') + '</span>' +
                '</div>' +
                '<div style="width:100%;margin-bottom:0;">' +
                    '<span style="font-size:11px;color:#64748b;display:block;margin-bottom:2px;">MOTIVO</span>' +
                    '<span style="font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;">' + (d.motivo_entrada || 'SIN ESPECIFICAR') + '</span>' +
                '</div>' +
            '</div>' +
        '</div>' +

        '<!-- TABLE -->' +
        '<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">' +
            '<table style="width:100%;font-size:12px;border-collapse:collapse;">' +
                '<thead>' +
                    '<tr style="background:#1e293b;color:#ffffff;">' +
                        '<th style="padding:12px;text-align:center;width:60px;font-weight:600;letter-spacing:0.5px;">CANT</th>' +
                        '<th style="padding:12px;text-align:left;font-weight:600;letter-spacing:0.5px;">DESCRIPCIÓN</th>' +
                        '<th style="padding:12px;text-align:right;width:100px;font-weight:600;letter-spacing:0.5px;">P. UNIT</th>' +
                        '<th style="padding:12px;text-align:right;width:120px;font-weight:600;letter-spacing:0.5px;">IMPORTE</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody>' +
                    itemsHTML +
                '</tbody>' +
            '</table>' +
            '<div style="background:#f8fafc;padding:15px;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #e2e8f0;">' +
                '<div style="font-size:11px;color:#64748b;max-width:350px;">' +
                    '<b>SON:</b> ' + numeroALetras(totalPen) + ' ' + txtMoneda +
                '</div>' +
                '<div style="font-size:18px;color:#0f172a;">' +
                    '<span style="font-weight:600;font-size:14px;color:#64748b;margin-right:15px;">TOTAL GENERAL</span>' +
                    '<b>' + txtMonedaS + ' ' + totalText + '</b>' +
                '</div>' +
            '</div>' +
        '</div>' +

        '<!-- OBSERVACIONES -->' +
        '<div style="background:#fffbeb;border:1px solid #fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:15px;font-size:12px;color:#92400e;">' +
            '<b style="display:block;margin-bottom:5px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#b45309;">Observaciones Adicionales</b>' +
            (d.observaciones || 'No se registraron observaciones adicionales para esta orden.') +
        '</div>' +

    '</div>';
};

window.generarComprobanteEntrada = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }

    var html = window._entGenerarHtmlPDF(d);

    var opt = {
        margin: [10, 0, 10, 0],
        filename: 'Orden_de_Compra_' + id + '.pdf',
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:750px;background:#fff;';
    document.body.appendChild(wrapper);

    html2pdf().set(opt).from(wrapper.firstChild).save().then(function() {
        document.body.removeChild(wrapper);
    });
};

window.previsualizarComprobanteEntrada = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }

    var html = window._entGenerarHtmlPDF(d);

    var opt = { margin:[10,0,10,0], filename:'Orden_de_Compra_'+id+'.pdf',
        image:{type:'jpeg',quality:1}, html2canvas:{scale:2,useCORS:true},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} };

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:750px;background:#fff;';
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
console.log('Done!');
