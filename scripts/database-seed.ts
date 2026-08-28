import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/app/services/auth.service';
import { DatabaseService } from '../src/infrastructure/database/database.service';

async function freshSeed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for db:fresh');

  const pool = new Pool({ connectionString });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  } finally {
    await pool.end();
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const auth = app.get(AuthService);
    await auth.register({
      username: process.env.SEED_ADMIN_USERNAME ?? 'admin',
      password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
    });
    const database = app.get(DatabaseService);
    await database.query('UPDATE users SET role=$1 WHERE username=$2', [
      'ADMIN',
      (process.env.SEED_ADMIN_USERNAME ?? 'admin').toLowerCase(),
    ]);
    await auth.register({
      username: process.env.SEED_FARMER_USERNAME ?? 'farmer',
      password: process.env.SEED_FARMER_PASSWORD ?? 'Farmer123!',
    });
    console.log('Database reset and seed completed.');
    console.log(`Admin: ${process.env.SEED_ADMIN_USERNAME ?? 'admin'}`);
    console.log(`Farmer: ${process.env.SEED_FARMER_USERNAME ?? 'farmer'}`);
  } finally {
    await app.close();
  }
}

void freshSeed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
