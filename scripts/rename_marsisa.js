const mysql = require('mysql2');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || '82.39.109.226';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_SSL = process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : undefined;

const OLD_DB = 'azkell_fleet';
const NEW_DB = 'azkell_tenant_marsisa';
const MASTER_DB = 'azkell_master';

async function migrateDatabase() {
    console.log(`🚀 Iniciando renombrado/migración de ${OLD_DB} -> ${NEW_DB}...`);

    const conn = mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        port: DB_PORT,
        ssl: DB_SSL
    });

    conn.connect(async (err) => {
        if (err) {
            console.error('🚨 Error conectando a MySQL:', err.message);
            process.exit(1);
        }

        // 1. Crear la nueva base de datos azkell_tenant_marsisa
        conn.query(`CREATE DATABASE IF NOT EXISTS \`${NEW_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, (err1) => {
            if (err1) {
                console.error('Error creando BD:', err1.message);
                conn.end();
                process.exit(1);
            }
            console.log(`✅ Base de datos [${NEW_DB}] verificada/creada.`);

            // 2. Obtener la lista de tablas de azkell_fleet
            conn.query(`SHOW TABLES FROM \`${OLD_DB}\`;`, (err2, tables) => {
                if (err2 || !tables.length) {
                    console.warn(`Advertencia al listar tablas de ${OLD_DB}:`, err2 ? err2.message : 'No hay tablas');
                    registerInMaster(conn);
                    return;
                }

                const tableKey = Object.keys(tables[0])[0];
                let count = 0;

                tables.forEach((tRow) => {
                    const tableName = tRow[tableKey];
                    // Copiar estructura y datos
                    const copySql = `CREATE TABLE IF NOT EXISTS \`${NEW_DB}\`.\`${tableName}\` LIKE \`${OLD_DB}\`.\`${tableName}\`;`;
                    conn.query(copySql, (errCopy) => {
                        if (errCopy) console.warn(`Error creando estructura de ${tableName}:`, errCopy.message);

                        const insertSql = `INSERT IGNORE INTO \`${NEW_DB}\`.\`${tableName}\` SELECT * FROM \`${OLD_DB}\`.\`${tableName}\`;`;
                        conn.query(insertSql, (errIns) => {
                            if (errIns) console.warn(`Error copiando datos de ${tableName}:`, errIns.message);
                            count++;
                            console.log(`  └─ Tabla [${tableName}] migrada exitosamente a ${NEW_DB}`);

                            if (count === tables.length) {
                                registerInMaster(conn);
                            }
                        });
                    });
                });
            });
        });
    });
}

function registerInMaster(conn) {
    console.log(`📝 Registrando subdominio 'marsisa' en ${MASTER_DB}...`);
    const sqlRegister = `
    INSERT INTO \`${MASTER_DB}\`.\`empresas\` (slug, nombre_empresa, ruc, db_name, plan, estado)
    VALUES ('marsisa', 'Marsisa S.A.C.', '20609532484', '${NEW_DB}', 'Empresarial', 'activo')
    ON DUPLICATE KEY UPDATE db_name = '${NEW_DB}', nombre_empresa = 'Marsisa S.A.C.';
    `;
    conn.query(sqlRegister, (errReg) => {
        if (errReg) console.error('Error registrando en master:', errReg.message);
        else console.log(`🎉 [EXITO] Marsisa registrada en ${MASTER_DB} con BD [${NEW_DB}]`);
        conn.end();
        process.exit(0);
    });
}

migrateDatabase();
