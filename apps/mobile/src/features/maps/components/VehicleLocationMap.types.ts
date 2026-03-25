export type MapCoordinates = {
  latitude: number;
  longitude: number;
};

export type VehicleLocationMapProps = {
  vehicleLocation: MapCoordinates;
  userLocation?: MapCoordinates | null;
  height?: number;
};
