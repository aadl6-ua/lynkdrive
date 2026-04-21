import { useMemo, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Platform } from 'react-native';
import { colorTokens } from '../../../app/theme/tokens';
import { ExploreVehiclesMapProps } from './ExploreVehiclesMap.types';

type NativeMapsModule = {
  default: React.ComponentType<any>;
  Marker: React.ComponentType<any>;
};

function tryLoadNativeMaps(): NativeMapsModule | null {
  try {
    return require('react-native-maps') as NativeMapsModule;
  } catch (error) {
    console.warn('react-native-maps unavailable at runtime. Explore map fallback enabled.', error);
    return null;
  }
}

export const ExploreVehiclesMap: React.FC<ExploreVehiclesMapProps> = ({
  vehicles,
  userLocation,
  onVehiclePress,
  height = 400,
  infoBottomInset = 0,
}) => {
  const nativeMaps = useMemo(() => tryLoadNativeMaps(), []);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const lastMarkerPressAtRef = useRef<number>(0);
  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [selectedVehicleId, vehicles]
  );

  const centerLocation = userLocation || (vehicles.length > 0 ? vehicles[0].location : null);

  if (!nativeMaps) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
        <Text style={{ textAlign: 'center' }}>Mapa no disponible temporalmente en esta build nativa.</Text>
      </View>
    );
  }

  const MapView = nativeMaps.default;
  const Marker = nativeMaps.Marker;

  if (!centerLocation) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <Text>No hay ubicación disponible</Text>
      </View>
    );
  }

  const initialRegion = {
    latitude: centerLocation.latitude,
    longitude: centerLocation.longitude,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={{ height, position: 'relative' }}>
      <MapView
        style={{ height: '100%' }}
        initialRegion={initialRegion}
        onPress={() => {
          const elapsedMs = Date.now() - lastMarkerPressAtRef.current;

          if (elapsedMs < 250) {
            return;
          }

          setSelectedVehicleId(null);
        }}
      >
        {userLocation && (
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            title="Tu ubicacion"
            pinColor={Platform.OS === 'ios' ? colorTokens.accent2 : undefined}
            anchor={Platform.OS === 'android' ? { x: 0.5, y: 0.5 } : undefined}
          >
            {Platform.OS === 'android' ? (
              <View style={localStyles.userMarkerOuter}>
                <View style={localStyles.userMarkerInner} />
              </View>
            ) : null}
          </Marker>
        )}

        {vehicles.map((vehicle) => (
          <Marker
            key={vehicle.id}
            coordinate={{
              latitude: vehicle.location.latitude,
              longitude: vehicle.location.longitude,
            }}
            pinColor={Platform.OS === 'ios' ? colorTokens.secondary : undefined}
            anchor={Platform.OS === 'android' ? { x: 0.5, y: 0.5 } : undefined}
            onSelect={() => {
              lastMarkerPressAtRef.current = Date.now();
              setSelectedVehicleId(vehicle.id);
            }}
          >
            {Platform.OS === 'android' ? (
              <View style={localStyles.vehicleMarkerOuter}>
                <View style={localStyles.vehicleMarkerInner} />
              </View>
            ) : null}
          </Marker>
        ))}
      </MapView>

      {selectedVehicle ? (
        <View
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 12 + infoBottomInset,
            backgroundColor: '#fff',
            borderRadius: 10,
            padding: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 5,
            zIndex: 10,
          }}
        >
          <Pressable
            onPress={() => {
              setSelectedVehicleId(null);
            }}
            style={{
              position: 'absolute',
              right: 10,
              top: 10,
              zIndex: 2,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#d1d5db',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08,
              shadowRadius: 2,
              elevation: 2,
            }}
            hitSlop={10}
          >
            <Text style={{ color: '#1f2937', fontSize: 18, lineHeight: 18, fontWeight: '700' }}>×</Text>
          </Pressable>

          {selectedVehicle.imageUrl ? (
            <Image
              source={{ uri: selectedVehicle.imageUrl }}
              style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 8, marginBottom: 8 }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: '100%',
                aspectRatio: 4 / 3,
                borderRadius: 8,
                backgroundColor: '#e5e7eb',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 8,
              }}
            >
              <Text style={{ color: '#6b7280' }}>Sin imagen</Text>
            </View>
          )}

          <Text style={{ fontWeight: '700', fontSize: 14 }}>
            {selectedVehicle.brand} {selectedVehicle.model}
          </Text>
          <Text style={{ marginTop: 2, marginBottom: 8, color: '#374151' }}>
            EUR {selectedVehicle.pricePerDay.toFixed(2)}/dia
          </Text>

          <Pressable
            onPress={() => {
              if (onVehiclePress) {
                onVehiclePress(selectedVehicle.id);
              }
            }}
            style={{
              backgroundColor: colorTokens.primary,
              borderRadius: 8,
              paddingVertical: 8,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colorTokens.white, fontWeight: '600' }}>Ver detalle</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};

const localStyles = StyleSheet.create({
  userMarkerOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colorTokens.white,
    borderWidth: 2,
    borderColor: colorTokens.accent2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  userMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colorTokens.accent2
  },
  vehicleMarkerOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colorTokens.white,
    borderWidth: 2,
    borderColor: colorTokens.secondary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  vehicleMarkerInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colorTokens.primary
  }
});
