// Tipo de unidad del modelo 3D, leído de Placas (TIPO y SUB TIPO) con las mismas reglas de la vista Placas en 3D.
import type { Placa } from '../../placas/api';
import { colorsOf, norm } from '../../placas/tresd/datos';
import type { DescCamion } from './camiones';
import { resolverModelo, unidadesDe } from '../../placas/tresd/datos';

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
  // Semirremolques y carretas (y todo lo de marca Thermo King) van sin cabina, como en la vista Placas en 3D
  const cfg = norm(p?.configuracion).replace(/ /g, '');
  const esRemolque = tipo !== 'TRACTO' && (/SEMI|REMOLQUE|CARRETA/.test(tipo) || /THERMO|TERMO/.test(marca));
  const ejes = /^[SR][1-3]$/.test(cfg) ? Number(cfg[1]) : undefined;
  const base: DescCamion = {
    kind: tipo === 'TRACTO' ? 'rig' : esRemolque ? 'semi' : frio ? 'reefer' : 'box',
    trailer: esRemolque ? (frio ? 'frio' : /PLATAFORMA/.test(sub || tipo) ? 'plataforma' : 'furgon') : 'furgon',
    ejes,
    colors: colores.length ? colores : COLORES_BASE,
    larga: /INTERNATIONAL|FREIGHTLINER/.test(marca),
  };
  // El mismo modelo 3D de la vista Placas en 3D (marca, carrocería, ejes y colores); si no se puede resolver, queda el dibujo simple
  if (p) {
    try {
      const u = unidadesDe([p]).rows[0];
      if (u) {
        const r = resolverModelo(u);
        const c = { plate: u.plate.slice(0, 10), livery: colorsOf(u.f.COLOR), reefer: frio && r.M.kind !== 'trailer', trailerCfg: r.cfg || 'S3' };
        // `modelo` no se serializa (el mapa compara las descripciones con JSON): `mid` identifica la versión
        Object.defineProperty(base, 'modelo', { value: { M: r.M, cfg: c }, enumerable: false });
        base.mid = [r.M.id, c.plate, c.livery.join(','), c.reefer, c.trailerCfg].join('|');
      }
    } catch { /* sin modelo propio: dibujo simple */ }
  }
  return base;
}
