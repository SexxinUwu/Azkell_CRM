const fs = require('fs');

let logica = fs.readFileSync('modulos/mantenimiento/fleetrun/logica.js', 'utf8');

// 1. Fetch Conductores
if (!logica.includes('fetch(\'/api/conductores-lista\')')) {
    const fetchConduc = `fetch('/api/conductores-lista')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            window.dataGlobalConductores = (d || []).map(function(c) { return c.nombre || ''; }).filter(Boolean);
        }).catch(function() {});
`;
    logica = logica.replace("fetch('/api/tipos-preventivo')", fetchConduc + "    fetch('/api/tipos-preventivo')");
}

// 2. _cbInit for new modal
if (!logica.includes("_cbInit('f_placa'")) {
    const initCode = `
    if (window.dataGlobalPlacas) window._cbInit('f_placa', window.dataGlobalPlacas.map(function(p){ return {value:p[0], label:p[0]}; }), 'Buscar placa...');
    if (window._frTipoLista) window._cbInit('f_tipomp', window._frTipoLista.map(function(t){ return {value:t, label:t}; }), 'Buscar tipo...');
    if (window.dataGlobalConductores) window._cbInit('f_tec', window.dataGlobalConductores.map(function(c){ return {value:c, label:c}; }), 'Buscar técnico...');
`;
    logica = logica.replace("frPlacaInit('f', '');", initCode);
    logica = logica.replace("frTipoInit('f', '');", "");
}

// 3. _cbInit and _cbSet for edit modal
if (!logica.includes("_cbInit('eF_placa'")) {
    const editCode = `
    if (window.dataGlobalPlacas) window._cbInit('eF_placa', window.dataGlobalPlacas.map(function(p){ return {value:p[0], label:p[0]}; }), 'Buscar placa...');
    if (window._frTipoLista) window._cbInit('eF_tipomp', window._frTipoLista.map(function(t){ return {value:t, label:t}; }), 'Buscar tipo...');
    if (window.dataGlobalConductores) window._cbInit('eF_tec', window.dataGlobalConductores.map(function(c){ return {value:c, label:c}; }), 'Buscar técnico...');
    
    if (fila[4]) window._cbSet('eF_placa', fila[4], fila[4]);
    if (fila[8]) window._cbSet('eF_tipomp', fila[8], fila[8]);
    if (fila[24]) window._cbSet('eF_tec', fila[24], fila[24]);
`;
    logica = logica.replace("document.getElementById('eF_tec').value = fila[24] || '';", "// eF_tec removed\n" + editCode);
    logica = logica.replace("frPlacaInit('eF', fila[4] || '');", "// frPlacaInit removed");
    logica = logica.replace("frTipoInit('eF', fila[8] || '');", "// frTipoInit removed");
}

// 4. Form Submission Fallbacks
const regexEnviar = /for \(let i = 0; i < formObj\.elements\.length; i\+\+\) \{\s*const el = formObj\.elements\[i\];\s*if \(el\.name\) data\[el\.name\] = el\.value;\s*\}/g;
const replacement = `for (let i = 0; i < formObj.elements.length; i++) {
        const el = formObj.elements[i];
        if (el.name) {
            let val = el.value;
            if (!val && document.getElementById(el.id + '-txt')) val = document.getElementById(el.id + '-txt').value;
            data[el.name] = val;
        }
    }`;

logica = logica.replace(regexEnviar, replacement);

fs.writeFileSync('modulos/mantenimiento/fleetrun/logica.js', logica);
console.log('Fixed logica.js');
