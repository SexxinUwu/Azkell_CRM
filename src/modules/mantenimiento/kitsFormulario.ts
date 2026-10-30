import type { ArticuloInv } from '../almacen/api';
import type { Placa } from '../placas/api';

// Lógica del formulario de kits: copia de modulos/mantenimiento/kits-mp/logica.js
// (kitsCargarTabla: mapeo del inventario; kitsBuscarItemAlmacen; marcas y modelos de las motoras).

export interface KitItem {
  id: number | string;
  marca_vehiculo: string;
  modelo_vehiculo: string;
  tipo_mp: string;
  nombre_kit?: string;
  item_codigo?: string;
  item_nombre?: string;
  cantidad: number;
  unidad_medida?: string;
  costo_unitario: number;
  costo_total: number;
  orden?: number;
}

export interface KitGrupo {
  key: string;        // marca__modelo__tipo_mp
  marca: string;
  modelo: string;
  tipo_mp: string;
  nombre_kit: string; // nombre para mostrar (alias o tipo)
  alias: string;      // nombre_kit tal cual está guardado ('' si no tiene)
  items: KitItem[];
  costoTotal: number;
}

export interface ArticuloKit {
  codInv: string;
  codigoArt: string;
  nombre: string;
  unidad: string;
  costo: number;
  stock: number;
}

export const conFormatoInv = (s: string) => (/^\d+$/.test(s) ? 'INV-' + s.padStart(4, '0') : s);

/** kitsCargarTabla: inventario → artículos de kit (código INV-0001, unidad en mayúsculas, costo y stock) */
export function mapearAlmacen(inv: ArticuloInv[]): ArticuloKit[] {
  return inv.map(x => {
    const rawId = String(x.id ?? '').trim();
    const codInv = conFormatoInv(rawId);
    const codigoArt = String(x.codigo_articulo || x.codigo_item || x.codigo_barras || '').trim();
    const nombre = String(x.descripcion || x.articulo || '').trim();
    const costo = Number(x.costo_soles ?? x.costo_referencial ?? 0) || 0;
    return {
      codInv,
      codigoArt,
      nombre,
      unidad: String(x.unidad || 'UND').toUpperCase().trim(),
      costo,
      stock: Number(x.stock_actual ?? 0) || 0,
    };
  }).filter(x => x.nombre !== '' || (x.codInv || x.codigoArt) !== '');
}

/** Código que se guarda para un artículo: el INV-XXXX, o el código de parte si no tiene */
export function codigoDeArticulo(a: ArticuloKit): string {
  return conFormatoInv(a.codInv || a.codigoArt);
}

/** kitsBuscarItemAlmacen: encuentra el artículo por código, por nombre exacto o por coincidencia aproximada */
export function buscarItemAlmacen(lista: ArticuloKit[], kCod: string, kNom: string): ArticuloKit | null {
  const codStr = (kCod || '').trim().toLowerCase();
  const nomStr = (kNom || '').trim().toLowerCase();
  if (!codStr && !nomStr) return null;

  if (codStr && codStr !== '-' && codStr !== '—') {
    const byCod = lista.find(x => x.codInv.toLowerCase() === codStr || x.codigoArt.toLowerCase() === codStr);
    if (byCod) return byCod;
  }

  if (nomStr) {
    const byExacto = lista.find(x => x.nombre.toLowerCase() === nomStr);
    if (byExacto) return byExacto;
  }

  if (nomStr || (codStr && codStr !== '-')) {
    const limpio = nomStr.replace(/[()\-–—/]/g, ' ').replace(/\s+/g, ' ').trim();
    const tokens = limpio.split(' ').filter(t => t.length >= 2);

    // A. El código de parte del artículo aparece dentro del texto
    for (const itm of lista) {
      if (itm.codigoArt && itm.codigoArt.length >= 3) {
        const ca = itm.codigoArt.toLowerCase().replace(/[()\-–—/]/g, ' ').trim();
        if (limpio.includes(ca)) return itm;
      }
    }

    // B. Varias palabras significativas coinciden
    for (const itm of lista) {
      const norm = `${itm.nombre} ${itm.codigoArt}`.toLowerCase().replace(/[()\-–—/]/g, ' ');
      const coinciden = tokens.filter(tk => norm.includes(tk));
      if (coinciden.length >= 2 && coinciden.length >= Math.floor(tokens.length * 0.6)) return itm;
    }

    // C. Coincidencia parcial del nombre (solo si hay nombre: sin él, el clásico devolvía el primer artículo)
    if (nomStr) {
      for (const itm of lista) {
        const n = itm.nombre.toLowerCase();
        if (n.includes(nomStr) || (nomStr.length >= 5 && nomStr.includes(n))) return itm;
      }
    }
  }

  return null;
}

const NO_MOTORAS = ['REMOLQUE', 'SEMIREMOLQUE', 'SEMI REMOLQUE', 'CARRETA', 'PLATAFORMA', 'BATEA', 'CAMABAJA', 'FURGON REMOLQUE'];

/** Unidad motora (kitsCargarTabla, paso 4). React no conserva el texto crudo de "motora": usa el booleano. */
export function esMotora(p: Placa): boolean {
  const tipo = p.tipo.toUpperCase();
  const sub = p.subTipo.toUpperCase();
  const noMotora = NO_MOTORAS.some(k => tipo.includes(k) || sub.includes(k));
  return p.motora || tipo.includes('TRACTO') || tipo.includes('CAMION') || tipo.includes('CAMIONETA') ||
    tipo.includes('VOLQUETE') || tipo.includes('REMOLCADOR') || (!noMotora && !tipo.includes('REMOLQUE'));
}

const SIN_MODELO = ['TODOS LOS MODELOS', 'TODOS', '-', 'S/M'];

/** Modelos de una marca: los de todas sus unidades y los de los kits existentes */
export function modelosDeMarca(marca: string, placas: Placa[], modelosKits: string[]): string[] {
  const m = marca.trim().toUpperCase();
  if (!m) return [];
  const set = new Set<string>();
  for (const p of placas) {
    if (p.marca.trim().toUpperCase() !== m) continue;
    const mod = p.modelo.trim().toUpperCase();
    if (mod && !SIN_MODELO.includes(mod)) set.add(mod);
  }
  for (const mod of modelosKits) if (mod && !SIN_MODELO.includes(mod)) set.add(mod);
  return Array.from(set).sort();
}

/** Marcas de las motoras de la flota más las de los kits (sin GENERAL) */
export function marcasDisponibles(placas: Placa[], marcasKits: string[]): string[] {
  const set = new Set<string>();
  for (const p of placas) {
    const m = p.marca.trim().toUpperCase();
    if (!m || m === '-' || m === 'S/M' || m === 'SIN MARCA') continue;
    if (esMotora(p)) set.add(m);
  }
  for (const m of marcasKits) if (m && m !== 'GENERAL') set.add(m);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
