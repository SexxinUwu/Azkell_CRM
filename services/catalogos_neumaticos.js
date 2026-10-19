/**
 * services/catalogos_neumaticos.js — Catálogos por defecto de neumáticos.
 * Los usan las semillas de una empresa nueva (services/tenant_seeds.js) y el listado de catálogos (routes/neumaticos.js).
 */

const DEFAULT_MARCAS = [
    'ADVANCE', 'AEOLUS', 'AMBERTONE', 'APLUS', 'ARMORSTEEL', 'AUSTONE', 'AUFINE', 'BLACKLION', 'BRIDGESTONE',
    'CHAOYANG', 'CONTINENTAL', 'DUNLOP', 'DOUBLESTAR', 'DURATURN', 'DYNACARGO', 'EVERGREEN', 'FULLRUN', 'GITI',
    'GOODYEAR', 'GOODRIDE', 'GOODTYRE', 'GOLDEN CROWN', 'HANKOOK', 'HILO', 'INFINITY', 'JK TYRE',
    'JINYU', 'KELLY', 'KETER', 'KUMHO', 'KUNLUN', 'LABIGATOR', 'LINGLONG', 'MAISHALL', 'MARSHAL',
    'MAXELL', 'MAXXIS', 'MICHELIN', 'NIPPON', 'PIRELLI', 'PRINX', 'ROADLUX', 'ROADMASTER', 'ROYAL BLACK',
    'STEELMARK', 'SUPERHAWK', 'TRIANGLE', 'WESTLAKE', 'WINDPOWER', 'WOSEN', 'YOKOHAMA'
];

const DEFAULT_MEDIDAS = [
    '11R22.5', '12R22.5', '235/70R17.5', '235/75R17.5', '245/70R17.5', '245/70R19.5', '245/70R22.5',
    '275/70R22.5', '275/80R22.5', '295/80R22.5', '315/80R22.5', '385/65R22.5', '425/65R22.5',
    '445/65R22.5', '9.5R17.5'
];

const DEFAULT_MODELOS = [
    '10558', '17', '366', '785', 'AAR603', 'ACEL2', 'AD153', 'ADR35', 'ADR6', 'ADR8', 'AEL2', 'AEL5',
    'AF177', 'AG510', 'AGD', 'AGD5', 'AH+', 'AHS', 'AHT', 'AMS', 'AT115A', 'AT121', 'AT161', 'AT27',
    'AT605', 'AZ126', 'AZ171', 'BA226', 'BAR26', 'BT165', 'C901', 'CITY Y999', 'COUCH GRIP', 'CR960',
    'CR976A', 'CRUNCH GRIP', 'CST27', 'D200', 'DR919', 'DSR266', 'DUD100', 'E BUS', 'EAU91', 'EZ334', 'F820',
    'FFH123', 'FR01', 'FR88', 'G658', 'GAC812', 'GAR820', 'GAU867', 'GAU867A', 'GDR1', 'GDR665', 'GITI',
    'GL282A', 'GL283A', 'GSR1', 'GSR225', 'GSRI', 'GT198', 'GT867', 'GU01', 'HAI', 'HA1', 'HCT', 'HD', 'HD3',
    'HH301', 'HKS78', 'HK578', 'HN266', 'HT3', 'HTC', 'HYD', 'IFL866', 'JDH6', 'JDM6', 'JF568', 'JOH6',
    'JTM1', 'JU558', 'JUH5', 'JULL1', 'JUM', 'K5461', 'KMA01', 'KMAX', 'KMAX D', 'KMAX S', 'KMAX5',
    'KMAXD', 'KMAX D200', 'KMAX D210', 'KMAX S210', 'KRA01', 'KRA11', 'KRA50', 'KRD50', 'KS461', 'KS481',
    'KT', 'KT511', 'KT512', 'KT522', 'LLA38', 'LLF01', 'LLFO', 'LUFO1', 'M5A', 'M729', 'M840', 'M940', 'MC45',
    'MIX716', 'MSA2', 'MSS2', 'MY507A', 'MYSO7', 'NUEVA', 'PROGUO1', 'R152', 'R605', 'RE', 'REE', 'REGIONAL RHZ',
    'RENCAUCHADA', 'RHS', 'RM230HH', 'RS201', 'RT605', 'RY023', 'S210', 'SAH02', 'SC216', 'SP580', 'SUPER HA1',
    'T605', 'TB888', 'TE', 'TH22', 'TR01', 'TR605', 'TR656', 'TR658', 'TR668', 'TR685', 'TR689', 'TRS', 'TRS02',
    'V1111', 'WGC28', 'WS', 'WS778', 'WS788', 'WS806', 'XLINE', 'XMULTI', 'XZY3', 'Y115', 'Y126', 'Y201', 'Y209',
    'Y631', 'Y99', 'Y999'
];

const DEFAULT_ACCIONES = ['Inspección', 'Rotación', 'Instalación', 'Cambio', 'Reparación', 'Reencauche', 'Baja'];

module.exports = { DEFAULT_MARCAS, DEFAULT_MEDIDAS, DEFAULT_MODELOS, DEFAULT_ACCIONES };
