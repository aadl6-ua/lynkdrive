import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { sessionStorage } from './sessionStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Keep app booting in local UI/dev mode even when auth env is not configured yet.
  // Auth calls will fail gracefully and surface user-friendly store errors.
  console.warn('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile env');
}

// Durante el export estático de web no hay window: no persistimos en ese contexto.
const canPersist = Platform.OS !== 'web' || typeof window !== 'undefined';

export const supabaseClient = createClient(
  supabaseUrl ?? 'https://example.supabase.co',
  supabaseAnonKey ?? 'public-anon-key',
  {
    auth: {
      storage: sessionStorage,
      persistSession: canPersist,
      autoRefreshToken: canPersist,
      detectSessionInUrl: false
    }
  }
);

// En nativo el refresco automático del token solo debe correr con la app en primer plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabaseClient.auth.startAutoRefresh();
    } else {
      void supabaseClient.auth.stopAutoRefresh();
    }
  });
}
