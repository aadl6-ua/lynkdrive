import { create } from 'zustand';
import { httpClient } from '../api/http';

interface VehicleImageItem {
  id: string;
  vehicleId: string;
  imageUrl: string;
  isPrimary: boolean;
  createdAt: string;
}

interface VehicleImagesState {
  items: VehicleImageItem[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  mutationMessage: string | null;
  fetchByVehicleId: (vehicleId: string) => Promise<void>;
  createForVehicle: (vehicleId: string, imageUrl: string, isPrimary: boolean) => Promise<void>;
  updateById: (imageId: string, vehicleId: string, payload: { isPrimary?: boolean; imageUrl?: string }) => Promise<void>;
  deleteById: (imageId: string, vehicleId: string) => Promise<void>;
}

export const useVehicleImagesStore = create<VehicleImagesState>((set) => ({
  items: [],
  loading: false,
  saving: false,
  error: null,
  mutationMessage: null,
  fetchByVehicleId: async (vehicleId) => {
    if (!vehicleId) {
      set({ items: [], error: null, mutationMessage: null });

      return;
    }

    set({ loading: true, error: null, mutationMessage: null });

    try {
      const response = await httpClient.get<VehicleImageItem[]>('/vehicle-images', {
        params: { vehicleId }
      });

      set({ items: response.data, loading: false });
    } catch {
      set({
        loading: false,
        error: 'No se pudieron cargar las imágenes del vehículo.'
      });
    }
  },
  createForVehicle: async (vehicleId, imageUrl, isPrimary) => {
    if (!vehicleId || !imageUrl.trim()) {
      set({ mutationMessage: 'Debes informar vehículo y URL de imagen.' });

      return;
    }

    set({ saving: true, error: null, mutationMessage: null });

    try {
      await httpClient.post('/vehicle-images', {
        vehicleId,
        imageUrl: imageUrl.trim(),
        isPrimary
      });

      const response = await httpClient.get<VehicleImageItem[]>('/vehicle-images', {
        params: { vehicleId }
      });

      set({
        items: response.data,
        saving: false
      });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo crear la imagen.'
      });
    }
  },
  updateById: async (imageId, vehicleId, payload) => {
    if (!imageId || !vehicleId) {
      set({ mutationMessage: 'No se pudo identificar la imagen a actualizar.' });

      return;
    }

    set({ saving: true, error: null, mutationMessage: null });

    try {
      await httpClient.put(`/vehicle-images/${imageId}`, payload);

      const response = await httpClient.get<VehicleImageItem[]>('/vehicle-images', {
        params: { vehicleId }
      });

      set({
        items: response.data,
        saving: false
      });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo actualizar la imagen.'
      });
    }
  },
  deleteById: async (imageId, vehicleId) => {
    if (!imageId || !vehicleId) {
      set({ mutationMessage: 'No se pudo identificar la imagen a eliminar.' });

      return;
    }

    set({ saving: true, error: null, mutationMessage: null });

    try {
      await httpClient.delete(`/vehicle-images/${imageId}`);

      const response = await httpClient.get<VehicleImageItem[]>('/vehicle-images', {
        params: { vehicleId }
      });

      set({
        items: response.data,
        saving: false
      });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo eliminar la imagen.'
      });
    }
  }
}));
