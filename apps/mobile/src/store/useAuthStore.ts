import { create } from 'zustand';
import { httpClient, setAccessToken } from '../api/http';
import { supabaseClient } from '../api/supabase';
import { getPasswordResetRedirectUrl } from '../features/auth/PasswordResetScreen';
import { LEGAL_VERSION } from '../shared/legal';
import { unregisterPushNotifications } from '../features/notifications/pushNotifications';
import { useUserProfileStore } from './useUserProfileStore';
import { useVehiclesStore } from './useVehiclesStore';

const SUPABASE_ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/email not confirmed/i, 'Tienes que confirmar tu email antes de entrar. Revisa tu bandeja de entrada.'],
  [/user already registered/i, 'Ya existe una cuenta con este email. Prueba a iniciar sesión.'],
  [/password should be at least/i, 'La contraseña es demasiado corta.'],
  [/unable to validate email address|invalid email/i, 'El email no tiene un formato válido.'],
  [/rate limit|too many requests/i, 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'],
  [/failed to fetch|network/i, 'Sin conexión. Revisa tu red e inténtalo de nuevo.']
];

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === 'string' && message.trim()) {
      const translated = SUPABASE_ERROR_TRANSLATIONS.find(([pattern]) => pattern.test(message));
      return translated ? translated[1] : message;
    }
  }

  return fallback;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  requestPasswordReset: () => Promise<boolean>;
  clearFeedback: () => void;
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
      set({ error: 'Introduce tu email y tu contraseña.', message: null });

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
        passwordInput: ''
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
      set({ error: 'Introduce tu email y tu contraseña.', message: null });

      return;
    }

    set({ loading: true, error: null, message: null });

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email: emailInput.trim(),
        password: passwordInput,
        options: {
          // El trigger auth.users -> public.users usa nombre y apellidos aunque haya confirmación
          // por email; la aceptación de los textos legales queda registrada con fecha y versión.
          data: {
            first_name: profileInput?.firstName,
            last_name: profileInput?.lastName,
            terms_accepted_at: new Date().toISOString(),
            terms_version: LEGAL_VERSION
          }
        }
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
          // El listener de sesión ya pudo cargar el perfil vacío creado por el
          // trigger; lo recargamos para reflejar nombre y teléfono recién guardados.
          await useUserProfileStore.getState().fetchMyProfile();
        }

        set({ loading: false, passwordInput: '' });

        return;
      }

      // Proyecto con confirmación de email: no hay sesión hasta confirmar.
      set({
        loading: false,
        passwordInput: '',
        message: 'Cuenta creada. Te hemos enviado un email para confirmarla; después podrás iniciar sesión.'
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
      // Baja del token push con la sesión aún activa; sin red no retrasa el cierre más de 3 s.
      await Promise.race([unregisterPushNotifications(), new Promise((resolve) => setTimeout(resolve, 3000))]);
      await supabaseClient.auth.signOut();
      setAccessToken(null);
      useUserProfileStore.getState().reset();
      useVehiclesStore.getState().reset();
      set({
        userId: null,
        email: null,
        accessToken: null,
        loading: false,
        hasHydrated: true,
        passwordInput: ''
      });
    } catch (error: unknown) {
      set({
        loading: false,
        error: getErrorMessage(error, 'No se pudo cerrar sesion.'),
        message: null
      });
    }
  },
  requestPasswordReset: async () => {
    const email = get().emailInput.trim();

    if (!EMAIL_PATTERN.test(email)) {
      set({ error: 'Escribe arriba el email de tu cuenta para enviarte el enlace.', message: null });
      return false;
    }

    set({ loading: true, error: null, message: null });

    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordResetRedirectUrl()
      });

      if (error) {
        throw error;
      }

      set({
        loading: false,
        message: 'Si existe una cuenta con ese email, recibirás un enlace para restablecer la contraseña.'
      });
      return true;
    } catch (error: unknown) {
      set({ loading: false, error: getErrorMessage(error, 'No se pudo enviar el enlace de recuperación.') });
      return false;
    }
  },
  clearFeedback: () => set({ error: null, message: null })
}));
