import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Package, Paperclip, Plus, ScanLine, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { Combobox, type ComboboxOption } from '../../core/ui/Combobox';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { formatMoneda } from '../../core/lib/format';
import {
  guardarEntrada, subirCotizacion, useConfiguracionAlmacen, useCuentasProveedor, useEmpresaCuentas, useInventario,
  useOrdenesTrabajoLista, usePlacasLista, useProveedores, useProximoCodigoEntrada, useTipoCambioSunat,
  type ArticuloInv, type EntradaInv, type PayloadEntrada,
} from './api';
import {
  CENTROS_COSTO, CONDICIONES_PAGO, DIRECTIVOS, MODOS_IGV, MOTIVOS_GASTO, PRIORIDADES, SUB_MOTIVOS, TASA_IGV, TIPOS_ORDEN,
  alertaPrecio, calcularLinea, centroCostoSugerido, codigoLimpio, esServicio, etiquetaCuentaEmpresa, etiquetaCuentaProveedor,
  hoyLocal, importeLinea, naturalezaDeSubMotivo, totalesLineas, type CampoLinea, type LineaOC, type ModoIgv,
} from './entradaReglas';
import { EscanerQr } from './EscanerQr';
import { ProveedorFormulario } from './ProveedorFormulario';
import { InventarioFormulario } from './InventarioFormulario';
import './entradas.css';

