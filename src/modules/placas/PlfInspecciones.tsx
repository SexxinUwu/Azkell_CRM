import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api, errorMessage } from '../../core/api/client';
import { Button } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { formatFechaPe } from '../../core/lib/format';
import { MM_CRITICO } from '../mantenimiento/neumaticosSemaforo';

// Resumen de inspecciones de neumáticos de la placa. Usa el mismo endpoint y la misma clave de caché
// que NeumaticosHistorialPlaca, así que el historial completo abre con los datos ya cargados.
interface InspeccionResumen {
  id_inspeccion: string;
  fecha: string;
  km: number | null;
  promedio_general: number | null;
  criticas: number;
  llantas_cuenta: number;
}
interface RespuestaResumen { ok: boolean; error?: string; inspecciones: InspeccionResumen[] }

const ULTIMAS = 5;

const mm = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} mm`);
const km = (v: number | null) => (v === null ? '—' : `${Math.round(v).toLocaleString('es-PE')} km`);

// Solo se monta cuando su pestaña está activa (la consulta se hace al entrar)
export function PlfInspecciones({ placa, onVerHistorial }: { placa: string; onVerHistorial: () => void }) {
  const historial = useQuery<RespuestaResumen>({
    queryKey: ['neumaticos', 'historial-placa', placa, '', ''],
    queryFn: async () => {
      const r = await api<RespuestaResumen>(`/neumaticos/historial-placa/${encodeURIComponent(placa)}`);
      if (!r.ok) throw new Error(r.error || 'No se pudo cargar el historial');
      return r;
    },
    enabled: Boolean(placa),
    staleTime: 30_000,
  });

  if (historial.isLoading) return <p className="t-footnote c-secondary">Cargando inspecciones…</p>;

  if (historial.isError) {
    return <Notice tone="error">{errorMessage(historial.error)}</Notice>;
  }

  const todas = [...(historial.data?.inspecciones ?? [])].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const ultimas = todas.slice(0, ULTIMAS);
  const ultima = todas[0];

  if (todas.length === 0) {
    return (
      <EmptyState icon={<History size={28} />} title="Sin inspecciones de neumáticos">
        Cuando se registre una inspección de esta unidad aparecerá aquí.
      </EmptyState>
    );
  }

  return (
    <div className="plf-insp">
      <div className="plf-stats">
        <div className="plf-stat">
          <span className="plf-stat__label">Inspecciones</span>
          <span className="plf-stat__valor t-numeric">{todas.length}</span>
        </div>
        <div className="plf-stat">
          <span className="plf-stat__label">Última</span>
          <span className="plf-stat__valor">{formatFechaPe(ultima.fecha)}</span>
        </div>
        <div className="plf-stat">
          <span className="plf-stat__label">Promedio último</span>
          <span className="plf-stat__valor t-numeric">{mm(ultima.promedio_general)}</span>
        </div>
        <div className="plf-stat">
          <span className="plf-stat__label">Críticas último</span>
          <span className={`plf-stat__valor t-numeric${ultima.criticas > 0 ? ' plf-stat__valor--alerta' : ''}`}>{ultima.criticas}</span>
        </div>
      </div>

      <section className="plf-insp__lista">
        <div className="list__header">Últimas inspecciones</div>
        <div className="list">
          {ultimas.map(i => (
            <div key={i.id_inspeccion} className="row plf-insp__fila">
              <span className="row__main">
                <span className="plf-insp__fecha">{formatFechaPe(i.fecha)}</span>
                <span className="t-caption c-tertiary">{km(i.km)} · {i.llantas_cuenta} llantas</span>
              </span>
              <span className="plf-insp__cifras">
                <span className="t-numeric">{mm(i.promedio_general)}</span>
                <span className={`t-caption${i.criticas > 0 ? ' plf-insp__critica' : ' c-tertiary'}`}>
                  {i.criticas > 0 ? `${i.criticas} < ${MM_CRITICO} mm` : 'Sin críticas'}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="plf-barra">
        <Button variant="secondary" icon={<History size={16} />} onClick={onVerHistorial}>
          Ver historial completo
        </Button>
      </div>
    </div>
  );
}
