import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/app/services/auth.service';
import { DatabaseService } from '../src/infrastructure/database/database.service';

async function freshSeed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for db:fresh');
  const adminUsername = process.env.SEED_ADMIN_USERNAME;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const farmerUsername = process.env.SEED_FARMER_USERNAME;
  const farmerPassword = process.env.SEED_FARMER_PASSWORD;
  if (!adminUsername || !adminPassword || !farmerUsername || !farmerPassword) {
    throw new Error('SEED_ADMIN_USERNAME, SEED_ADMIN_PASSWORD, SEED_FARMER_USERNAME, and SEED_FARMER_PASSWORD are required');
  }

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
      username: adminUsername,
      password: adminPassword,
    });
    const database = app.get(DatabaseService);
    await database.query('UPDATE users SET role=$1 WHERE username=$2', [
      'ADMIN',
      adminUsername.toLowerCase(),
    ]);
    await auth.register({
      username: farmerUsername,
      password: farmerPassword,
    });
    console.log('Database reset and seed completed.');
    console.log(`Admin: ${adminUsername}`);
    console.log(`Farmer: ${farmerUsername}`);
  } finally {
    await app.close();
  }
}

void freshSeed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
