import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox, type ComboboxOption } from '../../core/ui/Combobox';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { ESTADOS_SINIESTRO, guardarSiniestro, hoyIso, num, type CatalogoSiniestros, type Siniestro } from './siniestrosApi';

interface Form {
  fecha: string; placa: string; marca: string; conductor: string; ubicacion: string; tipo_incidencia: string; detalle: string; tecnico: string;
  inicio: string; fin: string; costo_repuestos: string; costo_mano_obra: string; estado: string;
}

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

/** Registrar o corregir un siniestro. Las horas de taller y el costo total se calculan solos. */
export function SiniestroSheet({ abierto, siniestro, catalogo, onClose }: { abierto: boolean; siniestro: Siniestro | null; catalogo: CatalogoSiniestros | undefined; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(VACIO);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (abierto) { setF(siniestro ? desdeSiniestro(siniestro) : VACIO()); setError(null); } }, [abierto, siniestro]);
  const set = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));

  const placas = useMemo<ComboboxOption[]>(() => {
    const base = (catalogo?.placas ?? []).map(p => ({ value: p.placa, label: p.placa, description: [p.marca, p.tipo].filter(Boolean).join(' · ') || undefined }));
    return f.placa && !base.some(o => o.value === f.placa) ? [{ value: f.placa, label: f.placa }, ...base] : base;
  }, [catalogo, f.placa]);

  const horas = horasEntre(f.inicio, f.fin);
  const total = num(f.costo_repuestos.replace(',', '.')) + num(f.costo_mano_obra.replace(',', '.'));

  function elegirPlaca(v: string | null) {
    const p = (catalogo?.placas ?? []).find(x => x.placa === v);
    set({ placa: v ?? '', ...(p?.marca ? { marca: p.marca } : {}) });
  }

  async function guardar() {
    if (!f.fecha) { setError('Indica la fecha del siniestro.'); return; }
    if (!f.placa.trim()) { setError('Elige la placa de la unidad.'); return; }
    if (!f.tipo_incidencia.trim()) { setError('Elige o escribe el tipo de incidencia.'); return; }
    if (f.inicio && f.fin && horas == null) { setError('El fin del trabajo no puede ser anterior a su inicio.'); return; }
    setError(null); setGuardando(true);
    try {
      const r = await guardarSiniestro(siniestro?.id ?? null, { ...f, costo_repuestos: f.costo_repuestos.replace(',', '.'), costo_mano_obra: f.costo_mano_obra.replace(',', '.') });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast(r.message || 'Guardado');
      await qc.invalidateQueries({ queryKey: ['mant', 'siniestros'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  return (
    <Sheet ancho open={abierto} onClose={() => !guardando && onClose()} title={siniestro ? `Siniestro ${siniestro.codigo}` : 'Registrar siniestro'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button><Button variant="primary" onClick={guardar} loading={guardando}>{siniestro ? 'Guardar cambios' : 'Registrar'}</Button></>}>
      <div className="gr gr--compacto">
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        <section className="os-seccion">
          <h3 className="os-seccion__titulo">Qué pasó</h3>
          <div className="os-seccion__cuerpo">
            <div className="gr__g3">
              <Field label="Fecha *">{p => <TextInput {...p} type="date" value={f.fecha} onChange={e => set({ fecha: e.target.value })} />}</Field>
              <Field label="Placa *" hint="La marca se completa sola">
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
            <Field label="Tipo de incidencia *">
              {p => <Combobox {...p} options={listaDe(catalogo?.tipos ?? [], f.tipo_incidencia)} value={f.tipo_incidencia || null} limit={50} placeholder="Elige el tipo" createLabel="Usar este tipo"
                onChange={v => set({ tipo_incidencia: v ?? '' })} onCreate={t => set({ tipo_incidencia: t.trim() })} />}
            </Field>
            <Field label="Detalle de daños o causa">
              {p => <textarea className="input" id={p.id} aria-describedby={p['aria-describedby']} rows={3} value={f.detalle} placeholder="Qué se dañó y por qué" style={{ padding: '0.6rem 1rem', resize: 'vertical' }} onChange={e => set({ detalle: e.target.value })} />}
            </Field>
          </div>
        </section>

        <section className="os-seccion">
          <h3 className="os-seccion__titulo">Trabajo en taller</h3>
          <div className="os-seccion__cuerpo">
            <Field label="Técnico responsable" hint="Del mismo personal de la empresa">
              {p => <Combobox {...p} options={personalDe(catalogo, f.tecnico)} value={f.tecnico || null} limit={50} placeholder="Busca en el personal" createLabel="Usar este nombre"
                onChange={v => set({ tecnico: v ?? '' })} onCreate={t => set({ tecnico: t.trim() })} />}
            </Field>
            <div className="gr__g3">
              <Field label="Inicio del trabajo">{p => <TextInput {...p} type="datetime-local" value={f.inicio} onChange={e => set({ inicio: e.target.value })} />}</Field>
              <Field label="Fin del trabajo">{p => <TextInput {...p} type="datetime-local" value={f.fin} min={f.inicio || undefined} onChange={e => set({ fin: e.target.value })} />}</Field>
              <Field label="Horas en taller" hint="Se calculan solas">{p => <TextInput {...p} readOnly value={horas == null ? '—' : `${horas} h`} />}</Field>
            </div>
            <Field label="Estado del trabajo">
              {p => <Combobox {...p} options={ESTADOS_SINIESTRO.map(e => ({ value: e, label: e }))} value={f.estado || null} placeholder="Estado" onChange={v => set({ estado: v ?? 'En Reparación' })} />}
            </Field>
          </div>
        </section>

        <section className="os-seccion">
          <h3 className="os-seccion__titulo">Costo</h3>
          <div className="os-seccion__cuerpo">
            <div className="gr__g3">
              <Field label="Repuestos (S/)">{p => <TextInput {...p} inputMode="decimal" value={f.costo_repuestos} placeholder="0.00" onChange={e => set({ costo_repuestos: e.target.value.replace(/[^\d.,]/g, '') })} />}</Field>
              <Field label="Mano de obra (S/)">{p => <TextInput {...p} inputMode="decimal" value={f.costo_mano_obra} placeholder="0.00" onChange={e => set({ costo_mano_obra: e.target.value.replace(/[^\d.,]/g, '') })} />}</Field>
              <Field label="Costo total" hint="Repuestos + mano de obra">{p => <TextInput {...p} readOnly value={formatSoles(total)} />}</Field>
            </div>
          </div>
        </section>
      </div>
    </Sheet>
  );
}
