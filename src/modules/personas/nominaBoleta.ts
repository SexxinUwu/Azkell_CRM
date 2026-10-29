// Boleta de pago de remuneraciones: se imprime en una ventana aparte (sin el menú de la app),
// con el mismo formato y campos que la boleta de la versión actual (modulos/rrhh/nomina).
import { formatSoles } from '../../core/lib/format';

export interface BoletaDatos {
  nombre_completo: string; documento: string; cargo: string; rol: string; regimen_pensionario: string;
  dias_trabajados: number; faltas: number; minutos_tardanza: number;
  sueldo_basico: number; asignacion_familiar: number; bono_fijo: number; horas_extras_importe: number; total_ingresos: number;
  descuento_pension: number; descuento_faltas: number; descuento_tardanzas: number; total_descuentos: number;
  neto_pagar: number; banco: string; cuenta: string;
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const s = (v: unknown) => formatSoles(Number(v) || 0);

const ESTILO = `
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:12mm}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1d1d1f;background:#f5f5f7;
       -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .barra{display:flex;justify-content:center;padding:20px}
  .barra button{font:600 15px system-ui;padding:12px 22px;border-radius:999px;border:0;background:#1d1d1f;color:#fff;cursor:pointer}
  .hoja{background:#fff;max-width:760px;margin:0 auto;border:1px solid #d2d2d7;border-radius:12px;padding:28px 32px}
  .cab{text-align:center;border-bottom:1px solid #d2d2d7;padding-bottom:12px;margin-bottom:14px}
  .cab h1{font-size:15px;font-weight:700;letter-spacing:.02em}
  .cab small{display:block;color:#6e6e73;font-size:11px;font-weight:600;margin-top:2px}
  .periodo{font-weight:700;color:#0a4fb3;margin-top:6px}
  .datos{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;font-size:12px;padding-bottom:12px;border-bottom:1px solid #d2d2d7;margin-bottom:14px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:14px}
  .cols h2{font-size:12px;font-weight:700;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #d2d2d7}
  .cols table{width:100%;border-collapse:collapse;font-size:12px}
  .cols td{padding:4px 0}
  .cols td:last-child{text-align:right;font-variant-numeric:tabular-nums}
  .cols tr.total td{font-weight:700;border-top:1px solid #d2d2d7}
  .neto{display:flex;justify-content:space-between;align-items:center;background:#f5f5f7;border:1px solid #d2d2d7;border-radius:10px;padding:14px 16px;margin-bottom:44px}
  .neto small{display:block;color:#6e6e73;font-size:11px;margin-top:2px}
  .neto strong{font-size:20px;font-variant-numeric:tabular-nums}
  .firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;font-size:11px;text-align:center}
  .firmas div{border-top:1px solid #1d1d1f;padding-top:4px}
  @media print{body{background:#fff}.barra{display:none}.hoja{border:none;border-radius:0;padding:0;max-width:none;margin:0}}
`;

/**
 * Abre la boleta en una ventana nueva y lanza la impresión desde su botón.
 * Devuelve false si el navegador bloquea la ventana.
 */
export function imprimirBoleta(f: BoletaDatos, periodo: string): boolean {
  const w = window.open('', '_blank', 'width=900,height=760');
  if (!w) return false;

  const fila = (etiqueta: string, valor: number, clase = '') => `<tr class="${clase}"><td>${etiqueta}</td><td>${s(valor)}</td></tr>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Boleta ${esc(f.nombre_completo)} ${esc(periodo)}</title>
<style>${ESTILO}</style></head><body>
<div class="barra"><button type="button" id="btn-imprimir">Imprimir boleta</button></div>
<div class="hoja">
  <div class="cab">
    <h1>BOLETA DE PAGO DE REMUNERACIONES</h1>
    <small>D.S. N° 001-98-TR / LEY DE PRODUCTIVIDAD Y COMPETITIVIDAD LABORAL</small>
    <div class="periodo">PERIODO: ${esc(periodo)}</div>
  </div>
  <div class="datos">
    <div><b>TRABAJADOR:</b> ${esc(f.nombre_completo)}</div>
    <div><b>DNI / DOC:</b> ${esc(f.documento)}</div>
    <div><b>CARGO / ROL:</b> ${esc(f.cargo)} (${esc(f.rol)})</div>
    <div><b>RÉGIMEN PENSIÓN:</b> ${esc(f.regimen_pensionario)}</div>
    <div><b>DÍAS LABORADOS:</b> ${esc(f.dias_trabajados)} días</div>
    <div><b>FALTAS / TARDANZAS:</b> ${esc(f.faltas)} días / ${esc(f.minutos_tardanza)} min</div>
  </div>
  <div class="cols">
    <div>
      <h2>INGRESOS DEL TRABAJADOR</h2>
      <table>
        ${fila('Sueldo Básico', f.sueldo_basico)}
        ${fila('Asignación Familiar', f.asignacion_familiar)}
        ${fila('Bono / Movilidad', f.bono_fijo)}
        ${fila('Horas Extras', f.horas_extras_importe)}
        ${fila('TOTAL INGRESOS', f.total_ingresos, 'total')}
      </table>
    </div>
    <div>
      <h2>DESCUENTOS AL TRABAJADOR</h2>
      <table>
        ${fila(`Aporte Pensión (${esc(f.regimen_pensionario)})`, f.descuento_pension)}
        ${fila('Descuento Faltas', f.descuento_faltas)}
        ${fila('Descuento Tardanzas', f.descuento_tardanzas)}
        ${fila('TOTAL DESCUENTOS', f.total_descuentos, 'total')}
      </table>
    </div>
  </div>
  <div class="neto">
    <div>
      <strong style="font-size:13px">NETO A PAGAR</strong>
      <small>Abono en: ${esc(f.banco)} — ${esc(f.cuenta)}</small>
    </div>
    <strong>${s(f.neto_pagar)}</strong>
  </div>
  <div class="firmas">
    <div>EMPLEADOR / RRHH</div>
    <div>FIRMA DEL TRABAJADOR</div>
  </div>
</div>
</body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.getElementById('btn-imprimir')?.addEventListener('click', () => w.print());
  w.focus();
  return true;
}
