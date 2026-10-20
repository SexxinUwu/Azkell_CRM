import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, PageLoader } from '../../core/ui/Button';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { RegistroBaseSheet, eliminarRegistroBase } from './UnidadBaseFormulario';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { api, errorMessage } from '../../core/api/client';

// Seguridad › Status "Unidades en Base": qué unidades están dentro de la base o patio, en vivo.
// Lectura del panorama del servidor (GET /seguridad/unidades-base/panorama-en-vivo), refresca cada 30 segundos.
interface UnidadBase {
  id: string | null; base_id: string | number | null; placa: string; placa_camion: string | null; placa_carreta: string | null; conductor: string | null; empresa: string | null; marca: string | null;
  tipo: string | null; status_operativo: string | null; ubicacion: string | null; zona: string | null; estado: string | null;
  estado_carga: string | null; observacion: string | null; corte: string | null; esRuta: boolean; fecha_salida: string | null;
  hora_salida: string | null; km_salida: number | null; orden_viaje: string | null; has_alert: boolean | number | null;
}
interface Panorama { ok: boolean; items: UnidadBase[]; lista_empresas?: string[] }

const COLUMNAS: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 150 },
  { id: 'empresa', titulo: 'Empresa', ancho: 200 },
  { id: 'conductor', titulo: 'Conductor', ancho: 220 },
  { id: 'status', titulo: 'Status', ancho: 170 },
  { id: 'ubicacion', titulo: 'Ubicación', ancho: 200 },
  { id: 'corte', titulo: 'Corte', ancho: 110 },
  { id: 'salida', titulo: 'Salida', ancho: 160 },
  { id: 'km', titulo: 'Km salida', ancho: 120, alinear: 'right' },
  { id: 'orden', titulo: 'Orden de viaje', ancho: 160 },
  { id: 'alerta', titulo: 'Alerta', ancho: 110 },
  { id: 'acciones', titulo: 'Acciones', ancho: 120, minimo: 110 },
];

export function UnidadesBasePage() {
  const [q, setQ] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [forma, setForma] = useState<{ item: UnidadBase | null } | null>(null);
  const [borrar, setBorrar] = useState<UnidadBase | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const puedeEditar = can('seguridad_unidades.editar', 'seg_unidades.editar', 'seguridad_unidades.crear');
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

  const panorama = useQuery<Panorama>({
    queryKey: ['seguridad', 'unidades-base', hoy],
    queryFn: () => api<Panorama>(`/seguridad/unidades-base/panorama-en-vivo?fecha=${hoy}&corte=ALL&empresa=TODAS`),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const todas = panorama.data?.items ?? [];
  const empresas = useMemo(() => [...new Set(todas.map(u => u.empresa ?? '').filter(Boolean))].sort(), [todas]);
  const datos = useMemo(() => {
    const t = q.trim().toUpperCase();
    return todas.filter(u =>
      (!empresa || u.empresa === empresa) &&
      (!t || u.placa.toUpperCase().includes(t) || (u.conductor ?? '').toUpperCase().includes(t) || (u.orden_viaje ?? '').toUpperCase().includes(t)));
  }, [todas, q, empresa]);
  const conAlerta = todas.filter(u => u.has_alert === true || u.has_alert === 1).length;
  const enRuta = todas.filter(u => u.esRuta).length;

  return (
    <Page>
      <PageHeader eyebrow="Seguridad" title='Status "Unidades en Base"'
        subtitle={panorama.isLoading ? 'Cargando…' : `${todas.length} unidades · ${enRuta} en ruta · ${conAlerta} con alerta · se actualiza cada 30 s`} actions={puedeEditar ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setForma({ item: null })}>Registrar unidad</Button> : undefined} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchField value={q} onChange={setQ} placeholder="Placa, conductor u orden de viaje…" />
          <SelectInput value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Empresa" style={{ width: 'auto' }}>
            <option value="">Todas las empresas</option>
            {empresas.map(e => <option key={e} value={e}>{e}</option>)}
          </SelectInput>
        </div>

        {panorama.isLoading ? <PageLoader /> : panorama.isError ? <Notice tone="error">{errorMessage(panorama.error)}</Notice> : datos.length === 0 ? (
          <EmptyState icon={q || empresa ? <SearchX size={22} /> : <MapPin size={22} />} title={q || empresa ? 'Sin coincidencias' : 'Sin unidades en la base'}>
            No hay unidades registradas para hoy.
          </EmptyState>
        ) : (
          <TablaRedimensionable id="unidades-base" columnas={COLUMNAS} ariaLabel="Unidades en base" altoMax="70vh">
            {datos.map(u => (
              <tr key={`${u.base_id ?? 'sin-base'}-${u.placa}-${u.placa_carreta ?? ''}`}>
                <Celda><LicensePlate plate={u.placa} size="sm" /></Celda>
                <Celda>{u.empresa || '—'}</Celda>
                <Celda>{u.conductor || '—'}</Celda>
                <Celda>{u.status_operativo || u.estado_carga || '—'}</Celda>
                <Celda>{u.ubicacion || u.zona || '—'}</Celda>
                <Celda mono>{u.corte || '—'}</Celda>
                <Celda mono>{[u.fecha_salida, u.hora_salida].filter(Boolean).join(' ') || '—'}</Celda>
                <Celda alinear="right" mono>{u.km_salida != null ? Number(u.km_salida).toLocaleString('es-PE') : '—'}</Celda>
                <Celda mono>{u.orden_viaje || '—'}</Celda>
                <Celda>{u.has_alert === true || u.has_alert === 1 ? <span style={{ color: 'var(--red-ink)', fontWeight: 700 }}>Con alerta</span> : '—'}</Celda>
                <Celda>
                  {/* Solo las filas con registro en la base se editan o eliminan; las que vienen de ruta o sin registro no */}
                  {puedeEditar && u.base_id != null && (
                    <span style={{ display: 'inline-flex', gap: 'var(--s-1)' }}>
                      <Button variant="secondary" icon={<Pencil size={14} />} aria-label={`Editar ${u.placa}`} onClick={() => setForma({ item: u })}>{''}</Button>
                      <Button variant="secondary" icon={<Trash2 size={14} />} aria-label={`Eliminar ${u.placa}`} onClick={() => setBorrar(u)}>{''}</Button>
                    </span>
                  )}
                </Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </div>
      <RegistroBaseSheet abierto={!!forma} registro={forma?.item ?? null} onClose={() => setForma(null)}
        onGuardado={() => qc.invalidateQueries({ queryKey: ['seguridad', 'unidades-base'] })} />
      <ConfirmSheet open={!!borrar} onClose={() => !ocupado && setBorrar(null)} loading={ocupado}
        title={`¿Eliminar el registro de ${borrar?.placa ?? ''}?`} message="Sale de la base. Esta acción no se puede deshacer." confirmLabel="Eliminar"
        onConfirm={async () => {
          if (!borrar) return;
          setOcupado(true);
          try {
            await eliminarRegistroBase(borrar);
            toast('Registro eliminado');
            setBorrar(null);
            await qc.invalidateQueries({ queryKey: ['seguridad', 'unidades-base'] });
          } catch (err) { toast(errorMessage(err), 'error'); }
          finally { setOcupado(false); }
        }} />
    </Page>
  );
}
