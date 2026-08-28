import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../http/decorators/current-user.decorator';
import { AuthUser } from '../models/auth.types';
import { AnalysisService } from '../services/analysis.service';

@ApiTags('analysis')
@Controller('plots/:plotId/analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('run')
  run(@Param('plotId') plotId: string, @CurrentUser() user: AuthUser) {
    return this.analysis.run(plotId, user.id);
  }

  @Get()
  findByPlot(@Param('plotId') plotId: string, @CurrentUser() user: AuthUser) {
    return this.analysis.findByPlot(plotId, user.id);
  }

  @Get('history')
  history(@Param('plotId') plotId: string, @CurrentUser() user: AuthUser) { return this.analysis.history(plotId, user.id); }
}
