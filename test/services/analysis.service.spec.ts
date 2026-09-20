import { AnalysisService } from '../../src/app/services/analysis.service';
import { Plot } from '../../src/app/models/domain';

describe('AnalysisService', () => {
  const plot = { id: 'plot-1', cropType: 'RICE' } as Plot;

  it('evaluates forecasts, persists the run in memory, and creates notifications', async () => {
    const plots = { findOne: jest.fn().mockResolvedValue(plot) };
    const weather = { getForPlot: jest.fn().mockResolvedValue([{ forecastAt: '2026-09-01T00:00:00.000Z' }]) };
    const rules = { evaluate: jest.fn().mockReturnValue({ id: 'analysis-1', plotId: plot.id, riskLevel: 'HIGH', growthStage: 'SEEDLING', triggeredRules: ['HEAVY_RAIN'], recommendations: ['Drain water'], forecastAt: '2026-09-01T00:00:00.000Z', createdAt: '' }) };
    const notifications = { createIfNeeded: jest.fn().mockResolvedValue(undefined) };
    const database = { enabled: false, query: jest.fn() };
    const service = new AnalysisService(plots as never, weather as never, rules as never, notifications as never, database as never);

    const results = await service.run(plot.id, 'owner-1');
    expect(results[0]).toMatchObject({ id: 'analysis-1', createdAt: expect.any(String) });
    expect(notifications.createIfNeeded).toHaveBeenCalledWith(results[0]);
    await expect(service.findByPlot(plot.id, 'owner-1')).resolves.toEqual(results);
    await expect(service.history(plot.id, 'owner-1')).resolves.toEqual(results);
  });

  it('normalizes results returned by database history queries', async () => {
    const plots = { findOne: jest.fn().mockResolvedValue(plot) };
    const row = { id: 'analysis-1', plot_id: plot.id, forecast_at: '2026-09-01T00:00:00.000Z', risk_level: 'MEDIUM', growth_stage: 'VEGETATIVE', triggered_rules: ['HIGH_TEMPERATURE'], recommendations: ['Water'], created_at: '2026-09-01T01:00:00.000Z' };
    const database = { enabled: true, query: jest.fn().mockResolvedValue([row]) };
    const service = new AnalysisService(plots as never, {} as never, {} as never, {} as never, database as never);

    await expect(service.findByPlot(plot.id, 'owner-1')).resolves.toEqual([expect.objectContaining({ plotId: plot.id, riskLevel: 'MEDIUM' })]);
    await expect(service.history(plot.id, 'owner-1')).resolves.toEqual([expect.objectContaining({ growthStage: 'VEGETATIVE' })]);
  });
});
