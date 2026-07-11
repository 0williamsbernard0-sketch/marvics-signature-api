// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  app.setGlobalPrefix('v1');

  // Capture the raw buffer for Tatum's webhook regardless of the exact
  // Content-Type header sent (avoids relying on Nest's own automatic
  // rawBody population, which only fires on an exact content-type match).
  app.use(
    '/v1/webhooks/tatum',
    bodyParser.raw({ type: '*/*' }),
    (req, res, next) => {
      (req as any).rawBody = req.body;
      next();
    },
  );

  const allowedOrigins = [
    'https://marvics-signature-web.vercel.app',
    'http://localhost:3000',
  ];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed =
        allowedOrigins.includes(origin) ||
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