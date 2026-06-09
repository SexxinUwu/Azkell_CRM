const fs = require('fs');
const path = require('path');

const logicaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/logica.js');
let logicaContent = fs.readFileSync(logicaPath, 'utf8');

// Inject Tailwind loading at the end of logica.js if not already there
if (!logicaContent.includes('tailwind-cdn-injected')) {
    const tailwindInjector = `
// Inject Tailwind for mobile view dynamically
(function() {
    if (!document.getElementById('tailwind-cdn-injected')) {
        window.tailwind = window.tailwind || {};
        tailwind.config = {
            corePlugins: { preflight: false },
            theme: {
                extend: {
                    colors: {
                        brand: { 50: '#f0f4ff', 100: '#d9e2ff', 500: '#1d4ed8', 600: '#1e40af', 900: '#1e3a8a' },
                        status: { pending: '#f59e0b', process: '#3b82f6', paused: '#ea580c', closed: '#ef4444', done: '#10b981' }
                    },
                    fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] }
                }
            }
        };
        const s = document.createElement('script');
        s.id = 'tailwind-cdn-injected';
        s.src = "https://cdn.tailwindcss.com";
        document.head.appendChild(s);
    }
})();
`;
    logicaContent += '\n' + tailwindInjector;
    fs.writeFileSync(logicaPath, logicaContent, 'utf8');
}

const vistaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/vista.html');
let vistaContent = fs.readFileSync(vistaPath, 'utf8');

// Make #rot-mobile-view position: fixed and full screen
vistaContent = vistaContent.replace(
    /id="rot-mobile-view".*?style="flex: 1; min-height: 0; position: relative; overflow: hidden;"/,
    'id="rot-mobile-view" class="d-flex d-lg-none flex-column bg-slate-950 font-sans text-slate-100" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1045; overflow: hidden;"'
);

fs.writeFileSync(vistaPath, vistaContent, 'utf8');
console.log('Fixed fullscreen and Tailwind loading.');
