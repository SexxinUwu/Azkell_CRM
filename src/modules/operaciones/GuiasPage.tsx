import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import './seguimiento.css';
import { useMemo, useState } from 'react';
import { FileText, Link2, Link2Off, Plus, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros, GrupoFiltro, HojaFiltros, ListaEleccion } from '../../core/ui/FiltrosListado';
import { IconoFila } from '../../core/ui/IconoFila';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { ETIQUETA_ESTADO_GUIA, ETIQUETA_ORIGEN, ETIQUETA_TIPO, fechaGuia, fmtKg, kgDe, useGuias, type EstadoGuia, type Guia } from './guiasApi';
import { GuiaFicha } from './GuiaFicha';
import { GuiaRegistrarSheet } from './GuiaRegistrarSheet';
import { PastillaGuia } from './PastillaGuia';
import { GuiaVincularSheet } from './GuiaVincularSheet';
import { useUbigeos } from './ubigeos';

const COLUMNAS: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Acciones', ancho: 100, minimo: 90 },
  { id: 'estado', titulo: 'Estado', ancho: 110 },
  { id: 'guia', titulo: 'Guía', ancho: 150, minimo: 120 },
  { id: 'origen', titulo: 'Origen', ancho: 150 },
  { id: 'tipo', titulo: 'Tipo', ancho: 120 },
  { id: 'emision', titulo: 'Emisión', ancho: 105 },
  { id: 'remitente', titulo: 'Remitente', ancho: 220, minimo: 140 },
  { id: 'destinatario', titulo: 'Destinatario', ancho: 220, minimo: 140 },
  { id: 'ruta', titulo: 'Partida → llegada', ancho: 220, minimo: 140 },
  { id: 'peso', titulo: 'Peso', ancho: 110, alinear: 'right' },
  { id: 'servicio', titulo: 'Servicio', ancho: 150 },
];

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Operaciones › Guías de remisión: las GRE que entregan los clientes (y, más adelante, las que emitimos). Cada guía se vincula a un servicio y su peso pasa al servicio y al viaje.
export function GuiasPage() {
  const { can } = useAuth();
  const guias = useGuias();
  const ubigeos = useUbigeos();
  const [busqueda, setBusqueda] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  const [origen, setOrigen] = useState('');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [vincular, setVincular] = useState<Guia | null>(null);
  const [abiertaId, setAbiertaId] = useState<number | null>(null);
  const datos = guias.data ?? [];
  const puedeCrear = can('op_guias_remision.crear', 'op_guias_remision.editar');
  const puedeEditar = can('op_guias_remision.editar', 'op_guias_remision.crear');

  const distrito = (u?: string | null) => (u ? (ubigeos.data ?? []).find(x => x.codigo === u)?.distrito ?? '' : '');
  const tramo = (g: Guia) => [distrito(g.partida_ubigeo) || g.partida_direccion, distrito(g.llegada_ubigeo) || g.llegada_direccion].filter(Boolean).join(' → ') || '—';

  const visibles = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return datos.filter(g => {
      if (origen && g.origen !== origen) return false;
      if (tipo && g.tipo !== tipo) return false;
      if (estado && g.estado !== estado) return false;
      return !t || sinTildes(`${g.numero_completo} ${g.remitente_nombre ?? ''} ${g.destinatario_nombre ?? ''} ${g.placa ?? ''} ${g.orden_servicio_codigo ?? ''} ${g.remitente_ruc ?? ''}`).includes(t);
    });
  }, [datos, busqueda, origen, tipo, estado]);
  const activos = [origen, tipo, estado].filter(Boolean).length;
  const limpiar = () => { setOrigen(''); setTipo(''); setEstado(''); };
  const sinVincular = datos.filter(g => g.estado === 'REGISTRADA').length;
  const cuenta = (f: (g: Guia) => boolean) => datos.filter(f).length;

  return (
    <Page>
      <PageHeader eyebrow="Operaciones" title="Guías de remisión"
        subtitle={guias.isLoading ? 'Cargando…' : `${datos.length} ${datos.length === 1 ? 'guía' : 'guías'}${sinVincular ? ` · ${sinVincular} sin vincular a un servicio` : ''}`}
        actions={puedeCrear ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setRegistrando(true)}>Registrar guía</Button> : undefined} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Número, remitente, destinatario, placa o servicio" activos={activos} onAbrirFiltros={() => setFiltrando(true)} />
        <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos} onLimpiar={limpiar} resultado={visibles.length} unidad="guía">
          <GrupoFiltro titulo="Origen">
            <ListaEleccion value={origen} onChange={setOrigen} opciones={[{ value: '', label: 'Todas', count: datos.length }, ...(Object.keys(ETIQUETA_ORIGEN) as (keyof typeof ETIQUETA_ORIGEN)[]).map(o => ({ value: o as string, label: ETIQUETA_ORIGEN[o], count: cuenta(g => g.origen === o) }))]} />
          </GrupoFiltro>
          <GrupoFiltro titulo="Tipo de guía">
            <ListaEleccion value={tipo} onChange={setTipo} opciones={[{ value: '', label: 'Todas', count: datos.length }, ...(Object.keys(ETIQUETA_TIPO) as (keyof typeof ETIQUETA_TIPO)[]).map(t => ({ value: t as string, label: `GRE ${ETIQUETA_TIPO[t]}`, count: cuenta(g => g.tipo === t) }))]} />
          </GrupoFiltro>
          <GrupoFiltro titulo="Estado">
            <ListaEleccion value={estado} onChange={setEstado} opciones={[{ value: '', label: 'Todos', count: datos.length }, ...(Object.keys(ETIQUETA_ESTADO_GUIA) as EstadoGuia[]).map(e => ({ value: e as string, label: ETIQUETA_ESTADO_GUIA[e], count: cuenta(g => g.estado === e) }))]} />
          </GrupoFiltro>
        </HojaFiltros>

        {guias.isLoading ? <PageLoader /> : guias.isError ? <Notice tone="error">{errorMessage(guias.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || activos ? <SearchX size={22} /> : <FileText size={22} />} title={busqueda || activos ? 'Sin coincidencias' : 'Sin guías todavía'}>
            {busqueda || activos ? 'Prueba con otra búsqueda o quita los filtros.' : puedeCrear ? 'Sube la guía que te dio el cliente con «Registrar guía»: se leen los datos y solo confirmas.' : 'Aún no hay guías registradas.'}
          </EmptyState>
        ) : (
          <TablaRedimensionable id="gre-guias-v1" columnas={COLUMNAS} ariaLabel="Guías de remisión" className="tabla-redim--compacta">
            {visibles.map(g => (
              <tr key={g.id} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setAbiertaId(g.id); }}>
                <Celda>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {puedeEditar && g.estado === 'REGISTRADA' && <IconoFila texto="Vincular a un servicio" tono="azul" icono={<Link2 size={15} />} onClick={() => setVincular(g)} />}
                    {puedeEditar && g.estado === 'VINCULADA' && <IconoFila texto="Cambiar de servicio" tono="ambar" icono={<Link2Off size={15} />} onClick={() => setAbiertaId(g.id)} />}
                  </span>
                </Celda>
                <Celda><PastillaGuia estado={g.estado} /></Celda>
                <Celda mono>{g.numero_completo}</Celda>
                <Celda>{ETIQUETA_ORIGEN[g.origen]}</Celda>
                <Celda>GRE {ETIQUETA_TIPO[g.tipo]}</Celda>
                <Celda mono>{fechaGuia(g.fecha_emision)}</Celda>
                <Celda>{g.remitente_nombre || g.remitente_ruc || '—'}</Celda>
                <Celda>{g.destinatario_nombre || g.destinatario_doc || '—'}</Celda>
                <Celda>{tramo(g)}</Celda>
                <Celda alinear="right" mono>{kgDe(g.peso_kg) > 0 ? fmtKg(g.peso_kg) : '—'}</Celda>
                <Celda mono>{g.orden_servicio_codigo || '—'}</Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </div>

      <GuiaRegistrarSheet open={registrando} onClose={() => setRegistrando(false)} onRegistrada={g => { setRegistrando(false); if (g) setVincular(g); }} />
      <GuiaVincularSheet guia={vincular} onClose={() => setVincular(null)} />
      <GuiaFicha id={abiertaId} onClose={() => setAbiertaId(null)} puedeEditar={puedeEditar} onVincular={g => { setAbiertaId(null); setVincular(g); }} />
    </Page>
  );
}
