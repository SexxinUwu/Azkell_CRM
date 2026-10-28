import { useEffect, useState, type CSSProperties } from 'react';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { MultiSelect } from '../../core/ui/MultiSelect';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { guardarArticulo, useAlmacenesLista, useTipoCambioSunat, type ArticuloInv, type ArticuloNuevo } from './api';
import { InventarioImagen } from './InventarioImagen';
import { NuevaOpcionSheet } from './NuevaOpcionSheet';

interface Props {
  open: boolean;
  articulo: ArticuloInv | null;
  onClose: () => void;
  onGuardado: (id?: string) => void;
}

interface Unidad { nombre: string; descripcion: string | null }
interface Nombrado { nombre: string }
interface DatosLlanta { medida: string | null; modelo: string | null; cocada_inicial: number | null }

// Mismas listas que el formulario clásico (tipos, subtipos y estados)
const TIPOS = ['Original', 'Alternativo', 'Servicio'];
const SUB_TIPOS = ['Nuevo', 'Reparado'];
const ESTADOS = ['Activo', 'Inactivo', 'Descontinuado'];
// Familia de las llantas: pide medida, modelo y cocada, y oculta lo que no aplica
const FAMILIA_LLANTA = 'NEUMATICOS';

function useCatalogo<T>(clave: string, ruta: string) {
  return useQuery<T[]>({
    queryKey: ['almacen', 'catalogo', clave],
    queryFn: () => api<T[]>(ruta).then(r => (Array.isArray(r) ? r : [])),
    staleTime: 5 * 60_000,
  });
}

/** Opciones de una lista. Si el valor guardado no está en la lista, se agrega para no perderlo. */
function opciones(lista: string[], actual: string): string[] {
  return actual && !lista.includes(actual) ? [actual, ...lista] : lista;
}

