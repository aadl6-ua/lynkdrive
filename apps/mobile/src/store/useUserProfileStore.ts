import { create } from 'zustand';
import { httpClient } from '../api/http';

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
}

interface UserProfileState {
  selectedUserId: string;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  setSelectedUserId: (id: string) => void;
  fetchProfile: () => Promise<void>;
}

const DEFAULT_USER_ID = '11111111-1111-4111-8111-111111111111';

export const useUserProfileStore = create<UserProfileState>((set, get) => ({
  selectedUserId: DEFAULT_USER_ID,
  profile: null,
  loading: false,
  error: null,
  setSelectedUserId: (id) => {
    set({ selectedUserId: id });
  },
  fetchProfile: async () => {
    const { selectedUserId } = get();

    if (!selectedUserId) {
      set({ error: 'Introduce un UUID de usuario válido.' });

      return;
    }

    set({ loading: true, error: null });

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
  }
}));
