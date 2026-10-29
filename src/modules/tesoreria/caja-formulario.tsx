import { useEffect, useState, type ReactNode } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { decimalInput, parseDecimal } from '../../core/ui/forms';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { dayKey, formatTime } from '../../core/lib/format';
import {
  buscarOrdenesViaje, siguienteNumeroCaja, useBancos, useCentrosCostos, useMotivosGastos,
  type CajaMovimiento, type CentroCosto, type OrdenViajeCaja,
} from './api';
import { AUTORIZAN, CC_VIAJES, COMPROBANTES, MODALIDADES, MOTIVO_VIAJES, PERSONAS, num } from './caja-lib';

interface Props {
  open: boolean;
  mov: CajaMovimiento | null;
  onClose: () => void;
  onGuardado: () => Promise<unknown>;
}

interface CuentaPersona { banco?: string | null; numero_cuenta?: string | null; tipo_cuenta?: string | null }
interface PersonaCaja { nombre: string; documento: string; cuentas: CuentaPersona[] }
interface ProveedorApi { nombre?: string | null; razon_social?: string | null; numero_documento?: string | null; cuentas?: CuentaPersona[] | null }

const etiquetaCuenta = (c: CuentaPersona) => `${c.banco ?? ''} - ${c.numero_cuenta ?? ''}`;
/** Número de un campo decimal ya validado (vacío o inválido → 0) */
const dec = (s: string | undefined) => parseDecimal(s ?? '') ?? 0;
const unicas = (lista: Array<string | undefined>) => [...new Set(lista.filter((x): x is string => !!x))];

