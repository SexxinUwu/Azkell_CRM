import './checklist.css';
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, FileText, MessageCircle, Pencil, Plus, Trash2, Wrench, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { VisorFotos } from '../../core/ui/VisorFotos';
import { Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaHoraPe } from '../../core/lib/format';
import { fallaEstadoColor, useConfigSistemas, type ReporteFalla } from './api';
import { coincide, leerFallas, textoItem, type FallaGuardada, type SistemaCfg } from './fman';

export interface OtGenerada { idOt: string; placa?: string }

/** Lista de OTs generadas, guardada como JSON en el reporte */
export function leerOts(valor: unknown): OtGenerada[] {
  let d = valor;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return []; } }
  return Array.isArray(d) ? (d as OtGenerada[]).filter(o => o && o.idOt) : [];
}

function leerLista(valor: unknown): string[] {
  let d = valor;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return []; } }
  return Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string' && x !== '') : [];
}

/** OT tal como la devuelve /ordenes-trabajo: se usa solo para mostrar su estado actual */
interface OtViva { id_ot?: string | null; ticket_entrada?: string | null; estado?: string | null }

const sinDato = (v: unknown) => (v == null || String(v).trim() === '' ? '—' : String(v));

/**
 * Ficha del reporte con el mismo orden que el detalle del clásico: datos, checklist por sistema
 * (✓ sin falla, ✕ con falla) de tracto y carreta, detalle de falla en tabla, evidencias y OTs con su estado.
 */
