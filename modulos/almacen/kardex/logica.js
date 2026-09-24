// ================================================================
// MÓDULO ALMACÉN / KARDEX — Lógica SPA Aislada (Tabla Moderna ERP)
// ================================================================

window._kdxInvData      = window._kdxInvData      || [];
window._kdxMovData      = window._kdxMovData      || [];
window._kdxFilasRender  = window._kdxFilasRender  || [];
window._kdxSelId        = window._kdxSelId        || null;
window._kdxSelItem      = window._kdxSelItem      || null;
window._kdxStockBase    = window._kdxStockBase    || 0;
window._kdxFechaReg     = window._kdxFechaReg     || null;
window._kdxDropdownIdx  = window._kdxDropdownIdx  !== undefined ? window._kdxDropdownIdx : -1;

window.init_kardex = function() {
    if (!window.checkPerm('kardex', 'l')) {
        var wrap = document.getElementById('mod-kardex') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    window._kdxCargarInventario();
};

window._kdxCargarInventario = function() {
    fetch('/api/almacen/inventario')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._kdxInvData = data || [];
        })
        .catch(function(e) {
            console.error('[Kardex] Error cargando lista de inventario:', e);
        });
};

// ── Dropdown autocomplete moderno ────────────────────────────────
window._kdxFiltrarDropdown = function() {
    var input = document.getElementById('kdx-buscar-art');
    var dd    = document.getElementById('kdx-art-dropdown');
    var clr   = document.getElementById('kdx-buscar-clear');
    if (!input || !dd) return;
    var q = input.value.trim().toLowerCase();
    if (clr) clr.style.display = q ? '' : 'none';
    if (!q) { dd.style.display = 'none'; return; }
    var matches = window._kdxInvData.filter(function(d) {
        return (d.id || '').toLowerCase().includes(q) ||
               (d.descripcion || '').toLowerCase().includes(q) ||
               (d.familia || '').toLowerCase().includes(q);
    }).slice(0, 30);
    if (!matches.length) {
        dd.innerHTML = '<div style="padding:.75rem 1rem;color:#94a3b8;font-size:.8rem;">Sin resultados</div>';
        dd.style.display = '';
        return;
    }
    dd.innerHTML = matches.map(function(d, i) {
        return '<div class="kdx-dd-item" data-idx="' + i + '" data-id="' + _kdxEsc(d.id) + '" ' +
               'onclick="window._kdxSeleccionar(\'' + _kdxEsc(d.id) + '\')" ' +
               'onmouseenter="window._kdxDropdownIdx=' + i + ';window._kdxHighlight()" ' +
               'style="padding:.6rem 1rem;cursor:pointer;display:flex;align-items:center;gap:.6rem;border-bottom:1px solid #f1f5f9;">' +
                 '<span style="font-size:.7rem;font-weight:800;background:#eff6ff;color:#2563eb;padding:.15rem .45rem;border-radius:6px;white-space:nowrap;flex-shrink:0;">' + _kdxEsc(d.id) + '</span>' +
                 '<span style="font-size:.82rem;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _kdxEsc(d.descripcion || '—') + '</span>' +
                 (d.familia ? '<span style="font-size:.65rem;color:#94a3b8;flex-shrink:0;margin-left:auto;">' + _kdxEsc(d.familia) + '</span>' : '') +
               '</div>';
    }).join('');
    window._kdxDropdownIdx = -1;
    dd.style.display = '';
};

window._kdxNavDropdown = function(e) {
    var dd = document.getElementById('kdx-art-dropdown');
    if (!dd || dd.style.display === 'none') return;
    var items = dd.querySelectorAll('.kdx-dd-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        window._kdxDropdownIdx = Math.min(window._kdxDropdownIdx + 1, items.length - 1);
        window._kdxHighlight();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        window._kdxDropdownIdx = Math.max(window._kdxDropdownIdx - 1, 0);
        window._kdxHighlight();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (window._kdxDropdownIdx >= 0 && items[window._kdxDropdownIdx]) {
            items[window._kdxDropdownIdx].click();
        } else {
            window._kdxCargarKardex();
        }
    } else if (e.key === 'Escape') {
        dd.style.display = 'none';
    }
};

