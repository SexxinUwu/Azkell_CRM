const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const pool = mysql.createPool({ host: '82.39.109.226', user: 'root', password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU', database: 'azkell_fleet', port: 3306 });

const app = express();
app.use(bodyParser.json());

app.post('/api/eliminarMasivo', (req, res) => {
    const { ids, coleccion } = req.body;
    let tabla = '';
    let campoId = 'idRegistro';

    if (coleccion === 'Placas') { tabla = 'placas'; campoId = 'placa'; }
    else if (coleccion === 'Fleetrun' || coleccion === 'Mantenimientos') { tabla = 'fleetrun'; }
    else if (coleccion === 'Inspecciones' || coleccion === 'statusMant') { tabla = 'inspecciones'; campoId = 'id'; }
    else if (coleccion === 'StatusFlota' || coleccion === 'statusFlota') { tabla = 'status_flota'; }
    
    console.log("Req body:", req.body);
    console.log("Tabla:", tabla, "Campo:", campoId);

    const sql = `DELETE FROM ${tabla} WHERE ${campoId} IN (?)`;
    console.log("SQL:", sql);

    pool.getConnection((err, connection) => {
        connection.query('SET FOREIGN_KEY_CHECKS=0;', (err) => {
            connection.query(sql, [ids], (errDelete, result) => {
                connection.query('SET FOREIGN_KEY_CHECKS=1;', () => {
                    connection.release();
                    console.log("Query result:", result);
                    res.json({ data: 'Éxito', afectados: result.affectedRows });
                });
            });
        });
    });
});

app.listen(3333, async () => {
    console.log("Listening on 3333");
    // Make a request
    const [rows] = await pool.promise().query("SELECT idRegistro FROM fleetrun LIMIT 1");
    if(!rows.length) return process.exit(0);
    
    const id = rows[0].idRegistro;
    console.log("Fetching id:", id);
    const res = await fetch('http://localhost:3333/api/eliminarMasivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], coleccion: 'Mantenimientos' })
    });
    console.log("Response:", await res.json());
    process.exit(0);
});
