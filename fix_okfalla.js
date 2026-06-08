const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/mantenimiento/inspecciones/logica.js';
let content = fs.readFileSync(path, 'utf8');

const regex = /if\s*\(\s*t\s*===\s*'okfalla'\s*\)\s*\{\s*if\s*\(\s*val\s*&&\s*val\.value\s*\)\s*estado\s*=\s*val\.value\s*\+\s*"%";\s*\}\s*else\s*if\s*\(\s*t\s*===\s*'text'\s*\)/g;

const replacement = `if (t === 'okfalla') {
                    let ok = document.getElementById(\`\${uid}_ok\`);
                    let fa = document.getElementById(\`\${uid}_fa\`);
                    if (ok && ok.dataset.chk === '1') estado = "OK";
                    if (fa && fa.dataset.chk === '1') {
                        estado = "FALLA";
                        let obsEl = document.getElementById(\`obs_\${uid}\`);
                        if (obsEl) obs = obsEl.value;
                        let inputFoto = document.getElementById(\`foto_\${uid}\`);
                        if (inputFoto && inputFoto.files && inputFoto.files.length > 0) {
                            try {
                                let file = inputFoto.files[0];
                                let resUpload = await fetch('/api/mantenimiento/inspecciones/upload-url', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ idInsp: idInsp, fileName: file.name, fileType: file.type })
                                }).then(r => r.json());
                                
                                if (resUpload.ok && resUpload.uploadUrl) {
                                    await fetch(resUpload.uploadUrl, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': file.type },
                                        body: file
                                    });
                                    fotoEvidencia = resUpload.finalUrl;
                                } else {
                                    fotoEvidencia = await fileToBase64(file); // fallback
                                }
                            } catch (e) { 
                                console.log("Error subiendo foto a S3, usando fallback", e);
                                fotoEvidencia = await fileToBase64(inputFoto.files[0]);
                            }
                        }
                    }
                } else if (t === 'percent') {
                    let val = document.getElementById(\`val_\${uid}\`);
                    if (val && val.value) estado = val.value + "%";
                } else if (t === 'text')`;

content = content.replace(regex, replacement);
fs.writeFileSync(path, content, 'utf8');
console.log("Fixed successfully!");
