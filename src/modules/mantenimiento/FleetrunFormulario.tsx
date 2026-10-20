import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { usePlacas, useMetricas, type Placa } from '../placas/api';
import { frFecha, frFrecuencia, frKmCambio, frKmGps, frObs, frPlaca, frTipo, frId, type FleetrunFila } from './api';
import {
  actualizarFleetrun, buscarFrecuencia, guardarFleetrun, useFrecuenciasMp, useTiposPreventivo, type FleetrunCampos,
} from './fleetrunApi';

// Registrar mantenimiento preventivo (uno o varios tipos de MP a la vez) o editar un registro.
// Misma lógica que modulos/mantenimiento/fleetrun/logica.js: la frecuencia sale de las Frecuencias MP según
// marca, tipo de MP, UTS, combustible y modelo de la unidad; km próximo = km actual + frecuencia.

interface ItemTipo { tipo: string; frec: string; prox: string }

const hoyLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
// DD/MM/YYYY (como lo entrega el servidor) → AAAA-MM-DD
const aIso = (s: string) => {
  const p = s.split('/');
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

export function FleetrunFormulario({ registro, usuario, open, onClose }: {
  registro: FleetrunFila | null; usuario: string; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const placas = usePlacas();
  const metricas = useMetricas();
  const frecuencias = useFrecuenciasMp();
  const tiposMp = useTiposPreventivo();
  const editando = !!registro;

  const conductores = useQuery({
    queryKey: ['flota', 'conductores-lista'],
    queryFn: () => api<unknown>('/conductores-lista').then(r =>
      ((Array.isArray(r) ? r : []) as { nombre?: string }[]).map(c => String(c.nombre ?? '').trim()).filter(Boolean)),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const [fecha, setFecha] = useState('');
  const [placa, setPlaca] = useState('');
  const [kmAct, setKmAct] = useState('');
  const [kmGps, setKmGps] = useState('');
  const [tec, setTec] = useState('');
  const [obs, setObs] = useState('');
  const [items, setItems] = useState<ItemTipo[]>([]);
  const [tipoEdit, setTipoEdit] = useState('');
  const [frecEdit, setFrecEdit] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unidad: Placa | null = useMemo(
    () => (placas.data ?? []).find(p => p.placa === placa.toUpperCase()) ?? null, [placas.data, placa]);
  const horas = metricas.data?.get(placa.toUpperCase()) === 'horas';
  const u = horas ? 'h' : 'km';

  // Datos de la unidad para calcular frecuencias; en edición, si la placa ya no está en el catálogo, los del propio registro
  const datosUnidad = useMemo(() => ({
    marca: unidad?.marca ?? (registro ? String(registro[5] ?? '') : ''),
    uts: unidad?.uts ?? (registro ? String(registro[7] ?? '') : ''),
    combustible: unidad?.combustible ?? '',
    modelo: unidad?.modelo ?? '',
  }), [unidad, registro]);

  const frecDe = (tipo: string) => buscarFrecuencia(frecuencias.data ?? [], datosUnidad, tipo, horas);

  useEffect(() => {
    if (!open) return;
    setError(null); setTipoEdit('');
    if (registro) {
      setFecha(aIso(String(registro[3] ?? '')));
      setPlaca(frPlaca(registro) === '—' ? '' : frPlaca(registro).toUpperCase());
      setKmAct(frKmCambio(registro) ? String(frKmCambio(registro)) : '');
      setKmGps(frKmGps(registro) ? String(frKmGps(registro)) : '');
      setTec(String(registro[13] ?? '')); setObs(frObs(registro));
      setTipoEdit(frTipo(registro) === '—' ? '' : frTipo(registro));
      setFrecEdit(frFrecuencia(registro) ? String(frFrecuencia(registro)) : '');
      setItems([]);
    } else {
      setFecha(hoyLocal()); setPlaca(''); setKmAct(''); setKmGps(''); setTec(''); setObs(''); setItems([]); setFrecEdit('');
    }
  }, [open, registro]);

  // Al elegir una placa: km del GPS (Wialon) y frecuencias de los tipos ya agregados con los datos de la nueva unidad
  async function elegirPlaca(p: string) {
    setPlaca(p);
    const nueva = (placas.data ?? []).find(x => x.placa === p);
    const datos = { marca: nueva?.marca ?? '', uts: nueva?.uts ?? '', combustible: nueva?.combustible ?? '', modelo: nueva?.modelo ?? '' };
    const h = metricas.data?.get(p) === 'horas';
    const act = num(kmAct);
    setItems(prev => prev.map(it => {
      const f = buscarFrecuencia(frecuencias.data ?? [], datos, it.tipo, h);
      return { ...it, frec: f ? String(f) : '', prox: f > 0 ? String(act + f) : '0' };
    }));
    try {
      const r = await api<{ gps?: { unidades?: Array<{ placa?: string; km?: number; horas?: number }> } }>('/tv/gps-feed');
      const limpia = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const g = (r.gps?.unidades ?? []).find(x => limpia(String(x.placa ?? '')) === limpia(p));
      const v = g ? (h ? Number(g.horas) : Number(g.km)) : 0;
      setKmGps(v > 0 ? String(Math.round(v)) : '');
    } catch { setKmGps(''); }
  }

  function cambiarKmAct(v: string) {
    setKmAct(v);
    if (editando) return;
    const act = num(v);
    setItems(prev => prev.map(it => (num(it.frec) > 0 ? { ...it, prox: String(act + num(it.frec)) } : it)));
  }

  function agregarTipo(tipo: string) {
    const t = tipo.toUpperCase().trim();
    if (!t || items.some(i => i.tipo === t)) return;
    const f = frecDe(t);
    setItems(prev => [...prev, { tipo: t, frec: f ? String(f) : '', prox: f > 0 ? String(num(kmAct) + f) : '0' }]);
  }
  const editarFrec = (i: number, v: string) =>
    setItems(prev => prev.map((it, k) => (k === i ? { ...it, frec: v, prox: num(v) > 0 ? String(num(kmAct) + num(v)) : it.prox } : it)));
  const editarProx = (i: number, v: string) => setItems(prev => prev.map((it, k) => (k === i ? { ...it, prox: v } : it)));

  // Edición: km próximo = km actual + frecuencia (vacío si no hay frecuencia)
  const proxEdit = num(frecEdit) > 0 ? String(num(kmAct) + num(frecEdit)) : '';

  async function guardar() {
    if (!fecha) { setError('Indica la fecha del mantenimiento.'); return; }
    if (!placa) { setError('Elige la placa de la unidad.'); return; }
    if (kmAct.trim() === '') { setError(`Indica el ${horas ? 'horómetro' : 'kilometraje'} actual.`); return; }
    if (!editando && items.length === 0) { setError('Selecciona al menos un tipo de mantenimiento.'); return; }
    if (editando && !tipoEdit) { setError('Elige el tipo de mantenimiento.'); return; }

    const base: FleetrunCampos = {
      fecha, placa, marca: datosUnidad.marca, dueno: unidad?.cliente ?? (registro ? String(registro[6] ?? '') : ''),
      uts: datosUnidad.uts, tipomp: '', kmact: kmAct, freckm: '', kmprox: '', obs: obs.trim(), tec: tec.trim(), kmgps: kmGps,
      combustible: datosUnidad.combustible, modelo: datosUnidad.modelo,
    };
    setGuardando(true); setError(null);
    try {
      if (registro) {
        await actualizarFleetrun({ ...base, id: frId(registro), tipomp: tipoEdit, freckm: frecEdit, kmprox: proxEdit }, usuario);
      } else {
        // Un registro por tipo, en orden; si alguno falla se informa cuál y se refresca lo que sí se guardó
        const fallos: string[] = [];
        for (const it of items) {
          try { await guardarFleetrun({ ...base, tipomp: it.tipo, freckm: it.frec || '0', kmprox: it.prox }, usuario); }
          catch (err) { fallos.push(`${it.tipo}: ${errorMessage(err)}`); }
        }
        if (fallos.length) {
          await qc.invalidateQueries({ queryKey: ['mant', 'fleetrun'] });
          throw new Error(`Algunos registros fallaron — ${fallos.join(' · ')}`);
        }
      }
      haptic('success');
      toast(editando ? 'Registro actualizado' : items.length > 1 ? `${items.length} registros guardados` : 'Registro guardado');
      await Promise.all([qc.invalidateQueries({ queryKey: ['mant', 'fleetrun'] }), qc.invalidateQueries({ queryKey: ['mant', 'planificacion'] })]);
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  const tiposDisponibles = (tiposMp.data ?? []).filter(t => !items.some(i => i.tipo === t.toUpperCase()));

  return (
    <Sheet open={open} onClose={() => !guardando && onClose()}
      title={editando ? `Editar ${registro ? frPlaca(registro) : ''}` : 'Registrar mantenimiento'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={guardando}>{editando ? 'Guardar cambios' : 'Guardar'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <div className="form-grid">
          <Field label="Fecha">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
          <Field label="Placa">
            {p => (
              <PlacaPicker {...p} value={placa} onChange={elegirPlaca}
                opciones={(placas.data ?? []).filter(x => x.estado.toLowerCase() === 'activa' || x.placa === placa)
                  .map(x => ({ placa: x.placa, detalle: x.cliente }))} />
            )}
          </Field>
          <Field label={horas ? 'Horómetro actual' : 'Km actual'}>
            {p => <TextInput {...p} type="number" inputMode="numeric" min={0} value={kmAct} onChange={e => cambiarKmAct(e.target.value)} />}
          </Field>
          <Field label={horas ? 'Horas motor (GPS)' : 'Km GPS (Wialon)'} hint="Se completa solo desde el GPS">
            {p => <TextInput {...p} type="number" inputMode="numeric" min={0} value={kmGps} onChange={e => setKmGps(e.target.value)} />}
          </Field>

          {!editando && (
            <Field label="Tipos de mantenimiento" wide hint={unidad ? `${unidad.marca || 'Sin marca'} · ${unidad.uts || 'Sin UTS'} — la frecuencia sale de Frecuencias MP` : 'Elige primero la placa para calcular la frecuencia'}>
              {p => (
                <SelectInput {...p} value="" onChange={e => agregarTipo(e.target.value)}>
                  <option value="">Agregar un tipo de MP…</option>
                  {tiposDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
                </SelectInput>
              )}
            </Field>
          )}
        </div>

        {!editando && (
          <div className="tarjeta__lista">
            {items.length === 0 && (
              <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-3)' }}>Agrega los tipos de mantenimiento realizados</span></div>
            )}
            {items.map((it, i) => (
              <div key={it.tipo} className="dato" style={{ display: 'grid', gridTemplateColumns: '1fr 6rem 7rem auto', gap: 'var(--s-2)', alignItems: 'center' }}>
                <span className="dato__label" style={{ fontWeight: 700 }}>{it.tipo}</span>
                <TextInput type="number" min={0} aria-label={`Frecuencia de ${it.tipo} (${u})`} placeholder={`Frec. ${u}`}
                  value={it.frec} onChange={e => editarFrec(i, e.target.value)} />
                <TextInput type="number" min={0} aria-label={`Próximo de ${it.tipo} (${u})`} placeholder={`Próx. ${u}`}
                  value={num(it.frec) > 0 ? it.prox : ''} disabled={!(num(it.frec) > 0)} onChange={e => editarProx(i, e.target.value)} />
                <button type="button" aria-label={`Quitar ${it.tipo}`} onClick={() => setItems(prev => prev.filter((_, k) => k !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--label-3)', padding: 4 }}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {editando && (
          <div className="form-grid">
            <Field label="Tipo de MP">
              {p => (
                <SelectInput {...p} value={tipoEdit} onChange={e => { setTipoEdit(e.target.value); const f = frecDe(e.target.value); if (f) setFrecEdit(String(f)); }}>
                  <option value="">Elige el tipo…</option>
                  {[...new Set([...(tiposMp.data ?? []), ...(tipoEdit ? [tipoEdit] : [])])].sort().map(t => <option key={t} value={t}>{t}</option>)}
                </SelectInput>
              )}
            </Field>
            <Field label={`Frecuencia (${u})`}>{p => <TextInput {...p} type="number" min={0} value={frecEdit} onChange={e => setFrecEdit(e.target.value)} />}</Field>
            <Field label={`Próximo (${u})`} hint="Km actual + frecuencia">{p => <TextInput {...p} value={proxEdit} readOnly />}</Field>
          </div>
        )}

        <div className="form-grid">
          <Field label="Técnico / responsable" wide>
            {p => (
              <>
                <TextInput {...p} list="fleetrun-tecnicos" value={tec} onChange={e => setTec(e.target.value)} placeholder="Opcional" autoComplete="off" />
                <datalist id="fleetrun-tecnicos">{(conductores.data ?? []).map(n => <option key={n} value={n} />)}</datalist>
              </>
            )}
          </Field>
          <Field label="Observaciones" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />}</Field>
        </div>
        {editando && frFecha(registro!) === '—' && (
          <Notice tone="neutral">Este registro es un plan inicial sin fecha de ejecución. Al indicar la fecha pasa a ser un mantenimiento realizado.</Notice>
        )}
      </div>
    </Sheet>
  );
}