export function FormularioCaja({ open, mov, onClose, onGuardado }: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const centros = useCentrosCostos();
  const motivos = useMotivosGastos();
  const bancos = useBancos();
  const [v, setV] = useState<Record<string, string>>({});
  const [voucher, setVoucher] = useState<File | null>(null);
  const [sustento, setSustento] = useState<File | null>(null);
  const [sesion, setSesion] = useState(0); // reinicia los inputs de archivo al abrir
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errCampos, setErrCampos] = useState<Record<string, string | undefined>>({});
  const [qViaje, setQViaje] = useState('');
  const editando = !!mov;
  const tipo = v.tipo_persona ?? '';

  // Catálogos
  const centrosActivos = (centros.data ?? []).filter(c => c.estado !== 'INACTIVO');
  const ccValor = (c: CentroCosto) => `${c.codigo}: ${c.nombre}`;
  const centroDe = (valor: string | undefined) => centrosActivos.find(c => ccValor(c) === valor || c.codigo === valor);
  const ccNormal = (valor: string | undefined) => { const c = centroDe(valor); return c ? ccValor(c) : (valor ?? ''); };
  const requierePlaca = (valor: string | undefined) => { const c = centroDe(valor); return !!c && (c.requiere_placa === true || Number(c.requiere_placa) === 1); };
  const motivosActivos = (motivos.data ?? []).filter(x => x.estado === 'ACTIVO');
  const motivoOpciones = unicas(motivosActivos.map(x => x.motivo));
  const subOpciones = unicas(motivosActivos.filter(x => x.motivo === v.motivo).map(x => x.sub_motivo));
  const cuentasEmpresa = (bancos.data ?? []).filter(b => b.estado !== 'INACTIVO').map(b => `${b.banco} - ${b.numero_cuenta} (${b.moneda})`);

  const ordenes = useQuery({ queryKey: ['tesoreria', 'ordenes-viaje', qViaje], enabled: open, queryFn: () => buscarOrdenesViaje(qViaje), staleTime: 60_000 });
  const personas = useQuery({
    queryKey: ['tesoreria', 'personas-caja', tipo],
    enabled: open && (tipo === 'CONDUCTOR' || tipo === 'ADMINISTRATIVO' || tipo === 'PROVEEDOR'),
    queryFn: async (): Promise<PersonaCaja[]> => {
      if (tipo === 'PROVEEDOR') {
        const r = await api<unknown>('/almacen/proveedores');
        return (Array.isArray(r) ? (r as ProveedorApi[]) : [])
          .map(p => ({ nombre: String(p.razon_social || p.nombre || '').trim(), documento: String(p.numero_documento ?? ''), cuentas: Array.isArray(p.cuentas) ? p.cuentas : [] }))
          .filter(p => p.nombre);
      }
      const r = await api<unknown>('/conductores-lista');
      return (Array.isArray(r) ? (r as { nombre?: string; dni?: string }[]) : [])
        .map(c => ({ nombre: String(c.nombre ?? '').trim(), documento: String(c.dni ?? ''), cuentas: [] }))
        .filter(p => p.nombre);
    },
    staleTime: 5 * 60_000,
  });

  // Valores iniciales: nuevo (con correlativo) o copia del registro a editar
  useEffect(() => {
    if (!open) return;
    setError(null); setErrCampos({}); setVoucher(null); setSustento(null); setQViaje('');
    setSesion(s => s + 1);
    const base: Record<string, string> = {
      fecha: dayKey(new Date()), hora: formatTime(new Date()), tipo_movimiento: 'EGRESO', serie: String(new Date().getFullYear()), numero: '',
      moneda: 'SOLES', tipo_cambio: '1', modalidad_pago: 'TRANSFERENCIA BANCARIA', tipo_persona: 'ADMINISTRATIVO', no_aplica_liquidacion: '0',
    };
    if (mov) {
      for (const k of Object.keys(mov)) {
        const x = mov[k];
        if (x != null && typeof x !== 'object') base[k] = k.startsWith('fecha') ? String(x).split('T')[0] : String(x);
      }
      base.no_aplica_liquidacion = mov.no_aplica_liquidacion ? '1' : '0';
      base.centro_costo = mov.centro_costo ?? '';
    }
    setV(base);
    if (!mov) {
      siguienteNumeroCaja(base.serie).then(n => setV(a => (a.numero ? a : { ...a, numero: n }))).catch(() => undefined);
    }
  }, [open, mov]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  const limpiar = (k: string) => setErrCampos(x => (x[k] ? { ...x, [k]: undefined } : x));

  // Reglas del clásico: centro de costos sugerido por motivo/sub motivo y viaje
  const ccSugerido = (motivo: string, sub?: string): string | null => {
    const filas = motivosActivos.filter(x => x.motivo === motivo);
    const exacta = sub ? filas.find(x => x.sub_motivo === sub && x.centro_costo_codigo) : undefined;
    return (exacta ?? filas.find(x => x.centro_costo_codigo))?.centro_costo_codigo ?? null;
  };
  const ccDeCodigo = (codigo: string | null) => { const c = codigo ? centrosActivos.find(x => x.codigo === codigo) : undefined; return c ? ccValor(c) : null; };

  function cambiarMotivo(motivo: string) {
    const cc = ccDeCodigo(ccSugerido(motivo));
    setV(a => ({ ...a, motivo, sub_motivo: '', ...(cc ? { centro_costo: cc } : {}) }));
    limpiar('motivo');
  }
  function cambiarSub(sub: string) {
    const cc = ccDeCodigo(ccSugerido(v.motivo ?? '', sub));
    setV(a => ({ ...a, sub_motivo: sub, ...(cc ? { centro_costo: cc } : {}) }));
  }
  function cambiarMoneda(moneda: string) {
    setV(a => ({
      ...a,
      moneda,
      tipo_cambio: moneda === 'DOLARES' ? (!num(a.tipo_cambio) || num(a.tipo_cambio) === 1 ? '3.400' : a.tipo_cambio) : '1',
    }));
    limpiar('tipo_cambio');
  }

  function aplicarViaje(o: OrdenViajeCaja) {
    const cc = ccDeCodigo(CC_VIAJES);
    setV(a => {
      const sig: Record<string, string> = {
        ...a,
        orden_viaje: o.viaje,
        conductor: o.conductor ?? a.conductor ?? '',
        placa: o.placa_tracto ?? a.placa ?? '',
        ruta_viaje: o.ruta ?? a.ruta_viaje ?? '',
        tipo_persona: 'CONDUCTOR',
      };
      if (o.conductor) sig.persona = o.conductor;
      if (cc) sig.centro_costo = cc;
      if (!a.motivo) { sig.motivo = MOTIVO_VIAJES; sig.sub_motivo = ''; }
      return sig;
    });
    limpiar('orden_viaje');
  }

  /** Si el código no está en la lista ya cargada (p. ej. se escribió sin elegir), lo busca al salir del campo */
  async function buscarViajeExacto(codigo: string) {
    const c = codigo.trim();
    if (!c || (ordenes.data ?? []).some(o => o.viaje === codigo)) return;
    try {
      const lista = await buscarOrdenesViaje(c);
      const o = lista.find(x => x.viaje.trim().toUpperCase() === c.toUpperCase());
      if (o) aplicarViaje(o);
    } catch { /* sin autocompletado: el usuario completa a mano */ }
  }

  function elegirPersona(nombre: string) {
    set('persona', nombre);
    limpiar('persona');
    if (tipo !== 'PROVEEDOR') return;
    const cuentas = (personas.data ?? []).find(p => p.nombre.toUpperCase() === nombre.trim().toUpperCase())?.cuentas ?? [];
    // Un solo banco del proveedor, o campo vacío: se sugiere la primera cuenta
    if (cuentas.length && (cuentas.length === 1 || !v.cuenta_bancaria_persona)) set('cuenta_bancaria_persona', etiquetaCuenta(cuentas[0]));
  }

  const cuentasPersona = tipo === 'PROVEEDOR' ? ((personas.data ?? []).find(p => p.nombre === v.persona)?.cuentas ?? []) : [];

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    const importe = parseDecimal(v.importe_total ?? '');
    const ret = parseDecimal(v.retencion_detraccion ?? '');
    const tc = parseDecimal(v.tipo_cambio ?? '');
    if (!v.fecha) e.fecha = 'Indica la fecha.';
    if (importe === null || Number.isNaN(importe) || importe <= 0) e.importe_total = 'Indica un importe mayor que cero.';
    if (ret !== null && (Number.isNaN(ret) || ret < 0)) e.retencion_detraccion = 'Escribe un número válido.';
    else if (ret && importe && ret > importe) e.retencion_detraccion = 'No puede ser mayor que el importe.';
    if (v.moneda === 'DOLARES' && (tc === null || Number.isNaN(tc) || tc <= 0)) e.tipo_cambio = 'Indica el tipo de cambio.';
    if (!v.motivo) e.motivo = 'Elige el motivo.';
    if (!v.centro_costo) e.centro_costo = 'Elige el centro de costos.';
    if (requierePlaca(v.centro_costo) && !(v.placa ?? '').trim()) e.placa = 'Este centro de costos exige la placa de la unidad.';
    if (!v.autoriza) e.autoriza = 'Elige quién autoriza.';
    if (!(v.persona ?? '').trim()) e.persona = 'Indica la persona o entidad.';
    if (!v.modalidad_pago) e.modalidad_pago = 'Elige la modalidad de pago.';
    if (!v.tipo_comprobante) e.tipo_comprobante = 'Elige el comprobante.';
    if (!(v.cuenta_bancaria_persona ?? '').trim()) e.cuenta_bancaria_persona = 'Indica la cuenta de la persona.';
    return e;
  }

  async function guardar() {
    const e = validar();
    setErrCampos(e);
    if (Object.keys(e).length) { haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const envio: Record<string, string> = {
        fecha: v.fecha ?? '',
        hora: v.hora ?? '',
        numero_constancia_deposito: v.numero_constancia_deposito ?? '',
        numero_factura: v.numero_factura ?? '',
        serie: v.serie || String(new Date().getFullYear()),
        numero: v.numero ?? '',
        orden_viaje: v.orden_viaje ?? '',
        conductor: v.conductor ?? '',
        ruta_viaje: v.ruta_viaje ?? '',
        placa: (v.placa ?? '').trim(),
        autoriza: v.autoriza ?? '',
        motivo: v.motivo ?? '',
        sub_motivo: v.sub_motivo ?? '',
        centro_costo: ccNormal(v.centro_costo),
        modalidad_pago: v.modalidad_pago ?? '',
        moneda: v.moneda || 'SOLES',
        tipo_cambio: v.moneda === 'DOLARES' ? String(dec(v.tipo_cambio) || 1) : '1',
        tipo_persona: v.tipo_persona ?? '',
        persona: (v.persona ?? '').trim(),
        tipo_movimiento: v.tipo_movimiento || 'EGRESO',
        retencion_detraccion: String(dec(v.retencion_detraccion)),
        importe_total: String(dec(v.importe_total)),
        descripcion: (v.descripcion ?? '').trim() || 'Movimiento de Caja',
        tipo_comprobante: v.tipo_comprobante ?? '',
        cuenta_bancaria_persona: (v.cuenta_bancaria_persona ?? '').trim(),
        cuenta_bancaria_empresa: v.cuenta_bancaria_empresa ?? '',
        observacion: v.observacion ?? '',
        no_aplica_liquidacion: v.no_aplica_liquidacion === '1' ? '1' : '0',
        usuario_creacion: user?.name ?? '',
      };
      const f = new FormData();
      for (const [k, val] of Object.entries(envio)) f.append(k, val);
      if (voucher) f.append('voucher', voucher);
      if (sustento) f.append('sustento', sustento);
      const r = await api<{ ok?: boolean; error?: string }>(mov ? `/tesoreria/caja/${mov.id}` : '/tesoreria/caja', { method: mov ? 'PUT' : 'POST', body: f });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success');
      toast(editando ? 'Movimiento actualizado' : 'Movimiento registrado');
      await onGuardado();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  // ── Piezas del formulario ──────────────────────────────────────
  const txt = (k: string, label: string, o: { wide?: boolean; decimal?: boolean; type?: string; hint?: string; readOnly?: boolean } = {}) => (
    <Field label={label} wide={o.wide} error={errCampos[k]} hint={o.hint}>
      {p => (
        <TextInput {...p} type={o.type ?? 'text'} inputMode={o.decimal ? 'decimal' : undefined} readOnly={o.readOnly}
          value={v[k] ?? ''}
          onChange={e => { set(k, o.decimal ? decimalInput(e.target.value) : e.target.value); limpiar(k); }} />
      )}
    </Field>
  );

  const sel = (k: string, label: string, opciones: string[], o: { vacio?: boolean; wide?: boolean; disabled?: boolean; hint?: string; onCambio?: (val: string) => void } = {}) => (
    <Field label={label} wide={o.wide} error={errCampos[k]} hint={o.hint}>
      {p => (
        <SelectInput {...p} value={v[k] ?? ''} disabled={o.disabled}
          onChange={e => (o.onCambio ? o.onCambio(e.target.value) : set(k, e.target.value))}>
          {(o.vacio ?? true) && <option value="">—</option>}
          {unicas([...opciones, v[k]]).map(x => <option key={x} value={x}>{x}</option>)}
        </SelectInput>
      )}
    </Field>
  );

  const seccion = (titulo: string): ReactNode => (
    <p className="t-footnote c-secondary" style={{ gridColumn: '1 / -1', margin: 'var(--s-2) 0 0', fontWeight: 600 }}>{titulo}</p>
  );

  const ccActual = ccNormal(v.centro_costo);
  const ccOpciones = centrosActivos.map(c => ({ value: ccValor(c), label: `${c.codigo} · ${c.nombre}` }));
  if (ccActual && !ccOpciones.some(o => o.value === ccActual)) ccOpciones.push({ value: ccActual, label: ccActual });
  const placaRequerida = requierePlaca(v.centro_costo);

  return (
    <Sheet open={open} ancho onClose={() => !enviando && onClose()}
      title={editando ? `Editar caja ${mov?.serie ?? ''}-${mov?.numero ?? ''}` : 'Nuevo movimiento de caja'}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button>
      </>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        {seccion('Documento')}
        {sel('tipo_movimiento', 'Movimiento', ['EGRESO', 'INGRESO'], {
          vacio: false, disabled: editando,
          hint: editando ? 'El tipo no cambia al editar' : 'Egreso sale de caja; ingreso entra a caja',
        })}
        {txt('numero', `N° (serie ${v.serie ?? ''})`, { readOnly: editando, hint: editando ? undefined : 'Correlativo sugerido; se asigna solo al abrir' })}
        {txt('fecha', 'Fecha', { type: 'date' })}
        {txt('hora', 'Hora', { type: 'time' })}
        {sel('moneda', 'Moneda', ['SOLES', 'DOLARES'], { vacio: false, onCambio: cambiarMoneda })}
        {v.moneda === 'DOLARES' && txt('tipo_cambio', 'Tipo de cambio (S/ por US$)', { decimal: true })}
        {txt('importe_total', 'Importe total', { decimal: true })}
        {txt('retencion_detraccion', 'Retención / detracción', { decimal: true, hint: 'Opcional' })}

        {seccion('Clasificación')}
        {sel('motivo', 'Motivo', motivoOpciones, { wide: true, onCambio: cambiarMotivo })}
        {sel('sub_motivo', 'Sub motivo', subOpciones, { wide: true, onCambio: cambiarSub })}
        <Field label="Centro de costos" wide error={errCampos.centro_costo} hint="Se sugiere según el motivo">
          {p => (
            <SelectInput {...p} value={ccActual} onChange={e => { set('centro_costo', e.target.value); limpiar('centro_costo'); }}>
              <option value="">—</option>
              {ccOpciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          )}
        </Field>

        {seccion('Viaje')}
        <Field label="Orden de viaje" wide hint="Escribe para buscar; al elegir se completan conductor, placa y ruta">
          {p => (<>
            <TextInput {...p} list="caja-viajes" autoComplete="off" value={v.orden_viaje ?? ''}
              onChange={e => {
                const val = e.target.value;
                set('orden_viaje', val);
                setQViaje(val.trim());
                const o = (ordenes.data ?? []).find(x => x.viaje === val);
                if (o) aplicarViaje(o);
              }}
              onBlur={e => buscarViajeExacto(e.target.value)} />
            <datalist id="caja-viajes">
              {(ordenes.data ?? []).map(o => <option key={o.viaje} value={o.viaje}>{`${o.conductor ?? ''} · ${o.ruta ?? ''}`}</option>)}
            </datalist>
          </>)}
        </Field>
        {txt('conductor', 'Conductor')}
        {txt('ruta_viaje', 'Ruta')}
        {txt('placa', 'Placa / unidad', {
          hint: placaRequerida ? 'Requerida por el centro de costos' : 'Opcional',
        })}

        {seccion('Pago')}
        {sel('autoriza', 'Autoriza', AUTORIZAN)}
        {sel('tipo_persona', 'Tipo de persona', PERSONAS, { vacio: false, onCambio: t => { set('tipo_persona', t); limpiar('tipo_persona'); } })}
        <Field label="Persona" wide error={errCampos.persona} hint={tipo === 'BANCO' ? 'Nombre del banco o entidad financiera' : undefined}>
          {p => (<>
            <TextInput {...p} list="caja-personas" autoComplete="off" value={v.persona ?? ''} onChange={e => elegirPersona(e.target.value)} />
            <datalist id="caja-personas">
              {(personas.data ?? []).map(x => <option key={x.nombre} value={x.nombre} label={x.documento || undefined} />)}
            </datalist>
          </>)}
        </Field>
        {sel('modalidad_pago', 'Modalidad de pago', MODALIDADES)}
        {sel('cuenta_bancaria_empresa', 'Cuenta de la empresa', cuentasEmpresa, { wide: true })}
        <Field label="Cuenta de la persona" wide error={errCampos.cuenta_bancaria_persona} hint={tipo === 'PROVEEDOR' ? 'Se sugiere la cuenta del proveedor' : undefined}>
          {p => (<>
            <TextInput {...p} list="caja-cuentas-persona" autoComplete="off" value={v.cuenta_bancaria_persona ?? ''}
              onChange={e => { set('cuenta_bancaria_persona', e.target.value); limpiar('cuenta_bancaria_persona'); }}
              placeholder="BCP 191-XXXXXXXX-X-XX o CCI" />
            <datalist id="caja-cuentas-persona">
              {cuentasPersona.map(c => <option key={etiquetaCuenta(c)} value={`${etiquetaCuenta(c)}${c.tipo_cuenta ? ` (${c.tipo_cuenta})` : ''}`} />)}
            </datalist>
          </>)}
        </Field>
        {sel('tipo_comprobante', 'Comprobante', COMPROBANTES)}
        {txt('numero_factura', 'N° de comprobante', { hint: 'Ej: F001-0029' })}
        {txt('numero_constancia_deposito', 'N° de constancia de depósito', { hint: 'N° de operación' })}

        {seccion('Adjuntos y notas')}
        <Field label="Voucher" hint={voucher?.name}>
          {p => <ArchivoInput {...p} key={`v-${sesion}`} accept="image/*,application/pdf" onChange={setVoucher} />}
        </Field>
        <Field label="Sustento" hint={sustento?.name}>
          {p => <ArchivoInput {...p} key={`s-${sesion}`} accept="image/*,application/pdf,.xlsx,.csv" onChange={setSustento} />}
        </Field>
        {txt('descripcion', 'Descripción', { wide: true })}
        {txt('observacion', 'Observación', { wide: true })}
        <label className="field field--wide" style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          <input type="checkbox" checked={v.no_aplica_liquidacion === '1'} onChange={e => set('no_aplica_liquidacion', e.target.checked ? '1' : '0')} />
          No aplica a liquidación de viaje
        </label>
      </div>
    </Sheet>
  );
}
