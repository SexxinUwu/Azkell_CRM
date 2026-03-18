const fs = require('fs');
const lines = fs.readFileSync('Index.html', 'utf8').split('\n');

// ─── PASO 2A: Sidebar brand-container ─────────────────────────────────────
const brandIdx = lines.findIndex(l => l.includes('sidebar-brand-btn') && l.includes('onclick="toggleSidebar()"'));
if (brandIdx >= 0) {
    // Also update the next line (brand-text div)
    const brandTextIdx = lines.findIndex((l, i) => i > brandIdx && l.includes('brand-text'));
    const logoIdx = lines.findIndex((l, i) => i > brandIdx && l.includes('brand-logo-icon'));

    lines[brandIdx] = lines[brandIdx].replace(
        'onclick="toggleSidebar()"',
        'onclick="toggleSidebar()" title="Expandir/Colapsar Menú"'
    );
    if (brandTextIdx >= 0) {
        lines[brandTextIdx] = lines[brandTextIdx]
            .replace('d-flex align-items-center gap-2"', 'd-flex align-items-center gap-2 w-100"');
    }
    if (logoIdx >= 0) {
        lines[logoIdx] = lines[logoIdx]
            .replace('brand-logo-icon"', 'brand-logo-icon flex-shrink-0"');
    }
    console.log('✓ PASO 2A: sidebar brand updated at line', brandIdx + 1);
} else {
    console.log('✗ PASO 2A: brand-container not found');
}

// ─── PASO 2B: moduloPlacas top-controls block ─────────────────────────────
const modStart = lines.findIndex(l => l.includes('id="moduloPlacas"') && l.includes('modulo-wrapper'));
// Find the closing </div> of top-controls-glass (the div right before placas-split-wrapper)
const splitIdx = lines.findIndex((l, i) => i > modStart && l.includes('placas-split-wrapper'));
const topEnd = splitIdx - 2; // the blank line + closing </div> before split-wrapper

console.log('moduloPlacas start:', modStart + 1, '| top controls end:', topEnd + 1, '| split wrapper:', splitIdx + 1);

const newControls = `                <div id="moduloPlacas" class="modulo-wrapper" style="display: none; height: 100%; overflow: hidden;">
                    <div class="top-controls-glass d-flex flex-column flex-md-row justify-content-between align-items-md-center p-2 px-md-3 border-bottom-theme bg-surface-premium gap-2">
                        <div class="d-flex align-items-center gap-2">
                            <h5 class="m-0 fw-bold theme-text title-mobile-fix"><i class="bi bi-truck text-primary me-2"></i> Inventario de Placas</h5>
                        </div>

                        <div class="d-flex align-items-center gap-2 flex-wrap w-100 w-md-auto top-controls-buttons">
                            <div class="search-theme-wrapper flex-grow-1 flex-md-grow-0 search-mobile-fix">
                                <i class="bi bi-search text-muted"></i>
                                <input type="text" id="buscadorPlacas" class="search-theme-input" onkeyup="filtrarPlacasAvanzado()" placeholder="Placa o cliente...">
                            </div>

                            <select class="form-select form-select-sm fw-bold border-theme theme-text bg-theme-surface mx-1 d-none d-md-block" style="width: auto; cursor:pointer;" onchange="cambiarColumnasPlacas(this.value)">
                                <option value="3">3 Columnas</option>
                                <option value="4" selected>4 Columnas</option>
                                <option value="5">5 Columnas</option>
                            </select>

                            <div class="view-toggles bg-theme-surface p-1 rounded-pill border-theme me-1">
                                <button class="btn btn-sm btn-view-toggle active" id="btnViewGrid" onclick="cambiarVistaPlacas('grid')"><i class="bi bi-grid-fill"></i></button>
                                <button class="btn btn-sm btn-view-toggle" id="btnViewList" onclick="cambiarVistaPlacas('list')"><i class="bi bi-list-ul"></i></button>
                            </div>

                            <div class="dropdown flex-grow-1 flex-md-grow-0">
                                <button class="btn btn-outline-secondary btn-sm dropdown-toggle fw-bold w-100" data-bs-toggle="dropdown"><i class="bi bi-funnel me-1"></i> Filtros</button>
                                <div class="dropdown-menu shadow-lg p-0 dropdown-menu-theme" style="width: 280px; max-height: 400px; overflow-y: auto;">
                                    <div class="p-2 bg-light border-bottom text-center fw-bold text-primary small">Filtrar por Cliente</div>
                                    <ul class="list-unstyled mb-0" id="filtroCliente"></ul>
                                    <div class="p-2 bg-light border-bottom border-top text-center fw-bold text-primary small">Filtrar por Tipo</div>
                                    <ul class="list-unstyled mb-0" id="filtroTipo"></ul>
                                    <div class="p-2 bg-light border-bottom border-top text-center fw-bold text-primary small">Filtrar por Estado</div>
                                    <ul class="list-unstyled mb-0" id="filtroEstado"></ul>
                                </div>
                            </div>

                            <button class="btn btn-primary fw-bold btn-sm flex-grow-1 flex-md-grow-0" onclick="document.getElementById('formPlaca').reset()" data-bs-toggle="modal" data-bs-target="#modalPlaca" data-perm-crear="mantenimiento"><i class="bi bi-plus-lg"></i> Registrar</button>
                        </div>
                    </div>`;

