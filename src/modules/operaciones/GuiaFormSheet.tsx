import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, Search, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

// Redacción de borradores de guía de remitente (GRE) y de transportista (GRT).
// Solo guarda borradores (POST/PUT). La emisión a SUNAT vive en GuiasElectronicas y depende del ambiente.

export type TipoGuia = 'remitente' | 'transportista';
type Reg = Record<string, unknown>;

interface ItemForm { descripcion: string; cantidad: string; unidad_medida: string; peso_unitario: string }

interface Form {
  fecha_emision: string; fecha_traslado: string;
  motivo_traslado: string; descripcion_motivo: string;
  modalidad: string; total_bultos: string; peso_total: string; unidad_medida: string;
  transbordo: boolean; retorno_vacio: boolean; retorno_envases: boolean; traslado_m1_l: boolean;
  remitente_ruc: string; remitente_razon_social: string;
  destinatario_ruc: string; destinatario_razon_social: string;
  partida_ubigeo: string; partida_direccion: string; llegada_ubigeo: string; llegada_direccion: string;
  transportista_ruc: string; transportista_razon_social: string; registro_mtc: string;
  vehiculo_placa: string; vehiculo_secundario_placa: string;
  conductor_tipo_doc: string; conductor_num_doc: string; conductor_nombres: string; conductor_apellidos: string; conductor_licencia: string;
  costo_flete: string; gre_vinculada_numero: string; gre_vinculada_ruc: string;
  orden_viaje: string; observaciones: string;
  items: ItemForm[];
}
type StrKeys = { [K in keyof Form]: Form[K] extends string ? K : never }[keyof Form];
type BoolKeys = { [K in keyof Form]: Form[K] extends boolean ? K : never }[keyof Form];

// Motivos de traslado tomados de las listas de la versión actual
const MOTIVOS: Record<TipoGuia, [string, string][]> = {
  remitente: [
    ['01', '01 - Venta'], ['02', '02 - Compra'], ['04', '04 - Traslado entre establecimientos'], ['08', '08 - Importación'],
    ['09', '09 - Exportación'], ['13', '13 - Otros'], ['14', '14 - Venta con entrega a terceros'],
    ['18', '18 - Emisor itinerante'], ['19', '19 - Traslado a zona primaria'],
  ],
  transportista: [
    ['01', '01 - Prestación de servicios de transporte'], ['02', '02 - Compra'], ['04', '04 - Traslado entre establecimientos'],
    ['08', '08 - Importación'], ['09', '09 - Exportación'], ['13', '13 - Otros'], ['14', '14 - Venta sujeta a confirmación'],
    ['17', '17 - Traslado de bienes para transformación'], ['18', '18 - Traslado emisor itinerante'],
  ],
};
const UNIDADES_PESO: [string, string][] = [['KGM', 'Kilogramo (KGM)'], ['TNE', 'Tonelada (TNE)']];
const UNIDADES_ITEM: [string, string][] = [['NIU', 'Unidad (NIU)'], ['KGM', 'Kilogramo (KGM)'], ['TNE', 'Tonelada (TNE)'], ['LTR', 'Litro (LTR)'], ['GLL', 'Galón (GLL)']];
const TIPOS_DOC_CONDUCTOR: [string, string][] = [['1', 'DNI'], ['4', 'Carné de extranjería'], ['7', 'Pasaporte']];
const MODALIDADES: [string, string][] = [['01', '01 - Transporte público (tercero)'], ['02', '02 - Transporte privado (vehículo propio)']];

const RUTA: Record<TipoGuia, string> = { remitente: '/guia-remitente', transportista: '/guia-transportista' };
const TITULO: Record<TipoGuia, string> = { remitente: 'Guía de remitente', transportista: 'Guía de transportista' };
const ITEM_VACIO: ItemForm = { descripcion: '', cantidad: '1', unidad_medida: 'NIU', peso_unitario: '' };

const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
const txt = (v: unknown) => (v == null ? '' : String(v));
const pick = (nuevo: unknown, actual: string) => (txt(nuevo).trim() ? txt(nuevo).trim() : actual);
const docTipo = (ruc: string) => (ruc.trim().length === 8 ? '1' : '6');

