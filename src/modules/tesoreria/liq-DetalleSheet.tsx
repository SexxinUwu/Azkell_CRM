import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Paperclip } from 'lucide-react';
import { api } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, Notice } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { CompensacionSheet } from './liq-CompensacionSheet';
import {
  fechaPe, gastosVigentes, num, redondear, soles, solesConSigno, urlComprobante,
  type Caja, type DetalleViaje, type TipoCompensacion, type Viaje,
} from './liq-utils';

const COLUMNAS_CAJAS: ColumnaTabla[] = [
  { id: 'caja', titulo: 'Caja', ancho: 130 },
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'motivo', titulo: 'Motivo', ancho: 170 },
  { id: 'submotivo', titulo: 'Submotivo', ancho: 220 },
  { id: 'importe', titulo: 'Importe', ancho: 120, alinear: 'right' },
  { id: 'voucher', titulo: 'Voucher', ancho: 90, alinear: 'center' },
  { id: 'estado', titulo: 'Estado', ancho: 130 },
];

const COLUMNAS_GASTOS: ColumnaTabla[] = [
  { id: 'n', titulo: '#', ancho: 52, alinear: 'center' },
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'tipo', titulo: 'Tipo de gasto', ancho: 160 },
  { id: 'submotivo', titulo: 'Submotivo', ancho: 180 },
  { id: 'comprobante', titulo: 'Comprobante', ancho: 150 },
  { id: 'proveedor', titulo: 'Proveedor', ancho: 190 },
  { id: 'detalle', titulo: 'Detalle', ancho: 220 },
  { id: 'sustento', titulo: 'Sustento', ancho: 90, alinear: 'center' },
  { id: 'importe', titulo: 'Importe', ancho: 120, alinear: 'right' },
];

const enlace = (url: string, texto: string) => (
  <a className="liq-enlace" href={url} target="_blank" rel="noreferrer">
    <Paperclip size={13} aria-hidden /> {texto}
  </a>
);

