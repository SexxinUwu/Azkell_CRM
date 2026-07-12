const fs = require('fs');
const path = require('path');

const fileLogica = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'logica.js');
let logicaJs = fs.readFileSync(fileLogica, 'utf8');

// Replace pie chart logic
const pieOld = `            var famKeys = Object.keys(familiaValor).sort(function(a,b){ return familiaValor[b] - familiaValor[a]; });
            var famLabels = famKeys.slice(0,12);
            var famData = famLabels.map(function(k){ return familiaValor[k]; });
            var famLabelsFull = famLabels.map(function(k, i){ return k + ' (' + fmtM(famData[i]) + ')'; });`;
const pieNew = `            var famKeys = Object.keys(familiaValor).sort(function(a,b){ return familiaValor[b] - familiaValor[a]; });
            var topFamKeys = famKeys.slice(0, 7);
            var otrosFamVal = 0;
            famKeys.slice(7).forEach(function(k) { otrosFamVal += familiaValor[k]; });
            var famLabels = topFamKeys.slice();
            var famData = famLabels.map(function(k){ return familiaValor[k]; });
            if (otrosFamVal > 0) { famLabels.push('OTROS'); famData.push(otrosFamVal); }
            var famLabelsFull = famLabels.map(function(k, i){ return k + ' (' + fmtM(famData[i]) + ')'; });`;

logicaJs = logicaJs.replace(pieOld, pieNew);

// Replace pie click handler
const pieClickOld = `                                var familyClicked = famLabels[idx]; // el nombre original de la familia sin el monto
                                window.finAbrirInvFam(familyClicked);`;
const pieClickNew = `                                var familyClicked = famLabels[idx]; // el nombre original de la familia sin el monto
                                if (familyClicked !== 'OTROS') window.finAbrirInvFam(familyClicked);`;
logicaJs = logicaJs.replace(pieClickOld, pieClickNew);

// Replace bar chart logic
const barOld = `                var consKeys = Object.keys(consumoFamilia).sort(function(a,b){ return consumoFamilia[b] - consumoFamilia[a]; });
                var consLabels = consKeys.slice(0,10);
                var consData = consLabels.map(function(k){ return consumoFamilia[k]; });`;
const barNew = `                var consKeys = Object.keys(consumoFamilia).sort(function(a,b){ return consumoFamilia[b] - consumoFamilia[a]; });
                var topConsKeys = consKeys.slice(0, 8);
                var otrosConsVal = 0;
                consKeys.slice(8).forEach(function(k) { otrosConsVal += consumoFamilia[k]; });
                var consLabels = topConsKeys.slice();
                var consData = consLabels.map(function(k){ return consumoFamilia[k]; });
                if (otrosConsVal > 0) { consLabels.push('OTROS'); consData.push(otrosConsVal); }`;

logicaJs = logicaJs.replace(barOld, barNew);

// Replace bar click handler
const barClickOld = `                                    var familyClicked = consLabels[idx]; // el nombre real de la familia
                                    
window.finAbrirSalidasFam(familyClicked);`;
const barClickNew = `                                    var familyClicked = consLabels[idx]; // el nombre real de la familia
                                    if (familyClicked !== 'OTROS') window.finAbrirSalidasFam(familyClicked);`;
logicaJs = logicaJs.replace(barClickOld, barClickNew);

fs.writeFileSync(fileLogica, logicaJs, 'utf8');
console.log('Charts fixed to group rest as OTROS.');
