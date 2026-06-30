const fs = require('fs');
let code = fs.readFileSync('routes/legacy_backup4.js', 'utf8');

// We will find the start and end of importarFleetrunMasivo
let start = code.indexOf('/importarFleetrunMasivo');
let end = code.indexOf('/importarPlacasMasivo', start); // next block
if (end === -1) end = code.indexOf('/importarInspeccionesMasivo', start); // fallback
if (end === -1) end = code.length;

let block = code.substring(start, end);

// Fix the SQL in this block
const replaceQuery = `INSERT INTO fleetrun
        (idRegistro, mes, anio, fecha, placa, marca, dueno, uts, tipo_mp, km_actual, frecuencia_km, km_proximo, km_gps, tecnico, observacion, combustible, modelo)
        VALUES ?`;
block = block.replace(/INSERT INTO fleetrun[\s\S]*?VALUES \?/, replaceQuery);

const replaceUpdate = `ON DUPLICATE KEY UPDATE
        fecha=VALUES(fecha), placa=VALUES(placa), marca=VALUES(marca), dueno=VALUES(dueno), uts=VALUES(uts), tipo_mp=VALUES(tipo_mp), km_actual=VALUES(km_actual),
        frecuencia_km=VALUES(frecuencia_km), km_proximo=VALUES(km_proximo), km_gps=VALUES(km_gps), tecnico=VALUES(tecnico), observacion=VALUES(observacion),
        mes=VALUES(mes), anio=VALUES(anio), combustible=VALUES(combustible), modelo=VALUES(modelo)`;
block = block.replace(/ON DUPLICATE KEY UPDATE[\s\S]*?anio=VALUES\(anio\)/, replaceUpdate);

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
block = block.replace(/const vals = lote\.map\([\s\S]*?\]\);/, replaceVals);

// Put it back
code = code.substring(0, start) + block + code.substring(end);
fs.writeFileSync('routes/legacy.js', code);
console.log('Restored and fixed legacy.js');
