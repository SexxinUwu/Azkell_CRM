import './mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, FileSpreadsheet, Pencil, SearchX, Trash2, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { MultiSelect } from '../../core/ui/MultiSelect';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { ImportarTrabajosSheet } from './ImportarTrabajosSheet';
import {
  aprobarTrabajo, editarTrabajo, eliminarTrabajo, ESTADOS_TRABAJO, estadoTrabajo, trabajoCosto, trabajoId, trabajoKmHoras,
  useTrabajosOT, type TrabajoOT,
} from './api';

const dia = (s: string | null | undefined) => (s ? String(s).split('T')[0] : '—');
const aLocal = (s: string | null | undefined) => (s ? String(s).replace('Z', '').replace(' ', 'T').slice(0, 16) : '');
const tonoEstado = (e: string | null | undefined) => {
  const est = estadoTrabajo(e);
  if (est === 'Aprobado') return 'green';
  if (est === 'Realizado') return 'accent';
  if (est === 'En Proceso') return 'blue';
  return 'amber';
};

function personalDe(t: TrabajoOT): string[] {
  let p = t.tecnico ?? '';
  try { const d = JSON.parse(t.detalles_json ?? '{}'); if (d.personal) p = String(d.personal); } catch { /* sin detalles */ }
  return p.split(',').map(x => x.trim()).filter(Boolean);
}

