// @ts-nocheck
// Copia del clásico (modulos/mantenimiento/reportes-ot/logica.js): rotEscHtml, rotCleanObsText, rotGetCleanMotivoDisplay y generarPDF_OT.
// El código del clásico no se cambió. Solo cambian tres cosas: las funciones se exportan, se quitó la guarda de html2pdf
// y generarPDF_OT devuelve el HTML del documento en vez de abrir una pestaña. otPdf.ts lo convierte a PDF.

export function rotEscHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

export function rotCleanObsText(text) {
    if (!text) return '';
    var raw = String(text)
        .replace(/^\[Reporte\s+[^\]]+\]\s*/gim, '')
        .replace(/^OT\s+OT-[^:]+:\s*/gim, '')
        // El aviso del sistema al cerrar una inspección no se imprime (en la línea o pegado con un •)
        .replace(/^[•\-*]?\s*Generado automáticamente[^\n]*$/gim, '')
        .replace(/•\s*Generado automáticamente[^•\n]*/gi, '')
        .trim();

    var lines = raw.split('\n');
    var cleanedLines = [];
    lines.forEach(function(l) {
        var trimmed = l.trim();
        if (!trimmed) return;
        var clean = trimmed
            .replace(/^[-*•]\s*/, '')
            .replace(/^\[[^\]]+\]\s*/, '')
            .replace(/^[A-Z0-9\s]+—\s*/i, '')
            .replace(/\s*\((?:Téc|Tec|TÉC|TEC):[^\)]*\)/gi, '')
            .trim();
        
        if (clean.includes(':')) {
            var parts = clean.split(':');
            var itm = parts[0].replace(/^\d+[\.\)\-]?\s*/, '').trim();
            var obs = parts.slice(1).join(':').trim();
            clean = (itm && obs) ? (itm + ' : ' + obs) : (itm || obs);
        } else {
            clean = clean.replace(/^\d+[\.\)\-]?\s*/, '').trim();
        }

        if (clean) cleanedLines.push('• ' + clean);
    });
    return cleanedLines.join('\n');
}

// Una falla repetida (mismo texto) se muestra una sola vez, también en las OT ya guardadas con duplicados
export function rotGetCleanMotivoDisplay(det, ot) {
    const texto = String(rotMotivoConRepetidos(det, ot));
    return [...new Set(texto.split('\n').filter(Boolean))].join('\n');
}

