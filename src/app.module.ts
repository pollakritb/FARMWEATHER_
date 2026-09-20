import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './app/controllers/health.controller';
import { AnalysisModule } from './app/modules/analysis.module';
import { NotificationsModule } from './app/modules/notifications.module';
import { PlotsModule } from './app/modules/plots.module';
import { WeatherModule } from './app/modules/weather.module';
import { CropsModule } from './app/modules/crops.module';
import { DatabaseModule } from './app/modules/database.module';
import { AuthModule } from './app/modules/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    CropsModule,
    PlotsModule,
    WeatherModule,
    NotificationsModule,
    AnalysisModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
