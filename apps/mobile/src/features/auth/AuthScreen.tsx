import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SectionHeader } from '../../app/components/ui/SectionHeader';
import { styles } from '../../app/styles';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { useAuthStore } from '../../store/useAuthStore';

type AuthMode = 'login' | 'register';

type ActionButtonVariant = 'primary' | 'ghost';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ActionButtonVariant;
};

function ActionButton({ label, onPress, disabled = false, variant = 'primary' }: ActionButtonProps) {
  const buttonVariantStyle = variant === 'ghost' ? localStyles.actionButtonGhost : localStyles.actionButtonPrimary;
  const textVariantStyle = variant === 'ghost' ? localStyles.actionButtonGhostText : localStyles.actionButtonPrimaryText;

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

export function AuthScreen() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const [mode, setMode] = useState<AuthMode>('login');
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    loading,
    error,
    message,
    emailInput,
    passwordInput,
    setEmailInput,
    setPasswordInput,
    signIn,
    signUp
  } = useAuthStore();

  const handleLogin = async () => {
    setLocalError(null);
    await signIn();
  };

  const handleRegister = async () => {
    const firstName = firstNameInput.trim();
    const lastName = lastNameInput.trim();
    const phoneNumber = phoneInput.trim();

    if (!firstName || !lastName || !phoneNumber) {
      setLocalError('Nombre, apellidos y telefono son obligatorios para crear la cuenta.');
      return;
    }

    if (passwordInput.trim().length < 8) {
      setLocalError('La contrasena debe tener al menos 8 caracteres.');
      return;
    }

    if (passwordInput !== confirmPasswordInput) {
      setLocalError('La confirmacion de contrasena no coincide.');
      return;
    }

    setLocalError(null);

    await signUp({
      firstName,
      lastName,
      phoneNumber
    });
  };

  return (
    <View
      style={[
        localStyles.root,
        {
          paddingHorizontal: spacingTokens.lg,
          paddingVertical: spacingTokens.xl
        }
      ]}
    >
      <View style={[localStyles.shell, isDesktopWeb ? localStyles.shellDesktop : undefined]}>
        <SectionHeader
          title="Acceso"
          subtitle="Inicia sesion o crea cuenta para entrar en Lynkdrive."
          centered={isDesktopWeb}
        />

        <View style={styles.card}>
          <View style={localStyles.modeRow}>
            <Pressable
              style={[localStyles.modePill, mode === 'login' ? localStyles.modePillActive : undefined]}
              onPress={() => {
                setMode('login');
                setLocalError(null);
              }}
            >
              <Text style={[localStyles.modePillText, mode === 'login' ? localStyles.modePillTextActive : undefined]}>Entrar</Text>
            </Pressable>
            <Pressable
              style={[localStyles.modePill, mode === 'register' ? localStyles.modePillActive : undefined]}
              onPress={() => {
                setMode('register');
                setLocalError(null);
              }}
            >
              <Text style={[localStyles.modePillText, mode === 'register' ? localStyles.modePillTextActive : undefined]}>Crear cuenta</Text>
            </Pressable>
          </View>

          <View style={localStyles.formGrid}>
            {mode === 'register' ? (
              <>
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
              </>
            ) : null}

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

            {mode === 'register' ? (
              <LabeledInput
                label="Confirmar contrasena"
                value={confirmPasswordInput}
                onChangeText={setConfirmPasswordInput}
                placeholder="********"
                secureTextEntry
                autoCapitalize="none"
              />
            ) : null}
          </View>

          <View style={localStyles.actionsRow}>
            {mode === 'login' ? (
              <ActionButton label={loading ? 'Entrando...' : 'Iniciar sesion'} onPress={() => void handleLogin()} disabled={loading} />
            ) : (
              <ActionButton label={loading ? 'Creando...' : 'Crear cuenta'} onPress={() => void handleRegister()} disabled={loading} />
            )}
            <ActionButton
              label={mode === 'login' ? 'Necesito cuenta' : 'Ya tengo cuenta'}
              onPress={() => {
                setMode((prev) => (prev === 'login' ? 'register' : 'login'));
                setLocalError(null);
              }}
              variant="ghost"
              disabled={loading}
            />
          </View>

          {localError ? <Text style={styles.error}>{localError}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center'
  },
  shell: {
    width: '100%',
    gap: spacingTokens.lg
  },
  shellDesktop: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center'
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacingTokens.sm,
    marginBottom: spacingTokens.md
  },
  modePill: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.pill,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.xs,
    backgroundColor: colorTokens.white
  },
  modePillActive: {
    borderColor: colorTokens.primary,
    backgroundColor: '#E9EEF6'
  },
  modePillText: {
    color: colorTokens.secondary,
    ...typographyTokens.caption,
    fontWeight: '600'
  },
  modePillTextActive: {
    color: colorTokens.primary,
    fontWeight: '700'
  },
  formGrid: {
    gap: spacingTokens.sm
  },
  inputFieldWrap: {
    gap: spacingTokens.xs
  },
  inputLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  inputField: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    color: colorTokens.textMain,
    backgroundColor: colorTokens.white,
    ...typographyTokens.body
  },
  actionsRow: {
    marginTop: spacingTokens.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm
  },
  actionButton: {
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.sm,
    borderRadius: radiusTokens.input,
    borderWidth: 1,
    minWidth: 120,
    alignItems: 'center'
  },
  actionButtonPrimary: {
    backgroundColor: colorTokens.primary,
    borderColor: colorTokens.primary
  },
  actionButtonGhost: {
    backgroundColor: colorTokens.white,
    borderColor: colorTokens.border
  },
  actionButtonDisabled: {
    opacity: 0.6
  },
  actionButtonText: {
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  actionButtonPrimaryText: {
    color: colorTokens.white
  },
  actionButtonGhostText: {
    color: colorTokens.secondary
  }
});
