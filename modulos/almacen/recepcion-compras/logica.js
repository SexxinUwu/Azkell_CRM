// =========================================================================
// MÓDULO ALMACÉN: RECEPCIÓN DE COMPRAS (Lógica SPA - ERP Azkell)
// =========================================================================

(function() {
    'use strict';

    window._recCompras = window._recCompras || {
        tabActivo: 'actual', // 'actual' | 'historial'
        ordenes: [],
        ordenSeleccionada: null,
        almacenesDisponibles: ['Principal']
    };

    function _escHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    window.init_recepcion_compras = function() {
        // Cargar almacenes dinámicos desde la BD
        fetch('/api/almacen/almacenes-lista')
            .then(r => r.ok ? r.json() : [])
            .then(alms => {
                if (Array.isArray(alms) && alms.length) {
                    window._recCompras.almacenesDisponibles = alms.map(a => a.nombre);
                }
            }).catch(() => {});

        window.cargarRecepcionesOC();
    };

    // Helper: Formato de Fecha y Hora local para el input
    function obtenerFechaHoraActualLocal() {
        const ahora = new Date();
        const yyyy = ahora.getFullYear();
        const mm = String(ahora.getMonth() + 1).padStart(2, '0');
        const dd = String(ahora.getDate()).padStart(2, '0');
        const hh = String(ahora.getHours()).padStart(2, '0');
        const min = String(ahora.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    }

    // 1. Cargar Órdenes desde la API
    window.cargarRecepcionesOC = function() {
        const tbody = document.getElementById('tbody-rec-compras');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-secondary"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Consultando recepciones del ERP...</td></tr>`;
        }

        fetch('/api/almacen/recepciones-oc')
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                window._recCompras.ordenes = Array.isArray(data) ? data : [];
                actualizarBadgesContadores();
                window.filtrarTablaRecepciones();
            })
            .catch(err => {
                console.error('Error al cargar recepciones:', err);
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger"><i class="bi bi-exclamation-triangle me-2"></i> Error: ${err.message}</td></tr>`;
                }
            });
    };

    // 2. Contadores de Pestañas
    function actualizarBadgesContadores() {
        const ocs = window._recCompras.ordenes;
        const actual = ocs.filter(o => o.estado_recepcion !== 'COMPLETO');
        const historial = ocs.filter(o => o.estado_recepcion === 'COMPLETO');

        const bAct = document.getElementById('badge-rec-actual-count');
        if (bAct) bAct.innerText = actual.length;

        const bHist = document.getElementById('badge-rec-historial-count');
        if (bHist) bHist.innerText = historial.length;
    }

    // 3. Alternar entre pestaña 'actual' e 'historial'
    window.cambiarTabRecepciones = function(tab) {
        window._recCompras.tabActivo = tab;
        const btnAct = document.getElementById('tab-rec-actual');
        const btnHist = document.getElementById('tab-rec-historial');

        if (tab === 'actual') {
            btnAct?.classList.add('active');
            btnHist?.classList.remove('active');
        } else {
            btnAct?.classList.remove('active');
            btnHist?.classList.add('active');
        }

        window.filtrarTablaRecepciones();
    };

    // 4. Filtrar y Renderizar Tabla
    window.filtrarTablaRecepciones = function() {
        const tab = window._recCompras.tabActivo;
        const q = (document.getElementById('filtro-buscar-rec')?.value || '').toLowerCase().trim();
        const ocs = window._recCompras.ordenes;

        const filtradas = ocs.filter(o => {
            // Filtro por pestaña
            if (tab === 'actual' && o.estado_recepcion === 'COMPLETO') return false;
            if (tab === 'historial' && o.estado_recepcion !== 'COMPLETO') return false;

            // Filtro de búsqueda rápida
            if (q) {
                const match = (o.id && o.id.toLowerCase().includes(q)) ||
                              (o.proveedor && o.proveedor.toLowerCase().includes(q)) ||
                              (o.solicitante && o.solicitante.toLowerCase().includes(q)) ||
                              (o.items && o.items.some(it => it.descripcion.toLowerCase().includes(q)));
                if (!match) return false;
            }

            return true;
        });

        const tbody = document.getElementById('tbody-rec-compras');
        const txtContador = document.getElementById('txt-rec-contador');

        if (txtContador) {
            txtContador.innerText = `Mostrando 1 a ${filtradas.length} de ${filtradas.length} registros`;
        }

        if (!tbody) return;

        if (filtradas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-secondary"><i class="bi bi-inbox fs-3 d-block mb-2 text-muted"></i> No hay órdenes en la pestaña <b>${tab.toUpperCase()}</b>.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtradas.map(oc => {
            // Badge progreso
            let badgeProgreso = '';
            if (oc.estado_recepcion === 'COMPLETO') {
                badgeProgreso = `<span class="badge-rec-completo">COMPLETO (${oc.total_recibido}/${oc.total_pedido})</span>`;
            } else if (oc.estado_recepcion === 'PARCIAL') {
                badgeProgreso = `<span class="badge-rec-parcial">PARCIAL (${oc.total_recibido}/${oc.total_pedido})</span>`;
            } else {
                badgeProgreso = `<span class="badge-rec-pendiente">PENDIENTE (0/${oc.total_pedido})</span>`;
            }

            // Formato limpio de fecha y hora
            const fechaFmt = oc.fecha || '-';

            return `
            <tr>
                <td class="text-nowrap" style="width:130px;">
                    ${oc.estado_recepcion === 'COMPLETO' ? `
                        <button class="btn-rec-action btn-ver-historial" onclick="window.abrirModalRecepcion('${oc.id}', true)">
                            <i class="bi bi-eye-fill"></i> Ver Detalle
                        </button>
                    ` : `
                        <button class="btn-rec-action" onclick="window.abrirModalRecepcion('${oc.id}', false)">
                            <i class="bi bi-box-arrow-in-down"></i> Recepcionar
                        </button>
                    `}
                </td>
                <td class="fw-bold text-dark text-nowrap font-monospace" style="font-size:0.76rem;">${oc.id}</td>
                <td class="text-secondary fw-semibold text-nowrap">${fechaFmt}</td>
                <td class="fw-bold text-dark text-nowrap">
                    <div class="text-truncate" style="max-width: 320px;" title="${_escHtml(oc.proveedor)}">${oc.proveedor}</div>
                </td>
                <td class="text-secondary fw-semibold text-nowrap">
                    <div class="text-truncate" style="max-width: 180px;" title="${_escHtml(oc.solicitante)}">${oc.solicitante}</div>
                </td>
                <td class="fw-bold text-dark text-nowrap text-end">${oc.moneda} ${(oc.importe || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                <td class="text-center text-nowrap"><span class="badge-oc-procesado">${oc.estado_oc}</span></td>
                <td class="text-center text-nowrap">${badgeProgreso}</td>
            </tr>
            `;
        }).join('');
    };

    // 5. Abrir Modal de Recepción
    window.abrirModalRecepcion = function(ocId, soloVer = false) {
        const oc = window._recCompras.ordenes.find(o => o.id === ocId);
        if (!oc) return;
        window._recCompras.ordenSeleccionada = oc;

        // Inyectar datos en el encabezado del modal
        document.getElementById('modal-rec-orden').innerText = oc.id;
        document.getElementById('modal-rec-proveedor').innerText = oc.proveedor;
        document.getElementById('modal-rec-solicitante').innerText = oc.solicitante;
        document.getElementById('modal-rec-importe').innerText = `${oc.moneda} ${(oc.importe || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        
        // Reset de campos de entrada
        const fInput = document.getElementById('modal-rec-fecha');
        if (fInput) fInput.value = obtenerFechaHoraActualLocal();
        const obsInput = document.getElementById('modal-rec-obs');
        if (obsInput) obsInput.value = '';
        const fileInput = document.getElementById('modal-rec-file');
        if (fileInput) fileInput.value = '';

        const inputsBox = document.getElementById('modal-rec-inputs-box');
        const btnEjecutar = document.getElementById('btn-modal-ejecutar-recepcion');

        if (soloVer || oc.estado_recepcion === 'COMPLETO') {
            if (inputsBox) inputsBox.style.display = 'none';
            if (btnEjecutar) btnEjecutar.style.display = 'none';
        } else {
            if (inputsBox) inputsBox.style.display = 'flex';
            if (btnEjecutar) btnEjecutar.style.display = 'inline-block';
        }

        // Renderizar tabla de productos a recepcionar
        const itemsBody = document.getElementById('modal-rec-items-body');
        const badgeItems = document.getElementById('modal-rec-items-badge');
        if (badgeItems) badgeItems.innerText = `${oc.items.length} Ítems`;

        const almacenesOpts = window._recCompras.almacenesDisponibles.map(alm => 
            `<option value="${alm}">${alm}</option>`
        ).join('');

        if (itemsBody) {
            itemsBody.innerHTML = oc.items.map((it, idx) => {
                const pend = it.pendiente;
                return `
                <tr>
                    <td>
                        <div class="fw-bold text-dark">${it.descripcion}</div>
                        ${it.inventario_id ? `<small class="text-secondary font-monospace">${it.inventario_id}</small>` : ''}
                    </td>
                    <td class="text-center text-muted fw-semibold">${it.unidad}</td>
                    <td class="text-center fw-bold">${it.pedido.toFixed(2)}</td>
                    <td class="text-center text-success fw-bold">${it.recepcionado.toFixed(2)}</td>
                    <td class="text-center text-danger fw-bold">${pend.toFixed(2)}</td>
                    <td class="text-center">
                        ${pend > 0 && !soloVer ? `
                            <input type="number" step="any" min="0" max="${pend}" 
                                   class="form-control form-control-sm text-center fw-bold border-warning mx-auto rec-item-cant-input" 
                                   data-idx="${idx}" 
                                   value="${pend}" 
                                   style="max-width:90px;background:#fffbeb;">
                        ` : `
                            <span class="badge bg-light text-muted border">Completo</span>
                        `}
                    </td>
                    <td>
                        ${pend > 0 && !soloVer ? `
                            <select class="form-select form-select-sm fw-semibold rec-item-alm-select" data-idx="${idx}" style="font-size:0.8rem;">
                                ${almacenesOpts}
                            </select>
                        ` : `
                            <span class="text-secondary small fw-semibold">${oc.almacen || 'ALM CENTRAL'}</span>
                        `}
                    </td>
                </tr>
                `;
            }).join('');
        }

        // Renderizar tabla de historial de entregas con fotos S3
        const histBody = document.getElementById('modal-rec-historial-body');
        const historial = oc.historial_recepciones || [];

        if (histBody) {
            if (historial.length === 0) {
                histBody.innerHTML = `<tr><td colspan="8" class="text-center py-3 text-muted">Aún no se han registrado entregas para esta orden de compra.</td></tr>`;
            } else {
                histBody.innerHTML = historial.map(h => {
                    let fechaFormateada = '-';
                    if (h.fecha_recepcion) {
                        const raw = String(h.fecha_recepcion).replace('T', ' ').slice(0, 16);
                        const parts = raw.split(' ');
                        if (parts.length === 2) {
                            const [yyyy, mm, dd] = parts[0].split('-');
                            fechaFormateada = `${dd}/${mm}/${yyyy} ${parts[1]}`;
                        } else {
                            fechaFormateada = new Date(h.fecha_recepcion).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
                        }
                    }
                    const fotoBtn = h.sustento_url_presigned ? `
                        <a href="${h.sustento_url_presigned}" target="_blank" class="btn btn-sm btn-outline-primary py-0 px-2 fw-semibold" style="font-size:0.75rem;">
                            <i class="bi bi-image"></i> Ver Sustento
                        </a>
                    ` : `<span class="text-muted small">Sin archivo</span>`;

                    const delBtn = `
                        <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 fw-semibold" onclick="window.eliminarRegistroRecepcion(${h.recepcion_id}, '${(h.descripcion||'').replace(/'/g, "\\'")}', ${parseFloat(h.cantidad_recibida || 0)})" title="Eliminar / Revertir esta entrega">
                            <i class="bi bi-trash"></i>
                        </button>
                    `;

                    return `
                    <tr>
                        <td class="fw-semibold text-nowrap">${fechaFormateada}</td>
                        <td class="fw-bold text-dark">${h.usuario || 'Almacén'}</td>
                        <td>${h.descripcion || '-'}</td>
                        <td class="text-center fw-bold text-success">+${parseFloat(h.cantidad_recibida || 0).toFixed(2)}</td>
                        <td><span class="badge bg-light text-dark border">${h.almacen || 'ALM CENTRAL'}</span></td>
                        <td class="text-secondary small">${h.observacion || '-'}</td>
                        <td class="text-center">${fotoBtn}</td>
                        <td class="text-center">${delBtn}</td>
                    </tr>
                    `;
                }).join('');
            }
        }

        // Mostrar Modal
        const modalEl = document.getElementById('modalRecepcionOC');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    };

    // Eliminar / Revertir entrega parcial o total
    window.eliminarRegistroRecepcion = async function(recepcionId, desc, cant) {
        if (!recepcionId) return;
        const msg = `¿Estás seguro de eliminar este registro de entrega (+${cant} ${desc})?\n\nAl eliminarlo, se revertirá la cantidad recepcionada para que puedas volver a registrarla.`;
        if (!confirm(msg)) return;

        try {
            const usuario = localStorage.getItem('fleet_user_nombre') || localStorage.getItem('fleet_user') || 'Usuario';
            const res = await fetch(`/api/almacen/recepciones-oc/${recepcionId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'No se pudo eliminar el registro de entrega');
            }

            alert('✅ Registro de entrega eliminado. La cantidad ha sido revertida exitosamente.');

            // Recargar datos actualizados del backend
            const resReload = await fetch('/api/almacen/recepciones-oc');
            const dataReload = await resReload.json();
            window._recCompras.ordenes = Array.isArray(dataReload) ? dataReload : [];
            actualizarBadgesContadores();
            window.filtrarTablaRecepciones();

            // Refrescar el modal con los saldos actualizados
            const currentOcId = window._recCompras.ordenSeleccionada?.id;
            if (currentOcId) {
                const ocActualizada = (window._recCompras.ordenes || []).find(o => o.id === currentOcId);
                if (ocActualizada) {
                    window.abrirModalRecepcion(ocActualizada.id);
                } else {
                    const modalEl = document.getElementById('modalRecepcionOC');
                    if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
                }
            }
        } catch(err) {
            alert('Error: ' + err.message);
        }
    };

    // 6. Ejecutar y Guardar Recepción
    window.ejecutarRegistroRecepcion = function() {
        const oc = window._recCompras.ordenSeleccionada;
        if (!oc) return;

        const inputsCant = document.querySelectorAll('.rec-item-cant-input');
        const selectsAlm = document.querySelectorAll('.rec-item-alm-select');

        const itemsARecepcionar = [];
        let sumaCantidades = 0;

        inputsCant.forEach(inp => {
            const idx = parseInt(inp.getAttribute('data-idx'), 10);
            const cant = parseFloat(inp.value) || 0;
            const itemBase = oc.items[idx];

            if (cant > 0) {
                if (cant > itemBase.pendiente) {
                    alert(`La cantidad a recepcionar (${cant}) no puede superar el saldo pendiente (${itemBase.pendiente}) para ${itemBase.descripcion}.`);
                    return;
                }
                const selAlm = document.querySelector(`.rec-item-alm-select[data-idx="${idx}"]`);
                const almDestino = selAlm ? selAlm.value : 'ALM CENTRAL';

                itemsARecepcionar.push({
                    inventario_id: itemBase.inventario_id,
                    descripcion: itemBase.descripcion,
                    cantidad_recibida: cant,
                    costo_unitario: itemBase.costo_unitario,
                    moneda: itemBase.moneda,
                    almacen: almDestino
                });
                sumaCantidades += cant;
            }
        });

        if (itemsARecepcionar.length === 0 || sumaCantidades <= 0) {
            alert('Por favor ingrese al menos una cantidad mayor a 0 para recepcionar.');
            return;
        }

        const fechaRecepcion = document.getElementById('modal-rec-fecha')?.value || obtenerFechaHoraActualLocal();
        const observacion = document.getElementById('modal-rec-obs')?.value || '';
        const fileInput = document.getElementById('modal-rec-file');
        const usuarioActual = localStorage.getItem('fleet_user') || 'Responsable Almacén';

        // Calcular si queda algo pendiente en total
        const totalPendienteOriginal = oc.items.reduce((acc, it) => acc + it.pendiente, 0);
        const tipoRecepcion = (sumaCantidades >= totalPendienteOriginal) ? 'TOTAL' : 'PARCIAL';

        // Armar FormData para enviar a la API (soporte multi-part para AWS S3)
        const formData = new FormData();
        formData.append('oc_id', oc.id);
        formData.append('fecha_recepcion', fechaRecepcion);
        formData.append('usuario', usuarioActual);
        formData.append('observacion', observacion);
        formData.append('almacen', itemsARecepcionar[0].almacen || 'ALM CENTRAL');
        formData.append('tipo_recepcion', tipoRecepcion);
        formData.append('items_json', JSON.stringify(itemsARecepcionar));

        if (fileInput && fileInput.files && fileInput.files[0]) {
            formData.append('sustento', fileInput.files[0]);
        }

        const btnConfirmar = document.getElementById('btn-modal-ejecutar-recepcion');
        if (btnConfirmar) {
            btnConfirmar.disabled = true;
            btnConfirmar.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Procesando...`;
        }

        fetch('/api/almacen/recepciones-oc/registrar', {
            method: 'POST',
            body: formData
        })
        .then(res => {
            if (!res.ok) throw new Error('Error al registrar la recepción');
            return res.json();
        })
        .then(data => {
            // Cerrar modal
            const modalEl = document.getElementById('modalRecepcionOC');
            if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

            // Notificación elegante
            if (typeof window.showToast === 'function') {
                window.showToast('✅ Recepción Registrada', 'El stock de los artículos ha sido actualizado en el almacén.');
            } else {
                alert('✅ Recepción registrada con éxito. Se actualizó el stock e historial.');
            }

            // Recargar datos actualizados
            window.cargarRecepcionesOC();
        })
        .catch(err => {
            alert('Error: ' + err.message);
        })
        .finally(() => {
            if (btnConfirmar) {
                btnConfirmar.disabled = false;
                btnConfirmar.innerHTML = `<i class="bi bi-check2-circle me-1"></i> Registrar Recepción`;
            }
        });
    };

    // 7. Exportar a Excel
    window.exportarRecepcionesExcel = function() {
        alert('Generando reporte Excel de Recepciones de Compra...');
    };

    // Inicialización automática
    window.init_recepcion_compras();

})();
