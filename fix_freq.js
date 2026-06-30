const fs = require('fs');
let code = fs.readFileSync('modulos/mantenimiento/fleetrun/logica.js', 'utf8');

const freqFunc = `
window.calcularFrecuenciaFleetrun = function(prefix) {
    if (!window.dataTiposMant || window.dataTiposMant.length === 0) return;
    
    let marca = (document.getElementById(prefix + '_marca').value || '').trim().toLowerCase();
    let tipoMP = (document.getElementById(prefix + '_tipomp').value || '').trim().toLowerCase();
    let uts = (document.getElementById(prefix + '_uts').value || '').trim().toLowerCase();
    let combustible = (document.getElementById(prefix + '_combustible').value || '').trim().toLowerCase();
    let modelo = (document.getElementById(prefix + '_modelo').value || '').trim().toLowerCase();

    if (!marca || !tipoMP) return;

    let match = window.dataTiposMant.find(t => {
        let tMarca = (t.marca || '').trim().toLowerCase();
        let tTipoMP = (t.tipo_mp || '').trim().toLowerCase();
        let tUts = (t.uts || '').trim().toLowerCase();
        let tComb = (t.combustible || '').trim().toLowerCase();
        let tMod = (t.modelo || '').trim().toLowerCase();
        
        let matchMarca = (!tMarca || tMarca === marca);
        let matchTipoMP = (!tTipoMP || tTipoMP === tipoMP);
        let matchUts = (!tUts || tUts === uts);
        let matchComb = (!tComb || tComb === combustible);
        let matchMod = (!tMod || tMod === modelo);
        
        return matchMarca && matchTipoMP && matchUts && matchComb && matchMod;
    });

    if (match) {
        let placaInput = document.getElementById(prefix + '_placa').value;
        let pMatch = window.dataGlobalPlacas && window.dataGlobalPlacas.find(p => p[0] === placaInput);
        let metrica = (pMatch && pMatch[23] ? pMatch[23].toString().toUpperCase() : 'KM');
        
        let frec = 0;
        if (metrica.includes('HR') || metrica.includes('HORA')) {
            frec = match.frecuencia_horas || match.frecuencia_km || 0;
        } else {
            frec = match.frecuencia_km || match.frecuencia_horas || 0;
        }

        if (frec > 0) {
            let elemFrec = document.getElementById(prefix + '_freckm');
            if (elemFrec) {
                elemFrec.value = frec;
                if (typeof window.calcularProximo === 'function') {
                    window.calcularProximo(prefix);
                }
            }
        }
    }
};
`;

if (!code.includes('calcularFrecuenciaFleetrun')) {
    code = code + '\n' + freqFunc;
}

const cbSelect = `
window._cbOnSelect('f_placa', function() { window.autocompletarFleetrun('f'); window.calcularFrecuenciaFleetrun('f'); });
window._cbOnSelect('eF_placa', function() { window.autocompletarFleetrun('eF'); window.calcularFrecuenciaFleetrun('eF'); });
window._cbOnSelect('f_tipomp', function() { window.calcularFrecuenciaFleetrun('f'); });
window._cbOnSelect('eF_tipomp', function() { window.calcularFrecuenciaFleetrun('eF'); });
`;

if (!code.includes("window._cbOnSelect('f_tipomp'")) {
    code = code.replace(/function abrirModalNuevoFleetrun\(\)/, cbSelect + '\nfunction abrirModalNuevoFleetrun()');
}

fs.writeFileSync('modulos/mantenimiento/fleetrun/logica.js', code);
console.log('Fixed frequency calc');
