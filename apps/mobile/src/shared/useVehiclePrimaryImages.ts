import { useEffect, useState } from 'react';
import { httpClient } from '../api/http';

type VehicleImageItem = {
  id: string;
  vehicleId: string;
  imageUrl: string;
  isPrimary: boolean;
};

export function useVehiclePrimaryImages(vehicleIds: string[]) {
  const [imageByVehicleId, setImageByVehicleId] = useState<Record<string, string | null>>({});
  const normalizedVehicleIds = Array.from(new Set(vehicleIds)).sort();
  const vehicleIdsKey = normalizedVehicleIds.join('|');

  useEffect(() => {
    let cancelled = false;
    // Se deriva de la clave para que el efecto solo dependa de un string estable.
    const normalizedVehicleIds = vehicleIdsKey ? vehicleIdsKey.split('|') : [];

    if (normalizedVehicleIds.length === 0) {
      setImageByVehicleId({});
      return;
    }

    const load = async () => {
      const entries = await Promise.all(
        normalizedVehicleIds.map(async (vehicleId) => {
          try {
            const response = await httpClient.get<VehicleImageItem[]>('/vehicle-images', {
              params: { vehicleId }
            });

            const primary =
              response.data.find((image) => image.isPrimary) ?? response.data[0] ?? null;

            return [vehicleId, primary?.imageUrl ?? null] as const;
          } catch {
            return [vehicleId, null] as const;
          }
        })
      );

      if (!cancelled) {
        setImageByVehicleId((current) => {
          const next = Object.fromEntries(entries);

          // Avoid extra renders if data did not change.
          if (JSON.stringify(current) === JSON.stringify(next)) {
            return current;
          }

          return next;
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [vehicleIdsKey]);

  return imageByVehicleId;
}
