import { supabase } from './supabase';

const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

type QueryValue = string | number | boolean | undefined | null;

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Extrae un mensaje legible de una respuesta de error de NestJS. */
export function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;

    if (Array.isArray(message)) {
      return message.join('. ');
    }

    if (typeof message === 'string') {
      return message;
    }
  }

  return fallback;
}

export async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(parsed, `Error ${response.status}`));
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  post: <T>(path: string, body: unknown) => apiRequest<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => apiRequest<T>('PUT', path, body)
};
