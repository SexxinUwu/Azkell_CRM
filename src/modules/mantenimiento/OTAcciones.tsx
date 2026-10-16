import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { SelectInput, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import {
  ejecutarAccionOT, liberarRampa, marcarDisponibilidadEnBase, MOTIVOS_PAUSA, otDetalles, otId, pausarOT,
  type OrdenTrabajo,
} from './api';

/** Fecha y hora de hoy en la zona local (YYYY-MM-DD y HH:MM) */
const ahoraLocal = () => {
  const d = new Date();
  return { fecha: d.toLocaleDateString('sv-SE'), hora: d.toTimeString().slice(0, 5) };
};

// ─── Pausar ───────────────────────────────────────────────────────────────────

export function PausarOTSheet({ ot, open, onClose, usuario }: { ot: OrdenTrabajo; open: boolean; onClose: () => void; usuario: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [motivo, setMotivo] = useState<string>(MOTIVOS_PAUSA[0]);
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const texto = motivo === 'Otro' ? detalle.trim() : motivo;
    if (!texto) { toast('Escribe el motivo de la pausa', 'error'); return; }
    setEnviando(true);
    try {
      await pausarOT(otId(ot), texto, usuario);
      toast('OT pausada');
      setMotivo(MOTIVOS_PAUSA[0]);
      setDetalle('');
      onClose();
      await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !enviando && onClose()}
      title={`Pausar OT ${otId(ot)}`}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="accent" onClick={confirmar} loading={enviando}>Pausar</Button>
        </div>
      }
    >
      <div className="ot-form">
        <p className="t-footnote c-secondary">
          Se registra la hora de inicio de la pausa. Al reanudar, la pausa se cierra y su duración queda en la línea de tiempo.
        </p>
        <label className="ot-form__campo">
          <span className="ot-form__etiqueta">Motivo de la pausa *</span>
          <SelectInput value={motivo} onChange={e => setMotivo(e.target.value)}>
            {MOTIVOS_PAUSA.map(m => <option key={m} value={m}>{m}</option>)}
          </SelectInput>
        </label>
        {motivo === 'Otro' && (
          <label className="ot-form__campo">
            <span className="ot-form__etiqueta">Describe el motivo *</span>
            <TextInput value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Motivo de la pausa" />
          </label>
        )}
      </div>
    </Sheet>
  );
}

// ─── Cerrar ───────────────────────────────────────────────────────────────────

export function CerrarOTSheet({ ot, open, onClose, usuario }: { ot: OrdenTrabajo; open: boolean; onClose: () => void; usuario: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const det = otDetalles(ot);
  const [km, setKm] = useState(det.km ? String(det.km) : '');
  const [comentario, setComentario] = useState('');
  const [liberar, setLiberar] = useState(true);
  const [enBase, setEnBase] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);

  const idOt = otId(ot);
  const kmNum = Number(km);
  const kmValido = km.trim() === '' || (Number.isFinite(kmNum) && kmNum >= 0);

  async function confirmar() {
    if (!kmValido) { toast('El kilometraje debe ser un número', 'error'); return; }
    setEnviando(true);
    setAvisos([]);
    try {
      // 1) Cierre de la OT (el servidor pasa a Finalizado y registra fecha de salida)
      if (km.trim() && kmNum !== Number(det.km ?? NaN)) {
        await ejecutarAccionOT(idOt, 'editar', { km: kmNum });
      }
      await ejecutarAccionOT(idOt, 'cerrar', {
        km_actual: km.trim() ? kmNum : undefined,
        comentario_cierre: comentario.trim() || undefined,
        cerrado_por: usuario,
        detalles_cierre: { tecnico_cierre: usuario, obs_cierre: comentario.trim() },
      });
    } catch (err) {
      toast(errorMessage(err), 'error');
      setEnviando(false);
      return;
    }

    // 2) Efectos en otros módulos: si fallan, la OT ya quedó cerrada y se informa qué falta
    const pendientes: string[] = [];
    const { fecha, hora } = ahoraLocal();
    if (liberar && ot.id_rampa) {
      try {
        await liberarRampa(String(ot.id_rampa), { liberado_por: usuario, fecha_salida_real: fecha, hora_salida_real: hora, usuario });
      } catch (err) {
        pendientes.push(`No se pudo liberar la rampa: ${errorMessage(err)}`);
      }
    }
    if (enBase) {
      try {
        const r = await marcarDisponibilidadEnBase(ot.placa, usuario);
        if (r === 'derivada') pendientes.push('La unidad no tiene registro guardado en Disponibilidad; su estado se actualiza solo según rampas y OT.');
      } catch (err) {
        pendientes.push(`No se pudo poner la unidad En Base: ${errorMessage(err)}`);
      }
    }

    await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    await qc.invalidateQueries({ queryKey: ['mant', 'ots-hijas'] });
    await qc.invalidateQueries({ queryKey: ['flota', 'disponibilidad'] });
    await qc.invalidateQueries({ queryKey: ['mant', 'rampas'] });
    setEnviando(false);

    if (pendientes.length) {
      setAvisos(pendientes);
      toast('OT cerrada, con pendientes', 'error');
      return;
    }
    toast(`OT ${idOt} cerrada`);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={() => !enviando && onClose()}
      title={`Cerrar OT ${idOt}`}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>{avisos.length ? 'Cerrar' : 'Cancelar'}</Button>
          {!avisos.length && <Button variant="primary" onClick={confirmar} loading={enviando}>Cerrar OT</Button>}
        </div>
      }
    >
      <div className="ot-form">
        <label className="ot-form__campo">
          <span className="ot-form__etiqueta">Kilometraje de salida</span>
          <TextInput type="number" inputMode="numeric" min="0" value={km} onChange={e => setKm(e.target.value)} placeholder="0" />
        </label>
        <label className="ot-form__campo">
          <span className="ot-form__etiqueta">Observaciones finales de entrega</span>
          <TextInput value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Trabajo entregado, pendientes, recomendaciones…" />
        </label>

        <div className="ot-form__opciones">
          <label className="ot-check">
            <input type="checkbox" checked={liberar} onChange={e => setLiberar(e.target.checked)} disabled={!ot.id_rampa} />
            <span>
              Liberar la rampa en Status de Rampa
              {!ot.id_rampa && <small> · esta OT no tiene rampa asignada</small>}
            </span>
          </label>
          <label className="ot-check">
            <input type="checkbox" checked={enBase} onChange={e => setEnBase(e.target.checked)} />
            <span>Poner la unidad En Base en Disponibilidad</span>
          </label>
        </div>

        {avisos.length > 0 && (
          <Notice tone="error">
            <strong>La OT ya está cerrada.</strong> Pendiente:
            <ul className="ot-form__avisos">{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </Notice>
        )}
      </div>
    </Sheet>
  );
}
