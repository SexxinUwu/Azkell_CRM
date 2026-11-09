// Lee una foto de una papeleta, multa o acta con Gemini (visión) y devuelve los datos para que la persona los revise.
// No guarda nada. Si la IA no está configurada o no responde, el módulo sigue funcionando con el registro manual.
const MODELOS = (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL.trim() || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash')
    .split(',').map(m => m.trim()).filter(Boolean);

const aviso = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

function instrucciones(entidades) {
    const lista = entidades.map(e => `${e.codigo} = ${e.nombre}`).join('\n');
    return `Eres un asistente que lee papeletas de tránsito, multas y actas de control de transporte de Perú a partir de una foto.
Devuelve SOLO un JSON con estas claves (usa null cuando el dato no se vea con claridad; NO inventes nada):
- entidad_codigo: uno de estos códigos según quién emitió el documento:
${lista}
- tipo_documento: PAPELETA, ACTA_CONTROL, RESOLUCION_MULTA, FOTOPAPELETA, NOTIFICACION u OTRO
- numero: número o código del documento, tal como está impreso
- fecha_infraccion: fecha y hora de la infracción en formato AAAA-MM-DDTHH:mm (si no hay hora, AAAA-MM-DD)
- lugar: lugar o vía y kilómetro de la infracción
- departamento: departamento o ciudad
- agente: nombre o código del agente o inspector
- placa: placa del vehículo, sin guiones
- conductor_nombre: nombre completo del conductor
- conductor_dni: DNI del conductor (solo dígitos)
- licencia: número de licencia de conducir
- infraccion_codigo: código de la infracción (por ejemplo M-01, G-12, S.19)
- infraccion_desc: descripción de la infracción
- monto: monto de la multa en números (sin símbolo de moneda)
- moneda: PEN o USD
- fecha_notificacion: AAAA-MM-DD si aparece
- observaciones: cualquier dato adicional importante (por ejemplo, internamiento del vehículo o retención de licencia)`;
}

/** Llama a los modelos configurados en orden hasta que uno responda */
async function leerPapeletaConIA(buffer, mimetype, entidades) {
    const clave = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim();
    if (!clave) throw aviso('La lectura con IA no está disponible (falta configurar GEMINI_API_KEY). Registra los datos a mano.', 503);

    const cuerpo = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: instrucciones(entidades) }, { inlineData: { mimeType: mimetype, data: buffer.toString('base64') } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });

    let ultimo = 'No se pudo leer la foto.';
    for (const modelo of MODELOS) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
                body: cuerpo,
                signal: AbortSignal.timeout(30000),
            });
            const data = await res.json().catch(() => null);
            if (res.status === 429) { ultimo = 'La IA llegó a su límite por hoy. Intenta más tarde o registra los datos a mano.'; continue; }
            if (!res.ok) { ultimo = (data && data.error && data.error.message) ? String(data.error.message).slice(0, 160) : `Error ${res.status}`; continue; }
            const textos = ((data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []).filter(p => p.text && !p.thought).map(p => p.text).join('');
            const json = JSON.parse(textos.replace(/^```json\s*|```$/g, '').trim());
            return limpiar(json, entidades);
        } catch (e) {
            ultimo = e.name === 'TimeoutError' ? 'La IA tardó demasiado.' : (ultimo || e.message);
        }
    }
    throw aviso(ultimo, 502);
}

/** Solo deja las claves esperadas y con el tipo correcto (lo que dice la IA nunca se guarda sin revisión) */
function limpiar(j, entidades) {
    const t = (v, max = 300) => (v == null || String(v).trim() === '' || String(v).toLowerCase() === 'null' ? null : String(v).trim().slice(0, max));
    const codigos = entidades.map(e => e.codigo);
    const entidad = t(j.entidad_codigo, 30) && codigos.includes(String(j.entidad_codigo).toUpperCase()) ? String(j.entidad_codigo).toUpperCase() : null;
    const fecha = t(j.fecha_infraccion, 20);
    const monto = Number(String(j.monto ?? '').replace(',', '.'));
    return {
        entidad_codigo: entidad,
        tipo_documento: ['PAPELETA', 'ACTA_CONTROL', 'RESOLUCION_MULTA', 'FOTOPAPELETA', 'NOTIFICACION', 'OTRO'].includes(String(j.tipo_documento || '').toUpperCase()) ? String(j.tipo_documento).toUpperCase() : null,
        numero: t(j.numero, 60),
        fecha_infraccion: fecha && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(fecha) ? fecha : null,
        lugar: t(j.lugar), departamento: t(j.departamento, 60), agente: t(j.agente, 150),
        placa: t(j.placa, 20) ? String(j.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
        conductor_nombre: t(j.conductor_nombre, 150),
        conductor_dni: t(j.conductor_dni, 15) ? String(j.conductor_dni).replace(/\D/g, '') || null : null,
        licencia: t(j.licencia, 30),
        infraccion_codigo: t(j.infraccion_codigo, 30), infraccion_desc: t(j.infraccion_desc, 500),
        monto: Number.isFinite(monto) && monto > 0 ? monto : null,
        moneda: String(j.moneda || '').toUpperCase() === 'USD' ? 'USD' : 'PEN',
        fecha_notificacion: t(j.fecha_notificacion, 12) && /^\d{4}-\d{2}-\d{2}$/.test(String(j.fecha_notificacion)) ? String(j.fecha_notificacion) : null,
        observaciones: t(j.observaciones, 1000),
    };
}

module.exports = { leerPapeletaConIA };
