// ── Módulo Directorio / Clientes — Lógica Azkell ERP ──────────────────────
window.cliData = [];
window.cliFiltrados = [];
window.cliPaginaActual = 1;
window.cliFilasPorPagina = 30;
window.cliClienteSeleccionado = null;

window.init_clientes = function() {
    window.cliCargar();
};

// ── Cargar Clientes desde Backend ─────────────────────────────────────────────
window.cliCargar = function() {
    var tbody = document.getElementById('cli-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2 text-primary"></div>Cargando clientes...</td></tr>';

    fetch('/api/clientes')
        .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function(data) {
            window.cliData = data || [];
            window.cliFiltrar();
        })
        .catch(function(err) {
            console.error('Error cargando clientes:', err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle me-1"></i>Error al cargar los clientes</td></tr>';
        });
};

// ── Filtrado y Paginación ────────────────────────────────────────────────────
window.cliFiltrar = function() {
    var busqueda = (document.getElementById('cliBuscador')?.value || '').trim().toLowerCase();
    
    window.cliFiltrados = window.cliData.filter(function(c) {
        var matchTxt = !busqueda || 
            (c.razon_social && c.razon_social.toLowerCase().includes(busqueda)) ||
            (c.ruc_dni && c.ruc_dni.toLowerCase().includes(busqueda)) ||
            (c.telefono && c.telefono.toLowerCase().includes(busqueda)) ||
            (c.email && c.email.toLowerCase().includes(busqueda));
        return matchTxt;
    });

    window.cliPaginaActual = 1;
    window.cliActualizarKPIs();
    window.cliRenderTabla();
};

window.cliActualizarKPIs = function() {
    var total = window.cliData.length;
    var activos = window.cliData.filter(function(c) { return (c.estado || '').toLowerCase() === 'activo'; }).length;
    var inactivos = total - activos;
    var totalFlota = window.cliData.reduce(function(acc, c) { return acc + (parseInt(c.total_flota) || 0); }, 0);

    var elTotal = document.getElementById('cli-kpi-total');   if (elTotal) elTotal.textContent = total;
    var elAct = document.getElementById('cli-kpi-activos');   if (elAct) elAct.textContent = activos;
    var elInact = document.getElementById('cli-kpi-inactivos'); if (elInact) elInact.textContent = inactivos;
    var elFlota = document.getElementById('cli-kpi-flota');  if (elFlota) elFlota.textContent = totalFlota;
};

window.cliRenderTabla = function() {
    var tbody = document.getElementById('cli-tbody');
    if (!tbody) return;

    if (!window.cliFiltrados.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><i class="bi bi-inbox me-1"></i>No se encontraron clientes</td></tr>';
        document.getElementById('cli-paginacion').innerHTML = '';
        return;
    }

    var inicio = (window.cliPaginaActual - 1) * window.cliFilasPorPagina;
    var fin = inicio + window.cliFilasPorPagina;
    var paginaItems = window.cliFiltrados.slice(inicio, fin);

    var html = '';
    paginaItems.forEach(function(c) {
        var badgeEst = (c.estado || 'Activo').toLowerCase() === 'activo'
            ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill fw-bold">Activo</span>'
            : '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill fw-bold">Inactivo</span>';

        html += '<tr>';
        html += '<td class="fw-bold text-dark"><i class="bi bi-building me-2 text-primary"></i>' + (c.razon_social || '-') + '</td>';
        html += '<td><code class="text-secondary">' + (c.ruc_dni || '-') + '</code></td>';
        html += '<td>' + (c.telefono || '-') + '</td>';
        html += '<td>' + (c.email || '-') + '</td>';
        html += '<td>' + (c.direccion || '-') + '</td>';
        html += '<td class="text-center"><span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill fw-bold px-2">' + (c.total_flota || 0) + ' veh.</span></td>';
        html += '<td>' + badgeEst + '</td>';
        html += '<td class="text-end">';
        html += '<button class="btn btn-sm btn-light me-1" onclick="window.cliAbrirEditar(' + c.id + ')" title="Editar"><i class="bi bi-pencil"></i></button>';
        html += '<button class="btn btn-sm btn-outline-danger" onclick="window.cliEliminar(' + c.id + ')" title="Eliminar"><i class="bi bi-trash"></i></button>';
        html += '</td>';
        html += '</tr>';
    });

    tbody.innerHTML = html;
    window.cliRenderPaginacion();
};

window.cliRenderPaginacion = function() {
    var cont = document.getElementById('cli-paginacion');
    if (!cont) return;

    var totalPaginas = Math.ceil(window.cliFiltrados.length / window.cliFilasPorPagina) || 1;
    var html = '<div class="text-muted small fw-bold">Mostrando ' + window.cliFiltrados.length + ' cliente(s)</div>';
    
    if (totalPaginas > 1) {
        html += '<div class="d-flex gap-1">';
        for (var i = 1; i <= totalPaginas; i++) {
            var active = i === window.cliPaginaActual ? 'btn-primary' : 'btn-outline-secondary';
            html += '<button class="btn btn-sm ' + active + ' fw-bold" onclick="window.cliIrPagina(' + i + ')">' + i + '</button>';
        }
        html += '</div>';
    }
    cont.innerHTML = html;
};

window.cliIrPagina = function(p) {
    window.cliPaginaActual = p;
    window.cliRenderTabla();
};

// ── Modales & Acciones ────────────────────────────────────────────────────────
window.cliAbrirNuevo = function() {
    window.cliLimpiarForm();
    var tit = document.getElementById('cli-modal-titulo'); if (tit) tit.textContent = 'Nuevo Cliente';
    document.getElementById('modalCliente').classList.add('open');
    document.getElementById('cliBackdrop').classList.add('open');
};

window.cliAbrirEditar = function(id) {
    var c = window.cliData.find(function(x) { return x.id === id; });
    if (!c) return;

    window.cliLimpiarForm();
    document.getElementById('cli-f-id').value = c.id;
    document.getElementById('cli-f-ruc').value = c.ruc_dni || '';
    document.getElementById('cli-f-razon').value = c.razon_social || '';
    document.getElementById('cli-f-telefono').value = c.telefono || '';
    document.getElementById('cli-f-email').value = c.email || '';
    document.getElementById('cli-f-direccion').value = c.direccion || '';
    document.getElementById('cli-f-estado').value = c.estado || 'Activo';
    document.getElementById('cli-f-notas').value = c.notas || '';

    var tit = document.getElementById('cli-modal-titulo'); if (tit) tit.textContent = 'Editar Cliente';
    document.getElementById('modalCliente').classList.add('open');
    document.getElementById('cliBackdrop').classList.add('open');
};

window.cliLimpiarForm = function() {
    document.getElementById('cli-f-id').value = '';
    document.getElementById('cli-f-ruc').value = '';
    document.getElementById('cli-f-razon').value = '';
    document.getElementById('cli-f-telefono').value = '';
    document.getElementById('cli-f-email').value = '';
    document.getElementById('cli-f-direccion').value = '';
    document.getElementById('cli-f-estado').value = 'Activo';
    document.getElementById('cli-f-notas').value = '';
};

window.cliCerrarTodo = function() {
    var m = document.getElementById('modalCliente'); if (m) m.classList.remove('open');
    var b = document.getElementById('cliBackdrop'); if (b) b.classList.remove('open');
};

// ── Consulta SUNAT / RENIEC ──────────────────────────────────────────────────
window.cliConsultarSUNAT = async function() {
    var rucInput = document.getElementById('cli-f-ruc');
    var razonInput = document.getElementById('cli-f-razon');
    var dirInput = document.getElementById('cli-f-direccion');
    var notasInput = document.getElementById('cli-f-notas');
    if (!rucInput || !razonInput) return;

    var num = rucInput.value.trim();
    if (!num) { alert('Ingrese un RUC o DNI'); return; }

    var tipo = num.length === 11 ? 'RUC' : (num.length === 8 ? 'DNI' : 'RUC');
    var btnIcon = document.getElementById('cli-btn-sunat-icon');
    if (btnIcon) btnIcon.className = "spinner-border spinner-border-sm me-1";

    try {
        var res = await fetch('/api/proxy/documento?tipo=' + tipo + '&numero=' + num);
        if (!res.ok) throw new Error('No encontrado');
        var data = await res.json();
        if (data && (data.nombre || data.razon_social)) {
            razonInput.value = (data.nombre || data.razon_social).toUpperCase();
            if (dirInput && data.direccion) dirInput.value = data.direccion.toUpperCase();
            if (notasInput) {
                var infoSunat = [];
                if (data.estado) infoSunat.push("ESTADO SUNAT: " + data.estado);
                if (data.condicion) infoSunat.push("CONDICIÓN: " + data.condicion);
                if (infoSunat.length) notasInput.value = infoSunat.join(" | ");
            }
            if (typeof window.rotToast === 'function') window.rotToast("Datos SUNAT/RENIEC obtenidos", "bg-success");
        }
    } catch (err) {
        console.warn('Error consulta SUNAT:', err);
        if (typeof window.rotToast === 'function') window.rotToast("No se halló información en SUNAT/RENIEC", "bg-warning");
    } finally {
        if (btnIcon) btnIcon.className = "bi bi-search me-1";
    }
};

// ── Guardar Cliente ──────────────────────────────────────────────────────────
window.cliGuardar = function(ev) {
    if (ev) ev.preventDefault();

    var id = document.getElementById('cli-f-id').value;
    var razon = document.getElementById('cli-f-razon').value.trim().toUpperCase();
    if (!razon) { alert('La Razón Social es requerida'); return; }

    var payload = {
        ruc_dni: document.getElementById('cli-f-ruc').value.trim(),
        razon_social: razon,
        telefono: document.getElementById('cli-f-telefono').value.trim(),
        email: document.getElementById('cli-f-email').value.trim(),
        direccion: document.getElementById('cli-f-direccion').value.trim(),
        estado: document.getElementById('cli-f-estado').value,
        notas: document.getElementById('cli-f-notas').value.trim()
    };

    var url = id ? '/api/clientes/' + id : '/api/clientes';
    var method = id ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(res) {
        if (!res.ok) throw new Error('Error al guardar cliente');
        return res.json();
    })
    .then(function() {
        if (typeof window.rotToast === 'function') window.rotToast('Cliente guardado con éxito', 'bg-success');
        window.cliCerrarTodo();
        window.cliCargar();
    })
    .catch(function(err) {
        console.error('Error guardando cliente:', err);
        alert('Error al guardar el cliente');
    });
};

