const mysql = require('mysql2');
const pool = mysql.createPool({ host: '82.39.109.226', user: 'root', password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU', database: 'azkell_fleet', port: 3306 });

const vals = [[
    'Prev-2026-0001',
    null,
    45714,
    null,
    'CJJ736',
    'Marca',
    'Marsisa SAC',
    'Nacional',
    'Engrase',
    60000,
    60000,
    120000,
    40000,
    '',
    '',
    'Diesel',
    'Modelo'
]];

const sql = `
    INSERT INTO fleetrun
    (idRegistro, mes, anio, fecha, placa, marca, dueno, uts, tipo_mp, km_actual, frecuencia_km, km_proximo, km_gps, tecnico, observacion, combustible, modelo)
    VALUES ?
    ON DUPLICATE KEY UPDATE
    fecha=VALUES(fecha), placa=VALUES(placa), marca=VALUES(marca), dueno=VALUES(dueno), uts=VALUES(uts), tipo_mp=VALUES(tipo_mp), km_actual=VALUES(km_actual),
    frecuencia_km=VALUES(frecuencia_km), km_proximo=VALUES(km_proximo), km_gps=VALUES(km_gps), tecnico=VALUES(tecnico), observacion=VALUES(observacion),
    mes=VALUES(mes), anio=VALUES(anio), combustible=VALUES(combustible), modelo=VALUES(modelo)
`;

pool.query(sql, [vals], (err, res) => {
    if (err) console.error("Error MySQL:", err);
    else console.log("Success:", res);
    process.exit(0);
});
