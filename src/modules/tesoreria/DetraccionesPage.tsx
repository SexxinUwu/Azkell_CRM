import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { hoyLima } from '../../core/lib/format';
import { useConfigDetracciones, type FilaCruce, type FiltroReporte, type ReporteDetracciones } from './det-api';
import { DetReporte, exportarReporte, filtroInicial } from './det-Reporte';
import { DetCruce, exportarCruce } from './det-Cruce';
import { DetConfig } from './det-Config';
import { inicioHaceMeses } from './det-util';

type Vista = 'reporte' | 'cruce' | 'config';

/** Tesorería › Detracciones: reportes de pendientes y depositadas, cruce con el SIRE y configuración (solo administradores) */
export function DetraccionesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const config = useConfigDetracciones();
  const puedeConfigurar = !!config.data?.puede_editar;
  const [vista, setVista] = useState<Vista>('reporte');
  const [filtro, setFiltro] = useState<FiltroReporte>(filtroInicial);
  const [rango, setRango] = useState({ desde: inicioHaceMeses(3), hasta: hoyLima() });
  const reporte = useRef<ReporteDetracciones | undefined>(undefined);
  const filasCruce = useRef<FilaCruce[]>([]);
  const alReporte = useCallback((r: ReporteDetracciones | undefined) => { reporte.current = r; }, []);
  const alCruce = useCallback((f: FilaCruce[]) => { filasCruce.current = f; }, []);

  const opciones = [
    { value: 'reporte' as Vista, label: 'Reportes' },
    { value: 'cruce' as Vista, label: 'Cruce con el SIRE' },
    ...(puedeConfigurar ? [{ value: 'config' as Vista, label: 'Configuración' }] : []),
  ];
  const vistaActiva: Vista = vista === 'config' && !puedeConfigurar ? 'reporte' : vista;

  async function exportar() {
    try {
      if (vistaActiva === 'reporte' && reporte.current) await exportarReporte(reporte.current, filtro);
      else if (vistaActiva === 'cruce') await exportarCruce(filasCruce.current);
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page wide>
      <PageHeader
        eyebrow="Tesorería"
        title="Detracciones"
        subtitle="Lo retenido en las órdenes de compra: pendiente de depositar, depositado y cruce con el SIRE"
        actions={
          <MenuOtros opciones={[
            { label: 'Actualizar', detalle: 'Vuelve a leer los datos', icon: <RefreshCw size={17} />, onSelect: () => { haptic('selection'); qc.invalidateQueries({ queryKey: ['tesoreria', 'detracciones'] }); } },
            vistaActiva !== 'config' && { label: 'Exportar Excel', detalle: vistaActiva === 'reporte' ? 'Detalle, por proveedor, por mes y resumen' : 'Filas del cruce a la vista', icon: <FileSpreadsheet size={17} />, onSelect: exportar },
          ]} />
        }
      />
      <div className="det-pestanas">
        <SegmentedControl<Vista> label="Sección de detracciones" value={vistaActiva} onChange={setVista} options={opciones} />
      </div>
      {vistaActiva === 'reporte' && <DetReporte filtro={filtro} setFiltro={setFiltro} onDatos={alReporte} />}
      {vistaActiva === 'cruce' && <DetCruce desde={rango.desde} hasta={rango.hasta} setRango={(desde, hasta) => setRango({ desde, hasta })} onFilas={alCruce} />}
      {vistaActiva === 'config' && <DetConfig />}
    </Page>
  );
}
