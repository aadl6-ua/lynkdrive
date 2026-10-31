import type { ConnectLinkResponse, ConnectStatusResponse, PaymentMode } from '@lynkdrive/shared';

export class ConnectStatusResponseDto implements ConnectStatusResponse {
  mode!: PaymentMode;
  accountId!: string | null;
  detailsSubmitted!: boolean;
  chargesEnabled!: boolean;
  payoutsEnabled!: boolean;
  transfersActive!: boolean;
}

export class ConnectLinkResponseDto implements ConnectLinkResponse {
  accountId!: string;
  url!: string;
  expiresAt!: number | null;
}
