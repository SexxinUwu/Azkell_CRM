// Preferencias de accesibilidad de este dispositivo. Se guardan en el navegador y se aplican
// al abrir la app, antes de dibujar nada, para que no haya parpadeo.

export interface Preferencias {
  /** Índice en ESCALAS_TEXTO */
  tamano: number;
  negrita: boolean;
  altoContraste: boolean;
  reducirMovimiento: boolean;
  reducirTransparencia: boolean;
  botonesGrandes: boolean;
  vibracion: boolean;
}

export const ESCALAS_TEXTO = [0.9, 1, 1.12, 1.25, 1.4] as const;
export const NOMBRES_TAMANO = ['Pequeño', 'Normal', 'Grande', 'Muy grande', 'Enorme'] as const;

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  tamano: 1,
  negrita: false,
  altoContraste: false,
  reducirMovimiento: false,
  reducirTransparencia: false,
  botonesGrandes: false,
  vibracion: true,
};

const CLAVE = 'fleet_accesibilidad';

export function leerPreferencias(): Preferencias {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Partial<Preferencias> | null;
    return { ...PREFERENCIAS_POR_DEFECTO, ...(guardado ?? {}) };
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

/** Pone las preferencias en el documento: el CSS de accesibilidad se encarga del resto */
export function aplicarPreferencias(p: Preferencias = leerPreferencias()) {
  const raiz = document.documentElement;
  const escala = ESCALAS_TEXTO[Math.min(Math.max(p.tamano, 0), ESCALAS_TEXTO.length - 1)];
  raiz.style.fontSize = `${escala * 100}%`;
  raiz.dataset.negrita = p.negrita ? 'si' : 'no';
  raiz.dataset.contraste = p.altoContraste ? 'alto' : 'normal';
  raiz.dataset.movimiento = p.reducirMovimiento ? 'reducido' : 'normal';
  raiz.dataset.transparencia = p.reducirTransparencia ? 'reducida' : 'normal';
  raiz.dataset.tactil = p.botonesGrandes ? 'grande' : 'normal';
}

export function guardarPreferencias(p: Preferencias) {
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento: vale solo esta sesión */ }
  aplicarPreferencias(p);
}

/** Vibración al tocar: lo consulta el módulo de háptica */
export function vibracionActiva(): boolean {
  return leerPreferencias().vibracion;
}
