import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Download } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, PasswordInput, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ZonaArchivos } from './ZonaArchivos';
import { SelectorPaginas } from './SelectorPaginas';
import { PadFirma } from './PadFirma';
import { Accion, Aviso, Cuadro, ElegirPdf, useTarea, useUnPdf } from './Herramientas';
import {
  compararPdf, descargar, firmar, imagenesAPdf, leerCampos, leerRangos, llenarFormulario, miniaturas, pdfAMarkdown, recortar, reparar, reordenar,
  type CampoForm, type LineaDiff, type OpcionesFirma, type OpcionesImagenPdf,
} from './motorPdf';

// Herramientas PDF que se suman a las básicas: eliminar y extraer páginas, escanear, reparar, recortar, firmar, comparar, Markdown y formularios.
// Todas trabajan en este navegador: los archivos no se envían a ningún servidor.

/** Páginas marcadas + un cuadro para marcarlas escribiendo rangos («1-3, 5») */
function MarcarPaginas({ u, seleccion, onSeleccion, tono, onError }: {
  u: ReturnType<typeof useUnPdf>; seleccion: Set<number>; onSeleccion: (s: Set<number>) => void; tono: 'borrar' | 'guardar'; onError: (m: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const [errorRango, setErrorRango] = useState<string | null>(null);
  function aplicar() {
    if (!u.paginas) return;
    try { onSeleccion(new Set(leerRangos(texto, u.paginas).flat())); setErrorRango(null); }
    catch (e) { setErrorRango(String((e as Error).message)); }
  }
  if (!u.archivo) return null;
  return (
    <>
      <div className="hp-rango">
        <Field label="Marcar escribiendo los números" hint="Ejemplo: 1-3, 5, 8-10" error={errorRango ?? undefined}>
          {p => <TextInput {...p} value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') aplicar(); }} placeholder="1-3, 5, 8-10" />}
        </Field>
        <Button variant="secondary" onClick={aplicar} disabled={!texto.trim() || u.paginas === null}>Marcar</Button>
        <Button variant="plain" onClick={() => onSeleccion(new Set())} disabled={!seleccion.size}>Quitar marcas</Button>
      </div>
      <p className="hp-ayuda">{seleccion.size} {seleccion.size === 1 ? 'página marcada' : 'páginas marcadas'}. Toca las páginas para marcarlas.</p>
      <SelectorPaginas archivo={u.archivo} seleccion={seleccion} onSeleccion={onSeleccion} tono={tono} onError={onError} />
    </>
  );
}

// ─── Eliminar páginas ───
export function EliminarPaginas() {
  const t = useTarea();
  const u = useUnPdf();
  const [sel, setSel] = useState<Set<number>>(new Set());
  useEffect(() => { setSel(new Set()); }, [u.archivo]);
  const quedan = (u.paginas ?? 0) - sel.size;
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      <MarcarPaginas u={u} seleccion={sel} onSeleccion={s => { setSel(s); t.limpiar(); }} tono="borrar" onError={t.setError} />
      {u.paginas !== null && sel.size > 0 && quedan <= 0 && <Notice tone="error" icon={<CircleAlert size={16} />}>No puedes eliminar todas las páginas.</Notice>}
      <Accion t={t} etiqueta={sel.size ? `Eliminar ${sel.size} ${sel.size === 1 ? 'página' : 'páginas'}` : 'Eliminar páginas'} listo={!!u.archivo && sel.size > 0 && quedan > 0}
        onOtra={() => { u.setArchivos([]); setSel(new Set()); t.limpiar(); }}
        correr={() => t.ejecutar(() => reordenar(u.archivo as File, Array.from({ length: u.paginas ?? 0 }, (_, i) => i).filter(i => !sel.has(i)).map(indice => ({ indice, giro: 0 })), `${(u.archivo as File).name.replace(/\.[^.]+$/, '')}_sin-paginas.pdf`))} />
    </Cuadro>
  );
}

// ─── Extraer páginas ───
export function ExtraerPaginas() {
  const t = useTarea();
  const u = useUnPdf();
  const [sel, setSel] = useState<Set<number>>(new Set());
  useEffect(() => { setSel(new Set()); }, [u.archivo]);
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      <MarcarPaginas u={u} seleccion={sel} onSeleccion={s => { setSel(s); t.limpiar(); }} tono="guardar" onError={t.setError} />
      <Accion t={t} etiqueta={sel.size ? `Extraer ${sel.size} ${sel.size === 1 ? 'página' : 'páginas'}` : 'Extraer páginas'} listo={!!u.archivo && sel.size > 0}
        onOtra={() => { u.setArchivos([]); setSel(new Set()); t.limpiar(); }}
        correr={() => t.ejecutar(() => reordenar(u.archivo as File, [...sel].sort((a, b) => a - b).map(indice => ({ indice, giro: 0 })), `${(u.archivo as File).name.replace(/\.[^.]+$/, '')}_extraido.pdf`))} />
    </Cuadro>
  );
}

// ─── Escanea a PDF ───
export function EscanearAPdf() {
  const t = useTarea();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<NonNullable<OpcionesImagenPdf['filtro']>>('documento');
  return (
    <Cuadro>
      <ZonaArchivos tipo="imagen" multiple ordenable camara accept="image/*,.heic,.heif" archivos={archivos} onChange={a => { setArchivos(a); t.limpiar(); }} etiqueta="Elegir fotos" onAviso={setAviso} disabled={t.trabajando} />
      <Aviso texto={aviso} />
      <p className="hp-ayuda">Cada foto es una página. Toma una por una (o elige varias) y ordénalas con las flechas.</p>
      <Field label="Aspecto del documento">
        {p => <SelectInput {...p} value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}>
          <option value="documento">Documento (blanco y negro, más nítido)</option>
          <option value="gris">Escala de grises</option>
          <option value="color">Color original</option>
        </SelectInput>}
      </Field>
      <Accion t={t} etiqueta="Crear PDF" listo={archivos.length > 0} onOtra={() => { setArchivos([]); t.limpiar(); }}
        correr={() => t.ejecutar(av => imagenesAPdf(archivos, { hoja: 'a4', orientacion: 'auto', margen: 'sin', filtro }, av))} />
    </Cuadro>
  );
}

