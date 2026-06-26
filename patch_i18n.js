const fs = require('fs');
let i18n = fs.readFileSync('modulos/sistema/configuracion/i18n.js', 'utf8');

if (!i18n.includes('"ay": {') && !i18n.includes("'ay': {")) {
    // Extract the 'es' object to clone it for 'ay' and 'qu'
    let esIndex = i18n.indexOf('es: {');
    if (esIndex === -1) esIndex = i18n.indexOf('"es": {');
    if (esIndex === -1) esIndex = i18n.indexOf("'es': {");
    
    // We know 'en: {' comes next
    let enIndex = i18n.indexOf('en: {', esIndex);
    if (enIndex === -1) enIndex = i18n.indexOf('"en": {', esIndex);
    if (enIndex === -1) enIndex = i18n.indexOf("'en': {", esIndex);
    
    if (esIndex !== -1 && enIndex !== -1) {
        let esBlock = i18n.substring(esIndex, enIndex).trim();
        if (esBlock.endsWith(',')) esBlock = esBlock.slice(0, -1); // remove trailing comma
        
        let quBlock = esBlock.replace(/^("?)es("?)?:/, '$1qu$2:')
                            .replace(/'Idioma y Región'/g, "'Idioma y Región (Runasimi)'")
                            .replace(/"Idioma y Región"/g, '"Idioma y Región (Runasimi)"')
                            .replace(/'Dashboard'/g, "'Qhaway (Dashboard)'")
                            .replace(/"Dashboard"/g, '"Qhaway (Dashboard)"')
                            .replace(/'Flota'/g, "'Antawa (Flota)'")
                            .replace(/"Flota"/g, '"Antawa (Flota)"');
                            
        let ayBlock = esBlock.replace(/^("?)es("?)?:/, '$1ay$2:')
                            .replace(/'Idioma y Región'/g, "'Idioma y Región (Aymara)'")
                            .replace(/"Idioma y Región"/g, '"Idioma y Región (Aymara)"')
                            .replace(/'Dashboard'/g, "'Uñjaña (Dashboard)'")
                            .replace(/"Dashboard"/g, '"Uñjaña (Dashboard)"')
                            .replace(/'Flota'/g, "'Tawqa (Flota)'")
                            .replace(/"Flota"/g, '"Tawqa (Flota)"');
        
        // Append qu and ay to the very end before the closing } of FLEET_I18N
        let lastClosingBracketIndex = i18n.lastIndexOf('};');
        if (lastClosingBracketIndex === -1) lastClosingBracketIndex = i18n.lastIndexOf('}');
        
        i18n = i18n.substring(0, lastClosingBracketIndex) + ',\n\n' + quBlock + ',\n\n' + ayBlock + '\n' + i18n.substring(lastClosingBracketIndex);
        fs.writeFileSync('modulos/sistema/configuracion/i18n.js', i18n);
        console.log("Languages qu and ay added to i18n.js");
    } else {
        console.log("Could not find 'es' or 'en' blocks");
    }
} else {
    console.log("Languages already exist");
}
