// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // <-- required: makes req.rawBody available
  });

  app.setGlobalPrefix('v1');
  // ...existing ValidationPipe / Helmet / CORS setup stays as-is

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
