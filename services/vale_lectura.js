// Lee la foto de un voucher/ticket de combustible con Gemini (visión) y devuelve los datos para que la persona los confirme.
// No guarda nada. Si la IA no responde, el vale se registra a mano.
const MODELOS = (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL.trim() || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash')
    .split(',').map(m => m.trim()).filter(Boolean);

const aviso = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const texto = (v, max = 200) => { const t = v == null ? '' : String(v).trim(); return t && t.toLowerCase() !== 'null' ? t.slice(0, max) : null; };
const numero = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(/,(\d{1,3})$/, '.$1').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const fechaISO = v => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '')); if (m) return `${m[1]}-${m[2]}-${m[3]}`; const n = /(\d{2})[\/-](\d{2})[\/-](\d{4})/.exec(String(v ?? '')); return n ? `${n[3]}-${n[2]}-${n[1]}` : null; };
/** Lleva lo que dice el ticket a los combustibles de uso en el Perú */
const COMBUSTIBLES = ['Diésel B5', 'Diésel B5 S-50', 'Gasolina regular', 'Gasolina premium', 'GNV', 'GLP', 'GNL', 'Úrea / AdBlue'];
function combustibleDe(v) {
    const x = String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!x.trim()) return null;
    if (/urea|adblue|ad blue/.test(x)) return 'Úrea / AdBlue';
    if (/gnv/.test(x)) return 'GNV';
    if (/gnl/.test(x)) return 'GNL';
    if (/glp|gas licuado/.test(x)) return 'GLP';
    if (/premium|9[578]/.test(x)) return 'Gasolina premium';
    if (/regular|gasolina|9[0]|84/.test(x)) return 'Gasolina regular';
    if (/s-?50/.test(x)) return 'Diésel B5 S-50';
    if (/diesel|d2|b5|petroleo/.test(x)) return 'Diésel B5';
    return null;
}
const horaTxt = v => { const m = /(\d{1,2}):(\d{2})/.exec(String(v ?? '')); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null; };

const INSTRUCCIONES = `Eres un lector de vouchers y tickets de venta de combustible de grifos del Perú. Devuelve SOLO un JSON con estas claves (null si no se ve):
{
 "estacion_nombre": "razón social o nombre del grifo",
 "estacion_ruc": "RUC de 11 dígitos del grifo",
 "fecha": "AAAA-MM-DD",
 "hora": "HH:MM",
 "numero_voucher": "serie-número del ticket, boleta o factura (ej. B001-123456)",
 "placa": "placa del vehículo si figura",
 "combustible": "UNO de: Diésel B5, Diésel B5 S-50, Gasolina regular, Gasolina premium, GNV, GLP, GNL, Úrea / AdBlue",
 "galones": número de galones despachados (usa punto decimal),
 "precio_galon": precio por galón con IGV (punto decimal),
 "total": importe total pagado,
 "moneda": "SOLES o DOLARES",
 "km_odometro": kilometraje del odómetro si figura (entero),
 "conductor_doc": "DNI del conductor si figura"
}
Reglas: copia lo que ves, no inventes. Cantidad: galones para líquidos y GLP; GNV en m³; GNL en kg (pon ese número en galones). Si el ticket muestra litros, convierte a galones (1 galón = 3.785 L). Gasolina de 90 = regular; 95, 97 o 98 = premium. Números sin símbolo de moneda ni separador de miles.`;

async function leerConIA(buffer, mimetype) {
    const clave = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim();
    if (!clave) throw aviso('La lectura con IA no está disponible (falta configurar GEMINI_API_KEY). Registra los datos a mano.', 503);
    const cuerpo = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: INSTRUCCIONES }, { inlineData: { mimeType: mimetype, data: buffer.toString('base64') } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    let ultimo = 'No se pudo leer el voucher.';
    for (let ronda = 0; ronda < 2; ronda++) {
        let saturado = false;
        for (const modelo of MODELOS) {
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave }, body: cuerpo, signal: AbortSignal.timeout(25000),
                });
                const data = await res.json().catch(() => null);
                if (res.status === 429) { ultimo = 'La IA llegó a su límite por hoy. Registra los datos a mano.'; continue; }
                if (res.status === 503 || res.status === 500) { saturado = true; ultimo = 'La IA está saturada. Vuelve a intentarlo en un minuto o registra los datos a mano.'; continue; }
                if (!res.ok) { ultimo = (data && data.error && data.error.message) ? String(data.error.message).slice(0, 160) : `Error ${res.status}`; continue; }
                const textos = ((data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []).filter(p => p.text && !p.thought).map(p => p.text).join('');
                return limpiar(JSON.parse(textos.replace(/^```json\s*|```$/g, '').trim()));
            } catch (e) {
                saturado = true;
                ultimo = e.name === 'TimeoutError' ? 'La IA tardó demasiado. Vuelve a intentarlo o registra los datos a mano.' : (ultimo || e.message);
            }
        }
        if (!saturado) break;
        await new Promise(r => setTimeout(r, 3000));
    }
    throw aviso(ultimo, 502);
}

/** Deja solo las claves esperadas, con su tipo, y completa lo que se deduce (total = galones × precio) */
function limpiar(j) {
    j = j && typeof j === 'object' ? j : {};
    const d = {
        estacion_nombre: texto(j.estacion_nombre, 200),
        estacion_ruc: (String(j.estacion_ruc ?? '').replace(/\D/g, '').match(/^\d{11}$/) || [null])[0],
        fecha: fechaISO(j.fecha), hora: horaTxt(j.hora),
        numero_voucher: texto(j.numero_voucher, 60),
        placa: texto(j.placa, 20) ? String(j.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
        combustible: combustibleDe(j.combustible),
        galones: numero(j.galones), precio_galon: numero(j.precio_galon), total: numero(j.total),
        moneda: /D[OÓ]L|USD|US\$/i.test(String(j.moneda || '')) ? 'DOLARES' : 'SOLES',
        km_odometro: numero(j.km_odometro) != null ? Math.round(numero(j.km_odometro)) : null,
        conductor_doc: (String(j.conductor_doc ?? '').replace(/\D/g, '').match(/^\d{8}$/) || [null])[0],
    };
    if (d.total == null && d.galones != null && d.precio_galon != null) d.total = Math.round(d.galones * d.precio_galon * 100) / 100;
    if (d.precio_galon == null && d.galones && d.total) d.precio_galon = Math.round((d.total / d.galones) * 10000) / 10000;
    if (d.galones == null && d.precio_galon && d.total) d.galones = Math.round((d.total / d.precio_galon) * 1000) / 1000;
    return d;
}

async function leerVoucher(buffer, mimetype) {
    if (!/^image\/|application\/pdf/.test(mimetype || '')) throw aviso('Sube una foto (JPG, PNG) o un PDF del voucher.');
    return leerConIA(buffer, mimetype);
}

module.exports = { leerVoucher, limpiar, COMBUSTIBLES, combustibleDe };
