// ================================================================
// 📦 MÓDULO ALMACÉN / INVENTARIO - LÓGICA AISLADA
// ================================================================

let dataGlobalAlmacen = [];
let expandAlmacenMap = {};
let expandAllAlmacenState = true;

// ================================================================
// 📊 FUNCIONES DE CARGAR DATOS
// ================================================================
function cargarTablaAlmacen() {
    const btn = document.querySelector('[onclick*="recargarModulo"]');
    if (btn) btn.disabled = true;

    cargarModulo('almacen', mostrarAlmacen, 'obtenerDatosAlmacen', () => {
        if (btn) btn.disabled = false;
    });
}

window.filtrarTablaAlmacen = function() {
    const tabla = document.getElementById('tablaAlmacen');
    if (!tabla) return;
    const busca = (document.getElementById('busquedaAlmacen')?.value || '').toLowerCase();
    const filas = tabla.querySelectorAll('tbody tr');

    filas.forEach(fila => {
        const texto = fila.textContent.toLowerCase();
        fila.style.display = texto.includes(busca) ? '' : 'none';
    });
};

window.sortTableAlmacen = function(columnIndex) {
    const tabla = document.getElementById('tablaAlmacen');
    if (!tabla) return;

    const tbody = tabla.querySelector('tbody');
    const filas = Array.from(tbody.querySelectorAll('tr'));
    const isAscending = tabla.dataset.sortDir !== 'asc';

    filas.sort((a, b) => {
        const aText = a.cells[columnIndex]?.textContent.trim() || '';
        const bText = b.cells[columnIndex]?.textContent.trim() || '';
        const aNum = parseFloat(aText) || aText;
        const bNum = parseFloat(bText) || bText;

        if (typeof aNum === 'number' && typeof bNum === 'number') {
            return isAscending ? aNum - bNum : bNum - aNum;
        }
        return isAscending ? aText.localeCompare(bText) : bText.localeCompare(aText);
    });

    filas.forEach(fila => tbody.appendChild(fila));
    tabla.dataset.sortDir = isAscending ? 'asc' : 'desc';
};

