import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, MessageCircle, Phone, Plus, SearchX, Upload } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { ChoiceChips } from '../../core/ui/Chips';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { Letras, letraDe } from '../../core/ui/Agenda';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { agruparEmpresas, claveEmpresa } from '../../core/lib/empresa';
import { exportarExcel } from '../../core/lib/excel';
import { coincide, eliminarConductor, useConductores, whatsapp, type Conductor } from './api';
import { ConductorFicha } from './ConductorFicha';
import { ConductorFormulario } from './ConductorFormulario';
import { ImportarConductores } from './ImportarConductores';
import { FotoConductor } from './FotoConductor';
import './conductores.css';
import '../almacen/proveedores.css'; // lista por letras compartida con Proveedores

/** Llamar y WhatsApp sin abrir la ficha */
function Contactar({ nombre, telefono }: { nombre: string; telefono: string }) {
  const tel = telefono.trim(); const wa = whatsapp(tel);
  if (!tel) return <span style={{ color: 'var(--label-3)' }}>—</span>;
  return (
    <span className="pv-fila__acciones" onClick={e => e.stopPropagation()}>
      <a className="pv-accion pv-accion--chica" href={`tel:${tel.replace(/\s/g, '')}`} aria-label={`Llamar a ${nombre}`}><Phone size={14} /></a>
      {wa && <a className="pv-accion pv-accion--chica pv-accion--wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${nombre}`}><MessageCircle size={14} /></a>}
    </span>
  );
}

// Estados del clásico: Activo, Cesado y Bloqueado (Inactivo se conserva para registros antiguos)
type FiltroEstado = 'todos' | 'activos' | 'cesados' | 'bloqueados' | 'inactivos';
const activo = (c: Conductor) => c.estado.toLowerCase() === 'activo';
const estadoDe = (c: Conductor) => c.estado.toLowerCase();

// Excel con las mismas columnas y formato que el clásico (Directorio_Personal): nombre en título, teléfono solo dígitos, TERCERO → 3ro.
const nombreTitulo = (s: string) => s.replace(/Ã'/g, 'Ñ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
const exportarConductores = (filas: Conductor[]) => exportarExcel('Directorio_Personal', 'Conductores',
  ['Nombre', 'Empresa', 'DNI', 'Licencia', 'Teléfono', 'Estado'],
  filas.map(c => [
    c.nombre ? nombreTitulo(c.nombre) : '',
    c.empresa.replace(/TERCERO/gi, '3ro'),
    c.dni,
    c.licencia,
    c.telefono.replace(/\D/g, ''),
    c.estado,
  ]));

const COLUMNAS: ColumnaTabla[] = [
  { id: 'nombre', titulo: 'Nombre', ancho: 300, minimo: 180 },
  { id: 'empresa', titulo: 'Empresa', ancho: 240, minimo: 140 },
  { id: 'dni', titulo: 'DNI', ancho: 110 },
  { id: 'licencia', titulo: 'Licencia', ancho: 130 },
  { id: 'telefono', titulo: 'Teléfono', ancho: 130 },
  { id: 'estado', titulo: 'Estado', ancho: 110, alinear: 'center' },
  { id: 'acciones', titulo: '', ancho: 100, alinear: 'center' },
];

// Directorio › Personal: consulta, alta, edición, importación y eliminación. Tabla en pantalla ancha y lista por letras en el celular.
export function ConductoresPage() {
  const { data, isLoading, isError, error } = useConductores();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const ancha = useMediaQuery('(min-width: 900px)');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [empresa, setEmpresa] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  const [abierto, setAbierto] = useState<Conductor | null>(null);
  const [formulario, setFormulario] = useState<{ conductor: Conductor | null } | null>(null);
  const [importando, setImportando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<Conductor | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const puedeCrear = can('cond.crear');
  const puedeEditar = can('cond.editar', 'cond.crear'); // la versión actual exige "crear" para guardar
  const puedeEliminar = can('cond.eliminar');

  const conductores = data ?? [];
  const activas = useMemo(() => conductores.filter(activo).length, [conductores]);
  // Empresas como filtro rápido: las que son la misma (aunque escritas distinto) cuentan como una
  const gruposEmpresa = useMemo(() => agruparEmpresas(conductores.map(c => c.empresa)), [conductores]);
  const nombreEmpresa = (e: string) => gruposEmpresa.find(g => g.clave === claveEmpresa(e))?.nombre ?? e;

  const visibles = useMemo(() => conductores.filter(c =>
    (estado === 'todos' || (estado === 'activos' ? activo(c) : estado === 'cesados' ? estadoDe(c) === 'cesado'
      : estado === 'bloqueados' ? estadoDe(c) === 'bloqueado' : estadoDe(c) === 'inactivo'))
    && (!empresa || claveEmpresa(empresa) === claveEmpresa(c.empresa))
    && coincide(c, busqueda),
  ), [conductores, estado, empresa, busqueda]);
  const filtrosActivos = (estado !== 'todos' ? 1 : 0) + (empresa ? 1 : 0);
  const limpiarFiltros = () => { setEstado('todos'); setEmpresa(''); };

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarConductor(porEliminar.id);
      toast(`${porEliminar.nombre} eliminado del directorio`);
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['conductores'] });
      setPorEliminar(null);
      setAbierto(null);
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setEliminando(false);
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Directorio"
        title="Personal"
        subtitle={isLoading ? 'Cargando…' : `${conductores.length} personas · ${activas} activas`}
        actions={
          <>
            <div className="acciones-iconos acciones-iconos--sinfondo" role="group" aria-label="Acciones del personal">
              <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--verde" data-tip="Exportar Excel"
                aria-label="Exportar Excel" icon={<FileSpreadsheet size={17} />}
                onClick={() => exportarConductores(visibles).catch(err => toast(errorMessage(err), 'error'))} />
              {puedeCrear && (
                <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--azul" data-tip="Importar desde Excel"
                  aria-label="Importar desde Excel" icon={<Upload size={17} />} onClick={() => setImportando(true)} />
              )}
            </div>
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ conductor: null })}>Nueva persona</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <>
          <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Nombre, DNI, licencia, empresa o teléfono"
            activos={filtrosActivos} onAbrirFiltros={() => setFiltrando(true)} />

          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={filtrosActivos} onLimpiar={limpiarFiltros} resultado={visibles.length} unidad="persona">
            <GrupoFiltro titulo="Estado">
              <ChoiceChips<FiltroEstado> label="Estado" value={estado} onChange={setEstado}
                options={[
                  { value: 'todos', label: 'Todos' }, { value: 'activos', label: 'Activos' }, { value: 'cesados', label: 'Cesados' }, { value: 'bloqueados', label: 'Bloqueados' },
                  ...(conductores.some(c => estadoDe(c) === 'inactivo') ? [{ value: 'inactivos' as const, label: 'Inactivos' }] : []),
                ]} />
            </GrupoFiltro>
            {gruposEmpresa.length > 1 && (
              <GrupoFiltro titulo="Empresa">
                <ChoiceChips label="Empresa" value={empresa} onChange={setEmpresa}
                  options={[{ value: '', label: 'Todas' }, ...gruposEmpresa.map(g => ({ value: g.nombre, label: g.nombre }))]} />
              </GrupoFiltro>
            )}
          </HojaFiltros>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="No hay personal con esos filtros">Prueba con otra búsqueda o quita los filtros.</EmptyState>
          ) : (
            ancha ? (
              <TablaRedimensionable id="directorio-personal" columnas={COLUMNAS} ariaLabel="Personal" altoMax="68vh">
                {visibles.map(c => (
                  <tr key={c.id} className="pv-tr" onClick={() => { haptic('selection'); setAbierto(c); }}>
                    <Celda><span className="pv-celda-nombre"><FotoConductor conductor={c} size={28} /><button type="button" className="oc-codigo">{c.nombre || 'Sin nombre'}</button></span></Celda>
                    <Celda>{c.empresa ? nombreEmpresa(c.empresa) : '—'}</Celda>
                    <Celda mono>{c.dni || '—'}</Celda>
                    <Celda mono>{c.licencia || '—'}</Celda>
                    <Celda mono>{c.telefono || '—'}</Celda>
                    <Celda alinear="center"><span className={`placa-estado placa-estado--${activo(c) ? 'on' : 'off'}`}>{c.estado}</span></Celda>
                    <Celda alinear="center">
                      <Contactar nombre={c.nombre} telefono={c.telefono} />
                    </Celda>
                  </tr>
                ))}
              </TablaRedimensionable>
            ) : (
              <Letras items={visibles} letra={c => letraDe(c.nombre)} fila={c => {
                const wa = whatsapp(c.telefono);
                return (
                  <li key={c.id} className="pv-fila">
                    <button type="button" className="pv-fila__principal" onClick={() => { haptic('selection'); setAbierto(c); }}>
                      <FotoConductor conductor={c} size={40} />
                      <span className="pv-fila__texto">
                        <span className="pv-fila__nombre">{c.nombre || 'Sin nombre'}</span>
                        <span className="pv-fila__sub">{[c.empresa ? nombreEmpresa(c.empresa) : null, c.dni && `DNI ${c.dni}`, !activo(c) ? c.estado : null].filter(Boolean).join(' · ') || 'Sin datos'}</span>
                      </span>
                    </button>
                    {(c.telefono || wa) && (
                      <div className="pv-fila__acciones">
                        {c.telefono && <a className="pv-accion" href={`tel:${c.telefono.replace(/\s/g, '')}`} aria-label={`Llamar a ${c.nombre}`}><Phone size={16} /></a>}
                        {wa && <a className="pv-accion pv-accion--wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${c.nombre}`}><MessageCircle size={16} /></a>}
                      </div>
                    )}
                  </li>
                );
              }} />
            )
          )}
        </>
      )}

      <ConductorFicha
        conductor={abierto}
        onClose={() => setAbierto(null)}
        onEditar={puedeEditar ? c => { setAbierto(null); setFormulario({ conductor: c }); } : undefined}
        onEliminar={puedeEliminar ? c => setPorEliminar(c) : undefined}
      />
      <ConductorFormulario
        open={!!formulario}
        conductor={formulario?.conductor ?? null}
        existentes={conductores}
        onClose={() => setFormulario(null)}
        onGuardado={() => setFormulario(null)}
      />
      <ImportarConductores open={importando} onClose={() => setImportando(false)} existentes={conductores} />
      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={eliminar}
        loading={eliminando}
        title={`¿Eliminar a ${porEliminar?.nombre ?? ''}?`}
        message="Se borra del directorio de personal. Los viajes, vales y registros que ya tiene no se modifican. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </Page>
  );
}
