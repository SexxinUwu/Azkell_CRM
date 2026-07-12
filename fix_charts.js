const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// Replace the chart options for familia
const regexFam = /var famLabels = famKeys\.slice\(0,6\);[\s\S]*?cutout: '70%'\s*\}/;

const replacementFam = `var famLabels = famKeys.slice(0,6);
            var famData = famLabels.map(function(k){ return familiaValor[k]; });
            var famLabelsFull = famLabels.map(function(k, i){ return k + ' (' + fmtM(famData[i]) + ')'; });
            
            var ctxFam = document.getElementById('fin-chart-familia');
            if (ctxFam) {
                window.finChartFamilia = new Chart(ctxFam, {
                    type: 'doughnut',
                    data: {
                        labels: famLabelsFull,
                        datasets: [{
                            data: famData,
                            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#94a3b8'],
                            borderWidth: 0,
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { 
                            legend: { position: 'right', labels: { font: { family: 'Inter', size: 11 } } },
                            tooltip: { callbacks: { label: function(c) { return ' ' + fmtM(c.raw); } } },
                            datalabels: {
                                color: '#fff',
                                font: { weight: 'bold' },
                                formatter: function(value, context) {
                                    var sum = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    if (sum === 0) return '0%';
                                    var percentage = (value * 100 / sum).toFixed(1) + '%';
                                    return percentage;
                                }
                            }
                        },
                        cutout: '70%'
                    }`;

js = js.replace(regexFam, replacementFam);

// Also fix the bar chart datalabels just in case they render as raw floats
const regexCons = /labels: consLabels\.map\(function\(l\)\{ return l\.length > 15 \? l\.substring\(0,15\)\+'\.\.\.' : l; \}\),[\s\S]*?x: \{ grid: \{ display: false \} \}\s*\}/;

const replacementCons = `labels: consLabels.map(function(l){ return l.length > 15 ? l.substring(0,15)+'...' : l; }),
                            datasets: [{
                                label: 'Gasto Consumo (S/)',
                                data: consData,
                                backgroundColor: '#6366f1',
                                borderRadius: 6
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: { 
                                legend: { display: false },
                                tooltip: { callbacks: { label: function(c) { return ' ' + fmtM(c.raw); } } },
                                datalabels: {
                                    align: 'end',
                                    anchor: 'end',
                                    color: '#6366f1',
                                    font: { size: 10, weight: 'bold' },
                                    formatter: function(value) {
                                        return fmtM(value);
                                    }
                                }
                            },
                            scales: {
                                y: { beginAtZero: true, grid: { borderDash: [2,4] }, suggestedMax: Math.max(...consData) * 1.2 },
                                x: { grid: { display: false } }
                            }`;

js = js.replace(regexCons, replacementCons);

fs.writeFileSync(fileJs, js, 'utf8');
console.log('Chart formats updated successfully.');
