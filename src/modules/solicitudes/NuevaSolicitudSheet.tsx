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
import { BANCOS_PERU } from '../almacen/bancosPeru';
import { consultarDocumento } from '../directorio/api';
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
  // Resultado de la consulta del documento (SUNAT o RENIEC)
  const [consulta, setConsulta] = useState<{ estado: 'buscando' | 'ok' | 'no'; texto: string } | null>(null);

  useEffect(() => { if (open) { setTipo(null); setDatos({}); setMotivo(''); setErrores({}); setError(null); setConsulta(null); } }, [open]);

  function elegir(t: TipoSolicitud) { haptic('selection'); setTipo(t); setDatos(valoresIniciales(t)); setErrores({}); setError(null); }
  const poner = (k: string, v: string) => { setDatos(d => ({ ...d, [k]: v })); setErrores(e => (e[k] ? { ...e, [k]: '' } : e)); };

  /** RUC o DNI: solo dígitos; con 8 (DNI) u 11 (RUC) trae los datos y los pone en los campos que existan */
  async function cambiarDocumento(c: CampoSolicitud, crudo: string) {
    const doc = crudo.replace(/\D/g, '').slice(0, 11);
    poner(c.key, doc);
    setConsulta(null);
    if (!c.autoconsulta || (doc.length !== 8 && doc.length !== 11)) return;
    setConsulta({ estado: 'buscando', texto: doc.length === 8 ? 'Buscando en RENIEC…' : 'Buscando en SUNAT…' });
    try {
      const r = await consultarDocumento(doc);
      setDatos(d => {
        if ((d[c.key] ?? '') !== doc) return d; // cambió mientras buscaba
        const sig = { ...d };
        for (const k of ['razon_social', 'titular_nombre']) if (k in sig && r.razon_social) sig[k] = r.razon_social;
        if ('direccion' in sig && r.direccion) sig.direccion = r.direccion;
        return sig;
      });
      setConsulta({ estado: 'ok', texto: `${r.tipo === 'RUC' ? 'SUNAT' : 'RENIEC'}: datos completados${r.estado ? ' · ' + r.estado : ''}` });
    } catch (err) {
      setConsulta({ estado: 'no', texto: errorMessage(err) });
    }
  }
  const ayudaDocumento = (c: CampoSolicitud): string | undefined => {
    const n = (datos[c.key] ?? '').length;
    if (consulta) return consulta.texto;
    if (n === 0) return c.ayuda;
    if (n === 8) return 'DNI';
    if (n === 11) return 'RUC';
    return n < 8 ? `Faltan ${8 - n} dígitos para un DNI o ${11 - n} para un RUC` : `Faltan ${11 - n} dígitos para un RUC`;
  };

  async function enviar() {
    if (!tipo || enviando) return;
    const e: Record<string, string> = {};
    for (const c of tipo.campos) if (c.requerido && !(datos[c.key] ?? '').trim()) e[c.key] = 'Este dato es obligatorio.';
    for (const c of tipo.campos) {
      if (c.tipo !== 'documento' || e[c.key]) continue;
      const n = (datos[c.key] ?? '').length;
      if (n !== 8 && n !== 11) e[c.key] = 'El DNI tiene 8 dígitos y el RUC 11: revisa el número.';
    }
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
    const ayuda = c.tipo === 'documento' ? ayudaDocumento(c) : c.ayuda;
    return (
      <Field key={c.key} label={etiqueta} wide={c.ancho} error={errores[c.key]} hint={ayuda}>
        {p => c.tipo === 'select' ? (
          <Combobox {...p} enHoja tituloHoja={c.label} options={(c.opciones ?? []).map(o => ({ value: o, label: o }))} value={datos[c.key] || null}
            onChange={v => poner(c.key, v ?? '')} placeholder="Elige…" />
        ) : c.tipo === 'banco' ? (
          <Combobox {...p} enHoja tituloHoja="Banco o caja" options={BANCOS_PERU.map(b => ({ value: b, label: b }))} value={datos[c.key] || null}
            onChange={v => poner(c.key, v ?? '')} onCreate={t => poner(c.key, t.trim())} createLabel="Usar este banco" placeholder="Busca el banco o la caja…" />
        ) : c.tipo === 'documento' ? (
          <TextInput {...p} inputMode="numeric" maxLength={11} value={datos[c.key] ?? ''} placeholder="DNI (8) o RUC (11)" autoFocus
            onChange={ev => { void cambiarDocumento(c, ev.target.value); }} />
        ) : c.tipo === 'area' ? (
          <textarea {...p} className="textarea" rows={2} value={datos[c.key] ?? ''} onChange={ev => poner(c.key, ev.target.value)} />
        ) : (
          <TextInput {...p} value={datos[c.key] ?? ''} onChange={ev => poner(c.key, ev.target.value)} />
        )}
      </Field>
    );
  }

  /** Los campos se muestran en tarjetas por grupo, en el orden en que aparecen */
  const grupos = (t: TipoSolicitud) => {
    const m = new Map<string, CampoSolicitud[]>();
    for (const c of t.campos) { const g = c.grupo ?? 'Datos clave'; m.set(g, [...(m.get(g) ?? []), c]); }
    return [...m.entries()];
  };
  const TONOS = ['azul', 'ambar', 'violeta', 'verde', 'rosa'] as const;

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
      <div className="oc-form sol-form">
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
            {grupos(tipo).map(([g, campos], n) => (
              <Seccion key={g} tono={TONOS[n % TONOS.length]} icono={<FilePlus2 size={15} />} titulo={g}>
                <div className="oc-grid">{campos.map(campo)}</div>
              </Seccion>
            ))}
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
