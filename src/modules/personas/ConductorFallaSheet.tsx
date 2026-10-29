import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, ChevronDown, Images, Trash2, X } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { uuid } from '../../core/lib/uuid';

/** Viaje del conductor (campos del portal). kilometraje y horas_motor son opcionales, como en el clásico. */
export interface ViajeFalla {
  codigo: string; placa_tracto: string; placa_remolque: string; ruta: string;
  kilometraje?: number | string | null; horas_motor?: number | string | null;
}

type Unidad = 'TRACTO' | 'REMOLQUE';
interface SistemaCfg { key: string; title: string; items: Array<string | { id?: string; label?: string }> }
interface ConfigSistemas { ok?: boolean; tracto?: SistemaCfg[]; remolque?: SistemaCfg[] }
interface Marca { unidad: Unidad; sistema: string; item: string; obs: string }
interface Manual { id: string; unidad: Unidad; desc: string }
type Gps = Record<string, unknown>;

const textoItem = (it: SistemaCfg['items'][number]) => (typeof it === 'string' ? it : it.label || it.id || '');
const placaLimpia = (p?: string | null) => { const t = (p ?? '').trim().toUpperCase(); return t && t !== '---' ? t : ''; };
const soloAlfanum = (s: unknown) => String(s ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
const clave = (u: Unidad, sistema: string, item: string) => JSON.stringify([u, sistema, item]);
const plural = (n: number, s: string) => `${n} ${s}${n !== 1 ? 's' : ''}`;
const ahora = () => new Date().toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Coincide la unidad del GPS con la placa, igual que el clásico (placa o nombre de Wialon) */
function coincideGps(w: Gps, placa: string) {
  const p = soloAlfanum(placa);
  if (!p) return false;
  const wp = soloAlfanum(w.placa), wn = soloAlfanum(w.nombre_wialon);
  return (!!wp && (wp.includes(p) || p.includes(wp))) || (!!wn && (wn.includes(p) || p.includes(wn)));
}

/** Foto a 1200 px de lado mayor, JPEG al 82 %: igual que el clásico */
function reducir(file: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; } else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { rechazar(new Error('Este navegador no permite procesar la foto.')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolver(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => rechazar(new Error('No se pudo leer una de las fotos.'));
      img.src = String(lector.result);
    };
    lector.onerror = () => rechazar(new Error('No se pudo leer una de las fotos.'));
    lector.readAsDataURL(file);
  });
}

/** Lista de unidades del GPS (Wialon). Si no responde, el reporte se completa a mano. */
async function consultarWialon(): Promise<Gps[]> {
  try {
    const r = await api<{ data?: unknown }>('/script/obtenerDatosWialon', { method: 'POST', body: { args: [] } });
    return Array.isArray(r.data) ? (r.data as Gps[]) : [];
  } catch {
    return [];
  }
}

