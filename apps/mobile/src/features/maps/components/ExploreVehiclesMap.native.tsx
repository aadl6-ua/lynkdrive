import { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colorTokens, radiusTokens, shadowTokens, spacingTokens, typographyTokens } from '../../../app/theme/tokens';
import { formatPriceCompact } from '../../../shared/format';
import { AppImage, Button, IconButton } from '../../../shared/ui';
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

const DEFAULT_CENTER = { latitude: 40.4168, longitude: -3.7038 };

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

  // Sin ubicación ni vehículos centramos en Madrid para no mostrar un mapa vacío.
  const centerLocation = userLocation || (vehicles.length > 0 ? vehicles[0].location : DEFAULT_CENTER);

  if (!nativeMaps) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
        <Text style={localStyles.fallbackText}>El mapa no está disponible en esta versión de la app.</Text>
      </View>
    );
  }

  const MapView = nativeMaps.default;
  const Marker = nativeMaps.Marker;

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
            title="Tu ubicación"
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
        <View style={[localStyles.infoCard, { bottom: 12 + infoBottomInset }]}>
          <AppImage uri={selectedVehicle.imageUrl ?? null} style={localStyles.infoImage} fallbackLabel="Sin fotos" />
          <View style={localStyles.infoBody}>
            <Text style={localStyles.infoTitle} numberOfLines={1}>
              {selectedVehicle.brand} {selectedVehicle.model}
            </Text>
            <Text style={localStyles.infoPrice}>{formatPriceCompact(selectedVehicle.pricePerDay)} / día</Text>
            <Button
              label="Ver detalle"
              size="sm"
              onPress={() => onVehiclePress?.(selectedVehicle.id)}
              style={localStyles.infoButton}
            />
          </View>
          <IconButton
            icon="close"
            size={32}
            variant="overlay"
            accessibilityLabel="Cerrar vista previa"
            onPress={() => setSelectedVehicleId(null)}
            style={localStyles.infoClose}
          />
        </View>
      ) : null}
    </View>
  );
};

const localStyles = StyleSheet.create({
  fallbackText: {
    textAlign: 'center',
    color: colorTokens.textMuted,
    ...typographyTokens.body
  },
  infoCard: {
    position: 'absolute',
    left: spacingTokens.md,
    right: spacingTokens.md,
    flexDirection: 'row',
    gap: spacingTokens.md,
    padding: spacingTokens.sm,
    borderRadius: radiusTokens.lg,
    backgroundColor: colorTokens.white,
    borderWidth: 1,
    borderColor: colorTokens.border,
    zIndex: 10,
    ...shadowTokens.raised
  },
  infoImage: {
    width: 112,
    height: 96,
    borderRadius: radiusTokens.input
  },
  infoBody: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    paddingRight: 32
  },
  infoTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  infoPrice: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  infoButton: {
    alignSelf: 'flex-start',
    marginTop: spacingTokens.xs
  },
  infoClose: {
    position: 'absolute',
    top: spacingTokens.xs,
    right: spacingTokens.xs
  },
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
