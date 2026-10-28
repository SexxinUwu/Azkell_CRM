import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { codigoLimpio } from './entradaReglas';
import { eliminarAdjunto, guardarAdjuntos, type AdjuntoNuevo, type EntradaInv, type TipoAdjunto } from './api';
import './entradas.css';

interface Props {
  open: boolean;
  entrada: EntradaInv | null;
  onClose: () => void;
  onGuardado: () => void;
}

const ETIQUETAS: Record<TipoAdjunto, string> = { cotizacion: 'Cotización', factura: 'Factura', voucher: 'Constancia / voucher' };
const ACEPTA = 'application/pdf,image/*';

type Nuevos = Record<TipoAdjunto, File | null>;
const SIN_NUEVOS: Nuevos = { cotizacion: null, factura: null, voucher: null };

/** Cotización, factura y voucher de una orden. Mismas reglas que el clásico: una factura exige su N° de comprobante. */
export function AdjuntosEntradaSheet({ open, entrada, onClose, onGuardado }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const [nuevos, setNuevos] = useState<Nuevos>(SIN_NUEVOS);
  const [numFactura, setNumFactura] = useState('');
  const [numVoucher, setNumVoucher] = useState('');
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aQuitar, setAQuitar] = useState<TipoAdjunto | null>(null);
  const [quitando, setQuitando] = useState(false);

  const id = entrada?.id ?? null;
  // Se reinicia solo al cambiar de orden: así una actualización de la lista no borra lo que se está escribiendo
  useEffect(() => {
    if (!open || !entrada) return;
    setNuevos(SIN_NUEVOS);
    setNumFactura(entrada.documento_referencia ?? '');
    setNumVoucher(entrada.numero_operacion ?? '');
    setIntento(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  if (!entrada) return null;

  const urlDe = (tipo: TipoAdjunto) => {
    if (tipo === 'cotizacion') return entrada.url_cotizacion_presigned || entrada.url_cotizacion;
    if (tipo === 'factura') return entrada.url_factura_presigned || entrada.url_factura;
    return entrada.url_voucher_presigned || entrada.url_voucher;
  };

  const hayArchivos = Object.values(nuevos).some(Boolean);
  const hayCambios = hayArchivos
    || numFactura.trim() !== (entrada.documento_referencia ?? '')
    || numVoucher.trim() !== (entrada.numero_operacion ?? '');
  const errorFactura = nuevos.factura && !numFactura.trim() ? 'Escribe el N° de comprobante (ej. F001-0004523).' : undefined;
  const mostrar = (m: string | undefined) => (intento ? m : undefined);

  async function guardar() {
    if (!entrada) return;
    setIntento(true);
    if (!hayCambios) { toast('No hay archivos nuevos ni cambios en los números', 'error'); return; }
    if (errorFactura) return;
    const lista: AdjuntoNuevo[] = [];
    if (nuevos.cotizacion) lista.push({ file: nuevos.cotizacion, tipo: 'cotizacion' });
    if (nuevos.factura) lista.push({ file: nuevos.factura, tipo: 'factura', documento_referencia: numFactura.trim() });
    if (nuevos.voucher) lista.push({ file: nuevos.voucher, tipo: 'voucher', numero_operacion: numVoucher.trim() });
    setGuardando(true);
    try {
      await guardarAdjuntos(entrada.id, lista, { documento_referencia: numFactura.trim(), numero_operacion: numVoucher.trim() });
      toast('Documentación actualizada');
      await qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] });
      onGuardado();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function quitar() {
    if (!entrada || !aQuitar) return;
    setQuitando(true);
    try {
      await eliminarAdjunto(entrada.id, aQuitar);
      toast(`Se quitó ${ETIQUETAS[aQuitar].toLowerCase()}`);
      setAQuitar(null);
      await qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setQuitando(false);
    }
  }

  const pie = (
    <div style={{ display: 'flex', gap: 'var(--s-2)', justifyContent: 'flex-end' }}>
      <Button variant="secondary" onClick={onClose} disabled={guardando}>Cerrar</Button>
      <Button variant="primary" loading={guardando} onClick={guardar}>Guardar cambios</Button>
    </div>
  );

  const bloque = (tipo: TipoAdjunto, extra?: ReactNode) => {
    const url = urlDe(tipo);
    return (
      <section className="oc-adjunto" key={tipo}>
        <span className="oc-adjunto__titulo">{ETIQUETAS[tipo]}</span>
        {url ? (
          <div className="oc-adjunto__actual">
            <a href={url} target="_blank" rel="noreferrer" className="oc-doc oc-doc--ok">Ver {ETIQUETAS[tipo].toLowerCase()} actual</a>
            <button type="button" className="oc-cotizacion__quitar" aria-label={`Quitar ${ETIQUETAS[tipo].toLowerCase()}`}
              onClick={() => setAQuitar(tipo)}>
              ×
            </button>
          </div>
        ) : (
          <span className="oc-doc oc-doc--falta">Sin archivo adjunto</span>
        )}
        <Field label="Archivo nuevo" hint={nuevos[tipo] ? `Se subirá: ${nuevos[tipo]?.name}` : undefined}>
          {p => (
            <input {...p} type="file" accept={ACEPTA} className="input oc-archivo"
              onChange={ev => {
                const archivo = ev.target.files?.[0] ?? null;
                setNuevos(prev => {
                  const siguiente: Nuevos = { ...prev };
                  siguiente[tipo] = archivo;
                  return siguiente;
                });
              }} />
          )}
        </Field>
        {extra}
      </section>
    );
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title={`Adjuntos · ${codigoLimpio(entrada.id)}`} ancho footer={pie}>
        <div className="oc-form">
          <p className="t-footnote c-secondary" style={{ margin: 0 }}>
            {entrada.proveedor_nombre ?? 'Sin proveedor'} · Sube la cotización, la factura o el voucher de pago. Un voucher pasa la orden a «Procesada».
          </p>
          <div className="oc-adjuntos">
            {bloque('cotizacion')}
            {bloque('factura', (
              <Field label="N° de comprobante / factura" error={mostrar(errorFactura)}>
                {p => <TextInput {...p} className="oc-mono" value={numFactura} placeholder="F001-0004523" onChange={ev => setNumFactura(ev.target.value)} />}
              </Field>
            ))}
            {bloque('voucher', (
              <Field label="N° de constancia / operación">
                {p => <TextInput {...p} className="oc-mono" value={numVoucher} placeholder="OP-8947239" onChange={ev => setNumVoucher(ev.target.value)} />}
              </Field>
            ))}
          </div>
        </div>
      </Sheet>

      <ConfirmSheet
        open={aQuitar !== null}
        onClose={() => !quitando && setAQuitar(null)}
        onConfirm={quitar}
        loading={quitando}
        title={`¿Quitar ${aQuitar ? ETIQUETAS[aQuitar].toLowerCase() : 'el archivo'}?`}
        message="El archivo deja de estar asociado a esta orden. Podrás subir otro cuando quieras."
        confirmLabel="Quitar"
      />
    </>
  );
}
