import { create } from 'zustand';
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

type AuthState = {
  userId: string | null;
  email: string | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;
  message: string | null;
  emailInput: string;
  passwordInput: string;
  setEmailInput: (value: string) => void;
  setPasswordInput: (value: string) => void;
  hydrateSession: () => Promise<void>;
  signIn: () => Promise<void>;
  signUp: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  email: null,
  accessToken: null,
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
        loading: false
      });
    } catch (error: unknown) {
      setAccessToken(null);
      set({
        loading: false,
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
  signUp: async () => {
    const { emailInput, passwordInput } = get();

    if (!emailInput.trim() || !passwordInput.trim()) {
      set({ error: 'Email y password son obligatorios.', message: null });

      return;
    }

    set({ loading: true, error: null, message: null });

    try {
      const { error } = await supabaseClient.auth.signUp({
        email: emailInput.trim(),
        password: passwordInput
      });

      if (error) {
        throw error;
      }

      set({
        loading: false,
        message: 'Registro enviado. Revisa tu email si Supabase requiere confirmacion.'
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
