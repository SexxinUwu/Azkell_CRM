import '../mantenimiento/mant.css';
import { useState } from 'react';
import { FileSpreadsheet, HardHat, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { useToast } from '../../core/ui/Toast';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { useHorasTecnicos } from './api';

// Mantenimiento › Productividad personal: horas reales de cada técnico frente a las proyectadas en el rango
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

const COLUMNAS: ColumnaTabla[] = [
  { id: 'tecnico', titulo: 'Técnico', ancho: 280, minimo: 160 },
  { id: 'reales', titulo: 'Horas reales', ancho: 130, alinear: 'right' },
  { id: 'proyectadas', titulo: 'Horas proyectadas', ancho: 160, alinear: 'right' },
  { id: 'eficiencia', titulo: 'Cumplimiento', ancho: 150, alinear: 'right' },
  { id: 'enCurso', titulo: 'Horas en curso', ancho: 150, alinear: 'right' },
];

export function ProductividadPage() {
  const [desde, setDesde] = useState(hoyLima());
  const [hasta, setHasta] = useState(hoyLima());
  const [q, setQ] = useState('');
  const datos = useHorasTecnicos(desde, hasta);
  const toast = useToast();
  const tecnicos = (datos.data?.tecnicos ?? []).filter(t => !q.trim() || t.nombre.toUpperCase().includes(q.trim().toUpperCase()));

  // Exporta lo que está en pantalla: horas reales, proyectadas, cumplimiento y horas en curso por técnico
  async function exportar() {
    try {
      await exportarExcel('Productividad_Tecnicos', 'Productividad', ['Técnico', 'Horas reales', 'Horas proyectadas', 'Cumplimiento (%)', 'Horas en curso'],
        tecnicos.map(t => [t.nombre, t.reales, t.proyectadas, t.eficiencia, t.enCurso]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Productividad personal"
        subtitle={datos.isLoading ? 'Cargando…' : `${datos.data?.resumen.trabajos ?? 0} trabajos · ${datos.data?.diasLaborables ?? 0} días laborables`}
        actions={tecnicos.length > 0 ? <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={exportar}>Exportar Excel</Button> : undefined} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
          <SearchField value={q} onChange={setQ} placeholder="Nombre del técnico…" />
        </div>

        {datos.isLoading ? <PageLoader /> : datos.isError ? <Notice tone="error">{errorMessage(datos.error)}</Notice> : tecnicos.length === 0 ? (
          <EmptyState icon={q ? <SearchX size={22} /> : <HardHat size={22} />} title={q ? 'Sin coincidencias' : 'Sin trabajos en el rango'}>Cambia las fechas para ver la productividad.</EmptyState>
        ) : (
          <TablaRedimensionable id="productividad-personal" columnas={COLUMNAS} ariaLabel="Productividad del personal técnico" altoMax="70vh">
            {tecnicos.map(t => (
              <tr key={t.nombre}>
                <Celda>{t.nombre}</Celda>
                <Celda alinear="right" mono>{t.reales.toLocaleString('es-PE', { maximumFractionDigits: 1 })}</Celda>
                <Celda alinear="right" mono>{t.proyectadas.toLocaleString('es-PE', { maximumFractionDigits: 1 })}</Celda>
                <Celda alinear="right" mono>
                  <span style={{ fontWeight: 700, color: t.eficiencia >= 100 ? 'var(--green-ink)' : t.eficiencia >= 70 ? 'var(--amber-ink)' : 'var(--red-ink)' }}>
                    {t.eficiencia.toLocaleString('es-PE', { maximumFractionDigits: 1 })} %
                  </span>
                </Celda>
                <Celda alinear="right" mono>{t.enCurso.toLocaleString('es-PE', { maximumFractionDigits: 1 })}</Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </div>
    </Page>
  );
}
