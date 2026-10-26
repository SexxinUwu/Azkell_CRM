import '../almacen/almacen.css';
import './mant.css';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Disc3, SearchX } from 'lucide-react';
import { api, errorMessage } from '../../core/api/client';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { NeumaticosNuevaInspeccionSheet } from './NeumaticosNuevaInspeccionSheet';
import { NeumaticosHistorialPlaca } from './NeumaticosHistorialPlaca';
import { LogoArchivo, RequerimientoNeumaticos } from './NeumaticosRequerimiento';
import { VehiculosTarjetas } from './NeumaticosVehiculos';
import { entraEnRequerimiento, exportarUltimasExcel, leerUmbral, textoUmbral, type LlantaUltima } from './neumaticosReposicion';
import { MM_CRITICO, MM_PREVENTIVO } from './neumaticosSemaforo';

// Últimas inspecciones y requerimiento de llantas (clásico: modulos/mantenimiento/neumaticos-ultimas).
// GET /api/neumaticos/ultimas devuelve una fila por llanta de la última inspección de cada placa.

type FiltroMotora = 'Todos' | 'Motora' | 'No Motora';
type Pestana = 'ultimas' | 'requerimientos';

function useUltimas() {
  return useQuery<LlantaUltima[]>({
    queryKey: ['mant', 'neumaticos', 'ultimas'],
    queryFn: async () => {
      const r = await api<{ ok?: boolean; error?: string; data?: LlantaUltima[] }>('/neumaticos/ultimas');
      if (r.ok === false) throw new Error(r.error ?? 'No se pudieron cargar las inspecciones');
      return r.data ?? [];
    },
    staleTime: 60_000,
  });
}

/** Motora según el filtro del clásico (incluye "auto" en el tipo de unidad) */
function esMotoraFiltro(l: LlantaUltima): boolean {
  const m = String(l.motora ?? '').toUpperCase().trim();
  const tipo = String(l.tipo_unidad ?? '').toLowerCase();
  return m === 'SI' || m === '1' || m === 'MOTORA' || tipo.includes('tracto') || tipo.includes('camion') || tipo.includes('auto');
}

