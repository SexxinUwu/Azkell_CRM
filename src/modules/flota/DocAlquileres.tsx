import { useMemo, useState } from 'react';
import { FileText, Handshake, Pencil, Search, Send } from 'lucide-react';
import { EmptyState, Badge } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { MenuFila } from '../../core/ui/MenuFila';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { formatFechaPe } from '../../core/lib/format';
import { esAlquilada, responsableExterno } from './docsEstado';
import type { FilaExpediente } from './DocExpediente';

type Filtro = 'todas' | 'alquiladas' | 'propias';

const COLUMNAS: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Unidad', ancho: 140 },
  { id: 'tipo', titulo: 'Tipo', ancho: 130 },
  { id: 'situacion', titulo: 'Situación', ancho: 120, alinear: 'center' },
  { id: 'empresa', titulo: 'Alquilada a', ancho: 200 },
  { id: 'desde', titulo: 'Desde', ancho: 110 },
  { id: 'responsable', titulo: 'Documentos los actualiza', ancho: 200 },
  { id: 'solicitud', titulo: 'Última solicitud', ancho: 190 },
  { id: 'nota', titulo: 'Convenio', ancho: 260 },
  { id: 'acc', titulo: '', ancho: 64, minimo: 56, alinear: 'center' },
];

interface Props {
  filas: FilaExpediente[];
  puedeEditar: boolean;
  onAlquiler: (placa: string) => void;
  onPedirActualizacion: (placa: string) => void;
  onVerDocumentos: (placa: string) => void;
}

/** Apartado de alquiler: qué unidades están alquiladas y cuáles no, a quién, desde cuándo y quién actualiza sus documentos */
export function DocAlquileres({ filas, puedeEditar, onAlquiler, onPedirActualizacion, onVerDocumentos }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('todas');

  const cifras = useMemo(() => {
    const alquiladas = filas.filter(f => esAlquilada(f.v)).length;
    return { total: filas.length, alquiladas, propias: filas.length - alquiladas, externa: filas.filter(f => !!responsableExterno(f.v)).length };
  }, [filas]);

  const visibles = useMemo(
    () => filas.filter(f => filtro === 'todas' || (filtro === 'alquiladas' ? esAlquilada(f.v) : !esAlquilada(f.v)))
      // Primero las alquiladas, para verlas de un vistazo
      .sort((a, b) => Number(esAlquilada(b.v)) - Number(esAlquilada(a.v)) || a.v.placa.localeCompare(b.v.placa)),
    [filas, filtro],
  );

  return (
    <div className="doc-alq">
      <div className="doc-alq__resumen">
        <div className="doc-alq__cifra"><strong>{cifras.alquiladas}</strong><span>Alquiladas</span></div>
        <div className="doc-alq__cifra"><strong>{cifras.propias}</strong><span>Propias, sin alquiler</span></div>
        <div className="doc-alq__cifra"><strong>{cifras.externa}</strong><span>Las actualiza otra empresa</span></div>
        <SegmentedControl<Filtro> label="Qué unidades ver" value={filtro} onChange={setFiltro}
          options={[{ value: 'todas', label: `Todas (${cifras.total})` }, { value: 'alquiladas', label: `Alquiladas (${cifras.alquiladas})` }, { value: 'propias', label: `Propias (${cifras.propias})` }]} />
      </div>

      {visibles.length === 0 ? (
        <EmptyState icon={<Search size={22} />} title="Ninguna unidad coincide">{filtro === 'alquiladas' ? 'Todavía no marcaste unidades como alquiladas.' : 'Prueba con otro filtro.'}</EmptyState>
      ) : (
        <TablaRedimensionable id="docs-alquileres" columnas={COLUMNAS} ariaLabel="Unidades alquiladas y propias" altoMax="calc(100dvh - 430px)">
          {visibles.map(({ v }) => {
            const alq = esAlquilada(v);
            const ext = responsableExterno(v);
            return (
              <tr key={v.placa}>
                <Celda><LicensePlate plate={v.placa} size="sm" /></Celda>
                <Celda>{v.tipo || '—'}</Celda>
                <Celda alinear="center">{alq ? <Badge tone="accent">Alquilada</Badge> : <Badge>Propia</Badge>}</Celda>
                <Celda>{alq ? <strong>{v.alquilada_a}</strong> : '—'}</Celda>
                <Celda>{alq && v.alquiler_desde ? formatFechaPe(v.alquiler_desde) : '—'}</Celda>
                <Celda>{alq ? (ext ? <Badge tone="amber">{ext}</Badge> : <Badge tone="green">Nosotros</Badge>) : '—'}</Celda>
                <Celda>{v.ultima_solicitud && ext ? `${formatFechaPe(v.ultima_solicitud.fecha)}${v.ultima_solicitud.por ? ` · ${v.ultima_solicitud.por}` : ''}` : '—'}</Celda>
                <Celda><span className="c-secondary">{alq && v.alquiler_nota ? v.alquiler_nota : '—'}</span></Celda>
                <Celda alinear="center">
                  <MenuFila etiqueta={`Acciones de ${v.placa}`} acciones={[
                    { label: 'Ver documentos', icon: <FileText size={17} />, onSelect: () => onVerDocumentos(v.placa) },
                    puedeEditar && { label: alq ? 'Editar alquiler' : 'Marcar como alquilada', icon: alq ? <Pencil size={17} /> : <Handshake size={17} />, onSelect: () => onAlquiler(v.placa) },
                    puedeEditar && !!ext && { label: 'Pedir actualización', icon: <Send size={17} />, onSelect: () => onPedirActualizacion(v.placa) },
                  ]} />
                </Celda>
              </tr>
            );
          })}
        </TablaRedimensionable>
      )}
    </div>
  );
}
