import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

// Forma de una guía (GRE) adjunta a la orden, tal como la guarda el servidor
export interface DocOS {
  guia_remision_id: number | null;
  numero_documento: string;
  tipo_documento: string;
  gr_remitente: string;
  numero_transporte: string;
  placa_referencia: string;
  volumen: number;
  cantidad: number;
  peso: number;
  remitente: string;
  destinatario: string;
  fecha_carga: string;
  fecha_entrega: string;
}

interface RutaOS { ruta: string; distancia_km: string; galones: string }

// Lo que llega del detalle de la orden (GET /operaciones/ordenes-servicio/:id)
export interface OrdenParaEditar {
  id: number;
  codigo_orden: string;
  fecha_fmt?: string | null;
  moneda?: string | null;
  tipo_cambio?: number | string | null;
  modalidad_ejecucion?: string | null;
  proveedor_tercero_nombre?: string | null;
  proveedor_tercero_ruc?: string | null;
  cliente_nombre?: string | null;
  tipo_servicio?: string | null;
  es_retorno?: number | boolean | null;
  tipo_costo?: string | null;
  impuesto?: string | null;
  costo_flete?: number | string | null;
  puntos_carga?: number | string | null;
  puntos_destino?: number | string | null;
  destinatario?: string | null;
  observaciones?: string | null;
  viaje_asignado?: string | null;
  placa_tracto?: string | null;
  placa_carreta?: string | null;
  documentos?: Record<string, unknown>[];
  rutas?: { ruta?: string; distancia_km?: number | string; galones?: number | string }[];
}

interface Form {
  serie: string; numero: string; fecha: string; moneda: string; tipo_cambio: string; modalidad: string;
  proveedor: string; proveedor_ruc: string; cliente: string; tipo_servicio: string; es_retorno: string;
  tipo_costo: string; impuesto: string; costo_flete: string; puntos_carga: string; puntos_destino: string;
  destinatario: string; observaciones: string; viaje: string; tracto: string; carreta: string;
  rutas: RutaOS[]; docs: DocOS[];
}

interface GreDisponible {
  id: number; numero_guia: string; fecha_traslado: string | null; fecha_emision: string | null;
  remitente_razon_social: string | null; destinatario_razon_social: string | null; placa_tracto: string | null;
  placa_carreta: string | null; peso_bruto_total: number | string; volumen_m3: number | string; total_items: number | string;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown, def = 0) => (Number(v) || def);
const hoy = () => new Date().toISOString().slice(0, 10);

function formInicial(o: OrdenParaEditar | null, correlativo: { serie: string; numero: string } | null, viajeInicial = ''): Form {
  if (o) {
    const [serie, ...resto] = o.codigo_orden.split('-');
    return {
      serie, numero: resto.join('-'), fecha: str(o.fecha_fmt) || hoy(), moneda: str(o.moneda) || 'SOLES',
      tipo_cambio: str(o.tipo_cambio ?? '3.750'), modalidad: str(o.modalidad_ejecucion) || 'PROPIO',
      proveedor: str(o.proveedor_tercero_nombre), proveedor_ruc: str(o.proveedor_tercero_ruc), cliente: str(o.cliente_nombre),
      tipo_servicio: str(o.tipo_servicio) || 'TRANSPORTE NACIONAL', es_retorno: o.es_retorno ? '1' : '0',
      tipo_costo: str(o.tipo_costo) || 'COSTO TARIFA', impuesto: str(o.impuesto) || 'INCLUYE IGV',
      costo_flete: str(o.costo_flete ?? ''), puntos_carga: str(o.puntos_carga ?? 1), puntos_destino: str(o.puntos_destino ?? 1),
      destinatario: str(o.destinatario), observaciones: str(o.observaciones), viaje: str(o.viaje_asignado),
      tracto: str(o.placa_tracto), carreta: str(o.placa_carreta),
      rutas: (o.rutas ?? []).map(r => ({ ruta: str(r.ruta), distancia_km: str(r.distancia_km), galones: str(r.galones) })),
      docs: (o.documentos ?? []).map(d => ({
        guia_remision_id: d.guia_remision_id ? Number(d.guia_remision_id) : null,
        numero_documento: str(d.numero_documento), tipo_documento: str(d.tipo_documento) || 'GRE',
        gr_remitente: str(d.gr_remitente), numero_transporte: str(d.numero_transporte), placa_referencia: str(d.placa_referencia),
        volumen: num(d.volumen), cantidad: num(d.cantidad, 1), peso: num(d.peso), remitente: str(d.remitente),
        destinatario: str(d.destinatario), fecha_carga: str(d.fecha_carga_fmt ?? d.fecha_carga), fecha_entrega: str(d.fecha_entrega_fmt ?? d.fecha_entrega),
      })),
    };
  }
  return {
    serie: correlativo?.serie ?? String(new Date().getFullYear()), numero: correlativo?.numero ?? '', fecha: hoy(),
    moneda: 'SOLES', tipo_cambio: '3.750', modalidad: 'PROPIO', proveedor: '', proveedor_ruc: '', cliente: '',
    tipo_servicio: 'TRANSPORTE NACIONAL', es_retorno: '0', tipo_costo: 'COSTO TARIFA', impuesto: 'INCLUYE IGV',
    costo_flete: '', puntos_carga: '1', puntos_destino: '1', destinatario: '', observaciones: '', viaje: viajeInicial, tracto: '', carreta: '',
    rutas: [], docs: [],
  };
}

