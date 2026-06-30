const mysql = require('mysql2/promise');
async function run() {
    try {
        const conn = await mysql.createConnection({ host: '82.39.109.226', user: 'root', password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU', database: 'azkell_fleet', port: 3306 });
        
        const sql = `
            INSERT INTO fleetrun
            (idRegistro, mes, anio, fecha, placa, marca, dueno, uts, tipo_mp, km_actual, frecuencia_km, km_proximo, km_gps, tecnico, observacion, combustible, modelo)
            VALUES ?
            ON DUPLICATE KEY UPDATE
            fecha=VALUES(fecha), placa=VALUES(placa), marca=VALUES(marca), dueno=VALUES(dueno), uts=VALUES(uts), tipo_mp=VALUES(tipo_mp), km_actual=VALUES(km_actual),
            frecuencia_km=VALUES(frecuencia_km), km_proximo=VALUES(km_proximo), km_gps=VALUES(km_gps), tecnico=VALUES(tecnico), observacion=VALUES(observacion),
            mes=VALUES(mes), anio=VALUES(anio), combustible=VALUES(combustible), modelo=VALUES(modelo)
        `;
        
        const vals = [
            ['TEST_ID_123', 0, 0, '2026-06-29', 'ABC-123', '', '', '', 'MANT', 0, 0, 0, '', '', '', '', '']
        ];
        
        await conn.query(sql, [vals]);
        console.log('Success');
        process.exit(0);
    } catch(e) { console.error('ERROR:', e.message); process.exit(1); }
}
run();
