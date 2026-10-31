import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { colorTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { Button, Card, CardHeader, InlineMessage, StatusChip, StatusChipTone } from '../../shared/ui';
import {
  ConnectStatus,
  createConnectDashboardLink,
  createConnectOnboardingLink,
  fetchConnectStatus,
  fetchPaymentConfig,
  getPaymentsErrorMessage
} from './paymentsApi';

type PayoutState = { label: string; tone: StatusChipTone; hint: string };

function describeStatus(status: ConnectStatus): PayoutState {
  if (!status.accountId) {
    return {
      label: 'Sin configurar',
      tone: 'neutral',
      hint: 'Configura tu cuenta de cobros para recibir el importe de tus alquileres.'
    };
  }

  if (status.transfersActive && status.payoutsEnabled) {
    return { label: 'Activa', tone: 'success', hint: 'Recibirás los pagos de tus reservas en tu cuenta bancaria.' };
  }

  if (status.detailsSubmitted) {
    return { label: 'En revisión', tone: 'info', hint: 'Stripe está verificando tus datos. Vuelve a comprobarlo en unos minutos.' };
  }

  return { label: 'Pendiente', tone: 'warning', hint: 'Completa la configuración en Stripe para empezar a cobrar.' };
}

/**
 * Tarjeta de cobros del propietario (Stripe Connect Express).
 * No se renderiza cuando el backend está en modo prototipo.
 */
export function OwnerPayoutsCard() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setStatus(await fetchConnectStatus());
    } catch (statusError: unknown) {
      setError(getPaymentsErrorMessage(statusError, 'No se pudo consultar el estado de cobros.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void fetchPaymentConfig().then((config) => {
      if (active && config.mode === 'stripe') {
        setEnabled(true);
        void loadStatus();
      }
    });

    return () => {
      active = false;
    };
  }, [loadStatus]);

  const openLink = async (factory: () => Promise<{ url: string }>) => {
    setLoading(true);
    setError(null);

    try {
      const { url } = await factory();
      await Linking.openURL(url);
    } catch (linkError: unknown) {
      setError(getPaymentsErrorMessage(linkError, 'No se pudo abrir Stripe.'));
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) {
    return null;
  }

  const described = status ? describeStatus(status) : null;
  const isActive = !!status?.transfersActive && !!status?.payoutsEnabled;

  return (
    <Card>
      <CardHeader
        title="Cobros como propietario"
        icon="wallet-outline"
        right={described ? <StatusChip label={described.label} tone={described.tone} compact /> : null}
      />
      <Text style={localStyles.hint}>{described?.hint ?? 'Consultando estado de cobros...'}</Text>
      {error ? <InlineMessage tone="error" message={error} /> : null}
      <View style={localStyles.actions}>
        {isActive ? (
          <Button
            label="Ver panel de cobros"
            icon="open-outline"
            size="sm"
            onPress={() => void openLink(createConnectDashboardLink)}
            disabled={loading}
          />
        ) : (
          <Button
            label={status?.accountId ? 'Completar configuración' : 'Configurar cobros'}
            icon="card-outline"
            size="sm"
            onPress={() => void openLink(createConnectOnboardingLink)}
            loading={loading}
          />
        )}
        <Button label="Actualizar estado" variant="ghost" size="sm" onPress={() => void loadStatus()} disabled={loading} />
      </View>
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
