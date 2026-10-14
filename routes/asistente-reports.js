// Datos de los reportes del asistente. Los permisos se verifican aquí; los datos van
// directo al navegador, que arma el archivo. Gemini nunca ve datos de la empresa.

const REPORTS = {
  placas: { label: 'Vehículos de la flota', perm: 'placas.ver', range: false },
  inspecciones: { label: 'Inspecciones técnicas', perm: 'insp.ver', range: true },
  conductores: { label: 'Directorio de conductores', perm: 'cond.ver', range: false },
  fleetrun: { label: 'Datos de mantenimiento Fleetrun', perm: 'fleet.ver', range: true },
};

function tienePermiso(user, clave) {
  if (!user) return false;
  if ((user.correo || '').toLowerCase() === 'admin@azkell.com') return true;
  const rol = (user.rol || '').toLowerCase();
  if (rol.includes('admin') || rol === 'fundador' || rol === 'gerente general') return true;
  try {
    const p = typeof user.permisos === 'string' ? JSON.parse(user.permisos || '{}') : (user.permisos || {});
    if (p.admin === true) return true;
    const [modulo, accion] = clave.split('.');
    const v = p[modulo];
    if (!v || typeof v !== 'object') return false;
    const map = { ver: 'l', crear: 'c', editar: 'e', eliminar: 'd' };
    return !!(v[map[accion]]);
  } catch { return false; }
}

function availableReports(user) {
  return Object.entries(REPORTS)
    .filter(([, r]) => tienePermiso(user, r.perm))
    .map(([k]) => k);
}

const key = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
function limaToday() {
  const [y, m, d] = key(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function resolveRange(desde, hasta) {
  const today = limaToday();
  const fromKey = desde || new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 12)).toISOString().slice(0, 10);
  const toKey = hasta || today.toISOString().slice(0, 10);
  const from = new Date(fromKey);
  const to = new Date(toKey);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new Error('Las fechas del reporte no son válidas.');
  const diff = (to - from) / 86_400_000;
  if (diff < 0) throw new Error('La fecha inicial no puede ser posterior a la final.');
  if (diff > 366) throw new Error('El rango máximo es de 366 días.');
  return { fromKey, toKey };
}

function todayForPrompt() {
  const d = new Date();
  const today = d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });
  const weekday = d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'long' });
  return { today, weekday };
}

const db_query = (db, sql, params) => new Promise((resolve, reject) => {
  const conn = db.promise ? db : db;
  if (conn.promise) {
    conn.promise().query(sql, params).then(([rows]) => resolve(rows)).catch(reject);
  } else {
    conn.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  }
});

