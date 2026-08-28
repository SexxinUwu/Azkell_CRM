// =========================================================================
// MÓDULO: MATRIZ DE COMBUSTIBLE (D2)
// =========================================================================

(function() {
    'use strict';

    window._matrizCombustible = window._matrizCombustible || {
        rutas: [],
        rutasFiltradas: [],
        itemsImportar: []
    };

    // 1. Cargar Rutas desde la API Local (/api/combustible/matriz)
    window.matrizCargarRutas = async function() {
        const tbody = document.getElementById('matriz-tbody');
        const emptyState = document.getElementById('matriz-empty-state');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="13" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Cargando Matriz de Combustible...</td></tr>`;
        }

        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const res = await fetch('/api/combustible/matriz', {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'Content-Type': 'application/json'
                }
            });
            const json = await res.json();
            if (json.ok && Array.isArray(json.data)) {
                window._matrizCombustible.rutas = json.data;
                window.matrizPoblarFiltrosDinamicos(json.data);
                window.matrizFiltrarTabla();
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger py-4">${json.error || 'Error al obtener datos'}</td></tr>`;
            }
        } catch (err) {
            console.error("Error al cargar matriz:", err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger py-4">Error de conexión al servidor.</td></tr>`;
        }
    };

    // 1.1. Poblar Filtros Select Dinámicamente con los Datos de la Tabla
    window.matrizPoblarFiltrosDinamicos = function(rutas) {
        const data = rutas || window._matrizCombustible.rutas || [];

        const selSentido = document.getElementById('matriz-filtro-sentido');
        const selMotor = document.getElementById('matriz-filtro-motor');
        const selConfg = document.getElementById('matriz-filtro-confg');

        if (selSentido) {
            const currentVal = selSentido.value || 'ALL';
            const sentidos = [...new Set(data.map(r => (r.sentido || '').trim().toUpperCase()).filter(Boolean))].sort();
            let opts = `<option value="ALL">Todos los Sentidos</option>`;
            sentidos.forEach(s => {
                opts += `<option value="${s}" ${currentVal === s ? 'selected' : ''}>${s}</option>`;
            });
            selSentido.innerHTML = opts;
        }

        if (selMotor) {
            const currentVal = selMotor.value || 'ALL';
            const motores = [...new Set(data.map(r => (r.motor || '').trim().toUpperCase()).filter(Boolean))].sort();
            let opts = `<option value="ALL">Todos los Motores</option>`;
            motores.forEach(m => {
                opts += `<option value="${m}" ${currentVal === m ? 'selected' : ''}>${m}</option>`;
            });
            selMotor.innerHTML = opts;
        }

        if (selConfg) {
            const currentVal = selConfg.value || 'ALL';
            const confgs = [...new Set(data.map(r => (r.confg || '').trim().toUpperCase()).filter(Boolean))].sort();
            let opts = `<option value="ALL">Todas las Confg.</option>`;
            confgs.forEach(c => {
                opts += `<option value="${c}" ${currentVal === c ? 'selected' : ''}>${c}</option>`;
            });
            selConfg.innerHTML = opts;
        }
    };

    // 2. Filtrar y Renderizar Filas de la Tabla
    window.matrizFiltrarTabla = function() {
        const q = (document.getElementById('matriz-filtro-buscar')?.value || '').toLowerCase().trim();
        const sentido = document.getElementById('matriz-filtro-sentido')?.value || 'ALL';
        const motor = document.getElementById('matriz-filtro-motor')?.value || 'ALL';
        const confg = document.getElementById('matriz-filtro-confg')?.value || 'ALL';

        let lista = window._matrizCombustible.rutas.filter(r => {
            if (sentido !== 'ALL' && r.sentido !== sentido) return false;
            if (motor !== 'ALL' && r.motor !== motor) return false;
            if (confg !== 'ALL' && r.confg !== confg) return false;
            if (q) {
                const match = (r.ruta || '').toLowerCase().includes(q) ||
                              (r.motor || '').toLowerCase().includes(q) ||
                              (r.confg || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            return true;
        });

        window._matrizCombustible.rutasFiltradas = lista;

        const badgeTotal = document.getElementById('matriz-total-badge');
        if (badgeTotal) badgeTotal.innerText = `${lista.length} ruta${lista.length === 1 ? '' : 's'}`;

        const tbody = document.getElementById('matriz-tbody');
        const emptyState = document.getElementById('matriz-empty-state');

        if (!tbody) return;

        if (lista.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('d-none');
            return;
        }

        if (emptyState) emptyState.classList.add('d-none');

        tbody.innerHTML = lista.map(r => {
            const sentidoBadge = r.sentido === 'IDA' 
                ? `<span class="badge-sentido badge-sentido-ida">IDA</span>`
                : `<span class="badge-sentido badge-sentido-retorno">RETORNO</span>`;

            return `
            <tr>
                <td>${sentidoBadge}</td>
                <td class="fw-bold text-dark text-truncate" style="max-width: 200px;" title="${r.ruta}">
                    ${r.ruta}
                </td>
                <td class="text-center font-monospace">${r.motor || '—'}</td>
                <td class="text-center"><span class="badge bg-light text-dark border font-monospace">${r.confg || '—'}</span></td>
                <td class="td-num td-num-0">${parseFloat(r.km_0 || 0).toFixed(2)}</td>
                <td class="td-num">${parseFloat(r.km_5 || 0).toFixed(2)}</td>
                <td class="td-num">${parseFloat(r.km_10 || 0).toFixed(2)}</td>
                <td class="td-num">${parseFloat(r.km_15 || 0).toFixed(2)}</td>
                <td class="td-num">${parseFloat(r.km_20 || 0).toFixed(2)}</td>
                <td class="td-num">${parseFloat(r.km_25 || 0).toFixed(2)}</td>
                <td class="td-num td-num-30">${parseFloat(r.km_30 || 0).toFixed(2)}</td>
                <td class="td-km">${parseFloat(r.km || 0).toLocaleString('es-PE', { minimumFractionDigits: 0 })} Km</td>
                <td class="text-center">
                    <div class="d-inline-flex gap-1">
                        <button class="btn btn-outline-secondary btn-sm py-0 px-1.5 rounded-2" title="Editar Ruta" onclick="window.matrizAbrirModalEditar(${r.id})">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm py-0 px-1.5 rounded-2" title="Eliminar Ruta" onclick="window.matrizEliminarRuta(${r.id}, '${r.ruta}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    };

    // 3. Limpiar Filtros
    window.matrizLimpiarFiltros = function() {
        const inp = document.getElementById('matriz-filtro-buscar');
        if (inp) inp.value = '';
        const selS = document.getElementById('matriz-filtro-sentido');
        if (selS) selS.value = 'ALL';
        const selM = document.getElementById('matriz-filtro-motor');
        if (selM) selM.value = 'ALL';
        const selC = document.getElementById('matriz-filtro-confg');
        if (selC) selC.value = 'ALL';
        window.matrizFiltrarTabla();
    };

    // 4. Modal Crear / Editar
    window.matrizAbrirModalCrear = function() {
        document.getElementById('modal-matriz-titulo').innerText = 'Nueva Ruta en Matriz';
        document.getElementById('form-matriz-id').value = '';
        document.getElementById('form-matriz-sentido').value = 'IDA';
        document.getElementById('form-matriz-ruta').value = '';
        document.getElementById('form-matriz-motor').value = 'MC11.44';
        document.getElementById('form-matriz-confg').value = 'T3';
        document.getElementById('form-matriz-km').value = '';
        
        ['0', '5', '10', '15', '20', '25', '30'].forEach(tn => {
            const el = document.getElementById(`form-matriz-${tn}`);
            if (el) el.value = '';
        });

        const modalEl = document.getElementById('modalFormMatriz');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.matrizAbrirModalEditar = function(id) {
        const r = window._matrizCombustible.rutas.find(x => x.id === id);
        if (!r) return;

        document.getElementById('modal-matriz-titulo').innerText = `Editar Ruta: ${r.ruta}`;
        document.getElementById('form-matriz-id').value = r.id;
        document.getElementById('form-matriz-sentido').value = r.sentido || 'IDA';
        document.getElementById('form-matriz-ruta').value = r.ruta || '';
        document.getElementById('form-matriz-motor').value = r.motor || 'MC11.44';
        document.getElementById('form-matriz-confg').value = r.confg || 'T3';
        document.getElementById('form-matriz-km').value = r.km || '';

        ['0', '5', '10', '15', '20', '25', '30'].forEach(tn => {
            const el = document.getElementById(`form-matriz-${tn}`);
            if (el) el.value = r[`km_${tn}`] !== undefined ? r[`km_${tn}`] : '';
        });

        const modalEl = document.getElementById('modalFormMatriz');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // 5. Guardar Formulario (Crear / Actualizar)
    window.matrizGuardarFormulario = async function(e) {
        e.preventDefault();
        const id = document.getElementById('form-matriz-id').value;
        const payload = {
            sentido: document.getElementById('form-matriz-sentido').value,
            ruta: document.getElementById('form-matriz-ruta').value,
            motor: document.getElementById('form-matriz-motor').value,
            confg: document.getElementById('form-matriz-confg').value,
            km: parseFloat(document.getElementById('form-matriz-km').value || 0),
            km_0: parseFloat(document.getElementById('form-matriz-0').value || 0),
            km_5: parseFloat(document.getElementById('form-matriz-5').value || 0),
            km_10: parseFloat(document.getElementById('form-matriz-10').value || 0),
            km_15: parseFloat(document.getElementById('form-matriz-15').value || 0),
            km_20: parseFloat(document.getElementById('form-matriz-20').value || 0),
            km_25: parseFloat(document.getElementById('form-matriz-25').value || 0),
            km_30: parseFloat(document.getElementById('form-matriz-30').value || 0)
        };

        const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
        const url = id ? `/api/combustible/matriz/${id}` : '/api/combustible/matriz';
        const method = id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.ok) {
                bootstrap.Modal.getInstance(document.getElementById('modalFormMatriz'))?.hide();
                window.matrizCargarRutas();
            } else {
                alert(json.error || 'Error al guardar ruta');
            }
        } catch (err) {
            console.error("Error al guardar ruta:", err);
            alert('Error de comunicación con el servidor.');
        }
    };

    // 6. Eliminar Ruta
    window.matrizEliminarRuta = async function(id, nombre) {
        if (!confirm(`¿Está seguro de eliminar la ruta "${nombre}" de la matriz?`)) return;

        const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
        try {
            const res = await fetch(`/api/combustible/matriz/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'Content-Type': 'application/json'
                }
            });
            const json = await res.json();
            if (json.ok) {
                window.matrizCargarRutas();
            } else {
                alert(json.error || 'Error al eliminar');
            }
        } catch (err) {
            alert('Error al intentar eliminar la ruta.');
        }
    };

    // 7. Descargar Plantilla Excel
    window.matrizDescargarPlantilla = function() {
        if (typeof XLSX === 'undefined') {
            alert('Librería SheetJS no encontrada.');
            return;
        }

        const plantillaRows = [
            { SENTIDO: 'IDA', RUTA: 'LIMA - ICA', MOTOR: 'MC11.44', CONFG: 'T3', '0': 23.13, '5': 24.50, '10': 26.24, '15': 28.28, '20': 30.71, '25': 33.93, '30': 37.24, KM: 330 },
            { SENTIDO: 'IDA', RUTA: 'LIMA - NASCA', MOTOR: 'MC11.44', CONFG: 'T3', '0': 32.50, '5': 34.50, '10': 37.03, '15': 40.00, '20': 43.53, '25': 48.21, '30': 53.03, KM: 480 },
            { SENTIDO: 'IDA', RUTA: 'LIMA - AREQUIPA', MOTOR: 'MC11.44', CONFG: 'T3', '0': 74.91, '5': 77.50, '10': 83.27, '15': 106.15, '20': 115.65, '25': 125.02, '30': 133.75, KM: 1050 }
        ];

        const ws = XLSX.utils.json_to_sheet(plantillaRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Matriz_Combustible_D2");
        XLSX.writeFile(wb, "Plantilla_Matriz_Combustible_D2.xlsx");
    };

    // 8. Exportar Matriz Actual a Excel
    window.matrizExportarExcel = function() {
        if (typeof XLSX === 'undefined') {
            alert('Librería SheetJS no disponible.');
            return;
        }

        const lista = window._matrizCombustible.rutasFiltradas.length > 0 
            ? window._matrizCombustible.rutasFiltradas 
            : window._matrizCombustible.rutas;

        if (!lista.length) {
            alert('No hay registros para exportar.');
            return;
        }

        const exportData = lista.map(r => ({
            'SENTIDO': r.sentido,
            'RUTA': r.ruta,
            'MOTOR': r.motor,
            'CONFG': r.confg,
            '0': parseFloat(r.km_0 || 0),
            '5': parseFloat(r.km_5 || 0),
            '10': parseFloat(r.km_10 || 0),
            '15': parseFloat(r.km_15 || 0),
            '20': parseFloat(r.km_20 || 0),
            '25': parseFloat(r.km_25 || 0),
            '30': parseFloat(r.km_30 || 0),
            'KM': parseFloat(r.km || 0)
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Matriz_D2");
        XLSX.writeFile(wb, `Matriz_Combustible_D2_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // 9. Importar Excel (Lectura y Subida)
    window.matrizAbrirModalImportar = function() {
        window._matrizCombustible.itemsImportar = [];
        document.getElementById('input-archivo-matriz').value = '';
        document.getElementById('nombre-archivo-importar').innerText = 'Archivos compatibles: .xlsx, .xls, .csv';
        document.getElementById('preview-import-container').classList.add('d-none');
        document.getElementById('btn-confirmar-importar').disabled = true;

        const modalEl = document.getElementById('modalImportarMatriz');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.matrizPrevisualizarArchivo = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        document.getElementById('nombre-archivo-importar').innerText = `Archivo seleccionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.SheetNames[0];
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

                if (!rows.length) {
                    alert('El archivo no contiene filas de datos.');
                    return;
                }

                window._matrizCombustible.itemsImportar = rows;
                document.getElementById('preview-filas-count').innerText = rows.length;
                document.getElementById('preview-import-container').classList.remove('d-none');
                document.getElementById('btn-confirmar-importar').disabled = false;
            } catch (err) {
                console.error("Error leyendo Excel:", err);
                alert('No se pudo procesar el archivo Excel.');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    window.matrizEjecutarImportacion = async function() {
        const items = window._matrizCombustible.itemsImportar;
        if (!items || !items.length) return;

        const btn = document.getElementById('btn-confirmar-importar');
        if (btn) { btn.disabled = true; btn.innerText = 'Importando...'; }

        const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
        try {
            const res = await fetch('/api/combustible/matriz/importar', {
                method: 'POST',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ items: items })
            });
            const json = await res.json();
            if (json.ok) {
                bootstrap.Modal.getInstance(document.getElementById('modalImportarMatriz'))?.hide();
                alert(json.message || `Se importaron ${json.insertados} registros.`);
                window.matrizCargarRutas();
            } else {
                alert(json.error || 'Error al importar.');
                if (btn) { btn.disabled = false; btn.innerText = 'Subir e Importar'; }
            }
        } catch (err) {
            console.error("Error al importar:", err);
            alert('Error en la comunicación con el servidor.');
            if (btn) { btn.disabled = false; btn.innerText = 'Subir e Importar'; }
        }
    };

    // Inicializar al cargar la vista
    window.matrizCargarRutas();

})();
