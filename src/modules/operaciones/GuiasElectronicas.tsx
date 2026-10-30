import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileSpreadsheet, FileText, Pencil, Plus, RefreshCw, Send, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { GuiaFormSheet, type TipoGuia } from './GuiaFormSheet';

// Estado del ambiente de emisión (GET /api/guias-remision/ambiente-emision)
interface AmbienteEmision { ambiente: string; prueba_lista: boolean; motivo: string | null }

interface Guia {
  id: number; numero_guia: string; serie: string; correlativo: number; estado: string | null; apisunat_status: string | null;
  fecha_emision: string | null; fecha_traslado: string | null; peso_total: number | string | null;
  remitente_razon_social: string | null; destinatario_razon_social: string | null; destinatario_ruc: string | null;
  transportista_razon_social: string | null; vehiculo_placa: string | null; conductor_nombres: string | null; orden_viaje: string | null;
  partida_direccion: string | null; llegada_direccion: string | null; descripcion_motivo: string | null; items_count?: number;
  apisunat_pdf_url?: string | null; apisunat_xml_url?: string | null; apisunat_cdr_url?: string | null; apisunat_error?: string | null;
}
interface Item { id: number; descripcion?: string; cantidad?: number | string; unidad_medida?: string; peso?: number | string }

const CFG: Record<TipoGuia, { ruta: string; titulo: string; clasico: string; excel: string }> = {
  remitente: { ruta: '/guia-remitente', titulo: 'Guías de remitente', clasico: 'operaciones/guia-remitente', excel: 'Guias-remitente' },
  transportista: { ruta: '/guia-transportista', titulo: 'Guías de transportista', clasico: 'operaciones/guia-transportista', excel: 'Guias-transportista' },
};

const estadoDe = (g: Guia) => {
  const s = String(g.apisunat_status ?? '').toUpperCase();
  const e = String(g.estado ?? 'BORRADOR').toUpperCase();
  if (e === 'ANULADO' || s === 'ANULADO') return 'ANULADA';
  if (s === 'RECHAZADO' || e === 'RECHAZADA') return 'RECHAZADA';
  if (s === 'SUCCESS' || s === 'ACEPTADO' || e === 'ACEPTADA') return 'ACEPTADA';
  if (e === 'EMITIDA' || e === 'PENDIENTE' || s === 'ENVIADO') return 'EMITIDA';
  return 'BORRADOR';
};
const tono = (e: string) => ({ ACEPTADA: 'green', EMITIDA: 'accent', BORRADOR: 'amber', RECHAZADA: 'red', ANULADA: 'gray' }[e] ?? 'gray');
const n = (v: unknown) => Number(v) || 0;
const dia = (s?: string | null) => (s ? String(s).slice(0, 10) : '');

