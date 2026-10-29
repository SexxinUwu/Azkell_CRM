import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, CircleAlert, Search, Users, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { SeleccionMultiple, type OpcionSeleccion } from '../../core/ui/SeleccionMultiple';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { usePlacas, useMetricas, type Placa } from '../placas/api';
import { frFecha, frFrecuencia, frKmCambio, frKmGps, frKmProx, frObs, frPlaca, frTipo, frId, type FleetrunFila } from './api';
import {
  actualizarFleetrun, buscarFrecuencia, guardarFleetrun, useFrecuenciasMp, useTiposPreventivo, type FleetrunCampos,
} from './fleetrunApi';
import { tipoOracion } from './fleetrunReporte';

// Registrar mantenimiento preventivo (uno o varios tipos de MP y uno o varios técnicos) o editar un registro.
// Misma lógica que modulos/mantenimiento/fleetrun/logica.js: la frecuencia sale de las Frecuencias MP según
// marca, tipo de MP, UTS, combustible y modelo de la unidad; km próximo = km actual + frecuencia.

interface ItemTipo { tipo: string; frec: string; prox: string }

/** Los técnicos se guardan en una sola columna de la base (varchar de 100): separados por " / " */
const SEPARADOR_TECNICOS = ' / ';
const MAX_TECNICOS_BD = 100;

const hoyLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
// DD/MM/YYYY (como lo entrega el servidor) → AAAA-MM-DD
const aIso = (s: string) => {
  const p = s.split('/');
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

/** Campo que abre la hoja de selección (mismo diseño que el de placa): muestra lo elegido o el texto de ayuda */
function CampoElegir({ id, icono, vacio, resumen, abrir, describedBy }: {
  id?: string;
  icono: ReactNode;
  vacio: string;
  resumen: string;
  abrir: () => void;
  describedBy?: string;
}) {
  return (
    <button type="button" id={id} className="campo-picker" aria-haspopup="dialog" aria-describedby={describedBy}
      onClick={() => { haptic('selection'); abrir(); }}>
      {icono}
      {resumen
        ? <span className="campo-picker__detalle" style={{ textAlign: 'left' }}>{resumen}</span>
        : <span className="campo-picker__vacio">{vacio}</span>}
      <ChevronDown size={16} aria-hidden className="campo-picker__chevron" />
    </button>
  );
}

/** Tipos de mantenimiento: varios a la vez, con buscador y casillas */
function TipoPicker({ id, describedBy, opciones, seleccionados, onToggle }: {
  id?: string;
  describedBy?: string;
  opciones: string[];
  seleccionados: string[];
  onToggle: (tipo: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const lista: OpcionSeleccion[] = opciones.map(t => ({ valor: t, titulo: tipoOracion(t) }));
  const resumen = seleccionados.length ? seleccionados.map(tipoOracion).join(' · ') : '';
  return (
    <>
      <CampoElegir id={id} describedBy={describedBy} icono={<Search size={16} aria-hidden />}
        vacio="Elige uno o varios tipos de mantenimiento…" resumen={resumen} abrir={() => setAbierto(true)} />
      <SeleccionMultiple open={abierto} onClose={() => setAbierto(false)} titulo="Tipos de mantenimiento"
        opciones={lista} seleccionados={seleccionados} onToggle={onToggle} placeholder="Buscar tipo de mantenimiento"
        vacio="Ningún tipo coincide." />
    </>
  );
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Técnicos: mismo modal que el clásico (fleetrunAbrirTecnicos / fleetrunAplicarTecnicos). Se marca en un borrador:
 *  Listo lo aplica (si no pasa de 100 caracteres; si pasa, avisa y sigue abierto) y Cancelar lo descarta. */
function TecnicoPicker({ id, describedBy, opciones, seleccionados, onAplicar }: {
  id?: string;
  describedBy?: string;
  opciones: string[];
  seleccionados: string[];
  onAplicar: (nombres: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<string[]>([]);
  const [buscar, setBuscar] = useState('');
  const visibles = opciones.filter(n => sinAcentos(n).includes(sinAcentos(buscar)));

  function abrir() {
    setBorrador(seleccionados);
    setBuscar('');
    setAbierto(true);
  }
  function alternar(nombre: string) {
    setBorrador(prev => (prev.includes(nombre) ? prev.filter(n => n !== nombre) : [...prev, nombre]));
  }
  function listo() {
    if (borrador.join(SEPARADOR_TECNICOS).length > MAX_TECNICOS_BD) {
      window.alert(`Son demasiados técnicos para guardar (máximo ${MAX_TECNICOS_BD} caracteres). Quita alguno.`);
      return;
    }
    onAplicar(borrador);
    setAbierto(false);
  }

  return (
    <>
      <CampoElegir id={id} describedBy={describedBy} icono={<Users size={16} aria-hidden />}
        vacio="Elige uno o varios técnicos…" resumen={seleccionados.join(' · ')} abrir={abrir} />
      <Sheet open={abierto} onClose={() => setAbierto(false)} title="Técnicos / responsables" ancho
        footer={<>
          <Button variant="secondary" onClick={() => setAbierto(false)}>Cancelar</Button>
          <Button variant="primary" onClick={listo}>Listo</Button>
        </>}>
        <SearchField value={buscar} onChange={setBuscar} placeholder="Buscar técnico…" />
        {opciones.length === 0 ? (
          <p className="t-footnote c-secondary">No hay técnicos registrados.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {visibles.map(n => (
              <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={borrador.includes(n)} onChange={() => alternar(n)} />
                <span>{n}</span>
              </label>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

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
  const [tecs, setTecs] = useState<string[]>([]);
  const [obs, setObs] = useState('');
  const [items, setItems] = useState<ItemTipo[]>([]);
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
    setError(null);
    if (registro) {
      setFecha(aIso(String(registro[3] ?? '')));
      setPlaca(frPlaca(registro) === '—' ? '' : frPlaca(registro).toUpperCase());
      setKmAct(frKmCambio(registro) ? String(frKmCambio(registro)) : '');
      setKmGps(frKmGps(registro) ? String(frKmGps(registro)) : '');
      setTecs(String(registro[13] ?? '').split(/\s*[/,]\s*/).map(s => s.trim()).filter(Boolean));
      setObs(frObs(registro));
      const tipoReg = frTipo(registro) === '—' ? '' : frTipo(registro);
      setItems(tipoReg ? [{ tipo: tipoReg.toUpperCase(), frec: frFrecuencia(registro) ? String(frFrecuencia(registro)) : '', prox: frKmProx(registro) ? String(frKmProx(registro)) : '' }] : []);
    } else {
      setFecha(hoyLocal()); setPlaca(''); setKmAct(''); setKmGps(''); setTecs([]); setObs(''); setItems([]);
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
    const act = num(v);
    setItems(prev => prev.map(it => (num(it.frec) > 0 ? { ...it, prox: String(act + num(it.frec)) } : it)));
  }

  /** Marca o desmarca un tipo de mantenimiento (varios a la vez) */
  function alternarTipo(tipo: string) {
    const t = tipo.toUpperCase().trim();
    if (!t) return;
    if (editando) {
      const f = frecDe(t);
      setItems([{ tipo: t, frec: f ? String(f) : '', prox: f > 0 ? String(num(kmAct) + f) : '0' }]);
      return;
    }
    if (items.some(i => i.tipo === t)) {
      setItems(prev => prev.filter(i => i.tipo !== t));
      return;
    }
    const f = frecDe(t);
    setItems(prev => [...prev, { tipo: t, frec: f ? String(f) : '', prox: f > 0 ? String(num(kmAct) + f) : '0' }]);
  }
  const editarFrec = (i: number, v: string) =>
    setItems(prev => prev.map((it, k) => (k === i ? { ...it, frec: v, prox: num(v) > 0 ? String(num(kmAct) + num(v)) : it.prox } : it)));
  const editarProx = (i: number, v: string) => setItems(prev => prev.map((it, k) => (k === i ? { ...it, prox: v } : it)));

  async function guardar() {
    if (!fecha) { setError('Indica la fecha del mantenimiento.'); return; }
    if (!placa) { setError('Elige la placa de la unidad.'); return; }
    if (kmAct.trim() === '') { setError(`Indica el ${horas ? 'horómetro' : 'kilometraje'} actual.`); return; }
    if (items.length === 0) { setError('Selecciona al menos un tipo de mantenimiento.'); return; }
    const tecnicos = tecs.join(SEPARADOR_TECNICOS);
    if (tecnicos.length > MAX_TECNICOS_BD) {
      setError(`Son demasiados técnicos para guardar (máximo ${MAX_TECNICOS_BD} caracteres). Quita alguno.`);
      return;
    }

    const base: FleetrunCampos = {
      fecha, placa, marca: datosUnidad.marca, dueno: unidad?.cliente ?? (registro ? String(registro[6] ?? '') : ''),
      uts: datosUnidad.uts, tipomp: '', kmact: kmAct, freckm: '', kmprox: '', obs: obs.trim(), tec: tecnicos, kmgps: kmGps,
      combustible: datosUnidad.combustible, modelo: datosUnidad.modelo,
    };
    setGuardando(true); setError(null);
    try {
      if (registro) {
        const it = items[0];
        await actualizarFleetrun({ ...base, id: frId(registro), tipomp: it.tipo, freckm: it.frec || '0', kmprox: it.prox }, usuario);
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

  // Todos los tipos del catálogo (sin repetir), para marcarlos en la hoja
  const opcionesTipos = useMemo(
    () => [...new Set((tiposMp.data ?? []).map(t => t.toUpperCase()))].sort(),
    [tiposMp.data]);
  const seleccionadosTipos = items.map(i => i.tipo);
  // Mismo orden que la lista del servidor (el clásico no reordena los técnicos)
  const opcionesTecnicos = conductores.data ?? [];

  return (
    <Sheet open={open} onClose={() => !guardando && onClose()} ancho
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

          {(
            <Field label="Tipos de mantenimiento" wide hint={unidad ? `${unidad.marca || 'Sin marca'} · ${unidad.uts || 'Sin UTS'} — la frecuencia sale de Frecuencias MP` : 'Elige primero la placa para calcular la frecuencia'}>
              {p => <TipoPicker id={p.id} describedBy={p['aria-describedby']} opciones={opcionesTipos} seleccionados={seleccionadosTipos} onToggle={alternarTipo} />}
            </Field>
          )}
        </div>

        {(
          <div className="tarjeta__lista">
            {items.length === 0 && (
              <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-3)' }}>Marca los tipos de mantenimiento realizados</span></div>
            )}
            {items.map((it, i) => (
              <div key={it.tipo} className="dato" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 6.5rem 7.5rem auto', gap: 'var(--s-2)', alignItems: 'center' }}>
                <span className="dato__label" style={{ fontWeight: 700 }}>{tipoOracion(it.tipo)}</span>
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


        <div className="form-grid">
          <Field label="Técnico / Responsable" wide>
            {p => <TecnicoPicker id={p.id} describedBy={p['aria-describedby']} opciones={opcionesTecnicos} seleccionados={tecs} onAplicar={setTecs} />}
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