// ─── Reparar ───
export function RepararPdf() {
  const t = useTarea();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <Cuadro>
      <ZonaArchivos tipo="pdf" accept="application/pdf,.pdf" archivos={archivos} onChange={a => { setArchivos(a); t.limpiar(); }} etiqueta="Elegir PDF dañado" onAviso={setAviso} disabled={t.trabajando} />
      <Aviso texto={aviso} />
      <p className="hp-ayuda">Se intenta recuperar página por página. Si el archivo no abre de ninguna forma, se rehace cada página como imagen.</p>
      <Accion t={t} etiqueta="Reparar PDF" listo={archivos.length > 0} onOtra={() => { setArchivos([]); t.limpiar(); }} correr={() => t.ejecutar(av => reparar(archivos[0], av))} />
    </Cuadro>
  );
}

// ─── Recortar ───
export function RecortarPdf() {
  const t = useTarea();
  const u = useUnPdf();
  const [m, setM] = useState({ arriba: '10', abajo: '10', izquierda: '10', derecha: '10' });
  const [url, setUrl] = useState<string | null>(null);
  const [cuales, setCuales] = useState<'todas' | 'algunas'>('todas');
  const [texto, setTexto] = useState('');
  useEffect(() => {
    setUrl(null);
    if (!u.archivo) return;
    let vivo = true; let ultima: string | null = null;
    miniaturas(u.archivo, 280, (_i, x) => { ultima = x; if (vivo) setUrl(x); }, () => !vivo || ultima !== null).catch(() => undefined);
    return () => { vivo = false; if (ultima) URL.revokeObjectURL(ultima); };
  }, [u.archivo]);
  const mm = useMemo(() => ({ arriba: Number(m.arriba) || 0, abajo: Number(m.abajo) || 0, izquierda: Number(m.izquierda) || 0, derecha: Number(m.derecha) || 0 }), [m]);
  // La hoja A4 (210 × 297 mm) sirve de referencia para dibujar los márgenes sobre la vista previa
  const pct = { t: Math.min(45, (mm.arriba / 297) * 100), b: Math.min(45, (mm.abajo / 297) * 100), l: Math.min(45, (mm.izquierda / 210) * 100), r: Math.min(45, (mm.derecha / 210) * 100) };
  const campo = (k: keyof typeof m, etiqueta: string) => (
    <Field label={`${etiqueta} (mm)`}>{p => <TextInput {...p} inputMode="decimal" value={m[k]} onChange={e => setM({ ...m, [k]: e.target.value.replace(/[^\d.]/g, '') })} />}</Field>
  );
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      {u.archivo && (
        <>
          <div className="hp-recorte">
            <div className="hp-recorte__vista">
              {url ? <img src={url} alt="Primera página" draggable={false} /> : <span className="spinner" aria-hidden />}
              {url && <div className="hp-recorte__marco" style={{ top: `${pct.t}%`, bottom: `${pct.b}%`, left: `${pct.l}%`, right: `${pct.r}%` }} aria-hidden />}
            </div>
            <div className="hp-opciones">
              {campo('arriba', 'Arriba')}{campo('abajo', 'Abajo')}{campo('izquierda', 'Izquierda')}{campo('derecha', 'Derecha')}
            </div>
          </div>
          <p className="hp-ayuda">El recuadro muestra lo que se conserva (vista aproximada). Los milímetros se quitan de cada borde.</p>
          <SegmentedControl label="Páginas" value={cuales} onChange={setCuales} options={[{ value: 'todas', label: 'Todas' }, { value: 'algunas', label: 'Solo algunas' }]} />
          {cuales === 'algunas' && <Field label="Páginas a recortar" hint="Ejemplo: 1-3, 5">{p => <TextInput {...p} value={texto} onChange={e => setTexto(e.target.value)} placeholder="1-3, 5" />}</Field>}
        </>
      )}
      <Accion t={t} etiqueta="Recortar PDF" listo={!!u.archivo && u.paginas !== null && (cuales === 'todas' || texto.trim().length > 0)} onOtra={() => { u.setArchivos([]); t.limpiar(); }}
        correr={() => t.ejecutar(async () => recortar(u.archivo as File, mm, cuales === 'todas' ? null : leerRangos(texto, u.paginas ?? 0).flat()))} />
    </Cuadro>
  );
}

