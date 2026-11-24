import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Camera, CircleAlert, Receipt, TriangleAlert, Wrench, ClipboardCheck } from 'lucide-react';
import { Pencil } from '../../core/ui/IconosArchivo';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox, type ComboboxOption } from '../../core/ui/Combobox';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { errorMessage } from '../../core/api/client';
import { formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { spring } from '../../core/lib/motion';
import '../operaciones/servicios.css';
import { AdjuntosSiniestro, resumenAdjuntos, tipoDeFile } from './AdjuntosSiniestro';
import { ESTADOS_SINIESTRO, guardarSiniestro, hoyIso, num, subirAdjuntosSiniestro, useFotosSiniestro, type CatalogoSiniestros, type Siniestro } from './siniestrosApi';

interface Form {
  fecha: string; placa: string; marca: string; conductor: string; ubicacion: string; tipo_incidencia: string; detalle: string; tecnico: string;
  inicio: string; fin: string; costo_repuestos: string; costo_mano_obra: string; estado: string;
}
type Campo = 'fecha' | 'placa' | 'tipo_incidencia' | 'fin';

const VACIO = (): Form => ({
  fecha: hoyIso(), placa: '', marca: '', conductor: '', ubicacion: '', tipo_incidencia: '', detalle: '', tecnico: '',
  inicio: '', fin: '', costo_repuestos: '', costo_mano_obra: '', estado: 'En Reparación',
});

const aLocal = (v: string | null) => (v ? v.replace(' ', 'T') : '');
const desdeSiniestro = (s: Siniestro): Form => ({
  fecha: s.fecha, placa: s.placa, marca: s.marca ?? '', conductor: s.conductor ?? '', ubicacion: s.ubicacion ?? '', tipo_incidencia: s.tipo_incidencia,
  detalle: s.detalle ?? '', tecnico: s.tecnico ?? '', inicio: aLocal(s.inicio), fin: aLocal(s.fin),
  costo_repuestos: num(s.costo_repuestos) ? String(num(s.costo_repuestos)) : '', costo_mano_obra: num(s.costo_mano_obra) ? String(num(s.costo_mano_obra)) : '', estado: s.estado,
});

/** Horas entre dos fechas con hora («aaaa-mm-ddThh:mm»), con un decimal; null si falta alguna o el fin es anterior */
function horasEntre(inicio: string, fin: string): number | null {
  const ms = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(v); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null; };
  const a = ms(inicio); const b = ms(fin);
  return a == null || b == null || b < a ? null : Math.round(((b - a) / 3600000) * 10) / 10;
}

const listaDe = (valores: string[], actual: string): ComboboxOption[] => [
  ...(actual && !valores.includes(actual) ? [{ value: actual, label: actual }] : []),
  ...valores.map(v => ({ value: v, label: v })),
];

/** Conductor y técnico se eligen de la misma lista: el personal de la empresa (con su cargo); los nombres ya usados que no estén ahí también salen */
const personalDe = (catalogo: CatalogoSiniestros | undefined, actual: string): ComboboxOption[] => {
  const base: ComboboxOption[] = (catalogo?.personal ?? []).map(p => ({ value: p.nombre, label: p.nombre, description: p.cargo || undefined }));
  const conocidos = new Set(base.map(o => o.value));
  const extra = [...(catalogo?.usados ?? []), ...(actual ? [actual] : [])].filter((v, i, a) => !conocidos.has(v) && a.indexOf(v) === i).map(v => ({ value: v, label: v }));
  return [...base, ...extra];
};

const PASOS = [
  { titulo: 'Qué pasó', icono: <TriangleAlert size={16} />, resumen: 'La unidad, el conductor y el daño' },
  { titulo: 'Evidencias', icono: <Camera size={16} />, resumen: 'Fotos, videos y PDF del daño' },
  { titulo: 'Taller', icono: <Wrench size={16} />, resumen: 'Quién lo repara y cuánto tarda' },
  { titulo: 'Costo', icono: <Receipt size={16} />, resumen: 'Repuestos y mano de obra' },
  { titulo: 'Resumen', icono: <ClipboardCheck size={16} />, resumen: 'Revisa y registra el siniestro' },
];
// Campos que se validan al salir de cada paso
const CAMPOS_PASO: Campo[][] = [['fecha', 'placa', 'tipo_incidencia'], [], ['fin'], [], []];

function FilaResumen({ label, valor }: { label: string; valor?: string | null }) {
  if (!valor) return null;
  return <div className="os-res__fila"><span className="os-res__label">{label}</span><span className="os-res__valor">{valor}</span></div>;
}