function formVacio(): Form {
  const h = hoy();
  return {
    fecha_emision: h, fecha_traslado: h, motivo_traslado: '01', descripcion_motivo: 'VENTA',
    modalidad: '01', total_bultos: '1', peso_total: '', unidad_medida: 'KGM',
    transbordo: false, retorno_vacio: false, retorno_envases: false, traslado_m1_l: false,
    remitente_ruc: '', remitente_razon_social: '', destinatario_ruc: '', destinatario_razon_social: '',
    partida_ubigeo: '', partida_direccion: '', llegada_ubigeo: '', llegada_direccion: '',
    transportista_ruc: '', transportista_razon_social: '', registro_mtc: '',
    vehiculo_placa: '', vehiculo_secundario_placa: '',
    conductor_tipo_doc: '1', conductor_num_doc: '', conductor_nombres: '', conductor_apellidos: '', conductor_licencia: '',
    costo_flete: '', gre_vinculada_numero: '', gre_vinculada_ruc: '',
    orden_viaje: '', observaciones: '',
    items: [{ ...ITEM_VACIO }],
  };
}

// Carga una guía existente (detalle del servidor) en el formulario
function desdeGuia(g: Reg, items: Reg[]): Form {
  const b = formVacio();
  return {
    ...b,
    fecha_emision: txt(g.fecha_emision).slice(0, 10) || b.fecha_emision,
    fecha_traslado: txt(g.fecha_traslado).slice(0, 10) || b.fecha_traslado,
    motivo_traslado: txt(g.motivo_traslado) || '01',
    descripcion_motivo: txt(g.descripcion_motivo) || 'VENTA',
    modalidad: txt(g.modalidad_transporte) || '01',
    total_bultos: txt(g.total_bultos) || '1',
    peso_total: txt(g.peso_total),
    unidad_medida: txt(g.unidad_medida) || 'KGM',
    transbordo: !!Number(g.indicador_transbordo),
    retorno_vacio: !!Number(g.indicador_retorno_vehiculo_vacio),
    retorno_envases: !!Number(g.indicador_retorno_envases_vacios),
    traslado_m1_l: !!Number(g.indicador_traslado_total_m1_l),
    remitente_ruc: txt(g.remitente_ruc), remitente_razon_social: txt(g.remitente_razon_social),
    destinatario_ruc: txt(g.destinatario_ruc), destinatario_razon_social: txt(g.destinatario_razon_social),
    partida_ubigeo: txt(g.partida_ubigeo), partida_direccion: txt(g.partida_direccion),
    llegada_ubigeo: txt(g.llegada_ubigeo), llegada_direccion: txt(g.llegada_direccion),
    transportista_ruc: txt(g.transportista_ruc), transportista_razon_social: txt(g.transportista_razon_social),
    registro_mtc: txt(g.transportista_reg_mtc),
    vehiculo_placa: txt(g.vehiculo_placa), vehiculo_secundario_placa: txt(g.vehiculo_secundario_placa),
    conductor_tipo_doc: txt(g.conductor_tipo_doc) || '1', conductor_num_doc: txt(g.conductor_num_doc),
    conductor_nombres: txt(g.conductor_nombres), conductor_apellidos: txt(g.conductor_apellidos),
    conductor_licencia: txt(g.conductor_licencia),
    costo_flete: txt(g.costo_flete), gre_vinculada_numero: txt(g.gre_vinculada_numero), gre_vinculada_ruc: txt(g.gre_vinculada_ruc),
    orden_viaje: txt(g.orden_viaje), observaciones: txt(g.observaciones),
    items: items.length
      ? items.map(it => ({ descripcion: txt(it.descripcion), cantidad: txt(it.cantidad) || '1', unidad_medida: txt(it.unidad_medida) || 'NIU', peso_unitario: txt(it.peso_unitario) }))
      : [{ ...ITEM_VACIO }],
  };
}

