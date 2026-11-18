import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileText, Plus, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
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

const ETIQUETA_ESTADO: Record<EstadoDoc, string> = { falta: 'Sin cargar', vigente: 'Vigente', por_vencer: 'Por vencer', vencido: 'Vencido' };
const esImagen = (d: Pick<DocumentoPersona, 'mime' | 'nombre_archivo'>) => /^image\//i.test(d.mime ?? '') || /\.(jpe?g|png|webp)$/i.test(d.nombre_archivo ?? '');

/** Texto corto del vencimiento: «Vence el 07/12/2026 · en 19 días» */
function textoVence(d: DocumentoPersona): string {
  if (!d.fecha_vencimiento) return d.fecha_emision ? `Emitido el ${formatFechaPe(d.fecha_emision)}` : 'Sin vencimiento';
  const { estado, dias } = estadoDoc(d);
  const cuando = dias == null ? '' : dias < 0 ? ` · hace ${-dias} ${-dias === 1 ? 'día' : 'días'}` : dias === 0 ? ' · hoy' : estado === 'por_vencer' ? ` · en ${dias} ${dias === 1 ? 'día' : 'días'}` : '';
  return `${estado === 'vencido' ? 'Venció' : 'Vence'} el ${formatFechaPe(d.fecha_vencimiento)}${cuando}`;
}

