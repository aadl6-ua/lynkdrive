/**
 * Textos legales de la app (fuente única para registro, Perfil y la web pública).
 * Los datos del titular se configuran por entorno para no fijarlos en el código;
 * ver docs/salida-a-produccion.md antes de publicar en las tiendas.
 */
export type LegalDoc = 'terms' | 'privacy' | 'cancellation';

export type LegalSection = { heading?: string; paragraphs: string[] };

export type LegalDocument = { title: string; updatedAt: string; sections: LegalSection[] };

const OWNER_NAME = process.env.EXPO_PUBLIC_LEGAL_OWNER_NAME ?? 'LynkDrive';
const CONTACT_EMAIL = process.env.EXPO_PUBLIC_LEGAL_CONTACT_EMAIL ?? 'privacidad@lynkdrive.es';
const UPDATED_AT = '31 de octubre de 2026';

/** Versión que se registra al aceptar en el alta; cámbiala al modificar términos o privacidad. */
export const LEGAL_VERSION = '2026-10-31';

export const LEGAL_CONTACT_EMAIL = CONTACT_EMAIL;

export const LEGAL_CONTENT: Record<LegalDoc, LegalDocument> = {
  terms: {
    title: 'Términos y condiciones',
    updatedAt: UPDATED_AT,
    sections: [
      {
        heading: 'Qué es LynkDrive',
        paragraphs: [
          `${OWNER_NAME === 'LynkDrive' ? 'LynkDrive' : `LynkDrive, operada por ${OWNER_NAME},`} es una plataforma que pone en contacto a particulares que alquilan su vehículo (propietarios) con particulares que lo necesitan (conductores). El contrato de alquiler se celebra directamente entre propietario y conductor; LynkDrive facilita la reserva, el pago y la documentación del estado del vehículo.`
        ]
      },
      {
        heading: 'Cuenta y verificación',
        paragraphs: [
          'Para usar la plataforma debes ser mayor de edad, facilitar datos veraces y mantener tu contraseña en secreto.',
          'Para solicitar o gestionar reservas debes tener el perfil completo y la documentación (DNI y permiso de conducir en vigor) verificada por LynkDrive. Si cambias tus documentos, la verificación vuelve a revisarse.'
        ]
      },
      {
        heading: 'Publicar un vehículo',
        paragraphs: [
          'El propietario garantiza que el vehículo es suyo o que puede cederlo, que tiene la ITV y el seguro obligatorio en vigor y que la información y fotos del anuncio son reales. Puede ocultar el anuncio en cualquier momento.'
        ]
      },
      {
        heading: 'Reservas y pagos',
        paragraphs: [
          'El conductor envía una solicitud y solo paga cuando el propietario la acepta. El precio se calcula por días de alquiler y queda fijado en el momento de la solicitud.',
          'Los pagos se procesan a través de Stripe. LynkDrive puede retener una comisión de servicio que se muestra antes de pagar.'
        ]
      },
      {
        heading: 'Entrega, uso y devolución',
        paragraphs: [
          'En la entrega y en la devolución el conductor rellena un checklist con kilometraje, combustible y fotos. Estos checklists sirven como evidencia del estado del vehículo en caso de reclamación.',
          'El conductor usará el vehículo de forma responsable, respetando las normas de tráfico y las indicadas en el anuncio, y lo devolverá en la fecha, lugar y estado acordados. Las multas y daños ocasionados durante el alquiler son responsabilidad del conductor.'
        ]
      },
      {
        heading: 'Valoraciones y conducta',
        paragraphs: [
          'Tras cada viaje ambas partes pueden valorarse. Las valoraciones deben ser veraces y respetuosas. LynkDrive puede retirar contenido o suspender cuentas que incumplan estas condiciones o la ley.'
        ]
      },
      {
        heading: 'Responsabilidad y cambios',
        paragraphs: [
          'LynkDrive no es parte del contrato de alquiler ni responde de los incumplimientos de propietarios o conductores, sin perjuicio de los derechos que la ley reconoce a los consumidores.',
          'Podemos actualizar estas condiciones; te avisaremos en la app de los cambios relevantes. Se rigen por la legislación española.'
        ]
      }
    ]
  },
  privacy: {
    title: 'Política de privacidad',
    updatedAt: UPDATED_AT,
    sections: [
      {
        heading: 'Responsable',
        paragraphs: [`${OWNER_NAME}. Contacto para cualquier cuestión de privacidad: ${CONTACT_EMAIL}.`]
      },
      {
        heading: 'Qué datos tratamos',
        paragraphs: [
          'Datos de cuenta (email, nombre, apellidos y teléfono), foto de perfil, DNI y permiso de conducir, anuncios y fotos de vehículos, reservas, checklists con sus fotos, valoraciones, los mensajes del chat de cada reserva y el método de contacto que compartes al aceptar una reserva. Tu ubicación solo se usa en el dispositivo para mostrar vehículos cercanos y no se guarda.'
        ]
      },
      {
        heading: 'Para qué y con qué base',
        paragraphs: [
          'Gestionar tu cuenta, verificar tu identidad, permitir publicar, reservar y pagar, y documentar la entrega y devolución (ejecución del contrato).',
          'Prevenir fraudes y mantener la seguridad de la plataforma (interés legítimo) y cumplir obligaciones legales y fiscales.'
        ]
      },
      {
        heading: 'Quién más los ve',
        paragraphs: [
          'Los demás usuarios solo ven tu nombre, foto, valoraciones y tus anuncios. Tu método de contacto solo se comparte con el conductor cuando aceptas su reserva. La matrícula de tu vehículo no es pública.',
          'Los mensajes del chat de una reserva solo los ven el conductor y el propietario. El equipo de LynkDrive puede consultarlos únicamente para resolver una incidencia o reclamación de esa reserva.',
          'Usamos proveedores que tratan datos por cuenta nuestra: Supabase (base de datos, autenticación y almacenamiento), Stripe (pagos), Render y Vercel (alojamiento) y OpenStreetMap/Nominatim (búsqueda de direcciones). Los documentos y las fotos de los checklists se guardan en almacenamiento privado con enlaces temporales.'
        ]
      },
      {
        heading: 'Cuánto tiempo',
        paragraphs: [
          'Mientras tengas la cuenta. Si la eliminas, borramos tu perfil, documentos, fotos, anuncios y los mensajes que has escrito; las reservas finalizadas se conservan sin tus datos personales durante los plazos que exige la ley.'
        ]
      },
      {
        heading: 'Tus derechos',
        paragraphs: [
          'Desde Perfil > Privacidad y cuenta puedes descargar todos tus datos o eliminar tu cuenta. También puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ' +
            `${CONTACT_EMAIL}, y reclamar ante la Agencia Española de Protección de Datos (aepd.es).`
        ]
      }
    ]
  },
  cancellation: {
    title: 'Política de cancelación',
    updatedAt: UPDATED_AT,
    sections: [
      {
        paragraphs: [
          'Mientras la solicitud está pendiente o aceptada sin pagar, conductor y propietario pueden cancelarla sin coste.',
          'Con la reserva pagada, si cancela el conductor: reembolso completo si faltan 48 horas o más para el inicio; reembolso del 50% si faltan entre 48 y 24 horas; sin reembolso si faltan menos de 24 horas.',
          'Si cancela el propietario, el conductor recibe siempre el reembolso completo.',
          'Las cancelaciones solo son posibles antes del inicio del viaje. Los reembolsos se devuelven al mismo medio de pago.'
        ]
      }
    ]
  }
};
