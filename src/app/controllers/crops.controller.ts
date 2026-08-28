import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CROP_PROFILES, GROWTH_STAGE_DAYS } from '../models/crop-catalog';

@ApiTags('crops')
@Controller('crops')
export class CropsController {
  @Get()
  findAll() {
    return Object.values(CROP_PROFILES).map(({ code, name, thresholds }) => ({ code, name, thresholds, growthStageDays: GROWTH_STAGE_DAYS[code] }));
  }
}
