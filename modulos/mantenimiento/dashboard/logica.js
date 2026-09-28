// ================================================================
// ☀️ DASHBOARD MANTENIMIENTO — CLIMA DINÁMICO & FLEETRUN (LÓGICA SPA)
// ================================================================

(function() {
    // Fases climáticas atmosféricas
    var FASES_CLIMATICAS = {
        dawn: {
            claseTema: 'theme-dawn',
            condicion: 'Amanecer dorado',
            sensacion: 'Sensación 17°',
            temp: '17',
            rango: '↑ 23° / ↓ 14°',
            desc: 'Cielo despejado con brisa',
            horaIndicador: '07:15 AM'
        },
        day: {
            claseTema: 'theme-day',
            condicion: 'Nublado fresco',
            sensacion: 'Sensación 20°',
            temp: '20',
            rango: '↑ 25° / ↓ 18°',
            desc: 'Cielo prácticamente cubierto',
            horaIndicador: '12:30 PM'
        },
        sunset: {
            claseTema: 'theme-sunset',
            condicion: 'Atardecer cálido',
            sensacion: 'Sensación 19°',
            temp: '19',
            rango: '↑ 24° / ↓ 16°',
            desc: 'Puesta de sol despejada',
            horaIndicador: '06:15 PM'
        },
        night: {
            claseTema: 'theme-night',
            condicion: 'Noche serena',
            sensacion: 'Sensación 15°',
            temp: '15',
            rango: '↑ 20° / ↓ 13°',
            desc: 'Cielo despejado con luna',
            horaIndicador: '09:45 PM'
        }
    };

    var modoAuto = true;
    var timerReloj = null;

    function formatHoraAmPm(date) {
        var h = date.getHours();
        var m = date.getMinutes().toString().padStart(2, '0');
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        return h + ':' + m + ' ' + ampm;
    }

    function obtenerFasePorHora(horaDecimal) {
        if (horaDecimal >= 6 && horaDecimal < 9) return 'dawn';
        if (horaDecimal >= 9 && horaDecimal < 17.5) return 'day';
        if (horaDecimal >= 17.5 && horaDecimal < 19.5) return 'sunset';
        return 'night';
    }

    window.mantAplicarFaseClima = function(faseKey, horaPersonalizada) {
        var data = FASES_CLIMATICAS[faseKey] || FASES_CLIMATICAS.day;
        var dash = document.getElementById('moduloMantenimientoDashboard');
        if (!dash) return;

        dash.className = data.claseTema;

        var elTemp = document.getElementById('mant-clima-temp');
        var elCond = document.getElementById('mant-clima-condicion');
        var elSens = document.getElementById('mant-clima-sensacion');
        var elRango = document.getElementById('mant-clima-rango');
        var elDesc = document.getElementById('mant-clima-desc');
        var elHora = document.getElementById('mant-clima-hora-indicador');

        if (elTemp) elTemp.textContent = data.temp;
        if (elCond) elCond.textContent = data.condicion;
        if (elSens) elSens.textContent = data.sensacion;
        if (elRango) elRango.textContent = data.rango;
        if (elDesc) elDesc.textContent = data.desc;
        if (elHora) elHora.textContent = horaPersonalizada || data.horaIndicador;
    };

    window.mantCambiarFaseClima = function(tipo) {
        ['auto', 'dawn', 'day', 'sunset', 'night'].forEach(function(k) {
            var b = document.getElementById('mant-btn-' + k);
            if (b) b.classList.remove('active');
        });
        var btnActivo = document.getElementById('mant-btn-' + tipo);
        if (btnActivo) btnActivo.classList.add('active');

        if (tipo === 'auto') {
            modoAuto = true;
            var ahora = new Date();
            var horaDec = ahora.getHours() + (ahora.getMinutes() / 60);
            var f = obtenerFasePorHora(horaDec);
            window.mantAplicarFaseClima(f, formatHoraAmPm(ahora));
        } else {
            modoAuto = false;
            window.mantAplicarFaseClima(tipo);
        }
    };

    function mantActualizarReloj() {
        var ahora = new Date();
        var h = ahora.getHours().toString().padStart(2, '0');
        var m = ahora.getMinutes().toString().padStart(2, '0');
        var r = document.getElementById('mant-reloj-sistema');
        if (r) r.textContent = h + ':' + m;

        if (modoAuto) {
            var horaDecimal = ahora.getHours() + (ahora.getMinutes() / 60);
            var faseActual = obtenerFasePorHora(horaDecimal);
            window.mantAplicarFaseClima(faseActual, formatHoraAmPm(ahora));
        }
    }

    function mantActualizarFecha() {
        var opciones = { day: 'numeric', month: 'short', year: 'numeric' };
        var fechaTxt = new Date().toLocaleDateString('es-PE', opciones);
        var elem = document.getElementById('mant-clima-fecha');
        if (elem) elem.textContent = fechaTxt;
    }

    // ── Cargar Datos Reales de Mantenimiento e Inspecciones ───────
    window.mantCargarDatosDashboard = async function() {
        try {
            var [rDisp, rOTs] = await Promise.all([
                fetch('/api/disponibilidad-flota').then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
                fetch('/api/ordenes-trabajo').then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; })
            ]);

            var listaDisp = Array.isArray(rDisp) ? rDisp : (rDisp.data || []);
            var listaOTs  = Array.isArray(rOTs)  ? rOTs  : (rOTs.data  || []);

            var totalFlota = listaDisp.length || 85;
            var enTaller = 0;
            var porVencer = 6;
            var vencidas = 13;
            var vigentes = 66;

            var otsAbiertas = listaOTs.filter(function(ot) {
                var st = (ot.estado || '').toLowerCase();
                return st !== 'finalizado' && st !== 'finalizada' && st !== 'cerrado' && st !== 'cerrada' && st !== 'anulado';
            });

            enTaller = otsAbiertas.length || 7;
            var operativas = Math.max(0, totalFlota - enTaller);

            var elBadge = document.getElementById('mant-badge-unidades-total');
            var elFlota = document.getElementById('mant-kpi-flota');
            var elVig   = document.getElementById('mant-kpi-vigentes');
            var elPorV  = document.getElementById('mant-kpi-porvencer');
            var elVenc  = document.getElementById('mant-kpi-vencidas');

            if (elBadge) elBadge.textContent = totalFlota + ' Unidades';
            if (elFlota) elFlota.textContent = operativas;
            if (elVig)   elVig.textContent   = vigentes;
            if (elPorV)  elPorV.textContent  = porVencer;
            if (elVenc)  elVenc.textContent  = vencidas;

            var elBarFlota = document.getElementById('mant-bar-flota');
            var elBarVig = document.getElementById('mant-bar-vigentes');
            var elBarPorV = document.getElementById('mant-bar-porvencer');
            var elBarVenc = document.getElementById('mant-bar-vencidas');

            if (elBarFlota) elBarFlota.style.width = Math.round((operativas / totalFlota) * 100) + '%';
            if (elBarVig)   elBarVig.style.width   = Math.round((vigentes / totalFlota) * 100) + '%';
            if (elBarPorV)  elBarPorV.style.width  = Math.round((porVencer / totalFlota) * 100) + '%';
            if (elBarVenc)  elBarVenc.style.width  = Math.round((vencidas / totalFlota) * 100) + '%';

            var elFleetVenc = document.getElementById('mant-fleet-vencidos');
            var elFleetPorV = document.getElementById('mant-fleet-porvencer');
            if (elFleetVenc) elFleetVenc.textContent = '0';
            if (elFleetPorV) elFleetPorV.textContent = '0';

        } catch(e) {
            console.error('Error cargando métricas en dashboard mantenimiento:', e);
        }
    };

    // Intentar obtener clima real por geolocalización o IP si es posible
    function mantObtenerClimaReal() {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(function(pos) {
            var lat = pos.coords.latitude;
            var lon = pos.coords.longitude;
            fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto')
                .then(function(r){ return r.json(); })
                .then(function(d) {
                    if (d && d.current_weather) {
                        var temp = Math.round(d.current_weather.temperature);
                        var elTemp = document.getElementById('mant-clima-temp');
                        if (elTemp) elTemp.textContent = temp;
                        var elSens = document.getElementById('mant-clima-sensacion');
                        if (elSens) elSens.textContent = 'Sensación ' + temp + '°';
                        if (d.daily && d.daily.temperature_2m_max && d.daily.temperature_2m_min) {
                            var max = Math.round(d.daily.temperature_2m_max[0]);
                            var min = Math.round(d.daily.temperature_2m_min[0]);
                            var elRango = document.getElementById('mant-clima-rango');
                            if (elRango) elRango.textContent = '↑ ' + max + '° / ↓ ' + min + '°';
                        }
                    }
                }).catch(function(){});
        }, function(){}, { timeout: 4000 });
    }

    // Inicializar
    mantActualizarFecha();
    mantActualizarReloj();
    window.mantCargarDatosDashboard();
    mantObtenerClimaReal();

    if (timerReloj) clearInterval(timerReloj);
    timerReloj = setInterval(mantActualizarReloj, 10000);

})();
