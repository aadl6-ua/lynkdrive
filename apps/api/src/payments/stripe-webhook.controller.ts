import { Controller, Get, Header, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

/**
 * Endpoints públicos (sin JWT): webhook de Stripe (verificado por firma) y
 * páginas de retorno del onboarding de Stripe Connect.
 */
@Controller('payments')
export class StripeWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }

  @Get('connect/return')
  @Header('Content-Type', 'text/html; charset=utf-8')
  connectReturn() {
    return this.simplePage(
      'Configuración de cobros enviada',
      'Ya puedes volver a LynkDrive y actualizar el estado de cobros en tu Perfil.'
    );
  }

  @Get('connect/refresh')
  @Header('Content-Type', 'text/html; charset=utf-8')
  connectRefresh() {
    return this.simplePage(
      'El enlace ha caducado',
      'Vuelve a LynkDrive y pulsa de nuevo "Configurar cobros" para generar un enlace nuevo.'
    );
  }

  private simplePage(title: string, body: string): string {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;background:#F7F7F9;color:#121212;padding:32px"><h1 style="font-size:22px">${title}</h1><p>${body}</p></body></html>`;
  }
}
