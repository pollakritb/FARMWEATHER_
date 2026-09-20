import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLParser } from 'fast-xml-parser';
import { firstValueFrom } from 'rxjs';
import { CurrentWeatherObservation, Plot } from '../../app/models/domain';

interface TmdStation {
  WmoStationNumber?: string | number;
  StationNameThai?: string;
  StationNameEnglish?: string;
  Province?: string;
  Latitude?: string | number;
  Longitude?: string | number;
  Observation?: {
    DateTime?: string;
    AirTemperature?: string | number;
    RelativeHumidity?: string | number;
    Rainfall?: string | number;
    WindSpeed?: string | number;
    WindDirection?: string | number;
  };
}

@Injectable()
export class TmdObservationClient {
  private readonly parser = new XMLParser({ ignoreAttributes: true, trimValues: true });

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getNearest(plot: Plot): Promise<CurrentWeatherObservation> {
    const url = this.config.get(
      'TMD_OBSERVATION_URL',
      'https://data.tmd.go.th/api/Weather3Hours/V2/',
    );
    const uid = this.config.get('TMD_OBSERVATION_UID', 'api');
    const ukey = this.config.get('TMD_OBSERVATION_UKEY', 'api12345');

    try {
      const response = await firstValueFrom(
        this.http.get<string>(url, {
          params: { uid, ukey },
          headers: { accept: 'application/xml' },
          responseType: 'text',
        }),
      );
      const parsed = this.parser.parse(response.data) as {
        Weather3Hours?: { Stations?: { Station?: TmdStation | TmdStation[] } };
      };
      const raw = parsed.Weather3Hours?.Stations?.Station;
      const stationList = this.stationList(raw);
      const stations = stationList
        .map((station) => this.toCandidate(station, plot))
        .filter((item): item is CurrentWeatherObservation => item !== undefined)
        .filter((item) => this.isRecent(item.observedAt))
        .sort((a, b) => a.stationDistanceKm - b.stationDistanceKm);

      if (!stations.length) throw new Error('TMD returned no valid station observations');
      return stations[0];
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Unable to retrieve current observations from TMD');
    }
  }

  private stationList(raw?: TmdStation | TmdStation[]): TmdStation[] {
    if (Array.isArray(raw)) return raw;
    if (raw) return [raw];
    return [];
  }

  private toCandidate(
    station: TmdStation,
    plot: Plot,
  ): CurrentWeatherObservation | undefined {
    const latitude = this.number(station.Latitude);
    const longitude = this.number(station.Longitude);
    const observedAt = this.parseTmdDate(station.Observation?.DateTime);
    const temperatureC = this.number(station.Observation?.AirTemperature);
    if (latitude === undefined || longitude === undefined || !observedAt || temperatureC === undefined) return undefined;

    return {
      plotId: plot.id,
      observedAt,
      fetchedAt: new Date().toISOString(),
      stationId: String(station.WmoStationNumber ?? ''),
      stationName: this.decodeXmlText(station.StationNameThai || station.StationNameEnglish || 'ไม่ทราบชื่อสถานี'),
      province: this.decodeXmlText(station.Province || ''),
      stationDistanceKm: Math.round(this.distanceKm(plot.latitude, plot.longitude, latitude, longitude) * 10) / 10,
      temperatureC,
      relativeHumidityPct: this.number(station.Observation?.RelativeHumidity),
      rainfallMm: this.number(station.Observation?.Rainfall),
      windSpeedMs: this.kmhToMs(station.Observation?.WindSpeed),
      windDirectionDeg: this.number(station.Observation?.WindDirection),
      source: 'TMD_STATION',
    };
  }

  private parseTmdDate(value?: string): string | undefined {
    const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return undefined;
    const [, month, day, year, hour, minute, second] = match;
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private number(value?: string | number): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private kmhToMs(value?: string | number): number | undefined {
    const kmh = this.number(value);
    if (kmh === undefined) return undefined;
    return Math.round((kmh / 3.6) * 10) / 10;
  }

  private decodeXmlText(value: string): string {
    return value.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (match, hex, decimal, named) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[String(named).toLowerCase()] ?? match;
    });
  }

  private isRecent(observedAt: string): boolean {
    const maximumAgeHours = this.config.get<number>('OBSERVATION_MAX_AGE_HOURS', 6);
    const ageMs = Date.now() - new Date(observedAt).getTime();
    return ageMs >= 0 && ageMs <= maximumAgeHours * 60 * 60_000;
  }

  private distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
