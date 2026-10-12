const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    console.log('=== VERIFICANDO SECUENCIAS ===');
    const dbs = ['azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport', 'azkell_tenant_trahesa', 'azkell_fleet'];
    for (const db of dbs) {
        try {
            const [sec] = await conn.query(`SELECT * FROM \`${db}\`.secuencias WHERE prefijo LIKE '%PROV%' OR tabla LIKE '%proveedor%'`);
            console.log(`Secuencias en ${db}:`, sec);
        } catch(e) {
            console.log(`No table secuencias en ${db}:`, e.message);
        }
    }

    console.log('\n=== EJECUTANDO COPIA DE PROVEEDORES DESDE MARSISA ===');
    const targetDbs = ['azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport', 'azkell_tenant_trahesa', 'azkell_fleet'];

    for (const targetDb of targetDbs) {
        console.log(`\n--- Copiando a ${targetDb} ---`);

        // 1. Limpiar marcas y cuentas asociadas
        await conn.query(`DELETE FROM \`${targetDb}\`.\`proveedor_marcas_inv\``);
        await conn.query(`DELETE FROM \`${targetDb}\`.\`proveedor_cuentas_bancarias\``);
        
        // 2. Limpiar tabla principal proveedores_inv
        await conn.query(`DELETE FROM \`${targetDb}\`.\`proveedores_inv\``);

        // 3. Copiar proveedores_inv
        const [resProv] = await conn.query(`
            INSERT INTO \`${targetDb}\`.\`proveedores_inv\`
            (id, nombre, razon_social, tipo_documento, numero_documento, telefono, email, direccion, estado, observaciones, created_at, updated_at)
            SELECT id, nombre, razon_social, tipo_documento, numero_documento, telefono, email, direccion, estado, observaciones, created_at, updated_at
            FROM \`azkell_tenant_marsisa\`.\`proveedores_inv\`
        `);
        console.log(`✅ [${targetDb}] proveedores_inv insertados: ${resProv.affectedRows}`);

        // 4. Copiar proveedor_marcas_inv
        const [resMarcas] = await conn.query(`
            INSERT INTO \`${targetDb}\`.\`proveedor_marcas_inv\`
            (id, proveedor_id, marca)
            SELECT id, proveedor_id, marca
            FROM \`azkell_tenant_marsisa\`.\`proveedor_marcas_inv\`
        `);
        console.log(`✅ [${targetDb}] proveedor_marcas_inv insertadas: ${resMarcas.affectedRows}`);

        // 5. Copiar proveedor_cuentas_bancarias si hubiere
        const [resCuentas] = await conn.query(`
            INSERT INTO \`${targetDb}\`.\`proveedor_cuentas_bancarias\`
            (id, proveedor_id, banco, tipo_cuenta, numero_cuenta, detraccion, estado, created_at)
            SELECT id, proveedor_id, banco, tipo_cuenta, numero_cuenta, detraccion, estado, created_at
            FROM \`azkell_tenant_marsisa\`.\`proveedor_cuentas_bancarias\`
        `);
        console.log(`✅ [${targetDb}] proveedor_cuentas_bancarias insertadas: ${resCuentas.affectedRows}`);

        // 6. Actualizar secuencia de PROV si existe en targetDb
        try {
            const [marsisaSec] = await conn.query(`SELECT ultimo_numero FROM \`azkell_tenant_marsisa\`.\`secuencias\` WHERE prefijo = 'PROV'`);
            if (marsisaSec.length > 0) {
                const ultimoNum = marsisaSec[0].ultimo_numero;
                await conn.query(`
                    INSERT INTO \`${targetDb}\`.\`secuencias\` (prefijo, tabla, ultimo_numero, ceros)
                    VALUES ('PROV', 'proveedores_inv', ?, 4)
                    ON DUPLICATE KEY UPDATE ultimo_numero = VALUES(ultimo_numero)
                `, [ultimoNum]);
                console.log(`✅ [${targetDb}] Secuencia PROV sincronizada al número: ${ultimoNum}`);
            }
        } catch(e) {
            console.log(`ℹ️ [${targetDb}] Nota sobre secuencias:`, e.message);
        }

        // 7. Si es rosymar, sincronizar combustible_estaciones_proveedores si está vacío
        if (targetDb === 'azkell_tenant_rosymarperu') {
            const [countEst] = await conn.query(`SELECT COUNT(*) as c FROM \`${targetDb}\`.\`combustible_estaciones_proveedores\``);
            if (countEst[0].c === 0) {
                const [resEst] = await conn.query(`
                    INSERT INTO \`${targetDb}\`.\`combustible_estaciones_proveedores\`
                    (id, proveedor_razon_social, proveedor_ruc, estaciones_nombres, created_at, updated_at)
                    SELECT id, proveedor_razon_social, proveedor_ruc, estaciones_nombres, created_at, updated_at
                    FROM \`azkell_tenant_marsisa\`.\`combustible_estaciones_proveedores\`
                `);
                console.log(`✅ [${targetDb}] combustible_estaciones_proveedores sincronizadas: ${resEst.affectedRows}`);
            }
        }
    }

    console.log('\n=== VERIFICACIÓN FINAL DE CONTEOS ===');
    for (const db of dbs) {
        const [cProv] = await conn.query(`SELECT COUNT(*) as c FROM \`${db}\`.proveedores_inv`);
        const [cMarcas] = await conn.query(`SELECT COUNT(*) as c FROM \`${db}\`.proveedor_marcas_inv`);
        const [cCuentas] = await conn.query(`SELECT COUNT(*) as c FROM \`${db}\`.proveedor_cuentas_bancarias`);
        const [cEst] = await conn.query(`SELECT COUNT(*) as c FROM \`${db}\`.combustible_estaciones_proveedores`);
        console.log(`📊 [${db}] proveedores_inv: ${cProv[0].c} | marcas: ${cMarcas[0].c} | cuentas: ${cCuentas[0].c} | estaciones_comb: ${cEst[0].c}`);
    }

    await conn.end();
    console.log('\n🚀 PROCESO COMPLETADO EXITOSAMENTE');
}

run().catch(console.error);
