// ═════════════════════════════════════════════════════════════════════
// MÓDULO: RRHH — TAREO & ASISTENCIA DIARIA — Lógica SPA
// ERP Azkell
// ═════════════════════════════════════════════════════════════════════

window._rrhhTareoData = null;

window.init_rrhh_asistencia = function() {
    var d = new Date();
    var selMes = document.getElementById('tareo-filtro-mes');
    var selAnio = document.getElementById('tareo-filtro-anio');
    if (selMes) selMes.value = String(d.getMonth() + 1);
    if (selAnio) selAnio.value = String(d.getFullYear());

    window.rrhhTareoCargarMatriz();
};

window.rrhhTareoCargarMatriz = async function() {
    var thead = document.getElementById('tabla-tareo-thead');
    var tbody = document.getElementById('tabla-tareo-tbody');
    if (!tbody || !thead) return;

    var anio = document.getElementById('tareo-filtro-anio')?.value || new Date().getFullYear();
    var mes = document.getElementById('tareo-filtro-mes')?.value || (new Date().getMonth() + 1);
    var rol = document.getElementById('tareo-filtro-rol')?.value || 'TODOS';

    try {
        tbody.innerHTML = `<tr><td colspan="35" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2 text-primary"></span> Consultando registros de asistencia...</td></tr>`;

        var res = await fetch(`/api/rrhh/tareo?anio=${anio}&mes=${mes}&rol=${rol}`);
        var json = await res.json();

        if (!json || !json.ok) {
            tbody.innerHTML = `<tr><td colspan="35" class="text-center py-5 text-danger">Error al cargar tareo.</td></tr>`;
            return;
        }

        window._rrhhTareoData = json;
        var personal = json.personal || [];
        var tareoMap = json.tareo || {};
        var totalDias = json.dias_mes || 30;

        // 1. Construir Cabecera con Días y Nombres de Día
        var diasSemana = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
        var thDias = '';
        for (var i = 1; i <= totalDias; i++) {
            var f = new Date(anio, mes - 1, i);
            var nomDia = diasSemana[f.getDay()];
            var esFinde = (f.getDay() === 0 || f.getDay() === 6);
            var bgHead = esFinde ? 'background:#f1f5f9; color:#94a3b8;' : '';

            thDias += `
                <th class="p-1 text-center" style="min-width:36px; max-width:38px; ${bgHead}">
                    <div style="font-size:0.65rem; font-weight:700;">${nomDia}</div>
                    <div style="font-size:0.8rem;">${i}</div>
                </th>
            `;
        }

        thead.innerHTML = `
            <tr>
                <th class="tareo-sticky-col ps-3 text-start py-2" style="min-width:240px;">COLABORADOR / ROL</th>
                ${thDias}
                <th class="text-center bg-light" style="min-width:45px;" title="Días Asistidos">ASIST</th>
                <th class="text-center bg-light" style="min-width:45px;" title="En Ruta (Viaje)">RUTA</th>
                <th class="text-center bg-light" style="min-width:45px;" title="Faltas">FALT</th>
                <th class="text-center bg-light" style="min-width:45px;" title="Tardanzas">TARD</th>
            </tr>
        `;

        // 2. Construir Filas por Colaborador
        if (!personal.length) {
            tbody.innerHTML = `<tr><td colspan="${totalDias + 5}" class="text-center py-5 text-muted">No hay personal registrado en este rol/área.</td></tr>`;
            return;
        }

        var cicloEstados = ['A', 'R', 'T', 'F', 'DM', 'V', 'D', 'FER'];

        tbody.innerHTML = personal.map(function(p) {
            var cAsist = 0, cRuta = 0, cFalta = 0, cTard = 0;
            var celdasDias = '';

            for (var dia = 1; dia <= totalDias; dia++) {
                var fechaKey = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                var reg = (tareoMap[p.id] && tareoMap[p.id][fechaKey]) ? tareoMap[p.id][fechaKey] : null;
                var st = reg ? reg.estado : '';

                if (st === 'A') cAsist++;
                else if (st === 'R') cRuta++;
                else if (st === 'F') cFalta++;
                else if (st === 'T') cTard++;

                var badgeClass = st ? `st-${st}` : 'st-EMPTY';
                var txt = st || '·';

                celdasDias += `
                    <td class="p-1 text-center" style="vertical-align:middle;">
                        <span class="tareo-cell ${badgeClass}" 
                              id="tcell-${p.id}-${dia}"
                              onclick="window.rrhhTareoRotarEstado(${p.id}, '${fechaKey}', ${dia})"
                              title="${fechaKey}: ${st || 'Sin marcar'} (Clic para cambiar)">
                            ${txt}
                        </span>
                    </td>
                `;
            }

            var rolMini = `<span class="badge bg-light text-secondary border py-0.5" style="font-size:0.65rem;">${p.categoria_rol}</span>`;

            return `
                <tr>
                    <td class="tareo-sticky-col ps-3 text-start py-2">
                        <div class="fw-bold text-dark text-truncate" style="max-width:230px;" title="${p.apellidos}, ${p.nombres}">${p.apellidos}, ${p.nombres}</div>
                        <div class="d-flex align-items-center gap-1.5 mt-0.5">
                            <span class="font-monospace text-muted small">${p.numero_documento}</span>
                            ${rolMini}
                        </div>
                    </td>
                    ${celdasDias}
                    <td class="text-center fw-bold text-success font-monospace">${cAsist}</td>
                    <td class="text-center fw-bold text-primary font-monospace">${cRuta}</td>
                    <td class="text-center fw-bold text-danger font-monospace">${cFalta}</td>
                    <td class="text-center fw-bold text-warning font-monospace">${cTard}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="35" class="text-center py-5 text-danger">Error: ${err.message}</td></tr>`;
    }
};

window.rrhhTareoRotarEstado = async function(personalId, fechaKey, dia) {
    var ciclo = ['A', 'R', 'T', 'F', 'DM', 'V', 'D', 'FER'];
    var cell = document.getElementById(`tcell-${personalId}-${dia}`);
    if (!cell) return;

    var actual = (cell.textContent || '').trim();
    var idx = ciclo.indexOf(actual);
    var siguiente = (idx === -1 || idx === ciclo.length - 1) ? ciclo[0] : ciclo[idx + 1];

    // Actualizar visualmente de inmediato
    cell.className = `tareo-cell st-${siguiente}`;
    cell.textContent = siguiente;

    try {
        await fetch('/api/rrhh/tareo/guardar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                personal_id: personalId,
                fecha: fechaKey,
                estado: siguiente,
                minutos_tardanza: (siguiente === 'T' ? 15 : 0)
            })
        });
    } catch(e) {
        console.warn('Error guardando tareo:', e);
    }
};

