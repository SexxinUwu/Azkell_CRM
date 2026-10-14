import '../mantenimiento/mant.css';
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Wrench } from 'lucide-react';
import { CrudLista, type CampoCrud } from '../../core/ui/CrudLista';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { api } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { useTiposMantenimiento, type TipoMantenimiento } from './api';

interface Destinatario {
  id: number; nombre: string; correo: string; cargo: string | null;
  notif_1d: number | boolean; notif_3d: number | boolean; notif_7d: number | boolean; notif_completada: number | boolean;
  activo?: number | boolean;
}

type Vista = 'tipos' | 'alertas';
type Valores = Record<string, string | number | boolean>;

// Planificación › Tipos de mantenimiento (intervalos por marca y UTS) y destinatarios de alertas.
// Los kits de mantenimiento tienen su propia pantalla.
export function TiposAlertasPage() {
  const [vista, setVista] = useState<Vista>('tipos');
  const toggle = (
    <SegmentedControl<Vista> label="Vista" value={vista} onChange={setVista}
      options={[{ value: 'tipos', label: 'Tipos de MP' }, { value: 'alertas', label: 'Alertas' }]} />
  );
  return vista === 'tipos' ? <Tipos arriba={toggle} /> : <Alertas arriba={toggle} />;
}

const num = (v: string | number | boolean | undefined) => (v === undefined || v === '' ? null : Number(v));

const CAMPOS_TIPO: CampoCrud[] = [
  { clave: 'marca', label: 'Marca', requerido: true, normalizar: s => s.toUpperCase() },
  { clave: 'tipo_mp', label: 'Tipo de mantenimiento', requerido: true, normalizar: s => s.toUpperCase() },
  { clave: 'uts', label: 'UTS / modelo de unidad', normalizar: s => s.toUpperCase() },
  { clave: 'combustible', label: 'Combustible' },
  { clave: 'modelo', label: 'Modelo de motor' },
  { clave: 'frecuencia_km', label: 'Cada (km)', tipo: 'number' },
  { clave: 'frecuencia_horas', label: 'Cada (horas)', tipo: 'number' },
  { clave: 'frecuencia_dias', label: 'Cada (días)', tipo: 'number' },
  { clave: 'tipo', label: 'Tipo' },
  { clave: 'sistema', label: 'Sistema' },
  { clave: 'descripcion', label: 'Descripción', tipo: 'textarea', wide: true },
];

function Tipos({ arriba }: { arriba: ReactNode }) {
  const q = useTiposMantenimiento();
  const qc = useQueryClient();
  const { can } = useAuth();
  const puede = can('plan.editar', 'plan.crear');
  const refrescar = () => qc.invalidateQueries({ queryKey: ['mant', 'tipos-mantenimiento'] });
  const lista: TipoMantenimiento[] = q.data ?? [];

  return (
    <CrudLista<TipoMantenimiento>
      eyebrow="Planificación" titulo="Tipos de mantenimiento" singular="tipo de mantenimiento" icono={<Wrench size={16} />}
      datos={lista} cargando={q.isLoading} error={q.isError ? q.error : undefined} idDe={t => t.id} arriba={arriba}
      principal={t => `${t.marca ?? '—'} · ${t.tipo_mp}`}
      secundaria={t => [t.uts, t.frecuencia_km && `cada ${Number(t.frecuencia_km).toLocaleString('es-PE')} km`, t.frecuencia_dias && `cada ${t.frecuencia_dias} días`].filter(Boolean).join(' · ')}
      buscarEn={t => `${t.marca ?? ''} ${t.tipo_mp} ${t.uts ?? ''}`}
      campos={CAMPOS_TIPO.map(c => ({
        ...c,
        inicial: c.tipo === 'number' ? '' : undefined,
      }))}
      crear={puede ? async (v: Valores) => {
        await api('/tipos-mantenimiento', { method: 'POST', body: normalizarTipo(v) });
        await refrescar();
      } : undefined}
      editar={puede ? async (t, v) => {
        await api(`/tipos-mantenimiento/${t.id}`, { method: 'PUT', body: normalizarTipo(v) });
        await refrescar();
      } : undefined}
      eliminar={puede ? async t => {
        await api(`/tipos-mantenimiento/${t.id}`, { method: 'DELETE' });
        await refrescar();
      } : undefined}
    />
  );
}

