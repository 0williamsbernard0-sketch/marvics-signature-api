// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // required: makes req.rawBody available for webhook signature checks
  });

  app.setGlobalPrefix('v1');

  // Tatum webhook needs the raw byte buffer for HMAC signature verification,
  // so it's excluded from the global JSON body parser via this raw-body route.
  // IMPORTANT: this must be registered before app.use(json parser) / any global
  // body parsing NestJS applies, and before the route is hit by other middleware.
  app.use(
    '/v1/webhooks/tatum',
    bodyParser.raw({ type: 'application/json' }),
  );

  // CORS — explicit allowlist. Add every frontend origin that will call this API.
  const allowedOrigins = [
    'https://marvics-signature-web.vercel.app',
    'http://localhost:3000', // local frontend dev
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow server-to-server / curl / no-Origin requests (no browser origin header)
      if (!origin) return callback(null, true);

      const isAllowed =
        allowedOrigins.includes(origin) ||
        // Vercel preview deploys, e.g. marvics-signature-web-git-<branch>-<team>.vercel.app
        /^https:\/\/marvics-signature-web-.*\.vercel\.app$/.test(origin);

      if (isAllowed) {
        return callback(null, true);
      }
      return callback(new Error(`Not allowed by CORS: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation — DTOs via class-validator, strips unknown properties
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Marvics API listening on port ${process.env.PORT ?? 3000}`);
}
bootstrap();
