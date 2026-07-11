const fs = require('fs');
const path = require('path');

const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

// The new HTML for inv-form-drawer
const newHtml = `<div id="inv-form-drawer">

  <!-- Header fijo -->
  <div style="display:flex;align-items:center;justify-content:space-between;
              padding:1rem 1.25rem .75rem;flex-shrink:0;border-bottom:1.5px solid #e2e8f0;
              background:#fff;">
    <div style="display:flex;align-items:center;gap:.6rem;">
      <div style="width:38px;height:38px;border-radius:14px;background:#eff6ff;
                  display:flex;align-items:center;justify-content:center;">
        <i class="bi bi-box-seam" style="color:#3b82f6;font-size:1.1rem;"></i>
      </div>
      <div>
        <div id="modal-inv-titulo" style="font-size:.95rem;font-weight:900;color:#0f172a;line-height:1.1;">Nuevo Artículo</div>
        <div style="font-size:.6rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Inventario de Almacén</div>
      </div>
    </div>
    <button type="button" onclick="window._invCerrarDrawer()"
            style="width:34px;height:34px;border-radius:10px;background:#f1f5f9;border:none;
                   color:#64748b;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">
      <i class="bi bi-x-lg"></i>
    </button>
  </div>

  <form id="form-inv-articulo" onsubmit="window.guardarArticuloInv(event)" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
    <input type="hidden" id="inv-edit-id">
    
    <!-- Cuerpo scrollable -->
    <div style="flex:1;overflow-y:auto;padding:1rem 1rem 0;">

      <!-- Doc card -->
      <div class="ent-doc-card">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">

          <!-- Nombre Generado -->
          <div style="grid-column:1/-1;">
            <div class="ent-field-label">Nombre Generado</div>
            <div id="inv-nombre-preview" class="p-2 rounded-2 fw-semibold text-muted fst-italic" style="background:#f1f5f9; border:1px solid #e2e8f0; font-size:0.85rem;">
              Completa los campos para generar...
            </div>
          </div>

          <!-- Código de Barras -->
          <div style="grid-column:1/-1;">
            <div class="ent-field-label">Cód. Barras</div>
            <div style="display:flex; gap:8px;">
              <input type="text" id="inv-f-codigo-barras" class="ent-input-sm" placeholder="EAN-13 / QR...">
              <button type="button" onclick="window._invAbrirScanner('form')" class="btn btn-sm" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:10px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="bi bi-qr-code-scan"></i>
              </button>
            </div>
          </div>

          <!-- Artículo -->
          <div>
            <div class="ent-field-label">Artículo <span style="color:#ef4444;">*</span></div>
            <input type="text" id="inv-f-articulo" class="ent-input-sm" required placeholder="Ej: Filtro Aceite" oninput="window._invActualizarPreview()">
          </div>

          <!-- Código Int. -->
          <div>
            <div class="ent-field-label">Código Int.</div>
            <input type="text" id="inv-f-codigo-articulo" class="ent-input-sm" placeholder="Ej: LF3000" oninput="window._invActualizarPreview()">
          </div>

          <!-- Marca -->
          <div>
            <div class="ent-field-label">Marca</div>
            <div style="display:flex; gap:8px;">
              <div class="position-relative" style="flex:1;">
                <input type="text" id="inv-f-marca-txt" class="ent-input-sm w-100" placeholder="Buscar..." autocomplete="off" oninput="window._invCbFiltrar('inv-f-marca');window._invActualizarPreview()" onfocus="window._invCbFiltrar('inv-f-marca')" onblur="window._cbHide('inv-f-marca')">
                <input type="hidden" id="inv-f-marca">
                <div id="inv-f-marca-dd" class="cb-dropdown"></div>
              </div>
              <button type="button" onclick="window._invQuickAddMarca()" class="btn btn-sm" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:10px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>
          </div>

          <!-- Familia -->
          <div>
            <div class="ent-field-label">Familia</div>
            <div style="display:flex; gap:8px;">
              <div class="position-relative" style="flex:1;">
                <input type="text" id="inv-f-familia-txt" class="ent-input-sm w-100" placeholder="Buscar..." autocomplete="off" oninput="window._invCbFiltrar('inv-f-familia')" onfocus="window._invCbFiltrar('inv-f-familia')" onblur="window._cbHide('inv-f-familia')">
                <input type="hidden" id="inv-f-familia">
                <div id="inv-f-familia-dd" class="cb-dropdown"></div>
              </div>
              <button type="button" onclick="window._invQuickAddFamilia()" class="btn btn-sm" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:10px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>
          </div>

          <!-- Tipo -->
          <div>
            <div class="ent-field-label">Tipo</div>
            <div class="position-relative">
              <input type="text" id="inv-f-tipo-txt" class="ent-input-sm w-100" placeholder="Buscar..." autocomplete="off" oninput="window._invCbFiltrar('inv-f-tipo')" onfocus="window._invCbFiltrar('inv-f-tipo')" onblur="window._cbHide('inv-f-tipo')">
              <input type="hidden" id="inv-f-tipo">
              <div id="inv-f-tipo-dd" class="cb-dropdown"></div>
            </div>
          </div>

          <!-- Sub-tipo -->
          <div>
            <div class="ent-field-label">Sub-tipo</div>
            <div class="position-relative">
              <input type="text" id="inv-f-sub-tipo-txt" class="ent-input-sm w-100" placeholder="Buscar..." autocomplete="off" oninput="window._invCbFiltrar('inv-f-sub-tipo')" onfocus="window._invCbFiltrar('inv-f-sub-tipo')" onblur="window._cbHide('inv-f-sub-tipo')">
              <input type="hidden" id="inv-f-sub-tipo">
              <div id="inv-f-sub-tipo-dd" class="cb-dropdown"></div>
            </div>
          </div>

          <!-- Ocultos de sistema -->
          <div style="display:none">
            <input type="hidden" id="inv-f-sistema-txt"><input type="hidden" id="inv-f-sistema"><div id="inv-f-sistema-dd"></div>
            <input type="hidden" id="inv-f-sub-sistema-txt"><input type="hidden" id="inv-f-sub-sistema"><div id="inv-f-sub-sistema-dd"></div>
          </div>

          <!-- Separador -->
          <div style="grid-column:1/-1; height:1px; background:#e2e8f0; margin:4px 0;"></div>

          <!-- Almacén -->
          <div>
            <div class="ent-field-label">Almacén</div>
            <div class="position-relative">
              <input type="text" id="inv-f-almacen-txt" class="ent-input-sm w-100" placeholder="Seleccionar..." autocomplete="off" oninput="window._invCbFiltrar('inv-f-almacen')" onfocus="window._invCbFiltrar('inv-f-almacen')" onblur="window._cbHide('inv-f-almacen')">
              <input type="hidden" id="inv-f-almacen">
              <div id="inv-f-almacen-dd" class="cb-dropdown"></div>
            </div>
          </div>

          <!-- Anaquel -->
          <div>
            <div class="ent-field-label">Anaquel</div>
            <input type="number" id="inv-f-anaquel" class="ent-input-sm" step="0.01" placeholder="Ej: 3.5">
          </div>

          <!-- Unidad -->
          <div style="grid-column:1/-1; display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
            <div>
              <div class="ent-field-label">Unidad</div>
              <div class="position-relative">
                <input type="text" id="inv-f-unidad-txt" class="ent-input-sm w-100" placeholder="Und..." autocomplete="off" oninput="window._invCbFiltrar('inv-f-unidad')" onfocus="window._invCbFiltrar('inv-f-unidad')" onblur="window._cbHide('inv-f-unidad')">
                <input type="hidden" id="inv-f-unidad">
                <div id="inv-f-unidad-dd" class="cb-dropdown"></div>
              </div>
            </div>
            <div>
              <div class="ent-field-label">Mín.</div>
              <input type="number" id="inv-f-stock-min" class="ent-input-sm" step="0.0001" placeholder="0">
            </div>
            <div>
              <div class="ent-field-label">Máx.</div>
              <input type="number" id="inv-f-stock-max" class="ent-input-sm" step="0.0001" placeholder="0">
            </div>
          </div>

          <!-- Costo / Moneda -->
          <div>
            <div class="ent-field-label">Costo</div>
            <input type="number" id="inv-f-costo" class="ent-input-sm" step="0.0001" placeholder="0.00">
          </div>
          <div>
            <div class="ent-field-label">Moneda</div>
            <div class="position-relative">
              <input type="text" id="inv-f-moneda-txt" class="ent-input-sm w-100" placeholder="PEN (S/)" autocomplete="off" oninput="window._invCbFiltrar('inv-f-moneda')" onfocus="window._invCbFiltrar('inv-f-moneda')" onblur="window._cbHide('inv-f-moneda')">
              <input type="hidden" id="inv-f-moneda">
              <div id="inv-f-moneda-dd" class="cb-dropdown"></div>
            </div>
          </div>

          <!-- T/C -->
          <div id="inv-tc-row" style="grid-column:1/-1; display:none;">
            <div class="ent-field-label">T/C USD → S/</div>
            <input type="number" id="inv-f-tc" class="ent-input-sm" step="0.0001" min="0.01" placeholder="3.70">
          </div>

          <!-- Ubicacion oculta -->
          <div style="display:none"><input type="text" id="inv-f-ubicacion"></div>

          <!-- Separador -->
          <div style="grid-column:1/-1; height:1px; background:#e2e8f0; margin:4px 0;"></div>

          <!-- Estado -->
          <div style="grid-column:1/-1;">
            <div class="ent-field-label">Estado</div>
            <div class="position-relative">
              <input type="text" id="inv-f-estado-art-txt" class="ent-input-sm w-100" placeholder="Activo..." autocomplete="off" oninput="window._invCbFiltrar('inv-f-estado-art')" onfocus="window._invCbFiltrar('inv-f-estado-art')" onblur="window._cbHide('inv-f-estado-art')">
              <input type="hidden" id="inv-f-estado-art">
              <div id="inv-f-estado-art-dd" class="cb-dropdown"></div>
            </div>
          </div>

          <!-- Observaciones -->
          <div style="grid-column:1/-1;">
            <div class="ent-field-label">Observaciones</div>
            <textarea id="inv-f-obs" class="ent-input-sm" rows="3" placeholder="Notas adicionales..." style="resize:none;"></textarea>
          </div>

          <!-- Unidades Compatibles (Multi-Select) -->
          <div style="grid-column:1/-1;">
            <div class="ent-field-label">Unidades Compatibles</div>
            <div class="position-relative">
              <div id="inv-ms-box" onclick="window.invMsToggle()" style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:10px;padding:.55rem .85rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:all .2s;">
                <span id="inv-ms-count" style="font-weight:600;color:#1e293b;font-size:0.88rem;">0 seleccionados</span>
                <i class="bi bi-chevron-down" style="color:#64748b;"></i>
              </div>
              <div id="inv-ms-dropdown" class="cb-dropdown" style="z-index:999;">
                <div style="padding:10px;border-bottom:1px solid #e2e8f0;">
                  <input type="text" id="inv-ms-search" class="ent-input-sm" placeholder="Buscar marca..." oninput="window.invMsSearch()" style="border-radius:8px;">
                </div>
                <div id="inv-ms-options" style="max-height:220px;overflow-y:auto;padding:6px 0;"></div>
                <div style="padding:8px;border-top:1px solid #e2e8f0;text-align:center;">
                  <button type="button" onclick="window.invMsClear()" class="btn btn-sm btn-light w-100" style="font-weight:600;font-size:0.85rem;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;">Limpiar todo</button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div><!-- /ent-doc-card -->

      <!-- Eliminación / Imágenes -->
      <div class="ent-doc-card" style="margin-top:1rem;">
        <div style="display:grid;grid-template-columns:1fr;gap:12px;">
          
          <!-- Botón Eliminar (solo visible en Edición) -->
          <div id="inv-btn-eliminar-art" style="display:none; text-align:center;">
             <button type="button" class="btn fw-semibold" style="width:100%; border-radius:10px; height:42px; background-color:#fef2f2; color:#ef4444; border:1px solid #fca5a5;" onclick="window._invEliminarArticuloActual()">
                <i class="bi bi-trash-fill me-2"></i>Eliminar Artículo
             </button>
             <div style="height:1px; background:#e2e8f0; margin:12px 0;"></div>
          </div>

          <div id="inv-img-nuevo-aviso" class="alert alert-info py-2 small" style="display:none;">
            <i class="bi bi-info-circle me-1"></i>Guarda el artículo primero para poder subir una imagen.
          </div>
          
          <div id="inv-img-section" style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <div class="ent-field-label">Imagen del Artículo</div>
              <div class="border rounded d-flex align-items-center justify-content-center mb-2 overflow-hidden bg-light" style="height:180px; border-color:#cbd5e1!important;">
                <img id="inv-img-preview" src="" alt="" style="max-height:180px;max-width:100%;object-fit:contain;display:none;">
                <div id="inv-img-placeholder" class="text-center text-muted">
                  <i class="bi bi-image fs-1"></i><br><small>Sin imagen</small>
                </div>
              </div>
              <div class="d-flex gap-2">
                <label class="btn btn-sm btn-outline-primary flex-grow-1" style="cursor:pointer; border-radius:10px;">
                  <i class="bi bi-upload me-1"></i>Subir imagen
                  <input type="file" id="inv-img-input" accept="image/*" style="display:none" onchange="window._invSubirImagen(event)">
                </label>
                <button type="button" id="inv-img-btn-quitar" class="btn btn-sm btn-outline-danger" onclick="window._invQuitarImagen()" style="display:none; border-radius:10px;"><i class="bi bi-trash"></i></button>
              </div>
            </div>

            <div class="text-center" style="margin-top:8px;">
              <div class="ent-field-label">Código QR</div>
              <div id="inv-qr-wrap" class="border rounded p-3 d-inline-flex flex-column align-items-center gap-2" style="display:none!important; border-color:#cbd5e1!important;">
                <img id="inv-qr-img" src="" alt="QR" style="width:140px;height:140px;">
                <small class="text-muted fw-bold" id="inv-qr-label" style="font-size:0.75rem;"></small>
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window._invDescargarQR()" style="border-radius:10px;"><i class="bi bi-download me-1"></i>Descargar QR</button>
              </div>
              <div id="inv-qr-placeholder" class="text-muted small">
                <i class="bi bi-qr-code fs-1 d-block mb-1"></i>El QR se genera al guardar
              </div>
            </div>
          </div>

        </div>
      </div><!-- /ent-doc-card -->

    </div><!-- /body scrollable -->

    <!-- Footer fijo -->
    <div style="padding:1rem 1.25rem;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:.6rem;flex-shrink:0;background:#fff;">
      <button type="button" onclick="window._invCerrarDrawer()"
              style="padding:.6rem 1.1rem;border-radius:12px;border:1.5px solid #cbd5e1;
                     background:transparent;color:#475569;font-weight:700;font-size:.9rem;
                     cursor:pointer;transition:all .2s;">Cancelar</button>
      <button type="submit"
              style="padding:.6rem 1.5rem;border-radius:12px;border:none;
                     background:#16a34a;color:#fff;font-weight:700;font-size:.9rem;
                     cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:.4rem;
                     box-shadow:0 4px 12px rgba(22,163,74,.25);">
        <i class="bi bi-check2"></i> Guardar Artículo
      </button>
    </div>
  </form>
</div>`;

const regex = /<div id="inv-form-drawer">[\s\S]*?<\/div>\s*<!-- ═══ FAB/g;

html = html.replace(regex, newHtml + '\n\n<!-- ═══ FAB');

fs.writeFileSync(fileHtml, html, 'utf8');
console.log('vista.html updated successfully.');
