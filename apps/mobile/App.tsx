import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Button, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useUserProfileStore } from './src/store/useUserProfileStore';

export default function App() {
  const {
    selectedUserId,
    profile,
    loading,
    error,
    setSelectedUserId,
    fetchProfile
  } = useUserProfileStore();

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Perfil de Usuario</Text>
        <Text style={styles.subtitle}>Consumido desde la API de NestJS</Text>

        <TextInput
          value={selectedUserId}
          onChangeText={setSelectedUserId}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="UUID de usuario"
        />

        <View style={styles.buttonContainer}>
          <Button title="Cargar perfil" onPress={fetchProfile} />
        </View>

        {loading && <ActivityIndicator size="small" />}

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
      </ScrollView>
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
    padding: 16,
    gap: 12
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
  }
});
