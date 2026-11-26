import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { haptic } from '../../core/lib/haptics';
import type { ArticuloInv } from './api';
import { zplEtiquetas, MEDIDAS_ETIQUETA, type EtiquetaArticulo } from './etiquetasZpl';
import { estadoEtiquetadora, imprimirZpl, type EstadoEtiquetadora } from './impresoraEtiquetas';
import { etiquetaDe } from './EtiquetaSheet';
import './etiquetasMasivas.css';

const POR_FILA = MEDIDAS_ETIQUETA.columnas;
/** Cada envío a la etiquetadora lleva como máximo esta cantidad de etiquetas (20 filas), para no saturarla */
const POR_ENVIO = 60;
const MAX_PREVIA = 60;
const MAX_TOTAL = 600;

/** Una etiqueta tal como saldrá: descripción, código de barras, código interno y ubicación */
function Vista({ e, onQuitar }: { e: EtiquetaArticulo; onQuitar?: () => void }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try { JsBarcode(ref.current, e.codigo, { format: 'CODE128', width: 1.2, height: 26, displayValue: false, margin: 0 }); } catch { /* código no codificable */ }
  }, [e.codigo]);
  return (
    <div className="etq-card">
      {onQuitar && <button type="button" className="etq-card__x" aria-label={`Quitar ${e.id}`} title="Quitar esta etiqueta" onClick={onQuitar}><X size={11} strokeWidth={3} /></button>}
      <span className="etq-card__desc">{e.descripcion}</span>
      <svg ref={ref} className="etq-card__barras" preserveAspectRatio="none" />
      <b className="etq-card__id">{e.id}</b>
      {e.ubicacion && <small className="etq-card__ubi">{e.ubicacion}</small>}
    </div>
  );
}

/**
 * Impresión masiva de etiquetas: muestra cómo saldrán en el rollo (filas de 3, empezando por la izquierda) antes de gastar papel.
 * Un solo artículo queda primero a la izquierda; los siguientes llenan la fila.
 */
export function EtiquetasMasivasSheet({ open, articulos, onClose, onQuitar }: {
  open: boolean;
  articulos: ArticuloInv[];
  onClose: () => void;
  onQuitar: (id: string) => void;
}) {
  const toast = useToast();
  const [copias, setCopias] = useState('1');
  const [estado, setEstado] = useState<EstadoEtiquetadora | 'buscando'>('buscando');
  const [imprimiendo, setImprimiendo] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setEstado('buscando');
    estadoEtiquetadora().then(e => { if (vivo) setEstado(e); });
    return () => { vivo = false; };
  }, [open]);

  const n = Math.min(50, Math.max(1, Math.floor(Number(copias) || 0)));
  // Todas las etiquetas en el orden en que saldrán
  const todas = useMemo(() => articulos.flatMap(a => Array.from({ length: n }, () => etiquetaDe(a))), [articulos, n]);
  const filas = useMemo(() => {
    const f: Array<Array<{ e: EtiquetaArticulo; id: string }>> = [];
    todas.slice(0, MAX_PREVIA).forEach((e, i) => {
      if (i % POR_FILA === 0) f.push([]);
      f[f.length - 1].push({ e, id: e.id });
    });
    return f;
  }, [todas]);
  const totalFilas = Math.ceil(todas.length / POR_FILA);
  const excede = todas.length > MAX_TOTAL;

  async function imprimir() {
    if (!todas.length || excede) return;
    setImprimiendo('Enviando…');
    try {
      for (let i = 0; i < todas.length; i += POR_ENVIO) {
        const trozo = todas.slice(i, i + POR_ENVIO);
        setImprimiendo(`Imprimiendo ${Math.min(i + POR_ENVIO, todas.length)} de ${todas.length}…`);
        await imprimirZpl(zplEtiquetas(trozo));
      }
      haptic('success');
      toast(`${todas.length} ${todas.length === 1 ? 'etiqueta impresa' : 'etiquetas impresas'}`);
      onClose();
    } catch (err) {
      haptic('warning');
      toast(err instanceof Error ? err.message : 'No se pudo imprimir.', 'error');
    } finally {
      setImprimiendo('');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Imprimir etiquetas · ${articulos.length} ${articulos.length === 1 ? 'artículo' : 'artículos'}`} ancho
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon={<Printer size={16} />} loading={!!imprimiendo} disabled={estado !== 'lista' || !todas.length || excede} onClick={imprimir}>
          {imprimiendo || `Imprimir ${todas.length} ${todas.length === 1 ? 'etiqueta' : 'etiquetas'}`}
        </Button>
      </>}>
      <div className="etq-cuerpo">
        <div className="etq-barra">
          <Field label="Copias de cada artículo">
            {p => <TextInput {...p} type="number" min={1} max={50} inputMode="numeric" value={copias} onChange={e => setCopias(e.target.value)} />}
          </Field>
          <p className="etq-resumen"><b>{todas.length}</b> {todas.length === 1 ? 'etiqueta' : 'etiquetas'} · <b>{totalFilas}</b> {totalFilas === 1 ? 'fila' : 'filas'} de {POR_FILA} en el rollo</p>
        </div>

        {estado === 'buscando' && <Notice>Buscando la etiquetadora del almacén…</Notice>}
        {estado === 'lista' && <Notice tone="success">Etiquetadora del almacén conectada y lista.</Notice>}
        {estado === 'sin-agente' && <Notice tone="error">La etiquetadora del almacén no está conectada. Pide que abran el programa de etiquetas en la PC que tiene la impresora.</Notice>}
        {estado === 'error' && <Notice tone="error">No se pudo consultar la etiquetadora. Revisa tu conexión.</Notice>}
        {excede && <Notice tone="error">Son demasiadas etiquetas para una sola impresión (máximo {MAX_TOTAL}). Quita artículos o baja las copias.</Notice>}

        {!todas.length ? (
          <p className="etq-vacio">No hay artículos para imprimir.</p>
        ) : (
          <>
            <h3 className="etq-titulo">Así saldrán en el rollo</h3>
            <div className="etq-previa" aria-label="Vista previa de las etiquetas">
              {filas.map((fila, k) => (
                <div key={k} className="etq-fila">
                  <span className="etq-fila__n">{k + 1}</span>
                  <div className="etq-fila__celdas">
                    {fila.map((x, j) => <Vista key={j} e={x.e} onQuitar={n === 1 ? () => onQuitar(x.id) : undefined} />)}
                    {Array.from({ length: POR_FILA - fila.length }).map((_, j) => <div key={`v${j}`} className="etq-card etq-card--vacia" aria-hidden />)}
                  </div>
                </div>
              ))}
            </div>
            {todas.length > MAX_PREVIA && <p className="etq-mas">…y {todas.length - MAX_PREVIA} etiquetas más ({totalFilas - Math.ceil(MAX_PREVIA / POR_FILA)} filas), con el mismo orden.</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}
