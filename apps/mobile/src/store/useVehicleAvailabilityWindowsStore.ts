import type { VehicleAvailabilityWindowResponse } from '@lynkdrive/shared';
import { create } from 'zustand';
import { httpClient } from '../api/http';
import { getApiErrorMessage } from '../shared/errors';

type VehicleAvailabilityWindowItem = VehicleAvailabilityWindowResponse;

interface VehicleAvailabilityWindowsState {
  items: VehicleAvailabilityWindowItem[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  mutationMessage: string | null;
  /** Vehículo al que pertenecen los items cargados. */
  vehicleId: string | null;
  fetchByVehicleId: (vehicleId: string) => Promise<void>;
  createForVehicle: (vehicleId: string, startDatetime: string, endDatetime: string) => Promise<boolean>;
  updateById: (windowId: string, vehicleId: string, startDatetime: string, endDatetime: string) => Promise<boolean>;
  deleteById: (windowId: string, vehicleId: string) => Promise<boolean>;
}

export const useVehicleAvailabilityWindowsStore = create<VehicleAvailabilityWindowsState>((set, get) => ({
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
      const response = await httpClient.get<VehicleAvailabilityWindowItem[]>('/vehicle-availability-windows', {
        params: { vehicleId }
      });

      if (get().vehicleId === vehicleId) {
        set({ items: response.data, loading: false });
      }
    } catch (error: unknown) {
      set({
        loading: false,
        error: getApiErrorMessage(error, 'No se pudieron cargar las ventanas de disponibilidad.')
      });
    }
  },
  createForVehicle: async (vehicleId, startDatetime, endDatetime) => {
    if (!vehicleId || !startDatetime.trim() || !endDatetime.trim()) {
      set({ mutationMessage: 'Debes informar inicio y fin de la ventana.' });

      return false;
    }

    set({ saving: true, error: null, mutationMessage: null });

    try {
      await httpClient.post('/vehicle-availability-windows', {
        vehicleId,
        startDatetime: startDatetime.trim(),
        endDatetime: endDatetime.trim()
      });

      const response = await httpClient.get<VehicleAvailabilityWindowItem[]>('/vehicle-availability-windows', {
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
        mutationMessage: getApiErrorMessage(error, 'No se pudo crear la ventana.')
      });
      return false;
    }
  },
  updateById: async (windowId, vehicleId, startDatetime, endDatetime) => {
    if (!windowId || !vehicleId || !startDatetime.trim() || !endDatetime.trim()) {
      set({ mutationMessage: 'Debes informar ventana, inicio y fin.' });

      return false;
    }

    set({ saving: true, error: null, mutationMessage: null });

    try {
      await httpClient.put(`/vehicle-availability-windows/${windowId}`, {
        startDatetime: startDatetime.trim(),
        endDatetime: endDatetime.trim()
      });

      const response = await httpClient.get<VehicleAvailabilityWindowItem[]>('/vehicle-availability-windows', {
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
        mutationMessage: getApiErrorMessage(error, 'No se pudo actualizar la ventana.')
      });
      return false;
    }
  },
  deleteById: async (windowId, vehicleId) => {
    if (!windowId || !vehicleId) {
      set({ mutationMessage: 'No se pudo identificar la ventana a eliminar.' });

      return false;
    }

    set({ saving: true, error: null, mutationMessage: null });

    try {
      await httpClient.delete(`/vehicle-availability-windows/${windowId}`);

      const response = await httpClient.get<VehicleAvailabilityWindowItem[]>('/vehicle-availability-windows', {
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
        mutationMessage: getApiErrorMessage(error, 'No se pudo eliminar la ventana.')
      });
      return false;
    }
  }
}));
