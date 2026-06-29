const fs = require('fs');
let code = fs.readFileSync('modulos/mantenimiento/ordenes/vista.html', 'utf8');
code = code.replace(/<table id="ot-tabla-ots">/g, '<div class="table-container flex-grow-1 overflow-auto"><table id="ot-tabla-ots" class="table table-custom m-0">');
code = code.replace(/<table id="ot-tabla-trabajos">/g, '<div class="table-container flex-grow-1 overflow-auto"><table id="ot-tabla-trabajos" class="table table-custom m-0">');
code = code.replace(/<table id="ot-tabla-materiales">/g, '<div class="table-container flex-grow-1 overflow-auto"><table id="ot-tabla-materiales" class="table table-custom m-0">');
code = code.replace(/<table id="ot-tabla-backlog">/g, '<div class="table-container flex-grow-1 overflow-auto"><table id="ot-tabla-backlog" class="table table-custom m-0">');

code = code.replace(/<tbody id="ot-tbody-ots"><\/tbody>\s*<\/table>/g, '<tbody id="ot-tbody-ots"></tbody></table></div>');
code = code.replace(/<tbody id="ot-tbody-trabajos"><\/tbody>\s*<\/table>/g, '<tbody id="ot-tbody-trabajos"></tbody></table></div>');
code = code.replace(/<tbody id="ot-tbody-materiales"><\/tbody>\s*<\/table>/g, '<tbody id="ot-tbody-materiales"></tbody></table></div>');
code = code.replace(/<tbody id="ot-tbody-backlog"><\/tbody>\s*<\/table>/g, '<tbody id="ot-tbody-backlog"></tbody></table></div>');

fs.writeFileSync('modulos/mantenimiento/ordenes/vista.html', code);
console.log('done');

