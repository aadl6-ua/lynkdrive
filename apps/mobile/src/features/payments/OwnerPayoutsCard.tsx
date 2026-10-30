import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusChip, StatusChipTone } from '../../app/components/ui/StatusChip';
import { styles } from '../../app/styles';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
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
    return { label: 'Activa', tone: 'success', hint: 'Recibiras los pagos de tus reservas en tu cuenta bancaria.' };
  }

  if (status.detailsSubmitted) {
    return { label: 'En revision', tone: 'info', hint: 'Stripe esta verificando tus datos. Vuelve a comprobarlo en unos minutos.' };
  }

  return { label: 'Pendiente', tone: 'warning', hint: 'Completa la configuracion en Stripe para empezar a cobrar.' };
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
    <View style={styles.card}>
      <View style={localStyles.header}>
        <Text style={localStyles.title}>Cobros como propietario</Text>
        {described ? <StatusChip label={described.label} tone={described.tone} compact /> : null}
      </View>
      <Text style={localStyles.hint}>{described?.hint ?? 'Consultando estado de cobros...'}</Text>
      {error ? <Text style={localStyles.error}>{error}</Text> : null}
      <View style={localStyles.actions}>
        {isActive ? (
          <SmallButton label="Ver panel de cobros" onPress={() => void openLink(createConnectDashboardLink)} disabled={loading} />
        ) : (
          <SmallButton
            label={status?.accountId ? 'Completar configuracion' : 'Configurar cobros'}
            onPress={() => void openLink(createConnectOnboardingLink)}
            disabled={loading}
          />
        )}
        <SmallButton label="Actualizar estado" variant="ghost" onPress={() => void loadStatus()} disabled={loading} />
      </View>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  disabled,
  variant = 'primary'
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        localStyles.button,
        variant === 'primary' ? localStyles.buttonPrimary : localStyles.buttonGhost,
        disabled ? localStyles.buttonDisabled : undefined
      ]}
    >
      <Text style={[localStyles.buttonText, variant === 'ghost' ? localStyles.buttonGhostText : undefined]}>{label}</Text>
    </Pressable>
  );
}

const localStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingTokens.sm
  },
  title: {
    ...typographyTokens.sectionLabel,
    color: colorTokens.textMain
  },
  hint: {
    ...typographyTokens.caption,
    color: colorTokens.textMuted,
    marginTop: spacingTokens.sm
  },
  error: {
    ...typographyTokens.caption,
    color: colorTokens.alert,
    marginTop: spacingTokens.xs
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm,
    marginTop: spacingTokens.md
  },
  button: {
    minHeight: 44,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.sm,
    borderRadius: radiusTokens.input,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonPrimary: {
    backgroundColor: colorTokens.primary,
    borderColor: colorTokens.primary
  },
  buttonGhost: {
    backgroundColor: colorTokens.white,
    borderColor: colorTokens.border
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    ...typographyTokens.caption,
    fontWeight: '700',
    color: colorTokens.white
  },
  buttonGhostText: {
    color: colorTokens.secondary
  }
});
