const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'vista.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const newStyle = `
<style>
/* ─── Mobile Kits View ─────────────────────────────────────────── */
@media (max-width: 767.98px) {
    .topbar { display: none !important; }
    .main-area { padding: 0 !important; overflow: auto !important; overscroll-behavior: contain; }
    #kits-desktop-header { display: none !important; }
    #kits-m-header { display: flex !important; }
    #kits-fab-wrap { display: flex !important; flex-direction: column; align-items: flex-end; }
    .kits-desktop-table { display: none !important; }
}
/* ─── Kits List Card Mobile ────────────────────────────────────── */
.kits-list-card {
    background: #fff; border: 1.5px solid #e2e8f0;
    border-radius: 16px; padding: 0; margin-bottom: 1rem;
    box-shadow: 0 4px 12px rgba(0,0,0,.03); position: relative;
}
.kits-list-card-header {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px dashed #e2e8f0; padding-bottom: .5rem; margin-bottom: .5rem;
}
.kits-fab-btn {
    width: 60px; height: 60px; border-radius: 20px;
    background: #2563eb; color: #fff; border: none;
    box-shadow: 0 8px 24px rgba(37,99,235,.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.8rem; cursor: pointer; transition: transform .2s, box-shadow .2s;
}
.kits-fab-btn:active { transform: scale(.92); }
</style>
`;

html = newStyle + html;

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Mobile styles added');
