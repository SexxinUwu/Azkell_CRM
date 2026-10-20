import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, FileSpreadsheet, PackageX, Wallet } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SelectInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { BarrasGrafico, DonaGrafico, type Porcion } from '../../core/ui/Graficos';
import { TendenciaGrafico } from '../../core/ui/TendenciaGrafico';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { useDashboardFinanciero, useDetalleFinanciero, type DetalleFinanciero } from './dashboardApi';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const COLORES = ['var(--accent)', 'var(--green)', 'var(--amber)', 'var(--blue)', 'var(--red)', 'var(--gray)', 'var(--label-2)'];
const TOP_FAMILIAS = 7;
const TOP_CONSUMO = 8;

const soles = (v: unknown) => 'S/ ' + Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: unknown, d = 2) => Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
// Fecha peruana dd/mm/aaaa, sin cambio de zona horaria
const dia = (s?: string | null) => { const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

const tarjeta = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 14, padding: 'var(--s-4)', minWidth: 0 } as const;
const titulo = { margin: '0 0 var(--s-3)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--label)' } as const;
const nota = { margin: 'var(--s-2) 0 0', fontSize: '0.75rem', color: 'var(--label-2)' } as const;

// Período de año y mes para consumo y proveedores (el inventario y los stocks son de hoy)
const aniosDisponibles = () => { const y = new Date().getFullYear(); return [y, y - 1, y - 2, y - 3]; };

