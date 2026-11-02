// Tipo de unidad del modelo 3D, leído de Placas (TIPO y SUB TIPO) con las mismas reglas de la vista Placas en 3D.
import type { Placa } from '../../placas/api';
import { colorsOf, norm } from '../../placas/tresd/datos';
import type { DescCamion } from './camiones';

const COLORES_BASE = [0xf2f4f7, 0x333a44];

/**
 * Tracto: tracto con semirremolque. Camión: furgón, o frigorífico si el SUB TIPO (o la marca) es Thermo King.
 * Sin ficha en Placas se usa el tipo que informa Wialon; si tampoco sirve, camión furgón.
 */
export function descripcionCamion(p: Placa | undefined, tipoWialon: string): DescCamion {
  const tipo = norm(p?.tipo || tipoWialon);
  const sub = norm(p?.subTipo);
  const marca = norm(p?.marca);
  const frio = /THERMO|TERMO|FRIGO|REFRIG/.test(sub + ' ' + marca);
  const colores = colorsOf(p?.color || '');
  return {
    kind: tipo === 'TRACTO' ? 'rig' : frio ? 'reefer' : 'box',
    trailer: 'furgon',
    colors: colores.length ? colores : COLORES_BASE,
    larga: /INTERNATIONAL|FREIGHTLINER/.test(marca),
  };
}