// ── Eliminar Cliente ─────────────────────────────────────────────────────────
window.cliEliminar = function(id) {
    if (!confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;

    fetch('/api/clientes/' + id, { method: 'DELETE' })
    .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    })
    .then(function() {
        if (typeof window.rotToast === 'function') window.rotToast('Cliente eliminado', 'bg-info');
        window.cliCargar();
    })
    .catch(function(err) {
        console.error('Error eliminando cliente:', err);
        alert('Error al eliminar cliente');
    });
};

// ── Descargar Plantilla Excel ────────────────────────────────────────────────
window.cliDescargarPlantilla = function() {
    if (typeof XLSX === 'undefined') {
        alert('Librería XLSX no disponible');
        return;
    }

    var cabeceras = [
        ["Razón Social / Nombre", "RUC / DNI", "Teléfono", "Correo", "Dirección", "Estado", "Notas"]
    ];
    var ejemplo = [
        ["TRANSPORTES EJEMPLO S.A.C.", "20123456789", "987654321", "contacto@ejemplo.com", "Av. Industrial 123, Lima", "Activo", "Cliente corporativo"]
    ];

    var ws = XLSX.utils.aoa_to_sheet(cabeceras.concat(ejemplo));
    ws['!cols'] = [
        { wch: 35 },
        { wch: 15 },
        { wch: 15 },
        { wch: 25 },
        { wch: 35 },
        { wch: 12 },
        { wch: 30 }
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Clientes");
    XLSX.writeFile(wb, "Plantilla_Importar_Clientes.xlsx");
};

// ── Procesar Importación Masiva desde Excel ──────────────────────────────────
window.cliProcesarExcelImport = function(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
        alert('La librería Excel aún no ha cargado en la página');
        event.target.value = '';
        return;
    }

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = new Uint8Array(e.target.result);
            var workbook = XLSX.read(data, { type: 'array' });
            var sheetName = workbook.SheetNames[0];
            var sheet = workbook.Sheets[sheetName];
            var rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

            if (!rawRows || !rawRows.length) {
                alert('El archivo Excel seleccionado no contiene filas con datos.');
                event.target.value = '';
                return;
            }

            // Normalización y mapeo inteligente de columnas
            var listaClientes = [];
            rawRows.forEach(function(row) {
                var c = {};
                for (var key in row) {
                    var k = key.trim().toLowerCase()
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remover tildes
                    var val = (row[key] !== undefined && row[key] !== null) ? String(row[key]).trim() : '';

                    if (k.includes('razon') || k.includes('nombre') || k.includes('cliente') || k.includes('empresa')) {
                        if (!c.razon_social) c.razon_social = val;
                    } else if (k.includes('ruc') || k.includes('dni') || k.includes('documento')) {
                        if (!c.ruc_dni) c.ruc_dni = val;
                    } else if (k.includes('tel') || k.includes('cel') || k.includes('movil')) {
                        if (!c.telefono) c.telefono = val;
                    } else if (k.includes('correo') || k.includes('email') || k.includes('mail')) {
                        if (!c.email) c.email = val;
                    } else if (k.includes('direc') || k.includes('domicilio')) {
                        if (!c.direccion) c.direccion = val;
                    } else if (k.includes('estado')) {
                        if (!c.estado) c.estado = val;
                    } else if (k.includes('nota') || k.includes('obs')) {
                        if (!c.notas) c.notas = val;
                    }
                }

                if (c.razon_social) {
                    listaClientes.push(c);
                }
            });

            if (!listaClientes.length) {
                alert('No se encontraron registros válidos. Verifique que la columna Razón Social / Nombre exista en el Excel.');
                event.target.value = '';
                return;
            }

            if (!confirm('Se detectaron ' + listaClientes.length + ' cliente(s) listos para importar.\n¿Desea importarlos a la base de datos ahora?')) {
                event.target.value = '';
                return;
            }

            fetch('/api/clientes/importar-masivo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientes: listaClientes })
            })
            .then(function(res) {
                if (!res.ok) return res.json().then(function(e){ throw new Error(e.error || 'Error en servidor'); });
                return res.json();
            })
            .then(function(resp) {
                if (typeof window.rotToast === 'function') {
                    window.rotToast('Se importaron ' + (resp.importados || listaClientes.length) + ' clientes correctamente.', 'bg-success');
                } else {
                    alert('Se importaron ' + (resp.importados || listaClientes.length) + ' clientes correctamente.');
                }
                window.cliCargar();
            })
            .catch(function(err) {
                console.error('Error importando clientes:', err);
                alert('Error al importar clientes: ' + err.message);
            })
            .finally(function() {
                event.target.value = '';
            });

        } catch (errEx) {
            console.error('Error al procesar el archivo Excel:', errEx);
            alert('Ocurrió un error leyendo el archivo Excel. Verifique el formato.');
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};

// ── Exportar a Excel ─────────────────────────────────────────────────────────
window.cliExportarExcel = function() {
    if (typeof window.descargarExcelDinamico === 'function') {
        window.descargarExcelDinamico('moduloClientes', 'Directorio_Clientes');
    } else {
        alert('Exportación a Excel lista');
    }
};
