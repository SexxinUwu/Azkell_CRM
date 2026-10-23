import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Download, Eye, FileDown, Images, ListChecks, LogIn, MessageCircle, PenLine, ShieldCheck, ShieldAlert, Trash2, Truck } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import type { FirmaHandle } from '../inspecciones/Firma';
import { FirmaPar, FotosEvidencia, hayObservado, subirFotosGarita, useTemplateGarita, type ValoresChk } from './garitaComponentes';
import { cabeceraEmpresa, existePlaca, hayAlerta, marcaTiempo, n, tipoDe, type Recursos, type Registro } from './garitaBase';
import { ChecklistEvidenciasSheet, DetalleChecklistSheet, DocsItems, GaleriaSheet, IconoTipo, resumenInspeccion, useActaGarita, useDocsPlaca } from './garitaPiezas';

const fmt = (s?: string | null) => (s ? String(s).replace(/^(\d{4}-\d{2}-\d{2})T.*$/, '$1') : '--');

function Firmas({ titulo, ico, a, b, etqA, etqB }: { titulo: string; ico: React.ReactNode; a?: string | null; b?: string | null; etqA: string; etqB: string }) {
  if (!a && !b) return null;
  return (
    <div className="gar-sep" style={{ marginTop: 0, marginBottom: 'var(--s-3)' }}>
      <div className="gar-firmas-tit"><span>{ico} {titulo}</span></div>
      <div className="gar-firmas-vistas">
        {a && <div><img src={a} alt={etqA} /><span>{etqA}</span></div>}
        {b && <div><img src={b} alt={etqB} /><span>{etqB}</span></div>}
      </div>
    </div>
  );
}