const Pastilla = ({ activa, onClick, children, rojo }: { activa: boolean; onClick: () => void; children: React.ReactNode; rojo?: boolean }) => (
  <button type="button" onClick={onClick} aria-pressed={activa}
    style={{
      padding: '0.5rem 1rem', minHeight: 44, borderRadius: 'var(--r-full)', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer',
      background: activa ? 'var(--ink)' : 'var(--fill)', color: activa ? 'var(--label-inverse)' : rojo ? 'var(--red-ink)' : 'var(--label-2)',
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</button>
);

export function NeumaticosUltimasPage() {
  const { data, isLoading, isError, error } = useUltimas();
  const [params, setParams] = useSearchParams();
  const tab: Pestana = params.get('tab') === 'requerimientos' ? 'requerimientos' : 'ultimas';
  const setTab = (t: Pestana) => { setMedidaSel(null); setParams(t === 'requerimientos' ? { tab: 'requerimientos' } : {}, { replace: true }); };

  const [busqueda, setBusqueda] = useState('');
  const [empresa, setEmpresa] = useState('Todos');
  const [motora, setMotora] = useState<FiltroMotora>('Todos');
  const [umbral, setUmbral] = useState(leerUmbral);
  const [medidaSel, setMedidaSel] = useState<string | null>(null);
  const [nueva, setNueva] = useState<{ abierta: boolean; placa: string }>({ abierta: false, placa: '' });
  const [historial, setHistorial] = useState<{ abierto: boolean; placa: string }>({ abierto: false, placa: '' });

  const ultimas = useMemo(() => data ?? [], [data]);
  const empresas = useMemo(() => [...new Set(ultimas.map(l => (l.dueno ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [ultimas]);
  const unidades = useMemo(() => new Set(ultimas.map(l => String(l.placa ?? '').toUpperCase().trim())).size, [ultimas]);
  const requerimiento = useMemo(() => ultimas.filter(l => entraEnRequerimiento(l, umbral)), [ultimas, umbral]);

  // Mismos filtros del clásico en ambas pestañas: empresa, motora / no motora y texto
  const pasa = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return (l: LlantaUltima) => {
      if (empresa !== 'Todos' && l.dueno !== empresa) return false;
      if (motora !== 'Todos') {
        const m = esMotoraFiltro(l);
        if (motora === 'Motora' && !m) return false;
        if (motora === 'No Motora' && m) return false;
      }
      if (!q) return true;
      return [l.placa, l.posicion, l.marca, l.modelo, l.medida, l.observaciones].some(x => String(x ?? '').toLowerCase().includes(q));
    };
  }, [busqueda, empresa, motora]);

  const visiblesUlt = useMemo(() => ultimas.filter(pasa), [ultimas, pasa]);
  const visiblesReq = useMemo(() => requerimiento.filter(pasa), [requerimiento, pasa]);
  const hayFiltros = !!busqueda || empresa !== 'Todos' || motora !== 'Todos';

  const abrirInspeccion = (placa: string) => setNueva({ abierta: true, placa });

  return (
    <Page wide>
      <PageHeader eyebrow="Neumáticos" title="Últimas inspecciones" subtitle="Estado de desgaste de cada llanta en la última inspección de cada unidad" />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <Pastilla activa={tab === 'ultimas'} onClick={() => setTab('ultimas')}>
              Últimas Inspecciones <span className="badge">{unidades.toLocaleString('es-PE')}</span>
            </Pastilla>
            <Pastilla activa={tab === 'requerimientos'} rojo onClick={() => setTab('requerimientos')}>
              ● Requerimiento ({textoUmbral(umbral)}) <span className="badge badge--red">{requerimiento.length.toLocaleString('es-PE')}</span>
            </Pastilla>
          </div>

          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 16rem', minWidth: 0 }}>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar placa, marca, medida o nota..." />
            </div>
            {tab === 'ultimas' && (
              <Button variant="secondary" iconOnly icon={<LogoArchivo tipo="excel" />} disabled={visiblesUlt.length === 0}
                aria-label="Exportar a Excel" title="Exportar a Excel" style={{ minHeight: 44, minWidth: 44 }}
                onClick={() => exportarUltimasExcel(visiblesUlt).catch(e => alert('No se pudo exportar: ' + String(e)))} />
            )}
            <SelectInput value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Filtrar por empresa" style={{ minHeight: 44, width: 'auto', minWidth: 180 }}>
              <option value="Todos">Todas las Empresas</option>
              {empresas.map(e => <option key={e} value={e}>{e}</option>)}
            </SelectInput>
            <SegmentedControl<FiltroMotora> label="Tipo de unidad" value={motora} onChange={setMotora}
              options={[{ value: 'Todos', label: 'Todos' }, { value: 'Motora', label: 'Motora' }, { value: 'No Motora', label: 'No Motora' }]} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)', fontSize: '0.8125rem', color: 'var(--label-2)', background: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: '10px 16px', boxShadow: 'var(--shadow-card)' }}>
            <span style={{ fontWeight: 600 }}>Estado de desgaste por llanta:</span>
            <span style={{ display: 'flex', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
              <span>🟢 &gt; {MM_PREVENTIVO} mm (Óptima)</span>
              <span>🟡 {MM_CRITICO} - {MM_PREVENTIVO} mm (Alerta)</span>
              <span>🔴 &lt; {MM_CRITICO} mm (Crítica)</span>
            </span>
          </div>

          {tab === 'ultimas' ? (
            visiblesUlt.length === 0 ? (
              <EmptyState icon={hayFiltros ? <SearchX size={22} /> : <Disc3 size={22} />}
                title={hayFiltros ? 'Sin coincidencias' : 'Sin inspecciones registradas'}>
                {hayFiltros ? 'No se encontraron registros que coincidan con los filtros aplicados.' : 'Aún no hay inspecciones de neumáticos.'}
              </EmptyState>
            ) : (
              <VehiculosTarjetas llantas={visiblesUlt} onInspeccionar={abrirInspeccion} onHistorial={placa => setHistorial({ abierto: true, placa })} />
            )
          ) : (
            <RequerimientoNeumaticos llantas={visiblesReq} umbral={umbral} onUmbral={u => { setUmbral(u); setMedidaSel(null); }} hayBusqueda={hayFiltros}
              medidaSel={medidaSel} onMedida={setMedidaSel} onInspeccionar={abrirInspeccion} />
          )}
        </div>
      )}

      <NeumaticosNuevaInspeccionSheet open={nueva.abierta} placaInicial={nueva.placa} onClose={() => setNueva({ abierta: false, placa: '' })} />
      <NeumaticosHistorialPlaca placa={historial.placa} open={historial.abierto} onClose={() => setHistorial({ abierto: false, placa: '' })} />
    </Page>
  );
}
