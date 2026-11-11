// Unidad motora (camión, tracto, auto o camioneta): la que tiene motor. Los remolques, semirremolques,
// carretas y tanques no llevan motor y no muestran el medidor de combustible.
export function esUnidadMotora(u: { motora?: boolean | null; tipo?: string | null } | null | undefined): boolean {
  if (!u) return false;
  const tipo = String(u.tipo ?? '').toUpperCase();
  if (/(SEMI|REMOLQUE|CARRETA|FURGON|PLATAFORMA|TANQUE|TOLVA|CISTERNA|BATEA)/.test(tipo)) return false;
  return !!u.motora || /(CAMI|TRACTO|AUTO|CAMIONETA|SUV|PICK)/.test(tipo);
}
