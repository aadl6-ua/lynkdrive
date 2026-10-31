import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { colorTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { Button, Card, CardHeader, InlineMessage, StatusChip } from '../../shared/ui';
import { getPushPermissionState, registerForPushNotifications } from './pushNotifications';
import { PushPermissionState } from './pushNotifications.types';

/**
 * Ajuste de notificaciones push en Perfil. El permiso del sistema solo se pide al pulsar
 * el botón. No se renderiza en web ni donde las push no están disponibles (Expo Go Android, simulador).
 */
export function PushNotificationsCard() {
  const [permission, setPermission] = useState<PushPermissionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPermission(await getPushPermissionState());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    setLoading(true);
    setError(null);

    const result = await registerForPushNotifications({ askPermission: true });

    if (result.status !== 'registered') {
      setError(result.message);
    }

    await refresh();
    setLoading(false);
  };

  if (!permission || permission === 'unsupported') {
    return null;
  }

  const granted = permission === 'granted';

  return (
    <Card>
      <CardHeader
        title="Notificaciones"
        icon="notifications-outline"
        right={<StatusChip label={granted ? 'Activadas' : 'Desactivadas'} tone={granted ? 'success' : 'neutral'} compact />}
      />
      <Text style={localStyles.hint}>
        {granted
          ? 'Te avisaremos de nuevas solicitudes, cambios de estado de tus reservas y cuando puedas dejar una reseña.'
          : 'Recibe un aviso cuando te envíen una solicitud, acepten tu reserva o puedas dejar una reseña.'}
      </Text>
      {error ? <InlineMessage tone="info" message={error} /> : null}
      {!granted ? (
        <View style={localStyles.actions}>
          {permission === 'denied' ? (
            <Button label="Abrir ajustes" icon="settings-outline" size="sm" onPress={() => void Linking.openSettings()} />
          ) : (
            <Button
              label="Activar notificaciones"
              icon="notifications-outline"
              size="sm"
              onPress={() => void enable()}
              loading={loading}
            />
          )}
        </View>
      ) : null}
    </Card>
  );
}

const localStyles = StyleSheet.create({
  hint: {
    ...typographyTokens.caption,
    color: colorTokens.textMuted,
    marginBottom: spacingTokens.sm
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm,
    marginTop: spacingTokens.sm
  }
});
