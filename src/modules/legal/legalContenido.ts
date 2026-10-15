// Textos legales de Azkell Fleet. BORRADOR: todo lo que va entre [COMPLETAR: …] es un dato que
// hay que confirmar o escribir antes de publicar. Se redactó a partir de lo que la app hace hoy
// (ver docs/legal-inventario.md). Debe revisarlo un abogado en Perú antes de usarse con clientes.
//
// Modelo: Azkell Fleet es un software de pago por empresa. Cada empresa cliente (por ejemplo, MARSISA S.A.C.)
// es la responsable de sus datos y Azkell actúa como encargado del tratamiento. No hay cobros dentro del sistema.

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
    resumen: 'Qué datos personales se tratan en Azkell Fleet, para qué, con quién se comparten y cómo ejercer tus derechos.',
    secciones: [
      {
        titulo: '1. Quién es responsable de tus datos',
        parrafos: [
          'Azkell Fleet es un software de gestión de flotas que cada empresa contrata para su propia operación. Por eso hay dos roles:',
        ],
        lista: [
          'Responsable: la empresa cliente que usa el sistema (por ejemplo, [COMPLETAR: razón social y RUC del cliente]). Decide para qué se usan sus datos y quién los ve.',
          'Encargado: Azkell ([COMPLETAR: razón social y RUC de Azkell]), que opera el software y guarda los datos por cuenta de cada empresa cliente.',
        ],
      },
      {
        titulo: '2. Dónde ejercer tus derechos',
        parrafos: [
          'Si tus datos están en el sistema de una empresa cliente (por ejemplo, si eres trabajador o conductor de esa empresa), presenta tu solicitud a esa empresa. Ella responde por el tratamiento. Si no sabes a quién escribir o la empresa no responde, escríbenos a [COMPLETAR: correo de contacto de Azkell] y te orientamos.',
          'Domicilio de Azkell: [COMPLETAR: domicilio fiscal registrado en SUNAT].',
        ],
      },
      {
        titulo: '3. Inscripción de bancos de datos',
        parrafos: [
          'Según la Ley 29733, cada empresa cliente debe inscribir en el Registro Nacional de Protección de Datos Personales el banco de datos donde guarda sus datos, e indicar a Azkell como encargado. Azkell inscribe los bancos de datos que son propios (por ejemplo, los contactos comerciales). Código de inscripción de los bancos de Azkell: [COMPLETAR: código, o indicar que está en trámite].',
        ],
      },
      {
        titulo: '4. Qué datos se tratan',
        lista: [
          'Identificación y contacto de usuarios y personal: nombre, DNI, correo, teléfono, cargo, rol y firma digital.',
          'Datos de conductores y unidades: placas, documentos de la unidad, inspecciones, reportes de falla, fotos y firmas en actas de entrega y garita.',
          'Ubicación de las unidades (GPS). Puede identificar al conductor que la maneja.',
          'Datos de acceso y seguridad: fecha y hora de inicio de sesión, dirección IP, dispositivo, sesiones activas y el registro de auditoría de cambios.',
          'Datos de negocio que pueden incluir datos personales: órdenes de servicio, guías de remisión, vales de combustible, pagos, liquidaciones y asistencia.',
          'Texto que escribes en el asistente de ayuda y el historial de esa conversación.',
        ],
      },
      {
        titulo: '5. Para qué se usan',
        lista: [
          'Operar la gestión de flota, mantenimiento, almacén, operaciones, tesorería, personal y seguridad de la empresa cliente.',
          'Controlar el acceso, proteger las cuentas y mantener la trazabilidad de los cambios.',
          'Cumplir obligaciones legales, como la emisión de guías y comprobantes electrónicos ante SUNAT.',
          'Responder preguntas de uso en el asistente de ayuda.',
        ],
      },
      {
        titulo: '6. Base legal',
        parrafos: [
          'El tratamiento se basa en la relación laboral o contractual con la empresa cliente, en obligaciones legales y, cuando corresponda, en el consentimiento de la persona. [COMPLETAR: confirmar con abogado la base legal de cada tipo de dato, sobre todo ubicación GPS y firmas].',
        ],
      },
      {
        titulo: '7. Con quién se comparten',
        parrafos: [
          'Solo con proveedores que el sistema necesita para funcionar. Cada uno trata los datos para su servicio:',
        ],
        lista: [
          'Amazon Web Services: almacenamiento de fotos, documentos y firmas.',
          'Wialon: datos de GPS de las unidades.',
          'SUNAT: envío de guías y comprobantes electrónicos.',
          'APISPERU: consulta de DNI y RUC. La consulta se hace desde nuestro servidor.',
          'WhatsApp (integración de avisos): envío de notificaciones de aprobación. [COMPLETAR: confirmar el proveedor de la instancia].',
          'MarsisaSoft: sincronización de vales de combustible y órdenes de viaje, cuando la empresa la activa.',
          'Google Gemini (asistente de ayuda): recibe solo el texto que escribes en el chat y el historial de esa conversación, no datos de la base de datos. Antes de enviarlo, el sistema oculta DNI, teléfonos y correos. Con el plan de pago de Google, sus condiciones vigentes indican que esas consultas no se usan para mejorar sus productos. [COMPLETAR: confirmar que la clave del asistente pertenece a un proyecto con facturación activa y revisar las condiciones vigentes de Google].',
          'Have I Been Pwned (verificación de contraseñas): se envía solo un prefijo de la huella de la contraseña. Nunca la contraseña completa.',
          'Open-Meteo (clima del taller): se envían latitud y longitud del taller, sin datos personales. [COMPLETAR: plan comercial contratado, o retirar este widget].',
          'Google Fonts, mapas y enlaces de Google Maps o Waze: los recibe tu navegador al cargar la página o al tocar el enlace.',
        ],
      },
      {
        titulo: '8. Separación entre empresas',
        parrafos: [
          'Cada empresa cliente tiene su propia base de datos. Azkell no comparte los datos de una empresa con otra, ni los usa para fines propios salvo los datos de contacto comercial de Azkell.',
        ],
      },
      {
        titulo: '9. Transferencias fuera del Perú',
        parrafos: [
          'Algunos proveedores almacenan o procesan datos fuera del Perú (por ejemplo, Amazon Web Services y Google). [COMPLETAR: región de almacenamiento confirmada en producción y garantías contractuales con cada proveedor].',
        ],
      },
      {
        titulo: '10. Cuánto tiempo se conservan',
        parrafos: [
          'Los datos se conservan mientras la empresa cliente use el servicio. Al terminar el contrato, Azkell los devuelve o los elimina según lo pactado. [COMPLETAR: plazo de eliminación después del término del contrato y plazo de conservación de las copias de respaldo].',
        ],
      },
      {
        titulo: '11. Cómo se protegen tus datos',
        lista: [
          'Conexión cifrada (HTTPS) y cabeceras de seguridad (HSTS y protección contra incrustación en otros sitios).',
          'Contraseñas guardadas con hash bcrypt; nunca en texto plano.',
          'Sesión en una cookie HttpOnly, que los scripts de la página no pueden leer.',
          'Verificación en dos pasos (código TOTP) para cuentas de administración y gerencia.',
          'Límite de intentos de inicio de sesión y de peticiones por minuto.',
          'Registro de auditoría firmado (HMAC) para detectar cambios no autorizados.',
          'Asistente de ayuda que oculta DNI, teléfonos y correos antes de enviar el texto a Google.',
        ],
      },
      {
        titulo: '12. Tus derechos',
        parrafos: [
          'Puedes pedir acceso, rectificación, cancelación u oposición al tratamiento de tus datos (derechos ARCO) y revocar tu consentimiento cuando corresponda. Para hacerlo, sigue la indicación de la sección 2.',
          'Si no recibes respuesta, puedes presentar un reclamo ante la Autoridad Nacional de Protección de Datos Personales (Ministerio de Justicia y Derechos Humanos).',
        ],
      },
      {
        titulo: '13. Cambios en esta política',
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
        titulo: '1. Qué es Azkell Fleet y cómo se contrata',
        parrafos: [
          'Azkell Fleet es un software de gestión para empresas de transporte. Se contrata por empresa, mediante un contrato comercial. Dentro del sistema no hay compras ni cobros a los usuarios.',
          'No hay registro público: el administrador de sistemas de cada empresa crea las cuentas de sus usuarios.',
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
          'El sistema se usa solo para la operación de la empresa cliente. Está prohibido intentar vulnerarlo, extraer datos de forma masiva sin autorización o usarlo para fines ajenos a la empresa.',
          'Pedimos no escribir datos personales de terceros en el asistente de ayuda. El asistente no los necesita para responder.',
        ],
      },
      {
        titulo: '4. Disponibilidad del servicio',
        parrafos: [
          'Trabajamos para mantener el servicio disponible, pero no garantizamos que funcione sin interrupciones. Pueden existir mantenimientos y fallas de proveedores externos (GPS, SUNAT, WhatsApp, almacenamiento, servicios de IA).',
          '[COMPLETAR: compromiso de disponibilidad (SLA), si está en el contrato. Si no existe, dejar esta frase sin compromiso numérico.]',
        ],
      },
      {
        titulo: '5. Servicios de terceros',
        parrafos: [
          'Las integraciones (GPS, SUNAT, WhatsApp, MarsisaSoft, mapas, servicios de IA) se rigen también por los términos de cada proveedor. Azkell no controla los servicios de terceros.',
        ],
      },
      {
        titulo: '6. Propiedad intelectual',
        parrafos: [
          'El software, su diseño y la marca Azkell Fleet pertenecen a [COMPLETAR: titular de la marca]. Los datos que cada empresa carga en el sistema pertenecen a esa empresa.',
        ],
      },
      {
        titulo: '7. Responsabilidad',
        parrafos: [
          'El límite de responsabilidad es el monto máximo que Azkell puede tener que pagar si incumple estas condiciones. Es una decisión comercial que debe quedar en el contrato con cada empresa.',
          'Propuesta para decidir con el abogado: [COMPLETAR: límite, por ejemplo, el monto que la empresa haya pagado a Azkell en los últimos 12 meses].',
        ],
      },
      {
        titulo: '8. Ley aplicable y jurisdicción',
        parrafos: [
          'La ley aplicable es la de la República del Perú. La jurisdicción es el lugar y el tribunal que resuelven las disputas si no se llega a un acuerdo.',
          'Propuesta para decidir con el abogado: [COMPLETAR: jurisdicción, por ejemplo, los jueces de Lima].',
        ],
      },
      {
        titulo: '9. Prevalece el contrato',
        parrafos: [
          'Si el contrato comercial firmado con una empresa dice algo distinto a estos términos, prevalece el contrato.',
        ],
      },
      {
        titulo: '10. Cambios y contacto',
        parrafos: [
          'Podemos actualizar estas condiciones y lo avisaremos en el sistema. Contacto: [COMPLETAR: correo y domicilio de Azkell]. Vigencia: ' + FECHA_VIGENCIA + '.',
        ],
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
    titulo: 'Cancelación y reembolsos',
    resumen: 'Cómo se cancela el servicio y cómo se devuelve dinero. Lo que dice el contrato comercial prevalece.',
    secciones: [
      {
        titulo: '1. Cobros fuera del sistema',
        parrafos: [
          'Azkell Fleet no cobra dentro de la aplicación. El monto, la forma de pago, la moneda y los periodos se acuerdan con cada empresa en su contrato comercial.',
        ],
      },
      {
        titulo: '2. Cancelación',
        parrafos: [
          'La empresa puede cancelar el servicio según lo pactado en el contrato. [COMPLETAR: plazo de aviso previo y fecha desde la cual deja de facturarse el servicio.]',
        ],
      },
      {
        titulo: '3. Reembolsos',
        parrafos: [
          'Las devoluciones de dinero se rigen por el contrato. [COMPLETAR: condiciones de reembolso pactadas, si las hay, y el plazo para pedirlo.]',
          'Los periodos ya prestados o iniciados no se devuelven, salvo que el contrato o la ley establezcan otra cosa. [COMPLETAR: confirmar con abogado.]',
        ],
      },
      {
        titulo: '4. Cómo pedir una cancelación o devolución',
        parrafos: [
          'Escribe a [COMPLETAR: correo de contacto de Azkell] con la razón social de la empresa y el número de contrato.',
        ],
      },
      {
        titulo: '5. Alcance',
        parrafos: [
          'Esta política es para empresas que contratan el servicio. Si en el futuro se ofreciera a consumidores finales, se publicará una versión que cumpla el Código de Protección y Defensa del Consumidor (Ley 29571).',
        ],
      },
    ],
  },
];

export const DOCUMENTO_POR_ID = Object.fromEntries(DOCUMENTOS.map(d => [d.id, d])) as Record<Documento['id'], Documento>;
