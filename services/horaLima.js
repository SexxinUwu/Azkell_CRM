// Hora de Lima (America/Lima, UTC-5, sin horario de verano) para todo lo que el sistema registra.
// Nunca usar new Date().toISOString() para guardar fechas u horas del negocio: da la hora UTC (5 horas adelantada)
// y después de las 7 p. m. incluso da el día siguiente.
const TZ = 'America/Lima';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

function partes(d = new Date()) {
  const p = {};
  for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
  return p;
}

/** AAAA-MM-DD de hoy en Lima */
function hoyLima(d = new Date()) { const p = partes(d); return `${p.year}-${p.month}-${p.day}`; }
/** AAAA-MM de este mes en Lima */
function mesLima(d = new Date()) { const p = partes(d); return `${p.year}-${p.month}`; }
/** AAAA-MM-DD HH:mm:ss en Lima (formato de MySQL) */
function ahoraLima(d = new Date()) { const p = partes(d); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`; }
/** AAAA-MM-DD HH:mm en Lima */
function ahoraLimaMin(d = new Date()) { return ahoraLima(d).slice(0, 16); }
/** AAAA-MM-DDTHH:mm en Lima (formato de datetime-local) */
function ahoraLimaLocal(d = new Date()) { return ahoraLimaMin(d).replace(' ', 'T'); }

module.exports = { hoyLima, mesLima, ahoraLima, ahoraLimaMin, ahoraLimaLocal };