// Rellena los datos del viaje (placas, ubigeos, conductor) desde la orden de viaje. Solo cambia lo que llega con valor.
function aplicarOV(p: Form, o: Reg): Form {
  const c = (o.conductor ?? {}) as Reg;
  return {
    ...p,
    orden_viaje: pick(o.viaje, p.orden_viaje),
    vehiculo_placa: pick(o.placa_tracto, p.vehiculo_placa),
    vehiculo_secundario_placa: pick(o.placa_remolque, p.vehiculo_secundario_placa),
    peso_total: pick(o.peso, p.peso_total),
    partida_ubigeo: pick(o.ubigeo_partida, p.partida_ubigeo),
    partida_direccion: pick(o.direccion_partida, p.partida_direccion),
    llegada_ubigeo: pick(o.ubigeo_llegada, p.llegada_ubigeo),
    llegada_direccion: pick(o.direccion_llegada, p.llegada_direccion),
    conductor_nombres: pick(c.nombres, p.conductor_nombres),
    conductor_num_doc: pick(c.num_doc, p.conductor_num_doc),
    conductor_licencia: pick(c.licencia, p.conductor_licencia),
  };
}

// Traduce el formulario al cuerpo que espera cada ruta del servidor
function aPayload(tipo: TipoGuia, f: Form): Reg {
  const items = f.items
    .filter(i => i.descripcion.trim())
    .map(i => ({ descripcion: i.descripcion.trim(), cantidad: Number(i.cantidad) || 1, unidad_medida: i.unidad_medida, peso_unitario: Number(i.peso_unitario) || 0 }));
  const base: Reg = {
    fecha_emision: f.fecha_emision, fecha_traslado: f.fecha_traslado || f.fecha_emision,
    motivo_traslado: f.motivo_traslado, descripcion_motivo: f.descripcion_motivo.trim() || 'VENTA',
    peso_total: Number(f.peso_total) || 0, unidad_medida: f.unidad_medida, indicador_transbordo: f.transbordo ? 1 : 0,
    remitente_ruc: f.remitente_ruc.trim(), remitente_razon_social: f.remitente_razon_social.trim(), remitente_tipo_doc: docTipo(f.remitente_ruc),
    destinatario_ruc: f.destinatario_ruc.trim(), destinatario_razon_social: f.destinatario_razon_social.trim(), destinatario_tipo_doc: docTipo(f.destinatario_ruc),
    partida_ubigeo: f.partida_ubigeo.trim(), partida_direccion: f.partida_direccion.trim(),
    llegada_ubigeo: f.llegada_ubigeo.trim(), llegada_direccion: f.llegada_direccion.trim(),
    vehiculo_placa: f.vehiculo_placa.trim().toUpperCase(), vehiculo_secundario_placa: f.vehiculo_secundario_placa.trim().toUpperCase() || null,
    conductor_tipo_doc: f.conductor_tipo_doc, conductor_num_doc: f.conductor_num_doc.trim(), conductor_nombres: f.conductor_nombres.trim(),
    conductor_apellidos: f.conductor_apellidos.trim() || null, conductor_licencia: f.conductor_licencia.trim(),
    observaciones: f.observaciones.trim() || null, orden_viaje: f.orden_viaje.trim() || null,
    items,
  };
  if (tipo === 'remitente') {
    const conTercero = f.modalidad === '01';
    return {
      ...base,
      modalidad_transporte: f.modalidad, total_bultos: Number(f.total_bultos) || 1,
      indicador_retorno_vehiculo_vacio: f.retorno_vacio ? 1 : 0, indicador_retorno_envases_vacios: f.retorno_envases ? 1 : 0,
      indicador_traslado_total_m1_l: f.traslado_m1_l ? 1 : 0,
      transportista_ruc: conTercero ? f.transportista_ruc.trim() : null,
      transportista_razon_social: conTercero ? f.transportista_razon_social.trim() : null,
      transportista_reg_mtc: conTercero ? f.registro_mtc.trim() : null,
    };
  }
  return {
    ...base,
    registro_mtc: f.registro_mtc.trim(), transportista_reg_mtc: f.registro_mtc.trim(),
    costo_flete: Number(f.costo_flete) || 0,
    gre_vinculada_numero: f.gre_vinculada_numero.trim() || null,
    gre_vinculada_ruc: f.gre_vinculada_ruc.trim() || null,
  };
}

