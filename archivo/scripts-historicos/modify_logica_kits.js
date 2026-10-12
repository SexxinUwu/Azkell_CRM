const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(file, 'utf8');

// 1. kitsCargarTabla
js = js.replace(
`        var prevMarca = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-marca') : '';
        var prevTipo  = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-tipo')  : '';`, 
`        var prevMarca = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-marca') : '';
        var prevModelo = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-modelo') : '';
        var prevTipo  = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-tipo')  : '';`);

js = js.replace(
`        if (typeof window._cbInit === 'function') { window._cbInit('kits-fil-marca', itemsMarca, 'Todas las marcas'); if (prevMarca) window._cbSet('kits-fil-marca', prevMarca, prevMarca); }

        var tipos = [];`,
`        if (typeof window._cbInit === 'function') { window._cbInit('kits-fil-marca', itemsMarca, 'Todas las marcas'); if (prevMarca) window._cbSet('kits-fil-marca', prevMarca, prevMarca); }

        var modelos = [];
        window.kitsData.forEach(function(k){ var m=(k.modelo_vehiculo||'TODOS LOS MODELOS').toUpperCase(); if(m && !modelos.includes(m)) modelos.push(m); });
        modelos.sort();
        var itemsModelo = modelos.map(function(m){ return { value: m, label: m }; });
        if (typeof window._cbInit === 'function') { window._cbInit('kits-fil-modelo', itemsModelo, 'Todos los modelos'); if (prevModelo) window._cbSet('kits-fil-modelo', prevModelo, prevModelo); }

        var tipos = [];`);

// 2. kitsFiltrar
js = js.replace(
`    var filMarca = ((document.getElementById('kits-fil-marca')||{}).value||'');
    var filTipo  = ((document.getElementById('kits-fil-tipo') ||{}).value||'');`,
`    var filMarca = ((document.getElementById('kits-fil-marca')||{}).value||'');
    var filModelo = ((document.getElementById('kits-fil-modelo')||{}).value||'');
    var filTipo  = ((document.getElementById('kits-fil-tipo') ||{}).value||'');`);

js = js.replace(
`        return (!filMarca || (k.marca_vehiculo||'').toUpperCase()===filMarca.toUpperCase()) &&
               (!filTipo  || k.tipo_mp===filTipo);`,
`        return (!filMarca || (k.marca_vehiculo||'').toUpperCase()===filMarca.toUpperCase()) &&
               (!filModelo || (k.modelo_vehiculo||'TODOS LOS MODELOS').toUpperCase()===filModelo.toUpperCase()) &&
               (!filTipo  || k.tipo_mp===filTipo);`);

// 3. The Desktop Table loop
js = js.replace(
`    var lastMarca = null;
    var lastTipo  = null;`,
`    var lastMarca = null;
    var lastModelo = null;
    var lastTipo  = null;`);

js = js.replace(
`        // --- DESKTOP TABLE LOGIC ---
        if (k.marca_vehiculo !== lastMarca) {
            html += '<tr style="background:var(--surface)">' +
                '<td colspan="8" class="fw-bold py-1 px-2" style="font-size:0.8rem; border-top:2px solid var(--border); color:var(--text)">' +
                '<i class="bi bi-truck me-1" style="color:var(--primary,#5865F2)"></i>' + (k.marca_vehiculo||'—') + '</td></tr>';
            lastMarca = k.marca_vehiculo;
            lastTipo  = null;
        }`,
`        // --- DESKTOP TABLE LOGIC ---
        if (k.marca_vehiculo !== lastMarca || (k.modelo_vehiculo||'TODOS LOS MODELOS') !== lastModelo) {
            var dispModelo = (k.modelo_vehiculo && k.modelo_vehiculo !== 'TODOS LOS MODELOS') ? (' - ' + k.modelo_vehiculo) : '';
            html += '<tr style="background:var(--surface)">' +
                '<td colspan="8" class="fw-bold py-1 px-2" style="font-size:0.8rem; border-top:2px solid var(--border); color:var(--text)">' +
                '<i class="bi bi-truck me-1" style="color:var(--primary,#5865F2)"></i>' + (k.marca_vehiculo||'—') + dispModelo + '</td></tr>';
            lastMarca = k.marca_vehiculo;
            lastModelo = k.modelo_vehiculo || 'TODOS LOS MODELOS';
            lastTipo  = null;
        }`);

