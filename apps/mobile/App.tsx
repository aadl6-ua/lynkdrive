import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { useUserProfileStore } from './src/store/useUserProfileStore';
import { useVehiclesStore } from './src/store/useVehiclesStore';

type TabKey = 'explore' | 'trips' | 'myVehicles' | 'profile';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'explore', label: 'Explorar' },
  { key: 'trips', label: 'Mis Viajes' },
  { key: 'myVehicles', label: 'Mis Vehículos' },
  { key: 'profile', label: 'Perfil' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('profile');
  const { width } = useWindowDimensions();
  const isDesktopLike = Platform.OS === 'web' || width >= 768;

  const {
    selectedUserId,
    profile,
    loading,
    error,
    setSelectedUserId,
    fetchProfile
  } = useUserProfileStore();

  const {
    items: vehicles,
    loading: vehiclesLoading,
    error: vehiclesError,
    fetchVehicles
  } = useVehiclesStore();

  useEffect(() => {
    fetchVehicles();
    fetchProfile();
  }, [fetchVehicles, fetchProfile]);

  const myVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.ownerId === selectedUserId),
    [vehicles, selectedUserId]
  );

  const handleReloadForSelectedUser = async () => {
    await Promise.all([fetchProfile(), fetchVehicles()]);
  };

  const renderContent = () => {
    if (activeTab === 'explore') {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.title}>Explorar</Text>
          <Text style={styles.subtitle}>Listado de vehículos cercanos, filtros y acceso a ficha.</Text>

          <View style={styles.buttonContainer}>
            <Button title="Recargar vehículos" onPress={fetchVehicles} />
          </View>

          {vehiclesLoading ? <ActivityIndicator size="small" /> : null}

          {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}

          {vehicles.map((vehicle) => (
            <View key={vehicle.id} style={styles.card}>
              <Text style={styles.row}>
                <Text style={styles.label}>Vehículo:</Text> {vehicle.brand} {vehicle.model} ({vehicle.year})
              </Text>
              <Text style={styles.row}>
                <Text style={styles.label}>Precio/día:</Text> {vehicle.pricePerDay.toFixed(2)} €
              </Text>
              <Text style={styles.row}>
                <Text style={styles.label}>Ubicación:</Text> {vehicle.locationAddress}
              </Text>
              <Text style={styles.row}>
                <Text style={styles.label}>Combustible:</Text> {vehicle.fuelType ?? 'No definido'}
              </Text>
              <Text style={styles.row}>
                <Text style={styles.label}>Transmisión:</Text> {vehicle.transmission ?? 'No definida'}
              </Text>
              <Text style={styles.row}>
                <Text style={styles.label}>Es mío:</Text> {vehicle.ownerId === selectedUserId ? 'Sí' : 'No'}
              </Text>
            </View>
          ))}

          {!vehiclesLoading && !vehiclesError && vehicles.length === 0 ? (
            <Text style={styles.subtitle}>No hay vehículos disponibles todavía.</Text>
          ) : null}
        </View>
      );
    }

    if (activeTab === 'trips') {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.title}>Mis Viajes</Text>
          <Text style={styles.subtitle}>Solicitudes enviadas, recibidas y calendario.</Text>
          <View style={styles.card}>
            <Text style={styles.row}><Text style={styles.label}>Usuario activo:</Text> {selectedUserId}</Text>
            <Text style={styles.row}><Text style={styles.label}>Nombre:</Text> {profile ? `${profile.firstName} ${profile.lastName}` : 'Sin cargar'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Estado:</Text> API de reservas pendiente de implementar</Text>
          </View>
        </View>
      );
    }

    if (activeTab === 'myVehicles') {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.title}>Mis Vehículos</Text>
          <Text style={styles.subtitle}>Alta, edición, fotos y disponibilidad de tus vehículos.</Text>

          <View style={styles.buttonContainer}>
            <Button title="Recargar" onPress={fetchVehicles} />
          </View>

          {vehiclesLoading ? <ActivityIndicator size="small" /> : null}
          {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}

          {myVehicles.map((vehicle) => (
            <View key={vehicle.id} style={styles.card}>
              <Text style={styles.row}><Text style={styles.label}>Vehículo:</Text> {vehicle.brand} {vehicle.model}</Text>
              <Text style={styles.row}><Text style={styles.label}>Matrícula:</Text> {vehicle.licensePlate}</Text>
              <Text style={styles.row}><Text style={styles.label}>Precio/día:</Text> {vehicle.pricePerDay.toFixed(2)} €</Text>
              <Text style={styles.row}><Text style={styles.label}>Estado:</Text> {vehicle.status}</Text>
            </View>
          ))}

          {!vehiclesLoading && !vehiclesError && myVehicles.length === 0 ? (
            <Text style={styles.subtitle}>Este usuario no tiene vehículos asociados.</Text>
          ) : null}
        </View>
      );
    }

    return (
      <View style={styles.sectionCard}>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.subtitle}>Datos personales y documentación (vía API).</Text>

        {profile ? (
          <View style={styles.card}>
            <Text style={styles.row}><Text style={styles.label}>ID:</Text> {profile.id}</Text>
            <Text style={styles.row}><Text style={styles.label}>Nombre:</Text> {profile.firstName} {profile.lastName}</Text>
            <Text style={styles.row}><Text style={styles.label}>Teléfono:</Text> {profile.phoneNumber ?? 'No definido'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Verificado:</Text> {profile.isVerified ? 'Sí' : 'No'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Avatar:</Text> {profile.avatarUrl ?? 'No definido'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Alta:</Text> {new Date(profile.createdAt).toLocaleString('es-ES')}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={isDesktopLike ? styles.topNav : styles.hiddenNav}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.navButton, activeTab === tab.key ? styles.navButtonActive : undefined]}
          >
            <Text style={activeTab === tab.key ? styles.navLabelActive : styles.navLabel}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={[styles.content, !isDesktopLike ? styles.contentWithBottomBar : undefined]}>
        <View style={styles.userSwitcherCard}>
          <Text style={styles.switcherTitle}>Usuario activo para demo</Text>
          <TextInput
            value={selectedUserId}
            onChangeText={setSelectedUserId}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="UUID de usuario"
          />
          <View style={styles.buttonContainer}>
            <Button title="Aplicar usuario" onPress={handleReloadForSelectedUser} />
          </View>
          {loading ? <ActivityIndicator size="small" /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {profile ? (
            <Text style={styles.subtitle}>Sesión demo: {profile.firstName} {profile.lastName}</Text>
          ) : null}
        </View>

        {renderContent()}
      </ScrollView>

      {!isDesktopLike ? (
        <View style={styles.bottomNav}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.navButton, activeTab === tab.key ? styles.navButtonActive : undefined]}
            >
              <Text style={activeTab === tab.key ? styles.navLabelActive : styles.navLabel}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  content: {
    padding: 16
  },
  contentWithBottomBar: {
    paddingBottom: 96
  },
  sectionCard: {
    gap: 12
  },
  userSwitcherCard: {
    gap: 10,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10
  },
  switcherTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  title: {
    fontSize: 24,
    fontWeight: '700'
  },
  subtitle: {
    fontSize: 14,
    color: '#555'
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14
  },
  buttonContainer: {
    alignSelf: 'flex-start'
  },
  card: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  row: {
    fontSize: 14
  },
  label: {
    fontWeight: '600'
  },
  error: {
    color: '#b00020',
    fontSize: 13
  },
  topNav: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#ddd'
  },
  hiddenNav: {
    display: 'none'
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff'
  },
  navButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8
  },
  navButtonActive: {
    borderWidth: 1,
    borderColor: '#222'
  },
  navLabel: {
    fontSize: 13
  },
  navLabelActive: {
    fontSize: 13,
    fontWeight: '700'
  }
});
