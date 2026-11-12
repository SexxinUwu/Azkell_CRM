import '../operaciones/servicios.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CircleAlert, ContactRound, MapPin, RefreshCw, StickyNote, UserRound } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useOpcionesUbigeo } from '../operaciones/ubigeos';
import { consultarDocumento, tipoDocumento, type Cliente } from './api';

interface Form { doc: string; razon: string; direccion: string; ubigeo: string; telefono: string; email: string; estado: 'Activo' | 'Inactivo'; notas: string }
type Campo = 'doc' | 'razon' | 'telefono' | 'email';
type Busqueda = { tipo: 'cargando' | 'ok' | 'error'; texto: string } | null;

const VACIO: Form = { doc: '', razon: '', direccion: '', ubigeo: '', telefono: '', email: '', estado: 'Activo', notas: '' };
const ESTADOS: Array<{ value: 'Activo' | 'Inactivo'; label: string }> = [{ value: 'Activo', label: 'Activo' }, { value: 'Inactivo', label: 'Inactivo' }];
const desde = (c: Cliente | null): Form => (!c ? VACIO : {
  doc: String(c.ruc_dni ?? ''), razon: String(c.razon_social ?? c.nombre ?? ''), direccion: String(c.direccion ?? ''), ubigeo: String(c.ubigeo ?? ''),
  telefono: String(c.telefono ?? ''), email: String(c.email ?? ''), estado: String(c.estado ?? 'Activo').toLowerCase() === 'activo' ? 'Activo' : 'Inactivo', notas: String(c.notas ?? ''),
});

function Seccion({ icono, titulo, children }: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <section className="os-seccion">
      <h3 className="os-seccion__titulo"><span className="os-seccion__icono" aria-hidden>{icono}</span>{titulo}</h3>
      <div className="os-seccion__cuerpo">{children}</div>
    </section>
  );
}

/**
 * Alta y edición de clientes. El documento manda: si se escribe un RUC (11 dígitos) se trae de SUNAT la razón social, el domicilio, el distrito
 * y el estado; si es un DNI (8 dígitos) se trae el nombre de RENIEC. Lo que la persona ya escribió no se pisa (salvo con «Volver a consultar»).
 */