function validar(tipo: TipoGuia, f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  const ruc = (v: string) => /^(\d{8}|\d{11})$/.test(v.trim());
  const ubigeo = (v: string) => /^\d{6}$/.test(v.trim());
  const conTercero = tipo === 'transportista' || f.modalidad === '01';
  if (!f.fecha_emision) e.fecha_emision = 'Indica la fecha de emisión.';
  if (!(Number(f.peso_total) > 0)) e.peso_total = 'El peso debe ser mayor que cero.';
  if (!ruc(f.remitente_ruc)) e.remitente_ruc = 'RUC o DNI de 8 u 11 dígitos.';
  if (!f.remitente_razon_social.trim()) e.remitente_razon_social = 'Escribe la razón social o el nombre.';
  if (!ruc(f.destinatario_ruc)) e.destinatario_ruc = 'RUC o DNI de 8 u 11 dígitos.';
  if (!f.destinatario_razon_social.trim()) e.destinatario_razon_social = 'Escribe la razón social o el nombre.';
  if (!ubigeo(f.partida_ubigeo)) e.partida_ubigeo = 'Ubigeo de 6 dígitos.';
  if (!f.partida_direccion.trim()) e.partida_direccion = 'Indica la dirección de partida.';
  if (!ubigeo(f.llegada_ubigeo)) e.llegada_ubigeo = 'Ubigeo de 6 dígitos.';
  if (!f.llegada_direccion.trim()) e.llegada_direccion = 'Indica la dirección de llegada.';
  if (tipo === 'remitente' && f.modalidad === '01') {
    if (!ruc(f.transportista_ruc)) e.transportista_ruc = 'RUC del transportista.';
    if (!f.transportista_razon_social.trim()) e.transportista_razon_social = 'Razón social del transportista.';
  }
  if (conTercero && !f.registro_mtc.trim()) e.registro_mtc = 'Registro MTC del transportista.';
  if (!f.vehiculo_placa.trim()) e.vehiculo_placa = 'Placa del vehículo.';
  if (!f.conductor_num_doc.trim()) e.conductor_num_doc = 'Documento del conductor.';
  if (!f.conductor_nombres.trim()) e.conductor_nombres = 'Nombres del conductor.';
  if (!/^[A-Za-z0-9]{8,12}$/.test(f.conductor_licencia.trim())) e.conductor_licencia = 'Licencia de 8 a 12 letras o números.';
  if (!f.items.some(i => i.descripcion.trim())) e.items = 'Agrega al menos un bien con descripción.';
  return e;
}

interface Props {
  open: boolean;
  onClose: () => void;
  tipo: TipoGuia;
  /** Guía a editar (solo borradores). Null para una guía nueva. */
  edicion: { id: number; guia: object; items: object[] } | null;
}

