import { PlantillaPdfPage, type ConfigPlantilla } from './PlantillaPdfPage';

const CONFIG: ConfigPlantilla = {
  base: '/facturacion',
  clave: 'plantilla-facturacion',
  eyebrow: 'Operaciones',
  titulo: 'Plantilla de facturación',
  subtitulo: 'Cómo se ve el PDF de las facturas y boletas de esta empresa. Es independiente de la plantilla de guías y de la de nota de crédito',
  bloques: [
    ['estado', 'Estado de SUNAT', 'Sello «Aceptada por SUNAT» o «Pendiente de validación»'],
    ['detraccion', 'Información de la detracción', 'Leyenda, cuenta del Banco de la Nación, porcentaje y monto'],
    ['credito', 'Forma de pago a crédito', 'Monto neto pendiente y cuotas con su vencimiento'],
    ['observaciones', 'Observaciones', 'El texto de «Observaciones» de más abajo y las de cada comprobante'],
    ['qr', 'Código QR', 'Con los datos del comprobante, como pide SUNAT'],
    ['hash', 'Código hash', 'Sale del XML firmado y se imprime junto a la leyenda'],
  ],
  columnas: [
    ['unidad', 'Unidad de cada línea', 'Servicio, unidad, kilogramos…'],
    ['valor_unit', 'Valor unitario', 'Valor sin IGV de cada línea'],
    ['orden_compra', 'Orden de compra del cliente', 'Si la factura la lleva'],
  ],
  etiquetaNotas: 'Observaciones (se imprimen en todos los comprobantes)',
  avisoFinal: 'El comprobante siempre lleva los datos que exige SUNAT: RUC, serie y número, cliente, detalle, totales, el total en letras y la leyenda «Representación impresa».',
};

// Operaciones › Plantilla de facturación: cómo se ve el PDF de los comprobantes de esta empresa
export function PlantillaFacturacionPage() {
  return <PlantillaPdfPage config={CONFIG} />;
}
