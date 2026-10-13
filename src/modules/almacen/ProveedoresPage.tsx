import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Building2, Plus, SearchX } from 'lucide-react';
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
import { eliminarProveedor, useProveedores, type ProveedorInv } from './api';
import { ProveedorFormulario } from './ProveedorFormulario';

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

  const visibles = useMemo(() => proveedores.filter(p => {
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
                { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('almacen/proveedores') },
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
            <div className="tarjeta__lista">
              <AnimatePresence initial={false}>
                {visibles.map(p => (
                  <motion.div key={p.id} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
                    <button type="button" className="mov-fila" onClick={() => { haptic('selection'); setSeleccionado(p); }}>
                      <div className="mov-fila__icon" style={{ background: 'var(--fill)', color: 'var(--label-2)' }}>
                        <Building2 size={16} />
                      </div>
                      <div className="mov-fila__cuerpo">
                        <span className="mov-fila__titulo">{p.nombre}</span>
                        <span className="mov-fila__sub">
                          {p.ruc ? `RUC: ${p.ruc}` : 'Sin RUC'}
                          {p.contacto ? ` · ${p.contacto}` : ''}
                          {p.telefono ? ` · ${p.telefono}` : ''}
                        </span>
                      </div>
                      {p.banco && (
                        <div className="mov-fila__derecha">
                          <span style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>{p.banco}</span>
                        </div>
                      )}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
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
