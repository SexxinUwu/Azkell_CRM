import '../flota/documentos.css';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Contact, Eye, FileText, History, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox, type ComboboxOption } from '../../core/ui/Combobox';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import {
  configDoc, corregirDocumento, eliminarDocumento, estadoDoc, etiqueta, nombreCompleto, OPCIONES, subirDocumento, TIPOS_DOC, useDocumentosPersona,
  type DocumentoPersona, type EstadoDoc, type Persona, type TipoDoc,
} from './api';

// Mismos colores de número que los documentos de Flota
const COLORES = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#06b6d4', '#6366f1', '#eab308'];
const COLOR_ESTADO: Record<EstadoDoc, string> = { falta: 'var(--label-2)', vigente: 'var(--green-ink)', por_vencer: 'var(--amber-ink)', vencido: 'var(--red-ink)' };
const esImagen = (d: Pick<DocumentoPersona, 'mime' | 'nombre_archivo'>) => /^image\//i.test(d.mime ?? '') || /\.(jpe?g|png|webp)$/i.test(d.nombre_archivo ?? '');

/** «Faltan 19 días (Por vencer)», «Venció hace 3 días» o «No vence» (si el documento debería vencer y no tiene fecha: «Falta registrar el vencimiento») */
function textoEstado(d: DocumentoPersona): string {
  const { estado, dias } = estadoDoc(d);
  if (dias == null) return configDoc(d.tipo).vence ? 'Falta registrar el vencimiento' : 'No vence';
  if (dias < 0) return `Venció hace ${-dias} ${-dias === 1 ? 'día' : 'días'}`;
  if (dias === 0) return 'Vence hoy';
  return `Faltan ${dias} ${dias === 1 ? 'día' : 'días'} (${estado === 'por_vencer' ? 'Por vencer' : 'Vigente'})`;
}

