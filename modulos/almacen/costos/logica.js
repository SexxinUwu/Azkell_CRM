// ================================================================
// Módulo Valorizado del Almacén — Azkell Fleet
// ================================================================

window.cosValData  = window.cosValData  || null;
window.cosCosData  = window.cosCosData  || null;

window.init_costos = function() {
    window.cosValData = null;
    window.cosCosData = null;
    cosCargar();
};

function cosCargar() {
    // Carga en paralelo: valorizado + costos (top consumo)
    Promise.all([
        fetch('/api/almacen/valorizado').then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
        fetch('/api/almacen/costos').then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; })
    ]).then(function(res) {
        window.cosValData = res[0];
        window.cosCosData = res[1];
        cosRenderKPIs();
        cosRenderTopConsumido();
        cosRenderConsumoTabla();
        cosRenderCaros();
        cosRenderFamilia();
    });
}

// ── KPIs ─────────────────────────────────────────────────────────
function cosRenderKPIs() {
    var val = window.cosValData;
    if (!val) return;

    var elPen = document.getElementById('cos-kpi-pen');
    var elUsd = document.getElementById('cos-kpi-usd');
    var elFam = document.getElementById('cos-kpi-familias');
    var elArt = document.getElementById('cos-kpi-articulos');

    if (elPen) elPen.textContent = 'S/ ' + cosFmt(val.totalPEN || 0);
    if (elUsd) elUsd.textContent = '$ ' + cosFmt(val.totalUSD || 0);
    if (elFam) elFam.textContent = (val.porFamilia || []).length;
    if (elArt) {
        var conStock = (val.items || []).filter(function(i) { return parseFloat(i.stock_actual || 0) > 0; }).length;
        elArt.textContent = conStock;
    }
}

// ── Artículo más consumido (hero) ─────────────────────────────────
function cosRenderTopConsumido() {
    var el = document.getElementById('cos-top-consumido');
    if (!el) return;
    var cos = window.cosCosData;
    if (!cos || !cos.topItems || !cos.topItems.length) {
        el.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--subtext);font-size:0.82rem;">Sin datos de consumo disponibles</div>';
        return;
    }
    // Ordenar por cantidad_total DESC
    var sorted = (cos.topItems || []).slice().sort(function(a, b) {
        return parseFloat(b.cantidad_total || 0) - parseFloat(a.cantidad_total || 0);
    });
    var top = sorted[0];
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    el.innerHTML =
        '<div style="display:flex;align-items:center;gap:16px;padding:1.2rem 1.4rem;">'
        + '<div style="width:52px;height:52px;border-radius:14px;background:rgba(88,101,242,0.1);display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;"><i class="bi bi-box-seam" style="color:var(--primary,#5865F2);"></i></div>'
        + '<div style="flex:1;">'
        + '<div style="font-size:1rem;font-weight:800;color:var(--text);">' + esc(top.descripcion || '—') + '</div>'
        + '<div style="font-size:0.78rem;color:var(--subtext);margin-top:3px;">'
        + (top.familia ? '<span style="background:rgba(88,101,242,0.08);color:var(--primary,#5865F2);border-radius:8px;padding:1px 8px;font-size:0.7rem;font-weight:700;margin-right:6px;">' + esc(top.familia) + '</span>' : '')
        + '</div>'
        + '</div>'
        + '<div style="text-align:right;flex-shrink:0;">'
        + '<div style="font-size:1.4rem;font-weight:800;color:var(--text);">' + cosFmt(top.cantidad_total || 0) + ' <span style="font-size:0.78rem;color:var(--subtext);font-weight:600;">' + esc(top.unidad || 'und') + '</span></div>'
        + '<div style="font-size:0.74rem;color:var(--subtext);">Importe total: <strong style="color:#16a34a;">S/' + cosFmt(top.costo_total || 0) + '</strong></div>'
        + '</div>'
        + '</div>';
}

