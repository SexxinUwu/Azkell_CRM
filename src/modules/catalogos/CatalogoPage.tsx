import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, RefreshCw, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { Combobox, type ComboboxOption } from '../../core/ui/Combobox';
import { Sheet, ConfirmSheet } from '../../core/ui/Sheet';
import { Switch } from '../../core/ui/Switch';
import { TagInput } from '../../core/ui/TagInput';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { nombrePropio } from '../../core/lib/texto';
import { useConductores } from '../conductores/api';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import type { ConfigCatalogo, Registro } from './tipos';
import './catalogos.css';

/** Nombre de un técnico: se elige del directorio de conductores (activos), o se escribe si todavía no está ahí */
function SelectorPersona({ valor, onCambio, ...aria }: {
  valor: string; onCambio: (v: string) => void;
  id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string;
}) {
  const personas = useConductores();
  const opciones = useMemo(() => {
    const lista: ComboboxOption[] = (personas.data ?? [])
      .filter(c => c.estado.trim().toLowerCase() !== 'inactivo')
      .map(c => ({ value: c.nombre, label: nombrePropio(c.nombre), description: c.empresa || undefined }));
    if (valor && !lista.some(o => o.value === valor)) lista.unshift({ value: valor, label: nombrePropio(valor), description: 'No está en el directorio' });
    return lista;
  }, [personas.data, valor]);
  return (
    <Combobox {...aria} options={opciones} value={valor || null} loading={personas.isLoading}
      onChange={v => onCambio(v ?? '')} onCreate={texto => onCambio(texto.trim())} createLabel="Usar"
      placeholder="Busca en el directorio o escribe el nombre" />
  );
}

const plegar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esActivo = (v: unknown) => v === undefined || v === null ? true : v === true || v === 1 || v === '1';

