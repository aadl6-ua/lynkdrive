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

interface VehiclesState {
  items: VehicleItem[];
  loading: boolean;
  error: string | null;
  fetchVehicles: () => Promise<void>;
}

export const useVehiclesStore = create<VehiclesState>((set) => ({
  items: [],
  loading: false,
  error: null,
  fetchVehicles: async () => {
    set({ loading: true, error: null });

    try {
      const response = await httpClient.get<VehicleItem[]>('/vehicles');
      set({ items: response.data, loading: false });
    } catch {
      set({
        loading: false,
        error: 'No se pudieron cargar vehículos. Revisa backend y datos en DB.'
      });
    }
  }
}));