// Replace from modStart through topEnd
lines.splice(modStart, topEnd - modStart + 1, newControls);
console.log('✓ PASO 2B: moduloPlacas top-controls replaced');

// ─── PASO 2C: modalPlaca replacement ─────────────────────────────────────
// Re-find the one-liner modal after splice
const modalIdx = lines.findIndex(l => l.includes('modal fade') && l.includes('id="modalPlaca"'));
if (modalIdx >= 0) {
    const newModal = `    <div class="modal fade" id="modalPlaca" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-dark">
                    <h5 class="modal-title fw-bold text-white"><i class="bi bi-truck text-primary me-2"></i>Registrar Placa</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <form id="formPlaca" onsubmit="enviarPlaca(event, this)">
                    <input type="hidden" name="usuarioAutor">
                    <div class="modal-body bg-theme-main">
                        <div class="row">
                            <div class="col-md-4 mb-3"><label class="form-label fw-bold text-primary">Placa</label><input type="text" class="form-control text-uppercase" name="p_placa" placeholder="Ej: ABC-123" required></div>
                            <div class="col-md-8 mb-3"><label class="form-label fw-bold text-primary">Cliente</label><input type="text" class="form-control" name="p_cliente" id="p_cliente" list="dl-clientes" oninput="autocompletarRuc(this.value, 'p_ruc')" placeholder="Ej: ROSYMAR PERU SAC" required></div>
                        </div>
                        <div class="row">
                            <div class="col-md-4 mb-3"><label class="form-label fw-bold">Tipo</label><input type="text" class="form-control" name="p_tipo" list="dl-tipos" placeholder="Ej: CAMIÓN"></div>
                            <div class="col-md-4 mb-3"><label class="form-label fw-bold">Marca</label><input type="text" class="form-control" name="p_marca" list="dl-marcas" placeholder="Ej: VOLVO"></div>
                            <div class="col-md-4 mb-3"><label class="form-label fw-bold">Modelo UTS</label><input type="text" class="form-control" name="p_modelo" list="dl-modelos" placeholder="Ej: FH 460"></div>
                        </div>
                        <div class="row">
                            <div class="col-md-4 mb-3"><label class="form-label fw-bold">RUC / DNI</label><input type="text" class="form-control bg-light" name="p_ruc" id="p_ruc" placeholder="Automático..." readonly></div>
                            <div class="col-md-4 mb-3"><label class="form-label fw-bold">Configuración</label><input type="text" class="form-control" name="p_conf" list="dl-confs" placeholder="Ej: 6x4"></div>
                            <div class="col-md-4 mb-3"><label class="form-label fw-bold">Combustible</label><input type="text" class="form-control" name="p_comb" list="dl-combs" placeholder="Ej: DIESEL"></div>
                        </div>
                        <div class="row">
                            <div class="col-md-3 mb-3"><label class="form-label fw-bold">Estado</label><select class="form-select" name="p_estado"><option>Activa</option><option>Inactiva</option></select></div>
                            <div class="col-md-3 mb-3"><label class="form-label fw-bold">Operativo?</label><select class="form-select" name="p_operativo"><option>Activa</option><option>Inactiva</option></select></div>
                            <div class="col-md-3 mb-3"><label class="form-label fw-bold">En Uso?</label><select class="form-select" name="p_enuso"><option>Si</option><option>No</option></select></div>
                            <div class="col-md-3 mb-3"><label class="form-label fw-bold">Llantas</label><input type="number" class="form-control" name="p_llantas" placeholder="Ej: 10"></div>
                        </div>
                        <div class="row">
                            <div class="col-md-6 mb-3"><label class="form-label fw-bold">UTS</label><input type="text" class="form-control" name="p_uts" list="dl-uts" placeholder="Ej: NACIONAL"></div>
                            <div class="col-md-6 mb-3"><label class="form-label fw-bold">Motora/No</label><select class="form-select" name="p_motora"><option>Unidad Motora</option><option>Unidad No Motora</option></select></div>
                        </div>
                    </div>
                    <div class="modal-footer bg-theme-surface border-top-theme">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary" id="btnGuardarPlaca">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    </div>`;
    lines.splice(modalIdx, 1, newModal);
    console.log('✓ PASO 2C: modalPlaca replaced at line', modalIdx + 1);
} else {
    console.log('✗ PASO 2C: modalPlaca not found');
}

fs.writeFileSync('Index.html', lines.join('\n'), 'utf8');
console.log('✓ PASO 2 saved. Lines now:', lines.length);
