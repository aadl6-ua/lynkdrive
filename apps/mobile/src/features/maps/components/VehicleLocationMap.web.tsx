import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { VehicleLocationMapProps } from './VehicleLocationMap.types';

const WebMapContainer = MapContainer as unknown as ComponentType<Record<string, unknown>>;
const WebTileLayer = TileLayer as unknown as ComponentType<Record<string, unknown>>;
const WebCircleMarker = CircleMarker as unknown as ComponentType<Record<string, unknown>>;
const WebPopup = Popup as unknown as ComponentType<Record<string, unknown>>;

function isValidCoordinate(value: number): boolean {
  return Number.isFinite(value);
}

function resolveCenter(vehicleLocation: VehicleLocationMapProps['vehicleLocation'], userLocation?: VehicleLocationMapProps['userLocation']) {
  if (!userLocation) {
    return [vehicleLocation.latitude, vehicleLocation.longitude] as [number, number];
  }

  return [
    (vehicleLocation.latitude + userLocation.latitude) / 2,
    (vehicleLocation.longitude + userLocation.longitude) / 2
  ] as [number, number];
}

export function VehicleLocationMap({ vehicleLocation, userLocation, height = 260 }: VehicleLocationMapProps) {
  const hasVehicleCoords = isValidCoordinate(vehicleLocation.latitude) && isValidCoordinate(vehicleLocation.longitude);

  if (!hasVehicleCoords) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>No se pudo renderizar el mapa por coordenadas invalidas del vehiculo.</Text>
      </View>
    );
  }

  const hasUserCoords =
    !!userLocation && isValidCoordinate(userLocation.latitude) && isValidCoordinate(userLocation.longitude);

  const center = resolveCenter(vehicleLocation, hasUserCoords ? userLocation : null);

  return (
    <View style={[styles.container, { height }]}>
      <WebMapContainer center={center} zoom={13} style={{ width: '100%', height: '100%' }}>
        <WebTileLayer
          attribution='&copy; OpenStreetMap contributors'
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        />

        <WebCircleMarker
          center={[vehicleLocation.latitude, vehicleLocation.longitude]}
          radius={8}
          pathOptions={{ color: '#2c3f6b', fillColor: '#2c3f6b', fillOpacity: 0.85 }}
        >
          <WebPopup>Vehiculo</WebPopup>
        </WebCircleMarker>

        {hasUserCoords ? (
          <WebCircleMarker
            center={[userLocation.latitude, userLocation.longitude]}
            radius={8}
            pathOptions={{ color: '#0f9d58', fillColor: '#0f9d58', fillOpacity: 0.85 }}
          >
            <WebPopup>Tu ubicacion</WebPopup>
          </WebCircleMarker>
        ) : null}
      </WebMapContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#dde3ee'
  },
  fallback: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dde3ee',
    backgroundColor: '#f8faff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  fallbackText: {
    color: '#536282',
    textAlign: 'center'
  }
});
