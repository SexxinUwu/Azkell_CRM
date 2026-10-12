const fs = require('fs');
const path = require('path');

const vistaHtmlPath = path.join(__dirname, 'modulos/sistema/auditoria/vista.html');
let vistaHtml = fs.readFileSync(vistaHtmlPath, 'utf8');

// Modificar CSS para el estilo Timeline
const timelineCSS = `/* Estilos de Timeline */
.audit-feed { flex:1 1 0; overflow-y:auto; padding:20px 20px 60px; position:relative; }
.audit-feed::before { content:''; position:absolute; top:20px; bottom:20px; left:48px; width:2px; background:var(--border); z-index:0; }
.audit-msg { display:flex; gap:20px; padding:0 0 24px; align-items:flex-start; position:relative; z-index:1; }
.audit-avatar { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:700; color:#fff; flex-shrink:0; border:4px solid var(--bg); box-shadow:0 0 0 1px var(--border); margin-left:14px; position:relative; z-index:2; }
.audit-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px; background:var(--surface); padding:10px 14px; border-radius:12px; border:1px solid var(--border); width:100%; }
.audit-detail { background:transparent; padding:0 14px; font-size:0.82rem; color:var(--text); word-break:break-word; border-left:2px solid var(--border); margin-left:14px; opacity:0.85; }
.audit-content-wrapper { flex:1; min-width:0; }
.audit-day-sep { display:inline-block; padding:6px 16px; background:var(--surface); border:1px solid var(--border); border-radius:20px; font-size:0.72rem; font-weight:bold; color:var(--text); position:relative; z-index:2; margin-left:0px; margin-bottom:20px; box-shadow:0 2px 5px rgba(0,0,0,0.05); text-transform:uppercase; letter-spacing:1px; }
`;

// Inyectar el nuevo CSS reemplazando el anterior desde .audit-feed
vistaHtml = vistaHtml.replace(/\.audit-feed \{ flex:1 1 0;.*?\n\}/s, '');
vistaHtml = vistaHtml.replace(/\.audit-day-sep \{.*?\n\}/s, '');
vistaHtml = vistaHtml.replace(/\.audit-day-sep::before, \.audit-day-sep::after \{.*?\n\}/s, '');
vistaHtml = vistaHtml.replace(/\.audit-day-sep::before \{.*?\n\}/s, '');
vistaHtml = vistaHtml.replace(/\.audit-msg \{.*?\n\}/s, '');
vistaHtml = vistaHtml.replace(/\.audit-msg:hover \{.*?\n\}/s, '');
vistaHtml = vistaHtml.replace(/\.audit-avatar \{.*?\n\}/s, '');
vistaHtml = vistaHtml.replace(/\.audit-meta \{.*?\n\}/s, '');
vistaHtml = vistaHtml.replace(/\.audit-detail \{.*?\n\}/s, '');

vistaHtml = vistaHtml.replace('</style>', timelineCSS + '\n</style>');

fs.writeFileSync(vistaHtmlPath, vistaHtml);

const logicaJsPath = path.join(__dirname, 'modulos/sistema/auditoria/logica.js');
let logicaJs = fs.readFileSync(logicaJsPath, 'utf8');

// Modificar renderAuditFeed en logica.js
logicaJs = logicaJs.replace(/html \+\= '<div class="audit-msg"'(.*?) \+ '<\/div><\/div>';/gs, (match) => {
    return `html += '<div class="audit-msg">'
            + '<div class="audit-avatar" style="background:' + color + ';" title="' + (r.usuario||'') + '">' + initials + '</div>'
            + '<div class="audit-content-wrapper">'
            + '<div class="audit-meta">'
            + '<span class="audit-name">' + (r.usuario || 'Sistema') + '</span>'
            + '<span class="' + badgeClass + ' audit-badge">' + r.accion + '</span>'
            + '<span class="audit-badge" style="background:' + modBg + ';color:#fff;">' + (r.modulo || 'General').toUpperCase() + '</span>'
            + '<span class="audit-time ms-auto">' + _timeLabel(r.fecha) + '</span>'
            + '</div>'
            + '<div class="audit-detail">' + (r.detalle || '-') + '</div>'
            + '</div></div>';`;
});

fs.writeFileSync(logicaJsPath, logicaJs);
console.log('Auditoria timeline styling applied.');
