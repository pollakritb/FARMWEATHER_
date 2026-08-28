import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AnalysisResult, GrowthStage, RiskLevel } from '../models/domain';
import { NotificationsService } from './notifications.service';
import { PlotsService } from './plots.service';
import { WeatherService } from './weather.service';
import { RuleEngineService } from './rule-engine.service';

@Injectable()
export class AnalysisService {
  private readonly results = new Map<string, AnalysisResult[]>();

  constructor(
    private readonly plots: PlotsService,
    private readonly weather: WeatherService,
    private readonly rules: RuleEngineService,
    private readonly notifications: NotificationsService,
    private readonly database: DatabaseService,
  ) {}

  async run(plotId: string, ownerId?: string): Promise<AnalysisResult[]> {
    const plot = await this.plots.findOne(plotId, ownerId);
    const forecasts = await this.weather.getForPlot(plotId, false, ownerId);
    const results = forecasts.map((forecast) => this.rules.evaluate(plot, forecast));
    const runAt = new Date().toISOString();
    results.forEach((result) => { result.createdAt = runAt; });
    await this.save(results);
    await Promise.all(results.map((result) => this.notifications.createIfNeeded(result)));
    this.results.set(plotId, results);
    return results;
  }

  async findByPlot(plotId: string, ownerId?: string): Promise<AnalysisResult[]> {
    await this.plots.findOne(plotId, ownerId);
    if (this.database.enabled) {
      const rows = await this.database.query<{id:string;plot_id:string;forecast_at:string|Date;risk_level:RiskLevel;growth_stage:GrowthStage;triggered_rules:string[];recommendations:string[];created_at:string|Date}>(
        `SELECT * FROM analysis_results WHERE plot_id=$1 AND created_at=(SELECT max(created_at) FROM analysis_results WHERE plot_id=$1) ORDER BY forecast_at`, [plotId],
      );
      return rows.map((r) => ({ id:r.id,plotId:r.plot_id,forecastAt:new Date(r.forecast_at).toISOString(),riskLevel:r.risk_level,growthStage:r.growth_stage,triggeredRules:r.triggered_rules,recommendations:r.recommendations,createdAt:new Date(r.created_at).toISOString() }));
    }
    return this.results.get(plotId) ?? [];
  }

  async history(plotId: string, ownerId: string): Promise<AnalysisResult[]> {
    await this.plots.findOne(plotId, ownerId);
    if (!this.database.enabled) return this.results.get(plotId) ?? [];
    const rows = await this.database.query<{id:string;plot_id:string;forecast_at:string|Date;risk_level:RiskLevel;growth_stage:GrowthStage;triggered_rules:string[];recommendations:string[];created_at:string|Date}>('SELECT * FROM analysis_results WHERE plot_id=$1 ORDER BY created_at DESC, forecast_at LIMIT 500',[plotId]);
    return rows.map((r) => ({ id:r.id,plotId:r.plot_id,forecastAt:new Date(r.forecast_at).toISOString(),riskLevel:r.risk_level,growthStage:r.growth_stage,triggeredRules:r.triggered_rules,recommendations:r.recommendations,createdAt:new Date(r.created_at).toISOString() }));
  }

  private async save(results: AnalysisResult[]) {
    if (!this.database.enabled) return;
    for (const r of results) await this.database.query('INSERT INTO analysis_results VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[r.id,r.plotId,r.forecastAt,r.riskLevel,r.growthStage,JSON.stringify(r.triggeredRules),JSON.stringify(r.recommendations),r.createdAt]);
  }
}