// Pantalla común de catálogos: listado con búsqueda, alta, edición y eliminación.
export function CatalogoPage({ config }: { config: ConfigCatalogo }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const datos = useQuery({ queryKey: ['catalogo', config.clave], queryFn: config.listar });
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<{ registro: Registro | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<Registro | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const p = config.permiso;
  const puedeCrear = can(`${p}.crear`);
  const puedeEditar = can(`${p}.editar`, `${p}.crear`);
  const puedeEliminar = !!config.eliminar && can(`${p}.eliminar`);
  const tieneActivo = config.campos.some(c => c.tipo === 'activo');

  const lista = datos.data ?? [];
  const visibles = useMemo(() => {
    const q = plegar(busqueda.trim());
    return lista.filter(r => !q || plegar([config.nombre(r), config.detalle?.(r) ?? ''].join(' ')).includes(q));
  }, [lista, busqueda, config]);
  const activos = tieneActivo ? lista.filter(r => esActivo(r.activo)).length : lista.length;

  async function eliminar() {
    if (!porEliminar || !config.eliminar) return;
    setOcupado(true);
    try {
      await config.eliminar(porEliminar.id);
      toast(`${config.nombre(porEliminar)} eliminado`);
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['catalogo', config.clave] });
      setPorEliminar(null);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function extra() {
    if (!config.extra) return;
    setOcupado(true);
    try {
      toast(await config.extra.ejecutar());
      await qc.invalidateQueries({ queryKey: ['catalogo', config.clave] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setOcupado(false);
    }
  }

  const nuevo = config.femenino ? 'Nueva' : 'Nuevo';

  return (
    <Page>
      <PageHeader
        eyebrow={config.eyebrow}
        title={config.titulo}
        subtitle={datos.isLoading ? 'Cargando…' : `${lista.length} ${lista.length === 1 ? config.singular.toLowerCase() : config.titulo.toLowerCase()}${tieneActivo ? ` · ${activos} ${config.femenino ? 'activas' : 'activos'}` : ''}`}
        actions={
          <>
            {config.extra && puedeCrear && <MenuOtros opciones={[{ label: config.extra.label, icon: <RefreshCw size={17} />, disabled: ocupado, onSelect: extra }]} />}
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditando({ registro: null })}>{nuevo} {config.singular.toLowerCase()}</Button>}
          </>
        }
      />
      <p className="catalogo-descripcion c-secondary">{config.descripcion}</p>

      {datos.isLoading ? <PageLoader /> : datos.isError ? <Notice tone="error">{errorMessage(datos.error)}</Notice> : (
        <>
          {lista.length > 6 && (
            <div className="toolbar placas-toolbar">
              <div className="placas-toolbar__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder={`Buscar ${config.singular.toLowerCase()}`} /></div>
            </div>
          )}
          {visibles.length === 0 ? (
            <EmptyState icon={lista.length ? <SearchX size={22} /> : <config.icono size={22} />} title={lista.length ? 'Sin resultados' : `Todavía no hay ${config.titulo.toLowerCase()}`}>
              {lista.length ? 'Prueba con otra búsqueda.' : puedeCrear ? `Agrega ${config.femenino ? 'la primera' : 'el primero'} con "${nuevo} ${config.singular.toLowerCase()}".` : ''}
            </EmptyState>
          ) : (
            <motion.ul className="catalogo-lista" layout={!reduce}>
              <AnimatePresence initial={!reduce} mode="popLayout">
                {visibles.map((r, i) => {
                  const bloqueo = config.protegido?.(r) ?? null;
                  const activo = esActivo(r.activo);
                  return (
                    <motion.li key={String(r.id)} layout={!reduce} className={`catalogo-item${activo ? '' : ' catalogo-item--inactivo'}`}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ ...spring, delay: reduce ? 0 : Math.min(i, 14) * 0.02 }}>
                      <span className="catalogo-item__icono"><config.icono size={18} strokeWidth={1.9} /></span>
                      <div className="catalogo-item__texto">
                        <div className="catalogo-item__nombre">{config.nombre(r)}{bloqueo && <Lock size={12} className="c-tertiary" aria-label={bloqueo} />}</div>
                        {config.detalle?.(r) && <div className="catalogo-item__detalle">{config.detalle(r)}</div>}
                      </div>
                      {tieneActivo && !activo && <span className="placa-estado placa-estado--off">Inactivo</span>}
                      <div className="catalogo-item__acciones">
                        {puedeEditar && <button type="button" className="catalogo-accion pressable" onClick={() => setEditando({ registro: r })} aria-label={`Editar ${config.nombre(r)}`}><Pencil size={15} /></button>}
                        {puedeEliminar && !bloqueo && <button type="button" className="catalogo-accion catalogo-accion--peligro pressable" onClick={() => setPorEliminar(r)} aria-label={`Eliminar ${config.nombre(r)}`}><Trash2 size={15} /></button>}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          )}
        </>
      )}

      <FormularioCatalogo config={config} abierto={editando} onClose={() => setEditando(null)} existentes={lista} />
      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !ocupado && setPorEliminar(null)}
        onConfirm={eliminar}
        loading={ocupado}
        title={`¿Eliminar ${porEliminar ? config.nombre(porEliminar) : ''}?`}
        message={`Se quita del catálogo de ${config.titulo.toLowerCase()}. Los registros que ya lo usan no se modifican. Esta acción no se puede deshacer.`}
        confirmLabel={`Eliminar ${config.singular.toLowerCase()}`}
      />
    </Page>
  );
}

function FormularioCatalogo({ config, abierto, onClose, existentes }: {
  config: ConfigCatalogo; abierto: { registro: Registro | null } | null; onClose: () => void; existentes: Registro[];
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [d, setD] = useState<Record<string, unknown>>({});
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const r = abierto?.registro ?? null;

  useEffect(() => {
    if (!abierto) return;
    const base: Record<string, unknown> = {};
    config.campos.forEach(c => { base[c.clave] = r ? r[c.clave] ?? (c.tipo === 'activo' ? 1 : c.tipo === 'etiquetas' ? [] : '') : c.tipo === 'activo' ? 1 : c.tipo === 'etiquetas' ? [] : ''; });
    setD(base); setIntento(false);
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const errores: Record<string, string> = {};
  config.campos.forEach(c => {
    const v = d[c.clave];
    if (c.requerido && !String(v ?? '').trim()) errores[c.clave] = `Escribe ${c.label.toLowerCase()}.`;
    if ((c.tipo === 'numero' || c.tipo === 'moneda') && v !== '' && v != null && isNaN(Number(v))) errores[c.clave] = 'Escribe solo números.';
  });
  const principal = config.campos[0];
  const valorPrincipal = String(d[principal?.clave] ?? '').trim().toUpperCase();
  if (valorPrincipal && existentes.some(x => x.id !== r?.id && config.nombre(x).trim().toUpperCase() === valorPrincipal)) {
    errores[principal.clave] = `Ya existe ${config.femenino ? 'una' : 'un'} ${config.singular.toLowerCase()} con ese nombre.`;
  }

  const cambiar = (clave: string, v: unknown) => setD(x => (config.alCambiar ? config.alCambiar({ ...x, [clave]: v }, clave) : { ...x, [clave]: v }));

  async function guardar() {
    setIntento(true);
    if (Object.keys(errores).length) { haptic('warning'); return; }
    setGuardando(true);
    try {
      const datos = { ...d };
      config.campos.forEach(c => {
        if (c.mayusculas && typeof datos[c.clave] === 'string') datos[c.clave] = (datos[c.clave] as string).trim().toUpperCase();
        if (c.tipo === 'activo') datos[c.clave] = esActivo(datos[c.clave]) ? 1 : 0;
        if ((c.tipo === 'numero' || c.tipo === 'moneda')) datos[c.clave] = datos[c.clave] === '' ? 0 : Number(datos[c.clave]);
      });
      await config.guardar(datos, r?.id);
      toast(r ? 'Cambios guardados' : `${config.singular} agregad${config.femenino ? 'a' : 'o'}`);
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['catalogo', config.clave] });
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet
      open={!!abierto}
      onClose={onClose}
      title={r ? `Editar ${config.singular.toLowerCase()}` : `${config.femenino ? 'Nueva' : 'Nuevo'} ${config.singular.toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando}>{r ? 'Guardar cambios' : 'Agregar'}</Button>
        </>
      }
    >
      <div className="form-grid">
        {config.campos.map(c => {
          const error = intento ? errores[c.clave] ?? null : null;
          if (c.tipo === 'activo') {
            return (
              <div key={c.clave} className="list field--wide">
                <div className="row">
                  <span className="row__main row__title">{c.label}</span>
                  <Switch label={c.label} checked={esActivo(d[c.clave])} onChange={v => cambiar(c.clave, v ? 1 : 0)} />
                </div>
              </div>
            );
          }
          if (c.tipo === 'etiquetas') {
            return (
              <Field key={c.clave} label={c.label} hint={c.ayuda ?? 'Escribe y presiona Enter para agregar'} wide>
                {props => <TagInput {...props} value={(d[c.clave] as string[]) ?? []} onChange={v => cambiar(c.clave, v)}
                  parse={raw => raw.trim().toUpperCase() || null} placeholder={c.placeholder} />}
              </Field>
            );
          }
          return (
            <Field key={c.clave} label={c.label} error={error} hint={c.ayuda} wide={c.ancho || c.tipo === 'textoLargo'}>
              {props => c.tipo === 'persona' ? (
                <SelectorPersona {...props} valor={String(d[c.clave] ?? '')} onCambio={v => cambiar(c.clave, v)} />
              ) : c.tipo === 'textoLargo' ? (
                <textarea {...props} className="input" rows={3} value={String(d[c.clave] ?? '')} placeholder={c.placeholder} onChange={e => cambiar(c.clave, e.target.value)} />
              ) : c.tipo === 'moneda' ? (
                <div className="input-affix">
                  <span className="input-affix__text">S/</span>
                  <TextInput {...props} inputMode="decimal" value={String(d[c.clave] ?? '')} onChange={e => cambiar(c.clave, e.target.value.replace(/[^\d.]/g, ''))} />
                </div>
              ) : (
                <TextInput {...props} inputMode={c.tipo === 'numero' ? 'decimal' : undefined} value={String(d[c.clave] ?? '')} placeholder={c.placeholder} maxLength={c.maxLength}
                  autoFocus={c === config.campos[0]}
                  onChange={e => cambiar(c.clave, c.tipo === 'numero' ? e.target.value.replace(/[^\d.]/g, '') : c.mayusculas ? e.target.value.toUpperCase() : e.target.value)} />
              )}
            </Field>
          );
        })}
      </div>
    </Sheet>
  );
}
