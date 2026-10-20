import { Fragment, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, FileSpreadsheet, PackageSearch, PlusCircle, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { crearPlanesLote, useProyeccion, useRequerimientos, type Proyeccion, type Requerimiento } from './fleetrunApi';

// Planificación › Proyección y Requerimientos (mismas reglas que modulos/mantenimiento/planificacion/logica.js):
// - Proyección: próximos MP según el último Fleetrun + la frecuencia en días (el servidor calcula fecha y atraso).
// - Requerimientos: repuestos que piden los kits de los planes del mes, agrupados por marca y tipo de MP.

const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const sol = (n: number, dec = 2) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const fechaCorta = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(`${iso.split('T')[0]}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
};

type CatProy = 'vencida' | 'km' | 'urgente' | 'proximo' | 'programado';
const ETIQUETA_PROY: Record<CatProy, { label: string; color: string }> = {
  vencida: { label: 'Vencida', color: 'red' }, km: { label: 'Por km', color: 'blue' }, urgente: { label: 'Urgente', color: 'amber' },
  proximo: { label: 'Próximo', color: 'blue' }, programado: { label: 'Programado', color: 'green' },
};
function categoria(p: Proyeccion): CatProy {
  if (p.vencida) return 'vencida';
  if (p.metodo === 'km') return 'km';
  if (p.dias_restantes != null && p.dias_restantes <= 15) return 'urgente';
  if (p.dias_restantes != null && p.dias_restantes <= 45) return 'proximo';
  return 'programado';
}

function Kpi({ valor, label, tono }: { valor: string | number; label: string; tono?: 'red' | 'amber' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: tono ? `var(--${tono}-ink)` : 'var(--label)' }}>{valor}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{label}</span>
    </div>
  );
}

// ─── Proyección ───────────────────────────────────────────────────────────────

export function ProyeccionTab({ usuario, puedeCrear }: { usuario: string; puedeCrear: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [meses, setMeses] = useState(3);
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('');
  const [generar, setGenerar] = useState<{ clave: string; items: Proyeccion[] } | null>(null);
  const [generando, setGenerando] = useState(false);
  const { data, isLoading, isError, error } = useProyeccion(meses);

  const tipos = useMemo(() => [...new Set((data ?? []).map(p => p.tipo_mp).filter(Boolean))].sort(), [data]);
  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter(p => {
      if (t && !(p.placa.toLowerCase().includes(t) || (p.cliente ?? '').toLowerCase().includes(t) || (p.tipo_mp ?? '').toLowerCase().includes(t))) return false;
      if (tipo && p.tipo_mp !== tipo) return false;
      return !estado || categoria(p) === estado;
    });
  }, [data, q, tipo, estado]);

  const vencidas = filas.filter(p => p.vencida).length;
  const urgentes = filas.filter(p => !p.vencida && p.dias_restantes != null && p.dias_restantes <= 15).length;
  const costo = filas.reduce((s, p) => s + (Number(p.costo_kit) || 0), 0);

  // Agrupa por mes proyectado; las que solo tienen km van aparte
  const { grupos, sinFecha } = useMemo(() => {
    const g = new Map<string, Proyeccion[]>();
    const sf: Proyeccion[] = [];
    for (const p of filas) {
      if (!p.fecha_proyectada) { sf.push(p); continue; }
      const k = p.fecha_proyectada.slice(0, 7);
      g.set(k, [...(g.get(k) ?? []), p]);
    }
    return { grupos: [...g.entries()].sort(([a], [b]) => a.localeCompare(b)), sinFecha: sf };
  }, [filas]);

  async function generarPlanes() {
    if (!generar) return;
    const [anio, mes] = generar.clave.split('-').map(Number);
    const planes = generar.items.map(p => {
      const d = new Date(`${p.fecha_proyectada}T00:00:00`);
      const ini = new Date(d); ini.setDate(ini.getDate() - 5);
      const fin = new Date(d); fin.setDate(fin.getDate() + 5);
      return {
        placa: p.placa, tipo_mp: p.tipo_mp, fecha_inicio_ventana: ini.toISOString().split('T')[0], fecha_fin_ventana: fin.toISOString().split('T')[0],
        mes_ejecucion: mes, anio_ejecucion: anio, km_estimado: p.km_proximo || 0, prioridad: 'Normal', source: 'auto_generada', created_by: usuario || 'sistema',
      };
    });
    setGenerando(true);
    try {
      const r = await crearPlanesLote(planes);
      haptic('success');
      toast(`${r.creados ?? 0} plan(es) generados${r.ignorados ? ` · ${r.ignorados} ya existían` : ''}`);
      await qc.invalidateQueries({ queryKey: ['mant', 'planificacion'] });
      setGenerar(null);
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGenerando(false); }
  }

  async function exportar() {
    if (!filas.length) { toast('No hay datos para exportar', 'error'); return; }
    try {
      await exportarExcel(`Proyeccion_MPs_${meses}meses`, 'Proyeccion',
        ['Placa', 'Cliente', 'UTS', 'Tipo MP', 'Fecha proyectada', 'Días restantes', 'Últ. fecha ejecución', 'Últ. km', 'Km próximo', 'Frec. km', 'Método', 'Costo est. (S/)', 'Estado'],
        filas.map(p => [p.placa, p.cliente, p.uts, p.tipo_mp, p.fecha_proyectada ?? '', p.vencida ? -Math.abs(p.dias_restantes ?? 0) : (p.dias_restantes ?? ''),
          p.ultima_fecha ?? '', p.ultimo_km ?? '', p.km_proximo ?? '', p.frecuencia_km ?? '', p.metodo ?? 'fecha', p.costo_kit || 0, ETIQUETA_PROY[categoria(p)].label]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const fila = (p: Proyeccion) => {
    const c = categoria(p);
    return (
      <tr key={`${p.placa}-${p.tipo_mp}`}>
        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{p.placa}</td>
        <td style={{ maxWidth: '8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente || '—'}</td>
        <td style={{ fontWeight: 600 }}>{p.tipo_mp}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(p.fecha_proyectada)}</td>
        <td style={{ whiteSpace: 'nowrap', color: p.vencida ? 'var(--red-ink)' : p.dias_restantes != null && p.dias_restantes <= 15 ? 'var(--amber-ink)' : 'var(--green-ink)', fontWeight: p.vencida ? 700 : undefined }}>
          {p.vencida ? `+${Math.abs(p.dias_restantes ?? 0)} d atrasada` : p.dias_restantes != null ? `${p.dias_restantes} días` : '—'}
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(p.ultima_fecha)}</td>
        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{p.km_proximo ? Number(p.km_proximo).toLocaleString('es-PE') : '—'}</td>
        <td style={{ textAlign: 'right' }}>{p.costo_kit > 0 ? sol(p.costo_kit, 0) : <span style={{ color: 'var(--label-3)', fontSize: '0.75rem' }}>No registrado</span>}</td>
        <td><span className={`ot-estado ot-estado--${ETIQUETA_PROY[c].color}`}>{ETIQUETA_PROY[c].label}</span></td>
      </tr>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        {[3, 6, 12].map(m => (
          <button key={m} type="button" className={`chip${meses === m ? ' chip--active' : ''}`} onClick={() => { haptic('selection'); setMeses(m); }}>{m} meses</button>
        ))}
        <SelectInput value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de MP" style={{ width: 'auto' }}>
          <option value="">Todos los MP</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </SelectInput>
        <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado" style={{ width: 'auto' }}>
          <option value="">Todos los estados</option>
          {(Object.keys(ETIQUETA_PROY) as CatProy[]).map(k => <option key={k} value={k}>{ETIQUETA_PROY[k].label}</option>)}
        </SelectInput>
        <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={exportar}>Excel</Button>
      </div>
      <SearchField value={q} onChange={setQ} placeholder="Placa, cliente o tipo de MP…" />

      {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <>
          <div style={{ display: 'flex', gap: 'var(--s-5)', flexWrap: 'wrap' }}>
            <Kpi valor={filas.length} label="MP proyectadas" />
            <Kpi valor={vencidas} label="Vencidas" tono={vencidas > 0 ? 'red' : undefined} />
            <Kpi valor={urgentes} label="Urgentes (≤ 15 días)" tono={urgentes > 0 ? 'amber' : undefined} />
            <Kpi valor={costo > 0 ? sol(costo, 0) : '—'} label="Costo estimado de kits" />
          </div>
          {filas.length === 0 ? (
            <EmptyState icon={q || tipo || estado ? <SearchX size={22} /> : <CalendarCheck size={22} />} title={q || tipo || estado ? 'Sin coincidencias' : 'Sin MP proyectadas'}>
              {q || tipo || estado ? 'Prueba quitando filtros.' : 'No hay mantenimientos proyectados para este horizonte.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflowX: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '56rem' }}>
                <thead>
                  <tr>
                    <th>Placa</th><th>Cliente</th><th>Tipo MP</th><th>Fecha proyectada</th><th>Días restantes</th><th>Últ. ejecución</th>
                    <th style={{ textAlign: 'right' }}>Km próximo</th><th style={{ textAlign: 'right' }}>Costo est.</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map(([clave, items]) => {
                    const [anio, mes] = clave.split('-').map(Number);
                    return (
                      <Fragment key={clave}>
                        <tr>
                          <td colSpan={7} style={{ fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.04em', color: 'var(--label-2)', background: 'var(--fill)' }}>
                            {MESES_ES[mes - 1].toUpperCase()} {anio} — {items.length} MP
                          </td>
                          <td colSpan={2} style={{ textAlign: 'right', background: 'var(--fill)' }}>
                            {puedeCrear && (
                              <button type="button" className="placas-limpiar" onClick={() => setGenerar({ clave, items })}>
                                <PlusCircle size={13} style={{ verticalAlign: '-2px' }} /> Generar planes
                              </button>
                            )}
                          </td>
                        </tr>
                        {items.map(fila)}
                      </Fragment>
                    );
                  })}
                  {sinFecha.length > 0 && (
                    <>
                      <tr><td colSpan={9} style={{ fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.04em', color: 'var(--label-2)', background: 'var(--fill)' }}>
                        POR KILOMETRAJE (SIN FECHA ESTIMADA) — {sinFecha.length}
                      </td></tr>
                      {sinFecha.map(fila)}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Sheet open={!!generar} onClose={() => !generando && setGenerar(null)} title="Generar planes"
        footer={<><Button variant="secondary" onClick={() => setGenerar(null)} disabled={generando}>Cancelar</Button>
          <Button variant="primary" onClick={generarPlanes} loading={generando}>Generar</Button></>}>
        {generar && (
          <p className="t-callout c-secondary">
            ¿Generar {generar.items.length} plan(es) para {MESES_ES[Number(generar.clave.split('-')[1]) - 1]} {generar.clave.split('-')[0]}?
            Se crean como “Programada” con una ventana de ±5 días; los que ya tengan plan ese mes se ignoran.
          </p>
        )}
      </Sheet>
    </div>
  );
}

// ─── Resumen de repuestos ─────────────────────────────────────────────────────

const n = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

export function RequerimientosTab({ mes, anio }: { mes: number; anio: number }) {
  const toast = useToast();
  const [marca, setMarca] = useState('');
  const [tipo, setTipo] = useState('');
  const { data, isLoading, isError, error } = useRequerimientos(mes, anio);

  const marcas = useMemo(() => [...new Set((data ?? []).map(r => r.marca).filter((x): x is string => !!x))].sort(), [data]);
  const tipos = useMemo(() => [...new Set((data ?? []).map(r => r.tipo_mp).filter((x): x is string => !!x))].sort(), [data]);
  const filas = useMemo(() => (data ?? []).filter(r => (!marca || r.marca === marca) && (!tipo || r.tipo_mp === tipo)), [data, marca, tipo]);

  const costoTotal = filas.reduce((s, r) => s + n(r.total_costo), 0);
  const planes = new Set(filas.map(r => `${r.tipo_mp}${r.marca ?? ''}`)).size;

  // marca → tipo de MP → ítems
  const grupos = useMemo(() => {
    const g = new Map<string, Map<string, Requerimiento[]>>();
    for (const r of filas) {
      const m = r.marca || '(Sin marca)', t = r.tipo_mp || '—';
      if (!g.has(m)) g.set(m, new Map());
      const porTipo = g.get(m)!;
      porTipo.set(t, [...(porTipo.get(t) ?? []), r]);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filas]);

  async function exportar() {
    if (!filas.length) { toast('No hay datos para exportar', 'error'); return; }
    try {
      await exportarExcel(`Requerimientos_${mes}_${anio}`, 'Requerimientos',
        ['Marca', 'Tipo MP', 'Kit', 'Código', 'Ítem', 'Cant. total', 'Unidad', 'C. unit.', 'C. total', 'Planes'],
        filas.map(r => [r.marca ?? '', r.tipo_mp ?? '', r.nombre_kit ?? '', r.item_codigo ?? '', r.item_nombre ?? '', n(r.total_cantidad),
          r.unidad_medida ?? '', n(r.costo_unitario), n(r.total_costo), r.num_planes ?? 0]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <SelectInput value={marca} onChange={e => setMarca(e.target.value)} aria-label="Marca" style={{ width: 'auto' }}>
          <option value="">Todas las marcas</option>
          {marcas.map(m => <option key={m} value={m}>{m}</option>)}
        </SelectInput>
        <SelectInput value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de MP" style={{ width: 'auto' }}>
          <option value="">Todos los tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </SelectInput>
        <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={exportar}>Excel</Button>
      </div>

      {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <>
          <div style={{ display: 'flex', gap: 'var(--s-5)', flexWrap: 'wrap' }}>
            <Kpi valor={filas.length} label="Ítems requeridos" />
            <Kpi valor={sol(costoTotal)} label="Costo total" />
            <Kpi valor={planes} label="Combinaciones marca / MP" />
            <Kpi valor={marcas.length} label="Marcas" />
          </div>
          {filas.length === 0 ? (
            <EmptyState icon={marca || tipo ? <SearchX size={22} /> : <PackageSearch size={22} />} title={marca || tipo ? 'Sin coincidencias' : 'Sin requerimientos para este mes'}>
              {marca || tipo ? 'Prueba quitando filtros.' : `Los repuestos se calculan con los kits de los planes de ${MESES_ES[mes - 1]} ${anio}.`}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflowX: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '46rem' }}>
                <thead>
                  <tr>
                    <th>Ítem</th><th>Código</th><th style={{ textAlign: 'right' }}>Cant.</th><th>Unidad</th>
                    <th style={{ textAlign: 'right' }}>C. unit.</th><th style={{ textAlign: 'right' }}>C. total</th><th style={{ textAlign: 'right' }}>Planes</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map(([m, porTipo]) => {
                    const costoMarca = [...porTipo.values()].flat().reduce((s, r) => s + n(r.total_costo), 0);
                    return (
                      <Fragment key={m}>
                        <tr>
                          <td colSpan={5} style={{ fontWeight: 700, background: 'var(--fill)' }}>{m}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, background: 'var(--fill)', color: 'var(--green-ink)' }}>{sol(costoMarca)}</td>
                          <td style={{ background: 'var(--fill)' }} />
                        </tr>
                        {[...porTipo.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, items]) => (
                          <Fragment key={t}>
                            <tr>
                              <td colSpan={5} style={{ paddingLeft: 'var(--s-5)', fontWeight: 700, fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                                <span className="ot-estado ot-estado--blue">{t}</span> {items[0]?.nombre_kit ?? ''}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.8125rem', color: 'var(--green-ink)' }}>{sol(items.reduce((s, r) => s + n(r.total_costo), 0))}</td>
                              <td />
                            </tr>
                            {items.map((r, i) => (
                              <tr key={`${r.item_codigo}-${i}`}>
                                <td style={{ paddingLeft: 'var(--s-7, 2.5rem)', fontSize: '0.8125rem' }}>{r.item_nombre || '—'}</td>
                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{r.item_codigo || '—'}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{n(r.total_cantidad)}</td>
                                <td>{r.unidad_medida || '—'}</td>
                                <td style={{ textAlign: 'right' }}>{sol(n(r.costo_unitario))}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{sol(n(r.total_costo))}</td>
                                <td style={{ textAlign: 'right', color: 'var(--label-2)', fontSize: '0.75rem' }}>{r.num_planes ?? ''}</td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
