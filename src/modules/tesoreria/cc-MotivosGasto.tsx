import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, Plus, SearchX, Tags } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Combobox, type ComboboxOption } from '../../core/ui/Combobox';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { guardarMotivoGasto, useCentrosCostos, useMotivosGastos, type MotivoGasto } from './api';

const clave = (s: string) => s.trim().toUpperCase();

// Motivos de gasto agrupados por motivo principal, con su sub motivo y centro de costos sugerido.
// Sin eliminación: el backend no tiene DELETE /tesoreria/motivos-gastos/:id; se desactiva con Estado.
export function CcMotivosGasto({ arriba }: { arriba: ReactNode }) {
  const q = useMotivosGastos();
  const cc = useCentrosCostos();
  const { can } = useAuth();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<{ item: MotivoGasto | null } | null>(null);

  const puedeEscribir = can('tesoreria_centros_costos.crear', 'tesoreria_caja.crear');
  const lista: MotivoGasto[] = q.data ?? [];
  const centros = cc.data ?? [];
  const nombreCentro = useMemo(() => new Map(centros.map(c => [c.codigo, c.nombre])), [centros]);

  const visibles = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return t ? lista.filter(m => `${m.motivo} ${m.sub_motivo} ${m.centro_costo_codigo ?? ''}`.toUpperCase().includes(t)) : lista;
  }, [lista, busqueda]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { titulo: string; items: MotivoGasto[] }>();
    for (const m of visibles) {
      const k = clave(m.motivo);
      const g = mapa.get(k) ?? { titulo: m.motivo, items: [] };
      g.items.push(m);
      mapa.set(k, g);
    }
    return [...mapa.values()];
  }, [visibles]);

  const principales = new Set(lista.map(m => clave(m.motivo))).size;

  async function exportar() {
    try {
      await exportarExcel('Motivos-de-gasto', 'Motivos de gasto', ['Motivo', 'Sub motivo', 'Centro de costos', 'Estado'],
        visibles.map(m => [m.motivo, m.sub_motivo, m.centro_costo_codigo, m.estado]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Motivos de gasto"
        subtitle={q.isLoading ? 'Cargando…' : `${lista.length} conceptos · ${principales} motivos principales`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} conceptos`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
            ]} />
            {puedeEscribir && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditando({ item: null })}>Nuevo concepto</Button>}
          </>
        }
      />

      {q.isLoading ? <PageLoader /> : q.isError ? (
        <Notice tone="error">{errorMessage(q.error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {arriba}
          {lista.length > 0 && <SearchField value={busqueda} onChange={setBusqueda} placeholder="Motivo, sub motivo o centro…" />}

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <Tags size={22} />} title={busqueda ? 'Sin coincidencias' : 'Sin conceptos de gasto'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : puedeEscribir ? <>Crea el primero con <strong>Nuevo concepto</strong>.</> : 'Aún no hay conceptos registrados.'}
            </EmptyState>
          ) : grupos.map(g => (
            <section key={clave(g.titulo)} aria-label={g.titulo} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
              <h3 style={{
                margin: '0 var(--s-2)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em',
                textTransform: 'uppercase', color: 'var(--label-2)',
              }}>
                {g.titulo} · {g.items.length}
              </h3>
              <div className="tarjeta__lista">
                {g.items.map(m => {
                  const activo = String(m.estado).toUpperCase() === 'ACTIVO';
                  const centro = m.centro_costo_codigo;
                  return (
                    <button key={String(m.id)} type="button" className="mov-fila"
                      style={{ background: 'none', border: 0, font: 'inherit', color: 'inherit', cursor: puedeEscribir ? 'pointer' : 'default' }}
                      onClick={() => { if (puedeEscribir) { haptic('selection'); setEditando({ item: m }); } }}>
                      <div className="mov-fila__icon" style={{ background: 'var(--fill)', color: 'var(--label-2)' }}><Tags size={17} /></div>
                      <div className="mov-fila__cuerpo">
                        <span className="mov-fila__titulo">{m.sub_motivo}</span>
                        <span className="mov-fila__sub">
                          {centro
                            ? `Centro ${centro}${nombreCentro.get(centro) ? ` · ${nombreCentro.get(centro)}` : ''}`
                            : 'Sin centro de costos sugerido'}
                        </span>
                      </div>
                      <div className="mov-fila__derecha">
                        <Badge tone={activo ? 'green' : 'gray'}>{activo ? 'Activo' : 'Inactivo'}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <CcMotivoSheet
        abierto={editando}
        lista={lista}
        centros={centros}
        onClose={() => setEditando(null)}
      />
    </Page>
  );
}

function CcMotivoSheet({ abierto, lista, centros, onClose }: {
  abierto: { item: MotivoGasto | null } | null;
  lista: MotivoGasto[];
  centros: Array<{ codigo: string; nombre: string; estado: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [sub, setSub] = useState('');
  const [centro, setCentro] = useState('');
  const [estado, setEstado] = useState('ACTIVO');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const editando = !!abierto?.item;

  useEffect(() => {
    if (!abierto) return;
    const it = abierto.item;
    setMotivo(it?.motivo ?? ''); setSub(it?.sub_motivo ?? '');
    setCentro(it?.centro_costo_codigo ?? ''); setEstado(it?.estado ?? 'ACTIVO');
    setError(null); setErrs({});
  }, [abierto]);

  // Motivos ya usados (la casilla sugiere, y también permite registrar uno nuevo)
  const opcionesMotivo: ComboboxOption[] = useMemo(() => {
    const unicos = new Map<string, string>();
    for (const m of lista) if (!unicos.has(clave(m.motivo))) unicos.set(clave(m.motivo), m.motivo);
    if (motivo.trim() && !unicos.has(clave(motivo))) unicos.set(clave(motivo), motivo.trim());
    return [...unicos.values()].sort((a, b) => a.localeCompare(b, 'es')).map(x => ({ value: x, label: x }));
  }, [lista, motivo]);

  // Solo centros activos; si el guardado apunta a uno inactivo, se muestra para no perderlo
  const opcionesCentro = centros.filter(c => c.estado === 'ACTIVO' || c.codigo === centro);

  const limpiar = (k: string) => setErrs(e => ({ ...e, [k]: undefined }));

  async function guardar() {
    const e: Record<string, string> = {};
    if (!motivo.trim()) e.motivo = 'Elige o escribe el motivo principal.';
    if (!sub.trim()) e.sub = 'Escribe el sub motivo.';
    setErrs(e);
    if (Object.keys(e).length) { haptic('warning'); return; }

    setEnviando(true); setError(null);
    try {
      await guardarMotivoGasto(abierto?.item?.id ?? null, {
        motivo: motivo.trim(),
        sub_motivo: sub.trim(),
        centro_costo_codigo: centro,
        estado,
      });
      haptic('success'); toast(editando ? 'Concepto actualizado' : 'Concepto creado');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'motivos-gastos'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={!!abierto} onClose={() => !enviando && onClose()}
      title={editando ? 'Editar concepto de gasto' : 'Nuevo concepto de gasto'}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar concepto</Button>
      </>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <Field label="Motivo principal *" wide error={errs.motivo} hint={errs.motivo ? undefined : 'Categoría general, por ejemplo Servicios operativos.'}>
          {p => (
            <Combobox {...p} options={opcionesMotivo} value={motivo.trim() ? motivo : null}
              placeholder="Escribe para buscar o registrar…" createLabel="Usar"
              onChange={v => { setMotivo(v ?? ''); limpiar('motivo'); }}
              onCreate={t => { setMotivo(t); limpiar('motivo'); }} />
          )}
        </Field>

        <Field label="Sub motivo *" wide error={errs.sub} hint={errs.sub ? undefined : 'Concepto detallado, por ejemplo Servicio de grúa pesada.'}>
          {p => <TextInput {...p} value={sub} onChange={e => { setSub(e.target.value); limpiar('sub'); }} />}
        </Field>

        <Field label="Centro de costos sugerido" wide hint="Se propone al registrar un gasto con este motivo.">
          {p => (
            <SelectInput {...p} value={centro} onChange={e => setCentro(e.target.value)}>
              <option value="">Sin sugerencia automática</option>
              {opcionesCentro.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
            </SelectInput>
          )}
        </Field>

        <Field label="Estado">
          {p => (
            <SelectInput {...p} value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
            </SelectInput>
          )}
        </Field>
      </div>
    </Sheet>
  );
}
