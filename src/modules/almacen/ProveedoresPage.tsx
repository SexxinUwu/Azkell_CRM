import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, CircleAlert, Download, FileSpreadsheet, Mail, MessageCircle, Phone, Plus, SearchX, Star, Upload } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { exportarExcel } from '../../core/lib/excel';
import { initials } from '../../core/lib/format';
import { whatsapp } from '../conductores/api';
import './almacen.css';
import './proveedores.css';
import { eliminarProveedor, useProveedores, type ProveedorInv } from './api';
import { ProveedorFormulario } from './ProveedorFormulario';
import { ImportarProveedoresSheet, descargarPlantillaProveedores } from './ImportarProveedoresSheet';

// Tonos para las iniciales: la misma persona siempre tiene el mismo color
const TONOS = ['#f56300', '#0a84ff', '#30a46c', '#bf5af2', '#ff375f', '#5e5ce6', '#ac8e68', '#0fa3b1'];
const tono = (s: string) => TONOS[[...s].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONOS.length];
const nombreMostrado = (p: ProveedorInv) => p.razon_social?.trim() || p.nombre;
const letraDe = (s: string) => { const l = s.trim().charAt(0).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return /[A-Z]/.test(l) ? l : '#'; };

/** Motivo por el que un proveedor está por regularizar (null si está en regla): sin documento o con un RUC/DNI que no tiene 11 u 8 dígitos */
function motivoPendiente(p: ProveedorInv): string | null {
  const doc = (p.ruc ?? '').replace(/\s/g, '');
  if (!doc) return 'Sin RUC o DNI';
  if (!/^\d+$/.test(doc) || (doc.length !== 11 && doc.length !== 8)) return 'RUC o DNI incompleto';
  return null;
}

/** Un contacto sin nombre real (solo un número, o "Contacto general") es el teléfono de la empresa */
const esGenerico = (nombre: string) => /^[\d\s+()-]{6,}$/.test(nombre.trim()) || /^contacto general$/i.test(nombre.trim());

const COL_CONTACTOS: ColumnaTabla[] = [
  { id: 'contacto', titulo: 'Contacto', ancho: 240, minimo: 160 },
  { id: 'empresa', titulo: 'Empresa', ancho: 300, minimo: 160 },
  { id: 'cargo', titulo: 'Cargo / área', ancho: 140 },
  { id: 'telefono', titulo: 'Teléfono', ancho: 130 },
  { id: 'correo', titulo: 'Correo', ancho: 220 },
  { id: 'ruc', titulo: 'RUC / DNI', ancho: 120 },
  { id: 'acciones', titulo: '', ancho: 120, alinear: 'center' },
];
const COL_PROVEEDORES: ColumnaTabla[] = [
  { id: 'proveedor', titulo: 'Proveedor', ancho: 320, minimo: 180 },
  { id: 'ruc', titulo: 'RUC / DNI', ancho: 130 },
  { id: 'contactos', titulo: 'Contactos', ancho: 260, minimo: 140 },
  { id: 'telefono', titulo: 'Teléfono', ancho: 130 },
  { id: 'correo', titulo: 'Correo', ancho: 220 },
  { id: 'cuentas', titulo: 'Cuentas', ancho: 80, alinear: 'center' },
  { id: 'estado', titulo: 'Estado', ancho: 110, alinear: 'center' },
  { id: 'acciones', titulo: '', ancho: 120, alinear: 'center' },
];

type Vista = 'contactos' | 'proveedores';
const leerVista = (): Vista => { try { return localStorage.getItem('fleet_prov_vista') === 'proveedores' ? 'proveedores' : 'contactos'; } catch { return 'contactos'; } };

/** Una fila del directorio: un asesor (con su empresa) o, si la empresa no tiene contactos, la empresa misma */
interface Entrada { clave: string; nombre: string; sub: string; cargo: string | null; telefono: string | null; correo: string | null; empresa: boolean; proveedor: ProveedorInv }

