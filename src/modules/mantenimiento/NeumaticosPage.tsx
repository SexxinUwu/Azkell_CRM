import './mant.css';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Disc3, Plus, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, TextInput } from '../../core/ui/Field';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { Sheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { useNeumaticos, type NeuRequerimiento, type NeuVehiculo } from './api';
import { NeumaticosAnalisis } from './NeumaticosAnalisis';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Catalogos {
  marcas: string[];
  modelos: string[];
  medidas: string[];
  acciones: string[];
  estados: string[];
}

interface FilaLlanta {
  posicion: string;
  marca: string;
  medida: string;
  modelo: string;
  r1: string;
  r2: string;
  r3: string;
  presion_ant: string;
  presion_actual: string;
  estado: string;
  accion: string;
  observaciones: string;
}

function filaVacia(posicion = ''): FilaLlanta {
  return { posicion, marca: '', medida: '', modelo: '', r1: '', r2: '', r3: '',
    presion_ant: '100', presion_actual: '100', estado: 'NUEVA', accion: 'Inspección', observaciones: '' };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useCatalogos() {
  return useQuery<Catalogos>({
    queryKey: ['mant', 'neu-catalogos'],
    queryFn: () => api<Catalogos>('/neumaticos/catalogos'),
    staleTime: 600_000,
  });
}

function usePlacasLista() {
  return useQuery<string[]>({
    queryKey: ['mant', 'placas-lista'],
    queryFn: () => api<{ data?: string[] }>('/placas-lista').then(r => r.data ?? []),
    staleTime: 300_000,
  });
}

const TABS = ['Últimas inspecciones', 'Requerimientos', 'Análisis de flota'] as const;
type TabNeu = typeof TABS[number];
// Clave de la URL (?tab=) para cada pestaña; la pestaña por defecto no lleva parámetro
const CLAVE_TAB: Record<TabNeu, string> = { 'Últimas inspecciones': '', 'Requerimientos': 'requerimientos', 'Análisis de flota': 'analisis' };

// ─── Componente principal ─────────────────────────────────────────────────────

export function NeumaticosPage() {
  const qc    = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, error } = useNeumaticos();
  const { data: cats }   = useCatalogos();
  const { data: placas } = usePlacasLista();

  // La pestaña activa vive en la URL (?tab=analisis), para que el menú pueda abrirla directamente
  const [params, setParams] = useSearchParams();
  const tab: TabNeu = TABS.find(t => CLAVE_TAB[t] === (params.get('tab') ?? '')) ?? 'Últimas inspecciones';
  const setTab = (t: TabNeu) => setParams(CLAVE_TAB[t] ? { tab: CLAVE_TAB[t] } : {}, { replace: true });
  const [busqueda, setBusqueda] = useState('');

  // Modal nueva inspección
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando]       = useState(false);

  // Cabecera del formulario
  const [placa, setPlaca]           = useState('');
  const [fecha, setFecha]           = useState(() => new Date().toISOString().split('T')[0]);
  const [km, setKm]                 = useState('');
  const [inspector, setInspector]   = useState('');
  const [diasProp, setDiasProp]     = useState('30');
  const [obs, setObs]               = useState('');

  // Filas de llantas
  const [filas, setFilas] = useState<FilaLlanta[]>(() =>
    ['1','2','3','4','5','6','7','8','9','10'].map(filaVacia)
  );

  const ultimas       = data?.ultimas ?? [];
  const requerimientos = data?.requerimientos ?? [];

  const visiblesUlt = useMemo(() => {
    if (!busqueda) return ultimas;
    const q = busqueda.toUpperCase();
    return ultimas.filter(v =>
      (v.placa ?? '').toUpperCase().includes(q) ||
      (v.dueno ?? '').toUpperCase().includes(q) ||
      (v.tipo_unidad ?? '').toUpperCase().includes(q)
    );
  }, [ultimas, busqueda]);

  const visiblesReq = useMemo(() => {
    if (!busqueda) return requerimientos;
    const q = busqueda.toUpperCase();
    return requerimientos.filter(r =>
      (r.placa ?? '').toUpperCase().includes(q) ||
      (r.tipo_llanta ?? '').toUpperCase().includes(q) ||
      (r.motivo ?? '').toUpperCase().includes(q)
    );
  }, [requerimientos, busqueda]);

  // Actualizar una celda de la tabla de llantas
  function actualizarFila(idx: number, campo: keyof FilaLlanta, valor: string) {
    setFilas(prev => prev.map((f, i) => i === idx ? { ...f, [campo]: valor } : f));
  }

  function agregarFila() {
    setFilas(prev => [...prev, filaVacia(String(prev.length + 1))]);
  }

  function quitarFila(idx: number) {
    setFilas(prev => prev.filter((_, i) => i !== idx));
  }

  function abrirModal() {
    setPlaca('');
    setFecha(new Date().toISOString().split('T')[0]);
    setKm('');
    setInspector('');
    setDiasProp('30');
    setObs('');
    setFilas(['1','2','3','4','5','6','7','8','9','10'].map(filaVacia));
    setModalAbierto(true);
  }

  // Auto-cargar última inspección de la placa seleccionada
  async function autoCargarPlaca(p: string) {
    setPlaca(p);
    if (!p) return;
    try {
      const res = await api<{ ok: boolean; datosPosiciones: Record<string, Record<string, unknown>> }>(
        `/neumaticos/placa-ultima/${encodeURIComponent(p)}`
      );
      if (res?.ok && res.datosPosiciones && Object.keys(res.datosPosiciones).length > 0) {
        const pos = res.datosPosiciones;
        const posiciones = Object.keys(pos).sort((a, b) => Number(a) - Number(b));
        const nuevasFilas = posiciones.map(k => {
          const d = pos[k];
          return {
            posicion:      k,
            marca:         String(d.marca ?? ''),
            medida:        String(d.medida ?? ''),
            modelo:        String(d.modelo ?? ''),
            r1:            String(d.r1 ?? ''),
            r2:            String(d.r2 ?? ''),
            r3:            String(d.r3 ?? ''),
            presion_ant:   String(d.presion_actual ?? '100'),
            presion_actual: '100',
            estado:        String(d.estado ?? 'NUEVA'),
            accion:        'Inspección',
            observaciones: '',
          } satisfies FilaLlanta;
        });
        if (nuevasFilas.length > 0) setFilas(nuevasFilas);
        toast(`${nuevasFilas.length} posiciones cargadas de inspección anterior`);
      }
    } catch { /* silencioso — primera inspección de la placa */ }
  }

  async function guardarInspeccion() {
    if (!placa) { toast('Selecciona una placa', 'error'); return; }
    if (!fecha) { toast('Ingresa la fecha', 'error'); return; }

    const items = filas
      .filter(f => f.posicion.trim() !== '')
      .map(f => ({
        posicion:       f.posicion.trim().toUpperCase(),
        marca:          f.marca.trim(),
        medida:         f.medida.trim(),
        modelo:         f.modelo.trim(),
        r1:             Number(f.r1) || 0,
        r2:             Number(f.r2) || 0,
        r3:             Number(f.r3) || 0,
        presion_ant:    Number(f.presion_ant) || 0,
        presion_actual: Number(f.presion_actual) || 0,
        estado:         f.estado,
        accion:         f.accion,
        observaciones:  f.observaciones,
      }));

    if (items.length === 0) { toast('Agrega al menos una llanta', 'error'); return; }

    setGuardando(true);
    try {
      const res = await api<{ ok: boolean; id_inspeccion: string }>('/neumaticos/inspecciones', {
        method: 'POST',
        body: {
          placa:                   placa.toUpperCase(),
          fecha_inspeccion:        fecha,
          km_vehiculo:             Number(km) || 0,
          odometro_km:             String(Number(km) || 0),
          inspector:               inspector.trim(),
          dias_propuestos:         Number(diasProp) || 30,
          observaciones:           obs.trim(),
          observaciones_generales: obs.trim(),
          items,
          llantas_inspeccionadas:  items,
        },
      });
      if (res?.ok) {
        toast(`Inspección ${res.id_inspeccion} registrada`);
        setModalAbierto(false);
        qc.invalidateQueries({ queryKey: ['mant', 'neumaticos'] });
      } else {
        toast('Error al guardar', 'error');
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const placasOpts = (placas ?? []).map(p => ({ value: p, label: p }));
  const marcasOpts  = (cats?.marcas  ?? []).map(m => ({ value: m, label: m }));
  const medidasOpts = (cats?.medidas ?? []).map(m => ({ value: m, label: m }));
  const accionesOpts = (cats?.acciones ?? ['Inspección', 'Rotación', 'Instalación', 'Cambio', 'Baja'])
    .map(a => ({ value: a, label: a }));
  const estadosOpts = (cats?.estados ?? ['NUEVA', 'RENCAUCHADA'])
    .map(e => ({ value: e, label: e }));

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Neumáticos"
        subtitle={isLoading ? 'Cargando…' : `${ultimas.length} vehículos · ${requerimientos.length} requerimientos`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={abrirModal}>
              Nueva inspección
            </Button>
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />,
                onSelect: () => abrirClasico('mantenimiento/neumaticos-ultimas') },
            ]} />
          </div>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            {TABS.map(t => (
              <button key={t} type="button" onClick={() => { setTab(t); setBusqueda(''); }}
                style={{
                  padding: '0.375rem 1rem', borderRadius: 'var(--r-full)', fontSize: '0.875rem',
                  fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: tab === t ? 'var(--ink)' : 'var(--fill)',
                  color: tab === t ? 'var(--label-inverse)' : 'var(--label-2)',
                }}>
                {t}
              </button>
            ))}
          </div>

          {tab !== 'Análisis de flota' && <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, empresa, tipo…" />}

          {tab === 'Análisis de flota' ? (
            <NeumaticosAnalisis />
          ) : tab === 'Últimas inspecciones' ? (
            visiblesUlt.length === 0 ? (
              <EmptyState icon={busqueda ? <SearchX size={22} /> : <Disc3 size={22} />}
                title={busqueda ? 'Sin coincidencias' : 'Sin inspecciones registradas'}>
                {busqueda
                  ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                  : <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={abrirModal}>Nueva inspección</Button>}
              </EmptyState>
            ) : (
              <div className="tarjeta__lista">
                {visiblesUlt.map((v, i) => <VehiculoFila key={v.placa ?? i} v={v} />)}
              </div>
            )
          ) : (
            visiblesReq.length === 0 ? (
              <EmptyState icon={busqueda ? <SearchX size={22} /> : <Disc3 size={22} />}
                title={busqueda ? 'Sin coincidencias' : 'Sin requerimientos pendientes'}>
                {busqueda && <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>}
              </EmptyState>
            ) : (
              <div className="tarjeta__lista">
                {visiblesReq.map((r, i) => <ReqFila key={(r.placa ?? '') + i} r={r} />)}
              </div>
            )
          )}
        </div>
      )}

      {/* ── Modal Nueva Inspección ── */}
      <Sheet
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title="Nueva inspección de neumáticos"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setModalAbierto(false)} disabled={guardando}>Cancelar</Button>
            <Button variant="primary" onClick={guardarInspeccion} loading={guardando}>Guardar inspección</Button>
          </div>
        }
      >
        {/* Cabecera */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 20 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--label-2)' }}>
              Placa *
            </label>
            <PlacaPicker value={placa} onChange={autoCargarPlaca} opciones={placasOpts.map(o => ({ placa: o.value }))} />
          </div>
          {([
            { lbl: 'Fecha de inspección *', val: fecha, set: setFecha, type: 'date' },
            { lbl: 'KM actual', val: km, set: setKm, type: 'number', placeholder: '0' },
            { lbl: 'Inspector', val: inspector, set: setInspector, placeholder: 'Nombre del inspector' },
            { lbl: 'Días para próxima', val: diasProp, set: setDiasProp, type: 'number', placeholder: '30' },
          ] as Array<{ lbl: string; val: string; set: (v: string) => void; type?: string; placeholder?: string }>)
            .map(({ lbl, val, set, type = 'text', placeholder }) => (
              <div key={lbl}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--label-2)' }}>
                  {lbl}
                </label>
                <TextInput type={type} value={val} onChange={e => set(e.target.value)} placeholder={placeholder} />
              </div>
            ))
          }
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--label-2)' }}>
              Observaciones
            </label>
            <TextInput value={obs} onChange={e => setObs(e.target.value)} placeholder="Observaciones generales…" />
          </div>
        </div>

        {/* Tabla de llantas */}
        <div style={{ borderTop: '1px solid var(--separator)', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Llantas ({filas.filter(f => f.posicion).length})</span>
            <Button variant="accent" size="sm" icon={<Plus size={13} />} onClick={agregarFila}>
              Agregar fila
            </Button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="inv-kardex" style={{ minWidth: '52rem', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>Pos.</th>
                  <th>Marca</th>
                  <th>Medida</th>
                  <th style={{ width: 50 }}>R1</th>
                  <th style={{ width: 50 }}>R2</th>
                  <th style={{ width: 50 }}>R3</th>
                  <th style={{ width: 60 }}>P.Ant</th>
                  <th style={{ width: 60 }}>P.Act</th>
                  <th>Estado</th>
                  <th>Acción</th>
                  <th>Obs.</th>
                  <th style={{ width: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        style={{ width: '100%', padding: '3px 5px', borderRadius: 5,
                          border: '1px solid var(--separator)', background: 'var(--fill)',
                          color: 'var(--label-1)', fontSize: '0.8rem', textAlign: 'center' }}
                        value={f.posicion} onChange={e => actualizarFila(idx, 'posicion', e.target.value)}
                        placeholder="1"
                      />
                    </td>
                    <td>
                      <select style={selectStyle}
                        value={f.marca} onChange={e => actualizarFila(idx, 'marca', e.target.value)}>
                        <option value="">—</option>
                        {marcasOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select style={selectStyle}
                        value={f.medida} onChange={e => actualizarFila(idx, 'medida', e.target.value)}>
                        <option value="">—</option>
                        {medidasOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    {(['r1','r2','r3'] as const).map(k => (
                      <td key={k}>
                        <input type="number" style={{ ...inputNumStyle, width: '100%' }}
                          value={f[k]} onChange={e => actualizarFila(idx, k, e.target.value)}
                          min={0} max={25} placeholder="—"
                        />
                      </td>
                    ))}
                    <td>
                      <input type="number" style={{ ...inputNumStyle, width: '100%' }}
                        value={f.presion_ant} onChange={e => actualizarFila(idx, 'presion_ant', e.target.value)}
                        min={0} placeholder="100"
                      />
                    </td>
                    <td>
                      <input type="number" style={{ ...inputNumStyle, width: '100%' }}
                        value={f.presion_actual} onChange={e => actualizarFila(idx, 'presion_actual', e.target.value)}
                        min={0} placeholder="100"
                      />
                    </td>
                    <td>
                      <select style={selectStyle}
                        value={f.estado} onChange={e => actualizarFila(idx, 'estado', e.target.value)}>
                        {estadosOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select style={selectStyle}
                        value={f.accion} onChange={e => actualizarFila(idx, 'accion', e.target.value)}>
                        {accionesOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input style={{ ...inputNumStyle, width: '100%', textAlign: 'left' }}
                        value={f.observaciones} onChange={e => actualizarFila(idx, 'observaciones', e.target.value)}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      <button type="button" title="Quitar fila" onClick={() => quitarFila(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: 'var(--label-3)', lineHeight: 1 }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--red-ink)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--label-3)')}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Sheet>
    </Page>
  );
}

// ─── Estilos inline reutilizables ─────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '3px 4px', borderRadius: 5, fontSize: '0.77rem',
  border: '1px solid var(--separator)', background: 'var(--fill)', color: 'var(--label-1)',
};

const inputNumStyle: React.CSSProperties = {
  padding: '3px 5px', borderRadius: 5, fontSize: '0.8rem', textAlign: 'right',
  border: '1px solid var(--separator)', background: 'var(--fill)', color: 'var(--label-1)',
};

// ─── Componentes de fila ─────────────────────────────────────────────────────

function VehiculoFila({ v }: { v: NeuVehiculo }) {
  const malas = (v.llantas_reparar ?? 0) + (v.llantas_cambiar ?? 0);
  const tono = malas > 0 ? 'red' : 'green';
  return (
    <div className="ot-fila" style={{ cursor: 'default' }}>
      <div className="ot-fila__icono" style={{ background: `var(--${tono}-tint)`, color: `var(--${tono}-ink)` }}>
        <Disc3 size={16} />
      </div>
      <div className="ot-fila__cuerpo">
        <span className="ot-fila__id">{v.placa}</span>
        <span className="ot-fila__sub">
          {v.dueno ? `${v.dueno} · ` : ''}{v.tipo_unidad ?? '—'}
          {v.inspector ? ` · ${v.inspector}` : ''}
        </span>
      </div>
      <div className="ot-fila__derecha">
        {v.total_llantas != null && (
          <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>{v.total_llantas} llantas</span>
        )}
        {malas > 0 && (
          <span className="ot-estado ot-estado--red">{malas} a atender</span>
        )}
        <span className="ot-fila__fecha">{v.fecha_inspeccion?.split('T')[0] ?? '—'}</span>
      </div>
    </div>
  );
}

function ReqFila({ r }: { r: NeuRequerimiento }) {
  const tono = r.estado === 'Atendido' ? 'green' : 'red';
  return (
    <div className="ot-fila" style={{ cursor: 'default' }}>
      <div className="ot-fila__icono" style={{ background: `var(--${tono}-tint)`, color: `var(--${tono}-ink)` }}>
        <Disc3 size={16} />
      </div>
      <div className="ot-fila__cuerpo">
        <span className="ot-fila__id">{r.placa}</span>
        <span className="ot-fila__sub">
          {r.tipo_llanta ?? '—'}{r.medida ? ` · ${r.medida}` : ''}
          {r.motivo ? ` · ${r.motivo}` : ''}
        </span>
      </div>
      <div className="ot-fila__derecha">
        {r.cantidad != null && (
          <span style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{r.cantidad} un.</span>
        )}
        <span className={`ot-estado ot-estado--${tono}`}>{r.estado ?? 'Pendiente'}</span>
        <span className="ot-fila__fecha">{r.fecha_solicitud?.split('T')[0] ?? '—'}</span>
      </div>
    </div>
  );
}
