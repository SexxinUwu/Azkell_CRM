import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowLeftRight, Check, ChevronDown, CircleAlert, ClipboardCheck, Info, MapPin, Network, PenLine, Repeat, ShieldCheck, Truck, X } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import type { FirmaHandle } from '../inspecciones/Firma';
import { FirmaPar, FotosEvidencia, hayObservado, subirFotosGarita, useTemplateGarita, type ValoresChk } from './garitaComponentes';
import { cabeceraEmpresa, existePlaca, limpiarPlaca, marcaTiempo, type Recursos, type Registro, type TipoSalida } from './garitaBase';
import { ChecklistEvidenciasSheet, DocsItems, IconoTipo, resumenInspeccion, useDocsPlaca } from './garitaPiezas';

// ── ¿A qué destino sale la unidad hoy? ──
export function GaritaDestino({ onVolver, onElegir }: { onVolver: () => void; onElegir: (t: TipoSalida) => void }) {
  const tarjeta = (t: TipoSalida, badge: string, badgeCls: string, icono: React.ReactNode, tint: string, color: string, titulo: string, desc: string,
    a: [string, string, string], b: [string, string, string], btn: string, btnCls: string) => (
    <button type="button" className="gar-op" onClick={() => { haptic('selection'); onElegir(t); }}>
      <div>
        <div className="gar-op__fila">
          <span className="gar-op__icono" style={{ background: tint, color }}>{icono}</span>
          <span className={`gar-badge ${badgeCls}`}>{badge}</span>
        </div>
        <h3>{titulo}</h3>
        <p>{desc}</p>
      </div>
      <div className="gar-mini">
        <div><b className={a[2]} style={{ fontSize: '0.95rem' }}>{a[0]}</b><span>{a[1]}</span></div>
        <div><b className="c-gris" style={{ fontSize: '0.95rem' }}>{b[0]}</b><span>{b[1]}</span></div>
      </div>
      <span className={`gar-op__btn ${btnCls}`}>{btn}</span>
    </button>
  );
  return (
    <div className="gar">
      <div className="gar-hero">
        <div className="gar-hero__izq">
          <div className="gar-avatar" aria-hidden><MapPin size={26} /></div>
          <div>
            <span className="gar-modulo">MÓDULO SEGURIDAD</span>
            <h2>¿A qué destino sale la unidad hoy?</h2>
            <p>Selecciona la modalidad de salida para habilitar el registro correspondiente de la flota</p>
          </div>
        </div>
        <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={onVolver}>Volver a la Lista</Button>
      </div>
      <div className="gar-tipos">
        {tarjeta('RUTA', 'OPERACIÓN', 'gar-badge--azul', <MapPin size={22} />, 'var(--blue-tint)', 'var(--blue-ink)', 'RUTA / VIAJE',
          'Salida regular de transporte con vinculación de viaje, checklist 2 en 1, fotos de evidencia y firmas digitales.',
          ['Checklist', '2 en 1 + Fotos', 'c-azul'], ['Firmas', 'Digitales', 'c-verde'], 'Seleccionar Ruta →', '')}
        {tarjeta('COMPRAS', 'LOCAL', 'gar-badge--amarillo', <IconoTipo tipo="COMPRAS" size={22} />, 'var(--amber-tint)', 'var(--amber-ink)', 'COMPRAS LOCALES',
          'Salida express para compras locales de repuestos o suministros de la empresa. Registro ágil directo.',
          ['Express', '5 Campos', 'c-ambar'], ['Odómetro', 'Sin Checklist', 'c-gris'], 'Seleccionar Compras →', 'gar-op__btn--amarillo')}
        {tarjeta('TALLER', 'EXTERNO', 'gar-badge--morado', <IconoTipo tipo="TALLER" size={22} />, 'var(--gar-purple-tint)', 'var(--gar-purple)', 'TALLER TERCERO',
          'Salida a mantenimiento externo, tornería, concesionario o proveedor técnico con cierre directo.',
          ['Taller', 'Mantenimiento', 'c-morado'], ['Odómetro', 'Sin Checklist', 'c-gris'], 'Seleccionar Taller →', 'gar-op__btn--morado')}
      </div>
    </div>
  );
}

