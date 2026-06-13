const xlsx = require('xlsx');

// 1. Rampas
const rampasHeader = [
    'ID_Rampa', 'Rampa', 'Placa', 'Kilometraje', 'Fecha Ingreso', 'Hora Ingreso',
    'Fecha Salida', 'Hora Salida', 'Situacion', 'Observaciones', 'Estado'
];

// 2. Ordenes
const ordenesHeader = [
    'ID_OT', 'ID_Padre_Rampa', 'Placa', 'Fecha Ingreso', 'Estado',
    'Tipo', 'SubTipo', 'Supervisor'
];

// 3. Trabajos
const trabajosHeader = [
    'ID_Trabajo', 'ID_Padre_OT', 'Fecha Trabajo', 'Tecnico', 
    'Trabajo Realizado', 'Costo'
];

// 4. Materiales
const materialesHeader = [
    'ID_Material', 'ID_Padre_OT', 'Descripcion', 'Cantidad', 
    'Costo Unitario', 'Fecha'
];

// 5. Inspecciones
const inspeccionesHeader = [
    'ID_Inspeccion', 'ID_Padre_OT', 'Placa', 'Categoria', 'Fecha',
    'Observaciones Generales'
];

const wb = xlsx.utils.book_new();

xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([rampasHeader]), '1. Rampas');
xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([ordenesHeader]), '2. Ordenes');
xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([trabajosHeader]), '3. Trabajos');
xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([materialesHeader]), '4. Materiales');
xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([inspeccionesHeader]), '5. Inspecciones');

xlsx.writeFile(wb, 'Plantilla_Migracion_Azkell.xlsx');
console.log('Plantilla creada exitosamente: Plantilla_Migracion_Azkell.xlsx');
