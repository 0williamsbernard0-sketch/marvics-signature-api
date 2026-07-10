// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // <-- required: makes req.rawBody available
  });

  app.setGlobalPrefix('v1');

  // Tatum webhook needs the raw byte buffer for HMAC signature verification,
  // so it's excluded from the global JSON body parser via this raw-body route.
  app.use(
    '/v1/webhooks/tatum',
    bodyParser.raw({ type: 'application/json' }),
  );

  // ...existing ValidationPipe / Helmet / CORS setup stays as-is

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
