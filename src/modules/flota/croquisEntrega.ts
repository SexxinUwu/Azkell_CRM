// Croquis de la configuración del vehículo para el acta de entrega.
// Portado de la versión actual (Modulos/flota/entrega-vehiculos/logica.js): mismos dibujos SVG, en TypeScript.
export type ConfigCroquis = 'T3' | 'T2' | 'C3' | 'C2' | 'S3' | 'S2' | 'R2';
export type EstiloCabina = 'chata' | 'trompa';

export const CONFIG_CROQUIS: Record<ConfigCroquis, { nombre: string; desc: string; esMotor: boolean; tieneCarroceria: boolean }> = {
  T3: { nombre: 'Tractocamión T3 (6x4 / 6x2)', desc: 'Tractocamión de 3 Ejes (1 Direccional + Tándem Trasero) con Quinta Rueda', esMotor: true, tieneCarroceria: false },
  T2: { nombre: 'Tractocamión T2 (4x2)', desc: 'Tractocamión de 2 Ejes (1 Direccional + 1 Motriz Trasero) con Quinta Rueda', esMotor: true, tieneCarroceria: false },
  C3: { nombre: 'Camión Rígido C3 (6x4 / 6x2)', desc: 'Camión Rígido de 3 Ejes con Carrocería Integrada', esMotor: true, tieneCarroceria: true },
  C2: { nombre: 'Camión Rígido C2 (4x2)', desc: 'Camión Rígido de 2 Ejes para Distribución', esMotor: true, tieneCarroceria: true },
  S3: { nombre: 'Semirremolque S3 (3 Ejes Trídem)', desc: 'Semirremolque de 3 Ejes (Trídem) con Perno Rey y Patas de Apoyo', esMotor: false, tieneCarroceria: true },
  S2: { nombre: 'Semirremolque S2 (2 Ejes Tándem)', desc: 'Semirremolque de 2 Ejes (Tándem) con Perno Rey y Patas de Apoyo', esMotor: false, tieneCarroceria: true },
  R2: { nombre: 'Remolque R2 (2 Ejes con Lanza)', desc: 'Remolque Equilibrado de 2 Ejes con Barra de Tiro (Lanza) y Tornamesa', esMotor: false, tieneCarroceria: true },
};

/** Convierte lo que se escribió en la configuración de la unidad al código del croquis (igual que la versión actual) */
export function normalizarConfig(texto: string | null | undefined): ConfigCroquis {
  const code = String(texto ?? 'T3').toUpperCase().trim();
  if (code === '6X4' || code === '6X2' || code.includes('T3')) return 'T3';
  if (code === '4X2' || code.includes('T2')) return 'T2';
  if (code.includes('C3') || code.includes('VOLQUETE')) return 'C3';
  if (code.includes('C2')) return 'C2';
  if (code.includes('S3') || code.includes('SE3') || code.includes('3 EJES')) return 'S3';
  if (code.includes('S2') || code.includes('SE2') || code.includes('2 EJES')) return 'S2';
  if (code.includes('R2') || code.includes('REMOLQUE') || code.includes('CARRETA')) return 'R2';
  return 'T3';
}