// Dashboard financiero de almacén (Almacén › Dashboard financiero). Los agregados vienen del servidor.
export function DashboardFinancieroPage() {
  const [dias, setDias] = useState<90 | 180>(180);
  const [anio, setAnio] = useState('');
  const [mes, setMes] = useState('');
  const [drill, setDrill] = useState<{ familia: string; tipo: 'inventario' | 'salidas' } | null>(null);

  const dash = useDashboardFinanciero({ dias, anio, mes });
  const d = dash.data;
  const detalle = useDetalleFinanciero(drill?.familia ?? null, drill?.tipo ?? 'inventario', anio, mes);

  // Las gráficas muestran nombre y monto; el mapa devuelve la familia real al hacer clic
  const { porcionesFamilias, familiaPorNombre } = useMemo(() => {
    const mapa = new Map<string, string>();
    if (!d) return { porcionesFamilias: [] as Porcion[], familiaPorNombre: mapa };
    const top = d.familias.slice(0, TOP_FAMILIAS);
    const resto = d.familias.slice(TOP_FAMILIAS).reduce((s, f) => s + f.valor, 0);
    const porciones: Porcion[] = top.map((f, i) => {
      const nombre = `${f.familia} · ${soles(f.valor)}`;
      mapa.set(nombre, f.familia);
      return { nombre, valor: f.valor, color: COLORES[i] };
    });
    if (resto > 0) porciones.push({ nombre: `OTROS · ${soles(resto)}`, valor: resto, color: 'var(--label-3)' });
    return { porcionesFamilias: porciones, familiaPorNombre: mapa };
  }, [d]);

  const porcionesConsumo: Porcion[] = useMemo(() => {
    if (!d) return [];
    const top = d.consumo.slice(0, TOP_CONSUMO);
    const resto = d.consumo.slice(TOP_CONSUMO).reduce((s, f) => s + f.total, 0);
    const porciones: Porcion[] = top.map(f => ({ nombre: f.familia, valor: Math.round(f.total), color: 'var(--accent)' }));
    if (resto > 0) porciones.push({ nombre: 'OTROS', valor: Math.round(resto), color: 'var(--label-3)' });
    return porciones;
  }, [d]);

  const aniosOpc = aniosDisponibles();
  const hoy = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  async function exportarCriticos() {
    if (!d) return;
    haptic('selection');
    await exportarExcel('Reposicion-critica', 'Reposición crítica',
      ['Artículo', 'Unidad', 'Stock', 'Mínimo', 'Máximo', 'Reposición (S/)'],
      d.criticos.map(c => [c.articulo, c.unidad, c.stock, c.min, c.max, c.valor]));
  }
  async function exportarMuertos() {
    if (!d) return;
    haptic('selection');
    await exportarExcel('Stock-sin-rotacion', 'Sin rotación',
      ['Artículo', 'Familia', 'Unidad', 'Stock', 'Valor (S/)', 'Última salida'],
      d.muertos.map(m => [m.articulo, m.familia, m.unidad, m.stock, m.valor, m.ultima ? dia(m.ultima) : 'Nunca']));
  }

  const colTop: ColumnaTabla[] = [
    { id: 'articulo', titulo: 'Artículo', ancho: 340, minimo: 160 },
    { id: 'familia', titulo: 'Familia', ancho: 150 },
    { id: 'stock', titulo: 'Stock', ancho: 110, alinear: 'right' },
    { id: 'costo', titulo: 'Costo unit.', ancho: 120, alinear: 'right' },
    { id: 'valor', titulo: 'Valor', ancho: 130, alinear: 'right' },
  ];
  const colCrit: ColumnaTabla[] = [
    { id: 'articulo', titulo: 'Artículo', ancho: 320, minimo: 160 },
    { id: 'stock', titulo: 'Stock / mín. / máx.', ancho: 170, alinear: 'right' },
    { id: 'valor', titulo: 'Reposición', ancho: 130, alinear: 'right' },
  ];
  const colMuerto: ColumnaTabla[] = [
    { id: 'articulo', titulo: 'Artículo', ancho: 320, minimo: 160 },
    { id: 'familia', titulo: 'Familia', ancho: 140 },
    { id: 'stock', titulo: 'Stock', ancho: 90, alinear: 'right' },
    { id: 'ultima', titulo: 'Última salida', ancho: 130 },
    { id: 'valor', titulo: 'Valor', ancho: 120, alinear: 'right' },
  ];
  const colProv: ColumnaTabla[] = [
    { id: 'proveedor', titulo: 'Proveedor', ancho: 380, minimo: 160 },
    { id: 'total', titulo: 'Compras (S/)', ancho: 150, alinear: 'right' },
    { id: 'parte', titulo: 'Participación', ancho: 120, alinear: 'right' },
  ];
  const colDetInv: ColumnaTabla[] = [
    { id: 'articulo', titulo: 'Artículo', ancho: 300, minimo: 160 },
    { id: 'stock', titulo: 'Stock', ancho: 100, alinear: 'right' },
    { id: 'costo', titulo: 'Costo unit.', ancho: 120, alinear: 'right' },
    { id: 'valor', titulo: 'Valor', ancho: 130, alinear: 'right' },
  ];
  const colDetSal: ColumnaTabla[] = [
    { id: 'fecha', titulo: 'Fecha', ancho: 110 },
    { id: 'placa', titulo: 'Placa', ancho: 100 },
    { id: 'ot', titulo: 'OT', ancho: 130 },
    { id: 'articulo', titulo: 'Artículo', ancho: 280, minimo: 160 },
    { id: 'cantidad', titulo: 'Cant.', ancho: 80, alinear: 'right' },
    { id: 'total', titulo: 'Total', ancho: 120, alinear: 'right' },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Almacén"
        title="Dashboard financiero"
        subtitle={dash.isLoading ? 'Calculando…' : `Stock valorizado al ${hoy} · consumo y compras del período elegido`}
        actions={
          <MenuOtros opciones={[
            { label: 'Reposición crítica (Excel)', detalle: `${d?.criticos.length ?? 0} de ${d?.kpis.criticos ?? 0} artículos`, icon: <FileSpreadsheet size={17} />, onSelect: exportarCriticos },
            { label: 'Stock sin rotación (Excel)', detalle: `${d?.kpis.muertos ?? 0} artículos`, icon: <FileSpreadsheet size={17} />, onSelect: exportarMuertos },
          ]} />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SelectInput value={String(dias)} onChange={e => setDias(Number(e.target.value) === 90 ? 90 : 180)} aria-label="Días sin rotación" style={{ width: 'auto' }}>
            <option value="180">Sin salida hace 180 días</option>
            <option value="90">Sin salida hace 90 días</option>
          </SelectInput>
          <SelectInput value={anio} onChange={e => setAnio(e.target.value)} aria-label="Año" style={{ width: 'auto' }}>
            <option value="">Todos los años</option>
            {aniosOpc.map(a => <option key={a} value={a}>{a}</option>)}
          </SelectInput>
          <SelectInput value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes" style={{ width: 'auto' }} disabled={!anio}>
            <option value="">Todos los meses</option>
            {MESES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
          </SelectInput>
        </div>

        {dash.isLoading ? <PageLoader /> : dash.isError ? <Notice tone="error">{errorMessage(dash.error)}</Notice> : !d ? null : (
          <>
            <div className="inv-metricas">
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>{soles(d.kpis.capital)}</span><span className="inv-metrica__label">Capital inmovilizado · {d.kpis.articulos} con stock</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--critical" style={{ fontSize: '1.125rem' }}>{soles(d.kpis.reposicion)}</span><span className="inv-metrica__label">Costo de reposición · {d.kpis.criticos} bajo mínimo</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>{soles(d.kpis.muerto)}</span><span className="inv-metrica__label">Sin rotación · {d.kpis.muertos} artículos ({d.dias} días)</span></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 'var(--s-3)' }}>
              <section style={tarjeta}>
                <h3 style={titulo}>Valor por familia (stock)</h3>
                {porcionesFamilias.length === 0 ? <EmptyState icon={<Wallet size={22} />} title="Sin stock valorizado">No hay artículos con stock.</EmptyState> : (
                  <DonaGrafico porciones={porcionesFamilias} altura={200}
                    onElegir={nombre => { const f = familiaPorNombre.get(nombre); if (f) setDrill({ familia: f, tipo: 'inventario' }); }} />
                )}
                <p style={nota}>Toca una familia para ver sus artículos valorizados.</p>
              </section>

              <section style={tarjeta}>
                <h3 style={titulo}>Consumo por familia · {anio ? `${mes ? MESES[Number(mes) - 1] + ' ' : ''}${anio}` : 'todo el historial'}</h3>
                {porcionesConsumo.length === 0 ? <EmptyState icon={<BarChart3 size={22} />} title="Sin consumo en el período">No hay salidas despachadas en este período.</EmptyState> : (
                  <BarrasGrafico porciones={porcionesConsumo}
                    onElegir={nombre => { if (nombre !== 'OTROS') setDrill({ familia: nombre, tipo: 'salidas' }); }} />
                )}
                <p style={nota}>Toca una familia para ver las salidas que la consumieron.</p>
              </section>

              <section style={{ ...tarjeta, gridColumn: '1 / -1' }}>
                <h3 style={titulo}>Compras y consumo · últimos 12 meses</h3>
                <TendenciaGrafico datos={d.tendencia} />
              </section>
            </div>

            <section style={tarjeta}>
              <h3 style={titulo}>Top 10 con mayor capital atrapado</h3>
              {d.topCapital.length === 0 ? <EmptyState icon={<Wallet size={22} />} title="Sin stock">No hay artículos con stock.</EmptyState> : (
                <TablaRedimensionable id="dash-fin-top" columnas={colTop} ariaLabel="Top 10 de capital inmovilizado" altoMax="none">
                  {d.topCapital.map(a => (
                    <tr key={a.id}>
                      <Celda>{a.articulo}</Celda>
                      <Celda>{a.familia}</Celda>
                      <Celda alinear="right" mono>{num(a.stock, 2)} {a.unidad}</Celda>
                      <Celda alinear="right" mono>{soles(a.costo)}</Celda>
                      <Celda alinear="right" mono>{soles(a.valor)}</Celda>
                    </tr>
                  ))}
                </TablaRedimensionable>
              )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', gap: 'var(--s-3)' }}>
              <section style={tarjeta}>
                <h3 style={titulo}><AlertTriangle size={15} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--red-ink)' }} />Reposición crítica · {d.kpis.criticos} artículos</h3>
                {d.criticos.length === 0 ? <EmptyState icon={<PackageX size={22} />} title="Nada bajo mínimo">Ningún artículo está bajo su stock mínimo.</EmptyState> : (
                  <>
                    <TablaRedimensionable id="dash-fin-criticos" columnas={colCrit} ariaLabel="Reposición crítica" altoMax="420px">
                      {d.criticos.map(c => (
                        <tr key={c.id}>
                          <Celda>{c.articulo}</Celda>
                          <Celda alinear="right" mono>{num(c.stock, 2)} / {num(c.min, 0)} / {num(c.max, 0)}</Celda>
                          <Celda alinear="right" mono>{soles(c.valor)}</Celda>
                        </tr>
                      ))}
                    </TablaRedimensionable>
                    {d.kpis.criticos > d.criticos.length && <p style={nota}>Mostrando los {d.criticos.length} de mayor costo. Descarga el Excel para la lista completa.</p>}
                  </>
                )}
              </section>

              <section style={tarjeta}>
                <h3 style={titulo}>Stock sin rotación · {d.kpis.muertos} artículos</h3>
                {d.muertos.length === 0 ? <EmptyState icon={<PackageX size={22} />} title="Sin stock muerto">Todo el stock tuvo salida en el período.</EmptyState> : (
                  <>
                    <TablaRedimensionable id="dash-fin-muertos" columnas={colMuerto} ariaLabel="Stock sin rotación" altoMax="420px">
                      {d.muertos.map(m => (
                        <tr key={m.id}>
                          <Celda>{m.articulo}</Celda>
                          <Celda>{m.familia}</Celda>
                          <Celda alinear="right" mono>{num(m.stock, 2)}</Celda>
                          <Celda mono>{m.ultima ? dia(m.ultima) : 'Nunca'}</Celda>
                          <Celda alinear="right" mono>{soles(m.valor)}</Celda>
                        </tr>
                      ))}
                    </TablaRedimensionable>
                    {d.kpis.muertos > d.muertos.length && <p style={nota}>Mostrando los {d.muertos.length} de mayor valor. Descarga el Excel para la lista completa.</p>}
                  </>
                )}
              </section>
            </div>

            <section style={tarjeta}>
              <h3 style={titulo}>Compras por proveedor · {anio ? `${mes ? MESES[Number(mes) - 1] + ' ' : ''}${anio}` : 'todo el historial'}</h3>
              {d.proveedores.length === 0 ? <EmptyState icon={<Wallet size={22} />} title="Sin compras en el período">No hay entradas registradas en este período.</EmptyState> : (
                <TablaRedimensionable id="dash-fin-proveedores" columnas={colProv} ariaLabel="Compras por proveedor" altoMax="420px">
                  {d.proveedores.map(p => (
                    <tr key={p.proveedor}>
                      <Celda>{p.proveedor}</Celda>
                      <Celda alinear="right" mono>{soles(p.total)}</Celda>
                      <Celda alinear="right" mono>{d.proveedoresTotal > 0 ? `${num((p.total / d.proveedoresTotal) * 100, 1)} %` : '—'}</Celda>
                    </tr>
                  ))}
                </TablaRedimensionable>
              )}
            </section>
          </>
        )}
      </div>

      <DetalleFamilia drill={drill} det={detalle} onClose={() => setDrill(null)} colInv={colDetInv} colSal={colDetSal} />
    </Page>
  );
}

function DetalleFamilia({ drill, det, onClose, colInv, colSal }: {
  drill: { familia: string; tipo: 'inventario' | 'salidas' } | null;
  det: { isLoading: boolean; isError: boolean; error: unknown; data?: DetalleFinanciero };
  onClose: () => void; colInv: ColumnaTabla[]; colSal: ColumnaTabla[];
}) {
  const abierto = !!drill;
  const titulo = drill ? `${drill.familia} · ${drill.tipo === 'inventario' ? 'Inventario valorizado' : 'Consumo del período'}` : '';
  const data = det.data;
  return (
    <Sheet open={abierto} onClose={onClose} title={titulo}>
      {!drill ? <span /> : det.isLoading ? <PageLoader /> : det.isError ? <Notice tone="error">{errorMessage(det.error)}</Notice> : !data ? null : data.tipo === 'inventario' ? (
        data.filas.length === 0 ? <EmptyState icon={<PackageX size={22} />} title="Sin artículos con stock">Esta familia no tiene stock valorizado.</EmptyState> : (
          <TablaRedimensionable id="dash-fin-det-inv" columnas={colInv} ariaLabel="Inventario valorizado de la familia" altoMax="70vh">
            {data.filas.map(a => (
              <tr key={a.id}>
                <Celda>{a.articulo}</Celda>
                <Celda alinear="right" mono>{num(a.stock, 2)} {a.unidad}</Celda>
                <Celda alinear="right" mono>{soles(a.costo)}</Celda>
                <Celda alinear="right" mono>{soles(a.valor)}</Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )
      ) : (
        data.filas.length === 0 ? <EmptyState icon={<BarChart3 size={22} />} title="Sin salidas">No hay salidas de esta familia en el período.</EmptyState> : (
          <TablaRedimensionable id="dash-fin-det-sal" columnas={colSal} ariaLabel="Salidas de la familia" altoMax="70vh">
            {data.filas.map((s, i) => (
              <tr key={`${s.fecha}-${i}`}>
                <Celda mono>{dia(s.fecha)}</Celda>
                <Celda mono>{s.placa || '—'}</Celda>
                <Celda mono>{s.ticket_ot || '—'}</Celda>
                <Celda>{s.articulo}</Celda>
                <Celda alinear="right" mono>{num(s.cantidad, 2)}</Celda>
                <Celda alinear="right" mono>{soles(s.total)}</Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )
      )}
    </Sheet>
  );
}
