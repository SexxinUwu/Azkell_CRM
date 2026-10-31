// Bancos, cajas y financieras del Perú para elegir en las cuentas de los proveedores.
// Si falta alguna, se escribe a mano: la lista no limita lo que se guarda.

export const BANCOS_PERU: string[] = [
  // Bancos
  'BCP',
  'BBVA',
  'Interbank',
  'Scotiabank',
  'BanBif',
  'Banco de la Nación',
  'Banco Pichincha',
  'Banco GNB',
  'Banco Falabella',
  'Banco Ripley',
  'Banco Santander Perú',
  'Mi Banco',
  'Banco Azteca',
  'Banco Cencosud',
  'Banco Financiero',
  'Banco de Comercio',
  'Citibank',
  // Cajas municipales
  'Caja Metropolitana de Lima',
  'Caja Arequipa',
  'Caja Trujillo',
  'Caja Piura',
  'Caja Cusco',
  'Caja Huancayo',
  'Caja Ica',
  'Caja Sullana',
  'Caja Tacna',
  'Caja Maynas',
  'Caja del Santa',
  'Caja Sipán',
  'Caja Los Andes',
  // Cajas rurales y financieras
  'Caja Rural de Ahorro y Crédito Nuestra Gente',
  'CrediScotia Financiera',
  'Compartamos Financiera',
  'Financiera Confianza',
  'Financiera Efectiva',
  'Financiera Proempresa',
  'Financiera Oh!',
];

/** Bancos a los que se asocian Yape (BCP) y Plin (BBVA) como tipo de cuenta */
export function tieneYapePlin(banco: string | null | undefined): boolean {
  const n = (banco ?? '').toUpperCase();
  return n.includes('BCP') || n.includes('BBVA');
}