function GrupoResumen({ titulo, paso, onCambiar, children }: { titulo: string; paso: number; onCambiar: (p: number) => void; children: ReactNode }) {
  return (
    <section className="os-res__grupo">
      <header className="os-res__cab">
        <h4>{titulo}</h4>
        <button type="button" className="os-res__cambiar" onClick={() => onCambiar(paso)}><Pencil size={13} /> Cambiar</button>
      </header>
      {children}
    </section>
  );
}

const fechaCorta = (v: string) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '');
const fechaHoraCorta = (v: string) => (v ? `${fechaCorta(v)} ${v.slice(11, 16)}` : '');

/** Registrar o corregir un siniestro, paso a paso: qué pasó → evidencias → taller → costo → resumen. Las horas y el costo total se calculan solos. */
export function SiniestroSheet({ abierto, siniestro, catalogo, onClose }: { abierto: boolean; siniestro: Siniestro | null; catalogo: CatalogoSiniestros | undefined; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const { can } = useAuth();
  const [f, setF] = useState<Form>(VACIO);
  const [paso, setPaso] = useState(0);
  const [direccion, setDireccion] = useState(1);
  const [tocados, setTocados] = useState<Set<Campo>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subidos, setSubidos] = useState<{ hechos: number; total: number } | null>(null);
  // Archivos nuevos por subir (los ya guardados los muestra AdjuntosSiniestro)
  const [nuevos, setNuevos] = useState<File[]>([]);
  const guardados = useFotosSiniestro(siniestro?.id ?? null);

  useEffect(() => {
    if (abierto) { setF(siniestro ? desdeSiniestro(siniestro) : VACIO()); setPaso(0); setDireccion(1); setTocados(new Set()); setError(null); setNuevos([]); setSubidos(null); }
  }, [abierto, siniestro]);
  const set = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));

  const placas = useMemo<ComboboxOption[]>(() => {
    const base = (catalogo?.placas ?? []).map(p => ({ value: p.placa, label: p.placa, description: [p.marca, p.tipo].filter(Boolean).join(' · ') || undefined }));
    return f.placa && !base.some(o => o.value === f.placa) ? [{ value: f.placa, label: f.placa }, ...base] : base;
  }, [catalogo, f.placa]);

  const horas = horasEntre(f.inicio, f.fin);
  const repuestos = num(f.costo_repuestos.replace(',', '.'));
  const manoObra = num(f.costo_mano_obra.replace(',', '.'));
  const total = repuestos + manoObra;

  const errores: Partial<Record<Campo, string>> = {};
  if (!f.fecha) errores.fecha = 'Indica la fecha del siniestro.';
  if (!f.placa.trim()) errores.placa = 'Elige la placa de la unidad.';
  if (!f.tipo_incidencia.trim()) errores.tipo_incidencia = 'Elige o escribe el tipo de incidencia.';
  if (f.inicio && f.fin && horas == null) errores.fin = 'El fin del trabajo no puede ser anterior a su inicio.';
  const ver = (c: Campo) => (tocados.has(c) ? errores[c] : undefined);
  const ultimo = PASOS.length - 1;

  function elegirPlaca(v: string | null) {
    const p = (catalogo?.placas ?? []).find(x => x.placa === v);
    set({ placa: v ?? '', ...(p?.marca ? { marca: p.marca } : {}) });
  }

  /** Mueve al paso pedido; para avanzar exige que los pasos anteriores estén completos */
  function ir(n: number) {
    const destino = Math.max(0, Math.min(ultimo, n));
    if (destino > paso) {
      for (let p = paso; p < destino; p++) {
        const malos = CAMPOS_PASO[p].filter(c => errores[c]);
        if (malos.length) { setTocados(s => new Set([...s, ...malos])); setDireccion(1); setPaso(p); haptic('warning'); return; }
      }
    }
    haptic('selection');
    setDireccion(destino >= paso ? 1 : -1);
    setPaso(destino);
  }

  async function guardar() {
    const malo = (Object.keys(errores) as Campo[])[0];
    if (malo) { const p = CAMPOS_PASO.findIndex(c => c.includes(malo)); setTocados(s => new Set([...s, malo])); setPaso(Math.max(0, p)); setError(errores[malo] ?? null); haptic('warning'); return; }
    setError(null); setGuardando(true);
    let creadoId: number | null = null;
    try {
      const r = await guardarSiniestro(siniestro?.id ?? null, { ...f, costo_repuestos: f.costo_repuestos.replace(',', '.'), costo_mano_obra: f.costo_mano_obra.replace(',', '.') });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      creadoId = siniestro?.id ?? (r as { id?: number }).id ?? null;
      // Los archivos se suben de a uno, con el id del siniestro (el nuevo, o el que se está corrigiendo)
      if (nuevos.length && creadoId) {
        setSubidos({ hechos: 0, total: nuevos.length });
        const rf = await subirAdjuntosSiniestro(creadoId, nuevos, (hechos, total) => setSubidos({ hechos, total }));
        if (rf.fallidos.length) throw new Error(`El siniestro se guardó, pero no se subieron: ${rf.fallidos.join(', ')}. Ábrelo de nuevo y agrégalos.`);
      }
      haptic('success'); toast(r.message || 'Guardado');
      await qc.invalidateQueries({ queryKey: ['mant', 'siniestros'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err)); haptic('warning');
      if (creadoId) await qc.invalidateQueries({ queryKey: ['mant', 'siniestros'] });
    } finally { setGuardando(false); setSubidos(null); }
  }

  const tiposAdjuntos = [...(guardados.data ?? []).map(a => a.tipo), ...nuevos.map(tipoDeFile)];

  return (
    <Sheet ancho open={abierto} onClose={() => !guardando && onClose()} title={siniestro ? `Siniestro ${siniestro.codigo}` : 'Registrar siniestro'}
      footer={
        <>
          {paso > 0
            ? <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => ir(paso - 1)} disabled={guardando}>Atrás</Button>
            : <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>}
          {paso < ultimo
            ? <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => ir(paso + 1)}>Siguiente</Button>
            : <Button variant="primary" onClick={guardar} loading={guardando}>
                {guardando && subidos ? `Subiendo ${subidos.hechos}/${subidos.total}…` : siniestro ? 'Guardar cambios' : 'Registrar siniestro'}
              </Button>}
        </>
      }>
      <div className="os-asist">
        <div className="os-asist__cab">
          <span className="t-eyebrow">Paso {paso + 1} de {PASOS.length}</span>
          <h3 className="os-asist__titulo">{PASOS[paso].titulo}</h3>
          <p className="os-asist__sub">{PASOS[paso].resumen}</p>
          <div className="os-prog" role="tablist" aria-label="Pasos del siniestro">
            {PASOS.map((p, i) => (
              <button key={p.titulo} type="button" role="tab" aria-selected={i === paso} aria-label={p.titulo} className="os-prog__paso" onClick={() => ir(i)}>
                <motion.span className="os-prog__lleno" initial={false} animate={{ scaleX: i <= paso ? 1 : 0 }} transition={spring} />
              </button>
            ))}
          </div>
        </div>

        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        <AnimatePresence mode="wait" initial={false} custom={direccion}>
          <motion.div key={paso} custom={direccion} className="os-asist__paso"
            initial={{ opacity: 0, x: reduce ? 0 : 36 * direccion }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : -36 * direccion }} transition={spring}>

            {paso === 0 && (
              <>
                <div className="gr__g3">
                  <Field label="Fecha *" error={ver('fecha')}>{p => <TextInput {...p} type="date" value={f.fecha} onChange={e => set({ fecha: e.target.value })} onBlur={() => setTocados(s => new Set(s).add('fecha'))} />}</Field>
                  <Field label="Placa *" error={ver('placa')} hint="La marca se completa sola">
                    {p => <Combobox {...p} options={placas} value={f.placa || null} limit={50} placeholder="Busca la placa" createLabel="Usar esta placa"
                      onChange={elegirPlaca} onCreate={t => set({ placa: t.toUpperCase().trim() })} />}
                  </Field>
                  <Field label="Marca">{p => <TextInput {...p} value={f.marca} onChange={e => set({ marca: e.target.value })} />}</Field>
                </div>
                <Field label="Conductor">
                  {p => <Combobox {...p} options={personalDe(catalogo, f.conductor)} value={f.conductor || null} limit={50} placeholder="Busca en el personal" createLabel="Usar este nombre"
                    onChange={v => set({ conductor: v ?? '' })} onCreate={t => set({ conductor: t.trim() })} />}
                </Field>
                <Field label="Ubicación del evento">{p => <TextInput {...p} value={f.ubicacion} placeholder="Dónde ocurrió" onChange={e => set({ ubicacion: e.target.value })} />}</Field>
                <Field label="Tipo de incidencia *" error={ver('tipo_incidencia')}>
                  {p => <Combobox {...p} options={listaDe(catalogo?.tipos ?? [], f.tipo_incidencia)} value={f.tipo_incidencia || null} limit={50} placeholder="Elige el tipo" createLabel="Usar este tipo"
                    onChange={v => set({ tipo_incidencia: v ?? '' })} onCreate={t => set({ tipo_incidencia: t.trim() })} />}
                </Field>
                <Field label="Detalle de daños o causa">
                  {p => <textarea className="input" id={p.id} aria-describedby={p['aria-describedby']} rows={4} value={f.detalle} placeholder="Qué se dañó y por qué" style={{ padding: '0.6rem 1rem', resize: 'vertical' }} onChange={e => set({ detalle: e.target.value })} />}
                </Field>
              </>
            )}

            {paso === 1 && (
              <AdjuntosSiniestro siniestroId={siniestro?.id ?? null} nuevos={nuevos} onNuevos={setNuevos} puedeQuitar={can('siniestros.editar')} disabled={guardando} />
            )}

            {paso === 2 && (
              <>
                <Field label="Técnico responsable" hint="Del mismo personal de la empresa">
                  {p => <Combobox {...p} options={personalDe(catalogo, f.tecnico)} value={f.tecnico || null} limit={50} placeholder="Busca en el personal" createLabel="Usar este nombre"
                    onChange={v => set({ tecnico: v ?? '' })} onCreate={t => set({ tecnico: t.trim() })} />}
                </Field>
                <div className="gr__g3">
                  <Field label="Inicio del trabajo">{p => <TextInput {...p} type="datetime-local" value={f.inicio} onChange={e => set({ inicio: e.target.value })} />}</Field>
                  <Field label="Fin del trabajo" error={ver('fin')}>{p => <TextInput {...p} type="datetime-local" value={f.fin} min={f.inicio || undefined} onChange={e => set({ fin: e.target.value })} onBlur={() => setTocados(s => new Set(s).add('fin'))} />}</Field>
                  <Field label="Horas en taller" hint="Se calculan solas">{p => <TextInput {...p} readOnly value={horas == null ? '—' : `${horas} h`} />}</Field>
                </div>
                <Field label="Estado del trabajo">
                  {p => <Combobox {...p} options={ESTADOS_SINIESTRO.map(e => ({ value: e, label: e }))} value={f.estado || null} placeholder="Estado" onChange={v => set({ estado: v ?? 'En Reparación' })} />}
                </Field>
              </>
            )}

            {paso === 3 && (
              <div className="gr__g3">
                <Field label="Repuestos (S/)">{p => <TextInput {...p} inputMode="decimal" value={f.costo_repuestos} placeholder="0.00" onChange={e => set({ costo_repuestos: e.target.value.replace(/[^\d.,]/g, '') })} />}</Field>
                <Field label="Mano de obra (S/)">{p => <TextInput {...p} inputMode="decimal" value={f.costo_mano_obra} placeholder="0.00" onChange={e => set({ costo_mano_obra: e.target.value.replace(/[^\d.,]/g, '') })} />}</Field>
                <Field label="Costo total" hint="Repuestos + mano de obra">{p => <TextInput {...p} readOnly value={formatSoles(total)} />}</Field>
              </div>
            )}

            {paso === 4 && (
              <div className="os-res">
                <div className="os-res__hero">
                  <span className="os-res__ruta">{f.placa || 'Sin placa'}{f.marca ? ` · ${f.marca}` : ''}</span>
                  <span className="os-res__cliente">{f.tipo_incidencia || 'Sin tipo de incidencia'}</span>
                  <span className="os-res__monto">{fechaCorta(f.fecha)} · {f.estado} · {formatSoles(total)}</span>
                </div>
                <GrupoResumen titulo="Qué pasó" paso={0} onCambiar={ir}>
                  <FilaResumen label="Conductor" valor={f.conductor} />
                  <FilaResumen label="Ubicación" valor={f.ubicacion} />
                  <FilaResumen label="Detalle" valor={f.detalle} />
                </GrupoResumen>
                <GrupoResumen titulo="Evidencias" paso={1} onCambiar={ir}>
                  <FilaResumen label="Archivos" valor={resumenAdjuntos(tiposAdjuntos)} />
                  {nuevos.length > 0 && <FilaResumen label="Por subir al registrar" valor={`${nuevos.length} ${nuevos.length === 1 ? 'archivo' : 'archivos'}`} />}
                </GrupoResumen>
                <GrupoResumen titulo="Taller" paso={2} onCambiar={ir}>
                  <FilaResumen label="Técnico" valor={f.tecnico} />
                  <FilaResumen label="Inicio" valor={fechaHoraCorta(f.inicio)} />
                  <FilaResumen label="Fin" valor={fechaHoraCorta(f.fin)} />
                  <FilaResumen label="Horas en taller" valor={horas == null ? '' : `${horas} h`} />
                </GrupoResumen>
                <GrupoResumen titulo="Costo" paso={3} onCambiar={ir}>
                  <FilaResumen label="Repuestos" valor={formatSoles(repuestos)} />
                  <FilaResumen label="Mano de obra" valor={formatSoles(manoObra)} />
                  <FilaResumen label="Total" valor={formatSoles(total)} />
                </GrupoResumen>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
