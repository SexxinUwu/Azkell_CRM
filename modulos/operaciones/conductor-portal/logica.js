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
    window.condCargarSubmotivosGastos();
};

window.condCargarSubmotivosGastos = async function(selectedVal) {
    var sel = document.getElementById('cond-gasto-tipo');
    if (!sel) return;
    try {
        var res = await fetch('/api/tesoreria/motivos-gastos?solo_activos=1');
        var json = await res.json();
        if (json && json.ok && Array.isArray(json.data) && json.data.length > 0) {
            var items = json.data.filter(function(item) {
                var m = (item.motivo || '').toLowerCase();
                return m.includes('viaje') || m.includes('ruta');
            });
            if (items.length > 0) {
                var currentVal = selectedVal || sel.value || 'Viáticos / Alimentación choferes';
                sel.innerHTML = items.map(function(it) {
                    return `<option value="${it.sub_motivo}">${it.sub_motivo}</option>`;
                }).join('');
                if (currentVal && items.some(function(it) { return it.sub_motivo === currentVal; })) {
                    sel.value = currentVal;
                } else if (items.some(function(it) { return it.sub_motivo.includes('Viáticos'); })) {
                    var v = items.find(function(it) { return it.sub_motivo.includes('Viáticos'); });
                    sel.value = v.sub_motivo;
                }
            }
        }
    } catch(e) {
        console.warn('Error cargando submotivos para conductor:', e);
    }
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

    window.condCargarSubmotivosGastos('Viáticos / Alimentación choferes');

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

    var targetSubmotivo = g.sub_motivo || g.tipo_gasto || 'Viáticos / Alimentación choferes';
    window.condCargarSubmotivosGastos(targetSubmotivo);

    var selTipo = document.getElementById('cond-gasto-tipo');
    if (selTipo) selTipo.value = targetSubmotivo;

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

// ═══════════════════════════════════════════════════════════════════
// 🛠️ SECCIÓN: REPORTE DE FALLAS DESDE EL PORTAL DEL CONDUCTOR
// ═══════════════════════════════════════════════════════════════════

const COND_SISTEMAS_TRACTO = {
    'MOTOR': [
        'Nivel y fugas de aceite de motor', 'Nivel y fugas de refrigerante',
        'Filtro de aire y admisión', 'Correas y poleas de accesorios',
        'Sistema de inyección y combustible', 'Ruidos anormales en motor / escape',
        'Turbocompresor e intercooler'
    ],
    'CAJA-CORONAS': [
        'Nivel y fugas de aceite de caja', 'Acople y pedal de embrague',
        'Palanca y varillaje de cambios', 'Diferenciales / Coronas y fugas',
        'Crucetas y cardán de transmisión'
    ],
    'REFRIGERACION': [
        'Mangueras y abrazaderas de agua', 'Termostato y tapa de radiador',
        'Ventilador y embrague viscoso', 'Limpieza del panal de radiador'
    ],
    'DIRECCION': [
        'Bomba y líquido de dirección', 'Caja de dirección y sector',
        'Terminales y barras de dirección', 'Alineación y juego del volante'
    ],
    'CABINA Y CHASIS': [
        'Luces delanteras y posteriores', 'Tablero e instrumentos de medición',
        'Bocina y limpiaparabrisas', 'Cinturones de seguridad y asientos',
        'Espejos retrovisores y lunas', 'Chasis, pernos y soportes'
    ]
};

const COND_SISTEMAS_REMOLQUE = {
    'FRENOS': [
        'Tambores, zapatas y pastillas', 'Pulmones de freno y mangueras',
        'Válvula repartidora / Relay', 'Manómetros y acoples de aire'
    ],
    'CARRETA': [
        'Quinta rueda y perno rey (King Pin)', 'Pines y bocinas de articulación',
        'Patas de apoyo y manivela', 'Chasis y estructura de carreta'
    ],
    'SISTEMA ELECTRICO': [
        'Luces laterales y de freno', 'Conector 7 vías (espiral)',
        'Cables y arneses eléctricos', 'Faros piratas y de retroceso'
    ],
    'SUSPENSION': [
        'Bolsas de aire / Pulmones', 'Muelles y paquetes de resortes',
        'Bujes y templadores de eje', 'Amortiguadores y soportes'
    ],
    'FURGON': [
        'Puertas posteriores y bisagras', 'Cerraduras y barras de seguridad',
        'Piso y paneles interiores', 'Techo y lonas herméticas'
    ],
    'LLANTAS': [
        'Presión y cocada de neumáticos', 'Tuercas y espárragos de rueda',
        'Aros y pestañas de fijación', 'Llanta de repuesto y soporte'
    ],
    'TERMOKING': [
        'Nivel de aceite de motor diésel', 'Temperatura y pantalla de control',
        'Batería y arranque del equipo', 'Correas y evaporador interior'
    ]
};

window._condFotosFallaBase64 = [];

// Abrir modal de Reporte de Fallas precargado con el viaje activo
window.condAbrirModalReporteFallas = function() {
    var viajeData = window._condViajeActivoData || {};
    var viaje = viajeData.viaje;
    var cond = viajeData.conductor || {};

    if (!viaje) {
        alert('⚠️ No cuentas con una Orden de Viaje activa asignada en este momento.\n\nPuedes contactar al área de Operaciones para asignarte un viaje.');
        return;
    }

    var subTxt = document.getElementById('cond-rf-subtitulo');
    if (subTxt) subTxt.textContent = `Viaje Activo: ${viaje.codigo || '—'}`;

    var pTracto = document.getElementById('cond-rf-placa-tracto');
    if (pTracto) pTracto.textContent = viaje.placa_tracto || viaje.placa || '---';

    var pRemolque = document.getElementById('cond-rf-placa-remolque');
    if (pRemolque) pRemolque.textContent = viaje.placa_remolque || viaje.remolque || '---';

    var rRuta = document.getElementById('cond-rf-ruta-txt');
    if (rRuta) rRuta.textContent = viaje.ruta || viaje.origen || viaje.procedencia || 'Ruta no especificada';

    var rKm = document.getElementById('cond-rf-km-txt');
    if (rKm) rKm.textContent = viaje.kilometraje ? `${viaje.kilometraje} km` : 'Km en ruta';

    // Resetear buscador y alertas de búsqueda
    var inpSearch = document.getElementById('cond_buscador_items');
    if (inpSearch) inpSearch.value = '';
    var emptyT = document.getElementById('cond_empty_search_tracto');
    if (emptyT) emptyT.style.display = 'none';
    var emptyR = document.getElementById('cond_empty_search_remolque');
    if (emptyR) emptyR.style.display = 'none';

    // Renderizar acordeones
    condRenderAcordeonSistemas('condAccTracto', COND_SISTEMAS_TRACTO, 'Tracto');
    condRenderAcordeonSistemas('condAccRemolque', COND_SISTEMAS_REMOLQUE, 'Remolque');

    // Limpiar contenedor de manuales, chips y fotos
    var contManuales = document.getElementById('cond-contenedor-fallas-manuales');
    if (contManuales) contManuales.innerHTML = '';
    window._condFotosFallaBase64 = [];
    condRenderPreviewFotosFalla();
    window.condActualizarChipsFallas();
    window.condActualizarContadores();

    // Resetear botón
    var btn = document.getElementById('cond-btn-enviar-falla');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send-fill me-1"></i> <span id="cond-btn-enviar-falla-txt">Enviar Reporte de Fallas</span>';
    }

    var modalEl = document.getElementById('condModalReporteFallas');
    if (modalEl) {
        var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
};

// Renderizar acordeón dinámico con checkboxes táctiles para el móvil
function condRenderAcordeonSistemas(contenedorId, sistemasDict, prefijo) {
    var cont = document.getElementById(contenedorId);
    if (!cont) return;

    var html = '';
    var keys = Object.keys(sistemasDict);

    keys.forEach((sysKey, idx) => {
        var accId = `cond_acc_${prefijo}_${idx}`;
        var items = sistemasDict[sysKey];

        html += `
            <div class="accordion-item border rounded-3 mb-2 overflow-hidden shadow-2xs cond-accordion-group" id="cond_group_${accId}">
                <h2 class="accordion-header" id="heading_${accId}">
                    <button class="accordion-button collapsed py-2.5 px-3 ${prefijo === 'Tracto' ? 'bg-light' : 'bg-warning-subtle bg-opacity-25'} text-dark fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#collapse_${accId}" style="font-size:0.86rem;">
                        <span class="d-flex align-items-center gap-2 flex-grow-1">
                            <span class="badge bg-secondary-subtle text-secondary rounded-pill px-2 py-0.5" style="font-size:0.65rem;">${items.length}</span>
                            <span>${sysKey}</span>
                        </span>
                        <span class="badge bg-secondary rounded-pill px-2 py-0.5 count-badge me-2" id="cnt_${accId}">0</span>
                    </button>
                </h2>
                <div id="collapse_${accId}" class="accordion-collapse collapse">
                    <div class="accordion-body p-2 bg-white">
                        <div class="d-flex flex-column gap-1.5">
        `;

        items.forEach((it, itIdx) => {
            var chkId = `cond_chk_${prefijo}_${idx}_${itIdx}`;
            var txtId = `cond_txt_${prefijo}_${idx}_${itIdx}`;
            var safeName = it.replace(/"/g, '&quot;');
            var upperTxt = it.toUpperCase();

            html += `
                <div class="p-2 rounded-2 border bg-light bg-opacity-50 cond-item-row" data-item-text="${upperTxt}" id="cond_row_${chkId}">
                    <div class="form-check d-flex align-items-center gap-2 m-0 cursor-pointer">
                        <input class="form-check-input cond-chk-item flex-shrink-0" type="checkbox" id="${chkId}" data-prefijo="${prefijo}" data-sistema="${sysKey}" data-item="${safeName}" onchange="window.condToggleFallaItem('${chkId}', '${txtId}')" style="width: 1.25rem; height: 1.25rem; cursor: pointer;">
                        <label class="form-check-label text-dark fw-semibold small flex-grow-1 cursor-pointer" for="${chkId}" id="cond_lbl_${chkId}">
                            ${it}
                        </label>
                    </div>
                    <div id="box_${txtId}" class="mt-2 d-none">
                        <input type="text" id="${txtId}" class="form-control form-control-sm border-secondary-subtle" placeholder="Detalle adicional opcional de la falla..." oninput="window.condActualizarChipsFallas()">
                    </div>
                </div>
            `;
        });

        html += `
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    cont.innerHTML = html;
}

// Búsqueda en vivo por palabras clave para el conductor
window.condFiltrarItemsLive = function(query) {
    var q = (query || '').toUpperCase().trim();
    var matchesTracto = 0;
    var matchesRemolque = 0;

    document.querySelectorAll('.cond-accordion-group').forEach(group => {
        var matchCountInGroup = 0;
        var items = group.querySelectorAll('.cond-item-row');
        var collapseEl = group.querySelector('.accordion-collapse');
        var isTractoGroup = group.id.includes('_Tracto_');

        items.forEach(row => {
            var text = row.getAttribute('data-item-text') || row.innerText.toUpperCase();
            if (!q || text.includes(q)) {
                row.style.display = 'block';
                matchCountInGroup++;
            } else {
                row.style.display = 'none';
            }
        });

        if (q) {
            if (matchCountInGroup > 0) {
                group.style.display = 'block';
                if (isTractoGroup) matchesTracto += matchCountInGroup;
                else matchesRemolque += matchCountInGroup;
                if (collapseEl && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
                    bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).show();
                }
            } else {
                group.style.display = 'none';
            }
        } else {
            group.style.display = 'block';
            if (collapseEl && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
                bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).hide();
            }
        }
    });

    var emptyT = document.getElementById('cond_empty_search_tracto');
    var emptyR = document.getElementById('cond_empty_search_remolque');
    if (emptyT) emptyT.style.display = (q && matchesTracto === 0) ? 'block' : 'none';
    if (emptyR) emptyR.style.display = (q && matchesRemolque === 0) ? 'block' : 'none';
};

// Expandir o colapsar todos los acordeones
window.condExpandirTodosAccordeones = function(expand = true) {
    document.querySelectorAll('.cond-accordion-group').forEach(group => {
        group.style.display = 'block';
        var collapseEl = group.querySelector('.accordion-collapse');
        var items = group.querySelectorAll('.cond-item-row');
        items.forEach(r => r.style.display = 'block');

        if (collapseEl && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
            var inst = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
            if (expand) inst.show(); else inst.hide();
        }
    });
};

// Alternar selección de falla
window.condToggleFallaItem = function(chkId, txtId) {
    var chk = document.getElementById(chkId);
    var box = document.getElementById(`box_${txtId}`);
    var row = document.getElementById(`cond_row_${chkId}`);
    if (!chk || !box) return;

    if (chk.checked) {
        box.classList.remove('d-none');
        if (row) row.classList.add('bg-warning', 'bg-opacity-15', 'border-warning');
        var input = document.getElementById(txtId);
        if (input) input.focus();
    } else {
        box.classList.add('d-none');
        if (row) row.classList.remove('bg-warning', 'bg-opacity-15', 'border-warning');
        var input2 = document.getElementById(txtId);
        if (input2) input2.value = '';
    }

    window.condActualizarContadores();
    window.condActualizarChipsFallas();
};

// Actualizar contadores totales y por sistema
window.condActualizarContadores = function() {
    var totalMarcadas = 0;

    document.querySelectorAll('.cond-accordion-group').forEach(group => {
        var checkedInGroup = group.querySelectorAll('.cond-chk-item:checked').length;
        var cntBadge = group.querySelector('.count-badge');
        if (cntBadge) {
            cntBadge.textContent = checkedInGroup;
            if (checkedInGroup > 0) {
                cntBadge.className = 'badge bg-primary rounded-pill px-2 py-0.5 count-badge me-2';
            } else {
                cntBadge.className = 'badge bg-secondary rounded-pill px-2 py-0.5 count-badge me-2';
            }
        }
        totalMarcadas += checkedInGroup;
    });

    var cntManuales = document.querySelectorAll('.cond-manual-falla-row').length;
    totalMarcadas += cntManuales;

    var counterBtn = document.getElementById('cond_counter_fallas');
    if (counterBtn) {
        counterBtn.textContent = `${totalMarcadas} falla${totalMarcadas !== 1 ? 's' : ''} marcada${totalMarcadas !== 1 ? 's' : ''}`;
        counterBtn.className = totalMarcadas > 0 ? 'badge bg-primary px-3 py-2 fs-6 rounded-pill' : 'badge bg-secondary px-3 py-2 fs-6 rounded-pill';
    }
};

// Actualizar chips visuales de fallas marcadas
window.condActualizarChipsFallas = function() {
    var wrapChips = document.getElementById('cond_chips_fallas_marcadas');
    if (!wrapChips) return;

    var viajeData = window._condViajeActivoData || {};
    var viaje = viajeData.viaje || {};
    var pTracto = viaje.placa_tracto || viaje.placa || '';
    var pRemolque = viaje.placa_remolque || viaje.remolque || '';

    var chipsHTML = '';

    document.querySelectorAll('.cond-chk-item:checked').forEach(chk => {
        var chkId = chk.id;
        var txtId = chkId.replace('cond_chk_', 'cond_txt_');
        var prefijo = chk.dataset.prefijo || 'Tracto';
        var itemNom = chk.dataset.item || 'Falla';
        var txtEl = document.getElementById(txtId);
        var desc = txtEl && txtEl.value.trim() ? txtEl.value.trim() : '(marcado)';

        var isTracto = prefijo.toLowerCase().includes('tracto');
        var unitBadge = isTracto
            ? `<span class="badge bg-primary text-white text-uppercase px-2 py-0.5" style="font-size:0.65rem;"><i class="bi bi-truck me-1"></i>TRACTO ${pTracto ? '('+pTracto+')' : ''}</span>`
            : `<span class="badge bg-warning text-dark text-uppercase px-2 py-0.5" style="font-size:0.65rem;"><i class="bi bi-truck-flatbed me-1"></i>CARRETA ${pRemolque ? '('+pRemolque+')' : ''}</span>`;
        var cardBorder = isTracto ? 'border: 1px solid #93c5fd; background: #eff6ff;' : 'border: 1px solid #fde68a; background: #fffbeb;';

        chipsHTML += `
            <span class="d-inline-flex align-items-center gap-2 px-2.5 py-1.5 rounded-3 shadow-2xs" style="${cardBorder}">
                ${unitBadge}
                <span class="fw-bold text-dark" style="font-size:0.8rem;">${itemNom}:</span>
                <span class="text-secondary small" style="font-size:0.76rem; max-width: 220px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${desc}</span>
                <i class="bi bi-x-circle-fill text-danger cursor-pointer ms-1 fs-6" title="Quitar falla" onclick="document.getElementById('${chkId}').checked = false; window.condToggleFallaItem('${chkId}', '${txtId}');"></i>
            </span>
        `;
    });

    if (chipsHTML) {
        wrapChips.style.display = 'flex';
        wrapChips.style.setProperty('display', 'flex', 'important');
        wrapChips.innerHTML = chipsHTML;
    } else {
        wrapChips.style.display = 'none';
        wrapChips.style.setProperty('display', 'none', 'important');
        wrapChips.innerHTML = '';
    }
};

// Agregar fila manual de falla no listada
window.condAgregarFallaManual = function() {
    var cont = document.getElementById('cond-contenedor-fallas-manuales');
    if (!cont) return;

    var viajeData = window._condViajeActivoData || {};
    var viaje = viajeData.viaje || {};
    var pTracto = viaje.placa_tracto || viaje.placa || 'TRACTO';
    var pRemolque = viaje.placa_remolque || viaje.remolque || 'CARRETA';

    var rowId = 'cond_man_' + Date.now() + '_' + Math.floor(Math.random()*1000);
    var div = document.createElement('div');
    div.id = rowId;
    div.className = 'p-2 rounded-3 border bg-white shadow-2xs d-flex flex-column gap-2 cond-manual-falla-row';
    div.innerHTML = `
        <div class="d-flex align-items-center justify-content-between gap-2">
            <select class="form-select form-select-sm fw-bold cond-man-unidad" style="max-width: 170px;">
                <option value="TRACTO">Tracto (${pTracto})</option>
                <option value="REMOLQUE">Carreta (${pRemolque})</option>
            </select>
            <button type="button" class="btn btn-outline-danger btn-sm p-1 px-2 rounded-pill" onclick="document.getElementById('${rowId}').remove(); window.condActualizarContadores();" title="Eliminar fila">
                <i class="bi bi-trash3-fill"></i>
            </button>
        </div>
        <input type="text" class="form-control form-control-sm cond-man-desc fw-semibold border-secondary-subtle" placeholder="Escribe aquí la falla observada (Ej: Fuga de aire en manguera 2)..." required oninput="window.condActualizarContadores()">
    `;
    cont.appendChild(div);
    var inp = div.querySelector('.cond-man-desc');
    if (inp) inp.focus();
    window.condActualizarContadores();
};

// Procesamiento de fotos de evidencia
window.condProcesarFotosFalla = function(input) {
    if (!input || !input.files || input.files.length === 0) return;

    Array.from(input.files).forEach(file => {
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var maxDim = 1200;
                var w = img.width;
                var h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                    else { w = Math.round((w * maxDim) / h); h = maxDim; }
                }
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var base64 = canvas.toDataURL('image/jpeg', 0.82);
                window._condFotosFallaBase64.push(base64);
                condRenderPreviewFotosFalla();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
};

function condRenderPreviewFotosFalla() {
    var prev = document.getElementById('cond_rf_preview_fotos');
    if (!prev) return;

    if (!window._condFotosFallaBase64 || window._condFotosFallaBase64.length === 0) {
        prev.innerHTML = '';
        return;
    }

    prev.innerHTML = window._condFotosFallaBase64.map((b64, idx) => `
        <div class="position-relative border rounded overflow-hidden shadow-2xs" style="width: 76px; height: 76px;">
            <img src="${b64}" style="width: 100%; height: 100%; object-fit: cover;">
            <button type="button" class="btn btn-danger position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center" onclick="window.condEliminarFotoFalla(${idx})" style="width: 20px; height: 20px; font-size: 0.7rem; border-radius: 0 0 0 6px;">✕</button>
        </div>
    `).join('');
}

window.condEliminarFotoFalla = function(idx) {
    if (window._condFotosFallaBase64) {
        window._condFotosFallaBase64.splice(idx, 1);
        condRenderPreviewFotosFalla();
    }
};

// Guardar/Enviar el Reporte de Fallas desde el Conductor
window.condGuardarReporteFallas = async function(e) {
    if (e) e.preventDefault();

    var viajeData = window._condViajeActivoData || {};
    var viaje = viajeData.viaje;
    var cond = viajeData.conductor || {};

    if (!viaje) {
        alert('No tienes un viaje activo asignado.');
        return;
    }

    var btn = document.getElementById('cond-btn-enviar-falla');
    var btnTxt = document.getElementById('cond-btn-enviar-falla-txt');
    var origTxt = btnTxt ? btnTxt.textContent : 'Enviar Reporte de Fallas';

    // Timestamp actual para las fallas reportadas en este momento
    var nowFmt = new Date().toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    var fallasTracto = [];
    var fallasRemolque = [];

    // 1. Recolectar checkboxes marcados
    document.querySelectorAll('.cond-chk-item:checked').forEach(chk => {
        var prefijo = chk.dataset.prefijo || 'Tracto';
        var sistema = chk.dataset.sistema || 'GENERAL';
        var itemNom = chk.dataset.item || 'Falla Observada';
        var txtEl = document.getElementById(chk.id.replace('cond_chk_', 'cond_txt_'));
        var obsTxt = txtEl && txtEl.value.trim() ? txtEl.value.trim() : itemNom;

        var obj = { sistema: sistema.toUpperCase(), item: itemNom, obs: obsTxt, fecha: nowFmt };
        if (prefijo.toLowerCase().includes('remolque')) {
            fallasRemolque.push(obj);
        } else {
            fallasTracto.push(obj);
        }
    });

    // 2. Recolectar fallas manuales
    document.querySelectorAll('.cond-manual-falla-row').forEach(row => {
        var selUnidad = row.querySelector('.cond-man-unidad')?.value || 'TRACTO';
        var desc = row.querySelector('.cond-man-desc')?.value.trim() || '';

        if (desc) {
            var obj = { sistema: 'MANUAL', item: 'Falla Manual', obs: desc, fecha: nowFmt };
            if (selUnidad === 'REMOLQUE') {
                fallasRemolque.push(obj);
            } else {
                fallasTracto.push(obj);
            }
        }
    });

    if (fallasTracto.length === 0 && fallasRemolque.length === 0) {
        alert('⚠️ Por favor marca al menos una falla en los acordeones o agrega una falla manual para poder enviar el reporte.');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Enviando reporte...`;
    }

    try {
        var payload = {
            orden_viaje: (viaje.codigo || viaje.id || '').trim(),
            placa_tracto: (viaje.placa_tracto || viaje.placa || '').trim().toUpperCase(),
            placa_remolque: (viaje.placa_remolque || viaje.remolque || '').trim().toUpperCase(),
            km_inicial: viaje.kilometraje || 0,
            km_final: viaje.kilometraje || 0,
            conductor: cond.nombre || viaje.conductor || window.usuarioLogueado || 'Conductor',
            procedencia: viaje.ruta || viaje.origen || viaje.procedencia || '',
            fallas_tracto: fallasTracto,
            fallas_remolque: fallasRemolque,
            fallas_libres_text: '',
            fotos_base64: window._condFotosFallaBase64 || [],
            creado_por: cond.nombre ? `${cond.nombre} (Conductor)` : (window.usuarioLogueado || 'Conductor'),
            anexar_si_existe: true
        };

        var res = await fetch('/api/checklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var json = await res.json();

        if (json && json.ok) {
            var msg = json.anexado 
                ? `✅ ¡Fallas anexadas exitosamente al reporte de tu viaje activo!\n\nFolio: ${json.folio || 'Registrado'}` 
                : `✅ ¡Reporte de fallas generado y enviado exitosamente!\n\nFolio: ${json.folio || 'Registrado'}`;
            alert(msg);

            var modal = bootstrap.Modal.getInstance(document.getElementById('condModalReporteFallas'));
            if (modal) modal.hide();
        } else {
            alert(json.error || 'No se pudo guardar el reporte de fallas.');
        }
    } catch(err) {
        alert('Error al enviar el reporte de fallas: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-send-fill me-1"></i> <span id="cond-btn-enviar-falla-txt">${origTxt}</span>`;
        }
    }
};
