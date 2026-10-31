// Caja chica: fondos asignados a un responsable (uno por moneda), sus gastos, sustentos,
// descuentos y reposiciones. Lo comparten las rutas de caja chica y el pago de requerimientos.

const SQL_TABLAS = [
    `CREATE TABLE IF NOT EXISTS caja_chica_fondos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        responsable VARCHAR(200) NOT NULL,
        moneda VARCHAR(10) NOT NULL,
        monto_asignado DECIMAL(14,2) NOT NULL,
        cuenta_origen VARCHAR(255) NULL,
        descripcion VARCHAR(500) NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        aprob_tesoreria_por VARCHAR(200) NULL, aprob_tesoreria_at DATETIME NULL,
        aprob_gerencia_por VARCHAR(200) NULL, aprob_gerencia_at DATETIME NULL,
        creado_por VARCHAR(200) NULL,
        creado_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ccf_responsable (responsable)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS caja_chica_movimientos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fondo_id INT NOT NULL,
        tipo VARCHAR(10) NOT NULL,
        concepto VARCHAR(20) NOT NULL,
        fecha DATE NOT NULL,
        monto DECIMAL(14,2) NOT NULL,
        descripcion VARCHAR(500) NULL,
        motivo VARCHAR(150) NULL,
        sub_motivo VARCHAR(200) NULL,
        centro_costo VARCHAR(20) NULL,
        placa VARCHAR(20) NULL,
        proveedor VARCHAR(200) NULL,
        oc_id VARCHAR(30) NULL,
        comprobante_url TEXT NULL,
        estado_sustento VARCHAR(20) NULL,
        plazo_vence DATE NULL,
        sustentado_at DATETIME NULL,
        aprob_tesoreria_por VARCHAR(200) NULL, aprob_tesoreria_at DATETIME NULL,
        aprob_gerencia_por VARCHAR(200) NULL, aprob_gerencia_at DATETIME NULL,
        reposicion_id INT NULL,
        creado_por VARCHAR(200) NULL,
        creado_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ccm_fondo (fondo_id),
        INDEX idx_ccm_oc (oc_id),
        INDEX idx_ccm_reposicion (reposicion_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS caja_chica_reposiciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fondo_id INT NOT NULL,
        monto DECIMAL(14,2) NOT NULL,
        cuenta_origen VARCHAR(255) NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        aprob_tesoreria_por VARCHAR(200) NULL, aprob_tesoreria_at DATETIME NULL,
        aprob_gerencia_por VARCHAR(200) NULL, aprob_gerencia_at DATETIME NULL,
        caja_central_id INT NULL,
        creado_por VARCHAR(200) NULL,
        creado_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ccr_fondo (fondo_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// Una vez por base: las tablas se crean si faltan (IF NOT EXISTS, sin tocar datos existentes)
const listas = new WeakMap();
async function asegurarTablas(tdb, clave) {
    if (listas.get(clave)) return;
    for (const sql of SQL_TABLAS) await tdb.query(sql);
    listas.set(clave, true);
}

/** Fecha de hoy en Lima, como texto AAAA-MM-DD (el servidor puede correr en UTC) */
async function hoyIso(tdb) {
    const [rows] = await tdb.query("SELECT DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-05:00'), '%Y-%m-%d') AS hoy");
    return rows[0].hoy;
}

/** Suma días hábiles (lunes a viernes) a una fecha AAAA-MM-DD. Sin feriados: se agregan cuando se definan. */
function sumarDiasHabiles(iso, dias) {
    const d = new Date(`${iso}T12:00:00Z`);
    let n = 0;
    while (n < dias) {
        d.setUTCDate(d.getUTCDate() + 1);
        const dia = d.getUTCDay();
        if (dia !== 0 && dia !== 6) n++;
    }
    return d.toISOString().slice(0, 10);
}

async function saldoFondo(tdb, fondoId) {
    const [rows] = await tdb.query(
        "SELECT COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE -monto END), 0) AS saldo FROM caja_chica_movimientos WHERE fondo_id = ?",
        [fondoId]
    );
    return Math.round(Number(rows[0].saldo) * 100) / 100;
}

/** Importe de una OC en su moneda: en dólares es el total en soles ÷ tipo de cambio, igual que el pago de requerimientos */
function importeOc(oc) {
    const total = Number(oc.total_pen) || 0;
    const tc = Number(oc.tipo_cambio) || 0;
    const valor = String(oc.moneda || '').toUpperCase() === 'USD' && tc > 0 ? total / tc : total;
    return Math.round(valor * 100) / 100;
}

/** Cuánto falta por pagar de una OC: su importe menos lo ya pagado con caja chica. Un gasto descontado al
 *  responsable no reabre la OC: el proveedor ya fue pagado. */
async function pendienteOc(tdb, ocId) {
    const [ocs] = await tdb.query('SELECT id, estado, moneda, total_pen, tipo_cambio, proveedor_nombre, documento_referencia FROM entradas_inv WHERE id = ?', [ocId]);
    if (!ocs.length) return null;
    const oc = ocs[0];
    const [pagos] = await tdb.query(
        "SELECT COALESCE(SUM(monto), 0) AS pagado FROM caja_chica_movimientos WHERE oc_id = ? AND concepto = 'GASTO'",
        [ocId]
    );
    const total = importeOc(oc);
    const pagado = Math.round(Number(pagos[0].pagado) * 100) / 100;
    return { oc, total, pagado, pendiente: Math.round((total - pagado) * 100) / 100 };
}

/** Siguiente número de Caja (serie del año), igual que el pago de requerimientos */
async function siguienteNumeroCaja(tdb, serie) {
    const [rows] = await tdb.query('SELECT numero FROM tesoreria_caja WHERE serie = ? ORDER BY id DESC LIMIT 1', [serie]);
    let siguiente = 1;
    if (rows[0] && rows[0].numero) {
        const m = String(rows[0].numero).match(/\d+$/);
        if (m) siguiente = parseInt(m[0], 10) + 1;
    }
    return String(siguiente).padStart(8, '0');
}

/** Egreso en la caja central de Tesorería (cuando se asigna o se repone un fondo) */
async function registrarEgresoCentral(tdb, { monto, moneda, descripcion, cuentaEmpresa, usuario }) {
    const serie = String(new Date().getFullYear());
    const numero = await siguienteNumeroCaja(tdb, serie);
    const [r] = await tdb.query(`
        INSERT INTO tesoreria_caja (
            fecha, hora, fecha_valuta, hora_valuta, numero_constancia_deposito, numero_factura, serie, numero,
            orden_viaje, conductor, ruta_viaje, placa, autoriza, motivo, centro_costo, sub_motivo, modalidad_pago, moneda,
            tipo_persona, persona, tipo_movimiento, subtotal, retencion_detraccion, importe_total, tipo_cambio, descripcion,
            tipo_comprobante, cuenta_bancaria_persona, cuenta_bancaria_empresa, voucher_url, observacion, no_aplica_liquidacion,
            estado, usuario_creacion, usuario_aprobacion, fecha_aprobacion
        ) VALUES (
            CURDATE(), CURTIME(), CURDATE(), CURTIME(), '', '', ?, ?,
            '', '', '', '', ?, 'CAJA CHICA', 'CC-100', 'Caja chica', 'TRANSFERENCIA BANCARIA', ?,
            'ADMINISTRATIVO', 'CAJA CHICA', 'EGRESO', ?, 0, ?, 1, ?,
            'VALE PROVISIONAL DE CAJA', '', ?, NULL, '', 0,
            'REGISTRADO', ?, ?, NOW()
        )`,
        [serie, numero, usuario, moneda, monto, monto, descripcion, cuentaEmpresa || '', usuario, usuario]
    );
    return r.insertId;
}

module.exports = {
    asegurarTablas, hoyIso, sumarDiasHabiles, saldoFondo, importeOc, pendienteOc, registrarEgresoCentral,
};