export function ProveedoresPage() {
  const { data, isLoading, isError, error } = useProveedores();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const ancha = useMediaQuery('(min-width: 900px)');
  const [vista, setVista] = useState<Vista>(leerVista);
  const [busqueda, setBusqueda] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [seleccionado, setSeleccionado] = useState<ProveedorInv | null>(null);
  const [formulario, setFormulario] = useState<{ proveedor: ProveedorInv | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<ProveedorInv | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [importando, setImportando] = useState(false);

  const puedeCrear = can('prov_inv.crear');
  const puedeEditar = can('prov_inv.editar');
  const puedeEliminar = can('prov_inv.eliminar');

  const proveedores = data ?? [];
  const pendientes = useMemo(() => proveedores.filter(p => motivoPendiente(p)), [proveedores]);
  const totalContactos = proveedores.reduce((s, p) => s + p.contactos.length, 0);
  const cambiarVista = (v: Vista) => { setVista(v); try { localStorage.setItem('fleet_prov_vista', v); } catch { /* sin almacenamiento */ } };

  const q = busqueda.trim().toUpperCase();
  const coincide = (...textos: Array<string | null | undefined>) => !q || textos.some(t => (t ?? '').toUpperCase().includes(q));

  /** Directorio de contactos: un asesor por fila, ordenado por nombre */
  const entradas = useMemo<Entrada[]>(() => {
    const lista: Entrada[] = [];
    for (const p of proveedores) {
      const empresa = nombreMostrado(p);
      const subEmpresa = p.ruc ? `RUC ${p.ruc}` : 'Sin RUC';
      if (p.contactos.length === 0) {
        lista.push({ clave: `e${p.id}`, nombre: empresa, sub: subEmpresa, cargo: null, telefono: p.telefono, correo: p.correo, empresa: true, proveedor: p });
        continue;
      }
      for (const c of p.contactos) {
        const generico = esGenerico(c.nombre);
        const tel = c.telefono || (generico && /\d/.test(c.nombre) ? c.nombre : null);
        lista.push(generico
          ? { clave: `c${p.id}-${c.id ?? c.nombre}`, nombre: empresa, sub: subEmpresa, cargo: c.cargo, telefono: tel, correo: c.email, empresa: true, proveedor: p }
          : { clave: `c${p.id}-${c.id ?? c.nombre}`, nombre: c.nombre, sub: [empresa, c.cargo].filter(Boolean).join(' · '), cargo: c.cargo, telefono: tel, correo: c.email, empresa: false, proveedor: p });
      }
    }
    return lista.filter(e => coincide(e.nombre, e.sub, e.telefono, e.correo, e.proveedor.ruc)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedores, q]);

  const empresas = useMemo(() => (soloPendientes ? pendientes : proveedores)
    .filter(p => coincide(nombreMostrado(p), p.nombre, p.ruc, p.contactos.map(c => c.nombre).join(' '), p.telefono))
    .sort((a, b) => nombreMostrado(a).localeCompare(nombreMostrado(b), 'es')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [proveedores, pendientes, soloPendientes, q]);

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarProveedor(porEliminar.id);
      toast('Proveedor eliminado');
      haptic('success');
      if (seleccionado?.id === porEliminar.id) setSeleccionado(null);
      setPorEliminar(null);
      await qc.invalidateQueries({ queryKey: ['almacen', 'proveedores'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEliminando(false);
    }
  }

  // La ficha siempre muestra la versión más reciente del proveedor (después de editar)
  const fichaActual = seleccionado ? (proveedores.find(p => p.id === seleccionado.id) ?? seleccionado) : null;

  return (
    <Page>
      <PageHeader
        eyebrow="Almacén"
        title="Proveedores"
        subtitle={isLoading ? 'Cargando…' : `${proveedores.length} proveedores · ${totalContactos} contactos`}
        actions={
          <>
            <div className="acciones-iconos acciones-iconos--sinfondo" role="group" aria-label="Acciones de proveedores">
              <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--verde" data-tip="Exportar Excel"
                aria-label="Exportar Excel" icon={<FileSpreadsheet size={17} />}
                onClick={() => exportarExcel('Proveedores', 'Proveedores',
                  ['Proveedor', 'RUC', 'Contacto', 'Teléfono', 'Correo', 'Dirección', 'Banco', 'Cuenta', 'CCI', 'Moneda'],
                  empresas.map(p => [nombreMostrado(p), p.ruc, p.contactos.map(c => c.nombre).join(' / ') || p.contacto, p.telefono, p.correo, p.direccion, p.banco, p.cuenta, p.cci, p.moneda_pago]))
                  .catch(err => toast(errorMessage(err), 'error'))} />
              {puedeCrear && (
                <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--azul" data-tip="Importar Excel"
                  aria-label="Importar Excel" icon={<Upload size={17} />} onClick={() => setImportando(true)} />
              )}
              {puedeCrear && (
                <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--ambar" data-tip="Descargar plantilla"
                  aria-label="Descargar plantilla" icon={<Download size={17} />}
                  onClick={() => descargarPlantillaProveedores().catch(err => toast(errorMessage(err), 'error'))} />
              )}
            </div>
            {puedeCrear && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ proveedor: null })}>
                Nuevo proveedor
              </Button>
            )}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : proveedores.length === 0 ? (
        <EmptyState icon={<Building2 size={22} />} title="Sin proveedores registrados">
          {puedeCrear
            ? <>Registra el primer proveedor con <strong>Nuevo proveedor</strong>.</>
            : 'Cuando se registren proveedores, aparecerán aquí.'}
        </EmptyState>
      ) : (
        <>
          {pendientes.length > 0 && (
            <div className="pv-alerta" role="status">
              <span className="pv-alerta__icono" aria-hidden><CircleAlert size={20} /></span>
              <span className="pv-alerta__texto">
                <b>{pendientes.length} {pendientes.length === 1 ? 'proveedor por regularizar' : 'proveedores por regularizar'}</b>
                <small>Les falta el RUC o DNI (o está incompleto). Sin eso no se pueden emitir documentos ni evitar duplicados.</small>
              </span>
              <Button variant={soloPendientes ? 'secondary' : 'primary'} size="sm" onClick={() => { setSoloPendientes(v => !v); setBusqueda(''); }}>
                {soloPendientes ? 'Ver todos' : 'Ver cuáles'}
              </Button>
            </div>
          )}
          <div className="pv-barra">
            <SegmentedControl<Vista> label="Vista del directorio" value={soloPendientes ? 'proveedores' : vista} onChange={v => { setSoloPendientes(false); cambiarVista(v); }}
              options={[{ value: 'contactos', label: 'Contactos' }, { value: 'proveedores', label: 'Proveedores' }]} />
            <SearchField value={busqueda} onChange={setBusqueda} placeholder={vista === 'contactos' ? 'Asesor, empresa, RUC o teléfono' : 'Razón social, RUC o asesor'} />
          </div>

          {(vista === 'contactos' && !soloPendientes ? entradas.length : empresas.length) === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Nada coincide">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
            </EmptyState>
          ) : ancha ? (
            vista === 'contactos' && !soloPendientes ? (
              <TablaRedimensionable id="almacen-proveedores-contactos" columnas={COL_CONTACTOS} ariaLabel="Contactos de proveedores" altoMax="68vh">
                {entradas.map(e => (
                  <tr key={e.clave} className="pv-tr" onClick={() => { haptic('selection'); setSeleccionado(e.proveedor); }}>
                    <Celda><span className="pv-celda-nombre"><Avatar nombre={e.nombre} empresa={e.empresa} /><button type="button" className="oc-codigo">{e.nombre}</button></span></Celda>
                    <Celda>{e.empresa ? '—' : nombreMostrado(e.proveedor)}</Celda>
                    <Celda>{e.cargo || '—'}</Celda>
                    <Celda mono>{e.telefono || '—'}</Celda>
                    <Celda>{e.correo || '—'}</Celda>
                    <Celda mono>{e.proveedor.ruc || '—'}</Celda>
                    <Celda alinear="center"><Contactar nombre={e.nombre} telefono={e.telefono} correo={e.correo} /></Celda>
                  </tr>
                ))}
              </TablaRedimensionable>
            ) : (
              <TablaRedimensionable id="almacen-proveedores-empresas" columnas={COL_PROVEEDORES} ariaLabel="Proveedores" altoMax="68vh">
                {empresas.map(p => {
                  const motivo = motivoPendiente(p);
                  const nombres = p.contactos.map(c => c.nombre).filter(n => !esGenerico(n));
                  return (
                    <tr key={p.id} className="pv-tr" onClick={() => { haptic('selection'); setSeleccionado(p); }}>
                      <Celda><span className="pv-celda-nombre"><Avatar nombre={nombreMostrado(p)} empresa /><button type="button" className="oc-codigo">{nombreMostrado(p)}</button></span></Celda>
                      <Celda mono>{motivo ? <span className="pv-pendiente">{motivo}</span> : p.ruc}</Celda>
                      <Celda>{nombres.length ? <>{nombres[0]}{nombres.length > 1 && <span className="pv-contador" style={{ marginLeft: 6 }}>+{nombres.length - 1}</span>}</> : '—'}</Celda>
                      <Celda mono>{p.telefono || p.contactos.find(c => c.telefono)?.telefono || '—'}</Celda>
                      <Celda>{p.correo || p.contactos.find(c => c.email)?.email || '—'}</Celda>
                      <Celda alinear="center">{p.cuentas?.length || '—'}</Celda>
                      <Celda alinear="center">{p.estado ?? 'Activo'}</Celda>
                      <Celda alinear="center"><Contactar nombre={nombreMostrado(p)} telefono={p.telefono || p.contactos.find(c => c.telefono)?.telefono} correo={p.correo} /></Celda>
                    </tr>
                  );
                })}
              </TablaRedimensionable>
            )
          ) : vista === 'contactos' && !soloPendientes ? (
            <Letras items={entradas} letra={e => letraDe(e.nombre)} fila={e => (
              <FilaDirectorio key={e.clave} nombre={e.nombre} sub={e.sub} semilla={e.nombre} empresa={e.empresa}
                telefono={e.telefono} correo={e.correo} onAbrir={() => { haptic('selection'); setSeleccionado(e.proveedor); }} />
            )} />
          ) : (
            <Letras items={empresas} letra={p => letraDe(nombreMostrado(p))} fila={p => (
              <FilaDirectorio key={p.id} nombre={nombreMostrado(p)} semilla={nombreMostrado(p)} empresa
                sub={[soloPendientes ? motivoPendiente(p) : (p.ruc ? `RUC ${p.ruc}` : 'Sin RUC'), p.contactos.length ? `${p.contactos.length} ${p.contactos.length === 1 ? 'contacto' : 'contactos'}` : null].filter(Boolean).join(' · ')}
                onAbrir={() => { haptic('selection'); setSeleccionado(p); }} />
            )} />
          )}
        </>
      )}

      <FichaProveedor
        proveedor={fichaActual}
        onClose={() => setSeleccionado(null)}
        onEditar={puedeEditar && fichaActual ? () => setFormulario({ proveedor: fichaActual }) : undefined}
        onEliminar={puedeEliminar && fichaActual ? () => setPorEliminar(fichaActual) : undefined}
      />

      <ProveedorFormulario
        open={!!formulario}
        proveedor={formulario?.proveedor ?? null}
        onClose={() => setFormulario(null)}
        onGuardado={() => {
          setFormulario(null);
          qc.invalidateQueries({ queryKey: ['almacen', 'proveedores'] });
        }}
      />

      <ImportarProveedoresSheet open={importando} onClose={() => setImportando(false)} existentes={proveedores} />

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        title={`¿Eliminar proveedor "${porEliminar ? nombreMostrado(porEliminar) : ''}"?`}
        message="Se eliminará el proveedor y sus contactos del directorio. Los artículos asociados no se verán afectados."
        confirmLabel="Eliminar"
      />
    </Page>
  );
}

