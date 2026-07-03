const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'azkell_crm'
});

db.connect((err) => {
    if (err) throw err;
    console.log('Connected!');
    
    const query = `
    ALTER TABLE vehiculos_flota 
        DROP COLUMN soat_constancia, 
        DROP COLUMN matpel_emision, 
        DROP COLUMN sc_emision,
        ADD COLUMN tc_constancia VARCHAR(50) AFTER tc_vencimiento,
        ADD COLUMN boni_emision DATE AFTER rt_vencimiento,
        ADD COLUMN ext_emision DATE AFTER fum_vencimiento;
    `;
    
    db.query(query, (err, result) => {
        if (err && err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
             console.error(err);
        } else {
             console.log('Table altered successfully or already altered.');
        }
        db.end();
    });
});
