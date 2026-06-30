const XLSX = require('xlsx');

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
    ['FECHA INGRESO', 'TEXTO', 'NUMERO'], 
    [46154, 'Hola', 123.45], 
    ["12/05/2026", 'Mundo', 678]
]);
ws['A2'].z = 'm/d/yyyy';
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

const workbook = XLSX.read(XLSX.write(wb, {type: 'buffer'}), { cellDates: true });
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true });
console.log(rawJson);
