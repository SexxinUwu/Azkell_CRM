import { useCallback, useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let promptEventGlobal: InstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    promptEventGlobal = e as InstallPromptEvent;
  });
}

// Estado de instalación de la app (PWA).
// - Android / Chrome / Edge: el navegador ofrece el diálogo nativo (`beforeinstallprompt`).
// - iPhone / iPad (Safari): no hay diálogo; hay que usar Compartir → "Añadir a pantalla de inicio".
export function useInstallApp() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(() => promptEventGlobal);
  const [installed, setInstalled] = useState(false);

  const standalone = typeof window !== 'undefined'
    && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      promptEventGlobal = e as InstallPromptEvent;
      setEvent(promptEventGlobal);
    };
    const onInstalled = () => {
      promptEventGlobal = null;
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const p = event || promptEventGlobal;
    if (!p) return false;
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    promptEventGlobal = null;
    setEvent(null);
    return outcome === 'accepted';
  }, [event]);

  return {
    /** Ya corre como app instalada */
    standalone: standalone || installed,
    /** Se puede instalar con un toque */
    canPrompt: !!(event || promptEventGlobal),
    /** En dispositivo Apple (iPhone/iPad) */
    isIos,
    /** En dispositivo Android */
    isAndroid,
    /** Hay que explicar los pasos de Safari */
    needsIosSteps: isIos && !standalone,
    install,
  };
}