interface Viaje { viaje?: string; numero_orden?: string; placa_tracto?: string; placa_remolque?: string; placa_carreta?: string; conductor?: string; ruta?: string; destino?: string; fecha_viaje?: string }
const numViaje = (v: Viaje) => v.viaje || v.numero_orden || '';

const BANNER: Record<TipoSalida, { titulo: string; desc: string; badge: string; cls: string; formTitulo: string; cardTitulo: string }> = {
  RUTA: { titulo: 'Salida a Ruta de Operación', desc: 'Formulario con checklist técnico, fotos de evidencia y firmas digitales.', badge: 'RUTA', cls: '', formTitulo: 'Registrar Salida de Unidad', cardTitulo: 'Asignación de Unidad y Ruta' },
  COMPRAS: { titulo: 'Salida Express de Compras Locales', desc: 'Complete los datos de la unidad, odómetro y fotos/evidencias si corresponde.', badge: 'COMPRAS', cls: 'gar-banner--compras', formTitulo: 'Registrar Salida de Compras', cardTitulo: 'Asignación de Unidad y Destino de Compras' },
  TALLER: { titulo: 'Salida a Taller Tercero / Externo', desc: 'Registro de traslado a taller o mantenimiento externo.', badge: 'TALLER TERCERO', cls: 'gar-banner--taller', formTitulo: 'Registrar Salida a Taller Tercero', cardTitulo: 'Asignación de Unidad y Taller Tercero' },
};
const DESTINO_FIJO: Partial<Record<TipoSalida, string>> = { COMPRAS: 'COMPRAS LOCALES', TALLER: 'TALLER TERCERO / MANTENIMIENTO' };
const PH_DESTINO: Record<TipoSalida, string> = { RUTA: 'Ej. LIMA - CUSCO', COMPRAS: 'Ej. COMPRAS LOCALES / TIENDA / FERRETERÍA', TALLER: 'Ej. TALLER TERCERO / CONCESIONARIO / MAESTRANZA' };
const PH_OBS: Record<TipoSalida, string> = {
  RUTA: "Detalles de salida, novedades de unidad o conductor (si no escribe nada saldrá 'SIN OBSERVACIONES')...",
  COMPRAS: 'Detalles opcionales de las compras o repuestos a adquirir...',
  TALLER: 'Detalles opcionales del trabajo o servicio a realizar en el taller...',
};

