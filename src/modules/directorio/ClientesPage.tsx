import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import './clientes.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Download, FileSpreadsheet, Plus, SearchX, Upload } from 'lucide-react';
import { AccionesCabecera } from '../../core/ui/AccionesCabecera';
import { Button, PageLoader } from '../../core/ui/Button';
import { ChoiceChips } from '../../core/ui/Chips';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { tipoDocumento, useClientes, type Cliente } from './api';
import { ClienteFicha } from './ClienteFicha';
import { ClienteFormulario } from './ClienteFormulario';
import { ImportarClientesSheet, descargarPlantillaClientes } from './ImportarClientesSheet';

type FiltroEstado = '' | 'activo' | 'inactivo';
type FiltroTipo = '' | 'RUC' | 'DNI';
type FiltroDatos = '' | 'sin-direccion' | 'sin-telefono' | 'sin-correo';

const COLUMNAS: ColumnaTabla[] = [
  { id: 'razon', titulo: 'Cliente', ancho: 300, minimo: 180 },
  { id: 'tipo', titulo: 'Tipo', ancho: 80 },
  { id: 'doc', titulo: 'Documento', ancho: 120 },
  { id: 'tel', titulo: 'Teléfono', ancho: 120 },
  { id: 'correo', titulo: 'Correo', ancho: 210 },
  { id: 'dir', titulo: 'Dirección', ancho: 280, minimo: 140 },
  { id: 'unid', titulo: 'Unidades', ancho: 90, alinear: 'right' },
  { id: 'estado', titulo: 'Estado', ancho: 100 },
];
const nombreDe = (c: Cliente) => String(c.razon_social ?? c.nombre ?? '');
const esActivo = (c: Cliente) => String(c.estado ?? 'Activo').toLowerCase() === 'activo';
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Operaciones › Clientes. Al guardar, el servidor actualiza el nombre del cliente en todas sus placas.
export function ClientesPage() {
  const { data, isLoading, isError, error } = useClientes();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  const [estado, setEstado] = useState<FiltroEstado>('');
  const [tipo, setTipo] = useState<FiltroTipo>('');
  const [datos, setDatos] = useState<FiltroDatos>('');
  const [ficha, setFicha] = useState<Cliente | null>(null);
  const [formulario, setFormulario] = useState<{ cliente: Cliente | null } | null>(null);
  const [importando, setImportando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<Cliente | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const lista: Cliente[] = data ?? [];
  const puedeCrear = can('clientes.crear');
  const puedeEditar = can('clientes.editar', 'clientes.crear');

  const visibles = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return lista.filter(c => {
      if (estado && esActivo(c) !== (estado === 'activo')) return false;
      if (tipo && tipoDocumento(c.ruc_dni) !== tipo) return false;
      if (datos === 'sin-direccion' && String(c.direccion ?? '').trim()) return false;
      if (datos === 'sin-telefono' && String(c.telefono ?? '').trim()) return false;
      if (datos === 'sin-correo' && String(c.email ?? '').trim()) return false;
      return !t || sinTildes(`${nombreDe(c)} ${c.ruc_dni ?? ''} ${c.email ?? ''} ${c.telefono ?? ''} ${c.direccion ?? ''}`).includes(t);
    });
  }, [lista, busqueda, estado, tipo, datos]);
  const activos = (estado ? 1 : 0) + (tipo ? 1 : 0) + (datos ? 1 : 0);
  const limpiar = () => { setEstado(''); setTipo(''); setDatos(''); };
  const sinDireccion = useMemo(() => lista.filter(c => !String(c.direccion ?? '').trim()).length, [lista]);

  async function exportar() {
    try {
      await exportarExcel('Clientes', 'Clientes', ['Razón social', 'Tipo', 'Documento', 'Teléfono', 'Correo', 'Dirección', 'Estado', 'Unidades'],
        visibles.map(c => [nombreDe(c), tipoDocumento(c.ruc_dni), c.ruc_dni, c.telefono, c.email, c.direccion, esActivo(c) ? 'Activo' : 'Inactivo', Number(c.total_flota) || 0]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/clientes/${porEliminar.id}`, { method: 'DELETE' });
      if (r && r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast('Cliente eliminado');
      await qc.invalidateQueries({ queryKey: ['directorio', 'clientes'] });
      setPorEliminar(null); setFicha(null);
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  return (
    <Page>
      <PageHeader eyebrow="Operaciones" title="Clientes"
        subtitle={isLoading ? 'Cargando…' : `${lista.length.toLocaleString('es-PE')} clientes${sinDireccion ? ` · ${sinDireccion} sin dirección` : ''}`}
        actions={
          <>
            <AccionesCabecera etiqueta="Acciones de clientes" acciones={[
              { label: 'Exportar Excel', icon: <FileSpreadsheet size={17} />, tono: 'verde', onClick: exportar },
              puedeCrear && { label: 'Importar desde Excel', icon: <Upload size={17} />, tono: 'azul', onClick: () => setImportando(true) },
              puedeCrear && { label: 'Descargar plantilla', icon: <Download size={17} />, tono: 'violeta', onClick: () => { descargarPlantillaClientes().catch(() => undefined); } },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ cliente: null })}>Nuevo cliente</Button>}
          </>
        } />

      {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Nombre, documento, teléfono, correo o dirección" activos={activos} onAbrirFiltros={() => setFiltrando(true)} />
          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos} onLimpiar={limpiar} resultado={visibles.length} unidad="cliente">
            <GrupoFiltro titulo="Estado">
              <ChoiceChips<FiltroEstado> label="Estado" value={estado} onChange={setEstado} options={[{ value: '', label: 'Todos' }, { value: 'activo', label: 'Activos' }, { value: 'inactivo', label: 'Inactivos' }]} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Tipo de documento">
              <ChoiceChips<FiltroTipo> label="Tipo de documento" value={tipo} onChange={setTipo} options={[{ value: '', label: 'Todos' }, { value: 'RUC', label: 'RUC' }, { value: 'DNI', label: 'DNI' }]} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Datos que faltan">
              <ChoiceChips<FiltroDatos> label="Datos que faltan" value={datos} onChange={setDatos}
                options={[{ value: '', label: 'Todos' }, { value: 'sin-direccion', label: 'Sin dirección' }, { value: 'sin-telefono', label: 'Sin teléfono' }, { value: 'sin-correo', label: 'Sin correo' }]} />
            </GrupoFiltro>
          </HojaFiltros>

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda || activos ? <SearchX size={22} /> : <Building2 size={22} />} title={busqueda || activos ? 'Sin coincidencias' : 'Sin clientes'}>
              {busqueda || activos ? 'Prueba con otra búsqueda o quita los filtros.' : puedeCrear ? 'Registra el primero con «Nuevo cliente».' : 'Aún no hay clientes registrados.'}
            </EmptyState>
          ) : (
            <TablaRedimensionable id="clientes-v3" columnas={COLUMNAS} ariaLabel="Clientes">
              {visibles.map(c => {
                const t = tipoDocumento(c.ruc_dni);
                const activo = esActivo(c);
                return (
                  <tr key={String(c.id)} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setFicha(c); }}>
                    <Celda><strong>{nombreDe(c) || 'Sin razón social'}</strong></Celda>
                    <Celda>{t === '—' ? '—' : <span className={`cl-tipo${t === 'RUC' ? ' cl-tipo--ruc' : t === 'DNI' ? ' cl-tipo--dni' : ''}`}>{t}</span>}</Celda>
                    <Celda mono>{c.ruc_dni || '—'}</Celda>
                    <Celda mono>{c.telefono || '—'}</Celda>
                    <Celda>{c.email || '—'}</Celda>
                    <Celda>{String(c.direccion ?? '').trim() || <span className="cl-sin">Sin dirección</span>}</Celda>
                    <Celda alinear="right" mono>{Number(c.total_flota) || 0}</Celda>
                    <Celda><span className={`cl-chip ${activo ? 'cl-chip--verde' : 'cl-chip--gris'}`}>{activo ? 'Activo' : 'Inactivo'}</span></Celda>
                  </tr>
                );
              })}
            </TablaRedimensionable>
          )}
        </div>
      )}

      <ClienteFicha cliente={ficha} onClose={() => setFicha(null)}
        onEditar={puedeEditar ? c => { setFicha(null); setFormulario({ cliente: c }); } : undefined}
        onEliminar={can('clientes.eliminar') ? c => setPorEliminar(c) : undefined} />
      <ClienteFormulario open={!!formulario} cliente={formulario?.cliente ?? null} existentes={lista} onClose={() => setFormulario(null)} />
      <ImportarClientesSheet open={importando} onClose={() => setImportando(false)} existentes={lista} />
      <ConfirmSheet open={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} onConfirm={eliminar} loading={eliminando}
        title="Eliminar cliente" confirmLabel="Eliminar" message={`Se elimina a ${porEliminar ? nombreDe(porEliminar) : ''} del directorio. Sus unidades no se borran.`} />
    </Page>
  );
}