// Reportar Falla en Ruta: misma estructura, textos y validaciones que el modal del portal de escritorio.
// Envía a POST /api/checklist con anexar_si_existe (si el viaje ya tiene reporte, la falla se anexa).
export function ConductorFallaSheet({ open, viaje, conductor, onClose, onHecho }: {
  open: boolean; viaje: ViajeFalla; conductor: string; onClose: () => void; onHecho: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [km, setKm] = useState('');
  const [horas, setHoras] = useState('');
  const [marcas, setMarcas] = useState<Record<string, Marca>>({});
  const [manuales, setManuales] = useState<Manual[]>([]);
  const [fotos, setFotos] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  const cfg = useQuery<ConfigSistemas>({
    queryKey: ['personas', 'checklist-config'],
    enabled: open,
    queryFn: () => api<ConfigSistemas>('/checklist/config-sistemas'),
    staleTime: 10 * 60_000,
  });
  const wialon = useQuery<Gps[]>({ queryKey: ['personas', 'wialon-lista'], enabled: open, queryFn: consultarWialon, staleTime: 30_000 });

  const placaT = placaLimpia(viaje.placa_tracto);
  const placaR = placaLimpia(viaje.placa_remolque);

  // Al abrir: se limpia todo y se precarga el kilometraje y las horas del viaje
  useEffect(() => {
    if (!open) return;
    setKm(viaje.kilometraje ? String(viaje.kilometraje) : '');
    setHoras(viaje.horas_motor ? String(viaje.horas_motor) : '');
    setMarcas({}); setManuales([]); setFotos([]); setBusqueda(''); setAbiertos({}); setError(null);
  }, [open, viaje.codigo]);

  // El GPS (Wialon) reemplaza el kilometraje del tracto y las horas de la carreta cuando encuentra la unidad
  useEffect(() => {
    if (!open || !wialon.data) return;
    const t = wialon.data.find(w => coincideGps(w, placaT));
    if (t && parseFloat(String(t.km)) > 0) setKm(String(Math.round(parseFloat(String(t.km)))));
    const r = wialon.data.find(w => coincideGps(w, placaR));
    if (r && parseFloat(String(r.horas)) > 0) setHoras(String(Math.round(parseFloat(String(r.horas)))));
  }, [open, wialon.data, placaT, placaR]);

  function alternar(u: Unidad, sistema: string, item: string) {
    const k = clave(u, sistema, item);
    setMarcas(m => {
      const n = { ...m };
      if (n[k]) delete n[k]; else n[k] = { unidad: u, sistema, item, obs: '' };
      return n;
    });
  }
  const cambiarDetalle = (k: string, texto: string) => setMarcas(m => (m[k] ? { ...m, [k]: { ...m[k], obs: texto } } : m));

  async function agregarFotos(lista: FileList | null) {
    if (!lista?.length) return;
    setLeyendo(true);
    try {
      const nuevas = await Promise.all(Array.from(lista).map(reducir));
      setFotos(f => [...f, ...nuevas]);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLeyendo(false);
    }
  }

  const q = busqueda.trim().toUpperCase();
  /** Sistemas con al menos un ítem que coincide con la búsqueda (por sistema o ítem) */
  function visibles(lista: SistemaCfg[]) {
    return lista
      .map(s => ({ s, items: s.items.map(textoItem).filter(it => !q || it.toUpperCase().includes(q) || s.title.toUpperCase().includes(q)) }))
      .filter(x => x.items.length > 0);
  }

  const marcadas = Object.values(marcas);
  const manualesCon = manuales.filter(m => m.desc.trim());
  const total = marcadas.length + manualesCon.length;

  async function enviar() {
    const kmNum = parseInt(km, 10);
    if (!kmNum || kmNum <= 0) { setError('Por favor ingresa el Kilometraje actual del tracto para guardar el reporte.'); return; }
    if (total === 0) { setError('Por favor marca al menos una falla en los acordeones o agrega una falla manual para poder enviar el reporte.'); return; }

    const ts = ahora();
    const deUnidad = (u: Unidad) => [
      ...marcadas.filter(m => m.unidad === u).map(m => ({ sistema: m.sistema.toUpperCase(), item: m.item, obs: m.obs.trim() || m.item, fecha: ts })),
      ...manualesCon.filter(m => m.unidad === u).map(m => ({ sistema: 'MANUAL', item: 'Falla Manual', obs: m.desc.trim(), fecha: ts })),
    ];

    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string; folio?: string; anexado?: boolean }>('/checklist', {
        method: 'POST',
        body: {
          orden_viaje: viaje.codigo,
          placa_tracto: placaT,
          placa_remolque: placaR,
          kilometraje: kmNum,
          km_inicial: kmNum,
          km_final: kmNum,
          horas_motor: parseInt(horas, 10) || null,
          conductor: conductor || 'Conductor',
          procedencia: viaje.ruta,
          fallas_tracto: deUnidad('TRACTO'),
          fallas_remolque: deUnidad('REMOLQUE'),
          fallas_libres_text: '',
          fotos_base64: fotos,
          creado_por: conductor ? `${conductor} (Conductor)` : 'Conductor',
          anexar_si_existe: true,
        },
      });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el reporte de fallas.');
      haptic('success');
      toast(r.anexado
        ? `Fallas anexadas exitosamente al reporte de tu viaje activo. Folio: ${r.folio ?? 'Registrado'}`
        : `Reporte de fallas generado y enviado exitosamente. Folio: ${r.folio ?? 'Registrado'}`);
      await onHecho();
      onClose();
    } catch (err) {
      setError(`Error al enviar el reporte de fallas: ${errorMessage(err)}`);
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  const pT = placaT || 'TRACTO';
  const pR = placaR || 'CARRETA';

  return (
    <Sheet open={open} ancho onClose={() => !enviando && onClose()} title="Reportar Falla en Ruta"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={enviar} loading={enviando} disabled={leyendo}>{enviando ? 'Enviando reporte...' : 'Enviar Reporte de Fallas'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <p className="t-footnote c-secondary">Viaje: {viaje.codigo}</p>
        {error && <Notice tone="error">{error}</Notice>}

        {/* 1. Unidades asignadas y lecturas */}
        <section className="tarjeta__lista">
          <div className="dato"><span className="dato__label">TRACTO (PLACA PRINCIPAL)</span><span className="dato__valor dato__valor--mono">{placaT || '---'}</span></div>
          <div className="dato"><span className="dato__label">CARRETA / REMOLQUE</span><span className="dato__valor dato__valor--mono">{placaR || '---'}</span></div>
          <div className="dato"><span className="dato__label">Ruta</span><span className="dato__valor">{viaje.ruta || '---'}</span></div>
        </section>
        <div className="form-grid">
          <Field label="Kilometraje (Tracto) *">{p => <TextInput {...p} inputMode="numeric" placeholder="Ej: 118067" value={km} onChange={e => setKm(e.target.value.replace(/\D/g, ''))} />}</Field>
          <Field label="Horas de Motor (Remolque / Termoking)">{p => <TextInput {...p} inputMode="numeric" placeholder="Ej: 1250" value={horas} onChange={e => setHoras(e.target.value.replace(/\D/g, ''))} />}</Field>
        </div>

        {/* 2. Fallas encontradas (checklist completo) */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <h3 className="tarjeta__grupo-titulo" style={{ margin: 0 }}>Fallas Encontradas</h3>
          <p className="t-footnote c-secondary">Marca solo lo que esté fallando: al hacer click se abre el espacio para describirlo. Lo que está en buen estado, ni lo toques.</p>
          <TextInput aria-label="Buscar por sistema o ítem" placeholder="Buscar por sistema o ítem..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <p className="t-footnote" style={{ fontWeight: 700 }}>{`${total} falla${total !== 1 ? 's' : ''} marcada${total !== 1 ? 's' : ''}`}</p>

          <SistemasUnidad titulo="TRACTO (Placa Principal)" badge="Unidad Principal" vacio="Sin coincidencias para la búsqueda en sistemas de Tracto."
            unidad="TRACTO" grupos={visibles(cfg.data?.tracto ?? [])} cargando={cfg.isLoading} error={cfg.isError}
            marcas={marcas} abiertos={abiertos} buscando={!!q}
            onAbrir={k => setAbiertos(a => ({ ...a, [k]: !a[k] }))} onAlternar={alternar} onDetalle={cambiarDetalle} />
          <SistemasUnidad titulo="SEMIRREMOLQUE / CARRETA" badge="Carreta / Semirremolque" vacio="Sin coincidencias para la búsqueda en sistemas de Remolque."
            unidad="REMOLQUE" grupos={visibles(cfg.data?.remolque ?? [])} cargando={cfg.isLoading} error={cfg.isError}
            marcas={marcas} abiertos={abiertos} buscando={!!q}
            onAbrir={k => setAbiertos(a => ({ ...a, [k]: !a[k] }))} onAlternar={alternar} onDetalle={cambiarDetalle} />

          {/* Falla manual / ítem personalizado */}
          <div className="tarjeta__lista" style={{ padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>¿No encuentras el ítem? agrégalo aquí manualmente:</span>
            {manuales.map(m => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', padding: 'var(--s-2)', background: 'var(--surface, #fff)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2)' }}>
                  <select className="select" style={{ maxWidth: 170 }} value={m.unidad}
                    onChange={e => setManuales(l => l.map(x => x.id === m.id ? { ...x, unidad: e.target.value as Unidad } : x))}>
                    <option value="TRACTO">{`Tracto (${pT})`}</option>
                    <option value="REMOLQUE">{`Carreta (${pR})`}</option>
                  </select>
                  <button type="button" className="placas-limpiar" aria-label="Quitar falla manual" style={{ color: 'var(--red-ink)', minHeight: 44 }}
                    onClick={() => setManuales(l => l.filter(x => x.id !== m.id))}><Trash2 size={16} /></button>
                </div>
                <TextInput value={m.desc} placeholder="Escribe aquí la falla observada (Ej: Fuga de aire en manguera 2)..."
                  onChange={e => setManuales(l => l.map(x => x.id === m.id ? { ...x, desc: e.target.value } : x))} />
              </div>
            ))}
            <div><Button variant="secondary" onClick={() => setManuales(l => [...l, { id: uuid(), unidad: 'TRACTO', desc: '' }])}>Agregar otra falla</Button></div>
          </div>
        </section>

        {/* 3. Detalle de fallas reportadas (tabla resumen) */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="tarjeta__grupo-titulo" style={{ margin: 0 }}>Detalle de Fallas Reportadas</h3>
            <span className="t-footnote">{plural(total, 'falla')}</span>
          </div>
          <div className="tarjeta__lista">
            <div className="dato" style={{ flexDirection: 'row', gap: 'var(--s-2)', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
              <span style={{ width: 100 }}>Unidad</span><span style={{ width: 120 }}>Sistema</span><span style={{ width: 180 }}>Ítem</span><span style={{ flex: 1 }}>Descripción / Observación</span>
            </div>
            {total === 0 && <div className="dato"><span className="dato__valor c-secondary">No has marcado ninguna falla aún.</span></div>}
            {marcadas.map(m => (
              <div key={clave(m.unidad, m.sistema, m.item)} className="dato" style={{ flexDirection: 'row', gap: 'var(--s-2)', fontSize: '0.82rem' }}>
                <span style={{ width: 100 }}>{m.unidad === 'TRACTO' ? `Tracto (${pT})` : `Carreta (${pR})`}</span>
                <span style={{ width: 120 }}>{m.sistema}</span>
                <span style={{ width: 180, color: 'var(--red-ink)', fontWeight: 700 }}>{m.item}</span>
                <span style={{ flex: 1 }}>{m.obs.trim() || <em className="c-secondary">Por especificar</em>}</span>
                <button type="button" className="placas-limpiar" aria-label="Quitar falla" style={{ minHeight: 44 }}
                  onClick={() => alternar(m.unidad, m.sistema, m.item)}><X size={14} /></button>
              </div>
            ))}
            {manualesCon.map(m => (
              <div key={m.id} className="dato" style={{ flexDirection: 'row', gap: 'var(--s-2)', fontSize: '0.82rem' }}>
                <span style={{ width: 100 }}>{m.unidad === 'TRACTO' ? `Tracto (${pT})` : `Carreta (${pR})`}</span>
                <span style={{ width: 120 }}>MANUAL</span>
                <span style={{ width: 180, color: 'var(--red-ink)', fontWeight: 700 }}>Falla Manual</span>
                <span style={{ flex: 1 }}>{m.desc.trim()}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Evidencia fotográfica */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          <h3 className="tarjeta__grupo-titulo" style={{ margin: 0 }}>Evidencia Fotográfica (Opcional)</h3>
          <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={e => { void agregarFotos(e.target.files); e.target.value = ''; }} />
          <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={e => { void agregarFotos(e.target.files); e.target.value = ''; }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
            <Button variant="primary" icon={<Camera size={16} />} disabled={leyendo} onClick={() => camara.current?.click()}>Tomar Foto</Button>
            <Button variant="secondary" icon={<Images size={16} />} disabled={leyendo} onClick={() => galeria.current?.click()}>Galería</Button>
          </div>
          {fotos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
              {fotos.map((f, i) => (
                <div key={i} style={{ position: 'relative', width: 76, height: 76 }}>
                  <img src={f} alt={`Evidencia ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                  <button type="button" aria-label={`Quitar foto ${i + 1}`} onClick={() => setFotos(l => l.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, background: 'none', border: 0, cursor: 'pointer', display: 'grid', placeItems: 'start end' }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}

/** Sistemas de una unidad: cada uno se despliega y sus ítems se marcan; al marcar se abre el detalle */
function SistemasUnidad({ titulo, badge, vacio, unidad, grupos, cargando, error, marcas, abiertos, buscando, onAbrir, onAlternar, onDetalle }: {
  titulo: string; badge: string; vacio: string; unidad: Unidad;
  grupos: Array<{ s: SistemaCfg; items: string[] }>; cargando: boolean; error: boolean;
  marcas: Record<string, Marca>; abiertos: Record<string, boolean>; buscando: boolean;
  onAbrir: (k: string) => void; onAlternar: (u: Unidad, sistema: string, item: string) => void; onDetalle: (k: string, texto: string) => void;
}) {
  const marcadasEn = (sistema: string) => Object.values(marcas).filter(m => m.unidad === unidad && m.sistema === sistema.toUpperCase()).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
      <div className="dato" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="dato__valor" style={{ fontWeight: 700 }}>{titulo}</span>
        <span className="t-footnote">{badge}</span>
      </div>
      {cargando && <p className="t-footnote c-secondary">Cargando sistemas de revisión…</p>}
      {error && <Notice tone="neutral">No se pudieron cargar los sistemas de revisión. Puedes reportar la falla como manual.</Notice>}
      {!cargando && !error && grupos.length === 0 && buscando && <p className="t-footnote c-secondary">{vacio}</p>}
      <div className="tarjeta__lista">
        {grupos.map(({ s, items }) => {
          const k = `${unidad}|${s.key}`;
          const abierto = !!abiertos[k] || (buscando && items.length > 0);
          const n = marcadasEn(s.title);
          return (
            <div key={k}>
              <button type="button" className="dato" aria-expanded={abierto} onClick={() => onAbrir(k)}
                style={{ flexDirection: 'row', width: '100%', textAlign: 'left', background: 'transparent', border: 0, alignItems: 'center', minHeight: 44, cursor: 'pointer', gap: 'var(--s-2)' }}>
                <span className="t-footnote" style={{ fontWeight: 700 }}>{items.length}</span>
                <span className="dato__valor" style={{ flex: 1, fontWeight: 600 }}>{s.title}</span>
                {n > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--red-ink)' }}>{n}</span>}
                <ChevronDown size={16} style={{ transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform 200ms' }} />
              </button>
              {abierto && items.map(item => {
                const mk = clave(unidad, s.title.toUpperCase(), item);
                const marca = marcas[mk];
                return (
                  <div key={mk} style={{ padding: '0 var(--s-2) var(--s-2)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 44, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!marca} onChange={() => onAlternar(unidad, s.title.toUpperCase(), item)} style={{ width: 22, height: 22 }} />
                      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{item}</span>
                    </label>
                    {marca && <TextInput value={marca.obs} placeholder="Detalle adicional de la falla..." onChange={e => onDetalle(mk, e.target.value)} />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
