// Cálculo del análisis de combustible por viaje y por tramo (IDA / RETORNO).
// Es el mismo criterio del clásico (modulos/operaciones/combustible-analisis/logica.js): mismas reglas de ruta,
// de matriz teórica, de separación de vales por tramo y de la regla del 25% para unidades sin carreta.

export interface MatrizCalc {
  sentido: string; ruta: string; motor: string; confg: string;
  km_0: number | string; km_5: number | string; km_10: number | string; km_15: number | string;
  km_20: number | string; km_25: number | string; km_30: number | string; km: number | string;
}

export interface VoucherCalc {
  esPuntoPartida?: boolean; tipo?: string; producto?: string; galones?: number; importe?: number; odometro?: number; peso?: number;
}

export interface ViajeCalc {
  ruta: string; rutaIda: string; rutaRetorno: string; motor: string; configuracion: string; carreta: string;
  pesoIda: number; pesoRetorno: number; pesoMaxTn: number; kmInicio: number; kmFin: number; vouchers: VoucherCalc[];
}

export interface TramoCalc {
  ruta: string; peso: number; kmIni: number; kmFin: number; recorrido: number; galones: number; rendimiento: number; gasto: number;
  kmTeorico: number; galTeorico: number; rendTeorico: number; diferencia: number | null; vales: number; orden: string;
}

export interface AnalisisViaje {
  ida: TramoCalc; retorno: TramoCalc;
  galTeorico: number; kmTeorico: number; rendTeorico: number; sinCarreta: boolean;
}

const CAMPOS_TRAMO = ['km_0', 'km_5', 'km_10', 'km_15', 'km_20', 'km_25', 'km_30'] as const;

// Igual que caNormalizar del clásico: sin tildes, mayúsculas, Callao cuenta como Lima
const lugar = (s?: string | null) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/\bCALLAO\b/g, 'LIMA').replace(/\s+/g, ' ').trim();
const codigoMotor = (s?: string | null) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const numero = (v: unknown) => Number(v) || 0;

// Clasificación de producto igual que _caIsFuelMatch del clásico (combustible-analisis y urea-analisis):
// UREA = contiene UREA, ADBLUE o DEF; D2 = D2, DIESEL, DIÉSEL o B5, o cualquier producto que no sea de urea.
export function coincideCombustible(producto: string | null | undefined, objetivo: 'D2' | 'UREA'): boolean {
  const prod = String(producto ?? '').toUpperCase().trim();
  if (objetivo === 'UREA') return prod === 'UREA' || prod.includes('UREA') || prod.includes('ADBLUE') || prod.includes('DEF');
  return prod === 'D2' || prod.includes('DIESEL') || prod.includes('DIÉSEL') || prod.includes('B5')
    || (!prod.includes('UREA') && !prod.includes('ADBLUE') && !prod.includes('DEF'));
}

// Retorno = ida invertida: "LIMA - AREQUIPA" -> "AREQUIPA - LIMA"
export function invertirRuta(r?: string | null): string {
  if (!r) return '';
  let norm = lugar(r).replace(/^(IDA|RETORNO)\s*:\s*/i, '');
  if (norm.includes('/')) norm = norm.split('/')[0].trim();
  const partes = norm.split('-').map(p => p.trim()).filter(Boolean);
  if (partes.length === 2 && partes[0] !== partes[1]) return `${partes[1]} - ${partes[0]}`;
  return norm;
}

// Retorno de un viaje con varios tramos ("LIMA - MOYOBAMBA | CHICLAYO - TRUJILLO"): siempre termina en LIMA y sale
// desde el destino del último tramo ("TRUJILLO - LIMA"). Si el último tramo ya llega a Lima, se usa su origen.
export function retornoALima(ruta?: string | null): string {
  const tramos = String(ruta ?? '').split('|').map(t => t.trim()).filter(Boolean);
  const ultimo = tramos[tramos.length - 1];
  if (!ultimo) return '';
  const lugares = lugar(ultimo).replace(/^(IDA|RETORNO)\s*:\s*/i, '').split('-').map(p => p.trim()).filter(Boolean);
  if (lugares.length < 2) return '';
  const base = lugares[lugares.length - 1] === 'LIMA' ? lugares[0] : lugares[lugares.length - 1];
  return base === 'LIMA' ? '' : `${base} - LIMA`;
}

