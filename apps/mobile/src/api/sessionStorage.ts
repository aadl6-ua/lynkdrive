import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Almacenamiento de la sesión de Supabase.
 * - Nativo: Keychain/Keystore vía expo-secure-store. SecureStore recomienda
 *   valores < 2 KB, así que la sesión (JWT + refresh) se trocea en partes.
 * - Web: localStorage (no existe almacenamiento seguro equivalente).
 */
const CHUNK_SIZE = 1800;

// SecureStore solo admite claves alfanuméricas, ".", "-" y "_".
function normalizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

function getWebStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

async function removeChunks(baseKey: string) {
  const countRaw = await SecureStore.getItemAsync(`${baseKey}.count`);
  const count = countRaw ? Number(countRaw) : 0;

  await Promise.all(
    Array.from({ length: Number.isFinite(count) ? count : 0 }, (_, index) =>
      SecureStore.deleteItemAsync(`${baseKey}.${index}`)
    )
  );
  await SecureStore.deleteItemAsync(`${baseKey}.count`);
}

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return getWebStorage()?.getItem(key) ?? null;
    }

    try {
      const baseKey = normalizeKey(key);
      const countRaw = await SecureStore.getItemAsync(`${baseKey}.count`);

      if (!countRaw) {
        return null;
      }

      const parts = await Promise.all(
        Array.from({ length: Number(countRaw) }, (_, index) => SecureStore.getItemAsync(`${baseKey}.${index}`))
      );

      return parts.some((part) => part === null) ? null : parts.join('');
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      getWebStorage()?.setItem(key, value);
      return;
    }

    const baseKey = normalizeKey(key);
    await removeChunks(baseKey);

    const chunks: string[] = [];
    for (let index = 0; index < value.length; index += CHUNK_SIZE) {
      chunks.push(value.slice(index, index + CHUNK_SIZE));
    }

    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(`${baseKey}.${index}`, chunk)));
    await SecureStore.setItemAsync(`${baseKey}.count`, String(chunks.length));
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      getWebStorage()?.removeItem(key);
      return;
    }

    try {
      await removeChunks(normalizeKey(key));
    } catch {
      // Si no existe no hay nada que borrar.
    }
  }
};
