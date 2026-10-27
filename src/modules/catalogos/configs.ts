// Catálogos de Almacén y Mantenimiento, sobre los endpoints de la versión actual (mismas reglas).
import { CircleDot, Cog, Layers, Ruler, Tag, UserCog, Warehouse, Wrench } from 'lucide-react';
import { api } from '../../core/api/client';
import type { ConfigCatalogo, Registro } from './tipos';

const usuario = () => localStorage.getItem('fleet_user') || '';
const texto = (v: unknown) => (v == null ? '' : String(v));

/** CRUD REST típico: GET base · POST base · PUT base/:id · DELETE base/:id */
function rest(base: string) {
  return {
    listar: async () => (await api<Registro[]>(base)) ?? [],
    guardar: async (datos: Record<string, unknown>, id?: Registro['id']) => {
      await api(id ? `${base}/${encodeURIComponent(String(id))}` : base, { method: id ? 'PUT' : 'POST', body: { ...datos, usuario: usuario() } });
    },
    eliminar: async (id: Registro['id']) => { await api(`${base}/${encodeURIComponent(String(id))}`, { method: 'DELETE' }); },
  };
}

const nombreDescripcion = { nombre: (r: Registro) => texto(r.nombre), detalle: (r: Registro) => texto(r.descripcion) };
const camposBasicos = (ejemplo: string) => [
  { clave: 'nombre', label: 'Nombre', tipo: 'texto' as const, requerido: true, mayusculas: true, ancho: true, placeholder: ejemplo },
  { clave: 'descripcion', label: 'Descripción', tipo: 'textoLargo' as const },
  { clave: 'activo', label: 'Activo', tipo: 'activo' as const },
];

