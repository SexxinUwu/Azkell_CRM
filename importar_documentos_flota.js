require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const mysql = require('mysql2');

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

const resultados = [];

// Convertir formato DD/MM/YYYY a YYYY-MM-DD
function formatearFecha(f) {
    if (!f || f.trim() === '') return null;
    f = f.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
    if (f.includes('/')) {
        const p = f.split('/');
        if (p.length === 3) {
            // Asumiendo formato local DD/MM/YYYY
            return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
        }
    }
    return null;
}

fs.createReadStream('Plantilla_Documentos_Flota.csv')
    .pipe(csv())
    .on('data', (data) => resultados.push(data))
    .on('end', () => {
        console.log(`Leídas ${resultados.length} filas del archivo CSV.`);
        
        let inserts = [];
        
        for (let row of resultados) {
            let placa = row['PLACA']?.trim();
            if (!placa) continue;
            
            // Función auxiliar para pushear documentos
            const pushDoc = (tipo, emision, vencimiento, constancia = '', entidad = '', asesor = '', observaciones = '') => {
                let v = formatearFecha(vencimiento);
                if (v || emision || constancia || observaciones) { // Si hay algo de info
                    let e = formatearFecha(emision);
                    let id = `DOC-${Date.now()}-${Math.floor(Math.random()*100000)}`;
                    inserts.push([id, placa.toUpperCase(), tipo, entidad, constancia, e, v, '', asesor, observaciones, 'admin_import']);
                }
            };
            
            pushDoc('Tarjeta de Circulación', null, row['TC_VENCIMIENTO']);
            pushDoc('SOAT', null, row['SOAT_VENCIMIENTO'], row['SOAT_CONSTANCIA']);
            pushDoc('Certificado MATPEL', row['MATPEL_EMISION'], row['MATPEL_VENCIMIENTO'], row['MATPEL_CONSTANCIA']);
            pushDoc('Revisión Técnica', row['RT_EMISION'], row['RT_VENCIMIENTO']);
            pushDoc('Bonificación', null, row['BONI_VENCIMIENTO']);
            pushDoc('Seguro Vehicular', null, row['SEGVEH_VENCIMIENTO'], '', row['SEGVEH_ENTIDAD'], row['SEGVEH_ASESOR']);
            pushDoc('Seguro Carga', row['SEGCARGA_EMISION'], row['SEGCARGA_VENCIMIENTO'], '', row['SEGCARGA_ENTIDAD'], row['SEGCARGA_ASESOR']);
            pushDoc('Certificado Fumigación', row['FUMIG_EMISION'], row['FUMIG_VENCIMIENTO']);
            
            if (row['EXTINTORES_CANT'] && row['EXTINTORES_CANT'].trim() !== '') {
                pushDoc('Extintores', null, null, '', '', '', `Cantidad: ${row['EXTINTORES_CANT']}`);
            }
        }
        
        console.log(`Se generaron ${inserts.length} registros de documentos a insertar.`);
        
        if (inserts.length === 0) {
            console.log("No hay documentos para insertar.");
            process.exit(0);
        }
        
        const query = `
            INSERT INTO documentos_flota 
            (id, placa, tipo_documento, entidad, nro_constancia, fecha_emision, fecha_vencimiento, pago, asesor, observaciones, usuario)
            VALUES ?
        `;
        
        db.query(query, [inserts], (err, result) => {
            if (err) {
                console.error("Error al insertar en la base de datos:", err);
            } else {
                console.log("¡Importación exitosa! Registros afectados:", result.affectedRows);
            }
            process.exit(0);
        });
    });
