const mysql = require('mysql2/promise');
require('dotenv').config();

function safeSqlDate(val, serie) {
    if (!val) return new Date().toISOString().slice(0, 19).replace('T', ' ');
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        return s.slice(0, 19).replace('T', ' ');
    }
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmy) {
        let dia = dmy[1].padStart(2, '0');
        let mes = dmy[2].padStart(2, '0');
        let anio = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
        let hora = (dmy[4] || '00').padStart(2, '0');
        let min = (dmy[5] || '00').padStart(2, '0');
        let seg = (dmy[6] || '00').padStart(2, '0');
        return `${anio}-${mes}-${dia} ${hora}:${min}:${seg}`;
    }
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function resyncAllVales() {
    console.log("Conectando a base de datos local y remota...");
    const localConn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    });

    const remoteConn = await mysql.createConnection({
        host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
        user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
        password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
        database: process.env.REMOTE_FUEL_DATABASE || 'marsisadb_prod'
    });

    console.log("Limpiando tabla local combustible_vales...");
    await localConn.query("DELETE FROM combustible_vales");
    console.log("✅ Tabla local combustible_vales vaciada.");

    // Consultar estaciones para RUC
    const [estacionesRows] = await remoteConn.query(
        "SELECT DISTINCT proveedor_razon_social, proveedor_ruc FROM vw_combustible_estacion WHERE proveedor_ruc IS NOT NULL AND proveedor_ruc != ''"
    );
    const rucMap = new Map();
    estacionesRows.forEach(e => {
        if (e.proveedor_razon_social && e.proveedor_ruc) {
            rucMap.set(String(e.proveedor_razon_social).trim().toUpperCase(), String(e.proveedor_ruc).trim());
        }
    });

    // Consultar placas
    const [placasRows] = await localConn.query("SELECT placa, tipo, sub_tipo FROM placas");
    const placaClaseMap = new Map();
    placasRows.forEach(p => {
        if (p.placa) {
            const claseVal = (p.tipo || p.sub_tipo || 'TRACTO').toUpperCase().trim();
            placaClaseMap.set(p.placa.trim().toUpperCase(), claseVal);
        }
    });

    console.log("Consultando vales desde el servidor remoto vw_combustible_vale...");
    const [remotoVales] = await remoteConn.query(
        "SELECT * FROM vw_combustible_vale ORDER BY fecha DESC LIMIT 10000"
    );

    console.log(`Descargados ${remotoVales.length} vales remotos. Insertando en BD local con pesos...`);

    const batchSize = 200;
    let totalInsertados = 0;

    for (let i = 0; i < remotoVales.length; i += batchSize) {
        const chunk = remotoVales.slice(i, i + batchSize);
        const values = [];

        chunk.forEach(v => {
            const id_remoto = v.id || null;
            const fecha = safeSqlDate(v.fecha, v.serie);
            const anio = fecha.slice(0, 4);
            const estado = (v.fl_estado === 1 || v.fl_estado === '1') ? 'VÁLIDO' : 'ANULADO';
            const correlativo = v.serie ? `${v.serie}-${v.numero}` : (v.numero || '');
            const estado_pago = (v.tipo_pago || '').toUpperCase().includes('CRED') ? 'NO EXISTE PAGO' : 'PAGADO';
            const rawViaje = String(v.viaje_numero || '').trim();
            const viajeSerie = (v.serie && /^\d{4}$/.test(v.serie)) ? v.serie : anio;
            const viaje = rawViaje ? (rawViaje.includes('-') ? rawViaje : `${viajeSerie}-${rawViaje}`) : '';
            const caja = v.serie_caja ? `${v.serie_caja}-${v.numero_caja}` : (v.numero_caja || '');
            const estado_caja = 'PROCESADO';
            const vehiculo = String(v.placa || 'SIN-PLACA').toUpperCase().trim();
            const clase_vehiculo = placaClaseMap.get(vehiculo) || 'TRACTO';
            const vehiculo_marca = String(v.vehiculo_marca || '').trim();
            const vehiculo_modelo = String(v.vehiculo_modelo || '').trim();
            const conductor = String(v.conductor_nombre || '').trim();
            const departamento = String(v.departamento || '').trim();
            const provincia = String(v.provincia || '').trim();
            const distrito = String(v.distrito || '').trim();
            const ruta = String(v.viaje_rutas || v.localidad || '').trim();
            const estacion = String(v.estacion || '').trim();
            const tipo_combustible = String(v.tipo_combustible || 'D2').trim();
            const proveedor = String(v.proveedor_razon_social || '').trim();
            const ruc = rucMap.get(proveedor.toUpperCase()) || '';
            const kilometraje = parseFloat(v.kilometraje || 0);
            
            // Peso: si viene en Kg y es > 50, se guarda directamente en Tn
            const rawPeso = parseFloat(v.peso || 0);
            const peso_tn = rawPeso > 50 ? parseFloat((rawPeso / 1000).toFixed(2)) : parseFloat(rawPeso.toFixed(2));
            
            const galones = parseFloat(v.galones || 0);
            const costo_gl = parseFloat(v.costo_galon || 0);
            const tipo_pago = String(v.tipo_pago || 'CONTADO').toUpperCase().trim();
            const dias_credito = 0;
            const moneda = (v.moneda_codigo || v.moneda_simbolo || 'SOLES').toUpperCase().trim();
            const importe = parseFloat(v.importe || (galones * costo_gl));
            const numero_comprobante = String(v.numero_comprobante || v.numero_ticket || '').trim();
            const tipo_cambio = null;
            const archivo_url = null;
            const observacion = null;
            const tipo = String(v.tipo || 'RECARGA VUELTA').toUpperCase().trim();

            values.push([
                id_remoto, fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                vehiculo, vehiculo_marca, vehiculo_modelo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
            ]);
        });

        if (values.length > 0) {
            await localConn.query(
                `INSERT INTO combustible_vales (
                    id_remoto, fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                    vehiculo, vehiculo_marca, vehiculo_modelo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                    proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                    moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
                ) VALUES ?`,
                [values]
            );
            totalInsertados += values.length;
        }
    }

    console.log(`🎉 Sincronización completa finalizada. Total vales insertados: ${totalInsertados}`);

    // Verificar cantidad de vales con peso > 0
    const [pesoCheck] = await localConn.query("SELECT COUNT(*) as con_peso FROM combustible_vales WHERE peso_tn > 0");
    console.log(`Vales con peso > 0 en la BD: ${pesoCheck[0].con_peso}`);

    await localConn.end();
    await remoteConn.end();
}

resyncAllVales().catch(err => {
    console.error("❌ Error en resyncAllVales:", err);
    process.exit(1);
});
