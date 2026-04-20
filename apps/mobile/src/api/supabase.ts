import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Keep app booting in local UI/dev mode even when auth env is not configured yet.
  // Auth calls will fail gracefully and surface user-friendly store errors.
  console.warn('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile env');
}

type SupabaseStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStorageState = new Map<string, string>();

const memoryStorage: SupabaseStorage = {
  getItem: async (key) => memoryStorageState.get(key) ?? null,
  setItem: async (key, value) => {
    memoryStorageState.set(key, value);
  },
  removeItem: async (key) => {
    memoryStorageState.delete(key);
  }
};

function getRuntimeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return 'Unknown storage error';
}

function createResilientNativeStorage(): SupabaseStorage {
  const hasAsyncStorageImplementation =
    Boolean(AsyncStorage) &&
    typeof AsyncStorage.getItem === 'function' &&
    typeof AsyncStorage.setItem === 'function' &&
    typeof AsyncStorage.removeItem === 'function';

  if (!hasAsyncStorageImplementation) {
    console.warn('AsyncStorage native module unavailable. Falling back to in-memory auth storage.');
    return memoryStorage;
  }

  let useMemoryFallback = false;
  let warned = false;

  const warnAndFallback = (error: unknown) => {
    if (!warned) {
      warned = true;
      console.warn(
        `AsyncStorage runtime failure. Falling back to in-memory auth storage. ${getRuntimeErrorMessage(error)}`
      );
    }
    useMemoryFallback = true;
  };

  return {
    getItem: async (key) => {
      if (useMemoryFallback) {
        return memoryStorage.getItem(key);
      }

      try {
        return await AsyncStorage.getItem(key);
      } catch (error: unknown) {
        warnAndFallback(error);
        return memoryStorage.getItem(key);
      }
    },
    setItem: async (key, value) => {
      if (useMemoryFallback) {
        await memoryStorage.setItem(key, value);
        return;
      }

      try {
        await AsyncStorage.setItem(key, value);
      } catch (error: unknown) {
        warnAndFallback(error);
        await memoryStorage.setItem(key, value);
      }
    },
    removeItem: async (key) => {
      if (useMemoryFallback) {
        await memoryStorage.removeItem(key);
        return;
      }

      try {
        await AsyncStorage.removeItem(key);
      } catch (error: unknown) {
        warnAndFallback(error);
        await memoryStorage.removeItem(key);
      }
    }
  };
}

function resolveAuthStorage(): SupabaseStorage | undefined {
  if (Platform.OS === 'web') {
    return undefined;
  }

  return createResilientNativeStorage();
}

const authStorage = resolveAuthStorage();
const isWeb = Platform.OS === 'web';

export const supabaseClient = createClient(
  supabaseUrl ?? 'https://example.supabase.co',
  supabaseAnonKey ?? 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: isWeb,
      detectSessionInUrl: false,
      storage: authStorage
    }
  }
);
