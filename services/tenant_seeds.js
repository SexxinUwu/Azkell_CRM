/**
 * services/tenant_seeds.js — Datos iniciales de una empresa (solo datos, sin DDL).
 * La estructura la crean las migraciones de Prisma (prisma/schema/migrations). Este módulo
 * carga los catálogos base con INSERT IGNORE: es idempotente y no cambia datos existentes.
 * Lo usa services/tenant_provisioner.js al dar de alta una empresa nueva.
 */

const marcasNeu = [
        'AEOLUS', 'AMBERTONE', 'APLUS', 'ARMORSTEEL', 'AUSTONE', 'AUFINE', 'BLACKLION', 'BRIDGESTONE',
        'CHAOYANG', 'CONTINENTAL', 'DUNLOP', 'DOUBLESTAR', 'DURATURN', 'DYNACARGO', 'FULLRUN', 'GITI',
        'GOODYEAR', 'GOODRIDE', 'GOODTYRE', 'GOLDEN CROWN', 'HANKOOK', 'HILO', 'INFINITY', 'JK TYRE',
        'JINYU', 'KELLY', 'KETER', 'KUMHO', 'KUNLUN', 'LABIGATOR', 'LINGLONG', 'MAISHALL', 'MARSHAL',
        'MAXELL', 'MAXXIS', 'MICHELIN', 'NIPPON', 'PIRELLI', 'PRINX', 'ROADLUX', 'ROYAL BLACK',
        'STEELMARK', 'SUPERHAWK', 'TRIANGLE', 'WESTLAKE', 'WINDPOWER', 'WOSEN', 'YOKOHAMA', 'EVERGREEN', 'ROADMASTER'
    ];
const medidasNeu = [
        '11R22.5', '235/70R17.5', '235/75R17.5', '245/70R17.5', '245/70R19.5', '245/70R22.5',
        '275/70R22.5', '275/80R22.5', '295/80R22.5', '315/80R22.5', '385/65R22.5', '425/65R22.5',
        '445/65R22.5', '9.5R17.5'
    ];
const accionesNeu = ['Inspeccion', 'Reparacion', 'Cambio', 'Instalacion', 'Rotacion'];
const modelosNeu = [
        '10558', '17', '366', '785', 'AAR603', 'ACEL2', 'AD153', 'ADR35', 'ADR6', 'ADR8', 'AEL2', 'AEL5',
        'AF177', 'AG510', 'AGD', 'AGD5', 'AH+', 'AHS', 'AHT', 'AMS', 'AT115A', 'AT121', 'AT161', 'AT27',
        'AT605', 'AZ126', 'AZ171', 'BA226', 'BAR26', 'BT165', 'C901', 'CITY Y999', 'COUCH GRIP', 'CR960',
        'CR976A', 'CRUNCH GRIP', 'CST27', 'D200', 'DR919', 'DSR266', 'DUD100', 'E BUS', 'EZ334', 'F820',
        'FFH123', 'FR01', 'FR88', 'G658', 'GAC812', 'GAR820', 'GAU867', 'GAU867A', 'GDR1', 'GDR665', 'GITI',
        'GL283A', 'GSR1', 'GSR225', 'GSRI', 'GT198', 'GT867', 'GU01', 'HAI', 'HA1', 'HCT', 'HD', 'HD3',
        'HH301', 'HKS78', 'HK578', 'HN266', 'HT3', 'HTC', 'HYD', 'IFL866', 'JDH6', 'JDM6', 'JF568', 'JOH6',
        'JTM1', 'JU558', 'JUH5', 'JULL1', 'JUM', 'K5461', 'KMA01', 'KMAX', 'KMAX D', 'KMAX S', 'KMAX5',
        'KMAXD', 'KMAX D200', 'KMAX D210', 'KMAX S210', 'KRA01', 'KRA11', 'KRA50', 'KRD50', 'KS461', 'KS481',
        'KT', 'KT511', 'KT512', 'KT522', 'LLA38', 'LLF01', 'LLFO', 'LUFO1', 'M5A', 'M840', 'M940', 'MC45',
        'MIX716', 'MSA2', 'MY507A', 'MYSO7', 'NUEVA', 'PROGUO1', 'R152', 'R605', 'RE', 'REE', 'REGIONAL RHZ',
        'RENCAUCHADA', 'RHS', 'RS201', 'RT605', 'RY023', 'S210', 'SAH02', 'SC216', 'SP580', 'SUPER HA1',
        'T605', 'TB888', 'TE', 'TH22', 'TR01', 'TR656', 'TR658', 'TR668', 'TR685', 'TR689', 'TRS', 'TRS02',
        'V1111', 'WGC28', 'WS', 'WS778', 'WS788', 'WS806', 'XLINE', 'XMULTI', 'Y115', 'Y126', 'Y201', 'Y209',
        'Y631', 'Y99', 'Y999', 'EAU91', 'TR605', 'RM230HH', 'MSS2'
    ];
    

/** Carga las semillas en la base de una empresa. `pool` debe estar conectado a esa base. */
async function sembrarEmpresa(pool) {
    const promisePool = pool.promise ? pool.promise() : pool;
        await promisePool.query("INSERT IGNORE INTO configuracion_erp (clave, valor) VALUES ('empresa_nombre', 'Azkell Fleet')");
        await promisePool.query("INSERT IGNORE INTO configuracion_erp (clave, valor) VALUES ('empresa_logo', '')");
        await promisePool.query("INSERT IGNORE INTO roles (id, nombre, color, permisos_json, es_admin, orden) VALUES (1, 'Administrador', '#5865F2', '{\"admin\":true}', 1, 1)");
        await promisePool.query("INSERT IGNORE INTO roles (id, nombre, color, permisos_json, es_admin, orden) VALUES (2, 'Tesorería', '#10b981', '{\"dashboard\":{\"l\":1},\"tesoreria_caja\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0},\"tesoreria_liquidaciones\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0},\"tesoreria_cuentas\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0},\"tesoreria_bancos\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0},\"tesoreria_centros_costos\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0}}', 0, 2)");
        await promisePool.query("INSERT IGNORE INTO roles (id, nombre, color, permisos_json, es_admin, orden) VALUES (3, 'Conductor', '#22c55e', '{\"dashboard\":{\"l\":0},\"conductor_portal\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0}}', 0, 3)");
        
        // Catálogos semillas predeterminados (INSERT IGNORE garantiza no alterar Marsisa ni datos existentes)
        await promisePool.query("INSERT IGNORE INTO cat_situaciones (id, codigo, descripcion) VALUES (1, 'S01', 'En Espera'), (2, 'S02', 'En Diagnóstico'), (3, 'S03', 'En Reparación'), (4, 'S04', 'Finalizada')");
        await promisePool.query("INSERT IGNORE INTO tipos_mantenimiento (id, tipo_mp, marca, descripcion) VALUES (1, 'MP1', 'TODOS', 'Mantenimiento Preventivo 1'), (2, 'MP2', 'TODOS', 'Mantenimiento Preventivo 2'), (3, 'MP3', 'TODOS', 'Mantenimiento Preventivo 3')");

        // Catálogos Neumáticos - Semillas
        for (const m of marcasNeu) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_marcas (nombre) VALUES (?)", [m]);
        }

        for (const med of medidasNeu) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_medidas (nombre) VALUES (?)", [med]);
        }

        for (const ac of accionesNeu) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_acciones (nombre) VALUES (?)", [ac]);
        }

        for (const mod of modelosNeu) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_modelos (nombre) VALUES (?)", [mod]);
        }

}

module.exports = { sembrarEmpresa };
