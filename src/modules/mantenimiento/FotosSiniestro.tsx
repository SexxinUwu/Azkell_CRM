import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { EvidenciasArchivos } from '../../core/ui/EvidenciasArchivos';
import { VisorFotos } from '../../core/ui/VisorFotos';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { quitarFotoSiniestro, useFotosSiniestro } from './siniestrosApi';

/**
 * Fotos de los daños de un siniestro: las ya guardadas (con visor y opción de quitar) y las nuevas por subir.
 * Las nuevas se suben cuando se guarda el siniestro. Se puede tomar la foto con la cámara o elegirla de la galería.
 */
export function FotosSiniestro({ siniestroId, nuevas, onNuevas, puedeQuitar, disabled }: {
  siniestroId: number | null; nuevas: File[]; onNuevas: (a: File[]) => void; puedeQuitar: boolean; disabled?: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const guardadas = useFotosSiniestro(siniestroId);
  const [visor, setVisor] = useState<number | null>(null);
  const [quitando, setQuitando] = useState<number | null>(null);
  const fotos = guardadas.data ?? [];

  async function quitar(fotoId: number) {
    if (!siniestroId) return;
    setQuitando(fotoId);
    try {
      const r = await quitarFotoSiniestro(siniestroId, fotoId);
      if (r.ok === false) throw new Error(r.error || 'No se pudo quitar la foto');
      toast('Foto quitada');
      await qc.invalidateQueries({ queryKey: ['mant', 'siniestros'] });
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setQuitando(null);
    }
  }

  return (
    <div className="sin-fotos">
      {fotos.length > 0 && (
        <div className="sin-fotos__guardadas" aria-label="Fotos guardadas">
          {fotos.map((f, i) => (
            <div key={f.id} className="sin-fotos__item">
              <button type="button" className="sin-fotos__foto" aria-label={`Ver foto ${i + 1}`} onClick={() => setVisor(i)}>
                <img src={f.url} alt={`Daño ${i + 1}`} loading="lazy" />
              </button>
              {puedeQuitar && (
                <button type="button" className="sin-fotos__quitar" aria-label="Quitar foto" title="Quitar foto" disabled={quitando === f.id} onClick={() => { void quitar(f.id); }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <EvidenciasArchivos archivos={nuevas} onCambio={onNuevas} titulo="Fotos de los daños" ayuda="Toma la foto con la cámara o elígela de la galería; se suben al guardar" soloImagenes max={20} disabled={disabled} />
      <VisorFotos open={visor !== null} onClose={() => setVisor(null)} fotos={fotos.map((f, i) => ({ url: f.url, titulo: `Daño ${i + 1}` }))} indiceInicial={visor ?? 0} titulo="Fotos de los daños" />
    </div>
  );
}
