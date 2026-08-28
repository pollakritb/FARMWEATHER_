import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool?: Pool;

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (connectionString) this.pool = new Pool({ connectionString });
  }

  get enabled(): boolean { return Boolean(this.pool); }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.logger.warn('DATABASE_URL is not set; plot data uses in-memory storage');
      return;
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY, username varchar(30) UNIQUE NOT NULL,
        password_hash text NOT NULL, role varchar(20) NOT NULL DEFAULT 'FARMER',
        display_name varchar(100), phone varchar(30), province varchar(100),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'FARMER';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name varchar(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar(30);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS province varchar(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
      CREATE TABLE IF NOT EXISTS plots (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL,
        latitude double precision NOT NULL, longitude double precision NOT NULL,
        province varchar(100), crop_type varchar(30) NOT NULL,
        planted_at date NOT NULL, active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(), owner_id uuid REFERENCES users(id) ON DELETE CASCADE
      );
      ALTER TABLE plots ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS plots_owner_id_idx ON plots(owner_id)
      ;CREATE TABLE IF NOT EXISTS auth_sessions (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS weather_forecasts (
        plot_id uuid NOT NULL REFERENCES plots(id) ON DELETE CASCADE, forecast_at timestamptz NOT NULL,
        fetched_at timestamptz NOT NULL, temperature_c real, relative_humidity_pct real, rain_mm real,
        wind_speed_ms real, wind_direction_deg real, condition_code integer, source varchar(30) NOT NULL,
        PRIMARY KEY (plot_id, forecast_at)
      );
      CREATE TABLE IF NOT EXISTS weather_forecast_history (
        plot_id uuid NOT NULL REFERENCES plots(id) ON DELETE CASCADE, forecast_at timestamptz NOT NULL,
        fetched_at timestamptz NOT NULL, temperature_c real, relative_humidity_pct real, rain_mm real,
        wind_speed_ms real, wind_direction_deg real, condition_code integer, source varchar(30) NOT NULL,
        PRIMARY KEY (plot_id, forecast_at, fetched_at)
      );
      CREATE TABLE IF NOT EXISTS weather_observations (
        plot_id uuid NOT NULL REFERENCES plots(id) ON DELETE CASCADE, observed_at timestamptz NOT NULL,
        fetched_at timestamptz NOT NULL, station_id varchar(50) NOT NULL, station_name text NOT NULL,
        province varchar(100) NOT NULL, station_distance_km real NOT NULL, temperature_c real,
        relative_humidity_pct real, rainfall_mm real, wind_speed_ms real, wind_direction_deg real,
        source varchar(30) NOT NULL, PRIMARY KEY (plot_id, observed_at)
      );
      CREATE TABLE IF NOT EXISTS analysis_results (
        id uuid PRIMARY KEY, plot_id uuid NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
        forecast_at timestamptz NOT NULL, risk_level varchar(20) NOT NULL, growth_stage varchar(30) NOT NULL,
        triggered_rules jsonb NOT NULL, recommendations jsonb NOT NULL, created_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS analysis_plot_idx ON analysis_results(plot_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY, plot_id uuid NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
        analysis_id uuid NOT NULL, severity varchar(20) NOT NULL, title text NOT NULL, message text NOT NULL,
        status varchar(20) NOT NULL, created_at timestamptz NOT NULL, read_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS notifications_plot_idx ON notifications(plot_id, created_at DESC);
    `);
    this.logger.log('PostgreSQL storage is ready');
  }

  async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    if (!this.pool) throw new Error('PostgreSQL is not configured');
    return (await this.pool.query(text, values)).rows as T[];
  }

  async onModuleDestroy(): Promise<void> { await this.pool?.end(); }
}
