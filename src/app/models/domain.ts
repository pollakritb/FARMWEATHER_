import { CropType } from './crop-catalog';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type UserRole = 'FARMER' | 'ADMIN';
export type GrowthStage = 'SEEDLING' | 'VEGETATIVE' | 'REPRODUCTIVE' | 'MATURITY';

export interface Plot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  province?: string;
  cropType: CropType;
  plantedAt: string;
  active: boolean;
  createdAt: string;
}

export interface HourlyForecast {
  plotId: string;
  forecastAt: string;
  fetchedAt: string;
  temperatureC?: number;
  relativeHumidityPct?: number;
  rainMm?: number;
  windSpeedMs?: number;
  windDirectionDeg?: number;
  conditionCode?: number;
  source: 'TMD';
}

export interface CurrentWeatherObservation {
  plotId: string;
  observedAt: string;
  fetchedAt: string;
  stationId: string;
  stationName: string;
  province: string;
  stationDistanceKm: number;
  temperatureC?: number;
  relativeHumidityPct?: number;
  rainfallMm?: number;
  windSpeedMs?: number;
  windDirectionDeg?: number;
  source: 'TMD_STATION' | 'TMD_FORECAST_FALLBACK';
}

export interface AnalysisResult {
  id: string;
  plotId: string;
  forecastAt: string;
  riskLevel: RiskLevel;
  triggeredRules: string[];
  recommendations: string[];
  growthStage: GrowthStage;
  createdAt: string;
}

export interface Notification {
  id: string;
  plotId: string;
  analysisId: string;
  severity: RiskLevel;
  title: string;
  message: string;
  status: 'PENDING' | 'READ';
  createdAt: string;
  readAt?: string;
}
