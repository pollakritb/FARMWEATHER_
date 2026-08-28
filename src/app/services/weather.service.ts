import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { TmdClient } from '../../infrastructure/tmd/tmd-forecast.client';
import { TmdObservationClient } from '../../infrastructure/tmd/tmd-observation.client';
import { CurrentWeatherObservation, HourlyForecast } from '../models/domain';
import { PlotsService } from './plots.service';

@Injectable()
export class WeatherService {
  private readonly cache = new Map<string, HourlyForecast[]>();
  private readonly observationCache = new Map<string, CurrentWeatherObservation>();

  constructor(
    private readonly plots: PlotsService,
    private readonly tmd: TmdClient,
    private readonly observations: TmdObservationClient,
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
  ) {}

  async getForPlot(plotId: string, force = false, ownerId?: string): Promise<HourlyForecast[]> {
    const plot = await this.plots.findOne(plotId, ownerId);
    const cached = this.cache.get(plotId);
    if (!force && cached?.length && this.isFresh(cached[0].fetchedAt)) return cached;
    if (!force && this.database.enabled) {
      const stored = await this.loadForecasts(plotId);
      if (stored.length && this.isFresh(stored[0].fetchedAt)) { this.cache.set(plotId, stored); return stored; }
    }

    const forecasts = this.demoWeatherEnabled()
      ? this.demoForecasts(plot.id)
      : await this.tmd.getHourly(plot);
    this.cache.set(plotId, forecasts);
    await this.saveForecasts(forecasts);
    return forecasts;
  }

  async getCurrent(plotId: string, force = false, ownerId?: string): Promise<CurrentWeatherObservation> {
    const plot = await this.plots.findOne(plotId, ownerId);
    const cached = this.observationCache.get(plotId);
    if (!force && cached && this.isObservationFresh(cached.fetchedAt)) return cached;
    if (!force && this.database.enabled) {
      const stored = await this.loadObservation(plotId);
      if (stored && this.isObservationFresh(stored.fetchedAt)) { this.observationCache.set(plotId, stored); return stored; }
    }
    const observation = this.demoWeatherEnabled()
      ? this.demoObservation(plot.id, plot.province)
      : await this.observations.getNearest(plot);
    this.observationCache.set(plotId, observation);
    await this.saveObservation(observation);
    return observation;
  }

  async forecastHistory(plotId: string, ownerId: string): Promise<HourlyForecast[]> {
    await this.plots.findOne(plotId, ownerId);
    if (!this.database.enabled) return this.cache.get(plotId) ?? [];
    const rows = await this.database.query<Record<string, unknown>>('SELECT * FROM weather_forecast_history WHERE plot_id=$1 ORDER BY fetched_at DESC, forecast_at LIMIT 500',[plotId]);
    return rows.map((r) => ({ plotId:String(r.plot_id), forecastAt:new Date(r.forecast_at as string).toISOString(), fetchedAt:new Date(r.fetched_at as string).toISOString(), temperatureC:this.num(r.temperature_c), relativeHumidityPct:this.num(r.relative_humidity_pct), rainMm:this.num(r.rain_mm), windSpeedMs:this.num(r.wind_speed_ms), windDirectionDeg:this.num(r.wind_direction_deg), conditionCode:this.num(r.condition_code), source:'TMD' }));
  }

  async observationHistory(plotId: string, ownerId: string): Promise<CurrentWeatherObservation[]> {
    await this.plots.findOne(plotId, ownerId);
    if (!this.database.enabled) { const item=this.observationCache.get(plotId); return item ? [item] : []; }
    const rows = await this.database.query<Record<string, unknown>>('SELECT * FROM weather_observations WHERE plot_id=$1 ORDER BY observed_at DESC LIMIT 500',[plotId]);
    return rows.map((r) => ({ plotId:String(r.plot_id), observedAt:new Date(r.observed_at as string).toISOString(), fetchedAt:new Date(r.fetched_at as string).toISOString(), stationId:String(r.station_id), stationName:String(r.station_name), province:String(r.province), stationDistanceKm:Number(r.station_distance_km), temperatureC:this.num(r.temperature_c), relativeHumidityPct:this.num(r.relative_humidity_pct), rainfallMm:this.num(r.rainfall_mm), windSpeedMs:this.num(r.wind_speed_ms), windDirectionDeg:this.num(r.wind_direction_deg), source:'TMD_STATION' }));
  }

  @Cron(process.env.WEATHER_CRON ?? '0 */3 * * *')
  async refreshActivePlots(): Promise<void> {
    await Promise.allSettled((await this.plots.findActive()).map((plot) => this.getForPlot(plot.id, true)));
  }

  private isFresh(fetchedAt: string): boolean {
    const minutes = this.config.get<number>('WEATHER_CACHE_MINUTES', 180);
    return Date.now() - new Date(fetchedAt).getTime() < minutes * 60_000;
  }

  private isObservationFresh(fetchedAt: string): boolean {
    const minutes = this.config.get<number>('OBSERVATION_CACHE_MINUTES', 10);
    return Date.now() - new Date(fetchedAt).getTime() < minutes * 60_000;
  }

  private demoWeatherEnabled(): boolean {
    const explicit = this.config.get<string>('WEATHER_DEMO_MODE');
    if (explicit !== undefined) return explicit.toLowerCase() === 'true';
    return !this.config.get<string>('TMD_ACCESS_TOKEN') && this.config.get('NODE_ENV') !== 'production';
  }

