const fs = require('fs');
const path = require('path');

const vistaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/vista.html');
let content = fs.readFileSync(vistaPath, 'utf8');

// The mobile mockup HTML from the user:
const mobileHtml = `
    <!-- Tailwind CSS (Scoped to mobile view if possible, disabled preflight) -->
    <script>
        window.tailwind = window.tailwind || {};
        tailwind.config = {
            corePlugins: {
                preflight: false,
            },
            theme: {
                extend: {
                    colors: {
                        brand: {
                            50: '#f0f4ff',
                            100: '#d9e2ff',
                            500: '#1d4ed8',
                            600: '#1e40af',
                            900: '#1e3a8a',
                        },
                        status: {
                            pending: '#f59e0b',
                            process: '#3b82f6',
                            paused: '#ea580c',
                            closed: '#ef4444',
                            done: '#10b981'
                        }
                    },
                    fontFamily: {
                        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                    }
                }
            }
        }
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <style>
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    </style>

    <!-- Contenedor principal de la Vista Móvil -->
    <div id="rot-mobile-view" class="d-flex d-lg-none flex-column w-100 h-100 bg-slate-950 font-sans text-slate-100" style="flex: 1; min-height: 0; position: relative; overflow: hidden;">
        
        <!-- Header de la Aplicación -->
        <header class="bg-slate-900 px-4 pt-3 pb-4 border-b border-slate-800 shrink-0">
            <div class="flex justify-between items-center mb-3">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md shadow-brand-500/20">
                        AF
                    </div>
                    <div>
                        <h1 class="text-sm font-bold tracking-tight text-white m-0">Azkell Fleet</h1>
                        <span class="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                            <span class="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span> GPS Activo
                        </span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5">
                    <button class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 hover:bg-slate-700 transition border-0" onclick="window.rotCargar()">
                        <i class="fa-solid fa-arrows-rotate text-xs"></i>
                    </button>
                    <button class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 hover:bg-slate-700 transition border-0" onclick="showToast('Notificaciones')">
                        <div class="relative">
                            <i class="fa-regular fa-bell text-xs"></i>
                            <span class="absolute top-0 right-0 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                        </div>
                    </button>
                </div>
            </div>

            <!-- Buscador Rápido y Filtro -->
            <div class="flex gap-2">
                <div class="relative flex-1">
                    <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs" style="margin-top:2px;"></i>
                    <input type="text" id="rotMobileSearch" oninput="window.rotFiltrar()" placeholder="N° OT, Placa, Supervisor..." 
                           class="w-full bg-slate-800 text-slate-200 pl-8 pr-3 py-1.5 rounded-xl text-xs placeholder:text-slate-500 border border-slate-700/50 focus:outline-none focus:border-brand-500 transition-all m-0">
                </div>
                <button onclick="toggleFilterDrawer()" class="px-3 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition border-0">
                    <i class="fa-solid fa-sliders text-xs"></i>
                    <span>Filtros</span>
                </button>
            </div>
        </header>

        <!-- Contenido Deslizable Principal -->
        <main class="flex-1 overflow-y-auto no-scrollbar pb-24 bg-slate-950">

            <!-- Carrusel Horizontal de Métricas (KPIs) -->
            <div class="px-4 pt-4 pb-2">
                <div class="flex justify-between items-center mb-2 px-1">
                    <h2 class="text-xs font-bold uppercase tracking-wider text-slate-400 m-0">Resumen Operativo</h2>
                    <span class="text-[10px] text-brand-400 font-medium flex items-center gap-1">
                        Desliza <i class="fa-solid fa-chevron-right text-[8px]"></i>
                    </span>
                </div>
                
                <div class="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
                    <div class="snap-start shrink-0 w-32 bg-slate-900 border-l-4 border-brand-500 p-3 rounded-xl shadow-lg flex flex-col justify-between">
                        <span class="text-[10px] font-medium text-slate-400 block mb-1">TOTAL OTS</span>
                        <div>
                            <span class="text-2xl font-bold text-white block leading-none mb-1" id="rotMobileKpiTotal">0</span>
                            <span class="text-[9px] text-slate-500 font-normal">Mostrando</span>
                        </div>
                    </div>
                    <div class="snap-start shrink-0 w-32 bg-slate-900 border-l-4 border-red-500 p-3 rounded-xl shadow-lg flex flex-col justify-between">
                        <span class="text-[10px] font-medium text-slate-400 block mb-1">CORRECTIVOS</span>
                        <div>
                            <span class="text-2xl font-bold text-white block leading-none mb-1" id="rotMobileKpiCorrectivos">0</span>
                            <span class="text-[9px] text-red-400 font-medium">Urgencias</span>
                        </div>
                    </div>
                    <div class="snap-start shrink-0 w-32 bg-slate-900 border-l-4 border-blue-500 p-3 rounded-xl shadow-lg flex flex-col justify-between">
                        <span class="text-[10px] font-medium text-slate-400 block mb-1">PREVENTIVOS</span>
                        <div>
                            <span class="text-2xl font-bold text-white block leading-none mb-1" id="rotMobileKpiPreventivos">0</span>
                            <span class="text-[9px] text-blue-400 font-medium">Mantenimientos</span>
                        </div>
                    </div>
                    <div class="snap-start shrink-0 w-32 bg-slate-900 border-l-4 border-emerald-500 p-3 rounded-xl shadow-lg flex flex-col justify-between">
                        <span class="text-[10px] font-medium text-slate-400 block mb-1 font-bold">COSTO TOTAL</span>
                        <div>
                            <span class="text-lg font-bold text-emerald-400 block leading-none mb-1" id="rotMobileKpiCosto">S/ 0.00</span>
                            <span class="text-[9px] text-slate-500 font-normal">Costo acumulado</span>
                        </div>
                    </div>
                    <div class="snap-start shrink-0 w-32 bg-slate-900 border-l-4 border-orange-500 p-3 rounded-xl shadow-lg flex flex-col justify-between">
                        <span class="text-[10px] font-medium text-slate-400 block mb-1">EN PROCESO</span>
                        <div>
                            <span class="text-2xl font-bold text-white block leading-none mb-1" id="rotMobileKpiProceso">0</span>
                            <span class="text-[9px] text-orange-400 font-medium">En Taller</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Botones Rápidos de Exportación -->
            <div class="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar">
                <button onclick="window.rotExportar()" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-[11px] font-semibold hover:bg-emerald-600/20 transition shrink-0">
                    <i class="fa-regular fa-file-excel text-xs"></i>
                    <span>Exportar Excel</span>
                </button>
                <button onclick="window.rotExportarPDF()" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/10 border border-rose-500/20 rounded-lg text-rose-400 text-[11px] font-semibold hover:bg-rose-600/20 transition shrink-0">
                    <i class="fa-regular fa-file-pdf text-xs"></i>
                    <span>Exportar PDF</span>
                </button>
            </div>

            <!-- Filtro de Categoría / Estado Horizontal -->
            <div class="px-4 py-2">
                <div class="flex gap-1.5 overflow-x-auto no-scrollbar py-1" id="rotMobileStatusTabs">
                    <button data-estado="" onclick="window.rotChipEstado(this,'')" class="rot-mobile-chip px-3 py-1.5 bg-brand-500 text-white rounded-full text-xs font-semibold whitespace-nowrap shadow-md transition-all border-0">
                        Todos
                    </button>
                    <button data-estado="Pendiente" onclick="window.rotChipEstado(this,'Pendiente')" class="rot-mobile-chip px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-full text-xs font-semibold whitespace-nowrap transition-all border-0">
                        Pendiente
                    </button>
                    <button data-estado="En Proceso" onclick="window.rotChipEstado(this,'En Proceso')" class="rot-mobile-chip px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-full text-xs font-semibold whitespace-nowrap transition-all border-0">
                        En Proceso
                    </button>
                    <button data-estado="Pausada" onclick="window.rotChipEstado(this,'Pausada')" class="rot-mobile-chip px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-full text-xs font-semibold whitespace-nowrap transition-all border-0">
                        Pausada
                    </button>
                    <button data-estado="Finalizado" onclick="window.rotChipEstado(this,'Finalizado')" class="rot-mobile-chip px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-full text-xs font-semibold whitespace-nowrap transition-all border-0">
                        Finalizado
                    </button>
                </div>
            </div>

            <!-- Listado de Tarjetas OT (Se llena desde JS) -->
            <div class="px-4 py-2 space-y-3" id="otListMobile">
                <!-- Se inyecta rotRenderTablaMobile -->
            </div>
        </main>

        <!-- Botón de Creación Flotante Inteligente (FAB) -->
        <button onclick="window.rotAbrirSubDrawer('rot-drawer-backlog')" class="absolute right-4 bottom-24 w-12 h-12 bg-brand-500 hover:bg-brand-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-brand-500/30 active:scale-95 transition z-10 border-0">
            <i class="fa-solid fa-plus text-base"></i>
        </button>

        <!-- Barra de Navegación Inferior (Sticky Navigation Bar) -->
        <nav class="absolute bottom-0 left-0 right-0 h-20 bg-slate-900 border-t border-slate-800 px-2 flex justify-around items-center z-40 pb-3">
            <button class="flex flex-col items-center gap-1 text-slate-500 py-1 bg-transparent border-0" onclick="cargarModuloAislado('dashboard')">
                <i class="fa-solid fa-chart-pie text-sm"></i>
                <span class="text-[10px] font-medium">Inicio</span>
            </button>
            <button class="flex flex-col items-center gap-1 text-slate-500 py-1 bg-transparent border-0" onclick="cargarModuloAislado('mantenimiento/flota')">
                <i class="fa-solid fa-truck-moving text-sm"></i>
                <span class="text-[10px] font-medium">Flota</span>
            </button>
            <!-- Mantenimiento Seleccionado por Defecto -->
            <button class="flex flex-col items-center gap-1 text-brand-400 py-1 relative bg-transparent border-0">
                <div class="absolute -top-3 w-1.5 h-1.5 bg-brand-400 rounded-full"></div>
                <i class="fa-solid fa-screwdriver-wrench text-sm text-brand-400"></i>
                <span class="text-[10px] font-semibold text-brand-400">Mant.</span>
            </button>
            <button class="flex flex-col items-center gap-1 text-slate-500 py-1 bg-transparent border-0" onclick="cargarModuloAislado('almacen/inventario')">
                <i class="fa-solid fa-boxes-stacked text-sm"></i>
                <span class="text-[10px] font-medium">Almacén</span>
            </button>
            <button class="flex flex-col items-center gap-1 text-slate-500 py-1 bg-transparent border-0" onclick="showToast('Menú no disponible')">
                <i class="fa-solid fa-ellipsis text-sm"></i>
                <span class="text-[10px] font-medium">Más</span>
            </button>
        </nav>

        <!-- Fondo Oscurecedor para Modales (Overlay) -->
        <div id="rotMobileOverlay" class="absolute inset-0 bg-black/60 z-40 hidden transition-all duration-300" onclick="closeAllDrawers()"></div>

        <!-- Cajón Inferior de Filtros Avanzados (Filter Bottom Sheet) -->
        <div id="rotMobileFilterDrawer" class="absolute bottom-0 left-0 right-0 h-[500px] bg-slate-900 rounded-t-[32px] border-t border-slate-800 z-50 transform translate-y-full transition-transform duration-300 ease-out p-6">
            <div class="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-6"></div>
            
            <div class="flex justify-between items-center mb-5">
                <h3 class="text-base font-bold text-white flex items-center gap-2 m-0">
                    <i class="fa-solid fa-sliders text-brand-400"></i> Filtros Avanzados
                </h3>
                <button onclick="resetFilters()" class="text-xs font-semibold text-brand-400 hover:text-brand-300 bg-transparent border-0 p-0">
                    Limpiar todo
                </button>
            </div>

            <div class="space-y-4 max-h-[340px] overflow-y-auto no-scrollbar pb-6">
                <!-- N° OT -->
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Número de OT</label>
                    <input type="text" id="rotMobileFilOt" placeholder="Ej. OT-2026-0001" oninput="document.getElementById('rot-fil-ot').value=this.value;" class="w-full bg-slate-800 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500 m-0">
                </div>

                <!-- Placa -->
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Placa del Vehículo</label>
                    <input type="text" id="rotMobileFilPlaca" placeholder="Ej. A5B891" oninput="this.value=this.value.toUpperCase(); document.getElementById('rot-fil-placa').value=this.value;" class="w-full bg-slate-800 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500 m-0">
                </div>

                <!-- Rango de Fechas -->
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Rango de Fecha</label>
                    <div class="grid grid-cols-2 gap-2">
                        <input type="date" id="rotMobileFilDesde" onchange="document.getElementById('rot-fil-desde').value=this.value;" class="bg-slate-800 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500 m-0">
                        <input type="date" id="rotMobileFilHasta" onchange="document.getElementById('rot-fil-hasta').value=this.value;" class="bg-slate-800 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500 m-0">
                    </div>
                </div>
            </div>

            <div class="absolute bottom-4 left-6 right-6 grid grid-cols-2 gap-3 bg-slate-900 pt-3">
                <button onclick="toggleFilterDrawer()" class="py-2.5 border border-slate-700 text-slate-300 font-semibold rounded-xl text-xs hover:bg-slate-800 active:scale-95 transition bg-transparent">
                    Cancelar
                </button>
                <button onclick="window.rotFiltrar(); toggleFilterDrawer();" class="py-2.5 bg-brand-500 text-white font-semibold rounded-xl text-xs hover:bg-brand-600 active:scale-95 transition border-0">
                    Aplicar Filtros
                </button>
            </div>
        </div>

        <!-- Cajón Inferior de Acciones Contextuales -->
        <div id="rotMobileActionDrawer" class="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-[32px] border-t border-slate-800 z-50 transform translate-y-full transition-transform duration-300 ease-out p-6">
            <div class="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-6"></div>
            
            <div class="mb-4">
                <span class="text-[10px] font-bold text-brand-400 uppercase tracking-widest block" id="rotActionDrawerSub">Acciones</span>
                <h3 class="text-base font-extrabold text-white m-0" id="rotActionDrawerTitle">Orden de Trabajo</h3>
            </div>
            
            <input type="hidden" id="rotMobileSelectedOT" value="">

            <div class="space-y-2">
                <button onclick="rotMobileActionWrapper('editar')" class="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-left text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-3 transition border-0">
                    <i class="fa-regular fa-pen-to-square text-brand-400 text-sm w-4 text-center"></i>
                    <span>Editar Detalles de OT</span>
                </button>
                <button onclick="rotMobileActionWrapper('detalle')" class="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-left text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-3 transition border-0">
                    <i class="fa-solid fa-list-check text-blue-400 text-sm w-4 text-center"></i>
                    <span>Ver Detalles Completos</span>
                </button>
                <button onclick="rotMobileActionWrapper('iniciar')" id="rotMobileBtnIniciar" class="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-left text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-3 transition border-0 hidden">
                    <i class="fa-solid fa-play text-emerald-400 text-sm w-4 text-center"></i>
                    <span>Iniciar OT</span>
                </button>
                <button onclick="rotMobileActionWrapper('pausar')" id="rotMobileBtnPausar" class="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-left text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-3 transition border-0 hidden">
                    <i class="fa-solid fa-pause text-amber-500 text-sm w-4 text-center"></i>
                    <span>Pausar OT</span>
                </button>
                <button onclick="rotMobileActionWrapper('cerrar')" id="rotMobileBtnCerrar" class="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-left text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-3 transition border-0 hidden">
                    <i class="fa-solid fa-square-check text-rose-500 text-sm w-4 text-center"></i>
                    <span>Cerrar OT</span>
                </button>
            </div>

            <div class="mt-5">
                <button onclick="toggleActionDrawer()" class="w-full py-3 border border-slate-700 text-slate-300 font-semibold rounded-xl text-xs hover:bg-slate-800 transition bg-transparent">
                    Cerrar Menú
                </button>
            </div>
        </div>

        <!-- Toast -->
        <div id="rotMobileToast" class="absolute top-16 left-4 right-4 bg-slate-900 border border-brand-500/30 text-white rounded-xl px-3 py-2.5 flex items-center gap-2.5 shadow-lg transform -translate-y-28 opacity-0 transition-all duration-300 z-50">
            <div class="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center">
                <i class="fa-solid fa-circle-info text-xs"></i>
            </div>
            <span class="text-xs font-medium" id="rotMobileToastMessage">Operación realizada</span>
        </div>
    </div>
    
    <script>
        // Drawer Logic
        window.toggleFilterDrawer = function() {
            const drawer = document.getElementById('rotMobileFilterDrawer');
            const overlay = document.getElementById('rotMobileOverlay');
            if (drawer.classList.contains('translate-y-full')) {
                document.getElementById('rotMobileActionDrawer').classList.add('translate-y-full');
                drawer.classList.remove('translate-y-full');
                overlay.classList.remove('hidden');
            } else {
                drawer.classList.add('translate-y-full');
                overlay.classList.add('hidden');
            }
        };

        window.toggleActionDrawer = function(otId, estado) {
            const drawer = document.getElementById('rotMobileActionDrawer');
            const overlay = document.getElementById('rotMobileOverlay');
            
            if (otId) {
                document.getElementById('rotActionDrawerTitle').innerText = otId;
                document.getElementById('rotActionDrawerSub').innerText = "Opciones para la " + otId;
                document.getElementById('rotMobileSelectedOT').value = otId;
                
                // Show/Hide action buttons based on status
                document.getElementById('rotMobileBtnIniciar').classList.add('hidden');
                document.getElementById('rotMobileBtnPausar').classList.add('hidden');
                document.getElementById('rotMobileBtnCerrar').classList.add('hidden');
                
                if (estado === 'Pendiente' || estado === 'Pausada') {
                    document.getElementById('rotMobileBtnIniciar').classList.remove('hidden');
                } else if (estado === 'En Proceso') {
                    document.getElementById('rotMobileBtnPausar').classList.remove('hidden');
                    document.getElementById('rotMobileBtnCerrar').classList.remove('hidden');
                }
            }

            if (drawer.classList.contains('translate-y-full')) {
                document.getElementById('rotMobileFilterDrawer').classList.add('translate-y-full');
                drawer.classList.remove('translate-y-full');
                overlay.classList.remove('hidden');
            } else {
                drawer.classList.add('translate-y-full');
                overlay.classList.add('hidden');
            }
        };

        window.closeAllDrawers = function() {
            document.getElementById('rotMobileFilterDrawer').classList.add('translate-y-full');
            document.getElementById('rotMobileActionDrawer').classList.add('translate-y-full');
            document.getElementById('rotMobileOverlay').classList.add('hidden');
        };

        window.resetFilters = function() {
            document.getElementById('rotMobileFilOt').value = '';
            document.getElementById('rotMobileFilPlaca').value = '';
            document.getElementById('rotMobileFilDesde').value = '';
            document.getElementById('rotMobileFilHasta').value = '';
            
            document.getElementById('rot-fil-ot').value = '';
            document.getElementById('rot-fil-placa').value = '';
            document.getElementById('rot-fil-desde').value = '';
            document.getElementById('rot-fil-hasta').value = '';
            
            window.rotFiltrar();
        };

        let rotToastTimeout;
        window.showToast = function(message) {
            const toast = document.getElementById('rotMobileToast');
            document.getElementById('rotMobileToastMessage').innerText = message;
            if (rotToastTimeout) clearTimeout(rotToastTimeout);
            toast.classList.remove('-translate-y-28', 'opacity-0');
            toast.classList.add('translate-y-0', 'opacity-100');
            rotToastTimeout = setTimeout(() => {
                toast.classList.remove('translate-y-0', 'opacity-100');
                toast.classList.add('-translate-y-28', 'opacity-0');
            }, 2500);
        };
        
        window.rotMobileActionWrapper = function(action) {
            const otId = document.getElementById('rotMobileSelectedOT').value;
            closeAllDrawers();
            if(action === 'editar') { window.rotAbrirEdicionOT(otId); }
            if(action === 'detalle') { window.rotVerDetalle(otId); }
            if(action === 'iniciar') { window.rotCambiarEstado(otId, 'En Proceso'); }
            if(action === 'pausar') { window.rotCambiarEstado(otId, 'Pausada'); }
            if(action === 'cerrar') { window.rotCerrarOT(otId); }
        };
    </script>
`;

// Insert the mobile HTML right after <div id="moduloReportesOT">, and wrap the rest in a desktop container
const replacement1 = `
<div id="moduloReportesOT" class="d-flex flex-column h-100" style="flex: 1; min-height: 0;">
    ${mobileHtml}
    
    <!-- DESKTOP VIEW CONTAINER -->
    <div class="d-none d-lg-flex flex-column h-100 w-100" style="flex: 1; min-height: 0; position:relative;">
`;

content = content.replace('<div id="moduloReportesOT">', replacement1);
content = content.replace('</div><!-- fin moduloReportesOT -->', '</div>\n</div><!-- fin moduloReportesOT -->');

fs.writeFileSync(vistaPath, content, 'utf8');
console.log('Successfully updated vista.html with mobile mockup');
