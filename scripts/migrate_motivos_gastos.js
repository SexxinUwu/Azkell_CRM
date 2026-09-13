require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    const tenants = ['azkell_fleet', 'azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport'];
    
    const initialData = [
        ['Combustibles y Fluidos', 'Diésel B5 / Gasolina de ruta', 'CC-300'],
        ['Combustibles y Fluidos', 'Úrea / AdBlue', 'CC-300'],
        ['Combustibles y Fluidos', 'Gasolina vehículos auxiliares/supervisión', 'CC-300'],
        ['Combustibles y Fluidos', 'Aceites y lubricantes de motor', 'CC-400'],
        ['Gastos de Viaje y Ruta', 'Peajes (físico / telepeaje)', 'CC-300'],
        ['Gastos de Viaje y Ruta', 'Viáticos / Alimentación choferes', 'CC-300'],
        ['Gastos de Viaje y Ruta', 'Pernocte / Hospedaje en ruta', 'CC-300'],
        ['Gastos de Viaje y Ruta', 'Estibadores / Carga y descarga menor', 'CC-300'],
        ['Gastos de Viaje y Ruta', 'Cochera / Parqueo de ruta', 'CC-300'],
        ['Gastos de Viaje y Ruta', 'Lavado y engrase de unidad en viaje', 'CC-300'],
        ['Gastos de Viaje y Ruta', 'Balanza y pesaje', 'CC-300'],
        ['Mantenimiento y Auxilio', 'Llantas y parchados de emergencia', 'CC-400'],
        ['Mantenimiento y Auxilio', 'Lavado y engrase de unidad en taller', 'CC-400'],
        ['Mantenimiento y Auxilio', 'Repuestos menores / Accesorios de viaje', 'CC-400'],
        ['Mantenimiento y Auxilio', 'Grúa o auxilio mecánico en ruta', 'CC-400'],
        ['Mantenimiento y Auxilio', 'Frenos, suspensión y aire', 'CC-400'],
        ['Mantenimiento y Auxilio', 'Servicios de tornería y soldadura', 'CC-400'],
        ['Mantenimiento y Auxilio', 'Mantenimiento preventivo programado', 'CC-400'],
        ['Servicios de Terceros', 'Asesoría contable / legal externa', 'CC-100'],
        ['Servicios de Terceros', 'Mantenimiento de software / GPS satelital', 'CC-500'],
        ['Servicios de Terceros', 'Notaría, trámites y legalizaciones', 'CC-100'],
        ['Servicios de Terceros', 'Seguridad, monitoreo y vigilancia', 'CC-100'],
        ['Servicios de Terceros', 'Consultoría y auditoría externa', 'CC-100'],
        ['Gastos Administrativos / Oficina', 'Útiles de escritorio y papelería', 'CC-100'],
        ['Gastos Administrativos / Oficina', 'Artículos de limpieza y aseo', 'CC-100'],
        ['Gastos Administrativos / Oficina', 'Servicios básicos oficina (Agua, Luz, Internet)', 'CC-100'],
        ['Gastos Administrativos / Oficina', 'Envíos de courier / correspondencia', 'CC-100'],
        ['Gastos Administrativos / Oficina', 'Alquiler de oficina o instalaciones', 'CC-100'],
        ['Gastos Administrativos / Oficina', 'Telefonía y comunicaciones móviles', 'CC-100'],
        ['Comercial y Representación', 'Movilidad local ejecutivos de cuenta', 'CC-200'],
        ['Comercial y Representación', 'Almuerzos de trabajo / Clientes', 'CC-200'],
        ['Comercial y Representación', 'Merchandising y publicidad física', 'CC-200'],
        ['Comercial y Representación', 'Comisiones por venta o corretaje', 'CC-200'],
        ['Personal y Planilla', 'Sueldos y jornales', 'CC-100'],
        ['Personal y Planilla', 'Adelantos de sueldo', 'CC-100'],
        ['Personal y Planilla', 'Gratificaciones / CTS', 'CC-100'],
        ['Personal y Planilla', 'Exámenes médicos ocupacionales', 'CC-100'],
        ['Personal y Planilla', 'Capacitación de personal y choferes', 'CC-100'],
        ['Personal y Planilla', 'EPPs e indumentaria de trabajo', 'CC-300'],
        ['Financieros y Bancarios', 'Comisiones bancarias y mantenimiento', 'CC-100'],
        ['Financieros y Bancarios', 'ITF (Impuesto a Transacciones Financieras)', 'CC-100'],
        ['Financieros y Bancarios', 'Intereses de préstamos / leasing', 'CC-100'],
        ['Financieros y Bancarios', 'Portes y transferencias interbancarias', 'CC-100'],
        ['Impuestos y Tributos', 'Pago IGV / Renta mensual SUNAT', 'CC-100'],
        ['Impuestos y Tributos', 'Detracciones SUNAT', 'CC-100'],
        ['Impuestos y Tributos', 'Arbitrios municipales y predial', 'CC-100'],
        ['Impuestos y Tributos', 'Tasas administrativas / MTC / SUTRAN', 'CC-100']
    ];

    for (const tenant of tenants) {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: tenant,
            port: process.env.DB_PORT
        });

        await conn.query(`
            CREATE TABLE IF NOT EXISTS tesoreria_motivos_gastos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                motivo VARCHAR(150) NOT NULL,
                sub_motivo VARCHAR(150) NOT NULL,
                centro_costo_codigo VARCHAR(50) NULL,
                estado ENUM('ACTIVO', 'INACTIVO') DEFAULT 'ACTIVO',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_motivo (motivo),
                INDEX idx_submotivo (sub_motivo),
                INDEX idx_cc_codigo (centro_costo_codigo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        const [cnt] = await conn.query('SELECT COUNT(*) as count FROM tesoreria_motivos_gastos');
        if (cnt[0].count === 0) {
            for (const item of initialData) {
                await conn.query('INSERT INTO tesoreria_motivos_gastos (motivo, sub_motivo, centro_costo_codigo, estado) VALUES (?, ?, ?, "ACTIVO")', item);
            }
            console.log(tenant + ': seeded ' + initialData.length + ' rows.');
        } else {
            console.log(tenant + ': already has ' + cnt[0].count + ' rows.');
        }

        await conn.end();
    }
    console.log('Migration successfully executed!');
})().catch(console.error);