function rotMotivoConRepetidos(det, ot) {
    if (!det) det = {};
    if (!ot) ot = {};

    var esTextoGenerico = function(txt) {
        if (!txt) return true;
        var up = String(txt).trim().toUpperCase();
        return up === 'OBSERVADO EN CHECKLIST' || up === 'OBSERVACION REPORTADA' || up === 'OBSERVACIÓN REPORTADA' 
            || up === 'FALLA OBSERVADA' || up === 'FALLA REPORTADA' || up === 'SIN OBSERVACIÓN' || up === 'SIN OBSERVACION'
            || up === 'OBSERVACIÓN' || up === 'OBSERVACION';
    };

    // 1. Si tiene motivos_array estructurado, formatear con Item : Descripción sin números
    if (Array.isArray(det.motivos_array) && det.motivos_array.length > 0) {
        return det.motivos_array.map(function(m) {
            var rawItem = String(m.item || '').replace(/^\[[^\]]+\]\s*/, '').replace(/^[A-Z0-9\s]+—\s*/i, '').replace(/^[•\-\*]\s*/, '').trim();
            var itemClean = rawItem.replace(/^\d+[\.\)\-]?\s*/, '').trim() || rawItem;
            var obsClean = String(m.obs || m.descripcion || m.motivo || '').replace(/^\[[^\]]+\]\s*/, '').replace(/^[A-Z0-9\s]+—\s*/i, '').replace(/^[•\-\*]\s*/, '').replace(/\s*\((?:Téc|Tec|TÉC|TEC):[^\)]*\)/gi, '').trim();

            var line = itemClean;
            if (obsClean && !esTextoGenerico(obsClean) && obsClean.toLowerCase() !== itemClean.toLowerCase()) {
                line = itemClean ? (itemClean + ' : ' + obsClean) : obsClean;
            } else if (!itemClean && obsClean) {
                line = obsClean;
            }
            return '• ' + line;
        }).join('\n');
    }

    // 2. Si tiene fallas_seleccionadas como array
    if (Array.isArray(det.fallas_seleccionadas) && det.fallas_seleccionadas.length > 0) {
        return det.fallas_seleccionadas.map(function(f) {
            var clean = String(f)
                .replace(/^\[[^\]]+\]\s*/, '')
                .replace(/^[A-Z0-9\s]+—\s*/i, '')
                .replace(/\s*\((?:Téc|Tec|TÉC|TEC):[^\)]*\)/gi, '')
                .replace(/^[•\-\*]\s*/, '')
                .trim();
            if (clean.includes(':')) {
                var parts = clean.split(':');
                var itm = parts[0].replace(/^\d+[\.\)\-]?\s*/, '').trim();
                var obs = parts.slice(1).join(':').trim();
                clean = (itm && obs) ? (itm + ' : ' + obs) : (itm || obs);
            } else {
                clean = clean.replace(/^\d+[\.\)\-]?\s*/, '').trim();
            }
            return '• ' + clean;
        }).join('\n');
    }

    // 3. Limpieza de texto directo
    var rawText = det.motivo || ot.observaciones || det.observaciones || '';
    var cleaned = rotCleanObsText(rawText);
    if (cleaned) return cleaned;

    // 4. Si el texto contenía [Reporte ...] pero no items detallados
    if (rawText && rawText.includes('[Reporte')) {
        var repMatch = rawText.match(/\[Reporte\s+([^\]]+)\]/i);
        var repFolio = repMatch ? repMatch[1] : (det.folio_reporte || '');
        return 'REPORTE ' + repFolio + (det.sub_tipo || det.subtipo_ot ? ' — ' + (det.sub_tipo || det.subtipo_ot) : '');
    }

    return (det.descripcion_falla || det.sub_tipo || det.subtipo_ot || ot.tipo || 'Sin observaciones registradas');
}

