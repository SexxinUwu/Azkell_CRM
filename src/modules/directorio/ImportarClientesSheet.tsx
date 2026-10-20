import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { ImportarValidadoSheet, leerTabla, textoCelda, type FilaRevisada } from '../../core/ui/ImportarValidadoSheet';
import type { Cliente } from './api';

// Clientes desde Excel (POST /api/clientes/importar-masivo, upsert por razón social; sincroniza las placas del cliente).
// Mismos encabezados que el clásico (directorio/clientes).
interface Dato { razon_social: string; ruc_dni: string; telefono: string; email: string; direccion: string; estado: string; notas: string }
interface Resultado { ok?: boolean; importados?: number; error?: string }

const ENCABEZADOS = ['Razón Social / Nombre', 'RUC / DNI', 'Teléfono', 'Correo', 'Dirección', 'Estado', 'Notas'];
const EJEMPLO = [['TRANSPORTES EJEMPLO S.A.C.', '20123456789', '987654321', 'contacto@ejemplo.com', 'Av. Industrial 123, Lima', 'Activo', 'Cliente corporativo']];

export const descargarPlantillaClientes = () => exportarExcel('Plantilla_Importar_Clientes', 'Plantilla_Clientes', ENCABEZADOS, EJEMPLO);

// Misma lectura flexible del clásico: el campo se deduce de lo que dice el encabezado (sin tildes, minúsculas)
function campoDe(clave: string): keyof Dato | null {
  if (/RAZON|NOMBRE|CLIENTE|EMPRESA/.test(clave)) return 'razon_social';
  if (/RUC|DNI|DOCUMENTO/.test(clave)) return 'ruc_dni';
  if (/TEL|CEL|MOVIL/.test(clave)) return 'telefono';
  if (/CORREO|EMAIL|MAIL/.test(clave)) return 'email';
  if (/DIREC|DOMICILIO/.test(clave)) return 'direccion';
  if (/ESTADO/.test(clave)) return 'estado';
  if (/NOTA|OBS/.test(clave)) return 'notas';
  return null;
}

export function ImportarClientesSheet({ open, onClose, existentes }: { open: boolean; onClose: () => void; existentes: Cliente[] }) {
  const qc = useQueryClient();

  async function leer(archivo: File): Promise<FilaRevisada<Dato>[]> {
    const { claves, datos } = await leerTabla(archivo);
    // Primera columna que corresponde a cada campo
    const pos: Partial<Record<keyof Dato, number>> = {};
    claves.forEach((c, i) => { const campo = campoDe(c); if (campo && pos[campo] === undefined) pos[campo] = i; });
    if (pos.razon_social === undefined) throw new Error('El archivo no tiene la columna Razón Social / Nombre.');
    const existe = new Set(existentes.map(c => String(c.razon_social ?? c.nombre ?? '').trim().toUpperCase()));
    const vistos = new Map<string, number>();

    return datos.map(({ fila, celdas }) => {
      const v = (k: keyof Dato) => (pos[k] !== undefined ? textoCelda(celdas[pos[k]!]) : '');
      const dato: Dato = {
        razon_social: v('razon_social').toUpperCase(), ruc_dni: v('ruc_dni'), telefono: v('telefono'),
        email: v('email'), direccion: v('direccion'), estado: v('estado') || 'Activo', notas: v('notas'),
      };
      let error: string | undefined;
      if (!dato.razon_social) error = 'Falta la Razón Social / Nombre.';
      else if (vistos.has(dato.razon_social)) error = `La razón social se repite en la fila ${vistos.get(dato.razon_social)} del archivo.`;
      else if (dato.ruc_dni && !/^(\d{8}|\d{11})$/.test(dato.ruc_dni)) error = 'El RUC tiene 11 dígitos y el DNI 8.';
      else if (dato.telefono && !/^\+?[\d\s-]{7,15}$/.test(dato.telefono)) error = 'El teléfono no es válido (solo números, de 7 a 15 dígitos).';
      else if (dato.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dato.email)) error = 'El correo no tiene un formato válido.';
      else if (!['activo', 'inactivo'].includes(dato.estado.toLowerCase())) error = 'El Estado debe ser Activo o Inactivo.';
      if (dato.razon_social && !vistos.has(dato.razon_social)) vistos.set(dato.razon_social, fila);
      if (!error) dato.estado = dato.estado.toLowerCase() === 'activo' ? 'Activo' : 'Inactivo';
      return {
        fila, dato, error,
        nota: !error && existe.has(dato.razon_social) ? 'Ya existe: se actualiza' : undefined,
        celdas: [dato.razon_social, dato.ruc_dni, dato.telefono, dato.email],
      };
    });
  }

  async function enviar(validos: Dato[]) {
    const r = await api<Resultado>('/clientes/importar-masivo', { method: 'POST', body: { clientes: validos } });
    if (r.ok === false || r.error) throw new Error(r.error || 'No se pudo importar');
    return `${r.importados ?? validos.length} clientes importados`;
  }

  return (
    <ImportarValidadoSheet<Dato>
      open={open} onClose={onClose} titulo="Importar clientes desde Excel" plural="clientes"
      columnas={['Razón social', 'RUC / DNI', 'Teléfono', 'Correo']}
      leer={leer} enviar={enviar} plantilla={descargarPlantillaClientes}
      alTerminar={async () => { await qc.invalidateQueries({ queryKey: ['directorio', 'clientes'] }); await qc.invalidateQueries({ queryKey: ['placas'] }); }}
      ayuda="Los clientes que ya existen con la misma razón social se actualizan y el nombre se sincroniza en sus placas."
    />
  );
}
