require('dotenv').config();
const { getTenantPool } = require('./services/tenant_master');
const tesoreriaModule = require('./routes/tesoreria');

async function testTesoreria() {
    try {
        const pool = getTenantPool('azkell_tenant_rosymarperu');
        const router = tesoreriaModule(pool, () => {}, () => {});
        
        // Simular llamada para crear la tabla
        const mockReq = {
            tenantSlug: 'azkell_tenant_rosymarperu',
            db: pool,
            body: {
                filas: [
                    {
                        fecha_liquidacion: '05/01/2026', fecha_servicio: '12/12/2025', razon_social: 'TRAHESA SAC',
                        placa: 'T8S942-AWB973', conductor: 'KENNY ALEXANDER ARTEAGA MARQUEZ', cliente: 'AJINOMOTO DEL PERU',
                        lugar: 'CALLAO - TARAPOTO', tarifa: '8.357,63', gastos_operativos: '237,29', base_imponible: '8.120,34',
                        igv: '1.461,66', total: '9.582,00', adelanto: '0,00', detraccion: '383,28', neto_cobrar: '9.198,72',
                        mes_facturacion: 'ENERO', fecha_factura: '05/01/2026', serie: 'E001', factura: '0160',
                        credito_dias: 45, fecha_cobrar: '20/02/2026', fecha_deposito: '20/02/2026', estado_servicio: 'PAGADO',
                        diferencia: '-0,28', observacion: 'LIQ.01'
                    },
                    {
                        fecha_liquidacion: '05/01/2026', fecha_servicio: '05/01/2026', razon_social: 'JHOSTIL PERU',
                        placa: 'AMV803-AZO983', conductor: 'JOSE UZURIAGA GALARZA', cliente: '',
                        lugar: 'ATE', tarifa: '0,00', gastos_operativos: '0,00', base_imponible: '15.254,24',
                        igv: '2.745,76', total: '18.000,00', adelanto: '0,00', detraccion: '720,00', neto_cobrar: '17.280,00',
                        mes_facturacion: 'ENERO', fecha_factura: '05/01/2026', serie: 'E001', factura: '0161',
                        credito_dias: 15, fecha_cobrar: '05/01/2026', fecha_deposito: '', estado_servicio: 'PENDIENTE',
                        diferencia: '0,00', observacion: 'LLANTAS'
                    },
                    {
                        fecha_liquidacion: '02/01/2026', fecha_servicio: '16/11/2025', razon_social: 'ROSYMAR PERU SAC',
                        placa: 'B0O835-ATP992', conductor: 'SANTIAGO ALBERTO GARCIA MORALES', cliente: 'HIPERMERCADOS TOTTUS',
                        lugar: 'CALLAO - TRUJILLO', tarifa: '4.563,00', gastos_operativos: '330,00', base_imponible: '4.233,00',
                        igv: '761,94', total: '4.994,94', adelanto: '0,00', detraccion: '199,80', neto_cobrar: '4.795,14',
                        mes_facturacion: 'ENERO', fecha_factura: '06/01/2026', serie: 'E001', factura: '0162',
                        credito_dias: 15, fecha_cobrar: '21/01/2026', fecha_deposito: '', estado_servicio: 'PENDIENTE',
                        diferencia: '0,00', observacion: 'LIQ SERV2026-0001'
                    },
                    {
                        fecha_liquidacion: '02/01/2026', fecha_servicio: '28/12/2025', razon_social: 'ROSYMAR PERU SAC',
                        placa: 'AMV803-AZO983', conductor: 'ELVIS ENRIQUE MEDINA OSORIO', cliente: 'PERUANA DE MOLDEADOS',
                        lugar: 'LIMA - STA ANITA', tarifa: '1.080,00', gastos_operativos: '180,00', base_imponible: '900,00',
                        igv: '162,00', total: '1.062,00', adelanto: '500,00', detraccion: '42,48', neto_cobrar: '519,52',
                        mes_facturacion: 'ENERO', fecha_factura: '06/01/2026', serie: 'E001', factura: '0163',
                        credito_dias: 15, fecha_cobrar: '21/01/2026', fecha_deposito: '20/01/2026', estado_servicio: 'PAGADO',
                        diferencia: '-0,48', observacion: 'LIQ SERV2026-0002'
                    },
                    {
                        fecha_liquidacion: '02/01/2026', fecha_servicio: '21/12/2025', razon_social: 'ROSYMAR PERU SAC',
                        placa: 'CFU749-AZO982', conductor: 'WILLIAN CARAZAS CASTILLO', cliente: 'PERUANA DE MOLDEADOS',
                        lugar: 'LIMA - STA ANITA', tarifa: '1.080,00', gastos_operativos: '410,00', base_imponible: '670,00',
                        igv: '120,60', total: '790,60', adelanto: '0,00', detraccion: '31,62', neto_cobrar: '758,98',
                        mes_facturacion: 'ENERO', fecha_factura: '06/01/2026', serie: 'E001', factura: '0164',
                        credito_dias: 15, fecha_cobrar: '21/01/2026', fecha_deposito: '20/01/2026', estado_servicio: 'PAGADO',
                        diferencia: '-0,62', observacion: 'LIQ SERV2026-0003'
                    }
                ]
            }
        };

        const mockRes = {
            json: function(data) {
                console.log('Respuesta mockRes:', JSON.stringify(data, null, 2));
            },
            status: function(code) {
                console.log('Status code:', code);
                return this;
            }
        };

        // Buscar handler de importar-masivo
        const handlers = router.stack.filter(layer => layer.route && layer.route.path === '/cuentas/importar-masivo');
        if (handlers.length > 0) {
            await handlers[0].route.stack[0].handle(mockReq, mockRes);
        }

        const [rows] = await pool.promise().query('SELECT id, razon_social, factura, total, neto_cobrar, estado_servicio FROM tesoreria_cuentas');
        console.log('✅ Filas encontradas en BD tesoreria_cuentas:', rows);

        process.exit(0);
    } catch (e) {
        console.error('Error en testTesoreria:', e);
        process.exit(1);
    }
}

testTesoreria();