function normalizarTipo(v: Valores) {
  return {
    marca: String(v.marca ?? '').trim(), tipo_mp: String(v.tipo_mp ?? '').trim(), uts: String(v.uts ?? '').trim(),
    combustible: String(v.combustible ?? '').trim(), modelo: String(v.modelo ?? '').trim(),
    frecuencia_km: num(v.frecuencia_km), frecuencia_horas: num(v.frecuencia_horas), frecuencia_dias: num(v.frecuencia_dias),
    tipo: String(v.tipo ?? '').trim(), sistema: String(v.sistema ?? '').trim(), descripcion: String(v.descripcion ?? '').trim(),
  };
}

const CAMPOS_ALERTA: CampoCrud[] = [
  { clave: 'nombre', label: 'Nombre', requerido: true },
  { clave: 'correo', label: 'Correo', requerido: true },
  { clave: 'cargo', label: 'Cargo' },
  { clave: 'notif_1d', label: 'Avisar 1 día antes', tipo: 'bool' },
  { clave: 'notif_3d', label: 'Avisar 3 días antes', tipo: 'bool' },
  { clave: 'notif_7d', label: 'Avisar 7 días antes', tipo: 'bool' },
  { clave: 'notif_completada', label: 'Avisar al completar', tipo: 'bool' },
];

function Alertas({ arriba }: { arriba: ReactNode }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const puede = can('plan.editar', 'plan.crear');
  const q = useQuery({
    queryKey: ['mant', 'destinatarios-alertas'],
    queryFn: () => api<{ data?: Destinatario[] }>('/destinatarios-alertas').then(r => r.data ?? []),
    staleTime: 30_000,
  });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['mant', 'destinatarios-alertas'] });
  const cuerpo = (v: Valores) => ({
    nombre: String(v.nombre ?? '').trim(), correo: String(v.correo ?? '').trim().toLowerCase(), cargo: String(v.cargo ?? '').trim(),
    notif_1d: !!v.notif_1d, notif_3d: !!v.notif_3d, notif_7d: !!v.notif_7d, notif_completada: !!v.notif_completada,
  });
  const avisos = (d: Destinatario) => [d.notif_1d && '1d', d.notif_3d && '3d', d.notif_7d && '7d', d.notif_completada && 'completada'].filter(Boolean).join(' · ') || 'sin avisos';

  return (
    <CrudLista<Destinatario>
      eyebrow="Planificación" titulo="Alertas de mantenimiento" singular="destinatario" icono={<Bell size={16} />}
      datos={q.data ?? []} cargando={q.isLoading} error={q.isError ? q.error : undefined} idDe={d => d.id} arriba={arriba}
      principal={d => `${d.nombre}${d.cargo ? ` · ${d.cargo}` : ''}`}
      secundaria={d => `${d.correo} · ${avisos(d)}`}
      buscarEn={d => `${d.nombre} ${d.correo} ${d.cargo ?? ''}`}
      campos={CAMPOS_ALERTA.map(c => ({ ...c, inicial: c.tipo === 'bool' ? true : undefined }))}
      crear={puede ? async (v: Valores) => { await api('/destinatarios-alertas', { method: 'POST', body: cuerpo(v) }); await refrescar(); } : undefined}
      editar={puede ? async (d, v) => { await api(`/destinatarios-alertas/${d.id}`, { method: 'PUT', body: cuerpo(v) }); await refrescar(); } : undefined}
      eliminar={puede ? async d => { await api(`/destinatarios-alertas/${d.id}`, { method: 'DELETE' }); await refrescar(); } : undefined}
    />
  );
}
