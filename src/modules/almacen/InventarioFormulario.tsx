import { useEffect, useState } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { guardarArticulo, useInventario, type ArticuloInv, type ArticuloNuevo } from './api';
import { api } from '../../core/api/client';

interface Props {
  open: boolean;
  articulo: ArticuloInv | null;
  onClose: () => void;
  onGuardado: (id?: string) => void;
}

const TIPOS = ['Repuesto', 'Lubricante', 'Servicio', 'Herramienta', 'Material', 'Consumible'];
const UNIDADES = ['und', 'lt', 'gl', 'kg', 'ml', 'par', 'juego', 'm', 'm2', 'Servicio'];

export function InventarioFormulario({ open, articulo: a, onClose, onGuardado }: Props) {
  const toast = useToast();
  const { data: todos } = useInventario();
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState<'general' | 'clasificacion' | 'costos'>('general');

  const [articulo, setArticulo] = useState('');
  const [codigoArticulo, setCodigoArticulo] = useState('');
  const [tipo, setTipo] = useState('');
  const [subTipo, setSubTipo] = useState('');
  const [familia, setFamilia] = useState('');
  const [almacen, setAlmacen] = useState('');
  const [unidad, setUnidad] = useState('und');
  const [sistema, setSistema] = useState('');
  const [subSistema, setSubSistema] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [stockMin, setStockMin] = useState('0');
  const [stockMax, setStockMax] = useState('0');
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [costoRef, setCostoRef] = useState('0');
  const [tipoCambio, setTipoCambio] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [cantidadInicial, setCantidadInicial] = useState('0');
  // Datos de la llanta (familia NEUMATICOS): se usan al recepcionar para crear cada neumático
  const esLlanta = familia.trim().toUpperCase() === 'NEUMATICOS';
  const [medida, setMedida] = useState('');
  const [modeloLlanta, setModeloLlanta] = useState('');
  const [cocada, setCocada] = useState('');
  useEffect(() => {
    if (!open || !a?.id) return;
    api<{ ok?: boolean; data?: { medida: string | null; modelo: string | null; cocada_inicial: number | null } | null }>(
      '/almacen/neumaticos-articulo/' + encodeURIComponent(String(a.id)))
      .then(r => {
        const d = r.data;
        setMedida(d?.medida ?? '');
        setModeloLlanta(d?.modelo ?? '');
        setCocada(d?.cocada_inicial == null ? '' : String(d.cocada_inicial));
      })
      .catch(() => {});
  }, [open, a?.id]);

  const familias = [...new Set((todos ?? []).map(i => i.familia).filter(Boolean) as string[])].sort();
  const almacenes = [...new Set((todos ?? []).map(i => i.almacen).filter(Boolean) as string[])].sort();
  const sistemas = [...new Set((todos ?? []).map(i => i.sistema).filter(Boolean) as string[])].sort();

  useEffect(() => {
    if (!open) return;
    setTab('general');
    if (a) {
      setArticulo(a.articulo ?? '');
      setCodigoArticulo(a.codigo_articulo ?? '');
      setTipo(a.tipo ?? '');
      setSubTipo(a.sub_tipo ?? '');
      setFamilia(a.familia ?? '');
      setAlmacen(a.almacen ?? '');
      setUnidad(a.unidad ?? 'und');
      setSistema(a.sistema ?? '');
      setSubSistema(a.sub_sistema ?? '');
      setUbicacion(a.ubicacion ?? '');
      setStockMin(String(a.stock_min ?? 0));
      setStockMax(String(a.stock_max ?? 0));
      setMoneda((a.moneda as 'PEN' | 'USD') ?? 'PEN');
      setCostoRef(String(a.costo_referencial ?? 0));
      setTipoCambio(String(a.tipo_cambio ?? ''));
      setObservaciones(a.observaciones ?? '');
      setCantidadInicial('0');
    } else {
      setArticulo(''); setCodigoArticulo(''); setTipo(''); setSubTipo('');
      setFamilia(''); setAlmacen(''); setUnidad('und'); setSistema(''); setSubSistema('');
      setUbicacion(''); setStockMin('0'); setStockMax('0');
      setMoneda('PEN'); setCostoRef('0'); setTipoCambio(''); setObservaciones('');
      setCantidadInicial('0');
    }
  }, [open, a]);

  async function guardar() {
    if (!articulo.trim()) { toast('Ingresa el nombre del artículo', 'error'); setTab('general'); return; }
    setGuardando(true);
    try {
      const body: Partial<ArticuloNuevo> = {
        articulo: articulo.trim(),
        codigo_articulo: codigoArticulo || null,
        tipo: tipo || null,
        sub_tipo: subTipo || null,
        familia: familia || null,
        almacen: almacen || null,
        unidad: unidad || null,
        sistema: sistema || null,
        sub_sistema: subSistema || null,
        ubicacion: ubicacion || null,
        stock_min: parseFloat(stockMin) || 0,
        stock_max: parseFloat(stockMax) || 0,
        moneda,
        costo_referencial: parseFloat(costoRef) || 0,
        tipo_cambio: tipoCambio ? parseFloat(tipoCambio) : null,
        observaciones: observaciones || null,
        cantidad_inicial: !a ? (parseFloat(cantidadInicial) || 0) : undefined,
      } as Partial<ArticuloNuevo>;

      const res = await guardarArticulo(body, a?.id) as { id?: string } | undefined;
      const idArticulo = a?.id ?? res?.id;
      if (esLlanta && idArticulo) {
        await api('/almacen/neumaticos-articulo/' + encodeURIComponent(String(idArticulo)), {
          method: 'PUT',
          body: { medida, modelo: modeloLlanta, cocada_inicial: cocada === '' ? null : Number(cocada) },
        });
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
    <Sheet open={open} onClose={onClose} title={a ? 'Editar artículo' : 'Nuevo artículo'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
        <SegmentedControl<'general' | 'clasificacion' | 'costos'>
          block label="Sección" value={tab} onChange={setTab}
          options={[{ value: 'general', label: 'General' }, { value: 'clasificacion', label: 'Clasificación' }, { value: 'costos', label: 'Costos' }]}
        />

        {tab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <Field label="Nombre del artículo *">
              {p => <TextInput {...p} value={articulo} placeholder="Ej: Filtro de aceite" onChange={e => setArticulo(e.target.value)} />}
            </Field>
            <Field label="Código de artículo">
              {p => <TextInput {...p} value={codigoArticulo} placeholder="Ej: FERSA-FL456" onChange={e => setCodigoArticulo(e.target.value)} />}
            </Field>
            <Field label="Tipo">
              {p => (
                <SelectInput {...p} value={tipo} onChange={e => setTipo(e.target.value)}>
                  <option value="">Sin tipo</option>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </SelectInput>
              )}
            </Field>
            <Field label="Subtipo">
              {p => <TextInput {...p} value={subTipo} placeholder="Ej: Filtro de motor" onChange={e => setSubTipo(e.target.value)} />}
            </Field>
            <Field label="Unidad de medida">
              {p => (
                <SelectInput {...p} value={unidad} onChange={e => setUnidad(e.target.value)}>
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </SelectInput>
              )}
            </Field>
            {!a && (
              <Field label="Stock inicial">
                {p => <TextInput {...p} type="number" min={0} value={cantidadInicial} placeholder="0" onChange={e => setCantidadInicial(e.target.value)} />}
              </Field>
            )}
            {esLlanta && (
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
            <Field label="Observaciones">
              {p => <TextInput {...p} value={observaciones} placeholder="Notas adicionales" onChange={e => setObservaciones(e.target.value)} />}
            </Field>
          </div>
        )}

        {tab === 'clasificacion' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <Field label="Familia">
              {p => (
                <>
                  <TextInput {...p} value={familia} list="inv-familias" placeholder="Ej: Filtros" onChange={e => setFamilia(e.target.value)} />
                  <datalist id="inv-familias">{familias.map(f => <option key={f} value={f} />)}</datalist>
                </>
              )}
            </Field>
            <Field label="Sistema">
              {p => (
                <>
                  <TextInput {...p} value={sistema} list="inv-sistemas" placeholder="Ej: Motor" onChange={e => setSistema(e.target.value)} />
                  <datalist id="inv-sistemas">{sistemas.map(s => <option key={s} value={s} />)}</datalist>
                </>
              )}
            </Field>
            <Field label="Subsistema">
              {p => <TextInput {...p} value={subSistema} placeholder="Ej: Lubricación" onChange={e => setSubSistema(e.target.value)} />}
            </Field>
            <Field label="Almacén">
              {p => (
                <>
                  <TextInput {...p} value={almacen} list="inv-almacenes" placeholder="Ej: Almacén principal" onChange={e => setAlmacen(e.target.value)} />
                  <datalist id="inv-almacenes">{almacenes.map(al => <option key={al} value={al} />)}</datalist>
                </>
              )}
            </Field>
            <Field label="Ubicación / Zona">
              {p => <TextInput {...p} value={ubicacion} placeholder="Ej: Estante A-3" onChange={e => setUbicacion(e.target.value)} />}
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
              <Field label="Stock mínimo">
                {p => <TextInput {...p} type="number" min={0} value={stockMin} onChange={e => setStockMin(e.target.value)} />}
              </Field>
              <Field label="Stock máximo">
                {p => <TextInput {...p} type="number" min={0} value={stockMax} onChange={e => setStockMax(e.target.value)} />}
              </Field>
            </div>
          </div>
        )}

        {tab === 'costos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <Field label="Moneda">
              {p => (
                <SelectInput {...p} value={moneda} onChange={e => setMoneda(e.target.value as 'PEN' | 'USD')}>
                  <option value="PEN">S/ Soles</option>
                  <option value="USD">US$ Dólares</option>
                </SelectInput>
              )}
            </Field>
            <Field label={`Costo referencial (${moneda})`}>
              {p => <TextInput {...p} type="number" min={0} step="0.01" value={costoRef} onChange={e => setCostoRef(e.target.value)} />}
            </Field>
            {moneda === 'USD' && (
              <Field label="Tipo de cambio (S/)">
                {p => <TextInput {...p} type="number" min={0} step="0.001" value={tipoCambio} placeholder="3.750" onChange={e => setTipoCambio(e.target.value)} />}
              </Field>
            )}
          </div>
        )}

        <Button variant="primary" loading={guardando} onClick={guardar} style={{ width: '100%' }}>
          {a ? 'Guardar cambios' : 'Crear artículo'}
        </Button>
      </div>
    </Sheet>
  );
}
