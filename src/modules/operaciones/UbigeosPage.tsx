import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import { useMemo, useState } from 'react';
import { FileSpreadsheet, MapPinned, SearchX } from 'lucide-react';
import { AccionesCabecera } from '../../core/ui/AccionesCabecera';
import { PageLoader } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { useUbigeos } from './ubigeos';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MAXIMO = 300;

const COLUMNAS: ColumnaTabla[] = [
  { id: 'codigo', titulo: 'Ubigeo', ancho: 110 },
  { id: 'distrito', titulo: 'Distrito', ancho: 260, minimo: 140 },
  { id: 'provincia', titulo: 'Provincia', ancho: 220, minimo: 120 },
  { id: 'departamento', titulo: 'Departamento', ancho: 200, minimo: 120 },
];

// Operaciones › Ubigeos: catálogo oficial del INEI para consultar el código de cualquier distrito (guías de remisión y puntos de carga y entrega).
export function UbigeosPage() {
  const { data, isLoading, isError, error } = useUbigeos();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  const [departamento, setDepartamento] = useState('');
  const [provincia, setProvincia] = useState('');

  const todos = data ?? [];
  const departamentos = useMemo(() => [...new Set(todos.map(u => u.departamento))].sort((a, b) => a.localeCompare(b, 'es')), [todos]);
  const provincias = useMemo(() => [...new Set(todos.filter(u => !departamento || u.departamento === departamento).map(u => u.provincia))].sort((a, b) => a.localeCompare(b, 'es')), [todos, departamento]);
  const visibles = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return todos.filter(u => (!departamento || u.departamento === departamento) && (!provincia || u.provincia === provincia)
      && (!t || u.codigo.includes(t) || sinTildes(`${u.distrito} ${u.provincia} ${u.departamento}`).includes(t)));
  }, [todos, busqueda, departamento, provincia]);
  const activos = (departamento ? 1 : 0) + (provincia ? 1 : 0);

  async function copiar(codigo: string) {
    haptic('selection');
    try { await navigator.clipboard.writeText(codigo); toast(`Ubigeo ${codigo} copiado`); }
    catch { toast(`Ubigeo ${codigo}`); }
  }
  async function exportar() {
    try {
      await exportarExcel('Ubigeos', 'Ubigeos', ['Ubigeo', 'Distrito', 'Provincia', 'Departamento'], visibles.map(u => [u.codigo, u.distrito, u.provincia, u.departamento]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader eyebrow="Operaciones" title="Ubigeos"
        subtitle={isLoading ? 'Cargando…' : `${todos.length.toLocaleString('es-PE')} distritos · catálogo INEI`}
        actions={<AccionesCabecera etiqueta="Acciones de ubigeos" acciones={[{ label: 'Exportar Excel', icon: <FileSpreadsheet size={17} />, tono: 'verde', onClick: exportar }]} />} />

      {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Distrito, provincia, departamento o código" activos={activos} onAbrirFiltros={() => setFiltrando(true)} />
          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos} onLimpiar={() => { setDepartamento(''); setProvincia(''); }} resultado={visibles.length} unidad="distrito">
            <GrupoFiltro titulo="Departamento">
              <Combobox options={departamentos.map(d => ({ value: d, label: d }))} value={departamento || null} placeholder="Todos los departamentos"
                onChange={v => { setDepartamento(v ?? ''); setProvincia(''); }} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Provincia">
              <Combobox options={provincias.map(p => ({ value: p, label: p }))} value={provincia || null} placeholder="Todas las provincias" onChange={v => setProvincia(v ?? '')} />
            </GrupoFiltro>
          </HojaFiltros>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">Prueba con otra parte del nombre o con el código de 6 dígitos.</EmptyState>
          ) : (
            <>
              <TablaRedimensionable id="ubigeos" columnas={COLUMNAS} ariaLabel="Ubigeos del INEI">
                {visibles.slice(0, MAXIMO).map(u => (
                  <tr key={u.codigo} className="tabla-redim__fila--click" onClick={() => copiar(u.codigo)} title="Tocar para copiar el código">
                    <Celda mono>{u.codigo}</Celda>
                    <Celda><strong>{u.distrito}</strong></Celda>
                    <Celda>{u.provincia}</Celda>
                    <Celda>{u.departamento}</Celda>
                  </tr>
                ))}
              </TablaRedimensionable>
              <p className="t-footnote c-secondary" style={{ margin: 0 }}>
                <MapPinned size={13} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />
                {visibles.length > MAXIMO ? `Se muestran ${MAXIMO} de ${visibles.length.toLocaleString('es-PE')}: escribe para acotar. ` : ''}Toca una fila para copiar su código.
              </p>
            </>
          )}
        </div>
      )}
    </Page>
  );
}
