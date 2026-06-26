const fs = require('fs');
let i18n = fs.readFileSync('modulos/sistema/configuracion/i18n.js', 'utf8');

const missingKeysES = `
    'nav.reportes_ot':       'Reportes OT',
    'nav.trabajos_ot':       'Historial de Trabajos',
    'nav.otros':             'Otros',
    'nav.inventario':        'Inventario',
    'nav.entradas':          'Entradas',
    'nav.salidas':           'Salidas',
    'nav.kardex':            'Kardex',
    'nav.unidades':          'CheckList de Unidades',
    'nav.tareo':             'Tareo',
    'nav.administracion':    'Administración',
`;

const missingKeysEN = `
    'nav.reportes_ot':       'WO Reports',
    'nav.trabajos_ot':       'Work History',
    'nav.otros':             'Others',
    'nav.inventario':        'Inventory',
    'nav.entradas':          'Inbound',
    'nav.salidas':           'Outbound',
    'nav.kardex':            'Kardex',
    'nav.unidades':          'Unit CheckList',
    'nav.tareo':             'Timesheet',
    'nav.administracion':    'Administration',
`;

const missingKeysPT = `
    'nav.reportes_ot':       'Relatórios OS',
    'nav.trabajos_ot':       'Histórico de Trabalho',
    'nav.otros':             'Outros',
    'nav.inventario':        'Estoque',
    'nav.entradas':          'Entradas',
    'nav.salidas':           'Saídas',
    'nav.kardex':            'Kardex',
    'nav.unidades':          'CheckList de Unidades',
    'nav.tareo':             'Controle de Ponto',
    'nav.administracion':    'Administração',
`;

const missingKeysZH = `
    'nav.reportes_ot':       '工单报告',
    'nav.trabajos_ot':       '工作记录',
    'nav.otros':             '其他',
    'nav.inventario':        '库存',
    'nav.entradas':          '入库',
    'nav.salidas':           '出库',
    'nav.kardex':            '出入库记录',
    'nav.unidades':          '车辆检查清单',
    'nav.tareo':             '考勤',
    'nav.administracion':    '管理',
`;

const missingKeysFR = `
    'nav.reportes_ot':       'Rapports OT',
    'nav.trabajos_ot':       'Historique des travaux',
    'nav.otros':             'Autres',
    'nav.inventario':        'Inventaire',
    'nav.entradas':          'Entrées',
    'nav.salidas':           'Sorties',
    'nav.kardex':            'Kardex',
    'nav.unidades':          'CheckList Unités',
    'nav.tareo':             'Feuille de présence',
    'nav.administracion':    'Administration',
`;

// Insert keys after 'nav.conductores'
i18n = i18n.replace(/'nav\.conductores':\s*'.*?',/g, (match, offset, string) => {
    // we need to know which language block this is.
    const beforeStr = string.substring(0, offset);
    let lang = 'es';
    if (beforeStr.lastIndexOf('en: {') > beforeStr.lastIndexOf('es: {')) lang = 'en';
    if (beforeStr.lastIndexOf('pt: {') > beforeStr.lastIndexOf('en: {')) lang = 'pt';
    if (beforeStr.lastIndexOf('zh: {') > beforeStr.lastIndexOf('pt: {')) lang = 'zh';
    if (beforeStr.lastIndexOf('fr: {') > beforeStr.lastIndexOf('zh: {')) lang = 'fr';
    if (beforeStr.lastIndexOf('qu: {') > beforeStr.lastIndexOf('fr: {')) lang = 'qu';
    if (beforeStr.lastIndexOf('ay: {') > beforeStr.lastIndexOf('qu: {')) lang = 'ay';
    
    let keys = missingKeysES;
    if (lang === 'en') keys = missingKeysEN;
    if (lang === 'pt') keys = missingKeysPT;
    if (lang === 'zh') keys = missingKeysZH;
    if (lang === 'fr') keys = missingKeysFR;
    if (lang === 'qu') keys = missingKeysES;
    if (lang === 'ay') keys = missingKeysES;
    
    return match + '\n' + keys;
});

fs.writeFileSync('modulos/sistema/configuracion/i18n.js', i18n);
console.log('i18n keys added');
