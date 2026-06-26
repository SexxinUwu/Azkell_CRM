const fs = require('fs');
let i18n = fs.readFileSync('modulos/sistema/configuracion/i18n.js', 'utf8');

// We need to add 'nav.status_rampa', 'nav.movimientos', 'nav.seguridad', 'nav.unidades'
// And we need to change 'nav.fleetrun' from 'Fleetrun' to translations.

const translations = {
    es: {
        'nav.status_rampa': 'Status Rampa',
        'nav.movimientos': 'Movimientos',
        'nav.seguridad': 'Seguridad',
        'nav.unidades': 'CheckList de Ingreso/Salidas de Unidades',
        'nav.fleetrun': 'Mantenimiento Preventivo'
    },
    en: {
        'nav.status_rampa': 'Ramp Status',
        'nav.movimientos': 'Movements',
        'nav.seguridad': 'Security',
        'nav.unidades': 'Unit Entry/Exit CheckList',
        'nav.fleetrun': 'Preventive Maintenance'
    },
    pt: {
        'nav.status_rampa': 'Status da Rampa',
        'nav.movimientos': 'Movimentos',
        'nav.seguridad': 'Segurança',
        'nav.unidades': 'CheckList de Entrada/Saída de Unidades',
        'nav.fleetrun': 'Manutenção Preventiva'
    },
    zh: {
        'nav.status_rampa': '坡道状态 (Rampa)',
        'nav.movimientos': '动作 (Movimientos)',
        'nav.seguridad': '安全 (Seguridad)',
        'nav.unidades': '单位出入检查表 (CheckList)',
        'nav.fleetrun': '预防性维护'
    },
    fr: {
        'nav.status_rampa': 'Statut Rampe',
        'nav.movimientos': 'Mouvements',
        'nav.seguridad': 'Sécurité',
        'nav.unidades': 'CheckList Entrée/Sortie d\'Unités',
        'nav.fleetrun': 'Maintenance Préventive'
    },
    qu: {
        'nav.status_rampa': 'Rampa kachkay',
        'nav.movimientos': 'Kuyuqkuna',
        'nav.seguridad': 'Amachay',
        'nav.unidades': 'Antawakuna Yaykuy/Lluqsiy CheckList',
        'nav.fleetrun': 'Hark\'ana Allichay'
    },
    ay: {
        'nav.status_rampa': 'Rampa utjawi',
        'nav.movimientos': 'Sarnaqawinaka',
        'nav.seguridad': 'Jark\'aqaña',
        'nav.unidades': 'Ukatak CheckList (Mantaw/Mistuw)',
        'nav.fleetrun': 'Jark\'aqaña Askichaña'
    }
};

let lines = i18n.split('\n');

for (const lang in translations) {
    let startIdx = lines.findIndex(l => l.includes(`\n${lang}: {`) || l.includes(` ${lang}: {`) || l === `${lang}: {`);
    if(startIdx !== -1) {
        // Find 'nav.fleetrun' inside this language block
        let endIdx = -1;
        for(let i = startIdx + 1; i < lines.length; i++) {
            if(lines[i].includes('nav.fleetrun')) {
                // Replace it
                lines[i] = lines[i].replace(/:\s*['"][^'"]+['"]/, `: '${translations[lang]['nav.fleetrun'].replace(/'/g, "\\'")}'`);
                
                // Add the new ones below it
                let newLines = [
                    `    'nav.status_rampa':   '${translations[lang]['nav.status_rampa'].replace(/'/g, "\\'")}',`,
                    `    'nav.movimientos':    '${translations[lang]['nav.movimientos'].replace(/'/g, "\\'")}',`,
                    `    'nav.seguridad':      '${translations[lang]['nav.seguridad'].replace(/'/g, "\\'")}',`,
                    `    'nav.unidades':       '${translations[lang]['nav.unidades'].replace(/'/g, "\\'")}',`
                ];
                lines.splice(i + 1, 0, ...newLines);
                break;
            }
        }
    }
}

fs.writeFileSync('modulos/sistema/configuracion/i18n.js', lines.join('\n'));
