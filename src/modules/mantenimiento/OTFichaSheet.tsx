import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet, ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useAuth } from '../../core/auth/AuthProvider';
import { ejecutarAccionOT, eliminarOT, otId, type AccionOT, type OrdenTrabajo } from './api';
import { CerrarOTSheet, PausarOTSheet } from './OTAcciones';
import { ETIQUETA_ACCION, OTDetalle } from './OTDetalle';

// Ficha completa de una OT dentro de otra pantalla (la visita de la rampa): mismas acciones que la lista de OT
// (OrdenesTrabajoPage.abrirAccion / ejecutar / confirmarEliminar).
export function OTFichaSheet({ ot, open, onClose, puedeEditar, puedeEliminar }: {
  ot: OrdenTrabajo | null; open: boolean; onClose: () => void; puedeEditar: boolean; puedeEliminar: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [accionSheet, setAccionSheet] = useState<'pausar' | 'cerrar' | null>(null);
  const [confirmando, setConfirmando] = useState<AccionOT | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);

  if (!ot) return null;

  async function ejecutar(accion: AccionOT) {
    setEjecutando(true);
    try {
      await ejecutarAccionOT(otId(ot!), accion);
      toast('OT actualizada');
      haptic('success');
      setConfirmando(null);
      await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEjecutando(false);
    }
  }

  async function confirmarEliminar() {
    setEjecutando(true);
    try {
      await eliminarOT(otId(ot!));
      toast('OT eliminada');
      haptic('success');
      setEliminando(false);
      onClose();
      await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEjecutando(false);
    }
  }

  const abrirAccion = (accion: AccionOT) => {
    if (accion === 'pausar' || accion === 'cerrar') setAccionSheet(accion);
    else setConfirmando(accion);
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} ancho title={`Orden de trabajo ${otId(ot)}`}>
        <OTDetalle ot={ot} onVolver={onClose} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar}
          onAccion={abrirAccion} onEliminar={() => setEliminando(true)} />
      </Sheet>
      {accionSheet === 'pausar' && (
        <PausarOTSheet ot={ot} open onClose={() => setAccionSheet(null)} usuario={user?.name ?? ''} />
      )}
      {accionSheet === 'cerrar' && (
        <CerrarOTSheet ot={ot} open onClose={() => setAccionSheet(null)} usuario={user?.name ?? ''} />
      )}
      <ConfirmSheet
        open={!!confirmando}
        onClose={() => !ejecutando && setConfirmando(null)}
        onConfirm={() => confirmando && ejecutar(confirmando)}
        loading={ejecutando}
        title={confirmando ? `${ETIQUETA_ACCION[confirmando]} — ${otId(ot)}` : ''}
        message={confirmando ? `¿Confirmas "${ETIQUETA_ACCION[confirmando]}" en la OT ${otId(ot)} (placa: ${ot.placa})?` : ''}
        confirmLabel={confirmando ? ETIQUETA_ACCION[confirmando] : 'Confirmar'}
      />
      <ConfirmSheet
        open={eliminando}
        onClose={() => !ejecutando && setEliminando(false)}
        onConfirm={confirmarEliminar}
        loading={ejecutando}
        title={`¿Eliminar OT "${otId(ot)}"?`}
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </>
  );
}