js = js.replace(
`        if (k.tipo_mp !== lastTipo) {
            var mpColor = k.tipo_mp === 'MP1' ? 'bg-primary' : k.tipo_mp === 'MP2' ? 'bg-success' : k.tipo_mp === 'MP3' ? 'bg-warning text-dark' : 'bg-info text-dark';
            html += '<tr style="background:var(--bg)">' +
                '<td></td>' +
                '<td colspan="7" class="py-1 px-2" style="font-size:0.75rem; border-bottom:1px dashed var(--border)">' +
                '<div class="d-flex justify-content-between align-items-center">' +
                '<span><span class="badge ' + mpColor + ' me-1">' + k.tipo_mp + '</span>' + (k.nombre_kit ? ' <span class="text-muted fw-bold ms-2">' + k.nombre_kit + '</span>' : '') + '</span>' +
                (window.checkPerm('cfg_mant','e') ? '<button class="btn btn-xs btn-outline-primary" onclick="window.kitsEditarKit(\\''+k.marca_vehiculo+'\\',\\''+k.tipo_mp+'\\')" style="font-size:0.7rem;padding:2px 8px"><i class="bi bi-pencil me-1"></i>Editar Kit</button>' : '') +
                '</div></td></tr>';
            lastTipo = k.tipo_mp;
        }`,
`        if (k.tipo_mp !== lastTipo) {
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
        }`);

// 4. The Mobile Grid loop boundaries
js = js.replace(
`        // Boundaries for MARCA
        var isFirstOfMarca = index === 0 || k.marca_vehiculo !== window.kitsDataFil[index-1].marca_vehiculo;
        var isLastOfMarca = !nextK || nextK.marca_vehiculo !== k.marca_vehiculo;`,
`        // Boundaries for MARCA
        var isFirstOfMarca = index === 0 || k.marca_vehiculo !== window.kitsDataFil[index-1].marca_vehiculo || (k.modelo_vehiculo||'TODOS LOS MODELOS') !== (window.kitsDataFil[index-1].modelo_vehiculo||'TODOS LOS MODELOS');
        var isLastOfMarca = !nextK || nextK.marca_vehiculo !== k.marca_vehiculo || (nextK.modelo_vehiculo||'TODOS LOS MODELOS') !== (k.modelo_vehiculo||'TODOS LOS MODELOS');`);

js = js.replace(
`            htmlMobile += '    <i class="bi bi-truck" style="color:var(--primary,#5865F2);"></i>';
            htmlMobile += '    <span style="font-weight:900; font-size:1rem; color:#0f172a;">' + (k.marca_vehiculo||'—') + '</span>';`,
`            htmlMobile += '    <i class="bi bi-truck" style="color:var(--primary,#5865F2);"></i>';
            var dMod = (k.modelo_vehiculo && k.modelo_vehiculo !== 'TODOS LOS MODELOS') ? (' <span style="font-weight:600;color:#64748b;font-size:0.85rem">- '+k.modelo_vehiculo+'</span>') : '';
            htmlMobile += '    <span style="font-weight:900; font-size:1rem; color:#0f172a;">' + (k.marca_vehiculo||'—') + dMod + '</span>';`);

js = js.replace(
`            if (window.checkPerm('cfg_mant','e')) {
                htmlMobile += '       <button class="btn btn-sm btn-outline-primary" style="padding:2px 10px; border-radius:12px; font-weight:700;" onclick="window.kitsEditarKit(\\''+k.marca_vehiculo+'\\',\\''+k.tipo_mp+'\\')"><i class="bi bi-pencil"></i></button>';
            }`,
`            // Calculate MP Total for mobile
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
            }`);

// 5. kitsAbrirModal reset modelo
js = js.replace(
`window.kitsAbrirModal = function() {
    var mEl = document.getElementById('kits-marca');
    if (mEl) mEl.value = '';`,
`window.kitsAbrirModal = function() {
    var mEl = document.getElementById('kits-marca');
    if (mEl) mEl.value = '';
    var mMod = document.getElementById('kits-modelo');
    if (mMod) mMod.value = 'TODOS LOS MODELOS';`);

// 6. kitsEditarKit
js = js.replace(
`window.kitsEditarKit = function(marca, tipo) {
    var mEl = document.getElementById('kits-marca');
    if (mEl) mEl.value = marca;`,
`window.kitsEditarKit = function(marca, modelo, tipo) {
    var mEl = document.getElementById('kits-marca');
    if (mEl) mEl.value = marca;
    var mMod = document.getElementById('kits-modelo');
    if (mMod) mMod.value = modelo;`);

