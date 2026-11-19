import './empresa.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BadgeCheck, Building2, CircleAlert, ImagePlus, Loader2, MapPin, Search, Undo2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

type Datos = Record<string, string>;

interface InfoRuc {
  ruc: string; razon_social: string; direccion: string; estado: string; condicion: string;
}

type Consulta =
  | { estado: 'reposo' }
  | { estado: 'cargando' }
  | { estado: 'ok'; info: InfoRuc; anterior: Datos }
  | { estado: 'error'; mensaje: string };

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Claves de configuración de la empresa (tabla configuracion_erp) */
const CAMPOS = ['empresa_nombre', 'empresa_razon_social', 'empresa_ruc', 'empresa_direccion', 'empresa_telefono', 'empresa_correo', 'empresa_moneda'] as const;

const MONEDAS = [{ v: 'PEN', t: 'Soles', s: 'S/' }, { v: 'USD', t: 'Dólares', s: 'US$' }];

// Sistema › Empresa: datos fiscales y de contacto. Al escribir el RUC se completan razón social y dirección desde SUNAT.
export function ConfiguracionEmpresaPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const sinMovimiento = useReducedMotion();
  const cfg = useQuery<Datos>({ queryKey: ['sistema', 'config-empresa'], queryFn: () => api('/configuracion') });
  const [form, setForm] = useState<Datos>({});
  const [errores, setErrores] = useState<Partial<Record<string, string>>>({});
  const [logoNuevo, setLogoNuevo] = useState<string | null>(null);
  const [consulta, setConsulta] = useState<Consulta>({ estado: 'reposo' });
  const formActual = useRef<Datos>({});
  formActual.current = form;
  const ultimoRuc = useRef('');
  const pedido = useRef(0);

  // Se carga una vez por visita: un refresco de la consulta no debe pisar lo que el usuario está escribiendo
  useEffect(() => {
    if (!cfg.data) return;
    setForm(f => {
      if (Object.keys(f).length) return f;
      ultimoRuc.current = (cfg.data.empresa_ruc ?? '').trim();
      return { ...cfg.data };
    });
  }, [cfg.data]);

  const original = cfg.data ?? {};
  const cambios = useMemo(() => {
    const out: Datos = {};
    for (const c of CAMPOS) if ((form[c] ?? '') !== (original[c] ?? '')) out[c] = (form[c] ?? '').trim();
    if (logoNuevo) out.empresa_logo = logoNuevo;
    return out;
  }, [form, original, logoNuevo]);
  const hayCambios = Object.keys(cambios).length > 0;

  const guardar = useMutation({
    mutationFn: (body: Datos) => api('/configuracion', { method: 'POST', body }),
    onSuccess: async () => {
      haptic('success');
      toast('Datos de la empresa guardados');
      setLogoNuevo(null);
      setConsulta({ estado: 'reposo' });
      await qc.invalidateQueries({ queryKey: ['sistema', 'config-empresa'] });
    },
    onError: err => { toast(errorMessage(err), 'error'); haptic('warning'); },
  });

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  /** Pide los datos del RUC a SUNAT y completa el formulario. El nombre comercial solo se llena si está vacío. */
  async function consultarRuc(ruc: string) {
    const id = ++pedido.current;
    ultimoRuc.current = ruc;
    setConsulta({ estado: 'cargando' });
    try {
      const info = await api<InfoRuc>(`/consulta-ruc/${ruc}`);
      if (id !== pedido.current) return;
      const f = formActual.current;
      setConsulta({ estado: 'ok', info, anterior: { ...f } });
      setForm({
        ...f,
        empresa_razon_social: info.razon_social,
        empresa_direccion: info.direccion || f.empresa_direccion || '',
        empresa_nombre: (f.empresa_nombre ?? '').trim() ? f.empresa_nombre : info.razon_social,
      });
      setErrores(e => ({ ...e, empresa_ruc: undefined }));
      haptic('success');
    } catch (err) {
      if (id !== pedido.current) return;
      setConsulta({ estado: 'error', mensaje: errorMessage(err) });
      haptic('warning');
    }
  }

  function cambiarRuc(valor: string) {
    const ruc = valor.replace(/\D/g, '').slice(0, 11);
    set('empresa_ruc')(ruc);
    setErrores(e => ({ ...e, empresa_ruc: undefined }));
    if (ruc.length < 11) { pedido.current++; setConsulta({ estado: 'reposo' }); ultimoRuc.current = ''; return; }
    if (ruc !== ultimoRuc.current) void consultarRuc(ruc);
  }

  function deshacerConsulta() {
    if (consulta.estado !== 'ok') return;
    setForm(consulta.anterior);
    setConsulta({ estado: 'reposo' });
  }

  function descartar() {
    setForm({ ...original });
    setLogoNuevo(null);
    setErrores({});
    setConsulta({ estado: 'reposo' });
    ultimoRuc.current = (original.empresa_ruc ?? '').trim();
  }

  function validar(): boolean {
    const e: Partial<Record<string, string>> = {};
    const ruc = (form.empresa_ruc ?? '').trim();
    if (ruc && !/^\d{11}$/.test(ruc)) e.empresa_ruc = 'El RUC tiene 11 dígitos.';
    const correo = (form.empresa_correo ?? '').trim();
    if (correo && !CORREO.test(correo)) e.empresa_correo = 'Revisa el correo.';
    if (!(form.empresa_nombre ?? '').trim()) e.empresa_nombre = 'El nombre de la empresa es obligatorio.';
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  function elegirLogo(archivo: File | undefined) {
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) { toast('Elige una imagen', 'error'); return; }
    if (archivo.size > LOGO_MAX_BYTES) { toast('El logo pesa más de 2 MB', 'error'); return; }
    const lector = new FileReader();
    lector.onload = () => setLogoNuevo(String(lector.result));
    lector.readAsDataURL(archivo);
  }

  const logoMostrado = logoNuevo ?? form.empresa_logo ?? '';
  const rucCompleto = (form.empresa_ruc ?? '').length === 11;
  const resorte = sinMovimiento ? { duration: 0 } : { type: 'spring' as const, bounce: 0, duration: 0.4 };

  return (
    <Page>
      <PageHeader
        eyebrow="Configuración"
        title="Empresa"
        subtitle="Datos fiscales y de contacto que aparecen en documentos y reportes."
      />

      {cfg.isLoading ? <PageLoader /> : cfg.isError ? (
        <Notice tone="error">{errorMessage(cfg.error)}</Notice>
      ) : (
        <div className="emp-grid">
          {/* Identidad: el logo y el nombre tal como saldrán en los documentos */}
          <aside className="emp-hero">
            <label className="emp-logo" title={logoMostrado ? 'Cambiar logo' : 'Subir logo'}>
              {logoMostrado
                ? <img src={logoMostrado} alt="Logo de la empresa" />
                : <Building2 size={40} aria-hidden />}
              <span className="emp-logo__cambiar"><ImagePlus size={16} /> {logoMostrado ? 'Cambiar' : 'Subir logo'}</span>
              <input type="file" accept="image/*" hidden onChange={e => elegirLogo(e.target.files?.[0])} />
            </label>
            <div className="emp-hero__nombre">
              <strong>{(form.empresa_nombre ?? '').trim() || 'Tu empresa'}</strong>
              <span>{(form.empresa_razon_social ?? '').trim() || 'Razón social sin completar'}</span>
            </div>
            {rucCompleto && <span className="emp-hero__ruc">RUC {form.empresa_ruc}</span>}
            <p className="emp-ayuda">PNG o JPG, hasta 2 MB. Sale en órdenes de trabajo, órdenes de compra y reportes.</p>
          </aside>

          <div className="emp-columna">
            {/* RUC primero: completa lo demás */}
            <section className="emp-grupo">
              <h2 className="emp-grupo__titulo">Identificación fiscal</h2>
              <div className="emp-ruc">
                <Field label="RUC" error={errores.empresa_ruc} hint={consulta.estado === 'reposo' && !rucCompleto ? 'Escribe los 11 dígitos y completamos los datos desde SUNAT.' : undefined}>
                  {p => (
                    <div className="emp-ruc__caja">
                      <TextInput {...p} inputMode="numeric" autoComplete="off" placeholder="20123456789" value={form.empresa_ruc ?? ''}
                        onChange={e => cambiarRuc(e.target.value)} />
                      <button type="button" className="emp-ruc__boton" disabled={!rucCompleto || consulta.estado === 'cargando'}
                        onClick={() => void consultarRuc(form.empresa_ruc ?? '')} aria-label="Consultar en SUNAT">
                        {consulta.estado === 'cargando' ? <Loader2 size={16} className="emp-giro" /> : <Search size={16} />}
                        <span>SUNAT</span>
                      </button>
                    </div>
                  )}
                </Field>

                <AnimatePresence initial={false} mode="wait">
                  {consulta.estado === 'ok' && (
                    <motion.div key="ok" className="emp-resultado emp-resultado--ok"
                      initial={{ opacity: 0, y: sinMovimiento ? 0 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={resorte}>
                      <BadgeCheck size={18} aria-hidden />
                      <div className="emp-resultado__texto">
                        <strong>Datos cargados desde SUNAT</strong>
                        <span>
                          {consulta.info.estado && <em className={`emp-pildora${consulta.info.estado === 'ACTIVO' ? ' emp-pildora--ok' : ' emp-pildora--aviso'}`}>{consulta.info.estado}</em>}
                          {consulta.info.condicion && <em className={`emp-pildora${consulta.info.condicion === 'HABIDO' ? ' emp-pildora--ok' : ' emp-pildora--aviso'}`}>{consulta.info.condicion}</em>}
                        </span>
                      </div>
                      <button type="button" className="emp-texto-boton" onClick={deshacerConsulta}><Undo2 size={14} /> Deshacer</button>
                    </motion.div>
                  )}
                  {consulta.estado === 'error' && (
                    <motion.div key="error" className="emp-resultado emp-resultado--error" role="alert"
                      initial={{ opacity: 0, y: sinMovimiento ? 0 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={resorte}>
                      <CircleAlert size={18} aria-hidden />
                      <div className="emp-resultado__texto"><strong>{consulta.mensaje}</strong></div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="emp-campos">
                <Field label="Razón social" wide>
                  {p => <TextInput {...p} value={form.empresa_razon_social ?? ''} onChange={e => set('empresa_razon_social')(e.target.value)} />}
                </Field>
                <Field label="Nombre comercial" error={errores.empresa_nombre} hint="Es el nombre que se ve en la barra y los documentos." wide>
                  {p => <TextInput {...p} value={form.empresa_nombre ?? ''} onChange={e => set('empresa_nombre')(e.target.value)} />}
                </Field>
              </div>
            </section>

            <section className="emp-grupo">
              <h2 className="emp-grupo__titulo"><MapPin size={14} aria-hidden /> Contacto</h2>
              <div className="emp-campos">
                <Field label="Dirección fiscal" wide>
                  {p => <TextInput {...p} autoComplete="street-address" value={form.empresa_direccion ?? ''} onChange={e => set('empresa_direccion')(e.target.value)} />}
                </Field>
                <Field label="Teléfono">
                  {p => <TextInput {...p} inputMode="tel" autoComplete="tel" value={form.empresa_telefono ?? ''} onChange={e => set('empresa_telefono')(e.target.value)} />}
                </Field>
                <Field label="Correo" error={errores.empresa_correo}>
                  {p => <TextInput {...p} inputMode="email" autoComplete="email" value={form.empresa_correo ?? ''} onChange={e => set('empresa_correo')(e.target.value)} />}
                </Field>
              </div>
            </section>

            <section className="emp-grupo">
              <h2 className="emp-grupo__titulo">Moneda principal</h2>
              <div className="emp-segmentos" role="radiogroup" aria-label="Moneda principal">
                {MONEDAS.map(m => {
                  const activa = (form.empresa_moneda || 'PEN') === m.v;
                  return (
                    <button key={m.v} type="button" role="radio" aria-checked={activa} className={`emp-segmento${activa ? ' emp-segmento--on' : ''}`}
                      onClick={() => { set('empresa_moneda')(m.v); haptic('selection'); }}>
                      {activa && <motion.span layoutId="emp-moneda" className="emp-segmento__fondo" transition={resorte} />}
                      <span className="emp-segmento__texto"><b>{m.s}</b> {m.t}</span>
                    </button>
                  );
                })}
              </div>
              <p className="emp-ayuda">Las sedes se configurarán cuando se defina cómo se registran.</p>
            </section>
          </div>
        </div>
      )}

      {/* Barra de cambios: aparece solo cuando hay algo por guardar */}
      <AnimatePresence>
        {hayCambios && (
          <motion.div className="emp-barra" role="region" aria-label="Cambios sin guardar"
            initial={{ opacity: 0, y: sinMovimiento ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: sinMovimiento ? 0 : 24 }} transition={resorte}>
            <span className="emp-barra__texto">Cambios sin guardar</span>
            <Button variant="secondary" onClick={descartar} disabled={guardar.isPending}>Descartar</Button>
            <Button variant="primary" loading={guardar.isPending} onClick={() => { if (validar()) guardar.mutate(cambios); }}>Guardar</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}