// ─── Tabla web ───────────────────────────────────────────────────────────────

function Avatar({ nombre, empresa }: { nombre: string; empresa: boolean }) {
  return (
    <span className={`pv-avatar pv-avatar--chico${empresa ? ' pv-avatar--empresa' : ''}`} aria-hidden style={{ background: `linear-gradient(145deg, ${tono(nombre)}, color-mix(in srgb, ${tono(nombre)} 70%, #000))` }}>
      {empresa ? <Building2 size={14} /> : initials(nombre)}
    </span>
  );
}

/** Llamar, WhatsApp y correo sin abrir la ficha */
function Contactar({ nombre, telefono, correo }: { nombre: string; telefono?: string | null; correo?: string | null }) {
  const tel = (telefono ?? '').trim(); const wa = whatsapp(tel);
  if (!tel && !correo) return <span style={{ color: 'var(--label-3)' }}>—</span>;
  return (
    <span className="pv-fila__acciones" onClick={e => e.stopPropagation()}>
      {tel && <a className="pv-accion pv-accion--chica" href={`tel:${tel.replace(/\s/g, '')}`} aria-label={`Llamar a ${nombre}`}><Phone size={14} /></a>}
      {wa && <a className="pv-accion pv-accion--chica pv-accion--wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${nombre}`}><MessageCircle size={14} /></a>}
      {correo && <a className="pv-accion pv-accion--chica pv-accion--mail" href={`mailto:${correo}`} aria-label={`Escribir a ${nombre}`}><Mail size={14} /></a>}
    </span>
  );
}

// ─── Lista por letras ────────────────────────────────────────────────────────

function Letras<T>({ items, letra, fila }: { items: T[]; letra: (x: T) => string; fila: (x: T) => React.ReactNode }) {
  const grupos = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const it of items) { const l = letra(it); m.set(l, [...(m.get(l) ?? []), it]); }
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  return (
    <div className="pv-lista">
      {grupos.map(([l, filas]) => (
        <section key={l} aria-label={`Letra ${l}`}>
          <div className="pv-letra">{l}</div>
          <ul className="pv-grupo">{filas.map(fila)}</ul>
        </section>
      ))}
    </div>
  );
}

