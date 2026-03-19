import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { UploadTarget, uploadImageToApi } from '../../api/uploads';
import { prepareUploadImage } from '../../api/prepareUploadImage';
import { resolveStoredImageUrl } from '../../api/storage';
import { EmptyState } from '../../app/components/ui/EmptyState';
import { styles } from '../../app/styles';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { hasMinimumProfileData } from '../../shared/verification';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserProfileStore } from '../../store/useUserProfileStore';

type ProfileMode = 'overview' | 'account' | 'personal' | 'documents';

type ActionButtonVariant = 'primary' | 'ghost' | 'danger';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ActionButtonVariant;
};

function ActionButton({ label, onPress, disabled = false, variant = 'primary' }: ActionButtonProps) {
  const buttonVariantStyle =
    variant === 'ghost'
      ? localStyles.actionButtonGhost
      : variant === 'danger'
        ? localStyles.actionButtonDanger
        : localStyles.actionButtonPrimary;

  const textVariantStyle =
    variant === 'ghost'
      ? localStyles.actionButtonGhostText
      : variant === 'danger'
        ? localStyles.actionButtonDangerText
        : localStyles.actionButtonPrimaryText;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[localStyles.actionButton, buttonVariantStyle, disabled ? localStyles.actionButtonDisabled : undefined]}
    >
      <Text style={[localStyles.actionButtonText, textVariantStyle]}>{label}</Text>
    </Pressable>
  );
}

type LabeledInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  secureTextEntry = false,
  autoCapitalize = 'sentences'
}: LabeledInputProps) {
  return (
    <View style={localStyles.inputFieldWrap}>
      <Text style={localStyles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={localStyles.inputField}
        placeholder={placeholder}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholderTextColor={colorTokens.textMuted}
      />
    </View>
  );
}

type MenuActionCardProps = {
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
  disabled?: boolean;
};

function MenuActionCard({ title, subtitle, badge, onPress, disabled = false }: MenuActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[localStyles.menuActionCard, disabled ? localStyles.actionButtonDisabled : undefined]}
    >
      <View style={localStyles.menuActionTextWrap}>
        <Text style={localStyles.menuActionTitle}>{title}</Text>
        <Text style={localStyles.menuActionSubtitle}>{subtitle}</Text>
      </View>
      <View style={localStyles.menuActionSide}>
        {badge ? <Text style={localStyles.menuActionBadge}>{badge}</Text> : null}
        <Text style={localStyles.menuActionChevron}>{'>'}</Text>
      </View>
    </Pressable>
  );
}

function SectionShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View style={localStyles.sheetCard}>
      <View style={localStyles.sheetHeader}>
        <Text style={localStyles.sheetTitle}>{title}</Text>
        <Text style={localStyles.sheetSubtitle}>{subtitle}</Text>
      </View>
      <View style={localStyles.sheetContent}>{children}</View>
    </View>
  );
}

