const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// 1. Fix the kitsEditarKit parameters in the desktop table
js = js.replace(
/onclick="window\.kitsEditarKit\('\\''\+k\.marca_vehiculo\+'\\','\\''\+k\.tipo_mp\+'\\'\)"/g,
`onclick="window.kitsEditarKit(\\''+k.marca_vehiculo+'\\',\\''+(k.modelo_vehiculo||'TODOS LOS MODELOS')+'\\',\\''+k.tipo_mp+'\\')"`
);

// 2. Fix the kitsEditarKit parameters in the mobile table
js = js.replace(
/onclick="window\.kitsEditarKit\('\\''\+k\.marca_vehiculo\+'\\','\\''\+k\.tipo_mp\+'\\'\)"/g,
`onclick="window.kitsEditarKit(\\''+k.marca_vehiculo+'\\',\\''+(k.modelo_vehiculo||'TODOS LOS MODELOS')+'\\',\\''+k.tipo_mp+'\\')"`
);

// Actually, replacing exactly might be hard, let's use a safer regex:
js = js.replace(
/onclick="window\.kitsEditarKit\('\\''\+k\.marca_vehiculo\+'\\',\\''\+k\.tipo_mp\+'\\'\)"/g,
`onclick="window.kitsEditarKit(\\''+k.marca_vehiculo+'\\', \\''+(k.modelo_vehiculo||'TODOS LOS MODELOS')+'\\', \\''+k.tipo_mp+'\\')"`
);

// 3. Redefine kitsEditarKit
js = js.replace(
/window\.kitsEditarKit = function\(marca, tipo\) \{/,
`window.kitsEditarKit = function(marca, modelo, tipo) {`
);

// Inside kitsEditarKit, update _cbSet and filtering
js = js.replace(
/var items = window\.kitsData\.filter\(function\(k\) \{\s*return \(k\.marca_vehiculo\|\|''\)\.toUpperCase\(\) === \(marca\|\|''\)\.toUpperCase\(\) && \s*\(k\.tipo_mp\|\|''\)\.toUpperCase\(\) === \(tipo\|\|''\)\.toUpperCase\(\);\s*\}\);/,
`var items = window.kitsData.filter(function(k) {
        return (k.marca_vehiculo||'').toUpperCase() === (marca||'').toUpperCase() && 
               (k.modelo_vehiculo||'TODOS LOS MODELOS').toUpperCase() === (modelo||'TODOS LOS MODELOS').toUpperCase() &&
               (k.tipo_mp||'').toUpperCase() === (tipo||'').toUpperCase();
    });`
);

js = js.replace(
/var mEl = document\.getElementById\('kits-marca'\);\s*if \(mEl\) mEl\.value = marca;\s*var t = document\.getElementById\('kitsModal-titulo'\);\s*if\(t\) t\.innerHTML='<i class="bi bi-pencil me-1 text-primary"><\/i>Editar Kit — ' \+ marca \+ ' ' \+ tipo;/,
`if(window._cbSet) { window._cbSet('kits-marca', marca, marca); window._cbSet('kits-modelo', modelo, modelo); }
    window.kitsActualizarTituloModal();`
);

// In kitsAbrirModal:
js = js.replace(
/var t = document\.getElementById\('kitsModal-titulo'\);\s*if\(t\) t\.innerHTML='<i class="bi bi-plus-circle me-1 text-primary"><\/i>Configurar Kit de Mantenimiento';/,
`window.kitsActualizarTituloModal();`
);


// 4. Add kitsActualizarTituloModal
const updateTitleFunc = `
window.kitsActualizarTituloModal = function() {
    setTimeout(function() {
        var t = document.getElementById('kitsModal-titulo');
        if (!t) return;
        var mTxt = document.getElementById('kits-marca-txt');
        var modTxt = document.getElementById('kits-modelo-txt');
        var tTxt = document.getElementById('kits-tipomp-txt');
        
        var m = (mTxt ? mTxt.value.trim().toUpperCase() : '');
        var mod = (modTxt ? modTxt.value.trim().toUpperCase() : '');
        var tip = (tTxt ? tTxt.value.trim().toUpperCase() : '');

        var arr = [];
        if (m) arr.push(m);
        if (mod && mod !== 'TODOS LOS MODELOS') arr.push(mod);
        var middle = arr.length > 0 ? arr.join(' - ') : '';
        
        var str = '';
        if (middle) str += middle;
        if (tip) {
            if (str) str += ' | ';
            str += tip;
        }

        var mode = (document.getElementById('kits-form-container') && document.getElementById('kits-form-container').innerHTML !== '') ? 'Editar' : 'Configurar';

        if (str) {
            t.innerHTML = '<i class="bi bi-tools me-1 text-primary"></i>Kit: ' + str;
        } else {
            t.innerHTML = '<i class="bi bi-tools me-1 text-primary"></i>Configurar Kit de Mantenimiento';
        }
    }, 100);
};
`;

js = js + '\n' + updateTitleFunc;

// update the callbacks to call it
js = js.replace(
/window\._cbCallbacks\['kits-marca'\] = function\(val\) \{ window\.kitsMarcaCambiada\(val\); \};/,
`window._cbCallbacks['kits-marca'] = function(val) { window.kitsMarcaCambiada(val); window.kitsActualizarTituloModal(); };
        window._cbCallbacks['kits-modelo'] = function(val) { window.kitsActualizarTituloModal(); };`
);

js = js.replace(
/window\._cbInit\('kits-tipomp', items, 'Buscar tipo\.\.\.'\);\s*if \(presetVal && typeof window\._cbSet === 'function'\) \{\s*window\._cbSet\('kits-tipomp', presetVal, presetVal\);\s*\}/,
`window._cbInit('kits-tipomp', items, 'Buscar tipo...');
                if (presetVal && typeof window._cbSet === 'function') {
                    window._cbSet('kits-tipomp', presetVal, presetVal);
                }
                window._cbCallbacks = window._cbCallbacks || {};
                window._cbCallbacks['kits-tipomp'] = function(val) { window.kitsActualizarTituloModal(); };`
);


fs.writeFileSync(fileJs, js, 'utf8');

const fileHtml = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

html = html.replace(
/oninput="window\._cbFiltrar\('kits-marca'\)"/g,
`oninput="window._cbFiltrar('kits-marca'); window.kitsActualizarTituloModal();"`
);
html = html.replace(
/oninput="window\._cbFiltrar\('kits-modelo'\)"/g,
`oninput="window._cbFiltrar('kits-modelo'); window.kitsActualizarTituloModal();"`
);
html = html.replace(
/oninput="window\._cbFiltrar\('kits-tipomp'\)"/g,
`oninput="window._cbFiltrar('kits-tipomp'); window.kitsActualizarTituloModal();"`
);

fs.writeFileSync(fileHtml, html, 'utf8');

