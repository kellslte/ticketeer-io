import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { applyAppSettings } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  applyAppSettings(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
