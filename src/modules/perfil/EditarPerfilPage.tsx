import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, CircleAlert, Eraser, ImagePlus } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';
import { Avatar, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Button } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { Firma, type FirmaHandle } from '../inspecciones/Firma';
import { guardarMiPerfil, subirImagenPerfil, useMiPerfil } from './perfilApi';

// Editar perfil y foto dentro de la app nueva (antes abría el perfil de la versión actual).
// Mismos campos y endpoints que esa pantalla: nombre, teléfono, foto, portada y firma digital.
export function EditarPerfilPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const perfil = useMiPerfil();
  const firma = useRef<FirmaHandle>(null);
  const inputFoto = useRef<HTMLInputElement>(null);
  const inputPortada = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [firmaNueva, setFirmaNueva] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState<'foto' | 'portada' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rellena el formulario una sola vez con los datos guardados
  const [cargado, setCargado] = useState(false);
  useEffect(() => {
    if (!perfil.data || cargado) return;
    setNombre(perfil.data.nombre ?? '');
    setTelefono(perfil.data.telefono ?? '');
    setCargado(true);
  }, [perfil.data, cargado]);

  const datos = perfil.data;

  async function refrescarSesion() {
    await Promise.all([qc.invalidateQueries({ queryKey: ['perfil'] }), refresh()]);
  }

  async function subirImagen(tipo: 'foto' | 'portada', archivo: File) {
    setSubiendo(tipo); setError(null);
    try {
      const url = await subirImagenPerfil(archivo);
      await guardarMiPerfil(tipo === 'foto' ? { avatar_url: url } : { banner_url: url });
      haptic('success');
      toast(tipo === 'foto' ? 'Foto actualizada.' : 'Portada actualizada.');
      await refrescarSesion();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setSubiendo(null); }
  }

  async function guardar() {
    if (!nombre.trim()) { setError('El nombre no puede quedar vacío.'); return; }
    setGuardando(true); setError(null);
    try {
      const cambios: Record<string, string | null> = { nombre: nombre.trim(), telefono: telefono.trim() };
      // La firma solo se envía si se dibujó una nueva; si no, se conserva la guardada
      if (firmaNueva && firma.current && !firma.current.vacia()) cambios.firma_digital = firma.current.obtener();
      await guardarMiPerfil(cambios);
      haptic('success');
      toast('Perfil guardado.');
      await refrescarSesion();
      navigate('/perfil');
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  if (perfil.isLoading) return <Page narrow><p className="c-secondary">Cargando…</p></Page>;
  if (perfil.isError || !datos) return <Page narrow><Notice tone="error" icon={<CircleAlert size={16} />}>{errorMessage(perfil.error)}</Notice></Page>;

  return (
    <Page narrow>
      <button type="button" className="btn btn--plain" onClick={() => navigate('/perfil')} style={{ marginBottom: 'var(--s-2)' }}>
        <ArrowLeft size={16} /> Mi cuenta
      </button>
      <PageHeader eyebrow="Cuenta" title="Editar perfil"
        actions={<Button variant="primary" onClick={guardar} loading={guardando} disabled={subiendo !== null}>Guardar</Button>} />

      {error && <div style={{ marginBottom: 'var(--s-4)' }}><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

      {/* Portada y foto */}
      <div className="list">
        <div style={{
          height: 120, borderRadius: 'var(--r-md)', position: 'relative', overflow: 'hidden',
          background: datos.banner_url ? `center / cover no-repeat url("${datos.banner_url}")` : 'linear-gradient(135deg, #3b82f6, #ec4899)',
        }}>
          <button type="button" className="btn btn--plain" onClick={() => inputPortada.current?.click()}
            disabled={subiendo !== null} style={{ position: 'absolute', right: 'var(--s-3)', bottom: 'var(--s-3)', background: 'var(--surface)' }}>
            <ImagePlus size={16} /> {subiendo === 'portada' ? 'Subiendo…' : 'Cambiar portada'}
          </button>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <Avatar name={nombre || datos.nombre} size="lg" accent src={datos.avatar_url} />
          <div className="row__main">
            <div className="row__title">{nombre || datos.nombre}</div>
            <div className="row__subtitle">{datos.cargo || 'Usuario del sistema'}</div>
          </div>
          <Button variant="secondary" onClick={() => inputFoto.current?.click()} disabled={subiendo !== null}>
            <Camera size={16} /> {subiendo === 'foto' ? 'Subiendo…' : 'Cambiar foto'}
          </Button>
        </div>
      </div>
      <input ref={inputFoto} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subirImagen('foto', f); }} />
      <input ref={inputPortada} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subirImagen('portada', f); }} />

      {/* Datos personales */}
      <div className="list__header" style={{ marginTop: 'var(--s-6)' }}>Información personal</div>
      <div className="form-grid" style={{ marginBottom: 'var(--s-4)' }}>
        <Field label="Nombre completo" wide>
          {p => <TextInput {...p} value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="name" />}
        </Field>
        <Field label="Correo (inicio de sesión)" wide hint="Solo Soporte puede cambiarlo.">
          {p => <TextInput {...p} value={datos.correo} disabled />}
        </Field>
        <Field label="Teléfono / anexo" wide>
          {p => <TextInput {...p} value={telefono} onChange={e => setTelefono(e.target.value)} inputMode="tel" autoComplete="tel" />}
        </Field>
      </div>

      {/* Firma digital */}
      <div className="list__header" style={{ marginTop: 'var(--s-6)' }}>Firma digital</div>
      <div className="list" style={{ padding: 'var(--s-4)' }}>
        <p className="c-secondary" style={{ marginTop: 0 }}>
          {datos.firma_digital ? 'Tienes una firma guardada. Dibuja una nueva solo si quieres reemplazarla.' : 'Dibuja tu firma para documentos y reportes del ERP.'}
        </p>
        {datos.firma_digital && !firmaNueva && (
          <img src={datos.firma_digital} alt="Firma guardada" style={{ maxWidth: '100%', height: 'auto', background: '#fff', borderRadius: 'var(--r-sm)', marginBottom: 'var(--s-3)' }} />
        )}
        <Firma ref={firma} onCambio={setFirmaNueva} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--s-3)' }}>
          <Button variant="secondary" onClick={() => { firma.current?.limpiar(); setFirmaNueva(false); }}>
            <Eraser size={16} /> Limpiar
          </Button>
        </div>
      </div>
    </Page>
  );
}