export function ProfileScreen() {
  const [mode, setMode] = useState<ProfileMode>('overview');
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

  const hasProfileMinimum = hasMinimumProfileData(profile);
  const isReadyForTransactions = hasProfileMinimum && Boolean(profile?.isVerified);

  const completionPercent = useMemo(() => {
    let done = 0;
    const total = 3;

    if (hasProfileMinimum) {
      done += 1;
    }

    if (profile?.idDocumentUrl) {
      done += 1;
    }

    if (profile?.driverLicenseUrl) {
      done += 1;
    }

    return Math.round((done / total) * 100);
  }, [hasProfileMinimum, profile?.idDocumentUrl, profile?.driverLicenseUrl]);

  const buildPayload = () => ({
    firstName: firstNameInput.trim(),
    lastName: lastNameInput.trim(),
    phoneNumber: phoneInput.trim() || null,
    avatarUrl: avatarInput.trim() || null,
    idDocumentUrl: idDocumentInput.trim() || null,
    driverLicenseUrl: driverLicenseInput.trim() || null
  });

  const pickSingleImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      throw new Error('Permiso de galeria denegado');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85
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
        await updateMyProfile({ ...buildPayload(), avatarUrl: uploadedUrl });
      }

      if (target === 'id_document') {
        setIdDocumentInput(uploadedUrl);
      }

      if (target === 'driver_license') {
        setDriverLicenseInput(uploadedUrl);
      }

      if (target === 'avatar') {
        setProfileUploadMessage('Avatar actualizado.');
      } else {
        setProfileUploadMessage('Documento subido. Pulsa Guardar cambios para persistir.');
      }
    } catch {
      setProfileUploadMessage('No se pudo subir la imagen. Revisa permisos, tamano y bucket.');
    } finally {
      setProfileUploadingField(null);
    }
  };

  const renderOverview = () => {
    const firstInitial = (firstNameInput[0] ?? '?').toUpperCase();
    const lastInitial = (lastNameInput[0] ?? '').toUpperCase();

    return (
      <>
        <View style={localStyles.heroCard}>
          <View style={localStyles.heroDecorA} />
          <View style={localStyles.heroDecorB} />
          <View style={localStyles.heroContent}>
            <View style={localStyles.heroTopRow}>
              <Pressable
                onPress={() => void handleUploadUserImage('avatar')}
                disabled={!authUserId || profileUploadingField !== null}
                style={localStyles.heroAvatarPressable}
              >
                {resolvedProfileAvatarUrl ? (
                  <Image source={{ uri: resolvedProfileAvatarUrl }} style={localStyles.heroAvatar} resizeMode="cover" />
                ) : (
                  <View style={localStyles.heroAvatarFallback}>
                    <Text style={localStyles.heroInitials}>{firstInitial}{lastInitial}</Text>
                  </View>
                )}
                <View style={localStyles.heroAvatarBadge}>
                  <Text style={localStyles.heroAvatarBadgeText}>Editar</Text>
                </View>
              </Pressable>

              <View style={localStyles.heroIdentityBlock}>
                <Text style={localStyles.heroWelcome}>Tu espacio</Text>
                <Text style={localStyles.heroName}>{firstNameInput || 'Completa'} {lastNameInput || 'tu perfil'}</Text>
                <Text style={localStyles.heroMail}>{authEmail ?? 'Sin sesion iniciada'}</Text>
              </View>
            </View>

            <View style={localStyles.completionWrap}>
              <View style={localStyles.completionHeader}>
                <Text style={localStyles.completionTitle}>Nivel de perfil</Text>
                <Text style={localStyles.completionValue}>{completionPercent}%</Text>
              </View>
              <View style={localStyles.progressTrack}>
                <View style={[localStyles.progressFill, { width: `${completionPercent}%` }]} />
              </View>
              <Text style={localStyles.completionHint}>
                {isReadyForTransactions
                  ? 'Listo para reservar y gestionar alquileres.'
                  : 'Completa datos y documentacion para desbloquear reservas.'}
              </Text>
            </View>

            <View style={localStyles.heroQuickStatsRow}>
              <View style={localStyles.heroStatPill}>
                <Text style={localStyles.heroStatLabel}>Identidad</Text>
                <Text style={localStyles.heroStatValue}>{hasProfileMinimum ? 'Completa' : 'Pendiente'}</Text>
              </View>
              <View style={localStyles.heroStatPill}>
                <Text style={localStyles.heroStatLabel}>Documentos</Text>
                <Text style={localStyles.heroStatValue}>{profile?.isVerified ? 'Verificados' : 'En revision'}</Text>
              </View>
            </View>
          </View>
        </View>

        {!authUserId ? (
          <View style={styles.card}>
            <EmptyState
              title="Sesion no iniciada"
              description="Inicia sesion para personalizar tu perfil y activar acciones de alquiler."
            />
            <View style={localStyles.inlineActions}>
              <ActionButton label="Ir a cuenta" onPress={() => setMode('account')} />
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={localStyles.sectionTitle}>Gestionar perfil</Text>
          <Text style={localStyles.sectionSubtitle}>Acciones principales para mantener tu cuenta lista.</Text>

          <View style={localStyles.menuList}>
            <MenuActionCard
              title="Datos personales"
              subtitle="Nombre, telefono y foto de perfil"
              badge={hasProfileMinimum ? 'OK' : 'Pendiente'}
              onPress={() => setMode('personal')}
              disabled={!authUserId}
            />
            <MenuActionCard
              title="Documentacion"
              subtitle="DNI y carnet para validar identidad"
              badge={profile?.isVerified ? 'Verificada' : 'Pendiente'}
              onPress={() => setMode('documents')}
              disabled={!authUserId}
            />
            <MenuActionCard
              title="Cuenta"
              subtitle="Login, registro y cierre de sesion"
              onPress={() => setMode('account')}
            />
          </View>

          <View style={localStyles.inlineActions}>
            <ActionButton
              label="Actualizar perfil"
              onPress={() => void fetchMyProfile()}
              disabled={!authUserId || authLoading}
              variant="ghost"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={localStyles.sectionTitle}>Estado de cuenta</Text>
          <Text style={localStyles.sectionSubtitle}>Resumen rapido para saber que te falta para operar sin friccion.</Text>

          <View style={localStyles.qualityList}>
            <View style={localStyles.qualityRow}>
              <Text style={localStyles.qualityLabel}>Perfil minimo</Text>
              <Text style={hasProfileMinimum ? localStyles.qualityOk : localStyles.qualityPending}>
                {hasProfileMinimum ? 'Completado' : 'Pendiente'}
              </Text>
            </View>
            <View style={localStyles.qualityRow}>
              <Text style={localStyles.qualityLabel}>DNI</Text>
              <Text style={profile?.idDocumentUrl ? localStyles.qualityOk : localStyles.qualityPending}>
                {profile?.idDocumentUrl ? 'Subido' : 'Sin subir'}
              </Text>
            </View>
            <View style={localStyles.qualityRow}>
              <Text style={localStyles.qualityLabel}>Carnet</Text>
              <Text style={profile?.driverLicenseUrl ? localStyles.qualityOk : localStyles.qualityPending}>
                {profile?.driverLicenseUrl ? 'Subido' : 'Sin subir'}
              </Text>
            </View>
            <View style={localStyles.qualityRow}>
              <Text style={localStyles.qualityLabel}>Reservas y pagos</Text>
              <Text style={isReadyForTransactions ? localStyles.qualityOk : localStyles.qualityPending}>
                {isReadyForTransactions ? 'Habilitado' : 'Bloqueado'}
              </Text>
            </View>
          </View>

          <View style={localStyles.inlineActions}>
            <ActionButton label="Completar documentacion" onPress={() => setMode('documents')} disabled={!authUserId} />
            <ActionButton label="Editar datos" onPress={() => setMode('personal')} disabled={!authUserId} variant="ghost" />
          </View>
        </View>
      </>
    );
  };

  const renderPersonalMode = () => (
    <SectionShell title="Datos personales" subtitle="Cuida tu primera impresion con una ficha clara y profesional.">
      <View style={localStyles.personalAvatarRow}>
        <Pressable
          onPress={() => void handleUploadUserImage('avatar')}
          disabled={!authUserId || profileUploadingField !== null}
          style={localStyles.personalAvatarPressable}
        >
          {resolvedProfileAvatarUrl ? (
            <Image source={{ uri: resolvedProfileAvatarUrl }} style={localStyles.personalAvatar} resizeMode="cover" />
          ) : (
            <View style={localStyles.personalAvatarFallback}>
              <Text style={localStyles.personalAvatarText}>Foto</Text>
            </View>
          )}
        </Pressable>
        <View style={localStyles.personalAvatarInfo}>
          <Text style={localStyles.personalAvatarTitle}>Imagen de perfil</Text>
          <Text style={localStyles.personalAvatarHint}>Toca la foto para cambiarla al instante.</Text>
        </View>
      </View>

      <View style={localStyles.formGrid}>
        <LabeledInput
          label="Nombre"
          value={firstNameInput}
          onChangeText={setFirstNameInput}
          placeholder="Tu nombre"
          autoCapitalize="words"
        />
        <LabeledInput
          label="Apellidos"
          value={lastNameInput}
          onChangeText={setLastNameInput}
          placeholder="Tus apellidos"
          autoCapitalize="words"
        />
        <LabeledInput
          label="Telefono"
          value={phoneInput}
          onChangeText={setPhoneInput}
          placeholder="+34..."
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
      </View>

      <View style={localStyles.accountStatusCard}>
        <Text style={localStyles.accountStatusLabel}>Email de cuenta</Text>
        <Text style={localStyles.accountStatusValue}>{authEmail ?? 'Sin email en sesion'}</Text>
      </View>

      <View style={localStyles.inlineActions}>
        <ActionButton
          label={saving ? 'Guardando...' : 'Guardar cambios'}
          onPress={() => void updateMyProfile(buildPayload())}
          disabled={saving || !authUserId}
        />
      </View>

      <View style={localStyles.inlineActions}>
        <ActionButton label="Volver" onPress={() => setMode('overview')} variant="ghost" />
      </View>
    </SectionShell>
  );

  const renderDocumentsMode = () => (
    <SectionShell title="Documentacion" subtitle="Sube tus documentos de forma segura para habilitar transacciones.">
      <View style={localStyles.docsGrid}>
        <View style={localStyles.docCard}>
          <Text style={localStyles.docTitle}>Documento de identidad</Text>
          <Text style={localStyles.docStatus}>{idDocumentInput ? 'Subido' : 'Pendiente'}</Text>
          <View style={localStyles.inlineActions}>
            <ActionButton
              label={profileUploadingField === 'id_document' ? 'Subiendo...' : idDocumentInput ? 'Reemplazar DNI' : 'Subir DNI'}
              onPress={() => void handleUploadUserImage('id_document')}
              disabled={profileUploadingField !== null || !authUserId}
              variant="ghost"
            />
            {idDocumentInput ? (
              <ActionButton label="Eliminar" onPress={() => setIdDocumentInput('')} variant="danger" />
            ) : null}
          </View>
        </View>

        <View style={localStyles.docCard}>
          <Text style={localStyles.docTitle}>Permiso de conducir</Text>
          <Text style={localStyles.docStatus}>{driverLicenseInput ? 'Subido' : 'Pendiente'}</Text>
          <View style={localStyles.inlineActions}>
            <ActionButton
              label={profileUploadingField === 'driver_license' ? 'Subiendo...' : driverLicenseInput ? 'Reemplazar carnet' : 'Subir carnet'}
              onPress={() => void handleUploadUserImage('driver_license')}
              disabled={profileUploadingField !== null || !authUserId}
              variant="ghost"
            />
            {driverLicenseInput ? (
              <ActionButton label="Eliminar" onPress={() => setDriverLicenseInput('')} variant="danger" />
            ) : null}
          </View>
        </View>
      </View>

      <View style={localStyles.inlineActions}>
        <ActionButton
          label={saving ? 'Guardando...' : 'Guardar cambios'}
          onPress={() => void updateMyProfile(buildPayload())}
          disabled={saving || !authUserId}
        />
        <ActionButton label="Volver" onPress={() => setMode('overview')} variant="ghost" />
      </View>
    </SectionShell>
  );

  const renderAccountMode = () => (
    <SectionShell title="Cuenta" subtitle="Gestiona acceso y seguridad desde una vista dedicada.">
      <View style={localStyles.formGrid}>
        <LabeledInput
          label="Email"
          value={emailInput}
          onChangeText={setEmailInput}
          placeholder="tu@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <LabeledInput
          label="Contrasena"
          value={passwordInput}
          onChangeText={setPasswordInput}
          placeholder="********"
          secureTextEntry
          autoCapitalize="none"
        />
      </View>

      <View style={localStyles.inlineActions}>
        <ActionButton label="Iniciar sesion" onPress={() => void signIn()} disabled={authLoading} />
        <ActionButton label="Crear cuenta" onPress={() => void signUp()} disabled={authLoading} variant="ghost" />
        <ActionButton
          label="Cerrar sesion"
          onPress={() => void signOut()}
          disabled={authLoading || !authUserId}
          variant="danger"
        />
      </View>

      <View style={localStyles.accountStatusCard}>
        <Text style={localStyles.accountStatusLabel}>Estado de sesion</Text>
        <Text style={localStyles.accountStatusValue}>{authUserId ? 'Activa' : 'No iniciada'}</Text>
      </View>

      <View style={localStyles.inlineActions}>
        <ActionButton label="Volver" onPress={() => setMode('overview')} variant="ghost" />
      </View>
    </SectionShell>
  );

  return (
    <View style={styles.sectionCard}>
      {mode === 'overview' ? renderOverview() : null}
      {mode === 'personal' ? renderPersonalMode() : null}
      {mode === 'documents' ? renderDocumentsMode() : null}
      {mode === 'account' ? renderAccountMode() : null}

      {authLoading || saving || profileUploadingField ? <ActivityIndicator size="small" /> : null}
      {authError ? <Text style={styles.error}>{authError}</Text> : null}
      {authMessage ? <Text style={styles.info}>{authMessage}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {mutationMessage ? <Text style={styles.info}>{mutationMessage}</Text> : null}
      {profileUploadMessage ? <Text style={styles.info}>{profileUploadMessage}</Text> : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 22,
    backgroundColor: colorTokens.primary,
    padding: spacingTokens.lg,
    minHeight: 210,
    shadowColor: '#0B0F14',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4
    },
    elevation: 2
  },
  heroDecorA: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#1E3A5F',
    top: -60,
    right: -30,
    opacity: 0.55
  },
  heroDecorB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#4C8CAD',
    bottom: -40,
    left: -10,
    opacity: 0.35
  },
  heroContent: {
    gap: spacingTokens.lg,
    zIndex: 2
  },
  heroAvatarPressable: {
    position: 'relative'
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  heroAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)'
  },
  heroAvatarFallback: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroAvatarBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    borderWidth: 1,
    borderColor: '#FFB38A',
    borderRadius: radiusTokens.pill,
    backgroundColor: colorTokens.accent2,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  heroAvatarBadgeText: {
    color: colorTokens.white,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700'
  },
  heroInitials: {
    color: colorTokens.white,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: 0.4
  },
  heroIdentityBlock: {
    flex: 1,
    gap: spacingTokens.xs
  },
  heroWelcome: {
    color: 'rgba(255,255,255,0.75)',
    ...typographyTokens.caption
  },
  heroName: {
    color: colorTokens.white,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700'
  },
  heroMail: {
    color: 'rgba(255,255,255,0.82)',
    ...typographyTokens.caption
  },
  completionWrap: {
    gap: spacingTokens.xs
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  completionTitle: {
    color: colorTokens.white,
    ...typographyTokens.caption
  },
  completionValue: {
    color: '#FFB38A',
    fontWeight: '700'
  },
  progressTrack: {
    height: 8,
    borderRadius: radiusTokens.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: radiusTokens.pill,
    backgroundColor: colorTokens.accent2
  },
  completionHint: {
    color: 'rgba(255,255,255,0.9)',
    ...typographyTokens.caption
  },
  heroQuickStatsRow: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  heroStatPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,179,138,0.6)',
    borderRadius: 12,
    backgroundColor: 'rgba(227,100,20,0.18)',
    paddingHorizontal: spacingTokens.sm,
    paddingVertical: spacingTokens.sm,
    gap: 2
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.72)',
    ...typographyTokens.caption
  },
  heroStatValue: {
    color: '#FFE1D0',
    ...typographyTokens.sectionLabel
  },
  sectionTitle: {
    color: colorTokens.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700'
  },
  sectionSubtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.body
  },
  qualityList: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 14,
    overflow: 'hidden'
  },
  qualityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    borderBottomWidth: 1,
    borderBottomColor: colorTokens.border,
    backgroundColor: '#FCFCFD'
  },
  qualityLabel: {
    color: colorTokens.secondary,
    ...typographyTokens.body
  },
  qualityOk: {
    color: colorTokens.accent2,
    ...typographyTokens.caption
  },
  qualityPending: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  menuList: {
    gap: spacingTokens.sm,
    marginTop: spacingTokens.sm
  },
  menuActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.bgLight,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md
  },
  menuActionTextWrap: {
    flex: 1,
    gap: 2,
    paddingRight: spacingTokens.sm
  },
  menuActionTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  menuActionSubtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  menuActionSide: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacingTokens.xs
  },
  menuActionBadge: {
    color: colorTokens.secondary,
    ...typographyTokens.caption
  },
  menuActionChevron: {
    color: colorTokens.secondary,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700'
  },
  sheetCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colorTokens.white
  },
  sheetHeader: {
    backgroundColor: '#FAFBFD',
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.md,
    borderBottomWidth: 1,
    borderBottomColor: colorTokens.border,
    gap: spacingTokens.xs
  },
  sheetTitle: {
    color: colorTokens.primary,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700'
  },
  sheetSubtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  sheetContent: {
    padding: spacingTokens.lg,
    gap: spacingTokens.md
  },
  formGrid: {
    gap: spacingTokens.md
  },
  personalAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 14,
    backgroundColor: '#FCFCFD',
    padding: spacingTokens.md
  },
  personalAvatarPressable: {
    position: 'relative'
  },
  personalAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colorTokens.accent2
  },
  personalAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colorTokens.accent2,
    backgroundColor: '#FFF0E8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  personalAvatarText: {
    color: colorTokens.accent2,
    ...typographyTokens.caption
  },
  personalAvatarInfo: {
    flex: 1,
    gap: spacingTokens.xs
  },
  personalAvatarTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  personalAvatarHint: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  inputFieldWrap: {
    gap: spacingTokens.xs
  },
  inputLabel: {
    color: colorTokens.secondary,
    ...typographyTokens.caption
  },
  inputField: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 14,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    color: colorTokens.textMain,
    backgroundColor: colorTokens.white,
    ...typographyTokens.body
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm
  },
  docsGrid: {
    gap: spacingTokens.md
  },
  docCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 14,
    backgroundColor: '#FCFCFD',
    padding: spacingTokens.md,
    gap: spacingTokens.sm
  },
  docTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  docStatus: {
    color: colorTokens.accent2,
    ...typographyTokens.caption
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.sm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionButtonDisabled: {
    opacity: 0.45
  },
  actionButtonText: {
    ...typographyTokens.caption
  },
  actionButtonPrimary: {
    backgroundColor: colorTokens.primary,
    borderColor: colorTokens.primary
  },
  actionButtonPrimaryText: {
    color: colorTokens.white,
    fontWeight: '700'
  },
  actionButtonGhost: {
    backgroundColor: colorTokens.white,
    borderColor: colorTokens.secondary
  },
  actionButtonGhostText: {
    color: colorTokens.secondary,
    fontWeight: '700'
  },
  actionButtonDanger: {
    backgroundColor: colorTokens.white,
    borderColor: colorTokens.alert
  },
  actionButtonDangerText: {
    color: colorTokens.alert,
    fontWeight: '700'
  },
  accountStatusCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 12,
    backgroundColor: colorTokens.bgLight,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    gap: spacingTokens.xs
  },
  accountStatusLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  accountStatusValue: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  }
});