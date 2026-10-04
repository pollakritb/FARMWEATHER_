import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuthService } from './app/services/auth.service';
import { PlotsService } from './app/services/plots.service';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  app.use(helmet({
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://unpkg.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'], imgSrc: ["'self'", 'data:', 'https://tile.openstreetmap.org', 'https://unpkg.com'],
      connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"],
    } },
  }));
  app.useStaticAssets(join(process.cwd(), 'public'));
  app.setGlobalPrefix('api');
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map((origin) => origin.trim());
  app.enableCors({ origin: origins, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const contract = JSON.parse(
    readFileSync(join(process.cwd(), 'openapi.json'), 'utf8'),
  ) as OpenAPIObject;
  if (process.env.NODE_ENV !== 'production' || process.env.CLASSROOM_MODE === 'true') SwaggerModule.setup('docs', app, contract);

  await app.init();
  const actor = await app.get(AuthService).initializeClassroom();
  if (actor) {
    await app.get(PlotsService).create({ name: 'Classroom rice plot', latitude: 14.02, longitude: 100.52, cropType: 'RICE', plantedAt: new Date().toISOString().slice(0, 10) }, actor.id);
    console.log('CLASSROOM_MODE: token-free shared admin account, demo weather and no rate limit');
  }
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
