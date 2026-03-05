import { create } from 'zustand';
import { httpClient } from '../api/http';

interface VehicleAvailabilityWindowItem {
  id: string;
  vehicleId: string;
  startDatetime: string;
  endDatetime: string;
  createdAt: string;
}

interface VehicleAvailabilityWindowsState {
  items: VehicleAvailabilityWindowItem[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  mutationMessage: string | null;
  fetchByVehicleId: (vehicleId: string) => Promise<void>;
  createForVehicle: (vehicleId: string, startDatetime: string, endDatetime: string) => Promise<void>;
  updateById: (windowId: string, vehicleId: string, startDatetime: string, endDatetime: string) => Promise<void>;
  deleteById: (windowId: string, vehicleId: string) => Promise<void>;
}

export const useVehicleAvailabilityWindowsStore = create<VehicleAvailabilityWindowsState>((set) => ({
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
      const response = await httpClient.get<VehicleAvailabilityWindowItem[]>('/vehicle-availability-windows', {
        params: { vehicleId }
      });

      set({ items: response.data, loading: false });
    } catch {
      set({
        loading: false,
        error: 'No se pudieron cargar las ventanas de disponibilidad.'
      });
    }
  },
  createForVehicle: async (vehicleId, startDatetime, endDatetime) => {
    if (!vehicleId || !startDatetime.trim() || !endDatetime.trim()) {
      set({ mutationMessage: 'Debes informar inicio y fin de la ventana.' });

      return;
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
        saving: false,
        mutationMessage: 'Ventana creada correctamente.'
      });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo crear la ventana.'
      });
    }
  },
  updateById: async (windowId, vehicleId, startDatetime, endDatetime) => {
    if (!windowId || !vehicleId || !startDatetime.trim() || !endDatetime.trim()) {
      set({ mutationMessage: 'Debes informar ventana, inicio y fin.' });

      return;
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
        saving: false,
        mutationMessage: 'Ventana actualizada correctamente.'
      });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo actualizar la ventana.'
      });
    }
  },
  deleteById: async (windowId, vehicleId) => {
    if (!windowId || !vehicleId) {
      set({ mutationMessage: 'No se pudo identificar la ventana a eliminar.' });

      return;
    }

    set({ saving: true, error: null, mutationMessage: null });

    try {
      await httpClient.delete(`/vehicle-availability-windows/${windowId}`);

      const response = await httpClient.get<VehicleAvailabilityWindowItem[]>('/vehicle-availability-windows', {
        params: { vehicleId }
      });

      set({
        items: response.data,
        saving: false,
        mutationMessage: 'Ventana eliminada correctamente.'
      });
    } catch {
      set({
        saving: false,
        mutationMessage: 'No se pudo eliminar la ventana.'
      });
    }
  }
}));
