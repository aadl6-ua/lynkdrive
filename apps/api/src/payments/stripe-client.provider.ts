import { Provider } from '@nestjs/common';
import Stripe from 'stripe';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

/**
 * Devuelve un cliente Stripe si hay STRIPE_SECRET_KEY; si no, null (modo prototipo).
 */
export const stripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: (): Stripe | null => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    return secretKey ? new Stripe(secretKey) : null;
  }
};
