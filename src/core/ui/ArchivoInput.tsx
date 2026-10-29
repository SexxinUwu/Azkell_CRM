import './archivo-input.css';
import { useRef, useState } from 'react';
import { X } from 'lucide-react';

interface ArchivoInputProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  accept?: string;
  /** Cámara trasera en el teléfono */
  capture?: 'environment';
  multiple?: boolean;
  disabled?: boolean;
  /** Texto cuando no hay archivo */
  vacio?: string;
  /** Recibe el archivo elegido, o null cuando se quita */
  onChange: (archivo: File | null) => void;
}

/** Selector de archivo con el mismo diseño en todo el sistema: botón, nombre del archivo en rojo y X para quitarlo. */
export function ArchivoInput({ id, accept, capture, multiple, disabled, vacio = 'Ningún archivo seleccionado', onChange, ...aria }: ArchivoInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState<string | null>(null);

  function elegir(archivo: File | undefined) {
    // Se limpia el input nativo para poder volver a elegir el mismo archivo; quien lo usa ya tiene la referencia
    if (input.current) input.current.value = '';
    setNombre(archivo?.name ?? null);
    onChange(archivo ?? null);
  }

  function quitar() {
    if (input.current) input.current.value = '';
    setNombre(null);
    onChange(null);
  }

  return (
    <div className={`archivo-input${disabled ? ' archivo-input--off' : ''}`}>
      <label className="archivo-input__boton" htmlFor={id}>
        Seleccionar archivo
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        disabled={disabled}
        className="archivo-input__nativo"
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        onChange={e => elegir(e.target.files?.[0])}
      />
      {nombre ? (
        <span className="archivo-input__elegido">
          <span className="archivo-input__nombre">{nombre}</span>
          <button type="button" className="archivo-input__quitar" aria-label="Quitar archivo" title="Quitar archivo" onClick={quitar} disabled={disabled}>
            <X size={14} strokeWidth={2.4} />
          </button>
        </span>
      ) : (
        <span className="archivo-input__vacio">{vacio}</span>
      )}
    </div>
  );
}
