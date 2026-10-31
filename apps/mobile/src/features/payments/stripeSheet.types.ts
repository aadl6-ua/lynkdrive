export type StripeSheetParams = {
  publishableKey: string;
  clientSecret: string;
};

export type StripeSheetResult =
  | { status: 'succeeded' }
  | { status: 'canceled' }
  | { status: 'failed'; message: string }
  | { status: 'unsupported'; message: string };
