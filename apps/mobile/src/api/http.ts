import axios from 'axios';

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export const httpClient = axios.create({
  baseURL,
  timeout: 10000
});

httpClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// Mensaje del guard de la API para usuarios bloqueados desde el backoffice.
export const ACCOUNT_BLOCKED_MESSAGE = 'Cuenta bloqueada por la administración';

type AccountBlockedListener = () => void;
const accountBlockedListeners = new Set<AccountBlockedListener>();

/** Avisa cuando la API rechaza una petición porque la cuenta está bloqueada. */
export const onAccountBlocked = (listener: AccountBlockedListener): (() => void) => {
  accountBlockedListeners.add(listener);
  return () => {
    accountBlockedListeners.delete(listener);
  };
};

httpClient.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: unknown } | undefined;

    if (error.response?.status === 403 && data?.message === ACCOUNT_BLOCKED_MESSAGE) {
      accountBlockedListeners.forEach((listener) => listener());
    }
  }

  return Promise.reject(error);
});
