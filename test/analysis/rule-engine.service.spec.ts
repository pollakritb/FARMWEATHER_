import { HourlyForecast, Plot } from '../../src/app/models/domain';
import { RuleEngineService } from '../../src/app/services/rule-engine.service';

describe('RuleEngineService', () => {
  const service = new RuleEngineService();
  const plot = { id: 'plot-1', cropType: 'RICE' } as Plot;

  it('marks heavy rain as high risk', () => {
    const forecast = { plotId: plot.id, forecastAt: new Date().toISOString(), rainMm: 12 } as HourlyForecast;
    const result = service.evaluate(plot, forecast);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.triggeredRules).toContain('HEAVY_RAIN');
  });

  it('returns low risk when no threshold is exceeded', () => {
    const forecast = { plotId: plot.id, forecastAt: new Date().toISOString(), rainMm: 0, temperatureC: 30, relativeHumidityPct: 60, windSpeedMs: 2 } as HourlyForecast;
    expect(service.evaluate(plot, forecast).riskLevel).toBe('LOW');
  });

  it('uses different thresholds for each crop', () => {
    const forecast = { plotId: plot.id, forecastAt: new Date().toISOString(), rainMm: 9 } as HourlyForecast;
    expect(service.evaluate({ ...plot, cropType: 'RICE' }, forecast).riskLevel).toBe('LOW');
    expect(service.evaluate({ ...plot, cropType: 'DURIAN' }, forecast).triggeredRules).toContain('HEAVY_RAIN');
  });

  it('derives the growth stage from crop type and planting date', () => {
    const stagedPlot = { ...plot, plantedAt: '2026-01-01' };
    const forecast = { plotId: plot.id, forecastAt: '2026-01-15T00:00:00.000Z', rainMm: 0 } as HourlyForecast;
    expect(service.evaluate(stagedPlot, forecast).growthStage).toBe('SEEDLING');
    expect(service.evaluate(stagedPlot, { ...forecast, forecastAt: '2026-03-01T00:00:00.000Z' }).growthStage).toBe('VEGETATIVE');
  });
});
