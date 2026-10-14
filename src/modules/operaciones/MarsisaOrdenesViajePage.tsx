import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, FileSpreadsheet, RefreshCw, SearchX, Truck } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';

interface ViajeMarsisa {
  id: number; viaje: string; fecha_viaje: string | null; conductor: string | null; placa_tracto: string | null; placa_remolque: string | null;
  ruta: string | null; estado: string | null; peso: number | string | null; observaciones: string | null;
  cant_ordenes?: number; peso_ida?: number | string; peso_retorno?: number | string; ordenes_list?: string | null; rutas_list?: string | null;
  fecha_inicio?: string | null; fecha_fin?: string | null; kilometraje_inicial?: number | null; kilometraje_final?: number | null;
}

const n = (v: unknown) => Number(v) || 0;
const fmt = (s?: string | null) => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');
const color = (e: string | null) => {
  const s = String(e ?? '').toUpperCase();
  if (s.includes('FINAL')) return 'green';
  if (s.includes('INICI') || s.includes('CURSO') || s.includes('TRANSITO')) return 'accent';
  if (s.includes('ANUL')) return 'gray';
  return 'amber';
};

// Operaciones › Órdenes de viaje Marsisa: órdenes sincronizadas desde el sistema de Marsisa (solo consulta).
export function MarsisaOrdenesViajePage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<ViajeMarsisa | null>(null);
  const [sync, setSync] = useState(false);

  const q = useQuery<ViajeMarsisa[]>({
    queryKey: ['operaciones', 'marsisa-ordenes-viaje'],
    queryFn: () => api<{ data?: ViajeMarsisa[] }>('/operaciones/marsisa-ordenes-viaje?limit=2500').then(r => r.data ?? []),
    staleTime: 30_000,
  });
  const lista = q.data ?? [];
  const visibles = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return t ? lista.filter(v => [v.viaje, v.conductor, v.placa_tracto, v.placa_remolque, v.ruta, v.ordenes_list].some(x => String(x ?? '').toUpperCase().includes(t))) : lista;
  }, [lista, busqueda]);

  async function sincronizar() {
    setSync(true);
    try {
      const r = await api<{ message?: string; insertados?: number; actualizados?: number }>('/operaciones/ordenes-viaje/sincronizar', { method: 'POST' });
      haptic('success');
      toast(r.message || `Sincronizado: ${r.insertados ?? 0} nuevas, ${r.actualizados ?? 0} actualizadas`);
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setSync(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Ordenes-de-viaje-Marsisa', 'Viajes',
        ['Viaje', 'Fecha', 'Estado', 'Conductor', 'Tracto', 'Remolque', 'Ruta', 'Peso ida', 'Peso retorno', 'Órdenes'],
        visibles.map(v => [v.viaje, fmt(v.fecha_viaje), v.estado, v.conductor, v.placa_tracto, v.placa_remolque, v.ruta, n(v.peso_ida), n(v.peso_retorno), v.ordenes_list]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones · Marsisa"
        title="Órdenes de viaje Marsisa"
        subtitle={q.isLoading ? 'Cargando…' : `${lista.length} órdenes`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} órdenes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('operaciones/marsisa-ordenes-viaje') },
            ]} />
            {can('op_ordenes_viaje.editar', 'op_ordenes_viaje.crear', 'op_programacion.editar') && (
              <Button variant="primary" icon={<RefreshCw size={16} />} onClick={sincronizar} loading={sync}>Sincronizar</Button>
            )}
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Viaje, conductor, placa, ruta u orden…" />
        {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda ? <SearchX size={22} /> : <Truck size={22} />} title={busqueda ? 'Sin coincidencias' : 'Sin órdenes de viaje'}>
            {busqueda ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button> : <>Usa <strong>Sincronizar</strong> para traer las órdenes de Marsisa.</>}
          </EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {visibles.map(v => (
              <button key={v.viaje} type="button" className="mov-fila" onClick={() => { haptic('selection'); setAbierto(v); }}>
                <div className="mov-fila__icon" style={{ background: `var(--${color(v.estado)}-tint)`, color: `var(--${color(v.estado)}-ink)` }}><Truck size={16} /></div>
                <div className="mov-fila__cuerpo">
                  <span className="mov-fila__titulo">{v.viaje} · {v.conductor || 'Sin conductor'}</span>
                  <span className="mov-fila__sub">{[v.placa_tracto, v.placa_remolque, v.ruta || v.rutas_list].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="mov-fila__derecha">
                  <span className="mov-fila__monto">{fmt(v.fecha_viaje).slice(0, 10)}</span>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${color(v.estado)}-ink)` }}>{v.estado ?? '—'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!abierto} onClose={() => setAbierto(null)} title={abierto ? `Viaje ${abierto.viaje}` : ''} footer={<Button variant="secondary" onClick={() => setAbierto(null)}>Cerrar</Button>}>
        {abierto && (
          <div className="tarjeta__lista">
            {fila('Estado', abierto.estado)}{fila('Conductor', abierto.conductor)}{fila('Tracto', abierto.placa_tracto, true)}{fila('Remolque', abierto.placa_remolque, true)}
            {fila('Ruta', abierto.ruta)}{fila('Rutas', abierto.rutas_list)}{fila('Órdenes de servicio', abierto.ordenes_list)}
            {fila('Peso ida', n(abierto.peso_ida) ? `${n(abierto.peso_ida).toLocaleString('es-PE')} kg` : '')}{fila('Peso retorno', n(abierto.peso_retorno) ? `${n(abierto.peso_retorno).toLocaleString('es-PE')} kg` : '')}
            {fila('Fecha del viaje', fmt(abierto.fecha_viaje), true)}{fila('Inicio', abierto.fecha_inicio ? fmt(abierto.fecha_inicio) : '', true)}{fila('Fin', abierto.fecha_fin ? fmt(abierto.fecha_fin) : '', true)}
            {fila('Km inicial', abierto.kilometraje_inicial, true)}{fila('Km final', abierto.kilometraje_final, true)}{fila('Observaciones', abierto.observaciones)}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
