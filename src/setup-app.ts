import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { createValidationPipe } from './shared/pipes/validation.pipe.js';

/** Shared by main.ts and the e2e tests so both run the identical app. */
export function applyAppSettings(app: INestApplication): void {
  const config = app.get(ConfigService);
  const production = config.get('NODE_ENV') === 'production';

  // Behind a reverse proxy every request arrives from the proxy's IP, so the per-IP rate limit
  // would be one shared bucket for all users. Opt in explicitly: trusting X-Forwarded-For when
  // there is no proxy would let any client spoof its IP and dodge the limit.
  // A number = proxy hops to trust; otherwise an Express list such as "loopback, 10.0.0.0/8".
  const trustProxy = process.env.TRUST_PROXY || config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    app.getHttpAdapter().getInstance().set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  app.setGlobalPrefix('api/v1');
  // Swagger UI needs inline scripts, so CSP is production-only.
  app.use(helmet({ contentSecurityPolicy: production }));
  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS', 'http://localhost:3000').split(','),
    credentials: true,
  });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();

  if (!production) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Ticketeer API')
        .setDescription('Support ticket management API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/json' });
  }
}
