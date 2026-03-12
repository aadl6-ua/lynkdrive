import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, Image, Text, TextInput, View } from 'react-native';
import { UploadTarget, uploadImageToApi } from '../../api/uploads';
import { prepareUploadImage } from '../../api/prepareUploadImage';
import { resolveStoredImageUrl } from '../../api/storage';
import { styles } from '../../app/styles';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserProfileStore } from '../../store/useUserProfileStore';

export function ProfileScreen() {
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');
  const [idDocumentInput, setIdDocumentInput] = useState('');
  const [driverLicenseInput, setDriverLicenseInput] = useState('');
  const [profileUploadingField, setProfileUploadingField] = useState<UploadTarget | null>(null);
  const [profileUploadMessage, setProfileUploadMessage] = useState<string | null>(null);

  const {
    profile,
    saving,
    error,
    mutationMessage,
    fetchMyProfile,
    updateMyProfile
  } = useUserProfileStore();

  const {
    userId: authUserId,
    email: authEmail,
    loading: authLoading,
    error: authError,
    message: authMessage,
    emailInput,
    passwordInput,
    setEmailInput,
    setPasswordInput,
    signIn,
    signUp,
    signOut
  } = useAuthStore();

  useEffect(() => {
    setFirstNameInput(profile?.firstName ?? '');
    setLastNameInput(profile?.lastName ?? '');
    setPhoneInput(profile?.phoneNumber ?? '');
    setAvatarInput(profile?.avatarUrl ?? '');
    setIdDocumentInput(profile?.idDocumentUrl ?? '');
    setDriverLicenseInput(profile?.driverLicenseUrl ?? '');
  }, [profile]);

  const resolvedProfileAvatarUrl = useMemo(
    () => resolveStoredImageUrl(profile?.avatarUrl ?? null),
    [profile?.avatarUrl]
  );

  const buildPayload = () => ({
    firstName: firstNameInput.trim(),
    lastName: lastNameInput.trim(),
    phoneNumber: phoneInput.trim() || null,
    avatarUrl: avatarInput.trim() || null,
    idDocumentUrl: idDocumentInput.trim() || null,
    driverLicenseUrl: driverLicenseInput.trim() || null
  });

  const handleUpdateUser = async () => {
    if (!authUserId) {
      return;
    }

    await updateMyProfile(buildPayload());
  };

  const pickSingleImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      throw new Error('Permiso de galeria denegado');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    return result.assets[0];
  };

  const uploadPickedImage = async (target: UploadTarget, ownerId?: string) => {
    const asset = await pickSingleImage();

    if (!asset) {
      return null;
    }

    const prepared = await prepareUploadImage(asset, target);

    const uploaded = await uploadImageToApi({
      target,
      ownerId,
      fileUri: prepared.fileUri,
      fileName: prepared.fileName,
      mimeType: prepared.mimeType,
      webFile: prepared.webFile
    });

    return uploaded.persistedValue;
  };

  const handleUploadUserImage = async (target: 'avatar' | 'id_document' | 'driver_license') => {
    try {
      setProfileUploadingField(target);
      setProfileUploadMessage(null);

      const uploadedUrl = await uploadPickedImage(target, authUserId ?? undefined);

      if (!uploadedUrl) {
        return;
      }

      if (target === 'avatar') {
        setAvatarInput(uploadedUrl);
      }

      if (target === 'id_document') {
        setIdDocumentInput(uploadedUrl);
      }

      if (target === 'driver_license') {
        setDriverLicenseInput(uploadedUrl);
      }

      setProfileUploadMessage('Imagen subida. Pulsa Guardar para persistir la URL en el perfil.');
    } catch {
      setProfileUploadMessage('No se pudo comprimir o subir la imagen. Revisa permisos, tamano y buckets.');
    } finally {
      setProfileUploadingField(null);
    }
  };

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.title}>Mi Perfil</Text>
      <Text style={styles.subtitle}>Gestiona tu identidad, documentacion y acceso de cuenta.</Text>

      {!authUserId ? (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Inicia sesion para cargar y editar tu perfil autenticado.</Text>
        </View>
      ) : null}

      <View style={styles.profileHeaderCard}>
        {resolvedProfileAvatarUrl ? (
          <Image source={{ uri: resolvedProfileAvatarUrl }} style={styles.avatarCircleImage} resizeMode="cover" />
        ) : (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>
              {(firstNameInput[0] ?? '?').toUpperCase()}
              {(lastNameInput[0] ?? '').toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.profileHeaderInfo}>
          <Text style={styles.profileName}>{firstNameInput || 'Nombre'} {lastNameInput || 'Apellido'}</Text>
          <Text style={styles.profileMeta}>ID: {authUserId ?? 'N/A'}</Text>
          <Text style={styles.profileMeta}>Estado de verificacion: {profile?.isVerified ? 'Verificado' : 'Pendiente'}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.switcherTitle}>Autenticacion Supabase</Text>
        <TextInput
          value={emailInput}
          onChangeText={setEmailInput}
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          value={passwordInput}
          onChangeText={setPasswordInput}
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.actionsRow}>
          <View style={styles.actionButtonWrapper}>
            <Button title="Login" onPress={() => void signIn()} disabled={authLoading} />
          </View>
          <View style={styles.actionButtonWrapper}>
            <Button title="Registro" onPress={() => void signUp()} disabled={authLoading} />
          </View>
          <View style={styles.actionButtonWrapper}>
            <Button title="Logout" onPress={() => void signOut()} disabled={authLoading || !authUserId} />
          </View>
        </View>

        {authLoading ? <ActivityIndicator size="small" /> : null}
        {authError ? <Text style={styles.error}>{authError}</Text> : null}
        {authMessage ? <Text style={styles.info}>{authMessage}</Text> : null}
        <Text style={styles.row}><Text style={styles.label}>Sesion:</Text> {authUserId ? 'Autenticada' : 'No autenticada'}</Text>
        <Text style={styles.row}><Text style={styles.label}>Auth user:</Text> {authUserId ?? 'N/A'}</Text>
        <Text style={styles.row}><Text style={styles.label}>Email:</Text> {authEmail ?? 'N/A'}</Text>

        <View style={styles.buttonContainer}>
          <Button title="Cargar /users/me" onPress={() => void fetchMyProfile()} disabled={!authUserId || authLoading} />
        </View>
      </View>

      <View style={styles.formGrid}>
        <TextInput value={firstNameInput} onChangeText={setFirstNameInput} style={styles.input} placeholder="Nombre" />
        <TextInput value={lastNameInput} onChangeText={setLastNameInput} style={styles.input} placeholder="Apellidos" />
        <TextInput value={phoneInput} onChangeText={setPhoneInput} style={styles.input} placeholder="Telefono" keyboardType="phone-pad" />
        <TextInput value={avatarInput} onChangeText={setAvatarInput} style={styles.input} placeholder="URL avatar" autoCapitalize="none" />
        <TextInput value={idDocumentInput} onChangeText={setIdDocumentInput} style={styles.input} placeholder="URL DNI" autoCapitalize="none" />
        <TextInput value={driverLicenseInput} onChangeText={setDriverLicenseInput} style={styles.input} placeholder="URL carnet" autoCapitalize="none" />
      </View>

      <View style={styles.formGrid}>
        <Button
          title={profileUploadingField === 'avatar' ? 'Subiendo avatar...' : 'Seleccionar y subir avatar'}
          onPress={() => void handleUploadUserImage('avatar')}
          disabled={profileUploadingField !== null || !authUserId}
        />
        <Button
          title={profileUploadingField === 'id_document' ? 'Subiendo DNI...' : 'Seleccionar y subir DNI'}
          onPress={() => void handleUploadUserImage('id_document')}
          disabled={profileUploadingField !== null || !authUserId}
        />
        <Button
          title={
            profileUploadingField === 'driver_license'
              ? 'Subiendo carnet...'
              : 'Seleccionar y subir carnet'
          }
          onPress={() => void handleUploadUserImage('driver_license')}
          disabled={profileUploadingField !== null || !authUserId}
        />
      </View>

      <View style={styles.actionsRow}>
        <View style={styles.actionButtonWrapper}>
          <Button title="Guardar" onPress={() => void handleUpdateUser()} disabled={saving || !authUserId} />
        </View>
      </View>

      {saving ? <ActivityIndicator size="small" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {mutationMessage ? <Text style={styles.info}>{mutationMessage}</Text> : null}
      {profileUploadMessage ? <Text style={styles.info}>{profileUploadMessage}</Text> : null}

      {profile ? (
        <View style={styles.card}>
          <Text style={styles.row}><Text style={styles.label}>ID:</Text> {profile.id}</Text>
          <Text style={styles.row}><Text style={styles.label}>Nombre:</Text> {profile.firstName} {profile.lastName}</Text>
          <Text style={styles.row}><Text style={styles.label}>Telefono:</Text> {profile.phoneNumber ?? 'No definido'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Verificado:</Text> {profile.isVerified ? 'Si' : 'No'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Avatar:</Text> {profile.avatarUrl ?? 'No definido'}</Text>
          {resolvedProfileAvatarUrl ? (
            <Image source={{ uri: resolvedProfileAvatarUrl }} style={styles.profileImagePreview} resizeMode="cover" />
          ) : null}
          <Text style={styles.row}><Text style={styles.label}>DNI:</Text> {profile.idDocumentUrl ?? 'No definido'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Carnet:</Text> {profile.driverLicenseUrl ?? 'No definido'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Alta:</Text> {new Date(profile.createdAt).toLocaleString('es-ES')}</Text>
        </View>
      ) : null}
    </View>
  );
}
