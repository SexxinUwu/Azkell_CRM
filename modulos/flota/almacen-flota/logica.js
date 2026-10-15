// Almacén de flota (versión actual). Stock propio, separado del inventario general.
// Mismo contrato que la versión React y que routes/almacen-flota.js (montado en /api/almacen/flota/*).
// Todo va dentro de una función para no declarar variables globales (evita "already declared" al recargar).
(function () {
    var BASE = '/api/almacen/flota';
    var estado = {
        vista: 'articulos', articulos: [], unidades: [], placas: [],
        modo: 'ingreso', placaMov: '', lineas: [], articuloEditando: null, saldoUnidad: [],
    };

    function el(id) { return document.getElementById(id); }

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function num(v) { return Number(v) || 0; }
    function cant(v) { return num(v).toLocaleString('es-PE', { maximumFractionDigits: 4 }); }
    function soles(v) { return 'S/ ' + num(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function decimalDe(v) { return Number(String(v == null ? '' : v).replace(',', '.')) || 0; }

    function dia(s) {
        var v = String(s || '').slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : '—';
    }

    function hoy() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()); }
    function usuario() { return localStorage.getItem('fleet_user') || 'sistema'; }
    function avisar(mensaje, tipo) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta(mensaje, tipo || 'info');
        else alert(mensaje);
    }
    function modal(id) { return el(id) ? bootstrap.Modal.getOrCreateInstance(el(id)) : null; }
    function puedeEditar() { return typeof window.checkPerm !== 'function' || window.checkPerm('sal_inv', 'c'); }

    // Llamada al servidor: lanza error con el mensaje que devuelve (stock insuficiente, etc.)
    function pedir(url, opciones) {
        return fetch(url, opciones || {}).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok || (d && d.ok === false)) throw new Error((d && d.error) || ('Error ' + r.status));
                return d;
            });
        });
    }

    function enviar(url, metodo, cuerpo) {
        return pedir(url, {
            method: metodo || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo),
        });
    }

    function textoPlacas(placas) {
        return (placas || []).map(function (p) {
            return '<span class="alm-placa">' + esc(p.placa) + '</span> <span class="alm-chip-cant">' + esc(cant(p.cantidad)) + '</span>';
        }).join(' ');
    }

    // ── Cabecera y métricas ─────────────────────────────────────────────
    function pintarCabecera() {
        var enAlmacen = 0, enUnidades = 0, valor = 0;
        estado.articulos.forEach(function (a) {
            enAlmacen += num(a.almacen);
            enUnidades += num(a.en_unidades);
            valor += num(a.total) * num(a.costo_referencial);
        });
        if (el('almFlotaSub')) el('almFlotaSub').textContent = estado.articulos.length + ' artículos · ' + soles(valor);
        if (el('almFlotaMetAlmacen')) el('almFlotaMetAlmacen').textContent = cant(enAlmacen);
        if (el('almFlotaMetUnidades')) el('almFlotaMetUnidades').textContent = cant(enUnidades);
        if (el('almFlotaMetValor')) el('almFlotaMetValor').textContent = soles(valor);
    }

    function pintarAcciones() {
        var caja = el('almFlotaAcciones');
        if (caja) caja.hidden = !puedeEditar();
    }

    function pintar() {
        var q = (el('almFlotaBuscar') ? el('almFlotaBuscar').value : '').trim().toUpperCase();
        var cont = el('almFlotaContenido');
        if (!cont) return;
        el('almFlotaFiltros').hidden = estado.vista === 'historial';
        el('almFlotaHistFiltros').hidden = estado.vista !== 'historial';
        if (estado.vista === 'articulos') return pintarArticulos(q, cont);
        if (estado.vista === 'unidades') return pintarUnidades(q, cont);
        return cargarHistorial();
    }

    // ── Artículos ───────────────────────────────────────────────────────
    function pintarArticulos(q, cont) {
        var lista = estado.articulos.filter(function (a) {
            if (!q) return true;
            if (String(a.descripcion).toUpperCase().indexOf(q) !== -1) return true;
            return (a.placas || []).some(function (p) { return p.placa.indexOf(q) !== -1; });
        });
        if (!lista.length) {
            cont.innerHTML = '<div class="col-12 alm-vacio">' + (q ? 'Sin coincidencias.' : 'Crea artículos y registra su ingreso al almacén de flota.') + '</div>';
            return;
        }
        cont.innerHTML = lista.map(function (a) {
            var bajo = num(a.stock_minimo) > 0 && num(a.almacen) < num(a.stock_minimo);
            return '<div class="col-md-6 col-xl-4"><button type="button" class="alm-card" data-articulo="' + a.id + '">' +
                '<div class="alm-card-titulo">' + esc(a.descripcion) + '</div>' +
                '<div class="alm-card-sub">' + esc(a.familia || '') + (a.unidad ? ' · ' + esc(a.unidad) : '') + '</div>' +
                '<div class="alm-cifras"><div><b>' + esc(cant(a.almacen)) + '</b>en almacén</div>' +
                '<div><b>' + esc(cant(a.en_unidades)) + '</b>en unidades</div></div>' +
                (bajo ? '<div class="small text-danger mt-1">Bajo el mínimo (' + esc(cant(a.stock_minimo)) + ')</div>' : '') +
                (a.placas && a.placas.length ? '<div class="alm-placas">' + textoPlacas(a.placas.slice(0, 4)) + (a.placas.length > 4 ? ' <span class="small text-muted">y ' + (a.placas.length - 4) + ' más</span>' : '') + '</div>' : '') +
                '</button></div>';
        }).join('');
        cont.querySelectorAll('[data-articulo]').forEach(function (b) {
            b.addEventListener('click', function () { abrirArticulo(b.getAttribute('data-articulo')); });
        });
    }

    function cargarArticulos() {
        return pedir(BASE + '/articulos').then(function (d) {
            estado.articulos = d.articulos || [];
            pintarCabecera();
            pintar();
        }).catch(function (e) { avisar('No se pudo cargar el almacén: ' + e.message, 'danger'); });
    }

    function abrirArticulo(id) {
        pedir(BASE + '/articulos/' + encodeURIComponent(id)).then(function (f) {
            var a = f.articulo;
            el('almFlotaDetTitulo').textContent = a.descripcion;
            var kardex = (f.kardex || []).map(function (k) {
                var entra = k.entrada > 0;
                var detalle = k.tipo === 'ASIGNACION' ? 'a ' + (k.placa || '—') : k.tipo === 'REINGRESO' ? 'desde ' + (k.placa || '—') : (k.referencia || '');
                return '<tr><td>' + dia(k.fecha) + '</td><td>' + esc(TIPO[k.tipo]) + ' <span class="small text-muted">' + esc(detalle) + '</span></td>' +
                    '<td>' + esc(k.codigo) + '</td>' +
                    '<td class="text-end ' + (entra ? 'alm-entrada' : 'alm-salida') + '">' + (entra ? '+' : '−') + esc(cant(entra ? k.entrada : k.salida)) + '</td>' +
                    '<td class="text-end">' + esc(cant(k.saldo)) + '</td><td>' + esc(k.usuario || '—') + '</td></tr>';
            }).join('');
            el('almFlotaDetCuerpo').innerHTML =
                '<div class="small text-muted mb-3">' + esc(a.familia || '') + (a.unidad ? ' · ' + esc(a.unidad) : '') + ' · costo referencial ' + soles(a.costo_referencial) + '</div>' +
                '<div class="alm-metricas">' +
                '<div class="alm-metrica"><b>' + esc(cant(f.almacen)) + '</b><span>En almacén</span></div>' +
                '<div class="alm-metrica"><b>' + esc(cant(f.placas.reduce(function (s, p) { return s + num(p.cantidad); }, 0))) + '</b><span>En unidades</span></div>' +
                '<div class="alm-metrica"><b>' + f.placas.length + '</b><span>Unidades</span></div></div>' +
                '<h6 class="fw-bold">Dónde está</h6>' +
                '<div class="alm-placas mb-4">' + (f.placas.length ? textoPlacas(f.placas) : '<span class="text-muted small">No está en ninguna unidad.</span>') + '</div>' +
                '<h6 class="fw-bold">Kardex</h6>' +
                '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Documento</th><th class="text-end">Cant.</th><th class="text-end">Saldo</th><th>Usuario</th></tr></thead>' +
                '<tbody>' + (kardex || '<tr><td colspan="6" class="text-muted">Sin movimientos.</td></tr>') + '</tbody></table></div>';
            el('btnAlmFlotaDetEditar').hidden = !puedeEditar();
            el('btnAlmFlotaDetEditar').onclick = function () { modal('modalAlmFlotaDetalle').hide(); abrirFormularioArticulo(a); };
            el('btnAlmFlotaDetAsignar').hidden = !puedeEditar();
            el('btnAlmFlotaDetAsignar').onclick = function () { modal('modalAlmFlotaDetalle').hide(); abrirMovimiento('asignar', null, a.id); };
            el('btnAlmFlotaDetReingresar').hidden = true;
            modal('modalAlmFlotaDetalle').show();
        }).catch(function (e) { avisar(e.message, 'danger'); });
    }

    function abrirFormularioArticulo(art) {
        estado.articuloEditando = art || null;
        el('almFlotaArtTitulo').textContent = art ? 'Editar artículo' : 'Nuevo artículo';
        el('almArtDescripcion').value = art ? art.descripcion : '';
        el('almArtFamilia').value = art ? (art.familia || '') : '';
        el('almArtUnidad').value = art ? (art.unidad || '') : '';
        el('almArtCosto').value = art ? num(art.costo_referencial) : '';
        el('almArtMinimo').value = art ? num(art.stock_minimo) : '';
        modal('modalAlmFlotaArticulo').show();
    }

    function guardarArticulo() {
        var datos = {
            descripcion: el('almArtDescripcion').value.trim(),
            familia: el('almArtFamilia').value.trim(),
            unidad: el('almArtUnidad').value.trim(),
            costo_referencial: decimalDe(el('almArtCosto').value),
            stock_minimo: decimalDe(el('almArtMinimo').value),
            usuario: usuario(),
        };
        if (!datos.descripcion) { avisar('Escribe la descripción del artículo.', 'warning'); return; }
        var editando = estado.articuloEditando;
        var url = editando ? BASE + '/articulos/' + editando.id : BASE + '/articulos';
        enviar(url, editando ? 'PUT' : 'POST', datos).then(function (r) {
            avisar(r.mensaje || 'Artículo guardado.', 'success');
            modal('modalAlmFlotaArticulo').hide();
            return cargarArticulos();
        }).catch(function (e) { avisar(e.message, 'danger'); });
    }

    // ── Unidades ────────────────────────────────────────────────────────
    function pintarUnidades(q, cont) {
        var lista = estado.unidades.filter(function (u) { return !q || u.placa.indexOf(q) !== -1; });
        if (!lista.length) {
            cont.innerHTML = '<div class="col-12 alm-vacio">' + (q ? 'Sin coincidencias.' : 'Ninguna unidad tiene artículos.') + '</div>';
            return;
        }
        cont.innerHTML = lista.map(function (u) {
            return '<div class="col-md-6 col-xl-4"><button type="button" class="alm-card" data-unidad="' + esc(u.placa) + '">' +
                '<span class="alm-placa">' + esc(u.placa) + '</span>' +
                '<div class="alm-cifras mt-2"><div><b>' + u.articulos + '</b>artículos</div>' +
                '<div><b>' + esc(cant(u.piezas)) + '</b>piezas</div>' +
                '<div><b>' + esc(soles(u.valor)) + '</b>valor</div></div>' +
                '<div class="small text-muted mt-2">Último movimiento: ' + dia(u.ultimo) + '</div></button></div>';
        }).join('');
        cont.querySelectorAll('[data-unidad]').forEach(function (b) {
            b.addEventListener('click', function () { abrirUnidad(b.getAttribute('data-unidad')); });
        });
    }

    function cargarUnidades() {
        return pedir(BASE + '/unidades').then(function (d) {
            estado.unidades = d.unidades || [];
            pintar();
        }).catch(function (e) { avisar('No se pudieron cargar las unidades: ' + e.message, 'danger'); });
    }

    function abrirUnidad(placa) {
        pedir(BASE + '/unidades/' + encodeURIComponent(placa)).then(function (d) {
            estado.saldoUnidad = d.saldo || [];
            el('almFlotaDetTitulo').textContent = 'Unidad ' + d.placa;
            var valor = estado.saldoUnidad.reduce(function (s, x) { return s + num(x.saldo) * num(x.costo_referencial); }, 0);
            var saldo = estado.saldoUnidad.map(function (s) {
                return '<tr><td>' + esc(s.descripcion) + '</td><td>' + esc(s.unidad || '') + '</td>' +
                    '<td class="text-end">' + esc(cant(s.saldo)) + '</td><td class="text-end">' + esc(soles(s.costo_referencial)) + '</td>' +
                    '<td class="text-end">' + esc(soles(num(s.saldo) * num(s.costo_referencial))) + '</td></tr>';
            }).join('');
            var movs = (d.movimientos || []).map(function (m) {
                var sale = m.tipo === 'ASIGNACION';
                return '<tr><td>' + dia(m.fecha) + '</td><td>' + esc(TIPO[m.tipo]) + '</td><td>' + esc(m.codigo) + '</td>' +
                    '<td>' + esc(m.descripcion) + '</td><td class="text-end ' + (sale ? 'alm-entrada' : 'alm-salida') + '">' + (sale ? '+' : '−') + esc(cant(m.cantidad)) + '</td>' +
                    '<td>' + esc(m.usuario || '—') + '</td></tr>';
            }).join('');
            el('almFlotaDetCuerpo').innerHTML =
                '<div class="alm-metricas">' +
                '<div class="alm-metrica"><b>' + estado.saldoUnidad.length + '</b><span>Artículos</span></div>' +
                '<div class="alm-metrica"><b>' + esc(cant(estado.saldoUnidad.reduce(function (s, x) { return s + num(x.saldo); }, 0))) + '</b><span>Piezas</span></div>' +
                '<div class="alm-metrica"><b>' + esc(soles(valor)) + '</b><span>Valor</span></div></div>' +
                '<h6 class="fw-bold">En la unidad ahora</h6>' +
                '<div class="table-responsive mb-4"><table class="table table-sm align-middle"><thead><tr><th>Artículo</th><th>Unidad</th><th class="text-end">Saldo</th><th class="text-end">Costo ref.</th><th class="text-end">Valor</th></tr></thead>' +
                '<tbody>' + (saldo || '<tr><td colspan="5" class="text-muted">La unidad no tiene artículos.</td></tr>') + '</tbody></table></div>' +
                '<h6 class="fw-bold">Movimientos</h6>' +
                '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Documento</th><th>Artículo</th><th class="text-end">Cant.</th><th>Usuario</th></tr></thead>' +
                '<tbody>' + (movs || '<tr><td colspan="6" class="text-muted">Sin movimientos.</td></tr>') + '</tbody></table></div>';
            el('btnAlmFlotaDetEditar').hidden = true;
            el('btnAlmFlotaDetAsignar').hidden = !puedeEditar();
            el('btnAlmFlotaDetAsignar').onclick = function () { modal('modalAlmFlotaDetalle').hide(); abrirMovimiento('asignar', d.placa, null); };
            el('btnAlmFlotaDetReingresar').hidden = !puedeEditar() || !estado.saldoUnidad.length;
            el('btnAlmFlotaDetReingresar').onclick = function () { modal('modalAlmFlotaDetalle').hide(); abrirMovimiento('reingresar', d.placa, null); };
            modal('modalAlmFlotaDetalle').show();
        }).catch(function (e) { avisar(e.message, 'danger'); });
    }

    // ── Historial ───────────────────────────────────────────────────────
    function cargarHistorial() {
        var p = new URLSearchParams();
        var desde = el('almHistDesde').value, hasta = el('almHistHasta').value, tipo = el('almHistTipo').value;
        var placa = el('almHistPlaca').value.trim(), articulo = el('almHistArticulo').value.trim();
        if (desde) p.set('desde', desde);
        if (hasta) p.set('hasta', hasta);
        if (tipo) p.set('tipo', tipo);
        if (placa) p.set('placa', placa);
        if (articulo) p.set('q', articulo);
        el('almFlotaContenido').innerHTML = '<div class="col-12 text-muted small">Cargando…</div>';
        return pedir(BASE + '/historial?' + p.toString()).then(function (d) {
            var filas = (d.movimientos || []).map(function (m) {
                var detalle = m.tipo === 'ASIGNACION' ? 'a ' + (m.placa || '—') : m.tipo === 'REINGRESO' ? 'desde ' + (m.placa || '—') : (m.referencia || '');
                var sale = m.tipo === 'ASIGNACION';
                return '<tr><td>' + dia(m.fecha) + '</td><td>' + esc(TIPO[m.tipo]) + ' <span class="small text-muted">' + esc(detalle) + '</span></td>' +
                    '<td>' + esc(m.codigo) + '</td><td>' + esc(m.descripcion) + '</td>' +
                    '<td class="text-end ' + (sale ? 'alm-salida' : 'alm-entrada') + '">' + (sale ? '−' : '+') + esc(cant(m.cantidad)) + ' ' + esc(m.unidad || '') + '</td>' +
                    '<td>' + esc(m.usuario || '—') + '</td></tr>';
            }).join('');
            el('almFlotaContenido').innerHTML = '<div class="col-12"><div class="table-responsive"><table class="table table-sm align-middle">' +
                '<thead><tr><th>Fecha</th><th>Movimiento</th><th>Documento</th><th>Artículo</th><th class="text-end">Cant.</th><th>Usuario</th></tr></thead>' +
                '<tbody>' + (filas || '<tr><td colspan="6" class="text-muted">Sin operaciones con esos filtros.</td></tr>') + '</tbody></table></div></div>';
        }).catch(function (e) { avisar(e.message, 'danger'); });
    }

    var TIPO = { INGRESO: 'Ingreso', ASIGNACION: 'Salida a unidad', REINGRESO: 'Reingreso de unidad' };

    // ── Movimientos: ingreso, asignación y reingreso ────────────────────
    function opcionesArticulos() {
        if (estado.modo === 'reingresar') {
            return estado.saldoUnidad.map(function (s) {
                return { id: s.articulo_id, nombre: s.descripcion, max: num(s.saldo), detalle: 'en la unidad: ' + cant(s.saldo) };
            });
        }
        return estado.articulos
            .filter(function (a) { return estado.modo === 'ingreso' || num(a.almacen) > 0; })
            .map(function (a) {
                return { id: a.id, nombre: a.descripcion, max: estado.modo === 'asignar' ? num(a.almacen) : null, detalle: 'en almacén: ' + cant(a.almacen) };
            });
    }

    function pintarLineas() {
        var opciones = opcionesArticulos();
        var cont = el('almMovLineas');
        if (!estado.lineas.length) estado.lineas.push({ articulo_id: '', cantidad: '' });
        cont.innerHTML = estado.lineas.map(function (l, i) {
            var sel = opciones.map(function (o) {
                return '<option value="' + o.id + '"' + (String(o.id) === String(l.articulo_id) ? ' selected' : '') + '>' + esc(o.nombre) + ' · ' + esc(o.detalle) + '</option>';
            }).join('');
            var max = opciones.filter(function (o) { return String(o.id) === String(l.articulo_id); })[0];
            return '<div class="row g-2 align-items-center mb-2">' +
                '<div class="col-md-7"><select class="form-select form-select-sm" data-linea-art="' + i + '"><option value="">Elige el artículo…</option>' + sel + '</select></div>' +
                '<div class="col-4 col-md-3"><input type="number" step="any" min="0" class="form-control form-control-sm" data-linea-cant="' + i + '" value="' + esc(l.cantidad) + '" placeholder="Cantidad"' + (max && max.max != null ? ' max="' + max.max + '"' : '') + '></div>' +
                '<div class="col-2 col-md-2 text-end"><button type="button" class="btn btn-sm btn-outline-danger" data-linea-quitar="' + i + '" aria-label="Quitar"><i class="bi bi-x-lg"></i></button></div></div>';
        }).join('');
        cont.querySelectorAll('[data-linea-art]').forEach(function (s) {
            s.addEventListener('change', function () { estado.lineas[s.getAttribute('data-linea-art')].articulo_id = s.value; pintarLineas(); });
        });
        cont.querySelectorAll('[data-linea-cant]').forEach(function (inp) {
            inp.addEventListener('input', function () { estado.lineas[inp.getAttribute('data-linea-cant')].cantidad = inp.value; });
        });
        cont.querySelectorAll('[data-linea-quitar]').forEach(function (b) {
            b.addEventListener('click', function () { estado.lineas.splice(b.getAttribute('data-linea-quitar'), 1); pintarLineas(); });
        });
    }

    function llenarPlacas(seleccionada) {
        var sel = el('almMovPlaca');
        var lista = estado.modo === 'reingresar'
            ? estado.unidades.map(function (u) { return { placa: u.placa, detalle: u.articulos + ' artículo(s)' }; })
            : estado.placas;
        sel.innerHTML = '<option value="">Elige la unidad…</option>' + lista.map(function (p) {
            return '<option value="' + esc(p.placa) + '"' + (p.placa === seleccionada ? ' selected' : '') + '>' + esc(p.placa) + (p.detalle ? ' — ' + esc(p.detalle) : '') + '</option>';
        }).join('');
    }

    function abrirMovimiento(modo, placa, articuloId) {
        estado.modo = modo;
        estado.placaMov = placa || '';
        estado.lineas = articuloId ? [{ articulo_id: String(articuloId), cantidad: '' }] : [];
        var titulos = { ingreso: 'Ingresar al almacén de flota', asignar: 'Asignar artículos a una unidad', reingresar: 'Reingresar desde una unidad' };
        el('almFlotaMovTitulo').textContent = placa && modo !== 'ingreso' ? titulos[modo] + ' · ' + placa : titulos[modo];
        el('almFlotaMovUnidadWrap').hidden = modo === 'ingreso';
        el('almFlotaMovRefWrap').hidden = modo !== 'ingreso';
        el('almMovLineasTitulo').textContent = modo === 'ingreso' ? 'Artículos que ingresan' : modo === 'asignar' ? 'Artículos que salen del almacén' : 'Artículos que vuelven al almacén';
        el('almMovAyuda').textContent = modo === 'ingreso' ? 'Cada artículo suma al almacén con su costo referencial.'
            : modo === 'asignar' ? 'Solo aparecen artículos con stock en el almacén.'
            : 'Solo puedes reingresar lo que la unidad tiene.';
        el('almMovFecha').value = hoy();
        el('almMovRef').value = '';
        el('almMovObs').value = '';
        var cargaPlacas = modo === 'reingresar'
            ? (estado.unidades.length ? Promise.resolve() : cargarUnidades())
            : (estado.placas.length ? Promise.resolve() : cargarPlacas());
        cargaPlacas.then(function () {
            if (modo === 'reingresar') {
                // Lo que tiene la unidad elegida
                return placa ? pedir(BASE + '/unidades/' + encodeURIComponent(placa)).then(function (d) { estado.saldoUnidad = d.saldo || []; }) : Promise.resolve();
            }
            return cargarArticulosSiFalta();
        }).then(function () {
            llenarPlacas(placa);
            pintarLineas();
            el('almMovPlaca').onchange = function () {
                estado.placaMov = el('almMovPlaca').value;
                if (estado.modo === 'reingresar') {
                    estado.lineas = [];
                    var p = estado.placaMov;
                    if (!p) { estado.saldoUnidad = []; pintarLineas(); return; }
                    pedir(BASE + '/unidades/' + encodeURIComponent(p)).then(function (d) { estado.saldoUnidad = d.saldo || []; pintarLineas(); }).catch(function (e) { avisar(e.message, 'danger'); });
                } else pintarLineas();
            };
            modal('modalAlmFlotaMov').show();
        }).catch(function (e) { avisar(e.message, 'danger'); });
    }

    function cargarArticulosSiFalta() {
        return estado.articulos.length ? Promise.resolve() : cargarArticulos();
    }

    function cargarPlacas() {
        // Mismas placas que el resto del sistema (lista de la versión actual)
        return fetch('/api/script/obtenerDatosPlacas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }),
        }).then(function (r) { return r.json(); }).then(function (d) {
            var filas = Array.isArray(d) ? d : (d && d.data) || [];
            estado.placas = filas.filter(function (f) { return f && f[0]; }).map(function (f) {
                return { placa: String(f[0]).toUpperCase(), detalle: f[1] ? String(f[1]) : '' };
            }).sort(function (a, b) { return a.placa.localeCompare(b.placa); });
        }).catch(function () { estado.placas = []; });
    }

    function guardarMovimiento() {
        var lineas = estado.lineas
            .filter(function (l) { return l.articulo_id && decimalDe(l.cantidad) > 0; })
            .map(function (l) { return { articulo_id: Number(l.articulo_id), cantidad: decimalDe(l.cantidad) }; });
        if (estado.modo !== 'ingreso' && !el('almMovPlaca').value) { avisar('Elige la unidad.', 'warning'); return; }
        if (!lineas.length) { avisar('Elige al menos un artículo con cantidad.', 'warning'); return; }
        var cuerpo = {
            fecha: el('almMovFecha').value || hoy(),
            observaciones: el('almMovObs').value.trim(),
            usuario: usuario(),
            items: lineas,
        };
        var url, placa = el('almMovPlaca').value;
        if (estado.modo === 'ingreso') { url = BASE + '/ingreso'; cuerpo.referencia = el('almMovRef').value.trim(); }
        else if (estado.modo === 'asignar') { url = BASE + '/asignar'; cuerpo.placa = placa; }
        else { url = BASE + '/reingresar'; cuerpo.placa = placa; }
        enviar(url, 'POST', cuerpo).then(function (r) {
            avisar(r.mensaje || 'Movimiento registrado.', 'success');
            modal('modalAlmFlotaMov').hide();
            return cargarArticulos().then(function () { if (estado.vista === 'unidades') return cargarUnidades(); });
        }).catch(function (e) { avisar(e.message, 'danger'); });
    }

    // ── Arranque (se llama cada vez que se abre la pantalla) ────────────
    window.init_flota_almacen_flota = function () {
        if (!el('almFlota')) return;
        estado.vista = 'articulos';
        estado.articulos = [];
        estado.unidades = [];
        pintarAcciones();

        document.querySelectorAll('#almFlotaTabs [data-vista]').forEach(function (b) {
            b.onclick = function () {
                estado.vista = b.getAttribute('data-vista');
                document.querySelectorAll('#almFlotaTabs [data-vista]').forEach(function (x) { x.classList.toggle('active', x === b); });
                if (estado.vista === 'unidades') cargarUnidades(); else pintar();
            };
        });
        el('almFlotaBuscar').oninput = function () { pintar(); };
        ['almHistDesde', 'almHistHasta', 'almHistTipo', 'almHistPlaca', 'almHistArticulo'].forEach(function (id) {
            if (el(id)) el(id).onchange = function () { if (estado.vista === 'historial') cargarHistorial(); };
        });
        el('btnAlmFlotaNuevo').onclick = function () { abrirFormularioArticulo(null); };
        el('btnAlmFlotaIngresar').onclick = function () { abrirMovimiento('ingreso', null, null); };
        el('btnAlmFlotaAsignar').onclick = function () { abrirMovimiento('asignar', null, null); };
        el('btnAlmMovAgregar').onclick = function () { estado.lineas.push({ articulo_id: '', cantidad: '' }); pintarLineas(); };
        el('btnAlmMovGuardar').onclick = guardarMovimiento;
        el('btnAlmArtGuardar').onclick = guardarArticulo;

        cargarArticulos();
    };
})();
