import { PlantillaPdfPage, type ConfigPlantilla } from './PlantillaPdfPage';

const CONFIG: ConfigPlantilla = {
  base: '/facturacion',
  query: '?tipo=nc',
  clave: 'plantilla-nota-credito',
  eyebrow: 'Operaciones',
  titulo: 'Plantilla de nota de crédito',
  subtitulo: 'Cómo se ve el PDF de las notas de crédito que esta empresa emite a sus clientes. No son las notas de crédito que entregan los proveedores (esas están en Tesorería)',
  bloques: [
    ['estado', 'Estado de SUNAT', 'Sello «Aceptada por SUNAT» o «Pendiente de validación»'],
    ['documento', 'Documento que modifica', 'La factura o boleta afectada y el motivo de la nota'],
    ['observaciones', 'Observaciones', 'El texto de «Observaciones» de más abajo y las de cada nota'],
    ['qr', 'Código QR', 'Con los datos del comprobante, como pide SUNAT'],
    ['hash', 'Código hash', 'Sale del XML firmado y se imprime junto a la leyenda'],
  ],
  columnas: [
    ['unidad', 'Unidad de cada línea', 'Servicio, unidad, kilogramos…'],
    ['valor_unit', 'Valor unitario', 'Valor sin IGV de cada línea'],
  ],
  etiquetaNotas: 'Observaciones (se imprimen en todas las notas de crédito)',
  avisoFinal: 'La nota de crédito siempre lleva los datos que exige SUNAT: RUC, serie y número, cliente, documento que modifica, motivo, detalle, totales y la leyenda «Representación impresa».',
};

// Operaciones › Plantilla de nota de crédito: cómo se ve el PDF de las notas de crédito emitidas
export function PlantillaNotaCreditoPage() {
  return <PlantillaPdfPage config={CONFIG} />;
}
