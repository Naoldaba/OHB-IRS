import 'dotenv/config';
import { mkdirSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { AppModule } from './app.module';
import { loadStorageConfig } from './storage/storage.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  // Serve locally-stored uploads (dev/self-hosted). In production a cloud
  // storage driver returns its own URLs and this mount is simply unused.
  const storage = loadStorageConfig();
  if (storage.driver === 'local') {
    mkdirSync(storage.localRootDir, { recursive: true });
    app.useStaticAssets(storage.localRootDir, { prefix: storage.urlPrefix });
  }

  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
      }),
      name: 'ohb.sid',
      secret: process.env.SESSION_SECRET ?? 'dev-insecure-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false, // set true behind HTTPS in production
        maxAge: Number(process.env.SESSION_MAX_AGE_MS ?? 8 * 60 * 60 * 1000),
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`OHB API listening on http://localhost:${port}/api`);
}

bootstrap();
