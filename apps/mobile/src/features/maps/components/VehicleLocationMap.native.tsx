import { StyleSheet, Text, View } from 'react-native';
import { VehicleLocationMapProps } from './VehicleLocationMap.types';

type NativeMapsModule = {
  default: React.ComponentType<any>;
  Marker: React.ComponentType<any>;
};

function tryLoadNativeMaps(): NativeMapsModule | null {
  try {
    return require('react-native-maps') as NativeMapsModule;
  } catch (error) {
    console.warn('react-native-maps unavailable at runtime. Vehicle map fallback enabled.', error);
    return null;
  }
}

function isValidCoordinate(value: number): boolean {
  return Number.isFinite(value);
}

function resolveCenter(vehicleLocation: VehicleLocationMapProps['vehicleLocation'], userLocation?: VehicleLocationMapProps['userLocation']) {
  if (!userLocation) {
    return {
      latitude: vehicleLocation.latitude,
      longitude: vehicleLocation.longitude
    };
  }

  return {
    latitude: (vehicleLocation.latitude + userLocation.latitude) / 2,
    longitude: (vehicleLocation.longitude + userLocation.longitude) / 2
  };
}

export function VehicleLocationMap({ vehicleLocation, userLocation, height = 260 }: VehicleLocationMapProps) {
  const nativeMaps = tryLoadNativeMaps();
  const hasVehicleCoords = isValidCoordinate(vehicleLocation.latitude) && isValidCoordinate(vehicleLocation.longitude);

  if (!nativeMaps) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>Mapa no disponible temporalmente en esta build nativa.</Text>
      </View>
    );
  }

  const MapView = nativeMaps.default;
  const Marker = nativeMaps.Marker;

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
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04
        }}
      >
        <Marker
          coordinate={{
            latitude: vehicleLocation.latitude,
            longitude: vehicleLocation.longitude
          }}
          title="Vehiculo"
          pinColor="#2c3f6b"
        />

        {hasUserCoords ? (
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude
            }}
            title="Tu ubicacion"
            pinColor="#0f9d58"
          />
        ) : null}
      </MapView>
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
