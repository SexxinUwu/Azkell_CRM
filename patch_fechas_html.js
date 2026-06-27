const fs = require('fs');
let html = fs.readFileSync('modulos/mantenimiento/reportes-ot/vista.html', 'utf8');

const modalHtml = `
<div id="rot-panel-editar-fechas" class="rot-panel-right">
    <div class="rot-panel-overlay" onclick="document.getElementById('rot-panel-editar-fechas').classList.remove('open')"></div>
    <div class="rot-panel-content">
        <div class="rot-panel-header">
            <div>
                <h5 class="mb-0 fw-bold" style="color:var(--text);">Editar Fechas de OT</h5>
                <div style="font-size:.78rem;color:var(--subtext);">Modifica el inicio y término manual</div>
            </div>
            <button class="rot-btn-close" onclick="document.getElementById('rot-panel-editar-fechas').classList.remove('open')"><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="rot-panel-body p-3">
            <div class="mb-3">
                <label class="form-label fw-bold" style="font-size:.78rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.04em;">Fecha de Inicio (En Proceso)</label>
                <input type="datetime-local" class="form-control form-control-sm" id="rot-ef-inicio">
            </div>
            <div class="mb-4">
                <label class="form-label fw-bold" style="font-size:.78rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.04em;">Fecha de Término (Cierre)</label>
                <input type="datetime-local" class="form-control form-control-sm" id="rot-ef-termino">
            </div>
            <button class="btn btn-primary w-100 fw-bold" onclick="window.rotGuardarFechas()">
                <i class="bi bi-check-lg me-1"></i>Guardar Cambios
            </button>
        </div>
    </div>
</div>
`;

if (!html.includes('rot-panel-editar-fechas')) {
    html += modalHtml;
    fs.writeFileSync('modulos/mantenimiento/reportes-ot/vista.html', html);
    console.log('Added panel to vista.html');
} else {
    console.log('Panel already exists');
}