async function buildReport(db, user, tipo, query) {
  if (!REPORTS[tipo]) throw { status: 400, message: 'Tipo de reporte no válido.' };
  if (!tienePermiso(user, REPORTS[tipo].perm)) throw { status: 403, message: 'Sin permiso para este reporte.' };

  const targetDb = db;
  const subtitle = todayForPrompt().today;

  if (tipo === 'placas') {
    const rows = await db_query(targetDb,
      'SELECT placa, cliente, marca, modelo_uts, tipo, sub_tipo, color, anio, estado FROM placas ORDER BY placa LIMIT 3000',
      []
    );
    return {
      title: REPORTS.placas.label,
      subtitle: `Generado el ${subtitle}`,
      columns: [
        { key: 'placa', label: 'Placa' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'marca', label: 'Marca' },
        { key: 'modelo_uts', label: 'Modelo' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'sub_tipo', label: 'Sub tipo' },
        { key: 'color', label: 'Color' },
        { key: 'anio', label: 'Año', type: 'number' },
        { key: 'estado', label: 'Estado' },
      ],
      rows: rows.map(r => ({
        placa: r.placa ?? '',
        cliente: r.cliente ?? '',
        marca: r.marca ?? '',
        modelo_uts: r.modelo_uts ?? '',
        tipo: r.tipo ?? '',
        sub_tipo: r.sub_tipo ?? '',
        color: r.color ?? '',
        anio: r.anio ? Number(r.anio) : null,
        estado: r.estado ?? '',
      })),
      truncated: rows.length >= 3000,
    };
  }

  if (tipo === 'conductores') {
    const rows = await db_query(targetDb,
      'SELECT nombre, dni, licencia, telefono, estado FROM conductores ORDER BY nombre LIMIT 2000',
      []
    );
    return {
      title: REPORTS.conductores.label,
      subtitle: `Generado el ${subtitle}`,
      columns: [
        { key: 'nombre', label: 'Nombre' },
        { key: 'dni', label: 'DNI' },
        { key: 'licencia', label: 'Licencia' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'estado', label: 'Estado' },
      ],
      rows: rows.map(r => ({
        nombre: r.nombre ?? '',
        dni: r.dni ?? '',
        licencia: r.licencia ?? '',
        telefono: r.telefono ?? '',
        estado: r.estado ?? '',
      })),
      truncated: rows.length >= 2000,
    };
  }

  if (tipo === 'inspecciones') {
    const { fromKey, toKey } = resolveRange(query.desde, query.hasta);
    const rows = await db_query(targetDb,
      'SELECT id, placa, fecha_ingreso, tipo_inspeccion, dias_propuestos, km_tablero FROM inspecciones WHERE fecha_ingreso BETWEEN ? AND ? ORDER BY fecha_ingreso DESC LIMIT 3000',
      [fromKey, toKey]
    );
    const fmt = (f) => f instanceof Date ? f.toISOString().slice(0, 10) : (String(f || '').split('T')[0] || '');
    // La tabla no guarda estado: se calcula igual que en Inspecciones (fecha de ingreso + días propuestos, 30 por defecto)
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const estadoDe = (f, dias) => {
      const base = f instanceof Date ? new Date(f) : new Date(String(f || '').split('T')[0] + 'T00:00:00');
      if (Number.isNaN(base.getTime())) return '';
      base.setDate(base.getDate() + (Number(dias) || 30));
      return base >= hoy ? 'Vigente' : 'Vencida';
    };
    return {
      title: REPORTS.inspecciones.label,
      subtitle: `Del ${fromKey} al ${toKey} · Generado el ${subtitle}`,
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'placa', label: 'Placa' },
        { key: 'fecha_ingreso', label: 'Fecha' },
        { key: 'tipo_inspeccion', label: 'Tipo' },
        { key: 'estado', label: 'Estado' },
        { key: 'km_tablero', label: 'Km tablero', type: 'number' },
      ],
      rows: rows.map(r => ({
        id: r.id ?? '',
        placa: r.placa ?? '',
        fecha_ingreso: fmt(r.fecha_ingreso),
        tipo_inspeccion: r.tipo_inspeccion ?? '',
        estado: estadoDe(r.fecha_ingreso, r.dias_propuestos),
        km_tablero: r.km_tablero != null ? Number(r.km_tablero) : null,
      })),
      truncated: rows.length >= 3000,
    };
  }

  if (tipo === 'fleetrun') {
    const { fromKey, toKey } = resolveRange(query.desde, query.hasta);
    const rows = await db_query(targetDb,
      'SELECT idRegistro, placa, fecha, km_actual, tipo_mp FROM fleetrun WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC LIMIT 3000',
      [fromKey, toKey]
    );
    const fmt = (f) => f instanceof Date ? f.toISOString().slice(0, 10) : (String(f || '').split('T')[0] || '');
    return {
      title: REPORTS.fleetrun.label,
      subtitle: `Del ${fromKey} al ${toKey} · Generado el ${subtitle}`,
      columns: [
        { key: 'idRegistro', label: 'Registro' },
        { key: 'placa', label: 'Placa' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'km_actual', label: 'Km actual', type: 'number' },
        { key: 'tipo_mp', label: 'Tipo mantenimiento' },
      ],
      rows: rows.map(r => ({
        idRegistro: r.idRegistro ?? '',
        placa: r.placa ?? '',
        fecha: fmt(r.fecha),
        km_actual: r.km_actual != null ? Number(r.km_actual) : null,
        tipo_mp: r.tipo_mp ?? '',
      })),
      truncated: rows.length >= 3000,
    };
  }

  throw { status: 400, message: 'Tipo de reporte no reconocido.' };
}

module.exports = { REPORTS, availableReports, buildReport, resolveRange, todayForPrompt };
