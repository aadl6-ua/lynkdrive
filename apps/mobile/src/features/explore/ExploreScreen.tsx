import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Image, Text, TextInput, View } from 'react-native';
import { resolveStoredImageUrl } from '../../api/storage';
import { styles } from '../../app/styles';
import { parseLocaleNumber } from '../../shared/number';
import { useVehiclePrimaryImages } from '../../shared/useVehiclePrimaryImages';
import { useAuthStore } from '../../store/useAuthStore';
import { useVehiclesStore } from '../../store/useVehiclesStore';

export function ExploreScreen() {
  const [exploreMaxPriceInput, setExploreMaxPriceInput] = useState('');
  const [exploreFuelTypeInput, setExploreFuelTypeInput] = useState('');
  const [exploreTransmissionInput, setExploreTransmissionInput] = useState('');
  const [exploreSeatsInput, setExploreSeatsInput] = useState('');
  const [exploreLatInput, setExploreLatInput] = useState('');
  const [exploreLngInput, setExploreLngInput] = useState('');
  const [exploreRadiusInput, setExploreRadiusInput] = useState('');

  const { items: vehicles, loading: vehiclesLoading, error: vehiclesError, fetchVehicles } = useVehiclesStore();
  const { userId: authUserId } = useAuthStore();
  const imageByVehicleId = useVehiclePrimaryImages(vehicles.map((vehicle) => vehicle.id));

  useEffect(() => {
    void fetchVehicles();
  }, [fetchVehicles]);

  const handleApplyExploreFilters = async () => {
    const parsedMaxPrice = parseLocaleNumber(exploreMaxPriceInput);
    const parsedSeats = parseLocaleNumber(exploreSeatsInput);
    const parsedLat = parseLocaleNumber(exploreLatInput);
    const parsedLng = parseLocaleNumber(exploreLngInput);
    const parsedRadius = parseLocaleNumber(exploreRadiusInput);

    await fetchVehicles({
      maxPrice: exploreMaxPriceInput.trim() && !Number.isNaN(parsedMaxPrice) ? parsedMaxPrice : undefined,
      fuelType: ['gasoline', 'diesel', 'electric', 'hybrid'].includes(exploreFuelTypeInput)
        ? (exploreFuelTypeInput as 'gasoline' | 'diesel' | 'electric' | 'hybrid')
        : undefined,
      transmission: ['manual', 'automatic'].includes(exploreTransmissionInput)
        ? (exploreTransmissionInput as 'manual' | 'automatic')
        : undefined,
      seats: exploreSeatsInput.trim() && !Number.isNaN(parsedSeats) ? parsedSeats : undefined,
      lat: exploreLatInput.trim() && !Number.isNaN(parsedLat) ? parsedLat : undefined,
      lng: exploreLngInput.trim() && !Number.isNaN(parsedLng) ? parsedLng : undefined,
      radiusKm: exploreRadiusInput.trim() && !Number.isNaN(parsedRadius) ? parsedRadius : undefined
    });
  };

  const handleClearExploreFilters = async () => {
    setExploreMaxPriceInput('');
    setExploreFuelTypeInput('');
    setExploreTransmissionInput('');
    setExploreSeatsInput('');
    setExploreLatInput('');
    setExploreLngInput('');
    setExploreRadiusInput('');
    await fetchVehicles();
  };

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.title}>Explorar</Text>
      <Text style={styles.subtitle}>Listado de vehiculos cercanos, filtros y acceso a ficha.</Text>

      <View style={styles.card}>
        <Text style={styles.switcherTitle}>Filtros</Text>
        <TextInput
          value={exploreMaxPriceInput}
          onChangeText={setExploreMaxPriceInput}
          style={styles.input}
          placeholder="Precio maximo (EUR)"
          keyboardType="decimal-pad"
        />
        <TextInput
          value={exploreFuelTypeInput}
          onChangeText={setExploreFuelTypeInput}
          style={styles.input}
          placeholder="Combustible: gasoline|diesel|electric|hybrid"
          autoCapitalize="none"
        />
        <TextInput
          value={exploreTransmissionInput}
          onChangeText={setExploreTransmissionInput}
          style={styles.input}
          placeholder="Transmision: manual|automatic"
          autoCapitalize="none"
        />
        <TextInput
          value={exploreSeatsInput}
          onChangeText={setExploreSeatsInput}
          style={styles.input}
          placeholder="Plazas minimas"
          keyboardType="number-pad"
        />
        <TextInput
          value={exploreLatInput}
          onChangeText={setExploreLatInput}
          style={styles.input}
          placeholder="Latitud centro"
          keyboardType="numbers-and-punctuation"
        />
        <TextInput
          value={exploreLngInput}
          onChangeText={setExploreLngInput}
          style={styles.input}
          placeholder="Longitud centro"
          keyboardType="numbers-and-punctuation"
        />
        <TextInput
          value={exploreRadiusInput}
          onChangeText={setExploreRadiusInput}
          style={styles.input}
          placeholder="Radio (km)"
          keyboardType="decimal-pad"
        />

        <View style={styles.actionsRow}>
          <View style={styles.actionButtonWrapper}>
            <Button title="Aplicar" onPress={() => void handleApplyExploreFilters()} />
          </View>
          <View style={styles.actionButtonWrapper}>
            <Button title="Limpiar" onPress={() => void handleClearExploreFilters()} />
          </View>
        </View>
      </View>

      {vehiclesLoading ? <ActivityIndicator size="small" /> : null}
      {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}

      {vehicles.map((vehicle) => (
        <View key={vehicle.id} style={styles.card}>
          {resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null) ? (
            <Image
              source={{ uri: resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null) ?? '' }}
              style={styles.vehicleCardMedia}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.vehicleCardMediaPlaceholder}>
              <Text style={styles.vehicleCardMediaPlaceholderText}>Sin imagen</Text>
            </View>
          )}
          <Text style={styles.cardTitle}>{vehicle.brand} {vehicle.model}</Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Ano:</Text> {vehicle.year}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Precio/dia:</Text> {vehicle.pricePerDay.toFixed(2)} EUR
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Ubicacion:</Text> {vehicle.locationAddress}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Combustible:</Text> {vehicle.fuelType ?? 'No definido'}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Transmision:</Text> {vehicle.transmission ?? 'No definida'}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Es mio:</Text> {vehicle.ownerId === authUserId ? 'Si' : 'No'}
          </Text>
        </View>
      ))}

      {!vehiclesLoading && !vehiclesError && vehicles.length === 0 ? (
        <Text style={styles.subtitle}>No hay vehiculos disponibles todavia.</Text>
      ) : null}
    </View>
  );
}
