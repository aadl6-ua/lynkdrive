import { lazy, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colorTokens, radiusTokens } from '../../app/theme/tokens';
import type { ExploreVehiclesMapProps, VehicleLocationMapProps } from './components';

// Los mapas (Leaflet en web, react-native-maps en nativo) se cargan solo al mostrarse
// para no engordar el bundle inicial.
// Un único import diferido para ambos: si fueran dos, Metro extrae Leaflet a un chunk
// común que se carga igualmente al inicio.
const loadMaps = () => import('./components');
const ExploreVehiclesMapImpl = lazy(() =>
  loadMaps().then((module) => ({ default: module.ExploreVehiclesMap }))
);
const VehicleLocationMapImpl = lazy(() =>
  loadMaps().then((module) => ({ default: module.VehicleLocationMap }))
);

function MapLoading({ height }: { height: number }) {
  return (
    <View style={[styles.loading, { height }]} accessibilityLabel="Cargando mapa" accessible>
      <ActivityIndicator color={colorTokens.primary} />
    </View>
  );
}

export function ExploreVehiclesMap(props: ExploreVehiclesMapProps) {
  return (
    <Suspense fallback={<MapLoading height={props.height ?? 400} />}>
      <ExploreVehiclesMapImpl {...props} />
    </Suspense>
  );
}

export function VehicleLocationMap(props: VehicleLocationMapProps) {
  return (
    <Suspense fallback={<MapLoading height={props.height ?? 260} />}>
      <VehicleLocationMapImpl {...props} />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loading: {
    width: '100%',
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
