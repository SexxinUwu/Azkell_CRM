import { useEffect, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Download } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { haptic } from '../../core/lib/haptics';
import { ZonaArchivos } from './ZonaArchivos';
import { PaginasGrid } from './PaginasGrid';
import {
  cadaN, comprimir, contarPaginas, descargar, dividir, imagenesAPdf, leerRangos, marcaDeAgua, numerar, pdfAImagenes, reordenar, rotar, tamano, unir,
  type Avance, type NivelCompresion, type OpcionesImagenPdf, type OpcionesMarca, type OpcionesNumeros, type PaginaOrden, type Salida,
} from './motorPdf';

// Cada herramienta: se eligen los archivos, se ajusta una opción y se procesa en este mismo navegador. Nada se envía a ningún servidor.

export function useTarea() {
  const [trabajando, setTrabajando] = useState(false);
  const [avance, setAvance] = useState<{ hecho: number; total: number } | null>(null);
  const [salida, setSalida] = useState<Salida | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function ejecutar(fn: (av: Avance) => Promise<Salida>) {
    setError(null); setSalida(null); setTrabajando(true); setAvance(null);
    try {
      const s = await fn((hecho, total) => setAvance({ hecho, total }));
      setSalida(s); haptic('success');
      descargar(s);
    } catch (e) { setError(String((e as Error).message ?? e)); haptic('warning'); }
    finally { setTrabajando(false); setAvance(null); }
  }
  const limpiar = () => { setSalida(null); setError(null); };
  return { trabajando, avance, salida, error, ejecutar, limpiar, setError };
}
export type Tarea = ReturnType<typeof useTarea>;

/** Resultado: confirma la descarga y deja bajarlo otra vez o empezar de nuevo */
function Resultado({ t, onOtra }: { t: Tarea; onOtra: () => void }) {
  const s = t.salida;
  if (!s) return null;
  return (
    <div className="hp-resultado" role="status">
      <CircleCheck size={22} aria-hidden />
      <div className="hp-resultado__texto">
        <strong>¡Listo! Se descargó «{s.nombre}»</strong>
        <span>{[tamano(s.blob.size), s.detalle].filter(Boolean).join(' · ')}</span>
      </div>
      <Button variant="primary" icon={<Download size={16} />} onClick={() => descargar(s)}>Descargar otra vez</Button>
      <Button variant="secondary" onClick={onOtra}>Hacer otro</Button>
    </div>
  );
}

/** Botón de procesar con avance; al terminar muestra el resultado */
export function Accion({ t, etiqueta, listo, onOtra, correr }: { t: Tarea; etiqueta: string; listo: boolean; onOtra: () => void; correr: () => void }) {
  return (
    <div className="hp-cierre">
      {t.error && <Notice tone="error" icon={<CircleAlert size={16} />}>{t.error}</Notice>}
      {t.salida ? <Resultado t={t} onOtra={onOtra} /> : (
        <Button variant="primary" size="lg" loading={t.trabajando} disabled={!listo || t.trabajando} onClick={correr} className="hp-procesar">
          {t.trabajando ? (t.avance ? `Procesando ${t.avance.hecho}/${t.avance.total}…` : 'Procesando…') : etiqueta}
        </Button>
      )}
    </div>
  );
}

export const Aviso = ({ texto }: { texto: string | null }) => (texto ? <Notice tone="neutral" icon={<CircleAlert size={16} />}>{texto}</Notice> : null);

/** Un PDF elegido, con su cantidad de páginas */
export function useUnPdf() {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [paginas, setPaginas] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const archivo = archivos[0] ?? null;
  useEffect(() => {
    setPaginas(null); setErrorLectura(null);
    if (!archivo) return;
    let vivo = true;
    contarPaginas(archivo).then(n => { if (vivo) setPaginas(n); }).catch(e => { if (vivo) setErrorLectura(String((e as Error).message ?? e)); });
    return () => { vivo = false; };
  }, [archivo]);
  return { archivos, setArchivos, archivo, paginas, aviso, setAviso, errorLectura };
}
export type UnPdf = ReturnType<typeof useUnPdf>;

export function ElegirPdf({ u, disabled }: { u: UnPdf; disabled?: boolean }) {
  return (
    <>
      <ZonaArchivos tipo="pdf" accept="application/pdf,.pdf" archivos={u.archivos} onChange={u.setArchivos} etiqueta="Elegir archivo PDF" onAviso={u.setAviso} disabled={disabled} />
      <Aviso texto={u.aviso} />
      {u.errorLectura && <Notice tone="error" icon={<CircleAlert size={16} />}>{u.errorLectura}</Notice>}
      {u.archivo && u.paginas !== null && <p className="hp-ayuda">El documento tiene {u.paginas} {u.paginas === 1 ? 'página' : 'páginas'}.</p>}
    </>
  );
}

