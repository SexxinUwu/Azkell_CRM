import './conduccion-rpm.css';
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Gauge, Info, Play } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { CargadorCrow } from '../../core/ui/CargadorCrow';
import '../../core/ui/cargador-crow.css';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

interface PlacaRpm { placa: string; tipo: string; sub_tipo: string; modelo_motor: string; modelo_conocido: boolean }
interface Conteos { ralenti: number; bajo: number; verde: number; potencia: number; sobre: number }
interface ResultadoRpm {
  ok: boolean; placa: string; modelo_motor: string; sin_datos?: boolean; plantilla: string;
  rangos: { modelo: string; conocido: boolean; limites: [number, number, number, number] };
  desde: string; hasta: string; primera_lectura: string; ultima_lectura: string;
  filas_leidas: number; con_motor: number; conteos: Conteos; util: number;
  porcentajes: { bajo: number; verde: number; potencia: number };
  meta: { bajo: number; verde: number; potencia: number; sobre: number };
  rpm_media: number; rpm_max: number; km_recorridos: number | null;
}

/** Fecha y hora de Lima para un <input type="datetime-local"> */
function aInput(d: Date) {
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return s.replace(' ', 'T');
}
const hace = (dias: number) => aInput(new Date(Date.now() - dias * 86400000));
const num = (n: number) => n.toLocaleString('es-PE');

/** Qué tan cerca está el reparto de la meta (20 / 60 / 20 y cero sobrerrevoluciones): 100 = justo en la meta */
function ajusteAMeta(r: ResultadoRpm) {
  const desvio = Math.abs(r.porcentajes.bajo - r.meta.bajo) + Math.abs(r.porcentajes.verde - r.meta.verde) + Math.abs(r.porcentajes.potencia - r.meta.potencia);
  const sobre = r.con_motor > 0 ? (r.conteos.sobre / r.con_motor) * 100 : 0;
  return Math.max(0, Math.round(100 - desvio / 2 - sobre * 5));
}
const nota = (p: number) => (p >= 85 ? { txt: 'Excelente', tono: 'ok' } : p >= 70 ? { txt: 'Buena', tono: 'ok' } : p >= 50 ? { txt: 'Regular', tono: 'medio' } : { txt: 'A mejorar', tono: 'mal' });

// Operaciones Marsisa › Combustible › Conducción por RPM
export function ConduccionRpmPage() {
  const [placa, setPlaca] = useState<string | null>(null);
  const [desde, setDesde] = useState(hace(7));
  const [hasta, setHasta] = useState(hace(0));

  const placas = useQuery({ queryKey: ['conduccion-rpm', 'placas'], queryFn: () => api<{ ok: boolean; data: PlacaRpm[] }>('/operaciones/conduccion-rpm/placas') });
  const lista = placas.data?.data ?? [];
  const opciones = useMemo(() => lista.map(p => ({ value: p.placa, label: p.placa, description: [p.tipo, p.modelo_motor || 'sin modelo de motor'].filter(Boolean).join(' · ') })), [lista]);
  const elegida = lista.find(p => p.placa === placa) ?? null;

  const consulta = useMutation({
    mutationFn: () => api<ResultadoRpm>('/operaciones/conduccion-rpm/analizar', { method: 'POST', body: { placa, desde, hasta } }),
  });
  const r = consulta.data;
  const listo = !!placa && !!desde && !!hasta && desde < hasta;

  return (
    <Page wide>
      <PageHeader eyebrow="Operaciones Marsisa · Combustible" title="Conducción por RPM"
        subtitle="Cuántas lecturas de cada unidad caen en cada rango de RPM según su motor, desde el GPS (Wialon)" />

      <form className="rpm-filtros" onSubmit={e => { e.preventDefault(); if (listo && !consulta.isPending) { haptic('selection'); consulta.mutate(); } }}>
        <Field label="Placa">{p => (
          <Combobox {...p} options={opciones} value={placa} onChange={setPlaca} placeholder="Elige la unidad" loading={placas.isLoading} enHoja tituloHoja="Elige la unidad" />
        )}</Field>
        <Field label="Inicio del viaje">{p => <TextInput {...p} type="datetime-local" value={desde} onChange={e => setDesde(e.target.value)} />}</Field>
        <Field label="Fin del viaje">{p => <TextInput {...p} type="datetime-local" value={hasta} onChange={e => setHasta(e.target.value)} />}</Field>
        <div className="rpm-filtros__rapidos" role="group" aria-label="Rangos rápidos">
          {[['24 h', 1], ['3 días', 3], ['7 días', 7], ['15 días', 15]].map(([t, d]) => (
            <button key={t} type="button" onClick={() => { setDesde(hace(Number(d))); setHasta(hace(0)); }}>{t}</button>
          ))}
        </div>
        <Button type="submit" variant="primary" icon={<Play size={16} />} loading={consulta.isPending} disabled={!listo}>Analizar</Button>
      </form>
      {elegida && !elegida.modelo_conocido && (
        <Notice tone="accent" icon={<Info size={16} />}>
          {elegida.modelo_motor ? `El modelo «${elegida.modelo_motor}» no está en la tabla de rangos.` : 'Esta placa no tiene el modelo de motor en su ficha.'} Se usan los rangos generales (800 · 1150 · 1400 · 1900). Cárgalo en la ficha de la placa para ver sus rangos reales.
        </Notice>
      )}
      {placas.isError && <Notice tone="error">{errorMessage(placas.error)}</Notice>}
      {desde >= hasta && <Notice tone="error">La fecha de fin debe ser posterior a la de inicio.</Notice>}
      {consulta.isError && <Notice tone="error">{errorMessage(consulta.error)}</Notice>}

      {consulta.isPending ? (
        <div className="rpm-espera"><CargadorCrow texto="Consultando el GPS… puede tardar hasta un minuto en rangos largos" /></div>
      ) : !r ? (
        <EmptyState icon={<Gauge size={22} />} title="Elige una unidad y las fechas del viaje">
          Se cuenta cada lectura del motor encendido y se reparte en ralentí, bajo torque, zona verde, potencia y sobrerrevolución. El objetivo es 20 % · 60 % · 20 %.
        </EmptyState>
      ) : r.sin_datos ? (
        <EmptyState icon={<Gauge size={22} />} title="El GPS no trae lecturas en ese rango">Revisa las fechas o que la unidad haya reportado.</EmptyState>
      ) : <Resultado r={r} />}
    </Page>
  );
}

