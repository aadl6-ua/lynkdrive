import { useMemo, useRef, useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { ExploreVehiclesMapProps } from './ExploreVehiclesMap.types';

export const ExploreVehiclesMap: React.FC<ExploreVehiclesMapProps> = ({
  vehicles,
  userLocation,
  onVehiclePress,
  height = 400,
}) => {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const lastMarkerPressAtRef = useRef<number>(0);
  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [selectedVehicleId, vehicles]
  );

  // Calcular región inicial (centro en usuario o en primer vehículo)
  const centerLocation = userLocation || (vehicles.length > 0 ? vehicles[0].location : null);

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

          // Ignore the map press that is emitted right after tapping a marker.
          if (elapsedMs < 250) {
            return;
          }

          setSelectedVehicleId(null);
        }}
      >
        {/* Marcador del usuario */}
        {userLocation && (
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            title="Tu ubicacion"
            pinColor="green"
          />
        )}

        {/* Marcadores de vehículos */}
        {vehicles.map((vehicle) => (
          <Marker
            key={vehicle.id}
            coordinate={{
              latitude: vehicle.location.latitude,
              longitude: vehicle.location.longitude,
            }}
            pinColor="blue"
            onSelect={() => {
              lastMarkerPressAtRef.current = Date.now();
              setSelectedVehicleId(vehicle.id);
            }}
          />
        ))}
      </MapView>

      {selectedVehicle ? (
        <View
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 12,
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
              right: 8,
              top: 8,
              zIndex: 2,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: '#f3f4f6',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            hitSlop={10}
          >
            <Text style={{ color: '#374151', fontWeight: '700' }}>X</Text>
          </Pressable>

          {selectedVehicle.imageUrl ? (
            <Image
              source={{ uri: selectedVehicle.imageUrl }}
              style={{ width: '100%', height: 130, borderRadius: 8, marginBottom: 8 }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: '100%',
                height: 130,
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
              backgroundColor: '#1d4ed8',
              borderRadius: 8,
              paddingVertical: 8,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Ver detalle</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};
