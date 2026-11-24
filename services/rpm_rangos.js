'use strict';
// Rangos de RPM por modelo de motor (hoja MOTOR del cuadro de conducción de Operaciones Marsisa).
// Cada fila: [fin de ralentí, fin de bajo torque, fin de zona verde (económico), fin de potencia]; por encima del último es sobrerrevolución.
//   ralentí 0–a · bajo torque a–b · zona verde b–c · potencia c–d · sobrerrevolución > d
// Colores del cuadro: bajo torque = sobreconsumo, zona verde = consumo óptimo, potencia = sobreconsumo, sobrerrevolución = daño de motor.
const POR_MODELO = {
    'D13C460': [1000, 1150, 1400, 1900],
    'D8C350': [900, 1200, 1600, 2200],
    'DC13450': [650, 1000, 1300, 1900],
    'DC13500': [700, 1000, 1300, 1800],
    'DC13460': [700, 1000, 1300, 1800],
    'DC13410': [700, 1000, 1400, 1900],
    'SUPER13460': [700, 1000, 1300, 1800],
    '6HK1': [800, 1050, 1500, 2400],
    'ISM': [1000, 1200, 1500, 1900],
    'DT530': [800, 1200, 1500, 2000],
    'MT13.46': [550, 1050, 1400, 1900],
    'WP12.430E201': [800, 1100, 1500, 1900],
    'MC11.44': [750, 1000, 1400, 1900],
    'MC13.54': [700, 1000, 1400, 1900],
    'MC07.28': [600, 1200, 1800, 2300],
    'ISDE-180': [800, 1200, 1700, 2500],
    'MX13': [850, 1050, 1500, 1900],
    'J05E-TY': [800, 1100, 1600, 2500],
    'J08E-WB': [800, 1100, 1600, 2500],
    'MBE4000': [700, 1100, 1400, 1900],
    'MB-OM926': [800, 1200, 1600, 2200],
};

// Sin modelo cargado en la ficha de la placa se usan los rangos del cuadro original (BSS899)
const GENERICO = [800, 1150, 1400, 1900];

// Meta de reparto del tiempo útil (bajo torque / zona verde / potencia), en %
const META = { bajo: 20, verde: 60, potencia: 20, sobre: 0 };

const clave = m => String(m || '').trim().toUpperCase().replace(/\s+/g, '');

/** Rangos de un modelo; { modelo, conocido, limites:[a,b,c,d] } */
function rangosDe(modelo) {
    const k = clave(modelo);
    const l = POR_MODELO[k];
    return { modelo: String(modelo || '').trim(), conocido: !!l, limites: l || GENERICO };
}

function tablaRangos() {
    return Object.entries(POR_MODELO).map(([modelo, l]) => ({ modelo, limites: l }));
}

/** Clasifica una lectura de RPM (mayor que 0) en su rango */
function categoria(rpm, l) {
    if (rpm < l[0]) return 'ralenti';
    if (rpm <= l[1]) return 'bajo';
    if (rpm <= l[2]) return 'verde';
    if (rpm <= l[3]) return 'potencia';
    return 'sobre';
}

module.exports = { rangosDe, tablaRangos, categoria, META };
