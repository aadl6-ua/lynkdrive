import type { UpdateVehicleImageRequest, VehicleImageResponse } from '@lynkdrive/shared';
import { create } from 'zustand';
import { httpClient } from '../api/http';
import { getApiErrorMessage } from '../shared/errors';

type VehicleImageItem = VehicleImageResponse;

interface VehicleImagesState {
  items: VehicleImageItem[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  mutationMessage: string | null;
  /** Vehículo al que pertenecen los items cargados. */
  vehicleId: string | null;
  fetchByVehicleId: (vehicleId: string) => Promise<void>;
  createForVehicle: (vehicleId: string, imageUrl: string, isPrimary: boolean) => Promise<boolean>;
  updateById: (imageId: string, vehicleId: string, payload: UpdateVehicleImageRequest) => Promise<boolean>;
  deleteById: (imageId: string, vehicleId: string) => Promise<boolean>;
}

export const useVehicleImagesStore = create<VehicleImagesState>((set, get) => ({
  items: [],
  vehicleId: null,
  loading: false,
  saving: false,
  error: null,
  mutationMessage: null,
  fetchByVehicleId: async (vehicleId) => {
    if (!vehicleId) {
      set({ items: [], error: null, mutationMessage: null });

      return;
    }

    // Evita mostrar datos de otro vehículo mientras carga el nuevo.
    const isSameVehicle = get().vehicleId === vehicleId;
    set({ loading: true, error: null, mutationMessage: null, vehicleId, items: isSameVehicle ? get().items : [] });

    try {
      const response = await httpClient.get<VehicleImageItem[]>('/vehicle-images', {
        params: { vehicleId }
      });

      if (get().vehicleId === vehicleId) {
        set({ items: response.data, loading: false });
      }
    } catch (error: unknown) {
      set({
        loading: false,
        error: getApiErrorMessage(error, 'No se pudieron cargar las imágenes del vehículo.')
      });
    }
  },
  createForVehicle: async (vehicleId, imageUrl, isPrimary) => {
    if (!vehicleId || !imageUrl.trim()) {
      set({ mutationMessage: 'Debes informar vehículo y URL de imagen.' });

      return false;
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
      return true;
    } catch (error: unknown) {
      set({
        saving: false,
        mutationMessage: getApiErrorMessage(error, 'No se pudo crear la imagen.')
      });
      return false;
    }
  },
  updateById: async (imageId, vehicleId, payload) => {
    if (!imageId || !vehicleId) {
      set({ mutationMessage: 'No se pudo identificar la imagen a actualizar.' });

      return false;
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
      return true;
    } catch (error: unknown) {
      set({
        saving: false,
        mutationMessage: getApiErrorMessage(error, 'No se pudo actualizar la imagen.')
      });
      return false;
    }
  },
  deleteById: async (imageId, vehicleId) => {
    if (!imageId || !vehicleId) {
      set({ mutationMessage: 'No se pudo identificar la imagen a eliminar.' });

      return false;
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
      return true;
    } catch (error: unknown) {
      set({
        saving: false,
        mutationMessage: getApiErrorMessage(error, 'No se pudo eliminar la imagen.')
      });
      return false;
    }
  }
}));
