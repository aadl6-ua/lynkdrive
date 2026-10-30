import { create } from 'zustand';
import { httpClient } from '../api/http';

interface UserProfile {
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
  updateMyProfile: (payload: UserProfileMutation) => Promise<void>;
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
    } catch {
      set({
        loading: false,
        profile: null,
        error: 'No se pudo cargar /users/me. Revisa token de autenticacion.'
      });
    }
  },
  updateMyProfile: async (payload) => {
    set({ saving: true, mutationMessage: null, error: null });

    try {
      await httpClient.put('/users/me', payload);
      await get().fetchMyProfile();
      set({ saving: false });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo actualizar /users/me.'
      });
    }
  }
}));
