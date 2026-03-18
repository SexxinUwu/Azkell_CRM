const fs = require('fs');
let lines = fs.readFileSync('logica.js', 'utf8').split('\n');

// ─── PASO 1A: Session fix ─────────────────────────────────────────────────
// Find line with the inner body of the if inside verificarSesionGuardada
const sesionIdx = lines.findIndex(l =>
    l.includes('usuarioLogueado = guardadoUser') &&
    l.includes('rolLogueado =') &&
    l.includes('registrarActividad')
);
if (sesionIdx >= 0) {
    const old = lines[sesionIdx];
    lines[sesionIdx] =
        '        // 🔥 FIX SESIÓN: Renovar contador a 30 min al recargar\n' +
        '        localStorage.setItem(\'crm_ultimo_acceso\', Date.now());\n' +
        '        ' + old.trim();
    console.log('✓ PASO 1A: Session fix at line', sesionIdx + 1);
} else {
    console.log('✗ PASO 1A: target line not found');
}

// Re-split since we inserted newlines in a single element
lines = lines.join('\n').split('\n');

// ─── PASO 1B: Replace spotlight block ────────────────────────────────────
const spotStart = lines.findIndex(l => l.includes('// SPOTLIGHT (Ctrl+K)') || l.includes('// ============================================================\n// SPOTLIGHT'));
// Find the SPOTLIGHT section header (the comment block)
let spotBlockStart = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('SPOTLIGHT (Ctrl+K)') && lines[i-1] && lines[i-1].includes('===')) {
        spotBlockStart = i - 2; // include the === line before
        break;
    }
}
const spotEnd = lines.length - 1; // replace to end of file

const newSpotBlock = `
// ============================================================
// 🔍 LÓGICA DEL BUSCADOR GLOBAL (SPOTLIGHT)
// ============================================================
function abrirSpotlight() {
    document.getElementById('spotlight-overlay').style.display = 'flex';
    setTimeout(() => document.getElementById('spotlight-input').focus(), 100);
}

function cerrarSpotlight() {
    document.getElementById('spotlight-overlay').style.display = 'none';
    document.getElementById('spotlight-input').value = '';
    document.getElementById('spotlight-results').innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-keyboard text-secondary" style="font-size: 3rem;"></i><br><small class="mt-2 d-block">Escribe al menos 3 letras para buscar mágicamente en todo el CRM.</small></div>';
}

window.buscarSpotlight = function(query) {
    const res = document.getElementById('spotlight-results');
    if (!res) return;
    const q = (query || '').trim().toLowerCase();
    if (q.length < 3) {
        res.innerHTML = '<div class="text-center text-muted py-4"><small>Escribe al menos 3 letras...</small></div>';
        return;
    }
    let hits = [];
    if (Array.isArray(dataGlobalPlacas)) {
        dataGlobalPlacas.forEach((fila, idx) => {
            const plc = (fila[0] || '').toLowerCase(); const cli = (fila[1] || '').toLowerCase(); const tip = (fila[2] || '').toLowerCase();
            if (plc.includes(q) || cli.includes(q) || tip.includes(q)) hits.push({ plc: fila[0], cli: fila[1], tip: fila[2], est: fila[8], idx });
        });
    }
    if (hits.length === 0) { res.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-search"></i> Sin resultados para <strong>' + query + '</strong></div>'; return; }
    res.innerHTML = hits.slice(0, 15).map(h => {
        const bc = (h.est || '') === 'Activa' ? 'badge-green' : 'badge-red';
        return '<div class="spotlight-result-item" onclick="cerrarSpotlight(); cambiarModulo(\'placas\',\'nav-placas\')">' +
            '<div class="d-flex align-items-center gap-3"><i class="bi bi-truck text-primary"></i>' +
            '<div><div class="fw-bold">' + h.plc + '</div><div class="text-muted small">' + (h.cli || 'Sin Cliente') + ' · ' + (h.tip || '-') + '</div></div>' +
            '<span class="badge-premium ' + bc + ' ms-auto">' + (h.est || '-') + '</span></div></div>';
    }).join('');
};

// 🔥 FIX ATAJO: Activar Ctrl+K en toda la ventana
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        abrirSpotlight();
    }
    if (e.key === 'Escape' && document.getElementById('spotlight-overlay').style.display === 'flex') {
        cerrarSpotlight();
    }
});`;

if (spotBlockStart >= 0) {
    lines.splice(spotBlockStart, lines.length - spotBlockStart, newSpotBlock);
    console.log('✓ PASO 1B: Spotlight block replaced starting at line', spotBlockStart + 1);
} else {
    console.log('✗ PASO 1B: Spotlight start not found');
}

// Save after 1A+1B
fs.writeFileSync('logica.js', lines.join('\n'), 'utf8');
console.log('✓ 1A+1B saved. Lines:', lines.length);
