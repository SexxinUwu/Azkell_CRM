import './flota.css';
import '../mantenimiento/mant.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CircleAlert, ClipboardList, FileSpreadsheet, Plus, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { usePlacas } from '../placas/api';
import { Firma, type FirmaHandle } from '../inspecciones/Firma';

interface Acta {
  id: string; numero_inventario: string | null; fecha: string; motivo: string | null; quien_entrega: string; quien_recibe: string;
  clase: string | null; marca: string | null; tipo: string | null; modelo: string | null; placa: string; color: string | null;
  numero_motor: string | null; numero_serie: string | null; kilometraje: number | null; configuracion: string | null; empresa: string | null;
  observaciones: string | null; inventario_partes_json: string | Record<string, string> | null; firma_entrega?: string | null; firma_recibe?: string | null;
}
interface Grupo { id: string; titulo: string; items: Array<string | { id?: string; label?: string; texto?: string }> }

const GRUPOS_BASE: Grupo[] = [
  { id: 'frente_exterior', titulo: 'Frente exterior', items: ['Emblemas', 'Persianas', 'Defensa delantera', 'Luz chica', 'Direccionales'] },
  { id: 'interior_motor', titulo: 'Interior del motor', items: ['Batería', 'Tapa radiador', 'Tapa aceite', 'Varilla de aceite', 'Correas', 'Corneta'] },
  { id: 'frente_superior', titulo: 'Frente superior', items: ['Vidrio panorámico', 'Brazos limpiabrisas', 'Cuchillas limpiabrisas', 'Antena'] },
  { id: 'costados', titulo: 'Costados', items: ['Vidrios laterales', 'Manijas', 'Cerraduras', 'Copas de ruedas', 'Estribos'] },
  { id: 'trasero', titulo: 'Parte trasera', items: ['Defensa trasera', 'Luces de parqueo', 'Reversos', 'Tapa de combustible'] },
  { id: 'interior', titulo: 'Interior de cabina', items: ['Consola', 'Autoradio', 'Guantera', 'Cojinería', 'Tapetes', 'Espejo retrovisor'] },
  { id: 'tablero', titulo: 'Tablero', items: ['Switch de ignición', 'Luces', 'Claxon', 'Tacómetro', 'Velocímetro', 'Medidor de combustible'] },
  { id: 'herramientas', titulo: 'Herramientas', items: ['Gata', 'Llave de ruedas', 'Palancas', 'Kit de herramientas', 'Linterna'] },
  { id: 'seguridad', titulo: 'Seguridad', items: ['Triángulos', 'Extintor', 'Conos', 'Tacos', 'Botiquín'] },
];
const ESTADOS: Array<{ k: 'B' | 'R' | 'M'; label: string }> = [{ k: 'B', label: 'Bueno' }, { k: 'R', label: 'Regular' }, { k: 'M', label: 'Malo' }];
const etiqueta = (it: Grupo['items'][number]) => (typeof it === 'string' ? it : it.label || it.texto || '');
const clave = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '_');
const dia = (s?: string | null) => (s ? String(s).slice(0, 10) : '');
const n = (v: unknown) => Number(v) || 0;

function parsePartes(a: Acta): Record<string, string> {
  try { return typeof a.inventario_partes_json === 'string' ? JSON.parse(a.inventario_partes_json) : (a.inventario_partes_json ?? {}); } catch { return {}; }
}

