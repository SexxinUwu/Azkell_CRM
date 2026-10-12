const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(jsPath, 'utf8');

const startTarget = 'window.kitsFiltrar = function() {';
const endTarget = '};\n\nwindow.kitsDeleted = [];';
let startIndex = js.indexOf(startTarget);
let endIndex = js.indexOf(endTarget);
if (endIndex === -1) {
    endIndex = js.indexOf('};\r\n\r\nwindow.kitsDeleted = [];');
}

if (startIndex === -1 || endIndex === -1) {
    console.error('Could not find window.kitsFiltrar function boundaries');
    process.exit(1);
}

const newFunction = `window.kitsFiltrar = function() {
    var filMarca = ((document.getElementById('kits-fil-marca')||{}).value||'');
    var filTipo  = ((document.getElementById('kits-fil-tipo') ||{}).value||'');
    window.kitsDataFil = window.kitsData.filter(function(k) {
        return (!filMarca || (k.marca_vehiculo||'').toUpperCase()===filMarca.toUpperCase()) &&
               (!filTipo  || k.tipo_mp===filTipo);
    });
    
    var tb = document.getElementById('kits-tbody');
    var grid = document.getElementById('kits-grid-mobile');
    
    if (!window.kitsDataFil.length) {
        if (tb) tb.innerHTML = '<tr><td colspan="8" class="text-center py-4" style="color:var(--subtext)">Sin ítems de kits</td></tr>';
        if (grid) grid.innerHTML = '<div class="text-center py-5" style="color:var(--subtext)">Sin ítems de kits</div>';
        return;
    }
    
    var html = '';
    var htmlMobile = '';
    
    var lastMarca = null;
    var lastTipo  = null;
    
    window.kitsDataFil.forEach(function(k, index) {
        // --- DESKTOP TABLE LOGIC ---
        if (k.marca_vehiculo !== lastMarca) {
            html += '<tr style="background:var(--surface)">' +
                '<td colspan="8" class="fw-bold py-1 px-2" style="font-size:0.8rem; border-top:2px solid var(--border); color:var(--text)">' +
                '<i class="bi bi-truck me-1" style="color:var(--primary,#5865F2)"></i>' + (k.marca_vehiculo||'—') + '</td></tr>';
            lastMarca = k.marca_vehiculo;
            lastTipo  = null;
        }
        if (k.tipo_mp !== lastTipo) {
            var mpColor = k.tipo_mp === 'MP1' ? 'bg-primary' : k.tipo_mp === 'MP2' ? 'bg-success' : k.tipo_mp === 'MP3' ? 'bg-warning text-dark' : 'bg-info text-dark';
            html += '<tr style="background:var(--bg)">' +
                '<td></td>' +
                '<td colspan="7" class="py-1 px-2" style="font-size:0.75rem; border-bottom:1px dashed var(--border)">' +
                '<div class="d-flex justify-content-between align-items-center">' +
                '<span><span class="badge ' + mpColor + ' me-1">' + k.tipo_mp + '</span>' + (k.nombre_kit ? ' <span class="text-muted fw-bold ms-2">' + k.nombre_kit + '</span>' : '') + '</span>' +
                (window.checkPerm('cfg_mant','e') ? '<button class="btn btn-xs btn-outline-primary" onclick="window.kitsEditarKit(\\''+k.marca_vehiculo+'\\',\\''+k.tipo_mp+'\\')" style="font-size:0.7rem;padding:2px 8px"><i class="bi bi-pencil me-1"></i>Editar Kit</button>' : '') +
                '</div></td></tr>';
            lastTipo = k.tipo_mp;
        }
        html += '<tr>' +
            '<td></td><td></td>' +
            '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (k.item_nombre||'—') + '</td>' +
            '<td>' + (k.cantidad||0) + '</td><td>' + (k.unidad_medida||'') + '</td>' +
            '<td>S/.' + parseFloat(k.costo_unitario||0).toFixed(2) + '</td>' +
            '<td class="fw-bold">S/.' + parseFloat(k.costo_total||0).toFixed(2) + '</td>' +
            '<td class="text-end">' +
                (window.checkPerm('cfg_mant','d') ? '<button class="btn btn-xs btn-outline-danger" onclick="window.kitsEliminar('+k.id+',\\''+((k.item_nombre||'').replace(/'/g,''))+'\\')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-trash"></i></button>' : '') +
            '</td></tr>';
            
        // --- MOBILE CARDS LOGIC ---
        var nextK = window.kitsDataFil[index + 1];
        
        // Boundaries for MARCA
        var isFirstOfMarca = index === 0 || k.marca_vehiculo !== window.kitsDataFil[index-1].marca_vehiculo;
        var isLastOfMarca = !nextK || nextK.marca_vehiculo !== k.marca_vehiculo;
        
        // Boundaries for TIPO_MP (within Marca)
        var isFirstOfTipo = isFirstOfMarca || k.tipo_mp !== window.kitsDataFil[index-1].tipo_mp;
        var isLastOfTipo = isLastOfMarca || nextK.tipo_mp !== k.tipo_mp;
        
        if (isFirstOfMarca) {
            htmlMobile += '<div class="kits-list-card">';
            htmlMobile += '  <div style="padding: 1rem; border-bottom: 2px dashed #f1f5f9; display: flex; align-items: center; gap: 0.5rem; background:#f8fafc; border-radius: 16px 16px 0 0;">';
            htmlMobile += '    <i class="bi bi-truck" style="color:var(--primary,#5865F2);"></i>';
            htmlMobile += '    <span style="font-weight:900; font-size:1rem; color:#0f172a;">' + (k.marca_vehiculo||'—') + '</span>';
            htmlMobile += '  </div>';
            htmlMobile += '  <div style="padding: 0.5rem 1rem 1rem 1rem;">';
        }
        
        if (isFirstOfTipo) {
            var mpColorM = k.tipo_mp === 'MP1' ? 'bg-primary' : k.tipo_mp === 'MP2' ? 'bg-success' : k.tipo_mp === 'MP3' ? 'bg-warning text-dark' : 'bg-info text-dark';
            htmlMobile += '    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.75rem; margin-bottom:0.5rem;">';
            htmlMobile += '       <div>';
            htmlMobile += '         <span class="badge ' + mpColorM + ' me-1">' + k.tipo_mp + '</span>';
            htmlMobile += '         <span style="font-weight:700; font-size:0.85rem; color:#334155;">' + (k.nombre_kit || 'Kit') + '</span>';
            htmlMobile += '       </div>';
            if (window.checkPerm('cfg_mant','e')) {
                htmlMobile += '       <button class="btn btn-sm btn-outline-primary" style="padding:2px 10px; border-radius:12px; font-weight:700;" onclick="window.kitsEditarKit(\\''+k.marca_vehiculo+'\\',\\''+k.tipo_mp+'\\')"><i class="bi bi-pencil"></i></button>';
            }
            htmlMobile += '    </div>';
            htmlMobile += '    <div style="display:flex; flex-direction:column; gap:0.5rem;">';
        }
        
        htmlMobile += '      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #f1f5f9; padding-bottom:0.5rem;">';
        htmlMobile += '        <div style="flex:1; min-width:0; padding-right:0.5rem;">';
        htmlMobile += '           <div style="font-weight:700; font-size:0.85rem; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + (k.item_nombre||'—') + '</div>';
        htmlMobile += '           <div style="font-size:0.7rem; color:#64748b; margin-top:2px;">' + (k.cantidad||0) + ' ' + (k.unidad_medida||'') + ' x S/.' + parseFloat(k.costo_unitario||0).toFixed(2) + '</div>';
        htmlMobile += '        </div>';
        htmlMobile += '        <div class="text-end" style="flex-shrink:0;">';
        htmlMobile += '           <div style="font-weight:900; font-size:0.85rem; color:#0f172a;">S/.' + parseFloat(k.costo_total||0).toFixed(2) + '</div>';
        if (window.checkPerm('cfg_mant','d')) {
            htmlMobile += '           <button class="btn btn-link text-danger p-0 mt-1" style="font-size:0.75rem; text-decoration:none;" onclick="window.kitsEliminar('+k.id+',\\''+((k.item_nombre||'').replace(/'/g,''))+'\\')"><i class="bi bi-trash"></i> Eliminar</button>';
        }
        htmlMobile += '        </div>';
        htmlMobile += '      </div>';
        
        if (isLastOfTipo) {
            htmlMobile += '    </div>'; // close the flex-column items container
        }
        
        if (isLastOfMarca) {
            htmlMobile += '  </div>'; // close the padding container
            htmlMobile += '</div>'; // close kits-list-card
        }
    });
    
    if (tb) tb.innerHTML = html;
    if (grid) grid.innerHTML = htmlMobile;
`;

js = js.substring(0, startIndex) + newFunction + js.substring(endIndex);
fs.writeFileSync(jsPath, js, 'utf8');
console.log('JS replaced correctly');
