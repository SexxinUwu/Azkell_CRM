import './flota.css';
import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, ClipboardCheck, FileSpreadsheet, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { formatFechaHoraPe } from '../../core/lib/format';

type Item = Record<string, unknown>;
interface Seccion { id?: string; titulo?: string; items?: Item[] }
interface Registro {
  id: string; placa_tracto: string; placa_carreta: string | null; conductor: string; estado: string; salida_fecha: string | null; retorno_fecha: string | null;
  salida_has_alert: number | boolean; retorno_has_alert: number | boolean;
  salida_checklist_json: unknown; retorno_checklist_json: unknown;
}

// El checklist se guarda como lista de secciones con ítems, o como lista plana de ítems
function itemsDe(c: unknown): Item[] {
  if (!Array.isArray(c)) return [];
  return (c as (Seccion | Item)[]).flatMap(x => (Array.isArray((x as Seccion).items) ? ((x as Seccion).items as Item[]) : [x as Item]));
}
const evaluado = (i: Item) => i.valor !== undefined || i.estado !== undefined || i.ok !== undefined || i.resultado !== undefined;
const esOk = (i: Item) => i.ok === true || i.valor === true || ['ok', 'bueno', 'b', 'si', 'sí', 'conforme'].includes(String(i.valor ?? i.estado ?? i.resultado ?? '').toLowerCase());
const pct = (items: Item[]) => (items.length ? Math.round((items.filter(esOk).length / items.length) * 100) : 0);
const nombreItem = (i: Item) => String(i.label ?? i.nombre ?? i.texto ?? i.id ?? 'Ítem');
const dia = (s?: string | null) => formatFechaHoraPe(s);
const tonoPct = (p: number) => (p >= 80 ? 'green' : p >= 50 ? 'amber' : 'red');

// Flota › Checklist de entrega: revisión de cada unidad al salir y al volver (se captura en Garita).
export function ChecklistEntregaPage() {
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const q = useQuery<Registro[]>({
    queryKey: ['flota', 'checklist-entregas'],
    queryFn: () => api<Registro[]>('/seguridad/unidades?limit=300').then(r => (Array.isArray(r) ? r : [])),
    staleTime: 30_000,
  });

  const conChecklist = useMemo(() => (q.data ?? []).filter(r => itemsDe(r.salida_checklist_json).length || itemsDe(r.retorno_checklist_json).length), [q.data]);
  const visibles = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return conChecklist.filter(r => (!soloAlertas || r.salida_has_alert || r.retorno_has_alert)
      && (!t || [r.id, r.placa_tracto, r.placa_carreta, r.conductor].some(x => String(x ?? '').toUpperCase().includes(t))));
  }, [conChecklist, busqueda, soloAlertas]);
  const abierto = (q.data ?? []).find(r => r.id === abiertoId) ?? null;

  async function exportar() {
    try {
      await exportarExcel('Checklist-de-entrega', 'Checklist',
        ['Folio', 'Tracto', 'Carreta', 'Conductor', 'Salida', 'Retorno', '% salida', '% retorno', 'Alerta'],
        visibles.map(r => [r.id, r.placa_tracto, r.placa_carreta, r.conductor, dia(r.salida_fecha), dia(r.retorno_fecha),
          pct(itemsDe(r.salida_checklist_json)), pct(itemsDe(r.retorno_checklist_json)), r.salida_has_alert || r.retorno_has_alert ? 'Sí' : '']));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const detalle = (titulo: string, c: unknown) => {
    const items = itemsDe(c);
    if (!items.length) return null;
    const p = pct(items);
    return (
      <div>
        <p className="tarjeta__grupo-titulo">{titulo} · {p}% conforme ({items.filter(evaluado).length}/{items.length} revisados)</p>
        <div className="tarjeta__lista">
          {items.map((it, i) => (
            <div key={i} className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-2)' }}>
              <span className="dato__valor" style={{ flex: 1, fontSize: '0.875rem' }}>{nombreItem(it)}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: esOk(it) ? 'var(--green-ink)' : evaluado(it) ? 'var(--red-ink)' : 'var(--label-3)' }}>
                {esOk(it) ? 'Conforme' : evaluado(it) ? String(it.valor ?? it.estado ?? it.resultado ?? 'Observado') : 'Sin revisar'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Checklist de entrega"
        subtitle={q.isLoading ? 'Cargando…' : `${conChecklist.length} unidades con checklist`}
        actions={
          <MenuOtros opciones={[
            { label: 'Exportar Excel', detalle: `${visibles.length} registros`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
            { label: soloAlertas ? 'Ver todos' : 'Ver solo con alerta', icon: <AlertTriangle size={17} />, onSelect: () => setSoloAlertas(v => !v) },
            { label: 'Capturar checklist, firmas y fotos', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('seguridad/unidades') },
          ]} />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Folio, placa o conductor…" />
        {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || soloAlertas ? <SearchX size={22} /> : <ClipboardCheck size={22} />} title={busqueda || soloAlertas ? 'Sin coincidencias' : 'Sin checklists registrados'}>
            Los checklists se capturan al registrar la salida y el retorno de una unidad en Garita.
          </EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {visibles.map(r => {
              const ps = pct(itemsDe(r.salida_checklist_json)), pr = pct(itemsDe(r.retorno_checklist_json));
              const alerta = !!(r.salida_has_alert || r.retorno_has_alert);
              return (
                <button key={r.id} type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); setAbiertoId(r.id); }}>
                  <div className="mov-fila__icon" style={{ background: alerta ? 'var(--red-tint)' : 'var(--green-tint)', color: alerta ? 'var(--red-ink)' : 'var(--green-ink)' }}>
                    {alerta ? <AlertTriangle size={16} /> : <ClipboardCheck size={16} />}
                  </div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{r.placa_tracto}{r.placa_carreta ? ` + ${r.placa_carreta}` : ''} · {r.conductor}</span>
                    <span className="mov-fila__sub">{r.id} · salida {dia(r.salida_fecha)}{r.retorno_fecha ? ` · retorno ${dia(r.retorno_fecha)}` : ''}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${tonoPct(ps)}-ink)` }}>Salida {ps}%</span>
                    {itemsDe(r.retorno_checklist_json).length > 0 && <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${tonoPct(pr)}-ink)` }}>Retorno {pr}%</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!abierto} onClose={() => setAbiertoId(null)} title={abierto ? `${abierto.placa_tracto} · ${abierto.id}` : ''} footer={<Button variant="secondary" onClick={() => setAbiertoId(null)}>Cerrar</Button>}>
        {abierto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            {(abierto.salida_has_alert || abierto.retorno_has_alert) && <Notice tone="error" icon={<AlertTriangle size={16} />}>Hay ítems con observación en este checklist.</Notice>}
            {detalle('Checklist de salida', abierto.salida_checklist_json)}
            {detalle('Checklist de retorno', abierto.retorno_checklist_json)}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
