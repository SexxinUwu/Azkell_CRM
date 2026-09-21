const fs = require('fs');
const path = 'modulos/almacen/inventario/logica.js';
let content = fs.readFileSync(path, 'utf8');

const regex = /(\.catch\(function\(err\)\s*\{\s*alert\('Error al regularizar:\s*'\s*\+\s*err\.message\);\s*\}\);\s*\n\};)(\s*\n\/\/ ── Importar Excel)/;

const addition = `$1

// ── Regularización Masiva a Cero (Admin / Supervisor) ─────────────
window.regularizarTodoCero = function() {
    var confirmacion = confirm('⚠️ ATENCIÓN: Esta acción establecerá el stock base de TODOS los artículos activos en 0 con fecha y hora actual.\\n\\nLos movimientos anteriores seguirán guardados en el historial del Kardex, pero el stock operativo actual iniciará en 0 para nuevo conteo físico.\\n\\n¿Estás seguro de proceder con el reinicio general a 0?');
    if (!confirmacion) return;

    var usuario = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || 'sistema';
    
    fetch('/api/almacen/inventario/regularizar-todo-cero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario, motivo: 'Reinicio general de inventario a cero desde sistema' })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(res) {
        (window._invData || []).forEach(function(item) {
            item.stock_regularizado = 0;
            item.fecha_regularizacion = res.fecha_regularizacion;
            item.stock_actual = 0;
        });
        window._invRender();
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Se regularizaron ' + (res.total_regularizados || 0) + ' artículos a stock 0', 'success');
        } else {
            alert('✅ Éxito: Se regularizaron ' + (res.total_regularizados || 0) + ' artículos a stock 0.');
        }
    })
    .catch(function(err) { alert('Error al ejecutar regularización general: ' + err.message); });
};
$2`;

if (regex.test(content)) {
    content = content.replace(regex, addition);
    fs.writeFileSync(path, content, 'utf8');
    console.log('✅ Updated logica.js successfully');
} else {
    console.log('❌ Regex not matched');
}
