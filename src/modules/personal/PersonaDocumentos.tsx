import '../flota/documentos.css';
import { useEffect, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Eye, FileText, History, Plus, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { Field, TextInput } from '../../core/ui/Field';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import {
  configDoc, corregirDocumento, eliminarDocumento, estadoDoc, subirDocumento, TIPOS_DOC, useDocumentosPersona,
  type DocumentoPersona, type EstadoDoc, type Persona, type TipoDoc,
} from './api';

// Mismos colores de número que los documentos de Flota
const COLORES = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#06b6d4', '#6366f1', '#eab308'];
const COLOR_ESTADO: Record<EstadoDoc, string> = { falta: 'var(--label-2)', vigente: 'var(--green-ink)', por_vencer: 'var(--amber-ink)', vencido: 'var(--red-ink)' };
const esImagen = (d: Pick<DocumentoPersona, 'mime' | 'nombre_archivo'>) => /^image\//i.test(d.mime ?? '') || /\.(jpe?g|png|webp)$/i.test(d.nombre_archivo ?? '');

/** «Faltan 19 días (Por vencer)», «Venció hace 3 días» o «No vence» */
function textoEstado(d: DocumentoPersona): string {
  const { estado, dias } = estadoDoc(d);
  if (dias == null) return 'No vence';
  if (dias < 0) return `Venció hace ${-dias} ${-dias === 1 ? 'día' : 'días'}`;
  if (dias === 0) return 'Vence hoy';
  return `Faltan ${dias} ${dias === 1 ? 'día' : 'días'} (${estado === 'por_vencer' ? 'Por vencer' : 'Vigente'})`;
}

// RRHH › Personal › Documentos: con la misma apariencia que los documentos de Flota (tarjetas numeradas, estado, ver archivo, actualizar,
// historial y eliminar). Cada documento nuevo se suma al historial; el vigente es el último que se cargó.
export function PersonaDocumentos({ persona: p }: { persona: Persona }) {
  const { can } = useAuth();
  const q = useDocumentosPersona(p.id);
  const [subiendo, setSubiendo] = useState<{ tipo: TipoDoc; doc: DocumentoPersona | null } | null>(null);
  const [viendo, setViendo] = useState<DocumentoPersona | null>(null);
  const [porEliminar, setPorEliminar] = useState<DocumentoPersona | null>(null);

  const puedeEditar = can('rrhh_personal.crear', 'rrhh_personal.editar');
  const puedeEliminar = can('rrhh_personal.eliminar');
  const docs = q.data ?? [];
  const esConductor = p.categoria_rol === 'CONDUCTOR';
  // La licencia solo se pide a los conductores; si alguien más la tiene cargada, igual se muestra
  const tipos = TIPOS_DOC.filter(t => t.tipo !== 'OTRO' && (!t.soloConductor || esConductor || docs.some(d => d.tipo === t.tipo)));
  const otros = docs.filter(d => d.tipo === 'OTRO');

  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <div className="docp"><Notice tone="error">{errorMessage(q.error)}</Notice></div>;

  return (
    <div className="docp">
      <div className="doc-tarjetas">
        {tipos.map((t, i) => {
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

      {puedeEditar && (
        <div className="docp__otros-cab">
          <span className="docp__vacio">Certificados, cursos, memorandos u otros papeles del colaborador.</span>
          <Button variant="secondary" size="sm" icon={<Plus size={15} />} onClick={() => setSubiendo({ tipo: 'OTRO', doc: null })}>Agregar otro documento</Button>
        </div>
      )}

      <DocumentoSheet personaId={p.id} abierto={subiendo} onClose={() => setSubiendo(null)} />
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
        {puedeEditar && <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={onActualizar}>Actualizar</Button>}
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
function DocumentoSheet({ personaId, abierto, onClose }: { personaId: number; abierto: { tipo: TipoDoc; doc: DocumentoPersona | null } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [emision, setEmision] = useState('');
  const [vence, setVence] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tipo = abierto?.tipo ?? 'OTRO';
  const cfg = configDoc(tipo);
  const doc = abierto?.doc ?? null;

  useEffect(() => {
    if (!abierto) return;
    setArchivo(null); setError(null);
    setEmision(abierto.doc?.fecha_emision ?? ''); setVence(abierto.doc?.fecha_vencimiento ?? ''); setDescripcion(abierto.doc?.descripcion ?? '');
  }, [abierto]);

  async function guardar() {
    if (!archivo && !doc) { setError('Elige la foto o el PDF del documento.'); return; }
    if (tipo === 'OTRO' && !descripcion.trim()) { setError('Indica qué documento es.'); return; }
    if (cfg.vence && !vence) { setError('Indica la fecha de vencimiento.'); return; }
    setGuardando(true); setError(null);
    try {
      // Un archivo nuevo se suma al historial; sin archivo solo se corrigen las fechas del actual
      if (archivo) await subirDocumento(personaId, { tipo, archivo, fecha_emision: emision, fecha_vencimiento: vence, descripcion: descripcion.trim() });
      else if (doc) await corregirDocumento(doc.id, { fecha_emision: emision, fecha_vencimiento: vence, descripcion: descripcion.trim() });
      haptic('success'); toast(archivo ? 'Documento guardado' : 'Documento actualizado');
      await qc.invalidateQueries({ queryKey: ['personal'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); } finally { setGuardando(false); }
  }

  return (
    <Sheet open={!!abierto} onClose={() => !guardando && onClose()} title={doc ? `Actualizar · ${cfg.titulo}` : cfg.titulo}
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button><Button variant="primary" onClick={guardar} loading={guardando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label={doc ? 'Nuevo archivo (opcional)' : 'Foto o PDF'} wide hint={archivo?.name ?? (doc ? `Actual: ${doc.nombre_archivo ?? 'archivo cargado'}. Elige otro para sumarlo al historial; sin archivo solo se corrigen las fechas` : 'Con el celular puedes tomar la foto en el momento')}>
          {p => <ArchivoInput {...p} accept="image/*,application/pdf" capture="environment" onChange={setArchivo} />}
        </Field>
        {tipo === 'OTRO' && <Field label="¿Qué documento es?" wide>{p => <TextInput {...p} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej.: Certificado de curso de manejo defensivo" />}</Field>}
        {cfg.vence && <Field label="Vence el">{p => <TextInput {...p} type="date" value={vence} onChange={e => setVence(e.target.value)} />}</Field>}
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