export const CATALOGOS: ConfigCatalogo[] = [
  {
    clave: 'familias', ruta: '/almacen/familias', eyebrow: 'Almacén · Configuración', titulo: 'Familias', singular: 'Familia', femenino: true,
    icono: Layers, permiso: 'cfg_familias', descripcion: 'Agrupan los artículos del inventario (filtros, lubricantes, llantas…).',
    campos: camposBasicos('LUBRICANTES'), ...rest('/almacen/familias'), ...nombreDescripcion,
  },
  {
    clave: 'marcas', ruta: '/almacen/marcas', eyebrow: 'Almacén · Configuración', titulo: 'Marcas', singular: 'Marca', femenino: true,
    icono: Tag, permiso: 'cfg_marcas', descripcion: 'Marcas de los repuestos y artículos del almacén.',
    campos: camposBasicos('MOBIL'), ...rest('/almacen/marcas'), ...nombreDescripcion,
  },
  {
    clave: 'unidades', ruta: '/almacen/unidades', eyebrow: 'Almacén · Configuración', titulo: 'Unidades de medida', singular: 'Unidad de medida', femenino: true,
    icono: Ruler, permiso: 'cfg_unidades', descripcion: 'Cómo se cuenta cada artículo: unidad, galón, litro, kit…',
    campos: [
      { clave: 'nombre', label: 'Abreviatura', tipo: 'texto', requerido: true, mayusculas: true, placeholder: 'GL', maxLength: 20 },
      { clave: 'descripcion', label: 'Nombre completo', tipo: 'texto', placeholder: 'Galones', maxLength: 200 },
      { clave: 'activo', label: 'Activo', tipo: 'activo' },
    ],
    ...rest('/almacen/unidades'),
    nombre: r => texto(r.nombre),
    detalle: r => texto(r.descripcion),
  },
  {
    clave: 'sistemas', ruta: '/almacen/sistemas', eyebrow: 'Almacén · Configuración', titulo: 'Sistemas', singular: 'Sistema',
    icono: Cog, permiso: 'cfg_sistemas', descripcion: 'Sistemas del vehículo (motor, frenos, suspensión…) y sus subsistemas, para clasificar repuestos y trabajos.',
    campos: [
      { clave: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true, mayusculas: true, placeholder: 'FRENOS' },
      { clave: 'orden', label: 'Orden en las listas', tipo: 'numero', ayuda: 'Menor número, más arriba' },
      { clave: 'sub_sistemas', label: 'Subsistemas', tipo: 'etiquetas', placeholder: 'ZAPATAS' },
      { clave: 'activo', label: 'Activo', tipo: 'activo' },
    ],
    ...rest('/almacen/sistemas'),
    nombre: r => texto(r.nombre),
    detalle: r => { const s = Array.isArray(r.sub_sistemas) ? (r.sub_sistemas as string[]) : []; return s.length ? s.join(' · ') : 'Sin subsistemas'; },
  },
  {
    clave: 'almacenes', ruta: '/almacen/almacenes', eyebrow: 'Almacén · Configuración', titulo: 'Almacenes', singular: 'Almacén',
    icono: Warehouse, permiso: 'cfg_almacen', descripcion: 'Lugares donde se guarda el stock. El almacén Principal es del sistema y no se puede eliminar.',
    campos: [
      { clave: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true, mayusculas: true, placeholder: 'TALLER NORTE' },
      { clave: 'orden', label: 'Orden en las listas', tipo: 'numero' },
      { clave: 'descripcion', label: 'Descripción', tipo: 'textoLargo' },
      { clave: 'activo', label: 'Activo', tipo: 'activo' },
    ],
    ...rest('/almacen/almacenes'), ...nombreDescripcion,
    protegido: r => (r.es_sistema ? 'Almacén del sistema: no se puede eliminar' : null),
  },
  {
    clave: 'tipos-mp', ruta: '/mantenimiento/tipos-mp', eyebrow: 'Mantenimiento · Configuración', titulo: 'Tipos de mantenimiento preventivo', singular: 'Tipo de MP',
    icono: Wrench, permiso: 'cfg_mant', descripcion: 'Nombres de los preventivos (MP-1, MP-2…) que se usan en planificación y Fleetrun.',
    campos: [
      { clave: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true, mayusculas: true, ancho: true, placeholder: 'MP-1' },
      { clave: 'descripcion', label: 'Descripción', tipo: 'textoLargo' },
    ],
    ...rest('/tipos-preventivo'), ...nombreDescripcion,
    // Este endpoint responde { data: [...] }
    listar: async () => (await api<{ data?: Registro[] }>('/tipos-preventivo')).data ?? [],
    extra: {
      label: 'Traer de frecuencias',
      ejecutar: async () => {
        const r = await api<{ ok?: boolean; insertados?: number }>('/tipos-preventivo/sync-desde-frecuencias', { method: 'POST' });
        return r.insertados ? `${r.insertados} tipos agregados desde las frecuencias` : 'No había tipos nuevos en las frecuencias';
      },
    },
  },
  {
    clave: 'personal-taller', ruta: '/mantenimiento/personal', eyebrow: 'Mantenimiento · Taller', titulo: 'Personal de taller', singular: 'Técnico',
    icono: UserCog, permiso: 'pers_mant', descripcion: 'Técnicos del taller y su costo por hora, que se usa para calcular la mano de obra de las OT.',
    campos: [
      { clave: 'nombre', label: 'Nombre', tipo: 'persona', requerido: true, ancho: true, ayuda: 'Elige un conductor del directorio, o escribe el nombre si no está' },
      { clave: 'sueldo_mensual', label: 'Sueldo mensual', tipo: 'moneda' },
      { clave: 'costo_hora', label: 'Costo por hora', tipo: 'moneda', ayuda: 'Se sugiere sueldo ÷ 208 horas; puedes ajustarlo' },
    ],
    ...rest('/taller-personal'),
    nombre: r => texto(r.nombre),
    detalle: r => `S/ ${Number(r.costo_hora || 0).toFixed(2)} por hora · sueldo S/ ${Number(r.sueldo_mensual || 0).toFixed(2)}`,
    // Mismo cálculo que la versión actual (ptCalcularCosto)
    alCambiar: (d, campo) => (campo === 'sueldo_mensual'
      ? { ...d, costo_hora: Number(d.sueldo_mensual) > 0 ? (Number(d.sueldo_mensual) / 208).toFixed(2) : '' }
      : d),
  },
  {
    clave: 'situaciones', ruta: '/preferencias/situaciones', eyebrow: 'Preferencias', titulo: 'Situaciones', singular: 'Situación', femenino: true,
    icono: CircleDot, permiso: 'cfg_situacion', descripcion: 'Situaciones de una unidad en el taller (en espera de repuesto, en reparación…).',
    campos: [{ clave: 'nombre', label: 'Situación', tipo: 'texto', requerido: true, ancho: true, placeholder: 'En espera de repuesto' }],
    listar: async () => ((await api<{ situaciones?: Registro[] }>('/catalogos_taller')).situaciones ?? []).map(s => ({ ...s, nombre: texto(s.descripcion) })),
    guardar: async (d, id) => { await api(id ? `/cat-situaciones/${id}` : '/cat-situaciones', { method: id ? 'PUT' : 'POST', body: { nombre: d.nombre } }); },
    eliminar: async id => { await api(`/cat-situaciones/${id}`, { method: 'DELETE' }); },
    nombre: r => texto(r.nombre),
    detalle: r => `Código: ${texto(r.codigo)}`,
  },
];

