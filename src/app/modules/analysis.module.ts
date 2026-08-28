import { Module } from '@nestjs/common';
import { AnalysisController } from '../controllers/analysis.controller';
import { AnalysisService } from '../services/analysis.service';
import { RuleEngineService } from '../services/rule-engine.service';
import { NotificationsModule } from './notifications.module';
import { PlotsModule } from './plots.module';
import { WeatherModule } from './weather.module';

@Module({
  imports: [PlotsModule, WeatherModule, NotificationsModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, RuleEngineService],
})
export class AnalysisModule {}