/** SVG completo del croquis: la línea de suelo, los degradados y el dibujo de la configuración */
export function svgCroquis(config: ConfigCroquis, estiloCabina: EstiloCabina, furgon: boolean, { fondo = false } = {}): string {
  const chata = estiloCabina === 'chata';
  let svg = `
    <svg viewBox="0 0 920 340" width="100%" style="display:block;max-width:820px;margin:0 auto;" xmlns="http://www.w3.org/2000/svg"${fondo ? ' style="background:#ffffff"' : ''}>
      <defs>
        <linearGradient id="evChassisGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#475569" /><stop offset="100%" stop-color="#1e293b" /></linearGradient>
        <linearGradient id="evCabGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff" /><stop offset="60%" stop-color="#f8fafc" /><stop offset="100%" stop-color="#e2e8f0" /></linearGradient>
        <linearGradient id="evGlassGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#bae6fd" /><stop offset="100%" stop-color="#38bdf8" /></linearGradient>
        <linearGradient id="evFuelGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#cbd5e1" /><stop offset="50%" stop-color="#94a3b8" /><stop offset="100%" stop-color="#64748b" /></linearGradient>
        <linearGradient id="evTireGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#334155" /><stop offset="100%" stop-color="#0f172a" /></linearGradient>
        <linearGradient id="evBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff" /><stop offset="70%" stop-color="#f1f5f9" /><stop offset="100%" stop-color="#e2e8f0" /></linearGradient>
      </defs>
      <line x1="40" y1="295" x2="880" y2="295" stroke="#cbd5e1" stroke-width="2.5" stroke-dasharray="8 6" />
  `;
  if (config === 'T3') svg += _evRenderTracto(3, chata);
  else if (config === 'T2') svg += _evRenderTracto(2, chata);
  else if (config === 'C3') svg += _evRenderCamionRigido(3, chata, furgon);
  else if (config === 'C2') svg += _evRenderCamionRigido(2, chata, furgon);
  else if (config === 'S3') svg += _evRenderSemirremolque(3, furgon);
  else if (config === 'S2') svg += _evRenderSemirremolque(2, furgon);
  else if (config === 'R2') svg += _evRenderRemolqueR2(furgon);
  return svg + '</svg>';
}

function _evRenderWheel(cx: number, cy: number, label: string): string {
    return `
        <g>
            <circle cx="${cx}" cy="${cy}" r="43" fill="url(#evTireGrad)" stroke="#020617" stroke-width="2.8" />
            <circle cx="${cx}" cy="${cy}" r="37" fill="none" stroke="#475569" stroke-width="1.5" stroke-dasharray="4 3" />
            <circle cx="${cx}" cy="${cy}" r="26" fill="#f1f5f9" stroke="#64748b" stroke-width="2" />
            <circle cx="${cx}" cy="${cy}" r="20" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5" />
            <circle cx="${cx}" cy="${cy}" r="9" fill="#1e293b" />
            <circle cx="${cx - 13}" cy="${cy}" r="2.2" fill="#475569" />
            <circle cx="${cx + 13}" cy="${cy}" r="2.2" fill="#475569" />
            <circle cx="${cx}" cy="${cy - 13}" r="2.2" fill="#475569" />
            <circle cx="${cx}" cy="${cy + 13}" r="2.2" fill="#475569" />
            <circle cx="${cx - 9}" cy="${cy - 9}" r="2.2" fill="#475569" />
            <circle cx="${cx + 9}" cy="${cy + 9}" r="2.2" fill="#475569" />
            <circle cx="${cx - 9}" cy="${cy + 9}" r="2.2" fill="#475569" />
            <circle cx="${cx + 9}" cy="${cy - 9}" r="2.2" fill="#475569" />
            <circle cx="${cx}" cy="${cy}" r="3.5" fill="#94a3b8" stroke="#334155" stroke-width="1"/>
            <text x="${cx}" y="${cy + 58}" font-size="9.5" font-weight="700" fill="#475569" text-anchor="middle" font-family="'Inter', sans-serif">${label}</text>
        </g>
    `;
}