export const Cuadro = ({ children }: { children: ReactNode }) => <div className="hp-herramienta">{children}</div>;

// ─── Unir ───
export function UnirPdf() {
  const t = useTarea();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <Cuadro>
      <ZonaArchivos tipo="pdf" multiple ordenable accept="application/pdf,.pdf" archivos={archivos} onChange={a => { setArchivos(a); t.limpiar(); }} etiqueta="Elegir archivos PDF" onAviso={setAviso} disabled={t.trabajando} />
      <Aviso texto={aviso} />
      {archivos.length > 1 && <p className="hp-ayuda">Se unirán en este orden. Usa las flechas para cambiarlo.</p>}
      <Accion t={t} etiqueta="Unir PDF" listo={archivos.length >= 2} onOtra={() => { setArchivos([]); t.limpiar(); }} correr={() => t.ejecutar(av => unir(archivos, av))} />
    </Cuadro>
  );
}

// ─── Dividir ───
export function DividirPdf() {
  const t = useTarea();
  const u = useUnPdf();
  const [modo, setModo] = useState<'rangos' | 'cada' | 'extraer'>('rangos');
  const [texto, setTexto] = useState('');
  const [n, setN] = useState('1');
  const listo = !!u.archivo && u.paginas !== null && (modo === 'cada' ? Number(n) >= 1 : texto.trim().length > 0);
  function correr() {
    t.ejecutar(async av => {
      if (!u.archivo || u.paginas === null) throw new Error('Elige un PDF.');
      let rangos: number[][];
      if (modo === 'cada') {
        const k = Math.floor(Number(n));
        if (!(k >= 1)) throw new Error('Escribe cada cuántas páginas se divide.');
        rangos = cadaN(u.paginas, k);
      } else if (modo === 'extraer') rangos = [leerRangos(texto, u.paginas).flat()];
      else rangos = leerRangos(texto, u.paginas);
      return dividir(u.archivo, rangos, av);
    });
  }
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      {u.archivo && (
        <>
          <SegmentedControl label="Cómo dividir" value={modo} onChange={setModo} options={[{ value: 'rangos', label: 'Por rangos' }, { value: 'cada', label: 'Cada N páginas' }, { value: 'extraer', label: 'Extraer páginas' }]} />
          {modo === 'cada'
            ? <Field label="Dividir cada cuántas páginas">{p => <TextInput {...p} inputMode="numeric" value={n} onChange={e => setN(e.target.value.replace(/\D/g, ''))} />}</Field>
            : <Field label={modo === 'rangos' ? 'Rangos (cada uno sale como un PDF aparte)' : 'Páginas a extraer (salen juntas en un solo PDF)'} hint="Ejemplo: 1-3, 5, 8-10">{p => <TextInput {...p} value={texto} onChange={e => setTexto(e.target.value)} placeholder="1-3, 5, 8-10" />}</Field>}
        </>
      )}
      <Accion t={t} etiqueta="Dividir PDF" listo={listo} onOtra={() => { u.setArchivos([]); t.limpiar(); }} correr={correr} />
    </Cuadro>
  );
}

// ─── Organizar, girar y borrar páginas ───
export function OrganizarPdf() {
  const t = useTarea();
  const u = useUnPdf();
  const [orden, setOrden] = useState<PaginaOrden[]>([]);
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      {u.archivo && u.paginas !== null && !t.salida && (
        <>
          <p className="hp-ayuda">Arrastra las páginas para moverlas, gíralas o bórralas con los botones de cada una.</p>
          <PaginasGrid archivo={u.archivo} onOrden={setOrden} onError={t.setError} />
        </>
      )}
      <Accion t={t} etiqueta="Guardar cambios" listo={!!u.archivo && orden.length > 0} onOtra={() => { u.setArchivos([]); t.limpiar(); }}
        correr={() => t.ejecutar(() => reordenar(u.archivo as File, orden))} />
    </Cuadro>
  );
}

// ─── Rotar ───
export function RotarPdf() {
  const t = useTarea();
  const u = useUnPdf();
  const [giro, setGiro] = useState<'90' | '180' | '270'>('90');
  const [cuales, setCuales] = useState<'todas' | 'algunas'>('todas');
  const [texto, setTexto] = useState('');
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      {u.archivo && (
        <>
          <SegmentedControl label="Giro" value={giro} onChange={setGiro} options={[{ value: '90', label: '90° a la derecha' }, { value: '180', label: '180°' }, { value: '270', label: '90° a la izquierda' }]} />
          <SegmentedControl label="Páginas" value={cuales} onChange={setCuales} options={[{ value: 'todas', label: 'Todas' }, { value: 'algunas', label: 'Solo algunas' }]} />
          {cuales === 'algunas' && <Field label="Páginas a girar" hint="Ejemplo: 1-3, 5">{p => <TextInput {...p} value={texto} onChange={e => setTexto(e.target.value)} placeholder="1-3, 5" />}</Field>}
        </>
      )}
      <Accion t={t} etiqueta="Girar PDF" listo={!!u.archivo && u.paginas !== null && (cuales === 'todas' || texto.trim().length > 0)} onOtra={() => { u.setArchivos([]); t.limpiar(); }}
        correr={() => t.ejecutar(async () => rotar(u.archivo as File, Number(giro), cuales === 'todas' ? null : leerRangos(texto, u.paginas ?? 0).flat()))} />
    </Cuadro>
  );
}