function FilaDirectorio({ nombre, sub, semilla, empresa, telefono, correo, onAbrir }: {
  nombre: string; sub: string; semilla: string; empresa: boolean; telefono?: string | null; correo?: string | null; onAbrir: () => void;
}) {
  const tel = (telefono ?? '').trim();
  const wa = whatsapp(tel);
  return (
    <li className="pv-fila">
      <button type="button" className="pv-fila__principal" onClick={onAbrir}>
        <span className={`pv-avatar${empresa ? ' pv-avatar--empresa' : ''}`} aria-hidden style={{ background: `linear-gradient(145deg, ${tono(semilla)}, color-mix(in srgb, ${tono(semilla)} 70%, #000))` }}>
          {empresa ? <Building2 size={18} /> : initials(nombre)}
        </span>
        <span className="pv-fila__texto">
          <span className="pv-fila__nombre">{nombre}</span>
          {sub && <span className="pv-fila__sub">{sub}</span>}
        </span>
      </button>
      {(tel || correo) && (
        <div className="pv-fila__acciones">
          {tel && <a className="pv-accion" href={`tel:${tel.replace(/\s/g, '')}`} aria-label={`Llamar a ${nombre}`}><Phone size={16} /></a>}
          {wa && <a className="pv-accion pv-accion--wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${nombre}`}><MessageCircle size={16} /></a>}
        </div>
      )}
    </li>
  );
}

// ─── Ficha del proveedor (ventana) ───────────────────────────────────────────

function FichaProveedor({ proveedor: p, onClose, onEditar, onEliminar }: { proveedor: ProveedorInv | null; onClose: () => void; onEditar?: () => void; onEliminar?: () => void }) {
  const nombre = p ? nombreMostrado(p) : '';
  const cuentas = p?.cuentas ?? [];
  const contactos = p?.contactos ?? [];
  return (
    <Sheet open={!!p} onClose={onClose} title="Proveedor"
      footer={(onEditar || onEliminar) ? (
        <>
          {onEliminar && <Button variant="plain" onClick={onEliminar}>Eliminar</Button>}
          {onEditar && <Button variant="primary" onClick={onEditar}>Editar</Button>}
        </>
      ) : undefined}>
      {p && (
        <div className="pv-ficha">
          <div className="pv-hero">
            <span className="pv-avatar pv-avatar--grande" aria-hidden style={{ background: `linear-gradient(145deg, ${tono(nombre)}, color-mix(in srgb, ${tono(nombre)} 70%, #000))` }}>
              {initials(nombre) || <Building2 size={26} />}
            </span>
            <h3>{nombre}</h3>
            <span className="pv-hero__sub">{p.ruc ? `${p.tipo_documento ?? 'RUC'} ${p.ruc}` : 'Sin documento'} · #{p.id}</span>
          </div>

          <section className="pv-seccion">
            <h4>Contactos</h4>
            {contactos.length === 0 && !p.telefono && !p.correo ? (
              <ul className="pv-tarjeta"><li><p className="pv-vacio" style={{ width: '100%' }}>Sin contactos registrados.</p></li></ul>
            ) : (
              <ul className="pv-tarjeta">
                {(contactos.length ? contactos : [{ nombre: 'Contacto general', cargo: null, telefono: p.telefono, email: p.correo, principal: false }]).map((c, i) => {
                  const tel = (c.telefono ?? '').trim(); const wa = whatsapp(tel);
                  return (
                    <li key={c.id ?? i}>
                      <span className="pv-avatar" aria-hidden style={{ background: `linear-gradient(145deg, ${tono(c.nombre)}, color-mix(in srgb, ${tono(c.nombre)} 70%, #000))` }}>{initials(c.nombre)}</span>
                      <span className="pv-fila__texto" style={{ flex: 1 }}>
                        <span className="pv-fila__nombre">{c.nombre}{c.principal && contactos.length > 1 && <Star size={12} className="pv-estrella" style={{ marginLeft: 6, verticalAlign: '-1px' }} aria-label="Principal" />}</span>
                        <span className="pv-fila__sub">{[c.cargo, tel, c.email].filter(Boolean).join(' · ') || 'Sin datos'}</span>
                      </span>
                      <div className="pv-fila__acciones">
                        {tel && <a className="pv-accion" href={`tel:${tel.replace(/\s/g, '')}`} aria-label={`Llamar a ${c.nombre}`}><Phone size={16} /></a>}
                        {wa && <a className="pv-accion pv-accion--wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${c.nombre}`}><MessageCircle size={16} /></a>}
                        {c.email && <a className="pv-accion pv-accion--mail" href={`mailto:${c.email}`} aria-label={`Escribir a ${c.nombre}`}><Mail size={16} /></a>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {cuentas.length > 0 && (
            <section className="pv-seccion">
              <h4>Cuentas bancarias</h4>
              <ul className="pv-tarjeta">
                {cuentas.map((c, i) => (
                  <li key={i} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
                    <div className="pv-dato"><span>{c.banco}{c.detraccion ? ' · detracciones' : ''}</span><span>{c.moneda === 'DOLARES' ? 'US$' : 'S/'} · {String(c.tipo_cuenta ?? '').toLowerCase()}</span></div>
                    <div className="pv-dato pv-mono"><span>N° cuenta</span><span>{c.numero_cuenta}</span></div>
                    {c.cci && <div className="pv-dato pv-mono"><span>CCI</span><span>{c.cci}</span></div>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(p.direccion || p.observaciones) && (
            <section className="pv-seccion">
              <h4>Datos</h4>
              <ul className="pv-tarjeta">
                {p.direccion && <li><div className="pv-dato" style={{ width: '100%' }}><span>Dirección</span><span>{p.direccion}</span></div></li>}
                {p.observaciones && <li><div className="pv-dato" style={{ width: '100%' }}><span>Notas</span><span style={{ whiteSpace: 'pre-wrap' }}>{p.observaciones}</span></div></li>}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}
