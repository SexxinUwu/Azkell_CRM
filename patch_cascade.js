const fs = require('fs');
let c = fs.readFileSync('modulos/sistema/usuarios/logica.js', 'utf8');

c = c.replace(/html \+= '<div class="dc-toggle-wrap"><input type="checkbox" class="dc-toggle" id="pt-' \+ mod\.key \+ '-l"' \+ \(lv\?' checked':''\) \+ '>/g, 
              'html += \'<div class="dc-toggle-wrap"><input type="checkbox" class="dc-toggle" id="pt-\' + mod.key + \'-l"\' + (lv?\' checked\':\'\') + \' onchange="window._guCheckCascade(this, \\\'\' + mod.key + \'\\\', \\\'l\\\')">\');

c = c.replace(/html \+= '<div class="dc-toggle-wrap"><input type="checkbox" class="dc-toggle" id="pt-' \+ mod\.key \+ '-' \+ a \+ '"' \+ \(m\[a\]\?' checked':''\) \+ '>/g, 
              'html += \'<div class="dc-toggle-wrap"><input type="checkbox" class="dc-toggle" id="pt-\' + mod.key + \'-\' + a + \'"\' + (m[a]?\' checked\':\'\') + \' onchange="window._guCheckCascade(this, \\\'\' + mod.key + \'\\\', \\\'\' + a + \'\\\')">\');

// We also need to add the _guCheckCascade function
const cascadeFn = `
window._guCheckCascade = function(el, modKey, action) {
    if (!el || el.classList.contains('readonly')) return;
    var chk = el.checked;
    
    // Auto-activación: Si se activa c, e, d => activa l
    if (chk && (action === 'c' || action === 'e' || action === 'd')) {
        var lEl = document.getElementById('pt-' + modKey + '-l');
        if (lEl && !lEl.checked) lEl.checked = true;
    }
    
    // Auto-desactivación: Si se desactiva l => desactiva c, e, d
    if (!chk && action === 'l') {
        ['c', 'e', 'd'].forEach(function(a) {
            var subEl = document.getElementById('pt-' + modKey + '-' + a);
            if (subEl && subEl.checked) subEl.checked = false;
        });
    }
};
`;
c += cascadeFn;

fs.writeFileSync('modulos/sistema/usuarios/logica.js', c);
console.log("Cascade added");
