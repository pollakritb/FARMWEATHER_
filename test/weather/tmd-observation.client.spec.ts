import { of, throwError } from 'rxjs';
import { TmdObservationClient } from '../../src/infrastructure/tmd/tmd-observation.client';

describe('TmdObservationClient', () => {
  const plot = {
    id: 'plot-1', name: 'แปลง', latitude: 14.01, longitude: 100,
    cropType: 'RICE' as const, plantedAt: '2026-07-01', active: true, createdAt: '',
  };

  afterEach(() => jest.useRealTimers());

  it('selects the nearest valid station and normalizes units and Bangkok time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T07:00:00.000Z'));
    const xml = `<?xml version="1.0"?>
      <Weather3Hours><Stations>
        <Station><WmoStationNumber>far</WmoStationNumber><StationNameThai>สถานีไกล</StationNameThai><Province>กรุงเทพฯ</Province><Latitude>13.75</Latitude><Longitude>100.50</Longitude><Observation><DateTime>07/31/2026 13:00:00</DateTime><AirTemperature>30</AirTemperature><WindSpeed>7.2</WindSpeed></Observation></Station>
        <Station><WmoStationNumber>near</WmoStationNumber><StationNameThai>&#xE01;&#xE33;&#xE41;&#xE1E;&#xE07;&#xE41;&#xE2A;&#xE19;</StationNameThai><Province>&#xE19;&#xE04;&#xE23;&#xE1B;&#xE10;&#xE21;</Province><Latitude>14.00</Latitude><Longitude>99.99</Longitude><Observation><DateTime>07/31/2026 13:00:00</DateTime><AirTemperature>34.5</AirTemperature><RelativeHumidity>61</RelativeHumidity><Rainfall>0.00</Rainfall><WindSpeed>3.6</WindSpeed><WindDirection>180</WindDirection></Observation></Station>
      </Stations></Weather3Hours>`;
    const http = { get: jest.fn(() => of({ data: xml })) };
    const config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };
    const client = new TmdObservationClient(http as never, config as never);

    const result = await client.getNearest(plot);

    expect(result.stationId).toBe('near');
    expect(result.stationName).toBe('กำแพงแสน');
    expect(result.province).toBe('นครปฐม');
    expect(result.temperatureC).toBe(34.5);
    expect(result.windSpeedMs).toBe(1);
    expect(result.observedAt).toBe('2026-07-31T06:00:00.000Z');
    expect(result.stationDistanceKm).toBeLessThan(2);
  });

  it('accepts a single station and uses its English name when Thai is missing', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T07:00:00.000Z'));
    const xml = `<Weather3Hours><Stations><Station>
      <StationNameEnglish>Field &amp; Farm</StationNameEnglish><Latitude>14.01</Latitude><Longitude>100</Longitude>
      <Observation><DateTime>07/31/2026 13:00:00</DateTime><AirTemperature>0</AirTemperature></Observation>
      </Station></Stations></Weather3Hours>`;
    const http = { get: jest.fn(() => of({ data: xml })) };
    const config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };

    const result = await new TmdObservationClient(http as never, config as never).getNearest(plot);

    expect(result).toMatchObject({
      stationId: '', stationName: 'Field & Farm', temperatureC: 0,
      relativeHumidityPct: undefined, windSpeedMs: undefined,
    });
    expect(http.get).toHaveBeenCalledWith('https://data.tmd.go.th/api/Weather3Hours/V2/', {
      params: { uid: 'api', ukey: 'api12345' },
      headers: { accept: 'application/xml' }, responseType: 'text',
    });
  });

  it('ignores malformed, stale, and future observations', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T07:00:00.000Z'));
    const station = (id: string, latitude: string, date: string, temperature: string) =>
      `<Station><WmoStationNumber>${id}</WmoStationNumber><Latitude>${latitude}</Latitude><Longitude>100</Longitude><Observation><DateTime>${date}</DateTime><AirTemperature>${temperature}</AirTemperature></Observation></Station>`;
    const xml = `<Weather3Hours><Stations>${[
      station('bad-coordinate', 'n/a', '07/31/2026 13:00:00', '30'),
      station('bad-date', '14.01', 'invalid', '30'),
      station('bad-temperature', '14.01', '07/31/2026 13:00:00', 'n/a'),
      station('stale', '14.01', '07/30/2026 13:00:00', '30'),
      station('future', '14.01', '07/31/2026 15:00:00', '30'),
      station('valid', '14.02', '07/31/2026 13:00:00', '29'),
    ].join('')}</Stations></Weather3Hours>`;
    const http = { get: jest.fn(() => of({ data: xml })) };
    const config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };

    const result = await new TmdObservationClient(http as never, config as never).getNearest(plot);
    expect(result.stationId).toBe('valid');
  });

  it('reports missing valid stations as an unavailable upstream service', async () => {
    const http = { get: jest.fn(() => of({ data: '<Weather3Hours><Stations /></Weather3Hours>' })) };
    const config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };
    await expect(new TmdObservationClient(http as never, config as never).getNearest(plot))
      .rejects.toThrow('Unable to retrieve current observations from TMD');
  });

  it('hides transport errors behind a stable service error', async () => {
    const http = { get: jest.fn(() => throwError(() => new Error('connection reset'))) };
    const config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };
    await expect(new TmdObservationClient(http as never, config as never).getNearest(plot))
      .rejects.toThrow('Unable to retrieve current observations from TMD');
  });
});
