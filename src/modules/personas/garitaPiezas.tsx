// Garita: piezas compartidas entre salida, retorno y lista (documentos, checklist, galería, acta PDF).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Info, Truck, Wrench, ShoppingCart } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { compartirPDF } from '../../core/lib/pdf';
import { abrirActaParaImprimir, cargarFlotaDocs, docsDeVehiculos, fotosParaActa, htmlActaGarita, nombreArchivoActa, pdfBlobDeActa, type DocsVehiculo, type FaseActa, type RegistroActa } from './garitaActa';
import { ChecklistGarita, FotosEvidencia, useTemplateGarita, type CatChk, type ValoresChk } from './garitaComponentes';
import type { FotoReg, Registro, TipoSalida } from './garitaBase';

// ── Documentos (SOAT y revisión técnica), solo informativos ──
export function useDocsPlaca(placa?: string | null) {
  const p = (placa ?? '').trim().toUpperCase();
  const flota = useQuery({ queryKey: ['personas', 'garita-flota'], queryFn: cargarFlotaDocs, staleTime: 300_000 });
  const [docs, setDocs] = useState<DocsVehiculo | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!p || !flota.data) { setDocs(null); return; }
    docsDeVehiculos(flota.data, p).then(d => { if (vivo) setDocs(d); });
    return () => { vivo = false; };
  }, [p, flota.data]);
  return docs;
}

const tonoDoc = (estado: string) => (estado === 'VENCIDO' ? 'gar-pill--alerta' : estado.startsWith('PR') ? 'gar-pill--compras' : 'gar-pill--ok');

export function DocsItems({ docs, seguro }: { docs: DocsVehiculo | null; seguro?: boolean }) {
  const items: Array<[string, NonNullable<DocsVehiculo['soat']>]> = [];
  if (docs?.soat) items.push([seguro ? 'SOAT / Seguro' : 'SOAT', docs.soat]);
  if (docs?.rt) items.push(['Revisión Técnica', docs.rt]);
  if (!items.length) return <div className="gar-sub" style={{ fontStyle: 'italic' }}>Sin documentos registrados</div>;
  return (
    <div className="gar-docs__grid">
      {items.map(([t, d]) => (
        <div key={t} className="gar-doc">
          <div><b>{t}</b><small>Vence el {d.fechaFmt}</small></div>
          <span className={`gar-pill ${tonoDoc(d.estado)}`}>{d.estado}</span>
        </div>
      ))}
    </div>
  );
}

// ── Checklist y evidencias (salida o retorno) ──
export const TIPO_ETIQ: Record<TipoSalida, string> = { RUTA: 'Ruta / Viaje', COMPRAS: 'Compras Locales', TALLER: 'Taller Tercero' };
export function IconoTipo({ tipo, size = 18 }: { tipo: TipoSalida; size?: number }) {
  return tipo === 'COMPRAS' ? <ShoppingCart size={size} /> : tipo === 'TALLER' ? <Wrench size={size} /> : <Truck size={size} />;
}

export function ChecklistEvidenciasSheet({ open, onClose, fase, tipo, plantilla, valores, onValores, fotos, onFotos }: {
  open: boolean; onClose: () => void; fase: 'salida' | 'retorno'; tipo: TipoSalida; plantilla: CatChk[];
  valores: ValoresChk; onValores: (v: ValoresChk) => void; fotos: File[]; onFotos: (f: File[]) => void;
}) {
  const esRuta = tipo === 'RUTA';
  const faseTxt = fase === 'retorno' ? 'Retorno' : 'Salida';
  const titulo = esRuta ? `Checklist y Evidencias (${faseTxt})` : `Evidencias Fotográficas (${tipo} - ${faseTxt})`;
  return (
    <Sheet open={open} onClose={onClose} title={titulo} anclaAbajo
      footer={<Button variant="accent" block icon={<ClipboardCheck size={16} />} onClick={onClose}>Guardar Evidencias y Continuar</Button>}>
      {esRuta ? (
        <>
          <div className="gar-aviso"><Info size={18} style={{ flexShrink: 0 }} /><div>Marca cada componente del vehículo y sube las fotos de evidencia al final. Usa <b>X</b> si detectas anomalías o daños. Puedes desmarcar tocando de nuevo.</div></div>
          <ChecklistGarita plantilla={plantilla} valores={valores} onCambio={onValores} />
        </>
      ) : (
        <div className={`gar-aviso ${tipo === 'COMPRAS' ? 'gar-aviso--ambar' : 'gar-aviso--morado'}`}>
          <IconoTipo tipo={tipo} size={20} />
          <div><b>Modalidad {TIPO_ETIQ[tipo]}:</b> esta modalidad no requiere checklist técnico de componentes. Adjunta las fotos de odómetro, unidad o comprobantes aquí abajo.</div>
        </div>
      )}
      <FotosEvidencia fotos={fotos} onCambio={onFotos} />
    </Sheet>
  );
}

