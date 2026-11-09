/** Reduce una foto antes de subirla (máx. 1600 px por lado, JPEG al 85 %). Si no puede, devuelve el archivo tal cual. */
export function comprimirImagen(file: File | Blob, max = 1600, calidad = 0.85): Promise<Blob> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (w > max || h > max) { if (w > h) { h = Math.round((h * max) / w); w = max; } else { w = Math.round((w * max) / h); h = max; } }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d', { alpha: false });
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(b => resolve(b && b.size > 0 ? b : file), 'image/jpeg', calidad);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/** Foto reducida como File (conserva el nombre con extensión .jpg). Los PDF y otros archivos pasan sin cambios. */
export async function prepararEvidencia(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || /heic|heif/i.test(file.type)) return file;
  const blob = await comprimirImagen(file);
  if (blob === file) return file;
  const nombre = file.name.replace(/\.[^.]+$/, '') || 'foto';
  return new File([blob], `${nombre}.jpg`, { type: 'image/jpeg' });
}
