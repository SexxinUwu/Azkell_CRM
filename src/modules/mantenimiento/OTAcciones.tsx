import { haptic } from '../../core/lib/haptics';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Clock, ClipboardCheck, X } from 'lucide-react';
import { Notice } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import {
  aObjeto, ejecutarAccionOT, liberarRampa, marcarDisponibilidadEnBase, otId, pausarOT, trabajosDeOT, useTrabajosOT,
  type OrdenTrabajo,
} from './api';

/** Fecha y hora de hoy en la zona local (YYYY-MM-DD y HH:MM) */
const ahoraLocal = () => {
  const d = new Date();
  return { fecha: d.toLocaleDateString('sv-SE'), hora: d.toTimeString().slice(0, 5) };
};

// Colores de la pantalla de cierre del clásico
const AZUL = '#0a84ff';
const pastilla = (fondo: string, color: string) => ({
  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' as const, background: fondo, color,
});
const circulo = (fondo: string) => ({
  width: 56, height: 56, borderRadius: 999, border: 0, background: fondo, color: '#fff', cursor: 'pointer',
  display: 'grid', placeItems: 'center' as const,
});

// ─── Pausar: motivo obligatorio en un cuadro de texto, como el clásico ───────

export function PausarOTSheet({ ot, open, onClose, usuario }: { ot: OrdenTrabajo; open: boolean; onClose: () => void; usuario: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const texto = motivo.trim();
    if (!texto) { setError('Escribe el motivo (obligatorio).'); haptic('warning'); return; }
    setEnviando(true);
    try {
      await pausarOT(otId(ot), texto, usuario);
      toast('OT pausada');
      setMotivo('');
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
      title="Motivo de la pausa"
      footer={
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onClose} disabled={enviando}
            style={{ minHeight: 44, borderRadius: 12, border: '1px solid var(--separator)', background: 'var(--surface)', color: 'var(--label)', fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={enviando}
            style={{ minHeight: 44, borderRadius: 12, border: 0, background: AZUL, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            Confirmar
          </button>
        </div>
      }
    >
      <textarea
        className="input"
        rows={4}
        autoFocus
        value={motivo}
        onChange={e => { setMotivo(e.target.value); setError(undefined); }}
        placeholder="Escribe el motivo (obligatorio)…"
        style={{ width: '100%', minHeight: 110, resize: 'vertical' }}
      />
      {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--red-ink)' }}>{error}</p>}
    </Sheet>
  );
}

// ─── Cerrar: checklist de motivos y trabajos, como el clásico ───────────────

/** Texto limpio de un motivo: sin [Reporte …], sin viñetas ni "Falla Manual :" */
function textoMotivo(raw: unknown): string {
  return String(raw ?? '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^[•\-*]\s*/, '')
    .replace(/^(falla manual|manual)\s*:\s*/i, '')
    .trim();
}

const GENERICOS = /^(falla reportada|falla observada|observado en checklist|observación reportada|observacion reportada|sin observación|sin observacion)$/i;

type ItemCierre = { clave: string; texto: string; backlog_id: string | null };

export function CerrarOTSheet({ ot, open, onClose, usuario }: { ot: OrdenTrabajo; open: boolean; onClose: () => void; usuario: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: trabajosTodos } = useTrabajosOT();
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);

  const idOt = otId(ot);

  // Motivos de la falla reportada y trabajos de la OT, sin repetir
  const items = useMemo<ItemCierre[]>(() => {
    const det = aObjeto(ot.detalles_json);
    const lista: ItemCierre[] = [];
    const vistos = new Set<string>();
    const agregar = (texto: string, backlog_id: string | null, clave: string) => {
      const t = texto.trim();
      if (t.length < 2 || GENERICOS.test(t) || vistos.has(t.toUpperCase())) return;
      vistos.add(t.toUpperCase());
      lista.push({ clave, texto: t, backlog_id });
    };
    (Array.isArray(det.motivos_array) ? det.motivos_array : []).forEach((m, i) => {
      const o = aObjeto(m);
      agregar(textoMotivo(o.obs && o.obs !== o.item ? o.obs : (o.motivo || o.item || o.descripcion)), null, `m-${i}`);
    });
    trabajosDeOT(ot, trabajosTodos ?? []).forEach((t, i) => {
      const d = aObjeto(t.detalles_json);
      agregar(textoMotivo(t.trabajo_realizado), d.backlog_id ? String(d.backlog_id) : null, `t-${i}`);
    });
    return lista;
  }, [ot, trabajosTodos]);

  const realizado = (clave: string) => marcados[clave] ?? true;
  const alternar = (clave: string) => setMarcados(p => ({ ...p, [clave]: !(p[clave] ?? true) }));

  async function confirmar() {
    setEnviando(true);
    setAvisos([]);
    const motivos_checklist = items.map(it => ({ texto: it.texto, realizado: realizado(it.clave), backlog_id: it.backlog_id }));
    const { fecha, hora } = ahoraLocal();
    try {
      // El servidor pasa la OT a Finalizado, manda a Backlog lo no realizado y sincroniza el reporte y la rampa
      await ejecutarAccionOT(idOt, 'cerrar', {
        comentario_cierre: comentario.trim() || undefined,
        motivos_checklist,
        cerrado_por: usuario,
        fecha_hora_salida: `${fecha} ${hora}:00`,
        detalles_cierre: { tecnico_cierre: usuario, obs_cierre: comentario.trim() },
      });
    } catch (err) {
      toast(errorMessage(err), 'error');
      setEnviando(false);
      return;
    }

    // Efectos en otros módulos: si fallan, la OT ya quedó cerrada y se informa qué falta
    const pendientes: string[] = [];
    if (ot.id_rampa) {
      try {
        await liberarRampa(String(ot.id_rampa), { liberado_por: usuario, fecha_salida_real: fecha, hora_salida_real: hora, usuario });
      } catch (err) {
        pendientes.push(`No se pudo liberar la rampa: ${errorMessage(err)}`);
      }
    }
    try {
      const r = await marcarDisponibilidadEnBase(ot.placa, usuario);
      if (r === 'derivada') pendientes.push('La unidad no tiene registro guardado en Disponibilidad; su estado se actualiza solo según rampas y OT.');
    } catch (err) {
      pendientes.push(`No se pudo poner la unidad En Base: ${errorMessage(err)}`);
    }

    await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    await qc.invalidateQueries({ queryKey: ['mant', 'ots-hijas'] });
    await qc.invalidateQueries({ queryKey: ['mant', 'trabajos-ot'] });
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
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Cierre de Orden de Trabajo">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <span style={{ width: 48, height: 48, borderRadius: 14, background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
          <ClipboardCheck size={24} />
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--label-2)', background: 'var(--fill-1)', borderRadius: 999, padding: '4px 12px' }}>
          OT {idOt} · Placa: {ot.placa}
        </span>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--label-2)' }}>
          Marca los trabajos realizados. Los no marcados pasarán automáticamente a <b>Backlog</b>.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {items.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--label-2)', textAlign: 'center' }}>No hay trabajos ni motivos registrados.</p>}
        {items.map(it => {
          const ok = realizado(it.clave);
          return (
            <label key={it.clave} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--separator)', background: 'var(--surface)', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={ok} onChange={() => alternar(it.clave)} style={{ width: 18, height: 18, accentColor: '#2563eb' }} />
                <span style={{ flex: 1, fontWeight: 700, textTransform: 'uppercase', fontSize: 13 }}>{it.texto}</span>
                {ok
                  ? <span style={pastilla('#dcfce7', '#15803d')}>Realizado</span>
                  : <span style={pastilla('#fef3c7', '#b45309')}>Pendiente → Backlog</span>}
              </span>
              {!ok && (
                <span style={{ fontSize: 11, color: '#b45309', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 28 }}>
                  <Clock size={12} /> Pasará automáticamente a Backlog de Taller
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--label-2)', marginBottom: 6 }}>
          Observaciones / comentario de cierre
        </div>
        <textarea className="input" rows={3} value={comentario} onChange={e => setComentario(e.target.value)}
          placeholder="Escribe las observaciones de entrega y cierre…" style={{ width: '100%' }} />
      </div>

      {avisos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="error">
            <strong>La OT ya está cerrada.</strong> Pendiente:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </Notice>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20 }}>
        <button type="button" aria-label="Cancelar" onClick={onClose} disabled={enviando} style={circulo('#111827')}>
          <X size={22} />
        </button>
        <button type="button" aria-label="Cerrar OT" onClick={confirmar} disabled={enviando || avisos.length > 0} style={circulo(AZUL)}>
          <CheckCheck size={22} />
        </button>
      </div>
    </Sheet>
  );
}
