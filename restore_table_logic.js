const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// Fix filtering to include modelo
js = js.replace(
/var filMarca = \(\(document\.getElementById\('kits-fil-marca'\)\|\|\{\}\)\.value\|\|''\);\s*var filTipo  = \(\(document\.getElementById\('kits-fil-tipo'\) \|\|\{\}\)\.value\|\|''\);\s*window\.kitsDataFil = window\.kitsData\.filter\(function\(k\) \{\s*return \(\!filMarca \|\| \(k\.marca_vehiculo\|\|''\)\.toUpperCase\(\)===filMarca\.toUpperCase\(\)\) &&\s*\(\!filTipo  \|\| k\.tipo_mp===filTipo\);\s*\}\);/,
`var filMarca = ((document.getElementById('kits-fil-marca')||{}).value||'');
    var filModelo = ((document.getElementById('kits-fil-modelo')||{}).value||'');
    var filTipo  = ((document.getElementById('kits-fil-tipo') ||{}).value||'');
    window.kitsDataFil = window.kitsData.filter(function(k) {
        return (!filMarca || (k.marca_vehiculo||'').toUpperCase()===filMarca.toUpperCase()) &&
               (!filModelo || (k.modelo_vehiculo||'TODOS LOS MODELOS').toUpperCase()===filModelo.toUpperCase()) &&
               (!filTipo  || k.tipo_mp===filTipo);
    });`
);

