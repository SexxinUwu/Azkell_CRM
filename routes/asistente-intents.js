// Pedidos de reporte que se entienden sin IA: "reporte de placas en Excel", "conductores en PDF".
// Se resuelven aquí sin gastar cuota de Gemini (y funcionan aunque la cuota se haya agotado).
// Si la frase es ambigua o es una pregunta de ayuda, devuelve null y responde Gemini.

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','octubre','noviembre','diciembre'];

const key = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
function limaToday() {
  const [y, m, d] = key(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const utcKey = (d) => d.toISOString().slice(0, 10);

function parseRange(text) {
  const t = strip(text);
  const today = limaToday();
  if (/\bhoy\b/.test(t)) return { desde: utcKey(today), hasta: utcKey(today) };
  if (/\bayer\b/.test(t)) { const y = addDays(today, -1); return { desde: utcKey(y), hasta: utcKey(y) }; }
  const weekday = (today.getUTCDay() + 6) % 7;
  if (/semana pasada|ultima semana/.test(t)) {
    const start = addDays(today, -weekday - 7);
    return { desde: utcKey(start), hasta: utcKey(addDays(start, 6)) };
  }
  if (/esta semana|de la semana/.test(t)) return { desde: utcKey(addDays(today, -weekday)), hasta: utcKey(today) };
  if (/mes pasado|ultimo mes/.test(t)) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1, 12));
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0, 12));
    return { desde: utcKey(first), hasta: utcKey(last) };
  }
  const range = /del?\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\s+al?\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/.exec(t);
  if (range) {
    const year = (y) => (y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : today.getUTCFullYear());
    const a = new Date(Date.UTC(year(range[3]), Number(range[2]) - 1, Number(range[1]), 12));
    const b = new Date(Date.UTC(year(range[6]), Number(range[5]) - 1, Number(range[4]), 12));
    if (!isNaN(a.getTime()) && !isNaN(b.getTime())) return { desde: utcKey(a), hasta: utcKey(b) };
  }
  const month = MONTHS.findIndex(m => t.includes(m) || (m === 'setiembre' && t.includes('septiembre')));
  if (month >= 0) {
    const y = month > today.getUTCMonth() ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
    const first = new Date(Date.UTC(y, month, 1, 12));
    const last = new Date(Date.UTC(y, month + 1, 0, 12));
    return { desde: utcKey(first), hasta: utcKey(last > today ? today : last) };
  }
  return undefined;
}

/** Qué reporte se pide, o null si la frase no es claramente un pedido de reporte. */
function detectReport(message) {
  const t = strip(message);
  if (/\b(como|por que|que es|que significa|donde|puedo|quiero saber)\b/.test(t)) return null;
  if (!/(reporte|excel|pdf|listado|lista de|descarga|exporta|genera|fleetrun|inspecciones|conductores|placas)/.test(t)) return null;

  const tipo =
    /(fleetrun|mantenimiento preventivo|mant[. ]prev|tipo_mp)/.test(t) ? 'fleetrun'
    : /(inspecci[oó]n|inspecciones|rampa|checklist|tecnica|tecnico)/.test(t) ? 'inspecciones'
    : /(conductor|chofer|chofer|lista de conductores|directorio)/.test(t) ? 'conductores'
    : /(placa|vehiculo|unidad|flota|camion|remolque|tracto)/.test(t) ? 'placas'
    : null;
  if (!tipo) return null;

  const formato = /\bpdf\b/.test(t) ? 'pdf' : 'excel';
  const rangeTypes = ['inspecciones', 'fleetrun'];
  const range = rangeTypes.includes(tipo) ? parseRange(t) : undefined;
  return { tipo, formato, ...range };
}

module.exports = { detectReport, parseRange };
