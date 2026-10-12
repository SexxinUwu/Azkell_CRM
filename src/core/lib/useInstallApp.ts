import { useCallback, useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Estado de instalación de la app (PWA).
// - Android / Chrome / Edge: el navegador ofrece el diálogo nativo (`beforeinstallprompt`).
// - iPhone / iPad (Safari): no hay diálogo; hay que usar Compartir → "Añadir a pantalla de inicio".
export function useInstallApp() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const standalone = typeof window !== 'undefined'
    && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setEvent(null);
  }, [event]);

  return {
    /** Ya corre como app instalada */
    standalone: standalone || installed,
    /** Se puede instalar con un toque */
    canPrompt: !!event,
    /** Hay que explicar los pasos de Safari */
    needsIosSteps: isIos && !standalone,
    install,
  };
}
