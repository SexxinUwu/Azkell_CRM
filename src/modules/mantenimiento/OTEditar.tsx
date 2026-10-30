import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilLine, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, TextInput, SelectInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { Notice } from '../../core/ui/Display';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useCatalogosTaller, ejecutarAccionOT, otDetalles, otId, type MaterialSalida, type OrdenTrabajo } from './api';

type ItemSolicitud = MaterialSalida['items'][number] & { inventario_id?: string | number | null };

// Editar la OT (datos del encabezado y trabajos con su técnico), fechas y kilometraje.
// Misma lógica que modulos/mantenimiento/reportes-ot/logica.js: rotAbrirEditarOT, rotGuardarEdicionOT,
// rotAbrirEditarFechas, rotGuardarFechas y rotEditarKm.

/** Subtipos por tipo de OT (ROT_SUBTIPOS del clásico) */
export const SUBTIPOS_OT: Record<string, string[]> = {
  Preventivo: ['Inspección Pre-PM', 'Campaña', 'Limpieza Integral', 'Rutina', 'Programado', 'Oportuno'],
  Correctivo: ['Falla', 'Varado', 'Programado', 'Garantía', 'Accidentabilidad', 'Mala Operación'],
  Predictivo: ['Por condición', 'Prueba'],
  Proactivo: ['Mejora'],
  Servicio: ['Stock', 'Taller'],
};
const TIPOS_OT = ['Correctivo', 'Preventivo', 'Predictivo', 'Proactivo', 'Servicio'];

/** Nombres del personal (los conductores de la empresa, como el clásico) */
export function usePersonalNombres() {
  return useQuery<string[]>({
    queryKey: ['flota', 'conductores-lista'],
    queryFn: () => api<unknown>('/conductores-lista').then(r =>
      ((Array.isArray(r) ? r : []) as { nombre?: string }[]).map(c => String(c.nombre ?? '').trim()).filter(Boolean)),
    staleTime: 5 * 60_000,
  });
}

const sinNumero = (s: string) => s.replace(/^(?:\d+[.)-]?\s*)+/, '').trim();
const numerado = (s: string) => /^\d+[.)-]?\s/.test(s.trim());

interface FilaTrabajo { key: string; desc: string; tecnico: string }

