const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/logica.js';
let code = fs.readFileSync(path, 'utf8');

// 1. Add active tab logic and switcher function
if (!code.includes('window._invActiveTab')) {
    const tabLogic = `
window._invActiveTab = 'fisicos';

window._invSwitchTab = function(tab) {
    window._invActiveTab = tab;
    var btnFisicos = document.getElementById('inv-tab-fisicos');
    var btnServicios = document.getElementById('inv-tab-servicios');
    if (!btnFisicos || !btnServicios) return;
    
    if (tab === 'fisicos') {
        btnFisicos.className = 'inv-tab-btn active';
        btnFisicos.style.background = '#0ea5e9';
        btnFisicos.style.color = '#fff';
        btnServicios.className = 'inv-tab-btn';
        btnServicios.style.background = 'transparent';
        btnServicios.style.color = '#0ea5e9';
        document.getElementById('inv-fil-familia').style.display = 'inline-block';
        document.getElementById('inv-fil-sistema').style.display = 'inline-block';
    } else {
        btnServicios.className = 'inv-tab-btn active';
        btnServicios.style.background = '#0ea5e9';
        btnServicios.style.color = '#fff';
        btnFisicos.className = 'inv-tab-btn';
        btnFisicos.style.background = 'transparent';
        btnFisicos.style.color = '#0ea5e9';
        document.getElementById('inv-fil-familia').style.display = 'none';
        document.getElementById('inv-fil-sistema').style.display = 'none';
    }
    window.filtrarInventario();
};
`;
    code = code.replace(/window\.filtrarInventario = function\(\) \{/, tabLogic + '\nwindow.filtrarInventario = function() {');
}

// 2. Modify filtrarInventario
// Replace the old filClase logic if it exists (but it probably doesn't because git checkout reverted it)
// Let's add the filClase to the filter condition explicitly.
const matchBRegex = /var matchS = !filSis \|\| d\.sistema === filSis;/;
if (code.includes('var matchS = !filSis')) {
    code = code.replace(matchBRegex, `var matchS = !filSis || d.sistema === filSis;
          var matchC = (window._invActiveTab === 'servicios') ? (d.tipo === 'Servicio') : (d.tipo !== 'Servicio');`);
          
    code = code.replace(/return matchB && matchF && matchS;/, 'return matchB && matchF && matchS && matchC;');
}

// 3. Modify abrirModalInventario to simplify the modal for Services
const modalLogic = `
      // Aislamiento Servicios en el modal
      var isServicio = window._invActiveTab === 'servicios';
      
      // Ocultar elementos si es servicio
      var toHide = [
        document.getElementById('inv-f-codigo-barras')?.parentNode,
        document.getElementById('inv-f-marca-txt')?.closest('div.position-relative')?.parentNode?.parentNode, // Marca
        document.getElementById('inv-f-familia-txt')?.closest('div.position-relative')?.parentNode?.parentNode, // Familia
        document.getElementById('inv-f-tipo-txt')?.closest('div.position-relative')?.parentNode, // Tipo
        document.getElementById('inv-f-sub-tipo-txt')?.closest('div.position-relative')?.parentNode, // Subtipo
        document.getElementById('inv-f-almacen-txt')?.closest('div.position-relative')?.parentNode, // Almacen
        document.getElementById('inv-f-anaquel')?.parentNode, // Anaquel
        document.getElementById('inv-f-unidad-txt')?.closest('div.position-relative')?.parentNode, // Unidad
        document.getElementById('inv-f-minimo')?.parentNode, // Minimo
        document.getElementById('inv-f-maximo')?.parentNode  // Maximo
      ];
      
      toHide.forEach(function(el) {
          if (el && el.style) {
              el.style.display = isServicio && !id ? 'none' : '';
          }
      });
      
      if (isServicio && !id) {
          window._cbSet('inv-f-tipo', 'Servicio', 'Servicio');
          window._cbSet('inv-f-unidad', 'Servicio', 'Servicio');
      }
`;
code = code.replace(/window\.invMsInit\(''\);/, "window.invMsInit('');\n" + modalLogic);

fs.writeFileSync(path, code);
console.log('Logica updated');
