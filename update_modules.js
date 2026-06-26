const fs = require('fs');
let c = fs.readFileSync('modulos/sistema/usuarios/logica.js', 'utf8');

const regexModulos = /window\._GU_MODULOS = window\._GU_MODULOS \|\| \[[\s\S]*?\];/;
const nuevosModulos = `window._GU_MODULOS = window._GU_MODULOS || [
    // FLOTA
    { grupo:'FLOTA',         key:'gps',           nombre:'GPS / Ubicación',  desc:'Visualización en tiempo real',  lcad:false },
    { grupo:'FLOTA',         key:'status',        nombre:'Status Flota',     desc:'Estado y agrupación de unidades', lcad:true  },

    // MANTENIMIENTO
    { grupo:'MANTENIMIENTO', key:'status_rampa',  nombre:'Status Rampa',     desc:'Gestión visual en taller',      lcad:true  },
    { grupo:'MANTENIMIENTO', key:'insp',          nombre:'Análisis de Inspecciones', desc:'Registro de inspecciones', lcad:true  },
    { grupo:'MANTENIMIENTO', key:'fleet',         nombre:'Mantenimiento Preventivo', desc:'Datos operativos de la flota',  lcad:true  },
    { grupo:'MANTENIMIENTO', key:'reportes_ot',   nombre:'Reportes OT',      desc:'Métricas de mantenimiento',     lcad:false },
    { grupo:'MANTENIMIENTO', key:'trabajos_ot',   nombre:'Historial de Trabajos', desc:'Gestión de técnicos',           lcad:true  },
    { grupo:'MANTENIMIENTO', key:'otros_mant',    nombre:'Otros',            desc:'Módulos complementarios',       lcad:true  },

    // ALMACÉN
    { grupo:'ALMACÉN',       key:'inv',           nombre:'Inventario',       desc:'Catálogo de artículos',         lcad:true  },
    { grupo:'ALMACÉN',       key:'ent_inv',       nombre:'Entradas',         desc:'Ingresos al almacén',           lcad:true  },
    { grupo:'ALMACÉN',       key:'sal_inv',       nombre:'Salidas',          desc:'Egresos del almacén',           lcad:true  },
    { grupo:'ALMACÉN',       key:'kardex',        nombre:'Kardex',           desc:'Movimientos por artículo',      lcad:false },

    // DIRECTORIO
    { grupo:'DIRECTORIO',    key:'cond',          nombre:'Personal',         desc:'Directorio operativo',          lcad:true  },

    // SEGURIDAD
    { grupo:'SEGURIDAD',     key:'placas',        nombre:'CheckList de Ingreso/Salidas de Unidades',desc:'Fichas técnicas', lcad:true  },
    { grupo:'SEGURIDAD',     key:'asist',         nombre:'Tareo',            desc:'Asistencia del personal',       lcad:true  },

    // CONFIGURACIÓN (Antes SISTEMA)
    { grupo:'CONFIGURACIÓN', key:'usuarios',      nombre:'Usuarios',         desc:'Gestión de accesos',            lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'mod_auditoria', nombre:'Auditoría',        desc:'Bitácora de actividad',         lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'cfg_apariencia',nombre:'Apariencia',       desc:'Personalización visual',        lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'cfg_accesibilidad',nombre:'Accesibilidad', desc:'Ajustes de uso',                lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'cfg_idioma',    nombre:'Idioma',           desc:'Idiomas del sistema',           lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'administracion',nombre:'Administración',   desc:'Hub de administración',         lcad:true  }
];`;

c = c.replace(regexModulos, nuevosModulos);

fs.writeFileSync('modulos/sistema/usuarios/logica.js', c);
console.log("logica.js _GU_MODULOS updated.");
