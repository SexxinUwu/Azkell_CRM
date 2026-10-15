// Textos legales de Azkell Fleet. BORRADOR: todo lo que va entre [COMPLETAR: …] es un dato que
// hay que confirmar o escribir antes de publicar. Se redactó a partir de lo que la app hace hoy
// (ver docs/legal-inventario.md). Debe revisarlo un abogado en Perú antes de usarse con clientes.

export interface Seccion {
  titulo: string;
  parrafos?: string[];
  lista?: string[];
}

export interface Documento {
  id: 'privacidad' | 'terminos' | 'cookies' | 'reembolsos';
  titulo: string;
  resumen: string;
  secciones: Seccion[];
}

export const FECHA_VIGENCIA = '[COMPLETAR: fecha de publicación]';

export const DOCUMENTOS: Documento[] = [
  {
    id: 'privacidad',
    titulo: 'Política de privacidad',
    resumen: 'Qué datos personales trata Azkell Fleet, para qué, con quién se comparten y cómo ejercer tus derechos.',
    secciones: [
      {
        titulo: '1. Quién trata tus datos',
        parrafos: [
          'La empresa que contrata Azkell Fleet es la responsable de los datos de sus trabajadores, conductores, unidades y clientes. Azkell actúa como encargado: opera el software por cuenta de esa empresa.',
          'Responsable: [COMPLETAR: razón social y RUC de la empresa cliente]. Encargado: [COMPLETAR: razón social y RUC de Azkell].',
          'Domicilio: [COMPLETAR: domicilio fiscal]. Correo para tus derechos: [COMPLETAR: correo de contacto]. Inscripción del banco de datos en el Registro Nacional de Protección de Datos Personales: [COMPLETAR: código, o indicar que no aplica].',
        ],
      },
      {
        titulo: '2. Qué datos se tratan',
        lista: [
          'Identificación y contacto de usuarios y personal: nombre, DNI, correo, teléfono, cargo, rol y firma digital.',
          'Datos de conductores y unidades: placas, documentos de la unidad, inspecciones, reportes de falla, fotos y firmas en actas de entrega y garita.',
          'Ubicación de las unidades (GPS). Puede identificar al conductor que la maneja.',
          'Datos de acceso y seguridad: fecha y hora de inicio de sesión, dirección IP y dispositivo, sesiones activas y el registro de auditoría de cambios (firmado).',
          'Datos de negocio que pueden incluir datos personales: órdenes de servicio, guías de remisión, vales de combustible, pagos y liquidaciones.',
        ],
      },
      {
        titulo: '3. Para qué se usan',
        lista: [
          'Operar la gestión de flota, mantenimiento, almacén, operaciones, tesorería, personal y seguridad de la empresa cliente.',
          'Controlar el acceso, proteger las cuentas y mantener la trazabilidad de los cambios.',
          'Cumplir obligaciones legales, como la emisión de guías y comprobantes electrónicos ante SUNAT.',
        ],
      },
      {
        titulo: '4. Base legal',
        parrafos: [
          'El tratamiento se basa en la relación laboral o contractual con la empresa cliente, en obligaciones legales y, cuando corresponda, en el consentimiento de la persona. [COMPLETAR: confirmar la base legal para cada tipo de dato, con abogado].',
        ],
      },
      {
        titulo: '5. Con quién se comparten',
        parrafos: [
          'Solo con proveedores que el sistema necesita para funcionar. Cada uno trata los datos para su servicio:',
        ],
        lista: [
          'Amazon Web Services: almacenamiento de fotos, documentos y firmas.',
          'Wialon: datos de GPS de las unidades.',
          'SUNAT: envío de guías y comprobantes electrónicos.',
          'APISPERU: consulta de DNI y RUC. La consulta se hace desde nuestro servidor.',
          'WhatsApp (proveedor de la integración): envío de avisos de aprobación y notificaciones.',
          'MarsisaSoft: sincronización de vales de combustible y órdenes de viaje, cuando la empresa la activa.',
          'Have I Been Pwned (k-anonymity): verifica si una contraseña nueva aparece en filtraciones. No se envía la contraseña completa.',
          'Google: tipografías, mapas y el asistente de IA. [COMPLETAR: confirmar si al asistente se envían datos personales].',
          'Open-Meteo: datos de clima. No se envían datos personales. [COMPLETAR: confirmar la licencia de uso comercial].',
        ],
      },
      {
        titulo: '6. Transferencias fuera del Perú',
        parrafos: [
          'Algunos proveedores pueden almacenar o procesar datos fuera del Perú. [COMPLETAR: región de almacenamiento y garantías contractuales con cada proveedor].',
        ],
      },
      {
        titulo: '7. Cuánto tiempo se conservan',
        parrafos: ['[COMPLETAR: plazo de conservación por tipo de dato, y qué ocurre al terminar el contrato].'],
      },
      {
        titulo: '8. Cómo proteger tus datos',
        lista: [
          'Conexión cifrada (HTTPS) con cabeceras de seguridad (HSTS y protección contra incrustación en otros sitios).',
          'Contraseñas guardadas con hash bcrypt; nunca en texto plano.',
          'Sesión en una cookie HttpOnly que el navegador no expone a scripts.',
          'Verificación en dos pasos (código TOTP) para cuentas de administración y gerencia.',
          'Límite de intentos de inicio de sesión y de peticiones por minuto.',
          'Registro de auditoría con firma HMAC para detectar cambios no autorizados.',
        ],
      },
      {
        titulo: '9. Tus derechos',
        parrafos: [
          'Puedes pedir acceso, rectificación, cancelación u oposición al tratamiento de tus datos (derechos ARCO), y revocar el consentimiento cuando corresponda. Escribe a [COMPLETAR: correo de contacto]. Si la empresa cliente es la responsable, la solicitud se atiende con ella.',
          'Si no recibes respuesta, puedes presentar un reclamo ante la Autoridad Nacional de Protección de Datos Personales (Ministerio de Justicia y Derechos Humanos).',
        ],
      },
      {
        titulo: '10. Cambios en esta política',
        parrafos: [`Cuando cambie esta política lo indicaremos aquí con la nueva fecha de vigencia (${FECHA_VIGENCIA}).`],
      },
    ],
  },
  {
    id: 'terminos',
    titulo: 'Términos y condiciones',
    resumen: 'Condiciones de uso de Azkell Fleet para las empresas clientes y sus usuarios.',
    secciones: [
      {
        titulo: '1. Qué es Azkell Fleet',
        parrafos: [
          'Azkell Fleet es un sistema de gestión (ERP) para flotas de transporte. Se usa con cuentas creadas por el administrador de sistemas de cada empresa cliente. No hay registro público: nadie puede crear una cuenta por su cuenta.',
        ],
      },
      {
        titulo: '2. Cuentas y acceso',
        lista: [
          'Cada usuario tiene credenciales personales. No las compartas ni las dejes en equipos de uso público.',
          'La empresa cliente decide quién tiene acceso y con qué permisos, y es responsable de darlos de baja cuando corresponda.',
          'Si sospechas de un uso indebido de tu cuenta, avisa al administrador de sistemas de inmediato.',
        ],
      },
      {
        titulo: '3. Uso permitido',
        parrafos: [
          'El sistema se usa solo para la operación de la empresa cliente. Está prohibido intentar vulnerarlo, extraer datos de forma masiva sin autorización, o usarlo para fines ajenos a la empresa.',
        ],
      },
      {
        titulo: '4. Disponibilidad del servicio',
        parrafos: [
          'Trabajamos para mantener el servicio disponible, pero no garantizamos que funcione sin interrupciones. Pueden existir mantenimientos y fallas de proveedores externos (GPS, SUNAT, WhatsApp, almacenamiento). [COMPLETAR: compromiso de disponibilidad, si existe en el contrato].',
        ],
      },
      {
        titulo: '5. Servicios de terceros',
        parrafos: [
          'Las integraciones (GPS, SUNAT, WhatsApp, MarsisaSoft, mapas) se rigen también por los términos de cada proveedor. Azkell no controla los servicios de terceros.',
        ],
      },
      {
        titulo: '6. Propiedad intelectual',
        parrafos: [
          'El software, su diseño y la marca Azkell Fleet pertenecen a Azkell. [COMPLETAR: titular de la marca y registro, si existe]. Los datos que la empresa cargue en el sistema pertenecen a esa empresa.',
        ],
      },
      {
        titulo: '7. Responsabilidad',
        parrafos: [
          'Azkell responde por los daños directos que cause por incumplimiento de estas condiciones, dentro de los límites que permite la ley peruana. [COMPLETAR: límite de responsabilidad, revisado con abogado].',
        ],
      },
      {
        titulo: '8. Cambios, ley aplicable y jurisdicción',
        parrafos: [
          'Podemos actualizar estas condiciones; lo avisaremos en el sistema. Estas condiciones se rigen por las leyes de la República del Perú. Para controversias, las partes se someten a [COMPLETAR: jurisdicción].',
        ],
      },
      {
        titulo: '9. Contacto',
        parrafos: ['[COMPLETAR: correo y domicilio de contacto]. Vigencia: ' + FECHA_VIGENCIA + '.'],
      },
    ],
  },
  {
    id: 'cookies',
    titulo: 'Política de cookies',
    resumen: 'Qué guarda Azkell Fleet en tu navegador, para qué sirve y cuánto dura.',
    secciones: [
      {
        titulo: 'Cookies',
        lista: [
          'azkell_session: mantiene tu sesión iniciada. Es HttpOnly (los scripts no pueden leerla), dura 12 horas y se borra al cerrar sesión. Es necesaria para usar el sistema.',
        ],
      },
      {
        titulo: 'Almacenamiento local del navegador',
        lista: [
          'fleet_sesion: indica que hay una sesión activa en este equipo. Es necesario.',
          'Preferencias de apariencia (tema, color, tamaño de texto y filtros de cada pantalla): se guardan hasta que las cambies o borres los datos del sitio.',
          'azkell_saved_email: tu correo, solo si eliges recordarlo al iniciar sesión.',
          'azkell.perfil.* y azkell.foto.*: copia de tu perfil y de tu foto para mostrarlos al instante. Se actualiza cuando cambias tu foto o tus datos.',
          'Sesión de pestaña (sessionStorage): recuerda la pantalla en la que estabas y se borra al cerrar la pestaña.',
        ],
      },
      {
        titulo: 'Qué no usamos',
        parrafos: [
          'No usamos cookies de publicidad, ni herramientas de analítica o seguimiento de visitas, ni píxeles de redes sociales. Si en el futuro agregáramos alguna, pediremos tu consentimiento antes de activarla.',
        ],
      },
      {
        titulo: 'Consentimiento',
        parrafos: [
          'Las cookies y el almacenamiento descritos son técnicamente necesarios para iniciar sesión y mantener las preferencias, por eso no se muestra un aviso de consentimiento. [COMPLETAR: confirmar con abogado que este criterio aplica].',
        ],
      },
      {
        titulo: 'Cómo borrarlas',
        parrafos: [
          'Puedes borrar los datos del sitio desde la configuración de tu navegador. Si cierras sesión, la cookie de sesión se elimina. Si borras el almacenamiento, perderás las preferencias y la copia local de tu foto.',
        ],
      },
    ],
  },
  {
    id: 'reembolsos',
    titulo: 'Política de reembolsos y cancelación',
    resumen: 'Cómo se cancela el servicio y cuándo corresponde devolver dinero.',
    secciones: [
      {
        titulo: '1. Alcance',
        parrafos: [
          'Esta política aplica a las empresas que contratan Azkell Fleet. [COMPLETAR: si el servicio se vende también a consumidores finales; en ese caso, aplican además las obligaciones del Código de Protección y Defensa del Consumidor (Ley 29571), incluido el Libro de Reclamaciones].',
        ],
      },
      {
        titulo: '2. Cobro',
        parrafos: [
          '[COMPLETAR: modalidad de cobro (mensual, anual, por usuario o por unidad), moneda y forma de pago.]',
        ],
      },
      {
        titulo: '3. Cancelación',
        parrafos: [
          '[COMPLETAR: cómo se solicita la cancelación, con cuánta anticipación y desde cuándo deja de cobrarse.]',
        ],
      },
      {
        titulo: '4. Reembolsos',
        parrafos: [
          '[COMPLETAR: condiciones del reembolso, plazo para solicitarlo y plazo de devolución.]',
          'Los servicios ya prestados o los periodos ya iniciados no se reembolsan, salvo que la ley o el contrato establezcan otra cosa. [COMPLETAR: confirmar con abogado.]',
        ],
      },
      {
        titulo: '5. Cómo pedir un reembolso',
        parrafos: ['Escribe a [COMPLETAR: correo de contacto] con los datos de la empresa y el comprobante de pago.'],
      },
    ],
  },
];

export const DOCUMENTO_POR_ID = Object.fromEntries(DOCUMENTOS.map(d => [d.id, d])) as Record<Documento['id'], Documento>;