/** Edición de la OT: tipo, subtipo, supervisor, situación, trabajos con técnico y notas */
export function EditarOTSheet({ ot, open, onClose }: { ot: OrdenTrabajo; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const personal = usePersonalNombres();
  const catalogos = useCatalogosTaller();
  const [tipo, setTipo] = useState('Correctivo');
  const [subtipo, setSubtipo] = useState('');
  const [supervisor, setSupervisor] = useState<string | null>(null);
  const [situacion, setSituacion] = useState('En atención');
  const [filas, setFilas] = useState<FilaTrabajo[]>([]);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [seq, setSeq] = useState(0);

  // Al abrir: los datos de la OT (como rotAbrirEditarOT)
  useEffect(() => {
    if (!open) return;
    const det = otDetalles(ot) as Record<string, unknown>;
    const tecs = Array.isArray(det.tecnicos) ? (det.tecnicos as string[]) : String(det.tecnicos_str ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const trabajosDet = Array.isArray(det.trabajos_det) ? (det.trabajos_det as { tecnico?: string }[]) : [];
    const motivo = String(det.motivo ?? ot.observaciones ?? '');
    const lineas = motivo.split('\n').map(l => l.trim()).filter(Boolean);
    // Las OT viejas guardan las fallas sin número: también son trabajos. Se quitan repetidos y el encabezado del reporte
    const hayNumeradas = lineas.some(numerado);
    const esEncabezado = (l: string) => /^\[Reporte\b/i.test(l) || /^Generado automáticamente/i.test(l) || /^Nota:/i.test(l);
    const fallas = hayNumeradas ? lineas.filter(numerado).map(sinNumero) : lineas.filter(l => !esEncabezado(l)).map(l => l.replace(/^•\s*/, ''));
    const tareas = Array.from(new Map(fallas.map(t => [t.toLowerCase(), t])).values());
    const notasTxt = hayNumeradas ? lineas.filter(l => !numerado(l)).map(l => l.replace(/^Nota:\s*/i, '')).join('\n')
      : lineas.filter(l => /^Nota:/i.test(l)).map(l => l.replace(/^Nota:\s*/i, '')).join('\n');
    const tipoOT = String(det.tipo_ot ?? 'Correctivo');
    const subs = SUBTIPOS_OT[tipoOT] ?? [];
    const contador = { n: 0 };
    const nueva = (desc: string, tecnico: string): FilaTrabajo => ({ key: `t${++contador.n}`, desc, tecnico });
    const base = tareas.map((d, i) => nueva(d, trabajosDet[i]?.tecnico || tecs[i] || tecs[0] || ''));
    setTipo(TIPOS_OT.includes(tipoOT) ? tipoOT : 'Correctivo');
    setSubtipo(String(det.sub_tipo ?? det.subtipo_ot ?? subs[0] ?? ''));
    setSupervisor(String(det.supervisor ?? ot.supervisor ?? '').trim() || null);
    setSituacion(String(det.situacion_inicial ?? ot.situacion ?? 'En atención'));
    setFilas(base.length ? base : [nueva('MANTENIMIENTO / REVISIÓN GENERAL', tecs[0] || '')]);
    setNotas(notasTxt);
    setSeq(contador.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ot]);

  const opcionesPersonal = (personal.data ?? []).map(n => ({ value: n, label: n }));
  const situaciones = (catalogos.data?.situaciones ?? [])
    .map(s => String(s.descripcion ?? s.nombre ?? '').trim()).filter(Boolean);
  const listaSituaciones = situacion && !situaciones.includes(situacion) ? [...situaciones, situacion] : situaciones;
  const subtipos = SUBTIPOS_OT[tipo] ?? [];

  function cambiarTipo(t: string) {
    setTipo(t);
    const subs = SUBTIPOS_OT[t] ?? [];
    setSubtipo(subs[0] ?? '');
  }

  function editarFila(key: string, cambios: Partial<FilaTrabajo>) {
    setFilas(prev => prev.map(f => (f.key === key ? { ...f, ...cambios } : f)));
  }

  async function guardar() {
    // Trabajos y técnicos (rotGuardarEdicionOT)
    const tareasFinales: string[] = [];
    const tecnicosFinales: string[] = [];
    const trabajosDet: { desc: string; tecnico: string }[] = [];
    for (const f of filas) {
      const desc = sinNumero(f.desc.trim());
      if (!desc) continue;
      tareasFinales.push(desc);
      trabajosDet.push({ desc, tecnico: f.tecnico });
      if (f.tecnico && !tecnicosFinales.includes(f.tecnico)) tecnicosFinales.push(f.tecnico);
    }
    let motivo = tareasFinales.map((t, i) => `${i + 1}. ${t}`).join('\n');
    if (notas.trim()) motivo += `\nNota: ${notas.trim()}`;

    setGuardando(true);
    try {
      await ejecutarAccionOT(otId(ot), 'editar', {
        tipo_ot: tipo,
        sub_tipo: subtipo,
        supervisor: supervisor ?? '',
        situacion_inicial: situacion,
        motivo,
        tecnicos: tecnicosFinales,
        trabajos_det: trabajosDet,
      });
      toast('OT actualizada correctamente');
      onClose();
      await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !guardando && onClose()} ancho title="Editar Orden de Trabajo"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={guardando}>Guardar cambios</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
        <p className="field__hint" style={{ margin: 0 }}>Actualizar tipo, supervisor y trabajos · {otId(ot)} · {ot.placa}</p>

        <div className="form-grid">
          <Field label="Tipo de OT (*)">
            {p => <SelectInput {...p} value={tipo} onChange={e => cambiarTipo(e.target.value)}>
              {TIPOS_OT.map(t => <option key={t} value={t}>{t}</option>)}
            </SelectInput>}
          </Field>
          <Field label="Sub tipo de OT (*)">
            {p => <SelectInput {...p} value={subtipo} onChange={e => setSubtipo(e.target.value)} disabled={!subtipos.length}>
              {subtipos.map(s => <option key={s} value={s}>{s}</option>)}
            </SelectInput>}
          </Field>
          <Field label="Supervisor responsable (*)">
            {p => <Combobox {...p} options={opcionesPersonal} value={supervisor} onChange={setSupervisor} placeholder="Seleccione supervisor…" />}
          </Field>
          <Field label="Situación de la unidad (*)">
            {p => <SelectInput {...p} value={situacion} onChange={e => setSituacion(e.target.value)}>
              {listaSituaciones.map(s => <option key={s} value={s}>{s}</option>)}
            </SelectInput>}
          </Field>
        </div>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PencilLine size={14} aria-hidden /> Trabajos / fallas y técnicos asignados
            </span>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />}
              onClick={() => { setFilas(prev => [...prev, { key: `t${seq + 1}`, desc: '', tecnico: '' }]); setSeq(s => s + 1); }}>
              Agregar trabajo
            </Button>
          </div>
          {filas.map((f, idx) => (
            <div key={f.key} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', alignItems: 'end' }}>
              <Field label={`Trabajo ${idx + 1}`}>
                {p => <TextInput {...p} value={f.desc} placeholder="DESCRIPCIÓN DEL TRABAJO…" onChange={e => editarFila(f.key, { desc: e.target.value })} />}
              </Field>
              <Field label="Técnico">
                {p => <Combobox {...p} options={opcionesPersonal} value={f.tecnico || null} onChange={v => editarFila(f.key, { tecnico: v ?? '' })} placeholder="Seleccione técnico…" />}
              </Field>
              <Button variant="plain" iconOnly icon={<Trash2 size={16} />} aria-label={`Quitar trabajo ${idx + 1}`} title="Quitar trabajo"
                onClick={() => setFilas(prev => prev.filter(x => x.key !== f.key))} disabled={filas.length <= 1} />
            </div>
          ))}
        </section>

        <Field label="Notas / observaciones adicionales">
          {p => <textarea {...p} className="input" rows={2} value={notas} placeholder="Detalles u observaciones adicionales de la OT…"
            onChange={e => setNotas(e.target.value)} />}
        </Field>

        {personal.isError && <Notice tone="error">No se pudo cargar la lista de personal.</Notice>}
      </div>
    </Sheet>
  );
}

/** Fechas de inicio y término de la OT (rotAbrirEditarFechas / rotGuardarFechas) */
export function EditarFechasSheet({ ot, open, onClose }: { ot: OrdenTrabajo; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [ini, setIni] = useState('');
  const [fin, setFin] = useState('');
  const [guardando, setGuardando] = useState(false);

  // "2026-10-20 08:30:00" o ISO → "2026-10-20T08:30" (hora local), como formatForInput
  const paraInput = (s: string | null) => {
    if (!s) return '';
    const d = new Date(String(s).replace('Z', '').replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  useEffect(() => {
    if (!open) return;
    setIni(paraInput(ot.fecha_inicio_ot || ot.fecha_ingreso || null));
    setFin(paraInput(ot.fecha_hora_salida || null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ot]);

  async function guardar() {
    if (ini && fin && new Date(ini) > new Date(fin)) {
      toast('La fecha de inicio no puede ser mayor al término.', 'error');
      return;
    }
    const aSql = (v: string) => (v ? (v.length === 16 ? `${v}:00` : v).replace('T', ' ') : null);
    setGuardando(true);
    try {
      await api(`/ordenes-trabajo/${encodeURIComponent(otId(ot))}/fechas`, {
        method: 'PUT',
        body: { fecha_inicio_ot: aSql(ini), fecha_hora_salida: aSql(fin) },
      });
      toast('Fechas actualizadas correctamente.');
      onClose();
      await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    } catch {
      toast('Error al actualizar las fechas.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !guardando && onClose()} title="Editar fechas"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={guardando}>Guardar cambios</Button>
      </>}>
      <div className="form-grid">
        <Field label="Fecha y hora de inicio">
          {p => <TextInput {...p} type="datetime-local" value={ini} onChange={e => setIni(e.target.value)} />}
        </Field>
        <Field label="Fecha y hora de término">
          {p => <TextInput {...p} type="datetime-local" value={fin} onChange={e => setFin(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  );
}

/** Editar las cantidades de una solicitud de material de la OT (rotAbrirEditarMateriales / rotGuardarEdicionMateriales) */
export function EditarSolicitudSheet({ idOt, solicitud, onClose }: { idOt: string; solicitud: MaterialSalida | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [cantidades, setCantidades] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (solicitud) setCantidades(solicitud.items.map(it => String(it.cantidad ?? '')));
  }, [solicitud]);

  async function guardar() {
    if (!solicitud) return;
    if (!solicitud.items.length) {
      toast('La solicitud no puede quedar vacía. Si desea cancelarla, use la opción Eliminar.', 'error');
      return;
    }
    const cants = cantidades.map(c => parseFloat(c));
    if (cants.some(c => Number.isNaN(c) || c <= 0)) {
      toast('Verifique que todas las cantidades sean mayores a 0.', 'error');
      return;
    }
    const items = solicitud.items.map((it, i) => {
      const cu = Number(it.costo_unitario) || 0;
      return {
        inventario_id: (it as ItemSolicitud).inventario_id ?? null,
        descripcion: it.descripcion,
        cantidad: cants[i],
        costo_unitario: cu,
        moneda: 'PEN',
        importe: cants[i] * cu,
      };
    });
    setGuardando(true);
    try {
      await api(`/taller/ot-materiales/${encodeURIComponent(solicitud.id)}`, {
        method: 'PUT',
        body: { accion: 'editar', items, usuario: '' },
      });
      toast('Cantidades actualizadas');
      onClose();
      await qc.invalidateQueries({ queryKey: ['mant', 'ot-materiales', idOt] });
      await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={!!solicitud} onClose={() => !guardando && onClose()} title="Editar cantidades de solicitud"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={guardando}>Guardar cambios</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <p className="field__hint" style={{ margin: 0 }}>Modifique las cantidades solicitadas antes de despachar en almacén</p>
        {(solicitud?.items ?? []).map((it, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px', gap: 10, alignItems: 'end' }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{it.descripcion}</div>
            <Field label="Cantidad">
              {p => <TextInput {...p} type="number" inputMode="decimal" step="0.01" min="0.01" value={cantidades[i] ?? ''}
                onChange={e => setCantidades(prev => prev.map((c, j) => (j === i ? e.target.value : c)))} />}
            </Field>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/** Kilometraje (o horas) de la unidad en la OT (rotEditarKm: PUT accion editar con km) */
export function EditarKmSheet({ ot, open, onClose }: { ot: OrdenTrabajo; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const det = otDetalles(ot);
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) setValor(String(det.km || det.horas_motor || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ot]);

  async function guardar() {
    const n = Number(valor);
    if (valor.trim() === '' || !Number.isFinite(n) || n < 0) {
      toast('Ingresa un kilometraje válido.', 'error');
      return;
    }
    setGuardando(true);
    try {
      await ejecutarAccionOT(otId(ot), 'editar', { km: n });
      toast('Kilometraje actualizado');
      onClose();
      await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !guardando && onClose()} title="Kilometraje de la unidad"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={guardando}>Guardar</Button>
      </>}>
      <Field label="Kilometraje actual">
        {p => <TextInput {...p} type="number" inputMode="numeric" min={0} value={valor} onChange={e => setValor(e.target.value)} />}
      </Field>
    </Sheet>
  );
}
