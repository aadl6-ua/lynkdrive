type ApiErrorShape = {
  response?: { status?: number; data?: { message?: string | string[] } };
  code?: string;
  message?: string;
};

/**
 * Extrae un mensaje legible de un error de Axios/NestJS. Devuelve el fallback
 * si no hay mensaje útil, y mensajes claros para red caída o timeout.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const typed = error as ApiErrorShape;
  const message = typed.response?.data?.message;

  if (Array.isArray(message) && message.length > 0) {
    return message.join('. ');
  }

  // El 500 genérico de NestJS llega en inglés y no aporta nada: mejor el mensaje del contexto.
  if (typeof message === 'string' && message.trim() && message !== 'Internal server error') {
    return message;
  }

  if (typed.code === 'ECONNABORTED') {
    return 'El servidor tarda demasiado en responder. Inténtalo de nuevo.';
  }

  if (!typed.response && typed.message === 'Network Error') {
    return 'Sin conexión con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }

  return fallback;
}

/** Variante que devuelve null si el error no trae mensaje de la API. */
export function getApiErrorMessageOrNull(error: unknown): string | null {
  const sentinel = '__no_message__';
  const message = getApiErrorMessage(error, sentinel);
  return message === sentinel ? null : message;
}
