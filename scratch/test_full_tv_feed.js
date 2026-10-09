const mysql = require('mysql2/promise');
require('dotenv').config();

let _tvWialonCache = null;
let _tvWialonCacheTime = 0;
const WIALON_CACHE_TTL = 4000;

async function getTvFeed(targetDbName = 'azkell_tenant_marsisa') {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: targetDbName,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    const startTime = Date.now();

    // 1. OTs
    const [otsRaw] = await conn.query(`
        SELECT ticket_entrada, id_ot, placa, estado, fecha_ingreso, fecha_inicio_ot, creado_por, iniciado_por, detalles_json
        FROM ordenes_trabajo
        ORDER BY id_ot DESC
        LIMIT 60
    `);
    const otsList = otsRaw.map(o => {
        let det = {};
        try { det = typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : (o.detalles_json || {}); } catch(e){}
        return {
            id_ot: o.id_ot || o.ticket_entrada,
            placa: o.placa || '',
            estado: o.estado || 'Abierto',
            fecha_ingreso: o.fecha_ingreso,
            tipo_ot: det.tipo_ot || det.tipo_mantenimiento || 'Correctivo',
            sub_tipo: det.sub_tipo || '',
            supervisor: det.supervisor || o.iniciado_por || o.creado_por || 'Taller Central',
            mecanico: det.mecanico || det.responsable || det.tecnico || 'Asignado',
            motivo: det.motivo || det.descripcion_falla || 'Mantenimiento Preventivo / Correctivo',
            rampa: det.rampa_origen || det.id_rampa || '-',
            km: det.km ? `${Number(det.km).toLocaleString('es-PE')} km` : '-'
        };
    });

    const [otKpiRows] = await conn.query(`SELECT estado, count(*) as c FROM ordenes_trabajo GROUP BY estado`);
    const otKPIs = { total: 0, abierto: 0, proceso: 0, finalizado: 0, anulado: 0 };
    otKpiRows.forEach(r => {
        const est = (r.estado || '').toLowerCase();
        otKPIs.total += r.c;
        if (est.includes('proceso')) otKPIs.proceso += r.c;
        else if (est.includes('abierto') || est.includes('pendiente')) otKPIs.abierto += r.c;
        else if (est.includes('finaliz') || est.includes('cerrad')) otKPIs.finalizado += r.c;
        else if (est.includes('anul')) otKPIs.anulado += r.c;
    });

    // 2. Backlog
    const [backlogRaw] = await conn.query(`
        SELECT id, backlog_id, placa, km, tema, tarea, reportado_por, fecha_reporte, estado, creado_por, creado_en, ticket_ot
        FROM ot_backlog
        ORDER BY id DESC
        LIMIT 60
    `);
    const [blKpiRows] = await conn.query(`SELECT estado, count(*) as c FROM ot_backlog GROUP BY estado`);
    const backlogKPIs = { total: 0, pendiente: 0, proceso: 0, realizado: 0 };
    blKpiRows.forEach(r => {
        const est = (r.estado || '').toLowerCase();
        backlogKPIs.total += r.c;
        if (est.includes('pend')) backlogKPIs.pendiente += r.c;
        else if (est.includes('proc')) backlogKPIs.proceso += r.c;
        else if (est.includes('realiz') || est.includes('listo')) backlogKPIs.realizado += r.c;
    });

    const backlogList = backlogRaw.map(b => ({
        id: b.id,
        backlog_id: b.backlog_id || `BK-${b.id}`,
        placa: b.placa || 'S/P',
        km: b.km ? `${Number(b.km).toLocaleString('es-PE')} km` : '-',
        tema: b.tema || 'Mantenimiento',
        tarea: b.tarea || 'Revisión técnica pendiente',
        reportado_por: b.reportado_por || b.creado_por || 'Operaciones',
        fecha_reporte: b.fecha_reporte || b.creado_en,
        estado: b.estado || 'Pendiente',
        ticket_ot: b.ticket_ot || '-'
    }));

    // 3. Fallas (No finalizadas)
    const [fallasRaw] = await conn.query(`
        SELECT id, folio, orden_viaje, fecha_reporte, placa_tracto, placa_remolque, km_inicial, km_final, conductor, procedencia, estado, fallas_tracto_json, fallas_remolque_json, fallas_libres_text
        FROM reportes_fallas
        WHERE estado NOT IN ('Finalizado', 'Cerrado', 'Completado', 'Atendido', 'Anulado') OR estado IS NULL
        ORDER BY id DESC
        LIMIT 60
    `);

    const fallasList = fallasRaw.map(f => {
        let tractoList = [];
        let remolqueList = [];
        try { tractoList = typeof f.fallas_tracto_json === 'string' ? JSON.parse(f.fallas_tracto_json) : (f.fallas_tracto_json || []); } catch(e){}
        try { remolqueList = typeof f.fallas_remolque_json === 'string' ? JSON.parse(f.fallas_remolque_json) : (f.fallas_remolque_json || []); } catch(e){}
        if (!Array.isArray(tractoList)) tractoList = [];
        if (!Array.isArray(remolqueList)) remolqueList = [];

        const itemsFallas = [
            ...tractoList.map(t => (t.obs || t.observacion || t.item || '')),
            ...remolqueList.map(r => (r.obs || r.observacion || r.item || ''))
        ].filter(Boolean);

        if (itemsFallas.length === 0 && f.fallas_libres_text) {
            itemsFallas.push(f.fallas_libres_text);
        }

        return {
            id: f.id,
            folio: f.folio || `F-${f.id}`,
            fecha: f.fecha_reporte,
            placa: [f.placa_tracto, f.placa_remolque].filter(Boolean).join(' / ') || 'S/P',
            conductor: f.conductor || 'No asignado',
            procedencia: f.procedencia || 'En ruta / Taller',
            estado: f.estado || 'Pendiente',
            descripcion: itemsFallas.slice(0, 3).join(' • ') || 'Sin descripción detallada',
            total_items: itemsFallas.length || 1
        };
    });

    const [fallasKpiRows] = await conn.query(`SELECT estado, count(*) as c FROM reportes_fallas GROUP BY estado`);
    const fallasKPIs = { total_activas: fallasList.length, pendiente: 0, proceso: 0, total_historico: 0 };
    fallasKpiRows.forEach(r => {
        const est = (r.estado || '').toLowerCase();
        fallasKPIs.total_historico += r.c;
        if (est.includes('pend')) fallasKPIs.pendiente += r.c;
        else if (est.includes('proc')) fallasKPIs.proceso += r.c;
    });

    // 4. GPS Wialon
    let wialonResult = { data: [], grupos: [] };
    const now = Date.now();
    if (_tvWialonCache && (now - _tvWialonCacheTime < WIALON_CACHE_TTL)) {
        wialonResult = _tvWialonCache;
    } else {
        try {
            const [tokenRows] = await conn.query("SELECT valor FROM integraciones_api WHERE clave = 'wialon_token' LIMIT 1");
            const token = (tokenRows && tokenRows[0] && tokenRows[0].valor) ? tokenRows[0].valor.trim() : process.env.WIALON_TOKEN;
            const [urlRows] = await conn.query("SELECT valor FROM integraciones_api WHERE clave = 'wialon_url' LIMIT 1");
            const baseUrl = (urlRows && urlRows[0] && urlRows[0].valor) ? urlRows[0].valor.trim() : 'https://hst-api.wialon.us/wialon/ajax.html';

            if (token) {
                const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({token}))}`);
                const loginData = await loginRes.json();
                if (loginData && loginData.eid) {
                    const sid = loginData.eid;
                    const searchParams = { "spec": { "itemsType": "avl_unit", "propName": "sys_name", "propValueMask": "*", "sortType": "sys_name" }, "force": 1, "flags": 9221, "from": 0, "to": 0 };
                    const groupParams = { "spec": { "itemsType": "avl_unit_group", "propName": "sys_name", "propValueMask": "*", "sortType": "sys_name" }, "force": 1, "flags": 1, "from": 0, "to": 0 };

                    const [searchRes, groupRes] = await Promise.all([
                        fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(searchParams))}&sid=${sid}`),
                        fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(groupParams))}&sid=${sid}`)
                    ]);
                    const searchData = await searchRes.json();
                    const groupData = await groupRes.json();

                    let grupos = [];
                    if (groupData && Array.isArray(groupData.items)) {
                        grupos = groupData.items.map(g => ({
                            id: g.id,
                            nombre: g.nm,
                            unitIds: Array.isArray(g.u) ? g.u : (Array.isArray(g.units) ? g.units : [])
                        }));
                    }

                    // Placas mapping
                    const [pRows] = await conn.query("SELECT placa, cliente, tipo, marca, modelo_uts FROM placas");
                    let placasMap = {};
                    (pRows || []).forEach(p => {
                        const cp = String(p.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
                        if (cp) placasMap[cp] = p;
                    });

                    let vehiculos = [];
                    if (searchData && Array.isArray(searchData.items)) {
                        searchData.items.forEach(item => {
                            const rawName = item.nm ? item.nm.toUpperCase().trim() : "";
                            let placaLimpia = rawName.replace(/[^A-Z0-9]/g, '');
                            const matchPlaca = placaLimpia.match(/[A-Z0-9]{6}/);
                            if (matchPlaca) placaLimpia = matchPlaca[0];

                            const lat = item.pos ? Number(item.pos.y) : 0;
                            const lng = item.pos ? Number(item.pos.x) : 0;
                            const speed = item.pos && item.pos.s != null ? Number(item.pos.s) : 0;
                            const course = item.pos && item.pos.c != null ? Number(item.pos.c) : 0;
                            const alt = item.pos && item.pos.z != null ? Number(item.pos.z) : 0;
                            const sats = item.pos && item.pos.sc != null ? Number(item.pos.sc) : 0;
                            const timePos = item.pos && item.pos.t != null ? Number(item.pos.t) : null;

                            const prms = (item.lmsg && item.lmsg.p) ? item.lmsg.p : {};
                            const pwrExt = prms.pwr_ext != null ? Number(prms.pwr_ext) : (prms.power != null ? Number(prms.power) / 1000 : null);
                            const hasIgnParam = (prms.io_1 === 1 || prms.io_239 === 1 || prms.acc === 1 || prms.ign === 1 || (pwrExt && pwrExt > 24) || (prms.can_rpm && prms.can_rpm > 400));
                            const isIgnitionOn = (speed > 3) || Boolean(hasIgnParam);

                            let estadoMotor = 'offline';
                            if (lat && lng) {
                                if (speed > 3) estadoMotor = 'en_marcha';
                                else if (isIgnitionOn) estadoMotor = 'ralenti';
                                else estadoMotor = 'detenido';
                            }

                            const pInfo = placasMap[placaLimpia] || {};
                            const itemGroups = grupos.filter(g => g.unitIds.includes(item.id)).map(g => g.nombre);

                            vehiculos.push({
                                id: item.id,
                                nombre_wialon: rawName,
                                placa: placaLimpia,
                                km: item.cnm_km ? Math.round(item.cnm_km) : 0,
                                horas: item.cneh ? Math.round(item.cneh) : 0,
                                lat,
                                lng,
                                velocidad: speed,
                                curso: course,
                                altitud: alt,
                                satelites: sats,
                                tiempo_pos: timePos,
                                ignicion: isIgnitionOn ? 1 : 0,
                                estado_motor: estadoMotor,
                                voltaje: pwrExt ? pwrExt.toFixed(1) : null,
                                empresa: pInfo.cliente || (rawName.includes('TRAHESA') ? 'TRAHESA S.A.C.' : 'MARSISA S.A.C.'),
                                tipo_vehiculo: pInfo.tipo || (rawName.includes('CARRETA') ? 'Carreta' : 'Tracto'),
                                marca_modelo: [pInfo.marca, pInfo.modelo_uts].filter(Boolean).join(' ') || '',
                                grupos: itemGroups
                            });
                        });
                    }

                    wialonResult = { data: vehiculos, grupos };
                    _tvWialonCache = wialonResult;
                    _tvWialonCacheTime = Date.now();
                }
            }
        } catch(eWialon) {
            console.warn('Error fetching Wialon:', eWialon.message);
        }
    }

    // GPS KPI calculation
    const gpsData = wialonResult.data || [];
    const gpsKPIs = {
        total: gpsData.length,
        con_senal: gpsData.filter(u => u.lat && u.lng).length,
        en_movimiento: gpsData.filter(u => (u.velocidad || 0) > 3).length,
        sin_senal: gpsData.filter(u => !u.lat || !u.lng || u.estado_motor === 'offline').length
    };

    await conn.end();

    return {
        ok: true,
        durationMs: Date.now() - startTime,
        empresa: 'Marsisa SAC',
        gps: {
            kpis: gpsKPIs,
            unidades: gpsData,
            grupos: wialonResult.grupos || []
        },
        ots: {
            kpis: otKPIs,
            list: otsList
        },
        backlog: {
            kpis: backlogKPIs,
            list: backlogList
        },
        fallas: {
            kpis: fallasKPIs,
            list: fallasList
        }
    };
}

getTvFeed().then(res => {
    console.log('--- TV FEED RESULT ---');
    console.log('Duration:', res.durationMs, 'ms');
    console.log('GPS KPIs:', res.gps.kpis);
    console.log('OT KPIs:', res.ots.kpis, 'List count:', res.ots.list.length);
    console.log('Backlog KPIs:', res.backlog.kpis, 'List count:', res.backlog.list.length);
    console.log('Fallas KPIs:', res.fallas.kpis, 'List count:', res.fallas.list.length);
}).catch(console.error);
