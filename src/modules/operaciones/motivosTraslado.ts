import { normalizar } from './ubigeos';

/** Motivos de traslado: Catálogo N.° 20 de SUNAT (Anexo 8 de la Resolución de Superintendencia 000240-2024/SUNAT) */
export const MOTIVOS_TRASLADO: ReadonlyArray<readonly [string, string]> = [
  ['01', 'Venta'],
  ['02', 'Compra'],
  ['03', 'Venta con entrega a terceros'],
  ['04', 'Traslado entre establecimientos de la misma empresa'],
  ['05', 'Consignación'],
  ['06', 'Devolución'],
  ['07', 'Recojo de bienes transformados'],
  ['08', 'Importación'],
  ['09', 'Exportación'],
  ['13', 'Otros no comprendidos en ningún código del presente catálogo'],
  ['14', 'Venta sujeta a confirmación del comprador'],
  ['17', 'Traslado de bienes para transformación'],
  ['18', 'Traslado por emisor itinerante de comprobantes de pago'],
  ['19', 'Traslado de mercancía extranjera'],
];

// Palabras clave para reconocer el motivo cuando llega como texto (XML o IA): «Venta», «VENTA», «01», «Traslado entre establecimientos»…
const CLAVES: Array<[RegExp, string]> = [
  [/ENTREGA A TERCEROS/, '03'], [/CONFIRMACION/, '14'], [/ESTABLECIMIENTOS|MISMA EMPRESA/, '04'], [/MERCANCIA EXTRANJERA/, '19'],
  [/ITINERANTE/, '18'], [/TRANSFORMACION/, '17'], [/RECOJO/, '07'], [/CONSIGN/, '05'], [/DEVOLU/, '06'], [/IMPORT/, '08'], [/EXPORT/, '09'],
  [/COMPRA/, '02'], [/^VENTA/, '01'], [/^OTROS?/, '13'],
];

/** El motivo del catálogo que corresponde a un texto o a un código; null si no se reconoce */
export function motivoDeTexto(texto: unknown): readonly [string, string] | null {
  const n = normalizar(texto);
  if (!n) return null;
  if (/^\d{1,2}$/.test(n)) return MOTIVOS_TRASLADO.find(([c]) => c === n.padStart(2, '0')) ?? null;
  const exacto = MOTIVOS_TRASLADO.find(([, d]) => normalizar(d) === n);
  if (exacto) return exacto;
  const clave = CLAVES.find(([re]) => re.test(n));
  return clave ? MOTIVOS_TRASLADO.find(([c]) => c === clave[1]) ?? null : null;
}
