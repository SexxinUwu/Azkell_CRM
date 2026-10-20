import './mant.css';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { guardarUmbrales, useUmbralesConfig } from './fleetrunApi';

// Mantenimiento › Umbrales de Fleetrun: cuánto antes del vencimiento una unidad pasa a "Por vencer", según el tipo de UTS
// y si se programa por kilómetros o por horas. Se guarda en configuracion_erp › fleetrun_uts_umbrales como
// { "NACIONAL_KM": 2000, "LOCAL_HORAS": 100 } (igual que administracion/fleetrun-config del clásico).
interface FilaUmbral { uts: string; metrica: 'KM' | 'HORAS'; umbral: string }

const UTS_BASE = ['Nacional', 'Local'];

function desdeConfig(c: Record<string, number>): FilaUmbral[] {
  const claves = Object.keys(c);
  if (!claves.length) return [{ uts: 'Nacional', metrica: 'KM', umbral: '2000' }, { uts: 'Local', metrica: 'HORAS', umbral: '100' }];
  return claves.map(k => {
    const partes = k.split('_');
    const ultimo = partes[partes.length - 1];
    const metrica = partes.length > 1 && (ultimo === 'KM' || ultimo === 'HORAS') ? (partes.pop() as 'KM' | 'HORAS') : 'KM';
    return { uts: partes.join('_'), metrica, umbral: String(c[k]) };
  });
}

export function FleetrunConfigPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const cfg = useUmbralesConfig();
  const puedeEditar = can('cfg_fleetrun.editar', 'cfg_fleetrun.crear');
  const [filas, setFilas] = useState<FilaUmbral[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Se carga una vez por visita: un refresco no debe pisar lo que el usuario está escribiendo
  useEffect(() => { if (cfg.data && filas === null) setFilas(desdeConfig(cfg.data)); }, [cfg.data, filas]);

  const cambiar = (i: number, parche: Partial<FilaUmbral>) => setFilas(prev => (prev ?? []).map((f, k) => (k === i ? { ...f, ...parche } : f)));

  async function guardar() {
    const umbrales: Record<string, number> = {};
    for (const f of filas ?? []) {
      const uts = f.uts.trim().toUpperCase();
      if (!uts) continue;
      const n = parseFloat(f.umbral);
      if (Number.isNaN(n) || n < 0) { setError('Todos los umbrales deben ser numéricos y no negativos.'); return; }
      umbrales[`${uts}_${f.metrica}`] = n;
    }
    setGuardando(true); setError(null);
    try {
      await guardarUmbrales(umbrales);
      haptic('success'); toast('Configuración actualizada');
      await Promise.all([qc.invalidateQueries({ queryKey: ['conf', 'fleetrun-umbrales-cfg'] }), qc.invalidateQueries({ queryKey: ['conf', 'fleetrun-umbrales'] })]);
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  const lista = filas ?? [];
  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Umbrales de Fleetrun"
        subtitle="Cuánto antes del vencimiento una unidad pasa a “Por vencer”"
        actions={puedeEditar ? <Button variant="primary" onClick={guardar} loading={guardando} disabled={filas === null}>Guardar</Button> : undefined} />

      {cfg.isLoading || filas === null ? (cfg.isError ? <Notice tone="error">{errorMessage(cfg.error)}</Notice> : <PageLoader />) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
          <div className="tarjeta__lista" style={{ overflowX: 'auto' }}>
            <table className="inv-kardex" style={{ minWidth: '38rem' }}>
              <thead>
                <tr>
                  <th>UTS</th><th>Métrica</th><th>Vencido</th><th>Por vencer (hasta)</th><th>Vigente</th><th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {lista.map((f, i) => {
                  const opciones = UTS_BASE.some(b => b.toUpperCase() === f.uts.toUpperCase()) ? UTS_BASE : [...UTS_BASE, f.uts];
                  const sel = opciones.find(o => o.toUpperCase() === f.uts.toUpperCase()) ?? f.uts;
                  const u = f.metrica === 'HORAS' ? 'h' : 'km';
                  return (
                    <tr key={i}>
                      <td>
                        <SelectInput value={sel} disabled={!puedeEditar} aria-label="Tipo de UTS" onChange={e => cambiar(i, { uts: e.target.value })}>
                          {opciones.map(o => <option key={o} value={o}>{o}</option>)}
                        </SelectInput>
                      </td>
                      <td>
                        <SelectInput value={f.metrica} disabled={!puedeEditar} aria-label="Métrica" onChange={e => cambiar(i, { metrica: e.target.value as 'KM' | 'HORAS' })}>
                          <option value="KM">Kilómetros</option>
                          <option value="HORAS">Horas</option>
                        </SelectInput>
                      </td>
                      <td><span className="ot-estado ot-estado--red">≤ 0</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                          <span className="ot-estado ot-estado--amber">&gt; 0 y ≤</span>
                          <TextInput type="number" min={0} inputMode="numeric" style={{ width: '6.5rem' }} aria-label={`Umbral en ${u}`} disabled={!puedeEditar}
                            value={f.umbral} onChange={e => cambiar(i, { umbral: e.target.value })} />
                          <span style={{ color: 'var(--label-2)' }}>{u}</span>
                        </div>
                      </td>
                      <td><span className="ot-estado ot-estado--green">&gt; {f.umbral || 0} {u}</span></td>
                      <td>
                        {puedeEditar && (
                          <button type="button" title="Quitar fila" aria-label="Quitar fila" onClick={() => setFilas(lista.filter((_, k) => k !== i))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--label-3)', padding: 4 }}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {puedeEditar && (
            <div><Button variant="secondary" icon={<Plus size={16} />} onClick={() => setFilas([...lista, { uts: 'Nacional', metrica: 'KM', umbral: '2000' }])}>Agregar regla</Button></div>
          )}
          <p className="t-footnote c-secondary">
            Sin una regla para la UTS y métrica de la unidad, Fleetrun usa 1.500 km para Nacional, 100 para Local y 1.000 para el resto.
          </p>
        </div>
      )}
    </Page>
  );
}
