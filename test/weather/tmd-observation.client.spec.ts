import { of } from 'rxjs';
import { TmdObservationClient } from '../../src/infrastructure/tmd/tmd-observation.client';

describe('TmdObservationClient', () => {
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

    const result = await client.getNearest({
      id: 'plot-1', name: 'แปลง', latitude: 14.01, longitude: 100,
      cropType: 'RICE', plantedAt: '2026-07-01', active: true, createdAt: '',
    });

    expect(result.stationId).toBe('near');
    expect(result.stationName).toBe('กำแพงแสน');
    expect(result.province).toBe('นครปฐม');
    expect(result.temperatureC).toBe(34.5);
    expect(result.windSpeedMs).toBe(1);
    expect(result.observedAt).toBe('2026-07-31T06:00:00.000Z');
    expect(result.stationDistanceKm).toBeLessThan(2);
    jest.useRealTimers();
  });
});
