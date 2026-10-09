const mysql = require('mysql2/promise');
require('dotenv').config();

async function testTvFeed() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    console.time('tvFeedQuery');

    // 1. OTs
    const [otsRaw] = await conn.query(`
        SELECT ticket_entrada, id_ot, placa, estado, fecha_ingreso, fecha_inicio_ot, creado_por, iniciado_por, detalles_json
        FROM ordenes_trabajo
        ORDER BY id_ot DESC
        LIMIT 60
    `);
    const ots = otsRaw.map(o => {
        let det = {};
        try { det = typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : (o.detalles_json || {}); } catch(e){}
        return {
            id_ot: o.id_ot || o.ticket_entrada,
            placa: o.placa || '',
            estado: o.estado || 'Abierto',
            fecha_ingreso: o.fecha_ingreso,
            tipo_ot: det.tipo_ot || det.tipo_mantenimiento || 'Correctivo',
            sub_tipo: det.sub_tipo || '',
            supervisor: det.supervisor || o.iniciado_por || o.creado_por || '',
            mecanico: det.mecanico || det.responsable || det.tecnico || '',
            motivo: det.motivo || det.descripcion_falla || '',
            rampa: det.rampa_origen || det.id_rampa || '',
            km: det.km || ''
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

    // 3. Fallas (No finalizadas)
    const [fallasRaw] = await conn.query(`
        SELECT id, folio, orden_viaje, fecha_reporte, placa_tracto, placa_remolque, km_inicial, km_final, conductor, procedencia, estado, fallas_tracto_json, fallas_remolque_json, fallas_libres_text
        FROM reportes_fallas
        WHERE estado NOT IN ('Finalizado', 'Cerrado', 'Completado', 'Atendido', 'Anulado') OR estado IS NULL
        ORDER BY id DESC
        LIMIT 60
    `);

    const fallas = fallasRaw.map(f => {
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
    const fallasKPIs = { total_activas: fallas.length, pendiente: 0, proceso: 0, total_historico: 0 };
    fallasKpiRows.forEach(r => {
        const est = (r.estado || '').toLowerCase();
        fallasKPIs.total_historico += r.c;
        if (est.includes('pend')) fallasKPIs.pendiente += r.c;
        else if (est.includes('proc')) fallasKPIs.proceso += r.c;
    });

    console.timeEnd('tvFeedQuery');

    console.log('OTs count:', ots.length, 'KPIs:', otKPIs);
    console.log('Backlog count:', backlogRaw.length, 'KPIs:', backlogKPIs);
    console.log('Fallas no finalizadas count:', fallas.length, 'KPIs:', fallasKPIs);
    console.log('Sample Falla:', fallas[0]);

    await conn.end();
}

testTvFeed().catch(console.error);
