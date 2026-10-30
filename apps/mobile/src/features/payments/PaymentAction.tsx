import { ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colorTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import {
  PaymentMode,
  confirmBookingPayment,
  createBookingPaymentIntent,
  fetchPaymentConfig,
  getPaymentsErrorMessage
} from './paymentsApi';
import { presentStripePaymentSheet } from './stripeSheet';

export type PaymentButtonRenderProps = {
  label: string;
  onPress: () => void;
  disabled: boolean;
};

type PaymentActionProps = {
  bookingId: string;
  disabled?: boolean;
  /** Pinta el botón con el estilo de la pantalla anfitriona. */
  renderButton: (props: PaymentButtonRenderProps) => ReactNode;
  /** Modo prototipo: confirmación demo existente (sin pasarela real). */
  onDemoConfirm: () => void;
  /** Modo Stripe: se llama tras un pago confirmado para refrescar datos. */
  onPaid: () => Promise<void> | void;
};

/**
 * Acción de pago del conductor para una reserva `accepted`.
 * - Backend en modo prototipo: mismo botón "Pagar" demo de siempre.
 * - Backend en modo Stripe: PaymentSheet nativo + confirmación verificada en backend.
 */
export function PaymentAction({ bookingId, disabled = false, renderButton, onDemoConfirm, onPaid }: PaymentActionProps) {
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void fetchPaymentConfig().then((config) => {
      if (active) {
        setMode(config.mode);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const handleStripePayment = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const intent = await createBookingPaymentIntent(bookingId);

      if (intent.mode === 'prototype' || !intent.clientSecret) {
        onDemoConfirm();
        return;
      }

      const publishableKey = intent.publishableKey ?? (await fetchPaymentConfig()).publishableKey;

      if (!publishableKey) {
        setError('Falta la clave publicable de Stripe en el backend (STRIPE_PUBLISHABLE_KEY).');
        return;
      }

      const result = await presentStripePaymentSheet({ publishableKey, clientSecret: intent.clientSecret });

      if (result.status === 'canceled') {
        setMessage('Pago cancelado.');
        return;
      }

      if (result.status !== 'succeeded') {
        setError(result.message);
        return;
      }

      setMessage('Pago completado. Confirmando reserva...');
      await confirmBookingPayment(bookingId, intent.paymentIntentId);
      setMessage('Pago confirmado.');
      await onPaid();
    } catch (paymentError: unknown) {
      setError(getPaymentsErrorMessage(paymentError, 'No se pudo completar el pago.'));
    } finally {
      setBusy(false);
    }
  };

  if (mode !== 'stripe') {
    return <>{renderButton({ label: 'Pagar', onPress: onDemoConfirm, disabled: disabled || mode === null })}</>;
  }

  return (
    <View style={localStyles.container}>
      {renderButton({
        label: busy ? 'Procesando pago...' : 'Pagar con tarjeta',
        onPress: () => void handleStripePayment(),
        disabled: disabled || busy
      })}
      {message ? <Text style={localStyles.message}>{message}</Text> : null}
      {error ? <Text style={localStyles.error}>{error}</Text> : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    gap: spacingTokens.xs
  },
  message: {
    ...typographyTokens.caption,
    color: colorTokens.textMuted
  },
  error: {
    ...typographyTokens.caption,
    color: colorTokens.alert
  }
});