window._kdxHighlight = function() {
    var dd = document.getElementById('kdx-art-dropdown');
    if (!dd) return;
    var items = dd.querySelectorAll('.kdx-dd-item');
    items.forEach(function(el, i) {
        el.style.background = (i === window._kdxDropdownIdx) ? '#eff6ff' : '';
    });
    if (window._kdxDropdownIdx >= 0 && items[window._kdxDropdownIdx]) {
        items[window._kdxDropdownIdx].scrollIntoView({ block: 'nearest' });
    }
};

window._kdxSeleccionar = function(id) {
    var item = window._kdxInvData.find(function(d) { return d.id === id; });
    if (!item) return;
    var input = document.getElementById('kdx-buscar-art');
    if (input) input.value = item.id + ' — ' + item.descripcion;
    var clr = document.getElementById('kdx-buscar-clear');
    if (clr) clr.style.display = '';
    var dd = document.getElementById('kdx-art-dropdown');
    if (dd) dd.style.display = 'none';
    window._kdxCargarKardex();
};

window._kdxLimpiarBuscar = function() {
    var input = document.getElementById('kdx-buscar-art');
    if (input) { input.value = ''; input.focus(); }
    var clr = document.getElementById('kdx-buscar-clear');
    if (clr) clr.style.display = 'none';
    var dd = document.getElementById('kdx-art-dropdown');
    if (dd) dd.style.display = 'none';
};

// ── Determinar si un movimiento es de Entrada / Ingreso ────────────
function _kdxEsEntrada(tipo) {
    if (!tipo) return false;
    var t = String(tipo).toLowerCase().trim();
    return t === 'entrada' || 
           t === 'recepción oc' || 
           t === 'recepcion oc' || 
           t.includes('recep') || 
           t.includes('entrada') || 
           t.includes('compra') || 
           t.includes('ajuste positivo');
}

// ── Cargar kardex de artículo ─────────────────────────────────────
window._kdxCargarKardex = function() {
    var input = document.getElementById('kdx-buscar-art');
    if (!input) return;
    var val = input.value.trim();
    var invId = val.split(' — ')[0].trim();
    if (!invId) { alert('Ingresa o selecciona un artículo.'); return; }

    var item = window._kdxInvData.find(function(d) { return d.id === invId; });
    if (!item) {
        item = window._kdxInvData.find(function(d) {
            return (d.descripcion || '').toLowerCase().includes(val.toLowerCase());
        });
    }
    if (!item) { alert('Artículo no encontrado en el catálogo.'); return; }

    window._kdxSelId     = item.id;
    window._kdxSelItem   = item;
    window._kdxStockBase = parseFloat(item.stock_regularizado || 0);

    var placeholder = document.getElementById('kdx-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    var tableWrap = document.getElementById('kdx-table-wrapper');
    if (tableWrap) tableWrap.style.display = 'flex';

    var tbody = document.getElementById('tbodyKardex');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Consultando movimientos del Kardex...</td></tr>';
    }

    var hdr       = document.getElementById('kdx-art-header');
    var hdrNombre = document.getElementById('kdx-art-header-nombre');
    var hdrInfo   = document.getElementById('kdx-art-header-info');
    var hdrReg    = document.getElementById('kdx-art-header-reg');
    if (hdr) hdr.style.display = '';
    if (hdrNombre) hdrNombre.textContent = item.descripcion || '—';
    if (hdrInfo) {
        hdrInfo.innerHTML = `
            <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2 py-0.5 font-monospace fw-bold">${_kdxEsc(item.id)}</span>
            <span><i class="bi bi-tag text-muted me-1"></i>${_kdxEsc(item.familia || 'Sin Familia')}</span>
            <span><i class="bi bi-building text-muted me-1"></i>${_kdxEsc(item.almacen || 'ALM CENTRAL')}</span>
            <span><i class="bi bi-rulers text-muted me-1"></i>${_kdxEsc(item.unidad || 'UND')}</span>
        `;
    }

    var kpiEl = document.getElementById('kdx-kpi-row');
    if (kpiEl) kpiEl.style.display = 'none';
    var btnExp = document.getElementById('btn-export-kardex');
    if (btnExp) btnExp.style.display = 'none';
    var btnImp = document.getElementById('btn-imprimir-kardex');
    if (btnImp) btnImp.style.display = 'none';

    fetch('/api/almacen/kardex/' + encodeURIComponent(item.id))
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(res) {
            window._kdxMovData  = res.movimientos || [];
            window._kdxFechaReg = res.fecha_regularizacion || null;
            if (hdrReg) {
                if (res.fecha_regularizacion) {
                    hdrReg.innerHTML = `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1"><i class="bi bi-check2-circle me-1"></i>Apertura: ${_kdxFmtFecha(res.fecha_regularizacion)} (${parseFloat(res.stock_base || 0).toFixed(2)} ${item.unidad || 'UND'})</span>`;
                } else {
                    hdrReg.innerHTML = `<span class="text-muted small">Sin regularización de apertura registrada</span>`;
                }
            }
            window._kdxRenderKardex(res, item);
        })
        .catch(function(err) {
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-danger"><i class="bi bi-exclamation-triangle me-2"></i>Error al consultar Kardex: ' + _kdxEsc(err.message) + '</td></tr>';
            }
        });
};