function _evRenderCabinaChata(startX: number): string {
    return `
        <g id="cabinaChata">
            <path d="M ${startX} 245 L ${startX} 125 Q ${startX + 2} 80 ${startX + 40} 76 L ${startX + 165} 76 Q ${startX + 180} 80 ${startX + 185} 92 L ${startX + 185} 245 Z" fill="url(#evCabGrad)" stroke="#1e293b" stroke-width="2.5" />
            <path d="M ${startX + 35} 76 Q ${startX + 95} 60 ${startX + 190} 62 L ${startX + 185} 78 Z" fill="#cbd5e1" stroke="#334155" stroke-width="1.5"/>
            <path d="M ${startX + 8} 128 L ${startX + 8} 110 Q ${startX + 12} 90 ${startX + 40} 88 L ${startX + 78} 88 L ${startX + 78} 135 Z" fill="url(#evGlassGrad)" stroke="#0284c7" stroke-width="1.8" />
            <path d="M ${startX + 85} 88 L ${startX + 152} 88 Q ${startX + 158} 88 ${startX + 158} 96 L ${startX + 158} 138 L ${startX + 85} 138 Z" fill="url(#evGlassGrad)" stroke="#0284c7" stroke-width="1.8" />
            <rect x="${startX - 6}" y="105" width="7" height="38" rx="2.5" fill="#0f172a" />
            <line x1="${startX + 1}" y1="112" x2="${startX + 10}" y2="112" stroke="#0f172a" stroke-width="2" />
            <line x1="${startX + 1}" y1="130" x2="${startX + 10}" y2="130" stroke="#0f172a" stroke-width="2" />
            <rect x="${startX + 88}" y="148" width="12" height="3.5" rx="1.5" fill="#0f172a" />
            <rect x="${startX - 2}" y="165" width="8" height="42" fill="#334155" />
            <polygon points="${startX - 1},210 ${startX + 8},210 ${startX + 8},228 ${startX - 1},228" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5" />
            <path d="M ${startX - 4} 225 L ${startX + 12} 225 L ${startX + 12} 248 L ${startX - 2} 248 Z" fill="#1e293b" stroke="#0f172a" stroke-width="2" />
            <path d="M ${startX + 12} 238 A 52 52 0 0 1 ${startX + 120} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
        </g>
    `;
}

function _evRenderCabinaTrompa(startX: number): string {
    return `
        <g id="cabinaTrompa">
            <path d="M ${startX} 235 L ${startX} 175 Q ${startX + 2} 158 ${startX + 22} 158 L ${startX + 110} 158 L ${startX + 110} 235 Z" fill="url(#evCabGrad)" stroke="#1e293b" stroke-width="2.5"/>
            <path d="M ${startX + 110} 158 L ${startX + 110} 95 Q ${startX + 112} 80 ${startX + 130} 78 L ${startX + 220} 78 L ${startX + 220} 235 L ${startX + 110} 235 Z" fill="url(#evCabGrad)" stroke="#1e293b" stroke-width="2.5"/>
            <rect x="${startX + 222}" y="52" width="7" height="145" rx="3" fill="#cbd5e1" stroke="#475569" stroke-width="1.5" />
            <path d="M ${startX + 222} 52 Q ${startX + 225} 38 ${startX + 238} 40" fill="none" stroke="#cbd5e1" stroke-width="4.5" stroke-linecap="round"/>
            <polygon points="${startX + 112},150 ${startX + 112},98 ${startX + 144},92 ${startX + 144},150" fill="url(#evGlassGrad)" stroke="#0284c7" stroke-width="1.8" />
            <rect x="${startX + 150}" y="95" width="52" height="40" rx="3" fill="url(#evGlassGrad)" stroke="#0284c7" stroke-width="1.8" />
            <rect x="${startX - 4}" y="162" width="7" height="58" rx="2" fill="#94a3b8" stroke="#1e293b" stroke-width="2"/>
            <circle cx="${startX + 15}" cy="195" r="7.5" fill="#fef08a" stroke="#ca8a04" stroke-width="1.8" />
            <path d="M ${startX + 70} 238 A 52 52 0 0 1 ${startX + 180} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
        </g>
    `;
}