export function TrabajosOtPage() {
  const { data, isLoading, isError, error } = useTrabajosOT();
  const { can, user } = useAuth();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  const trabajos = data ?? [];
  const seleccionado = trabajos.find(t => trabajoId(t) === seleccionadoId) ?? null;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return trabajos.filter(t =>
      (!estado || estadoTrabajo(t.estado) === estado) &&
      (!q || trabajoId(t).toUpperCase().includes(q) || (t.placa ?? '').toUpperCase().includes(q) ||
        personalDe(t).join(' ').toUpperCase().includes(q) || (t.trabajo_realizado ?? '').toUpperCase().includes(q) ||
        (t.ticket_visita ?? '').toUpperCase().includes(q)));
  }, [trabajos, busqueda, estado]);

  async function exportar() {
    try {
      await exportarExcel('Trabajos-OT', 'Trabajos',
        ['Trabajo', 'OT', 'Placa', 'Estado', 'Trabajo realizado', 'Personal', 'Inicio', 'Salida', 'Costo', 'Creado por'],
        visibles.map(t => [trabajoId(t), t.ticket_visita, t.placa, estadoTrabajo(t.estado), t.trabajo_realizado, personalDe(t).join(', '),
          dia(t.fecha_trabajo), dia(t.fecha_salida), trabajoCosto(t), t.creado_por]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      {!seleccionado && (
        <PageHeader
          eyebrow="Mantenimiento"
          title="Trabajos de OT"
          subtitle={isLoading ? 'Cargando…' : `${trabajos.length} trabajos registrados`}
          actions={
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} trabajos`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Importar desde Excel', icon: <FileSpreadsheet size={17} />, separado: true, onSelect: () => setImportando(true) },
            ]} />
          }
        />
      )}
      <ImportarTrabajosSheet open={importando} onClose={() => setImportando(false)} />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : seleccionado ? (
        <TrabajoDetalle
          trabajo={seleccionado}
          puedeEditar={can('trabajos_ot.editar')}
          puedeEliminar={can('trabajos_ot.eliminar')}
          usuario={user?.name ?? ''}
          onVolver={() => setSeleccionadoId(null)}
        />
      ) : trabajos.length === 0 ? (
        <EmptyState icon={<Wrench size={22} />} title="Sin trabajos registrados">
          Los trabajos aparecen aquí cuando se registran desde una orden de trabajo.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, técnico, trabajo, OT o ticket…" />
          <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado">
            <option value="">Todos los estados</option>
            {ESTADOS_TRABAJO.map(e => <option key={e} value={e}>{e} · {trabajos.filter(t => estadoTrabajo(t.estado) === e).length}</option>)}
          </SelectInput>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setEstado(''); }}>Quitar filtros</button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map(t => {
                const id = trabajoId(t);
                const costo = trabajoCosto(t);
                return (
                  <button key={id || String(t.id)} type="button" className="ot-fila"
                    onClick={() => { haptic('selection'); setSeleccionadoId(id); }}>
                    <div className="ot-fila__icono"><Wrench size={16} /></div>
                    <div className="ot-fila__cuerpo">
                      <span className="ot-fila__id">{id}</span>
                      <span className="ot-fila__sub">
                        <span className="ot-fila__placa">{t.placa || '—'}</span>
                        {t.trabajo_realizado ? ` · ${t.trabajo_realizado}` : ''}
                      </span>
                    </div>
                    <div className="ot-fila__derecha">
                      <span className={`ot-estado ot-estado--${tonoEstado(t.estado)}`} style={{ fontSize: '0.6875rem' }}>{estadoTrabajo(t.estado)}</span>
                      <span className="ot-fila__fecha">{dia(t.fecha_trabajo)}</span>
                      {costo > 0 && <span className="ot-fila__costo">S/ {costo.toFixed(2)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

function TrabajoDetalle({ trabajo: t, puedeEditar, puedeEliminar, usuario, onVolver }: {
  trabajo: TrabajoOT; puedeEditar: boolean; puedeEliminar: boolean; usuario: string; onVolver: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const id = trabajoId(t);
  const kmh = trabajoKmHoras(t);
  const costo = trabajoCosto(t);
  const aprobado = estadoTrabajo(t.estado) === 'Aprobado';

  const refrescar = () => qc.invalidateQueries({ queryKey: ['mant', 'trabajos-ot'] });

  async function aprobar() {
    setOcupado(true);
    try {
      await aprobarTrabajo(id, usuario);
      haptic('success'); toast('Trabajo aprobado'); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function eliminar() {
    setOcupado(true);
    try {
      await eliminarTrabajo(id);
      haptic('success'); toast('Trabajo eliminado'); setBorrando(false); onVolver(); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Trabajos
        </button>
        <div className="tarjeta__barra-acciones">
          {puedeEditar && !aprobado && (
            <Button variant="secondary" icon={<CheckCircle2 size={16} />} onClick={aprobar} loading={ocupado}>Aprobar</Button>
          )}
          {(puedeEditar || puedeEliminar) && (
            <MenuOtros opciones={[
              puedeEditar && { label: 'Editar', icon: <Pencil size={17} />, onSelect: () => setEditando(true) },
              puedeEliminar && { label: 'Eliminar', icon: <Trash2 size={17} />, destructiva: true, separado: true, onSelect: () => setBorrando(true) },
            ]} />
          )}
        </div>
      </div>

      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${tonoEstado(t.estado)}`}>{estadoTrabajo(t.estado)}</span>
        <h2 className="ot-ficha__placa">{t.placa || '—'}</h2>
        <span className="ot-ficha__id">{id}{t.ticket_visita ? ` · OT ${t.ticket_visita}` : ''}</span>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Trabajo</p>
        <div className="tarjeta__lista">
          <div className="dato"><span className="dato__label">Trabajo realizado</span><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{t.trabajo_realizado || '—'}</span></div>
          <div className="dato"><span className="dato__label">Personal</span><span className="dato__valor">{personalDe(t).join(', ') || '—'}</span></div>
          {kmh !== '—' && <div className="dato"><span className="dato__label">Km / Horas</span><span className="dato__valor dato__valor--mono">{kmh}</span></div>}
          {costo > 0 && <div className="dato"><span className="dato__label">Costo</span><span className="dato__valor" style={{ fontWeight: 700 }}>S/ {costo.toFixed(2)}</span></div>}
        </div>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Fechas</p>
        <div className="tarjeta__lista">
          <div className="dato"><span className="dato__label">Inicio</span><span className="dato__valor dato__valor--mono">{aLocal(t.fecha_trabajo).replace('T', ' ') || '—'}</span></div>
          <div className="dato"><span className="dato__label">Salida</span><span className="dato__valor dato__valor--mono">{aLocal(t.fecha_salida).replace('T', ' ') || '—'}</span></div>
          {t.creado_por && <div className="dato"><span className="dato__label">Registrado por</span><span className="dato__valor">{t.creado_por}</span></div>}
        </div>
      </div>

      <EditarTrabajoSheet trabajo={t} open={editando} onClose={() => setEditando(false)} />

      <ConfirmSheet
        open={borrando}
        onClose={() => !ocupado && setBorrando(false)}
        onConfirm={eliminar}
        loading={ocupado}
        title={`¿Eliminar ${id}?`}
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </div>
  );
}

function usePersonalTaller() {
  return useQuery({
    queryKey: ['mant', 'taller-personal'],
    queryFn: () => api<unknown>('/taller-personal').then(r => {
      const arr = Array.isArray(r) ? r : ((r as { data?: unknown[] }).data ?? []);
      return (arr as Record<string, unknown>[])
        .map(p => String(p.nombre ?? p.nombres ?? p.nombre_completo ?? '').trim()).filter(Boolean);
    }),
    staleTime: 5 * 60_000,
  });
}

function EditarTrabajoSheet({ trabajo: t, open, onClose }: { trabajo: TrabajoOT; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const personalQ = usePersonalTaller();
  const [desc, setDesc] = useState('');
  const [personal, setPersonal] = useState<string[]>([]);
  const [ini, setIni] = useState('');
  const [fin, setFin] = useState('');
  const [costo, setCosto] = useState('');
  const [estado, setEstado] = useState('Pendiente');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDesc(t.trabajo_realizado ?? ''); setPersonal(personalDe(t));
    setIni(aLocal(t.fecha_trabajo)); setFin(aLocal(t.fecha_salida));
    setCosto(trabajoCosto(t) ? String(trabajoCosto(t)) : ''); setEstado(estadoTrabajo(t.estado)); setError(null);
  }, [open, t]);

  const opcionesPersonal = useMemo(() => [...new Set([...(personalQ.data ?? []), ...personal])].sort((a, b) => a.localeCompare(b, 'es')), [personalQ.data, personal]);

  async function guardar() {
    if (!desc.trim()) { setError('Describe el trabajo realizado.'); return; }
    if (ini && fin && fin < ini) { setError('La salida es anterior al inicio.'); return; }
    setEnviando(true); setError(null);
    try {
      await editarTrabajo(trabajoId(t), {
        trabajo_realizado: desc.trim(), fecha_trabajo: ini || null, fecha_salida: fin || null,
        personal: personal.join(', '), costo: parseFloat(costo.replace(',', '.')) || 0, estado,
      });
      haptic('success'); toast('Trabajo actualizado');
      await qc.invalidateQueries({ queryKey: ['mant', 'trabajos-ot'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Editar ${trabajoId(t)}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Trabajo realizado" wide>{p => <TextInput {...p} value={desc} onChange={e => setDesc(e.target.value)} />}</Field>
        <div className="field field--wide">
          <MultiSelect label="Personal" options={opcionesPersonal} value={personal} onChange={setPersonal} placeholder="Sin asignar" />
        </div>
        <Field label="Inicio">{p => <TextInput {...p} type="datetime-local" value={ini} onChange={e => setIni(e.target.value)} />}</Field>
        <Field label="Salida">{p => <TextInput {...p} type="datetime-local" value={fin} min={ini || undefined} onChange={e => setFin(e.target.value)} />}</Field>
        <Field label="Costo (S/)">{p => <TextInput {...p} inputMode="decimal" value={costo} onChange={e => setCosto(e.target.value)} />}</Field>
        <Field label="Estado">
          {p => (
            <SelectInput {...p} value={estado} onChange={e => setEstado(e.target.value)}>
              {ESTADOS_TRABAJO.map(e => <option key={e} value={e}>{e}</option>)}
            </SelectInput>
          )}
        </Field>
      </div>
    </Sheet>
  );
}
