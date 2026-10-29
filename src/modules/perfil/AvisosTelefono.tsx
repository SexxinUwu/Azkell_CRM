import { BellOff, BellRing, RefreshCw, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../core/api/client';
import { activarAvisos, desactivarAvisos, estadoAvisos, probarAvisos, type EstadoAvisos } from '../../core/lib/avisosTelefono';
import { haptic } from '../../core/lib/haptics';

const TITULO: Record<EstadoAvisos, string> = {
  'no-soportado': 'No disponible en este navegador',
  bloqueado: 'Avisos bloqueados',
  pendiente: 'Avisos desactivados',
  inactivo: 'Falta registrar este teléfono',
  activo: 'Avisos activos en este teléfono',
};

const TEXTO: Record<EstadoAvisos, string> = {
  'no-soportado': 'En iPhone, agrega Azkell Fleet a la pantalla de inicio y ábrela desde ahí para recibir avisos.',
  bloqueado: 'El navegador los bloqueó. Para cambiarlo: toca el candado junto a la dirección › Notificaciones › Permitir. En la app instalada de Android: Ajustes del teléfono › Aplicaciones › Azkell Fleet › Notificaciones › Permitir. Luego toca «Ya lo cambié».',
  pendiente: 'Recibe en el teléfono los avisos de órdenes de compra por aprobar, pagos y comprobantes, aunque la app esté cerrada.',
  inactivo: 'El permiso está concedido, pero este teléfono todavía no está registrado para recibir avisos.',
  activo: 'Este teléfono recibe los avisos de órdenes de compra que te corresponden.',
};

/** Avisos en el teléfono (Web Push): muestra el permiso real de este dispositivo y permite activarlo, desactivarlo o probarlo */
export function AvisosTelefono() {
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const refrescar = useCallback(async () => {
    try {
      setEstado(await estadoAvisos());
    } catch (e) {
      setEstado('pendiente');
      setAviso({ tipo: 'error', texto: errorMessage(e) });
    }
  }, []);

  useEffect(() => {
    void refrescar();
    // Si el permiso cambia desde el navegador o los ajustes del teléfono, la pantalla se actualiza sola
    let permiso: PermissionStatus | null = null;
    navigator.permissions?.query({ name: 'notifications' as PermissionName })
      .then(p => { permiso = p; p.onchange = () => { void refrescar(); }; })
      .catch(() => undefined);
    return () => { if (permiso) permiso.onchange = null; };
  }, [refrescar]);

  async function ejecutar(accion: () => Promise<unknown>, ok: string) {
    setOcupado(true);
    setAviso(null);
    try {
      await accion();
      setAviso({ tipo: 'ok', texto: ok });
      haptic('success');
    } catch (e) {
      setAviso({ tipo: 'error', texto: errorMessage(e) });
      haptic('warning');
    } finally {
      setOcupado(false);
      await refrescar();
    }
  }

  if (!estado) return null;

  return (
    <>
      <div className="list__header" style={{ marginTop: 'var(--s-6)' }}>Avisos en el teléfono</div>
      <div className="list">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {estado === 'activo' ? <BellRing size={20} strokeWidth={1.8} /> : <BellOff size={20} strokeWidth={1.8} />}
          <div className="row__main">
            <div className="row__title">{TITULO[estado]}</div>
            <div className="row__subtitle" style={{ whiteSpace: 'normal' }}>{TEXTO[estado]}</div>
          </div>
        </div>

        {(estado === 'pendiente' || estado === 'inactivo') && (
          <button type="button" className="row pressable" disabled={ocupado}
            onClick={() => { haptic('selection'); void ejecutar(activarAvisos, 'Avisos activados en este teléfono.'); }}>
            <BellRing size={20} strokeWidth={1.8} />
            <span className="row__main row__title">{estado === 'pendiente' ? 'Activar avisos' : 'Registrar este teléfono'}</span>
          </button>
        )}

        {estado === 'bloqueado' && (
          <button type="button" className="row pressable" onClick={() => { haptic('selection'); void refrescar(); }}>
            <RefreshCw size={20} strokeWidth={1.8} />
            <span className="row__main row__title">Ya lo cambié</span>
          </button>
        )}

        {estado === 'activo' && (
          <>
            <button type="button" className="row pressable" disabled={ocupado}
              onClick={() => { haptic('selection'); void ejecutar(probarAvisos, 'Te enviamos un aviso de prueba.'); }}>
              <Send size={20} strokeWidth={1.8} />
              <span className="row__main row__title">Enviar aviso de prueba</span>
            </button>
            <button type="button" className="row pressable" disabled={ocupado}
              onClick={() => { haptic('selection'); void ejecutar(desactivarAvisos, 'Este teléfono ya no recibe avisos.'); }}>
              <BellOff size={20} strokeWidth={1.8} />
              <span className="row__main row__title">Desactivar en este teléfono</span>
            </button>
          </>
        )}
      </div>

      {aviso && (
        <p className="t-footnote" style={{ marginTop: 'var(--s-2)', color: aviso.tipo === 'ok' ? 'var(--green-ink)' : 'var(--red-ink)' }}>
          {aviso.texto}
        </p>
      )}
    </>
  );
}