// Crear o editar una orden de servicio con sus rutas y guías (GRE). Mismo contrato que el clásico:
// POST/PUT /api/operaciones/ordenes-servicio. Las guías se toman de las ya emitidas y sin servicio.
export function OrdenServicioSheet({ open, orden, onClose, viajeInicial = '' }: { open: boolean; orden: OrdenParaEditar | null; onClose: () => void; viajeInicial?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const editando = !!orden;
  const [f, setF] = useState<Form | null>(null);
  const [buscarGre, setBuscarGre] = useState(false);
  const [filtroGre, setFiltroGre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correlativo = useQuery({
    queryKey: ['operaciones', 'os-correlativo'],
    enabled: open && !editando,
    queryFn: () => api<{ serie: string; numero: string }>('/operaciones/ordenes-servicio/correlativo'),
    staleTime: 0,
  });
  const clientes = useQuery({
    queryKey: ['directorio', 'clientes'],
    enabled: open,
    queryFn: () => api<unknown>('/clientes').then(r => (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? [])) as { nombre?: string; razon_social?: string }[]),
    staleTime: 60_000,
  });
  // Rutas de la matriz de combustible D2: lista para elegir y autocompletar el recorrido (km), como en el clásico
  const matriz = useQuery({
    queryKey: ['operaciones', 'rutas-matriz'],
    enabled: open,
    queryFn: () => api<{ data?: { ruta?: string; km?: number | string }[] }>('/operaciones/rutas-matriz').then(r => r.data ?? []),
    staleTime: 5 * 60_000,
  });
  const gres = useQuery({
    queryKey: ['operaciones', 'gre-disponibles'],
    enabled: open && buscarGre,
    queryFn: () => api<{ data?: GreDisponible[] }>('/guias-remision/disponibles-sin-servicio').then(r => r.data ?? []),
    staleTime: 20_000,
  });

  useEffect(() => {
    if (!open) return;
    setError(null); setEnviando(false); setBuscarGre(false); setFiltroGre('');
    setF(formInicial(orden, null, viajeInicial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orden, viajeInicial]);

  // Cuando llega el correlativo de una orden nueva, se completa el número
  useEffect(() => {
    if (!open || editando || !correlativo.data) return;
    setF(prev => (prev && !prev.numero ? { ...prev, serie: correlativo.data.serie, numero: correlativo.data.numero } : prev));
  }, [correlativo.data, open, editando]);

  // Una sola entrada por ruta (con el mayor km), igual que el clásico
  const rutasMatriz = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of matriz.data ?? []) {
      const k = String(r.ruta ?? '').trim().toUpperCase();
      if (k && (!m.has(k) || num(r.km) > (m.get(k) ?? 0))) m.set(k, num(r.km));
    }
    return m;
  }, [matriz.data]);
  const adjuntas = useMemo(() => new Set((f?.docs ?? []).map(d => d.numero_documento)), [f?.docs]);
  const disponibles = useMemo(() => (gres.data ?? [])
    .filter(g => !adjuntas.has(g.numero_guia))
    .filter(g => !filtroGre || [g.numero_guia, g.remitente_razon_social, g.destinatario_razon_social, g.placa_tracto]
      .some(x => String(x ?? '').toUpperCase().includes(filtroGre.toUpperCase()))), [gres.data, adjuntas, filtroGre]);

  if (!f) return null;
  const set = (patch: Partial<Form>) => setF(prev => (prev ? { ...prev, ...patch } : prev));

  // Igual que el clásico: al adjuntar una guía se completan cliente, destinatario y placas si están vacíos
  function adjuntarGre(g: GreDisponible) {
    const doc: DocOS = {
      guia_remision_id: g.id, numero_documento: g.numero_guia, tipo_documento: 'GRE', gr_remitente: g.numero_guia,
      numero_transporte: g.numero_guia, placa_referencia: g.placa_tracto ?? '', volumen: num(g.volumen_m3), cantidad: num(g.total_items, 1),
      peso: num(g.peso_bruto_total), remitente: g.remitente_razon_social ?? '', destinatario: g.destinatario_razon_social ?? '',
      fecha_carga: g.fecha_traslado || g.fecha_emision || '', fecha_entrega: g.fecha_traslado || '',
    };
    set({
      docs: [...f!.docs, doc],
      cliente: f!.cliente || (g.remitente_razon_social ?? ''),
      destinatario: f!.destinatario || (g.destinatario_razon_social ?? ''),
      tracto: f!.tracto || (g.placa_tracto ?? '').trim().toUpperCase(),
      carreta: f!.carreta || (g.placa_carreta ?? '').trim().toUpperCase(),
    });
  }

  // Al escribir o elegir una ruta de la matriz se completa el km si existe (no pisa si no hay coincidencia)
  function cambiarRuta(i: number, ruta: string) {
    const km = rutasMatriz.get(ruta.trim().toUpperCase());
    set({ rutas: f!.rutas.map((x, j) => (j === i ? { ...x, ruta, ...(km ? { distancia_km: String(km) } : {}) } : x)) });
  }

  async function guardar() {
    setError(null);
    if (!f!.cliente.trim()) { setError('Escribe o elige el cliente.'); return; }
    if (f!.modalidad === 'TERCERIZADO' && !f!.proveedor.trim()) { setError('Indica el proveedor tercero de la flota tercerizada.'); return; }

    const payload = {
      serie: f!.serie, numero: f!.numero, fecha: f!.fecha, moneda: f!.moneda, tipo_cambio: f!.tipo_cambio,
      tipo_contratacion: f!.modalidad === 'TERCERIZADO' ? 'TERCERO' : 'CLIENTE DIRECTO', modalidad_ejecucion: f!.modalidad,
      proveedor_tercero_nombre: f!.proveedor.trim() || null, proveedor_tercero_ruc: f!.proveedor_ruc.trim() || null,
      cliente_nombre: f!.cliente.trim(), tipo_servicio: f!.tipo_servicio, es_retorno: Number(f!.es_retorno),
      tipo_costo: f!.tipo_costo, impuesto: f!.impuesto, costo_flete: f!.costo_flete, puntos_carga: f!.puntos_carga,
      puntos_destino: f!.puntos_destino, destinatario: f!.destinatario.trim(), observaciones: f!.observaciones,
      viaje_asignado: f!.viaje.trim() || null, placa_tracto: f!.tracto.trim() || null, placa_carreta: f!.carreta.trim() || null,
      rutas: f!.rutas.filter(r => r.ruta.trim() || r.distancia_km || r.galones),
      documentos: f!.docs,
    };

    setEnviando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string; codigo_orden?: string }>(
        editando ? `/operaciones/ordenes-servicio/${orden!.id}` : '/operaciones/ordenes-servicio',
        { method: editando ? 'PUT' : 'POST', body: payload },
      );
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar la orden');
      haptic('success');
      toast(`Orden ${r.codigo_orden ?? f!.serie + '-' + f!.numero} ${editando ? 'actualizada' : 'creada'}`);
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const titulo = editando ? `Editar ${orden!.codigo_orden}` : 'Nueva orden de servicio';

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={titulo}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>{editando ? 'Guardar cambios' : 'Crear orden'}</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <Field label="Serie">{p => <TextInput {...p} value={f.serie} onChange={e => set({ serie: e.target.value })} disabled={editando} />}</Field>
        <Field label="Número">{p => <TextInput {...p} value={f.numero} onChange={e => set({ numero: e.target.value })} disabled={editando} />}</Field>
        <Field label="Fecha">{p => <TextInput {...p} type="date" value={f.fecha} onChange={e => set({ fecha: e.target.value })} />}</Field>
        <Field label="Moneda">
          {p => (
            <SelectInput {...p} value={f.moneda} onChange={e => set({ moneda: e.target.value })}>
              <option value="SOLES">SOLES</option><option value="DÓLARES">DÓLARES</option>
            </SelectInput>
          )}
        </Field>
        <Field label="Cliente *" wide>
          {p => (
            <>
              <TextInput {...p} list="os-clientes" value={f.cliente} onChange={e => set({ cliente: e.target.value })} placeholder="Nombre del cliente" />
              <datalist id="os-clientes">
                {(clientes.data ?? []).map((c, i) => { const n = c.nombre ?? c.razon_social ?? ''; return n ? <option key={i} value={n} /> : null; })}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Tipo de servicio">
          {p => (
            <SelectInput {...p} value={f.tipo_servicio} onChange={e => set({ tipo_servicio: e.target.value })}>
              <option value="TRANSPORTE NACIONAL">Nacional</option><option value="TRANSPORTE LOCAL">Local</option>
            </SelectInput>
          )}
        </Field>
        <Field label="Tipo de viaje">
          {p => (
            <SelectInput {...p} value={f.es_retorno} onChange={e => set({ es_retorno: e.target.value })}>
              <option value="0">Servicio de ida</option><option value="1">Servicio de retorno</option>
            </SelectInput>
          )}
        </Field>
        <Field label="Modalidad">
          {p => (
            <SelectInput {...p} value={f.modalidad} onChange={e => set({ modalidad: e.target.value })}>
              <option value="PROPIO">Flota propia</option><option value="TERCERIZADO">Flota tercerizada</option>
            </SelectInput>
          )}
        </Field>
        {f.modalidad === 'TERCERIZADO' && (
          <>
            <Field label="Proveedor tercero">{p => <TextInput {...p} value={f.proveedor} onChange={e => set({ proveedor: e.target.value })} />}</Field>
            <Field label="RUC del proveedor">{p => <TextInput {...p} value={f.proveedor_ruc} onChange={e => set({ proveedor_ruc: e.target.value })} />}</Field>
          </>
        )}
        <Field label="Costo del flete">{p => <TextInput {...p} inputMode="decimal" value={f.costo_flete} onChange={e => set({ costo_flete: e.target.value })} />}</Field>
        <Field label="Tipo de costo">
          {p => (
            <SelectInput {...p} value={f.tipo_costo} onChange={e => set({ tipo_costo: e.target.value })}>
              <option value="COSTO TARIFA">Costo tarifa</option><option value="TARIFA EXPRESS">Tarifa express</option>
            </SelectInput>
          )}
        </Field>
        <Field label="Impuesto">
          {p => (
            <SelectInput {...p} value={f.impuesto} onChange={e => set({ impuesto: e.target.value })}>
              <option value="INCLUYE IGV">Incluye IGV</option><option value="MÁS IGV">Más IGV</option><option value="NO APLICA">No aplica</option>
            </SelectInput>
          )}
        </Field>
        <Field label="Viaje asignado">{p => <TextInput {...p} value={f.viaje} onChange={e => set({ viaje: e.target.value.toUpperCase() })} />}</Field>
        <Field label="Placa tracto">{p => <TextInput {...p} value={f.tracto} onChange={e => set({ tracto: e.target.value.toUpperCase() })} />}</Field>
        <Field label="Placa carreta">{p => <TextInput {...p} value={f.carreta} onChange={e => set({ carreta: e.target.value.toUpperCase() })} />}</Field>
        <Field label="Puntos de carga">{p => <TextInput {...p} inputMode="numeric" value={f.puntos_carga} onChange={e => set({ puntos_carga: e.target.value })} />}</Field>
        <Field label="Puntos de destino">{p => <TextInput {...p} inputMode="numeric" value={f.puntos_destino} onChange={e => set({ puntos_destino: e.target.value })} />}</Field>
        <Field label="Destinatario" wide>{p => <TextInput {...p} value={f.destinatario} onChange={e => set({ destinatario: e.target.value })} />}</Field>
        <Field label="Observaciones" wide>{p => <TextInput {...p} value={f.observaciones} onChange={e => set({ observaciones: e.target.value })} />}</Field>

        {/* Rutas */}
        <div className="field field--wide tarjeta__lista" style={{ padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.875rem' }}>Rutas</strong>
            <Button variant="secondary" icon={<Plus size={15} />} onClick={() => set({ rutas: [...f.rutas, { ruta: '', distancia_km: '', galones: '' }] })}>Ruta</Button>
          </div>
          <datalist id="os-rutas-matriz">
            {[...rutasMatriz.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ruta, km]) => (
              <option key={ruta} value={ruta} label={km > 0 ? ruta + ' (' + km.toLocaleString('es-PE') + ' Km)' : ruta} />
            ))}
          </datalist>
          {f.rutas.length === 0 && <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>Sin rutas. Agrega la ruta, km y galones estimados.</div>}
          {f.rutas.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px auto', gap: 'var(--s-2)', alignItems: 'center' }}>
              <TextInput list="os-rutas-matriz" value={r.ruta} placeholder="Ruta (elige de la matriz o escribe)" onChange={e => cambiarRuta(i, e.target.value)} />
              <TextInput inputMode="decimal" placeholder="Km" value={r.distancia_km} onChange={e => set({ rutas: f.rutas.map((x, j) => (j === i ? { ...x, distancia_km: e.target.value } : x)) })} />
              <TextInput inputMode="decimal" placeholder="Galones" value={r.galones} onChange={e => set({ rutas: f.rutas.map((x, j) => (j === i ? { ...x, galones: e.target.value } : x)) })} />
              <Button variant="secondary" icon={<Trash2 size={15} />} onClick={() => set({ rutas: f.rutas.filter((_, j) => j !== i) })}>{''}</Button>
            </div>
          ))}
        </div>

        {/* Guías (GRE) */}
        <div className="field field--wide tarjeta__lista" style={{ padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.875rem' }}>Guías de remisión ({f.docs.length})</strong>
            <Button variant="secondary" icon={<Plus size={15} />} onClick={() => setBuscarGre(v => !v)}>{buscarGre ? 'Cerrar' : 'Agregar guía'}</Button>
          </div>
          {f.docs.map((d, i) => (
            <div key={`${d.numero_documento}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '0.8125rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{d.numero_documento}</span>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.remitente} → {d.destinatario}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{num(d.peso).toLocaleString('es-PE')} kg</span>
              <Button variant="secondary" icon={<Trash2 size={15} />} onClick={() => set({ docs: f.docs.filter((_, j) => j !== i) })}>{''}</Button>
            </div>
          ))}
          {buscarGre && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', borderTop: '1px solid var(--separator)', paddingTop: 'var(--s-2)' }}>
              <SearchField value={filtroGre} onChange={setFiltroGre} placeholder="Número, remitente, destinatario o placa…" />
              {gres.isLoading && <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>Cargando guías…</div>}
              {!gres.isLoading && disponibles.length === 0 && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>No hay guías disponibles sin servicio.</div>
              )}
              {disponibles.slice(0, 30).map(g => (
                <button key={g.id} type="button" onClick={() => adjuntarGre(g)}
                  style={{ textAlign: 'left', display: 'flex', gap: 'var(--s-2)', alignItems: 'center', padding: '6px 8px', borderRadius: 'var(--radius-1)', background: 'var(--fill-2)', border: 'none', cursor: 'pointer', fontSize: '0.8125rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{g.numero_guia}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.remitente_razon_social} → {g.destinatario_razon_social}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Agregar</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
