import { ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { Plot } from '../../src/app/models/domain';
import { TmdClient } from '../../src/infrastructure/tmd/tmd-forecast.client';

describe('TmdClient', () => {
  const plot: Plot = {
    id: 'plot-1', name: 'North field', latitude: 14.02, longitude: 100.52,
    cropType: 'RICE', plantedAt: '2026-07-01', active: true, createdAt: '',
  };
  const forecast = {
    time: '2026-07-31T08:00:00+07:00',
    data: { tc: 31, rh: 72, rain: 2.5, ws10m: 3, wd10m: 180, cond: 4 },
  };

  const setup = (token?: string) => {
    const http = { get: jest.fn() };
    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'TMD_ACCESS_TOKEN' ? token : fallback),
    };
    return { client: new TmdClient(http as never, config as never), http };
  };

  it('requires an access token before making a request', async () => {
    const { client, http } = setup();
    await expect(client.getHourly(plot)).rejects.toThrow(ServiceUnavailableException);
    expect(http.get).not.toHaveBeenCalled();
  });

  it.each([
    { WeatherForecasts: [{ forecasts: [forecast] }] },
    { WeatherForcasts: [{ forecasts: [forecast] }] },
    { weather_forecast: { locations: [{ forecasts: [forecast] }] } },
  ])('normalizes forecasts from a supported response shape', async (body) => {
    const { client, http } = setup('test-token');
    http.get.mockReturnValue(of({ data: body }));

    const result = await client.getHourly(plot, 72);

    expect(http.get).toHaveBeenCalledWith(
      'https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at',
      expect.objectContaining({
        params: { lat: plot.latitude, lon: plot.longitude, duration: 48, fields: 'tc,rh,rain,ws10m,wd10m,cond' },
        headers: { authorization: 'Bearer test-token', accept: 'application/json' },
      }),
    );
    expect(result).toEqual([expect.objectContaining({
      plotId: plot.id, forecastAt: forecast.time, source: 'TMD',
      temperatureC: 31, relativeHumidityPct: 72, rainMm: 2.5,
      windSpeedMs: 3, windDirectionDeg: 180, conditionCode: 4,
      fetchedAt: expect.any(String),
    })]);
  });

  it.each([
    {},
    { WeatherForecasts: [] },
    { WeatherForecasts: [{}] },
  ])('returns no forecasts when the response has no forecast entries', async (body) => {
    const { client, http } = setup('test-token');
    http.get.mockReturnValue(of({ data: body }));
    await expect(client.getHourly(plot)).resolves.toEqual([]);
  });

  it('reports an upstream HTTP status without leaking the original error', async () => {
    const { client, http } = setup('test-token');
    http.get.mockReturnValue(throwError(() => ({ response: { status: 429 } })));
    await expect(client.getHourly(plot)).rejects.toThrow('TMD API request failed with status 429');
  });

  it('reports a connection failure when no HTTP status is available', async () => {
    const { client, http } = setup('test-token');
    http.get.mockReturnValue(throwError(() => new Error('network down')));
    await expect(client.getHourly(plot)).rejects.toThrow('Unable to connect to TMD API');
  });
});