// ── Render Kardex en Formato Tabla Moderna ────────────────────────
window._kdxRenderKardex = function(res, item) {
    var movs      = res.movimientos || [];
    var stockBase = parseFloat(res.stock_base || 0);
    var fechaReg  = res.fecha_regularizacion || null;
    var fechaRegTs = fechaReg ? new Date(fechaReg).getTime() : null;

    // Separar pre y post regularización
    var movsPreReg  = fechaRegTs ? movs.filter(function(m) {
        var mTs = new Date(m.created_at || m.fecha).getTime();
        return mTs < fechaRegTs;
    }) : [];
    var movsPostReg = fechaRegTs ? movs.filter(function(m) {
        var mTs = new Date(m.created_at || m.fecha).getTime();
        return mTs >= fechaRegTs;
    }) : movs;

    // Métricas totales de entradas y salidas
    var totalEntradas = 0, totalSalidas = 0;
    movsPostReg.forEach(function(m) {
        var cant = parseFloat(m.cantidad || 0);
        if (_kdxEsEntrada(m.tipo)) {
            totalEntradas += cant;
        } else {
            totalSalidas += cant;
        }
    });

    // Stock actual matemático exacto: Saldo Apertura + Entradas - Salidas
    var stockActual = stockBase + totalEntradas - totalSalidas;

    // Bento KPI Row
    var kpiEl = document.getElementById('kdx-kpi-row');
    if (kpiEl) {
        kpiEl.style.display = 'grid';
        kpiEl.innerHTML = `
            <!-- 1. Entradas Totales -->
            <div class="kdx-kpi-box">
                <div>
                    <div class="text-uppercase fw-bold text-secondary" style="font-size:0.68rem; letter-spacing:0.06em;">Entradas Totales</div>
                    <div class="fw-black text-success mt-1" style="font-size:1.65rem; line-height:1;">+${totalEntradas.toFixed(2)}</div>
                    <div class="text-muted small mt-1" style="font-size:0.75rem;">Compras & Recepciones</div>
                </div>
                <div class="kdx-kpi-icon-wrap" style="background:#dcfce7; color:#15803d;">
                    <i class="bi bi-box-arrow-in-down"></i>
                </div>
            </div>

            <!-- 2. Salidas Totales -->
            <div class="kdx-kpi-box">
                <div>
                    <div class="text-uppercase fw-bold text-secondary" style="font-size:0.68rem; letter-spacing:0.06em;">Salidas Totales</div>
                    <div class="fw-black text-danger mt-1" style="font-size:1.65rem; line-height:1;">-${totalSalidas.toFixed(2)}</div>
                    <div class="text-muted small mt-1" style="font-size:0.75rem;">Despachos a Taller / Flota</div>
                </div>
                <div class="kdx-kpi-icon-wrap" style="background:#fee2e2; color:#dc2626;">
                    <i class="bi bi-wrench-adjustable"></i>
                </div>
            </div>

            <!-- 3. Stock Inicial Apertura -->
            <div class="kdx-kpi-box">
                <div>
                    <div class="text-uppercase fw-bold text-secondary" style="font-size:0.68rem; letter-spacing:0.06em;">Stock Apertura (REG)</div>
                    <div class="fw-black text-primary mt-1" style="font-size:1.65rem; line-height:1;">${stockBase.toFixed(2)}</div>
                    <div class="text-muted small mt-1" style="font-size:0.75rem;">Conteo Físico Verificado</div>
                </div>
                <div class="kdx-kpi-icon-wrap" style="background:#eff6ff; color:#2563eb;">
                    <i class="bi bi-clipboard2-check"></i>
                </div>
            </div>

            <!-- 4. Stock Actual Disponible -->
            <div class="kdx-kpi-box accent-dark">
                <div>
                    <div class="text-uppercase fw-bold text-white-50" style="font-size:0.68rem; letter-spacing:0.06em;">Stock Actual en Almacén</div>
                    <div class="fw-black text-white mt-1" style="font-size:1.85rem; line-height:1;">
                        ${stockActual.toFixed(2)} <span style="font-size:0.85rem; font-weight:700; opacity:0.8;">${_kdxEsc(item.unidad || 'UND')}</span>
                    </div>
                    <div class="small text-white-50 mt-1" style="font-size:0.75rem;">Saldo Operativo en Línea</div>
                </div>
                <div class="kdx-kpi-icon-wrap" style="background:rgba(255,255,255,0.12); color:#4ade80;">
                    <i class="bi bi-check-circle-fill"></i>
                </div>
            </div>
        `;
    }

    // Botones Exportar e Imprimir
    var btnExp = document.getElementById('btn-export-kardex');
    if (btnExp) btnExp.style.display = 'inline-flex';
    var btnImp = document.getElementById('btn-imprimir-kardex');
    if (btnImp) btnImp.style.display = 'inline-flex';

    var totalMovDisplay = movs.length + (fechaReg ? 1 : 0);
    var contEl = document.getElementById('kdx-contador-movs');
    if (contEl) contEl.textContent = totalMovDisplay + ' movimiento' + (totalMovDisplay !== 1 ? 's' : '');

    var tbody = document.getElementById('tbodyKardex');
    if (!tbody) return;

    if (!movs.length && !fechaReg) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2"></i>Sin movimientos registrados para este artículo</td></tr>';
        return;
    }

    // Construir Filas con Saldos Acumulativos
    var filasRender = [];

    // A. Movimientos Pre-Regularización
    var saldoPre = 0;
    movsPreReg.forEach(function(m) {
        var esEnt = _kdxEsEntrada(m.tipo);
        var cant = parseFloat(m.cantidad || 0);
        saldoPre += esEnt ? cant : -cant;
        filasRender.push({
            m: m,
            esEntrada: esEnt,
            esRegularizacion: false,
            esPreReg: true,
            cant: cant,
            costoUnit: parseFloat(m.costo_unitario || 0),
            importe: parseFloat(m.importe || (cant * (parseFloat(m.costo_unitario) || 0))),
            saldoAcum: parseFloat(saldoPre.toFixed(4)),
            nota: 'Histórico Pre-regularización'
        });
    });

    // B. Movimiento de Regularización
    if (fechaReg) {
        filasRender.push({
            m: {
                fecha: fechaReg,
                created_at: fechaReg,
                tipo: 'Regularización',
                doc_id: 'REG-INVENTARIO',
                contraparte: 'Stock físico verificado en almacén'
            },
            esEntrada: true,
            esRegularizacion: true,
            esPreReg: false,
            cant: stockBase,
            costoUnit: 0,
            importe: 0,
            saldoAcum: stockBase,
            nota: 'Saldo de apertura verificado'
        });
    }

    // C. Movimientos Post-Regularización
    var saldoPost = stockBase;
    movsPostReg.forEach(function(m) {
        var esEnt = _kdxEsEntrada(m.tipo);
        var cant = parseFloat(m.cantidad || 0);
        saldoPost += esEnt ? cant : -cant;
        filasRender.push({
            m: m,
            esEntrada: esEnt,
            esRegularizacion: false,
            esPreReg: false,
            cant: cant,
            costoUnit: parseFloat(m.costo_unitario || 0),
            importe: parseFloat(m.importe || (cant * (parseFloat(m.costo_unitario) || 0))),
            saldoAcum: parseFloat(saldoPost.toFixed(4)),
            nota: m.tipo === 'Recepción OC' ? 'Recepción física OC' : (esEnt ? 'Entrada directa' : 'Despacho a taller')
        });
    });

    window._kdxFilasRender = filasRender;
    window._kdxDibujarTabla(filasRender);
};

