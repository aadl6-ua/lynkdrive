import { StripeSheetParams, StripeSheetResult } from './stripeSheet.types';

/**
 * Implementación web / fallback: el SDK nativo de Stripe (PaymentSheet) no existe en web.
 * En iOS/Android Metro resuelve `stripeSheet.native.ts`.
 */
export async function presentStripePaymentSheet(_params: StripeSheetParams): Promise<StripeSheetResult> {
  return {
    status: 'unsupported',
    message: 'El pago con tarjeta esta disponible en la app iOS/Android.'
  };
}
