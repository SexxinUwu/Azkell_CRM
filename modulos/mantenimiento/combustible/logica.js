/**
 * logica.js — Control y Análisis de Combustible
 * ERP Azkell Fleet
 */

(function() {
    window.combDatos = [];

    window.combCargarDatos = async function() {
        const tbody = document.getElementById('comb-table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-warning me-2"></div> Carga de abastecimientos...</td></tr>';
        }

        try {
            const res = await fetch('/api/combustible/abastecimientos?t=' + Date.now());
            let data = [];
            if (res.ok) {
                const json = await res.json();
                data = Array.isArray(json) ? json : (json.data || []);
            }

            // Datos de respaldo demostrativos si aún no hay tablas de abastecimiento de combustible cargadas
            if (!data || !data.length) {
                data = [
                    { id: 1, fecha: '2026-08-18', placa: 'CFS755', conductor: 'ELVIS CIRO FLORES', grifo: 'REPSOL LURIN', galones: 45.5, precio_gln: 18.20, costo_total: 828.10, km_ant: 112000, km_act: 112280, tipo: 'Diésel B5' },
                    { id: 2, fecha: '2026-08-17', placa: 'CMM734', conductor: 'FLORENCIO LLOQUE', grifo: 'PRIMAX ATE', galones: 50.0, precio_gln: 18.50, costo_total: 925.00, km_ant: 85400, km_act: 85720, tipo: 'Diésel B5' },
                    { id: 3, fecha: '2026-08-16', placa: 'BER940', conductor: 'EINE ARTEMIO CARRASCO', grifo: 'PETROPERU KM 28', galones: 38.0, precio_gln: 17.90, costo_total: 680.20, km_ant: 198200, km_act: 198440, tipo: 'Diésel B5' }
                ];
            }

            window.combDatos = data;
            window.combActualizarKPIs(data);
            window.combRenderTabla(data);

        } catch (err) {
            console.error("Error en combCargarDatos:", err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="12" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle me-1"></i> Error al cargar datos: ${err.message}</td></tr>`;
            }
        }
    };

    window.combActualizarKPIs = function(list) {
        let totGal = 0;
        let totCosto = 0;
        let totKmAcc = 0;
        let countRend = 0;
        const setPlacas = new Set();

        list.forEach(item => {
            const gal = Number(item.galones || 0);
            const costo = Number(item.costo_total || (gal * Number(item.precio_gln || 0)));
            const kmDiff = (Number(item.km_act || 0) - Number(item.km_ant || 0));

            totGal += gal;
            totCosto += costo;
            if (item.placa) setPlacas.add(item.placa.trim());

            if (gal > 0 && kmDiff > 0) {
                totKmAcc += (kmDiff / gal);
                countRend++;
            }
        });

        const rendProm = countRend > 0 ? (totKmAcc / countRend).toFixed(2) : '0.0';

        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setTxt('comb-kpi-galones', `${totGal.toFixed(1)} Gln`);
        setTxt('comb-kpi-costo', `S/ ${totCosto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        setTxt('comb-kpi-rendimiento', `${rendProm} Km/Gln`);
        setTxt('comb-kpi-unidades', setPlacas.size);
    };

    window.combRenderTabla = function(list) {
        const tbody = document.getElementById('comb-table-body');
        if (!tbody) return;

        if (!list || !list.length) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-5">No se encontraron abastecimientos de combustible.</td></tr>';
            return;
        }

        let html = '';
        list.forEach((item, index) => {
            const gal = Number(item.galones || 0);
            const costo = Number(item.costo_total || (gal * Number(item.precio_gln || 0)));
            const kmDiff = Number(item.km_act || 0) - Number(item.km_ant || 0);
            const rend = (gal > 0 && kmDiff > 0) ? (kmDiff / gal).toFixed(2) : null;

            let badgeRend = '<span class="badge bg-light text-muted border">---</span>';
            if (rend !== null) {
                if (rend >= 6.0) badgeRend = `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 font-monospace fw-bold">${rend} Km/Gln</span>`;
                else if (rend >= 4.5) badgeRend = `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 font-monospace fw-bold">${rend} Km/Gln</span>`;
                else badgeRend = `<span class="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 font-monospace fw-bold">${rend} Km/Gln</span>`;
            }

            html += `
                <tr>
                    <td class="ps-3 text-muted small fw-bold">${index + 1}</td>
                    <td class="text-muted small">${item.fecha || '---'}</td>
                    <td><span class="badge bg-dark text-white font-monospace fw-bold px-2 py-1">${item.placa || '---'}</span></td>
                    <td class="small fw-semibold text-truncate" style="max-width: 140px;" title="${item.conductor||''}">${item.conductor || '---'}</td>
                    <td class="small text-muted text-truncate" style="max-width: 130px;" title="${item.grifo||''}">${item.grifo || '---'}</td>
                    <td class="text-end fw-bold">${gal.toFixed(2)}</td>
                    <td class="text-end text-muted small">S/ ${Number(item.precio_gln||0).toFixed(2)}</td>
                    <td class="text-end fw-bold text-success">S/ ${costo.toFixed(2)}</td>
                    <td class="text-end text-muted small">${Number(item.km_ant||0).toLocaleString()}</td>
                    <td class="text-end fw-semibold">${Number(item.km_act||0).toLocaleString()}</td>
                    <td class="text-center">${badgeRend}</td>
                    <td class="text-center pe-3">
                        <button class="btn btn-xs btn-outline-primary rounded-pill px-2 py-0 fw-bold" onclick="alert('Visualizador de abastecimiento en construcción')">
                            <i class="bi bi-eye"></i> Detalle
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    };

    window.combFiltrar = function() {
        const q = (document.getElementById('comb-filtro-search')?.value || '').toLowerCase().trim();
        const tipo = (document.getElementById('comb-filtro-tipo')?.value || '');

        const filtrados = (window.combDatos || []).filter(item => {
            if (tipo && (item.tipo || '').toLowerCase() !== tipo.toLowerCase()) return false;
            if (q) {
                const matchPlaca = (item.placa || '').toLowerCase().includes(q);
                const matchCond = (item.conductor || '').toLowerCase().includes(q);
                const matchGrifo = (item.grifo || '').toLowerCase().includes(q);
                if (!matchPlaca && !matchCond && !matchGrifo) return false;
            }
            return true;
        });

        window.combActualizarKPIs(filtrados);
        window.combRenderTabla(filtrados);
    };

    window.combExportarExcel = function() {
        if (!window.combDatos || !window.combDatos.length) return alert('No hay datos para exportar.');
        alert('Generando reporte Excel de abastecimientos de combustible...');
    };

    window.combNuevoAbastecimiento = function() {
        alert('Abriendo formulario de registro de abastecimiento de combustible...');
    };

    // Auto-inicialización al cargar la vista
    window.combCargarDatos();
})();