// ── Top consumo tabla ─────────────────────────────────────────────
function cosRenderConsumoTabla() {
    var tbody = document.getElementById('cos-tbody-consumo');
    if (!tbody) return;
    var cos = window.cosCosData;
    if (!cos || !cos.topItems || !cos.topItems.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--subtext);">Sin movimientos de salida registrados</td></tr>';
        return;
    }
    var sorted = (cos.topItems || []).slice().sort(function(a, b) {
        return parseFloat(b.cantidad_total || 0) - parseFloat(a.cantidad_total || 0);
    }).slice(0, 10);
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    tbody.innerHTML = sorted.map(function(it, i) {
        return '<tr>'
            + '<td style="color:var(--subtext);font-weight:700;text-align:center;width:36px;">' + (i + 1) + '</td>'
            + '<td style="font-weight:600;">' + esc(it.descripcion || '—') + '</td>'
            + '<td><span style="background:rgba(88,101,242,0.08);color:var(--primary,#5865F2);border-radius:8px;padding:1px 8px;font-size:0.7rem;font-weight:700;">' + esc(it.familia || '—') + '</span></td>'
            + '<td style="text-align:right;font-weight:700;">' + cosFmt(it.cantidad_total || 0) + ' <span style="color:var(--subtext);font-size:0.75rem;">' + esc(it.unidad || '') + '</span></td>'
            + '<td style="text-align:right;font-weight:700;color:#16a34a;">S/ ' + cosFmt(it.costo_total || 0) + '</td>'
            + '</tr>';
    }).join('');
}

// ── Artículos más caros ───────────────────────────────────────────
function cosRenderCaros() {
    var tbody = document.getElementById('cos-tbody-caros');
    if (!tbody) return;
    var val = window.cosValData;
    if (!val || !val.items || !val.items.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--subtext);">Sin artículos en inventario</td></tr>';
        return;
    }
    var sorted = (val.items || []).slice().sort(function(a, b) {
        return parseFloat(b.costo_referencial || 0) - parseFloat(a.costo_referencial || 0);
    }).slice(0, 10);
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    tbody.innerHTML = sorted.map(function(it, i) {
        var monSym = it.moneda === 'USD' ? '$' : 'S/';
        return '<tr>'
            + '<td style="color:var(--subtext);font-weight:700;text-align:center;width:36px;">' + (i + 1) + '</td>'
            + '<td style="font-weight:600;">' + esc(it.descripcion || '—') + '</td>'
            + '<td><span style="background:rgba(22,163,74,0.08);color:#16a34a;border-radius:8px;padding:1px 8px;font-size:0.7rem;font-weight:700;">' + esc(it.familia || '—') + '</span></td>'
            + '<td style="text-align:right;">' + cosFmt(it.stock_actual || 0) + ' <span style="color:var(--subtext);font-size:0.75rem;">' + esc(it.unidad || '') + '</span></td>'
            + '<td style="text-align:right;font-weight:700;">' + monSym + ' ' + cosFmt(it.costo_referencial || 0) + '</td>'
            + '<td style="text-align:right;font-weight:700;color:#16a34a;">' + monSym + ' ' + cosFmt(it.valor_total || 0) + '</td>'
            + '</tr>';
    }).join('');
}

// ── Valorizado por familia ─────────────────────────────────────────
function cosRenderFamilia() {
    var tbody = document.getElementById('cos-tbody-familia');
    if (!tbody) return;
    var val = window.cosValData;
    if (!val || !val.porFamilia || !val.porFamilia.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--subtext);">Sin familias disponibles</td></tr>';
        return;
    }
    var familias = val.porFamilia;
    var maxVal = familias.reduce(function(m, f) { return Math.max(m, f.valor_pen || 0); }, 0.01);
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var totalPEN = val.totalPEN || 0.01;
    tbody.innerHTML = familias.map(function(f) {
        var pct = totalPEN > 0 ? Math.round((f.valor_pen || 0) / totalPEN * 100) : 0;
        var barW = maxVal > 0 ? Math.round((f.valor_pen || 0) / maxVal * 100) : 0;
        return '<tr>'
            + '<td style="font-weight:700;">' + esc(f.familia || '—') + '</td>'
            + '<td style="text-align:right;color:var(--subtext);">' + (f.articulos || 0) + '</td>'
            + '<td style="text-align:right;font-weight:700;color:#16a34a;">S/ ' + cosFmt(f.valor_pen || 0) + '</td>'
            + '<td><div class="cos-bar-wrap"><div class="cos-bar-fill" style="width:' + barW + '%"></div></div></td>'
            + '<td style="text-align:right;font-size:0.8rem;color:var(--subtext);">' + pct + '%</td>'
            + '</tr>';
    }).join('');
}

// ── Helper formatear número ───────────────────────────────────────
function cosFmt(n) {
    return parseFloat(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
