import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { ImportarValidadoSheet, leerTabla, textoCelda, type FilaRevisada } from '../../core/ui/ImportarValidadoSheet';
import type { ProveedorInv } from './api';

// Proveedores desde Excel (POST /api/almacen/importarProveedoresMasivo, upsert por nombre exacto).
// Mismos encabezados que el clásico (almacen/proveedores).
interface Dato {
  nombre: string; razon_social: string; tipo_documento: string; numero_documento: string; telefono: string;
  email: string; direccion: string; marcas: string; estado: string; observaciones: string;
}
interface Resultado { insertados: number; actualizados: number; errores?: number; error?: string }

const ENCABEZADOS = ['Nombre', 'Razón Social', 'Tipo Doc.', 'N° Documento', 'Teléfono', 'Email', 'Dirección', 'Marcas', 'Estado', 'Observaciones'];
const EJEMPLO = [['Ejemplo Proveedor SAC', 'Ejemplo Proveedor S.A.C.', 'RUC', '20123456789', '+51 999 999 999', 'proveedor@email.com', 'Av. Ejemplo 123', 'WIX, MOBIL', 'Activo', 'Notas opcionales']];

// Encabezado normalizado (sin tildes, símbolos ni mayúsculas) → campo
const ALIAS: Record<keyof Dato, string[]> = {
  nombre: ['NOMBRE'],
  razon_social: ['RAZONSOCIAL'],
  tipo_documento: ['TIPODOC', 'TIPODOCUMENTO'],
  numero_documento: ['NDOCUMENTO', 'NUMERODOCUMENTO', 'NRODOCUMENTO'],
  telefono: ['TELEFONO'],
  email: ['EMAIL', 'CORREO'],
  direccion: ['DIRECCION'],
  marcas: ['MARCAS'],
  estado: ['ESTADO'],
  observaciones: ['OBSERVACIONES'],
};

export const descargarPlantillaProveedores = () => exportarExcel('Plantilla_Proveedores', 'Plantilla', ENCABEZADOS, EJEMPLO);

export function ImportarProveedoresSheet({ open, onClose, existentes }: { open: boolean; onClose: () => void; existentes: ProveedorInv[] }) {
  const qc = useQueryClient();

  async function leer(archivo: File): Promise<FilaRevisada<Dato>[]> {
    const { claves, datos } = await leerTabla(archivo);
    const pos = Object.fromEntries((Object.keys(ALIAS) as Array<keyof Dato>).map(k => [k, claves.findIndex(c => ALIAS[k].includes(c))])) as Record<keyof Dato, number>;
    if (pos.nombre < 0) throw new Error('El archivo no tiene la columna Nombre.');
    const existe = new Set(existentes.map(p => p.nombre));
    const vistos = new Map<string, number>();

    return datos.map(({ fila, celdas }) => {
      const v = (k: keyof Dato) => (pos[k] >= 0 ? textoCelda(celdas[pos[k]]) : '');
      const dato: Dato = {
        nombre: v('nombre'), razon_social: v('razon_social'), tipo_documento: v('tipo_documento') || 'RUC',
        numero_documento: v('numero_documento'), telefono: v('telefono'), email: v('email'), direccion: v('direccion'),
        marcas: v('marcas'), estado: v('estado') || 'Activo', observaciones: v('observaciones'),
      };
      let error: string | undefined;
      const doc = dato.numero_documento;
      const tipo = dato.tipo_documento.toUpperCase();
      if (!dato.nombre) error = 'Falta el Nombre.';
      else if (vistos.has(dato.nombre)) error = `El nombre se repite en la fila ${vistos.get(dato.nombre)} del archivo.`;
      else if (doc && tipo === 'RUC' && !/^\d{11}$/.test(doc)) error = 'El RUC debe tener 11 dígitos.';
      else if (doc && tipo === 'DNI' && !/^\d{8}$/.test(doc)) error = 'El DNI debe tener 8 dígitos.';
      else if (dato.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dato.email)) error = 'El correo no tiene un formato válido.';
      else if (!['activo', 'inactivo'].includes(dato.estado.toLowerCase())) error = 'El Estado debe ser Activo o Inactivo.';
      if (dato.nombre && !vistos.has(dato.nombre)) vistos.set(dato.nombre, fila);
      if (!error) dato.estado = dato.estado.toLowerCase() === 'activo' ? 'Activo' : 'Inactivo';
      return {
        fila, dato, error,
        nota: !error && existe.has(dato.nombre) ? 'Ya existe: se actualiza' : undefined,
        celdas: [dato.nombre, dato.numero_documento, dato.telefono, dato.email],
      };
    });
  }

  async function enviar(validas: Dato[]) {
    const r = await api<Resultado>('/almacen/importarProveedoresMasivo', { method: 'POST', body: { proveedores: validas } });
    if (r.error) throw new Error(r.error);
    return `${r.insertados} proveedores nuevos y ${r.actualizados} actualizados${r.errores ? ` · ${r.errores} con error en el servidor` : ''}`;
  }

  return (
    <ImportarValidadoSheet<Dato>
      open={open} onClose={onClose} titulo="Importar proveedores desde Excel" plural="proveedores"
      columnas={['Nombre', 'Documento', 'Teléfono', 'Correo']}
      leer={leer} enviar={enviar} plantilla={descargarPlantillaProveedores}
      alTerminar={() => qc.invalidateQueries({ queryKey: ['almacen', 'proveedores'] })}
      ayuda="Los proveedores que ya existen con el mismo nombre se actualizan; los demás se crean."
    />
  );
}