// ─── Firmar ───
export function FirmarPdf() {
  const t = useTarea();
  const u = useUnPdf();
  const [png, setPng] = useState<Uint8Array | null>(null);
  const [donde, setDonde] = useState<'ultima' | 'primera' | 'todas' | 'algunas'>('ultima');
  const [texto, setTexto] = useState('');
  const [posicion, setPosicion] = useState<OpcionesFirma['posicion']>('abajo-derecha');
  const [ancho, setAncho] = useState('25');
  const paginas = (): number[] => {
    const n = u.paginas ?? 0;
    if (donde === 'ultima') return [n - 1];
    if (donde === 'primera') return [0];
    if (donde === 'todas') return Array.from({ length: n }, (_, i) => i);
    return leerRangos(texto, n).flat();
  };
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      {u.archivo && (
        <>
          <p className="hp-ayuda"><strong>Tu firma</strong></p>
          <PadFirma onChange={setPng} />
          <SegmentedControl label="Páginas" value={donde} onChange={setDonde} options={[{ value: 'ultima', label: 'Última' }, { value: 'primera', label: 'Primera' }, { value: 'todas', label: 'Todas' }, { value: 'algunas', label: 'Algunas' }]} />
          {donde === 'algunas' && <Field label="Páginas" hint="Ejemplo: 1-3, 5">{p => <TextInput {...p} value={texto} onChange={e => setTexto(e.target.value)} placeholder="1-3, 5" />}</Field>}
          <div className="hp-opciones">
            <Field label="Posición">{p => <SelectInput {...p} value={posicion} onChange={e => setPosicion(e.target.value as OpcionesFirma['posicion'])}>
              <option value="abajo-derecha">Abajo a la derecha</option><option value="abajo-centro">Abajo al centro</option><option value="abajo-izquierda">Abajo a la izquierda</option>
              <option value="centro">Al centro</option>
              <option value="arriba-derecha">Arriba a la derecha</option><option value="arriba-centro">Arriba al centro</option><option value="arriba-izquierda">Arriba a la izquierda</option>
            </SelectInput>}</Field>
            <Field label="Tamaño">{p => <SelectInput {...p} value={ancho} onChange={e => setAncho(e.target.value)}><option value="15">Pequeña</option><option value="25">Mediana</option><option value="40">Grande</option></SelectInput>}</Field>
          </div>
          <Notice tone="neutral" icon={<CircleAlert size={16} />}>Es una firma visual (una imagen sobre el documento), no una firma digital con certificado.</Notice>
        </>
      )}
      <Accion t={t} etiqueta="Firmar PDF" listo={!!u.archivo && u.paginas !== null && !!png && (donde !== 'algunas' || texto.trim().length > 0)} onOtra={() => { u.setArchivos([]); t.limpiar(); }}
        correr={() => t.ejecutar(async () => firmar(u.archivo as File, { png: png as Uint8Array, ancho: Number(ancho), posicion, paginas: paginas() }))} />
    </Cuadro>
  );
}

