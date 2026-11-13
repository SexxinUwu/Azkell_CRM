import './seguimiento.css';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Building2, CalendarDays, ExternalLink, Link2, Link2Off, Package, Trash2, Truck, UserRound } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { FichaCard, FichaGrid, PuntosStrip, TituloFicha } from './FichaCards';
import { ETIQUETA_ORIGEN, ETIQUETA_TIPO, fechaGuia, fmtKg, type Guia } from './guiasApi';
import { PastillaGuia } from './PastillaGuia';
import { useUbigeos } from './ubigeos';

/** Detalle de una guía registrada: sus datos, el servicio al que está vinculada y las acciones para vincular, desvincular, anular o eliminar. */
export function GuiaFicha({ id, onClose, puedeEditar, onVincular }: { id: number | null; onClose: () => void; puedeEditar: boolean; onVincular: (g: Guia) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const ubigeos = useUbigeos();
  const [accion, setAccion] = useState<'anular' | 'eliminar' | 'desvincular' | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const q = useQuery<Guia>({
    queryKey: ['operaciones', 'guia', id], enabled: id != null, staleTime: 10_000,
    queryFn: () => api<{ data: Guia }>(`/operaciones/gre/guias/${id}`).then(r => r.data),
  });
  const g = q.data;
  const distrito = (u?: string | null) => (u ? (ubigeos.data ?? []).find(x => x.codigo === u)?.distrito ?? '' : '');

  async function ejecutar() {
    if (!g || !accion) return;
    setOcupado(true);
    try {
      const r = accion === 'eliminar'
        ? await api<{ ok?: boolean; error?: string; message?: string }>(`/operaciones/gre/guias/${g.id}`, { method: 'DELETE' })
        : await api<{ ok?: boolean; error?: string; message?: string }>(`/operaciones/gre/guias/${g.id}/${accion}`, { method: 'POST' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo completar');
      haptic('success'); toast(r.message || 'Listo');
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
      setAccion(null);
      if (accion !== 'desvincular') onClose();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  const MENSAJES = {
    anular: { titulo: '¿Anular esta guía?', texto: 'Queda en el historial, pero su peso sale del servicio y del viaje.', boton: 'Anular' },
    eliminar: { titulo: '¿Eliminar este registro?', texto: 'Se borra del sistema junto con su archivo. Solo para registros equivocados.', boton: 'Eliminar' },
    desvincular: { titulo: '¿Desvincular del servicio?', texto: 'Su peso sale del servicio y del viaje. La guía sigue registrada y la puedes vincular a otro servicio.', boton: 'Desvincular' },
  } as const;

  return (
    <>
      <Sheet ancho open={id != null} onClose={onClose}
        title={g ? <TituloFicha codigo={g.numero_completo} estado={<PastillaGuia estado={g.estado} />} sub={`GRE ${ETIQUETA_TIPO[g.tipo]} · ${ETIQUETA_ORIGEN[g.origen]}`} /> : ''}
        footer={g && puedeEditar && g.estado !== 'ANULADA' ? (
          <>
            {!g.orden_servicio_codigo && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => setAccion('eliminar')}>Eliminar</Button>}
            <Button variant="secondary" icon={<Ban size={16} />} onClick={() => setAccion('anular')}>Anular</Button>
            {g.orden_servicio_codigo
              ? <Button variant="secondary" icon={<Link2Off size={16} />} onClick={() => setAccion('desvincular')}>Desvincular</Button>
              : <Button variant="primary" icon={<Link2 size={16} />} onClick={() => onVincular(g)}>Vincular a un servicio</Button>}
          </>
        ) : <Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
        {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : g && (
          <div className="fd">
            <FichaGrid>
              <FichaCard icono={<Building2 size={17} />} label="Remitente" valor={g.remitente_nombre || g.remitente_ruc || '—'} sub={g.remitente_ruc && g.remitente_nombre ? `RUC ${g.remitente_ruc}` : null} />
              <FichaCard icono={<UserRound size={17} />} label="Destinatario" valor={g.destinatario_nombre || g.destinatario_doc || '—'} sub={g.destinatario_doc && g.destinatario_nombre ? g.destinatario_doc : null} />
              <FichaCard icono={<Package size={17} />} label="Peso bruto" valor={Number(g.peso_kg) > 0 ? fmtKg(g.peso_kg) : 'Sin peso'} sub={[g.bultos ? `${g.bultos} bultos` : null, g.descripcion].filter(Boolean).join(' · ') || null} />
              <FichaCard icono={<CalendarDays size={17} />} label="Fechas" valor={`Emitida ${fechaGuia(g.fecha_emision)}`} sub={g.fecha_traslado ? `Traslado ${fechaGuia(g.fecha_traslado)}` : null} />
              <FichaCard icono={<Truck size={17} />} label="Transporte" valor={g.placa || g.transportista_nombre || 'No indicado'} sub={[g.conductor_nombre, g.transportista_nombre && g.placa ? g.transportista_nombre : null, g.modalidad === 'PUBLICO' ? 'Transporte público' : g.modalidad === 'PRIVADO' ? 'Transporte privado' : null].filter(Boolean).join(' · ') || null} />
              <FichaCard icono={<Link2 size={17} />} label="Servicio vinculado" valor={g.orden_servicio_codigo || 'Sin vincular'} sub={g.servicio_cliente || (g.orden_servicio_codigo ? null : 'Vincúlala para que su peso pase al servicio y al viaje')} />
            </FichaGrid>
            <PuntosStrip
              carga={{ titulo: distrito(g.partida_ubigeo) || null, detalle: g.partida_direccion, extra: g.partida_ubigeo ? `Ubigeo ${g.partida_ubigeo}` : null }}
              descarga={{ titulo: distrito(g.llegada_ubigeo) || null, detalle: g.llegada_direccion, extra: g.llegada_ubigeo ? `Ubigeo ${g.llegada_ubigeo}` : null }} />
            {!!g.trae_transporte && <Notice tone="accent">Esta guía ya trae los datos del transporte. Según la norma de SUNAT, puede que no haga falta emitir nuestra GRE Transportista: confírmalo antes de decidir.</Notice>}
            {g.archivo_ver_url && <a className="gv__archivo" href={g.archivo_ver_url} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden /> Ver el archivo original{g.archivo_nombre ? ` (${g.archivo_nombre})` : ''}</a>}
            <p className="os-nota">Registrada {g.creado_en ?? ''}{g.usuario ? ` por ${g.usuario}` : ''} · {g.fuente === 'XML' ? 'leída del XML' : g.fuente === 'IA' ? 'leída con IA y confirmada' : 'ingresada a mano'}</p>
          </div>
        )}
      </Sheet>
      <ConfirmSheet open={!!accion} onClose={() => !ocupado && setAccion(null)} onConfirm={ejecutar} loading={ocupado}
        title={accion ? MENSAJES[accion].titulo : ''} message={accion ? MENSAJES[accion].texto : ''} confirmLabel={accion ? MENSAJES[accion].boton : ''} />
    </>
  );
}
