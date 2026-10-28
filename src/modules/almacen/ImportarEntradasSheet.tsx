import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { ImportarValidadoSheet, leerTabla, textoCelda, type FilaRevisada } from '../../core/ui/ImportarValidadoSheet';
import { useAuth } from '../../core/auth/AuthProvider';
import type { ArticuloInv, ItemEnvio } from './api';
import { descargarPlantillaEntradas } from './exportarEntradas';

// Órdenes de compra desde Excel. Igual que el clásico: las filas con el mismo día, proveedor y documento
// forman una sola orden (una fila por artículo). A diferencia del clásico, se revisa cada fila antes de enviar.

interface Linea { inventario_id: string | null; descripcion: string; cantidad: number; costo_unitario: number; importe: number }
interface Dato { fecha: string; proveedor: string; documento: string; moneda: 'PEN' | 'USD'; lineas: Linea[] }
interface Resultado { ok: boolean; id?: string; error?: string }

const COLUMNAS = ['Fecha', 'Proveedor', 'Documento', 'Artículos'];

// Encabezado normalizado (sin tildes, espacios ni símbolos) → campo
const ALIAS = {
  fecha: ['FECHA'],
  proveedor: ['PROVEEDORNOMBRE', 'PROVEEDOR'],
  documento: ['DOCUMENTOREFERENCIA', 'DOCREFERENCIA', 'DOCUMENTO'],
  inventario: ['INVENTARIOID', 'CODIGO'],
  descripcion: ['DESCRIPCION'],
  cantidad: ['CANTIDAD'],
  costo: ['COSTOUNITARIO', 'COSTO'],
  moneda: ['MONEDA'],
} as const;

/** dd/mm/aaaa → aaaa-mm-dd; lo demás se devuelve tal cual */
function fechaIso(texto: string): string {
  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : texto;
}

const numero = (texto: string) => parseFloat(texto.replace(',', '.'));

/** Agrupa las filas por día, proveedor y documento: cada grupo es una orden; un error en cualquier fila invalida el grupo */
function agrupar(filas: Array<{ fila: number; dato: Dato; error?: string }>) {
  const grupos = new Map<string, { fila: number; dato: Dato; errores: string[] }>();
  for (const { fila, dato, error } of filas) {
    const clave = `${dato.fecha}|${dato.proveedor}|${dato.documento}`;
    const g = grupos.get(clave);
    if (!g) {
      grupos.set(clave, { fila, dato: { ...dato, lineas: [...dato.lineas] }, errores: error ? [`Fila ${fila}: ${error}`] : [] });
    } else {
      g.dato.lineas.push(...dato.lineas);
      if (error) g.errores.push(`Fila ${fila}: ${error}`);
    }
  }
  return [...grupos.values()];
}

export function ImportarEntradasSheet({ open, onClose, inventario }: { open: boolean; onClose: () => void; inventario: ArticuloInv[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const articulos = new Set(inventario.map(a => a.id));

  async function leer(archivo: File): Promise<FilaRevisada<Dato>[]> {
    const { claves, datos } = await leerTabla(archivo);
    const pos = Object.fromEntries(Object.entries(ALIAS).map(([campo, alias]) => [campo, claves.findIndex(c => (alias as readonly string[]).includes(c))])) as Record<keyof typeof ALIAS, number>;
    if (pos.proveedor < 0 || pos.cantidad < 0) throw new Error('El archivo necesita las columnas proveedor_nombre y cantidad.');
    if (pos.inventario < 0 && pos.descripcion < 0) throw new Error('El archivo necesita la columna inventario_id o descripcion.');

    const filas = datos.map(({ fila, celdas }) => {
      const v = (campo: keyof typeof ALIAS) => (pos[campo] >= 0 ? textoCelda(celdas[pos[campo]]) : '');
      const fechaTexto = fechaIso(v('fecha')) || new Date().toISOString().slice(0, 10);
      const moneda = (v('moneda') || 'PEN').toUpperCase();
      const invId = v('inventario').toUpperCase();
      const cantidad = numero(v('cantidad'));
      const costo = v('costo') ? numero(v('costo')) : 0;
      const linea: Linea = { inventario_id: invId || null, descripcion: v('descripcion'), cantidad, costo_unitario: costo, importe: cantidad * costo };
      let error: string | undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTexto)) error = 'La fecha debe ser AAAA-MM-DD o DD/MM/AAAA.';
      else if (!v('proveedor')) error = 'Falta el proveedor.';
      else if (!invId && !linea.descripcion) error = 'Falta el artículo (código o descripción).';
      else if (invId && !articulos.has(invId)) error = `El código ${invId} no existe en el inventario.`;
      else if (!(cantidad > 0)) error = 'La cantidad debe ser mayor que cero.';
      else if (!(costo >= 0)) error = 'El costo no es un número válido.';
      else if (moneda !== 'PEN' && moneda !== 'USD') error = 'La moneda debe ser PEN o USD.';
      return {
        fila,
        error,
        dato: { fecha: fechaTexto, proveedor: v('proveedor'), documento: v('documento'), moneda: (moneda === 'USD' ? 'USD' : 'PEN') as 'PEN' | 'USD', lineas: [linea] },
      };
    });

    return agrupar(filas).map(g => ({
      fila: g.fila,
      dato: g.dato,
      error: g.errores[0],
      celdas: [g.dato.fecha, g.dato.proveedor, g.dato.documento, `${g.dato.lineas.length} ${g.dato.lineas.length === 1 ? 'línea' : 'líneas'}`],
    }));
  }

  async function enviar(validas: Dato[]) {
    const resultados = await Promise.allSettled(validas.map(d => {
      const items: ItemEnvio[] = d.lineas.map(l => ({
        inventario_id: l.inventario_id, descripcion: l.descripcion, cantidad: l.cantidad, costo_unitario: l.costo_unitario,
        moneda: d.moneda, importe: l.importe,
      }));
      return api<Resultado>('/almacen/entradas', {
        method: 'POST',
        body: {
          fecha: d.fecha,
          tipo_orden: 'Orden de compra',
          proveedor_nombre: d.proveedor,
          documento_referencia: d.documento || null,
          moneda: d.moneda,
          condicion_pago: 'Al contado',
          creado_por: user?.name ?? null,
          items,
        },
      });
    }));
    const ok = resultados.filter(r => r.status === 'fulfilled').length;
    const mal = resultados.length - ok;
    await qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] });
    return `${ok} ${ok === 1 ? 'orden importada' : 'órdenes importadas'}${mal ? ` · ${mal} con error` : ''}`;
  }

  return (
    <ImportarValidadoSheet<Dato>
      open={open}
      onClose={onClose}
      titulo="Importar órdenes desde Excel"
      plural="órdenes"
      columnas={COLUMNAS}
      leer={leer}
      enviar={enviar}
      plantilla={descargarPlantillaEntradas}
      ayuda="Cada grupo de filas con el mismo día, proveedor y documento se registra como una orden. Las órdenes se registran en estado Registrada."
    />
  );
}
