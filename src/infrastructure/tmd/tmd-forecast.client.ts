import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { HourlyForecast, Plot } from '../../app/models/domain';

interface TmdForecastData {
  tc?: number;
  rh?: number;
  rain?: number;
  ws10m?: number;
  wd10m?: number;
  cond?: number;
}

interface TmdResponse {
  WeatherForecasts?: Array<{
    forecasts?: Array<{ time: string; data: TmdForecastData }>;
  }>;
  // Kept for compatibility with the misspelling in older TMD documentation.
  WeatherForcasts?: Array<{
    forecasts?: Array<{ time: string; data: TmdForecastData }>;
  }>;
  weather_forecast?: {
    locations?: Array<{
      forecasts?: Array<{ time: string; data: TmdForecastData }>;
    }>;
  };
}

@Injectable()
export class TmdClient {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getHourly(plot: Plot, duration = 25): Promise<HourlyForecast[]> {
    const token = this.config.get<string>('TMD_ACCESS_TOKEN');
    if (!token) {
      throw new ServiceUnavailableException(
        'TMD_ACCESS_TOKEN is required. Register at https://data.tmd.go.th/nwpapi/register',
      );
    }

    const baseUrl = this.config.get('TMD_BASE_URL', 'https://data.tmd.go.th/nwpapi/v1');
    try {
      const response = await firstValueFrom(
        this.http.get<TmdResponse>(`${baseUrl}/forecast/location/hourly/at`, {
          params: {
            lat: plot.latitude,
            lon: plot.longitude,
            duration: Math.min(duration, 48),
            fields: 'tc,rh,rain,ws10m,wd10m,cond',
          },
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        }),
      );
      const locations =
        response.data.WeatherForecasts ??
        response.data.WeatherForcasts ??
        response.data.weather_forecast?.locations ??
        [];
      const forecasts = locations[0]?.forecasts ?? [];
      return forecasts.map(({ time, data }) => this.normalize(plot.id, time, data, 'TMD'));
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      throw new ServiceUnavailableException(
        status
          ? `TMD API request failed with status ${status}`
          : 'Unable to connect to TMD API',
      );
    }
  }

  private normalize(
    plotId: string,
    forecastAt: string,
    data: TmdForecastData,
    source: 'TMD',
  ): HourlyForecast {
    return {
      plotId,
      forecastAt,
      fetchedAt: new Date().toISOString(),
      temperatureC: data.tc,
      relativeHumidityPct: data.rh,
      rainMm: data.rain,
      windSpeedMs: data.ws10m,
      windDirectionDeg: data.wd10m,
      conditionCode: data.cond,
      source,
    };
  }

}