export function generarPDF_OT(ot, trabajos, materiales, isPlantilla, _onHtmlReady) {

    var det = {};
    try { det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(e) {}

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
    }


    var numOT = ot.id_ot || ot.ticket_entrada || '';
    var numPart = numOT, anioPart = '';
    if (numOT.includes('-')) {
        var parts = numOT.split('-');
        if (parts.length >= 3) {
            if (parts[1].startsWith('20')) {
                anioPart = parts[1];
                numPart = parts[2];
            } else {
                anioPart = parts[2];
                numPart = parts[1];
            }
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
            var s = typeof iso === 'string' ? iso.replace('Z', '') : iso;
            var d = new Date(s);
            if (isNaN(d.getTime())) return { d: '—', h: '—' };
            var dd = String(d.getDate()).padStart(2,'0');
            var mm = String(d.getMonth()+1).padStart(2,'0');
            var yy = d.getFullYear();
            var hh = String(d.getHours()).padStart(2,'0');
            var min = String(d.getMinutes()).padStart(2,'0');
            return { d: dd+'/'+mm+'/'+yy, h: hh+':'+min };
        } catch(e) { return { d: '—', h: '—' }; }
    }

    var iniDT = formatDT(ot.fecha_inicio_ot || ot.fecha_ingreso);
    var finDT = formatDT(ot.fecha_hora_salida);

    // ── Kilometraje Tablero y GPS ──
    var rawKmTablero = (det.km_tablero !== undefined && det.km_tablero !== null && det.km_tablero !== '') ? det.km_tablero 
                     : ((det.km !== undefined && det.km !== null && det.km !== '') ? det.km 
                     : (ot.km_tablero || ot.km || ''));
    var rawKmGps = (det.km_gps !== undefined && det.km_gps !== null && det.km_gps !== '') ? det.km_gps 
                 : (ot.km_gps || det.kilometraje_gps || '');

    // Consulta de respaldo a Wialon GPS en vivo si no vino en el registro
    if ((!rawKmGps || rawKmGps === '—' || rawKmGps === 0) && ot.placa && typeof window.buscarWialonPorPlaca === 'function') {
        try {
            var wD = window.buscarWialonPorPlaca(ot.placa);
            if (wD && wD.km) rawKmGps = Math.round(wD.km);
        } catch(eW) {}
    }

    var dispKmTablero = '—';
    if (det.horas_motor) {
        var numH = Number(det.horas_motor);
        dispKmTablero = (!isNaN(numH) ? numH.toLocaleString('es-PE') : det.horas_motor) + ' hrs';
    } else if (rawKmTablero !== '' && rawKmTablero !== null && rawKmTablero !== undefined && rawKmTablero !== '—') {
        var numT = Number(String(rawKmTablero).replace(/[^0-9\.]/g, ''));
        dispKmTablero = (!isNaN(numT) && numT >= 0) ? numT.toLocaleString('es-PE') + ' km' : (String(rawKmTablero).trim() || '—');
    }

    var dispKmGps = '—';
    if (rawKmGps !== '' && rawKmGps !== null && rawKmGps !== undefined && rawKmGps !== '—') {
        var numG = Number(String(rawKmGps).replace(/[^0-9\.]/g, ''));
        dispKmGps = (!isNaN(numG) && numG > 0) ? numG.toLocaleString('es-PE') + ' km' : (String(rawKmGps).trim() || '—');
    }

    // ── Obtener técnicos asignados a la OT ──
    var otTecsArr = [];
    if (Array.isArray(det.tecnicos)) {
        otTecsArr = det.tecnicos.filter(Boolean);
    } else if (typeof det.tecnicos === 'string' && det.tecnicos.trim()) {
        otTecsArr = det.tecnicos.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    } else if (det.tecnicos_str) {
        otTecsArr = det.tecnicos_str.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    } else if (det.tecnico) {
        otTecsArr = [det.tecnico.trim()];
    }
    var otTecsGeneral = otTecsArr.length > 0 ? otTecsArr.join(', ') : '';

    var htmlMotivos = '';
    var itemsMotivos = [];

    // 1. Si viene motivos_array con técnicos específicos por falla
    if (Array.isArray(det.motivos_array) && det.motivos_array.length > 0) {
        det.motivos_array.forEach(function(m, idx) {
            var motText = typeof m === 'string' ? m : (m.motivo || m.item || m.descripcion || m.obs || '—');
            var cleanText = rotCleanObsText(String(motText || '').replace(/^(?:\d+[\.\)\-]?\s*)+/, '').trim());
            if (!cleanText || cleanText.toLowerCase() === 'sin observaciones registradas') return;
            
            var rowTec = '';
            if (typeof m === 'object') {
                rowTec = (m.tecnico || m.tecnico_nombre || m.personal || m.mecanico || m.responsable || '').trim();
            }
            if (!rowTec) {
                if (otTecsArr.length > 0) {
                    rowTec = (otTecsArr.length === 1) ? otTecsArr[0] : (otTecsArr[idx] || otTecsGeneral);
                } else {
                    rowTec = det.supervisor || ot.supervisor || '—';
                }
            }
            if (!itemsMotivos.some(it => it.texto.toLowerCase() === cleanText.toLowerCase())) itemsMotivos.push({ texto: cleanText, tecnico: rowTec });
        });
    }

    // 2. Si no hubo motivos_array pero hay trabajos_det
    if (itemsMotivos.length === 0 && Array.isArray(det.trabajos_det) && det.trabajos_det.length > 0) {
        det.trabajos_det.forEach(function(td, idx) {
            var descClean = rotCleanObsText(String(td.desc || td.trabajo || '').replace(/^(?:\d+[\.\)\-]?\s*)+/, '').trim());
            if (!descClean) return;
            var rowTec = (td.tecnico || td.personal || td.mecanico || '').trim();
            if (!rowTec) {
                rowTec = otTecsGeneral || det.supervisor || ot.supervisor || '—';
            }
            if (!itemsMotivos.some(it => it.texto.toLowerCase() === descClean.toLowerCase())) itemsMotivos.push({ texto: descClean, tecnico: rowTec });
        });
    }

    // 3. Fallback: Parsear texto limpio de rotGetCleanMotivoDisplay
    var motivosTextoRaw = rotGetCleanMotivoDisplay(det, ot);
    var lineasMotivos = (motivosTextoRaw || '')
        .split('\n')
        .map(function(l) { return l.replace(/^[•\-\*]\s*/, '').trim(); })
        .filter(function(l) {
            if (!l) return false;
            var low = l.toLowerCase();
            return low !== 'sin observaciones registradas' && low !== 'sin observación' && low !== 'sin observacion';
        });

    if (itemsMotivos.length === 0 && lineasMotivos.length > 0) {
        lineasMotivos.forEach(function(mText, idx) {
            var rowTec = '';
            if (otTecsArr.length > 0) {
                rowTec = (otTecsArr.length === 1) ? otTecsArr[0] : (otTecsArr[idx] || otTecsGeneral);
            } else {
                rowTec = det.supervisor || ot.supervisor || '—';
            }
            itemsMotivos.push({ texto: mText, tecnico: rowTec });
        });
    }

    if (itemsMotivos.length > 0) {
        htmlMotivos = itemsMotivos.map(function(item, idx) {
            return '<tr>'
                + '<td class="text-center">' + (idx + 1) + '</td>'
                + '<td>' + rotEscHtml(item.texto) + '</td>'
                + '<td class="text-center">' + rotEscHtml(item.tecnico) + '</td>'
                + '</tr>';
        }).join('');
    } else {
        htmlMotivos = '<tr><td colspan="3" class="text-center" style="color:#888; font-style: italic; padding: 4px;">No hay motivos de ingreso registrados.</td></tr>';
    }

    var htmlTrabajos = '';
    var trbArr = trabajos || [];
    if (isPlantilla) {
        for (var i=0; i<10; i++) {
            htmlTrabajos += '<tr><td class="text-center">' + (i+1) + '</td><td></td><td></td><td></td><td></td></tr>';
        }
    } else if (trbArr.length === 0) {
        htmlTrabajos = '<tr><td colspan="5" class="text-center" style="color:#888; font-style: italic; padding: 4px;">No hay trabajos registrados.</td></tr>';
    } else {
        for (var i=0; i<trbArr.length; i++) {
            var t = trbArr[i];
            var det2 = {};
            try { det2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
            
            var tIni = formatDT(t.fecha_trabajo || t.fecha_inicio || t.fecha || t.fecha_creacion);
            var tFin = formatDT(t.fecha_salida || t.fecha_fin || t.fecha_cierre);
            var tIniStr = (tIni.d !== '—') ? tIni.d + ' ' + tIni.h : '—';
            var tFinStr = (tFin.d !== '—') ? tFin.d + ' ' + tFin.h : '—';
            
            htmlTrabajos += '<tr>'
                + '<td class="text-center">' + (i+1) + '</td>'
                + '<td class="text-center">' + tIniStr + '</td>'
                + '<td>' + rotEscHtml(t.trabajo_realizado || '—') + '</td>'
                + '<td class="text-center">' + rotEscHtml(det2.personal || t.tecnico || '—') + '</td>'
                + '<td class="text-center">' + tFinStr + '</td>'
                + '</tr>';
        }
    }

    var htmlMateriales = '';
    var matArr = materiales || [];
    var matRows = [];
    var totalMontoMateriales = 0;
    matArr.forEach(function(m) {
        var items = Array.isArray(m.items) ? m.items : [];
        items.forEach(function(it) {
            var desc = it.descripcion || '';
            var codigo = it.inventario_id || '';
            var pDesc = desc.replace(/ —\s*$/, '').trim();
            var pMarca = '';

            // Limpiar prefijo repetido (ej. "INV-0642 — INV-0642 — Tuerca...")
            if (codigo) {
                while (pDesc.startsWith(codigo + ' — ') || pDesc.startsWith(codigo + ' - ')) {
                    pDesc = pDesc.substring(codigo.length + 3).trim();
                }
                if (pDesc === codigo) pDesc = '';
            }

            var lastDash = pDesc.lastIndexOf(' — ');
            if (lastDash !== -1) {
                var posMarca = pDesc.substring(lastDash + 3).trim();
                if (posMarca.toUpperCase() === 'SIN MARCA') {
                    pMarca = 'SIN MARCA';
                    pDesc = pDesc.substring(0, lastDash).trim();
                }
            }

            var lastSlash = pDesc.lastIndexOf(' / ');
            if (lastSlash !== -1) {
                if (!pMarca || pMarca === 'SIN MARCA') {
                    pMarca = pDesc.substring(lastSlash + 3).trim();
                }
                pDesc = pDesc.substring(0, lastSlash).trim();
            } else if (pDesc.endsWith('/')) {
                pDesc = pDesc.substring(0, pDesc.length - 1).trim();
            }

            if (pDesc.endsWith('/')) {
                pDesc = pDesc.substring(0, pDesc.length - 1).trim();
            }

            if (!pDesc && codigo) {
                pDesc = desc; // Fallback
            }

            var itemTotal = parseFloat(it.importe) || 0;
            totalMontoMateriales += itemTotal;

            matRows.push({
                codigo: it.inventario_id || '',
                producto: pDesc,
                marca: pMarca,
                cantidad: it.cantidad,
                costo: it.costo_unitario,
                total: itemTotal
            });
        });
    });

    if (matRows.length === 0) {
        htmlMateriales = '<tr><td colspan="7" class="text-center" style="color:#888; font-style: italic; padding: 4px;">No hay salidas registradas.</td></tr>';
    } else {
        matRows.forEach(function(r, idx) {
            htmlMateriales += '<tr>'
                + '<td class="text-center">' + (idx + 1) + '</td>'
                + '<td class="text-center">' + rotEscHtml(r.codigo) + '</td>'
                + '<td>' + rotEscHtml(r.producto) + '</td>'
                + '<td class="text-center">' + rotEscHtml(r.marca) + '</td>'
                + '<td class="text-center">' + rotEscHtml(r.cantidad) + '</td>'
                + '<td class="text-center">' + parseFloat(r.costo||0).toFixed(2) + '</td>'
                + '<td class="text-center">' + parseFloat(r.total||0).toFixed(2) + '</td>'
                + '</tr>';
        });
        htmlMateriales += '<tr><td colspan="6" style="text-align: right; font-weight: bold; padding-right: 10px;">TOTAL:</td><td class="text-center" style="font-weight: bold; background-color: #f2f2f2;">' + totalMontoMateriales.toFixed(2) + '</td></tr>';
    }

    var htmlMaterialesTable = '';
    if (!isPlantilla) {
        htmlMaterialesTable = `
        <div class="section-title">Salidas de Almacén</div>
        <table class="content-table trabajos-table">
            <thead>
                <tr>
                    <th style="width: 30px;" class="text-center">#</th>
                    <th style="width: 70px;" class="text-center">Cód. Producto</th>
                    <th>Producto</th>
                    <th style="width: 75px;" class="text-center">Marca</th>
                    <th style="width: 40px;" class="text-center">Cant.</th>
                    <th style="width: 55px;" class="text-center">Costo</th>
                    <th style="width: 60px;" class="text-center">Total</th>
                </tr>
            </thead>
            <tbody>
                ${htmlMateriales}
            </tbody>
        </table>
        `;
    }

    var htmlObservaciones = '';
    if (isPlantilla) {
        htmlObservaciones = `
        <div class="section-title">OBSERVACIONES</div>
        <div class="observaciones-box"></div>
        `;
    }

    var htmlBacklog = '<tr><td colspan="3" class="text-center" style="color:#888; font-style: italic; padding: 4px;">No hay mantenimientos pendientes reportados.</td></tr>';

    var container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    
    var empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';
    container.innerHTML = `
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
                    <img src="${empLogoUrl}" alt="Logo Empresa" style="max-width: 100%; max-height: 45px; object-fit: contain;">
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
                <td style="width: 33%;">Nº OT: <span class="val-blue">${anioPart ? anioPart + "-" : ""}${numPart}</span></td>
                <td style="width: 33%;">Placa: <span class="val-normal">${rotEscHtml(ot.placa || '—')}</span></td>
                <td style="width: 34%;">Marca: <span class="val-normal">${rotEscHtml(pMarca || '—')}</span></td>
            </tr>
            <tr>
                <td>Cliente: <span class="val-normal">${rotEscHtml(pCliente || '—')}</span></td>
                <td>Kms GPS: <span class="val-normal">${rotEscHtml(dispKmGps)}</span></td>
                <td>Kms Tablero: <span class="val-normal">${rotEscHtml(dispKmTablero)}</span></td>
            </tr>
            <tr>
                <td>Tipo OT: <span class="val-normal">${rotEscHtml(det.tipo_ot || '—')}</span></td>
                <td>Sub Tipo: <span class="val-normal">${rotEscHtml(det.sub_tipo || '—')}</span></td>
                <td>Rampa: <span class="val-normal">${rotEscHtml(det.rampa_origen || '—')}</span></td>
            </tr>
            <tr>
                <td colspan="2">Inicio: <span class="val-normal">${iniDT.d} &nbsp;&nbsp;|&nbsp;&nbsp; Hora: ${iniDT.h}</span></td>
                <td>Término: <span class="val-normal">${finDT.d} &nbsp;&nbsp;|&nbsp;&nbsp; Hora: ${finDT.h}</span></td>
            </tr>
        </table>

        <div class="aviso">
            Se le informa que la unidad ingresó a mantenimiento para el siguiente servicio. PLACA: <span>${rotEscHtml(ot.placa || '—')}</span>
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
                ${htmlMotivos}
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
                ${htmlBacklog}
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
                ${htmlTrabajos}
            </tbody>
        </table>

        ${htmlMaterialesTable}
        ${htmlObservaciones}
        
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
    </div>`;

    var htmlBody = container.innerHTML;
    var finalHtml = '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n<title>Orden de Trabajo</title>\n'
                  + '<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap" rel="stylesheet">\n'
                  + '<style>\n'
                  + 'body { background-color: #e0e0e0; margin: 0; padding: 20px; display: flex; justify-content: center; }\n'
                  + '#btnPrint { position: fixed; top: 20px; right: 20px; background-color: #000; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; z-index: 1000; font-family: Oswald, sans-serif; font-size: 14px; }\n'
                  + '#btnPrint:hover { opacity: 0.9; }\n'
                  + '@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } body { background: none; padding: 0; margin: 0; display: block; } #btnPrint { display: none; } .page-container { margin: 0 !important; box-shadow: none !important; } }\n'
                  + '</style>\n</head>\n<body>\n'
                  + '<button id="btnPrint" onclick="window.print()">Imprimir / Guardar PDF</button>\n'
                  + htmlBody
                  + '\n</body>\n</html>';
    // Si se pasa un callback, devolver el HTML sin abrir ventana (para preview en modal)
    if (typeof _onHtmlReady === 'function') {
        _onHtmlReady(finalHtml);
        return;
    }
    return finalHtml;
}
