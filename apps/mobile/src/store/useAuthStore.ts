import { create } from 'zustand';
import { httpClient } from '../api/http';
import { setAccessToken } from '../api/http';
import { supabaseClient } from '../api/supabase';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

type RegisterProfileInput = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
};

let authListenerInitialized = false;

async function updateMinimumProfileWithRetry(payload: RegisterProfileInput): Promise<void> {
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await httpClient.put('/users/me', {
        firstName: payload.firstName,
        lastName: payload.lastName,
        phoneNumber: payload.phoneNumber,
        avatarUrl: null,
        idDocumentUrl: null,
        driverLicenseUrl: null
      });
      return;
    } catch (error: unknown) {
      if (attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
}

type AuthState = {
  userId: string | null;
  email: string | null;
  accessToken: string | null;
  hasHydrated: boolean;
  loading: boolean;
  error: string | null;
  message: string | null;
  emailInput: string;
  passwordInput: string;
  setEmailInput: (value: string) => void;
  setPasswordInput: (value: string) => void;
  hydrateSession: () => Promise<void>;
  signIn: () => Promise<void>;
  signUp: (profileInput?: RegisterProfileInput) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  email: null,
  accessToken: null,
  hasHydrated: false,
  loading: false,
  error: null,
  message: null,
  emailInput: '',
  passwordInput: '',
  setEmailInput: (value) => set({ emailInput: value }),
  setPasswordInput: (value) => set({ passwordInput: value }),
  hydrateSession: async () => {
    set({ loading: true, error: null, message: null });

    try {
      if (!authListenerInitialized) {
        supabaseClient.auth.onAuthStateChange((_event, session) => {
          const token = session?.access_token ?? null;
          setAccessToken(token);

          set({
            userId: session?.user.id ?? null,
            email: session?.user.email ?? null,
            accessToken: token
          });
        });

        authListenerInitialized = true;
      }

      const { data, error } = await supabaseClient.auth.getSession();

      if (error) {
        throw error;
      }

      const session = data.session;
      const token = session?.access_token ?? null;
      setAccessToken(token);

      set({
        userId: session?.user.id ?? null,
        email: session?.user.email ?? null,
        accessToken: token,
        loading: false,
        hasHydrated: true
      });
    } catch (error: unknown) {
      setAccessToken(null);
      set({
        loading: false,
        hasHydrated: true,
        error: getErrorMessage(error, 'No se pudo restaurar la sesion de Supabase.')
      });
    }
  },
  signIn: async () => {
    const { emailInput, passwordInput } = get();

    if (!emailInput.trim() || !passwordInput.trim()) {
      set({ error: 'Email y password son obligatorios.', message: null });

      return;
    }

    set({ loading: true, error: null, message: null });

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: emailInput.trim(),
        password: passwordInput
      });

      if (error || !data.session) {
        throw error ?? new Error('Session not available');
      }

      setAccessToken(data.session.access_token);
      set({
        userId: data.session.user.id,
        email: data.session.user.email ?? null,
        accessToken: data.session.access_token,
        loading: false,
        message: 'Sesion iniciada correctamente.'
      });
    } catch (error: unknown) {
      set({
        loading: false,
        error: getErrorMessage(error, 'No se pudo iniciar sesion.'),
        message: null
      });
    }
  },
  signUp: async (profileInput) => {
    const { emailInput, passwordInput } = get();

    if (!emailInput.trim() || !passwordInput.trim()) {
      set({ error: 'Email y password son obligatorios.', message: null });

      return;
    }

    set({ loading: true, error: null, message: null });

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email: emailInput.trim(),
        password: passwordInput
      });

      if (error) {
        throw error;
      }

      const session = data.session;

      if (session) {
        setAccessToken(session.access_token);
        set({
          userId: session.user.id,
          email: session.user.email ?? null,
          accessToken: session.access_token
        });

        if (profileInput) {
          await updateMinimumProfileWithRetry(profileInput);
        }

        set({
          loading: false,
          message: 'Cuenta creada y sesion iniciada correctamente.'
        });

        return;
      }

      set({
        loading: false,
        message: 'Registro enviado. Revisa tu email para confirmar la cuenta y luego inicia sesion.'
      });
    } catch (error: unknown) {
      set({
        loading: false,
        error: getErrorMessage(error, 'No se pudo registrar el usuario.'),
        message: null
      });
    }
  },
  signOut: async () => {
    set({ loading: true, error: null, message: null });

    try {
      await supabaseClient.auth.signOut();
      setAccessToken(null);
      set({
        userId: null,
        email: null,
        accessToken: null,
        loading: false,
        hasHydrated: true,
        message: 'Sesion cerrada.'
      });
    } catch (error: unknown) {
      set({
        loading: false,
        error: getErrorMessage(error, 'No se pudo cerrar sesion.'),
        message: null
      });
    }
  }
}));