// Busca la fila de la matriz: primero con configuración exacta, luego sin restringir configuración
function buscarEnMatriz(matriz: MatrizCalc[], ruta: string, sentido: string, motor: string, confg: string): MatrizCalc | null {
  let r = lugar(ruta).replace(/^(IDA|RETORNO)\s*:\s*/i, '');
  if (r.includes('/')) r = r.split('/')[0].trim();
  const s = (sentido || 'IDA').toUpperCase().trim();
  const mNorm = codigoMotor(motor);
  const cNorm = lugar(confg);
  const candidatos = matriz.filter(m => (m.sentido || 'IDA').toUpperCase().trim() === s);
  if (!candidatos.length) return null;

  const coincide = (m: MatrizCalc, exigirConfg: boolean) => {
    const mr = lugar(m.ruta);
    const mm = codigoMotor(m.motor);
    const mc = lugar(m.confg);
    if (!(mr && (r === mr || r.includes(mr) || mr.includes(r)))) return false;
    if (mNorm && mm) { if (!(mNorm.includes(mm) || mm.includes(mNorm))) return false; }
    else if (mNorm || mm) return false;
    if (exigirConfg && cNorm && mc) return cNorm === mc || cNorm.startsWith(mc) || mc.startsWith(cNorm);
    return true;
  };
  if (cNorm) {
    const exacto = candidatos.find(m => coincide(m, true));
    if (exacto) return exacto;
  }
  return candidatos.find(m => coincide(m, false)) ?? null;
}

// Galones teóricos según el peso: escalón de 5 Tn (umbral en 2.5, 7.5, ...); si el escalón está vacío, retrocede
export function galonesTeoricos(matriz: MatrizCalc[], ruta: string, sentido: string, pesoTn: number, motor: string, confg: string): number {
  const m = buscarEnMatriz(matriz, ruta, sentido, motor, confg);
  if (!m) return 0;
  const p = numero(pesoTn);
  const idx = p <= 2.5 ? 0 : p <= 7.5 ? 1 : p <= 12.5 ? 2 : p <= 17.5 ? 3 : p <= 22.5 ? 4 : p <= 27.5 ? 5 : 6;
  for (let i = idx; i >= 0; i--) {
    const v = numero(m[CAMPOS_TRAMO[i]]);
    if (v > 0) return v;
  }
  return 0;
}

export function kmTeoricos(matriz: MatrizCalc[], ruta: string, sentido: string, motor: string, confg: string): number {
  const m = buscarEnMatriz(matriz, ruta, sentido, motor, confg);
  return m ? Math.max(0, numero(m.km)) : 0;
}

const pesoDeVoucher = (v: VoucherCalc) => { const p = numero(v.peso); return p > 50 ? +(p / 1000).toFixed(2) : +p.toFixed(2); };
const menorPositivo = (xs: number[]) => { const v = xs.filter(Boolean); return v.length ? Math.min(...v) : 0; };
const mayorPositivo = (xs: number[]) => { const v = xs.filter(Boolean); return v.length ? Math.max(...v) : 0; };
const esRetorno = (v: VoucherCalc) => /VUELTA|RETORNO/.test(String(v.tipo ?? '').toUpperCase());

// Unidades que ruedan sin carreta (solo tracto): se les descuenta 25% del teórico consolidado
export function esSinCarreta(carreta?: string | null): boolean {
  const c = String(carreta ?? '').trim().toUpperCase();
  return !c || c === '—' || c === '-' || c.includes('SIN CARRETA') || c.includes('SOLO TRACTO');
}

