import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Download, FileSpreadsheet, Gavel, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { Badge, EmptyState, Notice } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { MenuFila } from '../../core/ui/MenuFila';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import {
  GRAVEDAD_TXT, RAIZ_PAPELETAS, borrarEntidad, borrarInfraccion, guardarEntidad, guardarInfraccion, guardarUit, importarInfracciones, useCatalogosPap,
  type EntidadPap, type Gravedad, type InfraccionPap,
} from './pap-api';
import { descargarPlantillaInfracciones, leerExcelInfracciones } from './pap-excel';

const COL_ENT: ColumnaTabla[] = [
  { id: 'cod', titulo: 'Código', ancho: 120 }, { id: 'nom', titulo: 'Entidad', ancho: 380 }, { id: 'amb', titulo: 'Ámbito', ancho: 150 },
  { id: 'dd', titulo: 'Días de descargo', ancho: 130, alinear: 'right' }, { id: 'dc', titulo: 'Días de descuento', ancho: 140, alinear: 'right' },
  { id: 'pc', titulo: '% descuento', ancho: 110, alinear: 'right' }, { id: 'dp', titulo: 'Días de pago', ancho: 120, alinear: 'right' },
  { id: 'act', titulo: 'Estado', ancho: 100, alinear: 'center' }, { id: 'acc', titulo: '', ancho: 64, minimo: 56, alinear: 'center' },
];
const COL_INF: ColumnaTabla[] = [
  { id: 'ent', titulo: 'Entidad', ancho: 120 }, { id: 'cod', titulo: 'Código', ancho: 110 }, { id: 'des', titulo: 'Descripción', ancho: 420 },
  { id: 'gra', titulo: 'Gravedad', ancho: 110, alinear: 'center' }, { id: 'pun', titulo: 'Puntos', ancho: 90, alinear: 'right' }, { id: 'mul', titulo: 'Multa', ancho: 150, alinear: 'right' },
  { id: 'med', titulo: 'Medida', ancho: 200 }, { id: 'acc', titulo: '', ancho: 64, minimo: 56, alinear: 'center' },
];
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Catálogos del módulo: valor de la UIT, entidades con sus plazos habituales e infracciones (código, gravedad, puntos y multa) */
export function PapCatalogos({ puedeEditar }: { puedeEditar: boolean }) {
  const q = useCatalogosPap();
  const qc = useQueryClient();
  const toast = useToast();
  const entidades = q.data?.entidades ?? [];
  const infracciones = q.data?.infracciones ?? [];
  const refrescar = () => qc.invalidateQueries({ queryKey: RAIZ_PAPELETAS });

  // UIT
  const [uit, setUit] = useState<string | null>(null);
  const uitActual = uit ?? q.data?.config.uit_valor ?? '';
  async function salvarUit() {
    try { await guardarUit(Number(uitActual.replace(',', '.'))); haptic('success'); toast('Valor de la UIT guardado'); setUit(null); await refrescar(); }
    catch (e) { toast(errorMessage(e), 'error'); haptic('warning'); }
  }

  // Entidades
  const [entEdit, setEntEdit] = useState<EntidadPap | 'nueva' | null>(null);
  const [entBorrar, setEntBorrar] = useState<EntidadPap | null>(null);
  // Infracciones
  const [infEdit, setInfEdit] = useState<InfraccionPap | 'nueva' | null>(null);
  const [infBorrar, setInfBorrar] = useState<InfraccionPap | null>(null);
  const [filtroEnt, setFiltroEnt] = useState('');
  const [busca, setBusca] = useState('');
  const [vista, setVista] = useState<'entidades' | 'infracciones'>('infracciones');
  const archivo = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);

  const infVisibles = useMemo(() => {
    const t = busca.trim().toUpperCase();
    return infracciones.filter(i => (!filtroEnt || i.entidad_codigo === filtroEnt) && (!t || `${i.codigo} ${i.descripcion}`.toUpperCase().includes(t)));
  }, [infracciones, filtroEnt, busca]);

  async function subirInfracciones(f: File | undefined) {
    if (!f) return;
    setImportando(true);
    try {
      const filas = await leerExcelInfracciones(f);
      if (!filas.length) { toast('El Excel no tiene filas para importar.', 'error'); return; }
      const r = await importarInfracciones(filas);
      haptic('success');
      toast(`${r.nuevas} nuevas, ${r.actualizadas} actualizadas${r.errores.length ? ` y ${r.errores.length} con error (fila ${r.errores[0].fila}: ${r.errores[0].error})` : ''}`, r.errores.length ? 'error' : undefined);
      await refrescar();
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setImportando(false); if (archivo.current) archivo.current.value = ''; }
  }

  return (
    <div className="pap-cat">
      <div className="pap-uit">
        <div><strong>Valor de la UIT</strong><span>Sirve para convertir las multas en % de UIT a soles. Úsalo con el valor vigente del año.</span></div>
        <div className="pap-uit__campo">
          <span>S/</span>
          <TextInput inputMode="decimal" aria-label="Valor de la UIT" value={uitActual} placeholder="Ej. 5500" onChange={e => setUit(e.target.value)} disabled={!puedeEditar} />
          {puedeEditar && <Button variant="primary" size="sm" disabled={uit === null || !(Number(uitActual.replace(',', '.')) > 0)} onClick={() => { void salvarUit(); }}>Guardar</Button>}
        </div>
      </div>

      <div className="pap-cat__barra">
        <SegmentedControl label="Catálogo" value={vista} onChange={setVista} options={[{ value: 'infracciones', label: `Infracciones (${infracciones.length})` }, { value: 'entidades', label: `Entidades (${entidades.length})` }]} />
        {vista === 'infracciones' && (
          <>
            <div className="pap-cat__buscar"><SearchField value={busca} onChange={setBusca} placeholder="Código o descripción…" /></div>
            <div className="pap-cat__filtro">
              <Combobox value={filtroEnt || null} onChange={v => setFiltroEnt(v ?? '')} placeholder="Todas las entidades" options={entidades.map(e => ({ value: e.codigo, label: e.codigo, description: e.nombre }))} aria-label="Entidad" />
            </div>
          </>
        )}
        {puedeEditar && vista === 'infracciones' && (
          <span className="pap-cat__acciones">
            <MenuFila etiqueta="Excel de infracciones" acciones={[
              { label: 'Descargar plantilla', icon: <Download size={17} />, onSelect: () => { void descargarPlantillaInfracciones(); } },
              { label: 'Importar desde Excel', icon: <Upload size={17} />, onSelect: () => archivo.current?.click(), disabled: importando },
            ]} />
            <input ref={archivo} type="file" accept=".xlsx,.xls" hidden onChange={e => { void subirInfracciones(e.target.files?.[0]); }} />
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setInfEdit('nueva')}>Nueva infracción</Button>
          </span>
        )}
        {puedeEditar && vista === 'entidades' && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEntEdit('nueva')}>Nueva entidad</Button>}
      </div>

      {vista === 'entidades' ? (
        <TablaRedimensionable id="pap-entidades" columnas={COL_ENT} ariaLabel="Entidades" altoMax="60vh">
          {entidades.map(e => (
            <tr key={e.id}>
              <Celda mono><strong>{e.codigo}</strong></Celda><Celda>{e.nombre}</Celda><Celda>{e.ambito || '—'}</Celda>
              <Celda alinear="right">{e.dias_descargo ?? '—'}</Celda><Celda alinear="right">{e.dias_descuento ?? '—'}</Celda>
              <Celda alinear="right">{e.pct_descuento != null ? `${e.pct_descuento}%` : '—'}</Celda><Celda alinear="right">{e.dias_pago ?? '—'}</Celda>
              <Celda alinear="center">{e.activo ? <Badge tone="green">Activa</Badge> : <Badge>Inactiva</Badge>}</Celda>
              <Celda alinear="center">{puedeEditar && <MenuFila etiqueta={`Acciones de ${e.codigo}`} acciones={[
                { label: 'Editar', icon: <Pencil size={17} />, onSelect: () => setEntEdit(e) },
                { label: 'Eliminar', icon: <Trash2 size={17} />, onSelect: () => setEntBorrar(e), destructiva: true, separada: true },
              ]} />}</Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      ) : infVisibles.length === 0 ? (
        <EmptyState icon={<Gavel size={22} />} title={infracciones.length ? 'Ninguna infracción coincide' : 'El catálogo de infracciones está vacío'}>
          {infracciones.length ? 'Prueba con otro código o entidad.' : 'Carga las infracciones de cada entidad (código, descripción, gravedad, puntos y multa) con la plantilla de Excel o una por una. Así, al registrar una papeleta solo escribes el código.'}
        </EmptyState>
      ) : (
        <TablaRedimensionable id="pap-infracciones" columnas={COL_INF} ariaLabel="Infracciones" altoMax="58vh">
          {infVisibles.map(i => (
            <tr key={i.id}>
              <Celda>{i.entidad_codigo || 'Todas'}</Celda><Celda mono><strong>{i.codigo}</strong></Celda><Celda>{i.descripcion}</Celda>
              <Celda alinear="center">{i.gravedad ? <Badge tone={i.gravedad === 'LEVE' ? 'green' : i.gravedad === 'GRAVE' ? 'amber' : 'red'}>{GRAVEDAD_TXT[i.gravedad]}</Badge> : '—'}</Celda>
              <Celda alinear="right">{i.puntos ?? '—'}</Celda>
              <Celda alinear="right">{i.multa_soles ? formatSoles(i.multa_soles) : i.multa_uit ? `${i.multa_uit} UIT` : '—'}</Celda>
              <Celda>{i.medida || '—'}</Celda>
              <Celda alinear="center">{puedeEditar && <MenuFila etiqueta={`Acciones de ${i.codigo}`} acciones={[
                { label: 'Editar', icon: <Pencil size={17} />, onSelect: () => setInfEdit(i) },
                { label: 'Eliminar', icon: <Trash2 size={17} />, onSelect: () => setInfBorrar(i), destructiva: true, separada: true },
              ]} />}</Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      )}

      <FormEntidad valor={entEdit} onClose={() => setEntEdit(null)} onHecho={refrescar} />
      <FormInfraccion valor={infEdit} entidades={entidades} onClose={() => setInfEdit(null)} onHecho={refrescar} />
      <ConfirmSheet open={!!entBorrar} onClose={() => setEntBorrar(null)} title="Eliminar entidad" confirmLabel="Eliminar"
        message={`Se elimina ${entBorrar?.codigo ?? ''} del catálogo. Si ya tiene papeletas, no se podrá: desactívala en su lugar.`}
        onConfirm={async () => { if (!entBorrar) return; try { await borrarEntidad(entBorrar.id); toast('Entidad eliminada'); setEntBorrar(null); await refrescar(); } catch (e) { toast(errorMessage(e), 'error'); setEntBorrar(null); } }} />
      <ConfirmSheet open={!!infBorrar} onClose={() => setInfBorrar(null)} title="Eliminar infracción" confirmLabel="Eliminar"
        message={`Se elimina la infracción ${infBorrar?.codigo ?? ''} del catálogo. Las papeletas ya registradas conservan sus datos.`}
        onConfirm={async () => { if (!infBorrar) return; try { await borrarInfraccion(infBorrar.id); toast('Infracción eliminada'); setInfBorrar(null); await refrescar(); } catch (e) { toast(errorMessage(e), 'error'); setInfBorrar(null); } }} />
    </div>
  );
}

function FormEntidad({ valor, onClose, onHecho }: { valor: EntidadPap | 'nueva' | null; onClose: () => void; onHecho: () => unknown }) {
  const toast = useToast();
  const e = valor && valor !== 'nueva' ? valor : null;
  const [f, setF] = useState({ codigo: '', nombre: '', ambito: '', dias_descargo: '', dias_descuento: '', pct_descuento: '', dias_pago: '', activo: true });
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  const clave = valor ? (e ? `e${e.id}` : 'nueva') : null;
  if (clave && para !== clave) {
    setPara(clave); setError(null);
    setF({ codigo: e?.codigo ?? '', nombre: e?.nombre ?? '', ambito: e?.ambito ?? '', dias_descargo: e?.dias_descargo != null ? String(e.dias_descargo) : '', dias_descuento: e?.dias_descuento != null ? String(e.dias_descuento) : '',
      pct_descuento: e?.pct_descuento != null ? String(e.pct_descuento) : '', dias_pago: e?.dias_pago != null ? String(e.dias_pago) : '', activo: e ? !!e.activo : true });
  }
  if (!clave && para !== null) setPara(null);
  const campo = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));
  async function guardar() {
    setCargando(true); setError(null);
    try {
      await guardarEntidad(e?.id ?? null, { codigo: f.codigo, nombre: f.nombre, ambito: f.ambito || null, dias_descargo: numOrNull(f.dias_descargo), dias_descuento: numOrNull(f.dias_descuento),
        pct_descuento: numOrNull(f.pct_descuento), dias_pago: numOrNull(f.dias_pago), activo: f.activo ? 1 : 0 });
      haptic('success'); toast('Entidad guardada'); await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); } finally { setCargando(false); }
  }
  return (
    <Sheet open={!!valor} onClose={() => !cargando && onClose()} title={e ? `Editar ${e.codigo}` : 'Nueva entidad'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={cargando}>Cancelar</Button><Button variant="primary" icon={<Building2 size={16} />} loading={cargando} onClick={() => { void guardar(); }}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error">{error}</Notice></div>}
        <Field label="Código">{p => <TextInput {...p} value={f.codigo} onChange={ev => campo('codigo', ev.target.value.toUpperCase())} disabled={!!e} placeholder="Ej. SAT_CUSCO" />}</Field>
        <Field label="Ámbito">{p => <TextInput {...p} value={f.ambito} onChange={ev => campo('ambito', ev.target.value)} placeholder="Nacional, Lima, Local…" />}</Field>
        <Field label="Nombre" wide>{p => <TextInput {...p} value={f.nombre} onChange={ev => campo('nombre', ev.target.value)} />}</Field>
        <div className="field field--wide"><span className="pap-k">Plazos habituales (para calcular las fechas al registrar una papeleta; déjalos vacíos si no aplican)</span></div>
        <Field label="Días de descargo">{p => <TextInput {...p} inputMode="numeric" value={f.dias_descargo} onChange={ev => campo('dias_descargo', ev.target.value.replace(/\D/g, ''))} />}</Field>
        <Field label="Días de pago">{p => <TextInput {...p} inputMode="numeric" value={f.dias_pago} onChange={ev => campo('dias_pago', ev.target.value.replace(/\D/g, ''))} />}</Field>
        <Field label="Días para el descuento">{p => <TextInput {...p} inputMode="numeric" value={f.dias_descuento} onChange={ev => campo('dias_descuento', ev.target.value.replace(/\D/g, ''))} />}</Field>
        <Field label="% de descuento">{p => <TextInput {...p} inputMode="decimal" value={f.pct_descuento} onChange={ev => campo('pct_descuento', ev.target.value)} />}</Field>
        <Field label="Estado" wide>{() => <SegmentedControl label="Estado" block value={f.activo ? '1' : '0'} onChange={v => setF(p => ({ ...p, activo: v === '1' }))} options={[{ value: '1', label: 'Activa' }, { value: '0', label: 'Inactiva' }]} />}</Field>
      </div>
    </Sheet>
  );
}

function FormInfraccion({ valor, entidades, onClose, onHecho }: { valor: InfraccionPap | 'nueva' | null; entidades: EntidadPap[]; onClose: () => void; onHecho: () => unknown }) {
  const toast = useToast();
  const i = valor && valor !== 'nueva' ? valor : null;
  const [f, setF] = useState({ entidad_codigo: '', codigo: '', descripcion: '', gravedad: '' as Gravedad | '', puntos: '', multa_uit: '', multa_soles: '', medida: '' });
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  const clave = valor ? (i ? `i${i.id}` : 'nueva') : null;
  if (clave && para !== clave) {
    setPara(clave); setError(null);
    setF({ entidad_codigo: i?.entidad_codigo ?? '', codigo: i?.codigo ?? '', descripcion: i?.descripcion ?? '', gravedad: i?.gravedad ?? '', puntos: i?.puntos != null ? String(i.puntos) : '',
      multa_uit: i?.multa_uit != null ? String(i.multa_uit) : '', multa_soles: i?.multa_soles != null ? String(i.multa_soles) : '', medida: i?.medida ?? '' });
  }
  if (!clave && para !== null) setPara(null);
  const campo = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));
  async function guardar() {
    setCargando(true); setError(null);
    try {
      await guardarInfraccion(i?.id ?? null, { entidad_codigo: f.entidad_codigo, codigo: f.codigo, descripcion: f.descripcion, gravedad: f.gravedad || null, puntos: numOrNull(f.puntos),
        multa_uit: numOrNull(f.multa_uit), multa_soles: numOrNull(f.multa_soles), medida: f.medida || null });
      haptic('success'); toast('Infracción guardada'); await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); } finally { setCargando(false); }
  }
  return (
    <Sheet open={!!valor} onClose={() => !cargando && onClose()} title={i ? `Editar ${i.codigo}` : 'Nueva infracción'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={cargando}>Cancelar</Button><Button variant="primary" icon={<FileSpreadsheet size={16} />} loading={cargando} onClick={() => { void guardar(); }}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error">{error}</Notice></div>}
        <Field label="Entidad" hint="Vacío = vale para todas las entidades">
          {p => <Combobox {...p} value={f.entidad_codigo || null} onChange={v => campo('entidad_codigo', v ?? '')} placeholder="Todas" options={entidades.map(e => ({ value: e.codigo, label: e.codigo, description: e.nombre }))} />}
        </Field>
        <Field label="Código">{p => <TextInput {...p} value={f.codigo} onChange={ev => campo('codigo', ev.target.value.toUpperCase())} className="font-mono" />}</Field>
        <Field label="Descripción" wide>{p => <TextInput {...p} value={f.descripcion} onChange={ev => campo('descripcion', ev.target.value)} />}</Field>
        <Field label="Gravedad" wide>
          {() => <SegmentedControl<Gravedad | ''> label="Gravedad" block value={f.gravedad} onChange={v => setF(p => ({ ...p, gravedad: v }))}
            options={[{ value: '', label: 'Sin dato' }, { value: 'LEVE', label: 'Leve' }, { value: 'GRAVE', label: 'Grave' }, { value: 'MUY_GRAVE', label: 'Muy grave' }]} />}
        </Field>
        <Field label="Puntos en la licencia">{p => <TextInput {...p} inputMode="numeric" value={f.puntos} onChange={ev => campo('puntos', ev.target.value.replace(/\D/g, ''))} />}</Field>
        <Field label="Medida (retención, internamiento…)">{p => <TextInput {...p} value={f.medida} onChange={ev => campo('medida', ev.target.value)} />}</Field>
        <Field label="Multa (% de UIT)" hint="Ej. 0.5 = media UIT">{p => <TextInput {...p} inputMode="decimal" value={f.multa_uit} onChange={ev => campo('multa_uit', ev.target.value)} />}</Field>
        <Field label="Multa fija (S/)" hint="Si la entidad fija un monto en soles">{p => <TextInput {...p} inputMode="decimal" value={f.multa_soles} onChange={ev => campo('multa_soles', ev.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}
