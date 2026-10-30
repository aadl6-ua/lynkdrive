import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { colorTokens, radiusTokens, shadowTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { Button, InlineMessage, SegmentedControl, TextField } from '../../shared/ui';
import { useAuthStore } from '../../store/useAuthStore';

type AuthMode = 'login' | 'register';

type AuthScreenProps = {
  topInset?: number;
  bottomInset?: number;
};

type FieldErrors = Partial<Record<'firstName' | 'lastName' | 'phone' | 'email' | 'password' | 'confirm', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9\s-]{9,15}$/;

const BRAND_POINTS: Array<{ icon: keyof typeof Ionicons.glyphMap; text: string }> = [
  { icon: 'search-outline', text: 'Encuentra coches de particulares cerca de ti' },
  { icon: 'shield-checkmark-outline', text: 'Perfiles verificados y checklists con fotos' },
  { icon: 'wallet-outline', text: 'Gana dinero con tu coche cuando no lo usas' }
];

export function AuthScreen({ topInset = 0, bottomInset = 0 }: AuthScreenProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 1024;
  const [mode, setMode] = useState<AuthMode>('login');
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const lastNameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const {
    loading,
    error,
    message,
    emailInput,
    passwordInput,
    setEmailInput,
    setPasswordInput,
    signIn,
    signUp,
    requestPasswordReset,
    clearFeedback
  } = useAuthStore();

  const clearFieldError = (key: keyof FieldErrors) => {
    if (fieldErrors[key]) {
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
    }
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setFieldErrors({});
    clearFeedback();
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};

    if (!EMAIL_PATTERN.test(emailInput.trim())) {
      next.email = 'Introduce un email válido.';
    }

    if (mode === 'login') {
      if (!passwordInput) {
        next.password = 'Introduce tu contraseña.';
      }
    } else {
      if (!firstNameInput.trim()) {
        next.firstName = 'Indica tu nombre.';
      }

      if (!lastNameInput.trim()) {
        next.lastName = 'Indica tus apellidos.';
      }

      if (!PHONE_PATTERN.test(phoneInput.trim())) {
        next.phone = 'Introduce un teléfono válido (ej. +34 600 000 000).';
      }

      if (passwordInput.trim().length < 8) {
        next.password = 'Mínimo 8 caracteres.';
      }

      if (passwordInput !== confirmPasswordInput) {
        next.confirm = 'Las contraseñas no coinciden.';
      }
    }

    setFieldErrors(next);
    return Object.values(next).every((value) => !value);
  };

  const handleSubmit = async () => {
    clearFeedback();

    if (!validate()) {
      return;
    }

    if (mode === 'login') {
      await signIn();
      return;
    }

    await signUp({
      firstName: firstNameInput.trim(),
      lastName: lastNameInput.trim(),
      phoneNumber: phoneInput.trim()
    });
  };

  const brandPanel = (
    <View style={[styles.brand, isWide ? styles.brandWide : null]}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandLetter}>L</Text>
        </View>
        <Text style={styles.brandName}>LynkDrive</Text>
      </View>
      <Text style={[styles.brandHeadline, isWide ? styles.brandHeadlineWide : null]}>
        Alquila coches entre particulares, sin complicaciones.
      </Text>
      {isWide ? (
        <View style={styles.brandPoints}>
          {BRAND_POINTS.map((point) => (
            <View key={point.text} style={styles.brandPoint}>
              <View style={styles.brandPointIcon}>
                <Ionicons name={point.icon} size={18} color={colorTokens.accent1} />
              </View>
              <Text style={styles.brandPointText}>{point.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const form = (
    <View style={styles.formCard}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle} accessibilityRole="header">
          {mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
        </Text>
        <Text style={styles.formSubtitle}>
          {mode === 'login'
            ? 'Inicia sesión para reservar o gestionar tus vehículos.'
            : 'Solo necesitamos unos datos básicos para empezar.'}
        </Text>
      </View>

      <SegmentedControl
        options={[
          { value: 'login', label: 'Entrar' },
          { value: 'register', label: 'Crear cuenta' }
        ]}
        value={mode}
        onChange={(value) => switchMode(value as AuthMode)}
      />

      <View style={styles.fields}>
        {mode === 'register' ? (
          <>
            <View style={styles.row}>
              <TextField
                label="Nombre"
                required
                value={firstNameInput}
                onChangeText={(value) => {
                  setFirstNameInput(value);
                  clearFieldError('firstName');
                }}
                placeholder="Tu nombre"
                autoCapitalize="words"
                autoComplete="given-name"
                textContentType="givenName"
                returnKeyType="next"
                onSubmitEditing={() => lastNameRef.current?.focus()}
                error={fieldErrors.firstName}
                containerStyle={styles.rowItem}
              />
              <TextField
                ref={lastNameRef}
                label="Apellidos"
                required
                value={lastNameInput}
                onChangeText={(value) => {
                  setLastNameInput(value);
                  clearFieldError('lastName');
                }}
                placeholder="Tus apellidos"
                autoCapitalize="words"
                autoComplete="family-name"
                textContentType="familyName"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                error={fieldErrors.lastName}
                containerStyle={styles.rowItem}
              />
            </View>
            <TextField
              ref={phoneRef}
              label="Teléfono"
              required
              leftIcon="call-outline"
              value={phoneInput}
              onChangeText={(value) => {
                setPhoneInput(value);
                clearFieldError('phone');
              }}
              placeholder="+34 600 000 000"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              error={fieldErrors.phone}
            />
          </>
        ) : null}

        <TextField
          ref={emailRef}
          label="Email"
          required={mode === 'register'}
          leftIcon="mail-outline"
          value={emailInput}
          onChangeText={(value) => {
            setEmailInput(value);
            clearFieldError('email');
          }}
          placeholder="tu@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          error={fieldErrors.email}
        />
        <TextField
          ref={passwordRef}
          label="Contraseña"
          required={mode === 'register'}
          leftIcon="lock-closed-outline"
          value={passwordInput}
          onChangeText={(value) => {
            setPasswordInput(value);
            clearFieldError('password');
          }}
          placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : 'Tu contraseña'}
          passwordToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          textContentType={mode === 'login' ? 'password' : 'newPassword'}
          returnKeyType={mode === 'login' ? 'go' : 'next'}
          onSubmitEditing={() => (mode === 'login' ? void handleSubmit() : confirmRef.current?.focus())}
          error={fieldErrors.password}
        />

        {mode === 'register' ? (
          <TextField
            ref={confirmRef}
            label="Repite la contraseña"
            required
            leftIcon="lock-closed-outline"
            value={confirmPasswordInput}
            onChangeText={(value) => {
              setConfirmPasswordInput(value);
              clearFieldError('confirm');
            }}
            placeholder="Repite la contraseña"
            passwordToggle
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void handleSubmit()}
            error={fieldErrors.confirm}
          />
        ) : (
          <Pressable
            onPress={() => void requestPasswordReset()}
            disabled={loading}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.forgot}
          >
            <Text style={styles.forgotText}>¿Has olvidado tu contraseña?</Text>
          </Pressable>
        )}
      </View>

      {error ? <InlineMessage tone="error" message={error} /> : null}
      {message ? <InlineMessage tone="success" message={message} /> : null}

      <Button
        label={mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        onPress={() => void handleSubmit()}
        loading={loading}
        fullWidth
      />

      {mode === 'register' ? (
        <Text style={styles.legal}>
          Al crear tu cuenta aceptas los Términos y condiciones y la Política de privacidad de LynkDrive. Puedes
          consultarlos en cualquier momento desde Perfil.
        </Text>
      ) : (
        <Text style={styles.legal}>
          ¿Aún no tienes cuenta?{' '}
          <Text style={styles.legalLink} onPress={() => switchMode('register')} accessibilityRole="link">
            Regístrate gratis
          </Text>
        </Text>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topInset + spacingTokens.lg, paddingBottom: bottomInset + spacingTokens.xl }
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <View style={[styles.shell, isWide ? styles.shellWide : null]}>
          {brandPanel}
          <View style={isWide ? styles.formColumnWide : null}>{form}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacingTokens.lg
  },
  shell: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: spacingTokens.xl
  },
  shellWide: {
    maxWidth: 1040,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacingTokens.xxl
  },
  brand: {
    gap: spacingTokens.md
  },
  brandWide: {
    flex: 1,
    justifyContent: 'center',
    padding: spacingTokens.xxl,
    borderRadius: 24,
    backgroundColor: colorTokens.primary
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colorTokens.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(244,211,94,0.4)'
  },
  brandLetter: {
    color: colorTokens.accent1,
    ...typographyTokens.h2,
    lineHeight: undefined
  },
  brandName: {
    color: colorTokens.accent2,
    ...typographyTokens.h3
  },
  brandHeadline: {
    color: colorTokens.primary,
    ...typographyTokens.title
  },
  brandHeadlineWide: {
    color: colorTokens.white,
    fontSize: 36,
    lineHeight: 44
  },
  brandPoints: {
    gap: spacingTokens.md,
    marginTop: spacingTokens.lg
  },
  brandPoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  brandPointIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandPointText: {
    flex: 1,
    color: 'rgba(255,255,255,0.86)',
    ...typographyTokens.body
  },
  formColumnWide: {
    width: 460
  },
  formCard: {
    backgroundColor: colorTokens.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colorTokens.border,
    padding: spacingTokens.xl,
    gap: spacingTokens.lg,
    ...shadowTokens.card
  },
  formHeader: {
    gap: 4
  },
  formTitle: {
    color: colorTokens.primary,
    ...typographyTokens.h2
  },
  formSubtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.body
  },
  fields: {
    gap: spacingTokens.md
  },
  row: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  rowItem: {
    flex: 1
  },
  forgot: {
    alignSelf: 'flex-end',
    minHeight: 32,
    justifyContent: 'center'
  },
  forgotText: {
    color: colorTokens.accent2,
    ...typographyTokens.captionStrong
  },
  legal: {
    color: colorTokens.textMuted,
    textAlign: 'center',
    ...typographyTokens.caption
  },
  legalLink: {
    color: colorTokens.accent2,
    ...typographyTokens.captionStrong
  }
});
