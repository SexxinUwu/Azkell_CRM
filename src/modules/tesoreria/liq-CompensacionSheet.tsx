import { useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { escribirTesoreria } from './api';
import { DESTINOS, previaCompensacion, soles, type Gasto, type TipoCompensacion } from './liq-utils';

interface Props {
  open: boolean;
  onClose: () => void;
  codigo: string;
  tipo: TipoCompensacion;
  saldo: number;
  conductor: string;
  placa: string | null;
  gastos: Gasto[];
  onGenerado: () => void;
}

// Caja de compensación: elegir destino y revisar lo que se va a registrar; la confirmación es un paso aparte
// porque genera cajas en Tesorería (no es reversible desde esta pantalla).
export function CompensacionSheet({ open, onClose, codigo, tipo, saldo, conductor, placa, gastos, onGenerado }: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const opciones = DESTINOS[tipo];
  const [destino, setDestino] = useState(opciones[0].value);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDestino(DESTINOS[tipo][0].value);
    setConfirmando(false);
    setError(null);
  }, [open, tipo]);

  const esDevolucion = tipo === 'DEVOLUCION_EMPRESA';
  const importe = Math.abs(saldo);
  const previa = previaCompensacion(tipo, saldo, gastos);
  const etiquetaDestino = opciones.find(o => o.value === destino)?.label ?? destino;

  async function generar() {
    if (!previa.cuadra) return;
    setEnviando(true); setError(null);
    try {
      const r = await escribirTesoreria('/tesoreria/liquidaciones-gastos/generar-caja-compensacion', 'POST', {
        orden_viaje: codigo,
        tipo_compensacion: tipo,
        destino_devolucion: destino,
        importe,
        conductor,
        placa: placa ?? '',
        usuario_creacion: user?.name ?? 'TESORERIA',
        descripcion: `Compensación automática liquidación viaje ${codigo} [Destino: ${destino}]`,
      });
      haptic('success');
      toast(r.message || 'Caja de compensación generada');
      setConfirmando(false);
      onGenerado();
    } catch (err) {
      setError(errorMessage(err));
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={() => !enviando && onClose()}
        title={esDevolucion ? 'Devolución del sobrante' : 'Reembolso al conductor'}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" disabled={!previa.cuadra} onClick={() => { haptic('selection'); setConfirmando(true); }}>
              Revisar
            </Button>
          </>
        }
      >
        <div className="liq-stack">
          <Notice tone="neutral">
            {esDevolucion
              ? <>El conductor debe devolver <strong className="liq-num">{soles(importe)}</strong> a la empresa.</>
              : <>La empresa debe reembolsar <strong className="liq-num">{soles(importe)}</strong> al conductor.</>}
          </Notice>

          <fieldset className="liq-opciones">
            <legend className="field__label">{esDevolucion ? '¿A dónde ingresa el sobrante?' : '¿Cómo se reembolsa el gasto en exceso?'}</legend>
            {opciones.map(o => (
              <label key={o.value} className={`liq-opcion${destino === o.value ? ' liq-opcion--on' : ''}`}>
                <input
                  type="radio"
                  name="liq-destino"
                  value={o.value}
                  checked={destino === o.value}
                  onChange={() => { haptic('selection'); setDestino(o.value); }}
                />
                <span className="liq-opcion__cuerpo">
                  <span className="liq-opcion__titulo">{o.label}</span>
                  <span className="liq-opcion__ayuda">{o.ayuda}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="liq-previa">
            <span className="liq-previa__titulo">{esDevolucion ? 'Caja que se registra' : `Cajas que se registran (${previa.lineas.length})`}</span>
            {previa.lineas.map(l => (
              <div key={l.concepto} className="liq-previa__linea">
                <span>{l.concepto}</span>
                <span className="liq-num">{soles(l.importe)}</span>
              </div>
            ))}
            <div className="liq-previa__linea liq-previa__linea--total">
              <span>Total</span>
              <span className="liq-num">{soles(previa.total)}</span>
            </div>
          </div>

          {!previa.cuadra && (
            <Notice tone="error" icon={<CircleAlert size={16} />}>
              Los gastos rendidos suman <strong className="liq-num">{soles(previa.total)}</strong>, pero el faltante es{' '}
              <strong className="liq-num">{soles(importe)}</strong>. Con este cálculo se sobrepagarían{' '}
              <strong className="liq-num">{soles(previa.sobrepago)}</strong>, así que no se genera hasta corregir el reembolso en el servidor.
            </Notice>
          )}
        </div>
      </Sheet>

      <Sheet
        open={open && confirmando}
        onClose={() => !enviando && setConfirmando(false)}
        title="Confirmar caja de compensación"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmando(false)} disabled={enviando}>Volver</Button>
            <Button variant="primary" onClick={generar} loading={enviando}>Generar caja</Button>
          </>
        }
      >
        <div className="liq-stack">
          <p className="t-callout c-secondary">
            {esDevolucion
              ? <>Se registrará 1 caja de INGRESO por <strong className="liq-num">{soles(importe)}</strong> del viaje {codigo}. Forma de pago: {etiquetaDestino}.</>
              : <>Se registrarán {previa.lineas.length} {previa.lineas.length === 1 ? 'caja' : 'cajas'} de EGRESO por <strong className="liq-num">{soles(previa.total)}</strong> del viaje {codigo}. Forma de pago: {etiquetaDestino}.</>}
            {' '}Quedan PENDIENTE hasta que tesorería las procese en Caja. El viaje pasa a LIQUIDADO solo cuando el saldo cuadra.
          </p>
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        </div>
      </Sheet>
    </>
  );
}