js = js.replace(
`    var myKits = window.kitsData.filter(function(k){ 
        return k.marca_vehiculo===marca && k.tipo_mp===tipo; 
    });`,
`    var myKits = window.kitsData.filter(function(k){ 
        return k.marca_vehiculo===marca && (k.modelo_vehiculo||'TODOS LOS MODELOS')===modelo && k.tipo_mp===tipo; 
    });`);

js = js.replace(
`    if(myKits.length) {
        var mEl = document.getElementById('kits-marca');
        if(mEl) mEl.value = marca;`,
`    if(myKits.length) {
        var mEl = document.getElementById('kits-marca');
        if(mEl) mEl.value = marca;
        var mMod = document.getElementById('kits-modelo');
        if(mMod) mMod.value = modelo;`);

// 7. kitsGuardar
js = js.replace(
`window.kitsGuardar = function() {
    var marca = document.getElementById('kits-marca').value.trim().toUpperCase();`,
`window.kitsGuardar = function() {
    var marca = document.getElementById('kits-marca').value.trim().toUpperCase();
    var modelo = (document.getElementById('kits-modelo') ? document.getElementById('kits-modelo').value.trim().toUpperCase() : 'TODOS LOS MODELOS');
    if (!modelo) modelo = 'TODOS LOS MODELOS';`);

js = js.replace(
`    var tipo  = ((document.getElementById('kits-tipomp')||{}).value||'').trim().toUpperCase();
    if (!marca || !tipo) {`,
`    var tipo  = ((document.getElementById('kits-tipomp')||{}).value||'').trim().toUpperCase();
    if (!marca || !tipo) {`);

js = js.replace(
`            var payload = {
                marca_vehiculo: marca,
                tipo_mp: tipo,
                nombre_kit: nkit,
                item_codigo: r.codigo || '-',
                item_nombre: r.nombre,
                cantidad: r.cant,
                unidad_medida: r.unidad,
                costo_unitario: r.costo,
                costo_total: r.total,
                orden: i+1
            };`,
`            var payload = {
                marca_vehiculo: marca,
                modelo_vehiculo: modelo,
                tipo_mp: tipo,
                nombre_kit: nkit,
                item_codigo: r.codigo || '-',
                item_nombre: r.nombre,
                cantidad: r.cant,
                unidad_medida: r.unidad,
                costo_unitario: r.costo,
                costo_total: r.total,
                orden: i+1
            };`);

// 8. popular datalists
js = js.replace(
`    function _fill(id, vals) {
        var dl = document.getElementById(id);
        if (dl) dl.innerHTML = vals.map(function(v){ return '<option value="'+v+'">'; }).join('');
    }
    _fill('kits-dl-marcas', marcas);
}`,
`    function _fill(id, vals) {
        var dl = document.getElementById(id);
        if (dl) dl.innerHTML = vals.map(function(v){ return '<option value="'+v+'">'; }).join('');
    }
    _fill('kits-dl-marcas', marcas);

    var modelos = [];
    window.kitsData.forEach(function(k) {
        var m = (k.modelo_vehiculo || 'TODOS LOS MODELOS').trim().toUpperCase();
        if (m && !modelos.includes(m)) modelos.push(m);
    });
    modelos.sort();
    _fill('kits-dl-modelos', modelos);
}`);

// 9. onchange marca (kitsMarcaCambiada)
js = js.replace(
`// ── Cargar combobox Tipos de Preventivo (modal) ───────────────────`,
`window.kitsMarcaCambiada = function(marcaStr) {
    if(!marcaStr) return;
    marcaStr = marcaStr.toUpperCase();
    var foundMod = false;
    for (var i=0; i<window.kitsData.length; i++) {
        if (window.kitsData[i].marca_vehiculo === marcaStr && window.kitsData[i].modelo_vehiculo && window.kitsData[i].modelo_vehiculo !== 'TODOS LOS MODELOS') {
            document.getElementById('kits-modelo').value = window.kitsData[i].modelo_vehiculo;
            foundMod = true;
            break;
        }
    }
    if (!foundMod) document.getElementById('kits-modelo').value = 'TODOS LOS MODELOS';
};

// ── Cargar combobox Tipos de Preventivo (modal) ───────────────────`);

fs.writeFileSync(file, js, 'utf8');
console.log('logica.js rewritten for modelo_vehiculo securely');