  private demoForecasts(plotId: string): HourlyForecast[] {
    const fetchedAt = new Date().toISOString();
    const start = new Date();
    start.setMinutes(0, 0, 0);

    return Array.from({ length: 25 }, (_, index) => {
      const forecastAt = new Date(start.getTime() + index * 60 * 60_000);
      const hour = forecastAt.getHours();
      const afternoon = hour >= 13 && hour <= 17;
      const night = hour <= 5 || hour >= 20;
      const rainMm = afternoon ? (index % 4 === 0 ? 12 : 3) : night ? 1 : 0;

      return {
        plotId,
        forecastAt: forecastAt.toISOString(),
        fetchedAt,
        temperatureC: afternoon ? 34 : night ? 25 : 29,
        relativeHumidityPct: rainMm ? 86 : night ? 78 : 68,
        rainMm,
        windSpeedMs: afternoon ? 4.2 : 2.1,
        windDirectionDeg: 225,
        conditionCode: rainMm >= 10 ? 7 : rainMm > 0 ? 5 : afternoon ? 2 : 1,
        source: 'TMD',
      };
    });
  }

  private demoObservation(plotId: string, province?: string): CurrentWeatherObservation {
    const now = new Date();
    return {
      plotId,
      observedAt: now.toISOString(),
      fetchedAt: now.toISOString(),
      stationId: 'DEMO',
      stationName: 'สถานีสาธิต FarmWeather',
      province: province ?? 'ไม่ระบุจังหวัด',
      stationDistanceKm: 3.2,
      temperatureC: 31.4,
      relativeHumidityPct: 74,
      rainfallMm: 0.8,
      windSpeedMs: 2.7,
      windDirectionDeg: 210,
      source: 'TMD_STATION',
    };
  }

  private async saveForecasts(items: HourlyForecast[]) {
    if (!this.database.enabled) return;
    for (const f of items) await this.database.query(
      `INSERT INTO weather_forecasts VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (plot_id,forecast_at) DO UPDATE SET fetched_at=excluded.fetched_at, temperature_c=excluded.temperature_c,
       relative_humidity_pct=excluded.relative_humidity_pct, rain_mm=excluded.rain_mm, wind_speed_ms=excluded.wind_speed_ms,
       wind_direction_deg=excluded.wind_direction_deg, condition_code=excluded.condition_code, source=excluded.source`,
      [f.plotId, f.forecastAt, f.fetchedAt, f.temperatureC, f.relativeHumidityPct, f.rainMm, f.windSpeedMs, f.windDirectionDeg, f.conditionCode, f.source],
    );
    for (const f of items) await this.database.query(
      `INSERT INTO weather_forecast_history VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
      [f.plotId, f.forecastAt, f.fetchedAt, f.temperatureC, f.relativeHumidityPct, f.rainMm, f.windSpeedMs, f.windDirectionDeg, f.conditionCode, f.source],
    );
  }
  private async loadForecasts(plotId: string): Promise<HourlyForecast[]> {
    const rows = await this.database.query<Record<string, unknown>>('SELECT * FROM weather_forecasts WHERE plot_id=$1 AND forecast_at>=now() ORDER BY forecast_at LIMIT 48', [plotId]);
    return rows.map((r) => ({ plotId: String(r.plot_id), forecastAt: new Date(r.forecast_at as string).toISOString(), fetchedAt: new Date(r.fetched_at as string).toISOString(), temperatureC: this.num(r.temperature_c), relativeHumidityPct: this.num(r.relative_humidity_pct), rainMm: this.num(r.rain_mm), windSpeedMs: this.num(r.wind_speed_ms), windDirectionDeg: this.num(r.wind_direction_deg), conditionCode: this.num(r.condition_code), source: 'TMD' }));
  }
  private async saveObservation(o: CurrentWeatherObservation) {
    if (!this.database.enabled) return;
    await this.database.query(`INSERT INTO weather_observations VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (plot_id,observed_at) DO UPDATE SET fetched_at=excluded.fetched_at`,
      [o.plotId,o.observedAt,o.fetchedAt,o.stationId,o.stationName,o.province,o.stationDistanceKm,o.temperatureC,o.relativeHumidityPct,o.rainfallMm,o.windSpeedMs,o.windDirectionDeg,o.source]);
  }
  private async loadObservation(plotId: string): Promise<CurrentWeatherObservation | undefined> {
    const r = (await this.database.query<Record<string, unknown>>('SELECT * FROM weather_observations WHERE plot_id=$1 ORDER BY observed_at DESC LIMIT 1',[plotId]))[0];
    return r ? { plotId:String(r.plot_id), observedAt:new Date(r.observed_at as string).toISOString(), fetchedAt:new Date(r.fetched_at as string).toISOString(), stationId:String(r.station_id), stationName:String(r.station_name), province:String(r.province), stationDistanceKm:Number(r.station_distance_km), temperatureC:this.num(r.temperature_c), relativeHumidityPct:this.num(r.relative_humidity_pct), rainfallMm:this.num(r.rainfall_mm), windSpeedMs:this.num(r.wind_speed_ms), windDirectionDeg:this.num(r.wind_direction_deg), source:'TMD_STATION' } : undefined;
  }
  private num(value: unknown): number | undefined { return value === null || value === undefined ? undefined : Number(value); }
}
