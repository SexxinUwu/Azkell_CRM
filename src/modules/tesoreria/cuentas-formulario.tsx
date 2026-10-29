import { useEffect, useState, type ReactNode } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import type { CuentaPorCobrar } from './api';
import { ESTADOS, aTexto, calcularDesdeFlete, calcularDesdeNeto, decimal, isoDe, mesDe, num, r2, sumarDias, verUrl } from './cuentas-util';

// Alta y edición de una cuenta por cobrar. Mismo cálculo que el clásico:
// flete − comisión = tarifa; tarifa − gastos = B.I.; IGV 18 %; total; detracción 4 % si el total supera S/ 700; neto.
// Si se escribe el neto por cobrar, el flete se calcula hacia atrás.
// POST /api/tesoreria/cuentas (alta) · PUT /api/tesoreria/cuentas/:id (edición, con archivos opcionales).

interface Valores {
  cliente: string; razon_social: string; codigo_liquidacion: string; orden_servicio: string; fecha_liquidacion: string;
  fecha_servicio: string; numero_viaje: string; lugar: string; placa_camion: string; placa_carreta: string; conductor: string;
  flete: string; comision: string; tarifa: string; gastos_operativos: string; base_imponible: string; igv: string;
  total: string; adelanto: string; detraccion: string; neto_cobrar: string;
  mes_facturacion: string; fecha_factura: string; serie: string; factura: string; credito_dias: string;
  fecha_cobrar: string; fecha_deposito: string; estado_servicio: string; diferencia: string; observacion: string;
}
type Campo = keyof Valores;
type Errores = Partial<Record<Campo, string>>;

const VACIOS: Valores = {
  cliente: '', razon_social: '', codigo_liquidacion: '', orden_servicio: '', fecha_liquidacion: '', fecha_servicio: '',
  numero_viaje: '', lugar: '', placa_camion: '', placa_carreta: '', conductor: '', flete: '', comision: '0', tarifa: '',
  gastos_operativos: '', base_imponible: '', igv: '', total: '', adelanto: '', detraccion: '', neto_cobrar: '',
  mes_facturacion: '', fecha_factura: '', serie: '', factura: '', credito_dias: '15', fecha_cobrar: '',
  fecha_deposito: '', estado_servicio: 'PENDIENTE', diferencia: '', observacion: '',
};

const dinero = (v: unknown) => (v == null || v === '' ? '' : aTexto(num(v)));

function desdeRegistro(c: CuentaPorCobrar): Valores {
  const texto = (v: unknown) => (v == null ? '' : String(v));
  const comision = num(c.comision_porcentaje);
  let flete = num(c.flete);
  const tarifa = num(c.tarifa);
  // Registros antiguos sin flete: se calcula hacia atrás desde la tarifa (como el clásico)
  if (!flete && tarifa > 0) flete = comision < 100 ? r2(tarifa / (1 - comision / 100)) : tarifa;
  return {
    cliente: texto(c.cliente), razon_social: texto(c.razon_social), codigo_liquidacion: texto(c.codigo_liquidacion),
    orden_servicio: texto(c.orden_servicio), fecha_liquidacion: isoDe(c.fecha_liquidacion), fecha_servicio: isoDe(c.fecha_servicio),
    numero_viaje: texto(c.numero_viaje), lugar: texto(c.lugar), placa_camion: texto(c.placa_camion), placa_carreta: texto(c.placa_carreta),
    conductor: texto(c.conductor), flete: aTexto(flete), comision: aTexto(comision), tarifa: dinero(c.tarifa),
    gastos_operativos: dinero(c.gastos_operativos), base_imponible: dinero(c.base_imponible), igv: dinero(c.igv),
    total: dinero(c.total), adelanto: dinero(c.adelanto), detraccion: dinero(c.detraccion), neto_cobrar: dinero(c.neto_cobrar),
    mes_facturacion: texto(c.mes_facturacion), fecha_factura: isoDe(c.fecha_factura), serie: texto(c.serie), factura: texto(c.factura),
    credito_dias: c.credito_dias != null ? String(c.credito_dias) : '15', fecha_cobrar: isoDe(c.fecha_cobrar),
    fecha_deposito: isoDe(c.fecha_deposito), estado_servicio: (texto(c.estado_servicio) || 'PENDIENTE').toUpperCase(),
    diferencia: dinero(c.diferencia), observacion: texto(c.observacion),
  };
}

const importes = (v: Valores) => ({
  flete: decimal(v.flete), comision: decimal(v.comision), gastos: decimal(v.gastos_operativos), adelanto: decimal(v.adelanto),
});

