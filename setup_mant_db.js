const mysql = require('mysql2');
require('dotenv').config({ path: __dirname + '/.env' });

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10
});

const query = `
CREATE TABLE IF NOT EXISTS \`mant_insp_templates\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`template_id\` VARCHAR(30) NOT NULL COMMENT 'ID único de la categoría (ej: cat_1)',
  \`titulo\` VARCHAR(150) NOT NULL COMMENT 'Nombre de la categoría',
  \`items_json\` JSON NOT NULL COMMENT 'Array de ítems: [{id, label, type}]',
  \`orden\` INT NOT NULL DEFAULT 0,
  \`activo\` TINYINT(1) NOT NULL DEFAULT 1,
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_template_id\` (\`template_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Plantilla global del checklist de inspecciones de mantenimiento';
`;

db.query(query, (err, result) => {
    if (err) {
        console.error('Error creating table:', err);
        process.exit(1);
    }
    console.log('Table mant_insp_templates created successfully.');
    
    // Check if table is empty to insert initial WIZARD_SCHEMA as default if needed
    db.query('SELECT COUNT(*) AS cnt FROM mant_insp_templates', (err2, rows) => {
        if (err2) {
             console.error('Error counting table:', err2); process.exit(1);
        }
        if (rows[0].cnt === 0) {
            console.log('Table is empty. Inserting default schema...');
            const WIZARD_SCHEMA = [
                { tab: "2. II. MOTOR", items: ["1. Niveles de Motor", "2. Sistema lubricacion de fugas", "3. Sistema Combustible", "4. Sistema de Refrigeracion", "5. Correas, ventilador y accesorios", "6. Codigo Falla", "II.7 Otros"] },
                { tab: "3. III. S. ELÉCTRICO", items: ["1. Inspeccion de Luces General", {label: "2. Amperaje de bateria", type:"text"}] },
                { tab: "4. S. DE AIRE", items: ["Inspeccion General de Aire", "Mantenimiento de Valvulas", "Inspeccion de Manitos de aire"] },
                { tab: "5. IV. TRANSMISIÓN", items: ["1. Embrague", "2. Caja de Cambios", "3. Diferencial", "4. Cardanes", "IV. 5 Otros"] },
                { tab: "6. V. DIRECCIÓN", items: ["1. Servo direccion", "2. Alinemiento", "3. Pines, bocinas y terminales", "4. CAJA DE DIRECCION", "V.5 Otros"] },
                { tab: "7. VI. FRENOS", items: ["1. Limpieza y regulacion", {label: "Zapatas Delanteras /Pastillas Delanteras", type:"percent"}, {label: "Zapata De Traccion/Primer Eje De Traccion", type:"percent"}, {label: "Zapatas Eje Loco/ Segundo Eje De Traccion", type:"percent"}, {label: "Disco De Embrague", type:"percent"}, "VI.4 Otros"] },
                { tab: "8. VII. SUSPENSIÓN", items: ["1. Mueles, Bolsas De Aire", "VII 2. Amortiguadores", "VII 3. Eje Barras Estabilizadoraa", "VII.4 Otros"] },
                { tab: "9. VIII. HERMETIZADO", items: ["VIII.1 Cabina Exterior e Interior", "VIII.2 Puerta, chapa y asientos", "VIII.3 Chasis, tornamesa y bastidor", "VIII.4 Furgon extructuras laterales", "VIII.5 Otros"] },
                { tab: "10. IX. DAÑOS", items: [{label: "IX. Daños Encontrados", type:"text"}] }
            ];

            let insertQuery = 'INSERT INTO mant_insp_templates (template_id, titulo, items_json, orden) VALUES ?';
            let values = WIZARD_SCHEMA.map((sec, index) => {
                let itemsFormateados = (sec.items || []).map((item, j) => {
                    return {
                        id: 'item_' + Date.now() + '_' + j,
                        label: typeof item === 'string' ? item : item.label,
                        type: typeof item === 'string' ? 'okfalla' : item.type
                    };
                });
                // Remove the prefix number (e.g. "2. II. MOTOR" -> "II. MOTOR")
                let tituloNeto = sec.tab;
                if(sec.tab.match(/^\d+\.\s*(.*)/)) {
                    tituloNeto = sec.tab.match(/^\d+\.\s*(.*)/)[1];
                }
                return [
                    'cat_' + (index + 1),
                    tituloNeto,
                    JSON.stringify(itemsFormateados),
                    index + 1
                ];
            });

            db.query(insertQuery, [values], (err3, result3) => {
                if (err3) {
                     console.error('Error inserting default values:', err3); process.exit(1);
                }
                console.log('Inserted default values.');
                process.exit(0);
            });
        } else {
            console.log('Table already has data.');
            process.exit(0);
        }
    });
});
