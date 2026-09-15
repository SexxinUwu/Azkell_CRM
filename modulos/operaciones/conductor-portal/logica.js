// ═══════════════════════════════════════════════════════════════════
// MÓDULO: CONDUCTOR (Portal Móvil de Rendición y Viajes) — Lógica SPA
// ERP Azkell
// ═══════════════════════════════════════════════════════════════════

window._condViajeActivoData = null;

window.init_conductor_portal = function() {
    // Si hay un DNI almacenado en sesión o preferencia, usarlo
    var userStorage = localStorage.getItem('fleet_user_dni') || localStorage.getItem('fleet_user') || '';
    var inputDni = document.getElementById('cond-input-dni');
    if (inputDni && userStorage && !inputDni.value) {
        inputDni.value = userStorage;
    }
    window.condCargarPortal();
};

// Cargar portal del conductor sistematizado 100% por sesión
window.condCargarPortal = async function() {
    // 1. Obtener datos de la sesión del usuario conectado
    var sesionNombre = (localStorage.getItem('fleet_user') || '').trim();
    var sesionDni    = (localStorage.getItem('fleet_dni') || '').trim();
    var sesionCorreo = (localStorage.getItem('fleet_correo') || '').trim();

    // Actualizar de inmediato el saludo con el nombre real del usuario conectado
    var lblNom = document.getElementById('cond-nombre-label');
    var lblDni = document.getElementById('cond-dni-label');
    if (lblNom) {
        lblNom.textContent = sesionNombre ? `Hola, ${sesionNombre.toUpperCase()}` : 'Bienvenido, Conductor';
    }
    if (lblDni) {
        lblDni.textContent = sesionDni ? `DNI: ${sesionDni}` : (sesionCorreo ? `Usuario: ${sesionCorreo}` : 'Conductor');
    }

    var url = `/api/operaciones/conductor-portal/viaje-activo`;
    var params = [];
    if (sesionDni) {
        params.push(`dni=${encodeURIComponent(sesionDni)}`);
    }
    if (sesionNombre) {
        params.push(`nombre=${encodeURIComponent(sesionNombre)}`);
    }
    if (params.length > 0) {
        url += `?${params.join('&')}`;
    }

    try {
        var res = await fetch(url);
        var json = await res.json();

        if (!json || !json.ok) {
            console.warn('Respuesta viaje activo:', json);
            return;
        }

        var cond = json.conductor || {};
        var viaje = json.viaje;
        var balance = json.balance || { total_asignado: 0, total_rendido: 0, saldo_restante: 0 };
        var gastos = json.gastos || [];

        window._condViajeActivoData = json;

        // Si el backend encontró un nombre de conductor específico en el viaje
        if (lblNom && sesionNombre) {
            lblNom.textContent = `Hola, ${sesionNombre.toUpperCase()}`;
        } else if (lblNom && cond.nombre) {
            lblNom.textContent = `Hola, ${cond.nombre.toUpperCase()}`;
        }
        if (lblDni && sesionDni) {
            lblDni.textContent = `DNI: ${sesionDni}`;
        } else if (lblDni && cond.dni) {
            lblDni.textContent = `DNI: ${cond.dni}`;
        }

        // Actualizar tarjeta del Viaje
        var boxHero = document.getElementById('cond-hero-trip');
        var lblCod = document.getElementById('cond-viaje-codigo');
        var lblEst = document.getElementById('cond-viaje-estado');
        var lblFec = document.getElementById('cond-viaje-fecha');
        var lblPlacas = document.getElementById('cond-viaje-placas');
        var lblRuta = document.getElementById('cond-viaje-ruta');

        if (!viaje) {
            if (lblCod) lblCod.textContent = 'Sin Viaje Activo';
            if (lblEst) {
                lblEst.textContent = 'DISPONIBLE EN BASE';
                lblEst.className = 'badge bg-secondary-subtle text-secondary border rounded-pill px-2.5 py-1 font-monospace';
            }
            if (lblPlacas) lblPlacas.textContent = '--- / ---';
            if (lblRuta) lblRuta.textContent = 'A la espera de programación de ruta';
            if (lblFec) lblFec.textContent = 'Hoy';
        } else {
            if (lblCod) lblCod.textContent = `Viaje: ${viaje.codigo}`;
            if (lblEst) {
                lblEst.textContent = (viaje.estado || 'ACTIVO').toUpperCase();
                lblEst.className = 'cond-chip-status';
            }
            if (lblPlacas) lblPlacas.textContent = `${viaje.placa_tracto || '---'} / ${viaje.placa_remolque || '---'}`;
            if (lblRuta) {
                lblRuta.textContent = viaje.ruta || '---';
                lblRuta.title = viaje.ruta || '';
            }
            if (lblFec) {
                // Formatear fecha del viaje
                var fecRaw = viaje.fecha_formateada || viaje.fecha_viaje || viaje.fecha || '';
                lblFec.textContent = String(fecRaw).slice(0, 10);
            }
        }

        // Actualizar KPIs de Dinero
        var kpiDep = document.getElementById('cond-kpi-depositado');
        var kpiRen = document.getElementById('cond-kpi-rendido');
        var kpiSal = document.getElementById('cond-kpi-saldo');

        if (kpiDep) kpiDep.textContent = `S/ ${parseFloat(balance.total_asignado || 0).toFixed(2)}`;
        if (kpiRen) kpiRen.textContent = `S/ ${parseFloat(balance.total_rendido || 0).toFixed(2)}`;
        if (kpiSal) {
            var salNum = parseFloat(balance.saldo_restante || 0);
            kpiSal.textContent = `S/ ${salNum.toFixed(2)}`;
            var boxSal = document.getElementById('cond-kpi-saldo-box');
            if (boxSal) {
                boxSal.className = salNum >= 0 ? 'cond-kpi-pill pastel-emerald' : 'cond-kpi-pill pastel-rose';
            }
            kpiSal.className = salNum >= 0 ? 'fw-bold font-monospace text-success' : 'fw-bold font-monospace text-danger';
        }

        // Renderizar lista de gastos
        var containerGastos = document.getElementById('cond-lista-gastos');
        var badgeTotal = document.getElementById('cond-badge-total-gastos');
        if (badgeTotal) badgeTotal.textContent = `${gastos.length} registrados`;

        if (!containerGastos) return;

        if (gastos.length === 0) {
            containerGastos.innerHTML = `
                <div class="text-center py-4 text-muted small">
                    <i class="bi bi-inbox fs-4 d-block mb-1 text-secondary"></i>
                    Aún no has registrado gastos en este viaje. Pulsa "Rendir Gastos" para empezar.
                </div>
            `;
            return;
        }

        // Función para limpiar y mostrar fecha amigable
        function formatearFechaHoraGasto(g) {
            if (g.fecha_formateada) return g.fecha_formateada;
            var raw = g.creado_en || g.fecha;
            if (!raw) return '';
            var str = String(raw).replace('T', ' ').replace('.000Z', '').trim();
            if (str.length >= 16) {
                var partes = str.slice(0, 10).split('-');
                if (partes.length === 3) {
                    var hora = str.slice(11, 16);
                    return `${partes[2]}/${partes[1]}/${partes[0]} ${hora}`;
                }
            }
            if (str.length === 10) {
                var partes2 = str.split('-');
                if (partes2.length === 3) {
                    return `${partes2[2]}/${partes2[1]}/${partes2[0]}`;
                }
            }
            return str;
        }

        // Mapeo de colores e iconos para conceptos
        var tipoIconos = {
            'COCHERA': '🅿️',
            'PEAJES': '🛣️',
            'VIATICOS': '🍽️',
            'PERNOCTE': '🏨',
            'LLANTAS': '🛞',
            'MANTENIMIENTO': '🔧',
            'OTROS': '📝'
        };

        containerGastos.innerHTML = gastos.map(g => {
            var sUrl = g.sustento_url;
            var linkFoto = sUrl ? `<a href="${sUrl}" target="_blank" rel="noopener noreferrer" class="cond-icon-btn btn-view-photo" title="Ver Comprobante"><i class="bi bi-eye-fill"></i></a>` : '';
            var btnEditar = `<button type="button" onclick="window.condAbrirModalEditarGasto(${g.id})" class="cond-icon-btn btn-edit-item" title="Editar Comprobante"><i class="bi bi-pencil-square"></i></button>`;
            var fechaTexto = formatearFechaHoraGasto(g);
            var idGastoStr = `G-${String(g.id).padStart(4, '0')}`;
            var subMotivoStr = g.sub_motivo || g.tipo_gasto || 'Gasto de ruta';

            return `
                <div class="cond-gasto-item">
                    <div class="flex-grow-1 overflow-hidden me-2">
                        <div class="d-flex flex-wrap align-items-center gap-1.5 mb-1">
                            <span class="badge bg-dark font-monospace text-white fw-bold px-2 py-0.5 rounded-pill" style="font-size:0.70rem;">${idGastoStr}</span>
                            <span class="badge bg-light text-dark border fw-bold px-2 py-0.5 rounded-pill" style="font-size:0.72rem;">🧾 ${subMotivoStr}</span>
                            <span class="text-muted font-monospace fw-semibold" style="font-size:0.75rem;"><i class="bi bi-clock me-1 text-secondary"></i>${fechaTexto}</span>
                        </div>
                        <div class="text-secondary fw-semibold text-truncate small" title="${g.detalle || subMotivoStr}">
                            ${g.detalle || subMotivoStr}
                        </div>
                    </div>
                    <div class="text-end flex-shrink-0 d-flex flex-column align-items-end justify-content-between">
                        <span class="font-monospace fw-bold text-dark fs-6 mb-1.5">S/ ${parseFloat(g.importe || 0).toFixed(2)}</span>
                        <div class="d-flex align-items-center gap-1.5">
                            ${btnEditar}
                            ${linkFoto}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error cargando portal de conductor:', err);
    }
};

window.condCambiarDni = function() {
    var val = (document.getElementById('cond-input-dni')?.value || '').trim();
    if (val) localStorage.setItem('fleet_user_dni', val);
    window.condCargarPortal();
};

// ── BOTÓN 1: ABRIR MODAL PARA SUBIR GASTO / TOMAR FOTO ──────────────
window.condAbrirModalSubirGasto = function() {
    if (!window._condViajeActivoData || !window._condViajeActivoData.viaje) {
        alert('Actualmente no tienes un viaje activo asignado para liquidar.');
        return;
    }

    var viaje = window._condViajeActivoData.viaje;
    var subEl = document.getElementById('cond-modal-subtitulo');
    if (subEl) subEl.textContent = `N° ${viaje.codigo}`;

    var titleEl = document.getElementById('cond-modal-title');
    if (titleEl) titleEl.textContent = 'Rendir Gasto de Viaje';

    var btnTxt = document.getElementById('cond-btn-enviar-gasto-txt');
    if (btnTxt) btnTxt.textContent = 'Guardar Gasto';

    var idInput = document.getElementById('cond-gasto-id');
    if (idInput) idInput.value = '';

    var form = document.getElementById('condFormNuevoGasto');
    if (form) form.reset();

    var fotoInput = document.getElementById('cond-gasto-foto');
    if (fotoInput) fotoInput.required = true;

    var fotoMsg = document.getElementById('cond-gasto-foto-actual-msg');
    if (fotoMsg) fotoMsg.classList.add('d-none');

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('condModalSubirGasto'));
    modal.show();
};

// ── ABRIR MODAL PARA EDITAR GASTO EXISTENTE ────────────────────────
window.condAbrirModalEditarGasto = function(gastoId) {
    if (!window._condViajeActivoData || !window._condViajeActivoData.gastos) return;
    var gastos = window._condViajeActivoData.gastos || [];
    var g = gastos.find(x => x.id == gastoId);
    if (!g) {
        alert('No se encontró el comprobante para editar.');
        return;
    }

    var idInput = document.getElementById('cond-gasto-id');
    if (idInput) idInput.value = g.id;

    var titleEl = document.getElementById('cond-modal-title');
    if (titleEl) titleEl.textContent = 'Editar Gasto de Viaje';

    var subEl = document.getElementById('cond-modal-subtitulo');
    if (subEl) subEl.textContent = `Editando comprobante #${g.id} — ${g.tipo_gasto}`;

    var selTipo = document.getElementById('cond-gasto-tipo');
    if (selTipo) selTipo.value = g.sub_motivo || g.tipo_gasto || 'Viáticos / Alimentación choferes';

    var inpNota = document.getElementById('cond-gasto-nota');
    if (inpNota) inpNota.value = g.detalle || g.sub_motivo || '';

    var inpImp = document.getElementById('cond-gasto-importe');
    if (inpImp) inpImp.value = parseFloat(g.importe || 0).toFixed(2);

    var fotoInput = document.getElementById('cond-gasto-foto');
    if (fotoInput) {
        fotoInput.value = '';
        fotoInput.required = false; // Opcional al editar
    }

    var fotoMsg = document.getElementById('cond-gasto-foto-actual-msg');
    if (fotoMsg) {
        if (g.sustento_url) {
            fotoMsg.classList.remove('d-none');
        } else {
            fotoMsg.classList.add('d-none');
        }
    }

    var btnTxt = document.getElementById('cond-btn-enviar-gasto-txt');
    if (btnTxt) btnTxt.textContent = 'Guardar Cambios';

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('condModalSubirGasto'));
    modal.show();
};

// Convertir fotos móviles a JPEG optimizado antes de subir
async function condAsegurarJpeg(file) {
    if (!file) return null;
    if (file.type === 'application/pdf') return file;
    try {
        return await new Promise((resolve) => {
            var reader = new FileReader();
            reader.onload = function(e) {
                var img = new Image();
                img.onload = function() {
                    var canvas = document.createElement('canvas');
                    var maxW = 1920, maxH = 1920;
                    var width = img.width, height = img.height;
                    if (width > maxW || height > maxH) {
                        if (width > height) {
                            height = Math.round((height * maxW) / width);
                            width = maxW;
                        } else {
                            width = Math.round((width * maxH) / height);
                            height = maxH;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        if (blob) {
                            var cleanName = (file.name || 'comprobante').replace(/\.[^/.]+$/, "") + ".jpg";
                            var newFile = new File([blob], cleanName, { type: 'image/jpeg' });
                            resolve(newFile);
                        } else {
                            resolve(file);
                        }
                    }, 'image/jpeg', 0.88);
                };
                img.onerror = function() { resolve(file); };
                img.src = e.target.result;
            };
            reader.onerror = function() { resolve(file); };
            reader.readAsDataURL(file);
        });
    } catch(err) {
        return file;
    }
}

// Guardar gasto desde la interfaz del conductor (Crear o Actualizar)
window.condGuardarGasto = async function(e) {
    if (e) e.preventDefault();
    if (!window._condViajeActivoData || !window._condViajeActivoData.viaje) return;

    var viaje = window._condViajeActivoData.viaje;
    var cond = window._condViajeActivoData.conductor || {};
    var editId = (document.getElementById('cond-gasto-id')?.value || '').trim();
    var esEdicion = !!editId;

    var btn = document.getElementById('cond-btn-enviar-gasto');
    var btnTxt = document.getElementById('cond-btn-enviar-gasto-txt');
    var origTxt = btnTxt ? btnTxt.textContent : (esEdicion ? 'Guardar Cambios' : 'Subir Mi Gasto');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> ${esEdicion ? 'Actualizando gasto...' : 'Subiendo foto...'}`;
    }

    try {
        var formData = new FormData();
        var submotivoSel = document.getElementById('cond-gasto-tipo')?.value || 'Viáticos / Alimentación choferes';
        var notaVal = document.getElementById('cond-gasto-nota')?.value || '';
        formData.append('orden_viaje', viaje.codigo);
        formData.append('conductor', cond.nombre || 'Conductor');
        formData.append('tipo_gasto', 'Gastos de Viaje y Ruta');
        formData.append('sub_motivo', submotivoSel);
        formData.append('importe', document.getElementById('cond-gasto-importe')?.value || '0');
        formData.append('detalle', notaVal || submotivoSel);
        formData.append('usuario_creacion', cond.nombre ? `${cond.nombre} (Conductor)` : 'CONDUCTOR MÓVIL');

        var fileInput = document.getElementById('cond-gasto-foto');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            var archivoFinal = await condAsegurarJpeg(fileInput.files[0]);
            formData.append('sustento', archivoFinal);
        }

        var url = esEdicion ? `/api/tesoreria/liquidaciones-gastos/${editId}` : `/api/tesoreria/liquidaciones-gastos`;
        var method = esEdicion ? 'PUT' : 'POST';

        var res = await fetch(url, {
            method: method,
            body: formData
        });
        var json = await res.json();

        if (json && json.ok) {
            alert(esEdicion ? '¡Gasto actualizado con éxito!' : '¡Gasto registrado con éxito!');
            var modal = bootstrap.Modal.getInstance(document.getElementById('condModalSubirGasto'));
            if (modal) modal.hide();
            window.condCargarPortal();
        } else {
            alert(json.error || 'No se pudo guardar el gasto');
        }
    } catch(err) {
        alert('Error al procesar comprobante: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i> <span id="cond-btn-enviar-gasto-txt">${origTxt}</span>`;
        }
    }
};

// ── BOTÓN 2: AVISO PRÓXIMAMENTE PARA VALES DE COMBUSTIBLE ──────────
window.condAvisoCombustibleProximamente = function() {
    alert('⛽ Módulo de Vales de Combustible para Conductor:\n\nEsta función estará disponible muy pronto para que registres tus cargas de Diésel y Urea en ruta de manera directa.');
};
