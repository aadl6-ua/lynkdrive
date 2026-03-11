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
  selectedUserId: string;
  profile: UserProfile | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  mutationMessage: string | null;
  setSelectedUserId: (id: string) => void;
  fetchProfile: () => Promise<void>;
  fetchMyProfile: () => Promise<void>;
  createProfile: (payload: UserProfileMutation) => Promise<void>;
  updateProfile: (payload: UserProfileMutation) => Promise<void>;
  updateMyProfile: (payload: UserProfileMutation) => Promise<void>;
  deleteProfile: () => Promise<void>;
}

const DEFAULT_USER_ID = '11111111-1111-4111-8111-111111111111';

export const useUserProfileStore = create<UserProfileState>((set, get) => ({
  selectedUserId: DEFAULT_USER_ID,
  profile: null,
  loading: false,
  saving: false,
  error: null,
  mutationMessage: null,
  setSelectedUserId: (id) => {
    set({ selectedUserId: id, mutationMessage: null });
  },
  fetchProfile: async () => {
    const { selectedUserId } = get();

    if (!selectedUserId) {
      set({ error: 'Introduce un UUID de usuario válido.', mutationMessage: null });

      return;
    }

    set({ loading: true, error: null, mutationMessage: null });

    try {
      const response = await httpClient.get<UserProfile>(`/users/${selectedUserId}`);

      set({ profile: response.data, loading: false });
    } catch {
      set({
        loading: false,
        profile: null,
        error: 'No se pudo cargar el perfil. Revisa API URL, backend y UUID.'
      });
    }
  },
  fetchMyProfile: async () => {
    set({ loading: true, error: null, mutationMessage: null });

    try {
      const response = await httpClient.get<UserProfile>('/users/me');

      set({
        profile: response.data,
        selectedUserId: response.data.id,
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
  createProfile: async (payload) => {
    const { selectedUserId } = get();

    if (!selectedUserId) {
      set({ mutationMessage: 'No hay UUID seleccionado.' });

      return;
    }

    set({ saving: true, mutationMessage: null, error: null });

    try {
      await httpClient.post('/users', {
        id: selectedUserId,
        ...payload
      });
      await get().fetchProfile();
      set({ saving: false, mutationMessage: 'Usuario creado correctamente.' });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo crear el usuario (puede que ya exista).'
      });
    }
  },
  updateProfile: async (payload) => {
    const { selectedUserId } = get();

    if (!selectedUserId) {
      set({ mutationMessage: 'No hay UUID seleccionado.' });

      return;
    }

    set({ saving: true, mutationMessage: null, error: null });

    try {
      await httpClient.put(`/users/${selectedUserId}`, payload);
      await get().fetchProfile();
      set({ saving: false, mutationMessage: 'Perfil actualizado correctamente.' });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo actualizar el perfil.'
      });
    }
  },
  updateMyProfile: async (payload) => {
    set({ saving: true, mutationMessage: null, error: null });

    try {
      await httpClient.put('/users/me', payload);
      await get().fetchMyProfile();
      set({ saving: false, mutationMessage: 'Perfil autenticado actualizado correctamente.' });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo actualizar /users/me.'
      });
    }
  },
  deleteProfile: async () => {
    const { selectedUserId } = get();

    if (!selectedUserId) {
      set({ mutationMessage: 'No hay UUID seleccionado.' });

      return;
    }

    set({ saving: true, mutationMessage: null, error: null });

    try {
      await httpClient.delete(`/users/${selectedUserId}`);
      set({
        profile: null,
        saving: false,
        mutationMessage: 'Usuario eliminado (soft-delete) correctamente.'
      });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo eliminar el usuario.'
      });
    }
  }
}));