// RRHH › Personal › Documentos: con la misma apariencia que los documentos de Flota (tarjetas numeradas, estado, ver archivo, actualizar,
// historial y eliminar). Cada documento nuevo se suma al historial; el vigente es el último que se cargó.
export function PersonaDocumentos({ persona: p }: { persona: Persona }) {
  const { can } = useAuth();
  const q = useDocumentosPersona(p.id);
  const [subiendo, setSubiendo] = useState<{ tipo: TipoDoc; doc: DocumentoPersona | null; agregar?: boolean } | null>(null);
  const [viendo, setViendo] = useState<DocumentoPersona | null>(null);
  const [porEliminar, setPorEliminar] = useState<DocumentoPersona | null>(null);

  const puedeEditar = can('rrhh_personal.crear', 'rrhh_personal.editar');
  const puedeEliminar = can('rrhh_personal.eliminar');
  const docs = q.data ?? [];
  const esConductor = p.categoria_rol === 'CONDUCTOR' || /conductor|chofer/i.test(p.cargo ?? '');
  // La licencia se puede cargar a cualquier persona (un administrativo también la tiene); solo se le exige a los conductores
  const tipos = TIPOS_DOC.filter(t => t.tipo !== 'OTRO');
  const otros = docs.filter(d => d.tipo === 'OTRO');

  // Salud: de los documentos que se exigen a esta persona, cuántos están cargados y vigentes (como la «Salud» de las unidades en Flota)
  const exigidos = tipos.filter(t => t.obligatorio && (!t.soloConductor || esConductor));
  const alDia = exigidos.filter(t => { const d = docs.find(x => x.tipo === t.tipo); return d && estadoDoc(d).estado !== 'vencido'; }).length;
  const salud = exigidos.length ? Math.round((alDia / exigidos.length) * 100) : 100;
  const colorSalud = salud >= 100 ? 'var(--green-ink)' : salud >= 50 ? 'var(--amber-ink)' : 'var(--red-ink)';
  const faltan = exigidos.filter(t => !docs.some(x => x.tipo === t.tipo)).length;
  const porVencer = docs.filter(d => estadoDoc(d).estado === 'por_vencer').length;
  const vencidos = docs.filter(d => estadoDoc(d).estado === 'vencido').length;

  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <div className="docp"><Notice tone="error">{errorMessage(q.error)}</Notice></div>;

  return (
    <div className="docp">
      <section className="doc-ficha" aria-label={`Documentos de ${nombreCompleto(p)}`}>
        <header className="doc-ficha__cab">
          <span className="doc-ficha__icono"><Contact size={22} strokeWidth={1.8} /></span>
          <div className="doc-ficha__titulo">
            <div className="doc-ficha__linea">
              <strong className="doc-ficha__persona">{nombreCompleto(p)}</strong>
              {p.categoria_rol && <span className="doc-etiqueta">{etiqueta(OPCIONES.rol, p.categoria_rol).toUpperCase()}</span>}
            </div>
            <span className="doc-ficha__sub">{[p.cargo, `${p.tipo_documento || 'DNI'} ${p.numero_documento}`].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="doc-salud" aria-label={`Salud de documentos ${salud}%`}>
            <span className="doc-salud__texto">Salud</span>
            <span className="doc-salud__barra"><span style={{ width: `${salud}%`, background: colorSalud }} /></span>
            <strong>{salud}%</strong>
          </div>
        </header>

        <div className="doc-alquiler">
          <div className="doc-alquiler__chips">
            <span className="doc-alquiler__chip">{docs.length === 0 ? 'Sin documentos cargados' : `${docs.length} ${docs.length === 1 ? 'documento cargado' : 'documentos cargados'}`}</span>
            {faltan > 0 && <span className="doc-alquiler__chip doc-alquiler__chip--aviso">{faltan} por cargar</span>}
            {porVencer > 0 && <span className="doc-alquiler__chip doc-alquiler__chip--aviso">{porVencer} por vencer</span>}
            {vencidos > 0 && <span className="doc-alquiler__chip doc-alquiler__chip--aviso">{vencidos} vencido{vencidos === 1 ? '' : 's'}</span>}
          </div>
          {puedeEditar && <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setSubiendo({ tipo: 'OTRO', doc: null, agregar: true })}>Agregar documento</Button>}
        </div>

      {docs.length === 0 && <p className="doc-card__vacio" style={{ padding: 'var(--s-4)' }}>Todavía no hay documentos cargados. Usa «Agregar documento» y elige de la lista.</p>}
      <div className="doc-tarjetas">
        {tipos.filter(t => docs.some(d => d.tipo === t.tipo)).map((t, i) => {
          const historial = docs.filter(d => d.tipo === t.tipo); // el servidor los entrega del más nuevo al más antiguo
          return (
            <TarjetaPersonal key={t.tipo} num={i + 1} titulo={t.titulo} color={COLORES[i % COLORES.length]} doc={historial[0] ?? null} anteriores={historial.slice(1)}
              puedeEditar={puedeEditar} puedeEliminar={puedeEliminar}
              onVer={setViendo} onActualizar={() => setSubiendo({ tipo: t.tipo, doc: historial[0] ?? null })} onEliminar={() => historial[0] && setPorEliminar(historial[0])} />
          );
        })}
        {otros.map(d => (
          <TarjetaPersonal key={d.id} num={null} titulo={d.descripcion || d.nombre_archivo || 'Documento'} color="#64748b" doc={d} anteriores={[]}
            puedeEditar={puedeEditar} puedeEliminar={puedeEliminar}
            onVer={setViendo} onActualizar={() => setSubiendo({ tipo: 'OTRO', doc: d })} onEliminar={() => setPorEliminar(d)} />
        ))}
      </div>

      </section>

      <DocumentoSheet personaId={p.id} nombresPropios={otros.map(d => d.descripcion ?? '')} abierto={subiendo} onClose={() => setSubiendo(null)} />
      <VisorDocumento doc={viendo} onClose={() => setViendo(null)} />
      <EliminarDocumento doc={porEliminar} onClose={() => setPorEliminar(null)} />
    </div>
  );
}

