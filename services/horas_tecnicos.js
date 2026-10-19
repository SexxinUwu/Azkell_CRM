/**
 * services/horas_tecnicos.js — Horas trabajadas por técnico (historial de trabajos de taller).
 *
 * Reglas acordadas:
 *  - Horas de un trabajo = fecha_salida − fecha_trabajo (en horas). Se cuentan en el día de inicio.
 *  - Un trabajo puede tener varios técnicos (trabajos_ot.tecnico separado por coma): cada uno suma
 *    las horas del trabajo (tiempo de equipo). El total de horas reales por persona no se reparte.
 *  - Trabajos sin fecha_salida (o con salida anterior al inicio) no suman horas: se cuentan aparte
 *    como "en curso / sin cierre" (una vez por trabajo).
 *  - Horas proyectadas: 8 h por día laborable (lunes a sábado) del rango, es decir 48 h/semana.
 *    Un mes completo de 27 días laborables da 216 h.
 *  - Eficiencia = horas reales ÷ horas proyectadas.
 *
 * Las fechas de la base son DATETIME sin zona horaria: se interpretan tal cual, sin desfase.
 */

const HORAS_DIA_LABORABLE = 8;

/** "2026-10-16 07:30:00" o Date → milisegundos (como UTC, para que la resta no dependa de la zona) */
function instante(valor) {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : Date.UTC(valor.getFullYear(), valor.getMonth(), valor.getDate(), valor.getHours(), valor.getMinutes(), valor.getSeconds());
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(valor));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

/** "AAAA-MM-DD" de un valor de fecha (sin zona horaria) */
function diaDe(valor) {
  if (valor instanceof Date) {
    const p = n => String(n).padStart(2, '0');
    return `${valor.getFullYear()}-${p(valor.getMonth() + 1)}-${p(valor.getDate())}`;
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(valor ?? ''));
  return m ? m[1] : null;
}

/** Lista de días "AAAA-MM-DD" entre desde y hasta (incluidos) */
function diasEntre(desde, hasta) {
  const out = [];
  const ini = instante(desde), fin = instante(hasta);
  if (ini == null || fin == null || fin < ini) return out;
  for (let t = ini; t <= fin; t += 86400000) {
    const d = new Date(t);
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
  }
  return out;
}

/** Día laborable = lunes a sábado (domingo no cuenta) */
function esLaborable(dia) {
  const d = new Date(instante(dia)).getUTCDay(); // 0 = domingo
  return d !== 0;
}

const claveTecnico = nombre => String(nombre).trim().replace(/\s+/g, ' ').toUpperCase();

/** Nombres de técnicos de un trabajo: `tecnico` viene separado por coma. Sin repetidos. */
function nombresDe(valor) {
  const porClave = new Map();
  for (const parte of String(valor ?? '').split(',')) {
    const nombre = parte.trim().replace(/\s+/g, ' ');
    if (nombre && !porClave.has(claveTecnico(nombre))) porClave.set(claveTecnico(nombre), nombre);
  }
  return [...porClave.values()];
}

/**
 * "AAAA-MM-DD HH:mm:ss" tal como está en la base (hora de pared, sin zona).
 * Así el navegador no la convierte de zona y muestra la misma hora sin importar dónde corra el servidor.
 */
function fechaNaive(valor) {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    const p = n => String(n).padStart(2, '0');
    return `${valor.getFullYear()}-${p(valor.getMonth() + 1)}-${p(valor.getDate())} ${p(valor.getHours())}:${p(valor.getMinutes())}:${p(valor.getSeconds())}`;
  }
  return String(valor).replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '').slice(0, 19);
}

/** Horas reales de un trabajo (2 decimales), o null si no tiene cierre válido (en curso) */
function horasDeTrabajo(t) {
  const inicio = instante(t.fecha_trabajo);
  const salida = instante(t.fecha_salida);
  if (inicio == null || salida == null || salida < inicio) return null;
  return Math.round(((salida - inicio) / 3600000) * 100) / 100;
}

/**
 * @param {Array} trabajos filas de trabajos_ot: { tecnico, fecha_trabajo, fecha_salida, ... }
 * @param {string} desde "AAAA-MM-DD"
 * @param {string} hasta "AAAA-MM-DD"
 */
function calcularHorasTecnicos(trabajos, desde, hasta) {
  const dias = diasEntre(desde, hasta);
  const laborables = dias.filter(esLaborable).length;
  const proyectadasPorTecnico = laborables * HORAS_DIA_LABORABLE;
  const enRango = new Set(dias);

  const porTecnico = new Map();
  let enCurso = 0, sinTecnico = 0, trabajosEnRango = 0;

  for (const t of trabajos || []) {
    const dia = diaDe(t.fecha_trabajo);
    if (!dia || !enRango.has(dia)) continue;
    trabajosEnRango++;
    const nombres = nombresDe(t.tecnico);
    if (!nombres.length) { sinTecnico++; continue; }

    // Cada persona del trabajo recibe sus horas (tiempo de equipo); el trabajo en curso se cuenta una vez
    const horas = horasDeTrabajo(t);
    if (horas == null) enCurso++;
    for (const nombre of nombres) {
      const clave = claveTecnico(nombre);
      if (!porTecnico.has(clave)) porTecnico.set(clave, { nombre, porDia: {}, reales: 0, enCurso: 0 });
      const fila = porTecnico.get(clave);
      if (horas == null) {
        fila.enCurso++;
        continue;
      }
      fila.porDia[dia] = (fila.porDia[dia] || 0) + horas;
      fila.reales += horas;
    }
  }

  const tecnicos = [...porTecnico.values()]
    .map(f => ({
      nombre: f.nombre,
      porDia: Object.fromEntries(Object.entries(f.porDia).map(([d, h]) => [d, Math.round(h * 100) / 100])),
      reales: Math.round(f.reales * 100) / 100,
      proyectadas: proyectadasPorTecnico,
      eficiencia: proyectadasPorTecnico > 0 ? Math.round((f.reales / proyectadasPorTecnico) * 1000) / 10 : 0,
      enCurso: f.enCurso,
    }))
    .sort((a, b) => b.reales - a.reales || a.nombre.localeCompare(b.nombre));

  return {
    desde, hasta,
    dias: dias.map(d => ({ fecha: d, laborable: esLaborable(d) })),
    diasLaborables: laborables,
    horasPorDiaLaborable: HORAS_DIA_LABORABLE,
    proyectadasPorTecnico,
    tecnicos,
    resumen: { trabajos: trabajosEnRango, enCurso, sinTecnico },
  };
}

module.exports = { calcularHorasTecnicos, horasDeTrabajo, fechaNaive, diasEntre, esLaborable, HORAS_DIA_LABORABLE };