// RRHH › Personal › Documentos: una tarjeta por documento (DNI por ambas caras, licencia, antecedentes, EMO, SCTR, contrato) y los demás al final.
export function PersonaDocumentos({ persona: p }: { persona: Persona }) {
  const { can } = useAuth();
  const q = useDocumentosPersona(p.id);
  const [subiendo, setSubiendo] = useState<{ tipo: TipoDoc; doc: DocumentoPersona | null } | null>(null);
  const [viendo, setViendo] = useState<DocumentoPersona | null>(null);

  const puedeSubir = can('rrhh_personal.crear', 'rrhh_personal.editar');
  const docs = q.data ?? [];
  const esConductor = p.categoria_rol === 'CONDUCTOR';
  // La licencia solo se pide a los conductores; si alguien más la tiene cargada, igual se muestra
  const tarjetas = TIPOS_DOC.filter(t => t.tipo !== 'OTRO' && (!t.soloConductor || esConductor || docs.some(d => d.tipo === t.tipo)));
  const otros = docs.filter(d => d.tipo === 'OTRO');
  const faltan = tarjetas.filter(t => t.obligatorio && !docs.some(d => d.tipo === t.tipo)).length;
  const porVencer = docs.filter(d => { const e = estadoDoc(d).estado; return e === 'por_vencer' || e === 'vencido'; }).length;

  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <div className="docp"><Notice tone="error">{errorMessage(q.error)}</Notice></div>;

  return (
    <div className="docp">
      <p className="docp__resumen">
        {faltan === 0 && porVencer === 0 ? 'Documentos al día.' : [faltan ? `${faltan} por cargar` : null, porVencer ? `${porVencer} por vencer o vencidos` : null].filter(Boolean).join(' · ')}
      </p>

      <div className="docp__grilla">
        {tarjetas.map(t => {
          const doc = docs.find(d => d.tipo === t.tipo);
          const { estado } = estadoDoc(doc);
          return (
            <button key={t.tipo} type="button" className={`docp-tarjeta docp-tarjeta--${estado}`} disabled={!doc && !puedeSubir}
              onClick={() => { haptic('selection'); if (doc) setViendo(doc); else setSubiendo({ tipo: t.tipo, doc: null }); }}>
              <span className="docp-tarjeta__vista">
                {doc && esImagen(doc) && doc.url ? <img src={doc.url} alt="" loading="lazy" />
                  : doc ? <FileText size={30} strokeWidth={1.6} /> : <UploadCloud size={28} strokeWidth={1.6} />}
              </span>
              <span className="docp-tarjeta__titulo">{t.titulo}</span>
              <span className={`docp-estado docp-estado--${estado}`}>{ETIQUETA_ESTADO[estado]}</span>
              <span className="docp-tarjeta__sub">{doc ? textoVence(doc) : puedeSubir ? 'Toca para subirlo' : 'No cargado'}</span>
            </button>
          );
        })}
      </div>

      <div className="docp__otros-cab">
        <h3>Otros documentos</h3>
        {puedeSubir && <Button variant="plain" size="sm" icon={<Plus size={15} />} onClick={() => setSubiendo({ tipo: 'OTRO', doc: null })}>Agregar</Button>}
      </div>
      {otros.length === 0 ? <p className="docp__vacio">Certificados, cursos, memorandos u otros papeles del colaborador.</p> : (
        <ul className="docp__lista">
          {otros.map(d => (
            <li key={d.id}>
              <button type="button" className="docp-fila" onClick={() => { haptic('selection'); setViendo(d); }}>
                <span className="docp-fila__icono">{esImagen(d) && d.url ? <img src={d.url} alt="" loading="lazy" /> : <FileText size={20} />}</span>
                <span className="docp-fila__texto"><b>{d.descripcion || d.nombre_archivo || 'Documento'}</b><small>{textoVence(d)}</small></span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <DocumentoSheet personaId={p.id} abierto={subiendo} onClose={() => setSubiendo(null)} />
      <VisorDocumento doc={viendo} personaId={p.id} puedeEditar={puedeSubir} puedeEliminar={can('rrhh_personal.eliminar')} onClose={() => setViendo(null)}
        onReemplazar={d => { setViendo(null); setSubiendo({ tipo: d.tipo as TipoDoc, doc: d }); }} />
    </div>
  );
}

/** Subir un documento, reemplazar el archivo o corregir su vencimiento */
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
      if (archivo) await subirDocumento(personaId, { tipo, archivo, fecha_emision: emision, fecha_vencimiento: vence, descripcion: descripcion.trim() });
      else if (doc) await corregirDocumento(doc.id, { fecha_emision: emision, fecha_vencimiento: vence, descripcion: descripcion.trim() });
      haptic('success'); toast(archivo ? 'Documento guardado' : 'Documento actualizado');
      await qc.invalidateQueries({ queryKey: ['personal'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); } finally { setGuardando(false); }
  }

  return (
    <Sheet open={!!abierto} onClose={() => !guardando && onClose()} title={doc ? `Actualizar ${cfg.titulo.toLowerCase()}` : cfg.titulo}
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button><Button variant="primary" onClick={guardar} loading={guardando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label={doc ? 'Nuevo archivo (opcional)' : 'Foto o PDF'} wide hint={archivo?.name ?? (doc ? `Actual: ${doc.nombre_archivo ?? 'archivo cargado'}. Elige otro solo para reemplazarlo` : 'Con el celular puedes tomar la foto en el momento')}>
          {p => <ArchivoInput {...p} accept="image/*,application/pdf" capture="environment" onChange={setArchivo} />}
        </Field>
        {tipo === 'OTRO' && <Field label="¿Qué documento es?" wide>{p => <TextInput {...p} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej.: Certificado de curso de manejo defensivo" />}</Field>}
        {cfg.vence && <Field label="Vence el">{p => <TextInput {...p} type="date" value={vence} onChange={e => setVence(e.target.value)} />}</Field>}
        <Field label="Emitido el">{p => <TextInput {...p} type="date" value={emision} onChange={e => setEmision(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}

/** Ver el documento en grande, con reemplazar y eliminar */
function VisorDocumento({ doc, personaId, puedeEditar, puedeEliminar, onClose, onReemplazar }: {
  doc: DocumentoPersona | null; personaId: number; puedeEditar: boolean; puedeEliminar: boolean; onClose: () => void; onReemplazar: (d: DocumentoPersona) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const cfg = doc ? configDoc(doc.tipo) : null;
  void personaId;

  async function borrar() {
    if (!doc) return;
    setBorrando(true);
    try {
      await eliminarDocumento(doc.id);
      haptic('success'); toast('Documento eliminado');
      await qc.invalidateQueries({ queryKey: ['personal'] });
      setConfirmar(false); onClose();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); } finally { setBorrando(false); }
  }

  return (
    <>
      <Sheet open={!!doc} onClose={onClose} title={doc ? (doc.tipo === 'OTRO' ? (doc.descripcion || 'Documento') : cfg!.titulo) : ''}
        footer={doc && (puedeEditar || puedeEliminar) ? (
          <>
            {puedeEliminar && <Button variant="plain" icon={<Trash2 size={15} />} onClick={() => setConfirmar(true)}>Eliminar</Button>}
            {puedeEditar && <Button variant="primary" icon={<RefreshCw size={15} />} onClick={() => onReemplazar(doc)}>Reemplazar o corregir</Button>}
          </>
        ) : undefined}>
        {doc && (
          <div className="docp-visor">
            <p className={`docp-visor__estado docp-visor__estado--${estadoDoc(doc).estado}`}>{ETIQUETA_ESTADO[estadoDoc(doc).estado]} · {textoVence(doc)}</p>
            {doc.url && (esImagen(doc)
              ? <a href={doc.url} target="_blank" rel="noreferrer"><img className="docp-visor__img" src={doc.url} alt={cfg?.titulo} /></a>
              : <iframe className="docp-visor__pdf" src={doc.url} title={cfg?.titulo} />)}
            <p className="docp-visor__meta">{doc.nombre_archivo}{doc.subido_por ? ` · subido por ${doc.subido_por}` : ''}{doc.actualizado_en ? ` · ${doc.actualizado_en}` : ''}</p>
            {doc.url && <a className="docp-visor__abrir" href={doc.url} target="_blank" rel="noreferrer">Abrir en una pestaña nueva</a>}
          </div>
        )}
      </Sheet>
      <ConfirmSheet open={confirmar} onClose={() => !borrando && setConfirmar(false)} onConfirm={borrar} loading={borrando}
        title="¿Eliminar este documento?" message={doc ? `${cfg?.titulo}${doc.nombre_archivo ? ` · ${doc.nombre_archivo}` : ''}. Se borra el archivo guardado.` : ''} confirmLabel="Eliminar" />
    </>
  );
}
