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
import { ejecutarIntercambio, ejecutarMovimiento, ejecutarRegreso, tituloLlanta, vidaSiguiente, vidaTexto, type DestinoRetiro, type ResultadoReencauche } from './ntb-api';

export type Propuesta =
  | { clase: 'instalar'; llanta: LlantaTablero; posicion: string }
  | { clase: 'intercambio'; entrante: LlantaTablero; saliente: LlantaTablero; posicion: string }
  | { clase: 'reforma' | 'descarte'; llanta: LlantaTablero; posicion: string }
  | { clase: 'retorno'; llanta: LlantaTablero }
  | { clase: 'devolver'; llanta: LlantaTablero; desde: 'reforma' | 'descarte' }
  | { clase: 'regreso'; llanta: LlantaTablero; desde: 'reforma' | 'descarte'; posicion: string };

type Destino = DestinoRetiro;

/** Cómo se dice cada destino en el texto de la hoja */
const TEXTO_DESTINO: Record<Destino, string> = {
  reten: 'el Retén, donde queda disponible para instalar',
  reforma: 'reforma (queda en el Retén para enviarla a la reformadora)',
  descarte: 'descarte (queda en el Retén esperando descarte)',
};

interface Props {
  open: boolean;
  propuesta: Propuesta;
  placa: string;
  /** Enviar para reforma permitido (reforma y el destino del intercambio) */
  puedeReencauche: boolean;
  /** Enviar a descarte permitido (descarte y el destino del intercambio) */
  puedeBaja: boolean;
  onClose: () => void;
  /** `deshacer`: solo cuando se envió una llanta a reforma o descarte (para ofrecer volver atrás) */
  onHecho: (mensaje: string, deshacer?: { codigo: string; posicion: string; km: number; destino: 'reforma' | 'descarte' }) => void;
}

