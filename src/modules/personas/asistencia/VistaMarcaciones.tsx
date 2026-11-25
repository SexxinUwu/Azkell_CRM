import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogIn, LogOut, PenLine, QrCode } from 'lucide-react';
import { PageLoader } from '../../../core/ui/Button';
import { BotonTip } from '../../../core/ui/BotonTip';
import { Notice } from '../../../core/ui/Display';
import { SearchField } from '../../../core/ui/Field';
import { api, errorMessage } from '../../../core/api/client';
import { diaLargo } from './datos';
import { Indicador, NavDia } from './Piezas';

interface FilaMarca { id: number; tipo: 'INGRESO' | 'SALIDA'; hora: string; fecha: string; origen: string; observacion: string | null; usuario_registro: string | null; nombres: string; apellidos: string; cargo: string | null }

/** Marcaciones: cada lectura del QR (o registro manual) del día, con su hora, tipo y quién la hizo */
export function VistaMarcaciones({ fecha, onFecha, hoy, puedeMarcar }: { fecha: string; onFecha: (f: string) => void; hoy: string; puedeMarcar: boolean }) {
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const q = useQuery<{ marcaciones: FilaMarca[] }>({
    queryKey: ['rrhh', 'marcaciones', fecha],
    queryFn: () => api<{ marcaciones: FilaMarca[] }>(`/rrhh/marcaciones?fecha=${fecha}`),
    refetchInterval: fecha === hoy ? 20_000 : false,
  });
  const todas = q.data?.marcaciones ?? [];
  const filas = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return todas.filter(f => !t || `${f.apellidos} ${f.nombres} ${f.cargo ?? ''}`.toUpperCase().includes(t));
  }, [todas, busqueda]);
  const ingresos = todas.filter(f => f.tipo === 'INGRESO').length;
  const salidas = todas.filter(f => f.tipo === 'SALIDA').length;
  const manuales = todas.filter(f => f.origen === 'MANUAL').length;

  return (
    <div className="asis-vista">
      <div className="asis-barra">
        <NavDia fecha={fecha} onChange={onFecha} hoy={hoy} />
        <span className="asis-barra__dia t-footnote c-secondary">{diaLargo(fecha)}</span>
        <div className="asis-barra__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre o cargo…" /></div>
        {puedeMarcar && <BotonTip tip="Abrir la marcación por QR" className="btn btn--plain btn--icono btn--icono-acento" onClick={() => navigate('/personas/marcacion')}><QrCode size={18} /></BotonTip>}
      </div>

      <div className="asis-inds">
        <Indicador etiqueta="Ingresos" valor={String(ingresos)} tono="ok" icono={<LogIn size={18} />} />
        <Indicador etiqueta="Salidas" valor={String(salidas)} tono="info" icono={<LogOut size={18} />} />
        <Indicador etiqueta="Sin salida" valor={String(Math.max(0, ingresos - salidas))} tono={ingresos - salidas > 0 ? 'med' : 'ok'} icono={<LogOut size={18} />} nota="Siguen dentro o no marcaron" />
        <Indicador etiqueta="Registros manuales" valor={String(manuales)} tono={manuales ? 'med' : ''} icono={<PenLine size={18} />} nota="Con motivo" />
      </div>

      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : filas.length === 0 ? (
        <Notice tone="neutral">{todas.length ? 'Nadie coincide con la búsqueda.' : 'No hay marcaciones este día.'}</Notice>
      ) : (
        <div className="asis-lista asis-lista--marc" role="table" aria-label="Marcaciones del día">
          <div className="asis-lista__cab" role="row">
            <span role="columnheader">Hora</span><span role="columnheader">Tipo</span><span role="columnheader">Colaborador</span><span role="columnheader">Origen</span><span role="columnheader">Detalle</span>
          </div>
          {filas.map(f => (
            <div key={f.id} className="asis-lista__fila" role="row">
              <span className="t-numeric asis-lista__hora" role="cell">{f.hora}</span>
              <span role="cell"><span className={`marc-chip marc-chip--${f.tipo === 'INGRESO' ? 'in' : 'out'}`}>{f.tipo === 'INGRESO' ? 'Ingreso' : 'Salida'}</span></span>
              <span className="asis-lista__quien" role="cell"><strong>{f.apellidos}, {f.nombres}</strong><small>{f.cargo ?? ''}</small></span>
              <span role="cell"><span className={`asis-origen asis-origen--${f.origen === 'MANUAL' ? 'manual' : 'qr'}`}>{f.origen === 'MANUAL' ? 'Manual' : 'QR'}</span></span>
              <span className="asis-lista__detalle" role="cell">{f.origen === 'MANUAL' ? `${f.observacion ?? ''}${f.usuario_registro ? ` · ${f.usuario_registro}` : ''}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
