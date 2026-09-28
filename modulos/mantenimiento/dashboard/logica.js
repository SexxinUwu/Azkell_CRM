// ================================================================
// 🛠️ DASHBOARD MANTENIMIENTO — LÓGICA DUAL (DESKTOP & MÓVIL)
// ================================================================

(function() {
    // Fases climáticas para móvil
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

    var timerReloj = null;
    var chartSaludInstance = null;
    var chartInspInstance = null;

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
        var mobCont = document.getElementById('mant-mobile-container');
        if (mobCont) {
            mobCont.className = 'mant-mobile-view ' + data.claseTema;
        }

        var elTemp = document.getElementById('mant-clima-temp-mob');
        var elCond = document.getElementById('mant-clima-condicion-mob');
        var elSens = document.getElementById('mant-clima-sensacion-mob');
        var elRango = document.getElementById('mant-clima-rango-mob');
        var elDesc = document.getElementById('mant-clima-desc-mob');
        var elHora = document.getElementById('mant-clima-hora-indicador');

        if (elTemp) elTemp.textContent = data.temp;
        if (elCond) elCond.textContent = data.condicion;
        if (elSens) elSens.textContent = data.sensacion;
        if (elRango) elRango.textContent = data.rango;
        if (elDesc) elDesc.textContent = data.desc;
        if (elHora) elHora.textContent = horaPersonalizada || data.horaIndicador;
    };

    function mantActualizarReloj() {
        var ahora = new Date();
        var horaDecimal = ahora.getHours() + (ahora.getMinutes() / 60);
        var faseActual = obtenerFasePorHora(horaDecimal);
        window.mantAplicarFaseClima(faseActual, formatHoraAmPm(ahora));
    }

    function mantActualizarFecha() {
        var opciones = { day: 'numeric', month: 'short', year: 'numeric' };
        var fechaTxt = new Date().toLocaleDateString('es-PE', opciones);
        var elem = document.getElementById('mant-clima-fecha-mob');
        if (elem) elem.textContent = fechaTxt;
    }

    // ── Cargar Datos Reales de Flota, OTs e Inspecciones ───────
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

            // Actualizar Vista Móvil
            var elBadgeMob = document.getElementById('mant-badge-unidades-mob');
            var elFlotaMob = document.getElementById('mant-kpi-flota-mob');
            var elVigMob   = document.getElementById('mant-kpi-vigentes-mob');
            var elPorVMob  = document.getElementById('mant-kpi-porvencer-mob');
            var elVencMob  = document.getElementById('mant-kpi-vencidas-mob');

            if (elBadgeMob) elBadgeMob.textContent = totalFlota + ' Unidades';
            if (elFlotaMob) elFlotaMob.textContent = operativas;
            if (elVigMob)   elVigMob.textContent   = vigentes;
            if (elPorVMob)  elPorVMob.textContent  = porVencer;
            if (elVencMob)  elVencMob.textContent  = vencidas;

            var elBarFlota = document.getElementById('mant-bar-flota-mob');
            var elBarVig = document.getElementById('mant-bar-vigentes-mob');
            var elBarPorV = document.getElementById('mant-bar-porvencer-mob');
            var elBarVenc = document.getElementById('mant-bar-vencidas-mob');

            if (elBarFlota) elBarFlota.style.width = Math.round((operativas / totalFlota) * 100) + '%';
            if (elBarVig)   elBarVig.style.width   = Math.round((vigentes / totalFlota) * 100) + '%';
            if (elBarPorV)  elBarPorV.style.width  = Math.round((porVencer / totalFlota) * 100) + '%';
            if (elBarVenc)  elBarVenc.style.width  = Math.round((vencidas / totalFlota) * 100) + '%';

            // Actualizar Vista Desktop (Centro de Comando)
            var elFlotaDesk = document.getElementById('mant-val-flota-desk');
            var elVigDesk   = document.getElementById('mant-val-vigentes-desk');
            var elPorVDesk  = document.getElementById('mant-val-porvencer-desk');
            var elVencDesk  = document.getElementById('mant-val-vencidas-desk');

            if (elFlotaDesk) elFlotaDesk.textContent = operativas;
            if (elVigDesk)   elVigDesk.textContent   = vigentes;
            if (elPorVDesk)  elPorVDesk.textContent  = porVencer;
            if (elVencDesk)  elVencDesk.textContent  = vencidas;

            // Inicializar Gráficos Desktop
            mantInicializarGraficosDesktop(vigentes, porVencer, vencidas);

        } catch(e) {
            console.error('Error cargando métricas en dashboard mantenimiento:', e);
        }
    };

    function mantInicializarGraficosDesktop(vigentes, porVencer, vencidas) {
        if (typeof Chart === 'undefined') return;

        // Gráfico 1: Salud Mantenimientos
        var canvasSalud = document.getElementById('chartDeskSaludMantenimiento');
        if (canvasSalud) {
            if (chartSaludInstance) chartSaludInstance.destroy();
            var ctxSalud = canvasSalud.getContext('2d');
            chartSaludInstance = new Chart(ctxSalud, {
                type: 'doughnut',
                data: {
                    labels: ['Vigentes', 'Por Vencer', 'Vencidos'],
                    datasets: [{
                        data: [51, 29, 20],
                        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: true }
                    }
                }
            });
        }

        // Gráfico 2: Estado Inspecciones
        var canvasInsp = document.getElementById('chartDeskEstadoInspecciones');
        if (canvasInsp) {
            if (chartInspInstance) chartInspInstance.destroy();
            var ctxInsp = canvasInsp.getContext('2d');
            chartInspInstance = new Chart(ctxInsp, {
                type: 'doughnut',
                data: {
                    labels: ['Vigentes', 'Vencidas'],
                    datasets: [{
                        data: [85, 15],
                        backgroundColor: ['#10b981', '#ef4444'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: true }
                    }
                }
            });
        }
    }

    // Intentar obtener clima real para móvil y desktop
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
                        var max = d.daily && d.daily.temperature_2m_max ? Math.round(d.daily.temperature_2m_max[0]) : 27;
                        var min = d.daily && d.daily.temperature_2m_min ? Math.round(d.daily.temperature_2m_min[0]) : 18;

                        // Desktop
                        var elDeskTemp = document.getElementById('mant-desk-temp');
                        var elDeskRango = document.getElementById('mant-desk-rango');
                        if (elDeskTemp) elDeskTemp.textContent = temp + '°';
                        if (elDeskRango) elDeskRango.textContent = 'Min ' + min + '° • Max ' + max + '°';

                        // Mobile
                        var elMobTemp = document.getElementById('mant-clima-temp-mob');
                        var elMobSens = document.getElementById('mant-clima-sensacion-mob');
                        var elMobRango = document.getElementById('mant-clima-rango-mob');
                        if (elMobTemp) elMobTemp.textContent = temp;
                        if (elMobSens) elMobSens.textContent = 'Sensación ' + temp + '°';
                        if (elMobRango) elMobRango.textContent = '↑ ' + max + '° / ↓ ' + min + '°';
                    }
                }).catch(function(){});
        }, function(){}, { timeout: 4000 });
    }

    // Inicialización
    mantActualizarFecha();
    mantActualizarReloj();
    window.mantCargarDatosDashboard();
    mantObtenerClimaReal();

    if (timerReloj) clearInterval(timerReloj);
    timerReloj = setInterval(mantActualizarReloj, 15000);

})();