// ── Renderizado HTML de la Tabla ──────────────────────────────────
window._kdxDibujarTabla = function(filas) {
    var tbody = document.getElementById('tbodyKardex');
    if (!tbody) return;

    if (!filas || !filas.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2"></i>No hay movimientos que coincidan con la búsqueda</td></tr>';
        return;
    }

    var html = filas.map(function(item) {
        var m = item.m;
        var fechaFmt = _kdxFmtFecha(m.fecha || m.created_at);
        var esEnt = item.esEntrada;
        var esReg = item.esRegularizacion;
        var esPre = item.esPreReg;

        // Badge Tipo
        var badgeTipo = '';
        if (esReg) {
            badgeTipo = `<span class="kdx-badge-tipo kdx-badge-reg"><i class="bi bi-clipboard2-check me-1"></i>REGULARIZACIÓN</span>`;
        } else if (m.tipo === 'Recepción OC' || String(m.tipo).includes('Recep')) {
            badgeTipo = `<span class="kdx-badge-tipo kdx-badge-rec"><i class="bi bi-cart-check me-1"></i>RECEPCIÓN OC</span>`;
        } else if (esEnt) {
            badgeTipo = `<span class="kdx-badge-tipo kdx-badge-ent"><i class="bi bi-box-arrow-in-down me-1"></i>ENTRADA</span>`;
        } else {
            badgeTipo = `<span class="kdx-badge-tipo kdx-badge-sal"><i class="bi bi-wrench-adjustable me-1"></i>SALIDA A TALLER</span>`;
        }

        // Cantidad Entrada / Salida
        var colEntrada = '—';
        var colSalida  = '—';
        if (esReg) {
            colEntrada = `<span class="fw-bold text-success font-monospace" style="font-size:0.86rem;">⊙ ${item.cant.toFixed(2)}</span>`;
        } else if (esEnt) {
            colEntrada = `<span class="fw-bold text-success font-monospace" style="font-size:0.86rem;">+${item.cant.toFixed(2)}</span>`;
        } else {
            colSalida  = `<span class="fw-bold text-danger font-monospace" style="font-size:0.86rem;">-${item.cant.toFixed(2)}</span>`;
        }

        // Costo e Importe
        var colCosto = item.costoUnit > 0 ? `S/ ${item.costoUnit.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
        var colImporte = item.importe > 0 ? `S/ ${item.importe.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

        // Badge Documento
        var docBadge = m.doc_id ? `<span class="badge font-monospace fw-bold" style="font-size:0.75rem; background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:3px 8px;">${_kdxEsc(m.doc_id)}</span>` : '—';

        // Estilo de fila
        var trClass = esReg ? 'table-success bg-opacity-25' : (esPre ? 'bg-light' : '');
        var borderStyle = esReg ? 'border-left: 4px solid #16a34a;' : '';

        return `
            <tr class="${trClass}" style="${borderStyle}">
                <!-- 1. Fecha & Hora -->
                <td class="ps-3 text-secondary fw-semibold font-monospace" style="font-size:0.78rem;">${fechaFmt}</td>

                <!-- 2. Tipo Movimiento -->
                <td>${badgeTipo}</td>

                <!-- 3. Documento -->
                <td>${docBadge}</td>

                <!-- 4. Contraparte / Motivo -->
                <td>
                    <div class="fw-bold text-dark text-truncate" style="max-width: 280px;" title="${_kdxEsc(m.contraparte || '—')}">
                        ${_kdxEsc(m.contraparte || '—')}
                    </div>
                </td>

                <!-- 5. Entrada (+) -->
                <td class="text-end">${colEntrada}</td>

                <!-- 6. Salida (-) -->
                <td class="text-end">${colSalida}</td>

                <!-- 7. Costo Unitario -->
                <td class="text-end text-secondary fw-semibold font-monospace" style="font-size:0.80rem;">${colCosto}</td>

                <!-- 8. Importe Total -->
                <td class="text-end fw-bold text-dark font-monospace" style="font-size:0.82rem;">${colImporte}</td>

                <!-- 9. Saldo Físico Resultante -->
                <td class="text-end">
                    <span class="badge font-monospace fw-black px-2 py-1" style="font-size:0.85rem; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:6px;">
                        ${item.saldoAcum.toFixed(2)}
                    </span>
                </td>

                <!-- 10. Nota / Estado -->
                <td class="pe-3">
                    <span class="text-muted small text-truncate d-inline-block" style="max-width: 170px;" title="${_kdxEsc(item.nota)}">
                        ${_kdxEsc(item.nota)}
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html;
};

// ── Filtro en tiempo real dentro de la tabla ───────────────────────
window._kdxFiltrarTablaInterna = function() {
    var input = document.getElementById('kdx-tabla-filtro');
    if (!input || !window._kdxFilasRender) return;
    var q = input.value.trim().toLowerCase();
    if (!q) {
        window._kdxDibujarTabla(window._kdxFilasRender);
        return;
    }

    var filtradas = window._kdxFilasRender.filter(function(it) {
        var m = it.m;
        return (m.doc_id && m.doc_id.toLowerCase().includes(q)) ||
               (m.tipo && m.tipo.toLowerCase().includes(q)) ||
               (m.contraparte && m.contraparte.toLowerCase().includes(q)) ||
               (it.nota && it.nota.toLowerCase().includes(q)) ||
               (m.fecha && String(m.fecha).toLowerCase().includes(q));
    });

    window._kdxDibujarTabla(filtradas);
};

// ── Exportación a Excel Fina y Exacta ──────────────────────────────
window.exportarKardexExcel = function() {
    var filas = window._kdxFilasRender || [];
    var item  = window._kdxSelItem || { id: window._kdxSelId || 'articulo', descripcion: '' };

    if (!filas.length) {
        alert('No hay movimientos cargados en el Kardex para exportar.');
        return;
    }

    try {
        var dataExcel = filas.map(function(it, idx) {
            var m = it.m;
            return {
                'N°': idx + 1,
                'Fecha & Hora': _kdxFmtFecha(m.fecha || m.created_at),
                'Tipo Movimiento': it.esRegularizacion ? 'Regularización' : m.tipo,
                'Documento': m.doc_id || '',
                'Contraparte / Destino': m.contraparte || '',
                'Entrada (+)': (it.esEntrada || it.esRegularizacion) ? it.cant : 0,
                'Salida (-)': (!it.esEntrada && !it.esRegularizacion) ? it.cant : 0,
                'Costo Unitario': it.costoUnit,
                'Importe Total': it.importe,
                'Saldo Físico Resultante': it.saldoAcum,
                'Nota / Observación': it.nota || ''
            };
        });

        if (window.XLSX) {
            var ws = XLSX.utils.json_to_sheet(dataExcel);
            var wb = XLSX.utils.book_new();
            var sheetName = ('Kardex_' + (item.id || 'Articulo')).substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            XLSX.writeFile(wb, `Kardex_${item.id || 'Articulo'}_${new Date().toISOString().substring(0, 10)}.xlsx`);
        } else {
            var headers = Object.keys(dataExcel[0]).join(';');
            var rows = dataExcel.map(r => Object.values(r).map(val => `"${String(val).replace(/"/g, '""')}"`).join(';')).join('\n');
            var csvContent = "\uFEFF" + headers + "\n" + rows;
            var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            var link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", `Kardex_${item.id || 'Articulo'}_${new Date().toISOString().substring(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    } catch (e) {
        console.error('[Kardex] Error exportando a Excel:', e);
        alert('Error al generar archivo Excel.');
    }
};