window.rrhhTareoAutocompletarHoy = async function() {
    if (!window._rrhhTareoData || !window._rrhhTareoData.personal) return;
    var personal = window._rrhhTareoData.personal;
    var hoyStr = new Date().toISOString().slice(0, 10);

    if (!confirm(`¿Desea marcar como ASISTIÓ (A) a todos los colaboradores para el día de hoy (${hoyStr})?`)) return;

    var items = personal.map(p => ({
        personal_id: p.id,
        fecha: hoyStr,
        estado: (p.categoria_rol === 'CONDUCTOR' ? 'R' : 'A'),
        minutos_tardanza: 0
    }));

    try {
        var res = await fetch('/api/rrhh/tareo/guardar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: items })
        });
        var json = await res.json();
        if (json && json.ok) {
            alert('¡Asistencia de hoy completada con éxito!');
            window.rrhhTareoCargarMatriz();
        }
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

window.rrhhTareoSincronizarViajes = async function() {
    var anio = document.getElementById('tareo-filtro-anio')?.value || new Date().getFullYear();
    var mes = document.getElementById('tareo-filtro-mes')?.value || (new Date().getMonth() + 1);
    var hoyStr = new Date().toISOString().slice(0, 10);

    try {
        var res = await fetch('/api/rrhh/tareo/sincronizar-viajes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha: hoyStr })
        });
        var json = await res.json();
        if (json && json.ok) {
            alert(json.message || 'Sincronización completada');
            window.rrhhTareoCargarMatriz();
        }
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

window.rrhhTareoAbrirModalLicencia = async function() {
    var sel = document.getElementById('lic-personal-id');
    if (sel && window._rrhhTareoData && window._rrhhTareoData.personal) {
        sel.innerHTML = window._rrhhTareoData.personal.map(p => `
            <option value="${p.id}">${p.apellidos}, ${p.nombres} (${p.categoria_rol})</option>
        `).join('');
    }

    var fIni = document.getElementById('lic-fecha-ini');
    var fFin = document.getElementById('lic-fecha-fin');
    if (fIni) fIni.value = new Date().toISOString().slice(0, 10);
    if (fFin) fFin.value = new Date().toISOString().slice(0, 10);

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalLicenciaForm'));
    modal.show();
};

window.rrhhTareoGuardarLicencia = async function(e) {
    if (e) e.preventDefault();

    var btn = document.getElementById('lic-btn-guardar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...'; }

    var payload = {
        personal_id: document.getElementById('lic-personal-id')?.value,
        tipo: document.getElementById('lic-tipo')?.value,
        fecha_inicio: document.getElementById('lic-fecha-ini')?.value,
        fecha_fin: document.getElementById('lic-fecha-fin')?.value,
        motivo: document.getElementById('lic-motivo')?.value
    };

    try {
        var res = await fetch('/api/rrhh/licencias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var json = await res.json();
        if (json && json.ok) {
            alert('¡Licencia / Vacaciones registrada con éxito y aplicada al tareo!');
            var modal = bootstrap.Modal.getInstance(document.getElementById('modalLicenciaForm'));
            if (modal) modal.hide();
            window.rrhhTareoCargarMatriz();
        } else {
            alert(json.error || 'No se pudo registrar');
        }
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Guardar y Aplicar a Tareo'; }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.init_rrhh_asistencia);
} else {
    window.init_rrhh_asistencia();
}