export function analizarViaje(viaje: ViajeCalc, matriz: MatrizCalc[]): AnalisisViaje {
  // Vales del viaje sin el punto de partida; el retorno son los marcados como VUELTA o RETORNO, el resto es ida
  const vales = viaje.vouchers.filter(v => !v.esPuntoPartida);
  const vIda = vales.filter(v => !esRetorno(v));
  const vRet = vales.filter(esRetorno);

  // Ruta de ida y de retorno (el retorno sale invertido si no viene o es igual a la ida)
  let rutaIda = viaje.rutaIda || viaje.ruta;
  let rutaRet = viaje.rutaRetorno || (viaje.ruta && viaje.ruta.includes('|') ? retornoALima(viaje.ruta) || viaje.ruta.split('|')[1].trim() : '');
  if (viaje.ruta && !viaje.ruta.includes('|')) rutaIda = viaje.ruta;
  if (!rutaRet || lugar(rutaRet) === lugar(rutaIda)) rutaRet = invertirRuta(rutaIda || viaje.ruta);
  rutaIda = rutaIda.replace(/\bCALLAO\b/gi, 'LIMA');
  rutaRet = rutaRet.replace(/\bCALLAO\b/gi, 'LIMA');

  // Pesos: el del servidor; si no hay, el de los vales; si no hay retorno, el total va a la ida
  let pesoIda = numero(viaje.pesoIda) > 0 ? numero(viaje.pesoIda) : (vIda.length ? Math.max(0, ...vIda.map(pesoDeVoucher)) : 0);
  if (pesoIda === 0 && numero(viaje.pesoMaxTn) > 0 && !numero(viaje.pesoRetorno)) pesoIda = numero(viaje.pesoMaxTn);
  const pesoRet = numero(viaje.pesoRetorno);

  // Galones y gasto reales por tramo
  const galIda = vIda.reduce((s, v) => s + numero(v.galones), 0);
  const galRet = vRet.reduce((s, v) => s + numero(v.galones), 0);
  const gastoIda = vIda.reduce((s, v) => s + numero(v.importe), 0);
  const gastoRet = vRet.reduce((s, v) => s + numero(v.importe), 0);

  // Odómetros por tramo (mismo orden de reglas que el clásico)
  const kIni = viaje.kmInicio;
  const kFin = viaje.kmFin;
  const odoIda = vIda.map(v => numero(v.odometro));
  const odoRet = vRet.map(v => numero(v.odometro));
  const minIda = kIni > 0 ? kIni : menorPositivo(odoIda);
  const maxIda = vIda.length ? mayorPositivo(odoIda) : (vRet.length ? menorPositivo(odoRet) : kFin);
  const recIda = maxIda > minIda && minIda > 0 ? maxIda - minIda : 0;
  const minRet = vRet.length ? (maxIda || menorPositivo(odoRet)) : 0;
  const maxRet = vRet.length ? Math.max(mayorPositivo(odoRet), kFin) : 0;
  const recRet = maxRet > minRet && minRet > 0 ? maxRet - minRet : 0;

  // Teórico por tramo
  const galTIda = galonesTeoricos(matriz, rutaIda, 'IDA', pesoIda, viaje.motor, viaje.configuracion);
  const galTRet = rutaRet ? galonesTeoricos(matriz, rutaRet, 'RETORNO', pesoRet, viaje.motor, viaje.configuracion) : 0;
  const kmTIda = kmTeoricos(matriz, rutaIda, 'IDA', viaje.motor, viaje.configuracion);
  const kmTRet = rutaRet ? kmTeoricos(matriz, rutaRet, 'RETORNO', viaje.motor, viaje.configuracion) : 0;
  const galBase = galTIda > 0 || galTRet > 0 ? galTIda + galTRet : 0;
  const sinCarreta = esSinCarreta(viaje.carreta);
  const galTotal = sinCarreta && galBase > 0 ? galBase * 0.75 : galBase;
  const kmTotal = kmTIda > 0 || kmTRet > 0 ? kmTIda + kmTRet : 0;

  const tramo = (
    ruta: string, peso: number, kmIni_: number, kmFin_: number, recorrido: number, galones: number, gasto: number,
    galT: number, kmT: number, cuantos: number, orden: string,
  ): TramoCalc => ({
    ruta, peso, kmIni: kmIni_, kmFin: kmFin_, recorrido, galones, gasto,
    rendimiento: galones > 0 && recorrido > 0 ? recorrido / galones : 0,
    kmTeorico: kmT, galTeorico: galT, rendTeorico: galT > 0 && kmT > 0 ? kmT / galT : 0,
    diferencia: galT > 0 && galones > 0 ? galones - galT : null,
    vales: cuantos, orden,
  });

  return {
    ida: tramo(rutaIda, pesoIda, minIda, maxIda, recIda, galIda, gastoIda, galTIda, kmTIda, vIda.length, ''),
    retorno: tramo(rutaRet, pesoRet, minRet, maxRet, recRet, galRet, gastoRet, galTRet, kmTRet, vRet.length, ''),
    galTeorico: galTotal,
    kmTeorico: kmTotal,
    rendTeorico: galTotal > 0 && kmTotal > 0 ? kmTotal / galTotal : 0,
    sinCarreta,
  };
}