const TITULOS: Record<Propuesta['clase'], string> = {
  instalar: 'Instalar llanta',
  intercambio: 'Cambiar llanta',
  reforma: 'Enviar a reforma',
  descarte: 'Enviar a descarte',
  retorno: 'Retorno de reencauche',
  devolver: 'Regresar a disponible',
  regreso: 'Regresar a la unidad',
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
  // Toda llanta retirada pasa por el Retén: puede quedar ahí disponible, ir a reforma o esperar su descarte
  const opcionesDestino: Array<{ value: Destino; label: string }> = [
    { value: 'reten', label: 'Retén (disponible)' },
    ...(puedeReencauche ? [{ value: 'reforma' as const, label: 'Enviar para reforma' }] : []),
    ...(puedeBaja ? [{ value: 'descarte' as const, label: 'Esperando descarte' }] : []),
  ];

  const [km, setKm] = useState('');
  const [destino, setDestino] = useState<Destino>('reten');
  const [resultado, setResultado] = useState<ResultadoReencauche>('aprobada');
  const [motivo, setMotivo] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [costo, setCosto] = useState('');
  const [disenio, setDisenio] = useState('');
  const [remanente, setRemanente] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const sigueVida = vidaSiguiente(propuesta.clase === 'retorno' ? propuesta.llanta.vida : null);
  const destinoValido = propuesta.clase === 'intercambio' ? opcionesDestino.some(o => o.value === destino) : true;
  const bloqueada = propuesta.clase === 'retorno' ? (resultado === 'aprobada' && !sigueVida) : propuesta.clase === 'intercambio' && !destinoValido;

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
      } else if (propuesta.clase === 'devolver') {
        await ejecutarMovimiento({ clase: 'devolver', codigo: propuesta.llanta.codigo });
        mensaje = `${propuesta.llanta.codigo} volvió a estar disponible en el Retén`;
      } else if (propuesta.clase === 'regreso') {
        const k = kilometraje(km, null);
        await ejecutarRegreso(propuesta.llanta, { placa, posicion: propuesta.posicion, km: k });
        mensaje = `${propuesta.llanta.codigo} regresó a ${propuesta.posicion}`;
      } else if (propuesta.clase === 'reforma' || propuesta.clase === 'descarte') {
        const k = kilometraje(km, propuesta.llanta.km_montaje ?? null);
        const dest: Destino = propuesta.clase === 'reforma' ? 'reforma' : 'descarte';
        await ejecutarMovimiento({ clase: 'retirar', codigo: propuesta.llanta.codigo, placa, posicion: propuesta.posicion, km: k, destino: dest });
        mensaje = propuesta.clase === 'reforma'
          ? `${propuesta.llanta.codigo} enviada a reforma (en el Retén)`
          : `${propuesta.llanta.codigo} enviada a descarte (en el Retén)`;
      } else {
        const c = parseDecimal(costo);
        if (Number.isNaN(c)) throw new Error('El costo del servicio no es válido.');
        const r = parseDecimal(remanente);
        if (Number.isNaN(r)) throw new Error('El remanente no es válido.');
        await ejecutarMovimiento({
          clase: 'retorno', codigo: propuesta.llanta.codigo, proveedor: proveedor.trim(),
          costo_servicio: c ?? 0, disenio: disenio.trim(), remanente: r,
          resultado, observacion: motivo.trim(),
        });
        mensaje = resultado === 'aprobada'
          ? `${propuesta.llanta.codigo} regresó de reencauche`
          : `${propuesta.llanta.codigo} rechazada: queda esperando descarte en el Retén`;
      }
      haptic('success');
      onHecho(mensaje, (propuesta.clase === 'reforma' || propuesta.clase === 'descarte')
        ? { codigo: propuesta.llanta.codigo, posicion: propuesta.posicion, km: kilometraje(km, propuesta.llanta.km_montaje ?? null), destino: propuesta.clase }
        : undefined);
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
            {descarte ? 'Enviar a descarte' : propuesta.clase === 'retorno' ? (resultado === 'rechazada' ? 'Registrar rechazo' : 'Registrar retorno') : 'Confirmar'}
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
            <p>1. La llanta <b>{propuesta.saliente.codigo}</b> sale de <b>{propuesta.posicion}</b> y pasa a {TEXTO_DESTINO[destino]}.</p>
            <p>2. La llanta <b>{propuesta.entrante.codigo}</b> ({tituloLlanta(propuesta.entrante)}) ocupa <b>{propuesta.posicion}</b>.</p>
            {opcionesDestino.length > 0 ? (
              <SegmentedControl<Destino> label="Destino de la llanta que sale" value={destino} onChange={setDestino} options={opcionesDestino} block />
            ) : (
              <Notice tone="error" icon={<CircleAlert size={16} />}>No tienes permiso para retirar la llanta que ocupa esta posición.</Notice>
            )}
          </Resumen>
        )}

        {propuesta.clase === 'devolver' && (
          <Resumen>
            <p>La llanta <b>{propuesta.llanta.codigo}</b> deja de estar {propuesta.desde === 'reforma' ? 'para reforma' : 'para descarte'} y vuelve a <b>Disponible para uso</b>.</p>
            <p className="ntb-hoja__nota">Queda en el Retén, lista para instalar. Solo se puede mientras siga en el Retén.</p>
          </Resumen>
        )}

        {propuesta.clase === 'regreso' && (
          <Resumen>
            <p>La llanta <b>{propuesta.llanta.codigo}</b> ({tituloLlanta(propuesta.llanta)}) deja de estar {propuesta.desde === 'reforma' ? 'para reforma' : 'para descarte'} y se monta de nuevo en la posición <b>{propuesta.posicion}</b> de <b>{placa}</b>.</p>
            <p className="ntb-hoja__nota">Primero vuelve al Retén como disponible y luego se instala.</p>
          </Resumen>
        )}

        {propuesta.clase === 'reforma' && (
          <Resumen>
            <p>La llanta <b>{propuesta.llanta.codigo}</b> sale de <b>{propuesta.posicion}</b> de <b>{placa}</b> y se marca para reforma.</p>
            <p className="ntb-hoja__nota">Queda en el Retén, lista para despachar a la reformadora.</p>
          </Resumen>
        )}

        {propuesta.clase === 'descarte' && (
          <Resumen>
            <p>La llanta <b>{propuesta.llanta.codigo}</b> sale de <b>{propuesta.posicion}</b> de <b>{placa}</b> y se envía a descarte.</p>
            <p className="ntb-hoja__nota">Queda en el Retén esperando descarte; la baja definitiva es un paso aparte.</p>
          </Resumen>
        )}

        {(propuesta.clase === 'instalar' || propuesta.clase === 'regreso' || propuesta.clase === 'intercambio' || propuesta.clase === 'reforma' || propuesta.clase === 'descarte') && (
          <Field label="Kilometraje actual de la unidad" hint={
            propuesta.clase === 'instalar' || propuesta.clase === 'regreso' ? undefined
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
              <SegmentedControl<ResultadoReencauche> label="Resultado del reencauche" value={resultado} onChange={setResultado} block
                options={[{ value: 'aprobada', label: 'Aprobada' }, { value: 'rechazada', label: 'Rechazada' }]} />
              {resultado === 'rechazada' ? (
                <p className="ntb-hoja__nota">No sube la vida ni suma costo. Queda en el Retén esperando descarte.</p>
              ) : sigueVida ? (
                <p className="ntb-hoja__nota">Vida {vidaTexto(propuesta.llanta.vida)} → <b>{sigueVida}</b>. Queda en Reencauche, ya reencauchada y lista para instalar.</p>
              ) : (
                <Notice tone="error" icon={<CircleAlert size={16} />}>Esta llanta ya está en R3 y no admite más reencauches.</Notice>
              )}
            </Resumen>
            {resultado === 'rechazada' ? (
              <div className="form-grid">
                <Field label="Proveedor de reencauche">
                  {p => <TextInput {...p} value={proveedor} onChange={e => setProveedor(e.target.value)} />}
                </Field>
                <Field label="Motivo del rechazo" hint="Opcional.">
                  {p => <TextInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)} />}
                </Field>
              </div>
            ) : (
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
            )}
          </>
        )}

        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
      </div>
    </Sheet>
  );
}
