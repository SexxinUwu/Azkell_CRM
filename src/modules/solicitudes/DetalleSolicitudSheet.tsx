import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheck, FileText, Shield, X } from 'lucide-react';
import '../../core/ui/acciones-iconos.css';
import '../almacen/entradas.css';
import '../gerencia/gerencia-oc.css';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { formatFechaHoraPe, formatFechaPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { Dato, Grupo, LineaDeVida, type EstadoPaso } from '../almacen/EntradaDetalle';
import { aprobarSolicitud, cancelarSolicitud, claveSolicitudes, rechazarSolicitud, useDetalleSolicitud, type EstadoSolicitud } from './api';

export const claseEstado = (e: EstadoSolicitud) =>
  e === 'APROBADA' ? 'oc-estado--verde' : e === 'RECHAZADA' ? 'badge--red' : e === 'PENDIENTE' ? 'badge--amber' : 'oc-estado--gris';
export const textoEstado = (e: EstadoSolicitud) => (e === 'PENDIENTE' ? 'POR APROBAR' : e);

const ACCIONES: Record<string, string> = { ENVIADA: 'Enviada', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada' };

/**
 * Detalle de una solicitud con la misma ficha que las órdenes de compra.
 * modo «solicitante» (Mis solicitudes): solo se puede cancelar, con motivo; la solicitud no se borra, queda como cancelada en el historial.
 * modo «gerencia» (Aprobación de solicitudes): quien tiene el permiso aprueba o rechaza.
 */
export function DetalleSolicitudSheet({ id, onClose, modo = 'gerencia' }: { id: number | null; onClose: () => void; modo?: 'solicitante' | 'gerencia' }) {
  const q = useDetalleSolicitud(id);
  const qc = useQueryClient();
  const toast = useToast();
  const ultima = useRef<typeof q.data>(undefined);
  if (q.data) ultima.current = q.data;
  const s = q.data ?? ultima.current;
  const [decision, setDecision] = useState<'aprobar' | 'rechazar' | 'cancelar' | null>(null);
  const [comentario, setComentario] = useState('');
  const [errCampo, setErrCampo] = useState<string | undefined>();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refrescar() { await qc.invalidateQueries({ queryKey: claveSolicitudes }); }

  async function confirmar() {
    if (!s || !decision || ocupado) return;
    if (decision !== 'aprobar' && !comentario.trim()) { setErrCampo(decision === 'cancelar' ? 'Escribe el motivo de la cancelación.' : 'Escribe el motivo del rechazo.'); haptic('warning'); return; }
    setOcupado(true); setError(null);
    try {
      if (decision === 'aprobar') {
        await aprobarSolicitud(s.id, comentario.trim());
        toast(`${s.codigo} aprobada: ya quedó registrado`);
      } else if (decision === 'cancelar') {
        await cancelarSolicitud(s.id, comentario.trim());
        toast(`${s.codigo} cancelada: queda en tu historial`);
      } else {
        await rechazarSolicitud(s.id, comentario.trim());
        toast(`${s.codigo} rechazada`);
      }
      haptic(decision === 'aprobar' ? 'success' : 'warning');
      setDecision(null); setComentario('');
      await refrescar();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setOcupado(false); }
  }

  const pendiente = s?.estado === 'PENDIENTE';
  const aprobada = s?.estado === 'APROBADA';
  const rechazada = s?.estado === 'RECHAZADA';
  const cancelada = s?.estado === 'CANCELADA';

  const pasos: Array<{ titulo: string; texto: string; estado: EstadoPaso; icono: ReactNode }> = s ? [
    { titulo: 'Enviada', texto: s.created_at ? formatFechaPe(String(s.created_at).split('T')[0]) : '—', estado: 'hecho', icono: <Check size={16} strokeWidth={2.4} /> },
    { titulo: 'Revisión', texto: s.revisado_por || (pendiente ? 'En espera' : '—'), estado: pendiente ? 'actual' : cancelada ? 'pendiente' : 'hecho', icono: <Shield size={16} /> },
    { titulo: 'Resultado', texto: aprobada ? 'Aprobada y registrada' : rechazada ? 'Rechazada' : cancelada ? 'Cancelada' : 'Pendiente', estado: aprobada ? 'hecho' : rechazada ? 'rojo' : 'pendiente', icono: aprobada ? <CircleCheck size={16} /> : <X size={16} /> },
  ] : [];
  const avance = pasos.reduce((a, p) => a + (p.estado === 'hecho' ? 1 : p.estado === 'actual' ? 0.5 : 0), 0);
  const banner = s && (aprobada
    ? { tono: 'oc-banner--verde', titulo: 'APROBADA', texto: 'Ya se aplicó en el sistema; quien la pidió puede usarlo.' }
    : rechazada ? { tono: 'oc-banner--rojo', titulo: 'RECHAZADA', texto: s.comentario_revision ? `Motivo: ${s.comentario_revision}` : 'La solicitud fue rechazada.' }
    : cancelada ? { tono: 'oc-banner--gris', titulo: 'CANCELADA', texto: s.comentario_revision ? `Cancelada por quien la pidió. Motivo: ${s.comentario_revision}` : 'Quien la pidió la canceló antes de que se revisara.' }
    : { tono: 'oc-banner--gris', titulo: 'POR APROBAR', texto: modo === 'gerencia' && s.puede_aprobar ? 'Está esperando tu decisión.' : 'Está esperando la respuesta de Gerencia. Si ya no la necesitas, puedes cancelarla.' });

  return (
    <>
      <Sheet open={id != null} onClose={onClose} title={s?.codigo ?? 'Solicitud'} ancho ligera
        footer={s && modo === 'gerencia' && s.puede_aprobar ? (
          <>
            <Button variant="danger" onClick={() => { setDecision('rechazar'); setComentario(''); setErrCampo(undefined); setError(null); }}>Rechazar</Button>
            <Button variant="primary" onClick={() => { setDecision('aprobar'); setComentario(''); setErrCampo(undefined); setError(null); }}>Aprobar</Button>
          </>
        ) : s && modo === 'solicitante' && pendiente && s.es_mia ? (
          <Button variant="danger" onClick={() => { setDecision('cancelar'); setComentario(''); setErrCampo(undefined); setError(null); }}>Cancelar solicitud</Button>
        ) : undefined}>
        {s && banner && (
          <div className="oc-ficha">
            <header className="oc-hero">
              <div className="oc-hero__izq">
                <span className="oc-hero__id">{s.tipo_etiqueta} · {s.codigo}</span>
                <h2 className="oc-hero__titulo">{s.titulo}</h2>
                <span className={`badge ${claseEstado(s.estado)}`}>{textoEstado(s.estado)}</span>
              </div>
            </header>

            <div className={`oc-banner ${banner.tono}`} role="status"><strong>{banner.titulo}</strong><span>{banner.texto}</span></div>
            <LineaDeVida pasos={pasos} fraccion={Math.min(1, avance / (pasos.length - 1))} />

            {aprobada && s.resultado?.ver && (
              <Notice tone="success">Se registró como {s.resultado.entidad}. <Link to={s.resultado.ver}>Verlo en el sistema</Link></Notice>
            )}

            <div className="oc-datos">
              <Grupo titulo="Solicitud">
                <Dato etiqueta="Pedida por" valor={s.solicitante} />
                <Dato etiqueta="Fecha" valor={s.created_at ? formatFechaHoraPe(s.created_at) : '—'} />
                {s.motivo && <Dato etiqueta="Motivo del solicitante" valor={s.motivo} ancho />}
              </Grupo>
              <Grupo titulo="Respuesta">
                <Dato etiqueta="Revisada por" valor={s.revisado_por || 'En espera'} extra={s.revisado_en ? formatFechaHoraPe(s.revisado_en) : undefined} />
                <Dato etiqueta={cancelada ? 'Motivo de la cancelación' : 'Comentario'} valor={s.comentario_revision || '—'} ancho />
              </Grupo>
              <Grupo titulo="Datos pedidos" ancho>
                {s.campos.filter(c => c.tipo !== 'oculto' && (s.datos[c.key] ?? '') !== '').map(c => <Dato key={c.key} etiqueta={c.label} valor={s.datos[c.key]} ancho={c.ancho || c.tipo === 'area'} />)}
              </Grupo>
            </div>

            <div>
              <p className="oc-seccion">Historial</p>
              <ul className="sol-historial">
                {s.historial.map((h, i) => (
                  <li key={i}>
                    <FileText size={14} aria-hidden />
                    <span><strong>{ACCIONES[h.accion] ?? h.accion}</strong> · {h.usuario} · {h.created_at ? formatFechaHoraPe(h.created_at) : ''}{h.comentario ? ` — ${h.comentario}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!decision} onClose={() => !ocupado && setDecision(null)} title={decision === 'aprobar' ? 'Aprobar solicitud' : decision === 'cancelar' ? 'Cancelar solicitud' : 'Rechazar solicitud'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)} disabled={ocupado}>Volver</Button>
            <Button variant={decision === 'aprobar' ? 'primary' : 'danger'} loading={ocupado} onClick={confirmar}>
              {decision === 'aprobar' ? 'Aprobar y registrar' : decision === 'cancelar' ? 'Sí, cancelar solicitud' : 'Rechazar solicitud'}
            </Button>
          </>
        }>
        <div className="ga-confirm">
          <p className="ga-confirm__mensaje">
            {decision === 'aprobar'
              ? 'Al aprobar, el sistema registra los datos pedidos (proveedor, cliente o cuenta) y avisa a quien lo pidió.'
              : decision === 'cancelar'
                ? 'La solicitud no se borra: queda en tu historial como cancelada, con el motivo que escribas.'
                : 'Escribe el motivo: quien la pidió lo verá y podrá corregir y enviarla de nuevo.'}
          </p>
          <span className="ga-confirm__codigo">{s?.titulo}</span>
          <div className="ga-confirm__campo">
            <label htmlFor="sol-comentario">{decision === 'aprobar' ? 'Comentario (opcional)' : decision === 'cancelar' ? 'Motivo de la cancelación (obligatorio)' : 'Motivo del rechazo (obligatorio)'}</label>
            <textarea id="sol-comentario" rows={3} value={comentario} placeholder={decision === 'cancelar' ? 'Ej.: Ya no lo necesito / lo pedí por error / el proveedor ya está registrado' : undefined} onChange={e => { setComentario(e.target.value); setErrCampo(undefined); }} aria-invalid={!!errCampo || undefined} />
            {errCampo && <span style={{ fontSize: '0.8rem', color: 'var(--red-ink)' }}>{errCampo}</span>}
          </div>
          {error && <div className="ga-confirm__error"><Notice tone="error">{error}</Notice></div>}
        </div>
      </Sheet>
    </>
  );
}
