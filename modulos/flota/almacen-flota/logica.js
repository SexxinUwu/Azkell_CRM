// Almacén de flota (versión actual). Mismo contrato que la versión nueva y que routes/almacen-flota.js:
// Asignar = salida del almacén hacia la unidad. Devolver = lo que sale de la unidad vuelve al almacén.
// Todo va dentro de una función para no declarar variables globales (evita "already declared" al recargar).
(function () {
    var estado = { unidades: [], placa: null, saldo: [], movimientos: [], articulos: [], placas: [], volverDetalle: false };

    function el(id) { return document.getElementById(id); }

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function num(v) { return Number(v) || 0; }

    function soles(v) {
        return 'S/ ' + num(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fechaCorta(iso) {
        if (!iso) return '—';
        var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
        return isNaN(d) ? String(iso) : d.toLocaleDateString('es-PE');
    }

    function hoy() { return new Date().toISOString().slice(0, 10); }

    function usuario() { return localStorage.getItem('fleet_user') || 'sistema'; }

    function avisar(mensaje, tipo) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta(mensaje, tipo || 'info');
        else alert(mensaje);
    }

    function modal(id) { return bootstrap.Modal.getOrCreateInstance(el(id)); }

    function puedeAsignar() { return typeof window.checkPerm === 'function' && window.checkPerm('sal_inv', 'c'); }
    function puedeDevolver() { return typeof window.checkPerm === 'function' && window.checkPerm('ent_inv', 'c'); }

    // Llamada al servidor: lanza error con el mensaje que devuelve (p. ej. stock insuficiente)
    function pedir(url, opciones) {
        return fetch(url, opciones || {}).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok || (d && d.ok === false)) throw new Error((d && d.error) || ('Error ' + r.status));
                return d;
            });
        });
    }

    function enviar(url, cuerpo) {
        return pedir(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo),
        });
    }

    // ── Resumen de unidades ─────────────────────────────────────────────
    function cargarResumen() {
        return pedir('/api/almacen/flota/resumen').then(function (d) {
            estado.unidades = d.unidades || [];
            pintarResumen();
        }).catch(function (e) {
            el('almFlotaSub').textContent = 'No se pudo cargar: ' + e.message;
        });
    }

    function pintarResumen() {
        var buscar = (el('almFlotaBuscar').value || '').trim().toUpperCase();
        var total = estado.unidades.reduce(function (a, u) { return a + num(u.valor); }, 0);
        el('almFlotaSub').textContent = estado.unidades.length + ' unidades con artículos · ' + soles(total);
        var lista = estado.unidades.filter(function (u) {
            return !buscar || String(u.placa).indexOf(buscar) !== -1;
        });
        el('almFlotaGrid').innerHTML = lista.length
            ? lista.map(tarjeta).join('')
            : '<div class="alm-vacio col-12">' + (estado.unidades.length
                ? 'Ninguna placa coincide con la búsqueda.'
                : 'Ninguna unidad tiene artículos asignados.') + '</div>';
    }

    function tarjeta(u) {
        return '<div class="col-sm-6 col-lg-4 col-xl-3">' +
            '<button type="button" class="alm-card" data-placa="' + esc(u.placa) + '">' +
            '<div class="alm-placa">' + esc(u.placa) + '</div>' +
            '<div class="alm-cifras">' +
            '<div><b>' + num(u.articulos) + '</b>artículos</div>' +
            '<div><b>' + num(u.piezas) + '</b>piezas</div>' +
            '<div><b>' + soles(u.valor) + '</b>valor</div>' +
            '</div>' +
            '<div class="small text-muted mt-2">Último movimiento: ' + fechaCorta(u.ultimo) + '</div>' +
            '</button></div>';
    }

    // ── Detalle de una unidad: saldo y movimientos ──────────────────────
    function abrirDetalle(placa) {
        estado.placa = placa;
        pedir('/api/almacen/flota/unidades/' + encodeURIComponent(placa)).then(function (d) {
            estado.saldo = d.saldo || [];
            estado.movimientos = d.movimientos || [];
            el('almFlotaDetTitulo').textContent = 'Unidad ' + placa;
            pintarDetalle();
            modal('modalAlmFlotaDetalle').show();
        }).catch(function (e) {
            avisar('No se pudo abrir la unidad: ' + e.message, 'danger');
        });
    }

    function pintarDetalle() {
        el('almFlotaSaldoBody').innerHTML = estado.saldo.length
            ? estado.saldo.map(function (s) {
                return '<tr><td>' + esc(s.inventario_id) + ' · ' + esc(s.descripcion || '') + '</td>' +
                    '<td>' + esc(s.unidad || '') + '</td>' +
                    '<td class="text-end fw-semibold">' + num(s.saldo) + '</td>' +
                    '<td class="text-end">' + soles(s.costo_referencial) + '</td>' +
                    '<td class="text-end">' + soles(num(s.saldo) * num(s.costo_referencial)) + '</td></tr>';
            }).join('')
            : '<tr><td colspan="5" class="text-muted text-center">La unidad no tiene artículos.</td></tr>';

        el('almFlotaMovBody').innerHTML = estado.movimientos.length
            ? estado.movimientos.map(function (m) {
                var salio = m.tipo === 'ASIGNACION';
                return '<tr><td>' + fechaCorta(m.fecha) + '</td>' +
                    '<td><span class="badge ' + (salio ? 'bg-dark' : 'bg-success') + '">' +
                    (salio ? 'Salió del almacén' : 'Volvió al almacén') + '</span></td>' +
                    '<td>' + esc(m.documento || '—') + '</td>' +
                    '<td>' + esc(m.descripcion || m.inventario_id || '') + '</td>' +
                    '<td class="text-end">' + num(m.cantidad) + '</td>' +
                    '<td>' + esc(m.usuario || '') + '</td></tr>';
            }).join('')
            : '<tr><td colspan="6" class="text-muted text-center">Sin movimientos.</td></tr>';

        el('btnAlmFlotaDetAsignar').hidden = !puedeAsignar();
        el('btnAlmFlotaDetDevolver').hidden = !puedeDevolver() || !estado.saldo.length;
    }

    // Cierra el detalle y, cuando termina de cerrarse, ejecuta la acción (dos modales no pueden estar abiertos a la vez)
    function desdeDetalle(accion) {
        var origen = el('modalAlmFlotaDetalle');
        var inst = bootstrap.Modal.getOrCreateInstance(origen);
        estado.volverDetalle = true;
        origen.addEventListener('hidden.bs.modal', function una() {
            origen.removeEventListener('hidden.bs.modal', una);
            accion();
        });
        inst.hide();
    }

    // Al cerrar Asignar o Devolver (guardado o cancelado) se vuelve al detalle si se abrió desde ahí
    function alCerrarOperacion() {
        if (!estado.volverDetalle || !estado.placa) return;
        estado.volverDetalle = false;
        abrirDetalle(estado.placa);
    }

    // ── Catálogos para asignar ──────────────────────────────────────────
    function cargarPlacas() {
        return pedir('/api/placas-lista').then(function (d) {
            estado.placas = (Array.isArray(d) ? d : [])
                .map(function (p) { return String(p.placa || '').toUpperCase(); })
                .filter(Boolean)
                .sort();
        });
    }

    function cargarArticulos() {
        return pedir('/api/almacen/inventario').then(function (d) {
            estado.articulos = (Array.isArray(d) ? d : []).filter(function (a) {
                return String(a.activo) !== '0' && num(a.stock_actual) > 0;
            });
        });
    }

    function opcionesArticulos() {
        return '<option value="">Elige artículo…</option>' + estado.articulos.map(function (a) {
            return '<option value="' + esc(a.id) + '">' +
                esc(a.id + ' · ' + (a.descripcion || '') + ' (hay ' + num(a.stock_actual) + ')') + '</option>';
        }).join('');
    }

    // ── Asignar: sale del almacén hacia la unidad ───────────────────────
    function abrirAsignar(placaFija, desdeDetalleFlag) {
        estado.volverDetalle = !!desdeDetalleFlag;
        Promise.all([cargarPlacas(), cargarArticulos()]).then(function () {
            var selPlaca = el('almAsigPlaca');
            selPlaca.innerHTML = '<option value="">Elige la unidad…</option>' + estado.placas.map(function (p) {
                return '<option value="' + esc(p) + '">' + esc(p) + '</option>';
            }).join('');
            selPlaca.value = placaFija || '';
            selPlaca.disabled = !!placaFija;
            el('almAsigObs').value = '';
            el('almAsigLineas').innerHTML = '';
            agregarLineaAsignar();
            modal('modalAlmFlotaAsignar').show();
        }).catch(function (e) {
            avisar('No se pudo preparar la asignación: ' + e.message, 'danger');
        });
    }

    function agregarLineaAsignar() {
        var fila = document.createElement('div');
        fila.className = 'row g-2 align-items-center mb-2 alm-linea';
        fila.innerHTML =
            '<div class="col-md-8"><select class="form-select alm-art">' + opcionesArticulos() + '</select></div>' +
            '<div class="col-7 col-md-3"><input type="number" class="form-control alm-cant" min="0" step="0.0001" placeholder="Cantidad"></div>' +
            '<div class="col-5 col-md-1 text-end"><button type="button" class="btn btn-outline-danger btn-sm alm-quitar" title="Quitar"><i class="bi bi-x-lg"></i></button></div>';
        el('almAsigLineas').appendChild(fila);
    }

    function guardarAsignar() {
        var placa = el('almAsigPlaca').value;
        var cantidades = {};
        var error = '';
        el('almAsigLineas').querySelectorAll('.alm-linea').forEach(function (fila) {
            var art = fila.querySelector('.alm-art').value;
            var cant = num(fila.querySelector('.alm-cant').value);
            if (!art && !cant) return;
            if (!art || cant <= 0) { error = 'Cada línea necesita un artículo y una cantidad mayor que cero.'; return; }
            cantidades[art] = (cantidades[art] || 0) + cant;
        });
        if (!placa) return avisar('Elige la unidad.', 'warning');
        if (error) return avisar(error, 'warning');
        var items = Object.keys(cantidades).map(function (k) { return { inventario_id: k, cantidad: cantidades[k] }; });
        if (!items.length) return avisar('Agrega al menos un artículo con cantidad.', 'warning');

        var boton = el('btnAlmAsigGuardar');
        boton.disabled = true;
        enviar('/api/almacen/flota/asignar', {
            placa: placa, items: items, observaciones: el('almAsigObs').value, usuario: usuario(), fecha: hoy(),
        }).then(function (d) {
            avisar(d.mensaje || 'Artículos asignados.', 'success');
            modal('modalAlmFlotaAsignar').hide();
            cargarResumen();
        }).catch(function (e) {
            avisar(e.message, 'danger');
        }).finally(function () {
            boton.disabled = false;
        });
    }

    // ── Devolver: vuelve de la unidad al almacén ────────────────────────
    function abrirDevolver() {
        estado.volverDetalle = true;
        el('almDevPlacaTxt').textContent = estado.placa || '';
        el('almDevObs').value = '';
        el('almDevFilas').innerHTML = estado.saldo.map(function (s) {
            var saldo = num(s.saldo);
            return '<tr><td>' + esc(s.inventario_id) + ' · ' + esc(s.descripcion || '') + '</td>' +
                '<td class="text-end">' + saldo + '</td>' +
                '<td style="width: 140px;"><input type="number" class="form-control form-control-sm text-end alm-dev-cant" ' +
                'data-inv="' + esc(s.inventario_id) + '" data-max="' + saldo + '" min="0" max="' + saldo + '" step="0.0001" placeholder="0"></td></tr>';
        }).join('');
        modal('modalAlmFlotaDevolver').show();
    }

    function guardarDevolver() {
        var items = [];
        var error = '';
        el('almDevFilas').querySelectorAll('.alm-dev-cant').forEach(function (inp) {
            var cant = num(inp.value);
            if (cant <= 0) return;
            if (cant > num(inp.getAttribute('data-max'))) error = 'No puedes devolver más de lo que tiene la unidad.';
            items.push({ inventario_id: inp.getAttribute('data-inv'), cantidad: cant });
        });
        if (error) return avisar(error, 'warning');
        if (!items.length) return avisar('Indica cuánto devuelves de al menos un artículo.', 'warning');

        var boton = el('btnAlmDevGuardar');
        boton.disabled = true;
        enviar('/api/almacen/flota/devolver', {
            placa: estado.placa, items: items, observaciones: el('almDevObs').value, usuario: usuario(), fecha: hoy(),
        }).then(function (d) {
            avisar(d.mensaje || 'Artículos devueltos al almacén.', 'success');
            modal('modalAlmFlotaDevolver').hide();
            cargarResumen();
        }).catch(function (e) {
            avisar(e.message, 'danger');
        }).finally(function () {
            boton.disabled = false;
        });
    }

    // ── Arranque ────────────────────────────────────────────────────────
    function init_flota_almacen_flota() {
        var raiz = el('almFlota');
        var puedeVer = typeof window.checkPerm === 'function' &&
            (window.checkPerm('inv', 'l') || window.checkPerm('sal_inv', 'l') || window.checkPerm('ent_inv', 'l'));
        if (!puedeVer) {
            if (raiz && typeof window.showNoPermMsg === 'function') window.showNoPermMsg(raiz);
            return;
        }

        el('btnAlmFlotaAsignar').hidden = !puedeAsignar();

        el('almFlotaBuscar').addEventListener('input', pintarResumen);
        el('almFlotaGrid').addEventListener('click', function (e) {
            var tarjetaTocada = e.target.closest('[data-placa]');
            if (tarjetaTocada) abrirDetalle(tarjetaTocada.getAttribute('data-placa'));
        });

        el('btnAlmFlotaAsignar').addEventListener('click', function () { abrirAsignar(null, false); });
        el('btnAlmFlotaDetAsignar').addEventListener('click', function () {
            var placa = estado.placa;
            desdeDetalle(function () { estado.placa = placa; abrirAsignar(placa, true); });
        });
        el('btnAlmFlotaDetDevolver').addEventListener('click', function () {
            desdeDetalle(function () { abrirDevolver(); });
        });

        el('btnAlmAsigAgregar').addEventListener('click', agregarLineaAsignar);
        el('almAsigLineas').addEventListener('click', function (e) {
            var quitar = e.target.closest('.alm-quitar');
            if (quitar) quitar.closest('.alm-linea').remove();
        });
        el('btnAlmAsigGuardar').addEventListener('click', guardarAsignar);
        el('modalAlmFlotaAsignar').addEventListener('hidden.bs.modal', alCerrarOperacion);

        el('btnAlmDevGuardar').addEventListener('click', guardarDevolver);
        el('modalAlmFlotaDevolver').addEventListener('hidden.bs.modal', alCerrarOperacion);

        cargarResumen();
    }

    window.init_flota_almacen_flota = init_flota_almacen_flota;
})();