/** Registrar Salida de Unidad (ruta con checklist y firmas; compras y taller, express sin checklist) */
export function GaritaSalida({ tipo, empresa, registros, recursos, onVolver, onCambiarDestino, onGuardado }: {
  tipo: TipoSalida; empresa: string; registros: Registro[]; recursos?: Recursos;
  onVolver: () => void; onCambiarDestino: () => void; onGuardado: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const plantilla = useTemplateGarita();
  const esRuta = tipo === 'RUTA';
  const ban = BANNER[tipo];

  const [placa, setPlaca] = useState('');
  const [carreta, setCarreta] = useState('');
  const [conductor, setConductor] = useState('');
  const [destino, setDestino] = useState(DESTINO_FIJO[tipo] ?? '');
  const [km, setKm] = useState('');
  const [kmHint, setKmHint] = useState('');
  const [obs, setObs] = useState('');
  const [chk, setChk] = useState<ValoresChk>({});
  const [fotos, setFotos] = useState<File[]>([]);
  const [chkAbierto, setChkAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [malo, setMalo] = useState<string | null>(null);
  const firmaC = useRef<FirmaHandle>(null);
  const firmaV = useRef<FirmaHandle>(null);

  // Viaje asociado (opcional, solo en ruta)
  const [viajeAbierto, setViajeAbierto] = useState(false);
  const [viajeTxt, setViajeTxt] = useState('');
  const [viajeDd, setViajeDd] = useState(false);
  const [viaje, setViaje] = useState<Viaje | null>(null);
  const viajes = useQuery<Viaje[]>({
    queryKey: ['personas', 'garita-viajes'],
    queryFn: () => api<unknown>('/operaciones/ordenes-viaje', { query: { limit: 300 } }).then(r => {
      const j = r as { data?: Viaje[] } | Viaje[];
      return Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
    }),
    enabled: esRuta && viajeAbierto, staleTime: 120_000,
  });
  const viajesFiltrados = useMemo(() => {
    const q = viajeTxt.trim().toUpperCase();
    const todos = viajes.data ?? [];
    return (q ? todos.filter(v => [numViaje(v), v.placa_tracto, v.placa_remolque || v.placa_carreta, v.conductor, v.ruta || v.destino].some(x => String(x ?? '').toUpperCase().includes(q))) : todos).slice(0, 50);
  }, [viajes.data, viajeTxt]);

  // Sugerencias: tractos de la empresa activa; carretas de todas las empresas
  const tractos = useMemo(() => {
    if (!recursos) return [];
    if (empresa !== 'TODAS') {
      const k = Object.keys(recursos.tractosPorEmpresa ?? {}).find(x => limpiarPlaca(x).includes(limpiarPlaca(empresa)) || limpiarPlaca(empresa).includes(limpiarPlaca(x)));
      const lista = k ? recursos.tractosPorEmpresa[k] : [];
      if (lista?.length) return lista;
      const k2 = Object.keys(recursos.placasPorEmpresa ?? {}).find(x => limpiarPlaca(x).includes(limpiarPlaca(empresa)) || limpiarPlaca(empresa).includes(limpiarPlaca(x)));
      if (k2 && recursos.placasPorEmpresa[k2]?.length) return recursos.placasPorEmpresa[k2];
    }
    return recursos.placas ?? [];
  }, [recursos, empresa]);
  const carretas = recursos?.carretasGlobales?.length ? recursos.carretasGlobales : (recursos?.placas ?? []);

  const placaOk = placa.trim().length >= 4 ? existePlaca(placa, recursos) : null;
  const carretaOk = carreta.trim().length >= 4 ? existePlaca(carreta, recursos) : null;
  const docsT = useDocsPlaca(placa.trim().length >= 3 ? placa : null);
  const docsC = useDocsPlaca(carreta.trim().length >= 3 ? carreta : null);

  // Unidad con un viaje pendiente de retorno: no se autoriza otra salida
  const enRuta = useMemo(() => {
    const p = limpiarPlaca(placa);
    return p ? registros.find(r => r.estado === 'en_ruta' && limpiarPlaca(r.placa_tracto) === p) ?? null : null;
  }, [registros, placa]);

  // Último kilometraje de la unidad: primero lo cargado, luego el dato exacto del servidor
  useEffect(() => {
    const p = placa.trim();
    if (!p) { setKmHint(''); return; }
    if (!recursos || !existePlaca(p, recursos)) return;
    let vivo = true;
    const limpia = limpiarPlaca(p);
    const rec = registros.find(r => limpiarPlaca(r.placa_tracto) === limpia && (r.retorno_km || r.salida_km));
    const local = rec ? (Number(rec.retorno_km) > 0 ? rec.retorno_km : rec.salida_km) : null;
    if (local) { setKm(String(local)); setKmHint(`Último km: ${local} km`); }
    const t = setTimeout(() => {
      api<{ ok?: boolean; ultimoKm?: number | null }>(`/seguridad/unidades/ultimo-km/${encodeURIComponent(p.toUpperCase())}`, { headers: cabeceraEmpresa(empresa) })
        .then(r => { if (vivo && r.ok && r.ultimoKm) { setKm(String(r.ultimoKm)); setKmHint(`Último km: ${r.ultimoKm} km`); } })
        .catch(() => { /* sin dato previo */ });
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
    // solo cuando cambia la placa (o llegan los recursos): no pisar el km que la persona edita
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placa, recursos]);

  function elegirViaje(v: Viaje) {
    setViaje(v); setViajeTxt(numViaje(v)); setViajeDd(false);
    if (v.placa_tracto) setPlaca(v.placa_tracto.toUpperCase());
    const c = v.placa_remolque || v.placa_carreta;
    if (c) setCarreta(c.toUpperCase());
    if (v.conductor) setConductor(v.conductor.toUpperCase());
    if (v.ruta || v.destino) setDestino(String(v.ruta || v.destino).toUpperCase());
    toast(`Datos autocompletados desde Viaje ${numViaje(v)}`);
  }
  function quitarViaje() {
    setViaje(null); setViajeTxt(''); setViajeDd(false);
    setPlaca(''); setCarreta(''); setConductor(''); setDestino(DESTINO_FIJO[tipo] ?? ''); setKmHint('');
  }

  const insp = resumenInspeccion(chk, plantilla.data ?? [], fotos.length);

  async function guardar() {
    const p = placa.trim().toUpperCase(), c = carreta.trim().toUpperCase(), cond = conductor.trim();
    let dest = destino.trim();
    const falla = (campo: string, msg: string) => { setMalo(campo); toast(msg, 'error'); haptic('warning'); };
    if (!p) return falla('placa', 'Por favor, ingresa la Placa del Tracto');
    if (!existePlaca(p, recursos)) return falla('placa', `La Placa de Tracto "${p}" no existe en el maestro de flota. Debe ser una placa registrada en el sistema.`);
    if (c && !existePlaca(c, recursos)) return falla('carreta', `La Placa de Carreta "${c}" no existe en el maestro de flota. Verifique que esté bien escrita o regístrela previamente.`);
    if (!cond) return falla('conductor', 'Por favor, ingresa el Conductor Asignado');
    if (!dest) {
      if (DESTINO_FIJO[tipo]) dest = DESTINO_FIJO[tipo]!;
      else return falla('destino', 'Por favor, ingresa el Destino / Ruta');
    }
    if (!km.trim() || isNaN(Number(km)) || Number(km) <= 0) return falla('km', 'El Kilometraje de Salida es OBLIGATORIO');
    setMalo(null);

    const ts = marcaTiempo();
    setEnviando(true);
    try {
      const r = await api<{ ok?: boolean; id?: string; error?: string }>('/seguridad/unidades', {
        method: 'POST', headers: cabeceraEmpresa(empresa),
        body: {
          placa_tracto: p, placa_carreta: c, conductor: cond, destino: dest, tipo_salida: tipo,
          orden_viaje: (viaje ? numViaje(viaje) : '') || null,
          salida_fecha: ts.fecha, salida_hora: ts.hora, salida_km: km.trim(),
          salida_template_json: plantilla.data ?? [], salida_checklist_json: esRuta ? chk : {}, salida_has_alert: esRuta ? hayObservado(chk) : false,
          salida_observaciones: obs.trim(),
          firma_salida_conductor: esRuta ? firmaC.current?.obtener() || null : null,
          firma_salida_vigilancia: esRuta ? firmaV.current?.obtener() || null : null,
          creado_por: user?.name,
        },
      });
      if (r.ok === false) throw new Error(r.error || 'No se pudo registrar');
      haptic('success'); toast('Salida registrada con éxito');
      const pendientes = fotos;
      onGuardado();
      // Las fotos suben en segundo plano: la persona ya puede seguir trabajando
      if (r.id && pendientes.length) {
        toast(`Subiendo ${pendientes.length} evidencia(s)…`);
        subirFotosGarita(r.id, 'salida', pendientes)
          .then(() => { toast(`${pendientes.length} evidencia(s) subidas`); qc.invalidateQueries({ queryKey: ['personas'] }); })
          .catch(err => toast(errorMessage(err), 'error'));
      }
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); setEnviando(false); }
  }

  const clase = (campo: string, ok?: boolean | null) => `gar-input${malo === campo || ok === false ? ' gar-input--mal' : ok ? ' gar-input--ok' : ''}`;
  const botonGuardar = (
    <Button variant="accent" size="lg" block className="gar-guardar" icon={<Check size={18} />} loading={enviando} disabled={!!enRuta} onClick={guardar}
      title={enRuta ? 'Unidad actualmente en ruta pendiente de retorno' : undefined}>Registrar Salida Definitiva</Button>
  );
  const docsBloque = (titulo: string, ico: React.ReactNode, pl: string, docs: ReturnType<typeof useDocsPlaca>, ok: boolean | null, seguro?: boolean) => (
    pl.trim().length >= 3 && (
      <div className="gar-docs">
        <div className="gar-docs__tit">{ico} {titulo} (<span className="c-azul">{pl.trim().toUpperCase()}</span>)</div>
        {ok === false && pl.trim().length >= 5
          ? <div className="c-rojo" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>La placa "{pl.trim().toUpperCase()}" no existe en el maestro de flota. Debe ser una placa registrada.</div>
          : <DocsItems docs={docs} seguro={seguro} />}
      </div>
    )
  );

  const tarjetaIzq = (
    <div className="gar-card">
      <h3 className="gar-card__titulo"><IconoTipo tipo={tipo} size={18} /> {ban.cardTitulo}</h3>
      {enRuta && (
        <div className="gar-alerta-ruta" role="alert">
          <CircleAlert size={22} style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ display: 'block', marginBottom: 4 }}>UNIDAD ACTUALMENTE EN RUTA</strong>
            La unidad <strong>{enRuta.placa_tracto}</strong> tiene una salida activa en ruta registrada el <strong>{enRuta.salida_fecha || ''} {enRuta.salida_hora || ''}</strong> con conductor <strong>{enRuta.conductor || '---'}</strong> hacia <strong>{enRuta.destino || '---'}</strong>.<br />
            <strong>Debe registrar el retorno antes de autorizar una nueva salida.</strong>
          </div>
        </div>
      )}
      <datalist id="gar-tractos">{tractos.slice(0, 400).map(x => <option key={x} value={x} />)}</datalist>
      <datalist id="gar-carretas">{carretas.slice(0, 400).map(x => <option key={x} value={x} />)}</datalist>
      <datalist id="gar-conductores">{(recursos?.conductores ?? []).slice(0, 400).map(x => <option key={x} value={x} />)}</datalist>
      <div className="gar-fila2 gar-campo">
        <div>
          <label className="gar-etq" htmlFor="gar-placa">Placa Tracto <b>*</b></label>
          <input id="gar-placa" className={clase('placa', placaOk === null ? undefined : placaOk)} list="gar-tractos" value={placa} placeholder="Ej. A1B-891" autoComplete="off"
            onChange={e => { setPlaca(e.target.value.toUpperCase()); setMalo(null); }} />
        </div>
        <div>
          <label className="gar-etq" htmlFor="gar-carreta">Placa Carreta (Opcional)</label>
          <input id="gar-carreta" className={clase('carreta', carretaOk === null ? undefined : carretaOk)} list="gar-carretas" value={carreta} placeholder="Ej. T3X-998" autoComplete="off"
            onChange={e => { setCarreta(e.target.value.toUpperCase()); setMalo(null); }} />
        </div>
      </div>
      {docsBloque('DOCUMENTOS TRACTO', <Truck size={14} />, placa, docsT, placaOk)}
      {docsBloque('DOCUMENTOS CARRETA / REMOLQUE', <Truck size={14} />, carreta, docsC, carretaOk, true)}
      <div className="gar-campo">
        <label className="gar-etq" htmlFor="gar-conductor">Conductor Asignado <b>*</b></label>
        <input id="gar-conductor" className={clase('conductor')} list="gar-conductores" value={conductor} placeholder="Nombre completo del conductor" autoComplete="off"
          onChange={e => { setConductor(e.target.value.toUpperCase()); setMalo(null); }} />
      </div>
      <div className="gar-fila2 gar-campo">
        <div>
          <label className="gar-etq" htmlFor="gar-destino">Destino / Ruta <b>*</b></label>
          <input id="gar-destino" className={clase('destino')} value={destino} placeholder={PH_DESTINO[tipo]} onChange={e => { setDestino(e.target.value.toUpperCase()); setMalo(null); }} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <label className="gar-etq" htmlFor="gar-km">Kilometraje de Salida <b>*</b></label>
            {kmHint && <span className="gar-hint">{kmHint}</span>}
          </div>
          <input id="gar-km" className={clase('km')} type="number" inputMode="numeric" value={km} placeholder="Ej. 145200 (Obligatorio)" onChange={e => { setKm(e.target.value); setMalo(null); }} />
        </div>
      </div>
      <div className="gar-campo gar-campo--ultimo">
        <label className="gar-etq" htmlFor="gar-obs">Observaciones Generales (Opcional)</label>
        <textarea id="gar-obs" className="gar-input" rows={2} value={obs} placeholder={PH_OBS[tipo]} onChange={e => setObs(e.target.value)} />
      </div>
      {!esRuta && (
        <>
          <div className="gar-sep"><FotosEvidencia fotos={fotos} onCambio={setFotos} /></div>
          {botonGuardar}
        </>
      )}
    </div>
  );

  return (
    <div className="gar">
      <div className="gar-cab">
        <div className="gar-cab__izq">
          <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={onVolver}>Volver a la Lista</Button>
          <h2>{ban.formTitulo}</h2>
        </div>
        <div className="gar-cab__acciones">
          <Button variant="secondary" icon={<ArrowLeftRight size={16} />} onClick={onCambiarDestino} title="Cambiar destino o modalidad de salida">Cambiar Destino</Button>
        </div>
      </div>

      <div className={`gar-banner ${ban.cls}`}>
        <div className="gar-banner__izq">
          <span className="gar-banner__icono"><IconoTipo tipo={tipo} size={22} /></span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className={`gar-badge ${tipo === 'RUTA' ? 'gar-badge--azul' : tipo === 'COMPRAS' ? 'gar-badge--amarillo' : 'gar-badge--morado'}`}>{ban.badge}</span>
              <h3>{ban.titulo}</h3>
            </div>
            <small>{ban.desc}</small>
          </div>
        </div>
        <Button variant="secondary" size="sm" icon={<Repeat size={15} />} onClick={onCambiarDestino}>Cambiar</Button>
      </div>

      {esRuta && (
        <div className="gar-card" style={{ position: 'relative', zIndex: 2 }}>
          <button type="button" className="gar-viaje" aria-expanded={viajeAbierto} onClick={() => setViajeAbierto(a => !a)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="c-azul" style={{ display: 'grid' }}><Network size={22} /></span>
              <span>
                <strong style={{ fontSize: '0.9375rem' }}>Viaje Asociado <span className="gar-chip" style={{ marginLeft: 4 }}>Opcional</span></strong>
                <span className="gar-sub" style={{ display: 'block' }}>Toca aquí si deseas vincular con una Orden de Viaje</span>
              </span>
            </span>
            <span className="btn btn--secondary btn--sm">Vincular Viaje <ChevronDown size={15} style={{ transform: viajeAbierto ? 'rotate(180deg)' : undefined }} /></span>
          </button>
          {viajeAbierto && (
            <div className="gar-sep">
              <p className="gar-sub" style={{ margin: '0 0 var(--s-2)' }}><Info size={13} /> Selecciona una <b>Orden de Viaje</b> para autocompletar Placa Tracto, Carreta, Conductor y Destino.</p>
              <label className="gar-etq" htmlFor="gar-viaje">Orden de Viaje (Buscar por Código, Placa o Conductor)</label>
              <div className="gar-viaje__sel">
                <input id="gar-viaje" className="gar-input" value={viajeTxt} autoComplete="off" placeholder="BUSCAR ORDEN DE VIAJE (EJ: 2026-00000952, PLACA, CONDUCTOR)..."
                  onChange={e => { setViajeTxt(e.target.value); setViajeDd(true); if (!e.target.value.trim() && viaje) quitarViaje(); }}
                  onFocus={() => setViajeDd(true)} onBlur={() => setTimeout(() => setViajeDd(false), 200)} />
                {viajeDd && (
                  <div className="gar-lista-dd">
                    {viajes.isLoading ? <div className="gar-vacio">Cargando…</div> : viajesFiltrados.length === 0 ? <div className="gar-vacio">No se encontraron órdenes de viaje coincidentes.</div> : viajesFiltrados.map((v, i) => (
                      <button key={`${numViaje(v)}-${i}`} type="button" onMouseDown={e => e.preventDefault()} onClick={() => elegirViaje(v)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <strong className="c-azul">Viaje: {numViaje(v) || '---'}</strong>
                          <span className="gar-sub">{v.fecha_viaje ? new Date(v.fecha_viaje).toLocaleDateString('es-PE') : ''}</span>
                        </div>
                        <div className="gar-sub">{v.placa_tracto || 'TRACTO'} · {v.placa_remolque || v.placa_carreta || 'Sin carreta'} · {v.conductor || '---'}</div>
                        {(v.ruta || v.destino) && <div className="gar-sub"><b>Ruta:</b> {v.ruta || v.destino}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {viaje && (
                <div className="gar-vinc">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <strong className="c-azul"><Check size={14} /> Viaje Vinculado: {numViaje(viaje)}</strong>
                    <Button size="sm" variant="danger" icon={<X size={14} />} onClick={quitarViaje}>Quitar vinculación</Button>
                  </div>
                  <div className="gar-sub" style={{ marginTop: 4 }}>
                    <strong>Tracto:</strong> {viaje.placa_tracto || '---'} | <strong>Carreta:</strong> {viaje.placa_remolque || viaje.placa_carreta || '---'} | <strong>Conductor:</strong> {viaje.conductor || '---'}<br />
                    <strong>Ruta:</strong> {viaje.ruta || viaje.destino || '---'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className={`gar-form${esRuta ? '' : ' gar-form--una'}`}>
        {tarjetaIzq}
        {esRuta && (
          <div className="gar-card">
            <h3 className="gar-card__titulo"><ShieldCheck size={18} /> Verificación e Inspección</h3>
            <div className="gar-tarea">
              <div className="gar-tarea__izq">
                <span className="gar-tarea__icono"><ClipboardCheck size={22} /></span>
                <div><b>Checklist y Evidencias</b><small>{insp.desc}</small></div>
              </div>
              <Button variant={insp.hecho ? 'accent' : 'secondary'} onClick={() => setChkAbierto(true)}>{insp.boton}</Button>
            </div>
            <div className="gar-sep" style={{ marginTop: 0 }}>
              <div className="gar-firmas-tit">
                <span><PenLine size={14} /> Firmas de Salida (Ida)</span>
                <span className="gar-chip">Conductor &amp; Vigilancia</span>
              </div>
              <FirmaPar etiquetaConductor="Conductor" etiquetaVigilancia="Vigilancia / Seguridad" refConductor={firmaC} refVigilancia={firmaV} />
            </div>
            {botonGuardar}
          </div>
        )}
      </div>

      <ChecklistEvidenciasSheet open={chkAbierto} onClose={() => setChkAbierto(false)} fase="salida" tipo={tipo}
        plantilla={plantilla.data ?? []} valores={chk} onValores={setChk} fotos={fotos} onFotos={setFotos} />
    </div>
  );
}
