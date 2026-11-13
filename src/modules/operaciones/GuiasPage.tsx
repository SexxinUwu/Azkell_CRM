import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import './seguimiento.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileCode2, FileText, Link2, Link2Off, Plus, RefreshCw, Search, SearchX, Send } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros, GrupoFiltro, HojaFiltros, ListaEleccion } from '../../core/ui/FiltrosListado';
import { IconoFila } from '../../core/ui/IconoFila';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { ESTADO_SUNAT, ETIQUETA_ESTADO_GUIA, ETIQUETA_ORIGEN, fechaGuia, fmtKg, kgDe, useGuias, type EstadoGuia, type Guia } from './guiasApi';
import { GuiaFicha } from './GuiaFicha';
import { GuiaRegistrarSheet } from './GuiaRegistrarSheet';
import { GrtSheet } from './GrtSheet';
import { PastillaGuia } from './PastillaGuia';
import { GuiaVincularSheet } from './GuiaVincularSheet';
import { useUbigeos } from './ubigeos';

type Seccion = 'REMITENTE' | 'TRANSPORTISTA';

const COLUMNAS_REMITENTE: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Acciones', ancho: 100, minimo: 90 },
  { id: 'estado', titulo: 'Estado', ancho: 110 },
  { id: 'guia', titulo: 'Guía', ancho: 150, minimo: 120 },
  { id: 'origen', titulo: 'Origen', ancho: 150 },
  { id: 'emision', titulo: 'Emisión', ancho: 105 },
  { id: 'remitente', titulo: 'Remitente', ancho: 220, minimo: 140 },
  { id: 'destinatario', titulo: 'Destinatario', ancho: 220, minimo: 140 },
  { id: 'ruta', titulo: 'Partida → llegada', ancho: 220, minimo: 140 },
  { id: 'peso', titulo: 'Peso', ancho: 110, alinear: 'right' },
  { id: 'servicio', titulo: 'Servicio', ancho: 150 },
  { id: 'grt', titulo: 'GRE Transportista', ancho: 190 },
];

const COLUMNAS_TRANSPORTISTA: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Documentos', ancho: 140, minimo: 130 },
  { id: 'sunat', titulo: 'SUNAT', ancho: 110 },
  { id: 'guia', titulo: 'Guía', ancho: 150, minimo: 120 },
  { id: 'ambiente', titulo: 'Ambiente', ancho: 100 },
  { id: 'emision', titulo: 'Emisión', ancho: 105 },
  { id: 'remitente', titulo: 'Remitente', ancho: 200, minimo: 140 },
  { id: 'destinatario', titulo: 'Destinatario', ancho: 200, minimo: 140 },
  { id: 'ruta', titulo: 'Partida → llegada', ancho: 200, minimo: 140 },
  { id: 'peso', titulo: 'Peso', ancho: 110, alinear: 'right' },
  { id: 'unidad', titulo: 'Tracto / carreta', ancho: 150 },
  { id: 'conductor', titulo: 'Conductor', ancho: 170 },
  { id: 'viaje', titulo: 'Viaje', ancho: 130 },
  { id: 'cubre', titulo: 'Cubre las guías', ancho: 220, minimo: 140 },
];

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SECCION_KEY = 'fleet_guias_seccion';
const seccionGuardada = (): Seccion => { try { return localStorage.getItem(SECCION_KEY) === 'TRANSPORTISTA' ? 'TRANSPORTISTA' : 'REMITENTE'; } catch { return 'REMITENTE'; } };
const estadoSunat = (g: Guia) => (g.origen === 'EMITIDA' ? (g.apisunat_status && ESTADO_SUNAT[g.apisunat_status] ? g.apisunat_status : 'ERROR_APISUNAT') : '');

