const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// Update Exportar Excel
js = js.replace(/var filas = \[\['ID','Marca Vehículo','Tipo MP','Nombre Kit','Ítem \(Artículo\)','Cantidad','Unidad','Costo Unit\.','Costo Total'\]\];/, 
                `var filas = [['ID','Marca Vehículo','Modelo Vehículo','Tipo MP','Nombre Kit','Ítem (Artículo)','Cantidad','Unidad','Costo Unit.','Costo Total']];`);
js = js.replace(/filas\.push\(\[k\.id\|\|'', k\.marca_vehiculo\|\|'', k\.tipo_mp\|\|'', k\.nombre_kit\|\|'',/, 
                `filas.push([k.id||'', k.marca_vehiculo||'', k.modelo_vehiculo||'TODOS LOS MODELOS', k.tipo_mp||'', k.nombre_kit||'',`);
js = js.replace(/ws\['!cols'\] = \[6,16,8,20,28,8,10,10,10\]/, `ws['!cols'] = [6,16,16,8,20,28,8,10,10,10]`);

// Update Plantilla
js = js.replace(/var filas = \[\s*\['Marca Vehículo','Tipo MP','Nombre Kit','Ítem \(Artículo\)','Cantidad','Unidad','Costo Unit\.'\],\s*\['VOLVO','MP1','Kit 15K','Filtro de Aceite',1,'UND',25\.00\],\s*\['VOLVO','MP1','Kit 15K','Aceite Motor 15W40',12,'LT',18\.50\]\s*\];/, 
`var filas = [
        ['Marca Vehículo','Modelo Vehículo','Tipo MP','Nombre Kit','Ítem (Artículo)','Cantidad','Unidad','Costo Unit.'],
        ['VOLVO','TODOS LOS MODELOS','MP1','Kit 15K','Filtro de Aceite',1,'UND',25.00],
        ['VOLVO','TODOS LOS MODELOS','MP1','Kit 15K','Aceite Motor 15W40',12,'LT',18.50]
    ];`);
js = js.replace(/ws\['!cols'\] = \[16,8,20,28,8,10,10\]/, `ws['!cols'] = [16,16,8,20,28,8,10,10]`);

// Update Importar Excel
js = js.replace(/marca_vehiculo:\s*String\(r\['Marca Vehículo'\] \|\| r\.marca_vehiculo \|\| ''\)\.trim\(\)\.toUpperCase\(\),/, 
`marca_vehiculo: String(r['Marca Vehículo'] || r.marca_vehiculo || '').trim().toUpperCase(),
                    modelo_vehiculo: String(r['Modelo Vehículo'] || r.modelo_vehiculo || '').trim().toUpperCase() || 'TODOS LOS MODELOS',`);

fs.writeFileSync(fileJs, js, 'utf8');
