import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useCatalogosTaller } from '../mantenimiento/api';
import { SUBTIPOS_OT as SUBTIPOS, TIPOS_OT } from '../mantenimiento/tipos-ot';
import { useUnidadesGps, type ReporteFalla, type UnidadMapa } from './api';

type Unidad = 'Tracto' | 'Remolque';

interface FallaItem {
  id: string;
  unidad: Unidad;
  sistema: string;
  item: string;
  obs: string;
  principal: string;
}

interface Tarjeta {
  key: string;
  unidad: Unidad;
  placa: string;
  tipo: string;
  subtipo: string;
  supervisor: string;
  situacion: string;
  fallas: string[];
  tecnicos: Record<string, string>;
}

// Observaciones genéricas del checklist: no aportan nada a la descripción de la OT
const OBS_GENERICA = ['OBSERVADO EN CHECKLIST', 'OBSERVACION REPORTADA', 'OBSERVACIÓN REPORTADA', 'FALLA OBSERVADA',
  'FALLA REPORTADA', 'SIN OBSERVACIÓN', 'SIN OBSERVACION', 'OBSERVACIÓN', 'OBSERVACION'];
const esObsGenerica = (t: string) => !t || OBS_GENERICA.includes(t.trim().toUpperCase());

const arr = (v: unknown): Record<string, unknown>[] => {
  if (typeof v === 'string') { try { return arr(JSON.parse(v)); } catch { return []; } }
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
};

// Acepta las dos formas en que se guardan las fallas: lista plana {item, obs, sistema} o secciones {titulo, items[{nombre, ok}]}
function fallasDe(json: unknown, unidad: Unidad, prefijo: string): FallaItem[] {
  const planas: { sistema: string; item: string; obs: string }[] = [];
  arr(json).forEach(s => {
    if (Array.isArray(s.items)) {
      (s.items as { nombre?: string; ok?: boolean }[]).filter(i => !i.ok).forEach(i =>
        planas.push({ sistema: String(s.titulo ?? unidad), item: String(i.nombre ?? ''), obs: '' }));
    } else {
      planas.push({ sistema: String(s.sistema ?? unidad), item: String(s.item ?? s.nombre ?? 'Falla observada'), obs: String(s.obs ?? s.descripcion ?? '') });
    }
  });
  return planas.map((f, i) => {
    const item = f.item.replace(/^\d+[.)-]?\s*/, '').trim() || 'Falla observada';
    const obs = f.obs.trim();
    const principal = obs && !esObsGenerica(obs) && obs.toLowerCase() !== item.toLowerCase() ? `${item} : ${obs}` : item;
    return { id: `${prefijo}_${i}`, unidad, sistema: f.sistema, item, obs: obs || item, principal };
  });
}

function fallasLibresDe(texto: string | null, unidad: Unidad): FallaItem[] {
  return (texto ?? '').split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
    const limpio = l.replace(/^[•\-*]\s*/, '').replace(/^(Falla Manual|MANUAL):\s*/i, '').trim();
    const item = limpio.replace(/^\d+[.)-]?\s*/, '').trim() || limpio;
    return { id: `fl_${i}`, unidad, sistema: 'TRABAJO ADICIONAL', item, obs: limpio, principal: item };
  });
}

// La rampa y el personal se validan contra el catálogo (igual que el clásico)
function nombreRampa(r: { nombre_rampa?: string; nombre?: string }) { return (r.nombre_rampa ?? r.nombre ?? '').trim(); }

function usePersonalNombres() {
  return useQuery({
    queryKey: ['flota', 'conductores-lista'],
    queryFn: () => api<unknown>('/conductores-lista').then(r => {
      const lista = Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? []);
      return lista.map(t => (typeof t === 'string' ? t : String((t as { nombre?: string; conductor?: string }).nombre ?? (t as { conductor?: string }).conductor ?? ''))).map(s => s.trim()).filter(Boolean);
    }),
    staleTime: 300_000,
  });
}

// Unidad de telemetría Wialon por placa (sin guiones), igual que el clásico: km del tracto y horas del remolque
function telemetriaDe(unidades: UnidadMapa[] | undefined, placa: string): UnidadMapa | null {
  const p = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!p || !unidades) return null;
  return unidades.find(u => {
    const up = u.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const nom = u.nombre.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return (up && (up.includes(p) || p.includes(up))) || (nom && (nom.includes(p) || p.includes(nom)));
  }) ?? null;
}

