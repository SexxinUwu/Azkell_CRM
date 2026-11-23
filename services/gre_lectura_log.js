'use strict';
// Registro de correcciones de la lectura de guías (XML o IA): compara lo que propuso el lector con lo que la persona
// confirmó y guarda solo las diferencias. No entrena a la IA: sirve para medir en qué campos se equivoca y mejorar las
// instrucciones (ver scripts/gre_ia_resumen.js). Registrar nunca debe impedir que la guía se guarde.

const texto = v => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t && t.toLowerCase() !== 'null' ? t : null; };
const mayus = v => { const t = texto(v); return t ? t.toUpperCase() : null; };
const digitos = v => { const d = String(v ?? '').replace(/\D/g, ''); return d || null; };
const fecha = v => { const t = texto(v); return t ? t.slice(0, 10) : null; };
const kilos = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
const placa = v => { const t = mayus(v); return t ? t.replace(/[^A-Z0-9]/g, '') || null : null; };

// Campos que se comparan y cómo se normalizan para no contar diferencias de formato (mayúsculas, espacios, guiones).
// Los ubigeos no entran: los completa el sistema por la dirección, no los lee la IA.
const CAMPOS = [
    ['tipo', mayus], ['numero_completo', mayus], ['fecha_emision', fecha], ['fecha_traslado', fecha],
    ['remitente_ruc', digitos], ['remitente_nombre', mayus], ['destinatario_doc', digitos], ['destinatario_nombre', mayus],
    ['transportista_ruc', digitos], ['transportista_nombre', mayus], ['modalidad', mayus], ['motivo', mayus],
    ['partida_direccion', mayus], ['llegada_direccion', mayus], ['peso_kg', kilos], ['bultos', digitos], ['descripcion', mayus],
    ['placa', placa], ['conductor_nombre', mayus], ['conductor_doc', digitos], ['licencia', mayus],
    ['vehiculo_tuc', mayus], ['vehiculo_autorizacion', mayus],
];

const corto = v => { const t = texto(v); return t ? t.slice(0, 200) : null; };

/** { total, corregidos, diferencias:[{campo, ia, final}] } entre lo que leyó el lector y lo que se guardó */
function compararLectura(original, final) {
    const o = original && typeof original === 'object' ? original : {};
    const f = final && typeof final === 'object' ? final : {};
    let total = 0;
    const diferencias = [];
    for (const [campo, normalizar] of CAMPOS) {
        const ia = normalizar(o[campo]);
        const fin = normalizar(f[campo]);
        if (ia == null && fin == null) continue;
        total++;
        if (ia !== fin) diferencias.push({ campo, ia: corto(o[campo]), final: corto(f[campo]) });
    }
    return { total, corregidos: diferencias.length, diferencias };
}

/** Guarda la comparación de una guía recién registrada. Cualquier fallo (por ejemplo, tabla aún sin migrar) solo se avisa en el log. */
async function registrarLectura(p, { guiaId, numero, fuente, original, final, usuario }) {
    try {
        if (!original || typeof original !== 'object' || !['IA', 'XML'].includes(fuente)) return;
        const r = compararLectura(original, final);
        await p.query(
            `INSERT INTO gre_lecturas_ia (guia_id, numero_completo, fuente, modelo, campos_total, campos_corregidos, diferencias_json, usuario) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [guiaId || null, String(numero || '').slice(0, 30), fuente, original.modelo ? String(original.modelo).slice(0, 60) : null, r.total, r.corregidos, JSON.stringify(r.diferencias), String(usuario || '').slice(0, 150)]);
    } catch (e) {
        console.warn('[gre-ia] no se pudo registrar la corrección de lectura:', e && e.message);
    }
}

module.exports = { compararLectura, registrarLectura, CAMPOS };