// Detalle de liquidación de un viaje: entregado vs. rendido, cajas, gastos y la caja de compensación.
export function LiquidacionDetalle({ viaje, abierto, onClose }: { viaje: Viaje | null; abierto: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const movil = useMediaQuery(MOBILE_QUERY);
  const [compensando, setCompensando] = useState(false);
  const codigo = viaje?.viaje ?? '';

  const det = useQuery<DetalleViaje>({
    queryKey: ['tesoreria', 'liquidacion', codigo],
    enabled: !!codigo,
    queryFn: () => api<DetalleViaje>(`/tesoreria/liquidaciones-gastos?orden_viaje=${encodeURIComponent(codigo)}`),
  });
  const cajas = useQuery<Caja[]>({
    queryKey: ['tesoreria', 'liquidacion-cajas', codigo],
    enabled: !!codigo,
    queryFn: () => api<{ data?: Caja[] }>(`/tesoreria/caja?orden_viaje=${encodeURIComponent(codigo)}`).then(r => (Array.isArray(r.data) ? r.data : [])),
  });

  const d = det.data;
  const gastos = d?.gastos ?? [];
  const listaCajas = cajas.data ?? [];
  const saldo = d ? redondear(num(d.saldo_diferencia)) : 0;
  // Saldo > 0: sobró dinero (lo devuelve el conductor). Saldo < 0: gastó de más (se le reembolsa).
  const tipo: TipoCompensacion | null = saldo > 0 ? 'DEVOLUCION_EMPRESA' : saldo < 0 ? 'REEMBOLSO_CONDUCTOR' : null;
  const conductor = listaCajas[0]?.conductor || listaCajas[0]?.persona || viaje?.conductor || '';
  const pendientePago = num(d?.total_pendiente_pago);

  // Gastos rendidos por tipo (los rechazados no cuentan, igual que en el total)
  const porTipo = gastosVigentes(gastos).reduce<Record<string, number>>((acc, g) => {
    const k = g.tipo_gasto || 'Sin tipo';
    acc[k] = redondear((acc[k] ?? 0) + num(g.importe));
    return acc;
  }, {});

  const metricaSaldo = saldo < 0 ? ' inv-metrica__num--critical' : saldo > 0 ? ' inv-metrica__num--warning' : '';

  return (
    <Sheet
      open={abierto}
      onClose={() => !compensando && onClose()}
      title={`Liquidación del viaje ${codigo}`}
      ancho
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      {!viaje ? null : det.isLoading ? <PageLoader /> : det.isError || !d?.ok ? (
        <Notice tone="error">No se pudo cargar la información del viaje.</Notice>
      ) : (
        <div className="liq-stack">
          <div className="liq-cabecera">
            <strong>{viaje.conductor || 'Sin conductor'}</strong>
            <span>{[viaje.placa_tracto, viaje.placa_remolque].filter(Boolean).join(' / ') || 'Sin placa'}</span>
            <span>{viaje.ruta || 'Sin ruta'}</span>
            <span>Fecha {fechaPe(viaje.fecha)}</span>
          </div>

          <div className="inv-metricas">
            <div className="inv-metrica"><span className="inv-metrica__num liq-num">{soles(d.total_depositado)}</span><span className="inv-metrica__label">Total entregado</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num liq-num">{soles(d.total_rendido)}</span><span className="inv-metrica__label">Total rendido</span></div>
            <div className="inv-metrica"><span className={`inv-metrica__num liq-num${metricaSaldo}`}>{solesConSigno(saldo)}</span><span className="inv-metrica__label">Saldo / diferencia</span></div>
          </div>

          <Notice tone={d.estado_viaje === 'LIQUIDADO' ? 'success' : 'neutral'}>
            Estado del viaje: <strong>{d.estado_viaje ?? '—'}</strong>.{' '}
            {d.estado_viaje === 'LIQUIDADO'
              ? 'El saldo cuadra: el viaje está liquidado.'
              : d.estado_viaje && d.estado_viaje !== 'FINALIZADO'
                ? 'Para pasar a LIQUIDADO el viaje debe estar FINALIZADO.'
                : 'Pasa a LIQUIDADO automáticamente cuando el saldo queda en S/ 0.00 y no hay fondos pendientes.'}
          </Notice>

          {pendientePago > 0 && (
            <Notice tone="error" icon={<CircleAlert size={16} />}>
              Fondos pendientes de entrega o pago: <strong className="liq-num">{soles(pendientePago)}</strong>. El viaje no pasa a LIQUIDADO hasta que tesorería procese o anule esas solicitudes.
            </Notice>
          )}

          {tipo && can('tesoreria_liquidaciones.crear', 'tesoreria_caja.crear') && (
            <div className="liq-stack">
              <Notice tone="neutral">
                {tipo === 'DEVOLUCION_EMPRESA'
                  ? <>Sobrante de viáticos: el conductor debe devolver <strong className="liq-num">{soles(saldo)}</strong> a la empresa.</>
                  : <>Gasto en exceso: la empresa debe reembolsar <strong className="liq-num">{soles(Math.abs(saldo))}</strong> al conductor.</>}
              </Notice>
              <div>
                <Button variant="primary" onClick={() => setCompensando(true)}>
                  {tipo === 'DEVOLUCION_EMPRESA' ? 'Generar caja de ingreso (devolución)' : 'Generar caja de reembolso (egreso)'}
                </Button>
              </div>
            </div>
          )}

          <section>
            <p className="tarjeta__grupo-titulo">Cajas asignadas ({listaCajas.length})</p>
            {listaCajas.length === 0 ? (
              <p className="liq-seccion-vacia">No hay cajas asignadas a este viaje.</p>
            ) : movil ? (
              <div className="tarjeta__lista">
                {listaCajas.map((c, i) => {
                  const url = urlComprobante(c);
                  return (
                    <div key={c.id ?? i} className="dato">
                      <span className="dato__label liq-num">{c.serie}-{c.numero} · {fechaPe(c.fecha)}</span>
                      <span className="dato__valor">{[c.motivo, c.sub_motivo].filter(Boolean).join(' › ') || '—'} · <strong className="liq-num">{soles(c.importe_total)}</strong></span>
                      <span className="dato__valor"><Badge tone={c.estado === 'PROCESADO' ? 'green' : 'amber'}>{c.estado ?? 'PENDIENTE'}</Badge>{url && <> {enlace(url, 'Voucher')}</>}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <TablaRedimensionable id="liq-cajas" ariaLabel="Cajas asignadas al viaje" columnas={COLUMNAS_CAJAS} altoMax="40vh">
                {listaCajas.map((c, i) => {
                  const url = urlComprobante(c);
                  return (
                    <tr key={c.id ?? i}>
                      <Celda mono>{`${c.serie ?? ''}-${c.numero ?? ''}`}</Celda>
                      <Celda>{fechaPe(c.fecha)}</Celda>
                      <Celda>{c.motivo || '—'}</Celda>
                      <Celda>{c.sub_motivo || '—'}</Celda>
                      <Celda mono alinear="right">{soles(c.importe_total)}</Celda>
                      <Celda alinear="center">{url ? enlace(url, 'Ver') : '—'}</Celda>
                      <Celda><Badge tone={c.estado === 'PROCESADO' ? 'green' : 'amber'}>{c.estado ?? 'PENDIENTE'}</Badge></Celda>
                    </tr>
                  );
                })}
              </TablaRedimensionable>
            )}
          </section>

          <section>
            <p className="tarjeta__grupo-titulo">Gastos rendidos ({gastos.length})</p>
            {gastos.length === 0 ? (
              <p className="liq-seccion-vacia">Aún no hay gastos rendidos.</p>
            ) : movil ? (
              <div className="tarjeta__lista">
                {gastos.map((g, i) => {
                  const url = urlComprobante(g);
                  return (
                    <div key={g.id ?? i} className="dato">
                      <span className="dato__label">{fechaPe(g.fecha)} · {[g.tipo_gasto, g.sub_motivo].filter(Boolean).join(' › ') || 'Sin tipo'}</span>
                      <span className={`dato__valor${g.estado === 'RECHAZADO' ? ' liq-tachado' : ''}`}>{g.detalle || g.proveedor_nombre || '—'} · <strong className="liq-num">{soles(g.importe)}</strong></span>
                      <span className="liq-celda-aviso">{[g.tipo_comprobante, g.numero].filter(Boolean).join(' ')}{g.estado === 'RECHAZADO' ? ' · Rechazado' : ''}</span>
                      {url && <span className="dato__valor">{enlace(url, 'Sustento')}</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <TablaRedimensionable id="liq-gastos" ariaLabel="Gastos rendidos del viaje" columnas={COLUMNAS_GASTOS} altoMax="45vh">
                {gastos.map((g, i) => {
                  const url = urlComprobante(g);
                  const rechazado = g.estado === 'RECHAZADO';
                  return (
                    <tr key={g.id ?? i}>
                      <Celda mono alinear="center">{i + 1}</Celda>
                      <Celda>{fechaPe(g.fecha)}</Celda>
                      <Celda>{g.tipo_gasto || '—'}</Celda>
                      <Celda>{g.sub_motivo || '—'}</Celda>
                      <Celda mono>{[g.tipo_comprobante, g.numero].filter(Boolean).join(' ') || '—'}</Celda>
                      <Celda>{g.proveedor_nombre || '—'}</Celda>
                      <Celda>
                        {rechazado && <Badge tone="red">Rechazado</Badge>}{' '}{g.detalle || '—'}
                      </Celda>
                      <Celda alinear="center">{url ? enlace(url, 'Ver') : '—'}</Celda>
                      <Celda mono alinear="right" className={rechazado ? 'liq-tachado' : undefined}>{soles(g.importe)}</Celda>
                    </tr>
                  );
                })}
              </TablaRedimensionable>
            )}
          </section>

          <section>
            <p className="tarjeta__grupo-titulo">Resumen</p>
            <div className="tarjeta__lista">
              {Object.entries(porTipo).map(([tipoG, total]) => (
                <div key={tipoG} className="dato"><span className="dato__label">{tipoG}</span><span className="dato__valor liq-num">{soles(total)}</span></div>
              ))}
              <div className="dato"><span className="dato__label">Entregado (cajas)</span><span className="dato__valor liq-num">{soles(d.total_depositado)}</span></div>
              <div className="dato"><span className="dato__label">Rendido ({gastosVigentes(gastos).length} comprobantes)</span><span className="dato__valor liq-num">{soles(d.total_rendido)}</span></div>
              <div className="dato">
                <span className="dato__label">{saldo < 0 ? 'Saldo a favor del conductor' : saldo > 0 ? 'Saldo a favor de la empresa' : 'Saldo'}</span>
                <span className="dato__valor liq-num">{solesConSigno(saldo)}</span>
              </div>
            </div>
          </section>
        </div>
      )}

      {viaje && tipo && (
        <CompensacionSheet
          open={compensando}
          onClose={() => setCompensando(false)}
          codigo={codigo}
          tipo={tipo}
          saldo={saldo}
          conductor={conductor}
          placa={viaje.placa_tracto}
          gastos={gastos}
          onGenerado={() => {
            setCompensando(false);
            void qc.invalidateQueries({ queryKey: ['tesoreria'] });
          }}
        />
      )}
    </Sheet>
  );
}
