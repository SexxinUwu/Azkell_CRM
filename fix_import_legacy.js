const fs = require('fs');
let code = fs.readFileSync('routes/legacy.js', 'utf8');

const regex = /INSERT INTO fleetrun[\s\S]*?VALUES \?/g;
const replaceQuery = `INSERT INTO fleetrun
        (idRegistro, mes, anio, fecha, placa, marca, dueno, uts, tipo_mp, km_actual, frecuencia_km, km_proximo, km_gps, tecnico, observacion, combustible, modelo)
        VALUES ?`;
code = code.replace(regex, replaceQuery);

const updateRegex = /ON DUPLICATE KEY UPDATE[\s\S]*?anio=VALUES\(anio\)/g;
const replaceUpdate = `ON DUPLICATE KEY UPDATE
        fecha=VALUES(fecha), placa=VALUES(placa), marca=VALUES(marca), dueno=VALUES(dueno), uts=VALUES(uts), tipo_mp=VALUES(tipo_mp), km_actual=VALUES(km_actual),
        frecuencia_km=VALUES(frecuencia_km), km_proximo=VALUES(km_proximo), km_gps=VALUES(km_gps), tecnico=VALUES(tecnico), observacion=VALUES(observacion),
        mes=VALUES(mes), anio=VALUES(anio), combustible=VALUES(combustible), modelo=VALUES(modelo)`;
code = code.replace(updateRegex, replaceUpdate);

const valsRegex = /const vals = lote\.map\(r => \[[\s\S]*?\]\);/g;
const replaceVals = `
            const vals = lote.map(r => {
                let marca = r.marca || '';
                let dueno = r.dueno || '';
                let uts = r.uts || '';
                let comb = r.combustible || '';
                let mod = r.modelo || '';
                let wkm = r.km_gps || '';
                return [r.id, r.mes, r.anio, r.fecha, r.placa, marca, dueno, uts, r.tipomp, r.kmact, r.freckm, r.kmprox, wkm, r.tec, r.obs, comb, mod];
            });
`;
code = code.replace(valsRegex, replaceVals);

fs.writeFileSync('routes/legacy.js', code);
console.log('Fixed legacy.js import');
