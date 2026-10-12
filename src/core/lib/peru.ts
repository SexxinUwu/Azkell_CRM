// Documentos peruanos. Misma lógica que server/core/peru.ts, aquí para validar en línea.

/** RUC: 11 dígitos, prefijo 10/15/16/17/20 y dígito verificador (módulo 11 de SUNAT). */
export function isValidRuc(ruc: string) {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(ruc[i]), 0);
  return (11 - (sum % 11)) % 10 === Number(ruc[10]);
}

export function isValidDni(dni: string) {
  return /^\d{8}$/.test(dni);
}

/** "abc123" → "ABC-123". Respeta un guion escrito a mano ("AB-1234"). null si no parece placa. */
export function normalizePlate(input: string) {
  const raw = input.toUpperCase().replace(/\s+/g, '');
  const alnum = raw.replace(/[^A-Z0-9]/g, '');
  if (alnum.length < 5 || alnum.length > 7) return null;
  if (raw.includes('-')) {
    const [a, b, ...rest] = raw.split('-');
    if (rest.length || !/^[A-Z0-9]{1,4}$/.test(a) || !/^[A-Z0-9]{2,5}$/.test(b)) return null;
    return `${a}-${b}`;
  }
  return alnum.length === 6 ? `${alnum.slice(0, 3)}-${alnum.slice(3)}` : alnum;
}

/** Mientras se escribe: mayúsculas, sin espacios, guion automático tras 3 caracteres. */
export function formatPlateInput(input: string) {
  const raw = input.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (raw.includes('-')) return raw.slice(0, 8);
  return raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3, 6)}` : raw;
}