// Flota › Entrega de vehículos: actas de entrega/recepción con inventario de partes y firmas.
export function EntregaPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [porEliminar, setPorEliminar] = useState<Acta | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const q = useQuery<Acta[]>({
    queryKey: ['flota', 'entrega-vehiculos'],
    queryFn: () => api<{ data?: Acta[] }>('/seguridad/entrega-vehiculos').then(r => r.data ?? []),
    staleTime: 30_000,
  });
  const lista = q.data ?? [];
  const visibles = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return t ? lista.filter(a => [a.id, a.placa, a.quien_entrega, a.quien_recibe, a.empresa, a.marca].some(x => String(x ?? '').toUpperCase().includes(t))) : lista;
  }, [lista, busqueda]);
  const abierta = lista.find(a => a.id === abiertoId) ?? null;
  const puedeCrear = can('entrega_vehiculos.crear', 'seg_unidades.crear', 'placas.crear');
  const puedeEliminar = can('entrega_vehiculos.eliminar', 'seg_unidades.eliminar');
  const refrescar = () => qc.invalidateQueries({ queryKey: ['flota', 'entrega-vehiculos'] });

  async function eliminar() {
    if (!porEliminar) return;
    setOcupado(true);
    try {
      await api(`/seguridad/entrega-vehiculos/${porEliminar.id}`, { method: 'DELETE' });
      haptic('success'); toast('Acta eliminada'); setPorEliminar(null); setAbiertoId(null); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Entrega-de-vehiculos', 'Actas',
        ['Acta', 'Fecha', 'Placa', 'Marca', 'Modelo', 'Empresa', 'Motivo', 'Entrega', 'Recibe', 'Kilometraje', 'Partes calificadas', 'Observaciones'],
        visibles.map(a => [a.numero_inventario || a.id, dia(a.fecha), a.placa, a.marca, a.modelo, a.empresa, a.motivo, a.quien_entrega, a.quien_recibe, n(a.kilometraje),
          Object.keys(parsePartes(a)).length, a.observaciones]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const partes = abierta ? parsePartes(abierta) : {};
  const conteo = (k: string) => Object.values(partes).filter(v => v === k).length;
  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Entrega de vehículos"
        subtitle={q.isLoading ? 'Cargando…' : `${lista.length} actas`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} actas`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'PDF del acta, croquis de daños y plantilla', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('flota/entrega-vehiculos') },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNueva(true)}>Nueva acta</Button>}
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Acta, placa, quien entrega o recibe…" />
        {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda ? <SearchX size={22} /> : <ClipboardList size={22} />} title={busqueda ? 'Sin coincidencias' : 'Sin actas de entrega'}>
            {puedeCrear ? <>Crea la primera con <strong>Nueva acta</strong>.</> : 'Aún no hay actas.'}
          </EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {visibles.map(a => (
              <button key={a.id} type="button" className="mov-fila" onClick={() => { haptic('selection'); setAbiertoId(a.id); }}>
                <div className="mov-fila__icon" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}><ClipboardList size={16} /></div>
                <div className="mov-fila__cuerpo">
                  <span className="mov-fila__titulo">{a.placa} · {[a.marca, a.modelo].filter(Boolean).join(' ') || a.empresa}</span>
                  <span className="mov-fila__sub">{[a.numero_inventario || a.id, dia(a.fecha), `${a.quien_entrega} → ${a.quien_recibe}`].join(' · ')}</span>
                </div>
                <div className="mov-fila__derecha">
                  <span className="mov-fila__monto">{n(a.kilometraje) ? `${n(a.kilometraje).toLocaleString('es-PE')} km` : ''}</span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--label-2)' }}>{a.motivo}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!abierta} onClose={() => setAbiertoId(null)} title={abierta ? `Acta ${abierta.numero_inventario || abierta.id}` : ''}
        footer={abierta && puedeEliminar ? <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => setPorEliminar(abierta)}>Eliminar</Button> : <Button variant="secondary" onClick={() => setAbiertoId(null)}>Cerrar</Button>}>
        {abierta && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div className="inv-metricas">
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--green-ink)' }}>{conteo('B')}</span><span className="inv-metrica__label">Buenas</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--warning">{conteo('R')}</span><span className="inv-metrica__label">Regulares</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--critical">{conteo('M')}</span><span className="inv-metrica__label">Malas</span></div>
            </div>
            <div className="tarjeta__lista">
              {fila('Placa', abierta.placa, true)}{fila('Unidad', [abierta.clase, abierta.marca, abierta.modelo, abierta.tipo].filter(Boolean).join(' · '))}
              {fila('Color', abierta.color)}{fila('Motor', abierta.numero_motor, true)}{fila('Serie / VIN', abierta.numero_serie, true)}{fila('Configuración', abierta.configuracion)}
              {fila('Kilometraje', n(abierta.kilometraje) ? n(abierta.kilometraje).toLocaleString('es-PE') : '', true)}{fila('Empresa', abierta.empresa)}
            </div>
            <div className="tarjeta__lista">
              {fila('Fecha', dia(abierta.fecha), true)}{fila('Motivo', abierta.motivo)}{fila('Entrega', abierta.quien_entrega)}{fila('Recibe', abierta.quien_recibe)}{fila('Observaciones', abierta.observaciones)}
            </div>
            {Object.entries(partes).filter(([, v]) => v === 'M' || v === 'R').length > 0 && (
              <div>
                <p className="tarjeta__grupo-titulo">Partes con observación</p>
                <div className="tarjeta__lista">
                  {Object.entries(partes).filter(([, v]) => v === 'M' || v === 'R').map(([k, v]) => (
                    <div key={k} className="dato"><span className="dato__label">{k.replace(/_/g, ' ')}</span><span className="dato__valor" style={{ color: v === 'M' ? 'var(--red-ink)' : 'var(--amber-ink)', fontWeight: 700 }}>{v === 'M' ? 'Malo' : 'Regular'}</span></div>
                  ))}
                </div>
              </div>
            )}
            {(abierta.firma_entrega || abierta.firma_recibe) && (
              <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
                {abierta.firma_entrega && <figure style={{ margin: 0 }}><img src={abierta.firma_entrega} alt="Firma de quien entrega" style={{ maxWidth: 220, background: '#fff', borderRadius: 8 }} /><figcaption className="t-footnote c-secondary">Entrega</figcaption></figure>}
                {abierta.firma_recibe && <figure style={{ margin: 0 }}><img src={abierta.firma_recibe} alt="Firma de quien recibe" style={{ maxWidth: 220, background: '#fff', borderRadius: 8 }} /><figcaption className="t-footnote c-secondary">Recibe</figcaption></figure>}
              </div>
            )}
          </div>
        )}
      </Sheet>

      <NuevaActa open={nueva} onClose={() => setNueva(false)} onHecho={refrescar} />
      <ConfirmSheet open={!!porEliminar} onClose={() => !ocupado && setPorEliminar(null)} onConfirm={eliminar} loading={ocupado}
        title="¿Eliminar esta acta?" message={porEliminar ? `${porEliminar.numero_inventario || porEliminar.id} · ${porEliminar.placa}` : ''} confirmLabel="Eliminar" />
    </Page>
  );
}

function NuevaActa({ open, onClose, onHecho }: { open: boolean; onClose: () => void; onHecho: () => Promise<unknown> }) {
  const toast = useToast();
  const placas = usePlacas();
  const firmaE = useRef<FirmaHandle>(null);
  const firmaR = useRef<FirmaHandle>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [partes, setPartes] = useState<Record<string, 'B' | 'R' | 'M'>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plantilla = useQuery<Grupo[]>({
    queryKey: ['flota', 'entrega-plantilla'], enabled: open,
    queryFn: () => api<Grupo[]>('/seguridad/template').then(r => (Array.isArray(r) && r.length ? r : GRUPOS_BASE)).catch(() => GRUPOS_BASE),
    staleTime: 10 * 60_000,
  });
  const grupos = plantilla.data ?? GRUPOS_BASE;

  useEffect(() => {
    if (!open) return;
    setError(null); setPartes({}); setAbierto(null);
    setV({ placa: '', fecha: new Date().toISOString().slice(0, 10), motivo: 'ENTREGA DE UNIDAD', quien_entrega: '', quien_recibe: '', kilometraje: '', observaciones: '',
      clase: '', marca: '', modelo: '', tipo: '', color: '', numero_motor: '', numero_serie: '', configuracion: '', empresa: '' });
    firmaE.current?.limpiar(); firmaR.current?.limpiar();
  }, [open]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));

  async function cargarPlaca() {
    const p = (v.placa ?? '').trim().toUpperCase();
    if (!p) return;
    try {
      const r = await api<{ ok?: boolean; data?: Record<string, string | number> }>(`/seguridad/entrega-vehiculos/placa-detalle/${encodeURIComponent(p)}`);
      if (r.ok && r.data) {
        const d = r.data;
        setV(a => ({
          ...a, marca: String(d.marca ?? a.marca), modelo: String(d.modelo ?? a.modelo), tipo: String(d.tipo ?? a.tipo), color: String(d.color ?? a.color),
          numero_motor: String(d.numero_motor ?? a.numero_motor), numero_serie: String(d.numero_serie ?? a.numero_serie),
          configuracion: String(d.configuracion ?? a.configuracion), empresa: String(d.cliente ?? a.empresa), kilometraje: a.kilometraje || String(d.kilometraje ?? ''),
        }));
      }
    } catch { /* la placa puede no tener datos */ }
  }

  const marcadas = Object.keys(partes).length;
  const total = grupos.reduce((s, g) => s + g.items.length, 0);

  async function guardar() {
    if (!v.placa.trim() || !v.quien_entrega.trim() || !v.quien_recibe.trim()) { setError('La placa, quien entrega y quien recibe son obligatorios.'); return; }
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; id?: string; error?: string }>('/seguridad/entrega-vehiculos', {
        method: 'POST',
        body: {
          ...v, kilometraje: parseFloat(v.kilometraje) || 0, inventario_partes_json: partes,
          firma_entrega: firmaE.current && !firmaE.current.vacia() ? firmaE.current.obtener() : null,
          firma_recibe: firmaR.current && !firmaR.current.vacia() ? firmaR.current.obtener() : null,
        },
      });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el acta');
      haptic('success'); toast(`Acta ${r.id ?? ''} registrada`);
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const txt = (k: string, label: string, o?: { type?: string; wide?: boolean; mode?: 'decimal'; list?: string; onBlur?: () => void }) => (
    <Field label={label} wide={o?.wide}>
      {p => <TextInput {...p} type={o?.type ?? 'text'} inputMode={o?.mode} list={o?.list} value={v[k] ?? ''} onBlur={o?.onBlur}
        onChange={e => set(k, k === 'placa' ? e.target.value.toUpperCase() : e.target.value)} />}
    </Field>
  );

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Nueva acta de entrega"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar acta</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <datalist id="ent-placas">{(placas.data ?? []).map(p => <option key={p.placa} value={p.placa} />)}</datalist>
        <div className="form-grid">
          {txt('placa', 'Placa', { list: 'ent-placas', onBlur: cargarPlaca })}
          {txt('fecha', 'Fecha', { type: 'date' })}
          {txt('motivo', 'Motivo', { wide: true })}
          {txt('quien_entrega', 'Quien entrega')}
          {txt('quien_recibe', 'Quien recibe')}
          {txt('kilometraje', 'Kilometraje', { mode: 'decimal' })}
          {txt('empresa', 'Empresa')}
          {txt('marca', 'Marca')}
          {txt('modelo', 'Modelo')}
          {txt('tipo', 'Tipo')}
          {txt('color', 'Color')}
          {txt('configuracion', 'Configuración')}
          {txt('numero_motor', 'N° de motor')}
          {txt('numero_serie', 'N° de serie / VIN')}
        </div>

        <div>
          <p className="tarjeta__grupo-titulo">Inventario de partes ({marcadas}/{total} calificadas)</p>
          <div className="tarjeta__lista">
            {grupos.map(g => {
              const cuantas = g.items.filter(it => partes[clave(etiqueta(it))]).length;
              return (
                <div key={g.id}>
                  <button type="button" className="dato" style={{ flexDirection: 'row', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, alignItems: 'center' }}
                    onClick={() => setAbierto(abierto === g.id ? null : g.id)}>
                    <span className="dato__label" style={{ flex: 1, fontWeight: 600 }}>{g.titulo}</span>
                    <span className="t-footnote c-secondary">{cuantas}/{g.items.length}</span>
                  </button>
                  {abierto === g.id && g.items.map(it => {
                    const k = clave(etiqueta(it));
                    return (
                      <div key={k} className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
                        <span className="dato__valor" style={{ flex: 1, fontSize: '0.875rem', minWidth: '8rem' }}>{etiqueta(it)}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {ESTADOS.map(e => {
                            const sel = partes[k] === e.k;
                            const color = e.k === 'B' ? 'green' : e.k === 'R' ? 'amber' : 'red';
                            return (
                              <button key={e.k} type="button" aria-pressed={sel}
                                onClick={() => setPartes(p => { const n2 = { ...p }; if (sel) delete n2[k]; else n2[k] = e.k; return n2; })}
                                style={{ padding: '4px 10px', borderRadius: 8, border: 0, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                                  background: sel ? `var(--${color}-tint)` : 'var(--fill)', color: sel ? `var(--${color}-ink)` : 'var(--label-2)' }}>
                                {e.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="form-grid">{txt('observaciones', 'Observaciones', { wide: true })}</div>

        <div>
          <p className="tarjeta__grupo-titulo">Firma de quien entrega</p>
          <Firma ref={firmaE} />
        </div>
        <div>
          <p className="tarjeta__grupo-titulo">Firma de quien recibe</p>
          <Firma ref={firmaR} />
        </div>
      </div>
    </Sheet>
  );
}
