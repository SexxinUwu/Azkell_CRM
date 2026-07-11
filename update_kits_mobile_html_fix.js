const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'vista.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Remove the wrongly placed mobile grid and FAB at the top
const wronglyPlaced = `</div>
  
  <!-- ── MOBILE GRID ─────────────────────────────────────────────── -->
  <div class="d-md-none flex-1 overflow-auto" style="padding: .75rem .75rem 120px .75rem; background:transparent;">
    <div id="kits-grid-mobile"></div>
  </div>
  
  <!-- ═══ FAB — solo mobile ════════════════════════════════════════ -->
  <div id="kits-fab-wrap" style="display:none;position:fixed;bottom:104px;right:1rem;z-index:1041;">
    <button class="kits-fab-btn" onclick="window.kitsAbrirModal()">
      <i class="bi bi-plus-lg"></i>
    </button>
  </div>


`;
html = html.replace(wronglyPlaced, '');

// If it matched, we now place it at the end of the flex wrapper
const endOfWrapper = `    </table>
  </div>

</div>`;
const newEnd = `    </table>
  </div>

  <!-- ── MOBILE GRID ─────────────────────────────────────────────── -->
  <div class="d-md-none flex-1 overflow-auto" style="padding: .75rem .75rem 120px .75rem; background:transparent;">
    <div id="kits-grid-mobile"></div>
  </div>
  
  <!-- ═══ FAB — solo mobile ════════════════════════════════════════ -->
  <div id="kits-fab-wrap" style="display:none;position:fixed;bottom:104px;right:1rem;z-index:1041;">
    <button class="kits-fab-btn" onclick="window.kitsAbrirModal()">
      <i class="bi bi-plus-lg"></i>
    </button>
  </div>

</div>`;

html = html.replace(endOfWrapper, newEnd);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('HTML updated');
