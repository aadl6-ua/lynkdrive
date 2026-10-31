import type {
  CreateVehicleRequest,
  UpdateVehicleRequest,
  VehicleResponse,
  VehicleSearchFilters
} from '@lynkdrive/shared';
import { create } from 'zustand';
import { httpClient } from '../api/http';
import { getApiErrorMessage } from '../shared/errors';

export type VehicleItem = VehicleResponse;

type VehicleFilters = VehicleSearchFilters;

/** El formulario envía siempre todos los campos (null si no se informan). */
type CreateVehicleInput = Required<CreateVehicleRequest>;

type UpdateVehicleInput = Required<UpdateVehicleRequest>;

interface VehiclesState {
  /** Resultados de Explorar (vehículos de otros usuarios). */
  items: VehicleItem[];
  loading: boolean;
  error: string | null;
  /** Vehículos del usuario autenticado (Mis Vehículos). Estado separado para no mezclar listados. */
  myItems: VehicleItem[];
  myLoading: boolean;
  myError: string | null;
  myLoaded: boolean;
  creating: boolean;
  mutationMessage: string | null;
  fetchVehicles: (filters?: VehicleFilters) => Promise<void>;
  fetchMyVehicles: () => Promise<void>;
  createVehicle: (payload: CreateVehicleInput) => Promise<boolean>;
  updateVehicleById: (vehicleId: string, payload: UpdateVehicleInput) => Promise<boolean>;
  deleteVehicleById: (vehicleId: string) => Promise<boolean>;
  reset: () => void;
}

const initialState = {
  items: [] as VehicleItem[],
  loading: false,
  error: null as string | null,
  myItems: [] as VehicleItem[],
  myLoading: false,
  myError: null as string | null,
  myLoaded: false,
  creating: false,
  mutationMessage: null as string | null
};

let exploreRequestSeq = 0;

export const useVehiclesStore = create<VehiclesState>((set) => ({
  ...initialState,
  fetchVehicles: async (filters) => {
    const requestId = ++exploreRequestSeq;
    set({ loading: true, error: null });

    try {
      const response = await httpClient.get<VehicleItem[]>('/vehicles', {
        params: filters
      });

      // Ignora respuestas antiguas si el usuario cambió filtros rápido.
      if (requestId === exploreRequestSeq) {
        set({ items: response.data, loading: false });
      }
    } catch (error: unknown) {
      if (requestId === exploreRequestSeq) {
        set({
          loading: false,
          error: getApiErrorMessage(error, 'No se pudieron cargar los vehículos.')
        });
      }
    }
  },
  fetchMyVehicles: async () => {
    set({ myLoading: true, myError: null });

    try {
      const response = await httpClient.get<VehicleItem[]>('/vehicles/mine/list');
      set({ myItems: response.data, myLoading: false, myLoaded: true });
    } catch (error: unknown) {
      set({
        myLoading: false,
        myError: getApiErrorMessage(error, 'No se pudieron cargar tus vehículos.')
      });
    }
  },
  createVehicle: async (payload: CreateVehicleInput) => {
    set({ creating: true, mutationMessage: null });

    try {
      await httpClient.post('/vehicles', payload);

      const response = await httpClient.get<VehicleItem[]>('/vehicles/mine/list');
      set({
        myItems: response.data,
        myLoaded: true,
        creating: false
      });
      return true;
    } catch (error: unknown) {
      set({
        creating: false,
        mutationMessage: getApiErrorMessage(error, 'No se pudo crear el vehículo.')
      });
      return false;
    }
  },
  updateVehicleById: async (vehicleId: string, payload: UpdateVehicleInput) => {
    if (!vehicleId) {
      set({ mutationMessage: 'No hay vehículo seleccionado para actualizar.' });

      return false;
    }

    set({ creating: true, mutationMessage: null });

    try {
      await httpClient.put(`/vehicles/${vehicleId}`, payload);

      const response = await httpClient.get<VehicleItem[]>('/vehicles/mine/list');
      set({
        myItems: response.data,
        creating: false
      });
      return true;
    } catch (error: unknown) {
      set({
        creating: false,
        mutationMessage: getApiErrorMessage(error, 'No se pudo actualizar el vehículo.')
      });
      return false;
    }
  },
  deleteVehicleById: async (vehicleId: string) => {
    if (!vehicleId) {
      set({ mutationMessage: 'No hay vehículo seleccionado para eliminar.' });

      return false;
    }

    set({ creating: true, mutationMessage: null });

    try {
      await httpClient.delete(`/vehicles/${vehicleId}`);

      const response = await httpClient.get<VehicleItem[]>('/vehicles/mine/list');
      set({
        myItems: response.data,
        creating: false
      });
      return true;
    } catch (error: unknown) {
      set({
        creating: false,
        mutationMessage: getApiErrorMessage(
          error,
          'No se pudo eliminar el vehículo. Si tiene reservas asociadas no puede borrarse.'
        )
      });
      return false;
    }
  },
  reset: () => set({ ...initialState })
}));
