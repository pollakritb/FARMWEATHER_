import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../http/decorators/current-user.decorator';
import { AuthUser } from '../models/auth.types';
import { WeatherService } from '../services/weather.service';

@ApiTags('weather')
@Controller('plots/:plotId/weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Get('hourly')
  getHourly(@Param('plotId') plotId: string, @CurrentUser() user: AuthUser) {
    return this.weather.getForPlot(plotId, false, user.id);
  }

  @Get('current')
  getCurrent(@Param('plotId') plotId: string, @CurrentUser() user: AuthUser) {
    return this.weather.getCurrent(plotId, false, user.id);
  }

  @Post('current/refresh')
  refreshCurrent(@Param('plotId') plotId: string, @CurrentUser() user: AuthUser) {
    return this.weather.getCurrent(plotId, true, user.id);
  }

  @Post('refresh')
  refresh(@Param('plotId') plotId: string, @CurrentUser() user: AuthUser) {
    return this.weather.getForPlot(plotId, true, user.id);
  }

  @Get('history/hourly')
  history(@Param('plotId') plotId: string, @CurrentUser() user: AuthUser) { return this.weather.forecastHistory(plotId, user.id); }

  @Get('history/observations')
  observationHistory(@Param('plotId') plotId: string, @CurrentUser() user: AuthUser) { return this.weather.observationHistory(plotId, user.id); }
}
