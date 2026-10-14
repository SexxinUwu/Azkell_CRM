import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Building2, FileSpreadsheet, MessageCircle, Phone, Plus, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { exportarExcel } from '../../core/lib/excel';
import { initials } from '../../core/lib/format';
import { whatsapp } from '../conductores/api';
import '../conductores/conductores.css';
import './almacen.css';
import { eliminarProveedor, useProveedores, type ProveedorInv } from './api';
import { ProveedorFormulario } from './ProveedorFormulario';

// Tonos para las iniciales: el mismo proveedor siempre tiene el mismo color
const TONOS = ['#f56300', '#0a84ff', '#30a46c', '#bf5af2', '#ff375f', '#5e5ce6', '#ac8e68', '#0fa3b1'];
const tono = (s: string) => TONOS[[...s].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONOS.length];

export function ProveedoresPage() {
  const { data, isLoading, isError, error } = useProveedores();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();

  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<ProveedorInv | null>(null);
  const [formulario, setFormulario] = useState<{ proveedor: ProveedorInv | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<ProveedorInv | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const puedeCrear = can('prov_inv.crear');
  const puedeEditar = can('prov_inv.editar');
  const puedeEliminar = can('prov_inv.eliminar');

  const proveedores = data ?? [];

  const visibles = useMemo(() => [...proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).filter(p => {
    if (!busqueda) return true;
    const q = busqueda.toUpperCase();
    return (
      p.nombre.toUpperCase().includes(q) ||
      (p.ruc ?? '').toUpperCase().includes(q) ||
      (p.contacto ?? '').toUpperCase().includes(q) ||
      (p.telefono ?? '').toUpperCase().includes(q) ||
      (p.correo ?? '').toUpperCase().includes(q)
    );
  }), [proveedores, busqueda]);

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

  const soloDetalle = !!seleccionado;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Almacén"
          title="Proveedores"
          subtitle={isLoading ? 'Cargando…' : `${proveedores.length} proveedores registrados`}
          actions={
            <>
              <MenuOtros opciones={[
                { label: 'Exportar Excel', detalle: `${visibles.length} proveedores`, icon: <FileSpreadsheet size={17} />,
                  onSelect: () => exportarExcel('Proveedores', 'Proveedores',
                    ['Proveedor', 'RUC', 'Contacto', 'Teléfono', 'Correo', 'Dirección', 'Banco', 'Cuenta', 'CCI', 'Moneda'],
                    visibles.map(p => [p.nombre, p.ruc, p.contacto, p.telefono, p.correo, p.direccion, p.banco, p.cuenta, p.cci, p.moneda_pago]))
                    .catch(err => toast(errorMessage(err), 'error')) },
                { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('almacen/proveedores') },
              ]} />
              {puedeCrear && (
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ proveedor: null })}>
                  Nuevo proveedor
                </Button>
              )}
            </>
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : soloDetalle ? (
        <ProveedorDetalle
          proveedor={seleccionado}
          onVolver={() => setSeleccionado(null)}
          onEditar={puedeEditar ? () => setFormulario({ proveedor: seleccionado }) : undefined}
          onEliminar={puedeEliminar ? () => setPorEliminar(seleccionado) : undefined}
        />
      ) : proveedores.length === 0 ? (
        <EmptyState icon={<Building2 size={22} />} title="Sin proveedores registrados">
          {puedeCrear
            ? <>Registra el primer proveedor con <strong>Nuevo proveedor</strong>.</>
            : 'Cuando se registren proveedores, aparecerán aquí.'}
        </EmptyState>
      ) : (
        <div>
          <div style={{ marginBottom: 'var(--s-4)' }}>
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, RUC, contacto o teléfono" />
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Ningún proveedor coincide">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>
                Quitar búsqueda
              </button>
            </EmptyState>
          ) : (
            <ul className="conductores-grid">
              <AnimatePresence initial={false}>
                {visibles.map(p => {
                  const wa = whatsapp(p.telefono ?? '');
                  const tel = (p.telefono ?? '').trim();
                  return (
                    <motion.li key={p.id} layout={!reduce} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                      <div className="conductor-card">
                        <button type="button" className="conductor-card__principal pressable" onClick={() => { haptic('selection'); setSeleccionado(p); }}>
                          <span className="foto-conductor foto-conductor--iniciales" aria-hidden
                            style={{ width: 52, height: 52, fontSize: 52 * 0.38, background: `linear-gradient(145deg, ${tono(p.nombre)}, color-mix(in srgb, ${tono(p.nombre)} 70%, #000))` }}>
                            {initials(p.nombre) || <Building2 size={20} />}
                          </span>
                          <div className="conductor-card__texto">
                            <div className="conductor-card__nombre">{p.nombre}</div>
                            <div className="conductor-card__meta"><span>{p.ruc ? `RUC ${p.ruc}` : 'Sin RUC'}</span></div>
                            <div className="conductor-card__empresa">
                              {[p.contacto, tel].filter(Boolean).join(' · ') || 'Sin contacto'}
                            </div>
                          </div>
                        </button>
                        {(tel || wa) && (
                          <div className="conductor-card__acciones">
                            {tel && <a className="conductor-accion pressable" href={`tel:${tel.replace(/\s/g, '')}`} aria-label={`Llamar a ${p.nombre}`}><Phone size={16} /></a>}
                            {wa && <a className="conductor-accion conductor-accion--wa pressable" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${p.nombre}`}><MessageCircle size={16} /></a>}
                          </div>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      )}

      <ProveedorFormulario
        open={!!formulario}
        proveedor={formulario?.proveedor ?? null}
        onClose={() => setFormulario(null)}
        onGuardado={() => {
          setFormulario(null);
          qc.invalidateQueries({ queryKey: ['almacen', 'proveedores'] });
        }}
      />

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        title={`¿Eliminar proveedor "${porEliminar?.nombre}"?`}
        message="Se eliminará el proveedor del directorio. Los artículos asociados no se verán afectados."
        confirmLabel="Eliminar"
      />
    </Page>
  );
}

// ─── Detalle de un proveedor ─────────────────────────────────────────────────

interface DetalleProps {
  proveedor: ProveedorInv;
  onVolver: () => void;
  onEditar?: () => void;
  onEliminar?: () => void;
}

function ProveedorDetalle({ proveedor: p, onVolver, onEditar, onEliminar }: DetalleProps) {
  return (
    <div className="inv-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Proveedores
        </button>
        <div className="tarjeta__barra-acciones">
          <MenuOtros opciones={[
            onEditar && { label: 'Editar', onSelect: onEditar },
            onEliminar && { label: 'Eliminar', destructiva: true, separado: true, onSelect: onEliminar },
          ]} />
        </div>
      </div>

      <div className="inv-ficha__hero" style={{ paddingTop: 'var(--s-2)' }}>
        <div className="inv-ficha__imagen-vacia"><Building2 size={28} /></div>
        <span className="inv-ficha__id">#{p.id}</span>
        <h2 className="inv-ficha__nombre">{p.nombre}</h2>
        {p.ruc && <span className="inv-ficha__sub">RUC: {p.ruc}</span>}
        {(p.telefono || p.correo) && (
          <div className="ficha__contacto" style={{ justifyContent: 'center' }}>
            {p.telefono && <a className="conductor-accion pressable" href={`tel:${p.telefono.replace(/\s/g, '')}`} aria-label="Llamar"><Phone size={16} /></a>}
            {whatsapp(p.telefono ?? '') && <a className="conductor-accion conductor-accion--wa pressable" href={`https://wa.me/${whatsapp(p.telefono ?? '')}`} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={16} /></a>}
          </div>
        )}
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Contacto</p>
        <div className="tarjeta__lista">
          {p.contacto && <div className="dato"><span className="dato__label">Contacto</span><span className="dato__valor">{p.contacto}</span></div>}
          {p.telefono && <div className="dato"><span className="dato__label">Teléfono</span><span className="dato__valor dato__valor--mono">{p.telefono}</span></div>}
          {p.correo && <div className="dato"><span className="dato__label">Correo</span><span className="dato__valor">{p.correo}</span></div>}
          {p.direccion && <div className="dato"><span className="dato__label">Dirección</span><span className="dato__valor">{p.direccion}</span></div>}
        </div>
      </div>

      {(p.banco || p.cuenta || p.cci) && (
        <div>
          <p className="tarjeta__grupo-titulo">Datos bancarios</p>
          <div className="tarjeta__lista">
            {p.banco && <div className="dato"><span className="dato__label">Banco</span><span className="dato__valor">{p.banco}</span></div>}
            {p.moneda_pago && <div className="dato"><span className="dato__label">Moneda</span><span className="dato__valor">{p.moneda_pago}</span></div>}
            {p.cuenta && <div className="dato"><span className="dato__label">N° de cuenta</span><span className="dato__valor dato__valor--mono">{p.cuenta}</span></div>}
            {p.cci && <div className="dato"><span className="dato__label">CCI</span><span className="dato__valor dato__valor--mono">{p.cci}</span></div>}
          </div>
        </div>
      )}

      {p.observaciones && (
        <div>
          <p className="tarjeta__grupo-titulo">Observaciones</p>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{p.observaciones}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