// ─── Comparar ───
export function CompararPdf() {
  const [a, setA] = useState<File[]>([]);
  const [b, setB] = useState<File[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaDiff[] | null>(null);
  const [soloCambios, setSoloCambios] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function comparar() {
    setError(null); setLineas(null); setTrabajando(true);
    try { setLineas(await compararPdf(a[0], b[0])); }
    catch (e) { setError(String((e as Error).message ?? e)); }
    finally { setTrabajando(false); }
  }
  const cuenta = (tipo: LineaDiff['tipo']) => (lineas ?? []).filter(l => l.tipo === tipo).length;
  const visibles = (lineas ?? []).filter(l => !soloCambios || l.tipo !== 'igual');

  function bajarInforme() {
    const txt = (lineas ?? []).filter(l => l.tipo !== 'igual').map(l => `${l.tipo === 'quitado' ? '-' : '+'} [p. ${l.pagina}] ${l.texto}`).join('\n');
    descargar({ nombre: 'comparacion.txt', blob: new Blob([txt || 'Sin diferencias de texto.'], { type: 'text/plain;charset=utf-8' }) });
  }

  return (
    <Cuadro>
      <div className="hp-dos">
        <div><p className="hp-ayuda"><strong>Versión original</strong></p><ZonaArchivos tipo="pdf" accept="application/pdf,.pdf" archivos={a} onChange={x => { setA(x); setLineas(null); }} etiqueta="Elegir el original" onAviso={setAviso} disabled={trabajando} /></div>
        <div><p className="hp-ayuda"><strong>Versión nueva</strong></p><ZonaArchivos tipo="pdf" accept="application/pdf,.pdf" archivos={b} onChange={x => { setB(x); setLineas(null); }} etiqueta="Elegir la nueva" onAviso={setAviso} disabled={trabajando} /></div>
      </div>
      <Aviso texto={aviso} />
      {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
      <Button variant="primary" size="lg" className="hp-procesar" loading={trabajando} disabled={!a.length || !b.length || trabajando} onClick={() => { void comparar(); }}>{trabajando ? 'Comparando…' : 'Comparar'}</Button>
      {lineas && (
        <div className="hp-diff">
          <div className="hp-diff__cab">
            <span className="hp-diff__chip hp-diff__chip--quitado">{cuenta('quitado')} quitadas</span>
            <span className="hp-diff__chip hp-diff__chip--agregado">{cuenta('agregado')} agregadas</span>
            <span className="hp-diff__chip">{cuenta('igual')} iguales</span>
            <label className="hp-diff__ver"><input type="checkbox" checked={soloCambios} onChange={e => setSoloCambios(e.target.checked)} /> Solo los cambios</label>
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={bajarInforme}>Descargar informe</Button>
          </div>
          {visibles.length === 0
            ? <p className="hp-ayuda">No hay diferencias en el texto de los dos documentos.</p>
            : <div className="hp-diff__lista">{visibles.slice(0, 1500).map((l, i) => (
              <div key={i} className={`hp-diff__linea hp-diff__linea--${l.tipo}`}><span className="hp-diff__marca">{l.tipo === 'quitado' ? '−' : l.tipo === 'agregado' ? '+' : ' '}</span><span className="hp-diff__pag">p. {l.pagina}</span><span>{l.texto}</span></div>
            ))}</div>}
          {visibles.length > 1500 && <p className="hp-ayuda">Se muestran las primeras 1500 líneas. Descarga el informe para ver todas.</p>}
        </div>
      )}
    </Cuadro>
  );
}

// ─── PDF a Markdown ───
export function PdfAMarkdown() {
  const t = useTarea();
  const u = useUnPdf();
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      <p className="hp-ayuda">Funciona con PDF que tienen texto. Si es un escaneo no hay texto que sacar.</p>
      <Accion t={t} etiqueta="Convertir a Markdown" listo={!!u.archivo && u.paginas !== null} onOtra={() => { u.setArchivos([]); t.limpiar(); }} correr={() => t.ejecutar(av => pdfAMarkdown(u.archivo as File, av))} />
    </Cuadro>
  );
}

// ─── Formularios ───
export function FormulariosPdf() {
  const t = useTarea();
  const u = useUnPdf();
  const [campos, setCampos] = useState<CampoForm[] | null>(null);
  const [aplanar, setAplanar] = useState(false);
  useEffect(() => {
    setCampos(null);
    if (!u.archivo) return;
    let vivo = true;
    leerCampos(u.archivo).then(c => { if (vivo) setCampos(c); }).catch(e => { if (vivo) t.setError(String((e as Error).message ?? e)); });
    return () => { vivo = false; };
    // t.setError es estable en la práctica; solo importa el archivo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [u.archivo]);
  const poner = (nombre: string, valor: string | boolean) => { setCampos(cs => (cs ?? []).map(c => (c.nombre === nombre ? { ...c, valor } : c))); t.limpiar(); };
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      {u.archivo && campos && campos.length === 0 && <Notice tone="neutral" icon={<CircleAlert size={16} />}>Este PDF no tiene campos para llenar.</Notice>}
      {campos && campos.length > 0 && (
        <>
          <div className="hp-opciones">
            {campos.map(c => (
              <Field key={c.nombre} label={c.nombre}>
                {p => c.tipo === 'texto' ? <TextInput {...p} value={String(c.valor)} onChange={e => poner(c.nombre, e.target.value)} />
                  : c.tipo === 'casilla' ? <label className="hp-diff__ver"><input id={p.id} type="checkbox" checked={!!c.valor} onChange={e => poner(c.nombre, e.target.checked)} /> Marcada</label>
                  : <SelectInput {...p} value={String(c.valor)} onChange={e => poner(c.nombre, e.target.value)}><option value="">—</option>{c.opciones.map(o => <option key={o} value={o}>{o}</option>)}</SelectInput>}
              </Field>
            ))}
          </div>
          <label className="hp-diff__ver"><input type="checkbox" checked={aplanar} onChange={e => setAplanar(e.target.checked)} /> Fijar el contenido (ya no se podrá editar)</label>
        </>
      )}
      <Accion t={t} etiqueta="Guardar formulario" listo={!!campos && campos.length > 0} onOtra={() => { u.setArchivos([]); setCampos(null); t.limpiar(); }}
        correr={() => t.ejecutar(() => llenarFormulario(u.archivo as File, campos ?? [], aplanar))} />
    </Cuadro>
  );
}

// ─── OCR ───
export function OcrPdf() {
  const t = useTarea();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <Cuadro>
      <ZonaArchivos tipo="pdf" accept="application/pdf,.pdf" archivos={archivos} onChange={a => { setArchivos(a); t.limpiar(); }} etiqueta="Elegir PDF escaneado" onAviso={setAviso} disabled={t.trabajando} />
      <Aviso texto={aviso} />
      <p className="hp-ayuda">Lee el texto de cada página (en español) y lo deja seleccionable y buscable. Tarda unos segundos por página y todo se hace en este equipo.</p>
      <Accion t={t} etiqueta="Reconocer texto (OCR)" listo={archivos.length > 0} onOtra={() => { setArchivos([]); t.limpiar(); }}
        correr={() => t.ejecutar(async av => (await import('./motorOcr')).ocrPdf(archivos[0], av))} />
    </Cuadro>
  );
}

// ─── Proteger ───
export function ProtegerPdf() {
  const t = useTarea();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [clave, setClave] = useState('');
  const [repite, setRepite] = useState('');
  const [soloLectura, setSoloLectura] = useState(false);
  const distinta = repite.length > 0 && clave !== repite;
  return (
    <Cuadro>
      <ZonaArchivos tipo="pdf" accept="application/pdf,.pdf" archivos={archivos} onChange={a => { setArchivos(a); t.limpiar(); }} etiqueta="Elegir archivo PDF" onAviso={setAviso} disabled={t.trabajando} />
      <Aviso texto={aviso} />
      {archivos.length > 0 && (
        <>
          <div className="hp-opciones">
            <Field label="Contraseña">{p => <PasswordInput {...p} value={clave} autoComplete="new-password" onChange={e => { setClave(e.target.value); t.limpiar(); }} />}</Field>
            <Field label="Repite la contraseña" error={distinta ? 'No coincide con la anterior.' : undefined}>{p => <PasswordInput {...p} value={repite} autoComplete="new-password" onChange={e => setRepite(e.target.value)} />}</Field>
          </div>
          <label className="hp-diff__ver"><input type="checkbox" checked={soloLectura} onChange={e => setSoloLectura(e.target.checked)} /> Solo lectura: no dejar imprimir, copiar ni editar</label>
          <Notice tone="neutral" icon={<CircleAlert size={16} />}>Cifrado AES de 256 bits. Si olvidas la contraseña no hay forma de recuperar el archivo: guárdala en un lugar seguro.</Notice>
        </>
      )}
      <Accion t={t} etiqueta="Proteger PDF" listo={archivos.length > 0 && clave.length >= 4 && clave === repite} onOtra={() => { setArchivos([]); setClave(''); setRepite(''); t.limpiar(); }}
        correr={() => t.ejecutar(async () => (await import('./motorSeguridad')).protegerPdf(archivos[0], clave, soloLectura))} />
    </Cuadro>
  );
}

// ─── Desbloquear ───
export function DesbloquearPdf() {
  const t = useTarea();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [clave, setClave] = useState('');
  return (
    <Cuadro>
      <ZonaArchivos tipo="pdf" accept="application/pdf,.pdf" archivos={archivos} onChange={a => { setArchivos(a); t.limpiar(); }} etiqueta="Elegir PDF con contraseña" onAviso={setAviso} disabled={t.trabajando} />
      <Aviso texto={aviso} />
      {archivos.length > 0 && (
        <Field label="Contraseña del PDF" hint="Déjala vacía si el PDF abre sin contraseña pero no deja imprimir o copiar.">
          {p => <PasswordInput {...p} value={clave} autoComplete="off" onChange={e => { setClave(e.target.value); t.limpiar(); }} />}
        </Field>
      )}
      <Notice tone="neutral" icon={<CircleAlert size={16} />}>Solo funciona con archivos tuyos o que tengas permiso de abrir: hace falta conocer la contraseña si el PDF la pide.</Notice>
      <Accion t={t} etiqueta="Quitar la protección" listo={archivos.length > 0} onOtra={() => { setArchivos([]); setClave(''); t.limpiar(); }}
        correr={() => t.ejecutar(async () => (await import('./motorSeguridad')).desbloquearPdf(archivos[0], clave))} />
    </Cuadro>
  );
}
