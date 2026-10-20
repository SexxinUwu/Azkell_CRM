import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, Clock, Check, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';

// Mantenimiento › Config. métrica: si cada placa se programa por kilómetros o por horas de motor
interface PlacaMetrica { placa: string; marca: string | null; metrica: string | null }

const COLUMNAS: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 150 },
  { id: 'marca', titulo: 'Marca', ancho: 220 },
  { id: 'metrica', titulo: 'Métrica activa', ancho: 200 },
  { id: 'acciones', titulo: 'Cambiar a', ancho: 260, minimo: 200 },
];

export function ConfigMetricaPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [guardando, setGuardando] = useState<string | null>(null);
  const puedeEditar = can('cfg_mant.editar', 'cfg_mant.crear');

  const lista = useQuery<PlacaMetrica[]>({
    queryKey: ['mant', 'config-metrica'],
    queryFn: () => api<PlacaMetrica[]>('/config-metrica'),
    staleTime: 60_000,
  });

  const datos = useMemo(() => {
    const t = q.trim().toUpperCase();
    return (lista.data ?? []).filter(r => !t || r.placa.toUpperCase().includes(t) || (r.marca ?? '').toUpperCase().includes(t));
  }, [lista.data, q]);
  const conHoras = (lista.data ?? []).filter(r => r.metrica === 'horas').length;

  async function cambiar(placa: string, metrica: 'km' | 'horas') {
    setGuardando(placa);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/config-metrica/${encodeURIComponent(placa)}`, { method: 'PUT', body: { metrica } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo cambiar');
      haptic('success'); toast(`${placa} → ${metrica === 'horas' ? 'horas de motor' : 'kilómetros'}`);
      await qc.invalidateQueries({ queryKey: ['mant', 'config-metrica'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGuardando(null); }
  }

  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Configuración de métrica"
        subtitle={lista.isLoading ? 'Cargando…' : `${(lista.data ?? []).length - conHoras} por km · ${conHoras} por horas de motor`} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <SearchField value={q} onChange={setQ} placeholder="Placa o marca…" />

        {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : datos.length === 0 ? (
          <EmptyState icon={q ? <SearchX size={22} /> : <Gauge size={22} />} title={q ? 'Sin coincidencias' : 'Sin placas'}>Las placas se cargan desde el catálogo de placas.</EmptyState>
        ) : (
          <TablaRedimensionable id="config-metrica" columnas={COLUMNAS} ariaLabel="Configuración de métrica por placa">
            {datos.map(r => {
              const horas = r.metrica === 'horas';
              return (
                <tr key={r.placa}>
                  <Celda><LicensePlate plate={r.placa} size="sm" /></Celda>
                  <Celda>{r.marca || '—'}</Celda>
                  <Celda>
                    {horas
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--amber-ink)' }}><Clock size={14} /> Horas de motor</span>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--accent)' }}><Gauge size={14} /> Kilómetros</span>}
                  </Celda>
                  <Celda>
                    {puedeEditar && (
                      <span style={{ display: 'inline-flex', gap: 'var(--s-2)' }}>
                        <Button variant={horas ? 'secondary' : 'primary'} icon={<Gauge size={14} />} disabled={!horas || guardando === r.placa} onClick={() => cambiar(r.placa, 'km')}>Usar km</Button>
                        <Button variant={horas ? 'primary' : 'secondary'} icon={<Clock size={14} />} disabled={horas || guardando === r.placa} onClick={() => cambiar(r.placa, 'horas')}>Usar horas</Button>
                      </span>
                    )}
                  </Celda>
                </tr>
              );
            })}
          </TablaRedimensionable>
        )}
        {!lista.isLoading && <p className="t-footnote c-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={13} /> Un cambio aplica de inmediato al programa de mantenimiento de la unidad.</p>}
      </div>
    </Page>
  );
}