/** Campos calculados a partir del flete (todo menos el neto, que se recalcula aparte) */
function desdeFlete(v: Valores): Partial<Valores> {
  const e = calcularDesdeFlete(importes(v));
  return {
    tarifa: aTexto(e.tarifa), base_imponible: aTexto(e.baseImponible), igv: aTexto(e.igv), total: aTexto(e.total),
    detraccion: aTexto(e.detraccion), neto_cobrar: aTexto(e.neto),
  };
}

const diasDe = (texto: string) => (texto.trim() === '' ? 15 : parseInt(texto, 10) || 0);

export function FormularioCuenta({ open, cuenta, existentes, onClose }: {
  open: boolean; cuenta: CuentaPorCobrar | null; existentes: CuentaPorCobrar[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<Valores>(VACIOS);
  const [errores, setErrores] = useState<Errores>({});
  const [archivoLiq, setArchivoLiq] = useState<File | null>(null);
  const [archivoFac, setArchivoFac] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editando = !!cuenta;

  useEffect(() => {
    if (!open) return;
    setV(cuenta ? desdeRegistro(cuenta) : VACIOS);
    setArchivoLiq(null); setArchivoFac(null); setErrores({}); setError(null);
    // Se reinicia al abrir o al cambiar de cuenta, no con cada recarga de la lista
  }, [open, cuenta?.id]);

  const set = (campo: Campo, valor: string) => {
    setV(a => ({ ...a, [campo]: valor }));
    setErrores(e => (e[campo] ? { ...e, [campo]: undefined } : e));
  };
  const alEscribir = (campo: Campo) => (e: { target: { value: string } }) => set(campo, e.target.value);

  // Importes que dependen del flete: flete, comisión, gastos y adelanto
  const alCambiarImporte = (campo: 'flete' | 'comision' | 'gastos_operativos' | 'adelanto') => (e: { target: { value: string } }) => {
    setV(a => {
      const nuevo = { ...a, [campo]: e.target.value };
      return { ...nuevo, ...desdeFlete(nuevo) };
    });
    setErrores(x => ({ ...x, [campo]: undefined }));
  };

  // Neto por cobrar escrito a mano: el flete sale hacia atrás
  const alCambiarNeto = (e: { target: { value: string } }) => {
    setV(a => {
      const nuevo = { ...a, neto_cobrar: e.target.value };
      const r = calcularDesdeNeto(decimal(nuevo.neto_cobrar), { comision: decimal(nuevo.comision), gastos: decimal(nuevo.gastos_operativos), adelanto: decimal(nuevo.adelanto) });
      if (!r) return nuevo;
      return {
        ...nuevo, flete: aTexto(r.flete), tarifa: aTexto(r.tarifa), base_imponible: aTexto(r.baseImponible),
        igv: aTexto(r.igv), total: aTexto(r.total), detraccion: aTexto(r.detraccion),
      };
    });
  };

  const alCambiarFechaFactura = (e: { target: { value: string } }) => {
    const f = e.target.value;
    setV(a => ({
      ...a,
      fecha_factura: f,
      mes_facturacion: f ? mesDe(f) : '',
      fecha_cobrar: f ? sumarDias(f, diasDe(a.credito_dias)) : '',
    }));
  };

  const alCambiarDias = (e: { target: { value: string } }) => {
    const dias = e.target.value;
    setV(a => ({ ...a, credito_dias: dias, fecha_cobrar: a.fecha_factura ? sumarDias(a.fecha_factura, diasDe(dias)) : a.fecha_cobrar }));
  };

  function validar(): Errores {
    const e: Errores = {};
    const cliente = v.cliente.trim(), razon = v.razon_social.trim();
    if (!cliente && !razon) e.cliente = 'Indica el cliente o la razón social.';
    if (!v.placa_camion.trim()) e.placa_camion = 'Indica la placa del camión.';
    if (!(decimal(v.flete) > 0)) e.flete = 'Indica el flete.';
    const comision = decimal(v.comision);
    if (comision < 0 || comision >= 100) e.comision = 'La comisión debe estar entre 0 y 99.99 %.';
    if (!!v.serie.trim() !== !!v.factura.trim()) e.factura = 'Completa la serie y el número, o deja los dos vacíos.';
    else if (v.serie.trim() && v.factura.trim()) {
      const serie = v.serie.trim().toUpperCase(), numero = v.factura.trim().toUpperCase();
      const repetida = existentes.some(c => c.id !== cuenta?.id
        && String(c.serie ?? '').trim().toUpperCase() === serie && String(c.factura ?? '').trim().toUpperCase() === numero);
      if (repetida) e.factura = `Ya existe la factura ${serie}-${numero}.`;
    }
    return e;
  }

  async function guardar() {
    const e = validar();
    setErrores(e);
    if (Object.values(e).some(Boolean)) { haptic('warning'); return; }

    const f = new FormData();
    const texto: Array<[string, string]> = [
      ['codigo_liquidacion', v.codigo_liquidacion.trim()], ['orden_servicio', v.orden_servicio.trim()],
      ['fecha_liquidacion', v.fecha_liquidacion], ['numero_viaje', v.numero_viaje.trim()], ['fecha_servicio', v.fecha_servicio],
      ['razon_social', v.razon_social.trim()], ['placa_camion', v.placa_camion.trim().toUpperCase()],
      ['placa_carreta', v.placa_carreta.trim().toUpperCase()], ['conductor', v.conductor.trim()], ['cliente', v.cliente.trim()],
      ['lugar', v.lugar.trim()], ['mes_facturacion', v.mes_facturacion], ['fecha_factura', v.fecha_factura],
      ['serie', v.serie.trim().toUpperCase()], ['factura', v.factura.trim()], ['fecha_cobrar', v.fecha_cobrar],
      ['fecha_deposito', v.fecha_deposito], ['estado_servicio', v.estado_servicio || 'PENDIENTE'], ['observacion', v.observacion.trim()],
    ];
    for (const [k, val] of texto) f.append(k, val);
    const numeros: Array<[string, string]> = [
      ['flete', v.flete], ['comision_porcentaje', v.comision], ['tarifa', v.tarifa], ['gastos_operativos', v.gastos_operativos],
      ['base_imponible', v.base_imponible], ['igv', v.igv], ['total', v.total], ['adelanto', v.adelanto],
      ['detraccion', v.detraccion], ['neto_cobrar', v.neto_cobrar], ['diferencia', v.diferencia],
    ];
    for (const [k, val] of numeros) f.append(k, String(decimal(val)));
    f.append('credito_dias', String(diasDe(v.credito_dias) || 15));
    if (cuenta?.documento_url) f.append('documento_url', String(cuenta.documento_url));
    if (cuenta?.factura_documento_url) f.append('factura_documento_url', String(cuenta.factura_documento_url));
    if (archivoLiq) f.append('archivo_adjunto', archivoLiq);
    if (archivoFac) f.append('archivo_factura', archivoFac);

    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(cuenta ? `/tesoreria/cuentas/${cuenta.id}` : '/tesoreria/cuentas', { method: cuenta ? 'PUT' : 'POST', body: f });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success');
      toast(editando ? 'Registro actualizado' : 'Registro creado');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  const calculado = (label: string, campo: Campo, hint?: string): ReactNode => (
    <Field label={label} hint={hint}>
      {p => <TextInput {...p} value={v[campo]} readOnly tabIndex={-1} className="cuentas-calculado" />}
    </Field>
  );
  const importe = (label: string, campo: 'flete' | 'comision' | 'gastos_operativos' | 'adelanto', onChange: (e: { target: { value: string } }) => void, extra?: { hint?: string }) => (
    <Field label={label} error={errores[campo]} hint={extra?.hint}>
      {p => <TextInput {...p} type="number" step="0.01" inputMode="decimal" value={v[campo]} onChange={onChange} />}
    </Field>
  );
  const archivoActual = (c: CuentaPorCobrar | null, campo: 'documento' | 'factura_documento') => {
    const url = c ? verUrl(c, campo) : null;
    return url ? <a href={url} target="_blank" rel="noreferrer" className="btn btn--plain btn--sm">Ver archivo actual</a> : 'Sin archivo';
  };

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} ancho title={editando ? 'Editar cuenta por cobrar' : 'Nueva cuenta por cobrar'}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button>
      </>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <div className="field field--wide cuentas-titulo">Cliente y operación</div>
        <Field label="Cliente" error={errores.cliente}>{p => <TextInput {...p} value={v.cliente} onChange={alEscribir('cliente')} />}</Field>
        <Field label="Razón social">{p => <TextInput {...p} value={v.razon_social} onChange={alEscribir('razon_social')} />}</Field>
        <Field label="N° de liquidación">{p => <TextInput {...p} value={v.codigo_liquidacion} onChange={alEscribir('codigo_liquidacion')} placeholder="LIQ-2026-001" />}</Field>
        <Field label="Orden de servicio">{p => <TextInput {...p} value={v.orden_servicio} onChange={alEscribir('orden_servicio')} />}</Field>
        <Field label="Fecha de liquidación">{p => <TextInput {...p} type="date" value={v.fecha_liquidacion} onChange={alEscribir('fecha_liquidacion')} />}</Field>
        <Field label="Fecha de servicio">{p => <TextInput {...p} type="date" value={v.fecha_servicio} onChange={alEscribir('fecha_servicio')} />}</Field>
        <Field label="N° de viaje">{p => <TextInput {...p} value={v.numero_viaje} onChange={alEscribir('numero_viaje')} />}</Field>
        <Field label="Lugar o ruta">{p => <TextInput {...p} value={v.lugar} onChange={alEscribir('lugar')} placeholder="CALLAO - TARAPOTO" />}</Field>
        <Field label="Placa del camión" error={errores.placa_camion}>{p => <TextInput {...p} value={v.placa_camion} onChange={alEscribir('placa_camion')} />}</Field>
        <Field label="Placa de la carreta">{p => <TextInput {...p} value={v.placa_carreta} onChange={alEscribir('placa_carreta')} />}</Field>
        <Field label="Conductor" wide>{p => <TextInput {...p} value={v.conductor} onChange={alEscribir('conductor')} />}</Field>

        <div className="field field--wide cuentas-titulo">Importes (S/)</div>
        {importe('Flete', 'flete', alCambiarImporte('flete'), { hint: 'Lo que se factura al cliente antes de comisión' })}
        {importe('Comisión (%)', 'comision', alCambiarImporte('comision'))}
        {calculado('Tarifa (flete menos comisión)', 'tarifa')}
        {importe('Gastos operativos', 'gastos_operativos', alCambiarImporte('gastos_operativos'))}
        {calculado('Base imponible', 'base_imponible')}
        {calculado('IGV (18 %)', 'igv')}
        {calculado('Total factura', 'total')}
        {importe('Adelanto', 'adelanto', alCambiarImporte('adelanto'))}
        {calculado('Detracción (4 %)', 'detraccion', 'Se aplica si el total supera S/ 700')}
        <Field label="Neto por cobrar" error={errores.neto_cobrar} hint="Si lo escribes, el flete se calcula para obtener ese neto">
          {p => <TextInput {...p} type="number" step="0.01" inputMode="decimal" value={v.neto_cobrar} onChange={alCambiarNeto} className="cuentas-neto" />}
        </Field>

        <div className="field field--wide cuentas-titulo">Facturación y cobranza</div>
        <Field label="Fecha de factura">{p => <TextInput {...p} type="date" value={v.fecha_factura} onChange={alCambiarFechaFactura} />}</Field>
        {calculado('Mes de facturación', 'mes_facturacion', 'Se toma de la fecha de factura')}
        <Field label="Serie" error={errores.factura}>{p => <TextInput {...p} value={v.serie} onChange={e => set('serie', e.target.value.toUpperCase())} placeholder="F001" />}</Field>
        <Field label="N° de factura" error={errores.factura}>{p => <TextInput {...p} value={v.factura} onChange={alEscribir('factura')} />}</Field>
        <Field label="Días de crédito">{p => <TextInput {...p} type="number" inputMode="numeric" value={v.credito_dias} onChange={alCambiarDias} />}</Field>
        {calculado('Fecha a cobrar', 'fecha_cobrar', 'Fecha de factura más los días de crédito')}
        <Field label="Fecha de depósito">{p => <TextInput {...p} type="date" value={v.fecha_deposito} onChange={alEscribir('fecha_deposito')} />}</Field>
        <Field label="Estado">
          {p => (
            <SelectInput {...p} value={v.estado_servicio} onChange={alEscribir('estado_servicio')}>
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Diferencia (S/)">
          {p => <TextInput {...p} type="number" step="0.01" inputMode="decimal" value={v.diferencia} onChange={alEscribir('diferencia')} />}
        </Field>
        <Field label="Observación" wide>{p => <TextInput {...p} value={v.observacion} onChange={alEscribir('observacion')} />}</Field>

        <Field label="PDF de la liquidación" hint={archivoLiq?.name ?? archivoActual(cuenta, 'documento')}>
          {p => <ArchivoInput {...p} accept=".pdf,image/*" onChange={setArchivoLiq} />}
        </Field>
        <Field label="PDF de la factura" hint={archivoFac?.name ?? archivoActual(cuenta, 'factura_documento')}>
          {p => <ArchivoInput {...p} accept=".pdf,image/*" onChange={setArchivoFac} />}
        </Field>
      </div>
    </Sheet>
  );
}

