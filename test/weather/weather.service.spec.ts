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
      tmd,
      observations,
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
});