// Fix Desktop table grouping
js = js.replace(
/var lastMarca = null;\s*var lastTipo  = null;\s*window\.kitsDataFil\.forEach\(function\(k, index\) \{\s*\/\/ --- DESKTOP TABLE LOGIC ---\s*if \(k\.marca_vehiculo !== lastMarca\) \{\s*html \+= '<tr style="background:var\(--surface\)">' \+\s*'<td colspan="8" class="fw-bold py-1 px-2" style="font-size:0\.8rem; border-top:2px solid var\(--border\); color:var\(--text\)">' \+\s*'<i class="bi bi-truck me-1" style="color:var\(--primary,#5865F2\)"><\/i>' \+ \(k\.marca_vehiculo\|\|'—'\) \+ '<\/td><\/tr>';\s*lastMarca = k\.marca_vehiculo;\s*lastTipo  = null;\s*\}/,
`var lastMarca = null;
    var lastModelo = null;
    var lastTipo  = null;
    
    window.kitsDataFil.forEach(function(k, index) {
        // --- DESKTOP TABLE LOGIC ---
        if (k.marca_vehiculo !== lastMarca || (k.modelo_vehiculo||'TODOS LOS MODELOS') !== lastModelo) {
            var dispModelo = (k.modelo_vehiculo && k.modelo_vehiculo !== 'TODOS LOS MODELOS') ? (' - ' + k.modelo_vehiculo) : '';
            html += '<tr style="background:var(--surface)">' +
                '<td colspan="8" class="fw-bold py-1 px-2" style="font-size:0.8rem; border-top:2px solid var(--border); color:var(--text)">' +
                '<i class="bi bi-truck me-1" style="color:var(--primary,#5865F2)"></i>' + (k.marca_vehiculo||'—') + dispModelo + '</td></tr>';
            lastMarca = k.marca_vehiculo;
            lastModelo = k.modelo_vehiculo || 'TODOS LOS MODELOS';
            lastTipo  = null;
        }`
);

// Fix Desktop table kitsEditarKit parameters and sum
js = js.replace(
/if \(k\.tipo_mp !== lastTipo\) \{\s*var mpColor = k\.tipo_mp === 'MP1' \? 'bg-primary' : k\.tipo_mp === 'MP2' \? 'bg-success' : k\.tipo_mp === 'MP3' \? 'bg-warning text-dark' : 'bg-info text-dark';\s*html \+= '<tr style="background:var\(--bg\)">' \+\s*'<td><\/td>' \+\s*'<td colspan="7" class="py-1 px-2" style="font-size:0\.75rem; border-bottom:1px dashed var\(--border\)">' \+\s*'<div class="d-flex justify-content-between align-items-center">' \+\s*'<span><span class="badge ' \+ mpColor \+ ' me-1">' \+ k\.tipo_mp \+ '<\/span>' \+ \(k\.nombre_kit \? ' <span class="text-muted fw-bold ms-2">' \+ k\.nombre_kit \+ '<\/span>' : ''\) \+ '<\/span>' \+\s*\(window\.checkPerm\('cfg_mant','e'\) \? '<button class="btn btn-xs btn-outline-primary" onclick="window\.kitsEditarKit\\\(' \+ k\.marca_vehiculo \+ '\\\',\\\'' \+ k\.tipo_mp \+ '\\\'\\\)" style="font-size:0\.7rem;padding:2px 8px"><i class="bi bi-pencil me-1"><\/i>Editar Kit<\/button>' : ''\) \+\s*'<\/div><\/td><\/tr>';\s*lastTipo = k\.tipo_mp;\s*\}/,
`if (k.tipo_mp !== lastTipo) {
            var mpColor = k.tipo_mp === 'MP1' ? 'bg-primary' : k.tipo_mp === 'MP2' ? 'bg-success' : k.tipo_mp === 'MP3' ? 'bg-warning text-dark' : 'bg-info text-dark';
            // Calculate MP Total
            var mpTotal = 0;
            for (var j=index; j<window.kitsDataFil.length; j++) {
                if (window.kitsDataFil[j].marca_vehiculo === k.marca_vehiculo &&
                    (window.kitsDataFil[j].modelo_vehiculo||'TODOS LOS MODELOS') === (k.modelo_vehiculo||'TODOS LOS MODELOS') &&
                    window.kitsDataFil[j].tipo_mp === k.tipo_mp) {
                    mpTotal += parseFloat(window.kitsDataFil[j].costo_total||0);
                } else break;
            }

            html += '<tr style="background:var(--bg)">' +
                '<td></td>' +
                '<td colspan="7" class="py-1 px-2" style="font-size:0.75rem; border-bottom:1px dashed var(--border)">' +
                '<div class="d-flex justify-content-between align-items-center">' +
                '<span><span class="badge ' + mpColor + ' me-1">' + k.tipo_mp + '</span>' + (k.nombre_kit ? ' <span class="text-muted fw-bold ms-2">' + k.nombre_kit + '</span>' : '') + ' <span style="font-weight:900; margin-left:10px; color:var(--text);">Total: S/.'+mpTotal.toFixed(2)+'</span></span>' +
                (window.checkPerm('cfg_mant','e') ? '<button class="btn btn-xs btn-outline-primary" onclick="window.kitsEditarKit(\\''+k.marca_vehiculo+'\\',\\''+(k.modelo_vehiculo||'TODOS LOS MODELOS')+'\\',\\''+k.tipo_mp+'\\')" style="font-size:0.7rem;padding:2px 8px"><i class="bi bi-pencil me-1"></i>Editar Kit</button>' : '') +
                '</div></td></tr>';
            lastTipo = k.tipo_mp;
        }`
);

// Fix Mobile Card boundaries
js = js.replace(
/\/\/ Boundaries for MARCA\s*var isFirstOfMarca = index === 0 \|\| k\.marca_vehiculo !== window\.kitsDataFil\[index-1\]\.marca_vehiculo;\s*var isLastOfMarca = \!nextK \|\| nextK\.marca_vehiculo !== k\.marca_vehiculo;/,
`// Boundaries for MARCA
        var isFirstOfMarca = index === 0 || k.marca_vehiculo !== window.kitsDataFil[index-1].marca_vehiculo || (k.modelo_vehiculo||'TODOS LOS MODELOS') !== (window.kitsDataFil[index-1].modelo_vehiculo||'TODOS LOS MODELOS');
        var isLastOfMarca = !nextK || nextK.marca_vehiculo !== k.marca_vehiculo || (nextK.modelo_vehiculo||'TODOS LOS MODELOS') !== (k.modelo_vehiculo||'TODOS LOS MODELOS');`
);

js = js.replace(
/htmlMobile \+= '    <i class="bi bi-truck" style="color:var\(--primary,#5865F2\);"><\/i>';\s*htmlMobile \+= '    <span style="font-weight:900; font-size:1rem; color:#0f172a;">' \+ \(k\.marca_vehiculo\|\|'—'\) \+ '<\/span>';/,
`htmlMobile += '    <i class="bi bi-truck" style="color:var(--primary,#5865F2);"></i>';
            var dMod = (k.modelo_vehiculo && k.modelo_vehiculo !== 'TODOS LOS MODELOS') ? (' <span style="font-weight:600;color:#64748b;font-size:0.85rem">- '+k.modelo_vehiculo+'</span>') : '';
            htmlMobile += '    <span style="font-weight:900; font-size:1rem; color:#0f172a;">' + (k.marca_vehiculo||'—') + dMod + '</span>';`
);

js = js.replace(
/if \(window\.checkPerm\('cfg_mant','e'\)\) \{\s*htmlMobile \+= '       <button class="btn btn-sm btn-outline-primary" style="padding:2px 10px; border-radius:12px; font-weight:700;" onclick="window\.kitsEditarKit\\\(' \+ k\.marca_vehiculo \+ '\\\',\\\'' \+ k\.tipo_mp \+ '\\\'\\\)"><i class="bi bi-pencil"><\/i><\/button>';\s*\}/,
`// Calculate MP Total for mobile
            var mpTotalM = 0;
            for (var j=index; j<window.kitsDataFil.length; j++) {
                if (window.kitsDataFil[j].marca_vehiculo === k.marca_vehiculo &&
                    (window.kitsDataFil[j].modelo_vehiculo||'TODOS LOS MODELOS') === (k.modelo_vehiculo||'TODOS LOS MODELOS') &&
                    window.kitsDataFil[j].tipo_mp === k.tipo_mp) {
                    mpTotalM += parseFloat(window.kitsDataFil[j].costo_total||0);
                } else break;
            }
            if (window.checkPerm('cfg_mant','e')) {
                htmlMobile += '       <div style="display:flex; align-items:center; gap:8px;">';
                htmlMobile += '         <span style="font-weight:900; font-size:0.85rem; color:#0f172a;">S/.'+mpTotalM.toFixed(2)+'</span>';
                htmlMobile += '         <button class="btn btn-sm btn-outline-primary" style="padding:2px 10px; border-radius:12px; font-weight:700;" onclick="window.kitsEditarKit(\\''+k.marca_vehiculo+'\\',\\''+(k.modelo_vehiculo||'TODOS LOS MODELOS')+'\\',\\''+k.tipo_mp+'\\')"><i class="bi bi-pencil"></i></button>';
                htmlMobile += '       </div>';
            }`
);

fs.writeFileSync(fileJs, js, 'utf8');
