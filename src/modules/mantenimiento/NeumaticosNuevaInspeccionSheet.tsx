import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { TextInput } from '../../core/ui/Field';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';

// Nueva inspección de neumáticos (POST /api/neumaticos/inspecciones). La usan Análisis y Últimas inspecciones.

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

export function NeumaticosNuevaInspeccionSheet({ open, placaInicial = '', onClose }: { open: boolean; placaInicial?: string; onClose: () => void }) {
  const qc    = useQueryClient();
  const toast = useToast();
  const { data: cats }   = useCatalogos();
  const { data: placas } = usePlacasLista();
  const [guardando, setGuardando] = useState(false);
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

  // Al abrir: formulario limpio; si llega una placa, se precarga su última inspección
  useEffect(() => {
    if (!open) return;
    setPlaca('');
    setFecha(new Date().toISOString().split('T')[0]);
    setKm('');
    setInspector('');
    setDiasProp('30');
    setObs('');
    setFilas(['1','2','3','4','5','6','7','8','9','10'].map(filaVacia));
    if (placaInicial) void autoCargarPlaca(placaInicial);
  }, [open, placaInicial]); // eslint-disable-line react-hooks/exhaustive-deps

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
        onClose();
        qc.invalidateQueries({ queryKey: ['mant', 'neumaticos'] });
        qc.invalidateQueries({ queryKey: ['mant', 'neumaticos-analisis'] });
        qc.invalidateQueries({ queryKey: ['mant', 'neumaticos-estado-actual'] });
      } else {
        toast('Error al guardar', 'error');
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setGuardando(false);
    }
  }


  const placasOpts = (placas ?? []).map(p => ({ value: p, label: p }));
  const marcasOpts  = (cats?.marcas  ?? []).map(m => ({ value: m, label: m }));
  const medidasOpts = (cats?.medidas ?? []).map(m => ({ value: m, label: m }));
  const accionesOpts = (cats?.acciones ?? ['Inspección', 'Rotación', 'Instalación', 'Cambio', 'Baja'])
    .map(a => ({ value: a, label: a }));
  const estadosOpts = (cats?.estados ?? ['NUEVA', 'RENCAUCHADA'])
    .map(e => ({ value: e, label: e }));

  return (
    <Sheet
      open={open}
      onClose={() => onClose()}
      title="Nueva inspección de neumáticos"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => onClose()} disabled={guardando}>Cancelar</Button>
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
