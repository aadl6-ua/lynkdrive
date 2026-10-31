import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colorTokens, shadowTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { supabaseClient } from '../../api/supabase';
import { Button, InlineMessage, TextField } from '../../shared/ui';

/**
 * Tokens de recuperación que Supabase añade al enlace del email
 * (`#access_token=...&refresh_token=...&type=recovery`). Solo aplica en web:
 * el enlace del correo siempre abre la web, también desde el móvil.
 */
export function getWebRecoveryTokens(): { accessToken: string; refreshToken: string } | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location.hash) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.slice(1));

  if (params.get('type') !== 'recovery') {
    return null;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

/** URL a la que Supabase redirige desde el email de recuperación. */
export function getPasswordResetRedirectUrl(): string | undefined {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;

  if (configured) {
    return configured.replace(/\/$/, '') + '/';
  }

  return Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/` : undefined;
}

type PasswordResetScreenProps = {
  tokens: { accessToken: string; refreshToken: string };
  topInset?: number;
};

export function PasswordResetScreen({ tokens, topInset = 0 }: PasswordResetScreenProps) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid' | 'saving' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Se limpia el hash para que los tokens no queden en el historial del navegador.
    window.history.replaceState(null, '', window.location.pathname);

    void supabaseClient.auth
      .setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken })
      .then(({ error: sessionError }) => setStatus(sessionError ? 'invalid' : 'ready'));
  }, [tokens]);

  const handleSave = async () => {
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setError(null);
    setStatus('saving');

    const { error: updateError } = await supabaseClient.auth.updateUser({ password });

    if (updateError) {
      setStatus('ready');
      setError('No se pudo cambiar la contraseña. Pide un enlace nuevo e inténtalo otra vez.');
      return;
    }

    // Se cierra la sesión de recuperación: el usuario entra después con su nueva contraseña.
    await supabaseClient.auth.signOut();
    setStatus('done');
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.scroll, { paddingTop: topInset + spacingTokens.xxl }]}>
      <View style={styles.card}>
        <Text style={styles.title} accessibilityRole="header">
          Nueva contraseña
        </Text>

        {status === 'checking' ? <Text style={styles.text}>Comprobando el enlace…</Text> : null}

        {status === 'invalid' ? (
          <InlineMessage
            tone="error"
            message="El enlace ha caducado o ya se usó. Vuelve a pedir uno desde «¿Has olvidado tu contraseña?»."
          />
        ) : null}

        {status === 'ready' || status === 'saving' ? (
          <>
            <Text style={styles.text}>Elige una contraseña nueva para tu cuenta de LynkDrive.</Text>
            <TextField
              label="Contraseña nueva"
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
              leftIcon="lock-closed-outline"
              passwordToggle
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
            />
            <TextField
              label="Repite la contraseña"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repite la contraseña"
              leftIcon="lock-closed-outline"
              passwordToggle
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={() => void handleSave()}
            />
            {error ? <InlineMessage tone="error" message={error} /> : null}
            <Button label="Guardar contraseña" onPress={() => void handleSave()} loading={status === 'saving'} fullWidth />
          </>
        ) : null}

        {status === 'done' ? (
          <InlineMessage tone="success" message="Contraseña actualizada. Ya puedes iniciar sesión en la app o en la web." />
        ) : null}

        {status === 'done' || status === 'invalid' ? (
          <Button label="Ir a iniciar sesión" variant="secondary" onPress={() => window.location.assign('/')} fullWidth />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colorTokens.bgLight
  },
  scroll: {
    paddingHorizontal: spacingTokens.md,
    paddingBottom: spacingTokens.xxl
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: spacingTokens.md,
    padding: spacingTokens.lg,
    backgroundColor: colorTokens.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colorTokens.border,
    ...shadowTokens.card
  },
  title: {
    color: colorTokens.primary,
    ...typographyTokens.h2
  },
  text: {
    color: colorTokens.textMuted,
    ...typographyTokens.body
  }
});
