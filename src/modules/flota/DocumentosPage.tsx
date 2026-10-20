import './flota.css';
import '../mantenimiento/mant.css';
import './disponibilidad.css';
import './documentos.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Briefcase, CircleAlert, Clock, Download, FileSpreadsheet, FileText, Plus, RefreshCw, SlidersHorizontal, Wrench } from 'lucide-react';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Button, PageLoader } from '../../core/ui/Button';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ChoiceChips } from '../../core/ui/Chips';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { agruparEmpresas, claveEmpresa } from '../../core/lib/empresa';
import { haptic } from '../../core/lib/haptics';
import { compartirDocumento, eliminarDocumento, urlTemporalDocumento, useVehiculosFlota } from './api';
import { DocumentoFormulario } from './DocumentoFormulario';
import { DocExpediente, type EliminarDocumento, type FilaExpediente } from './DocExpediente';
import { DocMatriz } from './DocMatriz';
import { DocCalendario } from './DocCalendario';
import { ConfigurarPlacasSheet, guardarSeleccion, leerSeleccion } from './ConfigurarPlacasSheet';
import { ImportarDocumentosSheet } from './ImportarDocumentosSheet';
import { descargarPlantilla } from './documentosExcel';
import { grupoDe, metaDeVehiculo, type DocPersonalizado } from './docsEstado';

type Vista = 'expediente' | 'matriz' | 'calendario';
type Grupo = 'todos' | 'vigente' | 'alerta' | 'vencido' | 'sin';
interface Formulario { placa: string | null; prefijo: string | null; personalizado: DocPersonalizado | null }

const VISTAS: Array<{ value: Vista; label: string }> = [
  { value: 'expediente', label: 'Expediente' }, { value: 'matriz', label: 'Matriz general' }, { value: 'calendario', label: 'Calendario' },
];

