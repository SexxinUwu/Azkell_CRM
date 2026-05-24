const fs = require('fs');
const path = require('path');

function fixRouter(file) {
    if (!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/app\.(get|post|put|delete)\('\/api\//g, "router.$1('/");
    fs.writeFileSync(file, code);
}

const dir = path.join(__dirname, 'routes');
const files = fs.readdirSync(dir);
files.forEach(f => {
    if (f.endsWith('.js')) {
        fixRouter(path.join(dir, f));
    }
});