function _evRenderTracto(numEjes: number, isChata: boolean): string {
    const startX = 140;
    let cabHtml = isChata ? _evRenderCabinaChata(startX) : _evRenderCabinaTrompa(startX);
    const chassisLen = numEjes === 3 ? 560 : 440;

    let out = `
        <g id="tractoT">
            <rect x="${startX + 20}" y="235" width="${chassisLen}" height="20" rx="3" fill="url(#evChassisGrad)" stroke="#0f172a" stroke-width="2"/>
            <rect x="${startX + 195}" y="222" width="130" height="28" rx="5" fill="url(#evFuelGrad)" stroke="#334155" stroke-width="1.8"/>
            <rect x="${startX + 215}" y="220" width="4" height="32" fill="#334155"/>
            <rect x="${startX + 295}" y="220" width="4" height="32" fill="#334155"/>
            <polygon points="${startX + chassisLen - 80},235 ${startX + chassisLen - 45},220 ${startX + chassisLen - 20},220 ${startX + chassisLen + 10},235" fill="#0f172a" stroke="#475569" stroke-width="1.5" />
            <line x1="${startX + chassisLen - 40}" y1="219" x2="${startX + chassisLen - 15}" y2="219" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
            <text x="${startX + chassisLen - 30}" y="210" font-size="8.5" font-weight="800" fill="#0284c7" text-anchor="middle" font-family="'Inter', sans-serif">5TA RUEDA</text>
            ${cabHtml}
            ${_evRenderWheel(startX + 65, 252, 'EJE 1 (DIR)')}
    `;

    if (numEjes === 3) {
        out += `
            <path d="M ${startX + chassisLen - 160} 238 A 52 52 0 0 1 ${startX + chassisLen - 50} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            <path d="M ${startX + chassisLen - 55} 238 A 52 52 0 0 1 ${startX + chassisLen + 55} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            ${_evRenderWheel(startX + chassisLen - 105, 252, 'EJE 2 (TRAC)')}
            ${_evRenderWheel(startX + chassisLen, 252, 'EJE 3 (TRAC)')}
        `;
    } else {
        out += `
            <path d="M ${startX + chassisLen - 60} 238 A 52 52 0 0 1 ${startX + chassisLen + 50} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            ${_evRenderWheel(startX + chassisLen - 5, 252, 'EJE 2 (TRAC)')}
        `;
    }

    out += `</g>`;
    return out;
}

function _evRenderCamionRigido(numEjes: number, isChata: boolean, isFurgon: boolean): string {
    const startX = 120;
    let cabHtml = isChata ? _evRenderCabinaChata(startX) : _evRenderCabinaTrompa(startX);
    const bodyStart = isChata ? startX + 190 : startX + 225;
    const bodyWidth = 530;
    const totalLen = bodyStart + bodyWidth - startX;

    let bodyHtml = '';
    if (isFurgon) {
        bodyHtml = `
            <g id="bodyFurgon">
                <rect x="${bodyStart}" y="70" width="${bodyWidth}" height="165" rx="5" fill="url(#evBodyGrad)" stroke="#1e293b" stroke-width="2.5" />
                <line x1="${bodyStart + 130}" y1="70" x2="${bodyStart + 130}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                <line x1="${bodyStart + 265}" y1="70" x2="${bodyStart + 265}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                <line x1="${bodyStart + 400}" y1="70" x2="${bodyStart + 400}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                <rect x="${bodyStart + bodyWidth - 12}" y="115" width="6" height="45" rx="2" fill="#0f172a" />
                <rect x="${bodyStart + 15}" y="75" width="4" height="4" fill="#f59e0b" />
                <rect x="${bodyStart + bodyWidth - 18}" y="75" width="4" height="4" fill="#ef4444" />
            </g>
        `;
    } else {
        bodyHtml = `
            <g id="bodyPlataforma">
                <rect x="${bodyStart}" y="200" width="${bodyWidth}" height="35" rx="3" fill="#f8fafc" stroke="#1e293b" stroke-width="2" />
                <line x1="${bodyStart}" y1="140" x2="${bodyStart + bodyWidth}" y2="140" stroke="#334155" stroke-width="3" />
                <line x1="${bodyStart}" y1="170" x2="${bodyStart + bodyWidth}" y2="170" stroke="#334155" stroke-width="3" />
                <line x1="${bodyStart + 40}" y1="140" x2="${bodyStart + 40}" y2="200" stroke="#334155" stroke-width="3" />
                <line x1="${bodyStart + 180}" y1="140" x2="${bodyStart + 180}" y2="200" stroke="#334155" stroke-width="3" />
                <line x1="${bodyStart + 320}" y1="140" x2="${bodyStart + 320}" y2="200" stroke="#334155" stroke-width="3" />
                <line x1="${bodyStart + 460}" y1="140" x2="${bodyStart + 460}" y2="200" stroke="#334155" stroke-width="3" />
            </g>
        `;
    }

    let out = `
        <g id="camionRigido">
            <rect x="${startX + 20}" y="235" width="${totalLen - 20}" height="20" rx="3" fill="url(#evChassisGrad)" stroke="#0f172a" stroke-width="2"/>
            <rect x="${startX + 185}" y="222" width="110" height="28" rx="5" fill="url(#evFuelGrad)" stroke="#334155" stroke-width="1.8"/>
            ${bodyHtml}
            ${cabHtml}
            ${_evRenderWheel(startX + 65, 252, 'EJE 1 (DIR)')}
    `;

    if (numEjes === 3) {
        out += `
            <path d="M ${bodyStart + bodyWidth - 170} 238 A 52 52 0 0 1 ${bodyStart + bodyWidth - 60} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            <path d="M ${bodyStart + bodyWidth - 65} 238 A 52 52 0 0 1 ${bodyStart + bodyWidth + 45} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            ${_evRenderWheel(bodyStart + bodyWidth - 115, 252, 'EJE 2 (TRAC)')}
            ${_evRenderWheel(bodyStart + bodyWidth - 10, 252, 'EJE 3 (TRAC)')}
        `;
    } else {
        out += `
            <path d="M ${bodyStart + bodyWidth - 90} 238 A 52 52 0 0 1 ${bodyStart + bodyWidth + 20} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            ${_evRenderWheel(bodyStart + bodyWidth - 35, 252, 'EJE 2 (TRAC)')}
        `;
    }

    out += `</g>`;
    return out;
}