const ahoraLocal = (suma = 0) => {
  const d = new Date(Date.now() + suma * 3600_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// Genera OTs (hijas) desde un reporte de fallas del checklist, asignadas a rampa, supervisor y técnicos.
export function GenerarOTsSheet({ falla, open, onClose }: { falla: ReporteFalla; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const cat = useCatalogosTaller();
  const personal = usePersonalNombres();
  const gps = useUnidadesGps(60_000);
  const [rampa, setRampa] = useState('');
  const [fIngreso, setFIngreso] = useState('');
  const [fSalida, setFSalida] = useState('');
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placaT = falla.placa_tracto ?? '';
  const placaR = falla.placa_remolque ?? '';

  const fallas = useMemo<FallaItem[]>(() => [
    ...fallasDe(falla.fallas_tracto_json, 'Tracto', 'ft'),
    ...fallasDe(falla.fallas_remolque_json, 'Remolque', 'fr'),
    ...fallasLibresDe(falla.fallas_libres_text, placaT ? 'Tracto' : 'Remolque'),
  ], [falla, placaT]);

  const rampas = (cat.data?.rampas ?? []).map(nombreRampa).filter(Boolean);
  const situaciones = (cat.data?.situaciones ?? []).map(s => s.descripcion ?? s.nombre ?? '').filter(Boolean);
  const personas = personal.data ?? [];

  // Al abrir: una tarjeta por unidad con fallas (como el clásico); si no hay unidades, una sola con todo
  useEffect(() => {
    if (!open) return;
    setError(null); setEnviando(false);
    setRampa(''); setFIngreso(ahoraLocal()); setFSalida(ahoraLocal(4));
    const ft = fallas.filter(f => f.unidad === 'Tracto').map(f => f.id);
    const fr = fallas.filter(f => f.unidad === 'Remolque').map(f => f.id);
    const base = (unidad: Unidad, placa: string, ids: string[], key: string): Tarjeta => ({
      key, unidad, placa, tipo: 'Correctivo', subtipo: 'Falla', supervisor: '', situacion: 'En atención', fallas: ids, tecnicos: {},
    });
    const iniciales: Tarjeta[] = [];
    if (placaT && ft.length) iniciales.push(base('Tracto', placaT, ft, 'ot_0'));
    if (placaR && fr.length) iniciales.push(base('Remolque', placaR, fr, 'ot_1'));
    if (!iniciales.length) iniciales.push(base(placaT ? 'Tracto' : 'Remolque', placaT || placaR || 'TRACTO', fallas.map(f => f.id), 'ot_0'));
    setTarjetas(iniciales);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function cambiar(key: string, cambios: Partial<Tarjeta>) {
    setTarjetas(ts => ts.map(t => (t.key === key ? { ...t, ...cambios } : t)));
  }

  function agregarTarjeta() {
    const yaAsignadas = new Set(tarjetas.flatMap(t => t.fallas));
    const unidad: Unidad = tarjetas.length % 2 === 1 && placaR ? 'Remolque' : 'Tracto';
    const placa = unidad === 'Remolque' ? placaR : (placaT || 'TRACTO');
    const libres = fallas.filter(f => f.unidad === unidad && !yaAsignadas.has(f.id)).map(f => f.id);
    setTarjetas(ts => [...ts, {
      key: `ot_${Date.now()}`, unidad, placa, tipo: 'Correctivo', subtipo: 'Falla', supervisor: '', situacion: 'En atención',
      fallas: libres, tecnicos: {},
    }]);
  }

  function cambiarUnidad(t: Tarjeta, unidad: Unidad) {
    const placa = unidad === 'Remolque' ? placaR : (placaT || 'TRACTO');
    cambiar(t.key, { unidad, placa, fallas: fallas.filter(f => f.unidad === unidad).map(f => f.id) });
  }

  function toggleFalla(t: Tarjeta, id: string, marcado: boolean) {
    cambiar(t.key, { fallas: marcado ? [...t.fallas, id] : t.fallas.filter(x => x !== id) });
  }

  async function guardar() {
    setError(null);
    if (!rampa) { setError('Elige la rampa o ubicación del taller.'); return; }
    if (!rampas.includes(rampa) && !['Zona Lavado', 'Zona de Espera', 'Taller Tercero', 'Auxilio Mecánico'].includes(rampa)) {
      setError(`La ubicación "${rampa}" no existe en el catálogo de rampas.`); return;
    }
    if (!tarjetas.length) { setError('Agrega al menos una orden de trabajo.'); return; }

    // Telemetría en vivo (como el clásico): KM del tracto desde GPS, con respaldo del reporte; horas del remolque
    const teleTracto = telemetriaDe(gps.data, placaT);
    const teleRemolque = telemetriaDe(gps.data, placaR);
    const kmGps = teleTracto && teleTracto.km > 0 ? Math.round(teleTracto.km) : 0;
    const kmReporte = falla.km_inicial ? Number(falla.km_inicial) : 0;
    const kmTablero = kmReporte || kmGps || 0;
    const kmGpsOt = kmGps || kmReporte || 0;
    const horasLive = teleRemolque && teleRemolque.horas > 0 ? Math.round(teleRemolque.horas) : (falla.horas_motor ? Number(falla.horas_motor) : null);

    const payload = [];
    for (let i = 0; i < tarjetas.length; i++) {
      const t = tarjetas[i];
      const n = `OT #${i + 1} (${t.unidad})`;
      if (!t.supervisor) { setError(`Elige el supervisor responsable de la ${n}.`); return; }
      if (!personas.includes(t.supervisor)) { setError(`El supervisor de la ${n} no existe en el directorio de personal.`); return; }
      if (!t.subtipo) { setError(`Elige el subtipo de la ${n}.`); return; }

      // Sin fallas marcadas, el clásico toma las de la unidad
      const seleccion = t.fallas.length ? fallas.filter(f => t.fallas.includes(f.id)) : fallas.filter(f => f.unidad === t.unidad);
      const motivos = [];
      for (const f of seleccion) {
        const tec = (t.tecnicos[f.id] ?? '').trim();
        if (tec && !personas.includes(tec)) { setError(`El técnico "${tec}" de la ${n} no existe en el directorio.`); return; }
        motivos.push({ motivo: f.principal, descripcion: f.principal, sistema: f.sistema, item: f.item, obs: f.obs, tecnico: tec, tecnico_nombre: tec });
      }
      const tecnicos = Array.from(new Set(motivos.map(m => m.tecnico).filter(Boolean)));
      const esTracto = t.unidad === 'Tracto';

      payload.push({
        unidad: t.unidad, placa: t.placa,
        km: esTracto ? kmTablero : 0, km_tablero: esTracto ? kmTablero : 0, km_gps: esTracto ? kmGpsOt : 0,
        horas_motor: t.unidad === 'Remolque' ? horasLive : null,
        tipo_ot: t.tipo, subtipo_ot: t.subtipo, supervisor: t.supervisor, situacion: t.situacion || 'En atención',
        fallas_seleccionadas: seleccion.map(f => f.principal), motivos_array: motivos,
        tecnicos: tecnicos.length ? tecnicos : [t.supervisor],
      });
    }

    setEnviando(true);
    try {
      const res = await api<{ ok?: boolean; otsCreadas?: unknown[]; error?: string }>(`/mantenimiento/checklist/${falla.id}/generar-ots`, {
        method: 'POST',
        body: { id_reporte: falla.id, id_rampa: rampa, fecha_ingreso: fIngreso, fecha_salida: fSalida, ots: payload },
      });
      haptic('success');
      toast(`Se generaron ${res.otsCreadas?.length ?? payload.length} orden(es) de trabajo`);
      await qc.invalidateQueries({ queryKey: ['flota', 'checklist'] });
      await qc.invalidateQueries({ queryKey: ['mant'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const ligadas = new Set(tarjetas.flatMap(t => t.fallas));
  const sinAsignar = fallas.filter(f => !ligadas.has(f.id)).length;

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Generar OTs · ${falla.folio}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Confirmar y generar OTs</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <div className="field field--wide">
          <div className="tarjeta__lista" style={{ padding: 'var(--s-3)', fontSize: '0.8125rem' }}>
            <div><strong>Conductor:</strong> {falla.conductor || 'No especificado'}</div>
            <div><strong>Tracto:</strong> {placaT || '—'} · <strong>Remolque:</strong> {placaR || '—'}</div>
            <div><strong>Ruta:</strong> {falla.procedencia || '—'} · <strong>Km:</strong> {falla.km_inicial ? Number(falla.km_inicial).toLocaleString() : '—'}</div>
          </div>
        </div>

        <Field label="Rampa / ubicación" wide>
          {p => (
            <SelectInput {...p} value={rampa} onChange={e => setRampa(e.target.value)}>
              <option value="">Elige una rampa…</option>
              {[...new Set([...rampas, 'Zona Lavado', 'Zona de Espera', 'Taller Tercero', 'Auxilio Mecánico'])].map(r => <option key={r} value={r}>{r}</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Ingreso">{p => <TextInput {...p} type="datetime-local" value={fIngreso} onChange={e => setFIngreso(e.target.value)} />}</Field>
        <Field label="Salida estimada">{p => <TextInput {...p} type="datetime-local" value={fSalida} onChange={e => setFSalida(e.target.value)} />}</Field>

        {sinAsignar > 0 && (
          <div className="field field--wide"><Notice tone="accent">{sinAsignar} falla(s) sin OT asignada. Quedarán fuera de las OTs.</Notice></div>
        )}

        {tarjetas.map((t, i) => (
          <div key={t.key} className="field field--wide tarjeta__lista" style={{ padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s-2)' }}>
              <strong style={{ fontSize: '0.875rem' }}>OT #{i + 1} · <span style={{ fontFamily: 'var(--font-mono)' }}>{t.placa}</span></strong>
              {tarjetas.length > 1 && (
                <Button variant="secondary" icon={<Trash2 size={15} />}
                  onClick={() => setTarjetas(ts => ts.filter(x => x.key !== t.key))}>Quitar</Button>
              )}
            </div>

            <div className="form-grid">
              <Field label="Unidad">
                {p => (
                  <SelectInput {...p} value={t.unidad} onChange={e => cambiarUnidad(t, e.target.value as Unidad)}>
                    <option value="Tracto">Tracto</option>
                    <option value="Remolque" disabled={!placaR}>Remolque</option>
                  </SelectInput>
                )}
              </Field>
              <Field label="Situación (Status Rampa)">
                {p => (
                  <SelectInput {...p} value={t.situacion} onChange={e => cambiar(t.key, { situacion: e.target.value })}>
                    {[...new Set(['En atención', ...situaciones])].map(s => <option key={s} value={s}>{s}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label="Tipo de OT">
                {p => (
                  <SelectInput {...p} value={t.tipo} onChange={e => cambiar(t.key, { tipo: e.target.value, subtipo: SUBTIPOS[e.target.value]?.[0] ?? '' })}>
                    {TIPOS_OT.map(k => <option key={k} value={k}>{k}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label="Sub tipo de OT">
                {p => (
                  <SelectInput {...p} value={t.subtipo} onChange={e => cambiar(t.key, { subtipo: e.target.value })}>
                    {(SUBTIPOS[t.tipo] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label="Supervisor responsable" wide>
                {p => (
                  <SelectInput {...p} value={t.supervisor} onChange={e => cambiar(t.key, { supervisor: e.target.value })}>
                    <option value="">Elige un supervisor…</option>
                    {personas.map(n => <option key={n} value={n}>{n}</option>)}
                  </SelectInput>
                )}
              </Field>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', marginBottom: 'var(--s-2)' }}>Fallas de esta OT y técnico</div>
              {fallas.filter(f => f.unidad === t.unidad).length === 0 && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>Sin fallas de esta unidad. Se generará una OT general.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                {fallas.filter(f => f.unidad === t.unidad).map(f => {
                  const marcada = t.fallas.includes(f.id);
                  return (
                    <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: marcada ? 1 : 0.6 }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.8125rem' }}>
                        <input type="checkbox" checked={marcada} onChange={e => toggleFalla(t, f.id, e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
                        <span><strong>{f.sistema}</strong> · {f.principal}</span>
                      </label>
                      {marcada && (
                        <SelectInput value={t.tecnicos[f.id] ?? ''} onChange={e => cambiar(t.key, { tecnicos: { ...t.tecnicos, [f.id]: e.target.value } })}>
                          <option value="">Técnico (opcional)…</option>
                          {personas.map(n => <option key={n} value={n}>{n}</option>)}
                        </SelectInput>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        <div className="field field--wide">
          <Button variant="secondary" icon={<Plus size={16} />} onClick={agregarTarjeta}>Agregar otra OT</Button>
        </div>
      </div>
    </Sheet>
  );
}
