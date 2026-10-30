import { StripeSheetParams, StripeSheetResult } from './stripeSheet.types';

let initializedPublishableKey: string | null = null;

/**
 * Abre el PaymentSheet nativo de Stripe. El SDK se carga de forma diferida para que la app
 * siga funcionando (modo prototipo) aunque el módulo nativo no esté disponible en el binario.
 */
export async function presentStripePaymentSheet({
  publishableKey,
  clientSecret
}: StripeSheetParams): Promise<StripeSheetResult> {
  let sdk: typeof import('@stripe/stripe-react-native');

  try {
    sdk = await import('@stripe/stripe-react-native');
  } catch {
    return { status: 'unsupported', message: 'El SDK de Stripe no esta disponible en esta build de la app.' };
  }

  try {
    if (initializedPublishableKey !== publishableKey) {
      await sdk.initStripe({ publishableKey });
      initializedPublishableKey = publishableKey;
    }

    const init = await sdk.initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: 'LynkDrive'
    });

    if (init.error) {
      return { status: 'failed', message: init.error.message };
    }

    const presented = await sdk.presentPaymentSheet();

    if (presented.error) {
      if (presented.error.code === sdk.PaymentSheetError.Canceled) {
        return { status: 'canceled' };
      }

      return { status: 'failed', message: presented.error.message };
    }

    return { status: 'succeeded' };
  } catch (error) {
    return { status: 'failed', message: (error as Error)?.message ?? 'Error inesperado en el pago.' };
  }
}
