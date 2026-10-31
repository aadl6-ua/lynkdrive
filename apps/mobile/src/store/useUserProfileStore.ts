import { create } from 'zustand';
import { httpClient } from '../api/http';
import { getApiErrorMessage } from '../shared/errors';

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  idDocumentUrl: string | null;
  driverLicenseUrl: string | null;
  isVerified: boolean;
  createdAt: string;
}

interface UserProfileMutation {
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  idDocumentUrl: string | null;
  driverLicenseUrl: string | null;
}

interface UserProfileState {
  profile: UserProfile | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  mutationMessage: string | null;
  fetchMyProfile: () => Promise<void>;
  updateMyProfile: (payload: UserProfileMutation) => Promise<boolean>;
  reset: () => void;
}

export const useUserProfileStore = create<UserProfileState>((set, get) => ({
  profile: null,
  loading: false,
  saving: false,
  error: null,
  mutationMessage: null,
  fetchMyProfile: async () => {
    set({ loading: true, error: null, mutationMessage: null });

    try {
      const response = await httpClient.get<UserProfile>('/users/me');

      set({
        profile: response.data,
        loading: false
      });
    } catch (error: unknown) {
      // Conservamos el perfil previo si existía: un fallo puntual de red no debe
      // "desverificar" al usuario en la UI.
      set({
        loading: false,
        error: getApiErrorMessage(error, 'No se pudo cargar tu perfil. Comprueba tu conexión.')
      });
    }
  },
  updateMyProfile: async (payload) => {
    set({ saving: true, mutationMessage: null, error: null });

    try {
      await httpClient.put('/users/me', payload);
      await get().fetchMyProfile();
      set({ saving: false });
      return true;
    } catch (error: unknown) {
      set({
        saving: false,
        mutationMessage: getApiErrorMessage(error, 'No se pudieron guardar los cambios del perfil.')
      });
      return false;
    }
  },
  reset: () => set({ profile: null, loading: false, saving: false, error: null, mutationMessage: null })
}));