// ── Helpers de Formateo ───────────────────────────────────────────
function _kdxFmtFecha(f) {
    if (!f) return '';
    try {
        var s = String(f);
        var d;
        if (s.includes('T') || s.includes(' ')) {
            var clean = s.replace('Z', '').replace(/\.\d+/, '').replace('T', ' ');
            var parts = clean.split(' ');
            var ymd = parts[0].split('-');
            var his = (parts[1] || '00:00:00').split(':');
            if (ymd.length === 3) {
                d = new Date(parseInt(ymd[0], 10), parseInt(ymd[1], 10) - 1, parseInt(ymd[2], 10),
                             parseInt(his[0] || 0, 10), parseInt(his[1] || 0, 10), parseInt(his[2] || 0, 10));
            } else {
                d = new Date(s);
            }
        } else {
            var ymd = s.split('-');
            if (ymd.length === 3) {
                d = new Date(parseInt(ymd[0], 10), parseInt(ymd[1], 10) - 1, parseInt(ymd[2], 10));
            } else {
                d = new Date(s + 'T00:00:00');
            }
        }
        if (isNaN(d.getTime())) return String(f);
        var dateStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
        var timeStr = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
        if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
            return dateStr;
        }
        return dateStr + ' ' + timeStr;
    } catch(e) { return String(f); }
}

function _kdxEsc(s) { 
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); 
}
