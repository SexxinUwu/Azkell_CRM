require('dotenv').config();
const path = require('path');
const mysql = require('mysql2/promise');
const { getTenantPool } = require(path.join(__dirname, '../services/tenant_master'));

async function reimportAllVales() {
    const REMOTE_CONFIG = {
        host: '168.231.98.23',
        user: 'prov_combustible',
        password: '32f2dc8b2b27fc021c81674c04c2326e',
        database: 'marsisadb_prod',
        dateStrings: true,
        timezone: 'Z'
    };

    function safeSqlDate(val, serie) {
        const defaultYear = (serie && /^\d{4}$/.test(serie)) ? serie : '2025';
        if (!val) return `${defaultYear}-01-01 00:00:00`;
        if (typeof val === 'string') {
            const s = val.trim().replace('T', ' ').replace('.000Z', '');
            if (s.startsWith('0000-00-00') || s.startsWith('0000-00')) {
                return `${defaultYear}-01-01 00:00:00`;
            }
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
                const anio = parseInt(s.slice(0, 4), 10);
                if (anio < 2000 || anio > 2100) return `${defaultYear}-01-01 00:00:00`;
                return s.length === 10 ? `${s} 00:00:00` : s.slice(0, 19);
            }
        }
        return `${defaultYear}-01-01 00:00:00`;
    }

    try {
        const tenantPool = getTenantPool('azkell_tenant_marsisa').promise();
        const rdb = await mysql.createConnection(REMOTE_CONFIG);

        console.log('🚀 1. Limpiando tablas de vales en azkell_tenant_marsisa...');
        await tenantPool.query("TRUNCATE TABLE marsisa_combustible_vales");
        await tenantPool.query("TRUNCATE TABLE combustible_vales");
        console.log('✅ Tablas truncadas exitosamente.');

        // 2. Mapeo de proveedores y estaciones
        console.log('🔍 2. Consultando catálogo de estaciones...');
        const [estacionesRows] = await rdb.query(
            "SELECT DISTINCT proveedor_razon_social, proveedor_ruc FROM vw_combustible_estacion WHERE proveedor_ruc IS NOT NULL AND proveedor_ruc != ''"
        );
        const rucMap = new Map();
        estacionesRows.forEach(e => {
            if (e.proveedor_razon_social && e.proveedor_ruc) {
                rucMap.set(String(e.proveedor_razon_social).trim().toUpperCase(), String(e.proveedor_ruc).trim());
            }
        });

        // 3. Mapeo de placas
        console.log('🔍 3. Consultando placas de vehículos...');
        const [placasRows] = await tenantPool.query("SELECT placa, tipo, sub_tipo FROM placas");
        const placaClaseMap = new Map();
        placasRows.forEach(p => {
            if (p.placa) {
                const claseVal = (p.tipo || p.sub_tipo || 'TRACTO').toUpperCase().trim();
                placaClaseMap.set(p.placa.trim().toUpperCase(), claseVal);
            }
        });

        // 4. Obtener todos los vales de la vista remota
        console.log('📥 4. Descargando todos los vales de MarsisaSoft...');
        const [remotoVales] = await rdb.query(
            "SELECT * FROM vw_combustible_vale ORDER BY fecha DESC"
        );
        console.log(`📊 Total de vales encontrados en MarsisaSoft: ${remotoVales.length}`);

        let sincronizados = 0;
        const batchSize = 200;

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
                const peso_tn = parseFloat(v.peso || 0);
                const galones = parseFloat(v.galones || 0);
                const costo_gl = parseFloat(v.costo_galon || 0);
                const tipo_pago = String(v.tipo_pago || 'CONTADO').toUpperCase().trim();
                const dias_credito = parseInt(v.dias_credito || 0, 10) || 0;
                const moneda = (v.moneda_codigo || v.moneda_simbolo || 'SOLES').toUpperCase().trim();
                const importe = parseFloat(v.importe || (galones * costo_gl));
                const numero_comprobante = String(v.numero_comprobante || v.numero_ticket || '').trim();
                const tipo_cambio = v.tipo_cambio ? parseFloat(v.tipo_cambio) : null;
                const archivo_url = v.archivo_url || null;
                const observacion = v.observacion || null;
                const tipo = String(v.tipo || 'RECARGA VUELTA').toUpperCase().trim();

                values.push([
                    id_remoto, fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                    vehiculo, vehiculo_marca, vehiculo_modelo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                    proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                    moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
                ]);
            });

            if (values.length > 0) {
                const insertSql = `INSERT INTO marsisa_combustible_vales (
                    id_remoto, fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                    vehiculo, vehiculo_marca, vehiculo_modelo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                    proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                    moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
                ) VALUES ?`;

                await tenantPool.query(insertSql, [values]);

                // Insertar también en combustible_vales para consistencia
                await tenantPool.query(
                    insertSql.replace('marsisa_combustible_vales', 'combustible_vales'),
                    [values]
                );

                sincronizados += values.length;
            }
        }

        console.log(`✅ ¡Importación completada! ${sincronizados} registros sincronizados con éxito.`);

        // Mostrar los 3 primeros registros para verificar fechas
        const [sampleRows] = await tenantPool.query(
            "SELECT id_remoto, correlativo, DATE_FORMAT(fecha, '%d/%m/%Y %H:%i:%s') AS fecha_exacta, estado, viaje, vehiculo, galones, importe FROM marsisa_combustible_vales ORDER BY fecha DESC LIMIT 5"
        );
        console.log('Top 5 registros importados con fecha exacta:');
        console.table(sampleRows);

        await rdb.end();
        process.exit(0);
    } catch(err) {
        console.error('❌ Error durante la importación:', err);
        process.exit(1);
    }
}

reimportAllVales();
