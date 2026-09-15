require('dotenv').config();
const path = require('path');
const { getTenantPool } = require(path.join(__dirname, '../services/tenant_master'));

(async () => {
    try {
        const tdb = getTenantPool('azkell_tenant_yoguitransport').promise();
        const conductorNombre = 'ANGEL ERIK CHAGUA LUIS';

        const [vRows] = await tdb.query(`
            SELECT ov.*, 
                   DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d') AS fecha_formateada,
                   DATE_FORMAT(ov.fecha_inicio, '%Y-%m-%d %H:%i') AS inicio_formateado
            FROM operaciones_ordenes_viaje ov
            WHERE UPPER(TRIM(ov.conductor)) LIKE UPPER(?)
            ORDER BY 
                CASE WHEN UPPER(ov.estado) = 'ACTIVO' THEN 1 
                     WHEN UPPER(ov.estado) = 'INICIADO' THEN 2 
                     ELSE 3 END ASC,
                ov.fecha_viaje DESC, ov.id DESC
            LIMIT 1
        `, [`%${conductorNombre}%`]);
        const viaje = vRows[0];

        const [cajas] = await tdb.query(`
            SELECT id, serie, numero, motivo, sub_motivo, importe_total, tipo_movimiento,
                   DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, estado, voucher_url
            FROM tesoreria_caja
            WHERE UPPER(TRIM(orden_viaje)) = UPPER(?) AND UPPER(estado) != 'ANULADO'
            ORDER BY fecha ASC, id ASC
        `, [viaje.viaje]);

        let totalDepositado = 0;
        let totalDevoluciones = 0;
        cajas.forEach(c => {
            const imp = parseFloat(c.importe_total || 0);
            if (c.tipo_movimiento === 'INGRESO') totalDevoluciones += imp;
            else totalDepositado += imp;
        });

        const [gastos] = await tdb.query(`
            SELECT id, 
                   DATE_FORMAT(IFNULL(creado_en, fecha), '%d/%m/%Y %H:%i') AS fecha_formateada,
                   fecha, tipo_gasto, sub_motivo, tipo_comprobante, serie, numero,
                   proveedor_nombre, detalle, importe, sustento_url, estado
            FROM tesoreria_liquidaciones_gastos
            WHERE UPPER(TRIM(orden_viaje)) = UPPER(?)
            ORDER BY IFNULL(creado_en, fecha) DESC, id DESC
        `, [viaje.viaje]);

        let totalGastado = 0;
        for (let g of gastos) {
            if (g.estado !== 'RECHAZADO') totalGastado += parseFloat(g.importe || 0);
        }

        const netoAsignado = totalDepositado - totalDevoluciones;
        const saldo = netoAsignado - totalGastado;

        console.log('✅ TEST EXITOSO:', {
            ok: true,
            viaje: viaje.viaje,
            tracto: viaje.placa_tracto,
            remolque: viaje.placa_remolque,
            ruta: viaje.ruta,
            depositado: netoAsignado,
            rendido: totalGastado,
            saldo: saldo,
            gastos: gastos
        });
        process.exit(0);
    } catch(e) {
        console.error('Error:', e);
        process.exit(1);
    }
})();
