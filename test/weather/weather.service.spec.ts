import { ServiceUnavailableException } from '@nestjs/common';
import { Plot } from '../../src/app/models/domain';
import { WeatherService } from '../../src/app/services/weather.service';

describe('WeatherService', () => {
  const plot: Plot = {
    id: 'plot-1',
    name: 'Demo plot',
    latitude: 14.01,
    longitude: 100,
    province: 'นครปฐม',
    cropType: 'RICE',
    plantedAt: '2026-07-01',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
  };

  function createService(configValues: Record<string, string | undefined> = {}) {
    const plots = { findOne: jest.fn().mockResolvedValue(plot), findActive: jest.fn().mockResolvedValue([plot]) };
    const tmd = { getHourly: jest.fn().mockRejectedValue(new ServiceUnavailableException()) };
    const observations = { getNearest: jest.fn().mockRejectedValue(new ServiceUnavailableException()) };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => (
        Object.prototype.hasOwnProperty.call(configValues, key) ? configValues[key] : fallback
      )),
    };
    const database = { enabled: false, query: jest.fn() };

    return {
      service: new WeatherService(plots as never, tmd as never, observations as never, config as never, database as never),
      tmd, observations, plots, database,
    };
  }

  it('returns demo hourly forecasts without calling TMD when no access token is configured', async () => {
    const { service, tmd } = createService();

    const forecasts = await service.getForPlot(plot.id, true, 'user-1');

    expect(forecasts).toHaveLength(25);
    expect(forecasts[0]).toMatchObject({ plotId: plot.id, source: 'TMD' });
    expect(forecasts.some((item) => (item.rainMm ?? 0) >= 10)).toBe(true);
    expect(tmd.getHourly).not.toHaveBeenCalled();
  });

  it('returns demo current weather without calling the observation API when no token is configured', async () => {
    const { service, observations } = createService();

    const observation = await service.getCurrent(plot.id, true, 'user-1');

    expect(observation).toMatchObject({
      plotId: plot.id,
      stationId: 'DEMO',
      province: plot.province,
      source: 'TMD_STATION',
    });
    expect(observations.getNearest).not.toHaveBeenCalled();
  });

  it('calls TMD when demo mode is disabled', async () => {
    const { service, tmd } = createService({ WEATHER_DEMO_MODE: 'false' });

    await expect(service.getForPlot(plot.id, true, 'user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(tmd.getHourly).toHaveBeenCalledWith(plot);
  });

  it('falls back to the nearest hourly forecast when station observations are unavailable', async () => {
    const { service, tmd, observations } = createService({ WEATHER_DEMO_MODE: 'false' });
    const forecastAt = new Date().toISOString();
    tmd.getHourly.mockResolvedValue([{
      plotId: plot.id,
      forecastAt,
      fetchedAt: forecastAt,
      temperatureC: 27.5,
      relativeHumidityPct: 82,
      rainMm: 1.2,
      windSpeedMs: 2.4,
      windDirectionDeg: 180,
      conditionCode: 5,
      source: 'TMD',
    }]);

    const observation = await service.getCurrent(plot.id, true, 'user-1');

    expect(observations.getNearest).toHaveBeenCalledWith(plot);
    expect(observation).toMatchObject({
      plotId: plot.id,
      stationId: 'TMD_FORECAST',
      stationName: 'แบบจำลองพยากรณ์ TMD (ข้อมูลสำรอง)',
      temperatureC: 27.5,
      rainfallMm: 1.2,
      source: 'TMD_FORECAST_FALLBACK',
    });
  });

  it('uses the same demo conditions for afternoon, night, and dry hours', () => {
    const { service } = createService();
    const conditions = service as unknown as {
      demoConditions(index: number, hour: number): Record<string, number>;
    };

    expect(conditions.demoConditions(4, 14)).toEqual({
      rainMm: 12, temperatureC: 34, relativeHumidityPct: 86, windSpeedMs: 4.2, conditionCode: 7,
    });
    expect(conditions.demoConditions(5, 14)).toEqual({
      rainMm: 3, temperatureC: 34, relativeHumidityPct: 86, windSpeedMs: 4.2, conditionCode: 5,
    });
    expect(conditions.demoConditions(1, 22)).toEqual({
      rainMm: 1, temperatureC: 25, relativeHumidityPct: 86, windSpeedMs: 2.1, conditionCode: 5,
    });
    expect(conditions.demoConditions(1, 9)).toEqual({
      rainMm: 0, temperatureC: 29, relativeHumidityPct: 68, windSpeedMs: 2.1, conditionCode: 1,
    });
  });

  it('reuses fresh forecasts and exposes in-memory history for the owner', async () => {
    const { service, tmd, plots } = createService();
    const first = await service.getForPlot(plot.id, true, 'user-1');

    expect(await service.getForPlot(plot.id, false, 'user-1')).toBe(first);
    expect(await service.forecastHistory(plot.id, 'user-1')).toBe(first);
    expect(plots.findOne).toHaveBeenCalledWith(plot.id, 'user-1');
    expect(tmd.getHourly).not.toHaveBeenCalled();
  });

  it('reuses fresh observations and exposes in-memory observation history', async () => {
    const { service, observations } = createService();
    expect(await service.observationHistory(plot.id, 'user-1')).toEqual([]);

    const first = await service.getCurrent(plot.id, true, 'user-1');
    expect(await service.getCurrent(plot.id, false, 'user-1')).toBe(first);
    expect(await service.observationHistory(plot.id, 'user-1')).toEqual([first]);
    expect(observations.getNearest).not.toHaveBeenCalled();
  });

  it('reads a fresh stored forecast before calling TMD', async () => {
    const { service, database, tmd } = createService({ WEATHER_DEMO_MODE: 'false' });
    database.enabled = true;
    const now = new Date().toISOString();
    database.query.mockResolvedValue([{ plot_id: plot.id, forecast_at: now, fetched_at: now,
      temperature_c: '28', relative_humidity_pct: null, rain_mm: '2', wind_speed_ms: null,
      wind_direction_deg: null, condition_code: '5' }]);

    const result = await service.getForPlot(plot.id, false, 'user-1');

    expect(result).toEqual([expect.objectContaining({
      plotId: plot.id, temperatureC: 28, rainMm: 2,
      relativeHumidityPct: undefined, conditionCode: 5,
    })]);
    expect(tmd.getHourly).not.toHaveBeenCalled();
  });

  it('stores refreshed forecasts and observations and reads their histories', async () => {
    const { service, database, tmd, observations } = createService({ WEATHER_DEMO_MODE: 'false' });
    database.enabled = true;
    const now = new Date().toISOString();
    const forecast = { plotId: plot.id, forecastAt: now, fetchedAt: now, temperatureC: 29,
      relativeHumidityPct: 80, rainMm: 1, windSpeedMs: 2, windDirectionDeg: 180,
      conditionCode: 5, source: 'TMD' };
    const observation = { plotId: plot.id, observedAt: now, fetchedAt: now, stationId: 'S1',
      stationName: 'Station', province: plot.province, stationDistanceKm: 2,
      temperatureC: 28, relativeHumidityPct: 81, rainfallMm: 1, windSpeedMs: 2,
      windDirectionDeg: 180, source: 'TMD_STATION' };
    tmd.getHourly.mockResolvedValue([forecast]);
    observations.getNearest.mockResolvedValue(observation);
    database.query.mockResolvedValue([]);

    expect(await service.getForPlot(plot.id, true, 'user-1')).toEqual([forecast]);
    expect(await service.getCurrent(plot.id, true, 'user-1')).toEqual(observation);
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO weather_forecasts'), expect.any(Array));
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO weather_forecast_history'), expect.any(Array));
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO weather_observations'), expect.any(Array));

    database.query.mockResolvedValueOnce([{ plot_id: plot.id, forecast_at: now, fetched_at: now,
      temperature_c: '29', relative_humidity_pct: '80', rain_mm: '1', wind_speed_ms: '2',
      wind_direction_deg: '180', condition_code: '5' }]);
    expect(await service.forecastHistory(plot.id, 'user-1')).toEqual([forecast]);

    database.query.mockResolvedValueOnce([{ plot_id: plot.id, observed_at: now, fetched_at: now,
      station_id: 'S1', station_name: 'Station', province: plot.province, station_distance_km: '2',
      temperature_c: '28', relative_humidity_pct: '81', rainfall_mm: '1', wind_speed_ms: '2',
      wind_direction_deg: '180', source: 'TMD_STATION' }]);
    expect(await service.observationHistory(plot.id, 'user-1')).toEqual([observation]);
  });

  it('keeps an older observation when the station API fails', async () => {
    const { service, database, observations } = createService({ WEATHER_DEMO_MODE: 'false' });
    database.enabled = true;
    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    database.query.mockResolvedValue([{ plot_id: plot.id, observed_at: old, fetched_at: old,
      station_id: 'S1', station_name: 'Station', province: plot.province, station_distance_km: 2,
      temperature_c: 27, source: 'TMD_STATION' }]);

    const result = await service.getCurrent(plot.id, false, 'user-1');

    expect(result).toMatchObject({ stationId: 'S1', temperatureC: 27 });
    expect(observations.getNearest).toHaveBeenCalledWith(plot);
  });

  it('refreshes active plots even when one TMD request fails', async () => {
    const { service, plots, tmd } = createService({ WEATHER_DEMO_MODE: 'false' });
    plots.findActive.mockResolvedValue([plot, { ...plot, id: 'plot-2' }]);
    plots.findOne.mockImplementation(async (id: string) => ({ ...plot, id }));
    tmd.getHourly.mockImplementation(async (item: Plot) => {
      if (item.id === plot.id) throw new ServiceUnavailableException();
      return [];
    });

    await expect(service.refreshActivePlots()).resolves.toBeUndefined();
    expect(tmd.getHourly).toHaveBeenCalledTimes(2);
    expect(plots.findOne).toHaveBeenCalledWith(plot.id, undefined);
    expect(plots.findOne).toHaveBeenCalledWith('plot-2', undefined);
  });
});