export function ChecklistDetalle({ falla, open, puedeEditar, puedeOTs, puedeEliminar, pdfListo, onClose,
  onAgregarFallas, onEditar, onGenerarOTs, onPdf, onWhatsApp, onEliminar }: {
  falla: ReporteFalla; open: boolean; puedeEditar: boolean; puedeOTs: boolean; puedeEliminar: boolean; pdfListo: boolean;
  onClose: () => void; onAgregarFallas?: () => void; onEditar?: () => void; onGenerarOTs?: () => void; onPdf: () => void; onWhatsApp: () => void;
  onEliminar?: () => void;
}) {
  const estadoFinal = /final|anula/i.test(falla.estado);
  const cfg = useConfigSistemas(open);
  const tracto = leerFallas(falla.fallas_tracto_json);
  const remolque = leerFallas(falla.fallas_remolque_json);
  const ots = useMemo(() => leerOts(falla.ots_generadas_json), [falla.ots_generadas_json]);
  const fotos = useMemo(() => leerLista(falla.fotos_json), [falla.fotos_json]);
  // Evidencia: fotos y videos; se abren en el mismo visor que la galería de seguridad
  const [visor, setVisor] = useState<number | null>(null);
  const esVideo = (u: string) => /\.(mp4|mov|webm|m4v|ogv)(\?|$)/i.test(u);
  // Firma y fotos pueden venir de S3 (URL, se firma al abrir) o guardadas como imagen en base64 (se muestran tal cual)
  const firmaRaw = typeof falla.firma_conductor === 'string' && /^(https?:|data:)/.test(falla.firma_conductor) ? falla.firma_conductor : null;
  const urls = [...fotos, ...(firmaRaw ? [firmaRaw] : [])].filter(u => u.startsWith('http'));

  // Evidencias y firma guardadas en S3: se piden con URL firmada al abrir la ficha
  const firmadas = useQuery<Record<string, string>>({
    queryKey: ['flota', 'checklist-firmas', String(falla.id), urls.join('|')],
    enabled: open && urls.length > 0,
    queryFn: async () => (await api<{ signed?: Record<string, string> }>('/mantenimiento/checklist/presign-read', { method: 'POST', body: { urls } })).signed ?? {},
    staleTime: 10 * 60_000,
  });
  const src = (u: string) => (u.startsWith('data:') ? u : firmadas.data?.[u] || u);

  // Estado en vivo de cada OT (como el clásico)
  const otsVivas = useQuery<OtViva[]>({
    queryKey: ['flota', 'ots-estado'],
    enabled: open && ots.length > 0,
    queryFn: async () => {
      const r = await api<OtViva[] | { data?: OtViva[] }>('/ordenes-trabajo');
      return Array.isArray(r) ? r : (r.data ?? []);
    },
    staleTime: 60_000,
  });
  const estadoOt = (idOt: string) => {
    const o = otsVivas.data?.find(x => x.id_ot === idOt || x.ticket_entrada === idOt);
    return o?.estado ?? null;
  };

  const sistemasT: SistemaCfg[] = cfg.data?.tracto ?? [];
  const sistemasR: SistemaCfg[] = cfg.data?.remolque ?? [];
  const hayRemolque = !!falla.placa_remolque || remolque.length > 0;

  /** Sistemas del checklist: cada ítem con ✓ si está bien y ✕ si tiene falla */
  const sistemasHtml = (lista: SistemaCfg[], fallas: FallaGuardada[]) => lista.map(sys => (
    <div key={sys.key} className="ckd-sistema">
      <div className="ckd-sistema__cab">{sys.title || sys.key}</div>
      {sys.items.map(it => {
        const texto = textoItem(it);
        const conFalla = coincide(texto, sys.key, fallas);
        return (
          <div key={texto} className={`ckd-item${conFalla ? ' ckd-item--falla' : ''}`}>
            {conFalla ? <X size={14} aria-label="Con falla" /> : <Check size={14} aria-label="Sin falla" />}
            <span>{texto}</span>
          </div>
        );
      })}
    </div>
  ));

  const datos: Array<[string, ReactNode]> = [
    ['Fecha', sinDato(falla.fecha_reporte ? formatFechaHoraPe(falla.fecha_reporte) : null)],
    ['Placa principal', sinDato(falla.placa_tracto)],
    ['Placa remolque', sinDato(falla.placa_remolque)],
    ['Conductor', sinDato(falla.conductor)],
    ['Procedencia', sinDato(falla.procedencia)],
    ['Orden de viaje', sinDato(falla.orden_viaje)],
    ['Kilometraje (tracto)', falla.km_inicial != null && Number(falla.km_inicial) > 0 ? `${Number(falla.km_inicial).toLocaleString('en-US')} km` : '—'],
    ['Horas de motor (remolque)', falla.horas_motor != null && String(falla.horas_motor) !== '' ? `${falla.horas_motor} h` : '—'],
    ['Registrado por', sinDato(falla.creado_por)],
    ['Registrado el', falla.creado_en ? formatFechaHoraPe(String(falla.creado_en)) : '—'],
  ];

  // Cada falla muestra la placa de su unidad (camión o carreta)
  const filasFalla = [
    ...tracto.map(f => ({ ...f, unidad: falla.placa_tracto || 'TRACTO' })),
    ...remolque.map(f => ({ ...f, unidad: falla.placa_remolque || 'REMOLQUE' })),
  ];

  return (
    <Sheet open={open} onClose={onClose} title={`Reporte de fallas ${falla.folio}`}
      footer={<div className="ckd-acciones">
        {onEditar && puedeEditar && !estadoFinal && <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditar}>Editar reporte</Button>}
        <Button variant="secondary" icon={<FileText size={16} />} onClick={onPdf} disabled={!pdfListo}>PDF F-MAN-001</Button>
        <Button variant="secondary" icon={<MessageCircle size={16} />} onClick={onWhatsApp} disabled={!pdfListo}>WhatsApp</Button>
        {onAgregarFallas && puedeEditar && !estadoFinal && <Button variant="secondary" icon={<Plus size={16} />} onClick={onAgregarFallas}>Agregar fallas</Button>}
        {onGenerarOTs && puedeOTs && !estadoFinal && <Button variant="primary" icon={<Wrench size={16} />} onClick={onGenerarOTs}>Generar OTs</Button>}
        {onEliminar && puedeEliminar && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={onEliminar}>Eliminar</Button>}
      </div>}>
      <div className="ckd">
        {/* 1. Datos del reporte */}
        <section className="ckd-card">
          <div className="ckd-cabeza">
            <h3 className="ckd-titulo"><FileText size={17} /> Datos del reporte</h3>
            <span className={`ot-estado ot-estado--${fallaEstadoColor(falla)}`}>{falla.estado}</span>
          </div>
          <div className="ckd-datos">
            {datos.map(([etiqueta, valor]) => (
              <div key={etiqueta} className="ckd-dato">
                <span className="ckd-dato__etiqueta">{etiqueta}</span>
                <span className="ckd-dato__valor">{valor}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 2. Checklist por sistema */}
        <section className="ckd-card">
          <h3 className="ckd-titulo">Checklist</h3>
          <p className="ckd-subtitulo">Tracto (placa principal)</p>
          {cfg.isError
            ? <Notice tone="error">{errorMessage(cfg.error)}</Notice>
            : <div className="ckd-sistemas">{sistemasHtml(sistemasT, tracto)}</div>}
          {hayRemolque && (
            <>
              <p className="ckd-subtitulo">Carreta / remolque (placa secundaria)</p>
              <div className="ckd-sistemas">{sistemasHtml(sistemasR, remolque)}</div>
            </>
          )}
          {falla.fallas_libres_text && (
            <div className="ckd-dato"><span className="ckd-dato__etiqueta">Observaciones</span><span className="ckd-dato__valor">{falla.fallas_libres_text}</span></div>
          )}
        </section>

        {/* 3. Detalle de falla */}
        <section className="ckd-card">
          <h3 className="ckd-titulo">Detalle de falla</h3>
          <div className="ckd-tabla">
            <table>
              <thead>
                <tr>
                  <th>Fecha reporte</th><th>Unidad</th><th>Sistema</th><th>Ítem</th><th>Descripción de la falla</th>
                </tr>
              </thead>
              <tbody>
                {filasFalla.length === 0 && (
                  <tr><td colSpan={5} style={{ color: 'var(--label-2)' }}>Sin fallas observadas registradas.</td></tr>
                )}
                {filasFalla.map((f, i) => (
                  <tr key={i}>
                    <td className="ckd-mono">{f.fecha || (falla.fecha_reporte ? formatFechaHoraPe(falla.fecha_reporte) : '—')}</td>
                    <td><span className="ckd-placa">{f.unidad}</span></td>
                    <td><span className="ckd-sistema-tag">{(f.sistema && f.sistema !== 'GENERAL' ? f.sistema : 'MANUAL').toUpperCase()}</span></td>
                    <td className="ckd-falla">{f.item || '—'}</td>
                    <td>{f.obs || f.observacion || 'Sin descripción'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. Evidencias */}
        <section className="ckd-card">
          <h3 className="ckd-titulo">Evidencias</h3>
          {fotos.length === 0
            ? <p className="t-footnote c-secondary">Sin evidencias adjuntas.</p>
            : <>
              <div className="ckd-galeria">
                {fotos.map((u, i) => (
                  <button key={i} type="button" onClick={() => setVisor(i)} aria-label={`Ver evidencia ${i + 1}`}>
                    {esVideo(u) ? <video src={src(u)} muted preload="metadata" /> : <img src={src(u)} alt="" loading="lazy" />}
                    {esVideo(u) && <span className="ckd-galeria__play" aria-hidden>▶</span>}
                  </button>
                ))}
              </div>
              <VisorFotos open={visor !== null} indiceInicial={visor ?? 0} onClose={() => setVisor(null)}
                titulo={`Evidencias Fotográficas — ${falla.folio}`}
                fotos={fotos.map((u, i) => ({ url: src(u), titulo: `Evidencia ${i + 1}`, tipo: esVideo(u) ? 'video' as const : 'foto' as const }))} />
            </>}
        </section>

        {/* 5. Órdenes de trabajo generadas, con su estado actual */}
        <section className="ckd-card">
          <h3 className="ckd-titulo">Órdenes de trabajo generadas</h3>
          {ots.length === 0
            ? <p className="t-footnote c-secondary">Sin órdenes de trabajo generadas.</p>
            : (
              <div className="ckd-ots">
                {ots.map(o => {
                  const estado = estadoOt(o.idOt);
                  return (
                    <span key={o.idOt} className="ckd-ot">
                      <span className="ckd-mono">{o.idOt}</span>
                      {o.placa && <span className="ckd-placa">{o.placa}</span>}
                      {estado && <span className="ot-estado ot-estado--blue">{estado}</span>}
                    </span>
                  );
                })}
              </div>
            )}
          {otsVivas.isError && <Notice tone="error">{errorMessage(otsVivas.error)}</Notice>}
        </section>

        {firmadas.isError && <Notice tone="error">{errorMessage(firmadas.error)}</Notice>}
      </div>
    </Sheet>
  );
}
