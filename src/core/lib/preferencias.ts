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

export const ESCALAS_TEXTO = [0.9, 1, 1.15, 1.2, 1.4] as const;
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

export type ClavePerfil = 'predeterminado' | 'taller' | 'lectura';

/** Perfiles de un toque para cada tipo de usuario. Conservan la vibración de la preferencia actual. */
export const PERFILES: Record<ClavePerfil, { titulo: string; detalle: string; valores: Omit<Preferencias, 'vibracion'> }> = {
  predeterminado: {
    titulo: 'Predeterminado',
    detalle: 'Valores estándar',
    valores: { tamano: 1, negrita: false, altoContraste: false, reducirMovimiento: false, reducirTransparencia: false, botonesGrandes: false },
  },
  taller: {
    titulo: 'Taller / Patio',
    detalle: 'Sol, guantes y mecánicos',
    valores: { tamano: 3, negrita: false, altoContraste: true, reducirMovimiento: false, reducirTransparencia: false, botonesGrandes: true },
  },
  lectura: {
    titulo: 'Lectura / Reportes',
    detalle: 'Tablas densas y reportes',
    valores: { tamano: 2, negrita: true, altoContraste: false, reducirMovimiento: false, reducirTransparencia: true, botonesGrandes: false },
  },
};

/** Clave del perfil que coincide exactamente con las preferencias, o null si no hay ninguno */
export function perfilActivo(p: Preferencias): ClavePerfil | null {
  const claves = Object.keys(PERFILES) as ClavePerfil[];
  return claves.find(k => {
    const { valores } = PERFILES[k];
    return (Object.keys(valores) as (keyof typeof valores)[]).every(c => valores[c] === p[c]);
  }) ?? null;
}

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
