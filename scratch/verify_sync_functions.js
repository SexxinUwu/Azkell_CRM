const mysql = require('mysql2/promise');
require('dotenv').config();

async function verify() {
    console.log("Configuración remota cargada desde .env / fallback:");
    console.log("Host:", process.env.REMOTE_FUEL_HOST || '168.231.98.23');
    console.log("User:", process.env.REMOTE_FUEL_USER || 'prov_combustible');
    console.log("Database:", process.env.REMOTE_FUEL_DATABASE || 'marsisa_promax');

    const pool = mysql.createPool({
        host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
        user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
        password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
        database: process.env.REMOTE_FUEL_DATABASE || 'marsisa_promax',
        connectTimeout: 15000,
        waitForConnections: true,
        connectionLimit: 5,
        timezone: 'Z',
        dateStrings: true
    });

    try {
        // 1. Vales de Combustible
        const [vales] = await pool.query("SELECT * FROM vw_combustible_vale ORDER BY fecha DESC LIMIT 5");
        console.log(`\n✅ Consulta de Vales exitosa! Se obtuvieron ${vales.length} vales de muestra.`);
        console.log("Primer vale:", {
            id: vales[0].id,
            correlativo: `${vales[0].serie}-${vales[0].numero}`,
            fecha: vales[0].fecha,
            placa: vales[0].placa,
            conductor: vales[0].conductor_nombre,
            galones: vales[0].galones,
            importe: vales[0].importe
        });

        // 2. Estaciones
        const [estaciones] = await pool.query("SELECT DISTINCT proveedor_razon_social, proveedor_ruc FROM vw_combustible_estacion WHERE proveedor_ruc IS NOT NULL AND proveedor_ruc != '' LIMIT 5");
        console.log(`\n✅ Consulta de Estaciones exitosa! Se obtuvieron ${estaciones.length} estaciones.`);

        // 3. Órdenes de Viaje
        const [ov] = await pool.query("SELECT * FROM vw_combustible_orden_viaje ORDER BY fecha_viaje DESC LIMIT 5");
        console.log(`\n✅ Consulta de Órdenes de Viaje exitosa! Se obtuvieron ${ov.length} viajes de muestra.`);
        console.log("Primer viaje:", {
            id_viaje: ov[0].id_viaje,
            viaje: ov[0].viaje,
            fecha_viaje: ov[0].fecha_viaje,
            conductor: ov[0].conductor,
            placa_vehiculo: ov[0].placa_vehiculo
        });

        // 4. Detalle de Rutas / Órdenes de Servicio
        const [rutas] = await pool.query("SELECT * FROM vw_combustible_orden_viaje_ruta ORDER BY serie_viaje DESC, numero_viaje DESC LIMIT 5");
        console.log(`\n✅ Consulta de Rutas exitosa! Se obtuvieron ${rutas.length} registros de rutas.`);
        console.log("Primera ruta:", {
            viaje: rutas[0].viaje,
            orden: rutas[0].orden,
            ruta: rutas[0].ruta,
            tipo_servicio: rutas[0].tipo_servicio,
            peso_total: rutas[0].peso_total
        });

        console.log("\n🎉 TODAS LAS PRUEBAS DE CONEXIÓN Y CONSULTA A MARSISA_PROMAX FUERON 100% EXITOSAS.");
    } catch (e) {
        console.error("❌ Error en prueba:", e);
    } finally {
        await pool.end();
    }
}

verify();
