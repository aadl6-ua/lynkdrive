import { Injectable } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  getHealth() {
    return {
      status: 'ok',
      service: 'lynkdrive-api',
      timestamp: new Date().toISOString()
    };
  }

  async getDatabaseHealth() {
    try {
      await this.dataSource.query('SELECT 1');

      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString()
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }
  }

  async getStripeHealth() {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      throw new ServiceUnavailableException({
        status: 'error',
        stripe: 'missing_key',
        timestamp: new Date().toISOString()
      });
    }

    try {
      const stripe = new Stripe(stripeSecretKey);
      await stripe.balance.retrieve();

      return {
        status: 'ok',
        stripe: 'connected',
        timestamp: new Date().toISOString()
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        stripe: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }
  }
}
