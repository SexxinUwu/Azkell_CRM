import type { ReactNode } from 'react';
import { formatFechaPe } from '../../core/lib/format';
import { useFicha } from './NeumaticoHojaVida';
import { RemanenteChip, VidaChip, remanenteMinimo } from './ntb-llanta';
import type { LlantaTablero } from './neumaticos-tablero-tipos';
import { estimarCambio, MM_RETEN, type NivelCambio } from './neumaticosVida';

// Panel «Detalles de neumático» del tablero, en tres secciones: al montar, datos del neumático y última inspección (con su fecha).

const miles = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('es-PE'));
const fecha = (f: string | null | undefined) => (f ? formatFechaPe(f.slice(0, 10)) : '—');
const mmTexto = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)} mm`);
/** Estimaciones: se redondean a la centena (no tiene sentido prometer el último kilómetro) */
const aprox = (n: number) => (Math.round(n / 100) * 100).toLocaleString('es-PE');
const ETIQUETA_NIVEL: Record<NivelCambio, string> = { green: 'Va bien', amber: 'Cambio próximo', red: 'Cambiar ya' };

function Dato({ etiqueta, children, ancho }: { etiqueta: string; children: ReactNode; ancho?: boolean }) {
  return <div className={ancho ? 'ntb-det__erres' : undefined}><dt>{etiqueta}</dt><dd>{children}</dd></div>;
}

function Seccion({ titulo, derecha, children }: { titulo: string; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section className="ntb-sec" aria-label={titulo}>
      <header className="ntb-sec__cab">
        <h3 className="ntb-sec__titulo">{titulo}</h3>
        {derecha && <span className="ntb-sec__derecha">{derecha}</span>}
      </header>
      <dl className="ntb-det__datos">{children}</dl>
    </section>
  );
}

export function DetalleSecciones({ llanta, grupo, placa, posicion, ubicacion }: {
  llanta: LlantaTablero; grupo: string; placa: string; posicion: string | null; ubicacion: string;
}) {
  const q = useFicha(llanta.codigo);
  const c = q.data?.cocada ?? null;
  const montaje = c && c.montajes.length ? c.montajes[c.montajes.length - 1] : null;
  const alMontar = montaje?.alMontar ?? null;
  // Mediciones de inspección en orden cronológico; la «Alta» no es una inspección
  const inspecciones = (c?.mediciones ?? []).filter(m => m.origen !== 'Alta');
  const ultima = inspecciones.length ? inspecciones[inspecciones.length - 1] : null;
  const enUnidad = grupo === 'unidad';

  const fechaMontaje = enUnidad ? (llanta.fecha_montaje ?? montaje?.fechaIn ?? null) : (montaje?.fechaIn ?? null);
  const kmMontaje = enUnidad ? (llanta.km_montaje ?? montaje?.kmIn ?? null) : (montaje?.kmIn ?? null);
  const dondeMontada = enUnidad ? `${placa} · ${posicion ?? '—'}` : (montaje?.placa ? `${montaje.placa} · ${montaje.posicion ?? '—'}` : null);

  // Una inspección posterior al montaje con km 0 casi seguro es un olvido al digitar: daría un ritmo de desgaste falso
  const kmSinRegistrar = !!ultima && (ultima.km == null || ultima.km === 0) && !!fechaMontaje && !!ultima.fecha && ultima.fecha.slice(0, 10) > fechaMontaje.slice(0, 10);
  const estimacion = estimarCambio({
    inicial: c?.inicial ?? null, minimoUltima: ultima?.minimo ?? null, kmUltima: ultima?.km ?? null,
    kmMontaje: kmMontaje, kmRecorridos: llanta.km_recorridos ?? null,
  });
  const minimo = ultima?.minimo ?? remanenteMinimo(llanta);
  const r = ultima ? [ultima.interno, ultima.central, ultima.externo] : [llanta.r1 ?? null, llanta.r2 ?? null, llanta.r3 ?? null];

  return (
    <>
      {/* 1. Información al montar */}
      <Seccion titulo={enUnidad ? 'Al montar' : 'Último montaje'}>
        {fechaMontaje || montaje ? (
          <>
            <Dato etiqueta="Montada desde">{fecha(fechaMontaje)}</Dato>
            <Dato etiqueta={enUnidad ? 'Unidad · posición' : 'Estuvo en'}>{dondeMontada ?? '—'}</Dato>
            <Dato etiqueta="Km al montar">{miles(kmMontaje)}</Dato>
            <Dato etiqueta="Cocada al montar"><RemanenteChip mm={alMontar?.minimo ?? c?.inicial ?? null} /></Dato>
          </>
        ) : (
          <Dato etiqueta="Montaje" ancho>Todavía no se ha montado en ninguna unidad.</Dato>
        )}
      </Seccion>

      {/* 2. Datos del neumático */}
      <Seccion titulo="Datos del neumático">
        <Dato etiqueta="Marca">{llanta.marca ?? '—'}</Dato>
        <Dato etiqueta="Modelo">{llanta.modelo ?? '—'}</Dato>
        <Dato etiqueta="Medida">{llanta.medida ?? '—'}</Dato>
        <Dato etiqueta="Vida"><VidaChip vida={llanta.vida} /></Dato>
        <Dato etiqueta="Ubicación">{ubicacion}</Dato>
        <Dato etiqueta="Cocada al ingresar (alta)"><RemanenteChip mm={c?.inicial ?? null} /></Dato>
        <Dato etiqueta="Km recorridos">{miles(llanta.km_recorridos)}</Dato>
      </Seccion>

      {/* 3. Última inspección realizada */}
      <Seccion titulo="Última inspección" derecha={ultima ? fecha(ultima.fecha) : null}>
        {ultima || llanta.remanente_mm != null ? (
          <>
            {!ultima && <Dato etiqueta="Fecha de inspección">Sin fecha registrada</Dato>}
            <Dato etiqueta="Remanente (mínimo)"><RemanenteChip mm={minimo} /></Dato>
            <Dato etiqueta="Medidas R1 · R2 · R3" ancho>
              {(['R1', 'R2', 'R3'] as const).map((k, i) => (
                <span key={k} className="ntb-erre"><b>{k}</b><RemanenteChip mm={r[i] ?? null} /></span>
              ))}
            </Dato>
            <Dato etiqueta="Km de la unidad">{kmSinRegistrar ? <span className="ntb-det__aviso">0 · revisar: el km no se registró</span> : miles(ultima?.km ?? null)}</Dato>
            <Dato etiqueta="Presión">{q.data?.presionUltima != null ? `${q.data.presionUltima} PSI${q.data.presionFecha ? ` · ${fecha(q.data.presionFecha)}` : ''}` : '—'}</Dato>
            <Dato etiqueta="Desgaste desde el montaje">
              {c?.desgasteMm != null ? `${mmTexto(c.desgasteMm)}${c.mmPor1000Km != null ? ` · ${c.mmPor1000Km.toFixed(2)} mm por 1 000 km` : ''}` : '—'}
            </Dato>
          </>
        ) : (
          <Dato etiqueta="Inspección" ancho>Esta llanta todavía no tiene inspecciones.</Dato>
        )}
      </Seccion>
      {/* 4. Cambio estimado: cuánto le queda hasta sacarla (retén) */}
      {enUnidad && (
        <Seccion titulo="Cambio estimado" derecha={`Retén a ${MM_RETEN} mm`}>
          {estimacion.ok ? (
            <>
              <div className="ntb-cambio ntb-det__erres">
                <span className={`ntb-cambio__chip ntb-cambio__chip--${estimacion.nivel}`}>{ETIQUETA_NIVEL[estimacion.nivel]}</span>
                <strong className="ntb-cambio__km">
                  {estimacion.restantesHoy <= 0 ? 'Ya llegó al retén' : `≈ ${aprox(estimacion.restantesHoy)} km restantes`}
                </strong>
              </div>
              <Dato etiqueta="Ritmo de desgaste">{Math.round(estimacion.kmPorMm).toLocaleString('es-PE')} km por mm</Dato>
              <Dato etiqueta={`Vida total estimada (${c?.inicial ?? '—'} → ${estimacion.reten} mm)`}>{aprox(estimacion.vidaTotalKm)} km</Dato>
              <Dato etiqueta="Km recorridos">{miles(llanta.km_recorridos)}</Dato>
              <Dato etiqueta="Faltan hasta el retén">{mmTexto(estimacion.mmHastaReten)}</Dato>
              <Dato etiqueta="Cómo se calculó" ancho>
                <span className="ntb-det__nota">
                  Ritmo = {miles(estimacion.kmTramo)} km ÷ {estimacion.mmGastados.toFixed(1)} mm gastados (inspección del {fecha(ultima?.fecha)}).
                  Vida total = ({c?.inicial ?? '—'} − {estimacion.reten}) × ritmo. Restan = vida total − km recorridos. Estimación lineal: supone un desgaste parejo; se recalcula en cada inspección.
                </span>
              </Dato>
            </>
          ) : (
            <Dato etiqueta="Estimación" ancho><span className="ntb-det__nota">{estimacion.motivo}</span></Dato>
          )}
        </Seccion>
      )}
    </>
  );
}
