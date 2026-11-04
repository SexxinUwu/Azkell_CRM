// Voz del asistente con lo que trae el navegador (sin costo ni servidor):
//   - Dictado: Web Speech API (SpeechRecognition) en español de Perú.
//   - Lectura: speechSynthesis con una voz en español.
// Chrome, Edge y Safari tienen dictado; Firefox no (el botón del micrófono no aparece).
import { useCallback, useEffect, useRef, useState } from 'react';

interface ResultadoVoz { isFinal: boolean; 0: { transcript: string } }
interface EventoVoz { results: ArrayLike<ResultadoVoz> }
interface Reconocedor {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: EventoVoz) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type ConstructorReconocedor = new () => Reconocedor;

function constructorReconocedor(): ConstructorReconocedor | null {
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const CLAVE_LEER = 'fleet_asistente_leer';

/** Quita lo que no se debe leer (markdown, enlaces) y deletrea placas y unidades para que suenen bien. */
export function textoParaVoz(texto: string): string {
  return texto
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>|]/g, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\b([A-Z0-9]{3})-?(\d{3})\b/g, (_, a: string, b: string) => `${a.split('').join(' ')}, ${b.split('').join(' ')},`)
    .replace(/\bkm\/h\b/gi, 'kilómetros por hora')
    .replace(/\bkm\b/gi, 'kilómetros')
    .replace(/\bgl\b/gi, 'galones')
    .replace(/S\/\s?([\d.,]+)/g, '$1 soles')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function elegirVoz(): SpeechSynthesisVoice | null {
  const voces = window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('es'));
  if (!voces.length) return null;
  const puntos = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase().startsWith('es-pe') ? 4 : /es-(us|mx|co|ar|cl)/i.test(v.lang) ? 2 : 0) + (/natural|google|online/i.test(v.name) ? 2 : 0);
  return [...voces].sort((a, b) => puntos(b) - puntos(a))[0];
}

export function useVoz(onDictado: (texto: string) => void) {
  const soporteMic = typeof window !== 'undefined' && !!constructorReconocedor();
  const soporteVoz = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [escuchando, setEscuchando] = useState(false);
  const [hablando, setHablando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [leerSiempre, setLeerSiempre] = useState(() => {
    try { return localStorage.getItem(CLAVE_LEER) === '1'; } catch { return false; }
  });
  const reconocedor = useRef<Reconocedor | null>(null);
  const dictado = useRef(onDictado);
  dictado.current = onDictado;

  const detener = useCallback(() => {
    if (soporteVoz) window.speechSynthesis.cancel();
    setHablando(false);
  }, [soporteVoz]);

  const hablar = useCallback((texto: string) => {
    if (!soporteVoz) return;
    const limpio = textoParaVoz(texto);
    if (!limpio) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(limpio);
    const voz = elegirVoz();
    if (voz) { u.voice = voz; u.lang = voz.lang; } else { u.lang = 'es-PE'; }
    u.rate = 1.02;
    u.onstart = () => setHablando(true);
    u.onend = () => setHablando(false);
    u.onerror = () => setHablando(false);
    window.speechSynthesis.speak(u);
  }, [soporteVoz]);

  const alternarLeer = useCallback(() => {
    setLeerSiempre(v => {
      const n = !v;
      try { localStorage.setItem(CLAVE_LEER, n ? '1' : '0'); } catch { /* sin almacenamiento */ }
      return n;
    });
  }, []);

  const parar = useCallback(() => { reconocedor.current?.stop(); }, []);

  const escuchar = useCallback(() => {
    const Ctor = constructorReconocedor();
    if (!Ctor) return;
    detener();
    setAviso(null); setParcial('');
    const r = new Ctor();
    r.lang = 'es-PE'; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1;
    let final = '';
    r.onresult = (e) => {
      let interino = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interino += t;
      }
      setParcial((final + interino).trim());
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setAviso('Permite el micrófono en el navegador para hablar con el asistente.');
      else if (e.error === 'no-speech') setAviso('No te escuché. Toca el micrófono y habla de nuevo.');
      else if (e.error !== 'aborted') setAviso('No pude escucharte. Intenta de nuevo.');
    };
    r.onend = () => {
      setEscuchando(false); setParcial('');
      reconocedor.current = null;
      const texto = final.trim();
      if (texto) dictado.current(texto);
    };
    reconocedor.current = r;
    try { r.start(); setEscuchando(true); } catch { setAviso('No pude activar el micrófono.'); }
  }, [detener]);

  // Las voces del navegador cargan de forma diferida; al cerrar el panel se corta lo que esté sonando
  useEffect(() => {
    if (!soporteVoz) return;
    window.speechSynthesis.getVoices();
    return () => { window.speechSynthesis.cancel(); reconocedor.current?.abort(); };
  }, [soporteVoz]);

  return { soporteMic, soporteVoz, escuchando, hablando, parcial, aviso, leerSiempre, escuchar, parar, hablar, detener, alternarLeer };
}

export type Voz = ReturnType<typeof useVoz>;
