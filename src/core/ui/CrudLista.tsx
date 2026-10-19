import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, CircleAlert, FileSpreadsheet, Plus, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from './Button';
import { EmptyState, Notice, Page, PageHeader } from './Display';
import { Field, SearchField, SelectInput, TextInput } from './Field';
import { MenuOtros } from './MenuOtros';
import { ConfirmSheet, Sheet } from './Sheet';
import { useToast } from './Toast';
import { errorMessage } from '../api/client';
import { exportarExcel } from '../lib/excel';
import { haptic } from '../lib/haptics';
import { abrirClasico } from '../layout/navigation';

export interface CampoCrud {
  clave: string;
  label: string;
  tipo?: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'bool';
  opciones?: Array<string | { value: string; label: string }>;
  requerido?: boolean;
  wide?: boolean;
  ayuda?: string;
  /** Valor inicial al crear */
  inicial?: string | number | boolean;
  /** Solo se escribe al crear (no se edita después) */
  soloCrear?: boolean;
  /** Transforma el texto antes de guardar (p. ej. mayúsculas) */
  normalizar?: (v: string) => string;
  /** Regla de formato: devuelve el mensaje de error o undefined si el valor es correcto */
  validar?: (v: string) => string | undefined;
}

type Valores = Record<string, string | number | boolean>;

export interface CrudListaProps<T> {
  eyebrow: string;
  titulo: string;
  singular: string;
  icono: ReactNode;
  datos: T[];
  cargando: boolean;
  error?: unknown;
  idDe: (t: T) => string | number;
  campos: CampoCrud[];
  /** Línea principal de cada fila */
  principal: (t: T) => string;
  secundaria?: (t: T) => string;
  /** Texto corto a la derecha (estado, monto…) */
  derecha?: (t: T) => { texto: string; tono?: 'green' | 'amber' | 'red' | 'blue' | 'neutral' } | null;
  buscarEn: (t: T) => string;
  crear?: (v: Valores) => Promise<unknown>;
  editar?: (t: T, v: Valores) => Promise<unknown>;
  eliminar?: (t: T) => Promise<unknown>;
  exportar?: { nombre: string; encabezados: string[]; fila: (t: T) => Array<string | number | null | undefined> };
  clasico?: string;
  /** Extras en el menú Otros */
  extras?: Array<{ label: string; icon?: ReactNode; onSelect: () => void }>;
  /** Contenido arriba de la lista (filtros, KPIs) */
  arriba?: ReactNode;
  mensajeVacio?: string;
}

const TONO_FILA = { green: 'var(--green-ink)', amber: 'var(--amber-ink)', red: 'var(--red-ink)', blue: 'var(--accent-ink)', neutral: 'var(--label-2)' };

/**
 * Lista con alta, edición, eliminación y Excel a partir de una descripción de campos.
 * Sirve para catálogos y maestros simples (centros de costos, motivos, clientes…).
 */