function Resultado({ r }: { r: ResultadoRpm }) {
  const [a, b, c, d] = r.rangos.limites;
  const ajuste = ajusteAMeta(r);
  const n = nota(ajuste);
  const columnas: Array<{ id: keyof Conteos; titulo: string; rango: string; meta: string | null; tono: string; pct: number | null }> = [
    { id: 'ralenti', titulo: 'Ralentí', rango: `< ${num(a)}`, meta: null, tono: 'gris', pct: null },
    { id: 'bajo', titulo: 'Bajo torque', rango: `${num(a)} – ${num(b)}`, meta: `${r.meta.bajo} %`, tono: 'ambar', pct: r.porcentajes.bajo },
    { id: 'verde', titulo: 'Zona verde', rango: `${num(b + 1)} – ${num(c)}`, meta: `${r.meta.verde} %`, tono: 'verde', pct: r.porcentajes.verde },
    { id: 'potencia', titulo: 'Potencia', rango: `${num(c + 1)} – ${num(d)}`, meta: `${r.meta.potencia} %`, tono: 'ambar', pct: r.porcentajes.potencia },
    { id: 'sobre', titulo: 'Sobrerrevolución', rango: `> ${num(d)}`, meta: `${r.meta.sobre}`, tono: 'rojo', pct: null },
  ];

  return (
    <div className="rpm-resultado">
      <section className="rpm-tarjeta rpm-resumen">
        <div className="rpm-resumen__placa">
          <LicensePlate plate={r.placa} size="sm" />
          <div><strong>{r.modelo_motor || 'Sin modelo de motor'}</strong><small>{r.primera_lectura} → {r.ultima_lectura}</small></div>
        </div>
        <div className="rpm-resumen__nota" data-tono={n.tono} title="Qué tan cerca está el reparto de la meta 20 / 60 / 20 sin sobrerrevoluciones">
          <span className="rpm-resumen__valor t-numeric">{ajuste}</span>
          <span><strong>{n.txt}</strong><small>ajuste a la meta</small></span>
        </div>
        <dl className="rpm-datos">
          <div><dt>Lecturas con motor encendido</dt><dd className="t-numeric">{num(r.con_motor)}</dd></div>
          <div><dt>RPM media</dt><dd className="t-numeric">{num(r.rpm_media)}</dd></div>
          <div><dt>RPM máxima</dt><dd className="t-numeric">{num(r.rpm_max)}</dd></div>
          {r.km_recorridos != null && <div><dt>Km recorridos</dt><dd className="t-numeric">{num(r.km_recorridos)}</dd></div>}
        </dl>
      </section>

      <section className="rpm-tarjeta">
        <div className="rpm-barra" role="img" aria-label="Reparto de lecturas entre bajo torque, zona verde y potencia">
          <i className="rpm-barra__ambar" style={{ width: `${r.porcentajes.bajo}%` }} />
          <i className="rpm-barra__verde" style={{ width: `${r.porcentajes.verde}%` }} />
          <i className="rpm-barra__ambar rpm-barra__ambar--2" style={{ width: `${r.porcentajes.potencia}%` }} />
        </div>
        <div className="rpm-cuadro">
          {columnas.map(col => (
            <div key={col.id} className={`rpm-celda rpm-celda--${col.tono}`}>
              <span className="rpm-celda__titulo">{col.titulo}</span>
              <span className="rpm-celda__rango t-numeric">{col.rango}</span>
              <strong className="rpm-celda__n t-numeric">{num(r.conteos[col.id])}</strong>
              <span className="rpm-celda__pct t-numeric">{col.pct != null ? `${col.pct.toLocaleString('es-PE', { maximumFractionDigits: 1 })} %` : col.id === 'ralenti' ? 'no cuenta en el %' : 'meta: cero'}</span>
              {col.meta && col.pct != null && <span className="rpm-celda__meta">meta {col.meta}</span>}
            </div>
          ))}
        </div>
        <p className="rpm-pie">Los porcentajes se calculan sobre las lecturas de bajo torque, zona verde y potencia ({num(r.util)}). El ralentí y la sobrerrevolución se muestran aparte. Rangos del motor {r.modelo_motor || 'general'}{r.rangos.conocido ? '' : ' (generales)'}.</p>
      </section>
    </div>
  );
}