interface Props {
  open: boolean;
  entrada: EntradaInv | null;
  onClose: () => void;
  onGuardado: () => void;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const num = (s: string) => parseFloat(s) || 0;

let secuenciaLinea = 0;
const nuevaLinea = (): LineaOC => ({
  key: `l${++secuenciaLinea}`, inventario_id: null, descripcion: '', cantidad: '1', vu: '0', pu: '0', igv: '0.00', importe: '0.00', refCosto: null, unidad: null,
});

/** Artículo de servicio: mismo criterio que el clásico (id SERV, familia o tipo Servicio) */
function esArticuloServicio(a: ArticuloInv): boolean {
  const extra = a as ArticuloInv & { es_servicio?: unknown };
  const id = String(a.id ?? '').toUpperCase();
  const fam = String(a.familia ?? '');
  return id.startsWith('SERV')
    || fam === 'Servicio' || fam === 'Servicios'
    || String(a.tipo ?? '').toLowerCase() === 'servicio'
    || extra.es_servicio === 1 || extra.es_servicio === true;
}

/** Costo de referencia del artículo en la moneda de la orden (soles, o dólares si la orden es en USD) */
function costoReferencia(a: ArticuloInv, moneda: string, tc: number): number {
  const soles = Number(a.costo_soles) || Number(a.costo_referencial) || 0;
  if (moneda === 'USD') return tc > 0 ? r4(soles / tc) : 0;
  return r2(soles);
}

/** Valor de respaldo del tipo de cambio: el de configuración (3.70 se cambia a 3.40, como el clásico) */
function tcRespaldoDe(valor: string | undefined): number {
  const v = Number(valor);
  return v > 0 && v !== 3.7 ? v : 3.4;
}

export function EntradaFormulario({ open, entrada: e, onClose, onGuardado }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const inventarioQ = useInventario();
  const inventario = inventarioQ.data ?? [];
  const proveedoresQ = useProveedores();
  const proveedores = proveedoresQ.data ?? [];
  const placasQ = usePlacasLista();
  const otsQ = useOrdenesTrabajoLista();
  const cuentasEmpresaQ = useEmpresaCuentas();
  const configQ = useConfiguracionAlmacen();
  const correlativoQ = useProximoCodigoEntrada(open && !e);

  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(false);

  const [tipoOrden, setTipoOrden] = useState<string>('Orden de compra');
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [tipoCambio, setTipoCambio] = useState('');
  const [placa, setPlaca] = useState('');
  const [otId, setOtId] = useState<string | null>(null);
  const [otPlaca, setOtPlaca] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [autoriza, setAutoriza] = useState('');
  const [centroCosto, setCentroCosto] = useState<string>('CC-100');
  const [motivoGasto, setMotivoGasto] = useState<string>('Gastos Administrativos / Oficina');
  const [subMotivo, setSubMotivo] = useState<string>(SUB_MOTIVOS['Gastos Administrativos / Oficina'][0]);
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [cuentaProv, setCuentaProv] = useState('');
  const [cuentaEmpresa, setCuentaEmpresa] = useState('');
  const [condicion, setCondicion] = useState<string>('Al contado');
  const [diasCredito, setDiasCredito] = useState('30');
  const [prioridad, setPrioridad] = useState<string>('Normal');
  const [urlCotizacion, setUrlCotizacion] = useState('');
  const [nombreCotizacion, setNombreCotizacion] = useState('');
  const [subiendoCotizacion, setSubiendoCotizacion] = useState(false);
  const [modoIgv, setModoIgv] = useState<ModoIgv>('incluido');
  const [lineas, setLineas] = useState<LineaOC[]>([nuevaLinea()]);

  // Altas rápidas (proveedor o artículo que no está en la lista) y escáner
  const [altaProveedor, setAltaProveedor] = useState<{ nombre?: string; ruc?: string } | null>(null);
  const [altaArticulo, setAltaArticulo] = useState<{ key: string; texto: string; servicio: boolean } | null>(null);
  const [escanerKey, setEscanerKey] = useState<string | null>(null);
  const [enfocarCantidad, setEnfocarCantidad] = useState<string | null>(null);
  const cantidadRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // El tipo de cambio de la SUNAT se llena una sola vez por apertura (si la persona lo borra, no vuelve a llenarse)
  const tcAutoRef = useRef(false);

  const servicio = tipoOrden === 'Orden de servicio';
  const tc = num(tipoCambio);
  const tcRespaldo = tcRespaldoDe(configQ.data?.tipo_cambio);
  const sunat = useTipoCambioSunat(open && moneda === 'USD');

  const proveedor = proveedores.find(p => p.id === proveedorId) ?? null;

  // Inicialización al abrir: nueva orden o edición de una existente
  useEffect(() => {
    if (!open) return;
    setIntento(false);
    setSubiendoCotizacion(false);
    tcAutoRef.current = false;
    if (e) {
      const tipo = esServicio(e.tipo_orden) ? 'Orden de servicio' : 'Orden de compra';
      const modo: ModoIgv = e.tipo_igv === 'incluido' || e.tipo_igv === 'mas_igv' ? e.tipo_igv : 'sin_igv';
      const sub = e.sub_motivo ?? '';
      const naturaleza = naturalezaDeSubMotivo(sub) || (e.placa ? 'Mantenimiento y Auxilio' : 'Gastos Administrativos / Oficina');
      const subs = SUB_MOTIVOS[naturaleza] ?? [];
      setTipoOrden(tipo);
      setMoneda(e.moneda === 'USD' ? 'USD' : 'PEN');
      setTipoCambio(e.tipo_cambio ? String(e.tipo_cambio) : '');
      tcAutoRef.current = true;
      setPlaca(esServicio(e.tipo_orden) ? '' : (e.placa ?? ''));
      setOtId(e.ot_id ?? null);
      setOtPlaca(esServicio(e.tipo_orden) ? (e.placa ?? '') : '');
      setMotivo(e.motivo_entrada ?? '');
      setObservaciones(e.observaciones ?? '');
      setAutoriza(e.autoriza || e.solicitante || '');
      setCentroCosto(e.centro_costo || 'CC-100');
      setMotivoGasto(naturaleza);
      setSubMotivo(sub && subs.includes(sub) ? sub : (subs[0] ?? ''));
      setProveedorId(e.proveedor_id ?? null);
      setCuentaProv(e.cuenta_bancaria_proveedor ?? '');
      setCuentaEmpresa(e.cuenta_bancaria_empresa ?? '');
      setCondicion(e.condicion_pago ?? 'Al contado');
      setDiasCredito(String(e.dias_pagar ?? e.dias_credito ?? 30));
      setPrioridad(e.prioridad || 'Normal');
      setUrlCotizacion(e.url_cotizacion ?? '');
      setNombreCotizacion(e.url_cotizacion ? 'Cotización guardada' : '');
      setModoIgv(modo);
      // Mismo cálculo que al cargar la orden en el clásico: el precio guardado va como PU
      setLineas(e.items?.length
        ? e.items.map(it => {
            const base: LineaOC = {
              key: `l${++secuenciaLinea}`, inventario_id: it.inventario_id ?? null, descripcion: it.descripcion ?? '',
              cantidad: String(it.cantidad ?? 0), vu: '0', pu: String(it.costo_unitario ?? 0), igv: '0.00',
              importe: String(it.importe ?? (it.cantidad ?? 0) * (it.costo_unitario ?? 0)), refCosto: null,
              unidad: it.item_unidad ?? null,
            };
            return calcularLinea(base, 'pu', modo);
          })
        : [nuevaLinea()]);
    } else {
      setTipoOrden('Orden de compra');
      setMoneda('PEN'); setTipoCambio('');
      setPlaca(''); setOtId(null); setOtPlaca('');
      setMotivo(''); setObservaciones(''); setAutoriza('');
      setCentroCosto('CC-100'); setMotivoGasto('Gastos Administrativos / Oficina');
      setSubMotivo(SUB_MOTIVOS['Gastos Administrativos / Oficina'][0]);
      setProveedorId(null); setCuentaProv(''); setCuentaEmpresa('');
      setCondicion('Al contado'); setDiasCredito('30'); setPrioridad('Normal');
      setUrlCotizacion(''); setNombreCotizacion('');
      setModoIgv('incluido');
      setLineas([nuevaLinea()]);
    }
  }, [open, e]);

  // Tipo de cambio: en dólares se llena con el de la SUNAT del día; si no responde, con el de respaldo
  useEffect(() => {
    if (!open || moneda !== 'USD' || tcAutoRef.current) return;
    if (sunat.data?.venta) {
      setTipoCambio(String(sunat.data.venta));
      tcAutoRef.current = true;
    } else if (sunat.isError) {
      setTipoCambio(String(tcRespaldo));
      tcAutoRef.current = true;
    }
  }, [open, moneda, sunat.data, sunat.isError, tcRespaldo]);

  // Al entrar a la pantalla con la línea enfocada (escáner): va directo a la cantidad
  useEffect(() => {
    if (!enfocarCantidad) return;
    const campo = cantidadRefs.current[enfocarCantidad];
    if (campo) { campo.focus(); campo.select(); }
    setEnfocarCantidad(null);
  }, [enfocarCantidad]);

  // ── Opciones ──────────────────────────────────────────────────────────────

  const opcionesArticulos: ComboboxOption[] = inventario
    .filter(a => esArticuloServicio(a) === servicio)
    .map(a => ({
      value: a.id,
      label: a.descripcion || a.articulo || a.id,
      description: [a.id, a.marca, a.familia].filter(Boolean).join(' · '),
      keywords: [a.codigo_articulo, a.codigo_barras, a.articulo].filter(Boolean).join(' '),
      icon: a.imagen_url
        ? <img src={a.imagen_url} alt="" className="oc-opcion__foto" loading="lazy" />
        : <span className="oc-opcion__sin-foto"><Package size={15} strokeWidth={1.8} /></span>,
    }));

  const opcionesProveedores: ComboboxOption[] = proveedores.map(p => ({
    value: p.id,
    label: `${p.razon_social || p.nombre}${p.ruc ? ` (${p.ruc})` : ''}`,
    description: p.ruc ? `RUC ${p.ruc}` : undefined,
    keywords: `${p.nombre} ${p.razon_social ?? ''}`,
  }));
  // Un proveedor guardado que ya no aparece en la lista se muestra con su nombre
  if (proveedorId && !proveedor && e?.proveedor_nombre) {
    opcionesProveedores.push({ value: proveedorId, label: e.proveedor_nombre });
  }

  const cuentasProvDeLista = proveedor?.cuentas ?? [];
  const cuentasProvFallback = useCuentasProveedor(proveedorId, !!proveedorId && cuentasProvDeLista.length === 0);
  const cuentasProvEtiquetas = (cuentasProvDeLista.length ? cuentasProvDeLista : (cuentasProvFallback.data ?? [])).map(etiquetaCuentaProveedor);
  if (cuentaProv && !cuentasProvEtiquetas.includes(cuentaProv)) cuentasProvEtiquetas.push(cuentaProv);

  const cuentasEmpresaEtiquetas = (cuentasEmpresaQ.data ?? []).map(etiquetaCuentaEmpresa);
  if (cuentaEmpresa && !cuentasEmpresaEtiquetas.includes(cuentaEmpresa)) cuentasEmpresaEtiquetas.push(cuentaEmpresa);

  const placas = (placasQ.data ?? []).map(p => ({ placa: p.placa, detalle: p.cliente }));
  const otsOpciones: ComboboxOption[] = (otsQ.data ?? []).map(o => ({
    value: o.id_ot, label: o.placa ? `${o.id_ot} — ${o.placa}` : o.id_ot,
  }));

  // ── Cambios de campos con reglas del clásico ──────────────────────────────

  function cambiarMotivo(m: string) {
    setMotivoGasto(m);
    setSubMotivo(SUB_MOTIVOS[m]?.[0] ?? '');
    const cc = centroCostoSugerido(m);
    if (cc) setCentroCosto(cc);
  }

  function elegirPlaca(p: string) {
    setPlaca(p);
    if (p) {
      setCentroCosto('CC-400');
      cambiarMotivo('Mantenimiento y Auxilio');
    }
  }

  function elegirOt(id: string | null) {
    setOtId(id);
    const ot = (otsQ.data ?? []).find(o => o.id_ot === id);
    setOtPlaca(ot?.placa ?? '');
    setPlaca(ot?.placa ?? '');
  }

  function cambiarTipo(t: string) {
    setTipoOrden(t);
    const seraServicio = t === 'Orden de servicio';
    // Los artículos de la otra clase no sirven en esta orden: se quitan
    setLineas(prev => prev.map(l => {
      if (!l.inventario_id) return l;
      const art = inventario.find(a => a.id === l.inventario_id);
      return art && esArticuloServicio(art) !== seraServicio ? { ...l, inventario_id: null, descripcion: '', refCosto: null, unidad: null } : l;
    }));
  }

  function cambiarModoIgv(nuevo: ModoIgv) {
    const previo = modoIgv;
    setModoIgv(nuevo);
    // Mismo criterio que _entSetIgvMode: el precio escrito pasa a ser la base (+IGV) o el precio con IGV
    setLineas(prev => prev.map(l => {
      let base: LineaOC = { ...l };
      if (previo !== nuevo) {
        if (nuevo === 'mas_igv') base = { ...base, vu: base.pu };
        else if (nuevo === 'incluido' && previo === 'mas_igv') base = { ...base, pu: base.vu };
      }
      return calcularLinea(base, nuevo === 'mas_igv' ? 'vu' : 'pu', nuevo);
    }));
  }

  // Al pasar a dólares, el efecto de tipo de cambio llena el T/C (SUNAT o respaldo)
  function cambiarMoneda(m: 'PEN' | 'USD') {
    setMoneda(m);
  }

  function editarCampo(key: string, campo: CampoLinea, texto: string) {
    setLineas(prev => prev.map(l => {
      if (l.key !== key) return l;
      const nueva: LineaOC = { ...l };
      nueva[campo] = texto;
      return calcularLinea(nueva, campo, modoIgv);
    }));
  }

  /** Asigna un artículo a la línea y trae su costo de referencia (como el clásico) */
  function asignarArticulo(key: string, art: ArticuloInv) {
    const ref = costoReferencia(art, moneda, tc);
    setLineas(prev => prev.map(l => {
      if (l.key !== key) return l;
      const base: LineaOC = {
        ...l,
        inventario_id: art.id,
        descripcion: art.articulo || art.descripcion || '',
        unidad: art.unidad ?? null,
        refCosto: ref > 0 ? ref : null,
        cantidad: num(l.cantidad) > 0 ? l.cantidad : '1',
      };
      if (modoIgv === 'mas_igv') return calcularLinea({ ...base, vu: (ref / (1 + TASA_IGV)).toFixed(4) }, 'vu', modoIgv);
      return calcularLinea({ ...base, pu: ref.toFixed(2) }, 'pu', modoIgv);
    }));
  }

  function elegirArticulo(key: string, id: string | null) {
    if (!id) {
      setLineas(prev => prev.map(l => (l.key === key ? { ...l, inventario_id: null, descripcion: '', refCosto: null, unidad: null } : l)));
      return;
    }
    const art = inventario.find(a => a.id === id);
    if (art) asignarArticulo(key, art);
  }

  function quitarLinea(key: string) {
    setLineas(prev => prev.filter(l => l.key !== key));
  }

  /** Resultado del escáner: busca por código (o código de barras) entre los artículos de esta clase */
  function leerCodigo(texto: string) {
    const codigo = texto.trim();
    const art = inventario.find(a => (a.id === codigo || (a.codigo_barras ?? '').trim() === codigo) && esArticuloServicio(a) === servicio);
    const key = escanerKey;
    setEscanerKey(null);
    if (!key) return;
    if (!art) { toast(`Artículo no encontrado: ${codigo}`, 'error'); return; }
    asignarArticulo(key, art);
    setEnfocarCantidad(key);
  }

  // Alta rápida: el artículo nuevo queda seleccionado en la línea que lo pidió
  async function articuloRegistrado(id?: string) {
    const key = altaArticulo?.key;
    setAltaArticulo(null);
    await qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
    if (!key || !id) return;
    const art = qc.getQueryData<ArticuloInv[]>(['almacen', 'inventario'])?.find(a => a.id === id);
    if (art) {
      asignarArticulo(key, art);
      toast(`${art.descripcion || art.articulo || 'Artículo'} registrado y seleccionado`);
    }
  }

  async function proveedorRegistrado(id?: string) {
    setAltaProveedor(null);
    await qc.invalidateQueries({ queryKey: ['almacen', 'proveedores'] });
    if (!id) return;
    setProveedorId(id);
    setCuentaProv('');
    toast('Proveedor registrado y seleccionado');
  }

  async function subirArchivoCotizacion(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendoCotizacion(true);
    try {
      const url = await subirCotizacion(archivo);
      setUrlCotizacion(url);
      setNombreCotizacion(archivo.name);
    } catch (err) {
      setUrlCotizacion('');
      setNombreCotizacion('');
      toast(`Error al subir la cotización: ${errorMessage(err)}`, 'error');
    } finally {
      setSubiendoCotizacion(false);
    }
  }

  // ── Validación ────────────────────────────────────────────────────────────

  const usados = lineas.filter(l => l.inventario_id);
  const errorLinea = (l: LineaOC): string | null => {
    // Una línea sin artículo y sin precio es una fila vacía: no cuenta
    if (!l.inventario_id) {
      return num(l.pu) > 0 ? (servicio ? 'Elige un servicio de la lista' : 'Elige un artículo de la lista') : null;
    }
    if (!(num(l.cantidad) > 0)) return 'La cantidad debe ser mayor que cero';
    if (!(num(l.pu) >= 0)) return 'El precio no puede ser negativo';
    return null;
  };
  const errorCab = {
    autoriza: !autoriza ? 'Selecciona quién autoriza la orden.' : undefined,
    proveedor: !proveedorId ? 'Elige el proveedor de la lista.' : undefined,
    tc: moneda === 'USD' && !(tc > 0) ? 'Indica el tipo de cambio del día.' : undefined,
    dias: condicion === 'A crédito' && !(num(diasCredito) > 0) ? 'Indica los días de crédito.' : undefined,
    articulos: usados.length === 0 ? (servicio ? 'Agrega al menos un servicio.' : 'Agrega al menos un artículo.') : undefined,
  };
  const hayErrores = Object.values(errorCab).some(Boolean) || lineas.some(l => errorLinea(l) !== null);
  const mostrar = (msg: string | undefined) => (intento ? msg : undefined);

  // ── Guardar ───────────────────────────────────────────────────────────────

  async function guardar() {
    setIntento(true);
    if (hayErrores) { haptic('warning'); return; }
    const provSel = proveedor;
    const payload: PayloadEntrada = {
      fecha: e ? (e.fecha?.split('T')[0] ?? hoyLocal()) : hoyLocal(),
      serie: e ? (e.serie ?? undefined) : String(new Date().getFullYear()),
      numero_correlativo: e ? (e.numero_correlativo ?? e.id) : (correlativoQ.data?.codigo ?? undefined),
      tipo_orden: servicio ? 'Orden de servicio' : 'Orden de compra',
      proveedor_id: proveedorId,
      proveedor_nombre: provSel ? (provSel.razon_social || provSel.nombre) : (e?.proveedor_nombre ?? null),
      cuenta_bancaria_proveedor: cuentaProv || null,
      cuenta_bancaria_empresa: cuentaEmpresa || null,
      solicitante: autoriza || null,
      autoriza,
      centro_costo: centroCosto,
      sub_motivo: subMotivo,
      motivo_entrada: motivo,
      placa: (servicio ? otPlaca : placa) || null,
      ot_id: servicio ? (otId || null) : null,
      documento_referencia: e?.documento_referencia ?? null,
      estado_factura: e?.estado_factura ?? 'Factura Pendiente',
      moneda,
      tipo_cambio: tc || null,
      tipo_igv: modoIgv,
      condicion_pago: condicion,
      dias_credito: condicion === 'A crédito' ? num(diasCredito) : 0,
      dias_pagar: condicion === 'A crédito' ? num(diasCredito) : 0,
      prioridad,
      observaciones: observaciones || null,
      creado_por: user?.name ?? null,
      url_cotizacion: urlCotizacion || null,
      items: usados.map(l => ({
        inventario_id: l.inventario_id,
        descripcion: l.descripcion,
        cantidad: num(l.cantidad),
        costo_unitario: num(l.pu),
        moneda,
        importe: importeLinea(l),
      })),
    };

    setGuardando(true);
    try {
      await guardarEntrada(payload, e?.id);
      toast(e ? 'Orden actualizada' : (servicio ? 'Orden de servicio registrada' : 'Orden de compra registrada'));
      haptic('success');
      onGuardado();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  const { total, igv, gravado } = totalesLineas(lineas);
  const conIgv = modoIgv !== 'sin_igv';
  const dinero = (n: number) => formatMoneda(n, moneda);
  const tituloSheet = `${e ? 'Editar' : 'Nueva'} ${servicio ? 'orden de servicio' : 'orden de compra'}`;
  const codigoMostrado = e ? codigoLimpio(e.id) : (correlativoQ.data?.codigo ? codigoLimpio(correlativoQ.data.codigo) : '…');

  const pie = (
    <div className="oc-pie">
      <SegmentedControl<ModoIgv> block label="Tipo de IGV" value={modoIgv} onChange={cambiarModoIgv} options={MODOS_IGV} />
      {conIgv && (
        <div className="oc-pie__desglose">
          <span>Gravado <strong>{dinero(gravado)}</strong></span>
          <span>IGV 18 % <strong className="oc-pie__igv">{dinero(igv)}</strong></span>
        </div>
      )}
      <div className="oc-pie__total">
        <span className="oc-pie__etiqueta">Total</span>
        <span className="oc-pie__monto">
          {dinero(total)}
          {moneda === 'USD' && tc > 0 && <small> ≈ {formatMoneda(total * tc, 'PEN')}</small>}
        </span>
      </div>
      <div className="oc-pie__acciones">
        <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" loading={guardando} onClick={guardar} style={{ flex: 1 }}>
          {e ? 'Guardar cambios' : 'Confirmar ingreso'}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Sheet open={open} onClose={onClose} title={tituloSheet} ancho footer={pie}>
        <div className="oc-form">

          {/* Datos de la orden */}
          <section className="oc-card">
            <h3 className="oc-card__titulo">Datos de la orden</h3>
            <div className="oc-grid">
              <Field label="N° de orden">
                {p => <TextInput {...p} readOnly value={codigoMostrado} className="oc-mono" />}
              </Field>
              <Field label="Fecha de registro" hint="Se registra con la fecha de hoy">
                {p => <TextInput {...p} readOnly value={e ? (e.fecha?.split('T')[0] ?? '') : hoyLocal()} />}
              </Field>
              <Field label="Tipo de orden">
                {p => (
                  <SelectInput {...p} value={tipoOrden} onChange={ev => cambiarTipo(ev.target.value)}>
                    {TIPOS_ORDEN.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label="Moneda">
                {p => (
                  <SelectInput {...p} value={moneda} onChange={ev => cambiarMoneda(ev.target.value as 'PEN' | 'USD')}>
                    <option value="PEN">Soles (S/)</option>
                    <option value="USD">Dólares (US$)</option>
                  </SelectInput>
                )}
              </Field>
              {moneda === 'USD' && (
                <Field label="Tipo de cambio *" error={mostrar(errorCab.tc)}
                  hint={sunat.data?.venta ? `SUNAT venta del ${sunat.data.fecha}: ${sunat.data.venta}` : sunat.isError ? 'SUNAT no respondió: se usa el tipo de cambio de respaldo' : 'Consultando el tipo de cambio SUNAT…'}>
                  {p => <TextInput {...p} type="number" min={0} step="0.0001" value={tipoCambio} placeholder="SUNAT del día" onChange={ev => setTipoCambio(ev.target.value)} />}
                </Field>
              )}
            </div>
          </section>

          {/* Destino y motivo */}
          <section className="oc-card">
            <h3 className="oc-card__titulo">{servicio ? 'Servicio y vehículo' : 'Vehículo y motivo'}</h3>
            <div className="oc-grid">
              {servicio ? (
                <>
                  <Field label="OT asociada (opcional)">
                    {p => (
                      <Combobox id={p.id} options={otsOpciones} value={otId} onChange={elegirOt} placeholder="Busca la OT…" loading={otsQ.isLoading} />
                    )}
                  </Field>
                  <Field label="Placa de la OT">
                    {p => (
                      <PlacaPicker id={p.id} value={otPlaca} onChange={setOtPlaca} opciones={placas} placeholder="Elige la placa…" />
                    )}
                  </Field>
                </>
              ) : (
                <Field label="Vehículo / placa" wide>
                  {p => (
                    <PlacaPicker id={p.id} value={placa} onChange={elegirPlaca} opciones={placas} placeholder="Elige una placa…" />
                  )}
                </Field>
              )}
              <Field label="Motivo de compra / ingreso" wide>
                {p => <TextInput {...p} value={motivo} placeholder="Describe el motivo o destino de la compra" onChange={ev => setMotivo(ev.target.value)} />}
              </Field>
              <Field label="Observaciones y condiciones" wide>
                {p => (
                  <textarea {...p} className="textarea" rows={2} value={observaciones} placeholder="Plazos de entrega, garantías, notas…" onChange={ev => setObservaciones(ev.target.value)} />
                )}
              </Field>
            </div>
          </section>

          {/* Concepto, centro de costo y autorización */}
          <section className="oc-card">
            <h3 className="oc-card__titulo">Concepto y autorización</h3>
            <div className="oc-grid">
              <Field label="Autoriza / solicitante *" error={mostrar(errorCab.autoriza)}>
                {p => (
                  <SelectInput {...p} value={autoriza} onChange={ev => setAutoriza(ev.target.value)}>
                    <option value="">Selecciona al directivo…</option>
                    {DIRECTIVOS.map(d => <option key={d} value={d}>{d}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label="Centro de costos *">
                {p => (
                  <SelectInput {...p} value={centroCosto} onChange={ev => setCentroCosto(ev.target.value)}>
                    {CENTROS_COSTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label="Motivo (naturaleza del gasto) *">
                {p => (
                  <SelectInput {...p} value={motivoGasto} onChange={ev => cambiarMotivo(ev.target.value)}>
                    {MOTIVOS_GASTO.map(m => <option key={m} value={m}>{m}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label="Sub motivo (detalle) *">
                {p => (
                  <SelectInput {...p} value={subMotivo} onChange={ev => setSubMotivo(ev.target.value)}>
                    {(SUB_MOTIVOS[motivoGasto] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                  </SelectInput>
                )}
              </Field>
            </div>
          </section>

          {/* Proveedor y cuentas */}
          <section className="oc-card">
            <h3 className="oc-card__titulo">Proveedor y cuentas bancarias</h3>
            <div className="oc-grid">
              <Field label="Proveedor *" error={mostrar(errorCab.proveedor)} hint={proveedor ? (proveedor.ruc ? `RUC ${proveedor.ruc}` : 'Este proveedor no tiene RUC registrado') : 'Si no está en la lista, escríbelo y regístralo ahí mismo'}>
                {p => (
                  <Combobox
                    id={p.id}
                    options={opcionesProveedores}
                    value={proveedorId}
                    onChange={id => { setProveedorId(id); setCuentaProv(''); }}
                    placeholder="Busca por nombre o RUC…"
                    loading={proveedoresQ.isLoading}
                    onCreate={texto => {
                      const digitos = texto.replace(/\D/g, '');
                      setAltaProveedor(digitos.length >= 8 ? { ruc: digitos } : { nombre: texto.trim() });
                    }}
                    createLabel="Registrar proveedor"
                    aria-invalid={!!mostrar(errorCab.proveedor) || undefined}
                  />
                )}
              </Field>
              <Field label="Cuenta bancaria del proveedor">
                {p => (
                  <SelectInput {...p} value={cuentaProv} onChange={ev => setCuentaProv(ev.target.value)} disabled={!proveedorId}>
                    <option value="">{proveedorId ? 'Selecciona la cuenta…' : 'Primero elige el proveedor'}</option>
                    {cuentasProvEtiquetas.map(c => <option key={c} value={c}>{c}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label="Cuenta bancaria de la empresa" wide>
                {p => (
                  <SelectInput {...p} value={cuentaEmpresa} onChange={ev => setCuentaEmpresa(ev.target.value)}>
                    <option value="">Selecciona la cuenta de la empresa…</option>
                    {cuentasEmpresaEtiquetas.map(c => <option key={c} value={c}>{c}</option>)}
                  </SelectInput>
                )}
              </Field>
            </div>
          </section>

          {/* Condiciones de pago y cotización */}
          <section className="oc-card">
            <h3 className="oc-card__titulo">Condiciones de pago y cotización</h3>
            <div className="oc-grid">
              <Field label="Condición de pago *">
                {p => (
                  <SelectInput {...p} value={condicion} onChange={ev => { setCondicion(ev.target.value); if (ev.target.value !== 'A crédito') setDiasCredito('0'); else if (!num(diasCredito)) setDiasCredito('30'); }}>
                    {CONDICIONES_PAGO.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                  </SelectInput>
                )}
              </Field>
              {condicion === 'A crédito' ? (
                <Field label="Días de crédito *" error={mostrar(errorCab.dias)}>
                  {p => <TextInput {...p} type="number" min={1} value={diasCredito} onChange={ev => setDiasCredito(ev.target.value)} />}
                </Field>
              ) : null}
              <Field label="Prioridad *">
                {p => (
                  <SelectInput {...p} value={prioridad} onChange={ev => setPrioridad(ev.target.value)}>
                    {PRIORIDADES.map(x => <option key={x} value={x}>{x}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label="Cotización del proveedor" wide hint="Opcional, pero recomendada">
                {() => (
                  <div className="oc-cotizacion">
                    <input
                      id="oc-cotizacion-archivo"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                      className="oc-oculto"
                      onChange={ev => { void subirArchivoCotizacion(ev.target.files?.[0]); ev.target.value = ''; }}
                    />
                    <Button size="sm" variant="secondary" icon={<Paperclip size={14} />} loading={subiendoCotizacion}
                      onClick={() => document.getElementById('oc-cotizacion-archivo')?.click()}>
                      {urlCotizacion ? 'Cambiar cotización' : 'Seleccionar cotización'}
                    </Button>
                    {urlCotizacion ? (
                      <span className="oc-cotizacion__nombre">
                        {nombreCotizacion || 'Cotización adjunta'}
                        <button type="button" className="oc-cotizacion__quitar" aria-label="Quitar cotización"
                          onClick={() => { setUrlCotizacion(''); setNombreCotizacion(''); }}>
                          <X size={14} />
                        </button>
                      </span>
                    ) : (
                      <span className="oc-cotizacion__nombre oc-cotizacion__nombre--vacio">Ningún archivo seleccionado</span>
                    )}
                  </div>
                )}
              </Field>
            </div>
          </section>

          {/* Artículos */}
          <section className="oc-card">
            <div className="oc-lineas__cabecera">
              <h3 className="oc-card__titulo" style={{ margin: 0 }}>{servicio ? 'Servicios' : 'Artículos'}</h3>
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setLineas(prev => [...prev, nuevaLinea()])}>
                Agregar
              </Button>
            </div>
            {mostrar(errorCab.articulos) && <p role="alert" className="t-footnote oc-error">{errorCab.articulos}</p>}

            {lineas.length === 0 && (
              <p className="t-footnote c-secondary" style={{ margin: 0 }}>Sin líneas. Usa «Agregar» para añadir {servicio ? 'un servicio' : 'un artículo'}.</p>
            )}

            <div className="oc-lineas">
              {lineas.map((l, idx) => {
                const error = errorLinea(l);
                const alerta = alertaPrecio(num(l.pu), l.refCosto);
                return (
                  <article key={l.key} className={`oc-linea${alerta ? (alerta.subio ? ' oc-linea--sube' : ' oc-linea--baja') : ''}`}>
                    <div className="oc-linea__fila">
                      <div className="oc-linea__articulo">
                        <Combobox
                          id={`oc-art-${l.key}`}
                          options={opcionesArticulos}
                          value={l.inventario_id}
                          onChange={id => elegirArticulo(l.key, id)}
                          placeholder={servicio ? 'Busca un servicio…' : 'Busca por código o nombre…'}
                          loading={inventarioQ.isLoading}
                          onCreate={texto => setAltaArticulo({ key: l.key, texto: texto.trim(), servicio })}
                          createLabel={servicio ? 'Registrar servicio' : 'Registrar artículo'}
                          aria-invalid={!!mostrar(error ?? undefined) || undefined}
                        />
                      </div>
                      {!servicio && (
                        <button type="button" className="oc-icono oc-icono--qr" title="Escanear código" aria-label="Escanear código del artículo"
                          onClick={() => setEscanerKey(l.key)}>
                          <ScanLine size={16} />
                        </button>
                      )}
                      <button type="button" className="oc-icono oc-icono--quitar" title="Quitar línea" aria-label="Quitar línea"
                        onClick={() => quitarLinea(l.key)}>
                        <X size={16} />
                      </button>
                    </div>

                    <div className="oc-linea__campos">
                      <label className="oc-campo">
                        <span>Cant.</span>
                        <input className="input" type="number" min={0} step="0.001" value={l.cantidad}
                          ref={el => { cantidadRefs.current[l.key] = el; }}
                          onChange={ev => editarCampo(l.key, 'cantidad', ev.target.value)} />
                      </label>
                      <label className="oc-campo">
                        <span>Valor unit.</span>
                        <input className="input" type="number" min={0} step="0.0001" value={l.vu}
                          onChange={ev => editarCampo(l.key, 'vu', ev.target.value)} />
                      </label>
                      <label className="oc-campo">
                        <span>Precio unit.</span>
                        <input className="input" type="number" min={0} step="0.0001" value={l.pu}
                          onChange={ev => editarCampo(l.key, 'pu', ev.target.value)} />
                      </label>
                      <label className="oc-campo">
                        <span>IGV</span>
                        <input className="input oc-solo-lectura" type="number" readOnly value={l.igv} />
                      </label>
                      <label className="oc-campo">
                        <span>Importe</span>
                        <input className="input" type="number" min={0} step="0.01" value={l.importe}
                          onChange={ev => editarCampo(l.key, 'importe', ev.target.value)} />
                      </label>
                    </div>

                    {alerta && (
                      <div className="oc-alerta">
                        <span className={`oc-alerta__chip ${alerta.subio ? 'oc-alerta__chip--sube' : 'oc-alerta__chip--baja'}`}>
                          {alerta.subio ? '¡Sube!' : 'Baja'}
                        </span>
                        <span className="oc-alerta__texto">
                          Ref. {formatMoneda(l.refCosto, moneda)} → {alerta.subio ? '+' : ''}{alerta.pct.toFixed(1)} %
                        </span>
                      </div>
                    )}
                    {error && <p className="oc-error t-footnote" role="alert">{error}</p>}
                    <span className="oc-linea__indice">{idx + 1}</span>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </Sheet>

      <EscanerQr open={escanerKey !== null} onClose={() => setEscanerKey(null)} onLeido={leerCodigo}
        titulo={servicio ? 'Escanear servicio' : 'Escanear artículo'} />

      <ProveedorFormulario
        open={altaProveedor !== null}
        proveedor={null}
        inicial={altaProveedor}
        onClose={() => setAltaProveedor(null)}
        onGuardado={id => { void proveedorRegistrado(id); }}
      />

      <InventarioFormulario
        open={altaArticulo !== null}
        articulo={null}
        inicial={altaArticulo ? { articulo: altaArticulo.texto, servicio: altaArticulo.servicio } : null}
        onClose={() => setAltaArticulo(null)}
        onGuardado={id => { void articuloRegistrado(id); }}
      />
    </>
  );
}