// ================================================================
// 📋 MOSTRAR ALMACÉN
// ================================================================
function mostrarAlmacen(datos) {
    dataGlobalAlmacen = datos;
    window.dataGlobalAlmacen = datos;

    let html = '';

    if (!datos || datos.length === 0) {
        html = '<tr><td colspan="7" class="text-center py-4 text-muted">No hay repuestos en el inventario.</td></tr>';
    } else {
        datos.forEach(item => {
            const codigo = item.codigo || item[0] || '-';
            const descripcion = item.descripcion || item[1] || '-';
            const stock = item.stock || item[2] || 0;
            const stockMin = item.stock_min || item[3] || 0;
            const precio = parseFloat(item.precio || item[4] || 0).toFixed(2);
            const proveedor = item.proveedor || item[5] || '-';

            const badgeStock = stock <= stockMin ? 'badge bg-danger' : (stock < stockMin * 1.5 ? 'badge bg-warning' : 'badge bg-success');
            const total = (stock * precio).toFixed(2);

            html += `
            <tr>
                <td class="fw-bold" style="color: #0f172a;">${codigo}</td>
                <td>${descripcion}</td>
                <td>
                    <span class="${badgeStock}">${stock} un.</span>
                </td>
                <td class="text-muted">${stockMin}</td>
                <td class="text-primary fw-bold">$${precio}</td>
                <td>${proveedor}</td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm" role="group">
                        <button type="button" class="btn btn-sm btn-outline-primary" onclick="abrirMovimientoAlmacen('${codigo}')" title="Registrar movimiento">
                            <i class="bi bi-arrow-left-right"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-info" onclick="verKardex('${codigo}')" title="Ver Kardex">
                            <i class="bi bi-clock-history"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-warning" onclick="editarRepuesto('${codigo}')" title="Editar">
                            <i class="bi bi-pencil"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        });
    }

    const tbody = document.getElementById('cuerpoTablaAlmacen');
    if (tbody) tbody.innerHTML = html;
}

// ================================================================
// 🔲 MODALES Y FUNCIONES DE EDICIÓN
// ================================================================
window.abrirModalNuevoRepuesto = function() {
    document.getElementById('formNuevoRepuesto').reset();
    document.getElementById('tituloModalRepuesto').innerHTML = '<i class="bi bi-box-fill"></i> Nuevo Repuesto';
    const modal = new bootstrap.Modal(document.getElementById('modalNuevoRepuesto'));
    modal.show();
};

window.abrirMovimientoAlmacen = function(codigo) {
    document.getElementById('mov_codigo_repuesto').value = codigo;
    document.getElementById('formMovimientoAlmacen').reset();
    const modal = new bootstrap.Modal(document.getElementById('modalMovimientoAlmacen'));
    modal.show();
};

window.editarRepuesto = function(codigo) {
    const repuesto = dataGlobalAlmacen.find(r => (r.codigo || r[0]) === codigo);
    if (!repuesto) {
        alert('Repuesto no encontrado');
        return;
    }

    document.getElementById('a_codigo').value = repuesto.codigo || repuesto[0];
    document.getElementById('a_descripcion').value = repuesto.descripcion || repuesto[1];
    document.getElementById('a_stock').value = repuesto.stock || repuesto[2];
    document.getElementById('a_stock_min').value = repuesto.stock_min || repuesto[3];
    document.getElementById('a_precio').value = repuesto.precio || repuesto[4];
    document.getElementById('a_proveedor').value = repuesto.proveedor || repuesto[5];
    document.getElementById('a_categoria').value = repuesto.categoria || repuesto[6] || '';

    document.getElementById('tituloModalRepuesto').innerHTML = '<i class="bi bi-pencil-square"></i> Editar Repuesto';
    const modal = new bootstrap.Modal(document.getElementById('modalNuevoRepuesto'));
    modal.show();
};

window.verKardex = function(codigo) {
    const repuesto = dataGlobalAlmacen.find(r => (r.codigo || r[0]) === codigo);
    if (!repuesto) return;

    document.getElementById('tituloOffcanvasKardex').innerHTML = `<i class="bi bi-clock-history"></i> Kardex: ${codigo}`;

    // Simulación: en producción, obtener datos del backend
    let html = `<tr><td colspan="4" class="text-center py-3 text-muted small">Registro de movimientos para: <strong>${codigo}</strong></td></tr>`;
    const tbody = document.getElementById('cuerpoTablaKardex');
    if (tbody) tbody.innerHTML = html;

    const offcanvas = new bootstrap.Offcanvas(document.getElementById('offcanvasKardexAlmacen'));
    offcanvas.show();
};

// ================================================================
// 💾 GUARDAR Y ENVIAR
// ================================================================
function guardarRepuesto(event, formObj) {
    event.preventDefault();
    const btn = document.getElementById('btnGuardarRepuesto');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    let datos = {
        codigo: document.getElementById('a_codigo').value,
        descripcion: document.getElementById('a_descripcion').value,
        stock: document.getElementById('a_stock').value,
        stock_min: document.getElementById('a_stock_min').value,
        precio: document.getElementById('a_precio').value,
        proveedor: document.getElementById('a_proveedor').value,
        categoria: document.getElementById('a_categoria').value
    };

    fetch('/api/script/guardarRepuesto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [datos] })
    })
    .then(res => res.json())
    .then(r => {
        if (r.data === 'Éxito' || r.success) {
            bootstrap.Modal.getInstance(document.getElementById('modalNuevoRepuesto')).hide();
            cargarTablaAlmacen();
        } else {
            alert("Error: " + (r.data || r.error || 'Unknown error'));
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-save"></i> Guardar';
    }).catch(e => {
        alert("Error: " + e.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-save"></i> Guardar';
    });
}

window.guardarMovimiento = function(event, formObj) {
    event.preventDefault();

    let datos = {
        codigo: document.getElementById('mov_codigo_repuesto').value,
        tipo: document.getElementById('mov_tipo').value,
        cantidad: document.getElementById('mov_cantidad').value,
        referencia: document.getElementById('mov_referencia').value,
        observaciones: document.getElementById('mov_observaciones').value
    };

    fetch('/api/script/registrarMovimientoAlmacen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [datos] })
    })
    .then(res => res.json())
    .then(r => {
        if (r.data === 'Éxito' || r.success) {
            bootstrap.Modal.getInstance(document.getElementById('modalMovimientoAlmacen')).hide();
            cargarTablaAlmacen();
        } else {
            alert("Error: " + (r.data || r.error || 'Unknown error'));
        }
    }).catch(e => {
        alert("Error: " + e.message);
    });
};

// ================================================================
// 📥 EXPORT / IMPORT
// ================================================================
window.exportarAlmacenExcel = function() {
    const tabla = document.getElementById('tablaAlmacen');
    if (!tabla || !dataGlobalAlmacen.length) {
        alert('No hay datos para exportar');
        return;
    }
    descargarExcelDinamico('tablaAlmacen', 'Inventario_Almacen');
};

// ================================================================
// 🎯 MÓDULO INIT
// ================================================================
window.init_inventario = function() {
    if(typeof cargarTablaAlmacen === 'function') {
        cargarTablaAlmacen();
    }
};
