// Bloqueo por documentos vencidos: SOAT y Revisión Técnica. Se mira la última fecha de vencimiento de cada tipo por placa.
// `pdb` es el pool con API de promesas del tenant actual.

const TIPOS_BLOQUEANTES = ['SOAT', 'REV_TECNICA'];
const NOMBRES = { SOAT: 'SOAT', REV_TECNICA: 'Revisión Técnica' };

function fechaCorta(v) {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return String(v || '');
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Devuelve los documentos vencidos de las placas indicadas: [{ placa, tipo, vence }]
async function documentosVencidosPara(pdb, placas) {
    const lista = [...new Set((placas || []).map(p => String(p || '').trim().toUpperCase()).filter(Boolean))];
    if (!pdb || !lista.length) return [];

    const [rows] = await pdb.query(
        `SELECT UPPER(TRIM(placa)) AS placa, UPPER(TRIM(tipo_documento)) AS tipo, MAX(fecha_vencimiento) AS vence,
                MAX(fecha_vencimiento) < CURDATE() AS vencido
         FROM documentos_flota
         WHERE UPPER(TRIM(placa)) IN (?) AND UPPER(TRIM(tipo_documento)) IN (?)
         GROUP BY UPPER(TRIM(placa)), UPPER(TRIM(tipo_documento))`,
        [lista, TIPOS_BLOQUEANTES]
    );
    return rows
        .filter(r => Number(r.vencido) === 1)
        .map(r => ({ placa: r.placa, tipo: r.tipo, vence: r.vence }));
}

function mensajeBloqueo(vencidos) {
    const detalle = vencidos.map(v => `${NOMBRES[v.tipo] || v.tipo} de ${v.placa} (venció ${fechaCorta(v.vence)})`).join('; ');
    return `No se puede continuar: documento vencido. ${detalle}. Regularice el documento para despachar.`;
}

// Aviso (no bloquea): se muestra mientras el documento se renueva
function mensajeAdvertencia(v) {
    return `Advertencia: ${NOMBRES[v.tipo] || v.tipo} de ${v.placa} vencido desde ${fechaCorta(v.vence)}. Renueve el documento.`;
}

module.exports = { documentosVencidosPara, mensajeBloqueo, mensajeAdvertencia, TIPOS_BLOQUEANTES };
