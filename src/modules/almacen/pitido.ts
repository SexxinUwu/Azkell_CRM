// Pitidos cortos al escanear (sin archivos de sonido): agudo = bien, grave = error
let audio: AudioContext | null = null;
export function pitido(ok: boolean) {
  try {
    audio = audio ?? new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = ok ? 1100 : 220;
    o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.18, audio.currentTime);
    o.start(); o.stop(audio.currentTime + (ok ? 0.09 : 0.28));
  } catch { /* sin audio */ }
}