export function GuiaFormSheet({ open, onClose, tipo, edicion }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const ruta = RUTA[tipo];
  const [f, setF] = useState<Form>(() => (edicion ? desdeGuia(edicion.guia as Reg, edicion.items as Reg[]) : formVacio()));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [buscarOV, setBuscarOV] = useState('');
  const [buscando, setBuscando] = useState(false);

  const set = (patch: Partial<Form>) => setF(prev => ({ ...prev, ...patch }));
  const setItem = (i: number, patch: Partial<ItemForm>) => setF(prev => ({ ...prev, items: prev.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const conTercero = tipo === 'transportista' || f.modalidad === '01';
  const editando = edicion != null;

  async function traerDesdeOV() {
    const v = buscarOV.trim();
    if (!v) return;
    setBuscando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; ov?: Reg; error?: string }>(`${ruta}/buscar-ov/${encodeURIComponent(v)}`);
      if (r.ok === false || !r.ov) throw new Error(r.error || 'Orden de viaje no encontrada');
      setF(prev => aplicarOV(prev, r.ov!));
      haptic('success');
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setBuscando(false); }
  }

  async function guardar() {
    const e = validar(tipo, f);
    setErrores(e);
    if (Object.keys(e).length) { setError('Revisa los campos marcados.'); haptic('warning'); return; }
    setError(null);
    setGuardando(true);
    try {
      const r = await api<{ ok?: boolean; success?: boolean; error?: string; numero_guia?: string; numeroGuia?: string }>(
        editando ? `${ruta}/${edicion!.id}` : ruta,
        { method: editando ? 'PUT' : 'POST', body: aPayload(tipo, f) },
      );
      if (r.ok === false || r.success === false) throw new Error(r.error || 'No se pudo guardar la guía');
      const numero = r.numero_guia ?? r.numeroGuia;
      haptic('success');
      toast(editando ? 'Borrador actualizado' : `Borrador creado${numero ? ` · ${numero}` : ''}`);
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  // Helpers de campos (cada uno muestra su error debajo)
  const txtField = (label: string, k: StrKeys, o: { wide?: boolean; upper?: boolean; inputMode?: 'numeric' | 'decimal' | 'text'; maxLength?: number; placeholder?: string; type?: string } = {}) => (
    <Field label={label} wide={o.wide} error={errores[k]}>
      {p => (
        <TextInput {...p} type={o.type ?? 'text'} inputMode={o.inputMode} maxLength={o.maxLength} placeholder={o.placeholder}
          value={String(f[k])} onChange={e => set({ [k]: o.upper ? e.target.value.toUpperCase() : e.target.value } as Partial<Form>)} />
      )}
    </Field>
  );
  const selField = (label: string, k: StrKeys, opciones: [string, string][], wide = false) => (
    <Field label={label} wide={wide} error={errores[k]}>
      {p => (
        <SelectInput {...p} value={String(f[k])} onChange={e => set({ [k]: e.target.value } as Partial<Form>)}>
          {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </SelectInput>
      )}
    </Field>
  );
  const check = (label: string, k: BoolKeys) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '0.9375rem' }}>
      <input type="checkbox" checked={Boolean(f[k])} onChange={e => set({ [k]: e.target.checked } as Partial<Form>)} />
      {label}
    </label>
  );
  const seccion = (t: string) => (
    <p className="tarjeta__grupo-titulo" style={{ gridColumn: '1 / -1', margin: 'var(--s-2) 0 0' }}>{t}</p>
  );

  return (
    <Sheet open={open} onClose={() => !guardando && onClose()} title={editando ? `Editar ${TITULO[tipo].toLowerCase()}` : `Nueva ${TITULO[tipo].toLowerCase()}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={guardando}>{editando ? 'Guardar cambios' : 'Guardar borrador'}</Button>
      </>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <div className="field field--wide">
          <span className="field__label">Traer datos de una orden de viaje (opcional)</span>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            <TextInput value={buscarOV} placeholder="N° de viaje" onChange={e => setBuscarOV(e.target.value)} style={{ flex: 1 }} />
            <Button variant="secondary" icon={<Search size={16} />} loading={buscando} onClick={traerDesdeOV}>Traer</Button>
          </div>
          <span className="field__hint">Completa placas, ubigeos, conductor y peso con los datos de la orden. No borra lo que ya escribiste.</span>
        </div>

        {seccion('Traslado')}
        {txtField('Fecha de emisión', 'fecha_emision', { type: 'date' })}
        {txtField('Inicio del traslado', 'fecha_traslado', { type: 'date' })}
        {selField('Motivo del traslado', 'motivo_traslado', MOTIVOS[tipo], true)}
        {txtField('Descripción del motivo', 'descripcion_motivo', { placeholder: 'VENTA' })}
        {tipo === 'remitente' && selField('Modalidad de transporte', 'modalidad', MODALIDADES, true)}
        {txtField('Peso total', 'peso_total', { inputMode: 'decimal', placeholder: 'kg' })}
        {selField('Unidad de peso', 'unidad_medida', UNIDADES_PESO)}
        {tipo === 'remitente' && txtField('Bultos', 'total_bultos', { inputMode: 'numeric' })}
        <div className="field field--wide" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3)' }}>
          {check('Transbordo programado', 'transbordo')}
          {tipo === 'remitente' && check('Retorno de vehículo vacío', 'retorno_vacio')}
          {tipo === 'remitente' && check('Retorno de envases vacíos', 'retorno_envases')}
          {tipo === 'remitente' && check('Traslado total M1 o L', 'traslado_m1_l')}
        </div>

        {seccion('Remitente y destinatario')}
        {txtField('RUC o DNI del remitente', 'remitente_ruc', { inputMode: 'numeric', maxLength: 11 })}
        {txtField('Razón social del remitente', 'remitente_razon_social', { upper: true })}
        {txtField('RUC o DNI del destinatario', 'destinatario_ruc', { inputMode: 'numeric', maxLength: 11 })}
        {txtField('Razón social del destinatario', 'destinatario_razon_social', { upper: true })}

        {seccion('Puntos de partida y llegada')}
        {txtField('Ubigeo de partida', 'partida_ubigeo', { inputMode: 'numeric', maxLength: 6, placeholder: '150101' })}
        {txtField('Dirección de partida', 'partida_direccion')}
        {txtField('Ubigeo de llegada', 'llegada_ubigeo', { inputMode: 'numeric', maxLength: 6, placeholder: '150101' })}
        {txtField('Dirección de llegada', 'llegada_direccion')}

        {seccion('Transporte')}
        {tipo === 'remitente' && f.modalidad === '01' && txtField('RUC del transportista', 'transportista_ruc', { inputMode: 'numeric', maxLength: 11 })}
        {tipo === 'remitente' && f.modalidad === '01' && txtField('Razón social del transportista', 'transportista_razon_social', { upper: true })}
        {conTercero && txtField('Registro MTC', 'registro_mtc', { upper: true })}
        {txtField('Placa del vehículo', 'vehiculo_placa', { upper: true, maxLength: 8 })}
        {txtField('Placa de la carreta (opcional)', 'vehiculo_secundario_placa', { upper: true, maxLength: 8 })}
        {selField('Tipo de documento del conductor', 'conductor_tipo_doc', TIPOS_DOC_CONDUCTOR)}
        {txtField('Documento del conductor', 'conductor_num_doc', { inputMode: 'numeric', maxLength: 12 })}
        {txtField('Nombres del conductor', 'conductor_nombres', { upper: true })}
        {txtField('Apellidos del conductor', 'conductor_apellidos', { upper: true })}
        {txtField('Licencia de conducir', 'conductor_licencia', { upper: true, maxLength: 12 })}
        {txtField('N° de orden de viaje', 'orden_viaje', { upper: true })}

        {tipo === 'transportista' && seccion('Vinculación y flete')}
        {tipo === 'transportista' && txtField('Costo del flete (S/)', 'costo_flete', { inputMode: 'decimal' })}
        {tipo === 'transportista' && txtField('N° de guía de remitente vinculada', 'gre_vinculada_numero', { upper: true })}
        {tipo === 'transportista' && txtField('RUC del emisor de la guía vinculada', 'gre_vinculada_ruc', { inputMode: 'numeric', maxLength: 11 })}

        {seccion('Bienes transportados')}
        <div className="field field--wide tarjeta__lista" style={{ padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {f.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
              <TextInput value={it.descripcion} placeholder="Descripción del bien" onChange={e => setItem(i, { descripcion: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 'var(--s-2)', alignItems: 'center' }}>
                <TextInput inputMode="decimal" placeholder="Cantidad" value={it.cantidad} onChange={e => setItem(i, { cantidad: e.target.value })} />
                <SelectInput value={it.unidad_medida} onChange={e => setItem(i, { unidad_medida: e.target.value })}>
                  {UNIDADES_ITEM.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </SelectInput>
                <TextInput inputMode="decimal" placeholder="Peso kg" value={it.peso_unitario} onChange={e => setItem(i, { peso_unitario: e.target.value })} />
                <Button variant="plain" iconOnly icon={<Trash2 size={16} />} aria-label="Quitar bien"
                  disabled={f.items.length === 1} onClick={() => set({ items: f.items.filter((_, j) => j !== i) })} />
              </div>
            </div>
          ))}
          {errores.items && <span className="field__error" role="alert">{errores.items}</span>}
          <div>
            <Button variant="secondary" icon={<Plus size={16} />} onClick={() => set({ items: [...f.items, { ...ITEM_VACIO }] })}>Agregar bien</Button>
          </div>
        </div>

        {txtField('Observaciones', 'observaciones', { wide: true })}
      </div>
    </Sheet>
  );
}
