import './hojas-ruta.css';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, FileText, MapPinned, Pencil, Plus, Trash2, Truck, Users } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { BotonTip } from '../../core/ui/BotonTip';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { RAIZ, horasTexto, resumenPlantilla, usePlantillasRuta, type PlantillaRuta } from './hojas-ruta-datos';
import { GenerarHojaSheet, PlantillaSheet } from './hojas-ruta-sheets';

// Operaciones Marsisa › Hojas de ruta: plantillas por cliente y tipo de unidad y PDF para el conductor de cada viaje
export function HojasRutaPage() {
  const q = usePlantillasRuta();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const puedeEditar = can('op_ordenes_viaje.crear', 'op_ordenes_viaje.editar', 'op_programacion.crear', 'op_programacion.editar');
  const [generando, setGenerando] = useState<PlantillaRuta | null>(null);
  const [editando, setEditando] = useState<{ abierta: boolean; plantilla: PlantillaRuta | null }>({ abierta: false, plantilla: null });
  const [porEliminar, setPorEliminar] = useState<PlantillaRuta | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await api(`/operaciones/hojas-ruta/plantillas/${porEliminar.id}`, { method: 'DELETE' });
      toast('Plantilla eliminada');
      setPorEliminar(null);
      await qc.invalidateQueries({ queryKey: RAIZ });
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setEliminando(false); }
  }

  const lista = q.data ?? [];
  return (
    <Page wide>
      <PageHeader eyebrow="Operaciones Marsisa" title="Hojas de ruta"
        subtitle="Itinerario de paradas por cliente y tipo de unidad, en PDF para el conductor"
        actions={puedeEditar ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditando({ abierta: true, plantilla: null })}>Nueva plantilla</Button> : undefined} />

      {q.isError && <Notice tone="error">{errorMessage(q.error)}</Notice>}
      {q.isLoading ? <PageLoader /> : lista.length === 0 && !q.isError ? (
        <EmptyState icon={<MapPinned size={22} />} title="Aún no hay plantillas">Crea una por cliente y tipo de unidad (tracto o camión) con sus paradas y horas.</EmptyState>
      ) : (
        <div className="hr-tarjetas">
          {lista.map(pl => {
            const r = resumenPlantilla(pl.paradas);
            return (
              <article key={pl.id} className="hr-tarjeta">
                <header className="hr-tarjeta__cab">
                  <div>
                    <span className="hr-chip">{pl.cliente}</span>
                    <h2 className="hr-tarjeta__titulo">{pl.nombre}</h2>
                    <p className="hr-tarjeta__ruta">{pl.origen || '—'} → {pl.destino || '—'}{pl.material ? ` · ${pl.material}` : ''}</p>
                  </div>
                  {puedeEditar && (
                    <span className="hr-tarjeta__acc">
                      <BotonTip tip="Editar" className="btn btn--plain btn--icono" onClick={() => setEditando({ abierta: true, plantilla: pl })}><Pencil size={16} /></BotonTip>
                      <BotonTip tip="Eliminar" className="btn btn--plain btn--icono" onClick={() => setPorEliminar(pl)}><Trash2 size={16} /></BotonTip>
                    </span>
                  )}
                </header>
                <ul className="hr-datos" aria-label="Resumen">
                  <li><Truck size={15} aria-hidden /> {pl.tipo_unidad === 'CAMION' ? 'Camión' : 'Tracto'}</li>
                  <li><Users size={15} aria-hidden /> {pl.choferes} {pl.choferes === 1 ? 'chofer' : 'choferes'}</li>
                  <li><MapPinned size={15} aria-hidden /> {pl.paradas.length} paradas</li>
                  <li><Clock size={15} aria-hidden /> {horasTexto(r.total)} de viaje · {horasTexto(r.manejo)} de manejo</li>
                </ul>
                <Button variant="primary" icon={<FileText size={16} />} onClick={() => setGenerando(pl)}>Generar hoja de ruta</Button>
              </article>
            );
          })}
        </div>
      )}

      <GenerarHojaSheet plantilla={generando} onClose={() => setGenerando(null)} />
      <PlantillaSheet abierta={editando.abierta} plantilla={editando.plantilla} onClose={() => setEditando(e => ({ ...e, abierta: false }))} />
      <ConfirmSheet open={!!porEliminar} onClose={() => setPorEliminar(null)} onConfirm={eliminar} loading={eliminando}
        title={`¿Eliminar «${porEliminar?.nombre ?? ''}»?`} message="Se elimina la plantilla y sus paradas. Los PDF ya generados no se afectan." confirmLabel="Eliminar" />
    </Page>
  );
}