/** Lista guardada como JSON (marca_unidad) */
function leerLista(texto: string | null): string[] {
  try {
    const v = JSON.parse(texto || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

const grilla = (columnas: string): CSSProperties => ({
  display: 'grid', gridTemplateColumns: columnas, gap: 'var(--s-3)',
});

export function InventarioFormulario({ open, articulo: a, onClose, onGuardado }: Props) {
  const toast = useToast();
  const almacenesQ = useAlmacenesLista();
  const unidadesQ = useCatalogo<Unidad>('unidades', '/almacen/unidades');
  const marcasQ = useCatalogo<Nombrado>('marcas', '/almacen/marcas');
  const familiasQ = useCatalogo<Nombrado>('familias', '/almacen/familias');
  const marcasPlacasQ = useCatalogo<string>('marcas-placas', '/almacen/marcas-placas');
  const configQ = useQuery<Record<string, string>>({
    queryKey: ['almacen', 'configuracion'],
    queryFn: () => api<Record<string, string>>('/almacen/configuracion'),
    staleTime: 5 * 60_000,
  });

  const [guardando, setGuardando] = useState(false);
  const [articulo, setArticulo] = useState('');
  const [codigoArticulo, setCodigoArticulo] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [marca, setMarca] = useState('');
  const [marcasUnidad, setMarcasUnidad] = useState<string[]>([]);
  const [familia, setFamilia] = useState('');
  const [tipo, setTipo] = useState('');
  const [subTipo, setSubTipo] = useState('');
  const [almacen, setAlmacen] = useState('');
  const [anaquel, setAnaquel] = useState('');
  const [unidad, setUnidad] = useState('Unidades');
  const [stockMin, setStockMin] = useState('0');
  const [stockMax, setStockMax] = useState('0');
  const [cantidadInicial, setCantidadInicial] = useState('0');
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [costoRef, setCostoRef] = useState('0');
  const [tipoCambio, setTipoCambio] = useState('');
  const [estado, setEstado] = useState('Activo');
  const [observaciones, setObservaciones] = useState('');
  // Sin campo en el formulario (igual que el clásico): se conservan al editar
  const [sistema, setSistema] = useState('');
  const [subSistema, setSubSistema] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  // Datos de la llanta (tabla neumaticos_articulo)
  const [medida, setMedida] = useState('');
  const [modeloLlanta, setModeloLlanta] = useState('');
  const [cocada, setCocada] = useState('');
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [nuevaOpcion, setNuevaOpcion] = useState<'marca' | 'familia' | null>(null);

  const llanta = familia.trim().toUpperCase() === FAMILIA_LLANTA;
  const tcPorDefecto = Number(configQ.data?.tipo_cambio) || 3.7;
  // En dólares, el tipo de cambio es el de la SUNAT del día (se llena solo; la persona lo puede cambiar)
  const sunat = useTipoCambioSunat(open && moneda === 'USD' && !a);
  useEffect(() => {
    if (moneda === 'USD' && !a && sunat.data?.venta) setTipoCambio(String(sunat.data.venta));
  }, [moneda, sunat.data, a]);

  useEffect(() => {
    if (!open) return;
    setImagenUrl(a?.imagen_url ?? null);
    if (a) {
      setArticulo(a.articulo ?? '');
      setCodigoArticulo(a.codigo_articulo ?? '');
      setCodigoBarras(a.codigo_barras ?? '');
      setMarca(a.marca ?? '');
      setMarcasUnidad(leerLista(a.marca_unidad));
      setFamilia(a.familia ?? '');
      setTipo(a.tipo ?? '');
      setSubTipo(a.sub_tipo ?? '');
      setAlmacen(a.almacen ?? '');
      setAnaquel(a.anaquel ?? '');
      setUnidad(a.unidad ?? 'Unidades');
      setStockMin(String(a.stock_min ?? 0));
      setStockMax(String(a.stock_max ?? 0));
      setCantidadInicial('0');
      setMoneda((a.moneda as 'PEN' | 'USD') ?? 'PEN');
      setCostoRef(String(a.costo_referencial ?? 0));
      setTipoCambio(a.tipo_cambio != null ? String(a.tipo_cambio) : '');
      setEstado(a.estado_art ?? 'Activo');
      setObservaciones(a.observaciones ?? '');
      setSistema(a.sistema ?? '');
      setSubSistema(a.sub_sistema ?? '');
      setUbicacion(a.ubicacion ?? '');
    } else {
      // Alta nueva: la familia viene en NEUMATICOS, como en el clásico
      setArticulo(''); setCodigoArticulo(''); setCodigoBarras(''); setMarca(''); setMarcasUnidad([]);
      setFamilia(FAMILIA_LLANTA); setTipo(''); setSubTipo(''); setAlmacen(''); setAnaquel('');
      setUnidad('Unidades'); setStockMin('0'); setStockMax('0'); setCantidadInicial('0');
      setMoneda('PEN'); setCostoRef('0'); setTipoCambio(''); setEstado('Activo'); setObservaciones('');
      setSistema(''); setSubSistema(''); setUbicacion('');
    }
  }, [open, a]);

  useEffect(() => {
    if (!open) return;
    if (!a?.id) { setMedida(''); setModeloLlanta(''); setCocada(''); return; }
    api<{ ok?: boolean; data?: DatosLlanta | null }>('/almacen/neumaticos-articulo/' + encodeURIComponent(String(a.id)))
      .then(r => {
        const d = r.data;
        setMedida(d?.medida ?? '');
        setModeloLlanta(d?.modelo ?? '');
        setCocada(d?.cocada_inicial == null ? '' : String(d.cocada_inicial));
      })
      .catch(() => {});
  }, [open, a?.id]);

  // Unidad: el clásico guarda la descripción (Kilogramos), aunque en la BD esté el código (KG)
  const unidades = unidadesQ.data ?? [];
  const unidadActual = unidades.find(u => u.nombre === unidad || u.descripcion === unidad);
  const unidadValor = unidadActual ? (unidadActual.descripcion || unidadActual.nombre) : unidad;
  const marcasOpc = [...new Set((marcasPlacasQ.data ?? []).map(m => String(m).trim().toUpperCase()).filter(Boolean))].sort();

  const marcasU = marcasUnidad.join(', ');
  const nombreGenerado = llanta
    ? [marca, modeloLlanta, medida].map(v => v.trim()).filter(Boolean).join(' ')
    : `${articulo.trim()}${codigoArticulo.trim() ? ' ' + codigoArticulo.trim() : ''}${marcasU ? ' - ' + marcasU : ''}${marca ? ' / ' + marca : ''}`.trim();

  async function guardar() {
    if (!articulo.trim()) { toast('Ingresa el nombre del artículo', 'error'); return; }
    setGuardando(true);
    try {
      const body = {
        articulo: articulo.trim(),
        codigo_articulo: codigoArticulo.trim() || null,
        codigo_barras: codigoBarras.trim() || null,
        familia: familia.trim() || null,
        marca: marca || null,
        marca_unidad: JSON.stringify(marcasUnidad),
        tipo: llanta && !a ? 'Original' : (tipo || null),
        sub_tipo: subTipo || null,
        almacen: almacen || null,
        ubicacion: ubicacion || null,
        anaquel: anaquel.trim() || null,
        unidad: llanta ? 'Unidades' : (unidadValor || null),
        stock_min: parseFloat(stockMin) || 0,
        stock_max: parseFloat(stockMax) || 0,
        moneda,
        costo_referencial: parseFloat(costoRef) || 0,
        tipo_cambio: moneda === 'USD' ? (parseFloat(tipoCambio) || tcPorDefecto) : null,
        estado_art: llanta && !a ? 'Activo' : estado,
        observaciones: observaciones.trim() || null,
        sistema: sistema || null,
        sub_sistema: subSistema || null,
        cantidad_inicial: !a ? (parseFloat(cantidadInicial) || 0) : undefined,
        medida: llanta ? medida : undefined,
        modelo: llanta ? modeloLlanta : undefined,
      } as Partial<ArticuloNuevo>;

      const res = await guardarArticulo(body, a?.id) as { id?: string } | undefined;
      const idArticulo = res?.id ?? a?.id;
      if (llanta && idArticulo) {
        try {
          await api('/almacen/neumaticos-articulo/' + encodeURIComponent(String(idArticulo)), {
            method: 'PUT',
            body: { medida, modelo: modeloLlanta, cocada_inicial: cocada === '' ? null : Number(cocada) },
          });
        } catch {
          toast('El artículo se guardó, pero no los datos de la llanta', 'error');
        }
      }
      toast(a ? 'Artículo actualizado' : 'Artículo creado');
      onGuardado(res?.id);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
    <Sheet open={open} onClose={onClose} title={a ? 'Editar artículo' : 'Nuevo artículo'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--label-2)' }}>
          Nombre generado: <strong>{nombreGenerado || '—'}</strong>
        </p>

        <Field label="Código de barras">
          {p => <TextInput {...p} value={codigoBarras} placeholder="EAN-13 / QR..." onChange={e => setCodigoBarras(e.target.value)} />}
        </Field>
        <Field label="Artículo *">
          {p => <TextInput {...p} value={articulo} placeholder="Ej: Filtro de aceite" onChange={e => setArticulo(e.target.value)} />}
        </Field>
        <Field label="Código interno">
          {p => <TextInput {...p} value={codigoArticulo} placeholder="Ej: LF3000" onChange={e => setCodigoArticulo(e.target.value)} />}
        </Field>
        <Field label="Marca">
          {p => (
            <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
              <SelectInput {...p} value={marca} onChange={e => setMarca(e.target.value)} style={{ flex: 1 }}>
                <option value="">— Sin marca —</option>
                {opciones((marcasQ.data ?? []).map(m => m.nombre), marca).map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput>
              <Button variant="secondary" iconOnly icon={<Plus size={16} />} aria-label="Nueva marca" onClick={() => setNuevaOpcion('marca')} />
            </div>
          )}
        </Field>
        <Field label="Familia">
          {p => (
            <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
              <SelectInput {...p} value={familia} onChange={e => setFamilia(e.target.value)} style={{ flex: 1 }}>
                <option value="">— Sin familia —</option>
                {opciones((familiasQ.data ?? []).map(f => f.nombre), familia).map(f => <option key={f} value={f}>{f}</option>)}
              </SelectInput>
              <Button variant="secondary" iconOnly icon={<Plus size={16} />} aria-label="Nueva familia" onClick={() => setNuevaOpcion('familia')} />
            </div>
          )}
        </Field>

        {llanta && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--label-2)' }}>
              Datos de la llanta: se usan al recepcionar para crear cada neumático.
            </p>
            <Field label="Medida">
              {p => <TextInput {...p} value={medida} placeholder="Ej: 295/80R22.5" onChange={e => setMedida(e.target.value)} />}
            </Field>
            <Field label="Modelo">
              {p => <TextInput {...p} value={modeloLlanta} placeholder="Ej: S200" onChange={e => setModeloLlanta(e.target.value)} />}
            </Field>
            <Field label="Cocada inicial (mm)">
              {p => <TextInput {...p} type="number" min={0} value={cocada} placeholder="Ej: 20" onChange={e => setCocada(e.target.value)} />}
            </Field>
          </div>
        )}

        {!llanta && (
          <div style={grilla('1fr 1fr')}>
            <Field label="Tipo">
              {p => (
                <SelectInput {...p} value={tipo} onChange={e => setTipo(e.target.value)}>
                  <option value="">— Sin tipo —</option>
                  {opciones(TIPOS, tipo).map(t => <option key={t} value={t}>{t}</option>)}
                </SelectInput>
              )}
            </Field>
            <Field label="Sub-tipo">
              {p => (
                <SelectInput {...p} value={subTipo} onChange={e => setSubTipo(e.target.value)}>
                  <option value="">— Sin sub-tipo —</option>
                  {opciones(SUB_TIPOS, subTipo).map(t => <option key={t} value={t}>{t}</option>)}
                </SelectInput>
              )}
            </Field>
          </div>
        )}

        <Field label="Almacén">
          {p => (
            <SelectInput {...p} value={almacen} onChange={e => setAlmacen(e.target.value)}>
              <option value="">— Sin almacén —</option>
              {opciones((almacenesQ.data ?? []).map(al => al.nombre), almacen).map(al => <option key={al} value={al}>{al}</option>)}
            </SelectInput>
          )}
        </Field>

        {!llanta && (
          <>
            <Field label="Anaquel">
              {p => <TextInput {...p} value={anaquel} placeholder="Ej: 6-4, A-2, etc." onChange={e => setAnaquel(e.target.value)} />}
            </Field>
            <div style={grilla('1fr 1fr 1fr')}>
              <Field label="Unidad">
                {p => (
                  <SelectInput {...p} value={unidadValor} onChange={e => setUnidad(e.target.value)}>
                    <option value="">— Sin unidad —</option>
                    {opciones(unidades.map(u => u.descripcion || u.nombre), unidadValor).map(u => <option key={u} value={u}>{u}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label="Mín.">
                {p => <TextInput {...p} type="number" min={0} step="0.0001" value={stockMin} onChange={e => setStockMin(e.target.value)} />}
              </Field>
              <Field label="Máx.">
                {p => <TextInput {...p} type="number" min={0} step="0.0001" value={stockMax} onChange={e => setStockMax(e.target.value)} />}
              </Field>
            </div>
          </>
        )}

        {!a && (
          <Field label="Stock inicial / cantidad (conteo con el que ingresa)">
            {p => <TextInput {...p} type="number" min={0} step="0.0001" value={cantidadInicial} placeholder="Ej: 10" onChange={e => setCantidadInicial(e.target.value)} />}
          </Field>
        )}

        <div style={grilla('1fr 1fr')}>
          <Field label="Costo">
            {p => <TextInput {...p} type="number" min={0} step="0.0001" value={costoRef} placeholder="0.00" onChange={e => setCostoRef(e.target.value)} />}
          </Field>
          <Field label="Moneda">
            {p => (
              <SelectInput {...p} value={moneda} onChange={e => setMoneda(e.target.value as 'PEN' | 'USD')}>
                <option value="PEN">PEN (S/)</option>
                <option value="USD">USD ($)</option>
              </SelectInput>
            )}
          </Field>
        </div>
        {moneda === 'USD' && (
          <Field label="T/C USD → S/" hint={sunat.data?.venta ? `SUNAT venta del ${sunat.data.fecha}` : sunat.isError ? 'SUNAT no respondió: escribe el tipo de cambio' : sunat.isFetching ? 'Consultando el tipo de cambio SUNAT…' : undefined}>
            {p => <TextInput {...p} type="number" min={0.01} step="0.0001" value={tipoCambio} placeholder={String(tcPorDefecto)} onChange={e => setTipoCambio(e.target.value)} />}
          </Field>
        )}

        {!llanta && (
          <Field label="Estado">
            {p => (
              <SelectInput {...p} value={estado} onChange={e => setEstado(e.target.value)}>
                {opciones(ESTADOS, estado).map(s => <option key={s} value={s}>{s}</option>)}
              </SelectInput>
            )}
          </Field>
        )}

        {!llanta && (
          <Field label="Observaciones">
            {p => <TextInput {...p} value={observaciones} placeholder="Notas adicionales..." onChange={e => setObservaciones(e.target.value)} />}
          </Field>
        )}

        <Field label="Unidades compatibles">
          {() => (
            <MultiSelect
              label="Unidades compatibles"
              value={marcasUnidad}
              onChange={setMarcasUnidad}
              options={[...marcasOpc, ...marcasUnidad.filter(m => !marcasOpc.includes(m))]}
              placeholder="Ninguna"
            />
          )}
        </Field>

        <Field label="Foto y código QR">
          {() => <InventarioImagen articuloId={a?.id} imagenUrl={imagenUrl} onCambio={setImagenUrl} />}
        </Field>

        <Button variant="primary" loading={guardando} onClick={guardar} style={{ width: '100%' }}>
          {a ? 'Guardar cambios' : 'Crear artículo'}
        </Button>
      </div>
    </Sheet>
      <NuevaOpcionSheet
        open={nuevaOpcion !== null}
        tipo={nuevaOpcion ?? 'marca'}
        onClose={() => setNuevaOpcion(null)}
        onCreado={nombre => (nuevaOpcion === 'familia' ? setFamilia(nombre) : setMarca(nombre))}
      />
    </>
  );
}
