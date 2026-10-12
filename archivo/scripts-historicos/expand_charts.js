const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// 1. Expand famLabels slice from 6 to 12
js = js.replace(/var famLabels = famKeys\.slice\(0,6\);/, 'var famLabels = famKeys.slice(0,12);');

// 2. Expand colors
js = js.replace(/backgroundColor:\s*\['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#94a3b8'\]/, "backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#94a3b8', '#06b6d4', '#8b5cf6', '#14b8a6', '#f43f5e', '#a855f7', '#64748b']");

// 3. Expand consLabels slice from 5 to 10
js = js.replace(/var consLabels = consKeys\.slice\(0,5\);/, 'var consLabels = consKeys.slice(0,10);');

fs.writeFileSync(fileJs, js, 'utf8');
console.log('Expanded charts to show more families.');
