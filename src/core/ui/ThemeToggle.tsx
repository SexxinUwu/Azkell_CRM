import { useSyncExternalStore } from 'react';
import { Moon, MonitorSmartphone, Sun } from 'lucide-react';
import { esOscuro, guardarTema, suscribirTema, temaGuardado, type Tema } from '../lib/theme';
import { haptic } from '../lib/haptics';

const OPCIONES: { value: Tema; label: string; icon: typeof Sun }[] = [
  { value: 'claro', label: 'Claro', icon: Sun },
  { value: 'oscuro', label: 'Oscuro', icon: Moon },
  { value: 'auto', label: 'Automático', icon: MonitorSmartphone },
];

export function useTema() {
  return useSyncExternalStore(suscribirTema, temaGuardado, () => 'claro' as Tema);
}

/** Selector de tema con tres opciones (Ajustes y Mi cuenta) */
export function ThemeSelector() {
  const tema = useTema();
  return (
    <>
    <div className="theme-selector" role="radiogroup" aria-label="Tema de la app">
      {OPCIONES.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={tema === o.value}
          className={`theme-selector__op${tema === o.value ? ' theme-selector__op--sel' : ''}`}
          onClick={() => { haptic('selection'); guardarTema(o.value); }}>
          <o.icon size={18} strokeWidth={1.9} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
    {tema === 'auto' && (
      <p className="c-secondary" style={{ margin: 0, padding: '0 var(--s-4) var(--s-3)', fontSize: '0.8125rem' }}>
        Sigue la configuración de tu dispositivo: ahora se ve {esOscuro('auto') ? 'oscuro' : 'claro'}.
      </p>
    )}
    </>
  );
}

/** Botón rápido claro ↔ oscuro (barra lateral y barra superior) */
export function ThemeButton({ className = 'btn btn--plain btn--icon' }: { className?: string }) {
  const tema = useTema();
  const oscuro = esOscuro(tema);
  return (
    <button type="button" className={className} aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={oscuro ? 'Modo claro' : 'Modo oscuro'}
      onClick={() => { haptic('selection'); guardarTema(oscuro ? 'claro' : 'oscuro'); }}>
      {oscuro ? <Sun size={18} strokeWidth={1.9} /> : <Moon size={18} strokeWidth={1.9} />}
    </button>
  );
}
