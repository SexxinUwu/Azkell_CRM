import './configuracion.css';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ImagePlus } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

type Datos = Record<string, string>;

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Claves de configuración de la empresa (tabla configuracion_erp) */
const CAMPOS = ['empresa_nombre', 'empresa_razon_social', 'empresa_ruc', 'empresa_direccion', 'empresa_telefono', 'empresa_correo', 'empresa_moneda'] as const;

export function ConfiguracionEmpresaPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const cfg = useQuery<Datos>({ queryKey: ['sistema', 'config-empresa'], queryFn: () => api('/configuracion') });
  const [form, setForm] = useState<Datos>({});
  const [errores, setErrores] = useState<Partial<Record<string, string>>>({});
  const [logoNuevo, setLogoNuevo] = useState<string | null>(null);

  // Se carga una vez por visita: un refresco de la consulta no debe pisar lo que el usuario está escribiendo
  useEffect(() => {
    if (cfg.data) setForm(f => (Object.keys(f).length ? f : { ...cfg.data }));
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
      await qc.invalidateQueries({ queryKey: ['sistema', 'config-empresa'] });
    },
    onError: err => { toast(errorMessage(err), 'error'); haptic('warning'); },
  });

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
  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Page>
      <PageHeader
        eyebrow="Configuración"
        title="Empresa"
        subtitle="Datos fiscales y de contacto que aparecen en documentos y reportes."
        actions={<Button variant="primary" disabled={!hayCambios} loading={guardar.isPending}
          onClick={() => { if (validar()) guardar.mutate(cambios); }}>Guardar</Button>}
      />

      {cfg.isLoading ? <PageLoader /> : cfg.isError ? (
        <Notice tone="error">{errorMessage(cfg.error)}</Notice>
      ) : (
        <div className="cfg-grid">
          <section className="cfg-tarjeta cfg-logo">
            <div className="cfg-logo__vista">
              {logoMostrado
                ? <img src={logoMostrado} alt="Logo de la empresa" />
                : <Building2 size={36} aria-hidden />}
            </div>
            <label className="cfg-boton-secundario">
              <ImagePlus size={16} /> {logoMostrado ? 'Cambiar logo' : 'Subir logo'}
              <input type="file" accept="image/*" hidden onChange={e => elegirLogo(e.target.files?.[0])} />
            </label>
            <p className="cfg-ayuda">PNG o JPG, hasta 2 MB.</p>
          </section>

          <section className="cfg-tarjeta">
            <div className="form-grid">
              <Field label="Nombre comercial" error={errores.empresa_nombre} wide>
                {p => <TextInput {...p} value={form.empresa_nombre ?? ''} onChange={e => set('empresa_nombre')(e.target.value)} />}
              </Field>
              <Field label="Razón social" wide>
                {p => <TextInput {...p} value={form.empresa_razon_social ?? ''} onChange={e => set('empresa_razon_social')(e.target.value)} />}
              </Field>
              <Field label="RUC" error={errores.empresa_ruc}>
                {p => <TextInput {...p} inputMode="numeric" value={form.empresa_ruc ?? ''}
                  onChange={e => set('empresa_ruc')(e.target.value.replace(/\D/g, '').slice(0, 11))} />}
              </Field>
              <Field label="Moneda principal">
                {p => (
                  <SelectInput {...p} value={form.empresa_moneda || 'PEN'} onChange={e => set('empresa_moneda')(e.target.value)}>
                    <option value="PEN">Soles (S/)</option>
                    <option value="USD">Dólares (US$)</option>
                  </SelectInput>
                )}
              </Field>
              <Field label="Dirección" wide>
                {p => <TextInput {...p} value={form.empresa_direccion ?? ''} onChange={e => set('empresa_direccion')(e.target.value)} />}
              </Field>
              <Field label="Teléfono">
                {p => <TextInput {...p} inputMode="tel" value={form.empresa_telefono ?? ''} onChange={e => set('empresa_telefono')(e.target.value)} />}
              </Field>
              <Field label="Correo" error={errores.empresa_correo}>
                {p => <TextInput {...p} inputMode="email" value={form.empresa_correo ?? ''} onChange={e => set('empresa_correo')(e.target.value)} />}
              </Field>
            </div>
            <p className="cfg-ayuda">Las sedes se configurarán cuando se defina cómo se registran.</p>
          </section>
        </div>
      )}
    </Page>
  );
}
