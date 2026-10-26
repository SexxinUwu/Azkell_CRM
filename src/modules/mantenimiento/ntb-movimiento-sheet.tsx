// Hoja de confirmación de un movimiento de llantas: dice qué pasa antes de ejecutarlo y pide los datos que faltan.
import { useState, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { decimalInput, digitsInput, parseDecimal } from '../../core/ui/forms';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import type { LlantaTablero } from './neumaticos-tablero-tipos';
import { ejecutarIntercambio, ejecutarMovimiento, tituloLlanta, vidaSiguiente, vidaTexto } from './ntb-api';

export type Propuesta =
  | { clase: 'instalar'; llanta: LlantaTablero; posicion: string }
  | { clase: 'intercambio'; entrante: LlantaTablero; saliente: LlantaTablero; posicion: string }
  | { clase: 'reforma' | 'descarte'; llanta: LlantaTablero; posicion: string }
  | { clase: 'retorno'; llanta: LlantaTablero };

type Destino = 'reencauche' | 'desecho';

interface Props {
  open: boolean;
  propuesta: Propuesta;
  placa: string;
  /** Enviar a reencauche permitido (reforma y la baja del intercambio) */
  puedeReencauche: boolean;
  /** Dar de baja permitido (descarte y la baja del intercambio) */
  puedeBaja: boolean;
  onClose: () => void;
  onHecho: (mensaje: string) => void;
}

const TITULOS: Record<Propuesta['clase'], string> = {
  instalar: 'Instalar llanta',
  intercambio: 'Cambiar llanta',
  reforma: 'Enviar a reforma',
  descarte: 'Enviar a descarte',
  retorno: 'Retorno de reencauche',
};

/** Kilometraje entero de la unidad; si la llanta ya estuvo montada no puede ser menor a su montaje */
function kilometraje(valor: string, minimo: number | null): number {
  const limpio = valor.trim();
  const n = Number(limpio);
  if (!limpio || !Number.isInteger(n) || n < 0) throw new Error('Escribe el kilometraje actual de la unidad (número entero).');
  if (minimo != null && n < minimo) throw new Error(`El kilometraje no puede ser menor al de montaje (${minimo.toLocaleString('es-PE')} km).`);
  return n;
}

function Resumen({ children }: { children: ReactNode }) {
  return <div className="ntb-resumen">{children}</div>;
}

export function MovimientoSheet({ open, propuesta, placa, puedeReencauche, puedeBaja, onClose, onHecho }: Props) {
  const opcionesDestino: Array<{ value: Destino; label: string }> = [
    ...(puedeReencauche ? [{ value: 'reencauche' as const, label: 'Reencauche' }] : []),
    ...(puedeBaja ? [{ value: 'desecho' as const, label: 'Dar de baja' }] : []),
  ];

  const [km, setKm] = useState('');
  const [destino, setDestino] = useState<Destino>(puedeReencauche ? 'reencauche' : 'desecho');
  const [proveedor, setProveedor] = useState('');
  const [costo, setCosto] = useState('');
  const [disenio, setDisenio] = useState('');
  const [remanente, setRemanente] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const sigueVida = vidaSiguiente(propuesta.clase === 'retorno' ? propuesta.llanta.vida : null);
  const destinoValido = propuesta.clase === 'intercambio' ? opcionesDestino.some(o => o.value === destino) : true;
  const bloqueada = propuesta.clase === 'retorno' ? !sigueVida : propuesta.clase === 'intercambio' && !destinoValido;

  async function confirmar() {
    setError(null);
    setEnviando(true);
    try {
      let mensaje = '';
      if (propuesta.clase === 'instalar') {
        const k = kilometraje(km, null);
        await ejecutarMovimiento({ clase: 'instalar', codigo: propuesta.llanta.codigo, placa, posicion: propuesta.posicion, km: k });
        mensaje = `${propuesta.llanta.codigo} montada en ${propuesta.posicion}`;
      } else if (propuesta.clase === 'intercambio') {
        if (!destinoValido) throw new Error('No tienes permiso para retirar la llanta que ocupa esta posición.');
        const salienteKm = kilometraje(km, propuesta.saliente.km_montaje ?? null);
        await ejecutarIntercambio(
          { codigo: propuesta.saliente.codigo, placa, posicion: propuesta.posicion, destino, km: salienteKm },
          { codigo: propuesta.entrante.codigo, placa, posicion: propuesta.posicion, km: salienteKm },
        );
        mensaje = `${propuesta.entrante.codigo} ocupa ${propuesta.posicion}`;
      } else if (propuesta.clase === 'reforma' || propuesta.clase === 'descarte') {
        const k = kilometraje(km, propuesta.llanta.km_montaje ?? null);
        const dest: Destino = propuesta.clase === 'reforma' ? 'reencauche' : 'desecho';
        await ejecutarMovimiento({ clase: 'retirar', codigo: propuesta.llanta.codigo, placa, posicion: propuesta.posicion, km: k, destino: dest });
        mensaje = propuesta.clase === 'reforma'
          ? `${propuesta.llanta.codigo} enviada a reforma`
          : `${propuesta.llanta.codigo} dada de baja`;
      } else {
        const c = parseDecimal(costo);
        if (Number.isNaN(c)) throw new Error('El costo del servicio no es válido.');
        const r = parseDecimal(remanente);
        if (Number.isNaN(r)) throw new Error('El remanente no es válido.');
        await ejecutarMovimiento({
          clase: 'retorno', codigo: propuesta.llanta.codigo, proveedor: proveedor.trim(),
          costo_servicio: c ?? 0, disenio: disenio.trim(), remanente: r,
        });
        mensaje = `${propuesta.llanta.codigo} regresó de reencauche`;
      }
      haptic('success');
      onHecho(mensaje);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  const descarte = propuesta.clase === 'descarte';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={TITULOS[propuesta.clase]}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant={descarte ? 'destructive' : 'accent'} onClick={confirmar} loading={enviando} disabled={bloqueada}>
            {descarte ? 'Dar de baja' : propuesta.clase === 'retorno' ? 'Registrar retorno' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="ntb-hoja">
        {propuesta.clase === 'instalar' && (
          <Resumen>
            <p>La llanta <b>{propuesta.llanta.codigo}</b> ({tituloLlanta(propuesta.llanta)}) se monta en la posición <b>{propuesta.posicion}</b> de <b>{placa}</b>.</p>
            <p className="ntb-hoja__nota">Sale de {propuesta.llanta.almacen || 'almacén'}. La posición queda ocupada hasta que la retires.</p>
          </Resumen>
        )}

        {propuesta.clase === 'intercambio' && (
          <Resumen>
            <p>1. La llanta <b>{propuesta.saliente.codigo}</b> sale de <b>{propuesta.posicion}</b> y se envía a {destino === 'desecho' ? 'baja' : 'reencauche'}.</p>
            <p>2. La llanta <b>{propuesta.entrante.codigo}</b> ({tituloLlanta(propuesta.entrante)}) ocupa <b>{propuesta.posicion}</b>.</p>
            {opcionesDestino.length > 0 ? (
              <SegmentedControl<Destino> label="Destino de la llanta que sale" value={destino} onChange={setDestino} options={opcionesDestino} block />
            ) : (
              <Notice tone="error" icon={<CircleAlert size={16} />}>No tienes permiso para retirar la llanta que ocupa esta posición.</Notice>
            )}
          </Resumen>
        )}

        {propuesta.clase === 'reforma' && (
          <Resumen>
            <p>La llanta <b>{propuesta.llanta.codigo}</b> sale de <b>{propuesta.posicion}</b> de <b>{placa}</b> y se envía a reencauche.</p>
            <p className="ntb-hoja__nota">Queda en Reforma hasta que registres su retorno.</p>
          </Resumen>
        )}

        {propuesta.clase === 'descarte' && (
          <Resumen>
            <p>La llanta <b>{propuesta.llanta.codigo}</b> sale de <b>{propuesta.posicion}</b> de <b>{placa}</b> y se da de baja (desecho).</p>
            <p className="ntb-hoja__nota">Esta acción no se puede deshacer desde el tablero.</p>
          </Resumen>
        )}

        {(propuesta.clase === 'instalar' || propuesta.clase === 'intercambio' || propuesta.clase === 'reforma' || propuesta.clase === 'descarte') && (
          <Field label="Kilometraje actual de la unidad" hint={
            propuesta.clase === 'instalar' ? undefined
              : `Mínimo ${(propuesta.clase === 'intercambio' ? propuesta.saliente : propuesta.llanta).km_montaje?.toLocaleString('es-PE') ?? 0} km (km al montar)`
          }>
            {p => (
              <TextInput {...p} inputMode="numeric" autoComplete="off" value={km} placeholder="Ej. 125400"
                onChange={e => setKm(digitsInput(e.target.value, 9))} />
            )}
          </Field>
        )}

        {propuesta.clase === 'retorno' && (
          <>
            <Resumen>
              <p>Registra el retorno de <b>{propuesta.llanta.codigo}</b> desde reencauche.</p>
              {sigueVida ? (
                <p className="ntb-hoja__nota">Vida {vidaTexto(propuesta.llanta.vida)} → <b>{sigueVida}</b>. Queda en Reparadas, lista para instalar.</p>
              ) : (
                <Notice tone="error" icon={<CircleAlert size={16} />}>Esta llanta ya está en R3 y no admite más reencauches.</Notice>
              )}
            </Resumen>
            <div className="form-grid">
              <Field label="Proveedor de reencauche">
                {p => <TextInput {...p} value={proveedor} onChange={e => setProveedor(e.target.value)} />}
              </Field>
              <Field label="Costo del servicio">
                {p => <TextInput {...p} inputMode="decimal" value={costo} placeholder="0.00"
                  onChange={e => setCosto(decimalInput(e.target.value))} />}
              </Field>
              <Field label="Diseño">
                {p => <TextInput {...p} value={disenio} onChange={e => setDisenio(e.target.value)} />}
              </Field>
              <Field label="Remanente (mm)" hint="Opcional. Si no se mide, se conserva el último.">
                {p => <TextInput {...p} inputMode="decimal" value={remanente} placeholder="Ej. 9.5"
                  onChange={e => setRemanente(decimalInput(e.target.value))} />}
              </Field>
            </div>
          </>
        )}

        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
      </div>
    </Sheet>
  );
}
