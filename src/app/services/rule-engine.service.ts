import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CROP_PROFILES, GROWTH_STAGE_DAYS } from '../models/crop-catalog';
import { AnalysisResult, GrowthStage, HourlyForecast, Plot, RiskLevel } from '../models/domain';

@Injectable()
export class RuleEngineService {
  evaluate(plot: Plot, forecast: HourlyForecast): AnalysisResult {
    const rules: string[] = [];
    const recommendations: string[] = [];
    const growthStage = this.growthStage(plot, forecast.forecastAt);
    const base = CROP_PROFILES[plot.cropType].thresholds;
    const factor = { SEEDLING: 0.85, VEGETATIVE: 1, REPRODUCTIVE: 0.9, MATURITY: 0.95 }[growthStage];
    const thresholds = {
      heavyRainMmPerHour: base.heavyRainMmPerHour * factor,
      highTemperatureC: base.highTemperatureC * (growthStage === 'REPRODUCTIVE' ? 0.95 : 1),
      lowHumidityPct: base.lowHumidityPct / factor,
      strongWindMs: base.strongWindMs * factor,
    };

    if ((forecast.rainMm ?? 0) >= thresholds.heavyRainMmPerHour) {
      rules.push('HEAVY_RAIN');
      recommendations.push('เลื่อนการฉีดพ่นและตรวจระบบระบายน้ำ');
    }
    if ((forecast.temperatureC ?? -Infinity) >= thresholds.highTemperatureC) {
      rules.push('HIGH_TEMPERATURE');
      recommendations.push('ตรวจความชื้นดินและหลีกเลี่ยงทำงานกลางแดด');
    }
    if ((forecast.relativeHumidityPct ?? Infinity) <= thresholds.lowHumidityPct) {
      rules.push('LOW_HUMIDITY');
      recommendations.push('ตรวจความต้องการน้ำของพืชก่อนเพิ่มการให้น้ำ');
    }
    if ((forecast.windSpeedMs ?? 0) >= thresholds.strongWindMs) {
      rules.push('STRONG_WIND');
      recommendations.push('งดฉีดพ่นและตรวจค้ำยันเพื่อป้องกันพืชล้ม');
    }

    const riskLevel: RiskLevel = rules.length >= 2 || rules.includes('HEAVY_RAIN') ? 'HIGH' : rules.length ? 'MEDIUM' : 'LOW';
    return {
      id: randomUUID(),
      plotId: plot.id,
      forecastAt: forecast.forecastAt,
      riskLevel,
      triggeredRules: rules,
      recommendations: recommendations.length ? recommendations : ['ยังไม่พบความเสี่ยงจากเกณฑ์เบื้องต้น'],
      growthStage,
      createdAt: new Date().toISOString(),
    };
  }

  private growthStage(plot: Plot, at: string): GrowthStage {
    const days = Math.max(0, Math.floor((new Date(at).getTime() - new Date(plot.plantedAt).getTime()) / 86_400_000));
    const [seedlingEnd, vegetativeEnd, reproductiveEnd] = GROWTH_STAGE_DAYS[plot.cropType];
    if (days <= seedlingEnd) return 'SEEDLING';
    if (days <= vegetativeEnd) return 'VEGETATIVE';
    if (days <= reproductiveEnd) return 'REPRODUCTIVE';
    return 'MATURITY';
  }
}
