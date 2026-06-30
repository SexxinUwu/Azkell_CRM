const fs = require('fs');
let code = fs.readFileSync('modulos/mantenimiento/fleetrun/logica.js', 'utf8');

const regex = /return \{\s*id: r\['ID'\].*?\s*fecha: fechaIngreso,\s*placa: r\['PLACA'\] \|\| '',[\s\S]*?anio: fechaIngreso \? fechaIngreso\.split\('-'\)\[0\] : ''\s*\};/g;

const replaceFunc = `
            let placaVal = r['PLACA'] || '';
            let marca = '', dueno = '', uts = '', combustible = '', modelo = '', wialonKm = '';
            
            let pMatch = window.dataGlobalPlacas && window.dataGlobalPlacas.find(p => p[0].toLowerCase() === placaVal.toLowerCase());
            if (pMatch) {
                dueno = pMatch[1] || '';
                marca = pMatch[3] || '';
                modelo = pMatch[4] || '';
                combustible = pMatch[14] || '';
                uts = pMatch[19] || '';
            }

            if (typeof buscarWialonPorPlaca === 'function') {
                let wD = buscarWialonPorPlaca(placaVal);
                if (wD && wD.km) {
                    wialonKm = Math.round(wD.km).toString();
                }
            }

            return {
                id: r['ID'] || \`FLT-\${Date.now()}-\${idx}\`,
                fecha: fechaIngreso,
                placa: placaVal,
                tipomp: r['TIPO MP'] || '',
                kmact: kmact.toString(),
                freckm: frec.toString(),
                kmprox: (kmact + frec).toString(),
                tec: r['TECNICO'] || '',
                obs: r['OBSERVACION'] || '',
                mes: fechaIngreso ? fechaIngreso.split('-')[1] : '',
                anio: fechaIngreso ? fechaIngreso.split('-')[0] : '',
                marca: marca,
                dueno: dueno,
                uts: uts,
                combustible: combustible,
                modelo: modelo,
                km_gps: wialonKm
            };
`;

code = code.replace(regex, replaceFunc);
fs.writeFileSync('modulos/mantenimiento/fleetrun/logica.js', code);
console.log('Fixed frontend import map');