// Documentos de la flota: estado de cada unidad, expediente, matriz de vencimientos y calendario
export function DocumentosPage() {
  const { data, isLoading, isError, error, isFetching } = useVehiculosFlota();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [vista, setVista] = useState<Vista>('expediente');
  const [empresa, setEmpresa] = useState('TODAS');
  const [filtrando, setFiltrando] = useState(false);
  const [grupo, setGrupo] = useState<Grupo>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [placa, setPlaca] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  // Placas que se ven (null = todas). Se elige en el configurador y queda en este dispositivo.
  const [seleccion, setSeleccion] = useState<Set<string> | null>(leerSeleccion);
  const [configurando, setConfigurando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [aEliminar, setAEliminar] = useState<EliminarDocumento | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const puedeEditar = can('docs_flota.crear', 'docs_flota.editar');

  const vehiculos = data ?? [];
  const empresas = useMemo(() => agruparEmpresas(vehiculos.map(v => v.empresa)), [vehiculos]);
  const todas = useMemo<FilaExpediente[]>(
    () => vehiculos.map(v => ({ v, m: metaDeVehiculo(v) })).sort((a, b) => a.v.placa.localeCompare(b.v.placa)),
    [vehiculos],
  );
  const delEmpresa = useMemo(
    () => todas.filter(f => (!seleccion || seleccion.has(f.v.placa)) && (empresa === 'TODAS' || claveEmpresa(f.v.empresa) === empresa)),
    [todas, empresa, seleccion],
  );
  const opcionesPlacas = useMemo(() => todas.map(f => ({ placa: f.v.placa, detalle: [f.v.tipo, f.v.empresa].filter(Boolean).join(' · ') })), [todas]);
  const aplicarSeleccion = (s: Set<string> | null) => { setSeleccion(s); guardarSeleccion(s); };

  const cifras = useMemo(() => {
    const c = { total: delEmpresa.length, vigente: 0, alerta: 0, vencido: 0, sin: 0 };
    for (const f of delEmpresa) c[grupoDe(f.m)]++;
    return c;
  }, [delEmpresa]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return delEmpresa.filter(f =>
      (grupo === 'todos' || grupoDe(f.m) === grupo)
      && (!q || [f.v.placa, f.v.tipo, f.v.marca, f.v.chasis].some(t => String(t ?? '').toUpperCase().includes(q))));
  }, [delEmpresa, grupo, busqueda]);

  const aviso = (err: unknown) => toast(errorMessage(err), 'error');
  const verArchivo = (url: string) => {
    haptic('selection');
    urlTemporalDocumento(url).then(u => window.open(u, '_blank', 'noopener,noreferrer')).catch(aviso);
  };
  const compartir = (url: string, titulo: string, p: string) => {
    haptic('selection');
    compartirDocumento(url, titulo, p).catch(aviso);
  };
  const refrescar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['flota', 'vehiculos'] }),
    qc.invalidateQueries({ queryKey: ['flota', 'historial-docs'] }),
  ]);
  const cerrarFormulario = () => {
    setFormulario(null);
    refrescar();
  };
  const confirmarEliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await eliminarDocumento({ placa: aEliminar.placa, tipoKey: aEliminar.tipoKey, urlS3: aEliminar.url });
      haptic('success');
      toast(`${aEliminar.titulo} de ${aEliminar.placa} eliminado`);
      setAEliminar(null);
      await refrescar();
    } catch (err) { aviso(err); }
    finally { setEliminando(false); }
  };

  const kpis: Array<{ clave: Grupo; label: string; valor: number; tono: string; icono: React.ReactNode }> = [
    { clave: 'todos', label: 'Flota total', valor: cifras.total, tono: 'blue', icono: <Briefcase size={18} strokeWidth={1.9} /> },
    { clave: 'vigente', label: 'Vigentes', valor: cifras.vigente, tono: 'green', icono: <Clock size={18} strokeWidth={1.9} /> },
    { clave: 'alerta', label: 'En alerta', valor: cifras.alerta, tono: 'amber', icono: <Wrench size={18} strokeWidth={1.9} /> },
    { clave: 'vencido', label: 'Vencidos', valor: cifras.vencido, tono: 'red', icono: <CircleAlert size={18} strokeWidth={1.9} /> },
    { clave: 'sin', label: 'Sin documentos', valor: cifras.sin, tono: 'ink', icono: <FileText size={18} strokeWidth={1.9} /> },
  ];

  return (
    <Page wide fill>
      <PageHeader
        eyebrow="Flota"
        title="Documentos de flota"
        subtitle="Control y gestión de documentación vehicular"
        actions={
          <>
            <Button variant="plain" className="btn--icono btn--icono-acento" icon={<RefreshCw size={18} />} aria-label="Actualizar" title="Actualizar"
              disabled={isFetching} onClick={() => qc.invalidateQueries({ queryKey: ['flota', 'vehiculos'] })} />
            <Button variant="plain" className="btn--icono btn--icono-acento" icon={<SlidersHorizontal size={18} />} aria-label="Configurar placas"
              title={seleccion ? `Placas a mostrar: ${seleccion.size} de ${todas.length}` : 'Configurar placas a mostrar'} onClick={() => setConfigurando(true)} />
            {seleccion && <span className="doc-conf__insignia" title="Hay un filtro de placas activo">{seleccion.size}/{todas.length}</span>}
            <MenuOtros opciones={[
              { label: 'Descargar plantilla', detalle: 'Excel con las columnas de importación', icon: <Download size={17} />, onSelect: () => descargarPlantilla().catch(aviso) },
              puedeEditar && { label: 'Importar desde Excel', detalle: 'Crea placas nuevas y actualiza documentos', icon: <FileSpreadsheet size={17} />, onSelect: () => setImportando(true) },
            ]} />
            {puedeEditar && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ placa: null, prefijo: null, personalizado: null })}>Nuevo documento</Button>
            )}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div className="doc-pagina">
          <div className="disp-kpis">
            {kpis.map(k => (
              <button key={k.clave} type="button" className={`disp-kpi pressable disp-kpi--${k.tono === 'amber' ? 'amber' : k.tono}`}
                aria-pressed={grupo === k.clave}
                onClick={() => { haptic('selection'); setGrupo(g => (g === k.clave && k.clave !== 'todos' ? 'todos' : k.clave)); }}>
                <span>
                  <span className="disp-kpi__label">{k.label}</span>
                  <AnimatedNumber value={k.valor} className="disp-kpi__valor t-numeric" />
                </span>
                <span className="disp-kpi__icono" aria-hidden>{k.icono}</span>
              </button>
            ))}
          </div>

          <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Buscar placa, tipo o marca…"
            activos={(empresa !== 'TODAS' ? 1 : 0) + (grupo !== 'todos' ? 1 : 0)} onAbrirFiltros={() => setFiltrando(true)}>
            <SegmentedControl label="Vista" value={vista} onChange={setVista} options={VISTAS} />
          </BarraFiltros>
          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={(empresa !== 'TODAS' ? 1 : 0) + (grupo !== 'todos' ? 1 : 0)}
            onLimpiar={() => { setEmpresa('TODAS'); setGrupo('todos'); }} resultado={filas.length} unidad="documento">
            <GrupoFiltro titulo="Empresa">
              <ChoiceChips label="Empresa" value={empresa} onChange={setEmpresa} options={[{ value: 'TODAS', label: 'Todas' }, ...empresas.map(e => ({ value: e.clave, label: e.nombre }))]} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Estado del documento">
              <ChoiceChips label="Estado del documento" value={grupo} onChange={v => setGrupo(v as Grupo)} options={[
                { value: 'todos', label: 'Todos' }, { value: 'vigente', label: 'Vigentes' }, { value: 'alerta', label: 'En alerta' }, { value: 'vencido', label: 'Vencidos' }, { value: 'sin', label: 'Sin documentos' },
              ]} />
            </GrupoFiltro>
          </HojaFiltros>

          {vista === 'expediente' && (
            <DocExpediente filas={filas} placa={placa} onElegir={setPlaca} puedeEditar={puedeEditar}
              onCargar={(p, prefijo) => setFormulario({ placa: p, prefijo, personalizado: null })}
              onEditarPersonalizado={(p, doc) => setFormulario({ placa: p, prefijo: null, personalizado: doc })}
              onVerArchivo={verArchivo} onCompartir={compartir} onEliminar={setAEliminar} />
          )}
          {vista === 'matriz' && <DocMatriz filas={filas} />}
          {vista === 'calendario' && (
            <DocCalendario filas={filas} onElegir={p => { setPlaca(p); setVista('expediente'); }} />
          )}
        </div>
      )}

      <DocumentoFormulario open={!!formulario} placa={formulario?.placa ?? null} prefijo={formulario?.prefijo ?? null}
        personalizado={formulario?.personalizado ?? null} usuario={user?.name ?? ''} onClose={cerrarFormulario} />

      <ConfigurarPlacasSheet open={configurando} onClose={() => setConfigurando(false)} opciones={opcionesPlacas} seleccion={seleccion} onAplicar={aplicarSeleccion} />
      <ImportarDocumentosSheet open={importando} onClose={() => { setImportando(false); refrescar(); }} placasConocidas={todas.map(f => f.v.placa)} />

      <ConfirmSheet open={!!aEliminar} onClose={() => !eliminando && setAEliminar(null)} onConfirm={confirmarEliminar}
        title={`Eliminar ${aEliminar?.titulo ?? 'documento'}`} loading={eliminando} confirmLabel="Eliminar"
        message={`Se borran los datos de ${aEliminar?.titulo ?? 'este documento'} en ${aEliminar?.placa ?? 'la unidad'} y su archivo digital. El historial de ese tipo también se elimina.`} />
    </Page>
  );
}