// ─── Imagen → PDF ───
export function ImagenAPdf() {
  const t = useTarea();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [op, setOp] = useState<OpcionesImagenPdf>({ hoja: 'a4', orientacion: 'auto', margen: 'pequeno' });
  return (
    <Cuadro>
      <ZonaArchivos tipo="imagen" multiple ordenable accept="image/*,.heic,.heif" archivos={archivos} onChange={a => { setArchivos(a); t.limpiar(); }} etiqueta="Elegir imágenes" onAviso={setAviso} disabled={t.trabajando} />
      <Aviso texto={aviso} />
      <div className="hp-opciones">
        <Field label="Tamaño de hoja">{p => <SelectInput {...p} value={op.hoja} onChange={e => setOp({ ...op, hoja: e.target.value as OpcionesImagenPdf['hoja'] })}><option value="a4">A4</option><option value="carta">Carta</option><option value="ajustar">Del tamaño de la imagen</option></SelectInput>}</Field>
        <Field label="Orientación">{p => <SelectInput {...p} disabled={op.hoja === 'ajustar'} value={op.orientacion} onChange={e => setOp({ ...op, orientacion: e.target.value as OpcionesImagenPdf['orientacion'] })}><option value="auto">Automática</option><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></SelectInput>}</Field>
        <Field label="Margen">{p => <SelectInput {...p} value={op.margen} onChange={e => setOp({ ...op, margen: e.target.value as OpcionesImagenPdf['margen'] })}><option value="sin">Sin margen</option><option value="pequeno">Pequeño</option><option value="normal">Normal</option></SelectInput>}</Field>
      </div>
      <Accion t={t} etiqueta="Convertir a PDF" listo={archivos.length > 0} onOtra={() => { setArchivos([]); t.limpiar(); }} correr={() => t.ejecutar(av => imagenesAPdf(archivos, op, av))} />
    </Cuadro>
  );
}

// ─── PDF → imagen ───
export function PdfAImagen() {
  const t = useTarea();
  const u = useUnPdf();
  const [formato, setFormato] = useState<'jpg' | 'png'>('jpg');
  const [dpi, setDpi] = useState('150');
  const [texto, setTexto] = useState('todas');
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      {u.archivo && (
        <div className="hp-opciones">
          <Field label="Formato">{p => <SelectInput {...p} value={formato} onChange={e => setFormato(e.target.value as 'jpg' | 'png')}><option value="jpg">JPG (pesa menos)</option><option value="png">PNG (más nítido)</option></SelectInput>}</Field>
          <Field label="Calidad">{p => <SelectInput {...p} value={dpi} onChange={e => setDpi(e.target.value)}><option value="100">Normal (100 ppp)</option><option value="150">Buena (150 ppp)</option><option value="220">Alta (220 ppp)</option></SelectInput>}</Field>
          <Field label="Páginas" hint="«todas» o un rango, por ejemplo 1-3, 5">{p => <TextInput {...p} value={texto} onChange={e => setTexto(e.target.value)} />}</Field>
        </div>
      )}
      <Accion t={t} etiqueta="Convertir a imágenes" listo={!!u.archivo && u.paginas !== null} onOtra={() => { u.setArchivos([]); t.limpiar(); }}
        correr={() => t.ejecutar(async av => pdfAImagenes(u.archivo as File, formato, Number(dpi), texto.trim().toLowerCase() === 'todas' ? null : leerRangos(texto, u.paginas ?? 0).flat(), av))} />
    </Cuadro>
  );
}

