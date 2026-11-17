import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FilePlus2, Landmark, Truck, Users, type LucideIcon } from 'lucide-react';
import '../almacen/entradas.css';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Combobox } from '../../core/ui/Combobox';
import { Field, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { Seccion } from '../almacen/EntradaFormulario';
import { claveSolicitudes, crearSolicitud, useTiposSolicitud, type CampoSolicitud, type TipoSolicitud } from './api';

const ICONOS: Record<string, LucideIcon> = { Truck, Users, Landmark };

const valoresIniciales = (t: TipoSolicitud) => Object.fromEntries(t.campos.map(c => [c.key, c.defecto ?? '']));

/** Nueva solicitud: primero se elige el motivo (tipo) y luego se llenan sus datos clave */
export function NuevaSolicitudSheet({ open, onClose, onCreada }: { open: boolean; onClose: () => void; onCreada?: (codigo: string) => void }) {
  const tipos = useTiposSolicitud();
  const qc = useQueryClient();
  const toast = useToast();
  const [tipo, setTipo] = useState<TipoSolicitud | null>(null);
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (open) { setTipo(null); setDatos({}); setMotivo(''); setErrores({}); setError(null); } }, [open]);

  function elegir(t: TipoSolicitud) { haptic('selection'); setTipo(t); setDatos(valoresIniciales(t)); setErrores({}); setError(null); }
  const poner = (k: string, v: string) => { setDatos(d => ({ ...d, [k]: v })); setErrores(e => (e[k] ? { ...e, [k]: '' } : e)); };

  async function enviar() {
    if (!tipo || enviando) return;
    const e: Record<string, string> = {};
    for (const c of tipo.campos) if (c.requerido && !(datos[c.key] ?? '').trim()) e[c.key] = 'Este dato es obligatorio.';
    setErrores(e);
    if (Object.keys(e).length) { haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const r = await crearSolicitud({ tipo: tipo.tipo, datos, motivo: motivo.trim() });
      haptic('success');
      toast(`Solicitud ${r.codigo} enviada`);
      await qc.invalidateQueries({ queryKey: claveSolicitudes });
      onCreada?.(r.codigo);
      onClose();
    } catch (err) {
      setError(errorMessage(err)); haptic('warning');
    } finally { setEnviando(false); }
  }

  function campo(c: CampoSolicitud) {
    const etiqueta = `${c.label}${c.requerido ? ' *' : ''}`;
    return (
      <Field key={c.key} label={etiqueta} wide={c.ancho} error={errores[c.key]} hint={c.ayuda}>
        {p => c.tipo === 'select' ? (
          <Combobox {...p} enHoja tituloHoja={c.label} options={(c.opciones ?? []).map(o => ({ value: o, label: o }))} value={datos[c.key] || null}
            onChange={v => poner(c.key, v ?? '')} placeholder="Elige…" />
        ) : c.tipo === 'area' ? (
          <textarea {...p} className="textarea" rows={2} value={datos[c.key] ?? ''} onChange={ev => poner(c.key, ev.target.value)} />
        ) : (
          <TextInput {...p} value={datos[c.key] ?? ''} onChange={ev => poner(c.key, ev.target.value)} />
        )}
      </Field>
    );
  }

  return (
    <Sheet open={open} ancho onClose={() => !enviando && onClose()} title={tipo ? tipo.etiqueta : 'Nueva solicitud'}
      footer={tipo ? (
        <div className="oc-pie">
          <div className="oc-pie__acciones">
            <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => setTipo(null)} disabled={enviando}>Cambiar tipo</Button>
            <Button variant="primary" onClick={enviar} loading={enviando} style={{ flex: 1 }}>Enviar solicitud</Button>
          </div>
        </div>
      ) : undefined}>
      <div className="oc-form">
        {!tipo ? (
          <Seccion tono="azul" icono={<FilePlus2 size={15} />} titulo="¿Qué necesitas pedir?">
            {tipos.isLoading ? <p className="t-footnote c-secondary">Cargando…</p> : (
              <div className="sol-tipos">
                {(tipos.data?.data ?? []).map(t => {
                  const Icono = ICONOS[t.icono] ?? FilePlus2;
                  return (
                    <button key={t.tipo} type="button" className="sol-tipo pressable" onClick={() => elegir(t)}>
                      <span className="sol-tipo__icono"><Icono size={20} /></span>
                      <span className="sol-tipo__texto"><strong>{t.etiqueta}</strong><small>{t.descripcion}</small></span>
                    </button>
                  );
                })}
              </div>
            )}
          </Seccion>
        ) : (
          <>
            {error && <Notice tone="error">{error}</Notice>}
            <Seccion tono="ambar" icono={<FilePlus2 size={15} />} titulo="Datos clave">
              <div className="oc-grid">{tipo.campos.map(campo)}</div>
            </Seccion>
            <Seccion tono="violeta" icono={<Users size={15} />} titulo="¿Para qué lo necesitas?">
              <div className="oc-grid">
                <Field label="Motivo o comentario para quien aprueba" wide hint="Opcional, pero ayuda a decidir más rápido">
                  {p => <textarea {...p} className="textarea" rows={2} value={motivo} onChange={ev => setMotivo(ev.target.value)} placeholder="Ej.: Lo necesitamos para la compra de repuestos de la próxima semana" />}
                </Field>
              </div>
            </Seccion>
          </>
        )}
      </div>
    </Sheet>
  );
}
