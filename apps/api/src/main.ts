import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

async function bootstrap() {
  // rawBody: necesario para verificar la firma de los webhooks de Stripe.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, rawBody: true });
  const logger = new Logger('HTTP');

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startedAt;
      logger.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} - ${duration}ms`);
    });

    next();
  });

  app.disable('x-powered-by');

  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  }

  app.use(helmet());
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { extended: false, limit: '100kb' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: false
    })
  );

  app.setGlobalPrefix('api');

  // Sin CORS_ORIGINS se mantiene el comportamiento abierto (la app nativa no usa CORS).
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors(corsOrigins.length > 0 ? { origin: corsOrigins } : undefined);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