// Operaciones › Guías electrónicas (SUNAT). Consulta, alta/edición de borradores, emisión (solo ambiente de prueba),
// sincronización, duplicado y eliminación de borradores. La emisión masiva y la configuración siguen en la versión actual.
export function GuiasElectronicas({ tipo }: { tipo: TipoGuia }) {
  const cfg = CFG[tipo];
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [porEliminar, setPorEliminar] = useState<Guia | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [formAbierto, setFormAbierto] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [edicion, setEdicion] = useState<{ id: number; guia: Guia; items: Item[] } | null>(null);

  // Si el servidor no tiene credenciales de prueba, la emisión queda deshabilitada aquí
  const ambiente = useQuery<AmbienteEmision>({
    queryKey: ['operaciones', 'guias-ambiente'],
    queryFn: () => api<AmbienteEmision>('/guias-remision/ambiente-emision'),
    staleTime: 60_000,
  });
  const emisionLista = ambiente.data?.prueba_lista === true;

  const lista = useQuery<Guia[]>({
    queryKey: ['operaciones', 'guias', tipo, q],
    queryFn: async () => {
      const r = await api<{ guias?: Guia[]; data?: Guia[] }>(`${cfg.ruta}?limit=200${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      return r.guias ?? r.data ?? [];
    },
    staleTime: 20_000,
  });
  const det = useQuery<{ guia: Guia; items: Item[] }>({
    queryKey: ['operaciones', 'guia', tipo, abiertoId], enabled: abiertoId != null,
    queryFn: async () => {
      const r = await api<{ guia: Guia & { items?: Item[] }; items?: Item[] }>(`${cfg.ruta}/${abiertoId}`);
      return { guia: r.guia, items: r.items ?? r.guia.items ?? [] };
    },
  });

  const datos = lista.data ?? [];
  const visibles = useMemo(() => datos.filter(g => !estado || estadoDe(g) === estado), [datos, estado]);
  const conteo = useMemo(() => {
    const c: Record<string, number> = {};
    datos.forEach(g => { const e = estadoDe(g); c[e] = (c[e] ?? 0) + 1; });
    return c;
  }, [datos]);
  const abierta = datos.find(g => g.id === abiertoId) ?? null;
  const g = det.data?.guia ?? abierta;
  const e = g ? estadoDe(g) : '';
  const puedeEditar = can('op_guias_remision.editar', 'op_guias_remision.crear', 'guias_remision.editar');
  const puedeEliminar = can('op_guias_remision.eliminar', 'guias_remision.eliminar');
  const refrescar = () => qc.invalidateQueries({ queryKey: ['operaciones'] });

  function nuevaGuia() {
    setEdicion(null); setFormKey(k => k + 1); setFormAbierto(true);
  }
  function editarBorrador() {
    if (!g) return;
    setEdicion({ id: g.id, guia: g, items: (det.data?.items ?? []) as Item[] });
    setAbiertoId(null); setFormKey(k => k + 1); setFormAbierto(true);
  }

  async function ejecutar(fn: () => Promise<{ success?: boolean; ok?: boolean; error?: string; message?: string }>, ok: string, cerrar = false) {
    setOcupado(true);
    try {
      const r = await fn();
      if (r.success === false || r.ok === false) throw new Error(r.error || 'No se pudo completar la acción');
      haptic('success'); toast(r.message || ok); await refrescar(); if (cerrar) setAbiertoId(null);
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function exportar() {
    try {
      await exportarExcel(cfg.excel, 'Guías',
        ['Guía', 'Emisión', 'Traslado', 'Estado', 'Destinatario', 'RUC', 'Placa', 'Conductor', 'Orden de viaje', 'Peso (kg)', 'Partida', 'Llegada'],
        visibles.map(x => [x.numero_guia, dia(x.fecha_emision), dia(x.fecha_traslado), estadoDe(x), x.destinatario_razon_social, x.destinatario_ruc, x.vehiculo_placa,
          x.conductor_nombres, x.orden_viaje, n(x.peso_total), x.partida_direccion, x.llegada_direccion]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title={cfg.titulo}
        subtitle={lista.isLoading ? 'Cargando…' : `${datos.length} guías · ${conteo.BORRADOR ?? 0} borradores`}
        actions={
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            {puedeEditar && <Button variant="primary" icon={<Plus size={16} />} onClick={nuevaGuia}>Nueva guía</Button>}
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} guías`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
            ]} />
          </div>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          {[['', 'Todas', datos.length], ...['BORRADOR', 'EMITIDA', 'ACEPTADA', 'RECHAZADA', 'ANULADA'].map(x => [x, x.charAt(0) + x.slice(1).toLowerCase() + 's', conteo[x] ?? 0])]
            .filter(([val, , c]) => val === '' || Number(c) > 0).map(([val, label, c]) => (
              <button key={String(val)} type="button" onClick={() => setEstado(String(val))}
                style={{ padding: '0.375rem 0.875rem', borderRadius: 'var(--r-full)', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: estado === val ? 'var(--ink)' : 'var(--fill)', color: estado === val ? 'var(--label-inverse)' : 'var(--label-2)' }}>
                {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{c}</span>
              </button>
            ))}
        </div>

        {ambiente.data && (emisionLista
          ? <Notice tone="accent">Emisión conectada al ambiente de prueba (beta). Lo que se emite aquí no llega a SUNAT producción.</Notice>
          : <Notice tone="neutral">Emisión a SUNAT deshabilitada. {ambiente.data.motivo ?? ''}</Notice>)}

        <Notice tone="neutral">
          La emisión masiva y la configuración de SUNAT siguen en la versión actual.{' '}
          <a href={`/clasico#${cfg.clasico}`} onClick={e => { e.preventDefault(); abrirClasico(cfg.clasico); }} style={{ color: 'var(--accent)', fontWeight: 600 }}>
            Emitir en la versión actual (SUNAT)
          </a>
        </Notice>

        <SearchField value={busqueda} placeholder="N° de guía, destinatario, placa u orden de viaje…"
          onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _gT?: number })._gT); (window as unknown as { _gT?: number })._gT = window.setTimeout(() => setQ(v.trim()), 350); }} />

        {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || estado ? <SearchX size={22} /> : <FileText size={22} />} title={busqueda || estado ? 'Sin coincidencias' : 'Sin guías'}>
            {puedeEditar ? 'Crea un borrador con "Nueva guía".' : 'No hay guías registradas.'}
          </EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {visibles.map(x => {
              const ex = estadoDe(x);
              return (
                <button key={x.id} type="button" className="mov-fila" onClick={() => { haptic('selection'); setAbiertoId(x.id); }}>
                  <div className="mov-fila__icon" style={{ background: `var(--${tono(ex)}-tint)`, color: `var(--${tono(ex)}-ink)` }}><FileText size={16} /></div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{x.numero_guia} · {x.destinatario_razon_social || 'Sin destinatario'}</span>
                    <span className="mov-fila__sub">{[dia(x.fecha_emision), x.vehiculo_placa, x.orden_viaje && `Viaje ${x.orden_viaje}`].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span className="mov-fila__monto">{n(x.peso_total) ? `${n(x.peso_total).toLocaleString('es-PE')} kg` : ''}</span>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${tono(ex)}-ink)` }}>{ex}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!abierta} onClose={() => setAbiertoId(null)} title={g ? `Guía ${g.numero_guia}` : ''}
        footer={
          g && puedeEditar ? (
            <>
              {puedeEliminar && e === 'BORRADOR' && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => setPorEliminar(g)}>Eliminar</Button>}
              <Button variant="secondary" icon={<Copy size={16} />} loading={ocupado}
                onClick={() => ejecutar(() => api(`${cfg.ruta}/${g.id}/duplicar`, { method: 'POST' }), 'Guía duplicada como borrador', true)}>Duplicar</Button>
              {(e === 'EMITIDA' || e === 'RECHAZADA') && (
                <Button variant="secondary" icon={<RefreshCw size={16} />} loading={ocupado}
                  onClick={() => ejecutar(() => api(`${cfg.ruta}/${g.id}/sincronizar`), 'Estado sincronizado con SUNAT')}>Sincronizar</Button>
              )}
              {e === 'BORRADOR' && (
                <Button variant="secondary" icon={<Pencil size={16} />} disabled={ocupado} onClick={editarBorrador}>Editar</Button>
              )}
              {(e === 'BORRADOR' || e === 'RECHAZADA') && (
                <Button variant="primary" icon={<Send size={16} />} loading={ocupado} disabled={!emisionLista}
                  title={emisionLista ? undefined : (ambiente.data?.motivo ?? 'Emisión deshabilitada')}
                  onClick={() => ejecutar(() => api(`${cfg.ruta}/${g.id}/emitir`, { method: 'POST' }), 'Guía enviada a SUNAT')}>Emitir a SUNAT</Button>
              )}
            </>
          ) : <Button variant="secondary" onClick={() => setAbiertoId(null)}>Cerrar</Button>
        }>
        {g && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            {g.apisunat_error && e === 'RECHAZADA' && <Notice tone="error">{g.apisunat_error}</Notice>}
            <div className="tarjeta__lista">
              {fila('Estado', e)}{fila('Emisión', dia(g.fecha_emision), true)}{fila('Traslado', dia(g.fecha_traslado), true)}{fila('Motivo', g.descripcion_motivo)}
              {fila('Remitente', g.remitente_razon_social)}{fila('Destinatario', [g.destinatario_razon_social, g.destinatario_ruc].filter(Boolean).join(' · '))}
              {fila('Transportista', g.transportista_razon_social)}{fila('Vehículo', g.vehiculo_placa, true)}{fila('Conductor', g.conductor_nombres)}
              {fila('Orden de viaje', g.orden_viaje, true)}{fila('Partida', g.partida_direccion)}{fila('Llegada', g.llegada_direccion)}
              {fila('Peso total', n(g.peso_total) ? `${n(g.peso_total).toLocaleString('es-PE')} kg` : '')}
            </div>
            {(det.data?.items ?? []).length > 0 && (
              <div>
                <p className="tarjeta__grupo-titulo">Bienes ({det.data!.items.length})</p>
                <div className="tarjeta__lista">
                  {det.data!.items.map((it, i) => (
                    <div key={it.id ?? i} className="dato"><span className="dato__label">{it.descripcion}</span><span className="dato__valor">{n(it.cantidad)} {it.unidad_medida ?? ''}{n(it.peso) ? ` · ${n(it.peso)} kg` : ''}</span></div>
                  ))}
                </div>
              </div>
            )}
            {(g.apisunat_pdf_url || g.apisunat_xml_url || g.apisunat_cdr_url) && (
              <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
                {g.apisunat_pdf_url && <a className="btn btn--secondary btn--sm" href={g.apisunat_pdf_url} target="_blank" rel="noreferrer">PDF</a>}
                {g.apisunat_xml_url && <a className="btn btn--secondary btn--sm" href={g.apisunat_xml_url} target="_blank" rel="noreferrer">XML</a>}
                {g.apisunat_cdr_url && <a className="btn btn--secondary btn--sm" href={g.apisunat_cdr_url} target="_blank" rel="noreferrer">CDR</a>}
              </div>
            )}
          </div>
        )}
      </Sheet>

      <GuiaFormSheet key={formKey} open={formAbierto} onClose={() => setFormAbierto(false)} tipo={tipo} edicion={edicion} />

      <ConfirmSheet open={!!porEliminar} onClose={() => !ocupado && setPorEliminar(null)} loading={ocupado}
        title={`¿Eliminar el borrador ${porEliminar?.numero_guia ?? ''}?`} message="Solo se pueden eliminar guías que aún no se emitieron a SUNAT." confirmLabel="Eliminar"
        onConfirm={async () => { if (porEliminar) await ejecutar(() => api(`${cfg.ruta}/${porEliminar.id}`, { method: 'DELETE' }), 'Borrador eliminado', true); setPorEliminar(null); }} />
    </Page>
  );
}
