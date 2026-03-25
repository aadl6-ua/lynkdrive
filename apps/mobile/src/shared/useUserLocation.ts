import { useCallback, useMemo, useState } from 'react';
import * as Location from 'expo-location';

export type LocationPermissionStatus =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'undetermined';

export type UserCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

type UseUserLocationState = {
  permissionStatus: LocationPermissionStatus;
  loading: boolean;
  error: string | null;
  coords: UserCoordinates | null;
};

type UseUserLocationActions = {
  refreshPermissionStatus: () => Promise<LocationPermissionStatus>;
  requestPermission: () => Promise<LocationPermissionStatus>;
  refreshLocation: () => Promise<UserCoordinates | null>;
  clearLocationError: () => void;
};

export type UseUserLocationResult = UseUserLocationState & UseUserLocationActions;

function mapPermissionStatus(status: Location.PermissionStatus): LocationPermissionStatus {
  if (status === 'granted') {
    return 'granted';
  }

  if (status === 'denied') {
    return 'denied';
  }

  return 'undetermined';
}

export function useUserLocation(): UseUserLocationResult {
  const [permissionStatus, setPermissionStatus] = useState<LocationPermissionStatus>('unknown');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<UserCoordinates | null>(null);

  const refreshPermissionStatus = useCallback(async (): Promise<LocationPermissionStatus> => {
    const { status } = await Location.getForegroundPermissionsAsync();
    const mappedStatus = mapPermissionStatus(status);
    setPermissionStatus(mappedStatus);
    return mappedStatus;
  }, []);

  const requestPermission = useCallback(async (): Promise<LocationPermissionStatus> => {
    setLoading(true);
    setError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const mappedStatus = mapPermissionStatus(status);
      setPermissionStatus(mappedStatus);
      return mappedStatus;
    } catch {
      setError('No se pudo solicitar permiso de ubicacion.');
      setPermissionStatus('denied');
      return 'denied';
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLocation = useCallback(async (): Promise<UserCoordinates | null> => {
    setLoading(true);
    setError(null);

    try {
      const currentPermission = await refreshPermissionStatus();

      if (currentPermission !== 'granted') {
        setError('El permiso de ubicacion no esta concedido.');
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      const nextCoords: UserCoordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? null,
        timestamp: location.timestamp
      };

      setCoords(nextCoords);
      return nextCoords;
    } catch {
      setError('No se pudo obtener tu ubicacion actual.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [refreshPermissionStatus]);

  const clearLocationError = useCallback(() => {
    setError(null);
  }, []);

  return useMemo(
    () => ({
      permissionStatus,
      loading,
      error,
      coords,
      refreshPermissionStatus,
      requestPermission,
      refreshLocation,
      clearLocationError
    }),
    [
      permissionStatus,
      loading,
      error,
      coords,
      refreshPermissionStatus,
      requestPermission,
      refreshLocation,
      clearLocationError
    ]
  );
}
