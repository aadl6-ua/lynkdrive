export class ConnectStatusResponseDto {
  mode!: 'stripe' | 'prototype';
  accountId!: string | null;
  detailsSubmitted!: boolean;
  chargesEnabled!: boolean;
  payoutsEnabled!: boolean;
  transfersActive!: boolean;
}

export class ConnectLinkResponseDto {
  accountId!: string;
  url!: string;
  expiresAt!: number | null;
}
