const fs = require('fs');
const path = require('path');

const fileIndex = path.join(__dirname, 'Index.html');
let indexHtml = fs.readFileSync(fileIndex, 'utf8');

// Replace standard script tags with defer in the head and body
indexHtml = indexHtml.replace(/<script src="\/libs\/xlsx\.full\.min\.js"><\/script>/, '<script defer src="/libs/xlsx.full.min.js"></script>');
indexHtml = indexHtml.replace(/<script src="\/libs\/html2pdf\.bundle\.min\.js"><\/script>/, '<script defer src="/libs/html2pdf.bundle.min.js"></script>');
indexHtml = indexHtml.replace(/<script src="\/libs\/jspdf\.umd\.min\.js"><\/script>/, '<script defer src="/libs/jspdf.umd.min.js"></script>');
indexHtml = indexHtml.replace(/<script src="\/libs\/jspdf\.plugin\.autotable\.min\.js"><\/script>/, '<script defer src="/libs/jspdf.plugin.autotable.min.js"></script>');
indexHtml = indexHtml.replace(/<script src="\/libs\/qrcode\.min\.js"><\/script>/, '<script defer src="/libs/qrcode.min.js"></script>');
indexHtml = indexHtml.replace(/<script src="\/libs\/html5-qrcode\.min\.js"><\/script>/, '<script defer src="/libs/html5-qrcode.min.js"></script>');
indexHtml = indexHtml.replace(/<script src="\/libs\/chart\.min\.js"><\/script>/, '<script defer src="/libs/chart.min.js"></script>');
indexHtml = indexHtml.replace(/<script src="\/libs\/chartjs-plugin-datalabels\.min\.js"><\/script>/, '<script defer src="/libs/chartjs-plugin-datalabels.min.js"></script>');
indexHtml = indexHtml.replace(/<script src="\/libs\/leaflet\.js"><\/script>/, '<script defer src="/libs/leaflet.js"></script>');
indexHtml = indexHtml.replace(/<script src="\/libs\/bootstrap\.bundle\.min\.js"><\/script>/, '<script defer src="/libs/bootstrap.bundle.min.js"></script>');

// For the main app logic scripts, we also want them to defer so they execute after the libraries
indexHtml = indexHtml.replace(/<script src="\/modulos\/sistema\/configuracion\/i18n\.js"><\/script>/, '<script defer src="/modulos/sistema/configuracion/i18n.js"></script>');
indexHtml = indexHtml.replace(/<script src="\.\/utils\.js"><\/script>/, '<script defer src="./utils.js"></script>');
indexHtml = indexHtml.replace(/<script src="\.\/logica\.js"><\/script>/, '<script defer src="./logica.js"></script>');

fs.writeFileSync(fileIndex, indexHtml, 'utf8');
console.log('Added defer to scripts to fix render blocking.');