/** Detalle del expediente: cierre del retorno si sigue en ruta, o consulta si ya se completó */
export function GaritaRetorno({ rec, empresa, recursos, puedeCrear, puedeEliminar, onVolver, onHecho, onEliminar }: {
  rec: Registro; empresa: string; recursos?: Recursos; puedeCrear: boolean; puedeEliminar: boolean;
  onVolver: () => void; onHecho: () => void; onEliminar: (r: Registro) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const plantilla = useTemplateGarita();
  const acta = useActaGarita();
  const enRuta = rec.estado === 'en_ruta';
  const tipo = tipoDe(rec);
  const esRuta = tipo === 'RUTA';

  const [km, setKm] = useState('');
  const [conductor, setConductor] = useState(rec.conductor || '');
  const [carreta, setCarreta] = useState(rec.placa_carreta || '');
  const [obs, setObs] = useState('');
  const [chk, setChk] = useState<ValoresChk>({});
  const [fotos, setFotos] = useState<File[]>([]);
  const [chkAbierto, setChkAbierto] = useState(false);
  const [verChk, setVerChk] = useState<'salida' | 'retorno' | null>(null);
  const [verFotos, setVerFotos] = useState<'salida' | 'retorno' | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [malo, setMalo] = useState<string | null>(null);
  const firmaC = useRef<FirmaHandle>(null);
  const firmaV = useRef<FirmaHandle>(null);

  const docsT = useDocsPlaca(rec.placa_tracto);
  const docsC = useDocsPlaca(rec.retorno_placa_carreta || rec.placa_carreta);
  const fotosDe = (f: 'salida' | 'retorno') => (rec.fotos ?? []).filter(x => x.tipo === f).length;
  const tieneChk = (v?: ValoresChk | null) => !!v && Object.keys(v).length > 0;
  const insp = resumenInspeccion(chk, plantilla.data ?? [], fotos.length);
  const kmListo = !!km.trim() && !isNaN(Number(km)) && Number(km) > 0;

  const pillEstado = useMemo(() => {
    if (!enRuta) return <span className="gar-pill gar-pill--ok"><CheckCircle2 size={13} /> COMPLETADO</span>;
    if (tipo === 'COMPRAS') return <span className="gar-pill gar-pill--compras"><IconoTipo tipo="COMPRAS" size={13} /> EN COMPRAS</span>;
    if (tipo === 'TALLER') return <span className="gar-pill gar-pill--taller"><IconoTipo tipo="TALLER" size={13} /> EN TALLER TERCERO</span>;
    return <span className="gar-pill gar-pill--ruta"><Truck size={13} /> EN RUTA</span>;
  }, [enRuta, tipo]);

  async function guardar() {
    const c = carreta.trim().toUpperCase();
    if (c && !existePlaca(c, recursos)) { setMalo('carreta'); toast(`La Placa de Carreta "${c}" no existe en el maestro de flota.`, 'error'); return; }
    if (!kmListo) { setMalo('km'); toast('El Kilometraje de Llegada es OBLIGATORIO', 'error'); return; }
    setMalo(null);
    const ts = marcaTiempo();
    setEnviando(true);
    try {
      await api(`/seguridad/unidades/${encodeURIComponent(rec.id)}`, {
        method: 'PUT', headers: cabeceraEmpresa(empresa),
        body: {
          retorno_fecha: ts.fecha, retorno_hora: ts.hora, retorno_km: km.trim(),
          retorno_conductor: conductor.trim() || null, retorno_placa_carreta: c || null,
          retorno_template_json: plantilla.data ?? [], retorno_checklist_json: esRuta ? chk : {}, retorno_has_alert: esRuta ? hayObservado(chk) : false,
          retorno_observaciones: obs.trim(),
          firma_retorno_conductor: esRuta ? firmaC.current?.obtener() || null : null,
          firma_retorno_vigilancia: esRuta ? firmaV.current?.obtener() || null : null,
          retorno_creado_por: user?.name, estado: 'completado',
        },
      });
      haptic('success'); toast('Retorno registrado con éxito');
      const pendientes = fotos;
      onHecho();
      if (pendientes.length) {
        toast(`Subiendo ${pendientes.length} evidencia(s)…`);
        subirFotosGarita(rec.id, 'retorno', pendientes)
          .then(() => { toast(`${pendientes.length} evidencia(s) subidas`); qc.invalidateQueries({ queryKey: ['personas'] }); })
          .catch(err => toast(errorMessage(err), 'error'));
      }
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); setEnviando(false); }
  }

  const tituloSalida = tipo === 'COMPRAS' ? 'Salida de Compras Locales (Ida)' : tipo === 'TALLER' ? 'Salida a Taller Tercero (Ida)' : 'Inspección de Salida (Ida)';
  const tituloRetorno = tipo === 'COMPRAS' ? 'Registrar Retorno de Compras' : tipo === 'TALLER' ? 'Registrar Retorno de Taller Tercero' : 'Registrar Llegada / Retorno';
  const tituloRetornoHecho = tipo === 'COMPRAS' ? 'Retorno de Compras (Vuelta)' : tipo === 'TALLER' ? 'Retorno de Taller Tercero (Vuelta)' : 'Inspección de Retorno (Vuelta)';
  const kmRecorrido = rec.retorno_km && rec.salida_km ? n(rec.retorno_km) - n(rec.salida_km) : null;
  const busy = (c: string) => acta.generando === c;

  const botonesActa = (fase: 'salida' | 'retorno') => (
    <>
      <Button variant="secondary" icon={<Eye size={16} />} loading={busy(`ver-${fase}`)} disabled={!!acta.generando} onClick={() => acta.verPdf(rec, fase, false, `ver-${fase}`)}>Ver PDF</Button>
      <Button variant="secondary" icon={<Download size={16} />} loading={busy(`des-${fase}`)} disabled={!!acta.generando} onClick={() => acta.verPdf(rec, fase, true, `des-${fase}`)} title="Descargar directo">Descargar</Button>
      <Button variant="secondary" icon={<MessageCircle size={16} />} style={{ background: 'var(--gar-wa)', color: '#fff' }} loading={busy(`wa-${fase}`)} disabled={!!acta.generando} onClick={() => acta.whatsapp(rec, fase, `wa-${fase}`)} title="Compartir PDF por WhatsApp">WhatsApp</Button>
    </>
  );

  return (
    <div className="gar">
      <div className="gar-cab">
        <div className="gar-cab__izq">
          <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={onVolver}>Volver a la Lista</Button>
          <div>
            <h2>{rec.placa_tracto}{rec.placa_carreta ? ` / ${rec.placa_carreta}` : ''}</h2>
            <p>{rec.conductor || 'Sin conductor'} • Destino: {rec.destino || '---'}</p>
          </div>
        </div>
        {pillEstado}
      </div>

      {hayAlerta(rec) && (
        <div className="gar-alerta-ruta" style={{ marginBottom: 0 }} role="alert">
          <AlertTriangle size={22} style={{ flexShrink: 0 }} />
          <div><strong>Novedad en Expediente:</strong> este viaje registró observaciones o anomalías en la inspección física.</div>
        </div>
      )}

      <div className="gar-card">
        <h3 className="gar-card__titulo"><ShieldCheck size={18} className="c-azul" /> ESTADO DOCUMENTAL INFORMATIVO (SOAT &amp; REVISIÓN TÉCNICA)</h3>
        <div className="gar-fila2">
          <div>
            <div className="gar-docs__tit"><Truck size={14} className="c-azul" /> TRACTO ({rec.placa_tracto})</div>
            <DocsItems docs={docsT} />
          </div>
          {(rec.retorno_placa_carreta || rec.placa_carreta) && (
            <div>
              <div className="gar-docs__tit"><Truck size={14} className="c-ambar" /> CARRETA / REMOLQUE ({rec.retorno_placa_carreta || rec.placa_carreta})</div>
              <DocsItems docs={docsC} seguro />
            </div>
          )}
        </div>
      </div>

      <div className="gar-ret">
        <div className="gar-card">
          <div className="gar-card__cab">
            <h3 className="gar-card__titulo"><IconoTipo tipo={tipo} size={18} /> {tituloSalida}</h3>
            <span className="gar-chip">{fmt(rec.salida_fecha)} {rec.salida_hora ?? ''}</span>
          </div>
          <div className="gar-fila2">
            <div className="gar-dato"><span className="gar-etq">Kilometraje Salida</span><b>{rec.salida_km ? `${rec.salida_km} km` : '---'}</b></div>
            <div className="gar-dato"><span className="gar-etq">Destino Reportado</span><b>{rec.destino || '---'}</b></div>
          </div>
          <div className="gar-nota"><ShieldCheck size={14} className="c-azul" /> Despacho registrado por: <strong>{rec.creado_por || 'Oficial de Seguridad'}</strong></div>
          <Firmas titulo="Firmas Digitales de Salida" ico={<PenLine size={14} />} a={rec.firma_salida_conductor} b={rec.firma_salida_vigilancia} etqA="Conductor" etqB="Vigilancia" />
          <div className="gar-botones">
            {tieneChk(rec.salida_checklist_json) && <Button variant="secondary" icon={<ListChecks size={16} />} onClick={() => setVerChk('salida')}>Ver Checklist</Button>}
            {fotosDe('salida') > 0 && <Button variant="secondary" icon={<Images size={16} />} onClick={() => setVerFotos('salida')}>Fotos ({fotosDe('salida')})</Button>}
            {botonesActa('salida')}
          </div>
        </div>

        {enRuta ? (
          <div className="gar-card gar-ret__activo">
            <div className="gar-card__cab">
              <h3 className="gar-card__titulo c-azul"><LogIn size={18} /> {tituloRetorno}</h3>
              <span className="gar-badge gar-badge--azul">EN CURSO</span>
            </div>
            <div className="gar-campo">
              <label className="gar-etq" htmlFor="gar-ret-km">Kilometraje de Llegada (Retorno) <b>*</b></label>
              <input id="gar-ret-km" className={`gar-input${malo === 'km' ? ' gar-input--mal' : ''}`} type="number" inputMode="numeric" value={km} placeholder="Ingrese odómetro actual"
                onChange={e => { setKm(e.target.value); setMalo(null); }} />
            </div>
            <div className="gar-fila2 gar-campo">
              <div>
                <label className="gar-etq" htmlFor="gar-ret-cond">Conductor de Retorno</label>
                <input id="gar-ret-cond" className="gar-input" value={conductor} placeholder="Nombre del conductor" onChange={e => setConductor(e.target.value)} />
              </div>
              <div>
                <label className="gar-etq" htmlFor="gar-ret-car">Semirremolque / Carreta</label>
                <input id="gar-ret-car" className={`gar-input${malo === 'carreta' ? ' gar-input--mal' : ''}`} style={{ textTransform: 'uppercase' }} value={carreta} placeholder="Placa carreta (opcional)"
                  onChange={e => { setCarreta(e.target.value.toUpperCase()); setMalo(null); }} />
              </div>
            </div>
            {esRuta ? (
              <div className="gar-campo">
                <span className="gar-etq"><ListChecks size={13} /> Verificación e Inspección</span>
                <div className="gar-tarea" style={{ marginBottom: 0 }}>
                  <div className="gar-tarea__izq">
                    <span className="gar-tarea__icono"><ClipboardCheck size={22} /></span>
                    <div><b>Checklist y Evidencias</b><small>{insp.desc}</small></div>
                  </div>
                  <Button variant={insp.hecho ? 'accent' : 'secondary'} onClick={() => setChkAbierto(true)}>{insp.boton}</Button>
                </div>
              </div>
            ) : (
              <div className="gar-campo gar-sep" style={{ marginTop: 0 }}>
                <FotosEvidencia fotos={fotos} onCambio={setFotos} />
              </div>
            )}
            <div className="gar-campo">
              <label className="gar-etq" htmlFor="gar-ret-obs">Observaciones de Llegada (Opcional)</label>
              <textarea id="gar-ret-obs" className="gar-input" rows={2} value={obs} placeholder="Detalles de retorno o novedades (si no escribe nada saldrá 'SIN OBSERVACIONES')..." onChange={e => setObs(e.target.value)} />
            </div>
            {esRuta && (
              <div className="gar-sep" style={{ marginTop: 0, marginBottom: 'var(--s-3)' }}>
                <div className="gar-firmas-tit">
                  <span><PenLine size={14} /> Firmas de Llegada (Retorno)</span>
                  <span className="gar-chip">Conductor &amp; Vigilancia</span>
                </div>
                <FirmaPar etiquetaConductor="Conductor (Retorno)" etiquetaVigilancia="Vigilancia (Retorno)" refConductor={firmaC} refVigilancia={firmaV} />
              </div>
            )}
            {puedeCrear
              ? <Button variant="accent" size="lg" block icon={<CheckCircle2 size={18} />} loading={enviando} disabled={!kmListo} onClick={guardar}>Confirmar Retorno y Cerrar Expediente</Button>
              : <div className="gar-nota"><ShieldAlert size={14} /> No tienes permiso para registrar retornos.</div>}
          </div>
        ) : (
          <div className="gar-card">
            <div className="gar-card__cab">
              <h3 className="gar-card__titulo c-verde"><LogIn size={18} /> {tituloRetornoHecho}</h3>
              <span className="gar-chip">{fmt(rec.retorno_fecha)} {rec.retorno_hora ?? ''}</span>
            </div>
            <div className="gar-fila2">
              <div className="gar-dato"><span className="gar-etq">Kilometraje Llegada</span><b>{rec.retorno_km ? `${rec.retorno_km} km` : '---'}</b></div>
              <div className="gar-dato"><span className="gar-etq">Km Total Recorrido</span><b className="c-azul">{kmRecorrido !== null ? `${kmRecorrido} km` : '---'}</b></div>
            </div>
            {(rec.retorno_conductor || rec.retorno_placa_carreta) && (
              <div className="gar-fila2">
                <div className="gar-dato"><span className="gar-etq">Conductor Retorno</span>
                  <b>{rec.retorno_conductor || rec.conductor || '---'}</b>
                  {rec.retorno_conductor && rec.retorno_conductor !== rec.conductor && <small className="gar-sub" style={{ fontStyle: 'italic' }}>(Salió con: {rec.conductor})</small>}</div>
                <div className="gar-dato"><span className="gar-etq">Carreta Retorno</span>
                  <b>{rec.retorno_placa_carreta || rec.placa_carreta || '---'}</b>
                  {rec.retorno_placa_carreta && rec.retorno_placa_carreta !== rec.placa_carreta && <small className="gar-sub" style={{ fontStyle: 'italic' }}>(Salió con: {rec.placa_carreta || 'Sin carreta'})</small>}</div>
              </div>
            )}
            {((rec.salida_observaciones || '').trim() || (rec.retorno_observaciones || '').trim()) && (
              <div className="gar-nota">
                {(rec.salida_observaciones || '').trim() && <div><strong>Obs. Salida:</strong> {rec.salida_observaciones}</div>}
                {(rec.retorno_observaciones || '').trim() && <div><strong>Obs. Retorno:</strong> {rec.retorno_observaciones}</div>}
              </div>
            )}
            <div className="gar-nota"><ShieldCheck size={14} className="c-verde" /> Recepción registrada por: <strong>{rec.retorno_creado_por || rec.creado_por || 'Oficial de Seguridad'}</strong></div>
            <Firmas titulo="Firmas Digitales de Retorno" ico={<PenLine size={14} />} a={rec.firma_retorno_conductor} b={rec.firma_retorno_vigilancia} etqA="Conductor (Retorno)" etqB="Vigilancia (Retorno)" />
            <div className="gar-botones">
              {tieneChk(rec.retorno_checklist_json) && <Button variant="secondary" icon={<ListChecks size={16} />} onClick={() => setVerChk('retorno')}>Ver Checklist</Button>}
              {fotosDe('retorno') > 0 && <Button variant="secondary" icon={<Images size={16} />} onClick={() => setVerFotos('retorno')}>Fotos ({fotosDe('retorno')})</Button>}
              {botonesActa('retorno')}
            </div>
            <div className="gar-sep gar-botones">
              <Button variant="accent" icon={<Eye size={16} />} loading={busy('ver-completo')} disabled={!!acta.generando} onClick={() => acta.verPdf(rec, 'completo', false, 'ver-completo')}>Previsualizar Expediente</Button>
              <Button variant="secondary" icon={<FileDown size={16} />} loading={busy('des-completo')} disabled={!!acta.generando} onClick={() => acta.verPdf(rec, 'completo', true, 'des-completo')}>Descargar Expediente</Button>
              <Button variant="secondary" icon={<MessageCircle size={16} />} style={{ background: 'var(--gar-wa)', color: '#fff' }} loading={busy('wa-completo')} disabled={!!acta.generando} onClick={() => acta.whatsapp(rec, 'completo', 'wa-completo')}>WhatsApp</Button>
              {puedeEliminar && <Button variant="danger" iconOnly icon={<Trash2 size={16} />} aria-label="Eliminar expediente" title="Eliminar Expediente" onClick={() => onEliminar(rec)} />}
            </div>
          </div>
        )}
      </div>

      {enRuta && <ChecklistEvidenciasSheet open={chkAbierto} onClose={() => setChkAbierto(false)} fase="retorno" tipo={tipo}
        plantilla={plantilla.data ?? []} valores={chk} onValores={setChk} fotos={fotos} onFotos={setFotos} />}
      <DetalleChecklistSheet rec={rec} fase={verChk} onClose={() => setVerChk(null)} />
      <GaleriaSheet rec={rec} fase={verFotos} onClose={() => setVerFotos(null)} />
    </div>
  );
}
