import { create } from 'zustand';
import { httpClient } from '../api/http';

interface VehicleItem {
  id: string;
  ownerId: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  description: string;
  pricePerDay: number;
  locationLat: number;
  locationLng: number;
  locationAddress: string;
  fuelType: 'gasoline' | 'diesel' | 'electric' | 'hybrid' | null;
  transmission: 'manual' | 'automatic' | null;
  seats: number | null;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface VehicleFilters {
  maxPrice?: number;
  fuelType?: 'gasoline' | 'diesel' | 'electric' | 'hybrid';
  transmission?: 'manual' | 'automatic';
  seats?: number;
  status?: 'active' | 'inactive';
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

interface CreateVehicleInput {
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  description: string;
  pricePerDay: number;
  locationLat: number;
  locationLng: number;
  locationAddress: string;
  fuelType: 'gasoline' | 'diesel' | 'electric' | 'hybrid' | null;
  transmission: 'manual' | 'automatic' | null;
  seats: number | null;
  status: 'active' | 'inactive';
}

interface UpdateVehicleInput {
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  description: string;
  pricePerDay: number;
  locationLat: number;
  locationLng: number;
  locationAddress: string;
  fuelType: 'gasoline' | 'diesel' | 'electric' | 'hybrid' | null;
  transmission: 'manual' | 'automatic' | null;
  seats: number | null;
  status: 'active' | 'inactive';
}

interface VehiclesState {
  items: VehicleItem[];
  loading: boolean;
  creating: boolean;
  error: string | null;
  mutationMessage: string | null;
  fetchVehicles: (filters?: VehicleFilters) => Promise<void>;
  createVehicleForOwner: (ownerId: string, payload: CreateVehicleInput) => Promise<void>;
  updateVehicleById: (vehicleId: string, payload: UpdateVehicleInput) => Promise<void>;
  deleteVehicleById: (vehicleId: string) => Promise<void>;
}

export const useVehiclesStore = create<VehiclesState>((set) => ({
  items: [],
  loading: false,
  creating: false,
  error: null,
  mutationMessage: null,
  fetchVehicles: async (filters) => {
    set({ loading: true, error: null, mutationMessage: null });

    try {
      const response = await httpClient.get<VehicleItem[]>('/vehicles', {
        params: filters
      });
      set({ items: response.data, loading: false });
    } catch {
      set({
        loading: false,
        error: 'No se pudieron cargar vehículos. Revisa backend y datos en DB.'
      });
    }
  },
  createVehicleForOwner: async (ownerId: string, payload: CreateVehicleInput) => {
    if (!ownerId) {
      set({ mutationMessage: 'No hay usuario activo para asociar el vehículo.' });

      return;
    }

    set({ creating: true, error: null, mutationMessage: null });

    try {
      await httpClient.post('/vehicles', {
        ownerId,
        ...payload
      });

      const response = await httpClient.get<VehicleItem[]>('/vehicles');
      set({
        items: response.data,
        creating: false,
        mutationMessage: 'Vehículo creado correctamente para el usuario activo.'
      });
    } catch {
      set({
        creating: false,
        mutationMessage: 'No se pudo crear el vehículo (revisa owner y matrícula).'
      });
    }
  },
  updateVehicleById: async (vehicleId: string, payload: UpdateVehicleInput) => {
    if (!vehicleId) {
      set({ mutationMessage: 'No hay vehículo seleccionado para actualizar.' });

      return;
    }

    set({ creating: true, error: null, mutationMessage: null });

    try {
      await httpClient.put(`/vehicles/${vehicleId}`, payload);

      const response = await httpClient.get<VehicleItem[]>('/vehicles');
      set({
        items: response.data,
        creating: false,
        mutationMessage: 'Vehículo actualizado correctamente.'
      });
    } catch {
      set({
        creating: false,
        mutationMessage: 'No se pudo actualizar el vehículo.'
      });
    }
  },
  deleteVehicleById: async (vehicleId: string) => {
    if (!vehicleId) {
      set({ mutationMessage: 'No hay vehículo seleccionado para eliminar.' });

      return;
    }

    set({ creating: true, error: null, mutationMessage: null });

    try {
      await httpClient.delete(`/vehicles/${vehicleId}`);

      const response = await httpClient.get<VehicleItem[]>('/vehicles');
      set({
        items: response.data,
        creating: false,
        mutationMessage: 'Vehículo eliminado (soft-delete) correctamente.'
      });
    } catch {
      set({
        creating: false,
        mutationMessage: 'No se pudo eliminar el vehículo.'
      });
    }
  }
}));