function _evRenderSemirremolque(numEjes: number, isFurgon: boolean): string {
    const startX = 110;
    const bodyWidth = 700;

    let bodyHtml = '';
    if (isFurgon) {
        bodyHtml = `
            <g id="bodySemiFurgon">
                <rect x="${startX}" y="60" width="${bodyWidth}" height="175" rx="6" fill="url(#evBodyGrad)" stroke="#1e293b" stroke-width="2.5" />
                <line x1="${startX + 140}" y1="60" x2="${startX + 140}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                <line x1="${startX + 280}" y1="60" x2="${startX + 280}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                <line x1="${startX + 420}" y1="60" x2="${startX + 420}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                <line x1="${startX + 560}" y1="60" x2="${startX + 560}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                <rect x="${startX + 15}" y="65" width="5" height="5" fill="#f59e0b" />
                <rect x="${startX + bodyWidth - 18}" y="65" width="5" height="5" fill="#ef4444" />
            </g>
        `;
    } else {
        bodyHtml = `
            <g id="bodySemiPlataforma">
                <rect x="${startX}" y="195" width="${bodyWidth}" height="40" rx="3" fill="#f8fafc" stroke="#1e293b" stroke-width="2.2" />
                <line x1="${startX}" y1="130" x2="${startX + bodyWidth}" y2="130" stroke="#334155" stroke-width="3" />
                <line x1="${startX}" y1="162" x2="${startX + bodyWidth}" y2="162" stroke="#334155" stroke-width="3" />
                <line x1="${startX + 40}" y1="130" x2="${startX + 40}" y2="195" stroke="#334155" stroke-width="3" />
                <line x1="${startX + 180}" y1="130" x2="${startX + 180}" y2="195" stroke="#334155" stroke-width="3" />
                <line x1="${startX + 320}" y1="130" x2="${startX + 320}" y2="195" stroke="#334155" stroke-width="3" />
                <line x1="${startX + 460}" y1="130" x2="${startX + 460}" y2="195" stroke="#334155" stroke-width="3" />
                <line x1="${startX + 600}" y1="130" x2="${startX + 600}" y2="195" stroke="#334155" stroke-width="3" />
            </g>
        `;
    }

    let out = `
        <g id="semirremolqueS">
            ${bodyHtml}
            <line x1="${startX + 55}" y1="235" x2="${startX + 55}" y2="252" stroke="#0284c7" stroke-width="5" stroke-linecap="round"/>
            <circle cx="${startX + 55}" cy="254" r="5" fill="#0284c7" />
            <text x="${startX + 55}" y="270" font-size="8.5" font-weight="800" fill="#0284c7" text-anchor="middle" font-family="'Inter', sans-serif">KING PIN</text>

            <!-- Patas de apoyo -->
            <rect x="${startX + 150}" y="235" width="10" height="52" fill="#334155" stroke="#0f172a" stroke-width="1.5" />
            <rect x="${startX + 144}" y="284" width="22" height="6" rx="2" fill="#0f172a" />
            <text x="${startX + 155}" y="302" font-size="8" font-weight="700" fill="#64748b" text-anchor="middle" font-family="'Inter', sans-serif">PATAS</text>
    `;

    if (numEjes === 3) {
        out += `
            <path d="M ${startX + bodyWidth - 275} 238 A 50 50 0 0 1 ${startX + bodyWidth - 175} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            <path d="M ${startX + bodyWidth - 180} 238 A 50 50 0 0 1 ${startX + bodyWidth - 80} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            <path d="M ${startX + bodyWidth - 85} 238 A 50 50 0 0 1 ${startX + bodyWidth + 15} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            ${_evRenderWheel(startX + bodyWidth - 225, 252, 'EJE 1')}
            ${_evRenderWheel(startX + bodyWidth - 130, 252, 'EJE 2')}
            ${_evRenderWheel(startX + bodyWidth - 35, 252, 'EJE 3')}
        `;
    } else {
        out += `
            <path d="M ${startX + bodyWidth - 195} 238 A 50 50 0 0 1 ${startX + bodyWidth - 95} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            <path d="M ${startX + bodyWidth - 100} 238 A 50 50 0 0 1 ${startX + bodyWidth} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            ${_evRenderWheel(startX + bodyWidth - 145, 252, 'EJE 1')}
            ${_evRenderWheel(startX + bodyWidth - 50, 252, 'EJE 2')}
        `;
    }

    out += `</g>`;
    return out;
}