/** Resumen del botón "Llenar" (mismos textos del clásico) */
export function resumenInspeccion(valores: ValoresChk, plantilla: CatChk[], fotos: number) {
  const marcados = Object.keys(valores).filter(k => !k.endsWith('_cant')).length;
  const total = plantilla.reduce((a, c) => a + (c.items?.length ?? 0), 0);
  if (total > 0 && marcados >= total && fotos > 0) return { hecho: true, boton: `Listo (${fotos} fotos)`, desc: `Checklist OK & ${fotos} foto(s) adjunta(s)` };
  if (marcados > 0 || fotos > 0) {
    return { hecho: true, boton: `${marcados > 0 ? `${marcados} ítems` : ''}${marcados > 0 && fotos > 0 ? ' / ' : ''}${fotos > 0 ? `${fotos} fotos` : ''}`, desc: `${marcados} ítems marcados & ${fotos} foto(s)` };
  }
  return { hecho: false, boton: 'Llenar', desc: 'Ítems de seguridad + Fotos' };
}

// ── Detalle del checklist guardado (solo lectura) y galería de fotos ──
export function DetalleChecklistSheet({ rec, fase, onClose }: { rec: Registro | null; fase: 'salida' | 'retorno' | null; onClose: () => void }) {
  const chk = rec && fase ? (fase === 'salida' ? rec.salida_checklist_json : rec.retorno_checklist_json) : null;
  const tpl = rec && fase ? (fase === 'salida' ? rec.salida_template_json : rec.retorno_template_json) : null;
  const fotos = (rec?.fotos ?? []).filter(f => f.tipo === fase);
  return (
    <Sheet open={!!rec && !!fase} onClose={onClose} title={`Checklist Técnico — ${fase === 'salida' ? 'Ida' : 'Vuelta'}`} anclaAbajo>
      {!chk || !Object.keys(chk).length ? <div className="gar-vacio">No se registró checklist en esta fase.</div> : (
        (tpl ?? []).map(cat => (
          <div key={cat.id} className="gar-chk">
            <div className="gar-chk__cab"><h4>{cat.titulo || 'Categoría'}</h4></div>
            {(cat.items ?? []).map(it => {
              const v = chk[it.id];
              const cant = chk[`${it.id}_cant`];
              return (
                <div key={it.id} className="gar-det-fila">
                  <span>{it.label}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {cant !== undefined && cant !== '' && cant !== null && <span className="gar-chip">Cant: {cant}</span>}
                    <span className={`gar-pill ${v === 'ok' ? 'gar-pill--ok' : v === 'mal' ? 'gar-pill--alerta' : ''}`} style={v === 'ok' || v === 'mal' ? undefined : { background: 'var(--fill)', color: 'var(--label-2)' }}>
                      {v === 'ok' ? 'OK / CONFORME' : v === 'na' ? 'N/A' : v === 'mal' ? 'OBSERVADO' : '-'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        ))
      )}
      {fotos.length > 0 && (
        <div className="gar-chk">
          <div className="gar-chk__cab"><h4>Evidencias Fotográficas Adjuntas ({fotos.length})</h4></div>
          <div className="gar-galeria">{fotos.map((f, i) => <a key={f.id ?? i} href={f.url} target="_blank" rel="noopener noreferrer"><img src={f.url} alt={`Evidencia ${i + 1}`} loading="lazy" /></a>)}</div>
        </div>
      )}
    </Sheet>
  );
}

export function GaleriaSheet({ rec, fase, onClose }: { rec: Registro | null; fase: 'salida' | 'retorno' | null; onClose: () => void }) {
  const abierto = !!rec && !!fase;
  const q = useQuery<FotoReg[]>({
    queryKey: ['personas', 'garita-fotos', rec?.id],
    queryFn: () => api<FotoReg[]>(`/seguridad/unidades/${encodeURIComponent(rec!.id)}/fotos-presigned`),
    enabled: abierto, staleTime: 0,
  });
  // URLs firmadas vigentes; si no llegan, las de la lista
  const todas = q.data?.length ? q.data : (rec?.fotos ?? []);
  const fotos = todas.filter(f => f.tipo === fase);
  return (
    <Sheet open={abierto} onClose={onClose} title={`Evidencias Fotográficas — ${fase === 'salida' ? 'Ida' : 'Vuelta'}`} anclaAbajo>
      {q.isLoading ? <div className="gar-vacio">Cargando evidencias…</div> : fotos.length === 0
        ? <div className="gar-vacio">No hay evidencias fotográficas registradas en la fase de {fase}.</div>
        : <div className="gar-galeria">{fotos.map((f, i) => <a key={f.id ?? i} href={f.url} target="_blank" rel="noopener noreferrer"><img src={f.url} alt={`Evidencia ${i + 1}`} loading="lazy" /></a>)}</div>}
    </Sheet>
  );
}

// ── Acta PDF y WhatsApp (el acta no se toca: sale de garitaActa.ts) ──
export function useActaGarita() {
  const toast = useToast();
  const plantillaGlobal = useTemplateGarita();
  const [generando, setGenerando] = useState<string | null>(null);

  async function armar(r: Registro, fase: FaseActa) {
    const rec = r as unknown as RegistroActa;
    const flota = await cargarFlotaDocs();
    const [docT, docC, fotos] = await Promise.all([
      docsDeVehiculos(flota, rec.placa_tracto),
      docsDeVehiculos(flota, rec.retorno_placa_carreta || rec.placa_carreta),
      fotosParaActa(rec.id, rec.fotos),
    ]);
    return { rec, html: htmlActaGarita(rec, fase, { docT, docC, fotos, plantillaGlobal: plantillaGlobal.data }) };
  }

  /** imprimirYa=false: vista previa. imprimirYa=true: abre el diálogo de impresión/guardado */
  async function verPdf(r: Registro, fase: FaseActa, imprimirYa: boolean, clave = `pdf-${r.id}`) {
    setGenerando(clave);
    try {
      const { rec, html } = await armar(r, fase);
      const placas = rec.placa_tracto + (rec.placa_carreta ? ` / ${rec.placa_carreta}` : '');
      const titulo = fase === 'completo' ? `Expediente Completo ${rec.placa_tracto}` : `Checklist ${rec.placa_tracto} (${fase.toUpperCase()})`;
      if (!abrirActaParaImprimir(html, titulo, placas, rec.id, imprimirYa)) toast('El navegador bloqueó la ventana. Permite las ventanas emergentes.', 'error');
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGenerando(null); }
  }

  async function whatsapp(r: Registro, fase: FaseActa, clave = `wa-${r.id}`) {
    setGenerando(clave);
    try {
      const { rec, html } = await armar(r, fase);
      const nombre = nombreArchivoActa(rec, fase);
      const blob = await pdfBlobDeActa(html, nombre);
      const res = await compartirPDF(blob, nombre, `Checklist de inspección ${rec.placa_tracto} (${fase}) · ${rec.id}`);
      if (res === 'descargado') toast('PDF descargado. Adjúntalo en WhatsApp.');
      if (res !== 'cancelado') haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGenerando(null); }
  }

  return { generando, verPdf, whatsapp };
}

