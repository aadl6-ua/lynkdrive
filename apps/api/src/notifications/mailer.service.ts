import { Injectable, Logger } from '@nestjs/common';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type Provider = 'resend' | 'brevo';

const PROVIDER_URLS: Record<Provider, string> = {
  resend: 'https://api.resend.com/emails',
  brevo: 'https://api.brevo.com/v3/smtp/email'
};

/**
 * Envío de emails transaccionales por API HTTP (sin dependencias extra).
 * Proveedor con EMAIL_PROVIDER = resend | brevo, clave en EMAIL_API_KEY y remitente en EMAIL_FROM
 * ("LynkDrive <reservas@tudominio.es>"). Sin configuración completa no se envía nada.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  isEnabled(): boolean {
    return this.getConfig() !== null;
  }

  async send(message: EmailMessage): Promise<boolean> {
    const config = this.getConfig();

    if (!config) {
      return false;
    }

    try {
      const response = await fetch(PROVIDER_URLS[config.provider], {
        method: 'POST',
        headers: this.buildHeaders(config.provider, config.apiKey),
        body: JSON.stringify(this.buildBody(config.provider, config.from, message)),
        signal: AbortSignal.timeout(Number(process.env.EMAIL_TIMEOUT_MS) || 5000)
      });

      if (!response.ok) {
        // Sin destinatario ni contenido en el log: solo el estado HTTP.
        this.logger.warn(`El proveedor de email respondió ${response.status}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn(`No se pudo enviar un email: ${(error as Error).name}`);
      return false;
    }
  }

  private getConfig(): { provider: Provider; apiKey: string; from: string } | null {
    const provider = (process.env.EMAIL_PROVIDER ?? '').toLowerCase();
    const apiKey = process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM;

    if ((provider !== 'resend' && provider !== 'brevo') || !apiKey || !from) {
      return null;
    }

    return { provider, apiKey, from };
  }

  private buildHeaders(provider: Provider, apiKey: string): Record<string, string> {
    return provider === 'resend'
      ? { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      : { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' };
  }

  private buildBody(provider: Provider, from: string, message: EmailMessage): Record<string, unknown> {
    if (provider === 'resend') {
      return { from, to: [message.to], subject: message.subject, text: message.text, html: message.html };
    }

    // Brevo separa nombre y email del remitente.
    const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    const sender = match ? { name: match[1] || 'LynkDrive', email: match[2] } : { name: 'LynkDrive', email: from };

    return { sender, to: [{ email: message.to }], subject: message.subject, textContent: message.text, htmlContent: message.html };
  }
}