// Operaciones › Guías de remisión, en dos secciones: las GRE de remitente (las que entregan los clientes, que se vinculan a un servicio)
// y las GRE de transportista (las que emitimos nosotros por APISUNAT, con su estado en SUNAT y sus documentos).
export function GuiasPage() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const guias = useGuias();
  const ubigeos = useUbigeos();
  const [seccion, setSeccion] = useState<Seccion>(seccionGuardada);
  const [busqueda, setBusqueda] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  // Filtros de remitentes
  const [estado, setEstado] = useState('');
  const [origen, setOrigen] = useState('');
  const [grt, setGrt] = useState('');
  // Filtros de transportistas
  const [sunat, setSunat] = useState('');
  const [ambiente, setAmbiente] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [vincular, setVincular] = useState<Guia | null>(null);
  const [emitir, setEmitir] = useState<Guia | null>(null);
  const [abiertaId, setAbiertaId] = useState<number | null>(null);
  const [sincronizando, setSincronizando] = useState<number | 'todas' | null>(null);
  const datos = guias.data ?? [];
  const puedeCrear = can('op_guias_remision.crear', 'op_guias_remision.editar');
  const puedeEditar = can('op_guias_remision.editar', 'op_guias_remision.crear');

  const remitentes = useMemo(() => datos.filter(g => g.tipo === 'REMITENTE'), [datos]);
  const transportistas = useMemo(() => datos.filter(g => g.tipo === 'TRANSPORTISTA'), [datos]);
  const esRemitente = seccion === 'REMITENTE';
  const lista = esRemitente ? remitentes : transportistas;

  const cambiarSeccion = (s: Seccion) => {
    setSeccion(s); setBusqueda('');
    try { localStorage.setItem(SECCION_KEY, s); } catch { /* sin almacenamiento */ }
  };

  const distrito = (u?: string | null) => (u ? (ubigeos.data ?? []).find(x => x.codigo === u)?.distrito ?? '' : '');
  const tramo = (g: Guia) => [distrito(g.partida_ubigeo) || g.partida_direccion, distrito(g.llegada_ubigeo) || g.llegada_direccion].filter(Boolean).join(' → ') || '—';

  const visibles = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return lista.filter(g => {
      if (esRemitente) {
        if (estado && g.estado !== estado) return false;
        if (origen && g.origen !== origen) return false;
        if (grt === 'CON' && !g.grt_numero) return false;
        if (grt === 'SIN' && (g.grt_numero || g.estado !== 'VINCULADA')) return false;
      } else {
        if (sunat && estadoSunat(g) !== sunat) return false;
        if (ambiente && (g.modo_emision ?? '') !== ambiente) return false;
      }
      return !t || sinTildes(`${g.numero_completo} ${g.remitente_nombre ?? ''} ${g.destinatario_nombre ?? ''} ${g.placa ?? ''} ${g.orden_servicio_codigo ?? ''} ${g.remitente_ruc ?? ''} ${g.viaje ?? ''} ${g.conductor_nombre ?? ''} ${g.guias_incluidas ?? ''} ${g.grt_numero ?? ''}`).includes(t);
    });
  }, [lista, esRemitente, busqueda, estado, origen, grt, sunat, ambiente]);

  const activos = (esRemitente ? [estado, origen, grt] : [sunat, ambiente]).filter(Boolean).length;
  const limpiar = () => { setEstado(''); setOrigen(''); setGrt(''); setSunat(''); setAmbiente(''); };
  const cuenta = (f: (g: Guia) => boolean) => lista.filter(f).length;
  const sinVincular = remitentes.filter(g => g.estado === 'REGISTRADA').length;
  const sinGrt = remitentes.filter(g => g.estado === 'VINCULADA' && !g.grt_numero).length;
  const pendientes = transportistas.filter(g => g.apisunat_status === 'PENDIENTE');

  async function sincronizar(g: Guia) {
    setSincronizando(g.id);
    try {
      const r = await api<{ ok?: boolean; error?: string; message?: string }>(`/operaciones/gre/guias/${g.id}/sincronizar`, { method: 'POST', body: {} });
      if (r.ok === false) throw new Error(r.error || 'No se pudo consultar a APISUNAT');
      haptic('success'); toast(r.message || 'Estado actualizado');
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setSincronizando(null); }
  }

  async function sincronizarPendientes() {
    setSincronizando('todas');
    let ok = 0;
    try {
      for (const g of pendientes) {
        const r = await api<{ ok?: boolean }>(`/operaciones/gre/guias/${g.id}/sincronizar`, { method: 'POST', body: {} });
        if (r.ok !== false) ok++;
      }
      haptic('success'); toast(pendientes.length ? `Se actualizaron ${ok} de ${pendientes.length} guías` : 'No hay guías pendientes en SUNAT');
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setSincronizando(null); }
  }

  const abrir = (url?: string | null) => { if (url) window.open(url, '_blank', 'noopener'); };
  // El PDF con el diseño de la empresa (Sistema › Plantilla de guías); la sesión viaja por cookie
  const verPdfPropio = (g: Guia) => window.open(`/api/operaciones/gre/guias/${g.id}/pdf-propio`, '_blank', 'noopener');

  const subtitulo = guias.isLoading ? 'Cargando…' : esRemitente
    ? `${remitentes.length} ${remitentes.length === 1 ? 'guía de remitente' : 'guías de remitente'}${sinVincular ? ` · ${sinVincular} sin vincular` : ''}${sinGrt ? ` · ${sinGrt} sin GRE Transportista` : ''}`
    : `${transportistas.length} ${transportistas.length === 1 ? 'guía de transportista' : 'guías de transportista'}${pendientes.length ? ` · ${pendientes.length} pendientes en SUNAT` : ''}`;

  return (
    <Page>
      <PageHeader eyebrow="Operaciones" title="Guías de remisión" subtitle={subtitulo}
        actions={esRemitente
          ? (puedeCrear ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setRegistrando(true)}>Registrar guía</Button> : undefined)
          : <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={sincronizarPendientes} loading={sincronizando === 'todas'} disabled={!pendientes.length}>Actualizar estados</Button>} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <SegmentedControl block label="Sección de guías" value={seccion} onChange={cambiarSeccion}
          options={[{ value: 'REMITENTE', label: `GRE Remitente · ${remitentes.length}` }, { value: 'TRANSPORTISTA', label: `GRE Transportista · ${transportistas.length}` }]} />

        <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder={esRemitente ? 'Número, remitente, destinatario, placa o servicio' : 'Número, cliente, placa, conductor o viaje'} activos={activos} onAbrirFiltros={() => setFiltrando(true)} />
        <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos} onLimpiar={limpiar} resultado={visibles.length} unidad="guía">
          {esRemitente ? (
            <>
              <GrupoFiltro titulo="Estado">
                <ListaEleccion value={estado} onChange={setEstado} opciones={[{ value: '', label: 'Todos', count: lista.length }, ...(Object.keys(ETIQUETA_ESTADO_GUIA) as EstadoGuia[]).map(e => ({ value: e as string, label: ETIQUETA_ESTADO_GUIA[e], count: cuenta(g => g.estado === e) }))]} />
              </GrupoFiltro>
              <GrupoFiltro titulo="Origen">
                <ListaEleccion value={origen} onChange={setOrigen} opciones={[{ value: '', label: 'Todas', count: lista.length }, ...(Object.keys(ETIQUETA_ORIGEN) as (keyof typeof ETIQUETA_ORIGEN)[]).map(o => ({ value: o as string, label: ETIQUETA_ORIGEN[o], count: cuenta(g => g.origen === o) }))]} />
              </GrupoFiltro>
              <GrupoFiltro titulo="Nuestra GRE Transportista">
                <ListaEleccion value={grt} onChange={setGrt} opciones={[
                  { value: '', label: 'Todas', count: lista.length },
                  { value: 'CON', label: 'Ya emitida', count: cuenta(g => !!g.grt_numero) },
                  { value: 'SIN', label: 'Falta emitir (vinculadas)', count: cuenta(g => g.estado === 'VINCULADA' && !g.grt_numero) },
                ]} />
              </GrupoFiltro>
            </>
          ) : (
            <>
              <GrupoFiltro titulo="Estado en SUNAT">
                <ListaEleccion value={sunat} onChange={setSunat} opciones={[{ value: '', label: 'Todos', count: lista.length }, ...Object.keys(ESTADO_SUNAT).map(e => ({ value: e, label: ESTADO_SUNAT[e].texto, count: cuenta(g => estadoSunat(g) === e) }))]} />
              </GrupoFiltro>
              <GrupoFiltro titulo="Ambiente">
                <ListaEleccion value={ambiente} onChange={setAmbiente} opciones={[
                  { value: '', label: 'Todos', count: lista.length },
                  { value: 'produccion', label: 'Producción', count: cuenta(g => g.modo_emision === 'produccion') },
                  { value: 'prueba', label: 'Prueba', count: cuenta(g => g.modo_emision === 'prueba') },
                ]} />
              </GrupoFiltro>
            </>
          )}
        </HojaFiltros>

        {guias.isLoading ? <PageLoader /> : guias.isError ? <Notice tone="error">{errorMessage(guias.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || activos ? <SearchX size={22} /> : <FileText size={22} />} title={busqueda || activos ? 'Sin coincidencias' : esRemitente ? 'Sin guías de remitente todavía' : 'Aún no emitimos guías de transportista'}>
            {busqueda || activos ? 'Prueba con otra búsqueda o quita los filtros.'
              : esRemitente ? (puedeCrear ? 'Sube la guía que te dio el cliente con «Registrar guía»: se leen los datos y solo confirmas.' : 'Aún no hay guías registradas.')
                : 'Abre una guía de remitente ya vinculada a un servicio y pulsa «GRE Transportista» para emitir la nuestra.'}
          </EmptyState>
        ) : esRemitente ? (
          <TablaRedimensionable id="gre-guias-remitente-v1" columnas={COLUMNAS_REMITENTE} ariaLabel="Guías de remitente" className="tabla-redim--compacta">
            {visibles.map(g => (
              <tr key={g.id} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setAbiertaId(g.id); }}>
                <Celda>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {puedeEditar && g.estado === 'REGISTRADA' && <IconoFila texto="Vincular a un servicio" tono="azul" icono={<Link2 size={15} />} onClick={() => setVincular(g)} />}
                    {puedeEditar && g.estado === 'VINCULADA' && <IconoFila texto="Cambiar de servicio" tono="ambar" icono={<Link2Off size={15} />} onClick={() => setAbiertaId(g.id)} />}
                    {puedeEditar && g.estado === 'VINCULADA' && g.origen === 'RECIBIDA' && !g.grt_numero && <IconoFila texto="Emitir GRE Transportista" tono="verde" icono={<Send size={15} />} onClick={() => setEmitir(g)} />}
                  </span>
                </Celda>
                <Celda><PastillaGuia estado={g.estado} guia={g} /></Celda>
                <Celda mono>{g.numero_completo}</Celda>
                <Celda>{ETIQUETA_ORIGEN[g.origen]}</Celda>
                <Celda mono>{fechaGuia(g.fecha_emision)}</Celda>
                <Celda>{g.remitente_nombre || g.remitente_ruc || '—'}</Celda>
                <Celda>{g.destinatario_nombre || g.destinatario_doc || '—'}</Celda>
                <Celda>{tramo(g)}</Celda>
                <Celda alinear="right" mono>{kgDe(g.peso_kg) > 0 ? fmtKg(g.peso_kg) : '—'}</Celda>
                <Celda mono>{g.orden_servicio_codigo || '—'}</Celda>
                <Celda>
                  {g.grt_numero
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem' }}>{g.grt_numero}</span>{g.grt_status && ESTADO_SUNAT[g.grt_status] && <span className="t-footnote" style={{ color: `var(--${ESTADO_SUNAT[g.grt_status].tono}-ink)` }}>{ESTADO_SUNAT[g.grt_status].texto}</span>}</span>
                    : g.estado === 'VINCULADA' && g.origen === 'RECIBIDA' ? <span className="t-footnote" style={{ color: 'var(--amber-ink)' }}>Falta emitir</span> : '—'}
                </Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        ) : (
          <TablaRedimensionable id="gre-guias-transportista-v1" columnas={COLUMNAS_TRANSPORTISTA} ariaLabel="Guías de transportista" className="tabla-redim--compacta">
            {visibles.map(g => (
              <tr key={g.id} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setAbiertaId(g.id); }}>
                <Celda>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {g.apisunat_status && g.apisunat_status !== 'ERROR_APISUNAT' && <IconoFila texto="Ver el PDF con nuestro diseño" tono="azul" icono={<FileText size={15} />} onClick={() => verPdfPropio(g)} />}
                    {g.pdf_url && <IconoFila texto="PDF de APISUNAT" tono="rojo" icono={<FileText size={15} />} onClick={() => abrir(g.pdf_url)} />}
                    {g.xml_url && <IconoFila texto="Descargar el XML firmado" tono="violeta" icono={<FileCode2 size={15} />} onClick={() => abrir(g.xml_url)} />}
                    {g.cdr_url && <IconoFila texto="Constancia de recepción de SUNAT" tono="verde" icono={<CheckCircle2 size={15} />} onClick={() => abrir(g.cdr_url)} />}
                    {puedeEditar && g.apisunat_status && g.apisunat_status !== 'ERROR_APISUNAT' && g.apisunat_status !== 'ACEPTADO' && <IconoFila texto="Actualizar estado en SUNAT" tono="azul" icono={<Search size={15} />} cargando={sincronizando === g.id} onClick={() => void sincronizar(g)} />}
                  </span>
                </Celda>
                <Celda><PastillaGuia estado={g.estado} guia={g} /></Celda>
                <Celda mono>{g.numero_completo}</Celda>
                <Celda>{g.modo_emision === 'produccion' ? 'Producción' : g.modo_emision === 'prueba' ? 'Prueba' : '—'}</Celda>
                <Celda mono>{fechaGuia(g.fecha_emision)}</Celda>
                <Celda>{g.remitente_nombre || g.remitente_ruc || '—'}</Celda>
                <Celda>{g.destinatario_nombre || g.destinatario_doc || '—'}</Celda>
                <Celda>{tramo(g)}</Celda>
                <Celda alinear="right" mono>{kgDe(g.peso_kg) > 0 ? fmtKg(g.peso_kg) : '—'}</Celda>
                <Celda mono>{[g.placa, g.placa_carreta].filter(Boolean).join(' / ') || '—'}</Celda>
                <Celda>{g.conductor_nombre || '—'}</Celda>
                <Celda mono>{g.viaje || '—'}</Celda>
                <Celda mono>{g.guias_incluidas || '—'}</Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </div>

      <GuiaRegistrarSheet open={registrando} onClose={() => setRegistrando(false)} onRegistrada={g => { setRegistrando(false); if (g) setVincular(g); }} />
      <GuiaVincularSheet guia={vincular} onClose={() => setVincular(null)} />
      <GrtSheet guia={emitir} onClose={() => setEmitir(null)} />
      <GuiaFicha id={abiertaId} onClose={() => setAbiertaId(null)} puedeEditar={puedeEditar} onVincular={g => { setAbiertaId(null); setVincular(g); }} />
    </Page>
  );
}
