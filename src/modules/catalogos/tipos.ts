// Definición de un catálogo: qué campos tiene y cómo se lee, guarda y elimina.
// La pantalla (CatalogoPage) es la misma para todos.
import type { LucideIcon } from 'lucide-react';

export type Registro = Record<string, unknown> & { id: number | string };

export interface Campo {
  clave: string;
  label: string;
  tipo: 'texto' | 'textoLargo' | 'numero' | 'moneda' | 'activo' | 'etiquetas' | 'persona';
  requerido?: boolean;
  mayusculas?: boolean;
  ayuda?: string;
  ancho?: boolean;
  placeholder?: string;
  /** Largo máximo de la columna en la base */
  maxLength?: number;
}

export interface ConfigCatalogo {
  clave: string;
  ruta: string;
  eyebrow: string;
  titulo: string;
  singular: string;
  /** Femenino para los mensajes ("Nueva familia" / "Nuevo sistema") */
  femenino?: boolean;
  icono: LucideIcon;
  descripcion: string;
  /** Clave de la matriz de permisos actual (ver, crear, editar, eliminar) */
  permiso: string;
  campos: Campo[];
  listar: () => Promise<Registro[]>;
  guardar: (datos: Record<string, unknown>, id?: Registro['id']) => Promise<void>;
  eliminar?: (id: Registro['id']) => Promise<void>;
  nombre: (r: Registro) => string;
  detalle?: (r: Registro) => string;
  /** Si devuelve texto, el registro no se puede eliminar (y se explica por qué) */
  protegido?: (r: Registro) => string | null;
  /** Valores calculados al cambiar un campo (p. ej. costo por hora desde el sueldo) */
  alCambiar?: (datos: Record<string, unknown>, campo: string) => Record<string, unknown>;
  /** Acción extra en el encabezado (p. ej. sincronizar) */
  extra?: { label: string; ejecutar: () => Promise<string> };
}