function _evRenderRemolqueR2(isFurgon: boolean): string {
    const startX = 180;
    const bodyWidth = 600;

    let bodyHtml = '';
    if (isFurgon) {
        bodyHtml = `
            <g id="bodyRemolqueFurgon">
                <rect x="${startX}" y="70" width="${bodyWidth}" height="165" rx="6" fill="url(#evBodyGrad)" stroke="#1e293b" stroke-width="2.5" />
                <line x1="${startX + 150}" y1="70" x2="${startX + 150}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                <line x1="${startX + 300}" y1="70" x2="${startX + 300}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
                <line x1="${startX + 450}" y1="70" x2="${startX + 450}" y2="235" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />
            </g>
        `;
    } else {
        bodyHtml = `
            <g id="bodyRemolquePlat">
                <rect x="${startX}" y="195" width="${bodyWidth}" height="40" rx="3" fill="#f8fafc" stroke="#1e293b" stroke-width="2.2" />
                <line x1="${startX}" y1="135" x2="${startX + bodyWidth}" y2="135" stroke="#334155" stroke-width="3" />
                <line x1="${startX}" y1="165" x2="${startX + bodyWidth}" y2="165" stroke="#334155" stroke-width="3" />
                <line x1="${startX + 50}" y1="135" x2="${startX + 50}" y2="195" stroke="#334155" stroke-width="3" />
                <line x1="${startX + 200}" y1="135" x2="${startX + 200}" y2="195" stroke="#334155" stroke-width="3" />
                <line x1="${startX + 350}" y1="135" x2="${startX + 350}" y2="195" stroke="#334155" stroke-width="3" />
                <line x1="${startX + 500}" y1="135" x2="${startX + 500}" y2="195" stroke="#334155" stroke-width="3" />
            </g>
        `;
    }

    let out = `
        <g id="remolqueR2">
            ${bodyHtml}
            <line x1="${startX - 75}" y1="245" x2="${startX}" y2="235" stroke="#0284c7" stroke-width="5" stroke-linecap="round"/>
            <circle cx="${startX - 75}" cy="245" r="7" fill="#0284c7" />
            <text x="${startX - 75}" y="265" font-size="8.5" font-weight="800" fill="#0284c7" text-anchor="middle" font-family="'Inter', sans-serif">LANZA</text>

            <path d="M ${startX + 20} 238 A 50 50 0 0 1 ${startX + 120} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            ${_evRenderWheel(startX + 70, 252, 'EJE DEL (DIR)')}

            <path d="M ${startX + bodyWidth - 120} 238 A 50 50 0 0 1 ${startX + bodyWidth - 20} 238" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
            ${_evRenderWheel(startX + bodyWidth - 70, 252, 'EJE TRAS')}
        </g>
    `;
    return out;
}
