const fs = require('fs');
let code = fs.readFileSync('modulos/mantenimiento/fleetrun/logica.js', 'utf8');

// 1. Fix fetch api/conductores-lista location
const brokenFetchRegex = /fetch\('\/api\/conductores-lista'\)[\s\S]*?\.catch\(function\(\) \{\}\);/g;
code = code.replace(brokenFetchRegex, '');

// Put it at the top of the file, outside of functions
const initCode = `
fetch('/api/conductores-lista')
    .then(function(r) { return r.json(); })
    .then(function(d) {
        window.dataGlobalConductores = (d || []).map(function(c) {
            var nom = (c.nombre || '').trim();
            return nom ? { value: nom, label: nom } : null;
        }).filter(Boolean);
    }).catch(function() {});
`;
code = initCode + '\n' + code;

// 2. Fix _cbInit call in abrirModalNuevoFleetrun and mostrarDetalleFleetrun
code = code.replace(/window\._cbInit\('f_tec', window\.dataGlobalConductores\.map\(function\(c\)\{ return \{value:c, label:c\}; \}\), 'Buscar técnico\.\.\.'\);/g, "window._cbInit('f_tec', window.dataGlobalConductores, 'Buscar responsable…');");
code = code.replace(/window\._cbInit\('eF_tec', window\.dataGlobalConductores\.map\(function\(c\)\{ return \{value:c, label:c\}; \}\), 'Buscar técnico\.\.\.'\);/g, "window._cbInit('eF_tec', window.dataGlobalConductores, 'Buscar responsable…');");

// 3. Fix autocompletarFleetrun for Combustible, Modelo, KM Wialon
const autoFunc = /document\.getElementById\(prefix \+ '_uts'\)\.value = match\[19\] \|\| "";/g;
const autoRepl = `document.getElementById(prefix + '_uts').value = match[19] || "";
        
        let combustibleElem = document.getElementById(prefix + '_combustible');
        if (combustibleElem) {
            combustibleElem.value = match[14] || "";
        }
        let modeloElem = document.getElementById(prefix + '_modelo');
        if (modeloElem) {
            modeloElem.value = match[4] || "";
        }

        let wialonElem = document.getElementById(prefix + '_kmgps');
        if (wialonElem && typeof buscarWialonPorPlaca === 'function') {
            let wD = buscarWialonPorPlaca(match[0]);
            if (wD && wD.km) {
                wialonElem.value = Math.round(wD.km);
            } else {
                wialonElem.value = '';
            }
        }
`;
code = code.replace(autoFunc, autoRepl);

fs.writeFileSync('modulos/mantenimiento/fleetrun/logica.js', code);
console.log('Fixed logica.js');
