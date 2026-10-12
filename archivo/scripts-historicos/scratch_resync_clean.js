require('dotenv').config();
const mysql = require('mysql2/promise');
const { getTenantPool } = require('./services/tenant_master');

async function resyncMarsisaClean() {
    const REMOTE_CONFIG = {
        host: '168.231.98.23',
        user: 'prov_combustible',
        password: '32f2dc8b2b27fc021c81674c04c2326e',
        database: 'marsisadb_prod'
    };

    function safeSqlDate(val) {
        if (!val) return new Date().toISOString().slice(0, 19).replace('T', ' ');
        try {
            const dt = (val instanceof Date) ? val : new Date(val);
            if (!isNaN(dt.getTime())) {
                return dt.toISOString().slice(0, 19).replace('T', ' ');
            }
        } catch(e) {}
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    try {
        const marsisaPool = getTenantPool('azkell_tenant_marsisa').promise();
        const rdb = await mysql.createConnection(REMOTE_CONFIG);

        console.log('🔄 Limpiando y resincronizando Marsisa con formato de viaje completo y clases reales...');

        // Consultar estaciones
        const [estacionesRows] = await rdb.query(
            "SELECT DISTINCT proveedor_razon_social, proveedor_ruc FROM vw_combustible_estacion WHERE proveedor_ruc IS NOT NULL AND proveedor_ruc != ''"
        );
        const rucMap = new Map();
        estacionesRows.forEach(e => {
            if (e.proveedor_razon_social && e.proveedor_ruc) {
                rucMap.set(String(e.proveedor_razon_social).trim().toUpperCase(), String(e.proveedor_ruc).trim());
            }
        });

        // Consultar placas
        const [placasRows] = await marsisaPool.query("SELECT placa, tipo, sub_tipo FROM placas");
        const placaClaseMap = new Map();
        placasRows.forEach(p => {
            if (p.placa) {
                const claseVal = (p.tipo || p.sub_tipo || 'TRACTO').toUpperCase().trim();
                placaClaseMap.set(p.placa.trim().toUpperCase(), claseVal);
            }
        });

        // Limpiar tabla
        await marsisaPool.query("TRUNCATE TABLE combustible_vales");

        const [remotoVales] = await rdb.query(
            `SELECT * FROM vw_combustible_vale ORDER BY fecha DESC LIMIT 5000`
        );

        console.log(`Vales a procesar: ${remotoVales.length}`);

        let sincronizados = 0;
        const batchSize = 100;

        for (let i = 0; i < remotoVales.length; i += batchSize) {
            const chunk = remotoVales.slice(i, i + batchSize);
            const values = [];

            chunk.forEach(v => {
                const id_remoto = v.id || null;
                const fecha = safeSqlDate(v.fecha);
                const anio = fecha.slice(0, 4);
                const estado = (v.fl_estado === 1 || v.fl_estado === '1') ? 'VÁLIDO' : 'ANULADO';
                const correlativo = v.serie ? `${v.serie}-${v.numero}` : (v.numero || '');
                const estado_pago = (v.tipo_pago || '').toUpperCase().includes('CRED') ? 'NO EXISTE PAGO' : 'PAGADO';
                const rawViaje = String(v.viaje_numero || '').trim();
                const viaje = rawViaje ? (rawViaje.includes('-') ? rawViaje : `${anio}-${rawViaje}`) : '';
                const caja = '';
                const estado_caja = 'PROCESADO';
                const vehiculo = String(v.placa || 'SIN-PLACA').toUpperCase().trim();
                const clase_vehiculo = placaClaseMap.get(vehiculo) || 'TRACTO';
                const vehiculo_marca = String(v.vehiculo_marca || '').trim();
                const vehiculo_modelo = String(v.vehiculo_modelo || '').trim();
                const conductor = String(v.conductor_nombre || '').trim();
                const ruta = String(v.localidad || '').trim();
                const departamento = '';
                const provincia = '';
                const distrito = '';
                const estacion = String(v.estacion || '').trim();
                const tipo_combustible = String(v.tipo_combustible || 'D2').trim();
                const proveedor = String(v.proveedor_razon_social || '').trim();
                const ruc = rucMap.get(proveedor.toUpperCase()) || '';
                const kilometraje = parseFloat(v.kilometraje || 0);
                const peso_tn = parseFloat(v.peso || 0);
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
                await marsisaPool.query(
                    `INSERT INTO combustible_vales (
                        id_remoto, fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                        vehiculo, vehiculo_marca, vehiculo_modelo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                        proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                        moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
                    ) VALUES ?`,
                    [values]
                );
                sincronizados += values.length;
            }
        }

        console.log(`✅ Sincronización limpia completada: ${sincronizados} vales guardados.`);

        const [sampleRows] = await marsisaPool.query(
            "SELECT id, fecha, correlativo, estado_pago, viaje, clase_vehiculo, vehiculo, conductor, estacion, ruc, galones, importe FROM combustible_vales ORDER BY fecha DESC LIMIT 5"
        );
        console.log('Primeras 5 filas en Marsisa:', sampleRows);

        await rdb.end();
    } catch(e) {
        console.error('Error:', e);
    }
}

resyncMarsisaClean();
