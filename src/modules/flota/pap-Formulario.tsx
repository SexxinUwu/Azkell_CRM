import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, CircleAlert, FileText, Gavel, Handshake, ImagePlus, ScanLine, Sparkles, Truck, Wallet } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { Notice } from '../../core/ui/Display';
import { EvidenciasArchivos } from '../../core/ui/EvidenciasArchivos';
import { Field, TextInput } from '../../core/ui/Field';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { formatMoneda } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { prepararEvidencia } from '../../core/lib/imagen';
import { usePlacas } from '../placas/api';
import {
  GRAVEDAD_TXT, TIPO_DOC_TXT, autocompletarPapeleta, consultarDni, crearPapeleta, editarPapeleta, leerFotoPapeleta, subirEvidencias,
  useCatalogosPap, type Gravedad, type Papeleta, type QuienAsume,
} from './pap-api';

const DEPARTAMENTOS = ['Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios',
  'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'];
const hoyLima = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
const sumarDias = (f: string, d: number) => { const x = new Date(`${f}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const redondear = (n: number) => Math.round(n * 100) / 100;
const num = (v: string) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

interface Datos {
  entidad_codigo: string; entidad_otra: string; tipo_documento: string; numero: string; fecha_infraccion: string; departamento: string; lugar: string; agente: string;
  placa: string; empresa_unidad: string; conductor_nombre: string; conductor_dni: string; licencia: string;
  infraccion_codigo: string; infraccion_desc: string; gravedad: Gravedad | ''; puntos: string; medida: string;
  moneda: 'PEN' | 'USD'; monto: string; descuento_monto: string; recargos: string;
  fecha_notificacion: string; fecha_limite_descargo: string; fecha_limite_descuento: string; fecha_limite_pago: string;
  quien_asume: QuienAsume; asume_nombre: string; observaciones: string;
}

const VACIO: Datos = {
  entidad_codigo: '', entidad_otra: '', tipo_documento: 'PAPELETA', numero: '', fecha_infraccion: '', departamento: '', lugar: '', agente: '',
  placa: '', empresa_unidad: '', conductor_nombre: '', conductor_dni: '', licencia: '',
  infraccion_codigo: '', infraccion_desc: '', gravedad: '', puntos: '', medida: '',
  moneda: 'PEN', monto: '', descuento_monto: '', recargos: '',
  fecha_notificacion: '', fecha_limite_descargo: '', fecha_limite_descuento: '', fecha_limite_pago: '',
  quien_asume: 'EMPRESA', asume_nombre: '', observaciones: '',
};

const desdePapeleta = (p: Papeleta): Datos => ({
  entidad_codigo: p.entidad_codigo, entidad_otra: p.entidad_otra ?? '', tipo_documento: p.tipo_documento, numero: p.numero, fecha_infraccion: p.fecha_infraccion, departamento: p.departamento ?? '',
  lugar: p.lugar ?? '', agente: p.agente ?? '', placa: p.placa, empresa_unidad: p.empresa_unidad ?? '', conductor_nombre: p.conductor_nombre ?? '', conductor_dni: p.conductor_dni ?? '', licencia: p.licencia ?? '',
  infraccion_codigo: p.infraccion_codigo ?? '', infraccion_desc: p.infraccion_desc ?? '', gravedad: p.gravedad ?? '', puntos: p.puntos != null ? String(p.puntos) : '', medida: p.medida ?? '',
  moneda: p.moneda, monto: String(p.monto), descuento_monto: p.descuento_monto ? String(p.descuento_monto) : '', recargos: p.recargos ? String(p.recargos) : '',
  fecha_notificacion: p.fecha_notificacion ?? '', fecha_limite_descargo: p.fecha_limite_descargo ?? '', fecha_limite_descuento: p.fecha_limite_descuento ?? '', fecha_limite_pago: p.fecha_limite_pago ?? '',
  quien_asume: p.quien_asume, asume_nombre: p.asume_nombre ?? '', observaciones: p.observaciones ?? '',
});

function Seccion({ n, icono, titulo, ayuda, children }: { n: number; icono: ReactNode; titulo: string; ayuda: string; children: ReactNode }) {
  return (
    <section className="pap-sec">
      <header className="pap-sec__cab">
        <span className="pap-sec__num">{n}</span>
        <div><h3>{titulo}</h3><p>{ayuda}</p></div>
        <span className="pap-sec__icono" aria-hidden>{icono}</span>
      </header>
      {children}
    </section>
  );
}

/**
 * Registrar o editar una papeleta. Se escribe lo mínimo: la placa trae la empresa y el conductor del viaje de ese día, el DNI trae el nombre,
 * el código de infracción trae su descripción, gravedad, puntos y multa, la entidad trae los plazos, y una foto de la papeleta se lee con IA.
 * Lo que se completa solo se puede corregir; la persona siempre revisa antes de guardar.
 */
export function PapFormulario({ abierto, papeleta, onClose, onHecho }: {
  abierto: boolean; papeleta: Papeleta | null; onClose: () => void; onHecho: (id?: number) => unknown;
}) {
  const toast = useToast();
  const cat = useCatalogosPap();
  const placas = usePlacas();
  const editando = !!papeleta;
  const [f, setF] = useState<Datos>(VACIO);
  const [fotos, setFotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [notaIA, setNotaIA] = useState<string | null>(null);
  const [origenConductor, setOrigenConductor] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  // Campos que la persona escribió a mano: lo automático no los pisa
  const tocado = useRef<Set<string>>(new Set());
  const entradaIA = useRef<HTMLInputElement>(null);
  const turnoPlaca = useRef(0);
  const [abiertoPara, setAbiertoPara] = useState<string | null>(null);

  const clave = abierto ? (papeleta ? `e${papeleta.id}` : 'nuevo') : null;
  if (clave && abiertoPara !== clave) {
    setAbiertoPara(clave);
    setF(papeleta ? desdePapeleta(papeleta) : { ...VACIO, fecha_infraccion: `${hoyLima()}T12:00` });
    setFotos([]); setError(null); setNotaIA(null); setOrigenConductor(null); setIntento(false);
    tocado.current = new Set(papeleta ? ['monto', 'plazos', 'conductor', 'asume', 'infraccion', 'descuento'] : []);
  }
  if (!clave && abiertoPara !== null) setAbiertoPara(null);

  const set = <K extends keyof Datos>(k: K, v: Datos[K], marca?: string) => { if (marca) tocado.current.add(marca); setF(p => ({ ...p, [k]: v })); };
  const entidades = useMemo(() => (cat.data?.entidades ?? []).filter(e => e.activo), [cat.data]);
  const entidad = entidades.find(e => e.codigo === f.entidad_codigo) ?? null;
  const infracciones = useMemo(() => (cat.data?.infracciones ?? []).filter(i => i.activo && (!i.entidad_codigo || i.entidad_codigo === f.entidad_codigo)), [cat.data, f.entidad_codigo]);
  const uit = Number(cat.data?.config.uit_valor) || 0;

  // 1) Placa → unidad, empresa dueña, conductor del viaje de ese día y quién asume
  useEffect(() => {
    if (!abierto || editando) return;
    const placa = f.placa.replace(/[^A-Z0-9]/gi, '');
    if (placa.length < 5) return;
    const turno = ++turnoPlaca.current;
    const t = window.setTimeout(() => {
      autocompletarPapeleta(placa, f.fecha_infraccion.slice(0, 10) || hoyLima()).then(r => {
        if (turno !== turnoPlaca.current) return;
        setF(p => ({
          ...p,
          empresa_unidad: r.unidad?.empresa ?? p.empresa_unidad,
          ...(!tocado.current.has('conductor') && r.conductor ? { conductor_nombre: r.conductor.nombre, conductor_dni: r.conductor.dni ?? '', licencia: r.conductor.licencia ?? '' } : {}),
          ...(!tocado.current.has('asume') && r.quien_asume ? { quien_asume: r.quien_asume, asume_nombre: r.asume_nombre ?? '' } : {}),
        }));
        setOrigenConductor(!tocado.current.has('conductor') && r.conductor ? r.conductor.origen : null);
      }).catch(() => { /* sin datos: se escribe a mano */ });
    }, 450);
    return () => window.clearTimeout(t);
  }, [abierto, editando, f.placa, f.fecha_infraccion]);

  // 2) DNI → nombre (y licencia si el conductor ya existe)
  useEffect(() => {
    const dni = f.conductor_dni.replace(/\D/g, '');
    if (!abierto || dni.length !== 8 || f.conductor_nombre.trim()) return;
    let vigente = true;
    consultarDni(dni).then(r => { if (vigente && r) setF(p => (p.conductor_nombre ? p : { ...p, conductor_nombre: r.nombre, licencia: p.licencia || r.licencia || '' })); });
    return () => { vigente = false; };
  }, [abierto, f.conductor_dni, f.conductor_nombre]);

  // 3) Código de infracción → descripción, gravedad, puntos, medida y multa
  const infraccionCat = useMemo(() => infracciones.find(i => i.codigo.toUpperCase() === f.infraccion_codigo.trim().toUpperCase()) ?? null, [infracciones, f.infraccion_codigo]);
  useEffect(() => {
    if (!abierto || !infraccionCat || tocado.current.has('infraccion')) return;
    const multa = infraccionCat.multa_soles && infraccionCat.multa_soles > 0 ? infraccionCat.multa_soles : infraccionCat.multa_uit && uit > 0 ? redondear(infraccionCat.multa_uit * uit) : null;
    setF(p => ({
      ...p, infraccion_desc: infraccionCat.descripcion, gravedad: infraccionCat.gravedad ?? p.gravedad,
      puntos: infraccionCat.puntos != null ? String(infraccionCat.puntos) : p.puntos, medida: infraccionCat.medida ?? p.medida,
      ...(multa != null && !tocado.current.has('monto') ? { monto: String(multa) } : {}),
    }));
  }, [abierto, infraccionCat, uit]);

  // 4) Entidad + fecha → plazos y descuento (contados desde la notificación, o desde la infracción)
  const base = f.fecha_notificacion || f.fecha_infraccion.slice(0, 10);
  useEffect(() => {
    if (!abierto || !entidad || !base || tocado.current.has('plazos')) return;
    const dias = (d: number | null) => (d != null ? sumarDias(base, d) : '');
    setF(p => ({
      ...p,
      fecha_limite_descargo: dias(entidad.dias_descargo), fecha_limite_pago: dias(entidad.dias_pago), fecha_limite_descuento: dias(entidad.dias_descuento),
      ...(!tocado.current.has('descuento') ? { descuento_monto: entidad.pct_descuento != null && entidad.dias_descuento != null && num(p.monto) > 0 ? String(redondear(num(p.monto) * entidad.pct_descuento / 100)) : '' } : {}),
    }));
  }, [abierto, entidad, base, f.monto]);

  // Lectura con IA de una foto o PDF de la papeleta: rellena lo que se vea; la persona revisa
  async function leerConIA(archivo: File | undefined) {
    if (!archivo) return;
    setLeyendo(true); setError(null);
    try {
      const foto = await prepararEvidencia(archivo);
      const { datos: d } = await leerFotoPapeleta(foto);
      const ponerSiHay = (k: keyof Datos, v: unknown) => (v != null && v !== '' ? { [k]: String(v) } : {});
      setF(p => ({
        ...p,
        ...(d.entidad_codigo ? { entidad_codigo: d.entidad_codigo } : {}), ...(d.tipo_documento ? { tipo_documento: d.tipo_documento } : {}),
        ...ponerSiHay('numero', d.numero), ...(d.fecha_infraccion ? { fecha_infraccion: d.fecha_infraccion.length === 10 ? `${d.fecha_infraccion}T12:00` : d.fecha_infraccion } : {}),
        ...ponerSiHay('lugar', d.lugar), ...ponerSiHay('departamento', d.departamento), ...ponerSiHay('agente', d.agente), ...ponerSiHay('placa', d.placa),
        ...ponerSiHay('conductor_nombre', d.conductor_nombre), ...ponerSiHay('conductor_dni', d.conductor_dni), ...ponerSiHay('licencia', d.licencia),
        ...ponerSiHay('infraccion_codigo', d.infraccion_codigo), ...ponerSiHay('infraccion_desc', d.infraccion_desc),
        ...(d.monto != null ? { monto: String(d.monto), moneda: d.moneda } : {}),
        ...ponerSiHay('fecha_notificacion', d.fecha_notificacion), ...ponerSiHay('observaciones', d.observaciones),
      }));
      if (d.conductor_nombre) tocado.current.add('conductor');
      setFotos(prev => [...prev, foto]);
      setNotaIA('Datos leídos del documento con IA. Revísalos antes de guardar: la IA puede equivocarse.');
      haptic('success');
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setLeyendo(false); if (entradaIA.current) entradaIA.current.value = ''; }
  }

  const total = redondear(num(f.monto) + num(f.recargos));
  const conDescuento = num(f.descuento_monto) > 0 ? redondear(total - num(f.descuento_monto)) : null;
  const moneda = f.moneda === 'USD' ? 'USD' : 'PEN';

  async function guardar() {
    setError(null); setIntento(true);
    if (!f.entidad_codigo) { setError('Elige la entidad que impuso la papeleta.'); return; }
    if (f.entidad_codigo === 'OTRA' && !f.entidad_otra.trim()) { setError('Escribe el nombre de la entidad.'); return; }
    if (!f.numero.trim()) { setError('Escribe el número del documento.'); return; }
    if (!f.fecha_infraccion) { setError('Indica la fecha de la infracción.'); return; }
    if (f.placa.replace(/[^A-Z0-9]/gi, '').length < 5) { setError('Elige la placa de la unidad.'); return; }
    setGuardando(true);
    try {
      const payload = { ...f, placa: f.placa.replace(/[^A-Z0-9]/gi, '').toUpperCase(), monto: num(f.monto), descuento_monto: num(f.descuento_monto), recargos: num(f.recargos), puntos: f.puntos === '' ? '' : num(f.puntos) };
      const r = editando && papeleta ? await editarPapeleta(papeleta.id, payload) : await crearPapeleta(payload);
      const id = editando && papeleta ? papeleta.id : r.id;
      if (id && fotos.length) {
        try { await subirEvidencias(id, fotos); } catch (e) { toast(`La papeleta se guardó, pero las fotos no se subieron: ${errorMessage(e)}`, 'error'); }
      }
      haptic('success');
      toast(editando ? 'Papeleta actualizada' : `Papeleta registrada (${r.codigo})`);
      await onHecho(id);
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  const sinPlazos = !!entidad && entidad.dias_descargo == null && entidad.dias_pago == null && entidad.dias_descuento == null;

  return (
    <Sheet open={abierto} onClose={() => !guardando && onClose()} ancho anclaAbajo ligera title={editando ? `Editar ${papeleta?.codigo}` : 'Registrar papeleta'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" icon={<BadgeCheck size={16} />} onClick={() => { void guardar(); }} loading={guardando}>{editando ? 'Guardar cambios' : 'Registrar papeleta'}</Button></>}>
      <div className="pap-form">
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        {/* Lectura con IA: lo más rápido es una foto */}
        {!editando && (
          <div className="pap-ia">
            <span className="pap-ia__icono" aria-hidden><Sparkles size={20} /></span>
            <div><strong>Escribe menos: sube la papeleta (foto o PDF)</strong><span>Se leen la entidad, el número, la fecha, la placa, la infracción y el monto. Tú solo revisas.</span></div>
            <Button variant="secondary" icon={<ScanLine size={16} />} loading={leyendo} onClick={() => entradaIA.current?.click()}>Leer documento</Button>
            <input ref={entradaIA} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={e => { void leerConIA(e.target.files?.[0]); }} />
          </div>
        )}
        {notaIA && <Notice tone="accent" icon={<Sparkles size={16} />}>{notaIA}</Notice>}

        <Seccion n={1} icono={<FileText size={18} />} titulo="Documento" ayuda="Quién la impuso y cuándo">
          <div className="pap-grid">
            <Field label="Entidad" error={intento && !f.entidad_codigo ? 'Elige la entidad' : undefined}>
              {p => <Combobox {...p} value={f.entidad_codigo || null} onChange={v => { tocado.current.delete('plazos'); tocado.current.delete('descuento'); set('entidad_codigo', v ?? ''); }} placeholder="SUTRAN, PNP, SAT…"
                options={entidades.map(e => ({ value: e.codigo, label: e.nombre, description: e.ambito ?? undefined, keywords: e.codigo }))} />}
            </Field>
            {f.entidad_codigo === 'OTRA' && (
              <Field label="Nombre de la entidad">{p => <TextInput {...p} value={f.entidad_otra} onChange={e => set('entidad_otra', e.target.value)} />}</Field>
            )}
            <Field label="Tipo de documento">
              {p => <Combobox {...p} value={f.tipo_documento} onChange={v => set('tipo_documento', v ?? 'PAPELETA')} options={Object.entries(TIPO_DOC_TXT).map(([v, l]) => ({ value: v, label: l }))} />}
            </Field>
            <Field label="N° del documento" error={intento && !f.numero.trim() ? 'Escribe el número' : undefined}>
              {p => <TextInput {...p} value={f.numero} onChange={e => set('numero', e.target.value)} className="font-mono" autoComplete="off" />}
            </Field>
            <Field label="Fecha y hora de la infracción">
              {p => <TextInput {...p} type="datetime-local" max={`${hoyLima()}T23:59`} value={f.fecha_infraccion} onChange={e => set('fecha_infraccion', e.target.value)} />}
            </Field>
            <Field label="Departamento">
              {p => <Combobox {...p} value={f.departamento || null} onChange={v => set('departamento', v ?? '')} placeholder="Elige o escribe" options={DEPARTAMENTOS.map(d => ({ value: d, label: d }))}
                onCreate={t => set('departamento', t.trim())} createLabel="Usar" />}
            </Field>
            <Field label="Lugar (vía y kilómetro)" wide>{p => <TextInput {...p} value={f.lugar} onChange={e => set('lugar', e.target.value)} placeholder="Ej. Panamericana Sur km 45" />}</Field>
            <Field label="Agente o inspector" wide>{p => <TextInput {...p} value={f.agente} onChange={e => set('agente', e.target.value)} placeholder="Opcional" />}</Field>
          </div>
        </Seccion>

        <Seccion n={2} icono={<Truck size={18} />} titulo="Unidad y conductor" ayuda="Con la placa se completan la empresa y el conductor del viaje de ese día">
          <div className="pap-grid">
            <Field label="Placa" error={intento && f.placa.length < 5 ? 'Elige la placa' : undefined}>
              {p => <PlacaPicker id={p.id} value={f.placa} onChange={v => set('placa', v)} placeholder="Elige la placa…"
                opciones={(placas.data ?? []).map(x => ({ placa: x.placa, detalle: [x.marca, x.cliente].filter(Boolean).join(' · ') }))} />}
            </Field>
            <Field label="Empresa dueña de la unidad">{p => <TextInput {...p} value={f.empresa_unidad} onChange={e => set('empresa_unidad', e.target.value)} />}</Field>
            <Field label="DNI del conductor" hint="Al escribirlo se completa el nombre">
              {p => <TextInput {...p} inputMode="numeric" maxLength={8} value={f.conductor_dni} onChange={e => set('conductor_dni', e.target.value.replace(/\D/g, ''), 'conductor')} className="font-mono" />}
            </Field>
            <Field label="Conductor" hint={origenConductor ? `Tomado automáticamente: ${origenConductor}` : undefined}>
              {p => <TextInput {...p} value={f.conductor_nombre} onChange={e => set('conductor_nombre', e.target.value, 'conductor')} />}
            </Field>
            <Field label="Licencia de conducir">{p => <TextInput {...p} value={f.licencia} onChange={e => set('licencia', e.target.value)} className="font-mono" />}</Field>
          </div>
        </Seccion>

        <Seccion n={3} icono={<Gavel size={18} />} titulo="Infracción" ayuda="Con el código del catálogo se completa lo demás">
          <div className="pap-grid">
            <Field label="Código" hint={infracciones.length ? 'Elige del catálogo o escribe uno nuevo' : 'El catálogo está vacío: cárgalo en la pestaña Catálogos'}>
              {p => <Combobox {...p} value={f.infraccion_codigo || null} onChange={v => set('infraccion_codigo', v ?? '')} placeholder="Ej. M-01"
                options={infracciones.map(i => ({ value: i.codigo, label: i.codigo, description: i.descripcion }))} onCreate={t => set('infraccion_codigo', t.trim().toUpperCase())} createLabel="Usar código" />}
            </Field>
            <Field label="Gravedad">
              {() => <SegmentedControl<Gravedad | ''> label="Gravedad" block value={f.gravedad} onChange={v => set('gravedad', v, 'infraccion')}
                options={[{ value: 'LEVE', label: GRAVEDAD_TXT.LEVE }, { value: 'GRAVE', label: GRAVEDAD_TXT.GRAVE }, { value: 'MUY_GRAVE', label: GRAVEDAD_TXT.MUY_GRAVE }]} />}
            </Field>
            <Field label="Descripción" wide>{p => <TextInput {...p} value={f.infraccion_desc} onChange={e => set('infraccion_desc', e.target.value, 'infraccion')} />}</Field>
            <Field label="Puntos en la licencia">{p => <TextInput {...p} inputMode="numeric" value={f.puntos} onChange={e => set('puntos', e.target.value.replace(/\D/g, ''), 'infraccion')} />}</Field>
            <Field label="Medida (retención, internamiento…)">{p => <TextInput {...p} value={f.medida} onChange={e => set('medida', e.target.value, 'infraccion')} placeholder="Opcional" />}</Field>
          </div>
        </Seccion>

        <Seccion n={4} icono={<Wallet size={18} />} titulo="Importe y plazos" ayuda={sinPlazos ? 'La entidad no tiene días configurados: escribe las fechas o complétalos en Catálogos' : 'Los plazos se calculan con los días de la entidad'}>
          <div className="pap-grid">
            <Field label="Moneda">
              {() => <SegmentedControl<'PEN' | 'USD'> label="Moneda" block value={f.moneda} onChange={v => set('moneda', v)} options={[{ value: 'PEN', label: 'Soles' }, { value: 'USD', label: 'Dólares' }]} />}
            </Field>
            <Field label="Monto de la multa" hint={uit > 0 ? undefined : 'Si la infracción tiene % de UIT, configura el valor de la UIT en Catálogos'}>
              {p => <TextInput {...p} inputMode="decimal" value={f.monto} onChange={e => set('monto', e.target.value, 'monto')} />}
            </Field>
            <Field label="Descuento por pronto pago (monto)">{p => <TextInput {...p} inputMode="decimal" value={f.descuento_monto} onChange={e => set('descuento_monto', e.target.value, 'descuento')} placeholder="0.00" />}</Field>
            <Field label="Recargos o intereses">{p => <TextInput {...p} inputMode="decimal" value={f.recargos} onChange={e => set('recargos', e.target.value)} placeholder="0.00" />}</Field>
            <Field label="Fecha de notificación" hint="Los plazos se cuentan desde aquí (si no hay, desde la infracción)">
              {p => <TextInput {...p} type="date" value={f.fecha_notificacion} onChange={e => set('fecha_notificacion', e.target.value)} />}
            </Field>
            <Field label="Fin del descuento">{p => <TextInput {...p} type="date" value={f.fecha_limite_descuento} onChange={e => set('fecha_limite_descuento', e.target.value, 'plazos')} />}</Field>
            <Field label="Límite de descargo">{p => <TextInput {...p} type="date" value={f.fecha_limite_descargo} onChange={e => set('fecha_limite_descargo', e.target.value, 'plazos')} />}</Field>
            <Field label="Límite de pago">{p => <TextInput {...p} type="date" value={f.fecha_limite_pago} onChange={e => set('fecha_limite_pago', e.target.value, 'plazos')} />}</Field>
            <div className="field field--wide pap-total">
              <div><span className="pap-k">Total</span><strong className="t-numeric">{formatMoneda(total, moneda)}</strong></div>
              {conDescuento != null && <div><span className="pap-k">Con descuento</span><strong className="t-numeric pap-resalta">{formatMoneda(conDescuento, moneda)}</strong></div>}
            </div>
          </div>
        </Seccion>

        <Seccion n={5} icono={<Handshake size={18} />} titulo="Quién asume el pago" ayuda="Por defecto la empresa; si la unidad está alquilada, quien la alquila">
          <div className="pap-grid">
            <Field label="Responsable del pago" wide>
              {() => <SegmentedControl<QuienAsume> label="Quién asume el pago" block value={f.quien_asume} onChange={v => { set('quien_asume', v, 'asume'); setF(p => ({ ...p, asume_nombre: v === 'CONDUCTOR' ? p.conductor_nombre : v === 'EMPRESA' ? p.empresa_unidad : p.asume_nombre })); }}
                options={[{ value: 'EMPRESA', label: 'La empresa' }, { value: 'CONDUCTOR', label: 'El conductor' }, { value: 'ALQUILADA', label: 'Quien alquila' }, { value: 'TERCERO', label: 'Un tercero' }]} />}
            </Field>
            <Field label="Nombre de quien asume" wide>{p => <TextInput {...p} value={f.asume_nombre} onChange={e => set('asume_nombre', e.target.value, 'asume')} />}</Field>
          </div>
        </Seccion>

        <Seccion n={6} icono={<ImagePlus size={18} />} titulo="Evidencias y observaciones" ayuda="Foto o PDF de la papeleta, fotodetección, notificación…">
          <div className="pap-grid">
            <div className="field field--wide">
              <EvidenciasArchivos archivos={fotos} onCambio={setFotos} max={20} titulo="Archivos de la papeleta" ayuda="Toma una foto o elige varias de tu galería (no salen en el PDF)" disabled={guardando} />
            </div>
            <Field label="Observaciones" wide>{p => <TextInput {...p} value={f.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Opcional" />}</Field>
          </div>
        </Seccion>
      </div>
    </Sheet>
  );
}