interface TarjetaProps {
  num: number | null; titulo: string; color: string; doc: DocumentoPersona | null; anteriores: DocumentoPersona[];
  puedeEditar: boolean; puedeEliminar: boolean;
  onVer: (d: DocumentoPersona) => void; onActualizar: () => void; onEliminar: () => void;
}

function TarjetaPersonal({ num, titulo, color, doc, anteriores, puedeEditar, puedeEliminar, onVer, onActualizar, onEliminar }: TarjetaProps) {
  const [historial, setHistorial] = useState(false);

  if (!doc) {
    return (
      <article className="doc-card doc-card--vacia" style={{ '--doc-color': color } as CSSProperties}>
        <header className="doc-card__cab"><span className="doc-card__num">{num}</span><span className="doc-card__titulo">{titulo}</span></header>
        <p className="doc-card__vacio">Sin registrar</p>
        {puedeEditar && <Button variant="secondary" size="sm" onClick={onActualizar}>Cargar</Button>}
      </article>
    );
  }
  const { estado } = estadoDoc(doc);
  return (
    <article className="doc-card" style={{ '--doc-color': color, '--estado-color': COLOR_ESTADO[estado] } as CSSProperties}>
      <header className="doc-card__cab">
        <span className="doc-card__num">{num ?? <FileText size={12} aria-hidden />}</span>
        <span className="doc-card__titulo">{titulo}</span>
      </header>
      <dl className="doc-card__filas">
        {doc.fecha_emision && <div><dt>Emisión</dt><dd>{formatFechaPe(doc.fecha_emision)}</dd></div>}
        <div><dt>Vencimiento</dt><dd>{doc.fecha_vencimiento ? formatFechaPe(doc.fecha_vencimiento) : '—'}</dd></div>
      </dl>
      <footer className="doc-card__pie">
        <span className="doc-card__estado-etiqueta">Estado</span>
        <span className="doc-card__estado" style={{ color: COLOR_ESTADO[estado] }}>{textoEstado(doc)}</span>
      </footer>
      <div className="doc-card__acciones">
        {doc.url && <Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={() => onVer(doc)}>Ver archivo</Button>}
        {puedeEditar && <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={onActualizar}>Editar</Button>}
        {anteriores.length > 0 && <Button variant="secondary" size="sm" icon={<History size={14} />} aria-expanded={historial} onClick={() => setHistorial(a => !a)}>Historial</Button>}
        {puedeEliminar && <Button variant="plain" size="sm" icon={<Trash2 size={14} />} className="doc-card__eliminar" onClick={onEliminar}>Eliminar</Button>}
      </div>
      {historial && (
        <section className="doc-hist" aria-label={`Historial de ${titulo}`}>
          <ul className="doc-hist__lista">
            {anteriores.map(h => (
              <li key={h.id} className="doc-hist__fila">
                <span className="doc-hist__venc">{h.fecha_vencimiento ? `Vence ${formatFechaPe(h.fecha_vencimiento)}` : 'Sin vencimiento'}</span>
                <span className="doc-hist__detalle">{[h.actualizado_en, h.subido_por && `por ${h.subido_por}`].filter(Boolean).join(' · ')}</span>
                {h.url && <button type="button" className="placas-limpiar" onClick={() => onVer(h)}>Ver</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/** Subir un documento o corregir su vencimiento */
// Nombres que ya se usan: salen siempre en la lista de «Agregar otro documento», aunque la persona aún no tenga ninguno cargado
const OTROS_COMUNES = ['Récord de conductores', 'Certificado de curso de manejo defensivo', 'Carnet de vacunación', 'Certificado de estudios', 'Constancia de trabajo'];
const sinTilde = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const PREFIJO_CUSTOM = 'custom:';

function DocumentoSheet({ personaId, nombresPropios, abierto, onClose }: { personaId: number; nombresPropios: string[]; abierto: { tipo: TipoDoc; doc: DocumentoPersona | null; agregar?: boolean } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [emision, setEmision] = useState('');
  const [vence, setVence] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // «Agregar otro documento»: se elige de la lista de los que se solicitan o se escribe uno nuevo (como en los documentos de Flota)
  const [seleccion, setSeleccion] = useState('');
  const agregar = !!abierto?.agregar;
  const esCustom = seleccion.startsWith(PREFIJO_CUSTOM);
  const nombreCustom = esCustom ? seleccion.slice(PREFIJO_CUSTOM.length).trim() : '';
  const tipo: TipoDoc = agregar ? (!seleccion || esCustom ? 'OTRO' : seleccion as TipoDoc) : (abierto?.tipo ?? 'OTRO');
  const cfg = configDoc(tipo);
  const doc = abierto?.doc ?? null;

  const opcionesDoc = useMemo(() => {
    const o: ComboboxOption[] = TIPOS_DOC.filter(t => t.tipo !== 'OTRO').map(t => ({ value: t.tipo, label: t.titulo, description: t.vence ? 'Vence' : 'No vence' }));
    const vistos = new Set<string>(TIPOS_DOC.map(t => sinTilde(t.titulo)));
    const sumar = (t: string) => { const n = t.trim(); const k = sinTilde(n); if (!n || vistos.has(k)) return; vistos.add(k); o.push({ value: PREFIJO_CUSTOM + n, label: n }); };
    OTROS_COMUNES.forEach(sumar); nombresPropios.forEach(sumar); if (esCustom) sumar(nombreCustom);
    return o;
  }, [nombresPropios, esCustom, nombreCustom]);

  useEffect(() => {
    if (!abierto) return;
    setArchivo(null); setError(null);
    setSeleccion(''); setEmision(abierto.doc?.fecha_emision ?? ''); setVence(abierto.doc?.fecha_vencimiento ?? ''); setDescripcion(abierto.doc?.descripcion ?? '');
  }, [abierto]);

  async function guardar() {
    if (agregar && !seleccion) { setError('Elige el documento o escribe uno nuevo.'); return; }
    const nombre = agregar ? (esCustom ? nombreCustom : '') : descripcion.trim();
    if (tipo === 'OTRO' && !nombre) { setError('Indica qué documento es.'); return; }
    if (emision && vence && vence < emision) { setError('El vencimiento es anterior a la emisión.'); return; }
    if (cfg.vence && !vence) { setError('Indica la fecha de vencimiento.'); return; }
    setGuardando(true); setError(null);
    try {
      // Un archivo nuevo se suma al historial; sin archivo solo se corrigen las fechas del actual
      if (archivo || !doc) await subirDocumento(personaId, { tipo, archivo, fecha_emision: emision, fecha_vencimiento: vence, descripcion: agregar ? nombre : descripcion.trim() });
      else if (doc) await corregirDocumento(doc.id, { fecha_emision: emision, fecha_vencimiento: vence, descripcion: descripcion.trim() });
      haptic('success'); toast(!doc ? 'Documento guardado' : archivo ? 'Documento guardado' : 'Documento actualizado');
      await qc.invalidateQueries({ queryKey: ['personal'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); } finally { setGuardando(false); }
  }

  return (
    <Sheet open={!!abierto} onClose={() => !guardando && onClose()} title={doc ? `Editar · ${cfg.titulo}` : agregar ? 'Agregar documento' : cfg.titulo}
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button><Button variant="primary" onClick={guardar} loading={guardando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {agregar
          ? <Field label="Documento" wide>
              {p => <Combobox {...p} enHoja compacta options={opcionesDoc} value={seleccion || null} placeholder="Busca o escribe un tipo de documento"
                tituloHoja="Tipo de documento" createLabel="Agregar tipo"
                onChange={v => { if (v) setSeleccion(v); }}
                onCreate={t => { const n = t.trim(); if (n) setSeleccion(PREFIJO_CUSTOM + n); }} />}
            </Field>
          : tipo === 'OTRO' && <Field label="¿Qué documento es?" wide>{p => <TextInput {...p} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej.: Certificado de curso de manejo defensivo" />}</Field>}
        <Field label={doc ? 'Nuevo archivo (opcional)' : 'Archivo (PDF o foto)'} wide hint={archivo?.name ?? (doc ? `Actual: ${doc.nombre_archivo ?? 'archivo cargado'}. Elige otro para sumarlo al historial; sin archivo solo se corrigen las fechas` : 'Opcional. Con el celular puedes tomar la foto en el momento')}>
          {p => <ArchivoInput {...p} accept="image/*,application/pdf" capture="environment" onChange={setArchivo} />}
        </Field>
        {(cfg.vence || tipo === 'OTRO') && <Field label="Vence el" hint={cfg.vence ? undefined : 'Opcional: sin fecha, el documento queda permanente'}>{p => <TextInput {...p} type="date" value={vence} onChange={e => setVence(e.target.value)} />}</Field>}
        <Field label="Emitido el">{p => <TextInput {...p} type="date" value={emision} onChange={e => setEmision(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}

/** Ver el documento en grande */
function VisorDocumento({ doc, onClose }: { doc: DocumentoPersona | null; onClose: () => void }) {
  const cfg = doc ? configDoc(doc.tipo) : null;
  return (
    <Sheet open={!!doc} onClose={onClose} title={doc ? (doc.tipo === 'OTRO' ? (doc.descripcion || 'Documento') : cfg!.titulo) : ''}>
      {doc && (
        <div className="docp-visor">
          <p className={`docp-visor__estado docp-visor__estado--${estadoDoc(doc).estado}`}>{textoEstado(doc)}</p>
          {doc.url && (esImagen(doc)
            ? <a href={doc.url} target="_blank" rel="noreferrer"><img className="docp-visor__img" src={doc.url} alt={cfg?.titulo} /></a>
            : <iframe className="docp-visor__pdf" src={doc.url} title={cfg?.titulo} />)}
          <p className="docp-visor__meta">{doc.nombre_archivo}{doc.subido_por ? ` · subido por ${doc.subido_por}` : ''}{doc.actualizado_en ? ` · ${doc.actualizado_en}` : ''}</p>
          {doc.url && <a className="docp-visor__abrir" href={doc.url} target="_blank" rel="noreferrer">Abrir en una pestaña nueva</a>}
        </div>
      )}
    </Sheet>
  );
}

function EliminarDocumento({ doc, onClose }: { doc: DocumentoPersona | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [borrando, setBorrando] = useState(false);
  async function borrar() {
    if (!doc) return;
    setBorrando(true);
    try {
      // Un documento estándar se elimina completo, con su historial; «otros» se eliminan de a uno
      await eliminarDocumento(doc.id, doc.tipo !== 'OTRO');
      haptic('success'); toast('Documento eliminado');
      await qc.invalidateQueries({ queryKey: ['personal'] });
      onClose();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); } finally { setBorrando(false); }
  }
  return (
    <ConfirmSheet open={!!doc} onClose={() => !borrando && onClose()} onConfirm={borrar} loading={borrando} title="¿Eliminar este documento?"
      message={doc ? `${doc.tipo === 'OTRO' ? (doc.descripcion || 'Documento') : configDoc(doc.tipo).titulo}${doc.tipo !== 'OTRO' ? '. Se borra también su historial y los archivos guardados.' : '. Se borra el archivo guardado.'}` : ''} confirmLabel="Eliminar" />
  );
}