// ─── Numerar páginas ───
export function NumerarPdf() {
  const t = useTarea();
  const u = useUnPdf();
  const [op, setOp] = useState<OpcionesNumeros>({ posicion: 'abajo-centro', formato: 'n-de-total', desde: 1, tamano: 11 });
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      {u.archivo && (
        <div className="hp-opciones">
          <Field label="Posición">{p => <SelectInput {...p} value={op.posicion} onChange={e => setOp({ ...op, posicion: e.target.value as OpcionesNumeros['posicion'] })}>
            <option value="abajo-centro">Abajo al centro</option><option value="abajo-derecha">Abajo a la derecha</option><option value="abajo-izquierda">Abajo a la izquierda</option>
            <option value="arriba-centro">Arriba al centro</option><option value="arriba-derecha">Arriba a la derecha</option><option value="arriba-izquierda">Arriba a la izquierda</option></SelectInput>}</Field>
          <Field label="Texto">{p => <SelectInput {...p} value={op.formato} onChange={e => setOp({ ...op, formato: e.target.value as OpcionesNumeros['formato'] })}><option value="n-de-total">Página 1 de 10</option><option value="pagina-n">Página 1</option><option value="n">1</option></SelectInput>}</Field>
          <Field label="Empezar en">{p => <TextInput {...p} inputMode="numeric" value={String(op.desde)} onChange={e => setOp({ ...op, desde: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} />}</Field>
          <Field label="Tamaño de letra">{p => <SelectInput {...p} value={String(op.tamano)} onChange={e => setOp({ ...op, tamano: Number(e.target.value) })}><option value="9">Pequeña</option><option value="11">Normal</option><option value="14">Grande</option></SelectInput>}</Field>
        </div>
      )}
      <Accion t={t} etiqueta="Numerar páginas" listo={!!u.archivo && u.paginas !== null} onOtra={() => { u.setArchivos([]); t.limpiar(); }} correr={() => t.ejecutar(() => numerar(u.archivo as File, op))} />
    </Cuadro>
  );
}

// ─── Marca de agua ───
export function MarcaAguaPdf() {
  const t = useTarea();
  const u = useUnPdf();
  const [op, setOp] = useState<OpcionesMarca>({ texto: 'CONFIDENCIAL', tamano: 64, opacidad: 0.25, angulo: 45, color: 'gris' });
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      {u.archivo && (
        <div className="hp-opciones">
          <Field label="Texto de la marca" wide>{p => <TextInput {...p} value={op.texto} maxLength={60} onChange={e => setOp({ ...op, texto: e.target.value })} />}</Field>
          <Field label="Tamaño">{p => <SelectInput {...p} value={String(op.tamano)} onChange={e => setOp({ ...op, tamano: Number(e.target.value) })}><option value="36">Pequeño</option><option value="64">Mediano</option><option value="96">Grande</option></SelectInput>}</Field>
          <Field label="Transparencia">{p => <SelectInput {...p} value={String(op.opacidad)} onChange={e => setOp({ ...op, opacidad: Number(e.target.value) })}><option value="0.15">Muy suave</option><option value="0.25">Suave</option><option value="0.5">Media</option><option value="0.8">Fuerte</option></SelectInput>}</Field>
          <Field label="Inclinación">{p => <SelectInput {...p} value={String(op.angulo)} onChange={e => setOp({ ...op, angulo: Number(e.target.value) })}><option value="45">Diagonal</option><option value="0">Horizontal</option><option value="90">Vertical</option></SelectInput>}</Field>
          <Field label="Color">{p => <SelectInput {...p} value={op.color} onChange={e => setOp({ ...op, color: e.target.value as OpcionesMarca['color'] })}><option value="gris">Gris</option><option value="rojo">Rojo</option><option value="azul">Azul</option><option value="negro">Negro</option></SelectInput>}</Field>
        </div>
      )}
      <Accion t={t} etiqueta="Agregar marca de agua" listo={!!u.archivo && u.paginas !== null && op.texto.trim().length > 0} onOtra={() => { u.setArchivos([]); t.limpiar(); }} correr={() => t.ejecutar(() => marcaDeAgua(u.archivo as File, op))} />
    </Cuadro>
  );
}

// ─── Comprimir ───
export function ComprimirPdf() {
  const t = useTarea();
  const u = useUnPdf();
  const [nivel, setNivel] = useState<NivelCompresion>('media');
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      {u.archivo && (
        <>
          <SegmentedControl label="Nivel de compresión" value={nivel} onChange={setNivel} options={[{ value: 'alta', label: 'Menos compresión' }, { value: 'media', label: 'Recomendada' }, { value: 'baja', label: 'Máxima compresión' }]} />
          <Notice tone="neutral" icon={<CircleAlert size={16} />}>Para reducir el peso, cada página se convierte en imagen: el PDF pesa menos, pero el texto deja de poder seleccionarse o buscarse. Si necesitas copiar texto, usa el original.</Notice>
        </>
      )}
      <Accion t={t} etiqueta="Comprimir PDF" listo={!!u.archivo && u.paginas !== null} onOtra={() => { u.setArchivos([]); t.limpiar(); }} correr={() => t.ejecutar(av => comprimir(u.archivo as File, nivel, av))} />
    </Cuadro>
  );
}