export function CrudLista<T>(p: CrudListaProps<T>) {
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<{ item: T | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<T | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return q ? p.datos.filter(t => p.buscarEn(t).toUpperCase().includes(q)) : p.datos;
  }, [p.datos, p.buscarEn, busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmarEliminar() {
    if (!porEliminar || !p.eliminar) return;
    setEliminando(true);
    try {
      await p.eliminar(porEliminar);
      haptic('success'); toast(`${p.singular} eliminado`); setPorEliminar(null);
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  async function exportar() {
    if (!p.exportar) return;
    try { await exportarExcel(p.exportar.nombre, p.titulo, p.exportar.encabezados, visibles.map(p.exportar.fila)); haptic('success'); }
    catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow={p.eyebrow}
        title={p.titulo}
        subtitle={p.cargando ? 'Cargando…' : `${p.datos.length} registros`}
        actions={
          <>
            <MenuOtros opciones={[
              p.exportar ? { label: 'Exportar Excel', detalle: `${visibles.length} registros`, icon: <FileSpreadsheet size={17} />, onSelect: exportar } : null,
              ...(p.extras ?? []),
              p.clasico ? { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico(p.clasico!) } : null,
            ]} />
            {p.crear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditando({ item: null })}>Nuevo</Button>}
          </>
        }
      />

      {p.cargando ? <PageLoader /> : p.error ? (
        <Notice tone="error">{errorMessage(p.error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {p.arriba}
          {p.datos.length > 0 && <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar…" />}

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : p.icono} title={busqueda ? 'Sin coincidencias' : `Sin ${p.titulo.toLowerCase()}`}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : p.mensajeVacio ?? (p.crear ? <>Crea el primero con <strong>Nuevo</strong>.</> : 'Aún no hay registros.')}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map(t => {
                const d = p.derecha?.(t);
                return (
                  <div key={String(p.idDe(t))} className={`mov-fila${p.editar ? ' pressable' : ''}`} style={{ cursor: p.editar ? 'pointer' : undefined }}
                    onClick={p.editar ? () => { haptic('selection'); setEditando({ item: t }); } : undefined}>
                    <div className="mov-fila__icon" style={{ background: 'var(--fill)', color: 'var(--label-2)' }}>{p.icono}</div>
                    <div className="mov-fila__cuerpo">
                      <span className="mov-fila__titulo">{p.principal(t)}</span>
                      {p.secundaria && <span className="mov-fila__sub">{p.secundaria(t)}</span>}
                    </div>
                    {d && (
                      <div className="mov-fila__derecha">
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: TONO_FILA[d.tono ?? 'neutral'] }}>{d.texto}</span>
                      </div>
                    )}
                    {p.eliminar && (
                      <button type="button" className="placas-limpiar" style={{ color: 'var(--red-ink)', marginLeft: 'var(--s-2)' }}
                        aria-label={`Eliminar ${p.principal(t)}`} onClick={e => { e.stopPropagation(); setPorEliminar(t); }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <FormularioCrud<T>
        abierto={editando}
        singular={p.singular}
        campos={p.campos}
        onClose={() => setEditando(null)}
        onGuardar={async v => {
          if (editando?.item && p.editar) await p.editar(editando.item, v);
          else if (p.crear) await p.crear(v);
        }}
      />

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        title={`¿Eliminar ${p.singular.toLowerCase()}?`}
        message={porEliminar ? p.principal(porEliminar) : ''}
        confirmLabel="Eliminar"
      />
    </Page>
  );
}

function FormularioCrud<T>({ abierto, singular, campos, onClose, onGuardar }: {
  abierto: { item: T | null } | null; singular: string; campos: CampoCrud[]; onClose: () => void; onGuardar: (v: Valores) => Promise<void>;
}) {
  const toast = useToast();
  const [v, setV] = useState<Valores>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const item = abierto?.item as Record<string, unknown> | null | undefined;
  const editando = !!item;

  useEffect(() => {
    if (!abierto) return;
    const ini: Valores = {};
    for (const c of campos) {
      const raw = item ? item[c.clave] : c.inicial;
      if (c.tipo === 'bool') ini[c.clave] = raw === true || raw === 1 || raw === '1';
      else ini[c.clave] = raw == null ? '' : c.tipo === 'date' ? String(raw).split('T')[0] : (raw as string | number);
    }
    setV(ini); setError(null); setErrs({});
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar() {
    const faltan: Record<string, string> = {};
    for (const c of campos) {
      if (c.requerido && !String(v[c.clave] ?? '').trim()) faltan[c.clave] = `${c.label} es obligatorio.`;
      else if (c.validar && String(v[c.clave] ?? '').trim()) { const msg = c.validar(String(v[c.clave]).trim()); if (msg) faltan[c.clave] = msg; }
    }
    setErrs(faltan);
    if (Object.keys(faltan).length) { haptic('warning'); return; }
    const salida: Valores = {};
    for (const c of campos) {
      const x = v[c.clave];
      salida[c.clave] = typeof x === 'string' ? (c.normalizar ? c.normalizar(x.trim()) : x.trim()) : x;
    }
    setEnviando(true); setError(null);
    try {
      await onGuardar(salida);
      haptic('success'); toast(editando ? `${singular} actualizado` : `${singular} creado`);
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={!!abierto} onClose={() => !enviando && onClose()} title={editando ? `Editar ${singular.toLowerCase()}` : `Nuevo ${singular.toLowerCase()}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {campos.map(c => (
          <Field key={c.clave} label={c.label + (c.requerido ? ' *' : '')} wide={c.wide || c.tipo === 'textarea'} hint={c.ayuda} error={errs[c.clave]}>
            {pp => {
              const val = v[c.clave];
              const set = (x: string | number | boolean) => { setV(a => ({ ...a, [c.clave]: x })); setErrs(e => ({ ...e, [c.clave]: undefined })); };
              const bloqueado = editando && c.soloCrear;
              if (c.tipo === 'select') {
                return (
                  <SelectInput {...pp} value={String(val ?? '')} onChange={e => set(e.target.value)} disabled={bloqueado}>
                    {!c.requerido && <option value="">—</option>}
                    {(c.opciones ?? []).map(o => typeof o === 'string'
                      ? <option key={o} value={o}>{o}</option>
                      : <option key={o.value} value={o.value}>{o.label}</option>)}
                  </SelectInput>
                );
              }
              if (c.tipo === 'bool') {
                return (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: '2.75rem' }}>
                    <input type="checkbox" checked={!!val} onChange={e => set(e.target.checked)} /> Sí
                  </label>
                );
              }
              return (
                <TextInput {...pp}
                  type={c.tipo === 'number' ? 'number' : c.tipo === 'date' ? 'date' : 'text'}
                  value={String(val ?? '')} disabled={bloqueado} onChange={e => set(e.target.value)} />
              );
            }}
          </Field>
        ))}
      </div>
    </Sheet>
  );
}
