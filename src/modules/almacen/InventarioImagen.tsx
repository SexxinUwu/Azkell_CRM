import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Download, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { api, errorMessage } from '../../core/api/client';
import { useToast } from '../../core/ui/Toast';

interface Props {
  /** Id del artículo (INV-…). Sin id, el artículo aún no se ha guardado. */
  articuloId?: string;
  imagenUrl: string | null;
  onCambio: (url: string | null) => void;
}

/** Foto del artículo (AWS S3, igual que el clásico) y su código QR, que se descarga como PNG */
export function InventarioImagen({ articuloId, imagenUrl, onCambio }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!articuloId) { setQr(null); return; }
    QRCode.toDataURL(articuloId, { width: 300, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [articuloId]);

  async function subir(file: File) {
    if (!articuloId) return;
    setSubiendo(true);
    try {
      const datos = new FormData();
      datos.append('imagen', file);
      const res = await api<{ imagen_url: string }>(`/almacen/inventario/${encodeURIComponent(articuloId)}/imagen`, {
        method: 'POST', body: datos,
      });
      onCambio(res.imagen_url);
      qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
      toast('Imagen guardada');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar() {
    if (!articuloId) return;
    try {
      await api(`/almacen/inventario/${encodeURIComponent(articuloId)}/imagen`, { method: 'DELETE' });
      onCambio(null);
      qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
      toast('Imagen quitada');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  if (!articuloId) {
    return (
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--label-2)' }}>
        Guarda el artículo para subir su foto y generar el código QR.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 'var(--s-3)', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" icon={<ImagePlus size={15} />} loading={subiendo} onClick={() => archivo.current?.click()}>
            {imagenUrl ? 'Cambiar foto' : 'Subir foto'}
          </Button>
          {imagenUrl && (
            <Button variant="plain" size="sm" icon={<Trash2 size={15} />} onClick={quitar}>Quitar</Button>
          )}
        </div>
        <input
          ref={archivo}
          type="file"
          accept="image/*"
          hidden
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) subir(file);
          }}
        />
        {qr && (
          <a href={qr} download={`QR_${articuloId}.png`} className="inv-enlace">
            <Download size={15} /> Descargar QR
          </a>
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
        {imagenUrl && <img src={imagenUrl} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12 }} />}
        {qr && <img src={qr} alt={`Código QR de ${articuloId}`} style={{ width: 72, height: 72, borderRadius: 8, background: '#fff' }} />}
      </div>
    </div>
  );
}
