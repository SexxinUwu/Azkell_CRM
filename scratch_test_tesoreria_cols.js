require('dotenv').config();
const { getTenantPool } = require('./services/tenant_master');
const tesoreriaModule = require('./routes/tesoreria');

async function testNewColumns() {
    try {
        const pool = getTenantPool('azkell_tenant_rosymarperu');
        const router = tesoreriaModule(pool, () => {}, () => {});
        
        // Limpiar para prueba limpia
        await pool.promise().query('DELETE FROM tesoreria_cuentas');

        const mockReq = {
            tenantSlug: 'azkell_tenant_rosymarperu',
            db: pool,
            body: {
                filas: [
                    {
                        codigo_liquidacion: 'LIQ-2026-0001',
                        fecha_liquidacion: '05/01/2026',
                        fecha_servicio: '12/12/2025',
                        razon_social: 'TRAHESA SAC',
                        placa: 'T8S942-AWB973',
                        conductor: 'KENNY ALEXANDER ARTEAGA MARQUEZ',
                        cliente: 'AJINOMOTO DEL PERU',
                        lugar: 'CALLAO - TARAPOTO',
                        tarifa: '8.357,63',
                        gastos_operativos: '237,29',
                        base_imponible: '8.120,34',
                        igv: '1.461,66',
                        total: '9.582,00',
                        adelanto: '0,00',
                        detraccion: '383,28',
                        neto_cobrar: '9.198,72',
                        mes_facturacion: 'ENERO',
                        fecha_factura: '05/01/2026',
                        serie: 'E001',
                        factura: '0160',
                        credito_dias: 45,
                        fecha_cobrar: '20/02/2026',
                        fecha_deposito: '20/02/2026',
                        estado_servicio: 'PAGADO',
                        diferencia: '-0,28',
                        observacion: 'LIQ.01'
                    }
                ]
            }
        };

        const mockRes = {
            json: function(data) {
                console.log('Respuesta importación:', data);
            },
            status: function() { return this; }
        };

        const handlers = router.stack.filter(layer => layer.route && layer.route.path === '/cuentas/importar-masivo');
        if (handlers.length > 0) {
            await handlers[0].route.stack[0].handle(mockReq, mockRes);
        }

        const [rows] = await pool.promise().query('SELECT id, codigo_liquidacion, fecha_liquidacion, placa_camion, placa_carreta, factura, total FROM tesoreria_cuentas');
        console.log('✅ Registro con nuevas columnas:', rows);

        process.exit(0);
    } catch(e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

testNewColumns();