export function ClienteFormulario({ open, cliente, existentes, onClose, onGuardado }: {
  open: boolean; cliente: Cliente | null; existentes: Cliente[]; onClose: () => void; onGuardado?: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const ubi = useOpcionesUbigeo();
  const [v, setV] = useState<Form>(VACIO);
  const [tocados, setTocados] = useState<Set<Campo>>(new Set());
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState<Busqueda>(null);
  const consultado = useRef('');
  const editando = !!cliente;

  useEffect(() => {
    if (!open) return;
    setV(desde(cliente)); setTocados(new Set()); setIntento(false); setError(null); setBusqueda(null);
    consultado.current = String(cliente?.ruc_dni ?? '').trim();
  }, [open, cliente]);

  const set = (p: Partial<Form>) => setV(x => ({ ...x, ...p }));
  const tipo = tipoDocumento(v.doc);

  async function buscar(numero: string, forzar: boolean) {
    consultado.current = numero;
    setBusqueda({ tipo: 'cargando', texto: numero.length === 11 ? 'Consultando SUNAT…' : 'Consultando RENIEC…' });
    try {
      const d = await consultarDocumento(numero);
      if (consultado.current !== numero) return;
      const notaSunat = [d.estado && `ESTADO SUNAT: ${d.estado.toUpperCase()}`, d.condicion && `CONDICIÓN: ${d.condicion.toUpperCase()}`].filter(Boolean).join(' | ');
      setV(x => ({
        ...x,
        razon: forzar || !x.razon.trim() ? d.razon_social.toUpperCase() : x.razon,
        direccion: d.direccion && (forzar || !x.direccion.trim()) ? d.direccion.toUpperCase() : x.direccion,
        ubigeo: d.ubigeo && (forzar || !x.ubigeo) ? d.ubigeo : x.ubigeo,
        notas: notaSunat && (forzar || !x.notas.trim()) ? notaSunat : x.notas,
      }));
      setBusqueda({ tipo: 'ok', texto: d.tipo === 'RUC' ? `SUNAT: ${[d.estado, d.condicion].filter(Boolean).join(' · ') || 'datos consultados'}` : 'RENIEC: nombre completado' });
    } catch (err) {
      if (consultado.current !== numero) return;
      setBusqueda({ tipo: 'error', texto: errorMessage(err) });
    }
  }

  // Búsqueda automática al completar el documento (pausa de medio segundo)
  useEffect(() => {
    const n = v.doc.trim();
    if (!open || !/^(\d{8}|\d{11})$/.test(n) || n === consultado.current) return;
    const t = window.setTimeout(() => { void buscar(n, false); }, 450);
    return () => window.clearTimeout(t);
  }, [v.doc, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const errores = useMemo(() => {
    const e: Partial<Record<Campo, string>> = {};
    const d = v.doc.trim();
    if (d && !/^(\d{8}|\d{11})$/.test(d)) e.doc = 'El RUC tiene 11 dígitos y el DNI 8.';
    else if (d) { const otro = existentes.find(c => String(c.ruc_dni ?? '').trim() === d && c.id !== cliente?.id); if (otro) e.doc = `Ya está registrado: ${otro.razon_social ?? otro.nombre}.`; }
    if (!v.razon.trim()) e.razon = 'Escribe la razón social o el nombre.';
    if (v.telefono.trim() && !/^\+?[\d\s-]{7,15}$/.test(v.telefono.trim())) e.telefono = 'Escribe un teléfono válido, solo números.';
    if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Revisa el correo: usuario@empresa.com.';
    return e;
  }, [v, existentes, cliente]);
  const ver = (c: Campo) => (intento || tocados.has(c) ? errores[c] ?? null : null);
  const tocar = (c: Campo) => setTocados(s => new Set(s).add(c));

  async function guardar() {
    setIntento(true);
    if (Object.keys(errores).length) { haptic('warning'); return; }
    setGuardando(true); setError(null);
    try {
      const cuerpo = { ruc_dni: v.doc.trim(), razon_social: v.razon.trim().toUpperCase(), direccion: v.direccion.trim(), ubigeo: v.ubigeo || null, telefono: v.telefono.trim(), email: v.email.trim(), estado: v.estado, notas: v.notas.trim() };
      const r = await api<{ ok?: boolean; error?: string }>(editando ? `/clientes/${cliente!.id}` : '/clientes', { method: editando ? 'PUT' : 'POST', body: cuerpo });
      if (r && r.ok === false) throw new Error(r.error || 'No se pudo guardar el cliente');
      haptic('success'); toast(editando ? 'Cliente actualizado' : 'Cliente registrado');
      await qc.invalidateQueries({ queryKey: ['directorio', 'clientes'] });
      if (editando) await qc.invalidateQueries({ queryKey: ['placas'] });
      onGuardado?.(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  const etiquetaDoc = tipo === 'RUC' ? 'RUC' : tipo === 'DNI' ? 'DNI' : 'RUC o DNI';
  return (
    <Sheet ancho open={open} onClose={() => !guardando && onClose()} title={editando ? 'Editar cliente' : 'Nuevo cliente'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button><Button variant="primary" onClick={guardar} loading={guardando}>{editando ? 'Guardar cambios' : 'Registrar cliente'}</Button></>}>
      <div className="os-form">
        {error && <div className="os-form__ancho"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <Seccion icono={<UserRound size={16} />} titulo="Identificación">
          <Field label={`${etiquetaDoc}`} error={ver('doc')}
            hint={busqueda ? undefined : 'Escribe el RUC (11 dígitos) o el DNI (8) y se completan los datos.'}>
            {p => <TextInput {...p} inputMode="numeric" maxLength={11} value={v.doc} placeholder="20XXXXXXXXX o DNI" onBlur={() => tocar('doc')}
              onChange={e => set({ doc: e.target.value.replace(/\D/g, '') })} />}
          </Field>
          {busqueda && (
            <div className={`cl-estado cl-estado--${busqueda.tipo}`} role="status">
              {busqueda.tipo === 'cargando' ? <span className="spinner" aria-hidden /> : busqueda.tipo === 'ok' ? <BadgeCheck size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />}
              <span>{busqueda.texto}</span>
              {(tipo === 'RUC' || tipo === 'DNI') && busqueda.tipo !== 'cargando' && (
                <Button variant="plain" size="sm" icon={<RefreshCw size={14} />} onClick={() => void buscar(v.doc.trim(), true)}>Volver a consultar</Button>
              )}
            </div>
          )}
          <Field label={tipo === 'DNI' ? 'Nombre completo *' : 'Razón social *'} error={ver('razon')}>
            {p => <TextInput {...p} value={v.razon} placeholder={tipo === 'DNI' ? 'Apellidos y nombres' : 'Nombre de la empresa'} onBlur={() => tocar('razon')} onChange={e => set({ razon: e.target.value.toUpperCase() })} />}
          </Field>
          <SegmentedControl block label="Estado" value={v.estado} onChange={x => set({ estado: x })} options={ESTADOS} />
        </Seccion>

        <Seccion icono={<ContactRound size={16} />} titulo="Contacto">
          <Field label="Teléfono" error={ver('telefono')}>{p => <TextInput {...p} inputMode="tel" value={v.telefono} placeholder="999 999 999" onBlur={() => tocar('telefono')} onChange={e => set({ telefono: e.target.value })} />}</Field>
          <Field label="Correo" error={ver('email')}>{p => <TextInput {...p} type="email" value={v.email} placeholder="contacto@empresa.com" onBlur={() => tocar('email')} onChange={e => set({ email: e.target.value })} />}</Field>
        </Seccion>

        <Seccion icono={<MapPin size={16} />} titulo="Domicilio">
          <Field label="Distrito" hint={v.ubigeo ? `Ubigeo ${v.ubigeo}` : 'Se completa con SUNAT; también puedes buscarlo.'}>
            {p => <Combobox {...p} options={ubi.opciones} value={v.ubigeo || null} loading={ubi.cargando} placeholder="Busca por distrito o provincia" onChange={x => set({ ubigeo: x ?? '' })} />}
          </Field>
          <Field label="Dirección">{p => <TextInput {...p} value={v.direccion} placeholder="Calle, número, urbanización" onChange={e => set({ direccion: e.target.value.toUpperCase() })} />}</Field>
        </Seccion>

        <Seccion icono={<StickyNote size={16} />} titulo="Notas">
          <Field label="Notas">{p => <TextInput {...p} value={v.notas} placeholder="Condiciones de pago, contacto de cobranza…" onChange={e => set({ notas: e.target.value })} />}</Field>
        </Seccion>
      </div>
    </Sheet>
  );
}
