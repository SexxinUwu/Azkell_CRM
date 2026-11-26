import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { haptic } from '../../core/lib/haptics';
import type { ArticuloInv } from './api';
import { zplEtiquetas, type EtiquetaArticulo } from './etiquetasZpl';
import { estadoEtiquetadora, imprimirZpl, type EstadoEtiquetadora } from './impresoraEtiquetas';
import { imprimirEtiqueta } from './etiquetaArticulo';

export const etiquetaDe = (a: ArticuloInv): EtiquetaArticulo => ({
  codigo: a.codigo_barras?.trim() || a.id,
  descripcion: a.descripcion || a.articulo || '',
  id: a.id,
  ubicacion: [a.ubicacion, a.anaquel ? `Anq: ${a.anaquel}` : ''].filter(Boolean).join(' '),
});

/** Ventana para imprimir las etiquetas de un artículo en la etiquetadora térmica (3 por fila) o, sin ella, desde el navegador */
export function EtiquetaSheet({ open, articulo: a, onClose }: { open: boolean; articulo: ArticuloInv; onClose: () => void }) {
  const toast = useToast();
  const [copias, setCopias] = useState('3');
  const [estado, setEstado] = useState<EstadoEtiquetadora | 'buscando'>('buscando');
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setEstado('buscando');
    estadoEtiquetadora().then(e => { if (vivo) setEstado(e); });
    return () => { vivo = false; };
  }, [open]);

  const n = Math.min(99, Math.max(1, Math.floor(Number(copias) || 0)));
  const filas = Math.ceil(n / 3);

  async function imprimir() {
    setImprimiendo(true);
    try {
      await imprimirZpl(zplEtiquetas([etiquetaDe(a)], n));
      haptic('success');
      toast(`${n} ${n === 1 ? 'etiqueta impresa' : 'etiquetas impresas'}`);
      onClose();
    } catch (err) {
      haptic('warning');
      toast(err instanceof Error ? err.message : 'No se pudo imprimir.', 'error');
    } finally {
      setImprimiendo(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Imprimir etiquetas"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon={<Printer size={16} />} loading={imprimiendo} disabled={estado !== 'lista'} onClick={imprimir}>
          Imprimir {n} {n === 1 ? 'etiqueta' : 'etiquetas'}
        </Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)', padding: 'var(--s-2) 0' }}>
        <div>
          <strong>{a.descripcion || a.articulo}</strong>
          <div style={{ color: 'var(--label-2)', fontSize: '0.875rem' }}>{a.id} · código de barras {a.codigo_barras?.trim() || a.id}</div>
        </div>

        <Field label="Cantidad de etiquetas" hint={`Salen de 3 en 3: ${filas} ${filas === 1 ? 'fila' : 'filas'} del rollo.`}>
          {p => <TextInput {...p} type="number" min={1} max={99} inputMode="numeric" value={copias} onChange={e => setCopias(e.target.value)} />}
        </Field>

        {estado === 'buscando' && <Notice>Buscando la etiquetadora del almacén…</Notice>}
        {estado === 'lista' && <Notice tone="success">Etiquetadora del almacén conectada y lista.</Notice>}
        {estado === 'sin-agente' && (
          <Notice tone="error">La etiquetadora del almacén no está conectada. Pide que abran el programa de etiquetas en la PC que tiene la impresora (archivo «iniciar-agente.bat», carpeta agente-etiquetas).</Notice>
        )}
        {estado === 'error' && <Notice tone="error">No se pudo consultar la etiquetadora. Revisa tu conexión.</Notice>}
        {(estado === 'sin-agente' || estado === 'error') && (
          <Button variant="secondary" onClick={() => { if (!imprimirEtiqueta(a)) toast('No se pudo abrir la etiqueta. Permite las ventanas emergentes para este sitio.', 'error'); }}>
            Imprimir una desde el navegador
          </Button>
        )}
      </div>
    </Sheet>
  );
}
