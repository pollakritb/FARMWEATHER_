import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TmdClient } from '../../infrastructure/tmd/tmd-forecast.client';
import { TmdObservationClient } from '../../infrastructure/tmd/tmd-observation.client';
import { WeatherController } from '../controllers/weather.controller';
import { WeatherService } from '../services/weather.service';
import { PlotsModule } from './plots.module';

@Module({
  imports: [
    PlotsModule,
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ timeout: config.get('TMD_TIMEOUT_MS', 10_000) }),
    }),
  ],
  controllers: [WeatherController],
  providers: [WeatherService, TmdClient, TmdObservationClient],
  exports: [WeatherService],
})
export class WeatherModule {}
