export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

export interface VehicleMarker {
  id: string;
  location: MapCoordinates;
  brand: string;
  model: string;
  pricePerDay: number;
  imageUrl?: string | null;
}

export interface ExploreVehiclesMapProps {
  vehicles: VehicleMarker[];
  userLocation?: MapCoordinates | null;
  onVehiclePress?: (vehicleId: string) => void;
  height?: number;
  infoBottomInset?: number;
}
